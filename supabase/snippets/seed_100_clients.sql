-- ─────────────────────────────────────────────────────────────────────────
-- Seed TEMPORAL: 100 clientes en gimnasio-premium (solo para probar la paginación).
--
--  · Se BORRAN con `supabase db reset` (que re-corre el seed limpio).
--  · Los clientes llevan el prefijo `tmp_pgtest_` para poder borrarlos a mano
--    con el DELETE del final (sin reset).
--  · auth_user_id = NULL: estos clientes NO pueden loguearse (no hace falta para
--    ver la lista del coach); solo existen como filas para llenar la tabla.
--
-- Cómo correrlo (BD local, con supabase start levantado):
--   psql "postgresql://postgres:postgres@localhost:54322/postgres" -f supabase/snippets/seed_100_clients.sql
-- ─────────────────────────────────────────────────────────────────────────

do $$
declare
  org_prem uuid := (select id from public.organizations where slug = 'gimnasio-premium');
  i int;
begin
  if org_prem is null then
    raise notice 'No existe la org gimnasio-premium (¿corriste el seed?).';
    return;
  end if;

  for i in 1..100 loop
    insert into public.users (
      id, username, password, name, role, email, dob, height,
      plan_type, plan_modality, plan_start_date, plan_end_date, plan_status,
      organization_id, auth_user_id, reminder_enabled
    ) values (
      'tmp_pgtest_' || i,
      'tmp_pgtest_' || i,
      'x',
      'Test Paginación ' || lpad(i::text, 3, '0'),
      'user',
      'tmp_pgtest_' || i || '@test.local',
      '1995-05-20', '175',
      'Mensual', 'Presencial', current_date - 15, current_date + 15, 'active',
      org_prem, null, true
    ) on conflict (id) do nothing;
  end loop;

  raise notice 'OK: 100 clientes tmp_pgtest_ agregados a gimnasio-premium.';
end $$;

-- ── Limpieza manual (sin reset): descomentar y correr para quitarlos ──
-- delete from public.users where id like 'tmp_pgtest_%';
