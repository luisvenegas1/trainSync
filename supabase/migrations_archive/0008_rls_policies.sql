-- ═══════════════════════════════════════════════════════════════
--  0008 — Policies RLS (CREACIÓN, sin activar RLS)
--  Las policies quedan definidas pero INERTES hasta activar RLS a mano
--  (supabase/cutover/enable_rls.sql). Así podés
--  revisar todo antes del corte. Todas apuntan al rol `authenticated`.
--  Matriz de roles:
--    owner/trainer  -> lectura + escritura en su organización (can_write_org)
--    demo_viewer    -> SOLO lectura en su organización (is_org_member, sin write)
--    cliente        -> solo SUS datos (current_client_id / *_owns_*)
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- ── organizations ──────────────────────────────────────────────
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated
  using (public.is_org_member(id));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated
  using (public.has_org_role(id, array['owner'])) with check (public.has_org_role(id, array['owner']));
-- insert/delete de organizaciones: solo plataforma (SQL/servicio), sin policy.

-- ── organization_settings (branding) ──────────────────────────
drop policy if exists org_settings_select on public.organization_settings;
create policy org_settings_select on public.organization_settings for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists org_settings_write on public.organization_settings;
create policy org_settings_write on public.organization_settings for all to authenticated
  using (public.has_org_role(organization_id, array['owner']))
  with check (public.has_org_role(organization_id, array['owner']));

-- ── profiles ───────────────────────────────────────────────────
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ── organization_members ───────────────────────────────────────
--  is_org_member() es SECURITY DEFINER → no recursa esta policy.
drop policy if exists members_select on public.organization_members;
create policy members_select on public.organization_members for select to authenticated
  using (user_id = auth.uid() or public.is_org_member(organization_id));
drop policy if exists members_write on public.organization_members;
create policy members_write on public.organization_members for all to authenticated
  using (public.has_org_role(organization_id, array['owner']))
  with check (public.has_org_role(organization_id, array['owner']));

-- ── users (clientes) ───────────────────────────────────────────
drop policy if exists users_select on public.users;
create policy users_select on public.users for select to authenticated
  using (public.is_org_member(organization_id) or auth_user_id = auth.uid());
drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert to authenticated
  with check (public.can_write_org(organization_id));
drop policy if exists users_update on public.users;
create policy users_update on public.users for update to authenticated
  using (public.can_write_org(organization_id) or auth_user_id = auth.uid())
  with check (public.can_write_org(organization_id) or auth_user_id = auth.uid());
drop policy if exists users_delete on public.users;
create policy users_delete on public.users for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','trainer']));

-- ── exercises (biblioteca global + privada) ────────────────────
drop policy if exists exercises_select on public.exercises;
create policy exercises_select on public.exercises for select to authenticated
  using (visibility = 'global' or public.is_org_member(organization_id));
-- Solo ejercicios PRIVADOS de la propia org son escribibles (globales NO).
drop policy if exists exercises_insert on public.exercises;
create policy exercises_insert on public.exercises for insert to authenticated
  with check (visibility = 'organization' and public.can_write_org(organization_id));
drop policy if exists exercises_update on public.exercises;
create policy exercises_update on public.exercises for update to authenticated
  using (visibility = 'organization' and public.can_write_org(organization_id))
  with check (visibility = 'organization' and public.can_write_org(organization_id));
drop policy if exists exercises_delete on public.exercises;
create policy exercises_delete on public.exercises for delete to authenticated
  using (visibility = 'organization' and public.can_write_org(organization_id));

-- ── routines ───────────────────────────────────────────────────
drop policy if exists routines_select on public.routines;
create policy routines_select on public.routines for select to authenticated
  using (public.is_org_member(organization_id) or user_id = public.current_client_id());
drop policy if exists routines_write on public.routines;
create policy routines_write on public.routines for all to authenticated
  using (public.can_write_org(organization_id))
  with check (public.can_write_org(organization_id));

-- ── routine_days / groups / exercises ─────────────────────────
drop policy if exists rdays_select on public.routine_days;
create policy rdays_select on public.routine_days for select to authenticated
  using (public.is_org_member(organization_id) or public.client_owns_day(id));
drop policy if exists rdays_write on public.routine_days;
create policy rdays_write on public.routine_days for all to authenticated
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

drop policy if exists rgroups_select on public.routine_groups;
create policy rgroups_select on public.routine_groups for select to authenticated
  using (public.is_org_member(organization_id) or public.client_owns_group(id));
drop policy if exists rgroups_write on public.routine_groups;
create policy rgroups_write on public.routine_groups for all to authenticated
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

drop policy if exists rexercises_select on public.routine_exercises;
create policy rexercises_select on public.routine_exercises for select to authenticated
  using (public.is_org_member(organization_id) or public.client_owns_group(group_id));
drop policy if exists rexercises_write on public.routine_exercises;
create policy rexercises_write on public.routine_exercises for all to authenticated
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

-- ── measurements ───────────────────────────────────────────────
drop policy if exists measurements_select on public.measurements;
create policy measurements_select on public.measurements for select to authenticated
  using (public.is_org_member(organization_id) or client_id = public.current_client_id());
drop policy if exists measurements_write on public.measurements;
create policy measurements_write on public.measurements for all to authenticated
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

-- ── payments ───────────────────────────────────────────────────
drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.is_org_member(organization_id) or client_id = public.current_client_id());
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments for all to authenticated
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));

-- ── workout_sessions (el cliente crea/edita las suyas) ─────────
drop policy if exists wsessions_select on public.workout_sessions;
create policy wsessions_select on public.workout_sessions for select to authenticated
  using (public.is_org_member(organization_id) or user_id = public.current_client_id());
drop policy if exists wsessions_insert on public.workout_sessions;
create policy wsessions_insert on public.workout_sessions for insert to authenticated
  with check (public.can_write_org(organization_id) or user_id = public.current_client_id());
drop policy if exists wsessions_update on public.workout_sessions;
create policy wsessions_update on public.workout_sessions for update to authenticated
  using (public.can_write_org(organization_id) or user_id = public.current_client_id())
  with check (public.can_write_org(organization_id) or user_id = public.current_client_id());
drop policy if exists wsessions_delete on public.workout_sessions;
create policy wsessions_delete on public.workout_sessions for delete to authenticated
  using (public.can_write_org(organization_id) or user_id = public.current_client_id());

-- ── workout_logs (por la sesión del cliente) ──────────────────
drop policy if exists wlogs_select on public.workout_logs;
create policy wlogs_select on public.workout_logs for select to authenticated
  using (public.is_org_member(organization_id) or public.client_owns_session(session_id));
drop policy if exists wlogs_write on public.workout_logs;
create policy wlogs_write on public.workout_logs for all to authenticated
  using (public.can_write_org(organization_id) or public.client_owns_session(session_id))
  with check (public.can_write_org(organization_id) or public.client_owns_session(session_id));

-- ── catalogs ───────────────────────────────────────────────────
drop policy if exists catalogs_select on public.catalogs;
create policy catalogs_select on public.catalogs for select to authenticated
  using (public.is_org_member(organization_id));
drop policy if exists catalogs_write on public.catalogs;
create policy catalogs_write on public.catalogs for all to authenticated
  using (public.can_write_org(organization_id)) with check (public.can_write_org(organization_id));
