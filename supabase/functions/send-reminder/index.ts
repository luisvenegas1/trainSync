// ═══════════════════════════════════════════════════════════════
//  Edge Function: send-reminder  (envío MANUAL, con JWT del que llama)
//  Dos tipos:
//    kind="client" → reenvía AHORA el recordatorio de pago a un cliente.
//        Autorizado: superadmin, o owner/trainer de la organización del cliente.
//        Registra en payment_reminder_logs con reminder_type='manual' y sent_by.
//    kind="saas"   → avisa a un ENTRENADOR (dueño de tenant) sobre su pago del SaaS.
//        Autorizado: SOLO superadmin. Registra en saas_payment_notices.
//  Ambos envían por Resend. A diferencia del cron, NO dependen de la ventana de días
//  ni del anti-duplicados (el manual se puede repetir).
//
//  Desplegar (manual): supabase functions deploy send-reminder --no-verify-jwt
//  Secretos: PROJECT_URL, SERVICE_ROLE_KEY, ANON_KEY, RESEND_API_KEY, REMINDER_FROM
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("ANON_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const REMINDER_FROM = Deno.env.get("REMINDER_FROM") || "TrainSync <no-reply@tito-apps.com>";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// deno-lint-ignore no-explicit-any
type SB = any;
const todayIso = () => new Date().toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    if (!token) return json({ error: "missing_token" }, 401);

    const caller = createClient(PROJECT_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "invalid_token" }, 401);
    const callerId = userData.user.id;

    const admin: SB = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: superRow } = await admin.from("platform_admins").select("user_id").eq("user_id", callerId).maybeSingle();
    const isSuper = !!superRow;

    const body = await req.json().catch(() => ({}));
    const kind = body?.kind;

    if (kind === "client") return await sendClient(admin, callerId, isSuper, body);
    if (kind === "saas") {
      if (!isSuper) return json({ error: "forbidden_not_platform_admin" }, 403);
      return await sendSaas(admin, callerId, body);
    }
    return json({ error: "unknown_kind", kind }, 400);
  } catch (e) {
    return json({ error: "server_error", detail: String(e) }, 500);
  }
});

// ── Reenvío manual del recordatorio de pago a un CLIENTE ─────────
async function sendClient(admin: SB, callerId: string, isSuper: boolean, body: SB) {
  const clientId = String(body?.client_id || "");
  if (!clientId) return json({ error: "missing_client" }, 400);

  const { data: client } = await admin
    .from("users").select("id, name, email, plan_end_date, organization_id")
    .eq("id", clientId).maybeSingle();
  if (!client) return json({ error: "client_not_found" }, 404);
  const orgId = client.organization_id;
  if (!orgId) return json({ error: "client_without_org" }, 400);

  // Autorización: superadmin, u owner/trainer de la org del cliente.
  if (!isSuper) {
    const { data: mem } = await admin
      .from("organization_members").select("role")
      .eq("organization_id", orgId).eq("user_id", callerId).maybeSingle();
    if (!mem || !["owner", "trainer"].includes(mem.role)) return json({ error: "forbidden" }, 403);
  }
  if (!client.email) return json({ error: "client_without_email" }, 400);

  // Branding del tenant para el correo.
  const { data: st } = await admin
    .from("organization_settings").select("display_name, logo_url, primary_color")
    .eq("organization_id", orgId).maybeSingle();
  const brand = { name: st?.display_name || "TrainSync", logo: st?.logo_url || "", primary: st?.primary_color || "#0B1F4B" };
  const due = client.plan_end_date ? String(client.plan_end_date).slice(0, 10) : todayIso();

  // Registrar el intento (manual: sin anti-duplicados, se puede repetir).
  const ins = await admin.from("payment_reminder_logs").insert({
    organization_id: orgId, client_id: clientId, due_date: due,
    reminder_type: "manual", scheduled_for: todayIso(), status: "pending", sent_by: callerId,
  }).select("id").maybeSingle();
  const logId = ins.data?.id;

  try {
    await sendClientEmail(client.email, client.name || "", due, brand);
    if (logId) await admin.from("payment_reminder_logs").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", logId);
    return json({ ok: true, to: client.email });
  } catch (e) {
    if (logId) await admin.from("payment_reminder_logs").update({ status: "failed", error_message: String(e).slice(0, 500) }).eq("id", logId);
    return json({ error: "send_failed", detail: String(e).slice(0, 200) }, 502);
  }
}

// ── Aviso de pago del SaaS a un ENTRENADOR (dueño de tenant) ─────
async function sendSaas(admin: SB, callerId: string, body: SB) {
  const orgId = String(body?.organization_id || "");
  const note = String(body?.note || "").slice(0, 500);
  if (!orgId) return json({ error: "missing_org" }, 400);

  const { data: org } = await admin.from("organizations").select("id, name").eq("id", orgId).maybeSingle();
  if (!org) return json({ error: "org_not_found" }, 404);

  // Owner del tenant + su correo (auth.users).
  const { data: ownerMem } = await admin
    .from("organization_members").select("user_id")
    .eq("organization_id", orgId).eq("role", "owner").maybeSingle();
  if (!ownerMem) return json({ error: "owner_not_found" }, 404);
  const { data: ownerUser } = await admin.auth.admin.getUserById(ownerMem.user_id);
  const ownerEmail = ownerUser?.user?.email || "";
  if (!ownerEmail) return json({ error: "owner_without_email" }, 400);
  const ownerName = ownerUser?.user?.user_metadata?.full_name || org.name || "";

  let status = "sent"; let errorMsg: string | null = null;
  try {
    await sendSaasEmail(ownerEmail, ownerName, org.name || "tu organización", note);
  } catch (e) { status = "failed"; errorMsg = String(e).slice(0, 500); }

  await admin.from("saas_payment_notices").insert({
    organization_id: orgId, sent_by: callerId, sent_to_email: ownerEmail, note: note || null,
    status, error_message: errorMsg,
  });
  if (status === "failed") return json({ error: "send_failed", detail: errorMsg }, 502);
  return json({ ok: true, to: ownerEmail });
}

// ── Correos ─────────────────────────────────────────────────────
function fromForName(name: string): string {
  const m = REMINDER_FROM.match(/<([^>]+)>/);
  const addr = m ? m[1] : REMINDER_FROM;
  return `${name} <${addr}>`;
}

async function sendClientEmail(to: string, name: string, dueDate: string, brand: { name: string; logo: string; primary: string }) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY no configurada");
  const primary = brand.primary || "#0B1F4B";
  const orgName = brand.name || "TrainSync";
  const header = brand.logo
    ? `<img src="${brand.logo}" alt="${escapeHtml(orgName)}" style="max-height:52px;max-width:200px;object-fit:contain"/>`
    : `<span style="color:#fff;font-weight:800;letter-spacing:1px;font-size:20px">${escapeHtml(orgName)}</span>`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#F1F5F9;padding:24px">
    <div style="max-width:440px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
      <div style="background:${primary};padding:22px;text-align:center">${header}</div>
      <div style="padding:28px">
        <div style="font-size:20px;font-weight:800;color:${primary};margin-bottom:8px">Recordatorio de pago</div>
        <p style="font-size:14px;color:#475569;line-height:1.6">Hola ${escapeHtml(name)}, te recordamos tu mensualidad con <strong>${escapeHtml(orgName)}</strong> (vence el <strong>${escapeHtml(dueDate)}</strong>). Coordiná el pago con tu entrenador para no perder el acceso.</p>
        <p style="font-size:12px;color:#94A3B8;margin-top:16px">Recordatorio enviado a través de TrainSync.</p>
      </div>
    </div>
  </div>`;
  await resend(fromForName(orgName), to, `Recordatorio: tu mensualidad con ${orgName}`, html);
}

async function sendSaasEmail(to: string, name: string, orgName: string, note: string) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY no configurada");
  const extra = note ? `<p style="font-size:14px;color:#475569;line-height:1.6;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:12px">${escapeHtml(note)}</p>` : "";
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#F1F5F9;padding:24px">
    <div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
      <div style="background:#0B1F4B;padding:22px;text-align:center"><span style="color:#fff;font-weight:800;letter-spacing:1px;font-size:20px">Tito Apps</span></div>
      <div style="padding:28px">
        <div style="font-size:20px;font-weight:800;color:#0B1F4B;margin-bottom:8px">Recordatorio de pago de tu plan</div>
        <p style="font-size:14px;color:#475569;line-height:1.6">Hola ${escapeHtml(name)}, este es un recordatorio sobre el pago de tu plan de <strong>TrainSync</strong> para <strong>${escapeHtml(orgName)}</strong>. Cuando puedas, coordiná el pago para mantener tu servicio activo.</p>
        ${extra}
        <p style="font-size:12px;color:#94A3B8;margin-top:16px">Enviado por el equipo de Tito Apps.</p>
      </div>
    </div>
  </div>`;
  await resend(fromForName("Tito Apps"), to, `Recordatorio de pago de tu plan TrainSync`, html);
}

async function resend(from: string, to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
