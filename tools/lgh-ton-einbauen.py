#!/usr/bin/env python3
"""Hängt die Lautstärke-Unterstützung (lgh-ton.js) ans Ende von lgh-vorlade.js-Dateien.
Aufruf: python3 lgh-ton-einbauen.py <lgh-vorlade.js> [<weitere> ...]
Mehrfaches Ausführen ersetzt den alten Block (zwischen /*lgh-ton-start*/ und /*lgh-ton-ende*/)."""
import os, re, sys
HIER = os.path.dirname(os.path.abspath(__file__))
block = open(os.path.join(HIER, 'lgh-ton.js'), encoding='utf-8').read().rstrip('\n')
neu = '\n/*lgh-ton-start*/\n' + block + '\n/*lgh-ton-ende*/\n'
for pfad in sys.argv[1:]:
    t = open(pfad, encoding='utf-8').read()
    t = re.sub(r'\n?/\*lgh-ton-start\*/.*?/\*lgh-ton-ende\*/\n?', '', t, flags=re.S)
    open(pfad, 'w', encoding='utf-8').write(t.rstrip('\n') + '\n' + neu)
    print('Ton eingebaut:', pfad)
