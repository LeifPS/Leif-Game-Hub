// HDF – Handwritten Document Format: Parser (Text -> Baum + Fehlerliste). Keine DOM-Abhängigkeit.
// Aufbau: Dokument = Folge aus Textzeilen und Elementen. Element = { name, attrs, props, kids, line }.
// Eigenschaften (Schlüssel: Wert) werden kleingeschrieben/umlautfrei verglichen, Wiederholungen bleiben in props erhalten.

const ALNUM = (s) => s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');

// ---------- Elementnamen (normalisiert: klein, ohne _ und -) ----------
const EL_ALIAS = {
  titel: 'title', ueberschrift: 'heading', absatz: 'paragraph', hinweis: 'note', merke: 'note', beispiel: 'example', aufgabe: 'task', antwort: 'answer', zitat: 'quote',
  fussnote: 'footnote', beschriftung: 'label', abstand: 'spacer', trennlinie: 'divider', seitenumbruch: 'pagebreak', liste: 'list', eintrag: 'item', formel: 'formula',
  gleichung: 'equation', bruch: 'fraction', wurzel: 'root', rechenweg: 'calculation', schritt: 'step', wertetabelle: 'valuetable', tabelle: 'table', zeile: 'row', zelle: 'cell',
  koordinatensystem: 'graph', diagramm: 'chart', balkendiagramm: 'chart', saeulendiagramm: 'chart', kreisdiagramm: 'chart', liniendiagramm: 'chart', ablauf: 'flow', flussdiagramm: 'flow', flowchart: 'flow', baum: 'tree', baumdiagramm: 'tree', hierarchie: 'tree', hierarchy: 'tree', mengen: 'venn', zeitstrahl: 'timeline', pyramide: 'pyramid', kreislauf: 'cycle', zyklus: 'cycle', reaktion: 'chem', chemie: 'chem', reaktionsgleichung: 'chem', geometrie: 'graph', geometry: 'graph', konstruktion: 'graph', graf: 'graph', funktionsgraph: 'graph', funktion: 'function', punkt: 'point', strecke: 'segment', spalten: 'columns', spalte: 'column', gruppe: 'group',
  metadaten: 'metadata', seite: 'page', bild: 'image', verweis: 'reference', text: 'text',
};
// Elemente, die in Stufe 1 gerendert werden (Rest: sichtbarer Platzhalter, siehe KNOWN_LATER)
const DEFS = {
  title: { text: true }, heading: { text: true }, text: { text: true }, paragraph: { text: true }, note: { text: true, props: ['titel'] }, example: { text: true, props: ['titel'] },
  task: { text: true, props: ['nummer', 'punkte', 'titel'] }, answer: { text: false, props: ['linien', 'kaestchen', 'abstandlinien'] }, quote: { text: true, props: ['quelle'] },
  footnote: { text: true }, caption: { text: true }, spacer: { text: false }, divider: { text: false }, pagebreak: { text: false },
  list: { text: false, props: ['typ'], kids: ['item'] }, item: { text: true },
  formula: { text: true, props: ['ausdruck', 'groesse', 'malzeichen', 'dezimal'] }, equation: { text: true, props: ['zeile', 'ausdruck', 'dezimal', 'malzeichen'] },
  fraction: { text: false, props: ['zaehler', 'nenner'] }, root: { text: false, props: ['ausdruck', 'grad'] },
  calculation: { text: true, props: ['titel', 'schritt', 'zeile', 'dezimal', 'malzeichen'], kids: ['step'] }, step: { text: true, props: ['ausdruck', 'hinweis', 'begruendung', 'beschriftung'] },
  valuetable: { text: false, props: ['funktion', 'xvon', 'xbis', 'schritt', 'titel', 'spaltenname', 'nachkommastellen', 'dezimal', 'kopf'] },
  table: { text: false, props: ['titel', 'kopf', 'zeile', 'spaltenbreiten', 'rahmen', 'zellabstand', 'kopfzeile', 'dezimal'], kids: ['row'] },
  row: { text: true, props: ['hoehe'], kids: ['cell'] }, cell: { text: true, props: ['spalten'] },
  graph: { text: false, props: ['titel', 'xmin', 'xmax', 'ymin', 'ymax', 'xbereich', 'ybereich', 'raster', 'rasterx', 'rastery', 'achsen', 'achsenbeschriftung', 'xbeschriftung', 'ybeschriftung', 'skala', 'skalax', 'skalay', 'marken', 'legende', 'gleichskaliert', 'nullstellen', 'extrema', 'schnittpunkte', 'funktion', 'punkt', 'strecke', 'figur', 'abbildung', 'kreis', 'gerade', 'dezimal', 'zahlen', 'einheit'], kids: ['function', 'point', 'segment', 'label'] },
  function: { text: false, props: ['ausdruck', 'name', 'bereich', 'linienbreite', 'linienart', 'nullstellen', 'extrema'] },
  chart: { text: false, props: ['titel', 'typ', 'wert', 'reihe', 'kategorien', 'ymax', 'einheit', 'werte', 'prozent', 'legende', 'breite'] },
  flow: { text: false, props: ['titel', 'knoten', 'pfeil', 'richtung', 'breite'] }, tree: { text: false, props: ['titel', 'knoten', 'kante', 'pfeil', 'richtung', 'breite'] },
  mindmap: { text: false, props: ['titel', 'zentrum', 'zweig', 'breite'] }, venn: { text: false, props: ['titel', 'menge', 'schnitt', 'breite'] }, timeline: { text: false, props: ['titel', 'ereignis', 'massstab', 'breite'] },
  pyramid: { text: false, props: ['titel', 'stufe', 'breite'] }, cycle: { text: false, props: ['titel', 'stufe', 'breite'] }, chem: { text: true, props: ['gleichung', 'zeile', 'ausdruck'] },
  point: { text: false, props: ['name', 'x', 'y', 'marke', 'beschriftung'] }, segment: { text: false, props: ['von', 'bis', 'pfeil', 'linienbreite', 'linienart', 'name'] },
  label: { text: true, props: ['x', 'y', 'name', 'text'] },
  columns: { text: false, props: ['anzahl', 'verteilung'], kids: ['column'] }, column: { text: true }, group: { text: true },
  metadata: { text: false }, page: { text: true, props: ['format', 'papier'] }, image: { text: false, props: ['quelle'] }, reference: { text: false, props: ['ziel'] },
};
// bekannte, aber noch nicht umgesetzte Elemente der HDF-Grundbibliothek -> Platzhalter
const LATER = new Set(['scatterchart',
  'physicsdiagram', 'map', 'illustration']);
// Unterelemente, die nur innerhalb bestimmter Elemente Sinn haben (werden bei Platzhaltern mit übersprungen)
const SUBS = new Set(['entry', 'series', 'branch', 'node', 'connection', 'reactant', 'product', 'component', 'marker', 'label', 'line', 'angle', 'circle', 'polygon']);
const GENERIC = ['breite', 'hoehe', 'minbreite', 'maxbreite', 'minhoehe', 'maxhoehe', 'ausrichtung', 'abstand', 'innenabstand', 'rand', 'randbreite', 'randfarbe', 'hintergrund', 'position',
  'groesse', 'umbruch', 'id', 'farbe', 'stiftfarbe', 'strichstaerke', 'handschriftgroesse', 'handschriftabstand', 'zeilenabstand', 'stil', 'schriftgroesse', 'rechts', 'links'];

// ---------- Schlüssel-Aliase (englisch / Kurzformen, die KIs gern schreiben) ----------
const KEY_ALIAS = {
  w: 'breite', width: 'breite', h: 'hoehe', height: 'hoehe', align: 'ausrichtung', color: 'farbe', colour: 'farbe', title: 'titel', grid: 'raster', axes: 'achsen', legend: 'legende',
  function: 'funktion', expr: 'ausdruck', expression: 'ausdruck', formula: 'ausdruck', ausdruck: 'ausdruck', headers: 'kopf', header: 'kopf', head: 'kopf', row: 'zeile', rows: 'zeile', zeilen: 'zeile',
  linewidth: 'linienbreite', linestyle: 'linienart', dash: 'linienart', numerator: 'zaehler', denominator: 'nenner', zaehler: 'zaehler', nenner: 'nenner', degree: 'grad', index: 'grad',
  from: 'von', to: 'bis', arrow: 'pfeil', name: 'name', label: 'beschriftung', range: 'bereich', domain: 'bereich', xrange: 'xbereich', yrange: 'ybereich', xmin: 'xmin', xmax: 'xmax', ymin: 'ymin', ymax: 'ymax',
  xfrom: 'xvon', xto: 'xbis', step: 'schritt', lines: 'linien', size: 'groesse', background: 'hintergrund', border: 'rand', pen: 'stiftfarbe', number: 'nummer', points: 'punkte', roots: 'nullstellen',
  zeros: 'nullstellen', extrema: 'extrema', intersections: 'schnittpunkte', xlabel: 'xbeschriftung', ylabel: 'ybeschriftung', ticks: 'marken', source: 'quelle', target: 'ziel', type: 'typ', count: 'anzahl',
  begruendung: 'begruendung', reason: 'begruendung', note: 'hinweis', hint: 'hinweis', decimals: 'nachkommastellen', decimal: 'dezimal', cols: 'spalten', colspan: 'spalten',
  unit: 'einheit', squares: 'einheit', kaestchenproeinheit: 'einheit', gridx: 'rasterx', gridy: 'rastery', scale: 'skala', equalscale: 'gleichskaliert', multiplication: 'malzeichen', times: 'malzeichen', top: 'oben', pagebreak: 'umbruch',
};
export const normKey = (k) => { const a = ALNUM(k); return KEY_ALIAS[a] || a; };
export const normEl = (n) => { const a = ALNUM(n); return EL_ALIAS[a] || a; };

// Eigenschaften, deren Wert mehrmals vorkommen darf (Wiederholungen bleiben eigene Einträge)
const TAG_RE = /^\s*\[(\/)?\s*([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß-]*)([^\]]*)\]\s*(.*?)\s*$/;
const PROP_RE = /^\s*([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß -]{0,28}?)\s*[:=]\s*(.*?)\s*$/;

// Attribute im öffnenden Tag: [graph breite=80% titel="Mein Titel" x=10]
function parseAttrs(s) {
  const out = []; const re = /([A-Za-zÄÖÜäöüß][\wÄÖÜäöüß-]*)\s*[=:]\s*("([^"]*)"|'([^']*)'|[^\s\]]+)/g; let m;
  while ((m = re.exec(s))) out.push({ k: normKey(m[1]), v: m[3] != null ? m[3] : m[4] != null ? m[4] : m[2], raw: m[1] });
  return out;
}
const isOpenKnown = (n) => n in DEFS || LATER.has(n) || SUBS.has(n);

export function parseHdf(src) {
  const lines = src.replace(/\r\n?/g, '\n').split('\n'), errors = [];
  const root = { name: '#doc', attrs: [], props: [], kids: [], line: 1 }, stack = [root];
  const err = (line, msg, level = 'error') => errors.push({ line, level, msg });
  const top = () => stack[stack.length - 1];
  const open = (name, attrsStr, line, rawName) => {
    const el = { name, rawName, attrs: parseAttrs(attrsStr || ''), props: [], kids: [], line };
    for (const a of el.attrs) el.props.push({ k: a.k, v: a.v, line });
    top().kids.push(el); return el;
  };
  const selfClosing = new Set(['pagebreak', 'spacer', 'divider']);
  // Elemente, die ihren Inhalt unverändert als Text behalten (nicht in Eigenschaften zerlegen)
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i], ln = i + 1, cur = top();
    if (/^\s*\\\[/.test(L)) { cur.kids.push({ text: L.replace(/^(\s*)\\\[/, '$1['), line: ln }); continue; }   // \[ = wörtliche Klammer am Zeilenanfang
    const m = TAG_RE.exec(L);
    if (m) {
      const closing = !!m[1], raw = m[2], name = normEl(raw), rest = m[4] || '';
      // [farbe]-Text des alten Formats ([rot], [blau] ..., [/]) ist kein Element
      if (!closing && !isOpenKnown(name) && /^(rot|blau|gruen|grün|schwarz|orange|lila|gelb|grau)$/i.test(raw)) { cur.kids.push({ text: L, line: ln }); continue; }
      if (closing) {
        let k = stack.length - 1; while (k > 0 && stack[k].name !== name) k--;
        if (k === 0) { err(ln, `Schließendes [/${raw}] ohne passendes Öffnen`); continue; }
        for (let j = stack.length - 1; j > k; j--) err(stack[j].line, `[${stack[j].rawName}] wurde nicht geschlossen`);
        stack[k].endLine = ln; stack.length = k; continue;
      }
      if (!isOpenKnown(name)) {
        // unbekannter Tag: nur als Element behandeln, wenn später ein passendes Schließen folgt – sonst Text (z. B. "[1]" oder "[Quelle]")
        const closeRe = new RegExp('^\\s*\\[\\s*/\\s*' + raw.replace(/[-]/g, '\\-') + '\\s*\\]', 'i');
        let hasClose = rest && new RegExp('\\[\\s*/\\s*' + raw + '\\s*\\]\\s*$', 'i').test(rest);
        for (let j = i + 1; !hasClose && j < lines.length && j < i + 400; j++) if (closeRe.test(lines[j])) hasClose = true;
        if (!hasClose) { cur.kids.push({ text: L, line: ln }); continue; }
        err(ln, `Unbekanntes Element [${raw}]`, 'warn');
      }
      // Einzeiler [titel]Text[/titel]
      const one = rest && new RegExp('^(.*?)\\[\\s*/\\s*' + raw.replace(/[-]/g, '\\-') + '\\s*\\]\\s*$', 'i').exec(rest);
      const el = open(name, m[3], ln, raw);
      if (one) { if (one[1]) el.kids.push({ text: one[1], line: ln }); el.endLine = ln; continue; }
      if (rest) el.kids.push({ text: rest, line: ln });
      if (selfClosing.has(name)) { el.endLine = ln; continue; }
      stack.push(el); continue;
    }
    // Eigenschaftszeile?
    const pm = PROP_RE.exec(L);
    if (pm && cur !== root) {
      const k = normKey(pm[1]), def = DEFS[cur.name];
      const known = def && ((def.props || []).includes(k) || GENERIC.includes(k));
      if (known || (def && def.text === false && !(cur.name in { list: 1, columns: 1 }) && !LATER.has(cur.name))) {
        if (!known) { err(ln, `Unbekannte Eigenschaft „${pm[1].trim()}“ in [${cur.rawName}]`, 'warn'); continue; }
        cur.props.push({ k, v: pm[2], line: ln }); continue;
      }
      if (!def && !LATER.has(cur.name)) { cur.props.push({ k, v: pm[2], line: ln }); continue; }
    }
    cur.kids.push({ text: L, line: ln });
  }
  for (let j = stack.length - 1; j > 0; j--) err(stack[j].line, `[${stack[j].rawName}] wurde nicht geschlossen`);
  validate(root, errors);
  return { root, errors };
}

// Pflichtfelder, doppelte IDs, Verschachtelung
function validate(root, errors) {
  const ids = new Map(); const walk = (el) => {
    for (const k of el.kids) if (k.name) {
      const id = k.props.find(p => p.k === 'id'); if (id) { if (ids.has(id.v)) errors.push({ line: k.line, level: 'error', msg: `Doppelte ID „${id.v}“` }); else ids.set(id.v, k); }
      const d = DEFS[k.name];
      if (d && d.kids == null && (k.name === 'cell' || k.name === 'step') && !['row', 'calculation'].includes(el.name) && el.name !== '#doc') errors.push({ line: k.line, level: 'warn', msg: `[${k.rawName}] steht außerhalb von ${k.name === 'cell' ? '[row]' : '[calculation]'}` });
      walk(k);
    }
  }; walk(root);
  // Referenzen prüfen
  const refs = (el) => { for (const k of el.kids) if (k.name) { if (k.name === 'reference') { const t = k.props.find(p => p.k === 'ziel'); const id = t && t.v.replace(/^@/, ''); if (!t) errors.push({ line: k.line, level: 'error', msg: '[reference] ohne ziel' }); else if (!ids.has(id)) errors.push({ line: k.line, level: 'error', msg: `Referenz auf unbekannte ID „${id}“` }); } refs(k); } }; refs(root);
}

// ---------- Hilfsfunktionen für die Renderer ----------
export const getP = (el, k) => { const p = el.props.find(q => q.k === k); return p ? p.v : undefined; };
export const allP = (el, k) => el.props.filter(q => q.k === k);
export const text = (el) => el.kids.filter(k => k.text != null).map(k => k.text).join('\n');
export const textLines = (el) => el.kids.filter(k => k.text != null).map(k => k.text);
export const elems = (el, ...names) => el.kids.filter(k => k.name && (!names.length || names.includes(k.name)));
export const bool = (v, d = false) => v == null ? d : /^(ja|yes|true|an|on|1|wahr)$/i.test(String(v).trim()) ? true : /^(nein|no|false|aus|off|0|falsch)$/i.test(String(v).trim()) ? false : d;
export const num = (v, d) => { if (v == null) return d; const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : d; };
export const splitBar = (s) => s.split(/\s+\|\s+/).map(t => t.trim());   // Kurzform-Trenner: " | " mit Leerzeichen
// Bereich "-4..4", "-4, 4", "-4 bis 4" -> [a, b]
export function range(v) { if (v == null) return null; const m = String(v).trim().match(/^\[?\s*(-?[\d.,]+)\s*(?:\.\.|,|;|bis|to|-->)\s*(-?[\d.,]+)\s*\]?$/i); return m ? [parseFloat(m[1].replace(',', '.')), parseFloat(m[2].replace(',', '.'))] : null; }

export const COLORS = {
  rot: '#d32f2f', red: '#d32f2f', blau: '#1d4ed8', blue: '#1d4ed8', gruen: '#1b8a3a', green: '#1b8a3a', schwarz: '#16161c', black: '#16161c', orange: '#e8710a', lila: '#7b3fa0', violett: '#7b3fa0', purple: '#7b3fa0',
  gelb: '#d4a900', yellow: '#d4a900', grau: '#6b7280', gray: '#6b7280', grey: '#6b7280', braun: '#8d5524', brown: '#8d5524', rosa: '#e0529c', pink: '#e0529c', tuerkis: '#0e9aa7', cyan: '#0e9aa7', weiss: '#ffffff', white: '#ffffff',
  hellblau: '#60a5fa', hellgruen: '#4ade80', hellgrau: '#cbd5e1', dunkelblau: '#1e3a8a', dunkelgruen: '#14532d', dunkelrot: '#991b1b',
};
export function color(v) { if (!v) return null; const s = String(v).trim(); if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s; return COLORS[ALNUM(s)] || null; }
export const isColor = (v) => !!color(v);
// Maße: 5mm 2cm 12pt 40px 50% 50 (ohne Einheit = Prozent) auto. Ergebnis in Layout-Einheiten; ref = Bezugsgröße für %.
export const MM = 150 / 25.4;
export function size(v, ref, d) {
  if (v == null) return d; const s = String(v).trim().toLowerCase(); if (s === 'auto' || s === '') return d;
  const m = s.match(/^(-?[\d.,]+)\s*(mm|cm|pt|px|%)?$/); if (!m) return d; const n = parseFloat(m[1].replace(',', '.')), u = m[2] || '%';
  return u === 'mm' ? n * MM : u === 'cm' ? n * 10 * MM : u === 'pt' ? n * 150 / 72 : u === 'px' ? n : n / 100 * ref;
}
export const KNOWN = { DEFS, LATER };
