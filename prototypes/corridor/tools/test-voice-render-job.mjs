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
// KAIRO_RENDER_CORPUS points this suite at a one-law mutant of the job (tools/adjudicate-render-job-mutants.mjs);
// unset, which is every real run, it is the shipped file
const JOB = process.env.KAIRO_RENDER_CORPUS || './render-corpus.mjs';
const { admit, ASR_MAX_CER, authorization, dialoguePieces, fileKey, owed, placementPath, plan, provenanceOf, readLedger,
  run, sentenceUnits, shippedVouchers, startAsr } = await import(JOB);
import { buildManifests } from './build-voice-manifest.mjs';
import { runtimeLock } from './voice-lock.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = runtimeLock();
const scratch = mkdtempSync(join(tmpdir(), 'voice-render-job-'));
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }));
const narration = JSON.parse(readFileSync(resolve(corridor, 'audio/article-narration.json'), 'utf8')).articles['jawiki:5294446'].clips;
const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const tone = (file, seconds, volume = 1) => ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=330:duration=${seconds}`, '-af', `volume=${volume}`,
  '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '64k', '-f', 'mp4', file]);
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
const shippedPlacement = (job, index = 0) => job.placements.find((p) => p.path === narration[index].src);

test('ADMISSION · silence, near-silence, clipping and a wrong length are refused; a pass was measured', async () => {
  const quiet = join(scratch, 'silence.m4a'); silence(quiet, 1.2);
  const refused = await admit(quiet, { role: 'word', spoken: 'でんしゃ' });
  assert.equal(refused.ok, false, 'one second of silence is not a recording');
  assert(refused.fails.some((fail) => /silent/u.test(fail)), JSON.stringify(refused.fails));
  const faint = join(scratch, 'faint.m4a'); tone(faint, 1.0, 0.04);   // about -40 dB peak, -43 dB mean
  const nearSilent = await admit(faint, { role: 'word', spoken: 'でんしゃ' });
  assert.equal(nearSilent.ok, false, JSON.stringify(nearSilent));
  assert(nearSilent.fails.some((fail) => /near-silent|silent/u.test(fail)), JSON.stringify(nearSilent.fails));
  const loud = join(scratch, 'clipped.m4a'); tone(loud, 1.0, 16);     // driven past full scale
  const clipped = await admit(loud, { role: 'word', spoken: 'でんしゃ' });
  assert.equal(clipped.ok, false, JSON.stringify(clipped));
  assert(clipped.fails.some((fail) => /clipping/u.test(fail)), JSON.stringify(clipped.fails));
  const sound = join(scratch, 'tone.m4a'); tone(sound, 1.0);
  const admitted = await admit(sound, { role: 'word', spoken: 'でんしゃ' });
  assert.equal(admitted.ok, true, JSON.stringify(admitted.fails));
  assert(Number.isFinite(admitted.mean) && Number.isFinite(admitted.peak), 'loudness was read from where ffmpeg writes it');
  const short = await admit(sound, { role: 'narrator', spoken: 'あ'.repeat(60) });
  assert.equal(short.ok, false);
  assert(short.fails.some((fail) => /too short/u.test(fail)), 'a one-second clip is not a twelve-second sentence');
  const long = join(scratch, 'long.m4a'); tone(long, 9.0);
  const tooLong = await admit(long, { role: 'word', spoken: 'でんしゃ' });
  assert(tooLong.fails.some((fail) => /too long/u.test(fail)), 'nine seconds is not one word');
  const empty = join(scratch, 'empty.m4a'); writeFileSync(empty, '');
  assert.equal((await admit(empty, { role: 'word', spoken: 'でんしゃ' })).ok, false, 'an unreadable file fails closed');
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

test('SPEND GATE · only the lead’s structured authorization, for this HEAD and within its cap, releases a render', () => {
  const dir = join(scratch, 'authorizations'); mkdirSync(dir);
  const file = join(dir, 'V-render.json');
  const head = 'a'.repeat(40), digest = 'b'.repeat(16);
  const good = { authorized: true, by: 'lead', head_sha: head, max_usd: 12, john_words: 'for now just anything decent', time: '2026-10-17T13:00:00+09:00' };
  const check = (doc, over = {}) => { if (doc === null) rmSync(file, { force: true }); else writeFileSync(file, JSON.stringify(doc));
    return authorization({ file, head, dirty: false, estimateUsd: 7.6, digest, ...over }); };
  assert.equal(check(null).given, false, 'no file, no spend: inbox prose is never read');
  writeFileSync(file, 'render\n'); assert.equal(authorization({ file, head, dirty: false, estimateUsd: 7.6, digest }).given, false, 'prose is not a record');
  for (const [why, doc] of [
    ['not authorized', { ...good, authorized: 'yes' }],
    ['not the lead', { ...good, by: 'codex' }],
    ['another HEAD', { ...good, head_sha: 'c'.repeat(40) }],
    ['no cap', { ...good, max_usd: undefined }],
    ['a cap below the estimate', { ...good, max_usd: 5 }],
    ['no words from John', { ...good, john_words: ' ' }],
    ['no time', { ...good, time: 'tonight' }],
    ['another job', { ...good, job_digest: 'd'.repeat(16) }],
  ]) assert.equal(check(doc).given, false, why);
  assert.equal(check(good, { dirty: true }).given, false, 'a checkout changed outside audio/ is not the HEAD it names');
  const given = check(good);
  assert.equal(given.given, true, JSON.stringify(given.problems));
  assert.equal(given.maxUsd, 12, 'the cap rides into the run');
  assert.equal(check({ ...good, head_sha: head.slice(0, 8), job_digest: digest }).given, true, 'a short sha and a matching job digest');
});

test('PROVENANCE · a file is reused only under its own key: model, voice, role, text and reading each count', () => {
  const root = shippedRoot('keys');
  const none = join(root, 'no-ledger.json');
  const job = plan({ corpora: ['articles'] });
  const placement = shippedPlacement(job);
  assert(placement, 'the shipped article is in the plan');
  const vouchers = shippedVouchers(root), ledger = readLedger(none, job.model);
  assert(provenanceOf(root, placement, ledger, vouchers), 'a shipped clip is vouched for by its own manifest');
  assert(!owed(job, { root, ledgerFile: none }).renders.some((r) => r.id === placement.renderId), 'so it is not bought twice');
  const rekey = (change) => { const p = { ...placement, ...change }; p.fileKey = fileKey(p); return p; };
  for (const [why, change] of [['another model', { model: 'another-model' }], ['another voice', { voice: LOCK.second }],
    ['another role', { role: 'example' }], ['another text', { spoken: `${placement.spoken}。` }], ['a reading', { reading: 'よみ' }]])
    assert.equal(provenanceOf(root, rekey(change), ledger, vouchers), null, `${why}: not this file, so not done`);
  // a swapped model owes the render, and the manifest builder will not relabel the old bytes
  const swapped = plan({ corpora: ['articles'], lock: { ...LOCK, model: 'another-model' } });
  assert(owed(swapped, { root, ledgerFile: none }).renders.some((r) => r.id === shippedPlacement(swapped).renderId), 'a swap re-renders');
  const built = buildManifests({ root, lock: { ...LOCK, model: 'another-model' }, ledgerFile: none });
  assert.deepEqual(built.narration.articles, {}, 'no clip is relabelled as the swapped model');
  assert.equal(built.unproven.length, narration.length);
  // bytes changed under a vouched path are no longer vouched
  const tampered = join(root, narration[1].src);
  writeFileSync(tampered, Buffer.concat([readFileSync(tampered), Buffer.from([0])]));
  assert.equal(provenanceOf(root, shippedPlacement(job, 1), ledger, vouchers), null);
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

test('UNITS · a closing bracket or divider is never a clip of its own', () => {
  // a bare piece joins the sentence before it on its line, and a divider alone is not spoken; a
  // closer that opens a speakable piece stays where the cue builder also cuts, so clip i and cue i
  // still name one sentence in the listening lane
  assert.deepEqual(sentenceUnits('ユキ「見てください。余らなくて。」\n\n＊\n\n森「そう？」いいね。\n先生「はい。」'),
    ['ユキ「見てください。', '余らなくて。」', '森「そう？', '」いいね。', '先生「はい。」']);
  const job = plan({ corpora: ['articles', 'examples'] });
  const bare = job.placements.filter((p) => !/[\p{L}\p{N}]/u.test(p.spoken));
  assert.deepEqual(bare.map((p) => p.spoken), [], 'nothing unspeakable is bought');
});

test('DIALOGUE · the shelf’s scripts render single-voice until John casts them', () => {
  const pieces = dialoguePieces();
  const ids = pieces.map((piece) => piece.id);
  for (const id of ['bunki-read-n3-honda-quarter', 'bunki-read-n3-transistor-class']) assert(ids.includes(id), `${id} is found as a script`);
  const job = plan();
  const second = job.placements.filter((p) => p.voice === LOCK.second || p.role === 'speaker-b');
  assert.deepEqual(second.map((p) => p.path), [], 'no clip in the second voice is ever placed');
  for (const p of job.placements.filter((p) => ids.includes(p.articleId)))
    assert.deepEqual([p.role, p.voice], [p.role === 'example' ? 'example' : 'narrator', LOCK.main]);
});

test('MOCK · tones never enter the app tree, resume reuses, and a real run never trusts a mock row', () => {
  const cli = (...args) => spawnSync(process.execPath, [join('tools', JOB), ...args], { cwd: corridor, encoding: 'utf8' });
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
  const job = plan({ corpora: ['words'], limit: 3 });
  const placement = job.placements[0];
  assert.equal(ledger.files[placement.path].mock, true, 'a mock row says so');
  assert.equal(provenanceOf(root, placement, ledger, new Map(), { mock: false }), null, 'a real run never takes a tone for a recording');
  assert(provenanceOf(root, placement, ledger, new Map(), { mock: true }));
  // a clip whose only file is gone has nothing left to prove it, so it is bought again
  assert.equal(placementPath(placement, placement.voice), placement.path);
  rmSync(join(root, placement.path));
  assert.equal(JSON.parse(cli('--render', '--mock', '--root', root, '--corpus', 'words', '--limit', '3').stdout).rendered, 1);
  // and a real render refuses without the lead's file, before any network
  const real = cli('--render', '--confirm', '--corpus', 'words', '--limit', '1', '--authorization', join(root, 'absent.json'));
  assert.equal(real.status, 3, real.stderr);
  assert.match(real.stderr, /REFUSING TO SPEND/u);
});

test('MOCK · a missing copy is restored from the proven bytes, never bought twice', async () => {
  const root = join(scratch, 'copies'); mkdirSync(root);
  const ledgerFile = join(root, '.mock-ledger.json');
  const text = narration[3].text;
  const base = { voice: LOCK.main, model: LOCK.model, spoken: text, reading: '', renderId: 'copy-fixture' };
  const placements = [{ ...base, role: 'narrator', path: 'audio/narration/kore/copy-000.m4a' },
    { ...base, role: 'example', path: 'audio/s/kore/copy-000.m4a' }].map((p) => ({ ...p, fileKey: fileKey(p) }));
  const job = { model: LOCK.model, placements, renders: [{ id: 'copy-fixture', voice: LOCK.main, model: LOCK.model, text, kind: 'sentence',
    seconds: text.length * 0.2065, paths: placements.map((p) => p.path) }] };
  const first = await run({ plan: job, root, ledgerFile, mock: true, pace: 0 });
  assert.deepEqual([first.rendered, first.placed], [1, 2], 'one purchase, two placements, each keyed by its own role');
  rmSync(join(root, 'audio/s/kore/copy-000.m4a'));
  const second = await run({ plan: job, root, ledgerFile, mock: true, pace: 0 });
  assert.deepEqual([second.rendered, second.reused, second.placed], [0, 1, 1], 'the copy is restored, nothing is bought');
  assert.deepEqual(readFileSync(join(root, 'audio/s/kore/copy-000.m4a')), readFileSync(join(root, 'audio/narration/kore/copy-000.m4a')));
  const ledger = JSON.parse(readFileSync(ledgerFile, 'utf8'));
  assert.deepEqual(Object.values(ledger.files).map((row) => row.role).sort(), ['example', 'narrator']);
});

test('SPEND CAP · max_usd stops a run before the purchase that would pass it', async () => {
  const root = join(scratch, 'cap'); mkdirSync(root);
  const job = plan({ corpora: ['articles'], limit: 4 });
  const result = await run({ plan: job, root, ledgerFile: join(root, '.mock-ledger.json'), mock: false, pace: 0, maxUsd: 0.000001,
    // never reached: the cap refuses the first purchase before any synthesis
    asr: null });
  assert.equal(result.rendered, 0);
  assert.equal(result.stopped?.reason, 'max_usd');
});
