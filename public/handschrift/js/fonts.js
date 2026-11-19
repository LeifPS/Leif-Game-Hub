// Ansicht „Schriften“: Liste, Verwenden, Umbenennen, Erweitern, Export/Import, Zeichen ansehen
import { h, saveFile, toast, fmtDate } from './util.js';
import { ic, btn, sheet, confirmBox, promptBox } from './ui.js';
import { samplePreview } from './render.js';
import { openWizard } from './wizard.js';
import { PACKS, PACK_BY_ID } from './packs.js';
import { dbPut, dbDel, fontToFile, fontFromFile, countGlyphs } from './store.js';
import { fileBase } from './exporter.js';

export function fontsView(app) {
  const root = h('div', { class: 'scroll' }), wrap = h('div', { class: 'wrap' }); root.append(wrap);
  async function draw() {
    wrap.replaceChildren();
    const imp = h('input', { type: 'file', accept: '.hsfont,application/json', class: 'sr', onchange: async () => { try { const rec = await fontFromFile(imp.files[0]); await dbPut('fonts', rec); await app.fontSaved(rec); toast(`„${rec.name}“ importiert`); } catch (e) { toast(e.message, 5000, 'err'); } imp.value = ''; } });
    wrap.append(h('div', { class: 'row', style: { marginBottom: '14px' } }, h('div', { class: 'sp1' }, h('h1', null, 'Schriften'), h('p', { class: 'mut sm', style: { margin: 0 } }, 'Deine Handschriften, alles bleibt auf diesem Gerät')),
      btn('Importieren', { icon: 'upload', cls: 'sm', onclick: () => imp.click() }), imp));
    wrap.append(h('div', { class: 'hero' }, h('h1', null, 'Schreib in deiner eigenen Handschrift'), h('p', null, 'Wähle die Zeichen, die du brauchst, schreib sie einmal auf einen Bogen und lade ihn hoch. Danach wird jeder Text so, als hättest du ihn selbst geschrieben.'), btn('Neue Schrift erstellen', { icon: 'plus', onclick: () => openWizard(app) })));
    for (const f of app.fonts) {
      const prev = h('div', { class: 'fprev' }), isOn = app.fontId === f.id, n = countGlyphs(f.g), chars = Object.keys(f.g).length;
      app.getFont(f.id).then(fo => samplePreview(fo)).then(c => prev.append(c)).catch(() => {});
      const chipsEl = h('div', { class: 'row wrap2', style: { gap: '6px', marginTop: '6px' } }, h('span', { class: 'chip' }, `${chars} Zeichen`), ...(f.packs || []).slice(0, 5).map(id => h('span', { class: 'chip' }, PACK_BY_ID[id] ? PACK_BY_ID[id].name : id)), f.builtin ? h('span', { class: 'chip ac' }, 'Beispiel') : null);
      wrap.append(h('div', { class: 'card' },
        h('div', { class: 'fcard' }, prev, h('div', { class: 'sp1', style: { minWidth: 0 } }, h('b', null, f.name), isOn ? h('span', { class: 'chip ok', style: { marginLeft: '8px' } }, 'In Benutzung') : null, chipsEl, f.updated ? h('div', { class: 'xs mut', style: { marginTop: '4px' } }, `${n} Bilder · ${fmtDate(f.updated)}`) : null)),
        h('div', { class: 'row wrap2', style: { marginTop: '12px', gap: '8px' } },
          btn(isOn ? 'Aktiv' : 'Verwenden', { cls: 'sm' + (isOn ? '' : ' pri'), disabled: isOn, onclick: () => { app.setFont(f.id); toast(`„${f.name}“ wird jetzt benutzt`); draw(); } }),
          btn('Erweitern', { icon: 'plus', cls: 'sm', onclick: () => openWizard(app, { font: f.builtin ? null : f, preselect: f.builtin ? ['standard', 'sonder'] : [] }), title: f.builtin ? 'Eigene Schrift mit denselben Paketen erstellen' : 'Pakete hinzufügen' }),
          btn('Zeichen', { icon: 'eye', cls: 'sm', onclick: () => showGlyphs(f) }),
          f.builtin ? null : btn('Umbenennen', { icon: 'edit', cls: 'sm', onclick: async () => { const nm = await promptBox('Name der Schrift', f.name); if (nm) { f.name = nm; await dbPut('fonts', stripped(f)); draw(); app.refreshFontLabel(); } } }),
          f.builtin ? null : btn('Exportieren', { icon: 'download', cls: 'sm', onclick: () => saveFile(fontToFile(f), `${fileBase(f.name)}.hsfont`) }),
          f.builtin ? null : btn('Löschen', { icon: 'trash', cls: 'sm danger', onclick: async () => { if (await confirmBox(`„${f.name}“ wirklich löschen? Das lässt sich nicht rückgängig machen. Exportiere die Schrift vorher, wenn du sie behalten willst.`)) { await dbDel('fonts', f.id); await app.fontsChanged(); draw(); } } }))));
    }
    wrap.append(h('div', { class: 'note' }, h('b', null, 'Tipp: '), 'Exportiere deine Schrift als Datei (.hsfont). So kannst du sie auf einem anderen Gerät importieren oder sichern.'));
  }
  const stripped = (f) => { const { builtin, ...r } = f; void builtin; return r; };
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
