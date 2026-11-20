/**
 * Reconstruct the effective historical base for verify-hfix2e2's no-change rows.
 *
 * Start from the exact candidate Git objects, retain later shared-seat lifecycle fixes, and
 * remove only the E2 CSS deltas that were not superseded. The emitted witness records every
 * source object and textual rule used by the projection.
 *
 *   node prototypes/corridor/tools/hfix2e2-base.mjs --head <combined sha> --out <absolute dir>
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const LANE_COMMITS = Object.freeze(['d61334a5', '680fa019', '1e8e1b08', 'f23c3133']);
export const FILES = Object.freeze([
  'prototypes/corridor/corridor.js',
  'prototypes/corridor/editorial.css',
]);
const HISTORICAL_COMMITS = Object.freeze([
  'd61334a538a6e34ebd0701862521914cc1c2ff4b',
  '680fa019e692e474beec544d5c1c901c46d50237',
  '1e8e1b085c7ca23c4563d532ca3a8268e23d5c93',
  'f23c3133c0739251552509bc181b50b9104f709e',
]);
const SUPERSEDING_COMMITS = Object.freeze([
  '8db0ff2fa316c65dd0e2f5845d0fb5f051e60772',
  'da0e3e6153735e31437dbf2e83e667f7a7cf20ec',
  '2462bb079a4fa9e407aef41f9b4b197fbce96f23',
  'e53a7eb08909d735c68884c7c6e47947dcf643c2',
  '4fde751588e421a6f84e9aa8373648f315f5b477',
]);
const HISTORICAL_BASE = '1f790977139e3da318b6260b31d21edfde8a1c97';
const digest = (value) => createHash('sha256').update(value).digest('hex');

const args = process.argv.slice(2);
const arg = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const head = arg('--head'),
  out = arg('--out');
assert(head && out && isAbsolute(out), 'usage: hfix2e2-base.mjs --head <sha> --out <absolute dir>');
assert.match(head, /^[a-f0-9]{40}$/u);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
);
const git = (...args) =>
  execFileSync('git', args, { cwd: REPO, env, maxBuffer: 1 << 29 }).toString();
assert.equal(git('rev-parse', '--verify', `${head}^{commit}`).trim(), head);
assert.equal(git('rev-parse', `${HISTORICAL_COMMITS[3]}^`).trim(), HISTORICAL_BASE);
for (const commit of [...HISTORICAL_COMMITS, ...SUPERSEDING_COMMITS])
  git('merge-base', '--is-ancestor', commit, head);

const inputs = [],
  rules = [];
function blob(commit, name) {
  const path = `prototypes/corridor/${name}`,
    text = git('show', `${commit}:${path}`);
  inputs.push({
    commit,
    path,
    blob: git('rev-parse', `${commit}:${path}`).trim(),
    sha256: digest(text),
  });
  return text;
}
function hunks(commit, context = 3) {
  const diff = git(
    'diff',
    '--no-ext-diff',
    '--no-textconv',
    `--unified=${context}`,
    `${commit}^`,
    commit,
    '--',
    'prototypes/corridor/editorial.css',
  );
  return diff
    .split(/^@@.*@@.*\n/m)
    .slice(1)
    .map((hunk) => {
      const lines = hunk.split('\n');
      return {
        before: lines
          .filter((line) => line.startsWith('-') || line.startsWith(' '))
          .map((line) => `${line.slice(1)}\n`)
          .join(''),
        after: lines
          .filter((line) => line.startsWith('+') || line.startsWith(' '))
          .map((line) => `${line.slice(1)}\n`)
          .join(''),
      };
    });
}

const js = blob(head, 'corridor.js');
let css = blob(head, 'editorial.css');
function replace(from, to, label) {
  assert(from.length > 0);
  assert.equal(css.split(from).length, 2, `exactly one ${label}`);
  css = css.replace(from, to);
  rules.push({
    label,
    removedSha256: digest(from),
    insertedSha256: digest(to),
    removedBytes: Buffer.byteLength(from),
    insertedBytes: Buffer.byteLength(to),
  });
}

const deleted = hunks(SUPERSEDING_COMMITS[0], 0);
assert.equal(deleted.length, 1);
assert.equal(deleted[0].after, '');
for (const [index, hunk] of hunks(HISTORICAL_COMMITS[0]).entries()) {
  assert(hunk.after.includes(deleted[0].before));
  replace(
    hunk.after.replace(deleted[0].before, ''),
    hunk.before,
    `X13.round2.${index}: later tab transition deletion vacuous`,
  );
}
const namiFirst = hunks(HISTORICAL_COMMITS[1], 1)[0];
replace(namiFirst.after, namiFirst.before, 'NAMI original shelf label');
const dead = blob(SUPERSEDING_COMMITS[3], 'editorial.css'),
  deadRule = 'body .sheet .teacher-door .chip.btn-tertiary { flex-direction: row; }';
assert(dead.includes(deadRule));
assert(css.includes(deadRule));
rules.push({
  label: 'NAMI old chip rule deleted by later controls fix; preserve deletion',
  supersededBy: SUPERSEDING_COMMITS[3],
});
const extended = blob(SUPERSEDING_COMMITS[4], 'editorial.css'),
  namiStart = extended.indexOf('/* 浪 (Hfix-2e2):');
assert(namiStart >= 0);
const namiEnd = extended.indexOf('/* 殻 is already phosphor', namiStart);
assert(namiEnd > namiStart);
replace(
  extended.slice(namiStart, namiEnd),
  '',
  'NAMI extended later selector: remove historical label ink definition',
);

const laterCss = blob(SUPERSEDING_COMMITS[2], 'editorial.css'),
  g61Start = laterCss.indexOf('/* Hfix-2e2 · G6-1 · only opacity transitions.');
assert(g61Start >= 0);
const g61End = laterCss.indexOf('/* at 200 % text', g61Start);
assert(g61End > g61Start);
const g61 = laterCss.slice(g61Start, g61End);
assert(g61.includes('data-touch-fading'));
assert(g61.includes('transition: opacity'));
replace(g61, '', 'G61: later opacity-only CSS supersedes original discrete display block');
for (const [index, hunk] of hunks(HISTORICAL_COMMITS[3]).entries())
  replace(hunk.after, hunk.before, `X13.original.${index}`);

for (const commit of [HISTORICAL_COMMITS[0], HISTORICAL_COMMITS[1], HISTORICAL_COMMITS[3]])
  assert.equal(git('diff', `${commit}^`, commit, '--', 'prototypes/corridor/corridor.js'), '');
const legacy = git(
  'diff',
  `${HISTORICAL_COMMITS[2]}^`,
  HISTORICAL_COMMITS[2],
  '--',
  'prototypes/corridor/corridor.js',
);
assert(legacy.includes('new WeakSet()'));
assert(legacy.includes('if (touchReadingFading(rt)) return;'));
const laterJs = blob(SUPERSEDING_COMMITS[1], 'corridor.js');
assert(laterJs.includes('const TOUCH_READING_FADES = new Map();'));
assert(laterJs.includes('if (!(time > 0)) { complete(); return; }'));
assert(!css.includes('/* Hfix-2e2 · G6-1'));
assert(!css.includes('/* Hfix-2e2 · X-13'));
assert(!css.includes('--color-accent-label: #a8c4db'));
for (const text of [js, css]) assert(!/^(?:<{7}|={7}|>{7})/mu.test(text));

const files = { 'corridor.js': js, 'editorial.css': css },
  metadata = {
    head,
    reverted: [...LANE_COMMITS],
    files: [...FILES],
    sha256: {
      'corridor.js': digest(js),
      'editorial.css': digest(css),
    },
    derivation: {
      schemaVersion: 1,
      strategy: 'historical-e2-effective-delta-v2',
      historicalBase: HISTORICAL_BASE,
      historicalCommits: [...HISTORICAL_COMMITS],
      supersedingCommits: [...SUPERSEDING_COMMITS],
      inputs,
      rules,
      jsResolution:
        'retain later shared-seat/owned-cycle implementation; zero-transition conceal is synchronous',
    },
  };
mkdirSync(out, { recursive: true });
for (const [name, text] of Object.entries(files)) writeFileSync(join(out, name), text);
writeFileSync(join(out, 'base.json'), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(
  `HFIX2E2_BASE_DIR=${out} HFIX2E2_BASE_SHA256=${metadata.sha256['corridor.js']},${metadata.sha256['editorial.css']}`,
);
