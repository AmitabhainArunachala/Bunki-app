/**
 * The FSRS pin (WP-06; controller §6.3, §14, REQ-SCH-01, REQ-SCH-02, DL-13).
 *
 * There is exactly one scheduler in this product and this file is its
 * nameplate: which package, which version, which algorithm generation, which
 * parameters. Every number below is written out rather than read from the
 * library, so that a version bump that silently changes a default is a **test
 * failure** (`verifyFsrsPin`), not a quiet change in everybody's review
 * intervals. That is what "version-pinned" has to mean for a scheduler whose
 * outputs are the product's evidence: replay under a later version must be an
 * explicit, replay-tested migration (controller §6.3).
 *
 * ## WP-00 carry-over: does 5.4.1 implement FSRS-6?
 *
 * Verified from primary sources shipped inside the published tarball
 * (`npm pack ts-fsrs@5.4.1`), not from a summary:
 *
 *   1. `CHANGELOG.md`, release 5.0.0: "1. Upgraded to FSRS-6 algorithm"
 *      (PR #174, "Feat/FSRS-6"). 5.2.0: "Fix/FSRS-6 default parameters".
 *      No entry between 5.0.0 and 5.4.1 reverts the algorithm generation.
 *   2. `README.md` badge: `FSRS-v6`, linking to the fsrs4anki wiki's FSRS-6
 *      section.
 *   3. The library's own runtime self-report, re-exported below:
 *      `FSRSVersion === 'v5.4.1 using FSRS-6.0'`.
 *   4. Structural corroboration: the default parameter vector has 21 weights
 *      (`w[0..20]`) whose last element is the FSRS-6 decay term 0.1542.
 *      FSRS-5 has 19 weights and a fixed decay of 0.5, which the library still
 *      exports separately as `FSRS5_DEFAULT_DECAY` for migration only.
 *
 * Licence: MIT (`npm view ts-fsrs@5.4.1 license`, and `LICENSE` in the
 * tarball) — compatible with the operator's still-pending repository licence
 * choice (controller §4).
 *
 * ## Why the numbers are here and not just `generatorParameters()`
 *
 * `generatorParameters()` fills in library defaults. Defaults are a moving
 * target across versions — 5.2.0 changed them. A scheduler whose parameters
 * come from whatever the installed library happens to default to is not
 * pinned; it is pinned-shaped. `verifyFsrsPin()` asserts the library still
 * agrees with what is written here, so the day it stops agreeing, the build
 * says so.
 */

import { default_w, FSRSVersion } from 'ts-fsrs';

export const FSRS_PACKAGE = 'ts-fsrs';

/** Exact, no caret, no tilde — mirrored in `packages/domain/package.json`. */
export const FSRS_PINNED_VERSION = '5.4.1';

export const FSRS_ALGORITHM = 'FSRS-6';

/** The library's own runtime self-report: `v5.4.1 using FSRS-6.0`. */
export const FSRS_SELF_REPORTED_VERSION: string = FSRSVersion;

/**
 * Desired retention (DL-13, REQ-SCH-02): 0.90.
 *
 * Phase 0 exposes **no user slider** for this. REQ-SCH-02 is explicit that the
 * learner sees priority controls, not a raw retention dial, and that values
 * near 1.0 are rejected because they explode workload. The constant is here,
 * once, and nothing reads a user preference to override it.
 */
export const FSRS_DESIRED_RETENTION = 0.9;

/**
 * The FSRS-6 weight vector, verbatim.
 *
 * `w[20]` is the FSRS-6 decay term. If a future `ts-fsrs` ships different
 * defaults, `verifyFsrsPin()` reports the drift and this array stays the
 * authority until someone migrates it deliberately with a replay test.
 */
export const FSRS_WEIGHTS: readonly number[] = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

export const FSRS_MAXIMUM_INTERVAL_DAYS = 36500;

/**
 * Fuzz is **off**, and this is not a tuning choice.
 *
 * Fuzzing jitters intervals with a seeded RNG. Any randomness inside the
 * scheduler would make two replays of one log disagree, which is precisely what
 * T-03 forbids and what every evidence claim in this product rests on
 * (REQ-DM-04.5). If interval spreading is ever wanted, it belongs outside the
 * scheduler, in session planning, where it changes presentation and not
 * recorded memory state.
 */
export const FSRS_ENABLE_FUZZ = false;

/** Short-term (learning/relearning) steps are in use; see the step lists. */
export const FSRS_ENABLE_SHORT_TERM = true;

export const FSRS_LEARNING_STEPS: readonly string[] = Object.freeze(['1m', '10m']);
export const FSRS_RELEARNING_STEPS: readonly string[] = Object.freeze(['10m']);

/**
 * Decimal places kept on derived stability and difficulty.
 *
 * FSRS is transcendental arithmetic (`exp`, `log`, `pow`), and ECMAScript does
 * not require those to be bit-identical across engines. Rounding the state to a
 * fixed precision on the way out — **and feeding the rounded value back in on
 * the next review** — means a last-bit difference between two JavaScript
 * runtimes is absorbed at every step instead of compounding across a review
 * history. It is a real mitigation, not a proof: two engines could still
 * straddle a rounding boundary. The residual risk is recorded in the capsule
 * rather than papered over, and the golden scheduling fixture is what would
 * catch it if it ever bit.
 */
export const FSRS_STATE_PRECISION = 8;

/**
 * Stable id for this parameter set.
 *
 * Recorded on every derived `MemoryState`, so a state computed under one
 * parameter set is never silently compared with, or continued from, another.
 * Change any number above and this id must change with it.
 */
export const FSRS_PARAMETER_SET_ID = 'bunki-fsrs6-r090-defaults-v1';

export interface FsrsPin {
  readonly package: string;
  readonly version: string;
  readonly algorithm: string;
  readonly selfReportedVersion: string;
  readonly parameterSetId: string;
  readonly requestRetention: number;
  readonly maximumIntervalDays: number;
  readonly enableFuzz: boolean;
  readonly enableShortTerm: boolean;
  readonly learningSteps: readonly string[];
  readonly relearningSteps: readonly string[];
  readonly weights: readonly number[];
  readonly statePrecision: number;
}

/** The pin as data — for the capsule, the export `appVersions`, and tests. */
export const FSRS_PIN: FsrsPin = Object.freeze({
  package: FSRS_PACKAGE,
  version: FSRS_PINNED_VERSION,
  algorithm: FSRS_ALGORITHM,
  selfReportedVersion: FSRS_SELF_REPORTED_VERSION,
  parameterSetId: FSRS_PARAMETER_SET_ID,
  requestRetention: FSRS_DESIRED_RETENTION,
  maximumIntervalDays: FSRS_MAXIMUM_INTERVAL_DAYS,
  enableFuzz: FSRS_ENABLE_FUZZ,
  enableShortTerm: FSRS_ENABLE_SHORT_TERM,
  learningSteps: FSRS_LEARNING_STEPS,
  relearningSteps: FSRS_RELEARNING_STEPS,
  weights: FSRS_WEIGHTS,
  statePrecision: FSRS_STATE_PRECISION,
});

export interface PinDrift {
  readonly what: string;
  readonly expected: string;
  readonly observed: string;
}

export interface PinVerification {
  readonly ok: boolean;
  readonly drift: readonly PinDrift[];
}

/**
 * Does the installed library still match the pin?
 *
 * Reported rather than thrown at import time: a drifting pin should fail a
 * build, not crash an app mid-session with an error the learner cannot act on.
 * `test/reducers/fsrs-pin.test.ts` is what turns this into a gate.
 */
export function verifyFsrsPin(): PinVerification {
  const drift: PinDrift[] = [];

  if (!FSRS_SELF_REPORTED_VERSION.includes(FSRS_PINNED_VERSION)) {
    drift.push({
      what: 'installed ts-fsrs version',
      expected: FSRS_PINNED_VERSION,
      observed: FSRS_SELF_REPORTED_VERSION,
    });
  }

  // 'FSRS-6' vs the library's 'FSRS-6.0': compare on the generation, which is
  // what REQ-SCH-01 pins, not on the patch spelling.
  if (!FSRS_SELF_REPORTED_VERSION.includes(FSRS_ALGORITHM)) {
    drift.push({
      what: 'algorithm generation',
      expected: FSRS_ALGORITHM,
      observed: FSRS_SELF_REPORTED_VERSION,
    });
  }

  if (default_w.length !== FSRS_WEIGHTS.length) {
    drift.push({
      what: 'default weight-vector length',
      expected: String(FSRS_WEIGHTS.length),
      observed: String(default_w.length),
    });
  } else {
    default_w.forEach((weight, position) => {
      const pinned = FSRS_WEIGHTS[position];
      if (pinned !== weight) {
        drift.push({
          what: `default weight w[${position}]`,
          expected: String(pinned),
          observed: String(weight),
        });
      }
    });
  }

  return { ok: drift.length === 0, drift };
}
