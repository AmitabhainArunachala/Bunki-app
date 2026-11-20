/**
 * The read-along light (2026-11-11; John on his iPhone: "the highlighting is very very wonky an dnot working well at
 * all"). The sentence being read is painted as one even band per line, by geometry Bunki computes itself, in every
 * engine: WebKit painted the CSS Custom Highlight API in patches (nothing on the kanji words, the kana at uneven
 * heights). These tests hold the geometry as a pure function: the boxes of the words' base text in, the bands out.
 */
import { describe, expect, it } from 'vitest';

import { bandLines } from '../prototypes/corridor/modules/voice-bands.mjs';

const box = (left, top, right, bottom) => ({ left, top, right, bottom });

describe('one even band per line of the sentence', () => {
  it('one band per line, from the first character to the last, with no gaps between words', () => {
    // line 1: three words with gaps between their boxes; line 2: two words
    const lines = bandLines([
      box(100, 200, 130, 224),
      box(134, 200, 180, 224),
      box(190, 200, 260, 224),
      box(30, 260, 90, 284),
      box(95, 260, 150, 284),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ left: 100, right: 260 });
    expect(lines[1]).toMatchObject({ left: 30, right: 150 });
  });

  it('the same height on every line, over kanji and kana alike, even where WebKit sets them at uneven heights', () => {
    // a kanji word's base box (inside ruby, inline-flex) sits 3 px lower and is 2 px taller than its kana neighbours
    const lines = bandLines([
      box(30, 200, 80, 224),
      box(80, 203, 140, 229),
      box(140, 199, 170, 223),
      box(30, 262, 100, 286),
      box(100, 259, 130, 283),
    ]);
    const heights = lines.map((line) => line.bottom - line.top);
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(0.01);
    expect(heights[0]).toBe(24);
    // each band covers every word box of its line by at least 80% of the box's height
    for (const [i, word] of [
      box(30, 200, 80, 224),
      box(80, 203, 140, 229),
      box(140, 199, 170, 223),
    ].entries()) {
      const shared = Math.min(word.bottom, lines[0].bottom) - Math.max(word.top, lines[0].top);
      expect(shared / (word.bottom - word.top), `word ${i}`).toBeGreaterThanOrEqual(0.8);
    }
  });

  it('boxes in any order still make their lines in reading order', () => {
    const lines = bandLines([
      box(30, 260, 90, 284),
      box(100, 200, 260, 224),
      box(95, 260, 150, 284),
    ]);
    expect(lines.map((line) => Math.round(line.top))).toEqual([200, 260]);
  });

  it('a line of one word is a band of that word; no boxes, no bands; empty boxes are ignored', () => {
    expect(bandLines([box(10, 10, 40, 34)])).toEqual([
      { left: 10, right: 40, top: 10, bottom: 34 },
    ]);
    expect(bandLines([])).toEqual([]);
    expect(bandLines([box(10, 10, 10, 34), box(5, 5, 50, 5.5), null])).toEqual([]);
  });

  it('a furigana row is not a line of its own: only base text is passed in, so two rows of base text make two bands', () => {
    // the caller passes base text only; a tall gap between lines (a furigana row) changes nothing
    const lines = bandLines([box(30, 200, 200, 224), box(30, 290, 120, 314)]);
    expect(lines).toHaveLength(2);
    expect(lines[1].top - lines[0].bottom).toBe(66);
  });
});
