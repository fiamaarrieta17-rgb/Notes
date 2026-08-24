const CACHE_NAME = 'cuaderno-v5';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cacheamos cada archivo por separado: si uno falla (404),
      // los demás igual se guardan y la instalación no se rompe entera.
      return Promise.all(
        CORE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('No se pudo cachear', url, err);
          })
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // El documento principal (navegación, y el index.html si algo lo pide
  // directo) va "network-first": intentamos traer la última versión de la
  // red primero, y solo si no hay conexión caemos al cache. Antes esto era
  // "stale-while-revalidate" (cache primero, red de fondo), por lo que una
  // mejora publicada tardaba dos cargas completas en llegar a verse. El
  // resto de los assets (íconos, manifest) siguen sirviéndose desde cache
  // al toque, con la red actualizando el cache de fondo, porque ahí la
  // velocidad importa más que estar siempre al día.
  const isDocument = req.mode === 'navigate' ||
    (req.destination === 'document') ||
    new URL(req.url).pathname.endsWith('/index.html');

  if (isDocument) {
    event.respondWith(
      fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((networkRes) => {
          if (networkRes && networkRes.ok && new URL(req.url).origin === self.location.origin) {
            const clone = networkRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkRes;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
