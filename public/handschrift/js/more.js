// Ansicht „Mehr“: Darstellung, Installation, Offline, Speicher, Hilfe
import { h, toast, fmtSize } from './util.js';
import { btn, seg, confirmBox } from './ui.js';
import { usage, persist } from './store.js';
import { doBackup, restoreButton } from './backup.js';
import { lastSync, daysLeft, checkNow, SYNC_DAYS } from './session.js';
import { HDF_DOC, HDF_PROMPT, HDF_EXAMPLE } from './hdfdoc.js';

export const VERSION = '1.0';
export function moreView(app) {
  const root = h('div', { class: 'scroll' }), wrap = h('div', { class: 'wrap' }); root.append(wrap);
  const faq = (q, a) => h('details', { class: 'faq' }, h('summary', null, q), h('p', null, a));
  async function draw() {
    wrap.replaceChildren(h('h1', { style: { marginBottom: '14px' } }, 'Mehr'));
    // Darstellung
    wrap.append(h('div', { class: 'card' }, h('h3', null, 'Darstellung'), h('div', { style: { marginTop: '10px' } }, seg([['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']], () => app.theme, v => app.setTheme(v)))));
    // Installieren
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1), standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    wrap.append(h('div', { class: 'card' }, h('h3', null, 'App installieren'),
      standalone ? h('p', { class: 'mut sm', style: { margin: '8px 0 0' } }, 'Die App ist installiert und läuft im Vollbild.')
        : app.installPrompt ? h('div', null, h('p', { class: 'mut sm' }, 'Installiere die App, dann startet sie wie jede andere und funktioniert auch ohne Internet.'), btn('Installieren', { icon: 'download', cls: 'pri', onclick: async () => { app.installPrompt.prompt(); await app.installPrompt.userChoice; app.installPrompt = null; draw(); } }))
        : h('p', { class: 'mut sm', style: { margin: '8px 0 0' } }, ios ? 'Tippe in Safari auf das Teilen-Symbol und dann auf „Zum Home-Bildschirm“. Danach startet die App wie eine normale App, auch ohne Internet.' : 'Im Browser-Menü (⋮ oder Adressleiste) findest du „App installieren“ bzw. „Zum Startbildschirm“.')));
    // Offline
    const sw = app.swState;
    wrap.append(h('div', { class: 'card' }, h('h3', null, 'Offline nutzen'), h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'chip ' + (sw === 'ready' ? 'ok' : 'warn') }, sw === 'ready' ? 'Offline bereit' : sw === 'unsupported' ? 'Nicht unterstützt' : 'Wird vorbereitet …'), h('span', { class: 'chip' }, navigator.onLine ? 'Online' : 'Offline')),
      h('p', { class: 'mut sm', style: { margin: '8px 0 0' } }, 'Nach dem ersten Laden funktioniert alles ohne Internet: Schreiben, Schriften, Export und sogar das Einlesen von Bögen.')));
    // Updates / Sitzung
    { const l = lastSync(), tage = l ? Math.floor((Date.now() - l) / 864e5) : 0, rest = daysLeft();
      wrap.append(h('div', { class: 'card' }, h('h3', null, 'Updates'),
        h('p', { class: 'mut sm', style: { margin: '8px 0' } }, `Zuletzt mit dem Server verbunden: ${!l || tage === 0 ? 'heute' : tage === 1 ? 'vor 1 Tag' : `vor ${tage} Tagen`}. Die App funktioniert offline, muss aber mindestens alle ${SYNC_DAYS} Tage einmal online gehen, um Updates zu laden (noch ${rest} ${rest === 1 ? 'Tag' : 'Tage'}). Zwei Tage vorher gibt es eine Warnung.`),
        btn('Jetzt prüfen', { cls: 'sm', onclick: async () => { const ok = await checkNow(); toast(ok ? 'Verbunden – die App ist auf dem neuesten Stand.' : 'Keine Verbindung zum Server.', 3200, ok ? undefined : 'err'); draw(); } }))); }
    // Speicher
    const u = await usage(), persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    wrap.append(h('div', { class: 'card' }, h('h3', null, 'Speicher'), h('p', { class: 'mut sm', style: { margin: '8px 0' } }, u ? `Diese App belegt ca. ${fmtSize(u.usage || 0)} auf deinem Gerät.` : 'Speicherangaben sind in diesem Browser nicht verfügbar.'),
      h('p', { class: 'mut sm' }, 'Deine Schriften und Dokumente liegen nur in diesem Browser. Exportiere wichtige Schriften als Datei, bevor du Browserdaten löschst.'),
      h('div', { class: 'row wrap2' }, persisted ? h('span', { class: 'chip ok' }, 'Dauerhaft gespeichert') : btn('Dauerhaften Speicher anfordern', { cls: 'sm', onclick: async () => { const ok = await persist(); toast(ok ? 'Der Browser löscht die Daten nicht mehr von selbst.' : 'Der Browser hat das abgelehnt.'); draw(); } }),
        btn('Alle Daten löschen', { cls: 'sm danger', icon: 'trash', onclick: async () => { if (await confirmBox('Wirklich ALLE Schriften und Dokumente von diesem Gerät löschen? Das lässt sich nicht rückgängig machen.', 'Alles löschen')) { await app.wipe(); } } }))));
    // Sicherung
    wrap.append(h('div', { class: 'card' }, h('h3', null, 'Sicherung'),
      h('p', { class: 'mut sm', style: { margin: '8px 0' } }, 'Speichert alle eigenen Schriften und Dokumente in einer Datei (.stools). Lege sie am besten in iCloud Drive ab. Damit kannst du alles auf einem neuen Gerät oder nach dem Löschen der Browserdaten wiederherstellen. Die App erinnert dich, wenn sich deine Schrift geändert hat.'),
      h('div', { class: 'row wrap2' }, btn('Alles sichern', { icon: 'download', cls: 'pri', onclick: async () => { try { await doBackup(); } catch (e) { toast('Sicherung fehlgeschlagen: ' + e.message, 4000, 'err'); } } }), restoreButton(app, draw))));
    // Visuals (HDF)
    wrap.append(h('div', { class: 'card' }, h('h3', null, 'Visuals und KI (HDF-Format)'),
      h('p', { class: 'mut sm', style: { margin: '8px 0' } }, 'Eine KI kann ein komplettes Arbeitsblatt mit Formeln, Rechenwegen, Koordinatensystemen und Tabellen als Text schreiben. Füge ihn in ein Dokument ein, dann setzt STools alles in deiner Handschrift. Mathe ist auf GoodNotes „kariert“ ausgelegt.'),
      h('div', { class: 'row wrap2' },
        btn('Auftrag für die KI kopieren', { icon: 'copy', cls: 'pri', onclick: async () => { try { await navigator.clipboard.writeText(HDF_PROMPT); toast('Kopiert – in die KI einfügen und das Thema eintragen'); } catch (e) { toast('Kopieren nicht möglich', 3000, 'err'); } } }),
        btn('Nur die Format-Beschreibung', { icon: 'copy', cls: 'sm', onclick: async () => { try { await navigator.clipboard.writeText(HDF_DOC); toast('Beschreibung kopiert'); } catch (e) { toast('Kopieren nicht möglich', 3000, 'err'); } } }),
        btn('Beispiel-Arbeitsblatt öffnen', { cls: 'sm', onclick: async () => { const d = await app.newDoc({ title: 'Beispiel: Quadratische Funktionen', text: HDF_EXAMPLE, fontId: app.fontId, s: { paper: 'gnkar', fmt: 'gn', paperColor: 'weiss', scan: false, size: 18, ml: 110, mr: 70, mt: 60, mb: 50 } }); await app.openDoc(d.id); } })),
      h('p', { class: 'mut sm', style: { margin: '10px 0 0' } }, 'Ablauf: „Auftrag für die KI kopieren“, in ChatGPT/Claude einfügen, Thema eintragen, die Antwort kopieren und in einem neuen Dokument einfügen (oder als .hdf-Datei hochladen).')));
    // Hilfe
    wrap.append(h('div', { class: 'card' }, h('h3', { style: { marginBottom: '4px' } }, 'Hilfe'),
      faq('Wie entsteht meine Schrift?', 'Unter „Schriften“ wählst du Pakete (z. B. Standard, Mathe, Französisch). Du bekommst einen Bogen, schreibst jedes Zeichen in sein Kästchen und lädst den Bogen wieder hoch. Die App schneidet die Zeichen aus und baut daraus deine Schrift.'),
      faq('Was ist der QR-Code auf den Bögen?', 'Er verrät der App, welche Zeichen auf welchem Bogen stehen. Dadurch erkennt sie jeden hochgeladenen Bogen allein, auch wenn du die Reihenfolge durcheinanderbringst.'),
      faq('Meine Bögen werden schlecht erkannt', 'Am besten exportierst du den Bogen direkt als PDF aus GoodNotes oder einer anderen Notiz-App. Bei Fotos: gerade von oben, gutes Licht, keine Schatten, den ganzen Bogen im Bild. Dunkler Stift, nicht den Kästchenrand berühren.'),
      faq('Kann ich später Zeichen hinzufügen?', 'Ja. Unter „Schriften“ bei deiner Schrift auf „Ergänzen“ tippen. Dort kannst du fehlende Zeichen zeichnen, weitere Varianten für beliebige Zeichen hinzufügen (die neuen kommen zu den alten dazu) und ganze Pakete wie Mathe oder Griechisch dazunehmen. Fehlen beim Schreiben Zeichen, schlägt die App das direkt vor.'),
      faq('Was passiert mit fehlenden Akzenten?', 'Akzentbuchstaben, die du nicht geschrieben hast, setzt die App aus dem Buchstaben und einem gezeichneten Akzent zusammen. Echte Zeichen aus einem Paket sehen immer besser aus.'),
      faq('Wie komme ich in GoodNotes?', 'Beim Export „GoodNotes: echte Striche“ wählen und die .goodnotes-Datei speichern. In GoodNotes dann auf + → Importieren tippen. Du bekommst echte Handschrift-Striche, die du radieren und weiterbearbeiten kannst. Als Papier kannst du unter Einstellungen „GoodNotes liniert“ oder „GoodNotes kariert“ wählen, dann sitzt die Schrift genau auf den Linien. Alternativ geht auch PDF.'),
      faq('Kann ich Zeichen direkt in der App zeichnen?', 'Ja. Beim Erstellen einer Schrift im Schritt „Vorlage“ „Direkt in der App zeichnen“ wählen, oder später bei „Ergänzen“. Jedes Zeichen zeichnest du mit Finger oder Apple Pencil in ein Feld mit Hilfslinien. Die Striche bleiben als echte Striche erhalten und landen im GoodNotes-Export 1:1.'),
      faq('Wo liegen meine Daten?', 'Nur auf diesem Gerät, in diesem Browser. Es gibt kein Konto und es wird nichts hochgeladen. Mit „Alles sichern“ (oben) nimmst du alle Schriften und Dokumente auf ein anderes Gerät mit; eine einzelne Schrift geht auch als .hsfont.')));
    wrap.append(h('p', { class: 'xs mut', style: { textAlign: 'center', margin: '18px 0 0' } }, `STools ${VERSION} · läuft komplett auf deinem Gerät · Beispielschrift „always * forever“ © Brittney Murphy (privat/nicht-kommerziell)`));
  }
  draw();
  return { el: root, refresh: draw };
}
