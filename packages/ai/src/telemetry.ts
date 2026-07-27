/**
 * Route observability for the AI path (WP-07; controller §9, §12, §15,
 * REQ-AI-02's logging list, REQ-ARCH-07).
 *
 * Controller §9 asks for four things to be logged — **route class, latency,
 * token counts, fallback use** — and one thing never to be: message content.
 * Those two requirements pull in opposite directions at exactly one place, the
 * record type, so the record type is where the argument is settled.
 *
 * `AiRouteRecord` is a closed object of scalars: **a closed field set plus
 * bounded values**. It has no field that can hold a prompt, an excerpt, an
 * explanation, an encounter, or an error body, and the error path carries a
 * `FallbackReason` — a member of a fixed enum — rather than a message.
 *
 * Both halves of that sentence are load-bearing, and the second half was added
 * after V6's verification pass falsified the first half on its own. Until then
 * the closed field set was the only control here, and two of its fields —
 * `model` and `provider` — were unbounded strings copied out of a provider's
 * answer. A provider that returned five kilobytes in `model` put five kilobytes
 * into the ring without adding a single field. `assertNoMessageContent` now
 * bounds the values it admits as well as the names, and `envelope.ts` bounds
 * the same two fields on the way in, so an oversized identifier never becomes a
 * live candidate in the first place.
 *
 * `assertNoMessageContent` is the runtime backstop for a caller that built a
 * record through `any`, and `test/telemetry-and-no-live-calls.test.ts` proves
 * the negative directly: it drives a full request cycle with distinctive text
 * on both sides — and a second cycle with a marker stuffed into `model` — and
 * asserts none of it appears anywhere in the serialised ring.
 *
 * What this does *not* claim: that a bounded field is an impossible field. Sixty
 * four characters can hold a short phrase. The honest statement is that every
 * channel out of here is identifier-sized, closed by name, and checked at both
 * the envelope and the sink — not that leakage is unrepresentable.
 *
 * `inputHash` is present and is not content: it is a one-way digest, it is
 * already on `CandidateAttached`, and without it a latency outlier could not be
 * tied to the request that produced it — which is the diagnosis REQ-ARCH-06's
 * budget misses require.
 *
 * ## Coordination note (WP-09, B6)
 *
 * Controller §12 puts the app's observability ring in the debug/inspector
 * surface, which is B6's this wave. This module deliberately stops at a **sink
 * interface plus a standalone ring**: `AiTelemetrySink` is one method, so
 * WP-09's ring can implement it and receive these records without either
 * package importing the other, and no inspector file is touched here.
 */

import { MAX_MODEL_ID_CHARS, MAX_PROVIDER_NAME_CHARS } from './envelope.ts';
import type { FallbackReason } from './errors.ts';

/** How a request ended. `live` means a provider answered and validated. */
export type AiRouteOutcome = 'live' | 'fallback';

/**
 * One completed request, as metadata.
 *
 * Every field is a scalar the operator could read aloud without disclosing
 * anything the learner wrote or the model said.
 */
export interface AiRouteRecord {
  /** REQ-AI-02 route class. Always `T2` in Phase 0. */
  readonly taskClass: 'T2';
  readonly outcome: AiRouteOutcome;
  /** Present only when `outcome` is `fallback`; a closed enum, never a message. */
  readonly fallbackReason: FallbackReason | null;
  readonly provider: string;
  readonly model: string;
  readonly promptFamilyId: string;
  readonly promptVersion: string;
  /** One-way digest of the input (see the module header). */
  readonly inputHash: string;
  /** Wall time from request start to outcome, from the injected clock's counter. */
  readonly latencyMs: number;
  /** The ceiling the request asked for — the budget half of OD-08. */
  readonly maxTokens: number;
  /** Reported by the provider; `null` on every fallback, because none were spent. */
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  /** Did the deterministic target-form check pass (REQ-AI-04)? */
  readonly targetFormPresent: boolean;
  readonly createdAt: string;
}

/** The one method WP-09's ring has to implement to receive these. */
export interface AiTelemetrySink {
  record(entry: AiRouteRecord): void;
}

/** A sink that drops everything. The default, so telemetry is opt-in. */
export const NULL_TELEMETRY_SINK: AiTelemetrySink = {
  record() {
    /* intentionally empty */
  },
};

/**
 * Every field a well-formed record may have, **and what each may hold**.
 *
 * The field-name half was here from the start. The value half was not, and V6's
 * verification pass was right that its absence made the module header's claim
 * false: a closed set of *names* stops a record growing a `prompt` field, and
 * does nothing at all about a `model` field holding five kilobytes of
 * provider-chosen prose. A leak does not need a new field if an old one is
 * unbounded.
 *
 * So each admitted field now declares its type, and each string field declares
 * a ceiling. The two identifier ceilings come from `envelope.ts` so the schema
 * and this backstop cannot drift apart — the envelope is the primary control
 * (an oversized `model` never becomes a live candidate at all), and this is
 * what still holds for a record a caller built through `any` and handed
 * straight to a sink.
 *
 * The remaining ceilings are sized to what this build actually produces, with
 * headroom: `content_not_permitted` is the longest fallback reason at 21
 * characters, `bunki.candidate.bounded-explanation` the longest prompt family
 * id at 35, an ISO instant is 24, and `inputHash` is a 64-character SHA-256
 * digest.
 */
const STRING_FIELD_MAX = new Map<string, number>([
  ['taskClass', 8],
  ['outcome', 16],
  ['fallbackReason', 32],
  ['provider', MAX_PROVIDER_NAME_CHARS],
  ['model', MAX_MODEL_ID_CHARS],
  ['promptFamilyId', 64],
  ['promptVersion', 32],
  ['inputHash', 96],
  ['createdAt', 32],
]);

/** Fields that must be a number, or `null` where the type permits one. */
const NUMBER_FIELDS = new Set<string>(['latencyMs', 'maxTokens', 'inputTokens', 'outputTokens']);
const BOOLEAN_FIELDS = new Set<string>(['targetFormPresent']);
/** Fields whose type admits `null` — the rest may not be null. */
const NULLABLE_FIELDS = new Set<string>(['fallbackReason', 'inputTokens', 'outputTokens']);

export type AiTelemetryViolation =
  /** A field outside the closed set — the record grew somewhere. */
  | 'unknown-field'
  /** An admitted field holding something other than the scalar it declares. */
  | 'wrong-type'
  /** An admitted string field longer than an identifier of its kind can be. */
  | 'oversized-value';

/**
 * A record that is not route metadata.
 *
 * The message names the field, the violation and — for an oversized value — the
 * observed and permitted *lengths*. It never carries the value itself, for the
 * same reason `AiResponseValidationError` carries zod paths and not values: a
 * control that quoted the leak into its own rejection message would move the
 * leak rather than stop it.
 */
export class AiTelemetryContentError extends Error {
  readonly field: string;
  readonly violation: AiTelemetryViolation;

  constructor(field: string, violation: AiTelemetryViolation = 'unknown-field', detail = '') {
    const what =
      violation === 'unknown-field'
        ? `carries the unexpected field ${JSON.stringify(field)}`
        : violation === 'wrong-type'
          ? `holds a non-scalar or wrongly-typed value in ${JSON.stringify(field)}${detail}`
          : `holds an over-long value in ${JSON.stringify(field)}${detail}`;
    super(
      `the route record ${what}; AI telemetry records route metadata only, never message content (controller §12, §15)`,
    );
    this.name = 'AiTelemetryContentError';
    this.field = field;
    this.violation = violation;
  }
}

/**
 * Runtime backstop for the content rule: closed field set **plus** bounded
 * values.
 *
 * @throws AiTelemetryContentError on any field outside the closed set, any
 *   admitted field holding the wrong kind of scalar, and any admitted string
 *   longer than its ceiling.
 */
export function assertNoMessageContent(entry: AiRouteRecord): void {
  const record = entry as unknown as Record<string, unknown>;

  for (const [field, value] of Object.entries(record)) {
    const max = STRING_FIELD_MAX.get(field);

    if (max !== undefined) {
      if (value === null && NULLABLE_FIELDS.has(field)) continue;
      if (typeof value !== 'string') throw new AiTelemetryContentError(field, 'wrong-type');
      if (value.length > max) {
        throw new AiTelemetryContentError(
          field,
          'oversized-value',
          ` (${String(value.length)} characters; the ceiling is ${String(max)})`,
        );
      }
      continue;
    }

    if (NUMBER_FIELDS.has(field)) {
      if (value === null && NULLABLE_FIELDS.has(field)) continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new AiTelemetryContentError(field, 'wrong-type');
      }
      continue;
    }

    if (BOOLEAN_FIELDS.has(field)) {
      if (typeof value !== 'boolean') throw new AiTelemetryContentError(field, 'wrong-type');
      continue;
    }

    throw new AiTelemetryContentError(field);
  }
}

export interface AiRouteRing extends AiTelemetrySink {
  /** Oldest first. */
  readonly entries: () => readonly AiRouteRecord[];
  readonly clear: () => void;
  readonly capacity: number;
}

/**
 * A bounded in-memory ring (controller §12: "dev console + ring buffer").
 *
 * Bounded because an unbounded diagnostic buffer in a long-lived app is a slow
 * memory leak, and because the useful window for diagnosing a latency miss is
 * the recent past.
 *
 * `record` validates on the way in. A sink that accepted a malformed record and
 * only complained when someone read it would place the failure a long way from
 * the code that caused it.
 */
export function createAiRouteRing(capacity = 50): AiRouteRing {
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('an AI route ring needs a positive integer capacity');
  }
  let entries: AiRouteRecord[] = [];

  return {
    capacity,
    record(entry) {
      assertNoMessageContent(entry);
      entries.push(entry);
      if (entries.length > capacity) entries = entries.slice(entries.length - capacity);
    },
    entries: () => entries.slice(),
    clear() {
      entries = [];
    },
  };
}

/** Fan out to several sinks — a dev console and WP-09's ring, for instance. */
export function combineTelemetrySinks(...sinks: readonly AiTelemetrySink[]): AiTelemetrySink {
  return {
    record(entry) {
      for (const sink of sinks) sink.record(entry);
    },
  };
}
