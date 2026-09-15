-- ═══════════════════════════════════════════════════════════════
--  SEED de datos de PRUEBA para desarrollo LOCAL.
--  Lo corre `supabase db reset` automáticamente (después del baseline).
--  NO usar en producción. Todas las cuentas usan la contraseña: password123
--
--  Contenido:
--   • 1 SUPERADMIN dedicado: super@test.local (entra a /platform, no es de ninguna org)
--   • 5 organizaciones (cada plan + extras):
--       gimnasio-premium (premium) · gimnasio-pro (pro) · gimnasio-base (base)
--       fit-studio (premium) · power-house (pro)
--   • Por org: 2 coaches (coach1=owner, coach2=trainer) + 5 clientes
--   • El cliente1 de cada org trae historial (mediciones + entrenos con progreso de peso)
--
--  Emails: coachN-<slug>@test.local / clienteN-<slug>@test.local   (N = número)
--  Ver la tabla completa de credenciales en docs/credenciales-local.csv
-- ═══════════════════════════════════════════════════════════════

-- Helper temporal: crea una cuenta de Auth (email+password) confirmada + identidad.
create or replace function public._seed_auth_user(p_id uuid, p_email text, p_name text, p_pw text)
returns void language plpgsql as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated',
    p_email, p_pw, now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p_name),
    '', '', '', ''
  ) on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), p_id, p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email),
    'email', now(), now(), now()
  ) on conflict do nothing;
end $$;

do $$
declare
  pw text := extensions.crypt('password123', extensions.gen_salt('bf'));
  orgs jsonb := '[
    {"slug":"gimnasio-premium","name":"Gimnasio Premium","plan":"premium"},
    {"slug":"gimnasio-pro","name":"Gimnasio Pro","plan":"pro"},
    {"slug":"gimnasio-base","name":"Gimnasio Base","plan":"base"},
    {"slug":"fit-studio","name":"Fit Studio","plan":"premium"},
    {"slug":"power-house","name":"Power House","plan":"pro"}
  ]'::jsonb;
  o jsonb; org_id uuid; auth_id uuid; i int;
  cuid text; email_txt text; name_txt text;
  sd int; press int; squat int;
begin
  -- Superadmin dedicado (no pertenece a ninguna org).
  perform public._seed_auth_user('a5a5a5a5-5555-4555-8555-555555555555', 'super@test.local', 'Superadmin', pw);
  insert into public.profiles (id, full_name) values ('a5a5a5a5-5555-4555-8555-555555555555', 'Superadmin') on conflict do nothing;
  insert into public.platform_admins (user_id) values ('a5a5a5a5-5555-4555-8555-555555555555') on conflict do nothing;

  for o in select * from jsonb_array_elements(orgs) loop
    org_id := gen_random_uuid();
    insert into public.organizations (id, name, slug, tenant_type, status)
      values (org_id, o->>'name', o->>'slug', 'production', 'active');
    insert into public.organization_subscriptions (organization_id, plan, status, started_at)
      values (org_id, o->>'plan', 'active', now());
    insert into public.organization_settings (organization_id, display_name)
      values (org_id, o->>'name');

    -- 2 coaches: coach1 = owner, coach2 = trainer
    for i in 1..2 loop
      auth_id := gen_random_uuid();
      email_txt := 'coach' || i || '-' || (o->>'slug') || '@test.local';
      name_txt := 'Coach ' || i || ' ' || (o->>'name');
      perform public._seed_auth_user(auth_id, email_txt, name_txt, pw);
      insert into public.profiles (id, full_name) values (auth_id, name_txt) on conflict do nothing;
      insert into public.organization_members (organization_id, user_id, role)
        values (org_id, auth_id, case when i = 1 then 'owner' else 'trainer' end);
    end loop;

    -- 5 clientes
    for i in 1..5 loop
      auth_id := gen_random_uuid();
      cuid := 'client_' || replace(o->>'slug','-','_') || '_' || i;
      email_txt := 'cliente' || i || '-' || (o->>'slug') || '@test.local';
      name_txt := 'Cliente ' || i || ' ' || (o->>'name');
      perform public._seed_auth_user(auth_id, email_txt, name_txt, pw);
      insert into public.profiles (id, full_name) values (auth_id, name_txt) on conflict do nothing;
      insert into public.users (
        id, username, password, name, role, email, dob, height,
        plan_type, plan_modality, plan_start_date, plan_end_date, plan_status,
        organization_id, auth_user_id, reminder_enabled
      ) values (
        cuid, 'user_' || cuid, 'x', name_txt, 'user', email_txt, '1995-05-20', '175',
        'Mensual', 'Presencial', current_date - 15, current_date + 15, 'active',
        org_id, auth_id, true
      );

      -- Historial SOLO para el cliente1 de cada org (para pruebas de transferencia/medallas)
      if i = 1 then
        insert into public.measurements (id, client_id, date, weight, fat, muscle_mass, organization_id) values
          (cuid || '_m1', cuid, current_date - 21, '82.0', '22.0', '35.0', org_id),
          (cuid || '_m2', cuid, current_date - 7,  '80.5', '20.5', '36.0', org_id);
        insert into public.payments (id, client_id, date, end_date, amount, period, organization_id) values
          (cuid || '_p1', cuid, current_date - 15, current_date + 15, '30000', 'Mensual', org_id);
        -- 6 entrenos en ~3 semanas, con press y sentadilla SUBIENDO. Los 2 primeros
        -- caen ANTES de la ventana de 14 días (referencia) y los últimos dentro de
        -- ella (más peso) → progresión detectable. Los logs llevan exercise_id para
        -- que weightProgress y la precarga del último peso funcionen.
        for sd in 1..6 loop
          press := 100 + (sd - 1) * 3;   -- 100,103,106,109,112,115
          squat := 150 + (sd - 1) * 4;   -- 150,154,158,162,166,170
          insert into public.workout_sessions (id, user_id, day_label, started_at, finished_at, status, organization_id)
            values (cuid || '_ws' || sd, cuid, 'Día A',
                    now() - ((22 - sd*3) || ' days')::interval,   -- 19,16,13,10,7,4 días atrás
                    now() - ((22 - sd*3) || ' days')::interval + interval '50 min',
                    'completed', org_id);
          insert into public.workout_logs (id, session_id, exercise_id, exercise_name, series, reps, actual_weight, weight_unit, sort_order, organization_id) values
            (cuid || '_ws' || sd || '_l1', cuid || '_ws' || sd, 'gex_press', 'Press de banca', '4', '10', press::text, 'lbs', 0, org_id),
            (cuid || '_ws' || sd || '_l2', cuid || '_ws' || sd, 'gex_squat', 'Sentadilla',     '4', '8',  squat::text, 'lbs', 1, org_id);
        end loop;
      end if;
    end loop;
  end loop;
end $$;

-- ── Ejercicios GLOBALES (visibles para todas las orgs) ──────────
insert into public.exercises (id, name, muscle_group, type, equipment, visibility, organization_id) values
  ('gex_press', 'Press de banca', 'Pecho',   'normal', 'Barra',   'global', null),
  ('gex_squat', 'Sentadilla',     'Piernas', 'normal', 'Barra',   'global', null),
  ('gex_dead',  'Peso muerto',    'Espalda', 'normal', 'Barra',   'global', null),
  ('gex_plank', 'Plancha',        'Core',    'normal', 'Ninguno', 'global', null)
on conflict (id) do nothing;

-- ── Rutina COMPLETA asignada a cliente1-fit-studio (para pruebas de entrenamiento) ──
do $$
declare org_fit uuid := (select id from public.organizations where slug = 'fit-studio');
begin
  if org_fit is null then return; end if;
  insert into public.routines (id, user_id, title, days_per_week, organization_id, warmup_mode)
    values ('rout_fit_1', 'client_fit_studio_1', 'Rutina de Fuerza', 3, org_fit, 'exercises') on conflict (id) do nothing;
  insert into public.routine_days (id, routine_id, label, sort_order, organization_id)
    values ('rday_fit_1', 'rout_fit_1', 'Día A - Tren superior', 0, org_fit) on conflict (id) do nothing;
  insert into public.routine_groups (id, day_id, label, rest_seconds, sort_order, organization_id)
    values ('rgrp_fit_1', 'rday_fit_1', 'Bloque principal', 60, 0, org_fit) on conflict (id) do nothing;
  insert into public.routine_exercises (id, group_id, exercise_id, series, reps, weight_amount, weight_unit, sort_order, organization_id) values
    ('rex_fit_1', 'rgrp_fit_1', 'gex_press', 4, '10', '110', 'lbs', 0, org_fit),
    ('rex_fit_2', 'rgrp_fit_1', 'gex_squat', 4, '8',  '170', 'lbs', 1, org_fit) on conflict (id) do nothing;
  insert into public.routine_assignments (id, routine_id, user_id, organization_id)
    values ('rassign_fit_1', 'rout_fit_1', 'client_fit_studio_1', org_fit) on conflict (id) do nothing;
  update public.users set active_routine_id = 'rout_fit_1' where id = 'client_fit_studio_1';
  -- Gamificación ACTIVA en fit-studio (para probar medallas del cliente y logros del coach).
  update public.organization_settings
    set gamification = '{"enabled":true,"goalPct":{"bronze":50,"silver":75,"gold":100}}'::jsonb
    where organization_id = org_fit;

  -- Rutina de 1 día/semana para client_fit_studio_2, SIN entrenos esta semana: al
  -- finalizar UN entreno cruza el 100% de su meta → medalla de oro (prueba TC-34).
  insert into public.routines (id, user_id, title, days_per_week, organization_id, warmup_mode)
    values ('rout_fit_2', 'client_fit_studio_2', 'Rutina Express', 1, org_fit, 'exercises') on conflict (id) do nothing;
  insert into public.routine_days (id, routine_id, label, sort_order, organization_id)
    values ('rday_fit_2', 'rout_fit_2', 'Día único', 0, org_fit) on conflict (id) do nothing;
  insert into public.routine_groups (id, day_id, label, rest_seconds, sort_order, organization_id)
    values ('rgrp_fit_2', 'rday_fit_2', 'Bloque', 60, 0, org_fit) on conflict (id) do nothing;
  insert into public.routine_exercises (id, group_id, exercise_id, series, reps, weight_amount, weight_unit, sort_order, organization_id) values
    ('rex_fit_2b', 'rgrp_fit_2', 'gex_press', 3, '10', '90', 'lbs', 0, org_fit) on conflict (id) do nothing;
  insert into public.routine_assignments (id, routine_id, user_id, organization_id)
    values ('rassign_fit_2', 'rout_fit_2', 'client_fit_studio_2', org_fit) on conflict (id) do nothing;
  update public.users set active_routine_id = 'rout_fit_2' where id = 'client_fit_studio_2';
end $$;

-- ── Bloqueo por vencimiento ACTIVO en gimnasio-base + cliente vencido con rutina ──
-- Escenario para las pruebas del bloqueo: gimnasio-base (plan base) tiene el bloqueo
-- activado (0 días de gracia). cliente5 está vencido y tiene una rutina asignada:
-- debe OCULTÁRSELE. El resto de clientes de la org siguen vigentes.
do $$
declare org_base uuid := (select id from public.organizations where slug = 'gimnasio-base');
begin
  if org_base is null then return; end if;
  update public.organization_settings
    set payment_block_enabled = true, payment_grace_days = 0
    where organization_id = org_base;
  update public.users
    set plan_end_date = current_date - 5, plan_status = 'active'
    where id = 'client_gimnasio_base_5';
  insert into public.routines (id, user_id, title, days_per_week, organization_id, warmup_mode)
    values ('rout_base_blk', 'client_gimnasio_base_5', 'Rutina Base', 3, org_base, 'exercises') on conflict (id) do nothing;
  insert into public.routine_days (id, routine_id, label, sort_order, organization_id)
    values ('rday_base_blk', 'rout_base_blk', 'Día A', 0, org_base) on conflict (id) do nothing;
  insert into public.routine_groups (id, day_id, label, rest_seconds, sort_order, organization_id)
    values ('rgrp_base_blk', 'rday_base_blk', 'Bloque', 60, 0, org_base) on conflict (id) do nothing;
  insert into public.routine_exercises (id, group_id, exercise_id, series, reps, weight_amount, weight_unit, sort_order, organization_id) values
    ('rex_base_blk', 'rgrp_base_blk', 'gex_press', 3, '10', '80', 'lbs', 0, org_base) on conflict (id) do nothing;
  insert into public.routine_assignments (id, routine_id, user_id, organization_id)
    values ('rassign_base_blk', 'rout_base_blk', 'client_gimnasio_base_5', org_base) on conflict (id) do nothing;
  update public.users set active_routine_id = 'rout_base_blk' where id = 'client_gimnasio_base_5';
end $$;

-- Limpieza del helper temporal.
drop function if exists public._seed_auth_user(uuid, text, text, text);
