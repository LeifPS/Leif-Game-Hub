var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/schema.js
var SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_lc TEXT NOT NULL UNIQUE,
    salt TEXT NOT NULL,
    hash TEXT NOT NULL,
    created INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created INTEGER NOT NULL,
    last INTEGER NOT NULL,
    device TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  // Jede Speicherung ist eine neue Version (rev); es bleiben die letzten 5 pro Spiel erhalten.
  `CREATE TABLE IF NOT EXISTS saves (
    user_id INTEGER NOT NULL,
    game TEXT NOT NULL,
    rev INTEGER NOT NULL,
    data TEXT NOT NULL,
    size INTEGER NOT NULL,
    updated INTEGER NOT NULL,
    device TEXT,
    PRIMARY KEY (user_id, game, rev)
  )`,
  // Freundschaften: ein Eintrag pro Paar (a < b), requester hat die Anfrage gestellt
  `CREATE TABLE IF NOT EXISTS friends (
    a INTEGER NOT NULL,
    b INTEGER NOT NULL,
    requester INTEGER NOT NULL,
    status TEXT NOT NULL,
    created INTEGER NOT NULL,
    PRIMARY KEY (a, b)
  )`,
  `CREATE INDEX IF NOT EXISTS friends_b ON friends(b)`,
  // Wer ist gerade in welchem Spiel (nur für Freunde sichtbar); seen = letzter Herzschlag des Hubs
  `CREATE TABLE IF NOT EXISTS presence (
    user_id INTEGER PRIMARY KEY,
    game TEXT,
    raum TEXT,
    seen INTEGER NOT NULL
  )`,
  // Zähler gegen Raten von Passwörtern und Massenanmeldungen
  `CREATE TABLE IF NOT EXISTS limits (
    k TEXT PRIMARY KEY,
    n INTEGER NOT NULL,
    until INTEGER NOT NULL,
    t INTEGER NOT NULL
  )`
];

// src/konten.js
var enc = new TextEncoder();
var hex = /* @__PURE__ */ __name((u8) => [...u8].map((b) => b.toString(16).padStart(2, "0")).join(""), "hex");
var sha256 = /* @__PURE__ */ __name(async (t) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(t)))), "sha256");
var zufall = /* @__PURE__ */ __name((n) => hex(crypto.getRandomValues(new Uint8Array(n))), "zufall");
var gleich = /* @__PURE__ */ __name((a, b) => {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}, "gleich");
var NAME_RE = /^[\p{L}\p{N}._-]{3,20}$/u;
var KEY_RE = /^[0-9a-f]{64}$/;
var SPIEL_RE = /^[a-z0-9_-]{1,40}$/;
var MAX_BYTES = 19e5;
var VERSIONEN = 6;
var ABSTAND = 1800;
var SITZUNG_TAGE = 400;
var antwort = /* @__PURE__ */ __name((obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
}), "antwort");
var fehler = /* @__PURE__ */ __name((status, code, extra) => antwort({ fehler: code, ...extra || {} }, status), "fehler");
var schemaFertig = /* @__PURE__ */ new WeakMap();
function schemaSichern(db) {
  if (!schemaFertig.has(db)) schemaFertig.set(db, db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => {
    schemaFertig.delete(db);
    throw e;
  }));
  return schemaFertig.get(db);
}
__name(schemaSichern, "schemaSichern");
async function gesperrt(db, k, jetzt) {
  const r = await db.prepare("SELECT until FROM limits WHERE k = ?").bind(k).first();
  return r && r.until > jetzt ? r.until - jetzt : 0;
}
__name(gesperrt, "gesperrt");
async function zaehle(db, k, jetzt, grenze, sperre, fenster) {
  const r = await db.prepare("SELECT n, until, t FROM limits WHERE k = ?").bind(k).first();
  let n = 1, t = jetzt;
  if (r && jetzt - r.t < fenster) {
    n = r.n + 1;
    t = r.t;
  }
  const until = n >= grenze ? jetzt + sperre * Math.min(8, 2 ** Math.floor((n - grenze) / 2)) : 0;
  await db.prepare("INSERT INTO limits (k, n, until, t) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET n = excluded.n, until = excluded.until, t = excluded.t").bind(k, n, until, t).run();
}
__name(zaehle, "zaehle");
var vergiss = /* @__PURE__ */ __name((db, k) => db.prepare("DELETE FROM limits WHERE k = ?").bind(k).run(), "vergiss");
async function lies(request) {
  try {
    const t = await request.text();
    if (t.length > MAX_BYTES + 5e3) return { zuGross: true };
    return { b: JSON.parse(t) };
  } catch (e) {
    return { b: null };
  }
}
__name(lies, "lies");
var ip = /* @__PURE__ */ __name((request) => request.headers.get("cf-connecting-ip") || "lokal", "ip");
async function sitzung(request, db, jetzt) {
  const m = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") || "");
  if (!m) return null;
  const th = await sha256(m[1]);
  const s = await db.prepare("SELECT s.user_id AS id, s.last AS last, u.name AS name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?").bind(th).first();
  if (!s) return null;
  if (jetzt - s.last > SITZUNG_TAGE * 86400) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(th).run();
    return null;
  }
  if (jetzt - s.last > 3600) await db.prepare("UPDATE sessions SET last = ? WHERE token_hash = ?").bind(jetzt, th).run();
  return { id: s.id, name: s.name, th };
}
__name(sitzung, "sitzung");
async function neueSitzung(db, userId, geraet, jetzt) {
  const token = zufall(32);
  await db.prepare("INSERT INTO sessions (token_hash, user_id, created, last, device) VALUES (?, ?, ?, ?, ?)").bind(await sha256(token), userId, jetzt, jetzt, geraet || null).run();
  return token;
}
__name(neueSitzung, "neueSitzung");
var geraetName = /* @__PURE__ */ __name((g) => (typeof g === "string" ? g.slice(0, 40) : "") || null, "geraetName");
async function registrieren(request, db, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.name !== "string" || !NAME_RE.test(b.name.normalize("NFC"))) return fehler(400, "name");
  if (typeof b.key !== "string" || !KEY_RE.test(b.key)) return fehler(400, "schluessel");
  const rk = "r:" + ip(request);
  const warte = await gesperrt(db, rk, jetzt);
  if (warte) return fehler(429, "zu_viele", { warte });
  const name = b.name.normalize("NFC"), lc = name.toLowerCase();
  const vorhanden = await db.prepare("SELECT 1 AS x FROM users WHERE name_lc = ?").bind(lc).first();
  if (vorhanden) return fehler(409, "name_vergeben");
  await zaehle(db, rk, jetzt, 10, 3600, 3600);
  const salt = zufall(16);
  const hash = await sha256(salt + ":" + b.key);
  let id;
  try {
    const r = await db.prepare("INSERT INTO users (name, name_lc, salt, hash, created) VALUES (?, ?, ?, ?, ?)").bind(name, lc, salt, hash, jetzt).run();
    id = r.meta && r.meta.last_row_id;
    if (!id) id = (await db.prepare("SELECT id FROM users WHERE name_lc = ?").bind(lc).first()).id;
  } catch (e) {
    return fehler(409, "name_vergeben");
  }
  const token = await neueSitzung(db, id, geraetName(b.geraet), jetzt);
  return antwort({ token, name });
}
__name(registrieren, "registrieren");
async function pruefeSchluessel(db, userName, key, jetzt, request) {
  const lc = userName.toLowerCase();
  const kn = "l:" + lc, ki = "i:" + ip(request);
  const warte = Math.max(await gesperrt(db, kn, jetzt), await gesperrt(db, ki, jetzt));
  if (warte) return { fehler: fehler(429, "zu_viele", { warte }) };
  const u = await db.prepare("SELECT id, name, salt, hash FROM users WHERE name_lc = ?").bind(lc).first();
  const h = await sha256((u ? u.salt : "x".repeat(32)) + ":" + key);
  if (!u || !gleich(h, u.hash)) {
    await zaehle(db, kn, jetzt, 5, 30, 900);
    await zaehle(db, ki, jetzt, 30, 300, 900);
    return { fehler: fehler(401, "login") };
  }
  await vergiss(db, kn);
  return { user: u };
}
__name(pruefeSchluessel, "pruefeSchluessel");
async function anmelden(request, db, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.name !== "string" || typeof b.key !== "string" || !KEY_RE.test(b.key)) return fehler(400, "eingabe");
  const r = await pruefeSchluessel(db, b.name.normalize("NFC"), b.key, jetzt, request);
  if (r.fehler) return r.fehler;
  const token = await neueSitzung(db, r.user.id, geraetName(b.geraet), jetzt);
  return antwort({ token, name: r.user.name });
}
__name(anmelden, "anmelden");
async function passwortAendern(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.key !== "string" || typeof b.neu !== "string" || !KEY_RE.test(b.key) || !KEY_RE.test(b.neu)) return fehler(400, "eingabe");
  const r = await pruefeSchluessel(db, s.name, b.key, jetzt, request);
  if (r.fehler) return r.fehler;
  const salt = zufall(16);
  await db.batch([
    db.prepare("UPDATE users SET salt = ?, hash = ? WHERE id = ?").bind(salt, await sha256(salt + ":" + b.neu), s.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(s.id, s.th)
    // andere Geräte müssen sich neu anmelden
  ]);
  return antwort({ ok: true });
}
__name(passwortAendern, "passwortAendern");
async function kontoLoeschen(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b || typeof b.key !== "string" || !KEY_RE.test(b.key)) return fehler(400, "eingabe");
  const r = await pruefeSchluessel(db, s.name, b.key, jetzt, request);
  if (r.fehler) return r.fehler;
  await db.batch([
    db.prepare("DELETE FROM saves WHERE user_id = ?").bind(s.id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(s.id),
    db.prepare("DELETE FROM friends WHERE a = ? OR b = ?").bind(s.id, s.id),
    db.prepare("DELETE FROM presence WHERE user_id = ?").bind(s.id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(s.id)
  ]);
  return antwort({ ok: true });
}
__name(kontoLoeschen, "kontoLoeschen");
var meta = /* @__PURE__ */ __name((r) => ({ spiel: r.game, rev: r.rev, aktualisiert: r.updated, geraet: r.device, groesse: r.size }), "meta");
async function liste(db, s) {
  const r = await db.prepare(
    "SELECT game, rev, updated, device, size FROM saves WHERE user_id = ? AND rev = (SELECT MAX(rev) FROM saves x WHERE x.user_id = saves.user_id AND x.game = saves.game) ORDER BY game"
  ).bind(s.id).all();
  return antwort({ staende: r.results.map(meta) });
}
__name(liste, "liste");
async function holen(db, s, spiel, rev) {
  const r = rev ? await db.prepare("SELECT game, rev, data, size, updated, device FROM saves WHERE user_id = ? AND game = ? AND rev = ?").bind(s.id, spiel, rev).first() : await db.prepare("SELECT game, rev, data, size, updated, device FROM saves WHERE user_id = ? AND game = ? ORDER BY rev DESC LIMIT 1").bind(s.id, spiel).first();
  if (!r) return fehler(404, "leer");
  return antwort({ ...meta(r), daten: r.data });
}
__name(holen, "holen");
async function versionen(db, s, spiel) {
  const r = await db.prepare("SELECT game, rev, updated, device, size FROM saves WHERE user_id = ? AND game = ? ORDER BY rev DESC").bind(s.id, spiel).all();
  return antwort({ versionen: r.results.map(meta) });
}
__name(versionen, "versionen");
async function ausduennen(db, userId, spiel, behalten) {
  const r = (await db.prepare("SELECT rev, updated FROM saves WHERE user_id = ? AND game = ? ORDER BY rev DESC").bind(userId, spiel).all()).results;
  if (r.length < 2) return;
  const weg = [];
  if (!behalten && Math.floor(r[0].updated / ABSTAND) === Math.floor(r[1].updated / ABSTAND)) weg.push(r[1].rev);
  for (let i = 0; i < r.length; i++) if (i >= VERSIONEN && !weg.includes(r[i].rev)) weg.push(r[i].rev);
  if (weg.length) await db.batch(weg.map((rev) => db.prepare("DELETE FROM saves WHERE user_id = ? AND game = ? AND rev = ?").bind(userId, spiel, rev)));
}
__name(ausduennen, "ausduennen");
async function speichern(request, db, s, spiel, jetzt) {
  const l = await lies(request);
  if (l.zuGross) return fehler(413, "zu_gross");
  const b = l.b;
  if (!b || typeof b.daten !== "string" || !b.daten) return fehler(400, "eingabe");
  const groesse = enc.encode(b.daten).length;
  if (groesse > MAX_BYTES) return fehler(413, "zu_gross", { max: MAX_BYTES });
  const basis = Number.isInteger(b.basis) && b.basis >= 0 ? b.basis : null;
  if (basis === null && !b.erzwingen) return fehler(400, "eingabe");
  const geraet = geraetName(b.geraet);
  for (let versuch = 0; versuch < 2; versuch++) {
    const cur = await db.prepare("SELECT game, rev, data, size, updated, device FROM saves WHERE user_id = ? AND game = ? ORDER BY rev DESC LIMIT 1").bind(s.id, spiel).first();
    const curRev = cur ? cur.rev : 0;
    if (!b.erzwingen && basis !== curRev) return fehler(409, "konflikt", { aktuell: cur ? meta(cur) : null });
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
  }
  return fehler(409, "konflikt");
}
__name(speichern, "speichern");
var ONLINE_SEKUNDEN = 100;
var MAX_FREUNDE = 50;
var MAX_OFFEN = 20;
var paar = /* @__PURE__ */ __name((x, y) => x < y ? [x, y] : [y, x], "paar");
async function suche(db, name) {
  if (typeof name !== "string") return null;
  return db.prepare("SELECT id, name FROM users WHERE name_lc = ?").bind(name.normalize("NFC").toLowerCase()).first();
}
__name(suche, "suche");
async function freundeListe(db, s, jetzt) {
  const r = await db.prepare(
    `SELECT u.name AS name, f.status AS status, f.requester AS requester, p.game AS game, p.raum AS raum, p.seen AS seen
     FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END
     LEFT JOIN presence p ON p.user_id = u.id
     WHERE f.a = ? OR f.b = ? ORDER BY u.name_lc`
  ).bind(s.id, s.id, s.id).all();
  const freunde = [], eingehend = [], ausgehend = [];
  for (const x of r.results) {
    if (x.status === "accepted") {
      const online = !!x.seen && jetzt - x.seen < ONLINE_SEKUNDEN;
      freunde.push({ name: x.name, online, spiel: online ? x.game || null : null, raum: online && x.game ? x.raum || null : null, zuletzt: x.seen || null });
    } else if (x.requester === s.id) ausgehend.push({ name: x.name });
    else eingehend.push({ name: x.name });
  }
  return antwort({ freunde, eingehend, ausgehend, jetzt });
}
__name(freundeListe, "freundeListe");
async function freundAnfrage(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b) return fehler(400, "eingabe");
  const k = "f:" + s.id;
  const warte = await gesperrt(db, k, jetzt);
  if (warte) return fehler(429, "zu_viele", { warte });
  const ziel = await suche(db, b.name);
  await zaehle(db, k, jetzt, 20, 3600, 3600);
  if (!ziel) return fehler(404, "unbekannter_name");
  if (ziel.id === s.id) return fehler(400, "selbst");
  const [x, y] = paar(s.id, ziel.id);
  const alt = await db.prepare("SELECT requester, status FROM friends WHERE a = ? AND b = ?").bind(x, y).first();
  if (alt) {
    if (alt.status === "accepted") return fehler(409, "schon_freunde");
    if (alt.requester === s.id) return fehler(409, "schon_angefragt");
    await db.prepare("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?").bind(x, y).run();
    return antwort({ ok: true, freunde: true, name: ziel.name });
  }
  const zaehl = await db.prepare("SELECT COUNT(*) AS n FROM friends WHERE (a = ? OR b = ?) AND (status = 'accepted' OR requester = ?)").bind(s.id, s.id, s.id).first();
  if (zaehl.n >= MAX_FREUNDE) return fehler(409, "zu_viele_freunde");
  const offen = await db.prepare("SELECT COUNT(*) AS n FROM friends WHERE requester = ? AND status = 'pending'").bind(s.id).first();
  if (offen.n >= MAX_OFFEN) return fehler(409, "zu_viele_offen");
  await db.prepare("INSERT INTO friends (a, b, requester, status, created) VALUES (?, ?, ?, 'pending', ?)").bind(x, y, s.id, jetzt).run();
  return antwort({ ok: true, freunde: false, name: ziel.name });
}
__name(freundAnfrage, "freundAnfrage");
async function freundAnnehmen(request, db, s) {
  const { b } = await lies(request);
  const ziel = b && await suche(db, b.name);
  if (!ziel) return fehler(404, "unbekannter_name");
  const [x, y] = paar(s.id, ziel.id);
  const r = await db.prepare("UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ? AND status = 'pending' AND requester = ?").bind(x, y, ziel.id).run();
  if (!r.meta || r.meta.changes !== 1) return fehler(404, "keine_anfrage");
  return antwort({ ok: true });
}
__name(freundAnnehmen, "freundAnnehmen");
async function freundLoeschen(request, db, s, nurAnfrage) {
  const { b } = await lies(request);
  const ziel = b && await suche(db, b.name);
  if (!ziel) return fehler(404, "unbekannter_name");
  const [x, y] = paar(s.id, ziel.id);
  const r = await db.prepare(`DELETE FROM friends WHERE a = ? AND b = ?${nurAnfrage ? " AND status = 'pending'" : ""}`).bind(x, y).run();
  if (!r.meta || r.meta.changes !== 1) return fehler(404, "nicht_gefunden");
  return antwort({ ok: true });
}
__name(freundLoeschen, "freundLoeschen");
async function praesenz(request, db, s, jetzt) {
  const { b } = await lies(request);
  if (!b) return fehler(400, "eingabe");
  let spiel = null, raum = null, seen = jetzt;
  if (b.offline) seen = 0;
  else {
    if (b.spiel != null) {
      if (typeof b.spiel !== "string" || !SPIEL_RE.test(b.spiel)) return fehler(400, "spiel");
      spiel = b.spiel;
    }
    if (b.raum != null) {
      if (typeof b.raum !== "string" || b.raum.length > 40 || /[\u0000-\u001f<>]/.test(b.raum)) return fehler(400, "raum");
      raum = b.raum || null;
    }
  }
  await db.prepare("INSERT INTO presence (user_id, game, raum, seen) VALUES (?, ?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET game = excluded.game, raum = excluded.raum, seen = excluded.seen").bind(s.id, spiel, raum, seen).run();
  return antwort({ ok: true });
}
__name(praesenz, "praesenz");
async function handle(request, env, jetztMs = Date.now()) {
  const url = new URL(request.url);
  const pfad = url.pathname;
  if (!pfad.startsWith("/api/")) return env.ASSETS ? env.ASSETS.fetch(request) : new Response("Nicht gefunden", { status: 404 });
  const jetzt = Math.floor(jetztMs / 1e3);
  const m = request.method;
  const origin = request.headers.get("origin");
  if (origin && m !== "GET" && m !== "HEAD") {
    try {
      if (new URL(origin).host !== url.host) return fehler(403, "herkunft");
    } catch (e) {
      return fehler(403, "herkunft");
    }
  }
  try {
    await schemaSichern(env.DB);
    const db = env.DB;
    if (pfad === "/api/ping") return antwort({ ok: true });
    if (pfad === "/api/registrieren" && m === "POST") return await registrieren(request, db, jetzt);
    if (pfad === "/api/anmelden" && m === "POST") return await anmelden(request, db, jetzt);
    const s = await sitzung(request, db, jetzt);
    if (!s) return fehler(401, "nicht_angemeldet");
    if (pfad === "/api/ich" && m === "GET") return antwort({ name: s.name });
    if (pfad === "/api/abmelden" && m === "POST") {
      await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(s.th).run();
      return antwort({ ok: true });
    }
    if (pfad === "/api/passwort" && m === "POST") return await passwortAendern(request, db, s, jetzt);
    if (pfad === "/api/loeschen" && m === "POST") return await kontoLoeschen(request, db, s, jetzt);
    if (pfad === "/api/staende" && m === "GET") return await liste(db, s);
    if (pfad === "/api/freunde" && m === "GET") return await freundeListe(db, s, jetzt);
    if (pfad === "/api/freunde/anfrage" && m === "POST") return await freundAnfrage(request, db, s, jetzt);
    if (pfad === "/api/freunde/annehmen" && m === "POST") return await freundAnnehmen(request, db, s);
    if (pfad === "/api/freunde/ablehnen" && m === "POST") return await freundLoeschen(request, db, s, true);
    if (pfad === "/api/freunde/entfernen" && m === "POST") return await freundLoeschen(request, db, s, false);
    if (pfad === "/api/praesenz" && m === "POST") return await praesenz(request, db, s, jetzt);
    const sp = /^\/api\/stand\/([^/]+)(?:\/(versionen))?$/.exec(pfad);
    if (sp) {
      const spiel = sp[1];
      if (!SPIEL_RE.test(spiel)) return fehler(400, "spiel");
      if (sp[2] === "versionen" && m === "GET") return await versionen(db, s, spiel);
      if (!sp[2] && m === "GET") {
        const rev = parseInt(url.searchParams.get("rev") || "0", 10) || 0;
        return await holen(db, s, spiel, rev);
      }
      if (!sp[2] && m === "PUT") return await speichern(request, db, s, spiel, jetzt);
    }
    return fehler(404, "unbekannt");
  } catch (e) {
    return fehler(500, "server");
  }
}
__name(handle, "handle");

// src/worker.js
var worker_default = { fetch: /* @__PURE__ */ __name((request, env) => handle(request, env), "fetch") };

// ../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-sKv9eq/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../.npm/_npx/c943b712072b77c4/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-sKv9eq/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
