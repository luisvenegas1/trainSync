-- ═══════════════════════════════════════════════════════════════
--  Bloqueo de rutina por mensualidad vencida (opt-in por organización).
--  - organization_settings.payment_block_enabled: el coach activa el bloqueo.
--  - organization_settings.payment_grace_days: días de gracia tras el vencimiento (0 = inmediato).
--  - users.billing_exempt: excepción por cliente (el coach le da acceso aunque esté vencido).
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

alter table public.organization_settings
  add column if not exists payment_block_enabled boolean not null default false;
alter table public.organization_settings
  add column if not exists payment_grace_days integer not null default 0;
alter table public.users
  add column if not exists billing_exempt boolean not null default false;
