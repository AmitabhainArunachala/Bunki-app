import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { englishSourcePins, englishExpectations, ENGLISH_ROOT, assertEnglishSource,
  observeEnglish, judgeEnglishSnapshot, installEnglishMonitor } from './reader-english-rung.mjs';
import { ENGLISH_CONTROLS, CONTROL_EXPECTATION, syntheticEnglishSnapshot, syntheticEnglishBaseline,
  runPureEnglishControls, syntheticEnglishReceipt, pureMonitorFixture, controlExpectation } from './reader-english-rung-controls.mjs';
import { validateNativeReaderEnglishRung, batteryGates } from '../../../scripts/verify-release-gates.mjs';
import { supplementalGates } from '../../../scripts/ci/supplemental.mjs';
const pins = englishSourcePins(), entries = englishExpectations(), artifact = 'a'.repeat(64);
const sha = path => createHash('sha256').update(readFileSync(resolve(ENGLISH_ROOT, path))).digest('hex');
const json = path => JSON.parse(readFileSync(resolve(ENGLISH_ROOT, path), 'utf8'));
const fixture = json('prototypes/corridor/tools/reader-english-rung-expectations.json');

test('31 proposals cite exact source bytes, token/ruby boundaries and raw dictionary senses', () => {
  assert.equal(entries.length, 31);
  assert.equal(entries.filter(e => e.usage === 'native').length, 30);
  assert.equal(sha(fixture.authoredSource.path), fixture.authoredSource.sha256);
  assert.equal(sha(fixture.dictionaryIndex.path), fixture.dictionaryIndex.sha256);
  const cache = new Map();
  const get = p => { if (!cache.has(p)) cache.set(p, json(p)); return cache.get(p); };
  for (const e of entries) {
    assert.equal(sha(e.article.path), e.article.sha256, e.id);
    const body = get(e.article.path); assertEnglishSource(body, e);
    assert.deepEqual(body.tokens[e.occurrenceIndex], e.article.token);
    assert.equal(sha(e.dictionary.path), e.dictionary.sha256);
    const dictionary = get(e.dictionary.path);
    const sense = e.dictionary.pointer.split('/').slice(1).reduce((v, k) => v[k], dictionary);
    assert.deepEqual(sense, e.dictionary.sense);
    assert.equal(sense[10][0][0], e.english, 'Literal is attested, never a resolver result');
    const entry = dictionary.entries[Number(e.dictionary.pointer.split('/')[2])];
    assert.equal(entry[0], e.dictionary.seq);
    assert.deepEqual(entry[1], e.dictionary.kanjiForms);
    assert.deepEqual(entry[2], e.dictionary.kanaForms);
    assert.equal(sha(e.senseRecord.path), e.senseRecord.sha256);
    assert.equal(get(e.senseRecord.path).articles[e.id]?.[String(e.occurrenceIndex)], undefined,
      'Absent occurrence-sense attribution must remain truthful');
    assert.equal(e.senseRecord.occurrencePresent, false);
  }
});
test('context decisions do not substitute the easier dictionary spelling or flatten partial ruby', () => {
  const bySurface = s => entries.find(e => e.surface === s);
  assert.equal(bySurface('時').sourceReading, 'じ'); assert.equal(bySurface('時').english, 'hour');
  assert.equal(bySurface('つい').lemma, 'つく'); assert.equal(bySurface('つい').english, 'about');
  assert.equal(bySurface('つい').occurrenceIndex, 5); assert.deepEqual(bySurface('つい').readingSegments, []);
  assert.deepEqual(bySurface('高い').readingSegments, ['たか']);
  assert.equal(bySurface('高い').sourceReading, 'たかい');
  assert.equal(entries.filter(e => !e.readingSegments.length).length, 7);
  const address = entries.find(e => e.id === 'bunki-graded-n3-hidden-deity');
  assert.equal(address.occurrenceIndex, 1); assert.equal(address.english, 'sensei');
  assert.equal(address.dictionary.seq, '1387990'); assert.equal(address.dictionary.senseIndex, 1);
  assert.equal(address.dictionary.pointer, '/entries/1303/3/1');
  assert.match(address.decision, /vocative/u);
});
const controls = await runPureEnglishControls();
for (const [id, wanted] of ENGLISH_CONTROLS) test(`production loop: ${id} → ${wanted}`, () => {
  const row = controls.find(r => r.id === id); assert.equal(row.observed, wanted);
  assert.equal(row.passed, true, JSON.stringify(row));
});
test('control harness kills an always-success oracle mutant', async () => {
  const rows = await runPureEnglishControls(async () => syntheticEnglishSnapshot());
  assert(rows.every(r => r.passed === false));
});
test('setup, trigger and final-frame time all spend the original deadline', async () => {
  let time = 0, closed = false, triggers = 0;
  await assert.rejects(observeEnglish({ expected: CONTROL_EXPECTATION, bounded: false,
    now: () => time, sleep: async ms => { time += ms; },
    arm: async () => { time += 4800; return {
      read: async () => triggers ? syntheticEnglishSnapshot() : syntheticEnglishBaseline(CONTROL_EXPECTATION),
      frame: async () => { time += 101; }, close: async () => { closed = true; },
    }; }, trigger: async () => { triggers++; time += 100; },
  }), error => error.code === 'deadline');
  assert.equal(triggers, 1); assert.equal(closed, true);
});
test('arming cannot begin after the English was already shown', () => {
  assert.throws(() => judgeEnglishSnapshot(syntheticEnglishSnapshot(), CONTROL_EXPECTATION, { baseline: true }), /not-armed-before-trigger/u);
});
test('source reading mismatch is not accepted even if joined text happens to match', () => {
  const expected = { ...CONTROL_EXPECTATION, readingSegments: ['た', 'か'] };
  assert.throws(() => judgeEnglishSnapshot(syntheticEnglishSnapshot(), expected), /wrong-reading/u);
});
test('kana-only source needs visible source ink and English even with no ruby', () => {
  const expected = { ...CONTROL_EXPECTATION, readingSegments: [] };
  const row = syntheticEnglishSnapshot(expected);
  assert.equal(judgeEnglishSnapshot(row, expected), true);
  row.readingVisible = false; assert.equal(judgeEnglishSnapshot(row, expected), false);
  row.readingVisible = true; row.englishVisible = false; assert.equal(judgeEnglishSnapshot(row, expected), false);
});
test('monitor installation is browser-serializable and imports start no browser', () => {
  assert.doesNotThrow(() => new Function(`return (${installEnglishMonitor.toString()})`));
});
const nativeReceipt = () => ({ readerEnglishRung: syntheticEnglishReceipt(entries, 'native', pins, artifact, 'chromium') });
const context = { readerEnglishRungSources: pins, artifactSha256: artifact, engine: 'chromium' };
test('actual native descriptor pins all three sources and ci-contracts admits this file', () => {
  const native = batteryGates('/unit-fixture', {}).find(row => row.name === 'native-readings');
  assert.deepEqual(native.report.readerEnglishRungSources, pins);
  assert(supplementalGates('/unit-fixture').find(row => row.name === 'ci-contracts').args.includes('prototypes/corridor/tools/reader-english-rung.test.mjs'));
  assert.equal(validateNativeReaderEnglishRung(nativeReceipt(), context), true);
});
const rejects = {
  'absent evidence': r => { delete r.readerEnglishRung; },
  'missing observation': r => r.readerEnglishRung.observations.pop(),
  'duplicate occurrence': r => { r.readerEnglishRung.observations[1] = r.readerEnglishRung.observations[0]; },
  'wrong identity': r => { r.readerEnglishRung.observations[0].occurrenceIndex++; },
  'wrong reading': r => { r.readerEnglishRung.observations[0].readingSegments = ['x']; },
  'wrong English': r => { r.readerEnglishRung.observations[0].english = 'x'; },
  'hidden correct ink': r => { r.readerEnglishRung.observations[0].englishVisible = false; },
  'same-looking replacement': r => { r.readerEnglishRung.observations[0].sameOriginalElement = false; },
  'transient stage': r => { r.readerEnglishRung.observations[0].hazards = ['premature-stage-or-sheet']; },
  'deadline reset': r => { r.readerEnglishRung.observations[0].elapsedMs = 5100; },
  'late arming': r => { r.readerEnglishRung.observations[0].armedBeforeTrigger = false; },
  'easier fallback': r => { r.readerEnglishRung.observations[0].selectionAttempts = 2; },
  'pending pure controls': r => { r.readerEnglishRung.pureControls = []; },
  'pending native controls': r => { r.readerEnglishRung.browserControls = null; },
  'wrong control artifact': r => { r.readerEnglishRung.browserControls.artifactSha256 = 'b'.repeat(64); },
  'wrong control engine': r => { r.readerEnglishRung.browserControls.engine = 'webkit'; },
  'reset control timer': r => { r.readerEnglishRung.browserControls.results.at(-1).elapsedMs = 9900; },
  'missing control observation': r => { r.readerEnglishRung.browserControls.results[0].observation = null; },
};
for (const key of Object.keys(pins)) {
  rejects[`missing ${key} pin`] = r => { delete r.readerEnglishRung.sources[key]; };
  rejects[`stale ${key} pin`] = r => { r.readerEnglishRung.sources[key] = '0'.repeat(64); };
  rejects[`stale ${key} control pin`] = r => { r.readerEnglishRung.browserControls.sources[key] = '0'.repeat(64); };
}
for (const [name, mutate] of Object.entries(rejects)) test(`native English admission rejects ${name}`, () => {
  const receipt = structuredClone(nativeReceipt()); mutate(receipt);
  assert.throws(() => validateNativeReaderEnglishRung(receipt, context));
});
for (const key of Object.keys(pins)) test(`native expected ${key} old-pin refusal`, () => {
  assert.throws(() => validateNativeReaderEnglishRung(nativeReceipt(), { ...context, readerEnglishRungSources: { ...pins, [key]: '0'.repeat(64) } }));
});
test('native expected source pins cannot be omitted', () => {
  assert.throws(() => validateNativeReaderEnglishRung(nativeReceipt(), { ...context, readerEnglishRungSources: null }));
});

test('source pin serialization order is immaterial; array occurrence order remains exact', () => {
  const reordered = Object.fromEntries(Object.entries(pins).reverse());
  assert.equal(validateNativeReaderEnglishRung(nativeReceipt(), { ...context, readerEnglishRungSources: reordered }), true);
  const receipt = nativeReceipt(); receipt.readerEnglishRung.observations.reverse();
  assert.throws(() => validateNativeReaderEnglishRung(receipt, context));
});

// These execute the browser-serializable production monitor, not manufactured snapshots.
for (const [id, outcome] of ENGLISH_CONTROLS.slice(13, -2)) test(`actual monitor DOM double: ${id}`, () => {
  const expected = controlExpectation(id), f = pureMonitorFixture(expected);
  try {
    assert.equal(judgeEnglishSnapshot(f.monitor.read(), expected, { baseline: true }), false);
    f.paint(id);
    if (outcome === 'wrong-identity') assert.throws(() => judgeEnglishSnapshot(f.monitor.read(), expected), /wrong-identity/u);
    else assert.equal(judgeEnglishSnapshot(f.monitor.read(), expected), outcome === 'accepted');
  } finally { f.monitor.close(); }
});
test('actual monitor rejects transparent fill and hidden base glyph with visible ruby', () => {
  for (const id of ['transparent-ink', 'hidden-base']) {
    const f = pureMonitorFixture();
    try {
      f.paint(id);
      if (id === 'hidden-base') f.token.querySelector('ruby').style.webkitTextFillColor = 'transparent';
      assert.equal(judgeEnglishSnapshot(f.monitor.read(), CONTROL_EXPECTATION), false);
    } finally { f.monitor.close(); }
  }
});
test('same-surface plain-to-ruby row repaint and repeated equal text remain valid', () => {
  const f = pureMonitorFixture();
  try {
    // Product paintTok replaces .tok-word when its requested reading becomes visible.
    const plain = f.word.cloneNode(true); plain.childNodes = [f.text('高い')]; plain.firstChild.parentElement = plain;
    f.replace(f.word, plain); f.monitor.read();
    f.replace(plain, f.word); f.paint('same-text-repaint');
    assert.equal(judgeEnglishSnapshot(f.monitor.read(), CONTROL_EXPECTATION), true);
  } finally { f.monitor.close(); }
});
test('newly added glyph text retains characterData history through restoration', () => {
  const f = pureMonitorFixture();
  try {
    f.paint('same-text-word-repaint');
    const glyph = f.token.querySelector('ruby').firstChild;
    f.records.push({ type: 'characterData', target: glyph, oldValue: '高' },
      { type: 'characterData', target: glyph, oldValue: '安' });
    glyph.data = '高';
    assert.throws(() => judgeEnglishSnapshot(f.monitor.read(), CONTROL_EXPECTATION), /wrong-identity/u);
  } finally { f.monitor.close(); }
});
test('hit relation accepts ink/descendants/real ancestors, rejects its sibling and external cover', () => {
  for (const target of ['ink', 'descendant', 'ancestor', 'sibling', 'external']) {
    const f = pureMonitorFixture();
    try {
      f.paint('pointer-none-English'); const ink = f.token.querySelector('.tok-en-text');
      f.realm.document.elementFromPoint = (_x, y) => y < 60 ? f.token :
        target === 'ink' ? ink : target === 'descendant' ? ink.firstChild :
          target === 'ancestor' ? f.token : target === 'sibling' ? f.word : f.text('cover');
      assert.equal(judgeEnglishSnapshot(f.monitor.read(), CONTROL_EXPECTATION), ['ink', 'descendant', 'ancestor'].includes(target), target);
    } finally { f.monitor.close(); }
  }
});
test('color channels are not alpha; numeric/slash/percent alpha zero and fill are rejected', () => {
  for (const [color, accepted] of [['rgb(0, 0, 0)', true], ['rgb(10, 20, 0)', true],
    ['rgb(10 20 0)', true], ['rgba(0, 0, 0, 1)', true], ['rgb(0 0 0 / 100%)', true],
    ['rgba(10, 20, 30, 0)', false], ['rgb(10 20 30 / 0)', false], ['rgb(10 20 30 / 0%)', false],
    ['rgba(1, 2, 3, 0.0)', false], ['transparent', false]]) {
    const f = pureMonitorFixture();
    try {
      f.paint('pointer-none-English'); const ink = f.token.querySelector('.tok-en-text');
      ink.style.color = color; ink.style.webkitTextFillColor = color;
      assert.equal(judgeEnglishSnapshot(f.monitor.read(), CONTROL_EXPECTATION), accepted, color);
    } finally { f.monitor.close(); }
  }
});
for (const kind of ['pureControls', 'browserControls']) for (const [id] of ENGLISH_CONTROLS.slice(13, -2)) {
  test(`native admission requires expanded ${kind} ${id}`, () => {
    const receipt = nativeReceipt();
    const rows = kind === 'pureControls' ? receipt.readerEnglishRung.pureControls : receipt.readerEnglishRung.browserControls.results;
    rows.splice(rows.findIndex(r => r.id === id), 1);
    assert.throws(() => validateNativeReaderEnglishRung(receipt, context));
  });
}
