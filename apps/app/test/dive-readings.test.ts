/**
 * What the dive is allowed to say about a node, per capability (lane B2).
 *
 * `src/ui/dive/dive-readings.ts` shipped untested, and two of its claims are
 * load-bearing honesty claims rather than behaviour:
 *
 *   1. **The top band is never produced.** Nothing this build records could
 *      support "durable", and handing it out for a thread somebody kept would be
 *      the illusion of mastery the round-2 research is about.
 *   2. **Five lenses are five lenses.** A kept thread is a word met in *text*.
 *      It bears on reading and meaning and on nothing else, because this build
 *      ships no audio, no production prompt and no handwriting capture.
 *
 * Both were stated in a docblock and enforced by nothing. The second was false
 * in the shipped bundle: one tap of Keep rendered every character of that word
 * at step 4 of 5 under all five lenses, and the diagnosis said "分 has writing
 * evidence". These tests are written so that the mutation which produced that
 * behaviour fails here.
 *
 * `READING_STANDING` gets its own treatment. It is *derived* from the same
 * constants the bands are, so a test that recomputed the sentence from those
 * constants would follow any change silently and prove nothing. The numbers are
 * therefore pinned as literals.
 */

import { describe, expect, it } from 'vitest';

import { CAPABILITY_IDS, type CapabilityId } from '../src/ui/capability.ts';
import {
  KEPT_STEP,
  MARKED_UNSURE_STEP,
  NO_EVIDENCE_STEP,
  READING_STANDING,
  READING_STEPS,
  TAKEN_UP_STEP,
  THREAD_BEARS_ON,
  UNCERTAINTY_CAPABILITY,
  bandAtStep,
  bandForThread,
  bandStep,
  isUnseen,
  markForNode,
  noSourceNote,
  reachOfThreads,
  readingsForNodes,
} from '../src/ui/dive/dive-readings.ts';
import type {
  AppSnapshot,
  ThreadView,
  UncertaintyAnnotation,
  UncertaintyDimension,
} from '../src/state/store.ts';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

type Promotion = ThreadView['state']['promotion'];

function thread(options: {
  readonly promotion?: Promotion;
  readonly dimension?: UncertaintyDimension | null;
  readonly markRecordedInLog?: boolean;
  readonly lexemeId?: string | null;
  readonly displayText?: string;
}): ThreadView {
  const dimension = options.dimension ?? null;
  const uncertainty: UncertaintyAnnotation | null =
    dimension === null
      ? null
      : { dimension, editedAt: '2026-07-28T00:00:00.000Z', markedAtCapture: true };
  return {
    state: {
      threadId: 'thread-1',
      promotion: options.promotion ?? 'captured',
      promotionHistory: [],
      encounterIds: ['enc-1'],
      candidateIds: [],
      acceptedCandidateIds: [],
      lifecycle: 'active',
      tombstoneEventId: null,
      createdAt: '2026-07-28T00:00:00.000Z',
      lastEventAt: '2026-07-28T00:00:00.000Z',
    },
    displayText: options.displayText ?? '分岐',
    targetKey: 'ぶんき',
    lexemeId: options.lexemeId === undefined ? 'jmdict-1500000' : options.lexemeId,
    uncertainty,
    markRecordedInLog: options.markRecordedInLog ?? false,
    capturedAt: '2026-07-28T00:00:00.000Z',
  } satisfies ThreadView;
}

/** Every promotion rung the ladder has, so no branch is left unvisited. */
const PROMOTIONS: readonly Promotion[] = ['captured', 'keep', 'learn', 'master'];

/* ------------------------------------------------------------------ *
 * 1. The top band is never produced
 * ------------------------------------------------------------------ */

describe('the top of the ramp is unreachable', () => {
  it('never returns the top band, for any thread shape and any capability', () => {
    const top = READING_STEPS - 1;
    const shapes: readonly ThreadView[] = [
      ...PROMOTIONS.map((promotion) => thread({ promotion })),
      ...PROMOTIONS.map((promotion) => thread({ promotion, markRecordedInLog: true })),
      ...(['meaning', 'reading', 'use', 'kanji', 'not-sure'] as const).flatMap((dimension) =>
        PROMOTIONS.map((promotion) => thread({ promotion, dimension })),
      ),
    ];

    for (const shape of shapes) {
      for (const capability of CAPABILITY_IDS) {
        const derived = bandForThread(shape, capability);
        expect(
          bandStep(derived.band),
          `${shape.state.promotion}/${capability} reached the top of the ramp; ` +
            'nothing this build records could support it',
        ).toBeLessThan(top);
      }
    }
  });

  it('caps every thread at the taken-up step', () => {
    for (const promotion of PROMOTIONS) {
      const derived = bandForThread(thread({ promotion }), 'reading');
      expect(bandStep(derived.band)).toBeLessThanOrEqual(TAKEN_UP_STEP);
    }
  });

  it('pins the ramp positions as literals, so a mutation cannot ride along', () => {
    // Deliberately not derived. `READING_STANDING` interpolates these, so a test
    // computing the sentence from them would agree with any value they took.
    expect(READING_STEPS).toBe(5);
    expect(NO_EVIDENCE_STEP).toBe(0);
    expect(MARKED_UNSURE_STEP).toBe(1);
    expect(KEPT_STEP).toBe(2);
    expect(TAKEN_UP_STEP).toBe(3);
  });

  it('says on screen exactly the cap the code enforces', () => {
    expect(READING_STANDING).toContain('step 4 of 5');
    expect(READING_STANDING).toContain('not from a review measurement');
  });
});

/* ------------------------------------------------------------------ *
 * 2. Five lenses are five lenses
 * ------------------------------------------------------------------ */

describe('a kept thread does not light every capability', () => {
  it('bears on reading and meaning, and on nothing else', () => {
    expect([...THREAD_BEARS_ON].sort()).toEqual(['meaning', 'reading']);
  });

  it('covers every capability exactly once, between borne and unsourced', () => {
    const unsourced = CAPABILITY_IDS.filter((id) => noSourceNote(id) !== null);
    expect([...THREAD_BEARS_ON, ...unsourced].sort()).toEqual([...CAPABILITY_IDS].sort());
    // A capability may not be both, which a hand-written second list allows.
    for (const capability of THREAD_BEARS_ON) {
      expect(noSourceNote(capability)).toBeNull();
    }
  });

  it('leaves listening, production and writing unlit however far the thread is promoted', () => {
    for (const promotion of PROMOTIONS) {
      for (const capability of ['listening', 'production', 'writing'] as const) {
        const derived = bandForThread(thread({ promotion }), capability);
        expect(
          isUnseen(derived.band),
          `a ${promotion} thread lit ${capability}, on a build that records nothing about it`,
        ).toBe(true);
      }
    }
  });

  it('does not produce the same vector under every lens', () => {
    // The exact collapse REQ-UI-07 forbids, one level below the map: this is the
    // assertion that fails if the capability argument stops being consulted.
    const taken = thread({ promotion: 'keep' });
    const steps = CAPABILITY_IDS.map((capability) =>
      bandStep(bandForThread(taken, capability).band),
    );
    expect(new Set(steps).size, `every lens returned step ${String(steps[0])}`).toBeGreaterThan(1);
  });

  it('says why an unlit lens is unlit, rather than leaving it blank', () => {
    for (const capability of ['listening', 'production', 'writing'] as const) {
      const derived = bandForThread(thread({ promotion: 'keep' }), capability);
      expect(derived.basis).toBe(
        `${noSourceNote(capability) ?? ''} You kept 分岐, which is a word you met in text.`,
      );
    }
    expect(noSourceNote('listening')).toContain('no audio');
    expect(noSourceNote('writing')).toContain('no handwriting');
  });

  it('discloses the rule on screen and not only in a comment', () => {
    expect(READING_STANDING).toContain('reading and meaning');
    for (const capability of ['listening', 'production', 'writing'] as const) {
      expect(READING_STANDING).toContain(capability);
    }
  });
});

/* ------------------------------------------------------------------ *
 * 3. The learner's own mark still lands where they put it
 * ------------------------------------------------------------------ */

describe('an uncertainty mark reaches the capability it names', () => {
  it('maps each dimension to one capability, and “not sure” to none', () => {
    expect(UNCERTAINTY_CAPABILITY).toEqual({
      meaning: 'meaning',
      reading: 'reading',
      use: 'production',
      kanji: 'writing',
      'not-sure': null,
    });
  });

  it('marks writing when the learner said the kanji were the problem', () => {
    // The one way an unsourced lens becomes non-zero: the learner told us. A
    // self-report about writing is a real statement about writing, and it is
    // above "never measured" precisely because it was measured — by them.
    const marked = bandForThread(thread({ promotion: 'keep', dimension: 'kanji' }), 'writing');
    expect(bandStep(marked.band)).toBe(MARKED_UNSURE_STEP);
    expect(marked.basis).toBe('You marked writing unsure on 分岐.');
    expect(isUnseen(marked.band)).toBe(false);
  });

  it('marks production when the learner said they could not use it', () => {
    const marked = bandForThread(thread({ promotion: 'keep', dimension: 'use' }), 'production');
    expect(bandStep(marked.band)).toBe(MARKED_UNSURE_STEP);
  });

  it('does not spread one mark across the other four lenses', () => {
    const marked = thread({ promotion: 'keep', dimension: 'kanji' });
    expect(bandStep(bandForThread(marked, 'listening').band)).toBe(NO_EVIDENCE_STEP);
    expect(bandStep(bandForThread(marked, 'production').band)).toBe(NO_EVIDENCE_STEP);
    expect(bandStep(bandForThread(marked, 'reading').band)).toBe(TAKEN_UP_STEP);
  });

  it('lowers a borne capability rather than raising it', () => {
    const plain = bandForThread(thread({ promotion: 'keep' }), 'reading');
    const marked = bandForThread(thread({ promotion: 'keep', dimension: 'reading' }), 'reading');
    expect(bandStep(marked.band)).toBeLessThan(bandStep(plain.band));
  });

  it('does not invent a capability for a mark that named none', () => {
    const marked = thread({ promotion: 'keep', dimension: 'not-sure' });
    for (const capability of CAPABILITY_IDS) {
      expect(bandStep(bandForThread(marked, capability).band)).toBe(
        bandStep(bandForThread(thread({ promotion: 'keep' }), capability).band),
      );
    }
  });

  it('reports a mark whose dimension did not survive the reload as uncertain', () => {
    const rehydrated = thread({ promotion: 'keep', markRecordedInLog: true });
    const derived = bandForThread(rehydrated, 'reading');
    expect(derived.uncertain).toBe(true);
    expect(derived.basis).toContain('never stored');
  });
});

/* ------------------------------------------------------------------ *
 * 4. Bands, steps, and the no-thread floor
 * ------------------------------------------------------------------ */

describe('the ramp', () => {
  it('reports no thread as unseen, not as weak', () => {
    for (const capability of CAPABILITY_IDS) {
      const derived = bandForThread(null, capability);
      expect(isUnseen(derived.band)).toBe(true);
      expect(derived.uncertain).toBe(false);
      expect(derived.basis).toContain('No kept thread');
    }
  });

  it('clamps a step off either end of the ramp rather than throwing', () => {
    expect(bandStep(bandAtStep(-4))).toBe(0);
    expect(bandStep(bandAtStep(99))).toBe(READING_STEPS - 1);
  });

  it('separates a captured thread from one taken up for study', () => {
    expect(bandStep(bandForThread(thread({ promotion: 'captured' }), 'reading').band)).toBe(
      KEPT_STEP,
    );
    expect(bandStep(bandForThread(thread({ promotion: 'keep' }), 'reading').band)).toBe(
      TAKEN_UP_STEP,
    );
  });
});

/* ------------------------------------------------------------------ *
 * 5. Which nodes a thread reaches
 * ------------------------------------------------------------------ */

describe('thread reach', () => {
  const snapshotOf = (threads: readonly ThreadView[]): AppSnapshot =>
    ({
      revision: 1,
      threads,
      threadsById: Object.fromEntries(threads.map((entry) => [entry.state.threadId, entry])),
      candidates: [],
      candidatesByThread: {},
      eventCount: threads.length,
    }) as AppSnapshot;

  const kanjiNodeIdOf = (character: string): string => `kanji:${character}`;
  const charactersOf = (lexemeId: string): readonly string[] =>
    lexemeId === 'jmdict-1500000' ? ['分', '岐'] : [];

  it('reaches the lexeme and every character the word is written with', () => {
    const reach = reachOfThreads(
      snapshotOf([thread({ promotion: 'keep' })]),
      kanjiNodeIdOf,
      charactersOf,
    );
    expect([...reach.byNodeId.keys()].sort()).toEqual(['jmdict-1500000', 'kanji:分', 'kanji:岐']);
  });

  it('lets the newest thread win, because snapshot.threads is newest first', () => {
    const newest = thread({ promotion: 'master', displayText: 'newest' });
    const older = thread({ promotion: 'captured', displayText: 'older' });
    const reach = reachOfThreads(snapshotOf([newest, older]), kanjiNodeIdOf, charactersOf);
    expect(reach.byNodeId.get('kanji:分')?.displayText).toBe('newest');
  });

  it('ignores a thread that never resolved to a lexeme', () => {
    const reach = reachOfThreads(
      snapshotOf([thread({ lexemeId: null })]),
      kanjiNodeIdOf,
      charactersOf,
    );
    expect(reach.byNodeId.size).toBe(0);
  });

  it('reports an unreached node as unseen through markForNode', () => {
    const reach = reachOfThreads(
      snapshotOf([thread({ promotion: 'keep' })]),
      kanjiNodeIdOf,
      charactersOf,
    );
    expect(isUnseen(markForNode(reach, 'kanji:森', 'reading').band)).toBe(true);
    expect(isUnseen(markForNode(reach, 'kanji:分', 'reading').band)).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 6. The readings handed to the domain's mismatch check
 * ------------------------------------------------------------------ */

describe('readings for a set of nodes', () => {
  const reach = reachOfThreads(
    {
      revision: 1,
      threads: [thread({ promotion: 'keep' })],
      threadsById: {},
      candidates: [],
      candidatesByThread: {},
      eventCount: 1,
    } as AppSnapshot,
    (character) => `kanji:${character}`,
    () => ['分'],
  );

  it('carries the ramp size, so two ramps are never compared', () => {
    for (const reading of readingsForNodes(['kanji:分', 'kanji:森'], reach, 'reading')) {
      expect(reading.steps).toBe(READING_STEPS);
      expect(reading.capability).toBe('reading');
      expect(reading.basis.length).toBeGreaterThan(0);
    }
  });

  it('produces one reading per node, in the order it was given them', () => {
    const ids = ['kanji:森', 'kanji:分', 'kanji:林'];
    expect(readingsForNodes(ids, reach, 'reading').map((reading) => reading.nodeId)).toEqual(ids);
  });

  it('keeps “never measured” apart from “measured and weak”', () => {
    const [lit, dark] = readingsForNodes(['kanji:分', 'kanji:森'], reach, 'reading');
    expect(lit?.unseen).toBe(false);
    expect(dark?.unseen).toBe(true);
    expect(dark?.step).toBe(NO_EVIDENCE_STEP);
  });

  it('reports every node as unseen under a lens this build has no source for', () => {
    const capability: CapabilityId = 'writing';
    for (const reading of readingsForNodes(['kanji:分', 'kanji:森'], reach, capability)) {
      expect(reading.unseen).toBe(true);
      expect(reading.step).toBe(NO_EVIDENCE_STEP);
    }
  });
});
