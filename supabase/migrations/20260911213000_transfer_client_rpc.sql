-- ═══════════════════════════════════════════════════════════════
--  Transferir un cliente de una organización a otra (migración de cliente).
--  Mueve al cliente y TODO su historial (mediciones, entrenamientos, logs, pagos)
--  a la org destino, de forma ATÓMICA (una sola transacción: o todo o nada).
--  Las RUTINAS NO se mueven (son del coach de origen): se elimina la asignación y
--  se limpia la rutina activa del cliente.
--
--  Seguridad: SOLO el superadmin (platform_admins) puede ejecutarla. Es una acción
--  que cruza tenants, así que jamás debe poder hacerla un owner/trainer normal.
--  SECURITY DEFINER + search_path fijo. Aditiva e idempotente (create or replace).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.transfer_client(p_client_id text, p_target_org uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_src uuid;
  v_result jsonb;
begin
  -- Autorización: solo superadmin.
  if not public.is_superadmin() then
    raise exception 'forbidden: solo el superadmin puede transferir clientes entre tenants';
  end if;

  -- Validaciones.
  select organization_id into v_src from public.users where id = p_client_id;
  if not found then
    raise exception 'El cliente % no existe', p_client_id;
  end if;
  if v_src is null then
    raise exception 'El cliente % no tiene organización de origen', p_client_id;
  end if;
  if not exists (select 1 from public.organizations where id = p_target_org) then
    raise exception 'La organización destino % no existe', p_target_org;
  end if;
  if v_src = p_target_org then
    raise exception 'El cliente ya pertenece a esa organización';
  end if;

  -- Mover historial (todo lo que es del cliente y debe viajar con él).
  update public.workout_logs set organization_id = p_target_org
    where session_id in (select id from public.workout_sessions where user_id = p_client_id);
  update public.workout_sessions set organization_id = p_target_org where user_id = p_client_id;
  update public.measurements     set organization_id = p_target_org where client_id = p_client_id;
  update public.payments         set organization_id = p_target_org where client_id = p_client_id;

  -- Rutinas: NO se mueven. Se desvincula la asignación y se limpia la rutina activa.
  delete from public.routine_assignments where user_id = p_client_id;

  -- Mover al cliente y limpiar su rutina activa (era del tenant de origen).
  update public.users
    set organization_id = p_target_org, active_routine_id = null
    where id = p_client_id;

  v_result := jsonb_build_object(
    'ok', true,
    'client_id', p_client_id,
    'from_org', v_src,
    'to_org', p_target_org,
    'measurements', (select count(*) from public.measurements where client_id = p_client_id),
    'sessions',     (select count(*) from public.workout_sessions where user_id = p_client_id),
    'payments',     (select count(*) from public.payments where client_id = p_client_id)
  );
  return v_result;
end $$;

grant execute on function public.transfer_client(text, uuid) to authenticated;
