/**
 * One contract-creation lineage (RENKAN R4-A, P1-18).
 *
 * Until R4-A the app had two: the golden route's validated `activateLearn`
 * (kernel `createLearnContractPair`, deterministic
 * `contract:learn:<thread>:<spec>:v<n>:<skill>` ids) and a session-bootstrap
 * "compatibility" mint (`createTargetContract` twice, hand-built
 * `contract-reading-<lexeme>` / `contract-meaning-<lexeme>` ids). These probes
 * pin the unification from both sides and are written to *convict a reverted
 * build*: every assertion on the id shape below fails against the
 * pre-unification mint.
 *
 * The migration story is pinned too, because it is behaviour rather than
 * documentation: a durable log already holding the old-shaped pair keeps it —
 * append-only history, and the FSRS ancestry attached to those ids — while a
 * legacy thread with no contracts at all gains the unified pair on its first
 * sitting. No schema changed; ADR-002 needed no amendment.
 */

import { describe, expect, it } from 'vitest';

import {
  componentIdOfEncounter,
  createDeterministicContext,
  createTargetContract,
  learnContractIdentity,
  type ContractCreatedEvent,
  type DomainContext,
  type DomainEvent,
  type EncounterCapturedEvent,
} from '@bunki/domain';

import { findLexemeByHeadword } from '../src/data/catalog.ts';
import {
  learnSpecificationForLexeme,
  seedEntryForThread,
  seedLearnCommand,
} from '../src/data/learn-specification.ts';
import { bootstrapSessionWorkspace } from '../src/screens/session-loop.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import type { AppStore } from '../src/state/store.ts';

const INSTANTS = Array.from(
  { length: 120 },
  (_value, index) =>
    `2026-08-16T09:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
);

const MANUAL_SOURCE = {
  sourceId: 'manual-entry',
  kind: 'manual',
  locator: 'capture-screen',
} as const;
const MANUAL_PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

/** The shape the pre-unification compatibility mint produced. */
const REVERTED_ID_SHAPE = /^contract-(reading|meaning)-/;
/** The one unified shape every new contract now carries. */
const UNIFIED_ID_SHAPE = /^contract:learn:/;

function harness(prefix: string): { context: DomainContext; store: AppStore } {
  const context = createDeterministicContext({ instants: INSTANTS, idPrefix: prefix });
  return { context, store: createMemoryAppStore({ context }) };
}

function keep(store: AppStore, headword = '分岐'): string {
  const lexeme = findLexemeByHeadword(headword);
  if (lexeme === null) throw new Error(`no seed lexeme for ${headword}`);
  const kept = store.execute({
    kind: 'capture',
    text: lexeme.headword,
    sourceRef: MANUAL_SOURCE,
    provenance: MANUAL_PROVENANCE,
    uncertainty: null,
    lexemeId: lexeme.id,
  });
  store.execute({ kind: 'promote', threadId: kept.threadId, to: 'keep' });
  return kept.threadId;
}

const contractsIn = (log: readonly DomainEvent[]): readonly ContractCreatedEvent[] =>
  log.filter((event): event is ContractCreatedEvent => event.type === 'ContractCreated');

describe('the study gesture mints the validated pair, at the gesture (P1-18)', () => {
  it('take-up-for-study dispatches activateLearn and the pair lands with it', () => {
    const { store } = harness('lineage-gesture-');
    const threadId = keep(store);
    const thread = store.getSnapshot().threadsById[threadId];
    const entry = thread === undefined ? null : seedEntryForThread(thread);
    expect(entry?.id).toBe('lex-bunki');

    // The exact command the capture screen's button now dispatches.
    const ack = store.execute(seedLearnCommand(threadId, entry!));
    expect(ack.events.map((event) => event.type)).toEqual([
      'ThreadPromotionChanged',
      'ContractCreated',
      'ContractCreated',
    ]);
    expect(store.getSnapshot().threadsById[threadId]?.state.promotion).toBe('learn');

    // The ids are the kernel's deterministic derivation — the same one the
    // golden route uses — not the hand-built compatibility shape.
    const specification = learnSpecificationForLexeme(entry!);
    const minted = contractsIn(store.readAll());
    expect(minted.map((event) => event.contractId).sort()).toEqual(
      [
        learnContractIdentity(threadId, specification, 'orthography_to_reading').contractId,
        learnContractIdentity(threadId, specification, 'form_to_meaning').contractId,
      ].sort(),
    );
    for (const event of minted) {
      expect(event.contractId).toMatch(UNIFIED_ID_SHAPE);
      expect(event.contractId).not.toMatch(REVERTED_ID_SHAPE);
    }

    // Idempotent across a double tap, like every learner gesture.
    const repeat = store.execute(seedLearnCommand(threadId, entry!));
    expect(repeat).toMatchObject({ deduplicated: true, events: [] });
  });

  it('a sitting over the gesture-minted pair finds it durable and mints nothing', () => {
    const { context, store } = harness('lineage-ready-');
    const threadId = keep(store);
    const entry = seedEntryForThread(store.getSnapshot().threadsById[threadId]!)!;
    store.execute(seedLearnCommand(threadId, entry));
    const before = store.readAll();

    const boot = bootstrapSessionWorkspace(store, context, threadId);
    expect(boot.error).toBeNull();
    // The workspace log IS the store log: nothing was re-minted for the sitting.
    expect(boot.workspace.log).toEqual(before);
    expect(boot.target?.probeContractId).toBe(
      learnContractIdentity(threadId, learnSpecificationForLexeme(entry), 'orthography_to_reading')
        .contractId,
    );
    // Both minted contracts are labelled for the planner.
    expect([...boot.target!.contractLabels.keys()].sort()).toEqual(
      contractsIn(before)
        .map((event) => event.contractId)
        .sort(),
    );
  });
});

describe('the legacy migration path mints the same lineage (P1-18)', () => {
  it('a promote-only thread gains the unified pair at its first sitting', () => {
    const { context, store } = harness('lineage-migrate-');
    const threadId = keep(store);
    // The pre-unification flow: a bare promotion, no contracts anywhere.
    store.execute({ kind: 'promote', threadId, to: 'learn' });
    const before = store.readAll().length;

    const boot = bootstrapSessionWorkspace(store, context, threadId);
    expect(boot.error).toBeNull();
    // The store is untouched — the pair rides the workspace until the first
    // dispatch, exactly as before (writes-at-gesture, never at navigation).
    expect(store.readAll()).toHaveLength(before);

    const minted = contractsIn(boot.workspace.log);
    expect(minted).toHaveLength(2);
    const specification = learnSpecificationForLexeme(findLexemeByHeadword('分岐')!);
    expect(minted.map((event) => event.contractId).sort()).toEqual(
      [
        learnContractIdentity(threadId, specification, 'orthography_to_reading').contractId,
        learnContractIdentity(threadId, specification, 'form_to_meaning').contractId,
      ].sort(),
    );
    // The conviction line: a reverted build mints contract-reading-lex-bunki here.
    for (const event of minted) {
      expect(event.contractId).not.toMatch(REVERTED_ID_SHAPE);
      expect(event.contractId).toMatch(UNIFIED_ID_SHAPE);
    }
    expect(boot.target?.probeContractId).toMatch(UNIFIED_ID_SHAPE);
  });

  it('a durable log holding the old-shaped pair keeps it, ancestry and all', () => {
    // Forge yesterday's log: capture + promotions, then the exact events the
    // old compatibility mint produced — kernel-minted (createTargetContract is
    // the same factory it used), old ids, old prompt family.
    const { context, store } = harness('lineage-legacy-');
    const threadId = keep(store);
    store.execute({ kind: 'promote', threadId, to: 'learn' });
    const log = store.readAll();
    const capture = log.find(
      (event): event is EncounterCapturedEvent => event.type === 'EncounterCaptured',
    )!;
    const componentId = componentIdOfEncounter(capture);
    const lexeme = findLexemeByHeadword('分岐')!;

    const legacy = (['orthography_to_reading', 'form_to_meaning'] as const).map((skill) => {
      const contractId =
        skill === 'orthography_to_reading'
          ? `contract-reading-${lexeme.id}`
          : `contract-meaning-${lexeme.id}`;
      return createTargetContract(
        context,
        {
          contractId,
          contractVersion: 1,
          targetComponentId: componentId,
          skill,
          cueModality: 'text',
          responseModality: 'text',
          acceptedAnswers:
            skill === 'orthography_to_reading' ? [lexeme.reading] : [...lexeme.senses],
          hintPolicy: { hintsAllowed: true, maxHints: 1 },
          revealPolicy: { revealAllowed: true, revealIsRecorded: true },
          promptFamilyVersion: 'pf-wp08.1',
        },
        { idempotencyKey: `contract:${contractId}`, eventId: `ev-${contractId}` },
      );
    });

    const reloaded = createMemoryAppStore({
      context: createDeterministicContext({ instants: INSTANTS, idPrefix: 'lineage-legacy-2-' }),
      initialEvents: [...log, ...legacy],
    });

    const boot = bootstrapSessionWorkspace(reloaded, context, threadId);
    expect(boot.error).toBeNull();
    // Nothing minted: the sitting plans over the existing pair under its
    // original ids, so the memory state attached to them keeps its ancestry.
    expect(boot.workspace.log).toEqual(reloaded.readAll());
    expect(boot.target?.probeContractId).toBe(`contract-reading-${lexeme.id}`);
    expect([...boot.target!.contractLabels.keys()].sort()).toEqual(
      [`contract-meaning-${lexeme.id}`, `contract-reading-${lexeme.id}`].sort(),
    );
    // …and the labels are human, not raw ids, for both old-shape contracts.
    for (const label of boot.target!.contractLabels.values()) {
      expect(label).toContain(lexeme.headword);
    }
  });
});

describe('the two routes describe one specification (P1-18)', () => {
  it('derives stable, versioned, seed-read specifications', () => {
    const lexeme = findLexemeByHeadword('分岐')!;
    const specification = learnSpecificationForLexeme(lexeme);
    expect(specification).toMatchObject({
      specificationId: 'bunki:seed:lex-bunki',
      specificationVersion: 1,
      reading: {
        gradingMethod: { kind: 'accepted_answers', acceptedAnswers: [lexeme.reading] },
      },
      meaning: {
        gradingMethod: { kind: 'accepted_answers', acceptedAnswers: [...lexeme.senses] },
      },
    });
    // Deterministic: the same lexeme always derives the same specification.
    expect(learnSpecificationForLexeme(lexeme)).toEqual(specification);

    const command = seedLearnCommand('thread-x', lexeme);
    expect(command).toMatchObject({
      kind: 'activateLearn',
      userAction: true,
      threadId: 'thread-x',
    });
  });
});
