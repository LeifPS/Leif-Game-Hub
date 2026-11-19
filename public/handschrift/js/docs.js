// Ansicht „Dokumente“
import { h, saveFile, toast, fmtTime } from './util.js';
import { btn, sheet, confirmBox } from './ui.js';
import { dbDel } from './store.js';
import { fileBase } from './exporter.js';

export function docsView(app) {
  const root = h('div', { class: 'scroll' }), wrap = h('div', { class: 'wrap' }); root.append(wrap);
  let q = '';
  function draw() {
    wrap.replaceChildren();
    const imp = h('input', { type: 'file', accept: '.txt,.md,text/plain', class: 'sr', onchange: async () => { const f = imp.files[0]; if (f) { const d = await app.newDoc({ title: f.name.replace(/\.[^.]+$/, ''), text: await f.text() }); app.openDoc(d.id); } imp.value = ''; } });
    wrap.append(h('div', { class: 'row', style: { marginBottom: '14px' } }, h('div', { class: 'sp1' }, h('h1', null, 'Dokumente'), h('p', { class: 'mut sm', style: { margin: 0 } }, 'Alles wird automatisch auf diesem Gerät gespeichert')),
      btn('Textdatei', { icon: 'upload', cls: 'sm', onclick: () => imp.click() }), btn('Neu', { icon: 'plus', cls: 'pri sm', onclick: async () => { const d = await app.newDoc(); app.openDoc(d.id); } }), imp));
    const s = h('input', { type: 'search', placeholder: 'Suchen …', value: q, oninput: () => { q = s.value; list(); } }); wrap.append(s);
    const box = h('div', { class: 'dlist', style: { marginTop: '12px' } }); wrap.append(box);
    function list() {
      const t = q.toLowerCase(), ds = app.docs.filter(d => !t || (d.title + ' ' + d.text).toLowerCase().includes(t));
      box.replaceChildren(...(ds.length ? ds.map(d => h('div', { class: 'it', role: 'button', tabindex: 0, onclick: () => app.openDoc(d.id), onkeydown: (e) => { if (e.key === 'Enter') app.openDoc(d.id); } },
        h('div', { class: 'ti' }, h('b', null, d.title || 'Ohne Titel'), h('span', { class: 'sm mut', style: { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (d.text || '').replace(/\s+/g, ' ').slice(0, 90) || 'Leer'), h('span', { class: 'xs mut' }, fmtTime(d.updated))),
        app.doc && app.doc.id === d.id ? h('span', { class: 'chip ac' }, 'Offen') : null,
        btn('Mehr', { icon: 'more', cls: 'ghost icon sm', onclick: (e) => { e.stopPropagation(); menu(d); } }))) : [h('div', { class: 'empty' }, q ? 'Nichts gefunden.' : 'Noch keine Dokumente.')]));
    }
    list();
  }
  function menu(d) {
    sheet(d.title || 'Dokument', (b, api) => {
      b.append(h('div', { style: { display: 'grid', gap: '8px' } },
        btn('Öffnen', { icon: 'pen', onclick: () => { api.close(); app.openDoc(d.id); } }),
        btn('Duplizieren', { icon: 'copy', onclick: async () => { api.close(); await app.newDoc({ ...d, id: undefined, title: (d.title || 'Dokument') + ' (Kopie)' }); draw(); toast('Dupliziert'); } }),
        btn('Text als Datei speichern', { icon: 'download', onclick: () => { api.close(); saveFile(new Blob([d.text], { type: 'text/plain' }), fileBase(d.title) + '.txt'); } }),
        btn('Löschen', { icon: 'trash', cls: 'danger', onclick: async () => { api.close(); if (await confirmBox(`„${d.title || 'Dokument'}“ wirklich löschen?`)) { await dbDel('docs', d.id); await app.docsChanged(d.id); draw(); } } })));
    });
  }
  draw();
  return { el: root, refresh: draw };
}
