// Kleine Bausteine der Oberfläche: Symbole, Sheets, Regler, Schalter
import { h } from './util.js';

const P = {
  plus: 'M12 5v14M5 12h14', x: 'M18 6 6 18M6 6l12 12', check: 'M20 6 9 17l-5-5', download: 'M12 3v12m0 0-4-4m4 4 4-4M5 21h14', upload: 'M12 15V3m0 0L8 7m4-4 4 4M5 21h14',
  share: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13', trash: 'M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14', edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  copy: 'M9 9h11v11H9zM5 15V4h11', sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6', type: 'M4 7V4h16v3M9 20h6M12 4v16',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  more: 'M5 12h.01M12 12h.01M19 12h.01', bold: 'M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z', underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 21h14',
  strike: 'M4 12h16M16 6a4 4 0 0 0-4-2c-3 0-4 1.5-4 3s1 2.5 4 3M8 18a4 4 0 0 0 4 2c3 0 4-1.5 4-3', hl: 'M9 11l-6 6v3h9l3-3M22 12 12 2 5 9l7 7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01', head: 'M6 4v16M18 4v16M6 12h12', omega: 'M4 20h5v-2.5a7 7 0 1 1 6 0V20h5',
  dice: 'M3 3h18v18H3zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cr: 'M9 6l6 6-6 6', cl: 'M15 6l-6 6 6 6', cd: 'M6 9l6 6 6-6', image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01', palette: 'M12 22a10 10 0 1 1 10-10c0 3-2 3-4 3h-2a2 2 0 0 0-1 3.7c.6.5 0 3.3-3 3.3zM7.5 11h.01M10 7h.01M15 7h.01',
  pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6', layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5', wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z', alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 8', refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5', menu: 'M4 6h16M4 12h16M4 18h16', book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5V22h16',
};
export const ic = (n) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[n] || P.info); s.append(p); return s; };
// Markenzeichen: handgeschriebenes „h“ auf Kachel (wie das Favicon)
let markN = 0;
export function mark(size = 32) {
  const id = 'mk' + (++markN), w = document.createElement('span'); w.className = 'mark'; w.style.cssText = `display:inline-block;width:${size}px;height:${size}px;flex:none`;
  w.innerHTML = `<svg viewBox="0 0 512 512" width="${size}" height="${size}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a4de0"/><stop offset="1" stop-color="#7b4ff0"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#${id})"/><g transform="translate(256 258) scale(1.08) translate(-257 -258)"><path d="M88 420H424" stroke="#fff" stroke-opacity=".3" stroke-width="9" stroke-linecap="round"/><path d="M146 414C170 336 198 238 228 164C246 118 276 82 314 92C352 102 330 170 292 228C252 290 206 352 166 414C204 340 246 280 296 274C342 270 346 320 332 358C324 382 340 398 362 392C382 386 398 372 410 352" fill="none" stroke="#fffaf0" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"/><circle cx="426" cy="326" r="21" fill="#ffc247"/></g></svg>`;
  return w;
}
export const btn = (label, o = {}) => { const { icon, cls = '', onclick, title, disabled } = o; return h('button', { class: 'btn ' + cls, type: 'button', onclick, title: title || (typeof label === 'string' && cls.includes('icon') ? label : null), 'aria-label': cls.includes('icon') ? (title || label) : null, disabled }, icon ? ic(icon) : null, cls.includes('icon') ? null : label); };

// Sheet (unten auf dem Handy, rechts am Rechner)
let scrim;
const open = new Set();
export function sheet(title, build, { wide = false, onclose } = {}) {
  scrim ||= document.body.appendChild(h('div', { class: 'scrim', onclick: () => [...open].pop()?.close() }));
  const body = h('div', { class: 'sb' });
  const el = h('div', { class: 'sheet' + (wide ? ' wide' : ''), role: 'dialog', 'aria-label': title }, h('div', { class: 'grab' }),
    h('div', { class: 'sh' }, h('h2', null, title), btn('Schließen', { icon: 'x', cls: 'ghost icon sm', onclick: () => api.close() })), body);
  document.body.append(el);
  const api = { el, body, close() { el.classList.remove('on'); open.delete(api); if (!open.size) scrim.classList.remove('on'); setTimeout(() => el.remove(), 260); onclose && onclose(); } };
  build(body, api);
  requestAnimationFrame(() => { el.classList.add('on'); scrim.classList.add('on'); }); open.add(api);
  return api;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && open.size) [...open].pop().close(); });

export function range(label, get, set, min, max, step, fmt = v => v) {
  const out = h('output'), inp = h('input', { type: 'range', min, max, step, value: get() });
  const upd = () => { out.textContent = fmt(parseFloat(inp.value)); };
  inp.addEventListener('input', () => { set(parseFloat(inp.value)); upd(); }); upd();
  return h('div', { class: 'rng' }, h('b', null, label), out, inp);
}
export function toggle(label, sub, get, set) {
  const i = h('input', { type: 'checkbox', class: 'sw2', checked: get() ? true : null, onchange: () => set(i.checked) });
  return h('label', { class: 'tog' }, h('span', null, label, sub ? h('small', null, sub) : null), i);
}
export function seg(opts, get, set) {
  const w = h('div', { class: 'seg' });
  const draw = () => { w.replaceChildren(...opts.map(([v, t]) => h('button', { type: 'button', class: get() === v ? 'on' : '', onclick: () => { set(v); draw(); } }, t))); }; draw(); return w;
}
export function chips(opts, get, set, cls = 'opt') {
  const w = h('div', { class: 'chips' });
  const draw = () => { w.replaceChildren(...opts.map(([v, t]) => h('button', { type: 'button', class: cls + (get() === v ? ' on' : ''), onclick: () => { set(v); draw(); } }, t))); }; draw(); return w;
}
export function confirmBox(text, ok = 'Löschen') {
  return new Promise(res => {
    sheet('Bist du sicher?', (b, api) => { b.append(h('p', null, text), h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, btn('Abbrechen', { onclick: () => { api.close(); res(false); } }), btn(ok, { cls: 'pri', onclick: () => { api.close(); res(true); } }))); }, { onclose: () => res(false) });
  });
}
export function promptBox(title, val = '', ok = 'Speichern') {
  return new Promise(res => {
    sheet(title, (b, api) => { const i = h('input', { type: 'text', value: val, maxlength: 60 }); b.append(i, h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, btn('Abbrechen', { onclick: () => { api.close(); res(null); } }), btn(ok, { cls: 'pri', onclick: () => { api.close(); res(i.value.trim() || null); } }))); setTimeout(() => i.focus(), 300); i.addEventListener('keydown', e => { if (e.key === 'Enter') { api.close(); res(i.value.trim() || null); } }); }, { onclose: () => res(null) });
  });
}
