// Dateien einlesen: PDF (pdf.js, wird erst bei Bedarf geladen) und Bilder -> Canvas-Seiten
let pdfjs;
async function lib() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../vendor/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
export async function pagesOf(file, onPage = () => {}) {
  const name = file.name || 'Datei', out = [];
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(name);
  if (isPdf) {
    const L = await lib(), task = L.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }), doc = await task.promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const pg = await doc.getPage(i), v0 = pg.getViewport({ scale: 1 }), scale = Math.min(4, Math.max(2, 2100 / Math.max(v0.width, 1) * (v0.width < v0.height ? 1 : .75)));
      const vp = pg.getViewport({ scale }), c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise; out.push({ canvas: c, name: `${name} · Seite ${i}` }); onPage(out.length); pg.cleanup();
    }
    try { await task.destroy(); } catch (_) {} return out;
  }
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await new Promise((ok, fail) => { const i = new Image(), u = URL.createObjectURL(file); i.onload = () => { ok(i); }; i.onerror = () => fail(new Error('Das Bild konnte nicht gelesen werden (Format?)')); i.src = u; }); }
  const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight, k = Math.min(1, 4200 / Math.max(w, h));
  const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
  out.push({ canvas: c, name }); onPage(1); return out;
}
