/** COPY-VOICE sensitivity: local VM fixtures only; never Audio/network/browser/provider calls. */
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveCorridorEvidence } from '../../../scripts/resolve-corridor-site.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../corridor.js');
const source = readFileSync(sourcePath, 'utf8');
const digest = (s) => createHash('sha256').update(s).digest('hex');
const runId = process.env.KAIRO_GATE_RUN_ID || randomUUID();
const out = resolveCorridorEvidence();
assert(!process.env.KAIRO_CORRIDOR_SOURCE, 'voice mutation parent must start with the real source');
const copy = 'VH COPY-VOICE · unavailable copy and title follow manifest admission in both languages';
const retry = 'MECHANICS · retrying an available clip clears the old error; a new failure stays visible';
const controls = [
  { id: 'no-manifest-copy-empty', test: copy, witness: 'unavailable visible copy: null/en',
    from: "say(tx('この版には収録音声がありません', 'This build has no recorded voices'), 'no-recordings');", to: "say('', 'no-recordings');" },
  { id: 'missing-word-copy-loses-locked-voice', test: copy, witness: 'unavailable visible copy: empty-v2/en',
    from: '`No ${voice} recording yet — on its way`', to: '`No recording yet — on its way`' },
  { id: 'card-unavailable-title-omitted', test: copy, witness: 'unavailable title: null/en',
    from: '    btn.title = reason;', to: '    void reason;' },
  { id: 'card-retry-retains-error-title', test: retry, witness: 'retry title clears the old failure',
    from: "        btn.title = '';\n        delete btn.dataset.voiceUnavailable;", to: '        delete btn.dataset.voiceUnavailable;' },
  { id: 'card-subsequent-error-title-stale', test: retry, witness: 'subsequent failure updates its title',
    from: '    btn.title = reason;', to: "    if (btn.title !== 'stale failure sentinel') btn.title = reason;" },
  { id: 'pending-quote-creates-listen-control', test: 'VH COPY-VOICE · absent narration adds no dead excerpt Listen control', witness: 'pending quote must not create a Listen control',
    from: "for (const quote of articleNarration ? root.querySelectorAll('blockquote.sentence-original') : [])", to: "for (const quote of root.querySelectorAll('blockquote.sentence-original'))" },
];
const rows = [];
for (const control of controls) {
  const dir = join(out, runId, control.id); mkdirSync(dir, { recursive: true });
  assert.equal(source.split(control.from).length, 2, `${control.id}: exact unique source anchor`);
  const mutant = source.replace(control.from, control.to);
  assert.notEqual(digest(mutant), digest(source));
  const phases = [];
  for (const phase of ['baseline', 'mutant', 'restore']) {
    const nonce = randomUUID(), input = join(dir, `${phase}-${nonce}.js`);
    writeFileSync(input, phase === 'mutant' ? mutant : source);
    const pattern = `^${control.test.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
    const child = spawnSync(process.execPath, ['--test', '--test-reporter=tap', `--test-name-pattern=${pattern}`, join(here, 'test-approved-voice.mjs')], {
      env: { ...process.env, KAIRO_CORRIDOR_SOURCE: input }, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    });
    const output = `${child.stdout || ''}${child.stderr || ''}`;
    const tap = join(dir, `${phase}-${nonce}.tap`);
    writeFileSync(tap, output);
    const tests = [...output.matchAll(/^(not ok|ok) \d+ - (.+)$/gmu)].filter((m) => !m[2].includes('# SKIP'));
    const completed = !child.error && !child.signal && tests.length === 1 && tests[0][2] === control.test
      && /# tests 1\n/u.test(output) && /# cancelled 0\n/u.test(output) && /# skipped 0\n/u.test(output);
    const intended = output.includes(control.witness) && /name: 'AssertionError'/u.test(output);
    const ok = completed && (phase === 'mutant' ? child.status === 1 && tests[0][1] === 'not ok' && intended : child.status === 0 && tests[0][1] === 'ok');
    phases.push({ phase, nonce, input, tap, tapSha256: digest(output), digest: digest(readFileSync(input)), exit: child.status, signal: child.signal, error: child.error?.message || null, completed, intended, ok });
  }
  const restored = digest(readFileSync(sourcePath)) === digest(source) && phases[0].digest === phases[2].digest;
  const status = restored && phases.every((p) => p.ok) ? 'caught' : 'not-run';
  rows.push({ control: control.id, sourceAnchor: control.from, matches: 1, sourceSha256: digest(source), mutationSha256: digest(mutant), witness: control.witness, phases, restored, status });
  console.log(`${control.id}: ${status}`);
}
const fullAcceptance = rows.length === controls.length && rows.every((row) => row.status === 'caught');
writeFileSync(join(out, 'verify-vh-voice-controls.json'), `${JSON.stringify({ schemaVersion: 1, runId,
  sourceSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: here, encoding: 'utf8' }).trim(), sourceSha256: digest(source), verifierSha256: digest(readFileSync(fileURLToPath(import.meta.url))),
  scope: 'mechanics-only; no shipped media availability or voice-quality claim', expectedCases: controls.map((c) => c.id), observedCases: rows.map((r) => r.control),
  selectedPassed: fullAcceptance, fullAcceptance, rows }, null, 2)}\n`);
process.exitCode = fullAcceptance ? 0 : 1;
