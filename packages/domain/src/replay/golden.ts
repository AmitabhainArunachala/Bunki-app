/**
 * The golden-replay harness (WP-02; T-03, controller §6.3).
 *
 * A golden fixture is an event log plus the derived state it must produce. The
 * harness that checks one lives in `src/`, not in `test/`, because the same
 * check has to run against every adapter as they arrive: the in-memory
 * reference now, sqlite and web at WP-03, a real device at WP-11, and
 * E2E-produced logs at WP-10. One implementation is what makes "identical
 * derived state across runtimes" a single claim rather than four similar ones.
 *
 * Loading the files is deliberately *not* here — that needs a filesystem, and
 * this package imports no platform API (REQ-ARCH-02). Callers read the JSON and
 * hand it in; `packages/domain/test/replay/` does exactly that.
 *
 * Comparison is on canonical JSON text rather than structural equality. Two
 * states can be `toEqual`-equal and serialise differently (key order), and a
 * difference that survives into the exported bytes is a real difference —
 * WP-03's export round-trip (T-14) compares bytes, so this gate has to as well.
 */

import { z } from 'zod';

import type { DomainEvent } from '../events/catalog.ts';
import { parseEventLog } from '../events/parse.ts';
import { canonicalJson } from './canonical-json.ts';
import type { DerivedState } from './derived-state.ts';
import { replay } from './replay.ts';

export { canonicalJson };

export const goldenFixtureSchema = z.strictObject({
  /** Stable name; also the assertion label in test output. */
  name: z.string().min(1),
  /** What this log is meant to exercise, in prose, for whoever reads a failure. */
  description: z.string().min(1),
  /** Controller/test anchors this fixture stands for (`T-03`, `REQ-DM-09`, …). */
  anchors: z.array(z.string().min(1)).min(1),
  events: z.array(z.unknown()),
  expectedState: z.unknown(),
});

export type GoldenFixtureFile = z.infer<typeof goldenFixtureSchema>;

export interface GoldenFixture {
  readonly name: string;
  readonly description: string;
  readonly anchors: readonly string[];
  readonly events: readonly DomainEvent[];
  readonly expectedStateJson: string;
}

/**
 * Validate a fixture file and parse its log.
 *
 * The events go through the same fail-closed parser as production input — a
 * fixture the parser would reject is a fixture that proves nothing, and finding
 * that out here is better than finding it out as a confusing replay error.
 */
export function loadGoldenFixture(raw: unknown, sourcePath: string): GoldenFixture {
  const parsed = goldenFixtureSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Golden fixture ${sourcePath} is malformed — ${detail}`);
  }

  return {
    name: parsed.data.name,
    description: parsed.data.description,
    anchors: parsed.data.anchors,
    events: parseEventLog(parsed.data.events, { path: sourcePath }),
    expectedStateJson: canonicalJson(parsed.data.expectedState),
  };
}

export interface GoldenFixtureResult {
  readonly name: string;
  readonly matches: boolean;
  readonly actual: DerivedState;
  readonly actualJson: string;
  readonly expectedJson: string;
}

/** Replay a fixture's log and compare against its recorded snapshot. */
export function verifyGoldenFixture(fixture: GoldenFixture): GoldenFixtureResult {
  const actual = replay(fixture.events);
  const actualJson = canonicalJson(actual);
  return {
    name: fixture.name,
    matches: actualJson === fixture.expectedStateJson,
    actual,
    actualJson,
    expectedJson: fixture.expectedStateJson,
  };
}

export interface DeterminismResult {
  readonly identical: boolean;
  readonly first: DerivedState;
  readonly second: DerivedState;
  readonly firstJson: string;
  readonly secondJson: string;
}

/**
 * T-03 in one function: replay the same log twice, independently, and compare.
 *
 * Both passes start from a fresh accumulator, so a reducer that leaked state
 * into module scope — the classic way a "pure" fold stops being one — shows up
 * as a mismatch on the second pass rather than as a mystery in production.
 */
export function replayTwiceAndCompare(events: readonly DomainEvent[]): DeterminismResult {
  const first = replay(events);
  const second = replay(events);
  const firstJson = canonicalJson(first);
  const secondJson = canonicalJson(second);
  return { identical: firstJson === secondJson, first, second, firstJson, secondJson };
}
