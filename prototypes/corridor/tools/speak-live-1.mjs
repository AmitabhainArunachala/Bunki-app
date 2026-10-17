#!/usr/bin/env node
/** 話す · Speak — LIVE-1 (DESIGN §5.5): the first live test, no person, on John's key, under a hard cap.
 *
 * It needs his OK. It refuses to run without SPEAK_LIVE_OK=1 and --cap-usd <dollars> (at most 0.50), and it stops
 * before any request that the running meter (usageMetadata × the published rates, speak-core RATES) could carry past
 * the cap. Expected cost: about $0.15 a run, $0.30 for both voices.
 *
 * Input: the six shipped Kore clips as his speech (their text is known), and ten "learner" takes with planted
 * mistakes, made by the locked TTS from wrong text (が for を; 令和8年 read とし, forced in kana; おばさん for おばあさん;
 * きて for きって; 行きました for 行きます), two of each.
 * It measures: per-leg latency (upload, ears-and-brain, first voice byte, voice done; p50 and p95 over 16 turns × 2
 * runs); transcription fidelity on the known clips (character error rate); forgiveness (which planted mistakes the ears
 * report and which they silently correct); Kore's reading of the trap words (年, 月, 今日, 同年) by a kana round trip
 * through the same ears; the real usageMetadata against §3.4. It renders the same 16 replies in the lock's voice (V's
 * render.model) and in the voice John heard on 09-29 (the lock's approvedReference, shut down 2026-11-17), so the
 * side-by-side for his ear exists before that date as a by-product.
 *
 * The key is GEMINI_API_KEY from the environment, else read from ~/.dharma/agent_keys.env by a parser (the way
 * render-narration-gemini.mjs reads it); it is never printed, logged or written. Output goes outside the repository.
 *
 *   SPEAK_LIVE_OK=1 node prototypes/corridor/tools/speak-live-1.mjs --cap-usd 0.50 --out ~/.dharma/bunki_review/…/LIVE-1
 *   node prototypes/corridor/tools/speak-live-1.mjs --dry-run --out <dir>    (the mock partner: zero spend, plumbing only)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as core from '../speak-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const arg = (flag) => { const at = process.argv.indexOf(flag); return at > 0 ? process.argv[at + 1] : null; };
const DRY = process.argv.includes('--dry-run');
const CAP = Number(arg('--cap-usd'));
const OUT = arg('--out');
// the voice he heard on 09-29, from the lock itself: no model is named here
const COMPARE_VOICE = core.VOICE_LOCK.approvedReference.model;

if (!OUT) { console.error('--out <dir outside the repository> is required'); process.exit(2); }
if (!DRY) {
  if (process.env.SPEAK_LIVE_OK !== '1') { console.error('LIVE-1 spends on John\'s key: it runs only with SPEAK_LIVE_OK=1, after his OK.'); process.exit(2); }
  if (!(CAP > 0 && CAP <= 0.5)) { console.error('--cap-usd is required, more than 0 and at most 0.50.'); process.exit(2); }
}
if (resolve(OUT).startsWith(resolve(CORRIDOR, '../..'))) { console.error('--out must be outside the repository'); process.exit(2); }
mkdirSync(OUT, { recursive: true });

/** The key, handed to fetch and nowhere else. */
function loadKey() {
  if (DRY) return 'dry-run-dummy-key';
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const file = join(homedir(), '.dharma', 'agent_keys.env');
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    let value = match[1];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value) return value;
  }
  throw new Error('GEMINI_API_KEY not found');
}

const ffmpeg = [process.env.FFMPEG, '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', 'ffmpeg'].find((p) => p && (p === 'ffmpeg' || existsSync(p)));
const clipText = JSON.parse(readFileSync(join(CORRIDOR, 'audio/article-narration.json'), 'utf8')).articles['jawiki:5294446'].clips;
/** A shipped clip as a 16 kHz mono WAV, the shape the room sends. */
function clipWav(i) {
  const raw = execFileSync(ffmpeg, ['-v', 'error', '-i', join(CORRIDOR, clipText[i].src), '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], { maxBuffer: 64 * 1024 * 1024 });
  return core.wavFromPcm16Bytes(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength), 16000);
}
/** A PCM answer (24 kHz) resampled to 16 kHz WAV, so a made take is sent exactly as a recorded one. */
function to16k(pcm24) {
  const view = new DataView(pcm24.buffer, pcm24.byteOffset, pcm24.byteLength - (pcm24.byteLength % 2));
  const f = new Float32Array(view.byteLength / 2);
  for (let i = 0; i < f.length; i += 1) f[i] = view.getInt16(i * 2, true) / 0x8000;
  return core.wavFromInt16(core.floatToInt16(core.resample(f, 24000, 16000)), 16000);
}

const PLANTED = [
  { id: 'ga-for-wo', wrong: '毎朝コーヒーが飲みます。', right: '毎朝コーヒーを飲みます。', mistake: 'が for を' },
  { id: 'toshi-for-nen', wrong: 'れいわはちとしに引っ越しました。', right: '令和8年に引っ越しました。', mistake: '年 read とし', kana: true },
  { id: 'obasan', wrong: '昨日、おばさんの家に行きました。', right: '昨日、おばあさんの家に行きました。', mistake: 'おばさん for おばあさん' },
  { id: 'kite', wrong: 'この切手をきてください。', right: 'この切手を切ってください。', mistake: 'きて for きって' },
  { id: 'tense', wrong: '明日、京都に行きました。', right: '明日、京都に行きます。', mistake: '行きました for 行きます' },
];
const TRAPS = [
  { word: '年', line: '令和8年の秋です。', want: 'ねん' },
  { word: '月', line: '9月に始まりました。', want: 'がつ' },
  { word: '今日', line: '今日は晴れています。', want: 'きょう' },
  { word: '同年', line: '同年の秋に完成した。', want: 'どうねん' },
];

let spent = 0;
const ledger = [];
async function main() {
  let mock = null;
  let endpoint = core.VOICE_LOCK.endpoint;
  if (DRY) {
    const { startMockPartner } = await import('./speak-mock-partner.mjs');
    mock = await startMockPartner();
    endpoint = mock.endpoint;
  }
  const key = loadKey();
  const cap = DRY ? Infinity : CAP;
  /** One POST, refused before it is sent if the meter's worst case for it would pass the cap. */
  async function post(model, body, worstUsd) {
    if (spent + worstUsd > cap) throw Object.assign(new Error(`cap: $${spent.toFixed(4)} spent, next request could reach $${(spent + worstUsd).toFixed(4)} of $${cap}`), { cap: true });
    const started = performance.now();
    const res = await fetch(`${endpoint}/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body), redirect: 'error',
    });
    const firstByte = performance.now() - started;
    const json = await res.json();
    const ms = performance.now() - started;
    const usd = core.usageCost(model, json.usageMetadata) ?? 0;
    spent += usd;
    ledger.push({ model, status: res.status, ms: Math.round(ms), firstByteMs: Math.round(firstByte), usage: json.usageMetadata || null, usd });
    if (!res.ok) throw new Error(`${model} ${res.status}: ${JSON.stringify(json.error || {}).slice(0, 200)}`);
    return { json, ms, firstByte };
  }
  const scene = core.SCENE_TEMPLATES.find((s) => s.id === 'free');
  const system = core.buildSystemInstruction({ scene, plants: [], notes: [], avoidOpenings: [] });
  const ears = async (wav, mode = 'talk', target = null) => {
    const started = performance.now();
    const body = core.buildTurnRequest({ system, mode, wavBase64: core.bytesToBase64(wav), target });
    const upload = JSON.stringify(body).length;
    const { json, ms } = await post(core.EARS_MODEL, body, 0.002);
    const text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    return { turn: core.parseTurn(text, { mode }), ms, uploadBytes: upload, totalMs: performance.now() - started };
  };
  const voice = async (model, text, name = core.VOICE_LOCK.mainVoice.prebuilt) => {
    const { json, ms, firstByte } = await post(model, core.buildVoiceRequest(text, name), 0.006);
    const part = (json.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    return { pcm: part ? core.base64ToBytes(part.inlineData.data) : null, ms, firstByte };
  };
  const cer = (a, b) => {
    const x = [...a.replace(/[\s。、「」？！]/gu, '')], y = [...b.replace(/[\s。、「」？！]/gu, '')];
    const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...new Array(y.length).fill(0)]);
    for (let j = 1; j <= y.length; j += 1) d[0][j] = j;
    for (let i = 1; i <= x.length; i += 1) for (let j = 1; j <= y.length; j += 1) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    return x.length ? d[x.length][y.length] / x.length : 0;
  };
  const report = { at: new Date().toISOString(), dryRun: DRY, capUsd: DRY ? null : CAP, lock: core.VOICE_LOCK.model, compareVoice: COMPARE_VOICE, ears: core.EARS_MODEL, runs: [] };
  try {
    // the planted takes, made once by the locked voice from wrong text (two of each), resampled to the room's 16 kHz
    const takes = [];
    for (const p of PLANTED) {
      const said = p.kana ? core.kana(p.wrong) : p.wrong;
      for (let n = 0; n < 2; n += 1) {
        const made = await voice(core.VOICE_LOCK.model, said);
        if (made.pcm) takes.push({ ...p, n, wav: to16k(made.pcm) });
      }
    }
    for (const run of [1, 2]) {
      const turns = [];
      for (let i = 0; i < clipText.length; i += 1) {
        const result = await ears(clipWav(i));
        turns.push({ kind: 'clip', id: i, heard: result.turn?.heard || null, cer: result.turn ? cer(result.turn.heard, clipText[i].text) : null, brainMs: Math.round(result.ms), reply: result.turn?.reply?.text || null });
      }
      for (const take of takes) {
        const result = await ears(take.wav);
        const heard = result.turn?.heard || '';
        turns.push({ kind: 'planted', id: `${take.id}-${take.n}`, mistake: take.mistake, heard, reported: heard.includes(take.wrong.replace(/[。]/gu, '').slice(0, 6)) || (result.turn?.corrections || []).length > 0,
          corrections: result.turn?.corrections || [], brainMs: Math.round(result.ms), reply: result.turn?.reply?.text || null });
      }
      // her replies, in the locked voice and in 3.8 Flash TTS: latency to the first byte and to the end, and the files
      for (const [t, turn] of turns.entries()) {
        if (!turn.reply) continue;
        for (const model of [core.VOICE_LOCK.model, COMPARE_VOICE]) {
          const said = await voice(model, core.splitSentences(turn.reply)[0] || turn.reply);
          turn[model] = { firstByteMs: Math.round(said.firstByte), doneMs: Math.round(said.ms) };
          if (said.pcm && run === 1) writeFileSync(join(OUT, `reply-${String(t).padStart(2, '0')}-${model}.wav`), core.wavFromPcm16Bytes(said.pcm, 24000));
        }
      }
      report.runs.push({ run, turns });
    }
    // Kore's reading of the trap words: her line, heard back by the same ears, compared in kana
    report.traps = [];
    for (const trap of TRAPS) {
      const said = await voice(core.VOICE_LOCK.model, trap.line);
      if (!said.pcm) continue;
      const back = await ears(to16k(said.pcm), 'shadow', trap.line);
      report.traps.push({ ...trap, heardKana: back.turn?.heardKana || '', read: (back.turn?.heardKana || '').includes(trap.want) });
    }
  } catch (error) {
    report.stopped = String(error.message);
  } finally {
    const pct = (list, p) => { const s = [...list].sort((a, b) => a - b); return s.length ? s[Math.floor(p * (s.length - 1))] : null; };
    const brain = ledger.filter((r) => r.model === core.EARS_MODEL).map((r) => r.ms);
    const lockVoice = ledger.filter((r) => r.model === core.VOICE_LOCK.model).map((r) => r.firstByteMs);
    report.latency = { brainP50: pct(brain, 0.5), brainP95: pct(brain, 0.95), voiceFirstByteP50: pct(lockVoice, 0.5), voiceFirstByteP95: pct(lockVoice, 0.95) };
    report.spentUsd = Math.round(spent * 1e6) / 1e6;
    report.requests = ledger.length;
    report.hourEstimate = core.hourEstimate();
    writeFileSync(join(OUT, 'live-1.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ dryRun: DRY, requests: ledger.length, spentUsd: report.spentUsd, stopped: report.stopped || null, out: join(OUT, 'live-1.json') }));
    await mock?.close();
  }
}
await main();
