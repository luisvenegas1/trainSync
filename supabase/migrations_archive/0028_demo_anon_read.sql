-- ═══════════════════════════════════════════════════════════════
--  0028 — Lectura ANÓNIMA solo del tenant demo (titotrainer).
--  Permite que la app de demostración se muestre SIN login, en modo solo lectura.
--  Seguridad: las políticas aplican únicamente al rol `anon` (sin sesión) y SOLO
--  a filas de la organización demo (tenant_type='demo'). No afectan a ningún
--  tenant real ni a usuarios autenticados (esos usan el rol `authenticated`).
--  Solo SELECT: la demo nunca escribe. Aditiva e idempotente.
--  NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  demo_id uuid := (select id from public.organizations where slug = 'titotrainer' and tenant_type = 'demo');
  t text;
  -- Tablas con columna organization_id que la demo necesita leer.
  tbls text[] := array[
    'users','exercises','routines','routine_days','routine_groups','routine_exercises',
    'routine_assignments','measurements','payments','workout_sessions','workout_logs',
    'catalogs','organization_settings','organization_subscriptions'
  ];
begin
  if demo_id is null then
    raise notice 'No existe la org demo (titotrainer). Corré primero el seed de la demo.';
    return;
  end if;

  -- 1) Tablas con organization_id: SELECT anónimo acotado a la org demo.
  foreach t in array tbls loop
    execute format('drop policy if exists demo_anon_read on public.%I', t);
    execute format(
      'create policy demo_anon_read on public.%I for select to anon using (organization_id = %L)',
      t, demo_id
    );
  end loop;

  -- 2) La tabla organizations no tiene organization_id: se acota por slug/tipo.
  drop policy if exists demo_anon_read_org on public.organizations;
  create policy demo_anon_read_org on public.organizations
    for select to anon using (slug = 'titotrainer' and tenant_type = 'demo');
end $$;
