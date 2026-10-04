/**
 * Contrast of the deck player's colour tokens, read straight from player.css (no browser).
 *
 * For every theme in THEMES the tokens are resolved the way the cascade does it (every `.kp`
 * block in file order, then every `.kp[data-look='<theme>']` block), var() references followed,
 * translucent washes composited over the surface they sit on, and each (text, surface) pair the
 * card uses is measured with the WCAG 2 relative-luminance formula:
 *
 *   passage   --kp-ink on the card                                   ≥ 7   (aesthetics.md §3)
 *   body      --kp-ink on the page and the second panel              ≥ 4.5
 *   gloss     --kp-ink-2 (English gloss, 英訳, readings, chips, level chip) on card, panel-2, page
 *   muted     --kp-mute (labels, fold markers, small print) on card, panel-2, page
 *   kind      --kp-kind-go / -ji / -bun (edge + 語・字・文法 chip) on the card
 *   state     --kp-red / -green / -amber (grade buttons, state chips) on the card; 思い出せた on its tint
 *   accent    --kp-cyan on the card, the page and its own wash (答えを見る, chosen settings)
 *   pos       --kp-noun … --kp-sound (the target, the badge) on the card
 *   start     --kp-on-accent on --kp-cyan (the 始める button)
 *
 * The page surface is --kp-bg with every translucent layer of --kp-tex stacked on it (the
 * textures live on the page, never on the card: aesthetics.md §5).
 *
 * Usage: node contrast-kotoba.mjs        prints the table, exits 1 when a pair is under its floor.
 *        import { contrastTable } from … returns { rows, failures } for the verifier.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../decks/player/player.css');
export const THEMES = ['dark', 'ai', 'matcha', 'kokuban', 'washi', 'sakura', 'light', 'contrast'];

/** every rule as [selector, body]; tokens are only ever declared on `.kp` and `.kp[data-look=…]`,
 * never inside @media, so the innermost-block scan is enough */
function blocks(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);
}

/** the custom properties of one declaration block, split on ; outside parentheses */
function props(body) {
  const out = {};
  let depth = 0;
  let cur = '';
  for (const ch of body + ';') {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ';' && depth === 0) {
      const m = cur.match(/^\s*(--kp-[\w-]+)\s*:\s*([\s\S]+?)\s*$/);
      if (m) out[m[1]] = m[2];
      cur = '';
    } else cur += ch;
  }
  return out;
}

export function themeTokens(css = readFileSync(CSS_PATH, 'utf8')) {
  const all = blocks(css);
  const base = {};
  for (const [sel, body] of all) if (sel === '.kp') Object.assign(base, props(body));
  const out = {};
  for (const look of THEMES) {
    const t = { ...base };
    for (const [sel, body] of all) if (sel.replace(/"/g, "'") === `.kp[data-look='${look}']`) Object.assign(t, props(body));
    out[look] = t;
  }
  return out;
}

/** a colour value → [r, g, b, a] (hex, rgb(), rgba(), var(), color-mix(in srgb, …)) */
function colour(value, t, seen = new Set()) {
  const v = value.trim();
  const ref = v.match(/^var\(\s*(--kp-[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (ref) {
    if (seen.has(ref[1])) throw new Error(`cycle at ${ref[1]}`);
    if (t[ref[1]] != null) return colour(t[ref[1]], t, new Set([...seen, ref[1]]));
    if (ref[2]) return colour(ref[2], t, seen);
    throw new Error(`${ref[1]} is not defined`);
  }
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = h.match(/../g).map((x) => parseInt(x, 16));
    return [n[0], n[1], n[2], n.length > 3 ? n[3] / 255 : 1];
  }
  m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const n = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [n[0], n[1], n[2], n[3] ?? 1];
  }
  m = v.match(/^color-mix\(in srgb,\s*([\s\S]+?)\s+([\d.]+)%\s*,\s*([\s\S]+)\)$/);
  if (m) {
    const a = colour(m[1], t, seen);
    const b = colour(m[3], t, seen);
    const p = Number(m[2]) / 100;
    return [0, 1, 2].map((i) => a[i] * p + b[i] * (1 - p)).concat(1);
  }
  if (v === '#000' || v === 'black') return [0, 0, 0, 1];
  if (v === '#fff' || v === 'white') return [255, 255, 255, 1];
  throw new Error(`cannot read colour ${v}`);
}
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
const lum = (c) =>
  c
    .slice(0, 3)
    .map((x) => {
      const s = x / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
export function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** [row label, floor, text tokens, surfaces] */
const ROWS = [
  ['passage', 7, ['ink'], ['panel']],
  ['body', 4.5, ['ink'], ['bg', 'panel-2']],
  ['gloss / chips', 4.5, ['ink-2'], ['panel', 'panel-2', 'bg']],
  ['muted', 4.5, ['mute'], ['panel', 'panel-2', 'bg']],
  ['kind', 4.5, ['kind-go', 'kind-ji', 'kind-bun'], ['panel']],
  ['state', 4.5, ['red', 'green', 'amber'], ['panel', 'good-button']],
  ['accent', 4.5, ['cyan'], ['panel', 'bg', 'accent-wash']],
  ['pos', 4.5, ['noun', 'verb', 'adj', 'adv', 'expr', 'sound'], ['panel']],
  ['start', 4.5, ['on-accent'], ['accent']],
];

export function contrastTable(css) {
  const tokens = themeTokens(css);
  const rows = [];
  const failures = [];
  for (const look of THEMES) {
    const t = tokens[look];
    const c = (k) => colour(`var(--kp-${k})`, t);
    // the page under its texture: every translucent layer of --kp-tex stacked where they overlap
    const tex = [...(t['--kp-tex'] ?? 'none').matchAll(/rgba\([^)]+\)/g)].map((m) => colour(m[0], t));
    const bg = tex.reduce((under, layer) => over(layer, under), c('bg'));
    const panel = over(c('panel'), bg);
    const surfaces = {
      bg,
      panel,
      'panel-2': over(c('panel-2'), panel),
      // 思い出せた: 12% of the green over the card panel (player.css .kp-good)
      'good-button': [0, 1, 2].map((i) => c('green')[i] * 0.12 + panel[i] * 0.88),
      'accent-wash': over(c('cyan-wash'), bg),
      accent: c('cyan'),
    };
    const row = { look };
    for (const [label, floor, texts, on] of ROWS) {
      let min = { r: Infinity };
      for (const k of texts) for (const s of on) {
        // the good-button surface only carries the green
        if (s === 'good-button' && k !== 'green') continue;
        const r = ratio(over(c(k), surfaces[s]), surfaces[s]);
        if (r < min.r) min = { r, pair: `${k} on ${s}` };
      }
      row[label] = Math.round(min.r * 100) / 100;
      if (min.r < floor) failures.push(`${look}: ${min.pair} ${row[label]} < ${floor}`);
    }
    rows.push(row);
  }
  return { rows, failures, floors: Object.fromEntries(ROWS.map(([l, f]) => [l, f])) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { rows, failures, floors } = contrastTable();
  const cols = Object.keys(floors);
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('theme', 9)}${cols.map((c) => pad(`${c} ≥${floors[c]}`, 20)).join('')}`);
  for (const r of rows) console.log(`${pad(r.look, 9)}${cols.map((c) => pad(r[c].toFixed(2), 20)).join('')}`);
  console.log(failures.length ? `\n${failures.length} pair(s) under the floor:\n  ${failures.join('\n  ')}` : '\nevery pair clears its floor');
  process.exit(failures.length ? 1 : 0);
}
