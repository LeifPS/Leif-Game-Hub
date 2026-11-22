// Sicherung: alle eigenen Schriften und Dokumente als eine Datei (.stools) – z. B. in iCloud Drive ablegen
import { h, toast, saveFile, fmtSize } from './util.js';
import { btn, confirmBox } from './ui.js';
import { backupBlob, markBackedUp, restoreBackup, backupReminder, snoozeBackup } from './store.js';

export async function doBackup() {
  const { blob, fonts, docs } = await backupBlob();
  const d = new Date(), tag = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const r = await saveFile(blob, `STools-Sicherung-${tag}.stools`, { share: true });
  if (r === 'abgebrochen') return false;
  await markBackedUp();
  toast(`Gesichert: ${fonts} ${fonts === 1 ? 'Schrift' : 'Schriften'}, ${docs} ${docs === 1 ? 'Dokument' : 'Dokumente'} (${fmtSize(blob.size)})`, 3600);
  return true;
}

export function restoreButton(app, onDone) {
  const inp = h('input', { type: 'file', accept: '.stools,application/json', class: 'sr', onchange: async () => {
    const f = inp.files[0]; inp.value = ''; if (!f) return;
    if (!(await confirmBox('Sicherung einspielen? Schriften und Dokumente aus der Datei kommen dazu; gleiche Einträge werden durch den Stand aus der Sicherung ersetzt.', 'Einspielen'))) return;
    try { const n = await restoreBackup(f); app.folders = await (await import('./store.js')).kvGet('folders', []); await app.fontsChanged(); await app.loadDocs(); app.views.docs.refresh(); app.views.fonts.refresh(); toast(`Eingespielt: ${n.fonts} ${n.fonts === 1 ? 'Schrift' : 'Schriften'}, ${n.docs} ${n.docs === 1 ? 'Dokument' : 'Dokumente'}`, 3600); onDone && onDone(); }
    catch (e) { toast(e.message, 5000, 'err'); }
  } });
  return h('span', null, inp, btn('Sicherung einspielen', { icon: 'upload', cls: 'sm', onclick: () => inp.click() }));
}

/** Hinweis-Karte oben in „Dokumente“, wenn eine Sicherung fällig ist (sonst leeres Element). */
export function reminderCard(redraw) {
  const box = h('div');
  backupReminder().then((r) => {
    if (!r) return;
    const txt = r.why === 'font' ? 'Deine Schrift hat sich geändert und ist noch nicht gesichert. Löscht der Browser seine Daten, wären die gezeichneten Zeichen weg.' : 'Deine Dokumente wurden seit über einer Woche nicht gesichert.';
    box.replaceChildren(h('div', { class: 'note', style: { marginBottom: '12px' } }, h('b', null, 'Sicherung empfohlen: '), txt,
      h('div', { class: 'row wrap2', style: { marginTop: '8px' } },
        btn('Jetzt sichern', { icon: 'download', cls: 'sm pri', onclick: async () => { try { if (await doBackup()) box.replaceChildren(); } catch (e) { toast('Sicherung fehlgeschlagen: ' + e.message, 4000, 'err'); } } }),
        btn('Später', { cls: 'sm ghost', onclick: async () => { await snoozeBackup(); box.replaceChildren(); } }))));
  });
  return box;
}
