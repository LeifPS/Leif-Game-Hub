// Ansicht „Mehr“: Darstellung, Installation, Offline, Speicher, Hilfe
import { h, toast, fmtSize } from './util.js';
import { btn, seg, confirmBox } from './ui.js';
import { usage, persist } from './store.js';
import { doBackup, restoreButton } from './backup.js';
import { syncStatus, syncNow, newCode, setCode, fmtCode, normCode, validCode } from './sync.js';
import { promptBox } from './ui.js';
import { lastSync, daysLeft, checkNow, SYNC_DAYS } from './session.js';
import { HDF_DOC, HDF_URL, HDF_PROMPT, HDF_EXAMPLE } from './hdfdoc.js';
import { featureTiles, openFeatures } from './features.js';

export const VERSION = '1.0';
export function moreView(app) {
  const root = h('div', { class: 'scroll' }), wrap = h('div', { class: 'wrap' }); root.append(wrap);
  const grp = (t, ...c) => h('section', { class: 'grp' }, h('h4', null, t), h('div', { class: 'card' }, ...c));
  const faq = (q, a) => h('details', { class: 'faq' }, h('summary', null, q), h('p', null, a));
  async function draw() {
    wrap.replaceChildren(h('div', { class: 'phead' }, h('h1', null, 'Mehr')));
    // Darstellung
    wrap.append(grp('Darstellung', h('div', { style: { marginTop: '10px' } }, seg([['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']], () => app.theme, v => app.setTheme(v)))));
    // Installieren
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    wrap.append(grp('App installieren',
      standalone ? h('p', { class: 'mut sm', style: { margin: '8px 0 0' } }, 'Die App ist installiert und läuft im Vollbild.')
        : app.installPrompt ? h('div', null, h('p', { class: 'mut sm' }, 'Installiere die App, dann startet sie wie jede andere und funktioniert auch ohne Internet.'), btn('Installieren', { icon: 'download', cls: 'pri', onclick: async () => { app.installPrompt.prompt(); await app.installPrompt.userChoice; app.installPrompt = null; draw(); } }))
        : h('p', { class: 'mut sm', style: { margin: '8px 0 0' } }, ios ? 'Tippe in Safari auf das Teilen-Symbol und dann auf „Zum Home-Bildschirm“. Danach startet die App wie eine normale App, auch ohne Internet.' : 'Im Browser-Menü (⋮ oder Adressleiste) findest du „App installieren“ bzw. „Zum Startbildschirm“.')));
    // Offline
    const sw = app.swState;
    wrap.append(grp('Offline nutzen', h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'chip ' + (sw === 'ready' ? 'ok' : 'warn') }, sw === 'ready' ? 'Offline bereit' : sw === 'unsupported' ? 'Nicht unterstützt' : 'Wird vorbereitet …'), h('span', { class: 'chip' }, navigator.onLine ? 'Online' : 'Offline')),
      h('p', { class: 'mut sm', style: { margin: '8px 0 0' } }, 'Nach dem ersten Laden funktioniert alles ohne Internet: Schreiben, Schriften, Export und sogar das Einlesen von Bögen.')));
    // Updates / Sitzung
    { const l = lastSync(), tage = l ? Math.floor((Date.now() - l) / 864e5) : 0, rest = daysLeft();
      wrap.append(grp('Updates',
        h('p', { class: 'mut sm', style: { margin: '8px 0' } }, `Zuletzt mit dem Server verbunden: ${!l || tage === 0 ? 'heute' : tage === 1 ? 'vor 1 Tag' : `vor ${tage} Tagen`}. Die App funktioniert offline, muss aber mindestens alle ${SYNC_DAYS} Tage einmal online gehen, um Updates zu laden (noch ${rest} ${rest === 1 ? 'Tag' : 'Tage'}). Zwei Tage vorher gibt es eine Warnung.`),
        btn('Jetzt prüfen', { cls: 'sm', onclick: async () => { const ok = await checkNow(); toast(ok ? 'Verbunden – die App ist auf dem neuesten Stand.' : 'Keine Verbindung zum Server.', 3200, ok ? undefined : 'err'); draw(); } }))); }
    // Speicher
    const u = await usage(), persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    wrap.append(grp('Speicher', h('p', { class: 'mut sm', style: { margin: '8px 0' } }, u ? `Diese App belegt ca. ${fmtSize(u.usage || 0)} auf deinem Gerät.` : 'Speicherangaben sind in diesem Browser nicht verfügbar.'),
      h('p', { class: 'mut sm' }, 'Deine Schriften und Dokumente liegen nur in diesem Browser. Exportiere wichtige Schriften als Datei, bevor du Browserdaten löschst.'),
      h('div', { class: 'row wrap2' }, persisted ? h('span', { class: 'chip ok' }, 'Dauerhaft gespeichert') : btn('Dauerhaften Speicher anfordern', { cls: 'sm', onclick: async () => { const ok = await persist(); toast(ok ? 'Der Browser löscht die Daten nicht mehr von selbst.' : 'Der Browser hat das abgelehnt.'); draw(); } }),
        btn('Alle Daten löschen', { cls: 'sm danger', icon: 'trash', onclick: async () => { if (await confirmBox('Wirklich ALLE Schriften und Dokumente von diesem Gerät löschen? Das lässt sich nicht rückgängig machen.', 'Alles löschen')) { await app.wipe(); } } }))));
    // Abgleich zwischen Geräten
    { const st = await syncStatus(), on = validCode(st.code);
      const when = st.at ? new Date(st.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
      const go = async () => { try { const r = await syncNow(); toast(!r ? 'Offline – später nochmal' : r.geholt ? `Abgeglichen: ${r.geholt} ${r.geholt === 1 ? 'Änderung' : 'Änderungen'} von einem anderen Gerät übernommen` : 'Abgeglichen – alles auf dem gleichen Stand', 3400); } catch (e) { toast('Abgleich fehlgeschlagen: ' + e.message, 5000, 'err'); } draw(); };
      wrap.append(grp('Abgleich zwischen Geräten',
        h('p', { class: 'mut sm', style: { margin: '0 0 10px' } }, on ? 'Schriften, Dokumente und Ordner werden automatisch zwischen deinen Geräten abgeglichen. Gib auf dem anderen Gerät denselben Code ein.' : 'Halte iPhone und iPad automatisch auf dem gleichen Stand. Die Daten werden auf deinem Gerät verschlüsselt, der Server kann sie nicht lesen. Ohne den Code kommt niemand heran, auch du nicht – schreib ihn dir auf.'),
        on ? h('div', { class: 'synccode' }, h('code', null, fmtCode(st.code)), btn('Code kopieren', { icon: 'copy', cls: 'icon sm', title: 'Code kopieren', onclick: async () => { try { await navigator.clipboard.writeText(fmtCode(st.code)); toast('Code kopiert'); } catch (e) { toast('Kopieren nicht möglich', 3000, 'err'); } } })) : null,
        on ? h('p', { class: 'xs mut', style: { margin: '8px 0 10px' } }, st.err ? '⚠ ' + st.err : when ? 'Zuletzt abgeglichen: ' + when : 'Noch nicht abgeglichen') : null,
        h('div', { class: 'row wrap2' },
          on ? btn('Jetzt abgleichen', { icon: 'refresh', cls: 'pri', onclick: go }) : btn('Abgleich einschalten', { icon: 'refresh', cls: 'pri', onclick: async () => { await setCode(newCode()); await draw(); go(); } }),
          on ? null : btn('Code von anderem Gerät eingeben', { cls: 'sm', onclick: async () => { const t = await promptBox('Code vom anderen Gerät (24 Zeichen)', ''); if (t == null) return; const c = normCode(t); if (!validCode(c)) { toast('Der Code hat 24 Zeichen, z. B. abcd-efgh-…', 4000, 'err'); return; } await setCode(c); await draw(); go(); } }),
          on ? btn('Ausschalten', { cls: 'sm ghost', onclick: async () => { const { confirmBox } = await import('./ui.js'); if (await confirmBox('Abgleich auf diesem Gerät ausschalten? Deine Daten bleiben hier erhalten. Mit dem Code kannst du ihn später wieder einschalten.', 'Ausschalten')) { await setCode(''); draw(); } } }) : null)));
    }
    // Sicherung
    wrap.append(grp('Sicherung',
      h('p', { class: 'mut sm', style: { margin: '8px 0' } }, 'Speichert alle eigenen Schriften und Dokumente in einer Datei (.stools). Lege sie am besten in iCloud Drive ab. Damit kannst du alles auf einem neuen Gerät oder nach dem Löschen der Browserdaten wiederherstellen. Die App erinnert dich, wenn sich deine Schrift geändert hat.'),
      h('div', { class: 'row wrap2' }, btn('Alles sichern', { icon: 'download', cls: 'pri', onclick: async () => { try { await doBackup(); } catch (e) { toast('Sicherung fehlgeschlagen: ' + e.message, 4000, 'err'); } } }), restoreButton(app, draw))));
    // Visuals (HDF)
    wrap.append(grp('Textformat für KIs (HDF)',
      h('p', { class: 'mut sm', style: { margin: '8px 0' } }, 'STools versteht ein Textformat (HDF) mit Formeln, Rechenwegen, Koordinatensystemen, Tabellen, Noten und mehr. Die Beschreibung erklärt nur, was es gibt – was du haben willst, sagst du der KI selbst. Die Antwort fügst du in ein Dokument ein, dann setzt STools alles in deiner Handschrift.'),
      h('div', { class: 'row wrap2' },
        btn('Format-Beschreibung kopieren', { icon: 'copy', cls: 'pri', onclick: async () => { try { await navigator.clipboard.writeText(HDF_DOC); toast('Beschreibung kopiert'); } catch (e) { toast('Kopieren nicht möglich', 3000, 'err'); } } }),
        btn('Prompt kopieren', { icon: 'copy', cls: 'sm', title: 'Fertiger Auftrag mit Link: einfügen, deine Aufgabe dahinterschreiben', onclick: async () => { try { await navigator.clipboard.writeText(HDF_PROMPT); toast('Prompt kopiert – in die KI einfügen und deine Aufgabe dahinterschreiben', 3500); } catch (e) { toast('Kopieren nicht möglich', 3000, 'err'); } } }),
        btn('Nur den Link kopieren', { icon: 'copy', cls: 'sm', onclick: async () => { try { await navigator.clipboard.writeText(HDF_URL); toast('Link kopiert'); } catch (e) { toast('Kopieren nicht möglich', 3000, 'err'); } } }),
        btn('Beispiel-Arbeitsblatt öffnen', { cls: 'sm', onclick: async () => { const d = await app.newDoc({ title: 'Beispiel: Quadratische Funktionen', text: HDF_EXAMPLE, fontId: app.fontId, s: { paper: 'gnkar', fmt: 'gn', paperColor: 'weiss', scan: false, size: 18, ml: 110, mr: 70, mt: 60, mb: 50 } }); await app.openDoc(d.id); } })),
      h('p', { class: 'mut sm', style: { margin: '10px 0 0' } }, '„Prompt kopieren“ ist ein fertiger Auftrag mit Link (st.leifps.de/hdf): einfügen und deine Aufgabe dahinterschreiben. Manche KIs öffnen Links nicht zuverlässig (bei ChatGPT die Websuche einschalten), dann die ganze Beschreibung kopieren.')));
    // Was STools kann: Galerie mit Vorschauen in der eigenen Schrift
    wrap.append(grp('Was STools alles kann',
      h('p', { class: 'mut sm', style: { margin: '4px 0 12px' } }, 'Formeln, Graphen, Noten, Diagramme und mehr – in deiner Handschrift. Tippe an, um es auszuprobieren.'),
      featureTiles(app, ['formeln', 'graph', 'noten', 'aussehen']),
      h('div', { class: 'row', style: { marginTop: '12px' } }, btn('Alle Funktionen ansehen', { icon: 'grid', cls: 'pri', onclick: () => openFeatures(app) }))));
    // Hilfe
    wrap.append(grp('Hilfe',
      faq('Wie entsteht meine Schrift?', 'Unter „Schriften“ wählst du Pakete (z. B. Standard, Mathe, Französisch). Du bekommst einen Bogen, schreibst jedes Zeichen in sein Kästchen und lädst den Bogen wieder hoch. Die App schneidet die Zeichen aus und baut daraus deine Schrift.'),
      faq('Was ist der QR-Code auf den Bögen?', 'Er verrät der App, welche Zeichen auf welchem Bogen stehen. Dadurch erkennt sie jeden hochgeladenen Bogen allein, auch wenn du die Reihenfolge durcheinanderbringst.'),
      faq('Meine Bögen werden schlecht erkannt', 'Am besten exportierst du den Bogen direkt als PDF aus GoodNotes oder einer anderen Notiz-App. Bei Fotos: gerade von oben, gutes Licht, keine Schatten, den ganzen Bogen im Bild. Dunkler Stift, nicht den Kästchenrand berühren.'),
      faq('Kann ich später Zeichen hinzufügen?', 'Ja. Unter „Schriften“ bei deiner Schrift auf „Ergänzen“ tippen. Dort kannst du fehlende Zeichen zeichnen, weitere Varianten für beliebige Zeichen hinzufügen (die neuen kommen zu den alten dazu) und ganze Pakete wie Mathe oder Griechisch dazunehmen. Fehlen beim Schreiben Zeichen, schlägt die App das direkt vor.'),
      faq('Was passiert mit fehlenden Akzenten?', 'Akzentbuchstaben, die du nicht geschrieben hast, setzt die App aus dem Buchstaben und einem gezeichneten Akzent zusammen. Echte Zeichen aus einem Paket sehen immer besser aus.'),
      faq('Wie komme ich in GoodNotes?', 'Beim Export „GoodNotes: echte Striche“ wählen und die .goodnotes-Datei speichern. In GoodNotes dann auf + → Importieren tippen. Du bekommst echte Handschrift-Striche, die du radieren und weiterbearbeiten kannst. Als Papier kannst du unter Einstellungen „GoodNotes liniert“ oder „GoodNotes kariert“ wählen, dann sitzt die Schrift genau auf den Linien. Alternativ geht auch PDF.'),
      faq('Kann ich Zeichen direkt in der App zeichnen?', 'Ja. Beim Erstellen einer Schrift im Schritt „Vorlage“ „Direkt in der App zeichnen“ wählen, oder später bei „Ergänzen“. Jedes Zeichen zeichnest du mit Finger oder Apple Pencil in ein Feld mit Hilfslinien. Die Striche bleiben als echte Striche erhalten und landen im GoodNotes-Export 1:1.'),
      faq('Wo liegen meine Daten?', 'Auf diesem Gerät, in diesem Browser. Es gibt kein Konto. Nur wenn du den Abgleich einschaltest, liegt zusätzlich ein verschlüsselter Stand auf dem Server, den nur Geräte mit deinem Code lesen können. Mit „Alles sichern“ (oben) nimmst du alle Schriften und Dokumente auf ein anderes Gerät mit; eine einzelne Schrift geht auch als .hsfont.')));
    wrap.append(h('p', { class: 'xs mut', style: { textAlign: 'center', margin: '18px 0 0' } }, `STools Beta ${VERSION} · läuft komplett auf deinem Gerät · Beispielschrift „always * forever“ © Brittney Murphy (privat/nicht-kommerziell)`));
  }
  draw();
  return { el: root, refresh: draw };
}
