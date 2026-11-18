import { TextDecoder, TextEncoder } from 'node:util';
/** Reviewed migration of the 92b524 coordinator policy, not a new reading-strip rule.
 * Test-only mock clip payloads trace actual queue/player calls; no acoustic/native audio claim. */
import { describe, expect, it } from 'vitest';
import { japaneseSentences } from '../prototypes/corridor/modules/voice-layer.mjs';
import { createVoiceSeam } from '../prototypes/corridor/modules/voice-seam.mjs';
const { structuredClone } = globalThis;
const MIXED_REPLY = 'The word 機械 (きかい) means machine. 例：工場の機械 (きかい) を使う。';
// Independently authored from retained policy/rules, never computed from candidate output.
const EXPECTED_PLAYS = ['機械', 'きかい', '工場の機械', 'きかい', 'を使う。'];
const EXPECTED_REQUESTS = ['機械', 'きかい', '工場の機械', 'を使う。'];
const ASIDE_REPLY = '明日は雪（たぶん）。';

async function readTraceFor(reply, { wrongTypeClient = false } = {}) {
  const requested = [],
    played = [],
    states = [];
  const client = {
    configured: () => true,
    ready: async () => {},
    paired: () => true,
    async speak({ text }) {
      if (wrongTypeClient) throw new TypeError('deliberate test-client type fault');
      requested.push(text);
      // Fixture bytes are text-bound opaque clip identities, not real audio.
      return {
        bytes: new TextEncoder().encode(text),
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
    play: (clip) => {
      played.push(new TextDecoder().decode(clip.bytes));
      return Promise.resolve('ended');
    },
    pause() {},
    resume() {},
    stop() {},
    setRate() {},
  };
  const seam = createVoiceSeam({ client, player, sleep: async () => {}, online: () => true });
  const trace = { requested, played, states, terminal: null, sentences: null };
  const sentences = japaneseSentences(reply);
  trace.sentences = sentences.map(({ text }) => text);
  await new Promise((done) =>
    seam.read({
      voiceKey: 'conv:tutor-open',
      sentences,
      onState: (state) => {
        states.push(state);
        if (['done', 'stopped', 'error'].includes(state)) {
          trace.terminal = state;
          done();
        }
      },
    }),
  );
  return trace;
}
// The original aside test still asks what is sent, not a manufactured playback list.
async function sentFor(reply) {
  return (await readTraceFor(reply)).requested;
}

function requireSpecificOriginalNegative(sent) {
  expect(Array.isArray(sent), 'Actual request trace is an array').toBe(true);
  expect(
    sent.every((text) => typeof text === 'string'),
    'Actual requests are text',
  ).toBe(true);
  let originalFailure;
  try {
    // EXACT original predicate, now specifically required to fail under the accepted ruling.
    expect(sent.filter((text) => /きかい/u.test(text))).toEqual([]);
  } catch (error) {
    originalFailure = error;
  }
  expect(
    originalFailure?.name,
    'Original negative fails by assertion, not a fixture/transport type error',
  ).toBe('AssertionError');
  expect(originalFailure?.expected).toEqual([]);
  expect(originalFailure?.actual).toEqual(['きかい']);
}
function requireMixedPolicyTrace(trace) {
  expect(trace.terminal, 'Actual successful seam read completes').toBe('done');
  expect(trace.sentences, 'Complete actual Japanese-only sentence order').toEqual(EXPECTED_PLAYS);
  expect(
    trace.played,
    'Complete actual mock-player calls, including the cached repeated reading',
  ).toEqual(EXPECTED_PLAYS);
  expect(
    [...trace.requested].sort(),
    'Exact request multiset; prefetch order is not policy',
  ).toEqual([...EXPECTED_REQUESTS].sort());
  requireSpecificOriginalNegative(trace.requested);
}
function requireAsideTrace(trace) {
  expect(trace.terminal).toBe('done');
  expect(trace.sentences).toEqual([ASIDE_REPLY]);
  expect(trace.played).toEqual([ASIDE_REPLY]);
  expect(trace.requested).toEqual([ASIDE_REPLY]);
}

describe('coordinator policy: displayed tutor readings and kana asides are sent as written', () => {
  it('the original mixed reply keeps both displayed reading occurrences, without an expected-failure flag', async () => {
    const trace = await readTraceFor(MIXED_REPLY);
    requireMixedPolicyTrace(trace);
  });

  it('an aside in kana after a word that ends in kanji is said: the screen shows it, so the voice says it', async () => {
    const sent = await sentFor('明日は雪（たぶん）。');
    expect(sent.join('')).toContain('たぶん');
  });

  it('the original kana aside has its exact complete queue/player/request trace', async () =>
    requireAsideTrace(await readTraceFor(ASIDE_REPLY)));

  const faults = [
    [
      'deduplicate the played reading',
      (t) => {
        t.played = [...new Set(t.played)];
      },
    ],
    [
      'drop the first displayed reading',
      (t) => {
        t.played.splice(1, 1);
      },
    ],
    [
      'drop both displayed readings',
      (t) => {
        t.played = t.played.filter((s) => s !== 'きかい');
      },
    ],
    [
      'add English to playback',
      (t) => {
        t.played.push('means machine');
      },
    ],
    [
      'reorder Japanese playback',
      (t) => {
        [t.played[0], t.played[2]] = [t.played[2], t.played[0]];
      },
    ],
    [
      'duplicate Japanese playback',
      (t) => {
        t.played.push(t.played[0]);
      },
    ],
    [
      'ask again for the cached reading',
      (t) => {
        t.requested.push('きかい');
      },
    ],
    [
      'drop a real requested Japanese run',
      (t) => {
        t.requested.pop();
      },
    ],
  ];
  for (const [name, fault] of faults)
    it('trace control rejects: ' + name, async () => {
      const actual = await readTraceFor(MIXED_REPLY);
      requireMixedPolicyTrace(actual);
      const corrupted = structuredClone(actual);
      fault(corrupted);
      let caught;
      try {
        requireMixedPolicyTrace(corrupted);
      } catch (error) {
        caught = error;
      }
      expect(caught?.name).toBe('AssertionError');
      // Actual production result was not mutated by the trace counterfactual.
      requireMixedPolicyTrace(actual);
    });

  it('trace control rejects dropping the displayed kana aside', async () => {
    const actual = await readTraceFor(ASIDE_REPLY);
    requireAsideTrace(actual);
    const corrupted = structuredClone(actual);
    corrupted.played = ['明日は雪。'];
    expect(() => requireAsideTrace(corrupted)).toThrow();
    requireAsideTrace(actual);
  });
  it('the obsolete outer negation cannot promote a wrong-type trace into policy success', () => {
    expect(() => requireSpecificOriginalNegative(null)).toThrow();
    expect(() => requireSpecificOriginalNegative(['機械', 3])).toThrow();
  });
  it('an actual wrong-type client failure cannot satisfy the ordinary positive policy', async () => {
    const actual = await readTraceFor(MIXED_REPLY);
    requireMixedPolicyTrace(actual);
    const failed = await readTraceFor(MIXED_REPLY, { wrongTypeClient: true });
    expect(failed.terminal).toBe('error');
    expect(() => requireMixedPolicyTrace(failed)).toThrow();
  });
});
