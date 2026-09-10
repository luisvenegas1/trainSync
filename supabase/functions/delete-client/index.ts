// ═══════════════════════════════════════════════════════════════
//  Edge Function: delete-client
//  El ENTRENADOR (owner/trainer) elimina a un cliente POR COMPLETO: borra su fila
//  en public.users Y su cuenta de Auth (para que no queden cuentas huérfanas ni
//  links de invitación válidos). El service_role vive SOLO acá.
//
//  Orden importante: primero la fila (users.auth_user_id referencia auth.users con
//  NO ACTION), luego la cuenta Auth.
//
//  Seguridad: requiere el JWT del entrenador y que sea owner/trainer de la org del
//  cliente (o superadmin, que pasa can_write_org por la migración 0036).
//
//  Desplegar (manual): supabase functions deploy delete-client --no-verify-jwt
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

    const { client_id } = await req.json();
    if (!client_id) return json({ error: "missing_fields" }, 400);

    const caller = createClient(PROJECT_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    const admin: SB = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Cliente + su organización + su cuenta Auth vinculada.
    const { data: client } = await admin.from("users").select("id, organization_id, auth_user_id").eq("id", client_id).maybeSingle();
    if (!client) return json({ ok: true, already_gone: true }); // ya no existe

    // Autorización: caller owner/trainer de la org (o superadmin es platform_admin).
    let allowed = false;
    if (client.organization_id) {
      const { data: membership } = await admin
        .from("organization_members").select("role")
        .eq("organization_id", client.organization_id).eq("user_id", callerId).maybeSingle();
      allowed = !!membership && ["owner", "trainer"].includes(membership.role);
    }
    if (!allowed) {
      const { data: pa } = await admin.from("platform_admins").select("user_id").eq("user_id", callerId).maybeSingle();
      allowed = !!pa;
    }
    if (!allowed) return json({ error: "forbidden_not_staff" }, 403);

    // 1) Borrar la fila del cliente (quita la referencia FK a auth.users).
    const del = await admin.from("users").delete().eq("id", client_id);
    if (del.error) return json({ error: "row_delete_failed", detail: del.error.message }, 400);

    // 2) Borrar la cuenta Auth (si tenía). Tolerante si ya no existe.
    if (client.auth_user_id) {
      const au = await admin.auth.admin.deleteUser(client.auth_user_id);
      if (au.error && !String(au.error.message || "").toLowerCase().includes("not found")) {
        return json({ ok: true, row_deleted: true, auth_delete_warning: au.error.message });
      }
    }

    return json({ ok: true });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
