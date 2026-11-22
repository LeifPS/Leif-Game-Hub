// STools-API (nur auf st.leifps.de / handschrift.leifps.de):
//  POST /api/titel            { text }  -> { titel }   Titelvorschlag per Workers AI (nur auf Knopfdruck, Text wird nicht gespeichert)
//  Abgleich zwischen Geräten (Ende-zu-Ende verschlüsselt: der Server sieht nur eine Kennung und verschlüsselte Stücke):
//  GET  /api/sync/:id               -> { v, parts, updated } oder 404
//  GET  /api/sync/:id/:v/:i         -> Stück i (Text)
//  PUT  /api/sync/:id/:v/:i         -> Stück i hochladen
//  POST /api/sync/:id/commit        { v, parts, updated } -> neue Fassung gilt, alte Stücke werden gelöscht
const J = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
const ID = /^[a-z0-9]{8}$/, V = /^[a-z0-9]{6,16}$/;
const MAX_PART = 1_000_000, MAX_PARTS = 40;
const schemaOk = new WeakSet();
async function schema(db) {
  if (schemaOk.has(db)) return;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS hs_sync (id TEXT PRIMARY KEY, v TEXT NOT NULL, parts INTEGER NOT NULL, updated INTEGER NOT NULL, t INTEGER NOT NULL)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS hs_sync_part (id TEXT NOT NULL, v TEXT NOT NULL, i INTEGER NOT NULL, data TEXT NOT NULL, t INTEGER NOT NULL, PRIMARY KEY (id, v, i))`),
    db.prepare(`CREATE TABLE IF NOT EXISTS hs_limit (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)`),
  ]);
  schemaOk.add(db);
}
async function limit(db, k, max, ms) {
  const now = Date.now(), r = await db.prepare('SELECT n, until FROM hs_limit WHERE k = ?').bind(k).first();
  if (r && r.until > now) { if (r.n >= max) return false; await db.prepare('UPDATE hs_limit SET n = n + 1 WHERE k = ?').bind(k).run(); return true; }
  await db.prepare('INSERT INTO hs_limit (k, n, until) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, until = excluded.until').bind(k, now + ms).run();
  return true;
}
const ip = (req) => req.headers.get('cf-connecting-ip') || 'x';

export async function hsApi(request, env) {
  const url = new URL(request.url), p = url.pathname.split('/').filter(Boolean), m = request.method;
  try {
    if (p[1] === 'titel' && p.length === 2) {
      if (m !== 'POST') return J({ error: 'Nicht erlaubt' }, 405);
      if (!env.AI) return J({ error: 'Titelvorschläge sind auf dem Server nicht eingerichtet.' }, 503);
      if (env.DB) { await schema(env.DB); if (!(await limit(env.DB, 'titel:' + ip(request), 40, 3600e3))) return J({ error: 'Zu viele Vorschläge in kurzer Zeit. Bitte später nochmal.' }, 429); }
      const b = await request.json().catch(() => ({})), text = String(b.text || '').replace(/\[[^\]\n]{0,40}\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2500);
      if (text.length < 3) return J({ error: 'Zu wenig Text für einen Titel.' }, 400);
      const r = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', { max_tokens: 30, temperature: .7, messages: [
        { role: 'system', content: 'Du gibst für Schulnotizen einen kurzen, treffenden Titel auf Deutsch (2 bis 6 Wörter), in der Sprache des Textes, wenn er nicht deutsch ist. Antworte nur mit dem Titel, ohne Anführungszeichen, ohne Punkt am Ende.' },
        { role: 'user', content: text } ] });
      const titel = String((r && (r.response || r.result || '')) || '').split('\n')[0].replace(/^["„“'»«\s]+|["„“'»«.\s]+$/g, '').replace(/^Titel:\s*/i, '').slice(0, 60);
      if (!titel) return J({ error: 'Kein Vorschlag erhalten.' }, 502);
      return J({ titel });
    }
    if (p[1] === 'sync') {
      const db = env.DB; if (!db) return J({ error: 'Kein Speicher' }, 503);
      const id = p[2]; if (!ID.test(id || '')) return J({ error: 'Ungültige Kennung' }, 400);
      await schema(db);
      if (p.length === 3 && m === 'GET') {
        const r = await db.prepare('SELECT v, parts, updated FROM hs_sync WHERE id = ?').bind(id).first();
        return r ? J(r) : J({ error: 'Noch nichts gespeichert' }, 404);
      }
      if (p.length === 4 && p[3] === 'commit' && m === 'POST') {
        const b = await request.json().catch(() => ({})), v = String(b.v || ''), parts = b.parts | 0, updated = Math.max(0, Number(b.updated) || 0);
        if (!V.test(v) || parts < 1 || parts > MAX_PARTS) return J({ error: 'Ungültig' }, 400);
        const n = await db.prepare('SELECT COUNT(*) AS n FROM hs_sync_part WHERE id = ? AND v = ?').bind(id, v).first('n');
        if (Number(n) !== parts) return J({ error: 'Nicht alle Stücke angekommen' }, 409);
        const old = await db.prepare('SELECT v FROM hs_sync WHERE id = ?').bind(id).first('v');
        await db.batch([
          db.prepare('INSERT INTO hs_sync (id, v, parts, updated, t) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET v = excluded.v, parts = excluded.parts, updated = excluded.updated, t = excluded.t').bind(id, v, parts, updated, Date.now()),
          db.prepare('DELETE FROM hs_sync_part WHERE id = ? AND v <> ?').bind(id, v),
        ]);
        return J({ ok: true, ersetzt: old || null });
      }
      if (p.length === 5) {
        const v = p[3], i = Number(p[4]);
        if (!V.test(v) || !Number.isInteger(i) || i < 0 || i >= MAX_PARTS) return J({ error: 'Ungültig' }, 400);
        if (m === 'GET') {
          const d = await db.prepare('SELECT data FROM hs_sync_part WHERE id = ? AND v = ? AND i = ?').bind(id, v, i).first('data');
          return d == null ? J({ error: 'Fehlt' }, 404) : new Response(d, { headers: { 'content-type': 'text/plain', 'cache-control': 'no-store' } });
        }
        if (m === 'PUT') {
          if (!(await limit(db, 'sync:' + ip(request), 600, 3600e3))) return J({ error: 'Zu viele Anfragen' }, 429);
          const data = await request.text();
          if (data.length > MAX_PART || !/^[A-Za-z0-9+/=]*$/.test(data)) return J({ error: 'Stück ungültig oder zu groß' }, 413);
          await db.prepare('INSERT INTO hs_sync_part (id, v, i, data, t) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id, v, i) DO UPDATE SET data = excluded.data, t = excluded.t').bind(id, v, i, data, Date.now()).run();
          return J({ ok: true });
        }
      }
    }
    return J({ error: 'Nicht gefunden' }, 404);
  } catch (e) {
    return J({ error: 'Serverfehler' }, 500);
  }
}
