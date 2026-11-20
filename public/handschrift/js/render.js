// Text -> Seitenlayout -> Zeichnen (Handschrift-Motor)
import { components, bboxOf } from './imgops.js';

export const SC = 3;
export const FORMATS = {
  a4:   { name: 'A4 hochkant', w: 1240, h: 1754 },
  a4q:  { name: 'A4 quer', w: 1754, h: 1240 },
  a5:   { name: 'A5 hochkant', w: 874, h: 1240 },
  a5q:  { name: 'A5 quer', w: 1240, h: 874 },
  letter: { name: 'US Letter', w: 1275, h: 1650 },
  ipad: { name: 'iPad (4:3)', w: 1240, h: 1653 },
  quad: { name: 'Quadrat', w: 1400, h: 1400 },
  gn:   { name: 'GoodNotes Standard', w: 948, h: 1226 },
};
export const PAPERS = {
  lined: 'Liniert', grid: 'Kariert', dots: 'Punkte', blank: 'Leer', college: 'Schulheft (eng)', legal: 'Gelbes Blatt',
  gnlin: 'GoodNotes liniert', gnkar: 'GoodNotes kariert',
};
// Eingebaute GoodNotes-Vorlagen (Standardseite 455,04 x 588,45 pt = 948 x 1226 px bei 150 dpi).
// h0/hp: erste Linie und Abstand (pt, Mitte der 0,5 pt dicken Linie); v0/vp: senkrechte Linien; every: Schreibzeile = jede n-te Linie
const PXPT = 150 / 72;
export const GNPAPER = {
  gnlin: { h0: 49.75, hp: 25, every: 1, size: 18, ml: 110, mr: 70, mt: 60, mb: 50 },
  gnkar: { h0: 15.75, hp: 16, v0: 15.75, vp: 16, every: 2, size: 22, ml: 110, mr: 70, mt: 60, mb: 50 },
};
export const fmtOf = (S) => GNPAPER[S.paper] ? 'gn' : S.fmt;
// Grundlinien (px) der Schreibzeilen auf einer GoodNotes-Vorlage
function gnRuler(S, MT) {
  const gp = GNPAPER[S.paper]; if (!gp) return null;
  const y0 = gp.h0 * PXPT, step = gp.hp * gp.every * PXPT;
  const snapY = (y) => y0 + Math.ceil((y - y0) / step - 1e-6) * step - 1;
  const snapX = (x) => gp.vp ? gp.v0 * PXPT + Math.ceil((x - gp.v0 * PXPT) / (gp.vp * PXPT) - 1e-6) * gp.vp * PXPT + 3 : x;
  return { step, snapY, snapX, MT };
}
export const PAPER_COLORS = { weiss: '#ffffff', creme: '#fbf9f2', gelb: '#fdf3c4', blau: '#eef4fb', dunkel: '#23262b' };
export const PENS = {
  kugel_blau:  { name: 'Kugelschreiber blau', ink: '#1d3a9a', weight: .35, alpha: 1 },
  kugel_schwarz: { name: 'Kugelschreiber schwarz', ink: '#16161c', weight: .35, alpha: 1 },
  fueller:     { name: 'Füller', ink: '#14275c', weight: .7, alpha: .96 },
  fineliner:   { name: 'Fineliner', ink: '#0d0d10', weight: .1, alpha: 1 },
  bleistift:   { name: 'Bleistift', ink: '#4b4c52', weight: 0, alpha: .82 },
  rot:         { name: 'Rot', ink: '#c62828', weight: .35, alpha: 1 },
  gruen:       { name: 'Grün', ink: '#1b7a3a', weight: .35, alpha: 1 },
};
export const DEF = {
  fmt: 'a4', paper: 'lined', paperColor: 'creme', scan: true, pen: 'kugel_blau', ink: '#1d3a9a', weight: .35, inkAlpha: 1,
  size: 21, lh: 2.9, sp: .9, wsp: 1, jit: .6, slant: 0, capsc: 1, seed: 7,
  mt: 140, mb: 120, ml: 120, mr: 100, kz: true, markup: true, sz: false, margin: true,
  header: '', pageNum: false, pageNumFmt: '{n}',
};

const FB = {
  '”': { c: '“' }, '‚': { c: ',' }, '’': { c: "'" }, '‘': { c: "'" }, '`': { c: "'" }, '´': { c: "'" },
  '—': { c: '–', sx: 1.4 }, '‐': { c: '-' }, '‑': { c: '-' }, '‹': { c: '<', s: .7 }, '›': { c: '>', s: .7 },
  'µ': { c: 'μ' }, '∑': { c: 'Σ' }, '∆': { c: 'Δ' }, '∙': { c: '·' }, '•': { c: '·', s: 1.6 }, '·': { c: '.', s: 1.25 }, 'ẞ': { c: 'ß' }, 'Ω': { c: 'ω', s: 1.35 },
  '′': { c: "'" }, '″': { c: '"' }, '−': { c: '-' }, '‒': { c: '-' }, '―': { c: '–', sx: 1.4 }, '…': { c: '.', rep: 3 },
  '«': { c: '<', s: .9 }, '»': { c: '>', s: .9 }, '×': { c: 'x', s: .8 }, '÷': { c: ':' }, '⁄': { c: '/' }, '∕': { c: '/' },
};
const SUPSUB = {}; '⁰¹²³⁴⁵⁶⁷⁸⁹'.split('').forEach((c, i) => SUPSUB[c] = { c: String(i), up: -14 }); '₀₁₂₃₄₅₆₇₈₉'.split('').forEach((c, i) => SUPSUB[c] = { c: String(i), up: 6 });
Object.assign(SUPSUB, { 'ⁿ': { c: 'n', up: -14 }, '⁺': { c: '+', up: -14 }, '⁻': { c: '-', up: -14 }, '₊': { c: '+', up: 6 }, '₋': { c: '-', up: 6 } });
const SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', n: 'ⁿ', '+': '⁺', '-': '⁻' };
const SUBD = '₀₁₂₃₄₅₆₇₈₉';
const TEX = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', omega: 'ω', omicron: 'ο',
  Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', Pi: 'Π', Gamma: 'Γ', Theta: 'Θ', Lambda: 'Λ', Phi: 'Φ', Psi: 'Ψ', infty: '∞', sqrt: '√', cdot: '·', times: '×', div: '÷', pm: '±',
  neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥', approx: '≈', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', in: '∈', notin: '∉',
  sum: '∑', prod: '∏', int: '∫', partial: '∂', nabla: '∇', forall: '∀', exists: '∃', deg: '°', cup: '∪', cap: '∩', subset: '⊂', emptyset: '∅', neg: '¬', land: '∧', lor: '∨',
  N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ', angle: '∠', perp: '⊥', parallel: '∥', therefore: '∴', euro: '€', copyright: '©', checkmark: '✓', star: '★', heart: '♥' };

export function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const makeNoise = (rng) => { const p = [rng() * 6.28, rng() * 6.28, rng() * 6.28]; return x => .5 * Math.sin(x / 190 + p[0]) + .3 * Math.sin(x / 75 + p[1]) + .2 * Math.sin(x / 33 + p[2]); };

export function prep(t, S) {
  t = t.normalize('NFC');
  if (!S.kz) return t;
  return t.replace(/<=>/g, '⇔').replace(/=>/g, '⇒').replace(/->/g, '→').replace(/<-/g, '←').replace(/<=/g, '≤').replace(/>=/g, '≥').replace(/!=/g, '≠').replace(/\+-/g, '±').replace(/~=/g, '≈')
    .replace(/\\([A-Za-z]+)/g, (m, n) => TEX[n] || m)
    .replace(/\^([0-9n]+)/g, (m, d) => [...d].map(c => SUP[c]).join(''))
    .replace(/\^([+-])(?=[0-9n])/g, (m, s) => SUP[s])
    .replace(/([A-Za-zÄÖÜäöüß)\]])_([0-9]+)/g, (m, a, d) => a + [...d].map(c => SUBD[+c]).join(''));
}

// ---------------- Schrift-Bibliothek ----------------
const COMBI = { '̀': 'grave', '́': 'acute', '̂': 'circ', '̃': 'tilde', '̈': 'diaer', '̊': 'ring', '̌': 'caron', '̧': 'cedil', '̨': 'ogon', '̄': 'macron', '̆': 'breve', '̇': 'dot', '̋': 'dacute' };
const SPECIAL = { '¡': ['!', 'flip'], '¿': ['?', 'flip'], 'ø': ['o', 'slash'], 'Ø': ['O', 'slash'], 'ł': ['l', 'bar'], 'Ł': ['L', 'bar'], 'đ': ['d', 'bar'], 'Đ': ['D', 'bar'], 'ħ': ['h', 'bar'], 'ı': ['i', 'dotless'] };

export class Font {
  constructor(data) { this.g = {}; for (const [k, a] of Object.entries(data.g || {})) this.g[k] = a.map(v => ({ ...v })); this.meta = data.meta || {}; this.XH = this.meta.xh || 27; this.comp = {}; this.ready = null; this.name = data.name || ''; }
  async load(onProgress) {
    const jobs = []; let n = 0, tot = 0; for (const a of Object.values(this.g)) tot += a.length;
    for (const arr of Object.values(this.g)) for (const v of arr) {
      v.img = new Image(); v.img.src = v.src;
      jobs.push(v.img.decode().catch(() => {}).then(() => { if (onProgress && (++n & 31) === 0) onProgress(n / tot); }));
    }
    await Promise.all(jobs); return this;
  }
  has(ch) { return !!this.g[ch]; }
  // Ersatz: Zeichen, die es nicht gibt, aus Buchstabe + gezeichnetem Akzent bauen
  async prepare(text) {
    const need = new Set(); for (const ch of new Set([...text])) if (!this.g[ch] && !(ch in this.comp) && !FB[ch] && !/\s/.test(ch)) need.add(ch);
    for (const ch of need) {
      const nfd = ch.normalize('NFD'); let base = nfd[0], kinds = [...nfd.slice(1)].map(c => COMBI[c]).filter(Boolean);
      if (SPECIAL[ch]) { base = SPECIAL[ch][0]; kinds = [SPECIAL[ch][1]]; }
      this.comp[ch] = null;
      if (!kinds.length || !this.g[base]) continue;
      try { this.comp[ch] = await Promise.all(this.g[base].map((v, i) => composeGlyph(v, kinds, ch.charCodeAt(0) * 7 + i, this.meta.pen))); } catch (e) { this.comp[ch] = null; }
    }
  }
  resolve(ch) {
    if (this.g[ch]) return { pool: this.g[ch], s: 1, sx: 1 };
    if (ch === '"') return this.g['„'] ? { pool: this.g['„'], s: 1, sx: 1 } : this.g['“'] ? { pool: this.g['“'], s: 1, sx: 1 } : null;
    if (this.comp[ch]) return { pool: this.comp[ch], s: 1, sx: 1 };
    let f = FB[ch];
    if (f && !this.g[f.c] && FB[f.c]) f = { ...FB[f.c], s: (f.s || 1) * (FB[f.c].s || 1) };
    if (f && this.g[f.c]) return { pool: this.g[f.c], s: f.s || 1, sx: f.sx || 1, rep: f.rep || 1 };
    const si = SUPSUB[ch];
    if (si && this.g[si.c]) return { pool: this.g[si.c], s: .62, sx: 1, up: si.up };
    const b0 = ch.normalize('NFD')[0];
    if (b0 !== ch && this.g[b0]) return { pool: this.g[b0], s: 1, sx: 1 };
    const lo = ch.toLowerCase(), up = ch.toUpperCase();
    if (ch !== lo && this.g[lo]) return { pool: this.g[lo], s: 1.4, sx: 1 };
    if (ch !== up && this.g[up]) return { pool: this.g[up], s: .72, sx: 1 };
    // griechische Großbuchstaben, die wie lateinische aussehen
    const GL = { 'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X', 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X' };
    if (GL[ch] && this.g[GL[ch]]) return { pool: this.g[GL[ch]], s: 1, sx: 1 };
    return null;
  }
}

// Akzent aus Buchstabe + Strichen zeichnen. Ergebnis: neues Zeichen im selben Format wie echte Zeichen.
async function composeGlyph(v, kinds, seed, pen) {
  const rng = mulberry32(seed), PEN = pen || 2.5, u = SC, PF = Math.pow(PEN / 2.5, .6);
  const w = v.img.naturalWidth || Math.round(v.iw * SC), h = v.img.naturalHeight || Math.round(v.ih * SC);
  const extraTop = 16 * u, extraBot = 10 * u, W = w + 6 * u, H = h + extraTop + extraBot, X0 = 3 * u;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d', { willReadFrequently: true });
  if (kinds.includes('flip')) { g.save(); g.translate(X0 + w / 2, extraTop + h / 2); g.rotate(Math.PI); g.drawImage(v.img, -w / 2, -h / 2); g.restore(); }
  else g.drawImage(v.img, X0, extraTop);
  // Tintenbereich des Hauptteils bestimmen
  const id = g.getImageData(0, 0, W, H), a = new Float32Array(W * H); for (let i = 0; i < a.length; i++) a[i] = id.data[i * 4 + 3] / 255;
  const m = new Uint8Array(W * H); for (let i = 0; i < m.length; i++) m[i] = a[i] > .5 ? 1 : 0;
  const { lab, comps } = components(m, W, H); let main = comps[0]; for (const k of comps) if (k.area > main.area) main = k;
  if (kinds.includes('dotless')) {   // Punkt des i wegnehmen
    for (let i = 0; i < m.length; i++) if (m[i] && lab[i] !== main.id) id.data[i * 4 + 3] = 0; g.putImageData(id, 0, 0);
  }
  const top = main.y0, bot = main.y1, cx = (main.x0 + main.x1) / 2 + (rng() - .5) * u, mid = (top + bot) / 2, gap = 3.2;
  g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineWidth = PEN * u; g.lineCap = 'round'; g.lineJoin = 'round';
  const P = (x, y) => [cx + x * u, top + y * u], j = () => (rng() - .5);
  const line = (pts) => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); };
  const dot = (p, r = 1.9) => { g.beginPath(); g.arc(p[0], p[1], r * PF * u, 0, 6.3); g.fill(); };
  for (const kd of kinds) {
    if (kd === 'acute') line([P(-2.5 + j(), -gap - .5 + j()), P(2.8 + j(), -gap - 6.5 + j())]);
    else if (kd === 'grave') line([P(-2.8 + j(), -gap - 6.5 + j()), P(2.5 + j(), -gap - .5 + j())]);
    else if (kd === 'circ') line([P(-3.8 + j(), -gap - .8), P(j(), -gap - 6.2 + j()), P(3.8 + j(), -gap - .8 + j())]);
    else if (kd === 'caron') line([P(-3.8 + j(), -gap - 6.2), P(j(), -gap - .8 + j()), P(3.8 + j(), -gap - 6.2 + j())]);
    else if (kd === 'diaer') { dot(P(-3.2 + j(), -gap - 2.2 + j())); dot(P(3.2 + j(), -gap - 2.2 + j())); }
    else if (kd === 'dot') dot(P(j(), -gap - 2.2 + j()));
    else if (kd === 'tilde') { g.beginPath(); const p0 = P(-4.2, -gap - 3), p1 = P(-1.2, -gap - 6.6 + j()), p2 = P(1.6, -gap - 1.8), p3 = P(4.4, -gap - 5.2 + j()); g.moveTo(...p0); g.bezierCurveTo(p1[0], p1[1], p1[0] + 1 * u, p1[1] + 1 * u, (p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2); g.bezierCurveTo(p2[0], p2[1], p3[0] - 1 * u, p3[1], p3[0], p3[1]); g.stroke(); }
    else if (kd === 'ring') { g.beginPath(); g.arc(...P(0, -gap - 3.4), 2.6 * u, 0, 6.3); g.stroke(); }
    else if (kd === 'macron') line([P(-3.6, -gap - 2), P(3.6 + j(), -gap - 2.4)]);
    else if (kd === 'breve') { g.beginPath(); g.moveTo(...P(-3.6, -gap - 4.6)); g.quadraticCurveTo(...P(0, -gap + .4), ...P(3.6, -gap - 4.6)); g.stroke(); }
    else if (kd === 'dacute') { line([P(-4 + j(), -gap - .5), P(-.5 + j(), -gap - 6.5)]); line([P(.5, -gap - .5), P(4 + j(), -gap - 6.5)]); }
    else if (kd === 'cedil') { const x0 = cx, y0 = bot - .5 * u; g.beginPath(); g.moveTo(x0 + 1 * u, y0); g.bezierCurveTo(x0 + 1.6 * u, y0 + 3.5 * u, x0 + 4 * u, y0 + 4 * u, x0 + 3 * u, y0 + 6.5 * u); g.bezierCurveTo(x0 + 2.6 * u, y0 + 8 * u, x0 - .6 * u, y0 + 8.2 * u, x0 - 1.8 * u, y0 + 7.4 * u); g.stroke(); }
    else if (kd === 'ogon') { const x0 = main.x1 - 2 * u, y0 = bot; g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 - 1 * u, y0 + 3 * u, x0 + 1 * u, y0 + 4.5 * u, x0 + 3.4 * u, y0 + 6 * u); g.stroke(); }
    else if (kd === 'flip') { /* unten */ }
    else if (kd === 'slash') line([[main.x1 + 1.5 * u, top - 1 * u], [main.x0 - 1.5 * u, bot + 1 * u]]);
    else if (kd === 'bar') { line([[main.x0 - 1.5 * u, mid + (rng() - .5) * u], [main.x1 + 2.5 * u, mid - 1.5 * u]]) }
  }
  // geglättet wie echte Zeichen: leichte Kantenglättung bleibt vom Canvas
  const nv = { ...v, img: c, iw: v.iw + 6, ih: v.ih + (extraTop + extraBot) / SC, ox: v.ox - 3, oy: v.oy - extraTop / SC, composed: true };
  if (kinds.includes('flip')) { delete nv.en; delete nv.ex; nv.oy = v.oy - extraTop / SC + 5; }
  delete nv.src; return nv;
}

// ---------------- Layout ----------------
function parseInline(para, S) {
  // -> [{c, b, u, s, h, col}]
  const out = []; let b = false, u = false, s = false, h = false, col = null;
  if (!S.markup) { for (const c of para) out.push({ c }); return out; }
  const COL = { rot: '#c62828', blau: '#1d3a9a', gruen: '#1b7a3a', 'grün': '#1b7a3a', schwarz: '#16161c', orange: '#d9730d', lila: '#7b3fa0', gelb: '#c7a600', grau: '#666' };
  const cs = [...para];
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i], n = cs[i + 1];
    if (c === '*' && n === '*') { b = !b; i++; continue; }
    if (c === '_' && n === '_') { u = !u; i++; continue; }
    if (c === '~' && n === '~') { s = !s; i++; continue; }
    if (c === '=' && n === '=') { h = !h; i++; continue; }
    if (c === '[') { const m = /^\[(\/|rot|blau|gruen|grün|schwarz|orange|lila|gelb|grau)\]/.exec(cs.slice(i, i + 9).join('')); if (m) { col = m[1] === '/' ? null : COL[m[1]]; i += m[0].length - 1; continue; } }
    out.push({ c, b, u, s, h, col });
  }
  return out;
}

export function layout(text, S, font) {
  text = prep(text, S);
  const FM = FORMATS[fmtOf(S)], PW = FM.w, PH = FM.h, XH = font.XH;
  const MT = S.mt, MB = S.mb, rul = gnRuler(S, MT), VJ = rul ? .25 : 1;
  const rng = mulberry32(S.seed), k = S.size / XH, lineH = rul ? rul.step : S.size * S.lh, left = rul ? rul.snapX(S.ml) : S.ml, right = PW - S.mr;
  const firstY = () => rul ? rul.snapY(MT + lineH) : MT + lineH;
  const pages = [[]], missing = new Set();
  let y = firstY(), x = left, slope = 0, lastVar = {}, ind = 0;
  let nY = makeNoise(rng), nR = makeNoise(rng), nS = makeNoise(rng);
  let lastHl = null, lastUl = null;
  const newLine = () => {
    y += lineH; x = left + ind + (rng() - .5) * S.jit * S.size * .5;
    slope = (rng() - .5) * 0.012 * S.jit; nY = makeNoise(rng); nR = makeNoise(rng); nS = makeNoise(rng);
    if (y > PH - MB) { pages.push([]); y = firstY(); }
    lastHl = lastUl = null;
  };
  const makeWord = (chars, scl = 1) => {
    const run = []; let w = 0;
    const add = (ch, st) => {
      const r = font.resolve(ch);
      if (!r) { if (!/\s/.test(ch)) missing.add(ch); return; }
      for (let rep = 0; rep < (r.rep || 1); rep++) {
        let idx = Math.floor(rng() * r.pool.length);
        if (r.pool.length > 1 && lastVar[ch] === idx) idx = (idx + 1 + Math.floor(rng() * (r.pool.length - 1))) % r.pool.length;
        lastVar[ch] = idx;
        const v = r.pool[idx], sc = r.s * scl * (S.capsc !== 1 && ch !== ch.toLowerCase() && ch === ch.toUpperCase() && /\p{L}/u.test(ch) ? S.capsc : 1) * (st.b ? 1.03 : 1) * (1 + (rng() - .5) * .06 * S.jit);
        const adv = (v.seg * k * sc * r.sx * S.sp) + S.size * .03 * scl + (rng() - .5) * S.jit * S.size * .08;
        run.push({ ch, v, sc, sx: r.sx, up: r.up || 0, adv, st, dy: (rng() - .5) * S.jit * S.size * .06, rot: (rng() - .5) * S.jit * .04, a: .86 + .14 * rng() }); w += adv;
      }
    };
    for (const o of chars) { if (o.c === 'ß' && (S.sz || !font.g['ß'])) { add('s', o); add('s', o); } else add(o.c, o); }
    return { run, w };
  };
  const place = (run, cx0, sc) => {
    const wordDy = (rng() - .5) * S.size * .14 * S.jit; let cx = cx0, startX = cx0, startE = null, endE = null;
    const flush = () => {
      if (!startE) return;
      const pg = pages[pages.length - 1], st = startE.g.st, ex = endE.x + endE.g.adv * .8 + S.size * .12, sx = startX - S.size * .1, yb = endE.y;
      if (st.h) { if (lastHl && lastHl.pg === pg && Math.abs(lastHl.y - yb) < S.size * .8 && lastHl.col === (st.col || null)) { lastHl.r.x2 = ex; } else { const r = { hl: { x1: sx, x2: ex, y1: yb - S.size * 1.35 * sc, y2: yb + S.size * .6 * sc } }; pg.unshift(r); lastHl = { pg, y: yb, r: r.hl, col: st.col || null }; } }
      if (st.u) { const yy = yb + S.size * .3; if (lastUl && lastUl.pg === pg && Math.abs(lastUl.y - yy) < S.size * .8) { lastUl.e.line.x2 = ex; lastUl.e.line.y2 = yy; } else { const e = { line: { x1: sx, y1: yy, x2: ex, y2: yy, col: st.col } }; pg.push(e); lastUl = { pg, y: yy, e }; } }
      if (st.s) pg.push({ line: { x1: sx, y1: yb - S.size * .45, x2: ex, y2: yb - S.size * .5, col: st.col } });
      startE = null;
    };
    for (const g of run) {
      if (cx + g.adv > right && cx > left + ind + S.size) { flush(); newLine(); cx = x; startX = cx; }
      const m = 1 + nS(cx) * .035 * S.jit;
      const e = { g, m, x: cx, y: y + (slope * (cx - left) + wordDy + nY(cx) * S.size * .09 * S.jit + g.dy) * VJ + g.up * k, rot: nR(cx) * .045 * S.jit + g.rot };
      const pg = pages[pages.length - 1];
      pg.push(e); cx += g.adv;
      if (!startE) startE = e; endE = e;
    }
    flush(); return cx;
  };
  slope = (rng() - .5) * 0.012 * S.jit;
  const paras = text.replace(/\t/g, '    ').split('\n');
  for (const raw of paras) {
    let para = raw, scl = 1, bullet = false, head = 0;
    if (S.markup) {
      let m;
      if ((m = /^(#{1,3}) +(.*)$/.exec(para))) { head = m[1].length; scl = [0, 1.5, 1.28, 1.12][head]; para = m[2]; }
      else if ((m = /^[-*•] +(.*)$/.exec(para))) { bullet = true; para = m[1]; }
    }
    if (para.trim() === '' && !bullet) { ind = 0; newLine(); continue; }
    ind = bullet ? S.size * 1.6 : 0;
    let p = '', prevc = ' ';
    for (const c of para) { p += (c === '"') ? (/[\s(\[]/.test(prevc) ? '„' : '“') : c; prevc = c; }
    const chars = parseInline(p, S).map(o => ({ ...o, b: o.b || head > 0 }));
    let first = true;
    // in Wörter teilen
    const words = []; let cur = [];
    for (const o of chars) { if (o.c === ' ') { if (cur.length) words.push(cur); cur = []; } else cur.push(o); }
    if (cur.length) words.push(cur);
    if (bullet) { const { run, w } = makeWord([{ c: '•' }], 1); if (run.length) { x = left + (rng() - .5) * S.size * .3; place(run, x, 1); x = left + ind; } }
    else x = left + ((first && ind) || 0);
    if (bullet) first = true;
    for (const word of words) {
      const { run, w } = makeWord(word, scl);
      if (!run.length) continue;
      const sp = first ? 0 : S.size * 1.1 * S.wsp * (1 + (rng() - .5) * .3 * S.jit);
      if (!first && x + sp + w > right && w <= right - left - ind) { newLine(); first = true; }
      const start = (first && x <= left + ind + S.size) ? x : x + (first ? 0 : sp);
      x = place(run, start, scl); first = false;
    }
    newLine();
  }
  // Kopf- und Fußzeile
  const live = pages.filter((p, i) => p.length || i === 0), total = live.length;
  const stat = (str, align, yy, seed, scl = .8) => {
    const r2 = mulberry32(seed);
    const parts = str.normalize('NFC').split(' '), runs = parts.map(wd => makeWord([...wd].map(c => ({ c })), scl)), gap = S.size * 1.0 * scl;
    const w = runs.reduce((a, r) => a + r.w, 0) + gap * Math.max(0, runs.length - 1);
    let sx = align === 'c' ? (PW - w) / 2 : align === 'r' ? right - w : left; const out = [];
    for (const r of runs) { for (const g of r.run) { out.push({ g, m: 1, x: sx, y: yy + (r2() - .5) * 2, rot: (r2() - .5) * .02 }); sx += g.adv; } sx += gap; }
    return out;
  };
  live.forEach((pg, i) => {
    if (S.header && S.header.trim()) pg.push(...stat(prep(S.header.replace(/\{n\}/g, i + 1).replace(/\{datum\}/g, new Date().toLocaleDateString('de-DE')), S), 'l', Math.max(60, MT - lineH * .25), 100 + i));
    if (S.pageNum) pg.push(...stat((S.pageNumFmt || '{n}').replace(/\{n\}/g, i + 1).replace(/\{gesamt\}/g, total), 'c', PH - Math.max(40, MB * .45), 200 + i));
  });
  return { pages: live, lineH, k, missing: [...missing], PW, PH };
}

// ---------------- Zeichnen ----------------
let noiseTile = null;
function getNoise() {
  if (noiseTile) return noiseTile;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const cx = c.getContext('2d'), id = cx.createImageData(256, 256), r = mulberry32(99);
  for (let i = 0; i < id.data.length; i += 4) { const v = 120 + r() * 120 | 0; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 14; }
  cx.putImageData(id, 0, 0); noiseTile = c; return c;
}
export function drawPaper(ctx, S, lineH, PW, PH) {
  const dark = S.paperColor === 'dunkel';
  ctx.fillStyle = PAPER_COLORS[S.paperColor] || '#fff'; ctx.fillRect(0, 0, PW, PH);
  if (S.scan && !dark) {
    ctx.fillStyle = ctx.createPattern(getNoise(), 'repeat'); ctx.fillRect(0, 0, PW, PH);
    const g = ctx.createRadialGradient(PW / 2, PH / 2, PH * .35, PW / 2, PH / 2, PH * .78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,70,30,.09)'); ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
  }
  const line = dark ? 'rgba(200,210,230,.22)' : 'rgba(120,150,190,.45)';
  ctx.strokeStyle = line; ctx.lineWidth = 1.6;
  const y0 = S.mt + lineH + 3;
  if (GNPAPER[S.paper]) {
    const gp = GNPAPER[S.paper]; ctx.fillStyle = 'rgb(208,210,211)'; const t = .5 * PXPT;
    for (let y = gp.h0 * PXPT; y < PH + 2; y += gp.hp * PXPT) ctx.fillRect(0, y - t / 2, PW, t);
    if (gp.vp) for (let x = gp.v0 * PXPT; x < PW + 2; x += gp.vp * PXPT) ctx.fillRect(x - t / 2, 0, t, PH);
  } else if (S.paper === 'lined' || S.paper === 'legal' || S.paper === 'college') {
    const st = S.paper === 'college' ? lineH * .72 : lineH; ctx.beginPath();
    const ys = S.paper === 'college' ? y0 - Math.floor(y0 / st) * st : y0;
    for (let y = ys; y < PH; y += st) { if (y > S.mt * .5) { ctx.moveTo(0, y); ctx.lineTo(PW, y); } }
    ctx.stroke();
    if (S.margin !== false) { ctx.strokeStyle = 'rgba(220,90,90,.45)'; ctx.beginPath(); ctx.moveTo(S.ml - 34, 0); ctx.lineTo(S.ml - 34, PH); ctx.stroke(); }
  } else if (S.paper === 'grid') {
    const st = lineH / 2; ctx.lineWidth = 1.2; ctx.beginPath();
    for (let y = y0 - Math.floor(y0 / st) * st; y < PH; y += st) { ctx.moveTo(0, y); ctx.lineTo(PW, y); }
    for (let x = S.ml - Math.floor(S.ml / st) * st; x < PW; x += st) { ctx.moveTo(x, 0); ctx.lineTo(x, PH); }
    ctx.stroke();
  } else if (S.paper === 'dots') {
    const st = lineH / 2; ctx.fillStyle = dark ? 'rgba(200,210,230,.4)' : 'rgba(110,130,165,.55)';
    for (let y = y0 - Math.floor(y0 / st) * st; y < PH; y += st) for (let x = S.ml - Math.floor(S.ml / st) * st; x < PW; x += st) { ctx.beginPath(); ctx.arc(x, y, 1.9, 0, 6.3); ctx.fill(); }
  }
}
const layers = { ink: null, one: null };
const cv = (key, W, H) => { const c = layers[key] ||= document.createElement('canvas'); if (c.width !== W) c.width = W; if (c.height !== H) c.height = H; return c; };

export async function ensureImages(pagesEntries) {
  const jobs = [];
  for (const e of pagesEntries) { const v = e.g && e.g.v; if (v && v.img && !v.img.complete && v.img.decode) jobs.push(v.img.decode().catch(() => {})); }
  await Promise.all(jobs);
}
export function drawPage(canvas, entries, L, S, scale, transparent) {
  const PW = L.PW, PH = L.PH, k = L.k, lineH = L.lineH, W = Math.round(PW * scale), H = Math.round(PH * scale);
  if (canvas.width !== W) canvas.width = W; if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
  const fin = cv('ink', W, H), fc = fin.getContext('2d'); fc.setTransform(1, 0, 0, 1, 0, 0); fc.clearRect(0, 0, W, H);
  const lay = cv('one', W, H), ic = lay.getContext('2d');
  const tan = Math.tan(S.slant * Math.PI / 180), wgt = S.weight * .55;
  const groups = new Map();
  for (const e of entries) { if (e.hl) continue; const col = (e.g ? e.g.st.col : e.line ? e.line.col : null) || S.ink; (groups.get(col) || groups.set(col, []).get(col)).push(e); }
  for (const [col, list] of groups) {
    ic.setTransform(1, 0, 0, 1, 0, 0); ic.globalCompositeOperation = 'source-over'; ic.clearRect(0, 0, W, H);
    ic.setTransform(scale, 0, 0, scale, 0, 0); ic.imageSmoothingEnabled = true; ic.imageSmoothingQuality = 'high'; ic.lineCap = 'round'; ic.lineJoin = 'round';
    for (const e of list) {
      if (e.line) {
        const { x1, y1, x2, y2 } = e.line; ic.save(); ic.globalAlpha = .9; ic.strokeStyle = '#000'; ic.lineWidth = k * 2.1 + wgt;
        ic.beginPath(); ic.moveTo(x1, y1); ic.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + 1.6, x2, y2); ic.stroke(); ic.restore(); continue;
      }
      const { g } = e, v = g.v, im = v.img; if (!im || (im.complete === false)) continue;
      ic.save(); ic.translate(e.x, e.y); ic.rotate(e.rot); ic.transform(1, 0, -tan, 1, 0, 0); ic.globalAlpha = g.a;
      const s = k * g.sc * e.m, bw = wgt + (g.st.b ? .9 : 0);
      ic.drawImage(im, v.ox * s * g.sx, v.oy * s, v.iw * s * g.sx, v.ih * s);
      if (bw > .02) { ic.drawImage(im, v.ox * s * g.sx + bw, v.oy * s, v.iw * s * g.sx, v.ih * s); ic.drawImage(im, v.ox * s * g.sx, v.oy * s + bw * .6, v.iw * s * g.sx, v.ih * s); }
      ic.restore();
    }
    ic.setTransform(1, 0, 0, 1, 0, 0); ic.globalAlpha = 1; ic.globalCompositeOperation = 'source-in'; ic.fillStyle = col; ic.fillRect(0, 0, W, H);
    ic.globalCompositeOperation = 'source-over'; fc.drawImage(lay, 0, 0);
  }
  if (transparent) { ctx.globalAlpha = S.inkAlpha; ctx.drawImage(fin, 0, 0); ctx.globalAlpha = 1; return; }
  ctx.setTransform(scale, 0, 0, scale, 0, 0); drawPaper(ctx, S, lineH, PW, PH);
  for (const e of entries) if (e.hl) { ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = 'rgba(255,226,70,.55)'; const h = e.hl; ctx.fillRect(h.x1, h.y1, h.x2 - h.x1, h.y2 - h.y1); }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = S.paperColor === 'dunkel' ? 'source-over' : 'multiply'; ctx.globalAlpha = S.inkAlpha;
  if (S.paperColor === 'dunkel') { ctx.drawImage(fin, 0, 0); } else ctx.drawImage(fin, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
export { bboxOf };

// kleine Vorschau einer Schrift (für die Schriften-Liste)
export async function samplePreview(font, text = 'Das ist meine Schrift 123') {
  const S = { ...DEF, fmt: 'a5q', paper: 'blank', scan: false, paperColor: 'creme', ml: 22, mr: 20, mt: 6, mb: 4, size: 33, lh: 2.0, jit: .5, seed: 3 };
  await font.prepare(text); const L = layout(text, S, font); await ensureImages(L.pages[0]);
  const c = document.createElement('canvas'); drawPage(c, L.pages[0], L, S, 1, false);
  const o = document.createElement('canvas'); o.width = 520; o.height = 150; const g = o.getContext('2d'); g.fillStyle = PAPER_COLORS.creme; g.fillRect(0, 0, 520, 150);
  g.drawImage(c, 0, 0, 520, 150, 0, 0, 520, 150); return o;
}
