-- ═══════════════════════════════════════════════════════════════
--  0016 — Lectura PÚBLICA de organizations + organization_settings
--  Necesaria para que la pantalla de login resuelva el tenant y su branding
--  ANTES de autenticarse (con RLS activo). Sin esto, tras activar RLS el login
--  no podría cargar la organización ni su branding y mostraría "no encontrada".
--  Aditiva e idempotente. Debe aplicarse ANTES de activar RLS. NO activa RLS.
-- ═══════════════════════════════════════════════════════════════

-- organizations: SELECT público (nombre/slug/estado/branding no son sensibles;
-- el subdominio/ruta ya expone el slug). La escritura sigue restringida (0008).
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to anon, authenticated
  using (true);

-- organization_settings: SELECT público (branding visible pre-login).
drop policy if exists org_settings_select on public.organization_settings;
create policy org_settings_select on public.organization_settings for select to anon, authenticated
  using (true);

-- NOTA: las policies de escritura de ambas tablas (owner) se mantienen de 0008.
