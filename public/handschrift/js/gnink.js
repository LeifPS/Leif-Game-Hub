// GoodNotes-Datei (.goodnotes) mit leeren Standardseiten und echten Tinten-Strichen.
// Aufbau aus echten GoodNotes-Exporten abgeleitet (ZIP + Protobuf-Ereignisprotokoll, Striche als LZ4-Blöcke).
import { TPL, ATT_ID, DOC_ID } from './gntpl2.js';

const te = new TextEncoder(), td = new TextDecoder();
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; };
function wv(n) { const o = []; n = BigInt(n); do { let b = Number(n & 0x7fn); n >>= 7n; o.push(n ? b | 0x80 : b); } while (n); return Uint8Array.from(o); }
function rv(b, i) { let r = 0n, s = 0n; for (;;) { const c = b[i++]; r |= BigInt(c & 0x7f) << s; s += 7n; if (!(c & 0x80)) return [r, i]; } }
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
const stream = (recs) => cat(...recs.map(r => cat(wv(r.length), r)));
const find = (fs, f) => { const x = fs.find(e => e[0] === f); if (!x) throw new Error('Feld ' + f + ' fehlt'); return x; };
const set = (fs, f, t, v) => { const x = find(fs, f); x[1] = t; x[2] = v; };
const f32 = (v) => { const o = new Uint8Array(4); new DataView(o.buffer).setFloat32(0, v, true); return o; };
const f64 = (v) => { const o = new Uint8Array(8); new DataView(o.buffer).setFloat64(0, v, true); return o; };
const u32 = (v) => { const o = new Uint8Array(4); new DataView(o.buffer).setUint32(0, v >>> 0, true); return o; };
const u16 = (v) => Uint8Array.from([v & 255, (v >> 8) & 255]);
const uidS = () => crypto.randomUUID().toUpperCase();
const uid = () => te.encode(uidS());
const rnd = () => Math.floor(Math.random() * 4294967295) + 1;
// Verschachtelte Felder: edit(rec, [f1, f2, ...], fn) ändert das Feld ganz innen
function edit(fs, path, fn) {
  const [f, ...rest] = path; const x = find(fs, f);
  if (!rest.length) { fn(x); return; }
  const sub = parse(x[2]); edit(sub, rest, fn); x[2] = encode(sub);
}
const setIn = (fs, path, t, v) => edit(fs, path, (x) => { x[1] = t; x[2] = v; });

// ---------- LZ4 (Blockformat, standardkonform) und Apple-Umhüllung 'bv41' ----------
export function lz4(src) {
  const n = src.length, out = [];
  const lenBytes = (l) => { const r = []; while (l >= 255) { r.push(255); l -= 255; } r.push(l); return r; };
  const emit = (anchor, ip, off, ml) => {
    const lit = ip - anchor, tok = (Math.min(lit, 15) << 4) | (ml >= 0 ? Math.min(ml - 4, 15) : 0);
    out.push(tok); if (lit >= 15) out.push(...lenBytes(lit - 15));
    for (let i = anchor; i < ip; i++) out.push(src[i]);
    if (ml >= 0) { out.push(off & 255, off >> 8); if (ml - 4 >= 15) out.push(...lenBytes(ml - 4 - 15)); }
  };
  let ip = 0, anchor = 0; const ht = new Int32Array(1 << 12).fill(-1);
  const rd = (i) => src[i] | (src[i + 1] << 8) | (src[i + 2] << 16) | (src[i + 3] << 24);
  while (ip + 12 <= n) {
    const seq = rd(ip), h = Math.imul(seq, 2654435761) >>> 20, ref = ht[h]; ht[h] = ip;
    if (ref >= 0 && ip - ref < 65536 && rd(ref) === seq) {
      let ml = 4; while (ip + ml < n - 5 && src[ref + ml] === src[ip + ml]) ml++;
      emit(anchor, ip, ip - ref, ml); ip += ml; anchor = ip;
    } else ip++;
  }
  emit(anchor, n, 0, -1);
  return Uint8Array.from(out);
}
const bv41 = (raw) => { const c = lz4(raw); return cat(te.encode('bv41'), u32(raw.length), u32(c.length), c, te.encode('bv4$')); };

// ---------- Striche ----------
// pts: [[x,y],...] in GoodNotes-Einheiten (Punkt x 22/12), w: Breite in derselben Einheit
export function strokeBlock(pts, w) {
  if (pts.length < 2) pts = [pts[0], [pts[0][0] + .05, pts[0][1]]];
  const m = pts.length - 1, sig = te.encode('vuA(v)A(S(uu))A(S(uuuu))vA(f)\0');
  const parts = [u16(2), f32(w), u32(m + 1), u16(0)];
  for (let i = 0; i < m; i++) parts.push(u16(1));
  parts.push(u32(1), f32(pts[0][0]), f32(pts[0][1]), u32(m));
  // Quadratische Kurven: Steuerpunkt = Messpunkt, Endpunkt = Mitte zum nächsten (letzter: der Punkt selbst)
  for (let i = 1; i <= m; i++) {
    const c = pts[i], e = i < m ? [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2] : pts[i];
    parts.push(f32(c[0]), f32(c[1]), f32(e[0]), f32(e[1]));
  }
  parts.push(u16(1), u32(0));
  const body = cat(...parts), total = 4 + 4 + sig.length + body.length;
  return cat(te.encode('tpl\0'), u32(total), sig, body);
}

// ---------- ZIP (Deflate wenn möglich) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function deflate(data) {
  if (typeof CompressionStream === 'undefined' || data.length < 64) return null;
  try { const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(data); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); } catch (_) { return null; }
}
export async function zip(files) {
  const parts = [], central = []; let pos = 0;
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
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

const B62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const DEV = 3026805516050564454n;

// pages: [ [ { pts:[[x,y]...], w, color:[r,g,b,a], marker?:bool } ... ] ... ], Koordinaten in GoodNotes-Einheiten
// thumb: JPEG-Bytes der ersten Seite
export async function makeGoodNotesInk({ pages, title, thumb }) {
  const now = Date.now(); let tick = 0, clock = 1789663489500, seq = 188700 + Math.floor(Math.random() * 5000);
  const ts = () => f64(now + (++tick) * 3), ck = () => ++clock, ev = () => uid();
  // Dokument + Anhang (leere Vorlagenseite)
  const D = parse(TPL.doc); setIn(D, [30, 2, 1], 'b', te.encode((title || 'Handschrift').slice(0, 80)));
  const recs = [encode(D), TPL.att];
  const noteIds = [], notes = [];
  pages.forEach((strokes, pi) => {
    const pid = uid(), nid = uid(), nidS = td.decode(nid);
    // Seite
    const P = parse(TPL.page); set(P, 1, 'b', pid); setIn(P, [2, 2], 'b', pid); setIn(P, [2, 10], 'd', ts()); setIn(P, [2, 11], 'b', ev()); setIn(P, [2, 16], 'v', ck());
    for (const f of [12, 13, 17, 19]) { try { setIn(P, [2, f, 2, 2], 'v', rnd()); } catch (_) { /* Feld fehlt in der Vorlage */ } }
    recs.push(encode(P));
    // Ebene (= Notiz-Id)
    const L = parse(TPL.layer); set(L, 1, 'b', nid); setIn(L, [54, 2], 'b', nid); setIn(L, [54, 3, 1], 'b', pid);
    setIn(L, [54, 4, 1], 'b', te.encode('AwH' + B62[(pi / 62) | 0] + B62[pi % 62]));
    setIn(L, [54, 11], 'b', ev()); setIn(L, [54, 14], 'v', ck());
    for (const path of [[54, 3, 2, 2], [54, 4, 2, 2], [54, 17, 2, 2]]) { try { setIn(L, path, 'v', rnd()); } catch (_) { /* Feld fehlt */ } }
    recs.push(encode(L));
    // Notiz (104), Änderung (102), Verknüpfung (105), Notiz erneut (104)
    const N1 = parse(TPL.note); set(N1, 1, 'b', nid); setIn(N1, [104, 2], 'b', nid); setIn(N1, [104, 10], 'd', ts()); setIn(N1, [104, 11], 'b', ev()); setIn(N1, [104, 15], 'b', ev()); setIn(N1, [104, 18], 'v', ck());
    recs.push(encode(N1));
    if (strokes.length) {
      const N2 = parse(TPL.n102); set(N2, 1, 'b', nid); setIn(N2, [102, 1], 'b', nid); setIn(N2, [102, 10], 'd', ts()); setIn(N2, [102, 11], 'b', ev()); setIn(N2, [102, 14], 'v', ck());
      recs.push(encode(N2));
      const N3 = parse(TPL.n105); set(N3, 1, 'b', nid); setIn(N3, [105, 4], 'b', nid); setIn(N3, [105, 10], 'd', ts()); setIn(N3, [105, 11], 'b', ev()); setIn(N3, [105, 14], 'v', ck());
      recs.push(encode(N3));
      const N4 = parse(TPL.noteb); set(N4, 1, 'b', nid); setIn(N4, [104, 2], 'b', nid); setIn(N4, [104, 10], 'd', ts()); setIn(N4, [104, 11], 'b', ev()); setIn(N4, [104, 15], 'b', ev()); setIn(N4, [104, 18], 'v', ck());
      recs.push(encode(N4));
    }
    // Striche der Seite
    const out = [];
    strokes.forEach((s, si) => {
      const sid = uid(), r = rnd(), r2 = rnd(), c = s.color || [.118, .106, .106, 1];
      const hdr = encode([[1, 'b', sid], [2, 'b', encode([[1, 'v', 2], [2, 'v', r]])], [8, 'v', DEV], [9, 'v', ++seq], [14, 'v', 5381], [16, 'v', 24]]);
      const ord = encode([[1, 'b', encode(si > 0 ? [[1, 'v', si], [2, 'v', r2]] : [[2, 'v', r2]])]]);
      const msg = [[1, 'b', sid], [2, 'b', bv41(strokeBlock(s.pts, s.w))], [4, 'b', encode(c.map((v, i) => [i + 1, 'f', f32(v)]))]];
      if (s.marker) msg.push([5, 'v', 1]);
      msg.push([6, 'b', new Uint8Array(0)], [7, 'b', ord], [9, 'b', new Uint8Array(0)], [15, 'b', encode([[1, 'v', 2], [2, 'v', r]])], [20, 'b', new Uint8Array(0)], [21, 'v', 24]);
      out.push(hdr, encode([[7, 'b', encode(msg)]]));
    });
    noteIds.push(nidS); notes.push(stream(out));
  });
  const LK = parse(TPL.link); setIn(LK, [105, 10], 'd', ts()); setIn(LK, [105, 11], 'b', ev()); setIn(LK, [105, 14], 'v', ck()); recs.push(encode(LK));
  recs.push(TPL.ui);
  const files = [
    { name: 'document.info.pb', data: new Uint8Array(0) },
    { name: 'index.search.pb', data: TPL.search },
    { name: 'index.notes.pb', data: stream(noteIds.map(id => encode([[1, 'b', te.encode(id)], [2, 'b', te.encode('notes/' + id)]]))) },
    { name: 'search/' + ATT_ID, data: stream(pages.map((_, k) => encode([[2, 'v', k + 1], [3, 'b', new Uint8Array(0)]]))) },
    ...noteIds.map((id, i) => ({ name: 'notes/' + id, data: notes[i] })),
    { name: 'index.events.pb', data: stream(recs) },
    { name: 'thumbnail.jpg', data: thumb, noDeflate: true },
    { name: 'index.attachments.pb', data: TPL.attachments },
    { name: 'attachments/' + ATT_ID, data: TPL.pdf, noDeflate: true },
    { name: 'schema.pb', data: TPL.schema },
  ];
  return zip(files);
}
