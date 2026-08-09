/**
 * The census behind acceptance 4: how much of the Drift universe can the
 * corridor actually open?
 *
 * Walks every label the drift can put on screen — the seed words in the source's
 * own `const W`, every entry in `data/wbig.json`, the five N1 words the source
 * appends by hand, and all 82 SEM heads with all of their members — and asks the
 * two questions the study door asks: does `lookup()` find this word (dict, then
 * the legacy words pool), and does `D.kanji` carry this character.
 *
 * Usage: node census-drift-vs-corridor.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));

const kanji = read('prototypes/corridor/data/share_alike/kanji.json').kanji;
const dict = read('prototypes/corridor/data/share_alike/dict.json').words;
const words = read('prototypes/corridor/data/share_alike/words.json').words;
const wbig = read('prototypes/drift/data/wbig.json');
const src = readFileSync(resolve(ROOT, 'prototypes/drift/drift-artifact.html'), 'utf8');

const semStart = src.indexOf('const SEM={');
const SEM = JSON.parse(src.slice(semStart + 'const SEM='.length, src.indexOf('};', semStart) + 1));
const seedBlock = src.match(/const W=\[\n([\s\S]*?)\]\];/);
if (!seedBlock) throw new Error('could not find the drift source\'s `const W=[...]` seed list');
const seeds = [...seedBlock[1].matchAll(/\["([^"]+)","/g)].map((m) => m[1]);

const isKanji = (c) => /[一-鿿]/.test(c);
const labels = new Set([...seeds, ...wbig.map((e) => e[0]), '過酷', '試練', '逆境', '熾烈', '劣悪']);
for (const head of Object.keys(SEM)) {
  labels.add(head);
  for (const edge of SEM[head]) labels.add(edge[0]);
}
const chars = new Set();
for (const label of labels) for (const c of label) if (isKanji(c)) chars.add(c);

// this is exactly corridor.js lookup(): the full dictionary, then the legacy pool
const found = (w) => !!(dict[w] || words[w]);
const missingWords = [...labels].filter((w) => !found(w));
const missingKanji = [...chars].filter((c) => !kanji[c]);

console.log(
  `WORD labels reachable in drift: ${labels.size} | absent from corridor lookup(): ${missingWords.length}`,
);
if (missingWords.length) console.log(missingWords.slice(0, 60).join(' '));
console.log('');
console.log(
  `KANJI reachable in drift: ${chars.size} | absent from corridor D.kanji: ${missingKanji.length}`,
);
if (missingKanji.length) console.log(missingKanji.join(''));
