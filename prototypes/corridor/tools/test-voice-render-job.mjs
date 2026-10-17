/** The render job's safety claims, executed. A local pre-spend gate, not a CI gate: it needs
 * ffmpeg, and its pronunciation case needs the local whisper (skipped, and said so, without it).
 * No network, no key, no spend: synthesis is never called except as the --mock tone.
 *
 *   node --test tools/test-voice-render-job.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { admit, ASR_MAX_CER, authorization, owed, placementPath, plan, provenanceOf, readLedger, run, shippedVouchers,
  startAsr } from './render-corpus.mjs';
import { buildManifests } from './build-voice-manifest.mjs';
import { runtimeLock } from './voice-lock.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = runtimeLock();
const scratch = mkdtempSync(join(tmpdir(), 'voice-render-job-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
const narration = JSON.parse(readFileSync(resolve(corridor, 'audio/article-narration.json'), 'utf8')).articles['jawiki:5294446'].clips;
const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const tone = (file, seconds) => ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, '-ac', '1', '-ar', '24000',
  '-c:a', 'aac', '-b:a', '64k', '-f', 'mp4', file]);
const silence = (file, seconds) => ffmpeg(['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(seconds), '-c:a', 'aac',
  '-b:a', '64k', '-f', 'mp4', file]);
const whisper = (() => { try { execFileSync('which', ['whisper'], { stdio: 'ignore' }); return true; } catch { return !!process.env.KAIRO_ASR_PYTHON; } })();
/** A scratch root holding the shipped manifests and the six shipped clips, as a render would see the tree. */
function shippedRoot(name) {
  const root = join(scratch, name);
  mkdirSync(join(root, 'audio'), { recursive: true });
  for (const file of ['audio/article-narration.json', 'audio/manifest.json']) copyFileSync(resolve(corridor, file), join(root, file));
  for (const clip of narration) {
    mkdirSync(dirname(join(root, clip.src)), { recursive: true });
    copyFileSync(resolve(corridor, clip.src), join(root, clip.src));
  }
  return root;
}

test('ADMISSION · silence is refused, and a passing clip was actually measured', async () => {
  const quiet = join(scratch, 'silence.m4a'); silence(quiet, 1.2);
  const refused = await admit(quiet, { role: 'word', spoken: 'でんしゃ' });
  assert.equal(refused.ok, false, 'one second of silence is not a recording');
  assert(refused.fails.some((fail) => /silent/u.test(fail)), JSON.stringify(refused.fails));
  const sound = join(scratch, 'tone.m4a'); tone(sound, 1.0);
  const admitted = await admit(sound, { role: 'word', spoken: 'でんしゃ' });
  assert.equal(admitted.ok, true, JSON.stringify(admitted.fails));
  assert(Number.isFinite(admitted.mean) && Number.isFinite(admitted.peak), 'loudness was read from where ffmpeg writes it');
  const short = await admit(sound, { role: 'narrator', spoken: 'あ'.repeat(60) });
  assert.equal(short.ok, false);
  assert(short.fails.some((fail) => /too short/u.test(fail)), 'a one-second clip is not a twelve-second sentence');
});

test('ADMISSION · the pronunciation gate hears a real clip as its sentence and refuses another sentence',
  { skip: !whisper && 'no local whisper on this machine' }, async () => {
    const asr = startAsr('small');
    try {
      const clip = resolve(corridor, narration[3].src);
      const right = await admit(clip, { role: 'narrator', spoken: narration[3].text }, { asr });
      assert.equal(right.ok, true, JSON.stringify(right));
      assert(right.asr.cer <= ASR_MAX_CER);
      // narration[2] runs the same length, so only the words can tell them apart
      const wrong = await admit(clip, { role: 'narrator', spoken: narration[2].text }, { asr });
      assert.equal(wrong.ok, false, JSON.stringify(wrong));
      assert(wrong.fails.some((fail) => /^asr:/u.test(fail)), JSON.stringify(wrong.fails));
      const quiet = join(scratch, 'silence-6s.m4a'); silence(quiet, 6.4);
      const nothing = await admit(quiet, { role: 'narrator', spoken: narration[3].text }, { asr });
      assert.equal(nothing.ok, false);
    } finally { asr.close(); }
  });

test('SPEND GATE · only the exact line naming this job authorizes it', () => {
  const inbox = join(scratch, 'inbox'); mkdirSync(inbox);
  const job = plan({ corpora: ['words'], limit: 3 });
  writeFileSync(join(inbox, '1.md'), ['Do not render yet.', 'render: yes, after review', '> render', 'render',
    `\`render ${job.digest}\``, `do not render ${job.digest}`].join('\n'));
  assert.equal(authorization(job.digest, inbox).given, false, 'prose, a bare word, a quote, a code span and a negation never authorize');
  writeFileSync(join(inbox, '2.md'), `render ${'0'.repeat(16)}\n`);
  assert.equal(authorization(job.digest, inbox).given, false, 'a go-ahead for another job is not this one');
  writeFileSync(join(inbox, '3.md'), `ok\n\nrender ${job.digest}\n`);
  assert.deepEqual(authorization(job.digest, inbox), { given: true, file: '3.md', line: `render ${job.digest}` });
  assert.notEqual(plan({ corpora: ['words'], limit: 4 }).digest, job.digest, 'a wider job needs its own go-ahead');
});

test('PROVENANCE · a swapped model owes a render, changed bytes lose their voucher, nothing is relabelled', () => {
  const root = shippedRoot('swap');
  const none = join(root, 'no-ledger.json');
  const job = plan({ corpora: ['articles'] });
  const row = job.renders.find((r) => r.paths.includes(narration[0].src));
  assert(row, 'the shipped article is in the plan');
  assert(provenanceOf(root, narration[0].src, row, readLedger(none, job.model), shippedVouchers(root)),
    'a shipped clip is vouched for by its own manifest');
  assert(!owed(job, { root, ledgerFile: none }).renders.some((r) => r.id === row.id), 'so it is not bought twice');
  // the same path, a different model: the old bytes are not this render's
  const swapped = plan({ corpora: ['articles'], lock: { ...LOCK, model: 'another-model' } });
  const swappedRow = swapped.renders.find((r) => r.paths.includes(narration[0].src));
  assert.equal(provenanceOf(root, narration[0].src, swappedRow, readLedger(none, 'another-model'), shippedVouchers(root)), null);
  assert(owed(swapped, { root, ledgerFile: none }).renders.some((r) => r.id === swappedRow.id), 'a swap re-renders');
  // and the manifest builder will not stamp the old bytes with the new model
  const built = buildManifests({ root, lock: { ...LOCK, model: 'another-model' }, ledgerFile: none });
  assert.deepEqual(built.narration.articles, {}, 'no clip is relabelled as the swapped model');
  assert.equal(built.unproven.length, narration.length);
  // bytes changed under a vouched path are no longer vouched
  const tampered = join(root, narration[1].src);
  writeFileSync(tampered, Buffer.concat([readFileSync(tampered), Buffer.from([0])]));
  const row1 = job.renders.find((r) => r.paths.includes(narration[1].src));
  assert.equal(provenanceOf(root, narration[1].src, row1, readLedger(none, job.model), shippedVouchers(root)), null);
});

test('PROVENANCE · a stray file at a word path is reported, never stamped', () => {
  const root = shippedRoot('stray');
  const job = plan({ corpora: ['words'], limit: 1 });
  const stray = join(root, job.placements[0].path);
  mkdirSync(dirname(stray), { recursive: true }); tone(stray, 1.0);
  const built = buildManifests({ root, lock: LOCK, ledgerFile: join(root, 'no-ledger.json') });
  assert.deepEqual(built.words.words, {}, 'a file with no provenance is not an approved clip');
  assert(built.unproven.includes(job.placements[0].path));
  assert.equal(Object.keys(built.narration.articles).length, 1, 'the vouched narration stays');
});

test('MOCK · tones never enter the app tree, resume reuses, and a real run never trusts a mock row', () => {
  const cli = (...args) => spawnSync(process.execPath, ['tools/render-corpus.mjs', ...args], { cwd: corridor, encoding: 'utf8' });
  assert.equal(cli('--render', '--mock', '--corpus', 'words', '--limit', '2').status, 2, 'no --root: refused');
  assert.equal(cli('--render', '--mock', '--root', corridor, '--corpus', 'words', '--limit', '2').status, 2, 'the app tree: refused');
  const root = join(scratch, 'mock'); mkdirSync(root);
  const first = cli('--render', '--mock', '--root', root, '--corpus', 'words', '--limit', '3');
  assert.equal(first.status, 0, first.stderr);
  const one = JSON.parse(first.stdout);
  assert(one.rendered > 0 && one.placed >= one.rendered, first.stdout);
  const second = JSON.parse(cli('--render', '--mock', '--root', root, '--corpus', 'words', '--limit', '3').stdout);
  assert.equal(second.rendered, 0, 'a resumed run buys nothing');
  assert.equal(second.reused, one.rendered + one.reused);
  const ledger = JSON.parse(readFileSync(join(root, '.mock-ledger.json'), 'utf8'));
  const [row] = Object.values(ledger.rows);
  assert.equal(row.mock, true, 'a mock row says so');
  const job = plan({ corpora: ['words'], limit: 3 });
  const planned = job.renders.find((r) => r.id === row.id);
  assert.equal(provenanceOf(root, planned.paths[0], planned, ledger, new Map(), { mock: false }), null,
    'a real run never takes a tone for a recording');
  assert(provenanceOf(root, planned.paths[0], planned, ledger, new Map(), { mock: true }));
  // a clip whose only file is gone has nothing left to vouch for it, so it is bought again
  const word = job.placements.find((p) => p.renderId === row.id);
  assert.equal(placementPath(word, word.voice), word.path);
  rmSync(join(root, word.path));
  const third = JSON.parse(cli('--render', '--mock', '--root', root, '--corpus', 'words', '--limit', '3').stdout);
  assert.equal(third.rendered, 1);
});

test('MOCK · a missing copy is restored from the vouched bytes, never bought twice', async () => {
  const root = join(scratch, 'copies'); mkdirSync(root);
  const ledgerFile = join(root, '.mock-ledger.json');
  const text = narration[3].text;
  const job = { model: LOCK.model, renders: [{ id: 'copy-fixture', voice: LOCK.main, model: LOCK.model, text, kind: 'sentence',
    seconds: text.length * 0.2065, paths: ['audio/narration/kore/copy-000.m4a', 'audio/s/kore/copy-000.m4a'] }] };
  const first = await run({ plan: job, root, ledgerFile, mock: true, pace: 0 });
  assert.deepEqual([first.rendered, first.placed], [1, 2], 'one purchase, two placements');
  rmSync(join(root, 'audio/s/kore/copy-000.m4a'));
  const second = await run({ plan: job, root, ledgerFile, mock: true, pace: 0 });
  assert.deepEqual([second.rendered, second.reused, second.placed], [0, 1, 1], 'the copy is restored, nothing is bought');
  assert.deepEqual(readFileSync(join(root, 'audio/s/kore/copy-000.m4a')), readFileSync(join(root, 'audio/narration/kore/copy-000.m4a')));
});
