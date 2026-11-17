import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SUBJECT = '087b42bc922cd9460561c8959821e614334704a8';
const BASE = '1f790977139e3da318b6260b31d21edfde8a1c97';
const COMMITS = [
  'd61334a538a6e34ebd0701862521914cc1c2ff4b',
  '680fa019e692e474beec544d5c1c901c46d50237',
  '1e8e1b085c7ca23c4563d532ca3a8268e23d5c93',
  'f23c3133c0739251552509bc181b50b9104f709e',
];
const LATER = [
  '8db0ff2fa316c65dd0e2f5845d0fb5f051e60772',
  'da0e3e6153735e31437dbf2e83e667f7a7cf20ec',
  '2462bb079a4fa9e407aef41f9b4b197fbce96f23',
  'e53a7eb08909d735c68884c7c6e47947dcf643c2',
  '4fde751588e421a6f84e9aa8373648f315f5b477',
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

function derive(root) {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, env, maxBuffer: 32 * 1024 * 1024 }).toString();
  assert.equal(git('rev-parse', `${COMMITS[3]}^`).trim(), BASE);
  const inputs = [];
  const rules = [];
  const blob = (commit, name) => {
    const path = `prototypes/corridor/${name}`;
    const text = git('show', `${commit}:${path}`);
    inputs.push({
      commit,
      path,
      blob: git('rev-parse', `${commit}:${path}`).trim(),
      sha256: digest(text),
    });
    return text;
  };
  for (const commit of [...COMMITS, ...LATER]) git('merge-base', '--is-ancestor', commit, SUBJECT);

  const js = blob(SUBJECT, 'corridor.js');
  const subjectCss = blob(SUBJECT, 'editorial.css');
  let css = subjectCss;
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

  const deleted = hunks(LATER[0], 0);
  assert.equal(deleted.length, 1);
  assert.equal(deleted[0].after, '');
  for (const [index, hunk] of hunks(COMMITS[0]).entries()) {
    assert(hunk.after.includes(deleted[0].before));
    replace(
      hunk.after.replace(deleted[0].before, ''),
      hunk.before,
      `X13.round2.${index}: later tab transition deletion vacuous`,
    );
  }
  const namiFirst = hunks(COMMITS[1], 1)[0];
  replace(namiFirst.after, namiFirst.before, 'NAMI original shelf label');
  const dead = blob(LATER[3], 'editorial.css');
  const deadRule = 'body .sheet .teacher-door .chip.btn-tertiary { flex-direction: row; }';
  assert(dead.includes(deadRule));
  assert(css.includes(deadRule));
  rules.push({
    label: 'NAMI old chip rule deleted by later controls fix; preserve deletion',
    supersededBy: LATER[3],
  });
  const extended = blob(LATER[4], 'editorial.css');
  const namiStart = extended.indexOf('/* 浪 (Hfix-2e2):');
  assert(namiStart >= 0);
  const namiEnd = extended.indexOf('/* 殻 is already phosphor', namiStart);
  assert(namiEnd > namiStart);
  replace(
    extended.slice(namiStart, namiEnd),
    '',
    'NAMI extended later selector: remove historical label ink definition',
  );

  const laterCss = blob(LATER[2], 'editorial.css');
  const start = laterCss.indexOf('/* Hfix-2e2 · G6-1 · only opacity transitions.');
  assert(start >= 0);
  const end = laterCss.indexOf('/* at 200 % text', start);
  assert(end > start);
  const g61 = laterCss.slice(start, end);
  assert(g61.includes('data-touch-fading'));
  assert(g61.includes('transition: opacity'));
  replace(g61, '', 'G61: later opacity-only CSS supersedes original discrete display block');
  for (const [index, hunk] of hunks(COMMITS[3]).entries())
    replace(hunk.after, hunk.before, `X13.original.${index}`);

  for (const commit of [COMMITS[0], COMMITS[1], COMMITS[3]])
    assert.equal(git('diff', `${commit}^`, commit, '--', 'prototypes/corridor/corridor.js'), '');
  const legacy = git('diff', `${COMMITS[2]}^`, COMMITS[2], '--', 'prototypes/corridor/corridor.js');
  assert(legacy.includes('new WeakSet()'));
  assert(legacy.includes('if (touchReadingFading(rt)) return;'));
  const laterJs = blob(LATER[1], 'corridor.js');
  assert(laterJs.includes('const TOUCH_READING_FADES = new Map();'));
  assert(laterJs.includes('if (!(time > 0)) { complete(); return; }'));
  assert(!css.includes('/* Hfix-2e2 · G6-1'));
  assert(!css.includes('/* Hfix-2e2 · X-13'));
  assert(!css.includes('--color-accent-label: #a8c4db'));
  for (const text of [js, css]) assert(!/^(<<<<<<<|=======|>>>>>>>)/m.test(text));

  return {
    siteFiles: { 'corridor.js': js, 'editorial.css': subjectCss },
    files: { 'corridor.js': js, 'editorial.css': css },
    baseline: {
      head: SUBJECT,
      reverted: COMMITS.map((commit) => commit.slice(0, 8)),
      files: ['prototypes/corridor/corridor.js', 'prototypes/corridor/editorial.css'],
      sha256: { 'corridor.js': digest(js), 'editorial.css': digest(css) },
      derivation: {
        schemaVersion: 1,
        strategy: 'historical-e2-effective-delta-v2',
        historicalBase: BASE,
        historicalCommits: [...COMMITS],
        supersedingCommits: [...LATER],
        inputs,
        rules,
        jsResolution:
          'retain later shared-seat/owned-cycle implementation; zero-transition conceal is synchronous',
      },
    },
  };
}

let cachedAuthority;
function authority() {
  if (cachedAuthority) return cachedAuthority;
  const rootDir = realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)));
  const derived = derive(rootDir);
  const parent = join(homedir(), '.dharma', 'bunki', 'vh-batch3-historical-fixtures');
  mkdirSync(parent, { recursive: true });
  const siteDir = mkdtempSync(join(parent, 'site-'));
  process.once('exit', () => rmSync(siteDir, { recursive: true, force: true }));
  for (const [name, bytes] of Object.entries(derived.siteFiles))
    writeFileSync(join(siteDir, name), bytes);
  cachedAuthority = { rootDir, siteDir, ...derived };
  return cachedAuthority;
}

export function createHistoricalFixture({ value, pins, extras, files, engine }) {
  const fixture = authority();
  assert.equal(pins.engine, engine);
  pins.rootDir = fixture.rootDir;
  pins.siteDir = fixture.siteDir;
  pins.identity.gitSha = SUBJECT;
  pins.baseline = structuredClone(fixture.baseline);

  value.build = SUBJECT;
  if (Object.hasOwn(value, 'gitSha')) value.gitSha = SUBJECT;
  if (value.identity) value.identity.gitSha = SUBJECT;
  value.base.head = SUBJECT;
  value.base.sha256 = ['corridor.js', 'editorial.css'].map((name) => fixture.baseline.sha256[name]);

  extras.sweep.gitSha = SUBJECT;
  extras.sweep.identity.gitSha = SUBJECT;
  extras.baseline.metadata = structuredClone(fixture.baseline);

  return {
    value,
    pins,
    extras,
    files,
    historicalBaselineFiles: structuredClone(fixture.files),
  };
}
