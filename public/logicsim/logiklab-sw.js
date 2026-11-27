// LogikLab offline: hält die App im Zwischenspeicher. Antwortet sofort aus dem Speicher und lädt im Hintergrund die neueste Fassung
// (wirkt beim nächsten Start). Gilt nur für den eigenen Bereich (logic.leifps.de/ bzw. /logicsim/), nie für den Hub.
const V = 'logiklab-v6';
const FILES = ['', 'logiklab.webmanifest', 'logiklab-icon.svg', 'logiklab-icon-192.png', 'logiklab-icon-512.png', 'logiklab-maskable-512.png'];
const base = () => self.registration.scope;
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(FILES.map((f) => base() + f))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('logiklab-') && k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url), b = base();
  let key = null;
  if (r.mode === 'navigate' && u.href.startsWith(b)) key = b;
  else if (u.href.startsWith(b) && FILES.includes(u.href.slice(b.length).split('?')[0])) key = b + u.href.slice(b.length).split('?')[0];
  if (!key) return;
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(key);
    const net = fetch(key, { cache: 'no-cache' }).then((res) => { if (res.ok && !res.redirected) c.put(key, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('LogikLab ist gerade offline und noch nicht gespeichert.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }));
});
