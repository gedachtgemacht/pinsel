// Rasterizes SVG to PNG with headless Chrome. Shared by cli.js and mcp.js.
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const run = promisify(execFile);
const CHROME = process.env.PINSEL_CHROME || 'google-chrome';

export function svgSize(svg) {
  const w = /<svg[^>]*\swidth="([\d.]+)/.exec(svg), h = /<svg[^>]*\sheight="([\d.]+)/.exec(svg);
  if (w && h) return [Math.round(+w[1]), Math.round(+h[1])];
  const vb = /viewBox="[\d.\s-]*?([\d.]+)\s+([\d.]+)"/.exec(svg);
  return vb ? [Math.round(+vb[1]), Math.round(+vb[2])] : [800, 600];
}

export async function rasterize(svg, target) {
  const [w, h] = svgSize(svg);
  const dir = mkdtempSync(join(tmpdir(), 'pinsel-'));
  try {
    const html = join(dir, 'b.html');
    const sized = svg.replace(/<svg\b/, '<svg style="display:block;width:' + w + 'px;height:' + h + 'px"');
    writeFileSync(html, '<!doctype html><html><body style="margin:0;background:#fff">' + sized + '</body></html>');
    await run(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--user-data-dir=' + join(dir, 'p'),
      '--screenshot=' + resolve(target), '--window-size=' + w + ',' + h, 'file://' + html], { timeout: 60000 });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
