/**
 * Fail-closed event parsing (WP-02; REQ-DM-04.1, T-04).
 *
 * The order of checks below is the requirement, not an implementation detail:
 *
 *   1. is it an object at all?
 *   2. **is the version one this build implements?**  ← rejects before reading
 *      a single payload field
 *   3. is the type in the v1 catalog?
 *   4. does the payload satisfy that family's schema?
 *
 * Step 2 comes before step 3 because an unknown version means this build does
 * not know what the other fields *mean*, including `type`. A parser that
 * inspected the payload first could report "unknown event type Foo" for a v2
 * event whose v2 semantics it simply cannot see — a misleading diagnosis that
 * invites someone to "add the missing type" instead of writing a migration.
 *
 * Nothing here skips. There is no code path in this file that drops an input
 * and continues; every rejection throws a typed `DomainError`. `safeParseEvent`
 * exists for callers that must handle rejection as data (an importer reporting
 * every bad row rather than dying on the first), and it returns the same typed
 * error inside a discriminated result — ignoring it takes a deliberate act.
 */

import type { z } from 'zod';

import {
  EventValidationError,
  MalformedEventError,
  UnknownEventTypeError,
  UnknownEventVersionError,
  type DomainError,
  type EventValidationIssue,
} from '../errors.ts';
import {
  DOMAIN_EVENT_TYPES,
  EVENT_SCHEMAS,
  isDomainEventType,
  type DomainEvent,
} from './catalog.ts';
import { EVENT_SCHEMA_VERSION, SUPPORTED_EVENT_VERSIONS } from './envelope.ts';

function toIssues(error: z.ZodError): readonly EventValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parse one raw value into a v1 `DomainEvent`, or throw.
 *
 * `index` is threaded through purely so a log-level failure can say *which*
 * entry failed; it does not change behaviour.
 */
export function parseEvent(raw: unknown, index: number | null = null): DomainEvent {
  if (!isRecord(raw)) {
    throw new MalformedEventError(
      `Expected an event object, received ${raw === null ? 'null' : Array.isArray(raw) ? 'an array' : typeof raw}.`,
      index,
    );
  }

  // (2) Version first — see the file header.
  const version: unknown = raw['v'];
  if (version !== EVENT_SCHEMA_VERSION) {
    throw new UnknownEventVersionError(version, SUPPORTED_EVENT_VERSIONS, index);
  }

  // (3) Then the discriminator.
  const type: unknown = raw['type'];
  if (!isDomainEventType(type)) {
    throw new UnknownEventTypeError(type, DOMAIN_EVENT_TYPES, index);
  }

  // (4) Then the family's own schema, strictly.
  const result = EVENT_SCHEMAS[type].safeParse(raw);
  if (!result.success) {
    throw new EventValidationError(type, toIssues(result.error), index);
  }

  return result.data as DomainEvent;
}

/**
 * Parse a whole log, in order.
 *
 * Throws on the first rejected entry, with its index. It does not collect and
 * continue: a partially parsed log is a log whose derived state depends on
 * which entries this build happened to understand, which is the exact failure
 * REQ-DM-04 forbids.
 */
export function parseEventLog(
  raw: unknown,
  options: { path?: string } = {},
): readonly DomainEvent[] {
  if (!Array.isArray(raw)) {
    throw new MalformedEventError(
      `Expected an array of events${options.path === undefined ? '' : ` in ${options.path}`}, received ${
        raw === null ? 'null' : typeof raw
      }.`,
    );
  }
  return raw.map((entry, index) => parseEvent(entry, index));
}

export type ParseEventResult =
  | { readonly ok: true; readonly event: DomainEvent }
  | { readonly ok: false; readonly error: DomainError };

/**
 * Non-throwing variant for callers that must report rather than abort.
 *
 * The failure branch carries the same typed error as `parseEvent` throws — a
 * caller that drops it has discarded a named, coded rejection on purpose. That
 * is a reviewable act; a parser that returned `null` would not be.
 */
export function safeParseEvent(raw: unknown, index: number | null = null): ParseEventResult {
  try {
    return { ok: true, event: parseEvent(raw, index) };
  } catch (error) {
    if (
      error instanceof MalformedEventError ||
      error instanceof UnknownEventVersionError ||
      error instanceof UnknownEventTypeError ||
      error instanceof EventValidationError
    ) {
      return { ok: false, error };
    }
    throw error;
  }
}

/** Type guard form, for boundaries that only need a yes/no. */
export function isDomainEvent(value: unknown): value is DomainEvent {
  return safeParseEvent(value).ok;
}
