/**
 * The journey state machine, and its join with the Atlas (Campaign E / A2;
 * REQ-JRN-01/02/03).
 */

import { describe, expect, it } from 'vitest';

import {
  affordancesFromGroups,
  answerProbe,
  applyJourneyRejoin,
  buildKnowledgeGraph,
  enterJourneyBranch,
  evaluateJourneyRejoin,
  JOURNEY_PHASES,
  leaveJourney,
  neighbourhoodOf,
  openJourney,
  selectBranch,
  type BranchFamily,
} from '../../src/index.ts';
import { SEED_SHAPED_SOURCE } from '../graph/support.ts';
import { at, observation, observed, stumble } from './support.ts';

describe('the phases', () => {
  it('are four, with no failure state', () => {
    expect([...JOURNEY_PHASES]).toEqual(['diagnosing', 'in_branch', 'rejoined', 'left']);
    expect(JOURNEY_PHASES).not.toContain('failed');
    expect(JOURNEY_PHASES).not.toContain('abandoned');
  });

  it('starts diagnosing, with nothing chosen', () => {
    const opened = openJourney(stumble());
    expect(opened.phase).toBe('diagnosing');
    expect(opened.chosen).toBeNull();
    expect(opened.enteredAt).toBeNull();
    expect(opened.untaken).toEqual([]);
  });

  it('walks diagnose → branch → rejoin', () => {
    const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
    const probe = opened.compiled.probes[0];
    expect(probe).toBeDefined();

    const answered = answerProbe(opened, { probeId: probe!.id, outcome: 'no' });
    expect(answered.answers).toHaveLength(1);

    const selection = selectBranch(answered.compiled, answered.answers);
    expect(selection.selected).toBe(true);
    const family = selection.selected ? selection.family : answered.compiled.recommended;

    const entered = enterJourneyBranch(answered, family, at(11));
    expect(entered.phase).toBe('in_branch');

    const closed = applyJourneyRejoin(
      entered,
      evaluateJourneyRejoin(entered, [observation({ at: at(12) })]),
    );
    expect(closed.phase).toBe('rejoined');
  });

  it('replaces an answer rather than accumulating contradictory ones', () => {
    const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
    const probe = opened.compiled.probes[0];
    const once = answerProbe(opened, { probeId: probe!.id, outcome: 'yes' });
    const twice = answerProbe(once, { probeId: probe!.id, outcome: 'no' });
    expect(twice.answers).toHaveLength(1);
    expect(twice.answers[0]?.outcome).toBe('no');
  });

  it('ignores an answer to a probe it never asked', () => {
    const opened = openJourney(stumble());
    expect(answerProbe(opened, { probeId: 'use_it_yourself', outcome: 'no' }).answers).toEqual(
      opened.answers,
    );
  });

  it('ignores an answer after a branch has been entered', () => {
    const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
    const family = opened.compiled.offered[0]?.family as BranchFamily;
    const entered = enterJourneyBranch(opened, family, at(11));
    expect(answerProbe(entered, { probeId: 'rough_meaning', outcome: 'no' })).toBe(entered);
  });

  it('is idempotent on a double entry', () => {
    const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
    const family = opened.compiled.offered[0]?.family as BranchFamily;
    const once = enterJourneyBranch(opened, family, at(11));
    const twice = enterJourneyBranch(once, family, at(12));
    expect(twice).toBe(once);
  });

  it('will not leave a rejoined branch', () => {
    const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
    const family = opened.compiled.offered[0]?.family as BranchFamily;
    const entered = enterJourneyBranch(opened, family, at(11));
    const closed = applyJourneyRejoin(entered, evaluateJourneyRejoin(entered, [observation()]));
    expect(leaveJourney(closed, at(20))).toBe(closed);
  });

  it('lets a learner take the path the probes did not recommend', () => {
    const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
    const other = opened.compiled.offered[1]?.family;
    expect(other).toBeDefined();
    const entered = enterJourneyBranch(opened, other!, at(11));
    expect(entered.chosen).toBe(other);
    expect(entered.phase).toBe('in_branch');
  });
});

describe('the join with the Atlas', () => {
  const graph = buildKnowledgeGraph(SEED_SHAPED_SOURCE);

  it('derives affordances from a real neighbourhood', () => {
    const neighbourhood = neighbourhoodOf(graph, 'kanji:分');
    const affordances = affordancesFromGroups(neighbourhood.groups, {
      hasProductionContract: false,
      hasAudio: false,
      writingActivated: false,
    });

    expect(affordances.hasComponents).toBe(true);
    expect(affordances.hasContrastNeighbours).toBe(true);
    expect(affordances.hasReadingFamily).toBe(true);
    expect(affordances.hasProductionContract).toBe(false);
  });

  it('closes routes the graph cannot fill', () => {
    const neighbourhood = neighbourhoodOf(graph, 'sense:lex-bunki:branching');
    const affordances = affordancesFromGroups(neighbourhood.groups, {
      hasProductionContract: false,
      hasAudio: false,
      writingActivated: false,
    });

    expect(affordances.hasComponents).toBe(false);
    expect(affordances.hasGrammarConstruction).toBe(false);

    const compiled = openJourney(stumble({ available: affordances })).compiled;
    expect(compiled.offered.some((option) => option.family === 'kanji_structure_writing')).toBe(
      false,
    );
  });

  it('does not invent contract facts the graph cannot know', () => {
    const neighbourhood = neighbourhoodOf(graph, 'kanji:分');
    const activated = affordancesFromGroups(neighbourhood.groups, {
      hasProductionContract: true,
      hasAudio: true,
      writingActivated: true,
    });
    expect(activated.hasProductionContract).toBe(true);
    expect(activated.writingActivated).toBe(true);
  });
});
