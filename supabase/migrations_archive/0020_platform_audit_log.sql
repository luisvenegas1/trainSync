-- ═══════════════════════════════════════════════════════════════
--  0020 — Auditoría de acciones sensibles del Panel de Plataforma
--  Aditiva e idempotente. NO activa RLS. NO ejecutar en prod sin autorización.
--
--  Registra: creación/edición de organización, invitación/cambio de owner,
--  cambio de plan/estado de suscripción, suspensión/reactivación, y pagos.
--  NUNCA guarda secretos ni contraseñas: solo metadatos seguros (jsonb).
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.platform_audit_log (
  id              uuid primary key default gen_random_uuid(),
  actor_user_id   uuid references auth.users(id),     -- superadmin responsable
  action          text not null,                       -- p.ej. org.created, subscription.updated, payment.recorded
  organization_id uuid references public.organizations(id) on delete set null,
  metadata        jsonb not null default '{}'::jsonb,  -- datos seguros (sin secretos)
  created_at      timestamptz not null default now()
);

create index if not exists platform_audit_org_idx     on public.platform_audit_log(organization_id);
create index if not exists platform_audit_created_idx on public.platform_audit_log(created_at desc);
create index if not exists platform_audit_action_idx  on public.platform_audit_log(action);

-- ── Policy (para cuando se active RLS): SOLO superadmin ─────────
drop policy if exists platform_audit_all on public.platform_audit_log;
create policy platform_audit_all on public.platform_audit_log for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- ── Helper SECURITY DEFINER para registrar auditoría ───────────
--  Verifica superadmin y escribe una fila. Usable desde SQL/RPC; la Edge
--  Function también puede insertar directo con service_role.
create or replace function public.log_platform_action(
  p_action text,
  p_org uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  new_id uuid;
begin
  if not public.is_superadmin() then
    raise exception 'log_platform_action: no autorizado (se requiere superadmin).';
  end if;
  insert into public.platform_audit_log (actor_user_id, action, organization_id, metadata)
  values (auth.uid(), p_action, p_org, coalesce(p_metadata, '{}'::jsonb))
  returning id into new_id;
  return new_id;
end $$;

revoke all on function public.log_platform_action(text, uuid, jsonb) from public;
grant execute on function public.log_platform_action(text, uuid, jsonb) to authenticated;
