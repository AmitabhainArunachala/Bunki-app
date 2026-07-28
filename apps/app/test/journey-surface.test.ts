/**
 * Journeys, from the app end (Campaign E, lane B5; REQ-JRN-01/02/03).
 *
 * `packages/domain/test/journey/` proves the compiler and the criterion.
 * This file proves the *surface* over them, and it is written against four
 * failures this project has actually shipped in one form or another:
 *
 *   1. **A value that was never measured, presented as a measurement.** A
 *      hard-coded `latencyMs` of 0 reached a released build. Here the stumble's
 *      observations are asserted to be the event's own, on a log where the
 *      values are distinctive enough that a default would show.
 *   2. **A screen that writes.** The evidence gate is the sole factory for
 *      evidence. The journey projection is driven over a real store and the
 *      event count is asserted unchanged.
 *   3. **A second definition of a rule, drifting from the first.** The open
 *      condition explains the criterion clause by clause. A property test over
 *      generated observations asserts that "every clause met" and the kernel's
 *      own `qualifiesForRejoin` never disagree — so the explanation cannot
 *      drift into a different rule than the one being applied.
 *   4. **A comment asserting a property the code does not have.** Every claim
 *      this lane makes in prose about what it does *not* render is checked
 *      against the source here.
 *
 * There is no React Native test renderer in this project, so the components are
 * exercised through their pure modules and their rendered copy is checked by
 * source scan — the same split `session-canvas.test.ts` and
 * `screen-contract.test.ts` already use, and for the same reason.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  BRANCH_FAMILIES,
  applyJourneyRejoin,
  applySessionCommand,
  createDeterministicContext,
  enterJourneyBranch,
  evaluateJourneyRejoin,
  latestStumble,
  openJourney,
  qualifiesForRejoin,
  rejoinCriterion,
  type DomainContext,
  type Grade,
  type JourneyObservation,
  type SessionWorkspaceState,
} from '@bunki/domain';

import { DEFAULT_CANONICAL_TARGET, findLexemeByHeadword } from '../src/data/catalog.ts';
import {
  bootstrapSessionWorkspace,
  persistWorkspaceEvents,
  persistedEventIds,
  type SessionTarget,
} from '../src/screens/session-loop.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import type { AppStore } from '../src/state/store.ts';
import { forkGeometry } from '../src/ui/journey/fork-geometry.ts';
import { journeyHistory } from '../src/ui/journey/history.ts';
import {
  REJOIN_CLAUSE_IDS,
  openConditionFor,
  verdictFor,
} from '../src/ui/journey/open-conditions.ts';
import {
  RAIL_RESTING_OPACITY,
  railSummary,
  railsOf,
  railsOfState,
} from '../src/ui/journey/rails.ts';
import {
  REVEAL_CORRECTION_HAPPENS_AT_MINT,
  affordancesForLexeme,
  gradedReviews,
  isMiss,
  journeyObservationsFrom,
  observationsFor,
  stumblesFrom,
} from '../src/ui/journey/stumbles.ts';
import { MIN_UNLIT_OPACITY } from '../src/ui/theme.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string): string => readFileSync(resolve(APP_ROOT, relative), 'utf8');

/**
 * Source with comments removed, strings kept.
 *
 * Every source scan below is about what the surface *does* or *renders*, and
 * this lane's own docblocks have to be able to name the things it refuses to
 * build. `screen-contract.test.ts` reaches the same conclusion from the same
 * constraint, in the same words.
 */
const stripSourceComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ASOF = '2026-07-28T09:00:00.000Z';

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

/** The learner's own two gestures, exactly as the capture screen dispatches them. */
function takeUpForStudy(store: AppStore): string {
  const lexeme = findLexemeByHeadword(DEFAULT_CANONICAL_TARGET);
  if (lexeme === null) throw new Error('the seed has no canonical target');
  const kept = store.execute({
    kind: 'capture',
    text: lexeme.headword,
    sourceRef: MANUAL_SOURCE,
    provenance: MANUAL_PROVENANCE,
    uncertainty: null,
    lexemeId: lexeme.id,
  });
  store.execute({ kind: 'promote', threadId: kept.threadId, to: 'keep' });
  store.execute({ kind: 'promote', threadId: kept.threadId, to: 'learn' });
  return kept.threadId;
}

interface Loop {
  readonly context: DomainContext;
  readonly store: AppStore;
  readonly target: SessionTarget;
  workspace: SessionWorkspaceState;
  /** Persist whatever the last command minted, exactly as the session hook does. */
  readonly flush: () => void;
}

/**
 * A real sitting over a real store.
 *
 * Every event this produces was minted by `@bunki/domain` — evidence-class ones
 * through the evidence gate — and written with `persistMinted`, which is the
 * same path `session-loop.ts` uses. Nothing here hand-writes an event.
 */
function openLoop(prefix: string): Loop {
  const context = createDeterministicContext({ instants: ASOF, idPrefix: prefix });
  const store = createMemoryAppStore({ context });
  takeUpForStudy(store);

  const boot = bootstrapSessionWorkspace(store, context);
  if (boot.target === null) throw new Error(boot.error ?? 'the seed could not bootstrap a sitting');

  const persisted = persistedEventIds(store);
  const loop: Loop = {
    context,
    store,
    target: boot.target,
    workspace: boot.workspace,
    flush: () => persistWorkspaceEvents(store, loop.workspace, persisted),
  };

  loop.workspace = applySessionCommand(context, loop.workspace, {
    kind: 'start',
    timeBudgetMin: 10,
    newBudget: 2,
    asOf: ASOF,
    canvasId: boot.target.passage.id,
    labelByContract: boot.target.contractLabels,
  });
  loop.flush();
  return loop;
}

interface Attempt {
  readonly grade: Grade;
  readonly latencyMs: number;
  readonly hintsUsed: number;
  readonly revealedBeforeRecall: boolean;
}

function answer(loop: Loop, attempt: Attempt): void {
  loop.workspace = applySessionCommand(loop.context, loop.workspace, {
    kind: 'answerStep',
    attempt,
  });
  loop.flush();
}

/**
 * Answer the contract that stumbled, wherever the sitting's cursor happens to be.
 *
 * This is the Phase-0 repair screen's own path (`repairProbe`), and it is what
 * a journey's rejoin criterion needs: `answerStep` advances through the plan, so
 * a second answer lands on the *next* contract, and the criterion is bound to
 * the one that missed. Using the real path rather than a hand-built event is
 * the point — the evidence a journey rejoins on is minted by the evidence gate
 * somewhere else in the app, and the journey surface only reads it.
 */
function probeTheStumbledContract(loop: Loop, attempt: Attempt): void {
  const stumble = latestStumble(loop.workspace);
  if (stumble === null) throw new Error('nothing has been missed, so there is nothing to re-probe');

  if (loop.workspace.repair === null) {
    loop.workspace = applySessionCommand(loop.context, loop.workspace, {
      kind: 'openRepair',
      stumble,
    });
    loop.workspace = applySessionCommand(loop.context, loop.workspace, {
      kind: 'chooseRepairBranch',
      branch: loop.workspace.repair?.recommended ?? 'reading',
      at: ASOF,
    });
  }

  loop.workspace = applySessionCommand(loop.context, loop.workspace, {
    kind: 'repairProbe',
    attempt,
  });
  loop.flush();
}

/** The stumbles the screen would show, built exactly as `journey-screen.tsx` builds them. */
function stumblesOf(loop: Loop): ReturnType<typeof stumblesFrom> {
  const log = loop.store.readAll();
  const derived = loop.store.readDerived();
  const threadOf = (contractId: string): string | null => {
    const contract = derived.contracts.find((record) => record.contractId === contractId);
    return contract === undefined ? null : loop.target.threadId;
  };
  return stumblesFrom({
    log,
    state: derived,
    threadForContract: threadOf,
    lexemeForContract: () => loop.target.lexeme,
  });
}

// ---------------------------------------------------------------------------
// 1. The scheduler declares the branch — not the learner, not this surface
// ---------------------------------------------------------------------------

describe('a branch is opened by the evidence gate and by nothing else', () => {
  it('opens no branch on a fresh ledger', () => {
    const loop = openLoop('b5-fresh-');
    expect(stumblesOf(loop)).toEqual([]);
  });

  it('opens no branch on a success', () => {
    const loop = openLoop('b5-success-');
    answer(loop, { grade: 'good', latencyMs: 2100, hintsUsed: 0, revealedBeforeRecall: false });
    expect(stumblesOf(loop)).toEqual([]);
  });

  it('opens a branch on a miss the gate admitted', () => {
    const loop = openLoop('b5-miss-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });

    const stumbles = stumblesOf(loop);
    expect(stumbles).toHaveLength(1);
    expect(stumbles[0]?.effectiveGrade).toBe('again');
    expect(stumbles[0]?.threadId).toBe(loop.target.threadId);
  });

  /**
   * The reveal rule (T-06) is the case that matters most.
   *
   * The learner presses `good`; the gate records what they pressed and *counts*
   * `again`, because the answer was revealed before recall. A surface reading
   * `ReviewGraded.grade` would see a success and open nothing — missing exactly
   * the misses that most need a branch.
   */
  it('opens a branch on a good that the reveal rule corrected to again', () => {
    const loop = openLoop('b5-reveal-');
    answer(loop, { grade: 'good', latencyMs: 3400, hintsUsed: 0, revealedBeforeRecall: true });

    const reviews = gradedReviews(loop.store.readAll(), loop.store.readDerived());
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.event.revealedBeforeRecall).toBe(true);
    expect(reviews[0]?.effectiveGrade).toBe('again');
    expect(isMiss(reviews[0]!)).toBe(true);

    expect(stumblesOf(loop)).toHaveLength(1);
  });

  /**
   * The finding this suite produced, pinned so it cannot quietly change.
   *
   * `REVEAL_CORRECTION_HAPPENS_AT_MINT` records that this kernel applies T-06
   * in `mintReviewGraded`, before the event exists — not in the gate's decision
   * over an event that kept the submitted grade. The first draft of
   * `stumbles.ts` documented the second design, which is what the requirement
   * describes, and this test is what disproved it.
   *
   * If the kernel ever moves the correction to the gate, this fails, and the
   * docblock that depends on it gets revisited rather than silently going
   * stale in the other direction.
   */
  it('has already applied the reveal correction to the stored event', () => {
    const loop = openLoop('b5-mint-correction-');
    answer(loop, { grade: 'good', latencyMs: 3400, hintsUsed: 0, revealedBeforeRecall: true });

    const review = gradedReviews(loop.store.readAll(), loop.store.readDerived())[0];
    expect(review).toBeDefined();
    // The submitted grade is not retained anywhere in the log.
    expect(review?.event.grade).toBe('again');
    expect(review?.effectiveGrade).toBe(review?.event.grade);
    // …and so the gate's own `forcedByReveal` can never be true here.
    expect(review?.forcedByReveal).toBe(false);
    expect(REVEAL_CORRECTION_HAPPENS_AT_MINT.where).toContain('mintReviewGraded');
  });

  it('opens no branch on a review the gate refused', () => {
    // An `easy` with no confirmation is representable, recordable, and refused
    // (REQ-DM-07). Refused evidence is not evidence of a gap.
    const loop = openLoop('b5-refused-');
    answer(loop, { grade: 'easy', latencyMs: 800, hintsUsed: 0, revealedBeforeRecall: false });

    const reviews = gradedReviews(loop.store.readAll(), loop.store.readDerived());
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.admitted).toBe(false);
    expect(stumblesOf(loop)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Nothing is defaulted, invented, or hard-coded
// ---------------------------------------------------------------------------

describe('the stumble carries the ledger’s own numbers', () => {
  it('passes the measured latency through rather than defaulting it', () => {
    const loop = openLoop('b5-latency-');
    answer(loop, { grade: 'again', latencyMs: 9137, hintsUsed: 2, revealedBeforeRecall: false });

    const stumble = stumblesOf(loop)[0];
    expect(stumble?.observed.latencyMs).toBe(9137);
    expect(stumble?.observed.hintsUsed).toBe(2);
    expect(stumble?.observed.revealedBeforeRecall).toBe(false);
  });

  /**
   * The modalities come from the contract, not from what the fixture happens to
   * use. Asserted against the `ContractCreated` events the sitting actually
   * minted, so a rewrite that reintroduced a literal `'text'` would still pass
   * on this seed and fail the *next* assertion.
   */
  it('reads the cue and response modalities off the contract that was created', () => {
    const loop = openLoop('b5-modality-');
    answer(loop, { grade: 'again', latencyMs: 4000, hintsUsed: 0, revealedBeforeRecall: false });

    const stumble = stumblesOf(loop)[0];
    const created = loop.store
      .readAll()
      .find(
        (event) => event.type === 'ContractCreated' && event.contractId === stumble?.contractId,
      );
    expect(created?.type).toBe('ContractCreated');
    if (created?.type !== 'ContractCreated') throw new Error('no contract for the stumble');

    expect(stumble?.cueModality).toBe(created.cueModality);
    expect(stumble?.responseModality).toBe(created.responseModality);
    expect(stumble?.skill).toBe(created.skill);
  });

  it('counts prior misses on the same contract only', () => {
    const reviews = [
      { contractId: 'a', admitted: true, grade: 'again' as Grade },
      { contractId: 'b', admitted: true, grade: 'again' as Grade },
      { contractId: 'a', admitted: false, grade: 'again' as Grade },
      { contractId: 'a', admitted: true, grade: 'again' as Grade },
    ].map((row, index) => ({
      event: {
        eventId: `ev-${String(index)}`,
        contractId: row.contractId,
        grade: row.grade,
        latencyMs: 1000 + index,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        occurredAt: ASOF,
      },
      admitted: row.admitted,
      effectiveGrade: row.grade,
      forcedByReveal: false,
    })) as unknown as Parameters<typeof observationsFor>[0];

    // The last review: one earlier admitted miss on `a`, one refused, and one on
    // a different contract that must not be counted at all.
    const observed = observationsFor(reviews, 3);
    expect(observed.priorStumbleCount).toBe(1);
    expect(observed.lapses).toBe(1);
    expect(observed.admittedReviewCount).toBe(1);
  });

  it('answers an affordance false rather than optimistically true', () => {
    const lexeme = findLexemeByHeadword(DEFAULT_CANONICAL_TARGET);
    const available = affordancesForLexeme(lexeme, { hasProductionContract: false });

    // Real, from the seed.
    expect(available.hasComponents).toBe(true);
    expect(available.hasReadingFamily).toBe(true);

    // Not available in this build, and not claimed.
    expect(available.hasGrammarConstruction).toBe(false);
    expect(available.hasAudio).toBe(false);
    expect(available.writingActivated).toBe(false);
  });

  it('gives a word the seed does not hold no routes that need one', () => {
    const available = affordancesForLexeme(null, { hasProductionContract: false });
    expect(Object.values(available).every((flag) => flag === false)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. The untaken rails are dimmed, never deleted
// ---------------------------------------------------------------------------

describe('the fork keeps every road on it (frozen spec §3)', () => {
  const journeyFor = (loop: Loop): ReturnType<typeof openJourney> => {
    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no stumble to open a journey on');
    return openJourney(stumble);
  };

  it('draws all six families, whatever was offered', () => {
    const loop = openLoop('b5-rails-');
    answer(loop, { grade: 'again', latencyMs: 5000, hintsUsed: 0, revealedBeforeRecall: false });
    const rails = railsOfState(journeyFor(loop));

    expect(rails.map((rail) => rail.family)).toEqual([...BRANCH_FAMILIES]);
  });

  it('marks the roads with nowhere to go as closed, with the reason', () => {
    const loop = openLoop('b5-closed-');
    answer(loop, { grade: 'again', latencyMs: 5000, hintsUsed: 0, revealedBeforeRecall: false });
    const rails = railsOfState(journeyFor(loop));

    const closed = rails.filter((rail) => rail.state === 'closed');
    expect(closed.length).toBeGreaterThan(0);
    for (const rail of closed) {
      expect(rail.closedBecause, `${rail.family} is closed with no reason`).toBeTruthy();
      expect(rail.enterable).toBe(false);
    }
  });

  it('leaves the other roads open once one is taken, and never hides them', () => {
    const loop = openLoop('b5-taken-');
    answer(loop, { grade: 'again', latencyMs: 5000, hintsUsed: 0, revealedBeforeRecall: false });

    const journey = journeyFor(loop);
    const first = journey.compiled.offered[0];
    if (first === undefined) throw new Error('nothing was offered');
    const entered = enterJourneyBranch(journey, first.family, ASOF);
    const rails = railsOfState(entered);

    expect(rails).toHaveLength(BRANCH_FAMILIES.length);
    expect(rails.filter((rail) => rail.state === 'taking')).toHaveLength(1);
    expect(rails.filter((rail) => rail.state === 'open').length).toBeGreaterThan(0);
  });

  /**
   * The load-bearing assertion of this whole component.
   *
   * `BranchLight` floors an unlit branch at `MIN_UNLIT_OPACITY` and this table
   * is what is handed to it, so a value below the floor would be silently
   * raised — which is safe, and would also make the table a lie. Asserting the
   * table itself is above the floor keeps the two honest together.
   */
  it('never asks for an opacity that would hide a rail', () => {
    for (const [state, opacity] of Object.entries(RAIL_RESTING_OPACITY)) {
      expect(opacity, `${state} would be drawn below the floor`).toBeGreaterThanOrEqual(
        MIN_UNLIT_OPACITY,
      );
      expect(opacity).toBeLessThanOrEqual(1);
    }
  });

  it('summarises the fork in counts rather than adjectives', () => {
    const loop = openLoop('b5-summary-');
    answer(loop, { grade: 'again', latencyMs: 5000, hintsUsed: 0, revealedBeforeRecall: false });
    const rails = railsOfState(journeyFor(loop));
    const summary = railSummary(rails);

    const open = rails.filter((rail) => rail.state === 'open').length;
    expect(summary).toContain(String(open));
    expect(summary).not.toMatch(/good|bad|well|poor|only/i);
  });

  it('offers no road the domain would refuse to enter', () => {
    const loop = openLoop('b5-enterable-');
    answer(loop, { grade: 'again', latencyMs: 5000, hintsUsed: 0, revealedBeforeRecall: false });
    const journey = journeyFor(loop);

    for (const rail of railsOfState(journey)) {
      const after = enterJourneyBranch(journey, rail.family, ASOF);
      // `enterJourneyBranch` returns the state unchanged when it refuses.
      expect(rail.enterable, `${rail.family} claims to be enterable`).toBe(after !== journey);
    }
  });

  /**
   * The repair the three-state version needed.
   *
   * REQ-JRN-02 caps the offer at three paths. A fourth admissible family is
   * therefore *not offered* and has nowhere-to-go set to `null` by the
   * compiler, and the first version of `railsOf` called it `closed` and
   * rendered "nowhere to go for this word" beside a blank reason — a false
   * statement about the learner's own data. This case is built by hand rather
   * than from the seed so it holds whatever the seed contains.
   */
  it('tells a road ranked out of the offer from a road with nowhere to go', () => {
    const cause = (family: string, admissible: boolean) => ({
      family,
      hypothesis: `The ${family} route may be it.`,
      work: 'Do the thing.',
      support: [],
      admissible,
      unavailableBecause: admissible ? null : 'the graph holds nothing for this route',
    });

    const compiled = {
      stumble: {} as never,
      basis: 'repeated_stumble' as const,
      hypotheses: [
        cause('form_reading_aural', true),
        cause('sense_meaning_contrast', true),
        cause('task_misunderstanding', true),
        // Admissible, and beyond the ceiling of three.
        cause('kanji_structure_writing', true),
        cause('grammar_construction', false),
        cause('usage_production_register', false),
      ],
      offered: [
        { family: 'form_reading_aural', label: 'a', hypothesis: 'h', work: 'w', support: [] },
        { family: 'sense_meaning_contrast', label: 'b', hypothesis: 'h', work: 'w', support: [] },
        { family: 'task_misunderstanding', label: 'c', hypothesis: 'h', work: 'w', support: [] },
      ],
      probes: [],
      recommended: 'form_reading_aural' as const,
    } as unknown as Parameters<typeof railsOf>[0];

    const byFamily = new Map(railsOf(compiled, null).map((rail) => [rail.family, rail]));

    expect(byFamily.get('kanji_structure_writing')?.state).toBe('held_back');
    expect(byFamily.get('grammar_construction')?.state).toBe('closed');
    expect(byFamily.get('form_reading_aural')?.state).toBe('open');

    // The held-back road makes no claim about the data, and the closed one
    // carries the compiler's reason rather than a blank.
    expect(byFamily.get('kanji_structure_writing')?.closedBecause).toBeNull();
    expect(byFamily.get('grammar_construction')?.closedBecause).toBeTruthy();

    // Neither can be entered, and neither disappears.
    expect(byFamily.get('kanji_structure_writing')?.enterable).toBe(false);
    expect(byFamily.get('grammar_construction')?.enterable).toBe(false);
    expect(byFamily.size).toBe(6);
  });

  it('carries a reason exactly when a rail is closed', () => {
    const loop = openLoop('b5-reason-');
    answer(loop, { grade: 'again', latencyMs: 5000, hintsUsed: 0, revealedBeforeRecall: false });

    for (const rail of railsOfState(journeyFor(loop))) {
      expect((rail.closedBecause !== null) === (rail.state === 'closed'), rail.family).toBe(true);
    }
  });

  it('produces a rail for every offered family, and a compiled journey with none offered draws none', () => {
    const emptyOffer = {
      stumble: {} as never,
      basis: 'single_stumble' as const,
      hypotheses: [],
      offered: [],
      probes: [],
      recommended: 'sense_meaning_contrast' as const,
    };
    expect(railsOf(emptyOffer, null)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. The drawing follows the rows
// ---------------------------------------------------------------------------

describe('the fork drawing', () => {
  it('gives every row a path that lands inside the canvas', () => {
    const centres = [40, 130, 260, 410];
    const geometry = forkGeometry({ rowCentres: centres, height: 480 });

    expect(geometry.rails).toHaveLength(centres.length);
    for (const [index, rail] of geometry.rails.entries()) {
      expect(rail.endY).toBe(centres[index]);
      expect(rail.endX).toBeGreaterThan(0);
      expect(rail.endX).toBeLessThanOrEqual(geometry.width);
      expect(rail.endY).toBeLessThanOrEqual(geometry.height);
      expect(rail.d.startsWith(`M ${String(geometry.forkX)} ${String(geometry.forkY)}`)).toBe(true);
    }
  });

  it('draws the return to the main line only for the road the evidence closed', () => {
    const geometry = forkGeometry({ rowCentres: [40, 130, 260], height: 320, rejoinedIndex: 1 });
    expect(geometry.rails.map((rail) => rail.rejoinD === null)).toEqual([true, false, true]);
  });

  it('draws no return when nothing has rejoined', () => {
    const geometry = forkGeometry({ rowCentres: [40, 130], height: 200 });
    expect(geometry.rails.every((rail) => rail.rejoinD === null)).toBe(true);
  });

  it('is deterministic, so two renders of one fork are byte-identical', () => {
    const options = { rowCentres: [41.37, 129.812, 260.5], height: 333.33, rejoinedIndex: 0 };
    expect(forkGeometry(options)).toEqual(forkGeometry(options));
  });

  it('keeps the branch point above the first row and on the canvas', () => {
    for (const first of [8, 20, 60, 400]) {
      const geometry = forkGeometry({ rowCentres: [first, first + 120], height: first + 240 });
      expect(geometry.forkY).toBeGreaterThan(0);
      expect(geometry.forkY).toBeLessThan(first);
    }
  });

  it('draws a trunk and no rails when there are no rows yet', () => {
    const geometry = forkGeometry({ rowCentres: [], height: 0 });
    expect(geometry.rails).toEqual([]);
    expect(geometry.trunkD).toContain('M ');
  });
});

// ---------------------------------------------------------------------------
// 5. Rejoin is evidence-defined, and the explanation cannot drift from the rule
// ---------------------------------------------------------------------------

describe('the open condition explains the criterion without redefining it', () => {
  const criterion = rejoinCriterion('contract-x');
  const ENTERED = '2026-07-28T10:00:00.000Z';

  /**
   * Every shape an observation can take, crossed.
   *
   * 2 contracts × 4 grades × 2 admitted × 3 hint counts × 2 reveals × 3 instants
   * = 288 cases, which is small enough to enumerate exhaustively and therefore
   * better than sampling: an exhaustive cross cannot miss the one combination a
   * generator happened not to draw.
   */
  const cases: JourneyObservation[] = [];
  for (const contractId of ['contract-x', 'contract-other']) {
    for (const effectiveGrade of ['again', 'hard', 'good', 'easy'] as const) {
      for (const admitted of [true, false]) {
        for (const hintsUsed of [0, 1, 3]) {
          for (const revealedBeforeRecall of [false, true]) {
            for (const at of ['2026-07-28T09:59:59.999Z', ENTERED, '2026-07-28T10:00:00.001Z']) {
              cases.push({
                eventId: `ev-${String(cases.length)}`,
                contractId,
                effectiveGrade,
                admitted,
                hintsUsed,
                revealedBeforeRecall,
                sessionId: null,
                at,
              });
            }
          }
        }
      }
    }
  }

  it('enumerates enough cases to be worth running', () => {
    expect(cases).toHaveLength(288);
  });

  /**
   * The anti-drift assertion.
   *
   * The panel renders `verdictFor`'s clause breakdown; the branch actually
   * closes on `qualifiesForRejoin`. If those two ever disagree the screen is
   * explaining a rule the kernel is not applying, which is precisely the class
   * of defect this project keeps finding.
   */
  it.each(cases.map((observation, index) => [index, observation] as const))(
    'agrees with the kernel on case %i',
    (_index, observation) => {
      const verdict = verdictFor(criterion, ENTERED, observation);
      const allClausesMet = REJOIN_CLAUSE_IDS.every((id) => verdict.met[id]);
      expect(allClausesMet).toBe(qualifiesForRejoin(criterion, ENTERED, observation));
      expect(verdict.qualifies).toBe(qualifiesForRejoin(criterion, ENTERED, observation));
      expect(verdict.openClauses.length === 0).toBe(verdict.qualifies);
    },
  );

  it('states the condition before a road has been taken', () => {
    const condition = openConditionFor(criterion, null, cases);
    expect(condition.statement).toBe(criterion.statement);
    expect(condition.clauses).toHaveLength(REJOIN_CLAUSE_IDS.length);
    expect(condition.satisfied).toBe(false);
    expect(condition.considered).toEqual([]);
  });

  it('accounts for the answers that did not qualify rather than hiding them', () => {
    const condition = openConditionFor(criterion, ENTERED, cases);
    const refused = condition.considered.filter((verdict) => !verdict.qualifies);
    expect(refused.length).toBeGreaterThan(0);
    for (const verdict of refused) {
      expect(verdict.openClauses.length).toBeGreaterThan(0);
    }
  });

  it('looks only at answers on the contracts the criterion names', () => {
    const condition = openConditionFor(criterion, ENTERED, cases);
    expect(condition.considered).toHaveLength(
      cases.filter((observation) => observation.contractId === 'contract-x').length,
    );
  });
});

describe('rejoin happens because the evidence held, not because anything was tapped', () => {
  it('stays open through a hinted success and closes on an unaided one', () => {
    const loop = openLoop('b5-rejoin-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });

    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');

    let journey = openJourney(stumble);
    const first = journey.compiled.offered[0];
    if (first === undefined) throw new Error('nothing was offered');
    journey = enterJourneyBranch(journey, first.family, ASOF);
    expect(journey.phase).toBe('in_branch');

    // A hinted success on the contract that missed. Real evidence, admitted by
    // the gate, and it does not close the branch: a hinted success is a success
    // of the hint.
    probeTheStumbledContract(loop, {
      grade: 'good',
      latencyMs: 2500,
      hintsUsed: 1,
      revealedBeforeRecall: false,
    });
    let observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    journey = applyJourneyRejoin(journey, evaluateJourneyRejoin(journey, observations));
    expect(journey.phase).toBe('in_branch');

    let condition = openConditionFor(journey.criterion, journey.enteredAt, observations);
    expect(condition.satisfied).toBe(false);
    expect(condition.considered.some((verdict) => verdict.openClauses.includes('unaided'))).toBe(
      true,
    );

    // An unaided success on the same contract. Nothing is pressed on the journey
    // surface; the ledger moved, and the phase follows.
    probeTheStumbledContract(loop, {
      grade: 'good',
      latencyMs: 2100,
      hintsUsed: 0,
      revealedBeforeRecall: false,
    });
    observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    journey = applyJourneyRejoin(journey, evaluateJourneyRejoin(journey, observations));

    expect(journey.phase).toBe('rejoined');
    expect(journey.rejoinedByEventIds.length).toBeGreaterThan(0);

    condition = openConditionFor(journey.criterion, journey.enteredAt, observations);
    expect(condition.satisfied).toBe(true);
  });

  it('cannot be closed by anything other than a satisfied criterion', () => {
    const loop = openLoop('b5-no-tap-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });

    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');
    let journey = openJourney(stumble);
    const first = journey.compiled.offered[0];
    if (first === undefined) throw new Error('nothing was offered');
    journey = enterJourneyBranch(journey, first.family, ASOF);

    // Fifty applications with an unchanged ledger. If a tap could close a
    // branch, this is the shape it would take.
    const observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    for (let attempt = 0; attempt < 50; attempt += 1) {
      journey = applyJourneyRejoin(journey, evaluateJourneyRejoin(journey, observations));
    }
    expect(journey.phase).toBe('in_branch');
  });

  it('does not credit evidence from before the road was taken', () => {
    const loop = openLoop('b5-before-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });
    // An unaided success on the same contract, recorded at the same fixed clock
    // instant as everything else, and therefore *not* after a branch entered a
    // second later.
    probeTheStumbledContract(loop, {
      grade: 'good',
      latencyMs: 2000,
      hintsUsed: 0,
      revealedBeforeRecall: false,
    });

    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');
    let journey = openJourney(stumble);
    const first = journey.compiled.offered[0];
    if (first === undefined) throw new Error('nothing was offered');
    journey = enterJourneyBranch(journey, first.family, '2026-07-28T09:00:01.000Z');

    const observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    journey = applyJourneyRejoin(journey, evaluateJourneyRejoin(journey, observations));
    expect(journey.phase).toBe('in_branch');

    const condition = openConditionFor(journey.criterion, journey.enteredAt, observations);
    expect(
      condition.considered.some((verdict) =>
        verdict.openClauses.includes('after_the_branch_opened'),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. The surface writes nothing
// ---------------------------------------------------------------------------

describe('the journey surface displays state and submits no commands', () => {
  it('leaves the ledger exactly as it found it', () => {
    const loop = openLoop('b5-readonly-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });

    const before = loop.store.readAll().length;
    const snapshotBefore = loop.store.getSnapshot().eventCount;

    // Everything the screen does on a render, and then some: build the stumbles,
    // open a journey, answer a probe, take a road, evaluate a rejoin, leave.
    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');
    let journey = openJourney(stumble);
    const observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    const first = journey.compiled.offered[0];
    if (first === undefined) throw new Error('nothing was offered');
    journey = enterJourneyBranch(journey, first.family, ASOF);
    journey = applyJourneyRejoin(journey, evaluateJourneyRejoin(journey, observations));
    openConditionFor(journey.criterion, journey.enteredAt, observations);
    railsOfState(journey);
    journeyHistory(journey, openConditionFor(journey.criterion, journey.enteredAt, observations));

    expect(loop.store.readAll()).toHaveLength(before);
    expect(loop.store.getSnapshot().eventCount).toBe(snapshotBefore);
  });

  it('never reaches a write on the store, in source', () => {
    const source = read('src/screens/journey-screen.tsx');
    const modules = [
      'src/ui/journey/stumbles.ts',
      'src/ui/journey/rails.ts',
      'src/ui/journey/open-conditions.ts',
      'src/ui/journey/history.ts',
      'src/ui/journey/fork-geometry.ts',
      'src/ui/journey/branch-fork.tsx',
      'src/ui/journey/open-condition-panel.tsx',
      'src/ui/journey/journey-history.tsx',
    ].map(read);

    // Comments stripped, for the reason `screen-contract.test.ts` gives: this
    // lane's own docblocks have to be able to *name* the methods it refuses to
    // call, and a raw scan would make every explanation of the rule a violation
    // of it. `journey-screen.tsx`'s header names `persistMinted` by name.
    for (const raw of [source, ...modules]) {
      const text = stripSourceComments(raw);
      expect(text).not.toMatch(/store\.execute\b/);
      expect(text).not.toMatch(/persistMinted/);
      expect(text).not.toMatch(/createDomainEvent/);
      expect(text).not.toMatch(/sealMintedEvents/);
    }
  });

  /**
   * A probe answer routes and never grades.
   *
   * The domain makes this structural — `DiagnosticProbe.producesEvidence` is the
   * literal `false` — and the surface has to not undo it. The only handler the
   * probe chips have is `answerProbe`, which is a pure transition on a value in
   * React state.
   */
  it('routes a probe answer through answerProbe and nothing else', () => {
    const source = read('src/screens/journey-screen.tsx');
    const probeHandler = /onPress=\{\(\) =>\s*setJourney\(\(current\) => answerProbe\(/;
    expect(source).toMatch(probeHandler);
  });
});

// ---------------------------------------------------------------------------
// 7. A consequence, never a punishment; and no gamification by any name
// ---------------------------------------------------------------------------

describe('the register of the surface', () => {
  const surfaces = [
    'src/screens/journey-screen.tsx',
    'src/ui/journey/rails.ts',
    'src/ui/journey/open-conditions.ts',
    'src/ui/journey/open-condition-panel.tsx',
    'src/ui/journey/history.ts',
    'src/ui/journey/journey-history.tsx',
    'src/ui/journey/branch-fork.tsx',
    'src/ui/journey/stumbles.ts',
  ];

  /**
   * Scanned with comments stripped, for the reason `screen-contract.test.ts`
   * gives: this lane has to be able to *name* the things it refuses to build,
   * and a raw scan would make every explanation of a ban a violation of it.
   */
  const stripComments = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  const BANNED = [
    /\bstreak\b/i,
    /\bXP\b/,
    /\bbadge/i,
    /\bconfetti\b/i,
    /\bcongratulat/i,
    /\bwell done\b/i,
    /\bdays active\b/i,
    /\bleague\b/i,
    /\bpoints?\s+earned\b/i,
    /\bmastery\b/i,
    /\bkeep it up\b/i,
  ];

  it.each(BANNED)('renders nothing matching %s', (pattern) => {
    for (const file of surfaces) {
      expect(pattern.test(stripComments(read(file))), file).toBe(false);
    }
  });

  const FAILURE_LANGUAGE = [
    /\byou failed\b/i,
    /\bwrong answer\b/i,
    /\bincorrect\b/i,
    /\byou got it wrong\b/i,
    /\babandoned\b/i,
    /\bpenalt/i,
  ];

  it.each(FAILURE_LANGUAGE)('uses no failure language matching %s', (pattern) => {
    for (const file of surfaces) {
      expect(pattern.test(stripComments(read(file))), file).toBe(false);
    }
  });

  it('renders no percentage and no progress bar', () => {
    for (const file of surfaces) {
      const body = stripComments(read(file));
      expect(body, file).not.toMatch(/\d\s*%/);
      expect(body, file).not.toMatch(/progress\s*bar/i);
    }
  });

  /**
   * Every hypothesis the fork renders is conditional.
   *
   * The strings come from `@bunki/domain`'s own family rules, so this is really
   * an assertion that the surface renders them rather than paraphrasing — but a
   * paraphrase is exactly what a later edit would reach for, and REQ-JRN-01
   * forbids the confident version.
   */
  it('states every route as a possibility rather than a diagnosis', () => {
    const loop = openLoop('b5-register-');
    answer(loop, { grade: 'again', latencyMs: 5000, hintsUsed: 0, revealedBeforeRecall: false });
    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');

    for (const rail of railsOfState(openJourney(stumble))) {
      expect(rail.hypothesis, rail.family).toMatch(/\bmay\b|\bmight\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// 8. The history says what opened it, what has been tried, what is left
// ---------------------------------------------------------------------------

describe('the journey’s own history', () => {
  it('opens with the miss, and names the record it came from', () => {
    const loop = openLoop('b5-history-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });
    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');

    const journey = openJourney(stumble);
    const observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    const entries = journeyHistory(
      journey,
      openConditionFor(journey.criterion, journey.enteredAt, observations),
    );

    expect(entries[0]?.kind).toBe('opened');
    expect(entries[0]?.at).toBe(stumble.at);
    expect(entries[0]?.detail).toContain(stumble.eventId);
    expect(entries[0]?.detail).toContain(stumble.contractId);
  });

  it('records taking a road, and the answers offered afterwards, in that order', () => {
    const loop = openLoop('b5-history-order-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });
    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');

    let journey = openJourney(stumble);
    const first = journey.compiled.offered[0];
    if (first === undefined) throw new Error('nothing was offered');
    journey = enterJourneyBranch(journey, first.family, '2026-07-28T09:00:00.000Z');
    probeTheStumbledContract(loop, {
      grade: 'good',
      latencyMs: 2100,
      hintsUsed: 0,
      revealedBeforeRecall: false,
    });

    const observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    journey = applyJourneyRejoin(journey, evaluateJourneyRejoin(journey, observations));
    const entries = journeyHistory(
      journey,
      openConditionFor(journey.criterion, journey.enteredAt, observations),
    );

    const kinds = entries.map((entry) => entry.kind);
    expect(kinds.indexOf('entered')).toBeGreaterThan(kinds.indexOf('opened'));
    expect(kinds.indexOf('answer_offered')).toBeGreaterThan(kinds.indexOf('entered'));
    expect(kinds).toContain('rejoined');
    expect(kinds.indexOf('rejoined')).toBe(kinds.length - 1);
  });

  it('calls stepping off a road what it is, and claims no repair for it', () => {
    const loop = openLoop('b5-history-left-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });
    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');

    let journey = openJourney(stumble);
    const first = journey.compiled.offered[0];
    if (first === undefined) throw new Error('nothing was offered');
    journey = enterJourneyBranch(journey, first.family, ASOF);

    const observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    const entries = journeyHistory(
      { ...journey, phase: 'left' },
      openConditionFor(journey.criterion, journey.enteredAt, observations),
    );

    const left = entries.find((entry) => entry.kind === 'left');
    expect(left?.detail).toContain('still in the ledger');
    expect(left?.what).not.toMatch(/fail|abandon|give up/i);
  });

  it('carries no clock reading it did not get from the ledger', () => {
    const loop = openLoop('b5-history-instants-');
    answer(loop, { grade: 'again', latencyMs: 9000, hintsUsed: 0, revealedBeforeRecall: false });
    const stumble = stumblesOf(loop)[0];
    if (stumble === undefined) throw new Error('no branch opened');

    const journey = openJourney(stumble);
    const observations = journeyObservationsFrom(loop.store.readAll(), loop.store.readDerived());
    const known = new Set<string>([...loop.store.readAll().map((event) => event.occurredAt), ASOF]);

    for (const entry of journeyHistory(
      journey,
      openConditionFor(journey.criterion, journey.enteredAt, observations),
    )) {
      if (entry.at === null) continue;
      expect(known.has(entry.at), `${entry.kind} invented the instant ${entry.at}`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 9. The screen is honest about what it does not have
// ---------------------------------------------------------------------------

describe('what the surface says it cannot do', () => {
  it('says on screen that it cannot check successes on different days', () => {
    const source = read('src/screens/journey-screen.tsx');
    expect(source).toContain('SEPARATE_SITTINGS_NOT_AVAILABLE');
  });

  it('never asks a criterion for something no event in this log could satisfy', () => {
    // `requireSeparateSessions` would be checked against a `sessionId` no event
    // carries. Nothing in this lane may request it.
    for (const file of ['src/screens/journey-screen.tsx', 'src/ui/journey/stumbles.ts']) {
      const body = read(file).replace(/\/\*[\s\S]*?\*\//g, ' ');
      expect(body, file).not.toMatch(/requireSeparateSessions:\s*true/);
    }
  });

  it('mounts the EDRDG acknowledgement, unconditionally', () => {
    const source = read('src/screens/journey-screen.tsx');
    const rendered = [...source.matchAll(/<SeedEntryDisclosure[\s/>]/g)];
    expect(rendered.length).toBeGreaterThan(0);
    for (const match of rendered) {
      const preceding = source.slice(Math.max(0, match.index - 24), match.index);
      expect(preceding).not.toMatch(/[?&]{1,2}\s*$/);
    }
  });
});
