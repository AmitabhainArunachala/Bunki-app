/**
 * Contrast of the deck player's colour tokens — one material (the one-hand pass, slice D).
 *
 * The deck wears the world: its page, paper, ink and edge are the room's roles (--color-*), its
 * grade, kind and part-of-speech hues a day set and a night set (player.css). So it is measured twice:
 *
 *   1. the standalone sheet, read straight from player.css (no browser): the `.kp` block with its
 *      fallbacks — the default world by day — which is the only material the frozen study pages have
 *      (no room loads there);
 *   2. the hosted deck in every world, in the browser: the ten public worlds and the default, by day
 *      and at night, on the home and in a sitting (the stage and the dock), every token resolved by the
 *      page itself (contrastByWorld).
 *
 * Each (text, surface) pair the card uses is measured with the WCAG 2 relative-luminance formula:
 *
 *   passage   --kp-ink on the card                                   ≥ 7   (aesthetics.md §3)
 *   body      --kp-ink on the page and the second panel              ≥ 4.5
 *   gloss     --kp-ink-2 (English gloss, 英訳, readings, chips, level chip) on card, panel-2, page
 *   muted     --kp-mute (labels, fold markers, small print) on card, panel-2, page
 *   kind      --kp-kind-go / -ji / -bun (edge + 語・字・文法 chip) on the card
 *   state     --kp-red / -amber / -green / -blue (the four grade pads もう一度・難しい・正解・簡単, state
 *             chips) on the card; 正解 on its tint
 *   accent    --kp-cyan on the card, the page and its own wash (答えを見る, chosen settings)
 *   pos       --kp-noun … --kp-sound (the target, the badge) on the card
 *   start     --kp-on-accent on --kp-cyan (the 始める button)
 *   stage     --kp-stage-ink / --kp-stage-mute (the study top bar's count and 削除, the swipe hint,
 *             the rule, ↶) on --kp-stage, the ground around the card while studying
 *   dock      --kp-dock-ink / --kp-dock-mute (the swipe hint, the rule and its ×, ↶) on --kp-dock, the ground
 *             under 答えを見る and the grade pads
 *
 * The page surface is --kp-bg with every translucent layer of --kp-tex stacked on it (the
 * textures live on the page, never on the card: aesthetics.md §5).
 *
 * Distinctness (STANDARD A40): the 字 hue (--kp-kind-ji, a 字 card's edge and chip) must not
 * nearly match another hue of its material — the 語 and 文法 kinds, the six part-of-speech hues the
 * target wears, the accent, the grade and state colours. Measured as the OKLab distance ×100
 * (ΔE_ok); floor 10.
 *
 * Usage: node contrast-kotoba.mjs                      the standalone sheet; exits 1 when a pair is under its floor.
 *        KAIRO_SITE_DIR=<built site> node contrast-kotoba.mjs
 *                                                      also serves the site and measures every world in Chromium.
 *        import { contrastTable, contrastByWorld } …  for the verifier.
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const CSS_PATH = resolve(dirname(fileURLToPath(import.meta.url)), '../decks/player/player.css');
/** the static sheets: the standalone deck is the `.kp` block's fallbacks (the default world by day) */
export const THEMES = ['standalone'];
/** the worlds the hosted deck is measured in: the default (ベロ藍・浪) and the ten public worlds */
export const WORLDS = ['hokusai', 'sumi', 'shu', 'akafuji', 'iwa', 'rokusho', 'yoru', 'nami', 'keyblock', 'hakuu', 'kaku'];
const NIGHT = new Set(['rokusho', 'yoru', 'nami', 'hakuu', 'kaku']);

/** every rule as [selector, body]; tokens are only ever declared on `.kp` (and the night `.kp`),
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
  const base = {};
  for (const [sel, body] of blocks(css)) if (sel === '.kp') Object.assign(base, props(body));
  return { standalone: base };
}

/** a colour value → [r, g, b, a] (hex, rgb(), rgba(), var() with a fallback, color-mix(in srgb, …)).
 * A var() the sheet does not define (a room's --color-* role) resolves to its fallback: that is the
 * standalone page's value. */
function colour(value, t, seen = new Set()) {
  const v = value.trim();
  const ref = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (ref) {
    if (seen.has(ref[1])) throw new Error(`cycle at ${ref[1]}`);
    if (t[ref[1]] != null) return colour(t[ref[1]], t, new Set([...seen, ref[1]]));
    if (ref[2]) return colour(ref[2], t, seen);
    throw new Error(`${ref[1]} is not defined and has no fallback`);
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
  if (v === 'transparent') return [0, 0, 0, 0];
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
  ['state', 4.5, ['red', 'amber', 'green', 'blue'], ['panel', 'good-button']],
  ['accent', 4.5, ['cyan'], ['panel', 'bg', 'accent-wash']],
  ['pos', 4.5, ['noun', 'verb', 'adj', 'adv', 'expr', 'sound'], ['panel']],
  ['start', 4.5, ['on-accent'], ['accent']],
  ['stage', 4.5, ['stage-ink', 'stage-mute'], ['stage']],
  ['dock', 4.5, ['dock-ink', 'dock-mute'], ['dock']],
];
/** the rows a deck home shows (no stage, no dock until a sitting starts) */
const HOME_ROWS = ROWS.filter(([label]) => label !== 'stage' && label !== 'dock');
export const FLOORS = Object.fromEntries(ROWS.map(([l, f]) => [l, f]));

/** one sheet: `c(token)` resolves a --kp-* token to [r, g, b, a]; `tex` is the page texture's value
 * (its translucent rgba() layers are stacked on the page) */
function measureSheet(look, c, tex, rows = ROWS) {
  const layers = [...(tex ?? 'none').matchAll(/rgba\([^)]+\)/g)].map((m) => colour(m[0], {}));
  const bg = layers.reduce((under, layer) => over(layer, under), c('bg'));
  const panel = over(c('panel'), bg);
  const surfaces = {
    bg,
    panel,
    'panel-2': over(c('panel-2'), panel),
    // 正解 (Good): 12% of the green over the card panel (player.css .kp-good)
    'good-button': [0, 1, 2].map((i) => c('green')[i] * 0.12 + panel[i] * 0.88),
    'accent-wash': over(c('cyan-wash'), bg),
    accent: over(c('cyan'), bg),
  };
  if (rows.some(([label]) => label === 'stage')) {
    surfaces.stage = over(c('stage'), bg);
    surfaces.dock = over(c('dock'), bg);
  }
  const row = { look };
  const failures = [];
  for (const [label, floor, texts, on] of rows) {
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
  return { row, failures };
}

export function contrastTable(css) {
  const tokens = themeTokens(css);
  const rows = [];
  const failures = [];
  for (const look of THEMES) {
    const t = tokens[look];
    const c = (k) => colour(`var(--kp-${k})`, t);
    const r = measureSheet(look, c, t['--kp-tex']);
    rows.push(r.row);
    failures.push(...r.failures);
  }
  return { rows, failures, floors: FLOORS };
}

/* ---------------------------------------------------------------- distinctness of the 字 hue */
const linear = (c) => c.slice(0, 3).map((x) => ((x /= 255) <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
/** sRGB → OKLab (Björn Ottosson, 2020) */
function oklab(c) {
  const [r, g, b] = linear(c);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export const deltaE = (a, b) => {
  const [p, q] = [oklab(a), oklab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) * 100;
};
export const KIND_JI_FLOOR = 10;
const KIND_JI_OTHERS = ['kind-go', 'kind-bun', 'noun', 'verb', 'adj', 'adv', 'expr', 'sound', 'cyan', 'red', 'green', 'amber', 'blue'];
function kindJiRow(look, c, value) {
  const ji = c('kind-ji');
  const near = KIND_JI_OTHERS.map((k) => ({ token: k, d: deltaE(ji, c(k)) })).sort((a, b) => a.d - b.d)[0];
  const row = { look, ji, value, onCard: Math.round(ratio(ji, c('panel')) * 100) / 100, nearest: near.token, deltaE: Math.round(near.d * 10) / 10 };
  const failure = near.d < KIND_JI_FLOOR ? `${look}: kind-ji ${row.value} is ΔE ${row.deltaE} from ${near.token} (< ${KIND_JI_FLOOR})` : null;
  return { row, failure };
}
/** per sheet: the 字 hue, its contrast on the card, and the nearest other hue with its ΔE_ok */
export function kindJiTable(css) {
  const tokens = themeTokens(css);
  const rows = [];
  const failures = [];
  for (const look of THEMES) {
    const t = tokens[look];
    const c = (k) => colour(`var(--kp-${k})`, t);
    const r = kindJiRow(look, c, t['--kp-kind-ji']);
    rows.push(r.row);
    if (r.failure) failures.push(r.failure);
  }
  return { rows, failures };
}

/* ---------------------------------------------------------------- every world, in the browser */
const PROBE_TOKENS = ['ink', 'ink-2', 'mute', 'bg', 'panel', 'panel-2', 'cyan', 'cyan-wash', 'red', 'amber', 'green', 'blue', 'violet',
  'kind-go', 'kind-ji', 'kind-bun', 'noun', 'verb', 'adj', 'adv', 'expr', 'sound', 'on-accent', 'stage', 'stage-ink', 'stage-mute', 'dock', 'dock-ink', 'dock-mute'];
/** the page resolves every token (var() chains, color-mix, the room's roles) on a probe element */
const PROBE = `(() => {
  const kp = document.querySelector('.kp');
  const probe = document.createElement('i');
  kp.append(probe);
  const rgba = (v) => { probe.style.color = ''; probe.style.color = v; const c = getComputedStyle(probe).color;
    const n = (c.match(/[\\d.]+/g) || []).map(Number); return c.startsWith('rgb') ? [n[0], n[1], n[2], n.length > 3 ? n[3] : 1] : null; };
  const out = {};
  for (const k of ${JSON.stringify(PROBE_TOKENS)}) out[k] = rgba('var(--kp-' + k + ')');
  probe.style.color = '';
  probe.style.backgroundImage = 'var(--kp-tex)';
  out.tex = getComputedStyle(probe).backgroundImage;
  out.look = kp.dataset.look ?? null;
  out.page = rgba('var(--color-page)');
  out.deck = (() => { const c = getComputedStyle(kp).backgroundColor; const n = (c.match(/[\\d.]+/g) || []).map(Number); return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; })();
  probe.remove();
  return out;
})()`;

/** the hosted deck in every world: `{ rows, failures, ji: { rows, failures }, sheets }` — one row per
 * world and screen (`<world>·home`, `<world>·sitting`), the home measured without the stage and dock
 * rows (there is no sitting yet). `browser` is a Playwright Browser; `base` the served site's origin. */
export async function contrastByWorld({ base, browser, worlds = WORLDS, deck = 'mcd' }) {
  const rows = [];
  const failures = [];
  const ji = { rows: [], failures: [] };
  const sheets = [];
  for (const world of worlds) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    try {
      await context.addInitScript(`try { localStorage.setItem('kairo-theme', ${JSON.stringify(world)}); localStorage.setItem('bunki-cloze:prefs:v3:kotoba-${deck}', JSON.stringify({ ruleSeen: true, sittings: 3 })); } catch {}`);
      const page = await context.newPage();
      await page.goto(`${base}/index.html?deck=${deck}`, { waitUntil: 'load' });
      await page.waitForFunction('document.body.dataset.ready === "1"', null, { timeout: 30000 });
      await page.waitForSelector('#kp-start', { timeout: 15000 });
      const home = await page.evaluate(PROBE);
      await page.click('#kp-start');
      await page.waitForSelector('#kp-card', { timeout: 15000 });
      const sitting = await page.evaluate(PROBE);
      for (const [screen, probe, which] of [['home', home, HOME_ROWS], ['sitting', sitting, ROWS]]) {
        const name = `${world}·${screen}`;
        const missing = PROBE_TOKENS.filter((k) => !probe[k]);
        if (missing.length) { failures.push(`${name}: tokens unresolved: ${missing.join(' ')}`); continue; }
        const c = (k) => probe[k];
        const r = measureSheet(name, c, probe.tex, which);
        rows.push(r.row);
        failures.push(...r.failures);
        const j = kindJiRow(name, c, `rgb(${probe['kind-ji'].slice(0, 3).join(' ')})`);
        ji.rows.push(j.row);
        if (j.failure) ji.failures.push(j.failure);
        sheets.push({ name, night: NIGHT.has(world), look: probe.look, page: probe.page, deck: probe.deck, tex: probe.tex });
      }
    } finally {
      await context.close();
    }
  }
  return { rows, failures, ji, sheets, floors: FLOORS };
}

/* ---------------------------------------------------------------- the command line */
function printTable(rows, floors) {
  const cols = Object.keys(floors).filter((c) => rows.some((r) => c in r));
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`${pad('sheet', 20)}${cols.map((c) => pad(`${c} ≥${floors[c]}`, 20)).join('')}`);
  for (const r of rows) console.log(`${pad(r.look, 20)}${cols.map((c) => pad(c in r ? r[c].toFixed(2) : '—', 20)).join('')}`);
}
function printJi(ji) {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n字 hue (--kp-kind-ji): nearest other hue, ΔE_ok ≥ ${KIND_JI_FLOOR}`);
  for (const r of ji.rows) console.log(`${pad(r.look, 20)}${pad(r.value, 18)}on card ${pad(r.onCard.toFixed(2), 7)}nearest ${pad(r.nearest, 9)}ΔE ${r.deltaE.toFixed(1)}`);
}
async function serve(dir) {
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  return new Promise((ok, fail) => {
    const s = createServer((req, res) => {
      const p = decodeURIComponent((req.url ?? '/').split('?')[0]);
      const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
      const f = resolve(dir, rel);
      if (!f.startsWith(dir) || !existsSync(f)) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
      res.end(readFileSync(f));
    });
    s.once('error', fail);
    s.listen(0, '127.0.0.1', () => ok({ server: s, base: `http://127.0.0.1:${s.address().port}` }));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const staticJi = kindJiTable();
  const { rows, failures: low, floors } = contrastTable();
  const failures = [...low, ...staticJi.failures];
  console.log('the standalone sheet (player.css fallbacks: the default world by day)');
  printTable(rows, floors);
  printJi(staticJi);
  const site = process.env.KAIRO_SITE_DIR;
  if (site) {
    const { chromium } = await import('playwright-core');
    const { server, base } = await serve(resolve(site));
    const browser = await chromium.launch();
    try {
      const worlds = await contrastByWorld({ base, browser });
      console.log(`\nthe hosted deck in every world (${site})`);
      printTable(worlds.rows, floors);
      printJi(worlds.ji);
      for (const s of worlds.sheets) if (s.look !== null) worlds.failures.push(`${s.name}: the deck carries a look of its own (data-look=${s.look})`);
      for (const s of worlds.sheets) if (s.name.endsWith('·home') && s.page && s.deck.join() !== s.page.join()) worlds.failures.push(`${s.name}: the deck's ground ${s.deck.join()} is not the world's page ${s.page.join()}`);
      failures.push(...worlds.failures, ...worlds.ji.failures);
      const evidence = process.env.KAIRO_EVIDENCE_DIR;
      if (evidence) {
        const { mkdirSync, writeFileSync } = await import('node:fs');
        mkdirSync(evidence, { recursive: true });
        writeFileSync(join(evidence, 'contrast-by-world.json'), JSON.stringify({ site, rows: worlds.rows, ji: worlds.ji.rows, sheets: worlds.sheets, failures }, null, 2) + '\n');
      }
    } finally {
      await browser.close();
      server.close();
    }
  }
  console.log(failures.length ? `\n${failures.length} pair(s) under the floor:\n  ${failures.join('\n  ')}` : '\nevery pair clears its floor');
  process.exit(failures.length ? 1 : 0);
}
