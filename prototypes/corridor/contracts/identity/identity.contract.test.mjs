/** G9 judge: typed identity for entries, readings, senses, tasks and component occurrences.
 * Pinned by the contract (campaign/contracts/G9.json); the worker implements ./identity.mjs so that every
 * fixture below passes, and may not edit this file. The negative-control block runs the same gap fixtures
 * against the base's wordIdentity/itemIdentity (prototypes/corridor/srs-core.mjs) and requires them to FAIL
 * there, so a fixture can never claim a gap the base lacks. Authored by the Bunki lead 2026-11-05 from the
 * contract's six assertions; TESTS_SOUND review recorded in campaign/judges-reviews/G9-TESTS_SOUND.md. */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { wordIdentity, itemIdentity } from '../../srs-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DICT = join(HERE, '..', '..', 'data', 'share_alike', 'dict-v2');
const PROVENANCE = { dataset: 'JMdict (dict-v2 share_alike pool)', version: '3.6.2+20260803141815', licence: 'CC BY-SA 4.0' };

/** every (spelling, reading) pair in dict-v2 with its JMdict seqs; `findSeqs` for one pair, `findHomograph` for the
 * lexicographically first pair that two or more seqs share (the fixture is chosen by the data, never by the worker) */
let PAIRS = null;
function pairs() {
  if (PAIRS) return PAIRS;
  PAIRS = new Map();
  for (const name of readdirSync(DICT).filter((n) => /^\d\d\.json$/u.test(n)).sort()) {
    const shard = JSON.parse(readFileSync(join(DICT, name), 'utf8'));
    for (const entry of shard.entries) {
      const [seq, kanjiForms, kanaForms] = entry;
      for (const k of kanjiForms || []) for (const r of kanaForms || []) {
        const key = `${k[0]}|${r[0]}`;
        if (!PAIRS.has(key)) PAIRS.set(key, new Set());
        PAIRS.get(key).add(String(seq));
      }
    }
  }
  return PAIRS;
}
function findSeqs(spelling, reading) { return [...(pairs().get(`${spelling}|${reading}`) || [])].sort(); }
function findHomograph() {
  const hit = [...pairs().entries()].filter(([, seqs]) => seqs.size >= 2).map(([key, seqs]) => [key, [...seqs].sort()])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];
  assert.ok(hit, 'fixture: dict-v2 holds no spelling+reading pair under two seqs');
  const [spelling, reading] = hit[0].split('|');
  return { spelling, reading, seqs: hit[1] };
}

// ---- the fixtures: each takes an implementation and throws on failure ------------------------------------
const fixtures = {
  /** [0] already true at the base: 生 keeps its five readings apart, each relation carrying provenance */
  regression(impl) {
    const kanji = impl.kanjiId('生');
    const readings = ['せい', 'しょう', 'なま', 'い(きる)', 'う(まれる)'];
    const ids = readings.map((reading) => impl.readingId({ kanji: '生', reading }));
    assert.equal(new Set(ids).size, 5, 'five distinct reading ids');
    readings.forEach((reading, i) => {
      const entry = impl.entryId({ seq: `fixture-生-${i}`, spelling: '生', reading });
      const rel = impl.relate({ reading: ids[i], kanji, entry, provenance: PROVENANCE });
      assert.equal(rel.kanji, kanji); assert.equal(rel.reading, ids[i]); assert.equal(rel.entry, entry);
      for (const k of ['dataset', 'version', 'licence']) assert.ok(rel.provenance && rel.provenance[k], `provenance.${k}`);
    });
    assert.throws(() => impl.relate({ reading: ids[0], kanji, entry: 'x', provenance: { dataset: 'JMdict' } }), /provenance/u, 'a relation without full provenance is refused');
  },
  /** [1] real gap 1: the same spelling and reading under two JMdict seqs are two entries (the pair comes from dict-v2 itself; 本/ほん has one seq there) */
  homograph(impl) {
    const { spelling, reading, seqs } = findHomograph();
    const ids = seqs.slice(0, 2).map((seq) => impl.entryId({ seq, spelling, reading }));
    assert.notEqual(ids[0], ids[1], `${spelling}/${reading} under seqs ${seqs[0]} and ${seqs[1]} must give two entry ids`);
    assert.equal(impl.entryId({ seq: seqs[0], spelling, reading }), ids[0], 'entry ids are stable');
    assert.throws(() => impl.entryId({ spelling, reading }), /seq/u, 'an entry id needs its seq');
  },
  /** [2] real gap 2: senses are distinct under one entry; a study task is keyed by (entry, reading, sense, modality) */
  senses(impl) {
    const entry = impl.entryId({ seq: '1522150', spelling: '本', reading: 'ほん' });
    const reading = impl.readingId({ kanji: '本', reading: 'ほん' });
    const [s1, s2] = [impl.senseId({ entry, index: 1 }), impl.senseId({ entry, index: 2 })];
    assert.notEqual(s1, s2, 'two sense ids under one entry');
    const t1 = impl.taskId({ entry, reading, sense: s1, modality: 'recognition' });
    const t2 = impl.taskId({ entry, reading, sense: s2, modality: 'recognition' });
    assert.notEqual(t1, t2, 'a scheduler keyed by the task id sees two tasks for two senses');
    assert.equal(impl.taskId({ entry, reading, sense: s1, modality: 'recognition' }), t1, 'task ids are stable');
    assert.throws(() => impl.taskId({ entry, reading, sense: s1 }), /modality/u, 'a task id needs its modality');
    const other = impl.entryId({ seq: 'fixture-other', spelling: '本', reading: 'ほん' });
    assert.notEqual(impl.senseId({ entry: other, index: 1 }), s1, 'sense ids are scoped by their entry');
    assert.notEqual(impl.taskId({ entry: other, reading, sense: impl.senseId({ entry: other, index: 1 }), modality: 'recognition' }), t1, 'task ids vary with the entry');
    assert.notEqual(impl.taskId({ entry, reading: impl.readingId({ kanji: '本', reading: 'もと' }), sense: s1, modality: 'recognition' }), t1, 'task ids vary with the reading');
    assert.notEqual(impl.taskId({ entry, reading, sense: s1, modality: 'recall' }), t1, 'task ids vary with the modality');
  },
  /** [3] real gap 3: one kanji drawn twice in a character gives two occurrence ids pointing at one part id */
  occurrences(impl) {
    const a = impl.componentOccurrenceId({ kanji: '森', position: 1, part: '木' });
    const b = impl.componentOccurrenceId({ kanji: '森', position: 2, part: '木' });
    const kanji = impl.kanjiId('森');
    assert.equal(a.id, `comp:${kanji}:1`, 'occurrence id form comp:<kanji id>:<position> (SPEC-v1.md:1048)');
    assert.equal(b.id, `comp:${kanji}:2`);
    assert.notEqual(a.id, b.id, 'two occurrences');
    assert.equal(a.part, b.part, 'one part id');
    assert.equal(a.part, impl.partId('木'));
  },
  /** [4] provenance and migration: v1 keys map to one v2 id or to an explicit ambiguity; unknown versions are refused */
  migration(impl) {
    const { spelling, reading, seqs } = findHomograph();
    const honSeqs = findSeqs('本', 'ほん');
    const candidates = [
      ...seqs.map((seq) => ({ seq, spelling, reading })),
      ...honSeqs.map((seq) => ({ seq, spelling: '本', reading: 'ほん' })),
      { seq: 'fixture-生-0', spelling: '生', reading: 'せい' },
    ];
    if (honSeqs.length === 1) {   // the contract's own instance: one candidate in dict-v2, so exactly one new id
      const hon = impl.migrateIdentity({ version: 1, key: '本|ほん' }, { candidates });
      assert.equal(hon.id, impl.entryId({ seq: honSeqs[0], spelling: '本', reading: 'ほん' }), "'本|ほん' maps to its one entry id");
      assert.ok(hon.ambiguous == null);
    }
    const one = impl.migrateIdentity({ version: 1, key: '生|せい' }, { candidates });
    assert.equal(one.version, 2);
    assert.equal(one.id, impl.entryId({ seq: 'fixture-生-0', spelling: '生', reading: 'せい' }), 'the old key maps to exactly one new id');
    assert.equal(one.from, '生|せい');
    assert.ok(Array.isArray(one.migration) && one.migration.some((m) => m.from === 1 && m.to === 2), 'a recorded migration step');
    const two = impl.migrateIdentity({ version: 1, key: `${spelling}|${reading}` }, { candidates });
    assert.equal(two.ambiguous, 'needs seq', 'two or more seqs: explicit ambiguity, never silently one of them');
    assert.ok(two.id == null);
    assert.deepEqual([...two.candidates].sort(), seqs.map((seq) => impl.entryId({ seq, spelling, reading })).sort());
    assert.throws(() => impl.migrateIdentity({ version: 3, key: '生|せい' }, { candidates }), /version/u, 'an unknown version is refused');
    assert.throws(() => impl.migrateIdentity({ key: '生|せい' }, { candidates }), /version/u);
  },
  /** [5] evidence targets are typed: untyped and entry-less lexical targets are rejected; a whole-sentence
   *  section target with source occurrence, transcript digest and validated range is accepted without an entry;
   *  a section forced to its first word, or a lexical capture retyped as a section, is rejected (S4-R14, S8(g)) */
  evidence(impl) {
    const entry = impl.entryId({ seq: '1522150', spelling: '本', reading: 'ほん' });
    const digest = 'a'.repeat(64);
    assert.throws(() => impl.validateEvidenceTarget({ kind: 'answer', target: null }), /untyped/u, 'no typed target');
    assert.throws(() => impl.validateEvidenceTarget({ kind: 'answer', target: { text: '本' } }), /untyped/u, 'a target without a kind');
    assert.throws(() => impl.validateEvidenceTarget({ kind: 'answer', target: { kind: 'lexical' } }), /entry/u, 'a lexical target needs its entry id');
    assert.ok(impl.validateEvidenceTarget({ kind: 'answer', target: { kind: 'lexical', entry } }));
    const section = { kind: 'section', sourceOccurrence: 'occ:transcript-7:12', transcriptDigest: digest,
      range: { start: 0, end: 18, wholeSentence: true, validated: true } };
    assert.ok(impl.validateEvidenceTarget({ kind: 'answer', target: section }), 'a validated whole-sentence section needs no entry id');
    assert.throws(() => impl.validateEvidenceTarget({ kind: 'answer', target: { ...section, range: { start: 0, end: 1, wholeSentence: false, validated: true, forcedFirstWord: true } } }), /sentence|first word/u, 'a section forced to its first word');
    assert.throws(() => impl.validateEvidenceTarget({ kind: 'answer', target: { ...section, retypedFrom: 'lexical', lexicalConfidence: 'uncertain' } }), /retyped|lexical/u, 'an uncertain lexical capture retyped as a section');
    assert.throws(() => impl.validateEvidenceTarget({ kind: 'answer', target: { ...section, transcriptDigest: 'nope' } }), /digest/u, 'the transcript digest must be a sha256');
    assert.throws(() => impl.validateEvidenceTarget({ kind: 'answer', target: { ...section, sourceOccurrence: '' } }), /occurrence/u, 'the source occurrence is required');
  },
};

// ---- the implementation under test ------------------------------------------------------------------------
const impl = await import('./identity.mjs');
for (const [name, fixture] of Object.entries(fixtures)) test(`identity contract · ${name}`, () => fixture(impl));

// ---- negative control: the base's identity, adapted, fails exactly the three real gaps ----------------------
const baseAdapter = {
  kanjiId: (literal) => itemIdentity({ kind: 'kanji', literal }),
  partId: (literal) => `part:${literal}`,
  entryId: ({ seq, spelling, reading }) => itemIdentity({ kind: 'word', term: spelling, reading, seq }),   // seq is not in the key
  readingId: ({ kanji, reading }) => wordIdentity(kanji, reading),
  relate: ({ reading, kanji, entry, provenance }) => {
    for (const k of ['dataset', 'version', 'licence']) if (!provenance || !provenance[k]) throw new Error(`provenance.${k} missing`);
    return { reading, kanji, entry, provenance };
  },
  senseId: ({ entry }) => entry,                                                   // nothing keys by sense
  taskId: ({ entry, reading, modality }) => { if (!modality) throw new Error('modality'); return `${entry}|${reading}|${modality}`; },
  componentOccurrenceId: ({ part }) => ({ id: `comp:${part}`, part: `part:${part}` }), // keyed by text
};
test('negative control · the base keeps 生/せい and 生/なま apart (the regression fixture passes on the base)', () => fixtures.regression(baseAdapter));
for (const name of ['homograph', 'senses', 'occurrences']) {
  test(`negative control · the base fails the ${name} fixture`, () => assert.throws(() => fixtures[name](baseAdapter)));
}
