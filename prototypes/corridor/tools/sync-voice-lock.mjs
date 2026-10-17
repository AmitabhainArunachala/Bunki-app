#!/usr/bin/env node
/** Carry audio/voice-lock.json into corridor.js's runtime mirror, so the browser needs no fetch
 * and the two can never drift. `--check` is a gate (exit 1 on drift, naming the one command to
 * run); `--write` performs the swap. Swapping the voice is therefore: edit the JSON, run --write,
 * re-render. Nothing else in the tree names a model or a voice. */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeLock } from './voice-lock.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = resolve(corridor, 'corridor.js');
const OPEN = '/* === VOICE_LOCK · generated from audio/voice-lock.json by tools/sync-voice-lock.mjs — do not hand-edit === */';
const CLOSE = '/* === end VOICE_LOCK === */';

export function lockBlock(lock = runtimeLock()) {
  return `${OPEN}\nconst VOICE_LOCK = ${JSON.stringify(lock, null, 2).replace(/\n/g, '\n')};\n${CLOSE}`;
}

export function currentBlock(source = readFileSync(TARGET, 'utf8')) {
  const from = source.indexOf(OPEN);
  const to = source.indexOf(CLOSE, from);
  if (from < 0 || to < 0) return null;
  return source.slice(from, to + CLOSE.length);
}

/** The CLI runs only when this file IS the command: the verifier imports the two functions
 * above, and an import must never exit the importer. */
function main() {
  const mode = process.argv[2];
  if (!['--check', '--write'].includes(mode)) {
    console.error('Usage: sync-voice-lock.mjs --check | --write');
    return 2;
  }
  const source = readFileSync(TARGET, 'utf8');
  const present = currentBlock(source);
  const wanted = lockBlock();
  if (present === null) {
    console.error(`sync-voice-lock: no VOICE_LOCK block in corridor.js. Insert:\n${wanted}`);
    return 1;
  }
  if (present === wanted) {
    console.log(JSON.stringify({ ok: true, model: runtimeLock().model, main: runtimeLock().main, second: runtimeLock().second }));
    return 0;
  }
  if (mode === '--check') {
    console.error('sync-voice-lock: corridor.js mirror differs from audio/voice-lock.json.\n'
      + 'Run: node prototypes/corridor/tools/sync-voice-lock.mjs --write');
    return 1;
  }
  writeFileSync(TARGET, source.replace(present, wanted));
  console.log(JSON.stringify({ written: true, model: runtimeLock().model }));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
