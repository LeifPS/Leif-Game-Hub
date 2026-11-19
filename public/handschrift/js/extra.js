// Schrift nachträglich ergänzen: fehlende Zeichen und weitere Varianten direkt in der App zeichnen
import { h, toast } from './util.js';
import { btn, sheet } from './ui.js';
import { PACKS } from './packs.js';
import { dbPut } from './store.js';
import { openDraw } from './draw.js';

const INFO = new Map();   // Zeichen -> { pack, grp, n }
const clean = (t) => [...new Set([...(t || '').normalize('NFC')].filter(c => !/\s/.test(c)))];
function info() {
  if (!INFO.size) for (const p of PACKS) for (const g of p.groups) for (const ch of [...g.c]) if (!INFO.has(ch)) INFO.set(ch, { pack: p.id, grp: g.name, n: g.n });
  return INFO;
}

// Was fehlt in dieser Schrift? Zeichen aus den Paketen, die sie schon hat (und eigene Zeichen), die es noch nicht gibt.
export function missingOf(font) {
  const have = new Set(Object.keys(font.g)), out = [], seen = new Set();
  for (const p of PACKS) if ((font.packs || []).includes(p.id)) for (const g of p.groups) for (const ch of [...g.c]) if (!have.has(ch) && !seen.has(ch)) { seen.add(ch); out.push(ch); }
  for (const ch of font.custom && font.custom.chars ? [...font.custom.chars] : []) if (!have.has(ch) && !seen.has(ch)) { seen.add(ch); out.push(ch); }
  return out;
}

export function openTopUp(app, font, { chars = '' } = {}) {
  const inf = info(), count = (ch) => (font.g[ch] || []).length;
  const cellOf = (ch, v) => { const i = inf.get(ch) || { pack: 'eigen', grp: 'Eigene Zeichen', n: 1 }; return { ch, v, pack: i.pack, grp: i.grp }; };
  // Gruppen, aus denen es schon Zeichen gibt
  const groups = [];
  for (const p of PACKS) for (const g of p.groups) { const cs = [...new Set([...g.c])].filter(c => count(c) && inf.get(c).grp === g.name); if (cs.length) groups.push({ name: g.name, chars: cs }); }
  const S = { extra: chars ? 3 : 1, sel: new Set(), txt: chars };
  const missing = missingOf(font);

  function start(cells, label) {
    if (!cells.length) { toast('Es ist nichts ausgewählt.', 2600, 'err'); return; }
    api.close();
    openDraw({
      cells, extra: true,
      onClose: () => openTopUp(app, font, { chars: S.txt }),
      onDone: async (out) => {
        const g = { ...font.g }, add = {};
        for (const { ch, d } of out) (add[ch] ||= []).push(d);
        for (const ch of Object.keys(add)) g[ch] = [...(g[ch] || []), ...add[ch]];
        const rec = { ...font, g, updated: Date.now() }; delete rec.builtin;
        for (const k of Object.keys(rec.g)) for (const v of rec.g[k]) delete v.img;
        try { await dbPut('fonts', rec); toast(`${out.length} neue ${out.length === 1 ? 'Zeichen-Bild' : 'Zeichen-Bilder'} in „${rec.name}“ gespeichert`, 3400); await app.fontSaved(rec); }
        catch (e) { toast('Speichern fehlgeschlagen: ' + e.message, 5000, 'err'); }
      },
    });
  }

  const api = sheet(`„${font.name}“ ergänzen`, (b) => {
    const body = h('div');
    const draw = () => {
      body.replaceChildren();
      // 1. Fehlende Zeichen
      if (missing.length) {
        const cells = [];
        const maxN = Math.max(...missing.map(c => Math.min(3, (inf.get(c) || { n: 1 }).n)));
        for (let v = 0; v < maxN; v++) for (const ch of missing) if (v < Math.min(3, (inf.get(ch) || { n: 1 }).n)) cells.push(cellOf(ch, v));
        body.append(h('h3', { style: { margin: '4px 0 6px' } }, 'Fehlende Zeichen'),
          h('p', { class: 'sm mut', style: { margin: '0 0 8px' } }, 'Diese Zeichen gehören zu deinen Paketen, sind aber noch nicht gezeichnet:'),
          h('div', { class: 'pal' }, ...missing.slice(0, 120).map(c => h('button', { type: 'button', style: { cursor: 'default' } }, c))),
          missing.length > 120 ? h('p', { class: 'xs mut' }, `… und ${missing.length - 120} weitere`) : null,
          btn(`Fehlende zeichnen (${missing.length} Zeichen)`, { cls: 'pri', onclick: () => start(cells) }));
      }
      // 2. Weitere Varianten (oder neue Zeichen) – Auswahl nach Gruppen und eigene Zeichen
      const typed = clean(S.txt), chosen = [];
      for (const g of groups) if (S.sel.has(g.name)) for (const c of g.chars) if (!chosen.includes(c)) chosen.push(c);
      for (const c of typed) if (!chosen.includes(c)) chosen.push(c);
      const cells = []; for (let r = 0; r < S.extra; r++) for (const ch of chosen) cells.push(cellOf(ch, count(ch) + r));
      const ta = h('textarea', { class: 'f', rows: 2, placeholder: 'z. B. a e n  oder ein neues Zeichen wie ✿', value: S.txt, oninput: () => { S.txt = ta.value; refreshBtn(); } }); ta.value = S.txt;
      const startBtn = btn('', { cls: 'pri', onclick: () => start(cells) });
      const refreshBtn = () => {   // nur die Zahl am Knopf aktualisieren, damit das Textfeld beim Tippen nicht neu gebaut wird
        const t = clean(S.txt), ch2 = []; for (const g of groups) if (S.sel.has(g.name)) for (const c of g.chars) if (!ch2.includes(c)) ch2.push(c); for (const c of t) if (!ch2.includes(c)) ch2.push(c);
        cells.length = 0; for (let r = 0; r < S.extra; r++) for (const ch of ch2) cells.push(cellOf(ch, count(ch) + r));
        startBtn.textContent = cells.length ? `${cells.length} ${cells.length === 1 ? 'Zeichen' : 'Zeichen'} zeichnen` : 'Zeichen auswählen'; startBtn.disabled = !cells.length;
      };
      body.append(h('h3', { style: { margin: '20px 0 6px' } }, 'Weitere Varianten zeichnen'),
        h('p', { class: 'sm mut', style: { margin: '0 0 8px' } }, 'Mehr Varianten pro Zeichen lassen die Schrift natürlicher wirken, weil sich gleiche Buchstaben nicht so oft wiederholen. Die neuen Varianten kommen zu den vorhandenen dazu.'),
        h('div', { class: 'row', style: { marginBottom: '10px' } }, h('span', { class: 'sm' }, 'Neue Varianten pro Zeichen:'),
          h('div', { class: 'seg' }, ...[1, 2, 3, 4].map(n => h('button', { type: 'button', class: S.extra === n ? 'on' : '', onclick: () => { S.extra = n; draw(); } }, String(n))))),
        h('div', { class: 'chips', style: { marginBottom: '10px' } }, ...groups.map(g => {
          const mn = Math.min(...g.chars.map(count)), mx = Math.max(...g.chars.map(count));
          return h('button', { type: 'button', class: 'tg' + (S.sel.has(g.name) ? ' on' : ''), title: `${mn === mx ? mn : mn + ' bis ' + mx} Varianten je Zeichen`, onclick: () => { S.sel.has(g.name) ? S.sel.delete(g.name) : S.sel.add(g.name); draw(); } },
            `${g.name} · ${g.chars.length} (${mn === mx ? mn : mn + '–' + mx}×)`);
        })),
        h('label', { class: 'f' }, 'Bestimmte Zeichen (auch ganz neue)'), ta, h('div', { style: { marginTop: '12px' } }, startBtn));
      refreshBtn();
      // 3. Ganze Pakete
      body.append(h('h3', { style: { margin: '22px 0 6px' } }, 'Ganzes Paket hinzufügen'), h('p', { class: 'sm mut', style: { margin: '0 0 8px' } }, 'Mathe, Griechisch, Akzente, Kana und mehr, direkt zeichnen oder als Bogen ausfüllen.'),
        btn('Pakete wählen …', { cls: 'sm', onclick: async () => { api.close(); const { openWizard } = await import('./wizard.js'); openWizard(app, { font }); } }));
    };
    b.append(body); draw();
  }, { wide: true });
  return api;
}
