// Bogen-Leser: QR-Code lesen, Bogen ausrichten, Kästchen ausschneiden, daraus Zeichen-Bilder bauen.
import { toGray, components, dilateBox, resize, gauss, dilateDisk, shear, bboxOf, median, strokeWidth, SC, PAD, XH } from './imgops.js';
import { GEOM, parseMarker } from './sheet.js';
import { loadScript, tick } from './util.js';

const LB = 0.8, RB = 2.2, TARGET = 2.1;
export const REF_PX = 50;                 // Höhe eines kleinen e in Pixeln (bei 3 Pixel pro pt), wenn kein e auf dem Bogen ist
const LETTERS = new Set([...'abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜéèêëàâîïôùûÿçœæÉÈÊËÀÂÎÏÔÙÛÇŒ']);
const SUBS = new Set([...'₀₁₂₃₄₅₆₇₈₉']);
const SNAP = new Set([...'abcdehiklmnorstuvwxzßäöüABCDEFGHIKLMNOPRSTUVWXYZÄÖÜéèêëàâîïôùûÉÈÊËÀÂÎÏÔÙÛŒœæ']);
const DYSET = [...'acemnoruvwxz'];

// ---------- 1. QR-Code und grobe Lage ----------
export async function findMarker(canvas) {
  await loadScript('vendor/jsqr.js');
  const tryRead = (src, sx, sy, sw, sh, maxSide) => {
    const k = Math.min(1, maxSide / Math.max(sw, sh)), w = Math.max(8, Math.round(sw * k)), h = Math.max(8, Math.round(sh * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    const id = g.getImageData(0, 0, w, h), r = jsQR(id.data, w, h, { inversionAttempts: 'attemptBoth' });
    return r ? { r, k, sx, sy } : null;
  };
  const W = canvas.width, H = canvas.height;
  const tries = [[0, 0, W, H, 2400], [W * .4, 0, W * .6, H * .35, 1800], [0, 0, W, H, 1400], [0, 0, W, H, 900], [W * .5, 0, W * .5, H * .3, 1200], [0, H * .65, W * .6, H * .35, 1200]];
  for (const t of tries) {
    const f = tryRead(canvas, ...t); if (!f) continue;
    const m = parseMarker(f.r.data); if (!m) continue;
    const p = (q) => [f.sx + q.x / f.k, f.sy + q.y / f.k], L = f.r.location;
    return { marker: m, tl: p(L.topLeftCorner), tr: p(L.topRightCorner), bl: p(L.bottomLeftCorner), br: p(L.bottomRightCorner), version: f.r.version };
  }
  return null;
}

// grobe Abbildung Seite (pt) -> Bild (px) aus dem QR-Code, oder aus der ganzen Bildfläche
function roughAffine(canvas, qr) {
  const { PW, PH, M } = GEOM;
  if (qr) {
    const n = 17 + 4 * qr.version, side = 36 * n / (n + 4);               // Kantenlänge des QR-Symbols in pt
    const dx = qr.tr[0] - qr.tl[0], dy = qr.tr[1] - qr.tl[1], len = Math.hypot(dx, dy) || 1;
    const s = len / side;                                                  // tl/tr sind die äußeren Ecken des Symbols
    const th = Math.atan2(dy, dx), c = Math.cos(th) * s, sn = Math.sin(th) * s;
    const cx = (qr.tl[0] + qr.tr[0] + qr.bl[0] + qr.br[0]) / 4, cy = (qr.tl[1] + qr.tr[1] + qr.bl[1] + qr.br[1]) / 4;
    const px = PW - M - 18, py = 36;                                       // Mittelpunkt des QR-Codes auf der Vorlage
    return { a: c, b: -sn, c: cx - (c * px - sn * py), d: sn, e: c, f: cy - (sn * px + c * py), s, th };
  }
  const s = Math.min(canvas.width / PW, canvas.height / PH);
  return { a: s, b: 0, c: (canvas.width - PW * s) / 2, d: 0, e: s, f: (canvas.height - PH * s) / 2, s, th: 0 };
}
const rot = (A, dth, cx, cy) => {      // zusätzliche Drehung um (cx,cy) in Seitenkoordinaten
  const c = Math.cos(dth), s = Math.sin(dth);
  const q = { a: A.a * c + A.b * s, b: -A.a * s + A.b * c, d: A.d * c + A.e * s, e: -A.d * s + A.e * c };
  q.c = A.a * cx + A.b * cy + A.c - (q.a * cx + q.b * cy); q.f = A.d * cx + A.e * cy + A.f - (q.d * cx + q.e * cy);
  return q;
};
function sample(g, W, H, A, x0, y0, w, h, S) {    // Rechteck (pt) in S Pixel/pt, bilinear
  const o = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) / S, y = y0 + (j + 0.5) / S;
    const u = A.a * x + A.b * y + A.c - 0.5, v = A.d * x + A.e * y + A.f - 0.5, iu = Math.floor(u), iv = Math.floor(v);
    if (iu < 0 || iv < 0 || iu >= W - 1 || iv >= H - 1) { o[j * w + i] = 255; continue; }
    const fu = u - iu, fv = v - iv, p = iv * W + iu;
    o[j * w + i] = (g[p] * (1 - fu) + g[p + 1] * fu) * (1 - fv) + (g[p + W] * (1 - fu) + g[p + W + 1] * fu) * fv;
  }
  return o;
}
function boxDown(g, W, H, k) {
  if (k <= 1) return { g, W, H };
  const w = Math.floor(W / k), h = Math.floor(H / k), o = new Float32Array(w * h), kk = k * k;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let j = 0; j < k; j++) { const p = (y * k + j) * W + x * k; for (let i = 0; i < k; i++) s += g[p + i]; } o[y * w + x] = s / kk; }
  return { g: o, W: w, H: h };
}
const scaleA = (A, k) => ({ ...A, a: A.a / k, b: A.b / k, c: A.c / k, d: A.d / k, e: A.e / k, f: A.f / k });
function pct(a, q) { const h = new Uint32Array(256); for (let i = 0; i < a.length; i++) h[Math.max(0, Math.min(255, a[i] | 0))]++; let s = 0; const t = a.length * q; for (let i = 0; i < 256; i++) { s += h[i]; if (s >= t) return i; } return 255; }

// feine Ausrichtung: Drehung per Linien-Schärfe, dann Maßstab/Versatz je Achse aus den Rasterlinien
function refine(g0, W0, H0, A00, nCells) {
  const kd = Math.max(1, Math.round(Math.hypot(A00.a, A00.d) / 1.5)), { g, W, H } = boxDown(g0, W0, H0, kd), A0 = scaleA(A00, kd);
  const { PW, PH, M, cw, ch, gridTop } = GEOM, rows = Math.ceil(nCells / GEOM.COLS), cols = nCells >= GEOM.COLS ? GEOM.COLS : nCells;
  const gx0 = M - 6, gy0 = gridTop - 6, gw = Math.round(PW - 2 * M + 12), gh = Math.round(rows * ch + 12), S1 = 1;
  const smp = (A) => sample(g, W, H, A, gx0, gy0, gw, gh, S1);
  const base = smp(A0), paper = pct(base, 0.8);
  const lineness = (img) => {              // Gewicht 1 für hellgraue Pixel (Rasterlinien), sonst 0
    const lo = paper * 0.45, cap = paper * 0.3, rowP = new Float32Array(gh), colP = new Float32Array(gw);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const v = img[y * gw + x]; if (v > lo && v < paper * 0.9) { const w = Math.min(paper - v, cap); rowP[y] += w; colP[x] += w; } }
    return { rowP, colP };
  };
  const score = (img) => { const { rowP, colP } = lineness(img); let s = 0; for (const v of rowP) s += v * v; for (const v of colP) s += v * v; return s; };
  const cx = PW / 2, cy = gridTop + rows * ch / 2;
  let best = { th: 0, s: score(base) };
  for (let d = -3; d <= 3.001; d += 0.25) { if (!d) continue; const th = d * Math.PI / 180, s = score(smp(rot(A0, th, cx, cy))); if (s > best.s) best = { th, s }; }
  const t0 = best.th;
  for (let d = -0.25; d <= 0.251; d += 0.05) { const th = t0 + d * Math.PI / 180, s = score(smp(rot(A0, th, cx, cy))); if (s > best.s) best = { th, s }; }
  const A1 = best.th ? rot(A0, best.th, cx, cy) : A0;
  // Linienpositionen (Auflösung 2 Pixel/pt)
  const S2 = 2, gw2 = Math.round(gw * S2), gh2 = Math.round(gh * S2), img = sample(g, W, H, A1, gx0, gy0, gw2, gh2, S2);
  const lo = paper * 0.45, cap = paper * 0.3, rowP = new Float32Array(gh2), colP = new Float32Array(gw2);
  for (let y = 0; y < gh2; y++) for (let x = 0; x < gw2; x++) { const v = img[y * gw2 + x]; if (v > lo && v < paper * 0.9) { const w = Math.min(paper - v, cap); rowP[y] += w; colP[x] += w; } }
  const peaks = (P, exp0, step, n, S) => {       // Rückgabe: Paare {e: erwartet, m: gemessen, v: Stärke}
    const org = P === rowP ? gy0 : gx0, sm = new Float32Array(P.length);
    for (let i = 2; i < P.length - 2; i++) sm[i] = (P[i - 2] + P[i - 1] + P[i] + P[i + 1] + P[i + 2]) / 5;
    const at = (m) => { const i = Math.round((m - org) * S); return i >= 0 && i < sm.length ? sm[i] : 0; };
    // Kamm-Suche: passt ein Raster mit Maßstab a und Versatz b zu den Linien?
    let best = { a: 1, b: 0, s: -1 };
    for (let a = 0.96; a <= 1.04; a += 0.0015) for (let b = -14; b <= 14; b += 0.25) {
      let sc = 0; for (let k = 0; k <= n; k++) sc += at(a * (exp0 + k * step) + b);
      if (sc > best.s) best = { a, b, s: sc };
    }
    const pairs = [], win = 3 * S, vals = [];
    for (let k = 0; k <= n; k++) {
      const e = exp0 + k * step, c = Math.round((best.a * e + best.b - org) * S); let bi = -1, bv = 0;
      for (let i = Math.max(2, c - win); i <= Math.min(P.length - 3, c + win); i++) if (sm[i] > bv) { bv = sm[i]; bi = i; }
      if (bi > 0) { const den = sm[bi - 1] + sm[bi] + sm[bi + 1], pos = ((bi - 1) * sm[bi - 1] + bi * sm[bi] + (bi + 1) * sm[bi + 1]) / den; pairs.push({ e, m: pos / S + org + 0.5 / S, v: bv }); vals.push(bv); }
    }
    const med = median(vals) || 1;
    return pairs.filter(p => p.v > med * 0.35);
  };
  const fit = (pairs) => {                       // m = a*e + b, einmal Ausreißer entfernen
    if (pairs.length < 3) return null;
    const lf = (ps) => { const n = ps.length; let se = 0, sm = 0, see = 0, sem = 0; for (const p of ps) { se += p.e; sm += p.m; see += p.e * p.e; sem += p.e * p.m; } const a = (n * sem - se * sm) / (n * see - se * se); return { a, b: (sm - a * se) / n }; };
    let f = lf(pairs); const res = pairs.map(p => Math.abs(p.m - (f.a * p.e + f.b))), th = Math.max(1.5, 2.5 * median(res));
    const keep = pairs.filter((p, i) => res[i] <= th); if (keep.length >= 3 && keep.length < pairs.length) f = lf(keep);
    f.n = keep.length; f.max = Math.max(...keep.map(p => Math.abs(p.m - (f.a * p.e + f.b)))); return f;
  };
  const py = peaks(rowP, gridTop, ch, rows, S2), px_ = peaks(colP, M, cw, cols, S2), fy = fit(py), fx = fit(px_);
  const q = { ...A1 }, info = { angle: (best.th + 0) * 180 / Math.PI, paper, lines: [fx ? fx.n : 0, fy ? fy.n : 0], resid: Math.max(fx ? fx.max : 9, fy ? fy.max : 9), ok: !!(fx && fy) };
  if (fx && fy) {      // die Seite (x,y) liegt im groben Bild an (ax*x+bx, ay*y+by)
    q.a = A1.a * fx.a; q.d = A1.d * fx.a; q.b = A1.b * fy.a; q.e = A1.e * fy.a;
    q.c = A1.c + A1.a * fx.b + A1.b * fy.b; q.f = A1.f + A1.d * fx.b + A1.e * fy.b;
  }
  return { A: scaleA(q, 1 / kd), info };
}

// ---------- 2. Kästchen ausschneiden ----------
// cellsOnPage: [{ch, v, ...}] (Reihenfolge wie auf der Vorlage). Rückgabe: { cells, info }
export async function readPage(canvas, cellsOnPage, qr) {
  const id = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  const g = toGray(id), W = canvas.width, H = canvas.height;
  const gb = new Uint8Array(W * H); for (let i = 0, j = 2; i < gb.length; i++, j += 4) gb[i] = id.data[j];      // Blaukanal: die blauen Hilfslinien verschwinden, das graue Raster bleibt
  const A0 = roughAffine(canvas, qr), { A, info } = refine(gb, W, H, A0, cellsOnPage.length);
  info.qr = !!qr; info.dpi = Math.round(Math.hypot(A.a, A.d) * 72);
  const { M, cw, ch, gridTop, COLS } = GEOM, CW = Math.round((cw - 2) * SC), CH = Math.round((ch - 2) * SC);
  // Papierhelligkeit und Tintenschwelle aus der ganzen Gitterfläche
  const rows = Math.ceil(cellsOnPage.length / COLS);
  const all = sample(g, W, H, A, M, gridTop, Math.round(GEOM.PW - 2 * M), Math.round(rows * ch), 1);
  const paper = pct(all, 0.8), ink = pct(all, 0.003);
  const th = Math.max(100, Math.min(170, ink + 0.45 * (paper - ink)));
  info.th = Math.round(th); info.paper = paper; info.ink = ink;
  const out = [];
  for (let i = 0; i < cellsOnPage.length; i++) {
    const r = Math.floor(i / COLS), q = i % COLS, x = M + q * cw + 1, y = gridTop + r * ch + 1;
    const gray = sample(g, W, H, A, x, y, CW, CH, SC), mask = new Uint8Array(CW * CH);
    for (let k = 0; k < mask.length; k++) mask[k] = gray[k] < th ? 1 : 0;
    const c = cellsOnPage[i], { lab, comps } = components(mask, CW, CH), keep = new Uint8Array(CW * CH);
    const small = '.·,:;\'"`´‚…•°'.includes(c.ch);
    const dead = new Set();
    for (const k of comps) {
      const w = k.x1 - k.x0 + 1, h = k.y1 - k.y0 + 1;
      const inLabel = k.x1 < GEOM.labelW * SC + 6 && k.y1 < GEOM.labelH * SC + 3;
      const border = (k.x0 === 0 || k.y0 === 0 || k.x1 === CW - 1 || k.y1 === CH - 1);
      const line = border && ((w > CW * 0.8 && h <= 5) || (h > CH * 0.8 && w <= 5));
      if (k.area < (small ? 2 : 5) || inLabel || line) dead.add(k.id);
    }
    let n = 0, touch = false;
    for (let k = 0; k < mask.length; k++) if (mask[k] && !dead.has(lab[k])) { keep[k] = 1; n++; }
    for (const k of comps) if (!dead.has(k.id) && (k.x0 === 0 || k.y0 === 0 || k.x1 === CW - 1 || k.y1 === CH - 1) && k.area > 30) touch = true;
    const bb = n ? bboxOfMask(keep, CW, CH) : null;
    out.push({ ch: c.ch, v: c.v, w: CW, h: CH, gray: Uint8Array.from(gray, x => x), mask: keep, baseY: (ch * (1 - GEOM.baseFrac) - 1) * SC, ink: n, bb,
               flag: n < (small ? 3 : 12) ? 'leer' : touch ? 'rand' : '' });
    if ((i & 15) === 15) await tick();
  }
  return { cells: out, info };
}
function bboxOfMask(m, w, h) { let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return { x0, y0, x1, y1 }; }

// ---------- 3. Zeichen-Bilder bauen (Port der geprüften Python-Pipeline) ----------
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
function pngOf(A, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), id = g.createImageData(w, h), d = id.data;
  for (let i = 0; i < w * h; i++) { d[i * 4 + 3] = Math.round(clamp01(A[i]) * 255); }
  g.putImageData(id, 0, 0); return c.toDataURL('image/png');
}
function thickenSmall(a, w, h) {
  const m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = a[i] > 0.5 ? 1 : 0;
  const { lab, comps } = components(m, w, h); let out = null; const mind = 3.4 * SC;
  for (const k of comps) {
    const d = Math.max(k.x1 - k.x0 + 1, k.y1 - k.y0 + 1);
    if (d >= 4.2 * SC) continue;
    const r = Math.max(0, Math.ceil((mind - d) / 2)); if (r < 1) continue;
    out ||= Float32Array.from(a);
    const pad = r + 3, x0 = Math.max(0, k.x0 - pad), y0 = Math.max(0, k.y0 - pad), x1 = Math.min(w - 1, k.x1 + pad), y1 = Math.min(h - 1, k.y1 + pad), bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const sub = new Float32Array(bw * bh); for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) sub[y * bw + x] = lab[(y + y0) * w + x + x0] === k.id ? 1 : 0;
    const dl = gauss(dilateDisk(sub, bw, bh, r), bw, bh, 0.7);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) { const p = (y + y0) * w + x + x0; if (dl[y * bw + x] > out[p]) out[p] = dl[y * bw + x]; }
  }
  return out || a;
}
function thick(a, w, h, wd) {
  const d = TARGET - wd; if (d <= 0.15) return a;
  const r = d * SC / 2;
  if (r < 1) { const b = gauss(a, w, h, 0.8), o = new Float32Array(a.length); for (let i = 0; i < o.length; i++) o[i] = clamp01(b[i] * (1 + 0.9 * r)); return o; }
  return gauss(dilateDisk(a, w, h, Math.round(r)), w, h, 0.6);
}
function mainComp(a, w, h) {
  const m = new Uint8Array(w * h); for (let i = 0; i < m.length; i++) m[i] = a[i] > 0.5 ? 1 : 0;
  const { lab, comps } = components(m, w, h); if (!comps.length) return null;
  let b = comps[0]; for (const k of comps) if (k.area > b.area) b = k; return { lab, k: b };
}
function slantOf(mc, w, h) {
  const { lab, k } = mc; if (k.area < 40) return null;
  const hh = k.y1 - k.y0 + 1, ww = k.x1 - k.x0 + 1; if (hh < 1.25 * ww) return null;
  let my = 0, mx = 0, n = 0; for (let y = k.y0; y <= k.y1; y++) for (let x = k.x0; x <= k.x1; x++) if (lab[y * w + x] === k.id) { my += y; mx += x; n++; }
  my /= n; mx /= n; let sxy = 0, syy = 0;
  for (let y = k.y0; y <= k.y1; y++) for (let x = k.x0; x <= k.x1; x++) if (lab[y * w + x] === k.id) { sxy += (x - mx) * (y - my); syy += (y - my) * (y - my); }
  return (sxy / n) / Math.max(syy / n, 1);
}

// cells: Ergebnis von readPage (nur Zellen ohne Flag 'leer'). ref: { px, s0 } aus der bestehenden Schrift (optional)
export async function buildGlyphs(cells, ref = {}, onProgress = () => {}) {
  const used = cells.filter(c => c.flag !== 'leer' && c.ink > 0 && c.bb);
  // Skalierung aus der Höhe des kleinen e
  const eh = used.filter(c => c.ch === 'e').map(c => c.bb.y1 - c.bb.y0 + 1);
  const px = eh.length ? median(eh) : (ref.px || REF_PX), f = XH / px, F = f * SC, PADS = Math.round(PAD / f) + 2;
  const items = [];
  for (let n = 0; n < used.length; n++) {
    const c = used[n], bb = c.bb, y0 = bb.y0 - PADS, y1 = bb.y1 + PADS + 1, x0 = bb.x0 - PADS, x1 = bb.x1 + PADS + 1, Hh = y1 - y0, Ww = x1 - x0;
    const sub = new Float32Array(Ww * Hh).fill(255), mm = new Uint8Array(Ww * Hh);
    for (let y = Math.max(y0, 0); y < Math.min(y1, c.h); y++) for (let x = Math.max(x0, 0); x < Math.min(x1, c.w); x++) { sub[(y - y0) * Ww + x - x0] = c.gray[y * c.w + x]; mm[(y - y0) * Ww + x - x0] = c.mask[y * c.w + x]; }
    const pm = dilateBox(mm, Ww, Hh, 2), a0 = new Float32Array(Ww * Hh);
    for (let i = 0; i < a0.length; i++) a0[i] = pm[i] ? clamp01((190 - sub[i]) / 130) : 0;
    const dw = Math.max(4, Math.round(Ww * F)), dh = Math.max(4, Math.round(Hh * F));
    let a = resize(a0, Ww, Hh, dw, dh); a = gauss(a, dw, dh, 0.9); for (let i = 0; i < a.length; i++) a[i] = clamp01((a[i] - 0.25) / 0.5);
    items.push({ ch: c.ch, v: c.v, a, w: dw, h: dh, br: (c.baseY - y0) * dh / Hh });
    if (n % 6 === 5) { onProgress(0.35 * n / used.length); await tick(); }
  }
  // Strichstärke angleichen
  const ws = items.filter(it => LETTERS.has(it.ch)).map(it => strokeWidth(it.a, it.w, it.h)).filter(x => x > 0);
  const W0 = (ws.length ? median(ws) : median(items.map(it => strokeWidth(it.a, it.w, it.h)).filter(x => x > 0))) / SC || 2;
  for (let n = 0; n < items.length; n++) {
    const it = items[n], wd = strokeWidth(it.a, it.w, it.h) / SC || W0;
    it.a = thickenSmall(thick(it.a, it.w, it.h, wd), it.w, it.h);
    if (n % 6 === 5) { onProgress(0.35 + 0.3 * n / items.length); await tick(); }
  }
  // Neigung und Größe vereinheitlichen
  const SL = [], MH = {};
  for (const it of items) { if (!LETTERS.has(it.ch)) continue; const mc = mainComp(it.a, it.w, it.h); it.mc = mc; it.sl = mc ? slantOf(mc, it.w, it.h) : null; it.hh = mc ? mc.k.y1 - mc.k.y0 + 1 : null; if (it.sl != null) SL.push(it.sl); }
  const byCh = {}; for (const it of items) (byCh[it.ch] ||= []).push(it);
  for (const ch of Object.keys(byCh)) { if (!LETTERS.has(ch)) continue; const hs = byCh[ch].map(i => i.hh).filter(Boolean); MH[ch] = hs.length ? median(hs) : null; }
  const S0 = SL.length ? median(SL) : (ref.s0 ?? 0);
  const fin = {};
  const res = [];
  for (let n = 0; n < items.length; n++) {
    const it = items[n], ch = it.ch; let a = it.a, w = it.w, h = it.h, br = it.br;
    if (LETTERS.has(ch) && it.sl != null) {
      const k = Math.max(-.3, Math.min(.3, (it.sl - S0) * 0.9)), s = shear(a, w, h, k, br); a = s.a; w = s.w;
    }
    if (LETTERS.has(ch) && MH[ch] && it.hh) {
      const fz = Math.max(.86, Math.min(1.16, MH[ch] / it.hh)), nw = Math.max(4, Math.round(w * fz)), nh = Math.max(4, Math.round(h * fz));
      a = resize(a, w, h, nw, nh); w = nw; h = nh; br *= fz;
    }
    // Zuschneiden + Rand
    for (let i = 0; i < a.length; i++) a[i] = clamp01(a[i]);
    const bb = bboxOf(a, w, h, 0.04); if (!bb) continue;
    const m = PAD * SC, bw = bb.x1 - bb.x0 + 1, bh = bb.y1 - bb.y0 + 1, AW = bw + 2 * m, AH = bh + 2 * m, A = new Float32Array(AW * AH);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) A[(y + m) * AW + x + m] = a[(y + bb.y0) * w + x + bb.x0];
    let br2 = br - bb.y0 + m; const ybot = m + bh - 1;
    if (SUBS.has(ch)) br2 = ybot - 7 * SC;
    for (let i = 0; i < A.length; i++) A[i] = clamp01((A[i] - 0.5) * 1.8 + 0.5);
    res.push({ ch, v: it.v, A, AW, AH, br2, inkw: bw / SC, ybot });
    if (n % 6 === 5) { onProgress(0.65 + 0.25 * n / items.length); await tick(); }
  }
  // Grundlinie: Unterkante der Standard-Buchstaben auf die Linie ziehen, dann je Zeichen einrasten
  const bots = res.filter(r => DYSET.includes(r.ch)).map(r => (r.ybot - r.br2) / SC);
  const DY = bots.length ? median(bots) : 0;
  for (const r of res) { if (!SUBS.has(r.ch)) r.br2 += DY * SC; }
  for (const r of res) if (SNAP.has(r.ch)) { const b = (r.ybot - r.br2) / SC; r.br2 += b * SC - 0.3 * SC; }
  // Verpacken
  const g = {};
  for (const r of res) {
    const oy = -r.br2 / SC, ox = LB - PAD, seg = r.inkw + LB + RB;
    const d = { src: pngOf(r.A, r.AW, r.AH), iw: +(r.AW / SC).toFixed(2), ih: +(r.AH / SC).toFixed(2), ox: +ox.toFixed(2), oy: +oy.toFixed(2), seg: +seg.toFixed(2) };
    let cnt = 0; for (let i = 0; i < r.A.length; i++) if (r.A[i] > 0.5) cnt++;
    if (cnt > 60) {
      let xa = r.AW, xb = -1; for (let x = 0; x < r.AW; x++) for (let y = 0; y < r.AH; y++) if (r.A[y * r.AW + x] > 0.5) { if (x < xa) xa = x; if (x > xb) xb = x; break; }
      const pt = (lo, hi) => { let sx = 0, sy = 0, n = 0; for (let y = 0; y < r.AH; y++) for (let x = lo; x <= hi; x++) if (r.A[y * r.AW + x] > 0.5) { sx += x; sy += y; n++; } return n ? [+((sx / n) / SC + ox).toFixed(2), +((sy / n) / SC + oy).toFixed(2)] : null; };
      d.en = pt(xa, Math.min(xa + SC, xb)); d.ex = pt(Math.max(xb - SC, xa), xb);
      if (!d.en || !d.ex) { delete d.en; delete d.ex; }
    }
    (g[r.ch] ||= [])[r.v] = d;
  }
  for (const k of Object.keys(g)) g[k] = g[k].filter(Boolean);
  onProgress(1);
  return { g, ref: { px: Math.round(px * 10) / 10, s0: S0 }, stats: { cells: used.length, f: +f.toFixed(3), W0: +W0.toFixed(2), S0: +S0.toFixed(3), DY: +DY.toFixed(2) } };
}
