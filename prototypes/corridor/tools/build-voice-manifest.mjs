#!/usr/bin/env node
/** Write the v2 manifests from what is actually on disk, to the lock. Never from a wish.
 *
 * v1 carried ONE global voice and keyed words by SPELLING. Both are fatal for this app: a global
 * voice makes a dialogue's second speaker unreachable, and a spelling cannot choose between
 * 年 ねん and 年 とし, so the card R worked to make say ねん would be spoken とし. v2 therefore keys
 * every word clip by (surface, reading) and gives every clip its own voice, role and model.
 *
 * This tool never invents an entry: a clip appears in the manifest only when its file exists AND
 * its provenance says it is this model's recording of this text in this voice — the render
 * ledger's row for exactly those bytes, or the shipped manifest's own record of them. A file with
 * neither is never stamped with the lock's model: that is how a swapped model, a mock tone or a
 * stray file would otherwise be relabelled as an approved clip. Such files are reported, and
 * --check goes red on them. With nothing rendered it writes an honest empty v2 — which the
 * runtime reads as "no approved clips", the visible pending state, never silence pretending to be
 * sound.
 *
 *   node tools/build-voice-manifest.mjs --dry-run   # counts only, writes nothing
 *   node tools/build-voice-manifest.mjs --write     # rewrite the two manifests
 *   node tools/build-voice-manifest.mjs --check     # exit 1 if the files disagree with the disk
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeLock } from './voice-lock.mjs';
import { ledgerPathFor, plan, provenanceOf, readLedger, shippedVouchers } from './render-corpus.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const WORDS_FILE = 'audio/manifest.json';
export const NARRATION_FILE = 'audio/article-narration.json';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const secondsOf = (file) => {
  try {
    return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim()) || 0;
  } catch { return 0; }
};

/** Every placement the plan asks for, split into the ones that exist and the ones still owed. */
export function survey({ root = corridor, lock = runtimeLock() } = {}) {
  const job = plan({ lock });
  const have = [], want = [];
  for (const item of job.placements) (existsSync(resolve(root, item.path)) ? have : want).push(item);
  return { job, have, want };
}

/** The two v2 manifests, as values. Writing them is a separate, explicit step. */
export function buildManifests({ root = corridor, lock = runtimeLock(), ledgerFile = ledgerPathFor(lock.model) } = {}) {
  const { job, have, want } = survey({ root, lock });
  const ledger = readLedger(ledgerFile, lock.model);
  const vouchers = shippedVouchers(root);
  const rows = new Map(job.renders.map((row) => [row.id, row]));
  // only the two lanes this tool writes; the listening lane's copies are checked by verify-voice-lock
  const unproven = [];
  const proven = have.filter((item) => {
    if (item.role !== 'word' && item.role !== 'narrator') return false;
    const provenance = provenanceOf(root, item.path, rows.get(item.renderId), ledger, vouchers);
    if (!provenance || provenance.model !== lock.model) { unproven.push(item.path); return false; }
    return true;
  });
  const stamp = (item) => {
    const file = resolve(root, item.path);
    const bytes = readFileSync(file);
    return { src: item.path, voice: item.voice, speakerRole: item.role, model: lock.model,
      seconds: +secondsOf(file).toFixed(3), sha256: sha256(bytes), bytes: statSync(file).size };
  };

  // words — keyed by surface AND the reading the learner is shown; entrySeq rides as identity
  const words = {};
  for (const item of proven.filter((i) => i.role === 'word')) {
    words[`${item.surface}|${item.reading}`] = { surface: item.surface, reading: item.reading,
      ...(item.entrySeq ? { entrySeq: item.entrySeq } : {}), ...stamp(item) };
  }
  // narration — per clip, in the shelf's own sentence order
  const articles = {};
  for (const item of proven.filter((i) => i.role === 'narrator').sort((a, b) => a.index - b.index)) {
    (articles[item.articleId] ||= { clips: [] }).clips.push({ text: item.spoken, ...stamp(item) });
  }

  const legacy = (() => { try { return JSON.parse(readFileSync(resolve(root, WORDS_FILE), 'utf8')); } catch { return {}; } })();
  return {
    words: {
      v: 2, lock: { model: lock.model, main: lock.main, second: lock.second },
      // the licence block and the sentence index belong to the v1 asset and they stay: other
      // tools read them, and no shipped data may be dropped by a format change
      voices: legacy.voices || {}, sentences: legacy.sentences || {},
      words,
      // the spelling-keyed v1 map is kept under its own name, so nothing is lost and nothing
      // resolves through it: the runtime reads `words` only
      legacyWords: legacy.v === 2 ? legacy.legacyWords || {} : legacy.words || {},
    },
    narration: { v: 2, lock: { model: lock.model, main: lock.main, second: lock.second }, articles },
    owed: want.length,
    unproven,
  };
}

export function checkManifests({ root = corridor, lock = runtimeLock() } = {}) {
  const built = buildManifests({ root, lock });
  const approved = Object.keys(built.words.words).length;
  const narrated = Object.keys(built.narration.articles).length;
  const problems = [];
  if (built.unproven.length) problems.push(`${built.unproven.length} clip(s) on disk carry no provenance for ${lock.model} `
    + `(e.g. ${built.unproven[0]}); render them through tools/render-corpus.mjs or remove them`);
  // each lane answers for its own clips: the word file for word clips, the narration file for
  // narration clips. A v1 file is legal only while ITS lane has nothing rendered; the moment a
  // clip exists, leaving the manifest at v1 is a false silence, and that is the whole bug.
  for (const [file, wanted, owns, optional] of [
    [WORDS_FILE, built.words, approved, false],
    [NARRATION_FILE, built.narration, narrated, true],
  ]) {
    let current = null;
    try { current = JSON.parse(readFileSync(resolve(root, file), 'utf8')); } catch { /* absent */ }
    if (!current) { if (!optional) problems.push(`${file} is unreadable`); continue; }
    if (current.v === 2 && JSON.stringify(current) !== JSON.stringify(wanted))
      problems.push(`${file} disagrees with the clips on disk; run --write`);
    if (current.v !== 2 && owns)
      problems.push(`${file} is still v1 while ${owns} approved clip(s) exist on disk; run --write`);
  }
  return { problems, approvedWords: approved, narratedArticles: narrated, clipsOwed: built.owed, unproven: built.unproven.length };
}

function main() {
  const flag = (n) => process.argv.includes(`--${n}`);
  const lock = runtimeLock();
  if (flag('check')) {
    const result = checkManifests({ lock });
    console.log(JSON.stringify({ check: result.problems.length ? 'red' : 'green', model: lock.model, ...result }, null, 2));
    return result.problems.length ? 1 : 0;
  }
  const built = buildManifests({ lock });
  const summary = { model: lock.model,
    approvedWords: Object.keys(built.words.words).length,
    legacyWords: Object.keys(built.words.legacyWords).length,
    narratedArticles: Object.keys(built.narration.articles).length,
    clipsOwed: built.owed, unproven: built.unproven.length };
  if (flag('write')) {
    // --only narration|words keeps a lane that has nothing to say from rewriting a shipped asset
    const at = process.argv.indexOf('--only');
    const only = at >= 0 ? process.argv[at + 1] : null;
    const written = [];
    if (only !== 'narration') {
      writeFileSync(resolve(corridor, WORDS_FILE), `${JSON.stringify(built.words, null, 2)}\n`);
      written.push(WORDS_FILE);
    }
    if (only !== 'words') {
      writeFileSync(resolve(corridor, NARRATION_FILE), `${JSON.stringify(built.narration, null, 2)}\n`);
      written.push(NARRATION_FILE);
    }
    console.log(JSON.stringify({ written, ...summary }, null, 2));
    return 0;
  }
  console.log(JSON.stringify({ dryRun: true, ...summary }, null, 2));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
