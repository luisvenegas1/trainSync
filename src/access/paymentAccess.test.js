import { describe, it, expect } from "vitest";
import { routineBlocked, accessDeadline, normalizeGraceDays, graceDaysLeft } from "./paymentAccess";

const NOW = new Date("2026-09-12T12:00:00");
const past = "2026-09-01";   // vencido hace 11 días
const future = "2026-12-01"; // vigente
const on = { blockEnabled: true, graceDays: 0 };
const off = { blockEnabled: false, graceDays: 0 };

describe("normalizeGraceDays", () => {
  it("clampa a enteros 0..365", () => {
    expect(normalizeGraceDays(-5)).toBe(0);
    expect(normalizeGraceDays(3.7)).toBe(4);
    expect(normalizeGraceDays(9999)).toBe(365);
    expect(normalizeGraceDays("7")).toBe(7);
    expect(normalizeGraceDays(undefined)).toBe(0);
  });
});

describe("accessDeadline", () => {
  it("suma los días de gracia al fin del día de vencimiento", () => {
    // TZ-robusto: 3 días de gracia = exactamente 3 días más que 0 de gracia.
    const base = accessDeadline("2026-09-10", 0);
    const grace = accessDeadline("2026-09-10", 3);
    const diffDays = (grace.getTime() - base.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(3);
  });
  it("null sin fecha", () => {
    expect(accessDeadline("", 3)).toBe(null);
    expect(accessDeadline(null, 0)).toBe(null);
  });
});

describe("routineBlocked", () => {
  it("no bloquea si la org no activó el bloqueo", () => {
    expect(routineBlocked({ plan: { endDate: past }, orgConfig: off, now: NOW })).toBe(false);
  });
  it("bloquea al cliente vencido cuando el bloqueo está activo (0 días de gracia)", () => {
    expect(routineBlocked({ plan: { endDate: past }, orgConfig: on, now: NOW })).toBe(true);
  });
  it("no bloquea al cliente vigente", () => {
    expect(routineBlocked({ plan: { endDate: future }, orgConfig: on, now: NOW })).toBe(false);
  });
  it("respeta los días de gracia (todavía dentro de la gracia = no bloquea)", () => {
    // venció hace 11 días; con 30 de gracia aún tiene acceso
    expect(routineBlocked({ plan: { endDate: past }, orgConfig: { blockEnabled: true, graceDays: 30 }, now: NOW })).toBe(false);
  });
  it("bloquea al pasar la gracia", () => {
    // con 5 días de gracia, 11 días vencido → bloqueado
    expect(routineBlocked({ plan: { endDate: past }, orgConfig: { blockEnabled: true, graceDays: 5 }, now: NOW })).toBe(true);
  });
  it("no bloquea a un cliente eximido", () => {
    expect(routineBlocked({ plan: { endDate: past }, orgConfig: on, billingExempt: true, now: NOW })).toBe(false);
  });
  it("no bloquea si el plan está pausado", () => {
    expect(routineBlocked({ plan: { endDate: past, paused: true }, orgConfig: on, now: NOW })).toBe(false);
  });
  it("no bloquea si no hay plan ni fecha de vencimiento", () => {
    expect(routineBlocked({ plan: null, orgConfig: on, now: NOW })).toBe(false);
    expect(routineBlocked({ plan: {}, orgConfig: on, now: NOW })).toBe(false);
  });
});

describe("graceDaysLeft", () => {
  it("positivo cuando aún hay margen", () => {
    expect(graceDaysLeft({ plan: { endDate: past }, orgConfig: { graceDays: 30 }, now: NOW })).toBeGreaterThan(0);
  });
  it("negativo cuando ya se venció la gracia", () => {
    expect(graceDaysLeft({ plan: { endDate: past }, orgConfig: { graceDays: 0 }, now: NOW })).toBeLessThan(0);
  });
  it("null si no aplica", () => {
    expect(graceDaysLeft({ plan: { paused: true, endDate: past }, orgConfig: on, now: NOW })).toBe(null);
  });
});
