-- ═══════════════════════════════════════════════════════════════
--  0014 — Estado de suscripción por organización (sin Stripe todavía)
--  Aditiva e idempotente. Crea tablas + helpers + admin manual. NO activa RLS
--  ni cobra nada. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- Superadmins de la plataforma (Tito Apps). Acceso de soporte transversal.
create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Suscripción por organización (una por org).
create table if not exists public.organization_subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  organization_id          uuid not null references public.organizations(id) on delete cascade,
  plan                     text not null default 'base',
  status                   text not null default 'trial',  -- trial|active|past_due|suspended|canceled
  current_period_end       timestamptz,
  grace_period_ends_at     timestamptz,
  provider                 text not null default 'manual',  -- manual|stripe (futuro)
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='org_subs_org_unique') then
    alter table public.organization_subscriptions add constraint org_subs_org_unique unique (organization_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='org_subs_status_chk') then
    alter table public.organization_subscriptions add constraint org_subs_status_chk
      check (status in ('trial','active','past_due','suspended','canceled'));
  end if;
end $$;

drop trigger if exists trg_org_subs_updated on public.organization_subscriptions;
create trigger trg_org_subs_updated before update on public.organization_subscriptions
  for each row execute function public.set_updated_at();

-- ── Helpers (SECURITY DEFINER: no recursión) ───────────────────
create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- ¿La suscripción de la org permite USAR la app? (fail-open si no hay fila:
--  una org sin suscripción no queda bloqueada por accidente; la validación
--  pre-RLS exige que toda org tenga fila).
create or replace function public.subscription_usable(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select (s.status in ('trial','active'))
        or (s.grace_period_ends_at is not null and now() < s.grace_period_ends_at)
    from public.organization_subscriptions s
    where s.organization_id = org
  ), true);
$$;

-- ¿Se permite acceso OPERACIONAL a la org? Superadmin siempre (soporte);
-- si no, depende de la suscripción.
create or replace function public.org_operational_allowed(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_superadmin() or public.subscription_usable(org);
$$;

grant execute on function
  public.is_superadmin(),
  public.subscription_usable(uuid),
  public.org_operational_allowed(uuid)
to anon, authenticated;

-- ── Admin manual del superadmin: activar/suspender/reactivar ────
create or replace function public.admin_set_subscription(
  p_org uuid, p_status text,
  p_period_end timestamptz default null,
  p_grace timestamptz default null,
  p_plan text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_superadmin() then
    raise exception 'admin_set_subscription: no autorizado (se requiere superadmin).';
  end if;
  if p_status not in ('trial','active','past_due','suspended','canceled') then
    raise exception 'admin_set_subscription: status inválido %', p_status;
  end if;
  insert into public.organization_subscriptions
    (organization_id, status, plan, current_period_end, grace_period_ends_at)
  values (p_org, p_status, coalesce(p_plan,'base'), p_period_end, p_grace)
  on conflict (organization_id) do update set
    status               = excluded.status,
    plan                 = coalesce(p_plan, public.organization_subscriptions.plan),
    current_period_end   = coalesce(p_period_end, public.organization_subscriptions.current_period_end),
    grace_period_ends_at = p_grace,
    updated_at           = now();
end $$;

revoke all on function public.admin_set_subscription(uuid, text, timestamptz, timestamptz, text) from public;
grant execute on function public.admin_set_subscription(uuid, text, timestamptz, timestamptz, text) to authenticated;

-- NOTA: la suscripción activa de Johel NO se siembra aquí. Johel se crea a mano en
-- supabase/cutover/bootstrap_johel_apply.sql, y ahí mismo se crea su suscripción
-- (después de crear/encontrar la organización).
