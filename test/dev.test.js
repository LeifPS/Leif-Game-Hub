import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/konten.js';
import { slug, youtubeId, httpsUrl } from '../src/dev.js';
import { makeD1 } from './helpers/d1.js';
import { schluessel } from './helpers/schluessel.js';

let uhr = 1_800_000_000_000;
const env = () => ({ DB: makeD1() });
async function call(e, methode, pfad, body, token) {
  const h = { 'content-type': 'application/json' };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await handle(new Request('https://dev.test' + pfad, { method: methode, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), e, uhr);
  return { status: r.status, j: await r.json() };
}
async function konto(e, name) {
  const r = await call(e, 'POST', '/api/registrieren', { name, key: await schluessel(name, 'geheim123'), geraet: 'x' });
  assert.equal(r.status, 200);
  return r.j.token;
}
const gut = (extra = {}) => ({
  titel: 'Idle Fisch', text: 'Fische fangen und bessere Angeln kaufen.', beschreibung: 'Langer Text.\nZweite Zeile.', tags: ['Idle', 'Angeln'],
  banner: 'https://img.example.com/banner.webp', website: 'https://idlefisch.leifps.workers.dev', repo: 'LeifPS/idlefisch',
  screenshots: ['https://img.example.com/1.png', 'https://img.example.com/2.png', 'https://img.example.com/3.png'],
  trailer: ['https://youtu.be/dQw4w9WgXcQ'], release: '', version: '0.1', mitentwickler: [], ...extra,
});

test('Hilfen: slug, YouTube, https', () => {
  assert.equal(slug('Idle Fisch!'), 'idle-fisch');
  assert.equal(slug('Käse & Öl'), 'kaese-oel');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ?t=3'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://example.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(httpsUrl('http://x.de'), null);
  assert.equal(httpsUrl('javascript:alert(1)'), null);
});

test('Einreichen, Eingaben prüfen, bearbeiten, löschen', async () => {
  const e = env(); const t = await konto(e, 'Anna'); const b = await konto(e, 'Ben');
  const r = await call(e, 'POST', '/api/dev/spiel', gut(), t);
  assert.equal(r.status, 200); assert.equal(r.j.id, 'idle-fisch');
  // zweites Spiel mit gleichem Titel bekommt eine andere Kennung
  assert.equal((await call(e, 'POST', '/api/dev/spiel', gut(), t)).j.id, 'idle-fisch-2');
  for (const [feld, wert, code] of [['titel', 'x', 'titel'], ['text', 'kurz', 'text'], ['tags', [], 'tags'], ['banner', 'http://a.de/b.png', 'banner'],
    ['website', 'https://hub.leifps.de', 'website_hub'], ['website', 'ftp://x', 'website'], ['screenshots', ['https://a.de/1.png'], 'screenshots'],
    ['trailer', ['https://a.de/v'], 'trailer'], ['repo', 'kein repo', 'repo'], ['release', 'kein datum', 'release'], ['mitentwickler', ['niemand'], 'mitentwickler_unbekannt']]) {
    const x = await call(e, 'POST', '/api/dev/spiel', gut({ [feld]: wert }), t);
    assert.equal(x.status, 400, feld); assert.equal(x.j.fehler, code, feld);
  }
  assert.equal((await call(e, 'POST', '/api/dev/spiel', gut({ screenshots: Array(21).fill('https://a.de/1.png') }), t)).j.fehler, 'screenshots');
  // Bearbeiten nur durch den Besitzer
  assert.equal((await call(e, 'PUT', '/api/dev/spiel/idle-fisch', gut({ titel: 'Idle Fisch 2' }), b)).status, 403);
  assert.equal((await call(e, 'PUT', '/api/dev/spiel/idle-fisch', gut({ titel: 'Idle Fisch 2' }), t)).status, 200);
  const m = (await call(e, 'GET', '/api/dev/meine', undefined, t)).j;
  assert.equal(m.spiele.find((s) => s.id === 'idle-fisch').name, 'Idle Fisch 2');
  assert.equal((await call(e, 'DELETE', '/api/dev/spiel/idle-fisch', undefined, b)).status, 403);
  assert.equal((await call(e, 'DELETE', '/api/dev/spiel/idle-fisch', undefined, t)).status, 200);
  assert.equal((await call(e, 'GET', '/api/dev/meine', undefined, t)).j.spiele.length, 1);
});

test('Veröffentlichungstermin: andere sehen vorher nur das Datum', async () => {
  const e = env(); const t = await konto(e, 'Anna'); const b = await konto(e, 'Ben');
  const spaeter = new Date(uhr + 5 * 86400000).toISOString();
  await call(e, 'POST', '/api/dev/spiel', gut({ release: spaeter }), t);
  const fremd = (await call(e, 'GET', '/api/dev/spiele', undefined, b)).j.spiele[0];
  assert.equal(fremd.teaser, true); assert.equal(fremd.url, undefined); assert.equal(fremd.screenshots, undefined); assert.equal(fremd.release, spaeter);
  const eigen = (await call(e, 'GET', '/api/dev/spiele', undefined, t)).j.spiele[0];
  assert.equal(eigen.url, 'https://idlefisch.leifps.workers.dev/');
  uhr += 6 * 86400000;
  const nun = (await call(e, 'GET', '/api/dev/spiele', undefined, b)).j.spiele[0];
  assert.equal(nun.teaser, undefined); assert.equal(nun.url, 'https://idlefisch.leifps.workers.dev/'); assert.deepEqual(nun.trailer_yt, ['dQw4w9WgXcQ']);
});

test('Mitentwickler müssen zustimmen', async () => {
  const e = env(); const t = await konto(e, 'Anna'); const b = await konto(e, 'Ben');
  await call(e, 'POST', '/api/dev/spiel', gut({ mitentwickler: ['ben'] }), t);
  assert.deepEqual((await call(e, 'GET', '/api/dev/spiele', undefined, b)).j.spiele[0].entwickler, ['Anna']);
  assert.equal((await call(e, 'GET', '/api/dev/meine', undefined, b)).j.spiele.length, 0);
  const ein = (await call(e, 'GET', '/api/dev/meine', undefined, b)).j.einladungen;
  assert.equal(ein.length, 1); assert.equal(ein[0].von, 'Anna');
  assert.equal((await call(e, 'GET', '/api/dev/spiel/idle-fisch/statistik', undefined, b)).status, 403);
  assert.equal((await call(e, 'POST', '/api/dev/spiel/idle-fisch/einladung', { an: true }, b)).status, 200);
  assert.deepEqual((await call(e, 'GET', '/api/dev/spiele', undefined, b)).j.spiele[0].entwickler, ['Anna', 'Ben']);
  assert.equal((await call(e, 'GET', '/api/dev/spiel/idle-fisch/statistik', undefined, b)).status, 200);
  assert.equal((await call(e, 'PUT', '/api/dev/spiel/idle-fisch', gut(), b)).status, 403, 'Mitentwickler bearbeiten nicht');
  assert.equal((await call(e, 'POST', '/api/dev/spiel/idle-fisch/austreten', {}, b)).status, 200);
  assert.deepEqual((await call(e, 'GET', '/api/dev/spiele', undefined, t)).j.spiele[0].entwickler, ['Anna']);
  // Entwickler-Konten erscheinen unter /api/entwickler
  const en = (await call(e, 'GET', '/api/entwickler', undefined, t)).j.entwickler.map((x) => x.name);
  assert.ok(en.includes('Anna'));
});

test('Statistik: nur Summen, Tagesverlauf, Bewertung, Favoriten', async () => {
  const e = env(); const t = await konto(e, 'Anna'); const b = await konto(e, 'Ben'); const c = await konto(e, 'Cleo');
  await call(e, 'POST', '/api/dev/spiel', gut(), t);
  // Ben spielt (Herzschläge im Abstand von 45 s, mehr als 15 Minuten), Cleo kurz
  for (let i = 0; i < 25; i++) { await call(e, 'POST', '/api/praesenz', { spiel: 'idle-fisch' }, b); uhr += 45000; }
  await call(e, 'POST', '/api/praesenz', { spiel: 'idle-fisch' }, c); uhr += 45000; await call(e, 'POST', '/api/praesenz', { spiel: 'idle-fisch' }, c);
  uhr += 86400000;
  await call(e, 'POST', '/api/praesenz', { spiel: 'idle-fisch' }, b); uhr += 45000; await call(e, 'POST', '/api/praesenz', { spiel: 'idle-fisch' }, b);
  assert.equal((await call(e, 'POST', '/api/bewertung/idle-fisch', { sterne: 4 }, b)).status, 200, 'Bewerten eines eingereichten Spiels klappt');
  await call(e, 'POST', '/api/favoriten', { spiel: 'idle-fisch', an: true }, c);
  const st = (await call(e, 'GET', '/api/dev/spiel/idle-fisch/statistik', undefined, t)).j;
  assert.equal(st.spieler, 2); assert.equal(st.favoriten, 1); assert.equal(st.bewertung.anzahl, 1); assert.equal(st.bewertung.schnitt, 4);
  assert.equal(st.ueber15, 1); assert.equal(st.wiederkehrer, 1);
  assert.ok(st.spielzeit > 1000);
  assert.equal(st.tage.length, 30);
  assert.equal(st.tage.filter((d) => d.spieler > 0).length, 2);
  assert.equal(JSON.stringify(st).includes('Ben'), false, 'keine Namen in der Statistik');
  assert.equal((await call(e, 'GET', '/api/dev/spiel/idle-fisch/statistik', undefined, b)).status, 403);
});

test('Website prüfen (Hinweise)', async () => {
  const e = env(); const t = await konto(e, 'Anna');
  const seiten = {
    'https://ok.example.com/': ['<html><head><meta name="viewport" content="width=device-width"><script src="lgh-vorlade.js"></script></head><script src="lgh-modul.js"></script></html>', {}],
    'https://ok.example.com/lgh-vorlade.js': ['if(x){send({lgh:"ton-bereit"})}', {}],
    'https://zu.example.com/': ['<html></html>', { 'x-frame-options': 'DENY' }],
  };
  e.FETCH = async (u) => { const s = seiten[u]; if (!s) return new Response('', { status: 404 }); return new Response(s[0], { status: 200, headers: s[1] }); };
  const p = (await call(e, 'POST', '/api/dev/pruefen', { website: 'https://ok.example.com/' }, t)).j.pruefungen;
  assert.ok(p.every((x) => x.ok), JSON.stringify(p));
  const q = (await call(e, 'POST', '/api/dev/pruefen', { website: 'https://zu.example.com/' }, t)).j.pruefungen;
  assert.equal(q.find((x) => x.id === 'einbettbar').ok, false);
  assert.equal(q.find((x) => x.id === 'vorlade').ok, false);
  const n = (await call(e, 'POST', '/api/dev/pruefen', { website: 'https://nix.example.com/' }, t)).j.pruefungen;
  assert.equal(n[0].ok, false);
  assert.equal((await call(e, 'POST', '/api/dev/pruefen', { website: 'http://x.de' }, t)).status, 400);
});

test('Konto löschen entfernt eigene Spiele und Teilnahmen', async () => {
  const e = env(); const t = await konto(e, 'Anna'); const b = await konto(e, 'Ben');
  await call(e, 'POST', '/api/dev/spiel', gut({ mitentwickler: ['ben'] }), t);
  await call(e, 'POST', '/api/dev/spiel/idle-fisch/einladung', { an: true }, b);
  assert.equal((await call(e, 'POST', '/api/loeschen', { key: await schluessel('Anna', 'geheim123') }, t)).status, 200);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM dev_games').get().n, 0);
  assert.equal(e.DB.raw.prepare('SELECT COUNT(*) AS n FROM dev_co').get().n, 0);
  assert.equal((await call(e, 'GET', '/api/dev/spiele', undefined, b)).j.spiele.length, 0);
});

test('Anfragen ohne Anmeldung und Begrenzung auf 10 Spiele', async () => {
  const e = env();
  assert.equal((await call(e, 'GET', '/api/dev/spiele')).status, 401);
  const t = await konto(e, 'Anna');
  for (let i = 0; i < 10; i++) assert.equal((await call(e, 'POST', '/api/dev/spiel', gut({ titel: 'Spiel ' + i }), t)).status, 200);
  assert.equal((await call(e, 'POST', '/api/dev/spiel', gut({ titel: 'Elftes' }), t)).j.fehler, 'zu_viele_spiele');
});
