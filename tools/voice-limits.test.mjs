/**
 * The amounts a no-voice line names come from the voice server, never from Bunki (speech lane, 2026-11-11). After the
 * next server release the ceilings are 10,000 cents in total and 1,000 a day, or 30,000 and 3,000 if the owner chooses
 * that; Bunki hard-codes neither. A line names the amount the server's budget answer gave (for the day, the refusal's
 * own figure when it carries one); when the server has said no amount, the line names none ("today's voice limit is
 * used") rather than a wrong one.
 */
/* global fetch, setTimeout, URL */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  VoiceError,
  createMemoryTokenStore,
  createVoiceClient,
} from '../prototypes/corridor/modules/voice-client.mjs';
import * as layer from '../prototypes/corridor/modules/voice-layer.mjs';
import { createVoiceSeam } from '../prototypes/corridor/modules/voice-seam.mjs';
import { startFakeVoiceServer } from '../prototypes/corridor/tools/fake-voice-server.mjs';

const PAGE = 'http://127.0.0.1:18841';
const at = '09:00';

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

describe('the no-voice lines name only the server’s own amounts', () => {
  const line = (reason, limits, english = true) => {
    expect(typeof layer.limitLine).toBe('function');
    const words = layer.limitLine(reason, limits, at);
    return english ? words.en : words.ja;
  };

  it('the day line names the day ceiling the server gave: 1,000 or 3,000 cents, as it said', () => {
    expect(line('day-budget', { dayCapCents: 1000 })).toBe(
      'No voice: today’s $10 is used. The voice comes back at 09:00.',
    );
    expect(line('day-budget', { dayCapCents: 3000 })).toBe(
      'No voice: today’s $30 is used. The voice comes back at 09:00.',
    );
    expect(line('day-budget', { dayCapCents: 1000 }, false)).toBe(
      '声を出せません。今日の10ドル分を使いました。声は09:00に戻ります。',
    );
  });

  it('the total line names the total the server gave: 10,000 or 30,000 cents', () => {
    expect(line('budget-exhausted', { capCents: 10000 })).toBe('No voice: the $100 total is used.');
    expect(line('budget-exhausted', { capCents: 30000 })).toBe('No voice: the $300 total is used.');
    expect(line('budget-exhausted', { capCents: 10000 }, false)).toBe(
      '声を出せません。合計100ドルを使い切りました。',
    );
  });

  it('with no amount from the server, the lines name none', () => {
    expect(line('day-budget', {})).toBe(
      'No voice: today’s voice limit is used. The voice comes back at 09:00.',
    );
    expect(line('day-budget', {}, false)).toBe(
      '声を出せません。今日の音声の上限を使いました。声は09:00に戻ります。',
    );
    expect(line('budget-exhausted', {})).toBe('No voice: the voice budget’s total is used.');
    expect(line('budget-exhausted', {}, false)).toBe(
      '声を出せません。音声の予算の合計を使い切りました。',
    );
    for (const text of [
      line('day-budget', {}),
      line('budget-exhausted', {}),
      line('day-budget', {}, false),
    ])
      expect(text).not.toMatch(/\$|ドル/u);
  });

  it('the amounts are read from the budget answer, then from the refusal, and from nothing else', () => {
    expect(typeof layer.voiceLimits).toBe('function');
    expect(layer.voiceLimits({ budget: null, limits: null })).toEqual({
      dayCapCents: null,
      capCents: null,
    });
    expect(
      layer.voiceLimits({
        budget: { capCents: 10000, spentCents: 0, reservedCents: 0, remainingCents: 10000 },
        limits: null,
      }),
    ).toEqual({ dayCapCents: null, capCents: 10000 });
    expect(
      layer.voiceLimits({
        budget: { capCents: 30000, dayCapCents: 3000 },
        limits: { dayCapCents: 1000 },
      }),
    ).toEqual({ dayCapCents: 3000, capCents: 30000 });
    expect(
      layer.voiceLimits({ budget: null, limits: { dayCapCents: 1000, capCents: 10000 } }),
    ).toEqual({ dayCapCents: 1000, capCents: 10000 });
  });

  it('Bunki holds no ceiling of its own: no fallback amount stands in the layer, and the seam names none', () => {
    const source = readFileSync(
      new URL('../prototypes/corridor/modules/voice-layer.mjs', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/\?\?\s*(300|2500|1000|3000|10000|30000)\b/u);
    const seam = readFileSync(
      new URL('../prototypes/corridor/modules/voice-seam.mjs', import.meta.url),
      'utf8',
    );
    expect(seam).not.toMatch(/\$\d/u);
  });
});

describe('a refusal’s own figure', () => {
  it('a day refusal that carries the day ceiling hands it on, and the seam keeps it beside the budget', async () => {
    const answer = (status, body) => ({
      status,
      headers: { get: () => 'application/json' },
      json: async () => body,
      arrayBuffer: async () => new ArrayBuffer(0),
    });
    let next = answer(200, {
      scope: {
        environment: 'prod',
        learner: 'test-learner',
        installation: `bunki-${'f'.repeat(32)}`,
      },
      token: `nsrs_prod_${'a'.repeat(8)}.${'b'.repeat(64)}`,
    });
    const client = createVoiceClient({ store: createMemoryTokenStore(), fetch: async () => next });
    expect(
      (
        await client.pair({
          learner:
            'Bunki voice code: ABCDEF123456 (10 minutes) · learner: test-learner · server: http://127.0.0.1:1',
        })
      ).ok,
    ).toBe(true);
    next = answer(429, { error: 'day-budget', dayCapCents: 1000 });
    const refused = await client
      .speak({ text: 'きかい', voiceKey: 'word:機械' })
      .catch((error) => error);
    expect(refused).toBeInstanceOf(VoiceError);
    expect(refused.code).toBe('day-budget');
    expect(refused.figures).toEqual({ dayCapCents: 1000 });
    // a figure that is not a whole number of cents is not taken
    next = answer(429, { error: 'day-budget', dayCapCents: '1000' });
    expect(
      (await client.speak({ text: 'きかい', voiceKey: 'word:機械' }).catch((error) => error))
        .figures,
    ).toEqual({});
    const player = {
      play: () => Promise.resolve('ended'),
      pause() {},
      resume() {},
      stop() {},
      setRate() {},
    };
    const stub = {
      ...client,
      speak: async () => {
        throw Object.assign(new VoiceError('day-budget', 429), { figures: { dayCapCents: 1000 } });
      },
      budget: async () => {
        throw new VoiceError('budget-unavailable', 503);
      },
    };
    const seam = createVoiceSeam({
      client: stub,
      player,
      sleep: async () => {},
      online: () => true,
    });
    await new Promise((done) =>
      seam.read({
        voiceKey: 'word:機械',
        sentences: [{ text: 'きかい' }],
        onState: (state) => {
          if (['done', 'stopped', 'error'].includes(state)) done();
        },
      }),
    );
    expect(seam.status().limits).toEqual({ dayCapCents: 1000 });
    expect(layer.voiceLimits(seam.status())).toEqual({ dayCapCents: 1000, capCents: null });
  });

  it('tonight’s server refuses with no figure: nothing is invented', async () => {
    const fake = await startFakeVoiceServer({ origins: [PAGE] });
    try {
      const client = createVoiceClient({
        store: createMemoryTokenStore(),
        fetch: (input, init = {}) =>
          fetch(input, { ...init, headers: { ...(init.headers || {}), Origin: PAGE } }),
      });
      const line = `Bunki voice code: ${fake.issue({ learner: 'test-learner' })} (10 minutes) · learner: test-learner · server: ${fake.origin}`;
      expect((await client.pair({ learner: line, code: '' })).ok).toBe(true);
      fake.set({ daySpent: 300 });
      const refused = await client
        .speak({ text: 'きかい', voiceKey: 'word:機械' })
        .catch((error) => error);
      expect(refused.code).toBe('day-budget');
      expect(refused.figures).toEqual({});
    } finally {
      await fake.close();
    }
  });
});
