-- ═══════════════════════════════════════════════════════════════
--  Gracia de la suscripción como DÍAS después del vencimiento (no fecha absoluta).
--  grace_period_ends_at se sigue usando para el gate de acceso, pero ahora se DERIVA
--  de current_period_end + grace_days (se recalcula al guardar o al registrar un pago),
--  así nunca queda antes del vencimiento y se actualiza sola.
--  Aditiva/idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

alter table public.organization_subscriptions
  add column if not exists grace_days integer not null default 0;
