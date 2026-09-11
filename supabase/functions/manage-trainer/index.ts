// ═══════════════════════════════════════════════════════════════
//  Edge Function: manage-trainer
//  El OWNER de una organización administra a sus co-entrenadores (admins):
//    - reset_password: define una nueva contraseña para el admin.
//    - update_name:    cambia el nombre visible (profiles.full_name).
//  El service_role vive SOLO acá.
//
//  Seguridad:
//   - Requiere el JWT del que llama.
//   - El que llama debe ser OWNER de una organización.
//   - El destino (target_user_id) debe ser miembro con rol 'trainer' de ESA MISMA
//     organización (no se puede tocar a otro owner ni a miembros de otras orgs).
//
//  Desplegar (manual): supabase functions deploy manage-trainer --no-verify-jwt
//  Secretos: PROJECT_URL, SERVICE_ROLE_KEY, ANON_KEY
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

    const { action, target_user_id, new_password, name, org_id } = await req.json();
    if (!action || !target_user_id) return json({ error: "missing_fields" }, 400);
    if (!["reset_password", "update_name"].includes(action)) return json({ error: "bad_action" }, 400);
    if (action === "reset_password" && (!new_password || String(new_password).length < 8)) {
      return json({ error: "weak_password" }, 400);
    }

    // Identidad del que llama.
    const caller = createClient(PROJECT_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    const admin: SB = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Org DESTINO explícita (el tenant que se administra). No se adivina por el caller.
    let orgId: string | null = org_id || null;
    const { data: superRow } = await admin
      .from("platform_admins").select("user_id").eq("user_id", callerId).maybeSingle();
    const isSuper = !!superRow;
    if (!orgId) {
      const { data: om } = await admin
        .from("organization_members").select("organization_id")
        .eq("user_id", callerId).eq("role", "owner").maybeSingle();
      orgId = om?.organization_id || null;
    }
    if (!orgId) return json({ error: "missing_org" }, 400);
    // Autorización: superadmin puede cualquier org; si no, debe ser OWNER de ESA org.
    if (!isSuper) {
      const { data: owns } = await admin
        .from("organization_members").select("id")
        .eq("user_id", callerId).eq("role", "owner").eq("organization_id", orgId).maybeSingle();
      if (!owns) return json({ error: "forbidden_not_owner" }, 403);
    }

    // El destino debe ser un 'trainer' (admin) de la MISMA organización.
    const { data: targetMembership } = await admin
      .from("organization_members").select("role")
      .eq("organization_id", orgId).eq("user_id", target_user_id).maybeSingle();
    if (!targetMembership) return json({ error: "target_not_in_org" }, 404);
    if (targetMembership.role !== "trainer") return json({ error: "target_not_editable" }, 403);

    if (action === "reset_password") {
      const upd = await admin.auth.admin.updateUserById(target_user_id, { password: String(new_password) });
      if (upd.error) return json({ error: "password_failed", detail: upd.error.message }, 400);
      return json({ ok: true });
    }

    // update_name
    const cleanName = String(name || "").trim();
    if (!cleanName) return json({ error: "empty_name" }, 400);
    const up = await admin.from("profiles").upsert({ id: target_user_id, full_name: cleanName }, { onConflict: "id" });
    if (up.error) return json({ error: "name_failed", detail: up.error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
