// Assistent: Schrift erstellen oder erweitern (Pakete wählen -> Vorlage -> Bögen hochladen -> prüfen -> speichern)
import { h, $, uid, tick, blobOf, saveFile, toast, fmtSize } from './util.js';
import { ic, btn, closeSheets } from './ui.js';
import { PACKS, PACK_BY_ID, buildCells, pageCount, maskOf, idsOf, hashOf, packInfo, PER_PAGE } from './packs.js';
import { renderSheet, cellsOnPage } from './sheet.js';
import { findMarker, readPage, buildGlyphs } from './reader.js';
import { pagesOf } from './pdfin.js';
import { makePdf, makeZip } from './pdfw.js';
import { dbPut, kvGet, kvSet, countGlyphs } from './store.js';

const GROUPS = [
  ['Empfohlen', ['standard', 'sonder']],
  ['Schule und Studium', ['mathe', 'mathe2', 'griechisch']],
  ['Sprachen mit Akzenten', ['franz', 'west', 'ost', 'kyrill']],
  ['Asiatische Schriften', ['kana', 'kanji', 'zh1', 'zh2', 'zh3']],
  ['Sonstiges', ['symbole']],
];
const clean = (t) => [...new Set([...(t || '').normalize('NFC')].filter(c => !/\s/.test(c)))].join('');

export function openWizard(app, { font = null, preselect = [], customChars = '', skipTo = 0 } = {}) {
  const have = new Set(font ? font.packs || [] : []);
  const S = {
    step: skipTo || 1, sel: new Set(preselect.length ? preselect : font ? [] : ['standard', 'sonder']), custom: { chars: customChars, n: 1 },
    pages: [], busy: false, result: null, name: font ? font.name : 'Meine Schrift', mode: font ? 'add' : 'new', off: new Set(), fromQr: new Set(), customs: {},
  };
  const modal = h('div', { class: 'modal on', role: 'dialog', 'aria-label': 'Schrift erstellen' }); document.body.append(modal);
  const close = () => { modal.remove(); };
  const head = h('div', { class: 'bar' }), mb = h('div', { class: 'mb' }), mf = h('div', { class: 'mf' });
  modal.append(head, mb, mf);
  const cells = () => buildCells(maskOf([...S.sel]), S.custom.chars ? { chars: clean(S.custom.chars), n: S.custom.n } : null);
  const stepsEl = () => h('div', { class: 'steps' }, ...['Auswahl', 'Vorlage', 'Hochladen', 'Prüfen'].flatMap((t, i) => [i ? h('u') : null, h('i', { class: S.step === i + 1 ? 'on' : S.step > i + 1 ? 'done' : '' }, S.step > i + 1 ? '✓' : String(i + 1)), S.step === i + 1 ? h('span', null, t) : null]));
  const go = (n) => { S.step = n; draw(); mb.scrollTop = 0; };

  function draw() {
    head.replaceChildren(btn('Schließen', { icon: 'x', cls: 'ghost icon', onclick: () => { if (S.busy) return; close(); } }), stepsEl(), h('span', { style: { width: '40px' } }));
    mb.replaceChildren(); mf.replaceChildren();
    ({ 1: step1, 2: step2, 3: step3, 4: step4 })[S.step]();
  }

  // ---------- 1. Auswahl ----------
  function step1() {
    const w = h('div', { class: 'wrap' }); mb.append(w);
    w.append(h('h1', null, font ? `„${font.name}“ erweitern` : 'Deine eigene Schrift erstellen'),
      h('p', { class: 'mut' }, 'Wähle, welche Zeichen du schreiben möchtest. Daraus entsteht ein Bogen zum Ausfüllen. Du kannst später jederzeit weitere Pakete hinzufügen.'));
    const sum = h('div'), foot = h('div');
    const redraw = () => {
      const c = cells(), uniq = new Set(c.map(x => x.ch)).size, pages = pageCount(c);
      sum.replaceChildren(h('div', { class: 'row wrap2' }, h('span', { class: 'chip ac' }, `${uniq} Zeichen`), h('span', { class: 'chip' }, `${c.length} Kästchen`), h('span', { class: 'chip' }, `${c.length ? pages : 0} ${pages === 1 ? 'Seite' : 'Seiten'}`)));
      mf.replaceChildren(btn('Schon ausgefüllte Bögen hochladen', { cls: 'sm', onclick: () => go(3) }), h('span', { class: 'sp1' }), sumChips(), btn('Weiter', { cls: 'pri', disabled: !c.length, onclick: () => { if (S.custom.chars) kvSet('custom:' + hashOf({ chars: clean(S.custom.chars), n: S.custom.n }), { chars: clean(S.custom.chars), n: S.custom.n }); go(2); } }));
      list.querySelectorAll('.pack').forEach(b => b.classList.toggle('on', S.sel.has(b.dataset.id)));
    };
    const sumChips = () => sum;
    const list = h('div');
    for (const [gname, ids] of GROUPS) {
      list.append(h('h3', { style: { margin: '16px 0 8px' } }, gname));
      for (const id of ids) {
        const p = PACK_BY_ID[id], inf = packInfo(p);
        list.append(h('button', { type: 'button', class: 'pack', dataset: { id }, onclick: () => { S.sel.has(id) ? S.sel.delete(id) : S.sel.add(id); redraw(); } },
          h('div', { class: 'pi' }, p.icon), h('div', { class: 'pt' }, h('b', null, p.name, have.has(id) ? h('span', { class: 'chip ok', style: { marginLeft: '8px' } }, 'vorhanden') : null), h('span', { class: 'sm mut' }, p.text), h('div', { class: 'xs mut', style: { marginTop: '3px' } }, `${inf.zeichen} Zeichen · ${inf.seiten} ${inf.seiten === 1 ? 'Seite' : 'Seiten'}`)),
          h('div', { class: 'ck' }, ic('check'))));
      }
    }
    const ta = h('textarea', { class: 'f', rows: 2, placeholder: 'z. B. ŝ ǒ ₂ ✿ …', value: S.custom.chars, oninput: () => { S.custom.chars = ta.value; redraw(); } });
    ta.value = S.custom.chars;
    w.append(list, h('h3', { style: { margin: '18px 0 6px' } }, 'Eigene Zeichen'), h('p', { class: 'sm mut' }, 'Jedes beliebige Unicode-Zeichen, das du zusätzlich brauchst. Einfach hier einfügen oder tippen.'), ta,
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'sm' }, 'Wie oft schreiben?'), h('div', { class: 'seg' }, ...[1, 2, 3].map(n => h('button', { type: 'button', class: S.custom.n === n ? 'on' : '', onclick: (e) => { S.custom.n = n; [...e.target.parentNode.children].forEach((b, i) => b.classList.toggle('on', i + 1 === n)); redraw(); } }, n + '×')))),
      h('div', { class: 'note' }, 'Tipp: Mehr Pakete heißt mehr Seiten zum Ausfüllen. Fang mit „Standard“ an, der Rest geht später immer noch.'));
    redraw();
  }

  // ---------- 2. Vorlage ----------
  function step2() {
    const c = cells(), pages = pageCount(c), mask = maskOf([...S.sel]), custom = S.custom.chars ? { chars: clean(S.custom.chars), n: S.custom.n } : null, chash = hashOf(custom);
    const w = h('div', { class: 'wrap' }); mb.append(w);
    const bar = h('div', { class: 'prog', style: { display: 'none', margin: '10px 0' } }, h('i')), msg = h('p', { class: 'sm mut' });
    const make = async (kind, share) => {
      if (S.busy) return; S.busy = true; bar.style.display = ''; msg.textContent = 'Vorlage wird gebaut …';
      try {
        const files = [], jp = [];
        for (let p = 0; p < pages; p++) {
          const cv = await renderSheet(c, p, pages, { title: S.name === 'Meine Schrift' && !font ? 'Meine Schrift' : S.name, mask, chash }, 3);
          if (kind === 'pdf') { const b = await blobOf(cv, 'image/jpeg', .93); jp.push({ jpeg: new Uint8Array(await b.arrayBuffer()), px: [cv.width, cv.height], pt: [595.2756, 841.8898] }); }
          else { const b = await blobOf(cv, 'image/png'); files.push({ name: `Vorlage-${String(p + 1).padStart(2, '0')}.png`, data: new Uint8Array(await b.arrayBuffer()) }); }
          bar.firstChild.style.width = ((p + 1) / pages * 100) + '%'; await tick();
        }
        const blob = kind === 'pdf' ? makePdf(jp, 'Schreib-Vorlage') : makeZip(files);
        const r = await saveFile(blob, kind === 'pdf' ? 'Schreib-Vorlage.pdf' : 'Schreib-Vorlage-Bilder.zip', { share });
        msg.textContent = r === 'abgebrochen' ? '' : `Fertig (${fmtSize(blob.size)}). ${share ? '' : 'Die Datei liegt in deinen Downloads.'}`;
      } catch (e) { msg.textContent = 'Das hat nicht geklappt: ' + e.message; } finally { S.busy = false; bar.style.display = 'none'; bar.firstChild.style.width = '0'; }
    };
    const canShare = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.pdf', { type: 'application/pdf' })] }));
    w.append(h('h1', null, 'Vorlage holen'), h('p', { class: 'mut' }, `${c.length} Kästchen auf ${pages} ${pages === 1 ? 'Seite' : 'Seiten'}. Jeder Bogen hat einen eigenen QR-Code, daran erkennt die App später automatisch, welche Zeichen darauf stehen.`),
      h('div', { class: 'card' },
        h('div', { class: 'grid2' }, btn('Als PDF laden', { icon: 'download', cls: 'pri', onclick: () => make('pdf', false) }), btn('Als Bilder (ZIP)', { icon: 'image', onclick: () => make('png', false) })),
        canShare ? h('div', { style: { marginTop: '10px' } }, btn('Teilen / in GoodNotes öffnen', { icon: 'share', cls: 'sm', onclick: () => make('pdf', true) })) : null, bar, msg),
      h('h3', { style: { margin: '20px 0 8px' } }, 'So geht es weiter'),
      h('div', { class: 'card sm' }, h('ol', { style: { margin: 0, paddingLeft: '20px', display: 'grid', gap: '8px' } },
        h('li', null, h('b', null, 'Ausfüllen: '), 'Öffne die PDF in GoodNotes (oder druck sie aus) und schreib jedes Zeichen in sein Kästchen, so wie du es sonst schreibst. Die blaue Linie ist die Grundlinie.'),
        h('li', null, h('b', null, 'Stift: '), 'Am besten ein dunkler Stift in normaler Schreibgröße. Nicht den Kästchenrand berühren.'),
        h('li', null, h('b', null, 'Exportieren: '), 'In GoodNotes über Teilen → „Als PDF exportieren“ (oder als Bilder). Bei Papier: scannen oder gerade von oben fotografieren.'),
        h('li', null, h('b', null, 'Hochladen: '), 'Im nächsten Schritt wählst du die Datei aus. Alles läuft auf deinem Gerät, nichts wird hochgeladen.'))),
      h('div', { class: 'note' }, 'Du musst nicht alles auf einmal schaffen: Du kannst Seite für Seite hochladen und später weitere Seiten ergänzen.'));
    mf.append(btn('Zurück', { onclick: () => go(1) }), h('span', { class: 'sp1' }), btn('Ich habe sie ausgefüllt', { cls: 'pri', onclick: () => go(3) }));
  }

  // ---------- 3. Hochladen ----------
  async function customFor(hash) {
    if (hash === '0') return null;
    if (S.customs[hash]) return S.customs[hash];
    const c = await kvGet('custom:' + hash); if (c) return (S.customs[hash] = c);
    if (S.custom.chars && hashOf({ chars: clean(S.custom.chars), n: S.custom.n }) === hash) return (S.customs[hash] = { chars: clean(S.custom.chars), n: S.custom.n });
    return undefined;
  }
  async function addFiles(files, listEl, statEl) {
    S.busy = true;
    try {
      for (const f of files) {
        let pgs;
        try { statEl.textContent = `Lese ${f.name} …`; pgs = await pagesOf(f); } catch (e) { toast('„' + f.name + '“ konnte nicht gelesen werden: ' + e.message, 5000, 'err'); continue; }
        for (const pg of pgs) {
          const item = { id: uid(), name: pg.name, status: 'läuft', thumb: null, cells: null };
          S.pages.push(item); thumbOf(pg.canvas, item); draw3(listEl);
          statEl.textContent = `Erkenne ${pg.name} …`; await tick();
          try {
            const qr = await findMarker(pg.canvas); let mark = qr && qr.marker, cellsAll, custom = null;
            if (mark) {
              custom = await customFor(mark.chash);
              if (custom === undefined) { item.status = 'eigene Zeichen fehlen'; item.pg = pg; item.qr = qr; item.need = mark; draw3(listEl); continue; }
              cellsAll = buildCells(mark.mask, custom);
            } else { item.status = 'kein QR-Code'; item.pg = pg; draw3(listEl); continue; }
            await readItem(item, pg.canvas, cellsAll, mark, qr);
          } catch (e) { item.status = 'Fehler: ' + e.message; }
          draw3(listEl);
        }
      }
    } finally { S.busy = false; statEl.textContent = ''; draw3(listEl); renderFoot3(); }
  }
  async function readItem(item, canvas, cellsAll, mark, qr) {
    const list = cellsOnPage(cellsAll, mark.page);
    if (!list.length) { item.status = 'Seite gehört nicht zum Paket'; return; }
    const rd = await readPage(canvas, list, qr); item.cells = rd.cells; item.info = rd.info; item.mark = mark;
    const filled = rd.cells.filter(c => c.flag !== 'leer').length;
    item.status = filled ? 'ok' : 'leer'; item.label = `Paket-Seite ${mark.page + 1} von ${mark.pages}`; item.filled = filled; item.total = rd.cells.length; item.pg = null;
    S.fromQr.add(mark.mask);
    if (rd.info && !rd.info.ok) item.warn = 'Raster nur ungefähr erkannt: bitte Ergebnis genau prüfen';
  }
  function thumbOf(cv, item) { const t = document.createElement('canvas'), k = 220 / Math.max(cv.width, cv.height); t.width = Math.round(cv.width * k); t.height = Math.round(cv.height * k); t.getContext('2d').drawImage(cv, 0, 0, t.width, t.height); item.thumb = t; }
  function draw3(el) {
    el.replaceChildren(...S.pages.map(p => {
      const ok = p.status === 'ok', bad = !ok && p.status !== 'läuft';
      const extra = [];
      if (p.status === 'kein QR-Code' && p.pg) {
        const c = cells(), n = pageCount(c), sel = h('select', null, ...Array.from({ length: n }, (_, i) => h('option', { value: i }, `Seite ${i + 1} von ${n} (Auswahl aus Schritt 1)`)));
        extra.push(h('div', { class: 'xs mut', style: { margin: '6px 0 4px' } }, 'Der QR-Code ist nicht lesbar. Wähle, welche Seite es ist:'), c.length ? sel : h('div', { class: 'xs' }, 'Gehe zurück und wähle die Pakete aus.'),
          c.length ? btn('Übernehmen', { cls: 'sm', onclick: async () => { p.status = 'läuft'; draw3(el); const mark = { mask: maskOf([...S.sel]), chash: '0', page: +sel.value, pages: n }; await readItem(p, p.pg.canvas, c, mark, null); draw3(el); renderFoot3(); } }) : null);
      }
      if (p.status === 'eigene Zeichen fehlen') {
        const inp = h('input', { type: 'text', placeholder: 'Eigene Zeichen dieses Bogens' });
        extra.push(h('div', { class: 'xs mut', style: { margin: '6px 0 4px' } }, 'Dieser Bogen hat eigene Zeichen. Gib sie genau so ein, wie bei der Vorlage:'), inp, btn('Prüfen', { cls: 'sm', onclick: async () => { for (const n of [1, 2, 3]) { const cu = { chars: clean(inp.value), n }; if (hashOf(cu) === p.need.chash) { S.customs[p.need.chash] = cu; kvSet('custom:' + p.need.chash, cu); p.status = 'läuft'; draw3(el); await readItem(p, p.pg.canvas, buildCells(p.need.mask, cu), p.need, p.qr); draw3(el); renderFoot3(); return; } } toast('Das passt nicht zu diesem Bogen.', 3500, 'err'); } }));
      }
      return h('div', { class: 'p' }, p.thumb, h('div', { style: { marginTop: '5px' } }, h('span', { class: 'chip ' + (ok ? 'ok' : bad ? 'warn' : '') }, ok ? `${p.filled} von ${p.total} gelesen` : p.status)), h('div', { class: 'xs mut', style: { marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.label || p.name), p.warn ? h('div', { class: 'xs', style: { color: 'var(--warn)' } }, p.warn) : null, ...extra,
        btn('Entfernen', { cls: 'ghost sm', onclick: () => { S.pages = S.pages.filter(x => x !== p); draw3(el); renderFoot3(); } }));
    }));
  }
  let renderFoot3 = () => {};
  function step3() {
    const w = h('div', { class: 'wrap' }); mb.append(w);
    const listEl = h('div', { class: 'pgs' }), statEl = h('p', { class: 'sm mut', style: { minHeight: '20px' } });
    const input = h('input', { type: 'file', accept: 'application/pdf,image/*', multiple: true, class: 'sr', onchange: () => { addFiles([...input.files], listEl, statEl); input.value = ''; } });
    const drop = h('div', { class: 'drop' }, ic('upload'), h('p', { style: { margin: '8px 0 4px', fontWeight: 600 } }, 'Ausgefüllte Bögen hier ablegen'), h('p', { class: 'sm mut' }, 'PDF oder Bilder, auch mehrere Dateien auf einmal'), btn('Dateien auswählen', { cls: 'pri', onclick: () => input.click() }), input);
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); }); drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); addFiles([...e.dataTransfer.files], listEl, statEl); });
    w.append(h('h1', null, 'Bögen hochladen'), h('p', { class: 'mut' }, 'Die App liest den QR-Code, richtet jeden Bogen aus und schneidet die Kästchen aus. Fotos gehen auch, ein PDF-Export aus GoodNotes liefert aber das beste Ergebnis.'), drop, statEl, listEl,
      h('div', { class: 'note' }, 'Deine Bögen bleiben auf deinem Gerät. Es wird nichts an einen Server geschickt.'));
    renderFoot3 = () => {
      const ready = S.pages.filter(p => p.status === 'ok').length;
      mf.replaceChildren(btn('Zurück', { onclick: () => go(S.sel.size ? 2 : 1) }), h('span', { class: 'sp1' }), h('span', { class: 'sm mut' }, ready ? `${ready} ${ready === 1 ? 'Bogen' : 'Bögen'} bereit` : ''), btn('Zeichen bauen', { cls: 'pri', disabled: !ready || S.busy, onclick: () => go(4) }));
    };
    draw3(listEl); renderFoot3();
  }

  // ---------- 4. Prüfen und speichern ----------
  async function step4() {
    const w = h('div', { class: 'wrap' }); mb.append(w);
    const all = S.pages.filter(p => p.status === 'ok').flatMap(p => p.cells);
    const bar = h('div', { class: 'prog', style: { margin: '14px 0' } }, h('i')), msg = h('p', { class: 'sm mut' }, 'Zeichen werden gebaut …');
    w.append(h('h1', null, 'Fast fertig'), msg, bar);
    mf.append(btn('Zurück', { onclick: () => go(3), disabled: true }));
    S.busy = true;
    try {
      S.result = await buildGlyphs(all, font ? font.ref : {}, p => { bar.firstChild.style.width = (p * 100) + '%'; });
    } catch (e) { msg.textContent = 'Fehler beim Bauen: ' + e.message; S.busy = false; mf.replaceChildren(btn('Zurück', { onclick: () => go(3) })); return; }
    S.busy = false; S.off = new Set();
    const res = S.result, flagged = new Map(); for (const c of all) if (c.flag === 'rand') flagged.set(c.ch + '|' + c.v, 'rand');
    const empties = all.filter(c => c.flag === 'leer').map(c => c.ch);
    const nGl = countGlyphs(res.g), nCh = Object.keys(res.g).length;
    const tiles = h('div', { class: 'gl' }), cnt = h('span', { class: 'chip ac' });
    const upd = () => { const n = nGl - S.off.size; cnt.textContent = `${n} von ${nGl} Zeichen-Bildern werden gespeichert`; };
    for (const ch of Object.keys(res.g)) res.g[ch].forEach((gl, i) => {
      const key = ch + '|' + i, bad = flagged.has(key) || flagged.has(ch + '|' + gl.v);
      const im = new Image(); im.src = gl.src; im.style.cssText = 'max-width:92%;max-height:92%;object-fit:contain';
      const t = h('button', { type: 'button', class: 'g' + (bad ? ' bad' : ''), title: bad ? 'Berührt den Kästchenrand – tippen zum Ausschließen' : 'Tippen zum Ausschließen', onclick: () => { const k = ch + '|' + i; S.off.has(k) ? S.off.delete(k) : S.off.add(k); t.classList.toggle('off'); upd(); } }, h('i', null, ch), im);
      if (bad && res.g[ch].filter((g2, j) => !(flagged.has(ch + '|' + j) || flagged.has(ch + '|' + g2.v))).length >= 2) { S.off.add(key); t.classList.add('off'); } // angeschnittene Zeichen: vorab ausschließen, wenn genug gute da sind
      tiles.append(t);
    });
    upd();
    const target = font; const nameIn = h('input', { type: 'text', value: S.name, maxlength: 60, oninput: () => { S.name = nameIn.value; } });
    const missPages = []; // erwartete Seiten, die nicht hochgeladen wurden
    for (const m of new Set(S.pages.filter(p => p.status === 'ok').map(p => p.mark.mask + '|' + p.mark.pages))) { const [mask, pages] = m.split('|').map(Number); const got = new Set(S.pages.filter(p => p.status === 'ok' && p.mark.mask === mask).map(p => p.mark.page)); for (let i = 0; i < pages; i++) if (!got.has(i)) missPages.push(i + 1); }
    msg.remove(); bar.remove();
    w.append(h('div', { class: 'row wrap2', style: { margin: '6px 0 12px' } }, cnt, h('span', { class: 'chip' }, `${nCh} verschiedene Zeichen`), empties.length ? h('span', { class: 'chip warn' }, `${empties.length} leere Kästchen`) : null),
      empties.length ? h('div', { class: 'note warn' }, 'Leer geblieben: ', h('b', { style: { fontFamily: 'ui-monospace,monospace' } }, [...new Set(empties)].slice(0, 60).join(' ')), [...new Set(empties)].length > 60 ? ' …' : '', '. Diese Zeichen fehlen dann in deiner Schrift (die App behilft sich dort mit Ersatz).') : '',
      missPages.length ? h('div', { class: 'note' }, `Noch nicht hochgeladen: Seite ${[...new Set(missPages)].join(', ')}. Du kannst sie später ergänzen.`) : '',
      S.result.stats.cells < 20 ? h('div', { class: 'note warn' }, 'Das sind sehr wenige Zeichen. Falls das nicht stimmt, war die Seite vielleicht unscharf oder schief fotografiert.') : '',
      h('p', { class: 'sm mut' }, 'Gelb umrandet: Zeichen berührt den Kästchenrand (vermutlich abgeschnitten) und ist, wenn genug andere da sind, schon abgewählt. Tippe ein Zeichen an, um es aus- oder wieder einzuschließen.'), tiles,
      h('label', { class: 'f' }, 'Name der Schrift'), nameIn,
      target ? h('div', { style: { marginTop: '10px' } }, h('div', { class: 'seg' }, h('button', { type: 'button', class: S.mode === 'add' ? 'on' : '', onclick: (e) => { S.mode = 'add'; [...e.target.parentNode.children].forEach((b, i) => b.classList.toggle('on', !i)); } }, `Zu „${target.name}“ hinzufügen`), h('button', { type: 'button', class: S.mode === 'new' ? 'on' : '', onclick: (e) => { S.mode = 'new'; [...e.target.parentNode.children].forEach((b, i) => b.classList.toggle('on', !!i)); } }, 'Als neue Schrift'))) : null);
    mf.replaceChildren(btn('Zurück', { onclick: () => go(3) }), h('span', { class: 'sp1' }), btn('Schrift speichern', { icon: 'check', cls: 'pri', onclick: save }));
  }
  async function save() {
    if (S.busy) return; S.busy = true;
    try {
      const res = S.result, g = {};
      for (const ch of Object.keys(res.g)) { const keep = res.g[ch].filter((_, i) => !S.off.has(ch + '|' + i)); if (keep.length) g[ch] = keep; }
      if (!Object.keys(g).length) { toast('Es ist kein Zeichen übrig.', 3000, 'err'); S.busy = false; return; }
      const masks = [...S.fromQr], packs = new Set(S.mode === 'add' && font ? font.packs || [] : []);
      for (const m of masks) idsOf(m).forEach(id => packs.add(id));
      const covered = new Set(Object.keys(g));
      let rec;
      if (S.mode === 'add' && font) { rec = { ...font, g: { ...font.g, ...g }, packs: [...packs], ref: { ...font.ref, ...res.ref }, updated: Date.now(), name: S.name || font.name }; }
      else rec = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: S.name || 'Meine Schrift', created: Date.now(), updated: Date.now(), meta: { xh: 27, sc: 3, pad: 4 }, ref: res.ref, packs: [...packs], custom: S.custom.chars ? { chars: clean(S.custom.chars), n: S.custom.n } : null, g };
      if (rec.g) for (const k of Object.keys(rec.g)) for (const v of rec.g[k]) { delete v.img; }
      await dbPut('fonts', rec);
      toast(`Gespeichert: ${covered.size} Zeichen`, 3200);
      close(); await app.fontSaved(rec);
    } catch (e) { toast('Speichern fehlgeschlagen: ' + e.message, 5000, 'err'); } finally { S.busy = false; }
  }
  void closeSheets; void PER_PAGE; void $;
  draw();
  return { close };
}
