# Leifs Spiele (Game Hub)

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

Alle Spiele starten bei `0.1.0.0` (Beta).

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

Die Icons der Spiele mit eigenem Favicon stammen aus den Spielen selbst (Vektor bzw. Apple-Touch-Icon, auf 512 px gebracht, Rundungen entfernt). Das sind: Tonlinge, Foil XI, Ball gegen Ball, Pizzafabrik, Business Empire, Spells, Zahlenwerk, Wasserschlacht, Tippspiel, Tierspiel und Cookie RNG 2. Die KI-Icons, die dadurch ersetzt wurden, liegen in `grafik/icons-ki/`. Foil XI setzt sein Favicon per JavaScript (PNG-Daten im Code). Alle anderen Spiele nutzen weiter das KI-Icon.

Der Spielname steht auf der Detailseite zusätzlich als Überschrift neben dem Icon, in derselben Schrift wie im Wallpaper. Die Schrift kommt aus dem Feld `schrift` in `games.json` (`familie`: fredoka, cinzel, lilita, anton, bangers, marker oder silkscreen; `versalien`; `abstand` in em). Die Schriftdateien liegen selbst gehostet in `public/fonts/`.

## Spielstand-Code

`tools/spielstand-code.js` ist die Vorlage für das Einstellungsmenü mit dem Abschnitt "Spielstand-Code", das in Spielen mit lokalem Spielstand (localStorage) eingebaut wird. Im Hub läuft ein Spiel eingebettet, und Browser speichern dort getrennt vom direkten Spiel-Link. Mit dem Code kopiert man den Spielstand von einem Fenster ins andere. Der Code gehört immer in ein Einstellungsmenü: Hat ein Spiel schon eins, bekommt es dort eine Zeile, die `LGH.oeffnen()` aufruft; sonst erzeugt die Vorlage ein Zahnrad (oder das Spiel zeichnet sein eigenes und setzt `window.LGH_EIGENER_KNOPF = true`). Eigene Schalter (z. B. Ton) kommen über `window.LGH_ZEILEN`. Die Vorlage gehört pro Spiel angepasst (Variable `SPIEL`). Cloud-Spiele und Spiele, die Export/Import schon haben, bekommen sie nicht.
