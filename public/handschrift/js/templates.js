// Vorlagenbibliothek: fertige HDF-Blätter zum Überschreiben. Jede Vorlage ist ein ausgefülltes Beispiel,
// das in deiner Handschrift gesetzt wird. Text ändern, Zeilen löschen oder ergänzen, fertig.
const KAR = { paper: 'gnkar', fmt: 'gn', paperColor: 'weiss', scan: false, size: 18, ml: 110, mr: 70, mt: 60, mb: 50 };
const LIN = { paper: 'gnlin', fmt: 'gn', paperColor: 'weiss', scan: false, size: 18, ml: 110, mr: 70, mt: 60, mb: 50 };

const KOPF = `[tabelle]
kopf: Name | Datum | Klasse
zeile: | |
[/tabelle]
`;

export const TEMPLATE_CATS = [['alle', 'Alle'], ['mathe', 'Mathe'], ['lernen', 'Lernen'], ['alltag', 'Alltag']];

export const TEMPLATES = [
  // ---------------- Mathe ----------------
  { id: 'rechenweg', cat: 'mathe', title: 'Rechenweg-Blatt', desc: 'Aufgaben mit Rechenweg und Antwortfeld auf Karopapier', s: KAR, text: `[titel]Rechenwege[/titel]

${KOPF}
[aufgabe]
nummer: 1
punkte: 3
Berechne und gib jeden Schritt an.
[/aufgabe]

[rechenweg]
schritt: 3x + 5 = 20 | -5
schritt: 3x = 15 | :3
schritt: x = 5
[/rechenweg]

[aufgabe]
nummer: 2
punkte: 4
Löse die Gleichung $2(x - 3) = x + 4$.
[/aufgabe]

[antwort]
hoehe: 45mm
kaestchen: ja
[/antwort]

[aufgabe]
nummer: 3
punkte: 3
Berechne $frac(3, 4) + frac(1, 6)$.
[/aufgabe]

[antwort]
hoehe: 45mm
kaestchen: ja
[/antwort]
` },

  { id: 'gleichungen', cat: 'mathe', title: 'Gleichungen lösen', desc: 'Äquivalenzumformungen Zeile für Zeile mit Randnotiz', s: KAR, text: `[titel]Gleichungen lösen[/titel]

Eine Gleichung bleibt wahr, wenn man auf **beiden Seiten** dasselbe macht.

[gleichung]
zeile: 4x - 7 = 2x + 9 | -2x
zeile: 2x - 7 = 9 | +7
zeile: 2x = 16 | :2
zeile: x = 8
[/gleichung]

Probe: $4 * 8 - 7 = 25$ und $2 * 8 + 9 = 25$. Stimmt.

[ueberschrift]Aufgaben[/ueberschrift]

[aufgabe]
nummer: 1
Löse: $5x + 3 = 2x + 18$
[/aufgabe]

[antwort]
hoehe: 40mm
kaestchen: ja
[/antwort]

[aufgabe]
nummer: 2
Löse: $3(x + 2) = 21$
[/aufgabe]

[antwort]
hoehe: 40mm
kaestchen: ja
[/antwort]
` },

  { id: 'quadratisch', cat: 'mathe', title: 'Quadratische Gleichungen', desc: 'pq-Formel mit Rechenweg, Probe und Graph', s: KAR, text: `[titel]Quadratische Gleichungen[/titel]

[ueberschrift]pq-Formel[/ueberschrift]

Für $x^2 + p x + q = 0$ gilt:

[formel]
ausdruck: x_(1,2) = -p/2 ± sqrt((p/2)^2 - q)
[/formel]

[beispiel]
titel: Beispiel
Löse $x^2 - 4x + 3 = 0$. Hier ist $p = -4$ und $q = 3$.
[/beispiel]

[rechenweg]
schritt: x_(1,2) = 2 ± sqrt(2^2 - 3)
schritt: x_(1,2) = 2 ± sqrt(1)
schritt: x_(1,2) = 2 ± 1
schritt: x_1 = 3 "und" x_2 = 1
[/rechenweg]

[graph titel="Parabel mit Nullstellen"]
xbereich: -1..5
ybereich: -2..6
funktion: x^2 - 4x + 3 | blau | name=f(x)
nullstellen: ja
extrema: ja
[/graph]

[aufgabe]
nummer: 1
Löse $x^2 + 2x - 8 = 0$.
[/aufgabe]

[antwort]
hoehe: 45mm
kaestchen: ja
[/antwort]
` },

  { id: 'kurvendiskussion', cat: 'mathe', title: 'Funktionsuntersuchung', desc: 'Nullstellen, Extrema und Graph einer Funktion Schritt für Schritt', s: KAR, text: `[titel]Funktionsuntersuchung[/titel]

Gegeben ist $f(x) = x^3 - 3x$.

[ueberschrift]1. Ableitungen[/ueberschrift]

[formel]
ausdruck: f'(x) = 3x^2 - 3
ausdruck: f''(x) = 6x
[/formel]

[ueberschrift]2. Nullstellen[/ueberschrift]

[rechenweg]
schritt: x^3 - 3x = 0
schritt: x(x^2 - 3) = 0 | x ausklammern
schritt: x_1 = 0 "oder" x_(2,3) = ± sqrt(3)
[/rechenweg]

[ueberschrift]3. Extremstellen[/ueberschrift]

[rechenweg]
schritt: 3x^2 - 3 = 0 | f'(x) = 0
schritt: x^2 = 1 | :3 und +3
schritt: x = ± 1
[/rechenweg]

Mit $f''(1) = 6 > 0$ liegt bei $x = 1$ ein Tiefpunkt $T(1|-2)$, mit $f''(-1) = -6 < 0$ bei $x = -1$ ein Hochpunkt $H(-1|2)$.

[ueberschrift]4. Graph[/ueberschrift]

[graph]
xbereich: -3..3
ybereich: -4..4
funktion: x^3 - 3x | blau | name=f(x)
nullstellen: ja
extrema: ja
[/graph]
` },

  { id: 'geometrie', cat: 'mathe', title: 'Geometrie-Konstruktion', desc: 'Figur im Koordinatensystem spiegeln, drehen oder strecken', s: KAR, text: `[titel]Abbildungen im Koordinatensystem[/titel]

Spiegle das Dreieck $A B C$ an der y-Achse.

[geometrie]
xbereich: -6..6
ybereich: -1..6
figur: A(1,1) B(4,1) C(2,4) | blau | ABC
abbildung: ABC | spiegelung | achse=y | hilfslinien
[/geometrie]

[aufgabe]
nummer: 1
Gib die Koordinaten der Bildpunkte an.
[/aufgabe]

[tabelle]
kopf: Punkt | Bildpunkt
zeile: A(1|1) | A'
zeile: B(4|1) | B'
zeile: C(2|4) | C'
[/tabelle]

[aufgabe]
nummer: 2
Strecke das Dreieck mit Zentrum $Z(0|0)$ und Faktor 2.
[/aufgabe]
` },

  { id: 'formelsammlung', cat: 'mathe', title: 'Formelsammlung', desc: 'Binomische Formeln, Potenzen, Flächen und Satz des Pythagoras', s: KAR, text: `[titel]Formelsammlung[/titel]

[ueberschrift]Binomische Formeln[/ueberschrift]

[gruppe]
rand: ja
[formel]
ausdruck: (a + b)^2 = a^2 + 2ab + b^2
ausdruck: (a - b)^2 = a^2 - 2ab + b^2
ausdruck: (a + b)(a - b) = a^2 - b^2
[/formel]
[/gruppe]

[ueberschrift]Potenzgesetze[/ueberschrift]

[gruppe]
rand: ja
[formel]
ausdruck: a^m * a^n = a^(m+n)
ausdruck: a^m / a^n = a^(m-n)
ausdruck: (a^m)^n = a^(m*n)
[/formel]
[/gruppe]

[ueberschrift]Flächen[/ueberschrift]

[gruppe]
rand: ja
Rechteck: $A = a * b$

Dreieck: $A = frac(1, 2) * g * h$

Kreis: $A = pi r^2$ und $U = 2 pi r$
[/gruppe]

[ueberschrift]Satz des Pythagoras[/ueberschrift]

[gruppe]
rand: ja
[formel]
ausdruck: a^2 + b^2 = c^2
[/formel]
[/gruppe]
` },

  { id: 'wertetabelle', cat: 'mathe', title: 'Wertetabelle und Graph', desc: 'Funktionswerte berechnen lassen und den Graphen zeichnen', s: KAR, text: `[titel]Wertetabelle und Graph[/titel]

Funktion: $f(x) = 0,5 x^2 - 2$

[wertetabelle]
funktion: 0.5x^2 - 2
xvon: -4
xbis: 4
schritt: 1
kopf: x | f(x)
[/wertetabelle]

[graph]
xbereich: -5..5
ybereich: -3..7
funktion: 0.5x^2 - 2 | blau | name=f(x)
nullstellen: ja
[/graph]

[aufgabe]
nummer: 1
Lies am Graphen die Nullstellen ab.
[/aufgabe]

[antwort]
hoehe: 20mm
linien: 2
[/antwort]
` },

  { id: 'statistik', cat: 'mathe', title: 'Daten und Diagramme', desc: 'Urliste, Tabelle und Säulendiagramm', s: KAR, text: `[titel]Daten auswerten[/titel]

Eine Klasse wurde nach ihrem Lieblingsfach gefragt.

[tabelle]
kopf: Fach | Anzahl
zeile: Mathe | 6
zeile: Sport | 9
zeile: Kunst | 4
zeile: Deutsch | 5
[/tabelle]

[diagramm titel="Lieblingsfächer"]
typ: balken
wert: Mathe | 6 | blau
wert: Sport | 9 | gruen
wert: Kunst | 4 | orange
wert: Deutsch | 5 | rot
einheit: Schüler
[/diagramm]

[aufgabe]
nummer: 1
Wie viele Schüler wurden befragt? Wie viel Prozent mögen Sport?
[/aufgabe]

[antwort]
hoehe: 35mm
kaestchen: ja
[/antwort]
` },

  // ---------------- Lernen ----------------
  { id: 'lernzettel', cat: 'lernen', title: 'Lernzettel', desc: 'Überschrift, Kernaussagen, Beispiel und Merksatz', s: KAR, text: `[titel]Thema der Stunde[/titel]

${KOPF}
[ueberschrift]Das Wichtigste in Kürze[/ueberschrift]

Hier steht in zwei, drei Sätzen, worum es geht. **Wichtige Begriffe** werden fett, ==Merksätze== markiert.

- Erster Punkt
- Zweiter Punkt
- Dritter Punkt

[beispiel]
titel: Beispiel
Ein kurzes Beispiel, das den Begriff erklärt.
[/beispiel]

[ueberschrift]Merke[/ueberschrift]

==Der wichtigste Satz des Blattes, den man am Ende noch weiß.==

[trennlinie]

[ueberschrift]Fragen zum Wiederholen[/ueberschrift]

1. Was ist die Kernaussage?
2. Welches Beispiel passt dazu?
3. Wo wende ich das an?
` },

  { id: 'vokabeln', cat: 'lernen', title: 'Vokabelheft', desc: 'Tabelle mit Wort, Übersetzung und Beispielsatz', s: KAR, text: `[titel]Vokabeln Unit 1[/titel]

[tabelle]
kopf: Deutsch | Englisch | Beispielsatz
zeile: der Hund | dog | I have a dog.
zeile: die Katze | cat | The cat is black.
zeile: das Haus | house | This is my house.
zeile: lernen | to learn | I learn English.
zeile: | |
zeile: | |
zeile: | |
zeile: | |
zeile: | |
zeile: | |
[/tabelle]
` },

  { id: 'karteikarten', cat: 'lernen', title: 'Karteikarten', desc: 'Frage und Antwort in Rahmen, zum Ausdrucken und Abfragen', s: KAR, text: `[titel]Karteikarten[/titel]

[gruppe]
rand: ja
**Frage:** Wofür steht die Abkürzung CPU?

**Antwort:** Central Processing Unit, der Hauptprozessor.
[/gruppe]

[abstand hoehe="6mm"]

[gruppe]
rand: ja
**Frage:** Wie lautet die Formel für die Fläche eines Kreises?

**Antwort:** $A = pi r^2$
[/gruppe]

[abstand hoehe="6mm"]

[gruppe]
rand: ja
**Frage:** Welches ist das chemische Zeichen für Gold?

**Antwort:** Au
[/gruppe]

[abstand hoehe="6mm"]

[gruppe]
rand: ja
**Frage:** Deine eigene Frage

**Antwort:** Deine eigene Antwort
[/gruppe]
` },

  { id: 'cornell', cat: 'lernen', title: 'Cornell-Notizen', desc: 'Stichwörter links, Notizen rechts, Zusammenfassung unten', s: KAR, text: `[titel]Thema[/titel]

${KOPF}
[spalten]
abstand: 6mm
[spalte]
breite: 30%
**Stichwörter**

- Frage 1
- Frage 2
- Frage 3
[/spalte]
[spalte]
breite: 70%
**Notizen**

Hier stehen die Mitschrift und die Erklärungen zu den Stichwörtern.

Wichtige Formel: $E = m c^2$
[/spalte]
[/spalten]

[trennlinie]

[ueberschrift]Zusammenfassung[/ueberschrift]

[antwort]
hoehe: 30mm
linien: 3
[/antwort]
` },

  { id: 'mindmap', cat: 'lernen', title: 'Mindmap', desc: 'Thema in der Mitte, Zweige mit Unterpunkten', s: KAR, text: `[titel]Mindmap[/titel]

[mindmap]
zentrum: Mein Thema
zweig: Ursachen | Erster Grund; Zweiter Grund | blau
zweig: Folgen | Kurzfristig; Langfristig | rot
zweig: Beispiele | Beispiel A; Beispiel B | gruen
zweig: Begriffe | Begriff 1; Begriff 2 | orange
[/mindmap]
` },

  { id: 'zeitstrahl', cat: 'lernen', title: 'Zeitstrahl', desc: 'Ereignisse im richtigen Abstand auf einem Strahl', s: KAR, text: `[titel]Zeitstrahl[/titel]

[zeitstrahl]
ereignis: 1789 | Beginn der Französischen Revolution | rot
ereignis: 1815 | Wiener Kongress | blau
ereignis: 1871 | Gründung des Deutschen Reichs | gruen
ereignis: 1914 | Beginn des Ersten Weltkriegs | rot
ereignis: 1949 | Gründung der Bundesrepublik | blau
[/zeitstrahl]

[aufgabe]
nummer: 1
Ordne drei weitere Ereignisse ein.
[/aufgabe]

[antwort]
hoehe: 30mm
linien: 3
[/antwort]
` },

  { id: 'ablauf', cat: 'lernen', title: 'Ablaufdiagramm', desc: 'Flussdiagramm mit Start, Entscheidung und Ende', s: KAR, text: `[titel]Ablauf[/titel]

[ablauf]
richtung: runter
knoten: s | Start | oval
knoten: a | Zahl eingeben | rechteck
knoten: e | Zahl > 0? | raute
knoten: j | Positiv | rechteck
knoten: n | Negativ oder null | rechteck
knoten: z | Ende | oval
pfeil: s -> a -> e
pfeil: e -> j | ja
pfeil: e -> n | nein
pfeil: j -> z
pfeil: n -> z
[/ablauf]
` },

  { id: 'venn', cat: 'lernen', title: 'Vergleich (Venn-Diagramm)', desc: 'Zwei Dinge vergleichen: Unterschiede und Gemeinsamkeiten', s: KAR, text: `[titel]Vergleich[/titel]

[mengen]
menge: Katzen | blau | schnurren; klettern; Krallen
menge: Hunde | rot | bellen; Gassi gehen; Leine
schnitt: A,B | Haustiere; Fell; vier Beine
[/mengen]
` },

  { id: 'chemie', cat: 'lernen', title: 'Chemie: Reaktionsgleichungen', desc: 'Reaktionsgleichungen mit tiefgestellten Zahlen und Hinweisen', s: KAR, text: `[titel]Reaktionsgleichungen[/titel]

${KOPF}
[ueberschrift]Beispiele[/ueberschrift]

[reaktion]
gleichung: 2 H2 + O2 -> 2 H2O | Knallgasreaktion
gleichung: C + O2 -> CO2 | Verbrennung von Kohlenstoff
gleichung: 2 Na + 2 H2O -> 2 NaOH + H2 | Natrium in Wasser
[/reaktion]

[aufgabe]
nummer: 1
Stelle die Reaktionsgleichung für die Verbrennung von Magnesium auf.
[/aufgabe]

[antwort]
hoehe: 25mm
kaestchen: ja
[/antwort]
` },

  // ---------------- Alltag ----------------
  { id: 'brief', cat: 'alltag', title: 'Brief', desc: 'Absender, Datum, Betreff, Anrede und Grußformel', s: LIN, text: `Max Mustermann
Beispielstraße 1
12345 Beispielstadt

Beispielstadt, den 21. November 2026

**Betreff: Hier steht der Betreff**

Sehr geehrte Damen und Herren,

hier beginnt der Brieftext. Schreibe in kurzen Absätzen und komm gleich zum Punkt. Im zweiten Satz steht, worum du bittest oder was du mitteilen willst. Vielen Dank für Ihre Mühe.

Mit freundlichen Grüßen

Max Mustermann
` },

  { id: 'stundenplan', cat: 'alltag', title: 'Stundenplan', desc: 'Wochenplan mit sechs Stunden und fünf Tagen', s: KAR, text: `[titel]Stundenplan[/titel]

[tabelle]
kopf: Stunde | Mo | Di | Mi | Do | Fr
zeile: 1 | | | | |
zeile: 2 | | | | |
zeile: 3 | | | | |
zeile: 4 | | | | |
zeile: 5 | | | | |
zeile: 6 | | | | |
[/tabelle]
` },

  { id: 'todo', cat: 'alltag', title: 'To-do-Liste', desc: 'Aufgaben mit Frist und Platz zum Abhaken', s: LIN, text: `[titel]To-do[/titel]

[tabelle]
kopf: Aufgabe | Bis wann | Erledigt
zeile: Hausaufgaben Mathe | Mittwoch |
zeile: Referat vorbereiten | Freitag |
zeile: | |
zeile: | |
zeile: | |
zeile: | |
zeile: | |
zeile: | |
[/tabelle]
` },

  { id: 'einkauf', cat: 'alltag', title: 'Einkaufsliste', desc: 'Artikel und Menge, nach Bedarf erweitern', s: LIN, text: `[titel]Einkaufsliste[/titel]

[tabelle]
kopf: Artikel | Menge
zeile: Milch | 2 l
zeile: Brot | 1
zeile: Äpfel | 6
zeile: |
zeile: |
zeile: |
zeile: |
zeile: |
[/tabelle]
` },

  { id: 'tagebuch', cat: 'alltag', title: 'Tagebuch', desc: 'Seite mit Datum, Stimmung und freiem Text', s: LIN, text: `[titel]Samstag, 21. November[/titel]

**Wetter:** sonnig, kalt

**Das war heute gut:** Hier steht, was gut war.

**Das möchte ich morgen:** Hier steht, was ich vorhabe.

[trennlinie]

Heute habe ich viel gelernt. Zuerst ist mir aufgefallen, dass die Tage kürzer werden. Danach habe ich mich mit Freunden getroffen und wir haben zusammen gespielt.
` },
];
