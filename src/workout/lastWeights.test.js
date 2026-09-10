import { describe, it, expect } from "vitest";
import { lastWeightForExercise, initialWeightFor } from "./lastWeights";

const sessions = [
  { userId: "u1", status: "completed", finishedAt: "2026-09-01T10:00:00Z", logs: [
    { exId: "press", actualWeight: "100", weightUnit: "lbs" },
    { exId: "squat", actualWeight: "", weightUnit: "lbs" },
  ] },
  { userId: "u1", status: "completed", finishedAt: "2026-09-08T10:00:00Z", logs: [
    { exId: "press", actualWeight: "110", weightUnit: "lbs" }, // más reciente
  ] },
  { userId: "u2", status: "completed", finishedAt: "2026-09-09T10:00:00Z", logs: [
    { exId: "press", actualWeight: "200", weightUnit: "lbs" }, // otro usuario
  ] },
];

describe("lastWeightForExercise", () => {
  it("devuelve el peso más reciente del usuario para ese ejercicio", () => {
    expect(lastWeightForExercise(sessions, "u1", "press")).toEqual({ val: "110", unit: "lbs" });
  });
  it("ignora otros usuarios", () => {
    expect(lastWeightForExercise(sessions, "u1", "press").val).toBe("110"); // no 200 de u2
  });
  it("ignora logs sin peso (vacío o 0)", () => {
    expect(lastWeightForExercise(sessions, "u1", "squat")).toBe(null);
  });
  it("null si nunca lo hizo", () => {
    expect(lastWeightForExercise(sessions, "u1", "curl")).toBe(null);
  });
});

describe("initialWeightFor", () => {
  it("usa el último peso usado si existe (desde el historial)", () => {
    const r = initialWeightFor(sessions, "u1", { exId: "press", plannedWeight: "80", weightUnit: "lbs" });
    expect(r).toEqual({ val: "110", unit: "lbs", fromHistory: true });
  });
  it("usa el peso del coach si no hay historial", () => {
    const r = initialWeightFor(sessions, "u1", { exId: "curl", plannedWeight: "30", weightUnit: "kg" });
    expect(r).toEqual({ val: "30", unit: "kg", fromHistory: false });
  });
  it("vacío si no hay historial ni peso del coach", () => {
    const r = initialWeightFor(sessions, "u1", { exId: "curl", plannedWeight: "", weightUnit: "lbs" });
    expect(r.val).toBe("");
  });
});
