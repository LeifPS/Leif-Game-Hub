#!/usr/bin/env python3
"""Baut die Profilbild-Symbole aus dem Archiv von game-icons.net (Ordner icons/000000/ffffff/1x1).
Aufruf: python3 tools/icons-bauen.py <entpacktes-archiv>/icons
Schreibt public/icons/<urheber>/<name>.svg (nur der Pfad, ohne weißen Hintergrund, damit sich das Symbol beliebig einfärben lässt),
public/icons/index.json (Liste aller Symbole) und public/credits.html (Namen der Urheber, CC BY 3.0 verlangt die Nennung)."""
import html, json, os, re, shutil, sys

URHEBER = {  # Ordner -> (Name, Webadresse oder None)
    'andymeneely': ('Andy Meneely', 'http://www.se.rit.edu/~andy/'), 'aussiesim': ('Aussiesim', None),
    'carl-olsen': ('Carl Olsen', 'https://twitter.com/unstoppableCarl'), 'caro-asercion': ('Caro Asercion', None),
    'cathelineau': ('Cathelineau', None), 'catsu': ('Catsu', None), 'darkzaitzev': ('DarkZaitzev', 'http://darkzaitzev.deviantart.com'),
    'delapouite': ('Delapouite', 'https://delapouite.com'), 'faithtoken': ('Faithtoken', 'http://fungustoken.deviantart.com'),
    'felbrigg': ('Felbrigg', 'http://blackdogofdoom.blogspot.co.uk'), 'generalace135': ('GeneralAce135', None),
    'guard13007': ('Guard13007', 'https://guard13007.com'), 'heavenly-dog': ('HeavenlyDog', 'http://www.gnomosygoblins.blogspot.com'),
    'irongamer': ('Irongamer', 'http://ecesisllc.wix.com/home'), 'john-colburn': ('John Colburn', 'http://ninmunanmu.com'),
    'john-redman': ('John Redman', 'http://www.uniquedicetowers.com'), 'kier-heyl': ('Kier Heyl', None),
    'lorc': ('Lorc', 'http://lorcblog.blogspot.com'), 'lord-berandas': ('Lord Berandas', 'http://berandas.deviantart.com'),
    'lucasms': ('Lucas', None), 'pepijn-poolman': ('Pepijn Poolman', None), 'pierre-leducq': ('Pierre Leducq', None),
    'priorblue': ('PriorBlue', None), 'quoting': ('Quoting', None), 'rihlsul': ('Rihlsul', None),
    'sbed': ('Sbed', 'http://opengameart.org/content/95-game-icons'), 'seregacthtuf': ('Seregacthtuf', None), 'skoll': ('Skoll', None),
    'sparker': ('Sparker', 'http://citizenparker.com'), 'spencerdub': ('SpencerDub', None), 'starseeker': ('Starseeker', None),
    'various-artists': ('Verschiedene Urheber', None), 'viscious-speed': ('Viscious Speed (CC0)', 'http://viscious-speed.deviantart.com'),
    'willdabeast': ('Willdabeast', 'http://wjbstories.blogspot.com'), 'zajkonur': ('Zajkonur', None), 'zeromancer': ('Zeromancer (CC0)', None),
}

quelle = sys.argv[1]
wurzel = os.path.join(quelle, '000000', 'ffffff', '1x1')
hier = os.path.dirname(os.path.abspath(__file__))
ziel = os.path.join(hier, '..', 'public', 'icons')
shutil.rmtree(ziel, ignore_errors=True)
eintraege, zahl = [], {}
for ordner in sorted(os.listdir(wurzel)):
    if ordner not in URHEBER: sys.exit('Unbekannter Urheber-Ordner: ' + ordner)
    os.makedirs(os.path.join(ziel, ordner), exist_ok=True)
    for datei in sorted(os.listdir(os.path.join(wurzel, ordner))):
        if not datei.endswith('.svg'): continue
        s = open(os.path.join(wurzel, ordner, datei), encoding='utf-8').read()
        pfade = re.findall(r'<path\b[^>]*?\bd="([^"]+)"[^>]*/?>', s)
        # Das erste Element ist das weiße Hintergrundquadrat (M0 0h512v512H0z), alles danach ist das Symbol
        if not pfade or pfade[0].replace(' ', '') != 'M00h512v512H0z': sys.exit('Unerwartete Form: ' + ordner + '/' + datei)
        glyph = pfade[1:]
        if not glyph: sys.exit('Kein Symbol: ' + ordner + '/' + datei)
        name = datei[:-4]
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">' + ''.join('<path d="' + d + '"/>' for d in glyph) + '</svg>'
        open(os.path.join(ziel, ordner, datei), 'w', encoding='utf-8').write(svg)
        eintraege.append(ordner + '/' + name); zahl[ordner] = zahl.get(ordner, 0) + 1
eintraege.sort(key=lambda e: e.split('/')[1])
json.dump({'urheber': {k: v[0] for k, v in URHEBER.items() if k in zahl}, 'symbole': eintraege}, open(os.path.join(ziel, 'index.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

zeilen = ''
for k in sorted(zahl, key=lambda k: -zahl[k]):
    n, u = URHEBER[k]
    zeilen += '    <li>' + (('<a href="' + html.escape(u) + '" rel="noopener">' + html.escape(n) + '</a>') if u else html.escape(n)) + ' <span>(' + str(zahl[k]) + ' Symbole)</span></li>\n'
open(os.path.join(hier, '..', 'public', 'credits.html'), 'w', encoding='utf-8').write('''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0d1016">
<meta name="color-scheme" content="dark">
<title>Quellen – Leif Game Hub</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<style>
  html{background:#0d1016}
  body{margin:0;min-height:100vh;background:#0d1016;color:#cbd3e2;font:16px/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:block}
  main{max-width:640px;margin:0 auto;padding:48px 20px 80px}
  a{color:#7fb0ff}
  .zurueck{display:inline-block;margin-bottom:28px;text-decoration:none;color:#9fb0cc}
  .zurueck:hover{color:#fff}
  h1{margin:0 0 6px;color:#fff;font-size:30px}
  h2{margin:32px 0 6px;color:#fff;font-size:18px}
  p{margin:0 0 10px}
  ul{margin:0;padding-left:20px} li span{color:#8d97a9}
</style>
</head>
<body>
<main>
  <a class="zurueck" href="./">← Zur Spielesammlung</a>
  <h1>Quellen</h1>
  <h2>Profilbild-Symbole</h2>
  <p>Die Symbole für die Profilbilder stammen von <a href="https://game-icons.net" rel="noopener">game-icons.net</a> und stehen unter der Lizenz <a href="https://creativecommons.org/licenses/by/3.0/" rel="noopener">Creative Commons BY 3.0</a> (bei Viscious Speed und Zeromancer: CC0). Im Hub lassen sie sich einfärben, drehen und vergrößern. Icons made by:</p>
  <ul>
''' + zeilen + '''  </ul>
</main>
</body>
</html>
''')
print(len(eintraege), 'Symbole,', len(zahl), 'Urheber')
