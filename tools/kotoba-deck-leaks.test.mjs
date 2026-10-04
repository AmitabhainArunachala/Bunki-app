/**
 * 言葉の鉱脈: no card shows its own answer (review findings F15, F18).
 *
 * Ruby segment markers: 1 is the asked target, 2 the rest of the word on a 字 card,
 * 3 a repeat of the word later in the passage, blanked with the target.
 *   語 and 文 cards: the text left visible (everything but markers 1 and 3) never
 *     contains the card's form or the word itself.
 *   字 cards: the blanked kanji appears nowhere else in the passage.
 *   every card id the decks ship is one ids.json hands out; withheld cards keep theirs
 *     under "reserved".
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validateDeck } from '../prototypes/corridor/decks/player/engine.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const deckOf = (id) => readJson(resolve(REPO, 'prototypes/corridor/decks', id, 'deck.json'));
const manifest = readJson(resolve(REPO, 'decks/kotoba-mine/source/ids.json'));
const DECKS = { 'kotoba-mcd': deckOf('kotoba-mcd'), 'kotoba-mine': deckOf('kotoba-mine') };

const marked = (seg, ...markers) => seg.length > 2 && markers.includes(seg[2]);
const cardsOf = (deck) => deck.words.flatMap((word) => word.cards.map((card) => ({ card, word })));

/** cards that ask for the whole word yet print it elsewhere on the front */
function wordLeaks(deck) {
  return cardsOf(deck)
    .filter(({ card }) => card.type !== 'kanji')
    .filter(({ card, word }) => {
      const visible = card.ruby
        .filter((seg) => !marked(seg, 1, 3))
        .map((seg) => seg[0])
        .join('');
      return visible.includes(card.form) || visible.includes(word.term);
    })
    .map(({ card }) => card.id);
}

/** 字 cards whose blanked kanji can be read elsewhere in the passage */
function kanjiLeaks(deck) {
  return cardsOf(deck)
    .filter(({ card }) => card.type === 'kanji')
    .filter(({ card }) => {
      const glyph = card.ruby.find((seg) => marked(seg, 1))[0];
      const visible = card.ruby
        .filter((seg) => !marked(seg, 1))
        .map((seg) => seg[0])
        .join('');
      return visible.includes(glyph);
    })
    .map(({ card }) => card.id);
}

describe('no card shows its own answer', () => {
  for (const [id, deck] of Object.entries(DECKS)) {
    it(`${id}: no 語 or 文 card prints its word outside the blanks`, () => {
      expect(wordLeaks(deck)).toEqual([]);
    });

    it(`${id}: no 字 card prints its blanked kanji elsewhere`, () => {
      expect(kanjiLeaks(deck)).toEqual([]);
    });

    it(`${id}: every card id is one ids.json hands out`, () => {
      const known = new Set(Object.values(manifest[id]));
      const missing = cardsOf(deck)
        .map(({ card }) => card.id)
        .filter((cardId) => !known.has(cardId));
      expect(missing).toEqual([]);
    });

    it(`${id}: a repeat of the word is the form itself, with a kana reading`, () => {
      const bad = cardsOf(deck)
        .flatMap(({ card }) =>
          card.ruby.filter((seg) => marked(seg, 3)).map((seg) => ({ card, seg })),
        )
        .filter(({ card, seg }) => seg[0] !== card.form || !/^[ぁ-ゖー]+$/.test(seg[1]))
        .map(({ card, seg }) => `${card.id} ${seg.join('/')}`);
      expect(bad).toEqual([]);
    });
  }

  it('the passages that repeat the word blank every repeat (marker 3)', () => {
    const repeats = {
      'kotoba-mcd': [
        'km-065-m04',
        'km-109-m04',
        'km-218-m05',
        'km-083-m05',
        'km-193-m04',
        'km-157-m04',
        'km-076-m05',
        'km-215-m04',
        'km-252-m04',
        'km-301-m06',
        'km-136-m04',
        'km-021-m04',
      ],
      'kotoba-mine': ['km-109-2', 'km-220-1', 'km-062-1', 'km-255-2', 'km-035-1', 'km-245-1'],
    };
    for (const [id, cardIds] of Object.entries(repeats)) {
      const byId = new Map(cardsOf(DECKS[id]).map(({ card }) => [card.id, card]));
      for (const cardId of cardIds) {
        const card = byId.get(cardId);
        expect(card, cardId).toBeDefined();
        expect(card.ruby.filter((seg) => marked(seg, 1))).toHaveLength(1);
        expect(
          card.ruby.some((seg) => marked(seg, 3)),
          cardId,
        ).toBe(true);
      }
    }
  });

  it('讃岐うどん has no 字 cards: 讃=さぬ was a guess; its ids stay reserved', () => {
    const shipped = new Set(cardsOf(DECKS['kotoba-mcd']).map(({ card }) => card.id));
    const reserved = new Set((manifest.reserved?.['kotoba-mcd'] ?? []).map((r) => r.id));
    for (const cardId of ['km-205-m02', 'km-205-m03']) {
      expect(shipped.has(cardId), cardId).toBe(false);
      expect(reserved.has(cardId), cardId).toBe(true);
    }
  });
});

describe('the player accepts repeats of the word (marker 3)', () => {
  for (const [id, deck] of Object.entries(DECKS)) {
    it(`${id}: validateDeck finds nothing wrong`, () => {
      expect(validateDeck(deck)).toEqual([]);
    });
  }

  const deckWith = (ruby) => ({
    format: 'bunki-cloze-deck',
    version: 1,
    groups: [{ id: 'g' }],
    words: [
      { id: 'w', group: 'g', cards: [{ id: 'c', ja: ruby.map((seg) => seg[0]).join(''), ruby }] },
    ],
  });

  it('one target and any number of blanked repeats is a valid card', () => {
    const ruby = [
      ['金利', 'きんり', 1],
      ['が上がり、', ''],
      ['金利', 'きんり', 3],
      ['も', ''],
      ['金利', 'きんり', 3],
    ];
    expect(validateDeck(deckWith(ruby))).toEqual([]);
  });

  it('two targets, or an unknown marker, is not', () => {
    expect(
      validateDeck(
        deckWith([
          ['金利', 'きんり', 1],
          ['と', ''],
          ['金利', 'きんり', 1],
        ]),
      ),
    ).toEqual(['c: needs exactly one target segment']);
    expect(
      validateDeck(
        deckWith([
          ['金利', 'きんり', 1],
          ['と', ''],
          ['金利', 'きんり', 4],
        ]),
      ),
    ).toEqual(['c: unknown segment marker']);
  });
});
