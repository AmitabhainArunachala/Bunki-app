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
 *   7. the listening cues the generator emits are admitted by BOTH validators a cue meets on its
 *      way to the ear, each executed rather than mirrored: the runtime's own approvedSentenceCue,
 *      evaluated from corridor.js, and the domain contract's parseSourceListeningCue, built the
 *      way the site builds it. The shipped catalog holds no cue until the render, so the same
 *      comparison also runs on a staged copy where every clip the render will place exists:
 *      the check bites today, before any spend, and the validators must still refuse a cue in
 *      the second voice, in a withdrawn voice, from another model and from another voice's folder.
 *
 * `--require-complete` adds coverage (PREP R3): red while any clip the plan owes is missing. It
 * is the after-render gate; the battery runs without it, because before the render that red is
 * the known state, not a regression.
 *
 * Exit 0 green, 1 red. Receipt on stdout.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { readVoiceLock, runtimeLock, voiceForRole } from './voice-lock.mjs';
import { currentBlock, lockBlock } from './sync-voice-lock.mjs';
import { buildListeningCues, listeningSentences } from './build-listening-cues.mjs';
import { checkManifests, NARRATION_FILE, WORDS_FILE } from './build-voice-manifest.mjs';
import { buildCorridorModules, LEARNING_MODULE_PATH } from '../../../scripts/build-reading-module.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// KAIRO_CORRIDOR_SOURCE points the corridor.js checks at a mutant (tools/adjudicate-voice-mutants.mjs);
// unset, which is every real run, it is the shipped file
const read = (file) => readFileSync(file === 'corridor.js' && process.env.KAIRO_CORRIDOR_SOURCE
  ? process.env.KAIRO_CORRIDOR_SOURCE : resolve(corridor, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Files that may carry a model id: the lock itself, and generated data that must state the
 * model each clip was made from. Everything else naming a model is a second source of truth. */
const MODEL_ALLOWED = /^(?:audio\/voice-lock\.json|audio\/[a-z-]+\.json)$/u;
const SOURCE_SCOPE = ['corridor.js', 'index.html'];
const MODEL_PATTERN = /gemini-[0-9][A-Za-z0-9.-]*tts[A-Za-z0-9.-]*/gu;

/** The runtime's cue rule, executed from corridor.js itself: the lock mirror, the roster, the role
 * law and approvedSentenceCue, evaluated together in a bare context. A text mirror of the rule is
 * what let the old verifier agree with a builder the app refused. */
export function runtimeCueRule(source = read('corridor.js')) {
  const slice = (start, end) => {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    if (from < 0 || to < 0) throw new Error(`corridor.js boundary moved: ${start}`);
    return source.slice(from, to);
  };
  return vm.runInNewContext(`${slice('/* === VOICE_LOCK', 'const LISTEN_RATES =')}
${slice('const approvedSentenceCue', 'function currentSentenceListeningCue(')}
approvedSentenceCue;`, {});
}

/** The domain contract's cue parser, compiled exactly as the site build compiles it. */
export async function domainCueParser() {
  const repo = resolve(corridor, '../..');
  const learning = buildCorridorModules(repo).find((module) => module.path === LEARNING_MODULE_PATH);
  const domain = await import(`data:text/javascript;base64,${Buffer.from(learning.bytes).toString('base64')}`);
  return (cue, sourceId) => domain.parseSourceListeningCue(cue, { sourceId, tokenSpan: {} });
}

/** A copy of the corridor's inputs in which every clip the listening lane will own exists as a
 * placeholder, so the generator emits every cue the render will make possible. */
function stagedListeningRoot(runtime) {
  const dir = mkdtempSync(join(tmpdir(), 'voice-lock-cues-'));
  mkdirSync(join(dir, 'audio'), { recursive: true });
  symlinkSync(resolve(corridor, 'data'), join(dir, 'data'));
  copyFileSync(resolve(corridor, 'audio/manifest.json'), join(dir, 'audio/manifest.json'));
  const voice = voiceForRole('example', runtime);
  let placed = 0;
  for (const passage of listeningSentences(corridor)) {
    if (!passage.eligible) continue;
    passage.ranges.forEach((_, index) => {
      const file = join(dir, `audio/s/${voice}/${passage.row.id.replaceAll(':', '_')}-${String(index).padStart(3, '0')}.m4a`);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `placeholder ${passage.row.id} ${index}`);
      placed += 1;
    });
  }
  return { dir, placed };
}

export async function checkLock({ requireComplete = false } = {}) {
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
    // as the runtime reads it: identity is stated, never defaulted, and one refused clip refuses
    // the whole narration manifest, so a missing role or model here is a silent build
    const role = clip.speakerRole;
    if (typeof role !== 'string') problems.push(`${where}: clip states no speakerRole`);
    else if (clip.voice !== voiceForRole(role, runtime))
      problems.push(`${where}: voice '${clip.voice}' is not admissible for role '${role}'`);
    if (clip.model !== runtime.model) problems.push(`${where}: clip names ${clip.model ? 'another model' : 'no model'}`);
    const file = resolve(corridor, clip.src || '');
    if (!clip.src || !existsSync(file)) { problems.push(`${where}: names a missing clip ${clip.src}`); continue; }
    const bytes = readFileSync(file);
    if (clip.bytes && statSync(file).size !== clip.bytes) problems.push(`${where}: byte length changed`);
    if (clip.sha256 && sha256(bytes) !== clip.sha256) problems.push(`${where}: digest changed`);
  }

  // 7 — the generator against both validators, executed. Every cue the builder emits must be
  // admitted by the runtime's rule and by the domain contract; and the two must still refuse the
  // cues the lock forbids, or a green here would prove nothing.
  const admits = runtimeCueRule();
  const parses = await domainCueParser();
  const judge = (catalog, where) => {
    let count = 0;
    for (const [id, passage] of Object.entries(catalog.passages || {}))
      for (const sentence of passage.sentences || []) {
        count += 1;
        const cue = sentence.cue;
        if (!admits(cue)) problems.push(`${where}: the runtime refuses a cue the builder emits: ${id} #${cue.sentenceIndex}`);
        try { parses(cue, id); } catch (error) {
          problems.push(`${where}: the domain contract refuses a cue the builder emits: ${id} #${cue.sentenceIndex} (${error.message.slice(0, 80)})`);
        }
        if (cue.voice !== voiceForRole(cue.speakerRole || 'example', runtime))
          problems.push(`${where}: cue ${id} #${cue.sentenceIndex}: voice disagrees with its role`);
      }
    return count;
  };
  const cueCount = judge(buildListeningCues(corridor, runtime), 'shipped');
  const staged = stagedListeningRoot(runtime);
  let stagedCues = 0;
  try {
    const catalog = buildListeningCues(staged.dir, runtime);
    stagedCues = judge(catalog, 'staged');
    if (stagedCues !== staged.placed) problems.push(`staged: ${staged.placed} clips placed but ${stagedCues} cues emitted`);
    if (!stagedCues) problems.push('staged: the builder emitted no cue, so the comparison proved nothing');
    const [id, passage] = Object.entries(catalog.passages)[0] || [];
    const cue = passage?.sentences?.[0]?.cue;
    if (cue) {
      const moved = (voice) => ({ ...cue, voice, path: cue.path.replace(`audio/s/${cue.voice}/`, `audio/s/${voice}/`) });
      for (const [name, forbidden] of [
        ['the second voice on a single-speaker sentence', moved(runtime.second)],
        ['a withdrawn voice', moved((lock.rejected || [])[0] || 'ami')],
        ['another model', { ...cue, model: `${runtime.model}-other` }],
        ['no model at all', (({ model, ...rest }) => rest)(cue)],
      ]) if (admits(forbidden)) problems.push(`control: the runtime admits ${name}`);
      let refused = false;
      try { parses({ ...cue, path: cue.path.replace(`audio/s/${cue.voice}/`, 'audio/s/another-voice/') }, id); } catch { refused = true; }
      if (!refused) problems.push('control: the domain contract admits a clip in another voice\u2019s folder');
    }
  } finally { rmSync(staged.dir, { recursive: true, force: true }); }

  // coverage (PREP R3), on request: every clip the plan owes must exist
  if (requireComplete && lanes.clipsOwed > 0) problems.push(`coverage: ${lanes.clipsOwed} clip(s) the plan owes are not on disk`);

  return {
    model: runtime.model, main: runtime.main, second: runtime.second,
    approvedWords: lanes.approvedWords, narratedArticles: lanes.narratedArticles,
    clipsChecked: clips.length, cuesChecked: cueCount, stagedCuesChecked: stagedCues, clipsOwed: lanes.clipsOwed,
    coverageRequired: requireComplete,
    problems,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // exitCode, never exit(): a red receipt is long, and exit() cuts a piped stdout mid-write
  let report = null;
  try { report = await checkLock({ requireComplete: process.argv.includes('--require-complete') }); }
  catch (error) { console.error(JSON.stringify({ verdict: 'red', fatal: String(error.message) }, null, 2)); process.exitCode = 1; }
  if (report) {
    console.log(JSON.stringify({ verdict: report.problems.length ? 'red' : 'green', ...report }, null, 2));
    process.exitCode = report.problems.length ? 1 : 0;
  }
}
