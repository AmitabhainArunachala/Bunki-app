/**
 * Scenario builders for the WP-08 session suites.
 *
 * Two layers, used for two different jobs.
 *
 * **Synthetic due contracts** (`due`, `manyDue`) exercise the planner as the
 * pure function it is: a plan is decided by a budget and a list, and testing
 * that through a whole event log would hide the arithmetic behind fixtures.
 *
 * **A real seeded log** (`seededLog`) exercises everything downstream of the
 * planner through the same path production uses — parse, replay, gate, FSRS —
 * because a canvas probe that is correct in isolation and never reachable from a
 * real log would pass every unit test and protect nothing. It builds on WP-06's
 * own scenario helpers rather than a second fixture, so the two suites cannot
 * drift apart about what the seeded target is.
 */

import {
  parseEventLog,
  type DomainEvent,
  type DueContract,
  type IsoInstant,
  type MemoryPhase,
} from '../../src/index.ts';
import { COMPONENT, TARGET, THREAD, T, learnableLog, review } from '../support/wp06.ts';

export { COMPONENT, TARGET, THREAD, T };

/** A deterministic PRNG, so a property failure is reproducible from its seed. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INSTANT = (minute: number): IsoInstant =>
  `2026-07-27T09:${String(minute % 60).padStart(2, '0')}:00.000Z`;

export interface DueOverrides {
  readonly phase?: MemoryPhase;
  readonly lapses?: number;
  readonly dueSince?: IsoInstant;
  readonly label?: string;
  readonly threadId?: string;
}

/** One synthetic due contract. Defaults to a plain precision item. */
export function due(contractId: string, overrides: DueOverrides = {}): DueContract {
  return {
    contractId,
    threadId: overrides.threadId ?? `thread-${contractId}`,
    label: overrides.label ?? contractId,
    phase: overrides.phase ?? 'review',
    lapses: overrides.lapses ?? 0,
    dueSince: overrides.dueSince ?? INSTANT(0),
  };
}

/** `count` due contracts with distinct ids and staggered due instants. */
export function manyDue(count: number, overrides: DueOverrides = {}): readonly DueContract[] {
  return Array.from({ length: count }, (_value, index) =>
    due(`contract-${String(index).padStart(3, '0')}`, {
      ...overrides,
      dueSince: overrides.dueSince ?? INSTANT(index),
    }),
  );
}

/**
 * The seeded closed-loop log: 分岐 captured, promoted to `learn`, with the
 * meaning and reading contracts created.
 *
 * Both contracts therefore have an activated, never-reviewed memory state — due
 * now, phase `new` — which is what makes them the planner's expansion slot
 * rather than something FSRS has already scheduled.
 */
export function seededLog(): readonly DomainEvent[] {
  return parseEventLog(learnableLog(), { path: '<wp08-scenario>' });
}

/**
 * The seeded log plus one graded review, so a contract has left phase `new`.
 *
 * `grade` decides where it lands: a `good` moves it into learning/review (a
 * precision item), an `again` gives it a lapse (a reactivation item, and the
 * stumble the repair branch opens on).
 */
export function seededLogWithReview(
  args: { contractId: string; grade: 'again' | 'good'; eventId?: string; at?: IsoInstant } = {
    contractId: 'contract-reading',
    grade: 'good',
  },
): readonly DomainEvent[] {
  return parseEventLog(
    [
      ...learnableLog(),
      review({
        eventId: args.eventId ?? 'ev-review-seed',
        at: args.at ?? T.review1,
        contractId: args.contractId,
        grade: args.grade,
      }),
    ],
    { path: '<wp08-scenario-reviewed>' },
  );
}
