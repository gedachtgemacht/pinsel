# Evaluation

All runs used Claude agents that only knew the spec. Each agent wrote a file, rendered it with `cli.js`, looked at the PNG and improved it. The runs happened in German, so the logs and the pinsel sources use the German keywords.

## SVG vs pinsel

[tasks.md](tasks.md) lists ten tasks. Four agents ran in parallel: two drew all ten in SVG, two in pinsel, at most four renders per image.

- `svg/`: SVG source, PNG, logs
- `pinsel/`: pinsel source, PNG, logs (with a closing line on what the spec was missing)

Quality came out about even. The pinsel sources total 62 KB, the SVG sources 3.8 MB, because the SVG agents generated their files with scripts.

## Watercolor

- `watercolor-filter/`: the ten pinsel images with `style watercolor` added and nothing else changed.
- `watercolor-1/`: six motifs painted as watercolors from the start, with the first watercolor renderer.
- `watercolor-2/`: the same six motifs by fresh agents after `wet`, `dry`, `reserve` and bleeding were added. The PNGs show the current renderer.

The logs end with a `RENDERER:` line. Those lines drove the next round of renderer work.

## Pages

```sh
node eval/pages.mjs
```

builds `compare.html`, `watercolor-filter.html` and `watercolor.html` for side-by-side viewing.
