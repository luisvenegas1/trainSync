-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT DELETE, INSERT, SELECT, UPDATE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, USAGE ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON ROUTINES TO service_role;

CREATE FUNCTION public.admin_set_subscription (
  p_org        uuid,
  p_status     text,
  p_period_end timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_grace      timestamp with time zone DEFAULT NULL::timestamp WITH time zone,
  p_plan       text                     DEFAULT NULL::text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.admin_set_subscription(uuid, text, timestamp WITH time zone, timestamp WITH time zone, text) TO anon;

GRANT ALL ON FUNCTION public.admin_set_subscription(uuid, text, timestamp WITH time zone, timestamp WITH time zone, text) TO authenticated;

GRANT ALL ON FUNCTION public.admin_set_subscription(uuid, text, timestamp WITH time zone, timestamp WITH time zone, text) TO service_role;

CREATE FUNCTION public.can_write_org (
  org uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.has_org_role(org, array['owner','trainer']);
$function$;

GRANT ALL ON FUNCTION public.can_write_org(uuid) TO anon;

GRANT ALL ON FUNCTION public.can_write_org(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.can_write_org(uuid) TO service_role;

CREATE FUNCTION public.challenge_leaderboard (
  p_challenge_id uuid
)
  RETURNS TABLE (
    client_id text,
    name      text,
    count     bigint
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
$function$;

GRANT ALL ON FUNCTION public.challenge_leaderboard(uuid) TO anon;

GRANT ALL ON FUNCTION public.challenge_leaderboard(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.challenge_leaderboard(uuid) TO service_role;

CREATE FUNCTION public.client_owns_day (
  did text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists(select 1 from public.routine_days d
                where d.id = did and public.client_owns_routine(d.routine_id));
$function$;

GRANT ALL ON FUNCTION public.client_owns_day(text) TO anon;

GRANT ALL ON FUNCTION public.client_owns_day(text) TO authenticated;

GRANT ALL ON FUNCTION public.client_owns_day(text) TO service_role;

CREATE FUNCTION public.client_owns_group (
  gid text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists(select 1 from public.routine_groups g
                join public.routine_days d on d.id = g.day_id
                where g.id = gid and public.client_owns_routine(d.routine_id));
$function$;

GRANT ALL ON FUNCTION public.client_owns_group(text) TO anon;

GRANT ALL ON FUNCTION public.client_owns_group(text) TO authenticated;

GRANT ALL ON FUNCTION public.client_owns_group(text) TO service_role;

CREATE FUNCTION public.client_owns_routine (
  rid text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists(select 1 from public.routines r
                where r.id = rid and r.user_id = public.current_client_id())
      or exists(select 1 from public.routine_assignments a
                where a.routine_id = rid and a.user_id = public.current_client_id());
$function$;

GRANT ALL ON FUNCTION public.client_owns_routine(text) TO anon;

GRANT ALL ON FUNCTION public.client_owns_routine(text) TO authenticated;

GRANT ALL ON FUNCTION public.client_owns_routine(text) TO service_role;

CREATE FUNCTION public.client_owns_session (
  sid text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists(
    select 1 from public.workout_sessions s
    where s.id = sid and s.user_id = public.current_client_id()
  );
$function$;

GRANT ALL ON FUNCTION public.client_owns_session(text) TO anon;

GRANT ALL ON FUNCTION public.client_owns_session(text) TO authenticated;

GRANT ALL ON FUNCTION public.client_owns_session(text) TO service_role;

CREATE FUNCTION public.current_client_id()
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select id from public.users where auth_user_id = auth.uid() limit 1;
$function$;

GRANT ALL ON FUNCTION public.current_client_id() TO anon;

GRANT ALL ON FUNCTION public.current_client_id() TO authenticated;

GRANT ALL ON FUNCTION public.current_client_id() TO service_role;

CREATE FUNCTION public.current_client_org()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select organization_id from public.users where auth_user_id = auth.uid() limit 1;
$function$;

GRANT ALL ON FUNCTION public.current_client_org() TO anon;

GRANT ALL ON FUNCTION public.current_client_org() TO authenticated;

GRANT ALL ON FUNCTION public.current_client_org() TO service_role;

CREATE FUNCTION public.fn_autofill_catalog_org()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare porg uuid;
begin
  if auth.uid() is null then
    return NEW;
  end if;
  if NEW.organization_id is null then
    select m.organization_id into porg from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','trainer')
    order by m.created_at limit 1;
    NEW.organization_id := porg;
  end if;
  return NEW;
end $function$;

GRANT ALL ON FUNCTION public.fn_autofill_catalog_org() TO anon;

GRANT ALL ON FUNCTION public.fn_autofill_catalog_org() TO authenticated;

GRANT ALL ON FUNCTION public.fn_autofill_catalog_org() TO service_role;

CREATE FUNCTION public.fn_autofill_exercise()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare porg uuid;
begin
  if auth.uid() is null then
    return NEW; -- service_role: biblioteca global / seeds / copias, no tocar
  end if;
  if NEW.organization_id is null then
    select m.organization_id into porg from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','trainer')
    order by m.created_at limit 1;
    NEW.organization_id := porg;
  end if;
  if NEW.visibility is null then
    NEW.visibility := 'organization';
  end if;
  return NEW;
end $function$;

GRANT ALL ON FUNCTION public.fn_autofill_exercise() TO anon;

GRANT ALL ON FUNCTION public.fn_autofill_exercise() TO authenticated;

GRANT ALL ON FUNCTION public.fn_autofill_exercise() TO service_role;

CREATE FUNCTION public.fn_autofill_org()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
declare
  ptable text := TG_ARGV[0];
  pfkcol text := TG_ARGV[1];
  pidval text;
  porg   uuid;
begin
  if NEW.organization_id is not null then
    return NEW;
  end if;
  pidval := (to_jsonb(NEW) ->> pfkcol);
  if pidval is null then
    return NEW;
  end if;
  execute format('select organization_id from public.%I where id = $1', ptable)
    into porg using pidval;
  NEW.organization_id := porg;
  return NEW;
end $function$;

GRANT ALL ON FUNCTION public.fn_autofill_org() TO anon;

GRANT ALL ON FUNCTION public.fn_autofill_org() TO authenticated;

GRANT ALL ON FUNCTION public.fn_autofill_org() TO service_role;

CREATE FUNCTION public.fn_autofill_user_org()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.fn_autofill_user_org() TO anon;

GRANT ALL ON FUNCTION public.fn_autofill_user_org() TO authenticated;

GRANT ALL ON FUNCTION public.fn_autofill_user_org() TO service_role;

CREATE FUNCTION public.has_org_role (
  org   uuid,
  roles text[]
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_superadmin() or exists(
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any(roles)
  );
$function$;

GRANT ALL ON FUNCTION public.has_org_role(uuid, text[]) TO anon;

GRANT ALL ON FUNCTION public.has_org_role(uuid, text[]) TO authenticated;

GRANT ALL ON FUNCTION public.has_org_role(uuid, text[]) TO service_role;

CREATE FUNCTION public.is_org_member (
  org uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_superadmin() or exists(
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$function$;

GRANT ALL ON FUNCTION public.is_org_member(uuid) TO anon;

GRANT ALL ON FUNCTION public.is_org_member(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.is_org_member(uuid) TO service_role;

CREATE FUNCTION public.is_superadmin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$function$;

GRANT ALL ON FUNCTION public.is_superadmin() TO anon;

GRANT ALL ON FUNCTION public.is_superadmin() TO authenticated;

GRANT ALL ON FUNCTION public.is_superadmin() TO service_role;

CREATE FUNCTION public.log_platform_action (
  p_action   text,
  p_org      uuid  DEFAULT NULL::uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
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
end $function$;

GRANT ALL ON FUNCTION public.log_platform_action(text, uuid, jsonb) TO anon;

GRANT ALL ON FUNCTION public.log_platform_action(text, uuid, jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.log_platform_action(text, uuid, jsonb) TO service_role;

CREATE FUNCTION public.org_operational_allowed (
  org uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select public.is_superadmin() or public.subscription_usable(org);
$function$;

GRANT ALL ON FUNCTION public.org_operational_allowed(uuid) TO anon;

GRANT ALL ON FUNCTION public.org_operational_allowed(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.org_operational_allowed(uuid) TO service_role;

CREATE FUNCTION public.save_routine (
  p jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  v_routine_id text := p->>'id';
  v_user_id    text := nullif(p->>'user_id','');
  v_org        uuid;
  d jsonb; g jsonb; e jsonb;
  d_id text; g_id text;
  di int := 0; gi int := 0; ei int := 0;
begin
  if v_routine_id is null then
    raise exception 'save_routine: falta id de rutina';
  end if;

  if v_user_id is not null then
    select organization_id into v_org from public.users where id = v_user_id;
  end if;
  if v_org is null then
    select m.organization_id into v_org
    from public.organization_members m
    where m.user_id = auth.uid() and m.role in ('owner','trainer')
    order by m.created_at
    limit 1;
  end if;

  insert into public.routines
    (id, user_id, title, days_per_week, note, warmup_stretch_ids, cooldown_stretch_ids,
     warmup_mode, warmup_image_url, organization_id, created_at, updated_at)
  values
    (v_routine_id, v_user_id, p->>'title', coalesce((p->>'days_per_week')::int, 0),
     nullif(p->>'note',''),
     coalesce((select array_agg(x) from jsonb_array_elements_text(p->'warmup_stretch_ids') as t(x)), '{}'::text[]),
     coalesce((select array_agg(x) from jsonb_array_elements_text(p->'cooldown_stretch_ids') as t(x)), '{}'::text[]),
     coalesce(nullif(p->>'warmup_mode',''), 'exercises'),
     nullif(p->>'warmup_image_url',''),
     v_org, coalesce((p->>'created_at')::timestamptz, now()), now())
  on conflict (id) do update set
    user_id              = excluded.user_id,
    title                = excluded.title,
    days_per_week        = excluded.days_per_week,
    note                 = excluded.note,
    warmup_stretch_ids   = excluded.warmup_stretch_ids,
    cooldown_stretch_ids = excluded.cooldown_stretch_ids,
    warmup_mode          = excluded.warmup_mode,
    warmup_image_url     = excluded.warmup_image_url,
    organization_id      = coalesce(excluded.organization_id, public.routines.organization_id),
    updated_at           = now();

  delete from public.routine_days where routine_id = v_routine_id;

  di := 0;
  for d in select value from jsonb_array_elements(coalesce(p->'days','[]'::jsonb)) as t(value) loop
    d_id := d->>'id';
    insert into public.routine_days (id, routine_id, label, sort_order, organization_id)
    values (d_id, v_routine_id, d->>'label', di, v_org);

    gi := 0;
    for g in select value from jsonb_array_elements(coalesce(d->'groups','[]'::jsonb)) as t(value) loop
      g_id := g->>'id';
      insert into public.routine_groups (id, day_id, label, rest_seconds, sort_order, organization_id)
      values (g_id, d_id, g->>'label', coalesce((g->>'rest_seconds')::int, 60), gi, v_org);

      ei := 0;
      for e in select value from jsonb_array_elements(coalesce(g->'exercises','[]'::jsonb)) as t(value) loop
        insert into public.routine_exercises
          (id, group_id, exercise_id, series, reps, notes, weight_amount, weight_unit,
           equipment, surface, sort_order, organization_id)
        values
          ('rex_' || substr(md5(random()::text || clock_timestamp()::text), 1, 8),
           g_id, e->>'exercise_id', coalesce((e->>'series')::int, 3), e->>'reps',
           nullif(e->>'notes',''), nullif(e->>'weight_amount',''),
           coalesce(e->>'weight_unit','lbs'), nullif(e->>'equipment',''),
           nullif(e->>'surface',''), ei, v_org);
        ei := ei + 1;
      end loop;
      gi := gi + 1;
    end loop;
    di := di + 1;
  end loop;
end $function$;

GRANT ALL ON FUNCTION public.save_routine(jsonb) TO anon;

GRANT ALL ON FUNCTION public.save_routine(jsonb) TO authenticated;

GRANT ALL ON FUNCTION public.save_routine(jsonb) TO service_role;

CREATE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
begin
  new.updated_at = now();
  return new;
end $function$;

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;

GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;

GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;

CREATE FUNCTION public.shares_org_with (
  other uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select exists(
    select 1
    from public.organization_members a
    join public.organization_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$function$;

GRANT ALL ON FUNCTION public.shares_org_with(uuid) TO anon;

GRANT ALL ON FUNCTION public.shares_org_with(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.shares_org_with(uuid) TO service_role;

CREATE FUNCTION public.subscription_usable (
  org uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
  select coalesce((
    select (s.status in ('trial','active'))
        or (s.grace_period_ends_at is not null and now() < s.grace_period_ends_at)
    from public.organization_subscriptions s
    where s.organization_id = org
  ), true);
$function$;

GRANT ALL ON FUNCTION public.subscription_usable(uuid) TO anon;

GRANT ALL ON FUNCTION public.subscription_usable(uuid) TO authenticated;

GRANT ALL ON FUNCTION public.subscription_usable(uuid) TO service_role;

CREATE TABLE public.catalogs (
  id              text    NOT NULL,
  category        text    NOT NULL,
  label           text    NOT NULL,
  sort_order      integer DEFAULT 0,
  organization_id uuid
);

ALTER TABLE public.catalogs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.catalogs
  ADD CONSTRAINT catalogs_pkey PRIMARY KEY (id);

GRANT ALL ON public.catalogs TO anon;

GRANT ALL ON public.catalogs TO authenticated;

GRANT ALL ON public.catalogs TO service_role;

CREATE INDEX catalogs_category_idx ON public.catalogs (category);

CREATE INDEX catalogs_org_idx ON public.catalogs (organization_id);

CREATE TRIGGER trg_autofill_catalog_org
  BEFORE INSERT ON public.catalogs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_catalog_org();

CREATE POLICY catalogs_select ON public.catalogs
  FOR SELECT
  TO authenticated
  USING ((public.is_org_member(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE POLICY catalogs_write ON public.catalogs
  TO authenticated
  USING ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE POLICY demo_anon_read ON public.catalogs
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE TABLE public.challenges (
  id                 uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id    uuid                     NOT NULL,
  title              text                     NOT NULL,
  metric             text                     DEFAULT 'most_workouts'::text NOT NULL,
  prize              text,
  starts_on          date                     NOT NULL,
  ends_on            date                     NOT NULL,
  visible_to_clients boolean                  DEFAULT true NOT NULL,
  active             boolean                  DEFAULT true NOT NULL,
  created_at         timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.challenges
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_pkey PRIMARY KEY (id);

GRANT ALL ON public.challenges TO anon;

GRANT ALL ON public.challenges TO authenticated;

GRANT ALL ON public.challenges TO service_role;

CREATE INDEX challenges_org_idx ON public.challenges (organization_id);

CREATE POLICY challenges_select ON public.challenges
  FOR SELECT
  TO authenticated
  USING ((public.is_org_member(organization_id) OR (organization_id = public.current_client_org())));

CREATE POLICY challenges_write ON public.challenges
  TO authenticated
  USING (public.can_write_org(organization_id))
  WITH CHECK (public.can_write_org(organization_id));

CREATE TABLE public.exercises (
  id              text                     NOT NULL,
  name            text                     NOT NULL,
  video_url       text,
  muscle_group    text,
  type            text                     DEFAULT 'normal'::text NOT NULL,
  equipment       text,
  created_at      timestamp with time zone DEFAULT now(),
  organization_id uuid,
  visibility      text,
  description     text,
  image_url       text,
  instructions    text,
  created_by      uuid,
  updated_at      timestamp with time zone DEFAULT now()
);

ALTER TABLE public.exercises
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_pkey PRIMARY KEY (id);

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_visibility_chk CHECK (visibility IS NULL OR (visibility = ANY (ARRAY['global'::text, 'organization'::text])));

GRANT ALL ON public.exercises TO anon;

GRANT ALL ON public.exercises TO authenticated;

GRANT ALL ON public.exercises TO service_role;

CREATE INDEX exercises_org_idx ON public.exercises (organization_id);

CREATE INDEX exercises_visibility_idx ON public.exercises (visibility);

CREATE INDEX exercises_lib_idx ON public.exercises (visibility, organization_id);

CREATE TRIGGER trg_autofill_exercise
  BEFORE INSERT ON public.exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_exercise();

CREATE POLICY demo_anon_read ON public.exercises
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY exercises_delete ON public.exercises
  FOR DELETE
  TO authenticated
  USING (((visibility = 'organization'::text) AND public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE POLICY exercises_insert ON public.exercises
  FOR INSERT
  TO authenticated
  WITH CHECK (((visibility = 'organization'::text) AND public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE POLICY exercises_select ON public.exercises
  FOR SELECT
  TO authenticated
  USING
    (((visibility = 'global'::text) OR public.is_superadmin() OR (public.is_org_member(organization_id) AND public.org_operational_allowed(organization_id)) OR ((organization_id =
    public.current_client_org()) AND public.org_operational_allowed(organization_id))));

CREATE POLICY exercises_update ON public.exercises
  FOR UPDATE
  TO authenticated
  USING (((visibility = 'organization'::text) AND public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK (((visibility = 'organization'::text) AND public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.measurements (
  id              text                     NOT NULL,
  client_id       text,
  date            date                     NOT NULL,
  weight          text,
  fat             text,
  water           text,
  imc             text,
  visceral_fat    text,
  protein         text,
  muscle_mass     text,
  bone_mass       text,
  bmi             text,
  metabolic_age   text,
  created_at      timestamp with time zone DEFAULT now(),
  organization_id uuid
);

ALTER TABLE public.measurements
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.measurements
  ADD CONSTRAINT measurements_pkey PRIMARY KEY (id);

GRANT ALL ON public.measurements TO anon;

GRANT ALL ON public.measurements TO authenticated;

GRANT ALL ON public.measurements TO service_role;

CREATE INDEX measurements_org_idx ON public.measurements (organization_id);

CREATE INDEX idx_measurements_client ON public.measurements (client_id);

CREATE TRIGGER trg_org_measurements
  BEFORE INSERT OR UPDATE ON public.measurements
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_org('users', 'client_id');

CREATE POLICY demo_anon_read ON public.measurements
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY measurements_select ON public.measurements
  FOR SELECT
  TO authenticated
  USING (((public.is_org_member(organization_id) OR (client_id = public.current_client_id())) AND public.org_operational_allowed(organization_id)));

CREATE POLICY measurements_write ON public.measurements
  TO authenticated
  USING ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.organization_members (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  user_id         uuid                     NOT NULL,
  role            text                     DEFAULT 'trainer'::text NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.organization_members
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_members
  ADD CONSTRAINT org_members_unique UNIQUE (organization_id, user_id);

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.organization_members TO anon;

GRANT ALL ON public.organization_members TO authenticated;

GRANT ALL ON public.organization_members TO service_role;

CREATE INDEX org_members_org_idx ON public.organization_members (organization_id);

CREATE INDEX org_members_user_idx ON public.organization_members (user_id);

CREATE POLICY members_select ON public.organization_members
  FOR SELECT
  TO authenticated
  USING (((user_id = auth.uid()) OR public.is_org_member(organization_id) OR public.is_superadmin()));

CREATE POLICY members_write ON public.organization_members
  TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner'::text]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::text]));

CREATE TABLE public.organization_settings (
  organization_id       uuid                     NOT NULL,
  display_name          text,
  logo_url              text,
  trainer_photo_url     text,
  primary_color         text,
  secondary_color       text,
  tagline               text,
  bio                   text,
  whatsapp              text,
  instagram             text,
  contact_email         text,
  call_to_action        text,
  created_at            timestamp with time zone DEFAULT now() NOT NULL,
  updated_at            timestamp with time zone DEFAULT now() NOT NULL,
  favicon_url           text,
  reminders_enabled     boolean                  DEFAULT false NOT NULL,
  reminders_days_before integer                  DEFAULT 3 NOT NULL,
  feature_overrides     jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  gamification          jsonb                    DEFAULT '{}'::jsonb NOT NULL
);

ALTER TABLE public.organization_settings
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_pkey PRIMARY KEY (organization_id);

ALTER TABLE public.organization_settings
  ADD CONSTRAINT reminders_days_before_range CHECK (reminders_days_before >= 0 AND reminders_days_before <= 30);

GRANT ALL ON public.organization_settings TO anon;

GRANT ALL ON public.organization_settings TO authenticated;

GRANT ALL ON public.organization_settings TO service_role;

CREATE TRIGGER trg_org_settings_updated
  BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY demo_anon_read ON public.organization_settings
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY org_settings_select ON public.organization_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY org_settings_write ON public.organization_settings
  TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['owner'::text]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['owner'::text]));

CREATE TABLE public.organization_subscriptions (
  id                       uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id          uuid                     NOT NULL,
  plan                     text                     DEFAULT 'base'::text NOT NULL,
  status                   text                     DEFAULT 'trial'::text NOT NULL,
  current_period_end       timestamp with time zone,
  grace_period_ends_at     timestamp with time zone,
  provider                 text                     DEFAULT 'manual'::text NOT NULL,
  provider_customer_id     text,
  provider_subscription_id text,
  created_at               timestamp with time zone DEFAULT now() NOT NULL,
  updated_at               timestamp with time zone DEFAULT now() NOT NULL,
  admin_notes              text,
  started_at               timestamp with time zone
);

ALTER TABLE public.organization_subscriptions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT org_subs_org_unique UNIQUE (organization_id);

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT org_subs_status_chk CHECK (status = ANY (ARRAY['trial'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'canceled'::text]));

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_pkey PRIMARY KEY (id);

GRANT ALL ON public.organization_subscriptions TO anon;

GRANT ALL ON public.organization_subscriptions TO authenticated;

GRANT ALL ON public.organization_subscriptions TO service_role;

CREATE TRIGGER trg_org_subs_updated
  BEFORE UPDATE ON public.organization_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY demo_anon_read ON public.organization_subscriptions
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY org_subs_select ON public.organization_subscriptions
  FOR SELECT
  TO authenticated
  USING ((public.is_org_member(organization_id) OR public.is_superadmin() OR (organization_id = public.current_client_org())));

CREATE POLICY org_subs_write ON public.organization_subscriptions
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TABLE public.organizations (
  id          uuid                     DEFAULT gen_random_uuid() NOT NULL,
  name        text                     NOT NULL,
  slug        text                     NOT NULL,
  tenant_type text                     DEFAULT 'production'::text NOT NULL,
  status      text                     DEFAULT 'active'::text NOT NULL,
  created_at  timestamp with time zone DEFAULT now() NOT NULL,
  updated_at  timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.organizations
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);

ALTER TABLE public.catalogs
  ADD CONSTRAINT catalogs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.exercises
  ADD CONSTRAINT exercises_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.measurements
  ADD CONSTRAINT measurements_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organization_settings
  ADD CONSTRAINT organization_settings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_slug_key UNIQUE (slug);

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_status_chk CHECK (status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text]));

ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_tenant_type_chk CHECK (tenant_type = ANY (ARRAY['production'::text, 'demo'::text, 'test'::text]));

GRANT ALL ON public.organizations TO anon;

GRANT ALL ON public.organizations TO authenticated;

GRANT ALL ON public.organizations TO service_role;

CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY demo_anon_read_org ON public.organizations
  FOR SELECT
  TO anon
  USING (((slug = 'titotrainer'::text) AND (tenant_type = 'demo'::text)));

CREATE POLICY org_select ON public.organizations
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY org_update ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (public.has_org_role(id, ARRAY['owner'::text]))
  WITH CHECK (public.has_org_role(id, ARRAY['owner'::text]));

CREATE TABLE public.payment_reminder_logs (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  client_id       text                     NOT NULL,
  due_date        date                     NOT NULL,
  reminder_type   text                     DEFAULT 'pre_due'::text NOT NULL,
  scheduled_for   date                     NOT NULL,
  sent_at         timestamp with time zone,
  status          text                     DEFAULT 'pending'::text NOT NULL,
  error_message   text,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.payment_reminder_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payment_reminder_logs
  ADD CONSTRAINT payment_reminder_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.payment_reminder_logs
  ADD CONSTRAINT payment_reminder_logs_pkey PRIMARY KEY (id);

ALTER TABLE public.payment_reminder_logs
  ADD CONSTRAINT payment_reminder_unique UNIQUE (organization_id, client_id, due_date, reminder_type);

GRANT ALL ON public.payment_reminder_logs TO anon;

GRANT ALL ON public.payment_reminder_logs TO authenticated;

GRANT ALL ON public.payment_reminder_logs TO service_role;

CREATE INDEX payment_reminder_org_idx ON public.payment_reminder_logs (organization_id);

CREATE INDEX payment_reminder_sched_idx ON public.payment_reminder_logs (scheduled_for);

CREATE POLICY payment_reminder_select ON public.payment_reminder_logs
  FOR SELECT
  TO authenticated
  USING ((public.is_superadmin() OR public.is_org_member(organization_id)));

CREATE TABLE public.payments (
  id              text                     NOT NULL,
  client_id       text,
  date            date,
  end_date        date,
  amount          text,
  period          text,
  notes           text,
  created_at      timestamp with time zone DEFAULT now(),
  organization_id uuid
);

ALTER TABLE public.payments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.payments
  ADD CONSTRAINT payments_pkey PRIMARY KEY (id);

GRANT ALL ON public.payments TO anon;

GRANT ALL ON public.payments TO authenticated;

GRANT ALL ON public.payments TO service_role;

CREATE INDEX payments_org_idx ON public.payments (organization_id);

CREATE INDEX idx_payments_client ON public.payments (client_id);

CREATE TRIGGER trg_org_payments
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_org('users', 'client_id');

CREATE POLICY demo_anon_read ON public.payments
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY payments_select ON public.payments
  FOR SELECT
  TO authenticated
  USING (((public.is_org_member(organization_id) OR (client_id = public.current_client_id())) AND public.org_operational_allowed(organization_id)));

CREATE POLICY payments_write ON public.payments
  TO authenticated
  USING ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.platform_admins (
  user_id    uuid                     NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.platform_admins
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_admins
  ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);

ALTER TABLE public.platform_admins
  ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

GRANT ALL ON public.platform_admins TO anon;

GRANT ALL ON public.platform_admins TO authenticated;

GRANT ALL ON public.platform_admins TO service_role;

CREATE POLICY platform_admins_all ON public.platform_admins
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TABLE public.platform_audit_log (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  actor_user_id   uuid,
  action          text                     NOT NULL,
  organization_id uuid,
  metadata        jsonb                    DEFAULT '{}'::jsonb NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.platform_audit_log
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_audit_log
  ADD CONSTRAINT platform_audit_log_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES auth.users(id);

ALTER TABLE public.platform_audit_log
  ADD CONSTRAINT platform_audit_log_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.platform_audit_log
  ADD CONSTRAINT platform_audit_log_pkey PRIMARY KEY (id);

GRANT ALL ON public.platform_audit_log TO anon;

GRANT ALL ON public.platform_audit_log TO authenticated;

GRANT ALL ON public.platform_audit_log TO service_role;

CREATE INDEX platform_audit_org_idx ON public.platform_audit_log (organization_id);

CREATE INDEX platform_audit_created_idx ON public.platform_audit_log (created_at DESC);

CREATE INDEX platform_audit_action_idx ON public.platform_audit_log (action);

CREATE POLICY platform_audit_all ON public.platform_audit_log
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TABLE public.platform_payments (
  id              uuid                     DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid                     NOT NULL,
  amount          numeric(12,2)            NOT NULL,
  currency        text                     DEFAULT 'CRC'::text NOT NULL,
  paid_at         date                     NOT NULL,
  period_start    date,
  period_end      date,
  method          text                     DEFAULT 'manual'::text NOT NULL,
  reference       text,
  note            text,
  recorded_by     uuid,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.platform_payments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_payments
  ADD CONSTRAINT platform_payments_amount_check CHECK (amount > 0::numeric);

ALTER TABLE public.platform_payments
  ADD CONSTRAINT platform_payments_method_chk
    CHECK (method = ANY (ARRAY['manual'::text, 'sinpe'::text, 'transfer'::text, 'cash'::text, 'card'::text, 'stripe'::text, 'other'::text]));

ALTER TABLE public.platform_payments
  ADD CONSTRAINT platform_payments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.platform_payments
  ADD CONSTRAINT platform_payments_pkey PRIMARY KEY (id);

ALTER TABLE public.platform_payments
  ADD CONSTRAINT platform_payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);

GRANT ALL ON public.platform_payments TO anon;

GRANT ALL ON public.platform_payments TO authenticated;

GRANT ALL ON public.platform_payments TO service_role;

CREATE INDEX platform_payments_org_idx ON public.platform_payments (organization_id);

CREATE INDEX platform_payments_paid_at_idx ON public.platform_payments (paid_at DESC);

CREATE POLICY platform_payments_all ON public.platform_payments
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE TABLE public.profiles (
  id         uuid                     NOT NULL,
  full_name  text,
  avatar_url text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.profiles
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);

GRANT ALL ON public.profiles TO anon;

GRANT ALL ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((id = auth.uid()));

CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  TO authenticated
  USING (((id = auth.uid()) OR public.shares_org_with(id) OR public.is_superadmin()));

CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((id = auth.uid()))
  WITH CHECK ((id = auth.uid()));

CREATE TABLE public.routine_assignments (
  id              text                     NOT NULL,
  routine_id      text                     NOT NULL,
  user_id         text                     NOT NULL,
  organization_id uuid,
  created_at      timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE public.routine_assignments
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.routine_assignments
  ADD CONSTRAINT routine_assignments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.routine_assignments
  ADD CONSTRAINT routine_assignments_pkey PRIMARY KEY (id);

ALTER TABLE public.routine_assignments
  ADD CONSTRAINT routine_assignments_unique UNIQUE (routine_id, user_id);

GRANT ALL ON public.routine_assignments TO anon;

GRANT ALL ON public.routine_assignments TO authenticated;

GRANT ALL ON public.routine_assignments TO service_role;

CREATE INDEX routine_assignments_user_idx ON public.routine_assignments (user_id);

CREATE INDEX routine_assignments_routine_idx ON public.routine_assignments (routine_id);

CREATE INDEX routine_assignments_org_idx ON public.routine_assignments (organization_id);

CREATE TRIGGER trg_org_rassign
  BEFORE INSERT OR UPDATE ON public.routine_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_org('routines', 'routine_id');

CREATE POLICY demo_anon_read ON public.routine_assignments
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY rassign_select ON public.routine_assignments
  FOR SELECT
  TO authenticated
  USING (((public.is_org_member(organization_id) OR (user_id = public.current_client_id())) AND public.org_operational_allowed(organization_id)));

CREATE POLICY rassign_write ON public.routine_assignments
  TO authenticated
  USING ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.routine_days (
  id              text    DEFAULT (gen_random_uuid())::text NOT NULL,
  routine_id      text,
  label           text    NOT NULL,
  sort_order      integer DEFAULT 0,
  organization_id uuid
);

ALTER TABLE public.routine_days
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.routine_days
  ADD CONSTRAINT routine_days_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.routine_days
  ADD CONSTRAINT routine_days_pkey PRIMARY KEY (id);

GRANT ALL ON public.routine_days TO anon;

GRANT ALL ON public.routine_days TO authenticated;

GRANT ALL ON public.routine_days TO service_role;

CREATE INDEX idx_routine_days_routine ON public.routine_days (routine_id);

CREATE TRIGGER trg_org_rdays
  BEFORE INSERT OR UPDATE ON public.routine_days
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_org('routines', 'routine_id');

CREATE POLICY demo_anon_read ON public.routine_days
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY rdays_select ON public.routine_days
  FOR SELECT
  TO authenticated
  USING (((public.is_org_member(organization_id) OR public.client_owns_day(id)) AND public.org_operational_allowed(organization_id)));

CREATE POLICY rdays_write ON public.routine_days
  TO authenticated
  USING ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.routine_exercises (
  id              text    DEFAULT (gen_random_uuid())::text NOT NULL,
  group_id        text,
  exercise_id     text,
  series          integer DEFAULT 3,
  reps            text,
  notes           text,
  weight_amount   text,
  weight_unit     text    DEFAULT 'lbs'::text,
  equipment       text,
  surface         text,
  sort_order      integer DEFAULT 0,
  organization_id uuid
);

ALTER TABLE public.routine_exercises
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.routine_exercises
  ADD CONSTRAINT routine_exercises_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES public.exercises(id) ON DELETE SET NULL;

ALTER TABLE public.routine_exercises
  ADD CONSTRAINT routine_exercises_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.routine_exercises
  ADD CONSTRAINT routine_exercises_pkey PRIMARY KEY (id);

GRANT ALL ON public.routine_exercises TO anon;

GRANT ALL ON public.routine_exercises TO authenticated;

GRANT ALL ON public.routine_exercises TO service_role;

CREATE INDEX idx_routine_ex_group ON public.routine_exercises (group_id);

CREATE TRIGGER trg_org_rexercises
  BEFORE INSERT OR UPDATE ON public.routine_exercises
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_org('routine_groups', 'group_id');

CREATE POLICY demo_anon_read ON public.routine_exercises
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY rexercises_select ON public.routine_exercises
  FOR SELECT
  TO authenticated
  USING (((public.is_org_member(organization_id) OR public.client_owns_group(group_id)) AND public.org_operational_allowed(organization_id)));

CREATE POLICY rexercises_write ON public.routine_exercises
  TO authenticated
  USING ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.routine_groups (
  id              text    DEFAULT (gen_random_uuid())::text NOT NULL,
  day_id          text,
  label           text    NOT NULL,
  rest_seconds    integer DEFAULT 60,
  sort_order      integer DEFAULT 0,
  organization_id uuid
);

ALTER TABLE public.routine_groups
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.routine_groups
  ADD CONSTRAINT routine_groups_day_id_fkey FOREIGN KEY (day_id) REFERENCES public.routine_days(id) ON DELETE CASCADE;

ALTER TABLE public.routine_groups
  ADD CONSTRAINT routine_groups_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.routine_groups
  ADD CONSTRAINT routine_groups_pkey PRIMARY KEY (id);

ALTER TABLE public.routine_exercises
  ADD CONSTRAINT routine_exercises_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.routine_groups(id) ON DELETE CASCADE;

GRANT ALL ON public.routine_groups TO anon;

GRANT ALL ON public.routine_groups TO authenticated;

GRANT ALL ON public.routine_groups TO service_role;

CREATE INDEX idx_routine_groups_day ON public.routine_groups (day_id);

CREATE TRIGGER trg_org_rgroups
  BEFORE INSERT OR UPDATE ON public.routine_groups
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_org('routine_days', 'day_id');

CREATE POLICY demo_anon_read ON public.routine_groups
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY rgroups_select ON public.routine_groups
  FOR SELECT
  TO authenticated
  USING (((public.is_org_member(organization_id) OR public.client_owns_group(id)) AND public.org_operational_allowed(organization_id)));

CREATE POLICY rgroups_write ON public.routine_groups
  TO authenticated
  USING ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.routines (
  id                   text                     DEFAULT (gen_random_uuid())::text NOT NULL,
  user_id              text,
  title                text                     NOT NULL,
  days_per_week        integer                  DEFAULT 0,
  note                 text,
  warmup_stretch_ids   text[],
  cooldown_stretch_ids text[],
  created_at           timestamp with time zone DEFAULT now(),
  updated_at           timestamp with time zone DEFAULT now(),
  organization_id      uuid,
  warmup_mode          text                     DEFAULT 'exercises'::text NOT NULL,
  warmup_image_url     text
);

ALTER TABLE public.routines
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.routines
  ADD CONSTRAINT routines_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.routines
  ADD CONSTRAINT routines_pkey PRIMARY KEY (id);

ALTER TABLE public.routine_assignments
  ADD CONSTRAINT routine_assignments_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;

ALTER TABLE public.routine_days
  ADD CONSTRAINT routine_days_routine_id_fkey FOREIGN KEY (routine_id) REFERENCES public.routines(id) ON DELETE CASCADE;

GRANT ALL ON public.routines TO anon;

GRANT ALL ON public.routines TO authenticated;

GRANT ALL ON public.routines TO service_role;

CREATE INDEX idx_routines_user_id ON public.routines (user_id);

CREATE INDEX routines_org_idx ON public.routines (organization_id);

CREATE POLICY demo_anon_read ON public.routines
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY routines_select ON public.routines
  FOR SELECT
  TO authenticated
  USING ((public.is_superadmin() OR ((public.is_org_member(organization_id) OR public.client_owns_routine(id)) AND public.org_operational_allowed(organization_id))));

CREATE POLICY routines_write ON public.routines
  TO authenticated
  USING ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)))
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.users (
  id                  text                     NOT NULL,
  username            text                     NOT NULL,
  password            text                     NOT NULL,
  name                text                     NOT NULL,
  role                text                     DEFAULT 'user'::text NOT NULL,
  phone               text,
  email               text,
  cedula              text,
  dob                 date,
  height              text,
  notes               text,
  active_routine_id   text,
  plan_type           text,
  plan_modality       text,
  plan_format         text,
  plan_start_date     date,
  plan_end_date       date,
  plan_price          text,
  plan_status         text,
  created_at          timestamp with time zone DEFAULT now(),
  disabled            boolean                  DEFAULT false,
  organization_id     uuid,
  auth_user_id        uuid,
  assigned_trainer_id uuid,
  avatar_url          text,
  reminder_enabled    boolean                  DEFAULT true NOT NULL
);

ALTER TABLE public.users
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users
  ADD CONSTRAINT users_assigned_trainer_id_fkey FOREIGN KEY (assigned_trainer_id) REFERENCES auth.users(id);

ALTER TABLE public.users
  ADD CONSTRAINT users_auth_user_id_fkey FOREIGN KEY (auth_user_id) REFERENCES auth.users(id);

ALTER TABLE public.users
  ADD CONSTRAINT users_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.users
  ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE public.measurements
  ADD CONSTRAINT measurements_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.routine_assignments
  ADD CONSTRAINT routine_assignments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.routines
  ADD CONSTRAINT routines_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE public.users
  ADD CONSTRAINT users_username_key UNIQUE (username);

GRANT ALL ON public.users TO anon;

GRANT ALL ON public.users TO authenticated;

GRANT ALL ON public.users TO service_role;

CREATE INDEX users_auth_idx ON public.users (auth_user_id);

CREATE INDEX users_org_idx ON public.users (organization_id);

CREATE TRIGGER trg_autofill_user_org
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_user_org();

CREATE POLICY demo_anon_read ON public.users
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY users_delete ON public.users
  FOR DELETE
  TO authenticated
  USING ((public.has_org_role(organization_id, ARRAY['owner'::text, 'trainer'::text]) AND public.org_operational_allowed(organization_id)));

CREATE POLICY users_insert ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK ((public.can_write_org(organization_id) AND public.org_operational_allowed(organization_id)));

CREATE POLICY users_select ON public.users
  FOR SELECT
  TO authenticated
  USING ((public.is_superadmin() OR ((public.is_org_member(organization_id) OR (auth_user_id = auth.uid())) AND public.org_operational_allowed(organization_id))));

CREATE POLICY users_update ON public.users
  FOR UPDATE
  TO authenticated
  USING (((public.can_write_org(organization_id) OR (auth_user_id = auth.uid())) AND public.org_operational_allowed(organization_id)))
  WITH CHECK (((public.can_write_org(organization_id) OR (auth_user_id = auth.uid())) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.workout_logs (
  id              text    NOT NULL,
  session_id      text    NOT NULL,
  exercise_id     text,
  exercise_name   text,
  series          text,
  reps            text,
  planned_weight  text,
  actual_weight   text,
  weight_unit     text    DEFAULT 'lbs'::text,
  sort_order      integer DEFAULT 0,
  organization_id uuid
);

ALTER TABLE public.workout_logs
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_pkey PRIMARY KEY (id);

GRANT ALL ON public.workout_logs TO anon;

GRANT ALL ON public.workout_logs TO authenticated;

GRANT ALL ON public.workout_logs TO service_role;

CREATE INDEX workout_logs_exercise_idx ON public.workout_logs (exercise_id);

CREATE INDEX workout_logs_session_idx ON public.workout_logs (session_id);

CREATE TRIGGER trg_org_wlogs
  BEFORE INSERT OR UPDATE ON public.workout_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_org('workout_sessions', 'session_id');

CREATE POLICY demo_anon_read ON public.workout_logs
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY wlogs_select ON public.workout_logs
  FOR SELECT
  TO authenticated
  USING (((public.is_org_member(organization_id) OR public.client_owns_session(session_id)) AND public.org_operational_allowed(organization_id)));

CREATE POLICY wlogs_write ON public.workout_logs
  TO authenticated
  USING (((public.can_write_org(organization_id) OR public.client_owns_session(session_id)) AND public.org_operational_allowed(organization_id)))
  WITH CHECK (((public.can_write_org(organization_id) OR public.client_owns_session(session_id)) AND public.org_operational_allowed(organization_id)));

CREATE TABLE public.workout_sessions (
  id              text                     NOT NULL,
  user_id         text                     NOT NULL,
  routine_id      text,
  day_id          text,
  day_label       text,
  started_at      timestamp with time zone NOT NULL,
  finished_at     timestamp with time zone,
  status          text                     DEFAULT 'completed'::text NOT NULL,
  created_at      timestamp with time zone DEFAULT now() NOT NULL,
  organization_id uuid
);

ALTER TABLE public.workout_sessions
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.workout_sessions
  ADD CONSTRAINT workout_sessions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

ALTER TABLE public.workout_sessions
  ADD CONSTRAINT workout_sessions_pkey PRIMARY KEY (id);

ALTER TABLE public.workout_logs
  ADD CONSTRAINT workout_logs_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.workout_sessions(id) ON DELETE CASCADE;

GRANT ALL ON public.workout_sessions TO anon;

GRANT ALL ON public.workout_sessions TO authenticated;

GRANT ALL ON public.workout_sessions TO service_role;

CREATE INDEX workout_sessions_user_idx ON public.workout_sessions (user_id);

CREATE INDEX workout_sessions_org_idx ON public.workout_sessions (organization_id);

CREATE INDEX workout_sessions_started_idx ON public.workout_sessions (started_at);

CREATE TRIGGER trg_org_wsessions
  BEFORE INSERT OR UPDATE ON public.workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_autofill_org('users', 'user_id');

CREATE POLICY demo_anon_read ON public.workout_sessions
  FOR SELECT
  TO anon
  USING ((organization_id = '22222222-2222-2222-2222-222222222222'::uuid));

CREATE POLICY wsessions_delete ON public.workout_sessions
  FOR DELETE
  TO authenticated
  USING (((public.can_write_org(organization_id) OR (user_id = public.current_client_id())) AND public.org_operational_allowed(organization_id)));

CREATE POLICY wsessions_insert ON public.workout_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (((public.can_write_org(organization_id) OR (user_id = public.current_client_id())) AND public.org_operational_allowed(organization_id)));

CREATE POLICY wsessions_select ON public.workout_sessions
  FOR SELECT
  TO authenticated
  USING (((public.is_org_member(organization_id) OR (user_id = public.current_client_id())) AND public.org_operational_allowed(organization_id)));

CREATE POLICY wsessions_update ON public.workout_sessions
  FOR UPDATE
  TO authenticated
  USING (((public.can_write_org(organization_id) OR (user_id = public.current_client_id())) AND public.org_operational_allowed(organization_id)))
  WITH CHECK (((public.can_write_org(organization_id) OR (user_id = public.current_client_id())) AND public.org_operational_allowed(organization_id)));
