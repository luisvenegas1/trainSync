import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { loadPlatformData, invokePlatform, existingSlugsOf, paymentsForOrg, auditForOrg } from "./platformApi";
import { uploadLogo, uploadTrainerPhoto } from "../storage/storage";
import { FEATURE_CATALOG, planFeatures } from "../plans/entitlements";
import {
  validateNewOrg, validatePayment, bucketOrganizations, expiringSubscriptions,
  statusLabel, canSuspendOrg, SUB_STATUSES, PAYMENT_METHODS, PLATFORM_PLANS,
} from "./platformLogic";

// Normaliza el slug EN VIVO mientras se escribe: minúsculas, espacios→guion, solo
// [a-z0-9-]. No recorta guiones al borde (para poder escribir "a-b" fluido).
const slugifyLive = (v) => String(v || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

// ── Utilidades de presentación ─────────────────────────────────
// Paleta NEUTRA (gris carbón/pizarra) para distinguir el panel de plataforma de
// las apps de los entrenadores (que son navy/azul).
const C = { navy: "#2A2E35", blue: "#5B6675", ink: "#1F2933", muted: "#6B7280", line: "#E3E6EA", bg: "#F4F5F7", ok: "#2E7D32", warn: "#E65100", red: "#E53935" };

// Sobrescribe los botones azules de la app (.btn-p) por un gris neutro SOLO dentro
// del panel de plataforma.
export const PLATFORM_SCOPE_CSS = `
.platform-scope .btn-p{background:#3A4150;border-color:#3A4150;}
.platform-scope .btn-p:hover{background:#2A2E35;border-color:#2A2E35;}
`;
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const money = (n, c = "CRC") => (n == null ? "—" : `${c} ${Number(n).toLocaleString("es-CR", { minimumFractionDigits: 0 })}`);
const STATUS_COLOR = { active: C.ok, trial: C.blue, past_due: C.warn, suspended: C.red, canceled: C.muted };
// URL de la app de una organización (por ruta; sirve para cualquier org sin DNS propio).
const orgAppUrl = (slug) => `https://trainingapp.tito-apps.com/${slug}`;
const card = { background: "#fff", border: `1px solid ${C.line}`, borderRadius: 14, padding: 18 };

function Badge({ status }) {
  const color = STATUS_COLOR[status] || C.muted;
  return <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 800, color: "#fff", background: color }}>{statusLabel(status)}</span>;
}
function Field({ label, children }) {
  return <div className="fg" style={{ marginBottom: 10 }}><label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>{label}</label>{children}</div>;
}
function Stat({ label, value, color }) {
  return (
    <div style={{ ...card, flex: "1 1 130px", minWidth: 130 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: color || C.ink }}>{value}</div>
      <div style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>{label}</div>
    </div>
  );
}

// Campo de logo: permite SUBIR un archivo (o pegar una URL). Si `orgId` existe,
// sube de inmediato al bucket público `org-logos` y devuelve la URL pública. Si no
// (alta de organización), guarda el File para subirlo después de crear la org y
// muestra una vista previa local.
function LogoField({ label = "Logo", url, onUrl, onFile, orgId, previewBg = C.navy, uploader = uploadLogo }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState(null);
  const isBlob = typeof url === "string" && url.startsWith("blob:");

  async function pick(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    if (!file.type.startsWith("image/")) { setErr("Elegí un archivo de imagen."); return; }
    if (file.size > 3 * 1024 * 1024) { setErr("La imagen no debe superar 3 MB."); return; }
    if (orgId) {
      setUploading(true);
      try { onUrl(await uploader(orgId, file)); }
      catch (e2) { setErr("No se pudo subir: " + (e2?.message || e2)); }
      finally { setUploading(false); }
    } else {
      onUrl(URL.createObjectURL(file)); // vista previa local
      onFile?.(file);                    // se sube tras crear la org
    }
  }

  return (
    <div className="fg" style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 12, color: C.muted, fontWeight: 700 }}>{label}</label>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 8, background: previewBg, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {url ? <img src={url} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 22 }}>🏋️</span>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
        <button type="button" className="btn btn-g" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? "Subiendo…" : "📁 Subir archivo"}</button>
      </div>
      <input className="inp" style={{ marginTop: 6 }} placeholder="…o pegá una URL" value={isBlob ? "" : (url || "")} onChange={(e) => onUrl(e.target.value)} />
      {err && <div className="err">⚠ {err}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
export function PlatformPanel({ onLogout }) {
  const [data, setData] = useState({ organizations: [], payments: [], audit: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [section, setSection] = useState("dashboard");
  const [selectedOrgId, setSelectedOrgId] = useState(null);
  const [showNewOrg, setShowNewOrg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await loadPlatformData()); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let alive = true;
    // async IIFE: evita el setState síncrono dentro del cuerpo del efecto.
    (async () => { await Promise.resolve(); if (alive) loadAll(); })();
    return () => { alive = false; };
  }, [loadAll]);

  const flash = (msg, kind = "ok") => { setToast({ msg, kind }); setTimeout(() => setToast(null), 4000); };

  // Ejecuta una acción privilegiada por la Edge Function y recarga.
  const runAction = useCallback(async (action, payload, okMsg) => {
    setBusy(true);
    const res = await invokePlatform(action, payload);
    setBusy(false);
    if (res.ok) { flash(okMsg || "Listo."); await loadAll(); return true; }
    flash(res.error || "Error ejecutando la acción.", "err");
    return false;
  }, [loadAll]);

  // Alta de organización: crea por la Edge Function y, si se subió un archivo de
  // logo, lo sube a Storage con el orgId recién creado y actualiza el branding.
  const createOrg = useCallback(async (payload) => {
    const { _logoFile, ...body } = payload;
    // Nunca mandar una URL blob: (vista previa local) al backend.
    if (body.branding?.logoUrl && String(body.branding.logoUrl).startsWith("blob:")) {
      body.branding = { ...body.branding, logoUrl: null };
    }
    setBusy(true);
    const res = await invokePlatform("create_organization", body);
    if (!res.ok) { setBusy(false); flash(res.error || "No se pudo crear la organización.", "err"); return; }
    const newOrgId = res.data?.organization_id;
    if (_logoFile && newOrgId) {
      try {
        const url = await uploadLogo(newOrgId, _logoFile);
        await invokePlatform("update_branding", { organization_id: newOrgId, logo_url: url });
      } catch (e) {
        setBusy(false);
        flash("Organización creada, pero el logo no se pudo subir: " + (e?.message || e), "err");
        await loadAll(); setShowNewOrg(false); return;
      }
    }
    setBusy(false);
    flash(`Organización “${body.slug}” creada.`);
    await loadAll(); setShowNewOrg(false);
  }, [loadAll]);

  const orgs = data.organizations;
  const selectedOrg = orgs.find((o) => o.id === selectedOrgId) || null;

  return (
    <div className="platform-scope" style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Barlow',sans-serif", color: C.ink }}>
      <style>{PLATFORM_SCOPE_CSS}</style>
      {/* Header */}
      <header style={{ background: C.navy, color: "#fff", padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/brand/tito-training.png" alt="Tito Apps" style={{ width: 36, height: 36, objectFit: "contain" }} />
          <div>
            <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1 }}>Tito Apps · Plataforma</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>Panel global de organizaciones y suscripciones</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-g" onClick={onLogout}>Salir</button>
        </div>
      </header>

      {/* Nav */}
      <nav style={{ display: "flex", gap: 4, padding: "8px 20px 0", background: "#fff", borderBottom: `1px solid ${C.line}`, flexWrap: "wrap" }}>
        {[["dashboard", "🏠 Dashboard"], ["orgs", "🏢 Organizaciones"], ["payments", "💳 Pagos"], ["audit", "📜 Auditoría"]].map(([id, label]) => (
          <button key={id} onClick={() => { setSection(id); setSelectedOrgId(null); }}
            style={{ border: "none", background: "none", padding: "10px 14px", cursor: "pointer", fontWeight: 800, fontSize: 13, color: section === id ? C.blue : C.muted, borderBottom: `3px solid ${section === id ? C.blue : "transparent"}` }}>
            {label}
          </button>
        ))}
      </nav>

      {toast && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 50, background: toast.kind === "err" ? C.red : C.ok, color: "#fff", padding: "10px 16px", borderRadius: 10, fontWeight: 700, fontSize: 13, maxWidth: 360 }}>{toast.msg}</div>}

      <main style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
        {loading && <div style={{ ...card, textAlign: "center", color: C.muted }}>Cargando datos de plataforma…</div>}
        {error && <div style={{ ...card, borderColor: C.red, color: C.red }}>⚠ No se pudieron cargar los datos: {error}</div>}

        {!loading && !error && selectedOrg && (
          <OrgDetail org={selectedOrg} data={data} busy={busy} onBack={() => setSelectedOrgId(null)} runAction={runAction} allSlugs={existingSlugsOf(orgs)} />
        )}

        {!loading && !error && !selectedOrg && section === "dashboard" && (
          <Dashboard orgs={orgs} payments={data.payments} onNewOrg={() => setShowNewOrg(true)} onOpenOrg={(id) => { setSelectedOrgId(id); }} onGoPayments={() => setSection("payments")} />
        )}
        {!loading && !error && !selectedOrg && section === "orgs" && (
          <OrgsTable orgs={orgs} busy={busy} onOpen={setSelectedOrgId} onNewOrg={() => setShowNewOrg(true)} runAction={runAction} />
        )}
        {!loading && !error && !selectedOrg && section === "payments" && (
          <PaymentsModule orgs={orgs} payments={data.payments} busy={busy} runAction={runAction} />
        )}
        {!loading && !error && !selectedOrg && section === "audit" && (
          <AuditModule audit={data.audit} orgs={orgs} />
        )}
      </main>

      {showNewOrg && (
        <NewOrgModal existingSlugs={existingSlugsOf(orgs)} busy={busy}
          onClose={() => setShowNewOrg(false)}
          onCreate={createOrg} />
      )}
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────
function Dashboard({ orgs, payments, onNewOrg, onOpenOrg, onGoPayments }) {
  const [nowMs] = useState(() => Date.now());
  const b = bucketOrganizations(orgs);
  const totalMembers = orgs.reduce((a, o) => a + o.memberCount, 0);
  const totalClients = orgs.reduce((a, o) => a + o.clientCount, 0);
  const expiring = expiringSubscriptions(orgs, nowMs, 7);
  const recentPayments = (payments || []).slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Stat label="Activas" value={b.active} color={C.ok} />
        <Stat label="En prueba" value={b.trial} color={C.blue} />
        <Stat label="Pago pendiente" value={b.past_due} color={C.warn} />
        <Stat label="Suspendidas" value={b.suspended} color={C.red} />
        <Stat label="Canceladas" value={b.canceled} color={C.muted} />
        <Stat label="Sin suscripción" value={b.none} color={C.muted} />
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Stat label="Organizaciones" value={b.total} />
        <Stat label="Entrenadores / miembros" value={totalMembers} />
        <Stat label="Clientes (total)" value={totalClients} />
      </div>

      <div style={{ ...card }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Accesos rápidos</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-p" onClick={onNewOrg}>➕ Nueva organización</button>
          <button className="btn btn-g" onClick={onGoPayments}>💳 Registrar pago</button>
        </div>
      </div>

      <div style={{ ...card }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>⏳ Suscripciones próximas a vencer o vencidas</div>
        {expiring.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>Ninguna en los próximos 7 días.</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {expiring.map((o) => (
                <tr key={o.id} style={{ borderTop: `1px solid ${C.line}`, cursor: "pointer" }} onClick={() => onOpenOrg(o.id)}>
                  <td style={{ padding: "8px 6px", fontWeight: 700 }}>{o.name}</td>
                  <td style={{ padding: "8px 6px", color: C.muted }}>{o.slug}</td>
                  <td style={{ padding: "8px 6px" }}><Badge status={o.subStatus} /></td>
                  <td style={{ padding: "8px 6px", textAlign: "right" }}>{fmtDate(o.currentPeriodEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...card }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>🧾 Pagos manuales recientes</div>
        {recentPayments.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>Aún no hay pagos registrados.</div> : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <tbody>
              {recentPayments.map((p) => {
                const org = orgs.find((o) => o.id === p.organization_id);
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: "8px 6px", fontWeight: 700 }}>{org?.name || "—"}</td>
                    <td style={{ padding: "8px 6px" }}>{money(p.amount, p.currency)}</td>
                    <td style={{ padding: "8px 6px", color: C.muted }}>{p.method}</td>
                    <td style={{ padding: "8px 6px", textAlign: "right", color: C.muted }}>{fmtDate(p.paid_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Tabla de organizaciones ────────────────────────────────────
function OrgsTable({ orgs, busy, onOpen, onNewOrg, runAction }) {
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return orgs.filter((o) => {
      if (statusFilter !== "all" && (o.subStatus || "none") !== statusFilter) return false;
      if (!needle) return true;
      return [o.name, o.slug, o.ownerName].some((v) => String(v || "").toLowerCase().includes(needle));
    });
  }, [orgs, q, statusFilter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="inp" placeholder="Buscar por nombre, slug u owner…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: "1 1 240px" }} />
        <select className="inp" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="all">Todos los estados</option>
          {SUB_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
          <option value="none">Sin suscripción</option>
        </select>
        <button className="btn btn-p" onClick={onNewOrg}>➕ Nueva</button>
      </div>

      <div style={{ ...card, padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 820 }}>
          <thead>
            <tr style={{ background: C.bg, textAlign: "left", color: C.muted }}>
              {["Nombre", "Slug", "Owner", "Tipo", "Plan / Estado", "Entren.", "Clientes", "Creada", "Acciones"].map((h) => (
                <th key={h} style={{ padding: "10px 8px", fontSize: 11, fontWeight: 800 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: "8px", fontWeight: 800 }}><a href={orgAppUrl(o.slug)} target="_blank" rel="noreferrer" title="Abrir la app de esta organización" style={{ color: C.blue, textDecoration: "none" }}>{o.name} ↗</a>{o.tenantType === "demo" && <span style={{ marginLeft: 6, fontSize: 10, color: "#7B1FA2", fontWeight: 800 }}>DEMO</span>}</td>
                <td style={{ padding: "8px", color: C.muted }}>{o.slug}</td>
                <td style={{ padding: "8px" }}>{o.ownerName}</td>
                <td style={{ padding: "8px", color: C.muted }}>{o.tenantType}</td>
                <td style={{ padding: "8px" }}>{o.plan || "—"} · <Badge status={o.subStatus} /></td>
                <td style={{ padding: "8px", textAlign: "center" }}>{o.memberCount}</td>
                <td style={{ padding: "8px", textAlign: "center" }}>{o.clientCount}</td>
                <td style={{ padding: "8px", color: C.muted }}>{fmtDate(o.createdAt)}</td>
                <td style={{ padding: "8px", whiteSpace: "nowrap" }}>
                  <button className="btn btn-g" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => onOpen(o.id)}>Ver</button>
                  {o.subStatus === "suspended"
                    ? <button className="btn btn-p" disabled={busy} style={{ padding: "4px 8px", fontSize: 12, marginLeft: 4 }} onClick={() => runAction("reactivate", { organization_id: o.id }, `${o.name} reactivada.`)}>Reactivar</button>
                    : canSuspendOrg(o) && <button className="btn btn-g" disabled={busy} style={{ padding: "4px 8px", fontSize: 12, marginLeft: 4, color: C.red }} onClick={() => { if (confirm(`¿Suspender ${o.name}? Conserva sus datos.`)) runAction("suspend", { organization_id: o.id }, `${o.name} suspendida.`); }}>Suspender</button>}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} style={{ padding: 16, textAlign: "center", color: C.muted }}>Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Detalle de organización ────────────────────────────────────
function OrgDetail({ org, data, busy, onBack, runAction, allSlugs }) {
  const [tab, setTab] = useState("info");
  const payments = paymentsForOrg(data.payments, org.id);
  const audit = auditForOrg(data.audit, org.id);
  const otherSlugs = allSlugs.filter((s) => s !== org.slug);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <button className="btn btn-g" style={{ alignSelf: "flex-start" }} onClick={onBack}>← Volver</button>
      <div style={{ ...card, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{org.name} {org.tenantType === "demo" && <span style={{ fontSize: 11, color: "#7B1FA2" }}>DEMO</span>}</div>
          <div style={{ color: C.muted, fontSize: 13 }}><a href={orgAppUrl(org.slug)} target="_blank" rel="noreferrer" title="Abrir la app de esta organización" style={{ color: C.blue, textDecoration: "none", fontWeight: 700 }}>/{org.slug} ↗</a> · Owner: {org.ownerName} · {org.memberCount} miembros · {org.clientCount} clientes</div>
        </div>
        <Badge status={org.subStatus} />
      </div>

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {[["info", "Organización"], ["subscription", "Suscripción"], ["payments", "Pagos"], ["branding", "Branding"], ["features", "Funciones"], ["audit", "Historial"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ border: `1px solid ${C.line}`, background: tab === id ? C.blue : "#fff", color: tab === id ? "#fff" : C.ink, padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{label}</button>
        ))}
      </div>

      {tab === "info" && <OrgInfoTab org={org} busy={busy} runAction={runAction} otherSlugs={otherSlugs} />}
      {tab === "subscription" && <OrgSubscriptionTab org={org} busy={busy} runAction={runAction} />}
      {tab === "payments" && <OrgPaymentsTab org={org} payments={payments} busy={busy} runAction={runAction} />}
      {tab === "branding" && <OrgBrandingTab org={org} busy={busy} runAction={runAction} />}
      {tab === "features" && <OrgFeaturesTab org={org} busy={busy} runAction={runAction} />}
      {tab === "audit" && (
        <div style={{ ...card }}>
          {audit.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>Sin acciones registradas.</div> : audit.map((a) => (
            <div key={a.id} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0", fontSize: 13 }}>
              <strong>{a.action}</strong> · <span style={{ color: C.muted }}>{fmtDate(a.created_at)}</span>
              <div style={{ color: C.muted, fontSize: 11 }}>{JSON.stringify(a.metadata)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrgInfoTab({ org, busy, runAction, otherSlugs }) {
  const [name, setName] = useState(org.name);
  const [slug, setSlug] = useState(org.slug);
  const [tenantType, setTenantType] = useState(org.tenantType);
  const [status, setStatus] = useState(org.status);
  const [err, setErr] = useState(null);
  function save() {
    setErr(null);
    if (otherSlugs.map((s) => s.toLowerCase()).includes(slug.trim().toLowerCase())) { setErr("Ese slug ya está en uso por otra organización."); return; }
    runAction("update_organization", { organization_id: org.id, name, slug, tenant_type: tenantType, status }, "Organización actualizada.");
  }
  return (
    <div style={{ ...card, maxWidth: 480 }}>
      {err && <div className="err">⚠ {err}</div>}
      <Field label="Nombre interno"><input className="inp" value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Slug (único)"><input className="inp" value={slug} onChange={(e) => setSlug(e.target.value)} /></Field>
      <Field label="Tipo de organización">
        <select className="inp" value={tenantType} onChange={(e) => setTenantType(e.target.value)}>
          <option value="production">production</option>
          <option value="demo">demo</option>
          <option value="test">test</option>
        </select>
      </Field>
      <Field label="Estado de la organización">
        <select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="archived">archived</option>
        </select>
      </Field>
      <button className="btn btn-p" disabled={busy} onClick={save}>Guardar cambios</button>
    </div>
  );
}

function OrgSubscriptionTab({ org, busy, runAction }) {
  const [status, setStatus] = useState(org.subStatus || "trial");
  const [plan, setPlan] = useState(org.plan || "base");
  const [periodEnd, setPeriodEnd] = useState(org.currentPeriodEnd ? org.currentPeriodEnd.slice(0, 10) : "");
  const [grace, setGrace] = useState(org.gracePeriodEndsAt ? org.gracePeriodEndsAt.slice(0, 10) : "");
  const [notes, setNotes] = useState(org.adminNotes || "");
  const isDemo = org.tenantType === "demo";
  function save() {
    runAction("set_subscription", {
      organization_id: org.id, status, plan,
      current_period_end: periodEnd || null,
      grace_period_ends_at: grace || null,
      admin_notes: notes,
    }, "Suscripción actualizada.");
  }
  return (
    <div style={{ ...card, maxWidth: 480 }}>
      {isDemo && <div style={{ color: "#7B1FA2", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Esta es la organización demo: no se puede suspender/cancelar.</div>}
      <Field label="Estado">
        <select className="inp" value={status} onChange={(e) => setStatus(e.target.value)}>
          {SUB_STATUSES.map((s) => <option key={s} value={s} disabled={isDemo && ["suspended", "canceled", "past_due"].includes(s)}>{statusLabel(s)}</option>)}
        </select>
      </Field>
      <Field label="Plan">
        <select className="inp" value={plan} onChange={(e) => setPlan(e.target.value)}>
          {[...new Set([plan, ...PLATFORM_PLANS])].filter(Boolean).map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </Field>
      <Field label="Vence (fin de periodo)"><input className="inp" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
      <Field label="Gracia hasta (opcional)"><input className="inp" type="date" value={grace} onChange={(e) => setGrace(e.target.value)} /></Field>
      <Field label="Notas administrativas internas"><textarea className="inp" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-p" disabled={busy} onClick={save}>Guardar</button>
        {org.subStatus === "suspended"
          ? <button className="btn btn-g" disabled={busy} onClick={() => runAction("reactivate", { organization_id: org.id }, "Reactivada.")}>Reactivar</button>
          : !isDemo && <button className="btn btn-g" style={{ color: C.red }} disabled={busy} onClick={() => { if (confirm("¿Suspender por falta de pago? Conserva los datos.")) runAction("suspend", { organization_id: org.id }, "Suspendida."); }}>Suspender</button>}
      </div>
    </div>
  );
}

function PaymentForm({ orgId, busy, runAction, onDone }) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("CRC");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("sinpe");
  const [periodEnd, setPeriodEnd] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [activate, setActivate] = useState(true);
  const [err, setErr] = useState(null);
  async function submit() {
    setErr(null);
    const v = validatePayment({ organizationId: orgId, amount, currency, paidAt, method });
    if (!v.ok) { setErr(Object.values(v.errors)[0]); return; }
    const ok = await runAction("register_payment", {
      organization_id: orgId, amount: v.value.amount, currency: v.value.currency, paid_at: paidAt,
      method, period_end: periodEnd || null, reference: reference || null, note: note || null,
      activate_subscription: activate,
    }, "Pago registrado.");
    if (ok && onDone) onDone();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {err && <div className="err">⚠ {err}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Field label="Monto"><input className="inp" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Moneda"><input className="inp" value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ width: 90 }} /></Field>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Field label="Fecha de pago"><input className="inp" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
        <Field label="Método">
          <select className="inp" value={method} onChange={(e) => setMethod(e.target.value)}>{PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </Field>
        <Field label="Cubre hasta (opcional)"><input className="inp" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
      </div>
      <Field label="Referencia / comprobante (opcional)"><input className="inp" value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
      <Field label="Nota interna (opcional)"><input className="inp" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "4px 0 10px" }}>
        <input type="checkbox" checked={activate} onChange={(e) => setActivate(e.target.checked)} /> Activar suscripción con este pago
      </label>
      <button className="btn btn-p" disabled={busy} onClick={submit}>Registrar pago</button>
    </div>
  );
}

function OrgPaymentsTab({ org, payments, busy, runAction }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ ...card, flex: "1 1 320px" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Registrar pago de plataforma</div>
        <PaymentForm orgId={org.id} busy={busy} runAction={runAction} />
      </div>
      <div style={{ ...card, flex: "1 1 320px" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Historial de pagos</div>
        {payments.length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>Sin pagos.</div> : payments.map((p) => (
          <div key={p.id} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0", fontSize: 13 }}>
            <strong>{money(p.amount, p.currency)}</strong> · {p.method} · <span style={{ color: C.muted }}>{fmtDate(p.paid_at)}</span>
            {p.reference && <div style={{ color: C.muted, fontSize: 11 }}>Ref: {p.reference}</div>}
            {p.note && <div style={{ color: C.muted, fontSize: 11 }}>{p.note}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Mapa campo del form → columna de BD (para el guardado por diferencias).
const BRANDING_FIELDS = {
  displayName: "display_name", tagline: "tagline", logoUrl: "logo_url",
  faviconUrl: "favicon_url", trainerPhotoUrl: "trainer_photo_url",
  primary: "primary_color", secondary: "secondary_color",
  whatsapp: "whatsapp", instagram: "instagram", contactEmail: "contact_email", bio: "bio",
};

// Activar/desactivar funciones por organización (overrides sobre el plan).
// Cada función puede quedar: "según el plan" (sin override), "activada" u "desactivada".
function OrgFeaturesTab({ org, busy, runAction }) {
  const planDefaults = planFeatures(org.plan || "base");
  const initial = org.settings?.featureOverrides || {};
  // Estado: para cada feature, "" = según el plan, "on" = activada, "off" = desactivada.
  const toState = (ov) => {
    const s = {};
    for (const feat of FEATURE_CATALOG) {
      s[feat.key] = feat.key in ov ? (ov[feat.key] ? "on" : "off") : "";
    }
    return s;
  };
  const [sel, setSel] = useState(() => toState(initial));
  const [note, setNote] = useState(null);

  function save() {
    // Construir el objeto de overrides: solo las que NO están "según el plan".
    const overrides = {};
    for (const feat of FEATURE_CATALOG) {
      if (sel[feat.key] === "on") overrides[feat.key] = true;
      else if (sel[feat.key] === "off") overrides[feat.key] = false;
    }
    setNote(null);
    runAction("update_features", { organization_id: org.id, feature_overrides: overrides }, "Funciones actualizadas.");
  }

  return (
    <div style={{ ...card, maxWidth: 640 }}>
      <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 14 }}>Funciones de {org.name}</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
        Activá o desactivá funciones para esta organización. "Según el plan" usa lo que incluye el plan actual (<strong>{(org.plan || "base")}</strong>).
        Un override te deja probar o habilitar algo puntual sin cambiar el plan.
      </div>
      {FEATURE_CATALOG.map((feat) => (
        <div key={feat.key} style={{ display: "flex", alignItems: "center", gap: 12, borderTop: `1px solid ${C.line}`, padding: "10px 0" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{feat.label}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{feat.desc}</div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Por plan: {planDefaults[feat.key] ? "incluida ✓" : "no incluida"}</div>
          </div>
          <select className="inp" style={{ width: 150, minHeight: 34 }} value={sel[feat.key]} onChange={(e) => setSel((p) => ({ ...p, [feat.key]: e.target.value }))}>
            <option value="">Según el plan</option>
            <option value="on">Activada</option>
            <option value="off">Desactivada</option>
          </select>
        </div>
      ))}
      <button className="btn btn-p" style={{ marginTop: 12 }} disabled={busy} onClick={save}>Guardar funciones</button>
      {note && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{note}</div>}
    </div>
  );
}

function OrgBrandingTab({ org, busy, runAction }) {
  const b = org.settings || {};
  // Valores originales cargados (para comparar y guardar SOLO lo que cambió).
  const init = {
    displayName: b.displayName || org.name,
    tagline: b.tagline || "",
    logoUrl: b.logoUrl || "",
    faviconUrl: b.faviconUrl || "",
    trainerPhotoUrl: b.trainerPhotoUrl || "",
    primary: b.primaryColor || "#1A5DC8",
    secondary: b.secondaryColor || "#0B1F4B",
    whatsapp: b.whatsapp || "",
    instagram: b.instagram || "",
    contactEmail: b.contactEmail || "",
    bio: b.bio || "",
  };
  const [f, setF] = useState(init);
  const [note, setNote] = useState(null);
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: typeof v === "string" ? v : v?.target?.value ?? "" }));

  function save() {
    // Solo enviar los campos que realmente cambiaron respecto a lo cargado.
    const payload = { organization_id: org.id };
    let changed = 0;
    for (const [fk, dbk] of Object.entries(BRANDING_FIELDS)) {
      if (f[fk] !== init[fk]) { payload[dbk] = f[fk] === "" ? null : f[fk]; changed++; }
    }
    if (!changed) { setNote("No hay cambios para guardar."); return; }
    setNote(null);
    runAction("update_branding", payload, "Branding actualizado.");
  }

  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <div style={{ ...card, flex: "1 1 340px" }}>
        <Field label="Nombre visible"><input className="inp" value={f.displayName} onChange={set("displayName")} /></Field>
        <Field label="Lema / tagline"><input className="inp" value={f.tagline} onChange={set("tagline")} placeholder="Strength · Discipline · Evolution" /></Field>
        <LogoField label="Logo (archivo o URL)" url={f.logoUrl} onUrl={set("logoUrl")} orgId={org.id} previewBg={f.secondary} />
        <LogoField label="Favicon / ícono app (opcional; si falta usa el logo)" url={f.faviconUrl} onUrl={set("faviconUrl")} orgId={org.id} previewBg={f.secondary} />
        <LogoField label="Foto del entrenador" url={f.trainerPhotoUrl} onUrl={set("trainerPhotoUrl")} orgId={org.id} uploader={uploadTrainerPhoto} previewBg={f.secondary} />
        <div style={{ display: "flex", gap: 8 }}>
          <Field label="Color primario"><input className="inp" type="color" value={f.primary} onChange={set("primary")} /></Field>
          <Field label="Color secundario"><input className="inp" type="color" value={f.secondary} onChange={set("secondary")} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Field label="WhatsApp"><input className="inp" value={f.whatsapp} onChange={set("whatsapp")} placeholder="50688888888" /></Field>
          <Field label="Instagram"><input className="inp" value={f.instagram} onChange={set("instagram")} placeholder="@usuario" /></Field>
        </div>
        <Field label="Correo de contacto"><input className="inp" type="email" value={f.contactEmail} onChange={set("contactEmail")} /></Field>
        <Field label="Bio / descripción"><textarea className="inp" rows={3} value={f.bio} onChange={set("bio")} /></Field>
        <button className="btn btn-p" disabled={busy} onClick={save}>Guardar branding</button>
        {note && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{note}</div>}
      </div>
      <div style={{ ...card, flex: "1 1 240px", alignSelf: "flex-start" }}>
        <div style={{ fontWeight: 800, marginBottom: 8, fontSize: 13 }}>Vista previa</div>
        <div style={{ background: f.secondary, borderRadius: 12, padding: 16, textAlign: "center", color: "#fff" }}>
          {f.logoUrl ? <img src={f.logoUrl} alt="logo" style={{ width: 64, height: 64, objectFit: "contain", background: "#fff", borderRadius: 8, padding: 4 }} /> : <div style={{ fontSize: 34 }}>🏋️</div>}
          <div style={{ fontWeight: 900, marginTop: 8 }}>{f.displayName || org.name}</div>
          {f.tagline && <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{f.tagline}</div>}
          <button style={{ marginTop: 10, background: f.primary, color: "#fff", border: "none", borderRadius: 8, padding: "6px 14px", fontWeight: 800 }}>Botón</button>
        </div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
          Pestaña: {f.faviconUrl || f.logoUrl
            ? <img src={f.faviconUrl || f.logoUrl} alt="favicon" style={{ width: 16, height: 16, objectFit: "contain" }} />
            : "🏋️"} {f.displayName || org.name}
        </div>
      </div>
    </div>
  );
}

// ── Pagos (nivel plataforma) ───────────────────────────────────
function PaymentsModule({ orgs, payments, busy, runAction }) {
  const [orgId, setOrgId] = useState("");
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
      <div style={{ ...card, flex: "1 1 340px" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Registrar pago manual</div>
        <Field label="Organización">
          <select className="inp" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            <option value="">Seleccioná una organización…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.slug})</option>)}
          </select>
        </Field>
        {orgId ? <PaymentForm orgId={orgId} busy={busy} runAction={runAction} onDone={() => {}} /> : <div style={{ color: C.muted, fontSize: 13 }}>Elegí una organización para registrar el pago.</div>}
      </div>
      <div style={{ ...card, flex: "1 1 340px" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Últimos pagos</div>
        {(payments || []).length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>Sin pagos registrados.</div> : payments.slice(0, 20).map((p) => {
          const org = orgs.find((o) => o.id === p.organization_id);
          return (
            <div key={p.id} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0", fontSize: 13 }}>
              <strong>{org?.name || "—"}</strong> — {money(p.amount, p.currency)} · {p.method} · <span style={{ color: C.muted }}>{fmtDate(p.paid_at)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Auditoría ──────────────────────────────────────────────────
function AuditModule({ audit, orgs }) {
  return (
    <div style={{ ...card }}>
      <div style={{ fontWeight: 800, marginBottom: 8 }}>Registro de auditoría</div>
      {(audit || []).length === 0 ? <div style={{ color: C.muted, fontSize: 13 }}>Sin acciones registradas.</div> : audit.map((a) => {
        const org = orgs.find((o) => o.id === a.organization_id);
        return (
          <div key={a.id} style={{ borderTop: `1px solid ${C.line}`, padding: "8px 0", fontSize: 13 }}>
            <strong>{a.action}</strong> {org && <>· {org.name}</>} · <span style={{ color: C.muted }}>{fmtDate(a.created_at)}</span>
            <div style={{ color: C.muted, fontSize: 11 }}>{JSON.stringify(a.metadata)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Modal: nueva organización ──────────────────────────────────
function NewOrgModal({ existingSlugs, busy, onClose, onCreate }) {
  const [f, setF] = useState({ name: "", displayName: "", slug: "", ownerName: "", ownerEmail: "", plan: "base", initialStatus: "trial", logoUrl: "", primaryColor: "#1A5DC8", secondaryColor: "#0B1F4B" });
  const [logoFile, setLogoFile] = useState(null);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  function submit() {
    const v = validateNewOrg(f, existingSlugs);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({});
    onCreate({
      name: v.value.name, displayName: v.value.displayName, slug: v.value.slug,
      ownerName: v.value.ownerName, ownerEmail: v.value.ownerEmail,
      plan: v.value.plan, initialStatus: v.value.initialStatus, tenantType: v.value.tenantType,
      branding: v.value.branding,
      _logoFile: logoFile, // se sube tras crear la org (aún no hay orgId)
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(11,31,75,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: 20, overflowY: "auto", zIndex: 40 }}>
      <div style={{ ...card, maxWidth: 520, width: "100%", marginTop: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>➕ Nueva organización</div>
          <button className="btn btn-g" style={{ padding: "4px 10px" }} onClick={onClose}>✕</button>
        </div>
        <Field label="Nombre de la organización (interno)"><input className="inp" value={f.name} onChange={set("name")} placeholder="Juan Fitness" />{errors.name && <div className="err">⚠ {errors.name}</div>}</Field>
        <Field label="Nombre comercial (visible)"><input className="inp" value={f.displayName} onChange={set("displayName")} placeholder="Juan Fitness Studio" /></Field>
        <Field label="Slug (sugerido, editable, único)"><input className="inp" value={f.slug} onChange={(e) => setF((p) => ({ ...p, slug: slugifyLive(e.target.value) }))} placeholder="juan-fitness" autoCapitalize="none" autoCorrect="off" spellCheck={false} /><div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>URL: {(f.slug || "tu-slug")}.tito-apps.com</div>{errors.slug && <div className="err">⚠ {errors.slug}</div>}</Field>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Field label="Nombre del owner"><input className="inp" value={f.ownerName} onChange={set("ownerName")} />{errors.ownerName && <div className="err">⚠ {errors.ownerName}</div>}</Field>
          <Field label="Correo del owner"><input className="inp" type="email" value={f.ownerEmail} onChange={set("ownerEmail")} placeholder="juan@correo.com" />{errors.ownerEmail && <div className="err">⚠ {errors.ownerEmail}</div>}</Field>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Field label="Plan inicial">
            <select className="inp" value={f.plan} onChange={set("plan")}>
              {PLATFORM_PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Estado inicial">
            <select className="inp" value={f.initialStatus} onChange={set("initialStatus")}><option value="trial">trial</option><option value="active">active</option></select>
          </Field>
        </div>
        <div style={{ fontSize: 12, color: C.muted, fontWeight: 700, margin: "6px 0" }}>Branding inicial (opcional)</div>
        <LogoField label="Logo (subir archivo o pegar URL)" url={f.logoUrl} onUrl={(v) => setF((p) => ({ ...p, logoUrl: v }))} onFile={setLogoFile} previewBg={f.secondaryColor} />
        <div style={{ display: "flex", gap: 8 }}>
          <Field label="Color primario"><input className="inp" type="color" value={f.primaryColor} onChange={set("primaryColor")} /></Field>
          <Field label="Color secundario"><input className="inp" type="color" value={f.secondaryColor} onChange={set("secondaryColor")} /></Field>
        </div>
        <div style={{ fontSize: 11, color: C.muted, margin: "8px 0", lineHeight: 1.4 }}>
          Al crear: se registra la organización, se invita al owner por correo (sin contraseñas manuales), se crea su membresía, la suscripción inicial y el branding. Si un paso falla, la operación es idempotente y podés reintentar sin duplicar datos.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-g" onClick={onClose}>Cancelar</button>
          <button className="btn btn-p" disabled={busy} onClick={submit}>{busy ? "Creando…" : "Crear organización"}</button>
        </div>
      </div>
    </div>
  );
}
