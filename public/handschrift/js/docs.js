// Ansicht „Dokumente“ (Startseite): Blätter als Kacheln mit Vorschau der ersten Seite, sortier- und durchsuchbar
import { reminderCard } from './backup.js';
import { h, saveFile, toast, fmtTime } from './util.js';
import { btn, sheet, confirmBox, promptBox, chips } from './ui.js';
import { dbDel, dbPut, kvGet, kvSet } from './store.js';
import { fileBase } from './exporter.js';
import { layout, drawPage, ensureImages, PAPERS, PAPER_COLORS, PENS, GNPAPER, DEF } from './render.js';
import { uid } from './util.js';
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
  const sorted = (all) => {
    const ds = app.docs.filter((d) => all || (d.folder && app.folderOf(d.folder) ? d.folder : null) === (app.folder || null));
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
    const fo = app.folderOf(app.folder); if (!fo) app.folder = null;
    const nDocs = sorted().length;
    wrap.append(h('div', { class: 'row phead' }, h('div', { class: 'sp1' },
      fo ? h('button', { type: 'button', class: 'crumb', onclick: () => { app.folder = null; q = ''; draw(); } }, '‹ Dokumente') : null,
      h('h1', null, fo ? fo.name : 'Dokumente'), h('p', { class: 'mut sm' }, `${nDocs} ${nDocs === 1 ? 'Dokument' : 'Dokumente'}` + (!fo && app.folders.length ? ` · ${app.folders.length} ${app.folders.length === 1 ? 'Ordner' : 'Ordner'}` : ''))),
      fo ? btn('Ordner-Einstellungen', { icon: 'sliders', cls: 'icon', onclick: () => folderSheet(fo), title: 'Name, Farbe und Papier für neue Dokumente' }) : btn('Neuer Ordner', { icon: 'folder', cls: 'icon', onclick: () => newFolder(), title: 'Neuer Ordner (z. B. ein Fach)' }),
      btn('Textdatei hochladen', { icon: 'upload', cls: 'icon', onclick: () => imp.click(), title: 'Textdateien (.txt, .md) hochladen' }), btn('Vorlagen', { icon: 'grid', cls: 'icon', onclick: () => openTemplates(app), title: 'Vorlagen' }), btn('Neues Dokument', { icon: 'plus', cls: 'pri icon', onclick: async () => { const d = await app.newDoc(); app.openDoc(d.id); }, title: 'Neues Dokument' }), imp));
    wrap.append(reminderCard());
    const s = h('input', { type: 'search', placeholder: 'Dokumente durchsuchen …', value: q, 'aria-label': 'Dokumente durchsuchen', oninput: () => { q = s.value; grid(); } });
    wrap.append(s, h('div', { style: { margin: '10px 0 4px', overflowX: 'auto' } }, chips(SORTS, () => sort, (v) => { sort = v; kvSet('docSort', v); grid(); hint(); })));
    const hintEl = h('p', { class: 'xs mut', style: { margin: '2px 2px 8px' } }); wrap.append(hintEl);
    const hint = () => { hintEl.textContent = sort === 'custom' ? 'Zum Sortieren eine Kachel gedrückt halten und verschieben.' : ''; hintEl.hidden = sort !== 'custom'; }; hint();
    const box = h('div', { class: 'dgrid' }); wrap.append(box);
    function grid() {
      const t = q.trim().toLowerCase(), ds = sorted(!!t).filter(d => !t || ((d.title || '') + ' ' + (d.text || '')).toLowerCase().includes(t));
      const fs = !t && !app.folder ? app.folders.map(folderTile) : [];
      box.replaceChildren(...fs, ...(ds.length ? ds.map(card) : fs.length ? [] : [h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, q ? 'Nichts gefunden.' : app.folder ? 'Dieser Ordner ist noch leer. Tippe oben auf + für ein neues Dokument.' : 'Noch keine Dokumente. Tippe oben auf + für ein neues.')]));
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

  // ---------- Ordner (z. B. Fächer) ----------
  function folderTile(f) {
    const n = app.docs.filter((d) => d.folder === f.id).length;
    const svg = `<svg viewBox="0 0 120 92" aria-hidden="true"><path d="M8 14a8 8 0 0 1 8-8h28l10 10h50a8 8 0 0 1 8 8v4H8z" fill="${f.color}" opacity=".7"/><rect x="8" y="22" width="104" height="64" rx="8" fill="${f.color}"/><path d="M8 30h104" stroke="#fff" stroke-opacity=".18" stroke-width="2"/></svg>`;
    const ic = h('div', { class: 'ficon' }); ic.innerHTML = svg;
    const pp = f.s && f.s.paper ? PAPERS[f.s.paper] : null;
    return h('div', { class: 'dcard folder', role: 'button', tabindex: 0, onclick: () => { app.folder = f.id; q = ''; draw(); root.scrollTop = 0; }, onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); } },
      ic, h('div', { class: 'dtitle' }, h('b', null, f.name), btn('Ordner-Einstellungen', { icon: 'more', cls: 'ghost icon sm', onclick: (e) => { e.stopPropagation(); folderSheet(f); } })),
      h('span', { class: 'xs mut' }, `${n} ${n === 1 ? 'Dokument' : 'Dokumente'}` + (pp ? ' · ' + pp : '')));
  }
  const FCOLORS = ['#4f7cff', '#ff6b5e', '#34c38f', '#ffb020', '#a66cff', '#ff7ab6', '#3fc1d9', '#8e8e93'];
  async function newFolder() {
    const nm = await promptBox('Name des Ordners (z. B. Mathe)', ''); if (!nm) return;
    const f = { id: uid(), name: nm, color: FCOLORS[app.folders.length % FCOLORS.length], s: {} };
    app.folders.push(f); await app.saveFolders(); draw(); folderSheet(f, true);
  }
  // Vorgaben eines Ordners: gelten für neue Dokumente darin (alles andere wie bei allen Dokumenten)
  function folderSheet(f, neu) {
    sheet(neu ? `Ordner „${f.name}“` : f.name, (b, api) => {
      const fs = f.s || (f.s = {}), save = async () => { await app.saveFolders(); draw(); };
      const pickPaper = (v) => {
        if (v === '') { for (const k of ['paper', 'fmt', 'paperColor', 'size', 'ml', 'mr', 'mt', 'mb']) delete fs[k]; save(); return; }
        const gp = GNPAPER[v]; fs.paper = v;
        if (gp) Object.assign(fs, { fmt: 'gn', paperColor: 'weiss', size: gp.size, ml: gp.ml, mr: gp.mr, mt: gp.mt, mb: gp.mb });
        else { if (GNPAPER[fs.paper] === undefined && fs.fmt === 'gn') delete fs.fmt; Object.assign(fs, { ml: 90, mr: 70, mt: 90, mb: 70, size: 18 }); }
        save();
      };
      const colors = h('div', { class: 'chips' }), drawC = () => colors.replaceChildren(...FCOLORS.map((c) => h('button', { type: 'button', class: 'sw' + (f.color === c ? ' on' : ''), style: { background: c }, 'aria-label': 'Farbe', onclick: () => { f.color = c; drawC(); save(); } }))); drawC();
      b.append(
        h('label', { class: 'f' }, 'Name'), h('input', { type: 'text', value: f.name, maxlength: 40, oninput: (e) => { f.name = e.target.value.trim() || f.name; save(); } }),
        h('label', { class: 'f' }, 'Farbe'), colors,
        h('h3', { style: { margin: '22px 0 2px' } }, 'Für neue Dokumente in diesem Ordner'),
        h('p', { class: 'mut xs', style: { margin: '0 0 6px' } }, 'Alles, was du hier nicht festlegst, ist wie bei deinen anderen Dokumenten (Einstellungen → „Als Standard merken“).'),
        h('label', { class: 'f' }, 'Papierart'), chips([['', 'Wie immer'], ...Object.entries(PAPERS)], () => fs.paper || '', pickPaper),
        h('label', { class: 'f' }, 'Papierfarbe'), chips([['', 'Wie immer'], ...Object.keys(PAPER_COLORS).map((k) => [k, k[0].toUpperCase() + k.slice(1)])], () => fs.paperColor || '', (v) => { if (v) fs.paperColor = v; else delete fs.paperColor; save(); }),
        h('label', { class: 'f' }, 'Stift'), chips([['', 'Wie immer'], ...Object.entries(PENS).map(([k, p]) => [k, p.name])], () => fs.pen || '', (k) => { if (!k) { for (const x of ['pen', 'ink', 'weight', 'inkAlpha']) delete fs[x]; } else { const p = PENS[k]; Object.assign(fs, { pen: k, ink: p.ink, weight: p.weight, inkAlpha: p.alpha }); } save(); }),
        h('div', { style: { display: 'grid', gap: '8px', marginTop: '22px' } },
          btn('Auf vorhandene Dokumente im Ordner anwenden', { icon: 'refresh', onclick: async () => { const ds = app.docs.filter((d) => d.folder === f.id); for (const d of ds) { d.s = { ...d.s, ...fs }; d.updated = Date.now(); await dbPut('docs', d); app.docSaved(d); } toast(`${ds.length} ${ds.length === 1 ? 'Dokument' : 'Dokumente'} angepasst`); draw(); } }),
          btn('Ordner löschen', { icon: 'trash', cls: 'danger', onclick: async () => { api.close(); if (await confirmBox(`Ordner „${f.name}“ löschen? Die Dokumente darin bleiben erhalten und landen wieder in „Dokumente“.`, 'Ordner löschen')) { for (const d of app.docs.filter((x) => x.folder === f.id)) { d.folder = null; await dbPut('docs', d); } app.folders = app.folders.filter((x) => x.id !== f.id); if (app.folder === f.id) app.folder = null; await app.saveFolders(); draw(); } } })));
    });
  }
  function moveSheet(d) {
    sheet('In Ordner verschieben', (b, api) => {
      const go = async (id) => { api.close(); d.folder = id; await dbPut('docs', d); app.docSaved(d); toast(id ? `In „${app.folderOf(id).name}“ verschoben` : 'Nach „Dokumente“ verschoben'); draw(); };
      b.append(h('div', { class: 'dlist' },
        ...[[null, 'Dokumente (kein Ordner)', '#8e8e93'], ...app.folders.map((f) => [f.id, f.name, f.color])].map(([id, nm, c]) => h('button', { type: 'button', class: 'it', onclick: () => go(id) }, h('span', { style: { width: '14px', height: '14px', borderRadius: '4px', background: c, flex: 'none' } }), h('span', { class: 'ti' }, h('b', null, nm)), (d.folder || null) === id ? h('span', { class: 'chip ac' }, 'Hier') : null)),
        h('button', { type: 'button', class: 'it', onclick: async () => { api.close(); const nm = await promptBox('Name des neuen Ordners', ''); if (!nm) return; const f = { id: uid(), name: nm, color: FCOLORS[app.folders.length % FCOLORS.length], s: {} }; app.folders.push(f); await app.saveFolders(); go(f.id); } }, h('span', { class: 'ti' }, h('b', { style: { color: 'var(--ac)' } }, '+ Neuer Ordner')))));
    });
  }

  function menu(d) {
    sheet(d.title || 'Dokument', (b, api) => {
      const move = (dir) => async () => { api.close(); const ids = sorted().map(x => x.id), i = ids.indexOf(d.id), j = dir < 0 ? 0 : ids.length - 1; ids.splice(i, 1); ids.splice(j, 0, d.id); saveOrder(ids); sort = 'custom'; kvSet('docSort', 'custom'); draw(); };
      b.append(h('div', { style: { display: 'grid', gap: '8px' } },
        btn('Öffnen', { icon: 'pen', onclick: () => { api.close(); app.openDoc(d.id); } }),
        btn('Umbenennen', { icon: 'edit', onclick: async () => { api.close(); const nm = await promptBox('Name des Dokuments', d.title || ''); if (nm) { d.title = nm; d.autoT = false; d.updated = Date.now(); await dbPut('docs', d); app.docSaved(d); draw(); } } }),
        btn('In Ordner verschieben', { icon: 'folder', onclick: () => { api.close(); setTimeout(() => moveSheet(d), 250); } }),
        btn('Duplizieren', { icon: 'copy', onclick: async () => { api.close(); await app.newDoc({ ...d, id: undefined, title: (d.title || 'Dokument') + ' (Kopie)', created: Date.now(), updated: Date.now(), opened: 0 }); draw(); toast('Dupliziert'); } }),
        btn('An den Anfang', { icon: 'cl', onclick: move(-1) }), btn('Ans Ende', { icon: 'cr', onclick: move(1) }),
        btn('Text als Datei speichern', { icon: 'download', onclick: () => { api.close(); saveFile(new Blob([d.text], { type: 'text/plain' }), fileBase(d.title) + '.txt'); } }),
        btn('Löschen', { icon: 'trash', cls: 'danger', onclick: async () => { api.close(); if (await confirmBox(`„${d.title || 'Dokument'}“ wirklich löschen?`)) { await dbDel('docs', d.id); thumbs.delete(d.id); await app.docsChanged(d.id); draw(); } } })));
    });
  }
  init();
  return { el: root, refresh: draw };
}
