import { describe, it, expect } from "vitest";
import { isChallengeActive, computeLeaderboard, rankOf } from "./challenges";

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
