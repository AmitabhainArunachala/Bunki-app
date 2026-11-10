/**
 * A reading in parentheses is not said twice (speech lane, 2026-11-11). The written tutor adds readings, as in
 * 機械（きかい）, and reading both says the word twice. In the text that is SPOKEN (never the text shown), kana in full-width
 * or half-width parentheses directly after a word with kanji, which is a plausible reading of that word (kana only, no
 * spaces, ending in the word's own kana tail), is left out of what is sent to the voice. Anything else in parentheses
 * is spoken as before. The rule sits in the seam's speech-text step, so replies, articles and word boxes all get it.
 */
/* global setTimeout */
import { describe, expect, it } from 'vitest';

import { VoiceError } from '../prototypes/corridor/modules/voice-client.mjs';
import { japaneseSentences } from '../prototypes/corridor/modules/voice-layer.mjs';
import * as seamModule from '../prototypes/corridor/modules/voice-seam.mjs';

const { createVoiceSeam } = seamModule;

describe('the reading after a word is left out of what is spoken', () => {
  const spoken = (text) => seamModule.withoutReadings(text);

  it('機械（きかい） and 機械(きかい) are sent as 機械', () => {
    expect(spoken('機械（きかい）')).toBe('機械');
    expect(spoken('機械(きかい)')).toBe('機械');
    expect(spoken('この機械（きかい）は便利です。')).toBe('この機械は便利です。');
    expect(spoken('機械（キカイ）')).toBe('機械');
  });

  it('a reading that follows a word with its kana tail is left out too', () => {
    expect(spoken('パンを食べる（たべる）。')).toBe('パンを食べる。');
  });

  it('two such words in one sentence', () => {
    expect(spoken('機械（きかい）と電気（でんき）を使う。')).toBe('機械と電気を使う。');
    expect(spoken('機械(きかい)と電気（でんき）')).toBe('機械と電気');
  });

  it('anything else in parentheses is spoken as before', () => {
    expect(spoken('（笑）')).toBe('（笑）');
    expect(spoken('すごい（笑）')).toBe('すごい（笑）');
    expect(spoken('（例：雨）')).toBe('（例：雨）');
    expect(spoken('雨（例：雨）')).toBe('雨（例：雨）');
    // a reading after a kana word is not a reading of a kanji
    expect(spoken('ねこ（ネコ）')).toBe('ねこ（ネコ）');
    // kana that is not the word's reading: it does not end in the word's own kana tail
    expect(spoken('漢字のあと（あと）')).toBe('漢字のあと（あと）');
    // not kana only, or with a space
    expect(spoken('機械（machine）')).toBe('機械（machine）');
    expect(spoken('機械（き かい）')).toBe('機械（き かい）');
    // not directly after the word
    expect(spoken('機械 （きかい）')).toBe('機械 （きかい）');
    expect(spoken('')).toBe('');
  });
});

describe('the day-limit line follows the server’s own figure', () => {
  it('after the server refuses for the day, the seam reads the budget (free) once, and its day ceiling is the server’s', async () => {
    let budgets = 0;
    const client = {
      configured: () => true,
      ready: async () => {},
      paired: () => true,
      scope: () => ({ installation: `bunki-${'e'.repeat(32)}` }),
      async speak() {
        throw new VoiceError('day-budget', 429);
      },
      async budget() {
        budgets += 1;
        return {
          capCents: 10000,
          spentCents: 1000,
          reservedCents: 0,
          remainingCents: 9000,
          dayCapCents: 1000,
          daySpentCents: 1000,
        };
      },
    };
    const player = {
      play: () => Promise.resolve('ended'),
      pause() {},
      resume() {},
      stop() {},
      setRate() {},
    };
    const seam = createVoiceSeam({ client, player, sleep: async () => {}, online: () => true });
    expect(seam.status().budget).toBe(null);
    await new Promise((done) =>
      seam.read({
        voiceKey: 'word:機械',
        sentences: [{ text: 'きかい' }],
        onState: (state) => {
          if (['done', 'stopped', 'error'].includes(state)) done();
        },
      }),
    );
    await new Promise((done) => setTimeout(done, 5));
    expect(budgets).toBe(1);
    expect(seam.status().budget).toMatchObject({ dayCapCents: 1000 });
  });
});

describe('every reply and sentence passes the rule', () => {
  it('a tutor reply: only the word, never its reading as a sentence of its own', () => {
    const reply =
      'A hook: 機械（きかい）は木の箱に入った機（はた）。\n\nAnd 機械(きかい) is a machine.';
    const said = japaneseSentences(reply).map((s) => s.text);
    expect(said).toEqual(['機械は木の箱に入った機。', '機械']);
    for (const text of said) expect(text).not.toMatch(/きかい|はた/u);
  });

  it('the seam sends the word without its reading, whatever surface asked (an article, a word box, a reply)', async () => {
    const asked = [];
    const client = {
      configured: () => true,
      ready: async () => {},
      paired: () => true,
      scope: () => ({ installation: `bunki-${'d'.repeat(32)}` }),
      async speak({ text, voiceKey }) {
        asked.push(`${voiceKey} ${text}`);
        if (!text) throw new VoiceError('not-speakable');
        return {
          bytes: new Uint8Array([1, 2, 3]),
          contentType: 'audio/wav',
          voiceId: 'v',
          inputKey: text,
        };
      },
      async budget() {
        return { capCents: 2500, spentCents: 0, reservedCents: 0, remainingCents: 2500 };
      },
    };
    const player = {
      play: () => Promise.resolve('ended'),
      pause() {},
      resume() {},
      stop() {},
      setRate() {},
    };
    const seam = createVoiceSeam({ client, player, sleep: async () => {}, online: () => true });
    await new Promise((done) =>
      seam.read({
        voiceKey: 'article:a1',
        sentences: [{ text: 'この機械（きかい）は便利です。' }, { text: '電気（でんき）を使う。' }],
        onState: (state) => {
          if (['done', 'stopped', 'error'].includes(state)) done();
        },
      }),
    );
    expect(asked).toEqual(['article:a1 この機械は便利です。', 'article:a1 電気を使う。']);
    // and a read by itself asks about the same sentence, read the same way
    expect(seam.cannot('article:a1', 'この機械（きかい）は便利です。')).toBe(null);
  });
});
