/** Pure receipt-consumer tests. Synthetic fixtures are never runtime acceptance evidence. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  registerKt3ProofTests,
  kt3LabelContract,
  KT3_CONTROL_MUTATIONS,
} from '../../prototypes/corridor/tools/hfix2e-kt3-proof.test.mjs';
import {
  BATCH3_SUITES,
  BATCH3_DYNAMIC_SOURCES,
  batch3CanonicalEnvironment,
  validateBatch3Native,
  makeBatch3Admission,
  batch3NativeFile,
  batch3Digest,
  readBatch3Evidence,
  validateBatch3Admission,
  E2_BASE_TOOL,
  E2_BASE_COMMITS,
  E2_BASE_FILES,
  readBatch3Base,
} from './vh-batch3-report-contracts.mjs';
const sha = 'a'.repeat(64),
  sha2 = 'b'.repeat(64);
import { unitFixture } from './fixtures/vh-batch3/fixture.mjs';
registerKt3ProofTests();
const kt3 = kt3LabelContract(
  JSON.parse(
    readFileSync(
      new URL('../../prototypes/corridor/data/share_alike/reference-extra.json', import.meta.url),
      'utf8',
    ),
  ),
);
function sample(suite, engine) {
  const native = unitFixture(suite, engine),
    value = native.value,
    sweep = native.extras.sweep || null;
  if (suite === 'hfix2e-x10-kt3') {
    // Explicit synthetic successor fixture; retained historical native receipts are never changed.
    value.kt3Source = { ...kt3.source };
    value.kt3Control = null;
    for (const row of value.rows.filter((r) => r.item === 'KT3')) {
      for (const [glyph, expected] of Object.entries(kt3.cases))
        row.detail[glyph].label = expected.expected;
    }
  }
  const identity = {
    schemaVersion: 1,
    product: 'KAIRO',
    sourceDirty: false,
    gitSha: value.gitSha || value.build || value.identity?.gitSha || '1'.repeat(40),
    artifactSha256: value.artifactSha256 || value.artifact || value.identity?.artifactSha256 || sha,
  };
  const sources = Object.fromEntries(
    [
      `prototypes/corridor/tools/verify-${suite}.mjs`,
      `scripts/ci/run-${suite}-gate.mjs`,
      'scripts/ci/run-batch3-gate.mjs',
      'scripts/ci/vh-batch3-report-contracts.mjs',
      'scripts/ci/vh-batch3-rosters.json',
    ].map((path) => [path, sha]),
  );
  for (const path of BATCH3_DYNAMIC_SOURCES[suite] || []) sources[path] = sha;
  if (value.verifierSha256)
    sources[`prototypes/corridor/tools/verify-${suite}.mjs`] = value.verifierSha256;
  if (value.adapter)
    sources[`prototypes/corridor/tools/verify-${suite}.mjs`] = value.adapter.adapterSha256;
  if (sweep) {
    sources['prototypes/corridor/tools/verify-contrast-sweep.mjs'] = sweep.verifierSha256;
    sources['prototypes/corridor/tools/vh-contrast-arrival.mjs'] = sweep.arrivalPredicateSha256;
  }
  const pins = {
    suite,
    engine,
    runId: sweep?.runId || 'explicit-unit-fixture',
    siteDir: value.site || '/unit-fixture/site',
    identity,
    sources,
    baseline:
      suite === 'hfix2e2'
        ? {
            head: identity.gitSha,
            reverted: E2_BASE_COMMITS.map((commit) => commit.slice(0, 8)),
            files: [...E2_BASE_FILES],
            sha256: {
              'corridor.js': batch3Digest('synthetic corridor'),
              'editorial.css': batch3Digest('synthetic editorial'),
            },
          }
        : null,
  };
  const extras = sweep ? { sweep, runnerSha256: value.adapter?.runnerSha256 || sha } : {};
  if (suite === 'hfix2e2') {
    sources[E2_BASE_TOOL] = sha;
    extras.baseline = {
      dir: '/unit-fixture/e2-base',
      metadata: structuredClone(pins.baseline),
      files: {},
    };
    value.base = {
      dir: extras.baseline.dir,
      sha256: Object.values(pins.baseline.sha256),
      head: identity.gitSha,
    };
  }
  return {
    value,
    pins,
    extras,
    files: { 'unit-fixture.json': sha },
  };
}
for (const suite of BATCH3_SUITES)
  for (const engine of ['chromium', 'webkit']) {
    test(`${suite}/${engine}: synthetic complete receipt is internally consistent`, () => {
      const f = sample(suite, engine);
      assert.equal(validateBatch3Native(f.value, f.pins, f.extras), true);
    });
    test(`${suite}/${engine}: a summary cannot hide missing, duplicate, reordered or red occurrences`, () => {
      for (const mutate of [
        (rows) => rows.pop(),
        (rows) => rows.push(structuredClone(rows[0])),
        (rows) => rows.reverse(),
        (rows) => {
          rows[0].pass = false;
        },
      ]) {
        const f = sample(suite, engine);
        if (suite === 'hfix2e-contrast') {
          const rs = f.extras.sweep.results;
          if (mutate.toString().includes('.pass'))
            rs[0].pairs.filter((p) => /thes-(?:gloss|rel)/u.test(p.sel))[0].ok = false;
          else mutate(rs);
        } else mutate(f.value.checks || f.value.rows || f.value.results);
        assert.throws(() => validateBatch3Native(f.value, f.pins, f.extras));
      }
    });
    test(`${suite}/${engine}: foreign engine, artifact and native failure never become acceptance`, () => {
      const f = sample(suite, engine);
      const evidence = { value: f.value, extras: f.extras, files: f.files };
      const child = {
        status: 0,
        signal: null,
        error: null,
        argv: [`prototypes/corridor/tools/verify-${suite}.mjs`],
      };
      evidence.child = child;
      makeBatch3Admission(evidence, f.pins, child);
      for (const change of [
        { status: 1 },
        { status: null, signal: 'SIGTERM' },
        { error: 'spawn failed' },
        { argv: [...child.argv, '--only'] },
      ])
        assert.throws(() => makeBatch3Admission(evidence, f.pins, { ...child, ...change }));
      const foreign = { ...f.pins, engine: engine === 'webkit' ? 'chromium' : 'webkit' };
      assert.throws(() => validateBatch3Native(f.value, foreign, f.extras));
      if (suite !== 'hfix2b')
        assert.throws(() =>
          validateBatch3Native(
            f.value,
            { ...f.pins, identity: { ...f.pins.identity, artifactSha256: sha2 } },
            f.extras,
          ),
        );
    });
    test(`${suite}/${engine}: canonical environment removes controls and selectors`, () => {
      const env = batch3CanonicalEnvironment(
        {
          HFIX2E_CASE: 'KT6-F',
          HFIX2E_MODE: 'base',
          HFIX2E2_MODE: 'control',
          HFIX2E2_SERVE_DIR: '/foreign',
          HFIX2E2_BASE_SHA: 'foreign',
          HFIX2E2_BASE_DIR: '/foreign-base',
          HFIX2E2_BASE_SHA256: `${sha},${sha2}`,
          KAIRO_HFIX2B_BASE: '1',
          KAIRO_HFIX2B_CONTROL: 'why',
          SWEEP_WORLDS: 'nami',
          SWEEP_STATES: 'learn',
          GIT_DIR: '/foreign-repository',
          GIT_WORK_TREE: '/foreign-source',
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'core.worktree',
          GIT_CONFIG_VALUE_0: '/foreign-source',
        },
        suite,
        engine,
      );
      assert.equal(env.KAIRO_BROWSER, engine);
      assert.equal(env.HFIX2E_MODE, 'branch');
      assert.equal(env.HFIX2E2_MODE, 'branch');
      for (const key of [
        'HFIX2E_CASE',
        'HFIX2E2_SERVE_DIR',
        'HFIX2E2_BASE_SHA',
        'HFIX2E2_BASE_DIR',
        'HFIX2E2_BASE_SHA256',
        'KAIRO_HFIX2B_BASE',
        'KAIRO_HFIX2B_CONTROL',
        'SWEEP_WORLDS',
        'SWEEP_STATES',
      ])
        assert(!Object.hasOwn(env, key));
      assert.equal(env.HFIX2E_CENTRE, '元気');
      assert(!Object.hasOwn(env, 'HFIX2E2_BASE_SHA'));
      if (suite === 'hfix2e2') assert(!Object.keys(env).some((key) => key.startsWith('GIT_')));
    });
  }
test('X19 retains unrelated diagnostic reds; a target red, missing scene, stale nonce or false app-wide acceptance fails', () => {
  const f = sample('hfix2e-contrast', 'chromium');
  assert.equal(f.value.sweepExit, 1);
  assert.equal(f.extras.sweep.selectedPassed, false);
  assert(
    f.extras.sweep.results.some((r) =>
      r.pairs.some((p) => !p.ok && !/thes-(?:gloss|rel)/u.test(p.sel)),
    ),
  );
  validateBatch3Native(f.value, f.pins, f.extras);
  for (const mutate of [
    (x) => {
      x.extras.sweep.runId = 'stale';
    },
    (x) => {
      x.extras.sweep.fullAcceptance = true;
    },
    (x) => {
      x.value.sweepExit = null;
    },
    (x) => {
      x.value.adapter.originalSha256 = sha2;
    },
    (x) => {
      x.extras.runnerSha256 = sha2;
    },
    (x) => {
      x.extras.sweep.results[0].pairs.find((p) => /thes-rel/u.test(p.sel)).ratio = 4.49;
    },
  ]) {
    const x = structuredClone(f);
    mutate(x);
    assert.throws(() => validateBatch3Native(x.value, x.pins, x.extras));
  }
});
test('KT6 cannot become vacuous or omit the same-kanji rows', () => {
  for (const mutate of [
    (x) => {
      x.value.results.find((r) => r.name === 'KT6-B').detail.examples = [];
    },
    (x) => {
      x.value.results.find((r) => r.name === 'KT6-D').detail['押える'].own = 0;
    },
    (x) => {
      x.value.results.find((r) => r.name === 'KT6-G').detail['首'].lent = ['頭'];
    },
    (x) => {
      x.value.results.find((r) => r.name === 'KT6-F').detail.examples = ['愛'];
    },
    (x) => {
      x.value.mode = 'control';
    },
  ]) {
    const x = sample('hfix2e-examples', 'webkit');
    mutate(x);
    assert.throws(() => validateBatch3Native(x.value, x.pins));
  }
});
test('Hold must seal once, keep the later strip and route right-click/keyboard to the strip', () => {
  for (const mutate of [
    (x) => {
      x.value.results[0].detail.second.after.count++;
    },
    (x) => {
      x.value.results[0].detail.later.covered.push({ id: 'other-control' });
    },
    (x) => {
      x.value.results.find((r) => r.name === 'W7-right').detail.after.mini = true;
    },
    (x) => {
      x.value.results.find((r) => r.name === 'W7-key').detail.focusInStrip = false;
    },
  ]) {
    const x = sample('hfix2e-hold', 'chromium');
    mutate(x);
    assert.throws(() => validateBatch3Native(x.value, x.pins));
  }
});
test('X10 must actually save once and KT3 must have one real accessible glyph', () => {
  for (const mutate of [
    (x) => {
      x.value.rows[1].detail.barPressFolded.after = 0;
    },
    (x) => {
      x.value.rows[3].detail['食'].byRole = 0;
    },
    (x) => {
      x.value.only = 'KT3';
    },
  ]) {
    const x = sample('hfix2e-x10-kt3', 'webkit');
    mutate(x);
    assert.throws(() => validateBatch3Native(x.value, x.pins));
  }
});
test('KT3 consumer rejects old, incomplete, appended, glyph-less and primary-less labels', () => {
  for (const label of [
    '稿 — draft',
    kt3.cases['稿'].expected + '; unrelated text',
    kt3.cases['稿'].expected.slice(1).trimStart(),
    kt3.cases['稿'].expected.replace(`${kt3.cases['稿'].primary}; `, ''),
    kt3.cases['稿'].primary,
  ]) {
    const x = sample('hfix2e-x10-kt3', 'chromium');
    x.value.rows[3].detail['稿'].label = label;
    assert.throws(() => validateBatch3Native(x.value, x.pins));
  }
});
test('KT3 consumer rejects absent/foreign provenance and a control-labelled native receipt', () => {
  for (const mutate of [
    (x) => {
      delete x.value.kt3Source;
    },
    (x) => {
      x.value.kt3Source.projectedSha256 = sha;
    },
    (x) => {
      delete x.pins.sources['prototypes/corridor/data/share_alike/reference-extra.json'];
    },
    (x) => {
      x.value.kt3Control = 'missing-glyph';
    },
  ]) {
    const x = sample('hfix2e-x10-kt3', 'webkit');
    mutate(x);
    assert.throws(() => validateBatch3Native(x.value, x.pins));
  }
});
test('KT3 three native control selectors are stripped from the full gate environment', () => {
  for (const engine of ['chromium', 'webkit'])
    for (const control of Object.keys(KT3_CONTROL_MUTATIONS)) {
      const env = batch3CanonicalEnvironment(
        { HFIX2E_MODE: 'control', HFIX2E_KT3_CONTROL: control },
        'hfix2e-x10-kt3',
        engine,
      );
      assert.equal(env.HFIX2E_MODE, 'branch');
      assert(!Object.hasOwn(env, 'HFIX2E_KT3_CONTROL'));
    }
});
test('Hfix2b rejects zero sampled nodes, no held crossing and changed recorded reason', () => {
  for (const mutate of [
    (x) => {
      x.value.checks[0].detail = '0 rows, 0 still cut';
    },
    (x) => {
      x.value.checks[18].detail = x.value.checks[18].detail.replace(
        /carried [\d.]+px/u,
        'carried 0px',
      );
    },
    (x) => {
      x.value.checks[14].detail = x.value.checks[14].detail.replace(
        'you marked it not yet',
        'made up',
      );
    },
    (x) => {
      x.value.control = 'edge';
    },
  ]) {
    const x = sample('hfix2b', 'webkit');
    mutate(x);
    assert.throws(() => validateBatch3Native(x.value, x.pins));
  }
});
test('E2 requires the trace, motion under load ceiling, full unchanged record, all599 regions and all four Nami targets', () => {
  for (const [prefix, mutate] of [
    [
      'G61.fade ',
      (d) => {
        d.fading = 2;
      },
    ],
    [
      'G61 · ',
      (d) => {
        d.load = 21;
      },
    ],
    [
      'G61.record ',
      (d) => {
        d.record.after = sha2;
      },
    ],
    [
      'G61.press ',
      (d) => {
        d.count = 598;
      },
    ],
    [
      'NAMI.tools.pointer ',
      (d) => {
        d.ratio = 4.59;
      },
    ],
    [
      'NAMI.sweep ',
      (d) => {
        d.exit = null;
      },
    ],
  ]) {
    const x = sample('hfix2e2', 'webkit');
    mutate(x.value.rows.find((r) => r.name.startsWith(prefix)).detail);
    assert.throws(() => validateBatch3Native(x.value, x.pins, x.extras));
  }
  const x = sample('hfix2e2', 'webkit');
  x.value.only = ['G61'];
  assert.throws(() => validateBatch3Native(x.value, x.pins, x.extras));
});

for (const suite of BATCH3_SUITES)
  test(`${suite}: immutable envelope rejects replay, altered files and symlinks`, () => {
    const f = sample(suite, 'webkit');
    const parent = join(homedir(), '.dharma', 'bunki', 'vh-batch3-consumer-tests');
    mkdirSync(parent, { recursive: true });
    const out = mkdtempSync(join(parent, 'unit-'));
    const put = (name, value) => writeFileSync(join(out, name), JSON.stringify(value));
    try {
      if (f.extras.sweep) {
        const runner =
          suite === 'hfix2e-contrast' ? 'hfix2e-contrast-runner.mjs' : 'hfix2e2-nami-runner.mjs';
        const bytes = '// Explicit nonexecuted unit-test runner bytes.\n';
        writeFileSync(join(out, runner), bytes);
        f.extras.runnerSha256 = batch3Digest(bytes);
        if (f.value.adapter) f.value.adapter.runnerSha256 = f.extras.runnerSha256;
        put('sweep-webkit.json', f.extras.sweep);
        put('contrast-sweep.json', f.extras.sweep);
      }
      if (suite === 'hfix2e2') {
        const dir = join(out, 'e2-base');
        mkdirSync(dir);
        writeFileSync(join(dir, 'corridor.js'), 'synthetic corridor');
        writeFileSync(join(dir, 'editorial.css'), 'synthetic editorial');
        writeFileSync(join(dir, 'base.json'), JSON.stringify(f.pins.baseline));
        f.value.base.dir = dir;
        put('base-process.json', {
          argv: [E2_BASE_TOOL, '--head', f.pins.identity.gitSha, '--out', dir],
          status: 0,
          signal: null,
          error: null,
        });
      }
      const name = batch3NativeFile(suite, 'webkit');
      put(name, f.value);
      const child = {
        argv: [`prototypes/corridor/tools/verify-${suite}.mjs`],
        status: 0,
        signal: null,
        error: null,
      };
      put('native-process.json', child);
      const evidence = readBatch3Evidence(out, f.pins);
      const receipt = makeBatch3Admission(evidence, f.pins, child);
      assert.equal(validateBatch3Admission(receipt, out, f.pins), true);
      for (const change of [
        { runId: 'another-attempt' },
        { siteDir: '/foreign/site' },
        { engine: 'chromium' },
        { sources: { ...f.pins.sources, [`prototypes/corridor/tools/verify-${suite}.mjs`]: sha2 } },
        { identity: { ...f.pins.identity, artifactSha256: sha2 } },
      ])
        assert.throws(() => validateBatch3Admission(receipt, out, { ...f.pins, ...change }));
      put('native-process.json', { ...child, status: 1 });
      assert.throws(() => validateBatch3Admission(receipt, out, f.pins));
      put('native-process.json', child);
      writeFileSync(join(out, name), JSON.stringify(f.value) + '\n');
      assert.throws(() => validateBatch3Admission(receipt, out, f.pins));
      put(name, f.value);
      const saved = join(out, 'saved-native.json');
      put('saved-native.json', f.value);
      rmSync(join(out, name));
      symlinkSync(saved, join(out, name));
      assert.throws(() => validateBatch3Admission(receipt, out, f.pins));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

test('Hfix2b oracle JSON inputs are mandatory source pins, not only static imports', () => {
  assert.deepEqual(BATCH3_DYNAMIC_SOURCES.hfix2b, [
    'prototypes/drift/data/wbig.json',
    'prototypes/corridor/data/share_alike/words.json',
  ]);
  for (const path of BATCH3_DYNAMIC_SOURCES.hfix2b) {
    const f = sample('hfix2b', 'webkit');
    delete f.pins.sources[path];
    assert.throws(() => validateBatch3Native(f.value, f.pins));
  }
});
test('G61 rest320 exactly follows native width bounds, scale and required observations', () => {
  const f = sample('hfix2e2', 'webkit'),
    d = f.value.rows.find((r) => r.name.startsWith('G61.rest320 ')).detail;
  d['at-320'].fresh.body = 318;
  d['at-320'].fresh.reader = 300;
  assert.equal(validateBatch3Native(f.value, f.pins, f.extras), true);
  for (const mutate of [
    (x) => {
      x['at-320'].folded.scale = 0.9;
    },
    (x) => {
      x['at-320'].fresh = null;
    },
    (x) => {
      x['at-320'].revealed = null;
    },
    (x) => {
      x['fold-390-then-320'].folded = null;
    },
    (x) => {
      x['at-320'].folded.reader = null;
    },
    (x) => {
      x['at-320'].folded.body = 321;
    },
  ]) {
    const x = structuredClone(f);
    mutate(x.value.rows.find((r) => r.name.startsWith('G61.rest320 ')).detail);
    assert.throws(() => validateBatch3Native(x.value, x.pins, x.extras));
  }
});
test('Held drag requires the native greater-than5px reach', () => {
  const f = sample('hfix2b', 'webkit');
  f.value.checks[18].detail = f.value.checks[18].detail.replace('carried 6px', 'carried 5px');
  assert.throws(() => validateBatch3Native(f.value, f.pins));
});
test('X13 cover requires the native long article, exact44px control and all covered counts zero', () => {
  for (const mutate of [
    (d) => {
      d.stops = 7;
    },
    (d) => {
      d.scrollMax = 844 * 3;
    },
    (d) => {
      d.sample.size = [45, 44];
    },
    (d) => {
      d.stopsWithPress = 1;
    },
  ]) {
    const f = sample('hfix2e2', 'webkit');
    mutate(f.value.rows.find((r) => r.name.startsWith('X13.cover ')).detail);
    assert.throws(() => validateBatch3Native(f.value, f.pins, f.extras));
  }
});

test('E2 r2 exact rows preserve physical versus counted totals', () => {
  for (const [engine, physical] of [
    ['chromium', 27],
    ['webkit', 26],
  ]) {
    const f = sample('hfix2e2', engine);
    assert.equal(f.value.rows.length, physical);
    assert.equal(f.value.total, physical - 2);
    assert.equal(f.value.rows.filter((r) => /^X13\.(look|fade) /u.test(r.name)).length, 8);
  }
});
test('E2 r2 look rejects foreign world, seam, contrast and seating', () => {
  for (const edit of [
    (d) => {
      d.world = 'nami';
    },
    (d) => {
      d.evenAcross = 0.89;
    },
    (d) => {
      d.discContrast = 2.99;
    },
    (d) => {
      d.lines = [{}];
    },
    (d) => {
      d.mark[2]--;
    },
  ]) {
    const f = sample('hfix2e2', 'webkit');
    edit(f.value.rows.find((r) => r.name.startsWith('X13.look ')).detail);
    assert.throws(() => validateBatch3Native(f.value, f.pins, f.extras));
  }
});
test('E2 r2 normal fade rejects snap, reversal and late completion', () => {
  for (const edit of [
    (d) => {
      d.opened.between = 1;
    },
    (d) => {
      d.folded.turned = 1;
    },
    (d) => {
      d.opened.doneAt = 451;
    },
    (d) => {
      d.folded.change = null;
    },
  ]) {
    const f = sample('hfix2e2', 'webkit');
    edit(f.value.rows.find((r) => r.name.startsWith('X13.fade ')).detail);
    assert.throws(() => validateBatch3Native(f.value, f.pins, f.extras));
  }
});
test('E2 r2 reduced motion rejects an intermediate first frame', () => {
  const f = sample('hfix2e2', 'webkit');
  f.value.rows.find(
    (r) => r.name.includes('X13.fade') && r.name.includes('(reduced motion)'),
  ).detail.opened.first[1] = 0.5;
  assert.throws(() => validateBatch3Native(f.value, f.pins, f.extras));
});

test('E2 baseline admission rejects caller pins, old heads, reversed hash order and missing derivation witness', () => {
  for (const engine of ['chromium', 'webkit'])
    for (const mutate of [
      (f) => {
        f.value.base = '1f790977';
      },
      (f) => {
        f.value.base.dir = '/caller-chosen-base';
      },
      (f) => {
        f.value.base.head = '2'.repeat(40);
      },
      (f) => {
        f.value.base.sha256.reverse();
      },
      (f) => {
        f.value.base.sha256[0] = sha2;
      },
      (f) => {
        delete f.extras.baseline;
      },
      (f) => {
        f.extras.baseline.metadata.reverted.pop();
      },
      (f) => {
        f.extras.baseline.metadata.sha256['corridor.js'] = sha2;
      },
      (f) => {
        delete f.pins.sources[E2_BASE_TOOL];
      },
    ]) {
      const f = sample('hfix2e2', engine);
      assert.equal(validateBatch3Native(f.value, f.pins, f.extras), true);
      mutate(f);
      assert.throws(() => validateBatch3Native(f.value, f.pins, f.extras));
    }
});
test('E2 base files are checked against independent expected bytes, not a self-consistent caller manifest', () => {
  const parent = join(homedir(), '.dharma', 'bunki', 'vh-batch3-consumer-tests');
  mkdirSync(parent, { recursive: true });
  const out = mkdtempSync(join(parent, 'base-unit-')),
    dir = join(out, 'e2-base');
  const f = sample('hfix2e2', 'chromium');
  mkdirSync(dir);
  const restore = () => {
    for (const name of ['base.json', 'corridor.js', 'editorial.css'])
      rmSync(join(dir, name), { force: true });
    writeFileSync(join(dir, 'base.json'), JSON.stringify(f.pins.baseline));
    writeFileSync(join(dir, 'corridor.js'), 'synthetic corridor');
    writeFileSync(join(dir, 'editorial.css'), 'synthetic editorial');
  };
  try {
    restore();
    assert.equal(readBatch3Base(out, f.pins).dir, dir);
    writeFileSync(join(dir, 'corridor.js'), 'forged');
    const forged = structuredClone(f.pins.baseline);
    forged.sha256['corridor.js'] = batch3Digest('forged');
    writeFileSync(join(dir, 'base.json'), JSON.stringify(forged));
    assert.throws(() => readBatch3Base(out, f.pins));
    restore();
    writeFileSync(join(dir, 'editorial.css'), 'changed after the native child');
    assert.throws(() => readBatch3Base(out, f.pins));
    restore();
    rmSync(join(dir, 'corridor.js'));
    writeFileSync(join(out, 'foreign.js'), 'synthetic corridor');
    symlinkSync(join(out, 'foreign.js'), join(dir, 'corridor.js'));
    assert.throws(() => readBatch3Base(out, f.pins));
    restore();
    writeFileSync(join(dir, 'unowned.json'), '{}');
    assert.throws(() => readBatch3Base(out, f.pins));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
