-- ═══════════════════════════════════════════════════════════════
--  0032 — Calentamiento por IMAGEN (opcional, por rutina).
--  Cada rutina puede mostrar el calentamiento como los ejercicios de siempre
--  (warmup_mode='exercises', por defecto) o como una IMAGEN subida por el coach
--  (warmup_mode='image' + warmup_image_url). No se quita nada: es una opción.
--  Incluye: columnas nuevas, bucket 'routine-images' (lectura pública, escritura
--  del staff de la org o superadmin) y redefinición de save_routine para persistir
--  los campos nuevos. Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- 1) Columnas nuevas en routines.
alter table public.routines
  add column if not exists warmup_mode      text not null default 'exercises'; -- 'exercises' | 'image'
alter table public.routines
  add column if not exists warmup_image_url text;

-- 2) Bucket para imágenes de calentamiento (público para lectura por URL).
insert into storage.buckets (id, name, public) values
  ('routine-images','routine-images', true)
on conflict (id) do nothing;

-- Ruta: <organization_id>/<routine_id>/<archivo>. Lectura pública; escritura del
-- staff de la org (owner/trainer) o superadmin (que edita desde el panel).
drop policy if exists routineimages_read on storage.objects;
create policy routineimages_read on storage.objects for select
  using (bucket_id = 'routine-images');
drop policy if exists routineimages_write on storage.objects;
create policy routineimages_write on storage.objects for all to authenticated
  using (bucket_id = 'routine-images'
         and (public.is_superadmin()
              or public.can_write_org(((storage.foldername(name))[1])::uuid)))
  with check (bucket_id = 'routine-images'
         and (public.is_superadmin()
              or public.can_write_org(((storage.foldername(name))[1])::uuid)));

-- 3) Redefinir save_routine para persistir warmup_mode + warmup_image_url.
--    (Mantiene el fix de 0031: stretch_ids como text[], y el fallback de org de 0029.)
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

  if v_user_id is not null then
    select organization_id into v_org from public.users where id = v_user_id;
  end if;
  if v_org is null then
    select m.organization_id into v_org
    from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','trainer')
    order by m.created_at
    limit 1;
  end if;

  insert into public.routines
    (id, user_id, title, days_per_week, note, warmup_stretch_ids, cooldown_stretch_ids,
     warmup_mode, warmup_image_url, organization_id, created_at, updated_at)
  values
    (v_routine_id, v_user_id, p->>'title', coalesce((p->>'days_per_week')::int, 0),
     nullif(p->>'note',''),
     coalesce((select array_agg(x) from jsonb_array_elements_text(p->'warmup_stretch_ids') as t(x)), '{}'::text[]),
     coalesce((select array_agg(x) from jsonb_array_elements_text(p->'cooldown_stretch_ids') as t(x)), '{}'::text[]),
     coalesce(nullif(p->>'warmup_mode',''), 'exercises'),
     nullif(p->>'warmup_image_url',''),
     v_org, coalesce((p->>'created_at')::timestamptz, now()), now())
  on conflict (id) do update set
    user_id              = excluded.user_id,
    title                = excluded.title,
    days_per_week        = excluded.days_per_week,
    note                 = excluded.note,
    warmup_stretch_ids   = excluded.warmup_stretch_ids,
    cooldown_stretch_ids = excluded.cooldown_stretch_ids,
    warmup_mode          = excluded.warmup_mode,
    warmup_image_url     = excluded.warmup_image_url,
    organization_id      = coalesce(excluded.organization_id, public.routines.organization_id),
    updated_at           = now();

  delete from public.routine_days where routine_id = v_routine_id;

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
