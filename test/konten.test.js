import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, EIN_GERAET, VERSIONEN, MAX_BYTES, TAGE, MAX_ZEILEN, NAME_SPERRE } from '../src/konten.js';
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
  assert.deepEqual((await call(env, 'GET', '/api/ich', undefined, t)).j, { name: 'Leif', anzeige: 'Leif', av: null, sicht: { online: 1, spiele: 1 } });
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
  assert.deepEqual([la.ausgehend, la.eingehend, la.freunde], [[{ name: 'Ben', anzeige: 'Ben', av: null }], [], []]);
  assert.deepEqual([lb.eingehend, lb.ausgehend, lb.freunde], [[{ name: 'Anna', anzeige: 'Anna', av: null }], [], []]);
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
  assert.deepEqual((await call(env, 'GET', '/api/freunde', undefined, b)).j, { freunde: [], eingehend: [], ausgehend: [], chat: 0, gruppen: [], jetzt: Math.floor(uhr / 1000) });
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
  assert.deepEqual((await call(env, 'GET', '/api/ich', undefined, a)).j, { name: 'anna_k', anzeige: 'Anna die Große', av: null, sicht: { online: 1, spiele: 1 } });
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
  assert.deepEqual((await call(env, 'GET', '/api/freunde', undefined, a)).j.eingehend, [{ name: 'ben', anzeige: 'Anna die Große', av: null }]);
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
  assert.equal(fb.eigen, false); assert.equal(fb.name, 'Anna'); assert.equal(fb.spiele.length, 2); assert.ok(fb.spiele.every((x) => Object.keys(x).join() === 'spiel')); assert.equal(fb.staende, undefined);
  assert.equal((await call(env, 'GET', '/api/profil/Anna', undefined, c)).status, 404);
  assert.equal((await call(env, 'GET', '/api/profil/unbekannt', undefined, a)).status, 404);
  uhr = start;
});

test('Ein Konto gilt nur auf dem Gerät, auf dem es erstellt wurde', { skip: !EIN_GERAET }, async () => {
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

test('Ohne Gerätesperre: Anmelden auf mehreren Geräten und ohne Kennung geht', { skip: EIN_GERAET }, async () => {
  const env = umgebung();
  const G1 = 'a'.repeat(32), G2 = 'b'.repeat(32);
  const key = await schluessel('Nele', 'geheim123');
  assert.equal((await call(env, 'POST', '/api/registrieren', { name: 'Nele', key, geraet: 'iPhone', gid: G1 })).status, 200);
  for (const gid of [G1, G2, undefined, 'kaputt']) {
    assert.equal((await call(env, 'POST', '/api/anmelden', { name: 'Nele', key, gid })).status, 200);
  }
  const falsch = await call(env, 'POST', '/api/anmelden', { name: 'Nele', key: await schluessel('Nele', 'falsch'), gid: G2 });
  assert.deepEqual([falsch.status, falsch.j.fehler], [401, 'login']);
});

test('Ältere Konten ohne Gerätekennung: erstes meldendes Gerät wird gebunden, bestehende Anmeldungen bleiben', { skip: !EIN_GERAET }, async () => {
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
  assert.deepEqual((await call(env, 'GET', '/api/ich', undefined, t)).j, { name: 'Mira_neu', anzeige: 'Mira_neu', av: null, sicht: { online: 1, spiele: 1 } });
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

test('Profilbild: speichern, prüfen, Freunde sehen es, zurücksetzen', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben');
  const av = { i: 'lorc/dragon-head', f: '#FFFFFF', b: '#336699', z: 1.4, r: -30 };
  assert.equal((await call(env, 'POST', '/api/avatar', { av }, a)).status, 200);
  const ich = (await call(env, 'GET', '/api/ich', undefined, a)).j;
  assert.deepEqual(ich.av, { i: 'lorc/dragon-head', f: '#ffffff', b: '#336699', z: 1.4, r: -30 });   // Farben werden klein geschrieben
  // Ungültiges wird abgelehnt (Pfad, Farbe, Zoom, Drehung, falsche Form)
  for (const schlecht of [{ ...av, i: '../x/y' }, { ...av, i: 'a/b/c' }, { ...av, f: 'red' }, { ...av, b: 'url(x)' }, { ...av, z: 9 }, { ...av, z: 0 }, { ...av, r: 999 }, { ...av, z: 'x' }, 'text', [1]]) {
    assert.equal((await call(env, 'POST', '/api/avatar', { av: schlecht }, a)).status, 400, JSON.stringify(schlecht));
  }
  assert.equal((await call(env, 'POST', '/api/avatar', { av }, undefined)).status, 401);
  // Freunde sehen das Bild in Liste und Profil, Fremde bekommen es nicht
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Anna' }, b);
  await call(env, 'POST', '/api/freunde/annehmen', { name: 'Ben' }, a);
  const fl = (await call(env, 'GET', '/api/freunde', undefined, b)).j.freunde;
  assert.equal(fl[0].av.i, 'lorc/dragon-head');
  assert.equal((await call(env, 'GET', '/api/profil/Anna', undefined, b)).j.av.f, '#ffffff');
  assert.equal((await call(env, 'GET', '/api/ich', undefined, b)).j.av, null);
  // Zurücksetzen auf den Buchstaben
  assert.equal((await call(env, 'POST', '/api/avatar', { av: null }, a)).status, 200);
  assert.equal((await call(env, 'GET', '/api/ich', undefined, a)).j.av, null);
});

test('Sichtbarkeit: Online-Status und Spiele getrennt verbergbar, serverseitig durchgesetzt', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben');
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, a);
  await call(env, 'POST', '/api/freunde/annehmen', { name: 'Anna' }, b);
  await call(env, 'POST', '/api/praesenz', { spiel: 'spells', raum: 'XY' }, b);
  const sehen = async () => ({ f: (await call(env, 'GET', '/api/freunde', undefined, a)).j.freunde[0], p: (await call(env, 'GET', '/api/profil/Ben', undefined, a)).j });
  let x = await sehen();
  assert.equal(x.f.online, true); assert.equal(x.f.spiel, 'spells'); assert.equal(x.f.raum, 'XY'); assert.deepEqual(x.p.spiele, [{ spiel: 'spells' }]);
  // Eingaben prüfen
  assert.equal((await call(env, 'POST', '/api/sichtbarkeit', { online: 3 }, b)).status, 400);
  assert.equal((await call(env, 'POST', '/api/sichtbarkeit', { online: '2' }, b)).status, 400);
  assert.equal((await call(env, 'POST', '/api/sichtbarkeit', {}, b)).status, 400);
  assert.equal((await call(env, 'POST', '/api/sichtbarkeit', { online: 0 })).status, 401);
  // Spiele verbergen: online bleibt sichtbar, aber kein aktuelles Spiel, kein Raum, keine Liste
  assert.deepEqual((await call(env, 'POST', '/api/sichtbarkeit', { spiele: 0 }, b)).j.sicht, { online: 1, spiele: 0 });
  x = await sehen();
  assert.equal(x.f.online, true); assert.equal(x.f.spiel, null); assert.equal(x.f.raum, null);
  assert.equal(x.p.spielePrivat, true); assert.deepEqual(x.p.spiele, []); assert.equal(x.p.spiel, null);
  // Online verbergen: offline, ohne "zuletzt online"; die Spielliste ist davon unabhängig
  await call(env, 'POST', '/api/sichtbarkeit', { online: 0, spiele: 1 }, b);
  x = await sehen();
  assert.equal(x.f.online, false); assert.equal(x.f.privat, true); assert.equal(x.f.zuletzt, null); assert.equal(x.f.spiel, null);
  assert.equal(x.p.statusPrivat, true); assert.equal(x.p.online, false); assert.equal(x.p.zuletzt, null); assert.deepEqual(x.p.spiele, [{ spiel: 'spells' }]);
  // Das eigene Profil bleibt vollständig und zeigt die Einstellung
  const ich = (await call(env, 'GET', '/api/profil', undefined, b)).j;
  assert.equal(ich.online, true); assert.equal(ich.spiel, 'spells'); assert.deepEqual(ich.sicht, { online: 0, spiele: 1 });
});

test('Sichtbarkeit "Alle": Fremde sehen genau das, was freigegeben ist; Standard bleibt Freunde', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben'), c = await neuesKonto(env, 'Carl');
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, a);
  await call(env, 'POST', '/api/freunde/annehmen', { name: 'Anna' }, b);
  await call(env, 'POST', '/api/praesenz', { spiel: 'spells', raum: 'XY' }, b);
  // Standard: Freunde. Ein Fremder sieht nichts, nicht einmal, dass es das Konto gibt
  assert.deepEqual((await call(env, 'GET', '/api/ich', undefined, b)).j.sicht, { online: 1, spiele: 1 });
  assert.equal((await call(env, 'GET', '/api/profil/Ben', undefined, c)).status, 404);
  // Nur der Status für alle: Fremde sehen online, aber weder Spiel noch Liste
  assert.deepEqual((await call(env, 'POST', '/api/sichtbarkeit', { online: 2 }, b)).j.sicht, { online: 2, spiele: 1 });
  let p = (await call(env, 'GET', '/api/profil/Ben', undefined, c)).j;
  assert.equal(p.nurOeffentlich, true); assert.equal(p.freund, false); assert.equal(p.online, true); assert.equal('spiel' in p, false);
  assert.equal(p.zeigeStatus, true); assert.equal(p.zeigeSpiele, false); assert.equal('spiele' in p, false); assert.equal(p.spielePrivat, true);
  for (const k of ['freunde', 'staende', 'sicht', 'raum']) assert.equal(k in p, false, k);
  // Spiele auch für alle: Spiel und Liste, aber weiter keine Zeiten
  await call(env, 'POST', '/api/sichtbarkeit', { spiele: 2 }, b);
  p = (await call(env, 'GET', '/api/profil/Ben', undefined, c)).j;
  assert.equal(p.spiel, 'spells'); assert.deepEqual(p.spiele, [{ spiel: 'spells' }]); assert.equal(p.zeigeSpiele, true);
  // Freunde sehen weiterhin alles, auch bei "Alle"; die Freundesliste liefert denselben Stand
  const f = (await call(env, 'GET', '/api/freunde', undefined, a)).j.freunde[0];
  assert.equal(f.online, true); assert.equal(f.privat, false); assert.equal(f.spiel, 'spells');
  assert.equal((await call(env, 'GET', '/api/profil/Ben', undefined, a)).j.freund, true);
  // Nur Spiele für alle, Status nur Freunde: Fremde sehen die Liste, aber keinen Status
  await call(env, 'POST', '/api/sichtbarkeit', { online: 1 }, b);
  p = (await call(env, 'GET', '/api/profil/Ben', undefined, c)).j;
  assert.equal(p.zeigeStatus, false); assert.equal(p.statusPrivat, true); assert.equal('online' in p, false); assert.equal(p.spiel, null); assert.deepEqual(p.spiele, [{ spiel: 'spells' }]);
  // Zurück auf Freunde: wieder unsichtbar
  await call(env, 'POST', '/api/sichtbarkeit', { spiele: 1 }, b);
  assert.equal((await call(env, 'GET', '/api/profil/Ben', undefined, c)).status, 404);
  // Niemand gilt auch für Freunde, "Alle" hebt das nicht auf
  await call(env, 'POST', '/api/sichtbarkeit', { online: 0 }, b);
  assert.equal((await call(env, 'GET', '/api/profil/Ben', undefined, a)).j.statusPrivat, true);
});

async function freunde2(env, n1 = 'Anna', n2 = 'Ben') {
  const a = await neuesKonto(env, n1), b = await neuesKonto(env, n2);
  await call(env, 'POST', '/api/freunde/anfrage', { name: n2 }, a);
  await call(env, 'POST', '/api/freunde/annehmen', { name: n1 }, b);
  return [a, b];
}

test('Chat: nur unter Freunden, Senden, Lesen, Nachladen, ungelesen und Gelesen-Markierung', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben');
  // Ohne Freundschaft (auch bei offener Anfrage) weder Senden noch Lesen
  assert.equal((await call(env, 'POST', '/api/chat/Ben', { text: 'Hallo' }, a)).status, 404);
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, a);
  assert.equal((await call(env, 'POST', '/api/chat/Ben', { text: 'Hallo' }, a)).status, 404);
  assert.equal((await call(env, 'GET', '/api/chat/Anna', undefined, b)).status, 404);
  await call(env, 'POST', '/api/freunde/annehmen', { name: 'Anna' }, b);
  // Nicht angemeldet, an sich selbst, unbekannter Name
  assert.equal((await call(env, 'GET', '/api/chat/Ben')).status, 401);
  assert.equal((await call(env, 'POST', '/api/chat/Anna', { text: 'x' }, a)).status, 404);
  assert.equal((await call(env, 'POST', '/api/chat/Niemand', { text: 'x' }, a)).status, 404);
  // Senden: Name ohne Beachtung der Schreibweise, auch mit @
  const s1 = await call(env, 'POST', '/api/chat/ben', { text: '  Hallo Ben!  ' }, a);
  assert.equal(s1.status, 200);
  assert.deepEqual([s1.j.nachricht.von, s1.j.nachricht.text], ['ich', 'Hallo Ben!']);
  await call(env, 'POST', '/api/chat/%40Ben', { text: 'Zweite\nZeile' }, a);
  // Ben sieht 2 ungelesene, mit Vorschau der neuesten
  let l = (await call(env, 'GET', '/api/freunde', undefined, b)).j;
  assert.equal(l.chat, 2);
  assert.deepEqual([l.freunde[0].ungelesen, l.freunde[0].vorschau], [2, 'Zweite']);
  // Anna hat nichts Ungelesenes (eigene Nachrichten zählen nicht)
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, a)).j.chat, 0);
  // Lesen ohne gelesen=1 markiert nichts
  const r1 = await call(env, 'GET', '/api/chat/Anna', undefined, b);
  assert.deepEqual(r1.j.nachrichten.map((m) => [m.von, m.text]), [['er', 'Hallo Ben!'], ['er', 'Zweite\nZeile']]);
  assert.equal(r1.j.mehr, false);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.chat, 2);
  // Mit gelesen=1 gilt es als gelesen
  await call(env, 'GET', '/api/chat/Anna?gelesen=1', undefined, b);
  l = (await call(env, 'GET', '/api/freunde', undefined, b)).j;
  assert.deepEqual([l.chat, l.freunde[0].ungelesen, l.freunde[0].vorschau], [0, 0, null]);
  // Antwort und Nachladen mit nach=<id>
  const letzte = r1.j.nachrichten[1].id;
  uhr += 5000;
  await call(env, 'POST', '/api/chat/Anna', { text: 'Hi Anna' }, b);
  const nl = await call(env, 'GET', `/api/chat/Ben?nach=${letzte}&gelesen=1`, undefined, a);
  assert.deepEqual(nl.j.nachrichten.map((m) => [m.von, m.text]), [['er', 'Hi Anna']]);
  assert.equal((await call(env, 'GET', `/api/chat/Ben?nach=${nl.j.nachrichten[0].id}`, undefined, a)).j.nachrichten.length, 0);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, a)).j.chat, 0);
});

test('Chat: Antworten markiert den Chat als gelesen; Eingaben werden geprüft', async () => {
  const env = umgebung();
  const [a, b] = await freunde2(env);
  await call(env, 'POST', '/api/chat/Ben', { text: 'eins' }, a);
  await call(env, 'POST', '/api/chat/Ben', { text: 'zwei' }, a);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.chat, 2);
  await call(env, 'POST', '/api/chat/Anna', { text: 'Antwort' }, b);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.chat, 0);
  const f = (t) => call(env, 'POST', '/api/chat/Ben', { text: t }, a);
  assert.equal((await f('')).j.fehler, 'leer');
  assert.equal((await f('   \n  ')).j.fehler, 'leer');
  assert.equal((await f(42)).j.fehler, 'eingabe');
  assert.equal((await f('x'.repeat(501))).j.fehler, 'zu_lang');
  assert.equal((await f('x'.repeat(500))).status, 200);
  assert.equal((await f('😀'.repeat(500))).status, 200, 'Emojis zählen als ein Zeichen');
  assert.equal((await f('a\u0007b')).j.fehler, 'zeichen');
  // HTML bleibt Text (die Oberfläche maskiert es), mehrere Leerzeilen werden zusammengezogen
  const h = await f('<b>fett</b> :-<\n\n\n\nEnde');
  assert.equal(h.j.nachricht.text, '<b>fett</b> :-<\n\nEnde');
  assert.equal((await call(env, 'POST', '/api/chat/Ben', undefined, a)).status, 400);
});

test('Chat: Nachrichten löschen (nur eigene), ältere nachladen, nur 500 bleiben', async () => {
  const env = umgebung();
  const [a, b] = await freunde2(env);
  const m = (await call(env, 'POST', '/api/chat/Ben', { text: 'weg damit' }, a)).j.nachricht;
  assert.equal((await call(env, 'POST', '/api/chat/Anna/loeschen', { id: m.id }, b)).status, 404, 'fremde Nachricht');
  assert.equal((await call(env, 'POST', '/api/chat/Ben/loeschen', { id: m.id }, a)).status, 200);
  assert.equal((await call(env, 'POST', '/api/chat/Ben/loeschen', { id: m.id }, a)).status, 404, 'schon weg');
  assert.equal((await call(env, 'POST', '/api/chat/Ben/loeschen', { id: 'x' }, a)).status, 400);
  assert.equal((await call(env, 'GET', '/api/chat/Ben', undefined, a)).j.nachrichten.length, 0);
  // Viele Nachrichten: die neuesten 50 zuerst, mit vor=<id> blättert man weiter zurück
  for (let i = 1; i <= 120; i++) { await call(env, 'POST', '/api/chat/Ben', { text: 'n' + i }, a); if (i % 25 === 0) uhr += 61_000; }
  const neu = (await call(env, 'GET', '/api/chat/Ben', undefined, a)).j;
  assert.equal(neu.nachrichten.length, 50);
  assert.equal(neu.mehr, true);
  assert.equal(neu.nachrichten[49].text, 'n120');
  const alt = (await call(env, 'GET', `/api/chat/Ben?vor=${neu.nachrichten[0].id}`, undefined, a)).j;
  assert.equal(alt.nachrichten.length, 50);
  assert.equal(alt.nachrichten[49].text, 'n70');
  const rest = (await call(env, 'GET', `/api/chat/Ben?vor=${alt.nachrichten[0].id}`, undefined, a)).j;
  assert.deepEqual([rest.nachrichten.length, rest.mehr], [20, false]);
});

test('Chat: höchstens 500 Nachrichten pro Paar bleiben erhalten', async () => {
  const env = umgebung();
  const [a] = await freunde2(env);
  for (let i = 1; i <= 505; i++) { await call(env, 'POST', '/api/chat/Ben', { text: 'n' + i }, a); if (i % 28 === 0) uhr += 61_000; }
  const ids = [];
  let vor = '';
  for (;;) {
    const r = (await call(env, 'GET', '/api/chat/Ben' + vor, undefined, a)).j;
    ids.push(...r.nachrichten.map((m) => m.text));
    if (!r.mehr) break;
    vor = '?vor=' + r.nachrichten[0].id;
  }
  assert.equal(ids.length, 500);
  assert.ok(ids.includes('n505') && ids.includes('n6') && !ids.includes('n5'));
});

test('Chat: Bremse bei zu vielen Nachrichten, getrennt pro Absender', async () => {
  const env = umgebung();
  const [a, b] = await freunde2(env);
  for (let i = 0; i < 30; i++) assert.equal((await call(env, 'POST', '/api/chat/Ben', { text: 'spam' + i }, a)).status, 200);
  const g = await call(env, 'POST', '/api/chat/Ben', { text: 'noch eine' }, a);
  assert.equal(g.status, 429);
  assert.ok(g.j.warte > 0 && g.j.warte <= 30);
  assert.equal((await call(env, 'POST', '/api/chat/Anna', { text: 'ich darf noch' }, b)).status, 200);
  uhr += 31_000;
  assert.equal((await call(env, 'POST', '/api/chat/Ben', { text: 'wieder' }, a)).status, 200);
  uhr += 61_000;
});

test('Chat: Freundschaft entfernen löscht den Verlauf, Konto löschen ebenfalls', async () => {
  const env = umgebung();
  const [a, b] = await freunde2(env);
  const c = await neuesKonto(env, 'Carl');
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Carl' }, a);
  await call(env, 'POST', '/api/freunde/annehmen', { name: 'Anna' }, c);
  await call(env, 'POST', '/api/chat/Ben', { text: 'an Ben' }, a);
  await call(env, 'POST', '/api/chat/Anna', { text: 'von Ben' }, b);
  await call(env, 'POST', '/api/chat/Carl', { text: 'an Carl' }, a);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, a)).j.chat, 1);
  await call(env, 'POST', '/api/freunde/entfernen', { name: 'Ben' }, a);
  assert.equal((await call(env, 'GET', '/api/chat/Ben', undefined, a)).status, 404);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, a)).j.chat, 0);
  // Wieder befreundet: der alte Verlauf ist weg, der mit Carl bleibt
  await call(env, 'POST', '/api/freunde/anfrage', { name: 'Ben' }, a);
  await call(env, 'POST', '/api/freunde/annehmen', { name: 'Anna' }, b);
  assert.equal((await call(env, 'GET', '/api/chat/Ben', undefined, a)).j.nachrichten.length, 0);
  assert.equal((await call(env, 'GET', '/api/chat/Carl', undefined, a)).j.nachrichten.length, 1);
  // Konto löschen: Carl verliert den Verlauf mit Anna, Freunde-Liste ist leer
  const key = await schluessel('Anna', 'geheim123');
  assert.equal((await call(env, 'POST', '/api/loeschen', { key }, a)).status, 200);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, c)).j.chat, 0);
  const rest = await env.DB.prepare('SELECT COUNT(*) AS n FROM messages').first();
  assert.equal(rest.n, 0);
  const lesen = await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_read').first();
  assert.equal(lesen.n, 0);
});

test('Bewertungen: ab 15 Minuten Spielzeit 1 bis 5 Sterne, Durchschnitt für alle, nur bekannte Spiele, mit dem Konto gelöscht', async () => {
  const env = umgebung();
  env.ASSETS = { fetch: async () => new Response(JSON.stringify({ games: [{ id: 'spells' }, { id: 'tierspiel' }] })) };
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben'), c = await neuesKonto(env, 'Carl');
  const spielzeit = async (name, spiel, sek) => {
    const u = await env.DB.prepare('SELECT id FROM users WHERE name_lc = ?').bind(name.toLowerCase()).first();
    await env.DB.prepare('INSERT INTO playtime (user_id, game, seconds, last) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, game) DO UPDATE SET seconds = excluded.seconds').bind(u.id, spiel, sek).run();
  };
  assert.equal((await call(env, 'GET', '/api/bewertung/spells')).status, 401);
  assert.deepEqual((await call(env, 'GET', '/api/bewertung/spells', undefined, a)).j, { spiel: 'spells', anzahl: 0, schnitt: null, meine: 0, spielzeit: 0, mindest: 900 });
  // Ohne 15 Minuten Spielzeit keine Bewertung
  let r = await call(env, 'POST', '/api/bewertung/spells', { sterne: 5 }, a);
  assert.equal(r.status, 403); assert.equal(r.j.fehler, 'zu_wenig_spielzeit'); assert.equal(r.j.fehlt, 900);
  await spielzeit('Anna', 'spells', 899);
  assert.equal((await call(env, 'POST', '/api/bewertung/spells', { sterne: 5 }, a)).status, 403);
  assert.equal((await call(env, 'GET', '/api/bewertung/spells', undefined, a)).j.spielzeit, 899);
  // Spielzeit in einem anderen Spiel zählt nicht
  await spielzeit('Anna', 'tierspiel', 5000);
  assert.equal((await call(env, 'POST', '/api/bewertung/spells', { sterne: 5 }, a)).status, 403);
  // Genau 15 Minuten reichen
  await spielzeit('Anna', 'spells', 900); await spielzeit('Ben', 'spells', 3000); await spielzeit('Carl', 'spells', 1000);
  assert.deepEqual((await call(env, 'POST', '/api/bewertung/spells', { sterne: 5 }, a)).j, { spiel: 'spells', anzahl: 1, schnitt: 5, meine: 5, spielzeit: 900, mindest: 900 });
  assert.equal((await call(env, 'POST', '/api/bewertung/spells', { sterne: 2 }, b)).j.schnitt, 3.5);
  // Fremde sehen Durchschnitt und Anzahl, aber nicht, wer was vergeben hat; die eigene Bewertung ist nur für einen selbst
  const f = (await call(env, 'GET', '/api/bewertung/spells', undefined, c)).j;
  assert.equal(f.anzahl, 2); assert.equal(f.schnitt, 3.5); assert.equal(f.meine, 0);
  // Ändern zählt nicht doppelt, Runden auf eine Nachkommastelle
  assert.equal((await call(env, 'POST', '/api/bewertung/spells', { sterne: 4 }, b)).j.schnitt, 4.5);
  await call(env, 'POST', '/api/bewertung/spells', { sterne: 1 }, c);
  assert.equal((await call(env, 'GET', '/api/bewertung/spells', undefined, a)).j.schnitt, 3.3);   // (5+4+1)/3
  // Zurücknehmen mit 0 geht immer, auch wenn die Spielzeit (hier künstlich) nicht mehr reicht
  await spielzeit('Carl', 'spells', 10);
  const z = (await call(env, 'POST', '/api/bewertung/spells', { sterne: 0 }, c)).j;
  assert.equal(z.anzahl, 2); assert.equal(z.schnitt, 4.5); assert.equal(z.meine, 0);
  // Spiele sind unabhängig
  assert.equal((await call(env, 'GET', '/api/bewertung/tierspiel', undefined, a)).j.anzahl, 0);
  // Eingaben und unbekannte Spiele
  for (const body of [{ sterne: 6 }, { sterne: -1 }, { sterne: 3.5 }, { sterne: '4' }, { sterne: null }, {}]) {
    assert.equal((await call(env, 'POST', '/api/bewertung/spells', body, a)).status, 400, JSON.stringify(body));
  }
  assert.equal((await call(env, 'POST', '/api/bewertung/gibtsnicht', { sterne: 3 }, a)).status, 404);
  assert.equal((await call(env, 'GET', '/api/bewertung/B%C3%B6se', undefined, a)).status, 400);
  // Konto löschen nimmt die Bewertungen mit
  assert.equal((await call(env, 'POST', '/api/loeschen', { key: await schluessel('Ben', 'geheim123') }, b)).status, 200);
  const rest = (await call(env, 'GET', '/api/bewertung/spells', undefined, a)).j;
  assert.equal(rest.anzahl, 1); assert.equal(rest.schnitt, 5); assert.equal(rest.meine, 5);
});

test('Favoriten: je Konto, setzen und entfernen, Eingaben geprüft, mit dem Konto gelöscht', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben');
  assert.equal((await call(env, 'GET', '/api/favoriten')).status, 401);
  assert.deepEqual((await call(env, 'GET', '/api/favoriten', undefined, a)).j.favoriten, []);
  assert.deepEqual((await call(env, 'POST', '/api/favoriten', { spiel: 'spells', an: true }, a)).j.favoriten, ['spells']);
  assert.deepEqual((await call(env, 'POST', '/api/favoriten', { spiel: 'spells', an: true }, a)).j.favoriten, ['spells']);   // doppelt: bleibt einmal
  assert.deepEqual((await call(env, 'POST', '/api/favoriten', { spiel: 'tierspiel', an: true }, a)).j.favoriten, ['spells', 'tierspiel']);
  assert.deepEqual((await call(env, 'GET', '/api/favoriten', undefined, b)).j.favoriten, []);   // jedes Konto für sich
  assert.deepEqual((await call(env, 'POST', '/api/favoriten', { spiel: 'spells', an: false }, a)).j.favoriten, ['tierspiel']);
  assert.deepEqual((await call(env, 'POST', '/api/favoriten', { spiel: 'gibtsnicht', an: false }, a)).j.favoriten, ['tierspiel']);   // Entfernen ist idempotent
  for (const body of [{ spiel: 'Böse Id!', an: true }, { spiel: 'spells' }, { spiel: 'spells', an: 'ja' }, { an: true }, {}]) {
    assert.equal((await call(env, 'POST', '/api/favoriten', body, a)).status, 400, JSON.stringify(body));
  }
  // Obergrenze
  for (let i = 0; i < 59; i++) await call(env, 'POST', '/api/favoriten', { spiel: 'g' + i, an: true }, a);
  assert.equal((await call(env, 'POST', '/api/favoriten', { spiel: 'zuviel', an: true }, a)).status, 400);
  assert.equal((await call(env, 'POST', '/api/favoriten', { spiel: 'g3', an: true }, a)).status, 200);   // schon vorhanden zählt nicht als neu
  // Konto löschen räumt auf
  await call(env, 'POST', '/api/favoriten', { spiel: 'spells', an: true }, b);
  const vorher = (await env.DB.prepare('SELECT COUNT(*) AS n FROM favorites').first()).n;
  assert.equal((await call(env, 'POST', '/api/loeschen', { key: await schluessel('Ben', 'geheim123') }, b)).status, 200);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM favorites').first()).n, vorher - 1);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM favorites WHERE game = 'tierspiel'").first()).n, 1);   // die von Anna bleiben
});

test('Chat: /api/ungelesen liefert je Freund Zahl und neueste Nachricht, nur für den Empfänger', async () => {
  const env = umgebung();
  const [a, b] = await freunde2(env);   // Anna, Ben
  const c = await neuesKonto(env, 'Carl');
  assert.equal((await call(env, 'GET', '/api/ungelesen')).status, 401);
  assert.deepEqual((await call(env, 'GET', '/api/ungelesen', undefined, b)).j.von, []);
  await call(env, 'POST', '/api/chat/Ben', { text: 'erste' }, a);
  const z = (await call(env, 'POST', '/api/chat/Ben', { text: 'Kommst du ins Spiel?' }, a)).j.nachricht;
  let u = (await call(env, 'GET', '/api/ungelesen', undefined, b)).j.von;
  assert.equal(u.length, 1); assert.equal(u[0].name, 'Anna'); assert.equal(u[0].n, 2); assert.equal(u[0].neu, z.id); assert.equal(u[0].text, 'Kommst du ins Spiel?');
  assert.ok('anzeige' in u[0] && 'av' in u[0]);
  // Der Absender selbst und Fremde sehen nichts
  assert.deepEqual((await call(env, 'GET', '/api/ungelesen', undefined, a)).j.von, []);
  assert.deepEqual((await call(env, 'GET', '/api/ungelesen', undefined, c)).j.von, []);
  // Antworten markiert alles bis dahin als gelesen
  await call(env, 'POST', '/api/chat/Anna', { text: 'gleich' }, b);
  assert.deepEqual((await call(env, 'GET', '/api/ungelesen', undefined, b)).j.von, []);
  // Neue Nachricht danach: wieder da, nur die neue zählt
  await call(env, 'POST', '/api/chat/Ben', { text: 'noch eine' }, a);
  u = (await call(env, 'GET', '/api/ungelesen', undefined, b)).j.von;
  assert.equal(u[0].n, 1); assert.equal(u[0].text, 'noch eine');
  // Nach dem Entfernen der Freundschaft nichts mehr
  await call(env, 'POST', '/api/freunde/entfernen', { name: 'Anna' }, b);
  assert.deepEqual((await call(env, 'GET', '/api/ungelesen', undefined, b)).j.von, []);
});

test('Chat: Ungelesenes zählt nur von Freunden und nur für den Empfänger', async () => {
  const env = umgebung();
  const [a, b] = await freunde2(env);
  const c = await neuesKonto(env, 'Carl');
  await call(env, 'POST', '/api/chat/Ben', { text: 'nur für Ben' }, a);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, c)).j.chat, 0);
  assert.equal((await call(env, 'GET', '/api/chat/Anna', undefined, c)).status, 404);
  assert.equal((await call(env, 'GET', '/api/chat/Ben', undefined, c)).status, 404);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.chat, 1);
});

test('Profile von Entwicklern (games.json) sieht jeder, aber nur die öffentlichen Angaben; andere nur Freunde', async () => {
  const env = umgebung();
  env.ASSETS = { fetch: async () => new Response(JSON.stringify({ games: [{ id: 'a', entwickler: ['Dora'] }, { id: 'b' }] })) };
  await neuesKonto(env, 'Dora'); await neuesKonto(env, 'Leif'); await neuesKonto(env, 'Kai');
  const t = await neuesKonto(env, 'Fremd');
  const d = await call(env, 'GET', '/api/profil/Dora', undefined, t);
  assert.equal(d.status, 200);
  assert.equal(d.j.name, 'Dora'); assert.equal(d.j.nurOeffentlich, true); assert.equal(d.j.entwickler, true); assert.equal(d.j.freund, false);
  for (const k of ['online', 'spiel', 'zuletzt', 'freunde', 'spiele', 'staende', 'sicht']) assert.equal(k in d.j, false, k + ' darf nicht sichtbar sein');
  // ein Spiel ohne Eintrag gehört "leif"
  assert.equal((await call(env, 'GET', '/api/profil/leif', undefined, t)).j.nurOeffentlich, true);
  // kein Entwickler und kein Freund: nicht sichtbar
  assert.equal((await call(env, 'GET', '/api/profil/Kai', undefined, t)).status, 404);
  // ohne Assets (z. B. Ausfall) bleibt es bei der Freunde-Regel
  const env2 = umgebung(); await neuesKonto(env2, 'Dora'); const t2 = await neuesKonto(env2, 'Fremd');
  assert.equal((await call(env2, 'GET', '/api/profil/Dora', undefined, t2)).status, 404);
});

test('Anzeigenamen der Entwickler: nur für Entwickler-Konten aus games.json, ohne Assets leer', async () => {
  const env = umgebung();
  env.ASSETS = { fetch: async () => new Response(JSON.stringify({ games: [{ id: 'a', entwickler: ['Dora', 'Gibtsnicht'] }] })) };
  const td = await neuesKonto(env, 'Dora'); await neuesKonto(env, 'Kai');
  assert.equal((await call(env, 'POST', '/api/anzeige', { anzeige: 'Dora D.' }, td)).status, 200);
  const r = await call(env, 'GET', '/api/entwickler', undefined, td);
  assert.equal(r.status, 200);
  assert.deepEqual(r.j.entwickler.map((x) => [x.name, x.anzeige]), [['Dora', 'Dora D.']]);
  assert.equal(r.j.entwickler.length, 1);   // Kai steht nicht in games.json, "Gibtsnicht" hat kein Konto
  const env2 = umgebung(); const t2 = await neuesKonto(env2, 'Dora');
  assert.deepEqual((await call(env2, 'GET', '/api/entwickler', undefined, t2)).j.entwickler, []);
  assert.equal((await call(env, 'GET', '/api/entwickler')).status, 401);
});

test('Einladung: "[einladung:spiel:RAUM]" geht als normale Chat-Nachricht durch und erscheint unverändert in Vorschau und Verlauf', async () => {
  const env = umgebung();
  const [a, b] = await freunde2(env);
  for (const t of ['[einladung:spells]', '[einladung:spells:ABC123]']) {
    const r = await call(env, 'POST', '/api/chat/Ben', { text: t }, a);
    assert.equal(r.status, 200);
    assert.equal(r.j.nachricht.text, t);
  }
  const l = (await call(env, 'GET', '/api/freunde', undefined, b)).j;
  assert.deepEqual([l.freunde[0].ungelesen, l.freunde[0].vorschau], [2, '[einladung:spells:ABC123]']);
  assert.deepEqual((await call(env, 'GET', '/api/chat/Anna', undefined, b)).j.nachrichten.map((m) => m.text), ['[einladung:spells]', '[einladung:spells:ABC123]']);
});

test('Bewertungen aller Spiele: Durchschnitt und Anzahl je Spiel, nur mit Anmeldung', async () => {
  const env = umgebung();
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben');
  assert.equal((await call(env, 'GET', '/api/bewertungen')).status, 401);
  assert.deepEqual((await call(env, 'GET', '/api/bewertungen', undefined, a)).j, { spiele: {} });
  for (const k of [a, b]) {
    await env.DB.prepare('INSERT INTO playtime (user_id, game, seconds, last) VALUES ((SELECT id FROM users WHERE name = ?), ?, ?, ?)').bind(k === a ? 'Anna' : 'Ben', 'spells', 1000, 1).run();
  }
  await call(env, 'POST', '/api/bewertung/spells', { sterne: 5 }, a);
  await call(env, 'POST', '/api/bewertung/spells', { sterne: 4 }, b);
  assert.deepEqual((await call(env, 'GET', '/api/bewertungen', undefined, b)).j, { spiele: { spells: { anzahl: 2, schnitt: 4.5 } } });
});

/* ---------- Chat-Gruppen ---------- */
async function gruppe3(env) {
  const a = await neuesKonto(env, 'Anna'), b = await neuesKonto(env, 'Ben'), c = await neuesKonto(env, 'Carla');
  for (const [x, nx, y, ny] of [[a, 'Anna', b, 'Ben'], [a, 'Anna', c, 'Carla']]) {
    await call(env, 'POST', '/api/freunde/anfrage', { name: ny }, x);
    await call(env, 'POST', '/api/freunde/annehmen', { name: nx }, y);
  }
  return [a, b, c];
}

test('Gruppen: anlegen nur mit eigenen Freunden, Namen prüfen, Details und Liste', async () => {
  const env = umgebung();
  const [a, b, c] = await gruppe3(env);
  assert.equal((await call(env, 'GET', '/api/gruppen')).status, 401);
  assert.equal((await call(env, 'POST', '/api/gruppen', { name: '  ', mitglieder: [] }, a)).j.fehler, 'name');
  assert.equal((await call(env, 'POST', '/api/gruppen', { name: 'x'.repeat(31), mitglieder: [] }, a)).j.fehler, 'name');
  assert.equal((await call(env, 'POST', '/api/gruppen', { name: '<b>', mitglieder: [] }, a)).j.fehler, 'name');
  // Ben und Carla sind nicht miteinander befreundet: Ben kann Carla nicht einladen, Fremde und er selbst auch nicht
  assert.equal((await call(env, 'POST', '/api/gruppen', { name: 'Test', mitglieder: ['Carla'] }, b)).status, 404);
  assert.equal((await call(env, 'POST', '/api/gruppen', { name: 'Test', mitglieder: ['Niemand'] }, a)).status, 404);
  assert.equal((await call(env, 'POST', '/api/gruppen', { name: 'Test', mitglieder: ['Anna'] }, a)).status, 404);
  const r = await call(env, 'POST', '/api/gruppen', { name: ' Familie  Schmale ', mitglieder: ['Ben', '@carla'] }, a);
  assert.equal(r.status, 200);
  assert.equal(r.j.gruppe.name, 'Familie Schmale');
  assert.equal(r.j.gruppe.eigener, true);
  assert.deepEqual(r.j.gruppe.mitglieder.map((m) => [m.name, m.besitzer]), [['Anna', true], ['Ben', false], ['Carla', false]]);
  const id = r.j.gruppe.id;
  // Mitglieder sehen die Gruppe, Außenstehende nicht
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id, undefined, b)).j.gruppe.eigener, false);
  const d = await neuesKonto(env, 'Dora');
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id, undefined, d)).status, 404);
  const l = (await call(env, 'GET', '/api/gruppen', undefined, c)).j.gruppen;
  assert.deepEqual(l.map((g) => [g.id, g.name, g.mitglieder, g.ungelesen]), [[id, 'Familie Schmale', 3, 0]]);
  assert.deepEqual((await call(env, 'GET', '/api/gruppen', undefined, d)).j.gruppen, []);
});

test('Gruppen: Chat nur für Mitglieder, ungelesen, Gelesen-Markierung, Löschen eigener Nachrichten, Einladungstext', async () => {
  const env = umgebung();
  const [a, b, c] = await gruppe3(env);
  const id = (await call(env, 'POST', '/api/gruppen', { name: 'Fam', mitglieder: ['Ben'] }, a)).j.gruppe.id;
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: 'Hi' }, c)).status, 404);   // Carla ist nicht drin
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id + '/chat', undefined, c)).status, 404);
  const s1 = await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: '  Hallo zusammen  ' }, a);
  assert.deepEqual([s1.status, s1.j.nachricht.von, s1.j.nachricht.text, s1.j.nachricht.name], [200, 'ich', 'Hallo zusammen', 'Anna']);
  await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: '[einladung:spells]' }, a);
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: '' }, a)).j.fehler, 'leer');
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: 'x'.repeat(501) }, a)).j.fehler, 'zu_lang');
  // Ben: 2 ungelesen, Abzeichen-Zähler und Vorschau
  let fr = (await call(env, 'GET', '/api/freunde', undefined, b)).j;
  assert.equal(fr.chat, 2);
  assert.deepEqual([fr.gruppen[0].ungelesen, fr.gruppen[0].vorschau, fr.gruppen[0].von], [2, '[einladung:spells]', 'Anna']);
  const ug = (await call(env, 'GET', '/api/ungelesen', undefined, b)).j.von;
  assert.deepEqual([ug[0].name, ug[0].anzeige, ug[0].n, ug[0].text, ug[0].gruppe], ['#g' + id, 'Fam', 2, 'Anna: [einladung:spells]', id]);
  // Lesen ohne Markierung ändert nichts, mit gelesen=1 ist alles gelesen
  const r1 = await call(env, 'GET', '/api/gruppen/' + id + '/chat', undefined, b);
  assert.deepEqual(r1.j.nachrichten.map((m) => [m.von, m.name, m.text]), [['er', 'Anna', 'Hallo zusammen'], ['er', 'Anna', '[einladung:spells]']]);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, b)).j.chat, 2);
  await call(env, 'GET', '/api/gruppen/' + id + '/chat?gelesen=1', undefined, b);
  fr = (await call(env, 'GET', '/api/freunde', undefined, b)).j;
  assert.deepEqual([fr.chat, fr.gruppen[0].ungelesen], [0, 0]);
  // Eigene Antwort: bei Anna ungelesen, bei Ben nicht; nach=<id> liefert nur Neueres
  const s3 = await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: 'Hallo Anna' }, b);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, a)).j.chat, 1);
  assert.deepEqual((await call(env, 'GET', '/api/gruppen/' + id + '/chat?nach=' + s1.j.nachricht.id, undefined, a)).j.nachrichten.map((m) => m.text), ['[einladung:spells]', 'Hallo Anna']);
  // Löschen: nur die eigene Nachricht
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/chat/loeschen', { id: s3.j.nachricht.id }, a)).status, 404);
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/chat/loeschen', { id: s3.j.nachricht.id }, b)).status, 200);
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id + '/chat', undefined, a)).j.nachrichten.length, 2);
});

test('Gruppen: Besitzer verwaltet (hinzufügen, entfernen, umbenennen, löschen), Mitglieder dürfen nur austreten', async () => {
  const env = umgebung();
  const [a, b, c] = await gruppe3(env);
  const id = (await call(env, 'POST', '/api/gruppen', { name: 'Fam', mitglieder: ['Ben'] }, a)).j.gruppe.id;
  await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: 'Alte Nachricht' }, a);
  for (const [pfad, body] of [['mitglied', { name: 'Carla' }], ['entfernen', { name: 'Anna' }], ['umbenennen', { name: 'Neu' }], ['loeschen', {}]]) {
    assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/' + pfad, body, b)).j.fehler, 'nur_besitzer', pfad);
  }
  // Hinzufügen: nur Freunde des Besitzers, nicht doppelt; Neue sehen alte Nachrichten, aber nicht als ungelesen
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/mitglied', { name: 'Niemand' }, a)).status, 404);
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/mitglied', { name: 'Ben' }, a)).status, 409);
  const h = await call(env, 'POST', '/api/gruppen/' + id + '/mitglied', { name: 'Carla' }, a);
  assert.equal(h.j.gruppe.mitglieder.length, 3);
  assert.equal((await call(env, 'GET', '/api/freunde', undefined, c)).j.chat, 0);
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id + '/chat', undefined, c)).j.nachrichten.length, 1);
  // Umbenennen, Entfernen
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/umbenennen', { name: 'Familie' }, a)).j.gruppe.name, 'Familie');
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/umbenennen', { name: ' ' }, a)).j.fehler, 'name');
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/entfernen', { name: 'Anna' }, a)).status, 404);   // sich selbst nicht
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/entfernen', { name: 'Carla' }, a)).j.gruppe.mitglieder.length, 2);
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id, undefined, c)).status, 404);
  // Austreten: Ben geht, Anna bleibt allein; Anna löscht die Gruppe
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/verlassen', {}, b)).status, 200);
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/verlassen', {}, b)).status, 404);
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/loeschen', {}, a)).status, 200);
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id, undefined, a)).status, 404);
  const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_group_messages').first();
  assert.equal(n.n, 0);
});

test('Gruppen: Besitzer tritt aus (Besitz geht an das am längsten dabei gebliebene Mitglied, letzte Person löscht die Gruppe)', async () => {
  const env = umgebung();
  const [a, b, c] = await gruppe3(env);
  const id = (await call(env, 'POST', '/api/gruppen', { name: 'Fam', mitglieder: ['Ben', 'Carla'] }, a)).j.gruppe.id;
  await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: 'x' }, a);
  assert.equal((await call(env, 'POST', '/api/gruppen/' + id + '/verlassen', {}, a)).status, 200);
  const g = (await call(env, 'GET', '/api/gruppen/' + id, undefined, b)).j.gruppe;
  assert.deepEqual([g.eigener, g.mitglieder.filter((m) => m.besitzer).length, g.mitglieder.length], [true, 1, 2]);
  await call(env, 'POST', '/api/gruppen/' + id + '/verlassen', {}, b);
  await call(env, 'POST', '/api/gruppen/' + id + '/verlassen', {}, c);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_groups').first()).n, 0);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_group_messages').first()).n, 0);
});

test('Gruppen: Freundschaft beendet = raus aus Gruppen des anderen; Konto löschen = austreten; Grenzen', async () => {
  const env = umgebung();
  const [a, b, c] = await gruppe3(env);
  const id = (await call(env, 'POST', '/api/gruppen', { name: 'Fam', mitglieder: ['Ben', 'Carla'] }, a)).j.gruppe.id;
  await call(env, 'POST', '/api/freunde/entfernen', { name: 'Ben' }, a);
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id, undefined, b)).status, 404);
  assert.equal((await call(env, 'GET', '/api/gruppen/' + id, undefined, c)).status, 200);
  // Konto löschen: Mitgliedschaft und eigene Nachrichten verschwinden, Besitz geht weiter
  await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: 'von Carla' }, c);
  await call(env, 'POST', '/api/gruppen/' + id + '/chat', { text: 'von Anna' }, a);
  const kc = await env.DB.prepare('SELECT id FROM users WHERE name = ?').bind('Carla').first();
  assert.ok(kc);
  const gm = await env.DB.prepare('SELECT COUNT(*) AS n FROM chat_group_members WHERE group_id = ?').bind(id).first();
  assert.equal(gm.n, 2);
  // Grenzen: höchstens 12 Mitglieder
  // (die Gäste werden direkt in die Datenbank gelegt: Registrierungen sind pro Adresse begrenzt)
  const ida = (await env.DB.prepare('SELECT id FROM users WHERE name = ?').bind('Anna').first()).id, viele = [];
  for (let i = 0; i < 12; i++) {
    const n = 'Gast' + String(i).padStart(2, '0');
    const u = await env.DB.prepare('INSERT INTO users (name, name_lc, salt, hash, created) VALUES (?, ?, ?, ?, ?) RETURNING id').bind(n, n.toLowerCase(), 's', 'h', 1).first();
    await env.DB.prepare("INSERT INTO friends (a, b, requester, status, created) VALUES (?, ?, ?, 'accepted', 1)").bind(Math.min(ida, u.id), Math.max(ida, u.id), ida).run();
    viele.push(n);
  }
  assert.equal((await call(env, 'POST', '/api/gruppen', { name: 'Zu groß', mitglieder: viele }, a)).j.fehler, 'zu_viele');
  const ok = await call(env, 'POST', '/api/gruppen', { name: 'Elf', mitglieder: viele.slice(0, 11) }, a);
  assert.equal(ok.j.gruppe.mitglieder.length, 12);
  assert.equal((await call(env, 'POST', '/api/gruppen/' + ok.j.gruppe.id + '/mitglied', { name: viele[11] }, a)).j.fehler, 'zu_viele');
});
