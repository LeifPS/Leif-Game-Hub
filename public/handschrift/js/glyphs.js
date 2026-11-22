// Zeichen einer Schrift ansehen, nachjustieren (höher/tiefer, größer/kleiner, Abstand) und auffällige Zeichen finden
import { h, toast } from './util.js';
import { btn, sheet, confirmBox, ic } from './ui.js';
import { Font, fontText } from './render.js';
import { dbPut } from './store.js';

// Gruppen mit gleicher Höhe: so finden wir Ausreißer
const GRP = [
  ['klein', 'acemnorsuvwxzäöüéèêàâçùûîïëœæ'],
  ['oberlänge', 'bdhklt'],
  ['unterlänge', 'gpqy'],
  ['groß', 'ABCDEFGHIJKLMNOPRSTUVWXYZÄÖÜ'],
  ['ziffer', '0123456789'],
];
const grpOf = (ch) => (GRP.find(([, cs]) => cs.includes(ch)) || [null])[0];
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
// Wirksame Ober-/Unterkante (Schrift-Einheiten, + = nach unten, Grundlinie = 0) inklusive Nachjustierung
const box = (v) => { const a = v.adj || {}, s = a.s || 1, dy = a.dy || 0; return { top: v.oy * s + dy, bot: (v.oy + v.ih) * s + dy, s, dy }; };

/** Auffällige Zeichen: weicht Höhe oder Lage deutlich von den anderen Zeichen derselben Gruppe ab. */
export function checkFont(rec) {
  const stats = {};
  for (const [ch, vs] of Object.entries(rec.g)) { const gname = grpOf(ch); if (!gname) continue; for (const v of vs) { const b = box(v); (stats[gname] ||= { t: [], b: [], hh: [] }); stats[gname].t.push(b.top); stats[gname].b.push(b.bot); stats[gname].hh.push(b.bot - b.top); } }
  const ref = {}; for (const [k, st] of Object.entries(stats)) if (st.t.length >= 4) ref[k] = { t: med(st.t), b: med(st.b), hh: med(st.hh) };
  const out = [], tol = 5.5;   // ~20 % der x-Höhe (27 Einheiten)
  for (const [ch, vs] of Object.entries(rec.g)) {
    const r = ref[grpOf(ch)]; if (!r) continue;
    const bs = vs.map(box), mt = med(bs.map((x) => x.top)), mb = med(bs.map((x) => x.bot));
    vs.forEach((v, i) => {
      const b = bs[i], dt = b.top - r.t, db = b.bot - r.b;   // Unterlängen (Schwünge nach unten) sind erlaubt, sie gehören oft zum Stil
      let why = null;
      if (db < -tol && dt < -tol * .6) why = 'sitzt zu hoch';
      else if (dt > tol && db > tol) why = 'sitzt zu tief';
      else if (dt < -tol * 1.3) why = 'zu groß';
      else if (dt > tol) why = 'zu klein';
      else if (vs.length >= 3 && (Math.abs(b.top - mt) > tol || Math.abs(b.bot - mb) > tol * 1.3)) why = 'anders als die anderen Varianten';
      if (why) out.push({ ch, i, why, fix: { target: r } });
    });
  }
  return out;
}
// Automatisch angleichen: Größe und Lage an den Durchschnitt der Gruppe
function autoFix(v, r) {
  // Ziel: Oberkante und (falls keine Unterlänge) Unterkante wie bei der Gruppe
  const a = v.adj || {}, b0 = box({ ...v, adj: {} }), hasDesc = b0.bot > r.b + 5.5;
  let s = 1, dy;
  if (hasDesc) { dy = r.t - b0.top; }   // nur verschieben, Größe bleibt
  else { s = Math.max(.6, Math.min(1.6, (r.b - r.t) / (b0.bot - b0.top))); dy = r.b - b0.bot * s; }
  v.adj = { ...a, s: +s.toFixed(3), dy: +dy.toFixed(2) }; if (v.adj.s === 1) delete v.adj.s;
}

export function openGlyphs(app, rec) {
  const editable = !rec.builtin;
  let flags = checkFont(rec), only = false, saveT = 0;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(async () => { rec.updated = Date.now(); const r = { ...rec }; delete r.builtin; for (const k of Object.keys(r.g)) for (const v of r.g[k]) delete v.img; await dbPut('fonts', r); app.fontCache.delete(rec.id); app.refreshFontLabel(); }, 400); };
  sheet(`Zeichen von „${rec.name.replace(/\s*\(Beispiel\)$/, '')}“`, (b, api) => {
    const body = h('div'); b.append(body);
    const list = () => {
      flags = checkFont(rec);
      const fl = new Map(flags.map((f) => [f.ch + '|' + f.i, f]));
      const tiles = [];
      for (const ch of Object.keys(rec.g).sort((a, c) => a.localeCompare(c, 'de'))) rec.g[ch].forEach((v, i) => {
        const f = fl.get(ch + '|' + i); if (only && !f) return;
        const im = new Image(); im.src = v.src; im.alt = ch;
        tiles.push(h('button', { type: 'button', class: 'gtile' + (f ? ' bad' : '') + (v.adj ? ' adj' : ''), title: f ? `${ch}: ${f.why}` : ch, onclick: () => detail(ch, i) }, h('i', null, ch), im, f ? h('b', null, f.why) : null));
      });
      body.replaceChildren(
        h('div', { class: 'gsum' + (flags.length ? ' warn' : ' ok') }, ic(flags.length ? 'alert' : 'check'),
          h('div', { class: 'sp1' }, h('b', null, flags.length ? `${flags.length} ${flags.length === 1 ? 'Zeichen fällt' : 'Zeichen fallen'} aus der Reihe` : 'Alle Zeichen passen gut zusammen'),
            h('span', { class: 'xs mut' }, flags.length ? 'Zu groß, zu klein oder zu hoch/tief im Vergleich zu den anderen. Antippen zum Anpassen.' : 'Größe und Lage sind gleichmäßig.')),
          flags.length && editable ? btn('Alle angleichen', { cls: 'sm', onclick: () => { for (const f of flags) autoFix(rec.g[f.ch][f.i], f.fix.target); persist(); list(); toast('Angeglichen – prüf das Ergebnis im Text'); } }) : null),
        flags.length ? h('div', { class: 'chips', style: { margin: '10px 0' } }, h('button', { type: 'button', class: 'tg' + (only ? '' : ' on'), onclick: () => { only = false; list(); } }, 'Alle'), h('button', { type: 'button', class: 'tg' + (only ? ' on' : ''), onclick: () => { only = true; list(); } }, `Nur auffällige (${flags.length})`)) : null,
        h('div', { class: 'ggrid' }, ...tiles),
        h('p', { class: 'xs mut', style: { marginTop: '12px' } }, editable ? 'Tippe ein Zeichen an, um es höher, tiefer, größer oder kleiner zu machen.' : 'Die Beispielschrift kann man nicht verändern. In deiner eigenen Schrift kannst du jedes Zeichen nachjustieren.'));
    };
    const detail = async (ch, i) => {
      const v = rec.g[ch][i], prev = h('div', { class: 'gprev' }), f = flags.find((x) => x.ch === ch && x.i === i);
      const ctx = /[A-ZÄÖÜ0-9]/.test(ch) ? `H${ch}n ${ch}a` : `n${ch}n h${ch}x`;
      const paint = async () => { try { const g = { ...rec.g, [ch]: [v] }, fo = new Font({ ...rec, g }); await fo.load(); prev.replaceChildren(await fontText(fo, ctx, { size: 44, seed: 5 })); } catch (e) { prev.replaceChildren(h('span', { class: 'mut sm' }, 'Vorschau nicht möglich')); } };
      const a = () => (v.adj ||= {});
      const ch_ = (fn) => () => { fn(a()); if (!v.adj.s || v.adj.s === 1) delete v.adj.s; if (!v.adj.dy) delete v.adj.dy; if (!v.adj.sp) delete v.adj.sp; if (!Object.keys(v.adj).length) delete v.adj; persist(); paint(); vals(); };
      const val = h('p', { class: 'xs mut', style: { textAlign: 'center', margin: '6px 0 0' } });
      const vals = () => { const x = v.adj || {}; val.textContent = `Größe ${Math.round((x.s || 1) * 100)} % · Lage ${x.dy ? (x.dy > 0 ? '+' : '') + x.dy.toFixed(1) : '0'} · Abstand ${x.sp ? (x.sp > 0 ? '+' : '') + x.sp.toFixed(1) : '0'}`; };
      const pair = (l1, i1, f1, l2, i2, f2) => h('div', { class: 'gpair' }, btn(l1, { icon: i1, cls: 'sm', onclick: ch_(f1), disabled: !editable }), btn(l2, { icon: i2, cls: 'sm', onclick: ch_(f2), disabled: !editable }));
      body.replaceChildren(
        h('button', { type: 'button', class: 'crumb', onclick: list }, '‹ Alle Zeichen'),
        h('div', { class: 'gdet' }, h('div', { class: 'ghead' }, h('b', null, `„${ch}“`), h('span', { class: 'xs mut' }, `Variante ${i + 1} von ${rec.g[ch].length}`), f ? h('span', { class: 'chip warn' }, f.why) : null), prev, val,
          pair('Höher', 'cl', (x) => { x.dy = +((x.dy || 0) - 1).toFixed(2); }, 'Tiefer', 'cr', (x) => { x.dy = +((x.dy || 0) + 1).toFixed(2); }),
          pair('Kleiner', 'x', (x) => { x.s = +((x.s || 1) * .95).toFixed(3); }, 'Größer', 'plus', (x) => { x.s = +((x.s || 1) * 1.05).toFixed(3); }),
          pair('Enger', 'cl', (x) => { x.sp = +((x.sp || 0) - 1).toFixed(2); }, 'Weiter', 'cr', (x) => { x.sp = +((x.sp || 0) + 1).toFixed(2); }),
          h('div', { class: 'gpair' },
            f && editable ? btn('Automatisch angleichen', { icon: 'wand', cls: 'sm pri', onclick: () => { autoFix(v, f.fix.target); persist(); paint(); vals(); } }) : null,
            btn('Zurücksetzen', { icon: 'refresh', cls: 'sm', disabled: !editable || !v.adj, onclick: ch_((x) => { delete x.s; delete x.dy; delete x.sp; }) })),
          editable && rec.g[ch].length > 1 ? btn('Diese Variante löschen', { icon: 'trash', cls: 'sm ghost danger', onclick: async () => { if (!(await confirmBox(`Variante ${i + 1} von „${ch}“ löschen?`))) return; rec.g[ch].splice(i, 1); persist(); list(); } }) : null));
      // Pfeile in den Knöpfen passend drehen (hoch/runter)
      body.querySelectorAll('.gpair')[0]?.querySelectorAll('svg').forEach((s, k) => { s.style.transform = 'rotate(90deg)'; });
      vals(); paint();
    };
    list();
  }, { wide: true });
}
