/**
 * The export envelope, on its own (WP-03; controller §11).
 *
 * `verify-export.test.ts` proves the round trip against real stores. This file
 * proves the properties of the envelope itself — the ones a store cannot
 * demonstrate because it only ever produces well-formed ones: that unknown
 * versions fail closed, that `seedRefs` is derived from the events rather than
 * asserted alongside them, and that two exports of one log are byte-identical.
 */

import { EVENT_SCHEMA_VERSION } from '@bunki/domain';
import { encounterCaptured, representativeLog } from '@bunki/persistence';
import { describe, expect, it } from 'vitest';

import {
  EXPORT_VERSION,
  ExportEnvelopeError,
  buildExportEnvelope,
  collectSeedRefs,
  parseExportEnvelope,
  serializeExportEnvelope,
} from '../src/index.ts';

const build = (events = representativeLog()) =>
  buildExportEnvelope({
    events,
    generatedAt: '2026-07-27T12:00:00.000Z',
    appVersions: { domain: '@bunki/domain@0.0.0', fsrs: null },
  });

describe('envelope shape (controller §11)', () => {
  it('carries exactly the five specified fields', () => {
    expect(Object.keys(build()).sort()).toEqual([
      'appVersions',
      'events',
      'exportVersion',
      'generatedAt',
      'seedRefs',
    ]);
  });

  it('derives the schema version from the domain rather than accepting one', () => {
    // A caller cannot mislabel the schema its own events are in: `schema` is
    // read from @bunki/domain, never injected.
    expect(build().appVersions.schema).toBe(EVENT_SCHEMA_VERSION);
  });

  it('records fsrs as null while no scheduler is pinned, rather than inventing a version', () => {
    // WP-06 owns the pin (controller §6.3). `null` says "this build has none";
    // a plausible string would say something false about a component that does
    // not exist.
    expect(build().appVersions.fsrs).toBeNull();
  });

  it('exports the log verbatim — no filtering, no summarising, no derived state', () => {
    const log = representativeLog();
    const envelope = build(log);

    expect(envelope.events).toEqual(log);
    expect(Object.keys(envelope)).not.toContain('derivedState');
  });

  it('produces identical bytes for identical input', () => {
    expect(serializeExportEnvelope(build())).toBe(serializeExportEnvelope(build()));
  });
});

describe('seedRefs are derived from the events, never asserted beside them', () => {
  it('collects one ref per distinct source/provenance pair, with the citing encounters', () => {
    const refs = collectSeedRefs(representativeLog());

    expect(refs).toHaveLength(2);
    const shareAlike = refs.find((ref) => ref.license === 'CC BY-SA 4.0');
    expect(shareAlike).toBeDefined();
    expect(shareAlike?.attribution).toBe('Fixture attribution that must survive export (T-15)');
    expect(shareAlike?.encounterIds).toEqual(['encounter-c2']);
  });

  it('does not merge two encounters that cite one source under different licences', () => {
    // Merging would have to pick a licence, and picking is the silent choice
    // this project refuses everywhere else.
    const refs = collectSeedRefs([
      encounterCaptured({ eventId: 'evt-1', encounterId: 'e-1', sourceId: 'shared', license: 'A' }),
      encounterCaptured({
        eventId: 'evt-2',
        encounterId: 'e-2',
        threadId: 'thread-c1',
        sourceId: 'shared',
        license: 'B',
      }),
    ]);

    expect(refs.map((ref) => ref.license).sort()).toEqual(['A', 'B']);
  });

  it('groups repeat citations of one reference under a single entry', () => {
    const refs = collectSeedRefs([
      encounterCaptured({ eventId: 'evt-1', encounterId: 'e-1' }),
      encounterCaptured({ eventId: 'evt-2', encounterId: 'e-2' }),
    ]);

    expect(refs).toHaveLength(1);
    expect(refs[0]?.encounterIds).toEqual(['e-1', 'e-2']);
  });

  it('omits the per-encounter locator, which is a pointer at content and not a licence fact', () => {
    const refs = collectSeedRefs([encounterCaptured()]);
    expect(refs[0]).not.toHaveProperty('locator');
  });

  it('is empty for a log with no encounters', () => {
    expect(collectSeedRefs([])).toEqual([]);
  });
});

describe('parsing fails closed', () => {
  it('rejects an unknown export version before looking at anything else', () => {
    const error = (() => {
      try {
        parseExportEnvelope({ exportVersion: 99, nonsense: true });
        return null;
      } catch (thrown) {
        return thrown;
      }
    })();

    expect(error).toBeInstanceOf(ExportEnvelopeError);
    expect((error as ExportEnvelopeError).code).toBe('UNKNOWN_EXPORT_VERSION');
  });

  it('rejects a non-object payload', () => {
    expect(() => parseExportEnvelope([])).toThrow(ExportEnvelopeError);
    expect(() => parseExportEnvelope(null)).toThrow(ExportEnvelopeError);
  });

  it('rejects an envelope carrying an unrecognised field', () => {
    const envelope = { ...build(), surprise: 1 };
    expect(() => parseExportEnvelope(envelope)).toThrow(/failed validation/);
  });

  it('runs the events through the domain parser rather than a copy of it', () => {
    const envelope = { ...build([]), events: [{ ...encounterCaptured(), v: 2 }] };
    expect(() => parseExportEnvelope(envelope)).toThrow(/Unknown event schema version/);
  });

  it('accepts an envelope it produced', () => {
    const envelope = build();
    const reparsed = parseExportEnvelope(JSON.parse(serializeExportEnvelope(envelope)));
    expect(reparsed.exportVersion).toBe(EXPORT_VERSION);
    expect(reparsed.events).toEqual(envelope.events);
    expect(reparsed.seedRefs).toEqual(envelope.seedRefs);
  });
});
