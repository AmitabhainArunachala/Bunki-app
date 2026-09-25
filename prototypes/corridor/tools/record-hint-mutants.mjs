/**
 * Mutation controls for verify-record-hint.mjs. Copies a built site twice and changes one
 * line in each corridor.js; each copy's build-identity names its mutant and carries the
 * mutated file's digest, so the suite runs it and its receipts say which mutant ran.
 *
 *   m1  the held/pending filter removed: the lock always "looks free".
 *   m2  the look becomes a queued exclusive locks.request (the rejected v4 watcher).
 *
 * Usage: node record-hint-mutants.mjs <built-site-dir> <out-dir>
 */
import { createHash } from 'node:crypto';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [site, out] = process.argv.slice(2).map((path) => path && resolve(path));
if (!site || !out) throw new Error('Usage: node record-hint-mutants.mjs <built-site-dir> <out-dir>');
const MUTANTS = {
  m1: ['const free = !named(snapshot.held) && !named(snapshot.pending);', 'const free = true;'],
  m2: ["query = typeof navigator.locks?.query === 'function' ? navigator.locks.query.bind(navigator.locks) : null;",
    "query = () => new Promise((done) => navigator.locks.request(RECORD_LOCK, { mode: 'exclusive' }, () => done({ held: [], pending: [] })));"],
};
for (const [name, [from, to]] of Object.entries(MUTANTS)) {
  const dir = resolve(out, name);
  cpSync(site, dir, { recursive: true });
  const path = resolve(dir, 'corridor.js');
  const source = readFileSync(path, 'utf8');
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${name}: expected exactly one match, found ${count}`);
  const mutated = source.replace(from, to);
  writeFileSync(path, mutated);
  const identityPath = resolve(dir, 'build-identity.json');
  const identity = JSON.parse(readFileSync(identityPath, 'utf8'));
  const digest = createHash('sha256').update(mutated).digest('hex');
  identity.files = identity.files.map((row) => (row.path === 'corridor.js' ? { ...row, sha256: digest } : row));
  identity.mutant = name;
  writeFileSync(identityPath, JSON.stringify(identity, null, 2) + '\n');
  console.log(`${name}: ${dir}`);
}
