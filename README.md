# Leifs Spiele (Game Hub)

Eine Plattform, auf der alle Spiele an einem Ort liegen, im Stil von Steam und der EA App: Bibliothek links, Empfehlung oben, Cover-Kacheln, eine Seite pro Spiel mit "Spielen"-Knopf. Die Spiele laufen komplett eigenständig auf ihren eigenen Adressen; der Hub öffnet sie nur per iframe (mit "Neuer Tab" als Ausweg).

## Neues Spiel hinzufügen

Einen Eintrag in `public/games.json` ergänzen:

```json
{
  "id": "meinspiel",
  "name": "Mein Spiel",
  "text": "Ein Satz, worum es geht.",
  "url": "https://meinspiel.leifps.workers.dev",
  "farbe": "#5b8fc9",
  "kategorien": ["Action", "Online"]
}
```

Pflicht sind `id` (kurz, klein, ohne Leerzeichen), `name`, `text`, `url` und `farbe`. Optional:

| Feld | Wirkung |
| --- | --- |
| `url: null` | Spiel erscheint als "Bald" und ist nicht anklickbar |
| `kategorien` | Filter-Chips und Suche |
| `featured: true` | Spiel steht groß oben auf der Startseite |
| `beschreibung` | Längerer Text auf der Spielseite (sonst `text`) |
| `bild` | Eigenes Titelbild (Pfad oder URL, Hochformat 3:4 ideal); ohne Angabe zeichnet der Hub automatisch ein Platzhalterbild aus `farbe` |

## Lokal ansehen

```
npx wrangler dev
```

oder den Ordner `public/` mit einem beliebigen statischen Server öffnen.

## Dateien

- `public/index.html`: Gerüst und Symbole
- `public/style.css`: Design
- `public/app.js`: Startseite, Spielseite, Spieleansicht
- `public/games.json`: die Spieleliste

## Deploy

Cloudflare Worker mit statischen Dateien (`wrangler.jsonc`), automatisch bei jedem Push auf `main`.
