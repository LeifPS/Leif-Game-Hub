# Leifs Spiele (Game Hub)

Eine einfache Startseite, auf der alle Spiele an einem Ort liegen. Die Spiele laufen komplett eigenständig auf ihren eigenen Adressen; der Hub öffnet sie nur per iframe (mit "Neuer Tab" als Ausweg).

## Neues Spiel hinzufügen

Einen Eintrag in `public/games.json` ergänzen:

```json
{
  "id": "meinspiel",
  "name": "Mein Spiel",
  "text": "Ein Satz, worum es geht.",
  "url": "https://meinspiel.leifps.workers.dev",
  "farbe": "#5b8fc9"
}
```

- `id`: kurz, klein, ohne Leerzeichen (kommt in die Adresse: `/#spiel/meinspiel`)
- `url`: `null` setzen, dann erscheint die Karte mit "Bald" und ist nicht anklickbar
- `farbe`: bestimmt das automatisch gezeichnete Titelbild

## Lokal ansehen

```
npx wrangler dev
```

oder einfach den Ordner `public/` mit einem beliebigen statischen Server öffnen.

## Deploy

Cloudflare Worker mit statischen Dateien (`wrangler.jsonc`), automatisch bei jedem Push auf `main`.
