import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, VERSIONEN, MAX_BYTES, TAGE, MAX_ZEILEN, NAME_SPERRE } from '../src/konten.js';
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
  assert.deepEqual((await call(env, 'GET', '/api/ich', undefined, t)).j, { name: 'Leif', anzeige: 'Leif' });
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
  // neben den 6 jüngsten höchstens noch ein Tagesstand für einen Tageswechsel innerhalb der 5 Stunden
  assert.ok(v.length <= VERSIONEN + 1, 'zu viele Versionen: ' + v.length);
  assert.equal(v[0].rev, 300);
  assert.ok(v.length >= 5, 'zu wenige Versionen: ' + v.length);
  // Abstand der älteren Stände: mindestens ungefähr 30 Minuten
  for (let i = 2; i < Math.min(v.length, VERSIONEN); i++) assert.ok(v[i - 1].aktualisiert - v[i].aktualisiert >= 1800 - 60, 'Abstand zu klein');
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
  assert.deepEqual([la.ausgehend, la.eingehend, la.freunde], [[{ name: 'Ben', anzeige: 'Ben' }], [], []]);
  assert.deepEqual([lb.eingehend, lb.ausgehend, lb.freunde], [[{ name: 'Anna', anzeige: 'Anna' }], [], []]);
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

test('Benutzername und Anzeigename: festlegen, ändern, Freunde suchen per @username', async () => {
  const env = umgebung();
  // Anzeigename schon bei der Registrierung (nicht eindeutig), @ wird akzeptiert
  const reg = async (name, anzeige) => (await call(env, 'POST', '/api/registrieren', { name, anzeige, key: await schluessel(name, 'geheim123') }));
  const r1 = await reg('anna_k', '  Anna   die Große ');
  assert.equal(r1.status, 200);
  assert.deepEqual([r1.j.name, r1.j.anzeige], ['anna_k', 'Anna die Große']);
  const r2 = await reg('ben', 'Anna die Große');            // gleicher Anzeigename ist erlaubt
  assert.equal(r2.status, 200);
  const r3 = await reg('carl', undefined);                   // ohne Anzeigenamen: Benutzername
  assert.equal(r3.j.anzeige, 'carl');
  assert.equal((await reg('dora', 'x'.repeat(25))).status, 400);
  assert.equal((await reg('emil', '<b>')).status, 400);
  assert.equal((await reg('Ben', 'Zweiter')).status, 409);   // @username bleibt eindeutig
  const a = r1.j.token, b = r2.j.token;
  assert.deepEqual((await call(env, 'GET', '/api/ich', undefined, a)).j, { name: 'anna_k', anzeige: 'Anna die Große' });
  // Anmelden liefert den Anzeigenamen mit
  const an = await call(env, 'POST', '/api/anmelden', { name: 'anna_k', key: await schluessel('anna_k', 'geheim123') });
  assert.equal(an.j.anzeige, 'Anna die Große');
  // Ändern; Benutzername bleibt gleich; leer = zurück auf Benutzername
  let c = await call(env, 'POST', '/api/anzeige', { anzeige: 'Annchen' }, a);
  assert.deepEqual([c.status, c.j.anzeige, c.j.name], [200, 'Annchen', 'anna_k']);
  assert.equal((await call(env, 'POST', '/api/anzeige', { anzeige: 'a'.repeat(30) }, a)).status, 400);
  assert.equal((await call(env, 'GET', '/api/ich', undefined, a)).j.anzeige, 'Annchen');
  // Freunde: Anfrage per @username, Liste zeigt beides
  const fa = await call(env, 'POST', '/api/freunde/anfrage', { name: '@Anna_K' }, b);
  assert.deepEqual([fa.status, fa.j.name, fa.j.anzeige], [200, 'anna_k', 'Annchen']);
  assert.deepEqual((await call(env, 'GET', '/api/freunde', undefined, a)).j.eingehend, [{ name: 'ben', anzeige: 'Anna die Große' }]);
  // Anzeigename ist keine Suchadresse
  assert.equal((await call(env, 'POST', '/api/freunde/anfrage', { name: 'Annchen' }, b)).status, 404);
  await call(env, 'POST', '/api/freunde/annehmen', { name: 'ben' }, a);
  const fl = (await call(env, 'GET', '/api/freunde', undefined, b)).j.freunde[0];
  assert.deepEqual([fl.name, fl.anzeige], ['anna_k', 'Annchen']);
  await call(env, 'POST', '/api/anzeige', { anzeige: '' }, a);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.freunde[0].anzeige, 'anna_k');
});

test('Bestehende Datenbank ohne Spalte "display" wird beim ersten Aufruf ergänzt, Name bleibt Anzeigename', async () => {
  const env = umgebung();
  const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map((x) => x.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, name_lc TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL)`).run();
  const key = await schluessel('Altnutzer', 'geheim123');
  await env.DB.prepare('INSERT INTO users (name, name_lc, salt, hash, created) VALUES (?, ?, ?, ?, ?)').bind('Altnutzer', 'altnutzer', 'ab'.repeat(16), await sha('ab'.repeat(16) + ':' + key), 1).run();
  const an = await call(env, 'POST', '/api/anmelden', { name: 'Altnutzer', key });
  assert.equal(an.status, 200, JSON.stringify(an.j));
  assert.deepEqual([an.j.name, an.j.anzeige], ['Altnutzer', 'Altnutzer']);
  const c = await call(env, 'POST', '/api/anzeige', { anzeige: 'Alti' }, an.j.token);
  assert.equal(c.j.anzeige, 'Alti');
});

test('Tagesstände: je Tag der letzte Stand der letzten 14 Tage bleibt erhalten, ältere nicht', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  const start = uhr; let basis = 0;
  // 20 Tage lang jeden Tag drei Speicherungen im Abstand von einer Stunde
  for (let tag = 0; tag < 20; tag++) for (let k = 0; k < 3; k++) {
    uhr = start + tag * 86_400_000 + k * 3_600_000;
    const r = await call(env, 'PUT', '/api/stand/spiel', { basis, daten: JSON.stringify({ tag, k }) }, a);
    assert.equal(r.status, 200); basis = r.j.rev;
  }
  const v = (await call(env, 'GET', '/api/stand/spiel/versionen', undefined, a)).j.versionen;
  assert.ok(v.length <= MAX_ZEILEN);
  const tage = new Set(v.map((x) => Math.floor(x.aktualisiert / 86400)));
  const heute = Math.floor((start + 19 * 86_400_000 + 2 * 3_600_000) / 1000 / 86400);
  for (let d = 0; d <= TAGE; d++) assert.ok(tage.has(heute - d), 'Tag fehlt: vor ' + d + ' Tagen');
  assert.ok(![...tage].some((d) => heute - d > TAGE), 'zu alter Stand vorhanden');
  uhr = start;
});

test('Plötzlich winziger Stand (Fehler im Spiel) verdrängt den guten Stand nicht', async () => {
  const env = umgebung();
  const a = await neuesKonto(env);
  const start = uhr;
  const gut = JSON.stringify({ gut: 'x'.repeat(5000) });
  const r1 = await call(env, 'PUT', '/api/stand/spiel', { basis: 0, daten: gut }, a);
  let basis = r1.j.rev;
  // danach 12 Stunden lang jede Minute ein (fast) leerer Stand
  for (let m = 1; m <= 720; m++) {
    uhr = start + m * 60_000;
    const r = await call(env, 'PUT', '/api/stand/spiel', { basis, daten: JSON.stringify({ m }) }, a);
    assert.equal(r.status, 200); basis = r.j.rev;
  }
  const v = (await call(env, 'GET', '/api/stand/spiel/versionen', undefined, a)).j.versionen;
  assert.ok(v.some((x) => x.groesse > 4000), 'guter Stand wurde verdrängt');
  const g = await call(env, 'GET', '/api/stand/spiel?rev=1', undefined, a);
  assert.equal(g.j.daten, gut);
  uhr = start;
});

test('Spielzeit und Profil: eigene Zeiten, Freunde sehen sie, Fremde nicht', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben'), c = await neuesKonto(env, 'Cora');
  const start = uhr;
  for (let i = 0; i < 4; i++) { uhr = start + i * 45_000; assert.equal((await call(env, 'POST', '/api/praesenz', { spiel: 'zahlenwerk' }, a)).status, 200); }
  // Pause (zu lang für Zählung), dann anderes Spiel
  uhr = start + 1_000_000; await call(env, 'POST', '/api/praesenz', { spiel: 'zahlenwerk' }, a);
  uhr += 45_000; await call(env, 'POST', '/api/praesenz', { spiel: 'zahlenwerk' }, a);
  uhr += 45_000; await call(env, 'POST', '/api/praesenz', { spiel: 'tierspiel' }, a);
  await call(env, 'PUT', '/api/stand/zahlenwerk', { basis: 0, daten: '{"x":1}' }, a);
  const p = (await call(env, 'GET', '/api/profil', undefined, a)).j;
  assert.equal(p.name, 'Anna'); assert.equal(p.eigen, true);
  const z = Object.fromEntries(p.spiele.map((x) => [x.spiel, x.sekunden]));
  assert.equal(z.zahlenwerk, 3 * 45 + 45);   // 3 Abstände vor der Pause, 1 danach; der Sprung über die Pause zählt nicht
  assert.equal(z.tierspiel, 0);
  assert.deepEqual(p.staende.map((x) => x.spiel), ['zahlenwerk']);
  // Fremder ohne Freundschaft: unbekannt
  assert.equal((await call(env, 'GET', '/api/profil/Anna', undefined, b)).status, 404);
  // Freundschaft: Ben sieht Annas Zeiten, aber keine Spielstände
  assert.equal((await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, a)).status, 200);
  assert.equal((await call(env, 'POST', '/api/freunde/annehmen', { name: 'Anna' }, b)).status, 200);
  assert.equal((await call(env, 'GET', '/api/profil/%40anna', undefined, b)).status, 200);   // "@anna" und "anna" meinen dasselbe
  const fb = (await call(env, 'GET', '/api/profil/anna', undefined, b)).j;
  assert.equal(fb.eigen, false); assert.equal(fb.name, 'Anna'); assert.equal(fb.spiele, undefined); assert.equal(fb.staende, undefined);
  assert.equal((await call(env, 'GET', '/api/profil/Anna', undefined, c)).status, 404);
  assert.equal((await call(env, 'GET', '/api/profil/unbekannt', undefined, a)).status, 404);
  uhr = start;
});

test('Ein Konto gilt nur auf dem Gerät, auf dem es erstellt wurde', async () => {
  const env = umgebung();
  const G1 = 'a'.repeat(32), G2 = 'b'.repeat(32);
  const key = await schluessel('Nele', 'geheim123');
  const reg = await call(env, 'POST', '/api/registrieren', { name: 'Nele', key, geraet: 'iPhone', gid: G1 });
  assert.equal(reg.status, 200);
  // gleiches Gerät: ok
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Nele', key, gid: G1 })).status, 200);
  // anderes Gerät oder keine Kennung: abgelehnt, mit klarer Meldung
  for (const gid of [G2, undefined, 'kaputt']) {
    const r = await call(env, 'POST', '/api/anmelden', { name: 'Nele', key, gid });
    assert.deepEqual([r.status, r.j.fehler], [403, 'anderes_geraet']);
  }
  // falsches Passwort verrät nichts über das Gerät
  const falsch = await call(env, 'POST', '/api/anmelden', { name: 'Nele', key: await schluessel('Nele', 'falsch'), gid: G2 });
  assert.deepEqual([falsch.status, falsch.j.fehler], [401, 'login']);
  // Freigabe durch den Betreiber (tools/lgh-geraet.mjs): danach bindet sich das nächste Gerät
  env.DB.raw.prepare("UPDATE users SET device_id = NULL WHERE name_lc = 'nele'").run();
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Nele', key, gid: G2 })).status, 200);
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Nele', key, gid: G1 })).j.fehler, 'anderes_geraet');
});

test('Ältere Konten ohne Gerätekennung: erstes meldendes Gerät wird gebunden, bestehende Anmeldungen bleiben', async () => {
  const env = umgebung();
  const G1 = 'c'.repeat(32), G2 = 'd'.repeat(32);
  const t1 = await neuesKonto(env, 'Alt');     // ohne gid, wie vor der Änderung
  const t2 = (await call(env, 'POST', '/api/anmelden', { name: 'Alt', key: await schluessel('Alt', 'geheim123') })).j.token;
  assert.ok(t2);
  // Das Gerät mit t1 meldet sich mit Kennung: das Konto wird gebunden
  assert.equal((await call(env, 'GET', '/api/ich', undefined, t1, { 'x-geraet': G1 })).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT device_id AS d FROM users WHERE name_lc='alt'").get().d, G1);
  // eine bereits bestehende Anmeldung auf einem zweiten Gerät läuft weiter
  assert.equal((await call(env, 'GET', '/api/ich', undefined, t2, { 'x-geraet': G2 })).status, 200);
  assert.equal(env.DB.raw.prepare("SELECT device_id AS d FROM users WHERE name_lc='alt'").get().d, G1);
  // aber ein neues Anmelden auf dem zweiten Gerät geht nicht mehr
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Alt', key: await schluessel('Alt', 'geheim123'), gid: G2 })).j.fehler, 'anderes_geraet');
});

test('Benutzername ändern: nur mit Passwort, nur auf freie Namen, höchstens einmal pro Woche', async () => {
  const env = umgebung();
  const start = uhr;
  const t = await neuesKonto(env, 'Mira');
  await neuesKonto(env, 'Belegt');
  const aend = async (neu, pw = 'geheim123', alt = 'Mira') => call(env, 'POST', '/api/benutzername', { name: neu, key: await schluessel(alt, pw), neu: await schluessel(neu, pw) }, t);
  // falsches Passwort, ungültiger Name, derselbe Name, belegter Name (auch in anderer Schreibweise)
  assert.equal((await aend('Mira2', 'falsch')).status, 401);
  assert.equal((await aend('ab')).j.fehler, 'name');
  assert.equal((await aend('Mira')).j.fehler, 'name_gleich');
  assert.equal((await aend('belegt')).j.fehler, 'name_vergeben');
  assert.equal(env.DB.raw.prepare("SELECT name_changed AS c FROM users WHERE name_lc='mira'").get().c, null, 'Fehlversuche lösen keine Sperre aus');
  // Erfolg: neuer Name, Anmeldung bleibt bestehen, altes Passwort gilt unter dem neuen Namen
  uhr = start + 5000;
  const ok = await aend('Mira_neu');
  assert.deepEqual([ok.status, ok.j.name, ok.j.anzeige], [200, 'Mira_neu', 'Mira_neu']);
  assert.deepEqual((await call(env, 'GET', '/api/ich', undefined, t)).j, { name: 'Mira_neu', anzeige: 'Mira_neu' });
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Mira_neu', key: await schluessel('Mira_neu', 'geheim123') })).status, 200);
  assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Mira', key: await schluessel('Mira', 'geheim123') })).status, 401);
  // zweite Änderung innerhalb einer Woche: gesperrt, mit Wartezeit
  uhr = start + 5000 + (NAME_SPERRE - 10) * 1000;
  const zu = await aend('Mira_3', 'geheim123', 'Mira_neu');
  assert.deepEqual([zu.status, zu.j.fehler], [429, 'zu_frueh']);
  assert.ok(zu.j.warte > 0 && zu.j.warte <= 10, String(zu.j.warte));
  // nach einer Woche wieder erlaubt; der alte Name ist dann frei für andere
  uhr = start + 5000 + (NAME_SPERRE + 1) * 1000;
  assert.equal((await aend('Mira_3', 'geheim123', 'Mira_neu')).status, 200);
  assert.equal((await call(env, 'POST', '/api/registrieren', { name: 'Mira', key: await schluessel('Mira', 'x12345') })).status, 200);
  uhr = start;
});

test('Benutzername ändern: Freunde und Stände bleiben am Konto, nur Groß-/Kleinschreibung ändern geht', async () => {
  const env = umgebung();
  const start = uhr;
  const ta = await neuesKonto(env, 'Anna'), tb = await neuesKonto(env, 'Ben');
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, ta);
  await call(env, 'POST', '/api/freunde/annehmen', { name: 'Anna' }, tb);
  uhr = start + 1000;
  const r = await call(env, 'POST', '/api/benutzername', { name: 'ANNA', key: await schluessel('Anna', 'geheim123'), neu: await schluessel('ANNA', 'geheim123') }, ta);
  assert.deepEqual([r.status, r.j.name], [200, 'ANNA']);
  const fr = (await call(env, 'GET', '/api/freunde', undefined, tb)).j;
  assert.deepEqual(fr.freunde.map((f) => f.name), ['ANNA']);
  uhr = start;
});
