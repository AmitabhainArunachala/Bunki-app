/**
 * Where a saved word goes is his choice, and the app always names it (John on his iPhone, 2026-11-11: "where it goes
 * should be a conscious choice"; "still don't know where it went? do i have ZERO lists now?"). These tests hold the
 * pure part of that: his lists in the order he last used them, the one place a saved word is named by, a move from one
 * place to another, today's saved words with their places, the count of times a word's box was opened, and the record
 * root that remembers the last two, read strictly at its version and kept whole at any later one.
 */
import { describe, expect, it } from 'vitest';

import {
  SAVE_MEMORY_VERSION,
  emptySaveMemory,
  listsByRecency,
  listsHolding,
  memoryOf,
  moveLists,
  placeOf,
  savedBetween,
  timesOpened,
  validSaveMemory,
  withBoxOpened,
  withListDropped,
  withListRenamed,
  withListUsed,
} from '../prototypes/corridor/modules/save-places.mjs';

const word = (id, extra = {}) => ({ t: 'word', id, label: id, ts: 1, ...extra });
const T = Date.UTC(2026, 10, 11, 3, 0, 0);

describe('the record root that remembers saving', () => {
  it('is absent on an older record, and an older record reads as an empty memory', () => {
    expect(validSaveMemory(undefined)).toBe(true);
    expect(validSaveMemory(null)).toBe(true);
    expect(memoryOf({ taken: [], lists: {} })).toEqual(emptySaveMemory());
    expect(emptySaveMemory()).toEqual({ version: SAVE_MEMORY_VERSION, listUsed: {}, opened: {} });
  });

  it('reads its own version strictly', () => {
    expect(
      validSaveMemory({ version: 1, listUsed: { 仕事: T }, opened: { 'word:自動車': 3 } }),
    ).toBe(true);
    expect(validSaveMemory({ version: 1, listUsed: {}, opened: {}, extra: 1 })).toBe(false);
    expect(validSaveMemory({ version: 1, listUsed: { 仕事: -1 }, opened: {} })).toBe(false);
    expect(validSaveMemory({ version: 1, listUsed: {}, opened: { 'word:a': 1.5 } })).toBe(false);
    expect(validSaveMemory({ version: 1, listUsed: {}, opened: { '': 1 } })).toBe(false);
    expect(validSaveMemory({ version: 0, listUsed: {}, opened: {} })).toBe(false);
    expect(validSaveMemory([])).toBe(false);
  });

  it('keeps a later version exactly as it is and never writes over it', () => {
    const later = { version: 2, somethingNew: { deep: [1, 2] } };
    expect(validSaveMemory(later)).toBe(true);
    const record = { saveMemory: later };
    expect(memoryOf(record)).toEqual(emptySaveMemory());
    expect(withListUsed(record.saveMemory, '仕事', T)).toBe(null);
    expect(withBoxOpened(record.saveMemory, 'word:a')).toBe(null);
  });

  it('holds a list named "__proto__" as data, never as the object prototype', () => {
    const memory = withListUsed(emptySaveMemory(), '__proto__', T);
    expect(Object.prototype.hasOwnProperty.call(memory.listUsed, '__proto__')).toBe(true);
    expect(memory.listUsed.__proto__).toBe(T);
    expect(validSaveMemory(JSON.parse(JSON.stringify(memory)))).toBe(true);
  });
});

describe('his lists, most recently used first', () => {
  const lists = { 旅: [], 仕事: [], 料理: [], 経済: [] };
  it('without any use yet, the record order', () => {
    expect(listsByRecency(lists, emptySaveMemory())).toEqual(['旅', '仕事', '料理', '経済']);
  });
  it('a list used later comes first; unused lists follow in the record order', () => {
    let memory = withListUsed(emptySaveMemory(), '料理', T);
    memory = withListUsed(memory, '経済', T + 1000);
    expect(listsByRecency(lists, memory)).toEqual(['経済', '料理', '旅', '仕事']);
  });
  it('a name the memory knows but the lists no longer hold is not offered', () => {
    const memory = withListUsed(emptySaveMemory(), '消えた', T);
    expect(listsByRecency(lists, memory)).not.toContain('消えた');
  });
  it('a rename carries the time; a deleted list is forgotten', () => {
    let memory = withListUsed(emptySaveMemory(), '仕事', T);
    memory = withListRenamed(memory, '仕事', '会社');
    expect(memory.listUsed).toEqual({ 会社: T });
    expect(withListDropped(memory, '会社').listUsed).toEqual({});
  });
});

describe('the one place a saved word is named by', () => {
  it('nowhere when it is not saved', () => {
    expect(placeOf({ t: 'word', id: '犬' }, { taken: [], lists: {} })).toBe(null);
  });
  it('Review when it is saved and on no list', () => {
    expect(placeOf({ t: 'word', id: '犬' }, { taken: [word('犬')], lists: { 旅: [] } })).toEqual({
      kind: 'review',
    });
  });
  it('its list when it is on one', () => {
    const record = { taken: [word('犬')], lists: { 旅: [word('犬')], 仕事: [] } };
    expect(placeOf({ t: 'word', id: '犬' }, record)).toEqual({ kind: 'list', name: '旅' });
    expect(listsHolding({ t: 'word', id: '犬' }, record.lists)).toEqual(['旅']);
  });
  it('the list he used last when it is on two (an older record)', () => {
    const record = {
      taken: [word('犬')],
      lists: { 旅: [word('犬')], 仕事: [word('犬')] },
      saveMemory: withListUsed(emptySaveMemory(), '仕事', T),
    };
    expect(placeOf({ t: 'word', id: '犬' }, record)).toEqual({ kind: 'list', name: '仕事' });
  });
  it('a kanji is told apart from a word with the same id', () => {
    const record = { taken: [{ t: 'kanji', id: '犬', ts: 1 }], lists: {} };
    expect(placeOf({ t: 'word', id: '犬' }, record)).toBe(null);
    expect(placeOf({ t: 'kanji', id: '犬' }, record)).toEqual({ kind: 'review' });
  });
});

describe('a move takes the word off every list and puts it in the one he picked', () => {
  const row = word('犬');
  it('to a list: off the old one, onto the new one, other words untouched', () => {
    const lists = { 旅: [word('猫'), row], 仕事: [word('魚')] };
    const next = moveLists(lists, row, { kind: 'list', name: '仕事' });
    expect(next).toEqual({ 旅: [word('猫')], 仕事: [word('魚'), row] });
    expect(lists.旅).toHaveLength(2);
  });
  it('to Review: off every list, the lists themselves stay', () => {
    expect(moveLists({ 旅: [row], 仕事: [row] }, row, { kind: 'review' })).toEqual({
      旅: [],
      仕事: [],
    });
  });
  it('to a new list: the list is made', () => {
    expect(moveLists({}, row, { kind: 'list', name: '新しい' })).toEqual({ 新しい: [row] });
  });
  it('to the list it is already on: the same lists', () => {
    const lists = { 旅: [word('猫'), row] };
    expect(moveLists(lists, row, { kind: 'list', name: '旅' })).toEqual(lists);
  });
});

describe("today's saved words, each with its place", () => {
  const day = (h) => Date.UTC(2026, 10, 11, h);
  const record = {
    taken: [
      word('昨日', { ts: day(-2) }),
      word('犬', { ts: day(1) }),
      word('猫', { ts: day(5) }),
      { t: 'kanji', id: '学', ts: day(2) },
    ],
    lists: { 旅: [word('猫', { ts: day(5) })] },
  };
  it('newest first, with the place each one went', () => {
    const rows = savedBetween(record, day(0), day(24));
    expect(rows.map((row) => [row.item.id, row.place])).toEqual([
      ['猫', { kind: 'list', name: '旅' }],
      ['学', { kind: 'review' }],
      ['犬', { kind: 'review' }],
    ]);
  });
  it('nothing outside the day', () => {
    expect(savedBetween(record, day(24), day(48))).toEqual([]);
  });
});

describe("each time a word's box is opened is counted, in the record, shown nowhere", () => {
  it('counts up from nothing, per word', () => {
    let memory = emptySaveMemory();
    memory = withBoxOpened(memory, 'word:自動車');
    memory = withBoxOpened(memory, 'word:自動車');
    memory = withBoxOpened(memory, 'kanji:車');
    expect(timesOpened({ saveMemory: memory }, 'word:自動車')).toBe(2);
    expect(timesOpened({ saveMemory: memory }, 'kanji:車')).toBe(1);
    expect(timesOpened({ saveMemory: memory }, 'word:犬')).toBe(0);
    expect(timesOpened({}, 'word:犬')).toBe(0);
    expect(validSaveMemory(memory)).toBe(true);
  });
  it('never changes the memory it was given', () => {
    const memory = emptySaveMemory();
    withBoxOpened(memory, 'word:a');
    withListUsed(memory, '旅', T);
    expect(memory).toEqual(emptySaveMemory());
  });
});
