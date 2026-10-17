#!/usr/bin/env node
/** The gate that makes a silent build impossible to ship green.
 *
 * Seventeen days of silence survived a green battery because the generator and the validator
 * disagreed and nothing compared them: the listening builder wrote `voice:'ami'` while the
 * runtime admitted only the locked roster, so every cue it produced was unplayable BY
 * CONSTRUCTION, and both sides passed their own tests. This verifier is the comparison.
 *
 * It checks, with no browser and no network:
 *   1. the lock parses and is internally consistent;
 *   2. corridor.js's mirror is byte-identical to the lock (one value, one place);
 *   3. no source file outside the lock names a TTS model or a withdrawn voice;
 *   4. the shipped manifests agree with the clips actually on disk, lane by lane;
 *   5. every clip a manifest names exists, with the bytes and digest it claims;
 *   6. every clip's voice is admissible for its own declared role;
 *   7. the listening cues the generator emits are exactly the cues the runtime would admit.
 *
 * Exit 0 green, 1 red. Receipt on stdout.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readVoiceLock, runtimeLock, voiceForRole } from './voice-lock.mjs';
import { currentBlock, lockBlock } from './sync-voice-lock.mjs';
import { buildListeningCues } from './build-listening-cues.mjs';
import { checkManifests, NARRATION_FILE, WORDS_FILE } from './build-voice-manifest.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(resolve(corridor, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Files that may carry a model id: the lock itself, and generated data that must state the
 * model each clip was made from. Everything else naming a model is a second source of truth. */
const MODEL_ALLOWED = /^(?:audio\/voice-lock\.json|audio\/[a-z-]+\.json)$/u;
const SOURCE_SCOPE = ['corridor.js', 'index.html'];
const MODEL_PATTERN = /gemini-[0-9][A-Za-z0-9.-]*tts[A-Za-z0-9.-]*/gu;

export function checkLock() {
  const problems = [];
  const lock = readVoiceLock();                       // throws on a malformed lock: fatal by design
  const runtime = runtimeLock(lock);

  // 2 — the mirror
  const present = currentBlock(read('corridor.js'));
  if (present === null) problems.push('corridor.js carries no VOICE_LOCK block');
  else if (present !== lockBlock(runtime))
    problems.push('corridor.js mirror differs from audio/voice-lock.json; run tools/sync-voice-lock.mjs --write');

  // 3 — one place names the model, and no withdrawn voice is named as a value anywhere in source
  for (const file of SOURCE_SCOPE) {
    const text = read(file);
    const generated = currentBlock(text) || '';
    for (const hit of text.match(MODEL_PATTERN) || []) {
      if (generated.includes(hit)) continue;          // inside the generated mirror: that is the lock
      if (MODEL_ALLOWED.test(file)) continue;
      problems.push(`${file} names the model "${hit}" outside the lock`);
    }
    for (const withdrawn of lock.rejected || []) {
      const asValue = new RegExp(`['"\`]${withdrawn}['"\`]`, 'u');
      if (asValue.test(text)) problems.push(`${file} still carries the withdrawn voice '${withdrawn}' as a value`);
    }
  }

  // 4 — the manifests against the disk, lane by lane
  const lanes = checkManifests({ lock: runtime });
  problems.push(...lanes.problems);

  // 5 + 6 — every clip a manifest names exists and is admissible for its own role
  const clips = [];
  const narration = (() => { try { return json(NARRATION_FILE); } catch { return null; } })();
  if (narration?.v === 2) {
    if (narration.lock?.model !== runtime.model) problems.push(`${NARRATION_FILE} names another model`);
    for (const [id, article] of Object.entries(narration.articles || {}))
      for (const clip of article.clips || []) clips.push({ where: `${NARRATION_FILE} ${id}`, clip });
  }
  const words = (() => { try { return json(WORDS_FILE); } catch { return null; } })();
  if (words?.v === 2) {
    if (words.lock?.model !== runtime.model) problems.push(`${WORDS_FILE} names another model`);
    for (const [key, entry] of Object.entries(words.words || {})) {
      clips.push({ where: `${WORDS_FILE} ${key}`, clip: entry });
      const [surface, reading] = key.split('|');
      if (!surface || !reading) problems.push(`${WORDS_FILE} key "${key}" is not (surface, reading)`);
      else if (entry.surface !== surface || entry.reading !== reading)
        problems.push(`${WORDS_FILE} key "${key}" disagrees with its own entry`);
    }
  }
  for (const { where, clip } of clips) {
    const role = clip.speakerRole || 'narrator';
    if (clip.voice !== voiceForRole(role, runtime))
      problems.push(`${where}: voice '${clip.voice}' is not admissible for role '${role}'`);
    if (clip.model && clip.model !== runtime.model) problems.push(`${where}: clip names another model`);
    const file = resolve(corridor, clip.src || '');
    if (!clip.src || !existsSync(file)) { problems.push(`${where}: names a missing clip ${clip.src}`); continue; }
    const bytes = readFileSync(file);
    if (clip.bytes && statSync(file).size !== clip.bytes) problems.push(`${where}: byte length changed`);
    if (clip.sha256 && sha256(bytes) !== clip.sha256) problems.push(`${where}: digest changed`);
  }

  // 7 — the generator and the validator, compared at last. Every cue the builder emits must be
  // one the runtime would admit, by the runtime's own rule, read from its source.
  const runtimeRule = (() => {
    const source = read('corridor.js');
    const at = source.indexOf('const approvedSentenceCue');
    return source.slice(at, source.indexOf('\n', source.indexOf('cue.path.startsWith', at)));
  })();
  const admits = (cue) => Object.hasOwn(runtime.voices, cue.voice)
    && typeof cue.path === 'string' && cue.path.startsWith(`audio/s/${cue.voice}/`);
  if (!runtimeRule.includes('Object.hasOwn(NARRATION_VOICES, cue.voice)') || !runtimeRule.includes('audio/s/'))
    problems.push('the runtime cue rule moved; this verifier no longer mirrors it');
  const built = buildListeningCues(corridor, runtime);
  let cueCount = 0;
  for (const [id, passage] of Object.entries(built.passages || {}))
    for (const sentence of passage.sentences || []) {
      cueCount += 1;
      if (!admits(sentence.cue)) problems.push(`the builder emits a cue the runtime refuses: ${id} #${sentence.cue.sentenceIndex}`);
      if (sentence.cue.voice !== voiceForRole(sentence.cue.speakerRole || 'example', runtime))
        problems.push(`cue ${id} #${sentence.cue.sentenceIndex}: voice disagrees with its role`);
    }

  return {
    model: runtime.model, main: runtime.main, second: runtime.second,
    approvedWords: lanes.approvedWords, narratedArticles: lanes.narratedArticles,
    clipsChecked: clips.length, cuesChecked: cueCount, clipsOwed: lanes.clipsOwed,
    problems,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let report;
  try { report = checkLock(); }
  catch (error) { console.error(JSON.stringify({ verdict: 'red', fatal: String(error.message) }, null, 2)); process.exit(1); }
  console.log(JSON.stringify({ verdict: report.problems.length ? 'red' : 'green', ...report }, null, 2));
  process.exit(report.problems.length ? 1 : 0);
}
