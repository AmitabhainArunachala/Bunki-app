/** L3B.0 corrective judge: band-window arithmetic, explicit dictionary resolution, kana title/count coherence,
 * and phase-aware situation labels. Negative controls mutate memory only and must name the unit or band.
 * Run from the repo root: node --test prototypes/corridor/tools/beginner-manifest.corrective.test.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { entryId } from '../contracts/identity/identity.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(corridor, '..', '..');
const draft = resolve(corridor, 'data/beginner/manifest-draft');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const clone = (value) => JSON.parse(JSON.stringify(value));
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hira = (text) => [...text].map((c) => c >= 'ァ' && c <= 'ヶ' ? String.fromCodePoint(c.codePointAt(0) - 0x60) : c).join('');

const manifest = readJson(resolve(draft, 'units.json'));
const schema = readJson(resolve(draft, 'unit.schema.json'));
const sequenceDoc = readFileSync(resolve(repo, 'docs/curriculum/BEGINNER-SEQUENCE.md'), 'utf8');
const indexRows = new Map(readJson(resolve(corridor, 'data/share_alike/dict-v2/index.json')).entries.map((row) => [row[0], row]));

function checkBandWindows(m, doc) {
  const windows = m.word_selection.rank_windows;
  assert.ok(Array.isArray(windows), 'band windows: rank_windows must be an array');
  const excludedRanks = new Set(m.word_selection.excluded_as_artifacts.map((row) => row.rank).filter(Number.isInteger));
  const summaries = [];
  for (let band = 1; band <= 5; band++) {
    const window = windows.find((row) => row.band === band);
    if (!window) throw new Error(`band ${band}: no declared rank window`);
    const { min_rank: min, max_rank: max } = window;
    const words = m.units.filter((unit) => unit.band === band).flatMap((unit) => unit.items);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) throw new Error(`band ${band}: invalid window ${min}–${max}`);
    for (const word of words) {
      if (word.rank < min || word.rank > max) throw new Error(`band ${band}: member ${word.id} has rank ${word.rank}, outside declared window ${min}–${max}`);
    }
    const excludedInWindow = [...excludedRanks].filter((rank) => rank >= min && rank <= max).length;
    const capacity = max - min + 1 - excludedInWindow;
    if (capacity < words.length) throw new Error(`band ${band}: window ${min}–${max} has ${capacity} non-excluded positions for ${words.length} members`);
    const actualMin = Math.min(...words.map((word) => word.rank));
    const actualMax = Math.max(...words.map((word) => word.rank));
    if (min !== actualMin || max !== actualMax) throw new Error(`band ${band}: declared window ${min}–${max}, actual member min–max ${actualMin}–${actualMax}`);
    const slots = `${(band - 1) * m.word_selection.band_slots + 1}–${band * m.word_selection.band_slots}`;
    if (!doc.includes(`| ${band} | ${slots} | ${min}–${max} |`)) throw new Error(`band ${band}: sequence document does not declare slots ${slots}, ranks ${min}–${max}`);
    summaries.push(`b${band}=${min}–${max} (${capacity} positions/${words.length} words)`);
  }
  return summaries;
}

function checkResolution(m, rows) {
  const source = m.frequency_source;
  const requiredSource = `jmdict-simplified ${source.dictionary_index.pin}`;
  const requiredZip = source.full_jmdict_for_missing_at_base.zip_sha256_pin;
  let dictV2 = 0;
  let pinnedJmdict = 0;
  const check = (word, where) => {
    if (word.id !== entryId({ seq: word.seq, spelling: word.spelling, reading: word.reading })) throw new Error(`resolution: ${where} word ${word.id} is not its G9 entryId`);
    const row = rows.get(word.seq);
    const inDictV2 = word.kind === 'word' ? word.in_dict_v2 : word.materials.dict_v2_entry;
    if (row) {
      if (row[1] !== word.spelling || hira(row[2]) !== hira(word.reading)) throw new Error(`resolution: ${where} word ${word.id} does not resolve to dict-v2 head+reading ${row[1]}|${row[2]}`);
      if (inDictV2 !== true || word.missing_at_base !== false) throw new Error(`resolution: ${where} word ${word.id} has incorrect dict-v2 flags`);
      dictV2++;
      return;
    }
    if (typeof word.resolved_via !== 'string' || !word.resolved_via.includes(requiredSource) || !word.resolved_via.includes(requiredZip)) {
      throw new Error(`resolution: ${where} word ${word.id} has an unresolvable entryId and no resolved_via naming the pinned JMdict source`);
    }
    if (inDictV2 !== false || word.missing_at_base !== true) throw new Error(`resolution: ${where} word ${word.id} uses resolved_via without missing-at-base flags`);
    pinnedJmdict++;
  };
  for (const unit of m.units) for (const word of unit.items.filter((item) => item.kind === 'word')) check(word, `unit ${unit.id}`);
  for (const word of m.words_next_500) check(word, `words_next_500 position ${word.position}`);
  return { dictV2, pinnedJmdict };
}

const numberSpellings = new Set(['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '百', '千', '万']);
function expectedKanaTitle(unit) {
  const count = (type) => unit.items.filter((item) => item.type === type).length;
  if (unit.order === 1) return `Hiragana: ${count('basic')} basic signs, including the five vowels`;
  if (unit.order === 2) return `Hiragana: ${count('dakuten') + count('handakuten')} marked signs, ${count('yoon')} combinations and small っ`;
  if (unit.order === 3) return `Katakana: ${count('basic')} basic signs`;
  if (unit.order === 4) {
    const specials = new Set(unit.items.filter((item) => item.type === 'special').map((item) => item.kana));
    if (specials.size !== 2 || !specials.has('ッ') || !specials.has('ー')) throw new Error(`kana title/count: unit ${unit.id} must contain small ッ and ー in its own item list`);
    return `Katakana: ${count('dakuten') + count('handakuten')} marked signs, ${count('yoon')} combinations, small ッ, ー and ${count('loanword')} loanword sounds`;
  }
  if (unit.order === 5) {
    const numbers = unit.items.filter((item) => numberSpellings.has(item.spelling)).length;
    const yesNo = unit.items.filter((item) => ['はい', 'いいえ'].includes(item.spelling)).length;
    return `Sound and script in ${unit.items.length} first words: ${numbers} numbers, はい・いいえ, and ${unit.items.length - numbers - yesNo} length-and-pitch words`;
  }
  throw new Error(`kana title/count: unit ${unit.id} has no composition rule`);
}

function checkKanaTitles(m, doc) {
  const summaries = [];
  for (const unit of m.units.filter((item) => item.phase === 'kana-and-sound')) {
    const expected = expectedKanaTitle(unit);
    if (unit.title.en !== expected) throw new Error(`kana title/count: unit ${unit.id} has ${unit.items.length} items; expected title ${JSON.stringify(expected)}, got ${JSON.stringify(unit.title.en)}`);
    if (!doc.includes(`\`${unit.id}\` | ${unit.title.en} | ${unit.items.length} |`)) throw new Error(`kana title/count: unit ${unit.id} title or ${unit.items.length}-item count differs in the sequence document`);
    summaries.push(`u${unit.order}=${unit.items.length}`);
  }
  return summaries;
}

function situationRules(unitSchema) {
  return new Map(unitSchema.oneOf.map((branch) => {
    const situation = branch.properties.situation;
    return [branch.properties.phase.const, new Set(situation.const ? [situation.const] : situation.enum)];
  }));
}

function checkSituations(m, unitSchema) {
  const rules = situationRules(unitSchema);
  assert.deepEqual([...rules.keys()], m.phase_order, 'phase-aware situation rules cover each phase in order');
  assert.equal(Object.keys(m.word_selection.situations).length, 27, 'word situation taxonomy remains at 27 labels');
  for (const unit of m.units) {
    const allowed = rules.get(unit.phase);
    if (!allowed) throw new Error(`situation: unit ${unit.id} has undeclared phase ${unit.phase}`);
    if (!allowed.has(unit.situation)) throw new Error(`situation: unit ${unit.id} has undeclared situation ${unit.situation} for phase ${unit.phase}`);
    if (unit.phase === 'situation-words') {
      for (const word of unit.items) if (!m.word_selection.situations[word.situation]) throw new Error(`situation: unit ${unit.id} word ${word.id} has undeclared word situation ${word.situation}`);
    }
  }
}

test('C1 every band window contains its members and has enough non-excluded positions; docs agree', (t) => {
  const summaries = checkBandWindows(manifest, sequenceDoc);
  t.diagnostic(summaries.join('; '));
});

test('C2 every word entryId resolves to dict-v2 head+reading or names the pinned full JMdict', (t) => {
  for (const text of [manifest.word_selection.rule, sequenceDoc]) {
    for (const required of ['excluded_as_artifacts', 'dict-v2', 'resolved_via', 'words_next_500']) assert.ok(text.includes(required), `slot-filling rule states ${required}`);
  }
  const result = checkResolution(manifest, indexRows);
  assert.equal(result.pinnedJmdict, 2, 'both missing-at-base words carry explicit pinned-JMdict provenance');
  t.diagnostic(`dict-v2 head+reading: ${result.dictV2}; pinned full JMdict: ${result.pinnedJmdict}`);
});

test('C3 every kana-unit title is generated from and coherent with its own item list', (t) => {
  t.diagnostic(checkKanaTitles(manifest, sequenceDoc).join('; '));
});

test('C4 phase-aware situation sets cover kana, survival, situation-word and reading units', () => {
  checkSituations(manifest, schema.$defs.unit);
  assert.match(sequenceDoc, /G9 kana-id extension \(draft decision\)/, 'kana-id G9 extension decision is recorded');
  assert.ok(sequenceDoc.includes('`kana:<sign>`'), 'the decision names the kana id form');
});

test('negative control: a band window shrunk below its members goes red naming the band', () => {
  const mutant = clone(manifest);
  const window = mutant.word_selection.rank_windows.find((row) => row.band === 2);
  window.max_rank--;
  assert.throws(() => checkBandWindows(mutant, sequenceDoc), /band 2: member .* rank 205, outside declared window 102–204/);
});

test('negative control: an unresolvable word entryId without resolved_via goes red naming the unit', () => {
  const mutant = clone(manifest);
  const unit = mutant.units.find((item) => item.phase === 'situation-words');
  const word = unit.items[0];
  word.seq = '9999999';
  word.id = `entry:9999999:${word.spelling}|${word.reading}`;
  word.in_dict_v2 = false;
  word.missing_at_base = false;
  delete word.resolved_via;
  assert.throws(() => checkResolution(mutant, indexRows), new RegExp(`unit ${escapeRegExp(unit.id)} word entry:9999999:.*unresolvable entryId and no resolved_via`));
});

test('negative control: kana unit 4 with a mismatched count goes red naming the unit', () => {
  const mutant = clone(manifest);
  const unit = mutant.units.find((item) => item.id === 'unit:beginner:kana:04-katakana-marks-and-loanword-sounds');
  unit.title.en = unit.title.en.replace('17 loanword sounds', '16 loanword sounds');
  assert.throws(() => checkKanaTitles(mutant, sequenceDoc), /unit:beginner:kana:04-katakana-marks-and-loanword-sounds has 77 items; expected title .*17 loanword sounds.*got .*16 loanword sounds/);
});

test('negative control: a kana unit with an undeclared situation goes red naming the unit', () => {
  const mutant = clone(manifest);
  const unit = mutant.units.find((item) => item.phase === 'kana-and-sound');
  unit.situation = 'food-and-drink';
  assert.throws(() => checkSituations(mutant, schema.$defs.unit), new RegExp(`unit ${escapeRegExp(unit.id)} has undeclared situation food-and-drink for phase kana-and-sound`));
});
