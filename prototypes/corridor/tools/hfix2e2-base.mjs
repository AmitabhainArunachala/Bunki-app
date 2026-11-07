/**
 * Hfix-2e part 2 · the honest base for verify-hfix2e2's no-change rows in a combined build.
 *
 * In a woven build, the lane's own base (1f790977's corridor.js and editorial.css) also lacks every other lane's reader
 * changes, so comparing the build against it no longer isolates this lane (window 3's smoke: X13.mac and G61.press, the
 * whole reading 55 px apart). The base this writes is the combined source with ONLY this lane's four product commits
 * taken back out of the two files they touch: each commit's own diff of corridor.js and editorial.css, reversed, newest
 * first, on the head's bytes. Nothing is committed and no branch or worktree is touched: git is only read.
 *
 *   node prototypes/corridor/tools/hfix2e2-base.mjs --head <combined sha> --out <absolute dir>
 *
 * Writes <out>/corridor.js, <out>/editorial.css and <out>/base.json ({ head, reverted, sha256 }), and prints the pin the
 * verifier takes: HFIX2E2_BASE_DIR=<out> HFIX2E2_BASE_SHA256=<corridor.js sha256>,<editorial.css sha256>. A reversal that
 * does not apply cleanly stops with an error; nothing is guessed.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
// this lane's product commits, newest first: X-13 round 2, nami, G6-1, X-13 (verify-hfix2e2.mjs's own commits touch no product file)
export const LANE_COMMITS = Object.freeze(['d61334a5', '680fa019', '1e8e1b08', 'f23c3133']);
export const FILES = Object.freeze(['prototypes/corridor/corridor.js', 'prototypes/corridor/editorial.css']);

const args = process.argv.slice(2);
const arg = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const head = arg('--head'), out = arg('--out');
assert(head && out && isAbsolute(out), 'usage: hfix2e2-base.mjs --head <sha> --out <absolute dir>');
const git = (...a) => execFileSync('git', a, { cwd: REPO, maxBuffer: 1 << 29 });
const full = git('rev-parse', '--verify', `${head}^{commit}`).toString().trim();
for (const commit of LANE_COMMITS) {
  // a commit the head does not contain cannot be taken out of it
  try { git('merge-base', '--is-ancestor', commit, full); } catch { throw new Error(`${commit} is not in ${full}`); }
  const touched = git('diff-tree', '--no-commit-id', '--name-only', '-r', commit).toString().trim().split('\n');
  assert(touched.every((f) => FILES.includes(f)), `${commit} touches more than the two files: ${touched.join(', ')}`);
}
const work = mkdtempSync(join(tmpdir(), 'hfix2e2-base-'));
try {
  for (const file of FILES) {
    mkdirSync(dirname(join(work, file)), { recursive: true });
    writeFileSync(join(work, file), git('show', `${full}:${file}`));
  }
  for (const commit of LANE_COMMITS) {
    const patch = join(work, `${commit}.patch`);
    writeFileSync(patch, git('diff', `${commit}^`, commit, '--', ...FILES));
    execFileSync('git', ['apply', '-R', '--check', patch], { cwd: work });
    execFileSync('git', ['apply', '-R', patch], { cwd: work });
  }
  mkdirSync(out, { recursive: true });
  const sha256 = {};
  for (const file of FILES) {
    const bytes = readFileSync(join(work, file)), name = file.split('/').pop();
    writeFileSync(join(out, name), bytes);
    sha256[name] = createHash('sha256').update(bytes).digest('hex');
  }
  writeFileSync(join(out, 'base.json'), `${JSON.stringify({ head: full, reverted: LANE_COMMITS, files: FILES, sha256 }, null, 2)}\n`);
  console.log(`HFIX2E2_BASE_DIR=${out} HFIX2E2_BASE_SHA256=${sha256['corridor.js']},${sha256['editorial.css']}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
