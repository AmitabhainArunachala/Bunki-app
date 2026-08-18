/**
 * The session time budget — the learner's number, not the app's (REQ-SCH-04;
 * full-review ledger P1-16).
 *
 * ## What this module is
 *
 * `planSession` (packages/domain) takes `timeBudgetMin` and promises the plan
 * never exceeds it. The requirement calls that "the time the learner chose" —
 * and until this module existed, no learner had ever chosen it: the session
 * screen hardcoded 12. This is the app-side setting that makes the sentence
 * true. It holds the choice, validates it, and persists it; the number still
 * reaches the planner only through the domain's own `start` command, exactly as
 * the hardcoded value did.
 *
 * ## Where the choice lives, and why this is not a new store
 *
 * The budget is a preference about future sittings, not evidence about past
 * ones. It therefore does not belong in the event log — `SessionStarted`
 * already records the budget each sitting actually ran under (ADR-002), which
 * is the durable, exportable fact. The *preference* follows the app's existing
 * settings idiom, the same seam the theme uses (`src/ui/theme-context.tsx`):
 * web persists to `localStorage` under a named key; native holds the choice for
 * the session, because Phase 0 ships no native preference storage and a silent
 * fake persistence would be worse than the honest gap.
 *
 * This module stays free of React Native imports so the plain-Node unit suite
 * can drive every branch, which is the same rule the rest of `src/state/`
 * follows.
 *
 * ## Validation
 *
 * Bounds are 5–60 minutes, inclusive, whole minutes only. A stored value that
 * fails validation reads as "no choice recorded" rather than being repaired in
 * place — inventing a nearby number for a corrupted preference would be the
 * setting asserting something the learner never chose. The default when no
 * valid choice exists remains 12, unchanged from the constant it replaces.
 */

import { useCallback, useEffect, useState } from 'react';

/** Where the learner's choice lives on web. */
export const SESSION_BUDGET_STORAGE_KEY = 'bunki-session-budget';

export const SESSION_BUDGET_MIN_MINUTES = 5;
export const SESSION_BUDGET_MAX_MINUTES = 60;

/** What a learner who has never chosen gets: the number the screen always used. */
export const DEFAULT_SESSION_BUDGET_MINUTES = 12;

/**
 * The presets the quiet control offers, smallest to largest.
 *
 * A closed row of one-tap chips rather than a free-text field, for the same
 * reason the uncertainty mark is chips (REQ-UI-01): one tap, no keyboard, no
 * invalid state representable on screen. Every member must satisfy
 * {@link isValidSessionBudget}; the unit suite asserts it so the list cannot
 * drift outside its own bounds.
 */
export const SESSION_BUDGET_CHOICES = [5, 12, 20, 30, 45, 60] as const;

/**
 * The storage seam: the two members of Web Storage this module touches.
 *
 * Injected in tests; defaults to `globalThis.localStorage` when the platform
 * has one. Reads and writes never throw out of this module — storage denied or
 * full degrades to session-held, which is the honest behaviour the theme
 * already established.
 */
export interface SessionBudgetStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

function platformStorage(): SessionBudgetStorage | null {
  const storage = (globalThis as { localStorage?: SessionBudgetStorage }).localStorage;
  return storage ?? null;
}

/** A whole number of minutes inside the learner-settable bounds. */
export function isValidSessionBudget(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= SESSION_BUDGET_MIN_MINUTES &&
    value <= SESSION_BUDGET_MAX_MINUTES
  );
}

/**
 * The learner's stored choice, or `null` when none (or an invalid one) exists.
 *
 * Distinguishing "no choice" from "the default" is what lets a caller apply
 * {@link DEFAULT_SESSION_BUDGET_MINUTES} in exactly one place.
 */
export function readStoredSessionBudget(
  storage: SessionBudgetStorage | null = platformStorage(),
): number | null {
  if (storage === null) return null;
  try {
    const raw = storage.getItem(SESSION_BUDGET_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return isValidSessionBudget(parsed) ? parsed : null;
  } catch {
    return null; // storage disabled is a preference, not an error
  }
}

/**
 * Persist a valid choice. An invalid value is refused rather than clamped:
 * every caller is the chip row, which can only offer valid members, so an
 * out-of-bounds write is a programming error and must not quietly become a
 * different number the learner never picked.
 *
 * @returns whether the value was accepted (it may still be session-held only,
 *   when the platform has no storage).
 */
export function writeStoredSessionBudget(
  minutes: number,
  storage: SessionBudgetStorage | null = platformStorage(),
): boolean {
  if (!isValidSessionBudget(minutes)) return false;
  try {
    storage?.setItem(SESSION_BUDGET_STORAGE_KEY, String(minutes));
  } catch {
    // storage full or disabled — the choice still applies for the session
  }
  return true;
}

export interface SessionBudgetControl {
  /** Minutes the next sitting will be planned for. Always within bounds. */
  readonly minutes: number;
  /** The learner's tap. Validates, applies, persists. Invalid input is a no-op. */
  readonly chooseMinutes: (minutes: number) => void;
}

/**
 * The budget as screen state.
 *
 * The stored choice is read in an effect rather than in the initialiser, for
 * the reason `theme-context.tsx` documents: the statically exported markup was
 * rendered with no storage, so the first client render matches it (the
 * default) and the real choice arrives one effect later.
 *
 * @param pinned An explicit caller-supplied starting value (the screenshot
 *   harness, a test). When present, the stored choice is not consulted — a
 *   pinned render must not depend on what the browser remembers — but the
 *   control still works and still persists what the learner then picks.
 */
export function useSessionBudget(pinned?: number | undefined): SessionBudgetControl {
  const [minutes, setMinutes] = useState<number>(
    pinned !== undefined && isValidSessionBudget(pinned) ? pinned : DEFAULT_SESSION_BUDGET_MINUTES,
  );

  useEffect(() => {
    if (pinned !== undefined) return;
    const stored = readStoredSessionBudget();
    if (stored !== null) setMinutes(stored);
  }, [pinned]);

  const chooseMinutes = useCallback((next: number) => {
    if (!isValidSessionBudget(next)) return;
    setMinutes(next);
    writeStoredSessionBudget(next);
  }, []);

  return { minutes, chooseMinutes };
}
