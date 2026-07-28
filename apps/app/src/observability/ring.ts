/**
 * The local structured log (WP-09; controller §12, REQ-ARCH-07).
 *
 * Controller §12 asks for one thing and forbids another, in the same sentence:
 *
 * > Local structured log (dev console + ring buffer surfaced in a debug
 * > screen): event appends, command latencies, AI route/latency/fallback,
 * > persistence timings. **Never log encounter text, AI payloads, or secrets.**
 *
 * Those two clauses meet at exactly one place — the record type — so the record
 * type is where the argument is settled, and it is settled twice.
 *
 * ## Why an allowlist projection, applied twice, and not a scrubber
 *
 * The obvious implementation is a serializer that deletes fields named `text`,
 * `prompt`, `apiKey`, and so on. That is a denylist, and a denylist is only as
 * good as the imagination of the person who wrote it: the first field called
 * `excerpt`, `body`, `snippet` or `answer` walks straight through it. The
 * failure is silent and the thing that leaks is the learner's own material.
 *
 * So this ring never removes anything. It **rebuilds** every record from a
 * closed, per-channel field list, twice:
 *
 *   1. at `append`, so a record that never had a field cannot acquire one;
 *   2. at `serialize`, so bytes leaving the ring are projected again by the
 *      same table, and a future edit that bypassed `append` would still be
 *      caught on the way out.
 *
 * Unknown fields are dropped, not thrown on: an observability layer that
 * crashes the app it is observing has traded a privacy risk for an
 * availability one. The *count* of dropped fields is kept (`strippedFields`) so
 * the debug screen can say that a projection removed something, and the field
 * **names are deliberately not kept** — a key can be as revealing as a value,
 * and `{"分岐の意味": 1}` is content wearing a key's costume.
 *
 * ## Why the values are scalars from closed sets
 *
 * Allowlisting field *names* is not enough if a listed field can hold anything.
 * Every allowlisted field here is a number, a boolean, an identifier the app
 * minted, or a member of an enum the domain owns (`DomainEventType`,
 * `AppCommandKind`, the AI route classes). None of them can carry a sentence
 * the learner typed. `coerceScalar` is the runtime backstop for a caller that
 * reached this through `any`: a non-scalar in an allowlisted slot is replaced
 * with its type name, never with its contents.
 */

import { DOMAIN_EVENT_TYPES, type DomainEventType } from '@bunki/domain';

import { APP_COMMAND_KINDS, type CommandObservation } from '../state/store.ts';

/** The diagnostic channels controller §12 names. */
export const OBSERVABILITY_CHANNELS = [
  'command',
  'event-append',
  'ai-route',
  'persistence',
] as const;

export type ObservabilityChannel = (typeof OBSERVABILITY_CHANNELS)[number];

/**
 * Every field each channel may carry. The single source of truth for both
 * projections, exported so a test can assert the table rather than the effect.
 *
 * `channel`, `seq` and `at` are added by the ring itself and are listed here so
 * the projection is total — a record is rebuilt from this table and nothing
 * else.
 */
export const ALLOWED_FIELDS: Readonly<Record<ObservabilityChannel, readonly string[]>> =
  Object.freeze({
    command: Object.freeze([
      'channel',
      'seq',
      'at',
      'commandKind',
      'latencyMs',
      'appendedCount',
      'deduplicated',
      'failed',
    ]),
    'event-append': Object.freeze(['channel', 'seq', 'at', 'eventType', 'eventId']),
    /**
     * Mirrors `AiRouteRecord` in `@bunki/ai` (WP-07, B7's coordination request
     * 2). The list is duplicated rather than imported because `@bunki/ai` is
     * not a dependency of this build of the app — see `AI_ROUTE_FIELDS` below
     * for what that costs and how it is reconciled.
     */
    'ai-route': Object.freeze([
      'channel',
      'seq',
      'at',
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
    ]),
    persistence: Object.freeze(['channel', 'seq', 'at', 'operation', 'latencyMs', 'eventCount']),
  });

/**
 * The `@bunki/ai` route-record field list, as data, for the integration check.
 *
 * B7 delivered `AiRouteRecord` on the WP-07 branch with `AiTelemetrySink` as a
 * one-method hand-over. This build does not depend on `@bunki/ai`, so the
 * shape cannot be imported and cannot be type-checked against here. Recording
 * it as data means the reconciliation at WP-10 is a diff of two arrays rather
 * than a reading of two files, and a drift shows up as a failed assertion in
 * `test/observability-ring.test.ts` the moment the packages are joined.
 */
export const AI_ROUTE_FIELDS: readonly string[] = ALLOWED_FIELDS['ai-route'].filter(
  (field) => field !== 'channel' && field !== 'seq' && field !== 'at',
);

/** A projected record. Values are scalars; `null` is a real recorded absence. */
export type ObservabilityRecord = Readonly<Record<string, string | number | boolean | null>> & {
  readonly channel: ObservabilityChannel;
  readonly seq: number;
  readonly at: number;
};

export interface RingEntry {
  readonly record: ObservabilityRecord;
  /** How many fields the projection removed. Names are never kept. */
  readonly strippedFields: number;
}

/**
 * Reduce a value to something a diagnostic buffer may hold.
 *
 * An object, an array, or a function in an allowlisted slot is a bug at the
 * call site, and its contents are exactly what must not be recorded — so the
 * value is replaced by its *type*, which is enough to diagnose the bug and
 * carries nothing. `undefined` becomes `null`: absent is a fact worth keeping,
 * and `undefined` does not survive JSON.
 */
export function coerceScalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return value as string | number | boolean;
  }
  return `<non-scalar:${Array.isArray(value) ? 'array' : type}>`;
}

/**
 * Rebuild a record from the channel's field list.
 *
 * Note the direction: it iterates the **allowlist**, reading from the input,
 * rather than iterating the input and testing each key. That is what makes it a
 * rebuild instead of a filter — an input key that is not in the table is never
 * read at all, so it cannot be copied by a later edit that forgets a guard.
 */
export function projectRecord(
  channel: ObservabilityChannel,
  raw: Readonly<Record<string, unknown>>,
): { readonly record: ObservabilityRecord; readonly strippedFields: number } {
  const allowed = ALLOWED_FIELDS[channel];
  const out: Record<string, string | number | boolean | null> = {};
  for (const field of allowed) {
    if (Object.prototype.hasOwnProperty.call(raw, field)) out[field] = coerceScalar(raw[field]);
  }
  const allowedSet = new Set<string>(allowed);
  const strippedFields = Object.keys(raw).filter((key) => !allowedSet.has(key)).length;
  return { record: { ...out, channel } as ObservabilityRecord, strippedFields };
}

export interface ObservabilityRing {
  readonly capacity: number;
  /** Oldest first. */
  readonly entries: () => readonly RingEntry[];
  /** Total appends since construction, including ones the ring has dropped. */
  readonly appended: () => number;
  readonly clear: () => void;
  readonly append: (channel: ObservabilityChannel, raw: Readonly<Record<string, unknown>>) => void;
  /** Canonical JSON of the buffer, projected again on the way out. */
  readonly serialize: () => string;
  /** The store's observer, ready to hand to `createMemoryAppStore`. */
  readonly commandObserver: { readonly observe: (observation: CommandObservation) => void };
  /**
   * Receives `@bunki/ai`'s route records (B7 coordination request 2).
   * Structurally `AiTelemetrySink`, so wiring it is one assignment.
   */
  readonly record: (entry: Readonly<Record<string, unknown>>) => void;
}

export interface ObservabilityRingOptions {
  readonly capacity?: number | undefined;
  /**
   * Monotonic counter for the `at` stamp, in milliseconds since app start.
   *
   * A relative counter rather than a wall clock, on purpose: an absolute
   * timestamp in a debug buffer that may be screenshotted is one more thing
   * that identifies a session, and every question §12 asks ("which command was
   * slow, and what happened just before it") is answerable from ordering and
   * elapsed time alone.
   */
  readonly elapsedMs?: (() => number) | undefined;
}

/** Three decimal places: microsecond resolution, no float tail. */
export function roundMicroseconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function createObservabilityRing(options: ObservabilityRingOptions = {}): ObservabilityRing {
  const capacity = options.capacity ?? 200;
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('an observability ring needs a positive integer capacity');
  }
  const elapsedMs = options.elapsedMs ?? (() => 0);

  let entries: RingEntry[] = [];
  let seq = 0;

  function append(channel: ObservabilityChannel, raw: Readonly<Record<string, unknown>>): void {
    seq += 1;
    const projected = projectRecord(channel, { ...raw, seq, at: Math.round(elapsedMs()) });
    entries.push({ record: projected.record, strippedFields: projected.strippedFields });
    if (entries.length > capacity) entries = entries.slice(entries.length - capacity);
  }

  return {
    capacity,
    entries: () => entries.slice(),
    appended: () => seq,
    clear: () => {
      entries = [];
    },
    append,
    serialize() {
      // Projected a second time. If a future edit ever appended without going
      // through `append`, the bytes would still leave here allowlisted.
      const projected = entries.map((entry) => projectRecord(entry.record.channel, entry.record));
      return JSON.stringify(
        projected.map((entry) => entry.record),
        stableKeyOrder,
        2,
      );
    },
    commandObserver: {
      observe(observation) {
        append('command', {
          commandKind: observation.commandKind,
          // Rounded to microseconds. `performance.now()` returns a float whose
          // trailing digits are measurement noise, and a diagnostic surface
          // that printed `2.7000000001862645` would be publishing precision it
          // does not have — the §13 budgets it exists to diagnose are stated in
          // whole milliseconds.
          latencyMs: roundMicroseconds(observation.latencyMs),
          // A count, not the list: the list is a closed enum today, and a count
          // is all the "how much did this command write" question needs.
          appendedCount: observation.appendedTypes.length,
          deduplicated: observation.deduplicated,
          failed: observation.failed,
        });
        observation.appendedTypes.forEach((eventType) => {
          append('event-append', { eventType });
        });
      },
    },
    record(entry) {
      append('ai-route', entry);
    },
  };
}

/**
 * `JSON.stringify` replacer giving objects a stable key order.
 *
 * Two serialisations of one buffer have to compare as text for a test to mean
 * anything, and V8's insertion order would otherwise depend on which fields a
 * particular record happened to carry.
 */
function stableKeyOrder(_key: string, value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  const ordered: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) ordered[key] = source[key];
  return ordered;
}

/**
 * The two closed enums a `command` record's identifier fields draw from,
 * exported so the debug screen can render a legend and a test can assert that
 * the ring cannot hold an identifier the domain does not define.
 */
export const CLOSED_ENUMS: {
  readonly commandKind: readonly string[];
  readonly eventType: readonly DomainEventType[];
} = Object.freeze({
  commandKind: APP_COMMAND_KINDS,
  eventType: DOMAIN_EVENT_TYPES,
});

/**
 * What the debug screen states about this buffer, in one place.
 *
 * A claim about privacy that lives in a screen drifts from the code that has
 * to be true for it; this constant sits beside the projection it describes.
 */
export const RING_PRIVACY_NOTE =
  'This buffer holds counts, durations, identifiers and enum members. It is rebuilt from a fixed field list on the way in and again on the way out, so encounter text, AI message content, notes and secrets have no field to occupy. Field names removed by that rebuild are counted, never kept.';
