// Noten setzen: [noten] … [/noten] im Text. Notenköpfe, Schlüssel, Pausen und Vorzeichen kommen aus der eigenen Schrift
// (Paket „Noten“), Hälse, Fähnchen, Hilfs- und Taktstriche zeichnet die App in derselben Strichstärke.
// Auf dem Papier „Notenlinien“ liegen die Noten genau auf den gedruckten Linien, sonst zeichnet die App die fünf Linien selbst.
//
// Schreibweise:  c d e f | g2 g2 | a4 a a a | g1
//   Tonname c d e f g a h (b = B), Pause r · ' eine Oktave höher, , tiefer · # Kreuz, b Be (nach dem Tonnamen), = Auflöser
//   Dauer 1 2 4 8 16 (gilt weiter, bis eine neue kommt), . punktiert · | Taktstrich, || Schlussstrich
//   Eigenschaften: schluessel: violin|bass · takt: 3/4 · text: Al-le mei-ne Ent-chen (Silben unter die Noten)
import { getP, allP, text } from './hdf.js';

export const NOTE_CHARS = { kopf: '𝅘', hohl: '𝅗', ganz: '𝅝', violin: '𝄞', bass: '𝄢', kreuz: '♯', be: '♭', aufl: '♮', p1: '𝄻', p2: '𝄼', p4: '𝄽', p8: '𝄾', p16: '𝄿' };
const STEP = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, h: 6, b: 6 };
const P = (pts, w = 1, extra) => ({ path: { pts, w, ...extra } });
const ell = (cx, cy, rx, ry, n = 18) => Array.from({ length: n + 1 }, (_, i) => [cx + rx * Math.cos(i / n * 6.2832), cy + ry * Math.sin(i / n * 6.2832)]);

function parse(src, err, line) {
  const out = []; let dur = 4;
  for (const tk of src.split(/\s+/).filter(Boolean)) {
    if (tk === '|' || tk === '||' || tk === '|.') { out.push({ bar: tk === '|' ? 1 : 2 }); continue; }
    const m = /^([a-hr])(#|b|=)?(['’]*|,*)(1|2|4|8|16)?(\.)?$/i.exec(tk);
    if (!m) { err(line, `Note „${tk}“ verstehe ich nicht (Beispiel: c d e f | g2)`, 'warn'); continue; }
    const L = m[1].toLowerCase(); if (m[4]) dur = +m[4];
    if (L === 'r') { out.push({ rest: true, dur, dot: !!m[5] }); continue; }
    let acc = m[2] || null; if (L === 'b' && !acc) acc = 'b';
    const oct = (m[3].match(/['’]/g) || []).length - (m[3].match(/,/g) || []).length;
    out.push({ step: STEP[L], oct, acc, dur, dot: !!m[5] });
  }
  return out;
}

// Wo liegt die Tinte im Bild eines gezeichneten Zeichens? Bounding-Box und der Punkt ganz rechts/links (dort setzt der Notenhals an).
// Einmal je Variante berechnet; ohne Bild (z. B. in Tests) gilt das ganze Bild.
const INK = new WeakMap();
function inkOf(v) {
  let r = INK.get(v); if (r) return r;
  const img = v.img, W = (img && (img.naturalWidth || img.width)) || 100, H = (img && (img.naturalHeight || img.height)) || Math.round(100 * v.ih / v.iw);
  r = { W, H, x0: 0, x1: W, y0: 0, y1: H, r: [W, H / 2], l: [0, H / 2] };
  try {
    if (!img || !W || typeof document === 'undefined') throw 0;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, W, H).data, on = (x, y) => d[(y * W + x) * 4 + 3] > 90;
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (on(x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 >= 0) {
      const side = (from, step) => { for (let x = from; x >= x0 && x <= x1; x += step) { let n = 0, sy = 0; for (let y = y0; y <= y1; y++) if (on(x, y)) { n++; sy += y; } if (n) return [x + (step < 0 ? 1 : 0), sy / n]; } return null; };
      r = { W, H, x0, x1: x1 + 1, y0, y1: y1 + 1, r: side(x1, -1) || [x1 + 1, (y0 + y1) / 2], l: side(x0, 1) || [x0, (y0 + y1) / 2] };
    }
  } catch (_) { /* kein Bild/Canvas: ganzes Bild */ }
  INK.set(v, r); return r;
}

export function musicBlock(el, ctx) {
  const PX = ctx.px || 150 / 72, onPaper = !!ctx.notenPapier, W = ctx.W, u = ctx.u, k = ctx.k, lineH = ctx.lineH;
  const sp = onPaper ? 8 * PX : Math.max(lineH * .24, u * .5);                 // Abstand zweier Notenlinien
  const pitch = onPaper ? lineH : Math.max(2, Math.ceil((sp * 9) / lineH)) * lineH; // Abstand zweier Systeme (immer ganze Zeilen)
  const base0 = onPaper ? 4 * sp + 20 * PX : 4 * sp + lineH * .62 + sp;           // Grundlinie (Liedtext) unter dem ersten System
  const top0 = base0 - (onPaper ? 20 * PX : lineH * .62 + sp) - 4 * sp;           // oberste Notenlinie
  const clef = /bass/i.test(getP(el, 'schluessel') || getP(el, 'schlüssel') || '') ? 'bass' : 'violin';
  const takt = (getP(el, 'takt') || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  const lyr = (allP(el, 'text').map((p) => p.v).join(' ')).split(/\s+/).filter(Boolean).flatMap((w) => w.split(/(?<=-)/));
  const notes = parse(text(el), ctx.err, el.line);
  if (!notes.length) { ctx.err(el.line, '[noten] ohne Noten (Beispiel: c d e f | g2 g2)', 'warn'); return null; }
  const items = [], wid = .9;   // Strichstärke wie die Schrift
  const bottomD = clef === 'bass' ? 2 * 7 + 4 : 4 * 7 + 2;                         // unterste Linie: G2 bzw. E4
  const baseOct = clef === 'bass' ? 3 : 4;
  // Zeichen aus der Schrift so skalieren, dass die TINTE (nicht das Bild mit Rand) die Höhe hgt hat, und mittig an (cx, cy) setzen.
  // Gibt die Breite zurück (false, wenn es das Zeichen nicht gibt); in last steht, wo die Tinte wirklich liegt (für Notenhälse)
  let last = null;
  const glyph = (ch, cx, cy, hgt, alignLeft = false) => {
    last = null; if (!ctx.has(ch)) return false;
    const g = ctx.run(ch, 1).run[0]; if (!g || !g.v) return false;
    const v = g.v, ib = inkOf(v), U = v.iw / ib.W;   // U: Bildpixel → Schrift-Einheiten
    g.sc = hgt / Math.max(.01, (ib.y1 - ib.y0) * U * k); const s = k * g.sc;
    const ix0 = v.ox + ib.x0 * U, ix1 = v.ox + ib.x1 * U, iy0 = v.oy + ib.y0 * U, iy1 = v.oy + ib.y1 * U;
    const x = alignLeft ? cx - ix0 * s : cx - (ix0 + ix1) / 2 * s, y = cy - (iy0 + iy1) / 2 * s;
    const pt = (q) => [x + (v.ox + q[0] * U) * s, y + (v.oy + q[1] * U) * s];
    last = { right: pt(ib.r), left: pt(ib.l), x0: x + ix0 * s, x1: x + ix1 * s };
    items.push({ g, m: 1, x, y, rot: 0 }); return (ix1 - ix0) * s;
  };
  let sys = 0, x = 0, top = top0, ni = 0, li = 0;
  const yOf = (d) => top + 4 * sp - (d - bottomD) * sp / 2;
  let lines = [];
  const staff = () => { lines = []; if (!onPaper) for (let i = 0; i < 5; i++) { const it = P([[0, top + i * sp], [W, top + i * sp]], .55); lines.push(it); items.push(it); } };
  const endStaff = (xe) => { for (const it of lines) it.path.pts[1][0] = Math.min(W, xe); };
  const clefAt = () => {
    const ch = NOTE_CHARS[clef], cy = clef === 'violin' ? top + 2.6 * sp : top + 1.4 * sp, hh = clef === 'violin' ? 6.5 * sp : 3.2 * sp;
    const w = glyph(ch, 0, cy, hh, true);
    if (!w) {   // Ersatz, solange der Schlüssel nicht gezeichnet ist
      if (clef === 'violin') { items.push(P([[sp * .9, top + 5.2 * sp], [sp * .9, top - 1 * sp], [sp * 1.6, top - .4 * sp], [sp * .4, top + 2.2 * sp], [sp * .5, top + 3.6 * sp], [sp * 1.6, top + 3.4 * sp], [sp * 1.5, top + 2.5 * sp], [sp * .8, top + 2.6 * sp]], wid)); x = 2.4 * sp; }
      else { items.push(P(ell(sp * .9, top + sp, sp * .5, sp * .5), wid), P([[sp * 1.4, top + sp], [sp * .9, top + 3 * sp]], wid), P(ell(sp * 1.9, top + .5 * sp, .12 * sp, .12 * sp, 8), wid), P(ell(sp * 1.9, top + 1.5 * sp, .12 * sp, .12 * sp, 8), wid)); x = 2.4 * sp; }
    } else x = w + sp * .8;
    if (takt && sys === 0) {
      for (const [n, cy] of [[takt[1], top + sp], [takt[2], top + 3 * sp]]) {
        let xx = x; for (const c of n) { const w2 = glyph(c, xx, cy, 1.8 * sp, true); xx += (w2 || sp) + sp * .1; }
      }
      x += sp * (1.6 + .9 * Math.max(takt[1].length, takt[2].length));
    }
    x += sp * .6;
  };
  const newSystem = () => { if (sys > 0) { top += pitch; } staff(); clefAt(); };
  newSystem();
  const sylW = (i) => i < lyr.length ? ctx.textBox(lyr[i], .85).w + sp * .9 : 0;   // Platz für die Silbe darunter
  const widthOf = (n, li2) => n.bar ? sp * 1.6 : Math.max(sp * ({ 1: 4.2, 2: 3.4, 4: 2.7, 8: 2.2, 16: 1.9 }[n.dur] || 2.7) * (n.dot ? 1.25 : 1), n.rest ? 0 : sylW(li2)) + (n.acc ? sp * 1.2 : 0);
  for (const n of notes) {
    if (x + widthOf(n, li) > W && !n.bar) { if (!onPaper) { endStaff(x + sp * .3); items.push(P([[x + sp * .3, top], [x + sp * .3, top + 4 * sp]], wid)); } sys++; newSystem(); }
    if (n.bar) {
      if (x < sp * 4) continue;
      const bx = x + sp * .3; items.push(P([[bx, top], [bx, top + 4 * sp]], n.bar === 2 ? wid * 1.8 : wid));
      if (n.bar === 2) items.push(P([[bx - sp * .4, top], [bx - sp * .4, top + 4 * sp]], wid));
      x += sp * 1.6; continue;
    }
    const w = widthOf(n, li);
    if (n.rest) {
      const cx = x + sp * 1.2;
      if (!glyph(NOTE_CHARS['p' + n.dur] || NOTE_CHARS.p4, cx, top + 2 * sp, ({ 1: .6, 2: .6, 4: 3, 8: 2, 16: 2.6 }[n.dur] || 2.4) * sp)) {
        if (n.dur <= 2) { const y0 = n.dur === 1 ? top + sp : top + 1.5 * sp; for (let i = 0; i < 4; i++) items.push(P([[cx - .6 * sp, y0 + i * .12 * sp], [cx + .6 * sp, y0 + i * .12 * sp]], wid)); }
        else items.push(P([[cx - .3 * sp, top + .6 * sp], [cx + .4 * sp, top + 1.5 * sp], [cx - .3 * sp, top + 2.3 * sp], [cx + .4 * sp, top + 3.1 * sp], [cx - .2 * sp, top + 3 * sp], [cx + .1 * sp, top + 3.7 * sp]], wid));
      }
      if (n.dot) items.push(P(ell(cx + sp, top + 1.5 * sp, .14 * sp, .14 * sp, 8), wid));
      x += w; continue;
    }
    const d = (baseOct + n.oct) * 7 + n.step, cy = yOf(d);
    let hx = x + sp * .8;
    if (n.acc) { const ch = n.acc === '#' ? NOTE_CHARS.kreuz : n.acc === 'b' ? NOTE_CHARS.be : NOTE_CHARS.aufl;
      if (!glyph(ch, hx, n.acc === 'b' ? cy - .5 * sp : cy, (n.acc === 'b' ? 2.4 : 2.6) * sp)) {
        if (n.acc === '#') items.push(P([[hx - .25 * sp, cy - 1.2 * sp], [hx - .25 * sp, cy + 1.2 * sp]], wid), P([[hx + .25 * sp, cy - 1.3 * sp], [hx + .25 * sp, cy + 1.1 * sp]], wid), P([[hx - .6 * sp, cy - .3 * sp], [hx + .6 * sp, cy - .6 * sp]], wid), P([[hx - .6 * sp, cy + .5 * sp], [hx + .6 * sp, cy + .2 * sp]], wid));
        else if (n.acc === 'b') items.push(P([[hx - .3 * sp, cy - 2 * sp], [hx - .3 * sp, cy + .5 * sp], [hx + .4 * sp, cy - .1 * sp], [hx + .1 * sp, cy - .5 * sp], [hx - .3 * sp, cy - .2 * sp]], wid));
        else items.push(P([[hx - .3 * sp, cy - 1.4 * sp], [hx - .3 * sp, cy + .4 * sp], [hx + .3 * sp, cy + .2 * sp]], wid), P([[hx + .3 * sp, cy + 1.4 * sp], [hx + .3 * sp, cy - .4 * sp], [hx - .3 * sp, cy - .2 * sp]], wid));
      }
      hx += sp * 1.2;
    }
    const cx = hx + sp * .6, rx = sp * .62, ry = sp * .45;
    // Hilfslinien
    for (let dd = bottomD - 2; dd >= d; dd -= 2) items.push(P([[cx - rx * 1.7, yOf(dd)], [cx + rx * 1.7, yOf(dd)]], wid));
    for (let dd = bottomD + 10; dd <= d; dd += 2) items.push(P([[cx - rx * 1.7, yOf(dd)], [cx + rx * 1.7, yOf(dd)]], wid));
    // Kopf
    const head = n.dur === 1 ? NOTE_CHARS.ganz : n.dur === 2 ? NOTE_CHARS.hohl : NOTE_CHARS.kopf;
    let hr = [cx + rx * .97, cy - .12 * sp], hl = [cx - rx * .97, cy + .12 * sp];   // Ansatzpunkte des Halses (Ersatzkopf)
    if (glyph(head, cx, cy, sp * .95) && last) {
      // gezeichneter Kopf: Hals genau an der Tinte ansetzen (rechts bei Hals nach oben, links bei Hals nach unten)
      hr = [last.right[0] - wid * .35, last.right[1]]; hl = [last.left[0] + wid * .35, last.left[1]];
    } else {
      if (n.dur <= 2) items.push(P(ell(cx, cy, rx, ry), wid));
      else for (let f = 1; f > .1; f -= .22) items.push(P(ell(cx, cy, rx * f, ry * f), wid * 1.2));
    }
    // Hals und Fähnchen
    if (n.dur >= 2) {
      const up = d < bottomD + 4, [sx, sy] = up ? hr : hl, y1 = up ? cy - 3.4 * sp : cy + 3.4 * sp;
      items.push(P([[sx, sy], [sx, y1]], wid));
      const flags = n.dur >= 16 ? 2 : n.dur >= 8 ? 1 : 0;
      for (let f = 0; f < flags; f++) { const fy = y1 + (up ? 1 : -1) * f * .8 * sp; items.push(P([[sx, fy], [sx + .5 * sp, fy + (up ? .7 : -.7) * sp], [sx + .9 * sp, fy + (up ? 1.6 : -1.6) * sp], [sx + .6 * sp, fy + (up ? 2.4 : -2.4) * sp]], wid)); }
    }
    if (n.dot) items.push(P(ell(cx + rx + .5 * sp, cy - (d % 2 === bottomD % 2 ? .5 * sp : 0), .14 * sp, .14 * sp, 8), wid));
    // Liedtext
    if (li < lyr.length) {
      const syl = lyr[li++], tb = ctx.textBox(syl, .85);
      for (const it of tb.items) items.push({ ...it, x: it.x + cx - tb.w / 2, y: it.y + top + (base0 - top0) });
    }
    ni++; x += w;
  }
  if (!onPaper) { const last = notes[notes.length - 1]; endStaff(last && last.bar ? x - sp * 1.3 : x + sp * .2); if (!(last && last.bar)) items.push(P([[x + sp * .2, top], [x + sp * .2, top + 4 * sp]], wid)); }
  const h = (top - top0) + base0 + (onPaper ? 0 : sp);
  return { w: W, h, base: base0, items, align: 'links' };
}
