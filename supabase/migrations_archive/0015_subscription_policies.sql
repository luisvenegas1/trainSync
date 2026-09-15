-- ═══════════════════════════════════════════════════════════════
--  0015 — Policies con GATE de suscripción (operacional) + tablas de suscripción
--  Recrea las policies OPERACIONALES de 0008 añadiendo org_operational_allowed():
--  una org suspendida/cancelada/vencida NO puede leer ni escribir datos operativos.
--  El superadmin conserva acceso (soporte). Los datos de CUENTA (organizations,
--  settings, members, subscriptions) NO llevan el gate → el owner ve su estado.
--  Aditiva e idempotente. Corre DESPUÉS de 0008 y 0014. No activa RLS.
-- ═══════════════════════════════════════════════════════════════

-- ── users (clientes) ──
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using ((public.is_org_member(organization_id) or auth_user_id = auth.uid())
         and public.org_operational_allowed(organization_id));
drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert to authenticated
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));
drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using ((public.can_write_org(organization_id) or auth_user_id = auth.uid()) and public.org_operational_allowed(organization_id))
  with check ((public.can_write_org(organization_id) or auth_user_id = auth.uid()) and public.org_operational_allowed(organization_id));
drop policy if exists users_delete on public.users;
create policy users_delete on public.users for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','trainer']) and public.org_operational_allowed(organization_id));

-- ── exercises (globales sin gate; privados con gate) ──
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated
  using (visibility = 'global' or (public.is_org_member(organization_id) and public.org_operational_allowed(organization_id)));
drop policy if exists exercises_insert on public.exercises;
create policy exercises_insert on public.exercises for insert to authenticated
  with check (visibility = 'organization' and public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));
drop policy if exists exercises_update on public.exercises;
create policy exercises_update on public.exercises for update to authenticated
  using (visibility = 'organization' and public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (visibility = 'organization' and public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));
drop policy if exists exercises_delete on public.exercises;
create policy exercises_delete on public.exercises for delete to authenticated
  using (visibility = 'organization' and public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));

-- ── routines + árbol ──
drop policy if exists routines_select on public.routines;
create policy routines_select on public.routines for select to authenticated
  using ((public.is_org_member(organization_id) or user_id = public.current_client_id())
         and public.org_operational_allowed(organization_id));
drop policy if exists routines_write on public.routines;
create policy routines_write on public.routines for all to authenticated
  using (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));

drop policy if exists rdays_select on public.routine_days;
create policy rdays_select on public.routine_days for select to authenticated
  using ((public.is_org_member(organization_id) or public.client_owns_day(id)) and public.org_operational_allowed(organization_id));
drop policy if exists rdays_write on public.routine_days;
create policy rdays_write on public.routine_days for all to authenticated
  using (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));

drop policy if exists rgroups_select on public.routine_groups;
create policy rgroups_select on public.routine_groups for select to authenticated
  using ((public.is_org_member(organization_id) or public.client_owns_group(id)) and public.org_operational_allowed(organization_id));
drop policy if exists rgroups_write on public.routine_groups;
create policy rgroups_write on public.routine_groups for all to authenticated
  using (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));

drop policy if exists rexercises_select on public.routine_exercises;
create policy rexercises_select on public.routine_exercises for select to authenticated
  using ((public.is_org_member(organization_id) or public.client_owns_group(group_id)) and public.org_operational_allowed(organization_id));
drop policy if exists rexercises_write on public.routine_exercises;
create policy rexercises_write on public.routine_exercises for all to authenticated
  using (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));

-- ── measurements / payments ──
drop policy if exists measurements_select on public.measurements;
create policy measurements_select on public.measurements for select to authenticated
  using ((public.is_org_member(organization_id) or client_id = public.current_client_id()) and public.org_operational_allowed(organization_id));
drop policy if exists measurements_write on public.measurements;
create policy measurements_write on public.measurements for all to authenticated
  using (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using ((public.is_org_member(organization_id) or client_id = public.current_client_id()) and public.org_operational_allowed(organization_id));
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments for all to authenticated
  using (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));

-- ── workout_sessions / logs ──
drop policy if exists wsessions_select on public.workout_sessions;
create policy wsessions_select on public.workout_sessions for select to authenticated
  using ((public.is_org_member(organization_id) or user_id = public.current_client_id()) and public.org_operational_allowed(organization_id));
drop policy if exists wsessions_insert on public.workout_sessions;
create policy wsessions_insert on public.workout_sessions for insert to authenticated
  with check ((public.can_write_org(organization_id) or user_id = public.current_client_id()) and public.org_operational_allowed(organization_id));
drop policy if exists wsessions_update on public.workout_sessions;
create policy wsessions_update on public.workout_sessions for update to authenticated
  using ((public.can_write_org(organization_id) or user_id = public.current_client_id()) and public.org_operational_allowed(organization_id))
  with check ((public.can_write_org(organization_id) or user_id = public.current_client_id()) and public.org_operational_allowed(organization_id));
drop policy if exists wsessions_delete on public.workout_sessions;
create policy wsessions_delete on public.workout_sessions for delete to authenticated
  using ((public.can_write_org(organization_id) or user_id = public.current_client_id()) and public.org_operational_allowed(organization_id));

drop policy if exists wlogs_select on public.workout_logs;
create policy wlogs_select on public.workout_logs for select to authenticated
  using ((public.is_org_member(organization_id) or public.client_owns_session(session_id)) and public.org_operational_allowed(organization_id));
drop policy if exists wlogs_write on public.workout_logs;
create policy wlogs_write on public.workout_logs for all to authenticated
  using ((public.can_write_org(organization_id) or public.client_owns_session(session_id)) and public.org_operational_allowed(organization_id))
  with check ((public.can_write_org(organization_id) or public.client_owns_session(session_id)) and public.org_operational_allowed(organization_id));

-- ── catalogs ──
drop policy if exists catalogs_select on public.catalogs;
create policy catalogs_select on public.catalogs for select to authenticated
  using (public.is_org_member(organization_id) and public.org_operational_allowed(organization_id));
drop policy if exists catalogs_write on public.catalogs;
create policy catalogs_write on public.catalogs for all to authenticated
  using (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id))
  with check (public.can_write_org(organization_id) and public.org_operational_allowed(organization_id));

-- ── organization_subscriptions (CUENTA: SIN gate operacional) ──
--  El owner/miembros pueden VER el estado aunque estén suspendidos. Solo el
--  superadmin escribe (o vía admin_set_subscription).
drop policy if exists org_subs_select on public.organization_subscriptions;
create policy org_subs_select on public.organization_subscriptions for select to authenticated
  using (public.is_org_member(organization_id) or public.is_superadmin());
drop policy if exists org_subs_write on public.organization_subscriptions;
create policy org_subs_write on public.organization_subscriptions for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());

-- ── platform_admins (solo superadmin) ──
drop policy if exists platform_admins_all on public.platform_admins;
create policy platform_admins_all on public.platform_admins for all to authenticated
  using (public.is_superadmin()) with check (public.is_superadmin());
