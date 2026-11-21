// Ansicht „Dokumente“ (Startseite): Blätter als Kacheln mit Vorschau der ersten Seite, sortier- und durchsuchbar
import { h, saveFile, toast, fmtTime } from './util.js';
import { btn, sheet, confirmBox, promptBox, chips } from './ui.js';
import { dbDel, dbPut, kvGet, kvSet } from './store.js';
import { fileBase } from './exporter.js';
import { layout, drawPage, ensureImages } from './render.js';
import { openTemplates } from './vorlagen.js';

const SORTS = [['recent', 'Zuletzt benutzt'], ['created', 'Zuletzt erstellt'], ['name', 'Name A–Z'], ['custom', 'Eigene Reihenfolge']];
const used = (d) => Math.max(d.opened || 0, d.updated || 0, d.created || 0);

export function docsView(app) {
  const root = h('div', { class: 'scroll' }), wrap = h('div', { class: 'wrap wide' }); root.append(wrap);
  let q = '', sort = 'recent', order = [], loaded = false;
  const thumbs = new Map();   // Vorschau je Dokument (bis zur nächsten Änderung gemerkt)

  // ---------- Vorschau der ersten Seite (nacheinander, nur sichtbare Kacheln) ----------
  let chain = Promise.resolve();
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); chain = chain.then(() => paintThumb(e.target)).catch(() => {}); } }, { rootMargin: '300px' });
  async function paintThumb(box) {
    const d = app.docs.find(x => x.id === box.dataset.id); if (!d || !box.isConnected) return;
    const key = d.id + ':' + d.updated + ':' + (d.fontId || '') + ':' + JSON.stringify(d.s || {}).length;
    let cv = thumbs.get(d.id);
    if (!cv || cv.key !== key) {
      const font = await app.getFont(d.fontId || app.fontId), txt = (d.text || '').slice(0, 2500);
      await font.prepare(txt + ' •');
      const L = layout(txt, d.s, font), ent = L.pages[0] || [];
      await ensureImages(ent);
      cv = document.createElement('canvas'); cv.key = key; cv.style.cssText = 'width:100%;height:100%;display:block';
      drawPage(cv, ent, L, d.s, .4, false); thumbs.set(d.id, cv);
    }
    if (box.isConnected) box.replaceChildren(cv);
  }

  // ---------- Reihenfolge ----------
  const sorted = () => {
    const ds = [...app.docs];
    if (sort === 'name') return ds.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de', { sensitivity: 'base', numeric: true }));
    if (sort === 'created') return ds.sort((a, b) => (b.created || 0) - (a.created || 0));
    if (sort === 'custom') { const pos = new Map(order.map((id, i) => [id, i])); return ds.sort((a, b) => (pos.has(a.id) ? pos.get(a.id) : 1e9 - (a.updated || 0) / 1e3) - (pos.has(b.id) ? pos.get(b.id) : 1e9 - (b.updated || 0) / 1e3)); }
    return ds.sort((a, b) => used(b) - used(a));
  };
  const saveOrder = (ids) => { order = ids; kvSet('docOrder', ids); };

  async function init() { sort = await kvGet('docSort', 'recent'); order = await kvGet('docOrder', []); loaded = true; draw(); }

  function draw() {
    if (!loaded) return;
    wrap.replaceChildren();
    const imp = h('input', { type: 'file', accept: '.txt,.md,.markdown,.hdf,text/plain', multiple: true, class: 'sr', onchange: async () => { let last; for (const f of imp.files) last = await app.newDoc({ title: f.name.replace(/\.[^.]+$/, ''), text: await f.text() }); imp.value = ''; if (last) { toast('Hochgeladen'); draw(); } } });
    wrap.append(h('div', { class: 'row', style: { marginBottom: '12px' } }, h('div', { class: 'sp1' }, h('h1', { style: { margin: 0 } }, 'Dokumente'), h('p', { class: 'mut sm', style: { margin: '2px 0 0' } }, `${app.docs.length} ${app.docs.length === 1 ? 'Dokument' : 'Dokumente'} · alles wird auf diesem Gerät gespeichert`)),
      btn('Textdatei hochladen', { icon: 'upload', cls: 'icon', onclick: () => imp.click(), title: 'Textdateien (.txt, .md) hochladen' }), btn('Vorlagen', { icon: 'grid', cls: 'icon', onclick: () => openTemplates(app), title: 'Vorlagen' }), btn('Neues Dokument', { icon: 'plus', cls: 'pri icon', onclick: async () => { const d = await app.newDoc(); app.openDoc(d.id); }, title: 'Neues Dokument' }), imp));
    const s = h('input', { type: 'search', placeholder: 'Dokumente durchsuchen …', value: q, 'aria-label': 'Dokumente durchsuchen', oninput: () => { q = s.value; grid(); } });
    wrap.append(s, h('div', { style: { margin: '10px 0 4px', overflowX: 'auto' } }, chips(SORTS, () => sort, (v) => { sort = v; kvSet('docSort', v); grid(); hint(); })));
    const hintEl = h('p', { class: 'xs mut', style: { margin: '2px 2px 8px' } }); wrap.append(hintEl);
    const hint = () => { hintEl.textContent = sort === 'custom' ? 'Zum Sortieren eine Kachel gedrückt halten und verschieben.' : ''; hintEl.hidden = sort !== 'custom'; }; hint();
    const box = h('div', { class: 'dgrid' }); wrap.append(box);
    function grid() {
      const t = q.trim().toLowerCase(), ds = sorted().filter(d => !t || ((d.title || '') + ' ' + (d.text || '')).toLowerCase().includes(t));
      box.replaceChildren(...(ds.length ? ds.map(card) : [h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, q ? 'Nichts gefunden.' : 'Noch keine Dokumente. Tippe oben auf + für ein neues.')]));
    }
    grid();
    // ---- Kachel ----
    function card(d) {
      const ratio = (d.s && d.s.fmt === 'gn') || (d.s && /^gn/.test(d.s.paper || '')) ? '948 / 1226' : '1240 / 1754';
      const prev = h('div', { class: 'dprev', dataset: { id: d.id }, style: { aspectRatio: ratio } });
      const cached = thumbs.get(d.id); if (cached) prev.append(cached); else { prev.append(h('span', { class: 'dtxt' }, (d.text || '').replace(/\s+/g, ' ').slice(0, 80))); io.observe(prev); }
      const el = h('div', { class: 'dcard', role: 'button', tabindex: 0, dataset: { id: d.id }, onkeydown: (e) => { if (e.key === 'Enter') app.openDoc(d.id); } }, prev,
        h('div', { class: 'dtitle' }, h('b', null, d.title || 'Ohne Titel'), btn('Mehr', { icon: 'more', cls: 'ghost icon sm', onclick: (e) => { e.stopPropagation(); menu(d); } })),
        h('span', { class: 'xs mut' }, fmtTime(used(d))));
      let timer = 0, drag = false, moved = false;
      el.addEventListener('click', () => { if (moved) { moved = false; return; } app.openDoc(d.id); });
      // Eigene Reihenfolge: gedrückt halten, dann verschieben (Listener am document, weil das Verschieben im DOM den Pointer-Capture löst)
      const onMove = (e) => {
        if (!drag) return; e.preventDefault(); moved = true;
        el.style.pointerEvents = 'none'; const under = document.elementFromPoint(e.clientX, e.clientY); el.style.pointerEvents = '';
        const other = under && under.closest('.dcard'); if (!other || other === el || !box.contains(other)) return;
        const r = other.getBoundingClientRect(), after = e.clientX > r.left + r.width / 2;
        box.insertBefore(el, after ? other.nextSibling : other);
      };
      const tm = (ev) => { if (drag && ev.cancelable) ev.preventDefault(); };   // beim Verschieben nicht scrollen (Touch)
      const stop = () => {
        clearTimeout(timer); document.removeEventListener('touchmove', tm); document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', stop); document.removeEventListener('pointercancel', stop);
        if (!drag) return; drag = false; el.classList.remove('drag'); saveOrder([...box.querySelectorAll('.dcard')].map(c => c.dataset.id)); setTimeout(() => { moved = false; }, 60);
      };
      el.addEventListener('pointerdown', (e) => {
        if (sort !== 'custom' || e.target.closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const x0 = e.clientX, y0 = e.clientY;
        const early = (ev) => { if (!drag && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 10) stop(); };
        timer = setTimeout(() => { drag = true; el.classList.add('drag'); navigator.vibrate && navigator.vibrate(12); }, 380);
        document.addEventListener('pointermove', early); document.addEventListener('pointermove', onMove, { passive: false }); document.addEventListener('touchmove', tm, { passive: false });
        const done = () => { document.removeEventListener('pointermove', early); stop(); };
        document.addEventListener('pointerup', done, { once: true }); document.addEventListener('pointercancel', done, { once: true });
        document.addEventListener('pointerup', stop); document.addEventListener('pointercancel', stop);
      });
      el.addEventListener('contextmenu', (e) => { if (sort === 'custom') e.preventDefault(); });
      return el;
    }
  }

  function menu(d) {
    sheet(d.title || 'Dokument', (b, api) => {
      const move = (dir) => async () => { api.close(); const ids = sorted().map(x => x.id), i = ids.indexOf(d.id), j = dir < 0 ? 0 : ids.length - 1; ids.splice(i, 1); ids.splice(j, 0, d.id); saveOrder(ids); sort = 'custom'; kvSet('docSort', 'custom'); draw(); };
      b.append(h('div', { style: { display: 'grid', gap: '8px' } },
        btn('Öffnen', { icon: 'pen', onclick: () => { api.close(); app.openDoc(d.id); } }),
        btn('Umbenennen', { icon: 'edit', onclick: async () => { api.close(); const nm = await promptBox('Name des Dokuments', d.title || ''); if (nm) { d.title = nm; d.autoT = false; d.updated = Date.now(); await dbPut('docs', d); app.docSaved(d); draw(); } } }),
        btn('Duplizieren', { icon: 'copy', onclick: async () => { api.close(); await app.newDoc({ ...d, id: undefined, title: (d.title || 'Dokument') + ' (Kopie)', created: Date.now(), updated: Date.now(), opened: 0 }); draw(); toast('Dupliziert'); } }),
        btn('An den Anfang', { icon: 'cl', onclick: move(-1) }), btn('Ans Ende', { icon: 'cr', onclick: move(1) }),
        btn('Text als Datei speichern', { icon: 'download', onclick: () => { api.close(); saveFile(new Blob([d.text], { type: 'text/plain' }), fileBase(d.title) + '.txt'); } }),
        btn('Löschen', { icon: 'trash', cls: 'danger', onclick: async () => { api.close(); if (await confirmBox(`„${d.title || 'Dokument'}“ wirklich löschen?`)) { await dbDel('docs', d.id); thumbs.delete(d.id); await app.docsChanged(d.id); draw(); } } })));
    });
  }
  init();
  return { el: root, refresh: draw };
}
