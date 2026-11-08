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
| `erschienen` | Datum (`2026-05-07`) für „Erschienen“ auf der Spielseite, wenn es kein `repo` gibt (mit Repo kommt das Datum vom ersten Commit) |
| `version`, `aktualisiert` | Für Spiele ohne `repo`: Version (`"0.1"`) und Datum der letzten Aktualisierung (`2026-11-08`) von Hand; erscheinen auf Kachel und Spielseite wie sonst die Version aus dem Update-Log (der bleibt ohne Repo leer). Mit Repo gelten die Werte aus den Commits |
| `phase: "alpha"` | Spiel gilt als Alpha (Kachel „Alpha 0.x“, roter Status auf der Spielseite); ohne Angabe Beta, ab `1.0.0.0` Offiziell |
| `kategorien` | Filter-Chips und Suche |
| `wiki` | Adresse des Wikis zum Spiel (z. B. `https://tonlinge.leifps.workers.dev/wiki/`): erscheint als Eintrag „Wikis“ in der Seitenleiste (unter Freunde, nur wenn mindestens ein Spiel eines hat), als Karte auf der Seite `#wikis` und als Zeile „Wiki“ auf der Spielseite. Das Wiki öffnet sich unverändert in einem neuen Tab; es gibt bewusst kein gemeinsames Wiki und kein Bearbeiten im Hub |
| `featured: true` | Spiel steht groß oben auf der Startseite |
| `beschreibung` | Längerer Text auf der Spielseite (sonst `text`) |
| `bild` | Titelbild für Kacheln (Hochformat 3:4, z. B. `screens/meinspiel.webp`); ohne Angabe zeichnet der Hub automatisch ein Platzhalterbild aus `farbe` |
| `banner` | Breites Bild (16:9) für Empfehlung und Kopfbild der Spielseite; ohne Angabe wird `bild` zugeschnitten |

## Versionen und Update-Log

Jedes Spiel hat eine Version **Major.Großes Update.Kleines Update.Patch** (z. B. `1.2.4.1`), jeder Commit des Spiel-Repos ist ein Eintrag im Update-Log.

| Stelle | Bedeutung |
| --- | --- |
| Major | riesige Hauptversionen, z. B. Beta zu Release (`1.0.0.0`) |
| Großes Update | wirklich Neues für den Spieler: neuer Modus, neue Box/Pack/Event/Gebiet/Welt/Boss/Waffen, größere neue Mechanik |
| Kleines Update | sichtbare, aber kleine Verbesserungen: Balancing, kleine Ergänzungen, Spielstand/Konto/Einstellungen, mehrere Fehler zugleich |
| Patch | Kleinkram, Feinschliff, schnelle Hotfixes |

Intern (in `data/levels/*.json`, `public/changelog/*.json`) heißen die Stufen weiter `major` / `minor` / `patch` / `build`; „Großes Update“ ist `minor`, „Kleines Update“ ist `patch`, „Patch“ ist `build`. Maßstab ist immer, **wie viel für den Spieler neu ist**, nicht Code, Aufwand oder Länge der Nachricht: alles, was der Spieler kaum merkt (Technik, Tests, Admin, sofortiges Aktualisieren, reine Optik, einzelne Fehlerbehebungen), ist ein Patch. Die Regeln stehen im Kopf von `tools/changelog.py`. Im November 2026 wurde die gesamte Historie danach neu eingestuft (`--freeze --force --reklassify`); die alten Marker `Minor:`/`Build:` zählen seitdem nicht mehr als Vorgabe.

Alle Spiele starten bei `0.1.0.0` (Beta). Mit `"offiziell_seit": "0.1.0.0"` in `games.json` gilt ein Spiel von Anfang an als offiziell, dann beginnt die Zählung bei `1.1.0.0` (nur mit `python3 tools/changelog.py --force --only <id>` neu berechnen). Angezeigt werden Versionen ohne Nullen am Ende (mindestens zwei Stellen): `0.1.0.0` als `0.1`, `1.2.4.0` als `1.2.4`, `0.1.0.1` bleibt `0.1.0.1`.

### Commit-Nachrichten in den Spiel-Repos

Am Anfang der Commit-Nachricht steht die Art:

```
Großes Update: Neue Insel mit drei Quests
Kleines Update: Kollision an der Brücke repariert
Patch: Tippfehler
Major: Release
1.2.0.0: Genau diese Versionsnummer setzen
```

Die alten Schreibweisen `Minor:` und `Build:` werden weiter erkannt; `Patch:` meint ab jetzt die unterste Stufe (früher `Build:`). Ohne Marker stuft das Skript nach Regeln ein (Schlüsselwörter wie "Fix", "neu", Länge der Nachricht, bei Sammel-Uploads die Zahl der geänderten Zeilen). Das ist eine Schätzung, kein Urteil über jeden einzelnen Commit.

### Wie es automatisch läuft

`.github/workflows/changelog.yml` startet stündlich (und von Hand im Actions-Tab) `tools/changelog.py`:

1. Pro Spiel eine winzige Abfrage (`git ls-remote`), ob es neue Commits gibt. Ohne Neues passiert nichts.
2. Nur bei Neuem wird der Commit-Verlauf geholt (ohne Dateien) und die neuen Commits eingestuft.
3. Ergebnisse landen als statische Dateien in `public/changelog/<id>.json` und `public/versions.json`. Besucher fragen nie GitHub ab, es gibt also kein Rate-Limit-Problem.
4. Die Einstufung jedes Commits wird in `data/levels/<id>.json` eingefroren. Eine Einstufung dort von Hand zu ändern (`major`, `minor` = Großes Update, `patch` = Kleines Update, `build` = Patch oder `skip`) und danach die Action mit "Alles neu berechnen" zu starten, korrigiert die Versionen.

Für ein privates Spiel-Repo braucht die Action ein Secret `GAME_REPOS_TOKEN` (GitHub-Token mit Lesezugriff auf Inhalte dieses Repos).

Lokal: `python3 tools/changelog.py --freeze` (optional `--force`, `--only <id>`). Nach einer Regeländerung die Historie einmalig mit `--freeze --force --reklassify` neu einstufen.

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

Kein Icon ist KI-generiert. Die Icons von Tonlinge, Foil XI, Ball gegen Ball, Pizzafabrik, Business Empire, Spells, Zahlenwerk, Wasserschlacht, Tippspiel, Tierspiel und Cookie RNG 2 stammen aus den Favicons der Spiele selbst (Vektor bzw. Apple-Touch-Icon, auf 512 px gebracht, Rundungen entfernt). Die übrigen sieben sind aus dem echten Spielcode gerendert: das Spiel läuft lokal im Browser, die Zeichenfunktionen bzw. 3D-Modelle des Spiels werden aufgerufen und das Ergebnis mit einem Hintergrund zusammengesetzt. Schleimmerge (Schleime, Pilz, Schwert), Papierhelden (Held, Waffe, Splitter), ChessRNG (Figuren-Pfade), Erntezeit und Cookie RNG (Emoji des Spiels), Brutjagd (Ei und Tiere aus den three.js-Modellen), Fischerdock (Angler, Angel, Steg, Fisch, Boot und Palme aus den Spiel-Assets). Die früheren KI-Icons liegen in `grafik/icons-ki/`. Nebelmeer und Nebelmeer: Tiefe haben selbst gezeichnete Vektor-Icons (Quellen `grafik/icons-quellen/nebelmeer-icon.svg` und `nebelmeertiefe-icon.svg`, als 512-px-WebP gerendert), weil kein Spielcode zum Rendern vorliegt. Die Screenshots von Nebelmeer stammen aus dem Prototyp, die von Nebelmeer: Tiefe aus dem laufenden Spiel.

Der Spielname steht auf der Detailseite zusätzlich als Überschrift neben dem Icon, in derselben Schrift wie im Wallpaper. Die Schrift kommt aus dem Feld `schrift` in `games.json` (`familie`: fredoka, cinzel, lilita, anton, bangers, marker oder silkscreen; `versalien`; `abstand` in em). Die Schriftdateien liegen selbst gehostet in `public/fonts/`.

## Spielstand-Code

`tools/lgh-modul.js (plus lgh-vorlade.js, Einbau über tools/lgh-einbauen.py)` ist die Vorlage für das Einstellungsmenü mit dem Abschnitt "Spielstand-Code", das in Spielen mit lokalem Spielstand (localStorage) eingebaut wird. Im Hub läuft ein Spiel eingebettet, und Browser speichern dort getrennt vom direkten Spiel-Link. Mit dem Code kopiert man den Spielstand von einem Fenster ins andere. Der Code gehört immer in ein Einstellungsmenü: Hat ein Spiel schon eins, bekommt es dort eine Zeile, die `LGH.oeffnen()` aufruft; sonst erzeugt die Vorlage ein Zahnrad (oder das Spiel zeichnet sein eigenes und setzt `window.LGH_EIGENER_KNOPF = true`). Eigene Schalter (z. B. Ton) kommen über `window.LGH_ZEILEN`. Die Vorlage gehört pro Spiel angepasst (Variable `SPIEL`). Cloud-Spiele und Spiele, die Export/Import schon haben, bekommen sie nicht.

### Spielstand bleibt im Hub erhalten
Browser (vor allem die installierte App auf dem iPhone) behalten den Speicher eingebetteter Seiten nicht zuverlässig. Deshalb bewahrt der Hub den Stand selbst auf: Das Spiel meldet jede Änderung seines `localStorage` per `postMessage` (`{lgh:'stand', spiel, t, d}`) an den Hub (`app.js`, Speicher `lgh.stand.<id>`). Beim Start hängt der Hub den Stand als `#lgh=<Base64url(JSON)>` an die Spieladresse. Das Vorlade-Skript `tools/lgh-vorlade.js` muss ganz vorn im Spiel stehen, es schreibt den Stand in den Speicher und entfernt den Hash, bevor der Spielcode liest. Das Melden steckt in `tools/lgh-modul.js (plus lgh-vorlade.js, Einbau über tools/lgh-einbauen.py)`. Beides gehört in jedes Spiel mit lokalem Spielstand.

Größere Stände (über ca. 100.000 Zeichen Base64) gehen nicht durch die Adresse, sondern über `window.name` (`'lgh:'+JSON`): Der Hub setzt den Namen des Rahmens vor dem Laden, das Vorlade-Skript liest und löscht ihn und meldet `{lgh:'fertig'}`. Bis `fertig` kommt, übernimmt der Hub keine Stände aus diesem Rahmen; bleibt es aus, zeigt er nach 6 s einen Hinweis. Das gilt für alle Spiele außer jenen mit `"uebergabe": "msg"` in `games.json` (siehe unten). Nicht auf echten iPhones getestet.

## Screenshots hinzufügen
Screenshots eines Spiels kommen nach `public/screens/shots/<id>/N.webp` (1600 px breit, WebP) und werden in `games.json` beim Spiel im Feld `screenshots` (Liste, erste Datei ist das Hauptbild) eingetragen. Bei Screenshots vom iPad werden Statusleiste und Browser-Leiste oben abgeschnitten (ohne Tab-Leiste 105 px, mit Tab-Leiste 265 px bei 2388 px Breite) und unten 56 px (Ecken-Markierung).

## Neu im Hub (Startseite)

Unter „Weiterspielen“ steht „Neu im Hub“: bis zu drei **neue Spiele** (erste Version oder `release` höchstens 14 Tage her) und **frische Updates** (letztes Update höchstens 7 Tage her), zusammen höchstens sechs, neueste zuerst. Bei Updates steht die wichtigste Änderung der letzten Tage aus dem Update-Log (höchste Stufe, bei Gleichstand die neueste). Es kommt alles aus `games.json`, `versions.json` und `changelog/*.json`, es gibt nichts zu pflegen. Wer gerade was spielt, zeigt weiter die Freunde-Leiste darüber.

## Einladen („Komm mit spielen“)

Im Chat (oben rechts) und in der Freundesliste gibt es **Einladen**: man wählt ein Spiel (Favoriten und zuletzt Gespieltes stehen oben), und der Freund bekommt im Chat eine Karte mit dem Spiel und dem Knopf **Spielen**. Technisch ist das eine normale Chat-Nachricht mit dem Text `[einladung:spiel-id]` oder `[einladung:spiel-id:RAUMCODE]`; der Hub zeigt sie als Karte (Vorschauen und die Karte im Spiel zeigen „Einladung zu <Spiel>“). Hat das Spiel in der letzten Stunde einen Raumcode gemeldet (`{lgh:'status', raum}`), geht er mit; beim Klick auf Spielen wird er in die Zwischenablage kopiert. Unbekannte Spiel-IDs bleiben einfacher Text. Der Server braucht dafür nichts Eigenes.

## Suche und Sortierung (Startseite)

**Suche:** ohne Groß-/Kleinschreibung, Umlaute, Akzente und Satzzeichen („erntezeit“ findet „Ernte-Zeit“); alle eingegebenen Wörter müssen in Name, Kurztext, Beschreibung oder Tags vorkommen. Treffer sortiert die Qualität: Name beginnt mit dem Suchwort, Name enthält es, Tag, sonst Text.

**Sortierung** (Auswahl neben den Kategorien, wird auf dem Gerät gemerkt): Empfohlen (Reihenfolge in `games.json`, Favoriten zuerst), A–Z (Favoriten zuerst), Zuletzt gespielt, Meine Spielzeit, Beste Bewertung (`GET /api/bewertungen`: Durchschnitt und Anzahl aller Spiele), Zuletzt aktualisiert, Neueste Spiele. Nur bei Empfohlen und A–Z stehen Favoriten oben; Spiele ohne „Spielen“ (Bald, Wartung) stehen sonst immer hinten. Zuletzt gespielt, Spielzeit und Bewertung brauchen das Konto.

## Chat-Gruppen

Auf der Freunde-Seite gibt es den Abschnitt **Gruppen** mit **Neue Gruppe** (Name und Freunde auswählen). Der Gruppenchat (`#gruppe/<id>`) funktioniert wie der Freunde-Chat (neue Nachrichten alle paar Sekunden, eigene löschen, Einladungskarten), zeigt aber den Absender über den Nachrichten; ungelesene Gruppennachrichten zählen im Abzeichen am Freunde-Knopf mit, und im Spiel erscheint dieselbe kleine Karte mit „Antworten“ („Name: Text“). Tippen auf den Gruppennamen öffnet die Gruppeninfo.

Regeln (Server: `src/gruppen.js`, Tabellen `chat_groups`, `chat_group_members`, `chat_group_messages`):
- Wer die Gruppe anlegt, ist **Besitzer**: nur er fügt Mitglieder hinzu (nur eigene bestätigte Freunde), entfernt sie, benennt um oder löscht die Gruppe.
- Jedes Mitglied kann jederzeit **austreten**. Verlässt der Besitzer die Gruppe, wird das am längsten dabeigebliebene Mitglied Besitzer; ist niemand mehr drin, verschwindet die Gruppe mit allen Nachrichten.
- Endet die Freundschaft zwischen Besitzer und Mitglied, ist das Mitglied draußen. Beim Löschen eines Kontos tritt es aus allen Gruppen aus, seine Nachrichten verschwinden.
- Grenzen: 12 Mitglieder pro Gruppe, 20 Gruppen pro Konto, 10 neue Gruppen pro Stunde, 500 Nachrichten pro Gruppe, 500 Zeichen pro Nachricht, gemeinsames Tempolimit mit dem Freunde-Chat (30 Nachrichten pro Minute). Wer neu in eine Gruppe kommt, sieht alte Nachrichten, sie zählen aber nicht als ungelesen.
- API: `GET/POST /api/gruppen`, `GET /api/gruppen/<id>`, `POST …/<id>/mitglied|entfernen|umbenennen|verlassen|loeschen`, `GET/POST …/<id>/chat` (und `…/chat/loeschen`). Im Client steht `#g<id>` an der Stelle des Freundesnamens (`LghKonto.chat.lesen('#g12')`).

## Konten, Freunde und mitgeschriebene Spielstände

Der Hub ist ohne Konto gesperrt (Name und Passwort, keine E-Mail). Konten, Freunde und Spielstand-Verlauf liegen in einer Cloudflare-D1-Datenbank `lgh`; der Server ist `src/worker.js` (Logik in `src/konten.js`, Tabellen in `src/schema.js`, Tests mit `npm test`). Er läuft im selben Worker wie die statischen Dateien, nur `/api/*` kommt an (`wrangler.jsonc`, `run_worker_first`). Die Oberfläche ist `public/konto.js` (Anmeldung, Konto-Dialog, Herzschlag, stilles Mitschreiben) und der Abschnitt "Freunde" in `public/app.js` (Route `#freunde`).

- **Passwort:** Der Browser rechnet aus Name und Passwort mit PBKDF2 (210000 Runden) einen Schlüssel und schickt nur diesen; der Server speichert davon einen gesalzenen SHA-256. Es gibt keine Wiederherstellung per E-Mail. Zurücksetzen macht der Betreiber: `node tools/lgh-passwort.mjs <Name> <neues Passwort>` gibt zwei SQL-Zeilen aus, die in der Datenbank `lgh` ausgeführt werden (meldet auch alle Geräte ab).
- **Freunde:** Anfrage per Name, Annehmen/Ablehnen/Entfernen. Der Hub meldet alle 45 s (nur bei sichtbarem Fenster), in welchem Spiel man ist; Freunde sehen "Spielt X" und können mit "Mitspielen" dasselbe Spiel öffnen. Als online gilt, wer in den letzten 100 s gemeldet hat.
- **Raumcode (optional pro Spiel):** Ein Spiel kann `parent.postMessage({lgh: 'status', spiel: '<id>', raum: 'ABC123'}, '*')` senden; der Code erscheint bei Freunden neben "Spielt X" (mit "Code kopieren"). Das direkte Beitreten in einen Raum muss das Spiel selbst anbieten, der Hub zeigt nur den Code an.
- **Spielstände:** Bleiben lokal im Hub (`lgh.stand.<id>`) und im Spiel. Zusätzlich lädt der Hub sie still hoch (jede Minute bei Änderung, beim Verlassen des Spiels, beim Wechsel in den Hintergrund und einmal pro Tag und Gerät für alle vorhandenen Stände). Aufbewahrung auf dem Server (`ausduennen` in `src/konten.js`): die neuesten 6 Versionen, dazu pro Tag die letzte Version der vergangenen 14 Tage, insgesamt höchstens 40 je Spiel und Konto; eine Version, die plötzlich auf unter 40 % schrumpft (ab 3000 Byte), verdrängt die vorherige nicht. Dadurch überlebt ein versehentlich leerer Stand mindestens zwei Wochen lang den Verlauf.
- **Zurückholen:** Konto-Menü → „Spielstände sichern und zurückholen“. Dort lassen sich pro Spiel die Server-Versionen mit Datum und Größe zurückholen (zweistufig mit Rückfrage; der bisherige Stand wird vorher lokal als `lgh.stand.<id>.vorher` gesichert, auf dem Server bleibt er als Version erhalten) und eine Sicherung als Datei speichern bzw. aus einer Datei einspielen. Läuft das Spiel gerade, wird es mit dem gewählten Stand neu gestartet; der alte Rahmen darf den Stand nicht mehr überschreiben (`_ignorieren`).
- **Sichtbarkeit:** Konto → Sichtbarkeit. Online-Status (inkl. „zuletzt online“) und gespielte Spiele (inkl. aktuelles Spiel und Raumcode) sind je auf „Niemand“ (0), „Freunde“ (1, Standard) oder „Alle“ (2) stellbar (`users.vis_online`, `users.vis_spiele`, `POST /api/sichtbarkeit`). Der Server liefert Verborgenes gar nicht erst aus (Freundesliste und Profil), das eigene Profil bleibt vollständig. Ohne Freundschaft sieht man ein Profil nur bei Entwicklern oder wenn die Person mindestens eines von beidem auf „Alle“ gestellt hat – und dann nur genau diesen Teil (ohne Spielzeit, Raumcode, Freundeszahl); sonst 404. Zeit und Datum des letzten Spielens sieht immer nur man selbst.
- **Chat und Nachrichten im Spiel:** Nachrichten gehen nur unter bestätigten Freunden (`/api/chat/<name>`, höchstens 500 Zeichen, die letzten 500 pro Paar bleiben). Solange ein Spiel läuft, fragt der Hub alle 8 Sekunden `GET /api/ungelesen` ab (je Freund Zahl und neueste ungelesene Nachricht). Kommt nach dem Spielstart eine neue, erscheint oben rechts über dem Spiel (in der Bühne, daher auch im Vollbild) eine kleine Karte mit „Antworten“ direkt im Spiel, „✕“ und Auto-Ausblenden nach 10 s (ungelesen bleibt sie trotzdem). Antworten markiert den Chat als gelesen. Was schon vor dem Spielstart ungelesen war, löst keine Karte aus (nur die Zahl am Freunde-Knopf).
- **Vollbild:** In der Spieleansicht gibt es überall einen Vollbild-Knopf. Wo der Browser die Fullscreen-API erlaubt (Desktop, Android, iPad), ist es echtes Vollbild. Das iPhone kennt sie nur für Videos; dort blendet der Knopf stattdessen die Leiste aus (`body.pseudo-voll`), das Spiel füllt die ganze Seite, und ein kleiner Knopf oben links holt die Leiste zurück. Die Adressleiste von Safari bleibt dabei (nur als „Zum Home-Bildschirm“-App verschwindet sie).
- **Weiterspielen:** Auf der Startseite (ohne Suche, Kategorie „Alle“) zeigt eine Reihe die letzten 4 gespielten Spiele (Klick startet direkt). Quelle: Zeitpunkt des letzten Spielens aus dem Konto (`playtime.last` über `/api/profil`, geräteübergreifend) plus ein lokaler Merker pro Konto auf dem Gerät (`lgh.zuletzt.<name>`), der beim Start sofort zählt; es gilt der jeweils neuere Zeitpunkt. Ohne bisher gespieltes Spiel erscheint die Reihe nicht.
- **Favoriten:** Ein Stern auf der Kachel (Desktop beim Darüberfahren neben dem Spielen-Knopf, auf dem Handy immer sichtbar) und der Knopf „Favorit“ oben rechts im Titelbild der Detailseite markieren ein Spiel. Favoriten stehen oben in der Bibliothek (mit gelbem Stern, alphabetisch) und am Anfang der Spieleliste auf der Startseite. Gespeichert pro Konto auf dem Server (Tabelle `favorites`, `GET`/`POST /api/favoriten`, höchstens 60), zusätzlich pro Konto auf dem Gerät zwischengespeichert (`lgh.fav.<name>`), damit sie sofort da sind. Die Empfehlung ganz oben (Hero) bleibt davon unberührt.
- **Bewertungen:** Jedes angemeldete Konto kann einem Spiel 1 bis 5 Sterne geben (nur Sterne, keine Texte), aber erst ab **15 Minuten Spielzeit** in diesem Spiel (Spielzeit aus dem Konto, vom Server geprüft: sonst 403 `zu_wenig_spielzeit`; Zurücknehmen geht immer). Der Durchschnitt steht als Zeile „Bewertung: 4,5 ★ (3)“ in den Fakten der Detailseite; die eigene Wahl wird in einem Kasten über „Neuigkeiten und Updates“ abgegeben (dieselbe Zahl nochmal antippen nimmt sie zurück, vor 15 Minuten sind die Sterne gesperrt mit Hinweis, wie viel noch fehlt). Gespeichert in der Tabelle `ratings` (`GET`/`POST /api/bewertung/<spiel>`, `sterne` 0 bis 5, 0 = zurücknehmen). Der Server nimmt nur Spiele an, die in `games.json` stehen; wer was vergeben hat, sieht niemand außer einem selbst. Spiele ohne Spielen-Knopf (noch nicht freigegeben) zeigen keine Bewertung.
- **Profil:** Route `#profil` (eigenes) und `#profil/<name>` (nur für Freunde). Spielzeit und "Zuletzt gespielt" sind privat: Der Server liefert Zeiten und Daten nur für das eigene Profil. Freunde sehen, welche Spiele jemand schon gespielt hat (nur die Namen, alphabetisch), dazu Online-Status, aktuelles Spiel, Freundeszahl und Konto-Alter. Das eigene Profil zeigt Spielzeit pro Spiel (Tabelle `playtime`, gezählt aus dem Herzschlag, Zählung beginnt mit dem Einbau), Online-Status, Konto-Alter und beim eigenen Profil die gesicherten Stände (`GET /api/profil[/<name>]`).
- **Profilbild:** Wahl eines Symbols aus 4.180 (game-icons.net, CC BY 3.0, Quellenseite `credits.html`; `public/icons/<urheber>/<name>.svg`, Liste in `icons/index.json`, gebaut mit `python3 tools/icons-bauen.py <archiv>/icons`) mit eigener Symbolfarbe, Hintergrundfarbe, Zoom und Drehung. Gespeichert in `users.avatar` (JSON `{i, f, b, z, r}`, vom Server streng geprüft, das Symbol muss existieren), ausgeliefert als `av` in `/api/ich`, Anmeldung, Freundesliste und Profil; `POST /api/avatar` ändert es (`av: null` = zurück zum Buchstaben). Gezeichnet per CSS-Maske (`.av-bild`), Auswahl über Konto → Profilbild ändern oder im eigenen Profil; Suche auch mit deutschen Stichwörtern (Liste `DE` in konto.js).
- **Wartung:** Spiele mit `"wartung": true` behalten ihre Detailseite (Kachel und Seitenleiste führen dorthin), der Spielen-Knopf zeigt "Wartung" und ist gesperrt; `#spiel/<id>/play` leitet auf die Detailseite um.
- **Detailseite (Platz):** Reicht die Breite nicht für Titel, Zuletzt gespielt, Spielzeit und Spielen-Knopf in einer Zeile, fällt zuerst die Spielzeit weg (`aktionPassen()` in app.js, Klasse `ohne-zeit`); reicht es dann noch nicht, rutscht der Knopf in die zweite Zeile. Unter 900 px gilt das Handy-Layout.
- **Detailseite:** Neben dem Spielen-Knopf stehen "Zuletzt gespielt" (nur das Datum: Heute, Gestern, 5. Sep, 2. Juli 2024) und "Spielzeit" (jeweils mit Symbol; unter einer Stunde in Minuten, sonst Stunden mit einer Nachkommastelle, z. B. "5,7 Stunden"), sobald man (angemeldet) das Spiel schon gespielt hat. Die Werte kommen aus dem eigenen Profil (`/api/profil`, Tabelle `playtime`), werden höchstens alle 15 Sekunden neu geladen und fehlen ohne Konto oder ohne bisherige Spielzeit. Der Trailer startet beim erneuten Öffnen der Detailseite von vorne.
- **Ein Gerät pro Konto (derzeit AUS, `EIN_GERAET = false`):** Man kann sich auf mehreren Geräten anmelden; Stände werden mitgeschrieben und im Konto-Menü unter „Spielstände“ per Hand zurückgeholt (es gibt keinen automatischen Abgleich zwischen Geräten). Die folgende Beschreibung gilt nur, wenn die Sperre wieder auf `true` steht: Solange `EIN_GERAET = true` in `src/konten.js` gilt, bindet sich ein Konto an das Gerät (Kennung `lgh.geraet` im localStorage, Header `x-geraet`), auf dem es erstellt bzw. zuerst benutzt wurde; Anmelden auf einem anderen Gerät wird mit `anderes_geraet` (403) abgelehnt, weil die Stände noch nicht zwischen Geräten abgeglichen werden. Freigeben (z. B. bei neuem Handy): `node tools/lgh-geraet.mjs <Name>` gibt das SQL aus, das in der Datenbank `lgh` ausgeführt wird. Achtung: Browser-Tab und installierte Home-Bildschirm-App haben auf dem iPhone getrennten Speicher, sie zählen als zwei Geräte.
- **Benutzername ändern:** Konto-Menü → „Benutzernamen ändern“ (`POST /api/benutzername`, braucht das Passwort, weil der Anmeldeschlüssel vom Namen abhängt). Höchstens einmal pro 7 Tage (`NAME_SPERRE`, Spalte `users.name_changed`), nur auf einen freien Namen; Freunde, Stände und Anmeldungen bleiben am Konto. Der alte Name wird sofort frei. Der Anzeigename ist davon unabhängig.
- **Hinweis Gerätewechsel:** Der lokale Stand gehört dem Gerät, nicht dem Konto. Wenn zwei Konten dasselbe Gerät benutzen, landet der Gerätestand bei dem Konto, das gerade angemeldet ist. Das muss beim späteren Einbau des Abgleichs bedacht werden.

## Bilder ersetzen (Icons, Titelbilder, Wallpaper)

Die Bilder in `public/screens/` (außer `shots/`) werden vom Browser bei jedem Aufruf beim Server nachgefragt und nur neu geladen, wenn sie sich geändert haben (`public/_headers`). Zusätzlich hängt `app.js` die Nummer `BILD_V` an die Bildadressen. Wer ein Bild ersetzt und sicher gehen will, dass wirklich alle es sofort sehen, zählt `BILD_V` in `public/app.js` (und `?v=` bei Favicon und Apple-Touch-Icon in `public/index.html`) hoch.

## Spiel vorübergehend sperren (Wartung)

In `public/games.json` beim Spiel `"wartung": true` eintragen. Das Spiel bleibt in der Liste, ist aber mit dem Hinweis „Wartung“ nicht spielbar (auch nicht über einen direkten Link). Zum Freigeben das Feld wieder entfernen.

### Release mit Countdown

`"release": "2026-11-08T14:00:00+01:00"` (ISO-Zeit mit Zeitzone) hält ein Spiel bis dahin zu, ohne `"wartung"`. Der Spielen-Knopf zeigt „Startet in 06:33“ (Kachel und Seitenleiste „In 06:33“), zählt live herunter und wird zur angegebenen Zeit für alle von selbst zum normalen „Spielen“, auch bei offenen Seiten und ohne Neuladen. Die Uhrzeit kommt vom Server (Date-Header von `games.json`), die Geräteuhr spielt keine Rolle. Vor dem Release steht in den Fakten „Wird veröffentlicht <Datum, Uhrzeit>“, danach „Erschienen <Datum>“ (das Datum von `release`). Das Feld darf danach stehen bleiben; ist die Zeit vorbei, hat es keine Wirkung mehr.

### Große Spielstände (Übergabe per postMessage)

Stände bis ca. 100.000 Zeichen (Base64) gehen weiter über `#lgh=<Base64url>` an die Spieladresse. Größere (z. B. Tierspiel mit tausenden Tieren) gehen nicht mehr durch die Adresse, sondern per `postMessage`: Der Hub setzt `#lgh=msg`, das Spiel fragt mit `{lgh:'hallo'}` nach, bekommt `{lgh:'daten', json}` und meldet `{lgh:'fertig'}` (Vorlade-Skript `tools/lgh-vorlade.js`, der Spielcode startet erst nach `window.__lghBereit`, siehe Tierspiel `index.html`). Bis `fertig` kommt, nimmt der Hub keine Stände von diesem Rahmen an. Schrumpft ein Stand plötzlich stark, bleibt der alte als `lgh.stand.<id>.sicher` erhalten.

## Adressen und einmaliger Umzug

Der Hub läuft auf `https://hub.leifps.de` und `https://leifps.de` (eigene Domain, leifps.de kann per Cloudflare-Weiterleitung auf hub.leifps.de zeigen) und weiterhin auf `https://lgh.leifps.workers.dev`; beide zeigen auf denselben Worker und dieselbe Datenbank. Der Browser-Speicher gehört aber immer zu genau einer Adresse, deshalb liegen Spielstände (`lgh.stand.*`) und die Geräte-Kennung (`lgh.geraet`) auf der neuen Adresse zunächst nicht vor. Beim ersten Anmelden auf leifps.de gibt es darum den Haken "Daten von der alten Adresse übernehmen" (standardmäßig gesetzt): Beim Klick auf "Anmelden" öffnet sich `lgh.leifps.workers.dev/umzug.html` als Pop-up, liest dort die Stände samt `.vorher`/`.sicher` und die Geräte-Kennung und schickt sie per `postMessage` an das öffnende Fenster. Gesendet wird nur an `https://leifps.de` und `https://hub.leifps.de` (fest eingetragen), empfangen nur vom Pop-up der alten Adresse. Vorhandene Stände auf der neuen Adresse werden nie überschrieben. Die Anmeldung (`lgh.konto`) wird nicht übertragen; man meldet sich mit Name und Passwort neu an. Die übernommene Geräte-Kennung sorgt dafür, dass die Gerätesperre (`EIN_GERAET`) das Konto nicht aussperrt. Danach lädt der normale Grundabgleich die Stände wieder hoch. Das Angebot erscheint nur bis zur ersten erfolgreichen Anmeldung auf leifps.de. Nicht getestet: iPhone/Safari und der Home-Bildschirm-Modus (dort hat die installierte App einen eigenen Speicher).

**Abschaltung der alten Adresse:** Auf `lgh.leifps.workers.dev` steht ein Hinweis (Banner und in der Anmeldemaske), dass die Adresse bald nicht mehr unterstützt wird. Ab **Dienstag, 10. November 2026, 15:00 Uhr (Berlin)** leitet der Worker (`src/umzug.js`, Konstante `WEITERLEITUNG_AB`) jeden Seitenaufruf per 302 auf `https://hub.leifps.de` weiter (Pfad und Query bleiben). Ausgenommen sind `/api/*` und `/umzug.html`, damit offene Tabs weiter funktionieren und die einmalige Übernahme der Spielstände beim Anmelden auf der neuen Adresse auch danach noch geht.


## Entwickler und Profile

In `games.json` steht pro Spiel `"entwickler": ["Benutzername", …]` (Namen von Hub-Konten, genau so geschrieben wie das Konto). Fehlt das Feld, gilt `leif`. Die Detailseite zeigt den Anzeigenamen des Kontos (vom Server über `/api/entwickler`, solange er fehlt der Benutzername) als blauen Link auf das Profil; das Profil listet unter "Spiele von @name" alle Spiele, bei denen der Name als Entwickler steht. Profile sieht man sonst nur von Freunden; Konten, die in `games.json` als Entwickler stehen, darf jeder angemeldete Mensch öffnen, dann aber nur mit Name, Bild, "dabei seit" und ihren Spielen (kein Online-Status, keine Spielzeiten, keine Freundeszahl) und mit einem Knopf für die Freundschaftsanfrage. Der Worker liest die Entwicklernamen selbst aus `games.json` (5 Minuten zwischengespeichert).

## Zusatzinhalte (DLCs) und Hexis

Spiele können Zusatzinhalte anbieten, die man mit Hexis (dem Guthaben des Hubs) kauft. Das Hub bleibt ein Werkzeug: Oben steht nur das Sechseck-Symbol (ohne Zahl und ohne Namen), ein Klick darauf zeigt den Stand und die eigenen Zusatzinhalte.

- **Server** (`src/dlc.js`): `KATALOG` (Kennung, Spiel, Name, Kurztext, Preis) ist die einzige Quelle für Preise. Tabellen `wallet` (Guthaben), `wallet_log`, `dlc_owned` (Besitz). `GET /api/dlc` liefert Guthaben, Katalog und Besitz, `POST /api/dlc/kaufen {id}` kauft atomar (Besitz nur, wenn das Guthaben reicht).
- **Aussehen** je DLC steht in `games.json` unter dem Spiel (`dlcs`: `id`, `icon`, `wallpaper` (5:1), `screenshots`, `trailer`, `beschreibung`, `erschienen`). Jeder DLC hat eine eigene Seite `#spiel/<spiel>/dlc/<id>` mit Galerie, Beschreibung, Preis und Bewertung (nur Besitzer, Mindest-Spielzeit zählt im Spiel). Auf der Spieleseite stehen die DLCs unter „Zusatzinhalte“.
- **Im Spiel**: Das Spiel fragt per `postMessage` `{lgh:'dlc', spiel, aktion:'frage'}` und bekommt `{lgh:'dlc', spiel, guthaben, katalog:[{id, name, text, preis, besitz}]}`. Mit `{lgh:'dlc', spiel, aktion:'kaufen', id}` öffnet das Spiel den Kaufdialog des Hubs; bezahlt wird immer im Hub. Das Spiel schaltet Inhalte nur frei, wenn `besitz` wahr ist.
- **Guthaben vergeben** (Verdienen gibt es noch nicht), z. B. mit der Cloudflare-D1-Konsole:
  `INSERT INTO wallet (user_id, amount) SELECT id, 500 FROM users WHERE name_lc = 'leif' ON CONFLICT(user_id) DO UPDATE SET amount = amount + 500;`
- **Startgeschenk**: Jedes Konto, das bis einschließlich 8.11.2026 (Berliner Zeit) angelegt wurde, bekommt beim ersten Abruf von `/api/dlc` einmalig 1000 Hexis (`GESCHENK`, `GESCHENK_BIS` in `src/dlc.js`; die Tabelle `wallet_gift` verhindert doppeltes Vergeben, im Verlauf steht `startgeschenk`). Spätere Konten bekommen nichts. Das Geschenk wird nicht heimlich gutgeschrieben: Der Hub zeigt beim ersten Öffnen einmal den Dialog „Ein Geschenk für dich“ (und einen kleinen Punkt am Guthaben-Symbol, falls man gerade im Spiel ist). Mit „gesehen“ (`POST /api/dlc/gesehen`, auch beim Schließen per Esc) verschwindet er, die Tabelle `wallet_gift_seen` merkt es sich.
- Erster DLC: **Runenschmiede** für Schleimmerge (Runenwaffen und Verzauberungen).
