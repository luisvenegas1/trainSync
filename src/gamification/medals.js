// ═══════════════════════════════════════════════════════════════
//  Gamificación — MEDALLAS (módulo PURO, sin efectos ni red).
//  Las medallas se DERIVAN de los entrenamientos que el cliente ya registra
//  (workout_sessions). No hay tabla de medallas: son una función determinística
//  de los datos + los umbrales que configura el entrenador. Así siempre están
//  correctas y no hay que sincronizar nada.
//
//  Regla (semanal): en una semana, si completó >= oro → oro; si no, >= plata →
//  plata; si no, >= bronce → bronce; si no, ninguna.
//  Record personal = suma de medallas de semanas YA CERRADAS (la semana en curso
//  se muestra aparte porque todavía puede subir de nivel).
// ═══════════════════════════════════════════════════════════════
import { weekKey, weekLabel } from "../trainsync.utils";

export const DEFAULT_THRESHOLDS = { bronze: 3, silver: 5, gold: 7 };

// Ordena y sanea los umbrales para que siempre sea bronce < plata < oro.
export function normalizeThresholds(t) {
  const bronze = Math.max(1, Math.round(Number(t?.bronze) || DEFAULT_THRESHOLDS.bronze));
  const silver = Math.max(bronze + 1, Math.round(Number(t?.silver) || DEFAULT_THRESHOLDS.silver));
  const gold = Math.max(silver + 1, Math.round(Number(t?.gold) || DEFAULT_THRESHOLDS.gold));
  return { bronze, silver, gold };
}

// Medalla para un conteo de entrenamientos en una semana ("gold"|"silver"|"bronze"|null).
export function medalForCount(count, thresholds = DEFAULT_THRESHOLDS) {
  const t = normalizeThresholds(thresholds);
  if (count >= t.gold) return "gold";
  if (count >= t.silver) return "silver";
  if (count >= t.bronze) return "bronze";
  return null;
}

// Cuántos entrenamientos faltan para el siguiente nivel (o null si ya tiene oro).
export function nextThreshold(count, thresholds = DEFAULT_THRESHOLDS) {
  const t = normalizeThresholds(thresholds);
  if (count < t.bronze) return { level: "bronze", need: t.bronze - count };
  if (count < t.silver) return { level: "silver", need: t.silver - count };
  if (count < t.gold) return { level: "gold", need: t.gold - count };
  return null;
}

// Entrenamientos COMPLETADOS por semana para un cliente. { "2026-09-07": 4, ... }
function sessionsByWeek(sessions, clientId) {
  const byWeek = {};
  for (const s of sessions || []) {
    if (s.userId !== clientId) continue;
    if (s.status && s.status !== "completed") continue;
    const date = s.finishedAt || s.startedAt || s.createdAt;
    if (!date) continue;
    const k = weekKey(date);
    byWeek[k] = (byWeek[k] || 0) + 1;
  }
  return byWeek;
}

// Resumen de gamificación de un cliente: semana actual + record acumulado + semanas.
export function computeMedals(sessions, clientId, thresholds = DEFAULT_THRESHOLDS, now = new Date()) {
  const t = normalizeThresholds(thresholds);
  const byWeek = sessionsByWeek(sessions, clientId);
  const curKey = weekKey(now);
  const currentCount = byWeek[curKey] || 0;

  const totals = { gold: 0, silver: 0, bronze: 0 };
  const weeks = [];
  for (const [k, count] of Object.entries(byWeek)) {
    const medal = medalForCount(count, t);
    // La semana en curso NO cuenta para el record (todavía puede subir).
    if (k !== curKey && medal) totals[medal] += 1;
    weeks.push({ week: k, label: weekLabel(k), count, medal });
  }
  weeks.sort((a, b) => (a.week < b.week ? 1 : -1)); // más reciente primero

  return {
    current: { count: currentCount, medal: medalForCount(currentCount, t), next: nextThreshold(currentCount, t) },
    totals,
    totalMedals: totals.gold + totals.silver + totals.bronze,
    weeks,
    thresholds: t,
  };
}

// Presentación
export const MEDAL_META = {
  gold: { emoji: "🥇", label: "Oro", color: "#D4A017" },
  silver: { emoji: "🥈", label: "Plata", color: "#8A94A6" },
  bronze: { emoji: "🥉", label: "Bronce", color: "#B87333" },
};
