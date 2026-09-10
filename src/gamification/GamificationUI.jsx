import { useState, useEffect } from "react";
import { useTenant } from "../tenant/tenantContext";
import { usePermissions } from "../auth/PermissionsContext";
import { setOrgGamification } from "../db";
import { Toast } from "../trainsync.ui";
import { computeMedals, weeklyGoalFor, DEFAULT_GOAL_PCT, MEDAL_META } from "./medals";
import { computeLeaderboard, isChallengeActive, rankOf, wonChallenges, RANK_EMOJI } from "./challenges";
import { weightProgress } from "./weightProgress";

// ── Celebración: medalla ganada al finalizar un entrenamiento ────
// Se muestra a pantalla completa con animación cuando el cliente cruza un umbral
// semanal (ej. al terminar el 3er entreno de la semana → 🥉). Puramente visual.
const CELEBRATE_MSG = {
  gold: "¡Medalla de ORO! Semana perfecta 🔥",
  silver: "¡Medalla de PLATA! Vas increíble 💪",
  bronze: "¡Medalla de BRONCE! Ya la ganaste 🎉",
};
export function MedalCelebration({ medal, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000); // se cierra sola por si acaso
    return () => clearTimeout(t);
  }, [onClose]);
  if (!medal) return null;
  const meta = MEDAL_META[medal];
  const confetti = Array.from({ length: 28 });
  const colors = ["#D4A017", "#8A94A6", "#B87333", "#1A5DC8", "#4ADE80", "#F87171"];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(11,31,75,0.72)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", animation: "medalFade .3s ease" }}>
      <style>{`
        @keyframes medalFade{from{opacity:0}to{opacity:1}}
        @keyframes medalPop{0%{transform:scale(0) rotate(-40deg);opacity:0}60%{transform:scale(1.25) rotate(8deg);opacity:1}100%{transform:scale(1) rotate(0)}}
        @keyframes medalShine{0%,100%{filter:drop-shadow(0 0 12px rgba(255,255,255,.35))}50%{filter:drop-shadow(0 0 34px rgba(255,255,255,.95))}}
        @keyframes confFall{0%{transform:translateY(-120px) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(720deg);opacity:.9}}
        @keyframes medalRise{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>
      {confetti.map((_, i) => {
        const left = (i * 3.57 + (i % 3) * 5) % 100;
        return <span key={i} style={{ position: "absolute", top: 0, left: `${left}%`, width: 9, height: 14, background: colors[i % colors.length], borderRadius: 2, animation: `confFall ${1.8 + (i % 5) * 0.35}s linear ${(i % 7) * 0.15}s infinite` }} />;
      })}
      <div onClick={(e) => e.stopPropagation()} style={{ textAlign: "center", color: "#fff", padding: 24, maxWidth: 340 }}>
        <div style={{ fontSize: 120, lineHeight: 1, animation: "medalPop .7s cubic-bezier(.2,1.4,.4,1) both, medalShine 1.8s ease-in-out .7s infinite" }}>{meta.emoji}</div>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", color: "#FFE082", marginTop: 14, animation: "medalRise .5s ease .5s both" }}>¡Lo lograste!</div>
        <div style={{ fontSize: 22, fontWeight: 900, marginTop: 6, animation: "medalRise .5s ease .65s both", fontFamily: "'Barlow Condensed',sans-serif" }}>{CELEBRATE_MSG[medal]}</div>
        <button onClick={onClose} className="btn btn-sm" style={{ marginTop: 22, background: "#fff", color: "#0B1F4B", fontWeight: 800, animation: "medalRise .5s ease .8s both" }}>¡Seguir así! 🎯</button>
      </div>
    </div>
  );
}

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

// ── Logros de los clientes (dashboard del coach) ─────────────────
// Para cada cliente: su meta (días/semana), cómo va esta semana, medalla actual,
// cuántas veces llegó a la meta y su record acumulado. Todo derivado de las sesiones.
function ClientAchievements({ clients, sessions, routines, pct }) {
  const rows = clients.map((c) => {
    const goal = weeklyGoalFor(c, routines);
    const r = computeMedals(sessions, c.id, goal, pct);
    return { id: c.id, name: c.name || "Cliente", goal, r };
  }).sort((a, b) => (b.r.goalsReached - a.r.goalsReached) || (b.r.current.count - a.r.current.count));

  if (!rows.length) return null;
  return (
    <div className="card">
      <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 4 }}>📊 Logros de tus clientes</div>
      <div style={{ fontSize: 12, color: "#6B7A99", marginBottom: 10 }}>Cómo va cada uno esta semana y su historial de metas cumplidas.</div>
      <div style={{ maxHeight: 560, overflowY: "auto", marginRight: -4, paddingRight: 4 }}>
      {rows.map((row) => {
        const cur = row.r.current;
        const meta = cur.medal ? MEDAL_META[cur.medal] : null;
        return (
          <div key={row.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid #EEF2F9" }}>
            <span style={{ fontSize: 22, width: 26, textAlign: "center" }}>{meta ? meta.emoji : "⚪"}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "#0B1F4B", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.name}</div>
              <div style={{ fontSize: 11, color: "#6B7A99" }}>
                {row.goal ? <>Esta semana <strong style={{ color: cur.count >= row.goal ? "#2E7D32" : "#0B1F4B" }}>{cur.count}/{row.goal}</strong> días · llegó a la meta <strong>{row.r.goalsReached}</strong> {row.r.goalsReached === 1 ? "vez" : "veces"}</> : <span style={{ color: "#C0392B" }}>Sin rutina asignada</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#475569" }}>
              <span title="Oro">🥇{row.r.totals.gold}</span>
              <span title="Plata">🥈{row.r.totals.silver}</span>
              <span title="Bronce">🥉{row.r.totals.bronze}</span>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── Config + retos del ENTRENADOR ────────────────────────────────
export function ChallengesPage({ clients = [], sessions = [], challenges = [], routines = [], onSaveChallenge, onDeleteChallenge }) {
  const tenant = useTenant();
  const orgId = tenant?.org?.id || null;
  const { readOnly } = usePermissions();
  const g = tenant?.gamification || {};
  const [enabled, setEnabled] = useState(!!g.enabled);
  // Medallas por % del objetivo (días/semana de la rutina de cada cliente).
  const [pct, setPct] = useState({
    bronze: g.goalPct?.bronze || DEFAULT_GOAL_PCT.bronze,
    silver: g.goalPct?.silver || DEFAULT_GOAL_PCT.silver,
    gold: g.goalPct?.gold || DEFAULT_GOAL_PCT.gold,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const setN = (k) => (e) => setPct((w) => ({ ...w, [k]: e.target.value }));

  // Formulario de reto nuevo
  const blank = { title: "", prize: "", startsOn: todayISO(), endsOn: plusDaysISO(30), visibleToClients: true };
  const [form, setForm] = useState(blank);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function saveConfig() {
    if (readOnly) { setToast({ msg: "Modo demostración: solo lectura", type: "err" }); return; }
    setSaving(true);
    try { await setOrgGamification(orgId, { enabled, goalPct: pct }); setToast({ msg: "Configuración guardada. Tus clientes la verán al recargar.", type: "ok" }); }
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

      {/* Layout 2 columnas: izq = config + retos, der = logros. En pantallas chicas
          colapsa a una sola columna (logros queda al final). */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, alignItems: "start" }}>
        {/* Columna izquierda */}
        <div>

      {/* Medallas */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ fontWeight: 800, color: "#0B1F4B", marginBottom: 8 }}>🏅 Medallas automáticas</div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 12 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} disabled={readOnly} style={{ width: 18, height: 18 }} />
          <span style={{ fontWeight: 700, color: "#0B1F4B" }}>Activar medallas para mis clientes</span>
        </label>
        <div style={{ fontSize: 12, color: "#6B7A99", marginBottom: 10 }}>Cada cliente tiene una meta = los <strong>días/semana de su rutina</strong>. La medalla depende de qué % de su meta cumple en la semana:</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          {[["bronze", "🥉 Bronce"], ["silver", "🥈 Plata"], ["gold", "🥇 Oro"]].map(([k, lbl]) => (
            <div key={k} style={{ flex: "1 1 120px", display: "flex", flexDirection: "column" }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#0B1F4B", marginBottom: 4 }}>{lbl}</label>
              <div style={{ position: "relative" }}>
                <input className="inp" type="number" min={1} max={200} value={pct[k]} onChange={setN(k)} disabled={readOnly || !enabled} style={{ paddingRight: 26 }} />
                <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#6B7A99", fontWeight: 700, pointerEvents: "none" }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: "#9AA7BD", marginTop: 3 }}>de la meta</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#6B7A99", marginTop: 8, background: "#F8FAFC", borderRadius: 8, padding: "6px 10px" }}>Ejemplo: meta de 4 días → 🥉 {Math.ceil(4 * (Number(pct.bronze) || 50) / 100)}, 🥈 {Math.ceil(4 * (Number(pct.silver) || 75) / 100)}, 🥇 {Math.ceil(4 * (Number(pct.gold) || 100) / 100)} entrenos.</div>
        <button className="btn btn-p" style={{ marginTop: 10 }} onClick={saveConfig} disabled={saving || readOnly}>{saving ? "Guardando…" : "Guardar medallas"}</button>
      </div>

      {/* Retos */}
      <div className="card">
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
        </div>{/* /columna izquierda */}

        {/* Columna derecha: logros de clientes */}
        {enabled && <ClientAchievements clients={clients} sessions={sessions} routines={routines} pct={pct} />}
      </div>{/* /grid */}
    </div>
  );
}

// ── Vista del CLIENTE: medallas + reto activo ────────────────────
export function MedalsView({ sessions, clientId, gamification, goal = null, clients = [], challenges = [] }) {
  const pct = gamification?.goalPct || DEFAULT_GOAL_PCT;
  const r = computeMedals(sessions, clientId, goal, pct);
  const cur = r.current;
  const curMeta = cur.medal ? MEDAL_META[cur.medal] : null;
  // Reto activo y visible a clientes (el más reciente si hubiera varios).
  const activeChallenge = challenges.find((c) => c.visibleToClients && isChallengeActive(c));
  // Trofeos: retos ya finalizados que ganó (estante de logros).
  const trophies = wonChallenges(sessions, clients, challenges, clientId);
  // Progreso de peso: en cuántos ejercicios subió el peso en las últimas 2 semanas.
  const progress = weightProgress(sessions, clientId);

  return (
    <div>
      <div className="card" style={{ marginBottom: 12, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Esta semana</div>
        <div style={{ fontSize: 44, lineHeight: 1 }}>{curMeta ? curMeta.emoji : "⚪"}</div>
        <div style={{ fontWeight: 800, color: "#0B1F4B", marginTop: 6 }}>{curMeta ? curMeta.label : "Sin medalla aún"}</div>
        <div style={{ fontSize: 13, color: "#475569", marginTop: 4 }}>{r.goal ? <><strong>{cur.count} de {r.goal}</strong> días de tu meta esta semana</> : <>{cur.count} entrenamiento{cur.count === 1 ? "" : "s"} esta semana</>}</div>
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

      {progress.count > 0 && (
        <div className="card" style={{ marginBottom: 12, background: progress.earned ? "#ECFDF5" : "#F8FAFC", border: progress.earned ? "1px solid #A7F3D0" : "1px solid #E3E6EA" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 30 }}>📈</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, color: "#0B1F4B" }}>{progress.earned ? "¡Insignia de progreso!" : "Vas subiendo el peso"}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>Subiste el peso en <strong>{progress.count}</strong> ejercicio{progress.count === 1 ? "" : "s"} en las últimas 2 semanas{progress.earned ? " 💪" : `. Te falta${progress.threshold - progress.count === 1 ? "" : "n"} ${progress.threshold - progress.count} para la insignia.`}</div>
            </div>
          </div>
          {progress.improved.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {progress.improved.slice(0, 6).map((e) => (
                <span key={e.exId} style={{ fontSize: 11, background: "#fff", border: "1px solid #D1FAE5", borderRadius: 999, padding: "3px 9px", color: "#065F46", fontWeight: 600 }}>{e.name}: {e.from}→{e.to} lbs</span>
              ))}
            </div>
          )}
        </div>
      )}

      {trophies.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7A99", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>🏆 Trofeos · retos ganados</div>
          {trophies.map((ch) => (
            <div key={ch.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #EEF2F9" }}>
              <span style={{ fontSize: 26 }}>🏆</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 800, color: "#0B1F4B", fontSize: 14 }}>{ch.title}</div>
                <div style={{ fontSize: 11, color: "#6B7A99" }}>1er lugar · {ch.count} entreno{ch.count === 1 ? "" : "s"}{ch.prize ? ` · 🎁 ${ch.prize}` : ""}</div>
              </div>
              <span className="badge bd-green" style={{ fontSize: 9 }}>GANADO</span>
            </div>
          ))}
        </div>
      )}

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
