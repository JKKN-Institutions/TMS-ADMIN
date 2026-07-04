// JKKN TMS — unified service worker (all four portals, scope "/").
// Hand-rolled (not Serwist): Next 16 + Turbopack + CommonJS config make the
// webpack/ESM Serwist plugin an integration risk, and a plain static SW in
// public/ needs zero build-config change. Delivers an offline APP SHELL only —
// never data.
//
// Bump VERSION to invalidate all caches on the next activate.
const VERSION = 'v1';
const CACHE = `tms-shell-${VERSION}`;

// Precached so the offline fallback + core icons work on the very first offline hit.
const PRECACHE_URLS = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('tms-shell-') && k !== CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// Lets the update flow (PwaProvider) activate a waiting SW immediately.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Never intercept non-GET — mutations must always hit the network.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Cross-origin (Supabase, external) → let the browser handle it (network only).
  if (url.origin !== self.location.origin) return;

  // Data + auth surfaces carry per-request-authorized content — NEVER cache them.
  // (Leaving them un-intercepted = plain network.)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

  // Page navigations → NetworkFirst, fall back to cached page, then offline shell.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // Hashed build assets + icons → StaleWhileRevalidate (fast, self-healing).
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Anything else same-origin → default network.
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    const offline = await cache.match('/offline.html');
    return offline || Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

// ── Web push (Phase 2) ───────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'JKKN TMS', body: event.data.text() };
  }
  const title = data.title || 'JKKN TMS';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: data.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || undefined,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
