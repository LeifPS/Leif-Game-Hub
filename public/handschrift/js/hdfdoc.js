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
Formeln mitten im Satz: $f(x) = x^2 - 4$ (gilt in Text, Listen, Kästen und Zellen; Brüche werden dort kompakt gesetzt). Ein einzelnes $ mit Leerzeichen daneben (5 $) bleibt Text, \\$ ergibt ein $-Zeichen.
Wörter in Formeln (z. B. "und", "oder", Einheiten) in Anführungszeichen setzen: x_1 = 2 "und" x_2 = -2. Ein Ausdruck, der mit = oder einem Relationszeichen beginnt, wird als Fortsetzung gesetzt (z. B. "= 4").

## Elemente
### Text und Struktur
[titel]Text[/titel]   [ueberschrift]Text[/ueberschrift]   [text]Absatz[/text]
[beispiel]  Kasten. Eigenschaft titel (Standard "Beispiel"); Inhalt: Text/Markdown.
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
[vokabeln]
kopf: Französisch | Deutsch
le chat = die Katze
avoir faim = Hunger haben
[/vokabeln]   (Vokabelliste: eine Vokabel pro Zeile, getrennt mit =, – oder |; zwei Spalten über die ganze Breite, ohne Rahmen; optional titel, linie: ja|nein, aufteilung: 40 (Prozent für die linke Spalte).)
[noten]
takt: 4/4
text: Al-le mei-ne Ent-chen
c d e f | g2 g2 ||
[/noten]   (Noten in deiner Handschrift, am besten auf dem Papier „Notenlinien“. Tonnamen c d e f g a h (b = B), r = Pause, ' höher, , tiefer, # Kreuz, b Be, = Auflöser, Dauer 1 2 4 8 16 (gilt weiter), . punktiert, | Taktstrich, || Schluss; optional schluessel: bass, takt, text (Silben mit - trennen).)
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
### Geometrie (Element [geometrie] = Koordinatensystem mit gleichem Maßstab auf x und y)
[geometrie titel="Zentrische Streckung"]
xbereich: -1..9
ybereich: -1..9
figur: A(2,2) B(4,2) C(3,4) | blau | ABC
abbildung: ABC | streckung | zentrum=1,1 | faktor=2 | hilfslinien
[/geometrie]
figur: Ecken mit Namen und Koordinaten (A(2,2) oder A(2|2)), dazu Farbe, optional Name der Figur, "offen" für nicht geschlossen. abbildung: Figurname | Art | Angaben. Arten: streckung (zentrum=x,y faktor=k), spiegelung (achse=x | y | x=3 | y=2 | y=x | x1,y1..x2,y2), punktspiegelung (zentrum=x,y), drehung (zentrum=x,y winkel=90, positiv = gegen den Uhrzeigersinn), verschiebung (vektor=dx,dy). Optional: hilfslinien (gestrichelte Verbindungen), Farbe, name=Neuname. Bildpunkte heißen A', B', C'. Weitere Zeilen in jedem Graphen/jeder Geometrie: kreis: mx,my | radius | Farbe | Name; gerade: x1,y1 | x2,y2 | Farbe | Name (unendliche Gerade).
### Diagramme (Element [diagramm], alternativ [balkendiagramm] [kreisdiagramm] [liniendiagramm])
[diagramm titel="Lieblingsfächer"]
typ: balken | kreis | linie
wert: Mathe | 12 | blau
wert: Sport | 15 | gruen
einheit: Schüler
[/diagramm]
Mehrere Reihen (gruppierte Balken oder mehrere Linien): kategorien: Mo, Di, Mi  und  reihe: Berlin | blau | 3, 5, 4  (pro Reihe eine Zeile). Optional: ymax, werte: ja|nein (Zahlen an den Balken), prozent: ja (beim Kreis), legende: ja.
### Schaubilder
[ablauf titel="…"] Flussdiagramm: knoten: id | Text | oval|raute|rechteck (optional, sonst ist der Name der Text) und pfeil: A -> B -> C | Beschriftung. richtung: runter|rechts.
[baum] / [hierarchie]: pfeil: Start -> K | 0,5 (Kante mit Beschriftung, z. B. Wahrscheinlichkeit), richtung: rechts (Standard)|runter.
[mindmap]: zentrum: Thema, dann zweig: Name | Unterpunkt1; Unterpunkt2 | Farbe.
[mengen] (Venn, 2 oder 3 Mengen): menge: Name | Farbe | Element1; Element2, dazu schnitt: A,B | Elemente (A, B, C = Reihenfolge der Mengen).
[zeitstrahl]: ereignis: 1914 | Text | Farbe (bei Jahreszahlen im richtigen Abstand; massstab: nein = gleichmäßig).
[pyramide]: stufe: Text | Farbe (von oben nach unten).   [kreislauf]: stufe: Text | Farbe (im Kreis mit Pfeilen).
### Chemie
[reaktion]  gleichung: 2 H2 + O2 -> 2 H2O | Hinweis. Indexzahlen werden automatisch tiefgestellt, <-> wird ⇌. Ladungen mit ^: Na^+ , SO4^2- .
### Noch nicht umgesetzt (werden als roter Platzhalter angezeigt)
Streudiagramm, Physik-Schaltbilder, Karten, Bilder, Strukturformeln. Nutze dafür vorerst Text, Tabellen und Graphen.

## Qualitätsregeln für dich
- Ein Arbeitsblatt: Titel, kurze Erklärung/Merkkasten, Beispiel mit Rechenweg, Aufgaben (aufgabe) mit Antwortfeldern (antwort).
- Rechne selbst nach: Ergebnisse in Tabellen und Rechenwegen müssen stimmen (Wertetabellen berechnet die App).
- Keine Elemente erfinden. Nur die oben genannten benutzen.
- Text in Handschrift ist breit: kurze Sätze, nicht zu viele Wörter pro Zeile.
`;
export const HDF_PROMPT = `Erstelle für mich ein Arbeitsblatt im Format HDF. Thema: [HIER DAS THEMA, KLASSE UND UMFANG EINTRAGEN]\n\nHalte dich genau an die folgende Format-Beschreibung und antworte nur mit dem fertigen Dokument in einem Codeblock.\n\n` + HDF_DOC;
export const HDF_EXAMPLE = `[titel]STools-Tour: alle Features[/titel]

Dieses Blatt zeigt jedes Element des Formats. Alles hier ist **Handschrift** (Text, Zahlen, Formeln) oder ein *perfekter Strich* (Linien, Achsen, Rahmen).

# 1. Text und Kästen

Markdown geht: **fett**, __unterstrichen__, ==markiert==, ~~durchgestrichen~~.

- Listen mit Strich
- noch ein Punkt

1. nummerierte Liste
2. zweiter Punkt

[beispiel]
Für f(x) = x^2 - 4 ist x = 2 eine Nullstelle.
[/beispiel]

[zitat]
quelle: Carl Friedrich Gauß
Die Mathematik ist die Königin der Wissenschaften.
[/zitat]

[spalten]
[spalte]
**Links:** Text in der linken Spalte.
[/spalte]
[spalte]
**Rechts:** und hier die rechte Spalte.
[/spalte]
[/spalten]

[trennlinie]

# 2. Formeln

Im Fließtext geht es auch: Die Funktion $f(x) = x^2 - 4$ hat die Nullstellen $x = 2$ und $x = -2$, und $frac(1, 2)$ ist die Hälfte.

[formel]
ausdruck: f(x) = (x^2 - 4x + 3) / (x + 1)
ausdruck: x_(1,2) = (-p ± sqrt(p^2 - 4q)) / 2
ausdruck: sqrt(x^2 + 1) + root(x + 1, 3)
ausdruck: int_0^1 x^2 dx = [x^3/3]_0^1 = 1/3
ausdruck: sum_(i=1)^n i = (n(n+1))/2
ausdruck: prod_(k=1)^n k = n!
ausdruck: lim_(x->0) (sin(x)/x) = 1
ausdruck: A = mat(1, 2; 3, 4)
ausdruck: v = vec(1, 2, 3)
ausdruck: f(x) = cases(x^2, x > 0; 0, x <= 0)
[/formel]

[gleichung]
zeile: 2x + 3 = 11
zeile: 2x = 8 | -3
zeile: x = 4 | :2
[/gleichung]

[rechenweg]
titel: Nullstellen von f(x) = x^2 - 4
schritt: x^2 - 4 = 0 | +4
schritt: x^2 = 4 | Wurzel ziehen
schritt: x_1 = 2 "und" x_2 = -2
[/rechenweg]

[bruch]
zaehler: a + b
nenner: 2
[/bruch]

[wurzel]
ausdruck: x^2 + 1
grad: 3
[/wurzel]

# 3. Tabellen

[tabelle]
kopf: Punkt | Original | Bild
zeile: A | $(2|2)$ | $(3|3)$
zeile: B | $(4|2)$ | $(7|3)$
[/tabelle]

[wertetabelle]
funktion: x^2 - 4
xvon: -3
xbis: 3
[/wertetabelle]

[seitenumbruch]

# 4. Koordinatensystem und Geometrie

[graph titel="Parabel und Gerade"]
xbereich: -4..4
ybereich: -5..6
funktion: x^2 - 4 | blau | name=f(x)
funktion: x + 1 | rot | gestrichelt | name=g(x)
punkt: 2 | 0 | N | kreis
nullstellen: ja
schnittpunkte: ja
legende: ja
[/graph]

[geometrie titel="Zentrische Streckung mit k = 2"]
xbereich: -1..9
ybereich: -1..9
figur: A(2,2) B(4,2) C(3,4) | blau | ABC
abbildung: ABC | streckung | zentrum=1,1 | faktor=2 | hilfslinien
[/geometrie]

[geometrie titel="Spiegelung an der y-Achse"]
xbereich: -6..6
ybereich: -1..6
figur: P(1,1) Q(4,1) R(3,4) | blau | PQR
abbildung: PQR | spiegelung | achse=y
[/geometrie]

[geometrie titel="Drehung um 90 Grad"]
xbereich: -4..6
ybereich: -4..6
figur: A(2,1) B(4,1) C(4,3) D(2,3) | blau | ABCD
abbildung: ABCD | drehung | zentrum=0,0 | winkel=90 | hilfslinien
kreis: 0,0 | 3 | grau
[/geometrie]

# 5. Diagramme

[diagramm titel="Lieblingsfächer"]
typ: balken
wert: Mathe | 12 | blau
wert: Deutsch | 8 | rot
wert: Sport | 15 | gruen
einheit: Schüler
[/diagramm]

[diagramm titel="Temperatur"]
typ: linie
kategorien: Mo, Di, Mi, Do, Fr
reihe: Berlin | blau | 3, 5, 4, 7, 6
reihe: Rom | rot | 12, 14, 13, 15, 16
[/diagramm]

[diagramm titel="Verkehrsmittel"]
typ: kreis
wert: Bus | 40 | blau
wert: Fahrrad | 25 | gruen
wert: Auto | 20 | rot
wert: Zu Fuß | 15 | orange
[/diagramm]

# 6. Schaubilder

[ablauf titel="Quadratische Gleichung lösen"]
knoten: s | Start | oval
knoten: d | Diskriminante D berechnen
knoten: q | D > 0 ? | raute
knoten: z | zwei Lösungen
knoten: k | keine Lösung
pfeil: s -> d -> q
pfeil: q -> z | ja
pfeil: q -> k | nein
[/ablauf]

[baum titel="Zweimal Münze werfen"]
pfeil: Start -> K | 0,5
pfeil: Start -> Z | 0,5
pfeil: K -> KK | 0,5
pfeil: K -> KZ | 0,5
pfeil: Z -> ZK | 0,5
pfeil: Z -> ZZ | 0,5
[/baum]

[mindmap]
zentrum: Funktionen
zweig: Linear | f(x)=mx+b; Gerade | blau
zweig: Quadratisch | Parabel; Scheitelpunkt | rot
zweig: Exponentiell | Wachstum | gruen
zweig: Trigonometrisch | Sinus; Kosinus | orange
[/mindmap]

[mengen titel="Sprachen in der Klasse"]
menge: Englisch | blau | Anna; Ben
menge: Französisch | rot | Cem; Dora
schnitt: A,B | Eli
[/mengen]

[zeitstrahl titel="Mathematiker"]
ereignis: 1707 | Euler geboren
ereignis: 1777 | Gauß geboren
ereignis: 1931 | Gödel
[/zeitstrahl]

[pyramide titel="Ernährung"]
stufe: Süßes | rot
stufe: Milch, Fleisch | orange
stufe: Obst, Gemüse | gruen
[/pyramide]

[kreislauf titel="Wasserkreislauf"]
stufe: Verdunstung | blau
stufe: Wolken | grau
stufe: Regen | tuerkis
stufe: Fluss | blau
[/kreislauf]

# 7. Chemie

[reaktion]
gleichung: 2 H2 + O2 -> 2 H2O | Knallgas
gleichung: CH4 + 2 O2 -> CO2 + 2 H2O
[/reaktion]

# 8. Aufgaben

[aufgabe]
nummer: 1
punkte: 3
Berechne die Nullstellen von f(x) = x^2 - 4 und zeichne den Graphen.
[/aufgabe]

[antwort]
hoehe: 30mm
kaestchen: ja
[/antwort]

[aufgabe]
nummer: 2
punkte: 2
Schreibe die Lösung auf Linien.
[/aufgabe]

[antwort]
linien: 3
[/antwort]
`;
