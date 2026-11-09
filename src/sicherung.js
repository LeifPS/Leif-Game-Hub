// Zweite, unabhängige Kopie der Konten und Spielstände in einer eigenen D1-Datenbank (Binding "BACKUP_DB", Datenbank "lgh-backup").
// Läuft jede Nacht (Cron in wrangler.jsonc) und beim Löschen eines Kontos. Es wird nur angehängt; gelöschte Konten bleiben 30 Tage erhalten.
// Wiederherstellen: tools/lgh-konto-zurueck.mjs (einzelnes Konto) bzw. README "Sicherung und Wiederherstellung".
export const BACKUP_TAGE = 90;            // so lange bleiben ältere Sicherungsstände (der jeweils neueste je Spiel und Konto bleibt immer)
export const LOESCH_TAGE = 30;            // so lange bleibt ein gelöschtes Konto in der Sicherung
const KLEIN = ['favorites', 'playtime', 'ratings', 'wallet', 'wallet_log', 'wallet_gift', 'wallet_gift_seen', 'dlc_owned', 'friends'];   // kleine Tabellen: nachts als Ganzes, beim Löschen pro Konto

export const BACKUP_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS saves_bak (
    user_id INTEGER NOT NULL, game TEXT NOT NULL, rev INTEGER NOT NULL, data TEXT NOT NULL, size INTEGER NOT NULL,
    updated INTEGER NOT NULL, device TEXT, saved_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, game, rev, updated)
  )`,
  `CREATE TABLE IF NOT EXISTS users_bak (id INTEGER PRIMARY KEY, name TEXT, row TEXT NOT NULL, saved_at INTEGER NOT NULL, deleted_at INTEGER)`,
  `CREATE TABLE IF NOT EXISTS tabellen_bak (tabelle TEXT NOT NULL, tag INTEGER NOT NULL, rows TEXT NOT NULL, PRIMARY KEY (tabelle, tag))`,
  `CREATE TABLE IF NOT EXISTS konten_bak (user_id INTEGER NOT NULL, tabelle TEXT NOT NULL, rows TEXT NOT NULL, saved_at INTEGER NOT NULL, PRIMARY KEY (user_id, tabelle))`,
  `CREATE TABLE IF NOT EXISTS meta_bak (k TEXT PRIMARY KEY, v TEXT NOT NULL)`,
];
const fertig = new WeakMap();
async function schema(bk) {
  if (!fertig.has(bk)) fertig.set(bk, bk.batch(BACKUP_SCHEMA.map((s) => bk.prepare(s))).catch((e) => { fertig.delete(bk); throw e; }));
  await fertig.get(bk);
}
const insSave = (bk, r, jetzt) => bk.prepare('INSERT OR IGNORE INTO saves_bak (user_id, game, rev, data, size, updated, device, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  .bind(r.user_id, r.game, r.rev, r.data, r.size, r.updated, r.device, jetzt);

// Alle Stände eines Kontos in die Sicherung, dazu die Kontozeile und die kleinen Tabellen. Beim Löschen: deleted_at setzen.
export async function kontoSichern(db, bk, userId, jetzt, geloescht) {
  if (!bk) return true;
  await schema(bk);
  const u = await db.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  if (!u) return true;
  const staende = (await db.prepare('SELECT user_id, game, rev, data, size, updated, device FROM saves WHERE user_id = ?').bind(userId).all()).results;
  for (let i = 0; i < staende.length; i += 10) await bk.batch(staende.slice(i, i + 10).map((r) => insSave(bk, r, jetzt)));
  const klein = [];
  for (const t of KLEIN) {
    const spalte = t === 'friends' ? ['a', 'b'] : ['user_id'];
    try {
      const rows = (await db.prepare('SELECT * FROM ' + t + ' WHERE ' + spalte.map((c) => c + ' = ?').join(' OR ')).bind(...spalte.map(() => userId)).all()).results;
      klein.push(bk.prepare('INSERT OR REPLACE INTO konten_bak (user_id, tabelle, rows, saved_at) VALUES (?, ?, ?, ?)').bind(userId, t, JSON.stringify(rows), jetzt));
    } catch (e) { /* Tabelle gibt es (noch) nicht */ }
  }
  klein.push(bk.prepare('INSERT OR REPLACE INTO users_bak (id, name, row, saved_at, deleted_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, u.name, JSON.stringify(u), jetzt, geloescht ? jetzt : null));
  await bk.batch(klein);
  return true;
}

// Nächtlicher Lauf: neue Stände anhängen, Konten und kleine Tabellen sichern, Altes aufräumen
export async function sichern(env, jetzt = Math.floor(Date.now() / 1000)) {
  const db = env.DB, bk = env.BACKUP_DB;
  if (!db || !bk) return { uebersprungen: true };
  await schema(bk);
  const aus = { staende: 0, konten: 0 };
  // 1. neue Stände (nach "updated" abgearbeitet; die Marke merkt sich, wie weit schon gesichert ist)
  let marke = Number((await bk.prepare("SELECT v FROM meta_bak WHERE k = 'saves_bis'").first('v')) || 0);
  const start = Date.now();
  for (let runde = 0; runde < 400 && Date.now() - start < 20000; runde++) {
    const rows = (await db.prepare('SELECT user_id, game, rev, data, size, updated, device FROM saves WHERE updated >= ? ORDER BY updated, user_id, game, rev LIMIT 20').bind(marke).all()).results;
    if (!rows.length) break;
    await bk.batch(rows.map((r) => insSave(bk, r, jetzt)));
    aus.staende += rows.length;
    const hoechst = rows[rows.length - 1].updated;
    marke = rows.length === 20 && hoechst === marke ? marke + 1 : hoechst;
    await bk.prepare("INSERT OR REPLACE INTO meta_bak (k, v) VALUES ('saves_bis', ?)").bind(String(marke)).run();
    if (rows.length < 20) break;
  }
  // 2. alle Konten (Zeilen) und die kleinen Tabellen als Tagesstand
  const users = (await db.prepare('SELECT * FROM users').all()).results;
  const alt = new Map((await bk.prepare('SELECT id, deleted_at FROM users_bak').all()).results.map((r) => [r.id, r.deleted_at]));
  for (let i = 0; i < users.length; i += 20) {
    await bk.batch(users.slice(i, i + 20).map((u) => bk.prepare('INSERT OR REPLACE INTO users_bak (id, name, row, saved_at, deleted_at) VALUES (?, ?, ?, ?, NULL)').bind(u.id, u.name, JSON.stringify(u), jetzt)));
  }
  aus.konten = users.length;
  const tag = Math.floor(jetzt / 86400);
  for (const t of KLEIN) {
    try {
      const rows = (await db.prepare('SELECT * FROM ' + t).all()).results;
      await bk.prepare('INSERT OR REPLACE INTO tabellen_bak (tabelle, tag, rows) VALUES (?, ?, ?)').bind(t, tag, JSON.stringify(rows)).run();
    } catch (e) { /* Tabelle gibt es (noch) nicht */ }
  }
  // 3. aufräumen: Tagesstände der kleinen Tabellen 14 Tage; alte Sicherungsstände nach BACKUP_TAGE (der neueste je Konto und Spiel bleibt); gelöschte Konten nach LOESCH_TAGE ganz
  await bk.prepare('DELETE FROM tabellen_bak WHERE tag < ?').bind(tag - 14).run();
  await bk.prepare(`DELETE FROM saves_bak WHERE saved_at < ? AND rev < (SELECT MAX(x.rev) FROM saves_bak x WHERE x.user_id = saves_bak.user_id AND x.game = saves_bak.game)`).bind(jetzt - BACKUP_TAGE * 86400).run();
  const weg = (await bk.prepare('SELECT id FROM users_bak WHERE deleted_at IS NOT NULL AND deleted_at < ?').bind(jetzt - LOESCH_TAGE * 86400).all()).results.map((r) => r.id);
  for (const id of weg) {
    await bk.batch([
      bk.prepare('DELETE FROM saves_bak WHERE user_id = ?').bind(id), bk.prepare('DELETE FROM konten_bak WHERE user_id = ?').bind(id), bk.prepare('DELETE FROM users_bak WHERE id = ?').bind(id),
    ]);
  }
  aus.entfernt = weg.length;
  return aus;
}
