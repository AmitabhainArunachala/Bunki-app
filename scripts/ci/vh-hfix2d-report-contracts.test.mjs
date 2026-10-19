import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { HFIX2D, HFIX2D_HELPERS, hfix2dDigest, loadHfix2dPins, validateHfix2dReport } from './vh-hfix2d-report-contracts.mjs';

function fixture(engine) {
  const parent = process.env.CI && process.env.RUNNER_TEMP ? process.env.RUNNER_TEMP : join(homedir(), '.dharma/bunki/hfix2d-contract-tests');
  mkdirSync(parent, { recursive: true }); const base = mkdtempSync(join(parent, 'case-'));
  const root = join(base, 'root'), siteDir = join(base, 'site');
  const write = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); };
  for (const file of ['prototypes/corridor/tools/verify-hfix2d.mjs', ...HFIX2D_HELPERS]) write(join(root, file), `// fixture ${file}`);
  const files = ['corridor.js', 'corridor.css', 'guided-session.css'].map(path => {
    const bytes = `immutable fixture ${path}`; write(join(siteDir, path), bytes); return { path, sha256: hfix2dDigest(bytes) };
  });
  write(join(siteDir, 'build-identity.json'), JSON.stringify({ schemaVersion: 1, product: 'KAIRO', sourceDirty: false,
    gitSha: 'a'.repeat(40), artifactSha256: 'b'.repeat(64), files }));
  const options = { root, siteDir, engine, runId: 'fresh-hfix2d-test-attempt' };
  return { ...options, pins: loadHfix2dPins(options) };
}
function good(p) {
  return { schemaVersion: 2, suite: 'hfix2d', scope: 'full', control: null, pass: true, runId: p.runId,
    site: p.siteDir, engines: [p.engine], browserVersions: { [p.engine]: 'native-fixture-version' }, expectedGitSha: p.identity.gitSha,
    artifactSha256: p.artifactSha256, identity: structuredClone(p.identity), verifierSha256: p.verifierSha256,
    helperSha256: { ...p.helperSha256 }, summary: { total: 368, passed: 368, failed: 0 },
    checks: HFIX2D.rows.map(row => {
      let detail = row.detail;
      if (detail === undefined) {
        if (row.name.startsWith('identity · ')) detail = `${p.identity.gitSha} === ${p.identity.gitSha}`;
        else if (row.name.startsWith('C · ')) detail = JSON.stringify({ ratio: 7, opacity: 1, text: '〔スポーツ〕' });
        else if (row.name.endsWith('no page error')) detail = '[]';
        else if (row.name.includes('the begin control sits')) { const width = Number(row.name.split(' · ')[2]); detail = JSON.stringify({ iw: width, vh: width === 390 ? 844 : 900, begin: { top: 300, bottom: 348 } }); }
        else if (row.name.includes('the begin label is centred')) detail = JSON.stringify({ above: 14, below: 14 });
        else if (row.name.includes('the box is filled')) detail = JSON.stringify({ box: { top: 100, h: 500 }, restCount: 1, restH: 200, metaBottom: 590 });
        else if (row.name.includes('the arrival keeps')) detail = JSON.stringify({ w: 800 });
        else assert.fail(row.name);
      }
      return { name: row.name.replace(' · ENGINE · ', ` · ${p.engine} · `), pass: true, detail };
    }) };
}
test('Hfix-2d preserves all 368 ordered occurrences and six repeated labels in both native engines', () => {
  assert.equal(HFIX2D.rows.length, 368); assert.equal(new Set(HFIX2D.rows.map(row => row.name)).size, 362);
  assert.deepEqual(HFIX2D.groups, { P: 222, K: 117, U: 8, C: 11, G: 9, identity: 1 });
  for (const engine of ['chromium', 'webkit']) {
    const p = fixture(engine).pins, value = good(p); assert.equal(validateHfix2dReport(value, p), true);
    for (const mutate of [
      v => v.checks.pop(), v => v.checks.reverse(), v => v.checks.push(v.checks[0]),
      v => v.checks[1] = structuredClone(v.checks[0]), v => v.checks = [...new Map(v.checks.map(row => [row.name, row])).values()],
      v => v.schemaVersion = 1, v => v.suite = 'foreign', v => v.scope = 'partial', v => v.control = 'pos-revert',
      v => v.pass = false, v => v.runId = 'stale', v => v.site = '/foreign', v => v.engines = ['chromium', 'webkit'],
      v => v.engines = [], v => v.browserVersions = {}, v => v.browserVersions[engine] = '',
      v => v.browserVersions.other = 'foreign', v => v.expectedGitSha = 'c'.repeat(40),
      v => v.identity.sourceDirty = true, v => v.identity.gitSha = 'c'.repeat(40), v => v.identity.files.pop(),
      v => v.artifactSha256 = 'c'.repeat(64), v => v.verifierSha256 = 'c'.repeat(64),
      v => v.helperSha256[HFIX2D_HELPERS[0]] = 'c'.repeat(64), v => delete v.helperSha256[HFIX2D_HELPERS[0]],
      v => v.summary.total = 358, v => v.summary.failed = 1,
      v => v.checks[0].detail = '[]', v => v.checks.at(-1).detail = 'unbound identity',
      v => v.checks.find(row => row.name.startsWith('C · ')).detail = JSON.stringify({ ratio: 4.49, opacity: 1, text: '〔スポーツ〕' }),
      v => v.checks.find(row => row.name.includes('the begin control sits')).detail = JSON.stringify({ iw: 390, vh: 844, begin: { top: 800, bottom: 848 } }),
      v => v.checks.find(row => row.name.includes('the begin label is centred')).detail = JSON.stringify({ above: 0, below: 4 }),
      v => v.checks.find(row => row.name.includes('the box is filled')).detail = JSON.stringify({ box: { top: 0, h: 500 }, restH: 99, restCount: 1, metaBottom: 200 }),
      v => v.checks.find(row => row.name.includes('the arrival keeps')).detail = JSON.stringify({ w: 981 }),
      v => v.checks.find(row => row.name.startsWith('G · ') && row.name.endsWith('no page error')).detail = '["runtime error"]',
    ]) { const bad = structuredClone(value); mutate(bad); assert.throws(() => validateHfix2dReport(bad, p)); }
    // Each occurrence is independently mandatory, including duplicated labels.
    for (let i = 0; i < value.checks.length; i++) {
      const bad = structuredClone(value); bad.checks[i].pass = false; assert.throws(() => validateHfix2dReport(bad, p), `red row ${i + 1}`);
      const missing = structuredClone(value); delete missing.checks[i].detail; assert.throws(() => validateHfix2dReport(missing, p), `missing detail ${i + 1}`);
    }
    for (const missing of ['engine', 'runId', 'siteDir', 'artifactSha256', 'verifierSha256', 'helperSha256', 'identity'])
      assert.throws(() => validateHfix2dReport(value, { ...p, [missing]: undefined }));
  }
});
test('Hfix-2d source helpers and product bytes are pinned independently of receipt claims', () => {
  const f = fixture('chromium'), receipt = good(f.pins);
  writeFileSync(join(f.root, HFIX2D_HELPERS[0]), '// changed helper');
  assert.throws(() => validateHfix2dReport(receipt, loadHfix2dPins(f)));
  writeFileSync(join(f.siteDir, 'corridor.css'), 'changed artifact');
  assert.throws(() => loadHfix2dPins(f), /Artifact changed/u);
});
test('Hfix-2d producer keeps the accepted behavioral body and makes mandatory pins explicit', () => {
  const producer = readFileSync(new URL('../../prototypes/corridor/tools/verify-hfix2d.mjs', import.meta.url), 'utf8');
  const body = producer.slice(producer.indexOf('const WORDS = ['), producer.indexOf('\nfor (const [engine, browserType] of Object.entries(ENGINES))'));
  assert.equal(hfix2dDigest(body), HFIX2D.behaviorBodySha256);
  assert(producer.includes("assert(['chromium', 'webkit'].includes(engine)"));
  assert(producer.includes('KAIRO_EXPECT_GITSHA is required'));
  assert(producer.includes('KAIRO_GATE_RUN_ID is required'));
});
