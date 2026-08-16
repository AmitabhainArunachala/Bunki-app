/**
 * KnowledgeComponent identity in Phase 0 (WP-06; REQ-DM-05, REQ-LM-01/A12).
 *
 * ## The problem this file exists to solve
 *
 * `RetrievalContract` names the KnowledgeComponent it TESTS (`targetComponentId`,
 * REQ-DM-05). The evidence gate has to know whether that contract sits on a
 * thread the learner actually promoted (controller §6.2: "a valid,
 * **promotion-active** contract"). But no v1 event carries a component→thread
 * edge: `ContractCreated` names a component, `EncounterCaptured` names a thread,
 * and nothing joins them. WP-02 recorded that gap rather than closing it
 * (`WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION`), and the Conductor's W2
 * disposition resolved it: **build a target→thread projection from
 * `EncounterCaptured`; no ADR-002 schema change.**
 *
 * ## The projection, and why it is sound
 *
 * REQ-LM-01 (A12, sparse instantiation) says a KnowledgeComponent is
 * "instantiated only on evidence or need". In Phase 0 there is exactly one
 * instantiator — capture. A component is therefore not an independently
 * existing row with an arbitrary key; it *is* "the capability of recalling
 * something about the target the learner captured". So its identity can be
 * canonical, derived from the target itself:
 *
 *     targetKey   = the exact text the learner selected
 *     componentId = "kc:" + targetKey
 *
 * and the thread edge follows for free, because `EncounterCaptured` carries
 * both the text/span and the `threadId` (REQ-DM-02: thread BEGAN_WITH /
 * REENCOUNTERED_IN encounter).
 *
 * This adds no field, no event, and no schema version. It constrains the
 * *value* of an existing field, which is validation — WP-06's own surface —
 * rather than a widening of another work package's frozen schema.
 *
 * ## What it costs, stated plainly
 *
 * A contract whose `targetComponentId` is not the canonical id of some captured
 * target cannot be linked to a thread, so the gate refuses it and no review on
 * it can ever reach FSRS. That is the intended failure mode (fail closed,
 * REQ-DM-04.1 in spirit): an unlinkable contract is one whose promotion status
 * is unknowable, and scheduling on unknowable promotion status is precisely the
 * "capture is not a promise" violation DL-05 exists to prevent. It is not a
 * silent failure — the gate records the reason in the ledger.
 *
 * If a later phase needs components that outlive a single captured surface form
 * (a sense shared by several spellings, say), that is an ADR-002 amendment
 * adding a real edge — an explicit decision, exactly as WP-02 asked for.
 */

import { EventValidationError } from '../errors.ts';
import type { EncounterCapturedEvent } from '../events/catalog.ts';
import { nonEmptyString, spanSchema, type Span } from '../events/shared.ts';
import type { ComponentId } from '../primitives.ts';

/**
 * Namespace marker on canonical component ids.
 *
 * The prefix is not decoration. It makes a component id self-describing, so a
 * reader of a log, an inspector row, or an export can tell a Phase-0 canonical
 * component from an opaque identifier minted elsewhere — and it keeps the
 * derivation total: every canonical id has exactly one target key, recoverable
 * by stripping a fixed prefix rather than by guessing a delimiter.
 */
export const COMPONENT_ID_PREFIX = 'kc:';

/**
 * Apply the frozen v1 text/span coordinate rules and return the selected bytes.
 *
 * This deliberately does not impose the prospective-write usefulness rule:
 * historical v1 events with whitespace-only selections must remain
 * projectable even though new writes refuse to mint them.
 */
function targetTextWithinCapture(text: string, span: Span | undefined): string {
  const textResult = nonEmptyString.safeParse(text);
  if (!textResult.success) {
    throw new EventValidationError(
      'EncounterCaptured',
      textResult.error.issues.map((issue) => ({ path: 'text', message: issue.message })),
    );
  }
  if (span === undefined) return text;

  const spanResult = spanSchema.safeParse(span);
  if (!spanResult.success) {
    throw new EventValidationError(
      'EncounterCaptured',
      spanResult.error.issues.map((issue) => ({
        path: ['span', ...issue.path.map(String)].join('.'),
        message: issue.message,
      })),
    );
  }
  if (spanResult.data.end > text.length) {
    throw new EventValidationError('EncounterCaptured', [
      { path: 'span', message: 'span must lie inside text' },
    ]);
  }
  return text.slice(spanResult.data.start, spanResult.data.end);
}

/**
 * Resolve and validate the useful target of a prospective capture.
 *
 * The frozen v1 event schema historically accepted a non-empty coordinate span
 * whose bytes were only whitespace. Historical events must remain readable, so
 * {@link targetKeyOfEncounter} keeps projecting those bytes verbatim. New
 * writes are stricter: a target that the app's thread canonicaliser would turn
 * into the empty key is refused before an idempotency decision or event mint.
 */
export function targetTextOfCapture(text: string, span: Span | undefined): string {
  const targetText = targetTextWithinCapture(text, span);
  if (targetText.trim() === '') {
    throw new EventValidationError('EncounterCaptured', [
      {
        path: span === undefined ? 'text' : 'span',
        message: 'selected target must contain non-whitespace text',
      },
    ]);
  }
  return targetText;
}

/**
 * The target a capture is about.
 *
 * With a span, the target is the selected substring; without one, the learner
 * marked the whole captured text as the target. Slicing is on UTF-16 code units
 * because that is exactly the unit `encounterCapturedSchema` already bounds the
 * span against (`span.end <= text.length`) — using a different unit here would
 * mean the validator and the projection disagree about what a span means, and
 * the disagreement would only surface on text outside the BMP.
 */
export function targetKeyOfEncounter(event: EncounterCapturedEvent): string {
  // Do not route historical events through the prospective-write usefulness
  // check above. Event schema v1 accepted whitespace-only targets; replay must
  // still be able to project those bytes, even though new writes and contracts
  // refuse to grant them authority.
  return targetTextWithinCapture(event.text, event.span);
}

/** The canonical Phase-0 KnowledgeComponent id for a target key. */
export function componentIdForTargetKey(targetKey: string): ComponentId {
  return `${COMPONENT_ID_PREFIX}${targetKey}`;
}

/** The canonical component id instantiated by one capture. */
export function componentIdOfEncounter(event: EncounterCapturedEvent): ComponentId {
  return componentIdForTargetKey(targetKeyOfEncounter(event));
}

/**
 * Is this a canonical Phase-0 component id?
 *
 * A bare prefix with nothing after it is not one: `"kc:"` would name the
 * component of an empty target, and an empty target is not a thing a learner
 * can capture (`text` is a non-empty string in the v1 schema).
 */
export function isCanonicalComponentId(value: string): boolean {
  if (!value.startsWith(COMPONENT_ID_PREFIX)) return false;
  return value.slice(COMPONENT_ID_PREFIX.length).trim() !== '';
}

/** The target key a canonical component id was derived from, or `null`. */
export function targetKeyOfComponentId(componentId: string): string | null {
  if (!isCanonicalComponentId(componentId)) return null;
  return componentId.slice(COMPONENT_ID_PREFIX.length);
}
