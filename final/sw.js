// WERACLE LAB Service Worker
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
self.addEventListener('fetch', (e) => {
  // Pass through fetch to enable PWA installability
  e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});
