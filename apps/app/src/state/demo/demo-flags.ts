/**
 * Naming a demonstration stage in the URL (lane L1).
 *
 * Two flags, both inert unless present, both parsed from an injected string so
 * nothing needs a `window` to be testable — the same shape and the same reasons
 * as `state/debug-flags.ts`, kept in its own module because the demonstration
 * layer is its own lane's surface and appending to another lane's flag record
 * is how that record grew a field nobody owned.
 *
 *   ?demo=month-8         load a stage instead of the operator's own data
 *   ?demoToday=2026-07-29 pin the day the stage ends on
 *
 * `demoToday` exists for reproducibility and nothing else. A stage is generated
 * backwards from today so that a two-year learner ends on today's date rather
 * than in 2024; that makes the log a function of the date, which is right for a
 * person and wrong for a screenshot. Pinning the day makes two runs on two days
 * produce the same bytes, which is what the evidence harness needs.
 *
 * The flags are read **once**, above the router. Navigating between the shell's
 * destinations uses `router.replace`, which drops the query string, so a stage
 * that lived in the URL would evaporate on the first tap. It lives in React
 * state instead, and the URL is only ever its starting value.
 */

import { DEMO_STAGE_IDS, type DemoStageId } from '@bunki/domain';

export interface DemoFlags {
  /** The stage to load at startup, or `null` for the operator's own data. */
  readonly stageId: DemoStageId | null;
  /** `YYYY-MM-DD` the stage should end on, or `null` to use the real date. */
  readonly today: string | null;
}

export const NO_DEMO_FLAGS: DemoFlags = { stageId: null, today: null };

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function asStageId(value: string | null): DemoStageId | null {
  return DEMO_STAGE_IDS.find((id) => id === value) ?? null;
}

export function parseDemoFlags(search: string): DemoFlags {
  if (search === '') return NO_DEMO_FLAGS;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);

  const day = params.get('demoToday');
  return {
    stageId: asStageId(params.get('demo')),
    today: day !== null && DAY_PATTERN.test(day) ? day : null,
  };
}

/** Reads the current location's query string where one exists. */
export function readDemoFlags(
  location: { readonly search?: unknown } | undefined = (
    globalThis as { location?: { search?: unknown } }
  ).location,
): DemoFlags {
  const search = location?.search;
  return typeof search === 'string' ? parseDemoFlags(search) : NO_DEMO_FLAGS;
}

/**
 * The instant a stage should end on: the pinned day, or now.
 *
 * Midnight of the pinned day rather than the moment of the request, so two runs
 * on one pinned day agree to the millisecond. Without a pin this is the real
 * clock, which is correct for a learner and is why a screenshot has to pin.
 */
export function demoEndInstant(flags: DemoFlags, now: () => number = Date.now): string {
  if (flags.today === null) return new Date(now()).toISOString();
  return `${flags.today}T00:00:00.000Z`;
}
