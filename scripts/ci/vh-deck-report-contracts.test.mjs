/* global structuredClone */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DECK_CASES,
  deckReportContracts,
  validateDeckReport,
  PERSONAL_SOURCES,
  PLACES_CASES,
  LANGUAGE_ROOMS,
  EXPERIENCE_CASES,
  EXPERIENCE_ASSETS,
  HOST_CASES,
  KOTOBA_PILOTS,
  KOTOBA_SITES,
} from './vh-deck-report-contracts.mjs';
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
  site: '/immutable/site',
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
    engine: ['redesign-docks', 'personal-collections-browser', 'deck-player-browser'].includes(name)
      ? 'all'
      : 'chromium',
    env: name === 'personal-host-webkit' ? { PERSONAL_HOST_BROWSER: 'webkit' } : {},
  };
}
function fixture(name, c = context(name)) {
  const ids = deckReportContracts[name].expectedCases(c.engine, c),
    rows = ids.map((name) => ({ name, pass: true }));
  const r = { results: rows, artifactSha256: hash, verifierSha256: hash, site: c.site };
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
    Object.assign(r, { status: 'passed', checks: ids, browsers: ['chromium', 'webkit'] });
  if (name === 'redesign-foundation') {
    r.checks = ids.map((id) => {
      const [engine, width, lang] = id.split('/');
      return { engine, width: Number(width), lang, passed: true };
    });
    Object.assign(r, {
      diagnostics: [],
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
        return {
          room,
          language,
          view: 'shelf',
          shell: { view: 'shelf', stamp: 'shelf', quiet: false, activeTabs: 1, tabs: 1 },
          issues: [],
          contractIssues: [],
          inspected: 12,
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
  assert.equal(PLACES_CASES.length, 92);
  assert.equal(EXPERIENCE_CASES.length, 42);
  assert.equal(KOTOBA_SITES.length, 151);
});
