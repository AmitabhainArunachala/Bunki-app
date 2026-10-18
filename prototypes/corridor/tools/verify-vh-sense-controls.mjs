/** VH SENSE served controls: candidate → one mutation → completed intended red → restored candidate.
 * No shipped source is edited. One fixture scope per child is explicitly diagnostic (green exit 3). */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCorridorEvidence, resolveCorridorSite } from '../../../scripts/resolve-corridor-site.mjs';
import { exactRoster, selection } from './vh-voice-contracts.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const suite = join(here, 'verify-sense-truth.mjs');
const digest = (s) => createHash('sha256').update(s).digest('hex');
const site = resolveCorridorSite(), out = resolveCorridorEvidence();
const identity = JSON.parse(readFileSync(join(site, 'build-identity.json'), 'utf8'));
const sourceDigest = digest(readFileSync(join(site, 'corridor.js')));
const runId = process.env.KAIRO_GATE_RUN_ID || randomUUID();
const engines = process.env.KAIRO_BROWSER && process.env.KAIRO_BROWSER !== 'all' ? [process.env.KAIRO_BROWSER] : ['chromium', 'webkit'];
assert(engines.every((e) => ['chromium', 'webkit'].includes(e)));
const controls = [
  { id: 'discard-completed-red-on-retry', fixture: 'adapt-n3:govonline:article-202609-radio-3741#36', row: 'G.ない, auxiliary (聞こえない)', downstream: ['G.ない, auxiliary (聞こえない).incomplete'] },
  { id: 'pronunciation-ta-promoted-to-door', fixture: 'bunki-read-n3-gojuon-sanskrit#233', row: 'G.悉曇（しったん）: た', downstream: [] },
  { id: 'pronunciation-n-promoted-to-door', fixture: 'bunki-read-n3-gojuon-sanskrit#234', row: 'G.悉曇（しったん）: ん', downstream: [] },
  { id: 'quoted-reading-demoted-to-annotation', fixture: 'bunki-graded-n3-hashira-counter#242', row: 'G.「いちちゅう」: ちゅう.classification', downstream: ['G.「いちちゅう」: ちゅう'] },
];
const selected = selection(process.env.SENSE_VH_CONTROLS, controls.map((c) => c.id), 'SENSE_VH_CONTROLS');
const jobs = engines.flatMap((engine) => controls.filter((c) => !selected || selected.includes(c.id)).map((control) => ({ engine, control })));
const rows = [];
for (const { engine, control } of jobs) {
  const phases = [];
  for (const phase of ['baseline', 'mutant', 'restore']) {
    const nonce = randomUUID(), dir = join(out, runId, engine, control.id, `${phase}-${nonce}`); mkdirSync(dir, { recursive: true });
    const env = { ...process.env, KAIRO_BROWSER: engine, KAIRO_EVIDENCE_DIR: dir, KAIRO_GATE_RUN_ID: runId,
      SENSE_TRUTH_ONLY: 'g', SENSE_VH_CASES: control.fixture, SENSE_VH_NONCE: nonce };
    delete env.SENSE_VH_CONTROL;
    if (phase === 'mutant') env.SENSE_VH_CONTROL = control.id;
    const result = await new Promise((done) => {
      let output = '', timedOut = false, error = null;
      const child = spawn(process.execPath, [suite], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (data) => { output += data; }); child.stderr.on('data', (data) => { output += data; });
      child.on('error', (e) => { error = String(e); });
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 300_000);
      child.on('close', (exit, signal) => { clearTimeout(timer); writeFileSync(join(dir, 'child.log'), output); done({ exit, signal, timedOut, error }); });
    });
    let receipt = null;
    try { receipt = JSON.parse(readFileSync(join(dir, 'verify-sense-truth.json'), 'utf8')); } catch { /* missing is not-run */ }
    const semantic = (receipt?.rows || []).filter((r) => !r.recorded);
    const reds = semantic.filter((r) => !r.ok);
    const attempts = receipt?.attempts || [];
    const fresh = !result.error && !result.timedOut && !result.signal && receipt?.runId === runId && receipt?.nonce === nonce
      && receipt?.artifactSha256 === identity.artifactSha256 && receipt?.verifierSha256 === digest(readFileSync(suite))
      && exactRoster([engine], receipt?.engines) && !receipt?.error && attempts.length === 1;
    let ok;
    if (phase === 'mutant') {
      const expectedReds = [control.row, ...control.downstream];
      const witness = reds.find((r) => r.id === control.row && r.engine === engine);
      const history = attempts[0]?.history || [];
      const intended = exactRoster(expectedReds, reds.map((r) => r.id)) && semantic.some((r) => r.id === 'g.page-errors' && r.ok)
        && witness && receipt.vhMutations.length > 0 && receipt.vhControl === control.id;
      const completed = control.id === 'discard-completed-red-on-retry'
        ? history.length === 1 && history[0].observations === 1 && history[0].retry === false && history[0].stage === 'navigation'
          && witness.observed?.detail?.lines?.[0] === 'VH wrong sense sentinel'
        : history.length === 1 && history[0].complete === true && receipt.complete === true;
      ok = fresh && result.exit === 1 && intended && completed;
    } else ok = fresh && result.exit === 3 && receipt.selectedPassed === true && receipt.fullAcceptance === false && reds.length === 0;
    phases.push({ phase, dir, ...result, ok: !!ok, fresh, reds: reds.map((r) => ({ id: r.id, observed: r.observed })), attempts });
    if (phase === 'baseline' && !ok) break;
  }
  const restored = digest(readFileSync(join(site, 'corridor.js'))) === sourceDigest;
  const caught = phases.length === 3 && phases.every((p) => p.ok) && restored;
  rows.push({ engine, control: control.id, fixture: control.fixture, status: caught ? 'caught' : 'not-run', restored, phases });
  console.log(`${engine}/${control.id}: ${caught ? 'caught' : 'not-run'}`);
}
const expectedCases = jobs.map(({ engine, control }) => `${engine}/${control.id}`);
const observedCases = rows.map((r) => `${r.engine}/${r.control}`);
const selectedPassed = exactRoster(expectedCases, observedCases) && rows.every((r) => r.status === 'caught');
const fullAcceptance = selectedPassed && selected === null;
writeFileSync(join(out, 'verify-vh-sense-controls.json'), `${JSON.stringify({ schemaVersion: 1, runId, artifactSha256: identity.artifactSha256,
  sourceSha: identity.gitSha, verifierSha256: digest(readFileSync(fileURLToPath(import.meta.url))), sourceDigest, engines, selected, expectedCases, observedCases,
  selectedPassed, fullAcceptance, rows }, null, 2)}\n`);
process.exitCode = !selectedPassed ? 1 : fullAcceptance ? 0 : 3;
