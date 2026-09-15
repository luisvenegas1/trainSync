-- ═══════════════════════════════════════════════════════════════
--  0022 — El CLIENTE puede leer la biblioteca de ejercicios de SU organización
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
--
--  Problema: tras activar RLS, un cliente (no es miembro staff de la org) solo
--  podía ver ejercicios 'global'. Los ejercicios privados/propios del entrenador
--  (organization_id seteado) quedaban invisibles para el cliente, así que en su
--  rutina el NOMBRE y el VIDEO del ejercicio salían vacíos ("Ejercicio").
--
--  Fix: además de los global y los de miembros, permitir que el cliente lea los
--  ejercicios cuya organización es la suya (la de su fila en public.users).
-- ═══════════════════════════════════════════════════════════════

-- Organización del cliente vinculado al usuario Auth actual (o NULL). SECURITY
-- DEFINER para no recursar policies de users.
create or replace function public.current_client_org()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.users where auth_user_id = auth.uid() limit 1;
$$;

grant execute on function public.current_client_org() to anon, authenticated;

-- Recrea exercises_select agregando la rama del cliente (su propia organización).
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated
  using (
    visibility = 'global'
    or public.is_superadmin()
    or (public.is_org_member(organization_id) and public.org_operational_allowed(organization_id))
    or (organization_id = public.current_client_org() and public.org_operational_allowed(organization_id))
  );
