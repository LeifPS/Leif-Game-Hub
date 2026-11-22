// Schreib-Video: eine Seite entsteht Zeichen für Zeichen, als würde sie gerade geschrieben (Aufnahme in Echtzeit über MediaRecorder).
import { drawPage, ensureImages } from './render.js';

export const videoSupported = () => typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
function mimeType() {
  for (const t of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  return '';
}
// Bereich eines Eintrags (Seitenkoordinaten), der beim Schreiben aufgedeckt wird
function rectOf(e, u) {
  if (e.g && e.x != null) return { x0: e.x - .15 * u, x1: e.x + (e.g.adv || u) * (e.m || 1) + .2 * u, y0: e.y - 1.8 * u, y1: e.y + .9 * u, t: .065 };
  if (e.path && e.path.pts && e.path.pts.length) { const xs = e.path.pts.map((p) => p[0]), ys = e.path.pts.map((p) => p[1]), pad = .3 * u; const w = Math.max(...xs) - Math.min(...xs); return { x0: Math.min(...xs) - pad, x1: Math.max(...xs) + pad, y0: Math.min(...ys) - pad, y1: Math.max(...ys) + pad, t: Math.min(.9, .12 + w / (u * 40)) }; }
  if (e.line) { const pad = .3 * u; return { x0: Math.min(e.line.x1, e.line.x2) - pad, x1: Math.max(e.line.x1, e.line.x2) + pad, y0: Math.min(e.line.y1, e.line.y2) - pad, y1: Math.max(e.line.y1, e.line.y2) + pad, t: .25 }; }
  return null;
}

/** Nimmt die Seite als Video auf. prog(0..1). Dauer: etwa so lange wie das Video (max. ~45 s). */
export async function exportVideo(L, S, pageIdx, prog) {
  if (!videoSupported()) throw new Error('Dieser Browser kann keine Videos aufnehmen.');
  const ent = L.pages[pageIdx] || []; await ensureImages(ent);
  const scale = Math.min(1.6, 1280 / L.PW), W = Math.round(L.PW * scale), H = Math.round(L.PH * scale), u = S.size;
  const bg = document.createElement('canvas'); drawPage(bg, [], L, S, scale, false);
  const ink = document.createElement('canvas'); drawPage(ink, ent, L, S, scale, true);
  const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d');
  const done = document.createElement('canvas'); done.width = W; done.height = H; const d = done.getContext('2d');
  // Zeitplan
  const steps = []; for (const e of ent) { const r = rectOf(e, u); if (r) steps.push(r); }
  let total = steps.reduce((a, r) => a + r.t, 0); const f = total > 42 ? 42 / total : 1; for (const r of steps) r.t *= f; total *= f;
  const startHold = .6, endHold = 1.6, dur = startHold + total + endHold;
  const stream = out.captureStream(30), mt = mimeType(), rec = new MediaRecorder(stream, mt ? { mimeType: mt, videoBitsPerSecond: 6e6 } : { videoBitsPerSecond: 6e6 }), chunks = [];
  rec.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data); };
  const stopped = new Promise((ok) => { rec.onstop = ok; });
  const copy = (ctx, r, frac = 1) => { const x0 = Math.max(0, r.x0 * scale), y0 = Math.max(0, r.y0 * scale), x1 = Math.min(W, r.x1 * scale), y1 = Math.min(H, r.y1 * scale), w = (x1 - x0) * frac, h = y1 - y0; if (w > 0 && h > 0) ctx.drawImage(ink, x0, y0, w, h, x0, y0, w, h); };
  o.drawImage(bg, 0, 0); rec.start(250);
  let i = 0, acc = startHold; const t0 = performance.now();
  await new Promise((resolve) => {
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      while (i < steps.length && t >= acc + steps[i].t) { copy(d, steps[i]); acc += steps[i].t; i++; }
      o.globalCompositeOperation = 'source-over'; o.drawImage(bg, 0, 0); o.drawImage(done, 0, 0);
      if (i < steps.length && t > acc) copy(o, steps[i], Math.min(1, (t - acc) / steps[i].t));
      if (i >= steps.length) o.drawImage(ink, 0, 0);
      prog && prog(Math.min(1, t / dur));
      if (t >= dur) resolve(); else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  rec.stop(); await stopped; stream.getTracks().forEach((tr) => tr.stop());
  const type = (mt || 'video/webm').split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type === 'video/mp4' ? 'mp4' : 'webm' };
}
