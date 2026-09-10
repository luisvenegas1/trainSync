import { describe, it, expect } from "vitest";
import { resolveAccess } from "./resolveAccess";

const johel = { id: "org-johel", slug: "joheltraining", status: "active" };
const tito = { id: "org-tito", slug: "titotrainer", status: "active" };

describe("resolveAccess — superadmin god-mode", () => {
  it("superadmin sin membresía entra a CUALQUIER tenant como staff", () => {
    const r = resolveAccess({ memberships: [], tenantOrg: tito, authUid: "sa", profileName: "Soporte", isSuperadmin: true });
    expect(r.status).toBe("ready");
    expect(r.role).toBe("owner");
    expect(r.appUser.role).toBe("trainer");
    expect(r.appUser.organizationId).toBe("org-tito");
  });
  it("superadmin puede entrar incluso a un tenant suspendido", () => {
    const r = resolveAccess({ memberships: [], tenantOrg: { ...tito, status: "suspended" }, authUid: "sa", isSuperadmin: true });
    expect(r.status).toBe("ready");
  });
  it("un NO superadmin sin membresía sigue bloqueado (aislamiento intacto)", () => {
    const r = resolveAccess({ memberships: [{ organizationId: "org-johel", role: "owner" }], tenantOrg: tito, authUid: "u1", isSuperadmin: false });
    expect(r.status).toBe("wrong_org");
  });
});

describe("resolveAccess — cutover Auth y aislamiento", () => {
  it("owner de Johel entra a Johel", () => {
    const r = resolveAccess({
      memberships: [{ organizationId: "org-johel", role: "owner" }],
      tenantOrg: johel,
      authUid: "u1",
      profileName: "Johel",
    });
    expect(r.status).toBe("ready");
    expect(r.role).toBe("owner");
    expect(r.appUser.role).toBe("trainer"); // UI de staff
    expect(r.appUser.organizationId).toBe("org-johel");
  });

  it("usuario de Johel NO puede entrar al hostname de Tito → wrong_org", () => {
    const r = resolveAccess({
      memberships: [{ organizationId: "org-johel", role: "owner" }],
      tenantOrg: tito,
      authUid: "u1",
    });
    expect(r.status).toBe("wrong_org");
    expect(r.appUser).toBeNull();
  });

  it("demo_viewer de Tito entra a Tito con rol demo_viewer", () => {
    const r = resolveAccess({
      memberships: [{ organizationId: "org-tito", role: "demo_viewer" }],
      tenantOrg: tito,
      authUid: "d1",
      profileName: "Demo",
    });
    expect(r.status).toBe("ready");
    expect(r.role).toBe("demo_viewer");
  });

  it("cliente ve su tenant; en otro → wrong_org", () => {
    const client = { id: "cli1", role: "user", organizationId: "org-johel" };
    expect(resolveAccess({ client, tenantOrg: johel }).status).toBe("ready");
    expect(resolveAccess({ client, tenantOrg: johel }).role).toBe("client");
    expect(resolveAccess({ client, tenantOrg: tito }).status).toBe("wrong_org");
  });

  it("sin membresía ni cliente → no_membership", () => {
    expect(resolveAccess({ tenantOrg: johel, authUid: "x" }).status).toBe("no_membership");
  });

  it("org suspendida → suspended", () => {
    const r = resolveAccess({ memberships: [{ organizationId: "org-tito", role: "owner" }], tenantOrg: { ...tito, status: "suspended" } });
    expect(r.status).toBe("suspended");
  });

  it("sin tenant resuelto → org_not_found (nunca Johel por defecto)", () => {
    expect(resolveAccess({ tenantOrg: null }).status).toBe("org_not_found");
  });
});

describe("resolveAccess — cuentas de PREPRODUCCIÓN", () => {
  // Owner/preprod: owner de joheltraining (entra por /joheltraining)
  it("owner entra a joheltraining con UI de trainer", () => {
    const r = resolveAccess({
      memberships: [{ organizationId: "org-johel", role: "owner" }],
      tenantOrg: johel,
      authUid: "owner-uid",
      profileName: "Tito",
    });
    expect(r.status).toBe("ready");
    expect(r.role).toBe("owner");
    expect(r.appUser.role).toBe("trainer");
  });

  // Demo viewer: demo_viewer de titotrainer (solo lectura)
  it("demo_viewer entra a titotrainer y su rol es demo_viewer", () => {
    const r = resolveAccess({
      memberships: [{ organizationId: "org-tito", role: "demo_viewer" }],
      tenantOrg: tito,
      authUid: "demo-uid",
    });
    expect(r.status).toBe("ready");
    expect(r.role).toBe("demo_viewer");
    expect(r.appUser.role).toBe("trainer"); // usa la UI de staff, pero solo lectura por permisos+RLS
  });
  it("demo_viewer NO puede entrar a joheltraining", () => {
    expect(
      resolveAccess({ memberships: [{ organizationId: "org-tito", role: "demo_viewer" }], tenantOrg: johel }).status
    ).toBe("wrong_org");
  });

  // Cliente demo: vinculado a demo_c1 (org titotrainer), sin membresía staff
  it("cliente demo entra a titotrainer como cliente", () => {
    const client = { id: "demo_c1", role: "user", organizationId: "org-tito" };
    const r = resolveAccess({ client, tenantOrg: tito, authUid: "client-uid" });
    expect(r.status).toBe("ready");
    expect(r.role).toBe("client");
    expect(r.appUser.id).toBe("demo_c1");
  });
  it("cliente demo NO puede entrar a joheltraining (aislamiento)", () => {
    const client = { id: "demo_c1", role: "user", organizationId: "org-tito" };
    expect(resolveAccess({ client, tenantOrg: johel }).status).toBe("wrong_org");
  });
});
