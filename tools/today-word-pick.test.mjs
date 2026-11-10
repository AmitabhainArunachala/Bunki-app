/* global URL */
/** Today's word comes from his own study and says why (John, 2026-11-10: "how is the word connected to the user or the
 * study or progress? … it should be INSTRUCTIVE but accurate"). The actual todayWordOfDay and the why line are lifted
 * from the corridor and run over fixture records at a fixed clock; the first rule that yields a word wins:
 *   a  a word card due today whose latest answer was wrong (given before today)   "You missed this on 8 Nov."
 *   b  the word saved last (before today) that he has not studied                  "You saved this on 3 Nov."
 *   c  a word of today's reading he has neither marked known nor saved             "From today's reading."
 *   d  the next new word of the deck he studies                                    "Next in your N2 deck."
 * The pick holds all day for one record, and moves on once he studies or saves the word. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, test } from 'vitest';
import { CORRIDOR, corridorDeclarations } from './corridor-declarations.mjs';

const json = (path) => JSON.parse(readFileSync(new URL(path, CORRIDOR), 'utf8'));
const D = {
  dict: json('data/share_alike/dict.json').words,
  words: json('data/share_alike/words.json').words,
  kanji: json('data/share_alike/kanji.json').kanji,
};
const source = [
  corridorDeclarations(
    'corridor.js',
    [
      'TODAY_JA_WORD',
      'srsKey',
      'plainRecord',
      'nonEmptyString',
      'metReadable',
      'wordStudied',
      'todayWordOfDay',
    ],
    [],
  ),
  corridorDeclarations(
    'corridor.js',
    ['todayKnownWords', 'todayFreshPool'],
    ['todayKnownWords', 'todayFreshPool'],
  ),
  corridorDeclarations('modules/drift.mjs', ['dayKey', 'startOfDay', 'todayHash', 'todayDueKeys']),
  corridorDeclarations('modules/drift.mjs', ['todayWordWhy'], ['todayWordWhy']),
  corridorDeclarations('modules/drift.mjs', [
    'todayKanji',
    'todayPartStrokes',
    'todayIsRadical',
    'todaySharedPart',
  ]),
].join('\n');

const at = (d, h = 10, m = 0) => new Date(2026, 10, d, h, m).getTime();
const iso = (ms) => new Date(ms).toISOString();
const card = (dueMs, state = 2) => ({
  due: iso(dueMs),
  state,
  stability: 3,
  difficulty: 5,
  reps: 3,
  lapses: 1,
  last_review: iso(dueMs - 86400000),
});
const PASSAGE = {
  id: 'wikinews:1403',
  readingFacets: {
    forms: [
      'ある',
      '世界',
      '自然',
      '遺産',
      '絶滅',
      '登録',
      '審議',
      '保全',
      '暫定',
      '推薦',
      '稜線',
      '哺乳',
      '流氷',
    ],
  },
};

/** One run of the actual pick at a clock, over one record, in one interface language. */
function run(record, { now = at(10, 9), read = PASSAGE, deck = null, ja = false } = {}) {
  const NOW = now;
  class FixedDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [NOW]));
    }
    static now() {
      return NOW;
    }
  }
  const S = { taken: [], srs: {}, revlog: [], obslog: [], suspended: {}, met: null, ...record };
  const context = vm.createContext({
    D,
    S,
    Date: FixedDate,
    MONTHS_EN: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    PART_WRITTEN: {},
    LEARN_STAGE_DECKS: [
      ['n2', 'N2', 'N2'],
      ['n1', 'N1', 'N1'],
      ['senmon', '専門', 'Fields'],
    ],
    bi: () => !ja,
    tx: (jaText, en) => (ja ? jaText : en),
    savedAnswerFor: ({ id }) => ({ status: 'available', reading: D.dict[id]?.r || '' }),
    todayReadPick: () => (read ? { passage: read, count: 0 } : null),
    todayDeckNext: () => deck,
    todayQueue: () => ({ order: [], new: [], learn: [], review: [], held: 0 }),
  });
  vm.runInContext(source, context);
  const pick = vm.runInContext('todayWordOfDay(null)', context);
  if (!pick) return null;
  context.pick = pick;
  const why = vm.runInContext(
    "typeof todayWordWhy === 'function' ? todayWordWhy(pick) : ''",
    context,
  );
  return { word: pick.word, reading: pick.reading, from: pick.from, why };
}

const knownKey = (id, reading) => JSON.stringify([1, 'word', id, 'core', null, reading]);

describe("Today's word from his own study", () => {
  test('a · a card due today that he last answered wrong: the latest such miss, and when', () => {
    const record = {
      taken: [
        { t: 'word', id: '談話', ts: at(1), started: at(1) },
        { t: 'word', id: '保全', ts: at(2), started: at(2) },
        { t: 'word', id: '推薦', ts: at(2), started: at(2) },
        { t: 'word', id: '審議', ts: at(4), started: at(4) },
        { t: 'word', id: '遺産', ts: at(3) },
      ],
      srs: {
        'word:談話': card(at(10, 8)),
        // missed later, but not due until tomorrow
        'word:保全': card(at(11, 8)),
        // missed later and due today, but the miss was taken back (undo)
        'word:推薦': card(at(10, 7)),
        // missed and due, but answered again today: he has studied it
        'word:審議': card(at(10, 8, 30), 1),
      },
      revlog: [
        [at(7), 'word:談話', 3, 2],
        [at(8), 'word:談話', 1, 2],
        [at(9), 'word:保全', 1, 2],
        [at(9, 11), 'word:推薦', 1, 2],
        [at(9, 11, 1), 'word:推薦', 0, 3],
        [at(9, 12), 'word:審議', 1, 2],
        [at(10, 8), 'word:審議', 1, 1],
      ],
    };
    expect(run(record)).toEqual({
      word: '談話',
      reading: 'だんわ',
      from: 'missed',
      why: 'You missed this on 8 Nov.',
    });
    expect(run(record, { ja: true }).why).toBe('11月8日にまちがえた語');
  });

  test('b · the word he saved last (before today) and has not studied, and when', () => {
    const record = {
      taken: [
        { t: 'word', id: '遺産', ts: at(3) },
        { t: 'word', id: '絶滅', ts: at(1) },
        // studied: it has a schedule
        { t: 'word', id: '登録', ts: at(5), started: at(5) },
        // saved today: Today keeps the day's word it had
        { t: 'word', id: '暫定', ts: at(10, 8) },
      ],
      srs: { 'word:登録': card(at(14)) },
      revlog: [[at(6), 'word:登録', 3, 0]],
    };
    expect(run(record)).toEqual({
      word: '遺産',
      reading: 'いさん',
      from: 'saved',
      why: 'You saved this on 3 Nov.',
    });
    expect(run(record, { ja: true }).why).toBe('11月3日に保存した語');
  });

  test('c · a word of today’s reading he has neither marked known nor saved', () => {
    const record = {
      taken: [{ t: 'word', id: '遺産', ts: at(3), started: at(3) }],
      srs: { 'word:遺産': card(at(20)) },
      revlog: [[at(3, 11), 'word:遺産', 3, 0]],
      met: {
        version: 1,
        entries: {
          [knownKey('稜線', 'りょうせん')]: {
            first: 1,
            last: 1,
            days: 1,
            said: { value: 'known', at: at(4), cursor: 1 },
          },
        },
      },
    };
    const seen = run(record);
    expect(seen.from).toBe('read');
    expect(seen.why).toBe("From today's reading.");
    expect(run(record, { ja: true }).why).toBe('今日の読み物から');
    expect(PASSAGE.readingFacets.forms).toContain(seen.word);
    // never a saved word, a word marked known, a kana-only word, or a word the core dictionary lacks
    expect(['遺産', '稜線', 'ある']).not.toContain(seen.word);
    expect(D.dict[seen.word]).toBeTruthy();
    expect(seen.reading).toBe(D.dict[seen.word].r);
    // his level first: an N1 or N2 word when the reading has one
    const level = (w) => Number(D.words[w]?.jlpt) || Number(String(D.dict[w]?.jlpt || '').slice(1));
    expect([1, 2]).toContain(level(seen.word));
  });

  test('d · the next new word of the deck he studies, named', () => {
    const deck = { term: '高学歴', reading: 'こうがくれき', deck: 'n2' };
    expect(run({}, { read: null, deck })).toEqual({
      word: '高学歴',
      reading: 'こうがくれき',
      from: 'deck',
      why: 'Next in your N2 deck.',
    });
    expect(run({}, { read: null, deck, ja: true }).why).toBe('N2デッキの次の語');
    expect(run({}, { read: null, deck: { ...deck, deck: 'senmon' } }).why).toBe(
      'Next in your Fields deck.',
    );
  });

  test('the empty record: today’s reading gives the word; with no reading and no deck there is none', () => {
    expect(run({}).from).toBe('read');
    expect(run({}, { read: null, deck: null })).toBeNull();
  });

  test('the first rule that yields wins: a miss outranks a saved word, a saved word the reading', () => {
    const record = {
      taken: [
        { t: 'word', id: '談話', ts: at(1), started: at(1) },
        { t: 'word', id: '遺産', ts: at(3) },
      ],
      srs: { 'word:談話': card(at(10, 8)) },
      revlog: [[at(8), 'word:談話', 1, 2]],
    };
    expect(run(record).from).toBe('missed');
    expect(run({ ...record, revlog: [[at(8), 'word:談話', 3, 2]] }).word).toBe('遺産');
  });

  test('one word all day for one record, and the next one once he studies or saves it', () => {
    const morning = run({}, { now: at(10, 6) });
    expect(run({}, { now: at(10, 23, 50) })).toEqual(morning);
    // he saves the reading's word: the next load moves on to another word of the reading
    const saved = run(
      { taken: [{ t: 'word', id: morning.word, ts: at(10, 12) }] },
      { now: at(10, 13) },
    );
    expect(saved.from).toBe('read');
    expect(saved.word).not.toBe(morning.word);
    // saving another word of the reading does not move the day's word
    const other = PASSAGE.readingFacets.forms.find(
      (w) => w !== morning.word && D.dict[w] && /\p{Script=Han}/u.test(w),
    );
    expect(
      run({ taken: [{ t: 'word', id: other, ts: at(10, 12) }] }, { now: at(10, 13) }).word,
    ).toBe(morning.word);
    // b: studying the saved word moves on to the one saved before it
    const record = {
      taken: [
        { t: 'word', id: '遺産', ts: at(3) },
        { t: 'word', id: '絶滅', ts: at(1) },
      ],
    };
    expect(run(record).word).toBe('遺産');
    const studied = {
      ...record,
      srs: { 'word:遺産': card(at(12)) },
      revlog: [[at(10, 8), 'word:遺産', 3, 0]],
    };
    expect(run(studied)).toMatchObject({ word: '絶滅', why: 'You saved this on 1 Nov.' });
  });
});
