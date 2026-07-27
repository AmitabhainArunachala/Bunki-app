/**
 * Dependency-free validation and provenance resolution for the seed dataset (WP-04).
 *
 * Two jobs:
 *
 *   1. Turn the on-disk JSON into typed records, failing closed on anything that
 *      does not match. `@bunki/seed` has no runtime dependencies — zod lives in
 *      `devDependencies` and is used in `test/schema.test.ts` as an *independent*
 *      second implementation of the same rules, so a bug in this file does not
 *      also silence the test that is supposed to catch it.
 *   2. Resolve each field's provenance reference into a full
 *      {@link ProvenanceRecord}, so every consumer — the app, the export path,
 *      the T-15 survival test — sees materialised provenance per field, never a
 *      pointer it has to know how to follow.
 *
 * The keys `id` and `fieldProvenance` are the only keys of a record that are not
 * themselves data. Everything else must name a provenance source; a record with
 * an unprovenanced field, an unknown reference, or a stray `fieldProvenance` key
 * for a field that does not exist is rejected here and by the tests.
 */

import {
  OVERRIDABLE_PROVENANCE_FIELDS,
  REQ_SRC_01_FIELDS,
  type Confidence,
  type ModificationStatus,
  type ProvenanceRecord,
  type ReviewStatus,
} from './types.ts';

/** Record keys that carry no sourced content and therefore need no provenance. */
export const NON_DATA_KEYS = ['id', 'fieldProvenance'] as const;

const MODIFICATION_STATUSES: readonly ModificationStatus[] = ['unmodified', 'derived', 'original'];
const CONFIDENCES: readonly Confidence[] = ['high', 'medium', 'low'];
const REVIEW_STATUSES: readonly ReviewStatus[] = [
  'primary-source-verified',
  'reviewed-in-project',
  'unreviewed',
];

export class SeedDataError extends Error {
  constructor(message: string) {
    super(`@bunki/seed: ${message}`);
    this.name = 'SeedDataError';
  }
}

const fail = (message: string): never => {
  throw new SeedDataError(message);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRecord = (value: unknown, where: string): Record<string, unknown> =>
  isRecord(value) ? value : fail(`${where} must be an object`);

const asNonEmptyString = (value: unknown, where: string): string =>
  typeof value === 'string' && value.trim().length > 0
    ? value
    : fail(`${where} must be a non-empty string`);

const asNullableString = (value: unknown, where: string): string | null => {
  if (value === null) return null;
  return typeof value === 'string' ? value : fail(`${where} must be a string or null`);
};

const asMember = <T extends string>(value: unknown, allowed: readonly T[], where: string): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fail(`${where} must be one of ${allowed.join(' | ')}, got ${JSON.stringify(value)}`);

/**
 * Parse one registry entry. Every one of the eleven keys must be present: a
 * missing key is a failure, and `null` is only accepted where "no such thing"
 * is a meaningful answer (`source_url`, `retrieved_at`, `source_entry_id`,
 * `notes`). The seven REQ-SRC-01 fields are never nullable.
 */
export function parseProvenanceRecord(value: unknown, where: string): ProvenanceRecord {
  const raw = asRecord(value, where);

  for (const field of REQ_SRC_01_FIELDS) {
    if (!(field in raw)) fail(`${where} is missing REQ-SRC-01 field "${field}"`);
  }
  for (const field of ['source_url', 'retrieved_at', 'source_entry_id', 'notes'] as const) {
    if (!(field in raw)) fail(`${where} is missing field "${field}" (use null, not omission)`);
  }

  return {
    source: asNonEmptyString(raw['source'], `${where}.source`),
    source_version: asNonEmptyString(raw['source_version'], `${where}.source_version`),
    license: asNonEmptyString(raw['license'], `${where}.license`),
    attribution: asNonEmptyString(raw['attribution'], `${where}.attribution`),
    modification_status: asMember(
      raw['modification_status'],
      MODIFICATION_STATUSES,
      `${where}.modification_status`,
    ),
    confidence: asMember(raw['confidence'], CONFIDENCES, `${where}.confidence`),
    review_status: asMember(raw['review_status'], REVIEW_STATUSES, `${where}.review_status`),
    source_url: asNullableString(raw['source_url'], `${where}.source_url`),
    retrieved_at: asNullableString(raw['retrieved_at'], `${where}.retrieved_at`),
    source_entry_id: asNullableString(raw['source_entry_id'], `${where}.source_entry_id`),
    notes: asNullableString(raw['notes'], `${where}.notes`),
  };
}

export function parseProvenanceRegistry(value: unknown): Record<string, ProvenanceRecord> {
  const doc = asRecord(value, 'data/provenance.json');
  const sources = asRecord(doc['sources'], 'data/provenance.json .sources');
  const registry: Record<string, ProvenanceRecord> = {};
  for (const [id, entry] of Object.entries(sources)) {
    registry[id] = parseProvenanceRecord(entry, `provenance source "${id}"`);
  }
  if (Object.keys(registry).length === 0) fail('provenance registry is empty');
  return registry;
}

/**
 * Resolve one field's provenance: either a bare registry id, or `{ ref, ... }`
 * with overrides limited to {@link OVERRIDABLE_PROVENANCE_FIELDS}.
 */
function resolveFieldProvenance(
  spec: unknown,
  registry: Readonly<Record<string, ProvenanceRecord>>,
  where: string,
): ProvenanceRecord {
  if (typeof spec === 'string') {
    const base = registry[spec];
    return base ?? fail(`${where} references unknown provenance source "${spec}"`);
  }

  const raw = asRecord(spec, where);
  const ref = asNonEmptyString(raw['ref'], `${where}.ref`);
  const base = registry[ref] ?? fail(`${where} references unknown provenance source "${ref}"`);

  for (const key of Object.keys(raw)) {
    if (key === 'ref') continue;
    if (!(OVERRIDABLE_PROVENANCE_FIELDS as readonly string[]).includes(key)) {
      fail(
        `${where} may not override "${key}" — only ${OVERRIDABLE_PROVENANCE_FIELDS.join(', ')} are overridable, so a field can never relicense or re-attribute itself`,
      );
    }
  }

  return {
    ...base,
    ...('confidence' in raw
      ? { confidence: asMember(raw['confidence'], CONFIDENCES, `${where}.confidence`) }
      : {}),
    ...('review_status' in raw
      ? { review_status: asMember(raw['review_status'], REVIEW_STATUSES, `${where}.review_status`) }
      : {}),
    ...('source_entry_id' in raw
      ? { source_entry_id: asNullableString(raw['source_entry_id'], `${where}.source_entry_id`) }
      : {}),
    ...('notes' in raw ? { notes: asNullableString(raw['notes'], `${where}.notes`) } : {}),
  };
}

/**
 * Split one raw record into its data fields and a fully-resolved provenance map,
 * rejecting any field without provenance and any provenance entry without a field.
 */
export function resolveRecordProvenance(
  raw: Record<string, unknown>,
  registry: Readonly<Record<string, ProvenanceRecord>>,
  where: string,
): { id: string; data: Record<string, unknown>; provenance: Record<string, ProvenanceRecord> } {
  const id = asNonEmptyString(raw['id'], `${where}.id`);
  const specs = asRecord(raw['fieldProvenance'], `${where}.fieldProvenance`);

  const dataKeys = Object.keys(raw).filter(
    (key) => !(NON_DATA_KEYS as readonly string[]).includes(key),
  );
  if (dataKeys.length === 0) fail(`${where} has no data fields`);

  const data: Record<string, unknown> = {};
  const provenance: Record<string, ProvenanceRecord> = {};

  for (const key of dataKeys) {
    if (!(key in specs)) {
      fail(`${where}.${key} has no provenance entry (REQ-SRC-01: every field carries provenance)`);
    }
    data[key] = raw[key];
    provenance[key] = resolveFieldProvenance(
      specs[key],
      registry,
      `${where}.fieldProvenance.${key}`,
    );
  }

  for (const key of Object.keys(specs)) {
    if (!dataKeys.includes(key)) {
      fail(`${where}.fieldProvenance.${key} describes a field that does not exist on the record`);
    }
  }

  return { id, data, provenance };
}

/** Read the `records` array out of one seed data file. */
export function readRecordsArray(doc: unknown, file: string): Record<string, unknown>[] {
  const parsed = asRecord(doc, file);
  const records = parsed['records'];
  if (!Array.isArray(records)) fail(`${file} .records must be an array`);
  return (records as unknown[]).map((entry, index) => asRecord(entry, `${file}[${index}]`));
}

export const asStringArray = (value: unknown, where: string): string[] => {
  if (!Array.isArray(value)) fail(`${where} must be an array`);
  return (value as unknown[]).map((entry, index) =>
    typeof entry === 'string' ? entry : fail(`${where}[${index}] must be a string`),
  );
};

export const asInteger = (value: unknown, where: string): number =>
  typeof value === 'number' && Number.isInteger(value)
    ? value
    : fail(`${where} must be an integer`);

export { asNonEmptyString, asNullableString, asRecord, isRecord };
