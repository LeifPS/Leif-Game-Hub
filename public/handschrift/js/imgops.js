// Bildverarbeitung für den Bogen-Leser (reine Zahlen-Arrays, kein OpenCV nötig)
export const SC = 3, PAD = 4, XH = 27;     // 3 Pixel pro Einheit, 4 Einheiten Rand, x-Höhe = 27 Einheiten (wie die eingebaute Schrift)

export function toGray(id) {
  const d = id.data, n = id.width * id.height, g = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
  return g;
}
// Zusammenhängende Teile (8er-Nachbarschaft). mask: Uint8 (0/1). Rückgabe: labels + Liste {x0,y0,x1,y1,area}
export function components(mask, w, h) {
  const lab = new Int32Array(w * h), comps = [], stack = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || lab[i]) continue;
    const id = comps.length + 1; let sp = 0; stack[sp++] = i; lab[i] = id;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, area = 0;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0; area++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const q = yy * w + xx; if (mask[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; } } }
    }
    comps.push({ id, x0, y0, x1, y1, area });
  }
  return { lab, comps };
}
export function dilateBox(m, w, h, r) {     // Quadrat (2r+1), getrennt in zwei Durchgängen
  const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const xx = x + k; if (xx >= 0 && xx < w && m[y * w + xx]) v = 1; } t[y * w + x] = v; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let k = -r; k <= r && !v; k++) { const yy = y + k; if (yy >= 0 && yy < h && t[yy * w + x]) v = 1; } o[y * w + x] = v; }
  return o;
}
// Kubisch (Catmull-Rom) hochskalieren; beim Verkleinern Flächenmittel
export function resize(src, w, h, dw, dh) {
  if (dw < w || dh < h) return resizeArea(src, w, h, dw, dh);
  const tmp = new Float32Array(dw * h), out = new Float32Array(dw * dh);
  const wts = (n, dn) => { const idx = [], wt = [];
    for (let i = 0; i < dn; i++) { const s = (i + 0.5) * n / dn - 0.5, f = Math.floor(s), t = s - f; const ii = [], ww = [];
      for (let k = -1; k <= 2; k++) { const x = Math.min(n - 1, Math.max(0, f + k)), d = Math.abs(k - t);
        const a = -0.5, c = d < 1 ? (a + 2) * d * d * d - (a + 3) * d * d + 1 : d < 2 ? a * d * d * d - 5 * a * d * d + 8 * a * d - 4 * a : 0; ii.push(x); ww.push(c); }
      idx.push(ii); wt.push(ww); }
    return { idx, wt }; };
  const X = wts(w, dw), Y = wts(h, dh);
  for (let y = 0; y < h; y++) for (let x = 0; x < dw; x++) { let s = 0; const ii = X.idx[x], ww = X.wt[x]; for (let k = 0; k < 4; k++) s += src[y * w + ii[k]] * ww[k]; tmp[y * dw + x] = s; }
  for (let y = 0; y < dh; y++) { const ii = Y.idx[y], ww = Y.wt[y]; for (let x = 0; x < dw; x++) { let s = 0; for (let k = 0; k < 4; k++) s += tmp[ii[k] * dw + x] * ww[k]; out[y * dw + x] = s; } }
  return out;
}
function resizeArea(src, w, h, dw, dh) {
  const out = new Float32Array(dw * dh), sx = w / dw, sy = h / dh;
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const x0 = x * sx, x1 = (x + 1) * sx, y0 = y * sy, y1 = (y + 1) * sy; let s = 0, c = 0;
    for (let yy = Math.floor(y0); yy < Math.min(h, Math.ceil(y1)); yy++) { const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
      for (let xx = Math.floor(x0); xx < Math.min(w, Math.ceil(x1)); xx++) { const wx = Math.min(xx + 1, x1) - Math.max(xx, x0); s += src[yy * w + xx] * wx * wy; c += wx * wy; } }
    out[y * dw + x] = c ? s / c : 0;
  }
  return out;
}
export function gauss(a, w, h, sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3)), k = []; let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-i * i / (2 * sigma * sigma)); k.push(v); sum += v; }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) { const xx = Math.min(w - 1, Math.max(0, x + i)); s += a[y * w + xx] * k[i + r]; } t[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) { const yy = Math.min(h - 1, Math.max(0, y + i)); s += t[yy * w + x] * k[i + r]; } o[y * w + x] = s; }
  return o;
}
export function dilateDisk(a, w, h, r) {    // Kreis-Maximum auf Float-Bild (r in Pixeln)
  const o = new Float32Array(w * h), R = Math.ceil(r), offs = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r + 0.3) offs.push([dx, dy]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let m = 0; for (const [dx, dy] of offs) { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < w && yy >= 0 && yy < h) { const v = a[yy * w + xx]; if (v > m) m = v; } } o[y * w + x] = m; }
  return o;
}
// Schrägstellung um die Grundlinie br korrigieren: Zeile y wird um k*(br-y) nach rechts verschoben
export function shear(a, w, h, k, br) {
  const m = Math.ceil(Math.abs(k) * Math.max(br, h - br)) + 3, nw = w + 2 * m, o = new Float32Array(nw * h);
  for (let y = 0; y < h; y++) { const sh = k * (br - y);
    for (let x = 0; x < nw; x++) { const sx = x - m - sh, x0 = Math.floor(sx), t = sx - x0; const v0 = x0 >= 0 && x0 < w ? a[y * w + x0] : 0, v1 = x0 + 1 >= 0 && x0 + 1 < w ? a[y * w + x0 + 1] : 0; o[y * nw + x] = v0 * (1 - t) + v1 * t; } }
  return { a: o, w: nw, h, m };
}
export function bboxOf(a, w, h, th = 0.04) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (a[y * w + x] > th) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}
export const median = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
// Strichbreite grob schätzen: Fläche / halber Umfang
export function strokeWidth(a, w, h) {
  let area = 0, per = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (a[y * w + x] <= 0.5) continue; area++;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || a[y * w + x - 1] <= 0.5 || a[y * w + x + 1] <= 0.5 || a[(y - 1) * w + x] <= 0.5 || a[(y + 1) * w + x] <= 0.5) per++; }
  return per ? 2 * area / per : 0;
}
