# pinsel 1

A text format for images, made to be written by language models. Compiles to SVG.

## Structure

```
pinsel 1 800 600          ; first line: width height (1 to 4096)
seed 7                    ; randomness is fixed, same seed = same image
light top-left strength 0.6
style watercolor          ; normal (default) | watercolor: ragged edges, pigment rim, paper
color skin e8b48a         ; define a color name
background gradient 87b5e0 f3d9b1 90
...shapes, parts, templates
```

`;` starts a comment. Indentation (spaces) forms blocks. Later lines paint over earlier ones.

## Shapes

```
circle x y r
ellipse x y rx ry
rect x y w h                ; x y = top left corner
shape x,y x,y x,y ...       ; closed, SMOOTH curve through all points
line x,y x,y ...            ; open, smooth stroke through all points
```

For `shape` and `line` the renderer lays the curve through the points itself, there are no control points. A `!` after a point makes a corner there: `shape 0,0! 100,0! 50,80` (two corners, round at the bottom). The attribute `corners` turns every point into a corner.

## Attributes (after the numbers, any order)

```
color c                       ; fill
gradient c1 c2 [c3..] [deg]   ; linear, deg 0 = left→right, 90 = top→bottom
radial c1 c2 [c3..]           ; from the center outwards
stroke c [width]              ; outline; without color/gradient the shape stays hollow
width a  |  width a..b        ; line only: stroke width, a..b tapers
opacity 0..1
soft n                        ; blur, n in pixels (fog, glow, distance)
shadow                        ; drop shadow, away from the light
flat                          ; no automatic light on this shape
texture kind [density]        ; dots | hatch | strokes | grain, density 1..10
texturecolor c                ; otherwise: fill color, darker
rotate deg                    ; around the center of the shape
radius r                      ; rect only: corner radius
corners                       ; shape/line only
wet                           ; watercolor: wet in wet, soft ragged outline, the paint flows
dry                           ; watercolor: dry brush, the stroke breaks up in the paper grain
reserve                       ; brings back the white of the paper (color and light are dropped)
```

Colors: `rrggbb`, `#rrggbb` or a color name. `paper` is predefined (f8f4ec). `+n`/`-n` lightens or darkens in percent, also as an expression: `skin-25`, `ff0000+10`, `leaf+z*20`.

## Light

`light <direction> [strength 0..1]` with direction `top`, `bottom`, `left`, `right`, `top-left`, `top-right`, `bottom-left`, `bottom-right` or `off`. Every filled `shape`, `circle`, `ellipse`, `rect` then gets a lit side towards the light and a shaded side away from it. This also holds inside rotated parts. `line` stays unlit.

## Children of a shape

Indented lines under a shape are clipped to that shape. Patterns, spots and folds stay inside:

```
circle 200 200 80 color e0a050
  line 120,180 280,200 width 6 color e0a050-30
```

## Parts

```
part head 400 260 [scale s] [rotate deg] [mirror] [flip] [symmetric] [opacity a] [soft n]
  circle 0 0 60 color skin
```

Everything inside counts from the part's own origin (400,260). `mirror` flips horizontally, `flip` vertically (reflections in water). `symmetric` also paints the content mirrored at x=0, good for faces and wings: one eye at `-20 0` is enough.

## Templates, repetition, scattering

```
template tree h=80 c=3f6b3a
  line 0,0 0,-h width 8..3 color 5a3d2a
  circle 0 -h h/3 color c texture strokes 4

use tree 100 500 h=120 [scale s] [rotate deg] [mirror] [opacity a]
scatter tree 40 area 0 380 800 120 [scale 0.6..1.2] [depth] [opacity a] [h=90]
scatter tree 25 along 0,420 300,380 800,410 [scale ...]
repeat i 12
  circle 40+i*60 300 10 color ffffff
```

Parameters have default values and may be numbers or colors (six digits like `000000` count as a color). Parameter and color names must not be keywords. `template` only works at the top level. Numbers may be expressions without spaces: `h/3`, `-h*0.5`, `(i+1)*20`, `sin(i*30)*50`, `random(5,15)` (randomness from the seed). Every template has `z`, a fixed random number 0..1 per instance. `scatter` sorts by y: further down means further in front. `depth` makes things further up smaller and paler.

## Painting with `style watercolor`

- Light to dark: first large, light washes, then mid tones, finally a few dark accents.
- The paper is the white. Reserve the lights instead of painting white over them, keep the background light.
- Never black and never dark all over. Night is deep blue or violet with warm islands of light.
- Few colors, four to six color names, shades via `+`/`-`.
- Suggest instead of filling in: large shapes, one focal point, details only there. Distant things paler and softer (`soft`, `opacity`).
- `wet` for sky, clouds, fog, water, glow and everything far away. Sharp edges only at the focal point.
- Bring out lights with `reserve` (glints on water, light beams, snow), `dry` for sparkle, grass, fur, rain.
- Light colors automatically get no dark rim, `soft` behaves like `wet`.
- Wet shapes directly after each other bleed into each other as if painted wet in wet. A sky from two or three overlapping wet bands, a glow wet on a wet wall.
- The style brings its own granulation, edges and paper. Use `texture` sparingly, `light` with `strength 0.3` to `0.5`.

## Limits

At most 4000 lines, 500 instances per `scatter`/`repeat`, nesting 12 deep. Errors name the line and the reason.

The original German keywords (`kreis`, `farbe`, `nass`, …) are accepted as well, see [SPEC.de.md](SPEC.de.md).
