// Konten und Cloud-Spielstände für den Hub. Läuft im selben Cloudflare-Projekt wie die statischen Dateien;
// nur Adressen unter /api/ kommen hier an (siehe wrangler.jsonc, run_worker_first).
//
// Passwörter: Der Browser rechnet aus Name und Passwort mit PBKDF2 einen Schlüssel (siehe public/konto.js) und schickt nur diesen.
// Der Server speichert davon noch einmal einen gesalzenen SHA-256. So bleibt der Rechenaufwand im Browser
// (der Server hat pro Anfrage nur sehr wenig Rechenzeit) und das Klartext-Passwort erreicht den Server nie.
import { SCHEMA } from './schema.js';

const enc = new TextEncoder();
const hex = (u8) => [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (t) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t))));
const zufall = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const gleich = (a, b) => { // zeitkonstanter Vergleich
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

export const NAME_RE = /^[\p{L}\p{N}._-]{3,20}$/u;
export const ANZEIGE_MAX = 24;
// Anzeigename: frei wählbar (nicht eindeutig), 1 bis 24 Zeichen, keine Steuerzeichen oder spitzen Klammern. Leer = Benutzernamen anzeigen.
export function anzeigeBereinigen(v) {
  if (v == null) return { wert: null };
  if (typeof v !== 'string') return { fehler: true };
  const t = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t) return { wert: null };
  if ([...t].length > ANZEIGE_MAX || /[\u0000-\u001f\u007f<>]/.test(t)) return { fehler: true };
  return { wert: t };
}
export const KEY_RE = /^[0-9a-f]{64}$/;
export const SPIEL_RE = /^[a-z0-9_-]{1,40}$/;
export const MAX_BYTES = 1900000;      // D1 erlaubt pro Zeile 2 MB
export const VERSIONEN = 6;            // so viele Stände pro Spiel bleiben höchstens erhalten (der aktuelle und bis zu 5 ältere)
export const MAX_ZEILEN = 40;         // so viele Stände pro Spiel höchstens (inklusive Tagesstände und geschützter Stände)
export const TAGE = 14;               // so viele Kalendertage zurück bleibt je Tag der letzte Stand erhalten
const SCHRUMPF = 0.4, SCHRUMPF_AB = 3000;   // ein Stand über 3000 Byte ist geschützt, wenn danach einer unter 40 % seiner Größe kam
// Solange die Spielstände nicht zwischen Geräten abgeglichen werden, gilt ein Konto nur auf dem Gerät, auf dem es erstellt wurde
// (sonst loggt man sich woanders ein und hat dort keine Stände). Zum Aufheben später auf false setzen.
// Ein einzelnes Konto wieder freigeben: node tools/lgh-geraet.mjs <Name>
export const EIN_GERAET = true;
const GID_RE = /^[0-9a-f]{32}$/;
const gidVon = (v) => (typeof v === 'string' && GID_RE.test(v) ? v : null);
export const ABSTAND = 1800;           // ältere Stände werden höchstens alle 30 Minuten festgehalten, sonst gäbe es nach wenigen Minuten Spielzeit nur noch ganz junge
const SITZUNG_TAGE = 400;
export const NAME_SPERRE = 7 * 86400;  // der Benutzername (@name) lässt sich höchstens einmal pro Woche ändern

const antwort = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const fehler = (status, code, extra) => antwort({ fehler: code, ...(extra || {}) }, status);

const schemaFertig = new WeakMap();
function schemaSichern(db) {
  if (!schemaFertig.has(db)) schemaFertig.set(db, (async () => {
    await db.batch(SCHEMA.map((s) => db.prepare(s)));
    // Ältere Datenbanken haben noch keine Spalte für den Anzeigenamen (NULL = Benutzername wird angezeigt)
    const spalten = await db.prepare('PRAGMA table_info(users)').all();
    if (!spalten.results.some((c) => c.name === 'display')) {
      try { await db.prepare('ALTER TABLE users ADD COLUMN display TEXT').run(); } catch (e) { /* parallel schon angelegt */ }
    }
    // Kennung des Geräts, auf dem das Konto erstellt wurde (solange EIN_GERAET gilt)
    if (!spalten.results.some((c) => c.name === 'device_id')) {
      try { await db.prepare('ALTER TABLE users ADD COLUMN device_id TEXT').run(); } catch (e) { /* parallel schon angelegt */ }
    }
    // Zeitpunkt der letzten Änderung des Benutzernamens (NULL = nie geändert)
    if (!spalten.results.some((c) => c.name === 'name_changed')) {
      try { await db.prepare('ALTER TABLE users ADD COLUMN name_changed INTEGER').run(); } catch (e) { /* parallel schon angelegt */ }
    }
  })().catch((e) => { schemaFertig.delete(db); throw e; }));
  return schemaFertig.get(db);
}

/* ---------- Begrenzungen ---------- */
async function gesperrt(db, k, jetzt) {
  const r = await db.prepare('SELECT until FROM limits WHERE k = ?').bind(k).first();
  return r && r.until > jetzt ? r.until - jetzt : 0;
}
async function zaehle(db, k, jetzt, grenze, sperre, fenster) {
  const r = await db.prepare('SELECT n, until, t FROM limits WHERE k = ?').bind(k).first();
  let n = 1, t = jetzt;
  if (r && jetzt - r.t < fenster) { n = r.n + 1; t = r.t; }
  const until = n >= grenze ? jetzt + sperre * Math.min(8, 2 ** Math.floor((n - grenze) / 2)) : 0;
  await db.prepare('INSERT INTO limits (k, n, until, t) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, until = excluded.until, t = excluded.t')
    .bind(k, n, until, t).run();
}
const vergiss = (db, k) => db.prepare('DELETE FROM limits WHERE k = ?').bind(k).run();

/* ---------- Hilfen ---------- */
async function lies(request) {
  try {
    const t = await request.text();
    if (t.length > MAX_BYTES + 5000) return { zuGross: true };
    return { b: JSON.parse(t) };
  } catch (e) { return { b: null }; }
}
const ip = (request) => request.headers.get('cf-connecting-ip') || 'lokal';

async function sitzung(request, db, jetzt) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get('authorization') || '');
  if (!m) return null;
  const th = await sha256(m[1]);
  const s = await db.prepare('SELECT s.user_id AS id, s.last AS last, u.name AS name, u.display AS display, u.device_id AS gid FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(th).first();
  if (!s) return null;
  if (jetzt - s.last > SITZUNG_TAGE * 86400) { await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run(); return null; }
  if (jetzt - s.last > 3600) await db.prepare('UPDATE sessions SET last = ? WHERE token_hash = ?').bind(jetzt, th).run();
  // Konten ohne Gerätekennung (vor dieser Funktion erstellt) werden an das Gerät gebunden, das sich als erstes meldet. Bestehende Anmeldungen bleiben.
  if (EIN_GERAET && !s.gid) {
    const g = gidVon(request.headers.get('x-geraet'));
    if (g) await db.prepare('UPDATE users SET device_id = ? WHERE id = ? AND device_id IS NULL').bind(g, s.id).run();
  }
  return { id: s.id, name: s.name, anzeige: s.display || s.name, th };
}
async function neueSitzung(db, userId, geraet, jetzt) {
  const token = zufall(32);
  await db.prepare('INSERT INTO sessions (token_hash, user_id, created, last, device) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256(token), userId, jetzt, jetzt, geraet || null).run();
  return token;
}
const geraetName = (g) => (typeof g === 'string' ? g.slice(0, 40) : '') || null;

/* ---------- Konto ---------- */
async function registrieren(request, db, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.name !== 'string' || !NAME_RE.test(b.name.normalize('NFC'))) return fehler(400, 'name');
  if (typeof b.key !== 'string' || !KEY_RE.test(b.key)) return fehler(400, 'schluessel');
  const az = anzeigeBereinigen(b.anzeige);
  if (az.fehler) return fehler(400, 'anzeige');
  const rk = 'r:' + ip(request);
  const warte = await gesperrt(db, rk, jetzt);
  if (warte) return fehler(429, 'zu_viele', { warte });
  const name = b.name.normalize('NFC'), lc = name.toLowerCase();
  const vorhanden = await db.prepare('SELECT 1 AS x FROM users WHERE name_lc = ?').bind(lc).first();
  if (vorhanden) return fehler(409, 'name_vergeben');
  await zaehle(db, rk, jetzt, 10, 3600, 3600);
  const salt = zufall(16);
  const hash = await sha256(salt + ':' + b.key);
  let id;
  try {
    const r = await db.prepare('INSERT INTO users (name, name_lc, salt, hash, created, display, device_id) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(name, lc, salt, hash, jetzt, az.wert, gidVon(b.gid)).run();
    id = r.meta && r.meta.last_row_id;
    if (!id) id = (await db.prepare('SELECT id FROM users WHERE name_lc = ?').bind(lc).first()).id;
  } catch (e) { return fehler(409, 'name_vergeben'); }
  const token = await neueSitzung(db, id, geraetName(b.geraet), jetzt);
  return antwort({ token, name, anzeige: az.wert || name });
}

async function pruefeSchluessel(db, userName, key, jetzt, request) {
  const lc = userName.toLowerCase();
  const kn = 'l:' + lc, ki = 'i:' + ip(request);
  const warte = Math.max(await gesperrt(db, kn, jetzt), await gesperrt(db, ki, jetzt));
  if (warte) return { fehler: fehler(429, 'zu_viele', { warte }) };
  const u = await db.prepare('SELECT id, name, display, salt, hash, device_id, name_changed FROM users WHERE name_lc = ?').bind(lc).first();
  // Auch bei unbekanntem Namen gleich viel rechnen, damit man nicht erkennt, welche Namen es gibt
  const h = await sha256((u ? u.salt : 'x'.repeat(32)) + ':' + key);
  if (!u || !gleich(h, u.hash)) {
    await zaehle(db, kn, jetzt, 5, 30, 900);
    await zaehle(db, ki, jetzt, 30, 300, 900);
    return { fehler: fehler(401, 'login') };
  }
  await vergiss(db, kn);
  return { user: u };
}

async function anmelden(request, db, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.name !== 'string' || typeof b.key !== 'string' || !KEY_RE.test(b.key)) return fehler(400, 'eingabe');
  const r = await pruefeSchluessel(db, b.name.normalize('NFC'), b.key, jetzt, request);
  if (r.fehler) return r.fehler;
  if (EIN_GERAET) {
    // Das Passwort stimmt: Das Konto gehört nur zu dem Gerät, auf dem es erstellt wurde
    const g = gidVon(b.gid);
    if (r.user.device_id && g !== r.user.device_id) return fehler(403, 'anderes_geraet');
    if (!r.user.device_id && g) await db.prepare('UPDATE users SET device_id = ? WHERE id = ? AND device_id IS NULL').bind(g, r.user.id).run();
  }
  const token = await neueSitzung(db, r.user.id, geraetName(b.geraet), jetzt);
  return antwort({ token, name: r.user.name, anzeige: r.user.display || r.user.name });
}

async function passwortAendern(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.key !== 'string' || typeof b.neu !== 'string' || !KEY_RE.test(b.key) || !KEY_RE.test(b.neu)) return fehler(400, 'eingabe');
  const r = await pruefeSchluessel(db, s.name, b.key, jetzt, request);
  if (r.fehler) return r.fehler;
  const salt = zufall(16);
  await db.batch([
    db.prepare('UPDATE users SET salt = ?, hash = ? WHERE id = ?').bind(salt, await sha256(salt + ':' + b.neu), s.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(s.id, s.th), // andere Geräte müssen sich neu anmelden
  ]);
  return antwort({ ok: true });
}

// Benutzernamen (@name) ändern: höchstens einmal pro Woche und nur auf einen freien Namen.
// Der Anmeldeschlüssel hängt vom Namen ab, darum schickt der Browser das Passwort doppelt (alt: bisheriger Name, neu: neuer Name).
async function benutzernameAendern(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.name !== 'string' || !NAME_RE.test(b.name.normalize('NFC'))) return fehler(400, 'name');
  if (typeof b.key !== 'string' || typeof b.neu !== 'string' || !KEY_RE.test(b.key) || !KEY_RE.test(b.neu)) return fehler(400, 'eingabe');
  const name = b.name.normalize('NFC'), lc = name.toLowerCase();
  const r = await pruefeSchluessel(db, s.name, b.key, jetzt, request);
  if (r.fehler) return r.fehler;
  if (name === r.user.name) return fehler(400, 'name_gleich');
  if (r.user.name_changed && jetzt - r.user.name_changed < NAME_SPERRE) return fehler(429, 'zu_frueh', { warte: r.user.name_changed + NAME_SPERRE - jetzt });
  const belegt = await db.prepare('SELECT 1 AS x FROM users WHERE name_lc = ? AND id != ?').bind(lc, s.id).first();
  if (belegt) return fehler(409, 'name_vergeben');
  const salt = zufall(16);
  try {
    await db.prepare('UPDATE users SET name = ?, name_lc = ?, salt = ?, hash = ?, name_changed = ? WHERE id = ?').bind(name, lc, salt, await sha256(salt + ':' + b.neu), jetzt, s.id).run();
  } catch (e) { return fehler(409, 'name_vergeben'); }
  // Angemeldete Geräte bleiben angemeldet (die Sitzung hängt an der Konto-Nummer, nicht am Namen)
  return antwort({ ok: true, name, anzeige: r.user.display || name });
}

async function anzeigeAendern(request, db, s) {
  const { b } = await lies(request);
  if (!b) return fehler(400, 'eingabe');
  const az = anzeigeBereinigen(b.anzeige);
  if (az.fehler) return fehler(400, 'anzeige');
  await db.prepare('UPDATE users SET display = ? WHERE id = ?').bind(az.wert, s.id).run();
  return antwort({ ok: true, name: s.name, anzeige: az.wert || s.name });
}

async function kontoLoeschen(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.key !== 'string' || !KEY_RE.test(b.key)) return fehler(400, 'eingabe');
  const r = await pruefeSchluessel(db, s.name, b.key, jetzt, request);
  if (r.fehler) return r.fehler;
  await db.batch([
    db.prepare('DELETE FROM saves WHERE user_id = ?').bind(s.id),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(s.id),
    db.prepare('DELETE FROM friends WHERE a = ? OR b = ?').bind(s.id, s.id),
    db.prepare('DELETE FROM presence WHERE user_id = ?').bind(s.id),
    db.prepare('DELETE FROM playtime WHERE user_id = ?').bind(s.id),
    db.prepare('DELETE FROM users WHERE id = ?').bind(s.id),
  ]);
  return antwort({ ok: true });
}

/* ---------- Spielstände ---------- */
const meta = (r) => ({ spiel: r.game, rev: r.rev, aktualisiert: r.updated, geraet: r.device, groesse: r.size });

async function liste(db, s) {
  const r = await db.prepare(
    'SELECT game, rev, updated, device, size FROM saves WHERE user_id = ? AND rev = (SELECT MAX(rev) FROM saves x WHERE x.user_id = saves.user_id AND x.game = saves.game) ORDER BY game'
  ).bind(s.id).all();
  return antwort({ staende: r.results.map(meta) });
}

async function holen(db, s, spiel, rev) {
  const r = rev
    ? await db.prepare('SELECT game, rev, data, size, updated, device FROM saves WHERE user_id = ? AND game = ? AND rev = ?').bind(s.id, spiel, rev).first()
    : await db.prepare('SELECT game, rev, data, size, updated, device FROM saves WHERE user_id = ? AND game = ? ORDER BY rev DESC LIMIT 1').bind(s.id, spiel).first();
  if (!r) return fehler(404, 'leer');
  return antwort({ ...meta(r), daten: r.data });
}

async function versionen(db, s, spiel) {
  const r = await db.prepare('SELECT game, rev, updated, device, size FROM saves WHERE user_id = ? AND game = ? ORDER BY rev DESC').bind(s.id, spiel).all();
  return antwort({ versionen: r.results.map(meta) });
}

// Welche Stände bleiben erhalten (neuester zuerst):
//  - der aktuelle und bis zu 5 ältere; ein älterer wird höchstens alle 30 Minuten festgehalten (der letzte seines Fensters),
//  - je Kalendertag (UTC) der letzte Stand der vergangenen 14 Tage (Tagesstände),
//  - jeder Stand, nach dem ein plötzlich viel kleinerer kam (unter 40 %, etwa durch einen Fehler oder leeren Neustart des Spiels),
//  - bei "behalten" (bewusstes Überschreiben) der verdrängte Stand.
// Höchstens MAX_ZEILEN pro Spiel. Dadurch kann auch ein Fehler, der stundenlang leere Stände meldet, die guten nicht verdrängen.
async function ausduennen(db, userId, spiel, behalten) {
  const r = (await db.prepare('SELECT rev, updated, size FROM saves WHERE user_id = ? AND game = ? ORDER BY rev DESC').bind(userId, spiel).all()).results;
  if (r.length < 2) return;
  const schutz = new Set();
  const tag = (x) => Math.floor(x.updated / 86400), heute = tag(r[0]), tage = new Set();
  for (const x of r) if (heute - tag(x) <= TAGE && !tage.has(tag(x))) { tage.add(tag(x)); schutz.add(x.rev); }
  for (let i = 1; i < r.length; i++) if (r[i].size > SCHRUMPF_AB && r[i - 1].size < r[i].size * SCHRUMPF) schutz.add(r[i].rev);
  const fenster = Math.floor(r[0].updated / ABSTAND) === Math.floor(r[1].updated / ABSTAND);
  const behalte = [];
  for (let i = 0; i < r.length; i++) {
    const x = r[i];
    let bleibt = i === 0 || schutz.has(x.rev);
    if (!bleibt && i < VERSIONEN) bleibt = !(i === 1 && fenster && !behalten);
    if (bleibt) behalte.push(x.rev);
  }
  const weg = r.map((x) => x.rev).filter((rev) => !behalte.includes(rev) || behalte.indexOf(rev) >= MAX_ZEILEN);
  if (weg.length) await db.batch(weg.map((rev) => db.prepare('DELETE FROM saves WHERE user_id = ? AND game = ? AND rev = ?').bind(userId, spiel, rev)));
}

async function speichern(request, db, s, spiel, jetzt) {
  const l = await lies(request);
  if (l.zuGross) return fehler(413, 'zu_gross');
  const b = l.b;
  if (!b || typeof b.daten !== 'string' || !b.daten) return fehler(400, 'eingabe');
  const groesse = enc.encode(b.daten).length;
  if (groesse > MAX_BYTES) return fehler(413, 'zu_gross', { max: MAX_BYTES });
  const basis = Number.isInteger(b.basis) && b.basis >= 0 ? b.basis : null;
  if (basis === null && !b.erzwingen) return fehler(400, 'eingabe');
  const geraet = geraetName(b.geraet);

  for (let versuch = 0; versuch < 2; versuch++) {
    const cur = await db.prepare('SELECT game, rev, data, size, updated, device FROM saves WHERE user_id = ? AND game = ? ORDER BY rev DESC LIMIT 1').bind(s.id, spiel).first();
    const curRev = cur ? cur.rev : 0;
    if (!b.erzwingen && basis !== curRev) return fehler(409, 'konflikt', { aktuell: cur ? meta(cur) : null });
    if (cur && cur.data === b.daten) return antwort({ rev: curRev, gleich: true, aktualisiert: cur.updated });
    const neu = curRev + 1;
    const r = await db.prepare(
      `INSERT INTO saves (user_id, game, rev, data, size, updated, device)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE COALESCE((SELECT MAX(rev) FROM saves WHERE user_id = ? AND game = ?), 0) = ?`
    ).bind(s.id, spiel, neu, b.daten, groesse, jetzt, geraet, s.id, spiel, curRev).run();
    if (r.meta && r.meta.changes === 1) {
      await ausduennen(db, s.id, spiel, !!b.behalten);
      return antwort({ rev: neu, aktualisiert: jetzt });
    }
    // Zwischen Lesen und Schreiben hat ein anderes Gerät gespeichert: noch einmal prüfen (bei erzwingen wird neu aufgesetzt)
  }
  return fehler(409, 'konflikt');
}

/* ---------- Freunde ---------- */
export const ONLINE_SEKUNDEN = 100;     // so lange nach dem letzten Herzschlag gilt jemand als online
const MAX_FREUNDE = 50, MAX_OFFEN = 20;
const paar = (x, y) => (x < y ? [x, y] : [y, x]);

async function suche(db, name) {
  if (typeof name !== 'string') return null;
  const n = name.normalize('NFC').trim().replace(/^@/, '');   // "@leif" und "leif" meinen denselben Benutzernamen
  return db.prepare('SELECT id, name, display FROM users WHERE name_lc = ?').bind(n.toLowerCase()).first();
}

async function freundeListe(db, s, jetzt) {
  const r = await db.prepare(
    `SELECT u.name AS name, u.display AS display, f.status AS status, f.requester AS requester, p.game AS game, p.raum AS raum, p.seen AS seen
     FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
     LEFT JOIN presence p ON p.user_id = u.id
     WHERE f.a = ? OR f.b = ? ORDER BY lower(COALESCE(u.display, u.name))`
  ).bind(s.id, s.id, s.id).all();
  const freunde = [], eingehend = [], ausgehend = [];
  for (const x of r.results) {
    if (x.status === 'accepted') {
      const online = !!x.seen && jetzt - x.seen < ONLINE_SEKUNDEN;
      freunde.push({ name: x.name, anzeige: x.display || x.name, online, spiel: online ? x.game || null : null, raum: online && x.game ? x.raum || null : null, zuletzt: x.seen || null });
    } else if (x.requester === s.id) ausgehend.push({ name: x.name, anzeige: x.display || x.name });
    else eingehend.push({ name: x.name, anzeige: x.display || x.name });
  }
  return antwort({ freunde, eingehend, ausgehend, jetzt });
}

async function freundAnfrage(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b) return fehler(400, 'eingabe');
  const k = 'f:' + s.id;
  const warte = await gesperrt(db, k, jetzt);
  if (warte) return fehler(429, 'zu_viele', { warte });
  const ziel = await suche(db, b.name);
  await zaehle(db, k, jetzt, 20, 3600, 3600);
  if (!ziel) return fehler(404, 'unbekannter_name');
  if (ziel.id === s.id) return fehler(400, 'selbst');
  const [x, y] = paar(s.id, ziel.id);
  const alt = await db.prepare('SELECT requester, status FROM friends WHERE a = ? AND b = ?').bind(x, y).first();
  if (alt) {
    if (alt.status === 'accepted') return fehler(409, 'schon_freunde');
    if (alt.requester === s.id) return fehler(409, 'schon_angefragt');
    await db.prepare("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?").bind(x, y).run(); // er hatte schon angefragt: gegenseitig
    return antwort({ ok: true, freunde: true, name: ziel.name, anzeige: ziel.display || ziel.name });
  }
  const zaehl = await db.prepare("SELECT COUNT(*) AS n FROM friends WHERE (a = ? OR b = ?) AND (status = 'accepted' OR requester = ?)").bind(s.id, s.id, s.id).first();
  if (zaehl.n >= MAX_FREUNDE) return fehler(409, 'zu_viele_freunde');
  const offen = await db.prepare("SELECT COUNT(*) AS n FROM friends WHERE requester = ? AND status = 'pending'").bind(s.id).first();
  if (offen.n >= MAX_OFFEN) return fehler(409, 'zu_viele_offen');
  await db.prepare("INSERT INTO friends (a, b, requester, status, created) VALUES (?, ?, ?, 'pending', ?)").bind(x, y, s.id, jetzt).run();
  return antwort({ ok: true, freunde: false, name: ziel.name, anzeige: ziel.display || ziel.name });
}

async function freundAnnehmen(request, db, s) {
  const { b } = await lies(request);
  const ziel = b && await suche(db, b.name);
  if (!ziel) return fehler(404, 'unbekannter_name');
  const [x, y] = paar(s.id, ziel.id);
  const r = await db.prepare("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ? AND status = 'pending' AND requester = ?").bind(x, y, ziel.id).run();
  if (!r.meta || r.meta.changes !== 1) return fehler(404, 'keine_anfrage');
  return antwort({ ok: true });
}

// Ablehnen einer eingehenden Anfrage, Zurückziehen einer ausgehenden und Entfernen eines Freundes: der Eintrag verschwindet
async function freundLoeschen(request, db, s, nurAnfrage) {
  const { b } = await lies(request);
  const ziel = b && await suche(db, b.name);
  if (!ziel) return fehler(404, 'unbekannter_name');
  const [x, y] = paar(s.id, ziel.id);
  const r = await db.prepare(`DELETE FROM friends WHERE a = ? AND b = ?${nurAnfrage ? " AND status = 'pending'" : ''}`).bind(x, y).run();
  if (!r.meta || r.meta.changes !== 1) return fehler(404, 'nicht_gefunden');
  return antwort({ ok: true });
}

async function praesenz(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b) return fehler(400, 'eingabe');
  let spiel = null, raum = null, seen = jetzt;
  // Abmelden: sofort offline, aber der Zeitpunkt bleibt als "zuletzt online" erhalten (knapp außerhalb des Online-Fensters)
  if (b.offline) seen = jetzt - ONLINE_SEKUNDEN;
  else {
    if (b.spiel != null) { if (typeof b.spiel !== 'string' || !SPIEL_RE.test(b.spiel)) return fehler(400, 'spiel'); spiel = b.spiel; }
    if (b.raum != null) {
      if (typeof b.raum !== 'string' || b.raum.length > 40 || /[\u0000-\u001f<>]/.test(b.raum)) return fehler(400, 'raum');
      raum = b.raum || null;
    }
  }
  // Spielzeit: Liegt der letzte Herzschlag im selben Spiel höchstens 150 Sekunden zurück, zählt der Abstand dazu (der Hub meldet etwa alle 45 Sekunden)
  let dazu = 0;
  if (spiel && !b.offline) {
    const vor = await db.prepare('SELECT game, seen FROM presence WHERE user_id = ?').bind(s.id).first();
    if (vor && vor.game === spiel && jetzt - vor.seen > 0 && jetzt - vor.seen <= 150) dazu = jetzt - vor.seen;
  }
  const stmts = [db.prepare('INSERT INTO presence (user_id, game, raum, seen) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET game = excluded.game, raum = excluded.raum, seen = excluded.seen')
    .bind(s.id, spiel, raum, seen)];
  if (spiel && !b.offline) stmts.push(db.prepare('INSERT INTO playtime (user_id, game, seconds, last) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, game) DO UPDATE SET seconds = seconds + excluded.seconds, last = excluded.last').bind(s.id, spiel, dazu, jetzt));
  await db.batch(stmts);
  return antwort({ ok: true });
}

/* ---------- Profil ---------- */
// Eigenes Profil und das von Freunden. Fremde ohne Freundschaft sehen nichts (404, wie bei unbekanntem Namen).
async function profil(db, s, name, jetzt) {
  let u;
  name = name ? name.replace(/^@/, '') : name;
  if (!name || name.toLowerCase() === s.name.toLowerCase()) u = { id: s.id, name: s.name, display: s.anzeige !== s.name ? s.anzeige : null };
  else {
    const z = await suche(db, name);
    if (!z) return fehler(404, 'unbekannt');
    const [x, y] = paar(s.id, z.id);
    const f = await db.prepare('SELECT status FROM friends WHERE a = ? AND b = ?').bind(x, y).first();
    if (!f || f.status !== 'accepted') return fehler(404, 'unbekannt');
    u = z;
  }
  const row = await db.prepare('SELECT created FROM users WHERE id = ?').bind(u.id).first();
  const zeit = (await db.prepare('SELECT game, seconds, last FROM playtime WHERE user_id = ? ORDER BY last DESC').bind(u.id).all()).results;
  const fr = await db.prepare("SELECT COUNT(*) AS n FROM friends WHERE (a = ? OR b = ?) AND status = 'accepted'").bind(u.id, u.id).first();
  const p = await db.prepare('SELECT game, seen FROM presence WHERE user_id = ?').bind(u.id).first();
  const online = !!p && !!p.seen && jetzt - p.seen < ONLINE_SEKUNDEN;
  const eigen = u.id === s.id;
  const out = {
    name: u.name, anzeige: u.display || u.name, seit: row ? row.created : null, eigen,
    freunde: fr ? fr.n : 0, online, spiel: online ? p.game || null : null, zuletzt: p ? p.seen : null,
    spiele: zeit.map((t) => ({ spiel: t.game, sekunden: t.seconds, zuletzt: t.last })),
  };
  if (eigen) {
    const st = await db.prepare('SELECT game, COUNT(*) AS n, MAX(updated) AS neu FROM saves WHERE user_id = ? GROUP BY game').bind(u.id).all();
    out.staende = st.results.map((t) => ({ spiel: t.game, versionen: t.n, aktualisiert: t.neu }));
  }
  return antwort(out);
}

/* ---------- Verteilung ---------- */
export async function handle(request, env, jetztMs = Date.now()) {
  const url = new URL(request.url);
  const pfad = url.pathname;
  if (!pfad.startsWith('/api/')) return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Nicht gefunden', { status: 404 });
  const jetzt = Math.floor(jetztMs / 1000);
  const m = request.method;

  // Anfragen von fremden Seiten sind nicht vorgesehen
  const origin = request.headers.get('origin');
  if (origin && m !== 'GET' && m !== 'HEAD') {
    try { if (new URL(origin).host !== url.host) return fehler(403, 'herkunft'); } catch (e) { return fehler(403, 'herkunft'); }
  }
  try {
    await schemaSichern(env.DB);
    const db = env.DB;
    if (pfad === '/api/ping') return antwort({ ok: true });
    if (pfad === '/api/registrieren' && m === 'POST') return await registrieren(request, db, jetzt);
    if (pfad === '/api/anmelden' && m === 'POST') return await anmelden(request, db, jetzt);

    const s = await sitzung(request, db, jetzt);
    if (!s) return fehler(401, 'nicht_angemeldet');

    if (pfad === '/api/ich' && m === 'GET') return antwort({ name: s.name, anzeige: s.anzeige });
    if (pfad === '/api/anzeige' && m === 'POST') return await anzeigeAendern(request, db, s);
    if (pfad === '/api/abmelden' && m === 'POST') { await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(s.th).run(); return antwort({ ok: true }); }
    if (pfad === '/api/benutzername' && m === 'POST') return await benutzernameAendern(request, db, s, jetzt);
    if (pfad === '/api/passwort' && m === 'POST') return await passwortAendern(request, db, s, jetzt);
    if (pfad === '/api/loeschen' && m === 'POST') return await kontoLoeschen(request, db, s, jetzt);
    if (pfad === '/api/staende' && m === 'GET') return await liste(db, s);
    if (pfad === '/api/freunde' && m === 'GET') return await freundeListe(db, s, jetzt);
    if (pfad === '/api/freunde/anfrage' && m === 'POST') return await freundAnfrage(request, db, s, jetzt);
    if (pfad === '/api/freunde/annehmen' && m === 'POST') return await freundAnnehmen(request, db, s);
    if (pfad === '/api/freunde/ablehnen' && m === 'POST') return await freundLoeschen(request, db, s, true);
    if (pfad === '/api/freunde/entfernen' && m === 'POST') return await freundLoeschen(request, db, s, false);
    if (pfad === '/api/praesenz' && m === 'POST') return await praesenz(request, db, s, jetzt);
    if (pfad === '/api/profil' && m === 'GET') return await profil(db, s, null, jetzt);
    const pm = /^\/api\/profil\/([^/]+)$/.exec(pfad);
    if (pm && m === 'GET') { let n; try { n = decodeURIComponent(pm[1]); } catch (e) { return fehler(400, 'eingabe'); } return await profil(db, s, n, jetzt); }

    const sp = /^\/api\/stand\/([^/]+)(?:\/(versionen))?$/.exec(pfad);
    if (sp) {
      const spiel = sp[1];
      if (!SPIEL_RE.test(spiel)) return fehler(400, 'spiel');
      if (sp[2] === 'versionen' && m === 'GET') return await versionen(db, s, spiel);
      if (!sp[2] && m === 'GET') {
        const rev = parseInt(url.searchParams.get('rev') || '0', 10) || 0;
        return await holen(db, s, spiel, rev);
      }
      if (!sp[2] && m === 'PUT') return await speichern(request, db, s, spiel, jetzt);
    }
    return fehler(404, 'unbekannt');
  } catch (e) {
    return fehler(500, 'server');
  }
}
