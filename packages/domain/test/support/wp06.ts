/**
 * Scenario builders for the WP-06 suites.
 *
 * Every WP-06 assertion is about the *whole* path — capture binds a component
 * to a thread, promotion activates contracts, the gate judges an observation,
 * and the scheduler moves or does not move. Testing that through `replay` rather
 * than by calling the gate with a hand-built context is deliberate: a gate that
 * is correct in isolation and never reachable from a real log would pass every
 * unit test and protect nothing.
 *
 * The gate's own branch table is still exercised directly in
 * `test/evidence/gate.test.ts`, where the context is the subject.
 */

import {
  componentIdForTargetKey,
  parseEventLog,
  replay,
  type DerivedState,
} from '../../src/index.ts';
import {
  contractCreated,
  encounterCaptured,
  reviewGraded,
  threadPromotionChanged,
} from './events.ts';

/** The default Phase-0 canonical fixture target (OD-02). */
export const TARGET = '分岐';
export const TEXT = `${TARGET}点で道を選ぶ。`;
export const COMPONENT = componentIdForTargetKey(TARGET);
export const THREAD = 'thread-wp06';

export const T = {
  capture: '2026-07-27T09:00:00.000Z',
  promote: '2026-07-27T09:01:00.000Z',
  contract: '2026-07-27T09:02:00.000Z',
  review1: '2026-07-27T09:03:00.000Z',
  review2: '2026-07-28T09:00:00.000Z',
  review3: '2026-07-31T09:00:00.000Z',
  review4: '2026-08-07T09:00:00.000Z',
} as const;

type Raw = Record<string, unknown>;

/** A capture whose span selects `TARGET`, so its component id is `COMPONENT`. */
export function capture(overrides: Raw = {}): Raw {
  return encounterCaptured(
    { eventId: 'ev-capture', at: T.capture, encounterId: 'encounter-1', threadId: THREAD },
    { text: TEXT, span: { start: 0, end: TARGET.length }, ...overrides },
  );
}

export function promote(
  to: string,
  args: { eventId?: string; at?: string; from?: string } = {},
): Raw {
  return threadPromotionChanged({
    eventId: args.eventId ?? `ev-promote-${to}`,
    at: args.at ?? T.promote,
    threadId: THREAD,
    from: args.from ?? 'captured',
    to,
  });
}

export function meaningContract(overrides: Raw = {}): Raw {
  return contractCreated(
    { eventId: 'ev-contract-meaning', at: T.contract, contractId: 'contract-meaning' },
    { targetComponentId: COMPONENT, skill: 'form_to_meaning', ...overrides },
  );
}

export function readingContract(overrides: Raw = {}): Raw {
  return contractCreated(
    { eventId: 'ev-contract-reading', at: T.contract, contractId: 'contract-reading' },
    {
      targetComponentId: COMPONENT,
      skill: 'orthography_to_reading',
      acceptedAnswers: ['ぶんき'],
      idempotencyKey: 'idem-ev-contract-reading',
      ...overrides,
    },
  );
}

export function productionContract(overrides: Raw = {}): Raw {
  const event = contractCreated(
    { eventId: 'ev-contract-production', at: T.contract, contractId: 'contract-production' },
    {
      targetComponentId: COMPONENT,
      skill: 'meaning_to_production',
      responseModality: 'free',
      rubricId: 'rubric-production',
      rubricVersion: '1.0.0',
      hintPolicy: { hintsAllowed: false, maxHints: 0 },
      ...overrides,
    },
  );
  // Removed rather than set to `undefined`: REQ-DM-05 is a strict XOR, and a
  // rubric-scored contract must not carry an answer key at all.
  delete event['acceptedAnswers'];
  return event;
}

export function review(
  args: { eventId: string; at: string; contractId: string; grade?: string },
  overrides: Raw = {},
): Raw {
  return reviewGraded(args, overrides);
}

/** Parse and replay a raw log — the same fail-closed path production uses. */
export function run(events: readonly Raw[]): DerivedState {
  return replay(parseEventLog(events, { path: '<wp06-scenario>' }));
}

export function memoryStateOf(state: DerivedState, contractId: string) {
  return state.memoryStates.find((memory) => memory.contractId === contractId);
}

export function decisionOf(state: DerivedState, eventId: string) {
  return state.gateDecisions.find((decision) => decision.eventId === eventId);
}

/** Capture → promote to `learn` → create the meaning and reading contracts. */
export function learnableLog(): Raw[] {
  return [capture(), promote('learn'), meaningContract(), readingContract()];
}
