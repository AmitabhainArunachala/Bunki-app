/** Six accepted Batch 3 lanes. Native receipts stay intact; this envelope admits only the named lane. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import {
  lstatSync,
  readFileSync,
  realpathSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BATCH3 = JSON.parse(
  readFileSync(new URL('./vh-batch3-rosters.json', import.meta.url)),
);
export const BATCH3_SUITES = Object.freeze([
  'hfix2e-contrast',
  'hfix2e-examples',
  'hfix2e-hold',
  'hfix2e-x10-kt3',
  'hfix2b',
  'hfix2e2',
]);
export const BATCH3_ENV_KEYS = Object.freeze([
  'HFIX2E_MODE',
  'HFIX2E_CASE',
  'HFIX2E_CENTRE',
  'HFIX2E_VIEWPORT',
  'HFIX2E2_MODE',
  'HFIX2E2_CASE',
  'HFIX2E2_CONTROL',
  'HFIX2E2_BASE_SHA',
  'HFIX2E2_BASE_DIR',
  'HFIX2E2_BASE_SHA256',
  'HFIX2E2_SERVE_DIR',
  'HFIX2E2_NAMI_VIEWPORT',
  'KAIRO_HFIX2B_BASE',
  'KAIRO_HFIX2B_BASE_SHA',
  'KAIRO_HFIX2B_CONTROL',
]);
// gate-roster-coverage discovers this conventional export by name.
export const batch3NarrowingEnvironment = BATCH3_ENV_KEYS;
export const BATCH3_REPORT_TYPES = Object.freeze(BATCH3_SUITES.map((suite) => `batch3-${suite}`));
export const batch3Digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exact = (actual, expected, label) => assert.deepEqual(actual, expected, label);
const sha = (value) => assert.match(value || '', /^[a-f0-9]{64}$/u, 'Missing SHA-256');
const nonempty = (value) =>
  assert(typeof value === 'string' && value.trim().length, 'Missing string witness');
const finite = (value) => assert(Number.isFinite(value), 'Missing finite measurement');
const positive = (value) => {
  finite(value);
  assert(value > 0);
};
const zero = (value) => {
  finite(value);
  assert.equal(value, 0);
};
const source = (suite) => `prototypes/corridor/tools/verify-${suite}.mjs`;
const wrapper = (suite) => `scripts/ci/run-${suite}-gate.mjs`;
export const BATCH3_DYNAMIC_SOURCES = Object.freeze({
  hfix2b: Object.freeze([
    'prototypes/drift/data/wbig.json',
    'prototypes/corridor/data/share_alike/words.json',
  ]),
});
const shared = 'prototypes/corridor/tools/verify-contrast-sweep.mjs';
const arrival = 'prototypes/corridor/tools/vh-contrast-arrival.mjs';

// Independent canonical baseline: exact accepted product commits, newest first.
// No hash, commit, directory or metadata supplied by the caller becomes this oracle.
export const E2_BASE_TOOL = 'prototypes/corridor/tools/hfix2e2-base.mjs';
export const E2_BASE_COMMITS = Object.freeze([
  'd61334a538a6e34ebd0701862521914cc1c2ff4b',
  '680fa019e692e474beec544d5c1c901c46d50237',
  '1e8e1b085c7ca23c4563d532ca3a8268e23d5c93',
  'f23c3133c0739251552509bc181b50b9104f709e',
]);
export const E2_BASE_FILES = Object.freeze([
  'prototypes/corridor/corridor.js',
  'prototypes/corridor/editorial.css',
]);
function deriveE2Base(root, site, identity) {
  const head = identity.gitSha;
  assert.match(head || '', /^[a-f0-9]{40}$/u);
  // Repository selection and patch interpretation cannot come from ambient git overrides.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  const git = (...args) => execFileSync('git', args, { cwd: root, env, maxBuffer: 1 << 29 });
  assert.equal(git('rev-parse', '--verify', `${head}^{commit}`).toString().trim(), head);
  const parent = join(homedir(), '.dharma', 'bunki', 'e2-base-oracle');
  mkdirSync(parent, { recursive: true });
  const work = mkdtempSync(join(parent, 'derive-'));
  try {
    for (const file of E2_BASE_FILES) {
      const bytes = git('show', `${head}:${file}`),
        name = file.split('/').pop();
      assert.equal(
        batch3Digest(regular(site, name)),
        batch3Digest(bytes),
        `Artifact differs from its committed ${name}`,
      );
      mkdirSync(dirname(join(work, file)), { recursive: true });
      writeFileSync(join(work, file), bytes);
    }
    for (const commit of E2_BASE_COMMITS) {
      assert.equal(git('rev-parse', '--verify', `${commit}^{commit}`).toString().trim(), commit);
      git('merge-base', '--is-ancestor', commit, head);
      const touched = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit)
        .toString()
        .trim()
        .split('\n');
      assert(
        touched.length && touched.every((file) => E2_BASE_FILES.includes(file)),
        'Non-E2 product delta',
      );
      const patch = git(
        'diff',
        '--no-ext-diff',
        '--no-textconv',
        '--src-prefix=a/',
        '--dst-prefix=b/',
        `${commit}^`,
        commit,
        '--',
        ...E2_BASE_FILES,
      );
      assert(patch.length > 0, 'Empty E2 product delta');
      // Independent reconstruction: no helper output or caller-supplied base is used.
      execFileSync('git', ['apply', '-R', '--check', '-'], { cwd: work, env, input: patch });
      execFileSync('git', ['apply', '-R', '-'], { cwd: work, env, input: patch });
    }
    return {
      head,
      reverted: E2_BASE_COMMITS.map((commit) => commit.slice(0, 8)),
      files: [...E2_BASE_FILES],
      sha256: Object.fromEntries(
        E2_BASE_FILES.map((file) => [
          file.split('/').pop(),
          batch3Digest(readFileSync(join(work, file))),
        ]),
      ),
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
function e2BasePinsValid(p) {
  sha(p.sources[E2_BASE_TOOL]);
  assert.equal(p.baseline?.head, p.identity.gitSha);
  exact(
    p.baseline.reverted,
    E2_BASE_COMMITS.map((commit) => commit.slice(0, 8)),
  );
  exact(p.baseline.files, E2_BASE_FILES);
  exact(Object.keys(p.baseline.sha256), ['corridor.js', 'editorial.css']);
  for (const hash of Object.values(p.baseline.sha256)) sha(hash);
}
export function readBatch3Base(out, p) {
  assert.equal(p.suite, 'hfix2e2');
  e2BasePinsValid(p);
  const dir = join(realpathSync(out), 'e2-base'),
    stat = lstatSync(dir);
  assert(
    stat.isDirectory() && !stat.isSymbolicLink(),
    'Managed E2 base must be a regular directory',
  );
  exact(readdirSync(dir).sort(), ['base.json', 'corridor.js', 'editorial.css']);
  const metadataBytes = regular(dir, 'base.json'),
    metadata = JSON.parse(metadataBytes);
  exact(
    metadata,
    p.baseline,
    'E2 base was not reconstructed from this artifact and the four owned commits',
  );
  const files = { 'e2-base/base.json': batch3Digest(metadataBytes) };
  for (const name of ['corridor.js', 'editorial.css']) {
    const digest = batch3Digest(regular(dir, name));
    assert.equal(digest, p.baseline.sha256[name], `Foreign E2 baseline ${name}`);
    files[`e2-base/${name}`] = digest;
  }
  return { dir, metadata, files };
}

const worlds = [
  'hokusai',
  'sumi',
  'shu',
  'akafuji',
  'iwa',
  'rokusho',
  'yoru',
  'nami',
  'keyblock',
  'hakuu',
  'kaku',
];
export function batch3NativeFile(suite, engine) {
  assert(BATCH3_SUITES.includes(suite));
  assert(['chromium', 'webkit'].includes(engine));
  if (suite === 'hfix2b') return 'hfix2b-branch.json';
  if (suite === 'hfix2e-examples') return 'result.json';
  if (suite === 'hfix2e-contrast') return `hfix2e-x19-${engine}-branch.json`;
  if (suite === 'hfix2e2') return `hfix2e2-${engine}-branch.json`;
  return `result-${engine}-branch.json`;
}
export function batch3CanonicalEnvironment(env, suite, engine) {
  assert(BATCH3_SUITES.includes(suite));
  assert(['chromium', 'webkit'].includes(engine));
  const clean = { ...env };
  for (const key of Object.keys(clean))
    if (
      /^(?:HFIX2E_|HFIX2E2_|KAIRO_HFIX2B_|SWEEP_)/u.test(key) ||
      (suite === 'hfix2e2' && key.startsWith('GIT_'))
    )
      delete clean[key];
  return {
    ...clean,
    KAIRO_BROWSER: engine,
    HFIX2E_MODE: 'branch',
    HFIX2E2_MODE: 'branch',
    HFIX2E_CENTRE: '元気',
    HFIX2E_VIEWPORT: engine === 'webkit' ? 'phone' : 'desktop',
    HFIX2E2_NAMI_VIEWPORT: 'phone',
  };
}
/** Pin every repository-local static import transitively, plus native dynamic readers. No producer is imported here. */
function sourceClosure(root, seeds) {
  const found = new Map(),
    pending = [...seeds];
  while (pending.length) {
    const path = pending.pop();
    if (found.has(path)) continue;
    const file = resolve(root, path);
    assert(!relative(root, file).startsWith('..'));
    const stat = lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink(), `Non-regular source ${path}`);
    const bytes = readFileSync(file);
    found.set(path, batch3Digest(bytes));
    if (!/\.(?:mjs|cjs|js)$/u.test(path)) continue;
    const text = bytes.toString('utf8');
    for (const match of text.matchAll(
      /(?:\bfrom\s*|\brequire\s*\(|\bimport\s*\(|\bimport\s*)['"](\.[^'"]+)['"]/gu,
    )) {
      const next = resolve(dirname(file), match[1]);
      if (/\.(?:mjs|cjs|js|json)$/u.test(next)) pending.push(relative(root, next));
    }
  }
  return Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
}
export function loadBatch3Pins({ root, siteDir, suite, engine, runId }) {
  assert(BATCH3_SUITES.includes(suite));
  assert(['chromium', 'webkit'].includes(engine));
  nonempty(runId);
  const site = realpathSync(siteDir),
    require = createRequire(pathToFileURL(resolve(root, 'package.json')));
  const { verifyBundledArtifact } = require(
    resolve(root, 'prototypes/bunki-desktop/lib/artifact.cjs'),
  );
  const identity = verifyBundledArtifact(site);
  assert.equal(identity.sourceDirty, false);
  const seeds = [
    source(suite),
    wrapper(suite),
    'scripts/ci/run-batch3-gate.mjs',
    'scripts/ci/vh-batch3-report-contracts.mjs',
    'scripts/ci/vh-batch3-rosters.json',
    'scripts/ci/verification-admission.mjs',
    'scripts/resolve-corridor-site.mjs',
    'scripts/serve-corridor-dev.mjs',
    'prototypes/bunki-desktop/lib/artifact.cjs',
  ];
  if (['hfix2e-contrast', 'hfix2e2'].includes(suite)) seeds.push(shared, arrival);
  if (suite === 'hfix2e2') seeds.push(E2_BASE_TOOL);
  seeds.push(...(BATCH3_DYNAMIC_SOURCES[suite] || []));
  const sources = sourceClosure(root, seeds);
  const baseline = suite === 'hfix2e2' ? deriveE2Base(root, site, identity) : null;
  return { suite, engine, runId, siteDir: site, identity, sources, baseline };
}
function pinsValid(p) {
  assert(BATCH3_SUITES.includes(p.suite));
  assert(['chromium', 'webkit'].includes(p.engine));
  nonempty(p.runId);
  nonempty(p.siteDir);
  assert.equal(p.identity.schemaVersion, 1);
  assert.equal(p.identity.product, 'KAIRO');
  assert.equal(p.identity.sourceDirty, false);
  assert.match(p.identity.gitSha || '', /^[a-f0-9]{40}$/u);
  sha(p.identity.artifactSha256);
  for (const name of [
    source(p.suite),
    wrapper(p.suite),
    'scripts/ci/run-batch3-gate.mjs',
    'scripts/ci/vh-batch3-report-contracts.mjs',
    'scripts/ci/vh-batch3-rosters.json',
  ])
    sha(p.sources[name]);
  for (const path of BATCH3_DYNAMIC_SOURCES[p.suite] || []) sha(p.sources[path]);
  for (const hash of Object.values(p.sources)) sha(hash);
  if (p.suite === 'hfix2e2') e2BasePinsValid(p);
}
function base(v, p) {
  assert.equal(v.engine, p.engine);
  nonempty(v.version || v.browser);
  assert.equal(v.mode, 'branch');
  if ('mutations' in v)
    assert(v.mutations === null || (Array.isArray(v.mutations) && v.mutations.length === 0));
  for (const key of ['only', 'control', 'serveDir', 'served'])
    if (key in v)
      assert(
        v[key] === null || (Array.isArray(v[key]) && v[key].length === 0),
        `Narrow/foreign ${key}`,
      );
  if ('viewport' in v && typeof v.viewport === 'object')
    exact(
      v.viewport,
      p.engine === 'webkit' ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    );
  if (v.identity)
    exact(v.identity, {
      gitSha: p.identity.gitSha,
      artifactSha256: p.identity.artifactSha256,
      sourceDirty: false,
    });
  else {
    assert.equal(v.gitSha || v.build, p.identity.gitSha);
    assert.equal(v.artifactSha256 || v.artifact, p.identity.artifactSha256);
  }
  if ('site' in v) assert.equal(v.site, p.siteDir);
}
export function batch3RowNames(v, suite, engine) {
  const rows = v.checks || v.rows || v.results;
  assert(Array.isArray(rows));
  return rows.map((row) => {
    nonempty(row.name);
    if (suite === 'hfix2b') {
      const prefix = row.name.match(/^(chromium|webkit) ([^·]+) · /u);
      assert(prefix && prefix[1] === engine);
      nonempty(prefix[2]);
      return row.name.slice(prefix[0].length).replace(/\(\d+ beads deep\)/u, '(DEPTH beads deep)');
    }
    return suite === 'hfix2e2'
      ? row.name.replace(/\(load [0-9.]+ ≤ 20\)/u, '(load LOAD ≤ 20)')
      : row.name;
  });
}
function rows(v, p) {
  exact(
    batch3RowNames(v, p.suite, p.engine),
    BATCH3.rows[p.suite][p.engine],
    'Exact ordered native occurrences',
  );
  const rs = v.checks || v.rows || v.results;
  for (const row of rs) {
    assert.equal(row.pass, true, row.name);
    assert(row.detail !== undefined && row.detail !== null, `Missing observation: ${row.name}`);
    if ('error' in row) assert.equal(row.error, null, row.name);
    if ('errors' in row) exact(row.errors, [], row.name);
  }
  if ('total' in v) {
    const count = p.suite === 'hfix2e2' ? rs.length - 2 : rs.length;
    assert.equal(v.total, count);
    assert.equal(v.green, count);
  }
  return rs;
}
const strings = (values) => {
  assert(Array.isArray(values));
  for (const value of values) nonempty(value);
};
function validateE2R2Witness(row, engine) {
  const index = BATCH3.rows.hfix2e2[engine]
    .filter((name) => /^X13\.(?:look|fade) /u.test(name))
    .indexOf(row.name);
  assert(index >= 0, 'Unknown r2 row');
  assert.equal(row.pass, true);
  assert.equal(row.item, 'X13');
  assert.equal(row.error, null);
  const d = row.detail;
  assert(d && typeof d === 'object');
  assert.deepEqual(d.errors, []);
  if (index < 6) {
    const world = ['hokusai', 'yoru', 'sumi'][Math.floor(index / 2)],
      width = index % 2 ? 320 : 390;
    assert.equal(d.world, world);
    for (const key of ['drawn', 'sameColour', 'samePaint', 'borderGone', 'seated'])
      assert.equal(d[key], true);
    assert.equal(d.dock.bg, d.tabs.bg);
    assert.equal(d.dock.image, d.tabs.image);
    assert.notEqual(d.dock.display, 'none');
    finite(d.dock.opacity);
    assert(d.dock.opacity >= 0.99);
    finite(d.dock.bottom);
    finite(d.tabs.top);
    assert(Math.abs(d.dock.bottom - d.tabs.top) <= 1);
    finite(d.evenAcross);
    assert(d.evenAcross >= 0.9 && d.evenAcross <= 1);
    assert.deepEqual(d.lines, []);
    finite(d.discContrast);
    assert(d.discContrast >= 3);
    assert(Number.isInteger(d.samples) && d.samples > 0);
    assert.equal(d.mark.length, 4);
    d.mark.forEach(finite);
    finite(d.dock.top);
    assert.equal(d.mark[2] - d.mark[0], 44);
    assert.equal(d.mark[3] - d.mark[1], 44);
    assert(width - d.mark[2] <= 8);
    assert(d.mark[1] >= d.dock.top - 0.5 && d.mark[3] <= d.dock.bottom + 0.5);
  } else {
    const reduced = index === 7;
    for (const [key, to] of [
      ['opened', 0],
      ['folded', 1],
    ]) {
      const j = d[key];
      finite(j.change);
      assert.equal(j.shownBefore, true);
      assert(Array.isArray(j.frames) && j.frames.length > 0);
      if (reduced) {
        assert(Array.isArray(j.first));
        finite(j.first[1]);
        assert(Math.abs(j.first[1] - to) < 0.01);
      } else {
        assert(Number.isInteger(j.between) && j.between >= 2);
        assert.equal(j.turned, 0);
        finite(j.doneAt);
        assert(j.doneAt >= 0 && j.doneAt <= 450);
      }
    }
  }
  return true;
}

function validateExamples(v, p) {
  base(v, p);
  assert.equal(v.verifierSha256, p.sources[source(p.suite)]);
  exact(v.mutations, []);
  const rs = rows(v, p),
    d = Object.fromEntries(rs.map((row) => [row.name, row.detail]));
  assert.equal(d['KT6-A'].sheet.node, 'word:あい');
  assert(/あい/u.test(d['KT6-A'].sheet.reading + d['KT6-A'].sheet.headword));
  strings(d['KT6-A'].examples);
  assert(d['KT6-A'].examples.every((s) => !s.includes('愛') && /藍|あい/u.test(s)));
  strings(d['KT6-B'].examples);
  assert(d['KT6-B'].examples.length >= 4 && d['KT6-B'].examples.includes('えっと。'));
  strings(d['KT6-C'].examples);
  assert(d['KT6-C'].examples.length >= 4);
  exact(
    d['KT6-C'].inflected,
    d['KT6-C'].examples.filter((s) => s.includes('歩') && !s.includes('歩く')),
  );
  assert(d['KT6-C'].inflected.length >= 1);
  exact(Object.keys(d['KT6-D']), ['押える', '代る', '或']);
  for (const [word, least] of [
    ['押える', 6],
    ['代る', 6],
    ['或', 1],
  ]) {
    const r = d['KT6-D'][word];
    assert.equal(r.least, least);
    assert(r.count >= least);
    positive(r.own);
    nonempty(r.first);
  }
  exact(Object.keys(d['KT6-G']), ['首', '比', '画', '為る', '才', '開く', '器械', '現す', '問']);
  for (const r of Object.values(d['KT6-G'])) {
    assert(Number.isSafeInteger(r.count) && r.count >= 0);
    exact(r.lent, []);
  }
  strings(d['KT6-H'].examples);
  assert(d['KT6-H'].examples.every((s) => !/[依拠由]/u.test(s) || s.includes('因')));
  strings(d['KT6-E'].examples);
  assert(d['KT6-E'].examples.every((s) => !s.includes('張') || s.includes('貼')));
  exact(d['KT6-F'].examples, []);
}
function seal(a, count) {
  assert.equal(a.strip, true);
  assert.equal(a.mini, false);
  assert.equal(a.count, count);
  positive(a.seen.stamp);
  exact(a.covered, []);
}
function validateHold(v, p) {
  base(v, p);
  assert.equal(v.verifier, 'verify-hfix2e-hold');
  assert.equal(v.centre, '元気');
  exact(v.mutations, []);
  for (const r of rows(v, p)) {
    const d = r.detail;
    finite(d.c0);
    if (['W7-hold', 'W7-centre'].includes(r.name)) {
      assert.equal(d.by, p.engine === 'webkit' ? 'finger' : 'mouse');
      positive(d.first.mid.ring);
      seal(d.first.after, d.c0 + 1);
      assert.equal(d.first.after.rung, null);
      assert(/Saved ✓|保存済み/u.test(d.first.after.stripSays));
      seal(d.second.after, d.c0 + 1);
      assert.equal(d.second.after.rung, null);
      assert.equal(d.later.strip, true);
      exact(d.later.covered, []);
      nonempty(d.held.key);
      if (r.name === 'W7-centre') assert.equal(d.held.key, '#centre');
    } else if (r.name === 'W7-drag') {
      assert.equal(d.dragged.after.strip, false);
      assert.equal(d.dragged.after.count, d.c0);
      zero(d.dragged.after.seen.stamp);
    } else if (r.name === 'W7-tap') {
      assert(d.after.rung || d.after.mini);
      assert.equal(d.after.strip, false);
      assert.equal(d.after.count, d.c0);
      zero(d.after.seen.stamp);
    } else {
      seal(d.after, d.c0 + 1);
      assert.equal(d.how, r.name === 'W7-key' ? 'Shift+F10' : 'right-click');
      if (r.name === 'W7-key') assert.equal(d.focusInStrip, true);
    }
  }
}
function validateX10(v, p) {
  base(v, p);
  exact(v.mutations, []);
  assert.equal(v.only, null);
  assert.equal(v.input, p.engine === 'webkit' ? 'touch' : 'mouse');
  const rs = rows(v, p);
  exact(
    rs.map((r) => r.item),
    ['X10', 'X10', 'X10', 'KT3', 'KT3'],
  );
  exact(rs[0].detail.live, ['mini-take']);
  for (const [index, key] of [
    [1, 'barPressFolded'],
    [2, 'barPressReading'],
  ]) {
    const d = rs[index].detail;
    exact(d.live, ['chrome-keep']);
    assert.equal(d.card, false);
    assert(/総理/u.test(d.bar?.label || ''));
    finite(d[key]?.before);
    assert.equal(d[key].after, d[key].before + 1);
  }
  assert.equal(rs[2].detail.rung, 'reading');
  for (const r of rs.slice(3))
    for (const [glyph, label] of Object.entries({
      稿: '稿 — draft',
      食: '食 たべる — eat',
      剝: '剝 はがす — come off; peel; fade; discolor',
    }))
      exact(r.detail[glyph], { label, text: glyph, byRole: 1 });
}
function validateB(v, p) {
  assert.equal(v.base, null);
  assert.equal(v.control, null);
  const rs = rows(v, p),
    ds = rs.map((r) => r.detail);
  assert(rs.every((r) => typeof r.detail === 'string'));
  const versions = new Set(rs.map((r) => r.name.split(' · ')[0]));
  assert.equal(versions.size, 1);
  assert.match(ds[0], /^[1-9]\d* rows, 0 still cut$/u);
  assert.match(ds[1], /to pick up; to adopt/u);
  assert.match(ds[2], /^[1-9]\d* glosses, \d+ at the cap, 0 unproven$/u);
  assert.equal(ds[3], '16 of 16 repaired');
  const mounted = ds[4].match(/^(\d+) of (\d+) saved words lit \((\d+) stars mounted\):/u);
  assert(mounted && +mounted[1] === 5 && +mounted[2] === 5 && +mounted[3] >= 5);
  const why = JSON.parse(ds[6]);
  assert(
    Object.values(why).includes('due today') &&
      Object.values(why).includes('missed in a test') &&
      Object.values(why).includes('you looked it up twice') &&
      Object.values(why).includes('missed yesterday'),
  );
  const silent = JSON.parse(ds[7]);
  assert.equal(silent.why, '');
  assert.equal(silent.word, '林');
  assert.match(ds[9], /^[1-9]\d* on glass:/u);
  const beads = JSON.parse(ds[10]);
  assert(beads.includes('shelf'));
  const depth = rs[10].name.match(/\((\d+) beads deep\)/u);
  assert(depth && +depth[1] >= 1);
  const shelf = JSON.parse(ds[11]);
  assert.equal(shelf.shelf.inside, true);
  assert.equal(shelf.shelf.covered, false);
  exact(JSON.parse(ds[12]), []);
  assert.equal(ds[13], 'written');
  assert.match(ds[14], /"text":"練習","why":"you marked it not yet","kind":"unknown"/u);
  assert.equal(ds[15], '');
  for (let i = 16; i < rs.length; i += 4) {
    assert.match(ds[i], /^[1-9]\d* nodes drawn, 0 cut at ≥0\.08 opacity/u);
    assert.match(ds[i + 1], /^[1-9]\d* nodes drawn, [1-9]\d* samples, 0 crossings drawn above 0/u);
    const held = ds[i + 2].match(
      /reading shown true, carried ([\d.]+)px past the rim, (\d+) samples, 0 crossings above 0/u,
    );
    assert(held && +held[1] > 5 && +held[2] > 0);
    assert.equal(ds[i + 3], '');
  }
}
/** Preserve the whole diagnostic sweep, but only admit the explicitly authorized target pairs. */
function sweepHeader(raw, p, ws, states) {
  assert.equal(raw.schemaVersion, 2);
  assert.equal(raw.runId, p.runId);
  assert.equal(raw.artifactSha256, p.identity.artifactSha256);
  assert.equal(raw.gitSha, p.identity.gitSha);
  assert.equal(raw.sourceDirty, false);
  exact(raw.identity, { gitSha: p.identity.gitSha, artifactSha256: p.identity.artifactSha256 });
  assert.equal(raw.verifierSha256, p.sources[shared]);
  assert.equal(raw.arrivalPredicateSha256, p.sources[arrival]);
  assert.equal(raw.partial, true);
  assert.equal(raw.fullAcceptance, false);
  assert.equal(raw.requestedScope, 'diagnostic');
  exact(raw.worlds, ws);
  exact(raw.states, states);
  exact(raw.selectors, { worlds: ws.length === 11 ? null : ws, states, demoOnly: false });
  exact(Object.keys(raw.engines), [p.engine]);
  nonempty(raw.engines[p.engine]);
  assert.equal(raw.error, undefined);
  exact(
    raw.results.map((r) => `${r.engine}/${r.world}/${r.state}`),
    ws.flatMap((w) => states.map((s) => `${p.engine}/${w}/${s}`)),
  );
  for (const r of raw.results) {
    assert(Array.isArray(r.pairs) && r.pairs.length > 0);
    assert.equal(r.error, undefined);
  }
}
function targetPairs(scene, predicate, minimum) {
  const pairs = scene.pairs.filter((pair) => predicate(pair.sel || ''));
  assert(pairs.length > 0, 'No target pair');
  for (const pair of pairs) {
    assert.equal(pair.ok, true);
    finite(pair.required);
    assert(pair.required >= 4.5);
    finite(pair.ratio);
    assert(pair.ratio >= Math.max(minimum, pair.required));
    assert.equal(pair.hidden, false);
    positive(pair.opacity);
    nonempty(pair.text);
    if (pair.lines) {
      assert(pair.lines.length > 0);
      for (const line of pair.lines) {
        assert.equal(line.ok, true);
        finite(line.ratio);
        assert(line.ratio >= Math.max(minimum, pair.required));
      }
    }
  }
  return pairs;
}
function validateContrast(v, p, extra) {
  base(v, p);
  assert.equal(v.pass, true);
  exact(v.problems, []);
  assert.equal(v.mutations, null);
  assert.equal(v.viewport, p.engine === 'webkit' ? 'phone' : 'desktop');
  assert(
    [1, 3].includes(v.sweepExit),
    'Diagnostic child must have completed; preserve its red or diagnostic success',
  );
  exact(v.surfaces, {
    words: 'thesaurus (word web 橋)',
    learn: 'search 歩く, near-in-meaning rows',
  });
  exact(Object.keys(v.perWorld), worlds);
  assert.equal(v.adapter.originalSha256, p.sources[shared]);
  assert.equal(v.adapter.adapterSha256, p.sources[source(p.suite)]);
  sha(v.adapter.runnerSha256);
  assert.equal(extra.runnerSha256, v.adapter.runnerSha256);
  const raw = extra.sweep;
  sweepHeader(raw, p, worlds, ['learn', 'words']);
  assert.equal(v.browser, raw.engines[p.engine]);
  for (const scene of raw.results) {
    const pairs = targetPairs(scene, (sel) => /\.?thes-(gloss|rel)\b/u.test(sel), 4.5);
    assert(pairs.some((pair) => /thes-rel/u.test(pair.sel)));
    if (scene.state === 'words') assert(pairs.some((pair) => /thes-gloss/u.test(pair.sel)));
    const summary = v.perWorld[scene.world][scene.state],
      worst = pairs.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
    assert.equal(summary.pairs, pairs.length);
    assert.equal(summary.failing, 0);
    exact(
      summary.worst,
      Object.fromEntries(
        ['ratio', 'required', 'fg', 'bg', 'text', 'sel'].map((key) => [key, worst[key]]),
      ),
    );
  }
}
function validateE2(v, p, extra) {
  base(v, p);
  exact(extra.baseline?.metadata, p.baseline, 'Missing independently verified E2 base');
  nonempty(extra.baseline.dir);
  exact(
    v.base,
    {
      dir: extra.baseline.dir,
      sha256: ['corridor.js', 'editorial.css'].map((name) => p.baseline.sha256[name]),
      head: p.identity.gitSha,
    },
    'Native E2 report used a foreign or historical baseline',
  );
  exact(v.only, []);
  exact(v.mutations, []);
  assert.equal(v.control, null);
  assert.equal(v.serveDir, null);
  assert.equal(v.served, null);
  const rs = rows(v, p);
  for (const r of rs) {
    const d = r.detail;
    if (r.name.startsWith('X13.cover ')) {
      assert(Number.isInteger(d.stops) && d.stops >= 8);
      const height = Number(r.name.match(/(?:390|320)×(844|568)/u)?.[1]);
      finite(height);
      finite(d.scrollMax);
      assert(d.scrollMax > height * 3);
      positive(d.tokensSeen);
      zero(d.covered);
      zero(d.unreachable);
      for (const key of ['wordsUnder', 'stopsWithBox', 'stopsWithReach', 'stopsWithPress'])
        zero(d[key]);
      exact(d.firstCovered, []);
      assert.equal(d.sample.shown, true);
      assert.equal(d.sample.reachable, true);
      exact(d.sample.size, [44, 44]);
      exact(d.errors, []);
    } else if (r.name.startsWith('X13.reach ')) {
      assert.equal(d.open.pressed, 'true');
      assert.equal(d.back.pressed, 'false');
      assert.equal(d.back.block, false);
      assert.equal(d.open.docked, true);
      assert.equal(d.back.docked, false);
      assert.equal(d.home.length, 4);
      assert.equal(d.back.box.length, 4);
      for (let i = 0; i < 4; i++) {
        finite(d.home[i]);
        finite(d.back.box[i]);
        assert(Math.abs(d.home[i] - d.back.box[i]) <= 1);
      }
      exact(d.errors, []);
    } else if (/^X13\.(?:look|fade) /u.test(r.name)) validateE2R2Witness(r, p.engine);
    else if (r.name.startsWith('X13.mac ')) {
      exact(d.base, d.build);
      nonempty(d.base.style);
      nonempty(d.base.dock);
      assert.equal(d.words, 120);
    } else if (r.name.startsWith('G61.fade ')) {
      assert(d.fading >= 3);
      zero(d.rising);
      finite(d.goneAt);
      assert(d.goneAt > 0 && d.goneAt <= 400);
      assert(Array.isArray(d.frames) && d.frames.length >= 3);
      const shown = d.frames.filter((f) => f[0] >= 0 && f[1] !== 'none');
      assert(shown.filter((f) => f[2] > 0.05 && f[2] < 0.95).length >= 3);
      assert(shown.every((f, i) => !i || f[2] <= shown[i - 1][2] + 0.001));
      assert.equal(d.after.hidden, true);
      assert.equal(d.after.display, 'none');
    } else if (r.name.startsWith('G61.still ')) {
      finite(d.movedWhileShown);
      assert(d.movedWhileShown < 0.5);
      assert.equal(d.seatKept, true);
      finite(d.back);
      assert(d.back < 0.5);
      assert.equal(d.after.hidden, true);
    } else if (r.name.startsWith('G61.reveal ')) {
      assert.equal(d.first.hidden, false);
      assert.equal(d.first.opacity, 1);
      positive(d.first.width);
    } else if (r.name.startsWith('G61.record ')) {
      assert.equal(d.recordEqual, true);
      sha(d.record.before);
      exact(d.record.before, d.record.after);
      exact(d.scroll.before, d.scroll.after);
    } else if (r.name.startsWith('G61 · ')) {
      finite(d.load);
      assert(d.load <= 20);
      assert(r.name.includes(`(load ${d.load} ≤ 20)`));
    } else if (r.name.startsWith('G61.trace ')) {
      finite(d.load);
      assert(d.load <= 20);
      assert(d.fold.frames.length >= 3 && d.reveal.frames.length >= 1);
    } else if (r.name.startsWith('G61.reduced ')) {
      assert.equal(d.first.hidden, true);
      assert.equal(d.first.display, 'none');
      zero(d.first.opacity);
      exact(d.errors, []);
    } else if (r.name.startsWith('G61.rest320 ')) {
      exact(Object.keys(d), ['at-320', 'reveal-390-fold-320', 'fold-390-then-320']);
      for (const [order, o] of Object.entries(d)) {
        assert.equal(o.ok, true);
        exact(o.errors, []);
        assert(o.folded && typeof o.folded === 'object');
        if (order === 'at-320') assert(o.fresh && o.revealed);
        else {
          assert.equal(o.fresh, null);
          assert.equal(o.revealed, null);
        }
        for (const state of ['fresh', 'revealed', 'folded'])
          if (o[state]) {
            for (const key of ['doc', 'inner', 'visual']) assert.equal(o[state][key], 320);
            for (const key of ['body', 'reader']) {
              finite(o[state][key]);
              assert(o[state][key] <= 320);
            }
            assert.equal(o[state].scale, 1);
          }
      }
    } else if (r.name.startsWith('G61.press '))
      exact(d, { count: 599, base: 599, freshDiffer: 0, foldedDiffer: 0, firstDiffer: [] });
    else if (r.name.startsWith('NAMI.sweep ')) {
      assert([1, 3].includes(d.exit));
      assert.equal(d.swaps, null);
      assert.equal(d.viewport, 'phone');
      nonempty(d.browser);
    } else if (r.name.startsWith('NAMI.')) {
      assert(d.ratio >= 4.6);
      positive(d.pairs);
      nonempty(d.text);
    }
  }
  const trace = rs.find((r) => r.name.startsWith('G61.trace ')).detail;
  exact(trace.errors, []);
  assert.equal(trace.load, rs.find((r) => r.name.startsWith('G61 · ')).detail.load);
  exact(trace.fold.frames, rs.find((r) => r.name.startsWith('G61.fade ')).detail.frames);
  exact(trace.reveal.first, rs.find((r) => r.name.startsWith('G61.reveal ')).detail.first);
  const raw = extra.sweep;
  sweepHeader(raw, p, ['nami'], ['learn', 'words', 'speak', 'speak-key']);
  for (const [index, state] of ['learn', 'words', 'speak', 'speak-key'].entries()) {
    const scene = raw.results[index];
    assert.equal(scene.state, state);
    const selector =
      index < 2 ? 'button#yoji-link > span.l-ja' : 'button#entry-sentence-practice > span.l-ja';
    const pairs = targetPairs(scene, (sel) => sel === selector, 4.6),
      suffix = [
        ['tools', 'rest'],
        ['tools', 'pointer'],
        ['practice', 'rest'],
        ['practice', 'pointer'],
      ][index].join('.');
    const d = rs.find((r) => r.name.startsWith(`NAMI.${suffix} `)).detail;
    assert.equal(d.pairs, pairs.length);
    assert.equal(d.ratio, Math.min(...pairs.map((pair) => pair.ratio)));
  }
  sha(extra.runnerSha256);
}
export function validateBatch3Native(value, p, extras = {}) {
  pinsValid(p);
  if (p.suite === 'hfix2e-examples') validateExamples(value, p);
  else if (p.suite === 'hfix2e-hold') validateHold(value, p);
  else if (p.suite === 'hfix2e-x10-kt3') validateX10(value, p);
  else if (p.suite === 'hfix2b') validateB(value, p);
  else if (p.suite === 'hfix2e-contrast') validateContrast(value, p, extras);
  else validateE2(value, p, extras);
  return true;
}
function regular(out, name) {
  assert.equal(name, name.split('/').pop());
  const file = join(out, name),
    stat = lstatSync(file);
  assert(stat.isFile() && !stat.isSymbolicLink());
  return readFileSync(file);
}
export function readBatch3Evidence(out, p) {
  const name = batch3NativeFile(p.suite, p.engine),
    raw = regular(out, name),
    files = { [name]: batch3Digest(raw) },
    extras = {};
  if (['hfix2e-contrast', 'hfix2e2'].includes(p.suite)) {
    const sweep = `sweep-${p.engine}.json`,
      runner =
        p.suite === 'hfix2e-contrast' ? 'hfix2e-contrast-runner.mjs' : 'hfix2e2-nami-runner.mjs';
    const sweepBytes = regular(out, sweep),
      runnerBytes = regular(out, runner);
    files[sweep] = batch3Digest(sweepBytes);
    files[runner] = batch3Digest(runnerBytes);
    extras.sweep = JSON.parse(sweepBytes);
    extras.runnerSha256 = files[runner];
    // The duplicate native full diagnostic remains available verbatim, never rewritten into green.
    files['contrast-sweep.json'] = batch3Digest(regular(out, 'contrast-sweep.json'));
    exact(
      JSON.parse(regular(out, 'contrast-sweep.json')),
      extras.sweep,
      'Native diagnostic copies disagree',
    );
  }
  if (p.suite === 'hfix2e2') {
    extras.baseline = readBatch3Base(out, p);
    Object.assign(files, extras.baseline.files);
    const baseProcess = regular(out, 'base-process.json');
    files['base-process.json'] = batch3Digest(baseProcess);
    exact(
      JSON.parse(baseProcess),
      {
        argv: [E2_BASE_TOOL, '--head', p.identity.gitSha, '--out', extras.baseline.dir],
        status: 0,
        signal: null,
        error: null,
      },
      'E2 baseline builder did not finish successfully',
    );
  }
  const processBytes = regular(out, 'native-process.json');
  files['native-process.json'] = batch3Digest(processBytes);
  const child = JSON.parse(processBytes);
  const value = JSON.parse(raw);
  validateBatch3Native(value, p, extras);
  return { value, extras, files, child };
}
export function makeBatch3Admission(evidence, p, child) {
  pinsValid(p);
  exact(evidence.child, child, 'Native process record differs');
  assert.equal(child.status, 0);
  assert.equal(child.signal, null);
  assert.equal(child.error, null);
  exact(child.argv, [source(p.suite)]);
  validateBatch3Native(evidence.value, p, evidence.extras);
  return {
    schemaVersion: 1,
    suite: p.suite,
    scope: 'complete-native-lane',
    globalAcceptance: false,
    pass: true,
    pins: p,
    child,
    files: evidence.files,
  };
}
export function validateBatch3Admission(value, out, p) {
  pinsValid(p);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.suite, p.suite);
  assert.equal(value.scope, 'complete-native-lane');
  assert.equal(value.globalAcceptance, false);
  assert.equal(value.pass, true);
  exact(value.pins, p, 'Stale/foreign gate attempt');
  const evidence = readBatch3Evidence(out, p);
  exact(value.files, evidence.files, 'Native evidence changed');
  exact(value, makeBatch3Admission(evidence, p, value.child));
  return true;
}
