-- ANTES: el cliente está en Premium
select id, organization_id, active_routine_id from users where id='client_test_001';

-- TRANSFERIR (simulando sesión de superadmin)
do $$
declare r jsonb;
begin
  insert into platform_admins(user_id) values ('a1110001-0000-0000-0000-000000000001') on conflict do nothing;
  perform set_config('request.jwt.claims', json_build_object('sub','a1110001-0000-0000-0000-000000000001')::text, true);
  r := public.transfer_client('client_test_001','bbbb2222-2222-2222-2222-222222222222');
  raise notice 'RESULTADO: %', r;
end $$;

-- DESPUÉS: verificar que TODO se movió a Base (bbbb2222...) y la rutina se desvinculó
select 'cliente'   t, organization_id::text, active_routine_id from users where id='client_test_001'
union all select 'sesiones', organization_id::text, count(*)::text from workout_sessions where user_id='client_test_001' group by organization_id
union all select 'mediciones', organization_id::text, count(*)::text from measurements where client_id='client_test_001' group by organization_id
union all select 'pagos', organization_id::text, count(*)::text from payments where client_id='client_test_001' group by organization_id
union all select 'asignaciones', '-', count(*)::text from routine_assignments where user_id='client_test_001';