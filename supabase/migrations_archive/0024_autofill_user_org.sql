-- ═══════════════════════════════════════════════════════════════
--  0024 — Autocompletar organization_id en public.users desde la membresía del
--  entrenador que inserta (si viene NULL). Robustece el alta de clientes: aunque
--  el frontend no envíe la organización, el cliente queda en la org correcta y
--  pasa el WITH CHECK de RLS (can_write_org).
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.fn_autofill_user_org()
returns trigger language plpgsql security definer set search_path = public as $$
declare porg uuid;
begin
  if NEW.organization_id is not null then
    return NEW;
  end if;
  -- Organización del entrenador autenticado (owner/trainer). Si es miembro de una
  -- sola org (lo normal), la toma directo.
  select m.organization_id into porg
  from public.organization_members m
  where m.user_id = auth.uid() and m.role in ('owner','trainer')
  order by m.created_at
  limit 1;
  NEW.organization_id := porg;
  return NEW;
end $$;

drop trigger if exists trg_autofill_user_org on public.users;
create trigger trg_autofill_user_org before insert on public.users
  for each row execute function public.fn_autofill_user_org();
