// Minimal SW for PWA installability of the driver portal ONLY.
// It intentionally caches nothing: background geolocation is impossible in a SW,
// so this exists purely to satisfy the browser's "installable" fetch-handler check.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* pass-through: do not intercept, do not cache */
});
