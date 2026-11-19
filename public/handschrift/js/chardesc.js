// Genaue deutsche Beschreibung eines Zeichens für den Zeichenbildschirm
// („Lateinischer Kleinbuchstabe a“, „Umlaut: a mit zwei Punkten (ä)“, „Ziffer 5“ …).

const GREEK = { α: 'Alpha', β: 'Beta', γ: 'Gamma', δ: 'Delta', ε: 'Epsilon', ζ: 'Zeta', η: 'Eta', θ: 'Theta', ι: 'Iota', κ: 'Kappa', λ: 'Lambda', μ: 'My', ν: 'Ny', ξ: 'Xi', ο: 'Omikron', π: 'Pi', ρ: 'Rho', σ: 'Sigma', ς: 'Sigma (am Wortende)', τ: 'Tau', υ: 'Ypsilon', φ: 'Phi', χ: 'Chi', ψ: 'Psi', ω: 'Omega' };

const MARK = { '̀': 'Gravis (Akzent nach links)', '́': 'Akut (Akzent nach rechts)', '̂': 'Zirkumflex (Dach)', '̃': 'Tilde (Welle)', '̄': 'Querstrich oben', '̆': 'Halbkreis oben (Breve)', '̇': 'Punkt oben', '̈': 'zwei Punkten (Trema)', '̊': 'Ring oben', '̋': 'Doppelakut', '̌': 'Hatschek (Haken oben)', '̦': 'Komma unten', '̧': 'Cedille (Häkchen unten)', '̨': 'Ogonek (Haken unten)' };

const SPECIAL = { ß: 'Eszett (scharfes S)', æ: 'Ä-Ligatur: a und e verbunden', Æ: 'Ä-Ligatur: A und E verbunden', œ: 'Ö-Ligatur: o und e verbunden', Œ: 'Ö-Ligatur: O und E verbunden', ø: 'o mit Schrägstrich', Ø: 'O mit Schrägstrich', ł: 'l mit Querstrich', Ł: 'L mit Querstrich', đ: 'd mit Querstrich', Đ: 'D mit Querstrich', ı: 'i ohne Punkt' };

const KANA = 'a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa wo n ya yu yo tsu'.split(' ');
const HIRA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんゃゅょっ';
const KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンャュョッ';

const SYM = {
  '.': 'Punkt', ',': 'Komma', ':': 'Doppelpunkt', ';': 'Semikolon', '!': 'Ausrufezeichen', '?': 'Fragezeichen', "'": 'Apostroph (gerader Strich oben)', '"': 'Anführungszeichen (gerade, oben)',
  '„': 'Anführungszeichen unten (deutsch, öffnend)', '“': 'Anführungszeichen oben (deutsch, schließend)', '(': 'Klammer auf', ')': 'Klammer zu', '-': 'Bindestrich (kurz)', '–': 'Gedankenstrich (lang)', '/': 'Schrägstrich',
  '[': 'Eckige Klammer auf', ']': 'Eckige Klammer zu', '{': 'Geschweifte Klammer auf', '}': 'Geschweifte Klammer zu', '\\': 'Umgekehrter Schrägstrich (Backslash)', '|': 'Senkrechter Strich', '_': 'Unterstrich', '…': 'Auslassungspunkte (drei Punkte)',
  '&': 'Und-Zeichen', '@': 'At-Zeichen (Klammeraffe)', '#': 'Raute', '*': 'Sternchen', '§': 'Paragraphenzeichen', $: 'Dollarzeichen', '€': 'Eurozeichen', '%': 'Prozentzeichen', '‰': 'Promillezeichen', '~': 'Tilde (Welle)', '^': 'Zirkumflex (Dach)',
  '+': 'Pluszeichen', '=': 'Gleichheitszeichen', '<': 'Kleiner-als-Zeichen', '>': 'Größer-als-Zeichen', '°': 'Gradzeichen', '£': 'Pfund-Zeichen', '¥': 'Yen-Zeichen', '©': 'Copyright-Zeichen', '®': 'Registered-Zeichen', '™': 'Trademark-Zeichen', '•': 'Aufzählungspunkt (dick)',
  '«': 'Französische Anführungszeichen links', '»': 'Französische Anführungszeichen rechts', '¿': 'Umgedrehtes Fragezeichen', '¡': 'Umgedrehtes Ausrufezeichen', '′': 'Strich (Minute)', '″': 'Doppelstrich (Sekunde)',
  '−': 'Minuszeichen', '×': 'Malzeichen (Kreuz)', '·': 'Malpunkt (Mittelpunkt)', '÷': 'Geteilt-Zeichen', '≠': 'Ungleich-Zeichen', '≈': 'Ungefähr-gleich-Zeichen', '≤': 'Kleiner-oder-gleich', '≥': 'Größer-oder-gleich', '±': 'Plus-Minus-Zeichen', '√': 'Wurzelzeichen',
  '∞': 'Unendlich', '∠': 'Winkelzeichen', '⊥': 'Senkrecht-Zeichen', '∥': 'Parallel-Zeichen', '→': 'Pfeil nach rechts', '⇒': 'Doppelpfeil nach rechts (daraus folgt)', '⇔': 'Doppelpfeil in beide Richtungen (genau dann, wenn)', '∈': 'Element von', '∉': 'Nicht Element von',
  '⊂': 'Teilmenge', '⊆': 'Teilmenge oder gleich', '∪': 'Vereinigung', '∩': 'Schnittmenge', '∅': 'Leere Menge', '∑': 'Summenzeichen', '∏': 'Produktzeichen', '∫': 'Integralzeichen', '∂': 'Partielles d', '∇': 'Nabla', '∀': 'Für alle', '∃': 'Es existiert',
  '¬': 'Negation (nicht)', '∧': 'Logisches Und', '∨': 'Logisches Oder', '∝': 'Proportional zu', '≡': 'Identisch (drei Striche)', '≅': 'Kongruent', '∼': 'Ähnlich (Tilde)', '∘': 'Verkettung (kleiner Kreis)', '←': 'Pfeil nach links', '↔': 'Pfeil in beide Richtungen', '↑': 'Pfeil nach oben', '↓': 'Pfeil nach unten', '⇌': 'Gleichgewichtspfeil',
  'ℕ': 'Natürliche Zahlen (N mit Doppelstrich)', 'ℤ': 'Ganze Zahlen (Z mit Doppelstrich)', 'ℚ': 'Rationale Zahlen (Q mit Doppelstrich)', 'ℝ': 'Reelle Zahlen (R mit Doppelstrich)', 'ℂ': 'Komplexe Zahlen (C mit Doppelstrich)',
  '½': 'Bruch ein Halb', '¼': 'Bruch ein Viertel', '¾': 'Bruch drei Viertel', '∴': 'Also (drei Punkte als Dreieck)', '∵': 'Weil (drei Punkte als Dreieck, umgekehrt)', '⌀': 'Durchmesserzeichen', '∣': 'Teilt (senkrechter Strich)', '⟨': 'Spitze Klammer auf', '⟩': 'Spitze Klammer zu',
  '⌈': 'Aufrunden-Klammer links', '⌉': 'Aufrunden-Klammer rechts', '⌊': 'Abrunden-Klammer links', '⌋': 'Abrunden-Klammer rechts',
  '。': 'Japanischer Punkt', '、': 'Japanisches Komma', '「': 'Japanische Klammer auf', '」': 'Japanische Klammer zu', '・': 'Japanischer Mittelpunkt', 'ー': 'Dehnungsstrich (Katakana)',
  '✓': 'Haken', '✔': 'Haken (fett)', '✗': 'Kreuz (Ablehnung)', '✘': 'Kreuz (fett)', '★': 'Stern (ausgefüllt)', '☆': 'Stern (nur Umriss)', '♥': 'Herz (ausgefüllt)', '♡': 'Herz (nur Umriss)', '☺': 'Lächelndes Gesicht', '☹': 'Trauriges Gesicht', '♪': 'Achtelnote', '♫': 'Zwei Achtelnoten',
  '☀': 'Sonne', '☁': 'Wolke', '☂': 'Regenschirm', '❄': 'Schneeflocke', '✎': 'Bleistift', '✉': 'Briefumschlag', '☎': 'Telefon', '⚠': 'Warndreieck', '✂': 'Schere', '☑': 'Kästchen mit Haken', '☐': 'Leeres Kästchen',
};

const SUPER = { '⁰': 0, '¹': 1, '²': 2, '³': 3, '⁴': 4, '⁵': 5, '⁶': 6, '⁷': 7, '⁸': 8, '⁹': 9, '⁺': '+', '⁻': '−', '⁼': '=', '⁽': '(', '⁾': ')', ⁿ: 'n' };

// pack = Paket-ID (für Kanji/Chinesisch), ch = das Zeichen
export function describeChar(ch, pack) {
  if (SUPER[ch] !== undefined) return superName('Hochgestellt', SUPER[ch]);
  const sub = '₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎'.indexOf(ch);
  if (sub >= 0) return superName('Tiefgestellt', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, '+', '−', '=', '(', ')'][sub]);
  if (SYM[ch]) return `${SYM[ch]} „${ch}“`;
  if (SPECIAL[ch]) return `${/[A-ZÆŒØŁĐ]/.test(ch) ? 'Großbuchstabe' : 'Kleinbuchstabe'} ${ch}: ${SPECIAL[ch]}`;
  if (/[0-9]/.test(ch)) return `Ziffer ${ch}`;
  if (/[A-Za-z]/.test(ch)) return `Lateinischer ${ch === ch.toUpperCase() ? 'Großbuchstabe' : 'Kleinbuchstabe'} ${ch}`;
  const lo = ch.toLowerCase();
  if (GREEK[lo]) return `Griechischer ${ch === lo ? 'Kleinbuchstabe' : 'Großbuchstabe'} ${GREEK[lo]} ${ch}`;
  if (/[Ѐ-ӿ]/.test(ch)) return `Kyrillischer ${ch === lo ? 'Kleinbuchstabe' : 'Großbuchstabe'} ${ch}`;
  let i = HIRA.indexOf(ch); if (i >= 0) return `Hiragana ${ch} (${KANA[i]})${i >= 66 ? ', klein' : ''}`;
  i = KATA.indexOf(ch); if (i >= 0) return `Katakana ${ch} (${KANA[i]})${i >= 66 ? ', klein' : ''}`;
  if (/[一-鿿]/.test(ch)) return `${pack === 'kanji' ? 'Japanisches Kanji' : 'Chinesisches Schriftzeichen'} ${ch}`;
  const d = ch.normalize('NFD');
  if (d.length > 1 && /[A-Za-z]/.test(d[0]) && MARK[d[1]]) {
    const up = d[0] === d[0].toUpperCase(), base = d[0];
    if (d[1] === '̈' && 'aouAOU'.includes(base)) return `Umlaut ${ch}: ${base} mit zwei Punkten`;
    return `${up ? 'Großbuchstabe' : 'Kleinbuchstabe'} ${ch}: ${base} mit ${MARK[d[1]]}`;
  }
  return `Zeichen ${ch}`;
}
const OPN = { '+': 'Pluszeichen', '−': 'Minuszeichen', '=': 'Gleichheitszeichen', '(': 'Klammer auf', ')': 'Klammer zu' };
const superName = (w, v) => typeof v === 'number' ? `${w}e Ziffer ${v}` : v === 'n' ? `${w}es n` : `${OPN[v]} (${w.toLowerCase()})`;
