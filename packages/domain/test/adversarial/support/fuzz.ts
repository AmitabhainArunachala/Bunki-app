/**
 * A deterministic generator of event logs, for the WP-10 adversarial lanes
 * (controller §17.2, lane T1).
 *
 * ## Why this is hand-rolled rather than `fast-check`
 *
 * Two reasons, and the first one is the binding one. Adding a property-testing
 * dependency means editing `package.json` and the lockfile, which are product
 * surfaces this lane does not own (orchestration §4 restricts the adversarial
 * lanes to per-package test directories, additively). The second is that a
 * shrinking library buys least where the
 * inputs are *structured* — a shrunk event log is usually an invalid one, and
 * an invalid log tells you nothing about a gate that correctly refuses it. What
 * this lane needs instead is a generator that only ever emits logs the kernel
 * would accept, so that every failure is a real invariant violation rather than
 * a malformed fixture.
 *
 * ## Determinism is the point, not a convenience
 *
 * `mulberry32` with an explicit seed, mirroring `createSeededRandom` in
 * `src/context/deterministic.ts`. A fuzz suite that used ambient entropy would
 * be a suite whose red build nobody can reproduce, which in a repository whose
 * central claim is deterministic replay would be a small joke at its own
 * expense. Every case below is addressed by `(seed, index)` and re-running the
 * file re-runs the identical corpus.
 *
 * ## The shape of what it emits
 *
 * One thread, one target, and a mix of every evidence family the gate has an
 * opinion about — reviews with randomised grades, reveal flags and easy
 * confirmations; exposures and lookups, which must never grade; production
 * observations, which must never reach FSRS; and occasional supersessions of a
 * review already in the log. Promotion is randomised across the ladder so a
 * given case may or may not activate anything, which is what makes T-02
 * checkable rather than assumed.
 *
 * Timestamps advance monotonically **by whole days**, because that is what a
 * causally ordered log looks like and it keeps the base corpus free of the
 * clock-skew question, which `t1-clock-skew.test.ts` owns separately.
 */

import { componentIdForTargetKey } from '../../../src/index.ts';

export type Raw = Record<string, unknown>;

/** The same PRNG the kernel's `DomainContext` seam uses. Identical per seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Random {
  int(maxExclusive: number): number;
  bool(probability?: number): boolean;
  pick<T>(items: readonly T[]): T;
}

export function randomFrom(seed: number): Random {
  const next = mulberry32(seed);
  return {
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    bool: (probability = 0.5) => next() < probability,
    pick<T>(items: readonly T[]): T {
      const item = items[Math.floor(next() * items.length)];
      if (item === undefined) throw new Error('cannot pick from an empty list');
      return item;
    },
  };
}

export const TARGET = '分岐';
export const TEXT = `${TARGET}点で道を選ぶ。`;
export const COMPONENT = componentIdForTargetKey(TARGET);
export const THREAD = 'thread-fuzz';
export const MEANING_CONTRACT = 'contract-meaning';
export const READING_CONTRACT = 'contract-reading';

const GRADES = ['again', 'hard', 'good', 'easy'] as const;
const PROMOTIONS = ['keep', 'learn', 'master'] as const;

/** Day *N* at 09:00Z. Whole days apart, so FSRS sees a clean `delta_t`. */
export function dayInstant(index: number): string {
  const day = 1 + index;
  const month = 1 + Math.floor((day - 1) / 28);
  const dayOfMonth = ((day - 1) % 28) + 1;
  return `2027-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}T09:00:00.000Z`;
}

const envelope = (eventId: string, at: string): Raw => ({
  eventId,
  v: 1,
  occurredAt: at,
  idempotencyKey: `idem-${eventId}`,
});

export function capture(eventId: string, at: string): Raw {
  return {
    ...envelope(eventId, at),
    type: 'EncounterCaptured',
    encounterId: `encounter-${eventId}`,
    threadId: THREAD,
    text: TEXT,
    span: { start: 0, end: TARGET.length },
    sourceRef: {
      sourceId: 'source-fuzz',
      kind: 'text',
      locator: 'https://example.invalid/fuzz#1',
    },
    provenance: {
      source: 'user_encounter',
      license: 'user_owned',
      modificationStatus: 'unmodified',
      reviewStatus: 'user_reviewed',
    },
  };
}

export function promote(eventId: string, at: string, from: string, to: string): Raw {
  return {
    ...envelope(eventId, at),
    type: 'ThreadPromotionChanged',
    threadId: THREAD,
    from,
    to,
    origin: 'user',
  };
}

export function contract(eventId: string, at: string, contractId: string, skill: string): Raw {
  return {
    ...envelope(eventId, at),
    type: 'ContractCreated',
    contractId,
    contractVersion: 1,
    targetComponentId: COMPONENT,
    skill,
    cueModality: 'text',
    responseModality: 'text',
    acceptedAnswers: skill === 'orthography_to_reading' ? ['ぶんき'] : ['a branching point'],
    hintPolicy: { hintsAllowed: true, maxHints: 1 },
    revealPolicy: { revealAllowed: true, revealIsRecorded: true },
    promptFamilyVersion: 'pf-2026-07-27.1',
  };
}

export interface ReviewSpec {
  readonly eventId: string;
  readonly at: string;
  readonly contractId: string;
  readonly grade: (typeof GRADES)[number];
  readonly revealedBeforeRecall: boolean;
  readonly userConfirmedEasy: boolean;
}

export function review(spec: ReviewSpec): Raw {
  return {
    ...envelope(spec.eventId, spec.at),
    type: 'ReviewGraded',
    contractId: spec.contractId,
    grade: spec.grade,
    latencyMs: 3200,
    hintsUsed: 0,
    revealedBeforeRecall: spec.revealedBeforeRecall,
    probeContext: 'standalone',
    tier: 'A',
    ...(spec.userConfirmedEasy ? { userConfirmedEasy: true } : {}),
  };
}

export function exposure(eventId: string, at: string): Raw {
  return {
    ...envelope(eventId, at),
    type: 'ExposureLogged',
    componentIds: [COMPONENT],
    experienceId: 'experience-fuzz',
    tier: 'D',
  };
}

export function lookup(eventId: string, at: string): Raw {
  return {
    ...envelope(eventId, at),
    type: 'LookupFrictionLogged',
    targetRef: { targetType: 'lexeme', targetId: 'lexeme-fuzz' },
    context: 'reading',
  };
}

export function production(eventId: string, at: string, tier: 'B' | 'C'): Raw {
  return {
    ...envelope(eventId, at),
    type: 'ProductionObserved',
    elicited: true,
    tier,
    rubricId: 'rubric-fuzz',
    rubricVersion: '1.0.0',
  };
}

export function supersede(eventId: string, at: string, supersededEventId: string): Raw {
  return {
    ...envelope(eventId, at),
    type: 'EvidenceSuperseded',
    supersededEventId,
    reason: 'user_correction',
    correction: { note: 'graded the wrong contract' },
  };
}

export interface GeneratedCase {
  readonly seed: number;
  readonly events: readonly Raw[];
  /** Whether any promotion in this case activates a retrieval skill (T-02). */
  readonly activates: boolean;
}

/**
 * One randomised but causally valid log.
 *
 * Order is always capture → promotion → contracts → observations, because that
 * is the only order the kernel accepts; the *interleaving* tests permute this
 * afterwards, which is the point — a permutation of a valid log is the hostile
 * input, and generating an invalid one instead would only ever prove that the
 * parser works.
 */
export function generateCase(seed: number): GeneratedCase {
  const random = randomFrom(seed);
  const events: Raw[] = [];
  let clock = 0;
  const at = (): string => dayInstant(clock++);
  let counter = 0;
  const id = (prefix: string): string => `${prefix}-${String(++counter).padStart(3, '0')}`;

  events.push(capture(id('ev-capture'), at()));

  const to = random.pick(PROMOTIONS);
  events.push(promote(id('ev-promote'), at(), 'captured', to));
  const activates = to === 'learn' || to === 'master';

  events.push(contract(id('ev-contract'), at(), MEANING_CONTRACT, 'form_to_meaning'));
  if (random.bool(0.6)) {
    events.push(contract(id('ev-contract'), at(), READING_CONTRACT, 'orthography_to_reading'));
  }

  const reviewIds: string[] = [];
  const observationCount = 3 + random.int(6);

  for (let index = 0; index < observationCount; index += 1) {
    const roll = random.int(10);
    if (roll < 5) {
      const eventId = id('ev-review');
      reviewIds.push(eventId);
      events.push(
        review({
          eventId,
          at: at(),
          contractId: random.bool(0.75) ? MEANING_CONTRACT : READING_CONTRACT,
          grade: random.pick(GRADES),
          revealedBeforeRecall: random.bool(0.3),
          userConfirmedEasy: random.bool(0.5),
        }),
      );
    } else if (roll < 7) {
      events.push(exposure(id('ev-exposure'), at()));
    } else if (roll < 8) {
      events.push(lookup(id('ev-lookup'), at()));
    } else if (roll < 9) {
      events.push(production(id('ev-production'), at(), random.bool() ? 'B' : 'C'));
    } else if (reviewIds.length > 0) {
      const victim = random.pick(reviewIds);
      reviewIds.splice(reviewIds.indexOf(victim), 1);
      events.push(supersede(id('ev-supersede'), at(), victim));
    } else {
      events.push(exposure(id('ev-exposure'), at()));
    }
  }

  return { seed, events, activates };
}

/** A Fisher–Yates shuffle driven by the seeded PRNG. */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = random.int(index + 1);
    const a = copy[index];
    const b = copy[swap];
    if (a === undefined || b === undefined) continue;
    copy[index] = b;
    copy[swap] = a;
  }
  return copy;
}
