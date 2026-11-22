// Kleine Bausteine der Oberfläche: Symbole, Sheets, Regler, Schalter
import { h } from './util.js';

const P = {
  highlighter: 'm9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  sort: 'M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4',
  plus: 'M12 5v14M5 12h14', x: 'M18 6 6 18M6 6l12 12', check: 'M20 6 9 17l-5-5', download: 'M12 15V3M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5', upload: 'M12 3v12M17 8l-5-5-5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
  share: 'M12 2v13M16 6l-4-4-4 4M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7', trash: 'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6', edit: 'M12 20h9M16.4 3.6a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z',
  copy: 'M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2zM4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2', sliders: 'M10 5H3M12 19H3M14 3v4M16 17v4M21 12h-9M21 19h-5M21 5h-7M8 10v4M8 12H3', type: 'M4 7V4h16v3M9 20h6M12 4v16',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5', folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  more: 'M6.3 12a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0zM13.3 12a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0zM20.3 12a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0z', bold: 'M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8', underline: 'M6 4v6a6 6 0 0 0 12 0V4M4 20h16',
  strike: 'M16 4H9a3 3 0 0 0-2.83 4M14 12a4 4 0 0 1 0 8H6M4 12h16', hl: 'm9 11-6 6v3h9l3-3M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4',
  list: 'M3 6h.01M3 12h.01M3 18h.01M8 6h13M8 12h13M8 18h13', numlist: 'M10 6h11M10 12h11M10 18h11M4 10h2M4 6h1v4M6 18H4c0-1 2-2 2-3s-1-1.5-2-1', redo: 'm15 14 5-5-5-5M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13', paste: 'M8 2h8v4H8zM16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', search: 'm21 21-4.34-4.34M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0', head: 'M6 12h12M6 20V4M18 20V4', omega: 'M3 20h4.5a.5.5 0 0 0 .5-.5v-.282a.52.52 0 0 0-.247-.437 8 8 0 1 1 8.494-.001.52.52 0 0 0-.247.438v.282a.5.5 0 0 0 .5.5H21',
  dice: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 8h.01M16 8h.01M12 12h.01M8 16h.01M16 16h.01', sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z', info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 16v-4M12 8h.01', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  cr: 'M9 6l6 6-6 6', cl: 'M15 6l-6 6 6 6', cd: 'M6 9l6 6 6-6', image: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 9.5h.01', palette: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8zM13.5 6.5h.01M17.5 10.5h.01M6.5 12.5h.01M8.5 7.5h.01',
  pen: 'M12 19l7-7 3 3-7 7zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6', layers: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83zM2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17', wand: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5',
  print: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z', alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
  grid: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z', undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11', refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5', menu: 'M4 6h16M4 12h16M4 18h16', book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5zM4 19.5V22h16',
};
export const ic = (n) => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', P[n] || P.info); s.append(p); return s; };
// Markenzeichen: STools-Logo (S mit T) auf dunkler Kachel (wie das Favicon)
const LOGO = "M142.3 251.2C138.3 250.3 135.4 246.8 135.1 242.3C134.9 239.2 134.9 239.2 128.0 238.9C125.3 238.8 124.8 238.7 123.4 238.4C122.4 238.2 121.1 238.0 120.1 237.9C119.2 237.8 117.9 237.6 117.2 237.4C116.5 237.2 115.3 237.0 114.6 236.8C102.3 234.2 97.3 229.0 99.1 220.6C99.8 217.2 103.9 211.0 106.2 209.5C112.5 205.8 119.7 209.5 120.4 216.8C120.5 218.2 120.7 218.6 121.3 218.9C122.1 219.3 124.7 219.9 126.6 220.0C127.6 220.1 129.3 220.3 130.3 220.4C133.5 220.8 134.3 220.7 134.9 219.7C135.1 219.2 135.2 184.0 134.9 183.2C134.6 182.4 133.1 181.7 130.1 180.9C129.5 180.7 128.9 180.5 128.6 180.4C128.4 180.3 127.7 180.1 127.1 179.9C126.4 179.7 125.2 179.2 124.2 178.8C122.6 178.1 118.3 176.6 116.2 175.9C113.3 174.9 108.8 172.6 106.9 171.0C104.3 168.8 102.6 166.9 101.2 164.5C99.5 161.8 99.3 161.2 98.8 157.5C98.2 153.1 98.2 153.6 98.6 150.5C98.7 149.6 98.9 148.0 99.0 146.8C99.2 145.4 99.4 144.5 99.6 143.8C99.7 143.3 100.0 142.5 100.1 142.0C100.2 141.5 100.6 140.4 101.0 139.5C101.3 138.6 101.8 137.5 102.1 137.0C104.1 132.3 109.4 125.8 113.2 123.1C113.8 122.7 114.8 122.0 115.5 121.4C116.2 120.9 117.9 119.8 119.2 119.0C120.5 118.2 122.0 117.3 122.4 117.0C122.9 116.7 124.3 116.0 125.5 115.4C126.7 114.9 128.2 114.2 128.8 113.8C129.4 113.5 130.3 113.1 130.8 113.0C135.6 111.2 135.1 112.5 135.1 102.1C135.1 93.2 135.1 93.7 134.3 93.2C134.0 92.9 132.4 92.9 104.4 92.9C74.8 92.8 74.8 92.8 73.9 92.5C65.1 89.5 65.4 77.4 74.3 74.8C75.5 74.5 215.2 74.3 217.9 74.6C227.7 75.8 229.0 89.6 219.6 92.5C218.7 92.8 218.7 92.8 186.8 92.9C156.2 92.9 154.8 92.9 154.4 93.2C153.6 93.6 153.6 93.6 153.7 100.3C153.7 107.8 153.3 107.1 158.3 107.1C162.1 107.1 164.2 107.3 165.6 107.7C166.3 107.8 167.3 108.1 167.9 108.1C171.9 108.6 176.6 111.3 179.2 114.5C181.1 116.8 182.4 118.9 182.8 120.2C182.9 120.4 183.1 121.1 183.3 121.7C184.6 125.0 184.6 130.3 183.3 133.2C178.7 143.5 163.3 140.9 163.9 129.9C164.1 127.0 164.1 126.8 163.1 126.3C162.0 125.8 155.0 125.7 154.3 126.2C153.6 126.7 153.6 125.5 153.6 147.5C153.6 169.0 153.6 168.3 154.2 168.9C154.8 169.6 159.2 171.2 162.7 172.1C163.9 172.4 166.4 173.3 168.8 174.3C169.7 174.7 170.7 175.0 170.9 175.1C171.2 175.2 172.8 176.0 174.6 176.9C183.8 181.7 189.9 187.7 191.9 193.7C192.0 194.2 192.3 194.9 192.5 195.3C192.7 195.9 193.1 198.1 193.3 200.1C193.4 200.5 193.5 201.3 193.6 202.0C194.2 205.6 193.4 212.4 192.1 215.4C190.2 219.6 190.3 219.4 188.6 222.0C185.6 226.2 182.2 229.3 178.0 231.8C174.3 233.9 172.9 234.6 171.4 234.9C171.0 235.1 169.4 235.5 168.1 236.0C165.1 237.0 163.0 237.5 160.4 237.9C159.4 238.0 158.2 238.2 157.8 238.4C157.3 238.5 156.4 238.7 155.8 238.8C153.8 239.1 153.7 239.3 153.6 241.7C153.3 248.3 148.4 252.4 142.3 251.2Z";
export function mark(size = 32) {
  const w = document.createElement('span'); w.className = 'mark'; w.style.cssText = `display:inline-block;width:${size}px;height:${size}px;flex:none`;
  w.innerHTML = `<svg viewBox="0 0 512 512" width="${size}" height="${size}" aria-hidden="true"><rect width="512" height="512" rx="112" fill="#111114"/><g transform="translate(256 256) scale(1.75) translate(-146.6 -162.9)"><path fill="#fff" fill-rule="evenodd" d="${LOGO}"/></g></svg>`;
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
    sheet('Bist du sicher?', (b, api) => { b.append(h('p', null, text), h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, btn('Abbrechen', { onclick: () => { res(false); api.close(); } }), btn(ok, { cls: 'pri', onclick: () => { res(true); api.close(); } }))); }, { onclose: () => res(false) });
  });
}
export function promptBox(title, val = '', ok = 'Speichern') {
  return new Promise(res => {
    sheet(title, (b, api) => { const i = h('input', { type: 'text', value: val, maxlength: 60 }); b.append(i, h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } }, btn('Abbrechen', { onclick: () => { res(null); api.close(); } }), btn(ok, { cls: 'pri', onclick: () => { res(i.value.trim() || null); api.close(); } }))); setTimeout(() => i.focus(), 300); i.addEventListener('keydown', e => { if (e.key === 'Enter') { res(i.value.trim() || null); api.close(); } }); }, { onclose: () => res(null) });
  });
}
