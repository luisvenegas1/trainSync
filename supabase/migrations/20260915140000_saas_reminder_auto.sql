-- ═══════════════════════════════════════════════════════════════
--  Recordatorio AUTOMÁTICO del pago del SaaS al entrenador (dueño del tenant).
--  - organization_subscriptions.saas_reminder_enabled: activar el aviso automático.
--  - organization_subscriptions.saas_reminder_days: cuántos días antes del vencimiento.
--  - saas_payment_notices.due_date + kind ('manual'|'auto'): para el anti-duplicados
--    del automático (un aviso por vencimiento). El manual (kind='manual') se puede
--    repetir cuando el superadmin quiera.
--  Aditiva/idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

alter table public.organization_subscriptions
  add column if not exists saas_reminder_enabled boolean not null default false;
alter table public.organization_subscriptions
  add column if not exists saas_reminder_days integer not null default 3;

alter table public.saas_payment_notices
  add column if not exists due_date date;
alter table public.saas_payment_notices
  add column if not exists kind text not null default 'manual';

-- Anti-duplicados SOLO para los automáticos: un aviso por (org, vencimiento).
create unique index if not exists saas_notices_auto_unique
  on public.saas_payment_notices (organization_id, due_date)
  where kind = 'auto';
