// Update-Pflicht: Die App läuft offline, muss aber mindestens alle 7 Tage einmal online gehen,
// damit sie Updates bekommt. Danach erscheint „Sitzung abgelaufen“, bis eine Verbindung besteht.
// Die Daten (Schriften, Dokumente) bleiben dabei immer gespeichert.
import { h } from './util.js';
import { btn } from './ui.js';

export const SYNC_DAYS = 7;
const KEY = 'hs:sync', DAY = 864e5;
const read = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch (_) { return 0; } };
const stamp = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (_) { /* Speicher gesperrt */ } };

export const lastSync = read;
export const daysLeft = () => { const l = read(); return l ? Math.max(0, Math.ceil((l + SYNC_DAYS * DAY - Date.now()) / DAY)) : SYNC_DAYS; };
export const expired = () => { const l = read(); return !!l && Date.now() - l > SYNC_DAYS * DAY; };

// Prüft per Netzwerk (am Service Worker vorbei), ob der Server erreichbar ist, und stößt dabei das Update an.
export async function checkNow() {
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch('/sw.js?_=' + Date.now(), { cache: 'no-store', signal: ctl.signal }); clearTimeout(to);
    if (!r.ok) return false;
    if (!/addEventListener/.test(await r.text())) return false;   // z. B. WLAN-Anmeldeseite statt echter Antwort
    stamp();
    try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) reg.update().catch(() => {}); } catch (_) { /* egal */ }
    return true;
  } catch (_) { return false; }
}

let lock = null, busy = false;
function hideLock() { if (lock) { lock.remove(); lock = null; } }
function showLock() {
  if (lock) return;
  const msg = h('p', { style: { margin: 0, minHeight: '1.4em', color: 'var(--mut)', fontSize: '14px' } });
  const go = btn('Erneut versuchen', { cls: 'pri', onclick: async () => {
    if (busy) return; busy = true; go.disabled = true; msg.textContent = 'Prüfe Verbindung …';
    const ok = await checkNow(); busy = false; go.disabled = false;
    if (ok) hideLock(); else msg.textContent = 'Noch keine Verbindung zum Server. Prüfe WLAN oder Mobilfunk.';
  } });
  lock = h('div', { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Sitzung abgelaufen', style: { position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg)', color: 'var(--tx)', display: 'grid', placeContent: 'center', justifyItems: 'center', gap: '14px', padding: '28px', textAlign: 'center' } },
    h('h1', { style: { margin: 0, fontSize: '24px' } }, 'Sitzung abgelaufen'),
    h('p', { style: { margin: 0, maxWidth: '420px', lineHeight: 1.5 } }, `STools war seit mehr als ${SYNC_DAYS} Tagen nicht online. Verbinde dich mit dem Internet, damit die App Updates laden kann. Deine Schriften und Dokumente bleiben gespeichert.`),
    go, msg);
  document.body.append(lock); go.focus();
}

// Beim Start: still prüfen; klappt es nicht und sind 7 Tage um, wird gesperrt.
export async function startSession() {
  if (!read()) stamp();   // erster Start auf diesem Gerät (die App musste dafür online geladen werden)
  const evaluate = async () => { if (await checkNow()) hideLock(); else if (expired()) showLock(); };
  await evaluate();
  addEventListener('online', () => { if (lock || expired()) evaluate(); else checkNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (expired()) evaluate(); else if (navigator.onLine) checkNow(); } });
  setInterval(() => { if (expired() && !lock) showLock(); }, 60000);
}
