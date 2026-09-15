-- ═══════════════════════════════════════════════════════════════
--  0023 — Columna favicon_url en organization_settings
--  Aditiva e idempotente. Para que cada tenant tenga su propio favicon/ícono
--  (pestaña del navegador e instalación PWA) editable desde el panel.
-- ═══════════════════════════════════════════════════════════════
alter table public.organization_settings add column if not exists favicon_url text;
