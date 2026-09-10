import { describe, it, expect } from "vitest";
import { medalForCompletion, normalizeGoalPct, nextGoalThreshold, computeMedals, weeklyCountFor, medalUnlocked, weeklyGoalFor, DEFAULT_GOAL_PCT } from "./medals";

const PCT = { bronze: 50, silver: 75, gold: 100 };
const NOW = new Date("2026-09-10T12:00:00Z"); // jueves
const thisWeek = "2026-09-10";
const lastWeek = "2026-08-27"; // ~14 días antes (semana distinta y ya cerrada)

// Genera N sesiones completadas de un cliente en una fecha dada.
function sess(clientId, dateStr, n, status = "completed") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${clientId}_${dateStr}_${i}`, userId: clientId, status, finishedAt: `${dateStr}T10:00:00Z`,
  }));
}

describe("medalForCompletion", () => {
  it("asigna la medalla según el % del objetivo cumplido (meta=4)", () => {
    // 50%→bronce (2), 75%→plata (3), 100%→oro (4)
    expect(medalForCompletion(1, 4, PCT)).toBe(null); // 25%
    expect(medalForCompletion(2, 4, PCT)).toBe("bronze"); // 50%
    expect(medalForCompletion(3, 4, PCT)).toBe("silver"); // 75%
    expect(medalForCompletion(4, 4, PCT)).toBe("gold"); // 100%
    expect(medalForCompletion(5, 4, PCT)).toBe("gold"); // 125% sigue oro
  });
  it("meta distinta → mismos % dan resultados distintos (meta=6)", () => {
    expect(medalForCompletion(3, 6, PCT)).toBe("bronze"); // 50%
    expect(medalForCompletion(3, 4, PCT)).toBe("silver"); // 75% con meta menor
  });
  it("sin objetivo (sin rutina) → nunca da medalla", () => {
    expect(medalForCompletion(5, 0, PCT)).toBe(null);
    expect(medalForCompletion(5, null, PCT)).toBe(null);
  });
});

describe("normalizeGoalPct", () => {
  it("garantiza bronce <= plata <= oro", () => {
    expect(normalizeGoalPct({ bronze: 90, silver: 60, gold: 40 })).toEqual({ bronze: 90, silver: 90, gold: 90 });
    expect(normalizeGoalPct(null)).toEqual(DEFAULT_GOAL_PCT);
    expect(normalizeGoalPct({ bronze: 0 }).bronze).toBeGreaterThanOrEqual(1);
  });
});

describe("nextGoalThreshold", () => {
  it("indica cuántos entrenos faltan para el siguiente nivel (meta=4)", () => {
    expect(nextGoalThreshold(0, 4, PCT)).toEqual({ level: "bronze", need: 2 }); // 2 = 50%
    expect(nextGoalThreshold(2, 4, PCT)).toEqual({ level: "silver", need: 1 }); // 3 = 75%
    expect(nextGoalThreshold(3, 4, PCT)).toEqual({ level: "gold", need: 1 });   // 4 = 100%
    expect(nextGoalThreshold(4, 4, PCT)).toBe(null);
  });
  it("sin objetivo → null", () => {
    expect(nextGoalThreshold(1, 0, PCT)).toBe(null);
  });
});

describe("weeklyGoalFor", () => {
  const routines = [
    { id: "r1", daysPerWeek: 3, assignedUserIds: ["c1"] },
    { id: "r2", daysPerWeek: 5, assignedUserIds: ["c2"] },
  ];
  it("usa la rutina activa del usuario", () => {
    expect(weeklyGoalFor({ id: "c1", activeRoutineId: "r1" }, routines)).toBe(3);
  });
  it("cae a la rutina asignada si no hay activeRoutineId", () => {
    expect(weeklyGoalFor({ id: "c2" }, routines)).toBe(5);
  });
  it("null si el cliente no tiene rutina", () => {
    expect(weeklyGoalFor({ id: "zzz" }, routines)).toBe(null);
  });
});

describe("computeMedals", () => {
  it("semana actual: medalla y próximo nivel según objetivo (meta=4)", () => {
    const sessions = sess("c1", thisWeek, 2); // 50% → bronce
    const r = computeMedals(sessions, "c1", 4, PCT, NOW);
    expect(r.current.count).toBe(2);
    expect(r.current.medal).toBe("bronze");
    expect(r.current.next).toEqual({ level: "silver", need: 1 });
    expect(r.totalMedals).toBe(0); // la semana en curso no suma al record
  });

  it("semanas cerradas suman al record y cuentan objetivos alcanzados", () => {
    const sessions = [...sess("c1", lastWeek, 4), ...sess("c1", thisWeek, 1)];
    const r = computeMedals(sessions, "c1", 4, PCT, NOW);
    expect(r.totals.gold).toBe(1); // 4/4 = 100% la semana cerrada
    expect(r.goalsReached).toBe(1); // llegó a la meta 1 vez
    expect(r.current.medal).toBe(null); // 1 esta semana → sin medalla aún
  });

  it("ignora otros clientes y sesiones no completadas", () => {
    const sessions = [
      ...sess("c1", lastWeek, 3),            // 75% de meta 4 → plata
      ...sess("c2", lastWeek, 4),            // otro cliente
      ...sess("c1", lastWeek, 3, "active"),  // no completada
    ];
    const r = computeMedals(sessions, "c1", 4, PCT, NOW);
    expect(r.totals.silver).toBe(1);
    expect(r.totals.gold).toBe(0);
  });

  it("sin objetivo → sin medallas", () => {
    const sessions = sess("c1", lastWeek, 7);
    const r = computeMedals(sessions, "c1", null, PCT, NOW);
    expect(r.totalMedals).toBe(0);
    expect(r.goal).toBe(null);
  });
});

describe("weeklyCountFor", () => {
  it("cuenta solo entrenamientos completados de esa semana y cliente", () => {
    const sessions = [
      ...sess("c1", thisWeek, 2),
      ...sess("c1", lastWeek, 4),           // otra semana
      ...sess("c2", thisWeek, 3),           // otro cliente
      ...sess("c1", thisWeek, 1, "active"), // no completada
    ];
    expect(weeklyCountFor(sessions, "c1", NOW)).toBe(2);
  });
  it("cero si no hay nada", () => {
    expect(weeklyCountFor([], "c1", NOW)).toBe(0);
  });
});

describe("medalUnlocked", () => {
  it("devuelve la medalla al cruzar un umbral (meta=4)", () => {
    expect(medalUnlocked(1, 2, 4, PCT)).toBe("bronze"); // 25%→50%
    expect(medalUnlocked(2, 3, 4, PCT)).toBe("silver");  // 50%→75%
    expect(medalUnlocked(3, 4, 4, PCT)).toBe("gold");    // 75%→100%
  });
  it("null si no se cruza ningún umbral", () => {
    expect(medalUnlocked(0, 1, 4, PCT)).toBe(null); // 25%
    expect(medalUnlocked(4, 5, 4, PCT)).toBe(null); // ya era oro
  });
  it("null si no hay objetivo", () => {
    expect(medalUnlocked(2, 3, 0, PCT)).toBe(null);
  });
});
