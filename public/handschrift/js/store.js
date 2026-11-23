// Speicher im Browser (IndexedDB): Schriften, Dokumente, Einstellungen. Nichts verlässt das Gerät.
const NAME = 'handschrift', VER = 1;
let dbp;
const open = () => dbp ||= new Promise((ok, fail) => {
  const r = indexedDB.open(NAME, VER);
  r.onupgradeneeded = () => { const d = r.result; for (const s of ['fonts', 'docs']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: 'id' }); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv', { keyPath: 'k' }); };
  r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
});
const run = (store, mode, fn) => open().then(db => new Promise((ok, fail) => { const tx = db.transaction(store, mode), s = tx.objectStore(store); const q = fn(s); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => fail(tx.error); tx.onabort = () => fail(tx.error); }));
export const dbGet = (s, k) => run(s, 'readonly', st => st.get(k));
export const dbAll = (s) => run(s, 'readonly', st => st.getAll());
export const dbPut = (s, v) => run(s, 'readwrite', st => st.put(v)).then((r) => { if (s === 'fonts' || s === 'docs') merkeAenderung(s, v); return r; });
export const dbDel = (s, k) => run(s, 'readwrite', st => st.delete(k)).then((r) => { if (s === 'fonts' || s === 'docs') merkeLoeschung(s, k); return r; });
// Ohne Merker (für den Abgleich, damit eingespielte Änderungen nicht wieder als eigene Änderung zählen)
export const rawPut = (s, v) => run(s, 'readwrite', st => st.put(v));
export const rawDel = (s, k) => run(s, 'readwrite', st => st.delete(k));
// Gelöschtes merken (Grabsteine), damit der Abgleich es auch auf anderen Geräten löscht
export function merkeLoeschung(s, id) { merkt = merkt.then(async () => { const t = await kvGet('tomb', {}); (t[s] || (t[s] = {}))[id] = Date.now(); await kvSet('tomb', t); aenderungsHoerer.forEach((f) => f()); }).catch(() => {}); }
export const aenderungsHoerer = new Set();
export const kvGet = async (k, d) => { try { const r = await dbGet('kv', k); return r ? r.v : d; } catch { return d; } };
export const kvSet = (k, v) => dbPut('kv', { k, v }).catch(() => {});
export const persist = async () => { try { return navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; } catch { return false; } };
export const usage = async () => { try { const e = await navigator.storage.estimate(); return e; } catch { return null; } };

// Schrift als Datei (.hsfont = JSON)
export function fontToFile(f) {
  const o = { format: 'hsfont', v: 1, name: f.name, created: f.created, meta: f.meta, ref: f.ref, packs: f.packs, custom: f.custom, g: f.g };
  return new Blob([JSON.stringify(o)], { type: 'application/json' });
}
export async function fontFromFile(file) {
  const o = JSON.parse(await file.text());
  if (o.format !== 'hsfont' || !o.g) throw new Error('Das ist keine Schrift-Datei dieser App.');
  for (const a of Object.values(o.g)) for (const v of a) if (typeof v.src !== 'string' || !v.src.startsWith('data:image/')) throw new Error('Die Schrift-Datei ist beschädigt.');
  return { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(o.name || 'Importierte Schrift').slice(0, 60), created: Date.now(), updated: Date.now(), meta: o.meta || { xh: 27, sc: 3, pad: 4 }, ref: o.ref || {}, packs: o.packs || [], custom: o.custom || null, g: o.g };
}
export const countGlyphs = (g) => Object.values(g).reduce((a, v) => a + v.length, 0);

// ---------------- Sicherung (alle eigenen Schriften und Dokumente in einer Datei) ----------------
// Gemerkt wird, seit wann es ungesicherte Änderungen gibt; daraus entsteht die Erinnerung.
const dirtyKey = (s) => 'dirty_' + s;
let merkt = Promise.resolve();
function merkeAenderung(s, v) {
  if (s === 'docs' && v && v.opened && v.updated && v.opened > v.updated + 2000 && Date.now() - v.opened < 5000) return;   // nur geöffnet, nicht geändert
  merkt = merkt.then(async () => { if (!(await kvGet(dirtyKey(s), 0))) await kvSet(dirtyKey(s), Date.now()); aenderungsHoerer.forEach((f) => f()); }).catch(() => {});
}
export async function backupBlob() {
  const fonts = await dbAll('fonts'), docs = await dbAll('docs');
  const o = { format: 'stools-backup', v: 1, created: Date.now(), fonts: fonts.map((f) => ({ ...f })), docs, folders: await kvGet('folders', []) };
  return { blob: new Blob([JSON.stringify(o)], { type: 'application/json' }), fonts: fonts.length, docs: docs.length };
}
export async function markBackedUp() { await merkt; await kvSet('backupAt', Date.now()); await kvSet(dirtyKey('fonts'), 0); await kvSet(dirtyKey('docs'), 0); }
export async function restoreBackup(file) {
  let o; try { o = JSON.parse(await file.text()); } catch { throw new Error('Die Datei lässt sich nicht lesen.'); }
  if (o.format === 'hsfont') throw new Error('Das ist eine einzelne Schrift. Importiere sie unter „Schriften“.');
  if (o.format !== 'stools-backup' || !Array.isArray(o.fonts) || !Array.isArray(o.docs)) throw new Error('Das ist keine Sicherung von Tippschrift.');
  for (const f of o.fonts) { if (!f || !f.id || !f.g) throw new Error('Die Sicherung ist beschädigt.'); for (const a of Object.values(f.g)) for (const v of a) if (typeof v.src !== 'string' || !v.src.startsWith('data:image/')) throw new Error('Die Sicherung ist beschädigt.'); }
  for (const d of o.docs) if (!d || !d.id || typeof d.text !== 'string') throw new Error('Die Sicherung ist beschädigt.');
  for (const f of o.fonts) await run('fonts', 'readwrite', (st) => st.put(f));
  for (const d of o.docs) await run('docs', 'readwrite', (st) => st.put(d));
  if (Array.isArray(o.folders)) { const da = await kvGet('folders', []), ids = new Set(o.folders.map((f) => f.id)); await kvSet('folders', [...da.filter((f) => !ids.has(f.id)), ...o.folders.filter((f) => f && f.id && typeof f.name === 'string')]); }
  return { fonts: o.fonts.length, docs: o.docs.length };
}
/** Soll an die Sicherung erinnert werden? Eigene Schrift geändert: nach 1 Tag. Nur Dokumente geändert: nach 7 Tagen. „Später“ schiebt 2 Tage. */
export async function backupReminder() {
  await merkt;
  const own = (await dbAll('fonts')).length; if (!own) return null;
  const now = Date.now(), snooze = await kvGet('backupSnooze', 0); if (snooze > now) return null;
  const df = await kvGet(dirtyKey('fonts'), 0), dd = await kvGet(dirtyKey('docs'), 0), last = await kvGet('backupAt', 0);
  if (df && now - df > 864e5) return { why: 'font', last };
  if (dd && now - dd > 7 * 864e5) return { why: 'docs', last };
  return null;
}
export const snoozeBackup = () => kvSet('backupSnooze', Date.now() + 2 * 864e5);
