-- ═══════════════════════════════════════════════════════════════
--  0004 — Triggers que autocompletan organization_id desde el "padre"
--  Evitan registros huérfanos aunque el frontend no envíe la organización.
--  Aditiva e idempotente. NO ejecutar en prod sin autorización.
-- ═══════════════════════════════════════════════════════════════

-- Función genérica: si NEW.organization_id es NULL, lo toma del padre.
--   TG_ARGV[0] = tabla padre (en public)
--   TG_ARGV[1] = columna FK en NEW que apunta al id del padre
create or replace function public.fn_autofill_org()
returns trigger language plpgsql as $$
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
end $$;

-- measurements.client_id -> users
drop trigger if exists trg_org_measurements on public.measurements;
create trigger trg_org_measurements before insert or update on public.measurements
  for each row execute function public.fn_autofill_org('users','client_id');

-- payments.client_id -> users
drop trigger if exists trg_org_payments on public.payments;
create trigger trg_org_payments before insert or update on public.payments
  for each row execute function public.fn_autofill_org('users','client_id');

-- workout_sessions.user_id -> users
drop trigger if exists trg_org_wsessions on public.workout_sessions;
create trigger trg_org_wsessions before insert or update on public.workout_sessions
  for each row execute function public.fn_autofill_org('users','user_id');

-- workout_logs.session_id -> workout_sessions
drop trigger if exists trg_org_wlogs on public.workout_logs;
create trigger trg_org_wlogs before insert or update on public.workout_logs
  for each row execute function public.fn_autofill_org('workout_sessions','session_id');

-- routine_days.routine_id -> routines
drop trigger if exists trg_org_rdays on public.routine_days;
create trigger trg_org_rdays before insert or update on public.routine_days
  for each row execute function public.fn_autofill_org('routines','routine_id');

-- routine_groups.day_id -> routine_days
drop trigger if exists trg_org_rgroups on public.routine_groups;
create trigger trg_org_rgroups before insert or update on public.routine_groups
  for each row execute function public.fn_autofill_org('routine_days','day_id');

-- routine_exercises.group_id -> routine_groups
drop trigger if exists trg_org_rexercises on public.routine_exercises;
create trigger trg_org_rexercises before insert or update on public.routine_exercises
  for each row execute function public.fn_autofill_org('routine_groups','group_id');

-- NOTA: users, routines, exercises y catalogs reciben organization_id desde la
-- aplicación (tienen contexto de tenant). routines sin cliente asignado quedan
-- con el org del trainer que la crea (se setea en la capa de app / RPC 0006).
