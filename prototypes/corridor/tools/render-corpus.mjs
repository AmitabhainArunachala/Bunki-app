#!/usr/bin/env node
/** Render the whole spoken corpus to the lock, by role. Dry-run is the DEFAULT and is free.
 *
 * Corpora, each keyed the way the runtime resolves it:
 *   words     — one clip per (surface, reading) a review card can show, spoken from the reading's
 *               kana so the reading is forced (年 ねん ≠ 年 とし). Two bands: every word the shelf
 *               uses, keyed as its card shows it (a kanji word by the reading its sentence gives,
 *               a kana word and an inflected word by the dictionary's own reading), then every deck
 *               card the shelf never uses, keyed by the reading its card shows (core dictionary
 *               first, as savedAnswerFor does).
 *   articles  — one clip per sentence unit, the shelf's own units. A closing bracket or divider is
 *               never a unit of its own (a lone 」 would be bought and then fail admission).
 *   examples  — one clip per listening cue, from the very sentences build-listening-cues cuts its
 *               cues from (listeningSentences), so clip i and cue i are one sentence.
 *
 * DIALOGUES RENDER SINGLE-VOICE FOR NOW. The shelf holds labelled scripts (ユキ「…」 森「…」; the
 * transistor class has three speakers), and which voice reads which speaker is John's casting, not
 * this tool's. Enforced in three places: articleCorpus gives every unit the narrator role (so no
 * second-voice clip is ever placed); build-voice-manifest never declares an article a dialogue; and
 * the runtime admits a second-voice clip only inside an article declared `kind:'dialogue'`. The dry
 * run names the scripts it found.
 *
 * Billing follows unique (model, voice, text): one purchase may be placed at several paths. Every
 * placed FILE is keyed by (model, voice, role, text hash, reading) and its bytes' digest, in the
 * render ledger or in the shipped manifest's own record. A file is reused only when that key and
 * digest match: a changed model, voice, role, text or reading is not done, so a swap re-renders and
 * old audio is never relabelled. A missing copy is restored from proven bytes, never bought twice.
 *
 * Admission (a clip enters only if every check passes; otherwise it is never written into place):
 * duration against its expected length; loudness from ffmpeg's own measurement (read from stderr,
 * where volumedetect writes; an unmeasured clip fails closed): silent, near-silent and clipping are
 * refused; and for sentence clips a pronunciation check: a local whisper transcript against the
 * source text, character error rate at most ASR_MAX_CER. Calibrated on the six shipped Kore clips:
 * correct 0.00–0.23, the wrong sentence 0.90–1.77, silence 1.0. It stands in for PREP's g2p/ASR
 * gate: it catches skipped, truncated, wrong and silent audio, but it cannot hear one misread
 * compound in an otherwise right sentence. Word clips are spoken from their kana, so the reading
 * is the input itself and no g2p step exists to go wrong; a one-second clip is too short for ASR to
 * judge, so words meet the duration and loudness gates only.
 *
 * Spend gate: `--render` needs the lead's authorization file, MISSION/authorizations/V-render.json:
 * { authorized: true, by: "lead", head_sha, max_usd, john_words, time } — head_sha must be the HEAD
 * of this checkout with no change outside audio/, and the job's estimate must fit max_usd, which
 * also caps the run as it goes. Inbox prose is never read. `--confirm` is still required. The key is
 * never read from disk: `dkeys exec GEMINI_API_KEY -- node tools/render-corpus.mjs --render --confirm`.
 *
 *   node tools/render-corpus.mjs [--dry-run] [--corpus words|articles|examples|all] [--limit N]
 *                                [--subset name=ids.json]
 *   node tools/render-corpus.mjs --render --confirm [--corpus …] [--limit N] [--render-limit N]
 *                                [--asr small|base|off] [--pace ms] [--ledger file] [--authorization file]
 *   node tools/render-corpus.mjs --render --mock --root /tmp/outside-the-repo [--corpus …] [--limit N]
 */
import { createHash } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync,
  writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVoiceLock, runtimeLock, voiceForRole } from './voice-lock.mjs';
import { listeningSentences } from './build-listening-cues.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repo = resolve(corridor, '../..');
const LOCK = runtimeLock();
const VOICE_NAMES = LOCK.voices;              // id → the provider's prebuilt name, from the lock
const ENDPOINT = readVoiceLock().endpoint;    // the provider, from the lock; no literal here
export const AUTHORIZATION_FILE = resolve(homedir(),
  '.dharma/bunki_review/2026-10-15/juncture/one-hand/MISSION/authorizations/V-render.json');

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d; };
const flag = (n) => process.argv.includes(`--${n}`);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const compact = (text) => String(text).replace(/\s+/gu, '');

/* ---------------------------------------------------------------- the published rate
 * Keyed by model: a lock that names a model with no published rate here gets no price, never the
 * wrong one. Audio tokens are 25 per second of audio (stated on the same page). The per-character
 * constants are MEASURED from the six real Kore clips in ~/.dharma/bunki_voice/kore-probe-20261015. */
export const RATES = {
  'gemini-3.8-flash-tts': {
    source: 'https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash-tts',
    read: '2026-10-17; the page says "Last updated 2026-10-16 UTC"',
    through: '2026-12-31',
    standard: { inPerM: 0.50, outPerM: 9.00 },
    batch: { inPerM: 0.25, outPerM: 4.50 },
    from2027: { standard: { inPerM: 1.00, outPerM: 18.00 }, batch: { inPerM: 0.50, outPerM: 9.00 } },
  },
};
const TOKENS_PER_SECOND = 25;
const SECONDS_PER_CHAR = 0.2065;   // sentence-shaped text
const INPUT_TOK_PER_CHAR = 0.7283;
const WORD_CLIP_SECONDS = 0.98;    // a word clip is ~1 s whatever its length (40-clip sample)
export const ASR_MAX_CER = 0.5;

const price = (chars, seconds, rate) => (rate
  ? (chars * INPUT_TOK_PER_CHAR) / 1e6 * rate.inPerM + (seconds * TOKENS_PER_SECOND) / 1e6 * rate.outPerM
  : null);

/* ---------------------------------------------------------------- the corpora */
const json = (p) => JSON.parse(readFileSync(resolve(corridor, p), 'utf8'));
/** The shelf's sentence units: per line, split after 。！？ (a run of them stays together). A
 * piece with no letter or digit — a closing 」, a ） after the stop, a ＊ divider — is not a
 * sentence: on a line with a sentence before it, it joins that sentence; alone, it is not spoken. */
export const sentenceUnits = (text) => String(text || '').split(/\n+/u).flatMap((line) => {
  const units = [];
  for (const piece of (line.match(/[^。！？]+[。！？]*/gu) || []).map((s) => s.trim()).filter(Boolean)) {
    if (/[\p{L}\p{N}]/u.test(piece)) units.push(piece);
    else if (units.length) units[units.length - 1] += piece;
  }
  return units;
});
const KANA = /^[\p{Script=Hiragana}\p{Script=Katakana}ー・]+$/u;
const FUNCTION_POS = new Set(['助詞', '助動詞', '接尾辞', '接頭辞', '補助記号', '記号', '空白']);

/** Words: every (surface, reading) a review card can show. A card's reading is the dictionary's
 * (savedAnswerFor: core first, then the deck), except for a word saved from a sentence, whose
 * card keeps the reading that sentence gave it (R's cueReading: 年 ねん in 令和8年). So:
 *   a kanji word met uninflected → the reading its sentence gives;
 *   a kana word, or an inflected one → the lemma's dictionary reading (token readings are
 *     hiragana-fied: フィヨルド reads ふぃよるど in the tokens and フィヨルド on its card);
 *   then every deck card the shelf never uses.
 * Ranked so a partial render covers the most first: shelf words by how many articles carry them,
 * then deck cards from N5 up. */
export function wordCorpus() {
  const articles = json('data/articles/index.json').articles;
  const deck = json('data/share_alike/words.json').words;
  const core = json('data/share_alike/dict.json').words;
  const dictionaryReading = (lemma) => core[lemma]?.r || deck[lemma]?.r || '';
  const shelf = new Map();
  for (const row of articles) {
    for (const t of json(`data/articles/${row.file}`).tokens || []) {
      // particles, auxiliaries, affixes and symbols never stand alone on a card, and a one-mora
      // clip of は or に would only fail admission as too short
      if (FUNCTION_POS.has(t.p)) continue;
      const lemma = t.b || t.s;
      if (!lemma || !(Object.hasOwn(core, lemma) || Object.hasOwn(deck, lemma))) continue;
      const reading = t.s === lemma && !KANA.test(t.s) ? (t.r || '') : dictionaryReading(lemma);
      if (!KANA.test(reading)) continue;
      const key = `${lemma}|${reading}`;
      const hit = shelf.get(key) || { key, surface: lemma, reading, tokens: 0, docs: new Set(), band: 'shelf' };
      hit.tokens += 1; hit.docs.add(row.id); shelf.set(key, hit);
    }
  }
  const met = [...shelf.values()].map((w) => ({ ...w, docIds: [...w.docs], docs: w.docs.size }))
    .sort((a, b) => b.docs - a.docs || b.tokens - a.tokens || a.key.localeCompare(b.key));
  const seen = new Set(met.map((w) => w.key));
  const cards = [];
  for (const [id, entry] of Object.entries(deck)) {
    const reading = dictionaryReading(id);
    const key = `${id}|${reading}`;
    if (!KANA.test(reading) || seen.has(key)) continue;
    seen.add(key);
    cards.push({ key, surface: id, reading, tokens: 0, docs: 0, docIds: [], band: 'deck', jlpt: entry.jlpt || 0 });
  }
  cards.sort((a, b) => b.jlpt - a.jlpt || a.key.localeCompare(b.key));
  return [...met, ...cards].map((w) => ({ ...w, role: 'word', spoken: w.reading }));
}

/** Articles: the shelf's own sentence units — ALL of them, and all in the narrator role: this is
 * where dialogues are held to a single voice until John casts them. */
export function articleCorpus() {
  const out = [];
  for (const row of json('data/articles/index.json').articles) {
    sentenceUnits(json(`data/articles/${row.file}`).text).forEach((text, i) =>
      out.push({ key: `${row.id}#${i}`, articleId: row.id, index: i, role: 'narrator', spoken: text, surface: text }));
  }
  return out;
}

/** The shelf's labelled scripts: an article in which at least two speakers, each named by a bare
 * name (letters only, no punctuation) before a quote, speak at least two lines each (ユキ「…」
 * 森「…」). Prose that opens a line with 一方、「…」 is not a script. Reported, and rendered
 * single-voice; never cast by this tool. */
const SPEAKER_LINE = /^([\p{L}ー]{1,6})「/u;
export function dialoguePieces() {
  const found = [];
  for (const row of json('data/articles/index.json').articles) {
    const lines = String(json(`data/articles/${row.file}`).text || '').split(/\n+/u);
    const counts = new Map();
    for (const line of lines) { const name = SPEAKER_LINE.exec(line.trim())?.[1]; if (name) counts.set(name, (counts.get(name) || 0) + 1); }
    const speakers = [...counts].filter(([, n]) => n >= 2).map(([name]) => name);
    if (speakers.length >= 2) found.push({ id: row.id, lines: [...counts.values()].reduce((a, b) => a + b, 0), speakers });
  }
  return found;
}

/** Examples: exactly the sentences the listening lane will cue, numbered as its cues are. A
 * passage whose narration units do not line up with its cue sentences is left out and named,
 * because its clip i would say a different sentence from its cue i. */
export function exampleCorpus() {
  const out = [];
  const skipped = [];
  for (const passage of listeningSentences(corridor)) {
    if (!passage.eligible) continue;
    const units = sentenceUnits(json(`data/articles/${passage.row.file}`).text);
    const aligned = units.length === passage.ranges.length && passage.ranges.every((range, i) =>
      compact(passage.surfaces.slice(range.start, range.end).join('')) === compact(units[i]));
    if (!aligned) { skipped.push(passage.row.id); continue; }
    units.forEach((text, i) => out.push({ key: `${passage.row.id}#${i}`, articleId: passage.row.id, index: i,
      role: 'example', spoken: text, surface: text }));
  }
  exampleCorpus.skipped = skipped;
  return out;
}

const CORPORA = { words: wordCorpus, articles: articleCorpus, examples: exampleCorpus };

/** Seconds a clip will run: a word is ~1 s flat; sentence-shaped text scales with its length. */
const secondsFor = (item) => item.role === 'word' ? WORD_CLIP_SECONDS : item.spoken.length * SECONDS_PER_CHAR;

export function estimate(items, model = LOCK.model) {
  const rate = RATES[model];
  const chars = items.reduce((n, i) => n + i.spoken.length, 0);
  const seconds = items.reduce((n, i) => n + secondsFor(i), 0);
  return { clips: items.length, chars, seconds,
    standard: price(chars, seconds, rate?.standard), batch: price(chars, seconds, rate?.batch),
    standard2027: price(chars, seconds, rate?.from2027?.standard) };
}

/* ---------------------------------------------------------------- placement and de-duplication */
const stem = (id) => String(id).replaceAll(':', '_');
const textDigest = (text) => createHash('sha256').update(text).digest('hex');

export function placementPath(item, voice) {
  if (item.role === 'word') return `audio/w/${voice}/${textDigest(`${voice}|${item.key}`).slice(0, 10)}.m4a`;
  const file = `${stem(item.articleId)}-${String(item.index).padStart(3, '0')}.m4a`;
  return item.role === 'example' ? `audio/s/${voice}/${file}` : `audio/narration/${voice}/${file}`;
}
/** The identity a placed file must carry to be reused: (model, voice, role, text hash, reading). */
export const fileKey = (p) => textDigest(JSON.stringify([p.model, p.voice, p.role, textDigest(p.spoken), p.reading || '']));

/** The whole job as data: what must exist on disk (placements, each with its file key), the far
 * smaller set we actually pay for (renders), and a digest naming this exact job. */
export function plan({ corpora = Object.keys(CORPORA), limit = 0, lock = LOCK } = {}) {
  const placements = [];
  const renders = new Map();
  const per = {};
  for (const name of corpora) {
    if (!CORPORA[name]) throw new Error(`unknown corpus ${name}`);
    const items = limit ? CORPORA[name]().slice(0, limit) : CORPORA[name]();
    per[name] = estimate(items, lock.model);
    for (const item of items) {
      const voice = voiceForRole(item.role, lock);
      const id = textDigest(`${lock.model}|${voice}|${item.spoken}`).slice(0, 16);
      const placement = { ...item, voice, model: lock.model, reading: item.role === 'word' ? item.reading : '',
        path: placementPath(item, voice), renderId: id };
      placement.fileKey = fileKey(placement);
      placements.push(placement);
      const row = renders.get(id)
        || { id, voice, model: lock.model, text: item.spoken, seconds: secondsFor(item), kind: item.role === 'word' ? 'word' : 'sentence', paths: [] };
      if (!row.paths.includes(placement.path)) row.paths.push(placement.path);
      row.seconds = Math.max(row.seconds, secondsFor(item));
      if (item.role !== 'word') row.kind = 'sentence';
      renders.set(id, row);
    }
  }
  const buy = [...renders.values()];
  const chars = buy.reduce((n, r) => n + r.text.length, 0);
  const seconds = buy.reduce((n, r) => n + r.seconds, 0);
  const rate = RATES[lock.model];
  const digest = createHash('sha256').update(JSON.stringify(placements.map((p) => [p.path, p.fileKey])
    .sort((a, b) => (a[0] < b[0] ? -1 : 1)))).digest('hex').slice(0, 16);
  return {
    placements, renders: buy, perCorpus: per, digest, model: lock.model,
    billable: { clips: buy.length, chars, seconds, standard: price(chars, seconds, rate?.standard),
      batch: price(chars, seconds, rate?.batch), standard2027: price(chars, seconds, rate?.from2027?.standard) },
    placementCount: placements.length,
  };
}

/* ---------------------------------------------------------------- provenance (resumable, swap-safe)
 * The ledger is keyed by MODEL and lives outside the repository, so a resumed run on any day finds
 * its own rows and a swapped model starts clean. `renders` records each purchase; `files` records
 * every placed file by its key and its bytes' digest. */
export const ledgerPathFor = (model) => resolve(homedir(), '.dharma/bunki_voice/corpus-ledger', `${model}.json`);
export function readLedger(file, model = LOCK.model) {
  try {
    const ledger = JSON.parse(readFileSync(file, 'utf8'));
    if (ledger.v === 3 && ledger.model === model && ledger.files && ledger.renders) return ledger;
  } catch { /* absent or unreadable: an empty ledger trusts nothing */ }
  return { v: 3, model, renders: {}, files: {} };
}
function writeLedger(file, ledger) {
  mkdirSync(dirname(file), { recursive: true });
  const part = `${file}.${process.pid}.part`;
  writeFileSync(part, `${JSON.stringify(ledger, null, 2)}\n`);
  renameSync(part, file);   // atomic: a crash leaves the old ledger or the new one, never half of one
}
/** What the shipped manifests vouch for: path → the same identity a file key is made of. */
export function shippedVouchers(root = corridor) {
  const vouchers = new Map();
  const read = (file) => { try { return JSON.parse(readFileSync(resolve(root, file), 'utf8')); } catch { return null; } };
  const narration = read('audio/article-narration.json');
  if (narration?.v === 2) for (const article of Object.values(narration.articles || {}))
    for (const clip of article.clips || []) vouchers.set(clip.src, { model: clip.model, voice: clip.voice, role: clip.speakerRole,
      spoken: clip.text, reading: '', sha256: clip.sha256 });
  const words = read('audio/manifest.json');
  if (words?.v === 2) for (const entry of Object.values(words.words || {}))
    vouchers.set(entry.src, { model: entry.model, voice: entry.voice, role: entry.speakerRole,
      spoken: entry.reading, reading: entry.reading, sha256: entry.sha256 });
  return vouchers;
}
/** Are the bytes at this placement's path provably this placement's? Its file key — model, voice,
 * role, text hash and reading — and its digest must match a ledger file row or a shipped manifest
 * record. A mock row is trusted only by a mock run. */
export function provenanceOf(root, placement, ledger, vouchers, { mock = false } = {}) {
  const file = resolve(root, placement.path);
  if (!existsSync(file)) return null;
  const digest = sha256(readFileSync(file));
  const row = ledger.files?.[placement.path];
  if (row && row.key === placement.fileKey && row.sha256 === digest && (mock || !row.mock))
    return { by: 'ledger', model: row.model, sha256: digest };
  const vouched = vouchers.get(placement.path);
  if (vouched && vouched.sha256 === digest && fileKey(vouched) === placement.fileKey)
    return { by: 'manifest', model: vouched.model, sha256: digest };
  return null;
}

/* ---------------------------------------------------------------- the admission gate */
const ffprobeSeconds = (file) => {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
    '-of', 'json', file], { encoding: 'utf8' }));
  return Number(probe.format?.duration || 0);
};
const normalizeForAsr = (text) => [...String(text).normalize('NFKC')
  // a reading in brackets after its word is the page's gloss, not a second thing said
  .replace(/[（(][\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+[）)]/gu, '')]
  .filter((ch) => /[\p{L}\p{N}]/u.test(ch));
export function characterErrorRate(heard, said) {
  const a = normalizeForAsr(heard), b = normalizeForAsr(said);
  if (!b.length) return a.length ? 1 : 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length] / b.length;
}

/** A clip enters the manifest only if it passes every check. A failure is reported and the clip
 * is never placed — a wrong or empty recording must never become an approved asset. */
export async function admit(file, item, { asr = null } = {}) {
  const fails = [];
  let seconds = 0;
  try { seconds = ffprobeSeconds(file); } catch (error) { return { ok: false, fails: [`unreadable: ${String(error.message).slice(0, 80)}`] }; }
  const want = secondsFor(item);
  if (!(seconds > 0)) fails.push('zero length');
  else if (seconds < want * 0.35) fails.push(`too short: ${seconds.toFixed(2)}s vs ~${want.toFixed(2)}s`);
  else if (seconds > want * 3 + 2) fails.push(`too long: ${seconds.toFixed(2)}s vs ~${want.toFixed(2)}s`);
  // volumedetect writes its measurement to STDERR; reading stdout measured nothing and passed silence
  const measured = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' });
  const log = `${measured.stderr || ''}${measured.stdout || ''}`;
  const mean = Number(/mean_volume:\s*(-?[\d.]+|-inf) dB/u.exec(log)?.[1]?.replace('-inf', '-Infinity') ?? NaN);
  const peak = Number(/max_volume:\s*(-?[\d.]+|-inf) dB/u.exec(log)?.[1]?.replace('-inf', '-Infinity') ?? NaN);
  if (measured.status !== 0) fails.push(`loudness probe failed (exit ${measured.status})`);
  if (Number.isNaN(mean) || Number.isNaN(peak)) fails.push('loudness unmeasured');
  else {
    if (peak < -45) fails.push(`silent: peak ${peak} dB`);
    else if (mean < -40) fails.push(`near-silent: mean ${mean} dB`);
    if (peak > -0.1) fails.push(`clipping: peak ${peak} dB`);
  }
  let heard = null, cer = null;
  if (asr && item.role !== 'word') {
    try { heard = await asr.transcribe(file); cer = characterErrorRate(heard, item.spoken); }
    catch (error) { fails.push(`asr failed: ${String(error.message).slice(0, 80)}`); }
    if (cer !== null && !(cer <= ASR_MAX_CER)) fails.push(`asr: heard ${JSON.stringify(heard.slice(0, 40))}, error rate ${cer.toFixed(2)}`);
  }
  return { ok: fails.length === 0, fails, seconds, mean, peak, ...(cer !== null ? { asr: { model: asr.model, cer: +cer.toFixed(3), heard } } : {}) };
}

/** The local whisper worker, loaded once per run. */
export function startAsr(model = 'small') {
  const python = process.env.KAIRO_ASR_PYTHON || (() => {
    const bin = execFileSync('which', ['whisper'], { encoding: 'utf8' }).trim();
    const first = readFileSync(bin, 'utf8').split('\n')[0];
    if (!first.startsWith('#!')) throw new Error('whisper is not a script; set KAIRO_ASR_PYTHON');
    return first.slice(2).trim();
  })();
  const child = spawn(python, ['-I', resolve(corridor, 'tools/audio-asr-worker.py'), model], { stdio: ['pipe', 'pipe', 'ignore'] });
  const waiting = new Map();
  let buffer = '', serial = 0, readyResolve, readyReject;
  const ready = new Promise((ok, no) => { readyResolve = ok; readyReject = no; });
  child.on('exit', (code) => { readyReject(new Error(`asr worker exited ${code}`)); for (const [, w] of waiting) w.reject(new Error(`asr worker exited ${code}`)); });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let at;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
      if (!line.trim()) continue;
      const answer = JSON.parse(line);
      if (answer.ready) { readyResolve(); continue; }
      const w = waiting.get(answer.id); waiting.delete(answer.id);
      if (!w) continue;
      if (answer.error) w.reject(new Error(answer.error)); else w.resolve(answer.text || '');
    }
  });
  return {
    model,
    async transcribe(file) {
      await ready;
      const id = ++serial;
      return new Promise((ok, no) => { waiting.set(id, { resolve: ok, reject: no }); child.stdin.write(`${JSON.stringify({ id, file })}\n`); });
    },
    close() { try { child.stdin.end(); child.kill(); } catch { /* already gone */ } },
  };
}

/* ---------------------------------------------------------------- the spend gate
 * One structured file, written by the lead alone. Inbox prose is never read: a sentence that only
 * mentions rendering, quotes it or negates it can authorize nothing. */
export function checkoutState() {
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  const head = git('rev-parse', 'HEAD');
  // the job's own outputs live under audio/; any other change means HEAD is not the code that runs
  const dirty = git('status', '--porcelain', '--', '.', ':(exclude)prototypes/corridor/audio').length > 0;
  return { head, dirty };
}
export function authorization({ file = AUTHORIZATION_FILE, head, dirty, estimateUsd, digest } = {}) {
  let doc;
  try { doc = JSON.parse(readFileSync(file, 'utf8')); }
  catch { return { given: false, file, problems: [`no readable authorization at ${file}`] }; }
  const problems = [];
  if (doc.authorized !== true) problems.push('authorized is not true');
  if (doc.by !== 'lead') problems.push('by is not "lead"');
  if (typeof doc.head_sha !== 'string' || !/^[0-9a-f]{7,40}$/u.test(doc.head_sha)) problems.push('head_sha missing');
  else if (!head?.startsWith(doc.head_sha)) problems.push(`head_sha ${doc.head_sha} is not the HEAD being rendered (${head})`);
  if (dirty) problems.push('the checkout has changes outside audio/, so its HEAD is not the code that would run');
  if (!(typeof doc.max_usd === 'number' && Number.isFinite(doc.max_usd) && doc.max_usd > 0)) problems.push('max_usd missing');
  else if (estimateUsd !== null && estimateUsd > doc.max_usd)
    problems.push(`the job's estimate $${estimateUsd.toFixed(2)} exceeds max_usd $${doc.max_usd}`);
  if (typeof doc.john_words !== 'string' || !doc.john_words.trim()) problems.push('john_words missing');
  if (typeof doc.time !== 'string' || Number.isNaN(Date.parse(doc.time))) problems.push('time missing or not a date');
  if (doc.job_digest !== undefined && doc.job_digest !== digest) problems.push(`job_digest ${doc.job_digest} is not this job (${digest})`);
  return { given: problems.length === 0, file, problems, maxUsd: doc.max_usd ?? null };
}

/* ---------------------------------------------------------------- synthesis */
const redact = (text, key) => (key ? String(text).split(key).join('[redacted]') : String(text));
const sleep = (ms) => new Promise((wake) => setTimeout(wake, ms));

/** One synthesis into `outFile`. The key is read from the environment only (the dkeys broker),
 * never from disk, argv or a log. --mock replaces the network with ffmpeg: a spoken-length tone. */
export async function synthesize({ text, voice, model, outFile, mock = false, seconds = 1 }) {
  mkdirSync(dirname(outFile), { recursive: true });
  if (mock) {
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi',
      '-i', `sine=frequency=330:duration=${Math.max(0.3, seconds).toFixed(2)}`,
      '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '64k', '-f', 'mp4', outFile], { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, mock: true };
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, fatal: true, status: 'no-key', error: 'GEMINI_API_KEY absent. Launch through: dkeys exec GEMINI_API_KEY -- node tools/render-corpus.mjs …' };
  let response, body;
  try {
    response = await fetch(`${ENDPOINT}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE_NAMES[voice] } } } },
      }),
    });
    body = await response.text();
  } catch (error) { return { ok: false, status: 0, error: redact(String(error.message).slice(0, 200), key) }; }
  if (!response.ok) {
    const retry = Number(response.headers.get('retry-after'));
    return { ok: false, status: response.status, retryAfterMs: Number.isFinite(retry) ? retry * 1000 : null,
      error: redact(body.slice(0, 300), key) };
  }
  const part = JSON.parse(body).candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) return { ok: false, status: response.status, error: 'no inlineData audio in the response' };
  const raw = `${outFile}.raw`;
  writeFileSync(raw, Buffer.from(part.inlineData.data, 'base64'));
  const mime = part.inlineData.mimeType || '';
  const riff = readFileSync(raw).subarray(0, 4).toString('latin1') === 'RIFF';
  const rate = Number(/rate=(\d+)/u.exec(mime)?.[1] || 24000);
  const input = riff ? ['-i', raw] : ['-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', raw];
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input, '-ac', '1', '-ar', '24000',
    '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', '-f', 'mp4', outFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  rmSync(raw, { force: true });
  return { ok: true };
}

/** Synthesis with the provider's manners: back off on 429 and 5xx and network errors (honouring
 * Retry-After), stop the whole run on an authentication failure, never retry a 4xx request error. */
export async function synthesizeWithRetry(args, { attempts = 6, baseMs = 2000, note = () => {} } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { last = await synthesize(args); }
    catch (error) { last = { ok: false, status: 'convert', error: String(error.message).slice(0, 200) }; }
    note({ attempt, status: last.ok ? 200 : last.status, error: last.ok ? null : last.error });
    if (last.ok || last.fatal) return last;
    if (last.status === 401 || last.status === 403) return { ...last, fatal: true };
    const transient = last.status === 0 || last.status === 429 || last.status >= 500;
    if (!transient) return last;
    await sleep(last.retryAfterMs ?? Math.min(60000, baseMs * 2 ** (attempt - 1)));
  }
  return { ...last, ok: false, exhausted: true };
}

/** Buy what is missing, restore every copy from proven bytes, keep the ledger honest. Never
 * called without the gate. Every attempt is appended to `<ledger>.attempts.jsonl`. `maxUsd`
 * caps the run by the published-rate estimate of what it has bought. */
export async function run({ plan: job, root, ledgerFile, mock = false, pace = 600, limit = 0, asr = null, maxUsd = null, log = () => {} }) {
  const ledger = readLedger(ledgerFile, job.model);
  const vouchers = shippedVouchers(root);
  const attemptsFile = `${ledgerFile}.attempts.jsonl`;
  const out = { rendered: 0, reused: 0, placed: 0, rejected: [], failed: [], stopped: null, spentEstimateUsd: 0 };
  const byRender = new Map();
  for (const placement of job.placements) (byRender.get(placement.renderId) || byRender.set(placement.renderId, []).get(placement.renderId)).push(placement);
  const rate = RATES[job.model]?.standard;
  const work = mkdtempIn(tmpdir(), 'render-corpus-');
  let bought = 0;
  try {
    for (const row of job.renders) {
      const placements = byRender.get(row.id) || [];
      const proven = placements.filter((p) => provenanceOf(root, p, ledger, vouchers, { mock }));
      if (proven.length === placements.length) { out.reused += 1; continue; }
      let bytes, renderId = row.id;
      if (proven.length) {
        bytes = readFileSync(resolve(root, proven[0].path));
        out.reused += 1;
      } else {
        if (limit && bought >= limit) continue;
        const cost = price(row.text.length, row.seconds, rate) ?? 0;
        if (maxUsd !== null && out.spentEstimateUsd + cost > maxUsd) { out.stopped = { reason: 'max_usd', maxUsd, spentEstimateUsd: out.spentEstimateUsd }; break; }
        bought += 1;
        const part = join(work, `${row.id}.m4a`);
        const result = await synthesizeWithRetry({ ...row, outFile: part, mock },
          { note: (attempt) => appendFileSync(attemptsFile, `${JSON.stringify({ id: row.id, at: new Date().toISOString(), ...attempt })}\n`) });
        out.spentEstimateUsd += mock ? 0 : cost;
        // paced whatever the outcome: a run of refusals must not become a burst of requests
        if (pace && !mock) await sleep(pace);
        if (result.fatal) { out.stopped = { id: row.id, status: result.status, error: result.error }; break; }
        if (!result.ok) { out.failed.push({ id: row.id, status: result.status, error: result.error }); continue; }
        const verdict = await admit(part, { role: row.kind === 'word' ? 'word' : 'narrator', spoken: row.text }, { asr });
        appendFileSync(attemptsFile, `${JSON.stringify({ id: row.id, at: new Date().toISOString(), admission: verdict })}\n`);
        if (!verdict.ok) { rmSync(part, { force: true }); out.rejected.push({ id: row.id, fails: verdict.fails }); continue; }
        bytes = readFileSync(part);
        rmSync(part, { force: true });
        ledger.renders[row.id] = { id: row.id, voice: row.voice, model: row.model, textSha256: textDigest(row.text),
          seconds: verdict.seconds, sha256: sha256(bytes), bytes: bytes.length, admission: { mean: verdict.mean,
            peak: verdict.peak, ...(verdict.asr ? { asr: verdict.asr } : {}) }, renderedAt: new Date().toISOString(), mock: !!mock };
        out.rendered += 1;
        renderId = row.id;
      }
      // every placement not yet proven gets exactly these bytes and its own keyed ledger row
      const digest = sha256(bytes);
      for (const placement of placements) {
        if (proven.includes(placement)) continue;
        const target = resolve(root, placement.path);
        if (!(existsSync(target) && sha256(readFileSync(target)) === digest)) {
          mkdirSync(dirname(target), { recursive: true });
          const part = `${target}.${process.pid}.part`;
          writeFileSync(part, bytes);
          renameSync(part, target);
        }
        ledger.files[placement.path] = { key: placement.fileKey, model: placement.model, voice: placement.voice,
          role: placement.role, textSha256: textDigest(placement.spoken), reading: placement.reading || '',
          sha256: digest, renderId, mock: !!mock, placedAt: new Date().toISOString() };
        out.placed += 1;
      }
      writeLedger(ledgerFile, ledger);
      log(out);
    }
  } finally { rmSync(work, { recursive: true, force: true }); }
  return { ...out, ledgerFile };
}
function mkdtempIn(dir, prefix) {
  const path = join(dir, `${prefix}${process.pid}-${Date.now()}`);
  mkdirSync(path, { recursive: true });
  return path;
}

/** How much of a job is already provably on disk: the purchases still owed are the renders none
 * of whose placements is proven. Reads every placed file once; free. */
export function owed(job, { root = corridor, ledgerFile = ledgerPathFor(job.model) } = {}) {
  const ledger = readLedger(ledgerFile, job.model);
  const vouchers = shippedVouchers(root);
  const provenRenders = new Set(job.placements.filter((p) => provenanceOf(root, p, ledger, vouchers)).map((p) => p.renderId));
  const toBuy = job.renders.filter((row) => !provenRenders.has(row.id));
  return { renders: toBuy, estimate: estimate(toBuy.map((r) => ({ role: r.kind === 'word' ? 'word' : 'narrator', spoken: r.text })), job.model) };
}

/* ---------------------------------------------------------------- main */
const inside = (child, parent) => { const rel = relative(parent, child); return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !rel.startsWith('/')); };

async function main() {
  const which = arg('corpus', 'all');
  const limit = Number(arg('limit', '0')) || 0;
  const names = which === 'all' ? Object.keys(CORPORA) : [which];
  if (names.some((n) => !CORPORA[n])) { console.error(`unknown corpus ${which}`); return 2; }
  const mock = flag('mock');
  const root = resolve(arg('root', corridor));
  const job = plan({ corpora: names, limit });
  const rate = RATES[job.model];
  const usd = (n) => (n === null ? null : +n.toFixed(2));
  const fmt = (e) => ({ clips: e.clips, chars: e.chars, audioHours: +(e.seconds / 3600).toFixed(2),
    standardUSD: usd(e.standard), standardFrom2027USD: usd(e.standard2027) });
  const authorizationFile = resolve(arg('authorization', AUTHORIZATION_FILE));

  if (!flag('render')) {
    const remaining = owed(job);
    const state = checkoutState();
    const subsets = {};
    for (const spec of process.argv.filter((a, i) => process.argv[i - 1] === '--subset')) {
      const [name, file] = spec.split('=');
      const ids = new Set(JSON.parse(readFileSync(resolve(file), 'utf8')));
      const pick = (corpus) => (job.perCorpus[corpus] ? CORPORA[corpus]().filter((i) => ids.has(i.articleId)) : []);
      const onlyHere = job.perCorpus.words ? wordCorpus().filter((w) => w.docIds.length && w.docIds.every((d) => ids.has(d))) : [];
      subsets[name] = { articles: ids.size, narration: fmt(estimate(pick('articles'))), examples: fmt(estimate(pick('examples'))),
        wordsFirstMetHere: fmt(estimate(onlyHere)),
        note: 'subset placements; where a sentence repeats elsewhere the purchase is shared, so these can overstate its own spend' };
    }
    console.log(JSON.stringify({
      dryRun: true, model: job.model, mainVoice: LOCK.main, head: state.head, checkoutChangedOutsideAudio: state.dirty,
      rate: rate ? { source: rate.source, read: rate.read, standard: rate.standard, through: rate.through, from2027: rate.from2027.standard }
        : `no published rate recorded for ${job.model}: no price is shown rather than a wrong one`,
      corpora: Object.fromEntries(Object.entries(job.perCorpus).map(([k, v]) => [k, fmt(v)])),
      wordBands: job.perCorpus.words ? Object.fromEntries(['shelf', 'deck'].map((band) =>
        [band, job.placements.filter((p) => p.role === 'word' && p.band === band).length])) : undefined,
      examplesSkippedForAlignment: exampleCorpus.skipped || [],
      dialogues: { voicing: 'single voice (narrator, the main voice) until John casts the speakers', pieces: dialoguePieces() },
      placements: fmt(estimate(job.placements)),
      billable: { ...fmt(job.billable), note: 'unique (model, voice, text); the rest are copies of bytes already bought' },
      owedNow: { ...fmt(remaining.estimate), note: 'billable renders with no proven bytes on disk yet' },
      batch: 'not implemented: this job makes Standard generateContent calls; the Batch API is a separate path',
      subsets,
      jobDigest: job.digest,
      authorization: {
        file: authorizationFile,
        state: authorization({ file: authorizationFile, head: state.head, dirty: state.dirty,
          estimateUsd: remaining.estimate.standard, digest: job.digest }),
        fields: { authorized: true, by: 'lead', head_sha: state.head, max_usd: '(the lead’s cap, at least the owed estimate)',
          john_words: '(John’s words that release the spend)', time: '(ISO time)', job_digest: `${job.digest} (optional; binds the corpus and scope too)` },
      },
    }, null, 2));
    return 0;
  }

  let ledgerFile = resolve(arg('ledger', ledgerPathFor(job.model)));
  let maxUsd = null;
  if (mock) {
    // a mock run writes tones; it may never write them where a real run or the app could take them
    // for recordings, so it needs its own root outside the repository and keeps its ledger there
    if (!process.argv.includes('--root') || inside(realpathSyncSafe(root), realpathSync(repo))) {
      console.error('--mock needs --root <a directory outside the repository>: tones never enter the app tree');
      return 2;
    }
    ledgerFile = join(root, '.mock-ledger.json');
  } else {
    if (!rate) { console.error(`REFUSING TO SPEND: no published rate recorded for ${job.model}.`); return 3; }
    const state = checkoutState();
    const remaining = owed(job, { root, ledgerFile });
    const go = authorization({ file: authorizationFile, head: state.head, dirty: state.dirty,
      estimateUsd: remaining.estimate.standard, digest: job.digest });
    if (!go.given) {
      console.error(`REFUSING TO SPEND: the lead's authorization does not release this job.\n  ${go.problems.join('\n  ')}\n`
        + `Dry run says: ${remaining.renders.length} renders owed, ~$${remaining.estimate.standard.toFixed(2)} standard.`);
      return 3;
    }
    if (!flag('confirm')) {
      console.error(`Authorization ${go.file} releases this job, but --confirm was not given, so nothing was bought.`);
      return 4;
    }
    maxUsd = go.maxUsd;
  }
  const asrModel = arg('asr', mock ? 'off' : 'small');
  const asr = asrModel === 'off' ? null : startAsr(asrModel);
  try {
    const result = await run({ plan: job, root, ledgerFile, mock, pace: Number(arg('pace', '600')),
      limit: Number(arg('render-limit', '0')) || 0, asr, maxUsd });
    console.log(JSON.stringify({ rendered: result.rendered, reused: result.reused, placed: result.placed,
      rejected: result.rejected.length, failed: result.failed.length, stopped: result.stopped, mock, asr: asrModel,
      spentEstimateUsd: +result.spentEstimateUsd.toFixed(2), maxUsd, ledgerFile,
      next: 'node tools/build-voice-manifest.mjs --write && node tools/build-listening-cues.mjs --write' }, null, 2));
    if (result.stopped) return 6;
    return result.failed.length || result.rejected.length ? 5 : 0;
  } finally { asr?.close(); }
}
function realpathSyncSafe(path) { try { return realpathSync(path); } catch { return resolve(path); } }

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
