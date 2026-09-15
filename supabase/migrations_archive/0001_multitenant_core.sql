-- ═══════════════════════════════════════════════════════════════
--  0001 — Núcleo multi-tenant
--  Aditiva e idempotente. NO borra nada. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- Helper: mantener updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── organizations ──────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null,
  tenant_type text not null default 'production',   -- production | demo | test
  status      text not null default 'active',       -- active | suspended | archived
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='organizations_slug_key') then
    alter table public.organizations add constraint organizations_slug_key unique (slug);
  end if;
  if not exists (select 1 from pg_constraint where conname='organizations_tenant_type_chk') then
    alter table public.organizations add constraint organizations_tenant_type_chk
      check (tenant_type in ('production','demo','test'));
  end if;
  if not exists (select 1 from pg_constraint where conname='organizations_status_chk') then
    alter table public.organizations add constraint organizations_status_chk
      check (status in ('active','suspended','archived'));
  end if;
end $$;

drop trigger if exists trg_organizations_updated on public.organizations;
create trigger trg_organizations_updated before update on public.organizations
  for each row execute function public.set_updated_at();

-- ── organization_settings (branding por tenant) ────────────────
create table if not exists public.organization_settings (
  organization_id   uuid primary key references public.organizations(id) on delete cascade,
  display_name      text,
  logo_url          text,
  trainer_photo_url text,
  primary_color     text,
  secondary_color   text,
  tagline           text,
  bio               text,
  whatsapp          text,
  instagram         text,
  contact_email     text,
  call_to_action    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists trg_org_settings_updated on public.organization_settings;
create trigger trg_org_settings_updated before update on public.organization_settings
  for each row execute function public.set_updated_at();

-- ── profiles (1:1 con auth.users, SIN contraseñas) ─────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── organization_members (usuarios Auth ↔ organizaciones) ──────
create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'trainer',  -- owner | trainer | demo_viewer | admin | client (extensible)
  created_at      timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname='org_members_unique') then
    alter table public.organization_members add constraint org_members_unique
      unique (organization_id, user_id);
  end if;
end $$;

create index if not exists org_members_org_idx  on public.organization_members(organization_id);
create index if not exists org_members_user_idx on public.organization_members(user_id);

-- NOTA: RLS se activa a MANO en supabase/cutover/enable_rls.sql, no aquí.
