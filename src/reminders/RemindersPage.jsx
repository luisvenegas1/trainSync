import { useState, useEffect, useCallback } from "react";
import { useTenant } from "../tenant/tenantContext";
import { usePermissions } from "../auth/PermissionsContext";
import { PlanGate } from "../plans/PlanGate";
import { getOrgReminderConfig, setOrgReminderConfig, getOrgPaymentConfig, setOrgPaymentConfig, getReminderLogs, sendManualReminder } from "../db";
import { Toast } from "../trainsync.ui";

const RESEND_WINDOW_DAYS = 30; // no se puede reenviar un recordatorio de hace más de 30 días

function fmtDateTime(s) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("es-CR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return s; }
}

// Historial de recordatorios enviados (automáticos + manuales) de la organización.
// Permite REENVIAR un recordatorio (solo si se envió hace ≤ 30 días); al reenviar se
// agrega una fila nueva (tipo Manual) con la info del envío recién hecho.
function ReminderHistory({ orgId, readOnly }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await getReminderLogs(orgId);
      // Calcular acá (no en render) si cada uno se puede reenviar (≤ 30 días).
      const now = Date.now();
      setRows(r.map((x) => {
        const d = new Date(x.sentAt || x.createdAt);
        const canResend = !isNaN(d) && (now - d.getTime()) <= RESEND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        return { ...x, canResend };
      }));
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [orgId]);
  useEffect(() => { let alive = true; (async () => { await Promise.resolve(); if (alive) await load(); })(); return () => { alive = false; }; }, [load]);

  async function resend(r) {
    if (readOnly) { setToast({ msg: "Modo demostración: solo lectura", type: "err" }); return; }
    setBusyId(r.id);
    try {
      await sendManualReminder(r.clientId);
      setToast({ msg: "Recordatorio reenviado a " + r.clientName, type: "ok" });
      await load(); // aparece la fila nueva del reenvío
    } catch (e) { setToast({ msg: "No se pudo reenviar: " + (e?.message || e), type: "err" }); }
    finally { setBusyId(null); }
  }

  const badge = (st) => st === "sent" ? { t: "Enviado", c: "bd-green" } : st === "failed" ? { t: "Falló", c: "bd-red" } : { t: "Pendiente", c: "bd-gray" };
  return (
    <div style={{ marginTop: 28 }}>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="pt" style={{ fontSize: 18 }}>Historial de recordatorios</div>
      <div className="ps" style={{ marginBottom: 12 }}>Qué recordatorios se enviaron, a quién y cuándo. Podés reenviar los de los últimos {RESEND_WINDOW_DAYS} días.</div>
      <div className="card" data-cy="reminder-history" style={{ padding: 0 }}>
        {loading ? <div style={{ padding: 16, textAlign: "center", color: "#6B7A99" }}>Cargando…</div>
          : rows.length === 0 ? <div style={{ padding: 16, textAlign: "center", color: "#6B7A99", fontSize: 13 }}>Todavía no se enviaron recordatorios.</div>
          : <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Cliente</th><th>Tipo</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => { const b = badge(r.status); const can = r.canResend; return (
                  <tr key={r.id}>
                    <td><strong>{r.clientName}</strong></td>
                    <td><span className="badge bd-gray">{r.type === "manual" ? "Manual" : "Automático"}</span></td>
                    <td><span className={`badge ${b.c}`}>{b.t}</span>{r.status === "failed" && r.error ? <div style={{ fontSize: 10, color: "#E53935" }}>{r.error}</div> : null}</td>
                    <td style={{ fontSize: 12, color: "#6B7A99" }}>{fmtDateTime(r.sentAt || r.createdAt)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {!readOnly && (can
                        ? <button className="btn btn-s btn-sm" data-cy="resend-reminder" disabled={busyId === r.id} onClick={() => resend(r)}>{busyId === r.id ? "Enviando…" : "↻ Reenviar"}</button>
                        : <span style={{ fontSize: 11, color: "#9AA7BD" }}>+{RESEND_WINDOW_DAYS}d</span>)}
                    </td>
                  </tr>); })}
              </tbody>
            </table></div>}
      </div>
    </div>
  );
}

// Configuración de recordatorios de pago (feature Premium). El envío real lo hace
// un proceso de cron en el backend; acá solo se configura por organización.
export function RemindersPage() {
  const tenant = useTenant();
  const orgId = tenant?.org?.id || null;
  const { readOnly } = usePermissions();

  return (
    <div>
      <div className="ph"><div><div className="pt">Recordatorios de pago</div><div className="ps">Avisá a tus clientes antes de que venza su mensualidad</div></div></div>
      {/* Responsive: 2 columnas cuando caben (desktop / iPad), 1 cuando no (celular).
          auto-fit + minmax hace el salto solo según el ancho disponible. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div className="pt" style={{ fontSize: 18 }}>Recordatorios automáticos</div>
          <div className="ps" style={{ marginBottom: 12 }}>Email automático antes del vencimiento</div>
          <PlanGate feature="payment_reminders">
            <ReminderConfig orgId={orgId} readOnly={readOnly} />
          </PlanGate>
        </div>
        <div style={{ minWidth: 0 }}>
          {/* Bloqueo por vencimiento: disponible en TODOS los planes (fuera del PlanGate). */}
          <PaymentBlockConfig orgId={orgId} readOnly={readOnly} />
        </div>
      </div>
      {/* Historial a lo ancho, debajo de ambas columnas. */}
      <PlanGate feature="payment_reminders">
        <ReminderHistory orgId={orgId} readOnly={readOnly} />
      </PlanGate>
    </div>
  );
}

// Config del bloqueo de la rutina cuando la mensualidad del cliente está vencida.
// Opt-in por organización, con días de gracia. No depende del plan.
function PaymentBlockConfig({ orgId, readOnly }) {
  const [enabled, setEnabled] = useState(false);
  const [graceDays, setGraceDays] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      try {
        const cfg = await getOrgPaymentConfig(orgId);
        if (alive) { setEnabled(cfg.blockEnabled); setGraceDays(cfg.graceDays); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [orgId]);

  async function save() {
    if (readOnly) { setToast({ msg: "Modo demostración: solo lectura", type: "err" }); return; }
    setSaving(true);
    try {
      await setOrgPaymentConfig(orgId, { blockEnabled: enabled, graceDays });
      setToast({ msg: "Configuración guardada", type: "ok" });
    } catch (e) { setToast({ msg: "No se pudo guardar: " + (e?.message || e), type: "err" }); }
    finally { setSaving(false); }
  }

  if (loading) return null;

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="pt" style={{ fontSize: 18 }}>Bloqueo por mensualidad vencida</div>
      <div className="ps" style={{ marginBottom: 12 }}>Oculta la rutina a los clientes con la mensualidad vencida hasta que se pongan al día</div>
      <div className="card" style={{ marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 14 }}>
          <input data-cy="block-enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} style={{ width: 18, height: 18 }} />
          <span style={{ fontWeight: 700, color: "#0B1F4B" }}>Bloquear la rutina cuando la mensualidad esté vencida</span>
        </label>
        <div className="fg">
          <label>Días de gracia tras el vencimiento (0 = bloqueo inmediato)</label>
          <input data-cy="block-grace" className="inp" type="number" min={0} max={365} value={graceDays} onChange={(e) => setGraceDays(Number(e.target.value))} disabled={readOnly || !enabled} style={{ maxWidth: 120 }} />
        </div>
        <button data-cy="block-save" className="btn btn-p" onClick={save} disabled={saving || readOnly}>{saving ? "Guardando…" : "Guardar"}</button>
      </div>
      <div className="card" style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 6 }}>Cómo funciona</div>
        Solo se oculta la <b>rutina y el entrenamiento</b>: el cliente sigue viendo su perfil, historial y mediciones. Podés dar acceso a un cliente puntual aunque esté vencido con el interruptor <b>“Eximir del bloqueo”</b> en su ficha.
      </div>
    </div>
  );
}

function ReminderConfig({ orgId, readOnly }) {
  const [enabled, setEnabled] = useState(false);
  const [daysBefore, setDaysBefore] = useState(3);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.resolve();
      try {
        const cfg = await getOrgReminderConfig(orgId);
        if (alive) { setEnabled(cfg.enabled); setDaysBefore(cfg.daysBefore); }
      } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [orgId]);

  async function save() {
    if (readOnly) { setToast({ msg: "Modo demostración: solo lectura", type: "err" }); return; }
    setSaving(true);
    try {
      await setOrgReminderConfig(orgId, { enabled, daysBefore });
      setToast({ msg: "Configuración guardada", type: "ok" });
    } catch (e) { setToast({ msg: "No se pudo guardar: " + (e?.message || e), type: "err" }); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="card" style={{ textAlign: "center", color: "#6B7A99" }}>Cargando…</div>;

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="card" style={{ marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 14 }}>
          <input data-cy="rem-enabled" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} style={{ width: 18, height: 18 }} />
          <span style={{ fontWeight: 700, color: "#0B1F4B" }}>Activar recordatorios automáticos por email</span>
        </label>
        <div className="fg">
          <label>Enviar cuántos días antes del vencimiento</label>
          <input data-cy="rem-days" className="inp" type="number" min={0} max={30} value={daysBefore} onChange={(e) => setDaysBefore(Number(e.target.value))} disabled={readOnly || !enabled} style={{ maxWidth: 120 }} />
        </div>
        <button data-cy="rem-save" className="btn btn-p" onClick={save} disabled={saving || readOnly}>{saving ? "Guardando…" : "Guardar"}</button>
      </div>
      <div className="card" style={{ fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 6 }}>Cómo funciona</div>
        Cada día, TrainSync revisa qué clientes tienen su mensualidad por vencer y les envía un email (una sola vez por vencimiento, sin duplicados). Podés desactivar el recordatorio de un cliente puntual desde su ficha. El correo del cliente debe estar cargado.
      </div>
    </div>
  );
}
