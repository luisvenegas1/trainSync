// ═══════════════════════════════════════════════════════════════
//  Edge Function: invite-trainer
//  El OWNER de una organización invita a un ADMIN/CO-ENTRENADOR por correo.
//  Crea/enlaza su cuenta Auth y lo agrega como miembro (role='trainer') de la
//  organización. El nuevo admin recibe un correo para crear su PROPIA contraseña.
//  El service_role vive SOLO acá.
//
//  Seguridad:
//   - Requiere el JWT del que llama.
//   - El que llama debe ser OWNER de la organización (no basta con ser trainer):
//     agregar administradores es una acción sensible.
//   - Recién entonces invita/enlaza con service_role.
//
//  Desplegar (manual): supabase functions deploy invite-trainer --no-verify-jwt
//  Secretos: PROJECT_URL, SERVICE_ROLE_KEY, ANON_KEY (+ APP_BASE_URL opcional)
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// deno-lint-ignore no-explicit-any
type SB = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "missing_token" }, 401);

    const { email, name } = await req.json();
    if (!email) return json({ error: "missing_fields" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return json({ error: "bad_email" }, 400);
    const emailNorm = String(email).trim().toLowerCase();
    const fullName = String(name || "").trim();

    // Identidad del que llama.
    const caller = createClient(PROJECT_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    const admin: SB = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Autorización: el caller debe ser OWNER de alguna organización.
    const { data: ownerMembership } = await admin
      .from("organization_members").select("organization_id, role")
      .eq("user_id", callerId).eq("role", "owner").maybeSingle();
    if (!ownerMembership) return json({ error: "forbidden_not_owner" }, 403);
    const orgId = ownerMembership.organization_id;

    // Slug de la org para redirigir la invitación a su login.
    const { data: org } = await admin.from("organizations").select("slug").eq("id", orgId).maybeSingle();
    const appBase = Deno.env.get("APP_BASE_URL") || "https://trainingapp.tito-apps.com";
    const redirectTo = `${appBase}/${org?.slug || ""}`;

    // Buscar el usuario Auth por correo; si no existe, invitarlo.
    let authId: string | null = null;
    let invited = false;
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find((u: SB) => (u.email || "").toLowerCase() === emailNorm);
    if (existing) {
      authId = existing.id;
    } else {
      const inv = await admin.auth.admin.inviteUserByEmail(emailNorm, {
        data: { full_name: fullName },
        redirectTo,
      });
      if (inv.error) return json({ error: "invite_failed", detail: inv.error.message }, 400);
      authId = inv.data.user.id;
      invited = true;
    }

    // Perfil (nombre visible). Upsert idempotente.
    if (fullName) {
      await admin.from("profiles").upsert({ id: authId, full_name: fullName }, { onConflict: "id" });
    }

    // Evitar duplicar: ¿ya es miembro de esta org?
    const { data: already } = await admin
      .from("organization_members").select("id, role")
      .eq("organization_id", orgId).eq("user_id", authId).maybeSingle();
    if (already) {
      return json({ ok: true, invited, already_member: true, role: already.role });
    }

    // Agregar como co-entrenador (role='trainer'). Nunca como owner (evita escalado).
    const ins = await admin.from("organization_members").insert({
      organization_id: orgId, user_id: authId, role: "trainer",
    });
    if (ins.error) return json({ error: "member_insert_failed", detail: ins.error.message }, 400);

    return json({ ok: true, invited });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
