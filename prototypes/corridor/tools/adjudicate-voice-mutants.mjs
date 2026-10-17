#!/usr/bin/env node
/** Prove the voice suites DISCRIMINATE. A green test proves nothing until you have watched it
 * go red for the right reason: seventeen days of silence were green every single day.
 *
 * For each law below, one line of corridor.js is mutated to remove exactly that law, and both
 * voice suites are run against the mutant. A mutant that still passes is reported as an
 * undetected mutation and the adjudication fails.
 *
 *   node tools/adjudicate-voice-mutants.mjs            # table + exit 0/1
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(corridor, 'corridor.js');
const SUITES = ['tools/test-approved-voice.mjs', 'tools/test-excerpt-narration.mjs'];

/** name → [the law, as it stands] → [the law removed]. One line each, nothing else touched. */
export const MUTATIONS = [
  ['charon-as-a-fallback',
    '  if (entry.voice !== wanted) return null;',
    '  if (false) return null;',
    'the second voice may stand in for a missing main-voice word clip'],
  ['device-speech',
    "    const voice = NARRATION_VOICES[voiceForRole('word')];\n    if (!m || m.legacy)",
    "    const voice = NARRATION_VOICES[voiceForRole('word')];\n"
      + "    if (typeof speechSynthesis !== 'undefined') speechSynthesis.speak(new SpeechSynthesisUtterance(text));\n"
      + '    if (!m || m.legacy)',
    'the device voice reads the card when no clip exists'],
  ['spelling-only-key',
    '  const entry = m.words?.[key];',
    '  const entry = m.words?.[key] || m.words?.[surface];',
    'a spelling with no reading resolves to a clip'],
  ['foreign-model',
    '  if (value.v !== 2 || value.lock?.model !== VOICE_LOCK.model) return null;',
    '  if (value.v !== 2) return null;',
    'a manifest from an unauditioned model is admitted'],
  ['excerpt-locality',
    '      if (clips) { ambiguous = true; break; }',
    '      if (clips) { break; }',
    'an ambiguous quote plays the first article that matches'],
];

function run(sourceFile) {
  const failures = [];
  for (const suite of SUITES) {
    try {
      execFileSync(process.execPath, ['--test', suite],
        { cwd: corridor, encoding: 'utf8', env: { ...process.env, KAIRO_CORRIDOR_SOURCE: sourceFile }, stdio: 'pipe' });
    } catch (error) { failures.push(`${suite} (exit ${error.status})`); }
  }
  return failures;
}

const base = readFileSync(SOURCE, 'utf8');
const dir = mkdtempSync(join(tmpdir(), 'voice-mutants-'));
const rows = [];

// the baseline must be green, or a red mutant proves nothing
const baseline = run(SOURCE);
rows.push({ mutant: '(none) baseline', detectedBy: baseline, verdict: baseline.length ? 'BASELINE RED' : 'green' });

for (const [name, from, to, meaning] of MUTATIONS) {
  if (!base.includes(from)) { rows.push({ mutant: name, verdict: 'NOT APPLICABLE — the line moved', meaning }); continue; }
  if (base.split(from).length - 1 !== 1) { rows.push({ mutant: name, verdict: 'AMBIGUOUS — the line is not unique', meaning }); continue; }
  const file = join(dir, `${name}.js`);
  writeFileSync(file, base.replace(from, to));
  const detected = run(file);
  rows.push({ mutant: name, meaning, detectedBy: detected, verdict: detected.length ? 'red (detected)' : 'SURVIVED' });
}

const bad = rows.filter((row) => row.verdict !== 'red (detected)' && row.verdict !== 'green');
console.log(JSON.stringify({ verdict: bad.length ? 'red' : 'green', mutants: rows.length - 1, rows }, null, 2));
process.exit(bad.length ? 1 : 0);
