/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MEDIA_CASES,
  mediaReportContracts,
  validateMediaReport,
} from './vh-media-report-contracts.mjs';
import { validateGateEvidence } from './gate-evidence.mjs';
const A = 'a'.repeat(64),
  B = 'b'.repeat(64),
  C = 'c'.repeat(64);
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const site = mkdtempSync(join(tmpdir(), 'vh-media-site-'));
const evidence = mkdtempSync(join(tmpdir(), 'vh-media-out-'));
const handoffRun = join(evidence, 'guided-offline', 'guided-offline-fixture');
mkdirSync(handoffRun, { recursive: true });
const handoff = join(handoffRun, 'corridor-standalone.html');
writeFileSync(handoff, '<!doctype html><title>handoff</title>\n');
const buildSidecar = (output) => ({
  status: 'passed',
  site,
  artifactSha256: A,
  output: realpathSync(output),
  standaloneSha256: sha256(output),
});
writeFileSync(handoff + '.build.json', JSON.stringify(buildSidecar(handoff)));
function fixture(name, engine = 'chromium') {
  const context = {
    engine,
    artifactSha256: A,
    verifierSha256: B,
    site,
    out: evidence,
    gateId: name,
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
    transport: [
      {
        origin: 'https://api.anthropic.com',
        pathname: '/v1/messages',
        credential: 'default-synthetic',
      },
      {
        origin: 'https://pre-upgrade-custom.invalid',
        pathname: '/v1/messages',
        credential: 'custom-synthetic',
      },
      {
        origin: 'https://custom-provider.invalid',
        pathname: '/proxy/v1/messages',
        credential: 'custom-synthetic',
      },
      {
        origin: 'https://second-provider.invalid',
        pathname: '/v1/messages',
        credential: 'second-synthetic',
      },
    ],
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
    standalone: handoff,
    standaloneDeclared: null,
    standaloneSha256: sha256(handoff),
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
  // INT-VH (2026-10-19): + Hfix-1B's J1b and J1c (each journey width) and J1d (the moments run)
  assert.equal(MEDIA_CASES['guided-journey'].length, 82);
  assert.equal(mediaReportContracts['guided-session'].expectedCases('chromium').length, 220);
  assert.equal(mediaReportContracts['guided-session'].expectedCases('all').length, 440);
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
      { GUIDED_STANDALONE: handoff },
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

test('legacy site identity is the same real directory through symlinks and trailing slashes', () => {
  const link = join(mkdtempSync(join(tmpdir(), 'vh-media-link-')), 'site');
  symlinkSync(site, link);
  for (const name of ['guided-session', 'import-provider', 'playback']) {
    const { report, context } = fixture(name);
    report.site = realpathSync(site);
    for (const declared of [link, `${link}/`, `${site}/`])
      assert.equal(
        validateMediaReport(name, report, { ...context, site: declared }).passed,
        true,
        `${name}: ${declared}`,
      );
    const other = mkdtempSync(join(tmpdir(), 'vh-media-other-site-'));
    assert.equal(validateMediaReport(name, report, { ...context, site: other }).passed, false);
    assert.equal(
      validateMediaReport(name, { ...report, site: join(site, 'missing') }, context).passed,
      false,
    );
  }
});
test('guided offline admits only its own fresh built handoff, never a declared or foreign file', () => {
  const { report, context } = fixture('guided-offline');
  const admit = (change = {}, extra = {}) =>
    validateMediaReport('guided-offline', { ...report, ...change }, { ...context, ...extra })
      .passed;
  assert.equal(admit(), true);
  const foreign = join(
    mkdtempSync(join(tmpdir(), 'vh-media-foreign-')),
    'corridor-standalone.html',
  );
  writeFileSync(foreign, readFileSync(handoff));
  assert.equal(admit({ standalone: foreign }), false, 'foreign file with identical bytes');
  assert.equal(admit({ standaloneDeclared: foreign }), false, 'declared handoff');
  assert.equal(admit({ standaloneDeclared: undefined }), false, 'producer did not say');
  assert.equal(admit({}, { env: { GUIDED_STANDALONE: handoff } }), false, 'declared env');
  assert.equal(admit({ standaloneSha256: C }), false, 'bytes differ from observation');
  assert.equal(admit({}, { out: undefined }), false, 'no gate directory');
  assert.equal(admit({}, { gateId: 'guided-session' }), false, 'another gate directory');
  const loose = join(evidence, 'guided-offline', 'corridor-standalone.html');
  writeFileSync(loose, readFileSync(handoff));
  assert.equal(admit({ standalone: loose }), false, 'outside the producer run directory');
  rmSync(loose);
  const linked = join(handoffRun, 'linked.html');
  symlinkSync(foreign, linked);
  assert.equal(admit({ standalone: linked }), false, 'symlink to elsewhere');
  rmSync(linked);
  const second = join(evidence, 'guided-offline', 'guided-offline-second');
  mkdirSync(second);
  assert.equal(admit(), false, 'two producer runs in one attempt');
  rmSync(second, { recursive: true });
  assert.equal(admit(), true);
});
test('an observed guided-offline receipt is admitted at the producer layout by the real consumer', () => {
  const observed = JSON.parse(
    readFileSync(
      new globalThis.URL('./vh-observed-media-assessment-receipts.json', import.meta.url),
      'utf8',
    ),
  )['guided-offline'];
  const root = fileURLToPath(new globalThis.URL('../..', import.meta.url));
  const admit = (place) => {
    const out = mkdtempSync(join(tmpdir(), 'vh-media-consumer-'));
    const run = join(out, 'guided-offline', observed.layout.run);
    mkdirSync(run, { recursive: true });
    const standalone = join(run, observed.layout.standalone);
    writeFileSync(standalone, '<!doctype html><title>observed handoff</title>\n');
    writeFileSync(standalone + '.build.json', JSON.stringify(buildSidecar(standalone)));
    const receipt = {
      ...observed.report,
      artifactSha256: A,
      site,
      standalone: realpathSync(standalone),
      standaloneDeclared: null,
      standaloneSha256: sha256(standalone),
    };
    writeFileSync(place(out, run), JSON.stringify(receipt));
    return validateGateEvidence(
      {
        name: 'guided-offline',
        args: ['prototypes/corridor/tools/verify-guided-offline.mjs'],
        requiredPath: 'prototypes/corridor/tools/verify-guided-offline.mjs',
      },
      { kind: 'adapter', name: 'guided-offline' },
      {
        root,
        out,
        startedAt: new Date(Date.now() - 60_000).toISOString(),
        runId: 'observed-attempt',
        engine: 'chromium',
        site,
        artifactSha256: A,
      },
    );
  };
  const admitted = admit((out, run) => join(run, observed.layout.receipt));
  assert.deepEqual(
    [...admitted.obligation.observedCases].sort(),
    MEDIA_CASES['guided-offline'].map((name) => `chromium/${name}`).sort(),
  );
  assert.throws(
    () => admit((out) => join(out, 'guided-offline', observed.layout.receipt)),
    /exactly one fresh receipt/u,
  );
});

test('guided-offline consumes the real sibling build receipt and refuses a foreign artifact', () => {
  const { report, context } = fixture('guided-offline');
  const path = handoff + '.build.json',
    good = readFileSync(path);
  const admit = () => validateMediaReport('guided-offline', report, context).passed;
  try {
    assert.equal(admit(), true);
    for (const patch of [
      { artifactSha256: C },
      { artifactSha256: null },
      { site: evidence },
      { output: site },
      { standaloneSha256: C },
      { status: 'failed' },
    ]) {
      writeFileSync(path, JSON.stringify({ ...buildSidecar(handoff), ...patch }));
      assert.equal(admit(), false, JSON.stringify(patch));
    }
    writeFileSync(path, '{not-json');
    assert.equal(admit(), false);
    rmSync(path);
    assert.equal(admit(), false);
    const foreign = join(evidence, 'foreign-build.json');
    writeFileSync(foreign, good);
    symlinkSync(foreign, path);
    assert.equal(admit(), false, 'a linked sidecar is not the producer sibling');
    rmSync(path);
    rmSync(foreign);
  } finally {
    writeFileSync(path, good);
  }
  assert.equal(admit(), true);
});

test('import-provider requires actual allowed transport bindings, not constant safety booleans', () => {
  const { report, context } = fixture('import-provider');
  const admit = (transport) =>
    validateMediaReport('import-provider', { ...report, transport }, context).passed;
  assert.equal(admit(report.transport), true);
  // Actual intercepted sequence from 2026-10-01/glance/lean-92362bed/import-provider/
  // verify-import-provider.json, SHA256 a89e730dc2368cf765baf93eda06f4957c04f5f81ecbefc51fba8f656fd66f4e.
  // Replays transport observations only; the rest of this admission fixture is synthetic.
  const observedTransport = [
    ['https://api.anthropic.com', '/v1/messages', 'default-synthetic'],
    ['https://pre-upgrade-custom.invalid', '/v1/messages', 'custom-synthetic'],
    ['https://pre-upgrade-custom.invalid', '/v1/messages', 'custom-synthetic'],
    ['https://api.anthropic.com', '/v1/messages', 'default-synthetic'],
    ['https://custom-provider.invalid', '/proxy/v1/messages', 'custom-synthetic'],
    ['https://custom-provider.invalid', '/proxy/v1/messages', 'custom-synthetic'],
    ['https://custom-provider.invalid', '/proxy/v1/messages', 'custom-synthetic'],
    ['https://custom-provider.invalid', '/proxy/v1/messages', 'custom-synthetic'],
    ['https://second-provider.invalid', '/v1/messages', 'second-synthetic'],
    ['https://second-provider.invalid', '/v1/messages', 'second-synthetic'],
    ['https://api.anthropic.com', '/v1/messages', 'default-synthetic'],
  ].map(([origin, pathname, credential]) => ({ origin, pathname, credential }));
  assert.equal(admit(observedTransport), true, 'retained genuine request observations');
  for (const transport of [
    undefined,
    null,
    [],
    [{}],
    report.transport.slice(1),
    report.transport.map((row, index) =>
      index ? row : { ...row, credential: 'custom-synthetic' },
    ),
    [
      ...report.transport,
      {
        origin: 'https://redirect-recipient.invalid',
        pathname: '/v1/messages',
        credential: 'default-synthetic',
      },
    ],
    report.transport.map((row, index) => (index ? row : { ...row, pathname: '/foreign' })),
  ])
    assert.equal(admit(transport), false, JSON.stringify(transport));
});
