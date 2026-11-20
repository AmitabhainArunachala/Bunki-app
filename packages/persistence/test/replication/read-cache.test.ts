/**
 * The row decode cache answers only for the exact bytes it was given.
 *
 * Every transaction of the browser store reads every row. Without the cache a
 * saved answer decodes and re-hashes the learner's whole record three times.
 * With it, a row whose text and digest are unchanged is answered from the
 * earlier checked decode. These tests hold the one property that makes that
 * safe: a different text, a different digest or a damaged row is never
 * answered from the cache, and is checked in full as before.
 */
import { describe, expect, it } from 'vitest';

import { encodeLocalJson } from '../../src/replication/json.ts';
import { LocalJsonReadCache } from '../../src/replication/read-cache.ts';

const row = (value: unknown) => encodeLocalJson(value);
const corrupt = (action: () => unknown): boolean => {
  try {
    action();
    return false;
  } catch (error) {
    return (error as { code?: string }).code === 'corrupt-store';
  }
};

describe('the row decode cache', () => {
  it('answers the same bytes with the same checked value, and decodes other bytes afresh', () => {
    const cache = new LocalJsonReadCache();
    const first = row({ revision: 1, list: [1, 2, 3] });
    const read = cache.read('k', first.text, first.sha256);
    expect(read).toEqual({ list: [1, 2, 3], revision: 1 });
    expect(cache.read('k', first.text, first.sha256)).toBe(read);
    const second = row({ revision: 2, list: [1, 2, 3, 4] });
    const other = cache.read('k', second.text, second.sha256);
    expect(other).toEqual({ list: [1, 2, 3, 4], revision: 2 });
    expect(other).not.toBe(read);
    // The key holds one answer, the latest; the earlier bytes are checked again in full.
    expect(cache.read('k', first.text, first.sha256)).toEqual(read);
    expect(cache.size).toBe(1);
  });

  it('never answers a damaged row from an earlier good read of the same key', () => {
    const cache = new LocalJsonReadCache();
    const good = row({ score: 10, items: ['a', 'b'] });
    const tampered = good.text.replace('10', '99');
    expect(tampered).not.toBe(good.text);
    const spaced = good.text.replace(',', ', ');
    // Each kind of damage is tried against a cache that holds the good read of that very key.
    const damaged: [string, string, string][] = [
      ['other bytes under the old digest', tampered, good.sha256],
      ['the old bytes under another digest', good.text, row('other').sha256],
      ['text that is not canonical', spaced, row(spaced).sha256],
    ];
    for (const [kind, text, sha256] of damaged) {
      cache.read('k', good.text, good.sha256);
      expect(cache.size).toBe(1);
      expect(
        corrupt(() => cache.read('k', text, sha256)),
        kind,
      ).toBe(true);
      // A refused read leaves no entry behind that a later read could be answered from.
      expect(cache.size, kind).toBe(0);
      expect(
        corrupt(() => cache.read('k', text, sha256)),
        kind,
      ).toBe(true);
    }
    expect(cache.read('k', good.text, good.sha256)).toEqual({ items: ['a', 'b'], score: 10 });
  });

  it('remembers what was just encoded, for those bytes alone', () => {
    const cache = new LocalJsonReadCache();
    const written = row({
      history: [
        [1, 'tap'],
        [2, 'tap'],
      ],
    });
    cache.remember('k', written.text, written.sha256, written.value);
    expect(cache.read('k', written.text, written.sha256)).toBe(written.value);
    // What comes back from disk decides: other bytes are decoded and checked, whatever was remembered.
    const peer = row({
      history: [
        [1, 'tap'],
        [2, 'tap'],
        [3, 'tap'],
      ],
    });
    expect(cache.read('k', peer.text, peer.sha256)).toEqual(peer.value);
    expect(corrupt(() => cache.read('k', written.text.replace('tap', 'tip'), written.sha256))).toBe(
      true,
    );
    cache.remember('k', written.text, written.sha256, written.value);
    cache.forget('k');
    expect(cache.size).toBe(0);
    expect(cache.read('k', written.text, written.sha256)).not.toBe(written.value);
  });

  it('answers nothing from memory while an inherited toJSON could change a full read', () => {
    const cache = new LocalJsonReadCache();
    const first = row({ list: [1] });
    const value = cache.read('k', first.text, first.sha256);
    expect(cache.read('k', first.text, first.sha256)).toBe(value);
    const holder = Array.prototype as { toJSON?: unknown };
    try {
      holder.toJSON = () => [];
      // A full read re-serializes the row, finds other text and refuses it. So must this read.
      expect(corrupt(() => cache.read('k', first.text, first.sha256))).toBe(true);
      cache.remember('other', first.text, first.sha256, value);
      expect(cache.size).toBe(1);
    } finally {
      delete holder.toJSON;
    }
    expect(cache.read('k', first.text, first.sha256)).toBe(value);
  });

  it('keeps within its bounds, oldest out first', () => {
    const cache = new LocalJsonReadCache(3, 1_000);
    const rows = ['a', 'b', 'c', 'd'].map((name) => ({
      name,
      ...row({ name, pad: 'x'.repeat(100) }),
    }));
    const values = rows.map((entry) => cache.read(entry.name, entry.text, entry.sha256));
    expect(cache.size).toBe(3);
    expect(cache.read('d', rows[3]!.text, rows[3]!.sha256)).toBe(values[3]);
    expect(cache.read('a', rows[0]!.text, rows[0]!.sha256)).not.toBe(values[0]);
    // A row larger than the whole budget is decoded each time and never kept.
    const large = row({ pad: 'y'.repeat(2_000) });
    const one = cache.read('large', large.text, large.sha256);
    expect(cache.read('large', large.text, large.sha256)).not.toBe(one);
    // A budget of characters, not only of entries.
    const tight = new LocalJsonReadCache(100, 300);
    for (const entry of rows) tight.read(entry.name, entry.text, entry.sha256);
    expect(tight.size).toBe(2);
  });

  it('keeps and answers nothing once retired, and still checks every read', () => {
    const cache = new LocalJsonReadCache();
    const first = row({ a: 1 });
    const value = cache.read('k', first.text, first.sha256);
    cache.retire();
    expect(cache.size).toBe(0);
    const after = cache.read('k', first.text, first.sha256);
    expect(after).toEqual(value);
    expect(after).not.toBe(value);
    cache.remember('k', first.text, first.sha256, value);
    expect(cache.size).toBe(0);
    expect(corrupt(() => cache.read('k', first.text.replace('1', '2'), first.sha256))).toBe(true);
  });
});
