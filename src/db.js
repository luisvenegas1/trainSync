import { sb } from "./supabase";
import { buildRoutinePayload, isMissingFunctionError } from "./routines/routinePayload";

// Se habilita SOLO después de aplicar la migración 0013 (columna users.avatar_url).
// Por defecto apagado: así userToDb no intenta escribir una columna inexistente y
// el modo legacy sigue funcionando.
const AVATAR_URL_ENABLED =
  String(import.meta.env.VITE_AVATAR_URL_ENABLED || "").toLowerCase() === "on";

// ═══════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════

// Convierte un user de BD (snake_case) al formato que usa la app (camelCase)
export function dbToUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    password: u.password,
    name: u.name,
    role: u.role,
    phone: u.phone || "",
    email: u.email || "",
    cedula: u.cedula || "",
    dob: u.dob || "",
    height: u.height || "",
    notes: u.notes || "",
    activeRoutineId: u.active_routine_id || null,
    avatarUrl: u.avatar_url || "",
    organizationId: u.organization_id || null,
    disabled: u.disabled || false,
    reminderEnabled: u.reminder_enabled !== false, // default true

    plan: {
      type: u.plan_type || "",
      modality: u.plan_modality || "",
      format: u.plan_format || "",
      startDate: u.plan_start_date || "",
      endDate: u.plan_end_date || "",
      price: u.plan_price || "",
      status: u.plan_status || "",
    },
  };
}

// Convierte un user de la app al formato de BD
function userToDb(u) {
  return {
    id: u.id,
    username: u.username,
    password: u.password,
    name: u.name,
    role: u.role || "user",
    phone: u.phone || null,
    email: u.email || null,
    cedula: u.cedula || null,
    dob: u.dob || null,
    height: u.height || null,
    notes: u.notes || null,
    active_routine_id: u.activeRoutineId || null,
    // avatar_url se persiste solo si VITE_AVATAR_URL_ENABLED=on (tras aplicar 0013),
    // para no romper el guardado si la columna aún no existe.
    ...(AVATAR_URL_ENABLED ? { avatar_url: u.avatarUrl || null } : {}),
    disabled: u.disabled || false,
    plan_type: u.plan?.type || null,
    plan_modality: u.plan?.modality || null,
    plan_format: u.plan?.format || null,
    plan_start_date: u.plan?.startDate || null,
    plan_end_date: u.plan?.endDate || null,
    plan_price: u.plan?.price || null,
    plan_status: u.plan?.status || null,
  };
}

// Convierte exercise de BD al formato app
function dbToExercise(e) {
  if (!e) return null;
  return {
    id: e.id,
    name: e.name,
    videoUrl: e.video_url || "",
    muscleGroup: e.muscle_group || "",
    type: e.type || "normal",
    equipment: e.equipment || "Ninguno",
  };
}

// Convierte exercise de app al formato BD
function exerciseToDb(e) {
  return {
    id: e.id,
    name: e.name,
    video_url: e.videoUrl || null,
    muscle_group: e.muscleGroup || null,
    type: e.type || "normal",
    equipment: e.equipment || null,
  };
}

// Convierte una rutina completa de BD (con días/grupos/ejercicios) al formato app
function dbToRoutine(r, days) {
  return {
    id: r.id,
    userId: r.user_id || "",
    title: r.title,
    daysPerWeek: r.days_per_week || 0,
    note: r.note || "",
    warmupStretchIds: r.warmup_stretch_ids || [],
    cooldownStretchIds: r.cooldown_stretch_ids || [],
    warmupMode: r.warmup_mode === "image" ? "image" : "exercises",
    warmupImageUrl: r.warmup_image_url || "",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    days: (days || [])
      .filter((d) => d.routine_id === r.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((d) => ({
        id: d.id,
        label: d.label,
        groups: (d.groups || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((g) => ({
            id: g.id,
            label: g.label,
            restSeconds: g.rest_seconds || 60,
            exercises: (g.exercises || [])
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((ex) => ({
                exId: ex.exercise_id,
                series: ex.series || 3,
                reps: ex.reps || "",
                notes: ex.notes || "",
                weightAmount: ex.weight_amount || "",
                weightUnit: ex.weight_unit || "lbs",
                equipment: ex.equipment || "Ninguno",
                surface: ex.surface || "Ninguno",
              })),
          })),
      })),
  };
}

// Convierte measurement de BD al formato app
function dbToMeasurement(m) {
  return {
    id: m.id,
    clientId: m.client_id,
    date: m.date,
    weight: m.weight || "",
    fat: m.fat || "",
    water: m.water || "",
    imc: m.imc || "",
    visceralFat: m.visceral_fat || "",
    protein: m.protein || "",
    muscleMass: m.muscle_mass || "",
    boneMass: m.bone_mass || "",
    bmi: m.bmi || "",
    metabolicAge: m.metabolic_age || "",
  };
}

function measurementToDb(m) {
  return {
    id: m.id,
    client_id: m.clientId,
    date: m.date,
    weight: m.weight || null,
    fat: m.fat || null,
    water: m.water || null,
    imc: m.imc || null,
    visceral_fat: m.visceralFat || null,
    protein: m.protein || null,
    muscle_mass: m.muscleMass || null,
    bone_mass: m.boneMass || null,
    bmi: m.bmi || null,
    metabolic_age: m.metabolicAge || null,
  };
}

// Convierte payment de BD al formato app
function dbToPayment(p) {
  return {
    id: p.id,
    clientId: p.client_id,
    date: p.date,
    endDate: p.end_date,
    amount: p.amount || "",
    // La columna `period` guarda la cantidad de meses del pago.
    months: p.period != null && p.period !== "" ? Number(p.period) : 1,
    notes: p.notes || "",
  };
}

function paymentToDb(p) {
  return {
    id: p.id,
    client_id: p.clientId,
    date: p.date || null,
    end_date: p.endDate || null,
    amount: p.amount || null,
    period: p.months != null ? p.months : null,
    notes: p.notes || null,
    // organization_id lo autocompleta un trigger desde el cliente (ver migración 0004).
  };
}

// ═══════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════

export async function getUsers() {
  const { data, error } = await sb.from("users").select("*");
  if (error) throw error;
  return data.map(dbToUser);
}

export async function upsertUser(user) {
  const { error } = await sb
    .from("users")
    .upsert(userToDb(user), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteUser(id) {
  const { error } = await sb.from("users").delete().eq("id", id);
  if (error) throw error;
}

// ═══════════════════════════════════════════
// EXERCISES
// ═══════════════════════════════════════════

export async function getExercises() {
  const { data, error } = await sb
    .from("exercises")
    .select("*")
    .order("name");
  if (error) throw error;
  return data.map(dbToExercise);
}

export async function upsertExercise(ex) {
  const { error } = await sb
    .from("exercises")
    .upsert(exerciseToDb(ex), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteExercise(id) {
  const { error } = await sb.from("exercises").delete().eq("id", id);
  if (error) throw error;
}

// ═══════════════════════════════════════════
// ROUTINES (con días, grupos y ejercicios)
// ═══════════════════════════════════════════

export async function getRoutines() {
  // 1. Traer todas las rutinas
  const { data: routines, error: rErr } = await sb
    .from("routines")
    .select("*")
    .order("created_at", { ascending: false });
  if (rErr) throw rErr;
  if (!routines.length) return [];

  // 2. Traer todos los días de esas rutinas
  const routineIds = routines.map((r) => r.id);
  const { data: days, error: dErr } = await sb
    .from("routine_days")
    .select("*")
    .in("routine_id", routineIds)
    .order("sort_order");
  if (dErr) throw dErr;

  // 3. Traer todos los grupos
  const dayIds = days.map((d) => d.id);
  let groups = [];
  if (dayIds.length) {
    const { data: g, error: gErr } = await sb
      .from("routine_groups")
      .select("*")
      .in("day_id", dayIds)
      .order("sort_order");
    if (gErr) throw gErr;
    groups = g;
  }

  // 4. Traer todos los ejercicios de esos grupos
  const groupIds = groups.map((g) => g.id);
  let exercises = [];
  if (groupIds.length) {
    const { data: ex, error: exErr } = await sb
      .from("routine_exercises")
      .select("*")
      .in("group_id", groupIds)
      .order("sort_order");
    if (exErr) throw exErr;
    exercises = ex;
  }

  // 5. Armar la estructura anidada
  const groupsWithEx = groups.map((g) => ({
    ...g,
    exercises: exercises.filter((ex) => ex.group_id === g.id),
  }));
  const daysWithGroups = days.map((d) => ({
    ...d,
    groups: groupsWithEx.filter((g) => g.day_id === d.id),
  }));

  // 6. Asignaciones (a qué usuarios está asignada cada rutina). Falla suave si
  //    aún no se aplicó la migración 0017: usa routine.user_id como asignación única.
  const assignMap = {};
  try {
    const { data: assigns, error: aErr } = await sb
      .from("routine_assignments")
      .select("routine_id,user_id")
      .in("routine_id", routineIds);
    if (!aErr && assigns) {
      for (const a of assigns) {
        (assignMap[a.routine_id] = assignMap[a.routine_id] || []).push(a.user_id);
      }
    }
  } catch {
    /* tabla routine_assignments no disponible todavía */
  }

  return routines.map((r) => {
    const routine = dbToRoutine(r, daysWithGroups);
    const assigned = assignMap[r.id];
    routine.assignedUserIds = assigned && assigned.length ? assigned : r.user_id ? [r.user_id] : [];
    return routine;
  });
}

// Reemplaza el conjunto de usuarios asignados a una rutina (delete + insert).
// El organization_id lo autocompleta un trigger desde la rutina (migración 0017).
export async function setRoutineAssignments(routineId, userIds) {
  await sb.from("routine_assignments").delete().eq("routine_id", routineId);
  const rows = (userIds || []).map((uid) => ({
    id: "rasg_" + Math.random().toString(36).slice(2, 12),
    routine_id: routineId,
    user_id: uid,
  }));
  if (rows.length) {
    const { error } = await sb.from("routine_assignments").insert(rows);
    if (error) throw error;
  }
}

// Guarda una rutina de forma TRANSACCIONAL vía la función Postgres save_routine.
// Si la función aún no existe en la BD (migración 0006 sin aplicar), hace fallback
// al guardado legacy para no romper la app. Cuando 0006 esté aplicada, el guardado
// es atómico: si algo falla, la rutina anterior queda intacta.
export async function upsertRoutine(routine) {
  const payload = buildRoutinePayload(routine);
  const { error } = await sb.rpc("save_routine", { p: payload });
  if (!error) return;
  if (isMissingFunctionError(error)) {
    // La RPC no está disponible todavía: usar el camino legacy.
    return upsertRoutineLegacy(routine);
  }
  // Error real (constraint, etc.): NO caer al legacy (evita corrupción parcial).
  throw error;
}

// Guardado legacy NO transaccional (fallback temporal hasta aplicar 0006).
async function upsertRoutineLegacy(routine) {
  // 1. Guardar la rutina principal
  const { error: rErr } = await sb.from("routines").upsert(
    {
      id: routine.id,
      user_id: routine.userId || null,
      title: routine.title,
      days_per_week: routine.daysPerWeek || 0,
      note: routine.note || null,
      warmup_stretch_ids: routine.warmupStretchIds || [],
      cooldown_stretch_ids: routine.cooldownStretchIds || [],
      warmup_mode: routine.warmupMode === "image" ? "image" : "exercises",
      warmup_image_url: routine.warmupImageUrl || null,
      created_at: routine.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (rErr) throw rErr;

  // 2. Borrar días anteriores (cascade elimina grupos y ejercicios)
  await sb.from("routine_days").delete().eq("routine_id", routine.id);

  // 3. Insertar días, grupos y ejercicios
  for (let di = 0; di < (routine.days || []).length; di++) {
    const day = routine.days[di];
    const { error: dErr } = await sb.from("routine_days").insert({
      id: day.id,
      routine_id: routine.id,
      label: day.label,
      sort_order: di,
    });
    if (dErr) throw dErr;

    for (let gi = 0; gi < (day.groups || []).length; gi++) {
      const group = day.groups[gi];
      const { error: gErr } = await sb.from("routine_groups").insert({
        id: group.id,
        day_id: day.id,
        label: group.label,
        rest_seconds: group.restSeconds || 60,
        sort_order: gi,
      });
      if (gErr) throw gErr;

      for (let ei = 0; ei < (group.exercises || []).length; ei++) {
        const ex = group.exercises[ei];
        const { error: exErr } = await sb.from("routine_exercises").insert({
          id: "rex_" + Math.random().toString(36).slice(2, 10),
          group_id: group.id,
          exercise_id: ex.exId,
          series: ex.series || 3,
          reps: ex.reps || "",
          notes: ex.notes || null,
          weight_amount: ex.weightAmount || null,
          weight_unit: ex.weightUnit || "lbs",
          equipment: ex.equipment || null,
          surface: ex.surface || null,
          sort_order: ei,
        });
        if (exErr) throw exErr;
      }
    }
  }
}

export async function deleteRoutine(id) {
  const { error } = await sb.from("routines").delete().eq("id", id);
  if (error) throw error;
}

// ═══════════════════════════════════════════
// MEASUREMENTS
// ═══════════════════════════════════════════

export async function getMeasurements() {
  const { data, error } = await sb
    .from("measurements")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return data.map(dbToMeasurement);
}

export async function upsertMeasurement(m) {
  const { error } = await sb
    .from("measurements")
    .upsert(measurementToDb(m), { onConflict: "id" });
  if (error) throw error;
}

export async function deleteMeasurement(id) {
  const { error } = await sb.from("measurements").delete().eq("id", id);
  if (error) throw error;
}

// ═══════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════

export async function getPayments() {
  const { data, error } = await sb
    .from("payments")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return data.map(dbToPayment);
}

export async function upsertPayment(p) {
  const { error } = await sb
    .from("payments")
    .upsert(paymentToDb(p), { onConflict: "id" });
  if (error) throw error;
}

export async function deletePayment(id) {
  const { error } = await sb.from("payments").delete().eq("id", id);
  if (error) throw error;
}

// ═══════════════════════════════════════════
// WORKOUT SESSIONS (entrenamientos + pesos usados)
// ═══════════════════════════════════════════

function dbToSession(s, logs) {
  return {
    id: s.id,
    userId: s.user_id,
    routineId: s.routine_id || "",
    dayId: s.day_id || "",
    dayLabel: s.day_label || "",
    startedAt: s.started_at,
    finishedAt: s.finished_at || null,
    status: s.status || "completed",
    createdAt: s.created_at,
    logs: (logs || [])
      .filter((l) => l.session_id === s.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map((l) => ({
        exId: l.exercise_id || "",
        name: l.exercise_name || "",
        series: l.series || "",
        reps: l.reps || "",
        plannedWeight: l.planned_weight || "",
        actualWeight: l.actual_weight || "",
        weightUnit: l.weight_unit || "lbs",
      })),
  };
}

export async function getWorkoutSessions() {
  const { data: sessions, error: sErr } = await sb
    .from("workout_sessions")
    .select("*")
    .order("started_at", { ascending: false });
  if (sErr) throw sErr;
  if (!sessions.length) return [];

  const ids = sessions.map((s) => s.id);
  const { data: logs, error: lErr } = await sb
    .from("workout_logs")
    .select("*")
    .in("session_id", ids)
    .order("sort_order");
  if (lErr) throw lErr;

  return sessions.map((s) => dbToSession(s, logs || []));
}

export async function upsertWorkoutSession(session) {
  // 1. Guardar la sesión principal
  const { error: sErr } = await sb.from("workout_sessions").upsert(
    {
      id: session.id,
      user_id: session.userId,
      routine_id: session.routineId || null,
      day_id: session.dayId || null,
      day_label: session.dayLabel || null,
      started_at: session.startedAt,
      finished_at: session.finishedAt || null,
      status: session.status || "completed",
      created_at: session.createdAt || new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (sErr) throw sErr;

  // 2. Reemplazar logs (borrar anteriores e insertar los nuevos)
  await sb.from("workout_logs").delete().eq("session_id", session.id);

  const logs = session.logs || [];
  if (logs.length) {
    const rows = logs.map((l, i) => ({
      id: "wlog_" + Math.random().toString(36).slice(2, 10),
      session_id: session.id,
      exercise_id: l.exId || null,
      exercise_name: l.name || null,
      series: l.series || null,
      reps: l.reps || null,
      planned_weight: l.plannedWeight || null,
      actual_weight: l.actualWeight || null,
      weight_unit: l.weightUnit || "lbs",
      sort_order: i,
    }));
    const { error: lErr } = await sb.from("workout_logs").insert(rows);
    if (lErr) throw lErr;
  }
}

export async function deleteWorkoutSession(id) {
  const { error } = await sb.from("workout_sessions").delete().eq("id", id);
  if (error) throw error;
}

// ═══════════════════════════════════════════
// CATALOGS (listas editables)
// ═══════════════════════════════════════════

// Devuelve un objeto { category: [labels...] } con las categorías que
// existen en la BD. Las que no existan usan los valores por defecto del código.
// ── Recordatorios de pago (feature Premium) ────────────────────
// Activa/desactiva el recordatorio de un cliente puntual (solo esa columna).
export async function setClientReminder(clientId, enabled) {
  const { error } = await sb.from("users").update({ reminder_enabled: !!enabled }).eq("id", clientId);
  if (error) throw error;
}

// Config de recordatorios de la organización (en organization_settings).
export async function getOrgReminderConfig(orgId) {
  if (!orgId) return { enabled: false, daysBefore: 3 };
  const { data } = await sb
    .from("organization_settings")
    .select("reminders_enabled, reminders_days_before")
    .eq("organization_id", orgId)
    .maybeSingle();
  return { enabled: !!data?.reminders_enabled, daysBefore: data?.reminders_days_before ?? 3 };
}

export async function setOrgReminderConfig(orgId, { enabled, daysBefore }) {
  const { error } = await sb
    .from("organization_settings")
    .upsert({ organization_id: orgId, reminders_enabled: !!enabled, reminders_days_before: Math.max(0, Math.min(30, Number(daysBefore) || 3)) }, { onConflict: "organization_id" });
  if (error) throw error;
}

// ── Administradores / co-entrenadores de la organización ──────────
// Lista los miembros con rol owner/trainer (los "admins") con su nombre de perfil.
export async function getOrgAdmins(orgId) {
  if (!orgId) return [];
  const { data: members, error } = await sb
    .from("organization_members")
    .select("user_id, role, created_at")
    .eq("organization_id", orgId)
    .in("role", ["owner", "trainer"])
    .order("created_at");
  if (error) throw error;
  const ids = (members || []).map((m) => m.user_id);
  const names = {};
  if (ids.length) {
    const { data: p } = await sb.from("profiles").select("id, full_name").in("id", ids);
    for (const x of p || []) names[x.id] = x.full_name;
  }
  return (members || []).map((m) => ({ userId: m.user_id, role: m.role, name: names[m.user_id] || null }));
}

// Quita a un co-entrenador de la organización. Nunca borra al owner (principal):
// se restringe a role='trainer'. Solo el owner puede ejecutarlo (RLS members_write).
export async function removeOrgAdmin(orgId, userId) {
  const { error } = await sb
    .from("organization_members")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .eq("role", "trainer");
  if (error) throw error;
}

// ── Retos (challenges) ───────────────────────────────────────────
function dbToChallenge(c) {
  return {
    id: c.id,
    organizationId: c.organization_id,
    title: c.title,
    metric: c.metric || "most_workouts",
    prize: c.prize || "",
    startsOn: c.starts_on,
    endsOn: c.ends_on,
    visibleToClients: c.visible_to_clients !== false,
    active: c.active !== false,
    createdAt: c.created_at,
  };
}

export async function getChallenges() {
  const { data, error } = await sb
    .from("challenges")
    .select("*")
    .order("starts_on", { ascending: false });
  if (error) throw error;
  return (data || []).map(dbToChallenge);
}

export async function saveChallenge(ch, orgId) {
  const id = ch.id || (crypto?.randomUUID ? crypto.randomUUID() : "ch_" + Math.random().toString(36).slice(2));
  const row = {
    id, organization_id: orgId, title: ch.title, metric: ch.metric || "most_workouts",
    prize: ch.prize || null, starts_on: ch.startsOn, ends_on: ch.endsOn,
    visible_to_clients: ch.visibleToClients !== false, active: ch.active !== false,
  };
  const { error } = await sb.from("challenges").upsert(row, { onConflict: "id" });
  if (error) throw error;
  return id;
}

export async function deleteChallenge(id) {
  const { error } = await sb.from("challenges").delete().eq("id", id);
  if (error) throw error;
}

// ── Gamificación (medallas) por organización ─────────────────────
export async function getOrgGamification(orgId) {
  if (!orgId) return {};
  const { data, error } = await sb
    .from("organization_settings")
    .select("gamification")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data?.gamification || {};
}

export async function setOrgGamification(orgId, config) {
  const clean = {
    enabled: !!config?.enabled,
    weekly: {
      bronze: Math.max(1, Math.round(Number(config?.weekly?.bronze) || 3)),
      silver: Math.max(1, Math.round(Number(config?.weekly?.silver) || 5)),
      gold: Math.max(1, Math.round(Number(config?.weekly?.gold) || 7)),
    },
  };
  const { error } = await sb
    .from("organization_settings")
    .upsert({ organization_id: orgId, gamification: clean }, { onConflict: "organization_id" });
  if (error) throw error;
  return clean;
}

export async function getCatalogs() {
  const { data, error } = await sb
    .from("catalogs")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  const out = {};
  (data || []).forEach((r) => {
    (out[r.category] = out[r.category] || []).push(r.label);
  });
  return out;
}

// Reemplaza toda una categoría por la lista dada
export async function setCatalogCategory(category, labels) {
  await sb.from("catalogs").delete().eq("category", category);
  const rows = (labels || []).map((label, i) => ({
    id: "cat_" + Math.random().toString(36).slice(2, 10),
    category,
    label,
    sort_order: i,
  }));
  if (rows.length) {
    const { error } = await sb.from("catalogs").insert(rows);
    if (error) throw error;
  }
}
