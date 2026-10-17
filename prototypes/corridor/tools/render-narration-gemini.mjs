#!/usr/bin/env node
/** Render one article's narration in the locked voice (Google Gemini TTS: Kore reads, Charon is the
 * second speaker; operator's blind audition 2026-09-29) and write what the reader's play bar expects:
 *   audio/article-narration.json          { v: 1, voice, articles: { <id>: { clips: [{ text, src }] } } }
 *   audio/narration/<voice>/<id ':'→'_'>-NNN.m4a   AAC mono 24 kHz, one clip per sentence unit
 * Sentence units are the shelf's own (build-listening-cues.mjs): paragraph by paragraph,
 * text.match(/[^。！？]+[。！？]?/gu), trimmed; their compacted join equals the article text, which is
 * what playNarratedExcerpt's substring match relies on. The clip text is the article text verbatim.
 * Only the spoken transcript drops a bare-hiragana reading gloss such as 内閣（ないかく）, so the
 * voice does not read the kanji twice; --speak-readings keeps it.
 * The key is GEMINI_API_KEY from ~/.dharma/agent_keys.env (or the environment), read here and never
 * printed. A rejected key (401/403, invalid key, billing, a per-day quota) stops the run with the
 * API's exact error text; a per-minute 429 waits out the server's own retryDelay (the free tier allows
 * 3 requests a minute for this model) and asks again. --resume keeps clips already rendered for the
 * same text instead of buying them twice.
 * Spend guard: one article per run; every request is logged with its character count and model.
 * Audio format follows ai.google.dev/gemini-api/docs/speech-generation (read 2026-10-15): unary
 * audio is WAV or raw 16-bit PCM, 24 kHz, mono. The model id is NOT written here — it is the
 * lock's (audio/voice-lock.json), so a swap is one value and this file never contradicts it.
 *
 *   node prototypes/corridor/tools/render-narration-gemini.mjs --article jawiki:5294446 \
 *        --log-dir ~/.dharma/bunki_voice/kore-probe-20261015 [--voice <lock roster>] [--model <lock>]
 *        [--api generate|interactions] [--bitrate 64k] [--speak-readings] [--resume] [--pace 21] [--dry-run] */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeLock } from './voice-lock.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// V (2026-10-17): the roster and the model come from audio/voice-lock.json. Swapping the voice is
// one edit there plus `sync-voice-lock.mjs --write` plus a re-render — no literal lives here.
const LOCK = runtimeLock();
const VOICES = LOCK.voices;
const DEFAULT_MODEL = LOCK.model;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
const CLIP_PATH = new RegExp(`^audio/narration/(?:${Object.keys(VOICES).join('|')})/[a-zA-Z0-9_-]+\\.m4a$`, 'u');

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && process.argv[at + 1] !== undefined ? process.argv[at + 1] : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const articleId = arg('article', null);
const voice = arg('voice', LOCK.main);
const model = arg('model', DEFAULT_MODEL);
const api = arg('api', 'generate');
const bitrate = arg('bitrate', '64k');
const logDir = resolve(arg('log-dir', join(homedir(), '.dharma', 'bunki_voice', `narration-${new Date().toISOString().slice(0, 10)}`)));
if (!articleId || !Object.hasOwn(VOICES, voice) || !['generate', 'interactions'].includes(api)) {
  console.error('Usage: render-narration-gemini.mjs --article <id> [--voice kore|charon] [--api generate|interactions] [--log-dir <dir>]');
  process.exit(2);
}
const voiceName = VOICES[voice];
mkdirSync(join(logDir, 'raw'), { recursive: true });

/** The key is read from the env file and handed to fetch; nothing here ever prints or logs it. */
function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const file = join(homedir(), '.dharma', 'agent_keys.env');
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.*?)\s*$/u.exec(line);
    if (!match) continue;
    let value = match[1];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value) return value;
  }
  throw new Error('GEMINI_API_KEY not found in ~/.dharma/agent_keys.env');
}

const compact = (text) => text.replace(/\s+/gu, '');
/** The shelf's sentence units, paragraph by paragraph. */
export function sentenceUnits(text) {
  return String(text || '').split(/\n+/u)
    .flatMap((paragraph) => paragraph.match(/[^。！？]+[。！？]?/gu) || [])
    .map((sentence) => sentence.trim()).filter(Boolean);
}
/** What the voice is handed: the sentence minus a bare-hiragana reading gloss in full-width parentheses. */
export const spokenForm = (sentence, speakReadings = false) =>
  speakReadings ? sentence : sentence.replace(/（[ぁ-ゖー]+）/gu, '');

function readArticle(id) {
  const index = JSON.parse(readFileSync(join(corridor, 'data/articles/index.json'), 'utf8'));
  const row = index.articles.find((entry) => entry.id === id);
  if (!row) throw new Error(`article ${id} is not in data/articles/index.json`);
  const article = JSON.parse(readFileSync(join(corridor, 'data/articles', row.file), 'utf8'));
  if (typeof article.text !== 'string' || !article.text.trim()) throw new Error(`article ${id} has no text`);
  return { row, article };
}

const redact = (text, key) => (key ? String(text).split(key).join('[redacted]') : String(text));
const fatalStatus = (status, body) => status === 401 || status === 403 ||
  /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/iu.test(body) || (status === 400 && /billing/iu.test(body));
/** A per-minute quota answer carries RetryInfo; a per-day one is the day's end and stops the run. */
function retryAfter(status, body) {
  if (status !== 429 || /PerDay/u.test(body)) return null;
  const seconds = Number(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/u.exec(body)?.[1] ?? /retry in (\d+(?:\.\d+)?)s/iu.exec(body)?.[1] ?? 20);
  return Math.min(70, Math.ceil(seconds) + 1);
}
const sleep = (seconds) => new Promise((wake) => setTimeout(wake, seconds * 1000));

async function post(key, path, body) {
  const response = await fetch(`${ENDPOINT}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, text };
}

/** generateContent: the request shape the operator specified; audio arrives as inlineData. */
async function viaGenerateContent(key, text) {
  const result = await post(key, `/models/${model}:generateContent`, {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } } },
  });
  if (!result.ok) return result;
  const json = JSON.parse(result.text);
  const part = json.candidates?.[0]?.content?.parts?.find((candidate) => candidate.inlineData?.data);
  if (!part) return { ...result, ok: false, text: `no inlineData audio in response: ${result.text.slice(0, 800)}` };
  return { ...result, mimeType: part.inlineData.mimeType || '', bytes: Buffer.from(part.inlineData.data, 'base64'), usage: json.usageMetadata || null };
}

/** Interactions API: the shape the speech docs document today (unary audio is a complete WAV). */
async function viaInteractions(key, text) {
  const result = await post(key, '/interactions', {
    model,
    input: [{ type: 'user_input', content: [{ type: 'text', text }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: voiceName }] },
  });
  if (!result.ok) return result;
  const json = JSON.parse(result.text);
  const blocks = (json.steps || []).filter((step) => step.type === 'model_output')
    .flatMap((step) => step.content || []).filter((block) => block.type === 'audio' && block.data);
  const last = blocks.at(-1);
  if (!last) return { ...result, ok: false, text: `no audio block in response: ${result.text.slice(0, 800)}` };
  return { ...result, mimeType: last.mime_type || last.mimeType || 'audio/wav', bytes: Buffer.from(last.data, 'base64'), usage: json.usage || null };
}

/** PCM (raw or RIFF) or any other container ffmpeg can read → AAC mono 24 kHz .m4a. */
function encodeClip(bytes, mimeType, rawBase, outFile) {
  const riff = bytes.length > 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF';
  const rawPcm = !riff && /l16|pcm/iu.test(mimeType);
  const rate = Number(/rate=(\d+)/u.exec(mimeType)?.[1] || 24000);
  const rawFile = `${rawBase}.${riff ? 'wav' : rawPcm ? 'pcm' : 'bin'}`;
  writeFileSync(rawFile, bytes);
  const input = rawPcm ? ['-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', rawFile] : ['-i', rawFile];
  const encode = (encoder) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...input,
    '-ac', '1', '-ar', '24000', '-c:a', encoder, '-b:a', bitrate, '-movflags', '+faststart', outFile], { stdio: ['ignore', 'pipe', 'pipe'] });
  let encoder = 'aac_at';
  try { encode(encoder); } catch { encoder = 'aac'; encode(encoder); }
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outFile], { encoding: 'utf8' }).trim());
  return { rawFile, encoder, rate: riff ? null : rate, seconds };
}

function writeManifest(id, clips) {
  const file = join(corridor, 'audio', 'article-narration.json');
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const manifest = existing && existing.v === 1 && existing.voice === voice && existing.articles && typeof existing.articles === 'object'
    ? existing : { v: 1, voice, articles: {} };
  manifest.articles[id] = { clips };
  for (const article of Object.values(manifest.articles)) {
    for (const clip of article.clips) {
      if (typeof clip.text !== 'string' || !clip.text.trim() || !CLIP_PATH.test(clip.src)) throw new Error(`manifest clip rejected: ${JSON.stringify(clip)}`);
      if (!existsSync(join(corridor, clip.src))) throw new Error(`manifest names a missing clip: ${clip.src}`);
    }
  }
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return file;
}

const { row, article } = readArticle(articleId);
const units = sentenceUnits(article.text);
if (compact(units.join('')) !== compact(article.text)) throw new Error('sentence units do not re-join to the article text');
const stem = articleId.replaceAll(':', '_');
if (!/^[a-zA-Z0-9_-]+$/u.test(stem)) throw new Error(`article id ${articleId} cannot name a clip file`);
const clipDir = join(corridor, 'audio', 'narration', voice);
mkdirSync(clipDir, { recursive: true });

const logFile = join(logDir, 'render-log.json');
const previous = existsSync(logFile) ? JSON.parse(readFileSync(logFile, 'utf8')) : null;
if (previous && !flag('dry-run')) copyFileSync(logFile, join(logDir, `render-log.prev-${previous.renderedAt?.replace(/[:.]/gu, '-') || Date.now()}.json`));
const pace = Number(arg('pace', '0')) || 0;
const log = {
  renderedAt: new Date().toISOString(), articleId, title: row.title, source: row.source, licence: row.licence,
  voice, voiceName, model, api, bitrate, pace, speakReadings: flag('speak-readings'), resume: flag('resume'), dryRun: flag('dry-run'),
  units: units.length, charsInArticle: article.text.length, charsSent: 0, requests: 0, reused: 0, waits: [], totalSeconds: 0, clips: [],
};
const writeLog = () => writeFileSync(logFile, `${JSON.stringify(log, null, 2)}\n`);
/** --resume: a clip rendered earlier for exactly this text and voice, still on disk, is kept. */
function reusable(index, text, spoken, outFile) {
  if (!flag('resume') || !previous || previous.voice !== voice || !existsSync(outFile)) return null;
  const done = previous.clips?.find((clip) => clip.index === index && clip.text === text && clip.spoken === spoken && clip.seconds > 0);
  return done ? { ...done, reusedFrom: previous.renderedAt } : null;
}

if (flag('dry-run')) {
  log.clips = units.map((text, index) => ({ index, text, spoken: spokenForm(text, log.speakReadings), chars: spokenForm(text, log.speakReadings).length }));
  writeLog();
  console.log(JSON.stringify({ dryRun: true, articleId, title: row.title, units: units.length, log: join(logDir, 'render-log.json') }, null, 2));
  process.exit(0);
}

const key = loadKey();
let useApi = api;
const clips = [];
try {
  for (const [index, text] of units.entries()) {
    const spoken = spokenForm(text, log.speakReadings);
    const name = `${stem}-${String(index).padStart(3, '0')}`;
    const outFile = join(clipDir, `${name}.m4a`);
    const clip = { text, src: `audio/narration/${voice}/${name}.m4a` };
    const kept = reusable(index, text, spoken, outFile);
    if (kept) {
      clips.push(clip);
      log.reused += 1;
      log.totalSeconds += kept.seconds;
      log.clips.push(kept);
      writeLog();
      console.log(`clip ${index + 1}/${units.length} · kept from ${kept.reusedFrom} · ${kept.seconds.toFixed(2)} s`);
      continue;
    }
    const started = Date.now();
    let result = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (pace && log.requests) await sleep(pace);
      log.requests += 1;
      log.charsSent += spoken.length;
      result = await (useApi === 'interactions' ? viaInteractions(key, spoken) : viaGenerateContent(key, spoken));
      if (result.ok) break;
      const body = redact(result.text, key);
      if (fatalStatus(result.status, body)) throw new Error(`Gemini rejected the request (HTTP ${result.status}): ${body}`);
      const wait = retryAfter(result.status, body);
      if (wait !== null) {
        log.waits.push({ clip: index, attempt, seconds: wait, error: body.slice(0, 400) });
        writeLog();
        console.log(`clip ${index + 1}/${units.length} · per-minute quota · waiting ${wait} s as the API asked`);
        await sleep(wait);
        continue;
      }
      // a request-shape refusal on generateContent: switch once to the documented Interactions endpoint
      if (useApi === 'generate' && (result.status === 400 || result.status === 404)) {
        log.fallback = { clip: index, status: result.status, error: body.slice(0, 1200) };
        useApi = 'interactions';
        continue;
      }
      if (result.status >= 500 && attempt < 2) { await sleep(2.5); continue; }
      throw new Error(`Gemini request failed (HTTP ${result.status}): ${body}`);
    }
    if (!result?.ok) throw new Error(`Gemini request failed (HTTP ${result?.status}): ${redact(result?.text, key)}`);
    const encoded = encodeClip(result.bytes, result.mimeType, join(logDir, 'raw', name), outFile);
    clips.push(clip);
    log.totalSeconds += encoded.seconds;
    log.clips.push({ index, text, spoken, chars: spoken.length, api: useApi, mimeType: result.mimeType, rawBytes: result.bytes.length,
      rawFile: encoded.rawFile, encoder: encoded.encoder, seconds: encoded.seconds, m4aBytes: readFileSync(outFile).length,
      usage: result.usage, ms: Date.now() - started, src: clip.src });
    writeLog();
    console.log(`clip ${index + 1}/${units.length} · ${spoken.length} chars · ${encoded.seconds.toFixed(2)} s · ${useApi}`);
  }
  log.manifest = writeManifest(articleId, clips);
  log.apiUsed = useApi;
  writeLog();
  console.log(JSON.stringify({ articleId, title: row.title, model, voice: voiceName, api: useApi, clips: clips.length, reused: log.reused,
    charsSent: log.charsSent, requests: log.requests, waits: log.waits.length, seconds: Number(log.totalSeconds.toFixed(2)), manifest: log.manifest, log: logFile }, null, 2));
} catch (error) {
  log.error = redact(error.message, key);
  writeLog();
  writeFileSync(join(logDir, 'error.txt'), `${log.error}\n`);
  console.error(`STOPPED: ${log.error}`);
  process.exit(1);
}
