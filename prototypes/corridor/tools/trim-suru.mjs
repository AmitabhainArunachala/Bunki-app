/**
 * Cut the reflexive する from single-vocabulary drift readings.
 *
 * Operator direction (2026-08-10): a single vocab word should not carry a
 * trailing する in its reading unless する is genuinely part of the word.
 * Example: 故障 was shown as こしょうする; it must read こしょう.
 *
 * The test is intra-entry and self-contained: a reading ending in する whose
 * HEADWORD does not also end in する is an editorial append (a plain noun that
 * merely *can* take する) — strip it. A genuine する-verb carries する in the
 * headword too (愛する / あいする, 察する / さっする) — keep it untouched.
 *
 * Edits the two DRIFT SOURCES only:
 *   - prototypes/drift/drift-artifact.html  (the WBIG array literal, one line)
 *   - prototypes/drift/data/wbig.json       (the app-tier mirror)
 * Generated artifacts (drift-layer.*, drift-words.json, corridor-standalone)
 * are regenerated afterwards by the normal build tools — never hand-edited.
 *
 * Idempotent: a second run finds nothing to strip. Usage: node trim-suru.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const DRIFT = resolve(CORRIDOR, '..', 'drift');
const ARTIFACT = resolve(DRIFT, 'drift-artifact.html');
const WBIG_JSON = resolve(DRIFT, 'data', 'wbig.json');
// The corridor's own graded-word map (D.words). A static committed data file
// with no generator, embedded verbatim by build-standalone — so it carries the
// same editorial する and must be cleaned in place too, keeping the drifting
// word and the entry sheet it opens in agreement.
const WORDS_JSON = resolve(CORRIDOR, 'data', 'share_alike', 'words.json');

const SURU = 'する';

/** Strip trailing する from a reading only when the headword lacks it. */
const trimEntry = (entry) => {
  const [h, r] = entry;
  if (typeof r !== 'string' || typeof h !== 'string') return null;
  if (!r.endsWith(SURU) || h.endsWith(SURU)) return null;
  const stem = r.slice(0, -SURU.length);
  // A reading that is *entirely* する belongs to a る-verb whose kanji headword
  // carries the meaning (為る・刷る・擦る / する) — the する is the whole word,
  // not an appended suffix. Emptying it would be wrong, so leave it be.
  if (stem === '') return null;
  const next = entry.slice();
  next[1] = stem;
  return next;
};

/** Apply the trim across an array of entries; returns { arr, changes }. */
const trimAll = (arr) => {
  const changes = [];
  const out = arr.map((entry) => {
    if (!Array.isArray(entry)) return entry;
    const next = trimEntry(entry);
    if (!next) return entry;
    changes.push(`${entry[0]}  ${entry[1]} → ${next[1]}`);
    return next;
  });
  return { arr: out, changes };
};

/* ---------------------------------------------------- drift-artifact.html */
// WBIG sits on a single line as `const WBIG=[[...]];`. Match the whole literal
// on that one line (no `s` flag, so `.` never crosses the newline) so a gloss
// containing "]]" cannot truncate the capture.
let html = readFileSync(ARTIFACT, 'utf8');
const wbigRe = /const WBIG=(\[.*\]);/;
const m = wbigRe.exec(html);
if (!m) throw new Error('WBIG array literal not found in drift-artifact.html');
const wbig = JSON.parse(m[1]);
const htmlResult = trimAll(wbig);
// Re-serialize compact (no spaces) to match the source's existing style, with
// Japanese kept literal (JSON.stringify does not \u-escape BMP kanji/kana).
const wbigOut = JSON.stringify(htmlResult.arr);
html = html.slice(0, m.index) + `const WBIG=${wbigOut};` + html.slice(m.index + m[0].length);
writeFileSync(ARTIFACT, html);

/* --------------------------------------------------------- wbig.json */
const jsonArr = JSON.parse(readFileSync(WBIG_JSON, 'utf8'));
const jsonResult = trimAll(jsonArr);
writeFileSync(WBIG_JSON, JSON.stringify(jsonResult.arr));

/* -------------------------------------------------------- words.json */
// Keyed map { headword: { w, r, g, jlpt, k } } under a `words` field. Apply the
// same reading rule to the `r` of each record.
const wordsDoc = JSON.parse(readFileSync(WORDS_JSON, 'utf8'));
const wordsMap = wordsDoc.words || wordsDoc;
const wordsChanges = [];
for (const rec of Object.values(wordsMap)) {
  if (!rec || typeof rec.r !== 'string' || typeof rec.w !== 'string') continue;
  const next = trimEntry([rec.w, rec.r]);
  if (!next) continue;
  wordsChanges.push(`${rec.w}  ${rec.r} → ${next[1]}`);
  rec.r = next[1];
}
writeFileSync(WORDS_JSON, JSON.stringify(wordsDoc));

/* -------------------------------------------------------------- report */
const report = htmlResult.changes;
console.log(`trim-suru: ${report.length} readings trimmed in drift-artifact.html`);
console.log(`           ${jsonResult.changes.length} readings trimmed in wbig.json`);
console.log(`           ${wordsChanges.length} readings trimmed in words.json`);
if (report.length) console.log('\n' + report.join('\n'));
if (report.length !== jsonResult.changes.length) {
  throw new Error('artifact and wbig.json diverged — expected identical change sets');
}
