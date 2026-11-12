#!/usr/bin/env node
/** Fold the design layer's print look into the app's own code (PRINT-FOLD, 2026-11-12).
 *
 *   node scripts/fold-print-look.mjs <design folder>       the lead's folder, ~/.dharma/bunki/PROGRAM/design
 *
 * The design folder stays the source. Edit it, never the folded files, and run this again after each design release.
 * It writes into the checkout it belongs to, and is the successor of design/fold-depth.sh, which folded the first two
 * sheets only.
 *
 * READS (every one must exist and hold something, or nothing is written):
 *   <design folder>/depth/depth.css     the surface system
 *   <design folder>/depth/kanji.css     a character's page (a stub since 2026-11-10, folded as it stands)
 *   <design folder>/depth/lead.css      the lead's trials
 *   <design folder>/depth/print.css     the print look
 *   <design folder>/depth/art/<plate>   every plate the four sheets or prototypes/corridor/print-look.mjs name
 *   <design folder>/depth/version.txt   the design version, recorded in the folded sheet's head (may be absent)
 * WRITES:
 *   prototypes/corridor/depth.css       the four sheets in one, in the order the design layer attaches them (depth,
 *                                       kanji, lead, print), so the cascade is the preview's; blocks between
 *                                       "@no-fold-start" and "@no-fold-end" are left out (live trials only)
 *   prototypes/corridor/print/<plate>   each named plate, byte for byte; any other file in that folder is removed
 * Every plate address of the design layer (/design/depth/art/<plate>, served only by the preview) becomes print/<plate>,
 * relative to depth.css, so the app keeps its plates under any path it is served from.
 *
 * STOPS with exit 1 and writes nothing when: a source is missing or empty; a named plate is missing from depth/art;
 * an "@no-fold" mark is unpaired; the folded sheet still holds a /design/ address or names #chrome-dojo or #tray (the
 * bar controls the gate builder owns, as fold-depth.sh did). Warns, without stopping, about selectors that are not
 * scoped under html[data-live-depth='1'] (index.html sets that attribute; the convention is that every rule is).
 */
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORRIDOR = join(REPO, 'prototypes/corridor');
const OUT_SHEET = join(CORRIDOR, 'depth.css');
const OUT_PLATES = join(CORRIDOR, 'print');
const MODULE = join(CORRIDOR, 'print-look.mjs');
const SHEETS = ['depth/depth.css', 'depth/kanji.css', 'depth/lead.css', 'depth/print.css'];
const LIVE_ART = /\/design\/depth\/art\/([A-Za-z0-9_-]+\.webp)/g;
const MODULE_ART = /plate\('([A-Za-z0-9_-]+\.webp)'\)/g;
const SCOPE = "html[data-live-depth='1']";

const stop = (message) => {
  console.error(`[fold-print-look] STOP: ${message}. Nothing was written.`);
  process.exit(1);
};
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const tilde = (path) => (path.startsWith(homedir()) ? `~${path.slice(homedir().length)}` : path);

const arg = process.argv[2];
if (!arg || process.argv.length !== 3) {
  console.error('usage: node scripts/fold-print-look.mjs <design folder>');
  process.exit(2);
}
const DESIGN = resolve(arg);
if (!existsSync(join(DESIGN, 'depth'))) stop(`${DESIGN} has no depth/ folder`);

/** The text between "@no-fold-start" and "@no-fold-end" stays out, the marks' own lines included, as fold-depth.sh. */
function withoutNoFold(name, text) {
  const out = [];
  let skip = false;
  for (const line of text.split('\n')) {
    const starts = line.includes('@no-fold-start');
    const ends = line.includes('@no-fold-end');
    if (starts && skip) stop(`${name}: "@no-fold-start" inside an open block`);
    if (ends && !skip && !starts) stop(`${name}: "@no-fold-end" without its start`);
    if (starts) skip = true;
    if (!skip) out.push(line);
    if (ends) skip = false;
  }
  if (skip) stop(`${name}: "@no-fold-start" never ends`);
  return out.join('\n');
}

const sources = SHEETS.map((name) => {
  const path = join(DESIGN, name);
  if (!existsSync(path) || !statSync(path).isFile()) stop(`missing ${tilde(path)}`);
  const bytes = readFileSync(path);
  if (!bytes.length || !bytes.toString('utf8').trim()) stop(`empty ${tilde(path)}`);
  return { name, bytes, text: withoutNoFold(name, bytes.toString('utf8')) };
});
const versionFile = join(DESIGN, 'depth/version.txt');
const version = existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : 'unknown';

// the plates: whatever the sheets name, and whatever the module names (it reads three of them itself)
if (!existsSync(MODULE)) stop(`missing ${MODULE}`);
const named = new Set();
for (const { text } of sources) for (const m of text.matchAll(LIVE_ART)) named.add(m[1]);
for (const m of readFileSync(MODULE, 'utf8').matchAll(MODULE_ART)) named.add(m[1]);
const plates = [...named].sort().map((file) => {
  const path = join(DESIGN, 'depth/art', file);
  if (!existsSync(path) || !statSync(path).isFile() || !statSync(path).size)
    stop(`the plate ${file} is named but ${tilde(path)} is missing or empty`);
  const bytes = readFileSync(path);
  return { file, path, bytes: bytes.length, sha256: sha(bytes) };
});

const head = [
  "/* depth.css · the app's surfaces (ground, sheet, slip, well, the night windows) and its print look.",
  `   FOLDED FILE. Do not edit here. Folded by scripts/fold-print-look.mjs from the design folder ${tilde(DESIGN)}`,
  `   (design version ${version}), in the order the design layer attaches them, @no-fold blocks left out:`,
  ...sources.map(({ name, bytes }) => `     ${name.padEnd(16)} sha256 ${sha(bytes).slice(0, 16)}`),
  '   Plates: the design layer names them under the preview server; here they are print/<plate>, beside this file.',
  `   Every rule is meant to be scoped under ${SCOPE}; index.html sets that attribute.`,
  "   The two values the print look reads from the page come from print-look.mjs (an article's pigments, the old",
  "   first screen's word inks). */",
  '',
].join('\n');
const body = sources
  .map(
    ({ name, text }) =>
      `/* ==== ${name} ==== */\n\n${text.replace(LIVE_ART, 'print/$1').trimEnd()}\n`,
  )
  .join('\n');
const sheet = `${head}\n${body}`;

if (sheet.includes('/design/')) {
  const line = sheet.split('\n').findIndex((l) => l.includes('/design/')) + 1;
  stop(`the folded sheet still holds a /design/ address (line ${line})`);
}
if (/chrome-dojo|#tray\b/.test(sheet)) stop('the folded sheet still names #chrome-dojo or #tray');

// selectors not under the scope: each selector of a rule's list (commas inside :is() and the like do not split it)
const selectors = (prelude) => {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    const c = prelude[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(prelude.slice(from, i));
      from = i + 1;
    }
  }
  out.push(prelude.slice(from));
  return out.map((s) => s.trim()).filter(Boolean);
};
const unscoped = [];
const bare = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
for (const m of bare.matchAll(/(^|[{};])\s*([^{};@\s][^{};]*)\{/g)) {
  for (const selector of selectors(m[2])) {
    if (/^(from|to|[\d.]+%)$/.test(selector)) continue; // a keyframe
    if (!selector.startsWith(SCOPE)) unscoped.push(selector.replace(/\s+/g, ' ').slice(0, 100));
  }
}

// all checked: write
writeFileSync(OUT_SHEET, sheet);
mkdirSync(OUT_PLATES, { recursive: true });
const keep = new Set(plates.map(({ file }) => file));
const removed = [];
for (const file of readdirSync(OUT_PLATES)) {
  if (keep.has(file)) continue;
  rmSync(join(OUT_PLATES, file), { recursive: true, force: true });
  removed.push(file);
}
for (const { file, path, sha256 } of plates) {
  copyFileSync(path, join(OUT_PLATES, file));
  if (sha(readFileSync(join(OUT_PLATES, file))) !== sha256) stop(`the copy of ${file} differs`);
}

const scoped = (sheet.match(/html\[data-live-depth='1'\]/g) || []).length;
console.log(
  `[fold-print-look] wrote prototypes/corridor/depth.css: ${sheet.split('\n').length} lines, ${scoped} scoped selectors, design version ${version}`,
);
for (const { file, bytes, sha256 } of plates)
  console.log(
    `[fold-print-look] plate print/${file}  ${bytes} bytes  sha256 ${sha256.slice(0, 16)}`,
  );
if (removed.length) console.log(`[fold-print-look] removed from print/: ${removed.join(', ')}`);
const unused = readdirSync(join(DESIGN, 'depth/art')).filter(
  (file) => file.endsWith('.webp') && !keep.has(file),
);
if (unused.length)
  console.log(`[fold-print-look] not folded (named by nothing): ${unused.sort().join(', ')}`);
if (unscoped.length) {
  console.log(`[fold-print-look] WARNING: ${unscoped.length} rule(s) not scoped under ${SCOPE}:`);
  for (const prelude of unscoped) console.log(`  ${prelude}`);
}
