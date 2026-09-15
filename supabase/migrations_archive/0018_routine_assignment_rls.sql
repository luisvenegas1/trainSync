-- ═══════════════════════════════════════════════════════════════
--  0018 — RLS para asignación múltiple de rutinas
--  Un cliente ve/usa una rutina si es su dueño legacy (routines.user_id) O si está
--  ASIGNADO vía routine_assignments. Redefine los helpers client_owns_* y las
--  policies de routines + routine_assignments. INERTE hasta activar RLS.
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- Un cliente "posee" una rutina si es dueño legacy O está asignado.
create or replace function public.client_owns_routine(rid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.routines r
                where r.id = rid and r.user_id = public.current_client_id())
      or exists(select 1 from public.routine_assignments a
                where a.routine_id = rid and a.user_id = public.current_client_id());
$$;

-- Día/grupo delegan en client_owns_routine (respeta asignaciones automáticamente).
create or replace function public.client_owns_day(did text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.routine_days d
                where d.id = did and public.client_owns_routine(d.routine_id));
$$;

create or replace function public.client_owns_group(gid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.routine_groups g
                join public.routine_days d on d.id = g.day_id
                where g.id = gid and public.client_owns_routine(d.routine_id));
$$;

-- routines: el cliente ve las que le pertenecen O tiene asignadas (client_owns_routine).
drop policy if exists routines_select on public.routines;
create policy routines_select on public.routines for select to authenticated
  using ((public.is_org_member(organization_id) or public.client_owns_routine(id))
         and public.org_operational_allowed(organization_id));

-- routine_assignments: staff lee/escribe su org (con gate); el cliente ve las suyas.
drop policy if exists rassign_select on public.routine_assignments;
create policy rassign_select on public.routine_assignments for select to authenticated
  using ((public.is_org_member(organization_id) or user_id = public.current_client_id())
         and public.org_operational_allowed(organization_id));
drop policy if exists rassign_write on public.routine_assignments;
create policy rassign_write on public.routine_assignments for all to authenticated
  using (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));
