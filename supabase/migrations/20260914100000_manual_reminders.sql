-- ═══════════════════════════════════════════════════════════════
--  Recordatorios manuales de pago + aviso de pago del SaaS.
--  - El anti-duplicados del cron aplica SOLO a los recordatorios automáticos
--    (reminder_type='pre_due'): se cambia el UNIQUE total por un índice PARCIAL.
--    Así los reenvíos manuales (reminder_type='manual') se pueden repetir.
--  - sent_by: quién disparó el envío manual (null = automático del cron).
--  - saas_payment_notices: avisos de pago del SaaS que el superadmin le manda a un
--    entrenador (dueño de tenant). Visible solo para superadmins.
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- 1) Anti-duplicados solo para los automáticos.
alter table public.payment_reminder_logs
  drop constraint if exists payment_reminder_unique;
create unique index if not exists payment_reminder_predue_unique
  on public.payment_reminder_logs (organization_id, client_id, due_date)
  where reminder_type = 'pre_due';

-- 2) Quién disparó el envío (manual). Null = cron automático.
alter table public.payment_reminder_logs
  add column if not exists sent_by uuid;

-- 3) Avisos de pago del SaaS (superadmin → entrenador dueño de tenant).
create table if not exists public.saas_payment_notices (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sent_by         uuid,
  sent_to_email   text,
  note            text,
  status          text not null default 'sent',
  error_message   text,
  created_at      timestamptz not null default now()
);
alter table public.saas_payment_notices enable row level security;
grant all on public.saas_payment_notices to anon, authenticated, service_role;
create index if not exists saas_payment_notices_org_idx on public.saas_payment_notices (organization_id);

-- Solo superadmins pueden leer estos avisos (el service_role los escribe).
drop policy if exists saas_payment_notices_select on public.saas_payment_notices;
create policy saas_payment_notices_select on public.saas_payment_notices
  for select to authenticated
  using (public.is_superadmin());
