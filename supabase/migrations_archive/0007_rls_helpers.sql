-- ═══════════════════════════════════════════════════════════════
--  0007 — Funciones auxiliares para RLS
--  SECURITY DEFINER + search_path fijo: leen organization_members SIN activar
--  las policies de esa tabla → evitan recursión. STABLE para cachear por query.
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- ¿El usuario autenticado es miembro (cualquier rol) de la organización?
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

-- ¿El usuario tiene alguno de esos roles en la organización?
create or replace function public.has_org_role(org uuid, roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any(roles)
  );
$$;

-- ¿Puede ESCRIBIR en la organización? (owner/trainer; demo_viewer NO)
create or replace function public.can_write_org(org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_org_role(org, array['owner','trainer']);
$$;

-- Id del cliente (fila en users) vinculado al usuario Auth actual (o NULL).
create or replace function public.current_client_id()
returns text language sql stable security definer set search_path = public as $$
  select id from public.users where auth_user_id = auth.uid() limit 1;
$$;

-- ¿El usuario actual comparte alguna organización con "other" (auth uid)?
create or replace function public.shares_org_with(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1
    from public.organization_members a
    join public.organization_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- Propiedad de la cadena de rutina por parte del cliente actual (para lectura).
create or replace function public.client_owns_routine(rid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.routines r
    where r.id = rid and r.user_id = public.current_client_id()
  );
$$;

create or replace function public.client_owns_day(did text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.routine_days d
    join public.routines r on r.id = d.routine_id
    where d.id = did and r.user_id = public.current_client_id()
  );
$$;

create or replace function public.client_owns_group(gid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.routine_groups g
    join public.routine_days d on d.id = g.day_id
    join public.routines r on r.id = d.routine_id
    where g.id = gid and r.user_id = public.current_client_id()
  );
$$;

create or replace function public.client_owns_session(sid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.workout_sessions s
    where s.id = sid and s.user_id = public.current_client_id()
  );
$$;

-- Permisos de ejecución (las policies las invocan como el rol que consulta)
grant execute on function
  public.is_org_member(uuid),
  public.has_org_role(uuid, text[]),
  public.can_write_org(uuid),
  public.current_client_id(),
  public.shares_org_with(uuid),
  public.client_owns_routine(text),
  public.client_owns_day(text),
  public.client_owns_group(text),
  public.client_owns_session(text)
to anon, authenticated;
