// HDF-Blöcke -> Boxen aus Handschrift-Einträgen und perfekten Strichen.
// Box: { w, h, base, items, align?, md? }  items-Koordinaten relativ zur linken oberen Ecke; base = Abstand von oben bis zur ersten Grundlinie.
// Einträge: Zeichen { g, m, x, y, rot }, Strich { path:{ pts, w, col?, a? } }.
import { parseMath, layoutMath, compile, splitRel, MathError } from './mathx.js';
import { getP, allP, text, textLines, elems, bool, num, splitBar, range, color, isColor, size, MM, KNOWN, normKey } from './hdf.js';

export const shiftItems = (items, dx, dy) => items.map(it => it.path ? { path: { ...it.path, pts: it.path.pts.map(([x, y]) => [x + dx, y + dy]) } }
  : it.hl ? { hl: { ...it.hl, x1: it.hl.x1 + dx, x2: it.hl.x2 + dx, y1: it.hl.y1 + dy, y2: it.hl.y2 + dy } }
  : it.line ? { line: { ...it.line, x1: it.line.x1 + dx, x2: it.line.x2 + dx, y1: it.line.y1 + dy, y2: it.line.y2 + dy } }
  : { ...it, x: it.x + dx, y: it.y + dy });
const P = (pts, w = 1, col, extra) => ({ path: { pts, w, col, ...extra } });
const RED = '#c62828', GRAY = '#8a8f98';
const ASC_RE = /[A-Z0-9bdfhijklt!?()\[\]\/|ßÄÖÜ%&@#$°]/, DESC_RE = /[gjpqyQ(),;\[\]\/|{}ç]/;
const align = (v, d) => { const s = String(v || '').toLowerCase(); return /^(links|left|l)$/.test(s) ? 'links' : /^(mitte|center|centre|zentriert|m)$/.test(s) ? 'mitte' : /^(rechts|right|r)$/.test(s) ? 'rechts' : d; };
const fmtNum = (v, nd, komma) => { let s = (Math.round(v * Math.pow(10, nd)) / Math.pow(10, nd)).toFixed(nd).replace(/\.?0+$/, ''); if (s === '-0' || s === '') s = '0'; return komma ? s.replace('.', ',') : s; };

// Text in Handschrift (Grundlinie = y 0)
export function textBox(ctx, str, sc = 1, col) {
  const items = []; let x = 0, asc = 0, desc = 0;
  str.split(/\s+/).filter(Boolean).forEach((wd, i) => {
    if (i) x += (ctx.space || ctx.u * 1.1) * sc;
    for (const g of ctx.run(wd, sc, col).run) { items.push({ g, m: 1, x, y: g.up ? g.up * ctx.k : 0, rot: g.rot }); x += g.adv; }
  });
  for (const c of str) { asc = Math.max(asc, ASC_RE.test(c) ? 1.85 : /[a-zäöüx]/.test(c) ? 1 : .6); desc = Math.max(desc, DESC_RE.test(c) ? .75 : 0); }
  return { w: x, asc: asc * ctx.u * sc, desc: desc * ctx.u * sc, items };
}
const plainBox = (ctx, str, sc = 1, col) => textBox(ctx, ctx.prep(str), sc, col);
function mathCtx(ctx, o) { return { u: ctx.u, k: ctx.k, line: o.line || ctx.lineMul, run: (s, sc) => ctx.run(s, sc, o.col), has: ctx.has, komma: o.dezimal !== 'punkt', mal: o.mal || 'auto', col: o.col }; }
const LEAD = /^\s*(<=>|=>|<->|->|=|⇔|⇒|↔|→|<=|>=|<|>)\s*(.*)$/;
export function mathBox(ctx, src, o = {}, line) {
  try {
    let s = src, lead = null; const m = LEAD.exec(s); if (m && m[2]) { lead = m[1]; s = m[2]; }
    let ast = parseMath(s); if (lead) ast = { t: 'rest', parts: [{ op: { '<=>': '⇔', '=>': '⇒', '<->': '↔', '->': '→', '<=': '≤', '>=': '≥' }[lead] || lead, e: ast }] };
    return { box: layoutMath(ast, mathCtx(ctx, o), o.sc || 1), ast, ok: true };
  } catch (e) {
    ctx.err(line, 'Formel „' + src.trim().slice(0, 40) + '“: ' + (e instanceof MathError ? e.message : 'ungültig'));
    return { box: textBox(ctx, src, o.sc || 1, RED), ok: false };
  }
}
function opts(el, ctx) {
  const col = color(getP(el, 'stiftfarbe') || getP(el, 'farbe')) || null, g = getP(el, 'groesse');
  let sc = 1; if (g) { const m = /^([\d.,]+)\s*(%|pt)?$/.exec(g.trim()); if (m) { const n = parseFloat(m[1].replace(',', '.')); sc = m[2] === 'pt' ? n / 12 : m[2] === '%' || n > 5 ? n / 100 : n; } }
  const mal = (getP(el, 'malzeichen') || '').toLowerCase();
  return { col, sc: Math.max(.4, Math.min(3, sc)), dezimal: (getP(el, 'dezimal') || 'komma').toLowerCase().startsWith('p') ? 'punkt' : 'komma', mal: /punkt/.test(mal) ? 'punkt' : /kreuz|x/.test(mal) ? 'kreuz' : /weg|kein/.test(mal) ? 'weg' : 'auto', align: align(getP(el, 'ausrichtung')) };
}
// Boxen (Grundlinien-Koordinaten) untereinander stapeln
function vstack(boxes, gap, al = 'links', minW = 0) {
  const W = Math.max(minW, ...boxes.map(b => b.w)); const items = []; let y = 0, base = 0;
  boxes.forEach((b, i) => { y += b.asc; if (i === 0) base = y; const x = al === 'mitte' ? (W - b.w) / 2 : al === 'rechts' ? W - b.w : 0; items.push(...shiftItems(b.items, x, y)); y += b.desc + gap; });
  return { w: W, h: Math.max(0, y - gap), base, items };
}
const srcLines = (el, keys) => { const out = []; for (const k of keys) for (const p of allP(el, k)) if (p.v.trim()) out.push({ s: p.v, line: p.line }); for (const kid of el.kids) if (kid.text != null && kid.text.trim()) out.push({ s: kid.text, line: kid.line }); return out; };
const stripFx = (s) => s.replace(/^\s*[A-Za-z]\w*\s*\(\s*x\s*\)\s*=\s*/, '');

// ---------- Formel ----------
function formulaBlock(el, ctx) {
  const o = opts(el, ctx), L = srcLines(el, ['ausdruck']);
  if (!L.length) { ctx.err(el.line, '[formula] ohne Inhalt', 'warn'); return null; }
  const boxes = L.map(l => mathBox(ctx, l.s, o, l.line).box);
  if (boxes.length > 1) { return { multi: boxes.map(bx => { const v = vstack([{ ...bx, asc: bx.asc + .8 * ctx.u * o.sc, desc: bx.desc + .6 * ctx.u * o.sc }], 0, 'mitte'); v.align = o.align || 'mitte'; return v; }) }; }
  const v = vstack(boxes, .7 * ctx.u * o.sc, 'mitte'); v.align = o.align || 'mitte'; return v;
}
// ---------- Gleichungen (am Gleichheitszeichen ausgerichtet) ----------
function equationBlock(el, ctx) {
  const o = opts(el, ctx), L = srcLines(el, ['zeile', 'ausdruck']);
  if (!L.length) { ctx.err(el.line, '[equation] ohne Zeilen', 'warn'); return null; }
  return lineBlock(L, ctx, o, bool(getP(el, 'ausrichten'), true), o.align || 'mitte');
}
function lineBlock(L, ctx, o, aligned, blockAlign) {
  const u = ctx.u, rows = L.map(l => {
    const parts = splitBar(l.s), expr = parts[0], hint = parts.slice(1).join(' | ');
    const m = mathBox(ctx, expr, o, l.line); let left = m.box, rest = null;
    if (aligned && m.ok && m.ast.t === 'bin' && m.ast.rel) { const sp = splitRel(m.ast); const mc = mathCtx(ctx, o); left = layoutMath(sp.first, mc, o.sc); rest = layoutMath({ t: 'rest', parts: sp.parts }, mc, o.sc); }
    return { left, rest, whole: m.box, hint: hint ? plainBox(ctx, hint, .9 * o.sc, o.col) : null, ok: m.ok };
  });
  const colX = aligned ? Math.max(...rows.map(r => r.rest ? r.left.w : 0)) : 0;
  const lineW = Math.max(...rows.map(r => aligned && r.rest ? colX + r.rest.w : aligned ? colX + (r.rest ? 0 : 0) + r.whole.w : r.whole.w));
  const hintX = lineW + 2.4 * u, items = []; let y = 0, base = 0, W = lineW;
  rows.forEach((r, i) => {
    const asc = Math.max(r.whole.asc, r.hint ? r.hint.asc : 0), desc = Math.max(r.whole.desc, r.hint ? r.hint.desc : 0);
    y += asc; if (i === 0) base = y;
    if (aligned && r.rest) { items.push(...shiftItems(r.left.items, colX - r.left.w, y), ...shiftItems(r.rest.items, colX, y)); }
    else items.push(...shiftItems(r.whole.items, 0, y));
    if (r.hint) { const cy = y - (asc - desc) / 2, hh = (asc + desc) / 2 * .92; items.push(P([[hintX, cy - hh], [hintX, cy + hh]], 1, o.col)); items.push(...shiftItems(r.hint.items, hintX + .55 * u, y)); W = Math.max(W, hintX + .55 * u + r.hint.w); }
    y += desc + .75 * u;
  });
  return { w: Math.max(lineW, ...rows.map(r => r.hint ? 0 : 0)), ext: W, h: Math.max(0, y - .75 * u), base, items, align: blockAlign };
}
// ---------- Rechenweg ----------
function calcBlock(el, ctx) {
  const o = opts(el, ctx), L = [];
  for (const k of el.kids) {
    if (k.name === 'step') { const e = getP(k, 'ausdruck') || text(k).trim(), h = getP(k, 'hinweis') || getP(k, 'beschriftung'), b = getP(k, 'begruendung'); if (e) L.push({ s: e + (h ? ' | ' + h : ''), line: k.line, why: b }); }
    else if (k.text != null && k.text.trim()) L.push({ s: k.text, line: k.line });
  }
  for (const k of ['schritt', 'zeile']) for (const p of allP(el, k)) L.push({ s: p.v, line: p.line });
  if (!L.length) { ctx.err(el.line, '[calculation] ohne Schritte', 'warn'); return null; }
  const al = o.align || 'mitte', body = lineBlock(L, ctx, o, bool(getP(el, 'ausrichten'), true), al);
  const t = getP(el, 'titel'); if (!t) return body;
  const tb = textBox(ctx, ctx.prep(t), 1.05, o.col), gap = .6 * ctx.u, W = Math.max(body.w, tb.w), dx = al === 'links' ? 0 : (W - body.w) / 2;
  const items = [...shiftItems(tb.items, 0, tb.asc), ...shiftItems(body.items, dx, tb.asc + tb.desc + gap)];
  return { w: W, ext: Math.max(body.ext + dx, tb.w), h: tb.asc + tb.desc + gap + body.h, base: tb.asc, items, align: al };
}
// ---------- Bruch / Wurzel als eigene Elemente ----------
function fractionBlock(el, ctx) {
  const o = opts(el, ctx), n = getP(el, 'zaehler'), d = getP(el, 'nenner');
  if (n == null || d == null) { ctx.err(el.line, '[fraction] braucht zaehler und nenner'); return null; }
  const m = mathBox(ctx, `frac(${n}, ${d})`.replace(/\s+/g, ' '), o, el.line); return vstack([m.box], 0, 'mitte');
}
function rootBlock(el, ctx) {
  const o = opts(el, ctx), e = getP(el, 'ausdruck') || text(el).trim(), g = getP(el, 'grad');
  if (!e) { ctx.err(el.line, '[root] ohne ausdruck'); return null; }
  const m = mathBox(ctx, g && g !== '2' ? `root(${e}, ${g})` : `sqrt(${e})`, o, el.line); return vstack([m.box], 0, 'mitte');
}

// ---------- Tabellen ----------
function cellBox(ctx, s, sc, col, komma) {
  let t = s.trim(); if (/^-?\d+\.\d+$/.test(t) && komma) t = t.replace('.', ',');
  if (/^\$(.+)\$$/.test(t)) return mathBox(ctx, t.slice(1, -1), { sc, col, dezimal: komma ? 'komma' : 'punkt' }).box;
  return plainBox(ctx, t, sc, col);
}
function tableFromRows(ctx, head, rows, o, el) {
  const u = ctx.u, W = ctx.W; let sc = o.sc || 1;
  const build = (sc) => {
    const cells = [head, ...rows].filter(Boolean).map((r, ri) => r.map(s => cellBox(ctx, s, sc, o.col, o.dezimal !== 'punkt')));
    const nc = Math.max(...cells.map(r => r.length)), padX = .9 * u * sc, padY = .55 * u * sc;
    const cw = Array(nc).fill(0); cells.forEach(r => r.forEach((b, i) => cw[i] = Math.max(cw[i], b.w + 2 * padX)));
    return { cells, nc, padX, padY, cw };
  };
  let T = build(sc); const tot = (T) => T.cw.reduce((a, b) => a + b, 0);
  const fixed = getP(el, 'breite') != null ? size(getP(el, 'breite'), W, null) : null;
  while (tot(T) > W && sc > .6) { sc -= .08; T = build(sc); }
  if (fixed && fixed > tot(T)) { const f = fixed / tot(T); T.cw = T.cw.map(c => c * f); }
  const gc = ctx.grid ? ctx.grid.cell : 0, up = (v) => gc ? Math.ceil(v / gc - 1e-6) * gc : v;
  if (gc) T.cw = T.cw.map(up);
  const rh = T.cells.map(r => up(Math.max(2.4 * u * sc, ...r.map(b => b.asc + b.desc + 2 * T.padY))));
  const items = [], Wt = tot(T), Ht = rh.reduce((a, b) => a + b, 0), border = bool(getP(el, 'rahmen'), true), col = o.col;
  const al = align(getP(el, 'ausrichtung'), 'mitte'); let y = 0;
  T.cells.forEach((r, ri) => {
    let x = 0;
    r.forEach((b, ci) => {
      const cwid = T.cw[ci], cx = al === 'links' ? x + T.padX : al === 'rechts' ? x + cwid - T.padX - b.w : x + (cwid - b.w) / 2;
      const by = y + (rh[ri] - (b.asc + b.desc)) / 2 + b.asc; items.push(...shiftItems(b.items, cx, by)); x += cwid;
    });
    y += rh[ri];
  });
  if (border) {
    items.push(P([[0, 0], [Wt, 0], [Wt, Ht], [0, Ht], [0, 0]], 1.1, col));
    let yy = 0; for (let i = 0; i < rh.length - 1; i++) { yy += rh[i]; items.push(P([[0, yy], [Wt, yy]], i === 0 && head ? 1.1 : .8, col)); }
    let xx = 0; for (let i = 0; i < T.cw.length - 1; i++) { xx += T.cw[i]; items.push(P([[xx, 0], [xx, Ht]], .8, col)); }
  }
  return { w: Wt, h: Ht, base: 1.85 * u, flat: true, items, align: o.align || 'mitte', snap: ctx.gridOk ? { x: 0, y: 0 } : null };
}
function tableBlock(el, ctx) {
  const o = opts(el, ctx); let head = null; const rows = [];
  const h = getP(el, 'kopf'); if (h) head = splitBar(h);
  for (const k of el.kids) if (k.name === 'row') { const cells = elems(k, 'cell'); if (cells.length) rows.push(cells.map(c => text(c).trim())); else rows.push(splitBar(text(k).trim())); }
  for (const p of allP(el, 'zeile')) rows.push(splitBar(p.v));
  if (!rows.length && !head) { ctx.err(el.line, '[table] ohne Zeilen', 'warn'); return null; }
  const bw = tableFromRows(ctx, head, rows, o, el), t = getP(el, 'titel');
  if (!t) return bw;
  const tb = textBox(ctx, ctx.prep(t), 1, o.col), dY = tb.asc + tb.desc + .5 * ctx.u, items = [...shiftItems(tb.items, (bw.w - tb.w) / 2, tb.asc), ...shiftItems(bw.items, 0, dY)];
  return { ...bw, items, h: bw.h + dY, base: tb.asc, snap: bw.snap ? { x: 0, y: dY } : null };
}
function valueTableBlock(el, ctx) {
  const o = opts(el, ctx), fs = getP(el, 'funktion'); if (!fs) { ctx.err(el.line, '[value_table] braucht funktion'); return null; }
  let fn; try { fn = compile(parseMath(stripFx(fs))); } catch (e) { ctx.err(el.line, 'Funktion „' + fs + '“: ' + e.message); return null; }
  const a = num(getP(el, 'xvon'), -3), b = num(getP(el, 'xbis'), 3), st = Math.abs(num(getP(el, 'schritt'), 1)) || 1, nd = num(getP(el, 'nachkommastellen'), 2), komma = o.dezimal !== 'punkt';
  const xs = []; for (let x = a; x <= b + 1e-9 && xs.length < 60; x += st) xs.push(Math.round(x * 1e6) / 1e6);
  const names = splitBar(getP(el, 'kopf') || getP(el, 'spaltenname') || 'x | f(x)'), ys = xs.map(x => { try { const y = fn(x); return isFinite(y) ? fmtNum(y, nd, komma) : '–'; } catch (e) { return '–'; } });
  const xl = xs.map(x => fmtNum(x, nd, komma)), dir = (getP(el, 'richtung') || 'waagerecht').toLowerCase();
  let rows, head = null;
  const horiz = !/senk|vert/.test(dir); const tryH = [[names[0] || 'x', ...xl], [names[1] || 'f(x)', ...ys]];
  const o2 = { ...o, align: o.align || 'mitte' };
  if (horiz) { const probe = tableFromRows(ctx, null, tryH, o2, { kids: [], props: [] }); if (probe.w <= ctx.W * 1.0 || xs.length <= 6) { probe.align = o2.align; return probe; } }
  return tableFromRows(ctx, names.slice(0, 2), xs.map((x, i) => [xl[i], ys[i]]), o2, { kids: [], props: [] });
}

// ---------- Container mit Text: Hinweis, Beispiel, Aufgabe, Zitat, Gruppe, Spalten ----------
const kidsOf = (el, pre) => [...(pre ? [{ text: pre, line: el.line }] : []), ...el.kids];
function framed(el, ctx, o) {
  const u = ctx.u, W = ctx.W, pad = o.pad == null ? .7 * u : o.pad, innerW = W - 2 * pad - (o.bar ? .6 * u : 0);
  const s = ctx.sub(kidsOf(el, o.title ? '**' + o.title + '**' : null), innerW), base = 1.85 * u + pad, h = base + (s.rows - 1) * ctx.lineH + .75 * u + pad, items = [];
  const col = o.col || GRAY;
  if (o.border) items.push(P([[0, 0], [W, 0], [W, h], [0, h], [0, 0]], 1.1, o.bcol));
  if (o.bar) items.push(P([[.2 * u, .1 * u], [.2 * u, h - .1 * u]], 1.6, o.bcol));
  items.push(...shiftItems(s.items, pad + (o.bar ? .6 * u : 0), base - ctx.lineH));
  return { w: W, h, base, items, align: 'links' };
}
function noteBlock(el, ctx, label) { const o = opts(el, ctx); return framed(el, ctx, { title: getP(el, 'titel') || label, border: bool(getP(el, 'rand'), true), bcol: color(getP(el, 'randfarbe')) || o.col }); }
function taskBlock(el, ctx) {
  const o = opts(el, ctx), u = ctx.u, W = ctx.W, nr = getP(el, 'nummer'), pt = getP(el, 'punkte'), ind = 2.6 * u;
  const pb = pt ? textBox(ctx, ctx.prep('(' + pt + (/p/i.test(pt) ? '' : ' P.') + ')'), .85, o.col) : null;
  const s = ctx.sub(el.kids, W - ind - (pb ? pb.w + 1.2 * u : 0)), items = [], lab = textBox(ctx, nr ? nr + '.' : '•', 1.05, o.col);
  items.push(...shiftItems(lab.items, 0, ctx.lineH), ...shiftItems(s.items, ind, 0));
  if (pb) items.push(...shiftItems(pb.items, W - pb.w, ctx.lineH));
  return { w: W, h: s.rows * ctx.lineH, base: ctx.lineH, items, align: 'links' };
}
function answerBlock(el, ctx) {
  const u = ctx.u, W = ctx.W, h = size(getP(el, 'hoehe'), ctx.PH - ctx.MT - ctx.MB, 28 * MM), n = Math.round(num(getP(el, 'linien'), 0)), items = [P([[0, 0], [W, 0], [W, h], [0, h], [0, 0]], .7, GRAY, { a: .8 })];
  if (n > 0) { const gap = h / (n + 1); for (let i = 1; i <= n; i++) items.push(P([[.6 * u, gap * i], [W - .6 * u, gap * i]], .4, GRAY, { a: .7 })); }
  if (bool(getP(el, 'kaestchen'), false)) { const g = ctx.lineH * .5; for (let x = g; x < W; x += g) items.push(P([[x, 0], [x, h]], .3, GRAY, { a: .6 })); for (let y = g; y < h; y += g) items.push(P([[0, y], [W, y]], .3, GRAY, { a: .6 })); }
  return { w: W, h, base: 1.85 * u, flat: true, items, align: 'links' };
}
function columnsBlock(el, ctx) {
  const cols = elems(el, 'column'); if (!cols.length) { ctx.err(el.line, '[columns] ohne [column]', 'warn'); return null; }
  const W = ctx.W, gap = size(getP(el, 'abstand'), W, 6 * MM), n = cols.length;
  let ws = cols.map(c => size(getP(c, 'breite'), W, null)); const fixedSum = ws.reduce((a, b) => a + (b || 0), 0), free = ws.filter(v => v == null).length;
  const avail = W - gap * (n - 1); ws = ws.map(v => v == null ? Math.max(40, (avail - fixedSum) / free) : v);
  const tot = ws.reduce((a, b) => a + b, 0); if (tot > avail) ws = ws.map(v => v * avail / tot);
  const items = []; let x = 0, rows = 1;
  cols.forEach((c, i) => { const s = ctx.sub(c.kids, ws[i]); rows = Math.max(rows, s.rows); items.push(...shiftItems(s.items, x, 0)); x += ws[i] + gap; });
  return { w: W, h: rows * ctx.lineH, base: ctx.lineH, items, align: 'links' };
}
function quoteBlock(el, ctx) { return framed(el, ctx, { bar: true, border: false, pad: .3 * ctx.u, bcol: GRAY }); }
function groupBlock(el, ctx) { const o = opts(el, ctx); return framed(el, ctx, { border: bool(getP(el, 'rand'), false), bcol: o.col, pad: bool(getP(el, 'rand'), false) ? .7 * ctx.u : 0 }); }
function dashed(a, b, col, w = .8) { const out = []; const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), n = Math.max(1, Math.round(L / 14)); for (let i = 0; i < n; i += 1) { const t0 = i / n, t1 = (i + .6) / n; out.push(P([[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]], w, col)); } return out; }
function placeholder(el, ctx, msg) {
  const u = ctx.u, W = ctx.W, h = 5 * u, items = [...dashed([0, 0], [W, 0], RED), ...dashed([W, 0], [W, h], RED), ...dashed([W, h], [0, h], RED), ...dashed([0, h], [0, 0], RED)];
  const t = textBox(ctx, ctx.prep(msg), .9, RED); items.push(...shiftItems(t.items, .8 * u, h / 2 + t.asc / 2));
  ctx.err(el.line, msg, 'warn'); return { w: W, h, base: 1.85 * u, flat: true, items, align: 'links' };
}

// ---------- Koordinatensystem ----------
const FN_COLORS = ['#1d4ed8', '#d32f2f', '#1b8a3a', '#e8710a', '#7b3fa0', '#0e9aa7'];
function niceStep(r, n) { const raw = r / Math.max(1, n), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
function clipSeg(a, b, R) {   // Liang–Barsky: Strecke am Rechteck abschneiden
  let t0 = 0, t1 = 1; const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - R.x0], [dx, R.x1 - a[0]], [-dy, a[1] - R.y0], [dy, R.y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return null; } else { const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } }
  }
  return [[a[0] + t0 * dx, a[1] + t0 * dy], [a[0] + t1 * dx, a[1] + t1 * dy]];
}
function dashPoly(pts, dash, gap) {   // Polylinie in Striche zerlegen
  const out = []; let cur = [], on = true, left = dash;
  for (let i = 0; i < pts.length - 1; i++) {
    let a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L === 0) continue; let t = 0;
    while (L - t > 1e-6) {
      const step = Math.min(left, L - t), p0 = [a[0] + (b[0] - a[0]) * t / L, a[1] + (b[1] - a[1]) * t / L], p1 = [a[0] + (b[0] - a[0]) * (t + step) / L, a[1] + (b[1] - a[1]) * (t + step) / L];
      if (on) { if (!cur.length) cur.push(p0); cur.push(p1); } t += step; left -= step;
      if (left <= 1e-6) { if (on && cur.length) { out.push(cur); cur = []; } on = !on; left = on ? dash : gap; }
    }
  }
  if (cur.length > 1) out.push(cur); return out;
}
function parseXY(s) { const m = String(s || '').match(/^\s*\(?\s*(-?[\d.,]+)\s*[,;|]\s*(-?[\d.,]+)\s*\)?\s*$/); return m ? [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] : null; }
const LS = (v) => { const s = String(v || '').toLowerCase(); return /gestrich|dash/.test(s) ? 'dash' : /gepunkt|dot/.test(s) ? 'dot' : 'solid'; };
function graphBlock(el, ctx) {
  const o = opts(el, ctx), u = ctx.u, W = ctx.W, ink = o.col || null, komma = o.dezimal !== 'punkt', items = [];
  // Wertebereiche
  const xr = range(getP(el, 'xbereich')), yr = range(getP(el, 'ybereich'));
  let xmin = num(getP(el, 'xmin'), xr ? xr[0] : -5), xmax = num(getP(el, 'xmax'), xr ? xr[1] : 5), ymin = num(getP(el, 'ymin'), yr ? yr[0] : -5), ymax = num(getP(el, 'ymax'), yr ? yr[1] : 5);
  if (xmax <= xmin || ymax <= ymin) { ctx.err(el.line, 'Graph: ungültige Wertebereiche (min muss kleiner als max sein)'); [xmin, xmax, ymin, ymax] = [-5, 5, -5, 5]; }
  // Funktionen sammeln (Unterelemente und Kurzform)
  const F = [];
  const addFn = (expr, line, opt = {}) => { let ast, fn; try { ast = parseMath(stripFx(expr)); fn = compile(ast); fn(0); } catch (e) { if (!(e instanceof MathError) || /Variable|Ausdruck endet|Klammer|Unerwartet/.test(e.message)) { ctx.err(line, 'Funktion „' + expr + '“: ' + e.message); return; } } F.push({ expr, fn, ast, ...opt }); };
  for (const k of el.kids) {
    if (k.name !== 'function') continue; const e = getP(k, 'ausdruck') || text(k).trim(); if (!e) { ctx.err(k.line, '[function] ohne ausdruck'); continue; }
    addFn(e, k.line, { col: color(getP(k, 'farbe')), w: num(getP(k, 'linienbreite'), 0), ls: LS(getP(k, 'linienart')), name: getP(k, 'name'), dom: range(getP(k, 'bereich')), nst: getP(k, 'nullstellen') != null ? bool(getP(k, 'nullstellen')) : null, ext: getP(k, 'extrema') != null ? bool(getP(k, 'extrema')) : null });
  }
  for (const p of allP(el, 'funktion')) {
    const t = splitBar(p.v), opt = { col: null, w: 0, ls: 'solid', name: null, dom: null };
    for (const x of t.slice(1)) { if (isColor(x)) opt.col = color(x); else if (/^(gestrichelt|gepunktet|dash|dotted|durchgezogen|solid)$/i.test(x)) opt.ls = LS(x); else { const m = /^(\w+)\s*=\s*(.*)$/.exec(x); if (m) { const k = normKey(m[1]); if (k === 'name' || k === 'beschriftung') opt.name = m[2]; else if (k === 'bereich') opt.dom = range(m[2]); else if (k === 'farbe') opt.col = color(m[2]); else if (k === 'linienbreite') opt.w = num(m[2], 0); else if (k === 'linienart') opt.ls = LS(m[2]); } else opt.name = x; } }
    addFn(t[0], p.line, opt);
  }
  // Maße
  const labelsOf = (a, b, st) => { const out = []; for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9; v += st) out.push(Math.round(v / st) * st); return out; };
  const gl = getP(el, 'gleichskaliert') != null ? bool(getP(el, 'gleichskaliert')) : /geometr|konstruktion/i.test(el.rawName || '');
  const G0 = ctx.gridOk ? ctx.grid : null;
  let gw = size(getP(el, 'breite'), W, (G0 ? 1 : .85) * W); gw = Math.min(gw, W);
  const maxH = (ctx.PH - ctx.MT - ctx.MB) * .88;
  const sxN = getP(el, 'skalax') != null ? num(getP(el, 'skalax')) : num(getP(el, 'skala'), null), syN = getP(el, 'skalay') != null ? num(getP(el, 'skalay')) : num(getP(el, 'skala'), null);
  const showNums = bool(getP(el, 'zahlen'), true), showAxes = bool(getP(el, 'achsen'), true), t0 = getP(el, 'raster');
  const padL = showNums ? 3.2 * u : 1.2 * u, padB = showNums ? 2.8 * u : 1.2 * u, padT = 1.7 * u, padR = 2.2 * u;
  const title = getP(el, 'titel'); const tb = title ? textBox(ctx, ctx.prep(title), 1.05, ink) : null;
  const top = tb ? tb.asc + tb.desc + .5 * u : 0;
  let pw = gw - padL - padR, ph, G = null, cpu = 1;
  if (G0) {   // Kariertes Papier: 1 Einheit = ganze Kästchen, Achsen und Ticks liegen auf den Gitterlinien
    const availW = gw - padL - padR, availH = maxH - padT - padB - top, want = num(getP(el, 'einheit'), null), cands = want ? [want] : [2, 1, .5, .25];
    const c = cands.find(c => (xmax - xmin) * c * G0.cell <= availW + 1e-6 && (ymax - ymin) * c * G0.cell <= availH + 1e-6);
    if (c) { G = G0; cpu = c; pw = (xmax - xmin) * cpu * G.cell; ph = (ymax - ymin) * cpu * G.cell; }
    else ctx.err(el.line, 'Graph ist für das Gitter zu groß – Bereich verkleinern oder „einheit“ kleiner wählen (Kästchen pro Einheit)', 'warn');
  }
  if (!G) {
    if (getP(el, 'hoehe') != null) ph = size(getP(el, 'hoehe'), ctx.PH - ctx.MT - ctx.MB, 40 * MM) - padT - padB;
    else if (gl) ph = pw * (ymax - ymin) / (xmax - xmin); else ph = pw * .64;
    if (ph + padT + padB + top > maxH) { const f = (maxH - padT - padB - top) / ph; ph *= f; if (gl) pw *= f; }
  }
  const gridOn = t0 == null ? !G : (num(t0, null) != null && !/^[01]$/.test(String(t0).trim()) && num(t0) > 0) ? true : bool(t0, true);
  const gridStep = t0 != null && num(t0, null) != null && !/^[01]$/.test(String(t0).trim()) ? num(t0) : null;
  const gwTot = pw + padL + padR, X0 = padL, Y0 = top + padT;
  const fx = (x) => X0 + (x - xmin) / (xmax - xmin) * pw, fy = (y) => Y0 + (ymax - y) / (ymax - ymin) * ph;
  const ux = cpu < 1 ? Math.round(1 / cpu) : 1;
  const stepX = sxN || (G ? ux : niceStep(xmax - xmin, pw / (4 * u))), stepY = syN || (G ? ux : niceStep(ymax - ymin, ph / (3.4 * u)));
  const R = { x0: X0, x1: X0 + pw, y0: Y0, y1: Y0 + ph };
  if (tb) items.push(...shiftItems(tb.items, (gwTot - tb.w) / 2, tb.asc));
  const gsX = gridStep || stepX, gsY = gridStep || stepY, GC = '#9aa3b0';
  if (gridOn) { for (const x of labelsOf(xmin, xmax, gsX)) items.push(P([[fx(x), R.y0], [fx(x), R.y1]], .3, GC, { a: .65 })); for (const y of labelsOf(ymin, ymax, gsY)) items.push(P([[R.x0, fy(y)], [R.x1, fy(y)]], .3, GC, { a: .65 })); }
  // Achsen
  const ax0 = Math.min(Math.max(fy(0), R.y0), R.y1), ay0 = Math.min(Math.max(fx(0), R.x0), R.x1);
  const arrow = (tip, dir) => { const L = .7 * u, a = .42; const [dx, dy] = dir; const rot = (ang) => [tip[0] - L * (dx * Math.cos(ang) - dy * Math.sin(ang)), tip[1] - L * (dx * Math.sin(ang) + dy * Math.cos(ang))]; return P([rot(a), tip, rot(-a)], 1, ink); };
  if (showAxes) {
    items.push(P([[R.x0 - .3 * u, ax0], [R.x1 + 1.2 * u, ax0]], 1.1, ink), arrow([R.x1 + 1.2 * u, ax0], [1, 0]));
    items.push(P([[ay0, R.y1 + .3 * u], [ay0, R.y0 - 1.1 * u]], 1.1, ink), arrow([ay0, R.y0 - 1.1 * u], [0, -1]));
    const xl = getP(el, 'xbeschriftung') || 'x', yl = getP(el, 'ybeschriftung') || 'y';
    const xb = mathBox(ctx, xl, { sc: .9, col: ink }).box, yb = mathBox(ctx, yl, { sc: .9, col: ink }).box;
    items.push(...shiftItems(xb.items, R.x1 + 1.5 * u, ax0 + xb.asc + .2 * u), ...shiftItems(yb.items, ay0 + .5 * u, R.y0 - 1.1 * u + yb.asc * .6));
    // Teilstriche und Zahlen
    const t = .3 * u;
    for (const x of labelsOf(xmin, xmax, stepX)) { if (Math.abs(x) < 1e-9) continue; items.push(P([[fx(x), ax0 - t], [fx(x), ax0 + t]], .9, ink)); if (showNums) { const b = textBox(ctx, fmtNum(x, 4, komma), .8, ink); items.push(...shiftItems(b.items, fx(x) - b.w / 2, Math.min(ax0 + t + .35 * u + b.asc, R.y1 + 2.5 * u))); } }
    for (const y of labelsOf(ymin, ymax, stepY)) { if (Math.abs(y) < 1e-9) continue; items.push(P([[ay0 - t, fy(y)], [ay0 + t, fy(y)]], .9, ink)); if (showNums) { const b = textBox(ctx, fmtNum(y, 4, komma), .8, ink); items.push(...shiftItems(b.items, ay0 - t - .35 * u - b.w, fy(y) + b.asc * .42)); } }
    if (showNums && xmin <= 0 && xmax >= 0 && ymin <= 0 && ymax >= 0 && pw / (xmax - xmin) >= 52 && ph / (ymax - ymin) >= 52) { const b = textBox(ctx, '0', .8, ink); items.push(...shiftItems(b.items, ay0 - .35 * u - b.w, ax0 + .35 * u + b.asc)); }
  }
  // Funktionen zeichnen
  const roots = [], marks = [];
  F.forEach((f, i) => {
    const col = f.col || (F.length === 1 && !f.col ? FN_COLORS[0] : FN_COLORS[i % FN_COLORS.length]), a = f.dom ? Math.max(xmin, f.dom[0]) : xmin, b = f.dom ? Math.min(xmax, f.dom[1]) : xmax, N = Math.max(400, Math.round(pw * 1.5));
    let pts = [], lines = [], prev = null; const span = ymax - ymin;
    const flush = () => { if (pts.length > 1) lines.push(pts); pts = []; };
    for (let j = 0; j <= N; j++) {
      const x = a + (b - a) * j / N; let y; try { y = f.fn(x); } catch (e) { y = NaN; }
      if (!isFinite(y)) { flush(); prev = null; continue; }
      const cur = [fx(x), fy(y)];
      if (prev) {
        const pj = (prev.y > ymax + span && y < ymin - span) || (prev.y < ymin - span && y > ymax + span) || Math.abs(y - prev.y) > span * 4;
        if (pj) { flush(); prev = { y, p: cur }; continue; }
        const seg = clipSeg(prev.p, cur, R);
        if (seg) { if (!pts.length || Math.hypot(pts[pts.length - 1][0] - seg[0][0], pts[pts.length - 1][1] - seg[0][1]) > .5) { flush(); pts.push(seg[0]); } pts.push(seg[1]); } else flush();
      }
      prev = { y, p: cur };
    }
    flush();
    const lw = f.w || 1.5;
    for (const ln of lines) { if (f.ls === 'solid') items.push(P(ln, lw, col)); else for (const d of dashPoly(ln, f.ls === 'dot' ? 1.2 : 1.1 * u, f.ls === 'dot' ? .9 * u : .7 * u)) items.push(P(d, lw, col, f.ls === 'dot' ? {} : {})); }
    f.col2 = col; f.lines = lines;
    // Beschriftung am rechten Rand
    if (f.name && !bool(getP(el, 'legende'), false)) { const last = lines.length ? lines[lines.length - 1] : null; const nb = mathBox(ctx, f.name, { sc: .85, col }).box; let px, py; if (last) { const p = last[last.length - 1]; px = Math.min(p[0] - nb.w - 1.3 * u, R.x1 - nb.w); py = p[1] + .2 * u; if (py < R.y0 + nb.asc) py = R.y0 + nb.asc + .3 * u; items.push(...shiftItems(nb.items, Math.max(R.x0, px), py)); } }
    // Nullstellen, Extrema
    const wantRoots = f.nst != null ? f.nst : bool(getP(el, 'nullstellen'), false), wantExt = f.ext != null ? f.ext : bool(getP(el, 'extrema'), false);
    const S0 = 2400; let py0 = null, px0 = null, dy0 = null;
    const fv = (x) => { try { const y = f.fn(x); return isFinite(y) ? y : NaN; } catch (e) { return NaN; } };
    for (let j = 0; j <= S0; j++) {
      const x = a + (b - a) * j / S0, y = fv(x);
      if (wantRoots && py0 != null && isFinite(y) && isFinite(py0) && (py0 === 0 ? false : (py0 < 0) !== (y < 0) || y === 0) && Math.abs(y - py0) < span) { let lo = px0, hi = x; for (let q = 0; q < 50; q++) { const m = (lo + hi) / 2, ym = fv(m); if ((fv(lo) < 0) === (ym < 0)) lo = m; else hi = m; } const xr0 = (lo + hi) / 2; if (!roots.some(r => Math.abs(r[0] - xr0) < 1e-4)) { roots.push([xr0, 0]); marks.push({ x: xr0, y: 0, label: 'N', col }); } }
      if (wantExt && py0 != null && isFinite(y)) { const dy = y - py0; if (dy0 != null && dy0 !== 0 && dy !== 0 && (dy0 > 0) !== (dy > 0)) { let lo = px0 - (b - a) / S0, hi = x; for (let q = 0; q < 60; q++) { const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3, up = dy0 > 0; if ((fv(m1) < fv(m2)) === up) lo = m1; else hi = m2; } const xe = (lo + hi) / 2, ye = fv(xe); if (isFinite(ye) && ye >= ymin && ye <= ymax) { const par = Math.abs(fv(xe + 1) + fv(xe - 1) - 2 * ye - (fv(xe + 2) + fv(xe - 2) - 2 * ye) / 4) < 1e-6; marks.push({ x: xe, y: ye, label: par ? 'S' : dy0 > 0 ? 'H' : 'T', col }); } } dy0 = dy; }
      py0 = y; px0 = x; if (wantExt && dy0 == null) dy0 = null;
    }
  });
  // Schnittpunkte
  if (bool(getP(el, 'schnittpunkte'), false) && F.length > 1) for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
    const d = (x) => { try { return F[i].fn(x) - F[j].fn(x); } catch (e) { return NaN; } }; let px = xmin, pd = d(px);
    for (let q = 1; q <= 3000; q++) { const x = xmin + (xmax - xmin) * q / 3000, dd = d(x); if (isFinite(pd) && isFinite(dd) && (pd < 0) !== (dd < 0) && Math.abs(dd - pd) < (ymax - ymin)) { let lo = px, hi = x; for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if ((d(lo) < 0) === (d(m) < 0)) lo = m; else hi = m; } const xs = (lo + hi) / 2; marks.push({ x: xs, y: F[i].fn(xs), label: 'P', col: ink }); } px = x; pd = dd; }
  }
  // Punkte und Strecken, Beschriftungen
  const cross = (x, y, col, mk = 'kreuz') => { const s = .32 * u, cx = fx(x), cy = fy(y); if (mk === 'punkt') items.push(P([[cx, cy], [cx + .3, cy]], 4.2, col)); else if (mk === 'kreis') { const pts = []; for (let k = 0; k <= 20; k++) pts.push([cx + s * Math.cos(k / 20 * 6.2832), cy + s * Math.sin(k / 20 * 6.2832)]); items.push(P(pts, 1, col)); } else items.push(P([[cx - s, cy - s], [cx + s, cy + s]], 1.2, col), P([[cx - s, cy + s], [cx + s, cy - s]], 1.2, col)); };
  const place = (x, y, label, col, dx = .5, dy = -.5, left = false) => { if (!label) return; const b = mathBox(ctx, label, { sc: .85, col }).box; let px = left ? fx(x) - b.w - .45 * u : fx(x) + dx * u, py = fy(y) + dy * u; if (px + b.w > gwTot) px = fx(x) - b.w - .4 * u; if (py - b.asc < R.y0 - u) py = fy(y) + b.asc + .5 * u; items.push(...shiftItems(b.items, px, py)); };
  const pointDefs = [];
  for (const k of el.kids) if (k.name === 'point') pointDefs.push({ x: num(getP(k, 'x')), y: num(getP(k, 'y')), name: getP(k, 'name') || getP(k, 'beschriftung'), col: color(getP(k, 'farbe')), mk: (getP(k, 'marke') || 'kreuz').toLowerCase(), line: k.line });
  for (const p of allP(el, 'punkt')) { const t = splitBar(p.v), d = { x: num(t[0]), y: num(t[1]), name: null, col: null, mk: 'kreuz', line: p.line }; for (const q of t.slice(2)) { if (isColor(q)) d.col = color(q); else if (/^(kreuz|punkt|kreis)$/i.test(q)) d.mk = q.toLowerCase(); else d.name = q; } pointDefs.push(d); }
  for (const d of pointDefs) { if (d.x == null || d.y == null) { ctx.err(d.line, 'Punkt braucht x und y'); continue; } if (d.x < xmin || d.x > xmax || d.y < ymin || d.y > ymax) ctx.err(d.line, 'Punkt liegt außerhalb des Koordinatensystems', 'warn'); cross(d.x, d.y, d.col || ink, d.mk); place(d.x, d.y, d.name, d.col || ink); }
  for (const m of marks) { cross(m.x, m.y, m.col || ink, 'kreuz'); place(m.x, m.y, `${m.label}(${fmtNum(m.x, 2, komma)}|${fmtNum(m.y, 2, komma)})`, m.col || ink, .45, m.y >= 0 ? -.55 : 1.4, m.x < 0); }
  const segs = [];
  for (const k of el.kids) if (k.name === 'segment') segs.push({ a: parseXY(getP(k, 'von')), b: parseXY(getP(k, 'bis')), col: color(getP(k, 'farbe')), arrow: bool(getP(k, 'pfeil'), false), ls: LS(getP(k, 'linienart')), w: num(getP(k, 'linienbreite'), 1.2), name: getP(k, 'name'), line: k.line });
  for (const p of allP(el, 'strecke')) { const t = splitBar(p.v), d = { a: parseXY(t[0]), b: parseXY(t[1]), col: null, arrow: false, ls: 'solid', w: 1.2, name: null, line: p.line }; for (const q of t.slice(2)) { if (isColor(q)) d.col = color(q); else if (/^pfeil|arrow$/i.test(q)) d.arrow = true; else if (/gestrich|gepunkt/i.test(q)) d.ls = LS(q); else d.name = q; } segs.push(d); }
  for (const s of segs) {
    if (!s.a || !s.b) { ctx.err(s.line, 'Strecke braucht von und bis als „x,y“'); continue; }
    const c = s.col || ink, A = [fx(s.a[0]), fy(s.a[1])], B = [fx(s.b[0]), fy(s.b[1])];
    if (s.ls === 'solid') items.push(P([A, B], s.w, c)); else for (const d of dashPoly([A, B], 1 * u, .7 * u)) items.push(P(d, s.w, c));
    if (s.arrow) { const L = .8 * u, ang = Math.atan2(B[1] - A[1], B[0] - A[0]), q = (da) => [B[0] - L * Math.cos(ang + da), B[1] - L * Math.sin(ang + da)]; items.push(P([q(.4), B, q(-.4)], s.w, c)); }
    if (s.name) place((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, s.name, c);
  }

  // ---- Geometrie: Figuren, Abbildungen (Streckung, Spiegelung, Drehung, Verschiebung), Kreise, Geraden ----
  const figs = {}, DEG = Math.PI / 180, nn = (s) => { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : null; };
  const pair = (s) => { s = String(s || '').trim().replace(/^\(|\)$/g, ''); const sep = /[|;]/.test(s) ? /[|;]/ : /,/; const t = s.split(sep); return t.length === 2 && nn(t[0]) != null && nn(t[1]) != null ? [nn(t[0]), nn(t[1])] : null; };
  const polyDraw = (pts, col, closed = true, w = 1.2) => { const q = pts.map(p => [fx(p[0]), fy(p[1])]); if (closed) q.push(q[0]); items.push(P(q, w, col)); };
  const labelOut = (pts, names, col) => { const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length; pts.forEach((p, i) => { cross(p[0], p[1], col, 'kreuz'); if (names[i]) place(p[0], p[1], names[i], col, p[0] >= cx ? .5 : 0, p[1] >= cy ? -.5 : 1.5, p[0] < cx); }); };
  for (const p of allP(el, 'figur')) {
    const toks = p.v.split(/\s*\|\s*(?![^()]*\))/); const verts = []; const re = /([A-Za-zÄÖÜäöü][\w']*)\s*\(\s*([^()]+?)\s*\)/g; let m;
    while ((m = re.exec(toks[0]))) { const c = pair(m[2]); if (c) verts.push({ n: m[1], x: c[0], y: c[1] }); }
    if (verts.length < 2) { ctx.err(p.line, 'figur: mindestens zwei Ecken wie A(1,2) B(3,4) angeben'); continue; }
    let col = null, nm = null, closed = true; for (const q of toks.slice(1)) { if (isColor(q)) col = color(q); else if (/^(offen|linie)$/i.test(q)) closed = false; else nm = q.trim(); }
    nm = nm || verts.map(v => v.n).join(''); figs[nm] = { verts, col: col || ink, closed, name: nm };
    for (const v of verts) if (v.x < xmin || v.x > xmax || v.y < ymin || v.y > ymax) ctx.err(p.line, 'Ecke ' + v.n + ' liegt außerhalb des Koordinatensystems', 'warn');
    polyDraw(verts.map(v => [v.x, v.y]), figs[nm].col, closed); labelOut(verts.map(v => [v.x, v.y]), verts.map(v => v.n), figs[nm].col);
  }
  for (const p of allP(el, 'abbildung')) {
    const t = p.v.split(/\s*\|\s*/), f = figs[(t[0] || '').trim()] || Object.values(figs)[Object.values(figs).length - 1];
    if (!f) { ctx.err(p.line, 'abbildung: zuerst eine Figur mit „figur:“ definieren'); continue; }
    const o2 = { type: (t[1] || '').trim().toLowerCase(), col: null, hl: false, name: null }, kv = {};
    for (const q of t.slice(2)) { const mm = /^(\w+)\s*=\s*(.+)$/.exec(q); if (mm) kv[mm[1].toLowerCase()] = mm[2].trim(); else if (isColor(q)) o2.col = color(q); else if (/^hilfs/i.test(q)) o2.hl = true; else o2.name = q.trim(); }
    if (kv.name) o2.name = kv.name; const col = o2.col || color('rot'); let fn = null, zc = null;
    const Z = kv.zentrum ? pair(kv.zentrum) : null;
    if (/streck|dilat/.test(o2.type)) { const k = nn(kv.faktor ?? kv.k); if (!Z || k == null) { ctx.err(p.line, 'streckung braucht zentrum=x,y und faktor=k'); continue; } fn = (x, y) => [Z[0] + k * (x - Z[0]), Z[1] + k * (y - Z[1])]; zc = Z; }
    else if (/punktspieg/.test(o2.type)) { if (!Z) { ctx.err(p.line, 'punktspiegelung braucht zentrum=x,y'); continue; } fn = (x, y) => [2 * Z[0] - x, 2 * Z[1] - y]; zc = Z; }
    else if (/spieg|refl/.test(o2.type)) {
      const a = String(kv.achse || 'y').toLowerCase().replace(/\s/g, ''); let L = null;
      if (a === 'x') L = [[0, 0], [1, 0]]; else if (a === 'y') L = [[0, 0], [0, 1]]; else if (/^x=/.test(a)) L = [[nn(a.slice(2)), 0], [nn(a.slice(2)), 1]]; else if (/^y=x$/.test(a)) L = [[0, 0], [1, 1]]; else if (/^y=/.test(a) && nn(a.slice(2)) != null) L = [[0, nn(a.slice(2))], [1, nn(a.slice(2))]];
      else { const pp = a.split(/\.\.|-(?=\()|\/|~/).map(pair); if (pp.length === 2 && pp[0] && pp[1]) L = pp; }
      if (!L) { ctx.err(p.line, 'spiegelung: achse=x | y | x=3 | y=2 | y=x | x1,y1..x2,y2'); continue; }
      const dx = L[1][0] - L[0][0], dy = L[1][1] - L[0][1], d2 = dx * dx + dy * dy;
      fn = (x, y) => { const tt = ((x - L[0][0]) * dx + (y - L[0][1]) * dy) / d2, fxp = L[0][0] + tt * dx, fyp = L[0][1] + tt * dy; return [2 * fxp - x, 2 * fyp - y]; };
      const Lc = [[...L[0]], [...L[1]]]; const far = Math.max(xmax - xmin, ymax - ymin) * 2, ln = Math.sqrt(d2); const A = [L[0][0] - dx / ln * far, L[0][1] - dy / ln * far], B = [L[0][0] + dx / ln * far, L[0][1] + dy / ln * far];
      // Achse auf den Zeichenbereich zuschneiden
      const clip = (A, B) => { let t0 = 0, t1 = 1; const ddx = B[0] - A[0], ddy = B[1] - A[1]; for (const [pp, qq] of [[-ddx, A[0] - xmin], [ddx, xmax - A[0]], [-ddy, A[1] - ymin], [ddy, ymax - A[1]]]) { if (pp === 0) { if (qq < 0) return null; } else { const r = qq / pp; if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } } } return [[A[0] + t0 * ddx, A[1] + t0 * ddy], [A[0] + t1 * ddx, A[1] + t1 * ddy]]; };
      const cl = clip(A, B); if (cl) for (const dd of dashPoly(cl.map(q => [fx(q[0]), fy(q[1])]), 1.2 * u, .7 * u)) items.push(P(dd, 1, color('gruen')));
      if (kv.achsenname || kv.name2) place(cl ? cl[1][0] : B[0], cl ? cl[1][1] : B[1], kv.achsenname || kv.name2, color('gruen'), -1.5, -.5);
    }
    else if (/dreh|rot/.test(o2.type)) { const w = nn(kv.winkel); if (!Z || w == null) { ctx.err(p.line, 'drehung braucht zentrum=x,y und winkel=Grad'); continue; } const c = Math.cos(w * DEG), s = Math.sin(w * DEG); fn = (x, y) => [Z[0] + c * (x - Z[0]) - s * (y - Z[1]), Z[1] + s * (x - Z[0]) + c * (y - Z[1])]; zc = Z; }
    else if (/versch|transl/.test(o2.type)) { const v = pair(kv.vektor || kv.v); if (!v) { ctx.err(p.line, 'verschiebung braucht vektor=dx,dy'); continue; } fn = (x, y) => [x + v[0], y + v[1]]; }
    else { ctx.err(p.line, 'abbildung: Art „' + (t[1] || '') + '“ unbekannt (streckung, spiegelung, punktspiegelung, drehung, verschiebung)'); continue; }
    const img = f.verts.map(v => { const q = fn(v.x, v.y); return { n: v.n + "'", x: +q[0].toFixed(6), y: +q[1].toFixed(6) }; });
    for (const v of img) if (v.x < xmin || v.x > xmax || v.y < ymin || v.y > ymax) ctx.err(p.line, 'Bildpunkt ' + v.n + ' liegt außerhalb des Koordinatensystems', 'warn');
    if (o2.hl) f.verts.forEach((v, i) => { const a = zc ? zc : [v.x, v.y], b = [img[i].x, img[i].y]; const A = [fx(a[0]), fy(a[1])], B = [fx(b[0]), fy(b[1])]; for (const dd of dashPoly([A, B], 1 * u, .7 * u)) items.push(P(dd, .9, color('grau'))); });
    if (zc) { cross(zc[0], zc[1], ink, 'kreuz'); place(zc[0], zc[1], kv.zname || 'Z', ink, .5, 1.5); }
    polyDraw(img.map(v => [v.x, v.y]), col, f.closed); labelOut(img.map(v => [v.x, v.y]), img.map(v => v.n), col);
    figs[o2.name || f.name + "'"] = { verts: img, col, closed: f.closed, name: o2.name || f.name + "'" };
  }
  for (const p of allP(el, 'kreis')) { const t = splitBar(p.v), c = pair(t[0]), r = nn(t[1]); if (!c || r == null) { ctx.err(p.line, 'kreis: Mittelpunkt und Radius angeben, z. B. kreis: 0,0 | 3 | blau'); continue; } let col = null, nm = null; for (const q of t.slice(2)) { if (isColor(q)) col = color(q); else nm = q; } const pts = []; for (let k = 0; k <= 72; k++) pts.push([fx(c[0] + r * Math.cos(k / 72 * 6.2832)), fy(c[1] + r * Math.sin(k / 72 * 6.2832))]); items.push(P(pts, 1.2, col || ink)); cross(c[0], c[1], col || ink, 'kreuz'); if (nm) place(c[0], c[1], nm, col || ink); }
  for (const p of allP(el, 'gerade')) { const t = splitBar(p.v), a = pair(t[0]), b = pair(t[1]); if (!a || !b) { ctx.err(p.line, 'gerade: zwei Punkte angeben, z. B. gerade: 0,0 | 4,2'); continue; } let col = null, nm = null; for (const q of t.slice(2)) { if (isColor(q)) col = color(q); else nm = q; } const dx = b[0] - a[0], dy = b[1] - a[1], far = 4 * Math.max(xmax - xmin, ymax - ymin), ln = Math.hypot(dx, dy) || 1; const A = [a[0] - dx / ln * far, a[1] - dy / ln * far], B = [a[0] + dx / ln * far, a[1] + dy / ln * far]; let t0 = 0, t1 = 1; const ddx = B[0] - A[0], ddy = B[1] - A[1]; let ok = true; for (const [pp, qq] of [[-ddx, A[0] - xmin], [ddx, xmax - A[0]], [-ddy, A[1] - ymin], [ddy, ymax - A[1]]]) { if (pp === 0) { if (qq < 0) ok = false; } else { const r = qq / pp; if (pp < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r); } } if (!ok || t0 >= t1) continue; const C = [A[0] + t0 * ddx, A[1] + t0 * ddy], D = [A[0] + t1 * ddx, A[1] + t1 * ddy]; items.push(P([[fx(C[0]), fy(C[1])], [fx(D[0]), fy(D[1])]], 1.2, col || ink)); if (nm) place(D[0], D[1], nm, col || ink, -1.5, -.5); }
  for (const k of el.kids) if (k.name === 'label') { const x = num(getP(k, 'x')), y = num(getP(k, 'y')), t = getP(k, 'text') || text(k).trim() || getP(k, 'name'); if (x == null || y == null || !t) { ctx.err(k.line, 'Beschriftung braucht x, y und text'); continue; } place(x, y, t, color(getP(k, 'farbe')) || ink, 0, 0); }
  // Legende
  if (bool(getP(el, 'legende'), false)) { const named = F.filter(f => f.name); let ly = R.y0 + .9 * u; for (const f of named) { const nb = mathBox(ctx, f.name, { sc: .85, col: ink }).box; items.push(P([[R.x1 - nb.w - 3 * u, ly - .3 * u], [R.x1 - nb.w - 1.2 * u, ly - .3 * u]], 1.5, f.col2)); items.push(...shiftItems(nb.items, R.x1 - nb.w - .9 * u, ly)); ly += nb.asc + nb.desc + .5 * u; } }
  return { w: gwTot, h: Y0 + ph + padB, base: 1.85 * u, flat: true, items, align: o.align || 'mitte', snap: G ? { x: fx(Math.ceil(xmin / ux - 1e-9) * ux), y: fy(Math.floor(ymax / ux + 1e-9) * ux) } : null };
}

// ---------- Verteiler ----------
export function renderBlock(el, ctx) {
  switch (el.name) {
    case 'formula': return formulaBlock(el, ctx);
    case 'equation': return equationBlock(el, ctx);
    case 'calculation': return calcBlock(el, ctx);
    case 'fraction': return fractionBlock(el, ctx);
    case 'root': return rootBlock(el, ctx);
    case 'table': return tableBlock(el, ctx);
    case 'valuetable': return valueTableBlock(el, ctx);
    case 'graph': return graphBlock(el, ctx);
    case 'note': return noteBlock(el, ctx, 'Merke');
    case 'example': return noteBlock(el, ctx, 'Beispiel');
    case 'task': return taskBlock(el, ctx);
    case 'answer': return answerBlock(el, ctx);
    case 'columns': return columnsBlock(el, ctx);
    case 'quote': return quoteBlock(el, ctx);
    case 'group': return groupBlock(el, ctx);
    case 'page': return { md: el.kids };
    case 'title': return { md: '# ' + text(el).trim() };
    case 'heading': return { md: '## ' + text(el).trim() };
    case 'text': case 'paragraph': case 'caption': case 'footnote': return { md: text(el) };
    case 'list': { const typ = (getP(el, 'typ') || '').toLowerCase(), num2 = /numm|ordered|zahl/.test(typ); let i = 0; return { md: elems(el, 'item').map(k => (num2 ? (++i) + '. ' : '- ') + text(k).trim()).join('\n') }; }
    case 'item': return { md: '- ' + text(el).trim() };
    case 'spacer': { const h = size(getP(el, 'hoehe'), ctx.PH - ctx.MT - ctx.MB, ctx.lineH); return { w: 0, h, base: ctx.lineH, items: [], align: 'links' }; }
    case 'divider': { const u = ctx.u, W = ctx.W; return { w: W, h: 2.4 * u, base: 1.85 * u, flat: true, items: [P([[0, .9 * u], [W, .9 * u]], .8, color(getP(el, 'farbe')) || GRAY)], align: 'links' }; }
    case 'metadata': case 'reference': case 'row': case 'cell': case 'step': case 'function': case 'point': case 'segment': case 'label': case 'column': case 'pagebreak': return null;
    case 'image': return placeholder(el, ctx, 'Bild „' + (getP(el, 'quelle') || '?') + '“ ist nicht eingebettet');
    default: {
      if (KNOWN.LATER.has(el.name)) return placeholder(el, ctx, '[' + el.rawName + '] wird in einer späteren Version unterstützt');
      return placeholder(el, ctx, 'Unbekanntes Element [' + el.rawName + ']');
    }
  }
}
