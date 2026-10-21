import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classEvidence, readingSenseProofs, exactExpressionSpan } from './vh-visual-contracts.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const index = read('data/share_alike/dict-v2/index.json').entries;
const core = read('data/share_alike/dict.json').words;
const legacy = read('data/share_alike/words.json').words;
const k2h = value => String(value || '').replace(/[ァ-ヶ]/gu, char => String.fromCharCode(char.charCodeAt(0) - 0x60));
const bySeq = new Map(index.map(row => [String(row[0]), row]));
const shards = new Map();
function detailOf(seq) {
  let hash = 0x811c9dc5;
  for (const char of String(seq)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 0x01000193) >>> 0; }
  const shard = (hash & 15).toString(16).padStart(2, '0');
  if (!shards.has(shard)) shards.set(shard, new Map(read(`data/share_alike/dict-v2/${shard}.json`).entries.map(row => [String(row[0]), row])));
  return shards.get(shard).get(String(seq));
}
// Execute the actual browser verifier's pure resolver, without importing its
// top-level browser runner. This catches a helper that is tested but not wired.
const verifier = readFileSync(new URL('./verify-reading-truth.mjs', import.meta.url), 'utf8');
const start = verifier.indexOf('function meaningEntry('), end = verifier.indexOf('// N2 ·', start);
assert(start >= 0 && end > start, 'actual meaningEntry source boundary must exist');
const source = verifier.slice(start, end);
const readAs = (form, reading) => index.filter(row => [row[1], ...row[4], ...row[5]].includes(form)
  && row[5].some((kana, k) => k2h(kana) === k2h(reading) && (kana === form || (row[4].includes(form)
    && (row[11][k] === 0 || (Array.isArray(row[11][k]) && row[11][k].includes(row[4].indexOf(form))))))));
const resolver = (lookup = detailOf) => new Function('readAs', 'detailOf', 'core', 'legacyWords', 'readingSenseProofs', 'k2h',
  `${source}\nreturn meaningEntry;`)(readAs, lookup, core, legacy, readingSenseProofs, k2h);
const meaningEntry = resolver();

// Each native representative has its own positive, negative, and restored
// control. Expected proof identities come from the retained attempt-1 evidence.
const cases = [
  { article: 'bunki-read-n2-shosoin-names', file: 'bunki-read-n2-shosoin-names.json', at: 150,
    s: 'のぼり', form: 'のぼる', reading: 'のぼる', gloss: 'to ascend', seq: '1352570', pos: ['v5r', 'vi'], negative: 'wrong-reading' },
  { article: 'bunki-read-n2-grit-checked', file: 'bunki-read-n2-grit-checked.json', at: 489,
    s: 'やめ', form: 'やめる', reading: 'やめる', gloss: 'to stop (an activity)', seq: '1310680', pos: ['v1', 'vt'], negative: 'wrong-gloss' },
  { article: 'aozora:000628', file: 'aozora-000628.json', at: 1345,
    s: 'はじめ', form: 'はじめる', reading: 'はじめる', gloss: 'to start', seq: '1307550', pos: ['v1', 'vt'], negative: 'reading-restriction' },
  { article: 'aozora:046605', file: 'aozora-046605.json', at: 183,
    s: 'のぼっ', form: 'のぼる', reading: 'のぼる', gloss: 'to ascend', seq: '1352570', pos: ['v5r', 'vi'], negative: 'restricted-written-form' },
  { article: 'aozora:046605', file: 'aozora-046605.json', at: 435,
    s: 'のぼり', form: 'のぼる', reading: 'のぼる', gloss: 'to ascend', seq: '1352570', pos: ['v5r', 'vi'], negative: 'homograph-pos' },
  { article: 'bunki-graded-n3-thanks-before-help', file: 'bunki-graded-n3-thanks-before-help.json', at: 272,
    s: 'やめよう', form: 'やめる', reading: 'やめる', gloss: 'to stop (an activity)', seq: '1310680', pos: ['v1', 'vt'], negative: 'missing-pos' },
];
for (const row of cases) test(`kana ${row.article}#${row.at}: exact proof / ${row.negative} / restored`, () => {
  const token = read(`data/articles/${row.file}`).tokens[row.at];
  assert.equal(token.s, row.s); assert.equal(token.b, row.form); assert.equal(token.p, '動詞');
  const positive = () => {
    const entry = meaningEntry(row.form, row.reading, row.gloss);
    assert.deepEqual(entry.proofs, [{ seq: row.seq, form: row.form, reading: row.reading,
      senseIndex: 0, gloss: row.gloss, pos: row.pos }]);
    assert(classEvidence(token.p, entry).proved);
    return entry;
  };
  const original = positive();
  let mutant;
  if (row.negative === 'wrong-reading') mutant = meaningEntry(row.form, 'あがる', row.gloss);
  if (row.negative === 'wrong-gloss') mutant = meaningEntry(row.form, row.reading, 'to ascend');
  if (row.negative === 'restricted-written-form') mutant = meaningEntry('昇る', row.reading, row.gloss);
  if (row.negative === 'reading-restriction') {
    mutant = resolver(seq => {
      const detail = structuredClone(detailOf(seq));
      if (seq === row.seq) detail[3][0][2] = ['はずす'];
      return detail;
    })(row.form, row.reading, row.gloss);
  }
  if (row.negative === 'homograph-pos') mutant = { ...original, proofs: [...original.proofs,
    { ...original.proofs[0], seq: '9999999', pos: ['n'] }] };
  if (row.negative === 'missing-pos') mutant = { ...original, proofs: original.proofs.map(proof => ({ ...proof, pos: [] })) };
  assert.equal(classEvidence(token.p, mutant).proved, false, row.negative);
  positive();
});

const phraseTokens = read('data/articles/aozora-046605.json').tokens;
const phraseEntry = () => meaningEntry('間もなく', 'まもなく', 'soon');
const spanOf = (tokens = phraseTokens, at = 1524, form = '間もなく', reading = 'まもなく') => exactExpressionSpan(tokens, at, form, reading);
const phrasePasses = (span, entry = phraseEntry()) => classEvidence('形容詞', entry, true, span).proved;
test('expression aozora:046605#1524: exact span / changed も / restored', () => {
  assert.deepEqual(phraseTokens.slice(1522, 1525).map(token => token.s), ['間', 'も', 'なく']);
  assert.deepEqual(phraseEntry().proofs, [{ seq: '1215290', form: '間もなく', reading: 'まもなく',
    senseIndex: 0, gloss: 'soon', pos: ['adv'] }]);
  assert.deepEqual(spanOf(), { from: 1522, to: 1524, index: 1524, form: '間もなく', reading: 'まもなく' });
  assert(phrasePasses(spanOf()));
  const mutant = structuredClone(phraseTokens); mutant[1523].s = 'が';
  // Reading remains identical: a spelling OR reading check would wrongly pass.
  assert.equal(spanOf(mutant), null); assert.equal(phrasePasses(spanOf(mutant)), false);
  assert(phrasePasses(spanOf()));
});
test('expression requires both readings and spelling, an internal tap, and real multi-token boundaries', () => {
  const wrongReading = structuredClone(phraseTokens); wrongReading[1522].r = 'あいだ';
  assert.equal(spanOf(wrongReading), null);
  const noReading = structuredClone(phraseTokens); delete noReading[1522].r;
  assert.equal(spanOf(noReading), null);
  assert.equal(spanOf(phraseTokens, 1528), null);
  assert.equal(exactExpressionSpan([{ s: '間もなく', r: 'まもなく' }], 0, '間もなく', 'まもなく'), null);
  assert.equal(exactExpressionSpan([{ s: '間', r: 'ま' }, { s: '。', r: '。' }, { s: 'なく', r: 'なく' }], 2, '間。なく', 'ま。なく'), null);
  for (const at of [-1, 1524.5, phraseTokens.length]) assert.equal(spanOf(phraseTokens, at), null);
  for (const bad of [null, true, { ...spanOf(), index: 1528 }, { ...spanOf(), from: 1524 }, { ...spanOf(), from: -1 }]) {
    assert.equal(phrasePasses(bad), false);
  }
});
test('expression never substitutes for exact sense/POS/identity evidence', () => {
  assert.equal(classEvidence('形容詞', phraseEntry(), true).proved, false, 'legacy expression boolean alone cannot bless adv');
  for (const change of [{ pos: [] }, { pos: ['n'] }, { form: '別の語' }, { reading: 'べつのご' }]) {
    const entry = { ...phraseEntry(), proofs: phraseEntry().proofs.map(proof => ({ ...proof, ...change })) };
    assert.equal(phrasePasses(spanOf(), entry), false);
  }
  assert.equal(phrasePasses(spanOf(), { ...phraseEntry(), proofs: [] }), false);
  assert.equal(phrasePasses(spanOf(), { ...phraseEntry(), proofs: [...phraseEntry().proofs,
    { ...phraseEntry().proofs[0], seq: '9999999', pos: ['n'] }] }), false);
  assert(phrasePasses(spanOf()));
});
test('sense applicability keeps entry, reading, written-form and exact-gloss restrictions', () => {
  const row = bySeq.get('1352570'), detail = detailOf('1352570');
  const args = ['のぼる', 'のぼる', 'to ascend'];
  assert(readingSenseProofs(row, detail, ...args).length);
  assert.deepEqual(readingSenseProofs({ ...row, 0: '9999999' }, detail, ...args), []);
  assert.deepEqual(readingSenseProofs(row, detail, 'のぼります', 'のぼる', 'to ascend'), []);
  assert.deepEqual(readingSenseProofs(row, detail, '昇る', 'のぼる', 'to ascend'), []);
  const restricted = structuredClone(row); restricted[11] = [1];
  assert.deepEqual(readingSenseProofs(restricted, detail, '上る', 'のぼる', 'to ascend'), []);
  assert(readingSenseProofs(restricted, detail, ...args).length, 'kana-only reading scope still permits that kana display');
  const changed = structuredClone(detail); changed[3][0][2] = ['あがる'];
  assert.deepEqual(readingSenseProofs(row, changed, ...args), []);
  assert.deepEqual(readingSenseProofs(row, detail, 'のぼる', 'のぼる', 'invented meaning'), []);
  assert(readingSenseProofs(row, detail, ...args).length);
});
test('the two data gaps remain unproved; quick prose POS cannot create dictionary evidence', () => {
  for (const [form, reading, gloss] of [['仕上がる', 'しあがる', 'to be finished'], ['違える', 'ちがえる', 'to change']]) {
    assert.equal(readAs(form, reading).length, 0);
    const entry = meaningEntry(form, reading, gloss);
    assert(entry); assert.deepEqual(entry.proofs, []);
    const verdict = classEvidence('動詞', { ...entry, p: 'verb', pos: ['v1'] });
    assert(verdict.unknown && !verdict.proved);
  }
});
