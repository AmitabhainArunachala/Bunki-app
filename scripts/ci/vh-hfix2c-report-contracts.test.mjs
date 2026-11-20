import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import {
  HFIX2C,
  hfixDigest,
  loadHfix2cPins,
  validateHfix2cFocused,
  validateHfix2cContrast,
  readHfix2cContrastEvidence,
  validateHfix2cLaneAdmission,
  validateHfix2cContrastScene,
} from './vh-hfix2c-report-contracts.mjs';
import { runHfix2cContrastGate } from './run-hfix2c-contrast-gate.mjs';
import { validateExistingReport } from './vh-existing-report-contracts.mjs';

const parent = join(homedir(), '.dharma/bunki/verifier-receipts/hfix2c-admission-tests');
mkdirSync(parent, { recursive: true });
const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
};
function fixture(
  engine = 'chromium',
  {
    lessonKun = ['い.きる'],
    dictionaryKun = ['い.きる', 'なま'],
    joyoKun = [['生', ['いきる', 'うまれる', 'なま']]],
  } = {},
) {
  const base = mkdtempSync(join(parent, 'case-')),
    root = join(base, 'root'),
    siteDir = join(base, 'site');
  for (const file of [
    'verify-hfix2c.mjs',
    'verify-hfix2c-contrast.mjs',
    'verify-contrast-sweep.mjs',
    'vh-contrast-arrival.mjs',
    'record-test-support.mjs',
    'hfix2c-diversity.json',
    'browser-audio-silence.mjs',
    'shelf-tools-support.mjs',
  ])
    write(join(root, 'prototypes/corridor/tools', file), '// pinned fixture ' + file);
  for (const file of [
    'run-hfix2c-contrast-gate.mjs',
    'vh-hfix2c-report-contracts.mjs',
    'vh-hfix2c-rosters.json',
  ])
    write(join(root, 'scripts/ci', file), '// pinned fixture ' + file);
  const files = {
    'data/share_alike/kanji.json': { kanji: { 生: { on: ['セイ'], kun: lessonKun } } },
    'data/share_alike/reference-extra.json': {
      kanjiReadings: [['生', ['セイ', 'ショウ'], dictionaryKun]],
      officialReadings: [['生', 'ショウ']],
      ...(joyoKun === null ? {} : { joyoKun }),
    },
    'corridor.js': '// immutable corridor',
  };
  const manifest = [];
  for (const [path, value] of Object.entries(files)) {
    write(join(siteDir, path), value);
    manifest.push({ path, sha256: hfixDigest(readFileSync(join(siteDir, path))) });
  }
  write(join(siteDir, 'build-identity.json'), {
    schemaVersion: 1,
    product: 'KAIRO',
    sourceDirty: false,
    gitSha: 'a'.repeat(40),
    artifactSha256: 'b'.repeat(64),
    files: manifest,
  });
  return {
    base,
    root,
    siteDir,
    engine,
    runId: 'fresh-test-attempt',
    pins() {
      return loadHfix2cPins(this);
    },
  };
}
function nativeKanjiContract(f, glyph = '生') {
  // Execute only the actual native verifier's pure expectation function, never its browser setup.
  const source = readFileSync(
    new URL('../../prototypes/corridor/tools/verify-hfix2c.mjs', import.meta.url),
    'utf8',
  );
  const start = 'function actualKanjiContract(id) {';
  const end = '\nfunction readKanjiReview() {';
  assert.equal(source.split(start).length, 2);
  assert.equal(source.split(end).length, 2);
  const fn = source.slice(source.indexOf(start), source.indexOf(end));
  return JSON.parse(
    JSON.stringify(
      runInNewContext(`${fn}\nactualKanjiContract(${JSON.stringify(glyph)})`, {
        read: (file) => (f.read ? f.read(file) : readFileSync(join(f.siteDir, file), 'utf8')),
      }),
    ),
  );
}

test('E3 real expectation functions preserve raw kun and affixes while completing only attested Jōyō display', () => {
  const f = fixture('chromium', {
    lessonKun: ['い.きる', 'い.きる'],
    dictionaryKun: ['い.きる', 'う.まれる', 'うま.れる', 'う.む', 'なま', 'なま-', 'な.る', '-う'],
    joyoKun: [['生', ['いきる', 'うまれる', 'うむ', 'なま']]],
  });
  const files = ['data/share_alike/kanji.json', 'data/share_alike/reference-extra.json'];
  const before = files.map((file) => readFileSync(join(f.siteDir, file), 'utf8'));
  const p = f.pins();
  assert.deepEqual(p.canonical.kun, [
    'い.きる',
    'う.まれる',
    'う.む',
    'なま',
    'なま-',
    'な.る',
    '-う',
  ]);
  assert.deepEqual(p.canonical.lessonKun, ['い.きる', 'い.きる']);
  assert.deepEqual(nativeKanjiContract(f), p.canonical);
  assert.deepEqual(
    files.map((file) => readFileSync(join(f.siteDir, file), 'utf8')),
    before,
  );
  const good = focused(p);
  assert.equal(validateHfix2cFocused(good, p), true);
  for (const wrong of [
    p.canonical.kun.filter((reading) => reading !== 'う.む'),
    p.canonical.kun.map((reading) => (reading === 'う.まれる' ? 'うま.れる' : reading)),
    [...p.canonical.kun, p.canonical.kun[0]],
    p.canonical.kun.filter((reading) => reading !== 'なま-'),
  ]) {
    const bad = structuredClone(good);
    const observed = bad.rows.find((row) => row.name === HFIX2C.transition).observed;
    observed.complete = snapshot({ ...p.canonical, kun: wrong }, 'complete');
    assert.throws(() => validateHfix2cFocused(bad, p));
  }
});

test('E3.1 native and receipt expectations prefer a unique dot over an undotted lesson form', () => {
  // Synthetic duplicate-form witness: force the precedence that the real five readings exposed.
  const f = fixture('chromium', {
    lessonKun: ['いきる', 'い.きる'],
    dictionaryKun: ['いきる', 'い.きる', 'い.きる'],
    joyoKun: [['生', ['いきる']]],
  });
  const p = f.pins();
  assert.deepEqual(p.canonical.kun, ['い.きる']);
  assert.deepEqual(p.canonical.lessonKun, ['いきる', 'い.きる']);
  assert.deepEqual(nativeKanjiContract(f), p.canonical);
  const good = focused(p);
  assert.equal(validateHfix2cFocused(good, p), true);
  const bad = structuredClone(good);
  bad.rows.find((row) => row.name === HFIX2C.transition).observed.complete = snapshot(
    { ...p.canonical, kun: ['いきる'] },
    'complete',
  );
  assert.throws(() => validateHfix2cFocused(bad, p));
});

test('E3.3 native and receipt expectations accept the table form when its dictionary dot is absent', () => {
  for (const dictionaryKun of [[], ['うま.れる']]) {
    const f = fixture('chromium', {
      lessonKun: ['うまれる'],
      dictionaryKun,
      joyoKun: [['生', ['うまれる']]],
    });
    const p = f.pins();
    assert.deepEqual(p.canonical.kun, ['う.まれる']);
    assert.deepEqual(p.canonical.lessonKun, ['うまれる']);
    assert.deepEqual(nativeKanjiContract(f), p.canonical);
    const good = focused(p);
    assert.equal(validateHfix2cFocused(good, p), true);
    for (const wrong of ['うまれる', 'うま.れる']) {
      const bad = structuredClone(good);
      bad.rows.find((row) => row.name === HFIX2C.transition).observed.complete = snapshot(
        { ...p.canonical, kun: [wrong] },
        'complete',
      );
      assert.throws(() => validateHfix2cFocused(bad, p));
    }
  }
});

test('E3.3 native expectations use the eight official table forms and preserve lesson readings', () => {
  const input = Object.fromEntries(
    ['kanji', 'reference-extra'].map((name) => [
      `data/share_alike/${name}.json`,
      readFileSync(
        new URL(`../../prototypes/corridor/data/share_alike/${name}.json`, import.meta.url),
        'utf8',
      ),
    ]),
  );
  const f = { read: (file) => input[file] };
  const lessons = JSON.parse(input['data/share_alike/kanji.json']).kanji;
  for (const [glyph, kun] of [
    ['癒', ['い.える', 'い.やす']],
    ['籠', ['かご', 'こ.める', 'こ.もる', 'こ.む']],
    ['塞', ['ふさ.ぐ', 'とりで', 'み.ちる', 'ふさ.がる']],
    ['羨', ['うらや.む', 'あまり', 'うらや.ましい']],
    ['速', ['はや.い', 'はや', 'はや.める', 'はや.まる', 'すみ.やか', 'はや-']],
    ['務', ['つと.める', 'つと.まる']],
    ['踊', ['おど.る', 'おど.り']],
    ['絡', ['から.む', 'から.まる', 'から.める']],
  ]) {
    const actual = nativeKanjiContract(f, glyph);
    assert.deepEqual(actual.kun, kun, glyph);
    assert.deepEqual(actual.lessonKun, lessons[glyph].kun, glyph);
  }
  assert.deepEqual(nativeKanjiContract(f, '丼').kun, ['どんぶり', 'どん']);
  assert.deepEqual(nativeKanjiContract(f, '守').kun, [
    'まも.る',
    'まも.り',
    'もり',
    '-もり',
    'かみ',
  ]);
});

test('E3.2 native expectations keep eight official noun forms undotted without losing their verb dots', () => {
  const input = Object.fromEntries(
    ['kanji', 'reference-extra'].map((name) => [
      `data/share_alike/${name}.json`,
      readFileSync(
        new URL(`../../prototypes/corridor/data/share_alike/${name}.json`, import.meta.url),
        'utf8',
      ),
    ]),
  );
  const f = { read: (file) => input[file] };
  for (const [glyph, noun, dotted, verbs] of [
    ['卸', 'おろし', 'おろ.し', ['おろ.す']],
    ['割', 'わり', 'わ.り', ['わ.る', 'わ.れる', 'さ.く']],
    ['巻', 'まき', 'ま.き', ['ま.く']],
    ['折', 'おり', 'お.り', ['お.る', 'お.れる']],
    ['彼', 'かの', 'か.の', []],
    ['掛', 'かかり', 'か.かり', ['か.ける', 'か.かる']],
    ['並', 'なみ', 'な.み', ['なら.べる', 'なら.ぶ']],
    ['謡', 'うたい', 'うた.い', ['うた.う']],
  ]) {
    const actual = nativeKanjiContract(f, glyph);
    assert(actual.kun.includes(noun) && !actual.kun.includes(dotted), glyph);
    for (const verb of verbs) assert(actual.kun.includes(verb), `${glyph}: ${verb}`);
    assert.deepEqual(
      actual.lessonKun,
      JSON.parse(input['data/share_alike/kanji.json']).kanji[glyph].kun,
    );
  }
});

test('E3 absent Jōyō row keeps the legacy union; a present empty row preserves dictionary-attested dots', () => {
  for (const joyoKun of [undefined, [], [['生', []]]]) {
    const f = fixture('chromium', {
      dictionaryKun: ['い.きる', 'う.まれる', 'うま.れる', 'なま'],
      joyoKun: joyoKun === undefined ? null : joyoKun,
    });
    const p = f.pins();
    assert.deepEqual(p.canonical.kun, ['い.きる', 'う.まれる', 'うま.れる', 'なま']);
    assert.deepEqual(nativeKanjiContract(f), p.canonical);
  }
});

test('E3 native missing-reading control removes both completion inputs without deleting another reading', () => {
  const source = readFileSync(
    new URL('../../prototypes/corridor/tools/verify-kanji-trust.mjs', import.meta.url),
    'utf8',
  );
  const start = 'const CONTROLS = {';
  const end = '\nfunction replaceOnce(';
  assert.equal(source.split(start).length, 2);
  assert.equal(source.split(end).length, 2);
  const edit = runInNewContext(
    `${source.slice(source.indexOf(start), source.indexOf(end))}\nCONTROLS['drop-official-reading'].edit`,
  );
  const input = {
    kanjiReadings: [['生', ['セイ'], ['う.まれる', 'うま.れる', 'う.まれ', 'うまれ']]],
    joyoKun: [['生', ['うまれる', 'うむ']]],
  };
  const changed = JSON.parse(edit(JSON.stringify(input)));
  assert.deepEqual(changed.kanjiReadings[0][2], ['う.まれ', 'うまれ']);
  assert.deepEqual(changed.joyoKun[0][1], ['うむ']);
  assert.deepEqual(input.kanjiReadings[0][2], ['う.まれる', 'うま.れる', 'う.まれ', 'うまれ']);
});

function snapshot(record, state) {
  return {
    state,
    overflow: 0,
    view: 'review',
    document: { url: 'http://127.0.0.1/index.html?entry=shelf&ui=bi', timeOrigin: 100 },
    text:
      'On readings Kun readings ' +
      (state === 'pending'
        ? 'Loading the complete reading set'
        : '* Reading supplied by the Jōyō Kanji Table.'),
    lines: ['on', 'kun'].map((key, i) => ({
      label: i ? 'Kun readings · ' : 'On readings · ',
      readings: record[key],
    })),
    readings: [...record.on, ...record.kun].map((reading) => {
      const lesson = [...record.lessonOn, ...record.lessonKun].includes(reading);
      return {
        reading,
        lesson,
        text:
          reading +
          (lesson ? ' (lesson)' : '') +
          (record.officialReadings.includes(reading) ? '*' : ''),
      };
    }),
  };
}
function focused(p) {
  const value = {
    schemaVersion: 2,
    suite: 'hfix2c',
    runId: p.runId,
    scope: 'full',
    selectedCase: null,
    engine: p.engine,
    mode: 'branch',
    browserVersion: 'native-test-version',
    identity: p.identity,
    verifierSha256: p.sources.focused,
    helperSha256: {
      'record-test-support.mjs': p.sources.record,
      'hfix2c-diversity.json': p.sources.diversity,
    },
    sources: { nativeRecordHelper: p.sources.record },
    pass: true,
    errors: [],
    groups: Object.fromEntries(
      Object.entries(HFIX2C.groups).map(([key, rows]) => [key, { rows, red: 0 }]),
    ),
    rows: HFIX2C.focused.map((key) => ({
      group: key.slice(0, key.indexOf('/')),
      name: key.slice(key.indexOf('/') + 1),
      pass: true,
      observed: {},
    })),
    mutations: Array.from({ length: 5 }, () => ({
      label: 'canonical Kanji-trust display contract fixture',
      file: 'corridor.js',
      originalSha256: p.identity.files.find((row) => row.path === 'corridor.js').sha256,
      servedSha256: 'c'.repeat(64),
    })),
  };
  value.rows.find(
    (row) => row.name === '生/390/complete: actual merged canonical readings',
  ).observed = { observed: snapshot(p.canonical, 'complete'), unchanged: true };
  const roots = Object.fromEntries(
    HFIX2C.protectedRoots.map((key) => [key, key === 'taken' ? [{ t: 'kanji', id: '生' }] : {}]),
  );
  value.rows.find((row) => row.name === HFIX2C.transition).observed = {
    expected: p.canonical,
    protectedKeys: HFIX2C.protectedRoots,
    roots: { before: roots, during: roots, after: roots },
    unchanged: true,
    sameDocument: true,
    wasHeld: true,
    forcedRelease: false,
    requests: 1,
    releasedAfterMs: 100,
    response: {
      file: p.sidecar.file,
      bytes: p.sidecar.bytes,
      expectedSha256: p.sidecar.sha256,
      servedSha256: p.sidecar.sha256,
      receivedSha256: p.sidecar.sha256,
      status: 200,
    },
    pending: snapshot(
      {
        ...p.canonical,
        on: p.canonical.lessonOn,
        kun: p.canonical.lessonKun,
        officialReadings: [],
      },
      'pending',
    ),
    complete: snapshot(p.canonical, 'complete'),
    afterReleaseActions:
      'wait for public completion, observe; no click, reload, navigation or app helper',
  };
  return JSON.parse(JSON.stringify(value));
}
function contrast(p) {
  const candidate = {
    fades: [{ bar: 'kp-foot-band', side: 'foot', edge: 16 }],
    invalid: [],
    through: [],
    translucent: [],
  };
  const raw = {
    schemaVersion: 2,
    runId: p.runId,
    artifactSha256: p.artifactSha256,
    gitSha: p.identity.gitSha,
    sourceDirty: false,
    identity: { gitSha: p.identity.gitSha, artifactSha256: p.artifactSha256 },
    verifierSha256: p.runnerSha256,
    arrivalPredicateSha256: p.sources.arrival,
    partial: true,
    requestedScope: 'diagnostic',
    selectedPassed: true,
    fullAcceptance: false,
    selectors: { worlds: null, states: HFIX2C.states, demoOnly: false },
    worlds: HFIX2C.worlds,
    states: HFIX2C.states,
    settledMotion: 'reduce',
    freshDemoMotion: 'no-preference',
    engines: { [p.engine]: 'native-test-version' },
    rows: HFIX2C.contrast[p.engine].map((id) => ({ id, ok: true })),
    observedCases: HFIX2C.contrast[p.engine],
    expectedCases: p.fullContrastIds,
    source: [{ ok: true }],
    results: HFIX2C.worlds.flatMap((world) =>
      HFIX2C.states.map((state) => ({
        engine: p.engine,
        world,
        state,
        pairs: [
          {
            occurrence: 1,
            text: 'lesson Undo If the answer was new',
            fontPx: 14,
            weight: 400,
            required: 4.5,
            ratio: 7,
            ok: true,
            lines: [{ line: 0, ratio: 7, ok: true, at: 'stood' }],
          },
        ],
        census: { lines: { read: 1, wait: 0, occluded: 0 }, waiting: [] },
        reread: { waiting: 0, passes: 0, read: 0, barred: [], positions: [] },
        unresolved: [],
        figures: [],
        kanji: [],
        banding: [],
        roots: [],
        muddy: [],
        pigmentCount: 24,
        chrome: candidate,
      })),
    ),
    controls: ['c8-fade-undeclared', 'c8-fade-overdeclared', 'c8-fade-translucent-below'].map(
      (id) => {
        const mutant = structuredClone(candidate);
        if (id === 'c8-fade-undeclared') {
          mutant.fades = [];
          mutant.through.push({ bar: 'kp-foot-band', pixels: 2 });
        } else if (id === 'c8-fade-overdeclared')
          mutant.invalid.push({ bar: 'kp-foot-band', declared: '30px' });
        else mutant.translucent.push({ bar: 'kp-foot-band', pixels: 2 });
        return {
          id,
          engine: p.engine,
          scene: 'hokusai/deck-front',
          candidate,
          mutant,
          restored: candidate,
          styleBefore: null,
          styleAfter: null,
          recordBefore: {},
          recordAfter: {},
        };
      },
    ),
  };
  const adapter = {
    original: p.originalUrl,
    originalSha256: p.sources.shared,
    adapterSha256: p.sources.adapter,
    runnerSha256: p.runnerSha256,
    arrivalPredicateSha256: p.sources.arrival,
    runId: p.runId,
    expectedRows: 255,
    expectedScenes: 33,
    scope: HFIX2C.adapterScope,
  };
  return structuredClone({ raw, adapter });
}
test('focused real-data transition, exact136 roster and pins reject independently mutated receipts in both engines', () => {
  for (const engine of ['chromium', 'webkit']) {
    const p = fixture(engine).pins(),
      good = focused(p);
    assert.equal(validateHfix2cFocused(good, p), true);
    const transition = (r) => r.rows.find((row) => row.name === HFIX2C.transition).observed;
    for (const mutate of [
      (r) => r.rows.pop(),
      (r) => r.rows.reverse(),
      (r) => r.rows.push(r.rows[0]),
      (r) => (r.rows[0].pass = false),
      (r) => (r.mode = 'control'),
      (r) => (r.scope = 'partial:KT1'),
      (r) => (r.selectedCase = 'KT1'),
      (r) => (r.engine = 'all'),
      (r) => (r.runId = 'stale'),
      (r) => (r.verifierSha256 = 'd'.repeat(64)),
      (r) => (r.helperSha256['record-test-support.mjs'] = 'd'.repeat(64)),
      (r) => (r.identity.artifactSha256 = 'd'.repeat(64)),
      (r) => (r.groups.KT1.rows = 6),
      (r) => r.errors.push('page error'),
      (r) => r.mutations.push(r.mutations[0]),
      (r) => (r.mutations[0].servedSha256 = r.mutations[0].originalSha256),
      (r) => (transition(r).response.receivedSha256 = 'd'.repeat(64)),
      (r) => (transition(r).roots.after.srs.changed = true),
      (r) => (transition(r).forcedRelease = true),
      (r) => (transition(r).wasHeld = false),
      (r) => (transition(r).releasedAfterMs = 6500),
      (r) => transition(r).complete.document.timeOrigin++,
      (r) => transition(r).complete.readings.pop(),
      (r) => (transition(r).complete.view = 'shelf'),
      (r) => (transition(r).afterReleaseActions = 'reload'),
    ]) {
      const bad = structuredClone(good);
      mutate(bad);
      assert.throws(() => validateHfix2cFocused(bad, p), undefined, String(mutate));
    }
  }
});
test('contrast admits only255 assertions and33 native scenes with exact partial scope and red/restored C8 controls', () => {
  for (const engine of ['chromium', 'webkit']) {
    const p = { ...fixture(engine).pins(), runnerSha256: hfixDigest('runner') },
      good = contrast(p);
    assert.equal(validateHfix2cContrast(good.raw, good.adapter, p), true);
    assert.equal(
      validateExistingReport(
        engine === 'webkit' ? 'contrast-sweep-webkit' : 'contrast-sweep',
        good.raw,
        { ...p, verifierSha256: p.runnerSha256 },
      ).passed,
      false,
      'Targeted lane never satisfies the app-wide contrast gate',
    );
    for (const mutate of [
      (r) => r.rows.pop(),
      (r) => r.rows.push(r.rows[0]),
      (r) => r.rows.reverse(),
      (r) => r.results.pop(),
      (r) => (r.results[0].engine = 'foreign'),
      (r) => (r.runId = 'stale'),
      (r) => (r.fullAcceptance = true),
      (r) => (r.partial = false),
      (r) => (r.selectors.negative = ''),
      (r) => (r.selectors.worlds = ['hokusai']),
      (r) => (r.verifierSha256 = 'd'.repeat(64)),
      (r) => (r.arrivalPredicateSha256 = 'd'.repeat(64)),
      (r) => (r.expectedCases = r.observedCases),
      (r) => (r.results[0].pairs[0].ratio = 1),
      (r) => (r.results[0].pairs[0].lines[0].ratio = 1),
      (r) => r.results[0].pairs[0].lines.push(r.results[0].pairs[0].lines[0]),
      (r) => r.results[0].unresolved.push({ why: 'missing occurrence' }),
      (r) => (r.results[0].pairs[0].text = 'irrelevant'),
      (r) => delete r.results[0].reread,
      (r) => (r.results[0].reread.waiting = 1),
      (r) => r.controls.pop(),
      (r) => (r.controls[0].mutant = r.controls[0].candidate),
      (r) => (r.controls[0].recordAfter.changed = true),
      (r) => (r.controls[0].styleAfter = 'changed'),
      (r) => (r.source[0].ok = false),
    ]) {
      const bad = structuredClone(good);
      mutate(bad.raw);
      assert.throws(
        () => validateHfix2cContrast(bad.raw, bad.adapter, p),
        undefined,
        String(mutate),
      );
    }
    for (const key of [
      'originalSha256',
      'adapterSha256',
      'runnerSha256',
      'arrivalPredicateSha256',
    ]) {
      const bad = structuredClone(good);
      bad.adapter[key] = 'd'.repeat(64);
      assert.throws(() => validateHfix2cContrast(bad.raw, bad.adapter, p));
    }
  }
});
test('real wrapper maps only child exit3 after raw admission; inherited selectors cannot narrow its child', () => {
  for (const [code, fault, engine] of [
    [3, null, 'chromium'],
    [3, null, 'webkit'],
    [0, null],
    [1, null],
    [3, 'missing'],
    [3, 'stale'],
    [3, 'runner'],
    [3, 'red'],
  ]) {
    const f = fixture(engine),
      out = join(f.base, 'out'),
      bundleFile = join(f.base, 'bundle.json');
    write(
      join(f.root, 'prototypes/corridor/tools/verify-hfix2c-contrast.mjs'),
      `
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
assert(!Object.keys(process.env).some(k=>/^(SWEEP_|HFIX2C_)/.test(k)));
const b=JSON.parse(readFileSync(process.env.TEST_HFIX_BUNDLE,'utf8')),out=process.env.KAIRO_EVIDENCE_DIR;
if(b.fault!=='missing'){for(const [name,value] of Object.entries(b.files))writeFileSync(join(out,name),value);}
process.exitCode=b.code;`,
    );
    const pins = { ...f.pins(), runnerSha256: hfixDigest('runner') },
      data = contrast(pins);
    if (fault === 'stale') data.raw.runId = 'stale';
    if (fault === 'red') data.raw.results[0].pairs[0].ratio = 1;
    write(bundleFile, {
      code,
      fault,
      files: {
        'contrast-sweep.json': JSON.stringify(data.raw),
        [`sweep-${f.engine}.json`]: JSON.stringify(data.raw),
        'adapter.json': JSON.stringify(data.adapter),
        'hfix2c-contrast-runner.mjs': fault === 'runner' ? 'tampered' : 'runner',
      },
    });
    const env = {
      ...process.env,
      KAIRO_GATE_RUN_ID: f.runId,
      KAIRO_BROWSER: f.engine,
      KAIRO_ARTIFACT_SHA256: pins.artifactSha256,
      TEST_HFIX_BUNDLE: bundleFile,
      HFIX2C_CASE: 'KT1',
      HFIX2C_MODE: 'control',
      SWEEP_STATES: 'page',
      SWEEP_WORLDS: 'sumi',
      SWEEP_NEGATIVE: '',
      SWEEP_UNREVIEWED: 'x',
    };
    const run = () => runHfix2cContrastGate({ root: f.root, siteDir: f.siteDir, out, env });
    if (code === 3 && !fault) {
      assert.equal(run(), 0);
      const receipt = JSON.parse(readFileSync(join(out, 'lane-admission.json')));
      assert.equal(receipt.childExitCode, 3);
      assert.equal(receipt.appWideAcceptance, false);
      assert.equal(validateHfix2cLaneAdmission(receipt, out, f.pins()), true);
      receipt.appWideAcceptance = true;
      assert.throws(() => validateHfix2cLaneAdmission(receipt, out, f.pins()));
      assert.throws(run, /fresh/u);
      assert(readHfix2cContrastEvidence(out, f.pins()).raw.partial);
    } else assert.throws(run);
  }
});

test('scene semantics use actual C2/C5 fields, day-only C6, and strict native completion', () => {
  const p = { ...fixture().pins(), runnerSha256: hfixDigest('runner') };
  const good = contrast(p).raw.results[0];
  good.figures = [{ ok: true, best: 3 }];
  good.banding = [{ ok: true, steps: 1 }];
  good.kanji = [{ ok: true, radial: true, rootsOk: true, wash: 2, glyphRatio: 4.5 }];
  assert.equal(validateHfix2cContrastScene(good), true);
  for (const mutate of [
    (s) => (s.figures[0].best = 2.99),
    (s) => delete s.figures[0].best,
    (s) => (s.banding[0].steps = 2),
    (s) => (s.kanji[0].radial = false),
    (s) => (s.kanji[0].rootsOk = false),
    (s) => (s.kanji[0].wash = 1.9),
    (s) => (s.kanji[0].glyphRatio = 4.49),
    (s) => (s.kanji[0].glyphRatio = '4.5'),
    (s) => s.roots.push({ off: 1 }),
    (s) => s.muddy.push({ shows: 20 }),
    (s) => delete s.muddy,
    (s) => (s.reread.waiting = 1),
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.throws(() => validateHfix2cContrastScene(bad), undefined, String(mutate));
  }
  for (const world of ['rokusho', 'yoru', 'nami', 'hakuu', 'kaku']) {
    const night = structuredClone(good);
    night.world = world;
    night.muddy = [{ diagnostic: 'outside C6 scope' }];
    assert.equal(validateHfix2cContrastScene(night), true);
  }
  for (const world of HFIX2C.worlds.filter(
    (w) => !['rokusho', 'yoru', 'nami', 'hakuu', 'kaku'].includes(w),
  )) {
    const day = structuredClone(good);
    day.world = world;
    day.muddy = [{ shows: 20 }];
    assert.throws(() => validateHfix2cContrastScene(day));
  }
  const moved = structuredClone(good);
  moved.pairs[0].lines[0].at = { doc: 80, sheet: null };
  moved.census.lines.wait = 1;
  moved.census.waiting = [{ occurrence: 1, line: 0 }];
  moved.reread = {
    waiting: 1,
    passes: 1,
    read: 1,
    barred: [],
    positions: [{ at: { doc: 80, sheet: null } }],
  };
  assert.equal(validateHfix2cContrastScene(moved), true);
  for (const mutate of [
    (s) => (s.reread.read = 0),
    (s) => s.reread.barred.push('phantom'),
    (s) => s.census.waiting.push(s.census.waiting[0]),
    (s) => s.pairs[0].lines.push(s.pairs[0].lines[0]),
    (s) => (s.pairs[0].lines[0].at = { doc: null }),
  ]) {
    const bad = structuredClone(moved);
    mutate(bad);
    assert.throws(() => validateHfix2cContrastScene(bad), undefined, String(mutate));
  }
});
