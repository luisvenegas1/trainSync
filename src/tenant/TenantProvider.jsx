import { useState, useEffect } from "react";
import { resolveTenantSlug } from "./resolveTenant";
import { loadTenantBySlug } from "./loadTenant";
import { JOHEL_BRANDING, NEUTRAL_BRANDING } from "../branding/branding";
import { BrandingContext } from "../branding/BrandingContext";
import { DocumentBranding } from "../branding/DocumentBranding";
import { TenantContext } from "./tenantContext";
import { isPlatformPath } from "../platform/platformRoute";
import { isLegalPath } from "../legal/legalRoute";

// El multi-tenant se activa con VITE_MULTITENANT=on (tras migraciones + Auth).
// Mientras esté apagado, la app se comporta EXACTAMENTE como hoy (Johel legacy).
const MULTITENANT = String(import.meta.env.VITE_MULTITENANT || "").toLowerCase() === "on";

export function TenantProvider({ children }) {
  if (!MULTITENANT) {
    // Legacy: sin gating, branding Johel.
    return (
      <TenantContext.Provider value={{ mode: "legacy", slug: "joheltraining", org: null, branding: JOHEL_BRANDING }}>
        <BrandingContext.Provider value={JOHEL_BRANDING}><DocumentBranding branding={JOHEL_BRANDING} />{children}</BrandingContext.Provider>
      </TenantContext.Provider>
    );
  }
  return <MultiTenant>{children}</MultiTenant>;
}

function MultiTenant({ children }) {
  // El Panel de Plataforma (/platform) y las páginas legales (/terminos,
  // /privacidad) NO pertenecen a ningún tenant: no se resuelve organización ni se
  // bloquea. (El panel valida su acceso aparte contra platform_admins.)
  const onPlatform = isPlatformPath(window.location.pathname) || isLegalPath(window.location.pathname);
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    if (onPlatform) return; // ruta del panel: sin resolución de tenant
    let alive = true;
    (async () => {
      await Promise.resolve(); // asegura que los setState ocurran fuera del render-effect
      const slug = resolveTenantSlug(
        { hostname: window.location.hostname, pathname: window.location.pathname },
        { defaultSlug: import.meta.env.VITE_DEFAULT_TENANT_SLUG }
      );
      if (!slug) {
        // Red de seguridad: si la PWA (o un acceso directo) abrió en la RAÍZ sin
        // tenant, pero ya usamos una organización antes, redirigimos a ella. Evita
        // "Organización no encontrada" cuando el ícono instalado quedó apuntando a "/".
        let last = null;
        try { last = localStorage.getItem("ts_last_tenant"); } catch { /* ignore */ }
        if (last) { window.location.replace("/" + last); return; }
        if (alive) setState({ loading: false, status: "not_found", slug: null });
        return;
      }
      try {
        const r = await loadTenantBySlug(slug);
        // Recordar el último tenant válido para la red de seguridad de arriba.
        if (r.status === "ok" && r.slug) { try { localStorage.setItem("ts_last_tenant", r.slug); } catch { /* ignore */ } }
        if (alive) setState({ loading: false, ...r });
      } catch {
        if (alive) setState({ loading: false, status: "error", slug });
      }
    })();
    return () => {
      alive = false;
    };
  }, [onPlatform]);

  // Ruta del panel: renderiza los hijos (la ruta /platform monta PlatformApp) con
  // branding neutro, sin gating de tenant.
  if (onPlatform) {
    return (
      <TenantContext.Provider value={{ mode: "platform", slug: null, org: null, branding: NEUTRAL_BRANDING }}>
        <BrandingContext.Provider value={NEUTRAL_BRANDING}><DocumentBranding branding={{ displayName: "Tito Apps · Plataforma" }} />{children}</BrandingContext.Provider>
      </TenantContext.Provider>
    );
  }

  if (state.loading) return <TenantScreen title="Cargando…" />;
  if (state.status !== "ok") {
    return (
      <TenantScreen
        title={state.status === "suspended" ? "Organización suspendida" : "Organización no encontrada"}
        detail={
          state.status === "suspended"
            ? "Esta organización está temporalmente inactiva."
            : `No existe una organización para “${state.slug || window.location.hostname}”.`
        }
      />
    );
  }

  const value = { mode: "tenant", slug: state.slug, org: state.org, branding: state.branding, featureOverrides: state.settings?.feature_overrides || {}, gamification: state.settings?.gamification || {} };
  return (
    <TenantContext.Provider value={value}>
      <BrandingContext.Provider value={state.branding}><DocumentBranding branding={state.branding} />{children}</BrandingContext.Provider>
    </TenantContext.Provider>
  );
}

function TenantScreen({ title, detail }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, background: "#0B1F4B", color: "#fff", padding: 24, textAlign: "center", fontFamily: "'Barlow',sans-serif" }}>
      <div style={{ fontSize: 34 }}>🏋️</div>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
      {detail && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", maxWidth: 360 }}>{detail}</div>}
    </div>
  );
}
