/**
 * What the guide screen says, asserted as a function (Campaign E / B6).
 *
 * This project installs no React Native test renderer, so the decisions the
 * screen makes have to live in functions to be checkable at all. They do —
 * `roadRows`, `positionHeadline`, `guideSpeechLabels`, `progressFromSnapshot`
 * — and this file drives them directly, including the two positions the browser
 * cannot reach in this build.
 */

import { describe, expect, it } from 'vitest';

import { OFFLINE_FALLBACK_PROVIDER } from '@bunki/ai';
import {
  declaredBranchFromStumble,
  formEstimate,
  guidePositionOn,
  openConversation,
  proposePlan,
  proposeRoute,
  type RepairStumble,
} from '@bunki/domain';

import { ROUTE_CANDIDATES } from '../src/ui/guide/guide-content.ts';
import {
  progressFromSnapshot,
  progressWord,
  takenUpWaypointIds,
} from '../src/ui/guide/guide-progress.ts';
import {
  guideSpeechLabels,
  learnerHeadline,
  positionHeadline,
  provenanceLine,
  roadRows,
  speechOriginLine,
  summarise,
} from '../src/ui/guide/guide-view-model.ts';
import type { AppSnapshot, ThreadView } from '../src/state/store.ts';

const AT = '2026-07-28T09:00:00.000Z';

const route = proposeRoute({
  estimate: formEstimate(openConversation([]), AT),
  candidates: ROUTE_CANDIDATES,
  recordId: 'route-001',
  title: '分かれた道',
  provenance: { author: 'guide_offline_fixture', at: AT, provider: OFFLINE_FALLBACK_PROVIDER },
});

const stumble: RepairStumble = {
  contractId: 'contract-1',
  threadId: 'thread-1',
  skill: 'orthography_to_reading',
  eventId: 'event-1',
  at: AT,
};

function progressPassedThrough(ordinal: number) {
  return route.waypoints.map((waypoint) => ({
    waypointId: waypoint.id,
    reached: waypoint.ordinal <= ordinal,
    passed: waypoint.ordinal <= ordinal,
  }));
}

describe('the road the app can actually offer', () => {
  it('is built from the seed and is finite', () => {
    expect(ROUTE_CANDIDATES.length).toBe(8);
    expect(new Set(ROUTE_CANDIDATES.map((candidate) => candidate.targetForm)).size).toBe(8);
  });

  it('lays every station on one of the three era layers', () => {
    for (const candidate of ROUTE_CANDIDATES) {
      expect(['kodo', 'kaido', 'tetsudo']).toContain(candidate.layer);
    }
  });

  it('gives every station a real seed headword', () => {
    for (const candidate of ROUTE_CANDIDATES) {
      expect(candidate.targetForm).toBe(candidate.name);
      expect(candidate.targetForm.length).toBeGreaterThan(0);
    }
  });
});

describe('the road, row by row', () => {
  it('numbers every row out of the road’s own length', () => {
    const position = guidePositionOn(route, progressPassedThrough(2), []);
    const rows = roadRows(route, progressPassedThrough(2), position);
    expect(rows).toHaveLength(8);
    expect(rows.map((row) => row.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const row of rows) expect(row.total).toBe(8);
  });

  it('marks the learner and the guide separately, one station apart', () => {
    const progress = progressPassedThrough(2);
    const position = guidePositionOn(route, progress, []);
    const rows = roadRows(route, progress, position);

    expect(rows[2]?.mark).toBe('learner_here');
    expect(rows[3]?.mark).toBe('guide_here');
    expect(rows.filter((row) => row.mark !== 'plain')).toHaveLength(2);
  });

  it('marks one station when both stand at it', () => {
    const branch = declaredBranchFromStumble(stumble, 'wp-kiro');
    const progress = progressPassedThrough(2);
    const position = guidePositionOn(route, progress, [branch]);
    const rows = roadRows(route, progress, position);

    expect(position.stance).toBe('at_branch');
    expect(rows[2]?.mark).toBe('both_here');
    expect(rows[2]?.atDeclaredFork).toBe(true);
    expect(rows.filter((row) => row.atDeclaredFork)).toHaveLength(1);
  });

  /**
   * The browser cannot reach the at-a-fork state in this build, so this is
   * where that rendering is proven. See the guide screen's header for why the
   * declarer is not wired at `/guide` yet.
   */
  it('marks a fork behind the learner without moving the learner', () => {
    const branch = declaredBranchFromStumble(stumble, 'wp-michi');
    const progress = progressPassedThrough(5);
    const position = guidePositionOn(route, progress, [branch]);
    const rows = roadRows(route, progress, position);

    expect(rows[0]?.mark).toBe('guide_here');
    expect(rows[0]?.atDeclaredFork).toBe(true);
    expect(rows[5]?.mark).toBe('learner_here');
  });

  it('speaks each row, so the marks are never the only channel', () => {
    const progress = progressPassedThrough(2);
    const position = guidePositionOn(route, progress, []);
    const rows = roadRows(route, progress, position);

    expect(rows[2]?.spoken).toContain('Station 3 of 8');
    expect(rows[2]?.spoken).toContain('you are here');
    expect(rows[3]?.spoken).toContain('the guide is here');
    expect(rows[7]?.spoken).not.toContain('here');
  });

  it('states what the learner has done and never what they know', () => {
    const progress = progressPassedThrough(2);
    const position = guidePositionOn(route, progress, []);
    const rows = roadRows(route, progress, position);

    expect(rows[0]?.progress).toBe('taken up for study');
    expect(rows[7]?.progress).toBe('not met yet');
    for (const row of rows) {
      expect(row.progress).not.toMatch(/know|strong|weak|mastered/i);
    }
  });

  it('carries no brightness, no percentage and no bar', () => {
    const position = guidePositionOn(route, progressPassedThrough(2), []);
    const json = JSON.stringify(roadRows(route, progressPassedThrough(2), position));
    for (const forbidden of ['opacity', 'percent', 'brightness', 'ratio', 'score']) {
      expect(json.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe('the headlines', () => {
  it('says where the guide is, in the road’s own count', () => {
    expect(positionHeadline(guidePositionOn(route, progressPassedThrough(2), []))).toBe(
      'One ahead of you · station 4 of 8',
    );
    expect(positionHeadline(guidePositionOn(route, progressPassedThrough(8), []))).toBe(
      'At the last station · 8 of 8',
    );
    expect(
      positionHeadline(
        guidePositionOn(route, progressPassedThrough(2), [
          declaredBranchFromStumble(stumble, 'wp-eki'),
        ]),
      ),
    ).toBe('At the fork · station 6 of 8');
  });

  it('says where the learner is, as an ordinal and never as a fraction', () => {
    const headline = learnerHeadline(guidePositionOn(route, progressPassedThrough(2), []));
    expect(headline).toBe('You are at station 3 of 8.');
    expect(headline).not.toMatch(/%|\d+\/\d+/);
  });
});

describe('labelling what the guide says', () => {
  it('always returns a primary label', () => {
    for (const provider of [OFFLINE_FALLBACK_PROVIDER, 'anthropic', '']) {
      expect(guideSpeechLabels(provider).primary.length).toBeGreaterThan(0);
    }
  });

  it('adds the fallback marker as a second label, never as a replacement', () => {
    const fallback = guideSpeechLabels(OFFLINE_FALLBACK_PROVIDER);
    expect(fallback.secondary).toBe(OFFLINE_FALLBACK_PROVIDER);
    expect(fallback.primary).not.toBe(fallback.secondary);
    expect(fallback.accessibilityLabel).toContain(fallback.primary);
    expect(fallback.accessibilityLabel).toContain(OFFLINE_FALLBACK_PROVIDER);
  });

  it('has no second label for a live provider, and still has the first', () => {
    const live = guideSpeechLabels('anthropic');
    expect(live.secondary).toBeNull();
    expect(live.primary.length).toBeGreaterThan(0);
  });

  it('renders the origin rather than summarising it', () => {
    expect(speechOriginLine('anthropic', 'claude-x')).toBe('anthropic · claude-x · route T2');
    expect(speechOriginLine(null, null)).toMatch(/Nothing has been asked/);
  });
});

describe('provenance on screen', () => {
  it('always says who and when', () => {
    const line = provenanceLine(route.provenance);
    expect(line).toContain(AT);
    expect(line).toMatch(/proposed by the guide/);
  });

  it('names how many turns a proposal came from', () => {
    const estimate = formEstimate(openConversation([]), AT);
    const withTurns = proposeRoute({
      estimate,
      candidates: ROUTE_CANDIDATES,
      recordId: 'route-002',
      title: '分かれた道',
      provenance: { author: 'guide_ai', at: AT, basisTurnIds: ['a', 'b'] },
    });
    expect(provenanceLine(withTurns.provenance)).toContain('from 2 turns');
    expect(provenanceLine(route.provenance)).toContain('from no conversation turns');
  });

  it('summarises a record without inventing a standing', () => {
    const summary = summarise(route);
    expect(summary.itemCount).toBe(8);
    expect(summary.horizon).toBe('the long road, in months');
    expect(summary.supersedes).toBeNull();

    const plan = proposePlan({
      route,
      recordId: 'plan-001',
      title: 'next',
      provenance: { author: 'guide_offline_fixture', at: AT },
    });
    expect(summarise(plan).horizon).toBe('the next few days');
    expect(summarise(plan).itemCount).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Where the learner is, from the log
// ---------------------------------------------------------------------------

function thread(overrides: Partial<ThreadView> & { readonly targetKey: string }): ThreadView {
  return {
    state: {
      threadId: 'thread-x',
      promotion: 'captured',
      promotionHistory: [],
      encounterIds: [],
      candidateIds: [],
      acceptedCandidateIds: [],
      lifecycle: 'active',
      tombstoneEventId: null,
      createdAt: AT,
      lastEventAt: AT,
    },
    displayText: overrides.targetKey,
    lexemeId: null,
    uncertainty: null,
    markRecordedInLog: false,
    capturedAt: AT,
    // `targetKey` comes from here rather than being written twice: spreading
    // over a duplicate key is a TS2783 error, and the whole point of the
    // parameter type is that this one field is required.
    ...overrides,
  } as ThreadView;
}

function snapshotOf(threads: readonly ThreadView[]): AppSnapshot {
  return {
    revision: 1,
    threads,
    threadsById: Object.fromEntries(threads.map((entry) => [entry.state.threadId, entry])),
    candidates: [],
    candidatesByThread: {},
    eventCount: threads.length,
  };
}

describe('progress comes from the log, not from the learner saying so', () => {
  it('reports nothing met on an empty log', () => {
    const progress = progressFromSnapshot(snapshotOf([]), ROUTE_CANDIDATES);
    expect(progress).toHaveLength(ROUTE_CANDIDATES.length);
    expect(progress.every((entry) => !entry.reached && !entry.passed)).toBe(true);
    expect(takenUpWaypointIds(progress)).toEqual([]);
  });

  it('counts a capture as met and not as taken up', () => {
    const snapshot = snapshotOf([thread({ targetKey: '道' })]);
    const progress = progressFromSnapshot(snapshot, ROUTE_CANDIDATES);
    const michi = progress.find((entry) => entry.waypointId === 'wp-michi');
    expect(michi?.reached).toBe(true);
    expect(michi?.passed).toBe(false);
    expect(progressWord(michi)).toBe('met, not taken up');
  });

  it('counts an explicit promotion as taken up', () => {
    const promoted = thread({ targetKey: '駅' });
    const snapshot = snapshotOf([
      { ...promoted, state: { ...promoted.state, promotion: 'learn' } } as ThreadView,
    ]);
    const progress = progressFromSnapshot(snapshot, ROUTE_CANDIDATES);
    const eki = progress.find((entry) => entry.waypointId === 'wp-eki');
    expect(eki?.passed).toBe(true);
    expect(progressWord(eki)).toBe('taken up for study');
    expect(takenUpWaypointIds(progress)).toEqual(['wp-eki']);
  });

  it('matches by lexeme id when the capture resolved to one', () => {
    const resolved = thread({ targetKey: 'something else', lexemeId: 'lex-senro' });
    const progress = progressFromSnapshot(snapshotOf([resolved]), ROUTE_CANDIDATES);
    expect(progress.find((entry) => entry.waypointId === 'wp-senro')?.reached).toBe(true);
  });

  it('keeps the road’s length whatever the learner has done', () => {
    for (const threads of [[], [thread({ targetKey: '道' })], [thread({ targetKey: 'なにか' })]]) {
      expect(progressFromSnapshot(snapshotOf(threads), ROUTE_CANDIDATES)).toHaveLength(8);
    }
  });
});
