/**
 * Review of voice/speech-lane-store-tutor-20261111 at c6d588d44 (independent reviewer, 2026-11-11): what the tutor's
 * reply SENDS to the voice, for readings in parentheses. Each test drives the app's own path for a tutor reply: the
 * voice layer's japaneseSentences (the reply rule's read) into the seam's read, with a stand-in client that records the
 * text of every speak request. No sound, no server.
 */
import { describe, expect, it } from 'vitest';

import { japaneseSentences } from '../prototypes/corridor/modules/voice-layer.mjs';
import { createVoiceSeam } from '../prototypes/corridor/modules/voice-seam.mjs';

/** The texts a tutor reply sends to the voice server, in order, as the reply rule reads it. */
async function sentFor(reply) {
  const sent = [];
  const client = {
    configured: () => true,
    ready: async () => {},
    paired: () => true,
    async speak({ text }) {
      sent.push(text);
      return {
        bytes: new Uint8Array([1, 2, 3]),
        contentType: 'audio/wav',
        voiceId: 'v',
        inputKey: 'k',
      };
    },
    async budget() {
      return { capCents: 1, spentCents: 0, reservedCents: 0, remainingCents: 1 };
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
      voiceKey: 'conv:tutor-open',
      sentences: japaneseSentences(reply),
      onState: (state) => {
        if (['done', 'stopped', 'error'].includes(state)) done();
      },
    }),
  );
  return sent;
}

describe('review: a reading in parentheses is not said twice, and nothing shown is dropped', () => {
  // RED BY DECISION (the coordinator's ruling on findings 2 and 3, 2026-11-11): what is sent to the voice is exactly
  // what is shown, so a reading the tutor writes is said as written, twice where it is shown twice. The tutor project
  // will have the tutor mark readings explicitly. `it.fails` keeps this check running and passes only while it fails:
  // when the tutor project makes it pass, this line must become `it` again.
  it.fails(
    'a reading written as English text writes it (a space before the bracket) is not sent as its own sentence',
    async () => {
      // The tutor is told to "add readings in parentheses where helpful" and to "use English where it helps"; English
      // puts a space before "(". The reply shows 機械 (きかい) twice.
      const sent = await sentFor(
        'The word 機械 (きかい) means machine. 例：工場の機械 (きかい) を使う。',
      );
      expect(sent.filter((text) => /きかい/u.test(text))).toEqual([]);
    },
  );

  it('an aside in kana after a word that ends in kanji is said: the screen shows it, so the voice says it', async () => {
    const sent = await sentFor('明日は雪（たぶん）。');
    expect(sent.join('')).toContain('たぶん');
  });
});
