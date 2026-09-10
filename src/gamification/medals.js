// ═══════════════════════════════════════════════════════════════
//  Gamificación — MEDALLAS (módulo PURO, sin efectos ni red).
//  Las medallas se DERIVAN de los entrenamientos que el cliente ya registra
//  (workout_sessions). No hay tabla de medallas: son una función determinística
//  de los datos + la config del entrenador. Así siempre están correctas.
//
//  Modelo (objetivo REAL): cada cliente tiene una meta semanal = los días/semana
//  de SU rutina activa (lo que el coach le diseñó). La medalla se gana según qué
//  PORCENTAJE de esa meta cumplió en la semana. El coach fija los porcentajes:
//  ej. >=50% → bronce, >=75% → plata, >=100% → oro.
//  Así un cliente con meta de 3 días y otro con meta de 5 se miden cada uno contra
//  LO SUYO, no contra un número fijo para todos.
//
//  Record personal = suma de medallas de semanas YA CERRADAS (la semana en curso
//  se muestra aparte porque todavía puede subir de nivel).
// ═══════════════════════════════════════════════════════════════
import { weekKey, weekLabel } from "../trainsync.utils";

export const DEFAULT_GOAL_PCT = { bronze: 50, silver: 75, gold: 100 };

// Ordena y sanea los porcentajes: bronce <= plata <= oro, cada uno >= 1.
export function normalizeGoalPct(p) {
  const bronze = Math.max(1, Math.round(Number(p?.bronze) || DEFAULT_GOAL_PCT.bronze));
  const silver = Math.max(bronze, Math.round(Number(p?.silver) || DEFAULT_GOAL_PCT.silver));
  const gold = Math.max(silver, Math.round(Number(p?.gold) || DEFAULT_GOAL_PCT.gold));
  return { bronze, silver, gold };
}

// Medalla para un conteo de entrenamientos en la semana, dado el OBJETIVO (días/semana)
// del cliente y los % del coach. Devuelve "gold"|"silver"|"bronze"|null.
export function medalForCompletion(count, goal, pct = DEFAULT_GOAL_PCT) {
  const g = Number(goal);
  if (!g || g <= 0) return null; // sin objetivo (sin rutina) no hay medalla
  const ratio = (count / g) * 100;
  const p = normalizeGoalPct(pct);
  if (ratio >= p.gold) return "gold";
  if (ratio >= p.silver) return "silver";
  if (ratio >= p.bronze) return "bronze";
  return null;
}

// Cuántos entrenamientos faltan para el siguiente nivel (o null si ya tiene oro).
export function nextGoalThreshold(count, goal, pct = DEFAULT_GOAL_PCT) {
  const g = Number(goal);
  if (!g || g <= 0) return null;
  const p = normalizeGoalPct(pct);
  const needFor = (percent) => Math.max(1, Math.ceil((g * percent) / 100) - count);
  if (count < Math.ceil((g * p.bronze) / 100)) return { level: "bronze", need: needFor(p.bronze) };
  if (count < Math.ceil((g * p.silver) / 100)) return { level: "silver", need: needFor(p.silver) };
  if (count < Math.ceil((g * p.gold) / 100)) return { level: "gold", need: needFor(p.gold) };
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

// Objetivo semanal (días/semana) del cliente = su rutina activa. null si no tiene.
export function weeklyGoalFor(user, routines) {
  if (!user) return null;
  const list = routines || [];
  const r =
    list.find((x) => x.id === user.activeRoutineId) ||
    list.find((x) => (x.assignedUserIds || []).includes(user.id) || x.userId === user.id) ||
    null;
  const d = Number(r?.daysPerWeek);
  return d > 0 ? d : null;
}

// Entrenamientos COMPLETADOS por el cliente en la semana de `now` (para saber si al
// terminar uno cruzó un umbral de medalla). Puro: no muta nada.
export function weeklyCountFor(sessions, clientId, now = new Date()) {
  const curKey = weekKey(now);
  let n = 0;
  for (const s of sessions || []) {
    if (s.userId !== clientId) continue;
    if (s.status && s.status !== "completed") continue;
    const date = s.finishedAt || s.startedAt || s.createdAt;
    if (!date || weekKey(date) !== curKey) continue;
    n += 1;
  }
  return n;
}

// ¿Al pasar de `beforeCount` a `afterCount` entrenamientos en la semana se DESBLOQUEÓ
// una medalla nueva (o se subió de nivel)? Devuelve "gold"|"silver"|"bronze" o null.
export function medalUnlocked(beforeCount, afterCount, goal, pct = DEFAULT_GOAL_PCT) {
  const before = medalForCompletion(beforeCount, goal, pct);
  const after = medalForCompletion(afterCount, goal, pct);
  if (!after) return null;
  const rank = { bronze: 1, silver: 2, gold: 3 };
  if (before && rank[after] <= rank[before]) return null; // no subió de nivel
  return after;
}

// Resumen de gamificación de un cliente: semana actual + record acumulado + semanas.
// `goal` = días/semana de su rutina; `pct` = porcentajes del coach.
export function computeMedals(sessions, clientId, goal, pct = DEFAULT_GOAL_PCT, now = new Date()) {
  const p = normalizeGoalPct(pct);
  const byWeek = sessionsByWeek(sessions, clientId);
  const curKey = weekKey(now);
  const currentCount = byWeek[curKey] || 0;

  const totals = { gold: 0, silver: 0, bronze: 0 };
  const weeks = [];
  for (const [k, count] of Object.entries(byWeek)) {
    const medal = medalForCompletion(count, goal, p);
    // La semana en curso NO cuenta para el record (todavía puede subir).
    if (k !== curKey && medal) totals[medal] += 1;
    weeks.push({ week: k, label: weekLabel(k), count, medal });
  }
  weeks.sort((a, b) => (a.week < b.week ? 1 : -1)); // más reciente primero

  return {
    goal: Number(goal) || null,
    current: { count: currentCount, medal: medalForCompletion(currentCount, goal, p), next: nextGoalThreshold(currentCount, goal, p) },
    totals,
    totalMedals: totals.gold + totals.silver + totals.bronze,
    goalsReached: weeks.filter((w) => w.week !== curKey && Number(goal) > 0 && w.count >= Number(goal)).length,
    weeks,
    pct: p,
  };
}

// Presentación
export const MEDAL_META = {
  gold: { emoji: "🥇", label: "Oro", color: "#D4A017" },
  silver: { emoji: "🥈", label: "Plata", color: "#8A94A6" },
  bronze: { emoji: "🥉", label: "Bronce", color: "#B87333" },
};
