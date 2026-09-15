-- ═══════════════════════════════════════════════════════════════
--  0013 — Foto de perfil del cliente en Storage (columna avatar_url)
--  Aditiva e idempotente. Convive con la foto legacy (localStorage jh_photo_*).
--  NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════
alter table public.users add column if not exists avatar_url text;

-- (organization_settings.logo_url / trainer_photo_url ya existen desde 0001.)
