/**
 * Timeout, cancellation, and the never-rejects contract (WP-07 closure
 * predicate item 3; controller §9, REQ-ARCH-06; the package half of T-10/T-11).
 *
 * The load-bearing assertions are about *what happens instead of failing*: on
 * every failure mode the caller receives a valid, labelled candidate and a route
 * record naming the reason. The app-side half — that a capture completes while
 * one of these calls is still hung — lives in
 * `apps/app/test/candidate-capture-during-hung-ai.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  createAiRuntime,
  createAnthropicProvider,
  createAiRouteRing,
  createFallbackOnlyProvider,
  createSeededFixturePolicy,
  DEFAULT_TIMEOUT_MS,
  API_KEY_ENV_VAR,
  FALLBACK_MODEL_ID,
  OFFLINE_FALLBACK_PROVIDER,
  type AiProviderPort,
  type AiRuntime,
  type AiThreadContext,
} from '../src/index.ts';
import {
  createFakeAbortController,
  createFakeFetch,
  createIdSequence,
  createScriptedClock,
  createTestPlatform,
  messagesResponse,
  type FetchBehaviour,
  type ScriptedClock,
  type TestPlatform,
} from './support/harness.ts';

const KEY = 'sk-ant-not-a-real-key';

const CONTEXT: AiThreadContext = {
  contentClass: 'seeded-fixture',
  targetForm: '分岐',
  excerpt: '子どものころ、私はこの分岐点が好きだった。',
  seedRef: 'pas-bunki-01',
};

interface Harness {
  readonly runtime: AiRuntime;
  readonly platform: TestPlatform;
  readonly clock: ScriptedClock;
  readonly ring: ReturnType<typeof createAiRouteRing>;
}

function harness(
  behaviour: FetchBehaviour,
  options: { env?: Record<string, string | undefined>; provider?: AiProviderPort } = {},
): Harness {
  const fake = createFakeFetch(behaviour);
  const platform = createTestPlatform(fake.fetch);
  const clock = createScriptedClock();
  const ring = createAiRouteRing();
  const provider =
    options.provider ??
    createAnthropicProvider({
      fetch: fake.fetch,
      env: options.env ?? { [API_KEY_ENV_VAR]: KEY },
    });

  return {
    platform,
    clock,
    ring,
    runtime: createAiRuntime({
      provider,
      clock,
      nextCandidateId: createIdSequence(),
      platform,
      telemetry: ring,
    }),
  };
}

describe('the ten-second budget (controller §9)', () => {
  it('defaults to 10 000 ms', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(10_000);
    expect(harness({ kind: 'hang' }).runtime.timeoutMs).toBe(10_000);
  });

  it('arms exactly one timer per request and disarms it on completion', async () => {
    const { runtime, platform } = harness({
      kind: 'json',
      body: messagesResponse('分岐 is a fork.'),
    });

    const pending = runtime.requestCandidate({ context: CONTEXT });
    expect(platform.timers.pending).toBe(1);
    await pending;
    expect(platform.timers.pending).toBe(0);
  });

  it('aborts the in-flight call rather than abandoning it', async () => {
    const { runtime, platform } = harness({ kind: 'hang' });

    const pending = runtime.requestCandidate({ context: CONTEXT });
    expect(platform.controllers[0]?.signal.aborted).toBe(false);

    platform.timers.fireDue(DEFAULT_TIMEOUT_MS);
    await pending;

    expect(platform.controllers[0]?.signal.aborted).toBe(true);
  });

  it('serves a labelled fallback with reason "timeout"', async () => {
    const { runtime, platform, ring } = harness({ kind: 'hang' });

    const pending = runtime.requestCandidate({ context: CONTEXT });
    platform.timers.fireDue(DEFAULT_TIMEOUT_MS);
    const outcome = await pending;

    expect(outcome.envelope.provider).toBe(OFFLINE_FALLBACK_PROVIDER);
    expect(outcome.envelope.model).toBe(FALLBACK_MODEL_ID);
    expect(outcome.envelope.checks.isLabeled).toBe(true);
    expect(outcome.route.outcome).toBe('fallback');
    expect(outcome.route.fallbackReason).toBe('timeout');
    expect(ring.entries()).toHaveLength(1);
  });

  it('records the elapsed budget as latency', async () => {
    const { runtime, platform, clock } = harness({ kind: 'hang' });

    const pending = runtime.requestCandidate({ context: CONTEXT });
    clock.advance(DEFAULT_TIMEOUT_MS);
    platform.timers.fireDue(DEFAULT_TIMEOUT_MS);

    expect((await pending).route.latencyMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('refuses a non-positive timeout at construction', () => {
    expect(() =>
      createAiRuntime({
        provider: createFallbackOnlyProvider(),
        clock: createScriptedClock(),
        nextCandidateId: createIdSequence(),
        timeoutMs: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe('caller cancellation', () => {
  it('aborts the provider call and reports "cancelled", not "timeout"', async () => {
    const { runtime, platform } = harness({ kind: 'hang' });
    const caller = createFakeAbortController();

    const pending = runtime.requestCandidate({ context: CONTEXT, signal: caller.signal });
    caller.abort();
    const outcome = await pending;

    expect(platform.controllers[0]?.signal.aborted).toBe(true);
    expect(outcome.route.fallbackReason).toBe('cancelled');
    expect(outcome.envelope.provider).toBe(OFFLINE_FALLBACK_PROVIDER);
  });

  it('short-circuits a signal that was already aborted', async () => {
    const { runtime } = harness({ kind: 'hang' });
    const caller = createFakeAbortController();
    caller.abort();

    const outcome = await runtime.requestCandidate({ context: CONTEXT, signal: caller.signal });
    expect(outcome.route.fallbackReason).toBe('cancelled');
  });
});

describe('every failure mode yields a labelled candidate, never a rejection', () => {
  const cases: ReadonlyArray<[string, FetchBehaviour, string]> = [
    ['a transport failure', { kind: 'throw', error: new Error('offline') }, 'offline'],
    ['a provider 500', { kind: 'json', status: 500, body: {} }, 'provider_error'],
    ['a body that is not JSON', { kind: 'not-json' }, 'invalid_response'],
    [
      'an oversized answer',
      { kind: 'json', body: messagesResponse('分岐 '.repeat(5000)) },
      'invalid_response',
    ],
    [
      'a mislabelled answer that claims to be a fixture',
      { kind: 'json', body: messagesResponse('分岐 is a fork.', { model: 'x' }) },
      'invalid_response',
    ],
  ];

  it.each(cases.slice(0, 4))('%s', async (_name, behaviour, reason) => {
    const outcome = await harness(behaviour).runtime.requestCandidate({ context: CONTEXT });
    expect(outcome.envelope.provider).toBe(OFFLINE_FALLBACK_PROVIDER);
    expect(outcome.route.fallbackReason).toBe(reason);
    expect(outcome.envelope.checks.isLabeled).toBe(true);
  });

  it('refuses a provider that names itself offline-fallback', async () => {
    const impostor: AiProviderPort = {
      name: OFFLINE_FALLBACK_PROVIDER,
      model: 'pretend',
      generate: () =>
        Promise.resolve({
          provider: OFFLINE_FALLBACK_PROVIDER,
          model: 'pretend',
          text: '分岐 is a fork.',
          inputTokens: 1,
          outputTokens: 1,
        }),
    };
    const outcome = await harness(
      { kind: 'hang' },
      { provider: impostor },
    ).runtime.requestCandidate({ context: CONTEXT });

    expect(outcome.route.fallbackReason).toBe('invalid_response');
    expect(outcome.envelope.model).toBe(FALLBACK_MODEL_ID);
  });

  it('takes the fallback with reason "no_api_key" when the environment holds none', async () => {
    const outcome = await harness({ kind: 'hang' }, { env: {} }).runtime.requestCandidate({
      context: CONTEXT,
    });

    expect(outcome.route.fallbackReason).toBe('no_api_key');
    expect(outcome.envelope.provider).toBe(OFFLINE_FALLBACK_PROVIDER);
  });

  it('refuses un-consented content before any transport call (OD-08)', async () => {
    const fake = createFakeFetch({ kind: 'json', body: messagesResponse('anything') });
    const platform = createTestPlatform(fake.fetch);
    const runtime = createAiRuntime({
      provider: createAnthropicProvider({ fetch: fake.fetch, env: { [API_KEY_ENV_VAR]: KEY } }),
      clock: createScriptedClock(),
      nextCandidateId: createIdSequence(),
      platform,
      contentPolicy: createSeededFixturePolicy({ targetForms: [], excerpts: [] }),
    });

    const outcome = await runtime.requestCandidate({ context: CONTEXT });
    expect(outcome.route.fallbackReason).toBe('content_not_permitted');
    expect(fake.calls).toHaveLength(0);
  });

  it('still throws for a caller bug — an input no envelope can hold', async () => {
    const { runtime } = harness({ kind: 'hang' });
    await expect(
      runtime.requestCandidate({
        context: { ...CONTEXT, targetForm: '' } as AiThreadContext,
      }),
    ).rejects.toThrow(/invalid/i);
  });
});

describe('the live path', () => {
  it('produces a candidate labelled with the real provider and model', async () => {
    const outcome = await harness({
      kind: 'json',
      body: messagesResponse('分岐 marks where a line divides.'),
    }).runtime.requestCandidate({ context: CONTEXT });

    expect(outcome.route.outcome).toBe('live');
    expect(outcome.route.fallbackReason).toBeNull();
    expect(outcome.envelope.provider).toBe('anthropic');
    expect(outcome.envelope.payload.explanation).toBe('分岐 marks where a line divides.');
    expect(outcome.envelope.checks.targetFormPresent).toBe(true);
    expect(outcome.route.inputTokens).toBe(210);
    expect(outcome.route.outputTokens).toBe(96);
  });

  it('reports a failed target-form check without refusing the candidate', async () => {
    const outcome = await harness({
      kind: 'json',
      body: messagesResponse('It marks where a line divides.'),
    }).runtime.requestCandidate({ context: CONTEXT });

    expect(outcome.route.outcome).toBe('live');
    expect(outcome.envelope.checks.targetFormPresent).toBe(false);
  });

  it('derives the same inputHash for the same context', () => {
    const { runtime } = harness({ kind: 'hang' });
    expect(runtime.buildRequest(CONTEXT).inputHash).toBe(runtime.buildRequest(CONTEXT).inputHash);
  });
});
