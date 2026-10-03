import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { CARDS } from './cards/index.js';
import { DECK_META } from './deck-meta.js';
import { GLOSSARY_ORDER } from './glossary-order.js';
import {
  RATINGS,
  assembleDeck,
  basicTsv,
  clozeParagraph,
  counts,
  createScheduler,
  emptyState,
  grade,
  normalizeState,
  paragraphOf,
  studyQueue,
  validateDeck,
} from './engine.js';

const root = dirname(fileURLToPath(import.meta.url));
const fsrsApi = await import('../../vendor/ts-fsrs.mjs');
const pin = JSON.parse(readFileSync(join(root, '../../data/fsrs-pin.json'), 'utf8'));

test('the deck covers the glossary once, in order', () => {
  const deck = assembleDeck(CARDS, DECK_META);
  assert.deepEqual(
    deck.cards.map((card) => card.target),
    GLOSSARY_ORDER,
  );
  assert.equal(validateDeck(deck).length, 0);
});

test('committed deck.json and basic.tsv match the source cards', () => {
  const deck = assembleDeck(CARDS, DECK_META);
  const onDisk = JSON.parse(readFileSync(join(root, 'deck.json'), 'utf8'));
  assert.deepEqual(onDisk, deck);
  assert.equal(readFileSync(join(root, 'basic.tsv'), 'utf8'), basicTsv(deck));
});

test('the blank is not always in the opening sentence', () => {
  const deck = assembleDeck(CARDS, DECK_META);
  const indexOf = [];
  let early = 0;
  let mid = 0;
  let late = 0;
  for (const card of deck.cards) {
    const at = card.sentences.findIndex((sentence) => sentence.includes(card.target));
    indexOf[at] = (indexOf[at] || 0) + 1;
    const text = card.sentences.join('');
    const ratio = text.indexOf(card.target) / text.length;
    if (ratio < 0.28) early += 1;
    else if (ratio < 0.62) mid += 1;
    else late += 1;
  }
  assert.ok(indexOf[0] < deck.cards.length * 0.15, `opening blanks ${indexOf[0]}`);
  assert.ok((indexOf[2] || 0) + (indexOf[3] || 0) > deck.cards.length * 0.5);
  assert.ok(early > 10);
  assert.ok(mid > deck.cards.length * 0.3);
  assert.ok(late > deck.cards.length * 0.3);
});

test('a cloze hides the target and the back still has it', () => {
  const deck = assembleDeck(CARDS, DECK_META);
  const card = deck.cards[0];
  const front = clozeParagraph(paragraphOf(card), card.target);
  assert.equal(front.includes(card.target), false);
  assert.equal(front.includes('［'), true);
  const row = basicTsv(deck).split('\n')[1];
  assert.equal(row.startsWith(`${card.id}\t`), true);
  assert.equal(row.includes(card.target), true);
});

test('grades are deterministic with fuzz off and do not schedule before a grade', () => {
  const deck = assembleDeck(CARDS, DECK_META);
  const scheduler = createScheduler(fsrsApi, pin);
  assert.equal(pin.enableFuzz, false);
  const now = new Date('2026-09-30T00:00:00.000Z');
  const state = emptyState(deck.id);
  const first = studyQueue(deck, state, now);
  assert.equal(first.due.length, 0);
  assert.equal(first.fresh.length, deck.newPerDay);
  assert.equal(Object.keys(state.cards).length, 0);

  const id = first.queue[0].id;
  const again = grade(fsrsApi, scheduler, state, id, RATINGS.again, now);
  const againToo = grade(fsrsApi, scheduler, state, id, RATINGS.again, now);
  assert.deepEqual(again.cards[id], againToo.cards[id]);
  assert.equal(again.cards[id].reps, 1);
  assert.ok(new Date(again.cards[id].due).getTime() > now.getTime() || again.cards[id].state === 1);

  const good = grade(fsrsApi, scheduler, state, id, RATINGS.good, now);
  assert.notEqual(good.cards[id].due, again.cards[id].due);
  const next = studyQueue(deck, good, now);
  assert.equal(next.fresh.length, deck.newPerDay - 1);
  assert.equal(counts(deck, good, now).unseen, deck.cards.length - 1);
});

test('a foreign or corrupt state does not leak into this deck', () => {
  const deck = assembleDeck(CARDS, DECK_META);
  const weird = normalizeState({ format: 'other', version: 1, deckId: deck.id, cards: { nazokake: { due: 'x', reps: 1 } } }, deck);
  assert.deepEqual(weird.cards, {});
  const partial = normalizeState(
    {
      format: 'bunki-srs-deck-state',
      version: 1,
      deckId: deck.id,
      cards: {
        nazokake: { due: '2026-09-30T00:00:00.000Z', reps: 1, stability: 1 },
        missing: { due: '2026-09-30T00:00:00.000Z', reps: 1 },
      },
    },
    deck,
  );
  assert.deepEqual(Object.keys(partial.cards), ['nazokake']);
});
