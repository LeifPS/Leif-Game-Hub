// Formatierte Ansicht unter dem Textfeld: Das Textfeld selbst ist durchsichtig (nur Cursor und Auswahl sichtbar),
// darunter liegt eine Kopie mit Fett, Unterstrichen, Durchgestrichen, Textmarker und Farben. Die Steuerzeichen (**, ==, [rot] …)
// bleiben halb durchsichtig sichtbar, damit man sieht, was wirklich im Text steht.
const COL = { rot: '#c62828', blau: '#1d3a9a', gruen: '#1b7a3a', 'grün': '#1b7a3a', schwarz: 'inherit', orange: '#d9730d', lila: '#7b3fa0', gelb: '#b08f00', grau: '#777' };
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(text) {
  const out = [];
  let b = false, u = false, s = false, hl = false, col = null;
  const open = () => { const cl = [b && 'b', u && 'u', s && 's', hl && 'hl'].filter(Boolean).join(' '); return cl || col ? `<span${cl ? ` class="${cl}"` : ''}${col ? ` style="color:${col}"` : ''}>` : ''; };
  const mk = (t, extra = '') => `<span class="mk${extra}">${esc(t)}</span>`;
  const lines = text.split('\n'); let depth = 0;
  for (let li = 0; li < lines.length; li++) {
    let L = lines[li];
    if (!L.trim()) { b = u = s = hl = false; col = null; out.push(''); continue; }   // neuer Absatz: alles zurücksetzen (wie beim Setzen)
    let pre = '', head = false;
    const hm = /^(#{1,3} )/.exec(L), lm = !hm && /^(\s*(?:[-*•]|\d{1,3}[.)]) )/.exec(L), tag = /^\s*\[\s*\/?\s*[A-Za-zÄÖÜäöüß][\w-]*[^\]]*\]\s*$/.test(L) && !/^\s*\[\s*(\/|rot|blau|gruen|grün|schwarz|orange|lila|gelb|grau)\s*\]/i.test(L);
    if (tag) { if (/^\s*\[\s*\//.test(L)) depth = Math.max(0, depth - 1); else if (!/\[\/[^\]]*\]\s*$/.test(L)) depth++; out.push(mk(L, ' tag')); continue; }   // HDF-Zeile wie [titel] oder [/tabelle]
    const prop = /^(\s*[a-zäöüß_]{2,24}:)(\s.*)?$/i.exec(L);
    if (hm) { pre = mk(hm[1]); L = L.slice(hm[1].length); head = true; }
    else if (lm) { pre = `<span class="li">${esc(lm[1])}</span>`; L = L.slice(lm[1].length); }
    let html = '', i = 0;
    const cs = [...L];
    let span = open();
    const flush = () => { if (span) html += '</span>'; };
    html += span;
    while (i < cs.length) {
      const c = cs[i], n = cs[i + 1];
      const pair = c + (n || '');
      if (pair === '**' || pair === '__' || pair === '~~' || pair === '==') {
        flush();
        if (pair === '**') b = !b; else if (pair === '__') u = !u; else if (pair === '~~') s = !s; else hl = !hl;
        html += mk(pair); span = open(); html += span; i += 2; continue;
      }
      if (c === '[') {
        const m = /^\[(\/|rot|blau|gruen|grün|schwarz|orange|lila|gelb|grau)\]/.exec(cs.slice(i, i + 9).join(''));
        if (m) { flush(); col = m[1] === '/' ? null : COL[m[1]]; html += mk(m[0]); span = open(); html += span; i += [...m[0]].length; continue; }
      }
      if ((c === '^' || c === '_') && n && n !== ' ' && pair !== '__') {   // Hoch-/Tiefstellung: Zeichen halb sichtbar
        html += mk(c, ' sm'); i++; continue;
      }
      html += esc(c); i++;
    }
    flush();
    if (prop && !hm && !lm && depth > 0) html = mk(prop[1], ' tag') + esc(prop[2] || '');   // Eigenschaft innerhalb eines HDF-Elements
    out.push(pre + (head ? `<span class="hd">${html}</span>` : html));
  }
  return out.join('\n') + '\n​';
}

/** Hängt die formatierte Ansicht an ein Textfeld. Gibt eine Funktion zum Aktualisieren zurück. */
export function attachHighlight(ta) {
  const wrap = document.createElement('div'); wrap.className = 'tawrap';
  const mirror = document.createElement('div'); mirror.className = 'tamirror'; mirror.setAttribute('aria-hidden', 'true');
  ta.parentNode.insertBefore(wrap, ta); wrap.append(mirror, ta); ta.classList.add('tahl');
  let raf = 0;
  const sync = () => { mirror.scrollTop = ta.scrollTop; mirror.scrollLeft = ta.scrollLeft; };
  const upd = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { mirror.innerHTML = highlight(ta.value); mirror.style.paddingRight = (parseFloat(getComputedStyle(ta).paddingRight) + (ta.offsetWidth - ta.clientWidth)) + 'px'; sync(); }); };
  ta.addEventListener('input', upd); ta.addEventListener('scroll', sync);
  new ResizeObserver(upd).observe(ta);
  upd();
  return upd;
}
