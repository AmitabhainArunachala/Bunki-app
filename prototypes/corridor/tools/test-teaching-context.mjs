/** Actual exported projection and version 1 reading compatibility. No browser.
 * Supply --site (or KAIRO_SITE_DIR); --baseline-site adds byte comparison
 * against an immutable earlier artifact, never a rebuilt expected fixture. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2), options = {};
for (let index = 0; index < args.length; index += 2) {
  if (!['--site', '--baseline-site', '--evidence-out'].includes(args[index]) || !args[index + 1]) {
    throw new Error('Usage: node test-teaching-context.mjs --site /staged/site [--baseline-site /immutable/site] [--evidence-out /external/new/directory]');
  }
  options[args[index]] = resolve(args[index + 1]);
}
const site = options['--site'] || (process.env.KAIRO_SITE_DIR && resolve(process.env.KAIRO_SITE_DIR));
if (!site) throw new Error('An explicitly staged site is required; this verifier does not build into the repository');
const out = options['--evidence-out'];
if (out) {
  const inside = relative(repo, out);
  if (!inside || !isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`)) throw new Error('Evidence must be outside the repository');
  mkdirSync(out, { recursive: false });
}
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = value => JSON.stringify(value);
const clone = value => JSON.parse(bytes(value));
const dimensions = ['lexis', 'readings', 'syntax', 'production'];
const cell = (seen, right, obsSeen = 0, obsRight = 0) => ({ seen, right, obsSeen, obsRight });
function band(levels = {}, edge = null, sampled = false, disagreement = false) {
  return { levels, edge, sampled, disagreement,
    measured: Object.values(levels).reduce((sum, value) => sum + value.seen, 0),
    observed: Object.values(levels).reduce((sum, value) => sum + value.obsSeen, 0) };
}
function model(bands = {}) {
  return { modelVersion: 2, admissionPolicyVersion: 'kagami-admission/2',
    bands: Object.fromEntries(dimensions.map(dimension => [dimension, bands[dimension] || band()])) };
}
const results = [], compatibility = [];
function check(name, run) {
  try { const detail = run(); results.push({ name, pass: true, ...(detail === undefined ? {} : { detail }) }); }
  catch (error) { results.push({ name, pass: false, error: String(error.stack || error) }); }
  console.log(`${results.at(-1).pass ? 'PASS' : 'FAIL'} ${name}`);
}
function poison(object, keys) {
  for (const key of keys) Object.defineProperty(object, key, { enumerable: true,
    get() { throw new Error(`Unselected private field read: ${key}`); } });
  return object;
}

let controller, core, fatal;
try {
  controller = await import(pathToFileURL(resolve(site, 'reading-controller.mjs')));
  core = await import(pathToFileURL(resolve(site, 'modules/reading-core.mjs')));
  assert.equal(typeof controller.prepareTeachingContext, 'function', 'Staged controller must expose the actual teaching projection');
  assert.equal(typeof core.projectGenerationBands, 'function', 'Staged reading core must expose the shared validated policy');
  const prepare = controller.prepareTeachingContext;
  check('Unassessed input has four sparse dimensions and no learner-level claim', () => {
    const empty = prepare();
    assert.equal(empty.kind, 'derived-learning-context');
    assert.equal(empty.modelVersion, 'kagami-unassessed');
    assert.equal(empty.admissionPolicyVersion, null);
    assert.deepEqual(empty.bands.map(row => row.dimension), dimensions);
    assert(empty.bands.every(row => row.workingBand === null && row.evidence === 'sparse' && !row.observedSignalsPresent && row.cells.length === 0));
  });
  check('Chosen deck tags and private model fields are never selected', () => {
    const selected = model();
    poison(selected, ['taken', 'srs', 'revlog', 'obslog', 'notes', 'credentials', 'nodes', 'frontier', 'edges', 'sourceContent', 'toJSON']);
    assert.deepEqual(prepare({ model: selected }).bands, prepare({ model: model() }).bands);
  });
  check('Derivation metadata is fixed and rejects arbitrary or unsupported labels', () => {
    for (const patch of [{ modelVersion: 'PRIVATE_NOTE' }, { modelVersion: 3 }, { modelVersion: Infinity },
      { admissionPolicyVersion: 'PRIVATE_SECRET' }, { admissionPolicyVersion: 'kagami-admission/2\nprivate' }]) {
      assert.throws(() => prepare({ model: { ...model(), ...patch } }));
    }
    assert.equal(prepare({ model: model() }).modelVersion, 'kagami/2');
  });
  check('Observed-only successes and even a bad sampled flag cannot produce measured evidence', () => {
    const selected = model({ lexis: band({ N1: cell(0, 0, 8, 8) }, 'N1', true) });
    const lexis = prepare({ model: selected }).bands[0];
    assert.equal(lexis.workingBand, null); assert.equal(lexis.evidence, 'sparse'); assert(lexis.observedSignalsPresent);
    assert.deepEqual(lexis.cells, [{ level: 'N1', measured: { seen: 0, right: 0 }, observed: { seen: 8, right: 8 } }]);
  });
  check('Four distinct dimensions and sampled-but-failing remain distinct', () => {
    const selected = model({
      lexis: band({ N1: cell(4, 4), N5: cell(4, 0) }, 'N1', true, true),
      readings: band({ N3: cell(4, 4) }, 'N3', true),
      syntax: band({ N5: cell(4, 0) }, null, true),
      production: band({ N5: cell(0, 0, 4, 1) }),
    });
    const value = prepare({ model: selected });
    assert.deepEqual(value.bands.map(row => [row.workingBand, row.evidence]), [['N1', 'conflicting'], ['N3', 'measured'], [null, 'measured'], [null, 'sparse']]);
    assert.deepEqual(value.bands[0].cells.map(row => row.level), ['N5', 'N1']);
    return value.bands;
  });
  check('Different lower-level conflicts keep different cells despite the same summary edge', () => {
    const a = prepare({ model: model({ lexis: band({ N5: cell(4, 0), N1: cell(4, 4) }, 'N1', true, true) }) });
    const b = prepare({ model: model({ lexis: band({ N4: cell(4, 0), N1: cell(4, 4) }, 'N1', true, true) }) });
    assert.equal(a.bands[0].workingBand, b.bands[0].workingBand);
    assert.notDeepEqual(a.bands[0].cells, b.bands[0].cells);
  });
  check('Same-shaped correction is read afresh and prior returned context remains immutable', () => {
    const selected = model({ lexis: band({ N5: cell(4, 4) }, 'N5', true) });
    const before = prepare({ model: selected }), beforeBytes = bytes(before);
    selected.bands.lexis.levels.N5.right = 2; selected.bands.lexis.edge = null;
    const after = prepare({ model: selected });
    assert.equal(after.bands[0].workingBand, null);
    assert.equal(after.bands[0].cells[0].measured.seen, 4);
    assert.equal(after.bands[0].cells[0].measured.right, 2);
    assert.equal(bytes(before), beforeBytes);
    assert.notEqual(bytes(after), beforeBytes);
    assert.deepEqual(after, prepare({ model: selected }));
  });
  check('Cell projection names known levels and leaves unrelated data unread', () => {
    const selected = model({ lexis: band({ N5: cell(4, 3), oov: cell(2, 1) }, 'N5', true) });
    poison(selected.bands, ['privateDimension']);
    poison(selected.bands.lexis, ['notes', 'credentials']);
    poison(selected.bands.lexis.levels, ['privateLevel']);
    poison(selected.bands.lexis.levels.N5, ['quote', 'sourceDigest']);
    assert.deepEqual(prepare({ model: selected }).bands[0].cells.map(row => row.level), ['N5', 'oov']);
  });
  check('Invalid, inconsistent and unbounded counts fail closed', () => {
    for (const bad of [-1, 0.5, Infinity, NaN, '4', 10_000_001]) {
      const selected = model({ lexis: band({ N5: cell(4, 3) }, 'N5', true) });
      selected.bands.lexis.levels.N5.seen = bad;
      assert.throws(() => prepare({ model: selected }));
    }
    assert.throws(() => prepare({ model: model({ lexis: band({ N5: cell(4, 5) }, 'N5', true) }) }));
    const totals = model({ lexis: band({ N5: cell(4, 3) }, 'N5', true) });
    totals.bands.lexis.measured = 5;
    assert.throws(() => prepare({ model: totals }));
  });
  check('Frontier keeps observed, measured and mixed provenance without private fields', () => {
    const targets = ['observed', 'measured', 'mixed'].map((provenance, index) => poison({ kind: 'word', form: ['学校', '天気', '文化'][index], provenance }, ['notes', 'source', 'credential', 'toJSON']));
    const value = prepare({ model: model(), targets });
    assert.deepEqual(value.targets, [{ kind: 'word', form: '学校', provenance: 'observed' }, { kind: 'word', form: '天気', provenance: 'measured' }, { kind: 'word', form: '文化', provenance: 'mixed' }]);
    assert.throws(() => prepare({ model: model(), targets: [{ kind: 'word', form: '学校', provenance: 'mastered' }] }));
  });
  check('Confusions remain observed and reversed duplicate pairs are removed', () => {
    const pair = { kind: 'kanji', form: '歩', otherKind: 'kanji', otherForm: '足', provenance: 'observed' };
    const reverse = { ...pair, form: '足', otherForm: '歩' };
    assert.deepEqual(prepare({ model: model(), confusions: [pair, reverse] }).confusions, [pair]);
    assert.throws(() => prepare({ model: model(), confusions: [{ ...pair, provenance: 'measured' }] }));
    assert.throws(() => prepare({ model: model(), confusions: [{ ...pair, otherForm: '歩' }] }));
  });
  check('Only the first six targets and four pairs are inspected, with fixed output caps', () => {
    const targets = Array.from({ length: 6 }, (_, index) => ({ kind: 'word', form: `語${index}`, provenance: 'observed' }));
    const confusions = Array.from({ length: 4 }, (_, index) => ({ kind: 'word', form: `語${index}`, otherKind: 'word', otherForm: `別${index}`, provenance: 'observed' }));
    Object.defineProperty(targets, '6', { get() { throw new Error('Unselected target read'); } });
    Object.defineProperty(confusions, '4', { get() { throw new Error('Unselected pair read'); } });
    const value = prepare({ model: model(), targets, confusions });
    assert.equal(value.targets.length, 6); assert.equal(value.confusions.length, 4);
    assert.equal(prepare({ model: model(), targets: [targets[0], targets[0]] }).targets.length, 1);
  });
  check('Selected forms are bounded primitives with known kinds and single-scalar kanji', () => {
    const target = { kind: 'word', form: '学'.repeat(80), provenance: 'observed' };
    assert.equal(prepare({ model: model(), targets: [target] }).targets[0].form.length, 80);
    assert.equal(prepare({ model: model(), targets: [{ kind: 'kanji', form: '𠀀', provenance: 'observed' }] }).targets[0].form, '𠀀');
    for (const form of ['', ' 学校', '学'.repeat(81), '学校\n秘密', '\ud800']) assert.throws(() => prepare({ model: model(), targets: [{ ...target, form }] }));
    assert.throws(() => prepare({ model: model(), targets: [{ ...target, kind: 'source', form: '学校' }] }));
    assert.throws(() => prepare({ model: model(), targets: [{ ...target, kind: 'kanji', form: '学校' }] }));
  });
  check('Largest permitted selections remain below 8,000 serialized characters', () => {
    const levels = Object.fromEntries(['N5', 'N4', 'N3', 'N2', 'N1', 'oov'].map(level => [level, cell(1_000_000, 999_999, 1_000_000, 999_999)]));
    const selected = model(Object.fromEntries(dimensions.map(dimension => [dimension, band(levels, 'N1', true)])));
    const value = prepare({ model: selected,
      targets: Array.from({ length: 6 }, (_, index) => ({ kind: 'word', form: `${index}${'"'.repeat(79)}`, provenance: 'mixed' })),
      confusions: Array.from({ length: 4 }, (_, index) => ({ kind: 'word', form: `${index}${'\\'.repeat(79)}`, otherKind: 'word', otherForm: `${index}${'"'.repeat(79)}`, provenance: 'observed' })) });
    assert(bytes(value).length <= 8000); assert(value.bands.every(row => row.cells.length === 6));
    return { serializedCharacters: bytes(value).length };
  });
  check('Returned nested arrays and objects are frozen clones and input is unchanged', () => {
    const input = { model: model({ lexis: band({ N5: cell(4, 3) }, 'N5', true) }), targets: [{ kind: 'word', form: '学校', provenance: 'measured' }] };
    const before = bytes(input), value = prepare(input);
    assert.throws(() => { value.bands[0].cells[0].measured.right = 0; }, TypeError);
    assert.throws(() => { value.targets.push({}); }, TypeError);
    assert.throws(() => { value.targets[0].form = '秘密'; }, TypeError);
    assert.equal(bytes(input), before);
  });
  check('Shared public band export validates dimensions and excludes extra payload fields', () => {
    assert.throws(() => core.projectGenerationBands([{ dimension: 'lexis', edge: null, measured: 0, observed: 0, sampled: false, disagreement: false, rawNotes: 'private' }]));
    const selected = { dimension: 'lexis', edge: 'N5', measured: 4, observed: 0, sampled: true, disagreement: false };
    assert.throws(() => core.projectGenerationBands([selected, selected]));
    const value = core.projectGenerationBands([selected]);
    assert.equal(value.length, 4); assert(Object.isFrozen(value));
  });

  if (options['--baseline-site']) {
    const baseline = await import(pathToFileURL(resolve(options['--baseline-site'], 'reading-controller.mjs')));
    for (const [name, selected] of Object.entries({ empty: model(), conflicting: model({ lexis: band({ N5: cell(4, 0), N1: cell(4, 4) }, 'N1', true, true) }), observed: model({ production: band({ N5: cell(0, 0, 4, 3) }) }) })) {
      check(`Version 1 ${name} reading request/candidate/saved bytes match the immutable baseline`, () => {
        const input = { owner: { learnerId: 'synthetic-learner', sessionEpoch: 'synthetic-epoch' }, job: { id: 'synthetic-job', revision: 0 },
          createdAt: '2026-09-14T00:00:00.000Z', modelId: 'synthetic-model', settings: { ...controller.DEFAULT_READING_SETTINGS, length: 'short', interests: ['自然', '文学', '自然'] },
          model: selected, targets: [{ kind: 'word', form: '学校', reason: 'recent-struggle' }], recentArticleIds: ['old-reading'], recentTopics: ['自然'] };
        const request = controller.prepareReadingRequest(input), oldRequest = baseline.prepareReadingRequest(input);
        assert.equal(bytes(request), bytes(oldRequest));
        const context = { completedAt: '2026-09-14T00:00:01.000Z', provider: 'stub.invalid', actualModel: 'synthetic-model', capabilities: controller.originalReadingCapabilities('2026-09-14T00:00:01.000Z') };
        const boundary = { isCurrent: () => true, lookupWord: () => null };
        const raw = bytes({ title: '自然を学ぶ', text: '学校で自然を学ぶ。木の葉を見て、新しい言葉を友だちと話した。', suggestedWords: [], references: [] });
        const candidate = controller.acceptReadingResponse(raw, request, context, boundary), oldCandidate = baseline.acceptReadingResponse(raw, oldRequest, context, boundary);
        assert.equal(bytes(candidate), bytes(oldCandidate));
        const saved = controller.savedReading(candidate, request.brief, context.completedAt), oldSaved = baseline.savedReading(oldCandidate, oldRequest.brief, context.completedAt);
        assert.equal(bytes(saved), bytes(oldSaved));
        assert.equal(bytes(controller.parseSavedReading(clone(oldSaved))), bytes(oldSaved));
        const detail = { name, requestSha256: sha(bytes(request)), savedSha256: sha(bytes(saved)) }; compatibility.push(detail); return detail;
      });
    }
  }
} catch (error) { fatal = String(error.stack || error); }

const identity = existsSync(resolve(site, 'build-identity.json')) ? JSON.parse(readFileSync(resolve(site, 'build-identity.json'), 'utf8')) : null;
const receipt = { suite: 'actual-teaching-context-exports', pass: !fatal && results.length > 0 && results.every(row => row.pass),
  site, artifactSha256: identity?.artifactSha256 || null, node: process.version, results, compatibility,
  compatibilityStatus: options['--baseline-site'] ? 'executed' : 'not-requested', ...(fatal ? { fatal } : {}),
  controllerSha256: sha(readFileSync(resolve(site, 'reading-controller.mjs'))), coreSha256: sha(readFileSync(resolve(site, 'modules/reading-core.mjs'))),
  verifierSha256: sha(readFileSync(fileURLToPath(import.meta.url))), browsers: 0, providerRequests: 0,
  scope: 'Actual staged exports, synthetic selected model inputs and optional actual prior artifact byte comparison. No learnerModel admission, UI, transport, scheduler, or live teaching acceptance.' };
if (out) writeFileSync(resolve(out, 'result.json'), `${JSON.stringify(receipt, null, 2)}\n`);
console.log(`${results.filter(row => row.pass).length}/${results.length} passed; legacy compatibility: ${receipt.compatibilityStatus}`);
if (fatal) console.error(fatal);
for (const row of results.filter(row => !row.pass)) console.error(row.error);
process.exitCode = receipt.pass ? 0 : 1;
