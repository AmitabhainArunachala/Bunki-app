/**
 * Stream indexing (WP-03; controller §7 `readStream(threadId|contractId)`).
 *
 * `readStream` must answer from an index, never from a scan of payload text — a
 * text scan would match a thread id that merely appeared inside somebody's
 * encounter, and an evidence chain that contains a coincidence is not an
 * evidence chain.
 *
 * Four families name their thread outright. Two do not, and dropping them from
 * the thread's stream would leave the inspector (REQ-UI-06) showing a chain with
 * holes exactly where deletion and AI acceptance happened — the two places a
 * reader most needs to see:
 *
 *   - `CandidateAcceptedAsNote` names only a `candidateId`; its thread is the
 *     one the matching `CandidateAttached` named.
 *   - `ContentPurged` names only `targetIds` and a `tombstoneEventId`; its
 *     thread is the one the cited `ThreadTombstoned` named.
 *
 * Both are resolved here, from the log, at append time — the same resolution
 * `@bunki/domain`'s replay performs when it folds those events. An event whose
 * reference cannot be resolved gets a `null` index rather than a guess; replay
 * rejects that log anyway (`replay.accept-attached-candidate`,
 * `replay.purge-cites-known-tombstone`), and the adapters run replay over the
 * candidate log before committing, so an unresolvable reference never reaches
 * storage.
 *
 * **One implementation, both adapters.** The SQLite adapter writes these values
 * into indexed columns; the provisional web adapter keeps them beside the event
 * in memory. Sharing the function is what makes "both adapters return the same
 * stream" a property of the code rather than a coincidence the contract suite
 * has to keep checking — which it does anyway.
 */

import type { DomainEvent } from '@bunki/domain';

export interface EventIndex {
  readonly threadId: string | null;
  readonly contractId: string | null;
  readonly encounterId: string | null;
}

const EMPTY_INDEX: EventIndex = Object.freeze({
  threadId: null,
  contractId: null,
  encounterId: null,
});

/**
 * Compute the index row for every event in a log, in log order.
 *
 * Takes the whole log rather than one event because two families are only
 * resolvable in context. Linear in the log: one pass builds the
 * candidate→thread and tombstone→thread maps, the same pass reads them, because
 * both references must point at something *earlier* in the log for replay to
 * accept the log at all.
 */
export function computeEventIndexes(log: readonly DomainEvent[]): readonly EventIndex[] {
  const threadIdForCandidate = new Map<string, string>();
  const threadIdForTombstone = new Map<string, string>();

  return log.map((event): EventIndex => {
    switch (event.type) {
      case 'EncounterCaptured':
        return { threadId: event.threadId, contractId: null, encounterId: event.encounterId };

      case 'ThreadPromotionChanged':
        return { threadId: event.threadId, contractId: null, encounterId: null };

      case 'CandidateAttached':
        threadIdForCandidate.set(event.candidateId, event.threadId);
        return { threadId: event.threadId, contractId: null, encounterId: null };

      case 'CandidateAcceptedAsNote':
        return {
          threadId: threadIdForCandidate.get(event.candidateId) ?? null,
          contractId: null,
          encounterId: null,
        };

      case 'ThreadTombstoned':
        threadIdForTombstone.set(event.eventId, event.threadId);
        return { threadId: event.threadId, contractId: null, encounterId: null };

      case 'ContentPurged':
        return {
          threadId: threadIdForTombstone.get(event.tombstoneEventId) ?? null,
          contractId: null,
          encounterId: null,
        };

      case 'ContractCreated':
        return { threadId: null, contractId: event.contractId, encounterId: null };

      case 'ReviewGraded':
        return { threadId: null, contractId: event.contractId, encounterId: null };

      case 'ProductionObserved':
        return { threadId: null, contractId: event.contractId ?? null, encounterId: null };

      // Families that belong to neither stream. Listed rather than defaulted so
      // that adding a family without deciding where it indexes is a compile
      // error, not a silently unindexed event.
      case 'ExposureLogged':
      case 'LookupFrictionLogged':
      case 'EvidenceSuperseded':
      case 'SessionStarted':
      case 'SessionClosed':
      case 'DataExported':
        return EMPTY_INDEX;

      default: {
        const unreachable: never = event;
        return unreachable;
      }
    }
  });
}
