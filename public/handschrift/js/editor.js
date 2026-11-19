// Ansicht „Schreiben“: Textfeld, Werkzeugleiste, Live-Vorschau, Einstellungen, Export, Sonderzeichen
import { h, debounce, toast, saveFile, fmtSize } from './util.js';
import { ic, btn, sheet, range, toggle, seg, chips } from './ui.js';
import { layout, drawPage, ensureImages, FORMATS, PAPERS, PAPER_COLORS, PENS, DEF, SHORTCUTS, GNPAPER, fmtOf } from './render.js';
import { exportPdf, exportGoodNotes, exportGoodNotesInk, exportPngs, zipOf, fileBase } from './exporter.js';
import { PACKS } from './packs.js';
import { openWizard } from './wizard.js';
import { dbPut, kvSet } from './store.js';

const MARGINS = { schmal: [70, 60, 90, 80], normal: [120, 100, 140, 120], breit: [170, 150, 180, 150] };

export function editorView(app) {
  let doc = null, L = null, version = 0, pagesEl, fontObj = null, pane = 'ed', info, missEl, ta;
  const root = h('div', { class: 'editor' });
  const S = () => doc.s;

  // ---------- Kopf ----------
  const title = h('input', { class: 'title', type: 'text', maxlength: 80, placeholder: 'Titel', 'aria-label': 'Titel des Dokuments', oninput: () => { doc.title = title.value; saveSoon(); } });
  const bar = h('div', { class: 'bar' }, h('div', { class: 't' }, title),
    btn('Einstellungen', { icon: 'sliders', cls: 'icon', onclick: () => openSettings() }), btn('Exportieren', { icon: 'download', cls: 'pri', onclick: () => openExport() }));
  const segEl = h('div', { class: 'seg2' }, seg([['ed', 'Schreiben'], ['pv', 'Vorschau']], () => pane, v => { pane = v; showPane(); }));
  // ---------- Werkzeugleiste ----------
  const fontBtn = h('button', { type: 'button', class: 'btn fontsel', onclick: () => pickFont(), title: 'Schrift wechseln' }, ic('type'), h('span'));
  const wrap = (a, b = a) => () => { const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e); ta.setRangeText(a + sel + b, s, e, 'end'); if (!sel) ta.setSelectionRange(s + a.length, s + a.length); ta.focus(); ta.dispatchEvent(new Event('input')); };
  const linePre = (p) => () => { const s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1, m = /^(#{1,3} |[-*] )/.exec(v.slice(ls)); if (m && m[0] === p) ta.setRangeText('', ls, ls + p.length, 'preserve'); else { if (m) ta.setRangeText('', ls, ls + m[0].length, 'preserve'); ta.setRangeText(p, ls, ls, 'preserve'); } ta.focus(); ta.dispatchEvent(new Event('input')); };
  const insert = (t) => { const s = ta.selectionStart; ta.setRangeText(t, s, ta.selectionEnd, 'end'); ta.focus(); ta.dispatchEvent(new Event('input')); };
  const colorMenu = () => sheet('Textfarbe', (b, api) => {
    b.append(h('p', { class: 'sm mut' }, 'Markiere Text und wähle eine Farbe. Ohne Markierung gilt sie für das, was du als Nächstes tippst.'), h('div', { class: 'chips' }, ...[['rot', '#c62828'], ['blau', '#1d3a9a'], ['gruen', '#1b7a3a'], ['orange', '#d9730d'], ['lila', '#7b3fa0'], ['schwarz', '#16161c']].map(([n, c]) => h('button', { type: 'button', class: 'sw', style: { background: c }, 'aria-label': n, onclick: () => { api.close(); wrap(`[${n}]`, '[/]')(); } }))));
  });
  const tb = h('div', { class: 'tb', role: 'toolbar', 'aria-label': 'Formatierung' }, fontBtn, h('i', { class: 'vs' }),
    btn('Fett', { icon: 'bold', cls: 'icon', onclick: wrap('**'), title: 'Fett (**Text**)' }), btn('Unterstrichen', { icon: 'underline', cls: 'icon', onclick: wrap('__'), title: 'Unterstrichen (__Text__)' }),
    btn('Durchgestrichen', { icon: 'strike', cls: 'icon', onclick: wrap('~~'), title: 'Durchgestrichen (~~Text~~)' }), btn('Markiert', { icon: 'hl', cls: 'icon', onclick: wrap('=='), title: 'Textmarker (==Text==)' }),
    btn('Farbe', { icon: 'palette', cls: 'icon', onclick: colorMenu }), h('i', { class: 'vs' }),
    btn('Überschrift', { icon: 'head', cls: 'icon', onclick: linePre('# '), title: 'Überschrift (# am Zeilenanfang)' }), btn('Liste', { icon: 'list', cls: 'icon', onclick: linePre('- '), title: 'Aufzählung (- am Zeilenanfang)' }),
    h('i', { class: 'vs' }), btn('Sonderzeichen', { icon: 'omega', cls: 'icon', onclick: () => openPalette(), title: 'Sonderzeichen und Kürzel' }));
  ta = h('textarea', { id: 'txt', spellcheck: true, lang: 'de', 'aria-label': 'Text', placeholder: 'Schreib oder füg hier deinen Text ein …\n\nTipps: **fett**, __unterstrichen__, ==markiert==, # Überschrift, - Liste\nMathe: x^2, a_1, ->, <=, \\alpha, \\pi', oninput: () => { doc.text = ta.value; saveSoon(); renderSoon(); } });
  info = h('div', { class: 'stat' }); missEl = h('div', { class: 'miss', hidden: true });
  const edPane = h('div', { class: 'pane ed on' }, tb, ta, missEl, info);
  pagesEl = h('div', { class: 'preview' });
  const pvPane = h('div', { class: 'pane pv' }, pagesEl);
  const split = h('div', { class: 'split' }, edPane, pvPane);
  root.append(bar, segEl, split);
  const showPane = () => { edPane.classList.toggle('on', pane === 'ed'); pvPane.classList.toggle('on', pane === 'pv'); segEl.replaceChildren(seg([['ed', 'Schreiben'], ['pv', 'Vorschau']], () => pane, v => { pane = v; showPane(); })); if (pane === 'pv') drawVisible(); };

  // ---------- Speichern ----------
  const saveSoon = debounce(async () => { doc.updated = Date.now(); await dbPut('docs', doc); app.docSaved(doc); }, 500);
  const renderSoon = debounce(() => render(), 140);

  // ---------- Vorschau ----------
  let wraps = [], dirty = new Set(), io = null;
  const scaleFor = (n) => (n <= 3 ? 1.6 : 1.2);
  async function render() {
    if (!doc) return; const my = ++version;
    const font = fontObj = await app.getFont(doc.fontId || app.fontId);
    fontBtn.lastChild.textContent = font.name || 'Schrift';
    await font.prepare(doc.text + ' ' + (S().header || '') + ' •');
    if (my !== version) return;
    L = layout(doc.text, S(), font);
    const n = L.pages.length;
    while (wraps.length < n) {
      const i = wraps.length, cv = h('canvas'), box = h('div', { class: 'cv', style: { aspectRatio: `${L.PW} / ${L.PH}` } }, cv);
      const w = h('div', { class: 'pg' }, h('div', { class: 'cap' }, h('span'), btn('Als PNG', { cls: 'sm ghost', onclick: () => pagePng(i) })), box);
      box.addEventListener('click', () => w.classList.toggle('zoom')); w._cv = cv; w._i = i; w._box = box; pagesEl.append(w); wraps.push(w); io && io.observe(w);
    }
    while (wraps.length > n) { const w = wraps.pop(); io && io.unobserve(w); w.remove(); }
    wraps.forEach((w, i) => { w._box.style.aspectRatio = `${L.PW} / ${L.PH}`; w.firstChild.firstChild.textContent = `Seite ${i + 1} von ${n}`; dirty.add(i); });
    drawVisible(); updateInfo();
  }
  function drawVisible() {
    if (!L) return;
    const my = version, h0 = pagesEl.getBoundingClientRect();
    wraps.forEach((w, i) => {
      if (!dirty.has(i)) return; const r = w.getBoundingClientRect();
      if (r.bottom < h0.top - 600 || r.top > h0.bottom + 600 || (r.width === 0 && i > 1)) return;
      dirty.delete(i); const ent = L.pages[i];
      ensureImages(ent).then(() => { if (my === version && L.pages[i] === ent) drawPage(w._cv, ent, L, S(), scaleFor(L.pages.length), false); });
    });
  }
  io = new IntersectionObserver(() => drawVisible(), { root: null, rootMargin: '600px' });
  pagesEl.addEventListener('scroll', debounce(drawVisible, 80));
  function updateInfo() {
    const n = L.pages.reduce((a, p) => a + p.filter(e => e.g).length, 0), f = fontObj;
    info.replaceChildren(h('span', null, `${n} Zeichen · ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}`), h('span', { class: 'sp1' }), h('span', null, FORMATS[fmtOf(S())].name));
    void f;
    if (L.missing.length) {
      missEl.hidden = false;
      missEl.replaceChildren(ic('alert'), h('span', null, 'Fehlt in dieser Schrift: ', h('b', null, L.missing.slice(0, 14).join(' ') + (L.missing.length > 14 ? ' …' : ''))), btn('Hinzufügen', { cls: 'sm', onclick: () => addMissing(L.missing) }));
    } else missEl.hidden = true;
  }
  function addMissing(chars) {
    const need = new Set(), loose = [];
    for (const ch of chars) { const p = PACKS.filter(p => p.groups.some(g => g.c.includes(ch))).sort((a, b) => a.bit - b.bit)[0]; p ? need.add(p.id) : loose.push(ch); }
    const rec = app.fonts.find(f => f.id === (doc.fontId || app.fontId));
    openWizard(app, { font: rec && !rec.builtin ? rec : null, preselect: [...need], customChars: loose.join('') });
  }
  async function pagePng(i) {
    const c = document.createElement('canvas'); await ensureImages(L.pages[i]); drawPage(c, L.pages[i], L, S(), 2, false);
    c.toBlob(b => saveFile(b, `${fileBase(doc.title)}-${i + 1}.png`), 'image/png');
  }

  // ---------- Schrift wählen ----------
  function pickFont() {
    sheet('Schrift', (b, api) => {
      for (const f of app.fonts) b.append(h('button', { type: 'button', class: 'pack' + ((doc.fontId || app.fontId) === f.id ? ' on' : ''), onclick: () => { doc.fontId = f.id; app.setFont(f.id, true); saveSoon(); render(); api.close(); } },
        h('div', { class: 'pi' }, 'Aa'), h('div', { class: 'pt' }, h('b', null, f.name), h('span', { class: 'sm mut' }, `${Object.keys(f.g).length} Zeichen`)), h('div', { class: 'ck' }, ic('check'))));
      b.append(btn('Neue Schrift erstellen', { icon: 'plus', cls: 'pri', onclick: () => { api.close(); openWizard(app); } }));
    });
  }

  // ---------- Einstellungen ----------
  function openSettings() {
    sheet('Einstellungen', (b, api) => {
      const s = S(), ch = () => { saveSoon(); renderSoon(); }, setK = (k) => (v) => { s[k] = v; ch(); };
      // GoodNotes-Vorlagen haben feste Linien: Format, Größe und Ränder werden passend gesetzt; danach Ansicht neu aufbauen
      const pickPaper = (v) => {
        const was = GNPAPER[s.paper], gp = GNPAPER[v]; s.paper = v;
        if (gp) Object.assign(s, { fmt: 'gn', paperColor: 'weiss', scan: false, size: gp.size, ml: gp.ml, mr: gp.mr, mt: gp.mt, mb: gp.mb });
        else if (was) Object.assign(s, { ml: 90, mr: 70, mt: 90, mb: 70, size: 20 });
        ch(); if (gp || was) { api.close(); setTimeout(openSettings, 280); }
      };
      const pickFmt = (v) => { const was = GNPAPER[s.paper]; s.fmt = v; if (was && v !== 'gn') s.paper = 'lined'; ch(); if (was && v !== 'gn') { api.close(); setTimeout(openSettings, 280); } };
      const sec = (t) => h('h3', { style: { margin: '20px 0 4px' } }, t);
      b.append(h('div', { class: 'row', style: { gap: '8px', marginBottom: '4px' } }, btn('Neu würfeln', { icon: 'dice', cls: 'sm', onclick: () => { s.seed = (Math.random() * 1e6) | 0; ch(); } }), btn('Als Standard merken', { cls: 'sm', onclick: () => { kvSet('lastS', { ...s }); toast('Das gilt jetzt für neue Dokumente'); } }), btn('Zurücksetzen', { cls: 'sm', onclick: () => { Object.assign(s, { ...DEF }); ch(); b.parentNode.parentNode && b.replaceChildren(); openSettings(); } })));
      b.append(sec('Papier'), h('label', { class: 'f' }, 'Format'), chips(Object.entries(FORMATS).map(([k, v]) => [k, v.name]), () => fmtOf(s), pickFmt),
        h('label', { class: 'f' }, 'Papierart'), chips(Object.entries(PAPERS), () => s.paper, pickPaper),
        GNPAPER[s.paper] ? h('p', { class: 'xs mut' }, 'Die Schrift sitzt genau auf den Linien der eingebauten GoodNotes-Vorlage' + (GNPAPER[s.paper].vp ? ' (auf jeder zweiten Zeile des Rasters)' : '') + '. Im GoodNotes-Export mit echten Strichen wird diese Vorlage als Hintergrund verwendet. Zeilenabstand und Format sind dabei fest.') : null,
        h('label', { class: 'f' }, 'Papierfarbe'), (() => { const w = h('div', { class: 'chips' }); const d = () => w.replaceChildren(...Object.entries(PAPER_COLORS).map(([k, c]) => h('button', { type: 'button', class: 'sw' + (s.paperColor === k ? ' on' : ''), style: { background: c }, 'aria-label': k, onclick: () => { s.paperColor = k; if (k === 'dunkel' && /^#(1|0)/.test(s.ink)) { s.ink = '#e8e8f0'; } ch(); d(); } }))); d(); return w; })(),
        h('label', { class: 'f' }, 'Ränder'), chips([['schmal', 'Schmal'], ['normal', 'Normal'], ['breit', 'Breit']], () => Object.entries(MARGINS).find(([, v]) => v[0] === s.ml && v[1] === s.mr)?.[0] || '', (v) => { const m = MARGINS[v]; [s.ml, s.mr, s.mt, s.mb] = m; ch(); }),
        toggle('Scan-Effekt', 'Leichte Körnung und Schatten wie bei einem Scan', () => s.scan, setK('scan')), toggle('Roter Rand', 'Randlinie bei liniertem Papier', () => s.margin !== false, setK('margin')));
      b.append(sec('Stift'), chips(Object.entries(PENS).map(([k, p]) => [k, p.name]), () => s.pen, (k) => { const p = PENS[k]; Object.assign(s, { pen: k, ink: p.ink, weight: p.weight, inkAlpha: p.alpha }); ch(); }),
        h('div', { class: 'row', style: { margin: '12px 0' } }, h('b', { class: 'sm sp1' }, 'Eigene Farbe'), h('input', { type: 'color', value: s.ink, 'aria-label': 'Tintenfarbe', style: { width: '46px', height: '34px', border: '1px solid var(--bd)', borderRadius: '8px', background: 'none' }, oninput: (e) => { s.ink = e.target.value; s.pen = ''; ch(); } })),
        range('Strichstärke', () => s.weight, setK('weight'), 0, 1.4, .05, v => v.toFixed(2)), range('Deckkraft', () => s.inkAlpha, setK('inkAlpha'), .4, 1, .02, v => Math.round(v * 100) + ' %'));
      b.append(sec('Schrift'), range('Größe', () => s.size, setK('size'), 13, 42, .5, v => v + ' pt'), range('Zeilenabstand', () => s.lh, setK('lh'), 2, 4.6, .05, v => v.toFixed(2) + '×'),
        range('Buchstabenabstand', () => s.sp, setK('sp'), .6, 1.4, .02, v => Math.round(v * 100) + ' %'), range('Wortabstand', () => s.wsp, setK('wsp'), .5, 2, .05, v => Math.round(v * 100) + ' %'),
        range('Unregelmäßigkeit', () => s.jit, setK('jit'), 0, 1.6, .05, v => Math.round(v * 100) + ' %'), range('Neigung', () => s.slant, setK('slant'), -10, 18, .5, v => v + '°'), range('Verbundene Buchstaben', () => s.conn, setK('conn'), 0, 1, .05, v => Math.round(v * 100) + ' %'));
      b.append(sec('Text'), toggle('Mathe-Kürzel', 'x^2 → x², a_1 → a₁, -> → →, \\alpha → α', () => s.kz, setK('kz')), toggle('Formatierung', '**fett**, __unterstrichen__, ==markiert==, # Überschrift', () => s.markup, setK('markup')), toggle('ß als ss schreiben', null, () => s.sz, setK('sz')));
      const hi = h('input', { type: 'text', value: s.header || '', placeholder: 'z. B. Leif · Biologie · {datum}', maxlength: 80, oninput: () => { s.header = hi.value; ch(); } });
      b.append(sec('Kopf- und Fußzeile'), h('label', { class: 'f' }, 'Kopfzeile (auf jeder Seite)'), hi, h('p', { class: 'xs mut' }, 'Platzhalter: {datum} und {n} (Seitenzahl)'), toggle('Seitenzahlen', 'Unten mittig auf jeder Seite', () => s.pageNum, setK('pageNum')));
    }, { wide: true });
  }

  // ---------- Export ----------
  function openExport() {
    if (!L) return;
    sheet('Exportieren', (b) => {
      let dpi = 200; const bar = h('div', { class: 'prog', style: { display: 'none', margin: '12px 0' } }, h('i')), msg = h('p', { class: 'sm mut', style: { minHeight: '20px' } });
      const prog = (p) => { bar.firstChild.style.width = (p * 100) + '%'; }; let busy = false;
      const run = (fn) => async () => { if (busy) return; busy = true; bar.style.display = ''; prog(0); msg.textContent = 'Wird erstellt …'; try { await fn(); } catch (e) { msg.textContent = 'Das hat nicht geklappt: ' + e.message; toast('Export fehlgeschlagen', 3500, 'err'); } finally { busy = false; bar.style.display = 'none'; } };
      const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.pdf', { type: 'application/pdf' })] }));
      const pdf = (share) => run(async () => { const blob = await exportPdf(L, S(), doc.title, dpi, prog); const r = await saveFile(blob, fileBase(doc.title) + '.pdf', { share }); msg.textContent = r === 'abgebrochen' ? '' : `PDF ${share ? 'geteilt' : 'gespeichert'} (${fmtSize(blob.size)}, ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}).`; });
      const gnote = () => run(async () => { const blob = await exportGoodNotes(L, S(), doc.title, dpi, prog); const r = await saveFile(blob, fileBase(doc.title) + '.goodnotes'); msg.textContent = r === 'abgebrochen' ? '' : `GoodNotes-Datei gespeichert (${fmtSize(blob.size)}, ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}).` + (S().fmt === 'gn' ? '' : ' Tipp: Format „GoodNotes Standard“ passt genau auf leere Standardseiten.'); });
      const gink = () => run(async () => { const blob = await exportGoodNotesInk(L, S(), doc.title, prog); const r = await saveFile(blob, fileBase(doc.title) + '.goodnotes'); msg.textContent = r === 'abgebrochen' ? '' : `GoodNotes-Datei mit echten Strichen gespeichert (${fmtSize(blob.size)}, ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}).`; });
      const png = (transparent) => run(async () => { const files = await exportPngs(L, S(), doc.title, dpi, transparent, prog); if (files.length === 1) { await saveFile(files[0].blob, files[0].name); } else await saveFile(zipOf(files), fileBase(doc.title) + (transparent ? '-transparent' : '') + '-PNG.zip'); msg.textContent = 'Bilder gespeichert.'; });
      b.append(h('label', { class: 'f' }, 'Qualität'), chips([[150, 'Standard'], [200, 'Hoch (empfohlen)'], [300, 'Sehr hoch']], () => dpi, v => { dpi = v; }),
        h('div', { style: { display: 'grid', gap: '10px', marginTop: '16px' } },
          btn('GoodNotes: echte Striche (.goodnotes)', { icon: 'download', cls: 'pri', onclick: gink() }),
          btn('PDF speichern', { icon: 'download', onclick: pdf(false) }),
          canShare ? btn('In GoodNotes öffnen (Teilen)', { icon: 'share', onclick: pdf(true) }) : null,
          btn('GoodNotes: Seiten als Bild (.goodnotes)', { icon: 'download', onclick: gnote() }),
          btn('PNG je Seite' + (L.pages.length > 1 ? ' (ZIP)' : ''), { icon: 'image', onclick: png(false) }),
          btn('Nur Schrift, transparent (PNG)', { icon: 'layers', onclick: png(true) })),
        bar, msg, h('div', { class: 'note' }, h('b', null, 'GoodNotes: '), 'Am besten „GoodNotes-Datei“ mit dem Format „GoodNotes Standard“: In GoodNotes auf + → Importieren, die Seiten landen im Standardformat. Alternativ PDF speichern und genauso importieren. Jede Seite wird eine Seite im Heft. Das transparente PNG fügst du als Bild auf eigenes Papier ein.'));
    });
  }

  // ---------- Sonderzeichen ----------
  function openPalette() {
    const font = fontObj; if (!font) return;
    sheet('Sonderzeichen', (b, api) => {
      const put = (t) => () => { insert(t); };
      b.append(h('h3', { style: { margin: '4px 0' } }, 'Kürzel'), h('p', { class: 'xs mut' }, 'Tippe das Kürzel im Text, die App wandelt es beim Schreiben um.'));
      const sc = [['->', '→'], ['=>', '⇒'], ['<=', '≤'], ['>=', '≥'], ['!=', '≠'], ['+-', '±'], ['x^2', 'x²'], ['a_1', 'a₁'], ['\\pi', 'π'], ['\\alpha', 'α'], ['\\sqrt', '√'], ['\\infty', '∞'], ['\\deg', '°'], ['\\cdot', '·']];
      b.append(h('div', { class: 'chips' }, ...sc.map(([k, v]) => h('button', { type: 'button', class: 'opt', onclick: put(k) }, `${k} → ${v}`))));
      const known = new Set(); void SHORTCUTS;
      for (const p of PACKS) {
        const chars = [...new Set(p.groups.flatMap(g => [...g.c]))].filter(c => !known.has(c)); if (!chars.length) continue;
        const ok = chars.filter(c => font.resolve(c)); if (ok.length < 2 && p.id !== 'symbole') continue;
        const show = (p.id.startsWith('zh') || p.id === 'kanji') ? ok : chars; if (!show.length) continue;
        if (p.id === 'standard') continue;
        b.append(h('h3', { style: { margin: '16px 0 4px' } }, p.name), h('div', { class: 'pal' }, ...show.slice(0, 300).map(c => h('button', { type: 'button', class: font.resolve(c) ? '' : 'no', title: font.resolve(c) ? '' : 'Fehlt in dieser Schrift', onclick: put(c) }, c))));
      }
      b.append(h('p', { class: 'xs mut' }, 'Ausgegraute Zeichen fehlen in der gewählten Schrift. Du kannst sie trotzdem einfügen und über „Hinzufügen“ nachholen.'), btn('Mehr Zeichen-Pakete', { icon: 'plus', cls: 'sm', onclick: () => { api.close(); addMissing([]); } }));
    }, { wide: true });
  }

  return {
    el: root,
    async load(d) { doc = d; title.value = d.title || ''; ta.value = d.text || ''; wraps.forEach(w => w.remove()); wraps = []; dirty.clear(); L = null; await render(); },
    refresh() { return render(); },
    focus() { ta && ta.focus(); },
    get doc() { return doc; },
  };
}
