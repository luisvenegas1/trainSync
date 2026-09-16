// ═══════════════════════════════════════════════════════════════
//  Edge Function: send-saas-reminders  (proceso de CRON, no del navegador)
//  Avisa a los ENTRENADORES (dueños de tenant) sobre el pago de su plan de SaaS,
//  X días antes del vencimiento de su suscripción.
//  Reglas:
//   1) organization_subscriptions.saas_reminder_enabled = true.
//   2) current_period_end == hoy + saas_reminder_days.
//   3) Anti-duplicados: fila en saas_payment_notices con kind='auto' y due_date =
//      current_period_end; si ya existe (índice único), NO se reenvía.
//   4) Se registra el resultado (sent/failed). Envía por Resend (branding Tito Apps).
//
//  Seguridad: requiere header x-cron-secret == CRON_SECRET (no es pública).
//  Desplegar: supabase functions deploy send-saas-reminders --no-verify-jwt
//  Secretos: PROJECT_URL, SERVICE_ROLE_KEY, RESEND_API_KEY, CRON_SECRET, REMINDER_FROM
// ═══════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("PROJECT_URL") || Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const REMINDER_FROM = Deno.env.get("REMINDER_FROM") || "TrainSync <no-reply@tito-apps.com>";

// deno-lint-ignore no-explicit-any
type SB = any;

function isoPlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) return json({ error: "forbidden" }, 403);

  const admin: SB = createClient(PROJECT_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
  const summary = { candidates: 0, sent: 0, skipped: 0, failed: 0 };

  // 1) Suscripciones con recordatorio automático activo.
  const { data: subs } = await admin
    .from("organization_subscriptions")
    .select("organization_id, current_period_end, saas_reminder_enabled, saas_reminder_days, status")
    .eq("saas_reminder_enabled", true);

  for (const s of subs || []) {
    if (!s.current_period_end) continue;
    const daysBefore = Number(s.saas_reminder_days) || 3;
    const due = String(s.current_period_end).slice(0, 10);
    if (due !== isoPlus(daysBefore)) continue;
    summary.candidates++;

    // Owner + correo.
    const { data: ownerMem } = await admin
      .from("organization_members").select("user_id")
      .eq("organization_id", s.organization_id).eq("role", "owner").maybeSingle();
    if (!ownerMem) { summary.skipped++; continue; }
    const { data: ownerUser } = await admin.auth.admin.getUserById(ownerMem.user_id);
    const email = ownerUser?.user?.email || "";
    if (!email) { summary.skipped++; continue; }
    const name = ownerUser?.user?.user_metadata?.full_name || "";
    const { data: org } = await admin.from("organizations").select("name").eq("id", s.organization_id).maybeSingle();
    const orgName = org?.name || "tu organización";

    if (dryRun) {
      const { data: existing } = await admin.from("saas_payment_notices")
        .select("id").eq("organization_id", s.organization_id).eq("due_date", due).eq("kind", "auto").maybeSingle();
      if (existing) summary.skipped++; else summary.sent++;
      continue;
    }

    // 3) Anti-duplicados: insertar el log; si choca con el índice único, saltar.
    const ins = await admin.from("saas_payment_notices").insert({
      organization_id: s.organization_id, sent_to_email: email, due_date: due,
      kind: "auto", status: "pending",
    }).select("id").maybeSingle();
    if (ins.error) { summary.skipped++; continue; } // conflict → ya enviado para este vencimiento
    const logId = ins.data?.id;

    try {
      await sendSaasEmail(email, name, orgName, due, daysBefore);
      if (logId) await admin.from("saas_payment_notices").update({ status: "sent" }).eq("id", logId);
      summary.sent++;
    } catch (e) {
      if (logId) await admin.from("saas_payment_notices").update({ status: "failed", error_message: String(e).slice(0, 500) }).eq("id", logId);
      summary.failed++;
    }
  }

  return json({ ok: true, ...summary });
});

function fromForName(name: string): string {
  const m = REMINDER_FROM.match(/<([^>]+)>/);
  const addr = m ? m[1] : REMINDER_FROM;
  return `${name} <${addr}>`;
}

async function sendSaasEmail(to: string, name: string, orgName: string, dueDate: string, daysBefore: number) {
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY no configurada");
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#F1F5F9;padding:24px">
    <div style="max-width:460px;margin:0 auto;background:#fff;border:1px solid #E2E8F0;border-radius:16px;overflow:hidden">
      <div style="background:#0B1F4B;padding:22px;text-align:center"><span style="color:#fff;font-weight:800;letter-spacing:1px;font-size:20px">Tito Apps</span></div>
      <div style="padding:28px">
        <div style="font-size:20px;font-weight:800;color:#0B1F4B;margin-bottom:8px">Recordatorio de pago de tu plan</div>
        <p style="font-size:14px;color:#475569;line-height:1.6">Hola ${escapeHtml(name)}, tu plan de <strong>TrainSync</strong> para <strong>${escapeHtml(orgName)}</strong> vence el <strong>${escapeHtml(dueDate)}</strong> (en ${daysBefore} día${daysBefore === 1 ? "" : "s"}). Coordiná el pago para mantener tu servicio activo.</p>
        <p style="font-size:12px;color:#94A3B8;margin-top:16px">Recordatorio automático del equipo de Tito Apps.</p>
      </div>
    </div>
  </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromForName("Tito Apps"), to, subject: "Recordatorio: tu plan de TrainSync vence pronto", html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
}
