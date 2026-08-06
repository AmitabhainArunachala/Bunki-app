// Generate the app's Drift lexical tier from the prototype's data
// (BUNKI_ONE_APP_CONVERGENCE_SPEC_2026-08-06.md §1).
//
//   src/data/generated/drift-words.json  <- prototypes/drift/data/wbig.json
//   src/data/generated/drift-kanji.json  <- prototypes/drift/data/radk.json
//
// Run from the repo root or apps/app:  node apps/app/scripts/generate-drift-lexicon.mjs
// The outputs are committed; this script is how they change, so a diff on the
// generated files always has a diff here or in the prototype data explaining it.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SRC = path.join(REPO, 'prototypes', 'drift', 'data');
const OUT = path.join(HERE, '..', 'src', 'data', 'generated');

const wbig = JSON.parse(fs.readFileSync(path.join(SRC, 'wbig.json'), 'utf8'));
const radk = JSON.parse(fs.readFileSync(path.join(SRC, 'radk.json'), 'utf8'));

// Words the Drift prototype adds beyond the JLPT lists (its EXTRA set).
const EXTRA = [
  ['過酷', 'かこく', 'harsh, severe, punishing', 1],
  ['試練', 'しれん', 'trial; ordeal', 1],
  ['逆境', 'ぎゃっきょう', 'adversity', 1],
  ['熾烈', 'しれつ', 'fierce; cutthroat', 1],
  ['劣悪', 'れつあく', 'inferior; wretched', 1],
];

const seen = new Set();
const words = [];
for (const [headword, reading, gloss, level] of [...wbig, ...EXTRA]) {
  if (seen.has(headword)) continue; // first entry wins, matching Drift
  seen.add(headword);
  words.push([headword, reading, gloss, level]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'drift-words.json'), JSON.stringify(words));
fs.writeFileSync(
  path.join(OUT, 'drift-kanji.json'),
  JSON.stringify({ KINFO: radk.KINFO, KRAD: radk.KRAD }),
);

process.stdout.write(
  `drift-words.json: ${words.length} words | drift-kanji.json: ` +
    `${Object.keys(radk.KINFO).length} KINFO, ${Object.keys(radk.KRAD).length} KRAD\n`,
);
