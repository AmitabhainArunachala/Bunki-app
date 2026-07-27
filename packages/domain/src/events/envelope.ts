/**
 * The event envelope every §6.1 family carries (WP-02, ADR-002).
 *
 * Four fields, and each one is load-bearing:
 *
 *   `eventId`        stable identity, so supersession and export can refer to
 *                    an observation without repeating it;
 *   `v`              schema version — unknown values fail closed (T-04);
 *   `occurredAt`     canonical UTC instant from the injected clock, never an
 *                    ambient one (REQ-DM-04.4);
 *   `idempotencyKey` what makes a double-tapped capture produce exactly one
 *                    thread; re-appending the same key is a no-op (§7).
 *
 * `type` is added by each family in the catalog rather than declared here, so
 * that the discriminated union has a literal to switch on.
 */

import { z } from 'zod';

import { isoInstantSchema, nonEmptyString } from './shared.ts';

/** The only schema version this build implements. */
export const EVENT_SCHEMA_VERSION = 1;

/**
 * Versions this build accepts. A one-element list today; the shape is a list so
 * that the day a v2 exists, accepting both is a data change in one place rather
 * than a rewrite of the parser's control flow.
 */
export const SUPPORTED_EVENT_VERSIONS: readonly number[] = [EVENT_SCHEMA_VERSION];

export const eventEnvelopeSchema = z.strictObject({
  eventId: nonEmptyString,
  v: z.literal(EVENT_SCHEMA_VERSION),
  occurredAt: isoInstantSchema,
  idempotencyKey: nonEmptyString,
});

export type EventEnvelope = z.infer<typeof eventEnvelopeSchema>;

/** The envelope keys, as data — used to derive factory payload types. */
export const ENVELOPE_KEYS = ['eventId', 'v', 'occurredAt', 'idempotencyKey'] as const;
