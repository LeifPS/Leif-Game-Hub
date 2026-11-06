#!/usr/bin/env python3
"""Baut Hub-Speicherung (Vorlade-Skript) und Einstellungsmenü mit Spielstand-Code (Modul) in eine fertige HTML-Seite ein.
Aufruf: python3 lgh-einbauen.py <seite.html> <spiel-id> [--pos bc|br|bl|tr|tl|mr|ml] [--ohne-menue] [--eigener-knopf]
Die beiden Skriptdateien werden neben die HTML-Seite kopiert. Mehrfaches Ausführen ersetzt den alten Einbau."""
import os, re, shutil, sys, argparse
HIER = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('seite'); ap.add_argument('spiel')
ap.add_argument('--pos', default='bc'); ap.add_argument('--ohne-menue', action='store_true'); ap.add_argument('--eigener-knopf', action='store_true')
a = ap.parse_args()
ziel = os.path.dirname(os.path.abspath(a.seite))
for f in ('lgh-vorlade.js', 'lgh-modul.js'):
    shutil.copyfile(os.path.join(HIER, f), os.path.join(ziel, f))
h = open(a.seite, encoding='utf-8').read()
# alten Einbau entfernen
h = re.sub(r'<script src="lgh-vorlade\.js"></script><!--lgh-->\n?', '', h)
h = re.sub(r'<!--lgh-start-->.*?<!--lgh-ende-->\n?', '', h, flags=re.S)
vor = '<script src="lgh-vorlade.js"></script><!--lgh-->\n'
flags = "window.LGH_SPIEL=%r;window.LGH_POS=%r;" % (a.spiel, a.pos)
if a.ohne_menue: flags += "window.LGH_OHNE_MENUE=true;"
if a.eigener_knopf: flags += "window.LGH_EIGENER_KNOPF=true;"
mod = '<!--lgh-start--><script>' + flags + '</script><script src="lgh-modul.js"></script><!--lgh-ende-->\n'
# Vorlade-Skript ganz vorn im Kopf (vor allen Spiel-Skripten)
for pat in (r'<head(?:\s[^>]*)?>', r'<meta[^>]*charset[^>]*>', r'<html[^>]*>', r'<!doctype[^>]*>'):
    m = re.search(pat, h, flags=re.I)
    if m:
        h = h[:m.end()] + '\n' + vor + h[m.end():]; break
else:
    h = vor + h
i = h.lower().rfind('</body>')
h = (h[:i] + mod + h[i:]) if i >= 0 else (h + '\n' + mod)
open(a.seite, 'w', encoding='utf-8').write(h)
print('eingebaut:', a.seite)
