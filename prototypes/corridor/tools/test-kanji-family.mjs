/** Offline source joins and hostile-input controls; no browser, build or learner writes. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { test } from 'node:test';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const base = 'prototypes/corridor/';
const json = path => JSON.parse(read(base + path));
const family = require('../kanji-family.js');
const structureModule = require('../kanji-structure.js');
const data = json('data/share_alike/kanji-family.json');
const kanji = json('data/share_alike/kanji.json').kanji;
const words = json('data/share_alike/words.json').words;
const strokes = json('data/share_alike/strokes.json').strokes;
const grouping = json('data/share_alike/kanji-structure.json');
const structure = structureModule.createModel({ kanji, strokes, grouping });
const create = (asset = data, extra = {}) => family.createModel({ data: asset, kanji, words, structure, ...extra });
const clone = value => JSON.parse(JSON.stringify(value));
const ref = (type, id) => ({ type, id });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceById = new Map(data.sources.map(source => [source.id, source]));
const pointer = (document, path) => path.split('/').slice(1).reduce((value, part) => {
  assert.ok(value !== null && value !== undefined, `orphan pointer ${path}`);
  return value[part.replace(/~1/gu, '/').replace(/~0/gu, '~')];
}, document);

test('every retained source rehashes and every edge locator resolves to its own source', () => {
  const sources = new Map();
  for (const source of data.sources) {
    if (source.kind === 'dictionary-entry') {
      assert.equal(source.publisher, '公益財団法人 日本漢字能力検定協会');
      assert.equal(source.formationWork, '角川新字源 改訂新版');
      assert.equal(source.id, `kanjipedia-${source.subject.id.codePointAt(0).toString(16)}`);
      assert.equal(source.rawPageSha256, null, 'no claim of archived page bytes');
      continue;
    }
    const bytes = readFileSync(resolve(root, source.path));
    assert.equal(sha(bytes), source.sha256, source.path);
    assert.equal(bytes.length, source.bytes, source.path);
    sources.set(source.id, source.path.endsWith('.json') ? JSON.parse(bytes) : bytes.toString('utf8'));
  }
  for (const edge of data.edges) for (const row of edge.evidence) {
    const source = sourceById.get(row.sourceId);
    assert.ok(source);
    if (source.kind === 'dictionary-entry') {
      assert.equal(row.locator, 'なりたち');
      const hex = edge.to.id.codePointAt(0).toString(16);
      assert.equal(source.id, `kanjipedia-${hex}`, 'role cites its own character entry');
    } else if (source.kind === 'retained-svg') {
      assert.ok(sources.get(source.id).includes(`id="${row.locator}"`));
    } else {
      const actual = pointer(sources.get(source.id), row.locator);
      assert.ok(actual);
      if (edge.relation === 'word-contains-kanji') assert.deepEqual(actual, words[edge.from.id]);
      if (edge.relation === 'attested-word-occurrence') {
        const example = data.examples.find(item => item.reference.id === edge.from.id);
        assert.deepEqual(actual, example.rawRow[0][example.tokenIndex]);
        assert.equal(actual[1], edge.to.id);
      }
    }
  }
});

test('each retained sentence, translation, token, corpus attribution and bundle identity agrees', () => {
  const manifest = json('data/proprietary_safe/examples/manifest.json');
  assert.deepEqual(sourceById.get('example-manifest').definitions, manifest.sources);
  assert.deepEqual(sourceById.get('example-manifest').sharding, manifest.sharding);
  assert.equal(data.examples.length, 3);
  for (const example of data.examples) {
    const evidence = example.evidence[0];
    const source = sourceById.get(evidence.sourceId);
    const shard = JSON.parse(read(source.path));
    assert.deepEqual(pointer(shard, evidence.locator), example.rawRow);
    assert.deepEqual(manifest.sources[example.sourceIndex], example.sourceAttribution);
    assert.equal(Number(source.path.match(/s-(\d+)\.json$/u)[1]) * manifest.sharding.sentsPerShard +
      example.sourceRowIndex, example.bundleSid);
    assert.deepEqual(JSON.parse(example.reference.id), [
      'bundled-example', source.path, source.sha256, example.sourceRowIndex, example.tokenIndex,
    ]);
    assert.equal(example.originalCorpusSentenceId, null);
    assert.equal(example.contextualSenseId, null);
    assert.equal(example.characterReadingAlignment, null);
    assert.equal(example.rawRow[0][example.tokenIndex][2], words[example.word.id].r);
  }
  assert.deepEqual(data.examples.map(row => row.word.id), ['職業', '知識', '組織']);
});

test('sound, meaning, geometry, spelling and sentence relations stay separate', () => {
  const model = create();
  assert.deepEqual(model.family().members.map(row => row.id), ['職', '識', '織']);
  assert.deepEqual(model.edgesFor(ref('kanji', '戠'), 'phonetic-component').map(row => row.to.id), ['職', '識', '織']);
  assert.equal(model.edgesFor(ref('kanji', '戠'), 'semantic-component').length, 0);
  assert.deepEqual(model.catalog().edges.filter(row => row.relation === 'semantic-component')
    .map(row => [row.from.id, row.to.id]), [['耳', '職'], ['言', '識'], ['糸', '織']]);
  assert.equal(model.edgesFor(ref('kanji', '音')).length, 0, 'no inferred second-level teaching claim');
  assert.equal(model.edgesFor(ref('kanji', '戈')).length, 0, 'no false whole 戈 direct child');
  assert.equal(model.node(ref('kanji', '戠')).standaloneGeometry, 'absent');
  assert.equal(model.geometry(ref('kanji', '戠')), null);
  assert.equal(model.catalog().coverage.historicalFormGeometry, 0);
  assert.equal(model.catalog().coverage.fontMeshBindings, 0);
});

test('selected common/extra readings do not overwrite disagreeing local raw arrays', () => {
  const model = create();
  assert.deepEqual(model.node(ref('kanji', '職')).familyReadings.standardOn, ['ショク']);
  assert.deepEqual(model.node(ref('kanji', '識')).familyReadings.standardOn, ['シキ']);
  assert.deepEqual(model.node(ref('kanji', '織')).familyReadings.standardOn, ['ショク', 'シキ']);
  assert.deepEqual(model.node(ref('kanji', '職')).rawOnReadings, ['ショク', 'ソク']);
  assert.deepEqual(model.node(ref('kanji', '職')).familyReadings.outsideTableOn, ['シキ']);
  assert.ok(model.node({ type: 'word', id: '職業', reading: 'しょくぎょう' }));
  assert.equal(model.node({ type: 'word', id: '職業', reading: 'べつ' }), null, 'no homograph alias');
  assert.throws(() => model.node(ref('word', '職業')), /exact reading/u);
});

test('six geometry joins preserve host-specific IDs and exact ordered paths, including contextual 戠', () => {
  const model = create();
  const occurrences = model.catalog().nodes.filter(row => row.reference.type === 'component-occurrence');
  assert.equal(occurrences.length, 6);
  const soundParts = [];
  for (const node of occurrences) {
    const result = model.geometry(node.reference);
    assert.equal(result.status, 'available');
    assert.deepEqual(result.projection.pathIndices, node.strokeIndices);
    assert.deepEqual(result.projection.paths, node.strokeIndices.map(index => strokes[node.host.id][index]));
    assert.equal(result.projection.source.sha256, node.sourceSha256);
    assert.equal(result.projection.reference.id, node.host.id);
    if (node.component.id === '戠') {
      assert.equal(result.projection.paths.length, 12, 'contextual form is not standalone 13 strokes');
      soundParts.push(node.reference.id);
    }
  }
  assert.equal(new Set(soundParts).size, 3, 'never collapse three geometry instances into one component identity');
  const unavailable = create(data, { structure: null }).geometry(occurrences[0].reference);
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(unavailable.reason, 'structure-model-not-supplied');
});

test('bad source, invented endpoint, wrong word reading and borrowed geometry fail closed', () => {
  const mutations = [
    draft => { draft.edges[0].evidence[0].sourceId = 'structure'; },
    draft => { draft.edges[0].evidence = []; },
    draft => { draft.edges[0].to.id = '未収録'; },
    draft => { draft.edges[0].relation = 'historical-descent'; },
    draft => { draft.nodes.push(clone(draft.nodes[0])); },
    draft => { draft.edges.push(clone(draft.edges[0])); },
    draft => { draft.examples[0].rawRow[0][draft.examples[0].tokenIndex][2] = 'ちしき'; },
    draft => { draft.examples[0].english = 'Invented translation'; },
    draft => { draft.examples[0].originalCorpusSentenceId = 12345; },
    draft => { draft.examples[0].characterReadingAlignment = ['しょく', 'ぎょう']; },
    draft => { draft.nodes.find(node => node.reference.type === 'component-occurrence').host.id = '織'; },
    draft => { draft.nodes.find(node => node.reference.type === 'component-occurrence').strokeIndices.pop(); },
    draft => { draft.edges.find(edge => edge.relation === 'word-contains-kanji').scalarIndex = 99; },
    draft => { draft.edges.find(edge => edge.relation === 'word-contains-kanji').from.reading = 'べつ'; },
    draft => { draft.examples[0].bundleSid++; },
    draft => { draft.examples[0].sourceRowIndex++; },
    draft => { draft.examples[0].sourceAttribution.attribution = 'Invented attribution'; },
    draft => { draft.examples[0].evidence[0].sourceId = 'example-shard-1369'; },
    draft => { draft.edges.find(edge => edge.relation === 'attested-word-occurrence').evidence[0].locator = '/284/0/0'; },
    draft => { draft.edges[0].evidence[0].sourceId = 'kanjipedia-8b58'; },
    draft => {
      draft.nodes.find(node => node.reference.id === '職').familyReadings.evidence[0].sourceId = 'kanjipedia-8b58';
      draft.edges.filter(edge => ['phonetic-component', 'semantic-component'].includes(edge.relation) &&
        edge.to.id === '職').forEach(edge => { edge.evidence[0].sourceId = 'kanjipedia-8b58'; });
    },
  ];
  for (const mutate of mutations) {
    const draft = clone(data);
    mutate(draft);
    assert.throws(() => create(draft), /Kanji family:/u);
  }
});

test('caller mutation cannot alter frozen family, source or geometry snapshots', () => {
  const draft = clone(data);
  const model = create(draft);
  const first = model.catalog().nodes.find(row => row.reference.type === 'component-occurrence');
  draft.family.titleJa = 'mutated';
  draft.edges[0].to.id = '別';
  assert.equal(model.family().titleJa, data.family.titleJa);
  assert.throws(() => { model.edgesFor(ref('kanji', '戠'))[0].to.id = '別'; }, TypeError);
  assert.throws(() => model.geometry(first.reference).projection.paths.pop(), TypeError);
  assert.throws(() => { model.example(data.examples[0].reference).rawRow[0][0][0] = '別'; }, TypeError);
});

test('browser global export is pure and all packaging paths include the same module and asset', () => {
  const context = vm.createContext({});
  vm.runInContext(read(base + 'kanji-family.js'), context);
  assert.equal(typeof context.BunkiKanjiFamily.createModel, 'function');
  const script = read(base + 'index.html');
  assert.ok(script.indexOf('src="kanji-structure.js"') < script.indexOf('src="kanji-family.js"'));
  for (const file of ['scripts/corridor-assets.mjs', 'scripts/build-corridor-site.mjs', base + 'sw.js']) {
    assert.ok(read(file).includes("'kanji-family.js'"), file);
  }
  assert.ok(read(base + 'sw.js').includes("'data/share_alike/kanji-family.json'"));
  const standalone = read(base + 'tools/build-standalone.mjs');
  assert.ok(standalone.includes("${read('kanji-family.js')}"));
  assert.ok(standalone.includes("'share_alike/kanji-family': 'data/share_alike/kanji-family.json'"));
  const corridor = read(base + 'corridor.js');
  assert.ok(corridor.includes("'字を調べる'") && corridor.includes("'字を調べる方法'"));
  assert.ok(!corridor.includes('字を引く'));
});
