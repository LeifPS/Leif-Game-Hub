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
| `bild` | Eigenes Titelbild (Pfad oder URL, Hochformat 3:4 ideal); ohne Angabe zeichnet der Hub automatisch ein Platzhalterbild aus `farbe` |

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
