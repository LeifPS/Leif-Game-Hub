// Ansicht „Dokumente“ (Startseite): Blätter als Kacheln mit Vorschau der ersten Seite, sortier- und durchsuchbar
import { reminderCard } from './backup.js';
import { h, saveFile, toast, fmtTime } from './util.js';
import { btn, sheet, confirmBox, promptBox, chips, ic, mark } from './ui.js';
import { dbDel, dbPut, kvGet, kvSet, merkeLoeschung } from './store.js';
import { fileBase } from './exporter.js';
import { layout, drawPage, ensureImages, PAPERS, PAPER_COLORS, PENS, GNPAPER, DEF, gnApply, FORMATS, fmtOf, INKS } from './render.js';
import { gnPicker } from './papier.js';
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
    if (!fo) wrap.append(h('div', { class: 'brand mbrand' }, mark(24), 'STools', h('span', { class: 'beta' }, 'Beta')));   // auf dem Handy (ohne Seitenleiste) steht der Name oben
    wrap.append(h('div', { class: 'row phead' }, h('div', { class: 'sp1' },
      fo ? h('button', { type: 'button', class: 'crumb', onclick: () => { app.folder = null; q = ''; draw(); } }, '‹ Dokumente') : null,
      h('h1', null, fo ? fo.name : 'Dokumente'), h('p', { class: 'mut sm' }, `${nDocs} ${nDocs === 1 ? 'Dokument' : 'Dokumente'}` + (!fo && app.folders.length ? ` · ${app.folders.length} ${app.folders.length === 1 ? 'Ordner' : 'Ordner'}` : ''))),
      fo ? btn('Ordner-Einstellungen', { icon: 'sliders', cls: 'icon', onclick: () => folderSheet(fo), title: 'Name, Farbe und Papier für neue Dokumente' }) : btn('Neuer Ordner', { icon: 'folder', cls: 'icon', onclick: () => newFolder(), title: 'Neuer Ordner (z. B. ein Fach)' }),
      btn('Textdatei importieren', { icon: 'fileadd', cls: 'icon', onclick: () => imp.click(), title: 'Textdatei importieren (.txt, .md, .hdf)' }), ...(!fo && app.trash.length ? [btn('Papierkorb', { icon: 'trash', cls: 'icon', onclick: trashSheet, title: `Papierkorb (${app.trash.length})` })] : []), btn('Vorlagen', { icon: 'grid', cls: 'icon', onclick: () => openTemplates(app), title: 'Vorlagen' }), btn('Neues Dokument', { icon: 'plus', cls: 'pri icon', onclick: async () => { const d = await app.newDoc(); app.openDoc(d.id); }, title: 'Neues Dokument' }), imp));
    wrap.append(reminderCard());
    const s = h('input', { type: 'search', placeholder: 'Dokumente durchsuchen …', value: q, 'aria-label': 'Dokumente durchsuchen', oninput: () => { q = s.value; grid(); } });
    // Sortieren: Knopf neben der Suche (dahinter liegt eine unsichtbare Auswahlliste, so kommt auf dem iPhone die normale Auswahl)
    const sel = h('select', { 'aria-label': 'Sortieren', onchange: () => { sort = sel.value; kvSet('docSort', sort); sortLbl.textContent = SORTS.find(([k]) => k === sort)[1]; grid(); hint(); } }, ...SORTS.map(([k, t]) => h('option', { value: k, selected: k === sort }, t)));
    const sortLbl = h('span', { class: 'slbl' }, SORTS.find(([k]) => k === sort)?.[1] || '');
    wrap.append(h('div', { class: 'srow' }, s, h('label', { class: 'sortbtn', title: 'Sortieren' }, ic('sort'), sortLbl, sel)));
    const hintEl = h('p', { class: 'xs mut', style: { margin: '-14px 2px 20px' } }); wrap.append(hintEl);
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
      const F = FORMATS[fmtOf(d.s || {})] || FORMATS.gn, ratio = `${F.w} / ${F.h}`;
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

  // ---------- Papierkorb ----------
  function trashSheet() {
    sheet('Papierkorb', (b, api) => {
      const list = h('div', { class: 'dlist' });
      const fill = () => {
        if (!app.trash.length) { list.replaceChildren(h('div', { class: 'empty' }, 'Der Papierkorb ist leer.')); return; }
        list.replaceChildren(...app.trash.map((d) => { const tage = Math.max(0, 30 - Math.floor((Date.now() - d.deleted) / 864e5));
          return h('div', { class: 'it' }, h('span', { class: 'ti' }, h('b', null, d.title || 'Ohne Titel'), h('span', { class: 'xs mut' }, `wird in ${tage} ${tage === 1 ? 'Tag' : 'Tagen'} endgültig gelöscht`)),
            btn('Wiederherstellen', { icon: 'undo', cls: 'icon sm', title: 'Wiederherstellen', onclick: async () => { await app.restoreDoc(d); fill(); draw(); toast('Wiederhergestellt'); } }),
            btn('Endgültig löschen', { icon: 'trash', cls: 'icon sm danger', title: 'Endgültig löschen', onclick: async () => { if (await confirmBox(`„${d.title || 'Dokument'}“ endgültig löschen? Das lässt sich nicht rückgängig machen.`)) { await app.purgeDoc(d); fill(); draw(); } } })); }));
      };
      fill();
      b.append(h('p', { class: 'sm mut', style: { margin: '0 0 12px' } }, 'Gelöschte Dokumente bleiben hier 30 Tage, danach werden sie automatisch endgültig gelöscht.'), list,
        app.trash.length > 1 ? h('div', { style: { marginTop: '14px' } }, btn('Papierkorb leeren', { icon: 'trash', cls: 'danger', onclick: async () => { if (await confirmBox(`Alle ${app.trash.length} Dokumente endgültig löschen?`, 'Leeren')) { for (const d of [...app.trash]) await dbDel('docs', d.id); await app.loadDocs(); api.close(); draw(); } } })) : null);
    });
  }

  // ---------- Ordner (z. B. Fächer) ----------
  function folderTile(f) {
    const n = app.docs.filter((d) => d.folder === f.id).length;
    // Wie ein GoodNotes-Heft: Deckblatt in der Ordnerfarbe mit hellem Streifen kurz vor dem rechten Rand (Maße aus der GoodNotes-Vorlage)
    const white = /^#f{3,6}$/i.test(f.color || '');
    const svg = `<svg viewBox="0 0 455 588" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="c${f.id}"><path d="M8 0H425a30 30 0 0 1 30 30V558a30 30 0 0 1-30 30H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z"/></clipPath></defs><g clip-path="url(#c${f.id})"><rect width="455" height="588" fill="${f.color || '#fff'}"/><rect x="386.8" width="22.75" height="588" fill="${white ? '#f3f3f3' : 'rgba(0,0,0,.09)'}"/><rect width="455" height="588" fill="url(#g${f.id})"/></g><linearGradient id="g${f.id}" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".06"/><stop offset=".04" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></svg>`;
    const ic = h('div', { class: 'ficon' }); ic.innerHTML = svg;
    const pp = f.s && f.s.paper ? PAPERS[f.s.paper] + ({ gnq: ' quer', a4: ' A4', a4q: ' A4 quer' }[f.s.fmt] || '') : null;
    return h('div', { class: 'dcard folder', role: 'button', tabindex: 0, onclick: () => { app.folder = f.id; q = ''; draw(); root.scrollTop = 0; }, onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); } },
      ic, h('div', { class: 'dtitle' }, h('b', null, f.name), btn('Ordner-Einstellungen', { icon: 'more', cls: 'ghost icon sm', onclick: (e) => { e.stopPropagation(); folderSheet(f); } })),
      h('span', { class: 'xs mut' }, `${n} ${n === 1 ? 'Dokument' : 'Dokumente'}` + (pp ? ' · ' + pp : '')));
  }
  const FCOLORS = ['#ffffff', '#4f7cff', '#ff6b5e', '#34c38f', '#ffb020', '#a66cff', '#ff7ab6', '#2c2c2e'];
  async function newFolder() {
    const nm = await promptBox('Name des Ordners (z. B. Mathe)', ''); if (!nm) return;
    const f = { id: uid(), name: nm, color: FCOLORS[0], s: {}, updated: Date.now() };
    app.folders.push(f); await app.saveFolders(); draw(); folderSheet(f, true);
  }
  // Vorgaben eines Ordners: gelten für neue Dokumente darin (alles andere wie bei allen Dokumenten)
  function folderSheet(f, neu) {
    sheet(neu ? `Ordner „${f.name}“` : f.name, (b, api) => {
      const fs = f.s || (f.s = {}), save = async () => { f.updated = Date.now(); await app.saveFolders(); draw(); };
      const clearPaper = () => { for (const k of ['paper', 'fmt', 'paperColor', 'size', 'ml', 'mr', 'mt', 'mb']) delete fs[k]; save(); };
      const papBox = h('div');
      const drawPap = () => papBox.replaceChildren(
        h('div', { class: 'chips', style: { marginTop: '8px' } }, h('button', { type: 'button', class: 'opt' + (fs.paper ? '' : ' on'), onclick: () => { clearPaper(); drawPap(); } }, 'Wie immer'), h('button', { type: 'button', class: 'opt' + (fs.paper ? ' on' : ''), onclick: () => { if (!fs.paper) { gnApply(fs, 'gnlin', 'gn'); save(); drawPap(); } } }, 'Eigene Vorlage')),
        ...(fs.paper ? [gnPicker(() => ({ paper: fs.paper, fmt: fs.fmt || 'gn' }), (p, fm) => { gnApply(fs, p, fm); save(); })] : []));
      drawPap();
      const colors = h('div', { class: 'chips' }), drawC = () => colors.replaceChildren(...FCOLORS.map((c) => h('button', { type: 'button', class: 'sw' + (f.color === c ? ' on' : ''), style: { background: c }, 'aria-label': 'Farbe', onclick: () => { f.color = c; drawC(); save(); } }))); drawC();
      b.append(
        h('label', { class: 'f' }, 'Name'), h('input', { type: 'text', value: f.name, maxlength: 40, oninput: (e) => { f.name = e.target.value.trim() || f.name; save(); } }),
        h('label', { class: 'f' }, 'Farbe'), colors,
        h('h3', { style: { margin: '22px 0 2px' } }, 'Für neue Dokumente in diesem Ordner'),
        h('p', { class: 'mut xs', style: { margin: '0 0 6px' } }, 'Alles, was du hier nicht festlegst, ist wie bei deinen anderen Dokumenten (Einstellungen → „Als Standard merken“).'),
        h('label', { class: 'f' }, 'Papier'), papBox,
        h('label', { class: 'f' }, 'Stiftfarbe'), chips([['', 'Wie immer'], ...INKS], () => fs.ink || '', (c) => { if (!c) { for (const x of ['pen', 'ink', 'weight', 'inkAlpha']) delete fs[x]; } else fs.ink = c; save(); }),
        h('div', { style: { display: 'grid', gap: '8px', marginTop: '22px' } },
          btn('Auf vorhandene Dokumente im Ordner anwenden', { icon: 'refresh', onclick: async () => { const ds = app.docs.filter((d) => d.folder === f.id); for (const d of ds) { d.s = { ...d.s, ...fs }; d.updated = Date.now(); await dbPut('docs', d); app.docSaved(d); } toast(`${ds.length} ${ds.length === 1 ? 'Dokument' : 'Dokumente'} angepasst`); draw(); } }),
          btn('Ordner löschen', { icon: 'trash', cls: 'danger', onclick: async () => { api.close(); if (await confirmBox(`Ordner „${f.name}“ löschen? Die Dokumente darin bleiben erhalten und landen wieder in „Dokumente“.`, 'Ordner löschen')) { for (const d of app.docs.filter((x) => x.folder === f.id)) { d.folder = null; d.updated = Date.now(); await dbPut('docs', d); } app.folders = app.folders.filter((x) => x.id !== f.id); merkeLoeschung('folders', f.id); if (app.folder === f.id) app.folder = null; await app.saveFolders(); draw(); } } })));
    });
  }
  function moveSheet(d) {
    sheet('In Ordner verschieben', (b, api) => {
      const go = async (id) => { api.close(); d.folder = id; d.updated = Date.now(); await dbPut('docs', d); app.docSaved(d); toast(id ? `In „${app.folderOf(id).name}“ verschoben` : 'Nach „Dokumente“ verschoben'); draw(); };
      b.append(h('div', { class: 'dlist' },
        ...[[null, 'Dokumente (kein Ordner)', '#8e8e93'], ...app.folders.map((f) => [f.id, f.name, f.color])].map(([id, nm, c]) => h('button', { type: 'button', class: 'it', onclick: () => go(id) }, h('span', { style: { width: '14px', height: '14px', borderRadius: '4px', background: c, flex: 'none' } }), h('span', { class: 'ti' }, h('b', null, nm)), (d.folder || null) === id ? h('span', { class: 'chip ac' }, 'Hier') : null)),
        h('button', { type: 'button', class: 'it', onclick: async () => { api.close(); const nm = await promptBox('Name des neuen Ordners', ''); if (!nm) return; const f = { id: uid(), name: nm, color: FCOLORS[0], s: {}, updated: Date.now() }; app.folders.push(f); await app.saveFolders(); go(f.id); } }, h('span', { class: 'ti' }, h('b', { style: { color: 'var(--ac)' } }, '+ Neuer Ordner')))));
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
        btn('In den Papierkorb', { icon: 'trash', cls: 'danger', onclick: async () => { api.close(); thumbs.delete(d.id); await app.trashDoc(d); draw(); toast('Im Papierkorb – 30 Tage lang wiederherstellbar', 3000); } })));
    });
  }
  init();
  return { el: root, refresh: draw };
}
