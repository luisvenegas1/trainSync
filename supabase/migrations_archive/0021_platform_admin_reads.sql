-- ═══════════════════════════════════════════════════════════════
--  0021 — Lecturas transversales del superadmin (Panel de Plataforma)
--  Aditiva e idempotente. NO activa RLS. Debe correr DESPUÉS de 0008/0015/0016.
--
--  El superadmin (platform_admins) necesita LEER, entre organizaciones,
--  membresías/perfiles/clientes para poblar el panel. Recrea las policies de
--  SELECT añadiendo `or public.is_superadmin()`. No cambia la escritura ni el
--  gate operacional de las orgs. Cuando RLS esté APAGADO, esto es inocuo.
-- ═══════════════════════════════════════════════════════════════

-- organization_members: miembro propio, miembro de la org, o superadmin.
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id) or public.is_superadmin());

-- profiles: propio, comparte org, o superadmin (para ver el owner de cada org).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id) or public.is_superadmin());

-- users (clientes): recrea 0015 añadiendo el superadmin para conteos/resumen.
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (
    public.is_superadmin()
    or ((public.is_org_member(organization_id) or auth_user_id = auth.uid())
        and public.org_operational_allowed(organization_id))
  );

-- routines: recrea 0015/0018 añadiendo el superadmin, SIN perder el soporte de
-- asignación múltiple. El cliente ve una rutina propia O asignada mediante
-- public.client_owns_routine(id) (definida en 0018: dueño legacy o routine_assignments).
-- Debe correr DESPUÉS de 0018 para conservar ese acceso.
drop policy if exists routines_select on public.routines;
create policy routines_select on public.routines for select to authenticated
  using (
    public.is_superadmin()
    or ((public.is_org_member(organization_id) or public.client_owns_routine(id))
        and public.org_operational_allowed(organization_id))
  );
