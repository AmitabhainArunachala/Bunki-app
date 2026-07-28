/**
 * T1 — property/fuzz over event interleavings (WP-10; controller §17.2:
 * "random event interleavings preserve gate invariants").
 *
 * ## What this file asserts, and why it is phrased as a *total* property
 *
 * The gate's own suite (`test/evidence/`) proves each §6.2 rule against a log
 * written to exercise it. That is necessary and it is not what §17.2 asks for.
 * A rule can be individually correct and still be reachable *around* — by an
 * ordering nobody wrote a fixture for, by a duplicate arriving mid-log, by a
 * correction that lands before the thing it corrects. So the assertions here
 * are not about any particular log; they are about **every** log this generator
 * can produce and every permutation of it.
 *
 * The property is stated as a disjunction on purpose:
 *
 * > for any ordering of a valid log, `replay` either **fails closed** — throws,
 * > returns nothing, commits nothing — or it returns a state in which *every*
 * > gate invariant holds.
 *
 * The disjunction is not a weakening. Most permutations of a causally ordered
 * log are not causally ordered (a promotion before its capture, a correction
 * before its observation), and the kernel's documented answer to those is to
 * throw rather than to project a partial history — `replay`'s header says so in
 * as many words. What the property forbids is the third outcome, the only
 * dangerous one: a replay that *succeeds* while some observation reached the
 * scheduler that should not have. That is what would make an evidence claim
 * false, and it is what is checked below on every returned state.
 *
 * ## The invariants (controller §6.2, restated as checks over derived state)
 *
 *   1. only `ReviewGraded` is ever admitted — exposure, lookup, production and
 *      supersession are rejected by name, whatever the order (T-07, T-08);
 *   2. a superseded observation is never admitted (REQ-DM-04.2);
 *   3. `revealedBeforeRecall` forces `again` (T-06);
 *   4. an admitted `easy` carries `userConfirmedEasy: true` (REQ-DM-07);
 *   5. admitted decisions and `admittedReviewCount` agree exactly — the ledger
 *      and the scheduler cannot disagree about how many reviews counted;
 *   6. no promotion to `learn`/`master` anywhere in the log ⇒ no memory state
 *      at all (T-02: capture and `keep` activate nothing);
 *   7. every memory state is numerically well-formed — finite, non-negative,
 *      canonically dated. A `NaN` stability is a corrupted schedule that no
 *      screen would render as an error.
 *
 * ## Notes on the corpus
 *
 * 96 generated cases and 8 permutations of each — a little over 800 replays,
 * which runs in well under a second because `replay` is pure and the logs are
 * short. Seeds are fixed (`BASE_SEED + index`), so a failure names the exact
 * case and re-running reproduces it. `SHOW_PERMUTATION_OUTCOMES` prints the
 * throw/return split for anyone re-tuning the generator; it is off by default
 * because a test that always logs is a test whose output nobody reads.
 */

import { describe, expect, it } from 'vitest';

import {
  DomainError,
  DuplicateEventIdError,
  IdempotencyConflictError,
  isEvidenceClassEvent,
  isValidIsoInstant,
  parseEventLog,
  replay,
  type DerivedState,
  type DomainEvent,
} from '../../src/index.ts';
import { generateCase, randomFrom, shuffle, type Raw } from './support/fuzz.ts';

/** Fixed, so a red build is reproducible by re-running the file. */
const BASE_SEED = 0x51ee7;
const CASE_COUNT = 96;
const PERMUTATIONS_PER_CASE = 8;
const SHOW_PERMUTATION_OUTCOMES = false;

/** Families the gate must never admit, with the reason it must give. */
const NEVER_ADMITTED: Readonly<Record<string, string>> = {
  ExposureLogged: 'exposure_is_never_retrieval',
  LookupFrictionLogged: 'lookup_is_friction_not_a_grade',
  ProductionObserved: 'production_is_not_tier_a',
  EvidenceSuperseded: 'correction_is_not_an_observation',
};

interface Attempt {
  readonly ok: boolean;
  readonly state: DerivedState | null;
  readonly error: unknown;
}

function attemptReplay(events: readonly DomainEvent[]): Attempt {
  try {
    return { ok: true, state: replay(events), error: null };
  } catch (error) {
    return { ok: false, state: null, error };
  }
}

/**
 * Every §6.2 invariant, checked against one returned state.
 *
 * `where` is threaded through every message so a red build names the seed and
 * the permutation index rather than leaving someone to bisect 800 replays.
 */
function assertGateInvariants(
  state: DerivedState,
  events: readonly DomainEvent[],
  where: string,
): void {
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const supersededIds = new Set(
    events.flatMap((event) =>
      event.type === 'EvidenceSuperseded' ? [event.supersededEventId] : [],
    ),
  );

  let admitted = 0;

  for (const decision of state.gateDecisions) {
    const source = byId.get(decision.eventId);
    expect(source, `${where}: a gate decision names an event not in the log`).toBeDefined();
    if (source === undefined) continue;

    // (1) Non-tier-A families are rejected by name, in every ordering.
    const forbiddenReason = NEVER_ADMITTED[decision.type];
    if (forbiddenReason !== undefined) {
      expect(
        decision.admitted,
        `${where}: ${decision.type} reached the scheduler (T-07/T-08, REQ-DM-06)`,
      ).toBe(false);
      expect(decision.reason, `${where}: ${decision.type} was rejected for the wrong reason`).toBe(
        forbiddenReason,
      );
      expect(decision.effectiveGrade, `${where}: a rejection carries a grade`).toBeNull();
      continue;
    }

    expect(decision.type, `${where}: an unexpected family reached the gate`).toBe('ReviewGraded');
    if (!decision.admitted) {
      expect(decision.effectiveGrade, `${where}: a rejected review carries a grade`).toBeNull();
      expect(decision.reason, `${where}: a rejection has no named reason`).not.toBeNull();
      continue;
    }

    admitted += 1;

    // (2) A retracted observation stays out of the scheduler.
    expect(
      supersededIds.has(decision.eventId),
      `${where}: a superseded review was admitted (REQ-DM-04.2)`,
    ).toBe(false);

    if (source.type !== 'ReviewGraded') continue;

    // (3) The reveal rule, applied on the way to FSRS whatever was submitted.
    if (source.revealedBeforeRecall) {
      expect(
        decision.effectiveGrade,
        `${where}: a revealed-before-recall review was not forced to "again" (T-06)`,
      ).toBe('again');
      expect(
        decision.forcedByReveal,
        `${where}: the reveal override was applied but not reported`,
      ).toBe(source.grade !== 'again');
    } else {
      expect(decision.effectiveGrade, `${where}: an unrevealed review's grade was altered`).toBe(
        source.grade,
      );
      expect(decision.forcedByReveal, `${where}: a reveal override was reported falsely`).toBe(
        false,
      );
    }

    // (4) Easy is never inferred.
    if (decision.effectiveGrade === 'easy') {
      expect(
        source.userConfirmedEasy,
        `${where}: an unconfirmed "easy" was admitted (REQ-DM-07)`,
      ).toBe(true);
    }
  }

  // (5) The ledger and the scheduler agree on how many reviews counted.
  const counted = state.memoryStates.reduce((sum, memory) => sum + memory.admittedReviewCount, 0);
  expect(
    counted,
    `${where}: ${String(counted)} scheduler updates for ${String(admitted)} admitted reviews`,
  ).toBe(admitted);

  // (6) T-02 — nothing activates without an explicit promotion to learn/master.
  const activated = events.some(
    (event) =>
      event.type === 'ThreadPromotionChanged' && (event.to === 'learn' || event.to === 'master'),
  );
  if (!activated) {
    expect(
      state.memoryStates,
      `${where}: a memory state exists with no promotion to learn/master (T-02)`,
    ).toHaveLength(0);
    expect(admitted, `${where}: a review was admitted on an unpromoted thread (T-02)`).toBe(0);
  }

  // (7) Every schedule is a number a screen could render.
  for (const memory of state.memoryStates) {
    expect(Number.isFinite(memory.stability), `${where}: non-finite stability`).toBe(true);
    expect(Number.isFinite(memory.difficulty), `${where}: non-finite difficulty`).toBe(true);
    expect(memory.stability, `${where}: negative stability`).toBeGreaterThanOrEqual(0);
    expect(memory.reps, `${where}: negative reps`).toBeGreaterThanOrEqual(0);
    expect(memory.lapses, `${where}: negative lapses`).toBeGreaterThanOrEqual(0);
    expect(
      isValidIsoInstant(memory.dueAt),
      `${where}: dueAt ${memory.dueAt} is not canonical`,
    ).toBe(true);
  }

  // Every evidence-class event that was *applied* got exactly one verdict —
  // no observation is judged twice, and none slips through unjudged. Counted
  // over distinct event ids rather than array positions, because a re-delivered
  // event is skipped by the idempotency rule and must not earn a second
  // verdict; a ledger with two rows for one review would be an evidence trail
  // that double-counts.
  const evidenceIds = new Set(events.filter(isEvidenceClassEvent).map((event) => event.eventId));
  expect(
    state.gateDecisions.length,
    `${where}: ${String(state.gateDecisions.length)} verdicts for ${String(evidenceIds.size)} observations`,
  ).toBe(evidenceIds.size);
  expect(
    new Set(state.gateDecisions.map((decision) => decision.eventId)).size,
    `${where}: an observation was judged twice`,
  ).toBe(state.gateDecisions.length);
}

const cases = Array.from({ length: CASE_COUNT }, (_value, index) =>
  generateCase(BASE_SEED + index),
);

describe('T1 — gate invariants hold under every generated log', () => {
  it('generates logs that actually reach the scheduler (the corpus is not vacuous)', () => {
    // A fuzz suite whose corpus never activates anything would pass every
    // assertion below by proving nothing. This is the guard on the generator.
    const activating = cases.filter((generated) => generated.activates);
    expect(activating.length).toBeGreaterThan(CASE_COUNT / 4);

    const admittedSomewhere = activating.filter((generated) => {
      const attempt = attemptReplay(parseEventLog(generated.events));
      return (attempt.state?.gateDecisions ?? []).some((decision) => decision.admitted);
    });
    expect(admittedSomewhere.length).toBeGreaterThan(0);
  });

  it('holds on every generated log in its causal order', () => {
    for (const generated of cases) {
      const events = parseEventLog(generated.events);
      const attempt = attemptReplay(events);
      expect(
        attempt.ok,
        `seed ${String(generated.seed)}: a causally ordered log failed to replay`,
      ).toBe(true);
      if (attempt.state !== null) {
        assertGateInvariants(attempt.state, events, `seed ${String(generated.seed)}`);
      }
    }
  });
});

describe('T1 — gate invariants hold under random interleavings', () => {
  it('every permutation either fails closed or satisfies every invariant', () => {
    let returned = 0;
    let rejected = 0;

    for (const generated of cases) {
      const random = randomFrom(generated.seed ^ 0x9e3779b9);

      for (let index = 0; index < PERMUTATIONS_PER_CASE; index += 1) {
        const permuted: Raw[] = shuffle(generated.events, random);
        const where = `seed ${String(generated.seed)} permutation ${String(index)}`;

        // Parsing is order-independent: a permutation is still a log of valid
        // events, so a parse failure here would be a generator bug.
        const events = parseEventLog(permuted, { path: where });
        const attempt = attemptReplay(events);

        if (!attempt.ok) {
          rejected += 1;
          // Fail-closed means nothing came back at all — not a partial state.
          expect(attempt.state, `${where}: a rejected replay still produced state`).toBeNull();
          expect(attempt.error, `${where}: replay rejected without an error`).toBeInstanceOf(Error);
          continue;
        }

        returned += 1;
        expect(attempt.state).not.toBeNull();
        if (attempt.state !== null) assertGateInvariants(attempt.state, events, where);
      }
    }

    if (SHOW_PERMUTATION_OUTCOMES) {
      console.log(`permutations: ${String(returned)} returned, ${String(rejected)} fail-closed`);
    }

    // Both arms must be exercised, or the property is only half-tested: all
    // rejections would mean the invariant checks never ran, and all returns
    // would mean the causal guards never ran.
    expect(returned, 'no permutation replayed — the invariant checks never ran').toBeGreaterThan(0);
    expect(rejected, 'no permutation was refused — the causal guards never ran').toBeGreaterThan(0);
  });
});

describe('T1 — duplication is inert', () => {
  /**
   * The double-tap property, at the kernel.
   *
   * A gesture that arrives twice is the *same event* twice — same `eventId`,
   * same `idempotencyKey`, byte-identical payload — delivered back to back.
   * Replaying that must produce a state indistinguishable from the single
   * delivery in everything except the duplicate counter. This is the invariant
   * a retrying transport, a re-mounted screen, and an impatient learner all
   * depend on, and it is checked here over the whole fuzz corpus rather than on
   * one hand-written capture.
   */
  it('re-delivering any event produces byte-identical derived state', () => {
    for (const generated of cases) {
      const events = parseEventLog(generated.events);
      const baseline = attemptReplay(events);
      if (!baseline.ok || baseline.state === null) continue;

      const random = randomFrom(generated.seed ^ 0x5bd1e995);

      for (let index = 0; index < 4; index += 1) {
        const target = random.int(events.length);
        const withDuplicate: DomainEvent[] = [];
        events.forEach((event, position) => {
          withDuplicate.push(event);
          if (position === target) withDuplicate.push(event);
        });

        const where = `seed ${String(generated.seed)} duplicate@${String(target)}`;
        const attempt = attemptReplay(withDuplicate);
        expect(attempt.ok, `${where}: re-delivery was refused`).toBe(true);
        if (attempt.state === null) continue;

        const { skippedDuplicateCount: baseSkipped, ...baseRest } = baseline.state;
        const { skippedDuplicateCount: dupSkipped, ...dupRest } = attempt.state;

        expect(dupRest, `${where}: re-delivery changed derived state`).toEqual(baseRest);
        expect(dupSkipped, `${where}: the duplicate was not counted`).toBe(baseSkipped + 1);
      }
    }
  });

  it('a duplicate delivered out of position never invents a second thread or contract', () => {
    // The weaker but broader claim: a duplicate inserted anywhere — not just
    // adjacent — must never *add* an entity. It may legitimately reorder
    // application (and so change a schedule), or be refused; it may not make
    // one capture into two threads.
    for (const generated of cases.slice(0, 32)) {
      const events = parseEventLog(generated.events);
      const baseline = attemptReplay(events);
      if (!baseline.ok || baseline.state === null) continue;

      const random = randomFrom(generated.seed ^ 0x27d4eb2f);

      for (let index = 0; index < 4; index += 1) {
        const source = random.int(events.length);
        const at = random.int(events.length + 1);
        const duplicated = [...events];
        const event = events[source];
        if (event === undefined) continue;
        duplicated.splice(at, 0, event);

        const where = `seed ${String(generated.seed)} dup ${String(source)}→${String(at)}`;
        const attempt = attemptReplay(duplicated);
        if (!attempt.ok || attempt.state === null) continue;

        expect(attempt.state.threads.length, `${where}: a duplicate forked a thread`).toBe(
          baseline.state.threads.length,
        );
        expect(attempt.state.contracts.length, `${where}: a duplicate forked a contract`).toBe(
          baseline.state.contracts.length,
        );
        assertGateInvariants(attempt.state, duplicated, where);
      }
    }
  });

  it('a key reused with different content is refused, never silently chosen between', () => {
    for (const generated of cases.slice(0, 24)) {
      const events = parseEventLog(generated.events);
      const random = randomFrom(generated.seed ^ 0x165667b1);
      const position = random.int(events.length);
      const original = events[position];
      if (original === undefined) continue;

      // Same idempotency key, different event id: two histories claiming one
      // key. There is no safe way to choose, so the only correct answer is a
      // refusal — a skip here would drop a real event without a word.
      const impostor = { ...original, eventId: `${original.eventId}-impostor` } as DomainEvent;
      const conflicting = [...events];
      conflicting.splice(position + 1, 0, impostor);

      const where = `seed ${String(generated.seed)} key-collision@${String(position)}`;
      const attempt = attemptReplay(conflicting);
      expect(attempt.ok, `${where}: a key collision was accepted`).toBe(false);
      expect(attempt.error, `${where}: a key collision threw an untyped error`).toBeInstanceOf(
        DomainError,
      );
      expect(
        attempt.error instanceof IdempotencyConflictError ||
          attempt.error instanceof DuplicateEventIdError,
        `${where}: a key collision threw the wrong domain error`,
      ).toBe(true);
    }
  });

  it('an event id reused with different content is refused', () => {
    for (const generated of cases.slice(0, 24)) {
      const events = parseEventLog(generated.events);
      const random = randomFrom(generated.seed ^ 0x2545f491);
      const position = random.int(events.length);
      const original = events[position];
      if (original === undefined) continue;

      const impostor = {
        ...original,
        idempotencyKey: `${original.idempotencyKey}-impostor`,
      } as DomainEvent;
      const conflicting = [...events];
      conflicting.splice(position + 1, 0, impostor);

      const where = `seed ${String(generated.seed)} id-collision@${String(position)}`;
      const attempt = attemptReplay(conflicting);
      expect(attempt.ok, `${where}: an event-id collision was accepted`).toBe(false);
      expect(
        attempt.error,
        `${where}: an event-id collision threw an untyped error`,
      ).toBeInstanceOf(DomainError);
    }
  });
});
