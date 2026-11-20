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
  // Navigation is a projection of authored joins, never a graph completion or a
  // learner-state operation. Its copies also isolate it from a replaced model.
  function createNavigation({ model } = {}) {
    check(model && ['catalog', 'node', 'example', 'geometry'].every(name =>
      typeof model[name] === 'function'), 'navigation needs a family model');
    const catalog = freeze(copy(model.catalog()));
    const nodes = new Map(catalog.nodes.map(node => [key(node.reference), node]));
    const sources = new Map(catalog.sources.map(source => [source.id, source]));
    const examples = new Map(catalog.examples.map(row => [key(row.reference), row]));
    const geometries = new Map(catalog.nodes.filter(node =>
      node.reference.type === 'component-occurrence').map(node =>
      [key(node.reference), freeze(copy(model.geometry(node.reference)))]));
    const result = value => freeze(copy(value));
    const invalid = reason => result({ status: 'invalid', reason });
    const absent = reference => result({ status: 'absent', reference });
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const scalar = value => string(value) && [...value].length === 1 && !/[\uD800-\uDFFF]/u.test(value);
    function exactFields(value, required, optional = []) {
      return object(value) && required.every(field => own(value, field)) &&
        Reflect.ownKeys(value).every(field => required.includes(field) || optional.includes(field));
    }
    function validReference(reference, allowed) {
      if (!object(reference) || !allowed.includes(reference.type) || !string(reference.id) ||
          !exactFields(reference, reference.type === 'word' ? ['type', 'id', 'reading'] : ['type', 'id'])) return false;
      if (reference.type === 'kanji') return scalar(reference.id);
      if (reference.type === 'word') return string(reference.reading);
      try {
        const tuple = JSON.parse(reference.id);
        if (!Array.isArray(tuple) || tuple.length !== 5 || JSON.stringify(tuple) !== reference.id) return false;
        if (reference.type === 'sentence-occurrence') return tuple[0] === 'bundled-example' &&
          string(tuple[1]) && !tuple[1].startsWith('/') && !tuple[1].split('/').includes('..') &&
          /^[a-f0-9]{64}$/u.test(tuple[2]) &&
          tuple.slice(3).every(value => Number.isSafeInteger(value) && value >= 0);
        return tuple[0] === 'kanjivg-occurrence' && /^[a-f0-9]{40}$/u.test(tuple[1]) &&
          scalar(tuple[2]) && /^[a-f0-9]{64}$/u.test(tuple[3]) &&
          /^\$(?:\/(?:0|[1-9][0-9]*))*$/u.test(tuple[4]);
      } catch { return false; }
    }
    function resolve(reference, allowed) {
      if (!validReference(reference, allowed)) return invalid('invalid-reference');
      const node = nodes.get(key(reference));
      if (node) return { status: 'available', node };
      if (reference.type === 'word' && catalog.nodes.some(row =>
        row.reference.type === 'word' && row.reference.id === reference.id)) return invalid('word-reading-mismatch');
      return absent(reference);
    }
    const equalReference = (a, b) => key(a) === key(b);
    function citations(evidence) {
      return evidence.map(row => ({ ...row, source: sources.get(row.sourceId) }));
    }
    function edgeRow(edge, reference, direction = null) {
      return {
        edgeId: edge.id, relation: edge.relation, from: edge.from, to: edge.to,
        direction: direction || (equalReference(edge.from, reference) ? 'outgoing' : 'incoming'),
        evidence: edge.evidence, citations: citations(edge.evidence),
        ...(edge.account ? { account: edge.account } : {}),
        ...(edge.boundary ? { boundary: edge.boundary } : {}),
      };
    }
    function exposureRows(rows, what) {
      const byItem = new Map();
      rows.forEach(({ about, reveals }) => {
        const id = key(about);
        if (!byItem.has(id)) byItem.set(id, { what, about, reveals: [] });
        const current = byItem.get(id);
        reveals.forEach(facet => { if (!current.reveals.includes(facet)) current.reveals.push(facet); });
      });
      return [...byItem.values()].map(row => ({ ...row,
        reveals: ['reading', 'meaning'].filter(facet => row.reveals.includes(facet)),
      }));
    }
    function view(reference) {
      const resolved = resolve(reference, ['kanji', 'word']);
      if (resolved.status !== 'available') return resolved;
      const phonetic = [], semantic = [], occurrences = [], words = [], exampleRows = [];
      for (const edge of catalog.edges) {
        const direct = equalReference(edge.from, reference) || equalReference(edge.to, reference);
        if (['phonetic-component', 'semantic-component'].includes(edge.relation) && direct) {
          const host = nodes.get(key(edge.to));
          const row = { ...edgeRow(edge, reference), host: edge.to, component: edge.from };
          if (edge.relation === 'phonetic-component') {
            row.readings = { ...host.familyReadings, citations: citations(host.familyReadings.evidence) };
            phonetic.push(row);
          } else semantic.push(row);
        } else if (edge.relation === 'source-component-occurrence') {
          const occurrence = nodes.get(key(edge.to));
          if (direct || equalReference(occurrence.host, reference)) occurrences.push({
            ...edgeRow(edge, reference, direct ? null : 'host'),
            host: occurrence.host, component: occurrence.component, occurrence: occurrence.reference,
            groupPath: occurrence.groupPath, sourceGroupId: occurrence.sourceGroupId,
            sourceSha256: occurrence.sourceSha256, strokeIndices: occurrence.strokeIndices,
            geometry: geometries.get(key(occurrence.reference)),
          });
        } else if (edge.relation === 'word-contains-kanji' && direct) {
          const word = nodes.get(key(edge.from));
          words.push({ ...edgeRow(edge, reference), word: word.reference,
            rawRecord: word.rawRecord, scalarIndex: edge.scalarIndex });
        }
      }
      for (const edge of catalog.edges.filter(row => row.relation === 'attested-word-occurrence')) {
        const membership = words.find(row => equalReference(row.word, edge.to));
        const direct = equalReference(edge.to, reference);
        if (!direct && !membership) continue;
        const example = examples.get(key(edge.from));
        exampleRows.push({ ...edgeRow(edge, reference, direct ? 'incoming' : 'via-word'),
          reference: example.reference, word: example.word, tokenIndex: example.tokenIndex,
          ...(direct ? {} : { via: { edgeId: membership.edgeId, reference: membership.word } }),
        });
      }
      // These facets follow only the displayed fields: selected host readings,
      // attributed semantic account, and exact word/reading/gloss rows. Geometry
      // and component glyphs disclose no additional meaning or reading facet.
      const exposures = exposureRows([
        ...phonetic.filter(row => row.readings.standardOn.length || row.readings.outsideTableOn.length)
          .map(row => ({ about: row.host, reveals: ['reading'] })),
        ...semantic.filter(row => row.account).map(row => ({ about: row.host, reveals: ['meaning'] })),
        ...words.map(row => ({ about: row.word, reveals: ['reading', 'meaning'] })),
      ], 'family-reference');
      return result({ status: 'available', reference: resolved.node.reference,
        family: catalog.family, phonetic, semantic, occurrences, words, examples: exampleRows, exposures });
    }
    function canonical(reference) {
      if (reference.type === 'kanji') return { t: 'kanji', id: reference.id };
      if (reference.type === 'word') return { t: 'word', id: reference.id, reading: reference.reading };
      return null;
    }
    function destination(edgeId, from) {
      if (!string(edgeId)) return invalid('invalid-edge-id');
      const current = view(from);
      if (current.status !== 'available') return current;
      const row = [...current.phonetic, ...current.semantic, ...current.occurrences,
        ...current.words, ...current.examples].find(item => item.edgeId === edgeId);
      if (!row) return catalog.edges.some(edge => edge.id === edgeId)
        ? invalid('edge-not-available-from-reference') : result({ status: 'absent', edgeId });
      if (row.relation === 'source-component-occurrence') {
        const geometry = row.geometry;
        if (geometry?.status !== 'available') return result({ status: 'unavailable',
          reason: geometry?.reason || 'geometry-unavailable', reference: row.occurrence });
        const projection = geometry.projection;
        if (!equalReference(projection.reference, row.host) || projection.occurrenceId !== row.occurrence.id ||
            projection.source.sha256 !== row.sourceSha256 || !same(projection.pathIndices, row.strokeIndices)) {
          return invalid('geometry-host-mismatch');
        }
        return result({ status: 'available', kind: 'geometry', reference: row.host,
          node: { ...canonical(row.host), kanjiOccurrenceId: row.occurrence.id },
          host: row.host, occurrence: row.occurrence, sameHost: equalReference(from, row.host) });
      }
      if (row.relation === 'attested-word-occurrence') return result({ status: 'available',
        kind: 'example', reference: row.reference, word: row.word, tokenIndex: row.tokenIndex });
      const reference = equalReference(row.from, from) ? row.to : row.from;
      return result({ status: 'available', kind: reference.type, reference, node: canonical(reference) });
    }
    function example(reference, expected) {
      const resolved = resolve(reference, ['sentence-occurrence']);
      if (resolved.status !== 'available') return resolved;
      const row = examples.get(key(reference));
      if (!row) return invalid('example-join-missing');
      if (expected !== undefined && (!exactFields(expected,
        ['word', 'sentence', 'english', 'sourceAttribution'], ['register']) ||
        !validReference(expected.word, ['word']) || !equalReference(expected.word, row.word) ||
        expected.sentence !== row.sentence || expected.english !== row.english ||
        !same(expected.sourceAttribution, row.sourceAttribution) ||
        (own(expected, 'register') && !string(expected.register)))) return invalid('course-example-mismatch');
      return result({ ...row, status: 'available', tokens: row.rawRow[0],
        citations: citations(row.evidence),
        ...(expected && own(expected, 'register') ? { register: expected.register } : {}),
        exposures: exposureRows([{ about: row.word, reveals: ['reading', 'meaning'] }], 'family-example'),
      });
    }
    function exampleTarget(reference, tokenIndex) {
      const row = example(reference);
      if (row.status !== 'available') return row;
      if (!Number.isSafeInteger(tokenIndex) || tokenIndex !== row.tokenIndex) return invalid('not-selected-occurrence');
      return result({ status: 'available', kind: 'word', reference: row.word,
        node: canonical(row.word), example: row.reference, tokenIndex });
    }
    return Object.freeze({ view, destination, example, exampleTarget });
  }
  return Object.freeze({ createModel, createNavigation });
});
