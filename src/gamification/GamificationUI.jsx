import { useState } from "react";
import { useTenant } from "../tenant/tenantContext";
import { usePermissions } from "../auth/PermissionsContext";
import { setOrgGamification } from "../db";
import { Toast } from "../trainsync.ui";
import { computeMedals, DEFAULT_THRESHOLDS, MEDAL_META } from "./medals";
import { computeLeaderboard, isChallengeActive, rankOf, RANK_EMOJI } from "./challenges";

// Tabla de posiciones reutilizable (entrenador y cliente).
function Leaderboard({ rows, highlightId }) {
  if (!rows.length) return <div style={{ fontSize: 12, color: "#6B7A99" }}>Sin clientes para rankear.</div>;
  return (
    <div>
      {rows.map((r) => (
        <div key={r.clientId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 8, marginBottom: 2, background: r.clientId === highlightId ? "#EEF4FF" : "transparent", fontSize: 13 }}>
          <span style={{ width: 26, textAlign: "center", fontWeight: 800 }}>{RANK_EMOJI[r.rank] || r.rank}</span>
          <span style={{ flex: 1, fontWeight: r.clientId === highlightId ? 800 : 600, color: "#0B1F4B" }}>{r.name}{r.clientId === highlightId ? " (vos)" : ""}</span>
          <span style={{ fontWeight: 700, color: "#1A5DC8" }}>{r.count} entreno{r.count === 1 ? "" : "s"}</span>
        </div>
      ))}
    </div>
  );
}

function fmtRange(a, b) {
  const f = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("es-CR", { day: "2-digit", month: "short" }); } catch { return d; } };
  return `${f(a)} — ${f(b)}`;
}
const todayISO = () => new Date().toISOString().slice(0, 10);
const plusDaysISO = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// ── Config + retos del ENTRENADOR ────────────────────────────────
export function ChallengesPage({ clients = [], sessions = [], challenges = [], onSaveChallenge, onDeleteChallenge }) {
  const tenant = useTenant();
  const orgId = tenant?.org?.id || null;
  const { readOnly } = usePermissions();
  const g = tenant?.gamification || {};
  const [enabled, setEnabled] = useState(!!g.enabled);
  const [weekly, setWeekly] = useState({
    bronze: g.weekly?.bronze || DEFAULT_THRESHOLDS.bronze,
    silver: g.weekly?.silver || DEFAULT_THRESHOLDS.silver,
    gold: g.weekly?.gold || DEFAULT_THRESHOLDS.gold,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const setN = (k) => (e) => setWeekly((w) => ({ ...w, [k]: e.target.value }));

  // Formulario de reto nuevo
  const blank = { title: "", prize: "", startsOn: todayISO(), endsOn: plusDaysISO(30), visibleToClients: true };
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveConfig() {
    if (readOnly) { setToast({ msg: "Modo demostración: solo lectura", type: "err" }); return; }
    setSaving(true);
    try { await setOrgGamification(orgId, { enabled, weekly }); setToast({ msg: "Configuración guardada. Tus clientes la verán al recargar.", type: "ok" }); }
    catch (e) { setToast({ msg: "No se pudo guardar: " + (e?.message || e), type: "err" }); }
    finally { setSaving(false); }
  }

  async function createChallenge() {
    if (readOnly) { setToast({ msg: "Modo demostración: solo lectura", type: "err" }); return; }
    if (!form.title.trim()) { setToast({ msg: "Poné un nombre al reto.", type: "err" }); return; }
    if (form.endsOn < form.startsOn) { setToast({ msg: "La fecha de fin no puede ser antes del inicio.", type: "err" }); return; }
    setBusy(true);
    try { await onSaveChallenge({ ...form, title: form.title.trim(), metric: "most_workouts", active: true }, orgId); setForm(blank); setShowForm(false); setToast({ msg: "Reto creado.", type: "ok" }); }
    catch (e) { setToast({ msg: "No se pudo crear: " + (e?.message || e), type: "err" }); }
    finally { setBusy(false); }
  }

  async function removeChallenge(id) {
    if (readOnly || !confirm("¿Eliminar este reto?")) return;
    try { await onDeleteChallenge(id); setToast({ msg: "Reto eliminado.", type: "ok" }); }
    catch (e) { setToast({ msg: "No se pudo eliminar: " + (e?.message || e), type: "err" }); }
  }

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="ph"><div><div className="pt">Retos y medallas</div><div className="ps">Premiá la constancia de tus clientes</div></div></div>

      {/* Medallas */}
      <div className="card" style={{ maxWidth: 560, marginBottom: 12 }}>
        <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 8 }}>🏅 Medallas automáticas</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 12 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} style={{ width: 18, height: 18 }} />
          <span style={{ fontWeight: 700, color: "#0B1F4B" }}>Activar medallas para mis clientes</span>
        </label>
        <div style={{ fontSize: 12, color: "#6B7A99", marginBottom: 10 }}>Cuántos entrenamientos por semana hacen falta para cada medalla:</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[["bronze", "🥉 Bronce"], ["silver", "🥈 Plata"], ["gold", "🥇 Oro"]].map(([k, lbl]) => (
            <div className="fg" key={k} style={{ flex: "1 1 120px" }}>
              <label>{lbl} — entrenos/semana</label>
              <input className="inp" type="number" min={1} max={14} value={weekly[k]} onChange={setN(k)} disabled={readOnly || !enabled} />
            </div>
          ))}
        </div>
        <button className="btn btn-p" style={{ marginTop: 6 }} onClick={saveConfig} disabled={saving || readOnly}>{saving ? "Guardando…" : "Guardar medallas"}</button>
      </div>

      {/* Retos */}
      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontWeight: 800, color: "#0B1F4B" }}>🏆 Retos (competencias)</div>
          {!readOnly && <button className="btn btn-s btn-sm" onClick={() => { setForm(blank); setShowForm((s) => !s); }}>{showForm ? "Cancelar" : "+ Nuevo reto"}</button>}
        </div>
        <div style={{ fontSize: 12, color: "#6B7A99", marginBottom: 10 }}>Una competencia por período: gana quien complete más entrenamientos. El ranking se actualiza solo.</div>

        {showForm && (
          <div style={{ background: "#F8FAFC", border: "1px solid #E3E6EA", borderRadius: 10, padding: 12, marginBottom: 12 }}>
            <div className="fg"><label>Nombre del reto</label><input className="inp" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej: Reto de septiembre" /></div>
            <div className="fg"><label>Premio (opcional)</label><input className="inp" value={form.prize} onChange={(e) => setForm({ ...form, prize: e.target.value })} placeholder="Ej: 1 mes gratis" /></div>
            <div style={{ display: "flex", gap: 8 }}>
              <div className="fg" style={{ flex: 1 }}><label>Desde</label><input className="inp" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} /></div>
              <div className="fg" style={{ flex: 1 }}><label>Hasta</label><input className="inp" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} /></div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", margin: "4px 0 10px" }}>
              <input type="checkbox" checked={form.visibleToClients} onChange={(e) => setForm({ ...form, visibleToClients: e.target.checked })} />
              <span style={{ fontSize: 13, color: "#0B1F4B" }}>Mostrar el ranking a los clientes</span>
            </label>
            <button className="btn btn-p btn-sm" onClick={createChallenge} disabled={busy}>{busy ? "Creando…" : "Crear reto"}</button>
          </div>
        )}

        {challenges.length === 0 && <div style={{ fontSize: 12, color: "#6B7A99" }}>Todavía no creaste ningún reto.</div>}
        {challenges.map((ch) => {
          const rows = computeLeaderboard(sessions, clients, ch.startsOn, ch.endsOn);
          const active = isChallengeActive(ch);
          return (
            <div key={ch.id} style={{ borderTop: "1px solid #DDE4F0", paddingTop: 10, marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 800, color: "#0B1F4B", fontSize: 14 }}>{ch.title} {active ? <span className="badge bd-green" style={{ fontSize: 9 }}>ACTIVO</span> : <span className="badge bd-gray" style={{ fontSize: 9 }}>{ch.endsOn < todayISO() ? "FINALIZADO" : "PRÓXIMO"}</span>}</div>
                  <div style={{ fontSize: 11, color: "#6B7A99" }}>{fmtRange(ch.startsOn, ch.endsOn)}{ch.prize ? ` · 🎁 ${ch.prize}` : ""}{ch.visibleToClients ? " · visible a clientes" : " · solo para vos"}</div>
                </div>
                {!readOnly && <button className="ibtn d" onClick={() => removeChallenge(ch.id)}>🗑</button>}
              </div>
              <div style={{ marginTop: 8 }}><Leaderboard rows={rows} /></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Vista del CLIENTE: medallas + reto activo ────────────────────
export function MedalsView({ sessions, clientId, gamification, clients = [], challenges = [] }) {
  const th = gamification?.weekly || DEFAULT_THRESHOLDS;
  const r = computeMedals(sessions, clientId, th);
  const cur = r.current;
  const curMeta = cur.medal ? MEDAL_META[cur.medal] : null;
  // Reto activo y visible a clientes (el más reciente si hubiera varios).
  const activeChallenge = challenges.find((c) => c.visibleToClients && isChallengeActive(c));

  return (
    <div>
      <div className="card" style={{ marginBottom: 12, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Esta semana</div>
        <div style={{ fontSize: 44, lineHeight: 1 }}>{curMeta ? curMeta.emoji : "⚪"}</div>
        <div style={{ fontWeight: 800, color: "#0B1F4B", marginTop: 6 }}>{curMeta ? curMeta.label : "Sin medalla aún"}</div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{cur.count} entrenamiento{cur.count === 1 ? "" : "s"} esta semana</div>
        {cur.next && <div style={{ fontSize: 12, color: "#1A5DC8", fontWeight: 700, marginTop: 6 }}>Te falta{cur.next.need === 1 ? "" : "n"} {cur.next.need} para {MEDAL_META[cur.next.level].emoji} {MEDAL_META[cur.next.level].label}</div>}
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Récord personal</div>
        <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
          {["gold", "silver", "bronze"].map((k) => (
            <div key={k}>
              <div style={{ fontSize: 30 }}>{MEDAL_META[k].emoji}</div>
              <div style={{ fontWeight: 900, fontSize: 20, color: "#0B1F4B" }}>{r.totals[k]}</div>
              <div style={{ fontSize: 11, color: "#6B7A99" }}>{MEDAL_META[k].label}</div>
            </div>
          ))}
        </div>
      </div>

      {activeChallenge && (() => {
        const rows = computeLeaderboard(sessions, clients, activeChallenge.startsOn, activeChallenge.endsOn);
        const me = rankOf(rows, clientId);
        return (
          <div className="card" style={{ marginBottom: 12, background: "#FFF8E1", border: "1px solid #FFE082" }}>
            <div style={{ fontWeight: 800, color: "#0B1F4B" }}>🏆 {activeChallenge.title}</div>
            <div style={{ fontSize: 11, color: "#8A6D3B", marginBottom: 6 }}>{fmtRange(activeChallenge.startsOn, activeChallenge.endsOn)}{activeChallenge.prize ? ` · 🎁 ${activeChallenge.prize}` : ""}</div>
            {me && <div style={{ fontSize: 13, fontWeight: 700, color: "#0B1F4B", marginBottom: 6 }}>Vas en el puesto {RANK_EMOJI[me.rank] || `#${me.rank}`} con {me.count} entreno{me.count === 1 ? "" : "s"}</div>}
            <Leaderboard rows={rows} highlightId={clientId} />
          </div>
        );
      })()}

      {r.weeks.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Historial semanal</div>
          {r.weeks.slice(0, 12).map((w) => (
            <div key={w.week} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #EEF2F9", fontSize: 13 }}>
              <span style={{ width: 22, textAlign: "center" }}>{w.medal ? MEDAL_META[w.medal].emoji : "⚪"}</span>
              <span style={{ flex: 1, color: "#475569" }}>Semana del {w.label}</span>
              <span style={{ fontWeight: 700, color: "#0B1F4B" }}>{w.count} entreno{w.count === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
