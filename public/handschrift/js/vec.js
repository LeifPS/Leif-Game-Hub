// Glyph-Bild (Tinte als Alpha) -> Mittellinien-Striche. Für den GoodNotes-Export mit echten Strichen.
// Ergebnis: { w, h, strokes: [{ pts: [[x,y],...], w }] } in Bildpixeln, w = Strichbreite in Bildpixeln.
const cache = new WeakMap();
const N8 = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const P = 3;

export function vectorize(img) {
  if (cache.has(img)) return cache.get(img);
  const r = run(img); cache.set(img, r); return r;
}

function run(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  if (!iw || !ih) return { w: 0, h: 0, strokes: [] };
  const W = iw + 2 * P, H = ih + 2 * P;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, P, P);
  const d = g.getImageData(0, 0, W, H).data, m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 110 ? 1 : 0;
  const dt = distance(m, W, H);
  const sk = m.slice(); thin(sk, W, H); corners(sk, W, H);
  const out = [];
  const paths = trace(sk, W, H, dt);
  for (const p of paths) {
    let pts = p.pts.map(([x, y]) => [x - P + .5, y - P + .5]);
    pts = simplify(smooth(pts, p.closed), .55);
    let s = 0, n = 0; for (const q of p.pts) { s += dt[Math.round(q[1]) * W + Math.round(q[0])]; n++; }
    const wd = Math.max(1.2, 2 * s / Math.max(1, n));
    if (pts.length < 2) { const q = pts[0] || [0, 0]; pts = [q, [q[0] + .05, q[1]]]; }
    out.push({ pts, w: wd });
  }
  return { w: iw, h: ih, strokes: out };
}

// Abstand zur nächsten Nicht-Tinte (3-4-Chamfer / 3)
export function distance(m, W, H) {
  const INF = 1e9, d = new Float32Array(W * H);
  for (let i = 0; i < d.length; i++) d[i] = m[i] ? INF : 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (!m[i]) continue;
    d[i] = Math.min(d[i], d[i - 1] + 3, d[i - W] + 3, d[i - W - 1] + 4, d[i - W + 1] + 4);
  }
  for (let y = H - 2; y > 0; y--) for (let x = W - 2; x > 0; x--) {
    const i = y * W + x; if (!m[i]) continue;
    d[i] = Math.min(d[i], d[i + 1] + 3, d[i + W] + 3, d[i + W + 1] + 4, d[i + W - 1] + 4);
  }
  for (let i = 0; i < d.length; i++) d[i] = d[i] / 3;
  return d;
}

// Zhang-Suen-Ausdünnung
export function thin(m, W, H) {
  const rm = []; let changed = true;
  while (changed) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      rm.length = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (!m[i]) continue;
        const p2 = m[i - W], p3 = m[i - W + 1], p4 = m[i + 1], p5 = m[i + W + 1], p6 = m[i + W], p7 = m[i + W - 1], p8 = m[i - 1], p9 = m[i - W - 1];
        const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9; if (B < 2 || B > 6) continue;
        const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2); if (A !== 1) continue;
        if (pass === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue; } else { if (p2 * p4 * p8 || p2 * p6 * p8) continue; }
        rm.push(i);
      }
      for (const i of rm) m[i] = 0; if (rm.length) changed = true;
    }
  }
}

// Eck-Pixel entfernen (Treppenstufen), damit jeder Linienpunkt genau zwei klare Nachbarn hat
export function corners(sk, W, H) {
  let ch = true;
  while (ch) {
    ch = false;
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!sk[i]) continue;
      const nbs = []; for (let k = 0; k < 8; k++) if (sk[i + N8[k][1] * W + N8[k][0]]) nbs.push(k);
      if (nbs.length !== 2) continue;
      const a = N8[nbs[0]], b = N8[nbs[1]]; if (Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) === 1) { sk[i] = 0; ch = true; }
    }
  }
}

export function trace(sk, W, H, dt) {
  const N = sk.length, used = new Uint8Array(N), stamp = new Int32Array(N).fill(-1), pidx = new Int32Array(N);
  const off = N8.map(([x, y]) => y * W + x);
  const nbrs = (i) => { const o = []; for (let k = 0; k < 8; k++) { const b = i + off[k]; if (sk[b]) o.push(b); } return o; };
  const X = (i) => i % W, Y = (i) => (i / W) | 0;
  const ds = []; for (let i = 0; i < N; i++) if (sk[i]) ds.push(dt[i]); ds.sort((a, b) => a - b);
  const thr = Math.max(3, 2 * (ds[ds.length >> 1] || 1));
  const paths = []; let pid = 0;
  const dirOf = (pts) => { const e = pts[pts.length - 1], s = pts[Math.max(0, pts.length - 6)]; const dx = X(e) - X(s), dy = Y(e) - Y(s), l = Math.hypot(dx, dy); return l ? [dx / l, dy / l] : null; };
  const grow = (pts) => {
    let attached = false;
    for (;;) {
      const cur = pts[pts.length - 1], dir = dirOf(pts); let best = -1, bs = -9;
      for (let k = 0; k < 8; k++) {
        const b = cur + off[k]; if (!sk[b] || used[b]) continue;
        const mx = N8[k][0], my = N8[k][1], l = Math.hypot(mx, my); const sc = dir ? (mx * dir[0] + my * dir[1]) / l : 0;
        if (sc > bs) { bs = sc; best = b; }
      }
      if (best >= 0) { used[best] = 1; stamp[best] = pid; pidx[best] = pts.length; pts.push(best); continue; }
      // Sackgasse: gerade über eine Kreuzung hinweg weiterspringen oder an einen vorhandenen Strich anschließen
      let jump = -1;
      if (dir) {
        let bd = 1e9;
        for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
          const cx = X(cur) + dx, cy = Y(cur) + dy; if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) continue;
          const c = cy * W + cx; if (!sk[c] || used[c]) continue; const l = Math.hypot(dx, dy); if (l < 2) continue;
          if ((dx * dir[0] + dy * dir[1]) / l > .88 && l < bd) { bd = l; jump = c; }
        }
      }
      if (jump >= 0) { used[jump] = 1; stamp[jump] = pid; pidx[jump] = pts.length; pts.push(jump); continue; }
      for (let k = 0; k < 8; k++) { const b = cur + off[k]; if (sk[b] && used[b] && !(stamp[b] === pid && pidx[b] >= pts.length - 4)) { pts.push(b); attached = true; break; } }
      break;
    }
    return attached;
  };
  const make = (s) => {
    pid++; used[s] = 1; stamp[s] = pid; pidx[s] = 0;
    const a = [s]; const att = grow(a);
    return { pts: a, att };
  };
  const finish = (r, closedTry) => {
    const pts = r.pts.map(i => [X(i), Y(i)]);
    paths.push({ pts, closed: false, att: r.att, len: pts.length });
  };
  for (let i = 0; i < N; i++) if (sk[i] && !used[i] && nbrs(i).length <= 1) finish(make(i));
  for (let i = 0; i < N; i++) if (sk[i] && !used[i]) {
    // Rest (Ringe, Seitenäste ohne Endpunkt): in beide Richtungen laufen
    pid++; used[i] = 1; stamp[i] = pid; pidx[i] = 0;
    const f = [i]; grow(f);
    const bk = [i]; pidx[i] = 0; const a2 = grow(bk);
    const pts = bk.slice(1).reverse().concat(f).map(q => [X(q), Y(q)]);
    paths.push({ pts, closed: false, att: a2, len: pts.length });
  }
  // kurze Stummel, die an einem anderen Strich hängen, weglassen
  const res = [];
  for (const p of paths) {
    if (p.pts.length === 1) { const q = p.pts[0]; p.pts = [q, [q[0] + .05, q[1]]]; }
    if (p.att && p.pts.length < thr) continue;
    res.push(p);
  }
  if (!res.length && paths.length) res.push(paths[0]);
  return res;
}

export function smooth(pts, closed) {
  if (pts.length < 5) return pts;
  const o = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    let sx = 0, sy = 0, n = 0;
    for (let k = -2; k <= 2; k++) { const j = i + k; if (j < 0 || j > pts.length - 1) continue; sx += pts[j][0]; sy += pts[j][1]; n++; }
    o.push([sx / n, sy / n]);
  }
  o.push(pts[pts.length - 1]); return o;
}
export function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, L0 = Math.hypot(dx, dy), L = L0 || 1;
    for (let i = a + 1; i < b; i++) { const d = L0 < 1 ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1) : Math.abs((pts[i][0] - x1) * dy - (pts[i][1] - y1) * dx) / L; if (d > md) { md = d; mi = i; } }
    if (md > eps && mi > 0) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
