// ═══════════════════════════════════════════════════════════════
//  Último peso usado por ejercicio (módulo PURO).
//  Se deriva del historial de entrenamientos (workout_sessions + logs): al iniciar
//  una rutina, cada ejercicio se precarga con el ÚLTIMO peso que el cliente usó ahí,
//  para que no tenga que acordarse. Los pesos reales (actualWeight) se guardan
//  siempre en LIBRAS, así que el último peso viene en lbs.
// ═══════════════════════════════════════════════════════════════

// Fecha de referencia de una sesión (la más confiable disponible).
function sessionDate(s) {
  return s.finishedAt || s.startedAt || s.createdAt || "";
}

// Último peso real (lbs) que el usuario registró para un ejercicio. { val, unit } o null.
export function lastWeightForExercise(sessions, userId, exId) {
  const mine = (sessions || [])
    .filter((s) => s.userId === userId && (!s.status || s.status === "completed"))
    .sort((a, b) => (sessionDate(a) < sessionDate(b) ? 1 : -1)); // más reciente primero
  for (const s of mine) {
    const log = (s.logs || []).find((l) => l.exId === exId && l.actualWeight !== "" && l.actualWeight != null && Number(l.actualWeight) > 0);
    if (log) return { val: String(log.actualWeight), unit: log.weightUnit || "lbs" };
  }
  return null;
}

// Valor inicial de peso para un ejercicio al iniciar el entrenamiento:
// usa el último peso usado (lbs) si existe; si no, el que puso el coach (su unidad).
export function initialWeightFor(sessions, userId, ex) {
  const last = lastWeightForExercise(sessions, userId, ex.exId);
  if (last) return { val: last.val, unit: last.unit, fromHistory: true };
  return { val: ex.plannedWeight ? String(ex.plannedWeight) : "", unit: ex.weightUnit || "lbs", fromHistory: false };
}
