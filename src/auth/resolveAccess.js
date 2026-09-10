// Decide, de forma PURA, el acceso de un usuario autenticado al TENANT solicitado.
// No consulta la red: recibe memberships (del usuario), el cliente vinculado (o null)
// y la organización resuelta por hostname/slug. Testeable en aislamiento.
//
// Estados de salida:
//   ready         → acceso concedido (role: owner|trainer|demo_viewer|client)
//   org_not_found → no se resolvió organización para el hostname/slug
//   suspended     → la organización no está activa
//   wrong_org     → autenticado, pero pertenece a OTRA organización (no a este tenant)
//   no_membership → autenticado, pero sin membresía ni cliente en ninguna org
export function resolveAccess({
  memberships = [],
  client = null,
  tenantOrg = null,
  authUid = null,
  profileName = null,
  isSuperadmin = false,
} = {}) {
  if (!tenantOrg) return { status: "org_not_found", role: null, appUser: null };
  // El superadmin (platform_admins) puede entrar a cualquier tenant, incluso
  // suspendido (para soporte). Si además es miembro/cliente, se usa esa vía (abajo).
  if (tenantOrg.status && tenantOrg.status !== "active" && !isSuperadmin) {
    return { status: "suspended", role: null, appUser: null };
  }

  // Staff (owner/trainer/demo_viewer) con membresía en ESTE tenant.
  const staff = memberships.find((m) => m.organizationId === tenantOrg.id);
  if (staff) {
    return {
      status: "ready",
      role: staff.role,
      appUser: {
        id: authUid,
        name: profileName || "Entrenador",
        username: profileName || "",
        role: "trainer", // la UI de staff usa el rol 'trainer'
        organizationId: tenantOrg.id,
        plan: {},
      },
    };
  }

  // Cliente vinculado a ESTE tenant.
  if (client && client.organizationId === tenantOrg.id) {
    return { status: "ready", role: "client", appUser: client };
  }

  // Superadmin sin membresía en esta org → acceso god-mode como staff (owner).
  if (isSuperadmin) {
    return {
      status: "ready",
      role: "owner",
      appUser: {
        id: authUid,
        name: profileName || "Soporte",
        username: profileName || "",
        role: "trainer",
        organizationId: tenantOrg.id,
        plan: {},
      },
    };
  }

  // Autenticado pero pertenece a otra organización (ej. Johel entrando a Tito) o a
  // ninguna. Nunca se le da acceso a datos de este tenant.
  if (memberships.length > 0 || client) return { status: "wrong_org", role: null, appUser: null };
  return { status: "no_membership", role: null, appUser: null };
}
