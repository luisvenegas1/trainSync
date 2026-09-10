import { useState } from "react";
import { useTenant } from "../tenant/tenantContext";
import { usePermissions } from "../auth/PermissionsContext";
import { setOrgGamification } from "../db";
import { Toast } from "../trainsync.ui";
import { computeMedals, DEFAULT_THRESHOLDS, MEDAL_META } from "./medals";

// ── Config del ENTRENADOR: activar medallas + umbrales semanales ──
export function ChallengesPage() {
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

  async function save() {
    if (readOnly) { setToast({ msg: "Modo demostración: solo lectura", type: "err" }); return; }
    setSaving(true);
    try {
      await setOrgGamification(orgId, { enabled, weekly });
      setToast({ msg: "Configuración guardada. Tus clientes verán los cambios al recargar.", type: "ok" });
    } catch (e) { setToast({ msg: "No se pudo guardar: " + (e?.message || e), type: "err" }); }
    finally { setSaving(false); }
  }

  return (
    <div>
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
      <div className="ph"><div><div className="pt">Retos y medallas</div><div className="ps">Premiá a tus clientes por entrenar constante</div></div></div>
      <div className="card" style={{ maxWidth: 520, marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 14 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} style={{ width: 18, height: 18 }} />
          <span style={{ fontWeight: 700, color: "#0B1F4B" }}>Activar medallas para mis clientes</span>
        </label>
        <div style={{ fontSize: 12, color: "#6B7A99", marginBottom: 12 }}>
          Cada semana, según cuántos entrenamientos complete el cliente, gana una medalla. Definí cuántos hacen falta para cada una:
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {[["bronze", "🥉 Bronce"], ["silver", "🥈 Plata"], ["gold", "🥇 Oro"]].map(([k, lbl]) => (
            <div className="fg" key={k} style={{ flex: "1 1 120px" }}>
              <label>{lbl} — entrenos/semana</label>
              <input className="inp" type="number" min={1} max={14} value={weekly[k]} onChange={setN(k)} disabled={readOnly || !enabled} />
            </div>
          ))}
        </div>
        <button className="btn btn-p" style={{ marginTop: 6 }} onClick={save} disabled={saving || readOnly}>{saving ? "Guardando…" : "Guardar"}</button>
      </div>
      <div className="card" style={{ maxWidth: 520, fontSize: 13, color: "#475569", lineHeight: 1.6 }}>
        <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 6 }}>Cómo funciona</div>
        Las medallas se calculan solas con los entrenamientos que el cliente registra — no tenés que asignarlas a mano. La semana en curso muestra el avance; las semanas cerradas se suman al récord personal de cada cliente.
      </div>
    </div>
  );
}

// ── Vista del CLIENTE: sus medallas (semana actual + récord acumulado) ──
export function MedalsView({ sessions, clientId, gamification }) {
  const th = gamification?.weekly || DEFAULT_THRESHOLDS;
  const r = computeMedals(sessions, clientId, th);
  const cur = r.current;
  const curMeta = cur.medal ? MEDAL_META[cur.medal] : null;

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
