/**
 * 言葉の鉱脈: per-card tokens (the tap source) line up with ruby (the display source).
 *
 * build.py emits, per card, the passage as dictionary-sized tokens
 * [surface, lemma, reading, kind, ref]. They ride in a side file named by deck.tokens
 * (tokens.json, loaded on demand by a host) because inline they would grow deck.json past
 * the 25% budget. This test reads the shipped decks, both profiles, and checks that every
 * card has tokens, that the token surfaces spell the passage exactly as the ruby surfaces do,
 * that a token whose span the ruby also cuts at reads the same, and that every ref resolves
 * in the table the host lexicon opens it from.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TOKEN_KINDS, cardTokens } from '../prototypes/corridor/decks/player/engine.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORRIDOR = resolve(REPO, 'prototypes/corridor');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const KANJI = /[㐀-鿿々〆ヵヶ]/;

const heads = new Set(Object.keys(readJson(resolve(CORRIDOR, 'data/share_alike/dict.json')).words));
const glyphs = readJson(resolve(CORRIDOR, 'data/share_alike/kanji.json')).kanji;
const grammar = new Map(
  readJson(resolve(CORRIDOR, 'data/original/grammar-v11.json')).entries.map((g) => [g.id, g]),
);

const DECKS = [
  ['private kotoba-mcd', resolve(CORRIDOR, 'decks/kotoba-mcd/deck.json')],
  ['private kotoba-mine', resolve(CORRIDOR, 'decks/kotoba-mine/deck.json')],
  ['public kotoba-mcd', resolve(REPO, 'decks/kotoba-mine/release/public/deck-kotoba-mcd.json')],
  ['public kotoba-mine', resolve(REPO, 'decks/kotoba-mine/release/public/deck-kotoba-mine.json')],
];

const hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** ruby segment boundaries as character offsets: start → { end, reading spelled, marked } */
function rubySpans(card) {
  const out = [];
  let at = 0;
  for (const seg of card.ruby) {
    out.push({ a: at, b: at + seg[0].length, text: seg[0], r: seg[1] || '', mark: seg[2] || 0 });
    at += seg[0].length;
  }
  return out;
}

/** what is wrong with one card's tokens ('' when nothing is) */
function problem(card, toks) {
  if (!toks) return `${card.id}: no tokens, or they do not spell the passage`;
  if (toks.map((t) => t.s).join('') !== card.ruby.map((s) => s[0]).join(''))
    return `${card.id}: tokens and ruby spell different text`;
  const spans = rubySpans(card);
  const starts = new Set(spans.map((s) => s.a));
  for (const t of toks) {
    if (!TOKEN_KINDS.includes(t.k)) return `${card.id}: ${t.s} has kind ${t.k}`;
    if (t.k === '語' && t.ref && !heads.has(t.ref))
      return `${card.id}: 語 ${t.s} ref ${t.ref} is not a dictionary head`;
    if (t.k === '字' && !(t.ref && [...t.ref].length === 1 && glyphs[t.ref]))
      return `${card.id}: 字 ${t.s} ref ${t.ref} is not a kanji`;
    if (t.k === '文法' && !(grammar.has(t.ref) && t.p === grammar.get(t.ref).p))
      return `${card.id}: 文法 ${t.s} ref ${t.ref}`;
    if (t.k === 'other' && t.ref) return `${card.id}: other ${t.s} carries ref ${t.ref}`;
    if (KANJI.test(t.s) && !/^[ぁ-ゖー]+$/.test(t.r))
      return `${card.id}: ${t.s} has no kana reading`;
    if (!KANJI.test(t.s) && t.r) return `${card.id}: kana ${t.s} carries a reading`;
    const end = t.at + t.s.length;
    const inside = spans.filter((s) => s.a >= t.at && s.b <= end);
    const touched = spans.filter((s) => s.b > t.at && s.a < end);
    if (touched.some((s) => s.mark === 1) && t.k === '文法')
      return `${card.id}: the target ${t.s} is marked 文法`;
    // a token the ruby cuts at both ends, with no marked segment inside, reads as the ruby reads
    if (
      starts.has(t.at) &&
      (starts.has(end) || end === card.ja.length) &&
      KANJI.test(t.s) &&
      inside.every((s) => !s.mark)
    ) {
      const spelled = inside.map((s) => s.r || hira(s.text)).join('');
      if (spelled !== t.r) return `${card.id}: ${t.s} reads ${t.r}, ruby ${spelled}`;
    }
  }
  return '';
}

for (const [name, path] of DECKS) {
  describe(`${name}: tokens beside ruby`, () => {
    const deck = readJson(path);
    const cards = deck.words.flatMap((w) => w.cards);
    const sidePath = resolve(dirname(path), String(deck.tokens));
    const side = existsSync(sidePath) ? readJson(sidePath) : null;

    it('the deck names its tokens side file and the file is this deck’s', () => {
      expect(typeof deck.tokens).toBe('string');
      expect(side?.format).toBe('bunki-cloze-tokens');
      expect(side.version).toBe(1);
      expect(side.deck).toBe(deck.id);
      expect(side.fields).toEqual(['s', 'b', 'r', 'k', 'ref']);
    });

    it('cards keep ruby and ids: no card carries inline tokens, the side file covers exactly the deck’s cards', () => {
      expect(cards.filter((c) => 'tokens' in c)).toEqual([]);
      expect(Object.keys(side.cards).sort()).toEqual(cards.map((c) => c.id).sort());
      expect(Object.values(side.cards).every((i) => Number.isInteger(i) && side.passages[i])).toBe(
        true,
      );
    });

    it('every card’s tokens spell its ruby, read as its ruby reads, and every ref resolves', () => {
      const bad = cards.map((c) => problem(c, cardTokens(c, side))).filter(Boolean);
      expect(bad.slice(0, 5)).toEqual([]);
    });

    it('most content tokens carry a ref the host lexicon opens without its deep tier', () => {
      const all = cards.flatMap((c) => cardTokens(c, side));
      const words = all.filter((t) => t.k === '語');
      expect(words.length / all.length).toBeGreaterThan(0.35);
      expect(words.filter((t) => t.ref).length / words.length).toBeGreaterThan(0.8);
    });

    it('compounds the dictionary holds are one token, and nominal cues are grammar only after a predicate', () => {
      const all = cards.flatMap((c) => {
        const toks = cardTokens(c, side) || [];
        return toks.map((t, i) => ({ t, prev: toks[i - 1], next: toks[i + 1] }));
      });
      // a pair of adjacent content tokens that together spell a head should have been joined
      const split = all.filter(
        ({ t, next }) =>
          next &&
          t.k === '語' &&
          next.k === '語' &&
          KANJI.test(t.s + next.s) &&
          heads.has(t.s + next.s) &&
          ['図書館', '委員会', '飛行機', '自動車'].includes(t.s + next.s),
      );
      expect(split.map(({ t, next }) => t.s + '+' + next.s)).toEqual([]);
      const nominal = all.filter(
        ({ t, prev }) =>
          t.k === '文法' &&
          /^(上|うえ|こと|よう)/.test(t.s) &&
          (!prev || prev.k === '文法' ? false : ['の', '」', '、', '。'].includes(prev.s)),
      );
      expect(nominal.map(({ t, prev }) => (prev?.s || '') + t.s)).toEqual([]);
      const copula = all.filter(
        ({ t, next }) =>
          t.k === '文法' && t.s === 'で' && next && next.k !== '文法' && next.b === 'ある',
      );
      expect(copula.length).toBe(0);
    });
  });
}

describe('token decoding', () => {
  const card = {
    id: 'x',
    ja: '人口が減り、',
    ruby: [
      ['人口', 'じんこう'],
      ['が減', ''],
      ['り、', ''],
    ],
  };
  const file = {
    format: 'bunki-cloze-tokens',
    grammar: { 'n5-teiru': '〜ている' },
    passages: [
      [
        ['人口', '', 'じんこう', '語', '人口'],
        ['が'],
        ['減り', '減る', 'へり', '語', '減る'],
        ['、'],
      ],
    ],
    cards: { x: 0 },
  };

  it('defaults lemma to the surface, kind to other, ref to null, and counts offsets', () => {
    expect(cardTokens(card, file)).toEqual([
      { s: '人口', b: '人口', r: 'じんこう', k: '語', ref: '人口', at: 0 },
      { s: 'が', b: 'が', r: '', k: 'other', ref: null, at: 2 },
      { s: '減り', b: '減る', r: 'へり', k: '語', ref: '減る', at: 3 },
      { s: '、', b: '、', r: '', k: 'other', ref: null, at: 5 },
    ]);
    expect(problem(card, cardTokens(card, file))).toBe('');
  });

  it('a tap on 減 finds 減る, not the glyph (learning-design §3)', () => {
    const at = card.ja.indexOf('減');
    expect(cardTokens(card, file).find((t) => t.at <= at && at < t.at + t.s.length).b).toBe('減る');
  });

  it('refuses tokens that do not spell the passage, and a card the file does not hold (negative fixtures)', () => {
    const shifted = { ...file, passages: [[...file.passages[0].slice(0, 3)]] };
    expect(cardTokens(card, shifted)).toBeNull();
    expect(cardTokens({ ...card, id: 'y' }, file)).toBeNull();
    expect(cardTokens(card, { ...file, format: 'other' })).toBeNull();
  });

  it('the alignment check catches a reading that disagrees with the ruby (negative fixture)', () => {
    const wrong = {
      ...file,
      passages: [[['人口', '', 'にんく', '語', '人口'], ...file.passages[0].slice(1)]],
    };
    expect(problem(card, cardTokens(card, wrong))).toMatch(/reads にんく, ruby じんこう/);
  });
});
