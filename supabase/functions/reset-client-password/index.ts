// ═══════════════════════════════════════════════════════════════
//  Edge Function: reset-client-password
//  Permite que un ENTRENADOR (owner/trainer) resetee la contraseña de un
//  cliente de SU organización. El service_role vive SOLO aquí (servidor).
//
//  Seguridad:
//   - Requiere el JWT del que llama (Authorization: Bearer <token>).
//   - Carga la fila del cliente (public.users) y su organization_id.
//   - Verifica que el caller sea owner/trainer de ESA organización.
//   - Solo entonces usa service_role para cambiar la contraseña Auth del cliente.
//   - El cliente debe tener auth_user_id (cuenta de correo vinculada).
//
//  Desplegar (paso MANUAL):
//     supabase functions deploy reset-client-password
//     (usa los mismos secretos PROJECT_URL / SERVICE_ROLE_KEY / ANON_KEY)
//  NO commitear secretos.
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
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
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "missing_token" }, 401);

    const { client_id, new_password } = await req.json();
    if (!client_id || !new_password) return json({ error: "missing_fields" }, 400);
    if (String(new_password).length < 6) return json({ error: "password_too_short" }, 400);

    // Identidad del caller.
    const caller = createClient(PROJECT_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    // service_role para verificar y actuar.
    // deno-lint-ignore no-explicit-any
    const admin: any = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Cliente destino + su organización.
    const { data: client } = await admin
      .from("users")
      .select("id, organization_id, auth_user_id")
      .eq("id", client_id)
      .maybeSingle();
    if (!client) return json({ error: "client_not_found" }, 404);
    if (!client.organization_id) return json({ error: "client_without_org" }, 400);
    if (!client.auth_user_id) return json({ error: "client_no_auth" }, 400);

    // Autorización: el caller debe ser owner/trainer de la org del cliente.
    const { data: membership } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", client.organization_id)
      .eq("user_id", callerId)
      .maybeSingle();
    if (!membership || !["owner", "trainer"].includes(membership.role)) {
      return json({ error: "forbidden_not_staff" }, 403);
    }

    // Cambiar la contraseña Auth del cliente.
    const { error } = await admin.auth.admin.updateUserById(client.auth_user_id, { password: new_password });
    if (error) return json({ error: "update_failed", detail: error.message }, 400);

    return json({ ok: true });
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
