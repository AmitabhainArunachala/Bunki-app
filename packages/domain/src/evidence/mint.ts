/**
 * The evidence gate — minting (WP-06; REQ-ARCH-04, REQ-DM-07).
 *
 * `src/evidence/` is the **sole factory** for evidence-class events. The
 * generic factory in `src/events/factories.ts` refuses those families at the
 * type level and throws `EvidenceFactoryBoundaryError` for a caller who reached
 * it through `any`; this file is the only door that opens.
 *
 * Two things happen here that cannot happen anywhere else, and both are the
 * reason the monopoly exists:
 *
 * **The tier is stamped, never supplied.** A caller cannot hand in
 * `tier: "A"`. Direct constrained retrieval is what `mintReviewGraded` *is*, and
 * exposure is what `mintExposureLogged` *is*; letting the caller choose the tier
 * would let the UI relabel a passage sighting as a review (REQ-DM-06,
 * REQ-SCH-06). `ProductionObserved` is the exception and keeps its tier
 * argument, because B and C are a real distinction the caller alone can make:
 * whether the production was *deliberately elicited* under a declared contract.
 *
 * **The reveal rule is applied at the source.** `revealedBeforeRecall: true`
 * produces `grade: "again"` in the minted event itself, not merely in the
 * scheduler's view of it (T-06, ADR-002). The submitted grade is not preserved
 * in a second field — there is no such field and adding one would be an ADR-002
 * schema change — and it does not need to be: `revealedBeforeRecall: true`
 * *is* the record that the grade was forced. `admitToScheduler` applies the same
 * correction independently, so an event that arrived from somewhere else is
 * corrected too.
 *
 * Everything minted here is validated on the way out by the same fail-closed
 * parser that reads the log, so the gate cannot emit an event the parser would
 * reject.
 */

import type { DomainContext } from '../context/index.ts';
import type {
  EvidenceSupersededEvent,
  ExposureLoggedEvent,
  LookupFrictionLoggedEvent,
  ProductionObservedEvent,
  ReviewGradedEvent,
} from '../events/catalog.ts';
import type { CreateEventOptions, EventPayload } from '../events/factories.ts';
import { EVENT_SCHEMA_VERSION } from '../events/envelope.ts';
import { parseEvent } from '../events/parse.ts';
import type { Grade } from '../events/shared.ts';
import { assertNotCandidate } from './gate.ts';

/**
 * Stamp the envelope.
 *
 * The one place outside `src/events/factories.ts` that reads the injected clock
 * and id generator — and it is a deliberate, tested pair, not an accident:
 * `test/purity/no-ambient-nondeterminism.test.ts` asserts that these two files
 * are the *complete* list of minters.
 */
function envelope(
  context: DomainContext,
  options: CreateEventOptions,
): { eventId: string; v: typeof EVENT_SCHEMA_VERSION; occurredAt: string; idempotencyKey: string } {
  return {
    eventId: options.eventId ?? context.ids.nextId('event'),
    v: EVENT_SCHEMA_VERSION,
    occurredAt: options.occurredAt ?? context.clock.now(),
    idempotencyKey: options.idempotencyKey,
  };
}

/** `ReviewGraded` minus the tier the gate stamps. */
export type ReviewGradedInput = Omit<EventPayload<'ReviewGraded'>, 'tier'>;

/**
 * Mint a tier-A graded review.
 *
 * Minting is not admission: this returns a well-formed observation of what
 * happened. Whether it reaches the scheduler is `admitToScheduler`'s answer,
 * and a rejected observation still belongs in the log — an `easy` the learner
 * never confirmed is evidence that the prompt was answered and that the
 * confirmation was not given, and deleting it would delete the reason the
 * review did not count.
 */
export function mintReviewGraded(
  context: DomainContext,
  input: ReviewGradedInput,
  options: CreateEventOptions,
): ReviewGradedEvent {
  assertNotCandidate(input);

  const grade: Grade = input.revealedBeforeRecall ? 'again' : input.grade;

  // The confirmation flag is kept only where it means something. On any grade
  // other than `easy` it is noise, and on a grade the reveal rule just forced
  // to `again` it would be a claim about a grade that no longer exists.
  // `exactOptionalPropertyTypes` is why this is a spread and not an assignment
  // of `undefined`: absent and present-and-undefined are different evidence
  // ("never asked" versus "declined"), and only absent is true here.
  const { userConfirmedEasy: submittedConfirmation, ...rest } = input;
  const confirmation =
    grade === 'easy' && submittedConfirmation === true ? { userConfirmedEasy: true as const } : {};

  return parseEvent({
    ...rest,
    ...confirmation,
    grade,
    tier: 'A' as const,
    type: 'ReviewGraded' as const,
    ...envelope(context, options),
  }) as ReviewGradedEvent;
}

export type ExposureLoggedInput = Omit<EventPayload<'ExposureLogged'>, 'tier'>;

/** Mint a tier-D exposure. Recorded and surfaced; never scheduled on (T-08). */
export function mintExposureLogged(
  context: DomainContext,
  input: ExposureLoggedInput,
  options: CreateEventOptions,
): ExposureLoggedEvent {
  assertNotCandidate(input);
  return parseEvent({
    ...input,
    tier: 'D' as const,
    type: 'ExposureLogged' as const,
    ...envelope(context, options),
  }) as ExposureLoggedEvent;
}

/**
 * Mint a lookup-friction event.
 *
 * It carries no grade field and no tier, on purpose (T-07). Looking a word up
 * is a signal about fluency and a nomination trigger; it is not a review
 * result in either direction.
 */
export function mintLookupFrictionLogged(
  context: DomainContext,
  input: EventPayload<'LookupFrictionLogged'>,
  options: CreateEventOptions,
): LookupFrictionLoggedEvent {
  assertNotCandidate(input);
  return parseEvent({
    ...input,
    type: 'LookupFrictionLogged' as const,
    ...envelope(context, options),
  }) as LookupFrictionLoggedEvent;
}

/**
 * Mint a production observation.
 *
 * The tier stays a parameter because only the caller knows whether the
 * production was deliberately elicited under a declared production contract
 * with a versioned rubric (tier B) or was spontaneous (tier C) — REQ-DM-06,
 * REQ-SCH-06. Neither reaches FSRS.
 */
export function mintProductionObserved(
  context: DomainContext,
  input: EventPayload<'ProductionObserved'>,
  options: CreateEventOptions,
): ProductionObservedEvent {
  assertNotCandidate(input);
  return parseEvent({
    ...input,
    type: 'ProductionObserved' as const,
    ...envelope(context, options),
  }) as ProductionObservedEvent;
}

/**
 * Mint a correction.
 *
 * REQ-DM-04.2: corrections append; history is never rewritten. The superseded
 * observation stays in the ledger with a marker, and the gate keeps it out of
 * the scheduler from then on.
 */
export function mintEvidenceSuperseded(
  context: DomainContext,
  input: EventPayload<'EvidenceSuperseded'>,
  options: CreateEventOptions,
): EvidenceSupersededEvent {
  assertNotCandidate(input);
  return parseEvent({
    ...input,
    type: 'EvidenceSuperseded' as const,
    ...envelope(context, options),
  }) as EvidenceSupersededEvent;
}
