/**
 * VERIFIER'S OWN CENSUS. Independent of the implementer's script:
 * every word/kanji label is taken from the DRIFT SOURCE ITSELF (the arrays the
 * shipped file actually evaluates), not from a side json that might have drifted
 * from it, and answered against the corridor's own data with corridor.js's
 * lookup() semantics.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = '/home/user/Bunki-app/.claude/worktrees/agent-ad7f93b302aff2b7c';
const read = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const src = readFileSync(resolve(ROOT, 'prototypes/drift/drift-artifact.html'), 'utf8');

const kanji = read('prototypes/corridor/data/share_alike/kanji.json').kanji;
const dict = read('prototypes/corridor/data/share_alike/dict.json').words;
const words = read('prototypes/corridor/data/share_alike/words.json').words;

// --- pull the arrays out of the shipped file by evaluating its own literals ---
function literalAfter(name) {
  const i = src.indexOf(`const ${name}=[`);
  if (i < 0) throw new Error(`no const ${name}=[ in the drift source`);
  let d = 0, j = src.indexOf('[', i);
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '[') d++;
    else if (src[j] === ']') { d--; if (d === 0) break; }
  }
  return JSON.parse(src.slice(start, j + 1));
}
function objectAfter(name) {
  const i = src.indexOf(`const ${name}={`);
  if (i < 0) throw new Error(`no const ${name}={ in the drift source`);
  let d = 0, j = src.indexOf('{', i);
  const start = j;
  for (; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) break; }
  }
  return JSON.parse(src.slice(start, j + 1));
}

const W = literalAfter('W');
const WBIG = literalAfter('WBIG');
const SEM = objectAfter('SEM');

// cross-check the side json the implementer's census used against the file
let wbigJson = null;
try { wbigJson = read('prototypes/drift/data/wbig.json'); } catch { /* absent */ }
if (wbigJson) {
  const a = JSON.stringify(WBIG.map((e) => e[0]));
  const b = JSON.stringify(wbigJson.map((e) => e[0]));
  console.log(`wbig.json vs the shipped inline WBIG: ${a === b ? 'IDENTICAL label lists' : 'DIFFER'} (${WBIG.length} inline / ${wbigJson.length} json)`);
}

// every other quoted CJK label the source hands to the field, whatever its array
const extra = new Set();
for (const m of src.matchAll(/"([぀-ヿ一-鿿][^"]{0,11})"/g)) extra.add(m[1]);

const labels = new Set();
for (const e of W) labels.add(e[0]);
for (const e of WBIG) labels.add(e[0]);
for (const head of Object.keys(SEM)) { labels.add(head); for (const edge of SEM[head]) labels.add(edge[0]); }
// the five hand-appended N1 words
for (const w of ['過酷', '試練', '逆境', '熾烈', '劣悪']) labels.add(w);

const isKanji = (c) => /[一-鿿]/.test(c);
const chars = new Set();
for (const l of labels) for (const c of l) if (isKanji(c)) chars.add(c);

const lookup = (w) => !!(dict[w] || words[w]);
const missW = [...labels].filter((w) => !lookup(w));
const missK = [...chars].filter((c) => !kanji[c]);

console.log(`\nVERIFIER CENSUS (labels read from drift-artifact.html itself)`);
console.log(`  W seeds ${W.length} · WBIG ${WBIG.length} · SEM heads ${Object.keys(SEM).length}`);
console.log(`  WORD labels: ${labels.size} | absent from corridor lookup(): ${missW.length}${missW.length ? ' -> ' + missW.slice(0, 40).join(' ') : ''}`);
console.log(`  KANJI:       ${chars.size} | absent from corridor D.kanji: ${missK.length}${missK.length ? ' -> ' + missK.join('') : ''}`);

// widest possible net: every CJK-ish quoted string anywhere in the file
const wideMiss = [...extra].filter((w) => !lookup(w));
console.log(`\n  (widest net: ${extra.size} quoted CJK strings anywhere in the source, ${wideMiss.length} not in lookup() — most are UI copy, listed for eyeballing)`);
console.log('  ' + wideMiss.slice(0, 80).join(' '));
