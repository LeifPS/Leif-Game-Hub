// Grammatik- und Rechtschreibprüfung über LanguageTool (öffentliche API). Nur Fließtext wird geprüft;
// HDF-Tags, Eigenschaften und Formeln werden durch Leerzeichen gleicher Länge ersetzt, damit die Positionen stimmen.
const TEXTY = new Set(['note', 'example', 'task', 'quote', 'group', 'column', 'columns', 'page', 'title', 'heading', 'text', 'paragraph', 'caption', 'footnote', 'list', 'item', 'hinweis', 'merke', 'beispiel', 'aufgabe', 'zitat', 'titel', 'ueberschrift', 'absatz', 'liste', 'eintrag', 'spalte', 'spalten', 'gruppe', 'seite']);
export function proseOf(text) {
  const lines = text.split('\n'), out = []; const stack = [];
  for (const L of lines) {
    const blank = ' '.repeat(L.length), m = /^\s*\[\s*(\/)?\s*([A-Za-zÄÖÜäöüß][\w-]*)([^\]]*)\]\s*(.*)$/.exec(L);
    if (m && !/^(rot|blau|gruen|grün|schwarz|orange|lila|gelb|grau)$/i.test(m[2]) && m[2] !== '/') {
      const nm = m[2].toLowerCase().replace(/[-_]/g, '');
      const oneLine = m[4] && new RegExp('\\[\\s*/\\s*' + m[2] + '\\s*\\]\\s*$', 'i').test(m[4]);
      if (m[1]) { stack.pop(); out.push(blank); continue; }
      if (oneLine && TEXTY.has(nm)) { const cut = L.lastIndexOf('['); const head = L.indexOf(']') + 1; out.push(blank.slice(0, head) + L.slice(head, cut) + blank.slice(cut)); continue; }
      if (!oneLine) stack.push(nm);
      out.push(blank); continue;
    }
    const top = stack[stack.length - 1];
    if (top && !TEXTY.has(top)) { out.push(blank); continue; }
    if (top && /^\s*[A-Za-zÄÖÜäöüß_ -]{1,24}\s*:\s/.test(L) && /^(note|example|task|quote|group|hinweis|merke|beispiel|aufgabe|zitat|gruppe)$/.test(top)) { out.push(blank); continue; }
    out.push(L.replace(/(\*\*|__|~~|==)/g, '  ').replace(/\[\s*\/?\s*(?:rot|blau|gruen|grün|schwarz|orange|lila|gelb|grau)?\s*\]/gi, m2 => ' '.repeat(m2.length)).replace(/\$[^$]*\$/g, m2 => ' '.repeat(m2.length)));
  }
  return out.join('\n');
}
export async function checkText(text, signal) {
  const prose = proseOf(text); if (!prose.trim()) return [];
  const body = new URLSearchParams({ text: prose, language: 'de-DE', enabledOnly: 'false' });
  const r = await fetch('https://api.languagetool.org/v2/check', { method: 'POST', body, signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(r.status === 429 ? 'Zu viele Anfragen – bitte kurz warten.' : r.status === 413 ? 'Der Text ist für die Prüfung zu lang.' : 'Der Prüfdienst antwortet nicht (' + r.status + ').');
  const j = await r.json();
  return j.matches.map(m => ({ offset: m.offset, length: m.length, msg: m.message, short: m.shortMessage || (m.rule && m.rule.category && m.rule.category.name) || '', repl: (m.replacements || []).slice(0, 4).map(x => x.value), kind: m.rule && m.rule.issueType === 'misspelling' ? 'Rechtschreibung' : 'Grammatik/Stil' }));
}
