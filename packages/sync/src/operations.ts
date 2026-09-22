import { inputHashOf } from '@bunki/ai/hash';
import { isoInstantSchema } from '@bunki/domain/events/shared';
import { z } from 'zod';

import {
  assertJsonBudget,
  compare,
  countSchema,
  digestSchema,
  idSchema,
  immutable,
  parse,
  SyncValidationError,
  textSchema,
  type DeepReadonly,
} from './common.ts';

export const SYNC_SCHEMA_VERSION = 1;
export const SYNC_SCHEMA_EPOCH = 1;
export const SYNC_MERGE_POLICY = 'kairo-conservative-merge/1';

export const scopeSchema = z.strictObject({
  accountId: idSchema,
  learnerId: idSchema,
});
export type SyncScope = DeepReadonly<z.infer<typeof scopeSchema>>;
export const bindingSchema = scopeSchema.extend({ sessionId: idSchema });
export type SyncBinding = DeepReadonly<z.infer<typeof bindingSchema>>;
export const actorIdentitySchema = z.strictObject({
  deviceId: idSchema,
  incarnationId: idSchema,
});
export type ActorIdentity = DeepReadonly<z.infer<typeof actorIdentitySchema>>;

export function parseActorIdentity(raw: unknown): ActorIdentity {
  return immutable(parse(actorIdentitySchema, raw));
}

export function parseSyncBinding(raw: unknown): SyncBinding {
  return immutable(parse(bindingSchema, raw));
}
export const operationRefSchema = z.strictObject({
  opId: digestSchema,
  sha256: digestSchema,
});
export type OperationRef = DeepReadonly<z.infer<typeof operationRefSchema>>;
const refsSchema = z
  .array(operationRefSchema)
  .max(128)
  .superRefine((refs, ctx) => {
    if (new Set(refs.map((ref) => ref.opId)).size !== refs.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Duplicate operation reference',
      });
    }
  });
const captureIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const captureIdSchema = z.string().regex(captureIdPattern);
export const targetSchema = z
  .strictObject({
    kind: z.enum([
      'note',
      'reading-position',
      'exam-attempt',
      'review-attempt',
      'source-reference',
    ]),
    id: idSchema,
  })
  .refine((value) => value.kind !== 'source-reference' || captureIdPattern.test(value.id));
export type EntityTarget = DeepReadonly<z.infer<typeof targetSchema>>;
const sourceVersionSchema = z.strictObject({
  sourceId: idSchema,
  versionId: idSchema,
  sha256: digestSchema,
});
const textPositionSchema = z
  .strictObject({
    kind: z.literal('text'),
    unit: z.literal('utf16'),
    start: countSchema,
    end: countSchema,
    bodyLength: countSchema,
  })
  .refine((value) => value.start <= value.end && value.end <= value.bodyLength);
const audioPositionSchema = z
  .strictObject({
    kind: z.literal('audio'),
    positionMs: countSchema,
    durationMs: countSchema,
  })
  .refine((value) => value.positionMs <= value.durationMs);
export const anchorSchema = z.strictObject({
  source: sourceVersionSchema,
  position: z.union([textPositionSchema, audioPositionSchema]),
});
export type ReadingAnchor = DeepReadonly<z.infer<typeof anchorSchema>>;
/** Structural position validation only; callers still verify exact source bytes. */
export function parseReadingAnchor(raw: unknown): ReadingAnchor {
  return immutable(parse(anchorSchema, raw));
}
const generationSchema = operationRefSchema.nullable();
const encounterUrlSchema = textSchema(4096).refine((value) => {
  // Match local source-capture eligibility without canonicalizing the encountered
  // string. Internal Unicode whitespace, query bytes and fragments remain exact.
  if (
    value !== value.trim() ||
    [...value].some((character) => {
      const code = character.charCodeAt(0);
      return code <= 32 || (code >= 127 && code <= 159) || character === '\\';
    }) ||
    !/^https?:\/\/[^/?#]+/iu.test(value)
  ) {
    return false;
  }
  const Constructor = (
    globalThis as {
      URL?: new (url: string) => {
        protocol: string;
        hostname: string;
        username: string;
        password: string;
      };
    }
  ).URL;
  if (!Constructor) return false;
  try {
    const url = new Constructor(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      !!url.hostname &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
});
const sourceReferenceSchema = z.strictObject({
  kind: z.literal('source.reference'),
  captureId: captureIdSchema,
  encounterUrl: encounterUrlSchema,
  capturedAt: isoInstantSchema,
  generation: generationSchema,
});
export type SourceReferencePayload = DeepReadonly<z.infer<typeof sourceReferenceSchema>>;

/** Exact body-free encounter data; parsing grants no source or writer authority. */
export function parseSourceReferencePayload(raw: unknown): SourceReferencePayload {
  const parsed = parse(sourceReferenceSchema, raw);
  // Validate the owned output too: a local Proxy can expose different property
  // values to the schema than its descriptors expose to the input budget check.
  assertJsonBudget(parsed);
  return immutable(parsed);
}

const noteSegmentSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('original'), text: textSchema(64_000) }),
  z
    .strictObject({
      kind: z.literal('source-quote'),
      text: textSchema(64_000),
      source: sourceVersionSchema,
      position: textPositionSchema,
      deviceSyncBasis: z.strictObject({
        basisId: idSchema,
        policyVersion: idSchema,
      }),
    })
    .refine((value) => value.position.end - value.position.start === value.text.length),
]);
const noteSchema = z.strictObject({
  kind: z.literal('note.version'),
  noteId: idSchema,
  versionId: idSchema,
  generation: generationSchema,
  supersedes: refsSchema,
  segments: z.array(noteSegmentSchema).min(1).max(128),
});
const resumeSchema = z.strictObject({
  kind: z.literal('reading.resume'),
  sessionId: idSchema,
  anchor: anchorSchema,
  generation: generationSchema,
  supersedes: refsSchema,
});
const responseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('text'), text: textSchema(16_000) }),
  z.strictObject({ kind: z.literal('choice'), optionId: idSchema }),
  z.strictObject({ kind: z.literal('no-response') }),
]);
const examSchema = z.strictObject({
  kind: z.literal('exam.attempt'),
  attemptId: idSchema,
  generation: generationSchema,
  form: z.strictObject({
    formId: idSchema,
    versionId: idSchema,
    sha256: digestSchema,
  }),
  outcome: z.enum(['submitted', 'abandoned']),
  startedAt: isoInstantSchema,
  endedAt: isoInstantSchema,
  elapsedMs: countSchema,
  interruptionCount: countSchema,
  answers: z
    .array(
      z.strictObject({
        itemId: idSchema,
        itemVersionId: idSchema,
        response: responseSchema,
      }),
    )
    .max(1000)
    .superRefine((answers, ctx) => {
      if (new Set(answers.map((answer) => answer.itemId)).size !== answers.length) {
        ctx.addIssue({ code: 'custom', message: 'Duplicate item response' });
      }
    }),
});
const reviewSchema = z.strictObject({
  kind: z.literal('review.attempt'),
  attemptId: idSchema,
  generation: generationSchema,
  cardId: idSchema,
  scheduleRevisionId: idSchema,
  observedAt: isoInstantSchema,
  response: responseSchema,
  reportedGrade: z.enum(['again', 'hard', 'good', 'easy']).nullable(),
  hintsUsed: countSchema,
  answerRevealed: z.boolean(),
  admission: z.enum(['accepted', 'rejected', 'not-evaluated']),
  admissionPolicyVersion: idSchema,
  schedulerParametersVersion: idSchema,
  /** References retain provenance; this package does not mint or admit domain evidence. */
  domainEventRefs: z.array(z.strictObject({ eventId: idSchema, sha256: digestSchema })).max(128),
});
const tombstoneSchema = z.strictObject({
  kind: z.literal('entity.tombstone'),
  target: targetSchema,
  reason: z.enum(['user-deleted', 'duplicate', 'mistaken-record', 'revoked']),
});
const restoreSchema = z.strictObject({
  kind: z.literal('entity.restore'),
  target: targetSchema,
  tombstones: refsSchema.refine((value) => value.length > 0),
  reason: textSchema(2000),
});
export const recordOperationSchema = z.discriminatedUnion('kind', [
  sourceReferenceSchema,
  noteSchema,
  resumeSchema,
  examSchema,
  reviewSchema,
  tombstoneSchema,
  restoreSchema,
]);
export type RecordOperation = DeepReadonly<z.infer<typeof recordOperationSchema>>;

const operationFields = {
  format: z.literal('kairo-sync-operation'),
  v: z.literal(SYNC_SCHEMA_VERSION),
  scope: scopeSchema,
  actor: actorIdentitySchema.extend({
    sequence: countSchema.refine((n) => n > 0),
  }),
  predecessor: operationRefSchema.nullable(),
  dependencies: refsSchema,
  schemaEpoch: z.literal(SYNC_SCHEMA_EPOCH),
  deletionEpoch: countSchema,
  mergePolicy: z.literal(SYNC_MERGE_POLICY),
  occurredAt: isoInstantSchema,
  payload: recordOperationSchema,
};
const creationSchema = z.strictObject(operationFields);
const envelopeSchema = z.strictObject({
  ...operationFields,
  opId: digestSchema,
  payloadSha256: digestSchema,
});
export type SyncOperationInput = DeepReadonly<z.infer<typeof creationSchema>>;
export type SyncOperation = DeepReadonly<z.infer<typeof envelopeSchema>>;

export function targetOf(payload: RecordOperation): EntityTarget {
  switch (payload.kind) {
    case 'source.reference':
      return { kind: 'source-reference', id: payload.captureId };
    case 'note.version':
      return { kind: 'note', id: payload.noteId };
    case 'reading.resume':
      return { kind: 'reading-position', id: payload.anchor.source.sourceId };
    case 'exam.attempt':
      return { kind: 'exam-attempt', id: payload.attemptId };
    case 'review.attempt':
      return { kind: 'review-attempt', id: payload.attemptId };
    case 'entity.restore':
    case 'entity.tombstone':
      return payload.target;
  }
}

/** All semantic references also participate in causal readiness. */
export function referencesOf(operation: SyncOperation): readonly OperationRef[] {
  const refs = [...operation.dependencies];
  if (operation.predecessor) refs.push(operation.predecessor);
  const payload = operation.payload;
  if ('generation' in payload && payload.generation) refs.push(payload.generation);
  if ('supersedes' in payload) refs.push(...payload.supersedes);
  if (payload.kind === 'entity.restore') refs.push(...payload.tombstones);
  const unique = new Map<string, OperationRef>();
  for (const ref of refs) {
    const prior = unique.get(ref.opId);
    if (prior && prior.sha256 !== ref.sha256) {
      throw new SyncValidationError('causal-reference-conflict');
    }
    unique.set(ref.opId, ref);
  }
  return immutable([...unique.values()].sort((a, b) => compare(a.opId, b.opId)));
}

function validateEnvelope(operation: SyncOperation): void {
  if (operation.opId !== inputHashOf({ scope: operation.scope, actor: operation.actor })) {
    throw new SyncValidationError('identity-conflict', ['opId']);
  }
  if (operation.payloadSha256 !== inputHashOf(operation.payload)) {
    throw new SyncValidationError('payload-digest-mismatch', ['payloadSha256']);
  }
  if ((operation.actor.sequence === 1) !== (operation.predecessor === null)) {
    throw new SyncValidationError('causal-reference-conflict', ['predecessor']);
  }
  if (referencesOf(operation).some((ref) => ref.opId === operation.opId)) {
    throw new SyncValidationError('causal-cycle');
  }
}

// Only this module can remember a fully validated, deeply frozen operation.
// The cache proves immutable bytes, never an account/session or replica grant.
const validatedOperations = new WeakSet<object>();
const operationReferences = new WeakMap<object, OperationRef>();

function sealOperation(operation: SyncOperation): SyncOperation {
  // A raw Proxy may expose different descriptor and property values. Cache
  // admission validates this owned parsed output, not only the caller tree.
  assertJsonBudget(operation);
  const frozen = immutable(operation);
  validatedOperations.add(frozen);
  return frozen;
}

export function createSyncOperation(input: SyncOperationInput): SyncOperation {
  const parsed = parse(creationSchema, input);
  const operation = {
    ...parsed,
    opId: inputHashOf({ scope: parsed.scope, actor: parsed.actor }),
    payloadSha256: inputHashOf(parsed.payload),
  };
  validateEnvelope(operation);
  // The creation input budget precedes the two derived digest fields. The
  // completed envelope must still pass parseSyncOperation before it is cached.
  return immutable(operation);
}

export function parseSyncOperation(raw: unknown): SyncOperation {
  if (typeof raw === 'object' && raw !== null && validatedOperations.has(raw)) {
    return raw as SyncOperation;
  }
  assertJsonBudget(raw);
  if (typeof raw === 'object' && raw !== null && 'v' in raw && raw.v !== SYNC_SCHEMA_VERSION) {
    throw new SyncValidationError('unsupported-version', ['v']);
  }
  const parsed = parse(envelopeSchema, raw);
  validateEnvelope(parsed);
  return sealOperation(parsed);
}

export function operationReference(raw: SyncOperation): OperationRef {
  const operation = parseSyncOperation(raw);
  const existing = operationReferences.get(operation);
  if (existing) return existing;
  const reference = immutable({
    opId: operation.opId,
    sha256: inputHashOf(operation),
  });
  operationReferences.set(operation, reference);
  return reference;
}
