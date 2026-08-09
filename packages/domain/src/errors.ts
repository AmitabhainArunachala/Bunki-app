/**
 * Typed domain errors (WP-02).
 *
 * Every rejection path in the kernel throws one of these, never a bare `Error`
 * and never a silent `null`/skip. That is the whole point of REQ-DM-04's
 * fail-closed rule: a caller that ignores a rejection has to ignore a thrown,
 * named, coded object with the offending value attached. There is no shape this
 * kernel can return that lets an unrecognised event slip through counted as
 * "applied".
 *
 * The `code` field is the stable contract (string, greppable, safe to persist
 * or log); the class is the ergonomic one. Both are part of the public surface.
 */

export const DOMAIN_ERROR_CODES = [
  'MALFORMED_EVENT',
  'UNKNOWN_EVENT_VERSION',
  'UNKNOWN_EVENT_TYPE',
  'EVENT_VALIDATION_FAILED',
  'DUPLICATE_EVENT_ID',
  'IDEMPOTENCY_CONFLICT',
  'ILLEGAL_PROMOTION_TRANSITION',
  'REDUCER_INVARIANT',
  'EVIDENCE_FACTORY_BOUNDARY',
  'CONTRACT_VALIDATION_FAILED',
  'CANDIDATE_NOT_EVIDENCE',
  'REVIEW_VERIFICATION_FAILED',
  'FOREIGN_EVENT_PROVENANCE',
] as const;

export type DomainErrorCode = (typeof DOMAIN_ERROR_CODES)[number];

/** Base class for everything this package throws. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
    // Keeps `instanceof` working for subclasses under every emit target we
    // support; harmless when the prototype chain is already correct.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

/** A validation issue, flattened out of the schema library into plain data. */
export interface EventValidationIssue {
  readonly path: string;
  readonly message: string;
}

/** The raw value was not an object at all — nothing to inspect a version on. */
export class MalformedEventError extends DomainError {
  readonly index: number | null;

  constructor(message: string, index: number | null = null) {
    super('MALFORMED_EVENT', message);
    this.index = index;
  }
}

/**
 * REQ-DM-04.1 / T-04: the event declares a schema version this build does not
 * implement (or declares none at all).
 *
 * This is the error the fail-closed rule exists for. A build that guessed at an
 * unknown version would produce derived state no other build can reproduce,
 * which silently voids the replay guarantee the entire evidence claim rests on.
 * Rejecting is the conservative outcome, and it is loud.
 */
export class UnknownEventVersionError extends DomainError {
  readonly observedVersion: unknown;
  readonly supportedVersions: readonly number[];
  readonly index: number | null;

  constructor(
    observedVersion: unknown,
    supportedVersions: readonly number[],
    index: number | null = null,
  ) {
    super(
      'UNKNOWN_EVENT_VERSION',
      `Unknown event schema version ${JSON.stringify(observedVersion)}; this build implements ${supportedVersions.join(', ')}. Events of unknown versions are rejected, never partially parsed (REQ-DM-04, T-04).`,
    );
    this.observedVersion = observedVersion;
    this.supportedVersions = supportedVersions;
    this.index = index;
  }
}

/** The version is known but the `type` discriminator is not in the v1 catalog. */
export class UnknownEventTypeError extends DomainError {
  readonly observedType: unknown;
  readonly knownTypes: readonly string[];
  readonly index: number | null;

  constructor(observedType: unknown, knownTypes: readonly string[], index: number | null = null) {
    super(
      'UNKNOWN_EVENT_TYPE',
      `Unknown event type ${JSON.stringify(observedType)}; the v1 catalog (controller §6.1, ADR-002) is a closed set. Adding a family means a schema version bump with a replay-tested migration, not a tolerated unknown.`,
    );
    this.observedType = observedType;
    this.knownTypes = knownTypes;
    this.index = index;
  }
}

/** Version and type are recognised; the payload does not satisfy the schema. */
export class EventValidationError extends DomainError {
  readonly eventType: string;
  readonly issues: readonly EventValidationIssue[];
  readonly index: number | null;

  constructor(
    eventType: string,
    issues: readonly EventValidationIssue[],
    index: number | null = null,
  ) {
    const detail = issues
      .map((issue) => `${issue.path === '' ? '<root>' : issue.path}: ${issue.message}`)
      .join('; ');
    super('EVENT_VALIDATION_FAILED', `Event ${eventType} failed v1 schema validation — ${detail}`);
    this.eventType = eventType;
    this.issues = issues;
    this.index = index;
  }
}

/** Two distinct events in one log claim the same `eventId`. */
export class DuplicateEventIdError extends DomainError {
  readonly eventId: string;
  readonly index: number;

  constructor(eventId: string, index: number) {
    super(
      'DUPLICATE_EVENT_ID',
      `Event id ${JSON.stringify(eventId)} appears twice with different content (log index ${index}). Event ids are stable and unique (REQ-DM-04.4); a collision means the log is corrupt, not that one of them should win.`,
    );
    this.eventId = eventId;
    this.index = index;
  }
}

/**
 * One idempotency key, two different events.
 *
 * Re-appending an identical event under the same key is a no-op — that is what
 * makes a double-tapped capture produce exactly one thread. Re-using the key
 * for *different* content is the opposite: it asks replay to choose which of
 * two histories is real, and there is no safe choice.
 */
export class IdempotencyConflictError extends DomainError {
  readonly idempotencyKey: string;
  readonly existingEventId: string;
  readonly conflictingEventId: string;
  readonly index: number;

  constructor(
    idempotencyKey: string,
    existingEventId: string,
    conflictingEventId: string,
    index: number,
  ) {
    super(
      'IDEMPOTENCY_CONFLICT',
      `Idempotency key ${JSON.stringify(idempotencyKey)} is claimed by event ${existingEventId} and again by a different event ${conflictingEventId} (log index ${index}).`,
    );
    this.idempotencyKey = idempotencyKey;
    this.existingEventId = existingEventId;
    this.conflictingEventId = conflictingEventId;
    this.index = index;
  }
}

/** A `ThreadPromotionChanged` that the promotion state machine will not accept. */
export class PromotionTransitionError extends DomainError {
  readonly threadId: string;
  readonly declaredFrom: string;
  readonly actualFrom: string;
  readonly to: string;
  readonly eventId: string;

  constructor(args: {
    threadId: string;
    declaredFrom: string;
    actualFrom: string;
    to: string;
    eventId: string;
    reason: string;
  }) {
    super(
      'ILLEGAL_PROMOTION_TRANSITION',
      `Thread ${args.threadId}: promotion ${args.declaredFrom} -> ${args.to} (event ${args.eventId}) rejected — ${args.reason}. Current state is ${args.actualFrom}.`,
    );
    this.threadId = args.threadId;
    this.declaredFrom = args.declaredFrom;
    this.actualFrom = args.actualFrom;
    this.to = args.to;
    this.eventId = args.eventId;
  }
}

/**
 * A structurally valid event that the reducers cannot apply, because it refers
 * to something the log has not established (a thread with no capture, a
 * candidate never attached, a purge with no tombstone).
 *
 * Skipping these would make derived state depend on which events happened to be
 * resolvable — the same class of silent divergence T-04 forbids at the schema
 * level, one layer up.
 */
export class ReducerInvariantError extends DomainError {
  readonly invariant: string;
  readonly eventId: string;
  readonly eventType: string;

  constructor(invariant: string, eventId: string, eventType: string, detail: string) {
    super(
      'REDUCER_INVARIANT',
      `Invariant ${invariant} violated by ${eventType} ${eventId}: ${detail}`,
    );
    this.invariant = invariant;
    this.eventId = eventId;
    this.eventType = eventType;
  }
}

/**
 * REQ-ARCH-04 boundary: something outside `src/evidence/` tried to mint an
 * evidence-class event.
 *
 * WP-02 owns the *types and schemas* of every §6.1 family, including the
 * evidence-class ones — validating an event that already exists is not the same
 * act as creating one. Construction of accepted `EvidenceEvent`s belongs to the
 * evidence gate in `src/evidence/` (WP-06), which is the sole factory. The
 * generic factory in `src/events/factories.ts` refuses those families at the
 * type level; this error is the runtime backstop for callers that reached it
 * through `any`.
 */
export class EvidenceFactoryBoundaryError extends DomainError {
  readonly eventType: string;

  constructor(eventType: string) {
    super(
      'EVIDENCE_FACTORY_BOUNDARY',
      `${eventType} is an evidence-class event; only @bunki/domain/src/evidence (the evidence gate, WP-06) may construct one (REQ-ARCH-04). The generic event factory deliberately cannot.`,
    );
    this.eventType = eventType;
  }
}

/** A `RetrievalContract` that is well-formed as a record but not scorable (WP-06). */
export class ContractValidationError extends DomainError {
  readonly contractId: string;
  readonly issues: readonly EventValidationIssue[];

  constructor(contractId: string, issues: readonly EventValidationIssue[]) {
    const detail = issues
      .map((issue) => `${issue.path === '' ? '<root>' : issue.path}: ${issue.message}`)
      .join('; ');
    super(
      'CONTRACT_VALIDATION_FAILED',
      `RetrievalContract ${contractId} does not satisfy REQ-DM-05 — ${detail}`,
    );
    this.contractId = contractId;
    this.issues = issues;
  }
}

/**
 * REQ-ARCH-04 / T-09 runtime backstop: an AI candidate was offered to the
 * evidence gate.
 *
 * The type system already makes `Candidate*` unassignable to the gate's inputs
 * (`CandidateAttached` and `CandidateAcceptedAsNote` are deliberately outside
 * `EVIDENCE_EVENT_TYPES`, WP-02). This error is what catches the same attempt
 * arriving through `any`, `JSON.parse`, or a provider response that a caller
 * forwarded without looking. AI may nominate and propose; it may never produce
 * an observation of what a learner did (REQ-SCH-03).
 */
export class CandidateEvidenceBoundaryError extends DomainError {
  readonly marker: string;

  constructor(marker: string) {
    super(
      'CANDIDATE_NOT_EVIDENCE',
      `Refused: the value offered to the evidence gate carries the AI-candidate marker ${JSON.stringify(marker)}. AI output is never evidence and can never reach memory state (REQ-ARCH-04, REQ-SCH-03, T-09).`,
    );
    this.marker = marker;
  }
}

export type ReviewVerificationFailureReason =
  | 'response_blank'
  | 'response_modality_unverified'
  | 'grading_method_unverified'
  | 'attempt_violates_contract_policy';

/** A caller asked the kernel to mint a review it cannot independently grade. */
export class ReviewVerificationError extends DomainError {
  readonly reason: ReviewVerificationFailureReason;
  readonly contractId: string;

  constructor(reason: ReviewVerificationFailureReason, contractId: string, detail: string) {
    super(
      'REVIEW_VERIFICATION_FAILED',
      `Review for contract ${contractId} is typed-unverified (${reason}): ${detail}`,
    );
    this.reason = reason;
    this.contractId = contractId;
  }
}

/**
 * A value was offered on the persist path without this kernel having minted it
 * (WP-10; REQ-ARCH-04).
 *
 * Thrown by `sealMintedEvents`/`openMintedEventBatch` in
 * `src/events/provenance.ts`. The three things that reach it are: an object
 * literal shaped like an event, an event that made a JSON round trip and came
 * back as a different object, and an event this kernel *did* mint that was then
 * mutated in place. All three are the same refusal — the persist path carries
 * events out of the kernel, and it must not become a door for carrying foreign
 * ones in.
 *
 * `reason` is a closed vocabulary rather than free text so a caller (and a test)
 * can distinguish the three without parsing a sentence.
 */
export type ForeignEventReason =
  /** Never minted in this process: a literal, a clone, or a parsed value. */
  | 'not_minted_here'
  /** Minted here, then mutated after minting; the recorded bytes disagree. */
  | 'mutated_after_mint'
  /** The batch container itself was not produced by `sealMintedEvents`. */
  | 'unsealed_batch';

export class ForeignEventError extends DomainError {
  readonly reason: ForeignEventReason;
  /** The event's `type` when the value had a readable one; `null` otherwise. */
  readonly eventType: string | null;

  constructor(reason: ForeignEventReason, eventType: string | null = null) {
    super(
      'FOREIGN_EVENT_PROVENANCE',
      `Refused: ${FOREIGN_EVENT_REASON_MESSAGES[reason]}${
        eventType === null ? '' : ` (offered type ${JSON.stringify(eventType)})`
      } Only events this kernel minted in this process may be persisted; evidence-class events are minted exclusively by the evidence gate (REQ-ARCH-04).`,
    );
    this.reason = reason;
    this.eventType = eventType;
  }
}

const FOREIGN_EVENT_REASON_MESSAGES: Readonly<Record<ForeignEventReason, string>> = {
  not_minted_here:
    'the value offered for persistence was not minted by this kernel in this process.',
  mutated_after_mint:
    'the value offered for persistence was minted by this kernel and then changed; the bytes no longer match what was minted.',
  unsealed_batch:
    'the batch offered for persistence was not produced by sealMintedEvents; a container shaped like one is not one.',
};
