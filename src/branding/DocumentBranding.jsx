import { useEffect } from "react";

// Ajusta en runtime la identidad de la app por tenant:
//  - FAVICON (pestaña del navegador)
//  - apple-touch-icon + apple-mobile-web-app-title (instalación PWA en iOS)
//  - manifest dinámico (nombre + íconos al instalar en Android/Chrome)
//  - theme-color y variables de color de marca
// Cada tenant muestra SU propio logo/nombre, nunca el genérico de Tito.
//
// Clave del arreglo: se ELIMINAN todos los <link> de ícono estáticos (los de Tito
// que vienen en index.html) y se agregan nuevos con el tipo/tamaño CORRECTO, para
// que el navegador no descarte el ícono del tenant y caiga al estático.
export function DocumentBranding({ branding }) {
  useEffect(() => {
    if (!branding) return;
    const name = branding.displayName || "";
    const rawIcon = branding.faviconUrl || branding.logoUrl || null;

    if (name) { document.title = name; setMeta("apple-mobile-web-app-title", name); }
    if (branding.secondaryColor) setMeta("theme-color", branding.secondaryColor);

    const root = document.documentElement;
    if (branding.primaryColor) root.style.setProperty("--brand-primary", branding.primaryColor);
    if (branding.secondaryColor) root.style.setProperty("--brand-secondary", branding.secondaryColor);

    if (!rawIcon) return;
    const icon = absolute(rawIcon);
    const type = mimeOf(icon);

    // 1) Favicon + apple-touch: borrar TODOS los existentes y poner los del tenant.
    clearLinks(["icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"]);
    addLink("icon", icon, type);              // sin sizes → sirve para cualquier tamaño
    addLink("apple-touch-icon", icon);
    addLink("apple-touch-icon-precomposed", icon);

    // 2) Manifest: se calcula el tamaño REAL del ícono para que Chrome lo acepte al
    //    instalar (declarar un tamaño equivocado hace que lo rechace y use el de Tito).
    const img = new Image();
    img.onload = () => injectManifest({ name, icon, type, w: img.naturalWidth || 512, h: img.naturalHeight || 512, branding });
    img.onerror = () => injectManifest({ name, icon, type, w: 512, h: 512, branding });
    img.src = icon;
  }, [branding]);

  return null;
}

function absolute(url) {
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  try { return new URL(url, window.location.origin).href; } catch { return url; }
}

function mimeOf(url) {
  const m = /^data:([^;]+)/i.exec(url);
  if (m) return m[1];
  const ext = (url.split("?")[0].split(".").pop() || "").toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "webp") return "image/webp";
  return "image/png";
}

function clearLinks(rels) {
  rels.forEach((rel) => {
    document.querySelectorAll(`link[rel="${rel}"]`).forEach((el) => el.parentNode && el.parentNode.removeChild(el));
  });
}

function addLink(rel, href, type) {
  const el = document.createElement("link");
  el.setAttribute("rel", rel);
  if (type) el.setAttribute("type", type);
  el.setAttribute("href", href);
  document.head.appendChild(el);
}

function setMeta(name, content) {
  let el = document.querySelector(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

// Genera un manifest por tenant como Blob y lo enlaza. start_url/scope absolutos
// (un blob no resuelve rutas relativas contra la página). Íconos con tamaño y tipo
// reales para que el navegador los use al "Instalar app".
let lastBlobUrl = null;
function injectManifest({ name, icon, type, w, h, branding }) {
  try {
    const origin = window.location.origin;
    const size = `${w}x${h}`;
    // Base del tenant según la URL actual: en tenants por RUTA (trainingapp.../joheltraining)
    // el ícono instalado debe abrir /joheltraining, no la raíz. En tenants por
    // subdominio la ruta ya es "/" y queda igual.
    const segs = window.location.pathname.split("/").filter(Boolean);
    const base = segs.length ? `/${segs[0]}/` : "/";
    const manifest = {
      id: origin + base,
      name: name || "Entrenamiento",
      short_name: (name || "App").slice(0, 18),
      description: "Tu plataforma de entrenamiento",
      start_url: origin + base,
      scope: origin + base,
      display: "standalone",
      background_color: branding?.secondaryColor || "#0B1F4B",
      theme_color: branding?.secondaryColor || "#0B1F4B",
      orientation: "portrait",
      icons: [
        { src: icon, sizes: size, type, purpose: "any" },
        { src: icon, sizes: size, type, purpose: "maskable" },
      ],
    };
    const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
    const blobUrl = URL.createObjectURL(blob);
    setLinkSingle("manifest", blobUrl);
    if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
    lastBlobUrl = blobUrl;
  } catch {
    /* si algo falla, se queda el manifest estático */
  }
}

// Para el manifest sí queremos UN solo link (reutilizar el existente).
function setLinkSingle(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}
