-- ═══════════════════════════════════════════════════════════════
--  0035 — Configuración de GAMIFICACIÓN por organización (Fase 1: medallas).
--  Guarda si el entrenador activó las medallas y los umbrales semanales.
--  Formato jsonb: { "enabled": bool, "weekly": { "bronze": 3, "silver": 5, "gold": 7 } }
--  Las medallas en sí se DERIVAN de workout_sessions (no hay tabla de medallas).
--  La escritura la hace el entrenador (owner/staff) igual que la config de
--  recordatorios; el gateo maestro es el feature flag 'challenges'.
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

alter table public.organization_settings
  add column if not exists gamification jsonb not null default '{}'::jsonb;
