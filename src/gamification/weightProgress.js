// ═══════════════════════════════════════════════════════════════
//  Gamificación — PROGRESIÓN DE PESO (módulo PURO).
//  Idea: premiar cuando el cliente SUBE el peso. Se deriva del historial
//  (workout_sessions + logs). Los pesos reales (actualWeight) se guardan SIEMPRE
//  en LIBRAS, así que se comparan directo sin convertir unidades.
//
//  Regla: en una ventana reciente (por defecto 14 días), un ejercicio "mejoró" si
//  el peso más alto reciente es mayor que la referencia previa a la ventana. Si el
//  cliente mejoró en >= `minExercises` ejercicios distintos, gana la insignia 📈.
// ═══════════════════════════════════════════════════════════════

export const DEFAULT_PROGRESS = { days: 14, minExercises: 3 };

function sessionTime(s) {
  const d = s.finishedAt || s.startedAt || s.createdAt;
  const t = d ? new Date(d).getTime() : NaN;
  return isNaN(t) ? null : t;
}
function w(log) {
  const n = Number(log?.actualWeight);
  return log && log.actualWeight !== "" && log.actualWeight != null && n > 0 ? n : null;
}

// Analiza la progresión de peso de un cliente. Devuelve { improved:[{exId,name,from,to}],
// count, earned, threshold }.
export function weightProgress(sessions, userId, opts = {}) {
  const { days, minExercises } = { ...DEFAULT_PROGRESS, ...opts };
  const now = opts.now instanceof Date ? opts.now : new Date();
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;

  const mine = (sessions || [])
    .filter((s) => s.userId === userId && (!s.status || s.status === "completed"))
    .map((s) => ({ t: sessionTime(s), logs: s.logs || [] }))
    .filter((s) => s.t != null)
    .sort((a, b) => a.t - b.t); // cronológico ascendente

  // Por ejercicio: mejor peso reciente (dentro de la ventana) y referencia previa
  // (el último peso registrado ANTES de la ventana).
  const recentMax = {}; // exId -> { val, name }
  const olderRef = {};  // exId -> { val, name } (el más reciente antes de la ventana)
  for (const s of mine) {
    const recent = s.t >= cutoff;
    for (const log of s.logs) {
      const val = w(log);
      if (val == null || !log.exId) continue;
      if (recent) {
        if (!recentMax[log.exId] || val > recentMax[log.exId].val) recentMax[log.exId] = { val, name: log.name };
      } else {
        // ascendente → el último que veamos antes de la ventana es la referencia
        olderRef[log.exId] = { val, name: log.name };
      }
    }
  }

  const improved = [];
  for (const exId of Object.keys(recentMax)) {
    const ref = olderRef[exId];
    const cur = recentMax[exId];
    if (ref && cur.val > ref.val) improved.push({ exId, name: cur.name || ref.name || "Ejercicio", from: ref.val, to: cur.val });
  }
  improved.sort((a, b) => (b.to - b.from) - (a.to - a.from)); // mayor mejora primero

  return { improved, count: improved.length, earned: improved.length >= minExercises, threshold: minExercises, days };
}
