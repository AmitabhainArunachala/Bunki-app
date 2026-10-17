#!/usr/bin/env node
/** Render the whole spoken corpus to the lock, by role. Dry-run is the DEFAULT and is free.
 *
 * Corpora, each keyed the way the runtime resolves it:
 *   words     — one clip per (surface, reading) pair actually met in the shelf, spoken from the
 *               reading's kana so the contextual reading is forced (年 ねん ≠ 年 とし)
 *   articles  — one clip per sentence unit, the shelf's own units
 *   examples  — one clip per bundled listening cue
 *
 * Spend gate: `--render` refuses unless the lead has written the word "render" into a file under
 * MISSION/inbox/. John's authority for roughly $20 is his 10-17 10:50 message; the lead releases
 * it after Codex's critique. A dry run never touches the network.
 *
 * Resumable and idempotent: every clip is content-addressed by (role, voice, model, text); a clip
 * already on disk with a matching ledger row is kept, never bought twice. Rate-limited by --pace.
 *
 *   node tools/render-corpus.mjs --dry-run [--corpus words|articles|examples|all] [--limit N]
 *   node tools/render-corpus.mjs --render  --corpus words --limit 500      (needs the go-ahead)
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVoiceLock, runtimeLock } from './voice-lock.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LOCK = runtimeLock();
const VOICE_NAMES = LOCK.voices;              // id → the provider's prebuilt name, from the lock
const ENDPOINT = readVoiceLock().endpoint;    // the provider, from the lock; no literal here
const INBOX = resolve(homedir(), '.dharma/bunki_review/2026-10-15/juncture/one-hand/MISSION/inbox');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);

/* ---------------------------------------------------------------- the published rate
 * ai.google.dev/gemini-api/docs/pricing, "Gemini 3.8 Flash TTS", Standard tier, read 2026-10-17.
 * Audio tokens are 25 per second of audio (stated on the same page). The per-character constants
 * are MEASURED from the six real Kore clips in ~/.dharma/bunki_voice/kore-probe-20261015. */
const RATE = { inPerM: 0.50, outPerM: 9.00, note: 'Standard, through 2026-12-31; $1.00/$18.00 after' };
const BATCH = { inPerM: 0.25, outPerM: 4.50 };
const TOKENS_PER_SECOND = 25;
const SECONDS_PER_CHAR = 0.2065;   // sentence-shaped text
const INPUT_TOK_PER_CHAR = 0.7283;
const WORD_CLIP_SECONDS = 0.98;    // a word clip is ~1 s whatever its length (40-clip sample)

const price = (chars, seconds, rate = RATE) =>
  (chars * INPUT_TOK_PER_CHAR) / 1e6 * rate.inPerM + (seconds * TOKENS_PER_SECOND) / 1e6 * rate.outPerM;

/* ---------------------------------------------------------------- the corpora */
const json = (p) => JSON.parse(readFileSync(resolve(corridor, p), 'utf8'));
const sentenceUnits = (text) => String(text || '').split(/\n+/u)
  .flatMap((p) => p.match(/[^。！？]+[。！？]?/gu) || []).map((s) => s.trim()).filter(Boolean);

/** Words: every (surface, reading) pair the learner can actually meet, ranked by how many
 * articles carry it, so a partial render covers the most reading first. */
export function wordCorpus() {
  const articles = json('data/articles/index.json').articles;
  const known = json('data/share_alike/words.json').words;
  const seen = new Map();
  for (const row of articles) {
    const a = json(`data/articles/${row.file}`);
    for (const t of a.tokens || []) {
      const surface = t.s, reading = t.r || t.reading;
      if (!surface || !reading || !known[surface]) continue;
      const key = `${surface}|${reading}`;
      const hit = seen.get(key) || { key, surface, reading, tokens: 0, docs: new Set() };
      hit.tokens += 1; hit.docs.add(row.id); seen.set(key, hit);
    }
  }
  return [...seen.values()]
    .map((w) => ({ ...w, docs: w.docs.size, role: 'word', spoken: w.reading }))
    .sort((a, b) => b.docs - a.docs || b.tokens - a.tokens || a.key.localeCompare(b.key));
}

/** Articles: the shelf's own sentence units — ALL of them. The plan is the complete desired
 * state of the shelf, not the outstanding work; what already exists is skipped once, at the
 * point of purchase (`alreadyDone`), so the manifest builder can still see the clips we own. */
export function articleCorpus() {
  const out = [];
  for (const row of json('data/articles/index.json').articles) {
    sentenceUnits(json(`data/articles/${row.file}`).text).forEach((text, i) =>
      out.push({ key: `${row.id}#${i}`, articleId: row.id, index: i, role: 'narrator', spoken: text, surface: text }));
  }
  return out;
}

/** Examples: the bundled listening cues, which are the shelf sentences the learner practises. */
export function exampleCorpus() {
  const index = json('data/articles/index.json').articles;
  const man = (() => { try { return json('audio/manifest.json'); } catch { return {}; } })();
  const wanted = new Set(Object.keys(man.sentences || {}));
  const out = [];
  for (const row of index) {
    if (!wanted.has(row.id)) continue;
    const a = json(`data/articles/${row.file}`);
    sentenceUnits(a.text).forEach((text, i) =>
      out.push({ key: `${row.id}#${i}`, articleId: row.id, index: i, role: 'example', spoken: text, surface: text }));
  }
  return out;
}

const CORPORA = { words: wordCorpus, articles: articleCorpus, examples: exampleCorpus };

/** Seconds a clip will run: a word is ~1 s flat; sentence-shaped text scales with its length. */
const secondsFor = (item) => item.role === 'word' ? WORD_CLIP_SECONDS : item.spoken.length * SECONDS_PER_CHAR;

export function estimate(items) {
  const chars = items.reduce((n, i) => n + i.spoken.length, 0);
  const seconds = items.reduce((n, i) => n + secondsFor(i), 0);
  return { clips: items.length, chars, seconds, standard: price(chars, seconds), batch: price(chars, seconds, BATCH) };
}

/* ---------------------------------------------------------------- the admission gate
 * A clip enters the manifest only if it passes every check. A failure is logged and the clip is
 * left out — a wrong or empty recording must never become an approved asset. */
export function admit(file, item) {
  const fails = [];
  let probe;
  try {
    probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-show_entries', 'stream=codec_name,channels,sample_rate', '-of', 'json', file], { encoding: 'utf8' }));
  } catch (error) { return { ok: false, fails: [`unreadable: ${error.message.slice(0, 80)}`] }; }
  const seconds = Number(probe.format?.duration || 0);
  const want = secondsFor(item);
  if (!(seconds > 0)) fails.push('zero length');
  else if (seconds < want * 0.35) fails.push(`too short: ${seconds.toFixed(2)}s vs ~${want.toFixed(2)}s`);
  else if (seconds > want * 3 + 2) fails.push(`too long: ${seconds.toFixed(2)}s vs ~${want.toFixed(2)}s`);
  // loudness and silence, from ffmpeg's own measurement
  try {
    const out = execFileSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) + '';
    const mean = Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(out)?.[1] ?? NaN);
    const peak = Number(/max_volume:\s*(-?[\d.]+) dB/.exec(out)?.[1] ?? NaN);
    if (Number.isFinite(peak) && peak < -45) fails.push(`silent: peak ${peak} dB`);
    if (Number.isFinite(mean) && mean < -40) fails.push(`near-silent: mean ${mean} dB`);
    if (Number.isFinite(peak) && peak > -0.1) fails.push(`clipping: peak ${peak} dB`);
  } catch { fails.push('loudness probe failed'); }
  return { ok: fails.length === 0, fails, seconds };
}

/* ---------------------------------------------------------------- the spend gate */
export function goAheadGiven(dir = INBOX) {
  try {
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const text = readFileSync(join(dir, name), 'utf8');
      if (/^\s*render\s*$/im.test(text) || /\brender\s*:\s*(go|yes|approved)\b/i.test(text)) return { given: true, file: name };
    }
  } catch { /* no inbox here */ }
  return { given: false, file: null };
}

/* ---------------------------------------------------------------- placement and de-duplication
 * A PLACEMENT is a file the app must have. A RENDER is one synthesis we must buy. They are not
 * the same thing and conflating them overpays: the listening lane speaks the very sentences the
 * reader lane narrates, in the same voice, from the same model — identical audio at two paths.
 * Billing follows unique (model, voice, text); every other placement is a copy of bytes already
 * bought. Measured on this corpus the saving is the whole example lane. */
const stem = (id) => String(id).replaceAll(':', '_');
const digest = (text) => createHash('sha256').update(text).digest('hex');

export function placementPath(item, voice) {
  if (item.role === 'word') return `audio/w/${voice}/${digest(`${voice}|${item.key}`).slice(0, 10)}.m4a`;
  const file = `${stem(item.articleId)}-${String(item.index).padStart(3, '0')}.m4a`;
  return item.role === 'example' ? `audio/s/${voice}/${file}` : `audio/narration/${voice}/${file}`;
}

/** The whole job as data: what must exist on disk, and the far smaller set we actually pay for. */
export function plan({ corpora = Object.keys(CORPORA), limit = 0, lock = LOCK } = {}) {
  const placements = [];
  const renders = new Map();
  const per = {};
  for (const name of corpora) {
    if (!CORPORA[name]) throw new Error(`unknown corpus ${name}`);
    const items = limit ? CORPORA[name]().slice(0, limit) : CORPORA[name]();
    per[name] = estimate(items);
    for (const item of items) {
      const voice = lock.roles[item.role] || lock.main;
      const id = digest(`${lock.model}|${voice}|${item.spoken}`).slice(0, 16);
      const path = placementPath(item, voice);
      placements.push({ ...item, voice, path, renderId: id });
      const row = renders.get(id)
        || { id, voice, model: lock.model, text: item.spoken, seconds: secondsFor(item), paths: [] };
      if (!row.paths.includes(path)) row.paths.push(path);
      // a word and a sentence can never collide (different text), but when two roles share text
      // the longer estimate governs the admission window
      row.seconds = Math.max(row.seconds, secondsFor(item));
      renders.set(id, row);
    }
  }
  const buy = [...renders.values()];
  const chars = buy.reduce((n, r) => n + r.text.length, 0);
  const seconds = buy.reduce((n, r) => n + r.seconds, 0);
  return {
    placements, renders: buy, perCorpus: per,
    billable: { clips: buy.length, chars, seconds, standard: price(chars, seconds), batch: price(chars, seconds, BATCH) },
    placementCount: placements.length,
  };
}

/* ---------------------------------------------------------------- the ledger (resumable) */
export function readLedger(file) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return { v: 1, model: LOCK.model, rows: {} }; }
}
/** A render is done when every file it owes is already on disk and no ledger row contradicts it.
 * Bytes on disk are the authority, so clips bought by an earlier tool (the 10-15 narration probe)
 * are never bought again; the ledger adds provenance for what this job itself paid for. A
 * half-finished run resumes exactly where it fell. `--force` overrides. */
export function alreadyDone(ledger, row, root, force = false) {
  if (force) return false;
  const done = ledger.rows?.[row.id];
  if (done && (done.model !== row.model || done.voice !== row.voice || done.text !== row.text)) return false;
  return row.paths.every((p) => existsSync(resolve(root, p)));
}

/* ---------------------------------------------------------------- synthesis
 * The key never appears here, in argv or in a log. The operator launches the paid run through the
 * key broker: `dkeys exec GEMINI_API_KEY -- node tools/render-corpus.mjs --render --confirm`.
 * --mock replaces the network with ffmpeg so the ledger, the admission gate, the de-duplication
 * and the placement copies can all be proven for nothing. */
export async function synthesize({ text, voice, model, outFile, mock = false, seconds = 1 }) {
  mkdirSync(dirname(outFile), { recursive: true });
  if (mock) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
      '-i', `sine=frequency=330:duration=${Math.max(0.3, seconds).toFixed(2)}`,
      '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '64k', outFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, mock: true };
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY absent. Launch through: dkeys exec GEMINI_API_KEY -- node tools/render-corpus.mjs …');
  const response = await fetch(`${ENDPOINT}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAMES[voice] } } } },
    }),
  });
  const body = await response.text();
  if (!response.ok) return { ok: false, status: response.status, error: redact(body.slice(0, 300), key) };
  const part = JSON.parse(body).candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) return { ok: false, status: response.status, error: 'no inlineData audio in the response' };
  const raw = `${outFile}.raw`;
  writeFileSync(raw, Buffer.from(part.inlineData.data, 'base64'));
  const mime = part.inlineData.mimeType || '';
  const riff = readFileSync(raw).subarray(0, 4).toString('latin1') === 'RIFF';
  const rate = Number(/rate=(\d+)/u.exec(mime)?.[1] || 24000);
  const input = riff ? ['-i', raw] : ['-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw];
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-ac', '1', '-ar', '24000',
    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', outFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  rmSync(raw, { force: true });
  return { ok: true };
}
const redact = (text, key) => (key ? String(text).split(key).join('[redacted]') : String(text));
const sleep = (ms) => new Promise((wake) => setTimeout(wake, ms));

/** Buy what is missing, place every copy, keep the ledger honest. Never called without the gate. */
export async function run({ plan: job, root, ledgerFile, mock = false, pace = 600, limit = 0, force = false, log = () => {} }) {
  const ledger = readLedger(ledgerFile);
  ledger.model = LOCK.model;
  ledger.rows ||= {};
  const out = { rendered: 0, reused: 0, placed: 0, rejected: [], failed: [] };
  const queue = job.renders.filter((row) => !alreadyDone(ledger, row, root, force));
  out.reused = job.renders.length - queue.length;
  for (const row of limit ? queue.slice(0, limit) : queue) {
    const first = resolve(root, row.paths[0]);
    let result;
    try { result = await synthesize({ ...row, outFile: first, mock, seconds: row.seconds }); }
    catch (error) { out.failed.push({ id: row.id, error: String(error.message).slice(0, 160) }); continue; }
    if (!result.ok) { out.failed.push({ id: row.id, status: result.status, error: result.error }); continue; }
    const verdict = admit(first, { role: row.paths[0].startsWith('audio/w/') ? 'word' : 'sentence', spoken: row.text });
    if (!verdict.ok) {
      // a wrong or empty recording must never become an approved asset
      rmSync(first, { force: true });
      out.rejected.push({ id: row.id, fails: verdict.fails });
      continue;
    }
    const bytes = readFileSync(first);
    for (const path of row.paths.slice(1)) {
      const target = resolve(root, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);                       // the same bytes, bought once
      out.placed += 1;
    }
    ledger.rows[row.id] = { id: row.id, voice: row.voice, model: row.model, text: row.text,
      paths: row.paths, seconds: verdict.seconds, sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length, renderedAt: new Date().toISOString(), mock: !!result.mock };
    out.rendered += 1; out.placed += 1;
    mkdirSync(dirname(ledgerFile), { recursive: true });
    writeFileSync(ledgerFile, `${JSON.stringify(ledger, null, 2)}\n`);   // crash-safe: written per clip
    log(out);
    if (pace && !mock) await sleep(pace);
  }
  return { ...out, ledgerFile };
}

/* ---------------------------------------------------------------- main */
async function main() {
  const which = arg('corpus', 'all');
  const limit = Number(arg('limit', '0')) || 0;
  const names = which === 'all' ? Object.keys(CORPORA) : [which];
  if (names.some((n) => !CORPORA[n])) { console.error(`unknown corpus ${which}`); process.exit(2); }
  const root = resolve(arg('root', corridor));
  const job = plan({ corpora: names, limit });
  const fmt = (e) => ({ clips: e.clips, chars: e.chars, audioHours: +(e.seconds / 3600).toFixed(2),
    standardUSD: +e.standard.toFixed(2), batchUSD: +e.batch.toFixed(2) });
  const asked = estimate(job.placements);

  if (!flag('render')) {
    console.log(JSON.stringify({
      dryRun: true, model: LOCK.model, mainVoice: LOCK.main, rate: RATE.note,
      corpora: Object.fromEntries(Object.entries(job.perCorpus).map(([k, v]) => [k, fmt(v)])),
      placements: fmt(asked),
      billable: { ...fmt(job.billable), note: 'unique (model, voice, text); the rest are copies of bytes already bought' },
      saved: { clips: asked.clips - job.billable.clips, standardUSD: +(asked.standard - job.billable.standard).toFixed(2) },
      spendGate: goAheadGiven(),
    }, null, 2));
    return 0;
  }

  const mock = flag('mock');
  if (!mock) {
    const go = goAheadGiven();
    if (!go.given) {
      console.error('REFUSING TO SPEND: the lead has not written "render" in MISSION/inbox/.\n'
        + `Dry run says: ${job.billable.clips} billable clips, ${job.billable.chars} chars, `
        + `~$${job.billable.standard.toFixed(2)} standard.`);
      return 3;
    }
    if (!flag('confirm')) {
      console.error(`Go-ahead found in ${go.file}, but --confirm was not given, so nothing was bought.\n`
        + `Add --confirm to spend ~$${job.billable.standard.toFixed(2)}.`);
      return 4;
    }
  }
  const ledgerFile = resolve(arg('ledger', join(homedir(), '.dharma/bunki_voice',
    `corpus-${new Date().toISOString().slice(0, 10)}`, 'ledger.json')));
  const result = await run({ plan: job, root, ledgerFile, mock, pace: Number(arg('pace', '600')),
    limit: Number(arg('render-limit', '0')) || 0, force: flag('force') });
  console.log(JSON.stringify({ rendered: result.rendered, reused: result.reused, placed: result.placed,
    rejected: result.rejected.length, failed: result.failed.length, mock, ledgerFile }, null, 2));
  return result.failed.length ? 5 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
