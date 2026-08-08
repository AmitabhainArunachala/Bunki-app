/**
 * The app end of the session orchestrator (WP-08; controller §5, §6.4).
 *
 * ## What this file is allowed to do, and what it is not
 *
 * It maps interactions to domain commands and holds the result. That is the
 * whole permission `apps/app` has (controller §5). It does not grade, does not
 * decide what a probe is, does not compute an interval, and does not construct
 * an event — every event in the workspace came out of `@bunki/domain`'s own
 * factories, reached through `applySessionCommand` and `createTargetContract`.
 *
 * ## Where the log comes from
 *
 * Two sources, joined once:
 *
 *   - the `AppStore`'s own log, **read and never written** — the learner's own
 *     captures and their own promotions, so the session plans over a thread they
 *     made rather than one this file manufactured;
 *   - the retrieval contracts for the chosen target, minted here because nothing
 *     in the loop had created one yet. `@bunki/persistence` is not wired into
 *     `apps/app` in this wave (controller §5 lint boundary 2, and the W4
 *     cross-lane rule), so the joined log lives in this hook for now and is
 *     handed back through `onEvents` for the WP-10 integration to append. That
 *     is a recorded seam, not a hidden one — see `SESSION_INTEGRATION_NOTE`.
 *
 * ## Why the bootstrap writes nothing (WP-10 repair round, P0)
 *
 * It used to `capture` the seeded headword and `promote` it to `learn` through
 * the real store, from a `useState` initialiser, on the first render of the
 * `(session)` route group. Reaching the Session link was therefore enough to put
 * an `EncounterCaptured` and a `ThreadPromotionChanged` into the learner's
 * durable, exportable log with no gesture behind either — the seed passage
 * stamped `user_encounter` / `user_owned`, the promotion stamped
 * `origin: "user"`. The definition-of-done names that exactly: "the inspector
 * shows events but a grade, a promotion, or an AI acceptance exists with no user
 * action behind it" (§2 item 6), and it destroyed §3 step 3, where John is asked
 * to confirm the review queue was empty of his encounter *before* he promoted it.
 *
 * So the bootstrap is now a pure read. It plans the sitting over threads the
 * learner has already promoted to a rung that activates contracts (REQ-DM-09),
 * and when there are none it returns no target and the screens render their
 * existing empty state with {@link NO_PROMOTED_TARGET_NOTE}. The one gesture
 * that puts a thread there is the learner's own "Take it up for study" on the
 * capture screen; nothing else in the app promotes anything.
 */

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

import {
  applySessionCommand,
  bindRetrievalContract,
  canvasProbeOffer,
  componentIdForTargetKey,
  componentIdOfEncounter,
  createSessionWorkspace,
  createTargetContract,
  isPromotionActive,
  latestStumble,
  retrievalContractFromEvent,
  sealMintedEvents,
  type CanvasProbeOffer,
  type ContractCreatedEvent,
  type DomainContext,
  type DomainEvent,
  type EncounterCapturedEvent,
  type SessionCommand,
  type SessionWorkspaceState,
} from '@bunki/domain';

import {
  DEFAULT_CANONICAL_TARGET,
  findLexemeById,
  findLexemeByHeadword,
  passageForLexeme,
  seedDataset,
  type SeedLexeme,
  type SeedPassage,
} from '../data/catalog.ts';
import { useAppStore } from '../state/app-context.tsx';
import type { AppStore, ThreadView } from '../state/store.ts';
import type { PassageMark } from './canvas-passage.ts';

/**
 * What the durable log now holds for a sitting, and what it still does not.
 *
 * ## The seam this used to describe, and how it closed
 *
 * WP-08 held the session's events in this hook's state and left joining them to
 * WP-10. WP-10 declined, for a reason that was correct at the time: giving
 * `AppStore` an `ingest(events)` would let a screen hand it an object literal
 * shaped like a tier-A `ReviewGraded`, and `@bunki/domain` had no runtime marker
 * separating that from a gate-minted one — a brand does not survive the JSON
 * boundary, as the gate itself says.
 *
 * It closed by noticing that the persist path never crosses that boundary. The
 * kernel now records the exact objects its minters return (`mint-registry.ts`),
 * `sealMintedEvents` refuses anything else, and `AppStore.persistMinted` takes
 * only a sealed batch — so the store accepts events it did not mint *and* cannot
 * accept events the kernel did not mint. The events themselves are still minted
 * exactly where they were: by `applySessionCommand`, evidence-class ones through
 * the evidence gate.
 *
 * ## What is therefore true now
 *
 * A sitting's `SessionStarted`, its contracts, every graded review, every canvas
 * observation and its `SessionClosed` are in the same durable log as the capture
 * and the promotion. They survive a reload, they are in the export, they replay,
 * and the evidence inspector shows them.
 *
 * ## What is still app-local, said in the same breath so the sentence is not read
 * as more than it is
 *
 * The *plan* is not an event. Which steps were composed, which were skipped and
 * how far the cursor got are this workspace's state and are not exported; what
 * the log keeps is what the learner did — the observations — and the explicit
 * `SessionClosed` completion state. That is the intended split (a plan is a
 * proposal, not evidence), not a gap left open.
 */
export const SESSION_INTEGRATION_NOTE =
  'This sitting writes to the same durable log as your captures: the session start, the contracts it asks under, every answer you give here or in the passage, and the close. They survive a reload, appear in an export, and show up in the evidence inspector. The plan itself — which steps were composed and how far you got — stays on this device, because a plan is a proposal rather than a record of what you did.';

/**
 * What the session says when the learner has promoted nothing yet.
 *
 * A constant rather than a literal in two screens, so the session and the canvas
 * cannot drift into telling the learner two different things about the same
 * empty state — and so `test/session-canvas.test.ts` can assert the empty state
 * is reached rather than assert against a sentence typed twice.
 *
 * It names the gesture that fixes it. An empty state that only says "nothing
 * here" is the failure mode this replaced: the previous bootstrap avoided the
 * empty state by inventing an encounter, which is worse than an honest blank.
 */
export const NO_PROMOTED_TARGET_NOTE = `A sitting is planned over what you have taken up for study, so there is nothing to plan yet. Keep an encounter on the capture screen and then choose “Take it up for study” on it — that is the only thing in this app that promotes a thread, and it has to be you. ${DEFAULT_CANONICAL_TARGET} is the word the seed’s passage is written around, so it is the one that also opens the integration canvas.`;

const readingContractIdFor = (lexeme: SeedLexeme): string => `contract-reading-${lexeme.id}`;
const meaningContractIdFor = (lexeme: SeedLexeme): string => `contract-meaning-${lexeme.id}`;

/**
 * A human label for **every** contract `contractsFor` mints.
 *
 * Built from the same two id helpers the contracts themselves are built from,
 * in one place, so the map cannot list a contract that is not created or omit
 * one that is. The planner labels a step by looking its contract id up in this
 * map and falling back to the id itself; the fallback is a last resort for an
 * unknown contract, not a rendering strategy, and anything that reaches it is a
 * defect — hence `session-screens.test.ts`'s assertion that no prompt string
 * ever matches an internal id.
 *
 * The two labels differ because the steps ask different questions of the same
 * word: one asks how it is read, the other what it means. Labelling both
 * "分岐" would be honest but useless — the learner would see two identical
 * prompts and no way to tell which contract they were answering.
 */
function contractLabelsFor(lexeme: SeedLexeme): ReadonlyMap<string, string> {
  return new Map([
    [readingContractIdFor(lexeme), `${lexeme.headword} — reading`],
    [meaningContractIdFor(lexeme), `${lexeme.headword} — meaning`],
  ]);
}

/** Labels for the contracts that actually exist in the canonical log. */
function contractLabelsForEvents(
  lexeme: SeedLexeme,
  contracts: readonly ContractCreatedEvent[],
): ReadonlyMap<string, string> {
  return new Map(
    contracts.map((contract) => [
      contract.contractId,
      contract.skill === 'orthography_to_reading'
        ? `${lexeme.headword} — reading`
        : contract.skill === 'form_to_meaning'
          ? `${lexeme.headword} — meaning`
          : `${lexeme.headword} — ${contract.skill.replace(/_/g, ' ')}`,
    ]),
  );
}

export interface SessionTarget {
  readonly lexeme: SeedLexeme;
  readonly passage: SeedPassage;
  readonly componentId: string;
  readonly threadId: string;
  /** The contract the canvas may probe: reading, for the seeded target. */
  readonly probeContractId: string;
  /**
   * Every contract this target mints, reading *and* meaning.
   *
   * The canvas probes exactly one of them (`probeContractId`), but the planner
   * draws from all of them, and a caller that knows only about the probed one
   * cannot label what the planner picked. That is not hypothetical: both
   * contracts are minted on the same clock tick, so `compareDueContracts` falls
   * through to its id tiebreak, and `contract-meaning-…` sorts before
   * `contract-reading-…`. With a one-entry label map the meaning step's label
   * fell back to `memory.contractId` and the learner was shown a raw internal
   * id as their recall prompt.
   *
   * Carrying the set here — rather than letting each screen re-derive it — is
   * what keeps the label map and the contracts that actually exist from drifting
   * apart the next time a third contract is added.
   */
  readonly contractLabels: ReadonlyMap<string, string>;
}

export interface SessionLoopOptions {
  /** Injected so the screenshot harness and tests can pin time and ids. */
  readonly context: DomainContext;
  readonly store?: AppStore | undefined;
  /** Exact durable thread requested by a source route; newest active when absent. */
  readonly preferredThreadId?: string | undefined;
  /** Handed every event the session produced, for the WP-10 integration. */
  readonly onEvents?: ((events: readonly DomainEvent[]) => void) | undefined;
}

export interface SessionLoop {
  readonly state: SessionWorkspaceState;
  readonly target: SessionTarget | null;
  readonly offer: CanvasProbeOffer | null;
  readonly dispatch: (command: SessionCommand) => void;
  /**
   * The injected clock, in the kernel's canonical instant form.
   *
   * The domain reads no clock (REQ-ARCH-02), so "what is due *now*" has to be
   * answered by the caller. This is the app's end of that seam and the only
   * place a screen touches time; it is the injected `DomainContext.clock`, so a
   * test or the screenshot harness pins it by passing a fixed context rather
   * than by patching a global.
   */
  readonly now: () => string;
  /** Set when the seed could not support a session at all. */
  readonly error: string | null;
}

/**
 * Build the two contracts for the chosen target.
 *
 * Two, not one, and that is REQ-DM-05 and T-05 rather than thoroughness:
 * meaning and reading are *distinct* contracts, so a missed reading cannot
 * erase a known meaning. The reading contract is the one the canvas probes,
 * because a cloze in a passage hides a written form and asks for its reading.
 *
 * Both answer sets are read off the seed entry the learner's capture resolved
 * to, never typed here. That is the same rule the demonstration command follows
 * (`SeedEvidenceDemonstrationCommand`): a screen may *read* the dataset, and may
 * not assert a lexical fact of its own. It also means the contracts now follow
 * whichever word the learner promoted instead of only ever describing 分岐.
 */
function contractsFor(
  context: DomainContext,
  lexeme: SeedLexeme,
  componentId: string,
  established: ReadonlySet<string>,
): readonly DomainEvent[] {
  const readingContractId = readingContractIdFor(lexeme);
  const meaningContractId = meaningContractIdFor(lexeme);

  // Both events pin their `eventId` and `idempotencyKey` to the contract id, so
  // minting one the log already holds would put two events under one key that
  // differ in `occurredAt` — the exact `IdempotencyConflictError` shape replay
  // refuses. That was unreachable while sessions wrote nothing durable; now that
  // a sitting's contracts are persisted, the second sitting after a reload finds
  // them already there and must not mint them again (WP-10).
  const wanted: readonly string[] = [readingContractId, meaningContractId];
  if (wanted.every((id) => established.has(id))) return [];

  const reading: ContractCreatedEvent = createTargetContract(
    context,
    {
      contractId: readingContractId,
      contractVersion: 1,
      targetComponentId: componentId,
      skill: 'orthography_to_reading',
      cueModality: 'text',
      responseModality: 'text',
      acceptedAnswers: [lexeme.reading],
      hintPolicy: { hintsAllowed: true, maxHints: 1 },
      revealPolicy: { revealAllowed: true, revealIsRecorded: true },
      promptFamilyVersion: 'pf-wp08.1',
    },
    // The event id is pinned, not generated. Two bootstraps of the same store —
    // a re-render, a StrictMode double invocation — would otherwise produce two
    // events claiming one key, which is the `IdempotencyConflictError` shape
    // replay exists to refuse. Pinning it also makes the session's log
    // byte-reproducible, which the screenshot evidence depends on.
    { idempotencyKey: `contract:${readingContractId}`, eventId: `ev-${readingContractId}` },
  );

  const meaning: ContractCreatedEvent = createTargetContract(
    context,
    {
      contractId: meaningContractId,
      contractVersion: 1,
      targetComponentId: componentId,
      skill: 'form_to_meaning',
      cueModality: 'text',
      responseModality: 'text',
      acceptedAnswers: [...lexeme.senses],
      hintPolicy: { hintsAllowed: true, maxHints: 1 },
      revealPolicy: { revealAllowed: true, revealIsRecorded: true },
      promptFamilyVersion: 'pf-wp08.1',
    },
    { idempotencyKey: `contract:${meaningContractId}`, eventId: `ev-${meaningContractId}` },
  );

  // Filtered rather than short-circuited above, so a log holding one of the pair
  // (a partial write, an interrupted first sitting) gains the missing one instead
  // of neither.
  return [reading, meaning].filter((event) => !established.has(event.contractId));
}

/** Contract ids a `ContractCreated` in this log has already established. */
function establishedContractIds(log: readonly DomainEvent[]): ReadonlySet<string> {
  return new Set(
    log
      .filter((event): event is ContractCreatedEvent => event.type === 'ContractCreated')
      .map((event) => event.contractId),
  );
}

/**
 * The seed entry a thread is about, or `null`.
 *
 * `lexemeId` is the app-local link the capture screen recorded. A thread
 * rehydrated from the durable log may have lost it (the event carries the
 * learner's text, not a dictionary row), so the headword is the fallback — the
 * exact match `app-context.tsx` uses for the same reason and with the same
 * reservation: fuzzier matching would attach a session to a *different* word
 * than the one the learner promoted.
 */
function seedEntryFor(thread: ThreadView): SeedLexeme | null {
  if (thread.lexemeId !== null) {
    const byId = findLexemeById(thread.lexemeId);
    if (byId !== null) return byId;
  }
  return findLexemeByHeadword(thread.displayText);
}

interface ChosenTarget {
  readonly thread: ThreadView;
  readonly lexeme: SeedLexeme;
  readonly passage: SeedPassage;
  readonly componentId: string;
  readonly capture: EncounterCapturedEvent;
}

/**
 * Which of the learner's threads this sitting is about.
 *
 * Newest first, and only threads on a promotion rung that activates contracts
 * (REQ-DM-09: `captured` and `keep` schedule nothing, so a session over one
 * would be a session whose every observation the gate refuses). A thread with no
 * seed entry, or one whose entry the hand-written passage does not embed, is
 * skipped rather than made into a canvas-less session — controller §8 ships
 * exactly one passage, and a session step that opens a passage the target is not
 * in would be the screen asserting a relation the seed does not hold.
 *
 * `componentId` comes from the kernel's own derivation over the capture event,
 * not from the headword: the gate links a contract to a thread through exactly
 * that id, and a locally re-derived one that disagreed would produce contracts
 * the gate refuses for a reason no screen could explain.
 */
function chooseSessionTarget(
  threads: readonly ThreadView[],
  log: readonly DomainEvent[],
  preferredThreadId?: string | undefined,
): ChosenTarget | null {
  const preferred =
    preferredThreadId === undefined
      ? []
      : threads.filter((thread) => thread.state.threadId === preferredThreadId);
  const ordered = [
    ...preferred,
    ...threads.filter((thread) => thread.state.threadId !== preferredThreadId),
  ];

  for (const thread of ordered) {
    if (!isPromotionActive(thread.state.promotion)) continue;

    const lexeme = seedEntryFor(thread);
    if (lexeme === null) continue;

    const passage = passageForLexeme(lexeme.id);
    if (passage === null) continue;

    const capture = log.find(
      (event): event is EncounterCapturedEvent =>
        event.type === 'EncounterCaptured' && event.threadId === thread.state.threadId,
    );
    if (capture === undefined) continue;

    return {
      thread,
      lexeme,
      passage,
      componentId: componentIdOfEncounter(capture),
      capture,
    };
  }
  return null;
}

type DurableContractSelection =
  | { readonly kind: 'absent' }
  | {
      readonly kind: 'ready';
      readonly contracts: readonly ContractCreatedEvent[];
      readonly readingContractId: string;
    }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Read the Learn pair through the domain's source-lineage projection.
 *
 * A contract merely sharing a component string is not enough. Every existing
 * contract for that component must bind to the selected durable thread, and the
 * two required skills must both be present. Once any contract exists, missing
 * or ambiguous lineage fails closed rather than falling back to a locally
 * invented replacement pair.
 */
function durableContractsFor(
  log: readonly DomainEvent[],
  chosen: ChosenTarget,
): DurableContractSelection {
  const contracts = log.filter(
    (event): event is ContractCreatedEvent =>
      event.type === 'ContractCreated' && event.targetComponentId === chosen.componentId,
  );
  if (contracts.length === 0) return { kind: 'absent' };

  for (const contract of contracts) {
    const bound = bindRetrievalContract(log, contract.contractId);
    if (!bound.bound) {
      return {
        kind: 'failed',
        message: `Contract ${contract.contractId} lineage failed closed: ${bound.failure.reason}.`,
      };
    }
    if (bound.value.threadId !== chosen.thread.state.threadId) {
      return {
        kind: 'failed',
        message: `Contract ${contract.contractId} belongs to thread ${bound.value.threadId}, not the requested thread.`,
      };
    }
  }

  const reading = [...contracts]
    .reverse()
    .find((contract) => contract.skill === 'orthography_to_reading');
  const meaning = contracts.some((contract) => contract.skill === 'form_to_meaning');
  if (reading === undefined || !meaning) {
    return {
      kind: 'failed',
      message:
        'The durable Learn pair is incomplete. Reading and meaning must both exist before a sitting can use either.',
    };
  }
  return { kind: 'ready', contracts, readingContractId: reading.contractId };
}

export interface SessionBootstrap {
  readonly workspace: SessionWorkspaceState;
  readonly target: SessionTarget | null;
  readonly error: string | null;
}

/**
 * Everything the session needs, built once, with no React anywhere in it.
 *
 * Exported so the whole loop — plan, canvas, repair — can be driven from a test
 * without a renderer. That is not a convenience: this project has no React
 * Native test renderer installed, so a behaviour that only existed inside a
 * component would be unverifiable, and an unverifiable behaviour is one that
 * gets claimed rather than shown.
 *
 * **It appends nothing.** `store` is read through `readAll()` and
 * `getSnapshot()` and is never `execute`d — see this file's header for the
 * defect that rule closes. `test/session-canvas.test.ts` asserts the event count
 * of a durable store is unchanged across a bootstrap, because the rule is the
 * kind that a comment cannot hold.
 */
export function bootstrapSessionWorkspace(
  store: AppStore,
  context: DomainContext,
  preferredThreadId?: string | undefined,
): SessionBootstrap {
  const log = store.readAll();
  const chosen = chooseSessionTarget(store.getSnapshot().threads, log, preferredThreadId);

  if (chosen === null) {
    return {
      workspace: createSessionWorkspace(log),
      target: null,
      error: NO_PROMOTED_TARGET_NOTE,
    };
  }

  const durable = durableContractsFor(log, chosen);
  if (durable.kind === 'failed') {
    return {
      workspace: createSessionWorkspace(log),
      target: null,
      error: durable.message,
    };
  }

  // Compatibility for existing callers that still perform the old explicit
  // promotion command. The A1 source route never reaches this branch: its Learn
  // gesture already put the immutable pair in the canonical log, and the
  // equality asserted below is what makes that distinction falsifiable.
  const compatibilityContracts =
    durable.kind === 'absent'
      ? contractsFor(context, chosen.lexeme, chosen.componentId, establishedContractIds(log))
      : [];
  const contracts =
    durable.kind === 'ready'
      ? durable.contracts
      : compatibilityContracts.filter(
          (event): event is ContractCreatedEvent => event.type === 'ContractCreated',
        );
  const readingContractId =
    durable.kind === 'ready'
      ? durable.readingContractId
      : (contracts.find((contract) => contract.skill === 'orthography_to_reading')?.contractId ??
        readingContractIdFor(chosen.lexeme));

  return {
    workspace: createSessionWorkspace([...log, ...compatibilityContracts]),
    target: {
      lexeme: chosen.lexeme,
      passage: chosen.passage,
      componentId: chosen.componentId,
      threadId: chosen.thread.state.threadId,
      probeContractId: readingContractId,
      contractLabels:
        contracts.length === 0
          ? contractLabelsFor(chosen.lexeme)
          : contractLabelsForEvents(chosen.lexeme, contracts),
    },
    error: null,
  };
}

/**
 * Carry everything the workspace has produced but the store has not seen (WP-10).
 *
 * The whole of the durable-session join, in one exported function so that the
 * hook and the tests run the *same* code. It used to live inside
 * `useOwnSessionLoop`'s callback, which meant a test could only re-implement it
 * — and a re-implementation that persisted correctly while the hook did not
 * would have been green over the exact defect this lane exists to close.
 *
 * ## Why "not yet persisted" rather than "what this command appended"
 *
 * `bootstrapSessionWorkspace` mints the sitting's two `ContractCreated` events
 * before any gesture. Writing them at bootstrap would put events in the learner's
 * durable log for merely opening the Session tab — the fabrication the WP-10
 * repair round removed and that definition-of-done §2 item 6 names. Carrying
 * whatever is outstanding on the first *dispatch* means they are written by the
 * gesture that made them true: the learner starting the sitting.
 *
 * ## Why the id set is load-bearing rather than an optimisation
 *
 * The workspace log opens as a copy of the store's, and after a reload those
 * events came back across JSON — they are parsed, not minted, so
 * `sealMintedEvents` refuses them (correctly: the persist path is for events this
 * process minted, and the adapter is already the authority on its own bytes).
 * Filtering by id is what keeps this pointed only at the new ones.
 *
 * @param persisted Ids already in the store. **Mutated**: every carried event's
 *   id is added, so the caller keeps one set across a sitting.
 * @returns the events this call carried, in log order. Empty is the normal
 *   answer for a command that appended nothing (a skip, a repeated tap).
 */
export function persistWorkspaceEvents(
  store: AppStore,
  workspace: SessionWorkspaceState,
  persisted: Set<string>,
): readonly DomainEvent[] {
  const fresh = workspace.log.filter((event) => !persisted.has(event.eventId));
  if (fresh.length === 0) return [];
  for (const event of fresh) persisted.add(event.eventId);
  // `sealMintedEvents` is the kernel's check that every one of these came out of
  // its own minters unaltered; `persistMinted` re-checks on open. Neither is a
  // formality — see `AppStore.persistMinted`.
  store.persistMinted(sealMintedEvents(fresh));
  return fresh;
}

/** The store's event ids, as the set {@link persistWorkspaceEvents} expects. */
export function persistedEventIds(store: AppStore): Set<string> {
  return new Set(store.readAll().map((event: DomainEvent) => event.eventId));
}

/**
 * The one probe this canvas may offer, read out of the ledger.
 *
 * Rebuilt from the log on every read — including the thread's promotion state
 * *now* — so demoting the thread mid-session withdraws the probe instead of
 * leaving a stale offer on screen that the gate would then refuse. Returns
 * `null` rather than a degraded offer when anything is missing: a canvas with no
 * probe is a canvas where everything is exposure, which is a correct state.
 */
export function probeOfferFor(
  state: SessionWorkspaceState,
  target: SessionTarget | null,
): CanvasProbeOffer | null {
  if (target === null) return null;

  const created = state.log.find(
    (event) => event.type === 'ContractCreated' && event.contractId === target.probeContractId,
  );
  if (created === undefined || created.type !== 'ContractCreated') return null;

  const thread = state.derived.threads.find((entry) => entry.threadId === target.threadId);
  if (thread === undefined) return null;

  return canvasProbeOffer(retrievalContractFromEvent(created).contract, {
    threadId: thread.threadId,
    promotion: thread.promotion,
  });
}

/**
 * The workspace a navigator may hand down, so several screens share one session.
 *
 * Declared here rather than in `session-workspace.tsx` for one reason: that file
 * renders the provider and therefore imports this one, and putting the context
 * object there too would make the import cycle back. The provider is the only
 * thing that needs JSX; a context object does not.
 */
export const SessionWorkspaceContext = createContext<SessionLoop | null>(null);

/**
 * Build a workspace of this screen's own.
 *
 * Exported for the provider, which needs the un-shared version — asking for the
 * shared one from inside the thing that provides it would be a cycle.
 */
export function useOwnSessionLoop(options: SessionLoopOptions): SessionLoop {
  const contextStore = useAppStore();
  const store = options.store ?? contextStore;
  const { context, onEvents, preferredThreadId } = options;

  const [initial] = useState<SessionBootstrap>(() =>
    bootstrapSessionWorkspace(store, context, preferredThreadId),
  );
  const [state, setState] = useState<SessionWorkspaceState>(initial.workspace);

  /**
   * The current workspace, readable synchronously.
   *
   * The command is applied here rather than inside a `setState` updater, because
   * the durable write is a side effect and React may invoke an updater twice
   * (StrictMode) or discard its result. Applying once, outside, and then setting
   * the result is the version where "the log grew by these events" is a fact
   * rather than a hope.
   */
  const workspace = useRef<SessionWorkspaceState>(initial.workspace);

  /** Ids the store already holds. See {@link persistWorkspaceEvents}. */
  const persisted = useRef<Set<string>>(persistedEventIds(store));

  const dispatch = useCallback(
    (command: SessionCommand) => {
      const previous = workspace.current;
      const next = applySessionCommand(context, previous, command);
      workspace.current = next;
      setState(next);
      const carried = persistWorkspaceEvents(store, next, persisted.current);
      if (carried.length > 0) onEvents?.(carried);
    },
    [context, onEvents, store],
  );

  const offer = useMemo<CanvasProbeOffer | null>(
    () => probeOfferFor(state, initial.target),
    [initial.target, state],
  );

  const now = useCallback(() => context.clock.now(), [context]);

  return { state, target: initial.target, offer, dispatch, now, error: initial.error };
}

/**
 * The workspace this screen should use: the shared one if a navigator provided
 * it, otherwise one of its own.
 *
 * The fallback is built unconditionally rather than behind an `if`, so the hook
 * call order is the same on every render whatever is above the screen. It costs
 * one extra bootstrap when a provider is present, and that costs nothing:
 * `bootstrapSessionWorkspace` is a pure read of the store, so the second one
 * appends nothing, observes nothing, and the workspace it builds is discarded.
 */
export function useSessionLoop(options: SessionLoopOptions): SessionLoop {
  const shared = useContext(SessionWorkspaceContext);
  const own = useOwnSessionLoop(options);
  return shared ?? own;
}

/** The marks the canvas is willing to make interactive, from the seed alone. */
export function passageMarks(target: SessionTarget): readonly PassageMark[] {
  const others = target.passage.lexemeIds
    .filter((id) => id !== target.lexeme.id)
    .map((id) => seedDataset.lexemes.find((entry) => entry.id === id))
    .filter((entry): entry is SeedLexeme => entry !== undefined)
    .map((entry) => ({
      form: entry.headword,
      componentId: componentIdForTargetKey(entry.headword),
      isTarget: false,
      reading: entry.reading,
      gloss: entry.senses[0],
    }));

  return [
    {
      form: target.lexeme.headword,
      componentId: target.componentId,
      isTarget: true,
      reading: target.lexeme.reading,
      gloss: target.lexeme.senses[0],
    },
    ...others,
  ];
}

/** The most recent miss the repair branch could open on, or `null`. */
export function stumbleIn(state: SessionWorkspaceState): ReturnType<typeof latestStumble> {
  return latestStumble(state);
}
