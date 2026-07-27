/**
 * T-10 and T-11 at the app seam (WP-07 closure predicate item 3; controller
 * §9, REQ-ARCH-06).
 *
 * - **T-10** — capture, lookup and the rest work with AI unavailable.
 * - **T-11** — a timed-out AI call neither loses nor blocks capture.
 *
 * The second is the one that needs care, because it is easy to write a test
 * that proves nothing: awaiting the AI call and *then* capturing would pass
 * whatever the implementation did. So the capture here happens **while the AI
 * promise is still pending** — the assertions run between the request starting
 * and the timeout firing, with the provider's promise unresolved and its
 * `catch` not yet attached to anything. If `execute` were ever made to await
 * enrichment, or if the panel's request were ever put on capture's path, this
 * file goes red.
 *
 * The other half of T-10/T-11 — that the adapter serves a labelled fallback for
 * every failure mode — is `packages/ai/test/runtime.test.ts`. This file is
 * about what the *app* keeps doing while that happens.
 */

import { describe, expect, it } from 'vitest';

import {
  createAiRuntime,
  createAiRouteRing,
  createFallbackOnlyProvider,
  OFFLINE_FALLBACK_PROVIDER,
  toCandidateEnvelopeMetadata,
  type AiAbortController,
  type AiAbortSignal,
  type AiPlatform,
  type AiProviderPort,
  type AiThreadContext,
  type AiTimerHandle,
} from '@bunki/ai';
import { createDeterministicContext, type DomainContext } from '@bunki/domain';

import { seededContentPolicy } from '../src/candidate/candidate-context.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import type { AppStore } from '../src/state/store.ts';

// ---------------------------------------------------------------------------
// Local doubles. Deliberately small and local: this file is about the app's
// behaviour while a call hangs, and borrowing another package's harness would
// couple two test suites for four short functions.
// ---------------------------------------------------------------------------

function fakeAbortController(): AiAbortController {
  const listeners = new Set<() => void>();
  let aborted = false;
  const signal: AiAbortSignal = {
    get aborted() {
      return aborted;
    },
    addEventListener: (_t, l) => void listeners.add(l),
    removeEventListener: (_t, l) => void listeners.delete(l),
  };
  return {
    signal,
    abort() {
      if (aborted) return;
      aborted = true;
      for (const listener of [...listeners]) listener();
    },
  };
}

interface TestPlatform extends AiPlatform {
  fireTimers(): void;
}

function testPlatform(): TestPlatform {
  const pending = new Map<number, () => void>();
  let next = 0;
  return {
    fetch: () => Promise.reject(new Error('no test in apps/app may reach the network')),
    timers: {
      start(callback: () => void): AiTimerHandle {
        next += 1;
        pending.set(next, callback);
        return next;
      },
      stop(handle: AiTimerHandle) {
        if (typeof handle === 'number') pending.delete(handle);
      },
    },
    newAbortController: fakeAbortController,
    fireTimers() {
      for (const [id, callback] of [...pending]) {
        pending.delete(id);
        callback();
      }
    },
  };
}

/** A provider that never answers until its call is aborted. */
function hungProvider(): AiProviderPort {
  return {
    name: 'hung-test-provider',
    model: 'none',
    generate: (_request, callInfo) =>
      new Promise((_resolve, reject) => {
        const onAbort = (): void => reject(new Error('AbortError'));
        if (callInfo.signal.aborted) onAbort();
        else callInfo.signal.addEventListener('abort', onAbort);
      }),
  };
}

const SOURCE = { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' } as const;
const PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

const CONTEXT: AiThreadContext = {
  contentClass: 'seeded-fixture',
  targetForm: '分岐',
  excerpt: '子どものころ、私はこの分岐点が好きだった。',
  seedRef: 'pas-bunki-01',
};

function newDomainContext(): DomainContext {
  return createDeterministicContext({
    instants: Array.from(
      { length: 60 },
      (_v, index) => `2026-07-27T09:00:${String(index).padStart(2, '0')}.000Z`,
    ),
    seed: 3,
  });
}

function newStore(context: DomainContext): AppStore {
  return createMemoryAppStore({ context });
}

const capture = (store: AppStore, text: string, lexemeId: string) =>
  store.execute({
    kind: 'capture',
    text,
    sourceRef: SOURCE,
    provenance: PROVENANCE,
    uncertainty: null,
    lexemeId,
  });

describe('T-11: a timed-out AI call neither loses nor blocks capture', () => {
  it('captures while the AI call is still hung, then falls back cleanly', async () => {
    const context = newDomainContext();
    const store = newStore(context);
    const platform = testPlatform();
    const ring = createAiRouteRing();
    const runtime = createAiRuntime({
      provider: hungProvider(),
      clock: { now: () => context.clock.now(), elapsedMs: () => 0 },
      nextCandidateId: () => context.ids.nextId('candidate'),
      platform,
      contentPolicy: seededContentPolicy(),
      telemetry: ring,
    });

    const seed = capture(store, '分岐', 'lex-bunki');

    // --- the AI call starts and does not settle -----------------------------
    let settled = false;
    const pending = runtime.requestCandidate({ context: CONTEXT }).finally(() => {
      settled = true;
    });

    // --- captures happen *during* the hung call -----------------------------
    const during = capture(store, '岐路', 'lex-kiro');
    const during2 = capture(store, '分岐点', 'lex-bunkiten');

    expect(settled).toBe(false);
    expect(during.events).toHaveLength(1);
    expect(during.acknowledgedAt).toBeTypeOf('string');
    expect(during2.events).toHaveLength(1);
    expect(store.getSnapshot().threads).toHaveLength(3);
    expect(store.readAll().map((event) => event.type)).toEqual([
      'EncounterCaptured',
      'EncounterCaptured',
      'EncounterCaptured',
    ]);

    // --- the ten-second budget expires --------------------------------------
    platform.fireTimers();
    const outcome = await pending;

    expect(outcome.route.fallbackReason).toBe('timeout');
    expect(outcome.envelope.provider).toBe(OFFLINE_FALLBACK_PROVIDER);
    expect(outcome.envelope.checks.isLabeled).toBe(true);

    // --- nothing was lost, and the loop keeps going -------------------------
    expect(store.getSnapshot().threads).toHaveLength(3);
    expect(capture(store, '分かれる', 'lex-wakareru').events).toHaveLength(1);

    store.execute({
      kind: 'attachCandidate',
      threadId: seed.threadId,
      candidateId: outcome.envelope.candidateId,
      envelope: toCandidateEnvelopeMetadata(outcome.request, outcome.envelope),
      text: outcome.envelope.payload.explanation,
    });
    expect(store.getSnapshot().candidatesByThread[seed.threadId]).toHaveLength(1);
    expect(ring.entries()).toHaveLength(1);
    expect(ring.entries()[0]?.fallbackReason).toBe('timeout');
  });

  it('cancels the hung call when the caller aborts, without touching the store', async () => {
    const context = newDomainContext();
    const store = newStore(context);
    const platform = testPlatform();
    const runtime = createAiRuntime({
      provider: hungProvider(),
      clock: { now: () => context.clock.now(), elapsedMs: () => 0 },
      nextCandidateId: () => context.ids.nextId('candidate'),
      platform,
      contentPolicy: seededContentPolicy(),
    });

    capture(store, '分岐', 'lex-bunki');
    const before = store.getSnapshot().eventCount;

    const caller = fakeAbortController();
    const pending = runtime.requestCandidate({ context: CONTEXT, signal: caller.signal });
    caller.abort();

    expect((await pending).route.fallbackReason).toBe('cancelled');
    expect(store.getSnapshot().eventCount).toBe(before);
    expect(store.getSnapshot().candidates).toEqual([]);
  });
});

describe('T-10: the loop works with AI unavailable', () => {
  it('serves a labelled fallback when no key is configured', async () => {
    const context = newDomainContext();
    const runtime = createAiRuntime({
      provider: createFallbackOnlyProvider(),
      clock: { now: () => context.clock.now(), elapsedMs: () => 0 },
      nextCandidateId: () => context.ids.nextId('candidate'),
      platform: testPlatform(),
      contentPolicy: seededContentPolicy(),
    });

    const outcome = await runtime.requestCandidate({ context: CONTEXT });
    expect(outcome.route.fallbackReason).toBe('no_api_key');
    expect(outcome.envelope.provider).toBe(OFFLINE_FALLBACK_PROVIDER);
    expect(outcome.envelope.payload.explanation).toContain('分岐');
  });

  it('leaves capture, promotion and the event log entirely unaffected', async () => {
    const context = newDomainContext();
    const store = newStore(context);
    const runtime = createAiRuntime({
      provider: createFallbackOnlyProvider(),
      clock: { now: () => context.clock.now(), elapsedMs: () => 0 },
      nextCandidateId: () => context.ids.nextId('candidate'),
      platform: testPlatform(),
      contentPolicy: seededContentPolicy(),
    });

    const { threadId } = capture(store, '分岐', 'lex-bunki');
    await runtime.requestCandidate({ context: CONTEXT });

    const promoted = store.execute({ kind: 'promote', threadId, to: 'keep' });
    expect(promoted.events).toHaveLength(1);
    expect(store.getSnapshot().threadsById[threadId]?.state.promotion).toBe('keep');
    // The AI attempt wrote nothing: the log holds capture and promotion only.
    expect(store.readAll().map((event) => event.type)).toEqual([
      'EncounterCaptured',
      'ThreadPromotionChanged',
    ]);
  });

  it('refuses to send un-seeded content, and says so as a fallback reason', async () => {
    const context = newDomainContext();
    const runtime = createAiRuntime({
      provider: hungProvider(),
      clock: { now: () => context.clock.now(), elapsedMs: () => 0 },
      nextCandidateId: () => context.ids.nextId('candidate'),
      platform: testPlatform(),
      contentPolicy: seededContentPolicy(),
    });

    const outcome = await runtime.requestCandidate({
      context: { ...CONTEXT, excerpt: '昨日、駅で友達に会いました。' },
    });
    expect(outcome.route.fallbackReason).toBe('content_not_permitted');
  });
});
