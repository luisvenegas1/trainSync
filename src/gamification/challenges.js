// ═══════════════════════════════════════════════════════════════
//  Gamificación — RETOS / LEADERBOARD (módulo PURO).
//  Un reto es una competencia con período (fecha inicio–fin) entre los clientes
//  de un entrenador. El ranking se DERIVA de workout_sessions (entrenamientos
//  completados dentro del período). No hay tabla de resultados: siempre en vivo.
//  Métrica Fase 2: "most_workouts" (quién completó más entrenamientos).
// ═══════════════════════════════════════════════════════════════

// ¿El reto está activo AHORA? (dentro de [starts_on, ends_on], inclusive por día)
export function isChallengeActive(ch, now = new Date()) {
  if (!ch) return false;
  const t = now.getTime();
  const start = ch.startsOn ? new Date(ch.startsOn + "T00:00:00").getTime() : -Infinity;
  const end = ch.endsOn ? new Date(ch.endsOn + "T23:59:59").getTime() : Infinity;
  return t >= start && t <= end;
}

// Cuenta entrenamientos completados por cliente en [start, end] y arma el ranking.
// clients: [{ id, name }]. Devuelve filas ordenadas desc con rank (empates = mismo rank).
export function computeLeaderboard(sessions, clients = [], startDate, endDate) {
  const start = startDate ? new Date(startDate + "T00:00:00").getTime() : -Infinity;
  const end = endDate ? new Date(endDate + "T23:59:59").getTime() : Infinity;

  const counts = {};
  for (const c of clients) counts[c.id] = 0;
  for (const s of sessions || []) {
    if (!(s.userId in counts)) continue;
    if (s.status && s.status !== "completed") continue;
    const d = s.finishedAt || s.startedAt || s.createdAt;
    if (!d) continue;
    const t = new Date(d).getTime();
    if (isNaN(t) || t < start || t > end) continue;
    counts[s.userId] += 1;
  }

  const rows = clients.map((c) => ({ clientId: c.id, name: c.name || "Cliente", count: counts[c.id] || 0 }));
  rows.sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name)));

  // Ranking con empates: mismo conteo → mismo puesto.
  let rank = 0, prev = null;
  rows.forEach((r, i) => {
    if (r.count !== prev) { rank = i + 1; prev = r.count; }
    r.rank = rank;
  });
  return rows;
}

// Posición y datos de un cliente puntual dentro del ranking.
export function rankOf(rows, clientId) {
  return rows.find((r) => r.clientId === clientId) || null;
}

// Retos ya FINALIZADOS que el cliente GANÓ (quedó de primero, con al menos 1 entreno).
// Sirve para el "estante de trofeos" en el perfil. Puro: deriva de las sesiones.
export function wonChallenges(sessions, clients, challenges = [], clientId, now = new Date()) {
  const out = [];
  for (const ch of challenges) {
    if (isChallengeActive(ch, now)) continue; // solo los que ya cerraron
    if (ch.endsOn && new Date(ch.endsOn + "T23:59:59").getTime() > now.getTime()) continue; // aún no empieza/termina
    const rows = computeLeaderboard(sessions, clients, ch.startsOn, ch.endsOn);
    const me = rankOf(rows, clientId);
    if (me && me.rank === 1 && me.count > 0) out.push({ ...ch, count: me.count });
  }
  out.sort((a, b) => (a.endsOn < b.endsOn ? 1 : -1)); // más reciente primero
  return out;
}

export const RANK_EMOJI = { 1: "🥇", 2: "🥈", 3: "🥉" };
