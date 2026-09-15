-- ═══════════════════════════════════════════════════════════════
--  0026 — Recordatorios de pago (feature Premium).
--  Config por organización + por cliente + tabla de auditoría con protección
--  anti-duplicados. Aditiva e idempotente. Enciende RLS SOLO en la tabla nueva.
--  NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- Config a nivel de organización (en organization_settings).
alter table public.organization_settings
  add column if not exists reminders_enabled     boolean not null default false;
alter table public.organization_settings
  add column if not exists reminders_days_before integer not null default 3;

-- Config a nivel de cliente (opt-out por cliente).
alter table public.users
  add column if not exists reminder_enabled boolean not null default true;

-- ── Auditoría de recordatorios enviados (anti-duplicados) ──────
create table if not exists public.payment_reminder_logs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id       text not null,
  due_date        date not null,
  reminder_type   text not null default 'pre_due',   -- pre_due | due | overdue (extensible)
  scheduled_for   date not null,
  sent_at         timestamptz,
  status          text not null default 'pending',    -- pending | sent | failed | skipped
  error_message   text,
  created_at      timestamptz not null default now()
);

-- Dedup: un recordatorio por (org, cliente, vencimiento, tipo). Evita que un cron
-- corrido dos veces el mismo día mande dos correos iguales.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_reminder_unique') then
    alter table public.payment_reminder_logs
      add constraint payment_reminder_unique unique (organization_id, client_id, due_date, reminder_type);
  end if;
end $$;

create index if not exists payment_reminder_org_idx on public.payment_reminder_logs(organization_id);
create index if not exists payment_reminder_sched_idx on public.payment_reminder_logs(scheduled_for);

-- RLS: el staff de la org lee sus propios logs; el superadmin, todos. La escritura
-- la hace la Edge Function con service_role (bypass RLS). Se ENCIENDE acá porque el
-- proyecto ya opera con RLS activo (tabla nueva no debe quedar abierta).
alter table public.payment_reminder_logs enable row level security;

drop policy if exists payment_reminder_select on public.payment_reminder_logs;
create policy payment_reminder_select on public.payment_reminder_logs for select to authenticated
  using (public.is_superadmin() or public.is_org_member(organization_id));
