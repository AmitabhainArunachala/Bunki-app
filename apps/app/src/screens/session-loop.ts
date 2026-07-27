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
 *   - the `AppStore`'s own log — the captured target and its promotion, written
 *     by the same capture path screen 1 uses, so the session plans over the
 *     learner's real thread rather than a fixture pretending to be one;
 *   - the retrieval contracts for that target, minted here because nothing in
 *     the loop had created one yet. `@bunki/persistence` is not wired into
 *     `apps/app` in this wave (controller §5 lint boundary 2, and the W4
 *     cross-lane rule), so the joined log lives in this hook for now and is
 *     handed back through `onEvents` for the WP-10 integration to append. That
 *     is a recorded seam, not a hidden one — see `SESSION_INTEGRATION_NOTE`.
 *
 * ## Why bootstrapping during a state initialiser is safe here
 *
 * `AppStore.execute` is idempotent by content: the same capture and the same
 * promotion produce the same key and append nothing the second time. React may
 * invoke a `useState` initialiser twice (StrictMode does, deliberately), and
 * that is exactly the double-tap case the store's idempotency was built for. A
 * bootstrap that appended twice would be a defect the store already prevents.
 */

import { useCallback, useMemo, useState } from 'react';

import {
  applySessionCommand,
  canvasProbeOffer,
  componentIdForTargetKey,
  createSessionWorkspace,
  createTargetContract,
  latestStumble,
  retrievalContractFromEvent,
  type CanvasProbeOffer,
  type ContractCreatedEvent,
  type DomainContext,
  type DomainEvent,
  type SessionCommand,
  type SessionWorkspaceState,
} from '@bunki/domain';

import {
  DEFAULT_CANONICAL_TARGET,
  findLexemeByHeadword,
  passageForLexeme,
  seedDataset,
  type SeedLexeme,
  type SeedPassage,
} from '../data/catalog.ts';
import { useAppStore } from '../state/app-context.tsx';
import type { AppStore } from '../state/store.ts';
import type { PassageMark } from './canvas-passage.ts';

/**
 * The one integration seam this work package leaves open, stated where it
 * cannot be lost.
 */
export const SESSION_INTEGRATION_NOTE =
  'Session and canvas events are held in this screen’s workspace for the session, alongside the AppStore’s own log. Joining the two into one durable log is the WP-10 integration step (coordination request COORD-B8-2); nothing here claims otherwise.';

/** How the seeded encounter is labelled when the session bootstraps it. */
const SOURCE_REF = {
  sourceId: 'seed-passage',
  kind: 'text',
  locator: 'packages/seed/data/passages.json',
} as const;

const PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

const READING_CONTRACT_ID = 'contract-reading-bunki';
const MEANING_CONTRACT_ID = 'contract-meaning-bunki';

export interface SessionTarget {
  readonly lexeme: SeedLexeme;
  readonly passage: SeedPassage;
  readonly componentId: string;
  readonly threadId: string;
  /** The contract the canvas may probe: reading, for the seeded target. */
  readonly probeContractId: string;
}

export interface SessionLoopOptions {
  /** Injected so the screenshot harness and tests can pin time and ids. */
  readonly context: DomainContext;
  readonly store?: AppStore | undefined;
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
 * Build the two contracts for the seeded target.
 *
 * Two, not one, and that is REQ-DM-05 and T-05 rather than thoroughness:
 * meaning and reading are *distinct* contracts, so a missed reading cannot
 * erase a known meaning. The reading contract is the one the canvas probes,
 * because a cloze in a passage hides a written form and asks for its reading.
 */
function contractsFor(context: DomainContext, componentId: string): readonly DomainEvent[] {
  const reading: ContractCreatedEvent = createTargetContract(
    context,
    {
      contractId: READING_CONTRACT_ID,
      contractVersion: 1,
      targetComponentId: componentId,
      skill: 'orthography_to_reading',
      cueModality: 'text',
      responseModality: 'text',
      acceptedAnswers: ['ぶんき'],
      hintPolicy: { hintsAllowed: true, maxHints: 1 },
      revealPolicy: { revealAllowed: true, revealIsRecorded: true },
      promptFamilyVersion: 'pf-wp08.1',
    },
    // The event id is pinned, not generated. Bootstrapping is idempotent by
    // key already, but a fresh `eventId` on every call would make two
    // bootstraps of the same store produce two events claiming one key — the
    // `IdempotencyConflictError` shape replay exists to refuse. Pinning it also
    // makes the whole seeded log byte-reproducible, which the screenshot
    // evidence depends on.
    { idempotencyKey: `contract:${READING_CONTRACT_ID}`, eventId: `ev-${READING_CONTRACT_ID}` },
  );

  const meaning: ContractCreatedEvent = createTargetContract(
    context,
    {
      contractId: MEANING_CONTRACT_ID,
      contractVersion: 1,
      targetComponentId: componentId,
      skill: 'form_to_meaning',
      cueModality: 'text',
      responseModality: 'text',
      acceptedAnswers: ['branching', 'fork', 'divergence'],
      hintPolicy: { hintsAllowed: true, maxHints: 1 },
      revealPolicy: { revealAllowed: true, revealIsRecorded: true },
      promptFamilyVersion: 'pf-wp08.1',
    },
    { idempotencyKey: `contract:${MEANING_CONTRACT_ID}`, eventId: `ev-${MEANING_CONTRACT_ID}` },
  );

  return [reading, meaning];
}

export interface SessionBootstrap {
  readonly workspace: SessionWorkspaceState;
  readonly target: SessionTarget | null;
  readonly error: string | null;
}

/**
 * Everything the session needs, built once, with no React anywhere in it.
 *
 * Exported so the whole loop — capture, promotion, contracts, plan, canvas,
 * repair — can be driven from a test without a renderer. That is not a
 * convenience: this project has no React Native test renderer installed, so a
 * behaviour that only existed inside a component would be unverifiable, and an
 * unverifiable behaviour is one that gets claimed rather than shown.
 */
export function bootstrapSessionWorkspace(
  store: AppStore,
  context: DomainContext,
): SessionBootstrap {
  const lexeme = findLexemeByHeadword(DEFAULT_CANONICAL_TARGET);
  const passage = lexeme === null ? null : passageForLexeme(lexeme.id);

  if (lexeme === null || passage === null) {
    return {
      workspace: createSessionWorkspace([]),
      target: null,
      error: `The Phase-0 seed has no passage for ${DEFAULT_CANONICAL_TARGET}, so there is nothing to run a session over.`,
    };
  }

  // The same capture path screen 1 uses, so this is the learner's own thread.
  const captured = store.execute({
    kind: 'capture',
    text: lexeme.headword,
    sourceRef: SOURCE_REF,
    provenance: PROVENANCE,
    uncertainty: null,
    lexemeId: lexeme.id,
  });
  store.execute({ kind: 'promote', threadId: captured.threadId, to: 'learn' });

  const componentId = componentIdForTargetKey(lexeme.headword);
  const log = [...store.readAll(), ...contractsFor(context, componentId)];

  return {
    workspace: createSessionWorkspace(log),
    target: {
      lexeme,
      passage,
      componentId,
      threadId: captured.threadId,
      probeContractId: READING_CONTRACT_ID,
    },
    error: null,
  };
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

export function useSessionLoop(options: SessionLoopOptions): SessionLoop {
  const contextStore = useAppStore();
  const store = options.store ?? contextStore;
  const { context, onEvents } = options;

  const [initial] = useState<SessionBootstrap>(() => bootstrapSessionWorkspace(store, context));
  const [state, setState] = useState<SessionWorkspaceState>(initial.workspace);

  const dispatch = useCallback(
    (command: SessionCommand) => {
      setState((previous) => {
        const next = applySessionCommand(context, previous, command);
        if (onEvents !== undefined && next.log.length > previous.log.length) {
          onEvents(next.log.slice(previous.log.length));
        }
        return next;
      });
    },
    [context, onEvents],
  );

  const offer = useMemo<CanvasProbeOffer | null>(
    () => probeOfferFor(state, initial.target),
    [initial.target, state],
  );

  const now = useCallback(() => context.clock.now(), [context]);

  return { state, target: initial.target, offer, dispatch, now, error: initial.error };
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
