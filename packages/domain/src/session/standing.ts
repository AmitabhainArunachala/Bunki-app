/**
 * Standing and load — what the learner holds, and what is coming (REQ-SCH-04,
 * REQ-LM-03, REQ-UI-07).
 *
 * ## Why this exists
 *
 * The round-2 competitive research
 * (`docs/design/BUNKI_COMPETITIVE_RESEARCH_ROUND2_2026-07-28.md` §1) names one
 * structural defect as the single most common reason people abandon spaced
 * repetition:
 *
 * > in Anki the *only visible quantity is the queue*. The queue is by
 * > construction unbounded, always regenerating, and it goes to zero every day.
 * > So the learner's single feedback signal is a number that (a) never
 * > permanently decreases and (b) shows nothing they have built. **You see the
 * > bill. You never see the house.**
 *
 * and, in the same section, that the **review-debt spike after a missed
 * stretch** is what actually makes people quit — you come back to a backlog that
 * reads as a bill you cannot pay. A load you can see coming is a load you can
 * manage.
 *
 * So this module answers two questions nothing in the product could answer:
 * *what is the state of what I hold*, per capability, as counts; and *what is
 * coming*, as a fortnight of scheduled work.
 *
 * ## Why it is in the kernel and not in the app
 *
 * Controller §5: `apps/app` holds no scheduling logic, and
 * `apps/app/test/screen-contract.test.ts` enforces it by scanning for the
 * scheduler's own nouns in app source. Deciding whether a contract is fragile,
 * when it next comes back, and how many fall on a given day is scheduling — it
 * reads `MemoryState` and the pinned FSRS's retrievability accessor. Putting it
 * here means the app renders a judgement the kernel made, which is the same
 * arrangement `graph/lenses.ts` and `session/plan.ts` already have.
 *
 * Every sentence a surface renders about these figures is a constant in this
 * file for the same reason: the copy has to use the scheduler's vocabulary to be
 * true, and the app is not allowed to author that vocabulary.
 *
 * ## Every rule this file obeys, and how
 *
 * **No global mastery score, no percentage, no single brightness (REQ-LM-03,
 * REQ-UI-07).** {@link SrsStanding} has no total, no ratio and no roll-up across
 * lenses. The only cross-lens number is a count of contracts, which says nothing
 * about the learner. The five lenses are reported side by side and never
 * averaged — `NO_COLLAPSED_LIGHT_RULE` applied to the SRS surface rather than
 * only to the map.
 *
 * **No streak under another name (round-2 §5).** Nothing here counts days,
 * consecutive anything, sittings sat, or answers given. This is a photograph of
 * the schedule, never of the learner's attendance.
 *
 * **One scheduler (REQ-SCH-01).** Every field is read off the `MemoryState`
 * FSRS already derived, or off `memoryStateRetrievability`, which is the pinned
 * scheduler's own accessor. Nothing here re-derives a curve, an interval or a
 * due date, and this file does not import `ts-fsrs`. The fragility rule is
 * literally {@link classifyDueContract}, imported rather than restated, so
 * "fragile" on a statistics surface and "reactivation" in a plan cannot come to
 * mean two different things.
 *
 * **Exposure is never retrieval.** Nothing here reads an `ExposureLogged`. The
 * standings come from admitted scheduling state alone.
 */

import { CAPABILITY_LENSES, lensForSkill, type CapabilityLens } from '../graph/lenses.ts';
import type { RetrievalSkill } from '../contracts/retrieval-contract.ts';
import { RETRIEVAL_SKILLS } from '../events/shared.ts';
import type { ContractId, IsoInstant } from '../primitives.ts';
import { compareInstants } from '../primitives.ts';
import type { MemoryState } from '../reducers/memory-state.ts';
import type { ContractRecord, DerivedState } from '../replay/derived-state.ts';
import { classifyDueContract } from './plan.ts';

/**
 * The four states a scheduled contract can be in, in the words a surface uses.
 *
 * Exhaustive and mutually exclusive over active contracts, which is what makes
 * them safe to show as counts: a learner can add them up and get the lens's
 * contract count, and no contract is invisible.
 */
export const CONTRACT_STANDINGS = ['unasked', 'fragile', 'due', 'holding'] as const;
export type ContractStanding = (typeof CONTRACT_STANDINGS)[number];

/**
 * What each standing means, verbatim on screen.
 *
 * Written so none of them can be read as a score. "Holding" is the closest to
 * praise and is deliberately a description of the schedule — "not due, and has
 * never lapsed" — rather than a claim about the learner.
 */
export const STANDING_MEANING: Readonly<Record<ContractStanding, string>> = Object.freeze({
  unasked:
    'Activated and never asked. There is no observation for it yet, so it comes up immediately and there is nothing to say about how well it is held.',
  fragile:
    'Has lapsed before, or is being relearned now. This is the scheduler’s own word for it — the same rule that decides what a sitting reactivates first.',
  due: 'It has come round again, and it has not lapsed. Answering it is what a sitting is for.',
  holding: 'Not due, and has never lapsed. It will come back on its own; nothing is owed today.',
});

export const STANDING_LABEL: Readonly<Record<ContractStanding, string>> = Object.freeze({
  unasked: 'never asked',
  fragile: 'fragile',
  due: 'due now',
  holding: 'holding',
});

/** One contract, as a surface needs it. No engine numbers cross this line. */
export interface ContractStandingRecord {
  readonly contractId: ContractId;
  readonly skill: RetrievalSkill;
  readonly lens: CapabilityLens | null;
  readonly standing: ContractStanding;
  /** The label a session would show for this contract, if the caller has one. */
  readonly label: string;
  /**
   * How many whole days until it comes round again; `0` when it already has.
   *
   * A count of days rather than the instant itself, because a surface's job is
   * to say "in three days" and an instant invites a screen to do date
   * arithmetic — which is scheduling, and is why this is computed here.
   */
  readonly daysUntilDue: number;
  readonly lapses: number;
}

/** One lens's standing. No total, no percentage, no roll-up. */
export interface LensStanding {
  readonly lens: CapabilityLens;
  readonly contractCount: number;
  readonly counts: Readonly<Record<ContractStanding, number>>;
  /** Whole days until this lens's soonest return, or `null` when it has none. */
  readonly daysUntilNext: number | null;
  /**
   * True when no contract in this build can ever report under this lens.
   *
   * Distinct from "you have none yet": `writing` maps to no retrieval skill in
   * Phase 0 (`LENS_SKILLS.writing` is empty), so it is *unmeasurable* rather
   * than empty, and `WRITING_LENS_DISCLOSURE` is the sentence for that. Folding
   * the two would make "not measured" read as "not known".
   */
  readonly unmeasurable: boolean;
}

/** One day of the load ahead. */
export interface LoadDay {
  /** `YYYY-MM-DD`, UTC — the calendar the kernel's instants are already in. */
  readonly date: string;
  /** Days from `asOf`. `0` is today. */
  readonly offset: number;
  readonly count: number;
}

export interface LoadAhead {
  /**
   * Contracts that have already come round at `asOf` — the backlog, counted
   * once and separately.
   *
   * Separate from day 0 on purpose: a backlog and today's work are different
   * facts, and merging them is what makes a returning learner see one enormous
   * number with no way to tell how much of it is overdue.
   */
  readonly overdue: number;
  readonly days: readonly LoadDay[];
  /** The largest `count` in `days`, so a surface can scale a bar without a max. */
  readonly peak: number;
  /** Active contracts that come back after the end of the window. */
  readonly beyondWindow: number;
}

export interface SrsStanding {
  readonly asOf: IsoInstant;
  /** Active contracts, across every lens. A count of contracts, not a score. */
  readonly contractCount: number;
  readonly lenses: readonly LensStanding[];
  readonly load: LoadAhead;
  /** Every active contract, soonest first. The list behind the counts. */
  readonly contracts: readonly ContractStandingRecord[];
  /**
   * Contracts whose state exists but whose thread was demoted.
   *
   * A count rather than a silent drop: `MemoryState.active === false` preserves
   * the history on purpose (REQ-DM-09), and a surface showing no trace of it
   * would imply a demotion deleted what the learner had done.
   */
  readonly inactiveCount: number;
}

/** How many days of load the window covers. */
export const LOAD_WINDOW_DAYS = 14;

/**
 * What the load window is and is not, verbatim on screen.
 *
 * The honesty problem here is specific. Every count is real — it is the return
 * date the pinned scheduler currently holds — but it is a photograph of *now*,
 * and every answer the learner gives moves a contract out of one day and into
 * another. Presenting it as a prediction of work would be a claim about answers
 * nobody has given.
 */
export const LOAD_AHEAD_DISCLOSURE =
  'Each day counts the contracts the scheduler currently expects to come round on that day. It is today’s schedule drawn forward, not a prediction: every answer you give moves its own contract, and anything you take up for study adds to it.';

/** Said where a surface reports a standing over an empty ledger. */
export const NOTHING_SCHEDULED_NOTE =
  'Nothing is scheduled yet. A contract exists once you take a word up for study; until then the scheduler holds nothing.';

/** Said beside a lens that has no contracts but could have. */
export const LENS_NOT_TAKEN_UP_NOTE =
  'Nothing has been taken up for study under this capability yet.';

/** Said where inactive contracts are reported. */
export const DEMOTED_CONTRACTS_NOTE =
  'These belong to threads you have demoted. Their history is kept and they are not scheduled; nothing was deleted.';

/**
 * Days since 1970-01-01 for the calendar date of a canonical instant.
 *
 * ## Why the arithmetic is written out
 *
 * `packages/domain/test/purity/no-ambient-nondeterminism.test.ts` bans `new
 * Date`, `Date.parse` and `Date.UTC` everywhere under `src/`, and the ban is
 * right: a zero-argument `Date` reads the ambient clock, and the parsing forms
 * make the kernel's answer depend on a host calendar implementation rather than
 * on the bytes in the log. `IsoInstant` is fixed-width UTC with a full calendar
 * date in it, so the conversion needs no library.
 *
 * This is the standard proleptic-Gregorian `days_from_civil` algorithm (Howard
 * Hinnant, *chrono-Compatible Low-Level Date Algorithms*), which is exact for
 * every year the format can express. It is total: an instant that reached here
 * has already been validated by `isValidIsoInstant` at mint.
 */
function daysFromCivil(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}

/** The inverse of {@link daysFromCivil}, as a `YYYY-MM-DD` string. */
function civilFromDays(days: number): string {
  const z = days + 719_468;
  const era = Math.floor(z / 146_097);
  const dayOfEra = z - era * 146_097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / 146_096)) /
      365,
  );
  const dayOfYear =
    dayOfEra - (yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  const year = yearOfEra + era * 400 + (month <= 2 ? 1 : 0);
  const pad = (value: number, width: number): string => String(value).padStart(width, '0');
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** The UTC calendar day of a canonical instant, as days since the epoch. */
function dayNumberOf(instant: IsoInstant): number {
  return daysFromCivil(
    Number(instant.slice(0, 4)),
    Number(instant.slice(5, 7)),
    Number(instant.slice(8, 10)),
  );
}

const isRetrievalSkill = (value: string): value is RetrievalSkill =>
  (RETRIEVAL_SKILLS as readonly string[]).includes(value);

/**
 * Which of the four standings a contract is in.
 *
 * `fragile` is decided by the planner's own {@link classifyDueContract}, so a
 * statistics surface's word and a plan's first section cannot drift apart. The
 * remaining split is a comparison against `asOf` and nothing more.
 */
export function standingOf(memory: MemoryState, asOf: IsoInstant): ContractStanding {
  if (memory.phase === 'new' && memory.reps === 0) return 'unasked';
  const part = classifyDueContract({
    contractId: memory.contractId,
    // The classifier reads `phase` and `lapses` only; the thread and label are
    // structural fields of its input type. Passing the contract id for both
    // keeps the call total without inventing a thread that does not exist.
    threadId: memory.contractId,
    label: '',
    phase: memory.phase,
    lapses: memory.lapses,
    dueSince: memory.dueAt,
  });
  if (part === 'reactivation') return 'fragile';
  return compareInstants(memory.dueAt, asOf) <= 0 ? 'due' : 'holding';
}

export interface SrsStandingOptions {
  /** The instant "due" is measured against. Injected; the kernel reads no clock. */
  readonly asOf: IsoInstant;
  /** contractId → the label a session would show. Falls back to the skill. */
  readonly labelByContract?: ReadonlyMap<ContractId, string> | undefined;
  readonly windowDays?: number | undefined;
}

/**
 * Calendar days from `asOf` to `instant`, floored at zero.
 *
 * Calendar days rather than 24-hour periods, because that is the unit a surface
 * says out loud — "comes back on Thursday", not "in 31 hours" — and because it
 * makes the day buckets below and this number agree by construction. It reads
 * no clock: both ends are given.
 */
function dayGap(asOf: IsoInstant, instant: IsoInstant): number {
  const gap = dayNumberOf(instant) - dayNumberOf(asOf);
  return gap < 0 ? 0 : gap;
}

/**
 * Compute the standing for one replayed log.
 *
 * Pure and total. It takes replay's own derived state — the same value the
 * evidence inspector and an export replay from — so nothing here is a second
 * projection that could disagree with the ledger.
 */
export function srsStanding(
  state: Pick<DerivedState, 'contracts' | 'memoryStates'>,
  options: SrsStandingOptions,
): SrsStanding {
  const { asOf } = options;
  const horizon = Math.max(1, Math.trunc(options.windowDays ?? LOAD_WINDOW_DAYS));

  const contractById = new Map<ContractId, ContractRecord>(
    state.contracts.map((contract) => [contract.contractId, contract]),
  );

  const contracts: ContractStandingRecord[] = [];
  const dueInstants: IsoInstant[] = [];
  let inactiveCount = 0;

  for (const memory of state.memoryStates) {
    if (!memory.active) {
      inactiveCount += 1;
      continue;
    }
    const record = contractById.get(memory.contractId);
    // A state with no contract record cannot arise from a log replay admits —
    // the state is created by the contract's own activation — but the types
    // allow it, and inventing a skill to fill the gap would be this module
    // asserting what a contract tests.
    if (record === undefined) continue;
    if (!isRetrievalSkill(record.skill)) continue;

    contracts.push({
      contractId: memory.contractId,
      skill: record.skill,
      lens: lensForSkill(record.skill),
      standing: standingOf(memory, asOf),
      label: options.labelByContract?.get(memory.contractId) ?? record.skill,
      daysUntilDue: dayGap(asOf, memory.dueAt),
      lapses: memory.lapses,
    });
    dueInstants.push(memory.dueAt);
  }

  const order = contracts
    .map((contract, index) => ({ contract, at: dueInstants[index] ?? asOf }))
    .sort((left, right) => {
      const byInstant = compareInstants(left.at, right.at);
      if (byInstant !== 0) return byInstant;
      return left.contract.contractId.localeCompare(right.contract.contractId, 'en');
    });

  const sorted = order.map((entry) => entry.contract);

  const lenses: LensStanding[] = CAPABILITY_LENSES.map((lens) => {
    const mine = sorted.filter((contract) => contract.lens === lens);
    const counts: Record<ContractStanding, number> = {
      unasked: 0,
      fragile: 0,
      due: 0,
      holding: 0,
    };
    for (const contract of mine) counts[contract.standing] += 1;
    return {
      lens,
      contractCount: mine.length,
      counts: Object.freeze(counts),
      daysUntilNext: mine[0]?.daysUntilDue ?? null,
      // Derived from the kernel's own mapping rather than from a hard-coded
      // 'writing': a lens gains contracts the moment a skill maps to it, and
      // this sentence must stop being said on the same day.
      unmeasurable: !RETRIEVAL_SKILLS.some((skill) => lensForSkill(skill) === lens),
    };
  });

  return Object.freeze({
    asOf,
    contractCount: sorted.length,
    lenses: Object.freeze(lenses),
    load: loadAhead(order, asOf, horizon),
    contracts: Object.freeze(sorted),
    inactiveCount,
  });
}

/**
 * The load ahead, in UTC calendar days.
 *
 * Overdue is counted separately and never folded into day 0 — see
 * {@link LoadAhead.overdue}. Days are UTC because the instants are; inventing a
 * local-time boundary here would make two runs of the same log in two timezones
 * report different loads for the same schedule, which a deterministic kernel may
 * not do.
 */
function loadAhead(
  entries: readonly { readonly at: IsoInstant }[],
  asOf: IsoInstant,
  horizon: number,
): LoadAhead {
  const startDay = dayNumberOf(asOf);
  const buckets = new Map<number, number>();
  let overdue = 0;
  let beyondWindow = 0;

  for (const entry of entries) {
    if (compareInstants(entry.at, asOf) <= 0) {
      overdue += 1;
      continue;
    }
    const offset = dayNumberOf(entry.at) - startDay;
    if (offset >= horizon) {
      beyondWindow += 1;
      continue;
    }
    buckets.set(offset, (buckets.get(offset) ?? 0) + 1);
  }

  const days: LoadDay[] = [];
  for (let offset = 0; offset < horizon; offset += 1) {
    days.push(
      Object.freeze({
        date: civilFromDays(startDay + offset),
        offset,
        count: buckets.get(offset) ?? 0,
      }),
    );
  }

  return Object.freeze({
    overdue,
    days: Object.freeze(days),
    peak: days.reduce((max, day) => Math.max(max, day.count), 0),
    beyondWindow,
  });
}
