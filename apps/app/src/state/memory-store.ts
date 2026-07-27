/**
 * In-memory `AppStore` (WP-05).
 *
 * The Phase-0 implementation of the seam described in `./store.ts`. It keeps an
 * append-only event log and a projection built by `@bunki/domain`'s reducers —
 * the same shape `@bunki/persistence` will have — so replacing it in W4 is a
 * constructor swap and not a rewrite of the screens.
 *
 * Three properties are worth reading closely, because they are the ones a
 * verifier should try to break:
 *
 * **Every event comes from the kernel's factory.** Nothing here constructs an
 * event object literal. `createDomainEvent` validates on the way out and
 * refuses evidence-class families outright (REQ-ARCH-04), so this file
 * *cannot* mint a `ReviewGraded` even by mistake — which is the point of
 * routing appends through the command handler rather than letting the UI reach
 * a store (controller §5).
 *
 * **Derived state is reduced, never computed.** `threadReducer` and
 * `initialThreadState` produce every thread fact a screen reads. No promotion
 * rule, no scheduling, no grading lives here.
 *
 * **Repeats are no-ops, not duplicates.** A command's `idempotencyKey` is
 * derived from its content; applying the same key twice returns the first
 * acknowledgment and appends nothing. A double-tapped Keep therefore produces
 * exactly one thread — the controller §17.2 property, held at the seam where
 * the double tap actually arrives.
 */

import {
  createDomainEvent,
  initialThreadState,
  threadReducer,
  type DomainContext,
  type DomainEvent,
  type EncounterCapturedEvent,
  type ThreadPromotionChangedEvent,
  type ThreadState,
} from '@bunki/domain';

import {
  DURABILITY_NOTES,
  type AppCommand,
  type AppSnapshot,
  type AppStore,
  type CommandAck,
  type DurabilityLevel,
  type ThreadView,
  type UncertaintyAnnotation,
} from './store.ts';

/**
 * The key two captures must share to count as the same target.
 *
 * NFKC folds full-width and compatibility forms, so a headword pasted from a
 * width-normalising source lands on the thread the learner already has. Case
 * folding is included for the Latin text a source reference can carry; it does
 * nothing to Japanese.
 */
export function targetKeyOf(text: string): string {
  return text.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

function captureIdempotencyKey(command: Extract<AppCommand, { kind: 'capture' }>): string {
  const { sourceId, locator } = command.sourceRef;
  return `capture:${sourceId}:${locator ?? ''}:${targetKeyOf(command.text)}`;
}

/**
 * Promotion is keyed by the transition, not by a counter.
 *
 * The Phase-0 screens offer one step at a time from the thread's current state,
 * so `(thread, from, to)` identifies the tap uniquely and a double tap collapses
 * to one event. A UI that later offers the same transition twice in one thread's
 * life (promote → demote → promote) must carry an ordinal in this key; that is a
 * WP-08 concern and is recorded rather than pre-built.
 */
function promoteIdempotencyKey(threadId: string, from: string, to: string): string {
  return `promote:${threadId}:${from}->${to}`;
}

interface StoredThread {
  readonly state: ThreadState;
  readonly displayText: string;
  readonly targetKey: string;
  readonly lexemeId: string | null;
  readonly uncertainty: UncertaintyAnnotation | null;
  readonly capturedAt: string;
}

const toView = (thread: StoredThread): ThreadView => ({
  state: thread.state,
  displayText: thread.displayText,
  targetKey: thread.targetKey,
  lexemeId: thread.lexemeId,
  uncertainty: thread.uncertainty,
  capturedAt: thread.capturedAt,
});

export interface MemoryAppStoreOptions {
  readonly context: DomainContext;
  /**
   * Overstate nothing: the default is the truth about this implementation. The
   * parameter exists so a future device-local store can reuse the projection
   * without the label lying about it.
   */
  readonly durability?: DurabilityLevel | undefined;
}

export function createMemoryAppStore({
  context,
  durability = 'in-memory-session-only',
}: MemoryAppStoreOptions): AppStore {
  const events: DomainEvent[] = [];
  const threads = new Map<string, StoredThread>();
  /** Insertion order, newest first, for the snapshot's thread list. */
  const threadOrder: string[] = [];
  const appliedKeys = new Map<string, CommandAck>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let snapshot: AppSnapshot = { revision: 0, threads: [], threadsById: {}, eventCount: 0 };

  function rebuildSnapshot(): void {
    revision += 1;
    const views = threadOrder
      .map((id) => threads.get(id))
      .filter((thread): thread is StoredThread => thread !== undefined)
      .map(toView);
    const byId: Record<string, ThreadView> = {};
    for (const view of views) byId[view.state.threadId] = view;
    snapshot = {
      revision,
      threads: views,
      threadsById: byId,
      eventCount: events.length,
    };
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function findThreadByTarget(targetKey: string): StoredThread | undefined {
    for (const id of threadOrder) {
      const thread = threads.get(id);
      if (thread !== undefined && thread.targetKey === targetKey) return thread;
    }
    return undefined;
  }

  function applyCapture(command: Extract<AppCommand, { kind: 'capture' }>): CommandAck {
    const idempotencyKey = captureIdempotencyKey(command);
    const previous = appliedKeys.get(idempotencyKey);
    if (previous !== undefined) return { ...previous, events: [], deduplicated: true };

    const targetKey = targetKeyOf(command.text);
    const existing = findThreadByTarget(targetKey);
    // "threadId (new or existing)" — §6.1. An encounter of text the learner has
    // met before continues that thread instead of forking a second one.
    const threadId = existing?.state.threadId ?? context.ids.nextId('thread');

    const event: EncounterCapturedEvent = createDomainEvent(
      context,
      'EncounterCaptured',
      {
        encounterId: context.ids.nextId('encounter'),
        threadId,
        text: command.text,
        sourceRef: command.sourceRef,
        provenance: command.provenance,
        // `true | absent` is the whole vocabulary the v1 schema has. The
        // dimension the learner chose is kept beside the log — see
        // `UncertaintyAnnotation`.
        ...(command.uncertainty === null ? {} : { uncertaintyMark: true as const }),
      },
      { idempotencyKey },
    );

    events.push(event);

    const uncertainty: UncertaintyAnnotation | null =
      command.uncertainty === null
        ? (existing?.uncertainty ?? null)
        : { dimension: command.uncertainty, editedAt: event.occurredAt, markedAtCapture: true };

    if (existing === undefined) {
      threads.set(threadId, {
        state: initialThreadState(event),
        displayText: command.text.trim(),
        targetKey,
        lexemeId: command.lexemeId ?? null,
        uncertainty,
        capturedAt: event.occurredAt,
      });
      threadOrder.unshift(threadId);
    } else {
      threads.set(threadId, {
        ...existing,
        state: threadReducer(existing.state, event),
        lexemeId: existing.lexemeId ?? command.lexemeId ?? null,
        uncertainty,
      });
    }

    const ack: CommandAck = {
      threadId,
      acknowledgedAt: event.occurredAt,
      events: [event],
      deduplicated: false,
      durability,
    };
    appliedKeys.set(idempotencyKey, ack);
    return ack;
  }

  function applyPromote(command: Extract<AppCommand, { kind: 'promote' }>): CommandAck {
    const thread = threads.get(command.threadId);
    if (thread === undefined) {
      throw new Error(`cannot promote unknown thread ${command.threadId}`);
    }

    const from = thread.state.promotion;

    // Already there. A second tap on the button that put it there is the same
    // gesture arriving twice, not a request for a no-change event — and the
    // kernel rejects `from === to` outright (REQ-DM-09), so the alternative is
    // a thrown error where the user sees a harmless double tap.
    if (from === command.to) {
      const earlier = appliedKeys.get(promoteIdempotencyKey(command.threadId, from, command.to));
      return {
        threadId: command.threadId,
        acknowledgedAt: earlier?.acknowledgedAt ?? context.clock.now(),
        events: [],
        deduplicated: true,
        durability,
      };
    }

    const idempotencyKey = promoteIdempotencyKey(command.threadId, from, command.to);
    const previous = appliedKeys.get(idempotencyKey);
    if (previous !== undefined) return { ...previous, events: [], deduplicated: true };

    const event: ThreadPromotionChangedEvent = createDomainEvent(
      context,
      'ThreadPromotionChanged',
      { threadId: command.threadId, from, to: command.to, origin: 'user' },
      { idempotencyKey },
    );

    events.push(event);
    threads.set(command.threadId, { ...thread, state: threadReducer(thread.state, event) });

    const ack: CommandAck = {
      threadId: command.threadId,
      acknowledgedAt: event.occurredAt,
      events: [event],
      deduplicated: false,
      durability,
    };
    appliedKeys.set(idempotencyKey, ack);
    return ack;
  }

  /**
   * Edit the app-local uncertainty annotation.
   *
   * Emits **no event**, by design: the v1 schema has no family for amending a
   * mark after capture, and inventing one in the app would be a schema change
   * made in the wrong package. The acknowledgment therefore reports an empty
   * event list, which is the honest answer to "what did this write to the log".
   */
  function applyMarkUncertainty(
    command: Extract<AppCommand, { kind: 'markUncertainty' }>,
  ): CommandAck {
    const thread = threads.get(command.threadId);
    if (thread === undefined) {
      throw new Error(`cannot mark unknown thread ${command.threadId}`);
    }

    const acknowledgedAt = context.clock.now();
    threads.set(command.threadId, {
      ...thread,
      uncertainty:
        command.dimension === null
          ? null
          : {
              dimension: command.dimension,
              editedAt: acknowledgedAt,
              markedAtCapture: thread.uncertainty?.markedAtCapture ?? false,
            },
    });

    return {
      threadId: command.threadId,
      acknowledgedAt,
      events: [],
      deduplicated: false,
      durability,
    };
  }

  return {
    durability,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    execute(command) {
      const ack =
        command.kind === 'capture'
          ? applyCapture(command)
          : command.kind === 'promote'
            ? applyPromote(command)
            : applyMarkUncertainty(command);
      rebuildSnapshot();
      notify();
      return ack;
    },
    readAll: () => events.slice(),
  };
}

/** The durability sentence the UI renders for a store. */
export const durabilityNoteFor = (level: DurabilityLevel): string => DURABILITY_NOTES[level];
