/**
 * VERIFIER'S OWN data-absence injection. Rewrites the embedded corridor bundle
 * of a built standalone so a word (and/or a kanji) genuinely does not exist in
 * the corridor's dictionary, then writes a new standalone. Nothing in the app
 * code is touched — the data simply does not carry the entry.
 *
 * node inject-absence.mjs <in.html> <out.html> --word 天気 [--kanji 天]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [inp, outp] = process.argv.slice(2);
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const WORD = arg('--word');
const KANJI = arg('--kanji');

const html = readFileSync(inp, 'utf8');
const OPEN = '<script type="application/json" id="corridor-bundle">';
const a = html.indexOf(OPEN);
if (a < 0) throw new Error('no embedded bundle');
const b = html.indexOf('</script>', a);
const raw = html.slice(a + OPEN.length, b);
const bundle = JSON.parse(raw.replace(/\\u003c/g, '<'));

const report = {};
if (WORD) {
  report.dictHad = !!bundle['share_alike/dict'].words[WORD];
  report.wordsHad = !!bundle['share_alike/words'].words[WORD];
  delete bundle['share_alike/dict'].words[WORD];
  delete bundle['share_alike/words'].words[WORD];
  report.dictNow = !!bundle['share_alike/dict'].words[WORD];
  report.wordsNow = !!bundle['share_alike/words'].words[WORD];
}
if (KANJI) {
  report.kanjiHad = !!bundle['share_alike/kanji'].kanji[KANJI];
  delete bundle['share_alike/kanji'].kanji[KANJI];
  report.kanjiNow = !!bundle['share_alike/kanji'].kanji[KANJI];
}
const out = html.slice(0, a + OPEN.length) + JSON.stringify(bundle).replace(/</g, '\\u003c') + html.slice(b);
writeFileSync(outp, out);
console.log('injected absence:', JSON.stringify(report), '->', outp);
