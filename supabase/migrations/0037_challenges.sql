-- ═══════════════════════════════════════════════════════════════
--  0037 — RETOS (Fase 2 de gamificación). Competencias con período entre los
--  clientes de una organización. El RANKING se deriva de workout_sessions (no se
--  guardan resultados). Solo se guarda la definición del reto.
--  RLS: staff de la org y superadmin escriben; staff, clientes de la org y
--  superadmin leen. Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.challenges (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  title              text not null,
  metric             text not null default 'most_workouts',  -- most_workouts | (futuro: punctuality, streak)
  prize              text,
  starts_on          date not null,
  ends_on            date not null,
  visible_to_clients boolean not null default true,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create index if not exists challenges_org_idx on public.challenges(organization_id);

alter table public.challenges enable row level security;

-- Lectura: miembros de la org (is_org_member ya incluye superadmin por 0036) o el
-- cliente de esa org.
drop policy if exists challenges_select on public.challenges;
create policy challenges_select on public.challenges for select to authenticated
  using (public.is_org_member(organization_id) or organization_id = public.current_client_org());

-- Escritura: staff de la org (can_write_org ya incluye superadmin por 0036).
drop policy if exists challenges_write on public.challenges;
create policy challenges_write on public.challenges for all to authenticated
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));
