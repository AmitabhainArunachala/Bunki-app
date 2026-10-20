import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  ROOT, inventory, serialize, sha256, partitionEntries, tokenOccurrences,
  validateContextRow, summarizeFamily, createInventoryReader, writeExternal,
} from './inventory-kanji-library.mjs';

test('catalog membership repeats do not inflate identity or merge homograph readings', () => {
  const first = { key: 'same:one', id: '生', type: 'word', reading: 'せい',
    canonicalTarget: { type: 'word', id: '生', reading: 'せい' } };
  const second = { key: 'same:two', id: '生', type: 'word', reading: 'なま', canonicalTarget: null };
  const result = partitionEntries({ collections: [
    { entries: [first, second] }, { entries: [first] },
  ] }, 'word');
  assert.equal(result.rows.length, 2);
  assert.equal(result.canonical.length, 1);
  assert.equal(result.referenceOnly[0].reading, 'なま');
  assert.throws(() => partitionEntries({ collections: [{ entries: [
    first, { ...first, reading: 'しょう' },
  ] }] }, 'word'), /conflicting catalog identity/u);
});

test('printed occurrences preserve repetition and supplementary Unicode offsets without decomposing forms', () => {
  const article = { id: 'source:test', tokens: [{ s: '森𠮟森', b: '森', r: 'whole-token' }] };
  const rows = tokenOccurrences(article, 'a'.repeat(64));
  assert.deepEqual(rows.map(row => [row.literal, row.scalarIndex]), [['森', 0], ['𠮟', 1], ['森', 2]]);
  assert.equal(new Set(rows.map(row => JSON.stringify(row.id))).size, 3);
  assert(rows.every(row => row.literal !== '木'));
  assert.notDeepEqual(rows[0].id, tokenOccurrences(article, 'b'.repeat(64))[0].id);
  assert.equal(rows[0].reading, 'whole-token');
});

test('context records bind actual tokens and pinned dictionary sense bounds; names are not senses', () => {
  const article = { tokens: [{ s: '生' }] };
  const details = new Map([['123', 2]]);
  assert.deepEqual(validateContextRow('0', ['123', 1, 'review'], article, details),
    { tokenIndex: 0, type: 'sense' });
  assert.equal(validateContextRow('0', ['name', 'review'], article, details).type, 'name');
  assert.equal(validateContextRow('0', ['reading', 'review'], article, details).type, 'reading');
  for (const [offset, row] of [['1', ['123', 0]], ['00', ['123', 0]],
    ['0', ['123', 2]], ['0', ['unbound', 0]], ['0', ['123', -1]]]) {
    assert.throws(() => validateContextRow(offset, row, article, details));
  }
});

test('authored family assertions never become independent verification or historical geometry', () => {
  const edge = { id: 'sound:1', relation: 'phonetic-component',
    from: { type: 'kanji', id: '織' }, to: { type: 'kanji', id: '戠' },
    evidence: [{ sourceId: 'source:1', locator: 'entry' }] };
  const family = { schemaVersion: 1, family: { id: 'example', members: [edge.to] },
    sources: [{ id: 'source:1', kind: 'dictionary-entry' }],
    nodes: [{ reference: edge.from }, { reference: edge.to }], edges: [edge], examples: [] };
  const result = summarizeFamily(family);
  assert.equal(result.byRelation['phonetic-component'], 1);
  assert.equal(result.independentlyVerifiedSoundMeaningEdges, null);
  assert.equal(result.historicalFormGeometry, null);
  assert.deepEqual(result.sourceKinds, { 'dictionary-entry': 1 });
  assert.equal(summarizeFamily(null).status, 'absent');
  assert.throws(() => summarizeFamily({ ...family, edges: [edge, edge] }), /duplicate/u);
  assert.throws(() => summarizeFamily({ ...family, edges: [{ ...edge, evidence: [] }] }), /evidence/u);
  assert.throws(() => summarizeFamily({ ...family, edges: [{ ...edge, relation: 'looks-similar' }] }), /unrecognized/u);
  assert.throws(() => summarizeFamily({ ...family, sources: [] }), /known source/u);
  assert.throws(() => summarizeFamily({ ...family, nodes: [] }), /endpoint absent/u);
});

test('changed input bytes cannot replace their first pin or pass final verification', () => {
  const base = join(homedir(), '.dharma/bunki_review/2026-10-15/juncture/one-hand/KANJI-NEXT/evidence/slice4-library/pure-fixtures');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'input-'));
  writeFileSync(join(dir, 'input.json'), '{"version":1}\n');
  const reader = createInventoryReader(dir);
  assert.equal(reader.json('input.json').version, 1);
  writeFileSync(join(dir, 'input.json'), '{"version":2}\n');
  assert.throws(() => reader.json('input.json'), /changed between reads/u);
  assert.throws(() => reader.verify(), /changed during inventory/u);
});

test('family word endpoints retain exact readings and reject a mismatched or missing reading', () => {
  const kanji = { type: 'kanji', id: '生' };
  const first = { type: 'word', id: '生', reading: 'せい' };
  const second = { type: 'word', id: '生', reading: 'なま' };
  const family = { schemaVersion: 1, family: { id: 'reading-control', members: [kanji] },
    sources: [{ id: 'words', kind: 'retained-file' }],
    nodes: [kanji, first, second].map(reference => ({ reference })),
    edges: [first, second].map((from, index) => ({ id: `word:${index}`,
      relation: 'word-contains-kanji', from, to: kanji,
      evidence: [{ sourceId: 'words', locator: '/words/生' }] })), examples: [] };
  const result = summarizeFamily(family);
  assert.equal(result.nodes, 3);
  assert.deepEqual(result.nodeReferences.filter(row => row.type === 'word'), [first, second]);
  const wrongReading = structuredClone(family);
  wrongReading.edges[0].from = { ...wrongReading.edges[0].from, reading: 'しょう' };
  assert.throws(() => summarizeFamily(wrongReading), /endpoint absent/u);
  const missingReading = structuredClone(family);
  delete missingReading.edges[0].from.reading;
  assert.throws(() => summarizeFamily(missingReading), /needs exact reading/u);
});

test('output guard refuses a report inside the repository before any write', () => {
  assert.throws(() => writeExternal({}, join(ROOT, 'inventory-must-not-exist.json')), /outside repository/u);
});

test('real corpus has disjoint canonical/reference/fact denominators and preserved repeated groups', () => {
  const report = inventory();
  const ids = report.identities;
  assert.equal(ids.canonicalKanji.count, 2582);
  assert.equal(ids.referenceOnlyKanji.count, 4328);
  assert.equal(ids.referenceOnlyKanji.glyphlessCount, 537);
  assert.equal(ids.catalogKanji, ids.canonicalKanji.count + ids.referenceOnlyKanji.count);
  assert.equal(ids.dictionaryFactLiterals, 10384);
  assert.equal(ids.factOnlyNotCatalog.length, 4101);
  assert.equal(ids.canonicalWithoutFacts.length, 6);
  assert(!ids.canonicalKanji.ids.includes('CE-000001'));
  for (const [literal, label] of [['森', '木'], ['品', '口'], ['晶', '日']]) {
    const row = report.geometry.structures.find(item => item.literal === literal);
    assert.equal(row.namedLabels[label], 3);
    const repeated = row.occurrences.filter(item => item.reference?.id === label);
    assert.equal(new Set(repeated.map(item => item.id)).size, 3);
  }
  assert.equal(report.readingsAndSenses.dictionary.actualDetailSenses, 89991);
  assert.equal(report.sourceOccurrences.articles, 156);
  assert.equal(report.sourceOccurrences.hanOccurrences, 53571);
  assert.deepEqual(report.readingsAndSenses.explicitContext.byKind, { name: 52, reading: 4, sense: 973 });
  assert.equal(report.source.nativeEvidence, false);
  const family = report.relationships.family;
  if (family.status === 'authored-asset-present') {
    assert.equal(family.members, 3);
    assert.equal(family.nodes, 19);
    assert.deepEqual(family.byRelation, { 'attested-word-occurrence': 3,
      'phonetic-component': 3, 'semantic-component': 3, 'source-component-occurrence': 6,
      'word-contains-kanji': 3 });
    assert.deepEqual(family.sourceKinds, { 'dictionary-entry': 3, 'retained-file': 8, 'retained-svg': 3 });
    assert(family.exampleBindings.every(row => row.contextualSenseId === null &&
      row.characterReadingAlignment === null && row.originalCorpusSentenceId === null));
    assert.equal(family.independentlyVerifiedSoundMeaningEdges, null);
    assert.deepEqual(family.nodeReferences.filter(row => row.type === 'word').map(row => [row.id, row.reading]),
      [['職業', 'しょくぎょう'], ['知識', 'ちしき'], ['組織', 'そしき']]);
  }
});

test('unchanged actual input bytes produce byte-identical reports without time/path entropy', () => {
  assert.equal(sha256(serialize(inventory())), sha256(serialize(inventory())));
});
