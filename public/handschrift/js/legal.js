// Rechtliches: Impressum, Datenschutz, Credits/Lizenzen. Als Fenster in der App (Mehr → Rechtliches, Seitenleiste unten).
import { h } from './util.js';
import { sheet } from './ui.js';

export const OWNER = { name: 'Leif Schmale', street: 'Hoppersheider Busch 13b', city: '51467 Bergisch Gladbach', mail: 'leifps@icloud.com' };
const STAND = 'November 2026';

const P = (...c) => h('p', null, ...c), H = (t) => h('h3', null, t), A = (href, t) => h('a', { href, target: '_blank', rel: 'noopener' }, t || href);
const UL = (...li) => h('ul', null, ...li.map((t) => h('li', null, t)));
const addr = () => h('p', null, OWNER.name, h('br'), OWNER.street, ...(OWNER.city ? [h('br'), OWNER.city] : []), h('br'), 'E-Mail: ', A('mailto:' + OWNER.mail, OWNER.mail));

const PAGES = {
  impressum: ['Impressum', () => [
    H('Angaben gemäß § 5 DDG'), addr(),
    H('Verantwortlich für den Inhalt'), P('Verantwortlich nach § 18 Abs. 2 MStV: ', OWNER.name, ', Anschrift wie oben.'),
    H('Hinweis'), P('STools ist ein privates, nicht-kommerzielles Projekt. Es gibt keine Werbung und nichts zu kaufen.'),
    H('Haftung'), P('Die Inhalte wurden mit Sorgfalt erstellt. Für die Richtigkeit, Vollständigkeit und Aktualität kann ich jedoch keine Gewähr übernehmen. Für Inhalte verlinkter fremder Seiten sind ausschließlich deren Betreiber verantwortlich.'),
  ]],
  datenschutz: ['Datenschutz', () => [
    P(h('b', null, 'Kurz gesagt: '), 'STools braucht kein Konto, setzt keine Cookies, hat kein Tracking und keine Werbung. Deine Schriften und Dokumente bleiben auf deinem Gerät. Daten verlassen dein Gerät nur, wenn du eine der unten genannten Zusatzfunktionen selbst benutzt.'),
    H('1. Verantwortlicher'), addr(),
    H('2. Speicherung auf deinem Gerät'), P('Schriften, Dokumente und Einstellungen speichert die App im Speicher deines Browsers (IndexedDB und localStorage) auf deinem Gerät. Sie werden nicht an mich übertragen. Die App-Dateien werden für die Offline-Nutzung ebenfalls auf deinem Gerät zwischengespeichert. Löschen kannst du alles unter Mehr → „Alle Daten löschen“ oder über die Einstellungen deines Browsers.'),
    H('3. Aufruf der Website (Hosting)'), P('Die Website wird über Cloudflare, Inc. (101 Townsend St, San Francisco, CA 94107, USA) bereitgestellt. Beim Aufruf werden technisch notwendige Daten verarbeitet, damit die Seite ausgeliefert und vor Angriffen geschützt werden kann: IP-Adresse, Zeitpunkt, aufgerufene Datei, Browser- und Geräteangaben. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse an einem sicheren, funktionierenden Angebot). Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert. Mehr: ', A('https://www.cloudflare.com/de-de/privacypolicy/'), '.'),
    H('4. Abgleich zwischen Geräten (freiwillig)'), P('Nur wenn du den Abgleich einschaltest: Deine Daten werden auf deinem Gerät mit deinem persönlichen Code verschlüsselt und erst dann auf meinen Server (Cloudflare) hochgeladen. Der Server speichert nur eine zufällige Kennung und die verschlüsselten Stücke – lesen kann er sie nicht. Zum Schutz vor Missbrauch wird für höchstens eine Stunde ein nicht umkehrbarer, gekürzter Prüfwert der IP-Adresse gespeichert. Alte Fassungen werden beim nächsten Abgleich gelöscht. Wenn du die Daten auf dem Server löschen lassen möchtest, schreib mir eine E-Mail mit den ersten vier Zeichen deines Codes. Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO (die von dir gewünschte Funktion).'),
    H('5. Titelvorschlag mit KI (freiwillig)'), P('Nur wenn du auf den Zauberstab neben dem Titel tippst: Die ersten 2.500 Zeichen des Dokuments werden an meinen Server gesendet und dort mit Cloudflare Workers AI zu einem Titelvorschlag verarbeitet. Der Text wird dabei nicht gespeichert; für die Missbrauchs-Bremse gilt dasselbe wie beim Abgleich (gekürzter Prüfwert der IP-Adresse, höchstens eine Stunde). Rechtsgrundlage: Art. 6 Abs. 1 lit. b DSGVO.'),
    H('6. Grammatik- und Rechtschreibprüfung (freiwillig)'), P('Nur wenn du „Grammatik und Rechtschreibung prüfen“ auswählst: Der Fließtext des Dokuments wird an LanguageTool (LanguageTooler GmbH, Deutschland) gesendet und dort geprüft. Es gilt deren Datenschutzerklärung: ', A('https://languagetool.org/de/legal/privacy'), '. Die einfache Rechtschreibprüfung (rote Wellenlinien) macht dein Gerät selbst.'),
    H('7. Deine Rechte'), P('Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch (Art. 15–21 DSGVO). Schreib mir dafür einfach eine E-Mail. Außerdem kannst du dich bei einer Datenschutz-Aufsichtsbehörde beschweren, z. B. bei der Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (ldi.nrw.de).'),
    P(h('small', { class: 'mut' }, 'Stand: ' + STAND)),
  ]],
  credits: ['Credits & Lizenzen', () => [
    H('Papier „Kariert perfekte Kästchen“'), P('Vorlage von Tom Behrens (', A('https://codebytom.de', 'codebytom.de'), '), lizenziert unter Creative Commons Namensnennung – Nicht kommerziell (', A('https://creativecommons.org/licenses/by-nc/4.0/deed.de', 'CC BY-NC'), '). Danke, Tom!'),
    H('Notenschrift'), P('Die Vorlage beim Zeichnen von Noten nutzt Noto Music von Google, lizenziert unter der ', A('https://openfontlicense.org', 'SIL Open Font License 1.1'), '.'),
    H('Marken'), P('GoodNotes ist eine Marke der Goodnotes Limited. STools ist ein unabhängiges Projekt und steht in keiner Verbindung zu Goodnotes.'),
    H('STools'), P('Ein Projekt von Leif Schmale.'),
  ]],
};

export function openLegal(which) {
  const [title, build] = PAGES[which];
  sheet(title, (body) => { body.classList.add('legal'); body.append(...build()); });
}
export const legalLinks = () => h('p', { class: 'xs legal-links' }, ...['impressum', 'datenschutz', 'credits'].flatMap((k, i) => [i ? ' · ' : '', h('a', { href: '#', onclick: (e) => { e.preventDefault(); openLegal(k); } }, PAGES[k][0].replace(' & Lizenzen', ''))]));
