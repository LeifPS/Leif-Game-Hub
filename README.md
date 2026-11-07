# Leif Game Hub

Eine Plattform, auf der alle Spiele an einem Ort liegen, im Stil von Steam und der EA App: Bibliothek links, Empfehlung oben, Cover-Kacheln, eine Seite pro Spiel mit "Spielen"-Knopf und Update-Log. Die Spiele laufen komplett eigenständig auf ihren eigenen Adressen; der Hub öffnet sie nur per iframe (mit "Neuer Tab" als Ausweg).

## Neues Spiel hinzufügen

Einen Eintrag in `public/games.json` ergänzen:

```json
{
  "id": "meinspiel",
  "name": "Mein Spiel",
  "text": "Ein Satz, worum es geht.",
  "url": "https://meinspiel.leifps.workers.dev",
  "repo": "LeifPS/meinspiel",
  "farbe": "#5b8fc9",
  "kategorien": ["Action", "Online"]
}
```

Pflicht sind `id` (kurz, klein, ohne Leerzeichen), `name`, `text`, `url` und `farbe`. Optional:

| Feld | Wirkung |
| --- | --- |
| `url: null` | Spiel erscheint als "Bald" und ist nicht anklickbar |
| `repo` | GitHub-Repo (`Besitzer/name`); ohne Repo gibt es keine Version und keinen Update-Log |
| `privat: true` | Repo ist privat: Commit-Links werden im Hub nicht angezeigt (die Commit-Texte selbst sind trotzdem öffentlich sichtbar!) |
| `offiziell_ab` | Datum (`2026-12-01`): der erste Commit ab diesem Tag wird Version `1.0.0.0` (Offiziell statt Beta) |
| `phase: "alpha"` | Spiel gilt als Alpha (Kachel „Alpha 0.x“, roter Status auf der Spielseite); ohne Angabe Beta, ab `1.0.0.0` Offiziell |
| `kategorien` | Filter-Chips und Suche |
| `featured: true` | Spiel steht groß oben auf der Startseite |
| `beschreibung` | Längerer Text auf der Spielseite (sonst `text`) |
| `bild` | Titelbild für Kacheln (Hochformat 3:4, z. B. `screens/meinspiel.webp`); ohne Angabe zeichnet der Hub automatisch ein Platzhalterbild aus `farbe` |
| `banner` | Breites Bild (16:9) für Empfehlung und Kopfbild der Spielseite; ohne Angabe wird `bild` zugeschnitten |

## Versionen und Update-Log

Jedes Spiel hat eine Version **Major.Minor.Patch.Build**, jeder Commit des Spiel-Repos ist ein Eintrag im Update-Log.

| Stelle | Bedeutung |
| --- | --- |
| Major | riesige Hauptversionen, z. B. Beta zu Release (`1.0.0.0`) |
| Minor | neuer Inhalt oder neue Funktionen |
| Patch | Bugfixes, Balancing, kleine Verbesserungen |
| Build | interne Builds, schnelle Hotfixes |

Alle Spiele starten bei `0.1.0.0` (Beta). Mit `"offiziell_seit": "0.1.0.0"` in `games.json` gilt ein Spiel von Anfang an als offiziell, dann beginnt die Zählung bei `1.1.0.0` (nur mit `python3 tools/changelog.py --force --only <id>` neu berechnen). Angezeigt werden Versionen ohne Nullen am Ende (mindestens zwei Stellen): `0.1.0.0` als `0.1`, `1.2.4.0` als `1.2.4`, `0.1.0.1` bleibt `0.1.0.1`.

### Commit-Nachrichten in den Spiel-Repos

Am Anfang der Commit-Nachricht steht die Art:

```
Minor: Neue Insel mit drei Quests
Patch: Kollision an der Brücke repariert
Build: Tippfehler
Major: Release
1.2.0.0: Genau diese Versionsnummer setzen
```

Ohne Marker stuft das Skript nach Regeln ein (Schlüsselwörter wie "Fix", "neu", Länge der Nachricht, bei Sammel-Uploads die Zahl der geänderten Zeilen). Das ist eine Schätzung, kein Urteil über jeden einzelnen Commit.

### Wie es automatisch läuft

`.github/workflows/changelog.yml` startet stündlich (und von Hand im Actions-Tab) `tools/changelog.py`:

1. Pro Spiel eine winzige Abfrage (`git ls-remote`), ob es neue Commits gibt. Ohne Neues passiert nichts.
2. Nur bei Neuem wird der Commit-Verlauf geholt (ohne Dateien) und die neuen Commits eingestuft.
3. Ergebnisse landen als statische Dateien in `public/changelog/<id>.json` und `public/versions.json`. Besucher fragen nie GitHub ab, es gibt also kein Rate-Limit-Problem.
4. Die Einstufung jedes Commits wird in `data/levels/<id>.json` eingefroren. Eine Einstufung dort von Hand zu ändern (`minor`, `patch`, `build`, `major` oder `skip`) und danach die Action mit "Alles neu berechnen" zu starten, korrigiert die Versionen.

Für ein privates Spiel-Repo braucht die Action ein Secret `GAME_REPOS_TOKEN` (GitHub-Token mit Lesezugriff auf Inhalte dieses Repos).

Lokal: `python3 tools/changelog.py --freeze` (optional `--force`, `--only <id>`).

## Logo

`public/logo/` enthält das handgeschriebene "lgh" als Vektor in mehreren Farbvarianten und App-Icons. Aktuell ist die goldene App-Icon-Variante in Gebrauch (`favicon.svg`, `logo/apple-touch-icon.png`, `manifest.webmanifest`, Seitenleiste in `index.html`).

## Lokal ansehen

```
npx wrangler dev
```

oder den Ordner `public/` mit einem beliebigen statischen Server öffnen.

## Dateien

- `public/index.html`: Gerüst und Symbole
- `public/style.css`: Design
- `public/app.js`: Startseite, Spielseite, Update-Log, Spieleansicht
- `public/games.json`: die Spieleliste
- `public/kontakt.html`: Kontakt-Seite
- `public/changelog/`, `public/versions.json`: erzeugte Update-Logs
- `tools/changelog.py`, `data/`: Generator und eingefrorene Einstufungen
- `.github/workflows/changelog.yml`: stündliche Aktualisierung

## Deploy

Cloudflare Worker mit statischen Dateien (`wrangler.jsonc`), automatisch bei jedem Push auf `main`.

## Spielbilder

Jedes Spiel hat in `games.json` ein `icon` (1:1, 512 px, für Kacheln und Bibliothek) und ein `wallpaper` (ca. 5:1, 2000 px breit, mit eingebautem Spielnamen). Der Hub zeigt das Wallpaper auf der Startseite und der Detailseite in voller Breite, ohne Zuschnitt. Die Spielnamen stehen als unsichtbarer Text (`sr-only`) daneben, damit Suche, Screenreader und Seitentitel weiter funktionieren.

Die Wallpapers ohne Titel liegen in `grafik/wallpaper-ohne-titel/`, die Varianten mit Titel in `grafik/wallpaper-mit-titel/` (diese sind dieselben Dateien, die im Hub liegen). Fehlt `wallpaper`, zeigt der Hub die alte Ansicht mit Screenshot (`banner`) bzw. gezeichnetem Platzhalter.

Kein Icon ist KI-generiert. Die Icons von Tonlinge, Foil XI, Ball gegen Ball, Pizzafabrik, Business Empire, Spells, Zahlenwerk, Wasserschlacht, Tippspiel, Tierspiel und Cookie RNG 2 stammen aus den Favicons der Spiele selbst (Vektor bzw. Apple-Touch-Icon, auf 512 px gebracht, Rundungen entfernt). Die übrigen sieben sind aus dem echten Spielcode gerendert: das Spiel läuft lokal im Browser, die Zeichenfunktionen bzw. 3D-Modelle des Spiels werden aufgerufen und das Ergebnis mit einem Hintergrund zusammengesetzt. Schleimmerge (Schleime, Pilz, Schwert), Papierhelden (Held, Waffe, Splitter), ChessRNG (Figuren-Pfade), Erntezeit und Cookie RNG (Emoji des Spiels), Brutjagd (Ei und Tiere aus den three.js-Modellen), Fischerdock (Angler, Angel, Steg, Fisch, Boot und Palme aus den Spiel-Assets). Die früheren KI-Icons liegen in `grafik/icons-ki/`.

Der Spielname steht auf der Detailseite zusätzlich als Überschrift neben dem Icon, in derselben Schrift wie im Wallpaper. Die Schrift kommt aus dem Feld `schrift` in `games.json` (`familie`: fredoka, cinzel, lilita, anton, bangers, marker oder silkscreen; `versalien`; `abstand` in em). Die Schriftdateien liegen selbst gehostet in `public/fonts/`.

## Spielstand-Code

`tools/lgh-modul.js (plus lgh-vorlade.js, Einbau über tools/lgh-einbauen.py)` ist die Vorlage für das Einstellungsmenü mit dem Abschnitt "Spielstand-Code", das in Spielen mit lokalem Spielstand (localStorage) eingebaut wird. Im Hub läuft ein Spiel eingebettet, und Browser speichern dort getrennt vom direkten Spiel-Link. Mit dem Code kopiert man den Spielstand von einem Fenster ins andere. Der Code gehört immer in ein Einstellungsmenü: Hat ein Spiel schon eins, bekommt es dort eine Zeile, die `LGH.oeffnen()` aufruft; sonst erzeugt die Vorlage ein Zahnrad (oder das Spiel zeichnet sein eigenes und setzt `window.LGH_EIGENER_KNOPF = true`). Eigene Schalter (z. B. Ton) kommen über `window.LGH_ZEILEN`. Die Vorlage gehört pro Spiel angepasst (Variable `SPIEL`). Cloud-Spiele und Spiele, die Export/Import schon haben, bekommen sie nicht.

### Spielstand bleibt im Hub erhalten
Browser (vor allem die installierte App auf dem iPhone) behalten den Speicher eingebetteter Seiten nicht zuverlässig. Deshalb bewahrt der Hub den Stand selbst auf: Das Spiel meldet jede Änderung seines `localStorage` per `postMessage` (`{lgh:'stand', spiel, t, d}`) an den Hub (`app.js`, Speicher `lgh.stand.<id>`). Beim Start hängt der Hub den Stand als `#lgh=<Base64url(JSON)>` an die Spieladresse. Das Vorlade-Skript `tools/lgh-vorlade.js` muss ganz vorn im Spiel stehen, es schreibt den Stand in den Speicher und entfernt den Hash, bevor der Spielcode liest. Das Melden steckt in `tools/lgh-modul.js (plus lgh-vorlade.js, Einbau über tools/lgh-einbauen.py)`. Beides gehört in jedes Spiel mit lokalem Spielstand.

Größere Stände (über ca. 100.000 Zeichen Base64) gehen nicht durch die Adresse, sondern über `window.name` (`'lgh:'+JSON`): Der Hub setzt den Namen des Rahmens vor dem Laden, das Vorlade-Skript liest und löscht ihn und meldet `{lgh:'fertig'}`. Bis `fertig` kommt, übernimmt der Hub keine Stände aus diesem Rahmen; bleibt es aus, zeigt er nach 6 s einen Hinweis. Das gilt für alle Spiele außer jenen mit `"uebergabe": "msg"` in `games.json` (siehe unten). Nicht auf echten iPhones getestet.

## Screenshots hinzufügen
Screenshots eines Spiels kommen nach `public/screens/shots/<id>/N.webp` (1600 px breit, WebP) und werden in `games.json` beim Spiel im Feld `screenshots` (Liste, erste Datei ist das Hauptbild) eingetragen. Bei Screenshots vom iPad werden Statusleiste und Browser-Leiste oben abgeschnitten (ohne Tab-Leiste 105 px, mit Tab-Leiste 265 px bei 2388 px Breite) und unten 56 px (Ecken-Markierung).

## Konten, Freunde und mitgeschriebene Spielstände

Der Hub ist ohne Konto gesperrt (Name und Passwort, keine E-Mail). Konten, Freunde und Spielstand-Verlauf liegen in einer Cloudflare-D1-Datenbank `lgh`; der Server ist `src/worker.js` (Logik in `src/konten.js`, Tabellen in `src/schema.js`, Tests mit `npm test`). Er läuft im selben Worker wie die statischen Dateien, nur `/api/*` kommt an (`wrangler.jsonc`, `run_worker_first`). Die Oberfläche ist `public/konto.js` (Anmeldung, Konto-Dialog, Herzschlag, stilles Mitschreiben) und der Abschnitt "Freunde" in `public/app.js` (Route `#freunde`).

- **Passwort:** Der Browser rechnet aus Name und Passwort mit PBKDF2 (210000 Runden) einen Schlüssel und schickt nur diesen; der Server speichert davon einen gesalzenen SHA-256. Es gibt keine Wiederherstellung per E-Mail. Zurücksetzen macht der Betreiber: `node tools/lgh-passwort.mjs <Name> <neues Passwort>` gibt zwei SQL-Zeilen aus, die in der Datenbank `lgh` ausgeführt werden (meldet auch alle Geräte ab).
- **Freunde:** Anfrage per Name, Annehmen/Ablehnen/Entfernen. Der Hub meldet alle 45 s (nur bei sichtbarem Fenster), in welchem Spiel man ist; Freunde sehen "Spielt X" und können mit "Mitspielen" dasselbe Spiel öffnen. Als online gilt, wer in den letzten 100 s gemeldet hat.
- **Raumcode (optional pro Spiel):** Ein Spiel kann `parent.postMessage({lgh: 'status', spiel: '<id>', raum: 'ABC123'}, '*')` senden; der Code erscheint bei Freunden neben "Spielt X" (mit "Code kopieren"). Das direkte Beitreten in einen Raum muss das Spiel selbst anbieten, der Hub zeigt nur den Code an.
- **Spielstände:** Bleiben lokal im Hub (`lgh.stand.<id>`) und im Spiel. Zusätzlich lädt der Hub sie still hoch (jede Minute bei Änderung, beim Verlassen des Spiels, beim Wechsel in den Hintergrund und einmal pro Tag und Gerät für alle vorhandenen Stände). Aufbewahrung auf dem Server (`ausduennen` in `src/konten.js`): die neuesten 6 Versionen, dazu pro Tag die letzte Version der vergangenen 14 Tage, insgesamt höchstens 40 je Spiel und Konto; eine Version, die plötzlich auf unter 40 % schrumpft (ab 3000 Byte), verdrängt die vorherige nicht. Dadurch überlebt ein versehentlich leerer Stand mindestens zwei Wochen lang den Verlauf.
- **Zurückholen:** Konto-Menü → „Spielstände sichern und zurückholen“. Dort lassen sich pro Spiel die Server-Versionen mit Datum und Größe zurückholen (zweistufig mit Rückfrage; der bisherige Stand wird vorher lokal als `lgh.stand.<id>.vorher` gesichert, auf dem Server bleibt er als Version erhalten) und eine Sicherung als Datei speichern bzw. aus einer Datei einspielen. Läuft das Spiel gerade, wird es mit dem gewählten Stand neu gestartet; der alte Rahmen darf den Stand nicht mehr überschreiben (`_ignorieren`).
- **Profil:** Route `#profil` (eigenes) und `#profil/<name>` (nur für Freunde). Spielzeit und "Zuletzt gespielt" sind privat: Der Server liefert Zeiten und Daten nur für das eigene Profil. Freunde sehen, welche Spiele jemand schon gespielt hat (nur die Namen, alphabetisch), dazu Online-Status, aktuelles Spiel, Freundeszahl und Konto-Alter. Das eigene Profil zeigt Spielzeit pro Spiel (Tabelle `playtime`, gezählt aus dem Herzschlag, Zählung beginnt mit dem Einbau), Online-Status, Konto-Alter und beim eigenen Profil die gesicherten Stände (`GET /api/profil[/<name>]`).
- **Profilbild:** Wahl eines Symbols aus 4.180 (game-icons.net, CC BY 3.0, Quellenseite `credits.html`; `public/icons/<urheber>/<name>.svg`, Liste in `icons/index.json`, gebaut mit `python3 tools/icons-bauen.py <archiv>/icons`) mit eigener Symbolfarbe, Hintergrundfarbe, Zoom und Drehung. Gespeichert in `users.avatar` (JSON `{i, f, b, z, r}`, vom Server streng geprüft, das Symbol muss existieren), ausgeliefert als `av` in `/api/ich`, Anmeldung, Freundesliste und Profil; `POST /api/avatar` ändert es (`av: null` = zurück zum Buchstaben). Gezeichnet per CSS-Maske (`.av-bild`), Auswahl über Konto → Profilbild ändern oder im eigenen Profil; Suche auch mit deutschen Stichwörtern (Liste `DE` in konto.js).
- **Wartung:** Spiele mit `"wartung": true` behalten ihre Detailseite (Kachel und Seitenleiste führen dorthin), der Spielen-Knopf zeigt "Wartung" und ist gesperrt; `#spiel/<id>/play` leitet auf die Detailseite um.
- **Detailseite (Platz):** Reicht die Breite nicht für Titel, Zuletzt gespielt, Spielzeit und Spielen-Knopf in einer Zeile, fällt zuerst die Spielzeit weg (`aktionPassen()` in app.js, Klasse `ohne-zeit`); reicht es dann noch nicht, rutscht der Knopf in die zweite Zeile. Unter 900 px gilt das Handy-Layout.
- **Detailseite:** Neben dem Spielen-Knopf stehen "Zuletzt gespielt" (nur das Datum: Heute, Gestern, 5. Sep, 2. Juli 2024) und "Spielzeit" (jeweils mit Symbol; unter einer Stunde in Minuten, sonst Stunden mit einer Nachkommastelle, z. B. "5,7 Stunden"), sobald man (angemeldet) das Spiel schon gespielt hat. Die Werte kommen aus dem eigenen Profil (`/api/profil`, Tabelle `playtime`), werden höchstens alle 15 Sekunden neu geladen und fehlen ohne Konto oder ohne bisherige Spielzeit. Der Trailer startet beim erneuten Öffnen der Detailseite von vorne.
- **Ein Gerät pro Konto:** Solange `EIN_GERAET = true` in `src/konten.js` gilt, bindet sich ein Konto an das Gerät (Kennung `lgh.geraet` im localStorage, Header `x-geraet`), auf dem es erstellt bzw. zuerst benutzt wurde; Anmelden auf einem anderen Gerät wird mit `anderes_geraet` (403) abgelehnt, weil die Stände noch nicht zwischen Geräten abgeglichen werden. Freigeben (z. B. bei neuem Handy): `node tools/lgh-geraet.mjs <Name>` gibt das SQL aus, das in der Datenbank `lgh` ausgeführt wird. Achtung: Browser-Tab und installierte Home-Bildschirm-App haben auf dem iPhone getrennten Speicher, sie zählen als zwei Geräte.
- **Benutzername ändern:** Konto-Menü → „Benutzernamen ändern“ (`POST /api/benutzername`, braucht das Passwort, weil der Anmeldeschlüssel vom Namen abhängt). Höchstens einmal pro 7 Tage (`NAME_SPERRE`, Spalte `users.name_changed`), nur auf einen freien Namen; Freunde, Stände und Anmeldungen bleiben am Konto. Der alte Name wird sofort frei. Der Anzeigename ist davon unabhängig.
- **Hinweis Gerätewechsel:** Der lokale Stand gehört dem Gerät, nicht dem Konto. Wenn zwei Konten dasselbe Gerät benutzen, landet der Gerätestand bei dem Konto, das gerade angemeldet ist. Das muss beim späteren Einbau des Abgleichs bedacht werden.

## Bilder ersetzen (Icons, Titelbilder, Wallpaper)

Die Bilder in `public/screens/` (außer `shots/`) werden vom Browser bei jedem Aufruf beim Server nachgefragt und nur neu geladen, wenn sie sich geändert haben (`public/_headers`). Zusätzlich hängt `app.js` die Nummer `BILD_V` an die Bildadressen. Wer ein Bild ersetzt und sicher gehen will, dass wirklich alle es sofort sehen, zählt `BILD_V` in `public/app.js` (und `?v=` bei Favicon und Apple-Touch-Icon in `public/index.html`) hoch.

## Spiel vorübergehend sperren (Wartung)

In `public/games.json` beim Spiel `"wartung": true` eintragen. Das Spiel bleibt in der Liste, ist aber mit dem Hinweis „Wartung“ nicht spielbar (auch nicht über einen direkten Link). Zum Freigeben das Feld wieder entfernen.

### Große Spielstände (Übergabe per postMessage)

Stände bis ca. 100.000 Zeichen (Base64) gehen weiter über `#lgh=<Base64url>` an die Spieladresse. Größere (z. B. Tierspiel mit tausenden Tieren) gehen nicht mehr durch die Adresse, sondern per `postMessage`: Der Hub setzt `#lgh=msg`, das Spiel fragt mit `{lgh:'hallo'}` nach, bekommt `{lgh:'daten', json}` und meldet `{lgh:'fertig'}` (Vorlade-Skript `tools/lgh-vorlade.js`, der Spielcode startet erst nach `window.__lghBereit`, siehe Tierspiel `index.html`). Bis `fertig` kommt, nimmt der Hub keine Stände von diesem Rahmen an. Schrumpft ein Stand plötzlich stark, bleibt der alte als `lgh.stand.<id>.sicher` erhalten.
