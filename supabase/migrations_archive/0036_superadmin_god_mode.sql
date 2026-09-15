-- ═══════════════════════════════════════════════════════════════
--  0036 — SUPERUSUARIO: acceso a cualquier tenant (god-mode).
--  Hace que los helpers is_org_member() y has_org_role() devuelvan true para un
--  superadmin (platform_admins). Como TODAS las policies de datos se apoyan en
--  estos helpers (is_org_member / can_write_org), el superadmin obtiene lectura y
--  escritura en CUALQUIER organización de forma automática — sin tocar cada policy.
--
--  Seguridad: solo aplica a quienes estén en platform_admins (tus cuentas). Un
--  usuario normal NO es superadmin → las funciones se comportan EXACTAMENTE igual
--  que antes, así que el aislamiento entre tenants se mantiene intacto para todos
--  los demás. can_write_org llama a has_org_role, así que hereda el bypass.
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or exists(
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(org uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or exists(
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any(roles)
  );
$$;
