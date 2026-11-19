// Export: PDF (A4 für GoodNotes), PNG je Seite, PNG-ZIP, transparente PNG
import { drawPage, ensureImages, FORMATS, SC } from './render.js';
import { makePdf, makeZip } from './pdfw.js';
import { blobOf, tick } from './util.js';
import { vectorize } from './vec.js';

const slug = (t) => (t || 'Handschrift').replace(/[^\p{L}\p{N} _.-]+/gu, '').trim().replace(/\s+/g, '-').slice(0, 50) || 'Handschrift';
export const fileBase = slug;

async function pageCanvas(L, i, S, dpi, transparent) {
  const c = document.createElement('canvas');
  await ensureImages(L.pages[i]);
  drawPage(c, L.pages[i], L, S, dpi / 150, transparent);
  return c;
}
export async function exportPdf(L, S, title, dpi = 200, onProgress = () => {}) {
  const pages = [], f = FORMATS[S.fmt];
  for (let i = 0; i < L.pages.length; i++) {
    const c = await pageCanvas(L, i, S, dpi, false);
    const b = await blobOf(c, 'image/jpeg', .92);
    pages.push({ jpeg: new Uint8Array(await b.arrayBuffer()), px: [c.width, c.height], pt: [f.w * 72 / 150, f.h * 72 / 150] });
    c.width = c.height = 1; onProgress((i + 1) / L.pages.length); await tick();
  }
  return makePdf(pages, title);
}
export async function exportGoodNotes(L, S, title, dpi = 200, onProgress = () => {}) {
  const pages = [], f = FORMATS[S.fmt]; let thumb = null;
  for (let i = 0; i < L.pages.length; i++) {
    const c = await pageCanvas(L, i, S, dpi, false);
    const b = await blobOf(c, 'image/jpeg', .92);
    if (i === 0) { const t = document.createElement('canvas'), k = 360 / c.width; t.width = 360; t.height = Math.round(c.height * k); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); thumb = new Uint8Array(await (await blobOf(t, 'image/jpeg', .85)).arrayBuffer()); }
    pages.push({ jpeg: new Uint8Array(await b.arrayBuffer()), px: [c.width, c.height], pt: [f.w * 72 / 150, f.h * 72 / 150] });
    c.width = c.height = 1; onProgress((i + 1) / L.pages.length * .9); await tick();
  }
  const pdf = new Uint8Array(await (await makePdf(pages, title)).arrayBuffer());
  const { makeGoodNotes } = await import('./gn.js');
  const blob = await makeGoodNotes({ pdf, n: pages.length, w: f.w * 72 / 150, h: f.h * 72 / 150, thumb, title });
  onProgress(1); return blob;
}
// GoodNotes mit leerer Standardseite und echten Strichen (radier- und bearbeitbar)
const cssRgba = (() => { const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d', { willReadFrequently: true }), memo = new Map(); return (col) => { if (memo.has(col)) return memo.get(col); g.clearRect(0, 0, 1, 1); g.fillStyle = '#000'; g.fillStyle = col; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; const r = [d[0] / 255, d[1] / 255, d[2] / 255]; memo.set(col, r); return r; }; })();
export async function exportGoodNotesInk(L, S, title, onProgress = () => {}) {
  const UW = 834.24, UH = 1078.82, fit = Math.min(UW / L.PW, UH / L.PH), ox = (UW - L.PW * fit) / 2, oy = (UH - L.PH * fit) / 2;
  const tan = Math.tan(S.slant * Math.PI / 180), wgt = S.weight * .55, T = (x, y) => [x * fit + ox, y * fit + oy];
  const quad = (x1, y1, cx, cy, x2, y2, n = 12) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t; o.push(T(a * x1 + b * cx + c * x2, a * y1 + b * cy + c * y2)); } return o; };
  const pages = [];
  for (let pi = 0; pi < L.pages.length; pi++) {
    await ensureImages(L.pages[pi]);
    const hl = [], ink = [];
    for (const e of L.pages[pi]) {
      if (e.hl) {
        const h = e.hl, hh = h.y2 - h.y1, yc = (h.y1 + h.y2) / 2, c = cssRgba(h.col || '#ffe246');
        hl.push({ pts: [T(h.x1 + hh / 2, yc), T(h.x2 - hh / 2, yc)], w: hh * fit, color: [c[0], c[1], c[2], .5], marker: true });
      } else if (e.link) {
        const { x1, y1, x2, y2 } = e.link, c = cssRgba(e.link.col || S.ink);
        ink.push({ pts: quad(x1, y1, (x1 + x2) / 2, Math.min(y1, y2) - Math.abs(x2 - x1) * .12, x2, y2), w: (L.k * 2.5 + wgt + (e.link.b ? .8 : 0)) * fit, color: [...c, S.inkAlpha * .9] });
      } else if (e.line) {
        const { x1, y1, x2, y2 } = e.line, c = cssRgba(e.line.col || S.ink);
        ink.push({ pts: quad(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2 + 1.6, x2, y2), w: (L.k * 2.1 + wgt) * fit, color: [...c, S.inkAlpha * .9] });
      } else if (e.g) {
        const { g } = e, v = g.v, im = v.img; if (!im || im.complete === false) continue;
        const vec = v.st ? { w: im.naturalWidth || im.width, h: im.naturalHeight || im.height, strokes: v.st.map(q => ({ pts: q.p.map(([x, y]) => [x * SC, y * SC]), w: q.w * SC })) } : vectorize(im); if (!vec.w) continue;
        const s = L.k * g.sc * e.m, kx = v.iw * s * g.sx / vec.w, ky = v.ih * s / vec.h, ox0 = v.ox * s * g.sx, oy0 = v.oy * s, cr = Math.cos(e.rot), sr = Math.sin(e.rot);
        const c = cssRgba(g.st.col || S.ink), al = Math.min(1, g.a * S.inkAlpha), bw = wgt + (g.st.b ? .9 : 0);
        for (const st of vec.strokes) {
          const pts = st.pts.map(([px, py]) => { const lx = ox0 + px * kx, ly = oy0 + py * ky, x1 = lx - tan * ly; return T(e.x + cr * x1 - sr * ly, e.y + sr * x1 + cr * ly); });
          ink.push({ pts, w: (st.w * (kx + ky) / 2 + bw) * fit, color: [...c, al] });
        }
      }
    }
    pages.push(hl.concat(ink)); onProgress((pi + 1) / L.pages.length * .8); await tick();
  }
  const t = document.createElement('canvas'), pc = await pageCanvas(L, 0, { ...S, paper: 'blank', paperColor: 'weiss', scan: false }, 100, false);
  t.width = 360; t.height = Math.round(pc.height * 360 / pc.width); const tg = t.getContext('2d'); tg.fillStyle = '#fff'; tg.fillRect(0, 0, t.width, t.height); tg.drawImage(pc, 0, 0, t.width, t.height);
  const thumb = new Uint8Array(await (await blobOf(t, 'image/jpeg', .85)).arrayBuffer());
  const { makeGoodNotesInk } = await import('./gnink.js');
  const blob = await makeGoodNotesInk({ pages, title, thumb }); onProgress(1); return blob;
}
export async function exportPngs(L, S, title, dpi = 200, transparent = false, onProgress = () => {}) {
  const files = [], base = slug(title);
  for (let i = 0; i < L.pages.length; i++) {
    const c = await pageCanvas(L, i, S, dpi, transparent), b = await blobOf(c, 'image/png');
    files.push({ name: `${base}-${String(i + 1).padStart(2, '0')}${transparent ? '-transparent' : ''}.png`, data: new Uint8Array(await b.arrayBuffer()), blob: b });
    c.width = c.height = 1; onProgress((i + 1) / L.pages.length); await tick();
  }
  return files;
}
export const zipOf = (files) => makeZip(files.map(f => ({ name: f.name, data: f.data })));
