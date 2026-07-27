/**
 * T1 — clock skew cannot corrupt scheduling (WP-10; controller §17.2:
 * "clock skew does not corrupt scheduling").
 *
 * ## The threat
 *
 * `occurredAt` is not monotonic by construction. The v1 envelope requires a
 * canonical UTC instant from the injected clock (REQ-DM-04.4) and says nothing
 * about ordering, and there is no mechanism in the product that could enforce
 * one: an NTP step, a timezone daemon, a user setting the date, a device that
 * lost its battery, or — from WP-11 — two devices whose logs merge, all produce
 * a log whose timestamps go backwards while its *append order* is perfectly
 * sound. FSRS is the one component that reads the difference between two
 * timestamps and turns it into a number the learner lives with, so it is where
 * skew would show up as a wrong schedule rather than as an obvious error.
 *
 * ## What "cannot corrupt" is taken to mean here
 *
 * Three properties, each written to survive any reasonable repair of the defect
 * this file documents, so that the suite keeps its meaning rather than needing
 * to be rewritten alongside a fix:
 *
 *   **P1 — no silent influence.** Timestamps must not decide *whether* an
 *   observation counts. Admission is a function of log order, promotion state
 *   and contract validity (§6.2); moving instants around, forwards or
 *   backwards, must leave the admitted set exactly as it was.
 *
 *   **P2 — no silent drop.** A skewed review is either judged and recorded, or
 *   the whole replay is refused. What it may never be is quietly absent: a
 *   review the learner did, that produced no ledger row and no error, is the
 *   evidence-theatre failure the definition of done names in §2.6.
 *
 *   **P3 — no corrupt arithmetic.** If replay returns, every schedule is
 *   finite, non-negative and canonically dated. A `NaN` stability renders as an
 *   empty cell, not as an alarm.
 *
 * ## The defect this file pins: ADV-T1-01
 *
 * `packages/domain/src/reducers/memory-state.ts` hands `review.reviewedAt`
 * straight to `ts-fsrs`, which rejects a negative `delta_t` by throwing
 * `FSRSValidationError` — a library error, not a `DomainError`. So a review
 * dated before the previous admitted review on the same contract makes
 * `replay` throw something outside its documented `@throws` set, and `replay`
 * is the write gate for every append (`packages/persistence/src/append-plan.ts`)
 * as well as the whole of `snapshot()`.
 *
 * The cliff is **not** at twenty-four hours. `delta_t` is a difference of
 * *dates*, so what breaks is a step back across midnight UTC: nine hours of
 * backward skew inside one UTC day is tolerated and four minutes more, landing
 * on the previous date, is not. Measured on this build the boundary sits
 * between `2026-07-27T00:03:00Z` (tolerated) and `2026-07-26T23:59:00Z`
 * (refused) for a first review at `09:03Z`. That makes the trigger an ordinary
 * NTP correction near midnight rather than a clock a day out of true, which is
 * why this is filed as a durability risk.
 *
 * The characterisation test at the bottom of this file pins that boundary
 * deliberately. It is expected to go **red** when the defect is repaired, and
 * that is its job: a boundary nobody asserted is a boundary that can move
 * without anyone noticing. See the capsule appendix for the proposed fix.
 */

import { describe, expect, it } from 'vitest';

import {
  DomainError,
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

describe('T1 — P2/P3: a skewed review is never silently dropped or silently wrong', () => {
  it('every backward skew either fails closed or records a verdict and a sane schedule', () => {
    // The disjunction is the property. What is forbidden is the third outcome:
    // a replay that succeeds while the skewed review left no trace.
    const offsetsMs = [
      -1, -1_000, -60_000, -3_600_000, -86_399_999, -86_400_000, -172_800_000, -2_592_000_000,
      -31_536_000_000,
    ];

    let returned = 0;
    let refused = 0;

    for (const offset of offsetsMs) {
      const first = Date.parse(T.review1);
      const log: Raw[] = [
        ...learnableLog(),
        review({ eventId: 'ev-r1', at: T.review1, contractId: 'contract-meaning' }),
        review({
          eventId: 'ev-r2',
          at: new Date(first + offset).toISOString(),
          contractId: 'contract-meaning',
        }),
      ];

      const where = `skew ${String(offset)}ms`;
      const result = attempt(parseEventLog(log));

      if (result.state === null) {
        refused += 1;
        expect(result.error, `${where}: replay rejected without an error`).toBeInstanceOf(Error);
        continue;
      }

      returned += 1;
      // P2 — the observation was judged, not skipped.
      expect(
        verdictIdsOf(result.state),
        `${where}: the skewed review produced no ledger verdict`,
      ).toContain('ev-r2');
      // P3 — and what it produced is a number, not a hole.
      assertSchedulesWellFormed(result.state, where);

      const memory = result.state.memoryStates.find(
        (candidate) => candidate.contractId === 'contract-meaning',
      );
      const admitted = result.state.gateDecisions.filter((decision) => decision.admitted).length;
      expect(memory?.admittedReviewCount, `${where}: the scheduler and the ledger disagree`).toBe(
        admitted,
      );
    }

    expect(
      returned,
      'no skew was tolerated — the well-formedness checks never ran',
    ).toBeGreaterThan(0);
    expect(refused, 'no skew was refused — the fail-closed branch never ran').toBeGreaterThan(0);
  });

  it('a forward-only log with identical instants still schedules', () => {
    // The degenerate case a batch import produces: several reviews stamped at
    // the same instant. `delta_t` is zero, which is legal, and the reviews must
    // all count rather than all collapse.
    const log: Raw[] = [
      ...learnableLog(),
      review({ eventId: 'ev-r1', at: T.review1, contractId: 'contract-meaning' }),
      review({ eventId: 'ev-r2', at: T.review1, contractId: 'contract-meaning' }),
      review({ eventId: 'ev-r3', at: T.review1, contractId: 'contract-meaning' }),
    ];

    const result = attempt(parseEventLog(log));
    expect(result.state, 'identical instants broke replay').not.toBeNull();
    if (result.state === null) return;

    const memory = result.state.memoryStates.find(
      (candidate) => candidate.contractId === 'contract-meaning',
    );
    expect(memory?.admittedReviewCount, 'same-instant reviews were collapsed').toBe(3);
    assertSchedulesWellFormed(result.state, 'identical instants');
  });
});

describe('T1 — ADV-T1-01: the current backward-skew failure mode, pinned', () => {
  /**
   * A characterisation test, and deliberately so.
   *
   * It records exactly where the cliff is today and what comes off it. It is
   * expected to fail when the defect is fixed — whoever fixes it should delete
   * or invert this block and say so in the capsule. Leaving the boundary
   * unasserted is the alternative, and an unasserted boundary is one that moves
   * silently.
   */
  /** A log whose second review sits `at` — an absolute instant, not an offset. */
  const skewedLogAt = (at: string): Raw[] => [
    ...learnableLog(),
    review({ eventId: 'ev-r1', at: FIRST_REVIEW, contractId: 'contract-meaning' }),
    review({ eventId: 'ev-r2', at, contractId: 'contract-meaning' }),
  ];

  it('the cliff is a UTC calendar-day boundary, not a 24-hour window', () => {
    // This is the part that makes ADV-T1-01 reachable in ordinary use, and it
    // is why the boundary is asserted in absolute instants rather than in
    // elapsed milliseconds. `ts-fsrs` computes `delta_t` as a difference of
    // *dates*, so what breaks replay is not "a day of skew" but "a step back
    // across midnight UTC" — which a two-minute NTP correction achieves at
    // 00:01Z. A learner reviewing late in the evening in UTC+9 is reviewing
    // just after midnight UTC.
    const sameDay = attempt(parseEventLog(skewedLogAt('2026-07-27T00:03:00.000Z')));
    expect(sameDay.state, 'skew of nine hours within one UTC day was refused').not.toBeNull();

    const previousDay = attempt(parseEventLog(skewedLogAt('2026-07-26T23:59:00.000Z')));
    expect(
      previousDay.state,
      'skew of four minutes more, across midnight UTC, was tolerated',
    ).toBeNull();

    // Four minutes of wall-clock difference separates the two cases above.
    const tolerated = Date.parse('2026-07-27T00:03:00.000Z');
    const refused = Date.parse('2026-07-26T23:59:00.000Z');
    expect(tolerated - refused).toBe(240_000);
  });

  it('refuses a backward step across midnight UTC, and refuses it untyped', () => {
    const result = attempt(parseEventLog(skewedLogAt('2026-07-26T23:59:00.000Z')));

    expect(result.state, 'a backward step across midnight UTC produced state').toBeNull();
    expect(result.error).toBeInstanceOf(Error);

    // The defect, stated as an assertion rather than a comment: `replay`
    // documents `DuplicateEventIdError | IdempotencyConflictError |
    // ReducerInvariantError | PromotionTransitionError`, and this is none of
    // them — it is `ts-fsrs`'s own validation error crossing two package
    // boundaries. Callers that branch on `DomainError` (the persistence write
    // gate does) therefore see an unclassified crash.
    expect(
      result.error instanceof DomainError,
      'ADV-T1-01 appears to be fixed: the backward-skew rejection is now a DomainError. ' +
        'Update this characterisation test and the capsule appendix.',
    ).toBe(false);
    expect((result.error as Error).name).toBe('FSRSValidationError');
  });

  it('the same skew reaches replay through a plain, valid, parseable log', () => {
    // Stated separately because it is the part that makes ADV-T1-01 a product
    // risk rather than a curiosity: nothing upstream rejects the log. Every
    // event is schema-valid, the envelope has no ordering rule, and the parser
    // is content with it. The crash happens in the projection, which is the
    // component every read and every write runs through.
    const raw = skewedLogAt('2026-07-26T23:59:00.000Z');
    expect(() => parseEventLog(raw), 'the skewed log failed to parse').not.toThrow();
    expect(parseEventLog(raw)).toHaveLength(raw.length);
  });
});
