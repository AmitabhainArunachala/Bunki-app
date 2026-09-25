/**
 * Source controls for adjudicate()'s fixture-foundation gate (Codex D11 verifier r2 independent review). Pure Node, no
 * browser: one constructed control that is a valid kill when its foundation is complete, and the same control over a
 * candidate whose F0 inventory is omitted, duplicated, failed or renamed. Each must come out `incomplete`, never killed.
 * Run: node tools/reader-gloss-adjudicate-controls.mjs (exit 0 only when every case gives its expected verdict).
 */
import { adjudicate } from './reader-gloss-mutants.mjs';

const F0 = ['F0.a', 'F0.b', 'F0.c'];
const runRows = { run: ['R.req', 'R.kill'] };
const spec = { run: 'run', edits: ['e'], requires: ['R.req'], kills: ['R.kill'], allowed: [], witness: () => '' };
const control = () => ({ rows: [{ id: 'R.req', pass: true }, { id: 'R.kill', pass: false, detail: 'dies' }],
  served: [{ file: 'f.js' }], pageErrors: [], setupError: null, error: null });
const candidate = (f0) => [...f0, { id: 'R.req', pass: true }, { id: 'R.kill', pass: true }];
const ok = (id) => ({ id, name: `${id} check`, pass: true });
const cases = [
  ['complete foundation', candidate(F0.map(ok)), 'killed'],
  ['omitted F0 id', candidate(F0.slice(0, 2).map(ok)), 'incomplete'],
  ['duplicated F0 id', candidate([...F0.map(ok), ok('F0.a')]), 'incomplete'],
  ['failed F0 check', candidate([ok('F0.a'), { ...ok('F0.b'), pass: false }, ok('F0.c')]), 'incomplete'],
  ['renamed F0 id', candidate([ok('F0.a'), ok('F0.b'), ok('F0.cc')]), 'incomplete'],
  ['no foundation declared', candidate(F0.map(ok)), 'incomplete', []],
];
let failed = 0;
for (const [name, candidateRows, expected, foundationIds = F0] of cases) {
  const [verdict, reason] = adjudicate(spec, control(), { runRows, editFile: () => 'f.js', candidateRows, foundationIds });
  const pass = verdict === expected;
  if (!pass) failed++;
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${name}: ${verdict} (expected ${expected}) — ${reason}`);
}
process.exit(failed ? 1 : 0);
