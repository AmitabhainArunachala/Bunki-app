/** A1 golden-source authority and reload contract. */

import { describe, expect, it } from 'vitest';

import {
  applySessionCommand,
  bindRetrievalContract,
  createDeterministicContext,
  currentStep,
  type DomainContext,
  type DomainEvent,
  type EncounterCapturedEvent,
} from '@bunki/domain';

import {
  GOLDEN_LOOKUP_ID,
  findGoldenSourceCapture,
  goldenCaptureCommand,
  goldenContractIds,
  goldenLearnCommand,
  goldenLookupCommand,
  goldenSourceStudy,
} from '../src/data/golden-source.ts';
import {
  bootstrapSessionWorkspace,
  persistedEventIds,
  persistWorkspaceEvents,
} from '../src/screens/session-loop.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import type { AppStore } from '../src/state/store.ts';

const INSTANTS = Array.from(
  { length: 80 },
  (_value, index) =>
    `2026-08-09T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
);

function harness(prefix: string): { readonly context: DomainContext; readonly store: AppStore } {
  const context = createDeterministicContext({ instants: INSTANTS, idPrefix: prefix });
  return { context, store: createMemoryAppStore({ context }) };
}

function keepExactSource(store: AppStore): string {
  const captured = store.execute(goldenCaptureCommand());
  const thread = store.getSnapshot().threadsById[captured.threadId];
  if (thread?.state.promotion === 'captured') {
    store.execute({ kind: 'promote', threadId: captured.threadId, to: 'keep' });
  }
  return captured.threadId;
}

describe('the real 静かな朝 source adapter', () => {
  it('pins the exact 自分 span and carries the complete source authority', () => {
    const study = goldenSourceStudy();
    const command = goldenCaptureCommand();

    expect(study.source.title).toBe('静かな朝');
    expect(study.anchor).toMatchObject({ start: 283, end: 285, lexemeId: 'lex-jibun' });
    expect(study.source.body.slice(study.anchor.start, study.anchor.end)).toBe('自分');
    expect(command.text).toBe(study.source.body);
    expect(command.span).toEqual({ start: 283, end: 285 });
    expect(command.sourceRef).toEqual({
      sourceId: 'source-bunki-graded-n5-morning',
      kind: 'text',
      locator: 'anchor:anchor-jibun-01',
    });
    expect(command.lexemeId).toBe('lex-jibun');
    expect(command.provenance).toMatchObject({
      license: study.source.provenance.body.license,
      modificationStatus: 'unmodified',
      reviewStatus: 'user_reviewed',
    });
  });

  it('does not treat an unrelated 自分 encounter as the authored source capture', () => {
    const { store } = harness('golden-authority-');
    const unrelated = store.execute({
      kind: 'capture',
      text: '自分',
      sourceRef: { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' },
      provenance: {
        source: 'user_encounter',
        license: 'user_owned',
        modificationStatus: 'unmodified',
        reviewStatus: 'unreviewed',
      },
      uncertainty: null,
      lexemeId: 'lex-jibun',
    });

    expect(findGoldenSourceCapture(store.readAll())).toBeNull();

    const exact = store.execute(goldenCaptureCommand());
    expect(exact.threadId).toBe(unrelated.threadId);
    expect(findGoldenSourceCapture(store.readAll())).toMatchObject({
      threadId: unrelated.threadId,
      text: goldenSourceStudy().source.body,
      span: { start: 283, end: 285 },
      sourceRef: { sourceId: 'source-bunki-graded-n5-morning' },
    });
  });

  it('supplies a stable, versioned reading + meaning pair from seed data', () => {
    const study = goldenSourceStudy();
    const learned = goldenLearnCommand('thread-source-1');
    const identities = goldenContractIds('thread-source-1');

    expect(learned).toMatchObject({ kind: 'activateLearn', userAction: true });
    expect(learned.specification).toMatchObject({
      specificationId: 'bunki:a1:source-bunki-graded-n5-morning:anchor-jibun-01:lex-jibun',
      specificationVersion: 1,
      reading: {
        gradingMethod: { kind: 'accepted_answers', acceptedAnswers: [study.lexeme.reading] },
      },
      meaning: {
        gradingMethod: { kind: 'accepted_answers', acceptedAnswers: study.lexeme.senses },
      },
    });
    expect(identities.reading.contractId).toContain(':orthography_to_reading');
    expect(identities.meaning.contractId).toContain(':form_to_meaning');
    expect(goldenContractIds('thread-source-1')).toEqual(identities);
  });
});

describe('the golden-source command loop', () => {
  it('records a quick look without a grade or any FSRS transition', () => {
    const { store } = harness('golden-lookup-');
    const before = store.readDerived().memoryStates;

    const first = store.execute(goldenLookupCommand());
    const repeat = store.execute(goldenLookupCommand());
    const lookup = store.readAll().find((event) => event.type === 'LookupFrictionLogged');

    expect(first.events).toHaveLength(1);
    expect(repeat).toMatchObject({ deduplicated: true, events: [] });
    expect(lookup).toMatchObject({
      idempotencyKey: `lookup-friction:${encodeURIComponent(GOLDEN_LOOKUP_ID)}`,
      targetRef: { targetType: 'lexeme', targetId: 'lex-jibun' },
      context: 'reading',
    });
    expect(lookup).not.toHaveProperty('grade');
    expect(lookup).not.toHaveProperty('tier');
    expect(store.readDerived().memoryStates).toEqual(before);
  });

  it('keeps exact source lineage, activates only on Learn, and reloads idempotently', () => {
    const { store } = harness('golden-learn-');
    const threadId = keepExactSource(store);

    expect(store.getSnapshot().threadsById[threadId]?.displayText).toBe('自分');
    expect(store.readDerived().memoryStates).toEqual([]);
    expect(store.readAll().filter((event) => event.type === 'ContractCreated')).toEqual([]);

    const learned = store.execute(goldenLearnCommand(threadId));
    expect(learned.events.map((event) => event.type)).toEqual([
      'ThreadPromotionChanged',
      'ContractCreated',
      'ContractCreated',
    ]);

    const ids = goldenContractIds(threadId);
    for (const contractId of [ids.reading.contractId, ids.meaning.contractId]) {
      const bound = bindRetrievalContract(store.readAll(), contractId);
      expect(bound).toMatchObject({
        bound: true,
        value: {
          threadId,
          targetText: '自分',
          sourceRef: { sourceId: 'source-bunki-graded-n5-morning' },
          span: { start: 283, end: 285 },
          gradingMethod: { kind: 'accepted_answers' },
        },
      });
    }

    const reloaded = createMemoryAppStore({
      context: createDeterministicContext({ instants: INSTANTS, idPrefix: 'golden-reload-' }),
      initialEvents: store.readAll(),
    });
    const repeated = reloaded.execute(goldenLearnCommand(threadId));
    expect(repeated).toMatchObject({ deduplicated: true, events: [] });
    expect(reloaded.readAll()).toEqual(store.readAll());
    expect(reloaded.readDerived().memoryStates).toHaveLength(2);
  });

  it('plans and grades from the durable Learn contracts without minting replacements', () => {
    const { context, store } = harness('golden-session-');
    const threadId = keepExactSource(store);
    store.execute(goldenLearnCommand(threadId));
    const durableBeforeSession = store.readAll();

    const boot = bootstrapSessionWorkspace(store, context, threadId);
    expect(boot.error).toBeNull();
    expect(boot.target?.threadId).toBe(threadId);
    expect(boot.target?.lexeme.headword).toBe('自分');
    expect(boot.target?.passage.title).toBe('分かれた道');
    expect(boot.workspace.log).toEqual(durableBeforeSession);

    let workspace = applySessionCommand(context, boot.workspace, {
      kind: 'start',
      timeBudgetMin: 12,
      newBudget: 2,
      canvasId: boot.target?.passage.id,
      asOf: '2026-08-09T01:00:00.000Z',
      labelByContract: boot.target?.contractLabels,
    });
    const composedCount = workspace.runtime?.plan.stepCount ?? 0;
    expect(composedCount).toBeGreaterThanOrEqual(3);
    expect(currentStep(workspace.runtime!)).toMatchObject({ kind: 'new' });

    workspace = applySessionCommand(context, workspace, {
      kind: 'answerStep',
      attempt: {
        grade: 'good',
        latencyMs: 1_200,
        hintsUsed: 0,
        revealedBeforeRecall: false,
      },
    });
    persistWorkspaceEvents(store, workspace, persistedEventIds(store));

    const graded = store.readAll().find((event) => event.type === 'ReviewGraded');
    expect(graded).toMatchObject({ grade: 'good', tier: 'A', probeContext: 'standalone' });
    const decision = store
      .readDerived()
      .gateDecisions.find((candidate) => candidate.eventId === graded?.eventId);
    expect(decision?.admitted).toBe(true);
    const memory = store
      .readDerived()
      .memoryStates.find((candidate) => candidate.contractId === graded?.contractId);
    expect(memory).toMatchObject({ reps: 1, active: true });
    expect(workspace.runtime?.plan.stepCount).toBe(composedCount);
  });

  it('never lets a later encounter repair missing contract ancestry', () => {
    const { context, store } = harness('golden-adversarial-');
    const threadId = keepExactSource(store);
    store.execute(goldenLearnCommand(threadId));
    const events = store.readAll();
    const contract = events.find((event) => event.type === 'ContractCreated');
    const origin = events.find(
      (event): event is EncounterCapturedEvent => event.type === 'EncounterCaptured',
    );
    expect(contract).toBeDefined();
    expect(origin).toBeDefined();
    if (contract === undefined || origin === undefined) return;

    const reordered: readonly DomainEvent[] = [
      ...events.filter((event) => event.type === 'ContractCreated'),
      ...events.filter((event) => event.type !== 'ContractCreated'),
    ];
    expect(bindRetrievalContract(reordered, contract.contractId)).toMatchObject({
      bound: false,
      failure: { reason: 'contract_precedes_origin' },
    });
    const corrupted = createMemoryAppStore({ context, initialEvents: reordered });
    const boot = bootstrapSessionWorkspace(corrupted, context, threadId);
    expect(boot.target).toBeNull();
    expect(boot.error).toContain('contract_precedes_origin');
  });
});
