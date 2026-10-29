#!/usr/bin/env node
// pinsel png <file.pinsel|file.svg> [target.png] [--svg target.svg]
// Compiles pinsel to SVG and rasterizes it with headless Chrome. SVG files are only rasterized.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { compile } from './pinsel.js';
import { rasterize } from './raster.js';

function usage() {
  console.error('usage: pinsel png <file.pinsel|file.svg> [target.png] [--svg target.svg]');
  console.error('       pinsel svg <file.pinsel> [target.svg]');
  process.exit(2);
}

const [cmd, src, ...rest] = process.argv.slice(2);
if (!cmd || !src || !['png', 'svg'].includes(cmd)) usage();
if (!existsSync(src)) {
  console.error('file not found: ' + src);
  process.exit(1);
}
const text = readFileSync(src, 'utf8');
let svg;
if (src.endsWith('.svg')) svg = text;
else {
  const r = compile(text);
  if (!r.ok) {
    console.error('error line ' + r.error.line + ': ' + r.error.message);
    process.exit(1);
  }
  svg = r.svg;
}
const svgAt = rest.indexOf('--svg');
let svgTarget = null;
if (svgAt >= 0) { svgTarget = rest[svgAt + 1]; rest.splice(svgAt, 2); }
const base = src.replace(/\.(pinsel|svg)$/, '');
if (cmd === 'svg') {
  writeFileSync(rest[0] || base + '.svg', svg);
} else {
  if (svgTarget) writeFileSync(svgTarget, svg);
  const target = rest[0] || base + '.png';
  await rasterize(svg, target);
  console.log(target + ' (' + Math.round(svg.length / 1024) + ' KB svg)');
}
