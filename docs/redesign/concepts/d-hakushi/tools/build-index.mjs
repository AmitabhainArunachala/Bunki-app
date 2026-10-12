#!/usr/bin/env node
// Builds data/index.json (the word web) and data/articles.json (full tokenised articles)
// from the REAL decks and articles in prototypes/corridor. Run from the repo root:
//   node docs/redesign/concepts/d-hakushi/tools/build-index.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(new URL('../../../../../', import.meta.url).pathname);
const OUT = resolve(new URL('../data/', import.meta.url).pathname);
const C = join(ROOT, 'prototypes/corridor');

const words = [];      // [deck, group, term, reading, meaning, defJa, pos, kanjiString]
const kanji = {};      // char -> [meaning, strokes, onyomiGuess, parts[], wordIdx[]]
const sentences = [];  // passage sentences (for "seen in" passages)
const DECKS = { n1: 'N1', n2: 'N2', senmon: 'Fields' };
for (const d of Object.keys(DECKS)) {
  const D = JSON.parse(readFileSync(join(C, 'decks', d, 'deck.json'), 'utf8'));
  for (const w of D.words) {
    const i = words.length;
    words.push([d, w.group, w.term, w.reading, w.meaning, w.defJa || '', w.pos || '', (w.kanji || []).map(k => k.c).join('')]);
    for (const k of w.kanji || []) {
      const e = kanji[k.c] || (kanji[k.c] = [k.m || '', k.st || 0, k.r || '', k.parts || [], []]);
      if (!e[0] && k.m) e[0] = k.m;
      if (!e[3].length && k.parts?.length) e[3] = k.parts;
      e[4].push(i);
    }
    const card = (w.cards || [])[0];
    if (card?.ja) for (const s of card.ja.split(/(?<=。)/)) if (s.trim().length > 6) sentences.push([s.trim(), i]);
  }
}
const parts = {};
for (const [c, e] of Object.entries(kanji)) for (const p of e[3]) (parts[p] ||= []).push(c);

const ARTS = ['bunki-essay-n1-ise-time', 'bunki-essay-n1-city', 'bunki-essay-n1-ai', 'bunki-essay-n1-kojiki-power', 'aozora-000628', 'bunki-essay-n1-cosmic-analogy'];
const articles = ARTS.map(id => {
  const a = JSON.parse(readFileSync(join(C, 'data/articles', id + '.json'), 'utf8'));
  const toks = a.tokens.map(t => [t.s, t.b, t.p, (t.f || []).map(f => f.r ? [f.t, f.r] : [f.t]), t.c ? 1 : 0]);
  return { id, title: a.title, sourceLabel: a.sourceLabel, level: a.authorLevel || '', licence: a.licence, attribution: a.attribution || '', paras: a.paras, tokens: toks, chars: a.tokens.reduce((n, t) => n + t.s.length, 0) };
});
for (const a of articles) {
  const text = a.tokens.map(t => t[0]).join('');
  for (const s of text.split(/(?<=。)/)) if (s.trim().length > 6) sentences.push([s.trim(), 'a:' + a.id]);
}
writeFileSync(join(OUT, 'index.json'), JSON.stringify({ decks: DECKS, words, kanji, parts, sentences }));
writeFileSync(join(OUT, 'articles.json'), JSON.stringify(articles));
console.log('words', words.length, 'kanji', Object.keys(kanji).length, 'parts', Object.keys(parts).length, 'sentences', sentences.length);
