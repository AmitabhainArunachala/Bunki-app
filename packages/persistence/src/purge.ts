/**
 * Tombstone-then-purge deletion (WP-03; controller §7, ADR-002, P0-CAP-14).
 *
 * ADR-002 splits deletion into two events on purpose:
 *
 *   `ThreadTombstoned`  a sync-safe marker that survives forever;
 *   `ContentPurged`     the record that the physical purge ran.
 *
 * The events are the audit trail. **This module is the purge itself** — the part
 * that removes the learner's content bytes from the store. Without it,
 * `ContentPurged` would be a claim about something that never happened, which is
 * strictly worse than not offering deletion at all.
 *
 * ## What is removed, and what deliberately is not
 *
 * Removed, because it is the learner's content:
 *
 *   - `text` — replaced by a fixed placeholder. Replaced rather than deleted
 *     because the field is required by the v1 schema (`nonEmptyString`), and a
 *     log that no longer parses is a log that no longer replays. The placeholder
 *     is a constant, so no purged record can be distinguished from another by
 *     the shape of what is left.
 *   - `span` — dropped. A span is a pointer into text that no longer exists; a
 *     stale one would also violate the schema's `span.end <= text.length` rule.
 *   - `sourceRef.locator` — dropped. A URL, timecode, or file reference is a
 *     deep link back into the learner's own material, and keeping it would let
 *     the purged content be found again from the record that claims it was
 *     purged.
 *
 * Kept, because it is the audit trail and not the content:
 *
 *   - every id, timestamp, and idempotency key;
 *   - `provenance` in full — source, licence, attribution, modification and
 *     review status. Licence obligations attach to the fact that material was
 *     used, and they outlive the material (REQ-SRC-01, T-15). Purging the
 *     attribution would destroy the evidence of an obligation while leaving the
 *     obligation.
 *   - `sourceRef.sourceId` and `kind` — which source, not which passage.
 *
 * The result: derived state after a purge is identical to derived state before
 * it (`text` and `span` appear nowhere in `DerivedState`), so the purge cannot
 * silently change history — it only empties it of content.
 */

import type { ContentPurgedEvent, DomainEvent, EncounterCapturedEvent } from '@bunki/domain';

import { PurgeWithoutTombstoneError } from './errors.ts';

/**
 * What replaces purged text. A constant: two purged encounters must be
 * indistinguishable, or the residue leaks the length or shape of what was there.
 */
export const PURGED_TEXT_PLACEHOLDER = '[purged]';

/**
 * The events a purge can empty.
 *
 * Only `EncounterCaptured` carries free-form learner content in the v1 catalog.
 * Candidate payloads are deliberately not in the log at all (ADR-002 keeps
 * generated prose out of it), grades and exposures carry ids and numbers, and
 * the deletion events themselves carry only references. If a future schema
 * version adds a content-bearing family, it must be added here in the same
 * change — `test/deletion.test.ts` asserts this list covers every field of type
 * free text in the catalog.
 */
export const PURGEABLE_EVENT_TYPES = ['EncounterCaptured'] as const;

/** Does this event belong to something the purge names? */
export function isPurgeTarget(event: DomainEvent, targetIds: ReadonlySet<string>): boolean {
  if (event.type !== 'EncounterCaptured') return false;
  return targetIds.has(event.threadId) || targetIds.has(event.encounterId);
}

/**
 * Return the encounter with its content bytes gone.
 *
 * Pure: it returns a new event and never mutates the input, so a caller holding
 * the pre-purge value (a test asserting the content really was there) still
 * holds it.
 */
export function redactEncounter(event: EncounterCapturedEvent): EncounterCapturedEvent {
  const { locator: _dropped, ...sourceRefWithoutLocator } = event.sourceRef;
  const { span: _droppedSpan, ...withoutSpan } = event;

  return {
    ...withoutSpan,
    text: PURGED_TEXT_PLACEHOLDER,
    sourceRef: sourceRefWithoutLocator,
  };
}

/**
 * Refuse to destroy bytes unless the log authorises it.
 *
 * `@bunki/domain`'s replay already rejects a purge that cites an unknown
 * tombstone (`replay.purge-cites-known-tombstone`) or a thread that was never
 * tombstoned (`thread.tombstone-before-purge`), and the adapters replay the
 * candidate log before committing — so in the ordinary path this check never
 * fires.
 *
 * It exists anyway, and it is not redundant, because the two checks guard
 * different things. Replay guards *derived state*: if it were relaxed one day,
 * the cost would be a wrong projection, and a projection is recomputable. This
 * one guards an *irreversible physical deletion*. Those deserve two independent
 * reasons to happen, held by two different components, and the cheap one belongs
 * next to the destruction.
 */
export function assertPurgeAuthorised(
  log: readonly DomainEvent[],
  purgeEvent: ContentPurgedEvent,
): void {
  const tombstone = log.find((event) => event.eventId === purgeEvent.tombstoneEventId);

  if (tombstone === undefined) {
    throw new PurgeWithoutTombstoneError(
      purgeEvent.eventId,
      purgeEvent.tombstoneEventId,
      'no event with that id is in this store',
    );
  }
  if (tombstone.type !== 'ThreadTombstoned') {
    throw new PurgeWithoutTombstoneError(
      purgeEvent.eventId,
      purgeEvent.tombstoneEventId,
      `that event is a ${tombstone.type}, not a ThreadTombstoned`,
    );
  }
  if (!purgeEvent.targetIds.includes(tombstone.threadId)) {
    throw new PurgeWithoutTombstoneError(
      purgeEvent.eventId,
      purgeEvent.tombstoneEventId,
      `the cited tombstone covers thread ${tombstone.threadId}, which is not among the purge targets (${purgeEvent.targetIds.join(', ')}). A purge may only empty what its tombstone marked`,
    );
  }
}

export interface PurgePlanEntry {
  readonly eventId: string;
  readonly redacted: EncounterCapturedEvent;
}

/**
 * Work out which stored events a `ContentPurged` empties, and what they become.
 *
 * Returned as a plan rather than executed here so the caller can apply it inside
 * the same transaction that writes the `ContentPurged` event. A purge committed
 * without its record, or a record committed without its purge, would each be a
 * lie in a different direction.
 */
export function planPurge(
  log: readonly DomainEvent[],
  purgeEvent: ContentPurgedEvent,
): readonly PurgePlanEntry[] {
  const targetIds = new Set<string>(purgeEvent.targetIds);
  const plan: PurgePlanEntry[] = [];

  log.forEach((event) => {
    if (!isPurgeTarget(event, targetIds)) return;
    const encounter = event as EncounterCapturedEvent;
    if (encounter.text === PURGED_TEXT_PLACEHOLDER && encounter.span === undefined) {
      // Already emptied by an earlier purge. Re-writing identical bytes would be
      // harmless, but reporting it as purged work would overstate what happened.
      return;
    }
    plan.push({ eventId: encounter.eventId, redacted: redactEncounter(encounter) });
  });

  return plan;
}
