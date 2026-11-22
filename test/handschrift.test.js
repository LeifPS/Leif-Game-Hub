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

import { makeD1 } from './helpers/d1.js';
test('STools-Abgleich: Stücke hochladen, festschreiben, wieder holen; alte Fassung verschwindet', async () => {
  const env2 = { ...env, DB: makeD1() }, B = 'https://st.leifps.de/api/sync/abcd1234';
  const call = (u, method = 'GET', body) => handschriftWeiche(new Request(B + u, { method, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env2);
  assert.equal((await call('')).status, 404);
  assert.equal((await call('/v00001/0', 'PUT', 'QUJD')).status, 200);
  assert.equal((await call('/v00001/1', 'PUT', 'REVG')).status, 200);
  assert.equal((await call('/commit', 'POST', { v: 'v00001', parts: 3, updated: 5 })).status, 409, 'fehlendes Stück');
  assert.equal((await call('/commit', 'POST', { v: 'v00001', parts: 2, updated: 5 })).status, 200);
  assert.deepEqual(await (await call('')).json(), { v: 'v00001', parts: 2, updated: 5 });
  assert.equal(await (await call('/v00001/1')).text(), 'REVG');
  await call('/v00002/0', 'PUT', 'WFla'); await call('/commit', 'POST', { v: 'v00002', parts: 1, updated: 9 });
  assert.equal((await call('/v00001/0')).status, 404, 'alte Fassung gelöscht');
  assert.equal((await call('/v00002/0', 'PUT', '<script>')).status, 413, 'nur Base64');
  assert.equal((await handschriftWeiche(new Request('https://st.leifps.de/api/sync/../x'), env2)).status, 404);
  assert.equal((await handschriftWeiche(new Request('https://st.leifps.de/api/ich'), env2)).status, 404, 'sonst keine API');
});
test('STools-Titel: ohne KI-Anbindung freundliche Fehlermeldung, mit KI kurzer Titel', async () => {
  const req = (e) => handschriftWeiche(new Request('https://st.leifps.de/api/titel', { method: 'POST', body: JSON.stringify({ text: 'Die pq-Formel löst quadratische Gleichungen' }) }), e);
  assert.equal((await req({ ...env })).status, 503);
  const e2 = { ...env, DB: makeD1(), AI: { run: async () => ({ response: '„Die pq-Formel.“\nmehr' }) } };
  assert.deepEqual(await (await req(e2)).json(), { titel: 'Die pq-Formel' });
});

test('st.leifps.de/hdf: Format-Beschreibung als reiner Text (für KIs per Link), ohne Auftrag', async () => {
  for (const u of ['https://st.leifps.de/hdf', 'https://st.leifps.de/hdf.txt', 'https://st.leifps.de/ki-hdf', 'https://handschrift.leifps.de/HDF']) {
    const a = await handschriftWeiche(r(u), env);
    assert.equal(a.status, 200, u);
    assert.match(a.headers.get('content-type'), /^text\/plain; charset=utf-8/);
    const t = await a.text();
    assert.match(t, /^# HDF/);
    assert.doesNotMatch(t, /Antworte NUR|Qualitätsregeln|Erstelle für mich/);
  }
  assert.equal(handschriftWeiche(r('https://hub.leifps.de/hdf'), env), null);   // nur auf der App-Adresse
});
