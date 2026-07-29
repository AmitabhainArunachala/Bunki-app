/**
 * The SRS studies every word you take up, not the one that has a passage.
 *
 * ## The defect this file exists to keep closed
 *
 * `chooseSessionTarget` walked the learner's promoted threads and skipped any
 * whose lexeme the hand-written passage does not embed. Controller §8 ships
 * exactly one passage. So the reachable behaviour was:
 *
 *   - promote 時間, 学校 and 友達 — three JMdict entries this build ships;
 *   - open 稽古 Session;
 *   - be told **"Nothing is taken up for study yet."**
 *
 * Three words taken up, an empty state that says none were. The clause "add
 * anything to study, in one action" — the first thing an SRS standing alone has
 * to do — was false for 2,999 of the 3,000 entries in the dictionary tier, and
 * nothing in the suite noticed because every session test promoted 分岐.
 *
 * Each case below fails against that version. They are driven through
 * `bootstrapSessionWorkspace` and `applySessionCommand` — the exact functions
 * the session screen calls, with the screen's own arguments — because this
 * project has no React Native test renderer and a behaviour that existed only
 * inside a component would be unverifiable.
 */

import { describe, expect, it } from 'vitest';

import {
  applySessionCommand,
  createDeterministicContext,
  createSessionWorkspace,
  replay,
  srsStanding,
  type DomainContext,
} from '@bunki/domain';

import { findLexemeByHeadword, passageForLexeme } from '../src/data/catalog.ts';
import {
  bootstrapSessionWorkspace,
  chooseStudyTargets,
  contractLabelsForAll,
} from '../src/screens/session-loop.ts';
import { spinesFrom } from '../src/ui/session/spines.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import type { AppStore } from '../src/state/store.ts';

const ASOF = '2026-07-27T10:00:00.000Z';

const newContext = (prefix = 'app-pillars-'): DomainContext =>
  createDeterministicContext({ instants: ASOF, idPrefix: prefix });

const MANUAL_PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

/**
 * The learner's own gestures, exactly as the screens dispatch them.
 *
 * `locator` is a parameter because the spine derivation reads it, and because
 * the app really does write different locators from different surfaces.
 */
function takeUpForStudy(store: AppStore, headword: string, locator = 'capture-screen'): string {
  const lexeme = findLexemeByHeadword(headword);
  if (lexeme === null) throw new Error(`the dictionary has no entry for ${headword}`);
  const kept = store.execute({
    kind: 'capture',
    text: lexeme.headword,
    sourceRef: { sourceId: 'manual-entry', kind: 'manual', locator },
    provenance: MANUAL_PROVENANCE,
    uncertainty: null,
    lexemeId: lexeme.id,
  });
  // Guarded exactly as the capture screen guards it. A second Keep of the same
  // word deduplicates into the same thread, and re-issuing `promote → keep` on a
  // thread already at `learn` is a *demotion* — which is what the screen's
  // `thread.state.promotion === 'captured'` check and its
  // `isPromotionActive(...)` branch exist to prevent.
  const promotionOf = (): string =>
    store.getSnapshot().threadsById[kept.threadId]?.state.promotion ?? 'captured';
  if (promotionOf() === 'captured') {
    store.execute({ kind: 'promote', threadId: kept.threadId, to: 'keep' });
  }
  if (promotionOf() === 'keep') {
    store.execute({ kind: 'promote', threadId: kept.threadId, to: 'learn' });
  }
  return kept.threadId;
}

/**
 * Three words that are **not** in the seed's hand-written passage.
 *
 * Asserted rather than assumed, at the top of the file, so that a later change
 * to the passage cannot quietly turn every case below into a test of the old
 * behaviour passing for the wrong reason.
 */
const OFF_PASSAGE = ['時間', '学校', '友達'] as const;

describe('the words the fixture passage does not contain', () => {
  it('really are outside it', () => {
    for (const headword of OFF_PASSAGE) {
      const lexeme = findLexemeByHeadword(headword);
      expect(lexeme, `the dictionary tier should ship ${headword}`).not.toBeNull();
      expect(passageForLexeme(lexeme?.id ?? ''), headword).toBeNull();
    }
  });
});

describe('a sitting over words with no passage', () => {
  it('is planned, and is not the empty state', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    for (const headword of OFF_PASSAGE) takeUpForStudy(store, headword);

    const boot = bootstrapSessionWorkspace(store, context);

    // The canvas target is genuinely absent — nothing promoted is in the
    // passage — and that is now an ordinary sitting rather than no sitting.
    expect(boot.target).toBeNull();
    expect(boot.error).toBeNull();
    expect(boot.studyTargets).toHaveLength(3);
  });

  it('mints a reading and a meaning contract for every promoted word', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    for (const headword of OFF_PASSAGE) takeUpForStudy(store, headword);

    const boot = bootstrapSessionWorkspace(store, context);
    const contracts = boot.workspace.log.filter((event) => event.type === 'ContractCreated');
    expect(contracts).toHaveLength(OFF_PASSAGE.length * 2);
    expect(new Set(contracts.map((event) => event.eventId)).size).toBe(contracts.length);
  });

  it('composes a plan whose steps are those words, never a raw contract id', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    for (const headword of OFF_PASSAGE) takeUpForStudy(store, headword);

    const boot = bootstrapSessionWorkspace(store, context);
    const started = applySessionCommand(context, boot.workspace, {
      kind: 'start',
      timeBudgetMin: 12,
      newBudget: 1,
      asOf: ASOF,
      labelByContract: contractLabelsForAll(boot.studyTargets),
    });

    const runtime = started.runtime;
    expect(runtime).not.toBeNull();
    const steps = runtime?.plan.steps ?? [];
    expect(steps.length).toBeGreaterThan(1);

    // No canvas step, because no canvas was named.
    expect(steps.some((step) => step.kind === 'canvas')).toBe(false);
    // Every step ends in a closure, whatever else it holds.
    expect(steps.at(-1)?.kind).toBe('closure');

    for (const step of steps) {
      expect(step.label).not.toMatch(/^contract-/);
    }
    // At least one step is about a word the passage does not contain — the whole
    // point.
    expect(steps.some((step) => OFF_PASSAGE.some((word) => step.label.startsWith(word)))).toBe(
      true,
    );
  });

  it('reports every one of them in the standing, per lens, with no total', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    for (const headword of OFF_PASSAGE) takeUpForStudy(store, headword);

    const boot = bootstrapSessionWorkspace(store, context);
    const standing = srsStanding(replay(boot.workspace.log), { asOf: ASOF });

    expect(standing.contractCount).toBe(OFF_PASSAGE.length * 2);
    const reading = standing.lenses.find((lens) => lens.lens === 'reading');
    const meaning = standing.lenses.find((lens) => lens.lens === 'meaning');
    expect(reading?.contractCount).toBe(OFF_PASSAGE.length);
    expect(meaning?.contractCount).toBe(OFF_PASSAGE.length);
  });
});

describe('a sitting that mixes a passage word with words that have none', () => {
  it('keeps the canvas step and still plans over all of them', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    takeUpForStudy(store, '分岐');
    for (const headword of OFF_PASSAGE) takeUpForStudy(store, headword);

    const boot = bootstrapSessionWorkspace(store, context);
    expect(boot.target).not.toBeNull();
    expect(boot.target?.lexeme.headword).toBe('分岐');
    expect(boot.studyTargets).toHaveLength(4);

    const started = applySessionCommand(context, boot.workspace, {
      kind: 'start',
      timeBudgetMin: 30,
      newBudget: 1,
      canvasId: boot.target?.passage.id,
      asOf: ASOF,
      labelByContract: contractLabelsForAll(boot.studyTargets),
    });
    const steps = started.runtime?.plan.steps ?? [];
    expect(steps.some((step) => step.kind === 'canvas')).toBe(true);

    /*
      Exactly one review step, and that is correct rather than a shortfall.

      Nothing has been answered yet, so all eight contracts are in phase `new`,
      and controller §6.4 admits at most one new item per sitting
      (`PHASE0_MAX_NEW_ITEMS`). The property this case is about is *which* words
      the planner may draw that one from — it is now the whole promoted set
      rather than only the passage word. The multi-word case below is what shows
      several steps once there is history to draw on.
    */
    const reviewSteps = steps.filter((step) => step.contractId !== null);
    expect(reviewSteps).toHaveLength(1);
    expect(steps.filter((step) => step.kind === 'new')).toHaveLength(1);
    // The one new item is one of the four promoted words, labelled by headword.
    expect(['分岐', ...OFF_PASSAGE].some((word) => reviewSteps[0]?.label.startsWith(word))).toBe(
      true,
    );
  });

  it('draws several words into one sitting once they have history', () => {
    const context = newContext('app-pillars-history-');
    const store = createMemoryAppStore({ context });
    takeUpForStudy(store, '時間');
    takeUpForStudy(store, '学校');

    const boot = bootstrapSessionWorkspace(store, context);
    const labels = contractLabelsForAll(boot.studyTargets);
    const contractIds = boot.workspace.log
      .filter((event) => event.type === 'ContractCreated')
      .map((event) => (event.type === 'ContractCreated' ? event.contractId : ''));
    expect(contractIds).toHaveLength(4);

    /*
      Graduate every contract out of phase `new` through the real path.

      `repairProbe` is used rather than `answerStep` because it probes a named
      contract wherever the cursor is, which is what lets this drive all four
      without composing four sittings. It mints through the same
      `mintReviewGraded` and is judged by the same gate.
    */
    let state = applySessionCommand(context, boot.workspace, {
      kind: 'start',
      timeBudgetMin: 12,
      newBudget: 1,
      asOf: ASOF,
      labelByContract: labels,
    });
    for (const contractId of contractIds) {
      state = applySessionCommand(context, state, {
        kind: 'openRepair',
        stumble: {
          contractId,
          threadId: boot.studyTargets[0]?.threadId ?? '',
          skill: 'orthography_to_reading',
          eventId: 'seed',
          at: ASOF,
        },
      });
      state = applySessionCommand(context, state, {
        kind: 'chooseRepairBranch',
        branch: 'reading',
        at: ASOF,
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        state = applySessionCommand(context, state, {
          kind: 'repairProbe',
          attempt: { grade: 'good', latencyMs: 1200, hintsUsed: 0, revealedBeforeRecall: false },
        });
      }
      state = applySessionCommand(context, state, { kind: 'leaveRepair' });
    }

    // A year later everything is due again, and the sitting may draw on all of
    // it — the point of removing the ceiling.
    const later = applySessionCommand(context, createSessionWorkspace(state.log), {
      kind: 'start',
      timeBudgetMin: 30,
      newBudget: 0,
      asOf: '2027-07-27T10:00:00.000Z',
      labelByContract: labels,
    });
    const steps = (later.runtime?.plan.steps ?? []).filter((step) => step.contractId !== null);
    expect(steps.length).toBeGreaterThan(1);
    const words = new Set(steps.map((step) => step.label.slice(0, 2)));
    expect(words.has('時間')).toBe(true);
    expect(words.has('学校')).toBe(true);
  });
});

describe('what is still refused, and why', () => {
  it('never plans over a thread that was only kept', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    const lexeme = findLexemeByHeadword('時間');
    const kept = store.execute({
      kind: 'capture',
      text: lexeme?.headword ?? '時間',
      sourceRef: { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' },
      provenance: MANUAL_PROVENANCE,
      uncertainty: null,
      ...(lexeme === null ? {} : { lexemeId: lexeme.id }),
    });
    store.execute({ kind: 'promote', threadId: kept.threadId, to: 'keep' });

    // `keep` activates no contracts (REQ-DM-09), so a sitting over it would be a
    // sitting whose every observation the gate refuses.
    expect(chooseStudyTargets(store.getSnapshot().threads, store.readAll())).toEqual([]);
  });

  it('takes one thread per word, so two contracts never chase one id', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    takeUpForStudy(store, '時間');
    // A second capture of the same headword deduplicates into the same thread in
    // this store; a genuinely separate thread for one word is still the case the
    // dedupe exists for, and the contract ids are derived from the lexeme.
    takeUpForStudy(store, '時間');

    const targets = chooseStudyTargets(store.getSnapshot().threads, store.readAll());
    expect(targets).toHaveLength(1);

    const boot = bootstrapSessionWorkspace(store, context);
    const ids = boot.workspace.log
      .filter((event) => event.type === 'ContractCreated')
      .map((event) => event.eventId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('spines', () => {
  it('groups by the surface each encounter was kept from, off the real event', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    takeUpForStudy(store, '時間', 'reading-screen');
    takeUpForStudy(store, '学校', 'reading-screen');
    takeUpForStudy(store, '友達', 'capture-screen');

    const boot = bootstrapSessionWorkspace(store, context);
    const spines = spinesFrom(boot.studyTargets, boot.workspace.log);

    const reading = spines.find((spine) => spine.id === 'source:reading-screen');
    expect(reading?.targets.map((target) => target.lexeme.headword).sort()).toEqual([
      '学校',
      '時間',
    ]);
    // One member is not a grouping, so the capture-screen bucket does not appear.
    expect(spines.some((spine) => spine.id === 'source:capture-screen')).toBe(false);
  });

  it('never invents a member — every spine is a subset of the study list', () => {
    const context = newContext();
    const store = createMemoryAppStore({ context });
    for (const headword of OFF_PASSAGE) takeUpForStudy(store, headword);

    const boot = bootstrapSessionWorkspace(store, context);
    const known = new Set(boot.studyTargets.map((target) => target.threadId));
    for (const spine of spinesFrom(boot.studyTargets, boot.workspace.log)) {
      for (const target of spine.targets) expect(known.has(target.threadId)).toBe(true);
    }
  });
});
