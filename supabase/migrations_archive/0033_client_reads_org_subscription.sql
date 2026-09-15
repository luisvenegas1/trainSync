-- ═══════════════════════════════════════════════════════════════
--  0033 — Fix: el CLIENTE puede leer la suscripción de SU organización.
--  La policy org_subs_select solo permitía a miembros (is_org_member) o superadmin.
--  Un cliente NO es organization_member (se vincula por users.auth_user_id), así que
--  no podía leer la suscripción → el plan caía a 'base' → veía "Función del plan Pro"
--  en Mediciones/Historial aunque el entrenador tuviera Pro/Premium.
--  Este fix agrega la organización del cliente (current_client_org()) a la lectura.
--  Solo SELECT; la escritura sigue restringida al superadmin. Aditiva e idempotente.
--  NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

drop policy if exists org_subs_select on public.organization_subscriptions;
create policy org_subs_select on public.organization_subscriptions for select to authenticated
  using (
    public.is_org_member(organization_id)
    or public.is_superadmin()
    or organization_id = public.current_client_org()
  );
