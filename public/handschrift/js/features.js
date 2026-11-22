// „Was STools kann“: Galerie aller Funktionen mit Vorschau in der eigenen Handschrift.
// Kachel = Vorschau + Titel + ein Satz. Antippen = Detail mit großer Vorschau, Reglern zum Ausprobieren, „So schreibst du es“ und „Als Dokument öffnen“.
import { h, toast } from './util.js';
import { sheet, chips, btn, ic } from './ui.js';
import { layout, drawPage, ensureImages, DEF, gnApply } from './render.js';

const SATZ = 'Das ist meine Handschrift.\nSie sieht aus wie echt geschrieben!';
export const FCATS = [['alle', 'Alle'], ['schreiben', 'Schreiben'], ['mathe', 'Mathe'], ['visuals', 'Schaubilder'], ['mehr', 'Noten & Sprachen'], ['app', 'App']];

// demo: Regler [Schlüssel, Name, min, max, Schritt, Anzeige] – verändern die Vorschau sofort
export const FEATURES = [
  // ---------- Schreiben ----------
  { id: 'format', cat: 'schreiben', title: 'Formatierung', short: 'Überschriften, fett, unterstrichen, markiert, Listen.',
    text: '# Überschrift\n**fett**, __unterstrichen__, ==markiert==, ~~durchgestrichen~~\n- Liste mit Punkten\n1. nummeriert',
    tips: ['Oder einfach die Knöpfe über dem Textfeld benutzen.'] },
  { id: 'aussehen', cat: 'schreiben', s: { slant: 7 }, title: 'Aussehen einstellen', short: 'Neigung, Abstände, Unregelmäßigkeit – probier die Regler.', text: SATZ, nocode: true,
    demo: [['slant', 'Neigung', -10, 18, .5, (v) => v + '°'], ['jit', 'Unregelmäßigkeit', 0, 1.6, .05, (v) => v ? Math.round(v * 100) + ' %' : 'Aus'],
      ['sp', 'Buchstabenabstand', .6, 1.4, .02, (v) => Math.round(v * 100) + ' %'], ['wsp', 'Wortabstand', .5, 2, .05, (v) => Math.round(v * 100) + ' %'],
      ['capsc', 'Großbuchstaben', .7, 1.7, .05, (v) => Math.round(v * 100) + ' %'], ['size', 'Größe', 13, 30, .5, (v) => v + ' pt']],
    seed: true, tips: ['Im Dokument: Einstellungen (Regler-Symbol). „Als Standard merken“ übernimmt alles für neue Dokumente.'] },
  { id: 'varianten', cat: 'schreiben', title: 'Neu schreiben', short: 'Jedes Wort sieht jedes Mal etwas anders aus – wie echt.', text: 'Hallo Hallo Hallo\nanna anna anna', nocode: true, seed: true,
    tips: ['Würfel-Knopf: das ganze Blatt neu schreiben.', 'Wort im Blatt antippen → „Neu schreiben“: nur dieses Wort ändern.'] },
  { id: 'farbe', cat: 'schreiben', s: { ink: '#1d3a9a' }, title: 'Stiftfarbe', short: 'Schwarz, Blau, Rot, Grün oder jede eigene Farbe.', text: SATZ, nocode: true,
    demo: [['ink', 'Farbe', 0, 3, 1, (v) => ['Schwarz', 'Blau', 'Rot', 'Grün'][v], ['#16161c', '#1d3a9a', '#c62828', '#1b7a3a']]],
    tips: ['Ganzes Dokument: Einstellungen → Stift.', 'Nur ein Wort: Text markieren → Palette.'] },
  { id: 'papier', cat: 'schreiben', title: 'GoodNotes-Papier', short: 'Liniert, kariert, gepunktet, Cornell, Notenlinien – A4 oder GoodNotes.', icon: 'layers', nocode: true,
    steps: ['Im Dokument: Einstellungen → Papier.', 'Format (GoodNotes Standard oder A4), hoch oder quer, dann die Papierart.', 'Ordner können eigenes Papier für neue Dokumente haben (z. B. kariert für Mathe).'] },
  // ---------- Mathe ----------
  { id: 'formeln', cat: 'mathe', paper: 'gnkar', title: 'Formeln', short: 'Brüche, Wurzeln, Potenzen – einfach zwischen $ … $ tippen.',
    text: '$f(x) = (x^2 - 4)/(x + 1)$\n$x_(1,2) = (-p +- sqrt(p^2 - 4q))/2$\n$int_0^1 x^2 dx = 1/3$',
    tips: ['x^2 hoch, a_1 tief, (a+b)/2 Bruch, sqrt(x) Wurzel, root(x, 3) dritte Wurzel', 'pi, alpha … werden zu π, α; <= >= -> zu ≤ ≥ →', 'int_a^b, sum_(i=1)^n, lim_(x->0), vec(1, 2), mat(1, 2; 3, 4)'] },
  { id: 'rechnung', cat: 'mathe', paper: 'gnkar', title: 'Rechenwege', short: 'Mehrere Schritte untereinander – jede Zeile mit $ … $.',
    text: '$2x + 3 = 11$\n$2x = 8$\n$x = 4$\n\n**Ergebnis:** $x = 4$', tips: ['Für Umformungen mit Randnotiz („| −3“) gibt es [gleichung] mit zeile: … | −3.'] },
  { id: 'graph', cat: 'mathe', paper: 'gnkar', title: 'Funktionsgraphen', short: 'Koordinatensystem mit Funktionen, Nullstellen und Schnittpunkten.',
    text: '[graph]\nxbereich: -4..4\nybereich: -5..6\nfunktion: x^2 - 4 | blau | name=f(x)\nfunktion: x + 1 | rot | gestrichelt\nnullstellen: ja\n[/graph]',
    tips: ['Nullstellen, Extrema und Schnittpunkte berechnet die App selbst.', 'Liegt genau auf den Kästchen von kariertem Papier.'] },
  { id: 'geometrie', cat: 'mathe', paper: 'gnkar', title: 'Geometrie', short: 'Figuren spiegeln, drehen, verschieben und strecken.',
    text: '[geometrie]\nxbereich: -1..9\nybereich: -1..9\nfigur: A(2,2) B(4,2) C(3,4) | blau | ABC\nabbildung: ABC | streckung | zentrum=1,1 | faktor=2 | hilfslinien\n[/geometrie]',
    tips: ['Arten: streckung, spiegelung, punktspiegelung, drehung, verschiebung.', 'Bildpunkte heißen automatisch A\', B\', C\'.'] },
  { id: 'tabelle', cat: 'mathe', paper: 'gnkar', title: 'Tabellen', short: 'Tabellen mit Rahmen, Zahlen und Formeln in den Zellen.',
    text: '[tabelle]\nkopf: x | f(x)\nzeile: -2 | 0\nzeile: 0 | -4\nzeile: 2 | 0\n[/tabelle]', tips: ['[wertetabelle] rechnet die Werte einer Funktion sogar selbst aus.'] },
  // ---------- Schaubilder ----------
  { id: 'balken', cat: 'visuals', title: 'Diagramme', short: 'Balken-, Kreis- und Liniendiagramme.',
    text: '[diagramm]\ntyp: balken\nwert: Mathe | 12 | blau\nwert: Deutsch | 8 | rot\nwert: Sport | 15 | gruen\n[/diagramm]', tips: ['typ: kreis oder typ: linie für die anderen Arten.'] },
  { id: 'ablauf', cat: 'visuals', title: 'Ablaufdiagramm', short: 'Schritte und Entscheidungen mit Pfeilen.',
    text: '[ablauf]\nknoten: s | Start | oval\nknoten: q | Hausaufgaben? | raute\nknoten: a | Erst lernen\nknoten: b | Spielen\npfeil: s -> q\npfeil: q -> a | ja\npfeil: q -> b | nein\n[/ablauf]' },
  { id: 'baum', cat: 'visuals', title: 'Baumdiagramm', short: 'Für Wahrscheinlichkeiten und Hierarchien.',
    text: '[baum]\npfeil: Start -> K | 0,5\npfeil: Start -> Z | 0,5\npfeil: K -> KK | 0,5\npfeil: K -> KZ | 0,5\n[/baum]' },
  { id: 'mindmap', cat: 'visuals', title: 'Mindmap', short: 'Ein Thema in der Mitte, Zweige drumherum.',
    text: '[mindmap]\nzentrum: Funktionen\nzweig: Linear | Gerade | blau\nzweig: Quadratisch | Parabel | rot\nzweig: Exponentiell | Wachstum | gruen\n[/mindmap]' },
  { id: 'zeitstrahl', cat: 'visuals', title: 'Zeitstrahl', short: 'Ereignisse im richtigen Abstand.',
    text: '[zeitstrahl]\nereignis: 1492 | Amerika\nereignis: 1517 | Reformation\nereignis: 1618 | 30-jähriger Krieg\n[/zeitstrahl]', tips: ['Außerdem: [mengen] (Venn), [pyramide], [kreislauf].'] },
  // ---------- Noten & Sprachen ----------
  { id: 'noten', cat: 'mehr', title: 'Noten', short: 'Lieder mit Notenschlüssel, Takt und Liedtext.',
    text: '[noten]\ntakt: 4/4\ntext: Al-le mei-ne Ent-chen\nc d e f | g2 g2 ||\n[/noten]',
    tips: ['c d e f g a h, r = Pause, \' höher, , tiefer, # Kreuz, b Be', 'Dauer 1 2 4 8 16, . punktiert, | Taktstrich', 'In deiner Handschrift: Paket „Noten“ zeichnen (Schriften → Plus → Pakete).'] },
  { id: 'vokabeln', cat: 'mehr', title: 'Vokabeln', short: 'Zwei saubere Spalten – eine Vokabel pro Zeile.',
    text: '[vokabeln]\nkopf: Französisch | Deutsch\nle chat = die Katze\navoir faim = Hunger haben\nla maison = das Haus\n[/vokabeln]' },
  { id: 'chemie', cat: 'mehr', title: 'Chemie', short: 'Reaktionsgleichungen mit tiefgestellten Zahlen.', text: '[reaktion]\ngleichung: 2 H2 + O2 -> 2 H2O\ngleichung: CH4 + 2 O2 -> CO2 + 2 H2O\n[/reaktion]' },
  // ---------- App ----------
  { id: 'schrift', cat: 'app', title: 'Eigene Schrift', short: 'Zeichen auf einem Bogen oder direkt in der App schreiben.', icon: 'type',
    steps: ['Schriften → „Neue Schrift erstellen“.', 'Pakete wählen (Standard, Mathe, Französisch, Noten …).', 'Bogen ausfüllen und hochladen – oder in der App nachzeichnen.'] },
  { id: 'ergaenzen', cat: 'app', title: 'Zeichen verbessern', short: 'Fehlende Zeichen nachzeichnen, auffällige anpassen.', icon: 'edit',
    steps: ['Plus bei deiner Schrift: Zeichen, Varianten oder Pakete ergänzen.', 'Zeichen ansehen: Größe, Höhe und Abstand nachjustieren.', '„auffällig“ zeigt Zeichen, die aus der Reihe fallen.'] },
  { id: 'export', cat: 'app', title: 'Ab nach GoodNotes', short: 'Als PDF, Bild oder echte Stiftstriche exportieren.', icon: 'download',
    steps: ['Im Dokument „Exportieren“, Seiten auswählen.', 'Echte Striche (.goodnotes): in GoodNotes radier- und bearbeitbar.', 'Oder PDF, PNG je Seite, transparentes PNG.'] },
  { id: 'video', cat: 'app', title: 'Schreib-Video', short: 'Ein Video, in dem die Seite Strich für Strich entsteht.', icon: 'pen', steps: ['Exportieren → „Schreib-Video“.'] },
  { id: 'ki', cat: 'app', title: 'Blatt von der KI', short: 'Eine KI schreibt Lösung oder Arbeitsblatt, STools setzt es.', icon: 'wand',
    steps: ['Mehr → „Format-Beschreibung kopieren“ und in ChatGPT/Claude einfügen.', 'Darunter schreiben, was du willst.', 'Antwort aus dem Codeblock kopieren und in ein Dokument einfügen.'] },
  { id: 'ordner', cat: 'app', title: 'Ordner & Vorlagen', short: 'Hefte für jedes Fach, fertige Vorlagen, Papierkorb.', icon: 'folder',
    steps: ['Ordner-Knopf oben: neues Heft mit Farbe und eigenem Papier.', 'Vorlagen-Knopf: fertige Blätter als Start.', 'Gelöschtes landet erst im Papierkorb.'] },
  { id: 'sync', cat: 'app', title: 'iPhone & iPad', short: 'Alles auf beiden Geräten – verschlüsselt.', icon: 'refresh',
    steps: ['Mehr → „Abgleich einschalten“.', 'Code auf dem anderen Gerät eingeben.', 'Zusätzlich: „Alles sichern“ in iCloud Drive.'] },
];

// ---- Vorschau: Text setzen, nur die Tinte ausschneiden ----
const cache = new Map();
async function renderPreview(app, f, over = {}, scale = .55) {
  const font = await app.getFont(app.fontId);
  const S = { ...DEF, pageNum: false };
  gnApply(S, f.paper || 'gnlin', 'gn'); Object.assign(S, { ml: 40, mr: 40, mt: 40, mb: 40 }, f.s || {}, over);
  await font.prepare(f.text + ' •');
  const L = layout(f.text, S, font), ent = L.pages[0] || [];
  await ensureImages(ent);
  const big = document.createElement('canvas'); drawPage(big, ent, L, S, scale, true);
  const g = big.getContext('2d'), { width: W, height: H } = big, d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const out = document.createElement('canvas');
  if (x1 < 0) { out.width = out.height = 1; return out; }
  const p = Math.round(10 * scale / .55); x0 = Math.max(0, x0 - p); y0 = Math.max(0, y0 - p); x1 = Math.min(W, x1 + p); y1 = Math.min(H, y1 + p);
  out.width = x1 - x0; out.height = y1 - y0; out.getContext('2d').drawImage(big, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  out.className = 'fx-cv'; return out;
}

function tile(app, f, onOpen, queue) {
  const prev = h('div', { class: 'fx-prev' + (f.paper === 'gnkar' ? ' kar' : ' lin') });
  if (f.text) { prev.append(h('div', { class: 'fx-shim' })); queue(prev, f); }
  else prev.append(h('div', { class: 'fx-icon' }, ic(f.icon || 'info')));
  return h('button', { type: 'button', class: 'fx-tile', onclick: () => onOpen(f) }, prev, h('b', null, f.title), h('span', null, f.short));
}

function makeQueue(app, root) {
  let chain = Promise.resolve();
  const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); const { f } = e.target._fx; chain = chain.then(async () => {
    let cv = cache.get(f.id + '|' + app.fontId); if (!cv) { cv = await renderPreview(app, f); cache.set(f.id + '|' + app.fontId, cv); }
    if (e.target.isConnected) e.target.replaceChildren(copyCanvas(cv));
  }).catch(() => {}); } }, { root, rootMargin: '300px' });
  return (el, f) => { el._fx = { f }; io.observe(el); };
}
const copyCanvas = (c) => { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.className = c.className; n.getContext('2d').drawImage(c, 0, 0); return n; };

function detail(app, f) {
  sheet(f.title, (body, api) => {
    body.append(h('p', { class: 'fx-lead' }, f.short));
    const over = {}; let seed = 7;
    if (f.text) {
      const big = h('div', { class: 'fx-big' + (f.paper === 'gnkar' ? ' kar' : ' lin') }, h('div', { class: 'fx-shim' }));
      body.append(big);
      let busy = false, again = false;
      const redraw = async () => { if (busy) { again = true; return; } busy = true; try { big.replaceChildren(await renderPreview(app, f, { ...over, seed }, .9)); } catch (_) { /* Vorschau egal */ } busy = false; if (again) { again = false; redraw(); } };
      redraw();
      if (f.demo) for (const [k, label, min, max, step, fmt, vals] of f.demo) {
        let v = vals ? Math.max(0, vals.indexOf((f.s || {})[k])) : ((f.s && k in f.s) ? f.s[k] : k in DEF ? DEF[k] : min); const out = h('output', null, fmt(v));
        const inp = h('input', { type: 'range', min, max, step, value: v, oninput: () => { v = +inp.value; out.textContent = fmt(v); over[k] = vals ? vals[v] : v; redraw(); } });
        body.append(h('label', { class: 'fx-rng' }, h('b', null, label), out, inp));
      }
      if (f.seed) body.append(h('div', { class: 'row', style: { marginTop: '8px' } }, btn('Neu schreiben', { icon: 'dice', cls: 'sm', onclick: () => { seed = (Math.random() * 1e6) | 0; redraw(); } })));
      if (!f.nocode) {
        body.append(h('div', { class: 'fx-h' }, 'So schreibst du es'), h('pre', { class: 'fx-code' }, f.text),
          h('div', { class: 'row wrap2', style: { gap: '8px' } },
            btn('Kopieren', { icon: 'copy', cls: 'sm', onclick: async () => { try { await navigator.clipboard.writeText(f.text); toast('Kopiert'); } catch (_) { toast('Kopieren nicht möglich', 3000, 'err'); } } }),
            btn('Als Dokument öffnen', { icon: 'plus', cls: 'sm pri', onclick: async () => { const s = { ...DEF }; gnApply(s, f.paper || 'gnlin', 'gn'); const d = await app.newDoc({ title: f.title, text: f.text, fontId: app.fontId, s }); api.close(); document.querySelectorAll('.sheet.on').forEach((x) => x.querySelector('.sh .btn')?.click()); await app.openDoc(d.id); } })));
      }
    } else body.append(h('div', { class: 'fx-big fx-bigicon' }, ic(f.icon || 'info')));
    const list = f.steps || f.tips;
    if (list) body.append(h('div', { class: 'fx-h' }, f.steps ? 'So geht’s' : 'Gut zu wissen'), h(f.steps ? 'ol' : 'ul', { class: 'fx-list' }, ...list.map((t) => h('li', null, t))));
  });
}

export function featureTiles(app, ids, root) {   // kleine Auswahl (z. B. auf der Seite „Mehr“)
  const q = makeQueue(app, root || null);
  return h('div', { class: 'fx-grid' }, ...FEATURES.filter((f) => ids.includes(f.id)).map((f) => tile(app, f, (x) => detail(app, x), q)));
}

export function openFeatures(app) {
  let cat = 'alle';
  sheet('Was STools alles kann', (body) => {
    const grid = h('div', { class: 'fx-grid' }), q = makeQueue(app, body);
    const draw = () => grid.replaceChildren(...FEATURES.filter((f) => cat === 'alle' || f.cat === cat).map((f) => tile(app, f, (x) => detail(app, x), q)));
    body.append(h('p', { class: 'mut sm', style: { margin: '0 0 10px' } }, 'Alle Vorschauen sind in deiner Schrift. Tippe eine Kachel an, um sie auszuprobieren.'),
      h('div', { style: { margin: '0 0 12px', overflowX: 'auto' } }, chips(FCATS, () => cat, (v) => { cat = v; draw(); })), grid);
    draw();
  }, { wide: true });
}
