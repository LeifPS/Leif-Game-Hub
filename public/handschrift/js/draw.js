// Zeichen direkt in der App zeichnen. Jeder Strich wird als Strich gespeichert (für GoodNotes)
// und zusätzlich als Bild gerendert (für Vorschau, PDF und PNG).
import { h, toast } from './util.js';
import { btn, confirmBox } from './ui.js';
import { SC, PAD, XH } from './imgops.js';
import { smooth, simplify } from './vec.js';
import { describeChar } from './chardesc.js';

const LB = 0.8, RB = 2.2, PEN = 2.1;
const CW = 72, CH = 100, BASE = 76, CAP = 1.8;                     // Zeichenfläche in Einheiten (x-Höhe = 27 Einheiten)
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
// Mehrere Wiederholungen desselben Zeichens stehen nebeneinander (Feld je Variante); automatisch weiter geht es erst, wenn alle Felder gefüllt sind.
export function openDraw({ cells, onDone, onClose, extra = false }) {   // extra: nachträglich ergänzte Varianten/Zeichen (kein „Nur 1×“)
  const modal = h('div', { class: 'modal on', role: 'dialog', 'aria-label': 'Zeichen zeichnen' }); document.body.append(modal);
  const head = h('div', { class: 'bar' }), mb = h('div', { class: 'mb', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 12px', gap: '8px', overflow: 'auto' } }), mf = h('div', { class: 'mf' });
  modal.append(head, mb, mf);
  const flag = (k, dflt) => { try { const v = localStorage.getItem(k); return v == null ? dflt : v !== '0'; } catch (_) { return dflt; } };
  const setFlag = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch (_) { /* Speicher gesperrt */ } };
  const done = new Map(); let idx = 0, once = false, ghost = flag('hs:ghost', true), multi = flag('hs:multi', true), sawPen = false, ppu = 4;
  let fields = [], act = 0;   // fields: { c, cv, ctx, base, bg, strokes, cur } – ein Feld je Variante der aktuellen Gruppe
  const key = (c) => c.ch + '|' + c.v;
  const label = h('div', { style: { fontSize: '17px', lineHeight: 1.25, fontWeight: 600, textAlign: 'center', maxWidth: '100%' } });
  const grp = h('span', { class: 'chip', style: { alignSelf: 'center' } }), prog = h('span', { class: 'chip ac' }), cnt = h('span', { class: 'chip' });
  const fieldsEl = h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'flex-start', width: '100%' } });
  const hint = h('p', { class: 'xs mut', style: { margin: 0, textAlign: 'center' } }, 'Schreibe auf die dicke Linie. Kleine Buchstaben reichen bis zur ersten gestrichelten Linie, Großbuchstaben, Ziffern und lange Buchstaben (b, d, h, k, l) bis zur oberen. Stehen mehrere Felder nebeneinander, zeichnest du dasselbe Zeichen mehrmals; erst wenn alle gefüllt sind, geht es von selbst weiter.');
  // Auto-Weiter: nach dem letzten Strich kurz warten und zur nächsten Gruppe springen (Zeichen mit mehreren Strichen bekommen mehr Zeit)
  const AUTO = { off: ['Auto-Weiter aus', 0], fast: ['Auto-Weiter schnell', 650], normal: ['Auto-Weiter normal', 1000], slow: ['Auto-Weiter langsam', 1600] };
  let auto = 'normal'; try { const a = localStorage.getItem('hs:autoadv'); if (AUTO[a]) auto = a; } catch (_) { /* Speicher gesperrt */ }
  const MULTI = /[ijtfxkäöüÄÖÜ!?:;=+%#"'…÷±]/; let timer = 0;
  const bar = h('div', { style: { width: '100%', maxWidth: '100%', height: '4px', borderRadius: '2px', background: 'var(--surf2)', overflow: 'hidden', flex: 'none' } }, h('i', { style: { display: 'block', height: '100%', width: '0', background: 'var(--ac)' } }));
  const fill = bar.firstChild;
  function cancelAuto() { clearTimeout(timer); timer = 0; fill.style.transition = 'none'; fill.style.width = '0'; }

  // Gruppen: aufeinanderfolgende Zellen mit demselben Zeichen (höchstens 4) – nur wenn „nebeneinander“ an ist
  const grpLen = (i) => { if (!multi || once) return 1; let n = 1; while (n < 4 && cells[i + n] && cells[i + n].ch === cells[i].ch && cells[i + n].pack === cells[i].pack && !(once && cells[i + n].v > 0)) n++; return n; };
  const starts = () => { const st = []; for (let i = 0; i < cells.length;) { if (once && cells[i].v > 0) { i++; continue; } st.push(i); i += grpLen(i); } return st; };
  const posOf = () => { const st = starts(); let p = 0; for (let k = 0; k < st.length; k++) if (st[k] <= idx) p = k; return { p, n: st.length, st }; };
  function armAuto() {
    cancelAuto(); const base = AUTO[auto][1], c = cells[idx]; if (!base || !c) return;
    if (!fields.length || !fields.every(f => f.strokes.length)) return;   // erst weiter, wenn alle Felder gezeichnet sind
    const { p, n } = posOf(); if (p >= n - 1) return;   // bei der letzten Gruppe nicht automatisch weiter
    const ms = base * (MULTI.test(c.ch) || c.ch.normalize('NFD').length > 1 ? 1.7 : 1);
    void fill.offsetWidth; fill.style.transition = `width ${ms}ms linear`; fill.style.width = '100%';
    timer = setTimeout(() => { timer = 0; move(1); }, ms);
  }

  // Feldgröße: Anzeige 100 % = halbe Maximalgröße (kleineres Feld = natürlichere Schrift; die Striche werden gleich gespeichert)
  let fdisp = 100; try { const v = parseInt(localStorage.getItem('hs:fieldsc2')); if (v >= 50 && v <= 200) fdisp = v; } catch (_) { /* Speicher gesperrt */ }
  const fval = h('span', { class: 'xs mut', style: { minWidth: '40px', textAlign: 'right' } }, fdisp + ' %');
  const fsl = h('input', { type: 'range', min: 50, max: 200, step: 10, value: fdisp, 'aria-label': 'Größe des Zeichenfelds', style: { flex: '1 1 120px', maxWidth: '240px' },
    oninput: () => { fdisp = +fsl.value; fval.textContent = fdisp + ' %'; try { localStorage.setItem('hs:fieldsc2', String(fdisp)); } catch (_) { /* egal */ } size(); } });
  const fieldRow = h('label', { class: 'row', style: { gap: '8px', alignItems: 'center', justifyContent: 'center', width: '100%' } }, h('span', { class: 'sm' }, 'Feldgröße'), fsl, fval);
  function size() {
    const m = Math.max(1, fields.length);
    // verfügbare Höhe = Platz im Fenster minus alles andere (Titel, Knöpfe, Regler, Hinweis), damit nichts unter der Leiste verschwindet
    let rest = 0; for (const el of mb.children) if (el !== fieldsEl) rest += el.getBoundingClientRect().height;
    const availH = mb.clientHeight ? mb.clientHeight - rest - 8 * (mb.children.length - 1) - 20 : window.innerHeight - 56 - 76 - 120, availW = (window.innerWidth - 24 - 8 * (m - 1)) / m;
    ppu = Math.max(1.2, Math.min(availH / CH, availW / CW, 6) * (fdisp / 200));
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    bar.style.width = (m * CW * ppu + 8 * (m - 1)) + 'px';
    for (const f of fields) {
      f.cv.style.width = CW * ppu + 'px'; f.cv.style.height = CH * ppu + 'px';
      f.cv.width = f.base.width = Math.round(CW * ppu * dpr); f.cv.height = f.base.height = Math.round(CH * ppu * dpr);
      f.ctx.setTransform(f.cv.width / CW, 0, 0, f.cv.height / CH, 0, 0); f.bg.setTransform(f.cv.width / CW, 0, 0, f.cv.height / CH, 0, 0);
      paint(f);
    }
  }
  const pen = (s, g) => { g.strokeStyle = g.fillStyle = INK; g.lineCap = g.lineJoin = 'round'; g.lineWidth = PEN; const q = s.p; if (q.length < 2) { g.beginPath(); g.arc(q[0][0], q[0][1], PEN / 2, 0, 7); g.fill(); return; } g.beginPath(); q.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
  // Vorlage: Schriftgröße so, dass die x-Höhe genau bis zur gestrichelten Linie reicht (Buchstaben, Ziffern, Satzzeichen); Schriftzeichen und Symbole etwas größer
  const FONT = 'system-ui,"Hiragino Sans","PingFang SC","Noto Sans CJK SC",sans-serif'; let latinPx = 0; const TALL = /[0-9bdfhklßðþ]/;
  const fontPx = (ch, bg) => {
    if (/[☀-➿　-ヿ一-鿿]/.test(ch)) return XH * 1.7;
    if (!latinPx) {
      bg.font = `100px ${FONT}`; const a = bg.measureText('x').actualBoundingBoxAscent, c = bg.measureText('H').actualBoundingBoxAscent;
      latinPx = a > 10 && c > 10 ? [Math.max(XH * 1.6, Math.min(XH * 2.4, XH / a * 100)), Math.max(XH * 2.2, Math.min(XH * 3.4, XH * CAP / c * 100))] : [XH * 1.95, XH * 2.7];
    }
    return TALL.test(ch) || ch !== ch.toLowerCase() ? latinPx[1] : latinPx[0];   // Großbuchstaben, Ziffern und lange Buchstaben bis zur oberen Linie
  };
  function paint(f) {   // alles neu: Hintergrund-Ebene (Linien, Vorlage, fertige Striche) und darüber den laufenden Strich
    const { bg, ctx, cv, base } = f;
    bg.clearRect(0, 0, CW, CH);
    const line = (y, col, w, dash) => { bg.beginPath(); bg.setLineDash(dash || []); bg.strokeStyle = col; bg.lineWidth = w; bg.moveTo(0, y); bg.lineTo(CW, y); bg.stroke(); bg.setLineDash([]); };
    line(BASE - XH * CAP, '#b9bff0', .35, [1.5, 1.5]); line(BASE - XH, '#b9bff0', .35, [1.5, 1.5]); line(BASE + XH * .6, '#e4e6f7', .3, [1.5, 1.5]); line(BASE, '#8d98ea', .6);
    if (ghost && f.c) { bg.fillStyle = 'rgba(95,105,150,.26)'; bg.font = `${fontPx(f.c.ch, bg)}px ${FONT}`; bg.textAlign = 'center'; bg.textBaseline = 'alphabetic'; bg.fillText(f.c.ch, CW / 2, BASE); }
    for (const s of f.strokes) pen(s, bg);
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(base, 0, 0); ctx.restore();
    if (f.cur && f.cur.p.length) pen(f.cur, ctx);
  }
  // Beim Schreiben wird nur das neue Stück Linie dazugemalt – das bleibt auch bei vielen Strichen flüssig
  const extend = (f, from) => {
    const q = f.cur.p, ctx = f.ctx; ctx.strokeStyle = ctx.fillStyle = INK; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = PEN;
    ctx.beginPath(); ctx.moveTo(q[from - 1][0], q[from - 1][1]); for (let i = from; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]); ctx.stroke();
  };
  const hilite = () => fields.forEach((f, i) => { f.cv.style.borderColor = fields.length > 1 && i === act ? 'var(--ac)' : 'var(--bd)'; });
  function makeField(c) {
    const cv = h('canvas', { style: { touchAction: 'none', background: '#fff', border: '1px solid var(--bd)', borderRadius: '12px', display: 'block', cursor: 'crosshair', flex: 'none' } });
    const base = document.createElement('canvas');   // base = Hintergrund + fertige Striche (wird nur bei Änderungen neu gemalt)
    const f = { c, cv, ctx: cv.getContext('2d'), base, bg: base.getContext('2d'), strokes: (done.get(key(c)) || []).map(s => ({ p: s.p.map(q => q.slice()) })), cur: null };
    const pt = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * CW, (e.clientY - r.top) / r.height * CH]; };
    cv.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'pen') sawPen = true; if (e.pointerType === 'touch' && sawPen) return;   // Handfläche ignorieren, wenn ein Stift benutzt wird
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); cancelAuto(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* Zeiger schon weg */ }
      if (act !== fields.indexOf(f)) { act = fields.indexOf(f); hilite(); refresh(); }
      if (f.cur) { const s0 = f.cur; f.cur = null; if (s0.p.length) f.strokes.push({ p: s0.p }); }   // vorheriger Strich war noch offen (verlorenes Loslassen): nicht wegwerfen
      f.cur = { p: [pt(e)], id: e.pointerId }; pen(f.cur, f.ctx);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!f.cur || e.pointerId !== f.cur.id) return; e.preventDefault();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [], from = f.cur.p.length;
      for (const ev of evs.length ? evs : [e]) {
        const p = pt(ev), l = f.cur.p[f.cur.p.length - 1]; if (Math.hypot(p[0] - l[0], p[1] - l[1]) > .18) f.cur.p.push(p);
      }
      if (f.cur.p.length > from) extend(f, from);
    });
    const up = (e) => {
      if (!f.cur || e.pointerId !== f.cur.id) return; const s = f.cur; f.cur = null;
      let p = s.p; if (p.length > 4) p = simplify(smooth(p), .06);
      if (p.length) f.strokes.push({ p });
      paint(f);
      if (p.length && fields.length > 1 && !MULTI.test(f.c.ch) && f.c.ch.normalize('NFD').length === 1) { const nx = fields.findIndex((g, i) => i > act && !g.strokes.length); if (nx >= 0) { act = nx; hilite(); } }   // Einstrich-Zeichen: nächstes leeres Feld vormerken
      refresh(); if (p.length) armAuto();
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('contextmenu', e => e.preventDefault());
    return f;
  }

  function load() {
    cancelAuto(); const n = grpLen(idx), group = cells.slice(idx, idx + n), c = cells[idx];
    fields = group.map(makeField); fieldsEl.replaceChildren(...fields.map(f => f.cv));
    act = Math.max(0, fields.findIndex(f => !f.strokes.length)); hilite();
    label.textContent = describeChar(c.ch, c.pack); grp.textContent = c.grp + (n > 1 ? ` · ${n} Varianten` : c.v ? ' · Variante ' + (c.v + 1) : '');
    refresh(); size();
  }
  const anyStrokes = () => fields.some(f => f.strokes.length);
  const actF = () => fields[act] || fields[0];
  function refresh() {
    const { p, n } = posOf(); prog.textContent = `${p + 1} von ${n}`; cnt.textContent = `${done.size + fields.filter(f => f.strokes.length && !done.has(key(f.c))).length} gezeichnet`;
    const last = p >= n - 1; mf.replaceChildren(
      btn('Zurück', { disabled: p <= 0, onclick: () => move(-1) }), h('span', { class: 'sp1' }),
      btn(anyStrokes() ? (last ? 'Fertig' : 'Weiter') : (last ? 'Fertig' : 'Überspringen'), { cls: 'pri', onclick: () => last ? finish() : move(1) }));
    const a = actF();
    tools.replaceChildren(...[btn('Rückgängig', { cls: 'sm', disabled: !a || !a.strokes.length, onclick: () => { cancelAuto(); a.strokes.pop(); refresh(); paint(a); } }), btn('Löschen', { cls: 'sm', disabled: !a || !a.strokes.length, onclick: () => { cancelAuto(); a.strokes = []; refresh(); paint(a); } }),
      btn(AUTO[auto][0], { cls: 'sm' + (auto === 'off' ? '' : ' on'), onclick: () => { const k = Object.keys(AUTO); auto = k[(k.indexOf(auto) + 1) % k.length]; try { localStorage.setItem('hs:autoadv', auto); } catch (_) { /* egal */ } cancelAuto(); refresh(); } }),
      btn(ghost ? 'Vorlage zum Nachzeichnen: an' : 'Vorlage zum Nachzeichnen: aus', { cls: 'sm', onclick: () => { ghost = !ghost; setFlag('hs:ghost', ghost); refresh(); fields.forEach(paint); } }),
      btn(multi ? 'Wiederholungen nebeneinander: an' : 'Wiederholungen nebeneinander: aus', { cls: 'sm', onclick: () => { save(); multi = !multi; setFlag('hs:multi', multi); regroup(); } }),
      extra ? null : btn(once ? 'Alle Varianten' : 'Nur 1×', { cls: 'sm', onclick: () => { save(); once = !once; regroup(); } })].filter(Boolean));
  }
  const tools = h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap', justifyContent: 'center' } });
  // Nach Umschalten von „nebeneinander“ / „Nur 1×“: zur Gruppe springen, die das aktuelle Zeichen enthält
  function regroup() {
    const st = starts(); let n = st.filter(s => s <= idx).pop(); if (n == null) n = st[0];
    if (once && cells[idx].v > 0) { const nx = st.find(s => s > idx); if (nx != null) n = nx; }
    idx = n; load();
  }
  function save() { for (const f of fields) { if (f.strokes.length) done.set(key(f.c), f.strokes.map(s => ({ p: s.p }))); else done.delete(key(f.c)); } }
  function move(dir) {
    save(); const { p, st } = posOf(), n = st[p + dir];
    if (n == null) { refresh(); return; } idx = n; load();
  }
  function finish() {
    save(); const out = [];
    for (const c of cells) { const st = done.get(key(c)); if (!st) continue; const d = glyphFromStrokes(c.ch, st); if (d) out.push({ ch: c.ch, d }); }
    if (!out.length) { toast('Du hast noch nichts gezeichnet.', 2800, 'err'); return; }
    cancelAuto(); window.removeEventListener('resize', size); modal.remove(); onDone(out);
  }
  async function close() {
    if (done.size || anyStrokes()) { if (!(await confirmBox('Alles Gezeichnete verwerfen?', 'Verwerfen'))) return; }
    cancelAuto(); window.removeEventListener('resize', size); modal.remove(); if (onClose) onClose();
  }
  head.append(btn('Abbrechen', { cls: 'ghost icon', icon: 'x', onclick: close }), h('div', { class: 't', style: { display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' } }, prog, cnt),
    btn('Speichern', { cls: 'sm', onclick: finish }));
  mb.append(h('div', { class: 'row', style: { gap: '10px', alignItems: 'center', justifyContent: 'center' } }, label, grp), fieldsEl, bar, tools, fieldRow, hint);
  window.addEventListener('resize', size);
  load();
  return { close };
}
