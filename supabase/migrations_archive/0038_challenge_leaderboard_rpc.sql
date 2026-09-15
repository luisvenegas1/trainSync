-- ═══════════════════════════════════════════════════════════════
--  0038 — Tabla de posiciones de un reto para CLIENTES (RPC SECURITY DEFINER).
--
--  Problema: un cliente solo puede leer SUS propias workout_sessions (por RLS), así
--  que el leaderboard de un reto le mostraría solo a él. No queremos abrir la tabla de
--  sesiones a los clientes (expondría la frecuencia de todos, siempre, sin control).
--
--  Solución: una función que devuelve SOLO {client_id, name, count} — nunca pesos ni
--  logs — acotada al reto, a su período y a la organización del reto. Autoriza:
--    • staff/superadmin de la org (is_org_member ya incluye superadmin por 0036), o
--    • un cliente de ESA MISMA org, y SOLO si el reto es visible_to_clients.
--  Cualquier otro caso devuelve vacío (no filtra información). El aislamiento entre
--  tenants queda intacto: todo se filtra por la organización del propio reto.
--
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.challenge_leaderboard(p_challenge_id uuid)
returns table (client_id text, name text, count bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  ch public.challenges%rowtype;
begin
  select * into ch from public.challenges where id = p_challenge_id;
  if ch.id is null then
    return; -- el reto no existe → vacío
  end if;

  -- Autorización: staff de la org, o cliente de la org solo si el reto es visible.
  if not (
    public.is_org_member(ch.organization_id)
    or (ch.organization_id = public.current_client_org() and ch.visible_to_clients)
  ) then
    return; -- no autorizado → vacío (no revela nada)
  end if;

  return query
    select u.id::text as client_id,
           u.name      as name,
           count(s.id) as count
    from public.users u
    left join public.workout_sessions s
      on  s.user_id = u.id
      and s.organization_id = ch.organization_id
      and coalesce(s.status, 'completed') = 'completed'
      and coalesce(s.finished_at, s.started_at, s.created_at)::date
            between ch.starts_on and ch.ends_on
    where u.organization_id = ch.organization_id
      and u.role is distinct from 'trainer'   -- solo clientes compiten
    group by u.id, u.name
    order by count(s.id) desc, u.name asc;
end;
$$;

grant execute on function public.challenge_leaderboard(uuid) to authenticated;
