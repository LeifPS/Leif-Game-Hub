// Schreib-Vorlagen: Seitenaufbau (fest, damit der Leser die Kästchen wiederfindet) und Zeichnen auf ein Canvas
import { PER_PAGE, COLS, ROWS } from './packs.js';
import { loadScript } from './util.js';
export const GEOM = { PW: 595.2756, PH: 841.8898, M: 28, HEAD: 34, COLS, ROWS, baseFrac: 0.30, midFrac: 0.52, labelW: 16, labelH: 11 };
GEOM.cw = (GEOM.PW - 2 * GEOM.M) / COLS;
GEOM.ch = (GEOM.PH - 2 * GEOM.M - GEOM.HEAD) / ROWS;
GEOM.gridTop = GEOM.M + GEOM.HEAD;
export const cellsOnPage = (cells, p) => cells.slice(p * PER_PAGE, (p + 1) * PER_PAGE);
export const marker = (mask, chash, page, pages, rp) => `HS1.${mask.toString(36)}.${chash}.${page + 1}.${pages}${rp == null ? '' : '.' + rp.toString(36)}`;
export function parseMarker(t) {
  const m = /^HS1\.([0-9a-z]+)\.([0-9a-z]+)\.(\d+)\.(\d+)(?:\.([0-9a-z]+))?$/.exec(t || '');
  return m ? { mask: parseInt(m[1], 36), chash: m[2], page: +m[3] - 1, pages: +m[4], rp: m[5] == null ? null : parseInt(m[5], 36) } : null;
}
const FONT = '"Helvetica Neue", Arial, "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", "Microsoft YaHei", "Segoe UI Symbol", sans-serif';

export async function renderSheet(cells, page, pages, { title = 'Meine Schrift', mask = 0, chash = '0', rp = null } = {}, S = 3) {
  await loadScript('vendor/qrcode.js');
  const { PW, PH, M, cw, ch, gridTop } = GEOM;
  const c = document.createElement('canvas'); c.width = Math.round(PW * S); c.height = Math.round(PH * S);
  const g = c.getContext('2d'); g.scale(S, S);
  g.fillStyle = '#fff'; g.fillRect(0, 0, PW, PH);
  g.fillStyle = '#333'; g.font = `600 11px ${FONT}`; g.textBaseline = 'alphabetic';
  g.fillText(`Schreib-Vorlage · ${title.slice(0, 40)} · Seite ${page + 1} von ${pages}`, M, M + 2);
  g.fillStyle = '#777'; g.font = `7.5px ${FONT}`;
  g.fillText('Schreibe jedes Zeichen in sein Kästchen, so wie du es sonst schreibst. Die kräftig blaue Linie ist die Grundlinie.', M, M + 14);
  g.fillText('Dunkler Stift, normale Größe, nicht den Rand berühren. Danach als PDF oder Bilder exportieren und in der App hochladen.', M, M + 24);
  // QR-Code mit Paket-Auswahl und Seitennummer
  const qr = qrcode(0, 'M'); qr.addData(marker(mask, chash, page, pages, rp)); qr.make();
  const n = qr.getModuleCount(), qs = 36 / (n + 4);
  g.fillStyle = '#fff'; g.fillRect(PW - M - 36 - 2, 18, 40, 40);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let q = 0; q < n; q++) if (qr.isDark(r, q)) g.fillRect(PW - M - 36 + (q + 2) * qs, 20 + (r + 2) * qs - 2, qs + 0.05, qs + 0.05);
  const list = cellsOnPage(cells, page);
  for (let i = 0; i < ROWS * COLS; i++) {
    const r = Math.floor(i / COLS), q = i % COLS, x = M + q * cw, y = gridTop + r * ch;
    if (i >= list.length) break;
    g.strokeStyle = '#bfbfbf'; g.lineWidth = 0.6; g.strokeRect(x, y, cw, ch);
    g.strokeStyle = '#ccdbf5'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x + 2, y + ch * (1 - GEOM.midFrac)); g.lineTo(x + cw - 2, y + ch * (1 - GEOM.midFrac)); g.stroke();
    g.strokeStyle = '#8cb2f2'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(x + 2, y + ch * (1 - GEOM.baseFrac)); g.lineTo(x + cw - 2, y + ch * (1 - GEOM.baseFrac)); g.stroke();
    g.fillStyle = '#8c8c8c'; g.font = `7.5px ${FONT}`; g.fillText(list[i].ch, x + 3, y + 9);
  }
  return c;
}
