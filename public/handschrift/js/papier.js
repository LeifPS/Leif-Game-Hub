// Auswahl der GoodNotes-Vorlage: Format (GoodNotes Standard / A4) × Ausrichtung (hoch / quer) × Art
import { h, toast } from './util.js';
import { PAPERS, gnHas } from './render.js';

const FMT = (base, orient) => (base === 'a4' ? 'a4' : 'gn') + (orient === 'quer' ? 'q' : '');
const fmtName = (base, orient) => `${base === 'a4' ? 'A4' : 'GoodNotes Standard'} ${orient === 'quer' ? 'quer' : 'hochkant'}`;
export const splitFmt = (fmt) => ({ base: (fmt || 'gn').startsWith('a4') ? 'a4' : 'gn', orient: /q$/.test(fmt || '') ? 'quer' : 'hoch' });

/**
 * get(): { paper, fmt } – aktuelle Wahl; set(paper, fmt): übernehmen. Nicht vorhandene Kombinationen sind ausgegraut.
 */
export function gnPicker(get, set) {
  const w = h('div', { class: 'gnpick' });
  const draw = () => {
    const { paper, fmt } = get(), { base, orient } = splitFmt(fmt);
    const pick = (p, b, o) => {
      let f = FMT(b, o);
      if (!gnHas(p, f)) {
        const alt = Object.keys(PAPERS).find((k) => gnHas(k, f));
        if (!alt) { toast(`${fmtName(b, o)} gibt es noch nicht – dafür fehlen noch die Vorlagen.`, 3500, 'err'); return; }
        if (p !== paper) { toast(`${PAPERS[p]} gibt es in ${fmtName(b, o)} nicht.`, 3200, 'err'); return; }
        toast(`${PAPERS[p]} gibt es in ${fmtName(b, o)} nicht – stattdessen ${PAPERS[alt]}.`, 3200); p = alt;
      }
      set(p, f); draw();
    };
    const opt = (label, on, ok, fn) => h('button', { type: 'button', class: 'opt' + (on ? ' on' : '') + (ok ? '' : ' no'), onclick: fn }, label);
    w.replaceChildren(
      h('label', { class: 'f' }, 'Format'),
      h('div', { class: 'chips' }, ...[['gn', 'GoodNotes Standard'], ['a4', 'A4']].map(([b, t]) => opt(t, base === b, Object.keys(PAPERS).some((k) => gnHas(k, FMT(b, 'hoch')) || gnHas(k, FMT(b, 'quer'))), () => pick(paper, b, gnHas(paper, FMT(b, orient)) || Object.keys(PAPERS).some((k) => gnHas(k, FMT(b, orient))) ? orient : orient === 'quer' ? 'hoch' : 'quer')))),
      h('label', { class: 'f' }, 'Ausrichtung'),
      h('div', { class: 'chips' }, ...[['hoch', 'Hochformat'], ['quer', 'Querformat']].map(([o, t]) => opt(t, orient === o, Object.keys(PAPERS).some((k) => gnHas(k, FMT(base, o))), () => pick(paper, base, o)))),
      h('label', { class: 'f' }, 'Art'),
      h('div', { class: 'chips' }, ...Object.entries(PAPERS).map(([k, t]) => opt(t, paper === k, gnHas(k, FMT(base, orient)), () => pick(k, base, orient)))));
  };
  draw();
  return w;
}
