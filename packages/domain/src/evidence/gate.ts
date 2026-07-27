/**
 * The evidence gate — admission (WP-06; controller §6.2, REQ-DM-06/07/08,
 * REQ-SCH-06, REQ-ARCH-04).
 *
 * One question, asked in one place: **may this observation change what the
 * scheduler believes?** Everything the controller lists in §6.2 is a branch of
 * the answer, and every branch is a named reason rather than a silent `false`,
 * because "this review did not count" is something a learner is entitled to see
 * explained (REQ-UI-06).
 *
 * The gate is a pure function set. It reads a context — the contracts created
 * so far, the target→thread index, each thread's promotion state at this point
 * in the log, the set of observations a correction has superseded — and returns
 * a decision. It mutates nothing, calls no clock, and never touches
 * `MemoryState` itself; `src/reducers/memory-state.ts` applies what the gate
 * admits, and applies nothing else.
 *
 * The negative assertions this file is the home of:
 *
 *   - T-02  capture (and `keep`) activate nothing; only `learn`/`master` do
 *   - T-05  a grade is admitted for exactly one `contractId`, so a reading miss
 *           cannot reach the meaning contract's state
 *   - T-06  `revealedBeforeRecall` forces `again`, whatever was submitted
 *   - T-07  `LookupFrictionLogged` never yields a grade
 *   - T-08  `ExposureLogged` (tier D) never reaches FSRS
 *   - T-09  `Candidate*` cannot enter, at compile time and at runtime
 */

import {
  activatesSkill,
  resolveComponentThread,
  type RetrievalContract,
  type TargetThreadIndex,
  type MutableTargetThreadIndex,
} from '../contracts/index.ts';
import { CandidateEvidenceBoundaryError } from '../errors.ts';
import {
  isEvidenceClassEvent,
  type DomainEvent,
  type ReviewGradedEvent,
} from '../events/catalog.ts';
import type { Grade, PromotionState } from '../events/shared.ts';
import type { ContractId, EventId, ThreadId } from '../primitives.ts';

/**
 * Every way an observation can fail to reach the scheduler.
 *
 * A closed list, so the inspector can render each one with its own explanation
 * and so a new rejection path cannot appear without a name.
 */
export const GATE_REJECTION_REASONS = [
  'not_evidence_class',
  'not_a_graded_review',
  'exposure_is_never_retrieval',
  'lookup_is_friction_not_a_grade',
  'production_is_not_tier_a',
  'correction_is_not_an_observation',
  'contract_unknown',
  'contract_invalid',
  'component_never_captured',
  'component_ambiguous',
  'thread_not_promotion_active',
  'skill_not_activated_by_promotion',
  'thread_deleted',
  'easy_requires_user_confirmation',
  'evidence_superseded',
] as const;

export type GateRejectionReason = (typeof GATE_REJECTION_REASONS)[number];

export type GateDecision =
  | {
      readonly admitted: true;
      readonly contractId: ContractId;
      readonly threadId: ThreadId;
      /** What the scheduler will be told — reveal-corrected (T-06). */
      readonly effectiveGrade: Grade;
      /** True when the submitted grade was overridden by the reveal rule. */
      readonly forcedByReveal: boolean;
    }
  | {
      readonly admitted: false;
      readonly reason: GateRejectionReason;
      readonly detail: string;
      readonly contractId: ContractId | null;
    };

/**
 * What the gate needs to know. Plain data — no callbacks, nothing that could
 * reach outside the log.
 */
export interface EvidenceGateContext {
  /** Contracts created so far, valid ones only. */
  readonly contracts: ReadonlyMap<ContractId, RetrievalContract>;
  /** Contract ids whose `ContractCreated` failed REQ-DM-05 validation. */
  readonly invalidContractIds: ReadonlySet<ContractId>;
  readonly threadIndex: TargetThreadIndex | MutableTargetThreadIndex;
  /** Promotion state per thread, as of this point in the log. */
  readonly promotionByThread: ReadonlyMap<ThreadId, PromotionState>;
  /** Threads a tombstone has closed. Deletion stops scheduling immediately. */
  readonly deletedThreadIds: ReadonlySet<ThreadId>;
  /** Observations a later `EvidenceSuperseded` retracted (REQ-DM-04.2). */
  readonly supersededEventIds: ReadonlySet<EventId>;
}

// ---------------------------------------------------------------------------
// T-09: candidates are not evidence
// ---------------------------------------------------------------------------

/**
 * Structural markers of `@bunki/ai` output.
 *
 * `candidateId` and the `T2` task class are the two fields nothing in the
 * evidence families carries, so their presence means an AI artefact is being
 * offered as an observation. The check is on shape rather than on a class or a
 * brand because the value may have crossed a JSON boundary, where classes and
 * brands do not survive and a compile-time guarantee is worth nothing.
 */
const CANDIDATE_MARKERS = ['candidateId', 'promptFamilyId', 'promptVersion'] as const;

const CANDIDATE_EVENT_TYPES = ['CandidateAttached', 'CandidateAcceptedAsNote'] as const;

/**
 * Runtime half of T-09.
 *
 * @throws CandidateEvidenceBoundaryError if the value carries a candidate marker.
 */
export function assertNotCandidate(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;
  const record = value as Record<string, unknown>;

  const type = record['type'];
  if (typeof type === 'string' && (CANDIDATE_EVENT_TYPES as readonly string[]).includes(type)) {
    throw new CandidateEvidenceBoundaryError(`type=${type}`);
  }

  const marker = CANDIDATE_MARKERS.find((name) => record[name] !== undefined);
  if (marker !== undefined) throw new CandidateEvidenceBoundaryError(marker);

  const envelope = record['envelope'];
  if (typeof envelope === 'object' && envelope !== null) {
    const taskClass = (envelope as Record<string, unknown>)['taskClass'];
    if (taskClass === 'T2') throw new CandidateEvidenceBoundaryError('envelope.taskClass=T2');
  }
}

// ---------------------------------------------------------------------------
// T-06: the reveal rule
// ---------------------------------------------------------------------------

/**
 * The grade the scheduler is told about.
 *
 * A learner who saw the answer did not recall it, whatever they then pressed
 * (REQ-DM-07). This is applied when the event is minted *and* again here, so a
 * `ReviewGraded` that reached the log some other way — a hand-written fixture,
 * an import, a future adapter — is corrected on the way to FSRS as well. One
 * rule, both doors.
 */
export function effectiveGradeOf(event: ReviewGradedEvent): Grade {
  return event.revealedBeforeRecall ? 'again' : event.grade;
}

// ---------------------------------------------------------------------------
// Admission
// ---------------------------------------------------------------------------

const reject = (
  reason: GateRejectionReason,
  detail: string,
  contractId: ContractId | null = null,
): GateDecision => ({ admitted: false, reason, detail, contractId });

/**
 * Decide whether one event may update memory state.
 *
 * Total over the whole v1 catalog: non-evidence families are rejected by name
 * rather than by falling off the end, so the caller cannot accidentally treat
 * "not applicable" as "not decided".
 */
export function admitToScheduler(event: DomainEvent, context: EvidenceGateContext): GateDecision {
  assertNotCandidate(event);

  if (!isEvidenceClassEvent(event)) {
    return reject(
      'not_evidence_class',
      `${event.type} is not an evidence-class family; only observations of what a learner did can reach the scheduler (REQ-DM-06)`,
    );
  }

  switch (event.type) {
    // T-08. Tier D is exposure: the form appeared, nobody retrieved anything.
    case 'ExposureLogged':
      return reject(
        'exposure_is_never_retrieval',
        'passive appearance in a passage or conversation is tier D — exposure only, never retrieval (REQ-DM-06, REQ-SCH-06)',
      );

    // T-07. A lookup is a fluency-friction event: neither a successful review
    // nor an automatic `again`. It may *nominate* a later probe; it may not
    // grade (REQ-DM-07).
    case 'LookupFrictionLogged':
      return reject(
        'lookup_is_friction_not_a_grade',
        'a lookup is a fluency-friction event — neither a successful review nor Again (REQ-DM-07)',
      );

    // Tier B/C update broader learner state and may schedule confirmation
    // probes; they never write FSRS directly (REQ-DM-06).
    case 'ProductionObserved':
      return reject(
        'production_is_not_tier_a',
        `tier ${event.tier} production evidence updates learner state conservatively and never FSRS directly (REQ-DM-06)`,
        event.contractId ?? null,
      );

    case 'EvidenceSuperseded':
      return reject(
        'correction_is_not_an_observation',
        'a supersession corrects an earlier observation; it is not itself an observation of retrieval (REQ-DM-04.2)',
      );

    case 'ReviewGraded':
      return admitReviewGraded(event, context);

    default: {
      const unreachable: never = event;
      return unreachable;
    }
  }
}

function admitReviewGraded(event: ReviewGradedEvent, context: EvidenceGateContext): GateDecision {
  // The schema pins `tier: "A"` on this family, so this branch is unreachable
  // through the parser. It is kept because the gate is also called on values
  // that reached the process some other way, and "the type says so" is not a
  // guarantee at a trust boundary (REQ-DM-06).
  if (event.tier !== 'A') {
    return reject(
      'not_a_graded_review',
      `only tier A direct constrained retrieval may update FSRS; received tier ${String(event.tier)}`,
      event.contractId,
    );
  }

  // A retracted observation must not keep scheduling. History is never
  // rewritten (REQ-DM-04.2) — the event stays in the ledger with its marker —
  // but a correction the learner made would be cosmetic if the misgraded
  // review went on driving their intervals (REQ-UI-06).
  if (context.supersededEventIds.has(event.eventId)) {
    return reject(
      'evidence_superseded',
      'a later EvidenceSuperseded retracted this observation; it stays in the ledger and stays out of the scheduler',
      event.contractId,
    );
  }

  if (context.invalidContractIds.has(event.contractId)) {
    return reject(
      'contract_invalid',
      `contract ${event.contractId} does not satisfy REQ-DM-05; a contract that cannot decide correctness cannot grade`,
      event.contractId,
    );
  }

  const contract = context.contracts.get(event.contractId);
  if (contract === undefined) {
    return reject(
      'contract_unknown',
      `no ContractCreated in this log established ${event.contractId}`,
      event.contractId,
    );
  }

  const link = resolveComponentThread(context.threadIndex, contract.targetComponentId);
  if (!link.linked) {
    return reject(link.reason, link.detail, event.contractId);
  }

  // A tombstoned thread stops scheduling at once. The marker is sync-safe and
  // the purge follows; a thread that kept accruing intervals after the learner
  // deleted it would resurrect itself on the next device that replayed the log
  // (ADR-002).
  if (context.deletedThreadIds.has(link.threadId)) {
    return reject(
      'thread_deleted',
      `thread ${link.threadId} is tombstoned; a deleted thread schedules nothing`,
      event.contractId,
    );
  }

  const promotion = context.promotionByThread.get(link.threadId);
  if (promotion === undefined) {
    return reject(
      'thread_not_promotion_active',
      `thread ${link.threadId} has no promotion state in this log`,
      event.contractId,
    );
  }

  // T-02. Capture lands in `captured`; `keep` is the default save and carries
  // no mandatory SRS. Only an explicit promotion to learn/master activates
  // anything (REQ-DM-09, DL-05).
  if (!activatesSkill(promotion, contract.skill)) {
    const reason: GateRejectionReason =
      promotion === 'captured' || promotion === 'keep'
        ? 'thread_not_promotion_active'
        : 'skill_not_activated_by_promotion';
    return reject(
      reason,
      `thread ${link.threadId} is in promotion state "${promotion}", which does not activate ${contract.skill} contracts (REQ-DM-09)`,
      event.contractId,
    );
  }

  const grade = effectiveGradeOf(event);
  const forcedByReveal = event.revealedBeforeRecall && event.grade !== 'again';

  // REQ-DM-07: `Easy` is never inferred. An unconfirmed `easy` is a
  // representable, recordable event — the ledger keeps it and the inspector can
  // show it — but it does not schedule. Silently demoting it to `good` would be
  // the system making a claim about the learner that the learner did not make.
  if (grade === 'easy' && event.userConfirmedEasy !== true) {
    return reject(
      'easy_requires_user_confirmation',
      'grade "easy" requires userConfirmedEasy: true; Easy is never inferred from speed or from anything else (REQ-DM-07)',
      event.contractId,
    );
  }

  return {
    admitted: true,
    contractId: event.contractId,
    threadId: link.threadId,
    effectiveGrade: grade,
    forcedByReveal,
  };
}
