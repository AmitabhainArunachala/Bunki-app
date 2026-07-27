/**
 * Export → replay → equality (WP-03; T-14, controller §11).
 *
 * `npm run verify:export` is this file, run as a test. The check it performs is
 * the narrow one the controller specifies and no wider: replay the *exported*
 * event log through `@bunki/domain`'s replay harness and assert the resulting
 * derived state equals the live store's derived state, byte for byte.
 *
 * Two design choices make that assertion worth something.
 *
 * **The reduction is not reimplemented.** `replay` is imported from
 * `@bunki/domain` (controller §6.3, §18 WP-03). A second reduction written here
 * would agree with the first exactly until the day it did not, and the
 * disagreement would surface as an export that "verifies" while describing a
 * different history.
 *
 * **Comparison is on canonical bytes.** Two `DerivedState` values can be
 * structurally equal and serialise differently; a difference that survives into
 * exported bytes is a real difference, and the export *is* bytes. Structural
 * equality would hide exactly the class of divergence T-03 and T-14 exist to
 * catch.
 *
 * The live state is passed in rather than read here, so this module needs no
 * store, no filesystem, and no adapter — it can therefore run unchanged against
 * the ci-substitute adapter, the provisional web adapter, and (at WP-11) a real
 * device.
 */

import { canonicalJson, replay, type DerivedState } from '@bunki/domain';

import { parseExportEnvelope, type ExportEnvelope } from './envelope.ts';

/** Replay an envelope's log. Throws whatever the domain parser/replay throws. */
export function replayExport(envelope: ExportEnvelope): DerivedState {
  return replay(envelope.events);
}

export interface ExportRoundTripResult {
  readonly equal: boolean;
  /** Derived state re-derived from the exported log. */
  readonly replayedState: DerivedState;
  readonly replayedStateJson: string;
  readonly liveStateJson: string;
  /**
   * First differing line of the two canonical renderings, or `null` when equal.
   * A pointer for the human reading a failure, never used to decide `equal`.
   */
  readonly firstDifference: string | null;
  readonly eventCount: number;
}

function firstDifferingLine(left: string, right: string): string | null {
  const leftLines = left.split('\n');
  const rightLines = right.split('\n');
  const limit = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < limit; index += 1) {
    const l = leftLines[index];
    const r = rightLines[index];
    if (l !== r) {
      return `line ${index + 1}: replayed ${JSON.stringify(l ?? null)} vs live ${JSON.stringify(r ?? null)}`;
    }
  }
  return null;
}

/**
 * T-14 in one function: does this export replay to the state it was taken from?
 *
 * The input is **always** re-parsed by `parseExportEnvelope`, even when the
 * caller already holds a typed `ExportEnvelope`. An earlier draft skipped the
 * parse when the value "looked like" an envelope, and that heuristic was a hole:
 * a payload carrying an unknown `exportVersion` could have been verified without
 * ever meeting the version check it is supposed to fail closed on. Re-parsing a
 * valid envelope costs one pass over a Phase-0-sized log; guessing costs the
 * guarantee.
 *
 * @param envelope   a parsed envelope, or the raw JSON value of one.
 * @param liveState  derived state the store reports right now.
 */
export function verifyExportRoundTrip(
  envelope: ExportEnvelope | unknown,
  liveState: DerivedState,
): ExportRoundTripResult {
  const parsed = parseExportEnvelope(envelope);
  const replayedState = replayExport(parsed);
  const replayedStateJson = canonicalJson(replayedState);
  const liveStateJson = canonicalJson(liveState);
  const equal = replayedStateJson === liveStateJson;

  return {
    equal,
    replayedState,
    replayedStateJson,
    liveStateJson,
    firstDifference: equal ? null : firstDifferingLine(replayedStateJson, liveStateJson),
    eventCount: parsed.events.length,
  };
}
