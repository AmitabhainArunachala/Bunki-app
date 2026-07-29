/**
 * T1 — idempotency and atomicity under concurrent appends (WP-10; controller
 * §17.2, §7, §21.3(4)).
 *
 * ## What is being attacked
 *
 * `AppStore` serialises its writes onto one promise chain, so the app never
 * issues two overlapping appends. That is a property of *today's caller*, not of
 * the port, and the port is what WP-11's native runtime, the export path and any
 * future sync will hold. So every case here calls `append` **without awaiting**
 * the previous call, which is precisely the situation the store's own header
 * says it is protected against — and this file is where that claim is checked
 * rather than accepted.
 *
 * Both adapters are driven, because the semantics are shared code
 * (`src/append-plan.ts`) but the storage is not, and "the plan is right" and
 * "the adapter applied the plan atomically" are different claims. The
 * `ci-substitute` label is carried into every test name for the same reason the
 * contract suite carries it: a pass here is never native evidence (P0-CAP-15).
 *
 * ## The three properties
 *
 *   **Exactly once.** N overlapping appends of the same batch under the same
 *   key leave one copy of each event. This is the double-tapped capture as the
 *   port sees it.
 *
 *   **Never silently between two histories.** Overlapping appends that claim
 *   one key with *different* content are refused — one of them wins and the
 *   other raises, and no interleaving produces a log holding parts of both.
 *
 *   **All or nothing.** A batch that fails the replay gate writes no bytes,
 *   including the bytes of the events in it that were individually fine. A
 *   partially applied batch leaves derived state that no single log explains,
 *   which is controller §21.3(4)'s stop condition wearing a small disguise.
 */

import { componentIdForTargetKey, DomainError, replay, type DomainEvent } from '@bunki/domain';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { encounterCaptured, threadPromoted, type EventStore } from '../../src/index.ts';
import { createSqliteCiSubstituteHarness, createWebProvisionalHarness } from '../harness.ts';

const harnesses = [createSqliteCiSubstituteHarness(), createWebProvisionalHarness()];

/** The batch of two events every "same gesture twice" case re-sends. */
const captureBatch = (): readonly DomainEvent[] => [encounterCaptured()];

const idsOf = (events: readonly DomainEvent[]): string[] => events.map((event) => event.eventId);

/** Settle a set of un-awaited appends without letting one rejection hide the rest. */
async function settleAll(
  promises: readonly Promise<unknown>[],
): Promise<{ fulfilled: number; rejected: unknown[] }> {
  const results = await Promise.allSettled(promises);
  return {
    fulfilled: results.filter((result) => result.status === 'fulfilled').length,
    rejected: results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : [])),
  };
}

for (const harness of harnesses) {
  const label = `[${harness.runtimeLabel}] ${harness.name}`;

  describe(`T1 — concurrent appends, ${label}`, () => {
    let store: EventStore;

    beforeEach(async () => {
      await harness.reset();
      store = await harness.open();
    });

    afterAll(async () => {
      await harness.dispose();
    });

    it('twelve overlapping appends of one batch under one key store it once', async () => {
      const batch = captureBatch();
      const promises = Array.from({ length: 12 }, () =>
        store.append(batch, { idempotencyKey: 'batch:double-tap' }),
      );

      const { rejected } = await settleAll(promises);
      expect(rejected, 'an honest re-send was refused').toEqual([]);

      const log = await store.readAll();
      expect(idsOf(log), 'a concurrent re-send duplicated events').toEqual(idsOf(batch));

      const snapshot = await store.snapshot();
      expect(snapshot.threads, 'a concurrent re-send forked a thread').toHaveLength(1);
      expect(snapshot.appliedEventCount).toBe(batch.length);
    });

    it('the same events re-sent under a *different* batch key are still stored once', async () => {
      // The batch key makes a repeated *call* a no-op; each event's own key is
      // what makes the event appear once however many batches contain it. A
      // retry that regenerates its batch key — a plausible client bug — must
      // still not duplicate the capture.
      const batch = captureBatch();
      await store.append(batch, { idempotencyKey: 'batch:first' });
      await store.append(batch, { idempotencyKey: 'batch:second-attempt' });

      const log = await store.readAll();
      expect(idsOf(log), 'a re-keyed retry duplicated the capture').toEqual(idsOf(batch));
    });

    it('overlapping appends claiming one key with different content never merge', async () => {
      const original = encounterCaptured();
      const impostor = encounterCaptured({
        eventId: 'evt-impostor',
        encounterId: 'encounter-impostor',
        idempotencyKey: original.idempotencyKey,
        text: 'a different history',
      });

      const { rejected } = await settleAll([
        store.append([original], { idempotencyKey: 'batch:a' }),
        store.append([impostor], { idempotencyKey: 'batch:b' }),
      ]);

      // One of the two must lose, loudly and in the domain's own vocabulary.
      expect(rejected, 'two histories were merged without a word').toHaveLength(1);
      expect(rejected[0], 'a key collision raised an untyped error').toBeInstanceOf(DomainError);

      const log = await store.readAll();
      expect(log, 'a key collision stored both histories').toHaveLength(1);
      const survivor = log[0];
      expect(
        survivor?.eventId === original.eventId || survivor?.eventId === impostor.eventId,
        'a key collision stored something that was never appended',
      ).toBe(true);
    });

    it('a batch the replay gate refuses writes none of its events', async () => {
      // The promotion cites a thread that no capture in this log established,
      // so `replay` refuses the whole batch — including the capture in front of
      // it, which would have been perfectly valid on its own.
      const good = encounterCaptured({ eventId: 'evt-good' });
      const orphan = threadPromoted({
        eventId: 'evt-orphan',
        threadId: 'thread-that-never-was',
      });

      await expect(
        store.append([good, orphan], { idempotencyKey: 'batch:mixed' }),
        'an unreplayable batch was accepted',
      ).rejects.toBeInstanceOf(DomainError);

      const log = await store.readAll();
      expect(log, 'a refused batch wrote part of itself').toHaveLength(0);

      // And the store is still usable afterwards: a refusal is not a wedge.
      await store.append([good], { idempotencyKey: 'batch:retry-good' });
      expect(idsOf(await store.readAll())).toEqual(['evt-good']);
    });

    it('interleaved appends of distinct batches preserve every event exactly once', async () => {
      const batches = Array.from({ length: 8 }, (_value, index) => ({
        key: `batch:${String(index)}`,
        events: [
          encounterCaptured({
            eventId: `evt-${String(index)}`,
            encounterId: `encounter-${String(index)}`,
            threadId: `thread-${String(index)}`,
            idempotencyKey: `capture:evt-${String(index)}`,
            text: `分岐 ${String(index)}`,
          }),
        ],
      }));

      // Fired together, plus one duplicate of each, so the queue sees both new
      // work and re-sends interleaved.
      const promises = [
        ...batches.map((batch) => store.append(batch.events, { idempotencyKey: batch.key })),
        ...batches.map((batch) => store.append(batch.events, { idempotencyKey: batch.key })),
      ];

      const { rejected } = await settleAll(promises);
      expect(rejected, 'interleaved distinct batches conflicted').toEqual([]);

      const log = await store.readAll();
      expect(new Set(idsOf(log)).size, 'an event was stored twice').toBe(log.length);
      expect(idsOf(log).sort()).toEqual(batches.flatMap((batch) => idsOf(batch.events)).sort());

      const snapshot = await store.snapshot();
      expect(snapshot.threads).toHaveLength(batches.length);
    });
  });
}

/**
 * ADV-T1-01 regression at the write gate.
 *
 * A backward-clock review must be appended exactly once, survive a fresh read,
 * and produce the same snapshot as replaying the stored log. This is the port
 * boundary that previously refused the learner's already acknowledged review.
 */
describe('T1 — ADV-T1-01 regression: clock-skewed reviews remain durable', () => {
  const harness = createWebProvisionalHarness();
  const TARGET = '分岐';
  const COMPONENT = componentIdForTargetKey(TARGET);

  const boundCapture = (): DomainEvent =>
    ({
      ...encounterCaptured({
        eventId: 'evt-skew-capture',
        text: `${TARGET}点で道を選ぶ。`,
      }),
      span: { start: 0, end: TARGET.length },
    }) as DomainEvent;

  const learnContract = (): DomainEvent =>
    ({
      eventId: 'evt-skew-contract',
      v: 1,
      occurredAt: '2026-07-27T08:10:00.000Z',
      idempotencyKey: 'contract:evt-skew-contract',
      type: 'ContractCreated',
      contractId: 'contract-skew',
      contractVersion: 1,
      targetComponentId: COMPONENT,
      skill: 'form_to_meaning',
      cueModality: 'text',
      responseModality: 'text',
      acceptedAnswers: ['a branching point'],
      hintPolicy: { hintsAllowed: true, maxHints: 1 },
      revealPolicy: { revealAllowed: true, revealIsRecorded: true },
      promptFamilyVersion: 'pf-1',
    }) as DomainEvent;

  const reviewAt = (eventId: string, occurredAt: string): DomainEvent =>
    ({
      eventId,
      v: 1,
      occurredAt,
      idempotencyKey: `review:${eventId}`,
      type: 'ReviewGraded',
      contractId: 'contract-skew',
      grade: 'good',
      latencyMs: 3400,
      hintsUsed: 0,
      revealedBeforeRecall: false,
      probeContext: 'standalone',
      tier: 'A',
    }) as DomainEvent;

  afterAll(async () => {
    await harness.dispose();
  });

  it('appends once, replays after read, and still accepts later reviews', async () => {
    await harness.reset();
    const store = await harness.open();

    await store.append(
      [
        boundCapture(),
        threadPromoted({ eventId: 'evt-skew-promote', to: 'learn' }),
        learnContract(),
        reviewAt('evt-skew-r1', '2026-07-27T09:03:00.000Z'),
      ],
      { idempotencyKey: 'batch:skew-setup' },
    );

    const before = await store.readAll();
    const skewedAt = '2026-07-26T23:59:00.000Z';
    const skewed = reviewAt('evt-skew-r2', skewedAt);

    await expect(
      store.append([skewed], { idempotencyKey: 'batch:skew' }),
      'the clock-skewed review was refused',
    ).resolves.toMatchObject({
      outcome: 'appended',
      appendedEventIds: ['evt-skew-r2'],
    });

    // An honest retry is a no-op at both the batch and event idempotency layers.
    await expect(store.append([skewed], { idempotencyKey: 'batch:skew' })).resolves.toMatchObject({
      outcome: 'duplicate-noop',
      appendedEventIds: [],
      skippedEventIds: ['evt-skew-r2'],
    });
    await expect(
      store.append([skewed], { idempotencyKey: 'batch:skew-rekeyed' }),
    ).resolves.toMatchObject({
      outcome: 'duplicate-noop',
      appendedEventIds: [],
      skippedEventIds: ['evt-skew-r2'],
    });

    const after = await store.readAll();
    expect(idsOf(after)).toEqual([...idsOf(before), 'evt-skew-r2']);
    const snapshot = await store.snapshot();
    expect(snapshot).toEqual(replay(after));

    const memory = snapshot.memoryStates.find(
      (candidate) => candidate.contractId === 'contract-skew',
    );
    expect(memory).toMatchObject({
      admittedReviewCount: 2,
      lastReviewedAt: skewedAt,
      schedulerAnchorAt: '2026-07-27T09:03:00.000Z',
    });
    expect(snapshot.observations.find((row) => row.eventId === 'evt-skew-r2')?.at).toBe(skewedAt);
    expect(snapshot.gateDecisions.find((row) => row.eventId === 'evt-skew-r2')).toMatchObject({
      admitted: true,
      at: skewedAt,
    });

    const reopened = await harness.open();
    expect(await reopened.readAll()).toEqual(after);
    expect(await reopened.snapshot()).toEqual(snapshot);

    await reopened.append([reviewAt('evt-skew-r3', '2026-07-28T09:03:00.000Z')], {
      idempotencyKey: 'batch:skew-forward',
    });
    expect((await reopened.snapshot()).memoryStates[0]?.admittedReviewCount).toBe(3);
  });
});
