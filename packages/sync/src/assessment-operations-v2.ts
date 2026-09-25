import { inputHashOf } from '@bunki/ai/hash';
import { isoInstantSchema } from '@bunki/domain/events/shared';
import { z } from 'zod';
import {
  countSchema,
  digestSchema,
  idSchema,
  immutable,
  parse,
  SyncValidationError,
  type DeepReadonly,
} from './common.ts';

const refSchema = z.strictObject({ opId: digestSchema, sha256: digestSchema });
const artifactSchema = z.strictObject({
  kind: z.enum(['form', 'item', 'media']),
  id: idSchema,
  revisionId: idSchema,
  sha256: digestSchema,
});
const itemRefSchema = artifactSchema.extend({ kind: z.literal('item') });
const formRefSchema = artifactSchema.extend({ kind: z.literal('form') });
const mediaRefSchema = artifactSchema.extend({ kind: z.literal('media') });
const elapsed = countSchema.refine((value) => value <= 7 * 24 * 60 * 60 * 1000);
const responseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unanswered') }),
  z.strictObject({ kind: z.literal('selected'), optionId: idSchema }),
  z.strictObject({ kind: z.literal('ordered'), tokenIds: z.array(idSchema).min(2).max(32) }),
  z.strictObject({ kind: z.literal('written'), text: z.string().max(16_000) }),
]);
const editorialSchema = z.strictObject({
  status: z.enum(['unreviewed', 'ai-reviewed-practice', 'ai-reviewed-full']),
  policyVersion: idSchema.nullable(),
  decisionRevisionIds: z.array(idSchema).max(2048),
});
const conditionsSchema = z
  .array(
    z.enum([
      'interrupted',
      'clock-discontinuity',
      'clock-unverified',
      'audio-interrupted',
      'audio-error',
      'audio-replayed',
      'audio-seeked',
      'assisted',
    ]),
  )
  .max(8);
const targetSchema = z
  .strictObject({
    t: z.enum(['word', 'kanji', 'grammar', 'particle', 'sentence', 'question']),
    id: idSchema,
  })
  .refine(
    (target) => target.t !== 'question' || /^assessment-question:[a-f0-9]{64}$/u.test(target.id),
    { path: ['id'], message: 'Question targets require an exact assessment plan identity.' },
  );
const itemResultSchema = z.strictObject({
  item: itemRefSchema,
  result: z.enum(['correct', 'incorrect', 'unanswered', 'not-reached', 'unscored']),
  response: responseSchema,
  skill: z.enum(['vocabulary', 'grammar', 'reading', 'listening', 'writing']),
  task: idSchema,
  subjects: z.array(idSchema).max(16),
  elapsedMs: elapsed,
  flagged: z.boolean(),
});
const audioSchema = z.strictObject({
  media: mediaRefSchema,
  status: z.enum(['unplayed', 'playing', 'paused', 'ended', 'error']),
  starts: countSchema,
  positionMs: elapsed,
  playedMs: elapsed,
});
export const assessmentResultPayloadV2Schema = z.strictObject({
  kind: z.literal('assessment.result/2'),
  attemptId: idSchema,
  attemptRevisionId: idSchema,
  generation: refSchema.nullable(),
  form: formRefSchema,
  outcome: z.enum(['submitted', 'abandoned']),
  startedAt: isoInstantSchema,
  endedAt: isoInstantSchema,
  elapsedMs: elapsed,
  mode: z.enum(['practice', 'timed']),
  priorExposure: z.enum(['none-reported', 'reported', 'unknown']),
  conditions: conditionsSchema,
  editorialAtStart: editorialSchema,
  items: z.array(itemResultSchema).min(1).max(1000),
  audio: z.array(audioSchema).max(256),
  /** Transport preserves observed outcomes, never an official score or a scheduling command. */
  officialScore: z.null(),
  passPrediction: z.null(),
});
const actionSchema = z.strictObject({
  id: idSchema,
  evidenceId: idSchema,
  kind: z.literal('enroll'),
  target: targetSchema,
  status: z.enum(['added', 'existing', 'suppressed', 'pending']),
});
export const learningFollowupPayloadV2Schema = z.strictObject({
  kind: z.literal('learning.followup/2'),
  followupId: idSchema,
  generation: refSchema.nullable(),
  /** Explicit enrichment of existing heads; omission preserves original finish bytes. */
  supersedes: z.array(refSchema).max(128).optional(),
  attemptId: idSchema,
  attemptRevisionId: idSchema,
  form: formRefSchema,
  policyVersion: idSchema,
  status: z.enum(['complete', 'pending-mapping', 'pending-review', 'stopped']),
  evidence: z.array(z.strictObject({ id: idSchema, item: itemRefSchema })).max(1000),
  actions: z.array(actionSchema).max(1000),
});
export const learningSuppressPayloadV2Schema = z.strictObject({
  kind: z.literal('learning.suppress/2'),
  suppressionId: idSchema,
  generation: refSchema.nullable(),
  target: targetSchema,
  at: isoInstantSchema,
  reason: z.enum(['removed', 'undo-auto-add']),
  policyVersion: idSchema,
});
export const assessmentOperationV2Schema = z.discriminatedUnion('kind', [
  assessmentResultPayloadV2Schema,
  learningFollowupPayloadV2Schema,
  learningSuppressPayloadV2Schema,
]);
export type AssessmentOperationV2 = DeepReadonly<z.infer<typeof assessmentOperationV2Schema>>;
export type AssessmentResultPayloadV2 = Extract<
  AssessmentOperationV2,
  { kind: 'assessment.result/2' }
>;
export type LearningFollowupPayloadV2 = Extract<
  AssessmentOperationV2,
  { kind: 'learning.followup/2' }
>;
export type LearningSuppressPayloadV2 = Extract<
  AssessmentOperationV2,
  { kind: 'learning.suppress/2' }
>;
function fail(path: string): never {
  throw new SyncValidationError('invalid-input', [path]);
}
const unique = (values: readonly string[], path: string) => {
  if (new Set(values).size !== values.length) fail(path);
};

/** Bounded body-free payloads. Imported editorial claims remain observations, not authority. */
export function parseAssessmentOperationV2(raw: unknown): AssessmentOperationV2 {
  const payload = parse(assessmentOperationV2Schema, raw);
  if (payload.kind === 'assessment.result/2') {
    unique(
      payload.items.map((item) => item.item.id),
      'items',
    );
    unique(
      payload.audio.map((audio) => audio.media.id),
      'audio',
    );
    unique(payload.conditions, 'conditions');
    unique(payload.editorialAtStart.decisionRevisionIds, 'editorialAtStart');
    if (Date.parse(payload.endedAt) < Date.parse(payload.startedAt)) fail('endedAt');
    if (
      payload.editorialAtStart.status === 'unreviewed' &&
      (payload.editorialAtStart.policyVersion !== null ||
        payload.editorialAtStart.decisionRevisionIds.length)
    )
      fail('editorialAtStart');
    if (
      payload.editorialAtStart.status !== 'unreviewed' &&
      (!payload.editorialAtStart.policyVersion ||
        !payload.editorialAtStart.decisionRevisionIds.length)
    )
      fail('editorialAtStart');
    for (const item of payload.items) {
      unique(item.subjects, 'items.subjects');
      if (
        ['unanswered', 'not-reached'].includes(item.result) !==
        (item.response.kind === 'unanswered')
      )
        fail('items.response');
      if (item.response.kind === 'ordered')
        unique(item.response.tokenIds, 'items.response.tokenIds');
    }
  } else if (payload.kind === 'learning.followup/2') {
    unique(
      (payload.supersedes ?? []).map((ref) => ref.opId),
      'supersedes',
    );
    unique(
      payload.evidence.map((entry) => entry.id),
      'evidence',
    );
    unique(
      payload.evidence.map((entry) => entry.item.id),
      'evidence.item',
    );
    unique(
      payload.actions.map((entry) => entry.id),
      'actions',
    );
    if (
      payload.actions.some(
        (action) => !payload.evidence.some((entry) => entry.id === action.evidenceId),
      )
    )
      fail('actions.evidenceId');
    if (['stopped', 'pending-review'].includes(payload.status) && payload.actions.length)
      fail('actions');
  }
  return immutable(payload);
}
export function isAssessmentOperationV2(raw: unknown): raw is AssessmentOperationV2 {
  return (
    raw !== null &&
    typeof raw === 'object' &&
    'kind' in raw &&
    ['assessment.result/2', 'learning.followup/2', 'learning.suppress/2'].includes(String(raw.kind))
  );
}

/** Complete body-free follow-up replacement. The host must preserve prior evidence/action identity. */
export function createLearningFollowupRevisionIntentV2(raw: unknown, priorHeadsRaw: unknown) {
  const priorHeads = parse(z.array(refSchema).min(1).max(128), priorHeadsRaw);
  const original = parseAssessmentOperationV2(raw);
  if (original.kind !== 'learning.followup/2') fail('kind');
  const payload = parseAssessmentOperationV2({ ...original, supersedes: priorHeads });
  if (payload.kind !== 'learning.followup/2') fail('kind');
  return immutable({ payload, dependencies: priorHeads });
}

const sourceSchema = z.looseObject({
  form: z.looseObject({
    id: idSchema,
    revisionId: idSchema,
    sha256: digestSchema,
    items: z
      .array(z.looseObject({ id: idSchema, revisionId: idSchema, sha256: digestSchema }))
      .min(1)
      .max(1000),
  }),
  attempt: z.looseObject({
    attemptId: idSchema,
    revisionId: idSchema,
    form: formRefSchema,
    scope: z.strictObject({ accountId: idSchema, learnerId: idSchema }),
    status: z.enum(['submitted', 'abandoned']),
    startedAt: countSchema,
    endedAt: countSchema,
    mode: z.enum(['practice', 'timed']),
    priorExposure: z.enum(['none-reported', 'reported', 'unknown']),
    conditions: conditionsSchema,
    editorialAtStart: editorialSchema,
    clock: z.looseObject({ elapsedMs: elapsed }),
    audio: z.array(audioSchema).max(256),
    answers: z
      .array(z.looseObject({ item: itemRefSchema, response: responseSchema, flagged: z.boolean() }))
      .min(1)
      .max(1000),
  }),
  result: z.looseObject({
    attemptId: idSchema,
    attemptRevisionId: idSchema,
    form: formRefSchema,
    status: z.enum(['submitted', 'abandoned']),
    items: z
      .array(
        z.looseObject({
          itemId: idSchema,
          itemRevisionId: idSchema,
          result: itemResultSchema.shape.result,
          response: responseSchema,
          skill: itemResultSchema.shape.skill,
          task: idSchema,
          subjects: z.array(idSchema).max(16),
          elapsedMs: elapsed,
        }),
      )
      .min(1)
      .max(1000),
  }),
  followup: z.looseObject({
    id: idSchema,
    policy: idSchema,
    scope: z.strictObject({ accountId: idSchema, learnerId: idSchema }),
    attemptId: idSchema,
    attemptRevisionId: idSchema,
    form: formRefSchema,
    status: learningFollowupPayloadV2Schema.shape.status,
    evidence: z
      .array(
        z.looseObject({
          id: idSchema,
          item: z.strictObject({ id: idSchema, revisionId: idSchema, sha256: digestSchema }),
        }),
      )
      .max(1000),
    actions: z
      .array(
        z.looseObject({
          id: idSchema,
          evidenceId: idSchema,
          kind: z.literal('enroll'),
          target: z.looseObject({ t: targetSchema.shape.t, id: idSchema }),
          status: actionSchema.shape.status,
        }),
      )
      .max(1000),
  }),
});

/** Two immutable intents committed with the attempt; neither one grades an SRS card. */
export function createAssessmentSyncIntentsV2(raw: unknown) {
  const { form, attempt, result, followup } = parse(sourceSchema, raw);
  const formRef = {
    kind: 'form' as const,
    id: form.id,
    revisionId: form.revisionId,
    sha256: form.sha256,
  };
  if (
    [attempt.form, result.form, followup.form].some(
      (ref) => inputHashOf(ref) !== inputHashOf(formRef),
    ) ||
    result.attemptId !== attempt.attemptId ||
    followup.attemptId !== attempt.attemptId ||
    result.attemptRevisionId !== attempt.revisionId ||
    followup.attemptRevisionId !== attempt.revisionId ||
    inputHashOf(followup.scope) !== inputHashOf(attempt.scope) ||
    result.status !== attempt.status ||
    result.items.length !== form.items.length ||
    attempt.answers.length !== form.items.length
  )
    fail('finalization-binding');
  const items = form.items.map((item) => {
    const row = result.items.find((entry) => entry.itemId === item.id);
    const answer = attempt.answers.find((entry) => entry.item.id === item.id);
    if (
      !row ||
      !answer ||
      row.itemRevisionId !== item.revisionId ||
      answer.item.revisionId !== item.revisionId ||
      answer.item.sha256 !== item.sha256 ||
      inputHashOf(row.response) !== inputHashOf(answer.response)
    )
      fail('result.items');
    return {
      item: {
        kind: 'item' as const,
        id: item.id,
        revisionId: item.revisionId,
        sha256: item.sha256,
      },
      result: row.result,
      response: row.response,
      skill: row.skill,
      task: row.task,
      subjects: row.subjects,
      elapsedMs: row.elapsedMs,
      flagged: answer.flagged,
    };
  });
  const exam = parseAssessmentOperationV2({
    kind: 'assessment.result/2',
    attemptId: attempt.attemptId,
    attemptRevisionId: attempt.revisionId,
    generation: null,
    form: formRef,
    outcome: attempt.status,
    startedAt: new Date(attempt.startedAt).toISOString(),
    endedAt: new Date(attempt.endedAt).toISOString(),
    elapsedMs: attempt.clock.elapsedMs,
    mode: attempt.mode,
    priorExposure: attempt.priorExposure,
    conditions: attempt.conditions,
    editorialAtStart: attempt.editorialAtStart,
    items,
    audio: attempt.audio,
    officialScore: null,
    passPrediction: null,
  });
  const learning = parseAssessmentOperationV2({
    kind: 'learning.followup/2',
    followupId: followup.id,
    generation: null,
    attemptId: attempt.attemptId,
    attemptRevisionId: attempt.revisionId,
    form: formRef,
    policyVersion: followup.policy,
    status: followup.status,
    evidence: followup.evidence.map((entry) => ({
      id: entry.id,
      item: { kind: 'item', ...entry.item },
    })),
    actions: followup.actions.map((action) => ({
      id: action.id,
      evidenceId: action.evidenceId,
      kind: action.kind,
      target: { t: action.target.t, id: action.target.id },
      status: action.status,
    })),
  });
  return immutable([
    { payload: exam, dependencies: [] },
    { payload: learning, dependencies: [] },
  ]);
}

export function createLearningSuppressionIntentV2(raw: unknown) {
  const input = parse(
    z.strictObject({
      suppressionId: idSchema,
      target: targetSchema,
      at: isoInstantSchema,
      reason: learningSuppressPayloadV2Schema.shape.reason,
      policyVersion: idSchema,
    }),
    raw,
  );
  return immutable({
    payload: parseAssessmentOperationV2({
      kind: 'learning.suppress/2',
      generation: null,
      ...input,
    }),
    dependencies: [],
  });
}
