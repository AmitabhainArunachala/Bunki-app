/** KAIRO A1: source-exact capture, explicit Learn, and lookup authority. */

import { describe, expect, it } from 'vitest';

import {
  bindRetrievalContract,
  componentIdOfEncounter,
  createDeterministicContext,
  learnContractIdentity,
  parseEvent,
  type DomainContext,
  type DomainEvent,
  type EncounterCapturedEvent,
  type LearnContractPairSpecification,
} from '@bunki/domain';

import { createMemoryAppStore, targetKeyOf } from '../src/state/memory-store.ts';
import type { AppCommand, CaptureCommand } from '../src/state/store.ts';

const TARGET = '分岐';
const SOURCE = { sourceId: 'reader:golden', kind: 'text', locator: 'paragraph:7' } as const;
const PROVENANCE = {
  source: 'reader_fixture',
  sourceVersion: '2026-08-09',
  license: 'CC-BY-4.0',
  attribution: 'A1 fixture author',
  modificationStatus: 'unmodified',
  reviewStatus: 'user_reviewed',
} as const;

const LEARN_SPEC: LearnContractPairSpecification = {
  specificationId: 'reader:golden:lexeme-bunki',
  specificationVersion: 2,
  reading: {
    cueModality: 'text',
    responseModality: 'text',
    gradingMethod: { kind: 'accepted_answers', acceptedAnswers: ['ぶんき'] },
    hintPolicy: { hintsAllowed: true, maxHints: 1 },
    revealPolicy: { revealAllowed: true, revealIsRecorded: true },
    promptFamilyVersion: 'reading@2',
  },
  meaning: {
    cueModality: 'text',
    responseModality: 'choice',
    gradingMethod: { kind: 'accepted_answers', acceptedAnswers: ['branching', 'fork'] },
    hintPolicy: { hintsAllowed: true, maxHints: 1 },
    revealPolicy: { revealAllowed: true, revealIsRecorded: true },
    promptFamilyVersion: 'meaning@2',
  },
};

const INSTANTS = Array.from(
  { length: 40 },
  (_value, index) => `2026-08-09T00:00:${String(index).padStart(2, '0')}.000Z`,
);

const context = (prefix: string): DomainContext =>
  createDeterministicContext({ instants: INSTANTS, idPrefix: prefix });

const store = (prefix = 'a1-', initialEvents?: readonly DomainEvent[]) =>
  createMemoryAppStore({
    context: context(prefix),
    ...(initialEvents === undefined ? {} : { initialEvents }),
  });

const sourceText = '今日の分岐で道を選ぶ。';
const span = { start: sourceText.indexOf(TARGET), end: sourceText.indexOf(TARGET) + TARGET.length };

const capture = (overrides: Partial<CaptureCommand> = {}): CaptureCommand => ({
  kind: 'capture',
  text: sourceText,
  span,
  sourceRef: SOURCE,
  provenance: PROVENANCE,
  uncertainty: null,
  ...overrides,
});

const LEGACY_CAPTURE_KEY = `capture:${SOURCE.sourceId}:${SOURCE.locator}:${String(span.start)}-${String(span.end)}:${targetKeyOf(TARGET)}`;

const legacyCaptureEvent = (): EncounterCapturedEvent =>
  parseEvent({
    eventId: 'legacy-capture-event',
    v: 1,
    occurredAt: '2026-08-08T00:00:00.000Z',
    idempotencyKey: LEGACY_CAPTURE_KEY,
    type: 'EncounterCaptured',
    encounterId: 'legacy-capture-encounter',
    threadId: 'legacy-capture-thread',
    text: sourceText,
    span,
    sourceRef: SOURCE,
    provenance: PROVENANCE,
  }) as EncounterCapturedEvent;

const activateLearn = (threadId: string): AppCommand => ({
  kind: 'activateLearn',
  userAction: true,
  threadId,
  specification: LEARN_SPEC,
});

const recordLookup = (lookupId = 'lookup-golden-1'): AppCommand => ({
  kind: 'recordLookupFriction',
  userAction: true,
  lookupId,
  targetRef: { targetType: 'thread', targetId: 'thread-placeholder' },
  context: 'reading',
});

describe('CaptureCommand.span uses the frozen EncounterCaptured coordinates', () => {
  it('keeps the source body as evidence but uses only the exact span as learner identity', () => {
    const app = store();
    const ack = app.execute(capture());
    const event = ack.events[0] as EncounterCapturedEvent;
    const view = app.getSnapshot().threadsById[ack.threadId];

    expect(event.text).toBe(sourceText);
    expect(event.span).toEqual(span);
    expect(componentIdOfEncounter(event)).toBe('kc:分岐');
    expect(view?.displayText).toBe(TARGET);
    expect(view?.targetKey).toBe(targetKeyOf(TARGET));
    expect(view?.displayText).not.toBe(sourceText);
  });

  it('records unselected source-body and provenance drift as a new encounter', () => {
    const app = store();
    const first = app.execute(capture());
    const changedBody = '別日の分岐で道を戻る。';
    const changed = capture({
      text: changedBody,
      sourceRef: { ...SOURCE, kind: 'manual' },
      provenance: {
        ...PROVENANCE,
        sourceVersion: '2026-08-10',
        license: 'user_owned',
        modificationStatus: 'modified',
      },
      uncertainty: 'meaning',
    });
    const recaptured = app.execute(changed);

    expect(recaptured.deduplicated).toBe(false);
    expect(recaptured.threadId).toBe(first.threadId);
    expect(app.readAll()).toHaveLength(2);
    expect(recaptured.events[0]).toMatchObject({
      type: 'EncounterCaptured',
      text: changedBody,
      sourceRef: { ...SOURCE, kind: 'manual' },
      provenance: {
        sourceVersion: '2026-08-10',
        license: 'user_owned',
        modificationStatus: 'modified',
      },
      uncertaintyMark: true,
    });
    expect(recaptured.events[0]?.idempotencyKey).toMatch(/^capture:v2:[0-9a-f]{64}$/);
    expect(recaptured.events[0]?.idempotencyKey).not.toBe(first.events[0]?.idempotencyKey);

    const retry = app.execute(changed);
    expect(retry.deduplicated).toBe(true);
    expect(retry.events).toEqual([]);
    expect(app.readAll()).toHaveLength(2);
  });

  it('rejects whitespace-only selected targets before capture or Learn can gain authority', () => {
    const app = store();
    const whitespaceBody = 'A \tB';

    expect(() =>
      app.execute(capture({ text: whitespaceBody, span: { start: 1, end: 3 } })),
    ).toThrow(/selected target must contain non-whitespace text/);
    expect(() => app.execute(capture({ text: '\u3000', span: undefined }))).toThrow(
      /selected target must contain non-whitespace text/,
    );
    expect(app.readAll()).toEqual([]);
    expect(app.getSnapshot().threads).toEqual([]);
    expect(app.readDerived().contracts).toEqual([]);
    expect(app.readDerived().memoryStates).toEqual([]);
  });

  it('separates source ids and locators that collide under the legacy delimiter key', () => {
    const app = store();
    const first = app.execute(
      capture({ sourceRef: { sourceId: 'reader:a', kind: 'text', locator: 'p7' } }),
    );
    const second = app.execute(
      capture({ sourceRef: { sourceId: 'reader', kind: 'text', locator: 'a:p7' } }),
    );

    expect(second.deduplicated).toBe(false);
    expect(second.threadId).toBe(first.threadId);
    expect(app.readAll()).toHaveLength(2);
    expect(second.events[0]?.idempotencyKey).not.toBe(first.events[0]?.idempotencyKey);
  });

  it('validates invalid source and provenance even when their legacy tuple collides', () => {
    const legacy = parseEvent({
      eventId: 'legacy-validation-event',
      v: 1,
      occurredAt: '2026-08-08T00:00:00.000Z',
      idempotencyKey: `capture:reader::${String(span.start)}-${String(span.end)}:${targetKeyOf(TARGET)}`,
      type: 'EncounterCaptured',
      encounterId: 'legacy-validation-encounter',
      threadId: 'legacy-validation-thread',
      text: sourceText,
      span,
      sourceRef: { sourceId: 'reader', kind: 'text' },
      provenance: PROVENANCE,
    });
    const app = store('validation-', [legacy]);
    const invalid = capture({
      sourceRef: { sourceId: 'reader', kind: 'text', locator: '' },
      provenance: { ...PROVENANCE, license: '' },
    }) as unknown as CaptureCommand;

    expect(() => app.execute(invalid)).toThrow();
    expect(app.readAll()).toEqual([legacy]);
  });

  it('keeps two selected substrings in one body as distinct capture identities', () => {
    const app = store();
    const body = '分岐と選択を考える。';
    const one = app.execute(
      capture({ text: body, span: { start: body.indexOf('分岐'), end: body.indexOf('分岐') + 2 } }),
    );
    const two = app.execute(
      capture({ text: body, span: { start: body.indexOf('選択'), end: body.indexOf('選択') + 2 } }),
    );

    expect(two.threadId).not.toBe(one.threadId);
    expect(
      app
        .getSnapshot()
        .threads.map((thread) => thread.displayText)
        .sort(),
    ).toEqual(['分岐', '選択']);
  });

  it('fails closed on empty, reversed, fractional, or out-of-bounds spans', () => {
    const app = store();
    for (const invalid of [
      { start: 3, end: 3 },
      { start: 5, end: 3 },
      { start: 3.5, end: 5 },
      { start: 3, end: 500 },
    ]) {
      expect(() => app.execute(capture({ span: invalid }))).toThrow();
    }
    expect(app.readAll()).toEqual([]);
    expect(app.getSnapshot().threads).toEqual([]);
  });
});

describe('explicit Learn activation', () => {
  it('does nothing on construction/read/subscribe and activates only on the user command', () => {
    const app = store();
    const captured = app.execute(capture());
    const unsubscribe = app.subscribe(() => undefined);
    app.getSnapshot();
    app.readDerived();
    unsubscribe();

    expect(app.getSnapshot().threadsById[captured.threadId]?.state.promotion).toBe('captured');
    expect(app.readAll().filter((event) => event.type === 'ContractCreated')).toEqual([]);

    const learned = app.execute(activateLearn(captured.threadId));
    expect(learned.events.map((event) => event.type)).toEqual([
      'ThreadPromotionChanged',
      'ThreadPromotionChanged',
      'ContractCreated',
      'ContractCreated',
    ]);
    expect(app.getSnapshot().threadsById[captured.threadId]?.state.promotion).toBe('learn');
    expect(app.readDerived().memoryStates).toHaveLength(2);

    const reading = learnContractIdentity(captured.threadId, LEARN_SPEC, 'orthography_to_reading');
    const meaning = learnContractIdentity(captured.threadId, LEARN_SPEC, 'form_to_meaning');
    expect(
      app
        .readAll()
        .filter((event) => event.type === 'ContractCreated')
        .map((event) => event.contractId),
    ).toEqual([reading.contractId, meaning.contractId]);

    const bound = bindRetrievalContract(app.readAll(), reading.contractId);
    expect(bound).toMatchObject({
      bound: true,
      value: {
        threadId: captured.threadId,
        originEncounterId: (captured.events[0] as EncounterCapturedEvent).encounterId,
        targetText: TARGET,
      },
    });

    const repeat = app.execute(activateLearn(captured.threadId));
    expect(repeat.deduplicated).toBe(true);
    expect(repeat.events).toEqual([]);
    expect(app.readAll().filter((event) => event.type === 'ContractCreated')).toHaveLength(2);
  });

  it('rejects a forged non-user activation before promotion or contract creation', () => {
    const app = store();
    const captured = app.execute(capture());
    const forged = {
      ...activateLearn(captured.threadId),
      userAction: false,
    } as unknown as AppCommand;

    expect(() => app.execute(forged)).toThrow(/explicit user/i);
    expect(app.getSnapshot().threadsById[captured.threadId]?.state.promotion).toBe('captured');
    expect(app.readAll()).toHaveLength(1);
  });
});

describe('explicit lookup friction', () => {
  it('records a quick look through the evidence minter with no grade and no FSRS change', () => {
    const app = store();
    const captured = app.execute(capture());
    app.execute(activateLearn(captured.threadId));
    const before = JSON.stringify(app.readDerived().memoryStates);

    const lookup = app.execute({
      ...recordLookup(),
      targetRef: { targetType: 'thread', targetId: captured.threadId },
    } as AppCommand);
    const event = lookup.events[0];

    expect(event?.type).toBe('LookupFrictionLogged');
    expect(event && 'grade' in event).toBe(false);
    expect(event && 'contractId' in event).toBe(false);
    expect(JSON.stringify(app.readDerived().memoryStates)).toBe(before);
    expect(app.readDerived().gateDecisions.at(-1)).toMatchObject({
      admitted: false,
      reason: 'lookup_is_friction_not_a_grade',
      effectiveGrade: null,
    });

    const repeat = app.execute({
      ...recordLookup(),
      targetRef: { targetType: 'thread', targetId: captured.threadId },
    } as AppCommand);
    expect(repeat.deduplicated).toBe(true);
    expect(repeat.events).toEqual([]);
  });

  it('rejects a forged non-user lookup without minting an observation', () => {
    const app = store();
    const forged = { ...recordLookup(), userAction: false } as unknown as AppCommand;
    expect(() => app.execute(forged)).toThrow(/explicit user/i);
    expect(app.readAll()).toEqual([]);
  });

  it('rejects reuse of one lookup gesture id for different evidence', () => {
    const app = store();
    app.execute(recordLookup());

    expect(() =>
      app.execute({
        ...recordLookup(),
        targetRef: { targetType: 'lexeme', targetId: 'different-target' },
        context: 'capture',
      } as AppCommand),
    ).toThrow(/different lookup evidence/i);
    expect(app.readAll().filter((event) => event.type === 'LookupFrictionLogged')).toHaveLength(1);
  });
});

describe('reload/replay authority', () => {
  it('dual-reads an exact legacy retry but records changed legacy evidence under v2', () => {
    const legacy = legacyCaptureEvent();
    const app = store('legacy-', [legacy]);

    const exactRetry = app.execute(capture());
    expect(exactRetry.deduplicated).toBe(true);
    expect(exactRetry.threadId).toBe(legacy.threadId);
    expect(app.readAll()).toEqual([legacy]);

    const driftedCommand = capture({
      text: '別日の分岐で道を戻る。',
      provenance: { ...PROVENANCE, sourceVersion: '2026-08-10' },
    });
    const drifted = app.execute(driftedCommand);
    expect(drifted.deduplicated).toBe(false);
    expect(drifted.threadId).toBe(legacy.threadId);
    expect(drifted.events[0]?.idempotencyKey).toMatch(/^capture:v2:[0-9a-f]{64}$/);
    expect(app.readAll()).toHaveLength(2);

    const canonicalLog = app.readAll();
    const reloaded = store('legacy-reloaded-', canonicalLog);
    expect(reloaded.execute(driftedCommand).deduplicated).toBe(true);
    expect(reloaded.readAll()).toEqual(canonicalLog);
    expect(reloaded.readAll()[0]?.idempotencyKey).toBe(LEGACY_CAPTURE_KEY);
  });

  it('rehydrates exact span identity and deduplicates all three gestures from the log', () => {
    const first = store('first-');
    const captured = first.execute(capture());
    first.execute(activateLearn(captured.threadId));
    first.execute({
      ...recordLookup(),
      targetRef: { targetType: 'thread', targetId: captured.threadId },
    } as AppCommand);
    const canonicalLog = first.readAll();

    const reloaded = store('second-', canonicalLog);
    const thread = reloaded.getSnapshot().threadsById[captured.threadId];
    expect(thread?.displayText).toBe(TARGET);
    expect(thread?.targetKey).toBe(targetKeyOf(TARGET));
    expect(thread?.state.promotion).toBe('learn');
    expect(reloaded.readDerived().contracts).toHaveLength(2);
    expect(reloaded.readDerived().memoryStates).toHaveLength(2);
    expect(reloaded.readDerived().gateDecisions.at(-1)?.reason).toBe(
      'lookup_is_friction_not_a_grade',
    );

    expect(reloaded.execute(capture()).deduplicated).toBe(true);
    expect(reloaded.execute(activateLearn(captured.threadId)).deduplicated).toBe(true);
    expect(
      reloaded.execute({
        ...recordLookup(),
        targetRef: { targetType: 'thread', targetId: captured.threadId },
      } as AppCommand).deduplicated,
    ).toBe(true);
    expect(reloaded.readAll()).toEqual(canonicalLog);
  });
});
