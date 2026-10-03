import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CARDS } from './cards/index.js';
import { DECK_META } from './deck-meta.js';
import { assembleDeck, basicTsv } from './engine.js';

const root = dirname(fileURLToPath(import.meta.url));

export function buildDeck() {
  return assembleDeck(CARDS, DECK_META);
}

const deck = buildDeck();
writeFileSync(join(root, 'deck.json'), `${JSON.stringify(deck)}\n`);
writeFileSync(join(root, 'basic.tsv'), basicTsv(deck));
console.log(`wrote ${deck.cards.length} cards`);
