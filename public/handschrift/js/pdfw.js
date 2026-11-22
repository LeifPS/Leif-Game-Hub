// Eigener PDF- und ZIP-Schreiber (keine Bibliothek nötig, läuft offline)
const enc = new TextEncoder();
// pages: [{ jpeg: Uint8Array, px: [w,h], pt: [w,h] }]
export function makePdf(pages, title = 'Handschrift') {
  const parts = [], offs = []; let pos = 0;
  const push = (d) => { const u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); pos += u.length; };
  const begin = (id) => { offs[id] = pos; push(id + ' 0 obj\n'); };
  const n = pages.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  begin(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  begin(2); push('<< /Type /Pages /Count ' + n + ' /Kids [' + pages.map((_, i) => (4 + 3 * i) + ' 0 R').join(' ') + '] >>\nendobj\n');
  const t = title.replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, '');
  begin(3); push('<< /Title (' + t + ') /Producer (STools Beta) >>\nendobj\n');
  pages.forEach((p, i) => {
    const im = 5 + 3 * i, ct = 6 + 3 * i, pg = 4 + 3 * i, [pw, ph] = p.pt;
    begin(im); push('<< /Type /XObject /Subtype /Image /Width ' + p.px[0] + ' /Height ' + p.px[1] + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n'); push(p.jpeg); push('\nendstream\nendobj\n');
    const cs = 'q ' + pw.toFixed(2) + ' 0 0 ' + ph.toFixed(2) + ' 0 0 cm /Im0 Do Q';
    begin(ct); push('<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream\nendobj\n');
    begin(pg); push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + pw.toFixed(2) + ' ' + ph.toFixed(2) + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>\nendobj\n');
  });
  const total = 4 + 3 * n, xr = pos;
  push('xref\n0 ' + total + '\n0000000000 65535 f \n');
  for (let id = 1; id < total; id++) push(String(offs[id]).padStart(10, '0') + ' 00000 n \n');
  push('trailer\n<< /Size ' + total + ' /Root 1 0 R /Info 3 0 R >>\nstartxref\n' + xr + '\n%%EOF');
  return new Blob(parts, { type: 'application/pdf' });
}
// ZIP ohne Kompression (PNG/JPEG sind schon komprimiert)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export function makeZip(files) {   // [{ name, data: Uint8Array }]
  const parts = [], central = []; let pos = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
  const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]), u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data);
    const head = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(dt), u16(dd), u32(crc), u32(f.data.length), u32(f.data.length), u16(nm.length), u16(0), nm);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(dt), u16(dd), u32(crc), u32(f.data.length), u32(f.data.length), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(pos), nm));
    parts.push(head, f.data); pos += head.length + f.data.length;
  }
  const cd = cat(...central);
  parts.push(cd, cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(pos), u16(0)));
  return new Blob(parts, { type: 'application/zip' });
}
