// Ansicht „Mehr“: Darstellung, Installation, Offline, Speicher, Hilfe
import { h, toast, fmtSize } from './util.js';
import { btn, seg, confirmBox, ic } from './ui.js';
import { usage, persist } from './store.js';
import { doBackup, restoreButton } from './backup.js';
import { syncStatus, syncNow, newCode, setCode, fmtCode, normCode, validCode } from './sync.js';
import { promptBox } from './ui.js';
import { lastSync, daysLeft, checkNow, SYNC_DAYS } from './session.js';
import { HDF_DOC, HDF_URL, HDF_PROMPT, HDF_EXAMPLE } from './hdfdoc.js';
import { featureTiles, openFeatures } from './features.js';
import { openLegal } from './legal.js';

export const VERSION = '1.0';
export function moreView(app) {
  const root = h('div', { class: 'scroll' }), wrap = h('div', { class: 'wrap mehr' }); root.append(wrap);
  // Bausteine im Stil der iOS-Einstellungen: Abschnitt mit Karte, Zeilen mit farbigem Symbol, Titel, Untertitel und Bedienelement rechts.
  const sec = (t, ...rows) => h('section', { class: 'msec' }, t ? h('h4', null, t) : null, h('div', { class: 'mcard' }, ...rows.filter(Boolean)));
  const tile = (icon, col) => h('span', { class: 'mic', style: { background: col } }, ic(icon));
  const head = (icon, col, title, sub, right) => [tile(icon, col), h('span', { class: 'mtx' }, h('b', null, title), sub ? h('small', null, sub) : null), right ? h('span', { class: 'mright' }, right) : null];
  const row = (icon, col, title, sub, right, onclick) => h(onclick ? 'button' : 'div', { class: 'mrow' + (onclick ? ' tap' : ''), type: onclick ? 'button' : undefined, onclick }, ...head(icon, col, title, sub, right || (onclick ? ic('cr') : null)));
  const fold = (icon, col, title, sub, ...body) => h('details', { class: 'mfold' }, h('summary', { class: 'mrow tap' }, ...head(icon, col, title, sub, ic('cd'))), h('div', { class: 'mbody' }, ...body.filter(Boolean)));
  const P = (t, cls = 'mut sm') => h('p', { class: cls }, t);
  const copy = (txt, msg) => async () => { try { await navigator.clipboard.writeText(txt); toast(msg, 3200); } catch (e) { toast('Kopieren nicht möglich', 3000, 'err'); } };
  const faq = (q, a) => h('details', { class: 'mfold faq2' }, h('summary', { class: 'mrow tap' }, h('span', { class: 'mtx' }, h('b', null, q)), ic('cd')), h('div', { class: 'mbody' }, P(a)));
  const C = { blue: '#2f6bff', green: '#22a559', orange: '#ff9500', purple: '#8e5cf7', gray: '#8e8e93', red: '#ff3b30', teal: '#14a3b8', indigo: '#5856d6' };

  let gen = 0;
  async function draw() {
    const my = ++gen, open = new Set([...wrap.querySelectorAll('details[open] > summary b')].map((b) => b.textContent));   // aufgeklappte Zeilen merken
    const W = document.createDocumentFragment(); W.append(h('div', { class: 'phead' }, h('h1', null, 'Mehr')));

    // Was Tippschrift kann (Blickfang oben)
    W.append(h('section', { class: 'mhero' },
      h('div', { class: 'mhero-t' }, h('div', null, h('h2', null, 'Was Tippschrift alles kann'), P('Formeln, Graphen, Noten, Diagramme – in deiner Handschrift. Tippe an, um es auszuprobieren.')),
        btn('Alle ansehen', { icon: 'grid', cls: 'pri sm', onclick: () => openFeatures(app) })),
      featureTiles(app, ['formeln', 'graph', 'noten', 'aussehen'])));

    // Deine Daten
    const st = await syncStatus(), on = validCode(st.code);
    const when = st.at ? new Date(st.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
    const go = async () => { try { const r = await syncNow(); toast(!r ? 'Offline – später nochmal' : r.geholt ? `Abgeglichen: ${r.geholt} ${r.geholt === 1 ? 'Änderung' : 'Änderungen'} von einem anderen Gerät übernommen` : 'Abgeglichen – alles auf dem gleichen Stand', 3400); } catch (e) { toast('Abgleich fehlgeschlagen: ' + e.message, 5000, 'err'); } draw(); };
    const u = await usage(), persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    W.append(sec('Deine Daten',
      fold('refresh', C.blue, 'iPhone & iPad abgleichen', on ? (st.err ? '⚠ ' + st.err : when ? 'An · zuletzt ' + when : 'An') : 'Aus',
        P(on ? 'Schriften, Dokumente und Ordner werden automatisch abgeglichen. Gib auf dem anderen Gerät denselben Code ein.' : 'Halte deine Geräte automatisch auf dem gleichen Stand. Die Daten werden auf deinem Gerät verschlüsselt – ohne den Code kommt niemand heran, auch du nicht. Schreib ihn dir auf.'),
        on ? h('div', { class: 'synccode' }, h('code', null, fmtCode(st.code)), btn('Code kopieren', { icon: 'copy', cls: 'icon sm', title: 'Code kopieren', onclick: copy(fmtCode(st.code), 'Code kopiert') })) : null,
        h('div', { class: 'row wrap2' },
          on ? btn('Jetzt abgleichen', { icon: 'refresh', cls: 'pri sm', onclick: go }) : btn('Abgleich einschalten', { icon: 'refresh', cls: 'pri sm', onclick: async () => { await setCode(newCode()); await draw(); go(); } }),
          on ? null : btn('Code eingeben', { cls: 'sm', onclick: async () => { const t = await promptBox('Code vom anderen Gerät (24 Zeichen)', ''); if (t == null) return; const c = normCode(t); if (!validCode(c)) { toast('Der Code hat 24 Zeichen, z. B. abcd-efgh-…', 4000, 'err'); return; } await setCode(c); await draw(); go(); } }),
          on ? btn('Ausschalten', { cls: 'sm ghost', onclick: async () => { if (await confirmBox('Abgleich auf diesem Gerät ausschalten? Deine Daten bleiben hier erhalten. Mit dem Code kannst du ihn später wieder einschalten.', 'Ausschalten')) { await setCode(''); draw(); } } }) : null)),
      fold('download', C.green, 'Sicherung', 'Alle Schriften und Dokumente als eine Datei',
        P('Speichert alles in einer Datei (.tippschrift) – am besten in iCloud Drive. Damit holst du alles auf ein neues Gerät oder nach dem Löschen der Browserdaten zurück. Die App erinnert dich, wenn sich deine Schrift geändert hat.'),
        h('div', { class: 'row wrap2' }, btn('Alles sichern', { icon: 'download', cls: 'pri sm', onclick: async () => { try { await doBackup(); } catch (e) { toast('Sicherung fehlgeschlagen: ' + e.message, 4000, 'err'); } } }), restoreButton(app, draw))),
      fold('layers', C.gray, 'Speicher', (u ? `${fmtSize(u.usage || 0)} belegt` : 'Größe unbekannt') + (persisted ? ' · dauerhaft' : ''),
        P('Deine Schriften und Dokumente liegen nur in diesem Browser auf diesem Gerät. Mach eine Sicherung, bevor du Browserdaten löschst.'),
        h('div', { class: 'row wrap2' }, persisted ? h('span', { class: 'chip ok' }, 'Dauerhaft gespeichert') : btn('Dauerhaft speichern', { cls: 'sm', onclick: async () => { const ok = await persist(); toast(ok ? 'Der Browser löscht die Daten nicht mehr von selbst.' : 'Der Browser hat das abgelehnt.'); draw(); } }),
          btn('Alle Daten löschen', { cls: 'sm danger', icon: 'trash', onclick: async () => { if (await confirmBox('Wirklich ALLE Schriften und Dokumente von diesem Gerät löschen? Das lässt sich nicht rückgängig machen.', 'Alles löschen')) { await app.wipe(); } } })))));

    // KI
    W.append(sec('KI',
      fold('wand', C.purple, 'Blatt von einer KI schreiben lassen', 'Mit ChatGPT, Claude & Co.',
        P('Kopiere den Prompt, füge ihn in die KI ein und schreib deine Aufgabe dahinter. Die Antwort aus dem Codeblock fügst du in ein Dokument ein – Tippschrift setzt alles in deiner Handschrift.'),
        h('div', { class: 'row wrap2' },
          btn('Prompt kopieren', { icon: 'copy', cls: 'pri sm', onclick: copy(HDF_PROMPT, 'Prompt kopiert – in die KI einfügen und deine Aufgabe dahinterschreiben') }),
          btn('Ganze Beschreibung kopieren', { icon: 'copy', cls: 'sm', title: 'Für KIs, die keine Links öffnen', onclick: copy(HDF_DOC, 'Beschreibung kopiert') }),
          btn('Nur Link', { icon: 'copy', cls: 'sm ghost', onclick: copy(HDF_URL, 'Link kopiert') })),
        P('Öffnet eine KI den Link nicht (bei ChatGPT: Websuche einschalten), kopier die ganze Beschreibung.', 'xs mut'),
        btn('Beispiel-Arbeitsblatt öffnen', { cls: 'sm ghost', icon: 'file', onclick: async () => { const d = await app.newDoc({ title: 'Beispiel: Quadratische Funktionen', text: HDF_EXAMPLE, fontId: app.fontId, s: { paper: 'gnkar', fmt: 'gn', paperColor: 'weiss', scan: false, size: 18, ml: 110, mr: 70, mt: 60, mb: 50 } }); await app.openDoc(d.id); } }))));

    // App
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    const sw = app.swState, l = lastSync(), tage = l ? Math.floor((Date.now() - l) / 864e5) : 0, rest = daysLeft();
    W.append(sec('App',
      row('sun', C.orange, 'Darstellung', null, seg([['auto', 'Auto'], ['light', 'Hell'], ['dark', 'Dunkel']], () => app.theme, v => app.setTheme(v))),
      standalone ? row('check', C.green, 'Installiert', 'Läuft als App im Vollbild')
        : app.installPrompt ? row('download', C.blue, 'Als App installieren', 'Startet wie jede App, auch ohne Internet', btn('Installieren', { cls: 'pri sm', onclick: async () => { app.installPrompt.prompt(); await app.installPrompt.userChoice; app.installPrompt = null; draw(); } }))
        : fold('download', C.blue, 'Als App installieren', 'Startet wie jede App, auch ohne Internet', P(ios ? 'Tippe in Safari auf das Teilen-Symbol und dann auf „Zum Home-Bildschirm“.' : 'Im Browser-Menü (⋮ oder Adressleiste) findest du „App installieren“ bzw. „Zum Startbildschirm“.')),
      fold('eye', C.teal, 'Offline & Updates', (sw === 'ready' ? 'Offline bereit' : sw === 'unsupported' ? 'Offline nicht unterstützt' : 'Wird vorbereitet …') + ' · ' + (navigator.onLine ? 'online' : 'offline'),
        P('Nach dem ersten Laden funktioniert alles ohne Internet: Schreiben, Schriften, Export und sogar das Einlesen von Bögen.'),
        P(`Zuletzt verbunden: ${!l || tage === 0 ? 'heute' : tage === 1 ? 'vor 1 Tag' : `vor ${tage} Tagen`}. Die App muss mindestens alle ${SYNC_DAYS} Tage einmal online gehen, um Updates zu laden (noch ${rest} ${rest === 1 ? 'Tag' : 'Tage'}).`),
        btn('Jetzt prüfen', { cls: 'sm', icon: 'refresh', onclick: async () => { const ok = await checkNow(); toast(ok ? 'Verbunden – die App ist auf dem neuesten Stand.' : 'Keine Verbindung zum Server.', 3200, ok ? undefined : 'err'); draw(); } }))));

    // Hilfe
    W.append(sec('Hilfe',
      faq('Wie entsteht meine Schrift?', 'Unter „Schriften“ wählst du Pakete (z. B. Standard, Mathe, Französisch). Du bekommst einen Bogen, schreibst jedes Zeichen in sein Kästchen und lädst den Bogen wieder hoch – oder du zeichnest die Zeichen direkt in der App. Daraus entsteht deine Schrift.'),
      faq('Meine Bögen werden schlecht erkannt', 'Am besten exportierst du den Bogen direkt als PDF aus GoodNotes. Bei Fotos: gerade von oben, gutes Licht, keine Schatten, den ganzen Bogen im Bild. Dunkler Stift, nicht den Kästchenrand berühren. Der QR-Code verrät der App, welche Zeichen auf welchem Bogen stehen.'),
      faq('Kann ich später Zeichen hinzufügen?', 'Ja. Unter „Schriften“ bei deiner Schrift auf Plus tippen: fehlende Zeichen zeichnen, weitere Varianten hinzufügen oder ganze Pakete wie Mathe oder Noten dazunehmen. Fehlende Akzentbuchstaben setzt die App aus Buchstabe und Akzent zusammen.'),
      faq('Wie komme ich in GoodNotes?', 'Beim Export „Echte Striche“ wählen und die .goodnotes-Datei speichern, in GoodNotes dann + → Importieren. Du bekommst echte Stiftstriche, die du radieren und bearbeiten kannst – auf dem passenden GoodNotes-Papier.'),
      faq('Wo liegen meine Daten?', 'Auf diesem Gerät, in diesem Browser. Es gibt kein Konto. Nur wenn du den Abgleich einschaltest, liegt zusätzlich ein verschlüsselter Stand auf dem Server, den nur Geräte mit deinem Code lesen können.')));

    // Rechtliches
    W.append(sec('Rechtliches',
      row('info', C.gray, 'Impressum', null, null, () => openLegal('impressum')),
      row('eye', C.gray, 'Datenschutz', null, null, () => openLegal('datenschutz')),
      row('book', C.gray, 'Credits & Lizenzen', null, null, () => openLegal('credits'))));
    W.append(h('p', { class: 'xs mut mfoot' }, `Tippschrift ${VERSION} · läuft komplett auf deinem Gerät`, h('br'), 'Beispielschrift „always * forever“ © Brittney Murphy (privat/nicht-kommerziell)'));
    if (my !== gen) return;   // ein neueres draw() läuft schon – sonst stünde alles doppelt da
    for (const d of W.querySelectorAll('details')) if (open.has(d.querySelector('summary b')?.textContent)) d.open = true;
    wrap.replaceChildren(W);
  }
  draw();
  return { el: root, refresh: draw };
}
