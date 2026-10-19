import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath, URL } from 'node:url';
import { join } from 'node:path';
import { batteryGates, runGates, validateKanjiTrustReport, validateHfix2aReport } from '../verify-release-gates.mjs';
import { supplementalGates } from './supplemental.mjs';
import { gateEvidenceDeclaration } from './gate-evidence.mjs';
import { acceptanceEnvironment } from './verification-admission.mjs';
const root = fileURLToPath(new URL('../..', import.meta.url)),
  out = '/independent-coverage-only/no-execution';
const gates = [...batteryGates(out, {}), ...supplementalGates(out)];
const known = new Set(['KAIRO_BROWSER', 'PERSONAL_HOST_BROWSER', 'PERSONAL_BROWSERS']);
const modules = [];
for (const file of readdirSync(join(root, 'scripts/ci')).filter((f) =>
  /^vh-.*-report-contracts\.mjs$/u.test(f),
)) {
  const module = await import(new URL(file, import.meta.url));
  modules.push({ file, module });
  for (const [name, value] of Object.entries(module))
    if (/narrowing.*environment/iu.test(name)) {
      assert(Array.isArray(value));
      for (const key of value) known.add(key);
    }
}
test('all 197 canonical and supplemental gates have unique names and mandatory declarations', () => {
  assert.equal(gates.length, 197);
  assert.equal(new Set(gates.map((g) => g.name)).size, 197);
  const expected = JSON.parse(
    readFileSync(new URL('./vh-required-gate-roster.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(
    gates.map((g) => g.name).sort(),
    [...expected.requiredNames].sort(),
    'Exact reviewed required gate roster',
  );
  const declared = gates.map((gate) => gateEvidenceDeclaration(gate, root, out));
  assert.equal(declared.length, gates.length);
  assert(declared.every((d) => d && d.kind && d.kind !== 'process-probe'));
  assert.throws(
    () =>
      gateEvidenceDeclaration(
        { name: 'unknown-producer', command: process.execPath, args: ['-e', 'process.exit(0)'] },
        root,
        out,
      ),
    /No required evidence contract/u,
  );
});
test('Kanji-trust admission accepts complete pinned receipts and rejects incomplete or foreign evidence', () => {
  const names = [
    'K01-sei', 'K01-kai', 'K01-o', 'K01-official', 'K01-joyo-forms',
    'K01-stroke-extended', 'K01-stroke-official', 'K01-stroke-failed',
    'K03-lookup', 'K04-kodansha', 'K05-frequency', 'K05-reading-all',
    'K05-nested-return', 'K05-nested-search-page', 'K05-idioms', 'K05-parts',
    'K07-words', 'K06-load', 'K08-lessons',
  ];
  for (const engine of ['chromium', 'webkit']) {
    const pin = { engine, artifactSha256: 'a'.repeat(64), siteDir: '/pinned/site' };
    const good = {
      schemaVersion: 1, control: null, failures: 0,
      artifactSha256: pin.artifactSha256, site: pin.siteDir,
      results: [{ engine, rows: names.map((row) => ({ row, pass: true })) }],
    };
    assert.equal(validateKanjiTrustReport(good, pin), true);
    for (const mutate of [
      (v) => { v.schemaVersion = 2; },
      (v) => { v.control = 'notes-below'; },
      (v) => { v.failures = 1; },
      (v) => { v.results = []; },
      (v) => { v.results.push(structuredClone(v.results[0])); },
      (v) => { v.results[0].engine = engine === 'chromium' ? 'webkit' : 'chromium'; },
      (v) => { delete v.results[0].rows; },
      (v) => { v.results[0].rows = []; },
      (v) => { v.results[0].rows.pop(); },
      (v) => { v.results[0].rows[1] = structuredClone(v.results[0].rows[0]); },
      (v) => { v.results[0].rows.reverse(); },
      (v) => { v.results[0].rows[0].pass = false; },
      (v) => { v.artifactSha256 = 'b'.repeat(64); },
      (v) => { delete v.artifactSha256; },
      (v) => { v.site = '/foreign/site'; },
      (v) => { delete v.site; },
    ]) {
      const bad = structuredClone(good);
      mutate(bad);
      assert.throws(() => validateKanjiTrustReport(bad, pin));
    }
    for (const missing of ['engine', 'artifactSha256', 'siteDir']) {
      assert.throws(() => validateKanjiTrustReport(good, { ...pin, [missing]: undefined }));
    }
  }
});

function hfixFixture(type, engine) {
  const pin = {
    type,
    engine,
    artifactSha256: 'a'.repeat(64),
    sourceSha256: 'b'.repeat(64),
    siteIdentity: {
      schemaVersion: 1,
      product: 'KAIRO',
      gitSha: 'c'.repeat(40),
      sourceDirty: false,
      artifactSha256: 'a'.repeat(64),
      files: [{ path: 'record-binding.mjs', sha256: 'd'.repeat(64) }],
    },
  };
  const good = {
    engine,
    mode: 'branch',
    identity: structuredClone(pin.siteIdentity),
    verifierSha256: pin.sourceSha256,
  };
  if (type === 'hfix2a-item-a') {
    Object.assign(good, {
      pass: true,
      errors: [],
      mutations: [],
      rows: ['context', 'guided', 'personal', 'fresh', 'empty-personal', 'cancel'].map((name) => ({
        name,
        pass: true,
        observed: {},
      })),
    });
  } else {
    Object.assign(good, {
      version: 'fixture-browser',
      viewport: engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      results: ['X11', 'X16', 'KT2', 'M1'].map((name) => ({ name, pass: true, error: null })),
      mutations: ['M1-interrupt--1', 'M1-interrupt-0', 'M1-interrupt-1', 'M1-interrupt-2'].map(
        (row) => ({ row, original: 'd'.repeat(64), served: 'e'.repeat(64) }),
      ),
    });
    good.results[3].detail = {
      safety: [
        'cancel-preserves-record-and-binding',
        'source-draft',
        'deck-ledger',
        'malformed-backup',
        'interruption-prefix-0',
        'interruption-prefix-1',
        'interruption-prefix-2',
        'interruption-prefix-3',
      ],
    };
  }
  return { pin, good };
}

test('Hfix-2a admission rejects diagnostic, incomplete, failed and foreign receipts in both engines', () => {
  for (const type of ['hfix2a', 'hfix2a-item-a'])
    for (const engine of ['chromium', 'webkit']) {
      const { pin, good } = hfixFixture(type, engine);
      assert.equal(validateHfix2aReport(good, pin), true);
      const field = type === 'hfix2a' ? 'results' : 'rows';
      const mutations = [
        (v) => {
          v.mode = 'base';
        },
        (v) => {
          v.mode = 'control';
        },
        (v) => {
          v.engine = engine === 'chromium' ? 'webkit' : 'chromium';
        },
        (v) => {
          delete v[field];
        },
        (v) => {
          v[field] = [];
        },
        (v) => {
          v[field].pop();
        },
        (v) => {
          v[field].push(structuredClone(v[field][0]));
        },
        (v) => {
          v[field][1] = structuredClone(v[field][0]);
        },
        (v) => {
          v[field].reverse();
        },
        (v) => {
          v[field][0].pass = false;
        },
        (v) => {
          delete v[field][0].pass;
        },
        (v) => {
          v.identity.artifactSha256 = 'f'.repeat(64);
        },
        (v) => {
          v.identity.gitSha = 'f'.repeat(40);
        },
        (v) => {
          delete v.identity;
        },
        (v) => {
          v.verifierSha256 = 'f'.repeat(64);
        },
        (v) => {
          delete v.verifierSha256;
        },
      ];
      if (type === 'hfix2a-item-a')
        mutations.push(
          (v) => {
            v.pass = false;
          },
          (v) => {
            v.errors = ['pageerror'];
          },
          (v) => {
            delete v.errors;
          },
          (v) => {
            v.mutations = [{ original: 'd'.repeat(64), served: 'e'.repeat(64) }];
          },
        );
      else
        mutations.push(
          (v) => {
            v.results[0].error = 'pageerror';
          },
          (v) => {
            delete v.results[0].error;
          },
          (v) => {
            v.version = '';
          },
          (v) => {
            v.viewport.width = 320;
          },
          (v) => {
            v.results[3].detail.safety.pop();
          },
          (v) => {
            v.results[3].detail.safety[1] = v.results[3].detail.safety[0];
          },
          (v) => {
            v.mutations.pop();
          },
          (v) => {
            v.mutations[1] = structuredClone(v.mutations[0]);
          },
          (v) => {
            v.mutations[0].original = 'f'.repeat(64);
          },
          (v) => {
            v.mutations[0].served = v.mutations[0].original;
          },
        );
      for (const mutate of mutations) {
        const bad = structuredClone(good);
        mutate(bad);
        assert.throws(
          () => validateHfix2aReport(bad, pin),
          undefined,
          `${type}/${engine}: ${mutate}`,
        );
      }
      for (const missing of ['type', 'engine', 'artifactSha256', 'sourceSha256', 'siteIdentity'])
        assert.throws(() => validateHfix2aReport(good, { ...pin, [missing]: undefined }));
    }
});

test('Hfix-2a descriptors bind both producers and override ambient diagnostic selectors', () => {
  const actual = gates.filter((gate) => gate.name.startsWith('hfix2a'));
  assert.deepEqual(
    actual.map((gate) => gate.name),
    ['hfix2a', 'hfix2a-webkit', 'hfix2a-item-a', 'hfix2a-item-a-webkit'],
  );
  for (const gate of actual) {
    const type = gate.name.replace(/-webkit$/u, '');
    const engine = gate.name.endsWith('-webkit') ? 'webkit' : 'chromium';
    assert.deepEqual(gate.args, [`prototypes/corridor/tools/verify-${type}.mjs`]);
    assert.equal(gate.requiredPath, gate.args[0]);
    assert.equal(gate.report.type, type);
    assert.equal(gate.report.engine, engine);
    assert.equal(gate.report.path, join(out, gate.name, 'result.json'));
    assert.equal(
      gate.report.sourceSha256,
      createHash('sha256')
        .update(readFileSync(join(root, gate.requiredPath)))
        .digest('hex'),
    );
    assert.equal(gateEvidenceDeclaration(gate, root, out).kind, 'retained-report');
    for (const diagnostic of ['base', 'control', '']) {
      const ambient = { KAIRO_BROWSER: 'all', HFIX2A_MODE: diagnostic, HFIX2A_CASE: 'M1' };
      const env = acceptanceEnvironment(ambient, gate.env);
      assert.equal(env.KAIRO_BROWSER, engine);
      assert.equal(env.HFIX2A_MODE, 'branch');
      assert.equal(env.HFIX2A_CASE, '');
      assert.equal(ambient.HFIX2A_CASE, 'M1');
    }
  }
});

test('Hfix-2a retained-report dispatch accepts fresh complete evidence and rejects a successful diagnostic process', async () => {
  const parent = join(homedir(), '.dharma/bunki/verifier-receipts/hfix2a-admission-tests');
  mkdirSync(parent, { recursive: true });
  const fixture = mkdtempSync(join(parent, 'run-'));
  const producer = join(fixture, 'producer.mjs');
  writeFileSync(
    producer,
    `import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';import {join} from 'node:path';
assert.equal(process.env.HFIX2A_MODE,'branch');assert.equal(process.env.HFIX2A_CASE,'');
const out=process.env.KAIRO_EVIDENCE_DIR;mkdirSync(out,{recursive:true});
writeFileSync(join(out,'result.json'),process.env.HFIX_TEST_REPORT);
`,
  );
  const sourceSha256 = createHash('sha256').update(readFileSync(producer)).digest('hex');
  for (const type of ['hfix2a', 'hfix2a-item-a'])
    for (const engine of ['chromium', 'webkit']) {
      for (const diagnostic of [false, true]) {
        const runOut = join(fixture, `${type}-${engine}-${diagnostic}`);
        const name = engine === 'chromium' ? type : `${type}-webkit`;
        const gate = batteryGates(runOut, {}).find((candidate) => candidate.name === name);
        const { pin, good } = hfixFixture(type, engine);
        good.verifierSha256 = sourceSha256;
        if (diagnostic) good.mode = 'control';
        const result = await runGates({
          root: fixture,
          out: runOut,
          gates: [
            {
              ...gate,
              args: [producer],
              requiredPath: producer,
              env: { ...gate.env, HFIX_TEST_REPORT: JSON.stringify(good) },
              report: { ...gate.report, ...pin, sourceSha256 },
            },
          ],
        });
        assert.equal(result.exitCode, diagnostic ? 1 : 0);
        assert.equal(result.gates[0].status, diagnostic ? 'incomplete' : 'passed');
        assert.equal(result.gates[0].processExitCode, 0);
      }
    }
});

test('every exported selector is removed from ambient input, including empty values', () => {
  for (const value of ['diagnostic-mutant', '']) {
    const ambient = {
      ...Object.fromEntries([...known].map((key) => [key, value])),
      VH_INDEPENDENT_SAFE_MARKER: 'preserved',
    };
    const actual = acceptanceEnvironment(ambient);
    for (const key of known)
      assert.equal(actual[key], key === 'KAIRO_BROWSER' ? 'chromium' : undefined, key);
    assert.equal(actual.VH_INDEPENDENT_SAFE_MARKER, 'preserved');
    assert.equal(ambient.KAIRO_BROWSER, value, 'sanitization must not mutate its caller');
  }
});
test('all gate descriptors preserve only explicit selector authority', () => {
  const ambient = Object.fromEntries([...known].map((key) => [key, 'hostile-ambient']));
  for (const gate of gates) {
    const env = acceptanceEnvironment(ambient, gate.env || {});
    for (const key of known)
      assert.equal(
        env[key],
        Object.hasOwn(gate.env || {}, key)
          ? gate.env[key]
          : key === 'KAIRO_BROWSER'
            ? 'chromium'
            : undefined,
        `${gate.name}/${key}`,
      );
  }
});
test('every exported adapter fails closed for absent and malformed producer receipts', () => {
  const context = {
    engine: 'chromium',
    runId: 'attempt',
    artifactSha256: 'a'.repeat(64),
    verifierSha256: 'b'.repeat(64),
  };
  for (const { file, module } of modules)
    for (const [name, map] of Object.entries(module))
      if (/ReportContracts$/u.test(name)) {
        for (const [gate, contract] of Object.entries(map))
          for (const report of [
            null,
            {},
            { results: [], checks: [], rows: [], passed: true, failures: 0, fullAcceptance: true },
          ]) {
            let result;
            try {
              result = contract.validate(report, context);
            } catch {
              continue;
            }
            assert.notEqual(
              result?.passed,
              true,
              `${file}/${gate} accepted an absent/malformed receipt`,
            );
          }
      }
});
