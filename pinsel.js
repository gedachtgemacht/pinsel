// pinsel. Compiler for the "pinsel 1" image format to SVG.
// Pure functions, no dependencies, runs in Node and in the browser.

export const VERSION = 1;
const MAX_SIZE = 4096;
const MAX_LINES = 4000;
const MAX_COUNT = 500;
const MAX_DEPTH = 12;
const MAX_ELEMENTS = 200000;

// English keywords are the primary spelling. The original German keywords are still accepted;
// internally everything runs on the German names.
const EN = {
  light: 'licht', strength: 'kraft', color: 'farbe', background: 'hintergrund', style: 'stil', watercolor: 'aquarell',
  paper: 'papier', circle: 'kreis', rect: 'rechteck', shape: 'form', line: 'linie', gradient: 'verlauf', stroke: 'rand',
  width: 'breite', opacity: 'deckkraft', soft: 'weich', shadow: 'schatten', flat: 'flach', texture: 'textur',
  texturecolor: 'texturfarbe', rotate: 'drehung', radius: 'rund', corners: 'ecken', wet: 'nass', dry: 'trocken',
  reserve: 'aussparen', dots: 'punkte', hatch: 'schraffur', strokes: 'striche', grain: 'korn', part: 'teil',
  scale: 'skala', mirror: 'spiegel', flip: 'kopfueber', symmetric: 'symmetrisch', template: 'vorlage', use: 'nutze',
  scatter: 'streue', area: 'bereich', along: 'entlang', depth: 'tiefe', repeat: 'wiederhole',
  top: 'oben', bottom: 'unten', left: 'links', right: 'rechts', 'top-left': 'oben-links', 'top-right': 'oben-rechts',
  'bottom-left': 'unten-links', 'bottom-right': 'unten-rechts', off: 'aus',
};
const DE = Object.fromEntries(Object.entries(EN).map(([e, d]) => [d, e]));
const en = (k) => DE[k] || k;

class PinselError extends Error {
  constructor(line, message) {
    super(message);
    this.line = line;
  }
}
const fail = (line, message) => { throw new PinselError(line, message); };

// ---------- randomness ----------

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- lines and blocks ----------

function readTree(text) {
  const raw = text.replace(/\r\n?/g, '\n').split('\n');
  if (raw.length > MAX_LINES) fail(MAX_LINES, 'more than ' + MAX_LINES + ' lines');
  const root = { children: [], indent: -1 };
  const stack = [root];
  raw.forEach((l, k) => {
    const n = k + 1;
    const cut = l.indexOf(';');
    let s = (cut >= 0 ? l.slice(0, cut) : l).replace(/\t/g, '  ').replace(/\s+$/, '');
    if (!s.trim()) return;
    const indent = s.length - s.trimStart().length;
    while (stack[stack.length - 1].indent >= indent) stack.pop();
    const node = { line: n, indent, tokens: s.trim().split(/\s+/).map((t) => EN[t] || t), children: [] };
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  });
  return root.children;
}

// ---------- arithmetic ----------

const FUNCS = {
  sin: (d) => Math.sin((d * Math.PI) / 180),
  cos: (d) => Math.cos((d * Math.PI) / 180),
  min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, rund: Math.round, round: Math.round,
};

function evalExpr(src, ctx, line) {
  let p = 0;
  const s = String(src);
  const bad = (why) => fail(line, 'expression "' + s + '" not understood' + (why ? ': ' + why : ''));
  const add = () => {
    let v = mul();
    while (s[p] === '+' || s[p] === '-') { const o = s[p++]; const r = mul(); v = o === '+' ? v + r : v - r; }
    return v;
  };
  const mul = () => {
    let v = unary();
    while (s[p] === '*' || s[p] === '/' || s[p] === '%') {
      const o = s[p++]; const r = unary();
      v = o === '*' ? v * r : o === '/' ? v / r : v % r;
    }
    return v;
  };
  const unary = () => {
    if (s[p] === '-') { p++; return -unary(); }
    if (s[p] === '+') { p++; return unary(); }
    return prim();
  };
  const prim = () => {
    if (s[p] === '(') { p++; const v = add(); if (s[p++] !== ')') bad('missing parenthesis'); return v; }
    let m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(p));
    if (m) { p += m[0].length; return Number(m[0]); }
    m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(p));
    if (!m) bad();
    p += m[0].length;
    const name = m[0];
    if (s[p] === '(') {
      p++;
      const args = [];
      if (s[p] !== ')') { args.push(add()); while (s[p] === ',') { p++; args.push(add()); } }
      if (s[p++] !== ')') bad('missing parenthesis');
      if (name === 'zuf' || name === 'random') {
        if (args.length !== 2) bad('random needs two numbers');
        return args[0] + ctx.rand() * (args[1] - args[0]);
      }
      if (!FUNCS[name]) bad('unknown function ' + name);
      return FUNCS[name](...args);
    }
    if (!(name in ctx.vars)) bad('unknown name ' + name);
    const v = ctx.vars[name];
    if (typeof v !== 'number') bad(name + ' is a color, not a number');
    return v;
  };
  const v = add();
  if (p !== s.length) bad();
  if (!Number.isFinite(v)) bad('result is not a number');
  return v;
}

function splitTop(s, sep) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (depth === 0 && s.startsWith(sep, i)) { out.push(s.slice(start, i)); start = i + sep.length; i += sep.length - 1; }
  }
  out.push(s.slice(start));
  return out;
}

function range(tok, ctx, line) {
  const parts = splitTop(tok, '..');
  if (parts.length > 2) fail(line, 'range "' + tok + '" not understood');
  const a = evalExpr(parts[0], ctx, line);
  return [a, parts.length === 2 ? evalExpr(parts[1], ctx, line) : a];
}

function point(tok, ctx, line) {
  const sharp = tok.endsWith('!');
  const parts = splitTop(sharp ? tok.slice(0, -1) : tok, ',');
  if (parts.length !== 2) fail(line, 'point "' + tok + '" must be x,y');
  return { x: evalExpr(parts[0], ctx, line), y: evalExpr(parts[1], ctx, line), sharp };
}

// ---------- colors ----------

const HEX = /^#?([0-9A-Fa-f]{6})$/;
const COLOR_TOK = /^(#?[0-9A-Fa-f]{6}|[A-Za-z_][A-Za-z0-9_]*)(?:([+-])(.+))?$/;

function tryColor(tok, ctx, line = 0) {
  const m = COLOR_TOK.exec(tok);
  if (!m) return null;
  let base;
  const h = HEX.exec(m[1]);
  if (h) base = h[1].toLowerCase();
  else if (typeof ctx.vars[m[1]] === 'string') base = ctx.vars[m[1]];
  else if (ctx.palette.has(m[1])) base = ctx.palette.get(m[1]);
  else return null;
  if (!m[2]) return base;
  const v = evalExpr(m[3], ctx, line) * (m[2] === '-' ? -1 : 1);
  const amt = Math.max(-100, Math.min(100, v)) / 100;
  const target = amt > 0 ? 255 : 0;
  const k = Math.abs(amt);
  return [0, 2, 4].map((i) => {
    const c = parseInt(base.slice(i, i + 2), 16);
    return Math.round(c + (target - c) * k).toString(16).padStart(2, '0');
  }).join('');
}

function color(tok, ctx, line) {
  if (tok === undefined) fail(line, 'color missing');
  const c = tryColor(tok, ctx, line);
  if (c === null) fail(line, '"' + tok + '" is not a color (rrggbb or a color name)');
  return c;
}

const shade = (c, amt) => tryColor(c + (amt >= 0 ? '+' : '') + amt, { vars: {}, palette: new Map(), rand: Math.random });

// ---------- curves ----------

// Catmull-Rom through all points, as cubic Bezier segments.
function segments(pts, closed) {
  const n = pts.length;
  const get = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const segs = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const t1 = p1.sharp ? 0 : 1 / 6;
    const t2 = p2.sharp ? 0 : 1 / 6;
    segs.push([
      p1,
      { x: p1.x + (p2.x - p0.x) * t1, y: p1.y + (p2.y - p0.y) * t1 },
      { x: p2.x - (p3.x - p1.x) * t2, y: p2.y - (p3.y - p1.y) * t2 },
      p2,
    ]);
  }
  return segs;
}

function bez(s, t) {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * s[0].x + b * s[1].x + c * s[2].x + d * s[3].x, y: a * s[0].y + b * s[1].y + c * s[2].y + d * s[3].y };
}

function sample(segs, steps = 16) {
  const out = [segs[0][0]];
  for (const s of segs) for (let k = 1; k <= steps; k++) out.push(bez(s, k / steps));
  return out;
}

const f = (v) => String(Math.round(v * 100) / 100);

function pathFromSegs(segs, closed) {
  let d = 'M' + f(segs[0][0].x) + ' ' + f(segs[0][0].y);
  for (const s of segs) d += 'C' + [s[1], s[2], s[3]].map((q) => f(q.x) + ' ' + f(q.y)).join(' ');
  return closed ? d + 'Z' : d;
}

function polyPath(pts) {
  return 'M' + pts.map((q) => f(q.x) + ' ' + f(q.y)).join('L') + 'Z';
}

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  return { x: x0, y: y0, w: Math.max(x1 - x0, 0.01), h: Math.max(y1 - y0, 0.01) };
}

// Stroke with varying width as a filled outline with round caps.
function strokeOutline(pts, segs, w0, w1, sharpAll) {
  const line = sharpAll ? pts : sample(segs, 12);
  const len = [0];
  for (let i = 1; i < line.length; i++) len.push(len[i - 1] + Math.hypot(line[i].x - line[i - 1].x, line[i].y - line[i - 1].y));
  const total = len[len.length - 1] || 1;
  const left = [], right = [];
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    const w = (w0 + (w1 - w0) * (len[i] / total)) / 2;
    left.push({ x: line[i].x + nx * w, y: line[i].y + ny * w });
    right.push({ x: line[i].x - nx * w, y: line[i].y - ny * w });
  }
  const cap = (c, from, w) => {
    const out = [];
    const ang = Math.atan2(from.y - c.y, from.x - c.x);
    for (let k = 1; k < 8; k++) {
      const t = ang + (Math.PI * k) / 8;
      out.push({ x: c.x + Math.cos(t) * w, y: c.y + Math.sin(t) * w });
    }
    return out;
  };
  const endW = w1 / 2, startW = w0 / 2;
  const outline = [...left, ...cap(line[line.length - 1], left[left.length - 1], endW), ...right.reverse(), ...cap(line[0], right[right.length - 1], startW)];
  return { d: polyPath(outline), box: bboxOf(outline) };
}

// ---------- matrices (linear part only, for light and shadow) ----------

const mul2 = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3]];
const rot = (deg) => { const r = (deg * Math.PI) / 180; return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r)]; };
function inv(m, v) {
  const det = m[0] * m[3] - m[2] * m[1] || 1e-9;
  return { x: (m[3] * v.x - m[2] * v.y) / det, y: (-m[1] * v.x + m[0] * v.y) / det };
}

const LIGHT = {
  oben: [0, -1], unten: [0, 1], links: [-1, 0], rechts: [1, 0],
  'oben-links': [-1, -1], 'oben-rechts': [1, -1], 'unten-links': [-1, 1], 'unten-rechts': [1, 1],
};

// ---------- attributes ----------

const ATTRS = new Set(['farbe', 'verlauf', 'radial', 'rand', 'breite', 'deckkraft', 'weich', 'schatten', 'flach',
  'textur', 'texturfarbe', 'drehung', 'rund', 'ecken', 'nass', 'trocken', 'aussparen']);
const RESERVED = new Set(['kreis', 'ellipse', 'rechteck', 'form', 'linie', 'teil', 'nutze', 'streue', 'wiederhole', 'vorlage',
  'bereich', 'entlang', 'skala', 'tiefe', 'seed', 'spiegel', 'kopfueber', 'symmetrisch', 'licht', 'stil', 'hintergrund', 'kraft']);
const TEXTURES = new Set(['punkte', 'schraffur', 'striche', 'korn']);

function readAttrs(toks, i, ctx, line, allowed) {
  const a = {};
  while (i < toks.length) {
    const k = toks[i++];
    if (!ATTRS.has(k)) fail(line, '"' + k + '" read as an attribute, but there is no such attribute');
    if (!allowed.has(k)) fail(line, en(k) + ' is not allowed here');
    if (k === 'farbe') a.fill = { type: 'farbe', c: color(toks[i++], ctx, line) };
    else if (k === 'verlauf' || k === 'radial') {
      const cs = [];
      while (i < toks.length && !ATTRS.has(toks[i]) && tryColor(toks[i], ctx, line) !== null) cs.push(tryColor(toks[i++], ctx, line));
      if (cs.length < 2) fail(line, en(k) + ' needs at least two colors');
      let angle = 0;
      if (k === 'verlauf' && i < toks.length && !ATTRS.has(toks[i])) angle = evalExpr(toks[i++], ctx, line);
      a.fill = { type: k, cs, angle };
    } else if (k === 'rand') {
      a.stroke = color(toks[i++], ctx, line);
      a.strokeW = 1.5;
      if (i < toks.length && !ATTRS.has(toks[i])) a.strokeW = evalExpr(toks[i++], ctx, line);
    } else if (k === 'breite') {
      if (toks[i] === undefined) fail(line, 'width needs a number');
      a.width = range(toks[i++], ctx, line);
    } else if (k === 'textur') {
      const art = toks[i++];
      if (!TEXTURES.has(art)) fail(line, 'texture "' + art + '" does not exist (dots, hatch, strokes, grain)');
      let d = 5;
      if (i < toks.length && !ATTRS.has(toks[i])) d = evalExpr(toks[i++], ctx, line);
      a.texture = { art, d: Math.max(0.5, Math.min(10, d)) };
    } else if (k === 'texturfarbe') a.texColor = color(toks[i++], ctx, line);
    else if (['schatten', 'flach', 'ecken', 'nass', 'trocken', 'aussparen'].includes(k)) a[k] = true;
    else {
      if (toks[i] === undefined) fail(line, en(k) + ' needs a number');
      a[k] = evalExpr(toks[i++], ctx, line);
    }
  }
  return a;
}

// ---------- compiler ----------

class Out {
  constructor() { this.defs = []; this.n = 0; this.count = 0; this.aq = new Set(); }
  id(p) { return p + ++this.n; }
  tick(k = 1) { this.count += k; if (this.count > MAX_ELEMENTS) fail(0, 'image too large, more than ' + MAX_ELEMENTS + ' elements'); }
}

function fillPaint(fill, out) {
  if (!fill) return '#333333';
  if (fill.type === 'farbe') return '#' + fill.c;
  const id = out.id('v');
  const stops = fill.cs.map((c, k) => '<stop offset="' + f(k / (fill.cs.length - 1)) + '" stop-color="#' + c + '"/>').join('');
  if (fill.type === 'radial') out.defs.push('<radialGradient id="' + id + '">' + stops + '</radialGradient>');
  else {
    const r = (fill.angle * Math.PI) / 180;
    const dx = Math.cos(r) / 2, dy = Math.sin(r) / 2;
    out.defs.push('<linearGradient id="' + id + '" x1="' + f(0.5 - dx) + '" y1="' + f(0.5 - dy) + '" x2="' + f(0.5 + dx) + '" y2="' + f(0.5 + dy) + '">' + stops + '</linearGradient>');
  }
  return 'url(#' + id + ')';
}

const luma = (c) => (0.2126 * parseInt(c.slice(0, 2), 16) + 0.7152 * parseInt(c.slice(2, 4), 16) + 0.0722 * parseInt(c.slice(4, 6), 16)) / 255;

const baseColor = (fill) => !fill ? '333333' : fill.type === 'farbe' ? fill.c : fill.cs[0];

function filterFor(attrs, ctx, out, m) {
  const parts = [];
  if (attrs.weich) parts.push('<feGaussianBlur in="SourceGraphic" stdDeviation="' + f(attrs.weich) + '" result="w"/>');
  if (attrs.schatten) {
    const L = ctx.light ? ctx.light.v : { x: -0.7071, y: -0.7071 };
    const k = ctx.unit * 6;
    const o = inv(m, { x: -L.x * k, y: -L.y * k });
    const s = (ctx.unit * 3.5) / Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]) || 1);
    parts.push('<feDropShadow dx="' + f(o.x) + '" dy="' + f(o.y) + '" stdDeviation="' + f(s) + '" flood-color="#000" flood-opacity="0.35"/>');
  }
  if (!parts.length) return '';
  const id = out.id('f');
  out.defs.push('<filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%">' + parts.join('') + '</filter>');
  return ' filter="url(#' + id + ')"';
}

function texture(t, box, col, ctx, out) {
  const r = ctx.rand;
  const parts = [];
  const area = box.w * box.h;
  const cap = (spacing) => Math.max(spacing, Math.sqrt(area / 3000));
  if (t.art === 'korn') {
    const id = out.id('k');
    const k = t.d * 0.5;
    const [R, G, B] = [0, 2, 4].map((i) => f(parseInt(col.slice(i, i + 2), 16) / 255));
    out.defs.push('<filter id="' + id + '" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="' +
      Math.floor(r() * 1000) + '"/><feColorMatrix type="matrix" values="0 0 0 0 ' + R + ' 0 0 0 0 ' + G + ' 0 0 0 0 ' + B + ' ' + f(k) + ' 0 0 0 ' + f(-k * 0.42) + '"/></filter>');
    parts.push('<rect x="' + f(box.x) + '" y="' + f(box.y) + '" width="' + f(box.w) + '" height="' + f(box.h) + '" filter="url(#' + id + ')"/>');
  } else if (t.art === 'punkte') {
    const sp = cap(30 / t.d);
    const n = Math.round(area / (sp * sp));
    for (let k = 0; k < n; k++) {
      parts.push('<circle cx="' + f(box.x + r() * box.w) + '" cy="' + f(box.y + r() * box.h) + '" r="' + f(0.5 + r() * 1.3) + '"/>');
    }
  } else if (t.art === 'schraffur') {
    const sp = Math.max(30 / t.d, Math.max(box.w, box.h) / 400);
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, R = Math.hypot(box.w, box.h) / 2;
    const d = [];
    for (let o = -R; o <= R; o += sp) {
      const j = (r() - 0.5) * sp * 0.3;
      d.push('M' + f(cx - R + j) + ' ' + f(cy + o - R + j) + 'L' + f(cx + R) + ' ' + f(cy + o + R));
    }
    parts.push('<path d="' + d.join('') + '" fill="none" stroke-width="' + f(Math.max(0.6, sp * 0.18)) + '" stroke="#' + col + '"/>');
  } else {
    const sp = cap(26 / t.d);
    const n = Math.round(area / (sp * sp));
    const d = [];
    const len = sp * 1.6;
    for (let k = 0; k < n; k++) {
      const x = box.x + r() * box.w, y = box.y + r() * box.h;
      const a = ((90 + (r() - 0.5) * 50) * Math.PI) / 180;
      d.push('M' + f(x) + ' ' + f(y) + 'l' + f(Math.cos(a) * len) + ' ' + f(-Math.sin(a) * len));
    }
    parts.push('<path d="' + d.join('') + '" fill="none" stroke-linecap="round" stroke-width="' + f(Math.max(0.7, sp * 0.22)) + '" stroke="#' + col + '"/>');
  }
  out.tick(parts.length);
  return '<g fill="#' + col + '" opacity="0.55">' + parts.join('') + '</g>';
}

function lightOverlay(box, m, ctx, out) {
  const L = inv(m, ctx.light.v);
  const ll = Math.hypot(L.x, L.y) || 1;
  const lx = L.x / ll, ly = L.y / ll;
  const cx = box.x + box.w / 2 + lx * box.w * 0.3;
  const cy = box.y + box.h / 2 + ly * box.h * 0.3;
  const R = Math.max(box.w, box.h) * 0.95;
  const k = ctx.light.kraft;
  const id = out.id('l');
  out.defs.push('<radialGradient id="' + id + '" gradientUnits="userSpaceOnUse" cx="' + f(cx) + '" cy="' + f(cy) + '" r="' + f(R) +
    '"><stop offset="0" stop-color="#fff" stop-opacity="' + f(0.38 * k) + '"/><stop offset="0.38" stop-color="#fff" stop-opacity="0"/>' +
    '<stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="' + f(0.55 * k) + '"/></radialGradient>');
  return 'url(#' + id + ')';
}

const SHAPE_ATTRS = new Set(['farbe', 'verlauf', 'radial', 'rand', 'deckkraft', 'weich', 'schatten', 'flach', 'textur', 'texturfarbe', 'drehung', 'nass', 'trocken', 'aussparen']);
const RECT_ATTRS = new Set([...SHAPE_ATTRS, 'rund']);
const FORM_ATTRS = new Set([...SHAPE_ATTRS, 'ecken']);
const LINE_ATTRS = new Set([...SHAPE_ATTRS, 'breite', 'ecken']);

function shape(node, ctx, out, m) {
  const t = node.tokens, line = node.line, cmd = t[0];
  let geo, a, i;
  const nums = (k) => {
    if (t.length < k + 1) fail(line, en(cmd) + ' needs ' + k + ' numbers');
    return t.slice(1, k + 1).map((s) => evalExpr(s, ctx, line));
  };
  if (cmd === 'kreis') {
    const [x, y, r] = nums(3);
    a = readAttrs(t, 4, ctx, line, SHAPE_ATTRS);
    geo = { el: (p) => '<circle cx="' + f(x) + '" cy="' + f(y) + '" r="' + f(Math.abs(r)) + '"' + p + '/>', box: { x: x - r, y: y - r, w: 2 * r, h: 2 * r } };
  } else if (cmd === 'ellipse') {
    const [x, y, rx, ry] = nums(4);
    a = readAttrs(t, 5, ctx, line, SHAPE_ATTRS);
    geo = { el: (p) => '<ellipse cx="' + f(x) + '" cy="' + f(y) + '" rx="' + f(Math.abs(rx)) + '" ry="' + f(Math.abs(ry)) + '"' + p + '/>', box: { x: x - rx, y: y - ry, w: 2 * rx, h: 2 * ry } };
  } else if (cmd === 'rechteck') {
    const [x, y, w, h] = nums(4);
    a = readAttrs(t, 5, ctx, line, RECT_ATTRS);
    const rr = a.rund ? ' rx="' + f(a.rund) + '"' : '';
    geo = { el: (p) => '<rect x="' + f(x) + '" y="' + f(y) + '" width="' + f(Math.abs(w)) + '" height="' + f(Math.abs(h)) + '"' + rr + p + '/>', box: { x, y, w, h } };
  } else {
    const pts = [];
    for (i = 1; i < t.length && (t[i].includes(',') || t[i].endsWith('!')); i++) pts.push(point(t[i], ctx, line));
    a = readAttrs(t, i, ctx, line, cmd === 'form' ? FORM_ATTRS : LINE_ATTRS);
    if (a.ecken) pts.forEach((q) => { q.sharp = true; });
    if (cmd === 'form') {
      if (pts.length < 3) fail(line, 'shape needs at least three points x,y');
      const segs = segments(pts, true);
      const d = a.ecken ? polyPath(pts) : pathFromSegs(segs, true);
      geo = { el: (p) => '<path d="' + d + '"' + p + '/>', box: bboxOf(a.ecken ? pts : sample(segs, 8)) };
    } else {
      if (pts.length < 2) fail(line, 'line needs at least two points x,y');
      const [w0, w1] = a.width || [2, 2];
      const o = strokeOutline(pts, segments(pts, false), w0, w1, a.ecken);
      geo = { el: (p) => '<path d="' + o.d + '"' + p + '/>', box: o.box };
      a.flach = true;
    }
  }
  if (a.aussparen) { a.fill = { type: 'farbe', c: ctx.palette.get('papier') }; a.flach = true; }
  const hollow = !a.fill && a.stroke && cmd !== 'linie';
  if (!a.fill) a.fill = { type: 'farbe', c: '333333' };
  out.tick();

  const ms = a.drehung ? mul2(m, rot(a.drehung)) : m;
  const bx = geo.box;
  const rotT = a.drehung ? ' transform="rotate(' + f(a.drehung) + ' ' + f(bx.x + bx.w / 2) + ' ' + f(bx.y + bx.h / 2) + ')"' : '';
  const needClip = a.texture || node.children.length;
  let clipLocal = '', clipParent = '';
  if (needClip) {
    clipLocal = out.id('c');
    out.defs.push('<clipPath id="' + clipLocal + '">' + geo.el('') + '</clipPath>');
    if (node.children.length) {
      clipParent = out.id('c');
      out.defs.push('<clipPath id="' + clipParent + '">' + geo.el(rotT) + '</clipPath>');
    }
  }

  let inner = hollow ? '' : geo.el(' fill="' + fillPaint(a.fill, out) + '"');
  if (a.texture) {
    const col = a.texColor || shade(baseColor(a.fill), -35);
    inner += '<g clip-path="url(#' + clipLocal + ')">' + texture(a.texture, bx, col, ctx, out) + '</g>';
  }
  const paint = rotT ? '<g' + rotT + '>' + inner + '</g>' : inner;
  const kids = node.children.length ? '<g clip-path="url(#' + clipParent + ')">' + block(node.children, ctx, out, m) + '</g>' : '';
  let top = '';
  if (ctx.light && !a.flach && !hollow) top += geo.el(' fill="' + lightOverlay(bx, ms, ctx, out) + '"');
  if (a.stroke) top += geo.el(' fill="none" stroke="#' + a.stroke + '" stroke-width="' + f(a.strokeW) + '" stroke-linejoin="round"');
  const topG = top ? (rotT ? '<g' + rotT + '>' + top + '</g>' : top) : '';

  const op = a.deckkraft !== undefined ? ' opacity="' + f(a.deckkraft) + '"' : '';
  const fl = filterFor(a, ctx, out, ms);
  if (ctx.stil !== 'aquarell') {
    const parts = [paint, kids, topG].filter(Boolean);
    return op || fl || parts.length > 1 ? '<g' + op + fl + '>' + parts.join('') + '</g>' : parts[0];
  }
  // Watercolor: the filter covers only paint, light and stroke. Children paint afterwards with their own filter.
  const maxW = a.width ? Math.max(a.width[0], a.width[1]) : 0;
  let art = 'normal';
  if (cmd === 'linie') art = maxW >= 6 ? 'strich' : 'linie';
  else if (a.nass || a.weich || a.aussparen) art = ctx.fluss && !a.aussparen ? 'fluss' : 'nass';
  else if (luma(baseColor(a.fill)) > 0.78) art = 'hell';
  // Size class: small shapes get less displacement, otherwise they disappear.
  const scale = Math.sqrt(Math.abs(ms[0] * ms[3] - ms[1] * ms[2])) || 1;
  const minDim = (cmd === 'linie' ? maxW * 4 : Math.min(Math.abs(bx.w), Math.abs(bx.h))) * scale / ctx.unit;
  const size = [0.15, 0.3, 0.55].find((q) => minDim < q * 160) || 1;
  const deck = a.aussparen ? '' : ' opacity="0.93"';
  const pencil = art === 'normal' || art === 'hell' ? bleistift(geo, ctx, out) : '';
  const filt = ' filter="url(#' + aquarellFilter(ctx, out, art, a.trocken, size, scale) + ')"';
  const body = '<g' + deck + filt + '>' + (fl ? '<g' + fl + '>' + paint + topG + '</g>' : paint + topG) + '</g>' + pencil + kids;
  return op ? '<g' + op + '>' + body + '</g>' : body;
}

// ---------- watercolor ----------

// Per shape: ragged edges, lost and found edges, pigment rim, brush streaks,
// blooms with a dark fringe, granulation in the paper texture. Eight variants with their own noise.
function aquarellFilter(ctx, out, art, trocken, z, scale) {
  const k = ctx.aqNext++ % 8;
  // Scale in half octaves, so scaled parts are not distorted more.
  const sq = Math.pow(2, Math.round(Math.log2(scale) * 2) / 2);
  const key = 'aq-' + art + (trocken ? '-t' : '') + '-' + k + '-' + z + '-' + sq;
  if (out.aq.has(key)) return key;
  out.aq.add(key);
  const u = ctx.unit / sq;
  const seed = ctx.seed * 31 + k * 7;
  const fq = (x, y = x) => f(x / u) + ' ' + f(y / u);
  const turb = (freq, oct, sd, name) => '<feTurbulence type="fractalNoise" baseFrequency="' + freq + '" numOctaves="' + oct + '" seed="' + sd + '" result="' + name + '"/>';
  const alpha = (src, a, b, name) => '<feColorMatrix in="' + src + '" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ' + a + ' 0 0 0 ' + b + '" result="' + name + '"/>';
  const tone = (src, mul, add, name) => '<feColorMatrix in="' + src + '" type="matrix" values="' + mul + ' 0 0 0 ' + add + ' 0 ' + mul + ' 0 0 ' + add + ' 0 0 ' + mul + ' 0 ' + add + ' 0 0 0 1 0" result="' + name + '"/>';
  const inside = (src, mask, name) => '<feComposite in="' + src + '" in2="' + mask + '" operator="in" result="' + name + '"/>';
  const add = (a, b, name) => '<feComposite in="' + a + '" in2="' + b + '" operator="arithmetic" k2="1" k3="1" result="' + name + '"/>';
  const korn = (from, strength) => tone(from, 0.8, 0, 'kd') + turb(fq(0.45), 2, ctx.seed + 7, 'gr') + alpha('gr', strength, -strength * 0.43, 'grA') + inside('kd', 'grA', 'korn');
  let fx, last;
  if (art === 'linie') {
    fx = turb(fq(0.018), 3, seed, 'n') +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + f(3 * u) + '" xChannelSelector="R" yChannelSelector="G" result="d0"/>' +
      '<feGaussianBlur in="d0" stdDeviation="' + f(0.4 * u) + '" result="m"/>';
    last = 'm';
  } else if (art === 'nass' || art === 'fluss') {
    // fluss: lies on another wet shape and bleeds into it with a wide, fibrous edge.
    const fl = art === 'fluss';
    // Wet in wet: the inside flows, the outline frays widely and dries with a slightly darker edge.
    fx = turb(fq(0.009), 3, seed + 3, 'n') +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + f(60 * u * z) + '" xChannelSelector="R" yChannelSelector="G" result="dd"/>' +
      '<feGaussianBlur in="dd" stdDeviation="' + f(3 * u * z) + '" result="ds"/>' +
      turb(fq(fl ? 0.03 : 0.014), 4, seed + 4, 'n2') +
      '<feDisplacementMap in="SourceAlpha" in2="n2" scale="' + f((fl ? 44 : 36) * u * z) + '" xChannelSelector="R" yChannelSelector="G" result="a0"/>' +
      '<feGaussianBlur in="a0" stdDeviation="' + f((fl ? 11 : 4) * u * z) + '" result="aw"/>' +
      inside('ds', 'aw', 'e0') +
      // Pigment gathers where it is denser: cloudy structure from coarse noise.
      tone('e0', 0.86, 0, 'dk') + turb(fq(0.016), 3, seed + 5, 'wl') + alpha('wl', 2.0, -0.9, 'wlA') + inside('dk', 'wlA', 'wolke') +
      // Drying edge: a narrow band along the soft edge.
      '<feMorphology in="aw" operator="erode" radius="' + f(3 * u * z) + '" result="ae"/>' +
      '<feComposite in="aw" in2="ae" operator="out" result="band"/>' +
      tone('e0', 0.75, 0, 'bd') + inside('bd', 'band', 'saum') +
      korn('e0', 0.4) +
      '<feMerge result="m0"><feMergeNode in="e0"/><feMergeNode in="wolke"/><feMergeNode in="saum"/><feMergeNode in="korn"/></feMerge>' +
      inside('m0', 'aw', 'm');
    last = 'm';
  } else {
    const hell = art === 'hell';
    const strich = art === 'strich';
    fx = turb(fq(0.018), 3, seed, 'n') +
      '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + f(8 * u * z) + '" xChannelSelector="R" yChannelSelector="G" result="d0"/>' +
      '<feGaussianBlur in="d0" stdDeviation="' + f(0.7 * u * z) + '" result="d"/>' +
      // Lost edges: where the noise is high, the shape fades out softly.
      '<feGaussianBlur in="d" stdDeviation="' + f(5 * u * z) + '" result="weich"/>' +
      turb(fq(0.007), 2, seed + 11, 'lm') + alpha('lm', hell ? 4 : 3.2, hell ? -1.7 : strich ? -2.2 : -1.55, 'los') +
      inside('weich', 'los', 'wTeil') +
      '<feComposite in="d" in2="los" operator="out" result="hTeil"/>' +
      add('hTeil', 'wTeil', 'e') +
      // Pigment rim only on hard edges, barely on light colors.
      '<feGaussianBlur in="d" stdDeviation="' + f(5 * u * z) + '" result="b"/>' +
      '<feComposite in="d" in2="b" operator="out" result="ring0"/>' +
      '<feComposite in="ring0" in2="los" operator="out" result="ring"/>' +
      tone('ring', hell ? 0.9 : 0.5, 0, 'rd') +
      '<feComponentTransfer in="rd" result="rand"><feFuncA type="linear" slope="' + (hell ? 1.2 : 2.4) + '"/></feComponentTransfer>' +
      tone('e', hell ? 0.9 : 0.8, 0, 'dk') +
      // Brush streaks: stretched noise.
      turb(fq(0.0035, 0.028), 3, seed + 50, 'st') + alpha('st', 1.6, -0.75, 'stA') + inside('dk', 'stA', 'streifen') +
      // Bloom: a sharply bounded light island with a dark fringe.
      turb(fq(0.012), 2, seed + 60, 'bl') +
      '<feComponentTransfer in="bl" result="blA"><feFuncA type="discrete" tableValues="0 0 0 0 0 0 1"/></feComponentTransfer>' +
      '<feComposite in="blA" in2="e" operator="in" result="blIn"/>' +
      '<feMorphology in="blIn" operator="erode" radius="' + f(1.6 * u * z) + '" result="blKern"/>' +
      '<feComposite in="blIn" in2="blKern" operator="out" result="blSaum"/>' +
      tone('e', 1, 0.13, 'hl') + inside('hl', 'blKern', 'bluete') +
      tone('e', hell ? 0.85 : 0.62, 0, 'saumF') + inside('saumF', 'blSaum', 'saum') +
      korn('e', hell ? 0.5 : 0.9) +
      '<feMerge result="m0"><feMergeNode in="e"/><feMergeNode in="streifen"/><feMergeNode in="bluete"/><feMergeNode in="saum"/><feMergeNode in="korn"/><feMergeNode in="rand"/></feMerge>' +
      '<feComposite in="m0" in2="e" operator="in" result="m"/>';
    last = 'm';
    if (strich) {
      // Wide brush stroke: the core covers, the edges break up in the paper grain.
      fx += '<feMorphology in="m" operator="erode" radius="' + f(2 * u) + '" result="kern"/>' +
        turb(fq(0.05, 0.3), 2, seed + 90, 'sb') +
        '<feComponentTransfer in="sb" result="sbA"><feFuncA type="discrete" tableValues="0 0 1 1 1 1"/></feComponentTransfer>' +
        inside('m', 'sbA', 'gebrochen') +
        '<feComposite in="m" in2="kern" operator="in" result="kernF"/>' +
        '<feMerge result="sm"><feMergeNode in="gebrochen"/><feMergeNode in="kernF"/></feMerge>';
      last = 'sm';
    }
  }
  if (trocken) {
    // Dry brush: the paper grain breaks up the stroke.
    fx += turb(fq(0.03, 0.35), 2, seed + 80, 'tr') +
      '<feComponentTransfer in="tr" result="trA"><feFuncA type="discrete" tableValues="0 0 0 1 1 1 1"/></feComponentTransfer>' +
      inside(last, 'trA', 'trocken');
    last = 'trocken';
  }
  out.defs.push('<filter id="' + key + '" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">' + fx.replace(/ result="[^"]*"\/>$/, '/>') + '</filter>');
  return key;
}

// Pencil underdrawing: outline slightly offset, shows through the wash.
function bleistift(geo, ctx, out) {
  const u = ctx.unit;
  if (geo.box.w * geo.box.h < 900 * u * u) return '';
  if (!out.aq.has('stift')) {
    out.aq.add('stift');
    out.defs.push('<filter id="stift" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="' + f(0.04 / u) + '" numOctaves="2" seed="' + (ctx.seed + 5) + '"/>' +
      '<feDisplacementMap in="SourceGraphic" scale="' + f(5 * u) + '" xChannelSelector="R" yChannelSelector="G"/></filter>');
  }
  return geo.el(' fill="none" stroke="#4a4744" stroke-width="' + f(0.7 * u) + '" stroke-opacity="0.32" filter="url(#stift)"');
}

function papier(W, H, ctx, out) {
  const u = ctx.unit, m = 16 * u;
  out.defs.push('<filter id="blattrand" x="-5%" y="-5%" width="110%" height="110%">' +
    '<feTurbulence type="fractalNoise" baseFrequency="' + f(0.012 / u) + '" numOctaves="3" seed="' + (ctx.seed + 3) + '"/>' +
    '<feDisplacementMap in="SourceGraphic" scale="' + f(12 * u) + '" xChannelSelector="R" yChannelSelector="G"/></filter>' +
    '<mask id="blatt"><rect x="' + f(m) + '" y="' + f(m) + '" width="' + f(W - 2 * m) + '" height="' + f(H - 2 * m) + '" fill="#fff" filter="url(#blattrand)"/></mask>' +
    '<filter id="lavur" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="1.12"/><feComponentTransfer>' +
    ['R', 'G', 'B'].map((c) => '<feFunc' + c + ' type="linear" slope="0.94" intercept="0.05"/>').join('') +
    '</feComponentTransfer></filter>' +
    // Paper relief: noise as a height map, lit from the top left.
    '<filter id="relief" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="' + f(0.11 / u) + '" numOctaves="3" seed="' + (ctx.seed + 7) + '" result="h"/>' +
    '<feDiffuseLighting in="h" surfaceScale="' + f(1.2) + '" diffuseConstant="1" lighting-color="#fff"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting>' +
    '<feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 1"/></filter>' +
    '<filter id="papier" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="' + ctx.seed + '"/>' +
    '<feColorMatrix type="matrix" values="0 0 0 0 0.42 0 0 0 0 0.37 0 0 0 0 0.3 0.3 0 0 0 -0.11"/></filter>');
  return '<rect width="' + W + '" height="' + H + '" filter="url(#relief)" style="mix-blend-mode:multiply" opacity="0.22"/>' +
    '<rect width="' + W + '" height="' + H + '" filter="url(#papier)" style="mix-blend-mode:multiply"/>';
}

function transformAttr(x, y, s, d, mirror) {
  let tr = 'translate(' + f(x) + ' ' + f(y) + ')';
  if (d) tr += ' rotate(' + f(d) + ')';
  if (s !== 1 || mirror) tr += ' scale(' + f(mirror ? -s : s) + ' ' + f(s) + ')';
  return tr;
}

const placeMatrix = (m, s, d, mirror) => mul2(mul2(m, rot(d)), [mirror ? -s : s, 0, 0, s]);

// Read options like scale 2, rotate 30, mirror, h=80.
function readPlace(t, i, ctx, line, allowed) {
  const o = { skala: [1, 1], drehung: 0, spiegel: false, args: [] };
  while (i < t.length) {
    const k = t[i++];
    const eq = k.indexOf('=');
    if (eq > 0 && allowed.has('=')) { o.args.push([k.slice(0, eq), k.slice(eq + 1)]); continue; }
    if (!allowed.has(k)) fail(line, '"' + en(k) + '" is not allowed here');
    if (k === 'spiegel' || k === 'symmetrisch' || k === 'tiefe' || k === 'kopfueber') o[k] = true;
    else {
      if (t[i] === undefined) fail(line, en(k) + ' needs a value');
      if (k === 'skala') o.skala = range(t[i++], ctx, line);
      else o[k] = evalExpr(t[i++], ctx, line);
    }
  }
  return o;
}

function argValue(v, ctx, line) {
  const c = /^[0-9.]+$/.test(v) && !/^\d{6}$/.test(v) ? null : tryColor(v, ctx, line);
  return c !== null ? c : evalExpr(v, ctx, line);
}

function instance(tpl, x, y, s, d, mirror, args, z, idx, ctx, out, m, line, extra = '') {
  if (ctx.depth >= MAX_DEPTH) fail(line, 'templates nested too deep');
  const vars = { ...tpl.defaults, z, i: idx };
  for (const [k, v] of args) {
    if (!(k in tpl.defaults)) fail(line, 'template ' + tpl.name + ' has no parameter ' + k);
    vars[k] = argValue(v, ctx, line);
  }
  const sub = { ...ctx, vars, depth: ctx.depth + 1 };
  return '<g transform="' + transformAttr(x, y, s, d, mirror) + '"' + extra + '>' + block(tpl.body, sub, out, placeMatrix(m, s, d, mirror)) + '</g>';
}

const PLACE_TEIL = new Set(['skala', 'drehung', 'spiegel', 'kopfueber', 'symmetrisch', 'deckkraft', 'weich']);
const PLACE_NUTZE = new Set(['skala', 'drehung', 'spiegel', 'deckkraft', '=']);
const PLACE_STREUE = new Set(['skala', 'tiefe', 'seed', 'deckkraft', '=']);

function statement(node, ctx, out, m) {
  const t = node.tokens, line = node.line, cmd = t[0];
  if (SHAPES.has(cmd)) return shape(node, ctx, out, m);

  if (cmd === 'teil') {
    if (!/^[A-Za-z_]/.test(t[1] || '')) fail(line, 'part needs a name first, then x y');
    if (t.length < 4) fail(line, 'part <name> <x> <y>');
    const x = evalExpr(t[2], ctx, line), y = evalExpr(t[3], ctx, line);
    const o = readPlace(t, 4, ctx, line, PLACE_TEIL);
    const s = o.skala[0];
    const extra = (o.deckkraft !== undefined ? ' opacity="' + f(o.deckkraft) + '"' : '') + filterFor({ weich: o.weich }, ctx, out, m);
    const mt = o.kopfueber ? mul2(mul2(m, rot(o.drehung)), [1, 0, 0, -1]) : mul2(m, rot(o.drehung));
    let body = '<g transform="' + transformAttr(0, 0, s, 0, o.spiegel) + '">' + block(node.children, ctx, out, placeMatrix(mt, s, 0, o.spiegel)) + '</g>';
    if (o.symmetrisch) {
      body += '<g transform="' + transformAttr(0, 0, s, 0, !o.spiegel) + '">' + block(node.children, ctx, out, placeMatrix(mt, s, 0, !o.spiegel)) + '</g>';
    }
    const tr = transformAttr(x, y, 1, o.drehung, false) + (o.kopfueber ? ' scale(1 -1)' : '');
    return '<g transform="' + tr + '"' + extra + '>' + body + '</g>';
  }

  if (cmd === 'nutze') {
    const tpl = ctx.templates.get(t[1]);
    if (!tpl) fail(line, 'template "' + t[1] + '" does not exist');
    if (t.length < 4) fail(line, 'use <template> <x> <y>');
    const o = readPlace(t, 4, ctx, line, PLACE_NUTZE);
    const op = o.deckkraft !== undefined ? ' opacity="' + f(o.deckkraft) + '"' : '';
    return instance(tpl, evalExpr(t[2], ctx, line), evalExpr(t[3], ctx, line), o.skala[0], o.drehung, o.spiegel, o.args, ctx.rand(), 0, ctx, out, m, line, op);
  }

  if (cmd === 'streue') {
    const tpl = ctx.templates.get(t[1]);
    if (!tpl) fail(line, 'template "' + t[1] + '" does not exist');
    const n = Math.round(evalExpr(t[2] || '', ctx, line));
    if (n < 0 || n > MAX_COUNT) fail(line, 'count must be 0 to ' + MAX_COUNT);
    let i = 4, where = t[3];
    let pick, y0, y1;
    if (where === 'bereich') {
      if (t.length < 8) fail(line, 'area needs x y width height');
      const [bx, by, bw, bh] = t.slice(4, 8).map((s) => evalExpr(s, ctx, line));
      i = 8;
      y0 = by; y1 = by + bh;
      pick = (r) => ({ x: bx + r() * bw, y: by + r() * bh });
    } else if (where === 'entlang') {
      const pts = [];
      for (; i < t.length && t[i].includes(','); i++) pts.push(point(t[i], ctx, line));
      if (pts.length < 2) fail(line, 'along needs at least two points');
      const line2 = sample(segments(pts, false), 24);
      const box = bboxOf(line2);
      y0 = box.y; y1 = box.y + box.h;
      pick = (r) => line2[Math.floor(r() * line2.length)];
    } else fail(line, 'scatter <template> <count> area x y w h  or  along x,y x,y ...');
    const o = readPlace(t, i, ctx, line, PLACE_STREUE);
    const r = o.seed !== undefined ? rng(o.seed * 7919 + 13) : ctx.rand;
    const items = [];
    for (let k = 0; k < n; k++) {
      const p = pick(r);
      items.push({ x: p.x, y: p.y, s: o.skala[0] + r() * (o.skala[1] - o.skala[0]), z: r() });
    }
    items.sort((p, q) => p.y - q.y);
    return items.map((it, k) => {
      let s = it.s, op = o.deckkraft !== undefined ? o.deckkraft : 1;
      if (o.tiefe && y1 > y0) {
        const depth = (it.y - y0) / (y1 - y0);
        s *= 0.45 + 0.55 * depth;
        op *= 0.55 + 0.45 * depth;
      }
      const extra = op < 1 ? ' opacity="' + f(op) + '"' : '';
      return instance(tpl, it.x, it.y, s, 0, false, o.args, it.z, k, ctx, out, m, line, extra);
    }).join('');
  }

  if (cmd === 'wiederhole') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t[1] || '') || t.length !== 3) fail(line, 'repeat <name> <count>');
    const n = Math.round(evalExpr(t[2], ctx, line));
    if (n < 0 || n > MAX_COUNT) fail(line, 'count must be 0 to ' + MAX_COUNT);
    let s = '';
    for (let k = 0; k < n; k++) s += block(node.children, { ...ctx, vars: { ...ctx.vars, [t[1]]: k } }, out, m);
    return s;
  }

  if (['farbe', 'seed', 'licht', 'hintergrund', 'vorlage', 'pinsel', 'stil'].includes(cmd)) {
    fail(line, en(cmd) + ' only works at the top level, without indentation');
  }
  fail(line, '"' + en(cmd) + '" not understood');
}

const SHAPES = new Set(['kreis', 'ellipse', 'rechteck', 'form', 'linie']);
const isWet = (n) => SHAPES.has(n.tokens[0]) && (n.tokens.includes('nass') || n.tokens.includes('weich'));

function block(nodes, ctx, out, m) {
  if (ctx.stil !== 'aquarell') return nodes.map((n) => statement(n, ctx, out, m)).join('');
  if (ctx.fluss) ctx = { ...ctx, fluss: false };
  // Wet shapes in a row bleed into each other: shared displacement over the whole group.
  let s = '';
  for (let i = 0; i < nodes.length;) {
    let j = i;
    while (j < nodes.length && isWet(nodes[j])) j++;
    if (j - i >= 2) {
      const inner = nodes.slice(i, j).map((n, k) => statement(n, k ? { ...ctx, fluss: true } : ctx, out, m)).join('');
      s += '<g filter="url(#' + ineinander(ctx, out, m) + ')">' + inner + '</g>';
      i = j;
    } else {
      s += statement(nodes[i], ctx, out, m);
      i++;
    }
  }
  return s;
}

function ineinander(ctx, out, m) {
  const k = ctx.aqNext++ % 4;
  const scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  const sq = Math.pow(2, Math.round(Math.log2(scale) * 2) / 2);
  const key = 'nn-' + k + '-' + sq;
  if (out.aq.has(key)) return key;
  out.aq.add(key);
  const u = ctx.unit / sq;
  const seed = ctx.seed * 17 + k * 5;
  out.defs.push('<filter id="' + key + '" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">' +
    '<feTurbulence type="fractalNoise" baseFrequency="' + f(0.011 / u) + '" numOctaves="3" seed="' + seed + '" result="n"/>' +
    '<feDisplacementMap in="SourceGraphic" in2="n" scale="' + f(34 * u) + '" xChannelSelector="R" yChannelSelector="G" result="a"/>' +
    '<feTurbulence type="fractalNoise" baseFrequency="' + f(0.05 / u) + '" numOctaves="2" seed="' + (seed + 1) + '" result="n2"/>' +
    '<feDisplacementMap in="a" in2="n2" scale="' + f(9 * u) + '" xChannelSelector="G" yChannelSelector="R" result="b"/>' +
    '<feGaussianBlur in="b" stdDeviation="' + f(1.2 * u) + '" result="c"/>' +
    // Gaps between wet areas are filled with the mixed color of both sides.
    '<feGaussianBlur in="c" stdDeviation="' + f(9 * u) + '" result="mix"/>' +
    '<feMorphology in="c" operator="dilate" radius="' + f(7 * u) + '" result="nah"/>' +
    '<feComposite in="mix" in2="nah" operator="in" result="fuell"/>' +
    '<feComponentTransfer in="fuell" result="fuellD"><feFuncA type="linear" slope="1.6"/></feComponentTransfer>' +
    '<feMerge><feMergeNode in="fuellD"/><feMergeNode in="c"/></feMerge></filter>');
  return key;
}

// compile(text) returns { ok: true, svg, width, height } or { ok: false, error: { line, message } }.
export function compile(text) {
  try {
    return { ok: true, ...compileOrThrow(text) };
  } catch (e) {
    if (e instanceof PinselError) return { ok: false, error: { line: e.line, message: e.message } };
    throw e;
  }
}

function compileOrThrow(text) {
  if (typeof text !== 'string') fail(1, 'no text');
  const nodes = readTree(text);
  if (!nodes.length) fail(1, 'empty');
  const head = nodes[0];
  if (head.tokens[0] !== 'pinsel') fail(head.line, 'first line must be "pinsel 1 <width> <height>"');
  if (head.tokens[1] !== '1') fail(head.line, 'unknown version, only "pinsel 1"');
  const W = Number(head.tokens[2]), H = Number(head.tokens[3]);
  if (head.tokens.length !== 4 || !(W >= 1 && W <= MAX_SIZE && H >= 1 && H <= MAX_SIZE) || !Number.isInteger(W) || !Number.isInteger(H)) {
    fail(head.line, 'width and height must be whole numbers from 1 to ' + MAX_SIZE);
  }

  const ctx = { vars: {}, palette: new Map(), templates: new Map(), light: null, depth: 0, unit: Math.max(W, H) / 800, rand: null, stil: 'normal', aqNext: 0, seed: 1 };
  let seed = 1;
  let bg = null;
  const body = [];
  // Collect everything global first, so order does not matter.
  for (const n of nodes.slice(1)) {
    const t = n.tokens;
    if (t[0] === 'farbe') {
      if (t.length !== 3 || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(t[1])) fail(n.line, 'color <name> <rrggbb>');
      if (HEX.test(t[1])) fail(n.line, 'color name "' + t[1] + '" looks like a hex color');
      if (ATTRS.has(t[1]) || TEXTURES.has(t[1]) || RESERVED.has(t[1])) fail(n.line, 'color name "' + en(t[1]) + '" is a keyword, please pick another name');
      if (ctx.palette.has(t[1])) fail(n.line, 'color ' + t[1] + ' already exists');
      ctx.palette.set(t[1], null);
    }
  }
  if (!ctx.palette.has('papier')) ctx.palette.set('papier', 'f8f4ec');
  for (const n of nodes.slice(1)) {
    const t = n.tokens;
    if (t[0] === 'farbe') ctx.palette.set(t[1], color(t[2], ctx, n.line));
    else if (t[0] === 'seed') seed = Math.round(evalExpr(t[1] || '', ctx, n.line));
    else if (t[0] === 'licht') {
      if (t[1] === 'aus') { ctx.light = null; continue; }
      const v = LIGHT[t[1]];
      if (!v) fail(n.line, 'light ' + (t[1] || '') + ': direction like top-left, right, off');
      let kraft = 0.6;
      if (t[2] === 'kraft') kraft = evalExpr(t[3] || '', ctx, n.line);
      else if (t[2] !== undefined) fail(n.line, 'light <direction> [strength 0..1]');
      const l = Math.hypot(v[0], v[1]);
      ctx.light = { v: { x: v[0] / l, y: v[1] / l }, kraft: Math.max(0, Math.min(1, kraft)) };
    } else if (t[0] === 'vorlage') {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t[1] || '')) fail(n.line, 'template <name> [param=value ...]');
      if (ctx.templates.has(t[1])) fail(n.line, 'template ' + t[1] + ' already exists');
      ctx.templates.set(t[1], { name: t[1], body: n.children, params: t.slice(2), line: n.line });
    } else if (t[0] === 'hintergrund') bg = n;
    else if (t[0] === 'stil') {
      if (t.length !== 2 || !['normal', 'aquarell'].includes(t[1])) fail(n.line, 'style normal | watercolor');
      ctx.stil = t[1];
    }
    else body.push(n);
  }
  ctx.rand = rng(seed * 2654435761);
  ctx.seed = seed;
  for (const tpl of ctx.templates.values()) {
    tpl.defaults = {};
    for (const p of tpl.params) {
      const eq = p.indexOf('=');
      if (eq < 1) fail(tpl.line, 'parameter "' + p + '" needs a default value, like h=80');
      tpl.defaults[p.slice(0, eq)] = argValue(p.slice(eq + 1), ctx, tpl.line);
    }
  }

  const out = new Out();
  let content = '';
  if (bg) {
    const t = bg.tokens;
    let fill;
    if (t[1] === 'farbe') fill = { type: 'farbe', c: color(t[2], ctx, bg.line) };
    else if (t[1] === 'verlauf' || t[1] === 'radial') fill = readAttrs(t, 1, ctx, bg.line, new Set(['verlauf', 'radial'])).fill;
    else fill = { type: 'farbe', c: color(t[1], ctx, bg.line) };
    content += '<rect width="' + W + '" height="' + H + '" fill="' + fillPaint(fill, out) + '"/>';
  }
  content += block(body, ctx, out, [1, 0, 0, 1]);
  if (ctx.stil === 'aquarell') {
    const paper = papier(W, H, ctx, out);
    content = '<rect width="' + W + '" height="' + H + '" fill="#' + ctx.palette.get('papier') + '"/><g mask="url(#blatt)" filter="url(#lavur)">' + content + '</g>' + paper;
  }
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
    (out.defs.length ? '<defs>' + out.defs.join('') + '</defs>' : '') + content + '</svg>\n';
  return { svg, width: W, height: H };
}
