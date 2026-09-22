import { sha256Hex } from '@bunki/ai/hash';
import { z } from 'zod';
import { examSchema, getOfficialBlueprint } from './blueprints.ts';
import {
  artifactReferenceSchema,
  AssessmentValidationError,
  assertRevision,
  assertUnique,
  digestSchema,
  elapsedSchema,
  idSchema,
  immutable,
  parse,
  revisionOf,
  textSchema,
  type ArtifactReference,
  type DeepReadonly,
} from './common.ts';

export const ASSESSMENT_CONTENT_VERSION = 1;
export const RIGHTS_OPERATIONS = [
  'display',
  'retain',
  'sync',
  'adapt',
  'synthesize-audio',
] as const;
const rightSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('allowed'), basisRef: idSchema, policyVersion: idSchema }),
  z.strictObject({ status: z.literal('denied'), reason: textSchema(500) }),
  z.strictObject({ status: z.literal('unknown'), reason: textSchema(500) }),
]);
export const rightsSchema = z.strictObject({
  display: rightSchema,
  retain: rightSchema,
  sync: rightSchema,
  adapt: rightSchema,
  'synthesize-audio': rightSchema,
});
export type AssessmentRights = DeepReadonly<z.infer<typeof rightsSchema>>;
export function unknownAssessmentRights(): AssessmentRights {
  return immutable(
    Object.fromEntries(
      RIGHTS_OPERATIONS.map((operation) => [
        operation,
        { status: 'unknown', reason: 'not-established' },
      ]),
    ),
  ) as AssessmentRights;
}

export const provenanceSchema = z
  .strictObject({
    kind: z.enum(['original-human', 'original-ai', 'licensed-adaptation', 'legacy-unverified']),
    authorRef: idSchema.nullable(),
    processRef: idSchema.nullable(),
    sources: z
      .array(
        z.strictObject({
          id: idSchema,
          label: textSchema(500),
          uri: textSchema(4096).nullable(),
          /** A preserved license string is a claim, never a capability grant. */
          licenseClaim: textSchema(500).nullable(),
        }),
      )
      .max(64),
  })
  .refine((value) => value.kind !== 'original-human' || value.authorRef !== null)
  .refine((value) => value.kind !== 'original-ai' || value.processRef !== null)
  .refine((value) => value.kind !== 'licensed-adaptation' || value.sources.length > 0);
const commonFields = {
  v: z.literal(ASSESSMENT_CONTENT_VERSION),
  id: idSchema,
  provenance: provenanceSchema,
  rights: rightsSchema,
};
const versionFields = { revisionId: idSchema, sha256: digestSchema };
export const skillSchema = z.enum(['vocabulary', 'grammar', 'reading', 'listening', 'writing']);
const optionSchema = z.strictObject({ id: idSchema, text: textSchema(4000) });
const answerSpecSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('selected'),
    options: z.array(optionSchema).min(2).max(12),
    answerOptionId: idSchema,
  }),
  z.strictObject({
    kind: z.literal('ordered'),
    tokens: z.array(optionSchema).min(2).max(32),
    answerOrder: z.array(idSchema).min(2).max(32),
  }),
  z.strictObject({
    kind: z.literal('written'),
    maxChars: z.number().int().min(1).max(16_000),
    marking: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('manual'), rubric: textSchema(16_000) }),
      z.strictObject({
        kind: z.literal('exact'),
        accepted: z.array(textSchema(16_000)).min(1).max(64),
        normalization: z.literal('none'),
      }),
    ]),
  }),
]);
const referenceTo = (kind: ArtifactReference['kind']) =>
  artifactReferenceSchema.extend({ kind: z.literal(kind) });
const itemPayloadSchema = z.strictObject({
  ...commonFields,
  format: z.literal('kairo-assessment-item'),
  skill: skillSchema,
  task: idSchema,
  prompt: textSchema(32_000),
  translatedInstruction: textSchema(4000).nullable(),
  rationale: textSchema(16_000),
  passages: z.array(referenceTo('passage')).max(8),
  media: z.array(referenceTo('media')).max(8),
  response: answerSpecSchema,
  subjects: z.array(idSchema).max(16),
});
const itemVersionSchema = itemPayloadSchema.extend(versionFields);
export type ItemVersion = DeepReadonly<z.infer<typeof itemVersionSchema>>;
export type ItemPayload = DeepReadonly<z.infer<typeof itemPayloadSchema>>;

export function createItemVersion(raw: unknown): ItemVersion {
  const item = parse(itemPayloadSchema, raw);
  assertUnique(
    item.passages.map((reference) => reference.id),
    'passages',
  );
  assertUnique(
    item.media.map((reference) => reference.id),
    'media',
  );
  assertUnique(item.subjects, 'subjects');
  const response = item.response;
  if (response.kind === 'selected') {
    assertUnique(
      response.options.map((option) => option.id),
      'response.options',
    );
    if (!response.options.some((option) => option.id === response.answerOptionId)) {
      throw new AssessmentValidationError('invalid-input', ['response.answerOptionId']);
    }
  } else if (response.kind === 'ordered') {
    assertUnique(
      response.tokens.map((token) => token.id),
      'response.tokens',
    );
    assertUnique(response.answerOrder, 'response.answerOrder');
    if (
      response.tokens.length !== response.answerOrder.length ||
      response.answerOrder.some((id) => !response.tokens.some((token) => token.id === id))
    ) {
      throw new AssessmentValidationError('invalid-input', ['response.answerOrder']);
    }
  } else if (response.marking.kind === 'exact') {
    assertUnique(response.marking.accepted, 'response.marking.accepted');
    if (response.marking.accepted.some((answer) => answer.length > response.maxChars)) {
      throw new AssessmentValidationError('invalid-input', ['response.maxChars']);
    }
  }
  // These structural checks cannot establish that distractors or the key are linguistically sound.
  return immutable(revisionOf('item', item));
}

export function parseItemVersion(raw: unknown): ItemVersion {
  const { revisionId, sha256, ...payload } = parse(itemVersionSchema, raw);
  const item = createItemVersion(payload);
  assertRevision('item', { revisionId, sha256 }, payload);
  return item;
}

const passagePayloadSchema = z.strictObject({
  ...commonFields,
  format: z.literal('kairo-assessment-passage'),
  title: textSchema(1000).nullable(),
  text: textSchema(120_000),
  textSha256: digestSchema,
  language: z.literal('ja'),
  locationUnit: z.literal('utf16-code-unit'),
});
const passageVersionSchema = passagePayloadSchema.extend(versionFields);
export type PassageVersion = DeepReadonly<z.infer<typeof passageVersionSchema>>;
export function createPassageVersion(raw: unknown): PassageVersion {
  const passage = parse(passagePayloadSchema, raw);
  if (passage.textSha256 !== sha256Hex(passage.text)) {
    throw new AssessmentValidationError('invalid-input', ['textSha256']);
  }
  return immutable(revisionOf('passage', passage));
}
export function parsePassageVersion(raw: unknown): PassageVersion {
  const { revisionId, sha256, ...payload } = parse(passageVersionSchema, raw);
  const passage = createPassageVersion(payload);
  assertRevision('passage', { revisionId, sha256 }, payload);
  return passage;
}

const audioPayloadSchema = z.strictObject({
  ...commonFields,
  format: z.literal('kairo-assessment-media'),
  kind: z.literal('audio'),
  /** An opaque storage locator, not an arbitrary fetch URL. Host verifies the actual bytes. */
  assetId: idSchema,
  bytesSha256: digestSchema,
  mimeType: z.enum(['audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm']),
  durationMs: elapsedSchema.refine((value) => value > 0),
  transcript: textSchema(120_000).nullable(),
  transcriptSha256: digestSchema.nullable(),
  speakers: z.array(idSchema).min(1).max(32),
});
/** Raster metadata only; this cannot authenticate bytes, decoding, dimensions or rights. */
const imagePayloadSchema = z.strictObject({
  ...commonFields,
  format: z.literal('kairo-assessment-media'),
  kind: z.literal('image'),
  /** Plain ASCII opaque key, never URL, path, namespace or encoded data syntax. */
  assetId: idSchema.regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/u),
  bytesSha256: digestSchema,
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  width: z.number().int().min(1).max(8192),
  height: z.number().int().min(1).max(8192),
  alt: textSchema(2000),
});
const mediaPayloadSchema = z.discriminatedUnion('kind', [audioPayloadSchema, imagePayloadSchema]);
const audioVersionSchema = audioPayloadSchema.extend(versionFields);
const imageVersionSchema = imagePayloadSchema.extend(versionFields);
const mediaVersionSchema = z.discriminatedUnion('kind', [audioVersionSchema, imageVersionSchema]);
export type AudioMediaVersion = DeepReadonly<z.infer<typeof audioVersionSchema>>;
export type ImageMediaVersion = DeepReadonly<z.infer<typeof imageVersionSchema>>;
export type MediaVersion = AudioMediaVersion | ImageMediaVersion;
export function createMediaVersion(raw: unknown): MediaVersion {
  const media = parse(mediaPayloadSchema, raw);
  if (media.kind === 'audio') {
    if (
      (media.transcript === null) !== (media.transcriptSha256 === null) ||
      (media.transcript !== null && sha256Hex(media.transcript) !== media.transcriptSha256)
    ) {
      throw new AssessmentValidationError('invalid-input', ['transcriptSha256']);
    }
    assertUnique(media.speakers, 'speakers');
  }
  return immutable(revisionOf('media', media));
}
export function parseMediaVersion(raw: unknown): MediaVersion {
  const { revisionId, sha256, ...payload } = parse(mediaVersionSchema, raw);
  const media = createMediaVersion(payload);
  assertRevision('media', { revisionId, sha256 }, payload);
  return media;
}

export function artifactReference(
  value: ItemVersion | PassageVersion | MediaVersion | FormVersion,
): ArtifactReference {
  return immutable({
    kind: value.format.slice('kairo-assessment-'.length) as ArtifactReference['kind'],
    id: value.id,
    revisionId: value.revisionId,
    sha256: value.sha256,
  });
}
export function assertExactReference(
  reference: ArtifactReference,
  value: ItemVersion | PassageVersion | MediaVersion | FormVersion,
): void {
  const actual = artifactReference(value);
  if (
    reference.id !== actual.id ||
    reference.kind !== actual.kind ||
    reference.revisionId !== actual.revisionId ||
    reference.sha256 !== actual.sha256
  ) {
    throw new AssessmentValidationError('reference-mismatch');
  }
}

const timingAuthoritySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('official-fact'), blueprintId: idSchema, blockId: idSchema }),
  z.strictObject({ kind: z.literal('authoring-rule'), ruleId: idSchema }),
]);
const formPayloadSchema = z.strictObject({
  ...commonFields,
  format: z.literal('kairo-assessment-form'),
  title: textSchema(1000),
  exam: examSchema,
  scope: z.enum(['short-practice', 'section-practice', 'full-candidate']),
  blueprintId: idSchema.nullable(),
  items: z.array(itemVersionSchema).min(1).max(1000),
  passages: z.array(passageVersionSchema).max(256),
  media: z.array(mediaVersionSchema).max(256),
  sections: z
    .array(
      z.strictObject({
        id: idSchema,
        title: textSchema(500),
        skill: skillSchema,
        itemIds: z.array(idSchema).min(1).max(1000),
      }),
    )
    .min(1)
    .max(32),
  timingBlocks: z
    .array(
      z.strictObject({
        id: idSchema,
        sectionIds: z.array(idSchema).min(1).max(32),
        durationMs: elapsedSchema.refine((value) => value > 0),
        clock: z.enum(['elapsed-including-interruptions', 'active-only']),
        authority: timingAuthoritySchema,
      }),
    )
    .min(1)
    .max(32),
  /** Counts are explicitly authored requirements, never represented as universal official counts. */
  authoring: z.strictObject({
    policyVersion: idSchema,
    countsAre: z.literal('authoring-rules'),
    requirements: z
      .array(
        z.strictObject({
          task: idSchema,
          minimumItems: z.number().int().min(1).max(1000),
        }),
      )
      .max(64),
  }),
});
const formVersionSchema = formPayloadSchema.extend(versionFields);
export type FormVersion = DeepReadonly<z.infer<typeof formVersionSchema>>;
export type FormPayload = DeepReadonly<z.infer<typeof formPayloadSchema>>;

export function createFormVersion(raw: unknown): FormVersion {
  const form = parse(formPayloadSchema, raw);
  form.items = form.items.map((item) => parseItemVersion(item)) as z.infer<
    typeof itemVersionSchema
  >[];
  form.passages = form.passages.map((passage) => parsePassageVersion(passage)) as z.infer<
    typeof passageVersionSchema
  >[];
  form.media = form.media.map((media) => parseMediaVersion(media)) as z.infer<
    typeof mediaVersionSchema
  >[];
  for (const [path, values] of [
    ['items', form.items],
    ['passages', form.passages],
    ['media', form.media],
    ['sections', form.sections],
    ['timingBlocks', form.timingBlocks],
  ] as const)
    assertUnique(
      values.map((value) => value.id),
      path,
    );
  assertUnique(
    form.authoring.requirements.map((rule) => rule.task),
    'authoring.requirements',
  );
  const itemIds = form.sections.flatMap((section) => section.itemIds);
  assertUnique(itemIds, 'sections.itemIds');
  if (
    itemIds.length !== form.items.length ||
    form.items.some((item) => !itemIds.includes(item.id))
  ) {
    throw new AssessmentValidationError('invalid-input', ['sections.itemIds']);
  }
  for (const section of form.sections) {
    if (
      section.itemIds.some(
        (id) => form.items.find((item) => item.id === id)?.skill !== section.skill,
      )
    ) {
      throw new AssessmentValidationError('invalid-input', ['sections.skill']);
    }
  }
  const sectionIds = form.timingBlocks.flatMap((block) => block.sectionIds);
  assertUnique(sectionIds, 'timingBlocks.sectionIds');
  if (
    sectionIds.length !== form.sections.length ||
    form.sections.some((section) => !sectionIds.includes(section.id))
  ) {
    throw new AssessmentValidationError('invalid-input', ['timingBlocks.sectionIds']);
  }
  const referencedPassages = new Set<string>();
  const referencedMedia = new Set<string>();
  for (const item of form.items) {
    for (const reference of item.passages) {
      const passage = form.passages.find((entry) => entry.id === reference.id);
      if (!passage) throw new AssessmentValidationError('reference-mismatch', ['item.passages']);
      assertExactReference(reference, passage);
      referencedPassages.add(reference.id);
    }
    for (const reference of item.media) {
      const media = form.media.find((entry) => entry.id === reference.id);
      if (!media) throw new AssessmentValidationError('reference-mismatch', ['item.media']);
      assertExactReference(reference, media);
      referencedMedia.add(reference.id);
    }
    if (
      item.skill === 'listening' &&
      !item.media.some((reference) =>
        form.media.some((media) => media.id === reference.id && media.kind === 'audio'),
      )
    ) {
      throw new AssessmentValidationError('invalid-input', ['item.media']);
    }
  }
  if (
    referencedPassages.size !== form.passages.length ||
    referencedMedia.size !== form.media.length
  ) {
    throw new AssessmentValidationError('invalid-input', ['unreferenced-assets']);
  }
  if (form.blueprintId !== null) {
    const blueprint = getOfficialBlueprint(form.blueprintId);
    if (
      !blueprint ||
      blueprint.exam.family !== form.exam.family ||
      blueprint.exam.track !== form.exam.track
    ) {
      throw new AssessmentValidationError('invalid-input', ['blueprintId']);
    }
  }
  for (const block of form.timingBlocks) {
    if (block.authority.kind !== 'official-fact') continue;
    const authority = block.authority;
    const blueprint = getOfficialBlueprint(authority.blueprintId);
    const fact = blueprint?.timingBlocks.find((entry) => entry.id === authority.blockId);
    if (
      !fact ||
      authority.blueprintId !== form.blueprintId ||
      block.sectionIds.some(
        (id) => !fact.skills.includes(form.sections.find((section) => section.id === id)!.skill),
      ) ||
      (fact.duration === 'fixed' && block.durationMs !== fact.minutes * 60_000)
    ) {
      throw new AssessmentValidationError('invalid-input', ['timingBlocks.authority']);
    }
  }
  return immutable(revisionOf('form', form));
}

export function parseFormVersion(raw: unknown): FormVersion {
  const { revisionId, sha256, ...payload } = parse(formVersionSchema, raw);
  const form = createFormVersion(payload);
  assertRevision('form', { revisionId, sha256 }, payload);
  return form;
}

export interface StructureReview {
  readonly passesKnownChecks: boolean;
  readonly problems: readonly string[];
  readonly linguisticCorrectness: 'not-established';
  readonly completeOfficialCoverage: 'requires-editorial-review';
}

/** Bounded known checks. Passing is necessary but never sufficient for a reviewed full form. */
export function inspectFormStructure(raw: unknown): StructureReview {
  const form = parseFormVersion(raw);
  const problems: string[] = [];
  for (const item of form.items) {
    if (
      item.response.kind === 'selected' &&
      new Set(item.response.options.map((option) => option.text)).size !==
        item.response.options.length
    ) {
      problems.push(`duplicate-choice-text:${item.id}`);
    }
  }
  for (const rule of form.authoring.requirements) {
    if (form.items.filter((item) => item.task === rule.task).length < rule.minimumItems)
      problems.push(`authoring-count:${rule.task}`);
  }
  if (form.scope === 'full-candidate') {
    const blueprint =
      form.blueprintId === null ? undefined : getOfficialBlueprint(form.blueprintId);
    if (!blueprint) problems.push('missing-blueprint');
    else {
      const bound = form.timingBlocks.map((block) =>
        block.authority.kind === 'official-fact' ? block.authority.blockId : null,
      );
      if (
        bound.length !== blueprint.timingBlocks.length ||
        blueprint.timingBlocks.some((fact, index) => bound[index] !== fact.id)
      )
        problems.push('timing-block-coverage');
      for (const task of blueprint.knownRequiredTasks) {
        if (!form.items.some((item) => item.task === task)) problems.push(`missing-task:${task}`);
      }
      for (const task of blueprint.forbiddenTasks) {
        if (form.items.some((item) => item.task === task)) problems.push(`excluded-task:${task}`);
      }
      if (
        blueprint.writtenResponseRequired &&
        !form.items.some((item) => item.response.kind === 'written')
      )
        problems.push('missing-written-response');
      if (!form.items.some((item) => item.skill === 'listening'))
        problems.push('missing-listening');
      if (form.exam.family === 'jlpt') {
        for (const skill of ['vocabulary', 'grammar', 'reading']) {
          if (!form.items.some((item) => item.skill === skill))
            problems.push(`missing-skill:${skill}`);
        }
      }
      if (
        form.exam.family === 'jlpt' &&
        form.items.some((item) => item.response.kind === 'written')
      )
        problems.push('jlpt-written-response');
    }
    if (form.authoring.requirements.length === 0) problems.push('missing-authoring-coverage-plan');
    if (form.timingBlocks.some((block) => block.clock !== 'elapsed-including-interruptions'))
      problems.push('full-form-clock-policy');
  }
  return immutable({
    passesKnownChecks: problems.length === 0,
    problems,
    linguisticCorrectness: 'not-established',
    completeOfficialCoverage: 'requires-editorial-review',
  });
}
