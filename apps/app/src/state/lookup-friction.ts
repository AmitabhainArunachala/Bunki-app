/**
 * Real lookups record real friction (T-07, ADR-002; full-review ledger P1-17).
 *
 * ## The gap this closes
 *
 * `LookupFrictionLogged` existed end to end — schema, evidence-gate refusal
 * (`lookup_is_friction_not_a_grade`), store command, durable indexing — and yet
 * fired from exactly one place: the scripted golden-source route. Every real
 * lookup a learner made on the capture surface recorded nothing, so the
 * friction ledger was structurally empty for every real learner. This module
 * is the app-side builder that lets the capture screen's genuine lookup
 * gestures reach the same domain command (`recordLookupFriction`), and through
 * it the same evidence factory (`mintLookupFrictionLogged`), the golden route
 * already uses.
 *
 * ## What a "real lookup" is on the capture surface
 *
 * The capture screen resolves an answer while the learner types; that ambient
 * resolution is not a gesture and must not mint anything (the same law that
 * keeps route mounts from minting: no event without a user action behind it).
 * The deliberate reach is the press that opens the full dictionary entry — the
 * "Word page" and "Kanji page" doors on the top answer, and the rows under
 * "Other matches". Those are presses, so `userAction: true` is a fact rather
 * than a formality.
 *
 * ## T-07's law, restated where the command is built
 *
 * The command this returns carries no grade, no tier, no contract — the event
 * schema has no field to put one in (ADR-002), the gate refuses it for FSRS by
 * name, and this builder adds nothing beyond the target and the context. A
 * lookup is neither a success nor a failure.
 *
 * ## Identity
 *
 * `lookupId` names one gesture. It is derived from the target plus an ordinal
 * counted off the log, so:
 *
 *   - a double dispatch of the command built from one log state carries the
 *     same id and deduplicates in the store (double-tap safety);
 *   - a later lookup — after the log has grown, after a reload — gets a fresh
 *     id and records a fresh event, because the store must never collapse all
 *     lookups for a target into one lifetime event (see
 *     `RecordLookupFrictionCommand`).
 */

import type { DomainEvent } from '@bunki/domain';

import type { RecordLookupFrictionCommand } from './store.ts';

/** The id prefix every capture-surface lookup carries. */
export const CAPTURE_LOOKUP_ID_PREFIX = 'capture-lookup';

/** The two entry kinds the capture surface can open a page for. */
export interface CaptureLookupTarget {
  readonly targetType: 'lexeme' | 'kanji';
  /** The seed entry's own id — stable across sessions, never display text. */
  readonly targetId: string;
}

/**
 * Build the command for one deliberate lookup from the capture surface.
 *
 * @param log The canonical log as it stands (`store.readAll()`), read for the
 *   ordinal only — this function appends nothing and decides nothing.
 */
export function captureLookupCommand(
  log: readonly DomainEvent[],
  target: CaptureLookupTarget,
): RecordLookupFrictionCommand {
  const ordinal = log.filter((event) => event.type === 'LookupFrictionLogged').length;
  return {
    kind: 'recordLookupFriction',
    userAction: true,
    lookupId: `${CAPTURE_LOOKUP_ID_PREFIX}:${target.targetType}:${target.targetId}:${String(ordinal)}`,
    targetRef: { targetType: target.targetType, targetId: target.targetId },
    context: 'capture',
  };
}
