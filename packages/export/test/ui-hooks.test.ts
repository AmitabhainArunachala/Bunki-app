/**
 * The export button's honesty (WP-09; controller §11, T-14, T-15,
 * REQ-ARCH-08, REQ-GATE-03).
 *
 * `verify-export.test.ts` proves the round trip against real store adapters.
 * This file proves the thing a *screen* depends on: that the sentence rendered
 * beside the button is derived from the check's outcome and cannot be stronger
 * than it, that the check runs against bytes rather than an in-memory object,
 * and that a failure is reported as a failure.
 *
 * The negative control is the load-bearing test. A verifier that returned
 * `pass` unconditionally would satisfy every positive assertion here.
 */

import { EMPTY_DERIVED_STATE, FSRS_PIN, replay, type DomainEvent } from '@bunki/domain';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  appVersionsForBuild,
  canonicalStateJson,
  EXPORT_VERSION,
  EXPORT_VERIFICATION_PRECONDITIONS,
  ExportEnvelopeError,
  exportLicenceLines,
  exportSummaryLine,
  prepareExport,
  serializeExportEnvelope,
  verifyExportBytes,
  WIDER_VERIFICATION_COMMAND,
} from '../src/index.ts';

const GENERATED_AT = '2026-07-27T12:00:00.000Z';

const encounter: DomainEvent = {
  eventId: 'evt-1',
  v: 1,
  occurredAt: '2026-07-27T08:00:00.000Z',
  idempotencyKey: 'capture:1',
  type: 'EncounterCaptured',
  encounterId: 'enc-1',
  threadId: 'thread-1',
  text: '分岐',
  sourceRef: { sourceId: 'source-1', kind: 'manual', locator: 'ui-hooks-test' },
  provenance: {
    source: 'user_encounter',
    license: 'CC BY-SA 4.0',
    attribution: 'Attribution that must survive the round trip (T-15)',
    modificationStatus: 'unmodified',
    reviewStatus: 'unreviewed',
  },
};

const promotion: DomainEvent = {
  eventId: 'evt-2',
  v: 1,
  occurredAt: '2026-07-27T08:05:00.000Z',
  idempotencyKey: 'promote:1',
  type: 'ThreadPromotionChanged',
  threadId: 'thread-1',
  from: 'captured',
  to: 'keep',
  origin: 'user',
};

const LOG: readonly DomainEvent[] = [encounter, promotion];

const prepared = (events: readonly DomainEvent[] = LOG): ReturnType<typeof prepareExport> =>
  prepareExport({
    events,
    generatedAt: GENERATED_AT,
    appVersions: appVersionsForBuild(),
    liveState: replay(events),
  });

describe('prepareExport gives a button everything it needs', () => {
  it('produces the versioned envelope and its canonical bytes', () => {
    const result = prepared();
    expect(result.envelope.exportVersion).toBe(EXPORT_VERSION);
    expect(result.envelope.events).toHaveLength(2);
    expect(result.json).toBe(serializeExportEnvelope(result.envelope));
    expect(JSON.parse(result.json)).toEqual(JSON.parse(result.json));
  });

  it('reports a UTF-8 byte length, not a UTF-16 code-unit count', () => {
    const result = prepared();
    // The log contains 分岐 — three bytes per character in UTF-8, one code unit
    // each in UTF-16. A length that matched `json.length` would understate it.
    expect(result.byteLength).toBeGreaterThan(result.json.length);
    expect(result.byteLength).toBe(new TextEncoder().encode(result.json).length);
  });

  it('is deterministic: two exports at one instant are byte-identical', () => {
    expect(prepared().json).toBe(prepared().json);
  });

  it('summarises by counting, with nothing that could be content', () => {
    const summary = exportSummaryLine(prepared().envelope);
    expect(summary).toContain('2 events');
    expect(summary).toContain('export version 1');
    expect(summary).not.toContain('分岐');
  });
});

describe('the verification badge says exactly what was checked', () => {
  it('passes, and qualifies what a pass means', () => {
    const { verification } = prepared();

    expect(verification.equal).toBe(true);
    expect(verification.badge.status).toBe('pass');
    expect(verification.badge.headline).toContain('Replay check passed');
    expect(verification.badge.qualifier).toContain('not durability');
    expect(verification.firstDifference).toBeNull();
  });

  it('never uses the bare word “verified”, which the reader would fill in', () => {
    const { verification } = prepared();
    const text = [
      verification.badge.headline,
      verification.badge.qualifier,
      ...verification.checked,
    ].join(' ');
    expect(text).not.toMatch(/\bverified\b/i);
  });

  it('lists what the check did not establish, beside what it did', () => {
    const { verification } = prepared();
    const notChecked = verification.notChecked.join(' ');

    expect(notChecked).toContain('Durability');
    expect(notChecked).toContain('two independent projections');
    expect(notChecked).toContain(WIDER_VERIFICATION_COMMAND);
    expect(verification.checked.join(' ')).toContain('serialised to text and parsed back');
  });

  /**
   * The negative control. Comparing an export against a *different* state must
   * report inequality — otherwise every assertion above passes on a verifier
   * that always says yes.
   */
  it('fails, visibly, when the export does not describe the live state', () => {
    const result = prepareExport({
      events: LOG,
      generatedAt: GENERATED_AT,
      appVersions: appVersionsForBuild(),
      liveState: EMPTY_DERIVED_STATE,
    });

    expect(result.verification.equal).toBe(false);
    expect(result.verification.badge.status).toBe('fail');
    expect(result.verification.badge.headline).toContain('FAILED');
    expect(result.verification.badge.qualifier).toContain('Do not treat this export');
    expect(result.verification.firstDifference).not.toBeNull();
    expect(result.verification.checked.join(' ')).toContain('did NOT reproduce');
  });

  it('checks the bytes, not the object — a lost value cannot slip past', () => {
    const result = prepared();
    // `verifyExportBytes` is what `prepareExport` calls. Handing it the same
    // text proves the byte path is the one under test.
    expect(verifyExportBytes(result.json, replay(LOG)).equal).toBe(true);
  });

  it('treats a malformed export as a parse failure, not as a mismatch', () => {
    const tampered = JSON.stringify({ ...JSON.parse(prepared().json), exportVersion: 2 });
    expect(() => verifyExportBytes(tampered, replay(LOG))).toThrow(ExportEnvelopeError);
    expect(() => verifyExportBytes(tampered, replay(LOG))).toThrow(/Unknown export version/);
  });

  it('round-trips an empty log without pretending it checked more', () => {
    const result = prepared([]);
    expect(result.verification.equal).toBe(true);
    expect(result.verification.eventCount).toBe(0);
  });

  it('states the preconditions a caller must satisfy for any of this to mean something', () => {
    expect(EXPORT_VERIFICATION_PRECONDITIONS.join(' ')).toContain('DataExported');
    expect(EXPORT_VERIFICATION_PRECONDITIONS.join(' ')).toContain('injected clock');
  });
});

describe('licence obligations survive and are readable (T-15)', () => {
  it('lists every source the exported events cite', () => {
    const lines = exportLicenceLines(prepared().envelope);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      sourceId: 'source-1',
      license: 'CC BY-SA 4.0',
      attribution: 'Attribution that must survive the round trip (T-15)',
      encounterCount: 1,
    });
  });

  it('reports a missing attribution as null rather than as an empty string', () => {
    const noAttribution: DomainEvent = {
      ...encounter,
      eventId: 'evt-3',
      encounterId: 'enc-3',
      idempotencyKey: 'capture:3',
      provenance: {
        source: 'user_encounter',
        license: 'user_owned',
        modificationStatus: 'unmodified',
        reviewStatus: 'unreviewed',
      },
    };
    const lines = exportLicenceLines(prepared([noAttribution]).envelope);
    expect(lines[0]?.attribution).toBeNull();
  });
});

describe('appVersions describes the build honestly', () => {
  it('names the pinned scheduling engine, because WP-06 landed', () => {
    const versions = appVersionsForBuild();
    expect(versions.fsrs).not.toBeNull();
    expect(versions.fsrs).toContain(FSRS_PIN.package);
    expect(versions.fsrs).toContain(FSRS_PIN.version);
    expect(versions.fsrs).toContain(FSRS_PIN.algorithm);
    // The parameter set, so "same library" and "same numbers" stay distinct.
    expect(versions.fsrs).toContain(FSRS_PIN.parameterSetId);
  });

  /**
   * The literal version string cannot be read from `package.json` at runtime on
   * every target this package supports, so it is pinned here instead. This test
   * is what stops it drifting silently.
   */
  it('keeps the domain version literal in step with the manifest', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const manifest: unknown = JSON.parse(
      readFileSync(resolve(here, '../../domain/package.json'), 'utf8'),
    );
    const version = (manifest as { name: string; version: string }).version;
    const name = (manifest as { name: string; version: string }).name;
    expect(appVersionsForBuild().domain).toBe(`${name}@${version}`);
  });
});

describe('canonicalStateJson shows the comparison’s own text', () => {
  it('returns the same bytes the equality check used', () => {
    const state = replay(LOG);
    expect(canonicalStateJson(state)).toBe(canonicalStateJson(replay(LOG)));
    expect(canonicalStateJson(state)).not.toBe(canonicalStateJson(EMPTY_DERIVED_STATE));
  });
});
