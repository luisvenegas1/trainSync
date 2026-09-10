import { describe, it, expect } from "vitest";
import { isChallengeActive, computeLeaderboard, rankLeaderboard, rankOf, wonChallenges } from "./challenges";

const clients = [{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }, { id: "c", name: "Caro" }];

function sess(clientId, dateStr, n, status = "completed") {
  return Array.from({ length: n }, (_, i) => ({
    id: `${clientId}_${dateStr}_${i}`, userId: clientId, status, finishedAt: `${dateStr}T10:00:00Z`,
  }));
}

describe("isChallengeActive", () => {
  it("detecta si la fecha está dentro del período", () => {
    const ch = { startsOn: "2026-09-01", endsOn: "2026-09-30" };
    expect(isChallengeActive(ch, new Date("2026-09-15T12:00:00Z"))).toBe(true);
    expect(isChallengeActive(ch, new Date("2026-08-31T12:00:00Z"))).toBe(false);
    expect(isChallengeActive(ch, new Date("2026-10-01T12:00:00Z"))).toBe(false);
    expect(isChallengeActive(ch, new Date("2026-09-30T23:00:00Z"))).toBe(true); // último día incluido
  });
});

describe("computeLeaderboard", () => {
  const sessions = [
    ...sess("a", "2026-09-10", 5),
    ...sess("b", "2026-09-12", 3),
    ...sess("c", "2026-09-12", 3),
    ...sess("a", "2026-08-20", 4),   // fuera del período (agosto)
    ...sess("b", "2026-09-12", 2, "active"), // no completada
  ];
  const rows = computeLeaderboard(sessions, clients, "2026-09-01", "2026-09-30");

  it("cuenta solo entrenamientos completados dentro del período", () => {
    expect(rows.find((r) => r.clientId === "a").count).toBe(5); // no cuenta los de agosto
    expect(rows.find((r) => r.clientId === "b").count).toBe(3); // no cuenta la "active"
  });
  it("ordena desc y asigna ranking con empates", () => {
    expect(rows[0].clientId).toBe("a");
    expect(rows[0].rank).toBe(1);
    // Beto y Caro empatan en 3 → ambos rank 2
    expect(rows.find((r) => r.clientId === "b").rank).toBe(2);
    expect(rows.find((r) => r.clientId === "c").rank).toBe(2);
  });
  it("rankOf devuelve la fila del cliente", () => {
    expect(rankOf(rows, "a").rank).toBe(1);
    expect(rankOf(rows, "zzz")).toBe(null);
  });
  it("sin período → cuenta todo", () => {
    const all = computeLeaderboard(sessions, clients);
    expect(all.find((r) => r.clientId === "a").count).toBe(9); // 5 sept + 4 agosto
  });
});

describe("rankLeaderboard", () => {
  it("ordena desc por conteo y asigna rank con empates", () => {
    const rows = rankLeaderboard([
      { clientId: "a", name: "Ana", count: 3 },
      { clientId: "b", name: "Beto", count: 5 },
      { clientId: "c", name: "Caro", count: 3 },
    ]);
    expect(rows[0].clientId).toBe("b");
    expect(rows[0].rank).toBe(1);
    expect(rows.find((r) => r.clientId === "a").rank).toBe(2);
    expect(rows.find((r) => r.clientId === "c").rank).toBe(2); // empate
  });
  it("tolera lista vacía o nula", () => {
    expect(rankLeaderboard([])).toEqual([]);
    expect(rankLeaderboard(null)).toEqual([]);
  });
});

describe("wonChallenges", () => {
  const NOW = new Date("2026-10-15T12:00:00Z");
  const sessions = [
    ...sess("a", "2026-09-10", 5), // Ana gana septiembre
    ...sess("b", "2026-09-12", 3),
  ];
  const finished = { id: "ch1", title: "Reto Septiembre", startsOn: "2026-09-01", endsOn: "2026-09-30", prize: "1 mes gratis" };
  const active = { id: "ch2", title: "Reto Octubre", startsOn: "2026-10-01", endsOn: "2026-10-31" };

  it("devuelve retos cerrados que el cliente ganó (1er lugar)", () => {
    const won = wonChallenges(sessions, clients, [finished], "a", NOW);
    expect(won.length).toBe(1);
    expect(won[0].id).toBe("ch1");
    expect(won[0].count).toBe(5);
  });
  it("no incluye retos donde no quedó primero", () => {
    expect(wonChallenges(sessions, clients, [finished], "b", NOW)).toEqual([]);
  });
  it("ignora retos activos (aún no cierran)", () => {
    expect(wonChallenges(sessions, clients, [active], "a", NOW)).toEqual([]);
  });
  it("no cuenta como ganado si el cliente no entrenó (0)", () => {
    expect(wonChallenges(sessions, clients, [finished], "c", NOW)).toEqual([]);
  });
});
