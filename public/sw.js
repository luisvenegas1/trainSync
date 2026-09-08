// Service worker de la PWA.
// REGLA CLAVE: solo cachea archivos ESTÁTICOS del MISMO origen (HTML/JS/CSS/imágenes).
// NUNCA cachea llamadas a Supabase ni a ninguna API/tercero, por dos motivos:
//   1) los datos deben venir siempre frescos (rutinas, ejercicios, etc.),
//   2) evitar que en un dispositivo compartido se sirva a un usuario la respuesta
//      cacheada de otro (fuga de datos).
//
// ACTUALIZACIÓN AUTOMÁTICA: skipWaiting + clients.claim hacen que una versión nueva
// tome control apenas se despliega; el index.html detecta el cambio y recarga solo,
// así el usuario nunca queda viendo una versión vieja (sin limpiar caché a mano).
const CACHE_NAME = "trainsync-v3"; // bump: al cambiar el nombre, activate() borra los caches viejos (incluye jh-training-v2)

const ASSETS_TO_CACHE = ["/", "/index.html"];

// Install: cachea el shell y activa de una (no espera a que cierren pestañas).
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

// Activate: borra caches viejos y toma control de las pestañas abiertas.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Permite forzar la activación inmediata desde la página si hiciera falta.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// Fetch: solo assets del MISMO origen. Supabase/APIs/terceros van directo a la red.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Todo lo que no sea del propio dominio (Supabase, storage, etc.) NO pasa por el
  // service worker: se resuelve normal contra la red, siempre fresco y sin cachear.
  if (url.origin !== self.location.origin) return;

  // Network-first para los assets propios: intenta red (siempre lo más nuevo),
  // cachea una copia; si no hay red, sirve del caché (y index.html para navegación).
  event.respondWith(
    fetch(req)
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, responseClone));
        return response;
      })
      .catch(() =>
        caches.match(req).then((cached) => {
          if (cached) return cached;
          if (req.mode === "navigate") return caches.match("/index.html");
          return undefined;
        })
      )
  );
});
