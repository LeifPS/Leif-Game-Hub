// Dokumentation des HDF-Formats für KIs + Beispiel-Arbeitsblatt
export const HDF_DOC = `# HDF – Handwritten Document Format (STools)

Du schreibst ein Dokument als reinen Text. Die App STools setzt es in echter Handschrift (Text, Zahlen, Formeln) und zeichnet Linien, Achsen, Kurven und Rahmen als perfekte Striche, wie auf einem Arbeitsblatt in GoodNotes. Das Layout macht die App automatisch. Antworte NUR mit dem Dokument (in einem Codeblock), ohne Erklärungen.

## Grundregeln
- Normaler Text steht einfach als Zeilen. Markdown geht: # Überschrift, ## Unter-Überschrift, **fett**, __unterstrichen__, ==markiert==, ~~durchgestrichen~~, Listen mit "- " oder "1. ". Leerzeile = Absatz.
- Ein Element beginnt mit [name] allein in einer Zeile und endet mit [/name]. Dazwischen stehen Eigenschaften "schluessel: wert" (eine pro Zeile) und/oder Text. Einzeiler: [titel]Mein Titel[/titel].
- Alle Namen kleingeschrieben. Umlaute auch als ae/oe/ue erlaubt (hoehe, groesse). Deutsche und englische Elementnamen gehen (formel = formula).
- Kurzform: Mehrere Werte in einer Zeile trennt man mit " | " (mit Leerzeichen drumherum), z. B. zeile: -2 | 0
- Zahlen mit Punkt oder Komma. Angezeigt wird mit Komma. Maße: 5mm, 2cm, 40pt, 50% (ohne Einheit = Prozent).
- Farben: rot, blau, gruen, schwarz, orange, lila, gelb, grau, braun, rosa, tuerkis, hellblau oder #rrggbb.
- Fehler zerstören nie das ganze Blatt: Ein kaputtes Element wird rot markiert oder als Platzhalter gezeigt, der Rest wird gezeichnet.
- Das Blatt ist für GoodNotes-Papier "kariert" ausgelegt: Koordinatensysteme und Tabellen liegen auf den Kästchen.

## Formelschreibweise (überall, wo ein Ausdruck steht)
Einfache Tastaturzeichen: x^2, x^(n+1), a_1, (a+b)/2, sqrt(x), root(x, 3), frac(a, b), abs(x-2), pi, alpha, beta, Delta, inf, sin(x), cos(x), ln(x), log_2(8), <=, >=, !=, ->, =>, <=>, +-, *, :, ·, ×, °, %. Griechische Namen werden zu Buchstaben. Brüche mit / werden gestapelt gesetzt, Klammern passen sich an. Multiplikation "2*x" wird als "2x" gesetzt, "3*4" als "3·4". Punkt-Koordinaten: P(2|3).
Große Operatoren: int_a^b f(x) dx (Integral, auch iint, iiint, oint), sum_(i=1)^n a_i, prod_(k=1)^n k, lim_(x->0) sin(x)/x (Bruch gehört zum Limes-Term), [F(x)]_a^b. Vektor: vec(1, 2, 3). Matrix: mat(1, 2; 3, 4) (Zeilen mit ; trennen). Fallunterscheidung: cases(x^2, x>0; 0, x<=0). Nach int steht dx, dy, dt automatisch als Differential.
Wörter in Formeln (z. B. "und", "oder", Einheiten) in Anführungszeichen setzen: x_1 = 2 "und" x_2 = -2. Ein Ausdruck, der mit = oder einem Relationszeichen beginnt, wird als Fortsetzung gesetzt (z. B. "= 4").

## Elemente
### Text und Struktur
[titel]Text[/titel]   [ueberschrift]Text[/ueberschrift]   [text]Absatz[/text]
[hinweis]  Kasten. Eigenschaft titel (Standard "Merke"); Inhalt: Text/Markdown.   [beispiel] genauso (Standard "Beispiel").
[aufgabe]  nummer: 1  | punkte: 3 | Inhalt: Aufgabentext, darf Formeln/Graphen/Tabellen enthalten.
[antwort]  Leeres Antwortfeld. hoehe: 40mm | linien: 4 (Schreiblinien) | kaestchen: ja (Karomuster)
[zitat] quelle: … | Inhalt   [liste] typ: nummeriert, darin [eintrag]Text[/eintrag]
[spalten] mit mehreren [spalte]…[/spalte] nebeneinander (breite: 50% optional, abstand: 6mm). Spalten dürfen alles enthalten.
[gruppe] rand: ja – fasst Inhalt zusammen.   [abstand] hoehe: 10mm   [trennlinie]   [seitenumbruch]
### Formeln und Rechnen
[formel]
ausdruck: f(x) = (x^2 - 4) / 2
[/formel]
(mehrere Zeilen möglich, jede Zeile eine Formel, zentriert) – Eigenschaften: groesse (z. B. 120%), farbe, ausrichtung: links|mitte|rechts, malzeichen: punkt|kreuz|weg, dezimal: komma|punkt.
[gleichung]  Zeilen werden am Gleichheitszeichen untereinander ausgerichtet. Pro Zeile: zeile: Ausdruck | Randnotiz
  zeile: 2x + 3 = 11
  zeile: 2x = 8 | -3
  zeile: x = 4 | :2
[rechenweg]  titel: Nullstellen berechnen, dann schritt: Ausdruck | Hinweis (Hinweis erscheint rechts hinter einem Strich). Optional ausrichten: ja.
[bruch] zaehler: a+b | nenner: 2     [wurzel] ausdruck: x^2+1 | grad: 3
### Tabellen
[tabelle]
kopf: x | f(x)
zeile: -2 | 0
zeile: 0 | -4
[/tabelle]   (Zahlen mit Punkt werden mit Komma gesetzt; Zellen mit $Formel$ werden als Formel gesetzt; optional titel, rahmen: ja|nein, ausrichtung.)
[wertetabelle]  Berechnet Werte selbst: funktion: x^2-4 | xvon: -3 | xbis: 3 | schritt: 1 | nachkommastellen: 2 | kopf: x | f(x) | richtung: waagerecht|senkrecht
### Koordinatensystem mit Funktionen
[graph titel="Parabel"]
xbereich: -4..4
ybereich: -5..8
funktion: x^2-4 | blau | name=f(x)
funktion: 2x+1 | rot | gestrichelt | name=g(x)
punkt: 2 | 0 | N
strecke: 0,0 | 3,4 | pfeil | rot
label: x=1 | y=2 | text=Hallo
nullstellen: ja
extrema: ja
schnittpunkte: ja
legende: ja
[/graph]
Eigenschaften: xbereich/ybereich (oder xmin xmax ymin ymax), einheit (Kästchen pro Einheit; Standard 2, bei großen Bereichen automatisch 1 oder 0,5), xbeschriftung/ybeschriftung (Standard x, y), zahlen: ja|nein, achsen: ja|nein, raster: ja (eigenes Gitter, auf kariertem Papier nicht nötig), skala (Abstand der Teilstriche), nullstellen/extrema/schnittpunkte: ja (werden berechnet und mit Koordinaten beschriftet), breite, titel.
Funktion: "funktion: Term | Farbe | Linienart | name=… | bereich=a..b" (Reihenfolge der Zusatzangaben egal; Linienart gestrichelt|gepunktet). Alternativ als Unterelement [funktion] ausdruck: … | farbe: … | name: … | bereich: -2..2 [/funktion]. Der Term enthält nur x, z. B. x^2-4, sin(x), 1/x, sqrt(x). Polstellen und Definitionslücken werden erkannt. Punkte: punkt: x | y | Name | kreuz|punkt|kreis | Farbe. Strecken/Pfeile: strecke: x1,y1 | x2,y2 | pfeil | Farbe | Name. Tipp: Pro Graph höchstens 15 Einheiten je Achse (passt auf eine GoodNotes-Seite).
### Noch nicht umgesetzt (werden als roter Platzhalter angezeigt)
Balken-/Kreis-/Liniendiagramme, Geometrie, Mindmap, Flussdiagramm, Baum, Venn, Zeitstrahl, Chemie, Schaltbilder, Karten, Bilder. Nutze dafür vorerst Text, Tabellen und Graphen.

## Qualitätsregeln für dich
- Ein Arbeitsblatt: Titel, kurze Erklärung/Merkkasten, Beispiel mit Rechenweg, Aufgaben (aufgabe) mit Antwortfeldern (antwort).
- Rechne selbst nach: Ergebnisse in Tabellen und Rechenwegen müssen stimmen (Wertetabellen berechnet die App).
- Keine Elemente erfinden. Nur die oben genannten benutzen.
- Text in Handschrift ist breit: kurze Sätze, nicht zu viele Wörter pro Zeile.
`;
export const HDF_PROMPT = `Erstelle für mich ein Arbeitsblatt im Format HDF. Thema: [HIER DAS THEMA, KLASSE UND UMFANG EINTRAGEN]\n\nHalte dich genau an die folgende Format-Beschreibung und antworte nur mit dem fertigen Dokument in einem Codeblock.\n\n` + HDF_DOC;
export const HDF_EXAMPLE = `[titel]Quadratische Funktionen[/titel]

Die Funktion f(x) = x^2 - 4 ist eine **Parabel**.

[hinweis]
titel: Merke
Nullstellen sind die x-Werte, bei denen f(x) = 0 ist.
[/hinweis]

[aufgabe]
nummer: 1
punkte: 3
Berechne die Nullstellen von f.
[/aufgabe]

[rechenweg]
titel: Lösung
schritt: x^2 - 4 = 0 | +4
schritt: x^2 = 4 | Wurzel ziehen
schritt: x = ±sqrt(4)
schritt: x_1 = 2 und x_2 = -2
[/rechenweg]

[graph titel="Graph von f"]
xbereich: -4..4
ybereich: -5..6
funktion: x^2-4 | blau | name=f(x)
nullstellen: ja
[/graph]

[wertetabelle]
funktion: x^2-4
xvon: -3
xbis: 3
[/wertetabelle]

[aufgabe]
nummer: 2
punkte: 2
Löse die Gleichung nach x auf.
[/aufgabe]

[gleichung]
zeile: 3x + 5 = 20
zeile: 3x = 15 | -5
zeile: x = 5 | :3
[/gleichung]

[antwort]
hoehe: 30mm
linien: 3
[/antwort]
`;
