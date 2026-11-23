// Update-Pflicht: Die App läuft offline, muss aber mindestens alle 7 Tage einmal online gehen,
// damit sie Updates bekommt. Danach erscheint „Sitzung abgelaufen“, bis eine Verbindung besteht.
// Die Daten (Schriften, Dokumente) bleiben dabei immer gespeichert.
import { h } from './util.js';
import { btn } from './ui.js';

export const SYNC_DAYS = 7, WARN_DAYS = 2;
const KEY = 'hs:sync', DAY = 864e5;
const read = () => { try { return Number(localStorage.getItem(KEY)) || 0; } catch (_) { return 0; } };
const stamp = () => { try { localStorage.setItem(KEY, String(Date.now())); } catch (_) { /* Speicher gesperrt */ } };

export const lastSync = read;
export const daysLeft = () => { const l = read(); return l ? Math.max(0, Math.ceil((l + SYNC_DAYS * DAY - Date.now()) / DAY)) : SYNC_DAYS; };
// Restzeit in ms bis zur Sperre (0 = abgelaufen)
export const msLeft = () => { const l = read(); return l ? Math.max(0, l + SYNC_DAYS * DAY - Date.now()) : SYNC_DAYS * DAY; };
export const warning = () => { const m = msLeft(); return m > 0 && m <= WARN_DAYS * DAY; };
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

// Vorwarnung: In den letzten 2 Tagen vor der Sperre erscheint oben ein Hinweis (schließbar, kommt nach 6 Stunden wieder).
const SNOOZE = 'hs:warnSnooze', SNOOZE_MS = 6 * 36e5;
const snoozed = () => { try { return Date.now() - (Number(localStorage.getItem(SNOOZE)) || 0) < SNOOZE_MS; } catch (_) { return false; } };
let bar = null;
const leftText = () => { const m = msLeft(), d = Math.floor(m / DAY), hrs = Math.floor((m % DAY) / 36e5);
  return d >= 1 ? `noch ${d} Tag${d === 1 ? '' : 'e'}${hrs ? ` und ${hrs} Std.` : ''}` : hrs >= 1 ? `noch ${hrs} Std.` : 'noch weniger als 1 Stunde'; };
function hideBar() { if (bar) { bar.remove(); bar = null; } }
function refreshBar() {
  if (!warning() || lock || snoozed()) { hideBar(); return; }
  if (bar) { bar.querySelector('[data-left]').textContent = leftText(); return; }
  const msg = h('span', { 'data-left': '' }, leftText());
  const go = btn('Jetzt prüfen', { cls: 'sm', onclick: async () => {
    if (busy) return; busy = true; go.disabled = true; const old = go.textContent; go.textContent = 'Prüfe …';
    const ok = await checkNow(); busy = false; go.disabled = false;
    if (ok) hideBar(); else { go.textContent = old; msg.textContent = 'Kein Internet – ' + leftText(); }
  } });
  const x = h('button', { class: 'btn sm', 'aria-label': 'Schließen', title: 'Später erinnern', onclick: () => { try { localStorage.setItem(SNOOZE, String(Date.now())); } catch (_) { /* egal */ } hideBar(); } }, '×');
  bar = h('div', { role: 'status', style: { position: 'fixed', left: '10px', right: '10px', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', zIndex: 150, maxWidth: '620px', margin: '0 auto', background: 'var(--surf)', color: 'var(--tx)', border: '1px solid var(--warn)', borderLeftWidth: '5px', borderRadius: '12px', boxShadow: 'var(--sh)', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '14px', lineHeight: 1.35 } },
    h('div', { style: { flex: '1 1 220px' } }, h('b', null, 'Bitte bald online gehen: '), msg, ' bis Tippschrift gesperrt wird. Öffne die App einmal mit Internet, dann zählt es wieder von vorn.'), go, x);
  document.body.append(bar);
}

let lock = null, busy = false;
function hideLock() { if (lock) { lock.remove(); lock = null; } refreshBar(); }
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
    h('p', { style: { margin: 0, maxWidth: '420px', lineHeight: 1.5 } }, `Tippschrift war seit mehr als ${SYNC_DAYS} Tagen nicht online. Verbinde dich mit dem Internet, damit die App Updates laden kann. Deine Schriften und Dokumente bleiben gespeichert.`),
    go, msg);
  hideBar(); document.body.append(lock); go.focus();
}

// Beim Start: still prüfen; klappt es nicht und sind 7 Tage um, wird gesperrt.
export async function startSession() {
  if (!read()) stamp();   // erster Start auf diesem Gerät (die App musste dafür online geladen werden)
  const evaluate = async () => { if (await checkNow()) { hideLock(); hideBar(); } else if (expired()) showLock(); else refreshBar(); };
  await evaluate();
  addEventListener('online', () => { if (lock || expired()) evaluate(); else checkNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (expired()) evaluate(); else if (navigator.onLine) evaluate(); else refreshBar(); } });
  setInterval(() => { if (expired() && !lock) showLock(); else refreshBar(); }, 60000);
}
