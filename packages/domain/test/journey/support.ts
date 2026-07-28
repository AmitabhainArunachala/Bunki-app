/**
 * Stumble fixtures for the journey compiler (Campaign E / A2).
 *
 * One builder with everything defaulted to the *poorest* honest inputs — no
 * affordances, no latency measured, no prior stumble — so that every test says
 * out loud which fact it is relying on. A fixture that quietly supplied a
 * plausible latency would make it impossible to tell whether a routing decision
 * came from the test's evidence or from the fixture's convenience.
 */

import type {
  BranchAffordances,
  JourneyObservation,
  JourneyStumble,
  StumbleObservations,
} from '../../src/index.ts';
import type { IsoInstant } from '../../src/index.ts';

export function at(dayOffset: number, hour = 9): IsoInstant {
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let remaining = dayOffset;
  let month = 0;
  while (month < 11 && remaining >= (monthLengths[month] ?? 31)) {
    remaining -= monthLengths[month] ?? 31;
    month += 1;
  }
  return `2026-${String(month + 1).padStart(2, '0')}-${String(remaining + 1).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`;
}

export const NOTHING_OBSERVED: StumbleObservations = Object.freeze({
  hintsUsed: 0,
  revealedBeforeRecall: false,
  latencyMs: null,
  admittedReviewCount: 1,
  lapses: 0,
  priorStumbleCount: 0,
});

export const NOTHING_AVAILABLE: BranchAffordances = Object.freeze({
  hasComponents: false,
  hasContrastNeighbours: false,
  hasReadingFamily: false,
  hasGrammarConstruction: false,
  hasProductionContract: false,
  hasAudio: false,
  writingActivated: false,
});

export const EVERYTHING_AVAILABLE: BranchAffordances = Object.freeze({
  hasComponents: true,
  hasContrastNeighbours: true,
  hasReadingFamily: true,
  hasGrammarConstruction: true,
  hasProductionContract: true,
  hasAudio: true,
  writingActivated: true,
});

export const CONTRACT_ID = 'contract:kc:分岐:orthography_to_reading';

export function stumble(overrides: Partial<JourneyStumble> = {}): JourneyStumble {
  return {
    contractId: CONTRACT_ID,
    threadId: 'thread:分岐',
    skill: 'orthography_to_reading',
    cueModality: 'text',
    responseModality: 'text',
    eventId: 'event:miss-1',
    at: at(10),
    effectiveGrade: 'again',
    observed: NOTHING_OBSERVED,
    available: EVERYTHING_AVAILABLE,
    ...overrides,
  };
}

export function observed(overrides: Partial<StumbleObservations> = {}): StumbleObservations {
  return { ...NOTHING_OBSERVED, ...overrides };
}

export function observation(overrides: Partial<JourneyObservation> = {}): JourneyObservation {
  return {
    eventId: 'event:success-1',
    contractId: CONTRACT_ID,
    effectiveGrade: 'good',
    admitted: true,
    hintsUsed: 0,
    revealedBeforeRecall: false,
    sessionId: 'session:1',
    at: at(11),
    ...overrides,
  };
}
