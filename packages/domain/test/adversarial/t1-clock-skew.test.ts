/**
 * T1 — clock skew cannot corrupt scheduling (WP-10; controller §17.2).
 *
 * Event append order is authoritative even when a device clock moves backward.
 * Raw timestamps remain in the evidence ledger, while the FSRS wrapper advances
 * a separate monotonic scheduler anchor. These tests pin three properties:
 *
 *   **P1 — no silent influence.** Timestamps do not decide whether evidence is
 *   admitted or which effective grade the gate assigns.
 *
 *   **P2 — no silent drop.** Every schema-valid admitted review is recorded and
 *   scheduled, including reviews whose wall-clock time crosses backward over a
 *   UTC date boundary.
 *
 *   **P3 — no corrupt arithmetic.** Repeated clock regressions keep the FSRS
 *   clock nondecreasing and every derived schedule finite and canonical.
 *
 * ADV-T1-01 previously showed that ts-fsrs rejected a negative UTC calendar-day
 * delta with an untyped FSRSValidationError, which also made the persistence
 * replay gate refuse an already acknowledged review. The regression block
 * below proves both sides of that old boundary now remain durable.
 */

import { describe, expect, it } from 'vitest';

import {
  compareInstants,
  isValidIsoInstant,
  parseEventLog,
  replay,
  type DerivedState,
  type DomainEvent,
} from '../../src/index.ts';
import { generateCase, randomFrom, type Raw } from './support/fuzz.ts';
import { learnableLog, review, T } from '../support/wp06.ts';

const BASE_SEED = 0x51ee7;
const CASE_COUNT = 48;

/** The first review's instant in the WP-06 scenario helpers: 09:03Z on the 27th. */
const FIRST_REVIEW = T.review1;

function attempt(events: readonly DomainEvent[]): {
  state: DerivedState | null;
  error: unknown;
} {
  try {
    return { state: replay(events), error: null };
  } catch (error) {
    return { state: null, error };
  }
}

const admittedIdsOf = (state: DerivedState): string[] =>
  state.gateDecisions.filter((decision) => decision.admitted).map((decision) => decision.eventId);

const verdictIdsOf = (state: DerivedState): string[] =>
  state.gateDecisions.map((decision) => decision.eventId);

function assertSchedulesWellFormed(state: DerivedState, where: string): void {
  for (const memory of state.memoryStates) {
    expect(Number.isFinite(memory.stability), `${where}: non-finite stability`).toBe(true);
    expect(Number.isFinite(memory.difficulty), `${where}: non-finite difficulty`).toBe(true);
    expect(Number.isFinite(memory.scheduledDays), `${where}: non-finite scheduledDays`).toBe(true);
    expect(memory.stability, `${where}: negative stability`).toBeGreaterThanOrEqual(0);
    expect(memory.difficulty, `${where}: negative difficulty`).toBeGreaterThanOrEqual(0);
    expect(
      isValidIsoInstant(memory.dueAt),
      `${where}: dueAt "${memory.dueAt}" is not a canonical instant`,
    ).toBe(true);
    expect(
      isValidIsoInstant(memory.schedulerAnchorAt),
      `${where}: schedulerAnchorAt "${memory.schedulerAnchorAt}" is not canonical`,
    ).toBe(true);
    expect(
      compareInstants(memory.dueAt, memory.schedulerAnchorAt),
      `${where}: dueAt precedes the monotonic scheduler anchor`,
    ).toBeGreaterThanOrEqual(0);
    if (memory.lastReviewedAt !== null) {
      expect(
        isValidIsoInstant(memory.lastReviewedAt),
        `${where}: lastReviewedAt "${String(memory.lastReviewedAt)}" is not canonical`,
      ).toBe(true);
    }
  }
}

/** Rewrite `occurredAt` on every event the predicate selects. */
function reinstant(events: readonly Raw[], select: (event: Raw) => string | null): Raw[] {
  return events.map((event) => {
    const next = select(event);
    return next === null ? event : { ...event, occurredAt: next };
  });
}

const cases = Array.from({ length: CASE_COUNT }, (_value, index) =>
  generateCase(BASE_SEED + index),
);

describe('T1 — P1: timestamps cannot decide whether an observation counts', () => {
  it('arbitrary skew on non-graded events leaves the admitted set unchanged', () => {
    // Captures, promotions, contracts, exposures, lookups, productions and
    // corrections carry instants that nothing schedules on. If any of them
    // could move an admission, the gate would be reading a clock rather than a
    // history — and two devices would then disagree about what counted.
    const skewed = ['1999-01-01T00:00:00.000Z', '2099-12-31T23:59:59.000Z', T.capture];

    for (const generated of cases) {
      const baseline = attempt(parseEventLog(generated.events));
      if (baseline.state === null) continue;

      const random = randomFrom(generated.seed ^ 0x7f4a7c15);
      const perturbed = reinstant(generated.events, (event) =>
        event['type'] === 'ReviewGraded' ? null : random.pick(skewed),
      );

      const where = `seed ${String(generated.seed)}`;
      const after = attempt(parseEventLog(perturbed));
      expect(after.state, `${where}: skewing non-graded instants broke replay`).not.toBeNull();
      if (after.state === null) continue;

      expect(
        admittedIdsOf(after.state),
        `${where}: skewing non-graded instants changed which reviews counted`,
      ).toEqual(admittedIdsOf(baseline.state));
      expect(
        verdictIdsOf(after.state),
        `${where}: skewing non-graded instants changed the ledger`,
      ).toEqual(verdictIdsOf(baseline.state));
      assertSchedulesWellFormed(after.state, where);
    }
  });

  it('shifting the whole log by a constant leaves the admitted set and grades unchanged', () => {
    // A device an hour, a year, or a decade out of true still learned the same
    // things in the same order. Only the deltas between reviews are scheduling
    // input; the absolute epoch is not, and a schedule that depended on it
    // would drift for a traveller.
    const shifts = [-315_360_000_000, -3_600_000, 3_600_000, 315_360_000_000];

    for (const generated of cases) {
      const baseline = attempt(parseEventLog(generated.events));
      if (baseline.state === null) continue;

      for (const shift of shifts) {
        const where = `seed ${String(generated.seed)} shift ${String(shift)}ms`;
        const shifted = reinstant(generated.events, (event) => {
          const at = event['occurredAt'];
          if (typeof at !== 'string') return null;
          return new Date(Date.parse(at) + shift).toISOString();
        });

        const after = attempt(parseEventLog(shifted));
        expect(after.state, `${where}: a uniform shift broke replay`).not.toBeNull();
        if (after.state === null) continue;

        expect(
          admittedIdsOf(after.state),
          `${where}: a uniform shift changed which reviews counted`,
        ).toEqual(admittedIdsOf(baseline.state));

        const grades = (state: DerivedState): (string | null)[] =>
          state.gateDecisions.map((decision) => decision.effectiveGrade);
        expect(grades(after.state), `${where}: a uniform shift changed a grade`).toEqual(
          grades(baseline.state),
        );
        assertSchedulesWellFormed(after.state, where);
      }
    }
  });
});

describe('T1 — P2/P3: a skewed review is recorded on a sane monotonic schedule', () => {
  it('every backward skew records a verdict and advances the review count', () => {
    const offsetsMs = [
      -1, -1_000, -60_000, -3_600_000, -86_399_999, -86_400_000, -172_800_000, -2_592_000_000,
      -31_536_000_000,
    ];

    for (const offset of offsetsMs) {
      const first = Date.parse(T.review1);
      const skewedAt = new Date(first + offset).toISOString();
      const log: Raw[] = [
        ...learnableLog(),
        review({
          eventId: 'ev-r1',
          at: T.review1,
          contractId: 'contract-meaning',
        }),
        review({
          eventId: 'ev-r2',
          at: skewedAt,
          contractId: 'contract-meaning',
        }),
      ];

      const where = `skew ${String(offset)}ms`;
      const result = attempt(parseEventLog(log));
      expect(result.error, `${where}: replay rejected a schema-valid review`).toBeNull();
      expect(result.state, `${where}: replay returned no state`).not.toBeNull();
      if (result.state === null) continue;

      const verdict = result.state.gateDecisions.find((decision) => decision.eventId === 'ev-r2');
      expect(verdict?.admitted, `${where}: the skewed review was not admitted`).toBe(true);
      expect(verdict?.at, `${where}: the gate rewrote the evidence timestamp`).toBe(skewedAt);

      const observation = result.state.observations.find(
        (candidate) => candidate.eventId === 'ev-r2',
      );
      expect(observation?.at, `${where}: the ledger rewrote the evidence timestamp`).toBe(skewedAt);

      const memory = result.state.memoryStates.find(
        (candidate) => candidate.contractId === 'contract-meaning',
      );
      expect(memory?.admittedReviewCount, `${where}: scheduler and ledger count disagree`).toBe(2);
      expect(memory?.lastReviewedAt, `${where}: raw review time was lost`).toBe(skewedAt);
      expect(memory?.schedulerAnchorAt, `${where}: scheduler clock regressed`).toBe(T.review1);
      assertSchedulesWellFormed(result.state, where);
    }
  });

  it('same-instant reviews all count rather than collapse', () => {
    const log: Raw[] = [
      ...learnableLog(),
      review({
        eventId: 'ev-r1',
        at: T.review1,
        contractId: 'contract-meaning',
      }),
      review({
        eventId: 'ev-r2',
        at: T.review1,
        contractId: 'contract-meaning',
      }),
      review({
        eventId: 'ev-r3',
        at: T.review1,
        contractId: 'contract-meaning',
      }),
    ];

    const result = attempt(parseEventLog(log));
    expect(result.state, 'identical instants broke replay').not.toBeNull();
    if (result.state === null) return;

    const memory = result.state.memoryStates.find(
      (candidate) => candidate.contractId === 'contract-meaning',
    );
    expect(memory?.admittedReviewCount, 'same-instant reviews were collapsed').toBe(3);
    expect(memory?.schedulerAnchorAt).toBe(T.review1);
    assertSchedulesWellFormed(result.state, 'identical instants');
  });
});

describe('T1 — ADV-T1-01 regression: UTC-boundary skew is contained', () => {
  const skewedLogAt = (at: string): Raw[] => [
    ...learnableLog(),
    review({
      eventId: 'ev-r1',
      at: FIRST_REVIEW,
      contractId: 'contract-meaning',
    }),
    review({ eventId: 'ev-r2', at, contractId: 'contract-meaning' }),
  ];

  it('accepts both sides of the former UTC calendar-day cliff', () => {
    const sameDayAt = '2026-07-27T00:03:00.000Z';
    const previousDayAt = '2026-07-26T23:59:00.000Z';
    const sameDay = attempt(parseEventLog(skewedLogAt(sameDayAt)));
    const previousDay = attempt(parseEventLog(skewedLogAt(previousDayAt)));

    expect(sameDay.error, 'same-day backward skew was refused').toBeNull();
    expect(sameDay.state, 'same-day backward skew returned no state').not.toBeNull();
    expect(previousDay.error, 'UTC-boundary backward skew was refused').toBeNull();
    expect(previousDay.state, 'UTC-boundary backward skew returned no state').not.toBeNull();

    expect(Date.parse(sameDayAt) - Date.parse(previousDayAt)).toBe(240_000);
    if (previousDay.state === null) return;

    const verdict = previousDay.state.gateDecisions.find(
      (decision) => decision.eventId === 'ev-r2',
    );
    const observation = previousDay.state.observations.find(
      (candidate) => candidate.eventId === 'ev-r2',
    );
    const memory = previousDay.state.memoryStates.find(
      (candidate) => candidate.contractId === 'contract-meaning',
    );

    expect(verdict).toMatchObject({ admitted: true, at: previousDayAt });
    expect(observation?.at).toBe(previousDayAt);
    expect(memory).toMatchObject({
      admittedReviewCount: 2,
      lastReviewedAt: previousDayAt,
      schedulerAnchorAt: FIRST_REVIEW,
    });
    assertSchedulesWellFormed(previousDay.state, 'UTC-boundary regression');
  });

  it('the same skew is a valid, parseable log and replays deterministically', () => {
    const raw = skewedLogAt('2026-07-26T23:59:00.000Z');
    expect(() => parseEventLog(raw), 'the skewed log failed to parse').not.toThrow();

    const parsed = parseEventLog(raw);
    expect(JSON.stringify(replay(parsed))).toBe(JSON.stringify(replay(parsed)));
  });
});
