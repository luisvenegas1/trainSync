// Manifest de PWA dinámico por tenant (Vercel Serverless Function).
// iOS NO usa manifests generados en el navegador (blob:), pero SÍ usa uno servido
// desde una URL real. DocumentBranding apunta <link rel="manifest"> a
// /api/manifest?... con los datos del tenant, y esta función devuelve el manifest
// correcto (nombre, íconos, start_url del tenant) para que al instalar en el
// homescreen se vea el logo y el nombre propios, y abra la página del tenant.
export default function handler(req, res) {
  const q = req.query || {};
  const name = String(q.name || "App").slice(0, 60);
  const icon = typeof q.icon === "string" ? q.icon : "";
  const color = typeof q.color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(q.color) ? q.color : "#0B1F4B";
  const size = typeof q.size === "string" && /^\d+x\d+$/.test(q.size) ? q.size : "512x512";
  const type = typeof q.type === "string" && q.type.startsWith("image/") ? q.type : "image/png";
  // start: ruta del tenant (ej. "/joheltraining/"). Se sanea a un path que empiece con "/".
  let start = typeof q.start === "string" && q.start.startsWith("/") ? q.start : "/";
  if (!start.endsWith("/")) start += "/";

  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers.host;
  const origin = `${proto}://${host}`;
  const startUrl = origin + start;

  // Solo se aceptan íconos por URL http(s) (iOS no toma data: URLs bien). Si no hay,
  // el manifest va sin íconos y el navegador cae al apple-touch-icon.
  const httpIcon = /^https?:\/\//i.test(icon) ? icon : "";

  const manifest = {
    id: startUrl,
    name,
    short_name: name.slice(0, 18),
    description: "Tu plataforma de entrenamiento",
    start_url: startUrl,
    scope: startUrl,
    display: "standalone",
    background_color: color,
    theme_color: color,
    orientation: "portrait",
    icons: httpIcon
      ? [
          { src: httpIcon, sizes: size, type, purpose: "any" },
          { src: httpIcon, sizes: size, type, purpose: "maskable" },
        ]
      : [],
  };

  res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).send(JSON.stringify(manifest));
}
