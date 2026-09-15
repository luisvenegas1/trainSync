-- ═══════════════════════════════════════════════════════════════
--  0019 — Pagos de PLATAFORMA (Tito Apps) + columnas de suscripción
--  Aditiva e idempotente. NO activa RLS. NO ejecutar en prod sin autorización.
--
--  Estos pagos son de la SUSCRIPCIÓN de cada organización a la plataforma.
--  NO tienen NADA que ver con public.payments (pagos de los clientes de cada
--  entrenador). Son tablas separadas a propósito.
-- ═══════════════════════════════════════════════════════════════

-- ── Columnas administrativas de la suscripción ─────────────────
alter table public.organization_subscriptions add column if not exists admin_notes text;
alter table public.organization_subscriptions add column if not exists started_at   timestamptz;

-- ── Pagos de plataforma (historial de la suscripción de la org) ─
create table if not exists public.platform_payments (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  amount             numeric(12,2) not null check (amount > 0),
  currency           text not null default 'CRC',
  paid_at            date not null,
  period_start       date,
  period_end         date,
  method             text not null default 'manual',   -- manual|sinpe|transfer|cash|card|stripe|other
  reference          text,                              -- comprobante/nº de referencia (opcional)
  note               text,                              -- nota interna
  recorded_by        uuid references auth.users(id),    -- superadmin que lo registró
  created_at         timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='platform_payments_method_chk') then
    alter table public.platform_payments add constraint platform_payments_method_chk
      check (method in ('manual','sinpe','transfer','cash','card','stripe','other'));
  end if;
end $$;

create index if not exists platform_payments_org_idx     on public.platform_payments(organization_id);
create index if not exists platform_payments_paid_at_idx on public.platform_payments(paid_at desc);

-- ── Policies (para cuando se active RLS): SOLO superadmin ───────
--  No se activa RLS aquí; solo se dejan definidas las policies. is_superadmin()
--  viene de 0014.
drop policy if exists platform_payments_all on public.platform_payments;
create policy platform_payments_all on public.platform_payments for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- NOTA: la escritura real de pagos se hace por la Edge Function `platform-admin`
-- (verifica platform_admins y usa service_role). Estas policies son la segunda
-- capa de defensa cuando se active RLS.
