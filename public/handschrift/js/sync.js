// Abgleich zwischen Geräten (freiwillig). Ende-zu-Ende verschlüsselt:
// Der Code (24 Zeichen) besteht aus Kennung (8 Zeichen, geht an den Server) und Schlüssel (16 Zeichen, verlässt das Gerät nie).
// Gespeichert wird ein verschlüsselter Gesamtstand (eigene Schriften, Dokumente, Ordner, Gelöschtes); beim Abgleich gewinnt je Eintrag der neuere.
import { dbAll, rawPut, rawDel, kvGet, kvSet, aenderungsHoerer } from './store.js';

const ABC = 'abcdefghjkmnpqrstuvwxyz23456789';
const PART = 900_000;
export const fmtCode = (c) => (c || '').match(/.{1,4}/g)?.join('-') || '';
export const normCode = (t) => (t || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function newCode() { const a = crypto.getRandomValues(new Uint8Array(24)); return [...a].map((x) => ABC[x % ABC.length]).join(''); }
export const validCode = (c) => /^[a-z0-9]{24}$/.test(c);

async function keyOf(code) {
  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('stools-sync:' + code.slice(8)));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function gzip(bytes) { const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
async function gunzip(bytes) { const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')); return new Uint8Array(await new Response(s).arrayBuffer()); }
function toB64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function fromB64(b) { const s = atob(b), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }

async function encrypt(code, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), data = await gzip(new TextEncoder().encode(JSON.stringify(obj)));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyOf(code), data));
  const all = new Uint8Array(12 + ct.length); all.set(iv); all.set(ct, 12); return toB64(all);
}
async function decrypt(code, b64) {
  const all = fromB64(b64);
  let pt; try { pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.subarray(0, 12) }, await keyOf(code), all.subarray(12)); } catch { throw new Error('Der Code passt nicht zu den gespeicherten Daten.'); }
  return JSON.parse(new TextDecoder().decode(await gunzip(new Uint8Array(pt))));
}

const api = (id, rest = '', o) => fetch(`/api/sync/${id}${rest}`, { cache: 'no-store', ...o });
async function download(code) {
  const id = code.slice(0, 8), m = await api(id);
  if (m.status === 404) return null;
  if (!m.ok) throw new Error('Server nicht erreichbar');
  const meta = await m.json(); let b64 = '';
  for (let i = 0; i < meta.parts; i++) { const r = await api(id, `/${meta.v}/${i}`); if (!r.ok) throw new Error('Abgleich unvollständig, bitte nochmal'); b64 += await r.text(); }
  return { meta, data: await decrypt(code, b64) };
}
async function upload(code, obj) {
  const id = code.slice(0, 8), b64 = await encrypt(code, obj), v = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
  const parts = Math.ceil(b64.length / PART) || 1;
  if (parts > 40) throw new Error('Zu viele Daten für den Abgleich (über 36 MB).');
  for (let i = 0; i < parts; i++) { const r = await api(id, `/${v}/${i}`, { method: 'PUT', body: b64.slice(i * PART, (i + 1) * PART) }); if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Hochladen fehlgeschlagen'); }
  const c = await api(id, '/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ v, parts, updated: obj.at }) });
  if (!c.ok) throw new Error('Hochladen fehlgeschlagen');
  return b64.length;
}

async function snapshot() {
  return { at: Date.now(), fonts: await dbAll('fonts'), docs: await dbAll('docs'), folders: await kvGet('folders', []), tomb: await kvGet('tomb', {}) };
}
// Zusammenführen: je Eintrag gewinnt der neuere; was nach seiner letzten Änderung gelöscht wurde, bleibt weg
export function merge(a, b) {
  const tomb = {};
  for (const k of ['fonts', 'docs', 'folders']) { tomb[k] = { ...((a.tomb || {})[k] || {}) }; for (const [id, t] of Object.entries((b.tomb || {})[k] || {})) tomb[k][id] = Math.max(tomb[k][id] || 0, t); }
  const out = { tomb };
  for (const k of ['fonts', 'docs', 'folders']) {
    const m = new Map();
    for (const x of [...(a[k] || []), ...(b[k] || [])]) { if (!x || !x.id) continue; const o = m.get(x.id); if (!o || (x.updated || 0) > (o.updated || 0)) m.set(x.id, x); }
    out[k] = [...m.values()].filter((x) => !(tomb[k][x.id] >= (x.updated || 0)));
  }
  return out;
}
const sig = (o) => JSON.stringify(['fonts', 'docs', 'folders'].map((k) => (o[k] || []).map((x) => x.id + ':' + (x.updated || 0)).sort())) + JSON.stringify(o.tomb || {});

let running = null, timer = 0, appRef = null;
export const syncCode = () => kvGet('syncCode', '');
export async function syncStatus() { return { code: await kvGet('syncCode', ''), at: await kvGet('syncAt', 0), err: await kvGet('syncErr', '') }; }

/** Einmal abgleichen. Gibt { geholt, hochgeladen } zurück. */
export function syncNow() { if (!running) running = doSync().finally(() => { running = null; }); return running; }
async function doSync() {
  const code = await kvGet('syncCode', ''); if (!validCode(code)) return null;
  if (!navigator.onLine) return null;
  try {
    const local = await snapshot(), remote = await download(code);
    const merged = remote ? merge(local, remote.data) : merge(local, {});
    // Lokal übernehmen, was neuer ist oder gelöscht wurde
    let geholt = 0;
    for (const k of ['fonts', 'docs']) {
      const lm = new Map(local[k].map((x) => [x.id, x])), mm = new Map(merged[k].map((x) => [x.id, x]));
      for (const [id, x] of mm) { const l = lm.get(id); if (!l || (x.updated || 0) > (l.updated || 0)) { await rawPut(k, x); geholt++; } }
      for (const id of lm.keys()) if (!mm.has(id)) { await rawDel(k, id); geholt++; }
    }
    if (sig({ folders: merged.folders }) !== sig({ folders: local.folders })) { await kvSet('folders', merged.folders); geholt++; }
    await kvSet('tomb', merged.tomb);
    let hochgeladen = 0;
    if (!remote || sig(merged) !== sig(remote.data)) hochgeladen = await upload(code, { at: Date.now(), ...merged });
    await kvSet('syncAt', Date.now()); await kvSet('syncErr', '');
    if (geholt && appRef) await appRef.syncApplied();
    return { geholt, hochgeladen };
  } catch (e) { await kvSet('syncErr', e.message || String(e)); throw e; }
}
/** Nach eigenen Änderungen etwas später abgleichen (viele Änderungen hintereinander = ein Abgleich). */
export function syncSoon(ms = 15000) { clearTimeout(timer); timer = setTimeout(() => syncNow().catch(() => {}), ms); }
export async function initSync(app) {
  appRef = app;
  aenderungsHoerer.add(async () => { if (validCode(await kvGet('syncCode', ''))) syncSoon(); });
  window.addEventListener('online', () => syncSoon(1500));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncSoon(1500); });
  if (validCode(await kvGet('syncCode', ''))) syncSoon(1200);
}
export const _intern = { encrypt, decrypt, upload, download };
export async function setCode(code) { await kvSet('syncCode', code); await kvSet('syncAt', 0); await kvSet('syncErr', ''); }
