// Formel-Motor: einfache Tastatur-Schreibweise (x^2, (a+b)/2, sqrt(x), pi ...) -> Syntaxbaum -> Boxen (Handschrift + perfekte Striche) bzw. Zahlenwert.
// Keine DOM-Abhängigkeit: Text kommt über ctx.run(), perfekte Striche sind {path:{pts,w}} Einträge.

const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', inf: '∞', infty: '∞', unendlich: '∞', deg: '°', grad: '°', degree: '°', pm: '±', cdot: '·', times: '×' };
const FUNCS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'lg', 'exp', 'lim', 'min', 'max', 'sgn', 'det', 'ggT', 'kgV']);
const SPECIAL_CALLS = new Set(['sqrt', 'wurzel', 'abs', 'betrag', 'root', 'frac', 'bruch', 'cbrt', 'vec', 'vektor', 'mat', 'matrix', 'cases', 'fall']);
const LIMFN = new Set(['lim', 'max', 'min']);
const BIGOPS = new Set(['int', 'iint', 'iiint', 'oint', 'sum', 'prod']);
const SUPD = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', 'ⁿ': 'n' };
const SUBD = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-' };
const REL = new Set(['=', '≠', '<', '>', '≤', '≥', '≈', '→', '⇒', '⇔', '←', '↔', '∈', '∉', '⊂', '⊆', '≡', '≅', '∼', '∝', '∥', '⊥', '⇌']);
const BINOPS = new Set(['+', '-', '±', '∓']);

export class MathError extends Error {}
// Gleichungskette an Vergleichszeichen zerlegen: a = b = c -> { first: a, parts: [{op:'=', e:b}, {op:'=', e:c}] }
export function splitRel(ast) { const parts = []; let n = ast; while (n.t === 'bin' && n.rel) { parts.unshift({ op: n.op, e: n.r }); n = n.l; } return { first: n, parts }; }

// ---------- Tokenizer ----------
function tokenize(src, opt) {
  let s = src.normalize('NFC');
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿ]+/g, (m) => '^(' + [...m].map(c => SUPD[c]).join('') + ')').replace(/[₀₁₂₃₄₅₆₇₈₉₊₋]+/g, (m) => '_(' + [...m].map(c => SUBD[c]).join('') + ')');
  s = s.replace(/\\([A-Za-z]+)/g, (m, n) => GREEK[n] ? n : m.slice(1));   // \alpha -> alpha (LaTeX-Namen werden nachsichtig akzeptiert)
  const toks = []; let i = 0;
  const MULTI = [['<=>', '⇔'], ['<->', '↔'], ['=>', '⇒'], ['->', '→'], ['<-', '←'], ['<=', '≤'], ['>=', '≥'], ['!=', '≠'], ['==', '='], ['+-', '±'], ['-+', '∓'], ['~=', '≈'], ['<>', '≠']];
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { let j = i; while (j < s.length && /\s/.test(s[j])) j++; toks.push({ t: 'sp' }); i = j; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || '') && !/[0-9]/.test(s[i - 1] || ''))) {
      let j = i; while (j < s.length && /[0-9]/.test(s[j])) j++;
      if ((s[j] === '.' || s[j] === ',') && /[0-9]/.test(s[j + 1] || '')) { j++; while (j < s.length && /[0-9]/.test(s[j])) j++; }
      toks.push({ t: 'num', v: s.slice(i, j).replace(',', '.') }); i = j; continue;
    }
    if (/[A-Za-zÄÖÜäöüß]/.test(c)) { let j = i; while (j < s.length && /[A-Za-zÄÖÜäöüß]/.test(s[j])) j++; toks.push({ t: 'id', v: s.slice(i, j) }); i = j; continue; }
    if (c === '"') { const j = s.indexOf('"', i + 1); if (j < 0) { toks.push({ t: 'str', v: s.slice(i + 1) }); i = s.length; } else { toks.push({ t: 'str', v: s.slice(i + 1, j) }); i = j + 1; } continue; }
    let hit = null; for (const [a, b] of MULTI) if (s.startsWith(a, i)) { hit = [a, b]; break; }
    if (hit) { toks.push({ t: 'op', v: hit[1] }); i += hit[0].length; continue; }
    if ('+-*/^_=<>:;,!%°\'′″'.includes(c)) { toks.push({ t: 'op', v: c === '-' ? '-' : c }); i++; continue; }
    if ('([{)]}'.includes(c)) { toks.push({ t: 'br', v: c }); i++; continue; }
    if (c === '√') { toks.push({ t: 'rt' }); i++; continue; }
    if (c === '∫' || c === '∑' || c === '∏' || c === '∮') { toks.push({ t: 'id', v: { '∫': 'int', '∑': 'sum', '∏': 'prod', '∮': 'oint' }[c] }); i++; continue; }
    if (c === '·' || c === '×' || c === '⋅' || c === '∙') { toks.push({ t: 'op', v: '*', shown: c === '×' ? '×' : '·' }); i++; continue; }
    if (c === '÷') { toks.push({ t: 'op', v: ':' }); i++; continue; }
    if (c === '−' || c === '–') { toks.push({ t: 'op', v: '-' }); i++; continue; }
    if (REL.has(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    toks.push({ t: 'chr', v: c }); i++;
  }
  // Leerzeichen: nur als Merker "nach Leerzeichen" an Folgetoken, sonst entfernen
  const out = []; let sp = false;
  for (const t of toks) { if (t.t === 'sp') { sp = true; continue; } if (sp) t.sp = true; out.push(t); sp = false; }
  return out;
}

// ---------- Parser ----------
export function parseMath(src, opt = {}) {
  const T = tokenize(src, opt); let p = 0, sawInt = false;
  const peek = (o = 0) => T[p + o], eat = () => T[p++];
  const isOp = (t, v) => t && t.t === 'op' && (v == null || (Array.isArray(v) ? v.includes(t.v) : v instanceof Set ? v.has(t.v) : t.v === v));
  const fail = (m) => { throw new MathError(m); };
  const startsAtom = (t) => t && (t.t === 'num' || t.t === 'id' || t.t === 'str' || t.t === 'rt' || (t.t === 'br' && '([{'.includes(t.v)) || (t.t === 'chr' && t.v !== '|'));

  function parseRel() {
    let l = parseAdd();
    while (peek() && peek().t === 'op' && (REL.has(peek().v) || peek().v === ':' && false)) { const op = eat().v; const r = parseAdd(); l = { t: 'bin', op, l, r, rel: true }; }
    return l;
  }
  function parseAdd() {
    let l;
    if (isOp(peek(), BINOPS)) { const op = eat().v; l = { t: 'un', op, e: parseTerm() }; } else l = parseTerm();
    while (isOp(peek(), BINOPS)) { const op = eat().v; const r = parseTerm(); l = { t: 'bin', op, l, r }; }
    return l;
  }
  function parseTerm() {
    let items = [parseFactor()], explicit = [];
    for (;;) {
      const t = peek();
      if (isOp(t, '*')) { eat(); explicit.push(items.length); items.push(parseSignedFactor()); }
      else if (isOp(t, ':') && peek(1) && startsAtom(peek(1)) && !peek(1).sp) { eat(); items.push({ t: 'opmark', v: ':' }); items.push(parseSignedFactor()); }
      else if (isOp(t, '/')) {
        eat(); const den = parseSignedFactor();
        let hd = -1; items.forEach((q, j) => { if (isHead(q)) hd = j; });
        if (hd >= 0 && hd < items.length - 1) { const tail = items.slice(hd + 1), te = explicit.filter(e => e > hd + 1).map(e => e - hd - 1); items = [...items.slice(0, hd + 1), { t: 'frac', n: fold(tail, te), d: den }]; explicit = explicit.filter(e => e <= hd); }
        else { const num = fold(items, explicit); items = [{ t: 'frac', n: num, d: den }]; explicit = []; }
      } else if (startsAtom(t)) items.push(parseFactor());
      else break;
    }
    return fold(items, explicit);
  }
  const isHead = (q) => q.t === 'bigop' || ((q.t === 'sub' || q.t === 'sup' || q.t === 'subsup') && (q.base.t === 'bigop' || (q.base.t === 'fn' && LIMFN.has(q.base.v))));
  function fold(items, explicit) {
    if (items.length === 1) return items[0];
    return { t: 'mul', items, explicit };
  }
  function parseSignedFactor() { if (isOp(peek(), BINOPS)) { const op = eat().v; return { t: 'un', op, e: parseSignedFactor() }; } return parseFactor(); }
  function parseFactor() {
    let b = parsePostfix();
    while (isOp(peek(), ['^', '_'])) {
      const k = eat().v, ex = scriptOperand();
      if (k === '^') b = b.t === 'sub' ? { t: 'subsup', base: b.base, sub: b.sub, sup: ex } : { t: 'sup', base: b, exp: ex };
      else b = b.t === 'sup' ? { t: 'subsup', base: b.base, sub: ex, sup: b.exp } : { t: 'sub', base: b, sub: ex };
    }
    return b;
  }
  function scriptOperand() {
    const t = peek(); if (!t) fail('Exponent/Index fehlt');
    if (t.t === 'br' && (t.v === '(' || t.v === '{')) { eat(); const e = parseList(); const c = eat(); if (!c || c.t !== 'br') fail('Klammer nicht geschlossen'); return e; }
    if (isOp(t, BINOPS)) { eat(); return { t: 'un', op: t.v, e: scriptAtom() }; }
    return scriptAtom();
  }
  function scriptAtom() { const a = parseAtom(true); return a; }
  function parsePostfix() {
    let a = parseAtom(false);
    while (peek() && peek().t === 'op' && ['!', '%', '°', "'", '′', '″'].includes(peek().v) && !peek().sp) a = { t: 'post', v: eat().v, e: a };
    return a;
  }
  function parseList() {
    const e = parseRel();
    const isSep = (t) => t && ((t.t === 'op' && (t.v === ',' || t.v === ';')) || (t.t === 'chr' && t.v === '|'));
    if (isSep(peek())) { const items = [e]; while (isSep(peek())) { const sep = eat().v; items.push({ t: 'sep', v: sep }); items.push(parseRel()); } return { t: 'list', items }; }
    return e;
  }
  function parseAtom(tight) {
    const t = eat(); if (!t) fail('Ausdruck endet unerwartet');
    if (t.t === 'num') return { t: 'num', v: t.v };
    if (t.t === 'str') return { t: 'str', v: t.v };
    if (t.t === 'rt') { const x = parseAtom(true); return { t: 'sqrt', x }; }
    if (t.t === 'br') {
      if (')]}'.includes(t.v)) fail('Unerwartete schließende Klammer „' + t.v + '“');
      const close = { '(': ')', '[': ']', '{': '}' }[t.v]; const e = parseList(); const c = eat();
      if (!c || c.t !== 'br' || c.v !== close) fail('Klammer „' + t.v + '“ wird nicht geschlossen');
      return { t: 'paren', e, o: t.v, c: close };
    }
    if (t.t === 'chr') return { t: 'chr', v: t.v };
    if (t.t === 'op') {
      if (['!', '%', '°'].includes(t.v)) return { t: 'chr', v: t.v };
      fail('Unerwartetes Zeichen „' + t.v + '“');
    }
    if (t.t === 'id') {
      const w = t.v;
      if (BIGOPS.has(w)) { if (w.endsWith('int')) sawInt = true; return { t: 'bigop', v: w }; }
      if (sawInt && /^d[xyztsuvrφ]$/.test(w)) return { t: 'diff', v: w[1] };
      if (SPECIAL_CALLS.has(w) || FUNCS.has(w)) {
        const nx = peek();
        if (nx && nx.t === 'br' && nx.v === '(' && !nx.sp) {
          eat(); const args = []; const inner = parseList(); const c = eat(); if (!c || c.v !== ')') fail('Klammer bei ' + w + ' wird nicht geschlossen');
          const flat = inner.t === 'list' ? inner.items.filter(q => q.t !== 'sep') : [inner];
          if (w === 'vec' || w === 'vektor' || w === 'mat' || w === 'matrix' || w === 'cases' || w === 'fall') {
            const raw = inner.t === 'list' ? inner.items : [inner], rows = [[]];
            for (const q of raw) { if (q.t === 'sep') { if (q.v === ';' || w === 'vec' || w === 'vektor') rows.push([]); continue; } rows[rows.length - 1].push(q); }
            return { t: 'matrix', rows: rows.filter(r => r.length), kind: (w === 'cases' || w === 'fall') ? 'cases' : (w[0] === 'v' ? 'vec' : 'mat') };
          }
          if (w === 'sqrt' || w === 'wurzel') return { t: 'sqrt', x: flat[0] };
          if (w === 'cbrt') return { t: 'sqrt', x: flat[0], idx: { t: 'num', v: '3' } };
          if (w === 'root') return { t: 'sqrt', x: flat[0], idx: flat[1] };
          if (w === 'abs' || w === 'betrag') return { t: 'abs', e: flat[0] };
          if (w === 'frac' || w === 'bruch') return { t: 'frac', n: flat[0], d: flat[1] };
          return { t: 'call', name: w, args: flat, inner };
        }
        if (SPECIAL_CALLS.has(w)) { if (w === 'sqrt' || w === 'wurzel') { const x = parseAtom(true); return { t: 'sqrt', x }; } fail(w + ' braucht Klammern'); }
        // sin^2(x)
        if (isOp(nx, '^') && !tight) { eat(); const ex = scriptOperand(); const q = peek(); if (q && q.t === 'br' && q.v === '(') { eat(); const inner = parseList(); const c = eat(); if (!c || c.v !== ')') fail('Klammer nicht geschlossen'); return { t: 'fnpow', name: w, exp: ex, arg: inner }; } return { t: 'sup', base: { t: 'fn', v: w }, exp: ex }; }
        return { t: 'fn', v: w };
      }
      if (GREEK[w]) return { t: 'sym', v: GREEK[w], name: w };
      if (w.length === 1) return { t: 'var', v: w };
      // zusammengesetzte Namen: bekannte Griechen am Anfang/Ende? sonst Wort
      return { t: 'word', v: w };
    }
    fail('Unerwartetes Zeichen');
  }
  const e = parseList();
  if (p < T.length) fail('Unerwartet: „' + (T[p].v || '?') + '“');
  return e;
}

// ---------- Zahlenwert ----------
const CONST = { pi: Math.PI, e: Math.E, π: Math.PI, '∞': Infinity };
const F = { sin: Math.sin, cos: Math.cos, tan: Math.tan, cot: (x) => 1 / Math.tan(x), sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  ln: Math.log, log: Math.log10, lg: Math.log10, exp: Math.exp, min: Math.min, max: Math.max, sgn: Math.sign };
export function compile(ast, vars = ['x']) {
  const ev = (n, env) => {
    switch (n.t) {
      case 'num': return parseFloat(n.v);
      case 'var': return n.v in env ? env[n.v] : n.v in CONST ? CONST[n.v] : (() => { throw new MathError('Unbekannte Variable „' + n.v + '“'); })();
      case 'sym': return n.name === 'pi' ? Math.PI : n.v === '∞' ? Infinity : (() => { throw new MathError('Unbekanntes Symbol „' + n.v + '“'); })();
      case 'word': { let r = 1; for (const c of n.v) { if (c in env) r *= env[c]; else if (c in CONST) r *= CONST[c]; else throw new MathError('Unbekannte Variable „' + c + '“'); } return r; }
      case 'paren': return ev(n.e, env);
      case 'un': { const v = ev(n.e, env); return n.op === '-' ? -v : v; }
      case 'bin': { const a = ev(n.l, env), b = ev(n.r, env); if (n.op === '+') return a + b; if (n.op === '-') return a - b; if (n.rel) throw new MathError('Vergleich ist keine Funktion'); return a; }
      case 'mul': { let r = 1; for (let i = 0; i < n.items.length; i++) { const it = n.items[i]; if (it.t === 'opmark') { r = r / ev(n.items[++i], env); continue; } r *= ev(it, env); } return r; }
      case 'frac': return ev(n.n, env) / ev(n.d, env);
      case 'sup': return Math.pow(ev(n.base, env), ev(n.exp, env));
      case 'sub': throw new MathError('Index nicht auswertbar');
      case 'sqrt': { const x = ev(n.x, env); if (n.idx) { const k = ev(n.idx, env); return x < 0 && k % 2 === 1 ? -Math.pow(-x, 1 / k) : Math.pow(x, 1 / k); } return Math.sqrt(x); }
      case 'abs': return Math.abs(ev(n.e, env));
    case 'call': { const f = F[n.name]; if (!f) throw new MathError('Funktion „' + n.name + '“ nicht auswertbar'); return f(...n.args.map(a => ev(a, env))); }
      case 'fnpow': return Math.pow(F[n.name](ev(n.arg, env)), ev(n.exp, env));
      case 'post': { const v = ev(n.e, env); if (n.v === '!') { let r = 1; for (let i = 2; i <= v; i++) r *= i; return r; } if (n.v === '%') return v / 100; throw new MathError('Nicht auswertbar'); }
      case 'fn': throw new MathError('Funktion „' + n.v + '“ ohne Argument');
      default: throw new MathError('Nicht auswertbar');
    }
  };
  return (...xs) => { const env = {}; vars.forEach((v, i) => env[v] = xs[i]); return ev(ast, env); };
}

// ---------- Layout: Syntaxbaum -> Box ----------
// ctx: { u (x-Höhe in Layout-Einheiten), run(str, sc) -> { run:[g...], w }, has(ch), komma (bool), mal: 'auto'|'punkt'|'kreuz'|'weg', col }
// Box: { w, asc, desc, items }  (items relativ zur Grundlinie: y > 0 = nach unten)
const circle = (cx, cy, rx, ry, n = 28) => Array.from({ length: n + 1 }, (_, i) => [cx + rx * Math.cos(i / n * 6.2832), cy + ry * Math.sin(i / n * 6.2832)]);
const mk = (w, asc, desc, items = []) => ({ w, asc, desc, items });
const shift = (b, dx, dy) => b.items.map(it => it.path ? { path: { ...it.path, pts: it.path.pts.map(([x, y]) => [x + dx, y + dy]) } } : { ...it, x: it.x + dx, y: it.y + dy });
const ASC_RE = /[A-Z0-9bdfhijklt!?()\[\]\/|ßÄÖÜ%&@#$°]/, DESC_RE = /[gjpqyQ(),;\[\]\/|{}ç]/;

export function layoutMath(ast, ctx, sc = 1, depth = 0) {
  const u = ctx.u, U = u * sc, line = ctx.line || 1;
  const path = (pts, w = line, extra) => ({ path: { pts, w, col: ctx.col, ...extra } });
  const text = (str, s2 = sc) => {
    if (!str) return mk(0, 0, 0);
    const r = ctx.run(str, s2), items = []; let x = 0;
    for (const g of r.run) { items.push({ g, m: 1, x, y: g.up ? g.up * ctx.k : 0, rot: g.rot }); x += g.adv; }
    let asc = 0, desc = 0; for (const c of str) { asc = Math.max(asc, ASC_RE.test(c) ? 1.85 : /[a-zäöüx]/.test(c) ? 1 : .6); desc = Math.max(desc, DESC_RE.test(c) ? .75 : 0); }
    return mk(x, asc * u * s2, desc * u * s2, items);
  };
  const hcat = (parts) => { const items = []; let x = 0, asc = 0, desc = 0; for (const p of parts) { if (p.gap) { x += p.gap; continue; } items.push(...shift(p, x, 0)); x += p.w; asc = Math.max(asc, p.asc); desc = Math.max(desc, p.desc); } return mk(x, asc, desc, items); };
  const gapOf = (g) => ({ gap: g * U });
  const sub = (n, s2 = sc, d = depth) => layoutMath(n, ctx, s2, d);
  const numStr = (v) => ctx.komma ? v.replace('.', ',') : v;
  const axisY = -.55 * U;

  switch (ast.t) {
    case 'num': return text(numStr(ast.v));
    case 'var': case 'word': case 'sym': case 'chr': case 'fn': return text(ast.v);
    case 'str': return text(ast.v);
    case 'rest': { const parts = []; for (const q of ast.parts) parts.push(gapOf(.5), opBox(q.op, ctx, U, text, path), gapOf(.5), sub(q.e)); return hcat(parts); }
    case 'sep': return ast.v === '|' ? text('|') : hcat([text(ast.v), gapOf(.3)]);
    case 'opmark': return hcat([gapOf(.3), text(':'), gapOf(.3)]);
    case 'list': return hcat(ast.items.map(it => sub(it)));
    case 'un': { const o = text(ast.op === '-' ? '−' : ast.op), e = sub(ast.e); return hcat([o, gapOf(.04), e]); }
    case 'post': return hcat([sub(ast.e), text(ast.v === "'" ? '′' : ast.v)]);
    case 'bin': {
      const l = sub(ast.l), r = sub(ast.r), o = opBox(ast.op, ctx, U, text, path);
      return hcat([l, gapOf(ast.rel ? .5 : .38), o, gapOf(ast.rel ? .5 : .38), r]);
    }
    case 'mul': {
      const parts = []; const its = ast.items;
      for (let i = 0; i < its.length; i++) {
        const it = its[i];
        if (it.t === 'opmark') { parts.push(gapOf(.3), text(':'), gapOf(.3)); continue; }
        if (i > 0 && its[i - 1].t !== 'opmark') {
          const ex = ast.explicit.includes(i), prev = its[i - 1];
          if (ex) {
            const mode = ctx.mal || 'auto', hide = mode === 'weg' || (mode === 'auto' && !startsNum(it) && !(endsNum(prev) && false));
            if (!hide) parts.push(gapOf(.22), opBox('*', ctx, U, text, path, mode === 'kreuz'), gapOf(.22));
            else if (startsNum(it)) parts.push(gapOf(.22));
          } else if (it.t === 'word' || prev.t === 'word' || it.t === 'str' || prev.t === 'str') parts.push(gapOf(.55));
          else if (startsNum(it) && endsNum(prev)) parts.push(gapOf(.3));
          else parts.push(gapOf(.04));
        }
        parts.push(sub(it));
      }
      return hcat(parts);
    }
    case 'paren': return parens(ast.o, ast.c, sub(ast.e), U, ctx, text, path, sc);
    case 'abs': {
      const ib = sub(ast.e), top = -(ib.asc + .1 * U), bot = ib.desc + .1 * U, g = .3 * U, W = g * 2 + ib.w;
      const gl = gstretch(ctx, '|', top, bot, .5 * U);
      if (gl) { const W2 = gl.w * 2 + ib.w + .24 * U; return mk(W2, -top, bot, [...gl.items, ...shift(ib, gl.w + .12 * U, 0), ...shift(gl, gl.w + ib.w + .24 * U, 0)]); }
      return mk(W, -top, bot, [path([[.1 * U, top], [.1 * U, bot]]), ...shift(ib, g, 0), path([[W - .1 * U, top], [W - .1 * U, bot]])]);
    }
    case 'call': {
      const name = text(ast.name), inner = ast.inner;
      return hcat([name, gapOf(.12), parens('(', ')', sub(inner), U, ctx, text, path, sc)]);
    }
    case 'fnpow': { const name = text(ast.name), ex = sub(ast.exp, sc * .52, depth + 1); const b = supBox(name, ex, U, 0); return hcat([b, gapOf(.12), parens('(', ')', sub(ast.arg), U, ctx, text, path, sc)]); }
    case 'sup': { if (ast.base.t === 'bigop') return bigBox(ast.base, null, ast.exp); const base = sub(ast.base), ex = sub(ast.exp, sc * (depth > 1 ? .45 : .52), depth + 1); return supBox(base, ex, U, 0); }
    case 'sub': { if (ast.base.t === 'bigop') return bigBox(ast.base, ast.sub, null); if (ast.base.t === 'fn' && LIMFN.has(ast.base.v)) return limBox(ast.base, ast.sub); const base = sub(ast.base), s = sub(ast.sub, sc * .52, depth + 1); return subBox(base, s, U); }
    case 'subsup': {
      if (ast.base.t === 'bigop') return bigBox(ast.base, ast.sub, ast.sup);
      const base = sub(ast.base), s1 = sub(ast.sub, sc * .52, depth + 1), ex = sub(ast.sup, sc * .52, depth + 1), rise = supRise(base, ex, U), d = sbShift(U), x0 = base.w + .05 * U;
      return mk(x0 + Math.max(s1.w, ex.w), Math.max(base.asc, rise + ex.asc), Math.max(base.desc, d + s1.desc), [...shift(base, 0, 0), ...shift(s1, x0, d), ...shift(ex, x0, -rise)]);
    }
    case 'frac': {
      const s2 = ctx.inl && depth === 0 ? sc * .66 : depth > 0 ? sc * .86 : sc;
      const unw = (n) => n.t === 'paren' && n.o === '(' ? n.e : n;
      const nb = layoutMath(unw(ast.n), ctx, s2, depth + 1), db = layoutMath(unw(ast.d), ctx, s2, depth + 1), pad = .3 * U, W = Math.max(nb.w, db.w) + 2 * pad, gap = .3 * U, barY = axisY;
      const nBase = barY - gap - nb.desc, dBase = barY + gap + db.asc;
      const items = [...shift(nb, pad + (W - 2 * pad - nb.w) / 2, nBase), path([[0, barY], [W, barY]]), ...shift(db, pad + (W - 2 * pad - db.w) / 2, dBase)];
      return mk(W, -(nBase - nb.asc), dBase + db.desc, items);
    }
    case 'sqrt': {
      const ib = sub(ast.x), idx = ast.idx ? sub(ast.idx, sc * .55, depth + 1) : null;
      const top = -(ib.asc + .28 * U), bot = Math.max(ib.desc, .15 * U) + .12 * U, h = bot - top, rw = .95 * U;
      const ix = idx ? Math.max(0, idx.w - .45 * U) : 0;
      const x0 = ix, G = gstretch(ctx, '√', top, bot, 1.5 * U);
      let pts, rw2 = rw, barW = 1;
      if (G) { rw2 = G.w; const ey = top + (bot - top) * G.end.y; pts = [[x0 + G.w * G.end.x - .04 * U, ey], [x0 + G.w + ib.w + .3 * U, ey]]; barW = G.m; }
      else pts = [[x0, -.40 * U], [x0 + .17 * U, -.56 * U], [x0 + .52 * U, bot], [x0 + rw, top], [x0 + rw + ib.w + .3 * U, top]];
      const items = [path(pts, (ctx.line || 1) * barW), ...(G ? shift(G, x0, 0) : []), ...shift(ib, x0 + rw2 + .12 * U, 0)];
      if (idx) items.push(...shift(idx, 0, -.9 * U));
      return mk(x0 + rw2 + ib.w + .3 * U, Math.max(-top, idx ? .9 * U + idx.asc : 0), bot, items);
    }
    case 'bigop': return bigBox(ast, null, null);
    case 'diff': return hcat([gapOf(.18), text('d'), gapOf(.03), text(ast.v)]);
    case 'matrix': {
      const rows = ast.rows.map(r => r.map(c => sub(c))); const nc = Math.max(...rows.map(r => r.length));
      const cw = Array.from({ length: nc }, (_, j) => Math.max(0, ...rows.map(r => r[j] ? r[j].w : 0)));
      const cg = ast.kind === 'cases' ? 1.0 * U : .9 * U, rg = .5 * U, items = []; let y = 0, W = 0, first = null, lastB = 0;
      rows.forEach((r, i) => {
        const asc = Math.max(1.2 * U, ...r.map(c => c.asc)), desc = Math.max(.3 * U, ...r.map(c => c.desc)); if (i) y += rg + asc; else y = asc;
        let x = 0; r.forEach((c, j) => { const dx = ast.kind === 'cases' ? 0 : (cw[j] - c.w) / 2; items.push(...shift(c, x + dx, y)); x += cw[j] + cg; }); W = Math.max(W, x - cg);
        if (first == null) first = asc; lastB = y + desc; y += desc;
      });
      const H = y, dy = axisY - H / 2; for (const it of items) { if (it.path) it.path.pts = it.path.pts.map(([px, py]) => [px, py + dy]); else it.y += dy; }
      const body = mk(W, H / 2 - axisY, H / 2 + axisY, items);
      if (ast.kind === 'cases') {
        const gb = gstretch(ctx, '{', -(body.asc + .1 * U), body.desc + .1 * U, .9 * U); if (gb) return mk(gb.w + .25 * U + body.w, body.asc + .1 * U, body.desc + .1 * U, [...gb.items, ...shift(body, gb.w + .25 * U, 0)]);
        const top = -(body.asc + .1 * U), bot = body.desc + .1 * U, h = bot - top, mid = (top + bot) / 2, w = .55 * U, bw = .2 * U;
        const br = hand([[w, top], [w - bw, top + .15 * h * .5], [w - bw, mid - .12 * h], [0, mid], [w - bw, mid + .12 * h], [w - bw, bot - .15 * h * .5], [w, bot]], U, { smooth: 2, amp: .015, seed: 3 });
        return mk(w + .25 * U + body.w, -top, bot, [path(br), ...shift(body, w + .25 * U, 0)]);
      }
      return parens('(', ')', body, U, ctx, text, path, sc);
    }
    default: return text('?');
  }
  function limBox(base, lo) {
    const b = sub(base), l = sub(lo, sc * .55, depth + 1), W = Math.max(b.w, l.w), d = b.desc + .35 * U + l.asc;
    return mk(W, b.asc, d + l.desc, [...shift(b, (W - b.w) / 2, 0), ...shift(l, (W - l.w) / 2, d)]);
  }
  function bigBox(op, lo, hi) {
    const sym = bigSym(op.v, U, path, ctx), s2 = sc * .55, l = lo ? sub(lo, s2, depth + 1) : null, h = hi ? sub(hi, s2, depth + 1) : null;
    const integral = op.v.endsWith('int');
    if (integral) {
      const items = [...sym.items]; let W = sym.w;
      if (h) { items.push(...shift(h, sym.w - .05 * U, -(sym.asc - h.desc - .05 * U))); }
      if (l) { items.push(...shift(l, sym.w - .55 * U, sym.desc - .1 * U + l.asc * .2 + .1 * U)); }
      W = sym.w + Math.max(h ? h.w - .05 * U : 0, l ? l.w - .55 * U : 0, 0) + .1 * U;
      return mk(W, Math.max(sym.asc, h ? sym.asc + h.asc * .3 : 0), sym.desc + (l ? l.asc * .2 + l.desc * .5 : 0), items);
    }
    const W = Math.max(sym.w, l ? l.w : 0, h ? h.w : 0), items = [...shift(sym, (W - sym.w) / 2, 0)];
    let asc = sym.asc, desc = sym.desc;
    if (h) { const y = -(sym.asc + .15 * U + h.desc); items.push(...shift(h, (W - h.w) / 2, y)); asc = -y + h.asc; }
    if (l) { const y = sym.desc + .15 * U + l.asc; items.push(...shift(l, (W - l.w) / 2, y)); desc = y + l.desc; }
    return mk(W + .1 * U, asc, desc, items);
  }
}
const startsNum = (n) => n.t === 'num' || (n.t === 'un' && startsNum(n.e)) || (n.t === 'sup' && startsNum(n.base)) || n.t === 'frac' && false;
const endsNum = (n) => n.t === 'num' || (n.t === 'post' && n.v === '%' && false);
const supRise = (base, ex, U) => Math.max(.85 * U, base.asc * .62) ;
const sbShift = (U) => .5 * U;
function supBox(base, ex, U) { const rise = supRise(base, ex, U); const items = [...shift(base, 0, 0), ...shift(ex, base.w + .04 * U, -rise)]; return mk(base.w + ex.w + .06 * U, Math.max(base.asc, rise + ex.asc), Math.max(base.desc, ex.desc - rise), items); }
function subBox(base, s, U) { const d = sbShift(U); return mk(base.w + s.w + .04 * U, base.asc, Math.max(base.desc, d + s.desc), [...shift(base, 0, 0), ...shift(s, base.w + .04 * U, d)]); }
function opBox(op, ctx, U, text, path, cross) {
  const has = (c) => ctx.has(c);
  if (op === '*') {
    if (cross) { if (has('×')) return text('×'); const q = .32 * U, y = -.55 * U; return { w: .8 * U, asc: .9 * U, desc: 0, items: [path([[.1 * U, y - q], [.1 * U + 2 * q, y + q]]), path([[.1 * U, y + q], [.1 * U + 2 * q, y - q]])] }; }
    if (has('·')) return text('·');
    const y = -.55 * U; return { w: .35 * U, asc: .7 * U, desc: 0, items: [path([[.17 * U, y], [.17 * U + .4, y]], 1.9)] };
  }
  const sh = { '-': '−', ':': ':' }[op] || op;
  if (sh === '=' && !has('=')) { const y1 = -.38 * U, y2 = -.78 * U, w = .85 * U; return { w, asc: .9 * U, desc: 0, items: [path([[0, y1], [w, y1]]), path([[0, y2], [w, y2]])] }; }
  if (sh === '+' && !has('+')) { const y = -.55 * U, w = .8 * U; return { w, asc: .9 * U, desc: 0, items: [path([[0, y], [w, y]]), path([[w / 2, y - w / 2], [w / 2, y + w / 2]])] }; }
  if (!has(sh)) {
    const y = -.55 * U, w = 1.0 * U, q = .28 * U;
    if (sh === '→' || sh === '⇒') { const items = [path([[0, y], [w, y]]), path([[w - q, y - q], [w, y], [w - q, y + q]])]; if (sh === '⇒') items.push(path([[0, y - .18 * U], [w * .85, y - .18 * U]]), path([[0, y + .18 * U], [w * .85, y + .18 * U]])); return { w: w + .1 * U, asc: .9 * U, desc: 0, items }; }
    if (sh === '≤' || sh === '≥') { const l = sh === '≤'; const items = [path(l ? [[w * .8, y - q - .1 * U], [0, y], [w * .8, y + q - .1 * U]] : [[0, y - q - .1 * U], [w * .8, y], [0, y + q - .1 * U]]), path([[0, y + q + .12 * U], [w * .8, y + q + .12 * U]])]; return { w: w * .85, asc: .9 * U, desc: .1 * U, items }; }
    if (sh === '≠') { const items = [path([[0, y - .2 * U], [w * .8, y - .2 * U]]), path([[0, y + .2 * U], [w * .8, y + .2 * U]]), path([[w * .55, y - .6 * U], [w * .25, y + .6 * U]])]; return { w: w * .85, asc: 1.1 * U, desc: .1 * U, items }; }
  }
  return text(sh);
}


// Wo endet die Tinte des Zeichens oben rechts (Anteil von Breite/Höhe)? Damit der Wurzelstrich genau anschließt.
function inkEnd(v) {
  if (v._end) return v._end;
  let r = { x: .97, y: .07 };
  try {
    const im = v.img, W = im.naturalWidth || im.width, H = im.naturalHeight || im.height;
    if (W && H) {
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
      const rows = Math.ceil(H * .5), d = x.getImageData(0, 0, W, rows).data; let mx = -1;
      for (let X = W - 1; X >= 0 && mx < 0; X--) for (let Y = 0; Y < rows; Y++) if (d[(Y * W + X) * 4 + 3] > 60) { mx = X; break; }
      if (mx >= 0) { let sum = 0, n = 0; for (let X = Math.max(0, mx - 3); X <= mx; X++) for (let Y = 0; Y < rows; Y++) if (d[(Y * W + X) * 4 + 3] > 60) { sum += Y; n++; } if (n) r = { x: (mx + 1) / W, y: (sum / n + .5) / H }; }
    }
  } catch (e) { /* ohne Bildanalyse: Schätzwert */ }
  v._end = r; return r;
}
// Eigenes Zeichen (aus der Handschrift des Nutzers) so strecken, dass die Tinte von T (oben, negativ) bis B (unten) reicht
function gstretch(ctx, ch, T, B, maxW = 1e9) {
  if (!ctx.has || !ctx.has(ch)) return null;
  const r = ctx.run(ch, 1), g = r && r.run && r.run[0]; if (!g || !g.v || !g.v.ih) return null;
  const v = g.v, s0 = ctx.k * g.sc, m = (B - T) / (v.ih * s0), s = s0 * m, wf = Math.min(1, maxW / (v.iw * s * g.sx));
  return { w: v.iw * s * g.sx * wf, m, end: inkEnd(v), T, B, items: [{ g: { ...g, sx: g.sx * wf }, m, x: -v.ox * s * g.sx * wf, y: T - v.oy * s, rot: 0 }] };
}
function parens(o, c, ib, U, ctx, text, path, sc) {
  const tall = ib.asc + ib.desc > 2.9 * U || ib.asc > 2.1 * U;
  if (!tall) {
    const L = text(o), R = text(c); const g = .06 * U;
    const items = [...shift(L, 0, 0), ...shift(ib, L.w + g, 0), ...shift(R, L.w + g + ib.w + g, 0)];
    return mk(L.w + R.w + ib.w + 2 * g, Math.max(ib.asc, L.asc), Math.max(ib.desc, R.desc), items);
  }
  { // große Klammern aus der eigenen Handschrift, gestreckt
    const top0 = -(ib.asc + .12 * U), bot0 = ib.desc + .12 * U, Lg = gstretch(ctx, o, top0, bot0, .9 * U), Rg = gstretch(ctx, c, top0, bot0, .9 * U);
    if (Lg && Rg) { const gp = .08 * U, items = [...Lg.items, ...shift(ib, Lg.w + gp, 0), ...shift(Rg, Lg.w + gp + ib.w + gp, 0)]; return mk(Lg.w + ib.w + Rg.w + 2 * gp, -top0, bot0, items); }
  }
  // Ersatz, falls das Zeichen in der Schrift fehlt: saubere Kurve
  const top = -(ib.asc + .12 * U), bot = ib.desc + .12 * U, h = bot - top, bulge = Math.min(.55 * U, h * .12), w = bulge + .5 * U, N = 16, left = [], right = [];
  const arc = (dir) => { const pts = []; for (let i = 0; i <= N; i++) { const t = i / N, yy = top + h * t, off = Math.sin(Math.PI * t) * bulge; pts.push([dir > 0 ? w - .2 * U - bulge + off : .2 * U + bulge - off, yy]); } return pts; };
  const sq = o === '[' || c === ']';
  let items;
  if (sq) items = [path([[.45 * U, top], [.2 * U, top], [.2 * U, bot], [.45 * U, bot]])]; else items = [path(arc(-1))];
  const x0 = w, inner = shift(ib, x0 + .05 * U, 0);
  const rx = x0 + ib.w + .1 * U;
  const r = sq ? path([[rx + .05 * U, top], [rx + .3 * U, top], [rx + .3 * U, bot], [rx + .05 * U, bot]]) : path(arc(1).map(([x, y]) => [x - (w - .2 * U - bulge) + rx + .1 * U, y]));
  return mk(rx + .1 * U + bulge + .2 * U, -top, bot, [...items, ...inner, r]);
}

// Handschriftlicher Strich: verdichten, leicht abrunden, minimal wackeln (damit Symbole nicht zu perfekt aussehen)
function hand(pts, U, o = {}) {
  const { smooth = 1, amp = .03, seed = 0, step = .35 } = o;
  let p = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / (step * U))); for (let k = 1; k <= n; k++) p.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  for (let it = 0; it < smooth; it++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; q.push([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25], [a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75]); }
    q.push(p[p.length - 1]); p = q;
  }
  return p.map((q, i) => (i === 0 || i === p.length - 1) ? q : [q[0] + Math.sin(i * .9 + seed) * amp * U, q[1] + Math.cos(i * 1.3 + seed * 1.7) * amp * U]);
}
// Große Operatoren als Striche: Integral, Summe, Produkt
function bigSym(kind, U, path, ctx) {
  if (kind.endsWith('int')) {
    const n = kind === 'iiint' ? 3 : kind === 'iint' ? 2 : 1, asc = 2.2 * U, desc = 1.0 * U, h = asc + desc, w = .8 * U, top = -asc, off = .42 * U, items = [];
    const G = gstretch(ctx, '∫', top, desc, 1.1 * U);
    if (G) { for (let k = 0; k < n; k++) items.push(...shift(G, k * off, 0)); const gw = G.w; if (kind === 'oint') { const og = gstretch(ctx, '∮', top, desc, 1.3 * U); if (og) return { w: og.w + .1 * U, asc, desc, items: og.items }; items.push(path(circle(gw * .5, top + h * .5, .45 * U, .38 * U, 28), .8)); } return { w: gw + (n - 1) * off + .15 * U, asc, desc, items }; }
    const N = [[0, .93], [.1, 1.0], [.26, .97], [.38, .82], [.44, .52], [.5, .2], [.6, .05], [.76, 0], [.92, .06], [1, .2]];
    for (let k = 0; k < n; k++) items.push(path(hand(N.map(([a, b]) => [a * w + k * off, top + b * h]), U, { smooth: 2, amp: 0, seed: 2 + k }), 1.1));
    if (kind === 'oint') items.push(path(circle(w * .45, top + h * .5, .42 * U, .34 * U, 28), .8));
    return { w: w + (n - 1) * off + .15 * U, asc, desc, items };
  }
  const asc = 1.75 * U, desc = .55 * U, h = asc + desc, w = 1.25 * U, top = -asc;
  { const G = gstretch(ctx, kind === 'sum' ? '∑' : '∏', top, desc, 1.6 * U); if (G) return { w: G.w, asc, desc, items: G.items }; }
  if (kind === 'sum') {
    const P = [[w * .95, top + h * .04], [w * .98, top], [0, top], [w * .55, top + h * .5], [0, top + h], [w, top + h], [w * 1.0, top + h * .93]];
    return { w, asc, desc, items: [path(hand(P, U, { smooth: 0, amp: 0, seed: 4 }), 1.1)] };
  }
  const L = (x) => path(hand([[x, top + .02 * h], [x + .02 * U, top + h]], U, { smooth: 0, amp: 0, seed: x }), 1.1);
  return { w, asc, desc, items: [path(hand([[0, top], [w, top + .03 * h]], U, { smooth: 0, amp: 0, seed: 7 }), 1.1), L(w * .18), L(w * .82)] };
}
