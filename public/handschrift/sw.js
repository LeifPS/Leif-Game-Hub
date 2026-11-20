// Service Worker: macht die App offline nutzbar (alles wird beim ersten Besuch auf das Gerät geladen)
const VER = 'hs-d506b21c5c';
const CORE = [
 "/",
 "/app.css",
 "/data/LIZENZ-always-forever.txt",
 "/data/leif.json",
 "/icons/apple-touch-icon.png",
 "/icons/favicon-32.png",
 "/icons/icon-192.png",
 "/icons/icon-512.png",
 "/icons/icon-maskable-512.png",
 "/icons/icon-maskable.svg",
 "/icons/icon.svg",
 "/js/app.js",
 "/js/chardesc.js",
 "/js/docs.js",
 "/js/draw.js",
 "/js/editor.js",
 "/js/exporter.js",
 "/js/extra.js",
 "/js/fonts.js",
 "/js/gn.js",
 "/js/gnink.js",
 "/js/gnpap.js",
 "/js/gntpl.js",
 "/js/gntpl2.js",
 "/js/imgops.js",
 "/js/more.js",
 "/js/packs.js",
 "/js/pdfin.js",
 "/js/pdfw.js",
 "/js/reader.js",
 "/js/render.js",
 "/js/session.js",
 "/js/sheet.js",
 "/js/store.js",
 "/js/ui.js",
 "/js/util.js",
 "/js/vec.js",
 "/js/wizard.js",
 "/manifest.webmanifest",
 "/vendor/jsqr.js",
 "/vendor/qrcode.js"
];
const OPT = ["/vendor/pdf.min.mjs", "/vendor/pdf.worker.min.mjs"];
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    await c.addAll(CORE);
    for (const u of OPT) { try { await c.add(u); } catch (_) {} }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('hs-') && k !== VER) await caches.delete(k);
    await self.clients.claim();
    for (const cl of await self.clients.matchAll()) cl.postMessage({ type: 'ready' });
  })());
});
self.addEventListener('message', async (e) => {
  if (!e.data || e.data.type !== 'status') return;
  const c = await caches.open(VER), have = await c.match(CORE[0], { ignoreSearch: true });
  if (have && e.source) e.source.postMessage({ type: 'ready' });
});
self.addEventListener('fetch', (e) => {
  const r = e.request; if (r.method !== 'GET') return;
  const u = new URL(r.url); if (u.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(VER);
    const hit = await c.match(r, { ignoreSearch: true }) || (r.mode === 'navigate' ? await c.match('/', { ignoreSearch: true }) : null);
    if (hit) return hit;
    try { return await fetch(r); } catch (err) { return new Response('Offline', { status: 503, statusText: 'Offline' }); }
  })());
});
