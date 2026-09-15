import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { routinesSelectAllowed } from "./routinesAccess";

const here = dirname(fileURLToPath(import.meta.url));
// Las migraciones históricas (ya aplicadas en prod) viven en migrations_archive/
// desde que adoptamos un baseline para desarrollo local. Este test valida el SQL de 0021.
const mig0021 = resolve(here, "../../supabase/migrations_archive/0021_platform_admin_reads.sql");

describe("routines_select — no se pierde el acceso a rutinas asignadas (0018 + 0021)", () => {
  it("un cliente ASIGNADO (no dueño legacy) SÍ puede leer su rutina", () => {
    expect(routinesSelectAllowed({
      isOrgMember: false, isLegacyOwner: false, isAssigned: true, operationalAllowed: true,
    })).toBe(true);
  });
  it("un cliente dueño legacy también puede leerla", () => {
    expect(routinesSelectAllowed({ isLegacyOwner: true, isAssigned: false })).toBe(true);
  });
  it("el staff de la org puede leer", () => {
    expect(routinesSelectAllowed({ isOrgMember: true })).toBe(true);
  });
  it("el superadmin lee transversalmente aunque no sea miembro", () => {
    expect(routinesSelectAllowed({ isSuperadmin: true, isOrgMember: false, operationalAllowed: false })).toBe(true);
  });
  it("un cliente sin relación NO puede leer", () => {
    expect(routinesSelectAllowed({ isOrgMember: false, isLegacyOwner: false, isAssigned: false })).toBe(false);
  });
  it("se respeta el gate de suscripción para no-superadmin", () => {
    expect(routinesSelectAllowed({ isAssigned: true, operationalAllowed: false })).toBe(false);
  });
});

describe("0021_platform_admin_reads.sql — la policy conserva client_owns_routine", () => {
  const sql = readFileSync(mig0021, "utf8");
  // Aísla el bloque de la policy routines_select.
  const block = sql.slice(sql.indexOf("create policy routines_select"));

  it("usa public.client_owns_routine(id) (soporte de asignaciones de 0018)", () => {
    expect(block).toContain("public.client_owns_routine(id)");
  });
  it("NO regresa a user_id = public.current_client_id() en routines_select", () => {
    expect(block).not.toMatch(/user_id\s*=\s*public\.current_client_id\(\)/);
  });
  it("conserva superadmin y el gate operacional", () => {
    expect(block).toContain("public.is_superadmin()");
    expect(block).toContain("public.org_operational_allowed(organization_id)");
  });
});
