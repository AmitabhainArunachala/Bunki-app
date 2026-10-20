#!/usr/bin/env node
/** Hfix-2b · KH1-3 — the drift glosses, cut mid-word.
 *
 * The sky's glosses were hard-clipped at exactly 32 characters by an old extractor, with no
 * ellipsis and no regard for where a word ends: "to take up, to pick up; to confi". The clipped
 * text is not cosmetic — it is the data, so it reaches the 宙 card, Today's list and the screen
 * reader's accessible name, where a sentence that stops mid-word is simply wrong.
 *
 * Two repairs, in this order:
 *   1. CARRY THE WHOLE GLOSS. `data/share_alike/words.json` is the dictionary this app already
 *      ships and reads; for 460 of the 482 clipped rows it holds the complete sense list, so the
 *      gloss is restored outright rather than patched. The share_alike wording is preferred
 *      whenever the drift row is clipped, even when it is shorter ("5th day of the month; five
 *      days" beats "five days; fifth day of the mont"): complete beats long.
 *   2. CUT HONESTLY. For the rows clipped in both sources, fall back to `tidyGloss`: cut at a
 *      sense boundary ("; ") when one fits, else at a word boundary, and say so with "…".
 *      Nothing is invented and nothing is left ending mid-word.
 *
 * Three files carry the same array and must agree: the runtime's `drift-layer.js` WBIG literal,
 * `prototypes/drift/data/wbig.json`, and the `prototypes/drift/drift-artifact.html` copy.
 *
 *   node tools/repair-drift-glosses.mjs --check    # exit 1 if any gloss still ends mid-word
 *   node tools/repair-drift-glosses.mjs --write
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVocabulary, looksClipped, tidyGloss, useVocabulary } from './gloss-text.mjs';

const corridor = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const drift = resolve(corridor, '../drift');
export const WBIG_JSON = resolve(drift, 'data/wbig.json');
export const ARTIFACT = resolve(drift, 'drift-artifact.html');
export const LAYER = resolve(corridor, 'drift-layer.js');
export const WORDS_JSON = resolve(corridor, 'data/share_alike/words.json');
export const DRIFT_WORDS_JSON = resolve(corridor, '../../apps/app/src/data/generated/drift-words.json');

/** The one WBIG literal, on its own line in both the runtime and the artifact. */
const WBIG_RE = /const WBIG=(\[.*\]);/;

const readWords = () => {
  const doc = JSON.parse(readFileSync(WORDS_JSON, 'utf8'));
  return doc.words || doc;
};

/** The oracle, built from this repo's own two gloss corpora. Both are needed: a word the drift
 * rows only ever show in clipped form is still evidence when share_alike spells it out. */
export function installOracle() {
  const wbig = JSON.parse(readFileSync(WBIG_JSON, 'utf8'));
  const words = readWords();
  return useVocabulary(buildVocabulary(
    wbig.map((row) => (Array.isArray(row) ? row[2] : '')),
    Object.values(words).map((rec) => rec?.g || ''),
  ));
}

/** The gloss a row should carry. Returns null when the row is already whole. */
export function repairedGloss(headword, gloss, words) {
  if (!looksClipped(gloss)) return null;
  const full = String(words?.[headword]?.g || '');
  // the dictionary's own wording, whenever it is itself whole — complete beats long
  if (full && !looksClipped(full)) return full;
  // clipped in both: keep only what we can stand behind, and mark the cut
  const honest = tidyGloss(full.length > gloss.length ? full : gloss);
  return honest === gloss ? null : honest;
}

export function repairRows(rows, words) {
  const changes = [];
  const out = rows.map((row) => {
    if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[2] !== 'string') return row;
    const next = repairedGloss(row[0], row[2], words);
    if (next === null) return row;
    changes.push({ word: row[0], from: row[2], to: next });
    const copy = row.slice();
    copy[2] = next;
    return copy;
  });
  return { rows: out, changes };
}

/** Rows still ending mid-word after the repair: the condition the gate forbids. */
export const stillClipped = (rows) =>
  rows.filter((row) => Array.isArray(row) && typeof row[2] === 'string' && looksClipped(row[2]));

function literalOf(file) {
  const text = readFileSync(file, 'utf8');
  const match = WBIG_RE.exec(text);
  if (!match) throw new Error(`WBIG array literal not found in ${file}`);
  return { text, match, rows: JSON.parse(match[1]) };
}

function writeLiteral(file, { text, match }, rows) {
  writeFileSync(file, text.slice(0, match.index) + `const WBIG=${JSON.stringify(rows)};` + text.slice(match.index + match[0].length));
}

function main() {
  const mode = process.argv.includes('--write') ? 'write' : 'check';
  installOracle();
  const words = readWords();
  const report = { mode, files: {}, repaired: 0, remaining: 0, samples: [] };

  const sources = [
    { name: 'drift/data/wbig.json', kind: 'json', file: WBIG_JSON },
    { name: 'corridor/drift-layer.js', kind: 'literal', file: LAYER },
    { name: 'drift/drift-artifact.html', kind: 'literal', file: ARTIFACT },
    // FIXR (a0, lead's ruling 10:4x): the second truncated copy. Same [word, reading, gloss, …] rows;
    // the reference page renders every variant, so a cut variant here shows beside the whole ones.
    { name: 'app/src/data/generated/drift-words.json', kind: 'json', file: DRIFT_WORDS_JSON },
  ];

  for (const source of sources) {
    const loaded = source.kind === 'json'
      ? { rows: JSON.parse(readFileSync(source.file, 'utf8')) }
      : literalOf(source.file);
    const { rows, changes } = repairRows(loaded.rows, words);
    const left = stillClipped(rows);
    report.files[source.name] = { rows: rows.length, repaired: changes.length, stillClipped: left.length };
    report.repaired = Math.max(report.repaired, changes.length);
    report.remaining = Math.max(report.remaining, left.length);
    if (!report.samples.length) report.samples = changes.slice(0, 4);
    if (mode === 'write' && changes.length) {
      if (source.kind === 'json') writeFileSync(source.file, JSON.stringify(rows));
      else writeLiteral(source.file, loaded, rows);
    }
  }

  // the dictionary the runtime reads must not carry a clipped gloss either
  const wordRows = Object.entries(words).filter(([, rec]) => rec && typeof rec.g === 'string');
  const clippedWords = wordRows.filter(([, rec]) => looksClipped(rec.g));
  report.files['corridor/data/share_alike/words.json'] = { rows: wordRows.length, stillClipped: clippedWords.length };
  if (mode === 'write' && clippedWords.length) {
    for (const [, rec] of clippedWords) rec.g = tidyGloss(rec.g);
    const doc = JSON.parse(readFileSync(WORDS_JSON, 'utf8'));
    if (doc.words) doc.words = words; else Object.assign(doc, words);
    writeFileSync(WORDS_JSON, JSON.stringify(doc));
    report.files['corridor/data/share_alike/words.json'].repaired = clippedWords.length;
  } else if (clippedWords.length) {
    report.remaining = Math.max(report.remaining, clippedWords.length);
  }

  const green = mode === 'write' || report.remaining === 0;
  console.log(JSON.stringify({ verdict: green ? 'green' : 'red', ...report }, null, 2));
  return green ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
