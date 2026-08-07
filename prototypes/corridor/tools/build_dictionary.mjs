/**
 * Harvest the sites-v11 kotobako dictionary into corridor data assets — the
 * first concrete act of the #36 harvest, approved by the operator 2026-08-07
 * ("as robust as a full dictionary. No exceptions."): every one of the 23,120
 * JMdict-derived vocab entries (all senses, most common first, POS, JLPT) and
 * all 2,136 KanjiVG stroke-path sets ride into the corridor's ShareAlike pool.
 *
 * Usage: node build_dictionary.mjs [--check]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORRIDOR = resolve(HERE, '..');
const SRC = resolve(CORRIDOR, '..', 'bunki-sites-v11', 'public', 'kotobako-static.json');

const src = JSON.parse(readFileSync(SRC, 'utf8'));
const { vocab, kanji } = src.datasets;

const words = {};
for (const v of vocab) {
  // keyed by written form; first entry wins (kotobako is ordered by JMdict
  // entry sequence, which fronts the more common entry)
  if (words[v.word]) continue;
  const rec = { r: v.reading, m: v.meanings };
  if (v.altWord) rec.alt = v.altWord;
  if (v.pos) rec.p = v.pos;
  if (v.jlpt) rec.jlpt = v.jlpt;
  if (v.containsKanji?.length) {
    // kotobako refers to kanji as "kanji_<hex codepoint>" — resolve to chars
    rec.k = v.containsKanji
      .map((id) => {
        const m = /^kanji_([0-9a-f]+)$/.exec(id);
        return m ? String.fromCodePoint(parseInt(m[1], 16)) : id;
      })
      .filter((c) => c.length === 1);
  }
  words[v.word] = rec;
}

const dict = {
  pool: 'share_alike',
  sources: [
    {
      name: 'kotobako (JMdict subset)',
      licence: 'CC BY-SA 4.0',
      attribution:
        'JMdict — Electronic Dictionary Research and Development Group (EDRDG), via the bunki-sites-v11 kotobako build',
      url: 'https://www.edrdg.org/',
    },
  ],
  words,
};

const strokes = {};
const kmeta = {};
for (const k of kanji) {
  strokes[k.char] = k.strokes;
  const rec = {};
  if (k.grade) rec.g = k.grade;
  if (k.jlpt) rec.jlpt = k.jlpt;
  kmeta[k.char] = rec;
}

const strokesOut = {
  pool: 'share_alike',
  sources: [
    {
      name: 'KanjiVG (via kotobako)',
      licence: 'CC BY-SA 3.0',
      attribution: 'KanjiVG — Ulrich Apel',
      url: 'https://kanjivg.tagaini.net/',
    },
  ],
  strokes,
  meta: kmeta,
};

const dictPath = resolve(CORRIDOR, 'data', 'share_alike', 'dict.json');
const strokesPath = resolve(CORRIDOR, 'data', 'share_alike', 'strokes.json');

if (process.argv.includes('--check')) {
  const cur = JSON.parse(readFileSync(dictPath, 'utf8'));
  if (Object.keys(cur.words).length !== Object.keys(words).length) {
    console.error('dict.json out of date — rerun build_dictionary.mjs');
    process.exit(1);
  }
  console.log('dict.json current');
  process.exit(0);
}

writeFileSync(dictPath, JSON.stringify(dict));
writeFileSync(strokesPath, JSON.stringify(strokesOut));
console.log(
  `dict.json: ${Object.keys(words).length} words · strokes.json: ${Object.keys(strokes).length} kanji`,
);
