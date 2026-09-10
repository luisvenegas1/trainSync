import { describe, it, expect } from "vitest";
import { weightProgress } from "./weightProgress";

const NOW = new Date("2026-09-20T12:00:00Z");
// Fechas: dentro de ventana (14 días) y antes de ella.
const recent = "2026-09-15"; // ~5 días antes → dentro
const old = "2026-08-25";     // ~26 días antes → fuera (referencia previa)

function s(userId, dateStr, logs, status = "completed") {
  return { id: `${userId}_${dateStr}`, userId, status, finishedAt: `${dateStr}T10:00:00Z`, logs };
}

describe("weightProgress", () => {
  it("cuenta ejercicios donde subió el peso vs la referencia previa", () => {
    const sessions = [
      s("u1", old, [{ exId: "press", name: "Press", actualWeight: "100", weightUnit: "lbs" }, { exId: "squat", name: "Squat", actualWeight: "150", weightUnit: "lbs" }, { exId: "curl", name: "Curl", actualWeight: "30", weightUnit: "lbs" }]),
      s("u1", recent, [{ exId: "press", name: "Press", actualWeight: "110", weightUnit: "lbs" }, { exId: "squat", name: "Squat", actualWeight: "160", weightUnit: "lbs" }, { exId: "curl", name: "Curl", actualWeight: "30", weightUnit: "lbs" }]),
    ];
    const r = weightProgress(sessions, "u1", { now: NOW });
    expect(r.count).toBe(2); // press y squat subieron; curl igual
    expect(r.earned).toBe(false); // umbral 3
    expect(r.improved.map((x) => x.exId).sort()).toEqual(["press", "squat"]);
  });

  it("otorga la insignia al llegar al umbral (3 ejercicios)", () => {
    const sessions = [
      s("u1", old, [{ exId: "a", name: "A", actualWeight: "50", weightUnit: "lbs" }, { exId: "b", name: "B", actualWeight: "50", weightUnit: "lbs" }, { exId: "c", name: "C", actualWeight: "50", weightUnit: "lbs" }]),
      s("u1", recent, [{ exId: "a", name: "A", actualWeight: "55", weightUnit: "lbs" }, { exId: "b", name: "B", actualWeight: "60", weightUnit: "lbs" }, { exId: "c", name: "C", actualWeight: "52", weightUnit: "lbs" }]),
    ];
    const r = weightProgress(sessions, "u1", { now: NOW });
    expect(r.count).toBe(3);
    expect(r.earned).toBe(true);
  });

  it("no cuenta si no hay referencia previa (primera vez que hace el ejercicio)", () => {
    const sessions = [
      s("u1", recent, [{ exId: "press", name: "Press", actualWeight: "110", weightUnit: "lbs" }]),
    ];
    expect(weightProgress(sessions, "u1", { now: NOW }).count).toBe(0);
  });

  it("ignora bajadas de peso y pesos vacíos/cero", () => {
    const sessions = [
      s("u1", old, [{ exId: "press", name: "Press", actualWeight: "120", weightUnit: "lbs" }, { exId: "row", name: "Row", actualWeight: "80", weightUnit: "lbs" }]),
      s("u1", recent, [{ exId: "press", name: "Press", actualWeight: "110", weightUnit: "lbs" }, { exId: "row", name: "Row", actualWeight: "", weightUnit: "lbs" }]),
    ];
    const r = weightProgress(sessions, "u1", { now: NOW });
    expect(r.count).toBe(0); // press bajó, row vacío
  });

  it("ignora otros usuarios y sesiones no completadas", () => {
    const sessions = [
      s("u1", old, [{ exId: "press", name: "Press", actualWeight: "100", weightUnit: "lbs" }]),
      s("u1", recent, [{ exId: "press", name: "Press", actualWeight: "120", weightUnit: "lbs" }], "active"),
      s("u2", recent, [{ exId: "press", name: "Press", actualWeight: "999", weightUnit: "lbs" }]),
    ];
    expect(weightProgress(sessions, "u1", { now: NOW }).count).toBe(0); // la reciente de u1 no está completada
  });

  it("toma el peso MÁS ALTO reciente como referencia de mejora", () => {
    const sessions = [
      s("u1", old, [{ exId: "press", name: "Press", actualWeight: "100", weightUnit: "lbs" }]),
      s("u1", "2026-09-12", [{ exId: "press", name: "Press", actualWeight: "115", weightUnit: "lbs" }]),
      s("u1", "2026-09-18", [{ exId: "press", name: "Press", actualWeight: "105", weightUnit: "lbs" }]),
    ];
    const r = weightProgress(sessions, "u1", { now: NOW });
    expect(r.count).toBe(1);
    expect(r.improved[0].to).toBe(115); // el máximo reciente, no el último
  });
});
