// Export: PDF (A4 für GoodNotes), PNG je Seite, PNG-ZIP, transparente PNG
import { drawPage, ensureImages, FORMATS } from './render.js';
import { makePdf, makeZip } from './pdfw.js';
import { blobOf, tick } from './util.js';

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
