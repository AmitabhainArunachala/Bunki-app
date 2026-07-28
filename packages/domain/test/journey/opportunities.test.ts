/**
 * Untaken branches decay, stay capped, and never become a backlog
 * (Campaign E / A2; REQ-JRN-02).
 *
 * The requirement's own words are the test plan: *"Untaken branches persist as
 * decaying, quiet opportunities unless pinned; they must not become a new
 * backlog."* Three properties, three describe blocks, plus a structural check
 * that nothing which schedules can read them.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  activeQuietOpportunities,
  elapsedDaysBetween,
  enterJourneyBranch,
  hasFaded,
  leaveJourney,
  MAX_ACTIVE_QUIET_OPPORTUNITIES,
  openJourney,
  opportunityWeight,
  QUIET_OPPORTUNITY_FLOOR,
  QUIET_OPPORTUNITY_HALF_LIFE_DAYS,
  QUIET_OPPORTUNITY_POLICY,
  recordUntakenBranches,
  setPinned,
  type BranchFamily,
  type QuietOpportunity,
} from '../../src/index.ts';
import { at, observed, stumble } from './support.ts';

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function opportunity(overrides: Partial<QuietOpportunity> = {}): QuietOpportunity {
  return {
    family: 'sense_meaning_contrast',
    hypothesis: 'The reading may be coming back while the sense is not settled.',
    threadId: 'thread:分岐',
    contractId: 'contract:one',
    openedAt: at(10),
    pinned: false,
    ...overrides,
  };
}

describe('elapsed time without a calendar object', () => {
  it('measures whole days exactly', () => {
    expect(elapsedDaysBetween(at(0), at(1))).toBeCloseTo(1, 10);
    expect(elapsedDaysBetween(at(0), at(31))).toBeCloseTo(31, 10);
  });

  it('measures fractions of a day', () => {
    expect(elapsedDaysBetween(at(0, 0), at(0, 12))).toBeCloseTo(0.5, 10);
  });

  it('crosses a month boundary correctly', () => {
    // 2026-01-31 to 2026-02-01 is one day; 2026 is not a leap year.
    expect(elapsedDaysBetween('2026-01-31T00:00:00.000Z', '2026-02-01T00:00:00.000Z')).toBe(1);
    expect(elapsedDaysBetween('2026-02-28T00:00:00.000Z', '2026-03-01T00:00:00.000Z')).toBe(1);
    expect(elapsedDaysBetween('2024-02-28T00:00:00.000Z', '2024-03-01T00:00:00.000Z')).toBe(2);
  });

  it('is signed, so a caller can tell which way time ran', () => {
    expect(elapsedDaysBetween(at(5), at(1))).toBeCloseTo(-4, 10);
  });

  it('refuses a non-canonical instant rather than guessing', () => {
    expect(elapsedDaysBetween('2026-01-01', at(1))).toBeNull();
    expect(elapsedDaysBetween(at(1), '2026-01-01T00:00:00Z')).toBeNull();
  });
});

describe('decay', () => {
  it('is full weight at the moment it opened', () => {
    expect(opportunityWeight(opportunity(), at(10))).toBe(1);
  });

  it('halves every half-life', () => {
    const entry = opportunity({ openedAt: at(0) });
    expect(opportunityWeight(entry, at(QUIET_OPPORTUNITY_HALF_LIFE_DAYS))).toBeCloseTo(0.5, 6);
    expect(opportunityWeight(entry, at(QUIET_OPPORTUNITY_HALF_LIFE_DAYS * 2))).toBeCloseTo(0.25, 6);
  });

  it('never decays a pinned opportunity', () => {
    const pinned = opportunity({ openedAt: at(0), pinned: true });
    expect(opportunityWeight(pinned, at(300))).toBe(1);
    expect(hasFaded(pinned, at(300))).toBe(false);
  });

  it('fades an unpinned opportunity past the floor', () => {
    const entry = opportunity({ openedAt: at(0) });
    expect(hasFaded(entry, at(10))).toBe(false);
    expect(hasFaded(entry, at(90))).toBe(true);
    expect(opportunityWeight(entry, at(90))).toBeLessThan(QUIET_OPPORTUNITY_FLOOR);
  });

  it('treats a clock-skewed future instant as fresh rather than dropping it', () => {
    expect(opportunityWeight(opportunity({ openedAt: at(50) }), at(10))).toBe(1);
  });

  it('is a projection of the instant asked about, not a stored countdown', () => {
    const entry = opportunity({ openedAt: at(0) });
    const early = opportunityWeight(entry, at(5));
    const late = opportunityWeight(entry, at(40));
    // The same object answers both questions; nothing about it changed.
    expect(opportunityWeight(entry, at(5))).toBe(early);
    expect(late).toBeLessThan(early);
  });
});

describe('it never becomes a backlog', () => {
  it('caps what it will ever return, whatever was stored', () => {
    const many: QuietOpportunity[] = [];
    for (let index = 0; index < 500; index += 1) {
      many.push(opportunity({ contractId: `contract:${index}`, openedAt: at(10) }));
    }
    const active = activeQuietOpportunities(many, at(11));
    expect(active.length).toBe(MAX_ACTIVE_QUIET_OPPORTUNITIES);
    expect(MAX_ACTIVE_QUIET_OPPORTUNITIES).toBeLessThanOrEqual(12);
  });

  it('empties itself over time with no maintenance', () => {
    const many: QuietOpportunity[] = [];
    for (let index = 0; index < 500; index += 1) {
      many.push(opportunity({ contractId: `contract:${index}`, openedAt: at(index % 30) }));
    }
    expect(activeQuietOpportunities(many, at(31)).length).toBeGreaterThan(0);
    expect(activeQuietOpportunities(many, at(200))).toEqual([]);
  });

  it('refreshes rather than stacks when one contract stumbles again', () => {
    const first = recordUntakenBranches([], [opportunity({ openedAt: at(10) })]);
    const second = recordUntakenBranches(first, [opportunity({ openedAt: at(20) })]);
    expect(second).toHaveLength(1);
    expect(second[0]?.openedAt).toBe(at(20));
  });

  it('keeps a pin across a refresh', () => {
    const pinned = setPinned(
      recordUntakenBranches([], [opportunity()]),
      'contract:one',
      'sense_meaning_contrast',
      true,
    );
    const refreshed = recordUntakenBranches(pinned, [opportunity({ openedAt: at(30) })]);
    expect(refreshed[0]?.pinned).toBe(true);
    expect(refreshed[0]?.openedAt).toBe(at(30));
  });

  it('keeps two different routes on one contract apart', () => {
    const both = recordUntakenBranches(
      [],
      [
        opportunity({ family: 'sense_meaning_contrast' }),
        opportunity({ family: 'form_reading_aural' }),
      ],
    );
    expect(both).toHaveLength(2);
  });

  it('sorts pinned opportunities first, inside the cap', () => {
    const entries: QuietOpportunity[] = [];
    for (let index = 0; index < 20; index += 1) {
      entries.push(opportunity({ contractId: `contract:${index}`, openedAt: at(11) }));
    }
    entries.push(opportunity({ contractId: 'contract:pinned', openedAt: at(0), pinned: true }));

    const active = activeQuietOpportunities(entries, at(12));
    expect(active[0]?.contractId).toBe('contract:pinned');
    expect(active.length).toBe(MAX_ACTIVE_QUIET_OPPORTUNITIES);
  });

  it('states the policy in the words a surface renders', () => {
    expect(QUIET_OPPORTUNITY_POLICY).toMatch(/not added to anything due/i);
    expect(QUIET_OPPORTUNITY_POLICY).toMatch(/nothing will ask you/i);
  });
});

describe('nothing that schedules can read them', () => {
  /**
   * The structural half of "not a new backlog": there is no path from a quiet
   * opportunity into the session plan. `plan.ts` takes due contracts and
   * nothing else, and it does not import this module.
   */
  it('is not imported by the session planner', () => {
    const plan = readFileSync(join(PACKAGE_ROOT, 'src/session/plan.ts'), 'utf8');
    expect(plan).not.toMatch(/journey/i);
    expect(plan).not.toMatch(/QuietOpportunity|opportunities/);
  });

  it('carries no due date, no interval, and no contract to schedule', () => {
    const keys = Object.keys(opportunity()).sort();
    expect(keys).toEqual(['contractId', 'family', 'hypothesis', 'openedAt', 'pinned', 'threadId']);
    expect(keys).not.toContain('dueAt');
    expect(keys).not.toContain('scheduledDays');
  });
});

describe('entering a branch is what makes the others quiet', () => {
  it('records every offered path except the one taken', () => {
    const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
    const taken = opened.compiled.offered[0]?.family as BranchFamily;
    const entered = enterJourneyBranch(opened, taken, at(11));

    expect(entered.phase).toBe('in_branch');
    expect(entered.chosen).toBe(taken);
    expect(entered.untaken.map((entry) => entry.family)).toEqual(
      opened.compiled.offered.slice(1).map((option) => option.family),
    );
    entered.untaken.forEach((entry) => {
      expect(entry.pinned).toBe(false);
      expect(entry.openedAt).toBe(at(11));
    });
  });

  it('refuses to enter a path that was not offered', () => {
    const opened = openJourney(stumble());
    const notOffered = (['task_misunderstanding', 'grammar_construction'] as BranchFamily[]).find(
      (family) => !opened.compiled.offered.some((option) => option.family === family),
    );
    expect(notOffered).toBeDefined();
    expect(enterJourneyBranch(opened, notOffered!, at(11))).toBe(opened);
  });

  it('makes a left branch quiet too, rather than losing it', () => {
    const opened = openJourney(stumble({ observed: observed({ priorStumbleCount: 1 }) }));
    const taken = opened.compiled.offered[0]?.family as BranchFamily;
    const entered = enterJourneyBranch(opened, taken, at(11));
    expect(entered.untaken.some((entry) => entry.family === taken)).toBe(false);

    const left = leaveJourney(entered, at(12));
    expect(left.phase).toBe('left');
    // Leaving is not a failure: the path just left rejoins the quiet shelf
    // alongside the ones never taken, and nothing will ask about either.
    expect(left.untaken.some((entry) => entry.family === taken)).toBe(true);
    expect(left.untaken.length).toBe(opened.compiled.offered.length);
  });
});
