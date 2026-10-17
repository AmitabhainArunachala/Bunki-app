#!/usr/bin/env node
/** Prove the render job's tests DISCRIMINATE (V, 2026-10-17). For each law below, one line of
 * render-corpus.mjs is changed to remove exactly that law, written beside the original as a
 * mutant, and test-voice-render-job runs against it; a mutant that still passes fails the
 * adjudication. The mutant file is always deleted. Mock isolation is not mutated here: with its
 * guard removed, the suite's own refusal case would write tones into the app tree.
 *
 *   node tools/adjudicate-render-job-mutants.mjs            # table + exit 0/1
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(corridor, 'tools/render-corpus.mjs');
const MUTANT = join(corridor, 'tools/.render-corpus.mutant.mjs');

export const MUTATIONS = [
  ['admission-reads-stdout', "  const log = `${measured.stderr || ''}${measured.stdout || ''}`;", "  const log = `${measured.stdout || ''}`;",
    'loudness read where ffmpeg does not write it: silence passes'],
  ['asr-ignored', '    if (cer !== null && !(cer <= ASR_MAX_CER)) fails.push', '    if (false) fails.push',
    'a clip of the wrong sentence is admitted'],
  ['key-ignores-role', "export const fileKey = (p) => textDigest(JSON.stringify([p.model, p.voice, p.role, textDigest(p.spoken), p.reading || '']));",
    "export const fileKey = (p) => textDigest(JSON.stringify([p.model, p.voice, textDigest(p.spoken), p.reading || '']));",
    'a file is reused under another role'],
  ['key-ignores-reading', "export const fileKey = (p) => textDigest(JSON.stringify([p.model, p.voice, p.role, textDigest(p.spoken), p.reading || '']));",
    'export const fileKey = (p) => textDigest(JSON.stringify([p.model, p.voice, p.role, textDigest(p.spoken)]));',
    'a file is reused under another reading'],
  ['existence-trusted', '  if (!existsSync(file)) return null;', '  if (!existsSync(file)) return null; return { by: "existence", model: placement.model };',
    'any file at the path counts as done: a swap relabels old audio'],
  ['gate-ignores-head', '  else if (!head?.startsWith(doc.head_sha)) problems.push', '  else if (false) problems.push',
    'an authorization for another HEAD releases this one'],
  ['gate-ignores-cap', '  else if (estimateUsd !== null && estimateUsd > doc.max_usd)', '  else if (false)',
    'a job larger than the lead’s cap is released'],
  ['run-ignores-cap', "        if (maxUsd !== null && out.spentEstimateUsd + cost > maxUsd) {", '        if (false) {',
    'a run spends past max_usd'],
  ['bare-units-kept', '    else if (units.length) units[units.length - 1] += piece;', '    else units.push(piece);',
    'a lone 」 is bought as a clip'],
  ['dialogue-cast', "      out.push({ key: `${row.id}#${i}`, articleId: row.id, index: i, role: 'narrator', spoken: text, surface: text }));",
    "      out.push({ key: `${row.id}#${i}`, articleId: row.id, index: i, role: /^森「/u.test(text) ? 'speaker-b' : 'narrator', spoken: text, surface: text }));",
    'a dialogue is cast into the second voice by this tool'],
];

function suiteFails(module) {
  try {
    execFileSync(process.execPath, ['--test', 'tools/test-voice-render-job.mjs'],
      { cwd: corridor, encoding: 'utf8', stdio: 'pipe', env: { ...process.env, KAIRO_RENDER_CORPUS: module } });
    return false;
  } catch { return true; }
}

const base = readFileSync(SOURCE, 'utf8');
const rows = [{ mutant: '(none) baseline', verdict: suiteFails('./render-corpus.mjs') ? 'BASELINE RED' : 'green' }];
try {
  for (const [name, from, to, meaning] of MUTATIONS) {
    if (base.split(from).length - 1 !== 1) { rows.push({ mutant: name, meaning, verdict: 'NOT APPLICABLE — the line moved or repeats' }); continue; }
    writeFileSync(MUTANT, base.replace(from, to));
    rows.push({ mutant: name, meaning, verdict: suiteFails('./.render-corpus.mutant.mjs') ? 'red (detected)' : 'SURVIVED' });
  }
} finally { rmSync(MUTANT, { force: true }); }
const bad = rows.filter((row) => row.verdict !== 'red (detected)' && row.verdict !== 'green');
console.log(JSON.stringify({ verdict: bad.length ? 'red' : 'green', mutants: rows.length - 1, rows }, null, 2));
process.exitCode = bad.length ? 1 : 0;
