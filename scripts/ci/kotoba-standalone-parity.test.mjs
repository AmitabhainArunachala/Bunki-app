import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { parse } from 'acorn';
const root = resolve('.'),
  site = process.env.KAIRO_SITE_DIR;
assert(site, 'Pinned built artifact required; never fall back to source');
assert.equal(
  process.env.KAIRO_ARTIFACT_SHA256,
  'c848fb916f738c22485ba8e41ec4c9350fdf7848fe87cef6461fa6d62d58f1e9',
);
const verifier = readFileSync(
  resolve(root, 'prototypes/corridor/tools/verify-kotoba-mine.mjs'),
  'utf8',
);
const ast = parse(verifier, { ecmaVersion: 'latest', sourceType: 'module' });
const parity = ast.body.find(
  (n) => n.type === 'FunctionDeclaration' && n.id.name === 'verifyBackParity',
);
assert(parity, 'Exercise actual K030 function, not a parallel implementation');
const helper = ast.body.find(
  (n) => n.type === 'FunctionDeclaration' && n.id.name === 'standaloneMountForParity',
);
const code =
  (helper ? verifier.slice(helper.start, helper.end) + '\n' : '') +
  verifier.slice(parity.start, parity.end) +
  '\nverifyBackParity();';
const mountPath = resolve(site, 'decks/player/mount.js');
const mount = readFileSync(mountPath, 'utf8');
const substitutions = [
  "import {isSharedDeck,isSharedStudyMode} from '../../shared-study-content.mjs';",
  "const sharedPlayer = () => import('./shared-mount.mjs');",
  "const fsrsApi = window.__TSFSRS__ || (await import('../../vendor/ts-fsrs.mjs'));",
];
for (const value of substitutions)
  assert.equal(
    mount.split(value).length - 1,
    1,
    'fixture source has each declared representation once',
  );
function constant(name) {
  for (const n of ast.body)
    if (n.type === 'VariableDeclaration')
      for (const d of n.declarations)
        if (d.id.name === name && d.init.type === 'Literal') return d.init.value;
  throw Error(name);
}
function run(source = mount, alterPage = null) {
  const checks = [];
  const context = {
    REPO_DIR: root,
    CORRIDOR_DIR: site,
    DECK_PATH: resolve(site, 'decks/kotoba-mcd/deck.json'),
    RULE_TEXT: constant('RULE_TEXT'),
    UI_RULE_TEXT: constant('UI_RULE_TEXT'),
    resolve,
    readJson: (path) => JSON.parse(readFileSync(path, 'utf8')),
    readFileSync: (path, encoding) => {
      if (resolve(path) === mountPath) return source;
      const value = readFileSync(path, encoding);
      return alterPage && /\/release\/study(?:-mcd)?\.html$/.test(path) ? alterPage(value) : value;
    },
    check: (id, label, passed, detail) => checks.push({ id, passed, detail }),
  };
  vm.runInNewContext(code, context, { timeout: 15000 });
  const result = checks.find((x) => x.id === 'K030');
  assert(result, 'Actual K030 must execute');
  return result;
}
test('K030 accepts exact accepted exporter representation while preserving its CSS/motion/451-font checks', () => {
  const result = run();
  assert.equal(result.passed, true, result.detail);
  const rows = JSON.parse(result.detail);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.mount, true);
    assert.equal(row.css, true);
    assert.equal(row.roomMotion, true);
    assert.equal(row.fonts, 451);
  }
});
test('K030 rejects an unexpected authored mount change and changed generated remainder', () => {
  const needle = 'function gradeBar(id) {';
  assert.equal(mount.split(needle).length - 1, 1);
  assert.equal(run(mount.replace(needle, needle + '\nconst unapproved = true;')).passed, false);
  assert.equal(
    run(mount, (text) => text.replace(needle, needle + '\nconst unapproved = true;')).passed,
    false,
  );
});
for (const extra of [
  "import './unexpected.mjs';\n",
  "const unapproved = () => import('./unexpected.mjs');\n",
])
  test(
    'K030 rejects unrecognized module input without normalizing it away: ' + extra.trim(),
    () => {
      assert.equal(run(extra + mount).passed, false);
    },
  );
for (const [i, pattern] of substitutions.entries())
  for (const count of [0, 2])
    test(`K030 requires declared substitution ${i + 1} exactly once, refusing count${count}`, () => {
      const input = count === 0 ? mount.replace(pattern, '') : pattern + '\n' + mount;
      assert.throws(() => run(input), /once|exactly|expected|pattern|substitution/i);
    });
