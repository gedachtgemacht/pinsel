// Builds the comparison pages in eval/ (not checked in):
//   compare.html          SVG next to pinsel, same ten tasks
//   watercolor-filter.html  the ten pinsel images, plain and with style watercolor
//   watercolor.html       six motifs painted as watercolors, round 1 next to round 2
// Usage: node eval/pages.mjs
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const tasks = readFileSync(join(here, 'tasks.md'), 'utf8').trim().split('\n').map((l) => [l.slice(0, 2), l.slice(3)]);
const motifs = [
  ['k1', 'A mountain lake in morning mist'], ['k2', 'Fishing boats in the harbor in the early morning'],
  ['k3', 'A fox in the snow at dusk'], ['k4', 'An old town alley at night with street lamps'],
  ['k5', 'A poppy field in the wind under a summer sky'], ['k6', 'A cat asleep on a windowsill, rain outside'],
];

function logs(dir) {
  const map = {};
  for (const f of ['log-a.txt', 'log-b.txt']) {
    const p = join(here, dir, f);
    if (!existsSync(p)) continue;
    for (const l of readFileSync(p, 'utf8').split('\n')) {
      const m = /^(k?\d+)\s+(.*)$/.exec(l.trim());
      if (m) map[m[1]] = m[2];
    }
  }
  return map;
}

function figure(dir, id, label, note = '') {
  const png = join(here, dir, id + '.png');
  if (!existsSync(png)) return '<figure><div class="missing">missing</div></figure>';
  return '<figure><img src="' + dir + '/' + id + '.png" alt=""><figcaption><b>' + label + '</b>' + (note ? ' · ' + esc(note) : '') + '</figcaption></figure>';
}

function size(dir, id, ext) {
  const p = join(here, dir, id + '.' + ext);
  return existsSync(p) ? (statSync(p).size / 1024).toFixed(1) + ' KB' : '';
}

function page(file, title, sections) {
  writeFileSync(join(here, file), `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>
body{margin:0;padding:24px 16px;font:15px/1.45 system-ui,sans-serif;background:#efede8;color:#1d1d1f}
h1{font-size:20px;margin:0 0 20px}h2{font-size:15px;margin:28px 0 8px;font-weight:600}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:14px}figure{margin:0}img{width:100%;display:block;box-shadow:0 1px 6px rgba(0,0,0,.12)}
figcaption{font-size:12.5px;color:#555;margin-top:4px}.missing{aspect-ratio:4/3;display:grid;place-items:center;background:#ddd}
@media(max-width:700px){.pair{grid-template-columns:1fr}}
</style></head><body><h1>${title}</h1>
${sections.join('\n')}
</body></html>
`);
  console.log('eval/' + file);
}

const L = { svg: logs('svg'), pinsel: logs('pinsel') };
page('compare.html', 'SVG vs pinsel', tasks.map(([nr, t]) => '<section><h2>' + nr + ' ' + esc(t) + '</h2><div class="pair">' +
  figure('svg', nr, 'svg ' + size('svg', nr, 'svg'), L.svg[nr]) + figure('pinsel', nr, 'pinsel ' + size('pinsel', nr, 'pinsel'), L.pinsel[nr]) + '</div></section>'));
page('watercolor-filter.html', 'pinsel: plain and style watercolor', tasks.map(([nr, t]) => '<section><h2>' + nr + ' ' + esc(t) + '</h2><div class="pair">' +
  figure('pinsel', nr, 'plain') + figure('watercolor-filter', nr, 'style watercolor') + '</div></section>'));
page('watercolor.html', 'pinsel watercolors', motifs.map(([k, t]) => '<section><h2>' + esc(t) + '</h2><div class="pair">' +
  figure('watercolor-1', k, 'round 1') + figure('watercolor-2', k, 'round 2: wet, dry, reserve, bleeding') + '</div></section>'));
