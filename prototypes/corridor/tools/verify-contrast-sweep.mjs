/** verify-contrast-sweep · Material II, contrast and gradation app-wide (slice M; MASTER_SPEC §1.2 and the Dogen gate
 * D1–D4; contract §6 "Material II"). John, 2026-10-15: "things can be their own color. That is not a problem. But the
 * contrast should be deeply considered and have roots in artistic or aesthetic inspiration… Color gradation throughout
 * the app is actually preferred and can bring deeper focus and texture and professionalism but it has to be done right".
 * Served build only (KAIRO_SITE_DIR + KAIRO_ARTIFACT_SHA256), 390×844, touch, service workers blocked, reduced motion,
 * real WebKit AND Chromium (each engine's browser.version() is logged). All eleven worlds × the key screens: the shelf's
 * first screen, the reader, the slip, the word's page (top, then scrolled to its examples), Today, Learn, Words, Me,
 * Settings, the tutor's room (Hfix-1B), Guided (its front, then its field map in the open area: Hfix-1B), Speak at rest and its
 * key page (Hfix-1B),
 * the deck's front and back. Nothing is filtered: every failing pair is listed.
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
 *   C8 chrome (Hfix-1A, F-1) the fixed chrome is opaque enough that text under it never shows through: with the reading
 *             scrolled so text lies under the bars, each bar's pixels are the same with what scrolls under them (the
 *             room's, the page's, a deck's content) hidden as with it shown. Judged wherever a bar paints (found over a
 *             #ff00ff ground; a clear strip in a bar's box paints nothing and is no chrome). The controls standing on a bar
 *             (a fixed or sticky element inside its box and on top there, as the deck's key on its foot band) are the bar's
 *             own and stay in every shot.
 *             The declared fade (INT-VH, the lead's ruling of 2026-10-19 on the deck's foot band): a bar at the foot may
 *             declare a top-edge fade with its own `--fade-edge` (a length in px, at most 24 px, leaving the bar a body
 *             below it), so a line scrolling under it recedes instead of being cut. C8 then judges only the pixels below
 *             that declared strip, every one of them, and they must be fully opaque, the controls on the bar included:
 *             the bar and what stands on it give the same pixels over two grounds (#ff00ff, #00ff00), and nothing under
 *             them shows through. A declaration on a bar not at the foot, taller than 24 px, or not a px length is red.
 *             And C1 reads each line where a reader reads it: inside the open reading area between the bars and clear of
 *             their shade (a run's every line probed, not its first alone); a line outside it is read again with the
 *             document or the page scrolled clear, the run keeping its worst pair (F-1's 9 reds were lines read under the
 *             tab bar's edge and shade).
 *             VC-1 (CONTRAST-INTEGRATION-SPEC, lead 2125, sol): each run is its own native occurrence — its text node,
 *             numbered by the census and kept across positions, with the reader token's data-index where it has one; its
 *             path and words are only a label — and each of its lines (its index among the node's line boxes) its own
 *             verdict, completed exactly once. A fixed overlay standing on the glass (the slip, #mini: no bar, yet it owns
 *             its painted pixels) obscures a line whose sampled band its box meets or a probe across the band finds on it;
 *             such a line, like one outside the open area, is read again at a bounded native scroll position where that
 *             very line stands wholly clear (open area; the overlay's box, shadow and outline), checked at that capture.
 *             What no bounded position reads is a named unresolved failure (unexposed, missing native occurrence,
 *             positioning timeout, duplicate completion), never a pass; only a fixed layer's line hidden inside an opaque
 *             bar is barred. The thresholds, the composition and the extremes rule are unchanged.
 * Negative controls (one-hand/M/neg): a literal #1f3a5f → transparent top bar → C3 red; the key-kanji sheet flat again
 * → C5 red; the bar's ink lowered onto its paper → C1 red; the word's page at 85 % of its page's luminance → C6 red;
 * SWEEP_NEGATIVE=translucent-bar (Hfix-1A) → C8 red. In every full run (INT-VH, the lead's ruling): on hokusai's deck front,
 * each engine, the actual foot band's fade undeclared, declared at 30 px, and see-through below its declared strip → C8 red,
 * each restored to the exact style and the exact candidate measurement (rows …/deck-front.C8-control.*).
 * VC-1's C1 controls (diagnostic, SWEEP_NEGATIVE=c1-…, a list): the gold-edge counterexample on the slip (sol's site-10
 * geometry), and on the reader a same-word sibling, a visible low-contrast mutant, a spent positioning budget, an unexposable
 * line, a missing native occurrence and a duplicate completion → C1 red by name, each restored exactly (…/C1-control.*). */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createHash, randomUUID } from 'node:crypto';
import { chromium, webkit } from 'playwright-core';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { silenceBrowserAudio } from './browser-audio-silence.mjs';
import { openShelfTools } from './shelf-tools-support.mjs';
import { readAppRecord } from './record-test-support.mjs';
import { contrastExpectedCases } from '../../../scripts/ci/vh-existing-report-contracts.mjs';
import { judgeContrastArrival, judgeContrastArrivals } from './vh-contrast-arrival.mjs';

const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['webkit', 'chromium'];
assert(engines.every((engine) => ['chromium', 'webkit'].includes(engine)));
const WORLDS = Object.freeze(['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku']);
const NIGHT = new Set(['rokusho', 'yoru', 'nami', 'hakuu', 'kaku']);
// Hfix-1B's five rooms (the tutor's room, Guided and its field map, Speak and its key page) are settled states like the
// rest: the independent admission roster (vh-existing-report-contracts CONTRAST_STATES) lists them in this order
const SETTLED_STATES = Object.freeze(['shelf', 'reader', 'slip', 'page', 'page-examples', 'today', 'learn', 'words', 'me', 'settings', 'tutor', 'guided', 'guided-field', 'speak', 'speak-key', 'deck-front', 'deck-back']);
const STATE_NAMES = Object.freeze([...SETTLED_STATES, 'fresh-demo']);
assert(process.argv.slice(2).every((arg) => arg === '--demo-only') && process.argv.length <= 3, 'Unknown contrast-sweep argument');
const demoOnly = process.argv.includes('--demo-only');
const runId = process.env.KAIRO_GATE_RUN_ID || randomUUID();
// a partial run (SWEEP_WORLDS / SWEEP_STATES) is for a builder's iteration only: it can never pass as an acceptance
const onlyWorlds = Object.hasOwn(process.env, 'SWEEP_WORLDS') ? process.env.SWEEP_WORLDS.split(',') : null;
const onlyStates = Object.hasOwn(process.env, 'SWEEP_STATES') ? process.env.SWEEP_STATES.split(',') : null;
assert(!onlyWorlds || onlyWorlds.every((world) => WORLDS.includes(world)), 'Unknown/empty SWEEP_WORLDS selector');
assert(!onlyStates || onlyStates.every((state) => STATE_NAMES.includes(state)), 'Unknown/empty SWEEP_STATES selector');
assert(!onlyWorlds || new Set(onlyWorlds).size === onlyWorlds.length, 'Duplicate SWEEP_WORLDS selector');
assert(!onlyStates || new Set(onlyStates).size === onlyStates.length, 'Duplicate SWEEP_STATES selector');
// Hfix-1A · a negative control (SWEEP_NEGATIVE=translucent-bar): the tab bar painted see-through, so text under it shows
// through; C8 must go red. INT-VH: a declared control is a selector like the others (VH-1): exact when set, and its run is
// diagnostic, never an acceptance (partial, and named in the receipt's selectors)
const SWEEP_NEGATIVE = Object.hasOwn(process.env, 'SWEEP_NEGATIVE') ? process.env.SWEEP_NEGATIVE : null;
// VC-1 (CONTRAST-INTEGRATION-SPEC item 4) · the C1 controls are declared controls of the same kind: an exact list of known
// ids (no repeat), each run on its own scene of each selected world after that scene's own measurement (c1Controls);
// diagnostic, never acceptance
const C1_CONTROLS = Object.freeze(['c1-gold-edge', 'c1-same-word', 'c1-low-contrast', 'c1-timeout', 'c1-unexposed', 'c1-missing-occurrence', 'c1-duplicate-completion']);
// the scene each runs on: the gold edge where the slip stands over the reader; the rest on the reader at rest
const C1_CONTROL_SCENE = Object.freeze({ 'c1-gold-edge': 'slip' });
const c1SceneOf = (id) => C1_CONTROL_SCENE[id] || 'reader';
const c1ControlIds = SWEEP_NEGATIVE === null || SWEEP_NEGATIVE === 'translucent-bar' ? [] : SWEEP_NEGATIVE.split(',');
assert(SWEEP_NEGATIVE === null || SWEEP_NEGATIVE === 'translucent-bar' ||
  (c1ControlIds.every((id) => C1_CONTROLS.includes(id)) && new Set(c1ControlIds).size === c1ControlIds.length), `unknown SWEEP_NEGATIVE ${SWEEP_NEGATIVE}`);
const partial = demoOnly || !!(onlyWorlds || onlyStates) || SWEEP_NEGATIVE !== null;
const worlds = WORLDS.filter((w) => !onlyWorlds || onlyWorlds.includes(w));
const states = STATE_NAMES.filter((s) => (!demoOnly || s === 'fresh-demo') && (!onlyStates || onlyStates.includes(s)));
assert(worlds.length && states.length, 'nothing to sweep');
assert(c1ControlIds.every((id) => states.includes(c1SceneOf(id))), 'Each C1 control runs on its own scene (the gold edge on the slip, the rest on the reader): select it (SWEEP_STATES)');
assert(process.env.KAIRO_SITE_DIR && process.env.KAIRO_ARTIFACT_SHA256, 'Pin an immutable built site and its digest');
const site = resolveCorridorSite(), evidence = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8'));
const require = createRequire(import.meta.url);
const { startStaticHost } = require('../../bunki-desktop/lib/static-host.cjs');
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
  // VC-1 (CONTRAST-INTEGRATION-SPEC item 1) · one identity per native occurrence: every text node the census walks is
  // numbered the first time it is seen (document order on the first census) and keeps that number for the document's
  // life, so a later census (scrolled, re-collected) names the same node by the same number. The path and the words are
  // only its label: a sibling with the same word or the same CSS path never shares its identity. Each fixed layer the
  // census meets is numbered the same way, so a line knows which overlay is its own.
  const textIds = new WeakMap(), layerIds = new WeakMap();
  let textNext = 0, layerNext = 0;
  const textId = (n) => { let id = textIds.get(n); if (id === undefined) { id = ++textNext; textIds.set(n, id); } return id; };
  const layerId = (el) => { let id = layerIds.get(el); if (id === undefined) { id = ++layerNext; layerIds.set(el, id); } return id; };
  // the top-level layers of a computed box-shadow / filter list (commas inside a colour's parentheses stay)
  const layersOf = (text) => {
    const out = [];
    let depth = 0, at = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') depth--;
      else if (text[i] === ',' && depth === 0) { out.push(text.slice(at, i).trim()); at = i + 1; }
    }
    out.push(text.slice(at).trim());
    return out.filter((s) => s && s !== 'none');
  };
  const COLOUR_IN = /(rgba?\([^()]*\)|color\([^()]*\)|(?:ok)?(?:lab|lch)\([^()]*\)|hsla?\([^()]*\)|hwb\([^()]*\)|#[0-9a-f]{3,8}\b|\btransparent\b|\bcurrentcolor\b)/i;
  /** What a fixed layer paints past its border box: its outer shadows (offset, spread and blur: a blur of B reaches B
   * past the shadow's edge), its outline and a drop-shadow filter. Inset and fully transparent shadows paint nothing out. */
  const extentOf = (s, r, colourOf) => {
    const e = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    const grow = (l, t, rr, b) => { e.left = Math.min(e.left, l); e.top = Math.min(e.top, t); e.right = Math.max(e.right, rr); e.bottom = Math.max(e.bottom, b); };
    for (const layer of layersOf(String(s.boxShadow || ''))) {
      if (/\binset\b/i.test(layer)) continue;
      const colour = (layer.match(COLOUR_IN) || [])[0];
      if (colour && alphaOf(colourOf(colour)) === 0) continue;
      const [ox = 0, oy = 0, blur = 0, spread = 0] = (layer.replace(colour || '', ' ').match(/-?[\d.]+px/g) || []).map(parseFloat);
      grow(r.left + ox - spread - blur, r.top + oy - spread - blur, r.right + ox + spread + blur, r.bottom + oy + spread + blur);
    }
    const ow = parseFloat(s.outlineWidth) || 0;
    if (s.outlineStyle && s.outlineStyle !== 'none' && ow > 0) {
      const o = ow + Math.max(0, parseFloat(s.outlineOffset) || 0);
      grow(r.left - o, r.top - o, r.right + o, r.bottom + o);
    }
    for (const m of String(s.filter || '').matchAll(/drop-shadow\(((?:[^()]|\([^()]*\))*)\)/g)) {
      const colour = (m[1].match(COLOUR_IN) || [])[0];
      const [ox = 0, oy = 0, blur = 0] = (m[1].replace(colour || '', ' ').match(/-?[\d.]+px/g) || []).map(parseFloat);
      grow(r.left + ox - blur, r.top + oy - blur, r.right + ox + blur, r.bottom + oy + blur);
    }
    return e;
  };
  const box = (r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  window.__sweep.scrollState = () => {
    const se = document.scrollingElement || document.documentElement, sheet = document.getElementById('sheet');
    return { doc: { y: scrollY, max: Math.max(0, se.scrollHeight - innerHeight) },
      sheet: sheet ? { y: sheet.scrollTop, max: Math.max(0, sheet.scrollHeight - sheet.clientHeight) } : null };
  };
  // a native scroll to absolute positions (the document, the word's page), as a reader's own scroll would leave them
  window.__sweep.scrollAt = (target) => {
    if (Number.isFinite(target?.doc)) scrollTo({ top: target.doc, behavior: 'instant' });
    const sheet = document.getElementById('sheet');
    if (sheet && Number.isFinite(target?.sheet)) sheet.scrollTo({ top: target.sheet, behavior: 'instant' });
    return window.__sweep.scrollState();
  };
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
    // Hfix-1A (F-1, the lead's ruling) · the open reading area: the glass between the fixed or sticky bars at its top and
    // its foot, and clear of their shade. A line of a run is read where a reader reads it, inside that area; a line under a
    // bar or in its shade waits for a pass that scrolls it clear (deferred), never sampled against the bar's own paint. A
    // bar's own words are read in it. The bars are tagged (data-sweep-bar) for C8.
    const bars = [];
    for (const el of document.querySelectorAll('body > *, #app > *, #sheet > *, .kp > *, .kp-study > *')) {
      const s = getComputedStyle(el);
      if (!['fixed', 'sticky'].includes(s.position) || s.visibility !== 'visible' || s.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (r.width < vw * 0.6 || r.height < 8 || r.height > vh * 0.3 || r.bottom <= 0 || r.top >= vh) continue;
      // a bar meets the glass's edge (the bar and the thread under it at the top; the tab bar, a player, a grade bar at the
      // foot): a fixed overlay standing mid-glass (the slip) is no bar
      const top = r.top <= 52, foot = r.bottom >= vh - 2;
      if (!top && !foot) continue;
      // the shade a bar casts past its edge (its box-shadows: offset, blur and spread toward the open area)
      let shade = 0;
      for (const m of String(s.boxShadow || '').matchAll(/(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px(?:\s+(-?[\d.]+)px)?/g)) {
        if (/inset/.test(s.boxShadow)) continue;
        const dy = Number(m[2]), blur = Number(m[3]), spread = Number(m[4] || 0);
        shade = Math.max(shade, top ? dy + blur + spread : -dy + blur + spread);
      }
      el.dataset.sweepBar = top ? 'top' : 'foot';
      bars.push({ el, sel: path(el), top, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, shade: Math.max(0, shade) });
    }
    const openTop = Math.max(0, ...bars.filter((b) => b.top).map((b) => b.rect.bottom + b.shade));
    const openBottom = Math.min(vh, ...bars.filter((b) => !b.top).map((b) => b.rect.top - b.shade));
    const inBar = (el) => bars.some((b) => b.el.contains(el));
    // VC-1 (spec item 2) · the fixed layers. A control standing on a bar (C8's definition in measureChrome: a fixed or sticky
    // element outside every bar, inside a bar's box and on top there, as the deck's key on its foot band) is the bar's own:
    // its words are read in it, as a bar's are. Every other fixed element the glass hits inside its own box stands in
    // front of what scrolls: an overlay (the slip, #mini, deliberately no bar). An overlay owns its painted pixels: its
    // border box (fill and border) and past it its outer shadows and outline (extentOf). A fixed element the glass never
    // hits in its own box (behind the content, or pointer-events: none) is listed, not treated as an overlay.
    const parts = [], overlays = [], fixedOther = [];
    for (const el of body.querySelectorAll('*')) {
      if (el === probe || inBar(el) || parts.some((p) => p.el.contains(el)) || overlays.some((o) => o.el.contains(el))) continue;
      const s = getComputedStyle(el);
      if (!['fixed', 'sticky'].includes(s.position) || s.visibility !== 'visible' || s.display === 'none') continue;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      const bar = bars.find((b) => r.left >= b.rect.left - 1 && r.right <= b.rect.right + 1 && r.top >= b.rect.top - 1 && r.bottom <= b.rect.bottom + 1);
      const centre = bar && document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
      if (centre && el.contains(centre)) { parts.push({ el, id: layerId(el), sel: path(el), rect: box(r), extent: extentOf(s, r, colourOf) }); continue; }
      if (s.position !== 'fixed') continue;
      if (Number(s.opacity) === 0 || !(r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw)) continue;
      const xs = [1 / 6, 1 / 2, 5 / 6].map((f) => Math.min(vw - 0.5, Math.max(0.5, r.left + r.width * f)));
      const ys = [1 / 6, 1 / 2, 5 / 6].map((f) => Math.min(vh - 0.5, Math.max(0.5, r.top + r.height * f)));
      const front = xs.some((x) => ys.some((y) => { const hit = document.elementFromPoint(x, y); return !!hit && (hit === el || el.contains(hit)); }));
      if (!front) { fixedOther.push({ sel: path(el), rect: box(r), pointerEvents: s.pointerEvents }); continue; }
      overlays.push({ el, id: layerId(el), sel: path(el), rect: box(r), extent: extentOf(s, r, colourOf) });
    }
    const onBar = (el) => inBar(el) || parts.some((p) => p.el.contains(el));
    const layers = [...parts, ...overlays];
    const layerOf = (hit) => layers.find((o) => o.el.contains(hit)) || null;
    // the scroll that moves a text: the word's page (#sheet), none (a fixed layer), or the document
    const scrollerOf = (el) => {
      for (let a = el; a && a !== body; a = a.parentElement) {
        if (a.id === 'sheet') return 'sheet';
        if (getComputedStyle(a).position === 'fixed') return 'fixed';
      }
      return 'doc';
    };
    const meets = (e, b) => e.left < b.right && e.right > b.left && e.top < b.bottom && e.bottom > b.top;
    // text runs
    const texts = [];
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const id = textId(n);
      const content = n.nodeValue.replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!content || !el || el === probe || el.closest('script, style, noscript, template, title')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility !== 'visible' || cs.display === 'none') continue;
      // a closed <details> paints nothing past its summary, yet WebKit still hands its text boxes, and a probe that lands
      // on the page's own ground counts as the run's family: the closed "More examples" were read against whatever line
      // lay where they would stand (site-6: the encounters' rule under a 総理 nobody can see)
      const shut = el.closest('details:not([open])');
      if (shut && !shut.querySelector(':scope > summary')?.contains(el)) continue;
      range.selectNodeContents(n);
      // VC-1 · each line keeps its index among the node's own line boxes, so the same line is named at every position
      const native = [...range.getClientRects()].map((q, line) => ({ line, left: q.left, top: q.top, right: q.right, bottom: q.bottom }));
      let rects = native.map((q) => ({ ...q }));
      // clip by every scrolling or clipping ancestor
      for (let a = el; a && a !== root; a = a.parentElement) {
        const s = getComputedStyle(a);
        if (/inset\(50%\)/.test(s.clipPath || '') || /rect\(0px,? 0px,? 0px,? 0px\)/.test(s.clip || '')) { rects = []; break; }
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
          const q = a.getBoundingClientRect();
          rects = rects.map((x) => ({ line: x.line, left: Math.max(x.left, q.left), top: Math.max(x.top, q.top), right: Math.min(x.right, q.right), bottom: Math.min(x.bottom, q.bottom) }));
        }
      }
      rects = rects.map((x) => ({ line: x.line, left: Math.max(x.left, 0), top: Math.max(x.top, 0), right: Math.min(x.right, vw), bottom: Math.min(x.bottom, vh) }))
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
      // each line on its own (F-1: only the first line was probed, so a run's later lines were read under the tab bar): a
      // line is read where it stands in the open area and its own element is the topmost thing along it; a line outside
      // the open area waits for a pass that scrolls it clear; a line covered inside it by something else is occluded
      const family = (hit) => !!hit && (hit === el || el.contains(hit) || hit.contains(el));
      // VC-1 (spec item 2) · a line is seen (required) where Hfix-1A saw it: in the open area with its own element topmost
      // somewhere along its midline; a line outside the open area waits for a position that brings it in; a line in it but
      // covered along its whole midline is occluded, as before. A seen line is read where it stands only when no overlay's
      // box meets its whole sampled band (the sampler's own band below) and every probe across that band (three rows, a
      // probe at most 6 px apart) finds no overlay and no bar on it: one family hit among three never admits the rectangle.
      // Otherwise it is partly obscured and waits for a native scroll position that clears that very line (rereadWaiting).
      const own = onBar(el), mine = layerOf(el), lines = [];
      for (const q of rects) {
        const entry = { line: q.line, rect: { left: q.left, top: q.top, right: q.right, bottom: q.bottom }, native: native[q.line] };
        const open = own || (q.top >= openTop - 0.5 && q.bottom <= openBottom + 0.5);
        if (!open) { lines.push({ ...entry, state: 'wait', why: 'outside the open area', need: q.top < openTop ? q.top - openTop - 12 : q.bottom - openBottom + 12 }); continue; }
        const ys = (q.top + q.bottom) / 2;
        const mids = [q.left + 2, (q.left + q.right) / 2, q.right - 2].map((x) => document.elementFromPoint(x, ys));
        if (!mids.some(family)) { lines.push({ ...entry, state: 'occluded' }); continue; }
        const h = q.bottom - q.top, band = { left: q.left + 0.5, right: q.right - 0.5, top: q.top + h * 0.2, bottom: q.bottom - h * 0.2 };
        // obscured: an overlay's box (its fill and border, what the glass hits) meets the band. A band only under an
        // overlay's shadow (past its box) is not obscured and is read here as before; it is listed (shaded). Where a line
        // is moved, its new place must clear the whole painted extent, shadow included (clearSpans)
        const foreignLayers = layers.filter((o) => o !== mine && !o.el.contains(el));
        const blockers = foreignLayers.filter((o) => meets(o.rect, band)).map((o) => ({ layer: o.id, sel: o.sel, rect: o.rect, extent: o.extent }));
        const shaded = foreignLayers.filter((o) => !meets(o.rect, band) && meets(o.extent, band)).map((o) => o.sel);
        const cols = Math.max(3, Math.min(24, Math.ceil((band.right - band.left) / 6))), foreign = [];
        for (const y of [band.top + 0.25, (band.top + band.bottom) / 2, band.bottom - 0.25]) for (let i = 0; i < cols; i++) {
          const x = band.left + ((i + 0.5) * (band.right - band.left)) / cols, hit = document.elementFromPoint(x, y);
          if (family(hit)) continue;
          const layer = hit && layerOf(hit);
          foreign.push({ x, y, by: layer && layer !== mine ? 'overlay' : hit && !own && inBar(hit) ? 'bar' : 'other', layer: layer?.id ?? null, sel: hit ? path(hit) : null });
        }
        const covered = foreign.filter((f) => f.by !== 'other');
        if (blockers.length || covered.length) {
          lines.push({ ...entry, state: 'wait', why: blockers.length ? 'under an overlay' : 'covered at a probe', band, blockers, covered: covered.slice(0, 3) });
          continue;
        }
        lines.push({ ...entry, state: 'read', ...(shaded.length ? { shaded } : {}),
          ...(foreign.length ? { foreign: foreign.length, foreignBy: [...new Set(foreign.map((f) => f.sel))].slice(0, 3) } : {}) });
      }
      const svg = el instanceof SVGElement;
      const fill = svg ? cs.fill : (cs.webkitTextFillColor || cs.color);
      texts.push({
        id, key: `t${id}`, index: el.closest('.tok[data-index]')?.dataset.index ?? null, label: `${path(el)}|${content.slice(0, 40)}`,
        own, layer: mine?.id ?? null, scroller: scrollerOf(el), lines,
        text: content.slice(0, 40), sel: path(el), colour: fill, colourProp: cs.color, opacity, blend, filter,
        demo: !!el.closest('#mini[data-demo="true"]'),
        demoBandLabel: !!el.closest('#mini[data-demo="true"] .mini-band-label'),
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
      pigments, page, bodyBg, paints, texts, figures: figureRects, kanji, open: { top: openTop, bottom: openBottom },
      bars: bars.map((b) => ({ sel: b.sel, top: b.top, rect: b.rect, shade: b.shade })),
      overlays: layers.map((o) => ({ layer: o.id, sel: o.sel, part: parts.includes(o), rect: o.rect, extent: o.extent })), fixedOther,
      scroll: window.__sweep.scrollState(),
      meta: { theme: root.dataset.theme || 'hokusai', room: root.dataset.room || '', view: body.dataset.view || '', scrollY, sheetTop: document.getElementById('sheet')?.scrollTop ?? null },
    };
  };
  // VC-1 · who owns the pixel at a CSS point: the topmost element there, the outermost fixed layer it belongs to, and the
  // reader token (its data-index) under it, with the stack beneath (the gold-edge control's ownership receipt)
  window.__sweep.ownerAt = (x, y) => {
    const hit = document.elementFromPoint(x, y);
    let layer = null;
    for (let a = hit; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') layer = a;
    const token = (e) => e?.closest?.('.tok[data-index]')?.dataset.index ?? null;
    return { x, y, hit: hit ? path(hit) : null, id: hit?.id || null, token: token(hit),
      layer: layer ? { layer: layerId(layer), sel: path(layer), id: layer.id || null } : null,
      stack: document.elementsFromPoint(x, y).slice(0, 5).map((e) => ({ sel: path(e), id: e.id || null, token: token(e) })) };
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
  // R3 (Grok 2029) · an open slip drawn before its word's sense is at hand says a quiet "…" (aria-busy, R2's contract) until
  // it is answered: its colours are read on the answered card (M-3), after the same settle as before
  await page.waitForFunction(() => document.getElementById('mini')?.getAttribute('aria-busy') !== 'true', null, { timeout: 5000 }).catch(() => {});
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
    // G3 · the word is found by its prose label (a word in a roving paragraph carries no aria-label until the keyboard
    // selects it), and climbs its ladder: its reading in place, then the slip
    const word = page.locator(`#reader .tok[data-prose-label="${WORD}"]`).first();
    await word.tap();
    const rung = await page.waitForFunction((el) => (document.getElementById('mini') ? 'stage' : el.dataset.ladderRung === 'reading' ? 'reading' : null),
      await word.elementHandle(), { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
    if (rung === 'reading') await word.tap();
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
      // G6 · the page's frame is its bar and, under it, the scale thread: the examples are brought to the frame's foot,
      // so none of them waits under the thread
      const bar = Math.max(...[':scope > .sheet-bar', ':scope > .scale-thread'].map((sel) => s.querySelector(sel)?.getBoundingClientRect().bottom || 0));
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
  // Hfix-1B (item 11): the tutor's room as Settings › Tutor connection opens it with no tutor set up, its one Details closed
  async tutor(page) {
    await page.locator('#settings-tutor').click();
    await page.waitForFunction(() => document.body.dataset.view === 'ai', null, { timeout: 10000 });
    await page.locator('#ai-connection').first().waitFor({ state: 'attached', timeout: 10000 });
    await page.evaluate(() => scrollTo(0, 0)); await settle(page, 700);
  },
  // Hfix-1B (items 6 and 7; H-akafuji-08, H-hokusai-06, H-nami-05, H-rokusho-10, H-yoru-05): Guided's front, its field map
  // (the diagram of the six questions, brought into the open reading area between the bars) and Speak at rest
  async guided(page) {
    await page.locator('#tab-learn').click();
    await page.waitForFunction(() => document.documentElement.dataset.room === 'learn', null, { timeout: 10000 });
    await page.locator('button[data-study-door="guided"]').first().click();
    await page.waitForFunction(() => document.body.dataset.view === 'guided', null, { timeout: 10000 });
    await page.locator('.guided-room .gs-arrival').first().waitFor({ timeout: 20000 });
    await lazySheets(page);
    await page.evaluate(() => scrollTo(0, 0)); await settle(page, 700);
  },
  async 'guided-field'(page) {
    await page.evaluate(() => {
      const map = document.querySelector('.guided-room .gs-field-preview');
      const top = document.querySelector('#app > .chrome')?.getBoundingClientRect().bottom || 0;
      if (map) scrollTo(0, scrollY + map.getBoundingClientRect().top - top - 12);
    });
    await settle(page, 500);
  },
  async speak(page) {
    await page.locator('#tab-learn').click();
    await page.waitForFunction(() => document.documentElement.dataset.room === 'learn', null, { timeout: 10000 });
    await page.locator('button[data-study-door="speak"]').first().click();
    await page.waitForFunction(() => document.body.dataset.view === 'speak', null, { timeout: 10000 });
    await page.locator('.speak-room').first().waitFor({ timeout: 20000 });
    await lazySheets(page);
    await page.evaluate(() => scrollTo(0, 0)); await settle(page, 1200);
  },
  // its quiet "Key and limit" leads one level deeper, to the key page (H-yoru-05's line)
  async 'speak-key'(page) {
    await page.locator('.speak-room .speak-cost').first().click();
    await page.locator('.speak-room .speak-connect').first().waitFor({ timeout: 10000 });
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

/* ------------------------------------------------------------------ C1, one native occurrence at a time (VC-1) */
// CONTRAST-INTEGRATION-SPEC (lead 2125, sol): the C1 obligation is unchanged (item 3): ordinary text 4.5:1, large text (the
// existing ≥ 24 px, or ≥ 18.67 px at ≥ 700) 3:1, the run's colour at its alpha × its ancestors' opacity composited over the
// darkest and the lightest pixel under each line's inner band (sample and extremes, untouched). What changed is whose
// pixels those are and which occurrence they judge: each run is its own native occurrence (its text node, item 1) and each
// of its lines its own verdict, read only where the whole band is clear (item 2).
/** One run's verdict from the lines read in one shot: each line its own pair, the run keeping its worst line. */
function readRun(t, lines, shot, at) {
  const record = { key: t.key, occurrence: t.id, index: t.index, label: t.label, text: t.text, sel: t.sel, fontPx: t.fontPx, weight: t.weight,
    hidden: t.hidden, opacity: t.opacity, demo: t.demo, demoBandLabel: t.demoBandLabel };
  const fg = parseColour(t.colour);
  const why = t.clipText ? 'clipped-to-text' : t.blend ? `blend ${t.blend}` : t.filter ? `filter ${t.filter}` : (!fg ? `paint ${t.colour}` : (fg.a === 0 && t.stroke ? 'stroke-only' : ''));
  if (why) return { unresolved: { ...record, why } };
  if (fg.a * t.opacity < 0.02) return {};
  const large = t.fontPx >= 24 || (t.fontPx >= 18.67 && t.weight >= 700);
  const required = large ? 3 : 4.5;
  const verdicts = [];
  for (const l of lines) {
    const q = l.rect;
    const h = q.bottom - q.top, band = { left: q.left + 0.5, right: q.right - 0.5, top: q.top + h * 0.2, bottom: q.bottom - h * 0.2 };
    const under = sample(shot, band, Math.max(1, Math.min(2, (band.right - band.left) / 40)));
    if (!under.length) continue;
    const { dark, light } = extremes(under);
    let worst = Infinity, pair = null;
    for (const bg of [dark, light]) {
      const ink = over({ ...fg, a: fg.a * t.opacity }, bg), r = ratio(ink, bg);
      if (r < worst) { worst = r; pair = { fg: hex(fg), bg: hex(bg) }; }
    }
    verdicts.push({ line: l.line, ratio: Math.round(worst * 100) / 100, ...pair, ok: worst >= required, at, band });
  }
  if (!verdicts.length) return {};
  return { pair: { ...record, ratio: null, required, fg: null, bg: null, ok: null, lines: verdicts } };
}
const atLabel = (at) => (at === 'stood' ? null : `read at ${at.doc} px${at.sheet === null || at.sheet === undefined ? '' : `, the page at ${at.sheet} px`}`);
/** The run's verdict is its worst line's; it passes only if every line does. */
function settleRun(pair) {
  pair.lines.sort((a, b) => a.line - b.line);
  const worst = pair.lines.reduce((w, l) => (!w || l.ratio < w.ratio ? l : w), null);
  Object.assign(pair, { ratio: worst.ratio, fg: worst.fg, bg: worst.bg, ok: pair.lines.every((l) => l.ok) });
  if (atLabel(worst.at)) pair.pass = atLabel(worst.at);
  else delete pair.pass;
  return pair;
}

/* VC-1 (spec item 2) · the waiting lines. Every required line not read where it stood (outside the open area, or with its
 * band under an overlay's paint or covered at a probe) is read again at a native scroll position where that very line —
 * its node, its line index — stands wholly in the open area with its whole band clear of every overlay, as the census at
 * that capture verifies (geometry and ownership together). The positions are planned from the last census (the overlays
 * are fixed; the line moves with its own scroller), at most REREAD_POSITIONS of them within REREAD_BUDGET_MS. Each line
 * completes exactly once. A line no bounded position reads is a named unresolved failure — its occurrence, the positions
 * tried and its geometry — unless no scroll moves it (a fixed layer's) and it lies wholly inside an opaque bar's box (C8),
 * hidden: counted as barred, as Hfix-1A meant. */
const REREAD_POSITIONS = 6;
const REREAD_BUDGET_MS = 30000;
const REREAD_MARGIN = 12;
const lineKey = (id, line) => `${id}:${line}`;
const bandOf = (q) => { const h = q.bottom - q.top; return { left: q.left + 0.5, right: q.right - 0.5, top: q.top + h * 0.2, bottom: q.bottom - h * 0.2 }; };
/** The positions of its own scroller (absolute, within [0, limit]) at which a line last seen with rect `rect` while that
 * scroller stood at `from` would stand wholly in the open area with its band clear of every fixed overlay's extent that
 * is not its own: disjoint closed spans. */
function clearSpans(rect, from, geometry, layer, limit) {
  const band = bandOf(rect);
  let spans = [[Math.max(0, from + rect.bottom - geometry.open.bottom - 0.5), Math.min(limit, from + rect.top - geometry.open.top + 0.5)]];
  for (const o of geometry.overlays) {
    if (o.layer === layer || !(o.extent.left < band.right && o.extent.right > band.left)) continue;
    const lo = from + band.top - o.extent.bottom, hi = from + band.bottom - o.extent.top;
    spans = spans.flatMap(([a, b]) => [[a, Math.min(b, lo)], [Math.max(a, hi), b]]);
  }
  return spans.filter(([a, b]) => a <= b);
}
function planPosition(pending, geometry, tried, base) {
  const plan = {}, expect = {};
  for (const scroller of ['doc', 'sheet']) {
    const now = geometry.scroll[scroller];
    const items = [...pending.values()].filter((p) => p.scroller === scroller);
    if (!now || !items.length) continue;
    const anchor = base[scroller]?.y ?? now.y;
    const spans = items.map((p) => clearSpans(p.seen.native, p.seen.from[scroller], geometry, p.layer, now.max));
    const fits = (y, s) => s.some(([a, b]) => y >= a - 0.01 && y <= b + 0.01);
    let best = null;
    for (const s of spans) for (const [a, b] of s) {
      const m = Math.min(REREAD_MARGIN, (b - a) / 2);
      for (const y of [a + m, b - m].map((v) => Math.round(v * 2) / 2)) {
        if (tried[scroller].some((t) => Math.abs(t - y) < 1)) continue;
        const count = spans.filter((x) => fits(y, x)).length;
        if (count && (!best || count > best.count || (count === best.count && Math.abs(y - anchor) < Math.abs(best.y - anchor)))) best = { y, count };
      }
    }
    if (best) { plan[scroller] = best.y; expect[scroller] = best.count; }
  }
  return Object.keys(plan).length ? { plan, expect } : null;
}
function mergeRead(result, pair) {
  const had = result.pairs.find((p) => p.occurrence === pair.occurrence);
  if (!had) { result.pairs.push(settleRun(pair)); return; }
  had.lines.push(...pair.lines);
  settleRun(had);
}
async function capture(page) {
  const data = await page.evaluate(([owned, inks]) => window.__sweep.collect(owned, [], inks), [OWNED, INKS]);
  await page.evaluate(() => window.__sweep.hide(true));
  let shot;
  try {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    shot = decodePng(await page.screenshot({ type: 'png' }));
  } finally { await page.evaluate(() => window.__sweep.hide(false)); }
  return { data, shot };
}
/** `fault` (diagnostic controls only, SWEEP_NEGATIVE c1-*): a hook that may restrict the positions, exhaust the budget
 * or alter a capture's census, so a control can show that each such failure is named and never passes. */
async function rereadWaiting(page, data, result, fault = null) {
  const reread = { waiting: 0, passes: 0, read: 0, barred: [], positions: [] };
  const pending = new Map(), done = new Map();
  for (const pair of result.pairs) for (const l of pair.lines) done.set(lineKey(pair.occurrence, l.line), 'stood');
  const failed = new Set(result.unresolved.map((u) => u.occurrence));
  for (const t of data.texts) for (const l of t.lines) {
    if (l.state !== 'wait' || failed.has(t.id)) continue;
    pending.set(lineKey(t.id, l.line), { id: t.id, line: l.line, t, first: l, scroller: t.scroller, layer: t.layer, attempts: [],
      seen: { native: l.native, from: { doc: data.scroll.doc.y, sheet: data.scroll.sheet?.y ?? 0 } } });
  }
  reread.waiting = pending.size;
  const record = (t) => ({ key: t.key, occurrence: t.id, index: t.index, label: t.label, text: t.text, sel: t.sel, fontPx: t.fontPx, weight: t.weight, hidden: t.hidden });
  if (!pending.size) return reread;
  const base = data.scroll, tried = { doc: [base.doc.y], sheet: base.sheet ? [base.sheet.y] : [] };
  const budget = fault?.budgetMs ?? REREAD_BUDGET_MS, most = fault?.positions ?? REREAD_POSITIONS;
  let geometry = { open: data.open, overlays: data.overlays, scroll: base }, timedOut = false;
  const started = Date.now();
  try {
    while (pending.size) {
      if (reread.passes >= most) break;
      if (Date.now() - started >= budget) { timedOut = true; break; }
      const next = fault?.plan ? fault.plan(reread.passes, pending, geometry) : planPosition(pending, geometry, tried, base);
      if (!next) break;
      for (const s of Object.keys(next.plan)) tried[s]?.push(next.plan[s]);
      await page.evaluate((t) => window.__sweep.scrollAt(t), next.plan);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      if (fault?.before) await fault.before(page, pending);
      const { data: again, shot: clear } = await capture(page);
      if (fault?.census) fault.census(again, pending);
      reread.passes += 1;
      const at = { doc: again.scroll.doc.y, sheet: again.scroll.sheet?.y ?? null };
      reread.positions.push({ asked: next.plan, at, expected: next.expect });
      geometry = { open: again.open, overlays: again.overlays, scroll: again.scroll };
      const census = new Map();
      for (const t of again.texts) census.set(t.id, census.has(t.id) ? 'duplicate' : t);
      for (const [k, p] of [...pending]) {
        if (!pending.has(k)) continue;
        const t = census.get(p.id), whole = t && t !== 'duplicate' ? t : null;
        const l = whole?.lines.find((x) => x.line === p.line) || null;
        p.attempts.push({ at, found: !!t, ...(t === 'duplicate' ? { duplicate: true } : {}),
          line: l ? { rect: l.rect, state: l.state, ...(l.why ? { why: l.why } : {}), ...(l.blockers?.length ? { blockers: l.blockers.map((b) => ({ sel: b.sel, extent: b.extent })) } : {}),
            ...(l.shaded ? { shaded: l.shaded } : {}) } : null });
        if (l) p.seen = { native: l.native, from: { doc: again.scroll.doc.y, sheet: again.scroll.sheet?.y ?? 0 } };
        if (t === 'duplicate') {
          pending.delete(k);
          result.unresolved.push({ ...record(p.t), why: 'duplicate completion', line: p.line, detail: 'the census named this native occurrence twice at one capture', attempts: p.attempts });
          continue;
        }
        // a moved line completes only wholly clear: in the open area, no overlay's box on its band and no probe covered
        // (the census's 'read'), and no overlay's shadow or outline on it either
        if (l?.state !== 'read' || l.shaded) continue;
        const read = readRun(whole, [l], clear, at);
        pending.delete(k);
        if (read.unresolved) {
          result.unresolved.push(read.unresolved);
          for (const [other, q] of [...pending]) if (q.id === p.id) pending.delete(other);
          continue;
        }
        if (!read.pair) continue;
        if (done.has(k)) {
          result.unresolved.push({ ...record(p.t), why: 'duplicate completion', line: p.line, detail: `already completed ${JSON.stringify(done.get(k))}`, attempts: p.attempts });
          continue;
        }
        done.set(k, at);
        reread.read += 1;
        mergeRead(result, read.pair);
      }
      if (fault?.after) await fault.after(page, again, pending, result, done);
    }
  } finally {
    await page.evaluate((b) => window.__sweep.scrollAt({ doc: b.doc.y, sheet: b.sheet?.y }), base);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  for (const p of pending.values()) {
    const q = p.first.rect;
    // barred (Hfix-1A's word, now exact): only a line no scroll moves (a fixed layer's) and hidden wholly inside an opaque
    // bar's box; a line its own scroll could move that no bounded position read is a named failure
    const hidden = p.scroller === 'fixed' && p.first.why === 'outside the open area' && data.bars.some((b) =>
      q.left >= b.rect.left - 0.5 && q.right <= b.rect.right + 0.5 && q.top >= b.rect.top - 0.5 && q.bottom <= b.rect.bottom + 0.5);
    if (hidden) { reread.barred.push(`${p.t.text} ${p.t.sel}`.slice(0, 80)); continue; }
    const why = p.attempts.length && p.attempts.every((a) => !a.found) ? 'missing native occurrence' : timedOut ? 'positioning timeout' : 'unexposed';
    result.unresolved.push({ ...record(p.t), why, line: p.line, scroller: p.scroller,
      geometry: { rect: p.first.rect, native: p.first.native, band: bandOf(p.first.rect), waited: p.first.why, open: data.open,
        blockers: p.first.blockers?.map((b) => ({ sel: b.sel, extent: b.extent })) || [], scroll: base },
      attempts: p.attempts });
  }
  return reread;
}

/* ------------------------------------------------------------------ analysis */
function analyse(world, state, data, shot, bands) {
  const out = { world, state, pairs: [], unresolved: [], occluded: 0, figures: [], roots: [], banding: [], kanji: [], muddy: [] };
  const pigments = data.pigments.map((p) => ({ name: p.name, ...parseColour(p.colour) })).filter((p) => Number.isFinite(p.r) && p.a > 0);
  out.pigmentCount = pigments.length;
  const page = parseColour(data.page);
  // C1 text
  for (const t of data.texts) {
    const reads = t.lines.filter((l) => l.state === 'read');
    if (!reads.length) {
      // Hfix-1A (F-1), VC-1: a run with no line read where it stands waits for a position that clears it (rereadWaiting)
      if (t.lines.some((l) => l.state === 'wait')) out.deferred = (out.deferred || 0) + 1;
      else out.occluded++;
      continue;
    }
    const read = readRun(t, reads, shot, 'stood');
    if (read.unresolved) out.unresolved.push(read.unresolved);
    else if (read.pair) out.pairs.push(settleRun(read.pair));
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

/* First-use is a separate pristine device, never inferred from the settled-reader fixture.
 * Lead ruling, 2026-10-19 VH-1: D2/C1 judges rest states, not mid-fade. The arrival must
 * reach full opacity by its authored duration plus one independently calibrated frame. No opacity is
 * forced, no animation is cancelled/paused, and the 4.5/3:1 C1 thresholds stay intact. */
const DEMO_ARRIVAL = () => {
  const seen = new WeakSet();
  const installedDocument = document, installedWindow = window, documentId = crypto.randomUUID();
  window.__contrastDocumentIdentity = { document: installedDocument, window: installedWindow, documentId };
  window.__contrastDemoArrivals = [];
  const observe = () => {
    const mini = document.querySelector('#mini[data-demo="true"]');
    if (!mini || seen.has(mini)) return;
    seen.add(mini);
    const style = getComputedStyle(mini);
    const animations = mini.getAnimations();
    const animation = animations.find((item) => item instanceof CSSAnimation && item.animationName === 'read-mini-rise');
    const row = { mountSequence: window.__contrastDemoArrivals.length, name: animation?.animationName || style.animationName,
      animationType: animation?.constructor.name || null,
      actualAnimationNames: animations.map((item) => item.animationName || item.id || item.constructor.name),
      sampled: false, terminal: null, connected: true, timeOrigin: performance.timeOrigin,
      documentId, sameDocument: document === installedDocument && window === installedWindow &&
        window.__contrastCalibrationDocument === document && window.__contrastCalibrationWindow === window,
      frameCalibration: window.__contrastFrameCalibration || null, samples: [] };
    window.__contrastDemoArrivals.push({ mini, row });
    if (!animation) {
      row.missingAnimation = true; row.sampled = true; row.terminal = 'missing-animation'; row.opacity = Number(style.opacity);
      return;
    }
    const timing = animation.effect.getComputedTiming();
    row.authoredDuration = Number(timing.duration);
    row.authoredDelay = Number(timing.delay);
    row.authoredEndDelay = Number(timing.endDelay);
    row.authoredIterations = Number(timing.iterations);
    row.authoredEnd = Number(timing.endTime);
    const observedMount = performance.now();
    const sample = (now) => {
      if (!mini.isConnected) {
        row.connected = false; row.superseded = true; row.sampled = true; row.terminal = 'detached';
        row.supersededBeforeFinish = !(row.opacity === 1 && row.playState === 'finished');
        row.detached = { rafTime: now, observedAt: performance.now(), playState: animation.playState, currentTime: animation.currentTime };
        return;
      }
      row.startTime = animation.startTime;
      row.currentTime = animation.currentTime;
      row.playbackRate = animation.playbackRate;
      row.opacity = Number(getComputedStyle(mini).opacity);
      row.playState = animation.playState;
      row.rafTime = now;
      // Lead 0842: compare the observing frame and the animation start on their
      // shared document timeline. Callback delivery is separate telemetry; a late
      // FRAME still never buys itself a later origin or a larger allowance.
      row.observedAt = performance.now();
      row.callbackDeliveryMs = row.observedAt - row.rafTime;
      row.elapsed = row.startTime === null ? null : row.rafTime - row.startTime;
      row.samples.push({ rafTime: row.rafTime, observedAt: row.observedAt, elapsed: row.elapsed,
        callbackDeliveryMs: row.callbackDeliveryMs, currentTime: row.currentTime, opacity: row.opacity, playState: row.playState });
      const allowance = row.frameCalibration?.frameMs;
      const finished = row.elapsed !== null && row.opacity === 1 && row.playState === 'finished';
      const late = row.elapsed !== null && row.elapsed > row.authoredEnd + allowance;
      if (finished || late || row.observedAt - observedMount >= 2000) {
        row.sampled = true;
        row.terminal = finished ? 'finished' : late ? 'deadline-exceeded' : 'observer-budget-exhausted';
        return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  };
  new MutationObserver(observe).observe(document, { childList: true, subtree: true });
};
const demoC1 = (result) => result.pairs.length > 0 && result.unresolved.length === 0 && result.pairs.every((pair) => pair.ok);
async function measureDemo(page, world, phase) {
  const data = await page.evaluate(([owned, inks]) => window.__sweep.collect(owned, [], inks), [OWNED, INKS]);
  data.texts = data.texts.filter((text) => text.demo);
  await page.evaluate(() => window.__sweep.hide(true));
  let shot;
  try {
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    shot = decodePng(await page.screenshot({ type: 'png' }));
  } finally { await page.evaluate(() => window.__sweep.hide(false)); }
  const result = analyse(world, `fresh-demo.${phase}`, data, shot, []);
  result.engine = engine;
  return result;
}
async function freshDemo(browser, world, report) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: DPR,
    serviceWorkers: 'block', reducedMotion: 'no-preference', colorScheme: 'light' });
  const errors = [];
  try {
    await silenceBrowserAudio(context);
    await context.addInitScript(IN_PAGE);
    await context.addInitScript(DEMO_ARRIVAL);
    await context.addInitScript((id) => localStorage.setItem('kairo-theme', id), world);
    await context.route('**/*', (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(20000);
    await STEPS.shelf(page);
    await page.evaluate(async () => {
      const timestamps = [];
      await new Promise((done) => {
        const sample = (now) => { timestamps.push(now); if (timestamps.length === 13) done(); else requestAnimationFrame(sample); };
        requestAnimationFrame(sample);
      });
      const sorted = timestamps.slice(1).map((stamp, index) => stamp - timestamps[index]).sort((a, b) => a - b);
      window.__contrastFrameCalibration = { method: 'median-of-12-pre-arrival-raf-intervals',
        timeOrigin: performance.timeOrigin, timestamps, frameMs: (sorted[5] + sorted[6]) / 2,
        documentId: window.__contrastDocumentIdentity.documentId,
        sameDocument: window.__contrastDocumentIdentity.document === document && window.__contrastDocumentIdentity.window === window };
      window.__contrastCalibrationDocument = document;
      window.__contrastCalibrationWindow = window;
    });
    await STEPS.reader(page);
    await page.locator('#mini[data-demo="true"] .mini-word').waitFor();
    await page.waitForFunction(() => {
      const mini = document.querySelector('#mini[data-demo="true"]');
      const observation = window.__contrastDemoArrivals.findLast((item) => item.mini === mini)?.row;
      return observation?.sampled && mini.getAttribute('aria-busy') !== 'true' &&
        Number(getComputedStyle(mini).opacity) === 1 && !mini.getAnimations().some((animation) => animation.playState === 'running' || animation.playState === 'pending');
    });
    await page.evaluate(async () => { await document.fonts.ready; });
    const facts = await page.evaluate(() => ({
      word: document.querySelector('#mini[data-demo="true"] .mini-word')?.textContent.trim(),
      seen: localStorage.getItem('kairo-word-ladder-demo-v1'),
      theme: document.documentElement.dataset.theme || 'hokusai',
      motionPreference: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduce' : 'no-preference',
      arrivals: window.__contrastDemoArrivals.map(({ mini, row }) => ({ ...row, connected: mini.isConnected,
        current: mini.isConnected && mini.matches('#mini[data-demo="true"]') })),
    }));
    check(`${world}/fresh-demo.reach`, 'a pristine device opened the real first-use word demonstration', !!facts.word && facts.seen === '1', facts.word);
    check(`${world}/fresh-demo.world`, 'the fresh demonstration wears its requested world', facts.theme === world, facts.theme);
    const observedArrivals = facts.arrivals.map((row) => ({ ...row, motionPreference: facts.motionPreference }));
    const arrivalVerdict = judgeContrastArrivals(observedArrivals);
    const arrivals = observedArrivals.map((observed, index) => {
      const judged = judgeContrastArrival(observed);
      return { ...observed, completed: judged.passed, frameMs: judged.frameMs, deadlineMs: judged.deadlineMs, arrivalErrors: arrivalVerdict.mounts[index].errors };
    });
    check(`${world}/fresh-demo.arrival`, 'every displayed named read-mini-rise reaches full opacity by its own authored end plus an independently calibrated frame',
      facts.motionPreference === 'no-preference' && arrivalVerdict.passed, arrivals);
    const candidate = await measureDemo(page, world, 'settled');
    report.results.push(candidate);
    check(`${world}/fresh-demo.coverage`, 'the actual demo headword and Kanji label are included in the pixel contrast measurement',
      candidate.pairs.some((pair) => pair.text === facts.word) && candidate.pairs.some((pair) => pair.demoBandLabel && pair.text === 'Kanji'),
      candidate.pairs.map(({ text, sel, opacity }) => ({ text, sel, opacity })));
    check(`${world}/fresh-demo.C1`, 'every settled first-use demo text run meets the unchanged C1 threshold', demoC1(candidate), candidate);
    await page.screenshot({ path: join(evidence, 'shots', `${engine}-${world}-fresh-demo.jpg`), type: 'jpeg', quality: 88 });
    if (world === 'hokusai') {
      const recordBefore = await readAppRecord(page);
      const label = page.locator('#mini[data-demo="true"] .mini-band-label').filter({ hasText: /^Kanji$/ }).first();
      const oldStyle = await label.getAttribute('style');
      let mutant;
      try {
        await label.evaluate((node) => { node.style.setProperty('color', 'rgb(120, 120, 120)', 'important');
          node.style.setProperty('-webkit-text-fill-color', 'rgb(120, 120, 120)', 'important');
          node.style.setProperty('background', 'rgb(120, 120, 120)', 'important'); });
        mutant = await measureDemo(page, world, 'mutant');
      } finally {
        await label.evaluate((node, prior) => { if (prior === null) node.removeAttribute('style'); else node.setAttribute('style', prior); }, oldStyle);
      }
      const restored = await measureDemo(page, world, 'restored');
      const recordAfter = await readAppRecord(page);
      const sameRecord = JSON.stringify(recordBefore) === JSON.stringify(recordAfter);
      const control = { engine, id: 'same-ink-background', candidate, mutant, restored, recordBefore, recordAfter,
        styleBefore: oldStyle, styleAfter: await label.getAttribute('style') };
      report.controls.push(control);
      check(`${world}/fresh-demo.control-kill`, 'same ink and background on the actual Kanji label makes the same C1 predicate fail',
        demoC1(candidate) && !demoC1(mutant) && mutant.pairs.some((pair) => pair.demoBandLabel && pair.text === 'Kanji' && !pair.ok), mutant);
      check(`${world}/fresh-demo.control-restore`, 'restoring the exact style restores the settled C1 result',
        demoC1(restored) && oldStyle === control.styleAfter && JSON.stringify(candidate.pairs) === JSON.stringify(restored.pairs), restored);
      check(`${world}/fresh-demo.control-record`, 'the DOM contrast fault and restoration preserve the whole native record', sameRecord);
    }
  } catch (error) {
    check(`${world}/fresh-demo.error`, 'first-use contrast walk completed', false, String(error.stack || error));
  } finally {
    check(`${world}/fresh-demo.page-errors`, 'first-use contrast has no page errors', errors.length === 0, errors);
    await context.close();
  }
}

/* ------------------------------------------------------------------ C8 chrome */
// INT-VH, the lead's ruling (2026-10-19) on C8 and the deck's foot band: the fade stays (deliberate design, so a line
// scrolling under the band recedes instead of being cut) and C8 is made precise rather than loosened. A bar at the foot may
// declare a top-edge fade, with its own --fade-edge (a px length, at most FADE_EDGE_MAX, leaving the bar a body below it);
// C8 then judges only the pixels below that declared strip, and every one of them must be fully opaque, the controls on
// the bar included. A bar that declares nothing is judged as Hfix-1A wrote, wherever it paints.
const FADE_EDGE_MAX = 24;
const chromeClear = (chrome) => !chrome || (chrome.through.length === 0 && chrome.translucent.length === 0 && chrome.invalid.length === 0);
async function measureChrome(page) {
  const moved = await page.evaluate(() => {
    const sheet = document.getElementById('sheet'), y0 = scrollY, s0 = sheet?.scrollTop ?? 0;
    scrollBy({ top: 240, behavior: 'instant' });
    if (sheet) sheet.scrollTop = s0 + 240;
    return { doc: scrollY - y0, sheet: (sheet?.scrollTop ?? 0) - s0 };
  });
  try {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const whole = decodePng(await page.screenshot({ type: 'png' }));
    // the bars, each with the fade it declares itself (a value its parent also computes is inherited, not declared), and
    // the controls standing on them: a fixed or sticky element outside every bar, inside a bar's box and on top there (the
    // element the glass hits at its centre), as the deck's key on its foot band. A control on a bar is the bar's own: it
    // stays in every shot, and the bar is judged with it
    const found = await page.evaluate(() => {
      const fade = (el) => getComputedStyle(el).getPropertyValue('--fade-edge').trim();
      const bars = [...document.querySelectorAll('[data-sweep-bar]')].map((b) => {
        const r = b.getBoundingClientRect(), own = fade(b), inherited = b.parentElement ? fade(b.parentElement) : '';
        return { sel: b.id ? `#${b.id}` : b.className.split(' ')[0], side: b.dataset.sweepBar, declared: own && own !== inherited ? own : null,
          left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }).filter((r) => r.right - r.left > 0 && r.bottom - r.top > 0);
      const parts = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('[data-sweep-bar]')) continue;
        const s = getComputedStyle(el);
        if (!['fixed', 'sticky'].includes(s.position) || s.visibility !== 'visible' || s.display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const bar = bars.find((b) => r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1);
        const hit = bar && document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2);
        if (!hit || !el.contains(hit)) continue;
        el.dataset.sweepBarPart = bar.sel;
        parts.push({ sel: el.id ? `#${el.id}` : String(el.className).split(' ')[0], bar: bar.sel });
      }
      return { bars, parts };
    });
    const keep = '[data-sweep-bar], [data-sweep-bar] *, [data-sweep-bar-part], [data-sweep-bar-part] *';
    await page.evaluate((kept) => {
      const style = document.createElement('style');
      style.id = 'sweep-isolate';
      // only what scrolls under the bars goes: the room's content, the page's, a deck's; overlays that stand on a bar
      // (the report door, the 層 mark, the slip, the deck's key) stay in both shots. A bar standing inside that content (a
      // deck's top and grade bars) is never hidden and is itself made visible, so its own parts keep the visibility the
      // app gave them (a part the bar hides while scrolled stays hidden)
      const under = ['#app > main', '#sheet > :not([data-sweep-bar])', '.kp-study > :not([data-sweep-bar])'];
      const off = `:not(${kept})`;
      style.textContent = `${under.map((q) => [`${q}${off}`, `${q} ${off}`, `${q}${off}::before`, `${q}${off}::after`, `${q} ${off}::before`, `${q} ${off}::after`].join(', ')).join(', ')} { visibility: hidden !important; transition: none !important; }
        [data-sweep-bar], [data-sweep-bar-part] { visibility: visible !important; }`;
      document.head.append(style);
    }, keep);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const alone = decodePng(await page.screenshot({ type: 'png' }));
    // the bars alone over a loud ground (#ff00ff): where a bar's box shows that ground unchanged, the bar paints nothing (a
    // clear strip its box holds above its body, as the deck's grade bar does): no chrome there to judge. A bar that paints,
    // however faintly (a frosted bar of the page's own colour), is judged on all it paints. The same over a second ground
    // (#00ff00): a pixel that differs between the two lets its ground through, so it is not fully opaque
    const bareOn = async (ground) => {
      await page.evaluate(([kept, g]) => {
        document.getElementById('sweep-bare')?.remove();
        const style = document.createElement('style');
        style.id = 'sweep-bare';
        const off = `:not(${kept})`;
        style.textContent = `body *${off}, body *${off}::before, body *${off}::after, body::before, body::after { visibility: hidden !important; transition: none !important; }
          [data-sweep-bar], [data-sweep-bar-part] { visibility: visible !important; } html { background: ${g} !important; } body { background: transparent !important; }`;
        document.head.append(style);
      }, [keep, ground]);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      return decodePng(await page.screenshot({ type: 'png' }));
    };
    const bare = await bareOn('#ff00ff'), green = await bareOn('#00ff00');
    const chrome = { bars: found.bars.length, scrolled: moved, parts: found.parts, fades: [], invalid: [], through: [], translucent: [] };
    for (const r of found.bars) {
      let edge = null;
      if (r.declared !== null) {
        const px = /^\d+(?:\.\d+)?px$/.test(r.declared) ? Number.parseFloat(r.declared) : Number.NaN;
        const why = r.side !== 'foot' ? 'a fade is declared only by a bar at the foot'
          : !(px > 0) ? 'not a positive length in px'
            : px > FADE_EDGE_MAX ? `taller than ${FADE_EDGE_MAX} px`
              : px >= r.bottom - r.top ? 'leaves the bar no body below its strip' : '';
        if (why) chrome.invalid.push({ bar: r.sel, side: r.side, declared: r.declared, why });
        else { edge = px; chrome.fades.push({ bar: r.sel, side: r.side, edge }); }
      }
      const x0 = Math.max(0, Math.floor(r.left * DPR)), x1 = Math.min(whole.width, Math.ceil(r.right * DPR));
      const y0 = Math.max(0, Math.floor(r.top * DPR)), y1 = Math.min(whole.height, Math.ceil(r.bottom * DPR));
      // a declared bar: only the rows wholly below its strip, every pixel of them; any other bar: all it paints
      const from = edge === null ? y0 : Math.max(y0, Math.ceil((r.top + edge) * DPR));
      let worst = 0, count = 0, seen = 0, open = 0, openWorst = 0;
      for (let y = from; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
        const m = pixel(bare, x, y);
        if (edge === null && m.r >= 250 && m.g <= 5 && m.b >= 250) continue;
        if (edge !== null) {
          const g = pixel(green, x, y), t = Math.max(Math.abs(m.r - g.r), Math.abs(m.g - g.g), Math.abs(m.b - g.b));
          if (t > 0) { open += 1; if (t > openWorst) openWorst = t; }
        }
        seen += 1;
        const a = pixel(whole, x, y), b = pixel(alone, x, y);
        const d = Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
        if (d > worst) worst = d;
        if (d > 8) count += 1;
      }
      if (worst > 8) chrome.through.push({ bar: r.sel, worst, pixels: count, ...(edge === null ? {} : { below: edge }) });
      if (open) chrome.translucent.push({ bar: r.sel, below: edge, worst: openWorst, pixels: open, of: seen });
    }
    return chrome;
  } finally {
    await page.evaluate((m) => {
      document.getElementById('sweep-isolate')?.remove();
      document.getElementById('sweep-bare')?.remove();
      for (const el of document.querySelectorAll('[data-sweep-bar-part]')) delete el.dataset.sweepBarPart;
      scrollBy({ top: -m.doc, behavior: 'instant' });
      const sheet = document.getElementById('sheet');
      if (sheet) sheet.scrollTop -= m.sheet;
    }, moved);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
}
// The declared fade's controls, in VH-1's form (the same-ink control's): each mutates the actual foot band of the actual
// deck front (hokusai, every engine), measures C8 exactly as the scene was measured, and restores the exact style; the
// receipt keeps the candidate (the scene's own C8 measurement), the mutant and the restored measurement, the style and the
// native record. A bar with transparency and no declaration, a declared fade taller than 24 px, and transparency below the
// declared strip must each turn C8 red.
const FOOT_BAND = 'kp-foot-band';
const C8_CONTROLS = Object.freeze([
  { id: 'fade-undeclared', what: 'the same 18 px fade with no declaration',
    css: '--fade-edge: initial; -webkit-mask-image: linear-gradient(to bottom, transparent, #000 18px); mask-image: linear-gradient(to bottom, transparent, #000 18px);',
    red: (m) => !m.fades.some((f) => f.bar === FOOT_BAND) && !m.invalid.some((f) => f.bar === FOOT_BAND) && m.through.some((t) => t.bar === FOOT_BAND && t.pixels > 0) },
  { id: 'fade-overdeclared', what: 'a declared fade of 30 px, taller than 24 px', css: '--fade-edge: 30px;',
    red: (m) => m.invalid.some((f) => f.bar === FOOT_BAND && f.declared === '30px' && f.why === `taller than ${FADE_EDGE_MAX} px`) },
  { id: 'fade-translucent-below', what: 'the band see-through below its declared strip (its paint at 85 %)',
    css: 'background: color-mix(in srgb, var(--kp-dock) 85%, transparent);',
    red: (m) => m.fades.some((f) => f.bar === FOOT_BAND) && m.translucent.some((t) => t.bar === FOOT_BAND && t.pixels > 0) },
]);
async function chromeControls(page, world, state, candidate, report) {
  const ids = [...C8_CONTROLS.map((control) => control.id), 'restore', 'record'];
  try {
    const band = page.locator(`.kp-study > .${FOOT_BAND}`).first();
    const declares = chromeClear(candidate) && !!candidate?.fades.some((f) => f.bar === FOOT_BAND && f.side === 'foot' && f.edge > 0 && f.edge <= FADE_EDGE_MAX);
    const recordBefore = await readAppRecord(page);
    const runs = [];
    for (const control of C8_CONTROLS) {
      const styleBefore = await band.getAttribute('style');
      let mutant;
      try {
        await band.evaluate((node, css) => node.setAttribute('style', css), control.css);
        mutant = await measureChrome(page);
      } finally {
        await band.evaluate((node, prior) => { if (prior === null) node.removeAttribute('style'); else node.setAttribute('style', prior); }, styleBefore);
      }
      const restored = await measureChrome(page);
      runs.push({ control, mutant, restored, styleBefore, styleAfter: await band.getAttribute('style') });
    }
    const recordAfter = await readAppRecord(page);
    for (const { control, mutant, restored, styleBefore, styleAfter } of runs) {
      report.controls.push({ engine, id: `c8-${control.id}`, scene: `${world}/${state}`, mutation: control.css, candidate, mutant, restored,
        styleBefore, styleAfter, recordBefore, recordAfter });
      check(`${world}/${state}.C8-control.${control.id}`, `C8 goes red on ${control.what}, where the actual band declaring its fade is green`,
        declares && !chromeClear(mutant) && control.red(mutant), mutant);
    }
    check(`${world}/${state}.C8-control.restore`, 'restoring the exact style after each control restores the exact candidate C8 measurement',
      runs.every((run) => run.styleAfter === run.styleBefore && JSON.stringify(run.restored) === JSON.stringify(candidate)), runs.map((run) => run.restored));
    check(`${world}/${state}.C8-control.record`, 'the C8 faults and their restoration preserve the whole native record', JSON.stringify(recordBefore) === JSON.stringify(recordAfter));
  } catch (error) {
    for (const id of ids) if (!rows.some((row) => row.id === `${engine}/${world}/${state}.C8-control.${id}`))
      check(`${world}/${state}.C8-control.${id}`, 'the C8 control completed', false, String(error.stack || error).slice(0, 600));
  }
}

/* ------------------------------------------------------------------ VC-1 · the C1 controls (diagnostic) */
// CONTRAST-INTEGRATION-SPEC item 4, in VH-1's form (the same-ink control's): on a world's slip, after its own measurement,
// each control measures C1 three times in the same page: the candidate (the scene's C1 again, bound to the scene's own
// result), the negative (the same measurement with the control's fault) and the restored measurement (the fault undone:
// exactly the candidate), with the native record before and after. Its row is green only when the negative shows the
// control's own named failure, so the fault can never pass.
const c1Core = (m) => ({ pairs: m.pairs, unresolved: m.unresolved, read: m.reread.read, barred: m.reread.barred, positions: m.reread.positions });
const c1Green = (m) => m.pairs.every((p) => p.ok) && m.unresolved.length === 0;
async function measureC1(page, world, state, fault = null) {
  try {
    if (fault?.setup) await fault.setup(page);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const { data, shot } = await capture(page);
    if (fault?.initial) fault.initial(data);
    const result = analyse(world, state, { ...data, paints: [], figures: [], kanji: [] }, shot, []);
    result.reread = await rereadWaiting(page, data, result, fault);
    const waiting = data.texts.flatMap((t) => t.lines.filter((l) => l.state === 'wait').map((l) => ({ occurrence: t.id, index: t.index, label: t.label, text: t.text,
      line: l.line, why: l.why, need: l.need ?? null, scroller: t.scroller })));
    return { pairs: result.pairs, unresolved: result.unresolved, reread: result.reread, waiting, open: data.open, scroll: data.scroll };
  } finally { if (fault?.teardown) await fault.teardown(page); }
}
const unresolvedFor = (m, occurrence, why) => m.unresolved.filter((u) => u.occurrence === occurrence && (!why || u.why === why));
// the token whose text node is the occurrence: the reader's own data-index names it on the page
const tokenText = (index, text) => ({ index, text });
const swapOut = ({ index, text }) => {
  const tok = document.querySelector(`.tok[data-index="${index}"]`);
  const walker = tok && document.createTreeWalker(tok, NodeFilter.SHOW_TEXT);
  for (let n = walker?.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim() === text) {
    const twin = document.createTextNode(n.nodeValue);
    window.__vc1Swap = { original: n, twin };
    n.replaceWith(twin);
    return true;
  }
  return false;
};
const swapBack = () => { const s = window.__vc1Swap; if (s?.twin.isConnected) s.twin.replaceWith(s.original); delete window.__vc1Swap; return !!s; };
const paintToken = ({ index, text, colour }) => {
  const tok = document.querySelector(`.tok[data-index="${index}"]`);
  const walker = tok && document.createTreeWalker(tok, NodeFilter.SHOW_TEXT);
  for (let n = walker?.nextNode(); n; n = walker.nextNode()) if (n.nodeValue.trim() === text) {
    const el = n.parentElement;
    window.__vc1Paint = { el, style: el.getAttribute('style') };
    // an ordinary inline colour (no !important), so the glyph-hiding shot still hides it as it hides every glyph
    el.style.setProperty('color', colour);
    el.style.setProperty('-webkit-text-fill-color', colour);
    return true;
  }
  return false;
};
const unpaint = () => { const p = window.__vc1Paint; if (p) { if (p.style === null) p.el.removeAttribute('style'); else p.el.setAttribute('style', p.style); } delete window.__vc1Paint; return !!p; };
/** A waiting reader occurrence whose label (path and words) a sibling read where it stood shares: the identity case.
 * The slip's word (総理) when one waits, else the first reader token that has such a sibling. */
function sameWordTarget(candidate) {
  const read = candidate.pairs.filter((p) => p.ok && p.lines.every((l) => l.at === 'stood') && p.index !== null);
  const fits = (w) => w.index !== null && w.scroller === 'doc' && w.why === 'outside the open area' && read.some((p) => p.label === w.label && p.occurrence !== w.occurrence);
  const x = candidate.waiting.find((w) => fits(w) && w.text === WORD) || candidate.waiting.find(fits);
  return x ? { x, y: read.find((p) => p.label === x.label && p.occurrence !== x.occurrence) } : null;
}
// the gold-edge counterexample as sol's spec states it (site-10, a dark world's slip): the source token 12's Range at
// +61 px, the fixed #mini's bottom at 454, the waiting token 43 requesting +61 px, the gold pixel at CSS (344.75, 453.25)
const GOLD_EDGE = Object.freeze({ rect: { left: 324.0625, top: 437.015625, right: 366.484375, bottom: 467.015625 }, miniBottom: 454, delta: 61, point: { x: 344.75, y: 453.25 }, source: '12', waiting: '43' });
const near = (a, b) => Math.abs(a - b) < 0.01;
const C1_FAULTS = {
  // (a) the gold-edge counterexample. Candidate: the source token 12 is read where it stands, wholly clear; the waiting
  // token 43 at +61 px; at that capture the pixel is #mini's and token 12's line there waits under #mini (never sampled).
  // Negative: token 12's line made to wait too, with the one position +61 px allowed: it is never sampled against the gold
  // edge, and with no clear position left it is a named failure, not a ratio.
  async 'gold-edge'(page, candidate) {
    const source = candidate.pairs.find((p) => p.index === GOLD_EDGE.source && p.text === WORD);
    const waiting = candidate.waiting.find((w) => w.index === GOLD_EDGE.waiting && w.text === WORD);
    if (!source || !waiting) return { inapplicable: `no ${WORD} token ${GOLD_EDGE.source} read and token ${GOLD_EDGE.waiting} waiting on this slip` };
    const observe = (facts) => async (pg, again) => {
      if (again.scroll.doc.y !== candidate.scroll.doc.y + GOLD_EDGE.delta) return;
      const t = again.texts.find((x) => x.id === source.occurrence), l = t?.lines.find((x) => x.line === 0);
      const mini = again.overlays.find((o) => /#mini$/.test(o.sel));
      facts.push({ at: again.scroll.doc.y, source: l ? { rect: l.rect, state: l.state, why: l.why || null, blockers: l.blockers?.map((b) => b.sel) || [], band: bandOf(l.rect) } : null,
        mini: mini ? { rect: mini.rect, extent: mini.extent } : null, owner: await pg.evaluate((p) => window.__sweep.ownerAt(p.x, p.y), GOLD_EDGE.point) });
    };
    const seen = [], refused = [];
    return {
      target: { source: source.occurrence, waiting: waiting.occurrence },
      observer: { after: observe(seen) },
      fault: {
        initial: (data) => { const t = data.texts.find((x) => x.id === source.occurrence); for (const l of t?.lines || []) if (l.state === 'read') Object.assign(l, { state: 'wait', why: 'held by the gold-edge control' }); },
        plan: (n) => (n === 0 ? { plan: { doc: candidate.scroll.doc.y + GOLD_EDGE.delta }, expect: { doc: 'the counterexample position' } } : null),
        after: observe(refused),
      },
      expectation: `never takes #mini's gold edge at CSS (${GOLD_EDGE.point.x}, ${GOLD_EDGE.point.y}) as token ${GOLD_EDGE.source}'s ground: token ${GOLD_EDGE.source} reads on its own wholly clear sample; held to the +${GOLD_EDGE.delta} px position it is a named failure`,
      judge(negative, cand) {
        const fact = seen[0], held = refused[0];
        const geometry = !!fact?.source && ['left', 'top', 'right', 'bottom'].every((k) => near(fact.source.rect[k], GOLD_EDGE.rect[k])) && fact.mini?.rect.bottom === GOLD_EDGE.miniBottom;
        const owned = fact?.owner?.layer?.id === 'mini' && fact.owner.token === null && fact.source.state === 'wait' && fact.source.blockers.some((b) => /#mini$/.test(b)) &&
          fact.source.band.top <= GOLD_EDGE.point.y && fact.source.band.bottom >= GOLD_EDGE.point.y && fact.source.band.left <= GOLD_EDGE.point.x && fact.source.band.right >= GOLD_EDGE.point.x;
        const own = cand.pairs.find((p) => p.occurrence === source.occurrence);
        const clear = !!own && own.ok && own.lines.every((l) => l.at === 'stood' && l.ratio >= own.required);
        const intended = cand.pairs.find((p) => p.occurrence === waiting.occurrence);
        const intendedOwn = !!intended && intended.ok && intended.lines.every((l) => l.at !== 'stood' && l.at.doc === candidate.scroll.doc.y + GOLD_EDGE.delta);
        const neverSampled = !negative.pairs.some((p) => p.occurrence === source.occurrence) && unresolvedFor(negative, source.occurrence, 'unexposed').length > 0 &&
          held?.owner?.layer?.id === 'mini' && held.source?.state === 'wait' && !c1Green(negative);
        return { ok: geometry && owned && clear && intendedOwn && neverSampled, geometry, owned, clear, intendedOwn, neverSampled, fact, held,
          source: own ? { occurrence: own.occurrence, index: own.index, ratio: own.ratio, lines: own.lines } : null,
          intended: intended ? { occurrence: intended.occurrence, index: intended.index, ratio: intended.ratio, lines: intended.lines } : null,
          negative: unresolvedFor(negative, source.occurrence) };
      },
    };
  },
  // (b) same word, another native index: the waiting occurrence held where it is still not exposed (a third of its need),
  // while a sibling with its label passed where it stood. The sibling's pass cannot complete it: a named failure.
  async 'same-word'(page, candidate) {
    const target = sameWordTarget(candidate);
    if (!target) return { inapplicable: 'no waiting reader token with a same-label sibling read where it stood' };
    const third = Math.round(target.x.need / 3);
    return {
      target: { waiting: target.x, sibling: { occurrence: target.y.occurrence, index: target.y.index, ratio: target.y.ratio } },
      fault: { plan: (n) => (n === 0 ? { plan: { doc: candidate.scroll.doc.y + third }, expect: { doc: 'a third of its need' } } : null) },
      expectation: `stays red for the waiting token ${target.x.index} (node ${target.x.occurrence}) when only its same-word sibling token ${target.y.index} has passed`,
      judge(negative) {
        const named = unresolvedFor(negative, target.x.occurrence, 'unexposed');
        const sibling = negative.pairs.find((p) => p.occurrence === target.y.occurrence);
        return { ok: named.length > 0 && !negative.pairs.some((p) => p.occurrence === target.x.occurrence) && !!sibling?.ok && !c1Green(negative),
          named, sibling: sibling && { occurrence: sibling.occurrence, ratio: sibling.ratio, ok: sibling.ok } };
      },
    };
  },
  // (c) a real visible low-contrast mutant: the actual CSS colour of one exposed occurrence lowered to ≈ 2.5:1 on its own
  // ground, its same-word siblings untouched and passing: C1 stays red below 4.5 for that occurrence
  async 'low-contrast'(page, candidate) {
    const exposed = (p) => p.index !== null && p.ok && p.lines.every((l) => l.at === 'stood') && candidate.pairs.some((q) => q.label === p.label && q.occurrence !== p.occurrence && q.ok);
    const mutant = candidate.pairs.find((p) => exposed(p) && p.text === WORD) || candidate.pairs.find(exposed);
    if (!mutant) return { inapplicable: 'no exposed reader token with a passing same-word sibling' };
    const fg = parseColour(mutant.fg), bg = parseColour(mutant.bg);
    let colour = null;
    for (let t = 0.05; t <= 1; t += 0.05) {
      const c = { r: bg.r + (fg.r - bg.r) * t, g: bg.g + (fg.g - bg.g) * t, b: bg.b + (fg.b - bg.b) * t, a: 1 };
      if (ratio(c, bg) >= 2.5) { colour = hex(c); break; }
    }
    return {
      target: { occurrence: mutant.occurrence, index: mutant.index, text: mutant.text, colour, candidateRatio: mutant.ratio },
      fault: { setup: async (pg) => assert(await pg.evaluate(paintToken, { ...tokenText(mutant.index, mutant.text), colour }), 'mutant paint did not apply'),
        teardown: async (pg) => { await pg.evaluate(unpaint); } },
      expectation: `stays red below 4.5 for token ${mutant.index} painted ${colour}, while its same-word siblings pass`,
      judge(negative) {
        const red = negative.pairs.find((p) => p.occurrence === mutant.occurrence);
        const siblings = negative.pairs.filter((p) => p.label === mutant.label && p.occurrence !== mutant.occurrence);
        return { ok: !!red && !red.ok && red.ratio < 4.5 && red.required === 4.5 && red.fg === colour && siblings.length > 0 && siblings.every((p) => p.ok) && !c1Green(negative),
          red: red && { occurrence: red.occurrence, ratio: red.ratio, fg: red.fg, bg: red.bg, ok: red.ok }, siblings: siblings.map((p) => ({ occurrence: p.occurrence, index: p.index, ratio: p.ratio, ok: p.ok })) };
      },
    };
  },
  // (d) bounded positioning and coverage: each failure is named, never a pass
  async timeout(page, candidate) {
    const target = sameWordTarget(candidate);
    if (!target) return { inapplicable: 'no waiting reader occurrence' };
    return { target: { waiting: target.x }, fault: { budgetMs: 0 }, expectation: 'with its positioning budget spent, every waiting line is a named "positioning timeout"',
      judge: (negative) => { const named = unresolvedFor(negative, target.x.occurrence, 'positioning timeout');
        return { ok: named.length > 0 && negative.reread.passes === 0 && !negative.pairs.some((p) => p.occurrence === target.x.occurrence) && !c1Green(negative), named }; } };
  },
  async unexposed(page, candidate) {
    // a real fixed overlay of the page's own ground standing over the reading column's start, through the whole open area:
    // a line it half covers can be brought nowhere clear of it
    const veil = { top: candidate.open.top, height: candidate.open.bottom - candidate.open.top };
    return {
      target: { veil },
      fault: {
        setup: async (pg) => pg.evaluate((v) => {
          const d = document.createElement('div');
          d.id = 'vc1-veil';
          d.style.cssText = `position:fixed;left:0;top:${v.top}px;width:60px;height:${v.height}px;z-index:65;background:var(--color-page, var(--ground));`;
          document.body.append(d);
        }, veil),
        teardown: async (pg) => { await pg.evaluate(() => document.getElementById('vc1-veil')?.remove()); },
      },
      expectation: 'a line a fixed overlay half covers at every bounded position is a named "unexposed" failure',
      judge: (negative) => { const named = negative.unresolved.filter((u) => u.why === 'unexposed' && u.geometry?.blockers?.some((b) => /vc1-veil/.test(b.sel)));
        return { ok: named.length > 0 && !c1Green(negative), named: named.slice(0, 4), count: named.length }; },
    };
  },
  async 'missing-occurrence'(page, candidate) {
    const target = sameWordTarget(candidate);
    if (!target) return { inapplicable: 'no waiting reader occurrence with a same-label sibling' };
    let swapped = false;
    return {
      target: { waiting: target.x },
      fault: {
        before: async (pg) => { if (!swapped) { swapped = await pg.evaluate(swapOut, tokenText(target.x.index, target.x.text)); assert(swapped, 'the occurrence was not replaced'); } },
        teardown: async (pg) => { await pg.evaluate(swapBack); },
      },
      expectation: `the waiting token ${target.x.index}'s text node replaced by an identical twin before its capture is a named "missing native occurrence"`,
      judge: (negative) => { const named = unresolvedFor(negative, target.x.occurrence, 'missing native occurrence');
        return { ok: named.length > 0 && !negative.pairs.some((p) => p.occurrence === target.x.occurrence) && !c1Green(negative), named }; },
    };
  },
  async 'duplicate-completion'(page, candidate) {
    const target = sameWordTarget(candidate);
    if (!target) return { inapplicable: 'no waiting reader occurrence' };
    return {
      target: { waiting: target.x },
      fault: { census: (again) => { const t = again.texts.find((x) => x.id === target.x.occurrence); if (t) again.texts.push(structuredClone(t)); } },
      expectation: `a capture naming the waiting token ${target.x.index} twice is a named "duplicate completion", never two passes`,
      judge: (negative) => { const named = unresolvedFor(negative, target.x.occurrence, 'duplicate completion');
        return { ok: named.length > 0 && !negative.pairs.some((p) => p.occurrence === target.x.occurrence) && !c1Green(negative), named }; },
    };
  },
};
// the reader keeps its place: it saves its scroll position 900 ms after the last scroll (corridor.js saveReaderPosition), so
// a control that scrolled reads the native record only once that save has landed (the same record twice, 300 ms apart)
async function settledRecord(page) {
  let last = null;
  for (let i = 0; i < 8; i++) {
    await delay(i ? 300 : 1100);
    const now = JSON.stringify(await readAppRecord(page));
    if (now === last) return JSON.parse(now);
    last = now;
  }
  return JSON.parse(last);
}
async function c1Controls(page, world, state, scene, report) {
  for (const id of c1ControlIds.filter((c) => c1SceneOf(c) === state)) {
    const name = id.slice(3), row = `${world}/${state}.C1-control.${name}`;
    try {
      const recordBefore = await settledRecord(page);
      const probe = await measureC1(page, world, state);
      const control = await C1_FAULTS[name](page, probe);
      if (control.inapplicable) { check(row, `the C1 control ${name} applies here`, false, control.inapplicable); continue; }
      const candidate = control.observer ? await measureC1(page, world, state, control.observer) : probe;
      const negative = await measureC1(page, world, state, control.fault);
      const restored = await measureC1(page, world, state);
      const recordAfter = await settledRecord(page);
      const verdict = control.judge(negative, candidate);
      const bound = JSON.stringify(c1Core(candidate)) === JSON.stringify(c1Core({ ...scene, reread: scene.reread }));
      const same = JSON.stringify(c1Core(restored)) === JSON.stringify(c1Core(candidate));
      report.controls.push({ engine, id, scene: `${world}/${state}`, target: control.target, expectation: control.expectation, verdict, bound,
        candidate, negative, restored, recordBefore, recordAfter });
      check(row, `C1 ${control.expectation}`, verdict.ok, verdict);
      check(`${row}.restore`, 'the candidate is the scene\'s own C1 measurement, and undoing the fault restores it exactly', bound && same,
        { bound, same, restored: c1Core(restored) });
      check(`${row}.record`, 'the fault and its undoing preserve the whole native record', JSON.stringify(recordBefore) === JSON.stringify(recordAfter));
    } catch (error) {
      for (const suffix of ['', '.restore', '.record']) if (!rows.some((r) => r.id === `${engine}/${row}${suffix}`))
        check(`${row}${suffix}`, 'the C1 control completed', false, String(error.stack || error).slice(0, 600));
    }
  }
}

/* ------------------------------------------------------------------ run */
const report = { schemaVersion: 2, runId, artifactSha256: identity.artifactSha256, gitSha: identity.gitSha, sourceDirty: identity.sourceDirty,
  verifierSha256: createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex'),
  arrivalPredicateSha256: createHash('sha256').update(readFileSync(new URL('./vh-contrast-arrival.mjs', import.meta.url))).digest('hex'),
  identity: { gitSha: identity.gitSha, artifactSha256: identity.artifactSha256 }, partial, worlds, states, engines: {}, results: [], controls: [], source: null,
  requestedScope: partial ? 'diagnostic' : 'full', selectors: { worlds: onlyWorlds, states: onlyStates, demoOnly, ...(SWEEP_NEGATIVE !== null ? { negative: SWEEP_NEGATIVE } : {}) },
  freshDemoMotion: 'no-preference', settledMotion: 'reduce',
  contrastTimingContract: 'Lead rulings 0806/0842, 2026-10-19 VH-1: D2/C1 at rest; actual named read-mini-rise finishes at full opacity by its authored end plus one independently pre-calibrated frame. Elapsed is observing RAF/document.timeline timestamp minus CSSAnimation.startTime; performance.now is callback-delivery telemetry only.' };
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
    try {
    for (const world of worlds) {
      if (states.includes('fresh-demo')) await freshDemo(browser, world, report);
      if (!states.some((state) => SETTLED_STATES.includes(state))) continue;
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'light' });
      await silenceBrowserAudio(context);
      await context.addInitScript(IN_PAGE);
      if (SWEEP_NEGATIVE === 'translucent-bar') await context.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.textContent = '#primary-tabs { background: color-mix(in srgb, var(--color-bar, #f5efe0) 55%, transparent) !important; backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }';
        document.head.append(style);
      }));
      await context.addInitScript((id) => {
        try {
          localStorage.setItem('kairo-theme', id);
          localStorage.setItem('bunki-cloze:prefs:v3:n1', JSON.stringify({ look: 'world', zoom: 'full', sittings: 3, ruleSeen: true }));
          // This is the settled-device fixture. freshDemo independently measures the pristine-device demonstration.
          localStorage.setItem('kairo-word-ladder-demo-v1', '1');
        } catch { /* storage refused: the theme check below fails the walk */ }
      }, world);
      await context.route('**/*', (route) => (new URL(route.request().url()).origin === origin ? route.continue() : route.abort()));
      const page = await context.newPage(), errors = [];
      const canvas = await context.newPage();
      await canvas.setContent('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;padding:0}</style></head><body></body></html>');
      await canvas.evaluate(IN_PAGE);
      page.setDefaultTimeout(20000);
      page.on('pageerror', (error) => errors.push(error.message));
      for (const state of SETTLED_STATES) {
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
        // VC-1 · the scene's census: the fixed layers met (overlays, the bars' parts, those standing behind), the lines by
        // state, the lines read with a probe on something outside their own element, and every waiting line
        const lineStates = data.texts.flatMap((t) => t.lines.map((l) => l.state));
        result.census = { open: data.open, scroll: data.scroll, overlays: data.overlays, fixedOther: data.fixedOther,
          lines: Object.fromEntries(['read', 'wait', 'occluded'].map((k) => [k, lineStates.filter((x) => x === k).length])),
          foreign: data.texts.flatMap((t) => t.lines.filter((l) => l.foreign).map((l) => ({ occurrence: t.id, text: t.text.slice(0, 20), line: l.line, probes: l.foreign, by: l.foreignBy }))),
          shaded: data.texts.flatMap((t) => t.lines.filter((l) => l.shaded).map((l) => ({ occurrence: t.id, text: t.text.slice(0, 20), line: l.line, by: l.shaded }))),
          waiting: data.texts.flatMap((t) => t.lines.filter((l) => l.state === 'wait').map((l) => ({ occurrence: t.id, index: t.index, text: t.text.slice(0, 20), line: l.line,
            why: l.why, scroller: t.scroller, rect: l.rect, ...(l.blockers?.length ? { blockers: l.blockers.map((b) => b.sel) } : {}) }))) };
        // Hfix-1A (F-1, the lead's ruling), VC-1 (CONTRAST-INTEGRATION-SPEC item 2) · every required line not read where it
        // stood (outside the open area, or under an overlay's paint) is read again at a native position that clears that very
        // line, verified at its capture; one completion per line; a line no bounded position reads is a named failure, unless
        // no scroll moves it and it lies wholly inside an opaque bar's box (barred: hidden, C8 proves the bar opaque)
        result.reread = await rereadWaiting(page, data, result);
        // C8 (F-1) · the fixed chrome is opaque enough that text under it never shows through: with the reading scrolled
        // so text lies under the bars, each bar's pixels are the same with what scrolls under them hidden as with it shown
        // (any channel within 8/255); a bar at the foot that declares a top-edge fade is judged below its strip, where it
        // must be fully opaque (measureChrome)
        // INT-VH: VH-1's form for a row a screen may not apply to (as C5): the row is always written, its applicability
        // explicit, so the admission roster is exact. Where no fixed bar meets the glass there is no chrome to judge, as
        // Hfix-1A's conditional row had nothing to say there; wherever a bar paints, the measurement and predicate are Hfix-1A's
        const chrome = data.bars?.length ? await measureChrome(page) : null;
        if (chrome) result.chrome = chrome;
        check(`${world}/${state}.C8`, `${world}/${state}: the fixed chrome (${chrome?.bars ?? 0} bars${chrome?.fades.length ? `; ${chrome.fades.map((f) => `${f.bar} declares a ${f.edge} px fade`).join(', ')}` : ''}) is opaque: no text under it shows through (scrolled ${chrome ? chrome.scrolled.doc || chrome.scrolled.sheet : 0} px)`,
          chromeClear(chrome), { applicability: chrome ? 'measured' : 'vacuous-no-fixed-chrome', ...(chrome || {}) });
        if (world === 'hokusai' && state === 'deck-front') await chromeControls(page, world, state, chrome, report);
        report.results.push(result);
        const fails = result.pairs.filter((p) => !p.ok).sort((a, b) => a.ratio / a.required - b.ratio / b.required);
        const worstPair = result.pairs.slice().sort((a, b) => a.ratio / a.required - b.ratio / b.required)[0];
        // VC-1 · each failing pair names its native occurrence (text node, reader token, line); a named unresolved failure
        // (unexposed, missing native occurrence, positioning timeout, duplicate completion, unresolved paint) fails C1 too
        const named = (p) => `node ${p.occurrence}${p.index !== null && p.index !== undefined ? ` token ${p.index}` : ''}`;
        check(`${world}/${state}.C1`, `${world}/${state}: every visible text run reads, each line in the open reading area and clear of every overlay (${result.pairs.length} runs, ${result.reread.read} lines read again at a clear position; worst ${worstPair ? `${worstPair.ratio}:1 "${worstPair.text}"` : '—'})`,
          fails.length === 0 && result.unresolved.length === 0,
          { fails: fails.slice(0, 12).map((p) => `${p.ratio}<${p.required} ${p.fg} on ${p.bg} "${p.text}" ${named(p)} line ${p.lines.find((l) => !l.ok)?.line} ${p.sel}${p.pass ? ` (${p.pass})` : ''}`),
            unresolved: result.unresolved.slice(0, 8).map((u) => ({ ...u, attempts: u.attempts?.slice(0, 6) })), barred: result.reread.barred.slice(0, 6) });
        if (result.figures.length) check(`${world}/${state}.C2`, `${world}/${state}: the overlay stands as a figure on its page (≥ 3:1 fill or lit edge on one whole side)`,
          result.figures.every((f) => f.ok), result.figures);
        check(`${world}/${state}.C3`, `${world}/${state}: every gradient and every owned surface roots in the world's ${result.pigmentCount} pigments`,
          result.pigmentCount >= 24 && result.roots.length === 0, { pigments: result.pigmentCount, off: result.roots.slice(0, 12) });
        const banded = result.banding.filter((b) => !b.ok);
        check(`${world}/${state}.C4`, `${world}/${state}: no banding, gentle slope — ≤ 1 visible tonal step per 24 px (${result.banding.length} gradation layers drawn)`,
          banded.length === 0, banded.slice(0, 8));
        check(`${world}/${state}.C5`, `${world}/${state}: the key-kanji sheets wear their wash and the kanji reads ≥ 4.5:1 (${result.kanji.length})`,
          result.kanji.every((k) => k.ok), { applicability: result.kanji.length ? 'measured' : 'vacuous-no-key-kanji-sheet', measured: result.kanji.length, sheets: result.kanji });
        if (!NIGHT.has(world)) check(`${world}/${state}.C6`, `${world}/${state}: no muddy surface (between ink and 92 % of the page)`, result.muddy.length === 0, result.muddy.slice(0, 10));
        if (c1ControlIds.some((id) => c1SceneOf(id) === state)) await c1Controls(page, world, state, result, report);
      }
      if (onlyStates?.includes('shelf') || !onlyStates) {
        const ks = report.results.filter((r) => r.engine === engine && r.world === world && r.state === 'shelf');
        check(`${world}/shelf.C5-present`, `${world}: the shelf's first screen shows a key-kanji sheet`, ks.some((r) => r.kanji.length > 0), ks.map((r) => r.kanji.length));
      }
      check(`${world}.page-errors`, `${world}: no page errors`, errors.length === 0, errors.slice(0, 6));
      await context.close();
    }
    } finally { await browser.close(); }
  }
} catch (error) {
  report.error = String(error.stack || error);
  check('fatal', 'contrast sweep completed', false, report.error);
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
report.expectedCases = contrastExpectedCases(engines.length === 2 ? 'all' : engines[0]);
report.observedCases = rows.map((row) => row.id);
report.selectedPassed = rows.length > 0 && rows.every((row) => row.ok) && !report.error;
report.fullAcceptance = !partial && report.selectedPassed && report.expectedCases.length === rows.length &&
  new Set(report.observedCases).size === rows.length && report.expectedCases.every((id) => report.observedCases.includes(id));
writeFileSync(join(evidence, 'contrast-sweep.json'), JSON.stringify(report, null, 1));
writeFileSync(join(evidence, `sweep-${engines.join('-')}.json`), JSON.stringify(report, null, 1));
console.log('\nworst pair per world');
for (const t of table) console.log(`  ${t.engine.padEnd(8)} ${t.world.padEnd(9)} runs ${String(t.runs).padStart(5)}  unresolved ${t.unresolved}  ${t.worst}`);
const failed = rows.filter((r) => !r.ok);
console.log(`\n${rows.length - failed.length}/${rows.length} rows green${partial ? ' — PARTIAL RUN (SWEEP_WORLDS/SWEEP_STATES): never an acceptance' : ''}`);
console.log(`artifact ${identity.artifactSha256} @ ${identity.gitSha}`);
process.exitCode = failed.length || (!partial && !report.fullAcceptance) ? 1 : partial ? 3 : 0;
