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
  uhr += 1_900_000; // spätere Spielrunde: der erste Stand wird als Sicherung aufgehoben
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

test('Ältere Stände: alle 30 Minuten einer, höchstens 5 neben dem aktuellen', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  // Minütliches Speichern über 5 Stunden
  const start = uhr;
  let basis = 0;
  for (let m = 0; m < 300; m++) {
    uhr = start + m * 60_000;
    const r = await call(env, 'PUT', '/api/stand/spiel', { basis, daten: JSON.stringify({ m }) }, a);
    assert.equal(r.status, 200);
    basis = r.j.rev;
  }
  const v = (await call(env, 'GET', '/api/stand/spiel/versionen', undefined, a)).j.versionen;
  assert.ok(v.length <= VERSIONEN, 'zu viele Versionen: ' + v.length);
  assert.equal(v[0].rev, 300);
  assert.ok(v.length >= 5, 'zu wenige Versionen: ' + v.length);
  // Abstand der älteren Stände: mindestens ungefähr 30 Minuten
  for (let i = 2; i < v.length; i++) assert.ok(v[i - 1].aktualisiert - v[i].aktualisiert >= 1800 - 60, 'Abstand zu klein');
  uhr = start;
});

test('Bewusstes Überschreiben behält den verdrängten Stand immer', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  await call(env, 'PUT', '/api/stand/spiel', { basis: 0, daten: '{"v":"cloud"}', geraet: 'iPad' }, a);
  const e = await call(env, 'PUT', '/api/stand/spiel', { erzwingen: true, behalten: true, daten: '{"v":"lokal"}', geraet: 'iPhone' }, a);
  assert.equal(e.j.rev, 2);
  assert.equal((await call(env, 'GET', '/api/stand/spiel?rev=1', undefined, a)).j.daten, '{"v":"cloud"}');
});

test('Bei kurzen Sitzungen bleibt der letzte Stand jeder Sitzung erhalten', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  const start = uhr; let basis = 0;
  for (const [tag, n] of [[0, 5], [1, 5], [2, 5]]) {
    for (let i = 0; i < n; i++) {
      uhr = start + tag * 86400_000 + i * 60_000;
      basis = (await call(env, 'PUT', '/api/stand/spiel', { basis, daten: JSON.stringify({ tag, i }) }, a)).j.rev;
    }
  }
  const v = (await call(env, 'GET', '/api/stand/spiel/versionen', undefined, a)).j.versionen;
  const daten = [];
  for (const x of v) daten.push(JSON.parse((await call(env, 'GET', '/api/stand/spiel?rev=' + x.rev, undefined, a)).j.daten));
  assert.deepEqual(daten[0], { tag: 2, i: 4 });
  assert.ok(daten.some((d) => d.tag === 1 && d.i === 4), 'Ende von Tag 2 fehlt');
  assert.ok(daten.some((d) => d.tag === 0 && d.i === 4), 'Ende von Tag 1 fehlt');
  uhr = start;
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

test('Freunde: Anfrage, Annehmen, Liste mit Präsenz, Entfernen', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben');
  assert.equal((await call(env, 'POST', '/api/freunde/anfrage', { name: 'Niemand' }, a)).j.fehler, 'unbekannter_name');
  assert.equal((await call(env, 'POST', '/api/freunde/anfrage', { name: 'anna' }, a)).j.fehler, 'selbst');
  assert.equal((await call(env, 'POST', '/api/freunde/anfrage', { name: 'BEN' }, a)).status, 200);
  assert.equal((await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, a)).j.fehler, 'schon_angefragt');
  const la = (await call(env, 'GET', '/api/freunde', undefined, a)).j, lb = (await call(env, 'GET', '/api/freunde', undefined, b)).j;
  assert.deepEqual([la.ausgehend, la.eingehend, la.freunde], [[{ name: 'Ben' }], [], []]);
  assert.deepEqual([lb.eingehend, lb.ausgehend, lb.freunde], [[{ name: 'Anna' }], [], []]);
  // Anna kann ihre eigene Anfrage nicht annehmen, Ben schon
  assert.equal((await call(env, 'POST', '/api/freunde/annehmen', { name: 'Ben' }, a)).status, 404);
  assert.equal((await call(env, 'POST', '/api/freunde/annehmen', { name: 'Anna' }, b)).status, 200);
  assert.equal((await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, a)).j.fehler, 'schon_freunde');
  // Präsenz: Ben spielt Zahlenwerk in einem Raum
  assert.equal((await call(env, 'POST', '/api/praesenz', { spiel: 'zahlenwerk', raum: 'ABC123' }, b)).status, 200);
  let f = (await call(env, 'GET', '/api/freunde', undefined, a)).j.freunde[0];
  assert.deepEqual([f.name, f.online, f.spiel, f.raum], ['Ben', true, 'zahlenwerk', 'ABC123']);
  // Im Hub, ohne Spiel
  await call(env, 'POST', '/api/praesenz', { spiel: null }, b);
  f = (await call(env, 'GET', '/api/freunde', undefined, a)).j.freunde[0];
  assert.deepEqual([f.online, f.spiel, f.raum], [true, null, null]);
  // Nach 2 Minuten ohne Herzschlag: offline, kein Spiel sichtbar
  await call(env, 'POST', '/api/praesenz', { spiel: 'zahlenwerk' }, b);
  uhr += 120_000;
  f = (await call(env, 'GET', '/api/freunde', undefined, a)).j.freunde[0];
  assert.deepEqual([f.online, f.spiel], [false, null]);
  assert.ok(f.zuletzt > 0);
  // Abmelden vom Hub setzt sofort auf offline
  await call(env, 'POST', '/api/praesenz', { spiel: 'zahlenwerk' }, b);
  await call(env, 'POST', '/api/praesenz', { offline: true }, b);
  f = (await call(env, 'GET', '/api/freunde', undefined, a)).j.freunde[0];
  assert.equal(f.online, false);
  assert.ok(f.zuletzt > 0, 'Abmelden darf "zuletzt online" nicht löschen');
  // Entfernen
  assert.equal((await call(env, 'POST', '/api/freunde/entfernen', { name: 'Ben' }, a)).status, 200);
  assert.deepEqual((await call(env, 'GET', '/api/freunde', undefined, b)).j.freunde, []);
});

test('Freunde: Präsenz nur für Freunde sichtbar; gegenseitige Anfrage wird zur Freundschaft; Ablehnen', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben'), c = await neuesKonto(env, 'Carl');
  await call(env, 'POST', '/api/praesenz', { spiel: 'spells' }, a);
  assert.deepEqual((await call(env, 'GET', '/api/freunde', undefined, b)).j, { freunde: [], eingehend: [], ausgehend: [], jetzt: Math.floor(uhr / 1000) });
  // Ben und Carl fragen sich gegenseitig an
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Carl' }, b);
  const g = await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, c);
  assert.equal(g.j.freunde, true);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.freunde[0].name, 'Carl');
  // Ablehnen und Zurückziehen
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Anna' }, b);
  assert.equal((await call(env, 'POST', '/api/freunde/ablehnen', { name: 'Ben' }, a)).status, 200);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.ausgehend.length, 0);
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Anna' }, b);
  assert.equal((await call(env, 'POST', '/api/freunde/ablehnen', { name: 'Anna' }, b)).status, 200); // zurückziehen
  // Ablehnen löscht keine bestehende Freundschaft
  assert.equal((await call(env, 'POST', '/api/freunde/ablehnen', { name: 'Carl' }, b)).status, 404);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.freunde.length, 1);
});

test('Präsenz: ungültige Eingaben, Konto löschen entfernt Freunde und Präsenz', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben');
  assert.equal((await call(env, 'POST', '/api/praesenz', { spiel: 'Falsch!' }, a)).status, 400);
  assert.equal((await call(env, 'POST', '/api/praesenz', { spiel: 'x', raum: '<b>' }, a)).status, 400);
  assert.equal((await call(env, 'POST', '/api/praesenz', { spiel: 'x', raum: 'y'.repeat(41) }, a)).status, 400);
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, a);
  await call(env, 'POST', '/api/praesenz', { spiel: 'x' }, a);
  assert.equal((await call(env, 'POST', '/api/loeschen', { key: await schluessel('Anna', 'geheim123') }, a)).status, 200);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM friends').get().n, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM presence').get().n, 0);
  assert.deepEqual((await call(env, 'GET', '/api/freunde', undefined, b)).j.eingehend, []);
});
