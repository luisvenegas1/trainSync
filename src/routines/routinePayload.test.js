import { describe, it, expect } from "vitest";
import { buildRoutinePayload, isMissingFunctionError } from "./routinePayload";

const routine = {
  id: "rt_1",
  userId: "u_1",
  title: "Full Body",
  daysPerWeek: 3,
  note: "vamos",
  warmupStretchIds: ["s1"],
  cooldownStretchIds: [],
  createdAt: "2026-01-01T00:00:00Z",
  days: [
    {
      id: "d_1",
      label: "Día 1",
      groups: [
        {
          id: "g_1",
          label: "A",
          restSeconds: 45,
          exercises: [
            { exId: "e_1", series: 4, reps: "10", notes: "", weightAmount: "20", weightUnit: "kg", equipment: "Mancuerna", surface: "Ninguno" },
          ],
        },
      ],
    },
  ],
};

describe("buildRoutinePayload", () => {
  it("mapea camelCase → snake_case y anida días/grupos/ejercicios", () => {
    const p = buildRoutinePayload(routine);
    expect(p.id).toBe("rt_1");
    expect(p.user_id).toBe("u_1");
    expect(p.days_per_week).toBe(3);
    expect(p.warmup_stretch_ids).toEqual(["s1"]);
    expect(p.days[0].groups[0].rest_seconds).toBe(45);
    const ex = p.days[0].groups[0].exercises[0];
    expect(ex.exercise_id).toBe("e_1");
    expect(ex.weight_amount).toBe("20");
    expect(ex.weight_unit).toBe("kg");
  });

  it("usa defaults seguros cuando faltan campos", () => {
    const p = buildRoutinePayload({ id: "rt_2", title: "x" });
    expect(p.user_id).toBeNull();
    expect(p.days_per_week).toBe(0);
    expect(p.days).toEqual([]);
    expect(p.warmup_stretch_ids).toEqual([]);
  });

  // Compatibilidad hacia atrás: rutinas existentes (sin warmupMode) → 'exercises'.
  it("calentamiento por defecto es 'exercises' (rutinas viejas no cambian)", () => {
    const p = buildRoutinePayload(routine); // no tiene warmupMode
    expect(p.warmup_mode).toBe("exercises");
    expect(p.warmup_image_url).toBeNull();
  });

  it("calentamiento por imagen cuando warmupMode='image'", () => {
    const p = buildRoutinePayload({ ...routine, warmupMode: "image", warmupImageUrl: "https://x/y.png" });
    expect(p.warmup_mode).toBe("image");
    expect(p.warmup_image_url).toBe("https://x/y.png");
  });

  it("cualquier valor raro de warmupMode cae en 'exercises' (defensivo)", () => {
    const p = buildRoutinePayload({ ...routine, warmupMode: "otro" });
    expect(p.warmup_mode).toBe("exercises");
  });
});

describe("isMissingFunctionError", () => {
  it("detecta función inexistente (fallback a legacy)", () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
    expect(
      isMissingFunctionError({ message: "Could not find the function public.save_routine in the schema cache" })
    ).toBe(true);
  });
  it("NO trata errores de datos como función faltante", () => {
    expect(isMissingFunctionError({ code: "23503", message: "foreign key violation" })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });
});
