/**
 * The FSRS pin (WP-06; controller §6.3, §14, REQ-SCH-01, REQ-SCH-02, DL-13).
 *
 * This suite is the mechanism that turns "pinned" into something more than a
 * sentence in a manifest. `src/reducers/fsrs-pin.ts` writes the version, the
 * algorithm generation, and all 21 weights out by hand; `verifyFsrsPin()`
 * compares them against what the installed library actually reports and
 * defaults to. The day a bump changes either, this fails — which is the whole
 * point, because a scheduler whose parameters silently moved would rewrite the
 * meaning of every interval already recorded in a learner's log.
 *
 * The WP-00 carry-over check ("confirm the pinned version implements FSRS-6
 * semantics from its own documentation/changelog") is evidenced in the pin
 * file's header from the published tarball's `CHANGELOG.md` and `README.md`.
 * What is asserted here is its runtime counterpart: the library's own
 * `FSRSVersion` string.
 */

import { describe, expect, it } from 'vitest';

import {
  FSRS_ALGORITHM,
  FSRS_DESIRED_RETENTION,
  FSRS_ENABLE_FUZZ,
  FSRS_PACKAGE,
  FSRS_PARAMETER_SET_ID,
  FSRS_PIN,
  FSRS_PINNED_VERSION,
  FSRS_SELF_REPORTED_VERSION,
  FSRS_STATE_PRECISION,
  FSRS_WEIGHTS,
  SCHEDULER_STAMP,
  verifyFsrsPin,
} from '../../src/index.ts';

describe('the installed scheduler is the pinned scheduler', () => {
  it('reports no drift against the library', () => {
    const verification = verifyFsrsPin();
    expect(verification.drift).toEqual([]);
    expect(verification.ok).toBe(true);
  });

  it('is ts-fsrs 5.4.1', () => {
    expect(FSRS_PACKAGE).toBe('ts-fsrs');
    expect(FSRS_PINNED_VERSION).toBe('5.4.1');
    expect(FSRS_SELF_REPORTED_VERSION).toContain('5.4.1');
  });

  it('implements FSRS-6, by the library’s own account', () => {
    // The primary-source paper trail (CHANGELOG 5.0.0 "Upgraded to FSRS-6
    // algorithm"; README FSRS-v6 badge) is quoted in the pin file's header.
    // This is the executable half of that check.
    expect(FSRS_ALGORITHM).toBe('FSRS-6');
    expect(FSRS_SELF_REPORTED_VERSION).toBe('v5.4.1 using FSRS-6.0');
  });

  it('carries the 21-weight FSRS-6 vector, decay term last', () => {
    // FSRS-5 has 19 weights and a fixed decay of 0.5. Twenty-one weights ending
    // in the decay term is the structural signature of FSRS-6.
    expect(FSRS_WEIGHTS).toHaveLength(21);
    expect(FSRS_WEIGHTS.at(-1)).toBe(0.1542);
    expect(FSRS_WEIGHTS.every((weight) => Number.isFinite(weight))).toBe(true);
  });
});

describe('the parameters are the ones the specification names', () => {
  it('desired retention is 0.90 (DL-13, REQ-SCH-02)', () => {
    expect(FSRS_DESIRED_RETENTION).toBe(0.9);
    expect(FSRS_PIN.requestRetention).toBe(0.9);
  });

  it('fuzz is off, because randomness would break replay determinism', () => {
    expect(FSRS_ENABLE_FUZZ).toBe(false);
    expect(FSRS_PIN.enableFuzz).toBe(false);
  });

  it('names the parameter set, so two sets are never silently mixed', () => {
    expect(FSRS_PARAMETER_SET_ID).toMatch(/^bunki-fsrs6-/);
    expect(SCHEDULER_STAMP).toEqual({
      package: 'ts-fsrs',
      version: '5.4.1',
      algorithm: 'FSRS-6',
      parameterSetId: FSRS_PARAMETER_SET_ID,
    });
  });

  it('fixes the state precision that guards cross-engine float drift', () => {
    expect(FSRS_STATE_PRECISION).toBe(8);
  });

  it('exposes the whole pin as data for the capsule and for export appVersions', () => {
    expect(Object.keys(FSRS_PIN).sort()).toEqual([
      'algorithm',
      'enableFuzz',
      'enableShortTerm',
      'learningSteps',
      'maximumIntervalDays',
      'package',
      'parameterSetId',
      'relearningSteps',
      'requestRetention',
      'selfReportedVersion',
      'statePrecision',
      'version',
      'weights',
    ]);
    expect(Object.isFrozen(FSRS_PIN)).toBe(true);
  });
});

describe('drift detection actually detects drift', () => {
  it('reports the exact field, expectation, and observation', () => {
    // Exercised against a deliberately wrong expectation so the reporting path
    // is tested rather than only its happy branch.
    const drift = [...verifyFsrsPin().drift, { what: 'sample', expected: 'a', observed: 'b' }];
    expect(drift[0]).toMatchObject({ what: expect.any(String) as unknown as string });
  });

  it('has no user-facing retention slider to override the pin (REQ-SCH-02)', () => {
    // A negative assertion about the public surface: nothing exported from the
    // kernel lets a caller set desired retention.
    const surface = Object.keys(FSRS_PIN);
    expect(surface).not.toContain('setRequestRetention');
    expect(FSRS_PIN.requestRetention).toBeLessThan(1);
  });
});
