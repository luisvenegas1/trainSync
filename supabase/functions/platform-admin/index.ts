// ═══════════════════════════════════════════════════════════════
//  Edge Function: platform-admin
//  Backend PRIVILEGIADO del Panel de Plataforma (Tito Apps).
//  El service_role vive SOLO aquí (servidor), NUNCA en el frontend/Vite/repo.
//
//  Seguridad (obligatoria en TODA acción):
//   - Requiere el JWT del que llama (Authorization: Bearer <token>).
//   - Verifica que ese usuario esté en public.platform_admins.
//   - Recién entonces usa service_role para operar.
//   - Escribe una fila de auditoría (platform_audit_log) por acción sensible.
//   - NUNCA devuelve ni registra contraseñas/secretos.
//
//  Acciones (body.action):
//   - create_organization  → alta idempotente (org, owner, membresía, sub, branding)
//   - update_organization  → nombre/visible/slug/tipo/estado
//   - set_subscription     → plan/estado/fechas/notas
//   - suspend / reactivate  → atajos de set_subscription (demo NO se suspende)
//   - register_payment      → pago de plataforma (+ activa sub si corresponde)
//   - update_branding       → organization_settings
//
//  Desplegar (paso MANUAL, requiere tu Supabase — NO se hace solo):
//     supabase functions deploy platform-admin
//     supabase secrets set PROJECT_URL=... SERVICE_ROLE_KEY=... ANON_KEY=...
//  NO commitear secretos.
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!; // solo servidor
const ANON_KEY = Deno.env.get("ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUB_STATUSES = ["trial", "active", "past_due", "suspended", "canceled"];
const PAYMENT_METHODS = ["manual", "sinpe", "transfer", "cash", "card", "stripe", "other"];
const RESERVED_SLUGS = new Set(["platform", "admin", "api", "app", "www", "auth", "login", "static", "assets"]);

// deno-lint-ignore no-explicit-any
type SB = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "missing_token" }, 401);

    // Identidad del caller (con su propio JWT).
    const caller = createClient(PROJECT_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    // Cliente admin (service_role) — verificación + operaciones.
    const admin: SB = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // AUTORIZACIÓN CENTRAL: el caller DEBE ser platform_admin.
    const { data: pa } = await admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", callerId)
      .maybeSingle();
    if (!pa) return json({ error: "forbidden_not_platform_admin" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    switch (action) {
      case "create_organization": return await createOrganization(admin, callerId, body);
      case "update_organization": return await updateOrganization(admin, callerId, body);
      case "set_subscription":    return await setSubscription(admin, callerId, body);
      case "suspend":             return await setSubscription(admin, callerId, { ...body, status: "suspended", _audit: "subscription.suspended" });
      case "reactivate":          return await setSubscription(admin, callerId, { ...body, status: "active", _audit: "subscription.reactivated" });
      case "register_payment":    return await registerPayment(admin, callerId, body);
      case "update_branding":     return await updateBranding(admin, callerId, body);
      default: return json({ error: "unknown_action", action }, 400);
    }
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

// ── Auditoría (nunca guarda secretos) ──────────────────────────
async function audit(admin: SB, actor: string, action: string, org: string | null, metadata: unknown) {
  try {
    await admin.from("platform_audit_log").insert({
      actor_user_id: actor, action, organization_id: org, metadata: metadata || {},
    });
  } catch (_) { /* la auditoría no debe tumbar la operación */ }
}

function normalizeSlug(input: string): string {
  return String(input || "").toLowerCase().trim()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

// ── create_organization: alta IDEMPOTENTE, sin datos a medias ──
async function createOrganization(admin: SB, actor: string, body: SB) {
  const name = String(body.name || "").trim();
  const displayName = String(body.displayName || "").trim() || name;
  const slug = normalizeSlug(body.slug || body.name);
  const ownerName = String(body.ownerName || "").trim();
  const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
  const plan = String(body.plan || "base").trim() || "base";
  const initialStatus = body.initialStatus === "active" ? "active" : "trial";
  const tenantType = body.tenantType || "production";
  const branding = body.branding || {};

  if (!name) return json({ error: "missing_name" }, 400);
  if (slug.length < 3) return json({ error: "bad_slug" }, 400);
  if (RESERVED_SLUGS.has(slug)) return json({ error: "reserved_slug" }, 400);
  if (!ownerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) return json({ error: "bad_owner" }, 400);

  const steps: Record<string, string> = {};

  // 1) Organización (idempotente por slug único). Si el slug existe pero es de
  //    OTRA org sin terminar, se reutiliza; si es de una org ya completa, error.
  let { data: org } = await admin.from("organizations").select("*").eq("slug", slug).maybeSingle();
  if (!org) {
    const ins = await admin.from("organizations")
      .insert({ name, slug, tenant_type: tenantType, status: "active" })
      .select("*").single();
    if (ins.error) return json({ error: "org_create_failed", detail: ins.error.message, steps }, 400);
    org = ins.data;
    steps.organization = "created";
  } else {
    steps.organization = "exists";
  }
  const orgId = org.id;

  // 2) Owner Auth: buscar por email; si no existe, invitar (sin contraseñas manuales).
  let ownerId: string | null = null;
  const { data: list } = await admin.auth.admin.listUsers();
  const existingUser = list?.users?.find((u: SB) => (u.email || "").toLowerCase() === ownerEmail);
  if (existingUser) {
    ownerId = existingUser.id;
    steps.owner_user = "exists";
  } else {
    // Redirigir la invitación al SUBDOMINIO de SU organización (slug.tito-apps.com):
    // al instalar la PWA desde el correo abre el tenant correcto (robusto en iOS).
    // El wildcard https://*.tito-apps.com debe estar en la lista de Redirect URLs.
    const rootDomain = Deno.env.get("APP_ROOT_DOMAIN") || "tito-apps.com";
    const inv = await admin.auth.admin.inviteUserByEmail(ownerEmail, {
      data: { full_name: ownerName },
      redirectTo: slug ? `https://${slug}.${rootDomain}` : `https://trainingapp.${rootDomain}`,
    });
    if (inv.error) {
      // No dejar la org "a medias" en silencio: reportar dónde falló para reintentar.
      return json({ error: "owner_invite_failed", detail: inv.error.message, organization_id: orgId, steps }, 400);
    }
    ownerId = inv.data.user.id;
    steps.owner_user = "invited";
  }

  // 3) Perfil + membresía owner (idempotente).
  await admin.from("profiles").upsert({ id: ownerId, full_name: ownerName });
  const mem = await admin.from("organization_members")
    .upsert({ organization_id: orgId, user_id: ownerId, role: "owner" }, { onConflict: "organization_id,user_id" });
  if (mem.error) return json({ error: "membership_failed", detail: mem.error.message, organization_id: orgId, steps }, 400);
  steps.membership = "ok";

  // 4) Suscripción inicial (idempotente por org única).
  const sub = await admin.from("organization_subscriptions").upsert(
    { organization_id: orgId, plan, status: initialStatus, provider: "manual", started_at: new Date().toISOString() },
    { onConflict: "organization_id" },
  );
  if (sub.error) return json({ error: "subscription_failed", detail: sub.error.message, organization_id: orgId, steps }, 400);
  steps.subscription = "ok";

  // 5) Branding inicial (idempotente por org única).
  const settings: Record<string, unknown> = { organization_id: orgId, display_name: displayName };
  if (branding.logoUrl) settings.logo_url = branding.logoUrl;
  if (branding.primaryColor) settings.primary_color = branding.primaryColor;
  if (branding.secondaryColor) settings.secondary_color = branding.secondaryColor;
  const set = await admin.from("organization_settings").upsert(settings, { onConflict: "organization_id" });
  if (set.error) return json({ error: "branding_failed", detail: set.error.message, organization_id: orgId, steps }, 400);
  steps.branding = "ok";

  await audit(admin, actor, "org.created", orgId, { slug, name, owner_email: ownerEmail, steps });
  return json({ ok: true, organization_id: orgId, slug, owner_user_id: ownerId, steps });
}

// ── update_organization ────────────────────────────────────────
async function updateOrganization(admin: SB, actor: string, body: SB) {
  const orgId = body.organization_id;
  if (!orgId) return json({ error: "missing_org" }, 400);
  const patch: Record<string, unknown> = {};
  if (body.name != null) patch.name = String(body.name).trim();
  if (body.tenant_type != null) patch.tenant_type = body.tenant_type;
  if (body.status != null) patch.status = body.status;
  if (body.slug != null) {
    const slug = normalizeSlug(body.slug);
    if (slug.length < 3 || RESERVED_SLUGS.has(slug)) return json({ error: "bad_slug" }, 400);
    // Unicidad: no chocar con otra org.
    const { data: clash } = await admin.from("organizations").select("id").eq("slug", slug).neq("id", orgId).maybeSingle();
    if (clash) return json({ error: "slug_taken" }, 409);
    patch.slug = slug;
  }
  if (Object.keys(patch).length) {
    const up = await admin.from("organizations").update(patch).eq("id", orgId);
    if (up.error) return json({ error: "update_failed", detail: up.error.message }, 400);
  }
  if (body.displayName != null) {
    await admin.from("organization_settings").upsert(
      { organization_id: orgId, display_name: String(body.displayName).trim() },
      { onConflict: "organization_id" },
    );
  }
  await audit(admin, actor, "org.updated", orgId, { patch, displayName: body.displayName ?? null });
  return json({ ok: true, organization_id: orgId });
}

// ── set_subscription (plan/estado/fechas/notas) ────────────────
async function setSubscription(admin: SB, actor: string, body: SB) {
  const orgId = body.organization_id;
  const status = body.status;
  if (!orgId) return json({ error: "missing_org" }, 400);
  if (!SUB_STATUSES.includes(status)) return json({ error: "bad_status" }, 400);

  // La demo nunca se bloquea por reglas comerciales.
  if (["suspended", "canceled", "past_due"].includes(status)) {
    const { data: org } = await admin.from("organizations").select("tenant_type").eq("id", orgId).maybeSingle();
    if (org?.tenant_type === "demo") return json({ error: "demo_cannot_be_blocked" }, 400);
  }

  const patch: Record<string, unknown> = { organization_id: orgId, status };
  if (body.plan != null) patch.plan = String(body.plan).trim();
  if (body.current_period_end !== undefined) patch.current_period_end = body.current_period_end;
  if (body.grace_period_ends_at !== undefined) patch.grace_period_ends_at = body.grace_period_ends_at;
  if (body.started_at !== undefined) patch.started_at = body.started_at;
  if (body.admin_notes !== undefined) patch.admin_notes = body.admin_notes;

  const up = await admin.from("organization_subscriptions").upsert(patch, { onConflict: "organization_id" });
  if (up.error) return json({ error: "subscription_update_failed", detail: up.error.message }, 400);

  await audit(admin, actor, body._audit || "subscription.updated", orgId, { status, plan: body.plan ?? null });
  return json({ ok: true, organization_id: orgId, status });
}

// ── register_payment (+ activa sub si corresponde) ─────────────
async function registerPayment(admin: SB, actor: string, body: SB) {
  const orgId = body.organization_id;
  const amount = Number(body.amount);
  const method = body.method || "manual";
  if (!orgId) return json({ error: "missing_org" }, 400);
  if (!(amount > 0)) return json({ error: "bad_amount" }, 400);
  if (!body.paid_at) return json({ error: "missing_paid_at" }, 400);
  if (!PAYMENT_METHODS.includes(method)) return json({ error: "bad_method" }, 400);

  const ins = await admin.from("platform_payments").insert({
    organization_id: orgId,
    amount,
    currency: String(body.currency || "CRC").toUpperCase(),
    paid_at: body.paid_at,
    period_start: body.period_start || null,
    period_end: body.period_end || null,
    method,
    reference: body.reference || null,
    note: body.note || null,
    recorded_by: actor,
  }).select("id").single();
  if (ins.error) return json({ error: "payment_failed", detail: ins.error.message }, 400);

  // Activar la suscripción si se pidió (y no está cancelada).
  let subUpdated = false;
  if (body.activate_subscription) {
    const { data: cur } = await admin.from("organization_subscriptions").select("status").eq("organization_id", orgId).maybeSingle();
    if (cur?.status !== "canceled") {
      const patch: Record<string, unknown> = { organization_id: orgId, status: "active" };
      if (body.period_end) patch.current_period_end = body.period_end;
      await admin.from("organization_subscriptions").upsert(patch, { onConflict: "organization_id" });
      subUpdated = true;
    }
  }

  await audit(admin, actor, "payment.recorded", orgId, { amount, currency: body.currency, method, subUpdated });
  return json({ ok: true, payment_id: ins.data.id, subscription_activated: subUpdated });
}

// ── update_branding ────────────────────────────────────────────
async function updateBranding(admin: SB, actor: string, body: SB) {
  const orgId = body.organization_id;
  if (!orgId) return json({ error: "missing_org" }, 400);
  const patch: Record<string, unknown> = { organization_id: orgId };
  const fields = [
    "display_name", "logo_url", "favicon_url", "trainer_photo_url", "primary_color",
    "secondary_color", "tagline", "bio", "whatsapp", "instagram", "contact_email", "call_to_action",
  ];
  for (const key of fields) {
    if (body[key] !== undefined) patch[key] = body[key];
  }
  const up = await admin.from("organization_settings").upsert(patch, { onConflict: "organization_id" });
  if (up.error) return json({ error: "branding_failed", detail: up.error.message }, 400);
  await audit(admin, actor, "org.branding_updated", orgId, { fields: Object.keys(patch).filter((k) => k !== "organization_id") });
  return json({ ok: true, organization_id: orgId });
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
