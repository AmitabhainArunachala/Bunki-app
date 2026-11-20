import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const structure = require('../kanji-structure.js');
const here = dirname(fileURLToPath(import.meta.url));
const sourceDir = join(here, 'fixtures/kanji-structure/source');
const read = path => readFileSync(path, 'utf8');
const json = path => JSON.parse(read(path));
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const dataPath = join(here, '../data/share_alike/kanji-structure.json');
const strokesPath = join(here, '../data/share_alike/strokes.json');
const grouping = json(dataPath);
const allKanji = json(join(here, '../data/share_alike/kanji.json')).kanji;
const allStrokes = json(strokesPath).strokes;
const glyphs = [...'森品晶織識職'];
const kanji = Object.fromEntries([...glyphs, '木'].map(literal => [literal, allKanji[literal]]));
const strokes = Object.fromEntries([...glyphs, '木'].map(literal => [literal, allStrokes[literal]]));
const make = (override = {}) => structure.createModel({ kanji, strokes, grouping, ...override });
const pins = {
  森: 'a6a066aa5824d08f01a00f86c996fe22cc499abcb41ba6fc32628b3785ea8e51',
  品: 'cff55162576da9e9c76cf9abd2eaba5b5313421d7a27c99a421dfb6e7b182f15',
  晶: '83d97dd8c14bbe606a564409157237617777de36b8c99fbe9cd0c170240785e5',
  織: '464a97cde3a8cba2aff6c5eeefa99a377526bde24ce8d53cbbd9d1e1350233d1',
  識: '4fb80f7684e1299ddea6e056cc65fed76599e584ac06330d29bf6ecf22f90abd',
  職: 'c004baafee3021780fa772c6da927bc30cf40c379da96e8ae5b41e927337f1ee',
};

test('six retained upstream sources have exact independent hashes, URLs and unchanged license headers', () => {
  const manifest = json(join(sourceDir, 'source-manifest.json'));
  assert.equal(manifest.commit, structure.KANJIVG_COMMIT);
  assert.equal(manifest.files.length, 6);
  assert.deepEqual(manifest.files.map(row => row.literal), glyphs);
  for (const row of manifest.files) {
    const raw = readFileSync(join(sourceDir, row.file));
    assert.equal(sha(raw), pins[row.literal]);
    assert.equal(row.sha256, pins[row.literal]);
    assert.equal(raw.length, row.bytes);
    assert.equal(row.url, `https://raw.githubusercontent.com/KanjiVG/kanjivg/${structure.KANJIVG_COMMIT}/kanji/${row.file}`);
    assert(raw.includes('Copyright (C) 2009/2010/2011 Ulrich Apel.'));
    assert(raw.includes('Attribution-Share Alike 3.0 Licence'));
    assert.equal(grouping.characters[row.literal].source.sha256, row.sha256);
  }
});

test('offline XML extractor rederives every field of the committed production projection', () => {
  const result = spawnSync('python3', [
    join(here, 'extract-kanji-structure.py'), '--source-dir', sourceDir,
    '--strokes', strokesPath, '--output', dataPath, '--check',
  ], { encoding: 'utf8', env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).sha256, sha(readFileSync(dataPath)));
});

test('all six production geometries exactly match runtime path bytes and original XML stroke order', () => {
  const model = structure.createModel({ kanji: allKanji, strokes: allStrokes, grouping });
  for (const literal of glyphs) {
    const view = model.inspect(literal);
    assert.equal(view.grouping.status, 'available');
    assert.equal(view.grouping.strokeParity, 'exact');
    const source = read(join(sourceDir, `${literal.codePointAt(0).toString(16).padStart(5, '0')}.svg`));
    const paths = [...source.matchAll(/<path\b[^>]*\bd="([^"]+)"/gu)].map(match => match[1]);
    assert.deepEqual(paths, allStrokes[literal]);
    assert.deepEqual(model.project(literal, view.tree.id).paths, paths);
    assert.deepEqual(model.project(literal, view.tree.id).pathIndices, paths.map((_, index) => index));
  }
});

test('森, 品, 晶 retain three independently addressable repeated components with exact disjoint paths', () => {
  const model = make();
  for (const [literal, part, width] of [['森', '木', 4], ['品', '口', 3], ['晶', '日', 4]]) {
    const rows = model.inspect(literal).occurrences.filter(row => row.reference?.id === part);
    assert.equal(rows.length, 3);
    assert.equal(new Set(rows.map(row => row.id)).size, 3);
    assert.deepEqual(rows.map(row => row.strokeIndices), [
      Array.from({ length: width }, (_, i) => i),
      Array.from({ length: width }, (_, i) => i + width),
      Array.from({ length: width }, (_, i) => i + width * 2),
    ]);
    for (const row of rows) {
      const selected = model.project(literal, row.id);
      assert.deepEqual(selected.paths, row.strokeIndices.map(i => strokes[literal][i]));
      assert.equal(model.occurrence(literal, row.id), row);
    }
  }
});

test('林 hierarchy and unnamed intermediate 品/晶 groups are retained rather than flattened', () => {
  const model = make();
  const forest = model.inspect('森');
  const grove = forest.occurrences.find(row => row.reference?.id === '林');
  const woods = forest.occurrences.filter(row => row.reference?.id === '木');
  assert.equal(woods.filter(row => row.parentId === grove.id).length, 2);
  for (const literal of ['品', '晶']) {
    const view = model.inspect(literal);
    const unnamed = view.occurrences.filter(row => row.reference === null && row.parentId !== null);
    assert.equal(unnamed.length, 1);
    assert.equal(unnamed[0].childIds.length, 2);
    const selected = model.project(literal, unnamed[0].id);
    assert(selected.paths.length > 0);
    assert.equal(view.tree.children[0].reference.id, literal);
  }
});

test('戠 family retains contextual twelve strokes and split group attributes without invented roles', () => {
  const model = make();
  assert.equal(allKanji.戠.st, 13);
  for (const literal of [...'織識職']) {
    const view = model.inspect(literal);
    const family = view.occurrences.find(row => row.reference?.id === '戠');
    assert.equal(family.strokeIndices.length, 12);
    assert.equal(model.project(literal, family.id).paths.length, 12);
    const split = view.occurrences.filter(row => row.reference?.id === '戈');
    assert.equal(split.length, 2);
    assert.notEqual(split[0].id, split[1].id);
    assert(split.every(row => row.sourceAttributes['{http://kanjivg.tagaini.net}part']));
    assert.deepEqual(split.flatMap(row => row.strokeIndices), [...new Set(split.flatMap(row => row.strokeIndices))]);
    for (const row of view.occurrences) {
      assert(!Object.hasOwn(row, 'semanticRole'));
      assert(!Object.hasOwn(row, 'phoneticRole'));
      assert(!Object.hasOwn(row, 'reading'));
    }
    assert(view.listedMembership.some(row => row.reference.id === '戠' && row.occurrenceId === null));
  }
});

test('missing grouping stays absent; listed membership never becomes geometry or a guessed occurrence', () => {
  const model = make({ grouping: null });
  assert.deepEqual(model.inspect('森').listedMembership.map(row => row.reference.id), ['木', '林']);
  assert.equal(model.inspect('森').grouping.status, 'absent');
  assert.deepEqual(model.inspect('森').occurrences, []);
  assert.equal(model.inspect('森').tree, null);
  assert.equal(model.project('森', '木'), null);
  assert.equal(make().inspect('木').grouping.status, 'absent');
  assert.equal(make().inspect('𠮟').strokeCount, null);
  assert.throws(() => model.inspect('\uD842'), /Unicode scalar/u);
  assert.throws(() => model.inspect('木木'), /Unicode scalar/u);
});

test('occurrence identity binds source, exact glyph and group path; cross-glyph selection is refused', () => {
  const model = make();
  const row = model.inspect('森').occurrences.find(item => item.reference?.id === '木');
  assert.equal(model.project('品', row.id), null);
  assert.equal(model.project('森', `${row.id}changed`), null);
  assert.notEqual(structure.occurrenceId('森', pins.森, '$/0/0'),
    structure.occurrenceId('森', pins.森, '$/0/1'));
  assert.notEqual(structure.occurrenceId('森', pins.森, '$/0/0'),
    structure.occurrenceId('森', pins.品, '$/0/0'));
});

test('model snapshots inputs, exposes frozen projections, and never changes learner or catalog data', () => {
  const input = { kanji: clone(kanji), strokes: clone(strokes), grouping: clone(grouping) };
  const before = JSON.stringify(input);
  const learner = Object.freeze({ taken: Object.freeze([]), srs: Object.freeze({}) });
  const model = structure.createModel({ ...input, learner });
  assert.equal(JSON.stringify(input), before);
  const view = model.inspect('森');
  input.kanji.森.parts.push('fake');
  input.strokes.森[0] = 'fake';
  input.grouping.characters.森.groups[0].strokeIndices = [];
  assert.deepEqual(model.inspect('森').listedMembership.map(row => row.reference.id), ['木', '林']);
  assert.equal(model.project('森', view.tree.id).paths[0], strokes.森[0]);
  assert.throws(() => { view.occurrences.pop(); }, TypeError);
  assert.throws(() => { view.tree.children.pop(); }, TypeError);
  assert.throws(() => { model.project('森', view.tree.id).paths[0] = 'fake'; }, TypeError);
  assert.deepEqual(learner, { taken: [], srs: {} });
});

test('runtime rejects changed/reordered/missing stroke paths instead of claiming alignment', () => {
  for (const mutate of [
    paths => { paths[0] += ' '; },
    paths => { [paths[0], paths[1]] = [paths[1], paths[0]]; },
    paths => { paths.pop(); },
  ]) {
    const changed = clone(strokes);
    mutate(changed.森);
    assert.throws(() => make({ strokes: changed }), /stroke (?:0|count) differs/u);
  }
});

test('malformed provenance, unknown revision, source-label edits and duplicate occurrence IDs are refused', () => {
  for (const mutate of [
    data => { data.source.commit = '0'.repeat(40); },
    data => { data.characters.森.source.sha256 = 'invented'; },
    data => { data.characters.森.source.url = data.characters.品.source.url; },
    data => { data.characters.森.groups[2].element = '品'; },
    data => { data.characters.森.groups[2].path = data.characters.森.groups[1].path; },
    data => { data.characters.森.groups[2].attributes.id = data.characters.森.groups[1].attributes.id; },
    data => { data.characters.森.groups[2].attributes.transform = 'translate(10 0)'; },
  ]) {
    const changed = clone(grouping);
    mutate(changed);
    assert.throws(() => make({ grouping: changed }), /Kanji structure:/u);
  }
});

test('cycles, missing parent/child, wrong ordering and overlapping direct owners fail closed', () => {
  for (const mutate of [
    rows => { rows[2].parentPath = rows[2].path; },
    rows => { rows[0].childPaths = ['$']; },
    rows => { rows[1].childPaths.pop(); },
    rows => { rows[1].childPaths.reverse(); },
    rows => { rows[2].directStrokeIndices.push(4); rows[2].strokeIndices.push(4); },
    rows => { rows[2].strokeIndices.pop(); },
    rows => { rows[2].directStrokeIndices[0] = 100; },
    rows => { rows[2].strokeIndices[0] = -1; },
  ]) {
    const changed = clone(grouping);
    mutate(changed.characters.森.groups);
    assert.throws(() => make({ grouping: changed }), /Kanji structure:/u);
  }
});

test('plain-script UMD works without DOM/storage globals and matches the CommonJS output', () => {
  const context = {};
  vm.runInNewContext(read(join(here, '../kanji-structure.js')), context);
  const model = context.BunkiKanjiStructure.createModel({ kanji, strokes, grouping });
  assert.deepEqual(JSON.parse(JSON.stringify(model.inspect('品'))), make().inspect('品'));
  assert.deepEqual(Object.keys(context), ['BunkiKanjiStructure']);
});

test('extractor rejects wrong stroke geometry, entities, transforms and unsupported shape children', () => {
  const original = read(join(sourceDir, '068ee.svg'));
  const program = [
    'import json,sys,runpy',
    "module=runpy.run_path(sys.argv[1],run_name='extractor_test')",
    'data=json.load(sys.stdin)',
    "module['project_xml']('森',data['xml'].encode(),data['paths'])",
  ].join('\n');
  for (const [xml, expected] of [
    [original.replace(strokes.森[0], `${strokes.森[0]} `), 'stroke 0 differs'],
    [original.replace('<svg ', '<!ENTITY unsafe "x">\\n<svg '), 'custom entities forbidden'],
    [original.replace('<g id="kvg:068ee"', '<circle cx="1" cy="1" r="1"/><g id="kvg:068ee"'), 'unsupported geometry child'],
    [original.replace('<g id="kvg:068ee"', '<g transform="translate(10 0)" id="kvg:068ee"'), 'transformed geometry unsupported'],
  ]) {
    const result = spawnSync('python3', ['-c', program, join(here, 'extract-kanji-structure.py')], {
      input: JSON.stringify({ xml, paths: strokes.森 }), encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.notEqual(result.status, 0);
    assert(result.stderr.includes(expected), result.stderr);
  }
});
