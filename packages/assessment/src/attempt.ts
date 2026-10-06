import { inputHashOf } from '@bunki/ai/hash';
import { isoInstantSchema } from '@bunki/domain/events/shared';
import { z } from 'zod';
import {
  artifactReferenceSchema,
  AssessmentValidationError,
  assertRevision,
  assertUnique,
  countSchema,
  digestSchema,
  elapsedSchema,
  idSchema,
  immutable,
  parse,
  revisionOf,
  textSchema,
  type DeepReadonly,
} from './common.ts';
import {
  artifactReference,
  assertExactReference,
  inspectFormStructure,
  parseFormVersion,
  type FormVersion,
  type ItemVersion,
} from './content.ts';

export const ASSESSMENT_ADMISSION_POLICY = 'assessment-admission/v1';
export const responseSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unanswered') }),
  z.strictObject({ kind: z.literal('selected'), optionId: idSchema }),
  z.strictObject({ kind: z.literal('ordered'), tokenIds: z.array(idSchema).min(1).max(32) }),
  z.strictObject({ kind: z.literal('written'), text: textSchema(16_000) }),
]);
export type AssessmentResponse = DeepReadonly<z.infer<typeof responseSchema>>;
const itemRefSchema = artifactReferenceSchema.extend({ kind: z.literal('item') });
const mediaRefSchema = artifactReferenceSchema.extend({ kind: z.literal('media') });
const factFields = {
  id: idSchema,
  recordedAt: isoInstantSchema,
  timingBlockId: idSchema,
  elapsedMs: elapsedSchema,
};
export const attemptFactSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...factFields,
    kind: z.literal('exposure'),
    item: itemRefSchema,
    content: z.enum(['prompt', 'passage', 'answer', 'explanation']),
  }),
  z.strictObject({
    ...factFields,
    kind: z.literal('response'),
    item: itemRefSchema,
    response: responseSchema,
  }),
  z.strictObject({
    ...factFields,
    kind: z.literal('assistance'),
    item: itemRefSchema,
    assistance: z.enum(['dictionary', 'hint', 'translation', 'tutor', 'external']),
  }),
  z.strictObject({
    ...factFields,
    kind: z.literal('audio'),
    item: itemRefSchema,
    media: mediaRefSchema,
    action: z.enum(['start', 'pause', 'seek', 'replay', 'ended', 'error']),
    positionMs: elapsedSchema,
  }),
  z.strictObject({
    ...factFields,
    kind: z.literal('interruption'),
    reason: z.enum([
      'background',
      'process-stop',
      'device-change',
      'clock-discontinuity',
      'user-pause',
      'network',
    ]),
  }),
]);
export type AttemptFact = DeepReadonly<z.infer<typeof attemptFactSchema>>;
const timingSchema = z
  .strictObject({
    blockId: idSchema,
    elapsedMs: elapsedSchema,
    activeMs: elapsedSchema,
  })
  .refine((timing) => timing.activeMs <= timing.elapsedMs);
const cursorSchema = z.strictObject({ timingBlockId: idSchema, itemId: idSchema.nullable() });
const editorialAtStartSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('unreviewed'),
    authorityPolicyVersion: z.null(),
    decisionRevisionIds: z.array(idSchema).length(0),
  }),
  z.strictObject({
    status: z.literal('reviewed'),
    authorityPolicyVersion: idSchema,
    decisionRevisionIds: z.array(idSchema).min(1).max(64),
  }),
]);
const answerSchema = z.strictObject({
  item: itemRefSchema,
  response: responseSchema,
  lastResponseFactId: idSchema.nullable(),
});
const attemptPayloadSchema = z.strictObject({
  format: z.literal('kairo-assessment-attempt'),
  v: z.literal(1),
  attemptId: idSchema,
  scope: z.strictObject({ accountId: idSchema, learnerId: idSchema }),
  form: artifactReferenceSchema.extend({ kind: z.literal('form') }),
  mode: z.enum(['practice', 'timed']),
  priorExposure: z.enum(['none-reported', 'reported', 'unknown']),
  editorialAtStart: editorialAtStartSchema,
  admissionPolicyVersion: z.literal(ASSESSMENT_ADMISSION_POLICY),
  startedAt: isoInstantSchema,
  recordedAt: isoInstantSchema,
  endedAt: isoInstantSchema.nullable(),
  status: z.enum(['in-progress', 'submitted', 'abandoned']),
  revision: countSchema,
  previousRevisionId: idSchema.nullable(),
  cursor: cursorSchema,
  timings: z.array(timingSchema).min(1).max(32),
  clockStatus: z.enum(['continuous', 'interrupted', 'unverified']),
  facts: z.array(attemptFactSchema).max(10_000),
  answers: z.array(answerSchema).min(1).max(1000),
});
const attemptVersionSchema = attemptPayloadSchema.extend({
  revisionId: idSchema,
  sha256: digestSchema,
});
export type AssessmentAttempt = DeepReadonly<z.infer<typeof attemptVersionSchema>>;

function timingBlockFor(form: FormVersion, itemId: string): string {
  const section = form.sections.find((entry) => entry.itemIds.includes(itemId));
  const block = form.timingBlocks.find((entry) => section && entry.sectionIds.includes(section.id));
  if (!block) throw new AssessmentValidationError('reference-mismatch', ['itemId']);
  return block.id;
}

export function assertItemResponse(item: ItemVersion, raw: unknown): AssessmentResponse {
  const response = parse(responseSchema, raw);
  if (response.kind === 'unanswered') return immutable(response);
  const spec = item.response;
  if (response.kind !== spec.kind)
    throw new AssessmentValidationError('invalid-input', ['response.kind']);
  if (response.kind === 'selected' && spec.kind === 'selected') {
    if (!spec.options.some((option) => option.id === response.optionId))
      throw new AssessmentValidationError('invalid-input', ['response.optionId']);
  } else if (response.kind === 'ordered' && spec.kind === 'ordered') {
    assertUnique(response.tokenIds, 'response.tokenIds');
    if (response.tokenIds.some((id) => !spec.tokens.some((token) => token.id === id))) {
      throw new AssessmentValidationError('invalid-input', ['response.tokenIds']);
    }
  } else if (
    response.kind === 'written' &&
    spec.kind === 'written' &&
    response.text.length > spec.maxChars
  ) {
    throw new AssessmentValidationError('invalid-input', ['response.text']);
  }
  return immutable(response);
}

function deriveAnswers(form: FormVersion, facts: readonly AttemptFact[]) {
  const answers = new Map<string, z.infer<typeof answerSchema>>(
    form.items.map((item) => [
      item.id,
      {
        item: { ...artifactReference(item), kind: 'item' as const },
        response: { kind: 'unanswered' as const },
        lastResponseFactId: null,
      },
    ]),
  );
  const exposed = new Set<string>();
  for (const fact of facts) {
    if (fact.kind === 'exposure' && fact.content === 'prompt') exposed.add(fact.item.id);
    if (fact.kind !== 'response') continue;
    if (!exposed.has(fact.item.id))
      throw new AssessmentValidationError('invalid-input', ['response-before-exposure']);
    const item = form.items.find((entry) => entry.id === fact.item.id);
    if (!item) throw new AssessmentValidationError('reference-mismatch', ['response.item']);
    const response = assertItemResponse(item, fact.response);
    answers.set(item.id, {
      item: { ...fact.item },
      response: response as z.infer<typeof responseSchema>,
      lastResponseFactId: fact.id,
    });
  }
  return [...answers.values()];
}

function validateAttempt(form: FormVersion, attempt: z.infer<typeof attemptPayloadSchema>): void {
  assertExactReference(attempt.form, form);
  if (
    (attempt.revision === 0) !== (attempt.previousRevisionId === null) ||
    (attempt.status === 'in-progress') !== (attempt.endedAt === null) ||
    (attempt.endedAt !== null && attempt.endedAt !== attempt.recordedAt)
  ) {
    throw new AssessmentValidationError('invalid-input', ['attempt-state']);
  }
  if (
    attempt.revision === 0 &&
    (attempt.status !== 'in-progress' ||
      attempt.facts.length !== 0 ||
      attempt.startedAt !== attempt.recordedAt ||
      attempt.timings.some((timing) => timing.elapsedMs !== 0 || timing.activeMs !== 0))
  ) {
    throw new AssessmentValidationError('invalid-input', ['initial-attempt-state']);
  }
  assertUnique(
    attempt.editorialAtStart.decisionRevisionIds,
    'editorialAtStart.decisionRevisionIds',
  );
  assertUnique(
    attempt.timings.map((timing) => timing.blockId),
    'timings',
  );
  if (
    attempt.timings.length !== form.timingBlocks.length ||
    form.timingBlocks.some((block, index) => attempt.timings[index]?.blockId !== block.id)
  ) {
    throw new AssessmentValidationError('invalid-input', ['timings.blockId']);
  }
  if (
    !form.timingBlocks.some((block) => block.id === attempt.cursor.timingBlockId) ||
    (attempt.cursor.itemId !== null &&
      timingBlockFor(form, attempt.cursor.itemId) !== attempt.cursor.timingBlockId)
  ) {
    throw new AssessmentValidationError('invalid-input', ['cursor']);
  }
  assertUnique(
    attempt.facts.map((fact) => fact.id),
    'facts.id',
  );
  const elapsed = new Map<string, number>();
  let interrupted = false;
  let discontinuous = false;
  for (const fact of attempt.facts) {
    const timing = attempt.timings.find((entry) => entry.blockId === fact.timingBlockId);
    if (
      !timing ||
      fact.elapsedMs > timing.elapsedMs ||
      fact.elapsedMs < (elapsed.get(fact.timingBlockId) ?? 0)
    ) {
      throw new AssessmentValidationError('invalid-input', ['facts.elapsedMs']);
    }
    elapsed.set(fact.timingBlockId, fact.elapsedMs);
    if (fact.kind === 'interruption') {
      interrupted = true;
      if (['process-stop', 'clock-discontinuity', 'device-change'].includes(fact.reason))
        discontinuous = true;
      continue;
    }
    const item = form.items.find((entry) => entry.id === fact.item.id);
    if (!item) throw new AssessmentValidationError('reference-mismatch', ['facts.item']);
    assertExactReference(fact.item, item);
    if (timingBlockFor(form, item.id) !== fact.timingBlockId)
      throw new AssessmentValidationError('invalid-input', ['facts.timingBlockId']);
    if (fact.kind === 'audio') {
      const media = form.media.find((entry) => entry.id === fact.media.id);
      if (
        !media ||
        media.kind !== 'audio' ||
        !item.media.some((reference) => reference.id === media.id)
      )
        throw new AssessmentValidationError('reference-mismatch', ['facts.media']);
      assertExactReference(fact.media, media);
      if (fact.positionMs > media.durationMs)
        throw new AssessmentValidationError('invalid-input', ['facts.positionMs']);
    }
  }
  if (
    (interrupted && attempt.clockStatus === 'continuous') ||
    (discontinuous && attempt.clockStatus !== 'unverified')
  ) {
    throw new AssessmentValidationError('invalid-input', ['clockStatus']);
  }
  const actualAnswers = deriveAnswers(form, attempt.facts);
  if (inputHashOf(actualAnswers) !== inputHashOf(attempt.answers))
    throw new AssessmentValidationError('invalid-input', ['answers']);
}

const beginSchema = z.strictObject({
  attemptId: idSchema,
  scope: attemptPayloadSchema.shape.scope,
  mode: attemptPayloadSchema.shape.mode,
  priorExposure: attemptPayloadSchema.shape.priorExposure,
  editorialAtStart: editorialAtStartSchema,
  startedAt: isoInstantSchema,
  clockStatus: z.enum(['continuous', 'unverified']),
});
export type BeginAttempt = DeepReadonly<z.infer<typeof beginSchema>>;

/** The host injects a new unique ID and must atomically refuse collisions in durable storage. */
export function beginAttempt(formRaw: unknown, raw: unknown): AssessmentAttempt {
  const form = parseFormVersion(formRaw);
  const input = parse(beginSchema, raw);
  const firstBlock = form.timingBlocks[0]!;
  const firstSection = form.sections.find((section) => firstBlock.sectionIds.includes(section.id))!;
  const payload = parse(attemptPayloadSchema, {
    format: 'kairo-assessment-attempt' as const,
    v: 1 as const,
    ...input,
    form: { ...artifactReference(form), kind: 'form' as const },
    admissionPolicyVersion: ASSESSMENT_ADMISSION_POLICY,
    recordedAt: input.startedAt,
    endedAt: null,
    status: 'in-progress' as const,
    revision: 0,
    previousRevisionId: null,
    cursor: { timingBlockId: firstBlock.id, itemId: firstSection.itemIds[0]! },
    timings: form.timingBlocks.map((block) => ({ blockId: block.id, elapsedMs: 0, activeMs: 0 })),
    facts: [],
    answers: deriveAnswers(form, []),
  });
  validateAttempt(form, payload);
  return immutable(revisionOf('attempt', payload));
}

export function parseAttempt(formRaw: unknown, raw: unknown): AssessmentAttempt {
  const form = parseFormVersion(formRaw);
  const { revisionId, sha256, ...payload } = parse(attemptVersionSchema, raw);
  validateAttempt(form, payload);
  assertRevision('attempt', { revisionId, sha256 }, payload);
  return immutable({ ...payload, revisionId, sha256 });
}

const checkpointSchema = z.strictObject({
  expectedRevisionId: idSchema,
  recordedAt: isoInstantSchema,
  cursor: cursorSchema,
  timings: z.array(timingSchema).min(1).max(32),
  clockStatus: attemptPayloadSchema.shape.clockStatus,
  facts: z.array(attemptFactSchema).max(1000),
  status: attemptPayloadSchema.shape.status,
});
export type AttemptCheckpoint = DeepReadonly<z.infer<typeof checkpointSchema>>;

/**
 * Pure proposed transition. A host commits this revision and its outbox atomically using
 * expectedRevisionId; computing it is not a successful save. Wall clocks never set duration.
 */
export function checkpointAttempt(
  formRaw: unknown,
  previousRaw: unknown,
  raw: unknown,
): AssessmentAttempt {
  const form = parseFormVersion(formRaw);
  const previous = parseAttempt(form, previousRaw);
  const command = parse(checkpointSchema, raw);
  if (command.expectedRevisionId !== previous.revisionId)
    throw new AssessmentValidationError('stale-checkpoint');
  if (previous.status !== 'in-progress') throw new AssessmentValidationError('attempt-finalized');
  for (const oldTiming of previous.timings) {
    const next = command.timings.find((timing) => timing.blockId === oldTiming.blockId);
    if (!next || next.elapsedMs < oldTiming.elapsedMs || next.activeMs < oldTiming.activeMs)
      throw new AssessmentValidationError('timing-regression');
  }
  const ranks = { continuous: 0, interrupted: 1, unverified: 2 };
  if (ranks[command.clockStatus] < ranks[previous.clockStatus])
    throw new AssessmentValidationError('invalid-input', ['clockStatus']);
  if (previous.mode === 'timed') {
    const before = form.timingBlocks.findIndex(
      (block) => block.id === previous.cursor.timingBlockId,
    );
    const after = form.timingBlocks.findIndex((block) => block.id === command.cursor.timingBlockId);
    if (
      after < before ||
      after > before + 1 ||
      command.facts.some(
        (fact) =>
          ![previous.cursor.timingBlockId, command.cursor.timingBlockId].includes(
            fact.timingBlockId,
          ),
      )
    ) {
      throw new AssessmentValidationError('invalid-input', ['timed-block-order']);
    }
  }
  const { revisionId: _revisionId, sha256: _sha256, ...priorPayload } = previous;
  const facts = [...previous.facts, ...command.facts];
  const payload = parse(attemptPayloadSchema, {
    ...priorPayload,
    recordedAt: command.recordedAt,
    endedAt: command.status === 'in-progress' ? null : command.recordedAt,
    status: command.status,
    revision: previous.revision + 1,
    previousRevisionId: previous.revisionId,
    cursor: command.cursor,
    timings: command.timings,
    clockStatus: command.clockStatus,
    facts,
    answers: deriveAnswers(form, facts),
  });
  validateAttempt(form, payload);
  return immutable(revisionOf('attempt', payload));
}

export interface RawAssessmentScore {
  readonly label: 'Raw practice result';
  readonly attemptId: string;
  readonly attemptRevisionId: string;
  readonly correct: number;
  readonly scorableItems: number;
  readonly totalItems: number;
  readonly pendingManualMarking: number;
  readonly items: readonly {
    readonly itemId: string;
    readonly result: 'correct' | 'incorrect' | 'unanswered' | 'needs-human-marking';
  }[];
  readonly officialScore: null;
  readonly certification: 'none';
  readonly passPrediction: null;
}

export function scoreAttempt(formRaw: unknown, attemptRaw: unknown): RawAssessmentScore {
  const form = parseFormVersion(formRaw);
  const attempt = parseAttempt(form, attemptRaw);
  if (attempt.status !== 'submitted') throw new AssessmentValidationError('attempt-not-submitted');
  const items: { itemId: string; result: RawAssessmentScore['items'][number]['result'] }[] = [];
  let scorableItems = 0;
  for (const item of form.items) {
    const response = attempt.answers.find((answer) => answer.item.id === item.id)!.response;
    const spec = item.response;
    const manual = spec.kind === 'written' && spec.marking.kind === 'manual';
    if (!manual) scorableItems += 1;
    let result: RawAssessmentScore['items'][number]['result'];
    if (response.kind === 'unanswered') result = 'unanswered';
    else if (manual) result = 'needs-human-marking';
    else {
      const correct =
        response.kind === 'selected' && spec.kind === 'selected'
          ? response.optionId === spec.answerOptionId
          : response.kind === 'ordered' && spec.kind === 'ordered'
            ? inputHashOf(response.tokenIds) === inputHashOf(spec.answerOrder)
            : response.kind === 'written' &&
                spec.kind === 'written' &&
                spec.marking.kind === 'exact'
              ? spec.marking.accepted.includes(response.text)
              : false;
      result = correct ? 'correct' : 'incorrect';
    }
    items.push({ itemId: item.id, result });
  }
  return immutable({
    label: 'Raw practice result',
    attemptId: attempt.attemptId,
    attemptRevisionId: attempt.revisionId,
    correct: items.filter((item) => item.result === 'correct').length,
    scorableItems,
    totalItems: items.length,
    pendingManualMarking: items.filter((item) => item.result === 'needs-human-marking').length,
    items,
    officialScore: null,
    certification: 'none',
    passPrediction: null,
  });
}

/** A conservative eligibility observation. It never mints DomainEventv1 or schedules a review. */
export function assessAttemptAdmission(formRaw: unknown, attemptRaw: unknown) {
  const form = parseFormVersion(formRaw);
  const attempt = parseAttempt(form, attemptRaw);
  const reasons: string[] = [];
  if (attempt.status !== 'submitted') reasons.push('not-submitted');
  if (attempt.mode !== 'timed' || form.scope !== 'full-candidate') reasons.push('practice-scope');
  if (attempt.editorialAtStart.status !== 'reviewed') reasons.push('unreviewed-at-start');
  if (!inspectFormStructure(form).passesKnownChecks) reasons.push('content-structure-incomplete');
  if (
    [form, ...form.items, ...form.passages, ...form.media].some(
      (entry) =>
        entry.provenance.kind === 'legacy-unverified' ||
        entry.rights.display.status !== 'allowed' ||
        entry.rights.retain.status !== 'allowed',
    )
  ) {
    reasons.push('content-not-cleared');
  }
  if (attempt.priorExposure !== 'none-reported') reasons.push('prior-exposure-not-clear');
  if (attempt.clockStatus !== 'continuous') reasons.push('clock-not-continuous');
  if (
    attempt.facts.some(
      (fact) =>
        fact.kind === 'assistance' ||
        (fact.kind === 'exposure' && ['answer', 'explanation'].includes(fact.content)),
    )
  )
    reasons.push('assisted-or-revealed');
  if (attempt.facts.some((fact) => fact.kind === 'interruption')) reasons.push('interrupted');
  if (
    attempt.facts.some(
      (fact) => fact.kind === 'audio' && ['error', 'seek', 'replay'].includes(fact.action),
    )
  )
    reasons.push('audio-not-standard');
  if (
    attempt.timings.some(
      (timing) =>
        timing.elapsedMs >
        form.timingBlocks.find((block) => block.id === timing.blockId)!.durationMs,
    )
  )
    reasons.push('time-limit-exceeded');
  if (attempt.answers.some((answer) => answer.response.kind === 'unanswered'))
    reasons.push('unanswered-items');
  if (
    form.items.some(
      (item) => item.response.kind === 'written' && item.response.marking.kind === 'manual',
    )
  )
    reasons.push('manual-marking-required');
  const audioMedia = form.media.filter((media) => media.kind === 'audio');
  for (const item of form.items.filter((entry) => entry.skill === 'listening')) {
    if (
      audioMedia
        .filter((media) => item.media.some((reference) => reference.id === media.id))
        .some((media) => {
          const startIndex = attempt.facts.findIndex(
            (fact) =>
              fact.kind === 'audio' &&
              fact.item.id === item.id &&
              fact.media.id === media.id &&
              fact.action === 'start' &&
              fact.positionMs === 0,
          );
          const endIndex = attempt.facts.findIndex(
            (fact) =>
              fact.kind === 'audio' &&
              fact.item.id === item.id &&
              fact.media.id === media.id &&
              fact.action === 'ended' &&
              fact.positionMs === media.durationMs,
          );
          const responseIndex = attempt.facts.findIndex(
            (fact) =>
              fact.id ===
              attempt.answers.find((answer) => answer.item.id === item.id)!.lastResponseFactId,
          );
          return startIndex < 0 || endIndex <= startIndex || responseIndex <= startIndex;
        })
    ) {
      reasons.push('listening-completion-unverified');
      break;
    }
  }
  return immutable({
    policyVersion: ASSESSMENT_ADMISSION_POLICY,
    disposition: reasons.length
      ? ('practice-only' as const)
      : ('candidate-for-separate-domain-gate' as const),
    reasons,
    evidenceAdmitted: false as const,
    scheduling: 'unchanged' as const,
    officialScore: null,
    certification: 'none' as const,
  });
}
