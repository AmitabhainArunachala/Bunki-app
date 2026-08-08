/** Content-exact, replay-compatible identity for persisted capture gestures. */

import { sha256Hex } from '@bunki/ai';
import {
  canonicalJson,
  parseEvent,
  targetTextOfCapture,
  type EncounterCapturedEvent,
  type ProvenanceRecord,
  type SourceRef,
  type Span,
} from '@bunki/domain';

import type { CaptureCommand } from './store.ts';

/** The authority-bearing capture fields that survive export and replay. */
export interface PersistedCaptureClaim {
  readonly eventVersion: 1;
  readonly text: string;
  readonly span: Span | null;
  readonly sourceRef: SourceRef;
  readonly provenance: ProvenanceRecord;
  readonly uncertaintyMark: boolean;
}

export interface ValidatedCaptureClaim {
  readonly selectedText: string;
  readonly persisted: PersistedCaptureClaim;
}

const PROSPECTIVE_EVENT_ID = 'prospective-capture-event';
const PROSPECTIVE_ENCOUNTER_ID = 'prospective-capture-encounter';
const PROSPECTIVE_THREAD_ID = 'prospective-capture-thread';
const PROSPECTIVE_IDEMPOTENCY_KEY = 'prospective-capture-idempotency';
const PROSPECTIVE_OCCURRED_AT = '1970-01-01T00:00:00.000Z';

/**
 * Validate every field that a successful capture would persist, without
 * consuming an injected clock instant or id.
 *
 * This must run before any idempotency lookup. Otherwise an invalid source or
 * provenance object that happens to collide with an old key can be reported as
 * a successful duplicate without ever crossing the event schema.
 */
export function validateCaptureClaim(command: CaptureCommand): ValidatedCaptureClaim {
  const selectedText = targetTextOfCapture(command.text, command.span);
  const parsed = parseEvent({
    eventId: PROSPECTIVE_EVENT_ID,
    v: 1,
    occurredAt: PROSPECTIVE_OCCURRED_AT,
    idempotencyKey: PROSPECTIVE_IDEMPOTENCY_KEY,
    type: 'EncounterCaptured',
    encounterId: PROSPECTIVE_ENCOUNTER_ID,
    threadId: PROSPECTIVE_THREAD_ID,
    text: command.text,
    ...(command.span === undefined ? {} : { span: command.span }),
    sourceRef: command.sourceRef,
    provenance: command.provenance,
    ...(command.uncertainty === null ? {} : { uncertaintyMark: true }),
  });

  // The literal discriminator above and the parser's closed union make this
  // branch unreachable. Keeping the guard makes a future parser API widening
  // fail here instead of producing a partial capture fingerprint.
  if (parsed.type !== 'EncounterCaptured') {
    throw new Error('prospective capture validation returned a non-capture event');
  }

  return {
    selectedText,
    persisted: captureClaimOfEvent(parsed),
  };
}

/** Normalize one parsed capture into the exact fields covered by its v2 key. */
export function captureClaimOfEvent(event: EncounterCapturedEvent): PersistedCaptureClaim {
  return {
    eventVersion: event.v,
    text: event.text,
    span: event.span === undefined ? null : { ...event.span },
    sourceRef: { ...event.sourceRef },
    provenance: { ...event.provenance },
    uncertaintyMark: event.uncertaintyMark === true,
  };
}

/** Byte-order-independent equality for legacy dual-read decisions. */
export function captureClaimMatchesEvent(
  claim: PersistedCaptureClaim,
  event: EncounterCapturedEvent,
): boolean {
  return canonicalJson(claim) === canonicalJson(captureClaimOfEvent(event));
}

/**
 * New captures use a bounded key over every persisted authority-bearing field.
 * SHA-256 avoids copying source text or provenance into the exported key while
 * canonical JSON keeps construction order from affecting identity.
 */
export function captureV2IdempotencyKey(claim: PersistedCaptureClaim): string {
  return `capture:v2:${sha256Hex(canonicalJson(claim))}`;
}

/**
 * The pre-hardening key, retained only to recognise exact historical retries.
 * Its raw delimiters and incomplete payload are intentionally not reused for a
 * newly minted event.
 */
export function legacyCaptureIdempotencyKey(
  claim: PersistedCaptureClaim,
  normalizedTargetKey: string,
): string {
  const coordinates = claim.span === null ? 'whole' : `${claim.span.start}-${claim.span.end}`;
  return `capture:${claim.sourceRef.sourceId}:${claim.sourceRef.locator ?? ''}:${coordinates}:${normalizedTargetKey}`;
}
