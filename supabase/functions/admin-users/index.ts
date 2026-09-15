// ═══════════════════════════════════════════════════════════════
//  Edge Function: admin-users
//  Crea / invita usuarios Auth y los vincula a una organización.
//  El service_role vive SOLO aquí (servidor), NUNCA en el frontend.
//
//  Seguridad:
//   - Requiere el JWT del que llama (Authorization: Bearer <token>).
//   - Verifica que ese usuario sea OWNER de la organización destino.
//   - Recién entonces usa service_role para crear/invitar.
//
//  Desplegar (paso manual, requiere tu Supabase):
//     supabase functions deploy admin-users
//     supabase secrets set SERVICE_ROLE_KEY=... PROJECT_URL=...
//  NO commitear secretos.
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!; // solo servidor
const ANON_KEY = Deno.env.get("ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "missing_token" }, 401);

    // Cliente con el JWT del caller (respeta RLS) para identificarlo.
    const caller = createClient(PROJECT_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    const body = await req.json();
    const { organization_id, email, role = "trainer", full_name, link_client_id, mode = "invite" } = body;
    if (!organization_id || !email) return json({ error: "missing_fields" }, 400);
    if (!["owner", "trainer", "demo_viewer"].includes(role)) return json({ error: "bad_role" }, 400);

    // Cliente admin (service_role) — solo para verificación y creación.
    const admin = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Autorización: el caller debe ser OWNER de la organización destino.
    const { data: membership } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organization_id)
      .eq("user_id", callerId)
      .maybeSingle();
    if (!membership || membership.role !== "owner") {
      return json({ error: "forbidden_not_owner" }, 403);
    }

    // Crear o invitar el usuario Auth.
    let newUserId: string;
    if (mode === "invite") {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email);
      if (error) return json({ error: "invite_failed", detail: error.message }, 400);
      newUserId = data.user.id;
    } else {
      // mode === "create": crea con contraseña temporal (se pasa aparte, no se loguea)
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
      });
      if (error) return json({ error: "create_failed", detail: error.message }, 400);
      newUserId = data.user.id;
    }

    // Perfil + membresía + (opcional) vínculo con un cliente legacy existente.
    await admin.from("profiles").upsert({ id: newUserId, full_name: full_name || null });
    await admin.from("organization_members").upsert(
      { organization_id, user_id: newUserId, role },
      { onConflict: "organization_id,user_id" },
    );
    if (link_client_id) {
      await admin.from("users").update({ auth_user_id: newUserId }).eq("id", link_client_id);
    }

    return json({ ok: true, user_id: newUserId, role });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
