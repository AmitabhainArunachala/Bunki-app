/**
 * Offline inventory of the shipped reference inputs. No build, network or learner state.
 * node prototypes/corridor/tools/inventory-kanji-library.mjs --out /absolute/external/inventory.json
 * Optional --family prototypes/corridor/data/share_alike/kanji-family.json; absent is explicit.
 * Input bytes, not Git HEAD alone, identify this snapshot. No clock or locale-dependent sorting.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import process from 'node:process';
import console from 'node:console';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const BASE = 'prototypes/corridor';
const DATA = `${BASE}/data`;
const DEFAULT_FAMILY = `${DATA}/share_alike/kanji-family.json`;
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sorted = values => [...values].sort(compare);
const unique = values => sorted(new Set(values));
const sum = values => values.reduce((a, b) => a + b, 0);
const histogram = values => Object.fromEntries(unique(values).map(value =>
  [value, values.filter(item => item === value).length]));
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export const serialize = value => `${JSON.stringify(value, null, 2)}\n`;

export function partitionEntries(catalog, type) {
  const entries = new Map();
  for (const collection of catalog.collections) for (const entry of collection.entries) {
    if (entry.type !== type) continue;
    const key = entry.key;
    assert.equal(typeof key, 'string', 'catalog identity missing');
    if (entries.has(key)) assert.deepEqual(entries.get(key), entry, `conflicting catalog identity ${key}`);
    entries.set(key, entry);
  }
  const rows = [...entries.values()].sort((a, b) => compare(a.key, b.key));
  return { rows, canonical: rows.filter(row => row.canonicalTarget),
    referenceOnly: rows.filter(row => !row.canonicalTarget) };
}

// These are printed source occurrences, not dictionary or scheduler IDs.
// Unicode-scalar offsets deliberately differ from JavaScript UTF-16 offsets.
export function tokenOccurrences(article, sourceSha256) {
  assert(Array.isArray(article.tokens) && typeof article.id === 'string', 'article schema');
  const rows = [];
  article.tokens.forEach((token, tokenIndex) => {
    assert.equal(typeof token.s, 'string', 'token surface missing');
    [...token.s].forEach((literal, scalarIndex) => {
      if (!/\p{Script=Han}/u.test(literal)) return;
      rows.push({ id: ['bundled-passage', article.id, sourceSha256, tokenIndex, scalarIndex],
        literal, tokenIndex, scalarIndex, surface: token.s, lemma: token.b ?? null,
        reading: token.r ?? null, readingSource: token.rs ?? article.rubySource ?? null });
    });
  });
  return rows;
}

export function validateContextRow(offset, row, article, detailSenses) {
  const tokenIndex = Number(offset);
  assert(/^(0|[1-9][0-9]*)$/u.test(String(offset)) && Number.isInteger(tokenIndex) &&
    article.tokens[tokenIndex], 'orphan contextual sense');
  assert(Array.isArray(row), 'contextual row must retain its array schema');
  const type = ['name', 'reading'].includes(row[0]) ? row[0] : 'sense';
  if (type === 'sense') assert(Number.isInteger(row[1]) && row[1] >= 0 &&
    row[1] < detailSenses.get(row[0]), 'context sense outside pinned dictionary');
  return { tokenIndex, type };
}

export function summarizeFamily(family) {
  if (family === null) return { status: 'absent', authoredEdges: 0,
    independentlyVerifiedSoundMeaningEdges: null,
    reason: 'No family asset supplied; no phonetic or semantic roles inferred from parts/readings.' };
  assert.equal(family.schemaVersion, 1, 'unsupported family schema');
  assert(family.family && Array.isArray(family.family.members), 'family members missing');
  assert(Array.isArray(family.edges) && Array.isArray(family.examples), 'family edges/examples missing');
  assert(Array.isArray(family.nodes), 'family nodes missing');
  const sources = family.sources ?? family.sourceLedger;
  assert(Array.isArray(sources), 'family source ledger missing');
  const sourceIds = new Set();
  for (const source of sources) {
    assert(typeof source.id === 'string' && source.id && !sourceIds.has(source.id), 'family source identity');
    assert(typeof source.kind === 'string' && source.kind, 'family source kind missing');
    sourceIds.add(source.id);
  }
  const nodeKeys = new Set();
  const nodeKey = node => {
    if (node?.type === 'word') {
      assert(typeof node.reading === 'string' && node.reading.length > 0,
        'family word reference needs exact reading');
      return JSON.stringify([node.type, node.id, node.reading]);
    }
    return JSON.stringify([node?.type, node?.id]);
  };
  for (const node of family.nodes) {
    assert(typeof node.reference?.type === 'string' && typeof node.reference?.id === 'string',
      'family node identity');
    assert(!nodeKeys.has(nodeKey(node.reference)), 'duplicate family node');
    nodeKeys.add(nodeKey(node.reference));
  }
  const ids = new Set();
  const relationTypes = new Set(['phonetic-component', 'semantic-component',
    'source-component-occurrence', 'word-contains-kanji', 'attested-word-occurrence']);
  for (const edge of family.edges) {
    assert(typeof edge.id === 'string' && !ids.has(edge.id), 'duplicate/missing family edge ID');
    ids.add(edge.id);
    assert(relationTypes.has(edge.relation), `unrecognized family relation ${edge.relation}`);
    for (const node of [edge.from, edge.to]) {
      assert(node && typeof node.type === 'string' && typeof node.id === 'string', 'family endpoint missing');
      assert(nodeKeys.has(nodeKey(node)), 'family endpoint absent from nodes');
    }
    assert(Array.isArray(edge.evidence) && edge.evidence.length > 0, 'family edge lacks evidence');
    assert(edge.evidence.every(row => sourceIds.has(row.sourceId) &&
      typeof row.locator === 'string' && row.locator.trim()), 'family evidence lacks known source/locator');
  }
  return { status: 'authored-asset-present', family: family.family,
    nodes: family.nodes.length, nodeKinds: histogram(family.nodes.map(row => row.reference.type)),
    nodeReferences: family.nodes.map(row => row.reference),
    members: family.family.members.length,
    authoredEdges: family.edges.length, byRelation: histogram(family.edges.map(row => row.relation)),
    edgeIds: sorted(ids), examples: family.examples.length,
    exampleBindings: family.examples.map(row => ({
      reference: row.reference, word: row.word, evidence: row.evidence,
      contextualSenseId: row.contextualSenseId ?? null,
      characterReadingAlignment: row.characterReadingAlignment ?? null,
      originalCorpusSentenceId: row.originalCorpusSentenceId ?? null,
      missing: row.missing ?? null,
    })),
    sourceLedger: sources, sourceKinds: histogram(sources.map(row => row.kind)),
    independentlyVerifiedSoundMeaningEdges: null,
    historicalFormGeometry: null,
    limitation: 'Counts source assertions with locators, not independent linguistic acceptance. Etymology prose does not establish historical geometry.' };
}

export function createInventoryReader(root) {
  const pins = new Map();
  function read(path) {
    assert(!isAbsolute(path) && !path.split(/[\\/]/u).includes('..'), 'input must be repository-relative');
    const absolute = resolve(root, path);
    const bytes = readFileSync(absolute);
    const pin = { path, sha256: sha256(bytes), bytes: bytes.length };
    if (pins.has(path)) assert.deepEqual(pin, pins.get(path), `input changed between reads: ${path}`);
    pins.set(path, pin);
    return bytes;
  }
  return { read, json: path => JSON.parse(read(path).toString('utf8')), pins,
    module(path) {
      const module = { exports: {} };
      vm.runInNewContext(read(path).toString('utf8'), { module }, { filename: path });
      return module.exports;
    },
    verify() {
      for (const pin of pins.values()) assert.equal(sha256(readFileSync(resolve(root, pin.path))),
        pin.sha256, `input changed during inventory: ${pin.path}`);
    } };
}

export function inventory(root = ROOT, { familyPath = DEFAULT_FAMILY } = {}) {
  const load = createInventoryReader(root);
  load.read(`${BASE}/tools/inventory-kanji-library.mjs`);
  const core = load.module(`${BASE}/reference-core.js`);
  const structure = load.module(`${BASE}/kanji-structure.js`);
  const course = load.module(`${BASE}/kanji-course.js`).catalog();
  const kanji = load.json(`${DATA}/share_alike/kanji.json`);
  const strokes = load.json(`${DATA}/share_alike/strokes.json`);
  const words = load.json(`${DATA}/share_alike/words.json`);
  const dict = load.json(`${DATA}/share_alike/dict.json`);
  const kanken = load.json(`${DATA}/proprietary_safe/kanken.json`);
  const extra = load.json(`${DATA}/share_alike/reference-extra.json`);
  assert(core.validateKanjiFacts(extra), 'reference facts fail actual validator');
  const catalog = core.createCatalog({ kanji: kanji.kanji, kmeta: strokes.meta,
    words: words.words, dict: dict.words, kanken: kanken.levels, extra });
  const k = partitionEntries(catalog, 'kanji');
  const w = partitionEntries(catalog, 'word');
  const canonical = new Set(k.canonical.map(row => row.id));
  assert.deepEqual(sorted(canonical), sorted(Object.keys(kanji.kanji)));
  const catalogGlyphs = new Set(k.rows.filter(row => !row.missingGlyph).map(row => row.id));
  const facts = new Set(extra.kanjiFacts.map(row => row[0]));
  const grouping = load.json(`${DATA}/share_alike/kanji-structure.json`);
  const model = structure.createModel({ kanji: kanji.kanji, strokes: strokes.strokes, grouping });
  const sourceManifestPath = `${BASE}/tools/fixtures/kanji-structure/source/source-manifest.json`;
  const sourceManifest = load.json(sourceManifestPath);
  for (const source of sourceManifest.files) {
    const bytes = load.read(`${dirname(sourceManifestPath)}/${source.file}`);
    assert.equal(sha256(bytes), source.sha256, 'retained SVG source hash');
    assert.equal(bytes.length, source.bytes, 'retained SVG source size');
    assert.equal(grouping.characters[source.literal]?.source.sha256, source.sha256, 'grouping source pin');
  }
  assert.deepEqual(sorted(sourceManifest.files.map(row => row.literal)), sorted(Object.keys(grouping.characters)));
  const structures = sorted(Object.keys(grouping.characters)).map(literal => {
    const view = model.inspect(literal);
    return { literal, grouping: view.grouping, strokes: view.strokeCount,
      occurrences: view.occurrences.map(row => ({ id: row.id, groupPath: row.groupPath,
        reference: row.reference, parentId: row.parentId, strokeIndices: row.strokeIndices })),
      namedLabels: histogram(view.occurrences.filter(row => row.reference).map(row => row.reference.id)) };
  });

  const dictionary = load.json(`${DATA}/share_alike/dict-v2/index.json`);
  assert.equal(dictionary.schemaVersion, 3, 'dictionary index schema');
  const dictionarySequences = new Map();
  for (const row of dictionary.entries) {
    assert(Array.isArray(row) && /^\d+$/u.test(row[0]) && Array.isArray(row[5]), 'dictionary index row schema');
    assert(!dictionarySequences.has(row[0]), 'duplicate JMdict sequence');
    dictionarySequences.set(row[0], row);
  }
  const detailSenses = new Map();
  let detailEntries = 0;
  let detailSenseCount = 0;
  for (let shard = 0; shard < dictionary.shardCount; shard += 1) {
    const path = `${DATA}/share_alike/dict-v2/${shard.toString(16).padStart(2, '0')}.json`;
    const doc = load.json(path);
    assert.equal(doc.sourcePin, dictionary.source.pin, 'dictionary detail pin');
    assert(Array.isArray(doc.entries), 'dictionary detail entries missing');
    for (const row of doc.entries) {
      assert(Array.isArray(row) && Array.isArray(row[3]), 'dictionary detail sense schema');
      assert(dictionarySequences.has(row[0]) && !detailSenses.has(row[0]), 'missing/duplicate detail identity');
      detailSenses.set(row[0], row[3].length);
      detailEntries += 1;
      detailSenseCount += row[3].length;
    }
  }
  assert.equal(detailEntries, dictionarySequences.size, 'dictionary index/detail membership');
  assert.equal(detailSenseCount, dictionary.counts.selectedSenses, 'dictionary declared/local sense disagreement');
  const index = load.json(`${DATA}/articles/index.json`);
  const senses = load.json(`${DATA}/articles/senses.json`);
  assert.equal(senses.pin, dictionary.source.pin, 'contextual sense source revision');
  const articleIds = new Set();
  const glyphOccurrences = new Map();
  const articleRows = [];
  const senseRows = [];
  const occurrenceHash = createHash('sha256');
  let tokenCount = 0;
  let totalOccurrences = 0;
  for (const item of index.articles) {
    assert(!articleIds.has(item.id), 'duplicate article ID');
    articleIds.add(item.id);
    assert(typeof item.file === 'string' && !item.file.includes('/') && !item.file.includes('..'), 'article filename');
    const path = `${DATA}/articles/${item.file}`;
    const article = load.json(path);
    assert.equal(article.id, item.id, 'article identity differs from index');
    const pin = load.pins.get(path);
    const occurrences = tokenOccurrences(article, pin.sha256);
    tokenCount += article.tokens.length;
    totalOccurrences += occurrences.length;
    const articleSenses = senses.articles[item.id] || {};
    for (const [offset, row] of Object.entries(articleSenses)) {
      const { tokenIndex, type } = validateContextRow(offset, row, article, detailSenses);
      senseRows.push([item.id, tokenIndex, type, row]);
    }
    for (const row of occurrences) {
      occurrenceHash.update(`${JSON.stringify([row.id, row.literal])}\n`);
      if (!glyphOccurrences.has(row.literal)) glyphOccurrences.set(row.literal,
        { literal: row.literal, occurrences: 0, articles: new Set(), withTokenReading: 0,
          withExplicitContextRow: 0, examples: [] });
      const glyph = glyphOccurrences.get(row.literal);
      glyph.occurrences += 1;
      glyph.articles.add(item.id);
      if (row.reading) glyph.withTokenReading += 1;
      if (own(articleSenses, String(row.tokenIndex))) glyph.withExplicitContextRow += 1;
      if (glyph.examples.length < 3) glyph.examples.push({ ...row,
        contextualSelection: articleSenses[row.tokenIndex] ?? null });
    }
    articleRows.push({ id: item.id, path, sha256: pin.sha256, tokens: article.tokens.length,
      hanOccurrences: occurrences.length, uniqueHan: unique(occurrences.map(row => row.literal)).length,
      explicitContextRows: Object.keys(articleSenses).length,
      source: article.source ?? item.source ?? null, url: article.url ?? item.url ?? null,
      date: article.date ?? item.date ?? null, licence: article.licence ?? item.licence ?? null,
      attribution: article.attribution ?? item.attribution ?? null,
      rubySource: article.rubySource ?? item.rubySource ?? null });
  }
  assert(Object.keys(senses.articles).every(id => articleIds.has(id)), 'sense article absent from library');
  const sourceGlyphs = new Set(glyphOccurrences.keys());
  const allGlyphs = unique([...catalogGlyphs, ...facts, ...Object.keys(strokes.strokes), ...sourceGlyphs]);
  const formRecords = extra.kanken;
  const members = Object.entries(kanji.kanji).flatMap(([id, row]) => row.parts.map(part => [id, part]));
  const semantic = load.json(`${DATA}/proprietary_safe/sem.json`);
  const familyExists = existsSync(resolve(root, familyPath));
  const familyData = familyExists ? load.json(familyPath) : null;
  const family = summarizeFamily(familyData);
  if (familyData) {
    for (const source of family.sourceLedger) {
      if (!['retained-file', 'retained-svg'].includes(source.kind)) continue;
      const bytes = load.read(source.path);
      assert.equal(sha256(bytes), source.sha256, `family retained source hash: ${source.id}`);
      assert.equal(bytes.length, source.bytes, `family retained source bytes: ${source.id}`);
    }
    load.module(`${BASE}/kanji-family.js`).createModel({
      data: familyData, kanji: kanji.kanji, words: words.words, structure: model,
    });
    family.runtimeJoinValidation = 'Actual kanji-family.createModel with current kanji/words and source structure; not linguistic acceptance.';
  }
  const report = {
    schemaVersion: 1, kind: 'bunki-kanji-library-source-inventory',
    source: { gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      basis: 'Exact working-tree input bytes; HEAD is context, not a claim all inputs were committed.',
      nativeEvidence: false },
    identityPolicy: catalog.policy,
    identities: {
      canonicalKanji: { denominator: 'Exact kanji.json keys accepted by reference-core canonicalTarget',
        count: k.canonical.length, ids: k.canonical.map(row => row.id) },
      referenceOnlyKanji: { denominator: 'Unique catalog entries without canonicalTarget, including glyphless source IDs',
        count: k.referenceOnly.length, glyphCount: k.referenceOnly.filter(row => !row.missingGlyph).length,
        glyphlessCount: k.referenceOnly.filter(row => row.missingGlyph).length,
        ids: k.referenceOnly.map(row => row.id) },
      catalogKanji: k.rows.length,
      dictionaryFactLiterals: facts.size,
      factOnlyNotCatalog: sorted([...facts].filter(id => !catalogGlyphs.has(id))),
      canonicalWithoutFacts: sorted([...canonical].filter(id => !facts.has(id))),
      catalogWithoutFacts: sorted([...catalogGlyphs].filter(id => !facts.has(id))),
      vocabulary: { catalogFormReadingPairs: w.rows.length, canonicalPairs: w.canonical.length,
        referenceOnlyPairs: w.referenceOnly.length,
        rule: 'Actual catalog key; exact form/reading. No splitting alternatives or homograph merging.' },
      glyphRows: allGlyphs.map(id => ({ id, canonical: canonical.has(id), catalog: catalogGlyphs.has(id),
        referenceFacts: facts.has(id), geometry: own(strokes.strokes, id),
        sourceGrouping: own(grouping.characters, id), bundledSourceOccurrences: glyphOccurrences.get(id)?.occurrences || 0 })),
    },
    readingsAndSenses: {
      kanjiReadingRows: extra.kanjiReadings.length,
      kanjiReadingStrings: sum(extra.kanjiReadings.map(row => row[1].length + row[2].length)),
      officialReadingAdditions: extra.officialReadings.length,
      catalogGlyphsWithoutReading: k.rows.filter(row => !row.missingGlyph && row.missingReading).map(row => row.id),
      dictionary: { actualIndexEntries: dictionary.entries.length, actualDetailEntries: detailEntries,
        actualDetailSenses: detailSenseCount,
        actualKanaFormRows: sum(dictionary.entries.map(row => row[5].length)),
        sourceDeclaredCounts: dictionary.counts,
        source: dictionary.source, selection: dictionary.selection,
        limitation: 'Local selected JMdict corpus, not the entire upstream dictionary; index source counts remain declarations.' },
      explicitContext: { rows: senseRows.length, byKind: histogram(senseRows.map(row => row[2])),
        layout: ['articleId', 'tokenIndex', 'kind', 'unchangedSidecarRow'], records: senseRows,
        limitation: 'Explicit sidecar selections only; rule-resolved runtime senses are not executed or inferred. Name/reading rows are not lexical senses.' },
    },
    sourceOccurrences: {
      scope: 'All current articles/index.json files; token surfaces, not lemma expansion. Private/imported/personal texts, standalone decks and the full examples corpus are not inventoried. Selected family example bindings are separate.',
      identity: ['bundled-passage', 'article.id', 'article-file-sha256', 'tokenIndex', 'Unicode-scalar-index-within-token'],
      identityUse: 'Inventory-only coordinates over existing source/token identities; not new persisted app, card, lexical or scheduler IDs.',
      detection: 'Unicode Script=Han on exact token.s, no normalization; this is not a semantic character classification.',
      articles: articleRows.length, tokens: tokenCount, hanOccurrences: totalOccurrences,
      uniqueHan: sourceGlyphs.size, orderedOccurrenceKeysSha256: occurrenceHash.digest('hex'),
      canonicalWithOccurrence: [...canonical].filter(id => sourceGlyphs.has(id)).length,
      canonicalWithoutOccurrence: sorted([...canonical].filter(id => !sourceGlyphs.has(id))),
      glyphs: sorted(sourceGlyphs).map(id => ({ ...glyphOccurrences.get(id),
        articles: glyphOccurrences.get(id).articles.size })),
      articleRows,
    },
    geometry: {
      glyphsWithPaths: Object.keys(strokes.strokes).length,
      orderedPaths: sum(Object.values(strokes.strokes).map(rows => rows.length)),
      canonicalWithPaths: [...canonical].filter(id => own(strokes.strokes, id)).length,
      canonicalWithoutPaths: sorted([...canonical].filter(id => !own(strokes.strokes, id))),
      groupedGlyphs: structures.length, groupOccurrences: sum(structures.map(row => row.occurrences.length)),
      groupedOrderedPaths: sum(structures.map(row => row.strokes)), structures,
      limitation: 'Exact current runtime-path parity and retained SVG hashes checked; no fresh upstream fetch, historical geometry or semantic/phonetic roles inferred.',
    },
    relationships: {
      listedComponents: { rows: members.length, ownerGlyphs: unique(members.map(row => row[0])).length,
        labels: unique(members.map(row => row[1])).length,
        rule: 'kanji.json:parts listed membership; not positioned occurrences, not a complete authored curriculum.' },
      sourceRelatedForms: { records: formRecords.length, glyphRows: formRecords.filter(row => row[1]).length,
        glyphlessRows: formRecords.filter(row => !row[1]).length,
        speciesIds: unique(formRecords.map(row => row[6]).filter(Boolean)).length,
        formLabels: histogram(formRecords.map(row => row[3])),
        collisionIds: k.rows.filter(row => row.identityCollision).map(row => row.id),
        historicalFormGeometryVerified: null,
        rule: 'Kentei source species/form labels only; not identity equivalence, historical decomposition or inherited reading/grade.' },
      wordSemanticTier: { heads: Object.keys(semantic.edges).length,
        edges: sum(Object.values(semantic.edges).map(rows => rows.length)), sources: semantic.sources,
        rule: 'Word-level editorial relationships; excluded from kanji phonetic/semantic-component coverage.' },
      family: { path: familyPath, ...family },
    },
    authoredCourse: { id: course.id, revision: course.revision, ...course.counts,
      targets: unique(course.units.flatMap(unit => unit.targets.map(target => target.kanji))),
      sources: course.sources, sourceTransfer: course.sourceTransfer,
      limitation: 'Primary/alternate word records include repeated words; course coverage is not decomposition, all readings, retention, or family acceptance.' },
    provenance: { kanji: kanji.sources, strokes: strokes.sources, reference: extra.sources,
      facts: extra.audit.kanjiFacts, readings: extra.audit.kanjiTrust,
      sourceAuditDeclarations: extra.audit.sourceHashes,
      grouping: grouping.source, retainedSvg: sourceManifest, articles: index.sources,
      licensingLimit: 'Source-declared terms retained verbatim, including unverified terms. This inventory is not legal clearance or a fresh upstream audit.' },
    missingCoverage: [
      'No complete authored decomposition outside retained groupings; listed membership does not supply occurrence order, position or roles.',
      'Phonetic/semantic family assertions require independent source/editorial review; asset presence is not that review.',
      'No verified historical-form geometry corpus or complete kanji etymology is established.',
      'Dictionary readings do not allocate a whole-word contextual reading to individual kanji automatically.',
      'Private, imported, own-text, personal deck and dynamically generated passages have no frozen inventory here.',
      'Contextual sidecar rows are not exhaustive sense disambiguation; runtime resolution and assistance are not executed.',
    ],
    inputs: sorted(load.pins.keys()).map(path => load.pins.get(path)),
  };
  load.verify();
  assert.equal(existsSync(resolve(root, familyPath)), familyExists, 'family presence changed during inventory');
  return report;
}

export function writeExternal(report, out, root = ROOT) {
  assert(isAbsolute(out), '--out must be absolute');
  const outside = path => { const rel = relative(realpathSync(root), path);
    assert(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel), '--out must be outside repository'); };
  outside(resolve(out));
  mkdirSync(dirname(out), { recursive: true });
  outside(resolve(realpathSync(dirname(out)), out.split(sep).at(-1)));
  if (existsSync(out)) outside(realpathSync(out));
  writeFileSync(out, serialize(report));
}

export function main(args = process.argv.slice(2)) {
  let out;
  let familyPath = DEFAULT_FAMILY;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--out') out = args[++i];
    else if (args[i] === '--family') familyPath = args[++i];
    else throw new Error(`Unknown argument: ${args[i]}`);
  }
  assert(out, 'Required: --out /absolute/external/inventory.json');
  if (familyPath !== DEFAULT_FAMILY) assert(existsSync(resolve(ROOT, familyPath)), 'explicit family input missing');
  const report = inventory(ROOT, { familyPath });
  writeExternal(report, out);
  console.log(JSON.stringify({ out, sha256: sha256(serialize(report)),
    canonicalKanji: report.identities.canonicalKanji.count,
    referenceOnlyKanji: report.identities.referenceOnlyKanji.count,
    groupedGlyphs: report.geometry.groupedGlyphs, family: report.relationships.family.status }));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
