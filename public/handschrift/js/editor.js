// Ansicht „Schreiben“: Textfeld, Werkzeugleiste, Live-Vorschau, Einstellungen, Export, Sonderzeichen
import { h, debounce, toast, saveFile, fmtSize, autoName } from './util.js';
import { ic, btn, sheet, range, toggle, seg, chips, confirmBox } from './ui.js';
import { exportVideo, videoSupported } from './video.js';
import { layout, drawPage, ensureImages, FORMATS, PAPERS, PAPER_COLORS, PENS, DEF, GNPAPER, fmtOf, gnOf, gnApply, INKS } from './render.js';
import { gnPicker } from './papier.js';
import { exportPdf, exportGoodNotes, exportGoodNotesInk, exportPngs, zipOf, fileBase } from './exporter.js';
import { PACKS } from './packs.js';
import { openWizard } from './wizard.js';
import { openTopUp } from './extra.js';
import { checkText } from './grammar.js';
import { dbPut, kvSet } from './store.js';

const MARGINS = { schmal: [70, 60, 90, 80], normal: [120, 100, 140, 120], breit: [170, 150, 180, 150] };

export function editorView(app) {
  let doc = null, L = null, version = 0, pagesEl, fontObj = null, pane = 'ed', info, missEl, errEl, ta;
  const root = h('div', { class: 'editor' });
  const S = () => doc.s;

  // ---------- Kopf ----------
  const title = h('input', { class: 'title', type: 'text', maxlength: 80, placeholder: 'Titel', 'aria-label': 'Titel des Dokuments', oninput: () => { doc.title = title.value; doc.autoT = !title.value.trim(); saveSoon(); } });
  // Titel vorschlagen lassen (nur auf Knopfdruck, nur online; der Text geht dafür einmal an den Server)
  const aiBtn = btn('Titel vorschlagen', { icon: 'wand', cls: 'icon', title: 'Titel vorschlagen lassen (KI, braucht Internet)', onclick: async () => {
    if (!doc || !(doc.text || '').trim()) { toast('Erst etwas schreiben, dann kann ich einen Titel vorschlagen.'); return; }
    if (!navigator.onLine) { toast('Dafür brauchst du Internet.', 3000, 'err'); return; }
    aiBtn.disabled = true;
    try {
      const r = await fetch('/api/titel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: doc.text.slice(0, 2500) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.titel) throw new Error(j.error || 'Kein Vorschlag');
      doc.title = j.titel; doc.autoT = false; title.value = j.titel; saveSoon();
      toast(`Titel: „${j.titel}“ – nochmal tippen für einen anderen`, 3000);
    } catch (e) { toast('Titelvorschlag: ' + e.message, 4000, 'err'); }
    aiBtn.disabled = false;
  } });
  const bar = h('div', { class: 'bar' }, btn('Zurück zu den Dokumenten', { icon: 'cl', cls: 'icon', onclick: async () => { await saveNow(); app.show('docs'); } }), h('div', { class: 't' }, title), aiBtn,
    btn('Einstellungen', { icon: 'sliders', cls: 'icon', onclick: () => openSettings() }), btn(h('span', { class: 'lbl' }, 'Exportieren'), { icon: 'download', cls: 'pri expbtn', title: 'Exportieren', onclick: () => openExport() }));
  const segEl = h('div', { class: 'seg2' }, seg([['ed', 'Schreiben'], ['pv', 'Vorschau']], () => pane, v => { pane = v; showPane(); }));
  // ---------- Werkzeugleiste ----------
  const fontBtn = h('button', { type: 'button', class: 'btn fontsel', onclick: () => pickFont(), title: 'Schrift wechseln' }, ic('type'), h('span'));
  // ---------- Verlauf (Rückgängig / Wiederholen) ----------
  let hist = [], hi = 0, hTimer = 0, applying = false, undoB, redoB;
  const updUndo = () => { if (undoB) undoB.disabled = hi <= 0; if (redoB) redoB.disabled = hi >= hist.length - 1; };
  const hReset = () => { clearTimeout(hTimer); hist = [{ v: ta.value, s: 0, e: 0 }]; hi = 0; updUndo(); };
  const hPush = () => { clearTimeout(hTimer); hTimer = 0; if (applying || !ta) return; const v = ta.value; if (hist[hi] && hist[hi].v === v) { updUndo(); return; } hist = hist.slice(0, hi + 1); hist.push({ v, s: ta.selectionStart, e: ta.selectionEnd }); if (hist.length > 300) hist.shift(); hi = hist.length - 1; updUndo(); };
  const hSoon = () => { clearTimeout(hTimer); hTimer = setTimeout(hPush, 450); };
  const fire = () => { ta.focus(); ta.dispatchEvent(new Event('input')); hPush(); };
  function hGo(d) {
    hPush(); const n = hi + d; if (n < 0 || n >= hist.length) return; hi = n; applying = true;
    ta.value = hist[n].v; ta.setSelectionRange(hist[n].s, hist[n].e); applying = false; doc.text = ta.value; saveSoon(); renderSoon(); updUndo(); ta.focus();
  }
  const wrap = (a, b = a) => () => { hPush(); const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value, sel = v.slice(s, e); ta.setRangeText(a + sel + b, s, e, 'end'); if (!sel) ta.setSelectionRange(s + a.length, s + a.length); fire(); };
  const linePre = (p) => () => { hPush(); const s = ta.selectionStart, v = ta.value, ls = v.lastIndexOf('\n', s - 1) + 1, m = /^(#{1,3} |[-*] |\d{1,3}[.)] )/.exec(v.slice(ls)); if (m && m[0] === p) ta.setRangeText('', ls, ls + p.length, 'preserve'); else { if (m) ta.setRangeText('', ls, ls + m[0].length, 'preserve'); ta.setRangeText(p, ls, ls, 'preserve'); } fire(); };
  const insert = (t) => { hPush(); const s = ta.selectionStart; ta.setRangeText(t, s, ta.selectionEnd, 'end'); fire(); };
  const colorMenu = () => sheet('Textfarbe', (b, api) => {
    b.append(h('p', { class: 'sm mut' }, 'Markiere Text und wähle eine Farbe. Ohne Markierung gilt sie für das, was du als Nächstes tippst.'), h('div', { class: 'chips' }, ...[['rot', '#c62828'], ['blau', '#1d3a9a'], ['gruen', '#1b7a3a'], ['orange', '#d9730d'], ['lila', '#7b3fa0'], ['schwarz', '#16161c']].map(([n, c]) => h('button', { type: 'button', class: 'sw', style: { background: c }, 'aria-label': n, onclick: () => { api.close(); wrap(`[${n}]`, '[/]')(); } }))));
  });
  // ---------- Einfügen, Kopieren, Suchen ----------
  async function pasteTxt() {
    try { const t = await navigator.clipboard.readText(); if (!t) { toast('Die Zwischenablage ist leer.'); return; } insert(t); }
    catch (_) { toast('Einfügen per Knopf ist hier nicht erlaubt. Tippe ins Textfeld, halte gedrückt und wähle „Einfügen“.', 5200, 'err'); }
  }
  async function copyTxt() {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd), t = sel || ta.value; if (!t) return;
    try { await navigator.clipboard.writeText(t); } catch (_) { const a = ta.selectionStart, b = ta.selectionEnd; if (!sel) ta.select(); document.execCommand('copy'); ta.setSelectionRange(a, b); }
    toast(sel ? 'Auswahl kopiert' : 'Ganzer Text kopiert');
  }
  const fq = h('input', { type: 'text', class: 'f', placeholder: 'Suchen', 'aria-label': 'Suchen', style: { flex: '1 1 110px', minWidth: 0 } }), fr = h('input', { type: 'text', class: 'f', placeholder: 'Ersetzen durch', 'aria-label': 'Ersetzen durch', style: { flex: '1 1 110px', minWidth: 0 } });
  const fcnt = h('span', { class: 'xs mut', style: { minWidth: '70px' } }); let fcase = false;
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fre = () => fq.value ? new RegExp(esc(fq.value), fcase ? 'g' : 'gi') : null;
  const fcount = () => { const r = fre(); fcnt.textContent = r ? `${(ta.value.match(r) || []).length} Treffer` : ''; };
  function findNext(dir = 1) {
    const r = fre(); if (!r) return false; const v = ta.value, hay = fcase ? v : v.toLowerCase(), q = fcase ? fq.value : fq.value.toLowerCase();
    let i = dir > 0 ? hay.indexOf(q, ta.selectionEnd) : hay.lastIndexOf(q, ta.selectionStart - 1);
    if (i < 0) i = dir > 0 ? hay.indexOf(q) : hay.lastIndexOf(q);
    if (i < 0) { toast('Nichts gefunden'); return false; }
    ta.focus(); ta.setSelectionRange(i, i + q.length);
    const lines = v.slice(0, i).split('\n').length, lh = parseFloat(getComputedStyle(ta).lineHeight) || 22; ta.scrollTop = Math.max(0, (lines - 3) * lh);   // Fundstelle ins Bild holen
    return true;
  }
  function replaceOne() {
    const q = fq.value; if (!q) return; const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel && (fcase ? sel === q : sel.toLowerCase() === q.toLowerCase())) { hPush(); ta.setRangeText(fr.value, ta.selectionStart, ta.selectionEnd, 'end'); fire(); fcount(); }
    findNext();
  }
  function replaceAll() {
    const r = fre(); if (!r) return; const n = (ta.value.match(r) || []).length; if (!n) { toast('Nichts gefunden'); return; }
    hPush(); ta.value = ta.value.replace(r, () => fr.value); fire(); fcount(); toast(`${n} ${n === 1 ? 'Stelle' : 'Stellen'} ersetzt`);
  }
  const caseB = btn('Aa', { cls: 'sm', title: 'Groß-/Kleinschreibung beachten', onclick: () => { fcase = !fcase; caseB.classList.toggle('on', fcase); fcount(); } });
  const findBar = h('div', { class: 'row', hidden: true, style: { gap: '6px', flexWrap: 'wrap', padding: '8px 10px', borderBottom: '1px solid var(--bd)', background: 'var(--surf)', flex: 'none' } },
    fq, fr, caseB, btn('Weiter', { cls: 'sm', onclick: () => findNext(1) }), btn('Zurück', { cls: 'sm', onclick: () => findNext(-1) }), btn('Ersetzen', { cls: 'sm', onclick: replaceOne }), btn('Alle', { cls: 'sm', onclick: replaceAll, title: 'Alle ersetzen' }), fcnt, h('span', { class: 'sp1' }), btn('Schließen', { icon: 'x', cls: 'ghost icon sm', onclick: () => toggleFind(false) }));
  fq.addEventListener('input', fcount); fq.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findNext(e.shiftKey ? -1 : 1); } });
  function toggleFind(on) { findBar.hidden = !on; if (on) { const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd); if (sel && !sel.includes('\n')) fq.value = sel; fcount(); fq.focus(); fq.select(); } else ta.focus(); }
  // Weitere Funktionen: Datei laden/speichern, Datum, Rechtschreibung, alles löschen
  const spellOn = () => { try { return localStorage.getItem('hs:spell') !== '0'; } catch (_) { return true; } };
  async function grammarCheck() {
    let ok = false; try { ok = localStorage.getItem('hs:ltok') === '1'; } catch (_) { /* egal */ }
    if (!ok) { if (!(await confirmBox('Für die Prüfung wird dein Text (ohne Formeln und Befehle) an den Dienst LanguageTool (languagetool.org) geschickt. Nur dann, wenn du hier bestätigst. Fortfahren?', 'Prüfen'))) return; try { localStorage.setItem('hs:ltok', '1'); } catch (_) { /* egal */ } }
    toast('Prüfe Text …', 6000);
    let ms; try { ms = await checkText(ta.value); } catch (e) { toast(e.message && !/fetch|network/i.test(e.message) ? e.message : 'Keine Verbindung zum Prüfdienst.', 4200, 'err'); return; }
    if (!ms.length) { toast('Keine Fehler gefunden ✓', 3000); return; }
    const snap = ta.value, list = ms.map(m => ({ ...m, word: snap.substr(m.offset, m.length) }));
    sheet(`${list.length} ${list.length === 1 ? 'Vorschlag' : 'Vorschläge'}`, (b, api) => {
      const cards = new Map();
      const shift = (from, d) => { for (const x of list) if (x.offset > from) x.offset += d; };
      const drop = (m) => { list.splice(list.indexOf(m), 1); const c = cards.get(m); c && c.remove(); if (!list.length) api.close(); };
      for (const m of list) {
        const ctxS = snap.slice(Math.max(0, m.offset - 28), m.offset).replace(/\n/g, ' '), ctxE = snap.slice(m.offset + m.length, m.offset + m.length + 28).replace(/\n/g, ' ');
        const card = h('div', { class: 'pack', style: { display: 'block' } },
          h('div', { class: 'sm mut' }, m.kind), h('div', null, '…' + ctxS, h('b', { style: { background: 'rgba(255,200,0,.35)' } }, m.word), ctxE + '…'), h('div', { class: 'sm' }, m.msg),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' } },
            ...m.repl.map(r => btn(r === '' ? '(löschen)' : r, { cls: 'sm pri', onclick: () => { hPush(); const cur = ta.value; if (cur.substr(m.offset, m.length) !== m.word) { toast('Der Text wurde inzwischen geändert – bitte neu prüfen.', 3400, 'err'); return; } ta.setRangeText(r, m.offset, m.offset + m.length, 'preserve'); fire(); shift(m.offset, r.length - m.length); drop(m); } })),
            btn('Ignorieren', { cls: 'sm ghost', onclick: () => drop(m) })));
        cards.set(m, card); b.append(card);
      }
    });
  }
  function openMore() {
    sheet('Weitere Textfunktionen', (b, api) => {
      const item = (label, sub, icon, fn) => h('button', { type: 'button', class: 'pack', onclick: () => { api.close(); setTimeout(fn, 120); } }, h('div', { class: 'pi' }, ic(icon)), h('div', { class: 'pt' }, h('b', null, label), h('span', { class: 'sm mut' }, sub)));
      b.append(
        item('Textdatei einfügen', '.txt oder .md vom Gerät an der Cursorposition einfügen', 'folder', () => { const f = h('input', { type: 'file', accept: '.txt,.md,.markdown,.hdf,text/plain,text/markdown', style: { display: 'none' }, onchange: async () => { const file = f.files[0]; f.remove(); if (!file) return; try { insert(await file.text()); toast(`„${file.name}“ eingefügt`); } catch (e) { toast('Datei konnte nicht gelesen werden', 3200, 'err'); } } }); document.body.append(f); f.click(); }),
        item('Als Textdatei speichern', 'Den Text als .txt sichern (ohne Handschrift)', 'download', () => saveFile(new Blob([ta.value], { type: 'text/plain;charset=utf-8' }), `${fileBase(doc.title)}.txt`)),
        item('Als HDF-Datei speichern', 'Den Text mit Visuals als .hdf sichern', 'download', () => saveFile(new Blob([ta.value], { type: 'text/plain;charset=utf-8' }), `${fileBase(doc.title)}.hdf`)),
        item('Alles markieren', 'Den ganzen Text auswählen', 'check', () => { ta.focus(); ta.select(); }),
        item('Datum einfügen', 'Heutiges Datum an der Cursorposition', 'info', () => insert(new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' }))),
        item(spellOn() ? 'Rechtschreibprüfung ausschalten' : 'Rechtschreibprüfung einschalten', 'Rote Wellenlinien im Textfeld', 'edit', () => { const on = !spellOn(); try { localStorage.setItem('hs:spell', on ? '1' : '0'); } catch (_) { /* egal */ } ta.spellcheck = on; toast(on ? 'Rechtschreibprüfung an' : 'Rechtschreibprüfung aus'); }),
        item('Grammatik und Rechtschreibung prüfen', 'Prüft den Fließtext mit LanguageTool (Text wird dafür online gesendet)', 'check', () => grammarCheck()),
        item('Alles löschen', 'Den ganzen Text entfernen (mit Rückgängig)', 'trash', async () => { if (!ta.value) return; if (await confirmBox('Den ganzen Text löschen? Mit „Rückgängig“ holst du ihn zurück.', 'Löschen')) { hPush(); ta.value = ''; fire(); } }));
    });
  }
  // Textmarker: Linien-Symbol wie die übrigen, mit kleinem gelbem Strich (so sieht der Marker auch auf dem Blatt aus)
  const hlBtn = () => { const b = btn('Textmarker', { icon: 'highlighter', cls: 'icon hlbtn', onclick: wrap('=='), title: 'Textmarker (==Text==)' }); const sv = b.querySelector('svg'), r = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); r.setAttribute('x', '4'); r.setAttribute('y', '19'); r.setAttribute('width', '16'); r.setAttribute('height', '3'); r.setAttribute('rx', '1.5'); r.setAttribute('class', 'hlbar'); sv.append(r); return b; };
  const tb = h('div', { class: 'tb', role: 'toolbar', 'aria-label': 'Formatierung' }, fontBtn, h('i', { class: 'vs' }),
    btn('Fett', { icon: 'bold', cls: 'icon boldbtn', onclick: wrap('**'), title: 'Fett (**Text**)' }), btn('Unterstrichen', { icon: 'underline', cls: 'icon', onclick: wrap('__'), title: 'Unterstrichen (__Text__)' }),
    btn('Durchgestrichen', { icon: 'strike', cls: 'icon', onclick: wrap('~~'), title: 'Durchgestrichen (~~Text~~)' }), hlBtn(),
    btn('Farbe', { icon: 'palette', cls: 'icon', onclick: colorMenu }), h('i', { class: 'vs' }),
    btn('Überschrift', { icon: 'head', cls: 'icon', onclick: linePre('# '), title: 'Überschrift (# am Zeilenanfang)' }), btn('Liste', { icon: 'list', cls: 'icon', onclick: linePre('- '), title: 'Aufzählung (- am Zeilenanfang)' }), btn('Nummerierung', { icon: 'numlist', cls: 'icon', onclick: linePre('1. '), title: 'Nummerierte Liste (1. am Zeilenanfang)' }),
    h('i', { class: 'vs' }), (undoB = btn('Rückgängig', { icon: 'undo', cls: 'icon', onclick: () => hGo(-1), title: 'Rückgängig (Strg/Cmd+Z)', disabled: true })), (redoB = btn('Wiederholen', { icon: 'redo', cls: 'icon', onclick: () => hGo(1), title: 'Wiederholen (Strg/Cmd+Umschalt+Z)', disabled: true })),
    h('i', { class: 'vs' }), btn('Einfügen', { icon: 'paste', cls: 'icon', onclick: pasteTxt, title: 'Text aus der Zwischenablage einfügen' }), btn('Kopieren', { icon: 'copy', cls: 'icon', onclick: copyTxt, title: 'Auswahl (oder alles) kopieren' }), btn('Suchen und Ersetzen', { icon: 'search', cls: 'icon', onclick: () => toggleFind(true), title: 'Suchen und Ersetzen (Strg/Cmd+F)' }),
    h('i', { class: 'vs' }), btn('Sonderzeichen', { icon: 'omega', cls: 'icon', onclick: () => openPalette(), title: 'Sonderzeichen und Kürzel' }), btn('Mehr', { icon: 'more', cls: 'icon', onclick: () => openMore(), title: 'Weitere Textfunktionen' }));
  ta = h('textarea', { id: 'txt', spellcheck: true, lang: 'de', 'aria-label': 'Text', placeholder: 'Schreib oder füg hier deinen Text ein …\n\nTipps: **fett**, __unterstrichen__, ==markiert==, # Überschrift, - Liste\nMathe: x^2, a_1, ->, <=, \\alpha, \\pi', oninput: () => { doc.text = ta.value; hSoon(); saveSoon(); renderSoon(); } });
  ta.spellcheck = spellOn();
  ta.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); hGo(e.shiftKey ? 1 : -1); return; }
    if (mod && k === 'y') { e.preventDefault(); hGo(1); return; }
    if (mod && k === 'b') { e.preventDefault(); wrap('**')(); return; }
    if (mod && k === 'u') { e.preventDefault(); wrap('__')(); return; }
    if (mod && k === 'f') { e.preventDefault(); toggleFind(true); return; }
    // Listen automatisch fortsetzen: Enter hängt „- “ bzw. die nächste Nummer an; Enter auf leerem Punkt beendet die Liste
    if (e.key === 'Enter' && !mod && !e.shiftKey && !e.isComposing && ta.selectionStart === ta.selectionEnd) {
      const v = ta.value, p = ta.selectionStart, ls = v.lastIndexOf('\n', p - 1) + 1, line = v.slice(ls, p), m = /^([-*•] |(\d{1,3})([.)]) )(.*)$/.exec(line);
      if (m) {
        e.preventDefault(); hPush();
        if (!m[4].trim()) ta.setRangeText('', ls, p, 'end');   // leerer Listenpunkt: Liste beenden
        else ta.setRangeText('\n' + (m[2] ? (+m[2] + 1) + m[3] + ' ' : m[1]), p, p, 'end');
        fire();
      }
    }
  });
  info = h('div', { class: 'stat' }); missEl = h('div', { class: 'miss', hidden: true }); errEl = h('div', { class: 'miss', hidden: true });
  const edPane = h('div', { class: 'pane ed on' }, tb, findBar, ta, missEl, errEl, info);
  pagesEl = h('div', { class: 'preview' });
  const pvPane = h('div', { class: 'pane pv' }, pagesEl);
  const split = h('div', { class: 'split' }, edPane, pvPane);
  root.append(bar, segEl, split);
  const showPane = () => { edPane.classList.toggle('on', pane === 'ed'); pvPane.classList.toggle('on', pane === 'pv'); segEl.replaceChildren(seg([['ed', 'Schreiben'], ['pv', 'Vorschau']], () => pane, v => { pane = v; showPane(); })); if (pane === 'pv') drawVisible(); };

  // ---------- Speichern ----------
  const saveNow = async () => { if (!doc) return; if (autoName(doc)) title.value = doc.title; doc.updated = Date.now(); await dbPut('docs', doc); app.docSaved(doc); };
  const saveSoon = debounce(saveNow, 500);
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
    pruneRerolls();
    const n = L.pages.length;
    while (wraps.length < n) {
      const i = wraps.length, cv = h('canvas'), box = h('div', { class: 'cv', style: { aspectRatio: `${L.PW} / ${L.PH}` } }, cv);
      const w = h('div', { class: 'pg' }, h('div', { class: 'cap' }, h('span'), btn('Als PNG', { cls: 'sm ghost', onclick: () => pagePng(i) })), box);
      box.addEventListener('click', (ev) => { if (!rerollAt(w._i, ev, box)) w.classList.toggle('zoom'); }); w._cv = cv; w._i = i; w._box = box; pagesEl.append(w); wraps.push(w); io && io.observe(w);
    }
    while (wraps.length > n) { const w = wraps.pop(); io && io.unobserve(w); w.remove(); }
    wraps.forEach((w, i) => { w._box.style.aspectRatio = `${L.PW} / ${L.PH}`; w.firstChild.firstChild.textContent = `Seite ${i + 1} von ${n}`; dirty.add(i); });
    drawVisible(); updateInfo();
  }
  // Wort in der Vorschau antippen -> nur dieses Wort bekommt andere Varianten
  function rerollAt(pi, ev, box) {
    if (!L || !L.pages[pi]) return false;
    const r = box.getBoundingClientRect(), px = (ev.clientX - r.left) * L.PW / r.width, py = (ev.clientY - r.top) * L.PH / r.height, u = S().size;
    let hit = null;
    for (const e of L.pages[pi]) if (e.wk && e.g && px >= e.x - u * .1 && px <= e.x + e.g.adv + u * .1 && py >= e.y - u * 1.5 && py <= e.y + u * .5) { hit = e.wk; break; }
    if (!hit) return false;
    const s = S(); s.rr = { ...(s.rr || {}) }; s.rr[hit] = (s.rr[hit] || 0) + 1;
    saveSoon(); render();
    toast(`„${hit.slice(hit.indexOf(':') + 1)}“ neu geschrieben – nochmal tippen für eine andere Variante`, 2200);
    return true;
  }
  function pruneRerolls() {   // Einträge zu Wörtern, die es nicht mehr gibt, entfernen
    const s = S(); if (!s.rr || !L) return;
    const da = new Set(); for (const pg of L.pages) for (const e of pg) if (e.wk) da.add(e.wk);
    for (const k of Object.keys(s.rr)) if (!da.has(k)) delete s.rr[k];
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
    const words = (doc.text.match(/\S+/g) || []).length;
    info.replaceChildren(h('span', null, `${words} ${words === 1 ? 'Wort' : 'Wörter'} · ${n} Zeichen · ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}`), h('span', { class: 'sp1' }), h('span', null, FORMATS[fmtOf(S())].name));
    if (L.missing.length) {
      missEl.hidden = false;
      missEl.replaceChildren(ic('alert'), h('span', null, 'Fehlt in dieser Schrift: ', h('b', null, L.missing.slice(0, 14).join(' ') + (L.missing.length > 14 ? ' …' : ''))), btn('Hinzufügen', { cls: 'sm', onclick: () => addMissing(L.missing) }));
    } else missEl.hidden = true;
    const er = L.errors || [];
    if (er.length) {
      const bad = er.filter(e => e.level !== 'warn').length;
      errEl.hidden = false;
      errEl.replaceChildren(ic('alert'), h('span', null, bad ? `${bad} ${bad === 1 ? 'Fehler' : 'Fehler'} im Dokument` + (er.length > bad ? ` und ${er.length - bad} Hinweis${er.length - bad === 1 ? '' : 'e'}` : '') : `${er.length} Hinweis${er.length === 1 ? '' : 'e'} zum Dokument`), btn('Anzeigen', { cls: 'sm', onclick: () => showErrors(er) }));
    } else errEl.hidden = true;
  }
  function showErrors(er) {
    sheet('Fehler und Hinweise', (b, api) => {
      b.append(h('p', { class: 'sm mut' }, 'Der Rest des Dokuments wird trotzdem gezeichnet. Tippe auf einen Eintrag, um zur Zeile zu springen.'));
      for (const e of er.slice().sort((a, c) => a.line - c.line)) {
        b.append(h('button', { type: 'button', class: 'pack', onclick: () => { api.close(); gotoLine(e.line); } },
          h('div', { class: 'pi' }, ic(e.level === 'warn' ? 'info' : 'alert')), h('div', { class: 'pt' }, h('b', null, `Zeile ${e.line}`), h('span', { class: 'sm mut' }, e.msg))));
      }
    });
  }
  function gotoLine(n) {
    const lines = ta.value.split('\n'); let pos = 0; for (let i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    if (pane !== 'ed') { pane = 'ed'; showPane(); }
    ta.focus(); ta.setSelectionRange(pos, pos + (lines[n - 1] || '').length);
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22; ta.scrollTop = Math.max(0, (n - 4) * lh);
  }
  function addMissing(chars) {
    const need = new Set(), loose = [];
    for (const ch of chars) { const p = PACKS.filter(p => p.groups.some(g => g.c.includes(ch))).sort((a, b) => a.bit - b.bit)[0]; p ? need.add(p.id) : loose.push(ch); }
    const rec = app.fonts.find(f => f.id === (doc.fontId || app.fontId));
    if (rec && !rec.builtin) { openTopUp(app, rec, { chars: chars.join('') }); return; }
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
      // GoodNotes-Vorlagen haben feste Linien: Größe und Ränder kommen aus der Vorlage
      const pickGn = (paper, fmt) => { gnApply(s, paper, fmt); ch(); setTimeout(() => { api.close(); setTimeout(openSettings, 280); }, 150); };
      const sec = (t) => h('h3', { style: { margin: '20px 0 4px' } }, t);
      b.append(h('div', { class: 'row wrap2', style: { gap: '8px', marginBottom: '4px' } }, btn('Neu würfeln', { icon: 'dice', cls: 'sm', onclick: () => { s.seed = (Math.random() * 1e6) | 0; ch(); } }), btn('Als Standard merken', { cls: 'sm', onclick: () => { const v = { ...s }; delete v.rr; delete v.seed; kvSet('lastS', v); toast('Das gilt jetzt für neue Dokumente'); } }), ...(app.folderOf(doc.folder) ? [btn(`Für „${app.folderOf(doc.folder).name}“ merken`, { cls: 'sm', title: 'Gilt dann für neue Dokumente in diesem Ordner', onclick: async () => { const f = app.folderOf(doc.folder), v = { ...s }; delete v.rr; delete v.seed; f.s = v; f.updated = Date.now(); await app.saveFolders(); toast(`Gilt jetzt für neue Dokumente in „${f.name}“`); } })] : []), btn('Zurücksetzen', { cls: 'sm', onclick: () => { Object.assign(s, { ...DEF }); ch(); b.parentNode.parentNode && b.replaceChildren(); openSettings(); } })));
      b.append(sec('Papier'), gnPicker(() => ({ paper: s.paper, fmt: s.fmt }), pickGn),
        h('p', { class: 'xs mut' }, 'Die Schrift sitzt genau auf den Linien der eingebauten GoodNotes-Vorlage' + (gnOf(s) && gnOf(s).vp ? ' (auf jeder zweiten Reihe)' : '') + '. Im GoodNotes-Export mit echten Strichen wird diese Vorlage als Hintergrund verwendet.'),
        ...(s.paper === 'gncornell' || s.paper === 'gnnoten' ? [] : [h('label', { class: 'f' }, 'Ränder'), chips([['schmal', 'Schmal'], ['normal', 'Normal'], ['breit', 'Breit']], () => Object.entries(MARGINS).find(([, v]) => v[0] === s.ml && v[1] === s.mr)?.[0] || '', (v) => { const m = MARGINS[v]; [s.ml, s.mr, s.mt, s.mb] = m; ch(); })]),
        toggle('Scan-Effekt', 'Leichte Körnung und Schatten wie bei einem Scan (nur PDF und Bilder)', () => s.scan, setK('scan')));
      b.append(sec('Stiftfarbe'), (() => { const w = h('div', { class: 'chips inks' }), col = h('input', { type: 'color', value: s.ink, 'aria-label': 'Eigene Farbe', oninput: (e) => { s.ink = e.target.value; ch(); d(); } });
        const d = () => w.replaceChildren(...INKS.map(([c, n]) => h('button', { type: 'button', class: 'sw' + (s.ink === c ? ' on' : ''), style: { background: c }, title: n, 'aria-label': n, onclick: () => { s.ink = c; ch(); d(); } })), h('label', { class: 'sw swc' + (INKS.some(([c]) => c === s.ink) ? '' : ' on'), title: 'Eigene Farbe' }, col)); d(); return w; })(),
        h('p', { class: 'xs mut', style: { margin: '6px 0 0' } }, 'Geschrieben wird immer mit Kugelschreiber.'));
      b.append(sec('Schrift'), range('Größe', () => s.size, setK('size'), 13, 42, .5, v => v + ' pt'), range('Zeilenabstand', () => s.lh, setK('lh'), 2, 4.6, .05, v => v.toFixed(2) + '×'),
        range('Buchstabenabstand', () => s.sp, setK('sp'), .6, 1.4, .02, v => Math.round(v * 100) + ' %'), range('Wortabstand', () => s.wsp, setK('wsp'), .5, 2, .05, v => Math.round(v * 100) + ' %'),
        range('Neigung', () => s.slant, setK('slant'), -10, 18, .5, v => v + '°'), range('Größe der Großbuchstaben', () => s.capsc, setK('capsc'), .7, 1.7, .05, v => Math.round(v * 100) + ' %'));
      b.append(sec('Natürlich wirken'), h('p', { class: 'mut xs', style: { margin: '0 0 6px' } }, 'Kleine Zufälle, damit es nicht zu perfekt aussieht. Bei „Aus“ ist es exakt gleichmäßig.'),
        range('Unregelmäßigkeit insgesamt', () => s.jit, setK('jit'), 0, 1.6, .05, v => v ? Math.round(v * 100) + ' %' : 'Aus'),
        ...[['jw', 'Wortabstände'], ['jl', 'Zeilenanfang links'], ['jb', 'Grundlinie (auf und ab, schief)'], ['jg', 'Größe und Drehung der Buchstaben'], ['ja', 'Buchstabenabstände']].map(([k, t]) => range(t, () => s[k] == null ? 1 : s[k], setK(k), 0, 2, .05, v => v ? Math.round(v * 100) + ' %' : 'Aus')),
        range('Ermüdung über mehrere Seiten', () => s.tired || 0, setK('tired'), 0, 1, .05, v => v ? Math.round(v * 100) + ' %' : 'Aus'),
        h('p', { class: 'mut xs', style: { margin: '-4px 0 8px' } }, 'Auf späteren Seiten wird die Schrift ganz leicht unruhiger, wie beim echten Schreiben.'),
        toggle('Buchstabenpaare unterschneiden', 'T, V, W, F, P und Satzzeichen rücken näher heran, wie beim echten Schreiben', () => s.kern !== false, (v) => { s.kern = v; ch(); }),
        toggle('Am Zeilenende enger', 'Die letzten Buchstaben einer Zeile stehen etwas dichter', () => s.endTight !== false, (v) => { s.endTight = v; ch(); }),
        h('p', { class: 'mut xs', style: { margin: '6px 0' } }, 'Tipp: Gefällt dir ein Wort in der Vorschau nicht, tippe es an. Dann wird nur dieses Wort neu geschrieben.'),
        ...(s.rr && Object.keys(s.rr).length ? [btn(`Neu geschriebene Wörter zurücksetzen (${Object.keys(s.rr).length})`, { cls: 'sm', onclick: () => { s.rr = {}; ch(); api.close(); openSettings(); } })] : []),
        btn('Alle Variationen aus', { cls: 'sm', onclick: () => { s.jit = 0; ch(); api.close(); openSettings(); } }));
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
      // Seitenauswahl: „2-3, 5“ -> nur diese Seiten exportieren (Seitenzahlen auf dem Blatt bleiben die echten)
      let sel = '';
      const pagesOf = (t) => { const n = L.pages.length, out = new Set(); for (const part of t.split(/[,;\s]+/).filter(Boolean)) { const m = /^(\d+)(?:\s*[-–]\s*(\d*))?$/.exec(part); if (!m) return null; const a = +m[1], z = m[2] === undefined ? a : m[2] === '' ? n : +m[2]; for (let i = Math.max(1, Math.min(a, z)); i <= Math.min(n, Math.max(a, z)); i++) out.add(i - 1); } return [...out].sort((x, y) => x - y); };
      const LX = () => { if (!sel.trim()) return L; const ps = pagesOf(sel); if (!ps || !ps.length) throw new Error('Seitenauswahl verstehe ich nicht (Beispiel: 2-3, 5)'); return { ...L, pages: ps.map((i) => L.pages[i]) }; };
      const run = (fn) => async () => { if (busy) return; busy = true; bar.style.display = ''; prog(0); msg.textContent = 'Wird erstellt …'; try { await fn(); } catch (e) { msg.textContent = 'Das hat nicht geklappt: ' + e.message; toast('Export fehlgeschlagen', 3500, 'err'); } finally { busy = false; bar.style.display = 'none'; } };
      const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.pdf', { type: 'application/pdf' })] }));
      const pdf = (share) => run(async () => { const blob = await exportPdf(LX(), S(), doc.title, dpi, prog); const r = await saveFile(blob, fileBase(doc.title) + '.pdf', { share }); msg.textContent = r === 'abgebrochen' ? '' : `PDF ${share ? 'geteilt' : 'gespeichert'} (${fmtSize(blob.size)}, ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}).`; });
      const gnote = () => run(async () => { const blob = await exportGoodNotes(LX(), S(), doc.title, dpi, prog); const r = await saveFile(blob, fileBase(doc.title) + '.goodnotes'); msg.textContent = r === 'abgebrochen' ? '' : `GoodNotes-Datei gespeichert (${fmtSize(blob.size)}, ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}).` + (S().fmt === 'gn' ? '' : ' Tipp: Format „GoodNotes Standard“ passt genau auf leere Standardseiten.'); });
      const canShareGn = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.goodnotes', { type: 'application/octet-stream' })] }));
      const gink = (share) => run(async () => { const blob = await exportGoodNotesInk(LX(), S(), doc.title, prog); const r = await saveFile(blob, fileBase(doc.title) + '.goodnotes', { share }); msg.textContent = r === 'abgebrochen' ? '' : `GoodNotes-Datei mit echten Strichen ${r === 'geteilt' ? 'geteilt' : 'gespeichert'} (${fmtSize(blob.size)}, ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}).`; });
      const png = (transparent) => run(async () => { const files = await exportPngs(LX(), S(), doc.title, dpi, transparent, prog); if (files.length === 1) { await saveFile(files[0].blob, files[0].name); } else await saveFile(zipOf(files), fileBase(doc.title) + (transparent ? '-transparent' : '') + '-PNG.zip'); msg.textContent = 'Bilder gespeichert.'; });
      const gnPaper = gnOf(S());
      const selIn = h('input', { type: 'text', placeholder: `Alle ${L.pages.length} Seiten (z. B. 2-3, 5)`, inputmode: 'numeric', oninput: () => { sel = selIn.value; const ps = sel.trim() ? pagesOf(sel) : null; selHint.textContent = !sel.trim() ? '' : ps && ps.length ? `${ps.length} von ${L.pages.length} ${L.pages.length === 1 ? 'Seite' : 'Seiten'}: ${ps.map((i) => i + 1).join(', ')}` : 'Beispiel: 2-3, 5'; } }), selHint = h('p', { class: 'xs mut', style: { margin: '4px 2px 0' } });
      if (L.pages.length > 1) b.append(h('label', { class: 'f' }, 'Seiten'), selIn, selHint);
      b.append(h('label', { class: 'f' }, 'Qualität'), chips([[150, 'Standard'], [200, 'Hoch (empfohlen)'], [300, 'Sehr hoch']], () => dpi, v => { dpi = v; }),
        h('div', { class: 'xgroup' }, 'Für GoodNotes'),
        h('div', { style: { display: 'grid', gap: '10px' } },
          canShareGn ? btn('Echte Striche: in GoodNotes öffnen', { icon: 'share', cls: 'pri', onclick: gink(true) }) : null,
          btn('Echte Striche (.goodnotes) speichern', { icon: 'download', cls: canShareGn ? '' : 'pri', onclick: gink(false) }),
          h('p', { class: 'xhint' }, gnPaper ? 'Radier- und bearbeitbar, auf der eingebauten GoodNotes-Vorlage. Die Schrift sitzt genau auf den Linien.' : 'Radier- und bearbeitbar, auf leerer Standardseite. Für Linien oder Kästchen in den Einstellungen das Papier „GoodNotes liniert“ oder „GoodNotes kariert“ wählen.'),
          canShare ? btn('PDF in GoodNotes öffnen', { icon: 'share', onclick: pdf(true) }) : null,
          btn('Seiten als Bild (.goodnotes)', { icon: 'download', onclick: gnote() })),
        h('div', { class: 'xgroup' }, 'Andere Formate'),
        h('div', { style: { display: 'grid', gap: '10px' } },
          btn('PDF speichern', { icon: 'download', onclick: pdf(false) }),
          btn('PNG je Seite' + (L.pages.length > 1 ? ' (ZIP)' : ''), { icon: 'image', onclick: png(false) }),
          btn('Nur Schrift, transparent (PNG)', { icon: 'layers', onclick: png(true) }),
          videoSupported() ? btn('Schreib-Video (erste gewählte Seite)', { icon: 'pen', onclick: run(async () => { const ps = sel.trim() ? pagesOf(sel) : [0]; if (!ps || !ps.length) throw new Error('Seitenauswahl verstehe ich nicht'); msg.textContent = 'Video wird aufgenommen … bitte die App offen lassen'; const { blob, ext } = await exportVideo(L, S(), ps[0], prog); const r = await saveFile(blob, fileBase(doc.title) + '.' + ext, { share: true }); msg.textContent = r === 'abgebrochen' ? '' : `Video fertig (${fmtSize(blob.size)})`; }) }) : null),
        bar, msg, h('div', { class: 'note' }, h('b', null, 'In GoodNotes: '), 'Auf + → Importieren tippen und die Datei wählen. Jede Seite wird eine Seite im Heft. Das transparente PNG fügst du als Bild auf eigenes Papier ein.'));
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
      const known = new Set();
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
    async load(d) { doc = d; title.value = d.title || ''; ta.value = d.text || ''; hReset(); toggleFind(false); wraps.forEach(w => w.remove()); wraps = []; dirty.clear(); L = null; await render(); },
    refresh() { return render(); },
    focus() { ta && ta.focus(); },
    get doc() { return doc; },
  };
}
