/** verify-contrast-sweep · Material II, contrast and gradation app-wide (slice M; MASTER_SPEC §1.2 and the Dogen gate
 * D1–D4; contract §6 "Material II"). John, 2026-10-15: "things can be their own color. That is not a problem. But the
 * contrast should be deeply considered and have roots in artistic or aesthetic inspiration… Color gradation throughout
 * the app is actually preferred and can bring deeper focus and texture and professionalism but it has to be done right".
 * Served build only (KAIRO_SITE_DIR + KAIRO_ARTIFACT_SHA256), 390×844, touch, service workers blocked, reduced motion,
 * real WebKit AND Chromium (each engine's browser.version() is logged). All eleven worlds × the key screens: the shelf's
 * first screen, the reader, the slip, the word's page (top, then scrolled to its examples), Today, Learn, Words, Me,
 * Settings, the deck's front and back. Nothing is filtered: every failing pair is listed.
 *   C1 text   every visible text run reads at ≥ 4.5:1, large text (≥ 24 px, or ≥ 18.67 px at ≥ 700) at ≥ 3:1, against the
 *             pixels actually under it: the screen is shot a second time with every glyph made transparent, and the run's
 *             colour (its alpha times its ancestors' opacity) is composited over the darkest and the lightest pixel under
 *             its glyph band (2 % trimmed for antialiasing). A gradient is tested at its extremes, never its mean. Text
 *             whose paint cannot be resolved — clipped-to-text or stroke-only glyphs, a blend mode, a colour filter — is
 *             UNRESOLVED and fails coverage; it is never assumed to pass, and a background is never assumed white.
 *   C2 figure every overlay (the slip, the deck card) stands on its page: on at least one whole side its fill, or a lit
 *             edge, reads at ≥ 3:1 against the ground just outside it (D1).
 *   C3 roots  every gradient painted on a key screen, and every paint on the surfaces Material II owns (the bars, the
 *             Line, the heroes, the page's head, the key-kanji sheets), resolves only to the world's own pigments — the
 *             twenty tokens its block in corridor.css declares, the house gold, and the five roles contract §6 tables —
 *             one of them, or a mix of two (any alpha, within 3/255). A literal off-world colour is red (D3).
 *   C4 band   each painted gradient layer that is a gradation (not a hard-stop drawing), drawn alone at its own size in
 *             the engine: ≤ 1 visible tonal step per 24 px — steps = max(⌊ΔE76 across the window ÷ 2.3⌋, single-pixel
 *             jumps ≥ 2.3 ΔE76) over every 24-px window of rows and columns 6 px apart (2.3 = one just-noticeable
 *             difference). Hard-stop drawings (hairlines, dots) are drawn, not gradation: C3 still applies (D4).
 *   C5 kanji  the picture-less articles' key-kanji sheets wear an あてなしぼかし wash — a radial gradient of the world's
 *             own pigment behind the glyph, visibly deeper at its heart than at its corners (ΔE76 ≥ 2) — and the kanji
 *             reads at ≥ 4.5:1 on the darkest pixel under it.
 *   C6 muddy  in a day world no painted surface sits between ink and paper: an opaque surface whose luminance is under
 *             92 % of its page's, yet not deep enough to be an ink (≥ 3:1 against the page), is muddy (brief decision 3).
 *   C7 source every gradient in every sheet the screens load (the lazy deck and guided sheets too) carries its comment —
 *             `bokashi: ichimonji|atenashi|urushi|emitted — surface — depth|light|brush|focus`, or `drawn:` for a hard-stop
 *             drawing — or is a mask (alpha only, no pigment); and no bokashi or drawing names a literal colour.
 * Negative controls (one-hand/M/neg): a literal #1f3a5f → transparent top bar → C3 red; the key-kanji sheet flat again
 * → C5 red; the bar's ink lowered onto its paper → C1 red; the word's page at 85 % of its page's luminance → C6 red. */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';

assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['webkit', 'chromium'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const WORLDS = Object.freeze(['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku']);
const NIGHT = new Set(['rokusho', 'yoru', 'nami', 'hakuu', 'kaku']);
const STATE_NAMES = Object.freeze(['shelf', 'reader', 'slip', 'page', 'page-examples', 'today', 'learn', 'words', 'me', 'settings', 'deck-front', 'deck-back']);
// a partial run (SWEEP_WORLDS / SWEEP_STATES) is for a builder's iteration only: it can never pass as an acceptance
const onlyWorlds = process.env.SWEEP_WORLDS ? process.env.SWEEP_WORLDS.split(',') : null;
const onlyStates = process.env.SWEEP_STATES ? process.env.SWEEP_STATES.split(',') : null;
const partial = !!(onlyWorlds || onlyStates);
const worlds = WORLDS.filter((w) => !onlyWorlds || onlyWorlds.includes(w));
const states = STATE_NAMES.filter((s) => !onlyStates || onlyStates.includes(s));
assert(worlds.length && states.length, 'nothing to sweep');
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const STORY = Object.freeze({ id: 'kantei:jp-105-actions-202609-25startup', search: 'スタートアップ大賞' });
const WORD = '総理';
const DPR = 2;
const JND = 2.3;
// the surfaces Material II owns: every paint on them, flat or graded, must root in the world's pigments (C3)
const OWNED = '[data-bar], #app > .chrome, .primary-tabs, .today-hero, .learn-stage, .me-book, .story-picture.is-kanji, #sheet > .sheet-bar';
// the overlays that must stand as figures on their page (C2), per state
const FIGURES = Object.freeze({ slip: ['#mini'], 'deck-front': ['#kp-card'], 'deck-back': ['#kp-card'] });
// deliberate inks that may sit deeper than their page without being muddy (C6): the slip's band, the grade pigments, the
// seal, and the deck's 朱 marks on its cloze target and blank (a mark on a word, not a surface)
const INKS = '#mini .mini-head, .kp-grades button, .grade, [class*="grade-"], .theme-seal, .seal, .kp-target, .kp-blank';

const rows = [];
let engine = '';
const check = (id, title, ok, observed = '') => {
  rows.push({ id: `${engine}/${id}`, title, ok: !!ok, observed });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${engine}/${id} ${title}${ok ? '' : ` — ${JSON.stringify(observed).slice(0, 900)}`}`);
  return !!ok;
};

/* ------------------------------------------------------------------ colour */
function parseColour(text) {
  const s = String(text || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  let m = s.match(/^rgba?\(([^)]*)\)$/);
  if (m) {
    const parts = m[1].replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean);
    const [r, g, b] = parts.slice(0, 3).map(Number);
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
    return [r, g, b, a].every(Number.isFinite) ? { r, g, b, a } : null;
  }
  m = s.match(/^color\(srgb\s+([^)]*)\)$/);
  if (m) {
    const parts = m[1].replace(/\//g, ' ').split(/\s+/).filter(Boolean);
    const [r, g, b] = parts.slice(0, 3).map((v) => (v.endsWith('%') ? Number(v.slice(0, -1)) / 100 : Number(v)) * 255);
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? Number(parts[3].slice(0, -1)) / 100 : Number(parts[3]);
    return [r, g, b, a].every(Number.isFinite) ? { r, g, b, a } : null;
  }
  m = s.match(/^ok(lch|lab)\(([^)]*)\)$/);
  if (m) {
    const parts = m[2].replace(/\//g, ' ').split(/\s+/).filter(Boolean);
    const num = (v, scale = 1) => (v.endsWith('%') ? (Number(v.slice(0, -1)) / 100) * scale : Number(v));
    const L = num(parts[0]);
    let A, B;
    if (m[1] === 'lch') { const C = num(parts[1], 0.4), h = (Number(parts[2]) * Math.PI) / 180; A = C * Math.cos(h); B = C * Math.sin(h); }
    else { A = num(parts[1], 0.4); B = num(parts[2], 0.4); }
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, mm = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, ss = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    const lin = [4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * ss, -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * ss, -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * ss];
    const enc = (x) => 255 * Math.max(0, Math.min(1, x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
    const a = parts[3] === undefined ? 1 : num(parts[3]);
    const [r, g, b] = lin.map(enc);
    return [r, g, b, a].every(Number.isFinite) ? { r, g, b, a } : null;
  }
  m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  return null;
}
const hex = (c) => `#${[c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}${c.a !== undefined && c.a < 1 ? `/${Math.round(c.a * 100)}%` : ''}`;
const channel = (v) => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const luminance = (c) => 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
const ratio = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
function lab(c) {
  const [R, G, B] = [channel(c.r), channel(c.g), channel(c.b)];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const x = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
/** Is the colour one of the pigments, or on the straight line between two of them (a two-pigment srgb mix)? */
function rooted(c, pigments, tol = 3) {
  let best = { d: Infinity };
  for (let i = 0; i < pigments.length; i++) {
    const p = pigments[i];
    const d0 = Math.max(Math.abs(c.r - p.r), Math.abs(c.g - p.g), Math.abs(c.b - p.b));
    if (d0 < best.d) best = { d: d0, via: [p.name] };
    for (let j = i + 1; j < pigments.length; j++) {
      const q = pigments[j], v = [q.r - p.r, q.g - p.g, q.b - p.b], w = [c.r - p.r, c.g - p.g, c.b - p.b];
      const vv = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
      if (!vv) continue;
      const t = Math.max(0, Math.min(1, (w[0] * v[0] + w[1] * v[1] + w[2] * v[2]) / vv));
      const d = Math.max(Math.abs(c.r - (p.r + t * v[0])), Math.abs(c.g - (p.g + t * v[1])), Math.abs(c.b - (p.b + t * v[2])));
      if (d < best.d) best = { d, via: [p.name, q.name], t: Math.round(t * 100) };
    }
  }
  return { ok: best.d <= tol, ...best };
}

/* ------------------------------------------------------------------ gradients */
function splitTop(text, sep = ',') {
  const out = [];
  let depth = 0, at = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === sep && depth === 0) { out.push(text.slice(at, i).trim()); at = i + 1; }
  }
  out.push(text.slice(at).trim());
  return out.filter(Boolean);
}
const COLOUR_TOKEN = /(rgba?\([^()]*\)|color\(srgb[^()]*\)|#[0-9a-f]{3,8}\b|\btransparent\b|\bcurrentcolor\b|\b(?:oklch|oklab|lab|lch|hsla?|hwb|color)\([^()]*\))/gi;
function parseGradient(layer) {
  const m = layer.match(/^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/s);
  if (!m) return null;
  const args = splitTop(m[3]);
  const stops = [];
  let head = '';
  for (const [i, arg] of args.entries()) {
    const colours = arg.match(COLOUR_TOKEN) || [];
    if (!colours.length) { if (i === 0) head = arg; continue; }
    const colour = colours[0];
    const positions = arg.replace(colour, '').trim().split(/\s+(?![^(]*\))/).filter(Boolean);
    stops.push({ text: colour, colour: parseColour(colour), positions });
  }
  return { repeating: !!m[1], kind: m[2], head, stops };
}
/** A drawing, not a gradation: every change of colour happens at one point (≤ 1 CSS px). */
function drawn(gradient, extent) {
  const term = (t) => (/^-?[\d.]+px$/.test(t) ? parseFloat(t) : /^-?[\d.]+%$/.test(t) ? (parseFloat(t) / 100) * extent : /^-?[\d.]+$/.test(t) && Number(t) === 0 ? 0 : NaN);
  const at = (pos, i, n) => {
    if (pos === undefined) return n > 1 ? (i / (n - 1)) * extent : 0;
    const calc = pos.match(/^calc\((.*)\)$/);
    if (!calc) return term(pos);
    // calc() of px and % terms joined by + and − (what the sheets write)
    const parts = calc[1].replace(/\s+([+-])\s+/g, ' $1').trim().split(/\s+/);
    return parts.reduce((sum, p) => sum + (p.startsWith('+') ? term(p.slice(1)) : p.startsWith('-') && !/^-[\d.]/.test(p) ? -term(p.slice(1)) : term(p)), 0);
  };
  const marks = [];
  const n = gradient.stops.length;
  gradient.stops.forEach((s, i) => {
    const ps = s.positions.length ? s.positions : [undefined];
    for (const p of ps) marks.push({ c: s.colour, x: at(p, i, n) });
  });
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1], b = marks[i];
    if (!a.c || !b.c) return false;
    const same = Math.abs(a.c.r - b.c.r) + Math.abs(a.c.g - b.c.g) + Math.abs(a.c.b - b.c.b) < 1 && Math.abs((a.c.a ?? 1) - (b.c.a ?? 1)) < 0.01;
    if (same) continue;
    if (!Number.isFinite(a.x) || !Number.isFinite(b.x) || Math.abs(b.x - a.x) > 1) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ pixels */
function decodePng(buffer) {
  let at = 8, width = 0, height = 0, depth = 0, type = 0, interlace = 0;
  const idat = [];
  while (at < buffer.length) {
    const length = buffer.readUInt32BE(at), kind = buffer.toString('latin1', at + 4, at + 8), data = buffer.subarray(at + 8, at + 8 + length);
    if (kind === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    at += 12 + length;
  }
  assert(depth === 8 && (type === 2 || type === 6) && interlace === 0, `unexpected screenshot PNG: depth ${depth}, colour type ${type}, interlace ${interlace}`);
  const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync(Buffer.concat(idat)), px = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride), line = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      line[x] = v & 255;
    }
    for (let x = 0; x < width; x++) for (let k = 0; k < 3; k++) px[(y * width + x) * 3 + k] = line[x * bpp + k];
    [prev, line] = [line, prev];
  }
  return { width, height, px };
}
const pixel = (img, x, y) => {
  const X = Math.max(0, Math.min(img.width - 1, Math.round(x))), Y = Math.max(0, Math.min(img.height - 1, Math.round(y))), i = (Y * img.width + X) * 3;
  return { r: img.px[i], g: img.px[i + 1], b: img.px[i + 2], a: 1 };
};
/** Pixels under a CSS-px box (device pixels, every `step` CSS px). */
function sample(img, box, step = 1) {
  const out = [];
  for (let y = box.top; y < box.bottom; y += step) for (let x = box.left; x < box.right; x += step) out.push(pixel(img, x * DPR + DPR / 2, y * DPR + DPR / 2));
  return out;
}
function extremes(list, trim = 0.02) {
  const sorted = list.map((c) => ({ c, y: luminance(c) })).sort((a, b) => a.y - b.y);
  const cut = sorted.length >= 50 ? Math.floor(sorted.length * trim) : 0;
  return { dark: sorted[cut].c, light: sorted[sorted.length - 1 - cut].c };
}
const median = (list) => {
  const sorted = list.map((c) => ({ c, y: luminance(c) })).sort((a, b) => a.y - b.y);
  return sorted[Math.floor(sorted.length / 2)].c;
};
/** Visible tonal steps per 24-px window along rows and columns 6 px apart (C4). */
/* Two readings of D4, both enforced. Banding: a step the eye can see between neighbouring CSS pixels (ΔE76 ≥ 2.3, one
 * just-noticeable difference) — at most one in any 24 px. Slope: the tone travelled inside any 24 px, in JNDs, rounded
 * down — at most one, so a bokashi lifts gently and never reads as an edge. */
function banding(img) {
  const W = img.width / DPR, H = img.height / DPR, labAt = (x, y) => lab(pixel(img, x * DPR + DPR / 2, y * DPR + DPR / 2));
  let worst = { steps: 0, jumps: 0, slope: 0 };
  const line = (points, where) => {
    const L = points.map(([x, y]) => labAt(x, y));
    // a gradient narrower than 24 px is judged over its own length (from 8 px)
    const win = Math.min(24, L.length);
    if (win < 8) return;
    for (let s = 0; s + win <= L.length; s += 2) {
      let jumps = 0, lo = s, hi = s;
      for (let i = s; i < s + win; i++) {
        if (L[i][0] < L[lo][0]) lo = i;
        if (L[i][0] > L[hi][0]) hi = i;
        if (i > s && dE(L[i], L[i - 1]) >= JND) jumps++;
      }
      const span = Math.max(dE(L[s], L[s + win - 1]), dE(L[lo], L[hi]));
      const slope = Math.floor(span / JND), steps = Math.max(slope, jumps);
      if (steps > worst.steps) worst = { steps, jumps, slope, span: Math.round(span * 10) / 10, where: `${where}@${s}` };
    }
  };
  for (let y = 3; y < H; y += 6) line(Array.from({ length: Math.floor(W) }, (_, x) => [x, y]), `row y=${y}`);
  for (let x = 3; x < W; x += 6) line(Array.from({ length: Math.floor(H) }, (_, y) => [x, y]), `col x=${x}`);
  return worst;
}

/* ------------------------------------------------------------------ the page side */
const IN_PAGE = () => {
  window.__sweep = {};
  const path = (el) => {
    const bits = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && i < 4; n = n.parentElement, i++) {
      let s = n.localName;
      if (n.id) { s += `#${n.id}`; bits.unshift(s); break; }
      const cls = [...n.classList].slice(0, 2).join('.');
      if (cls) s += `.${cls}`;
      bits.unshift(s);
    }
    return bits.join(' > ');
  };
  const alphaOf = (c) => { const m = String(c).match(/[\d.]+%?/g) || []; const a = m[3]; return a === undefined ? 1 : a.endsWith('%') ? parseFloat(a) / 100 : Number(a); };
  window.__sweep.collect = (owned, figures, inks) => {
    const vw = innerWidth, vh = innerHeight, root = document.documentElement, body = document.body;
    const probe = document.createElement('i');
    probe.style.cssText = 'position:fixed;left:-99px;top:-99px;width:1px;height:1px;pointer-events:none';
    body.append(probe);
    const colourOf = (value) => { probe.style.color = 'rgb(1, 2, 3)'; probe.style.color = value; return getComputedStyle(probe).color; };
    // the world's pigments: the twenty tokens every world block in corridor.css declares (the bare :root is ベロ藍's
    // block), each found declared on :root in corridor.css, plus the house gold 金 (--gold, the same :root) — not the
    // other house constants (the review card's, the lacquer sheet's, the SRS marks'), which no world chose
    const WORLD_TOKENS = ['--zen-stage-deep', '--zen-stage', '--zen-stage-crown', '--zen-text', '--zen-accent', '--zen-red', '--zen-glow',
      '--ground', '--ground-2', '--ground-0', '--ink', '--ink-2', '--red', '--red-wash', '--line', '--line-soft', '--faint', '--faint-2',
      '--ai', '--ai-wash', '--gold'];
    const names = new Set();
    for (const sheet of document.styleSheets) {
      if (!/\/corridor\.css(\?|$)/.test(sheet.href || '')) continue;
      let list; try { list = sheet.cssRules; } catch { continue; }
      for (const rule of list) {
        if (!(rule instanceof CSSStyleRule) || !/^:root(\[|$)/.test(rule.selectorText)) continue;
        let hit = false; try { hit = root.matches(rule.selectorText); } catch { hit = false; }
        if (!hit) continue;
        for (let i = 0; i < rule.style.length; i++) if (WORLD_TOKENS.includes(rule.style[i])) names.add(rule.style[i]);
      }
    }
    const rs = getComputedStyle(root), pigments = [];
    for (const name of names) {
      const value = rs.getPropertyValue(name).trim();
      if (!value || /^[\d.]+(px|%|em)?$/.test(value)) continue;
      const colour = colourOf(value);
      if (colour === 'rgb(1, 2, 3)' && value.replace(/\s/g, '') !== 'rgb(1,2,3)') continue;
      pigments.push({ name, value, colour });
    }
    // and the five pigment roles each world names (contract §6 tables them: the default world's ink #14171d and 藍
    // #1f3a5f, 柿's deeper 藍, 夜's lit 藍 — D3 allows the world blocks and the §6 table, nothing else)
    const bs = getComputedStyle(body);
    for (const name of ['--color-ink', '--color-accent', '--color-signal', '--color-paper', '--color-ground']) {
      const value = bs.getPropertyValue(name).trim();
      if (value) pigments.push({ name: `role ${name}`, value, colour: colourOf(value) });
    }
    const page = colourOf('var(--color-page, var(--page, var(--ground)))');
    const bodyBg = getComputedStyle(body).backgroundColor;
    // painted layers: every element (and its ::before/::after) that reaches the viewport
    const paints = [];
    const seen = [body, root, ...body.querySelectorAll('*')];
    for (const el of seen) {
      if (el === probe) continue;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.opacity === '0') continue;
      const inView = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
      for (const pseudo of [null, '::before', '::after']) {
        const s = pseudo ? getComputedStyle(el, pseudo) : cs;
        if (pseudo && (s.content === 'none' || s.content === 'normal' || s.display === 'none')) continue;
        if (!inView && !(pseudo && s.position === 'fixed')) continue;
        if (s.visibility !== 'visible') continue;
        const img = s.backgroundImage || 'none', bg = s.backgroundColor;
        const grad = /gradient\(/.test(img), url = /url\(/.test(img);
        const a = alphaOf(bg);
        const isOwned = !!el.matches?.(owned);
        if (!grad && !(a > 0)) continue;
        const pw = parseFloat(s.width), ph = parseFloat(s.height);
        const w = pseudo ? (Number.isFinite(pw) ? pw : r.width) : r.width, h = pseudo ? (Number.isFinite(ph) ? ph : r.height) : r.height;
        const box = pseudo && s.position === 'fixed' ? { left: 0, top: 0, right: vw, bottom: vh } : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        const id = paints.length;
        if (grad) { el.dataset.sweepPaint = el.dataset.sweepPaint ? `${el.dataset.sweepPaint} ${id}` : String(id); }
        paints.push({
          id, sel: path(el) + (pseudo || ''), pseudo, owned: isOwned, ink: !!el.matches?.(inks), img: grad ? img : null, url, bg, alpha: a,
          size: s.backgroundSize, position: s.backgroundPosition, repeat: s.backgroundRepeat, origin: s.backgroundOrigin, clip: s.backgroundClip,
          blend: s.mixBlendMode, bgBlend: s.backgroundBlendMode, w: Math.min(w, 2 * vw), h: Math.min(h, 2 * vh), box,
          area: pseudo && !(s.position === 'fixed') ? w * h : Math.max(0, Math.min(box.right, vw) - Math.max(box.left, 0)) * Math.max(0, Math.min(box.bottom, vh) - Math.max(box.top, 0)),
        });
      }
    }
    // text runs
    const texts = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const content = n.nodeValue.replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!content || !el || el === probe || el.closest('script, style, noscript, template, title')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible' || cs.display === 'none') continue;
      range.selectNodeContents(n);
      let rects = [...range.getClientRects()].map((q) => ({ left: q.left, top: q.top, right: q.right, bottom: q.bottom }));
      // clip by every scrolling or clipping ancestor
      for (let a = el; a && a !== root; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/inset\(50%\)/.test(s.clipPath || '') || /rect\(0px,? 0px,? 0px,? 0px\)/.test(s.clip || '')) { rects = []; break; }
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
          const q = a.getBoundingClientRect();
          rects = rects.map((x) => ({ left: Math.max(x.left, q.left), top: Math.max(x.top, q.top), right: Math.min(x.right, q.right), bottom: Math.min(x.bottom, q.bottom) }));
        }
      }
      rects = rects.map((x) => ({ left: Math.max(x.left, 0), top: Math.max(x.top, 0), right: Math.min(x.right, vw), bottom: Math.min(x.bottom, vh) }))
        .filter((x) => x.right - x.left >= 2 && x.bottom - x.top >= 4);
      if (!rects.length) continue;
      let opacity = 1, blend = '', filter = '';
      for (let a = el; a; a = a.parentElement) {
        const s = getComputedStyle(a);
        opacity *= Number(s.opacity);
        if (s.mixBlendMode !== 'normal') blend = s.mixBlendMode;
        if (s.filter && s.filter !== 'none' && !/^(drop-shadow\([^)]*\)\s*)+$/.test(s.filter)) filter = s.filter;
      }
      if (opacity < 0.02) continue;
      // occluded: none of three probes along the first rect lands on the run's element or its family
      const q = rects[0], ys = (q.top + q.bottom) / 2;
      const family = (hit) => !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      const hits = [q.left + 2, (q.left + q.right) / 2, q.right - 2].map((x) => document.elementFromPoint(x, ys));
      if (!hits.some(family)) { texts.push({ occluded: true, text: content.slice(0, 30), sel: path(el) }); continue; }
      const svg = el instanceof SVGElement;
      const fill = svg ? cs.fill : (cs.webkitTextFillColor || cs.color);
      texts.push({
        text: content.slice(0, 40), sel: path(el), rects, colour: fill, colourProp: cs.color, opacity, blend, filter,
        clipText: /text/.test(cs.backgroundClip || '') || /text/.test(cs.webkitBackgroundClip || ''),
        stroke: parseFloat(cs.webkitTextStrokeWidth || '0') > 0, fontPx: parseFloat(cs.fontSize), weight: Number(cs.fontWeight) || 400,
        hidden: !!el.closest('[aria-hidden="true"]'),
      });
    }
    const figureRects = [];
    for (const selector of figures) {
      const el = document.querySelector(selector);
      if (!el) { figureRects.push({ selector, missing: true }); continue; }
      const r = el.getBoundingClientRect();
      figureRects.push({ selector, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
    }
    const kanji = [...document.querySelectorAll('.story-picture.is-kanji')].map((pic) => {
      const r = pic.getBoundingClientRect(), s = getComputedStyle(pic), glyph = pic.querySelector('.story-hero-kanji');
      if (!(r.bottom > 0 && r.top < vh && r.width > 0)) return null;
      const g = glyph?.getBoundingClientRect();
      // judged only where its heart is on the glass (not under the Line, not past the fold)
      const hit = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      if (!hit || !(hit === pic || pic.contains(hit))) return null;
      return { sel: path(pic), rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, img: s.backgroundImage, bg: s.backgroundColor,
        glyph: glyph ? { text: glyph.textContent, colour: getComputedStyle(glyph).color, rect: { left: g.left, top: g.top, right: g.right, bottom: g.bottom } } : null };
    }).filter(Boolean);
    probe.remove();
    return {
      pigments, page, bodyBg, paints, texts, figures: figureRects, kanji,
      meta: { theme: root.dataset.theme || 'hokusai', room: root.dataset.room || '', view: body.dataset.view || '', scrollY, sheetTop: document.getElementById('sheet')?.scrollTop ?? null },
    };
  };
  window.__sweep.hide = (on) => {
    let style = document.getElementById('sweep-hide');
    if (!on) { style?.remove(); return; }
    if (!style) {
      style = document.createElement('style');
      style.id = 'sweep-hide';
      style.textContent = `*, *::before, *::after, *::marker, ::placeholder { color: transparent !important; -webkit-text-fill-color: transparent !important;
        text-shadow: none !important; caret-color: transparent !important; text-decoration-color: transparent !important;
        -webkit-text-stroke-color: transparent !important; transition: none !important; }
        svg text, svg tspan { fill: transparent !important; stroke: transparent !important; }`;
      document.head.append(style);
    }
  };
  /** One layer of one painted surface, drawn alone at its own size over its own base (C4). */
  window.__sweep.replica = (spec) => {
    document.getElementById('sweep-replica')?.remove();
    document.documentElement.style.background = '#808080';
    if (!spec) return null;
    const d = document.createElement('div');
    d.id = 'sweep-replica';
    d.style.cssText = `position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;width:${spec.w}px;height:${spec.h}px;` +
      `background-color:${spec.base};background-repeat:${spec.repeat};background-size:${spec.size};background-position:${spec.position};`;
    d.style.backgroundImage = spec.layer;
    document.documentElement.append(d);
    return d.getBoundingClientRect().width;
  };
};

/* ------------------------------------------------------------------ the walk */
const host = await startStaticHost({ site, port: 0 });
const origin = host.origin;
async function ready(page) { await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 }); }
async function settle(page, ms = 450) {
  await page.waitForFunction(() => !document.documentElement.dataset.roomTransition, null, { timeout: 8000 }).catch(() => {});
  await delay(ms);
  await page.evaluate(async () => { await document.fonts.ready; await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); });
}
async function eagerImages(page) {
  await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('img')].filter((i) => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight * 1.5; });
    for (const img of imgs) img.loading = 'eager';
    await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
  });
}
async function lazySheets(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('link[rel="stylesheet"]')].every((l) => !!l.sheet), null, { timeout: 8000 }).catch(() => {});
}
const STEPS = {
  async shelf(page) {
    await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await ready(page);
    await page.evaluate(() => scrollTo(0, 0)); await eagerImages(page); await settle(page, 700);
  },
  async reader(page) {
    if (!(await page.locator('#shelf-body').count())) { await page.goto(`${origin}/index.html?entry=shelf&ui=bi`); await ready(page); }
    const direct = page.locator(`[data-passage="${STORY.id}"]:not([data-recommendation]) .shelf-open`).first();
    if (await direct.count()) await direct.click();
    else {
      await openShelfTools(page);
      await page.locator('#shelf-reading-search').fill(STORY.search);
      await page.locator('#shelf-reading-search').press('Enter');
      await page.locator(`#shelf-reading-results [data-passage="${STORY.id}"] .shelf-open`).first().click();
    }
    await page.locator('#reader .tok[data-index]').first().waitFor({ timeout: 20000 });
    await page.evaluate(() => scrollTo(0, 0)); await eagerImages(page); await settle(page, 800);
  },
  async slip(page) {
    await page.locator(`#reader .tok[aria-label="${WORD}"]`).first().tap();
    await page.locator('#mini .mini-word').waitFor({ timeout: 15000 });
    await settle(page, 1300);
  },
  async page(page) {
    await page.locator('#mini .mini-word').tap();
    await page.locator('#sheet').waitFor({ timeout: 15000 });
    await page.waitForFunction(() => !document.querySelector('.cut-word') && !document.getAnimations().some((a) => a.id === 'kairo-cut' || String(a.effect?.pseudoElement || '').startsWith('::view-transition')), null, { timeout: 5000 }).catch(() => {});
    await settle(page, 600);
  },
  async 'page-examples'(page) {
    await page.waitForFunction(() => document.querySelectorAll('#sheet .example').length > 0 && !document.querySelector('#sheet .dictionary-opening'), null, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      const ex = document.querySelector('#sheet .example'), s = document.getElementById('sheet');
      if (!ex || !s) return;
      const bar = s.querySelector(':scope > .sheet-bar')?.getBoundingClientRect().bottom || 0;
      const head = ex.previousElementSibling?.classList.contains('eyebrow') ? ex.previousElementSibling : ex;
      s.scrollTop += head.getBoundingClientRect().top - bar - 8;
    });
    await settle(page, 500);
  },
  async today(page) {
    await page.goto(`${origin}/index.html?room=tray&ui=bi`); await ready(page);
    await page.waitForFunction(() => document.querySelectorAll('.today-star:not([hidden])').length > 0, null, { timeout: 6000 }).catch(() => {});
    await eagerImages(page); await settle(page, 700);
  },
  async learn(page) {
    await page.locator('#tab-learn').click();
    await page.waitForFunction(() => document.documentElement.dataset.room === 'learn', null, { timeout: 10000 });
    await page.locator('[data-learn-section="focus"]').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
    await page.evaluate(() => scrollTo(0, 0)); await settle(page, 600);
  },
  async words(page) {
    await page.locator('#tab-words').click();
    await page.locator('.search-page').first().waitFor({ timeout: 10000 });
    await page.evaluate(() => { document.activeElement?.blur?.(); scrollTo(0, 0); }); await settle(page, 600);
  },
  async me(page) {
    await page.locator('#tab-me').click();
    await page.waitForFunction(() => document.documentElement.dataset.room === 'me', null, { timeout: 10000 });
    await page.evaluate(() => scrollTo(0, 0)); await settle(page, 600);
  },
  async settings(page) {
    await page.locator('#me-settings').click();
    await page.waitForFunction(() => document.documentElement.dataset.room === 'settings', null, { timeout: 10000 });
    await page.evaluate(() => scrollTo(0, 0)); await settle(page, 600);
  },
  async 'deck-front'(page) {
    await page.goto(`${origin}/index.html?deck=n1&ui=bi`); await ready(page);
    await page.locator('#kp-start').waitFor({ timeout: 20000 });
    await page.locator('#kp-start').click();
    await page.locator('#kp-card .kp-target').first().waitFor({ timeout: 20000 });
    await lazySheets(page); await resting(page); await settle(page, 300);
  },
  async 'deck-back'(page) {
    await page.locator('#kp-reveal').click();
    await page.locator('#kp-grade-good').waitFor({ timeout: 15000 });
    await resting(page); await settle(page, 300);
  },
};
async function resting(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    const kp = document.querySelector('.kp');
    if (kp) await Promise.allSettled(kp.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().endTime !== Infinity).map((a) => a.finished));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/* ------------------------------------------------------------------ analysis */
function analyse(world, state, data, shot, bands) {
  const out = { world, state, pairs: [], unresolved: [], occluded: 0, figures: [], roots: [], banding: [], kanji: [], muddy: [] };
  const pigments = data.pigments.map((p) => ({ name: p.name, ...parseColour(p.colour) })).filter((p) => Number.isFinite(p.r) && p.a > 0);
  out.pigmentCount = pigments.length;
  const page = parseColour(data.page);
  // C1 text
  for (const t of data.texts) {
    if (t.occluded) { out.occluded++; continue; }
    const record = { text: t.text, sel: t.sel, fontPx: t.fontPx, weight: t.weight, hidden: t.hidden };
    const fg = parseColour(t.colour);
    const why = t.clipText ? 'clipped-to-text' : t.blend ? `blend ${t.blend}` : t.filter ? `filter ${t.filter}` : (!fg ? `paint ${t.colour}` : (fg.a === 0 && t.stroke ? 'stroke-only' : ''));
    if (why) { out.unresolved.push({ ...record, why }); continue; }
    if (fg.a * t.opacity < 0.02) continue;
    const large = t.fontPx >= 24 || (t.fontPx >= 18.67 && t.weight >= 700);
    const required = large ? 3 : 4.5;
    let worst = Infinity, pair = null;
    for (const q of t.rects) {
      const h = q.bottom - q.top, band = { left: q.left + 0.5, right: q.right - 0.5, top: q.top + h * 0.2, bottom: q.bottom - h * 0.2 };
      const under = sample(shot, band, Math.max(1, Math.min(2, (band.right - band.left) / 40)));
      if (!under.length) continue;
      const { dark, light } = extremes(under);
      for (const bg of [dark, light]) {
        const ink = over({ ...fg, a: fg.a * t.opacity }, bg), r = ratio(ink, bg);
        if (r < worst) { worst = r; pair = { fg: hex(fg), bg: hex(bg) }; }
      }
    }
    if (!pair) continue;
    out.pairs.push({ ...record, ratio: Math.round(worst * 100) / 100, required, ...pair, ok: worst >= required });
  }
  // C2 figures
  for (const f of data.figures) {
    if (f.missing) { out.figures.push({ selector: f.selector, ok: false, why: 'missing' }); continue; }
    const r = f.rect, sides = [];
    const vw = shot.width / DPR, vh = shot.height / DPR;
    const sideBoxes = {
      top: { inner: { left: r.left + 6, right: r.right - 6, top: r.top + 3, bottom: r.top + 7 }, outer: { left: r.left + 6, right: r.right - 6, top: r.top - 7, bottom: r.top - 3 }, edge: { left: r.left + 6, right: r.right - 6, top: r.top - 1, bottom: r.top + 2 }, open: r.top > 8 },
      bottom: { inner: { left: r.left + 6, right: r.right - 6, top: r.bottom - 7, bottom: r.bottom - 3 }, outer: { left: r.left + 6, right: r.right - 6, top: r.bottom + 3, bottom: r.bottom + 7 }, edge: { left: r.left + 6, right: r.right - 6, top: r.bottom - 2, bottom: r.bottom + 1 }, open: r.bottom < vh - 8 },
      left: { inner: { left: r.left + 3, right: r.left + 7, top: r.top + 6, bottom: r.bottom - 6 }, outer: { left: r.left - 7, right: r.left - 3, top: r.top + 6, bottom: r.bottom - 6 }, edge: { left: r.left - 1, right: r.left + 2, top: r.top + 6, bottom: r.bottom - 6 }, open: r.left > 8 },
      right: { inner: { left: r.right - 7, right: r.right - 3, top: r.top + 6, bottom: r.bottom - 6 }, outer: { left: r.right + 3, right: r.right + 7, top: r.top + 6, bottom: r.bottom - 6 }, edge: { left: r.right - 2, right: r.right + 1, top: r.top + 6, bottom: r.bottom - 6 }, open: r.right < vw - 8 },
    };
    for (const [name, b] of Object.entries(sideBoxes)) {
      if (!b.open) continue;
      const inner = sample(shot, b.inner, 2), outer = sample(shot, b.outer, 2), edge = sample(shot, b.edge, 1);
      if (!inner.length || !outer.length) continue;
      const ground = median(outer), fill = ratio(median(inner), ground);
      const most = edge.reduce((m, c) => Math.max(m, ratio(c, ground)), 1);
      sides.push({ side: name, fill: Math.round(fill * 100) / 100, edge: Math.round(most * 100) / 100, ground: hex(ground) });
    }
    const best = sides.reduce((m, s) => Math.max(m, s.fill, s.edge), 0);
    out.figures.push({ selector: f.selector, ok: best >= 3, best: Math.round(best * 100) / 100, sides });
  }
  // C3 pigment roots + the layers C4 will draw
  for (const p of data.paints) {
    const stopsOf = [];
    if (p.img) {
      for (const layer of splitTop(p.img)) {
        const g = parseGradient(layer);
        if (!g) { if (/gradient\(/.test(layer)) out.roots.push({ sel: p.sel, ok: false, why: `unparsed ${layer.slice(0, 80)}` }); continue; }
        for (const s of g.stops) {
          if (!s.colour) { out.roots.push({ sel: p.sel, ok: false, why: `unresolved stop ${s.text}` }); continue; }
          stopsOf.push(s.colour);
        }
      }
    }
    if (p.owned) { const c = parseColour(p.bg); if (c && c.a > 0) stopsOf.push(c); }
    for (const c of stopsOf) {
      if (c.a === 0) continue;
      const verdict = rooted(c, pigments);
      if (!verdict.ok) out.roots.push({ sel: p.sel, ok: false, colour: hex(c), nearest: verdict.via, off: Math.round(verdict.d * 10) / 10 });
    }
  }
  // C4 banding (measured by the caller, drawn per layer)
  for (const b of bands) out.banding.push(b);
  // C5 the key-kanji sheets
  for (const k of data.kanji) {
    const layers = k.img && k.img !== 'none' ? splitTop(k.img).map(parseGradient).filter(Boolean) : [];
    const radial = layers.find((g) => g.kind === 'radial' && g.stops.some((s) => s.colour && s.colour.a > 0));
    const rootsOk = layers.every((g) => g.stops.every((s) => !s.colour || s.colour.a === 0 || rooted(s.colour, pigments).ok));
    const r = k.rect, w = r.right - r.left, h = r.bottom - r.top;
    // the heart of the wash, behind the glyph (the glyph itself is transparent in this shot)
    const heart = median(sample(shot, { left: r.left + w * 0.45, right: r.right - w * 0.45, top: r.top + h * 0.45, bottom: r.bottom - h * 0.45 }, 1));
    const corners = median([
      ...sample(shot, { left: r.left + 2, right: r.left + 8, top: r.top + 2, bottom: r.top + 8 }, 1),
      ...sample(shot, { left: r.right - 8, right: r.right - 2, top: r.bottom - 8, bottom: r.bottom - 2 }, 1),
    ]);
    const wash = dE(lab(heart), lab(corners));
    let glyphRatio = null;
    if (k.glyph) {
      const g = k.glyph.rect, fg = parseColour(k.glyph.colour);
      const under = sample(shot, { left: g.left + 2, right: g.right - 2, top: g.top + (g.bottom - g.top) * 0.15, bottom: g.bottom - (g.bottom - g.top) * 0.15 }, 3);
      if (fg && under.length) {
        const { dark, light } = extremes(under);
        glyphRatio = Math.min(ratio(over(fg, dark), dark), ratio(over(fg, light), light));
      }
    }
    out.kanji.push({ sel: k.sel, glyph: k.glyph?.text, radial: !!radial, rootsOk, wash: Math.round(wash * 10) / 10, glyphRatio: glyphRatio && Math.round(glyphRatio * 100) / 100,
      ok: !!radial && rootsOk && wash >= 2 && glyphRatio !== null && glyphRatio >= 4.5 });
  }
  // C6 muddy day surfaces
  if (!NIGHT.has(world) && page) {
    const Yp = luminance(page);
    for (const p of data.paints) {
      // the canvas (html, body) is the page itself, painted over by the page layer; C6 judges what stands on it
      if (p.ink || p.area < 200 || p.url || /^html( > body[^ ]*)?$/.test(p.sel)) continue;
      const tones = [];
      const c = parseColour(p.bg);
      if (c && c.a >= 1) tones.push(c);
      else if (c && c.a > 0) tones.push(over(c, page));
      if (p.img) for (const layer of splitTop(p.img)) {
        const g = parseGradient(layer);
        if (g && !drawn(g, Math.max(p.w, p.h))) for (const s of g.stops) if (s.colour && s.colour.a >= 0.995) tones.push(s.colour);
      }
      for (const t of tones) {
        const Y = luminance(t), deepInk = ratio(t, page) >= 3;
        if (!(Y < 0.92 * Yp) || deepInk) continue;
        // only where it shows: at least a tenth of the pixels in its box are this tone (a covered paint is no surface)
        const box = { left: Math.max(0, p.box.left), right: Math.min(shot.width / DPR, p.box.right), top: Math.max(0, p.box.top), bottom: Math.min(shot.height / DPR, p.box.bottom) };
        const seen = sample(shot, box, Math.max(1, Math.sqrt(((box.right - box.left) * (box.bottom - box.top)) / 900)));
        const L0 = lab(t), share = seen.length ? seen.filter((c) => dE(lab(c), L0) <= 3).length / seen.length : 0;
        if (share < 0.1) continue;
        out.muddy.push({ sel: p.sel, colour: hex(t), share: Math.round((Y / Yp) * 1000) / 10, shows: Math.round(share * 100), page: hex(page) });
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ C7: the sheets themselves */
function sourceAudit() {
  const html = readFileSync(resolve(site, 'index.html'), 'utf8');
  const linked = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)].map((m) => m[1]).filter((h) => !/^https?:/.test(h));
  const sheets = [...new Set([...linked, 'decks/player/player.css', 'guided-session.css', 'guided-moments.css'])].filter((f) => existsSync(resolve(site, f)));
  const found = [];
  for (const file of sheets) {
    const text = readFileSync(resolve(site, file), 'utf8');
    // structure is read with every comment blanked out (a comment may hold a ; or a gradient's name), the words from the text
    const bare = text.replace(/\/\*[\s\S]*?\*\//g, (c) => ' '.repeat(c.length));
    const re = /(repeating-)?(linear|radial|conic)-gradient\(/g;
    for (let m = re.exec(bare); m; m = re.exec(bare)) {
      // the declaration that holds it: back to the last ; { or } outside comments, forward to the next ; or } at depth 0
      let start = m.index, depth = 0;
      for (let i = m.index - 1; i >= 0; i--) {
        const ch = bare[i];
        if (ch === ')') depth++;
        else if (ch === '(') depth--;
        else if (depth === 0 && (ch === ';' || ch === '{' || ch === '}')) { start = i + 1; break; }
        if (i === 0) start = 0;
      }
      let end = text.length; depth = 0;
      for (let i = m.index; i < text.length; i++) {
        const ch = bare[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        else if (depth === 0 && (ch === ';' || ch === '}')) { end = i; break; }
      }
      const declaration = text.slice(start, end);
      const line = text.slice(0, m.index).split('\n').length;
      if (found.some((f) => f.file === file && f.start === start)) continue; // one verdict per declaration
      const property = declaration.replace(/\/\*[\s\S]*?\*\//g, '').trim().split(':')[0].trim();
      const comments = [...declaration.matchAll(/\/\*([\s\S]*?)\*\//g)].map((c) => c[1].trim());
      const mask = /^(-webkit-)?mask(-image)?$/.test(property);
      const tag = comments.find((c) => /^(bokashi|drawn|picture):/.test(c));
      let kind = mask ? 'mask' : tag ? tag.split(':')[0] : 'unclassified';
      let ok = true, why = '';
      // a picture is scene art drawn in CSS (the moments' paper theatre): its colours are the picture's own, as a woodblock
      // print's are — allowed only in the moments' own sheet, and still named
      if (kind === 'picture' && !/guided-moments\.css$/.test(file)) { ok = false; why = 'picture: outside the moments sheet'; }
      if (kind === 'bokashi' && !/^bokashi:\s*(ichimonji|atenashi|urushi|emitted)\s+—\s+.+\s+—\s+(depth|light|brush|focus)\b/.test(tag)) { ok = false; why = `malformed: ${tag.slice(0, 90)}`; }
      if (kind === 'unclassified') { ok = false; why = 'no bokashi/drawn comment'; }
      const code = declaration.replace(/\/\*[\s\S]*?\*\//g, '');
      const literal = code.match(/#[0-9a-f]{3,8}\b|\brgba?\(\s*[\d.]|\bhsla?\(|\b(white|black|red|blue|gray|grey|silver)\b/gi);
      if (kind !== 'mask' && kind !== 'picture' && literal) { ok = false; why = `${why ? `${why}; ` : ''}literal ${[...new Set(literal)].join(' ')}`; }
      found.push({ file, line, start, property, kind, ok, why, comment: tag || '' });
    }
  }
  return found;
}

/* ------------------------------------------------------------------ run */
const report = { identity: { gitSha: identity.gitSha, artifactSha256: identity.artifactSha256 }, partial, worlds, states, engines: {}, results: [], source: null };
mkdirSync(join(evidence, 'shots'), { recursive: true });
try {
  const source = sourceAudit();
  report.source = source;
  engine = 'source';
  const bad = source.filter((s) => !s.ok);
  const count = (k) => source.filter((s) => s.kind === k).length;
  console.log(`source: ${source.length} gradient declarations — bokashi ${count('bokashi')}, drawn ${count('drawn')}, mask ${count('mask')}, picture ${count('picture')}, unclassified ${count('unclassified')}`);
  check('C7', `every gradient in the loaded sheets is a commented bokashi, a commented drawing, a mask, or the moments' named scene art, and no bokashi or drawing names a literal colour (${source.length})`, bad.length === 0,
    bad.slice(0, 400).map((s) => `${s.file}:${s.line} ${s.property} ${s.why}`));

  for (engine of engines) {
    const browser = await ({ chromium, webkit })[engine].launch({ headless: true });
    const version = browser.version();
    report.engines[engine] = version;
    console.log(`engine ${engine} ${version}`);
    for (const world of worlds) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' });
      await silenceBrowserAudio(context);
      await context.addInitScript(IN_PAGE);
      await context.addInitScript((id) => {
        try {
          localStorage.setItem('kairo-theme', id);
          localStorage.setItem('bunki-cloze:prefs:v3:n1', JSON.stringify({ look: 'world', zoom: 'full', sittings: 3, ruleSeen: true }));
        } catch { /* storage refused: the theme check below fails the walk */ }
      }, world);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
      const page = await context.newPage(), errors = [];
      const canvas = await context.newPage();
      await canvas.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0}</style></head><body></body></html>');
      await canvas.evaluate(IN_PAGE);
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.message));
      for (const state of STATE_NAMES) {
        if (!states.includes(state) && !['shelf', 'reader', 'slip', 'page', 'today', 'me', 'deck-front'].includes(state)) continue;
        try {
          await STEPS[state](page);
        } catch (error) {
          if (states.includes(state)) check(`${world}/${state}.reach`, `${world}: reached ${state}`, false, String(error.message || error).slice(0, 400));
          await page.screenshot({ path: join(evidence, 'shots', `${engine}-${world}-${state}-error.jpg`), type: 'jpeg', quality: 70 }).catch(() => {});
          continue;
        }
        if (!states.includes(state)) continue;
        const theme = await page.evaluate(() => document.documentElement.dataset.theme || 'hokusai');
        if (!check(`${world}/${state}.world`, `${world}/${state}: the world is ${world}`, theme === world, theme)) continue;
        await page.screenshot({ path: join(evidence, 'shots', `${engine}-${world}-${state}.jpg`), type: 'jpeg', quality: 88 });
        const data = await page.evaluate(([owned, figures, inks]) => window.__sweep.collect(owned, figures, inks), [OWNED, FIGURES[state] || [], INKS]);
        await page.evaluate(() => window.__sweep.hide(true));
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const shot = decodePng(await page.screenshot({ type: 'png' }));
        await page.evaluate(() => window.__sweep.hide(false));
        // C4: draw each gradation layer alone, once per distinct layer and size
        const bands = [], done = new Set();
        const pageColour = data.page;
        for (const p of data.paints) {
          if (!p.img) continue;
          const layers = splitTop(p.img), sizes = splitTop(p.size || 'auto'), positions = splitTop(p.position || '0% 0%'), repeats = splitTop(p.repeat || 'repeat');
          for (const [i, layer] of layers.entries()) {
            const g = parseGradient(layer);
            if (!g) continue;
            const extent = Math.max(p.w, p.h);
            if (drawn(g, extent) || extent < 24) continue;
            const key = `${layer}|${Math.round(p.w)}x${Math.round(p.h)}|${sizes[i % sizes.length]}`;
            if (done.has(key)) continue;
            done.add(key);
            const bgc = parseColour(p.bg);
            const base = bgc && bgc.a >= 1 ? p.bg : pageColour;
            const w = Math.max(1, Math.min(390, Math.round(p.w))), h = Math.max(1, Math.min(844, Math.round(p.h)));
            await canvas.evaluate((spec) => window.__sweep.replica(spec), { layer, w, h, base, size: sizes[i % sizes.length], position: positions[i % positions.length], repeat: repeats[i % repeats.length] });
            const png = await canvas.screenshot({ type: 'png', clip: { x: 0, y: 0, width: w, height: h } });
            if (process.env.SWEEP_DEBUG) writeFileSync(join(evidence, 'shots', `replica-${engine}-${world}-${state}-${bands.length}.png`), png);
            const img = decodePng(png);
            const worst = banding(img);
            bands.push({ sel: p.sel, layer: layer.slice(0, 160), w, h, ...worst, ok: worst.steps <= 1 });
          }
        }
        await canvas.evaluate(() => window.__sweep.replica(null));
        const result = analyse(world, state, data, shot, bands);
        result.engine = engine;
        report.results.push(result);
        const fails = result.pairs.filter((p) => !p.ok).sort((a, b) => a.ratio / a.required - b.ratio / b.required);
        const worstPair = result.pairs.slice().sort((a, b) => a.ratio / a.required - b.ratio / b.required)[0];
        check(`${world}/${state}.C1`, `${world}/${state}: every visible text run reads (${result.pairs.length} runs; worst ${worstPair ? `${worstPair.ratio}:1 "${worstPair.text}"` : '—'})`,
          fails.length === 0 && result.unresolved.length === 0,
          { fails: fails.slice(0, 12).map((p) => `${p.ratio}<${p.required} ${p.fg} on ${p.bg} "${p.text}" ${p.sel}`), unresolved: result.unresolved.slice(0, 8) });
        if (result.figures.length) check(`${world}/${state}.C2`, `${world}/${state}: the overlay stands as a figure on its page (≥ 3:1 fill or lit edge on one whole side)`,
          result.figures.every((f) => f.ok), result.figures);
        check(`${world}/${state}.C3`, `${world}/${state}: every gradient and every owned surface roots in the world's ${result.pigmentCount} pigments`,
          result.pigmentCount >= 24 && result.roots.length === 0, { pigments: result.pigmentCount, off: result.roots.slice(0, 12) });
        const banded = result.banding.filter((b) => !b.ok);
        check(`${world}/${state}.C4`, `${world}/${state}: no banding, gentle slope — ≤ 1 visible tonal step per 24 px (${result.banding.length} gradation layers drawn)`,
          banded.length === 0, banded.slice(0, 8));
        if (result.kanji.length) check(`${world}/${state}.C5`, `${world}/${state}: the key-kanji sheets wear their wash and the kanji reads ≥ 4.5:1 (${result.kanji.length})`,
          result.kanji.every((k) => k.ok), result.kanji);
        if (!NIGHT.has(world)) check(`${world}/${state}.C6`, `${world}/${state}: no muddy surface (between ink and 92 % of the page)`, result.muddy.length === 0, result.muddy.slice(0, 10));
      }
      if (onlyStates?.includes('shelf') || !onlyStates) {
        const ks = report.results.filter((r) => r.engine === engine && r.world === world && r.state === 'shelf');
        check(`${world}/shelf.C5-present`, `${world}: the shelf's first screen shows a key-kanji sheet`, ks.some((r) => r.kanji.length > 0), ks.map((r) => r.kanji.length));
      }
      check(`${world}.page-errors`, `${world}: no page errors`, errors.length === 0, errors.slice(0, 6));
      await context.close();
    }
    await browser.close();
  }
} finally {
  await host.close?.();
}

// worst pair per world and engine
const table = [];
for (const eng of Object.keys(report.engines)) for (const world of worlds) {
  const pairs = report.results.filter((r) => r.engine === eng && r.world === world).flatMap((r) => r.pairs.map((p) => ({ ...p, state: r.state })));
  const worst = pairs.sort((a, b) => a.ratio / a.required - b.ratio / b.required)[0];
  const unresolved = report.results.filter((r) => r.engine === eng && r.world === world).reduce((n, r) => n + r.unresolved.length, 0);
  table.push({ engine: eng, world, runs: pairs.length, worst: worst ? `${worst.ratio}:1 (needs ${worst.required}) ${worst.state} "${worst.text}" ${worst.fg} on ${worst.bg}` : '—', unresolved });
}
report.table = table;
report.rows = rows;
writeFileSync(join(evidence, `sweep-${engines.join('-')}.json`), JSON.stringify(report, null, 1));
console.log('\nworst pair per world');
for (const t of table) console.log(`  ${t.engine.padEnd(8)} ${t.world.padEnd(9)} runs ${String(t.runs).padStart(5)}  unresolved ${t.unresolved}  ${t.worst}`);
const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} rows green${partial ? ' — PARTIAL RUN (SWEEP_WORLDS/SWEEP_STATES): never an acceptance' : ''}`);
console.log(`artifact ${identity.artifactSha256} @ ${identity.gitSha}`);
process.exitCode = failed.length ? 1 : partial ? 3 : 0;
