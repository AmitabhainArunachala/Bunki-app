/**
 * The session budget is the learner's (REQ-SCH-04; full-review ledger P1-16).
 *
 * Three claims, each tested where it lives:
 *
 *   1. the setting module validates, reads and writes the choice honestly —
 *      bounds are refused rather than repaired, corruption reads as "no
 *      choice", storage denial degrades to session-held;
 *   2. the domain planner receives whatever the learner chose and the plan
 *      never exceeds it — asserted against `planSession` itself, for every
 *      choice the control offers;
 *   3. the session screen renders the control and dispatches the chosen number
 *      rather than a hardcoded one — a source scan, in the same spirit as
 *      `session-screens.test.ts`, because this project ships no React Native
 *      test renderer and the hardcoded 12 this replaces survived precisely
 *      because no test could see it.
 *
 * The browser half — a tap on the control changing the composed plan and the
 * choice surviving a reload — is `e2e/kernel-honesty.spec.ts`.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { planSession, type DueContract } from '@bunki/domain';

import {
  DEFAULT_SESSION_BUDGET_MINUTES,
  SESSION_BUDGET_CHOICES,
  SESSION_BUDGET_MAX_MINUTES,
  SESSION_BUDGET_MIN_MINUTES,
  SESSION_BUDGET_STORAGE_KEY,
  isValidSessionBudget,
  readStoredSessionBudget,
  writeStoredSessionBudget,
  type SessionBudgetStorage,
} from '../src/state/session-budget.ts';

/** An in-memory Web Storage stand-in; `broken` simulates storage denial. */
function fakeStorage(broken = false): SessionBudgetStorage & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => {
      if (broken) throw new Error('storage denied');
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (broken) throw new Error('storage denied');
      map.set(key, value);
    },
  };
}

describe('validation (bounds are refused, never repaired)', () => {
  it('accepts whole minutes inside 5–60 inclusive', () => {
    expect(isValidSessionBudget(SESSION_BUDGET_MIN_MINUTES)).toBe(true);
    expect(isValidSessionBudget(SESSION_BUDGET_MAX_MINUTES)).toBe(true);
    expect(isValidSessionBudget(DEFAULT_SESSION_BUDGET_MINUTES)).toBe(true);
  });

  it.each([
    ['below the floor', SESSION_BUDGET_MIN_MINUTES - 1],
    ['above the ceiling', SESSION_BUDGET_MAX_MINUTES + 1],
    ['zero', 0],
    ['negative', -12],
    ['fractional', 12.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects %s (%s)', (_name, value) => {
    expect(isValidSessionBudget(value)).toBe(false);
  });

  it('rejects non-numbers, so a corrupted read cannot smuggle a string through', () => {
    expect(isValidSessionBudget('12')).toBe(false);
    expect(isValidSessionBudget(null)).toBe(false);
    expect(isValidSessionBudget(undefined)).toBe(false);
  });

  it('offers only valid presets, in ascending order, with the default among them', () => {
    for (const choice of SESSION_BUDGET_CHOICES) {
      expect(isValidSessionBudget(choice)).toBe(true);
    }
    expect([...SESSION_BUDGET_CHOICES]).toEqual([...SESSION_BUDGET_CHOICES].sort((a, b) => a - b));
    expect(SESSION_BUDGET_CHOICES).toContain(DEFAULT_SESSION_BUDGET_MINUTES);
  });

  it('keeps the default at the 12 the hardcoded constant always was', () => {
    expect(DEFAULT_SESSION_BUDGET_MINUTES).toBe(12);
  });
});

describe('persistence through the settings seam', () => {
  it('round-trips a valid choice', () => {
    const storage = fakeStorage();
    expect(writeStoredSessionBudget(20, storage)).toBe(true);
    expect(storage.map.get(SESSION_BUDGET_STORAGE_KEY)).toBe('20');
    expect(readStoredSessionBudget(storage)).toBe(20);
  });

  it('reads "no choice" when nothing is stored', () => {
    expect(readStoredSessionBudget(fakeStorage())).toBeNull();
    expect(readStoredSessionBudget(null)).toBeNull();
  });

  it.each(['4', '61', '0', 'abc', '12.5', ''])(
    'reads a stored %j as no choice rather than repairing it',
    (raw) => {
      const storage = fakeStorage();
      storage.map.set(SESSION_BUDGET_STORAGE_KEY, raw);
      expect(readStoredSessionBudget(storage)).toBeNull();
    },
  );

  it('refuses to write an out-of-bounds value at all', () => {
    const storage = fakeStorage();
    expect(writeStoredSessionBudget(SESSION_BUDGET_MAX_MINUTES + 1, storage)).toBe(false);
    expect(writeStoredSessionBudget(0, storage)).toBe(false);
    expect(writeStoredSessionBudget(12.5, storage)).toBe(false);
    expect(storage.map.size).toBe(0);
  });

  it('degrades to session-held when storage throws, without throwing itself', () => {
    const storage = fakeStorage(true);
    expect(readStoredSessionBudget(storage)).toBeNull();
    // The choice is still accepted for the session; only the write was lost.
    expect(writeStoredSessionBudget(20, storage)).toBe(true);
  });
});

describe('the planner receives the chosen budget (the P1-16 seam itself)', () => {
  const due = (id: string, phase: DueContract['phase']): DueContract => ({
    contractId: `contract-${id}`,
    threadId: 'thread-1',
    label: `label ${id}`,
    phase,
    lapses: 0,
    dueSince: '2026-08-16T00:00:00.000Z',
  });

  it.each(SESSION_BUDGET_CHOICES.map((choice) => [choice] as const))(
    'a plan for %s minutes carries that budget and never exceeds it',
    (choice) => {
      const plan = planSession({
        timeBudgetMin: choice,
        newBudget: 1,
        canvasId: 'pas-bunki-01',
        dueContracts: [due('a', 'new'), due('b', 'new'), due('c', 'review')],
      });
      expect(plan.budget.timeBudgetMin).toBe(choice);
      expect(plan.estimatedMinutes).toBeLessThanOrEqual(choice);
    },
  );

  it('a different choice composes a different sitting, not just a different label', () => {
    const input = {
      newBudget: 1,
      canvasId: 'pas-bunki-01',
      dueContracts: [due('a', 'new'), due('b', 'new')],
    };
    // Smallest choice: closure and canvas fit; the new item does not.
    const smallest = planSession({ ...input, timeBudgetMin: SESSION_BUDGET_MIN_MINUTES });
    // Default: the new item fits too.
    const fallback = planSession({ ...input, timeBudgetMin: DEFAULT_SESSION_BUDGET_MINUTES });

    expect(smallest.steps.map((step) => step.kind)).not.toContain('new');
    expect(fallback.steps.map((step) => step.kind)).toContain('new');
    expect(smallest.stepCount).toBeLessThan(fallback.stepCount);
    expect(smallest.deferredDueCount).toBeGreaterThan(fallback.deferredDueCount);
  });
});

describe('the session screen defers to the setting (source scan)', () => {
  const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const source = readFileSync(resolve(APP_ROOT, 'src/screens/session-screen.tsx'), 'utf8');
  /** Source with comments stripped: what the screen does, not what it explains. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('holds the budget through the setting hook, with no hardcoded fallback', () => {
    expect(code).toContain('useSessionBudget');
    // The defect this work closes: `timeBudgetMin = 12` as a prop default.
    expect(code).not.toMatch(/timeBudgetMin\s*=\s*\d/);
  });

  it('renders the control on the start surface and dispatches the chosen number', () => {
    expect(code).toContain('SESSION_BUDGET_CHOICES');
    expect(code).toContain('session-budget-');
    // The start command's budget is the state the control edits — the same
    // identifier, so the dispatched number cannot drift from the rendered one.
    expect(code).toMatch(/kind:\s*'start',\s*timeBudgetMin/);
  });
});
