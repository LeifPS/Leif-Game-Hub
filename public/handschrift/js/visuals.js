// Diagramme und Schaubilder: Balken-/Kreis-/Liniendiagramm, Streudiagramm, Ablauf, Baum, Mindmap, Venn, Zeitstrahl, Pyramide, Kreislauf,
// Schaltpläne (Physik) und Strukturformeln (Chemie).
// Alles aus Handschrift-Text und perfekten Strichen. Box: { w, h, base, flat, items, align }.
import { getP, allP, num, bool, splitBar, color, isColor, textLines } from './hdf.js';

const PAL = ['blau', 'rot', 'gruen', 'orange', 'lila', 'tuerkis', 'braun', 'rosa'];
const pal = (i) => color(PAL[i % PAL.length]);
const P = (pts, w = 1, col, extra) => ({ path: { pts, w, col, ...extra } });
const shift = (items, dx, dy) => items.map(it => it.path ? { path: { ...it.path, pts: it.path.pts.map(([x, y]) => [x + dx, y + dy]) } } : { ...it, x: it.x + dx, y: it.y + dy });
const nn = (s) => { const v = parseFloat(String(s ?? '').replace(',', '.')); return isFinite(v) ? v : null; };
const circle = (cx, cy, rx, ry, n = 48, a0 = 0, a1 = Math.PI * 2) => { const p = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); } return p; };
const roundRect = (x, y, w, h, r) => { const q = Math.min(r, w / 2, h / 2), p = []; const arc = (cx, cy, a0) => { for (let i = 0; i <= 5; i++) { const a = a0 + i / 5 * Math.PI / 2; p.push([cx + q * Math.cos(a), cy + q * Math.sin(a)]); } }; arc(x + w - q, y + q, -Math.PI / 2); arc(x + w - q, y + h - q, 0); arc(x + q, y + h - q, Math.PI / 2); arc(x + q, y + q, Math.PI); p.push(p[0]); return p; };
const arrowHead = (A, B, L, col, w = 1) => { const ang = Math.atan2(B[1] - A[1], B[0] - A[0]), q = (d) => [B[0] - L * Math.cos(ang + d), B[1] - L * Math.sin(ang + d)]; return P([q(.4), B, q(-.4)], w, col); };
const hatch = (x, y, w, h, s, col, wd = .8) => { const out = []; for (let t = -h; t < w; t += s) { const x1 = Math.max(0, t), x2 = Math.min(w, t + h); if (x2 > x1) out.push(P([[x + x1, y + h - (x1 - t)], [x + x2, y + h - (x2 - t)]], wd, col)); } return out; };
function niceMax(v) { if (v <= 0) return 1; const e = Math.pow(10, Math.floor(Math.log10(v))), m = v / e, s = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10; return s * e; }
const fmt = (v, komma) => { const s = String(Math.round(v * 100) / 100); return komma ? s.replace('.', ',') : s; };

export function visualBlock(el, ctx, kind) {
  const u = ctx.u, W = ctx.W, komma = true, ink = color(getP(el, 'stiftfarbe') || getP(el, 'farbe')) || null, items = [];
  const T = (s, sc = 1, col) => ctx.textBox(ctx.prep(String(s)), sc, col === undefined ? ink : col);
  const wrap = (s, maxW, sc = 1, col) => { const words = ctx.prep(String(s)).split(/\s+/).filter(Boolean), lines = []; let cur = ''; for (const w of words) { const t = cur ? cur + ' ' + w : w; if (cur && ctx.textBox(t, sc).w > maxW) { lines.push(cur); cur = w; } else cur = t; } if (cur) lines.push(cur); const bx = lines.map(l => ctx.textBox(l, sc, col === undefined ? ink : col)); return { boxes: bx, w: Math.max(0, ...bx.map(b => b.w)), h: bx.length * 2.4 * u * sc, n: bx.length }; };
  const put = (tb, cx, cy, al = 'mitte') => { const x = al === 'mitte' ? cx - tb.w / 2 : al === 'rechts' ? cx - tb.w : cx; items.push(...shift(tb.items, x, cy + (tb.asc - tb.desc) / 2 - .1 * u)); };       // Text mit Mitte bei cy
  const putWrap = (wr, cx, cy, sc = 1) => { const step = 2.4 * u * sc, top = cy - (wr.n - 1) * step / 2; wr.boxes.forEach((b, i) => put(b, cx, top + i * step)); };
  const title = getP(el, 'titel'); let Y0 = 0; const Wd = Math.min(W, (nn(getP(el, 'breite')) || 0) > 0 ? nn(getP(el, 'breite')) * u : W);
  const tb = title ? T(title, 1.05) : null, tItems = []; if (tb) { tItems.push(...shift(tb.items, (Wd - tb.w) / 2, tb.asc)); Y0 = tb.asc + tb.desc + 1.4 * u; }
  const done = (H, left = 0) => ({ w: Wd, h: Y0 + H, base: 1.85 * u, flat: true, items: [...tItems, ...shift(items, left, Y0)], align: 'mitte' });
  const colOf = (s, i) => (s && isColor(s)) ? color(s) : pal(i);

  // ---------------- Diagramme ----------------
  if (kind === 'chart') {
    const raw = (el.rawName || '').toLowerCase(); let typ = (getP(el, 'typ') || '').toLowerCase();
    if (!typ) typ = /kreis|torte|pie/.test(raw) ? 'kreis' : /linie|line/.test(raw) ? 'linie' : 'balken';
    if (/pie|torte/.test(typ)) typ = 'kreis'; if (/line/.test(typ)) typ = 'linie'; if (/saeul|säul|bar|column|balk/.test(typ)) typ = 'balken';
    const cats = (getP(el, 'kategorien') || '').split(/\s*[,;]\s*/).filter(Boolean), series = [];
    for (const p of allP(el, 'reihe')) { const t = splitBar(p.v), nm = t[0], vals = (t[t.length - 1] || '').split(/\s*[,;]\s*/).map(nn).filter(v => v != null); let c = null; for (const q of t.slice(1, -1)) if (isColor(q)) c = color(q); series.push({ name: nm, vals, col: c || pal(series.length) }); }
    const single = []; for (const p of allP(el, 'wert')) { const t = splitBar(p.v), v = nn(t[1]); if (v == null) { ctx.err(p.line, 'wert: Name | Zahl | Farbe erwartet'); continue; } single.push({ name: t[0], v, col: colOf(t[2], single.length) }); }
    if (!series.length && single.length) { if (typ !== 'kreis') { series.push({ name: '', vals: single.map(s => s.v), col: null, cols: single.map(s => s.col) }); single.forEach(s => cats.push(s.name)); } }
    const showVals = bool(getP(el, 'werte'), true), unit = getP(el, 'einheit') || '';
    if (typ === 'kreis') {
      const data = single.length ? single : (series[0] ? series[0].vals.map((v, i) => ({ name: cats[i] || '', v, col: pal(i) })) : []);
      const tot = data.reduce((a, d) => a + Math.max(0, d.v), 0); if (!data.length || tot <= 0) { ctx.err(el.line, 'Kreisdiagramm ohne Werte'); return null; }
      const R = Math.min(9 * u, Wd / 4), cx = Wd / 2, cy = R + 2.4 * u, pct = bool(getP(el, 'prozent'), true); let a = -Math.PI / 2;
      data.forEach((d, i) => {
        const da = d.v / tot * Math.PI * 2, a1 = a + da; items.push(P([[cx, cy], ...circle(cx, cy, R, R, Math.max(6, Math.round(da * 12)), a, a1), [cx, cy]], 1.3, ink));
        for (let k = 1; k <= 5; k++) items.push(P(circle(cx, cy, R * k / 5.6, R * k / 5.6, Math.max(4, Math.round(da * 8)), a + .04, a1 - .04), .8, d.col));
        const am = (a + a1) / 2, lab = d.name + (pct ? ' ' + fmt(d.v / tot * 100, komma) + ' %' : showVals ? ' ' + fmt(d.v, komma) + unit : ''), tb2 = T(lab, .9, d.col), lx = cx + (R + .9 * u) * Math.cos(am), ly = cy + (R + 1.2 * u) * Math.sin(am);
        put(tb2, lx, ly, Math.cos(am) >= 0 ? 'links' : 'rechts'); a = a1;
      });
      return done(2 * R + 5 * u);
    }
    if (!series.length) { ctx.err(el.line, 'Diagramm ohne Daten: wert: Name | Zahl  oder  kategorien + reihe'); return null; }
    const n = Math.max(cats.length, ...series.map(s => s.vals.length)), allv = series.flatMap(s => s.vals), vmax = nn(getP(el, 'ymax')) ?? niceMax(Math.max(...allv, 0) * 1.05), vmin = Math.min(0, ...allv);
    const mL = 4 * u, mB = 3.4 * u, Wc = Math.min(Wd, 46 * u), Hc = 20 * u, px0 = mL, pw = Wc - mL - u, py0 = 1.2 * u, ph = Hc - mB - py0 - 1.2 * u + 1.2 * u;
    const step = niceMax(vmax / 5) === vmax / 5 ? vmax / 5 : (() => { const raw2 = (vmax - vmin) / 5, e = Math.pow(10, Math.floor(Math.log10(raw2))), m = raw2 / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; })();
    const yp = (v) => py0 + ph - (v - vmin) / (vmax - vmin) * ph, left = (Wd - Wc) / 2;
    items.push(P([[px0, py0 - .5 * u], [px0, py0 + ph]], 1.1, ink), P([[px0, yp(0)], [px0 + pw, yp(0)]], 1.1, ink), arrowHead([px0, py0 + 1.2 * u], [px0, py0 - .5 * u], .7 * u, ink, 1.1));
    for (let v = Math.ceil(vmin / step) * step; v <= vmax + 1e-9; v += step) { const y = yp(v); items.push(P([[px0 - .4 * u, y], [px0 + .4 * u, y]], 1, ink)); put(T(fmt(v, komma), .8), px0 - .7 * u, y, 'rechts'); }
    if (unit) put(T(unit, .8), px0 + .5 * u, py0 - .9 * u, 'links');
    const gw = pw / n;
    if (typ === 'balken') {
      const ns = series.length, bw = gw * .72 / ns;
      for (let i = 0; i < n; i++) {
        series.forEach((s, j) => { const v = s.vals[i]; if (v == null) return; const x = px0 + gw * i + gw * .14 + bw * j, y = yp(Math.max(v, 0)), h = Math.abs(yp(v) - yp(0)), c = s.cols ? s.cols[i] : s.col; items.push(P([[x, yp(0)], [x, y], [x + bw, y], [x + bw, yp(0)]], 1.2, c), ...hatch(x, y, bw, h, .55 * u, c)); if (showVals) put(T(fmt(v, komma), .8, c), x + bw / 2, y - .8 * u); });
        put(T(cats[i] || String(i + 1), .9), px0 + gw * (i + .5), py0 + ph + 1.3 * u);
      }
    } else {
      series.forEach((s) => { const pts = s.vals.map((v, i) => [px0 + gw * (i + .5), yp(v)]); items.push(P(pts, 1.3, s.col)); pts.forEach(([x, y], i) => { items.push(P([[x - .3 * u, y - .3 * u], [x + .3 * u, y + .3 * u]], 1, s.col), P([[x - .3 * u, y + .3 * u], [x + .3 * u, y - .3 * u]], 1, s.col)); if (showVals) put(T(fmt(s.vals[i], komma), .75, s.col), x, y - .9 * u); }); });
      for (let i = 0; i < n; i++) put(T(cats[i] || String(i + 1), .9), px0 + gw * (i + .5), py0 + ph + 1.3 * u);
    }
    if (series.length > 1 || bool(getP(el, 'legende'), false)) series.forEach((s, j) => { const y = py0 + ph + 3 * u + j * 0, x = px0 + j * 9 * u; items.push(P([[x, y + .2 * u], [x + 1.4 * u, y + .2 * u]], 2, s.col)); put(T(s.name || 'Reihe ' + (j + 1), .85, s.col), x + 1.8 * u, y, 'links'); });
    return done(Hc + (series.length > 1 ? 2.5 * u : 0), left);
  }

  // ---------------- Ablauf und Baum (Knoten + Pfeile) ----------------
  if (kind === 'flow' || kind === 'tree') {
    const isTree = kind === 'tree', dir = /rechts|links|horiz/i.test(getP(el, 'richtung') || '') ? 'x' : /runter|unten|vert/i.test(getP(el, 'richtung') || '') ? 'y' : (isTree ? 'x' : 'y');
    const nodes = new Map(), edges = [], order = []; const sc = .95;
    const node = (id, txt, shape, col) => { id = id.trim(); if (!nodes.has(id)) { nodes.set(id, { id, text: id, shape: 'rechteck', col: null }); order.push(id); } const n = nodes.get(id); if (txt) n.text = txt; if (shape) n.shape = shape; if (col) n.col = col; return n; };
    for (const p of allP(el, 'knoten')) { const t = splitBar(p.v); let shape = null, col = null; for (const q of t.slice(2)) { if (isColor(q)) col = color(q); else if (/raute|entscheid|diamond/i.test(q)) shape = 'raute'; else if (/oval|start|ende|ellipse|kreis/i.test(q)) shape = 'oval'; else if (/kein|text|ohne/i.test(q)) shape = 'kein'; else if (/rechteck|box|kasten/i.test(q)) shape = 'rechteck'; } node(t[0], t[1] || t[0], shape, col); }
    for (const p of allP(el, isTree ? 'kante' : 'pfeil')) { const t = splitBar(p.v), chain = t[0].split(/\s*(?:->|→)\s*/); if (chain.length < 2) { ctx.err(p.line, (isTree ? 'kante' : 'pfeil') + ': A -> B | Beschriftung'); continue; } const lab = t[1] || ''; for (let i = 0; i < chain.length - 1; i++) { node(chain[i]); node(chain[i + 1]); edges.push({ a: chain[i].trim(), b: chain[i + 1].trim(), label: lab && i === chain.length - 2 ? lab : '' }); } }
    if (isTree) for (const p of allP(el, 'pfeil')) { const t = splitBar(p.v), chain = t[0].split(/\s*(?:->|→)\s*/); for (let i = 0; i < chain.length - 1; i++) { node(chain[i]); node(chain[i + 1]); edges.push({ a: chain[i].trim(), b: chain[i + 1].trim(), label: t[1] || '' }); } }
    if (!nodes.size) { ctx.err(el.line, 'Keine Knoten: pfeil: A -> B -> C  oder  knoten: id | Text'); return null; }
    const hasIn = new Set(edges.map(e => e.b)), roots = order.filter(id => !hasIn.has(id)); if (!roots.length) roots.push(order[0]);
    const lvl = new Map(); roots.forEach(r => lvl.set(r, 0)); for (let it = 0; it < order.length + 1; it++) for (const e of edges) { const l = (lvl.get(e.a) ?? 0) + 1; if (isTree ? !lvl.has(e.b) : (lvl.get(e.b) ?? -1) < l && l <= order.length) lvl.set(e.b, l); }
    for (const id of order) if (!lvl.has(id)) lvl.set(id, 0);
    const maxTxt = isTree ? 9 * u : 13 * u;
    for (const id of order) { const n = nodes.get(id), shape = n.shape; n.wr = wrap(n.text, maxTxt, sc, n.col || ink); const padx = shape === 'kein' ? .6 * u : shape === 'raute' ? 2.6 * u : shape === 'oval' ? 1.8 * u : 1.1 * u, pady = shape === 'kein' ? .5 * u : shape === 'raute' ? 1.9 * u : .9 * u; n.w = n.wr.w + 2 * padx; n.h = Math.max(n.wr.h + 2 * pady, 3.4 * u); if (shape === 'kein') n.h = n.wr.h + 1 * u; }
    const L = new Map(); for (const id of order) { const l = lvl.get(id); if (!L.has(l)) L.set(l, []); L.get(l).push(id); }
    const levels = [...L.keys()].sort((a, b) => a - b), gapAlong = (isTree ? 6.5 : 3.4) * u, gapAcross = (isTree ? 1.6 : 2.6) * u;
    const sizeAlong = (n) => dir === 'y' ? n.h : n.w, sizeAcross = (n) => dir === 'y' ? n.w : n.h;
    const pos = new Map();
    if (isTree) {
      const kids = new Map(); for (const e of edges) { if (!kids.has(e.a)) kids.set(e.a, []); if (lvl.get(e.b) === lvl.get(e.a) + 1 && !kids.get(e.a).includes(e.b)) kids.get(e.a).push(e.b); }
      let slot = 0; const place = (id) => { const ks = kids.get(id) || []; if (!ks.length) { const c = slot + sizeAcross(nodes.get(id)) / 2; slot += sizeAcross(nodes.get(id)) + gapAcross; return c; } const cs = ks.map(place); return (cs[0] + cs[cs.length - 1]) / 2; };
      const across = new Map(); for (const r of roots) across.set(r, place(r)); const walk = (id, c) => { across.set(id, c); };
      const fill = (id) => { for (const k of (kids.get(id) || [])) fill(k); }; fill(roots[0]);
      // Positionen erneut sauber berechnen (Blätter nacheinander, Eltern mittig)
      slot = 0; const calc = (id) => { const ks = kids.get(id) || []; let c; if (!ks.length) { c = slot + sizeAcross(nodes.get(id)) / 2; slot += sizeAcross(nodes.get(id)) + gapAcross; } else { const cs = ks.map(calc); c = (cs[0] + cs[cs.length - 1]) / 2; } pos.set(id, { c }); return c; };
      roots.forEach(calc);
    } else {
      const widest = Math.max(...levels.map(l => L.get(l).reduce((a, id) => a + sizeAcross(nodes.get(id)), 0) + (L.get(l).length - 1) * gapAcross)); 
      for (const l of levels) { const ids = L.get(l), tot = ids.reduce((a, id) => a + sizeAcross(nodes.get(id)), 0) + (ids.length - 1) * gapAcross; let c = (widest - tot) / 2; for (const id of ids) { const sz = sizeAcross(nodes.get(id)); pos.set(id, { c: c + sz / 2 }); c += sz + gapAcross; } }
    }
    let al = 0; const alongOf = new Map(); for (const l of levels) { const mx = Math.max(...L.get(l).map(id => sizeAlong(nodes.get(id)))); alongOf.set(l, al + mx / 2); al += mx + gapAlong; } al -= gapAlong;
    const acrossMax = Math.max(...[...pos.values()].map(p => p.c)) + Math.max(...order.map(id => sizeAcross(nodes.get(id)))) / 2;
    const totW = dir === 'y' ? acrossMax : al, totH = dir === 'y' ? al : acrossMax;
    const k = Math.min(1, (Wd - 2 * u) / totW), ox = (Wd - totW * k) / 2;     // zu breit -> alles proportional verkleinern (Linien), Text bleibt
    for (const id of order) { const n = nodes.get(id), p = pos.get(id), a = alongOf.get(lvl.get(id)); n.cx = ox + (dir === 'y' ? p.c : a) * k; n.cy = 1.2 * u + (dir === 'y' ? a : p.c) * k; }
    const cut = (n, dx, dy) => { const hw = n.w / 2, hh = n.h / 2; if (dx === 0 && dy === 0) return 0; if (n.shape === 'raute') return 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh); if (n.shape === 'oval') return 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2); return Math.min(Math.abs(dx) > 1e-9 ? hw / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-9 ? hh / Math.abs(dy) : 1e9); };
    for (const id of order) { const n = nodes.get(id), c = n.col || ink; if (n.shape === 'rechteck') items.push(P(roundRect(n.cx - n.w / 2, n.cy - n.h / 2, n.w, n.h, .5 * u), 1.2, c)); else if (n.shape === 'oval') items.push(P(circle(n.cx, n.cy, n.w / 2, n.h / 2, 40), 1.2, c)); else if (n.shape === 'raute') items.push(P([[n.cx, n.cy - n.h / 2], [n.cx + n.w / 2, n.cy], [n.cx, n.cy + n.h / 2], [n.cx - n.w / 2, n.cy], [n.cx, n.cy - n.h / 2]], 1.2, c)); putWrap(n.wr, n.cx, n.cy, sc); }
    for (const e of edges) { const a = nodes.get(e.a), b = nodes.get(e.b), dx = b.cx - a.cx, dy = b.cy - a.cy, ln = Math.hypot(dx, dy) || 1, ta = cut(a, dx, dy) + .25 * u / ln, tb2 = cut(b, -dx, -dy) + (isTree ? .25 : .45) * u / ln; if (ta + tb2 >= 1) continue; const A = [a.cx + dx * ta, a.cy + dy * ta], B = [b.cx - dx * tb2, b.cy - dy * tb2]; items.push(P([A, B], 1.1, ink)); if (!isTree) items.push(arrowHead(A, B, .8 * u, ink, 1.1)); if (e.label) { const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, lb = T(e.label, .85), off = Math.abs(dy) < Math.abs(dx) ? [0, -1.1 * u] : [lb.w / 2 + .5 * u, 0]; put(lb, mx + off[0], my + off[1]); } }
    return done(totH * k + 2.4 * u);
  }

  // ---------------- Mindmap ----------------
  if (kind === 'mindmap') {
    const center = getP(el, 'zentrum') || title || 'Thema', br = [];
    for (const p of allP(el, 'zweig')) { const t = splitBar(p.v); let col = null, subs = []; for (const q of t.slice(1)) { if (isColor(q)) col = color(q); else subs = q.split(/\s*;\s*/).filter(Boolean); } br.push({ name: t[0], subs, col: col || pal(br.length) }); }
    if (!br.length) { ctx.err(el.line, 'Mindmap ohne Zweige: zweig: Name | Unterpunkt1; Unterpunkt2 | Farbe'); return null; }
    Y0 = 0; tItems.length = 0; const Wc = Math.min(Wd, 70 * u), Hc = Math.max(24, 8 + br.length * 4.2) * u, cx = Wd / 2, cy = Hc / 2, Rx = Wc * .27, Ry = Hc * .34;
    const cw = wrap(center, 9 * u, 1.1, ink), cwid = Math.max(cw.w + 3 * u, 8 * u), chei = Math.max(cw.h + 2 * u, 5 * u); items.push(P(circle(cx, cy, cwid / 2, chei / 2, 40), 1.6, ink)); putWrap(cw, cx, cy, 1.1);
    br.forEach((b, i) => {
      const th = -Math.PI / 2 + i * 2 * Math.PI / br.length, bx = cx + Rx * Math.cos(th), by = cy + Ry * Math.sin(th), wr = wrap(b.name, 9 * u, 1, b.col), bw = wr.w + 1.6 * u, bh = Math.max(wr.h + 1.2 * u, 3 * u);
      const dx = bx - cx, dy = by - cy, ln = Math.hypot(dx, dy), t0 = 1 / Math.sqrt((dx / (cwid / 2)) ** 2 + (dy / (chei / 2)) ** 2), tb2 = Math.min(Math.abs(dx) > 1e-9 ? (bw / 2) / Math.abs(dx) : 9, Math.abs(dy) > 1e-9 ? (bh / 2) / Math.abs(dy) : 9);
      items.push(P([[cx + dx * t0, cy + dy * t0], [bx - dx * tb2, by - dy * tb2]], 1.4, b.col), P(roundRect(bx - bw / 2, by - bh / 2, bw, bh, .8 * u), 1.4, b.col)); putWrap(wr, bx, by, 1);
      const side = Math.cos(th) >= -.01 ? 1 : -1, n = b.subs.length;
      b.subs.forEach((sv, j) => { const sw = wrap(sv, 11 * u, .9, ink), sy = by + (j - (n - 1) / 2) * 3 * u * (n > 1 ? 1 : 0) + (Math.abs(Math.sin(th)) > .9 ? (Math.sin(th) > 0 ? 3 : -3) * u * 0 : 0), sx = bx + side * (bw / 2 + 2.2 * u + sw.w / 2 + .3 * u); items.push(P([[bx + side * bw / 2, by], [sx - side * (sw.w / 2 + .5 * u), sy]], 1, b.col)); putWrap(sw, sx, sy, .9); });
    });
    return { w: Wd, h: Hc, base: 1.85 * u, flat: true, items, align: 'mitte' };
  }
  // ---------------- Venn-Diagramm ----------------
  if (kind === 'venn') {
    const sets = []; for (const p of allP(el, 'menge')) { const t = splitBar(p.v); let col = null, txt = ''; for (const q of t.slice(1)) { if (isColor(q)) col = color(q); else txt = q; } sets.push({ name: t[0], col: col || pal(sets.length), txt: txt.split(/\s*;\s*/).filter(Boolean) }); }
    if (sets.length < 2 || sets.length > 3) { ctx.err(el.line, 'Venn-Diagramm braucht 2 oder 3 „menge:“-Zeilen'); return null; }
    const r = 7.5 * u, cx = Wd / 2, Hc = (sets.length === 2 ? 2 * r + 5 : 3.3 * r + 6) * u * (sets.length === 2 ? 1 : 1) / (sets.length === 2 ? 1 : 1), d = sets.length === 2 ? r * 1.1 : r * 1.05;
    let C, anchors = {}; const top = 3 * u;
    if (sets.length === 2) { C = [[cx - d / 2, top + r], [cx + d / 2, top + r]]; anchors = { A: [C[0][0] - r * .45, C[0][1]], B: [C[1][0] + r * .45, C[1][1]], AB: [cx, C[0][1]] }; }
    else { C = [[cx - d / 2, top + r], [cx + d / 2, top + r], [cx, top + r + d * .87]]; const g = [cx, (C[0][1] + C[1][1] + C[2][1]) / 3], off = (a, b, c2, k2) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v = [m[0] - c2[0], m[1] - c2[1]], l = Math.hypot(v[0], v[1]) || 1; return [m[0] + v[0] / l * k2, m[1] + v[1] / l * k2]; }; anchors = { A: [C[0][0] - r * .4, C[0][1] - r * .35], B: [C[1][0] + r * .4, C[1][1] - r * .35], C: [C[2][0], C[2][1] + r * .5], AB: off(C[0], C[1], C[2], r * .1), AC: off(C[0], C[2], C[1], r * .25), BC: off(C[1], C[2], C[0], r * .25), ABC: g }; anchors.AB = [cx, C[0][1] - r * .4]; }
    sets.forEach((s, i) => { items.push(P(circle(C[i][0], C[i][1], r, r, 56), 1.4, s.col)); const nm = T(s.name, 1, s.col), nx = i === 0 ? C[i][0] - r * .75 : i === 1 ? C[i][0] + r * .75 : C[i][0], ny = i < 2 ? C[i][1] - r - 1 * u : C[i][1] + r + 1.4 * u; put(nm, nx, ny); const key = 'ABC'[i]; s.txt.forEach((t2, j) => put(T(t2, .85, s.col), anchors[key][0], anchors[key][1] + (j - (s.txt.length - 1) / 2) * 2.2 * u)); });
    for (const p of allP(el, 'schnitt')) { const t = splitBar(p.v), ks = t[0].toUpperCase().replace(/[^A-C]/g, '') || ''; const key = ks.length ? ks : (sets.length === 2 ? 'AB' : 'ABC'), an = anchors[key] || anchors[key.split('').sort().join('')]; const lines = (t[1] || '').split(/\s*;\s*/).filter(Boolean); if (!an) { ctx.err(p.line, 'schnitt: A,B | Text (A, B, C stehen für die Mengen in der Reihenfolge)'); continue; } lines.forEach((l2, j) => put(T(l2, .85), an[0], an[1] + (j - (lines.length - 1) / 2) * 2.2 * u)); }
    return done((sets.length === 2 ? 2 * r + 5.5 * u : 3.2 * r + 8 * u) / 1, 0);
  }
  // ---------------- Zeitstrahl ----------------
  if (kind === 'timeline') {
    const ev = allP(el, 'ereignis').map(p => { const t = splitBar(p.v); let col = null; for (const q of t.slice(2)) if (isColor(q)) col = color(q); return { when: t[0], text: t[1] || '', col, n: nn(t[0]) }; });
    if (!ev.length) { ctx.err(el.line, 'Zeitstrahl ohne Ereignisse: ereignis: 1914 | Text'); return null; }
    const prop = ev.every(e => e.n != null) && bool(getP(el, 'massstab'), true), x0 = 2 * u, x1 = Wd - 2.5 * u, mn = Math.min(...ev.map(e => e.n ?? 0)), mxv = Math.max(...ev.map(e => e.n ?? 0)), y = 11 * u, Hc = 22 * u;
    items.push(P([[x0 - u, y], [x1 + u, y]], 1.5, ink), arrowHead([x1 - u, y], [x1 + u, y], .9 * u, ink, 1.5));
    ev.forEach((e, i) => { const x = prop && mxv > mn ? x0 + (x1 - x0 - 4 * u) * (e.n - mn) / (mxv - mn) + 2 * u : x0 + (x1 - x0) * (i + .5) / ev.length, up = i % 2 === 0, c = e.col || ink; items.push(P([[x, y - .6 * u], [x, y + .6 * u]], 1.5, c)); const yr = T(e.when, 1, c), wr = wrap(e.text, 12 * u, .85, ink), yy = up ? y - 2.4 * u : y + 2.4 * u; items.push(P([[x, up ? y - .6 * u : y + .6 * u], [x, up ? yy + 1 * u : yy - 1 * u]], .8, c, {})); put(yr, x, yy); if (wr.n) putWrap(wr, x, up ? yy - 2.6 * u - (wr.n - 1) * 1.2 * u : yy + 2.8 * u + (wr.n - 1) * 1.2 * u, .85); });
    return done(Hc);
  }
  // ---------------- Pyramide ----------------
  if (kind === 'pyramid') {
    const lv = allP(el, 'stufe').map((p, i) => { const t = splitBar(p.v); let col = null; for (const q of t.slice(1)) if (isColor(q)) col = color(q); return { text: t[0], col: col || pal(i) }; });
    if (!lv.length) { ctx.err(el.line, 'Pyramide ohne Stufen: stufe: Text | Farbe (von oben nach unten)'); return null; }
    const n = lv.length, Wc = Math.min(Wd, 40 * u), lh = 5.2 * u, H = n * lh, cx = Wd / 2, half = (y) => Wc / 2 * y / H;
    lv.forEach((l, i) => { const y0 = i * lh, y1 = (i + 1) * lh; items.push(P(i === 0 ? [[cx, y0], [cx + half(y1), y1], [cx - half(y1), y1], [cx, y0]] : [[cx - half(y0), y0], [cx + half(y0), y0], [cx + half(y1), y1], [cx - half(y1), y1], [cx - half(y0), y0]], 1.4, l.col)); const avail = i === 0 ? half(y1) * 1.2 : (half(y0) + half(y1)) * .95, wr = wrap(l.text, Math.max(avail, 4 * u), .9, ink); putWrap(wr, cx, y0 + lh * (i === 0 ? .68 : .5), .9); });
    return done(H + u);
  }
  // ---------------- Kreislauf ----------------
  if (kind === 'cycle') {
    const st = allP(el, 'stufe').map((p, i) => { const t = splitBar(p.v); let col = null; for (const q of t.slice(1)) if (isColor(q)) col = color(q); return { text: t[0], col: col || pal(i) }; });
    if (st.length < 2) { ctx.err(el.line, 'Kreislauf braucht mindestens 2 Schritte: stufe: Text | Farbe'); return null; }
    const n = st.length, R = Math.max(8, 4.6 * n) * u * .8, cx = Wd / 2, Hc = 2 * R + 8 * u, cy = Hc / 2, boxes = st.map(s => { const wr = wrap(s.text, 9 * u, .95, ink); return { wr, w: wr.w + 1.8 * u, h: Math.max(wr.h + 1.2 * u, 3 * u), col: s.col }; });
    boxes.forEach((b, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n, x = cx + (R + 2 * u) * Math.cos(a) * 1.1, y = cy + R * Math.sin(a); b.x = x; b.y = y; b.a = a; items.push(P(roundRect(x - b.w / 2, y - b.h / 2, b.w, b.h, .8 * u), 1.3, b.col)); putWrap(b.wr, x, y, .95); });
    boxes.forEach((b, i) => { const c2 = boxes[(i + 1) % n], A = [b.x, b.y], B = [c2.x, c2.y], dx = B[0] - A[0], dy = B[1] - A[1], ta = Math.min(Math.abs(dx) > 1e-9 ? (b.w / 2 + .5 * u) / Math.abs(dx) : 9, Math.abs(dy) > 1e-9 ? (b.h / 2 + .5 * u) / Math.abs(dy) : 9), tb2 = Math.min(Math.abs(dx) > 1e-9 ? (c2.w / 2 + .6 * u) / Math.abs(dx) : 9, Math.abs(dy) > 1e-9 ? (c2.h / 2 + .6 * u) / Math.abs(dy) : 9); if (ta + tb2 >= 1) return; const p0 = [A[0] + dx * ta, A[1] + dy * ta], p1 = [B[0] - dx * tb2, B[1] - dy * tb2], mid = [(p0[0] + p1[0]) / 2 + (cx - (p0[0] + p1[0]) / 2) * .0, (p0[1] + p1[1]) / 2], bulge = [mid[0] + (mid[0] - cx) * .12, mid[1] + (mid[1] - cy) * .12]; const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push([(1 - t) * (1 - t) * p0[0] + 2 * t * (1 - t) * bulge[0] + t * t * p1[0], (1 - t) * (1 - t) * p0[1] + 2 * t * (1 - t) * bulge[1] + t * t * p1[1]]); } items.push(P(pts, 1.2, ink), arrowHead(pts[6], pts[8], .8 * u, ink, 1.2)); });
    return done(Hc);
  }
  // ---------------- Streudiagramm ----------------
  if (kind === 'scatter') {
    const pts = [], col = color(getP(el, 'farbe')) || pal(0);
    const addPair = (a, b, line) => { const x = nn(a), y = nn(b); if (x == null || y == null) { ctx.err(line, 'punkt: x | y erwartet (z. B. punkt: 2 | 3,5)'); return; } pts.push([x, y]); };
    for (const p of allP(el, 'punkt')) { const t = splitBar(p.v); if (t.length >= 2) addPair(t[0], t[1], p.line); else { const m = /^\(?\s*(-?[\d.,]+)\s*[|;]\s*(-?[\d.,]+)\s*\)?$/.exec(p.v.trim()) || /^(-?[\d.]+)\s*,\s*(-?[\d.]+)$/.exec(p.v.trim()); if (m) addPair(m[1], m[2], p.line); else ctx.err(p.line, 'punkt: x | y erwartet'); } }
    for (const p of allP(el, 'punkte')) for (const q of p.v.split(/\s*;\s*|\)\s*\(/)) { const m = /(-?[\d.,]+)\s*[|,]\s*(-?[\d.,]+)/.exec(q.replace(/[()]/g, '').replace(/(\d),(\d+)\s*\|/g, '$1.$2|')); if (m) addPair(m[1], m[2], p.line); }
    if (!pts.length) { ctx.err(el.line, 'Streudiagramm ohne Punkte: punkt: x | y'); return null; }
    const rng = (key, i) => { const r = /(-?[\d.,]+)\s*\.\.\s*(-?[\d.,]+)/.exec(getP(el, key) || ''); if (r) return [nn(r[1]), nn(r[2])]; const vs = pts.map(q => q[i]), lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * .12 || 1, a = lo - pad, b = hi + pad; return [a > 0 && a < (hi - lo) * .6 ? 0 : a, b]; };
    const [x0, x1] = rng('xbereich', 0), [y0, y1] = rng('ybereich', 1);
    const niceStep = (span) => { const r = span / 6, e = Math.pow(10, Math.floor(Math.log10(r))), m = r / e; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * e; };
    const Wc = Math.min(Wd, 44 * u), Hc = 24 * u, mL = 4.4 * u, mB = 3.6 * u, pw = Wc - mL - 2 * u, ph = Hc - mB - 1.6 * u, left = (Wd - Wc) / 2;
    const X = (v) => mL + (v - x0) / (x1 - x0) * pw, Y = (v) => 1.6 * u + ph - (v - y0) / (y1 - y0) * ph;
    items.push(P([[mL, 1.6 * u + ph], [mL + pw + u, 1.6 * u + ph]], 1.1, ink), arrowHead([mL + pw, 1.6 * u + ph], [mL + pw + u, 1.6 * u + ph], .7 * u, ink, 1.1), P([[mL, 1.6 * u + ph], [mL, .4 * u]], 1.1, ink), arrowHead([mL, 1.6 * u], [mL, .4 * u], .7 * u, ink, 1.1));
    const sx = niceStep(x1 - x0), sy = niceStep(y1 - y0);
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) { const x = X(v); items.push(P([[x, 1.6 * u + ph - .35 * u], [x, 1.6 * u + ph + .35 * u]], 1, ink)); put(T(fmt(v, komma), .8), x, 1.6 * u + ph + 1.3 * u); }
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) { const y = Y(v); items.push(P([[mL - .35 * u, y], [mL + .35 * u, y]], 1, ink)); put(T(fmt(v, komma), .8), mL - .7 * u, y, 'rechts'); }
    const xl = getP(el, 'xbeschriftung'), yl = getP(el, 'ybeschriftung'); if (xl) put(T(xl, .85), mL + pw + u, 1.6 * u + ph - 1.1 * u, 'rechts'); if (yl) put(T(yl, .85), mL + .8 * u, .6 * u, 'links');
    for (const [px, py] of pts) { if (px < x0 || px > x1 || py < y0 || py > y1) continue; const x = X(px), y = Y(py), q = .35 * u; items.push(P([[x - q, y - q], [x + q, y + q]], 1.2, col), P([[x - q, y + q], [x + q, y - q]], 1.2, col)); }
    if (bool(getP(el, 'trend') || getP(el, 'trendlinie') || getP(el, 'regression'), false) && pts.length >= 2) {
      const n = pts.length, mx = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n, sxx = pts.reduce((a, q) => a + (q[0] - mx) ** 2, 0), m = sxx ? pts.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0) / sxx : 0, b = my - m * mx;
      const seg = []; for (const xv of [x0, x1]) seg.push([xv, m * xv + b]); const clip = seg.map(([xv, yv]) => { const yc = Math.max(y0, Math.min(y1, yv)); return [m ? (yc - b) / m : xv, yc]; });
      { const [A, B] = clip.map(([xv, yv]) => [X(xv), Y(yv)]), l = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.floor(l / (1.2 * u))); for (let i = 0; i < n; i += 2) { const t0 = i / n, t1 = Math.min(1, (i + 1) / n); items.push(P([[A[0] + (B[0] - A[0]) * t0, A[1] + (B[1] - A[1]) * t0], [A[0] + (B[0] - A[0]) * t1, A[1] + (B[1] - A[1]) * t1]], 1.1, color('rot'))); } }
      const r2 = (v) => fmt(Math.round(v * 100) / 100, komma), lab = 'y = ' + r2(m) + 'x ' + (b < 0 ? '− ' + r2(-b) : '+ ' + r2(b)); put(T(lab, .85, color('rot')), mL + pw, 2 * u, 'rechts');
    }
    return done(Hc, left);
  }

  // ---------------- Schaltplan (Physik) ----------------
  if (kind === 'circuit') {
    const KIND = [[/batt|akku|zelle/, 'batterie'], [/quelle|spannung|netz/, 'quelle'], [/widerst|resist/, 'widerstand'], [/lampe|gl[uü]h|birne|lamp/, 'lampe'], [/schalter.*(zu|geschl)|taster.*zu/, 'schalterzu'], [/schalter|taster|switch/, 'schalter'],
      [/motor/, 'motor'], [/generator/, 'generator'], [/led|leucht/, 'led'], [/diode/, 'diode'], [/kondens|capac/, 'kondensator'], [/amper|strommess/, 'amperemeter'], [/volt|spannungsmess/, 'voltmeter'], [/spule|coil/, 'spule'], [/sicherung|fuse/, 'sicherung']];
    const part = (txt, line) => { const t = splitBar(String(txt).trim()); let head = t[0], lab = t[1] || ''; const low = head.toLowerCase(); const k = KIND.find(([re]) => re.test(low)); if (!k) { ctx.err(line, `Bauteil „${head}“ kenne ich nicht (z. B. batterie, widerstand, lampe, schalter, motor, diode, led, kondensator, amperemeter, voltmeter)`); return null; }
      if (!lab) { const m = /^\S+\s+(.+)$/.exec(head); if (m) lab = m[1].replace(/^(zu|geschlossen|offen|auf)\b\s*/i, ''); } return { k: k[1], lab }; };
    const slots = [];
    for (const p of el.props) {
      if (p.k === 'bauteil' || p.k === 'reihe') for (const q of (p.k === 'reihe' ? p.v.split(/\s*;\s*|\s+->\s+|\s*,\s+(?=[A-Za-zÄÖÜäöü])/) : [p.v])) { const c = part(q, p.line); if (c) slots.push([c]); }
      else if (p.k === 'parallel') { const g = p.v.split(/\s*;\s*|\s+\|\|\s+/).map((q) => part(q, p.line)).filter(Boolean); if (g.length) slots.push(g); }
    }
    if (!slots.length) { ctx.err(el.line, 'Schaltung ohne Bauteile: bauteil: batterie | 9 V'); return null; }
    const L = 4.4 * u, gap = 4.6 * u, srcIdx = slots.findIndex((g) => g.length === 1 && /batterie|quelle|generator/.test(g[0].k)), src = srcIdx >= 0 ? slots[srcIdx] : null, rest = slots.filter((_, i) => i !== srcIdx);
    const slotW = (g) => g.length > 1 ? L + 3 * u : L, maxPar = Math.max(1, ...slots.map((g) => g.length));
    let top = rest, right = []; if (rest.length > 4) { top = rest.slice(0, Math.ceil(rest.length / 2)); right = rest.slice(top.length); }
    const needW = top.reduce((a, g) => a + slotW(g) + 3 * u, 3 * u), needH = Math.max(14 * u, (maxPar - 1) * gap + 9 * u, right.reduce((a, g) => a + slotW(g) + 3 * u, 3 * u));
    const RW = Math.min(Wd - 8 * u, Math.max(26 * u, needW)), RH = needH, ox = (Wd - RW) / 2, oy = 2.6 * u;
    // Bauteil in lokalen Koordinaten (entlang der Leitung = a, quer = b) zeichnen; tr wandelt in echte Koordinaten um
    const sym = (c, tr, labSide) => {
      const Q = (pts, w = 1.2) => items.push(P(pts.map(([a, b]) => tr(a, b)), w, ink)), h2 = L / 2, ring = (r) => Q(circle(0, 0, r, r, 36).map(([a, b]) => [a, b]));
      const lead = (a0) => { Q([[-h2, 0], [-a0, 0]]); Q([[a0, 0], [h2, 0]]); };
      const letter = (ch) => { const [x, y] = tr(0, 0); put(T(ch, .9), x, y); };
      switch (c.k) {
        case 'widerstand': lead(1.3 * u); Q([[-1.3 * u, -.55 * u], [1.3 * u, -.55 * u], [1.3 * u, .55 * u], [-1.3 * u, .55 * u], [-1.3 * u, -.55 * u]]); break;
        case 'sicherung': lead(1.3 * u); Q([[-1.3 * u, -.5 * u], [1.3 * u, -.5 * u], [1.3 * u, .5 * u], [-1.3 * u, .5 * u], [-1.3 * u, -.5 * u]]); Q([[-1.3 * u, 0], [1.3 * u, 0]], 1); break;
        case 'spule': lead(1.3 * u); Q([[-1.3 * u, -.55 * u], [1.3 * u, -.55 * u], [1.3 * u, .55 * u], [-1.3 * u, .55 * u], [-1.3 * u, -.55 * u]]); for (let a = -1.1; a < 1.2; a += .35) Q([[a * u, -.55 * u], [(a + .2) * u, .55 * u]], .8); break;
        case 'lampe': { const r = .95 * u, d = r * .707; lead(r); ring(r); Q([[-d, -d], [d, d]]); Q([[-d, d], [d, -d]]); break; }
        case 'motor': case 'generator': case 'amperemeter': case 'voltmeter': { const r = .95 * u; lead(r); ring(r); letter({ motor: 'M', generator: 'G', amperemeter: 'A', voltmeter: 'V' }[c.k]); break; }
        case 'batterie': lead(.3 * u); Q([[-.3 * u, -1.2 * u], [-.3 * u, 1.2 * u]]); Q([[.3 * u, -.65 * u], [.3 * u, .65 * u]], 2.4); break;
        case 'quelle': { const r = .95 * u; lead(r); ring(r); Q([[-.5 * u, 0], [.5 * u, 0]], 1); break; }
        case 'kondensator': lead(.3 * u); Q([[-.3 * u, -1 * u], [-.3 * u, 1 * u]], 1.5); Q([[.3 * u, -1 * u], [.3 * u, 1 * u]], 1.5); break;
        case 'diode': case 'led': lead(.6 * u); Q([[-.6 * u, -.7 * u], [.6 * u, 0], [-.6 * u, .7 * u], [-.6 * u, -.7 * u]]); Q([[.6 * u, -.7 * u], [.6 * u, .7 * u]]);
          if (c.k === 'led') for (const dx of [-.1, .5]) { Q([[dx * u, -.9 * u], [(dx + .6) * u, -1.6 * u]], 1); Q([[(dx + .3) * u, -1.6 * u], [(dx + .6) * u, -1.6 * u], [(dx + .6) * u, -1.3 * u]], 1); } break;
        case 'schalter': case 'schalterzu': { Q([[-h2, 0], [-1 * u, 0]]); Q([[1 * u, 0], [h2, 0]]); Q(circle(-1 * u, 0, .18 * u, .18 * u, 10), 1); Q(circle(1 * u, 0, .18 * u, .18 * u, 10), 1); Q(c.k === 'schalter' ? [[-1 * u, 0], [.9 * u, -1 * u]] : [[-1 * u, 0], [1 * u, 0]]); break; }
      }
      if (c.lab) { const [x, y] = tr(0, labSide * 2.1 * u); put(T(c.lab, .85), x, y); }
    };
    const dot = (x, y) => items.push(P(circle(x, y, .22 * u, .22 * u, 10), 2.2, ink));
    // Leitung entlang einer Kante zeichnen, Lücken für Bauteile; dir: Einheitsvektor der Kante, inw: nach innen
    const edge = (A, B, groups, inw, outSide) => {
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]), d = [(B[0] - A[0]) / len, (B[1] - A[1]) / len], tot = groups.reduce((a, g) => a + slotW(g), 0), sp = (len - tot) / (groups.length + 1);
      let t = 0, cur = sp; const segs = [];
      for (const g of groups) {
        const w = slotW(g), c0 = cur, c1 = cur + w; segs.push([t, c0]); t = c1; cur = c1 + sp;
        const at = (s, off = 0) => [A[0] + d[0] * s + inw[0] * off, A[1] + d[1] * s + inw[1] * off];
        g.forEach((c, i) => {
          const off = i * gap, mid = (c0 + c1) / 2, tr = (a, b) => { const p0 = at(mid + a, off); return [p0[0] + inw[0] * b * outSide * -1 + 0, p0[1] + inw[1] * b * outSide * -1]; };
          if (g.length > 1) { items.push(P([at(c0, off), at(mid - L / 2, off)], 1.2, ink), P([at(mid + L / 2, off), at(c1, off)], 1.2, ink)); }
          sym(c, (a, b) => { const p0 = at(mid + a, off); return [p0[0] - inw[0] * b, p0[1] - inw[1] * b]; }, i === 0 ? 1 : -1);
        });
        if (g.length > 1) { items.push(P([at(c0), at(c0, (g.length - 1) * gap)], 1.2, ink), P([at(c1), at(c1, (g.length - 1) * gap)], 1.2, ink)); dot(...at(c0)); dot(...at(c1)); }
      }
      segs.push([t, len]); for (const [a, b] of segs) if (b - a > .01) items.push(P([[A[0] + d[0] * a, A[1] + d[1] * a], [A[0] + d[0] * b, A[1] + d[1] * b]], 1.2, ink));
    };
    const TL = [ox, oy], TR = [ox + RW, oy], BR = [ox + RW, oy + RH], BL = [ox, oy + RH];
    edge(TL, TR, top, [0, 1], 1); edge(TR, BR, right, [-1, 0], 1); edge(BR, BL, src ? [src] : [], [0, -1], 1); edge(BL, TL, [], [1, 0], 1);
    return done(RH + 6 * u);
  }

  // ---------------- Strukturformel (Chemie) ----------------
  if (kind === 'structure') {
    let rows = textLines(el).map((l) => l.replace(/\t/g, '    ').replace(/\s+$/, ''));
    while (rows.length && !rows[0].trim()) rows.shift(); while (rows.length && !rows[rows.length - 1].trim()) rows.pop();
    if (!rows.length) { ctx.err(el.line, 'Strukturformel ohne Inhalt: Atome und Bindungen (- = | / \\) als Zeichnung in Zeilen'); return null; }
    const ind = Math.min(...rows.filter((r) => r.trim()).map((r) => r.match(/^ */)[0].length)); rows = rows.map((r) => r.slice(ind));
    const cw = 1.55 * u, rh = 2.9 * u, BOND = /[-=#≡|‖/\\]/, atoms = [], at = new Map();
    const chem = (s) => s.replace(/([A-Za-z\)])(\d+)/g, '$1_$2').replace(/\^?([+-])$/, '^$1');
    rows.forEach((row, r) => { const re = /[^\s\-=#≡|‖/\\]+/g; let m; while ((m = re.exec(row))) {
      const tok = m[0], c0 = m.index, box = ctx.mathBox ? ctx.mathBox(chem(tok), 1) : T(tok), cx = (c0 + tok.length / 2) * cw, cy = (r + .5) * rh;
      const a = { r, c0, c1: c0 + tok.length - 1, cx, cy, x0: cx - box.w / 2, x1: cx + box.w / 2, box }; atoms.push(a); for (let c = a.c0; c <= a.c1; c++) at.set(r + ',' + c, a);
      put(box, cx, cy);
    } });
    const cen = (r, c) => { const a = at.get(r + ',' + c); return a ? [a.cx, a.cy, a] : null; };
    const multi = (A, B, n, w = 1.1) => { const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l * .28 * u, ny = dx / l * .28 * u; for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2); items.push(P([[A[0] + nx * o, A[1] + ny * o], [B[0] + nx * o, B[1] + ny * o]], w, ink)); } };
    const shorten = (A, B, ga, gb) => { const dx = B[0] - A[0], dy = B[1] - A[1], l = Math.hypot(dx, dy) || 1; return [[A[0] + dx / l * ga, A[1] + dy / l * ga], [B[0] - dx / l * gb, B[1] - dy / l * gb]]; };
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]; if (!BOND.test(ch)) continue; const cy = (r + .5) * rh;
        if ('-=#≡'.includes(ch)) { let e = c; while (e + 1 < row.length && row[e + 1] === ch) e++; let lc = c - 1; while (lc >= 0 && row[lc] === ' ') lc--; let rc = e + 1; while (rc < row.length && row[rc] === ' ') rc++; const L0 = at.get(r + ',' + lc), R0 = at.get(r + ',' + rc); const x0 = L0 ? L0.x1 + .55 * u : c * cw, x1 = R0 ? R0.x0 - .55 * u : (e + 1) * cw; if (x1 > x0) multi([x0, cy], [x1, cy], ch === '-' ? 1 : ch === '=' ? 2 : 3); c = e; continue; }
        if ('|‖'.includes(ch)) { const x = (c + .5) * cw, up = (() => { for (let rr = r - 1; rr >= 0; rr--) { const a = at.get(rr + ',' + c); if (a) return a.cy + 1 * u; if (!/[|‖]/.test(rows[rr][c] || '')) break; } return r * rh; })(), dn = (() => { for (let rr = r + 1; rr < rows.length; rr++) { const a = at.get(rr + ',' + c); if (a) return a.cy - 1 * u; if (!/[|‖]/.test(rows[rr][c] || '')) break; } return (r + 1) * rh; })();
          if (r > 0 && /[|‖]/.test(rows[r - 1][c] || '')) continue; multi([x, up], [x, dn], ch === '|' ? 1 : 2); continue; }
        const sgn = ch === '/' ? 1 : -1, A = cen(r + 1, c - sgn) || cen(r + 1, c - 2 * sgn), B = cen(r - 1, c + sgn) || cen(r - 1, c + 2 * sgn);
        const pA = A ? [A[0], A[1]] : [(c + (sgn > 0 ? 0 : 1)) * cw, (r + 1) * rh], pB = B ? [B[0], B[1]] : [(c + (sgn > 0 ? 1 : 0)) * cw, r * rh];
        const [s0, s1] = shorten(pA, pB, A ? 1.1 * u : 0, B ? 1.1 * u : 0); multi(s0, s1, 1);
      }
    });
    const w = Math.max(...rows.map((r) => r.length)) * cw, left = Math.max(0, (Wd - w) / 2);
    return done(rows.length * rh, left);
  }
  return null;
}
