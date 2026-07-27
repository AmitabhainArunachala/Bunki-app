/**
 * Route observability for the AI path (WP-07; controller §9, §12, §15,
 * REQ-AI-02's logging list, REQ-ARCH-07).
 *
 * Controller §9 asks for four things to be logged — **route class, latency,
 * token counts, fallback use** — and one thing never to be: message content.
 * Those two requirements pull in opposite directions at exactly one place, the
 * record type, so the record type is where the argument is settled.
 *
 * `AiRouteRecord` is a closed object of scalars. It has no field that can hold a
 * prompt, an excerpt, an explanation, an encounter, or an error body, and the
 * error path carries a `FallbackReason` — a member of a fixed enum — rather
 * than a message. `assertNoMessageContent` is the runtime backstop for a caller
 * that built a record through `any`, and
 * `test/telemetry-and-no-live-calls.test.ts` proves the negative directly: it
 * drives a full request cycle with distinctive text on both sides and asserts
 * none of it appears anywhere in the serialised ring.
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

/** Every field a well-formed record may have. Anything else is content. */
const ALLOWED_FIELDS = new Set<string>([
  'taskClass',
  'outcome',
  'fallbackReason',
  'provider',
  'model',
  'promptFamilyId',
  'promptVersion',
  'inputHash',
  'latencyMs',
  'maxTokens',
  'inputTokens',
  'outputTokens',
  'targetFormPresent',
  'createdAt',
]);

export class AiTelemetryContentError extends Error {
  constructor(field: string) {
    super(
      `the route record carries the unexpected field ${JSON.stringify(field)}; AI telemetry records route metadata only, never message content (controller §12, §15)`,
    );
    this.name = 'AiTelemetryContentError';
  }
}

/**
 * Runtime backstop for the content rule.
 *
 * @throws AiTelemetryContentError on any field outside the closed set.
 */
export function assertNoMessageContent(entry: AiRouteRecord): void {
  for (const field of Object.keys(entry)) {
    if (!ALLOWED_FIELDS.has(field)) throw new AiTelemetryContentError(field);
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
