// Convierte una rutina (formato app, camelCase) al payload jsonb que espera
// la función transaccional public.save_routine(p jsonb).
// Módulo PURO (sin efectos) para poder testearlo en aislamiento.
export function buildRoutinePayload(routine) {
  return {
    id: routine.id,
    user_id: routine.userId || null,
    title: routine.title,
    days_per_week: routine.daysPerWeek || 0,
    note: routine.note || null,
    warmup_stretch_ids: routine.warmupStretchIds || [],
    cooldown_stretch_ids: routine.cooldownStretchIds || [],
    warmup_mode: routine.warmupMode === "image" ? "image" : "exercises",
    warmup_image_url: routine.warmupImageUrl || null,
    created_at: routine.createdAt || null,
    days: (routine.days || []).map((d) => ({
      id: d.id,
      label: d.label,
      groups: (d.groups || []).map((g) => ({
        id: g.id,
        label: g.label,
        rest_seconds: g.restSeconds || 60,
        exercises: (g.exercises || []).map((e) => ({
          exercise_id: e.exId,
          series: e.series || 3,
          reps: e.reps || "",
          notes: e.notes || "",
          weight_amount: e.weightAmount || "",
          weight_unit: e.weightUnit || "lbs",
          equipment: e.equipment || "",
          surface: e.surface || "",
        })),
      })),
    })),
  };
}

// ¿El error de la RPC indica que la función aún no existe en la BD?
// (para hacer fallback seguro al guardado legacy mientras no se corra la migración)
export function isMissingFunctionError(error) {
  if (!error) return false;
  const code = error.code || "";
  if (code === "PGRST202" || code === "42883") return true; // no encontrada / undefined_function
  const msg = (error.message || "").toLowerCase();
  return (
    msg.includes("save_routine") &&
    (msg.includes("does not exist") ||
      msg.includes("not find") ||
      msg.includes("schema cache"))
  );
}
