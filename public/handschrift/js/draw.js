// Zeichen direkt in der App zeichnen. Jeder Strich wird als Strich gespeichert (für GoodNotes)
// und zusätzlich als Bild gerendert (für Vorschau, PDF und PNG).
import { h, toast } from './util.js';
import { btn, confirmBox } from './ui.js';
import { SC, PAD, XH } from './imgops.js';
import { smooth, simplify } from './vec.js';
import { describeChar } from './chardesc.js';

const LB = 0.8, RB = 2.2, PEN = 2.1;
const CW = 72, CH = 100, BASE = 68, CAP = 1.8;                     // Zeichenfläche in Einheiten (x-Höhe = 27 Einheiten)
const SUBS = new Set([...'₀₁₂₃₄₅₆₇₈₉']);
const INK = '#1d3a9a';

// Striche (Einheiten, Fläche) -> Zeichen im Format der Schrift (Bild + Striche)
export function glyphFromStrokes(ch, strokes, pen = PEN) {
  const pts = strokes.flatMap(s => s.p); if (!pts.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const hw = pen / 2, bx0 = x0 - hw, bx1 = x1 + hw, by0 = y0 - hw, by1 = y1 + hw;
  const ox0 = bx0 - PAD, oy0 = by0 - PAD, AW = Math.ceil((bx1 - bx0 + 2 * PAD) * SC), AH = Math.ceil((by1 - by0 + 2 * PAD) * SC);
  const c = document.createElement('canvas'); c.width = AW; c.height = AH;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.strokeStyle = g.fillStyle = '#000'; g.lineCap = g.lineJoin = 'round'; g.lineWidth = pen * SC;
  const P = ([x, y]) => [(x - ox0) * SC, (y - oy0) * SC];
  for (const s of strokes) {
    const q = s.p.map(P);
    if (q.length < 2 || q.every(p => Math.hypot(p[0] - q[0][0], p[1] - q[0][1]) < .2)) { g.beginPath(); g.arc(q[0][0], q[0][1], pen * SC / 2, 0, 7); g.fill(); continue; }
    g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
  }
  const id = g.getImageData(0, 0, AW, AH).data, A = new Float32Array(AW * AH);
  for (let i = 0; i < A.length; i++) A[i] = id[i * 4 + 3] / 255;
  let br2 = (BASE - oy0) * SC;
  if (SUBS.has(ch)) br2 = (by1 - oy0) * SC - 7 * SC;
  const ox = LB - PAD, oy = -br2 / SC, inkw = bx1 - bx0;
  const d = { src: c.toDataURL('image/png'), iw: +(AW / SC).toFixed(2), ih: +(AH / SC).toFixed(2), ox: +ox.toFixed(2), oy: +oy.toFixed(2), seg: +(inkw + LB + RB).toFixed(2) };
  let cnt = 0; for (let i = 0; i < A.length; i++) if (A[i] > .5) cnt++;
  if (cnt > 60) {
    let xa = AW, xb = -1;
    for (let x = 0; x < AW; x++) for (let y = 0; y < AH; y++) if (A[y * AW + x] > .5) { if (x < xa) xa = x; if (x > xb) xb = x; break; }
    const pt = (lo, hi) => { let sx = 0, sy = 0, n = 0; for (let y = 0; y < AH; y++) for (let x = lo; x <= hi; x++) if (A[y * AW + x] > .5) { sx += x; sy += y; n++; } return n ? [+((sx / n) / SC + ox).toFixed(2), +((sy / n) / SC + oy).toFixed(2)] : null; };
    const en = pt(xa, Math.min(xa + SC, xb)), ex = pt(Math.max(xb - SC, xa), xb);
    if (en && ex) { d.en = en; d.ex = ex; }
  }
  d.st = strokes.map(s => ({ p: s.p.map(([x, y]) => [+(x - ox0).toFixed(2), +(y - oy0).toFixed(2)]), w: pen }));
  return d;
}

// cells: [{ch, v, pack, grp}], onDone(g) mit g = { zeichen: [Zeichen-Objekte] }
export function openDraw({ cells, onDone, onClose, extra = false }) {   // extra: nachträglich ergänzte Varianten/Zeichen (kein „Nur 1×“)
  const modal = h('div', { class: 'modal on', role: 'dialog', 'aria-label': 'Zeichen zeichnen' }); document.body.append(modal);
  const head = h('div', { class: 'bar' }), mb = h('div', { class: 'mb', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 12px', gap: '8px', overflow: 'hidden' } }), mf = h('div', { class: 'mf' });
  modal.append(head, mb, mf);
  const done = new Map(); let idx = 0, strokes = [], cur = null, once = false, ghost = (() => { try { return localStorage.getItem('hs:ghost') !== '0'; } catch (_) { return true; } })(), sawPen = false, ppu = 4;
  const key = (c) => c.ch + '|' + c.v;
  const visible = () => once ? cells.filter(c => c.v === 0) : cells;
  const label = h('div', { style: { fontSize: '17px', lineHeight: 1.25, fontWeight: 600, textAlign: 'center', maxWidth: '100%' } });
  const grp = h('span', { class: 'chip', style: { alignSelf: 'center' } }), prog = h('span', { class: 'chip ac' }), cnt = h('span', { class: 'chip' });
  const cv = h('canvas', { style: { touchAction: 'none', background: '#fff', border: '1px solid var(--bd)', borderRadius: '12px', display: 'block', cursor: 'crosshair' } });
  const ctx = cv.getContext('2d'), base = document.createElement('canvas'), bg = base.getContext('2d');   // base = Hintergrund + fertige Striche (wird nur bei Änderungen neu gemalt)
  const hint = h('p', { class: 'xs mut', style: { margin: 0, textAlign: 'center' } }, 'Schreibe auf die dicke Linie. Kleine Buchstaben reichen bis zur ersten gestrichelten Linie, Großbuchstaben, Ziffern und lange Buchstaben (b, d, h, k, l) bis zur oberen. Nach dem letzten Strich geht es von selbst weiter (der Balken zeigt die Zeit, ein neuer Strich stoppt ihn).');
  // Auto-Weiter: nach dem letzten Strich kurz warten und zum nächsten Zeichen springen (Zeichen mit mehreren Strichen bekommen mehr Zeit)
  const AUTO = { off: ['Auto-Weiter aus', 0], fast: ['Auto-Weiter schnell', 650], normal: ['Auto-Weiter normal', 1000], slow: ['Auto-Weiter langsam', 1600] };
  let auto = 'normal'; try { const a = localStorage.getItem('hs:autoadv'); if (AUTO[a]) auto = a; } catch (_) { /* Speicher gesperrt */ }
  const MULTI = /[ijtfxkäöüÄÖÜ!?:;=+%#"'…÷±]/; let timer = 0;
  const bar = h('div', { style: { width: '100%', maxWidth: '100%', height: '4px', borderRadius: '2px', background: 'var(--surf2)', overflow: 'hidden', flex: 'none' } }, h('i', { style: { display: 'block', height: '100%', width: '0', background: 'var(--ac)' } }));
  const fill = bar.firstChild;
  function cancelAuto() { clearTimeout(timer); timer = 0; fill.style.transition = 'none'; fill.style.width = '0'; }
  function armAuto() {
    cancelAuto(); const base = AUTO[auto][1], c = cells[idx]; if (!base || !c) return;
    const l = list(); if (posOf() >= l.length - 1) return;   // beim letzten Zeichen nicht automatisch weiter
    const ms = base * (MULTI.test(c.ch) || c.ch.normalize('NFD').length > 1 ? 1.7 : 1);
    void fill.offsetWidth; fill.style.transition = `width ${ms}ms linear`; fill.style.width = '100%';
    timer = setTimeout(() => { timer = 0; move(1); }, ms);
  }

  // Feldgröße: kleineres Feld = kleinere, natürlichere Schrift beim Zeichnen (die Striche selbst bleiben gleich gespeichert)
  let fsc = 1; try { const v = parseFloat(localStorage.getItem('hs:fieldsc')); if (v >= .4 && v <= 1) fsc = v; } catch (_) { /* Speicher gesperrt */ }
  const fval = h('span', { class: 'xs mut', style: { minWidth: '34px', textAlign: 'right' } }, Math.round(fsc * 100) + ' %');
  const fsl = h('input', { type: 'range', min: 40, max: 100, step: 5, value: Math.round(fsc * 100), 'aria-label': 'Größe des Zeichenfelds', style: { flex: '1 1 120px', maxWidth: '240px' },
    oninput: () => { fsc = fsl.value / 100; fval.textContent = fsl.value + ' %'; try { localStorage.setItem('hs:fieldsc', String(fsc)); } catch (_) { /* egal */ } size(); } });
  const fieldRow = h('label', { class: 'row', style: { gap: '8px', alignItems: 'center', justifyContent: 'center', width: '100%' } }, h('span', { class: 'sm' }, 'Feldgröße'), fsl, fval);
  function size() {
    const availH = window.innerHeight - 56 - 76 - 120, availW = window.innerWidth - 24;
    ppu = Math.max(1.5, Math.min(availH / CH, availW / CW, 6) * fsc);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cv.style.width = CW * ppu + 'px'; cv.style.height = CH * ppu + 'px'; bar.style.width = CW * ppu + 'px';
    cv.width = base.width = Math.round(CW * ppu * dpr); cv.height = base.height = Math.round(CH * ppu * dpr);
    ctx.setTransform(cv.width / CW, 0, 0, cv.height / CH, 0, 0); bg.setTransform(cv.width / CW, 0, 0, cv.height / CH, 0, 0);
    paint();
  }
  const pen = (s, g = ctx) => { g.strokeStyle = g.fillStyle = INK; g.lineCap = g.lineJoin = 'round'; g.lineWidth = PEN; const q = s.p; if (q.length < 2) { g.beginPath(); g.arc(q[0][0], q[0][1], PEN / 2, 0, 7); g.fill(); return; } g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
  // Vorlage: Schriftgröße so, dass die x-Höhe genau bis zur gestrichelten Linie reicht (Buchstaben, Ziffern, Satzzeichen); Schriftzeichen und Symbole etwas größer
  const FONT = 'system-ui,"Hiragino Sans","PingFang SC","Noto Sans CJK SC",sans-serif'; let latinPx = 0; const TALL = /[0-9bdfhklßðþ]/;
  const fontPx = (ch) => {
    if (/[☀-➿　-ヿ一-鿿]/.test(ch)) return XH * 1.7;
    if (!latinPx) {
      bg.font = `100px ${FONT}`; const a = bg.measureText('x').actualBoundingBoxAscent, c = bg.measureText('H').actualBoundingBoxAscent;
      latinPx = a > 10 && c > 10 ? [Math.max(XH * 1.6, Math.min(XH * 2.4, XH / a * 100)), Math.max(XH * 2.2, Math.min(XH * 3.4, XH * CAP / c * 100))] : [XH * 1.95, XH * 2.7];
    }
    return TALL.test(ch) || ch !== ch.toLowerCase() ? latinPx[1] : latinPx[0];   // Großbuchstaben, Ziffern und lange Buchstaben bis zur oberen Linie
  };
  function paint() {   // alles neu: Hintergrund-Ebene (Linien, Vorlage, fertige Striche) und darüber den laufenden Strich
    bg.clearRect(0, 0, CW, CH);
    const line = (y, col, w, dash) => { bg.beginPath(); bg.setLineDash(dash || []); bg.strokeStyle = col; bg.lineWidth = w; bg.moveTo(0, y); bg.lineTo(CW, y); bg.stroke(); bg.setLineDash([]); };
    line(BASE - XH * CAP, '#b9bff0', .35, [1.5, 1.5]); line(BASE - XH, '#b9bff0', .35, [1.5, 1.5]);
    bg.fillStyle = '#9aa3e6'; bg.font = '2.5px system-ui,sans-serif'; bg.textAlign = 'left'; bg.textBaseline = 'alphabetic'; bg.fillText('Groß, Ziffern, b d h k l', 1.2, BASE - XH * CAP - .9); bg.fillText('klein', 1.2, BASE - XH - .9); line(BASE + XH * .6, '#e4e6f7', .3, [1.5, 1.5]); line(BASE, '#8d98ea', .6);
    const c = cells[idx];
    if (ghost && c) { bg.fillStyle = 'rgba(95,105,150,.26)'; bg.font = `${fontPx(c.ch)}px ${FONT}`; bg.textAlign = 'center'; bg.textBaseline = 'alphabetic'; bg.fillText(c.ch, CW / 2, BASE); }
    for (const s of strokes) pen(s, bg);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(base, 0, 0); ctx.restore();
    if (cur && cur.p.length) pen(cur);
  }
  // Beim Schreiben wird nur das neue Stück Linie dazugemalt – das bleibt auch bei vielen Strichen flüssig
  const extend = (from) => {
    const q = cur.p; ctx.strokeStyle = ctx.fillStyle = INK; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = PEN;
    ctx.beginPath(); ctx.moveTo(q[from - 1][0], q[from - 1][1]); for (let i = from; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.stroke();
  };
  const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * CW, (e.clientY - r.top) / r.height * CH]; };
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'pen') sawPen = true; if (e.pointerType === 'touch' && sawPen) return;   // Handfläche ignorieren, wenn ein Stift benutzt wird
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault(); cancelAuto(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* Zeiger schon weg */ }
    if (cur) { const s0 = cur; cur = null; if (s0.p.length) strokes.push({ p: s0.p }); }   // vorheriger Strich war noch offen (verlorenes Loslassen): nicht wegwerfen
    cur = { p: [pt(e)], id: e.pointerId }; pen(cur);
  });
  cv.addEventListener('pointermove', (e) => {
    if (!cur || e.pointerId !== cur.id) return; e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [], from = cur.p.length;
    for (const ev of evs.length ? evs : [e]) {
      const p = pt(ev), l = cur.p[cur.p.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > .18) cur.p.push(p);
    }
    if (cur.p.length > from) extend(from);
  });
  const up = (e) => {
    if (!cur || e.pointerId !== cur.id) return; const s = cur; cur = null;
    let p = s.p; if (p.length > 4) p = simplify(smooth(p), .06);
    if (p.length) strokes.push({ p });
    paint(); refresh(); if (p.length) armAuto();
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());

  const list = () => visible();
  const posOf = () => { const l = list(), c = cells[idx]; const i = l.indexOf(c); return i < 0 ? l.findIndex(x => cells.indexOf(x) >= idx) : i; };
  function load() {
    cancelAuto(); const c = cells[idx]; strokes = (done.get(key(c)) || []).map(s => ({ p: s.p.map(q => q.slice()) })); cur = null;
    label.textContent = describeChar(c.ch, c.pack); grp.textContent = c.grp + (c.v ? ' · Variante ' + (c.v + 1) : ''); 
    refresh(); paint();
  }
  function refresh() {
    const l = list(), p = Math.max(0, posOf()); prog.textContent = `${p + 1} von ${l.length}`; cnt.textContent = `${done.size} gezeichnet`;
    const last = p >= l.length - 1; mf.replaceChildren(
      btn('Zurück', { disabled: p <= 0, onclick: () => move(-1) }), h('span', { class: 'sp1' }),
      btn(strokes.length ? (last ? 'Fertig' : 'Weiter') : (last ? 'Fertig' : 'Überspringen'), { cls: 'pri', onclick: () => last ? finish() : move(1) }));
    tools.replaceChildren(...[btn('Rückgängig', { cls: 'sm', disabled: !strokes.length, onclick: () => { cancelAuto(); strokes.pop(); refresh(); paint(); } }), btn('Löschen', { cls: 'sm', disabled: !strokes.length, onclick: () => { cancelAuto(); strokes = []; refresh(); paint(); } }),
      btn(AUTO[auto][0], { cls: 'sm' + (auto === 'off' ? '' : ' on'), onclick: () => { const k = Object.keys(AUTO); auto = k[(k.indexOf(auto) + 1) % k.length]; try { localStorage.setItem('hs:autoadv', auto); } catch (_) { /* egal */ } cancelAuto(); refresh(); } }),
      btn(ghost ? 'Vorlage zum Nachzeichnen: an' : 'Vorlage zum Nachzeichnen: aus', { cls: 'sm', onclick: () => { ghost = !ghost; try { localStorage.setItem('hs:ghost', ghost ? '1' : '0'); } catch (_) { /* Speicher gesperrt */ } refresh(); paint(); } }),
      extra ? null : btn(once ? 'Alle Varianten' : 'Nur 1×', { cls: 'sm', onclick: () => { once = !once; if (once && cells[idx].v > 0) { const n = cells.findIndex((c, i) => i > idx && c.v === 0); if (n >= 0) { save(); idx = n; load(); return; } } refresh(); } })].filter(Boolean));
  }
  const tools = h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', justifyContent: 'center' } });
  function save() { const c = cells[idx]; if (strokes.length) done.set(key(c), strokes.map(s => ({ p: s.p }))); else done.delete(key(c)); }
  function move(dir) {
    save(); let n = idx + dir;
    while (n >= 0 && n < cells.length && once && cells[n].v > 0) n += dir;
    if (n < 0 || n >= cells.length) { refresh(); return; } idx = n; load();
  }
  function finish() {
    save(); const out = [];
    for (const c of cells) { const st = done.get(key(c)); if (!st) continue; const d = glyphFromStrokes(c.ch, st); if (d) out.push({ ch: c.ch, d }); }
    if (!out.length) { toast('Du hast noch nichts gezeichnet.', 2800, 'err'); return; }
    cancelAuto(); window.removeEventListener('resize', size); modal.remove(); onDone(out);
  }
  async function close() {
    if (done.size || strokes.length) { if (!(await confirmBox('Alles Gezeichnete verwerfen?', 'Verwerfen'))) return; }
    cancelAuto(); window.removeEventListener('resize', size); modal.remove(); if (onClose) onClose();
  }
  head.append(btn('Abbrechen', { cls: 'ghost icon', icon: 'x', onclick: close }), h('div', { class: 't', style: { display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' } }, prog, cnt),
    btn('Speichern', { cls: 'sm', onclick: finish }));
  mb.append(h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', justifyContent: 'center' } }, label, grp), cv, bar, tools, fieldRow, hint);
  window.addEventListener('resize', size);
  load(); size();
  return { close };
}
