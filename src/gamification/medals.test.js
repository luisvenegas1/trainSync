import { describe, it, expect } from "vitest";
import { medalForCount, normalizeThresholds, nextThreshold, computeMedals, weeklyCountFor, medalUnlocked, DEFAULT_THRESHOLDS } from "./medals";

const TH = { bronze: 3, silver: 5, gold: 7 };
const NOW = new Date("2026-09-10T12:00:00Z"); // jueves
const thisWeek = "2026-09-10";
const lastWeek = "2026-08-27"; // ~14 días antes (semana distinta y ya cerrada)

// Genera N sesiones completadas de un cliente en una fecha dada.
function sess(clientId, dateStr, n, status = "completed") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${clientId}_${dateStr}_${i}`, userId: clientId, status, finishedAt: `${dateStr}T10:00:00Z`,
  }));
}

describe("medalForCount", () => {
  it("asigna la medalla correcta según el conteo", () => {
    expect(medalForCount(0, TH)).toBe(null);
    expect(medalForCount(2, TH)).toBe(null);
    expect(medalForCount(3, TH)).toBe("bronze");
    expect(medalForCount(4, TH)).toBe("bronze");
    expect(medalForCount(5, TH)).toBe("silver");
    expect(medalForCount(6, TH)).toBe("silver");
    expect(medalForCount(7, TH)).toBe("gold");
    expect(medalForCount(12, TH)).toBe("gold");
  });
});

describe("normalizeThresholds", () => {
  it("garantiza bronce < plata < oro y valores válidos", () => {
    expect(normalizeThresholds({ bronze: 5, silver: 3, gold: 1 })).toEqual({ bronze: 5, silver: 6, gold: 7 });
    expect(normalizeThresholds(null)).toEqual(DEFAULT_THRESHOLDS);
    expect(normalizeThresholds({ bronze: 0 }).bronze).toBeGreaterThanOrEqual(1);
  });
});

describe("nextThreshold", () => {
  it("indica cuánto falta para el siguiente nivel", () => {
    expect(nextThreshold(0, TH)).toEqual({ level: "bronze", need: 3 });
    expect(nextThreshold(3, TH)).toEqual({ level: "silver", need: 2 });
    expect(nextThreshold(5, TH)).toEqual({ level: "gold", need: 2 });
    expect(nextThreshold(7, TH)).toBe(null);
  });
});

describe("computeMedals", () => {
  it("semana actual: medalla y próximo nivel, sin contar al record", () => {
    const sessions = sess("c1", thisWeek, 4); // bronce esta semana
    const r = computeMedals(sessions, "c1", TH, NOW);
    expect(r.current.count).toBe(4);
    expect(r.current.medal).toBe("bronze");
    expect(r.current.next).toEqual({ level: "silver", need: 1 });
    expect(r.totalMedals).toBe(0); // la semana en curso no suma al record
  });

  it("semanas cerradas suman al record acumulado", () => {
    const sessions = [...sess("c1", lastWeek, 7), ...sess("c1", thisWeek, 2)];
    const r = computeMedals(sessions, "c1", TH, NOW);
    expect(r.totals.gold).toBe(1);
    expect(r.totalMedals).toBe(1);
    expect(r.current.medal).toBe(null); // 2 esta semana → sin medalla aún
  });

  it("ignora otros clientes y sesiones no completadas", () => {
    const sessions = [
      ...sess("c1", lastWeek, 5),
      ...sess("c2", lastWeek, 7),            // otro cliente
      ...sess("c1", lastWeek, 3, "active"),  // no completada
    ];
    const r = computeMedals(sessions, "c1", TH, NOW);
    expect(r.totals.silver).toBe(1); // solo las 5 completadas de c1
    expect(r.totals.gold).toBe(0);
  });

  it("cliente sin entrenamientos → todo en cero", () => {
    const r = computeMedals([], "c1", TH, NOW);
    expect(r.totalMedals).toBe(0);
    expect(r.current.count).toBe(0);
    expect(r.current.medal).toBe(null);
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
  it("devuelve la medalla al cruzar un umbral", () => {
    expect(medalUnlocked(2, 3, TH)).toBe("bronze"); // 3er entreno → bronce
    expect(medalUnlocked(4, 5, TH)).toBe("silver");  // 5to → plata
    expect(medalUnlocked(6, 7, TH)).toBe("gold");    // 7mo → oro
  });
  it("null si no se cruza ningún umbral", () => {
    expect(medalUnlocked(0, 1, TH)).toBe(null);
    expect(medalUnlocked(3, 4, TH)).toBe(null); // sigue en bronce
  });
  it("null si ya tenía ese nivel o superior", () => {
    expect(medalUnlocked(7, 8, TH)).toBe(null); // ya era oro
  });
});
