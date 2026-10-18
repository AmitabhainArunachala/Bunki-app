/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEDIA_CASES,
  mediaReportContracts,
  validateMediaReport,
} from './vh-media-report-contracts.mjs';
const A = 'a'.repeat(64),
  B = 'b'.repeat(64),
  C = 'c'.repeat(64);
function fixture(name, engine = 'chromium') {
  const context = {
    engine,
    artifactSha256: A,
    verifierSha256: B,
    site: '/immutable/site',
    artifactVerifiedBeforeAndAfter: true,
    sourceVerifiedBeforeAndAfter: true,
    runtimeFiles: { 'corridor.js': C, 'audio/test.m4a': C },
    args: [],
    env: {},
    voiceLock: { model: 'locked-model', main: 'main', second: 'second' },
  };
  const contract = mediaReportContracts[name];
  const results = contract.expectedCases(engine).map((id) => {
    const slash = id.indexOf('/'),
      prefix = id.slice(0, slash),
      caseName = id.slice(slash + 1);
    return {
      engine: name === 'type-ruby' && prefix !== 'sheets' ? `${prefix} 26.6` : prefix,
      run: prefix,
      name: caseName,
      pass: true,
      passed: true,
      version: '26.6',
      observed: { utterances: [] },
      errors: [],
    };
  });
  const report = {
    artifactSha256: A,
    verifierSha256: B,
    site: context.site,
    results,
    passed: true,
    failures: 0,
    corridorSha256: C,
    engine,
    enginesCovered: [engine],
    requestedBrowser: engine,
    browserVersion: '26.6',
    simulatedBrowser: 'Chromium',
    onlySyntheticData: true,
    externalNetworkRequestsSent: 0,
    transport: [],
    browser: engine,
    format: 'kairo-ai-runtime-verification',
    version: 2,
    status: 'PASS',
    pass: true,
    consoleErrors: [],
    externalRequests: [],
    sourceSha256: C,
    supplementalSourceChecks: [
      'staged chat-only mining declaration',
      'staged Promise.all append gate',
    ],
    fault: null,
    moments: true,
    failed: 0,
    problems: [],
    installedGuided: ['guided/room.js'],
    offlineRequests: [],
    standalone: '/handoff.html',
    summary: { total: results.length, failed: 0 },
    timing: ['shelf → reader (picture)', 'deck Good → next card'].map((move) => ({
      engine,
      move,
      cold: {},
      warm: {},
    })),
  };
  if (name === 'guided-session') report.passed = results.length;
  if (name === 'narration-media') {
    const clip = { src: 'audio/test.m4a', seconds: 1, sha256: C, bytes: 1024 };
    context.readArtifactJson = () => ({ v: 2, articles: { first: { clips: [clip] } } });
    Object.assign(report, {
      article: 'first',
      integrity: [{ ...clip, matches: true }],
      results: [
        {
          engine,
          browserVersion: '26.6',
          passed: true,
          errors: [],
          decoded: [{ src: clip.src, seconds: 1 }],
          clips: [
            {
              ...clip,
              index: 0,
              duration: 1,
              manifestSeconds: 1,
              reachedPlaying: true,
              endedAt: 1,
              maxGap: 0.5,
              wallSeconds: 0.25,
              progressEvents: 5,
            },
          ],
        },
      ],
    });
  }
  if (name === 'voice-lock') {
    context.args = ['--require-complete'];
    Object.assign(report, {
      verdict: 'green',
      coverageRequired: true,
      clipsOwed: 0,
      model: 'locked-model',
      main: 'main',
      second: 'second',
      stagedCuesChecked: 2,
      approvedWords: 3,
      narratedArticles: 1,
      clipsChecked: 5,
      cuesChecked: 5,
    });
  }
  return { report, context };
}
test('independent media rosters preserve every full journey and dynamically expanded case', () => {
  assert.equal(MEDIA_CASES['guided-journey'].length, 80);
  assert.equal(mediaReportContracts['guided-session'].expectedCases('chromium').length, 215);
  assert.equal(mediaReportContracts['guided-session'].expectedCases('all').length, 430);
  assert.equal(MEDIA_CASES.playback.length, 23);
  assert.equal(MEDIA_CASES['import-provider'].length, 25);
  assert.equal(MEDIA_CASES['corridor-ai'].length, 59);
  assert.equal(mediaReportContracts['type-ruby'].expectedCases('chromium').length, 19);
  assert.equal(mediaReportContracts['type-ruby'].expectedCases('webkit').length, 19);
  assert.equal(mediaReportContracts['type-ruby'].expectedCases('all').length, 36);
});
test('final type-ruby requires every approved cda18876 R4/W1 row in each engine; old twelve-row scope cannot accept', () => {
  const added = [
    'R4-breaks-on-touch-320',
    'R4-breaks-on-touch-390',
    'R4-breaks-on-touch-430',
    'R4-breaks-on-touch-1368',
    'W1-fresh-320-reveal-fold',
  ];
  assert.equal(MEDIA_CASES['type-ruby'].length, 17);
  for (const engine of ['chromium', 'webkit', 'all']) {
    const { report, context } = fixture('type-ruby', engine);
    const positive = validateMediaReport('type-ruby', report, context);
    assert.equal(positive.passed, true, positive.errors.join('; '));
    const requiredEngines = engine === 'all' ? ['chromium', 'webkit'] : [engine];
    for (const required of requiredEngines)
      for (const name of added) {
        const index = report.results.findIndex(
          (row) => row.engine.startsWith(`${required} `) && row.name === name,
        );
        assert(index >= 0, `${required}/${name} is independently required`);
        const missing = structuredClone(report);
        missing.results.splice(index, 1);
        missing.summary.total = missing.results.length;
        assert.equal(
          validateMediaReport('type-ruby', missing, context).passed,
          false,
          `omitted ${required}/${name}`,
        );
        const duplicate = structuredClone(report);
        duplicate.results[index] = structuredClone(
          duplicate.results.find(
            (row) => row.engine === duplicate.results[index].engine && row.name !== name,
          ),
        );
        assert.equal(
          validateMediaReport('type-ruby', duplicate, context).passed,
          false,
          `same-count duplicate hides ${required}/${name}`,
        );
      }
    const legacy = structuredClone(report);
    legacy.results = legacy.results.filter((row) => !added.includes(row.name));
    legacy.summary.total = legacy.results.length;
    assert.equal(legacy.results.length, engine === 'all' ? 26 : 14);
    assert.equal(
      validateMediaReport('type-ruby', legacy, context).passed,
      false,
      'old twelve-row producer stays diagnostic-only',
    );
    assert.equal(
      validateMediaReport('type-ruby', report, { ...context, verifierSha256: C }).passed,
      false,
      'new names do not excuse a wrong producer digest',
    );
  }
});
for (const name of Object.keys(mediaReportContracts))
  test(`${name}: complete fixture passes; missing/malformed/identity and semantic failure do not`, () => {
    const { report, context } = fixture(name);
    let result = validateMediaReport(name, report, context);
    assert.equal(result.passed, true, result.errors.join('; '));
    for (const bad of [undefined, {}, [], { results: [null] }])
      assert.equal(validateMediaReport(name, bad, context).passed, false);
    if (name !== 'voice-lock') {
      for (const rows of [[], [report.results[0]], [...report.results, report.results[0]]]) {
        if (rows.length === report.results.length && rows.length === 1) continue;
        assert.equal(
          validateMediaReport(name, { ...report, results: rows }, context).passed,
          false,
        );
      }
      const semantic = structuredClone(report);
      semantic.results[0].pass = false;
      semantic.results[0].passed = false;
      assert.equal(validateMediaReport(name, semantic, context).passed, false);
      assert.equal(
        validateMediaReport(name, report, { ...context, engine: 'all' }).passed,
        false,
        'one actual engine is never both',
      );
    }
    const badContext = {
      ...context,
      artifactSha256: C,
      sourceVerifiedBeforeAndAfter: false,
      artifactVerifiedBeforeAndAfter: false,
      runtimeFiles: {},
    };
    assert.equal(
      validateMediaReport(name, report, badContext).passed,
      false,
      'runner identity must match producer',
    );
  });
test('explicit filters/faults cannot inherit full acceptance even with every row present', () => {
  for (const name of Object.keys(mediaReportContracts).filter((name) => name !== 'voice-lock')) {
    const { report, context } = fixture(name);
    for (const args of [['--case=all'], ['--boundary-only'], ['--only', 'all']])
      assert.equal(validateMediaReport(name, report, { ...context, args }).passed, false, name);
    for (const env of [
      { GUIDED_PARTS: '' },
      { GUIDED_VIEWPORTS: '390,1280' },
      { GUIDED_MOMENTS: '0' },
      { GUIDED_FAULT: 'mask' },
    ])
      assert.equal(validateMediaReport(name, report, { ...context, env }).passed, false, name);
  }
});
test('legacy reports require actual independently verified site identity, never their own claimed digest', () => {
  for (const name of ['guided-session', 'import-provider']) {
    const { report, context } = fixture(name);
    assert.equal(
      validateMediaReport(name, report, { ...context, artifactVerifiedBeforeAndAfter: false })
        .passed,
      false,
    );
    assert.equal(
      validateMediaReport(name, report, { ...context, site: '/different/site' }).passed,
      false,
    );
  }
});
test('voice lock requires actual owed media and compares pinned roles; synthetic selector success cannot fill missing corpus', () => {
  const { report, context } = fixture('voice-lock');
  for (const change of [
    { coverageRequired: false },
    { clipsOwed: 1 },
    { clipsChecked: 0 },
    { cuesChecked: 0 },
    { narratedArticles: 0 },
    { stagedCuesChecked: 0 },
    { main: 'second' },
    { problems: ['wrong voice'] },
  ])
    assert.equal(
      validateMediaReport('voice-lock', { ...report, ...change }, context).passed,
      false,
    );
  assert.equal(validateMediaReport('voice-lock', report, { ...context, args: [] }).passed, false);
  const artifactContext = {
    ...context,
    voiceLock: undefined,
    readArtifactJson: () => ({
      v: 1,
      render: { model: 'locked-model' },
      voices: { main: { id: 'main' }, second: { id: 'second' } },
    }),
  };
  assert.equal(validateMediaReport('voice-lock', report, artifactContext).passed, true);
});
test('narration requires each manifest clip to decode, run in order, and match actual shipped bytes', () => {
  const { report, context } = fixture('narration-media');
  for (const change of [
    { maxGap: 3 },
    { wallSeconds: 0.01 },
    { duration: 2 },
    { endedAt: 0.1 },
    { progressEvents: 0 },
    { index: 1 },
    { reachedPlaying: false },
  ]) {
    const mutant = structuredClone(report);
    Object.assign(mutant.results[0].clips[0], change);
    assert.equal(
      validateMediaReport('narration-media', mutant, context).passed,
      false,
      JSON.stringify(change),
    );
  }
  assert.equal(
    validateMediaReport('narration-media', report, {
      ...context,
      readArtifactJson: () => ({ v: 2, articles: {} }),
    }).passed,
    false,
  );
  assert.equal(
    validateMediaReport('narration-media', report, {
      ...context,
      runtimeFiles: { 'audio/test.m4a': A },
    }).passed,
    false,
  );
  const duplicate = structuredClone(report);
  duplicate.integrity.push(duplicate.integrity[0]);
  assert.equal(validateMediaReport('narration-media', duplicate, context).passed, false);
});
test('device voice, missing supplemental proof, and unverified offline requests remain red', () => {
  const playback = fixture('playback');
  playback.report.results[0].observed.utterances.push('spoken');
  assert.equal(validateMediaReport('playback', playback.report, playback.context).passed, false);
  const ai = fixture('corridor-ai');
  ai.report.supplementalSourceChecks.pop();
  assert.equal(validateMediaReport('corridor-ai', ai.report, ai.context).passed, false);
  const offline = fixture('guided-offline');
  offline.report.offlineRequests.push('/guided/room.js');
  assert.equal(
    validateMediaReport('guided-offline', offline.report, offline.context).passed,
    false,
  );
});
