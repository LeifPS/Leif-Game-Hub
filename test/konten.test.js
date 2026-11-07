import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, VERSIONEN, MAX_BYTES } from '../src/konten.js';
import { makeD1 } from './helpers/d1.js';

// Schlüssel wie im Browser: PBKDF2(Passwort, "lgh1:" + kleingeschriebener Name), SHA-256, 256 Bit
export async function schluessel(name, pw, iter = 1000) { // im Test wenige Runden, im Browser 210000
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: iter, salt: new TextEncoder().encode('lgh1:' + name.normalize('NFC').toLowerCase()) }, k, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function umgebung() { return { DB: makeD1() }; }
let uhr = 1_800_000_000_000;
async function call(env, methode, pfad, body, token, extra = {}) {
  const h = { 'content-type': 'application/json', ...extra };
  if (token) h.authorization = 'Bearer ' + token;
  const r = await handle(new Request('https://hub.test' + pfad, { method: methode, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env, uhr);
  return { status: r.status, j: await r.json() };
}
async function neuesKonto(env, name = 'Leif', pw = 'geheim123') {
  const r = await call(env, 'POST', '/api/registrieren', { name, key: await schluessel(name, pw), geraet: 'iPhone' });
  assert.equal(r.status, 200, JSON.stringify(r.j));
  return r.j.token;
}

test('Registrieren, Abmelden, Anmelden', async () => {
  const env = umgebung();
  const t = await neuesKonto(env);
  assert.deepEqual((await call(env, 'GET', '/api/ich', undefined, t)).j, { name: 'Leif' });
  assert.equal((await call(env, 'POST', '/api/abmelden', {}, t)).status, 200);
  assert.equal((await call(env, 'GET', '/api/ich', undefined, t)).status, 401);
  // Name ohne Beachtung der Groß- und Kleinschreibung, falsches Passwort
  const falsch = await call(env, 'POST', '/api/anmelden', { name: 'leif', key: await schluessel('leif', 'falsch') });
  assert.equal(falsch.status, 401);
  const ok = await call(env, 'POST', '/api/anmelden', { name: 'LEIF', key: await schluessel('LEIF', 'geheim123') });
  assert.equal(ok.status, 200);
  assert.equal(ok.j.name, 'Leif');
});

test('Namen: vergeben, ungültig; Schlüssel ungültig', async () => {
  const env = umgebung();
  await neuesKonto(env, 'Leif');
  const k = await schluessel('leif', 'x');
  assert.equal((await call(env, 'POST', '/api/registrieren', { name: 'leif', key: k })).j.fehler, 'name_vergeben');
  assert.equal((await call(env, 'POST', '/api/registrieren', { name: 'ab', key: k })).j.fehler, 'name');
  assert.equal((await call(env, 'POST', '/api/registrieren', { name: 'mit leerzeichen', key: k })).j.fehler, 'name');
  assert.equal((await call(env, 'POST', '/api/registrieren', { name: 'Anna', key: 'kurz' })).j.fehler, 'schluessel');
});

test('Zu viele falsche Anmeldungen werden gebremst, richtige Anmeldung hebt es nach der Wartezeit auf', async () => {
  const env = umgebung();
  await neuesKonto(env);
  const falsch = await schluessel('Leif', 'nein'), richtig = await schluessel('Leif', 'geheim123');
  for (let i = 0; i < 4; i++) assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Leif', key: falsch })).status, 401);
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Leif', key: falsch })).status, 401); // fünfter Fehlversuch löst die Sperre aus
  const g = await call(env, 'POST', '/api/anmelden', { name: 'Leif', key: richtig });
  assert.equal(g.status, 429);
  assert.ok(g.j.warte > 0 && g.j.warte <= 30);
  uhr += 31_000;
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Leif', key: richtig })).status, 200);
});

test('Unbekannter Name liefert dieselbe Antwort wie falsches Passwort', async () => {
  const env = umgebung();
  const r = await call(env, 'POST', '/api/anmelden', { name: 'Niemand', key: await schluessel('Niemand', 'x') });
  assert.equal(r.status, 401);
  assert.equal(r.j.fehler, 'login');
});

test('Spielstand: speichern, laden, Versionen, Konflikt', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  assert.equal((await call(env, 'GET', '/api/stand/zahlenwerk', undefined, a)).status, 404);
  const p1 = await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 0, daten: '{"t":1,"d":{"x":"1"}}', geraet: 'iPad' }, a);
  assert.deepEqual([p1.status, p1.j.rev], [200, 1]);
  // gleicher Inhalt: keine neue Version
  const gl = await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 1, daten: '{"t":1,"d":{"x":"1"}}' }, a);
  assert.deepEqual([gl.status, gl.j.rev, gl.j.gleich], [200, 1, true]);
  const p2 = await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 1, daten: '{"t":2,"d":{"x":"2"}}', geraet: 'iPad' }, a);
  assert.equal(p2.j.rev, 2);
  // zweites Gerät kennt nur Version 1
  const k = await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 1, daten: '{"t":3,"d":{"x":"alt"}}', geraet: 'iPhone' }, a);
  assert.equal(k.status, 409);
  assert.equal(k.j.fehler, 'konflikt');
  assert.equal(k.j.aktuell.rev, 2);
  assert.equal(k.j.aktuell.geraet, 'iPad');
  const g = await call(env, 'GET', '/api/stand/zahlenwerk', undefined, a);
  assert.equal(g.j.rev, 2);
  assert.equal(g.j.daten, '{"t":2,"d":{"x":"2"}}');
  // Erzwingen (Nutzer wählt "diesen Stand behalten") legt eine neue Version an
  const e = await call(env, 'PUT', '/api/stand/zahlenwerk', { erzwingen: true, daten: '{"t":3,"d":{"x":"alt"}}', geraet: 'iPhone' }, a);
  assert.deepEqual([e.status, e.j.rev], [200, 3]);
  // Eine alte Version bleibt abrufbar
  assert.equal((await call(env, 'GET', '/api/stand/zahlenwerk?rev=1', undefined, a)).j.daten, '{"t":1,"d":{"x":"1"}}');
  // Liste
  const l = await call(env, 'GET', '/api/staende', undefined, a);
  assert.deepEqual(l.j.staende.map((s) => [s.spiel, s.rev]), [['zahlenwerk', 3]]);
});

test('Es bleiben nur die letzten Versionen', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  for (let i = 0; i < VERSIONEN + 3; i++) {
    const r = await call(env, 'PUT', '/api/stand/spiel', { basis: i, daten: JSON.stringify({ i }) }, a);
    assert.equal(r.j.rev, i + 1);
  }
  const v = (await call(env, 'GET', '/api/stand/spiel/versionen', undefined, a)).j.versionen;
  assert.equal(v.length, VERSIONEN);
  assert.equal(v[0].rev, VERSIONEN + 3);
  assert.equal((await call(env, 'GET', '/api/stand/spiel?rev=1', undefined, a)).status, 404);
});

test('Stände sind getrennt pro Konto; ohne Anmeldung kein Zugriff', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben');
  await call(env, 'PUT', '/api/stand/spiel', { basis: 0, daten: '{"a":1}' }, a);
  assert.equal((await call(env, 'GET', '/api/stand/spiel', undefined, b)).status, 404);
  assert.equal((await call(env, 'GET', '/api/stand/spiel')).status, 401);
  assert.equal((await call(env, 'PUT', '/api/stand/spiel', { basis: 0, daten: '{}' }, 'a'.repeat(64))).status, 401);
});

test('Eingaben werden geprüft: Spielname, Größe, fehlende Basis', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  assert.equal((await call(env, 'PUT', '/api/stand/Gross!', { basis: 0, daten: '{}' }, a)).status, 400);
  assert.equal((await call(env, 'PUT', '/api/stand/spiel', { daten: '{}' }, a)).status, 400);
  const gross = await call(env, 'PUT', '/api/stand/spiel', { basis: 0, daten: 'x'.repeat(MAX_BYTES + 1) }, a);
  assert.equal(gross.status, 413);
  const knapp = await call(env, 'PUT', '/api/stand/spiel', { basis: 0, daten: 'y'.repeat(MAX_BYTES - 100) }, a);
  assert.equal(knapp.status, 200);
});

test('Fremde Herkunft wird bei Schreibzugriffen abgelehnt', async () => {
  const env = umgebung();
  const r = await call(env, 'POST', '/api/registrieren', { name: 'Anna', key: await schluessel('Anna', 'x') }, undefined, { origin: 'https://boese.example' });
  assert.equal(r.status, 403);
  const ok = await call(env, 'POST', '/api/registrieren', { name: 'Anna', key: await schluessel('Anna', 'x') }, undefined, { origin: 'https://hub.test' });
  assert.equal(ok.status, 200);
});

test('Passwort ändern meldet andere Geräte ab; Konto löschen entfernt alles', async () => {
  const env = umgebung();
  const t1 = await neuesKonto(env);
  const t2 = (await call(env, 'POST', '/api/anmelden', { name: 'Leif', key: await schluessel('Leif', 'geheim123') })).j.token;
  await call(env, 'PUT', '/api/stand/spiel', { basis: 0, daten: '{"a":1}' }, t1);
  const neu = await schluessel('Leif', 'neuesPasswort');
  const falsch = await call(env, 'POST', '/api/passwort', { key: await schluessel('Leif', 'xxx'), neu }, t1);
  assert.equal(falsch.status, 401);
  assert.equal((await call(env, 'POST', '/api/passwort', { key: await schluessel('Leif', 'geheim123'), neu }, t1)).status, 200);
  assert.equal((await call(env, 'GET', '/api/ich', undefined, t2)).status, 401);
  assert.equal((await call(env, 'GET', '/api/ich', undefined, t1)).status, 200);
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Leif', key: await schluessel('Leif', 'geheim123') })).status, 401);
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Leif', key: neu })).status, 200);
  assert.equal((await call(env, 'POST', '/api/loeschen', { key: neu }, t1)).status, 200);
  assert.equal((await call(env, 'GET', '/api/ich', undefined, t1)).status, 401);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM saves').get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
});

test('Zu viele Registrierungen von einer Adresse werden gebremst', async () => {
  const env = umgebung();
  for (let i = 0; i < 10; i++) await neuesKonto(env, 'Konto' + i);
  const r = await call(env, 'POST', '/api/registrieren', { name: 'Konto10', key: await schluessel('Konto10', 'x') });
  assert.equal(r.status, 429);
});

test('Zwei gleichzeitige Speichervorgänge mit gleicher Basis: nur einer gewinnt', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  await call(env, 'PUT', '/api/stand/spiel', { basis: 0, daten: '{"v":0}' }, a);
  const [x, y] = await Promise.all([
    call(env, 'PUT', '/api/stand/spiel', { basis: 1, daten: '{"v":"x"}' }, a),
    call(env, 'PUT', '/api/stand/spiel', { basis: 1, daten: '{"v":"y"}' }, a),
  ]);
  assert.deepEqual([x.status, y.status].sort(), [200, 409]);
});
