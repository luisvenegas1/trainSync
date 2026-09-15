-- ═══════════════════════════════════════════════════════════════
--  0002 — Columnas multi-tenant (nullable) + biblioteca de ejercicios
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
--
--  Esquema real esperado (según src/db.js). PENDIENTE de verificar contra
--  el esquema remoto: nombres/tipos de columnas de cada tabla legacy.
-- ═══════════════════════════════════════════════════════════════

-- organization_id (nullable por ahora; se rellena en el bootstrap manual y se vuelve NOT NULL
-- solo después de validar el backfill, en una migración posterior).
alter table public.users               add column if not exists organization_id uuid references public.organizations(id);
alter table public.exercises           add column if not exists organization_id uuid references public.organizations(id);
alter table public.routines            add column if not exists organization_id uuid references public.organizations(id);
alter table public.routine_days        add column if not exists organization_id uuid references public.organizations(id);
alter table public.routine_groups      add column if not exists organization_id uuid references public.organizations(id);
alter table public.routine_exercises   add column if not exists organization_id uuid references public.organizations(id);
alter table public.measurements        add column if not exists organization_id uuid references public.organizations(id);
alter table public.payments            add column if not exists organization_id uuid references public.organizations(id);
alter table public.workout_sessions    add column if not exists organization_id uuid references public.organizations(id);
alter table public.workout_logs        add column if not exists organization_id uuid references public.organizations(id);
alter table public.catalogs            add column if not exists organization_id uuid references public.organizations(id);

create index if not exists users_org_idx             on public.users(organization_id);
create index if not exists exercises_org_idx         on public.exercises(organization_id);
create index if not exists routines_org_idx          on public.routines(organization_id);
create index if not exists measurements_org_idx      on public.measurements(organization_id);
create index if not exists payments_org_idx          on public.payments(organization_id);
create index if not exists workout_sessions_org_idx  on public.workout_sessions(organization_id);
create index if not exists catalogs_org_idx          on public.catalogs(organization_id);

-- ── Biblioteca de ejercicios: global vs privada ───────────────
--  visibility = 'global'       -> organization_id NULL, visible para todas las orgs
--  visibility = 'organization' -> organization_id = dueña, privado
alter table public.exercises add column if not exists visibility  text;
alter table public.exercises add column if not exists description text;
alter table public.exercises add column if not exists image_url   text;
alter table public.exercises add column if not exists instructions text;
alter table public.exercises add column if not exists created_by  uuid references auth.users(id);
alter table public.exercises add column if not exists created_at  timestamptz default now();
alter table public.exercises add column if not exists updated_at  timestamptz default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname='exercises_visibility_chk') then
    alter table public.exercises add constraint exercises_visibility_chk
      check (visibility is null or visibility in ('global','organization'));
  end if;
end $$;

create index if not exists exercises_visibility_idx on public.exercises(visibility);

-- ── Cliente: preparar vínculo futuro con Auth (sin obligarlo) ──
--  Un cliente puede existir SIN cuenta Auth. Cuando se invite/vincule,
--  auth_user_id apuntará a auth.users. Se conservan username/password legacy.
alter table public.users add column if not exists auth_user_id  uuid references auth.users(id);
alter table public.users add column if not exists assigned_trainer_id uuid references auth.users(id);
create index if not exists users_auth_idx on public.users(auth_user_id);
