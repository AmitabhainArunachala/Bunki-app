/** Print independently evaluated base and candidate batteryGates membership. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { batteryGates } from '../verify-release-gates.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export async function parity(base) {
  assert(base, 'Pass an actual base git revision');
  const sha = execFileSync('git', ['rev-parse', '--verify', `${base}^{commit}`], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  let source = execFileSync('git', ['show', `${sha}:scripts/verify-release-gates.mjs`], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
  });
  // Relative dependencies are plumbing; the original revision's gate function is
  // evaluated intact, independently of the candidate's definition.
  source = source
    .replaceAll(
      "from './build-reading-module.mjs'",
      `from ${JSON.stringify(pathToFileURL(join(root, 'scripts/build-reading-module.mjs')).href)}`,
    )
    .replaceAll(
      "from './corridor-assets.mjs'",
      `from ${JSON.stringify(pathToFileURL(join(root, 'scripts/corridor-assets.mjs')).href)}`,
    );
  source = source.replace(
    'const SELF = fileURLToPath(import.meta.url);',
    `const SELF = ${JSON.stringify(join(root, 'scripts/verify-release-gates.mjs'))};`,
  );
  const baseline = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  const before = baseline
      .batteryGates('/unused', {})
      .map((g) => g.name)
      .sort(),
    after = batteryGates('/unused', {})
      .map((g) => g.name)
      .sort();
  console.log(
    `BASE ${sha} batteryGates (${before.length})\n${before.join('\n')}\n\nCURRENT batteryGates (${after.length})\n${after.join('\n')}`,
  );
  assert.equal(new Set(before).size, before.length);
  assert.equal(new Set(after).size, after.length);
  const missing = before.filter((name) => !after.includes(name)),
    added = after.filter((name) => !before.includes(name));
  console.log(`\nMissing: ${missing.join(', ') || 'none'}\nAdded: ${added.join(', ') || 'none'}`);
  assert.equal(missing.length, 0, 'Required gate names lost');
  return { schemaVersion: 1, baseSha: sha, before, after, missing, added };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const base = args[args.indexOf('--base') + 1];
  parity(base)
    .then((result) => {
      if (args.includes('--out'))
        writeFileSync(args[args.indexOf('--out') + 1], JSON.stringify(result, null, 2) + '\n');
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
