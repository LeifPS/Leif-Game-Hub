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
export const dbPut = (s, v) => run(s, 'readwrite', st => st.put(v));
export const dbDel = (s, k) => run(s, 'readwrite', st => st.delete(k));
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
