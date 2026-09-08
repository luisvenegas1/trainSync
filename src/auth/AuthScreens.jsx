import { useState } from "react";
import { useBranding } from "../branding/BrandingContext";
import { sendPasswordReset, updateOwnPassword } from "./authClient";
import { PasswordField } from "./PasswordField";

// Spinner de carga de sesión.
export function AuthLoading({ label = "Verificando sesión…" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16, background: "#F4F6FB" }}>
      <div style={{ width: 48, height: 48, border: "4px solid #DDE4F0", borderTop: "4px solid #1A5DC8", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontFamily: "'Barlow',sans-serif", fontSize: 14, color: "#6B7A99" }}>{label}</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// Login real con Supabase Auth (email + contraseña). No lee usuarios/hashes.
// Enlaces de contacto normalizados a partir del branding del tenant.
function waLink(v) { const d = String(v || "").replace(/\D/g, ""); return d ? `https://wa.me/${d}` : null; }
function igLink(v) { if (!v) return null; const s = String(v).trim(); return /^https?:\/\//i.test(s) ? s : `https://instagram.com/${s.replace(/^@/, "")}`; }

// "Sobre el entrenador" — panel manejado por el BRANDING del tenant (foto, bio,
// contacto). Solo muestra los campos que la organización tenga configurados.
function SobreTrainer({ brand, onClose }) {
  const wa = waLink(brand.whatsapp);
  const ig = igLink(brand.instagram);
  const mail = brand.contactEmail ? `mailto:${brand.contactEmail}` : null;
  return (
    <div className="mb" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(11,31,75,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="mo" style={{ maxWidth: 540, width: "100%", borderRadius: 20, background: "#fff", padding: 22, maxHeight: "90vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#0B1F4B" }}>Sobre {brand.displayName || "el entrenador"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#6B7A99" }}>✕</button>
        </div>
        {brand.trainerPhotoUrl && (
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <img src={brand.trainerPhotoUrl} alt={brand.displayName} style={{ width: 160, height: 200, objectFit: "cover", objectPosition: "top", borderRadius: 14, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }} />
          </div>
        )}
        {brand.bio && (
          <div style={{ fontSize: 13, color: "#0D1B3E", lineHeight: 1.65, marginBottom: 16, whiteSpace: "pre-line" }}>{brand.bio}</div>
        )}
        {(brand.callToAction || wa || ig || mail) && (
          <div style={{ background: "#F5F7FC", borderRadius: 10, padding: "12px 14px" }}>
            {brand.callToAction && <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7A99", textAlign: "center", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>{brand.callToAction}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {wa && <a href={wa} target="_blank" rel="noreferrer" style={{ background: "#25D366", color: "#fff", padding: "10px 18px", borderRadius: 9, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>WhatsApp</a>}
              {ig && <a href={ig} target="_blank" rel="noreferrer" style={{ background: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)", color: "#fff", padding: "10px 18px", borderRadius: 9, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Instagram</a>}
              {mail && <a href={mail} style={{ background: "#0B1F4B", color: "#fff", padding: "10px 18px", borderRadius: 9, fontWeight: 700, fontSize: 13, textDecoration: "none" }}>Correo</a>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SupabaseLogin({ onSubmit, formError }) {
  const brand = useBranding();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false); // vista "olvidé mi contraseña"
  const [resetMsg, setResetMsg] = useState(null);
  const [resetErr, setResetErr] = useState(null);
  const [showSobre, setShowSobre] = useState(false);
  const hasTrainerInfo = !!(brand.bio || brand.trainerPhotoUrl || brand.contactEmail || brand.whatsapp || brand.instagram);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(email.trim(), pw);
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(e) {
    e.preventDefault();
    setResetMsg(null); setResetErr(null);
    if (!email.trim()) { setResetErr("Escribí tu correo primero."); return; }
    setBusy(true);
    try {
      // Vuelve a esta misma dirección; Supabase abre la sesión de recuperación.
      const res = await sendPasswordReset(email.trim(), window.location.origin + "/");
      if (res.ok) setResetMsg("Si el correo existe, te enviamos un enlace para restablecer tu contraseña. Revisá tu bandeja (y spam).");
      else setResetErr("No se pudo enviar: " + (res.error || "intentá de nuevo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      {showSobre && <SobreTrainer brand={brand} onClose={() => setShowSobre(false)} />}
      <div className="login-box">
        <div className="login-logo">
          {brand.logoUrl && <img src={brand.logoUrl} alt={brand.displayName} style={{ width: 120, height: 120, objectFit: "contain", display: "block", margin: "0 auto 10px" }} />}
          <div className="login-brand">{brand.displayName}</div>
          <div className="login-sub">{brand.tagline}</div>
        </div>
        {!forgot && (<>
          {formError && <div className="err">⚠ {formError}</div>}
          <form onSubmit={submit}>
            <div className="fg"><label>Correo</label><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoComplete="username" /></div>
            <div className="fg"><label>Contraseña</label><PasswordField value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></div>
            <button className="btn btn-p btn-full" type="submit" style={{ marginTop: 8 }} disabled={busy}>{busy ? "Ingresando…" : "Ingresar →"}</button>
          </form>
          <button type="button" onClick={() => { setForgot(true); setResetMsg(null); setResetErr(null); }} style={{ background: "none", border: "none", color: "#1A5DC8", fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 12, display: "block", width: "100%", textAlign: "center" }}>¿Olvidaste tu contraseña?</button>
          {hasTrainerInfo && (
            <div style={{ textAlign: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid #DDE4F0" }}>
              <button type="button" onClick={() => setShowSobre(true)} style={{ background: "none", border: "none", cursor: "pointer", color: "#1A5DC8", fontSize: 13, fontWeight: 700, textDecoration: "underline", padding: 0 }}>
                Sobre {brand.displayName || "el entrenador"} →
              </button>
            </div>
          )}
        </>)}
        {forgot && (<>
          <div style={{ fontSize: 13, color: "#6B7A99", marginBottom: 10 }}>Escribí tu correo y te enviamos un enlace para crear una nueva contraseña.</div>
          {resetMsg && <div style={{ background: "#E8F5E9", border: "1px solid #A5D6A7", color: "#2E7D32", borderRadius: 8, padding: "8px 12px", fontSize: 12, marginBottom: 10 }}>{resetMsg}</div>}
          {resetErr && <div className="err">⚠ {resetErr}</div>}
          <form onSubmit={sendReset}>
            <div className="fg"><label>Correo</label><input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" autoComplete="username" /></div>
            <button className="btn btn-p btn-full" type="submit" style={{ marginTop: 8 }} disabled={busy}>{busy ? "Enviando…" : "Enviar enlace"}</button>
          </form>
          <button type="button" onClick={() => setForgot(false)} style={{ background: "none", border: "none", color: "#6B7A99", fontSize: 12, fontWeight: 700, cursor: "pointer", marginTop: 12, display: "block", width: "100%", textAlign: "center" }}>← Volver al inicio de sesión</button>
        </>)}
        <div style={{ marginTop: 16, fontSize: 11, color: "rgba(0,0,0,0.4)", textAlign: "center" }}>
          Al ingresar aceptás los <a href="/terminos" style={{ color: "inherit", textDecoration: "underline" }}>Términos</a> y la <a href="/privacidad" style={{ color: "inherit", textDecoration: "underline" }}>Privacidad</a>.
        </div>
      </div>
    </div>
  );
}

// Pantalla para FIJAR una nueva contraseña tras el enlace de recuperación
// (evento PASSWORD_RECOVERY de Supabase). El usuario ya tiene una sesión temporal.
export function SetNewPasswordScreen({ onDone }) {
  const brand = useBranding();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 6) { setErr("La contraseña debe tener al menos 6 caracteres."); return; }
    if (pw !== pw2) { setErr("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      const res = await updateOwnPassword(pw);
      if (!res.ok) { setErr("No se pudo actualizar: " + (res.error || "el enlace pudo expirar.")); return; }
      setOk(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <div className="login-logo">
          {brand.logoUrl && <img src={brand.logoUrl} alt={brand.displayName} style={{ width: 100, height: 100, objectFit: "contain", display: "block", margin: "0 auto 10px" }} />}
          <div className="login-brand">Nueva contraseña</div>
        </div>
        {ok ? (
          <>
            <div style={{ background: "#E8F5E9", border: "1px solid #A5D6A7", color: "#2E7D32", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginBottom: 12 }}>✅ Tu contraseña quedó actualizada.</div>
            <button className="btn btn-p btn-full" onClick={onDone}>Continuar →</button>
          </>
        ) : (
          <form onSubmit={submit}>
            {err && <div className="err">⚠ {err}</div>}
            <div className="fg"><label>Nueva contraseña</label><PasswordField value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></div>
            <div className="fg"><label>Confirmar contraseña</label><PasswordField value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></div>
            <button className="btn btn-p btn-full" type="submit" style={{ marginTop: 8 }} disabled={busy}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

// Pantallas de error de acceso/ sesión.
export function AuthErrorScreen({ kind, slug, onLogout }) {
  const map = {
    no_membership: { icon: "🚫", title: "Sin acceso", detail: "Tu cuenta no pertenece a ninguna organización. Pedile a tu entrenador que te invite." },
    wrong_org: { icon: "⛔", title: "Organización incorrecta", detail: `Tu cuenta no pertenece a “${slug || "esta organización"}”. Iniciá sesión desde la URL de tu organización.` },
    suspended: { icon: "⏸️", title: "Organización suspendida", detail: "Esta organización está temporalmente inactiva. Contactá al administrador." },
    invalid_session: { icon: "🔒", title: "Sesión inválida", detail: "Tu sesión expiró o no es válida. Volvé a iniciar sesión." },
    org_not_found: { icon: "🏋️", title: "Organización no encontrada", detail: "No existe una organización para esta dirección." },
    error: { icon: "⚠️", title: "Algo salió mal", detail: "No se pudo verificar tu sesión. Intentá de nuevo." },
  };
  const m = map[kind] || map.error;
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, background: "#0B1F4B", color: "#fff", padding: 24, textAlign: "center", fontFamily: "'Barlow',sans-serif" }}>
      <div style={{ fontSize: 40 }}>{m.icon}</div>
      <div style={{ fontSize: 19, fontWeight: 800 }}>{m.title}</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", maxWidth: 380 }}>{m.detail}</div>
      <button className="btn btn-p" style={{ marginTop: 8 }} onClick={onLogout}>Cerrar sesión</button>
    </div>
  );
}

// Pantalla de organización suspendida (para trainer/cliente/demo de una org bloqueada).
export function SuspendedScreen({ onLogout }) {
  const brand = useBranding();
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, background: "#0B1F4B", color: "#fff", padding: 24, textAlign: "center", fontFamily: "'Barlow',sans-serif" }}>
      <div style={{ fontSize: 42 }}>⏸️</div>
      <div style={{ fontSize: 19, fontWeight: 800 }}>Cuenta suspendida</div>
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", maxWidth: 380 }}>
        El acceso a <strong>{brand.displayName}</strong> está temporalmente suspendido.
        Contactá a tu entrenador o administrador para reactivarlo.
      </div>
      <button className="btn btn-p" style={{ marginTop: 8 }} onClick={onLogout}>Cerrar sesión</button>
    </div>
  );
}

// Pantalla de cuenta/facturación (para el OWNER de una org bloqueada): puede ver su
// estado aunque el acceso operativo esté cortado.
export function BillingScreen({ subscription, onLogout }) {
  const brand = useBranding();
  const s = subscription || {};
  const label = { trial: "Prueba", active: "Activa", past_due: "Pago pendiente", suspended: "Suspendida", canceled: "Cancelada" }[s.status] || (s.status || "—");
  const fmt = (d) => (d ? new Date(d).toLocaleDateString("es-CR", { day: "2-digit", month: "short", year: "numeric" }) : "—");
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F4F6FB", padding: 24, fontFamily: "'Barlow',sans-serif" }}>
      <div style={{ background: "#fff", border: "1px solid #DDE4F0", borderRadius: 16, padding: 28, maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>💳</div>
        <div style={{ fontSize: 19, fontWeight: 800, color: "#0B1F4B" }}>Estado de tu cuenta</div>
        <div style={{ fontSize: 13, color: "#6B7A99", marginBottom: 16 }}>{brand.displayName}</div>
        <div style={{ textAlign: "left", border: "1px solid #DDE4F0", borderRadius: 10, padding: 12, marginBottom: 16 }}>
          {[["Estado", label], ["Plan", s.plan || "—"], ["Vence", fmt(s.current_period_end)], ["Gracia hasta", fmt(s.grace_period_ends_at)]].map(([k, v]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #EEF1F7" }}>
              <span style={{ color: "#6B7A99" }}>{k}</span><span style={{ fontWeight: 700, color: "#0B1F4B" }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "#E53935", fontWeight: 700, marginBottom: 4 }}>
          El acceso operativo está bloqueado.
        </div>
        <div style={{ fontSize: 12, color: "#6B7A99", marginBottom: 16 }}>
          Para reactivar tu organización, contactá a <strong>Tito Apps</strong>.
        </div>
        <button className="btn btn-g btn-full" onClick={onLogout}>Cerrar sesión</button>
      </div>
    </div>
  );
}

// Aviso de solo lectura para demo_viewer.
export function DemoBanner() {
  return (
    <div style={{ background: "#F3E5F5", border: "1px solid #E1BEE7", color: "#7B1FA2", borderRadius: 10, padding: "8px 14px", marginBottom: 12, fontSize: 12, fontWeight: 700, fontFamily: "'Barlow',sans-serif", display: "flex", alignItems: "center", gap: 8 }}>
      <span>👀</span> Modo demostración — solo lectura. Las acciones que modifican datos están deshabilitadas.
    </div>
  );
}
