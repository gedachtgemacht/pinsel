#!/usr/bin/env node
// MCP server for pinsel (stdio, one JSON-RPC message per line). Two tools:
//   guide  returns SPEC.md
//   paint  pinsel text in, PNG out (returned as an image and saved as a file)
// Images go to $PINSEL_DIR, otherwise <pictures folder>/pinsel.
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from './pinsel.js';
import { rasterize } from './raster.js';

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version;
const PREVIEW_MAX = 900 * 1024;

function picturesDir() {
  try {
    const d = execFileSync('xdg-user-dir', ['PICTURES'], { encoding: 'utf8' }).trim();
    if (d && d !== homedir()) return d;
  } catch {}
  return join(homedir(), 'Pictures');
}
const DIR = process.env.PINSEL_DIR || join(picturesDir(), 'pinsel');

const INSTRUCTIONS = 'pinsel paints images from text. Call `guide` once before the first image. ' +
  'Then draw with `paint`, look at the returned image critically and improve it with another `paint` call. ' +
  'For watercolor set `style watercolor` and follow the section "Painting with style watercolor".';

const TOOLS = [
  {
    name: 'guide',
    description: 'Returns the specification of the pinsel image format (one page). Read it before the first image.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'paint',
    description: 'Renders pinsel text to an image and returns it. Errors come back as "error line N: ...". ' +
      'Saves the PNG and the source in ' + DIR + '.',
    inputSchema: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Complete pinsel text, starting with "pinsel 1 <width> <height>".' },
        name: { type: 'string', description: 'File name without extension, like "mountain-lake". The same name overwrites the previous version.' },
      },
      required: ['source'],
      additionalProperties: false,
    },
  },
];

const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

function fileName(name) {
  const clean = String(name || '').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (clean) return clean;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return 'image-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

// Large PNGs (watercolor with paper grain) come back as a JPEG preview, the file stays PNG.
function preview(png) {
  if (statSync(png).size <= PREVIEW_MAX) return { data: readFileSync(png).toString('base64'), mimeType: 'image/png' };
  try {
    const jpg = execFileSync('magick', [png, '-quality', '88', 'jpg:-'], { maxBuffer: 32 * 1024 * 1024 });
    return { data: jpg.toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return { data: readFileSync(png).toString('base64'), mimeType: 'image/png' };
  }
}

async function paint(args) {
  if (typeof args.source !== 'string' || !args.source.trim()) return text('source missing', true);
  const r = compile(args.source);
  if (!r.ok) return text('error line ' + r.error.line + ': ' + r.error.message, true);
  mkdirSync(DIR, { recursive: true });
  const base = join(DIR, fileName(args.name));
  writeFileSync(base + '.pinsel', args.source.endsWith('\n') ? args.source : args.source + '\n');
  await rasterize(r.svg, base + '.png');
  const img = preview(base + '.png');
  return {
    content: [
      { type: 'image', ...img },
      { type: 'text', text: base + '.png (' + r.width + '×' + r.height + ', ' + Math.round(r.svg.length / 1024) + ' KB svg)' },
    ],
  };
}

async function handle(msg) {
  const { method, params = {} } = msg;
  if (method === 'initialize') {
    return {
      protocolVersion: params.protocolVersion || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'pinsel', version: VERSION },
      instructions: INSTRUCTIONS,
    };
  }
  if (method === 'ping') return {};
  if (method === 'tools/list') return { tools: TOOLS };
  if (method === 'tools/call') {
    if (params.name === 'guide') return text(readFileSync(join(here, 'SPEC.md'), 'utf8'));
    if (params.name === 'paint') return paint(params.arguments || {});
    throw Object.assign(new Error('unknown tool ' + params.name), { code: -32602 });
  }
  throw Object.assign(new Error('unknown method ' + method), { code: -32601 });
}

const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');

createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'not json' } });
    return;
  }
  if (msg.id === undefined) return; // notification
  try {
    send({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) });
  } catch (e) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } });
  }
});
