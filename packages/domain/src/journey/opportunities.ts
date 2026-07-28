/**
 * Untaken branches as decaying quiet opportunities (Campaign E / A2;
 * REQ-JRN-02).
 *
 * REQ-JRN-02: *"Untaken branches persist as decaying, quiet opportunities
 * unless pinned; **they must not become a new backlog**."*
 *
 * That sentence contains a trap, and this file is built around avoiding it. A
 * naive implementation stores every untaken branch forever, marks it "quiet",
 * and ships a second inbox — one that grows monotonically, that nobody ever
 * empties, and that makes the app feel like a debt. The frozen v1's own
 * competitive review names the failure by name (§10.2: dead list inboxes).
 *
 * Three properties make "not a backlog" structural rather than aspirational:
 *
 *   1. **Decay is a projection of time, not a stored countdown.** An
 *      opportunity holds an instant and a pin flag, and its weight is computed
 *      from the instant you ask about. Nothing has to run to expire it, so
 *      there is no state that can be forgotten and no queue to drain.
 *   2. **There is a hard cap.** {@link MAX_ACTIVE_QUIET_OPPORTUNITIES} bounds
 *      what {@link activeQuietOpportunities} will ever return, whatever was
 *      stored. Five hundred stumbles cannot produce five hundred quiet
 *      opportunities.
 *   3. **Nothing scheduled reads them.** A quiet opportunity carries no due
 *      date, produces no contract, and is not on any path into `session/plan.ts`
 *      — which takes due contracts and nothing else. That is the structural
 *      version of "not a new backlog", and `test/journey/opportunities.test.ts`
 *      asserts the absence directly.
 *
 * Pinned opportunities are exempt from decay because a pin is the learner
 * saying "keep this". They are still subject to the cap, and they sort first
 * inside it — a pin is a promise to keep something, not a licence to unbound
 * the list.
 */

import { compareInstants } from '../primitives.ts';
import type { ContractId, IsoInstant, ThreadId } from '../primitives.ts';
import { branchFamilyRank, type BranchFamily } from './families.ts';

export interface QuietOpportunity {
  readonly family: BranchFamily;
  /** The hypothesis it was offered under; kept so reopening it makes sense. */
  readonly hypothesis: string;
  readonly threadId: ThreadId;
  readonly contractId: ContractId;
  readonly openedAt: IsoInstant;
  readonly pinned: boolean;
}

/** REQ-JRN-02's rule in the words a surface renders. */
export const QUIET_OPPORTUNITY_POLICY =
  'The paths you did not take stay available and quiet. They are not added to anything due, nothing will ask you about them again, and they fade on their own unless you pin one.';

/**
 * Half-life of an unpinned opportunity, in days.
 *
 * Ten days is a reversible UX budget, in REQ-JRN-02's own sense — a path you
 * did not take a fortnight ago is a path about a memory state that has since
 * moved, so reopening it would be repairing something that no longer looks the
 * way it did. It is a constant so the number is arguable in one place.
 */
export const QUIET_OPPORTUNITY_HALF_LIFE_DAYS = 10;

/** Below this weight an unpinned opportunity is gone. */
export const QUIET_OPPORTUNITY_FLOOR = 0.05;

/**
 * The cap. Small on purpose: this is a quiet shelf, not an inbox.
 *
 * Chosen so the whole set fits on one screen without scrolling, because a list
 * you have to scroll is a list you have to work through.
 */
export const MAX_ACTIVE_QUIET_OPPORTUNITIES = 8;

// ---------------------------------------------------------------------------
// Elapsed time, without a Date
// ---------------------------------------------------------------------------

const INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})\.(\d{3})Z$/;

/**
 * Days from the civil epoch, by arithmetic.
 *
 * Howard Hinnant's `days_from_civil`, which is exact for the proleptic
 * Gregorian calendar and needs no calendar object. The kernel is forbidden from
 * constructing a `Date` at all (`test/purity/no-ambient-nondeterminism.test.ts`
 * scans for it, because a zero-argument one reads the ambient clock), and the
 * canonical instant format is fixed-width UTC, so parsing it is a regex and six
 * lines of integer arithmetic.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const shiftedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(shiftedYear / 400);
  const yearOfEra = shiftedYear - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

/**
 * Fractional days between two canonical instants. Negative if `to` precedes
 * `from`; callers that need a floor say so.
 *
 * Returns `null` for anything that is not a canonical instant rather than
 * guessing — a malformed timestamp should make an opportunity un-decayable and
 * visible, not silently ancient.
 */
export function elapsedDaysBetween(from: IsoInstant, to: IsoInstant): number | null {
  const left = INSTANT_PATTERN.exec(from);
  const right = INSTANT_PATTERN.exec(to);
  if (left === null || right === null) return null;

  const asDays = (match: RegExpExecArray): number => {
    const [, year, month, day, hour, minute, second, millis] = match;
    const civil = daysFromCivil(Number(year), Number(month), Number(day));
    const withinDay =
      (Number(hour) * 3_600_000 +
        Number(minute) * 60_000 +
        Number(second) * 1000 +
        Number(millis)) /
      86_400_000;
    return civil + withinDay;
  };

  return asDays(right) - asDays(left);
}

// ---------------------------------------------------------------------------
// Decay
// ---------------------------------------------------------------------------

/**
 * How present an opportunity still is, at `at`. `1` when it was just opened,
 * halving every {@link QUIET_OPPORTUNITY_HALF_LIFE_DAYS}.
 *
 * Pinned opportunities do not decay: the learner said to keep it.
 */
export function opportunityWeight(opportunity: QuietOpportunity, at: IsoInstant): number {
  if (opportunity.pinned) return 1;
  const days = elapsedDaysBetween(opportunity.openedAt, at);
  if (days === null) return 1;
  if (days <= 0) return 1;
  return Math.pow(0.5, days / QUIET_OPPORTUNITY_HALF_LIFE_DAYS);
}

/** Has an unpinned opportunity faded past the floor? */
export function hasFaded(opportunity: QuietOpportunity, at: IsoInstant): boolean {
  if (opportunity.pinned) return false;
  return opportunityWeight(opportunity, at) < QUIET_OPPORTUNITY_FLOOR;
}

/**
 * What is still quietly available at `at` — pinned first, then by weight,
 * capped.
 *
 * The cap is applied after sorting, so what survives is what is most present
 * rather than what happened to be stored first. Opportunities opened in the
 * future (a clock-skewed log) sort as fresh rather than being dropped: the
 * skew is the ledger's problem, and hiding a path because of it would be a
 * silent loss.
 */
export function activeQuietOpportunities(
  opportunities: readonly QuietOpportunity[],
  at: IsoInstant,
): readonly QuietOpportunity[] {
  const alive = opportunities.filter((opportunity) => !hasFaded(opportunity, at));

  const ranked = [...alive].sort((left, right) => {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    const byWeight = opportunityWeight(right, at) - opportunityWeight(left, at);
    if (byWeight !== 0) return byWeight;
    const byOpened = compareInstants(right.openedAt, left.openedAt);
    if (byOpened !== 0) return byOpened;
    const byContract =
      left.contractId < right.contractId ? -1 : left.contractId > right.contractId ? 1 : 0;
    if (byContract !== 0) return byContract;
    return branchFamilyRank(left.family) - branchFamilyRank(right.family);
  });

  return Object.freeze(ranked.slice(0, MAX_ACTIVE_QUIET_OPPORTUNITIES));
}

/**
 * Pin or unpin one opportunity. Pure; returns a new list.
 *
 * Identity is (contractId, family): one contract cannot have two live
 * opportunities on the same route, and a second stumble that would open one
 * should refresh the existing entry rather than stack a duplicate — see
 * {@link recordUntakenBranches}.
 */
export function setPinned(
  opportunities: readonly QuietOpportunity[],
  contractId: ContractId,
  family: BranchFamily,
  pinned: boolean,
): readonly QuietOpportunity[] {
  return Object.freeze(
    opportunities.map((opportunity) =>
      opportunity.contractId === contractId && opportunity.family === family
        ? Object.freeze({ ...opportunity, pinned })
        : opportunity,
    ),
  );
}

/**
 * Fold newly untaken branches into the stored set.
 *
 * A repeat of an existing (contract, family) pair *refreshes* its instant
 * instead of adding a row — which is what keeps repeated stumbles on one
 * contract from growing the shelf, and is the single most important reason
 * this never becomes a backlog. The pin survives the refresh.
 */
export function recordUntakenBranches(
  existing: readonly QuietOpportunity[],
  opened: readonly QuietOpportunity[],
): readonly QuietOpportunity[] {
  const byKey = new Map<string, QuietOpportunity>();
  const keyOf = (opportunity: QuietOpportunity): string =>
    `${opportunity.contractId} ${opportunity.family}`;

  existing.forEach((opportunity) => byKey.set(keyOf(opportunity), opportunity));
  opened.forEach((opportunity) => {
    const previous = byKey.get(keyOf(opportunity));
    byKey.set(
      keyOf(opportunity),
      Object.freeze({ ...opportunity, pinned: previous?.pinned ?? opportunity.pinned }),
    );
  });

  return Object.freeze([...byKey.values()]);
}
