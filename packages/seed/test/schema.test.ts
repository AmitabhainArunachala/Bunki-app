/**
 * zod schema check for the seed dataset (WP-04 closure predicate).
 *
 * This is deliberately a *second, independent* statement of the same rules the
 * hand-written loader in `src/validate.ts` enforces. `@bunki/seed` ships with no
 * runtime dependencies, so the loader cannot use zod; if the same code both
 * produced and validated the dataset, the check would only prove the loader is
 * self-consistent. Here zod re-derives the shape straight from the JSON on disk,
 * so a loader bug and a schema bug have to coincide to pass.
 *
 * zod is a devDependency pinned at 4.4.3, the exact version verified in the
 * WP-00 dependency register (MIT, no constraint on the pending OD-09 licence).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { seedDataset } from '../src/index.ts';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as unknown;

const nonEmpty = z.string().trim().min(1);

/** REQ-SRC-01, stated as a schema. All seven required; four nullable extras. */
const provenanceRecordSchema = z.strictObject({
  source: nonEmpty,
  source_version: nonEmpty,
  license: nonEmpty,
  attribution: nonEmpty,
  modification_status: z.enum(['unmodified', 'derived', 'original']),
  confidence: z.enum(['high', 'medium', 'low']),
  review_status: z.enum(['primary-source-verified', 'reviewed-in-project', 'unreviewed']),
  source_url: z.string().url().nullable(),
  retrieved_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  source_entry_id: z.string().nullable(),
  notes: z.string().nullable(),
});

/** A field's pointer into the registry: bare id, or `{ ref, ...overrides }`. */
const provenanceRefSchema = z.union([
  nonEmpty,
  z.strictObject({
    ref: nonEmpty,
    confidence: z.enum(['high', 'medium', 'low']).optional(),
    review_status: z
      .enum(['primary-source-verified', 'reviewed-in-project', 'unreviewed'])
      .optional(),
    source_entry_id: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
]);

const fieldProvenanceSchema = z.record(z.string(), provenanceRefSchema);

const registrySchema = z.object({
  schemaVersion: z.literal(1),
  sources: z.record(z.string(), provenanceRecordSchema).refine((s) => Object.keys(s).length > 0, {
    message: 'provenance registry must not be empty',
  }),
});

const withProvenance = <T extends z.ZodRawShape>(fields: T) =>
  z.strictObject({ id: nonEmpty, ...fields, fieldProvenance: fieldProvenanceSchema });

const lexemeSchema = withProvenance({
  headword: nonEmpty,
  reading: nonEmpty,
  partOfSpeech: z.array(nonEmpty).min(1),
  senses: z.array(nonEmpty).min(1),
  kanjiUsed: z.array(nonEmpty).min(1),
});

const kanjiSchema = withProvenance({
  character: z.string().length(1),
  codepoint: z.string().regex(/^U\+[0-9A-F]{4,5}$/),
  strokeCount: z.number().int().positive(),
  components: z.array(nonEmpty),
  radicals: z.array(z.strictObject({ element: nonEmpty, kind: nonEmpty })),
  strokeSvg: z.string().regex(/^strokes\/[0-9a-f]{5}\.svg$/),
  onReadings: z.array(nonEmpty),
  kunReadings: z.array(nonEmpty),
  meanings: z.array(nonEmpty).min(1),
});

const grammarSchema = withProvenance({
  pattern: nonEmpty,
  name: nonEmpty,
  explanation: nonEmpty,
  example: nonEmpty,
  exampleTranslation: nonEmpty,
});

const sentenceSchema = withProvenance({
  japanese: nonEmpty,
  english: nonEmpty,
  lexemeIds: z.array(nonEmpty),
  constructionIds: z.array(nonEmpty),
});

const passageSchema = withProvenance({
  title: nonEmpty,
  titleTranslation: nonEmpty,
  targetForm: nonEmpty,
  body: nonEmpty,
  english: nonEmpty,
  lexemeIds: z.array(nonEmpty),
  constructionIds: z.array(nonEmpty),
});

const sourceSchema = withProvenance({
  title: nonEmpty,
  language: z.literal('ja'),
  sourceKind: z.literal('article'),
  pool: z.enum(['original', 'licensed']),
  body: nonEmpty,
  contentSha256: z.string().regex(/^[0-9a-f]{64}$/),
  locationUnit: z.literal('utf16-code-unit'),
  anchors: z
    .array(
      z
        .strictObject({
          id: nonEmpty,
          start: z.number().int().nonnegative(),
          end: z.number().int().positive(),
          lexemeId: nonEmpty,
        })
        .refine((anchor) => anchor.end > anchor.start, {
          message: 'anchor end must be greater than start',
        }),
    )
    .min(1),
});

const strokesSchema = z.object({
  schemaVersion: z.literal(1),
  upstream: z.strictObject({
    project: nonEmpty,
    repository: z.string().url(),
    commit: z.string().regex(/^[0-9a-f]{40}$/),
    commitResolvedBy: nonEmpty,
    retrievedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    license: nonEmpty,
    licenseTextFile: nonEmpty,
    licenseTextSha256: z.string().regex(/^[0-9a-f]{64}$/),
    licenseTextUrl: z.string().url(),
  }),
  files: z
    .array(
      z.strictObject({
        character: z.string().length(1),
        file: z.string().regex(/^strokes\/[0-9a-f]{5}\.svg$/),
        upstreamPath: z.string().regex(/^kanji\/[0-9a-f]{5}\.svg$/),
        url: z.string().url(),
        bytes: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .min(1),
});

const fileSchema = <T extends z.ZodTypeAny>(record: T) =>
  z.object({ schemaVersion: z.literal(1), records: z.array(record).min(1) });

describe('seed data files satisfy the zod schema', () => {
  it('provenance.json', () => {
    expect(() => registrySchema.parse(readJson('provenance.json'))).not.toThrow();
  });

  it.each([
    ['lexemes.json', lexemeSchema],
    ['kanji.json', kanjiSchema],
    ['grammar.json', grammarSchema],
    ['sentences.json', sentenceSchema],
    ['passages.json', passageSchema],
    ['sources.json', sourceSchema],
  ] as const)('%s', (file, record) => {
    const result = fileSchema(record).safeParse(readJson(file));
    expect(result.success ? null : z.prettifyError(result.error)).toBeNull();
  });

  it('strokes.json', () => {
    const result = strokesSchema.safeParse(readJson('strokes.json'));
    expect(result.success ? null : z.prettifyError(result.error)).toBeNull();
  });
});

describe('the resolved provenance a consumer receives also satisfies the schema', () => {
  it('parses every materialised ProvenanceRecord', () => {
    for (const [id, source] of Object.entries(seedDataset.provenanceSources)) {
      const result = provenanceRecordSchema.safeParse(source);
      expect(result.success ? null : `${id}: ${z.prettifyError(result.error)}`).toBeNull();
    }
  });
});

describe('the schema rejects what it is supposed to reject', () => {
  const valid = {
    source: 'KanjiVG',
    source_version: 'git 61e39cf',
    license: 'CC BY-SA 3.0',
    attribution: 'Ulrich Apel',
    modification_status: 'unmodified',
    confidence: 'high',
    review_status: 'primary-source-verified',
    source_url: 'https://example.invalid/x',
    retrieved_at: '2026-07-27',
    source_entry_id: null,
    notes: null,
  };

  it('accepts the reference record', () => {
    expect(provenanceRecordSchema.safeParse(valid).success).toBe(true);
  });

  it.each(['source', 'source_version', 'license', 'attribution'])('rejects empty %s', (field) => {
    expect(provenanceRecordSchema.safeParse({ ...valid, [field]: '  ' }).success).toBe(false);
  });

  it.each([
    'source',
    'source_version',
    'license',
    'attribution',
    'modification_status',
    'confidence',
    'review_status',
  ])('rejects a record missing %s', (field) => {
    const broken: Record<string, unknown> = { ...valid };
    delete broken[field];
    expect(provenanceRecordSchema.safeParse(broken).success).toBe(false);
  });

  it('rejects an unknown review_status', () => {
    expect(
      provenanceRecordSchema.safeParse({ ...valid, review_status: 'looks-fine' }).success,
    ).toBe(false);
  });

  it('rejects extra keys, so a stray field cannot ride along unchecked', () => {
    expect(provenanceRecordSchema.safeParse({ ...valid, sneaky: 'yes' }).success).toBe(false);
  });
});
