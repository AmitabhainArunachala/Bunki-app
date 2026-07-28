/**
 * What you have built, and what today added (Campaign E / B1).
 *
 * ## The map's actual job
 *
 * The round-2 research is unambiguous about why this module exists:
 *
 * > The queue empties daily and shows nothing accumulated. The map only ever
 * > accumulates. **It is the only surface that answers "what have I built"
 * > rather than "what do I owe."** Any design decision that makes the map
 * > decorative rather than the home of that answer is a mistake.
 *
 * and the instruction that follows: *"if a learner cannot tell in one glance
 * that today added something, the map is not doing its job."* So the map carries
 * two counts, and they are different in kind:
 *
 *   - **standing** — the house. Only ever grows by doing the work; it is not
 *     reset, not decayed, and not divided by anything.
 *   - **today** — the visible delta. What this day put into it.
 *
 * ## This is not a streak, and the difference is not cosmetic
 *
 * The ban is explicit and it includes near-misses: *"no streak, no XP, no
 * league, no boost, no freeze — and no near-miss of one under a different name.
 * A 'days active' counter is a streak."*
 *
 * A streak is a count of **consecutive days**, which is why it produces the
 * documented failures: it is destroyed by one missed day, and it can be defended
 * by doing something trivially easy. Nothing here counts days. `today` is a
 * count of *this day's* admissions and it does not know or care what yesterday
 * was; `standing` is a count of work that exists and a missed day does not
 * reduce it. There is no consecutive-day number anywhere in this file, no
 * "best", no "current", and nothing that resets.
 *
 * Nor is `standing` a mastery score. It is a count of contracts and nodes — how
 * much has been *established*, not how well anything is known. Retrievability is
 * per lens and lives in `map-projection.ts`; this file never touches it, so
 * there is nothing here to average.
 *
 * ## Everything is the ledger's own word
 *
 * `admittedToday` comes from `gateDecisions`, which is the evidence gate's
 * record of what it accepted — not from a count this file keeps. `activated`
 * comes from `MemoryState.activatedAt`, written by promotion. A review the gate
 * refused is not counted as work, which is the whole point of having a gate.
 *
 * Nothing here writes, mints or schedules.
 */

import type { IsoInstant } from '@bunki/domain';

/* ------------------------------------------------------------------ *
 * Inputs, narrowed to what is actually read
 * ------------------------------------------------------------------ */

/**
 * The two ledger slices this needs, structurally.
 *
 * Narrow interfaces rather than `DerivedState` so the module cannot quietly
 * start reading something else — and so a test can hand it four rows instead of
 * constructing a replay.
 */
export interface AccumulationInput {
  readonly memoryStates: readonly {
    readonly contractId: string;
    readonly activatedAt: IsoInstant;
    readonly lastReviewedAt: IsoInstant | null;
    readonly admittedReviewCount: number;
  }[];
  readonly gateDecisions: readonly {
    readonly admitted: boolean;
    readonly at: IsoInstant;
  }[];
}

/** The two counts, kept apart. */
export interface Accumulation {
  /** Contracts the scheduler holds a memory state for. Never decreases. */
  readonly contractsStanding: number;
  /** Of those, how many have at least one admitted review behind them. */
  readonly contractsAttested: number;
  /** Reviews the gate admitted today. */
  readonly admittedToday: number;
  /** Contracts promotion activated today. */
  readonly activatedToday: number;
  /** True when today put anything into the standing count. */
  readonly todayAddedSomething: boolean;
  /** One line a card renders verbatim. */
  readonly sentence: string;
}

/**
 * The calendar day of an instant, in UTC.
 *
 * UTC rather than the device's zone, deliberately and with a cost: a learner
 * reviewing at 23:00 local in a positive offset sees it counted against the next
 * UTC day. The alternative is worse — a local-zone boundary makes the same log
 * produce two different "today" counts on two devices, and the export would then
 * disagree with the screen. The instant is the ledger's; the day is a rendering
 * of it, so it takes the ledger's zone. {@link ACCUMULATION_NOTE} says so.
 */
export function dayOf(instant: IsoInstant): string {
  return instant.slice(0, 10);
}

export const ACCUMULATION_NOTE =
  'Counted by UTC day, the same zone the event log records, so this screen and an export agree. It is a count of what the evidence gate admitted — not a streak: nothing here counts consecutive days, and missing a day takes nothing away.';

/**
 * Count the house and today's delta.
 *
 * Linear in the ledger, computed once per render of the map's header rather than
 * per node or per frame.
 */
export function accumulationOf(input: AccumulationInput, now: IsoInstant): Accumulation {
  const today = dayOf(now);

  let contractsAttested = 0;
  let activatedToday = 0;
  for (const state of input.memoryStates) {
    if (state.admittedReviewCount > 0) contractsAttested += 1;
    if (dayOf(state.activatedAt) === today) activatedToday += 1;
  }

  let admittedToday = 0;
  for (const decision of input.gateDecisions) {
    if (decision.admitted && dayOf(decision.at) === today) admittedToday += 1;
  }

  const contractsStanding = input.memoryStates.length;
  const todayAddedSomething = admittedToday > 0 || activatedToday > 0;

  return {
    contractsStanding,
    contractsAttested,
    admittedToday,
    activatedToday,
    todayAddedSomething,
    sentence: todayAddedSomething
      ? `Today added ${describe(activatedToday, 'new contract')}${
          activatedToday > 0 && admittedToday > 0 ? ' and ' : ''
        }${admittedToday > 0 ? describe(admittedToday, 'admitted review') : ''}.`
      : 'Today has added nothing yet. What is below is what you had already built.',
  };
}

function describe(count: number, noun: string): string {
  if (count === 0) return '';
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}
