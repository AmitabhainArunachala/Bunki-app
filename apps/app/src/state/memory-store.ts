/**
 * The app's command handler and projection (WP-05; durable since WP-10).
 *
 * The implementation of the seam described in `./store.ts`. It keeps an
 * append-only event log and a projection built by `@bunki/domain`'s reducers.
 *
 * ## The name is now half true, deliberately
 *
 * WP-05 called this the in-memory store, and the projection still is: threads,
 * candidates and the applied-key map live in this closure. What changed in
 * WP-10 is that the log no longer *starts* empty and no longer *ends* here —
 * `initialEvents` rehydrates it from `@bunki/persistence` and `journal` carries
 * each accepted command's events out to the durable adapter. The file kept its
 * name because eight modules import `createMemoryAppStore` and a rename would
 * have put churn in every one of them during a three-lane merge; the honest
 * description is this paragraph, and `durability` is what any surface actually
 * renders.
 *
 * The swap really was a constructor change, which is what WP-05 predicted: no
 * screen, no command, and no test of the command flow changed shape for it.
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
  createLearnContractPair,
  createDomainEvent,
  initialThreadState,
  isEvidenceClassEvent,
  learnContractIdentity,
  learnContractMatchesSpecification,
  mintEvidenceSuperseded,
  mintExposureLogged,
  mintLookupFrictionLogged,
  mintReviewGraded,
  openMintedEventBatch,
  replay,
  targetKeyOfEncounter,
  validateLearnContractPair,
  threadReducer,
  type CandidateAcceptedAsNoteEvent,
  type CandidateAttachedEvent,
  type ContractCreatedEvent,
  type DataExportedEvent,
  type DerivedState,
  type DomainContext,
  type DomainEvent,
  type DomainEventType,
  type EncounterCapturedEvent,
  type LookupFrictionLoggedEvent,
  type MintedEventBatch,
  type ThreadPromotionChangedEvent,
  type ThreadState,
} from '@bunki/domain';

import {
  captureClaimMatchesEvent,
  captureV2IdempotencyKey,
  legacyCaptureIdempotencyKey,
  validateCaptureClaim,
} from './capture-idempotency.ts';
import {
  CorrectionRefusedError,
  DEMONSTRATION_EXPERIENCE_PREFIX,
  DEMONSTRATION_PROMPT_FAMILY_VERSION,
  DURABILITY_NOTES,
  NULL_COMMAND_OBSERVER,
  PERSIST_OPERATION_KIND,
  type AppCommand,
  type AppCommandKind,
  type AppSnapshot,
  type AppStore,
  type CandidateView,
  type CommandAck,
  type CommandObserver,
  type DurabilityLevel,
  type PersistAck,
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

/**
 * A candidate is identified by its own id, which `@bunki/ai` mints once per
 * exchange. Two attachments of the same candidate are the same fact arriving
 * twice — a re-render, a double dispatch — not two candidates.
 */
const attachCandidateIdempotencyKey = (candidateId: string): string =>
  `candidate-attached:${candidateId}`;

/**
 * Accepting is keyed by the candidate too, so a double-tapped Accept produces
 * exactly one `CandidateAcceptedAsNote`. A second event would read, in the
 * evidence inspector, as the learner having accepted the same note twice.
 */
const acceptCandidateIdempotencyKey = (candidateId: string): string =>
  `candidate-accepted:${candidateId}`;

/**
 * The batch key for a durable append (WP-10; controller §7).
 *
 * `EventStorePort.append` takes a *batch* key alongside each event's own, and
 * they answer different questions: the batch key makes a double-tapped save one
 * write, the event key makes one event appear once however many batches contain
 * it. This derives the batch key from the command kind and the first event's
 * key, both of which are content-derived, so replaying the same gesture produces
 * the same batch key and the adapter's no-op path handles it.
 *
 * If two different batches ever did collide here, the adapter compares payloads
 * and throws `IdempotencyConflictError` rather than silently dropping the second
 * — which is why this can be a derived key at all instead of a counter that
 * would break the moment the app restarted.
 */
function commandIdempotencyKey(command: AppCommand, ack: CommandAck): string {
  const first = ack.events[0];
  return `${command.kind}:${first === undefined ? ack.acknowledgedAt : first.idempotencyKey}`;
}

interface StoredThread {
  readonly state: ThreadState;
  readonly displayText: string;
  readonly targetKey: string;
  readonly lexemeId: string | null;
  readonly uncertainty: UncertaintyAnnotation | null;
  readonly markRecordedInLog: boolean;
  readonly capturedAt: string;
}

const toView = (thread: StoredThread): ThreadView => ({
  state: thread.state,
  displayText: thread.displayText,
  targetKey: thread.targetKey,
  lexemeId: thread.lexemeId,
  uncertainty: thread.uncertainty,
  markRecordedInLog: thread.markRecordedInLog,
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
  /**
   * A durable log to start from (WP-10).
   *
   * The projection is rebuilt from these before the first render, so a reload
   * finds the learner's threads where they left them (T-01, T-16-web at the app
   * level). Read `rehydrate` for what the log can and cannot restore — two
   * app-local facts were never in it, and the store says so rather than guessing
   * them back.
   */
  readonly initialEvents?: readonly DomainEvent[] | undefined;
  /**
   * Called with the events an accepted command appended, after they are applied
   * (WP-10).
   *
   * The ordering is REQ-UI-01's, and it is the reason this is a callback rather
   * than an `await`: `execute` acknowledges locally first and persists after,
   * never the reverse. A store that awaited a durable write before returning
   * would turn "the save feels immediate" into "the save feels like the disk",
   * which is the requirement inverted.
   */
  readonly journal?: ((events: readonly DomainEvent[], idempotencyKey: string) => void) | undefined;
  /**
   * Re-attaches a captured thread to its seed entry after a reload.
   *
   * `lexemeId` is app-local — the event log records the learner's text, not
   * which dictionary row a search happened to match — so without this a
   * rehydrated thread would lose its link to the word page. Injected rather than
   * looked up here because the store must not import the seed: resolving a
   * headword is a lexical judgement, and this file is the one place that is
   * allowed to hold no lexical judgements at all.
   */
  readonly resolveLexemeId?: ((text: string) => string | null) | undefined;
}

export function createMemoryAppStore({
  context,
  durability = 'in-memory-session-only',
  observer = NULL_COMMAND_OBSERVER,
  elapsedMs = () => 0,
  initialEvents,
  journal,
  resolveLexemeId,
}: MemoryAppStoreOptions): AppStore {
  const events: DomainEvent[] = [];
  const threads = new Map<string, StoredThread>();
  /** Insertion order, newest first, for the snapshot's thread list. */
  const threadOrder: string[] = [];
  const candidates = new Map<string, CandidateView>();
  /** Newest first, like `threadOrder`. */
  const candidateOrder: string[] = [];
  const appliedKeys = new Map<string, CommandAck>();
  const listeners = new Set<() => void>();
  let revision = 0;
  let snapshot: AppSnapshot = {
    revision: 0,
    threads: [],
    threadsById: {},
    candidates: [],
    candidatesByThread: {},
    eventCount: 0,
  };

  function rebuildSnapshot(): void {
    revision += 1;
    const views = threadOrder
      .map((id) => threads.get(id))
      .filter((thread): thread is StoredThread => thread !== undefined)
      .map(toView);
    const byId: Record<string, ThreadView> = {};
    for (const view of views) byId[view.state.threadId] = view;

    const candidateViews = candidateOrder
      .map((id) => candidates.get(id))
      .filter((candidate): candidate is CandidateView => candidate !== undefined);
    const candidatesByThread: Record<string, CandidateView[]> = {};
    for (const candidate of candidateViews) {
      (candidatesByThread[candidate.threadId] ??= []).push(candidate);
    }

    snapshot = {
      revision,
      threads: views,
      threadsById: byId,
      candidates: candidateViews,
      candidatesByThread,
      eventCount: events.length,
    };
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  /**
   * Rebuild the projection from a durable log (WP-10).
   *
   * ## What comes back, and what honestly cannot
   *
   * Threads and their promotion state come back exactly, because they are
   * reduced from the log by the kernel's own reducers — the same call the live
   * path makes, so a rehydrated thread and a just-captured one are the same
   * object built the same way.
   *
   * Two app-local facts were never in the log and do not come back:
   *
   *   - **the uncertainty dimension.** `EncounterCaptured.uncertaintyMark` is
   *     `true | absent` in the frozen v1 schema (WP05-D2), so the fact of a mark
   *     survives and the five-way choice does not. The thread comes back with
   *     `uncertainty: null` and `markRecordedInLog: true`; nothing here invents a
   *     dimension, and `uncertaintyLogNote` says which of the two situations the
   *     learner is looking at.
   *   - **candidate text.** `CandidateAttached` carries envelope metadata and
   *     deliberately not the payload, so an unaccepted candidate's text is not
   *     durable by design (see `CandidateView`). Candidates are therefore not
   *     rehydrated into the snapshot at all — a panel restored with an empty body
   *     would be a worse lie than an empty panel. The events themselves are in
   *     the log and the evidence inspector shows them, because the inspector
   *     reads `readDerived()` rather than this projection.
   *
   * Every event's own `idempotencyKey` is replayed into `appliedKeys`, so a
   * capture repeated after a reload is still the no-op it is within one session.
   * That is the difference between idempotency as a UI convenience and
   * idempotency as a property of the log.
   */
  /**
   * Fold one event that arrived already-minted into the log and the projection.
   *
   * Shared by `rehydrate` (events read back from the durable adapter) and
   * `persistMinted` (events the kernel minted elsewhere in this process). The two
   * paths differ in what they trust — the adapter is the authority on its own
   * bytes, the persist path checks provenance first — and not at all in how an
   * event is projected, so the projection lives here once. A second copy would be
   * a second answer to "what does this event mean for a thread", which is the
   * disagreement `readDerived()` exists to make impossible.
   */
  function absorb(event: DomainEvent): void {
    events.push(event);

    if (event.type === 'EncounterCaptured') {
      const captured = event;
      const targetText = targetKeyOfEncounter(captured);
      const targetKey = targetKeyOf(targetText);
      const existing = threads.get(captured.threadId);
      const marked = 'uncertaintyMark' in captured && captured.uncertaintyMark === true;
      if (existing === undefined) {
        threads.set(captured.threadId, {
          state: initialThreadState(captured),
          displayText: targetText,
          targetKey,
          lexemeId: resolveLexemeId?.(targetText) ?? null,
          uncertainty: null,
          markRecordedInLog: marked,
          capturedAt: captured.occurredAt,
        });
        threadOrder.unshift(captured.threadId);
      } else {
        threads.set(captured.threadId, {
          ...existing,
          state: threadReducer(existing.state, captured),
          markRecordedInLog: existing.markRecordedInLog || marked,
        });
      }
    } else if (event.type === 'ThreadPromotionChanged') {
      const thread = threads.get(event.threadId);
      // A promotion whose thread is not in the log is a log the kernel would
      // refuse on replay. It is skipped rather than thrown on, because the
      // authority on a malformed log is `replay` — which `readDerived()` runs
      // over the same events — and two components deciding that question
      // separately is how they come to disagree.
      if (thread !== undefined) {
        threads.set(event.threadId, { ...thread, state: threadReducer(thread.state, event) });
      }
    }

    appliedKeys.set(event.idempotencyKey, {
      threadId: 'threadId' in event ? event.threadId : '',
      acknowledgedAt: event.occurredAt,
      events: [event],
      deduplicated: false,
      durability,
    });
  }

  function rehydrate(log: readonly DomainEvent[]): void {
    for (const event of log) absorb(event);
    if (log.length > 0) rebuildSnapshot();
  }

  function findThreadByTarget(targetKey: string): StoredThread | undefined {
    for (const id of threadOrder) {
      const thread = threads.get(id);
      if (thread !== undefined && thread.targetKey === targetKey) return thread;
    }
    return undefined;
  }

  function applyCapture(command: Extract<AppCommand, { kind: 'capture' }>): CommandAck {
    // Validate every field that would survive in the event before consulting
    // idempotency. A malformed source/provenance object must not become a
    // successful no-op merely because its incomplete legacy tuple collides.
    const validated = validateCaptureClaim(command);
    const selectedText = validated.selectedText;
    const captureClaim = validated.persisted;
    const idempotencyKey = captureV2IdempotencyKey(captureClaim);

    const previousV2 = appliedKeys.get(idempotencyKey);
    if (previousV2 !== undefined) {
      const priorEvent = previousV2.events[0];
      if (
        priorEvent?.type === 'EncounterCaptured' &&
        captureClaimMatchesEvent(captureClaim, priorEvent)
      ) {
        return { ...previousV2, events: [], deduplicated: true };
      }
      // A SHA-256 collision or a corrupt/foreign claim under the v2 namespace
      // is not a duplicate. Refuse rather than choosing one history.
      throw new Error('capture v2 idempotency key is claimed by different persisted evidence');
    }

    // Historical events keep their original keys. Recognise one only when its
    // complete persisted payload is exactly the prospective payload; the old
    // key alone omitted source body, source kind, provenance and the mark.
    const legacyKey = legacyCaptureIdempotencyKey(captureClaim, targetKeyOf(selectedText));
    const previousLegacy = appliedKeys.get(legacyKey);
    if (previousLegacy !== undefined) {
      const priorEvent = previousLegacy.events[0];
      if (
        priorEvent?.type === 'EncounterCaptured' &&
        captureClaimMatchesEvent(captureClaim, priorEvent)
      ) {
        return { ...previousLegacy, events: [], deduplicated: true };
      }
    }

    const targetKey = targetKeyOf(selectedText);
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
        text: captureClaim.text,
        ...(captureClaim.span === null ? {} : { span: { ...captureClaim.span } }),
        sourceRef: captureClaim.sourceRef,
        provenance: captureClaim.provenance,
        // `true | absent` is the whole vocabulary the v1 schema has. The
        // dimension the learner chose is kept beside the log — see
        // `UncertaintyAnnotation`.
        ...(captureClaim.uncertaintyMark ? { uncertaintyMark: true as const } : {}),
      },
      { idempotencyKey },
    );

    // Read the exact target back from the parsed event, so live projection and
    // reload projection share one definition of the frozen coordinates.
    const targetText = targetKeyOfEncounter(event);

    events.push(event);

    const uncertainty: UncertaintyAnnotation | null =
      command.uncertainty === null
        ? (existing?.uncertainty ?? null)
        : { dimension: command.uncertainty, editedAt: event.occurredAt, markedAtCapture: true };

    const marked = command.uncertainty !== null;
    if (existing === undefined) {
      threads.set(threadId, {
        state: initialThreadState(event),
        displayText: targetText,
        targetKey,
        lexemeId: command.lexemeId ?? null,
        uncertainty,
        markRecordedInLog: marked,
        capturedAt: event.occurredAt,
      });
      threadOrder.unshift(threadId);
    } else {
      threads.set(threadId, {
        ...existing,
        state: threadReducer(existing.state, event),
        lexemeId: existing.lexemeId ?? command.lexemeId ?? null,
        uncertainty,
        // Once any capture on the thread carried a mark, the log holds one
        // forever: appended history is not retractable, and a later unmarked
        // re-encounter does not erase the earlier event's field.
        markRecordedInLog: existing.markRecordedInLog || marked,
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

  function requireExplicitUserAction(command: { readonly userAction: true }, action: string): void {
    // Runtime backstop for JSON/`any` callers. The literal type stops ordinary
    // TypeScript producers; this stops a forged `false` from turning an
    // automatic lifecycle action into learner authority.
    if ((command as { readonly userAction: unknown }).userAction !== true) {
      throw new Error(`${action} requires an explicit user action`);
    }
  }

  /**
   * Activate Learn and its versioned reading + meaning pair as one app command.
   *
   * No screen-side factory logic lives here: the domain validates the supplied
   * definitions, derives stable ids from the durable thread/spec identity, and
   * mints both `ContractCreated` events. The app owns only command sequencing
   * and journaling.
   */
  function applyActivateLearn(command: Extract<AppCommand, { kind: 'activateLearn' }>): CommandAck {
    requireExplicitUserAction(command, 'Learn activation');
    const thread = threads.get(command.threadId);
    if (thread === undefined)
      throw new Error(`cannot activate Learn for unknown thread ${command.threadId}`);

    const origin = events.find(
      (event): event is EncounterCapturedEvent =>
        event.type === 'EncounterCaptured' && event.threadId === command.threadId,
    );
    if (origin === undefined) {
      throw new Error(`thread ${command.threadId} has no origin capture for Learn contracts`);
    }

    // Pure, complete validation before any promotion object is minted or any
    // event is appended. A bad meaning grader cannot leave the thread at Learn
    // with only a reading contract.
    validateLearnContractPair(origin, command.specification);
    const skills = ['orthography_to_reading', 'form_to_meaning'] as const;
    const identities = skills.map((skill) =>
      learnContractIdentity(command.threadId, command.specification, skill),
    );
    const activationKey = `activate-learn:${identities.map((identity) => identity.contractId).join('|')}`;
    const previous = appliedKeys.get(activationKey);
    if (previous !== undefined) return { ...previous, events: [], deduplicated: true };

    const existingContracts = identities.map((identity) =>
      events.filter(
        (event): event is ContractCreatedEvent =>
          event.type === 'ContractCreated' && event.contractId === identity.contractId,
      ),
    );
    if (existingContracts.some((matches) => matches.length > 1)) {
      throw new Error('cannot activate Learn: a stable contract id appears more than once');
    }
    const existingCount = existingContracts.filter((matches) => matches.length === 1).length;
    if (existingCount !== 0 && existingCount !== skills.length) {
      throw new Error('cannot activate Learn: the durable reading/meaning pair is incomplete');
    }
    if (existingCount === skills.length) {
      for (let index = 0; index < skills.length; index += 1) {
        const event = existingContracts[index]?.[0];
        const skill = skills[index];
        if (
          event === undefined ||
          skill === undefined ||
          !learnContractMatchesSpecification(event, origin, command.specification, skill)
        ) {
          throw new Error(
            'cannot activate Learn: a stable contract id carries different grading data',
          );
        }
      }
    }

    const promotions: ThreadPromotionChangedEvent[] = [];
    let state = thread.state;
    const remaining =
      state.promotion === 'captured'
        ? (['keep', 'learn'] as const)
        : state.promotion === 'keep'
          ? (['learn'] as const)
          : [];
    let from = state.promotion;
    for (const to of remaining) {
      const promotion = createDomainEvent(
        context,
        'ThreadPromotionChanged',
        { threadId: command.threadId, from, to, origin: 'user' },
        { idempotencyKey: promoteIdempotencyKey(command.threadId, from, to) },
      );
      promotions.push(promotion);
      state = threadReducer(state, promotion);
      from = to;
    }

    const contracts =
      existingCount === 0 ? createLearnContractPair(context, origin, command.specification) : [];
    const appended: DomainEvent[] = [...promotions, ...contracts];
    if (appended.length === 0) {
      const acknowledgedAt = existingContracts[1]?.[0]?.occurredAt ?? origin.occurredAt;
      return {
        threadId: command.threadId,
        acknowledgedAt,
        events: [],
        deduplicated: true,
        durability,
      };
    }

    events.push(...appended);
    if (promotions.length > 0) threads.set(command.threadId, { ...thread, state });
    for (const event of appended) {
      appliedKeys.set(event.idempotencyKey, {
        threadId: command.threadId,
        acknowledgedAt: event.occurredAt,
        events: [event],
        deduplicated: false,
        durability,
      });
    }

    const acknowledgedAt = appended[appended.length - 1]?.occurredAt ?? origin.occurredAt;
    const ack: CommandAck = {
      threadId: command.threadId,
      acknowledgedAt,
      events: appended,
      deduplicated: false,
      durability,
    };
    appliedKeys.set(activationKey, ack);
    return ack;
  }

  /** Mint and record one quick look. It has no route to a grade or FSRS. */
  function applyRecordLookupFriction(
    command: Extract<AppCommand, { kind: 'recordLookupFriction' }>,
  ): CommandAck {
    requireExplicitUserAction(command, 'Lookup friction');
    if (command.lookupId.trim() === '') throw new Error('lookupId must be non-empty');

    const idempotencyKey = `lookup-friction:${encodeURIComponent(command.lookupId)}`;
    const previous = appliedKeys.get(idempotencyKey);
    if (previous !== undefined) {
      const recorded = previous.events[0];
      if (
        recorded?.type !== 'LookupFrictionLogged' ||
        recorded.context !== command.context ||
        recorded.targetRef.targetType !== command.targetRef.targetType ||
        recorded.targetRef.targetId !== command.targetRef.targetId
      ) {
        throw new Error('lookupId was already used for different lookup evidence');
      }
      return { ...previous, events: [], deduplicated: true };
    }

    const event: LookupFrictionLoggedEvent = mintLookupFrictionLogged(
      context,
      { targetRef: command.targetRef, context: command.context },
      { idempotencyKey },
    );
    events.push(event);

    const threadId = command.targetRef.targetType === 'thread' ? command.targetRef.targetId : '';
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
   * Attach an AI candidate (WP-07).
   *
   * The event carries envelope *metadata* only — the text stays in
   * `candidates`, beside the log. That split is the privacy design (see
   * `CandidateView`), and it is why this function passes `command.envelope`
   * through untouched rather than assembling one: the metadata was built and
   * validated in `@bunki/ai`, and re-deriving it here would create a second
   * definition of what a candidate envelope is.
   */
  function applyAttachCandidate(
    command: Extract<AppCommand, { kind: 'attachCandidate' }>,
  ): CommandAck {
    const thread = threads.get(command.threadId);
    if (thread === undefined) {
      throw new Error(`cannot attach a candidate to unknown thread ${command.threadId}`);
    }

    const idempotencyKey = attachCandidateIdempotencyKey(command.candidateId);
    const previous = appliedKeys.get(idempotencyKey);
    if (previous !== undefined) return { ...previous, events: [], deduplicated: true };

    const event: CandidateAttachedEvent = createDomainEvent(
      context,
      'CandidateAttached',
      {
        threadId: command.threadId,
        candidateId: command.candidateId,
        envelope: command.envelope,
        status: 'generated',
      },
      { idempotencyKey },
    );

    events.push(event);
    candidates.set(command.candidateId, {
      candidateId: command.candidateId,
      threadId: command.threadId,
      status: 'generated',
      envelope: command.envelope,
      text: command.text,
      acceptedAt: null,
    });
    candidateOrder.unshift(command.candidateId);

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
   * Accept a candidate as a note — an explicit user action, always.
   *
   * `userAction: true` is a literal in the frozen schema, so there is no
   * representable automatic acceptance; this function is the only place in the
   * app that can produce the event, and it is reachable only from a press
   * handler (`apps/app/test/candidate-command-flow.test.ts` pins that).
   */
  function applyAcceptCandidate(
    command: Extract<AppCommand, { kind: 'acceptCandidate' }>,
  ): CommandAck {
    const candidate = candidates.get(command.candidateId);
    if (candidate === undefined) {
      throw new Error(`cannot accept unknown candidate ${command.candidateId}`);
    }

    const idempotencyKey = acceptCandidateIdempotencyKey(command.candidateId);
    const previous = appliedKeys.get(idempotencyKey);
    if (previous !== undefined) return { ...previous, events: [], deduplicated: true };

    const event: CandidateAcceptedAsNoteEvent = createDomainEvent(
      context,
      'CandidateAcceptedAsNote',
      { candidateId: command.candidateId, userAction: true },
      { idempotencyKey },
    );

    events.push(event);
    candidates.set(command.candidateId, {
      ...candidate,
      status: 'accepted',
      acceptedAt: event.occurredAt,
    });

    const ack: CommandAck = {
      threadId: candidate.threadId,
      acknowledgedAt: event.occurredAt,
      events: [event],
      deduplicated: false,
      durability,
    };
    appliedKeys.set(idempotencyKey, ack);
    return ack;
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
        // Prefixed so the inspector can tell a demonstration exposure from one
        // the learner actually produced. An exposure carries no contract, so
        // this is the only field that can hold the provenance (see
        // `DEMONSTRATION_EXPERIENCE_PREFIX`).
        experienceId: `${DEMONSTRATION_EXPERIENCE_PREFIX}${contractId}`,
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

  /**
   * Dispatch, exhaustively.
   *
   * A `switch` over the closed union rather than a chain of ternaries, so that
   * adding a command kind without handling it is a type error here instead of a
   * silent fall-through to the last branch. That property is what made the
   * three-lane WP-10 merge checkable: every command WP-07, WP-08 and WP-09 each
   * added has to appear below or this function stops returning `CommandAck` on
   * every path.
   */
  function dispatch(command: AppCommand): CommandAck {
    switch (command.kind) {
      case 'capture':
        return applyCapture(command);
      case 'promote':
        return applyPromote(command);
      case 'activateLearn':
        return applyActivateLearn(command);
      case 'recordLookupFriction':
        return applyRecordLookupFriction(command);
      case 'markUncertainty':
        return applyMarkUncertainty(command);
      case 'attachCandidate':
        return applyAttachCandidate(command);
      case 'acceptCandidate':
        return applyAcceptCandidate(command);
      case 'seedEvidenceDemonstration':
        return applySeedEvidenceDemonstration(command);
      case 'correctEvidence':
        return applyCorrectEvidence(command);
      case 'recordExport':
        return applyRecordExport(command);
    }
  }

  /**
   * The batch key for a persisted batch of kernel-minted events (WP-10).
   *
   * Derived from the first appended event's own key, which is content-derived on
   * every session path, so re-persisting the same gesture produces the same batch
   * key and the adapter's no-op path handles it — the same rule
   * `commandIdempotencyKey` follows, and for the same reason.
   */
  const persistBatchKey = (first: DomainEvent): string =>
    `${PERSIST_OPERATION_KIND}:${first.idempotencyKey}`;

  /**
   * Write down events the kernel minted elsewhere in this process.
   *
   * The whole method is a filter and two loops. Everything that makes it safe
   * happened before the first line: `openMintedEventBatch` throws unless the
   * container came from `sealMintedEvents` *and* every member is an object one of
   * the kernel's minters returned, unaltered. There is nothing here that
   * constructs, grades, tiers, or admits.
   *
   * See `AppStore.persistMinted` for why this is not the `ingest` hole WP-10's
   * closeout refused to open.
   */
  function persistMinted(batch: MintedEventBatch): PersistAck {
    const started = elapsedMs();
    const incoming = openMintedEventBatch(batch);

    const appended: DomainEvent[] = [];
    const alreadyPresent: DomainEvent[] = [];
    for (const event of incoming) {
      // Keyed on the event's own key, not the batch's: the session workspace
      // holds a copy of the store's log, so a caller that re-offers its whole
      // workspace is offering events this store already has. That is the normal
      // case on the first dispatch of a sitting, not an error.
      if (appliedKeys.has(event.idempotencyKey)) {
        alreadyPresent.push(event);
        continue;
      }
      absorb(event);
      appended.push(event);
    }

    if (appended.length > 0) {
      rebuildSnapshot();
      notify();
      const first = appended[0];
      // Same ordering rule as `execute`: subscribers see it before a byte is
      // written (REQ-UI-01), and a failed durable write becomes a reported write
      // state rather than a lost acknowledgment (`durable-store.ts`).
      if (journal !== undefined && first !== undefined) {
        journal(appended, persistBatchKey(first));
      }
    }

    observer.observe({
      commandKind: PERSIST_OPERATION_KIND,
      latencyMs: Math.max(0, elapsedMs() - started),
      appendedTypes: appended.map((event): DomainEventType => event.type),
      deduplicated: appended.length === 0 && alreadyPresent.length > 0,
      failed: false,
    });

    return {
      appended,
      alreadyPresent,
      acknowledgedAt: appended[appended.length - 1]?.occurredAt ?? context.clock.now(),
      durability,
    };
  }

  if (initialEvents !== undefined) rehydrate(initialEvents);

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
      // After the snapshot and the notify, before the return: the learner's
      // acknowledgment is already on screen when the durable write starts
      // (REQ-UI-01). `journal` never throws into this path — see
      // `durable-store.ts`, where a failed write becomes a reported state
      // rather than a lost acknowledgment.
      if (journal !== undefined && ack.events.length > 0) {
        journal(ack.events, commandIdempotencyKey(command, ack));
      }
      observer.observe({
        commandKind: kind,
        latencyMs: Math.max(0, elapsedMs() - started),
        appendedTypes: ack.events.map((event): DomainEventType => event.type),
        deduplicated: ack.deduplicated,
        failed: false,
      });
      return ack;
    },
    persistMinted,
    readAll: () => events.slice(),
    readDerived,
  };
}

/** The durability sentence the UI renders for a store. */
export const durabilityNoteFor = (level: DurabilityLevel): string => DURABILITY_NOTES[level];
