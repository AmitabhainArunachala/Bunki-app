/**
 * Re-pin data/help-relevance-catalog.json to the shipped sources it names, and point corridor.js at the result.
 *
 * The catalog pins four source files by sha256 and carries sourceVersion = sha256 of the canonical JSON of
 * { pins, pairs } (W3's derivation, checked byte for byte by srs-hooks-r8-cases I1); corridor.js admits exactly
 * `${policy}:${sourceVersion}` as HELP_RELEVANCE_POLICY. When a pinned source changes, this tool recomputes both and
 * rewrites the two files; the pairs (the evidence) are never touched. Run it, then verify-srs-hooks.
 *
 * usage: node prototypes/corridor/tools/repin-help-relevance-catalog.mjs [--check]
 *   --check  exit 1 (writing nothing) when the catalog or corridor.js would change
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const CATALOG = resolve(REPO, 'prototypes/corridor/data/help-relevance-catalog.json');
const CORRIDOR = resolve(REPO, 'prototypes/corridor/corridor.js');
const check = process.argv.includes('--check');

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (v) => (Array.isArray(v) ? v.map(canonical)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v);

const before = readFileSync(CATALOG, 'utf8');
const catalog = JSON.parse(before);
const pins = catalog.pins.map((entry) => ({ path: entry.path, sha256: sha(readFileSync(resolve(REPO, entry.path))) }));
for (const [i, entry] of pins.entries()) {
  if (entry.sha256 !== catalog.pins[i].sha256) console.log(`re-pin ${entry.path}: ${catalog.pins[i].sha256.slice(0, 12)} → ${entry.sha256.slice(0, 12)}`);
}
const sourceVersion = sha(JSON.stringify(canonical({ pins, pairs: catalog.pairs })));
const after = JSON.stringify({ ...catalog, sourceVersion, pins }, null, 2) + '\n';

const corridorBefore = readFileSync(CORRIDOR, 'utf8');
const line = /const HELP_RELEVANCE_POLICY = '([^']+)';/u;
const policy = `${catalog.policy}:${sourceVersion}`;
if (!line.test(corridorBefore)) throw new Error('corridor.js has no HELP_RELEVANCE_POLICY line');
const corridorAfter = corridorBefore.replace(line, `const HELP_RELEVANCE_POLICY = '${policy}';`);

const changed = after !== before || corridorAfter !== corridorBefore;
if (!changed) {
  console.log(`pinned: ${policy}`);
  process.exit(0);
}
if (check) {
  console.error(`help-relevance catalog is stale; run ${process.argv[1].replace(`${REPO}/`, '')} (would set ${policy})`);
  process.exit(1);
}
writeFileSync(CATALOG, after);
writeFileSync(CORRIDOR, corridorAfter);
console.log(`sourceVersion ${catalog.sourceVersion.slice(0, 12)} → ${sourceVersion.slice(0, 12)}; corridor.js HELP_RELEVANCE_POLICY = ${policy}`);
