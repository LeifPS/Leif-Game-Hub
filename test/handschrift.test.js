import test from 'node:test';
import assert from 'node:assert/strict';
import { handschriftWeiche } from '../src/handschrift.js';

// Falsche Asset-Ablage: gibt den angefragten Pfad zurück, damit man sieht, was der Worker geholt hat.
const env = { ASSETS: { fetch: async (req) => new Response('asset:' + new URL(req.url).pathname, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=60' } }) } };
const r = (url, method = 'GET') => new Request(url, { method });

test('Fremde Adressen: kein Eingriff, außer /handschrift/... gibt es dort nicht', async () => {
  assert.equal(handschriftWeiche(r('https://hub.leifps.de/'), env), null);
  assert.equal(handschriftWeiche(r('https://hub.leifps.de/games.json'), env), null);
  assert.equal(handschriftWeiche(r('https://leifps.de/api/ich'), env), null);
  for (const u of ['https://hub.leifps.de/handschrift', 'https://hub.leifps.de/handschrift/', 'https://hub.leifps.de/handschrift/index.html',
    'https://dev.leifps.de/handschrift/app.js', 'https://leif-game-hub.leifps.workers.dev/handschrift/sw.js']) {
    const a = await handschriftWeiche(r(u), env);
    assert.equal(a.status, 404, u);
    assert.match(a.headers.get('x-robots-tag'), /noindex/);
  }
});

test('handschrift.leifps.de: Startseite und Dateien kommen aus public/handschrift/', async () => {
  const s = await handschriftWeiche(r('https://handschrift.leifps.de/'), env);
  assert.equal(await s.text(), 'asset:/handschrift/');
  const i = await handschriftWeiche(r('https://handschrift.leifps.de/index.html'), env);
  assert.equal(await i.text(), 'asset:/handschrift/');
  const j = await handschriftWeiche(r('https://handschrift.leifps.de/handschrift/js/main.js'), env);
  assert.equal(await j.text(), 'asset:/handschrift/js/main.js');
  const k = await handschriftWeiche(r('https://HANDSCHRIFT.leifps.de/sw.js'), env);
  assert.equal(await k.text(), 'asset:/handschrift/sw.js');
});

test('handschrift.leifps.de: Suchmaschinen ausgesperrt, Service Worker darf die ganze Adresse abdecken', async () => {
  const s = await handschriftWeiche(r('https://handschrift.leifps.de/handschrift/sw.js'), env);
  assert.equal(s.headers.get('service-worker-allowed'), '/');
  assert.equal(s.headers.get('cache-control'), 'no-cache');
  assert.match(s.headers.get('x-robots-tag'), /noindex/);
  const d = await handschriftWeiche(r('https://handschrift.leifps.de/handschrift/data/leif.json'), env);
  assert.equal(d.headers.get('cache-control'), 'public, max-age=60');   // Daten dürfen zwischengespeichert werden
  assert.equal(d.headers.get('service-worker-allowed'), null);
});

test('handschrift.leifps.de: kein Konto-Server, nur Lesen', async () => {
  assert.equal((await handschriftWeiche(r('https://handschrift.leifps.de/api/ich'), env)).status, 404);
  assert.equal((await handschriftWeiche(r('https://handschrift.leifps.de/api'), env)).status, 404);
  assert.equal((await handschriftWeiche(r('https://handschrift.leifps.de/', 'POST'), env)).status, 405);
  assert.equal((await handschriftWeiche(r('https://handschrift.leifps.de/'), {})).status, 404);
});
