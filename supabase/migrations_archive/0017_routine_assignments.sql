-- ═══════════════════════════════════════════════════════════════
--  0017 — Asignación de rutinas a MÚLTIPLES usuarios (join table)
--  Una rutina (plantilla) puede asignarse a varios clientes. La "rutina activa"
--  sigue siendo por usuario (users.active_routine_id): varios usuarios pueden
--  tener la misma rutina activa, y cada uno la cambia de forma independiente.
--  Aditiva e idempotente. NO activa RLS. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.routine_assignments (
  id              text primary key,
  routine_id      text not null references public.routines(id) on delete cascade,
  user_id         text not null references public.users(id)    on delete cascade,
  organization_id uuid references public.organizations(id),
  created_at      timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='routine_assignments_unique') then
    alter table public.routine_assignments add constraint routine_assignments_unique unique (routine_id, user_id);
  end if;
end $$;

create index if not exists routine_assignments_routine_idx on public.routine_assignments(routine_id);
create index if not exists routine_assignments_user_idx    on public.routine_assignments(user_id);
create index if not exists routine_assignments_org_idx     on public.routine_assignments(organization_id);

-- organization_id se autocompleta desde la rutina (helper de 0004)
drop trigger if exists trg_org_rassign on public.routine_assignments;
create trigger trg_org_rassign before insert or update on public.routine_assignments
  for each row execute function public.fn_autofill_org('routines','routine_id');
