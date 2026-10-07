// Service worker: deixa a app abrirse sen cobertura e garda os mosaicos do mapa que vas vendo.
const SHELL = 'vd-shell-v8', TILES = 'vd-tiles-v3', FONTS = 'vd-fonts-v1';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const MAX_TILES = 900;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => ![SHELL, TILES, FONTS].includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
async function cacheFirst(req, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  // Pedimos o mosaico con CORS para ver o estado real e non gardar erros na cache.
  try {
    const res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
    if (res.ok) { cache.put(req, res.clone()); if (max) trim(cache, max); }
    return res;
  } catch (e) {
    return fetch(req); // sen CORS: móstrase igual, pero sen gardar
  }
}
async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(fetch(req).then(res => { const c = res.clone(); caches.open(SHELL).then(ca => ca.put('./index.html', c)); return res; }).catch(() => caches.match('./index.html')));
    } else {
      e.respondWith(staleWhileRevalidate(req, SHELL));
    }
  } else if (url.hostname === 'www.ign.es' || url.hostname.endsWith('.basemaps.cartocdn.com')) {
    e.respondWith(cacheFirst(req, TILES, MAX_TILES).catch(() => new Response('', { status: 504 })));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(staleWhileRevalidate(req, FONTS));
  }
});
