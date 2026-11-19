// GoodNotes-Datei (.goodnotes) aus einem PDF erzeugen. Aufbau aus echten GoodNotes-Exporten abgeleitet
// (ZIP mit Protobuf-Ereignisprotokoll). Die Seiten sind eingebundene PDF-Seiten, keine Tinten-Striche.
import { TPL, ATT_ID, ATT_FILE } from './gntpl.js';

const te = new TextEncoder(), td = new TextDecoder();
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
function wv(n) { const o = []; n = BigInt(n); do { let b = Number(n & 0x7fn); n >>= 7n; o.push(n ? b | 0x80 : b); } while (n); return Uint8Array.from(o); }
function rv(b, i) { let r = 0n, s = 0n; for (;;) { const c = b[i++]; r |= BigInt(c & 0x7f) << s; s += 7n; if (!(c & 0x80)) return [r, i]; } }
// Protobuf exakt umkehrbar lesen: [[feld, typ, wert]] mit typ v (Zahl, BigInt), d (8 Byte), f (4 Byte), b (Bytes)
function parse(b) {
  const out = []; let i = 0;
  while (i < b.length) {
    let k; [k, i] = rv(b, i); const f = Number(k >> 3n), t = Number(k & 7n);
    if (t === 0) { let v; [v, i] = rv(b, i); out.push([f, 'v', v]); }
    else if (t === 1) { out.push([f, 'd', b.slice(i, i + 8)]); i += 8; }
    else if (t === 5) { out.push([f, 'f', b.slice(i, i + 4)]); i += 4; }
    else if (t === 2) { let l; [l, i] = rv(b, i); l = Number(l); out.push([f, 'b', b.slice(i, i + l)]); i += l; }
    else throw new Error('Unbekannter Typ');
  }
  return out;
}
function encode(fs) {
  const p = [];
  for (const [f, t, v] of fs) {
    if (t === 'v') p.push(wv(f << 3), wv(v));
    else if (t === 'd') p.push(wv(f << 3 | 1), v);
    else if (t === 'f') p.push(wv(f << 3 | 5), v);
    else p.push(wv(f << 3 | 2), wv(v.length), v);
  }
  return cat(...p);
}
function records(b) { const out = []; let i = 0; while (i < b.length) { let l; [l, i] = rv(b, i); l = Number(l); out.push(b.slice(i, i + l)); i += l; } return out; }
const stream = (recs) => cat(...recs.map(r => cat(wv(r.length), r)));
const get = (fs, f) => { const x = fs.find(e => e[0] === f); if (!x) throw new Error('Feld ' + f + ' fehlt'); return x; };
const set = (fs, f, t, v) => { const x = get(fs, f); x[1] = t; x[2] = v; };
const f32 = (v) => { const o = new Uint8Array(4); new DataView(o.buffer).setFloat32(0, v, true); return o; };
const f64 = (v) => { const o = new Uint8Array(8); new DataView(o.buffer).setFloat64(0, v, true); return o; };
const uid = () => te.encode(crypto.randomUUID().toUpperCase());

// ZIP mit Deflate (wenn der Browser es kann), sonst gespeichert
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function deflate(data) {
  if (typeof CompressionStream === 'undefined' || data.length < 64) return null;
  try {
    const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(data); w.close();
    return new Uint8Array(await new Response(cs.readable).arrayBuffer());
  } catch (_) { return null; }
}
async function zip(files) {
  const parts = [], central = []; let pos = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
  const u16 = (v) => Uint8Array.from([v & 255, (v >> 8) & 255]), u32 = (v) => Uint8Array.from([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
  for (const f of files) {
    const nm = te.encode(f.name), crc = crc32(f.data), z = f.noDeflate ? null : await deflate(f.data), body = z && z.length < f.data.length ? z : f.data, method = body === f.data ? 0 : 8;
    const head = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(dt), u16(dd), u32(crc), u32(body.length), u32(f.data.length), u16(nm.length), u16(0), nm);
    central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(method), u16(dt), u16(dd), u32(crc), u32(body.length), u32(f.data.length), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(pos), nm));
    parts.push(head, body); pos += head.length + body.length;
  }
  const cd = cat(...central);
  parts.push(cd, cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(pos), u16(0)));
  return new Blob(parts, { type: 'application/octet-stream' });
}

// pdf: Uint8Array, n: Seitenzahl, w/h: Seitengröße in Punkten, thumb: JPEG-Bytes der ersten Seite
export async function makeGoodNotes({ pdf, n, w, h, thumb, title }) {
  const [doc, att, page, layer, link, ui, note] = ['doc', 'att', 'page', 'layer', 'link', 'ui', 'note'].map(k => TPL[k]);
  const now = Date.now();
  // Dokument: Titel
  const D = parse(doc), d30 = parse(get(D, 30)[2]), d2 = parse(get(d30, 2)[2]);
  set(d2, 1, 'b', te.encode((title || 'Handschrift').slice(0, 80))); set(d30, 2, 'b', encode(d2)); set(D, 30, 'b', encode(d30));
  // Anhang = das PDF
  const A = parse(att), a = parse(get(A, 6)[2]); set(a, 5, 'v', pdf.length);
  const m = parse(get(a, 12)[2]); set(m, 2, 'v', n); set(a, 12, 'b', encode(m)); set(A, 6, 'b', encode(a));
  const recs = [encode(D), encode(A)], noteIds = [];
  for (let i = 1; i <= n; i++) {
    const pid = uid(), lid = uid(), nid = uid(), t0 = now + i * 7;
    const P = parse(page), p = parse(get(P, 2)[2]); set(P, 1, 'b', pid); set(p, 2, 'b', pid); set(p, 5, 'v', i);
    set(p, 8, 'b', encode([[1, 'f', f32(w * 22 / 12)], [2, 'f', f32(h * 22 / 12)]]));
    set(p, 10, 'd', f64(t0)); set(p, 11, 'b', uid()); set(p, 16, 'v', 1789663489510 + 10 * i); set(P, 2, 'b', encode(p));
    const L = parse(layer), l = parse(get(L, 54)[2]); set(L, 1, 'b', lid); set(l, 2, 'b', lid);
    const e3 = parse(get(l, 3)[2]); set(e3, 1, 'b', pid); set(l, 3, 'b', encode(e3));
    const e4 = parse(get(l, 4)[2]); set(e4, 1, 'b', te.encode('SPg6b' + i)); set(l, 4, 'b', encode(e4));
    set(l, 10, 'd', f64(t0 + 1)); set(l, 11, 'b', uid()); set(l, 14, 'v', 1789663489515 + 10 * i); set(L, 54, 'b', encode(l));
    const N = parse(note), nn = parse(get(N, 104)[2]); set(N, 1, 'b', nid); set(nn, 2, 'b', nid);
    set(nn, 10, 'd', f64(t0 + 2)); set(nn, 11, 'b', uid()); set(nn, 15, 'b', uid()); set(nn, 18, 'v', 1789663489539 + 10 * i); set(N, 104, 'b', encode(nn));
    recs.push(encode(P), encode(L), encode(N)); noteIds.push(td.decode(nid));
  }
  recs.push(link, ui);
  const files = [
    { name: 'document.info.pb', data: new Uint8Array(0) },
    { name: 'index.search.pb', data: TPL.search },
    { name: 'index.notes.pb', data: stream(noteIds.map(id => encode([[1, 'b', te.encode(id)], [2, 'b', te.encode('notes/' + id)]]))) },
    { name: 'search/' + ATT_ID, data: stream(Array.from({ length: n }, (_, k) => encode([[2, 'v', k + 1], [3, 'b', new Uint8Array(0)]]))) },
    ...noteIds.map(id => ({ name: 'notes/' + id, data: new Uint8Array(0) })),
    { name: 'index.events.pb', data: stream(recs) },
    { name: 'thumbnail.jpg', data: thumb, noDeflate: true },
    { name: 'index.attachments.pb', data: TPL.attachments },
    { name: 'attachments/' + ATT_FILE, data: pdf, noDeflate: true },
    { name: 'schema.pb', data: TPL.schema },
  ];
  return zip(files);
}
