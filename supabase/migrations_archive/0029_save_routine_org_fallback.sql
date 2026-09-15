-- ═══════════════════════════════════════════════════════════════
--  0029 — Fix: guardar rutina SIN cliente asignado.
--  save_routine (0006) tomaba la organización SOLO del cliente asignado. Si se
--  crea/edita una rutina sin cliente (v_user_id NULL), organization_id quedaba
--  NULL y RLS (can_write_org) rechazaba el insert → "Hubo un problema al guardar".
--  Este fix agrega un fallback: si no hay cliente, usa la organización del
--  ENTRENADOR autenticado (owner/trainer), igual que el trigger 0024 para users.
--  Redefine la función (create or replace). Aditiva e idempotente.
--  NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.save_routine(p jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_routine_id text := p->>'id';
  v_user_id    text := nullif(p->>'user_id','');
  v_org        uuid;
  d jsonb; g jsonb; e jsonb;
  d_id text; g_id text;
  di int := 0; gi int := 0; ei int := 0;
begin
  if v_routine_id is null then
    raise exception 'save_routine: falta id de rutina';
  end if;

  -- Organización de la rutina: la del cliente asignado (si hay).
  if v_user_id is not null then
    select organization_id into v_org from public.users where id = v_user_id;
  end if;

  -- Fallback: rutina sin cliente asignado → organización del entrenador autenticado.
  -- Evita organization_id NULL (que RLS rechaza) al crear una rutina "plantilla".
  if v_org is null then
    select m.organization_id into v_org
    from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','trainer')
    order by m.created_at
    limit 1;
  end if;

  -- 1) Upsert de la cabecera de la rutina
  insert into public.routines
    (id, user_id, title, days_per_week, note, warmup_stretch_ids, cooldown_stretch_ids,
     organization_id, created_at, updated_at)
  values
    (v_routine_id, v_user_id, p->>'title', coalesce((p->>'days_per_week')::int, 0),
     nullif(p->>'note',''),
     coalesce(p->'warmup_stretch_ids','[]'::jsonb),
     coalesce(p->'cooldown_stretch_ids','[]'::jsonb),
     v_org, coalesce((p->>'created_at')::timestamptz, now()), now())
  on conflict (id) do update set
    user_id              = excluded.user_id,
    title                = excluded.title,
    days_per_week        = excluded.days_per_week,
    note                 = excluded.note,
    warmup_stretch_ids   = excluded.warmup_stretch_ids,
    cooldown_stretch_ids = excluded.cooldown_stretch_ids,
    organization_id      = coalesce(excluded.organization_id, public.routines.organization_id),
    updated_at           = now();

  -- 2) Reemplazar días (cascade borra grupos y ejercicios) — dentro de la misma tx
  delete from public.routine_days where routine_id = v_routine_id;

  -- 3) Reinsertar toda la estructura anidada
  di := 0;
  for d in select value from jsonb_array_elements(coalesce(p->'days','[]'::jsonb)) as t(value) loop
    d_id := d->>'id';
    insert into public.routine_days (id, routine_id, label, sort_order, organization_id)
    values (d_id, v_routine_id, d->>'label', di, v_org);

    gi := 0;
    for g in select value from jsonb_array_elements(coalesce(d->'groups','[]'::jsonb)) as t(value) loop
      g_id := g->>'id';
      insert into public.routine_groups (id, day_id, label, rest_seconds, sort_order, organization_id)
      values (g_id, d_id, g->>'label', coalesce((g->>'rest_seconds')::int, 60), gi, v_org);

      ei := 0;
      for e in select value from jsonb_array_elements(coalesce(g->'exercises','[]'::jsonb)) as t(value) loop
        insert into public.routine_exercises
          (id, group_id, exercise_id, series, reps, notes, weight_amount, weight_unit,
           equipment, surface, sort_order, organization_id)
        values
          ('rex_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8),
           g_id, e->>'exercise_id', coalesce((e->>'series')::int, 3), e->>'reps',
           nullif(e->>'notes',''), nullif(e->>'weight_amount',''),
           coalesce(e->>'weight_unit','lbs'), nullif(e->>'equipment',''),
           nullif(e->>'surface',''), ei, v_org);
        ei := ei + 1;
      end loop;
      gi := gi + 1;
    end loop;
    di := di + 1;
  end loop;
end $$;

revoke all on function public.save_routine(jsonb) from public;
grant execute on function public.save_routine(jsonb) to anon, authenticated;
