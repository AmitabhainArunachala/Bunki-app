/* Attributed kanji family data, separate from source geometry and learner state.
 * createModel({data, kanji, words, structure?}) validates and snapshots the asset.
 * No DOM, fetch, storage, grades, inference of roles, or font-mesh generation.
 * Runtime checks validate joins, not the truth of a cited dictionary account.
 * The offline tests rehash retained sources and verify their exact locators.
 */
/* global module:readonly -- Optional CommonJS export, guarded for browsers. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BunkiKanjiFamily = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const copy = value => JSON.parse(JSON.stringify(value));
  const string = value => typeof value === 'string' && value.length > 0;
  const types = ['kanji', 'word', 'component-occurrence', 'sentence-occurrence'];
  const relations = ['phonetic-component', 'semantic-component', 'source-component-occurrence',
    'word-contains-kanji', 'attested-word-occurrence'];
  function check(ok, message) { if (!ok) throw new Error(`Kanji family: ${message}`); }
  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }
  function key(reference) {
    check(reference && types.includes(reference.type) && string(reference.id), 'invalid reference');
    if (reference.type === 'word') {
      check(string(reference.reading), 'word reference needs exact reading');
      return JSON.stringify([reference.type, reference.id, reference.reading]);
    }
    return JSON.stringify([reference.type, reference.id]);
  }
  function createModel({ data, kanji = {}, words = {}, structure = null } = {}) {
    check(data?.schemaVersion === 1, 'unsupported schema');
    const snapshot = copy(data);
    check(string(snapshot.family?.id) && Array.isArray(snapshot.family.members) &&
      snapshot.family.members.length > 0, 'family identity missing');
    check(Array.isArray(snapshot.sources) && Array.isArray(snapshot.nodes) &&
      Array.isArray(snapshot.edges) && Array.isArray(snapshot.examples), 'collections missing');
    check(!structure || (typeof structure.inspect === 'function' &&
      typeof structure.occurrence === 'function' && typeof structure.project === 'function'),
    'invalid structure model');
    const sources = new Map(), nodes = new Map(), edges = new Map(), examples = new Map();
    const projections = new Map();
    for (const source of snapshot.sources) {
      check(string(source.id) && !sources.has(source.id), 'duplicate/missing source');
      check(['retained-file', 'retained-svg', 'dictionary-entry'].includes(source.kind), 'unknown source kind');
      if (source.kind === 'dictionary-entry') {
        check(/^https:\/\//u.test(source.url || '') && string(source.title) &&
          string(source.accessedDate) && source.subject?.type === 'kanji' &&
          own(kanji, source.subject.id), 'dictionary citation missing');
      } else {
        check(string(source.path) && !source.path.startsWith('/') && !source.path.split('/').includes('..') &&
          /^[a-f0-9]{64}$/u.test(source.sha256 || '') &&
          Number.isSafeInteger(source.bytes) && source.bytes > 0, 'retained source pin missing');
      }
      sources.set(source.id, source);
    }
    function evidence(rows, kind = null) {
      check(Array.isArray(rows) && rows.length > 0, 'evidence missing');
      rows.forEach(row => {
        const source = sources.get(row.sourceId);
        check(source && string(row.locator) && (!kind || source.kind === kind), 'evidence source/locator mismatch');
      });
    }
    const pointerKey = value => value.replace(/~/gu, '~0').replace(/\//gu, '~1');
    for (const node of snapshot.nodes) {
      const id = key(node.reference);
      check(!nodes.has(id), 'duplicate node');
      nodes.set(id, node);
      switch (node.reference.type) {
        case 'kanji':
          check(own(kanji, node.reference.id), 'kanji identity missing');
          check(same(node.rawOnReadings, kanji[node.reference.id].on), 'raw reading changed');
          evidence(node.identityEvidence, 'retained-file');
          check(same(node.identityEvidence, [{ sourceId: 'kanji', locator: `/kanji/${pointerKey(node.reference.id)}` }]),
            'kanji evidence differs');
          if (node.familyReadings) {
            evidence(node.familyReadings.evidence, 'dictionary-entry');
            check(node.familyReadings.evidence.every(row =>
              same(sources.get(row.sourceId).subject, node.reference)), 'dictionary subject differs');
            check(['standardOn', 'outsideTableOn'].every(field =>
              Array.isArray(node.familyReadings[field]) && node.familyReadings[field].every(string)),
            'family reading labels missing');
          }
          break;
        case 'word':
          check(own(words, node.reference.id) && same(node.rawRecord, words[node.reference.id]) &&
            node.reference.reading === node.rawRecord.r, 'word record differs');
          evidence(node.evidence, 'retained-file');
          check(same(node.evidence, [{ sourceId: 'words', locator: `/words/${pointerKey(node.reference.id)}` }]),
            'word evidence differs');
          break;
        case 'component-occurrence': {
          evidence(node.evidence, 'retained-svg');
          check(node.host?.type === 'kanji' && own(kanji, node.host.id) &&
            node.component?.type === 'kanji' && own(kanji, node.component.id), 'geometry identity missing');
          check(sources.get(node.evidence[0].sourceId).sha256 === node.sourceSha256, 'geometry source differs');
          if (structure) {
            const actual = structure.occurrence(node.host.id, node.reference.id);
            const view = structure.inspect(node.host.id);
            check(actual && actual.reference?.id === node.component.id &&
              actual.groupPath === node.groupPath && actual.sourceGroupId === node.sourceGroupId &&
              view.grouping.source.sha256 === node.sourceSha256 &&
              same(actual.strokeIndices, node.strokeIndices), 'geometry occurrence differs');
            projections.set(id, structure.project(node.host.id, node.reference.id));
          }
          break;
        }
        case 'sentence-occurrence':
          evidence(node.evidence, 'retained-file');
          break;
      }
    }
    function get(reference) { return nodes.get(key(reference)) || null; }
    check(get(snapshot.family.center)?.reference.type === 'kanji' &&
      snapshot.family.members.every(reference => get(reference)?.reference.type === 'kanji') &&
      new Set(snapshot.family.members.map(key)).size === snapshot.family.members.length,
    'family references invalid');
    for (const example of snapshot.examples) {
      const id = key(example.reference);
      check(get(example.reference)?.reference.type === 'sentence-occurrence' && !examples.has(id),
        'example identity missing/duplicate');
      const word = get(example.word);
      check(word?.reference.type === 'word', 'example word missing');
      evidence(example.evidence, 'retained-file');
      evidence(example.dictionaryEvidence, 'retained-file');
      const exampleSource = sources.get(example.evidence[0].sourceId);
      const manifest = sources.get('example-manifest');
      const shard = exampleSource.path.match(/\/s-(\d+)\.json$/u);
      const perShard = manifest?.sharding?.sentsPerShard;
      check(Number.isSafeInteger(perShard) && perShard > 0 && shard &&
        Number.isSafeInteger(example.sourceRowIndex) && example.sourceRowIndex >= 0 &&
        example.sourceRowIndex < perShard && Number.isSafeInteger(example.tokenIndex) && example.tokenIndex >= 0 &&
        Number(shard[1]) * perShard + example.sourceRowIndex === example.bundleSid,
      'example bundle coordinates differ');
      check(example.reference.id === JSON.stringify(['bundled-example', exampleSource.path,
        exampleSource.sha256, example.sourceRowIndex, example.tokenIndex]) &&
        same(example.evidence, [{ sourceId: exampleSource.id, locator: `/${example.sourceRowIndex}` }]) &&
        same(get(example.reference).evidence, example.evidence) &&
        same(example.dictionaryEvidence, word.evidence), 'example provenance differs');
      check(Number.isSafeInteger(example.sourceIndex) && example.sourceIndex >= 0 &&
        same(example.sourceAttribution, manifest.definitions?.[example.sourceIndex]) &&
        ['url', 'licence', 'attribution'].every(field =>
          example.sourceAttribution[field] === exampleSource[field]), 'example attribution differs');
      const row = example.rawRow;
      check(Array.isArray(row) && Array.isArray(row[0]) &&
        row[0].every(token => Array.isArray(token) && typeof token[0] === 'string') &&
        row[0].map(token => token[0]).join('') === example.sentence &&
        row[1] === example.english && row[2] === example.sourceIndex, 'sentence content differs');
      const token = Number.isSafeInteger(example.tokenIndex) && row[0][example.tokenIndex];
      check(token && token[0] === example.word.id && token[1] === example.word.id &&
        word.rawRecord.r.split(';').map(value => value.trim()).includes(token[2]), 'sentence word/reading differs');
      check(example.contextualSenseId === null && example.characterReadingAlignment === null &&
        example.originalCorpusSentenceId === null, 'unsupported sentence alignment/identity claim');
      examples.set(id, example);
    }
    for (const edge of snapshot.edges) {
      check(string(edge.id) && !edges.has(edge.id) && relations.includes(edge.relation), 'duplicate/unknown edge');
      const from = get(edge.from), to = get(edge.to);
      check(from && to, 'edge endpoint missing');
      evidence(edge.evidence);
      switch (edge.relation) {
        case 'phonetic-component':
        case 'semantic-component':
          check(from.reference.type === 'kanji' && to.reference.type === 'kanji', 'role endpoints invalid');
          evidence(edge.evidence, 'dictionary-entry');
          check(edge.evidence.every(row => row.locator === 'なりたち' &&
            to.familyReadings?.evidence.some(reading => reading.sourceId === row.sourceId)),
          'role source differs from member');
          break;
        case 'source-component-occurrence':
          check(from.reference.type === 'kanji' && to.reference.type === 'component-occurrence' &&
            same(from.reference, to.component) && get(to.host), 'component occurrence endpoint differs');
          evidence(edge.evidence, 'retained-svg');
          check(same(edge.evidence, to.evidence), 'component occurrence evidence differs');
          break;
        case 'word-contains-kanji':
          check(from.reference.type === 'word' && to.reference.type === 'kanji' &&
            Number.isSafeInteger(edge.scalarIndex) && [...from.reference.id][edge.scalarIndex] === to.reference.id,
          'word membership differs');
          evidence(edge.evidence, 'retained-file');
          check(same(edge.evidence, from.evidence), 'word membership evidence differs');
          break;
        case 'attested-word-occurrence': {
          const example = examples.get(key(from.reference));
          check(from.reference.type === 'sentence-occurrence' && to.reference.type === 'word' &&
            same(example?.word, to.reference), 'sentence occurrence differs');
          evidence(edge.evidence, 'retained-file');
          check(same(edge.evidence, example.evidence.map(row => ({
            sourceId: row.sourceId, locator: `${row.locator}/0/${example.tokenIndex}`,
          }))), 'sentence edge evidence differs');
          break;
        }
      }
      edges.set(edge.id, edge);
    }
    freeze(snapshot);
    // Snapshot structure outputs as well: callers cannot later substitute a model.
    for (const [id, projection] of projections) projections.set(id, freeze(copy(projection)));
    function edgesFor(reference, relation = null) {
      check(relation === null || relations.includes(relation), 'unknown relation');
      const id = key(reference);
      return freeze([...edges.values()].filter(edge =>
        (!relation || edge.relation === relation) && [key(edge.from), key(edge.to)].includes(id)));
    }
    function geometry(reference) {
      const node = get(reference);
      if (!node || reference.type !== 'component-occurrence') return null;
      const projection = projections.get(key(reference));
      return projection
        ? freeze({ status: 'available', projection })
        : freeze({ status: 'unavailable', reason: 'structure-model-not-supplied', reference: node.reference });
    }
    return Object.freeze({
      family: () => snapshot.family,
      catalog: () => snapshot,
      node: get,
      edgesFor,
      example: reference => examples.get(key(reference)) || null,
      geometry,
    });
  }
  return Object.freeze({ createModel });
});
