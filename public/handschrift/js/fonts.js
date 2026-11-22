// Ansicht „Schriften“: Liste, Verwenden, Umbenennen, Erweitern, Export/Import, Zeichen ansehen
import { h, saveFile, toast } from './util.js';
import { btn, sheet, confirmBox, promptBox } from './ui.js';
import { fontText } from './render.js';
import { openWizard } from './wizard.js';
import { openTopUp } from './extra.js';
import { PACKS, PACK_BY_ID } from './packs.js';
import { dbPut, dbDel, fontToFile, fontFromFile, countGlyphs } from './store.js';
import { fileBase } from './exporter.js';

export function fontsView(app) {
  const root = h('div', { class: 'scroll' }), wrap = h('div', { class: 'wrap' }); root.append(wrap);
  async function draw() {
    wrap.replaceChildren();
    const imp = h('input', { type: 'file', accept: '.hsfont,application/json', class: 'sr', onchange: async () => { try { const rec = await fontFromFile(imp.files[0]); await dbPut('fonts', rec); await app.fontSaved(rec); toast(`„${rec.name}“ importiert`); } catch (e) { toast(e.message, 5000, 'err'); } imp.value = ''; } });
    wrap.append(h('div', { class: 'row phead' }, h('div', { class: 'sp1' }, h('h1', null, 'Schriften'), h('p', { class: 'mut sm' }, `${app.fonts.length} ${app.fonts.length === 1 ? 'Schrift' : 'Schriften'}`)),
      btn('Schrift importieren', { icon: 'upload', cls: 'icon', title: 'Schrift importieren (.hsfont)', onclick: () => imp.click() }),
      btn('Neue Schrift', { icon: 'plus', cls: 'pri icon', title: 'Neue Schrift erstellen', onclick: () => openWizard(app) }), imp));
    const grid = h('div', { class: 'fgrid' }); wrap.append(grid);
    const ib = (label, icon, onclick, cls = '') => btn(label, { icon, cls: 'icon sm ' + cls, title: label, onclick: (e) => { e.stopPropagation(); onclick(); } });
    for (const f of app.fonts) {
      const isOn = app.fontId === f.id, chars = Object.keys(f.g).length;
      const shown = f.builtin ? f.name.replace(/\s*\(Beispiel\)\s*$/, '') : f.name;
      const nameBox = h('div', { class: 'fname', 'aria-label': shown }, h('span', { class: 'sk', style: { display: 'block', width: '60%', height: '30px' } }));
      const sampBox = h('div', { class: 'fsamp' });
      app.getFont(f.id).then(async (fo) => {
        nameBox.replaceChildren(await fontText(fo, shown, { size: 40, seed: 7 }));
        sampBox.replaceChildren(await fontText(fo, 'Franz jagt im Taxi quer durch Bayern 123', { size: 24, seed: 11 }));
      }).catch(() => { nameBox.replaceChildren(h('b', null, shown)); });
      const packs = (f.packs || []).map((id) => PACK_BY_ID[id] ? PACK_BY_ID[id].name : id);
      const card = h('div', { class: 'fcard2' + (isOn ? ' on' : ''), role: 'button', tabindex: 0, title: isOn ? 'Wird benutzt' : 'Antippen zum Verwenden',
        onclick: () => { if (isOn) return; app.setFont(f.id); toast(`„${shown}“ wird jetzt benutzt`); draw(); }, onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); } },
        h('div', { class: 'ftop' }, nameBox, isOn ? h('span', { class: 'fon', title: 'Wird benutzt' }, '✓') : null),
        sampBox,
        h('div', { class: 'fmeta' }, h('span', null, `${chars} Zeichen`, packs.length ? ' · ' + packs.join(', ') : ''), f.builtin ? h('span', { class: 'chip ac' }, 'Beispiel') : null),
        h('div', { class: 'facts' },
          f.builtin ? ib('Eigene Schrift mit denselben Paketen erstellen', 'plus', () => openWizard(app, { font: null, preselect: ['standard', 'sonder'] })) : ib('Ergänzen: fehlende Zeichen, Varianten, Pakete', 'plus', () => openTopUp(app, f)),
          ib('Zeichen ansehen', 'eye', () => showGlyphs(f)),
          f.builtin ? null : ib('Umbenennen', 'edit', async () => { const nm = await promptBox('Name der Schrift', f.name); if (nm) { f.name = nm; await dbPut('fonts', stripped(f)); draw(); app.refreshFontLabel(); } }),
          f.builtin ? null : ib('Exportieren (.hsfont)', 'download', () => saveFile(fontToFile(f), `${fileBase(f.name)}.hsfont`)),
          h('span', { class: 'sp1' }),
          f.builtin ? null : ib('Löschen', 'trash', async () => { if (await confirmBox(`„${f.name}“ wirklich löschen? Das lässt sich nicht rückgängig machen. Sichere sie vorher, wenn du sie behalten willst.`)) { await dbDel('fonts', f.id); await app.fontsChanged(); draw(); } }, 'danger')));
      grid.append(card);
    }
    grid.append(h('button', { type: 'button', class: 'fnew', onclick: () => openWizard(app) }, h('span', { class: 'fplus' }, '+'), h('b', null, 'Neue Schrift'), h('span', { class: 'xs mut' }, 'Zeichen auf einen Bogen schreiben oder direkt hier zeichnen')));
  }
  const stripped = (f) => { const r = { ...f }; delete r.builtin; return r; };
  function showGlyphs(f) {
    sheet(f.name, (b) => {
      const have = new Set(Object.keys(f.g));
      for (const p of PACKS) {
        const chars = [...new Set(p.groups.flatMap(g => [...g.c]))]; if (!chars.some(c => have.has(c)) && !(f.packs || []).includes(p.id)) continue;
        b.append(h('h3', { style: { margin: '12px 0 4px' } }, p.name), h('div', { class: 'pal' }, ...chars.slice(0, 400).map(c => h('button', { type: 'button', class: have.has(c) ? '' : 'no', title: have.has(c) ? 'vorhanden' : 'fehlt', style: { cursor: 'default' } }, c))));
      }
      const other = [...have].filter(c => !PACKS.some(p => p.groups.some(g => g.c.includes(c))));
      if (other.length) b.append(h('h3', { style: { margin: '12px 0 4px' } }, 'Weitere'), h('div', { class: 'pal' }, ...other.map(c => h('button', { type: 'button', style: { cursor: 'default' } }, c))));
      b.append(h('p', { class: 'xs mut' }, 'Ausgegraute Zeichen fehlen in dieser Schrift. Fehlende Akzentbuchstaben setzt die App aus Buchstabe und Akzent zusammen.'));
    }, { wide: true });
  }
  draw();
  return { el: root, refresh: draw };
}
