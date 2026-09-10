import { describe, it, expect } from "vitest";
import { hasFeature, planFeatures, normalizePlan, minPlanFor, PLANS, effectiveFeatures } from "./entitlements";

describe("entitlements — plan → features", () => {
  it("Base: workouts sí; mediciones/analytics/recordatorios no", () => {
    expect(hasFeature("base", "workouts")).toBe(true);
    expect(hasFeature("base", "measurements")).toBe(false);
    expect(hasFeature("base", "analytics")).toBe(false);
    expect(hasFeature("base", "payment_reminders")).toBe(false);
  });
  it("Pro: agrega mediciones y analytics; recordatorios no", () => {
    expect(hasFeature("pro", "measurements")).toBe(true);
    expect(hasFeature("pro", "analytics")).toBe(true);
    expect(hasFeature("pro", "payment_reminders")).toBe(false);
  });
  it("Premium: todo, incluidos recordatorios y retos", () => {
    expect(hasFeature("premium", "measurements")).toBe(true);
    expect(hasFeature("premium", "analytics")).toBe(true);
    expect(hasFeature("premium", "payment_reminders")).toBe(true);
    expect(hasFeature("premium", "challenges")).toBe(true);
  });
  it("Retos: exclusivo de Premium (Base/Pro no)", () => {
    expect(hasFeature("base", "challenges")).toBe(false);
    expect(hasFeature("pro", "challenges")).toBe(false);
    expect(minPlanFor("challenges")).toBe("premium");
  });
  it("plan desconocido o vacío → base", () => {
    expect(normalizePlan("")).toBe("base");
    expect(normalizePlan("gold")).toBe("base");
    expect(hasFeature(null, "measurements")).toBe(false);
    expect(planFeatures("gold").workouts).toBe(true);
  });
  it("minPlanFor devuelve el plan mínimo de cada feature", () => {
    expect(minPlanFor("workouts")).toBe("base");
    expect(minPlanFor("measurements")).toBe("pro");
    expect(minPlanFor("payment_reminders")).toBe("premium");
  });
  it("Premium ⊇ Pro ⊇ Base (monótono en features clave)", () => {
    for (const feat of ["workouts", "measurements", "analytics", "payment_reminders", "challenges"]) {
      const vals = PLANS.map((p) => hasFeature(p, feat));
      // una vez que se activa, no se desactiva en planes superiores
      for (let i = 1; i < vals.length; i++) if (vals[i - 1]) expect(vals[i]).toBe(true);
    }
  });
});

describe("effectiveFeatures — overrides por organización", () => {
  it("sin overrides = features del plan (no cambia nada)", () => {
    expect(effectiveFeatures("base", null)).toEqual(planFeatures("base"));
    expect(effectiveFeatures("premium", {})).toEqual(planFeatures("premium"));
  });
  it("un override puede ACTIVAR una feature en un tenant Base", () => {
    const f = effectiveFeatures("base", { measurements: true });
    expect(f.measurements).toBe(true);
    expect(f.workouts).toBe(true); // no rompe las demás
  });
  it("un override puede activar retos en un tenant Base/Pro (sin subir de plan)", () => {
    expect(effectiveFeatures("base", { challenges: true }).challenges).toBe(true);
    expect(effectiveFeatures("pro", { challenges: true }).challenges).toBe(true);
  });
  it("ignora overrides que no sean booleanos (seguro)", () => {
    const f = effectiveFeatures("base", { measurements: "sí", analytics: 1 });
    expect(f.measurements).toBe(false);
    expect(f.analytics).toBe(false);
  });

  // Retos ya NO son beta: Premium los trae por defecto; Base/Pro no, salvo override.
  it("retos: ON en Premium por defecto, OFF en Base/Pro", () => {
    expect(effectiveFeatures("premium", {}).challenges).toBe(true);
    expect(effectiveFeatures("premium", null).challenges).toBe(true);
    expect(effectiveFeatures("base", {}).challenges).toBe(false);
    expect(effectiveFeatures("pro", {}).challenges).toBe(false);
  });
  it("un override puede APAGAR retos en un tenant Premium puntual", () => {
    expect(effectiveFeatures("premium", { challenges: false }).challenges).toBe(false);
  });
});
