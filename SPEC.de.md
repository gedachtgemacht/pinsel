# pinsel 1

Textformat für Bilder, gedacht zum Schreiben durch Sprachmodelle. Wird zu SVG übersetzt.

## Aufbau

```
pinsel 1 800 600          ; kopfzeile: breite hoehe (1 bis 4096)
seed 7                    ; zufall ist fest, gleicher seed = gleiches bild
licht oben-links kraft 0.6
stil aquarell             ; normal (standard) | aquarell: fransige kanten, pigmentrand, papier
farbe haut e8b48a         ; farbname festlegen
hintergrund verlauf 87b5e0 f3d9b1 90
...formen, teile, vorlagen
```

`;` beginnt einen Kommentar. Einrückung (Leerzeichen) bildet Blöcke. Spätere Zeilen malen über frühere.

## Formen

```
kreis x y r
ellipse x y rx ry
rechteck x y b h            ; x y = obere linke ecke
form x,y x,y x,y ...        ; geschlossene, GLATTE kurve durch alle punkte
linie x,y x,y ...           ; offener, glatter strich durch alle punkte
```

Bei `form` und `linie` legt der Renderer die Kurve selbst durch die Punkte, Kontrollpunkte gibt es nicht. Ein `!` hinter dem Punkt macht dort eine Ecke: `form 0,0! 100,0! 50,80` (zwei Ecken, unten rund). `ecken` als Eigenschaft macht alle Punkte zu Ecken.

## Eigenschaften (hinter den Zahlen, beliebige Reihenfolge)

```
farbe c                     ; füllung
verlauf c1 c2 [c3..] [grad] ; linear, grad 0 = links→rechts, 90 = oben→unten
radial c1 c2 [c3..]         ; von der mitte nach außen
rand c [breite]             ; umriss; ohne farbe/verlauf bleibt die form innen leer
breite a  |  breite a..b    ; nur linie: strichbreite, a..b läuft spitz zu
deckkraft 0..1
weich n                     ; weichzeichnen, n in pixeln (nebel, glühen, ferne)
schatten                    ; schlagschatten, weg vom licht
flach                       ; kein automatisches licht auf dieser form
textur art [dichte]         ; punkte | schraffur | striche | korn, dichte 1..10
texturfarbe c               ; sonst: füllfarbe dunkler
drehung grad                ; um die mitte der form
rund r                      ; nur rechteck: eckenradius
ecken                       ; nur form/linie
nass                        ; aquarell: nass in nass, weicher fransiger umriss, farbe fließt
trocken                     ; aquarell: trockenpinsel, strich bricht im papierkorn auf
aussparen                   ; holt das papierweiß zurück (farbe und licht entfallen)
```

Farben: `rrggbb`, `#rrggbb` oder ein Farbname. `papier` ist vordefiniert (f8f4ec). `+n`/`-n` hellt auf oder dunkelt ab, in Prozent, auch als Rechnung: `haut-25`, `ff0000+10`, `laub+z*20`.

## Licht

`licht <richtung> [kraft 0..1]` mit richtung `oben`, `unten`, `links`, `rechts`, `oben-links`, `oben-rechts`, `unten-links`, `unten-rechts` oder `aus`. Jede gefüllte `form`, `kreis`, `ellipse`, `rechteck` bekommt dann eine Glanzseite zum Licht und eine Schattenseite davon weg. Das gilt auch in gedrehten Teilen. `linie` bleibt ohne Licht.

## Kinder einer Form

Eingerückte Zeilen unter einer Form werden auf diese Form zugeschnitten. So bleiben Muster, Flecken und Falten innen:

```
kreis 200 200 80 farbe e0a050
  linie 120,180 280,200 breite 6 farbe e0a050-30
```

## Teile

```
teil kopf 400 260 [skala s] [drehung grad] [spiegel] [kopfueber] [symmetrisch] [deckkraft a] [weich n]
  kreis 0 0 60 farbe haut
```

Alles darin zählt ab dem eigenen Nullpunkt (400,260). `spiegel` spiegelt waagerecht, `kopfueber` senkrecht (Spiegelungen im Wasser). `symmetrisch` malt den Inhalt zusätzlich gespiegelt an x=0, gut für Gesichter und Flügel: ein Auge bei `-20 0` reicht.

## Vorlagen, Wiederholung, Streuen

```
vorlage baum h=80 c=3f6b3a
  linie 0,0 0,-h breite 8..3 farbe 5a3d2a
  kreis 0 -h h/3 farbe c textur striche 4

nutze baum 100 500 h=120 [skala s] [drehung grad] [spiegel] [deckkraft a]
streue baum 40 bereich 0 380 800 120 [skala 0.6..1.2] [tiefe] [deckkraft a] [h=90]
streue baum 25 entlang 0,420 300,380 800,410 [skala ...]
wiederhole i 12
  kreis 40+i*60 300 10 farbe ffffff
```

Parameter haben Standardwerte und dürfen Zahlen oder Farben sein (sechs Ziffern wie `000000` gelten als Farbe). Parameter- und Farbnamen dürfen keine Schlüsselwörter sein. `vorlage` steht nur ganz außen. Zahlen dürfen Rechnungen ohne Leerzeichen sein: `h/3`, `-h*0.5`, `(i+1)*20`, `sin(i*30)*50`, `zuf(5,15)` (Zufall aus dem Seed, auch `random`). In jeder Vorlage gibt es `z`, eine feste Zufallszahl 0..1 pro Exemplar. `streue` sortiert nach y: weiter unten heißt weiter vorn. `tiefe` macht weiter oben Liegendes kleiner und blasser.

## Malen für `stil aquarell`

- Hell nach dunkel: zuerst große, helle Lasuren, dann Mitteltöne, zuletzt wenige dunkle Akzente.
- Das Papier ist das Weiß. Lichter aussparen statt weiß übermalen, den Hintergrund hell halten.
- Nie schwarz und nie ganzflächig dunkel. Nacht ist tiefes Blau oder Violett mit warmen Lichtinseln.
- Wenige Farben, vier bis sechs Farbnamen, Abstufungen über `+`/`-`.
- Andeuten statt ausmalen: große Formen, ein Blickpunkt, Details nur dort. Ferne Dinge blasser und weicher (`weich`, `deckkraft`).
- `nass` für Himmel, Wolken, Nebel, Wasser, Lichtschein und alles Ferne. Scharfe Kanten nur am Blickpunkt.
- Lichter mit `aussparen` herausholen (Glanz auf Wasser, Lichtkegel, Schnee), `trocken` für Glitzern, Gras, Fell, Regen.
- Helle Farben bekommen automatisch keinen dunklen Rand, `weich` wirkt wie `nass`.
- Nasse Formen direkt hintereinander laufen ineinander wie nass in nass gemalt. Himmel aus zwei, drei überlappenden nassen Bändern, Lichtschein nass auf nasser Wand.
- Der Stil bringt Körnung, Ränder und Papier selbst mit. `textur` sparsam, `licht` mit `kraft 0.3` bis `0.5`.

## Grenzen

Höchstens 4000 Zeilen, 500 Exemplare pro `streue`/`wiederhole`, Verschachtelung 12 tief. Fehler nennen Zeile und Grund.

Die englischen Schlüsselwörter aus [SPEC.md](SPEC.md) gelten genauso und lassen sich mischen.
