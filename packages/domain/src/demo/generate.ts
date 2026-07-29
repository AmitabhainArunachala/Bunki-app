/**
 * The scripted learner (lane L1) — a populated state, generated rather than faked.
 *
 * ## The problem this exists to solve
 *
 * Nothing in this app produced a populated state. The command surface was
 * capture / promote / markUncertainty / attachCandidate / acceptCandidate /
 * correctEvidence / recordExport, and none of that composes into a learner with
 * a year of history behind them. So every surface rendered its empty case, the
 * map said "0 of 0", and nobody — including the people who built it — could see
 * whether any of it was wired together. An honest empty screen is still an
 * undemonstrated app.
 *
 * ## What this module is allowed to do, and what it is not
 *
 * It is **not** allowed to write an event log. Hand-writing a log would produce
 * a file that agrees with the schema and with nothing else: no gate verdict
 * behind a refusal, no pinned reducer behind an interval, no reason behind a
 * lapse. It would be a mock in the shape of evidence, which is precisely the
 * failure this project has spent every verification round removing.
 *
 * What it does instead is **drive the real command path**. Every event below is
 * built by the kernel's own factories — `createDomainEvent` for the
 * non-evidence families, `src/evidence/mint.ts` for the evidence-class ones,
 * which is the sole factory and which stamps the tier this module therefore
 * cannot choose. Every observation is put to the real `admitToScheduler`, and
 * only what it admits reaches `applyAdmittedReview`, which is the one place in
 * the product that computes an interval. The result is not a fixture that
 * resembles a learner's log; it is a learner's log, because it went through the
 * same code a learner's gestures go through.
 *
 * The consequence is testable and is tested: `replay()` over the generated
 * events produces the same memory states this module folded forward, and the
 * export of those events verifies clean. See `test/demo/`.
 *
 * ## Determinism
 *
 * Given a seed, a corpus and a start day, two runs produce byte-identical logs.
 * Time never enters: the context handed to the factories carries a clock that
 * **throws**, and every event's `occurredAt` is stamped explicitly from the
 * script's own cursor. That is not belt-and-braces — it is the only way to be
 * sure a forgotten argument fails loudly instead of quietly making a log that
 * cannot be reproduced.
 *
 * ## Cost, measured rather than asserted
 *
 * `replay` recomputes contract activation after every applied event, over every
 * contract, which is deliberate (`replay.ts` argues for it: one path that cannot
 * get out of step, rather than four partial ones). It is also quadratic, and
 * this lane is the first thing in the repository big enough to feel it. Measured
 * in this container on Node 22, over synthetic logs of the same shape:
 *
 * | events | contracts | replay |
 * |--------|-----------|--------|
 * | 1,000  | 200       | 0.10 s |
 * | 3,000  | 600       | 0.54 s |
 * | 7,200  | 1,200     | 2.66 s |
 * | 14,400 | 2,400     | 11.1 s |
 *
 * So a stage twice the size does not take twice as long to open; it takes four
 * times. {@link ScriptedLearnerSummary.replayCostHint} carries the product that
 * predicts it, and the stage sizes in `script.ts` are chosen against these
 * numbers rather than against a guess. A verifier who wants the largest stage
 * bigger should read that table first. Narrowing the recompute to the four
 * families that can change the answer would remove most of it and is filed as a
 * coordination request rather than done here, because `replay.ts` is another
 * lane's surface and its argument for the current shape is explicit.
 */

import {
  activatesSkill,
  componentIdForTargetKey,
  emptyTargetThreadIndex,
  indexEncounter,
  retrievalContractFromEvent,
  type MutableTargetThreadIndex,
  type RetrievalContract,
  type RetrievalSkill,
} from '../contracts/index.ts';
import type { DomainClock, DomainContext } from '../context/index.ts';
import { createSequentialIdGenerator, createSeededRandom } from '../context/deterministic.ts';
import { admitToScheduler, type GateRejectionReason } from '../evidence/gate.ts';
import {
  mintEvidenceSuperseded,
  mintExposureLogged,
  mintLookupFrictionLogged,
  mintProductionObserved,
  mintReviewGraded,
} from '../evidence/mint.ts';
import type {
  ContractCreatedEvent,
  DomainEvent,
  EncounterCapturedEvent,
  ReviewGradedEvent,
} from '../events/catalog.ts';
import { createDomainEvent } from '../events/factories.ts';
import type {
  Grade,
  PromotionState,
  ProvenanceRecord,
  SessionCompletionState,
  SourceRef,
} from '../events/shared.ts';
import type { ContractId, EventId, IsoInstant, ThreadId } from '../primitives.ts';
import { compareInstants } from '../primitives.ts';
import {
  applyAdmittedReview,
  initialMemoryState,
  setMemoryStateActive,
  type MemoryState,
} from '../reducers/memory-state.ts';
import { addMs, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE, wholeDaysBetween } from './calendar.ts';
import { createDemoRandom, hashSeed, type DemoRandom } from './rng.ts';
import { phaseForDay, type DemoStageScript, type ScriptPhase } from './script.ts';

/* ------------------------------------------------------------------ *
 * The label the data carries about itself
 * ------------------------------------------------------------------ */

/**
 * The `sourceId` every scripted encounter cites.
 *
 * This is the part of the labelling that survives leaving the app. `seedRefs`
 * in an export is derived from the `sourceRef` and `provenance` of the events
 * themselves, so an exported scripted log announces at its top level that it is
 * a demonstration — a reader who never saw the banner still cannot mistake it
 * for a person's history. That is why the label is on the events rather than
 * only on the screen.
 */
export const SCRIPTED_LEARNER_SOURCE_ID = 'bunki:demonstration-learner';

/**
 * The provenance every scripted encounter carries.
 *
 * `derived` and `unreviewed` are the honest values: the captured text is a real
 * dictionary headword the caller supplied, the act of capturing it is invented,
 * and nobody reviewed the result. `attribution` is the sentence a licence
 * auditor reading the export will see beside the obligation.
 */
export const SCRIPTED_LEARNER_PROVENANCE: ProvenanceRecord = Object.freeze({
  source: SCRIPTED_LEARNER_SOURCE_ID,
  license: 'not-applicable-generated-demonstration',
  attribution:
    'Generated demonstration data. Every event was minted by this build’s own kernel and judged by its evidence gate; the learner who produced them does not exist.',
  modificationStatus: 'derived' as const,
  reviewStatus: 'unreviewed' as const,
});

/**
 * The sentence every surface renders wherever scripted data is on screen.
 *
 * Kept beside the generator so the wording and the behaviour cannot drift, and
 * so no surface can render the data while inventing its own gentler sentence.
 */
export const SCRIPTED_LEARNER_NOTE =
  'This is a demonstration learner, generated by a script. The events are real — minted by this build’s kernel, admitted or refused by its evidence gate, scheduled by its pinned memory model, and they replay and export like any others. The person is not. None of this is your history.';

/**
 * The `experienceId` prefix a scripted exposure carries.
 *
 * Distinct from the evidence inspector's own `demo-experience:` marker, which
 * names the "Add a demonstration chain" button. These two demonstrations have
 * different origins and a shared prefix would let the inspector attribute one
 * to the other.
 */
export const SCRIPTED_EXPERIENCE_PREFIX = 'scripted-learner:passage:';

/** The rubric a scripted production contract is scored against. */
export const SCRIPTED_PRODUCTION_RUBRIC_ID = 'rubric:scripted-production';
export const SCRIPTED_PRODUCTION_RUBRIC_VERSION = 'demo@1';
/** The prompt family every scripted contract stamps. Named as what it is. */
export const SCRIPTED_PROMPT_FAMILY_VERSION = 'demonstration-learner@1';

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

/**
 * One word the scripted learner can meet.
 *
 * The corpus is supplied by the caller and never invented here, for a boundary
 * reason and a truth reason. `@bunki/domain` may not import `@bunki/seed`
 * (ADR-001 boundary 1), so the kernel could not read a dictionary even if it
 * wanted to; and a generator that made up headwords would put words in the
 * ledger that no surface could resolve, so the map would draw nothing and the
 * whole exercise would fail at its own purpose. The app passes real JMdict
 * entries, which is what makes a scripted thread openable on the word page.
 */
export interface DemoTarget {
  /** The caller's stable key for this entry — used to build contract ids. */
  readonly key: string;
  /** The exact text the learner captures. Determines the component id. */
  readonly text: string;
  /** The reading a reading contract accepts. */
  readonly reading: string;
  /** The senses a meaning contract accepts. Must be non-empty. */
  readonly senses: readonly string[];
}

export interface ScriptedLearnerInput {
  readonly script: DemoStageScript;
  readonly corpus: readonly DemoTarget[];
  /**
   * Midnight UTC of the learner's first day.
   *
   * Supplied rather than pinned so a stage always ends "today" and the map is
   * not showing two years of decay on top of a log that stopped in 2024. The
   * determinism claim is *given this instant*: two runs with the same start day
   * agree byte for byte, which is what a reproducible screenshot needs.
   */
  readonly startDay: IsoInstant;
  /** Prefix for every generated id, so two stages can never collide. */
  readonly idPrefix: string;
  /**
   * The contract id for a target and a skill.
   *
   * Supplied by the caller because the *app* already has a convention for two
   * of these ids — the session mints `contract-reading-<lexemeId>` and
   * `contract-meaning-<lexemeId>` for whatever target it plans over — and a
   * scripted log that used different ids would make the first sitting on a
   * loaded stage mint a second pair of contracts for a word that already had
   * them. Handing the convention in keeps one contract per (target, skill)
   * across the generator and the app.
   */
  readonly contractIdFor: (target: DemoTarget, skill: RetrievalSkill) => ContractId;
}

/* ------------------------------------------------------------------ *
 * Output
 * ------------------------------------------------------------------ */

/** Contract counts per scheduled skill. The capability divergence, as numbers. */
export type ContractCountBySkill = Readonly<Partial<Record<RetrievalSkill, number>>>;

/**
 * What the generated log contains, counted from the log rather than declared.
 *
 * Every field here is incremented as the corresponding event is appended or as
 * the real gate returns its verdict. Nothing is a target that the script aimed
 * at: a summary written from parameters would drift the first time a phase
 * changed, and the numbers a surface renders would then be about a learner the
 * log does not describe.
 */
export interface ScriptedLearnerSummary {
  readonly eventCount: number;
  readonly threadCount: number;
  readonly promotionCounts: Readonly<Record<PromotionState, number>>;
  readonly contractCount: number;
  readonly contractsBySkill: ContractCountBySkill;
  readonly reviewCount: number;
  readonly admittedReviewCount: number;
  readonly refusedReviewCount: number;
  readonly refusalsByReason: Readonly<Partial<Record<GateRejectionReason, number>>>;
  /** Admitted reviews whose effective grade was `again` — every one opens a branch. */
  readonly lapseCount: number;
  /** Reviews whose grade the reveal rule forced, whatever was submitted (T-06). */
  readonly revealForcedCount: number;
  readonly sessionCounts: Readonly<Record<SessionCompletionState, number>>;
  readonly exposureCount: number;
  readonly lookupCount: number;
  readonly productionObservedCount: number;
  readonly correctionCount: number;
  readonly uncertaintyMarkCount: number;
  readonly exportCount: number;
  readonly tombstoneCount: number;
  /** Threads captured and never promoted past `captured`. The long tail. */
  readonly metOnceCount: number;
  /**
   * `eventCount × contractCount`, the product replay's cost tracks.
   *
   * Reported so a surface can say how heavy a stage is *before* opening it, and
   * so the table in this file's header can be checked against a real stage
   * rather than only against the synthetic logs it was measured on.
   */
  readonly replayCostHint: number;
}

export interface ScriptedLearnerLog {
  readonly stageId: string;
  readonly events: readonly DomainEvent[];
  /** The memory states this module folded forward, sorted by contract id. */
  readonly memoryStates: readonly MemoryState[];
  readonly startedAt: IsoInstant;
  readonly endedAt: IsoInstant;
  readonly dayCount: number;
  readonly summary: ScriptedLearnerSummary;
}

/* ------------------------------------------------------------------ *
 * The context handed to the kernel's factories
 * ------------------------------------------------------------------ */

/** Thrown when anything in the generator reaches for a clock. */
export class ScriptedClockError extends Error {
  constructor() {
    super(
      'The scripted learner stamps every instant from its own cursor. Nothing in it may read a clock — a generated event with an ambient timestamp would make two runs of one seed disagree.',
    );
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * A clock that refuses.
 *
 * The factories fall back to `context.clock.now()` when `occurredAt` is absent,
 * so a forgotten argument would silently take that path. Here it takes the loud
 * one instead. This is the structural half of the determinism claim; the source
 * scan in `test/purity/` is the other half.
 */
const REFUSING_CLOCK: DomainClock = {
  now(): IsoInstant {
    throw new ScriptedClockError();
  },
};

function scriptedContext(idPrefix: string, seed: string): DomainContext {
  return {
    clock: REFUSING_CLOCK,
    ids: createSequentialIdGenerator({ prefix: `${idPrefix}-`, width: 5 }),
    random: createSeededRandom(hashSeed(`${seed}:context`)),
  };
}

/* ------------------------------------------------------------------ *
 * The generator's own bookkeeping
 * ------------------------------------------------------------------ */

interface ScriptThread {
  readonly threadId: ThreadId;
  readonly target: DemoTarget;
  readonly componentId: string;
  promotion: PromotionState;
  contractIds: ContractId[];
  encounterCount: number;
  tombstoned: boolean;
}

/**
 * The mirror of what replay will conclude.
 *
 * Every field is the same structure `replay.ts` folds, built with the same
 * functions, in the same order — which is what lets the generator ask the real
 * gate "would this be admitted?" while the log is still being written. The test
 * that matters compares this mirror with `replay()` over the finished log; if
 * the two ever disagree the generator is wrong and the log is the authority.
 */
interface Mirror {
  readonly contracts: Map<ContractId, RetrievalContract>;
  readonly threadIndex: MutableTargetThreadIndex;
  readonly promotionByThread: Map<ThreadId, PromotionState>;
  readonly deletedThreadIds: Set<ThreadId>;
  /**
   * Observations a correction *will* retract.
   *
   * Populated before the gate is asked, never after. `replay` collects the
   * superseded set in a pre-pass over the whole log, so a review that a later
   * correction names is refused at replay time even though it was admitted when
   * it happened. A forward-only mirror that added the id when the correction was
   * appended would disagree with replay about every corrected review — so the
   * decision to correct is taken at the moment the review is minted, and the
   * `EvidenceSuperseded` event is queued for a later day.
   */
  readonly supersededEventIds: Set<EventId>;
  readonly memoryStates: Map<ContractId, MemoryState>;
}

interface PendingCorrection {
  readonly onDay: number;
  readonly supersededEventId: EventId;
  readonly note: string;
}

const SUPERSESSION_NOTES: readonly string[] = Object.freeze([
  'I pressed the wrong button — I did not actually recall this one.',
  'This was marked correct but I had the reading of a different word in mind.',
  'Graded in the wrong app window; this was not a review of this word.',
  'I had already seen the answer on the previous card, so this should not count.',
]);

/* ------------------------------------------------------------------ *
 * The engine
 * ------------------------------------------------------------------ */

/**
 * Run a stage script and return the log it produced.
 *
 * Pure: same input, same output, on every runtime. The only mutation is of
 * structures created inside this call.
 */
export function generateScriptedLearner(input: ScriptedLearnerInput): ScriptedLearnerLog {
  const { script, corpus, startDay, idPrefix, contractIdFor } = input;
  const context = scriptedContext(idPrefix, script.seed);
  const rng = createDemoRandom(script.seed);

  const events: DomainEvent[] = [];
  const threads: ScriptThread[] = [];
  const contractOwner = new Map<ContractId, ScriptThread>();
  const pendingCorrections: PendingCorrection[] = [];
  /**
   * Threads on each rung, so a promotion draws from the threads that can
   * actually take one.
   *
   * Sampling uniformly from every thread was the first shape of this and it
   * produced a learner who promoted almost nothing: by month six most threads
   * are already `captured`-and-abandoned or already `learn`, so a uniform draw
   * lands on a promotable one about a third of the time and the contract count
   * never leaves the low hundreds. Pools are the fix, and they also make the
   * long tail explicit — a thread that never leaves `kept` is a thread the
   * learner kept and never studied, which is a real thing and not an oversight.
   */
  const keptPool: ScriptThread[] = [];
  const learnPool: ScriptThread[] = [];

  const mirror: Mirror = {
    contracts: new Map(),
    threadIndex: emptyTargetThreadIndex(),
    promotionByThread: new Map(),
    deletedThreadIds: new Set(),
    supersededEventIds: new Set(),
    memoryStates: new Map(),
  };

  const tally = {
    promotionCounts: { captured: 0, keep: 0, learn: 0, master: 0 } as Record<
      PromotionState,
      number
    >,
    contractsBySkill: {} as Record<string, number>,
    reviewCount: 0,
    admittedReviewCount: 0,
    refusedReviewCount: 0,
    refusalsByReason: {} as Record<string, number>,
    lapseCount: 0,
    revealForcedCount: 0,
    sessionCounts: { completed: 0, abandoned: 0, budget_exhausted: 0 } as Record<
      SessionCompletionState,
      number
    >,
    exposureCount: 0,
    lookupCount: 0,
    productionObservedCount: 0,
    correctionCount: 0,
    uncertaintyMarkCount: 0,
    exportCount: 0,
    tombstoneCount: 0,
  };

  /** The moving instant every event is stamped with. */
  let cursor: IsoInstant = startDay;
  let keySequence = 0;

  const key = (label: string): string => {
    keySequence += 1;
    return `demo:${script.id}:${label}:${keySequence}`;
  };

  const step = (minMinutes: number, maxMinutes: number): IsoInstant => {
    cursor = addMs(cursor, rng.int(minMinutes, maxMinutes) * MS_PER_MINUTE);
    return cursor;
  };

  /**
   * Bring every contract's activation in line with the log so far.
   *
   * The same rule `replay.ts` applies, with the same instant, so the mirror and
   * the replay agree about when a contract's state came into existence. It is
   * called after the families that can change the answer — capture (which binds
   * a component), promotion, contract creation, and a tombstone — because those
   * are the only events that can, and calling it after a review would be work
   * that cannot change anything.
   */
  const recomputeActivation = (at: IsoInstant): void => {
    mirror.contracts.forEach((contract, contractId) => {
      const owner = contractOwner.get(contractId);
      const active =
        owner !== undefined &&
        !mirror.deletedThreadIds.has(owner.threadId) &&
        activatesSkill(mirror.promotionByThread.get(owner.threadId) ?? 'captured', contract.skill);
      const existing = mirror.memoryStates.get(contractId);
      if (existing === undefined) {
        if (active) mirror.memoryStates.set(contractId, initialMemoryState(contractId, at));
        return;
      }
      mirror.memoryStates.set(contractId, setMemoryStateActive(existing, active));
    });
  };

  /* --- capture ---------------------------------------------------------- */

  let corpusCursor = 0;

  const capture = (at: IsoInstant, marked: boolean): ScriptThread | null => {
    const target = corpus[corpusCursor];
    if (target === undefined || corpusCursor >= script.corpusBudget) return null;
    corpusCursor += 1;

    const threadId = context.ids.nextId('thread');
    const event: EncounterCapturedEvent = createDomainEvent(
      context,
      'EncounterCaptured',
      {
        encounterId: context.ids.nextId('encounter'),
        threadId,
        text: target.text,
        sourceRef: sourceRefFor(rng),
        provenance: SCRIPTED_LEARNER_PROVENANCE,
        ...(marked ? { uncertaintyMark: true as const } : {}),
      },
      { idempotencyKey: key('capture'), occurredAt: at },
    );
    events.push(event);
    if (marked) tally.uncertaintyMarkCount += 1;

    const thread: ScriptThread = {
      threadId,
      target,
      componentId: componentIdForTargetKey(target.text),
      promotion: 'captured',
      contractIds: [],
      encounterCount: 1,
      tombstoned: false,
    };
    threads.push(thread);
    mirror.promotionByThread.set(threadId, 'captured');
    // The kernel's own projection, not a local `set`: a capture instantiates the
    // component and binds it to this thread, and a second thread capturing the
    // same text has to make it ambiguous by the same rule replay applies.
    indexEncounter(mirror.threadIndex, event);
    tally.promotionCounts.captured += 1;
    recomputeActivation(at);
    return thread;
  };

  /** A re-encounter: the same thread, a new encounter, no new component. */
  const reEncounter = (thread: ScriptThread, at: IsoInstant): void => {
    if (thread.tombstoned) return;
    const event: EncounterCapturedEvent = createDomainEvent(
      context,
      'EncounterCaptured',
      {
        encounterId: context.ids.nextId('encounter'),
        threadId: thread.threadId,
        text: thread.target.text,
        sourceRef: sourceRefFor(rng),
        provenance: SCRIPTED_LEARNER_PROVENANCE,
      },
      { idempotencyKey: key('re-encounter'), occurredAt: at },
    );
    events.push(event);
    indexEncounter(mirror.threadIndex, event);
    thread.encounterCount += 1;
    recomputeActivation(at);
  };

  /* --- promotion -------------------------------------------------------- */

  const leavePool = (pool: ScriptThread[], thread: ScriptThread): void => {
    const index = pool.indexOf(thread);
    if (index !== -1) pool.splice(index, 1);
  };

  const promote = (thread: ScriptThread, to: PromotionState, at: IsoInstant): void => {
    if (thread.tombstoned || thread.promotion === to) return;
    const from = thread.promotion;
    events.push(
      createDomainEvent(
        context,
        'ThreadPromotionChanged',
        { threadId: thread.threadId, from, to, origin: 'user' as const },
        { idempotencyKey: key('promote'), occurredAt: at },
      ),
    );
    thread.promotion = to;
    mirror.promotionByThread.set(thread.threadId, to);
    tally.promotionCounts[from] -= 1;
    tally.promotionCounts[to] += 1;
    leavePool(keptPool, thread);
    leavePool(learnPool, thread);
    if (to === 'keep') keptPool.push(thread);
    if (to === 'learn') learnPool.push(thread);
    recomputeActivation(at);
  };

  /* --- contracts -------------------------------------------------------- */

  const createContract = (thread: ScriptThread, skill: RetrievalSkill, at: IsoInstant): void => {
    const contractId = contractIdFor(thread.target, skill);
    if (mirror.contracts.has(contractId)) return;

    const event: ContractCreatedEvent = createDomainEvent(
      context,
      'ContractCreated',
      {
        contractId,
        contractVersion: 1,
        targetComponentId: thread.componentId,
        skill,
        ...contractShapeFor(skill, thread.target),
        hintPolicy: { hintsAllowed: true, maxHints: 1 },
        revealPolicy: { revealAllowed: true, revealIsRecorded: true as const },
        promptFamilyVersion: SCRIPTED_PROMPT_FAMILY_VERSION,
      },
      // The app's own convention, so a sitting over a scripted thread finds the
      // contract already established instead of minting a second one.
      { idempotencyKey: `contract:${contractId}`, occurredAt: at },
    );
    events.push(event);

    const entity = retrievalContractFromEvent(event);
    if (!entity.valid) {
      // A scripted contract the kernel calls unscorable is a bug in this file,
      // not a state worth demonstrating: every review on it would be refused for
      // one reason and the ledger would show one branch of the gate forever.
      throw new Error(
        `the scripted learner built an unscorable ${skill} contract for ${thread.target.text}: ${entity.issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
      );
    }
    mirror.contracts.set(contractId, entity.contract);
    contractOwner.set(contractId, thread);
    thread.contractIds.push(contractId);
    tally.contractsBySkill[skill] = (tally.contractsBySkill[skill] ?? 0) + 1;
    recomputeActivation(at);
  };

  /* --- reviews ---------------------------------------------------------- */

  /**
   * One probe, through the real gate.
   *
   * The order of the four steps is the whole point: mint (which applies the
   * reveal rule at source, T-06), decide whether a correction will name this
   * event *before* the gate is asked, ask the gate, and apply only what it
   * admitted. A refusal is recorded and nothing else happens — which is exactly
   * what a refusal is.
   */
  const review = (contractId: ContractId, at: IsoInstant, phase: ScriptPhase): void => {
    const grade = rng.weighted(phase.gradeMix) as Grade;
    const revealed = rng.chance(phase.revealChance);
    const confirmEasy = grade === 'easy' && !rng.chance(phase.unconfirmedEasyChance);
    const willBeCorrected = rng.chance(phase.correctionChance);
    const correctionDelayDays = rng.int(1, 4);
    const noteIndex = rng.int(0, SUPERSESSION_NOTES.length - 1);

    const event: ReviewGradedEvent = mintReviewGraded(
      context,
      {
        contractId,
        grade,
        // Part of the character, not a measurement. A scripted learner's answer
        // time is drawn from the same stream as their grade; nothing timed it
        // and no surface may present it as if something had.
        latencyMs: rng.int(900, 14_000),
        hintsUsed: rng.chance(0.12) ? 1 : 0,
        revealedBeforeRecall: revealed,
        probeContext: rng.chance(0.12) ? ('embedded' as const) : ('standalone' as const),
        ...(confirmEasy ? { userConfirmedEasy: true as const } : {}),
      },
      { idempotencyKey: key('review'), occurredAt: at },
    );
    events.push(event);
    tally.reviewCount += 1;
    if (revealed && grade !== 'again') tally.revealForcedCount += 1;

    if (willBeCorrected) {
      mirror.supersededEventIds.add(event.eventId);
      pendingCorrections.push({
        onDay: correctionDelayDays,
        supersededEventId: event.eventId,
        note: SUPERSESSION_NOTES[noteIndex] ?? SUPERSESSION_NOTES[0] ?? 'Corrected.',
      });
    }

    const decision = admitToScheduler(event, {
      contracts: mirror.contracts,
      invalidContractIds: new Set<ContractId>(),
      threadIndex: mirror.threadIndex,
      promotionByThread: mirror.promotionByThread,
      deletedThreadIds: mirror.deletedThreadIds,
      supersededEventIds: mirror.supersededEventIds,
    });

    if (!decision.admitted) {
      tally.refusedReviewCount += 1;
      tally.refusalsByReason[decision.reason] = (tally.refusalsByReason[decision.reason] ?? 0) + 1;
      return;
    }

    tally.admittedReviewCount += 1;
    if (decision.effectiveGrade === 'again') tally.lapseCount += 1;

    const state = mirror.memoryStates.get(decision.contractId);
    if (state === undefined) {
      throw new Error(
        `the gate admitted a review for ${decision.contractId} but the scripted mirror activated no state for it`,
      );
    }
    mirror.memoryStates.set(
      decision.contractId,
      applyAdmittedReview(state, {
        contractId: decision.contractId,
        effectiveGrade: decision.effectiveGrade,
        reviewedAt: at,
      }),
    );
  };

  /* --- the day loop ----------------------------------------------------- */

  for (let day = 0; day < script.days; day += 1) {
    const phase = phaseForDay(script, day);
    const dayStart = addMs(startDay, day * MS_PER_DAY);
    // Somewhere in the waking hours, so the instants read like a person's
    // rather than a cron job's — and never *before* where the previous day
    // finished, so the log stays in chronological order however long a day ran.
    const morning = addMs(dayStart, 7 * MS_PER_HOUR + rng.int(0, 6 * 60) * MS_PER_MINUTE);
    cursor = compareInstants(cursor, morning) > 0 ? addMs(cursor, MS_PER_MINUTE) : morning;

    // 1. What the learner met today.
    if (rng.chance(phase.captureDayChance)) {
      const count = rng.int(phase.capturesPerDay[0], phase.capturesPerDay[1]);
      for (let index = 0; index < count; index += 1) {
        const marked = rng.chance(phase.uncertaintyChance);
        const keep = rng.chance(phase.keepChance);
        const thread = capture(step(2, 25), marked);
        if (thread !== null && keep) promote(thread, 'keep', step(0, 2));
      }
    }

    // 2. A word met before, met again. Recorded on the thread it belongs to.
    if (threads.length > 4 && rng.chance(0.18)) {
      const existing = threads[rng.int(0, threads.length - 1)];
      if (existing !== undefined) reEncounter(existing, step(1, 20));
    }

    // 3. Promotion is a separate, later act (DL-05) — always a day after the
    //    capture at the earliest, and always out of the kept pool.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (keptPool.length === 0) break;
      if (!rng.chance(phase.learnChance)) continue;
      const candidate = keptPool[rng.int(0, keptPool.length - 1)];
      if (candidate === undefined || candidate.tombstoned) continue;
      promote(candidate, 'learn', step(1, 12));
      createContract(candidate, 'orthography_to_reading', step(0, 2));
      if (rng.chance(phase.meaningContractChance)) {
        createContract(candidate, 'form_to_meaning', step(0, 2));
      }
      if (rng.chance(phase.listeningContractChance)) {
        createContract(candidate, 'audio_to_meaning', step(0, 2));
      }
    }

    // 4. The rung almost nobody reaches — and the only one that activates
    //    production contracts (REQ-DM-09.3). This is where the production lens
    //    gets its handful of lit nodes and its very dark background.
    if (learnPool.length > 0 && rng.chance(phase.masterChance)) {
      const candidate = learnPool[rng.int(0, learnPool.length - 1)];
      if (candidate !== undefined && !candidate.tombstoned) {
        promote(candidate, 'master', step(1, 12));
        createContract(candidate, 'meaning_to_production', step(0, 2));
      }
    }

    // 5. The sitting.
    //
    // The plan is composed once, from what the scheduler had already made due,
    // and it never grows (T-13). The learner takes as much of it as their cap
    // allows, so a day whose queue fits inside the cap ends `completed` and a
    // day whose queue does not ends `budget_exhausted` — which is the whole
    // point of the two states existing.
    if (rng.chance(phase.sitDayChance)) {
      const plan = dueContracts(mirror, cursor);
      const cap = rng.int(phase.reviewsPerSitting[0], phase.reviewsPerSitting[1]);
      const abandoned = rng.chance(phase.abandonChance);
      const taken = Math.min(plan.length, abandoned ? rng.int(0, Math.max(0, cap - 1)) : cap);

      if (plan.length > 0) {
        const sessionId = context.ids.nextId('session');
        events.push(
          createDomainEvent(
            context,
            'SessionStarted',
            {
              sessionId,
              budget: { timeBudgetMin: rng.int(8, 25), newBudget: rng.int(0, 3) },
            },
            { idempotencyKey: key('session-start'), occurredAt: step(1, 45) },
          ),
        );

        // A demotion taken *inside* the sitting, which is the only way a
        // scripted learner can produce a `thread_not_promotion_active` refusal
        // honestly: the plan was composed while the thread still activated its
        // contracts, and by the time the probe came round it did not. That is
        // the case `probeOfferFor` documents from the other side — "demoting the
        // thread mid-session withdraws the probe" — and the ledger keeps the
        // answer with the gate's reason for not counting it.
        const demoteDuring =
          learnPool.length > 0 && taken > 2 && rng.chance(phase.demotionChance)
            ? learnPool[rng.int(0, learnPool.length - 1)]
            : undefined;
        const demoteAfter = demoteDuring === undefined ? -1 : rng.int(1, taken - 1);

        for (let index = 0; index < taken; index += 1) {
          if (index === demoteAfter && demoteDuring !== undefined && !demoteDuring.tombstoned) {
            promote(demoteDuring, 'keep', step(0, 1));
          }
          const contractId = plan[index];
          if (contractId === undefined) break;
          review(contractId, step(1, 4), phase);
        }

        const completionState: SessionCompletionState = abandoned
          ? 'abandoned'
          : plan.length > taken
            ? 'budget_exhausted'
            : 'completed';
        tally.sessionCounts[completionState] += 1;
        events.push(
          createDomainEvent(
            context,
            'SessionClosed',
            { sessionId, completionState },
            { idempotencyKey: key('session-close'), occurredAt: step(0, 3) },
          ),
        );
      }
    }

    // 6. Reading. Exposure is never retrieval (T-08), and the gate says so on
    //    every one of these rows.
    if (threads.length > 2 && rng.chance(phase.exposureDayChance)) {
      const met = pickDistinct(rng, threads, rng.int(1, Math.min(4, threads.length)));
      const componentIds = met.filter((thread) => !thread.tombstoned).map((t) => t.componentId);
      if (componentIds.length > 0) {
        const exposure = mintExposureLogged(
          context,
          {
            componentIds,
            experienceId: `${SCRIPTED_EXPERIENCE_PREFIX}${String(day)}`,
          },
          { idempotencyKey: key('exposure'), occurredAt: step(3, 40) },
        );
        events.push(exposure);
        tally.exposureCount += 1;
        refuseOrThrow(exposure, mirror, 'exposure_is_never_retrieval');
      }
    }

    // 7. A lookup: fluency friction, and never a grade in either direction.
    if (threads.length > 0 && rng.chance(phase.lookupDayChance)) {
      const thread = threads[rng.int(0, threads.length - 1)];
      if (thread !== undefined) {
        const lookup = mintLookupFrictionLogged(
          context,
          {
            targetRef: { targetType: 'lexeme' as const, targetId: thread.target.key },
            context: rng.chance(0.6) ? ('reading' as const) : ('conversation' as const),
          },
          { idempotencyKey: key('lookup'), occurredAt: step(1, 30) },
        );
        events.push(lookup);
        tally.lookupCount += 1;
        refuseOrThrow(lookup, mirror, 'lookup_is_friction_not_a_grade');
      }
    }

    // 8. Something the learner said or wrote. Tier B when a production contract
    //    elicited it, tier C when it was spontaneous — and neither reaches FSRS.
    if (threads.length > 0 && rng.chance(phase.productionObservedChance)) {
      const thread = threads[rng.int(0, threads.length - 1)];
      if (thread !== undefined) {
        const productionContract = thread.contractIds.find(
          (contractId) => mirror.contracts.get(contractId)?.skill === 'meaning_to_production',
        );
        const elicited = productionContract !== undefined;
        const production = mintProductionObserved(
          context,
          {
            elicited,
            tier: elicited ? ('B' as const) : ('C' as const),
            ...(productionContract === undefined
              ? {}
              : {
                  contractId: productionContract,
                  rubricId: SCRIPTED_PRODUCTION_RUBRIC_ID,
                  rubricVersion: SCRIPTED_PRODUCTION_RUBRIC_VERSION,
                }),
          },
          { idempotencyKey: key('production'), occurredAt: step(1, 30) },
        );
        events.push(production);
        tally.productionObservedCount += 1;
        refuseOrThrow(production, mirror, 'production_is_not_tier_a');
      }
    }

    // 9. Corrections queued when their target was minted. History is appended,
    //     never rewritten (REQ-DM-04.2).
    for (let index = pendingCorrections.length - 1; index >= 0; index -= 1) {
      const pending = pendingCorrections[index];
      if (pending === undefined) continue;
      if (pending.onDay > 0) {
        pendingCorrections[index] = { ...pending, onDay: pending.onDay - 1 };
        continue;
      }
      pendingCorrections.splice(index, 1);
      events.push(
        mintEvidenceSuperseded(
          context,
          {
            supersededEventId: pending.supersededEventId,
            reason: 'user_correction' as const,
            correction: { note: pending.note },
          },
          { idempotencyKey: key('supersede'), occurredAt: step(1, 20) },
        ),
      );
      tally.correctionCount += 1;
    }

    // 10. An export. The record of it is in the log it exports (controller §11).
    if (rng.chance(phase.exportDayChance)) {
      events.push(
        createDomainEvent(
          context,
          'DataExported',
          { exportVersion: '1', scope: { kind: 'all' as const } },
          { idempotencyKey: key('export'), occurredAt: step(1, 20) },
        ),
      );
      tally.exportCount += 1;
    }
  }

  // A capture the learner regretted, deleted, and purged. It is a thread that
  // never left `captured`, so nothing was ever scheduled on it and the deletion
  // is about the record rather than about a schedule.
  const regretted = threads.find(
    (thread) => thread.promotion === 'captured' && thread.contractIds.length === 0,
  );
  if (regretted !== undefined) {
    const tombstone = createDomainEvent(
      context,
      'ThreadTombstoned',
      { threadId: regretted.threadId, reason: 'mistaken_capture' as const },
      { idempotencyKey: key('tombstone'), occurredAt: step(1, 30) },
    );
    events.push(tombstone);
    regretted.tombstoned = true;
    mirror.deletedThreadIds.add(regretted.threadId);
    recomputeActivation(cursor);
    events.push(
      createDomainEvent(
        context,
        'ContentPurged',
        { targetIds: [regretted.threadId], tombstoneEventId: tombstone.eventId },
        { idempotencyKey: key('purge'), occurredAt: step(1, 10) },
      ),
    );
    tally.tombstoneCount += 1;
  }

  const memoryStates = [...mirror.memoryStates.values()].sort((left, right) =>
    left.contractId < right.contractId ? -1 : left.contractId > right.contractId ? 1 : 0,
  );

  const contractCount = mirror.contracts.size;
  const summary: ScriptedLearnerSummary = Object.freeze({
    eventCount: events.length,
    threadCount: threads.length,
    promotionCounts: Object.freeze({ ...tally.promotionCounts }),
    contractCount,
    contractsBySkill: Object.freeze({ ...tally.contractsBySkill }) as ContractCountBySkill,
    reviewCount: tally.reviewCount,
    admittedReviewCount: tally.admittedReviewCount,
    refusedReviewCount: tally.refusedReviewCount,
    refusalsByReason: Object.freeze({ ...tally.refusalsByReason }) as Readonly<
      Partial<Record<GateRejectionReason, number>>
    >,
    lapseCount: tally.lapseCount,
    revealForcedCount: tally.revealForcedCount,
    sessionCounts: Object.freeze({ ...tally.sessionCounts }),
    exposureCount: tally.exposureCount,
    lookupCount: tally.lookupCount,
    productionObservedCount: tally.productionObservedCount,
    correctionCount: tally.correctionCount,
    uncertaintyMarkCount: tally.uncertaintyMarkCount,
    exportCount: tally.exportCount,
    tombstoneCount: tally.tombstoneCount,
    metOnceCount: threads.filter((thread) => thread.promotion === 'captured').length,
    replayCostHint: events.length * contractCount,
  });

  const endedAt = events[events.length - 1]?.occurredAt ?? startDay;
  return Object.freeze({
    stageId: script.id,
    events,
    memoryStates,
    startedAt: startDay,
    endedAt,
    dayCount: Math.max(1, wholeDaysBetween(startDay, endedAt) + 1),
    summary,
  });
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function gateContextOf(mirror: Mirror): Parameters<typeof admitToScheduler>[1] {
  return {
    contracts: mirror.contracts,
    invalidContractIds: new Set<ContractId>(),
    threadIndex: mirror.threadIndex,
    promotionByThread: mirror.promotionByThread,
    deletedThreadIds: mirror.deletedThreadIds,
    supersededEventIds: mirror.supersededEventIds,
  };
}

/**
 * Put a non-review observation to the real gate and insist it is refused.
 *
 * EXPOSURE IS NEVER RETRIEVAL, a lookup is never a grade, and production never
 * reaches FSRS directly. Those are the kernel's rules and they are already
 * tested there — this is the generator refusing to *produce* a log in which
 * they did not hold. If the gate ever admitted one of these, the demonstration
 * would be showing a state the product forbids, and the loudest possible
 * failure is the right one.
 */
function refuseOrThrow(event: DomainEvent, mirror: Mirror, expected: GateRejectionReason): void {
  const decision = admitToScheduler(event, gateContextOf(mirror));
  if (decision.admitted || decision.reason !== expected) {
    throw new Error(
      `the evidence gate did not refuse a ${event.type} for ${expected}: ${JSON.stringify(decision)}`,
    );
  }
}

/**
 * Everything the scheduler has already made due, oldest first.
 *
 * The planner's own input shape (`session/plan.ts` takes contracts "the item
 * scheduler has already decided are due"), read off the mirror rather than
 * decided here. Nothing in this function computes an interval.
 */
function dueContracts(mirror: Mirror, at: IsoInstant): readonly ContractId[] {
  const due: { readonly contractId: ContractId; readonly since: IsoInstant }[] = [];
  mirror.memoryStates.forEach((state, contractId) => {
    if (!state.active) return;
    if (compareInstants(state.dueAt, at) > 0) return;
    due.push({ contractId, since: state.dueAt });
  });
  due.sort((left, right) => {
    const byTime = compareInstants(left.since, right.since);
    return byTime !== 0 ? byTime : left.contractId < right.contractId ? -1 : 1;
  });
  return due.map((entry) => entry.contractId);
}

/** Where a scripted encounter says it came from. Always a demonstration id. */
function sourceRefFor(rng: DemoRandom): SourceRef {
  const kinds = ['text', 'conversation', 'audio', 'manual'] as const;
  return { sourceId: SCRIPTED_LEARNER_SOURCE_ID, kind: rng.pick(kinds) };
}

/**
 * The cue/response/scoring triple for one skill.
 *
 * Production is scored by a versioned rubric because its response is free, and
 * a free response scored against a closed answer list is refused by REQ-DM-05's
 * coherence rule — a correct paraphrase would be graded wrong and the resulting
 * `again` would be an artefact of the contract rather than of the learner.
 */
function contractShapeFor(
  skill: RetrievalSkill,
  target: DemoTarget,
): Pick<
  ContractCreatedEvent,
  'cueModality' | 'responseModality' | 'acceptedAnswers' | 'rubricId' | 'rubricVersion'
> {
  switch (skill) {
    case 'orthography_to_reading':
      return {
        cueModality: 'text',
        responseModality: 'text',
        acceptedAnswers: [target.reading],
      };
    case 'audio_to_meaning':
      return {
        cueModality: 'audio',
        responseModality: 'choice',
        acceptedAnswers: [...target.senses],
      };
    case 'meaning_to_production':
      return {
        cueModality: 'text',
        responseModality: 'free',
        rubricId: SCRIPTED_PRODUCTION_RUBRIC_ID,
        rubricVersion: SCRIPTED_PRODUCTION_RUBRIC_VERSION,
      };
    default:
      return {
        cueModality: 'text',
        responseModality: 'text',
        acceptedAnswers: [...target.senses],
      };
  }
}

/** `count` distinct members, drawn one value per member so the order is fixed. */
function pickDistinct<T>(rng: DemoRandom, items: readonly T[], count: number): readonly T[] {
  const chosen: T[] = [];
  const used = new Set<number>();
  for (let attempt = 0; attempt < count * 3 && chosen.length < count; attempt += 1) {
    const index = rng.int(0, items.length - 1);
    if (used.has(index)) continue;
    used.add(index);
    const item = items[index];
    if (item !== undefined) chosen.push(item);
  }
  return chosen;
}
