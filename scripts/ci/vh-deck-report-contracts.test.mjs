import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { receiptPaths } from './gate-evidence.mjs';
import {
  DECK_CASES,
  deckReportContracts,
  validateDeckReport,
  PERSONAL_SOURCES,
  PLACES_CASES,
  LANGUAGE_ROOMS,
  LANGUAGE_ROOM_VIEWS,
  LANGUAGE_STAMPS,
  EXPERIENCE_CASES,
  EXPERIENCE_ASSETS,
  HOST_CASES,
  KOTOBA_PILOTS,
  KOTOBA_SITES,
  PAIRED_ENGINES,
} from './vh-deck-report-contracts.mjs';
const SITE = mkdtempSync(join(tmpdir(), 'vh-deck-site-')),
  OTHER_SITE = mkdtempSync(join(tmpdir(), 'vh-deck-other-')),
  SITE_LINK = join(mkdtempSync(join(tmpdir(), 'vh-deck-link-')), 'site');
symlinkSync(SITE, SITE_LINK);
const observedReceipts = JSON.parse(
  readFileSync(new globalThis.URL('./vh-deck-observed-receipts.json', import.meta.url), 'utf8'),
);
const hash = 'a'.repeat(64),
  input = {
    id: 'kotoba-mcd',
    words: KOTOBA_PILOTS.map((id, i) => ({
      id: `word-${i}`,
      cards: [{ id, ja: '独立した固定データ。', form: '固定' }],
    })),
  };
const base = {
  engine: 'chromium',
  site: SITE,
  runId: 'current-attempt',
  artifactSha256: hash,
  verifierSha256: hash,
  artifactVerifiedBeforeAndAfter: true,
  sourceVerifiedBeforeAndAfter: true,
  sourceFiles: Object.fromEntries(PERSONAL_SOURCES.map((p) => [p, hash])),
  runtimeFiles: Object.fromEntries(EXPERIENCE_ASSETS.map((p) => [p, hash])),
  readArtifactJson: (p) =>
    p === 'decks/kotoba-mcd/deck.json'
      ? input
      : { id: p.split('/')[1], words: [{ cards: [{ id: 'card1' }] }] },
};
function context(name) {
  return {
    ...base,
    engine: [
      'redesign-docks',
      'redesign-foundation',
      'personal-collections-browser',
      'deck-player-browser',
    ].includes(name)
      ? 'all'
      : 'chromium',
    env:
      name === 'personal-host-webkit'
        ? { PERSONAL_HOST_BROWSER: 'webkit' }
        : name === 'redesign-foundation'
          ? { KAIRO_BROWSER: 'all' }
          : name === 'personal-collections-browser'
            ? { PERSONAL_BROWSERS: 'chromium,webkit' }
            : {},
  };
}
function fixture(name, c = context(name)) {
  const ids = deckReportContracts[name].expectedCases(c.engine, c),
    rows = ids.map((name) => ({ name, pass: true }));
  const r = {
    results: rows,
    artifactSha256: hash,
    verifierSha256: hash,
    site: c.site,
    runId: c.runId,
  };
  if (name === 'personal-collections-contract')
    Object.assign(r, {
      schemaVersion: 2,
      runId: c.runId,
      suite: 'personal-collections',
      passed: 15,
      checks: DECK_CASES.personal,
      completed: true,
      sources: PERSONAL_SOURCES.map((path) => ({ path, sha256: hash })),
    });
  if (name === 'legacy-drift-storage')
    Object.assign(r, {
      passed: 9,
      total: 9,
      browserErrors: [],
      evidence: Object.fromEntries(
        ['valid', 'malformed', 'quota'].map((k) => [k, { value: 'observed' }]),
      ),
    });
  if (name === 'personal-collections-browser')
    Object.assign(r, {
      status: 'passed',
      checks: ids,
      browsers: ['chromium', 'webkit'],
      browserVersions: { chromium: '153.0.7258.5', webkit: '26.0' },
      executableOverride: false,
    });
  if (name === 'redesign-foundation') {
    r.checks = ids.map((id) => {
      const [engine, width, lang] = id.split('/');
      return { engine, width: Number(width), lang, passed: true };
    });
    Object.assign(r, {
      diagnostics: [],
      browserVersions: { chromium: '153.0.7258.5', webkit: '26.0' },
      horizontalSamples: r.checks.map((row) => ({
        ...row,
        noHorizontalScroll: true,
        stage: 'return-to-read-after-dictionary',
      })),
    });
  }
  if (name === 'redesign-docks')
    Object.assign(r, {
      suite: 'redesign-docks',
      pass: true,
      passed: 24,
      expectedCases: 24,
      results: ids.map((id) => {
        const [engine, lang, width, kind] = id.split('/');
        return { engine, lang, width: Number(width), kind, passed: true, browserVersion: '153' };
      }),
    });
  if (name === 'n2n1-decks-browser')
    Object.assign(r, {
      status: 'passed',
      viewport: { width: 390, height: 844 },
      decks: ['n2', 'n1', 'senmon'].map((id) => ({ id, words: 1, cards: 1 })),
      tours: ['n2', 'n1', 'senmon'].flatMap((id) =>
        ['hokusai', 'yoru'].map((world) => ({
          id,
          world,
          furigana: true,
          defJa: true,
          englishFolds: true,
          tapToDefine: true,
          offline: true,
        })),
      ),
    });
  if (name.startsWith('personal-host-'))
    Object.assign(r, {
      schemaVersion: 2,
      runId: c.runId,
      status: 'PASS',
      completed: true,
      engine: name.slice('personal-host-'.length),
      browserVersion: '153',
      errors: [],
      ...Object.fromEntries(HOST_CASES.map((id) => [id, true])),
    });
  if (name === 'redesign-language')
    Object.assign(r, {
      artifact: c.site,
      results: ids.map((id) => {
        const [language, room] = id.split('/');
        const view = LANGUAGE_ROOM_VIEWS[room];
        return {
          room,
          language,
          view,
          shell: { view, stamp: LANGUAGE_STAMPS[view], quiet: false, activeTabs: 1, tabs: 1 },
          issues: [],
          contractIssues: [],
          inspected: language === 'EN' ? 12 : 0,
        };
      }),
      errors: [],
      issues: [],
    });
  if (name === 'places-layout')
    Object.assign(r, {
      suite: 'places-layout',
      pass: true,
      passed: PLACES_CASES.length,
      failed: 0,
      completedAt: '2026-10-19T00:00:00Z',
    });
  if (name === 'experience-require-skip')
    Object.assign(r, {
      checks: ids.map((id) => ({
        id,
        status: 'pass',
        expected: 'contract',
        observed: 'actual observation',
      })),
      requiredSkip: true,
      root: c.site,
      summary: { passed: EXPERIENCE_CASES.length, failed: 0, skipped: 0 },
      finished: '2026-10-19T00:00:00Z',
      finalState: { taken: [{}] },
      pageErrors: [],
      providerRequests: [],
      assetsChangedDuringRun: false,
      assetHashes: c.runtimeFiles,
      assetHashesAtEnd: c.runtimeFiles,
    });
  if (name === 'deck-player-browser')
    Object.assign(r, {
      schemaVersion: 2,
      runId: c.runId,
      scope: 'full',
      failures: 0,
      engines: ['chromium', 'webkit'],
      browserVersions: { chromium: '153', webkit: '26' },
      results: ids.map((id) => {
        const [engine, key, ...suffix] = id.split('/');
        const site = KOTOBA_SITES.find((s) => s.id === key),
          pilot = Number(key.slice(1)) >= 47 && Number(key.slice(1)) <= 54;
        return {
          engine: engine === 'data' ? null : engine,
          caseId: key + (!pilot && suffix.length ? '/' + suffix.join('/') : ''),
          fixture: pilot
            ? { deckId: suffix[0], wordId: suffix[1], cardId: suffix[2], cardSha256: suffix[3] }
            : null,
          name: site.name,
          pass: true,
        };
      }),
    });
  return r;
}
function damage(r, name, mode) {
  let rows = r.results;
  if (
    [
      'personal-collections-contract',
      'personal-collections-browser',
      'redesign-foundation',
      'experience-require-skip',
    ].includes(name)
  )
    rows = r.checks;
  if (name === 'n2n1-decks-browser') rows = r.tours;
  if (name.startsWith('personal-host-')) {
    r[HOST_CASES[0]] = false;
    return;
  }
  if (mode === 'drop') rows.pop();
  if (mode === 'dup') rows[1] = structuredClone(rows[0]);
  if (mode === 'empty') rows.length = 0;
}
for (const name of Object.keys(deckReportContracts))
  test(`${name}: complete exact receipt and negative rosters`, () => {
    const c = context(name),
      good = fixture(name, c);
    assert.deepEqual(validateDeckReport(name, good, c).errors, [], name);
    for (const mode of ['drop', 'dup', 'empty']) {
      const r = structuredClone(good);
      damage(r, name, mode);
      assert.equal(validateDeckReport(name, r, c).passed, false, `${name}/${mode}`);
    }
    for (const args of [['--case='], ['--case=tap'], ['--core-only']])
      assert.equal(validateDeckReport(name, good, { ...c, args }).passed, false);
    assert.equal(
      validateDeckReport(name, good, { ...c, env: { ...c.env, KOTOBA_ONLY: '' } }).passed,
      false,
    );
  });
test('all malformed reports, empty rosters and unknown producers reject', () => {
  for (const name of Object.keys(deckReportContracts))
    for (const r of [null, {}, { results: [null], checks: [null], passed: 999, failed: 0 }])
      assert.equal(validateDeckReport(name, r, context(name)).passed, false, name);
  assert.equal(validateDeckReport('unidentified', {}).passed, false);
});
test('rich evidence, identity, SKIP and fixture identities cannot be self-certified', () => {
  for (const [name, mutate] of [
    [
      'personal-collections-contract',
      (r) => {
        r.sources[0].sha256 = 'b'.repeat(64);
      },
    ],
    [
      'personal-collections-contract',
      (r) => {
        r.runId = 'stale';
      },
    ],
    [
      'personal-host-chromium',
      (r) => {
        r.errors.push('page error');
      },
    ],
    [
      'personal-host-webkit',
      (r) => {
        r.engine = 'chromium';
      },
    ],
    [
      'redesign-foundation',
      (r) => {
        r.horizontalSamples[0].noHorizontalScroll = false;
      },
    ],
    [
      'redesign-docks',
      (r) => {
        r.results[0].browserVersion = '';
      },
    ],
    [
      'redesign-language',
      (r) => {
        r.results[0].shell.stamp = 'wrong';
      },
    ],
    [
      'redesign-language',
      (r) => {
        r.results[0].contractIssues.push('wrong chrome');
      },
    ],
    [
      'n2n1-decks-browser',
      (r) => {
        r.decks[0].cards = 999;
      },
    ],
    [
      'n2n1-decks-browser',
      (r) => {
        r.tours[0].offline = false;
      },
    ],
    [
      'experience-require-skip',
      (r) => {
        r.requiredSkip = false;
      },
    ],
    [
      'experience-require-skip',
      (r) => {
        r.assetHashesAtEnd = { ...r.assetHashesAtEnd, 'corridor.js': 'b'.repeat(64) };
      },
    ],
    [
      'deck-player-browser',
      (r) => {
        r.results.find((row) => row.fixture).fixture.cardSha256 = 'b'.repeat(64);
      },
    ],
    [
      'deck-player-browser',
      (r) => {
        const a = r.results.filter((row) => row.fixture && row.caseId === 'K047');
        a[1].fixture = structuredClone(a[0].fixture);
      },
    ],
    [
      'deck-player-browser',
      (r) => {
        r.results.find(
          (row) =>
            !row.fixture && !KOTOBA_SITES.find((s) => s.id === row.caseId?.split('/')[0])?.dynamic,
        ).name = 'weaker substitute';
      },
    ],
    [
      'deck-player-browser',
      (r) => {
        r.scope = 'partial:tap';
      },
    ],
    [
      'deck-player-browser',
      (r) => {
        r.results[0].pass = false;
      },
    ],
  ]) {
    const r = fixture(name);
    mutate(r);
    assert.equal(validateDeckReport(name, r, context(name)).passed, false, name);
  }
});
test('producer-specific engine scopes are enforced', () => {
  assert.equal(
    validateDeckReport('personal-host-webkit', fixture('personal-host-webkit'), {
      ...context('personal-host-webkit'),
      env: {},
    }).passed,
    false,
  );
  assert.equal(
    validateDeckReport('personal-collections-browser', fixture('personal-collections-browser'), {
      ...context('personal-collections-browser'),
      env: { PERSONAL_BROWSERS: 'chromium' },
    }).passed,
    false,
  );
  assert.equal(
    validateDeckReport('redesign-foundation', fixture('redesign-foundation'), {
      ...context('redesign-foundation'),
      engine: 'webkit',
      env: { KAIRO_BROWSER: 'webkit' },
    }).passed,
    false,
  );
  for (const [name, narrowed] of [
    ['personal-collections-browser', { PERSONAL_BROWSERS: 'chromium' }],
    ['redesign-foundation', { KAIRO_BROWSER: 'chromium' }],
  ]) {
    const single = fixture(name);
    single.checks = single.checks.filter((row) =>
      typeof row === 'string' ? row.startsWith('chromium: ') : row.engine === 'chromium',
    );
    if (single.horizontalSamples)
      single.horizontalSamples = single.horizontalSamples.filter((x) => x.engine === 'chromium');
    single.browsers &&= ['chromium'];
    single.browserVersions = { chromium: single.browserVersions.chromium };
    for (const c of [
      context(name),
      { ...context(name), engine: 'chromium', env: { ...context(name).env, ...narrowed } },
    ])
      assert.equal(validateDeckReport(name, single, c).passed, false, `${name} single engine`);
    assert.deepEqual(
      deckReportContracts[name].expectedCases('chromium', {
        ...context(name),
        env: narrowed,
      }),
      deckReportContracts[name].expectedCases('all', context(name)),
      `${name} roster is independent of the declaration`,
    );
  }
  for (const [name, mutate] of [
    ['personal-collections-browser', (r) => delete r.browserVersions.webkit],
    ['personal-collections-browser', (r) => (r.browserVersions.chromium = '')],
    ['personal-collections-browser', (r) => delete r.browserVersions],
    ['personal-collections-browser', (r) => (r.executableOverride = true)],
    ['personal-collections-browser', (r) => delete r.executableOverride],
    ['redesign-foundation', (r) => delete r.browserVersions.chromium],
    ['redesign-foundation', (r) => (r.browserVersions.webkit = '')],
    ['redesign-foundation', (r) => delete r.browserVersions],
    ['redesign-docks', (r) => delete r.results.at(-1).browserVersion],
    ['personal-host-webkit', (r) => delete r.browserVersion],
  ]) {
    const r = fixture(name);
    mutate(r);
    assert.equal(validateDeckReport(name, r, context(name)).passed, false, `${name} version`);
  }
  assert.deepEqual(PAIRED_ENGINES, ['chromium', 'webkit']);
  for (const name of [
    'places-layout',
    'experience-require-skip',
    'redesign-language',
    'n2n1-decks-browser',
    'legacy-drift-storage',
  ])
    assert.equal(
      validateDeckReport(name, fixture(name), { ...context(name), engine: 'webkit' }).passed,
      false,
      name,
    );
});
test('independent published obligation counts cover all variants', () => {
  assert.equal(LANGUAGE_ROOMS.length, 115);
  // INT-VH (2026-10-19): +1 Hfix-1B places row (switch back · Settings offers no Layout again)
  assert.equal(PLACES_CASES.length, 93);
  assert.equal(EXPERIENCE_CASES.length, 42);
  // INT-VH (2026-10-19): +2 Hfix-1B deck rows (K161, K162)
  assert.equal(KOTOBA_SITES.length, 154);
});
test('served-site identity compares real paths on both sides', () => {
  const field = {
    'n2n1-decks-browser': 'site',
    'redesign-language': 'artifact',
    'experience-require-skip': 'root',
  };
  for (const [name, key] of Object.entries(field)) {
    const good = fixture(name);
    for (const site of [SITE_LINK, `${SITE}/`, `${SITE_LINK}/`]) {
      assert.deepEqual(
        validateDeckReport(name, good, { ...context(name), site }).errors,
        [],
        `${name} context ${site}`,
      );
      assert.deepEqual(
        validateDeckReport(name, { ...good, [key]: site }, context(name)).errors,
        [],
        `${name} receipt ${site}`,
      );
    }
    for (const site of [OTHER_SITE, join(SITE, 'missing'), ''])
      assert.equal(
        validateDeckReport(name, { ...good, [key]: site }, context(name)).passed,
        false,
        `${name} foreign ${site}`,
      );
  }
});
test('redesign-language admits the receipt where the producer path resolution writes it', () => {
  const runnerTemp = mkdtempSync(join(tmpdir(), 'vh-language-')),
    gate = join(runnerTemp, 'redesign-language');
  const child = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      [
        `import { resolveCorridorEvidence } from ${JSON.stringify(new globalThis.URL('../resolve-corridor-site.mjs', import.meta.url).href)};`,
        `import { uiLanguageReportPath } from ${JSON.stringify(new globalThis.URL('../../tools/ui-language-report.mjs', import.meta.url).href)};`,
        'process.stdout.write(uiLanguageReportPath(resolveCorridorEvidence()));',
      ].join('\n'),
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, KAIRO_EVIDENCE_DIR: gate, CI: '1', RUNNER_TEMP: runnerTemp },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  const written = child.stdout;
  mkdirSync(dirname(written), { recursive: true });
  writeFileSync(written, JSON.stringify(fixture('redesign-language')));
  const [declared] = deckReportContracts['redesign-language'].paths;
  const found = receiptPaths(gate, declared);
  assert.equal(realpathSync(found), realpathSync(written));
  assert.throws(() => receiptPaths(gate, 'report.json'), /got 0/u);
  assert.deepEqual(
    validateDeckReport(
      'redesign-language',
      JSON.parse(readFileSync(found, 'utf8')),
      context('redesign-language'),
    ).errors,
    [],
  );
});
test('independent observed producer receipts meet the pinned rosters', () => {
  const language = structuredClone(observedReceipts['redesign-language'].report);
  language.artifact = SITE;
  const c = context('redesign-language');
  assert.deepEqual(validateDeckReport('redesign-language', language, c).errors, []);
  const japanese = language.results.findLastIndex((row) => row.language === '日本語');
  for (const mutate of [
    (r) => r.results.splice(japanese, 1),
    (r) => r.results.push({ ...r.results[0], room: 'undeclared-room' }),
    (r) => (r.results[1] = structuredClone(r.results[0])),
    (r) => (r.results = r.results.filter((row) => row.language === 'EN')),
  ]) {
    const bad = structuredClone(language);
    mutate(bad);
    assert.equal(validateDeckReport('redesign-language', bad, c).passed, false);
  }

  const foundation = context('redesign-foundation');
  assert.deepEqual(
    validateDeckReport(
      'redesign-foundation',
      observedReceipts['redesign-foundation'].report,
      foundation,
    ).errors,
    [
      'Served report needs its own site, artifact and attempt identity',
      'Foundation always runs both engines; engine/version evidence missing',
    ],
  );
  const syntheticIdentity = {
    site: foundation.site,
    runId: foundation.runId,
    artifactSha256: foundation.artifactSha256,
    browserVersions: { chromium: '153.0.7258.5', webkit: '26.0' },
  };
  const versioned = {
    ...structuredClone(observedReceipts['redesign-foundation'].report),
    ...syntheticIdentity,
  };
  assert.deepEqual(validateDeckReport('redesign-foundation', versioned, foundation).errors, []);
  const partial = {
    ...structuredClone(observedReceipts['redesign-foundation-partial'].report),
    ...syntheticIdentity,
  };
  assert(
    validateDeckReport('redesign-foundation', partial, foundation).errors.includes(
      'Missing/duplicate/extra/wrong-engine case',
    ),
  );
  const extra = structuredClone(versioned);
  extra.checks.push({ ...extra.checks[0], width: 1440 });
  extra.horizontalSamples.push({ ...extra.horizontalSamples[0], width: 1440 });
  assert.equal(validateDeckReport('redesign-foundation', extra, foundation).passed, false);

  const personal = observedReceipts['personal-collections-contract'].report,
    pc = {
      ...context('personal-collections-contract'),
      runId: personal.runId,
      verifierSha256: personal.verifierSha256,
      sourceFiles: Object.fromEntries(personal.sources.map((x) => [x.path, x.sha256])),
    };
  assert.deepEqual(validateDeckReport('personal-collections-contract', personal, pc).errors, []);
  for (const mutate of [
    (r) => r.checks.pop(),
    (r) => r.checks.push('an undeclared extra completion'),
    (r) => (r.checks[1] = r.checks[0]),
  ]) {
    const bad = structuredClone(personal);
    mutate(bad);
    assert.equal(validateDeckReport('personal-collections-contract', bad, pc).passed, false);
  }
});
test('redesign-language rows need a known pinned view, its stamp and actual English inspections', () => {
  const c = context('redesign-language'),
    good = fixture('redesign-language');
  assert.deepEqual(validateDeckReport('redesign-language', good, c).errors, []);
  const en = good.results.findIndex((row) => row.language === 'EN' && row.room === 'reader'),
    ja = good.results.findIndex((row) => row.language === '日本語');
  for (const mutate of [
    (r) => {
      r.results[en] = {
        room: 'reader',
        language: 'EN',
        issues: [],
        contractIssues: [],
        inspected: 0,
        shell: { quiet: true, activeTabs: 0 },
      };
    },
    (r) => {
      delete r.results[en].view;
      delete r.results[en].shell.view;
      delete r.results[en].shell.stamp;
    },
    (r) => (r.results[en].inspected = 0),
    (r) => delete r.results[en].inspected,
    (r) => (r.results[en].inspected = 1.5),
    (r) => (r.results[ja].inspected = -1),
    (r) => {
      r.results[en].view = 'shelf';
      r.results[en].shell.view = 'shelf';
      r.results[en].shell.stamp = 'shelf';
    },
    (r) => {
      r.results[en].view = 'constructor';
      r.results[en].shell.view = 'constructor';
      r.results[en].shell.stamp = undefined;
    },
    (r) => (r.results[en].shell.view = 'shelf'),
    (r) => delete r.results[en].shell.quiet,
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.equal(validateDeckReport('redesign-language', bad, c).passed, false, String(mutate));
  }
  assert.equal(Object.keys(LANGUAGE_ROOM_VIEWS).length, LANGUAGE_ROOMS.length);
  assert(Object.values(LANGUAGE_ROOM_VIEWS).every((view) => Object.hasOwn(LANGUAGE_STAMPS, view)));
  const observed = observedReceipts['redesign-language'].report;
  assert.deepEqual(
    Object.fromEntries(observed.results.map((row) => [row.room, row.view])),
    LANGUAGE_ROOM_VIEWS,
  );
});
test('served personal-collections and foundation reports bind their own site, attempt and artifact', () => {
  for (const name of ['personal-collections-browser', 'redesign-foundation']) {
    const c = context(name),
      good = fixture(name, c);
    assert.deepEqual(validateDeckReport(name, good, c).errors, [], name);
    for (const mutate of [
      (r) => delete r.site,
      (r) => (r.site = OTHER_SITE),
      (r) => (r.site = join(SITE, 'missing')),
      (r) => delete r.runId,
      (r) => (r.runId = 'stale-attempt'),
      (r) => delete r.artifactSha256,
      (r) => (r.artifactSha256 = 'b'.repeat(64)),
    ]) {
      const bad = structuredClone(good);
      mutate(bad);
      assert.equal(validateDeckReport(name, bad, c).passed, false, `${name} ${mutate}`);
    }
    for (const patch of [{ runId: '' }, { site: '' }, { artifactVerifiedBeforeAndAfter: false }])
      assert.equal(validateDeckReport(name, good, { ...c, ...patch }).passed, false, name);
    for (const site of [SITE_LINK, `${SITE}/`])
      assert.deepEqual(
        validateDeckReport(name, { ...good, site }, c).errors,
        [],
        `${name} ${site}`,
      );
  }
});

// Hfix-2c adds one completion without renumbering the existing VH check sites.
test('Kotoba requires the early-choice K163 and the exact againCoachSeen K092 name', () => {
  const c = { ...context('deck-player-browser'), engine: 'chromium' };
  const good = fixture('deck-player-browser', c);
  good.engines = ['chromium'];
  good.browserVersions = { chromium: '153' };
  assert.equal(good.results.length, 179);
  assert.deepEqual(validateDeckReport('deck-player-browser', good, c).errors, []);
  const early = good.results.findIndex((row) => row.caseId === 'K163');
  const coach = good.results.findIndex((row) => row.caseId === 'K092');
  assert(early >= 0 && coach >= 0);
  assert(good.results[coach].name.endsWith('(prefs againCoachSeen)'));
  for (const mutate of [
    (r) => r.results.splice(early, 1),
    (r) => r.results.push(structuredClone(r.results[early])),
    (r) => {
      r.results[coach].name = r.results[coach].name.replace('againCoachSeen', 'ruleSeen');
    },
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.equal(validateDeckReport('deck-player-browser', bad, c).passed, false);
  }
});
