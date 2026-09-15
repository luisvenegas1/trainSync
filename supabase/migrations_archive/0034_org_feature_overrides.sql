-- ═══════════════════════════════════════════════════════════════
--  0034 — Overrides de features POR ORGANIZACIÓN.
--  Permite activar/desactivar una feature para un tenant específico sin cambiar su
--  plan. Útil para: un tenant de PRUEBA (probar features antes de soltarlas a los
--  clientes), acuerdos custom, o lanzamientos graduales.
--  Formato: jsonb de { "<feature>": true|false }. Ej: {"challenges": true}.
--  Se aplica ENCIMA de las features del plan (ver src/plans/entitlements.js).
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
--
--  Cómo activar una feature para un tenant (ejemplo, superadmin en SQL Editor):
--    update public.organization_settings
--    set feature_overrides = coalesce(feature_overrides,'{}'::jsonb) || '{"challenges": true}'::jsonb
--    where organization_id = (select id from public.organizations where slug = 'titotrainer');
-- ═══════════════════════════════════════════════════════════════

alter table public.organization_settings
  add column if not exists feature_overrides jsonb not null default '{}'::jsonb;
