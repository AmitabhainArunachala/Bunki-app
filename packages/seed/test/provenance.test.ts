/**
 * Provenance completeness (WP-04 closure predicate; feeds T-15).
 *
 * The controller's claim is that *every field* of every seed record carries
 * REQ-SRC-01 provenance. This file is what makes that claim falsifiable, and it
 * checks it from both ends:
 *
 *   1. the **resolved** dataset a consumer actually receives — every data field
 *      of every record has a materialised ProvenanceRecord with all seven
 *      REQ-SRC-01 fields populated;
 *   2. the **raw JSON on disk**, walked independently of the loader, so a
 *      loader bug that silently invents provenance cannot hide an unsourced
 *      field in the data files.
 *
 * Plus the negative half, which is the part that actually has teeth: strip a
 * provenance entry, point one at a source that does not exist, or try to
 * relicense a single field, and the loader must refuse.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { allSeedRecords, seedDataset } from '../src/index.ts';
import {
  OVERRIDABLE_PROVENANCE_FIELDS,
  REQ_SRC_01_FIELDS,
  type ProvenanceRecord,
} from '../src/types.ts';
import {
  NON_DATA_KEYS,
  SeedDataError,
  parseProvenanceRecord,
  parseProvenanceRegistry,
  readRecordsArray,
  resolveRecordProvenance,
} from '../src/validate.ts';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');

/** The record files, i.e. everything except the registry and the stroke manifest. */
const RECORD_FILES = [
  'lexemes.json',
  'kanji.json',
  'grammar.json',
  'sentences.json',
  'passages.json',
  'sources.json',
] as const;

const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as unknown;

/** Keys of a resolved record that are not sourced content. */
const RESOLVED_NON_DATA_KEYS = ['id', 'provenance'];

describe('REQ-SRC-01 provenance completeness — resolved dataset', () => {
  it('walks every field of every record and finds all seven provenance fields', () => {
    let fieldsWalked = 0;

    for (const record of allSeedRecords) {
      const entries = Object.entries(record) as [string, unknown][];
      const dataKeys = entries
        .map(([key]) => key)
        .filter((key) => !RESOLVED_NON_DATA_KEYS.includes(key));

      expect(dataKeys.length, `${record.id} has no data fields`).toBeGreaterThan(0);

      const provenance = record.provenance as Record<string, ProvenanceRecord>;

      for (const key of dataKeys) {
        const field = provenance[key];
        expect(field, `${record.id}.${key} has no provenance`).toBeDefined();

        for (const required of REQ_SRC_01_FIELDS) {
          const value: unknown = field?.[required];
          expect(
            typeof value === 'string' && value.trim().length > 0,
            `${record.id}.${key} provenance field "${required}" is missing or empty (got ${JSON.stringify(value)})`,
          ).toBe(true);
        }

        // Nullable-but-required keys must be present, so "unknown" is a stated
        // null rather than an omission nobody notices.
        for (const nullable of [
          'source_url',
          'retrieved_at',
          'source_entry_id',
          'notes',
        ] as const) {
          expect(field, `${record.id}.${key} provenance omits "${nullable}"`).toHaveProperty(
            nullable,
          );
        }

        fieldsWalked += 1;
      }
    }

    // Guards against the walk silently shrinking to nothing.
    expect(fieldsWalked).toBeGreaterThanOrEqual(100);
  });

  it('resolves every field to a source that exists in the registry', () => {
    const knownSources = new Set(
      Object.values(seedDataset.provenanceSources).map((source) => source.source),
    );

    for (const record of allSeedRecords) {
      for (const [key, field] of Object.entries(
        record.provenance as Record<string, { source: string }>,
      )) {
        expect(knownSources, `${record.id}.${key} names an unregistered source`).toContain(
          field.source,
        );
      }
    }
  });

  it('states a licence for every field, and never leaves it blank or "unknown"', () => {
    for (const record of allSeedRecords) {
      for (const [key, field] of Object.entries(
        record.provenance as Record<string, { license: string; attribution: string }>,
      )) {
        expect(field.license.trim(), `${record.id}.${key}`).not.toBe('');
        expect(field.license.toLowerCase(), `${record.id}.${key}`).not.toBe('unknown');
        expect(field.attribution.trim(), `${record.id}.${key}`).not.toBe('');
      }
    }
  });

  it('marks nothing primary-source-verified unless it carries a URL and a retrieval date', () => {
    for (const record of allSeedRecords) {
      for (const [key, field] of Object.entries(
        record.provenance as Record<
          string,
          { review_status: string; source_url: string | null; retrieved_at: string | null }
        >,
      )) {
        if (field.review_status !== 'primary-source-verified') continue;
        expect(field.source_url, `${record.id}.${key} claims verification with no URL`).toMatch(
          /^https:\/\//,
        );
        expect(
          field.retrieved_at,
          `${record.id}.${key} claims verification with no retrieval date`,
        ).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    }
  });
});

describe('REQ-SRC-01 provenance completeness — raw JSON on disk', () => {
  it('gives every data key in every data file a fieldProvenance entry', () => {
    const registry = parseProvenanceRegistry(readJson('provenance.json'));
    let fieldsWalked = 0;

    for (const file of RECORD_FILES) {
      const records = readRecordsArray(readJson(file), file);
      expect(records.length, `${file} has no records`).toBeGreaterThan(0);

      for (const [index, raw] of records.entries()) {
        const specs = raw['fieldProvenance'] as Record<string, unknown>;
        expect(specs, `${file}[${index}] has no fieldProvenance`).toBeTypeOf('object');

        for (const key of Object.keys(raw)) {
          if ((NON_DATA_KEYS as readonly string[]).includes(key)) continue;
          expect(
            specs,
            `${file}[${index}].${key} is unprovenanced in the data file`,
          ).toHaveProperty(key);
          const spec = specs[key];
          const ref = typeof spec === 'string' ? spec : (spec as { ref: string }).ref;
          expect(registry, `${file}[${index}].${key} -> "${ref}"`).toHaveProperty(ref);
          fieldsWalked += 1;
        }
      }
    }

    expect(fieldsWalked).toBeGreaterThanOrEqual(100);
  });

  it('keeps the non-data key list to exactly id and fieldProvenance', () => {
    // If someone widens this list, fields start escaping the walk above without
    // any test going red. Pin it.
    expect([...NON_DATA_KEYS]).toEqual(['id', 'fieldProvenance']);
  });

  it('registers every provenance source with all eleven keys', () => {
    const doc = readJson('provenance.json') as { sources: Record<string, unknown> };
    for (const [id, entry] of Object.entries(doc.sources)) {
      expect(() => parseProvenanceRecord(entry, id)).not.toThrow();
    }
  });
});

describe('provenance rules are enforced, not merely documented', () => {
  const registry = parseProvenanceRegistry(readJson('provenance.json'));
  const goodRecord = () => ({
    id: 'probe-1',
    headword: '分岐',
    fieldProvenance: { headword: 'bunki-selection' },
  });

  it('accepts a well-formed record', () => {
    expect(() => resolveRecordProvenance(goodRecord(), registry, 'probe')).not.toThrow();
  });

  it('rejects a field with no provenance entry', () => {
    const record = { ...goodRecord(), reading: 'ぶんき' };
    expect(() => resolveRecordProvenance(record, registry, 'probe')).toThrow(SeedDataError);
    expect(() => resolveRecordProvenance(record, registry, 'probe')).toThrow(/every field carries/);
  });

  it('rejects a provenance entry pointing at a source that does not exist', () => {
    const record = { ...goodRecord(), fieldProvenance: { headword: 'no-such-source' } };
    expect(() => resolveRecordProvenance(record, registry, 'probe')).toThrow(
      /unknown provenance source/,
    );
  });

  it('rejects a provenance entry describing a field the record does not have', () => {
    const record = {
      ...goodRecord(),
      fieldProvenance: { headword: 'bunki-selection', ghost: 'bunki-selection' },
    };
    expect(() => resolveRecordProvenance(record, registry, 'probe')).toThrow(
      /does not exist on the record/,
    );
  });

  it('refuses to let a single field relicense or re-attribute itself', () => {
    for (const forbidden of [
      'license',
      'attribution',
      'source',
      'source_version',
      'modification_status',
    ]) {
      const record = {
        ...goodRecord(),
        fieldProvenance: {
          headword: { ref: 'bunki-selection', [forbidden]: 'CC0 (definitely fine, trust me)' },
        },
      };
      expect(
        () => resolveRecordProvenance(record, registry, 'probe'),
        `${forbidden} must not be overridable`,
      ).toThrow(/may not override/);
    }
  });

  it('allows exactly the four documented overrides', () => {
    for (const allowed of OVERRIDABLE_PROVENANCE_FIELDS) {
      const value =
        allowed === 'confidence' ? 'low' : allowed === 'review_status' ? 'unreviewed' : 'x';
      const record = {
        ...goodRecord(),
        fieldProvenance: { headword: { ref: 'bunki-selection', [allowed]: value } },
      };
      expect(
        () => resolveRecordProvenance(record, registry, 'probe'),
        `${allowed} should be overridable`,
      ).not.toThrow();
    }
  });

  it('rejects a registry entry missing any REQ-SRC-01 field', () => {
    const complete = seedDataset.provenanceSources['bunki-selection'];
    expect(complete).toBeDefined();

    for (const field of REQ_SRC_01_FIELDS) {
      const broken: Record<string, unknown> = { ...complete };
      delete broken[field];
      expect(() => parseProvenanceRecord(broken, 'probe'), `missing ${field}`).toThrow(
        /is missing REQ-SRC-01 field/,
      );
    }
  });

  it('rejects a registry entry that omits a nullable key instead of stating null', () => {
    const complete = seedDataset.provenanceSources['bunki-selection'];
    for (const field of ['source_url', 'retrieved_at', 'source_entry_id', 'notes']) {
      const broken: Record<string, unknown> = { ...complete };
      delete broken[field];
      expect(() => parseProvenanceRecord(broken, 'probe'), `omitted ${field}`).toThrow(
        /use null, not omission/,
      );
    }
  });

  it('rejects an empty string where a REQ-SRC-01 field is required', () => {
    const broken = { ...seedDataset.provenanceSources['bunki-selection'], license: '   ' };
    expect(() => parseProvenanceRecord(broken, 'probe')).toThrow(/must be a non-empty string/);
  });
});
