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
  componentIdOfEncounter,
  createDomainEvent,
  initialThreadState,
  isEvidenceClassEvent,
  mintEvidenceSuperseded,
  mintExposureLogged,
  mintReviewGraded,
  replay,
  threadReducer,
  type ContractCreatedEvent,
  type DataExportedEvent,
  type DerivedState,
  type DomainContext,
  type DomainEvent,
  type DomainEventType,
  type EncounterCapturedEvent,
  type ThreadPromotionChangedEvent,
  type ThreadState,
} from '@bunki/domain';

import {
  CorrectionRefusedError,
  DURABILITY_NOTES,
  NULL_COMMAND_OBSERVER,
  type AppCommand,
  type AppCommandKind,
  type AppSnapshot,
  type AppStore,
  type CommandAck,
  type CommandObserver,
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

/**
 * The prompt family version stamped on the demonstration contract (WP-09).
 *
 * REQ-UI-06 asks the inspector to show "rubric/model version" wherever one
 * exists, so the demonstration must carry a real one rather than leave the
 * column blank and let the screen imply versions are never recorded. It names
 * itself a demonstration, so a reader of an export cannot mistake it for a
 * prompt family that was actually authored and reviewed.
 */
export const DEMONSTRATION_PROMPT_FAMILY_VERSION = 'demo-recognition@1';

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
  /**
   * Receives one closed record per applied command (WP-09, controller §12).
   * Defaults to observing nothing — a store must not acquire a logger by being
   * constructed.
   */
  readonly observer?: CommandObserver | undefined;
  /**
   * Monotonic counter used for the latency figure, in milliseconds.
   *
   * Injected rather than read here for the same reason the clock is: a store
   * that reached for `performance.now()` could not be tested for the ordering
   * property that makes the number worth recording. It is deliberately *not*
   * `context.clock` — a wall clock can go backwards, and a duration measured
   * across an adjustment would be a fabricated number in a diagnostic surface.
   */
  readonly elapsedMs?: (() => number) | undefined;
}

export function createMemoryAppStore({
  context,
  durability = 'in-memory-session-only',
  observer = NULL_COMMAND_OBSERVER,
  elapsedMs = () => 0,
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

  /**
   * Append the demonstration evidence chain (WP-09).
   *
   * Every event is minted by the kernel, and each is there to make a different
   * branch of the inspector non-empty — the point is a chain that exercises
   * *all four* gate outcomes, because a ledger that only ever showed admitted
   * rows could not answer "why did that one not count" (REQ-UI-06):
   *
   *   1. `ThreadPromotionChanged` to `learn` — without it the contract is not
   *      activated and every observation is refused for the same reason, which
   *      would demonstrate one branch of the gate and hide the rest.
   *   2. `ContractCreated` — the versioned prompt family and the closed answer
   *      set the inspector shows under "what was asked". `responseModality` is
   *      `choice` so the contract is *scorable*; a `free` response scored
   *      against a closed list is refused by REQ-DM-05's coherence rule.
   *   3. `ReviewGraded` (`good`, nothing revealed) — **admitted**, the tier-A
   *      case that changes review timing.
   *   4. `ReviewGraded` (`easy`, revealed first) — **admitted as `again`**.
   *      The reveal rule rewrites the grade inside the mint (T-06), so the
   *      inspector shows a verdict whose grade is not the one submitted. This
   *      is the row that makes the override visible instead of theoretical.
   *   5. `ReviewGraded` (`easy`, unconfirmed) — **refused**,
   *      `easy_requires_user_confirmation`. Recorded, and not counted.
   *   6. `ExposureLogged` — tier D, **refused**, never admitted (T-08).
   *
   * The tiers are stamped by `src/evidence/`, never passed in: this file
   * cannot label a passage sighting as a review even by mistake.
   */
  function applySeedEvidenceDemonstration(
    command: Extract<AppCommand, { kind: 'seedEvidenceDemonstration' }>,
  ): CommandAck {
    const idempotencyKey = `demo:${command.threadId}`;
    const previous = appliedKeys.get(idempotencyKey);
    if (previous !== undefined) return { ...previous, events: [], deduplicated: true };

    const thread = threads.get(command.threadId);
    if (thread === undefined) {
      throw new Error(`cannot add a demonstration chain to unknown thread ${command.threadId}`);
    }

    const capture = events.find(
      (event): event is EncounterCapturedEvent =>
        event.type === 'EncounterCaptured' && event.threadId === command.threadId,
    );
    if (capture === undefined) {
      throw new Error(`thread ${command.threadId} has no capture to derive a component id from`);
    }

    const appended: DomainEvent[] = [];
    let state = thread.state;

    // 1. Reach a promotion rung that activates recognition contracts. Stepping
    // through the ladder rather than jumping keeps every transition in the log,
    // which is what the inspector's "cause event" column reads.
    //
    // A thread already at `learn` or `master` is left alone: `indexOf` on the
    // ladder returns -1 for `master`, and letting that fall through to
    // `slice(0)` would re-promote from `captured` and produce transitions the
    // kernel rejects. The remaining rungs are computed explicitly instead.
    const LADDER = ['captured', 'keep', 'learn'] as const;
    const startIndex = LADDER.indexOf(state.promotion as (typeof LADDER)[number]);
    const remaining = startIndex === -1 ? [] : LADDER.slice(startIndex + 1);

    let from = state.promotion;
    for (const to of remaining) {
      const promotion: ThreadPromotionChangedEvent = createDomainEvent(
        context,
        'ThreadPromotionChanged',
        { threadId: command.threadId, from, to, origin: 'user' },
        { idempotencyKey: promoteIdempotencyKey(command.threadId, from, to) },
      );
      events.push(promotion);
      appended.push(promotion);
      state = threadReducer(state, promotion);
      appliedKeys.set(promoteIdempotencyKey(command.threadId, from, to), {
        threadId: command.threadId,
        acknowledgedAt: promotion.occurredAt,
        events: [promotion],
        deduplicated: false,
        durability,
      });
      from = to;
    }

    // 2. The contract. `targetComponentId` is derived by the kernel's own
    // projection from the capture event, so the app cannot mint a contract the
    // gate would fail to link (REQ-DM-05, component-identity.ts).
    const contractId = context.ids.nextId('contract');
    const contract: ContractCreatedEvent = createDomainEvent(
      context,
      'ContractCreated',
      {
        contractId,
        contractVersion: 1,
        targetComponentId: componentIdOfEncounter(capture),
        skill: command.skill,
        cueModality: 'text',
        // `choice`, not `free`. REQ-DM-05's coherence rule refuses a free
        // response scored against a closed answer list — a correct paraphrase
        // would be graded wrong and the resulting `again` would be an artefact
        // of the contract rather than of the learner's memory. A demonstration
        // that shipped an invalid contract would have shown only the gate's
        // `contract_invalid` branch, which is not what REQ-UI-06 asks for.
        responseModality: 'choice',
        acceptedAnswers: [...command.acceptedAnswers],
        hintPolicy: { hintsAllowed: true, maxHints: 1 },
        revealPolicy: { revealAllowed: true, revealIsRecorded: true },
        promptFamilyVersion: DEMONSTRATION_PROMPT_FAMILY_VERSION,
      },
      { idempotencyKey: `contract:${contractId}` },
    );
    events.push(contract);
    appended.push(contract);

    // 3-5. The observations. Every one goes through `src/evidence/`.
    const graded = mintReviewGraded(
      context,
      {
        contractId,
        grade: 'good',
        latencyMs: 3400,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'standalone',
      },
      { idempotencyKey: `review:${contractId}:1` },
    );
    events.push(graded);
    appended.push(graded);

    const revealed = mintReviewGraded(
      context,
      {
        contractId,
        grade: 'easy',
        latencyMs: 900,
        hintsUsed: 1,
        revealedBeforeRecall: true,
        probeContext: 'standalone',
      },
      { idempotencyKey: `review:${contractId}:2` },
    );
    events.push(revealed);
    appended.push(revealed);

    const unconfirmed = mintReviewGraded(
      context,
      {
        contractId,
        grade: 'easy',
        latencyMs: 1200,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'standalone',
      },
      { idempotencyKey: `review:${contractId}:3` },
    );
    events.push(unconfirmed);
    appended.push(unconfirmed);

    const exposure = mintExposureLogged(
      context,
      {
        componentIds: [componentIdOfEncounter(capture)],
        experienceId: `experience-${contractId}`,
      },
      { idempotencyKey: `exposure:${contractId}:1` },
    );
    events.push(exposure);
    appended.push(exposure);

    threads.set(command.threadId, { ...thread, state });

    const ack: CommandAck = {
      threadId: command.threadId,
      acknowledgedAt: exposure.occurredAt,
      events: appended,
      deduplicated: false,
      durability,
    };
    appliedKeys.set(idempotencyKey, ack);
    return ack;
  }

  /**
   * Correct an observation (REQ-UI-06, REQ-DM-04.2).
   *
   * The three refusals below are not defensive padding. `replay` throws a
   * `ReducerInvariantError` on a correction naming an unknown observation, and
   * on a second correction of the same one — so a store that let either through
   * would produce a log that cannot be replayed, exported, or read back. The
   * check therefore belongs where the command arrives, and its message is the
   * one the user sees.
   */
  function applyCorrectEvidence(
    command: Extract<AppCommand, { kind: 'correctEvidence' }>,
  ): CommandAck {
    if (command.note.trim() === '') throw new CorrectionRefusedError('empty-note');

    const target = events.find((event) => event.eventId === command.supersededEventId);
    if (target === undefined) throw new CorrectionRefusedError('unknown-observation');
    if (!isEvidenceClassEvent(target) || target.type === 'EvidenceSuperseded') {
      throw new CorrectionRefusedError('not-an-observation');
    }
    if (
      events.some(
        (event) =>
          event.type === 'EvidenceSuperseded' &&
          event.supersededEventId === command.supersededEventId,
      )
    ) {
      throw new CorrectionRefusedError('already-corrected');
    }

    const correction = mintEvidenceSuperseded(
      context,
      {
        supersededEventId: command.supersededEventId,
        reason: command.reason,
        // `replacementEventId` is deliberately absent: a Phase-0 correction is
        // a retraction with a stated reason, and naming a replacement that does
        // not exist would be the app inventing a record.
        correction: { note: command.note.trim() },
      },
      { idempotencyKey: `supersede:${command.supersededEventId}` },
    );

    events.push(correction);

    // The corrected thread, for the acknowledgment. An observation carries a
    // contract, not a thread, so this is a best-effort attribution for the UI
    // and never used to decide anything.
    const threadId = threadOrder[0] ?? '';

    return {
      threadId,
      acknowledgedAt: correction.occurredAt,
      events: [correction],
      deduplicated: false,
      durability,
    };
  }

  /** Append the `DataExported` record. See `RecordExportCommand` on ordering. */
  function applyRecordExport(command: Extract<AppCommand, { kind: 'recordExport' }>): CommandAck {
    const eventId = context.ids.nextId('event');
    const record: DataExportedEvent = createDomainEvent(
      context,
      'DataExported',
      { exportVersion: command.exportVersion, scope: { kind: 'all' } },
      { eventId, idempotencyKey: `export:${eventId}` },
    );
    events.push(record);

    return {
      threadId: threadOrder[0] ?? '',
      acknowledgedAt: record.occurredAt,
      events: [record],
      deduplicated: false,
      durability,
    };
  }

  /**
   * `replay` over the current log, memoised on log length.
   *
   * Length is a sound cache key here and only here: this log is append-only
   * within one session — nothing rewrites or removes an entry — so a length
   * that has not moved names the same array contents. A store that could
   * mutate history in place would need a different key, and that is precisely
   * the store this is not.
   */
  let derivedCache: { readonly length: number; readonly state: DerivedState } | null = null;
  function readDerived(): DerivedState {
    if (derivedCache !== null && derivedCache.length === events.length) return derivedCache.state;
    const state = replay(events);
    derivedCache = { length: events.length, state };
    return state;
  }

  function dispatch(command: AppCommand): CommandAck {
    switch (command.kind) {
      case 'capture':
        return applyCapture(command);
      case 'promote':
        return applyPromote(command);
      case 'markUncertainty':
        return applyMarkUncertainty(command);
      case 'seedEvidenceDemonstration':
        return applySeedEvidenceDemonstration(command);
      case 'correctEvidence':
        return applyCorrectEvidence(command);
      case 'recordExport':
        return applyRecordExport(command);
    }
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
      const started = elapsedMs();
      const kind: AppCommandKind = command.kind;
      let ack: CommandAck;
      try {
        ack = dispatch(command);
      } catch (cause) {
        // The record notes *that* a command failed and nothing about why: a
        // thrown message can quote a note, an answer, or captured text, and a
        // diagnostic buffer is exactly where that must not end up (§12, §15).
        observer.observe({
          commandKind: kind,
          latencyMs: Math.max(0, elapsedMs() - started),
          appendedTypes: [],
          deduplicated: false,
          failed: true,
        });
        throw cause;
      }
      rebuildSnapshot();
      notify();
      observer.observe({
        commandKind: kind,
        latencyMs: Math.max(0, elapsedMs() - started),
        appendedTypes: ack.events.map((event): DomainEventType => event.type),
        deduplicated: ack.deduplicated,
        failed: false,
      });
      return ack;
    },
    readAll: () => events.slice(),
    readDerived,
  };
}

/** The durability sentence the UI renders for a store. */
export const durabilityNoteFor = (level: DurabilityLevel): string => DURABILITY_NOTES[level];
