// ═══════════════════════════════════════════════════════════════
//  Edge Function: invite-client
//  El ENTRENADOR (owner/trainer) invita a un CLIENTE por correo: crea/enlaza su
//  cuenta Auth y la vincula a su fila en public.users. El cliente recibe un correo
//  para crear su PROPIA contraseña (no se manejan contraseñas temporales).
//  El service_role vive SOLO acá.
//
//  Seguridad:
//   - Requiere el JWT del entrenador que llama.
//   - Verifica que sea owner/trainer de la organización del cliente.
//   - Recién entonces invita/enlaza con service_role.
//
//  NOTA: el cliente NO es miembro de la organización (no se crea membership); solo
//  se enlaza users.auth_user_id para que pueda ver SUS datos bajo RLS.
//
//  Desplegar (manual): supabase functions deploy invite-client --no-verify-jwt
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "missing_token" }, 401);

    const { client_id, email } = await req.json();
    if (!client_id || !email) return json({ error: "missing_fields" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) return json({ error: "bad_email" }, 400);
    const emailNorm = String(email).trim().toLowerCase();

    // Identidad del entrenador que llama.
    const caller = createClient(PROJECT_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    // deno-lint-ignore no-explicit-any
    const admin: any = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // Cliente destino + su organización.
    const { data: client } = await admin.from("users").select("id, organization_id, name").eq("id", client_id).maybeSingle();
    if (!client) return json({ error: "client_not_found" }, 404);
    if (!client.organization_id) return json({ error: "client_without_org" }, 400);

    // Autorización: el caller debe ser owner/trainer de la org del cliente.
    const { data: membership } = await admin
      .from("organization_members").select("role")
      .eq("organization_id", client.organization_id).eq("user_id", callerId).maybeSingle();
    if (!membership || !["owner", "trainer"].includes(membership.role)) {
      return json({ error: "forbidden_not_staff" }, 403);
    }

    // Slug de la org para redirigir la invitación a su login.
    const { data: org } = await admin.from("organizations").select("slug").eq("id", client.organization_id).maybeSingle();
    // El link del correo apunta al SUBDOMINIO del tenant (slug.tito-apps.com), no a
    // la ruta. Así, al instalar la PWA desde ese link, la app abre el tenant correcto
    // (en iOS el start_url por ruta es poco confiable; por subdominio la raíz ya es del tenant).
    const rootDomain = Deno.env.get("APP_ROOT_DOMAIN") || "tito-apps.com";
    const redirectTo = org?.slug ? `https://${org.slug}.${rootDomain}` : `https://trainingapp.${rootDomain}`;

    // Buscar el usuario Auth por correo; si no existe, invitarlo.
    let authId: string | null = null;
    let invited = false;
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find((u: SB) => (u.email || "").toLowerCase() === emailNorm);
    if (existing) {
      authId = existing.id;
    } else {
      const inv = await admin.auth.admin.inviteUserByEmail(emailNorm, {
        data: { full_name: client.name || "" },
        redirectTo,
      });
      if (inv.error) return json({ error: "invite_failed", detail: inv.error.message }, 400);
      authId = inv.data.user.id;
      invited = true;
    }

    // Vincular la cuenta Auth con la fila del cliente.
    const upd = await admin.from("users").update({ auth_user_id: authId, email: emailNorm }).eq("id", client_id);
    if (upd.error) return json({ error: "link_failed", detail: upd.error.message }, 400);

    return json({ ok: true, invited });
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

// deno-lint-ignore no-explicit-any
type SB = any;

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
