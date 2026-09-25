/**
 * Mutation controls for verify-record-hint.mjs (via make-corridor-mutant.mjs: APFS clones,
 * consistent build identity, a `mutant` name in the receipt).
 *
 *   m1  the held/pending filter removed: the lock always "looks free"
 *       → W1 "no offer while the owner lives" must fail.
 *   m2  the look becomes a queued exclusive locks.request (the rejected v4 watcher)
 *       → W1/W2 request-count rows must fail, deterministically.
 *
 * Usage: node record-hint-mutants.mjs <built-site-dir> <out-dir>
 * Then run the suite with KAIRO_SITE_DIR=<out>/m1 KAIRO_ARTIFACT_SHA256=<printed digest>.
 */
import { resolve } from 'node:path';
import { makeMutant } from './make-corridor-mutant.mjs';

const [site, out] = process.argv.slice(2).map((path) => path && resolve(path));
if (!site || !out) throw new Error('Usage: node record-hint-mutants.mjs <built-site-dir> <out-dir>');
const MUTANTS = {
  m1: ['const free = !named(snapshot.held) && !named(snapshot.pending);', 'const free = true;'],
  m2: ["query = typeof navigator.locks?.query === 'function' ? navigator.locks.query.bind(navigator.locks) : null;",
    "query = () => new Promise((done) => navigator.locks.request(RECORD_LOCK, { mode: 'exclusive' }, () => done({ held: [], pending: [] })));"],
};
for (const [name, [from, to]] of Object.entries(MUTANTS)) {
  const made = makeMutant({ site, out, name, edits: [{ from, to }] });
  console.log(`${name} ${made.dir} ${made.artifactSha256}`);
}
