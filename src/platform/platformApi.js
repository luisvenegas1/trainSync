// ═══════════════════════════════════════════════════════════════
//  Capa de datos del Panel de Plataforma.
//   - LECTURAS: directas con la clave anon + JWT (bajo RLS, gated a superadmin
//     por 0021; con RLS apagado, funcionan igual). Solo lectura.
//   - MUTACIONES PRIVILEGIADAS: SIEMPRE por la Edge Function `platform-admin`
//     (verifica platform_admins con service_role del lado servidor). El frontend
//     NUNCA usa service_role.
// ═══════════════════════════════════════════════════════════════
import { sb } from "../supabase";

// Invoca la Edge Function segura. Devuelve { ok, data, error }.
export async function invokePlatform(action, payload = {}) {
  try {
    const { data, error } = await sb.functions.invoke("platform-admin", {
      body: { action, ...payload },
    });
    if (error) {
      // La función responde con status !=2xx → supabase-js lo trae en error.context
      let detail = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.error) detail = body.detail ? `${body.error}: ${body.detail}` : body.error;
      } catch { /* ignore */ }
      return { ok: false, error: detail, data: null };
    }
    if (data && data.error) return { ok: false, error: data.detail ? `${data.error}: ${data.detail}` : data.error, data };
    return { ok: true, data, error: null };
  } catch (e) {
    return { ok: false, error: String(e?.message || e), data: null };
  }
}

// Carga TODO lo necesario para el panel y lo agrega por organización.
export async function loadPlatformData() {
  const [orgsR, subsR, membersR, profilesR, usersR, settingsR, paymentsR, auditR] = await Promise.all([
    sb.from("organizations").select("*").order("created_at", { ascending: false }),
    sb.from("organization_subscriptions").select("*"),
    sb.from("organization_members").select("organization_id, user_id, role"),
    sb.from("profiles").select("id, full_name"),
    sb.from("users").select("id, organization_id, role"),
    sb.from("organization_settings").select("*"),
    sb.from("platform_payments").select("*").order("paid_at", { ascending: false }).limit(100),
    sb.from("platform_audit_log").select("*").order("created_at", { ascending: false }).limit(100),
  ]);

  const firstError = [orgsR, subsR, membersR].find((r) => r.error);
  if (firstError) throw firstError.error;

  const subs = subsR.data || [];
  const members = membersR.data || [];
  const profiles = profilesR.data || [];
  const users = usersR.data || [];
  const payments = paymentsR.data || [];
  const audit = auditR.data || [];

  const profileName = new Map(profiles.map((p) => [p.id, p.full_name]));
  const subByOrg = new Map(subs.map((s) => [s.organization_id, s]));
  const settingsByOrg = new Map((settingsR.data || []).map((s) => [s.organization_id, s]));

  const memberCount = new Map();
  const ownerByOrg = new Map();
  for (const m of members) {
    memberCount.set(m.organization_id, (memberCount.get(m.organization_id) || 0) + 1);
    if (m.role === "owner" && !ownerByOrg.has(m.organization_id)) ownerByOrg.set(m.organization_id, m.user_id);
  }
  const clientCount = new Map();
  for (const u of users) {
    if (u.role === "trainer") continue; // el entrenador no cuenta como cliente
    clientCount.set(u.organization_id, (clientCount.get(u.organization_id) || 0) + 1);
  }

  const organizations = (orgsR.data || []).map((o) => {
    const s = subByOrg.get(o.id) || null;
    const st = settingsByOrg.get(o.id) || {};
    const ownerId = ownerByOrg.get(o.id) || null;
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      tenantType: o.tenant_type,
      tenant_type: o.tenant_type, // compat con lógica pura
      status: o.status,
      createdAt: o.created_at,
      subStatus: s?.status || null,
      plan: s?.plan || null,
      currentPeriodEnd: s?.current_period_end || null,
      gracePeriodEndsAt: s?.grace_period_ends_at || null,
      startedAt: s?.started_at || null,
      adminNotes: s?.admin_notes || "",
      ownerUserId: ownerId,
      ownerName: ownerId ? profileName.get(ownerId) || "—" : "—",
      memberCount: memberCount.get(o.id) || 0,
      clientCount: clientCount.get(o.id) || 0,
      // Branding guardado (para precargar la pestaña Branding).
      settings: {
        displayName: st.display_name || "",
        tagline: st.tagline || "",
        logoUrl: st.logo_url || "",
        faviconUrl: st.favicon_url || "",
        trainerPhotoUrl: st.trainer_photo_url || "",
        primaryColor: st.primary_color || "#1A5DC8",
        secondaryColor: st.secondary_color || "#0B1F4B",
        whatsapp: st.whatsapp || "",
        instagram: st.instagram || "",
        contactEmail: st.contact_email || "",
        bio: st.bio || "",
        featureOverrides: st.feature_overrides || {},
      },
    };
  });

  return { organizations, payments, audit };
}

export const existingSlugsOf = (orgs) => (orgs || []).map((o) => o.slug);
export const paymentsForOrg = (payments, orgId) => (payments || []).filter((p) => p.organization_id === orgId);
export const auditForOrg = (audit, orgId) => (audit || []).filter((a) => a.organization_id === orgId);
