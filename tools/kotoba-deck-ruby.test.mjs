/**
 * 言葉の鉱脈: readings the tokeniser got wrong stay fixed (review finding F17).
 *
 * UniDic reads 日本人 as にっぽん・にん, 他の as たの, 一日のうちでも as ついたち,
 * 一般の方 as ほう, 土曜日 as どようひ, 恋愛上手 as かみて, 寛仁 as かんにん.
 * decks/kotoba-mine/source/readings.json corrects them at build time; this test
 * reads the shipped decks and checks each pair in tools/kotoba-deck-ruby.fixtures.json:
 * the right reading is there, the wrong one is not.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const { pairs } = readJson(resolve(REPO, 'tools/kotoba-deck-ruby.fixtures.json'));

function cardsById() {
  const out = new Map();
  for (const id of ['kotoba-mcd', 'kotoba-mine']) {
    const deck = readJson(resolve(REPO, 'prototypes/corridor/decks', id, 'deck.json'));
    for (const w of deck.words) for (const c of w.cards) out.set(c.id, c);
  }
  return out;
}

/** the readings of every segment of `card` that spells `surface` in the pair's context */
function readingsAt(card, { surface, after = '', before = '' }) {
  const out = [];
  let text = '';
  card.ruby.forEach((seg, i) => {
    const rest = card.ruby
      .slice(i + 1)
      .map((s) => s[0])
      .join('');
    if (seg[0] === surface && text.endsWith(after) && rest.startsWith(before)) out.push(seg[1]);
    text += seg[0];
  });
  return out;
}

/** what is wrong with one pair on this card ('' when nothing is) */
function problem(card, pair) {
  if (!card) return `${pair.card}: no such card`;
  const found = readingsAt(card, pair);
  if (!found.length) return `${pair.card}: no ${pair.after}〔${pair.surface}〕 segment`;
  if (found.includes(pair.wrong)) return `${pair.card}: ${pair.surface}=${pair.wrong}`;
  if (found.some((r) => r !== pair.right))
    return `${pair.card}: ${pair.surface}=${found.join('/')}, not ${pair.right}`;
  return '';
}

describe('the shipped decks read the corrected words right', () => {
  const cards = cardsById();

  it('every fixture names a card, a right reading and a different wrong one', () => {
    expect(pairs.length).toBeGreaterThan(30);
    for (const pair of pairs) {
      expect(pair.right, pair.card).toMatch(/^[ぁ-ゖー]+$/);
      expect(pair.wrong, pair.card).not.toBe(pair.right);
    }
  });

  for (const pair of pairs) {
    it(`${pair.card}: ${pair.after}${pair.surface} reads ${pair.right}, never ${pair.wrong}`, () => {
      expect(problem(cards.get(pair.card), pair)).toBe('');
    });
  }

  it('the check catches a wrong reading put back (negative fixture)', () => {
    for (const pair of pairs) {
      const card = JSON.parse(JSON.stringify(cards.get(pair.card)));
      const seg = card.ruby.find((s, i) => {
        const before = card.ruby
          .slice(0, i)
          .map((x) => x[0])
          .join('');
        return s[0] === pair.surface && before.endsWith(pair.after);
      });
      seg[1] = pair.wrong;
      expect(problem(card, pair), pair.card).toContain(`=${pair.wrong}`);
    }
  });
});
