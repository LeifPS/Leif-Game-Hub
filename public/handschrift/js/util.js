// Kleine Helfer: DOM, Toasts, Dateien, Skripte nachladen
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(9)) if (k != null && k !== false) el.append(k.nodeType ? k : document.createTextNode(k));
  return el;
}
export const esc = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const sleep = (ms = 0) => new Promise(r => setTimeout(r, ms));
export const tick = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
export const debounce = (fn, ms = 150) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const blobOf = (c, type = 'image/png', q) => new Promise(r => c.toBlob(r, type, q));
export const fmtDate = (t) => new Date(t).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtTime = (t) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
export const fmtSize = (n) => n > 1e6 ? (n / 1e6).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1e3) + ' KB';

let toastEl, toastT;
export function toast(text, ms = 2800, kind = '') {
  toastEl ||= document.body.appendChild(h('div', { id: 'toast', role: 'status', 'aria-live': 'polite' }));
  toastEl.textContent = text; toastEl.className = 'on ' + kind;
  clearTimeout(toastT); if (ms) toastT = setTimeout(() => toastEl.classList.remove('on'), ms);
}
export const toastOff = () => toastEl && toastEl.classList.remove('on');

const loaded = {};
export function loadScript(src) {
  return loaded[src] ||= new Promise((ok, fail) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => { delete loaded[src]; fail(new Error('Konnte ' + src + ' nicht laden')); };
    document.head.append(s);
  });
}
// Datei speichern: auf dem Handy über das Teilen-Menü (z. B. „In GoodNotes öffnen“), sonst normaler Download
export async function saveFile(blob, name, { share = false } = {}) {
  const file = new File([blob], name, { type: blob.type });
  if (share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'geteilt'; }
    catch (e) { if (e && e.name === 'AbortError') return 'abgebrochen'; }
  }
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name, style: { display: 'none' } });
  document.body.append(a); a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  return 'gespeichert';
}
