/** Version 2 delivery records. Version 1 remains byte-for-byte meaningful.
 * The host commits returned checkpoints before showing the next question.
 * Local clocks describe test conditions; they never certify exam conditions.
 */
import { inputHashOf } from '@bunki/ai/hash';
import { z } from 'zod';
import { assertItemResponse, responseSchema } from './attempt.ts';
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
  type DeepReadonly,
} from './common.ts';
import {
  artifactReference,
  assertExactReference,
  parseFormVersion,
  type FormVersion,
} from './content.ts';

export const ASSESSMENT_DELIVERY_PROTOCOL_V2 = 'assessment-delivery/v2';
const milliseconds = z.number().int().min(0).max(8_640_000_000_000_000);
const editorialSchema = z.strictObject({
  status: z.enum(['unreviewed', 'ai-reviewed-practice', 'ai-reviewed-full']),
  policyVersion: idSchema.nullable(),
  decisionRevisionIds: z.array(idSchema).max(2048),
});
const conditionSchema = z.enum([
  'interrupted',
  'clock-discontinuity',
  'clock-unverified',
  'audio-interrupted',
  'audio-error',
  'audio-replayed',
  'audio-seeked',
  'assisted',
]);
/** An explanation opened after this item's committed answer. The response copy
 * lets every parse re-check the lock; it is a consistency check against the
 * enclosing answer, not proof of the learner's history (a jointly re-sealed
 * record is outside what a standalone checkpoint can authenticate). */
const assistanceSchema = z.strictObject({
  kind: z.literal('explanation'),
  at: milliseconds,
  response: responseSchema,
});
const answerSchema = z.strictObject({
  item: artifactReferenceSchema.extend({ kind: z.literal('item') }),
  response: responseSchema,
  reached: z.boolean(),
  flagged: z.boolean(),
  elapsedMs: elapsedSchema,
  /** Absent means no item-level assistance was recorded, not proof of independence. */
  assistance: assistanceSchema.optional(),
});
const blockSchema = z.strictObject({
  blockId: idSchema,
  status: z.enum(['pending', 'open', 'closed']),
  startedAt: milliseconds.nullable(),
  startedElapsedMs: elapsedSchema.nullable(),
  deadlineAt: milliseconds.nullable(),
  elapsedMs: elapsedSchema,
  closedAt: milliseconds.nullable(),
  closeReason: z.enum(['submitted', 'deadline', 'abandoned']).nullable(),
});
const audioSchema = z.strictObject({
  media: artifactReferenceSchema.extend({ kind: z.literal('media') }),
  /** Every item referencing this media shares this one playback record. */
  status: z.enum(['unplayed', 'playing', 'paused', 'ended', 'error']),
  starts: countSchema,
  positionMs: elapsedSchema,
  playedMs: elapsedSchema,
});
const eventSchema = z.strictObject({
  kind: z.enum(['block-opened', 'block-closed', 'interruption', 'resume', 'audio', 'assistance']),
  at: milliseconds,
  blockId: idSchema.nullable(),
  detail: idSchema,
});
const payloadSchema = z.strictObject({
  format: z.literal('kairo-assessment-attempt'),
  v: z.literal(2),
  protocol: z.literal(ASSESSMENT_DELIVERY_PROTOCOL_V2),
  attemptId: idSchema,
  scope: z.strictObject({ accountId: idSchema, learnerId: idSchema }),
  form: artifactReferenceSchema.extend({ kind: z.literal('form') }),
  mode: z.enum(['practice', 'timed']),
  priorExposure: z.enum(['none-reported', 'reported', 'unknown']),
  editorialAtStart: editorialSchema,
  startedAt: milliseconds,
  recordedAt: milliseconds,
  endedAt: milliseconds.nullable(),
  status: z.enum(['in-progress', 'submitted', 'abandoned']),
  revision: countSchema,
  previousRevisionId: idSchema.nullable(),
  cursor: z.strictObject({ blockId: idSchema.nullable(), itemId: idSchema.nullable() }),
  clock: z.strictObject({
    sessionId: idSchema,
    lastWallMs: milliseconds,
    lastMonotonicMs: milliseconds.nullable(),
    elapsedMs: elapsedSchema,
    interrupted: z.boolean(),
  }),
  conditions: z.array(conditionSchema).max(8),
  /** Set by an item explanation added while earlier help had no item attribution, so the
   * new mark cannot make that help look accounted for. Absent records nothing either way. */
  assistanceAttribution: z.literal('unknown').optional(),
  blocks: z.array(blockSchema).min(1).max(32),
  answers: z.array(answerSchema).min(1).max(1000),
  audio: z.array(audioSchema).max(256),
  events: z.array(eventSchema).max(10_000),
});
const versionSchema = payloadSchema.extend({ revisionId: idSchema, sha256: digestSchema });
export type AssessmentAttemptV2 = DeepReadonly<z.infer<typeof versionSchema>>;
type Payload = z.infer<typeof payloadSchema>;

const clockInput = {
  now: milliseconds,
  clockSessionId: idSchema,
  monotonicMs: milliseconds.nullable().optional(),
};
const startSchema = z.strictObject({
  ...clockInput,
  attemptId: idSchema,
  scope: z.strictObject({ accountId: idSchema, learnerId: idSchema }),
  mode: z.enum(['practice', 'timed']),
  priorExposure: z.enum(['none-reported', 'reported', 'unknown']),
  editorialAtStart: editorialSchema,
});
export const assessmentActionV2Schema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tick') }),
  z.strictObject({ kind: z.literal('visit'), itemId: idSchema }),
  z.strictObject({ kind: z.literal('answer'), itemId: idSchema, response: responseSchema }),
  z.strictObject({ kind: z.literal('flag'), itemId: idSchema, flagged: z.boolean() }),
  z.strictObject({ kind: z.literal('close-block'), blockId: idSchema }),
  z.strictObject({ kind: z.literal('start-next-block') }),
  z.strictObject({ kind: z.literal('submit') }),
  z.strictObject({ kind: z.literal('abandon') }),
  z.strictObject({ kind: z.literal('interruption'), reason: idSchema }),
  z.strictObject({ kind: z.literal('resume') }),
  /** Without itemId: the historical attempt-level form, unchanged. With itemId:
   * one explanation for the current item's committed selected answer. */
  z.strictObject({ kind: z.literal('assistance'), reason: idSchema, itemId: idSchema.optional() }),
  z.strictObject({
    kind: z.literal('audio'),
    mediaId: idSchema,
    action: z.enum(['start', 'pause', 'seek', 'replay', 'ended', 'error']),
    positionMs: elapsedSchema,
  }),
]);
export type AssessmentActionV2 = DeepReadonly<z.infer<typeof assessmentActionV2Schema>>;
const commandSchema = z.strictObject({
  ...clockInput,
  expectedRevisionId: idSchema,
  action: assessmentActionV2Schema,
});

function idsForBlock(form: FormVersion, blockId: string): readonly string[] {
  const spec = form.timingBlocks.find((block) => block.id === blockId);
  return (
    spec?.sectionIds.flatMap(
      (sectionId) => form.sections.find((section) => section.id === sectionId)!.itemIds,
    ) ?? []
  );
}
function fail(path: string): never {
  throw new AssessmentValidationError('invalid-input', [path]);
}
function condition(state: Payload, value: z.infer<typeof conditionSchema>) {
  if (!state.conditions.includes(value)) state.conditions.push(value);
}
function event(state: Payload, kind: z.infer<typeof eventSchema>['kind'], detail: string) {
  state.events.push({ kind, at: state.recordedAt, blockId: state.cursor.blockId, detail });
}
function validate(form: FormVersion, state: Payload) {
  assertExactReference(state.form, form);
  assertUnique(state.conditions, 'conditions');
  assertUnique(state.editorialAtStart.decisionRevisionIds, 'editorialAtStart');
  if (
    state.editorialAtStart.status === 'unreviewed' &&
    (state.editorialAtStart.policyVersion !== null ||
      state.editorialAtStart.decisionRevisionIds.length)
  )
    fail('unreviewed-editorial');
  if (
    state.editorialAtStart.status !== 'unreviewed' &&
    (!state.editorialAtStart.policyVersion || !state.editorialAtStart.decisionRevisionIds.length)
  )
    fail('reviewed-editorial');
  if (
    (state.revision === 0) !== (state.previousRevisionId === null) ||
    (state.status === 'in-progress') !== (state.endedAt === null) ||
    state.recordedAt < state.startedAt ||
    (state.endedAt !== null && state.endedAt !== state.recordedAt)
  )
    fail('attempt-state');
  if (
    state.answers.length !== form.items.length ||
    state.blocks.length !== form.timingBlocks.length
  )
    fail('form-shape');
  let assistanceMarks = 0;
  for (const [index, answer] of state.answers.entries()) {
    const item = form.items[index]!;
    assertExactReference(answer.item, item);
    assertItemResponse(item, answer.response);
    if (!answer.reached && (answer.response.kind !== 'unanswered' || answer.elapsedMs > 0))
      fail('response-before-exposure');
    if (answer.assistance) {
      assistanceMarks += 1;
      if (state.mode !== 'practice') fail('assistance.mode');
      if (!answer.reached) fail('assistance.reached');
      if (answer.response.kind !== 'selected' || item.response.kind !== 'selected')
        fail('assistance.response');
      if (inputHashOf(answer.assistance.response) !== inputHashOf(answer.response))
        fail('assistance.copy');
      if (answer.assistance.at < state.startedAt || answer.assistance.at > state.recordedAt)
        fail('assistance.at');
      if (!state.conditions.includes('assisted')) fail('assistance.condition');
    }
  }
  // Events describe the timeline; they carry no item reference. Each item mark
  // is written with one event, so fewer events than marks is malformed. More
  // events than marks is lawful historical attempt-level assistance.
  if (assistanceMarks > state.events.filter((entry) => entry.kind === 'assistance').length)
    fail('assistance.events');
  // Only an item explanation writes the inherited-uncertainty record, so it needs the
  // aggregate condition and at least one item mark.
  if (
    state.assistanceAttribution !== undefined &&
    (!state.conditions.includes('assisted') || assistanceMarks === 0)
  )
    fail('assistance.attribution');
  let open = 0;
  let pending = false;
  for (const [index, block] of state.blocks.entries()) {
    const spec = form.timingBlocks[index]!;
    if (block.blockId !== spec.id) fail('blocks.order');
    if (block.status === 'pending') {
      pending = true;
      if (
        block.startedAt !== null ||
        block.startedElapsedMs !== null ||
        block.deadlineAt !== null ||
        block.closedAt !== null ||
        block.closeReason !== null ||
        block.elapsedMs !== 0
      )
        fail('block.pending');
    } else {
      if (
        pending ||
        block.startedAt === null ||
        block.startedElapsedMs === null ||
        block.startedAt < state.startedAt ||
        block.startedElapsedMs > state.clock.elapsedMs
      )
        fail('block.started');
      if (block.deadlineAt !== (state.mode === 'timed' ? block.startedAt + spec.durationMs : null))
        fail('block.deadline');
      if (state.mode === 'timed' && block.elapsedMs > spec.durationMs) fail('block.elapsed');
      if (block.status === 'open') {
        open += 1;
        if (
          block.closedAt !== null ||
          block.closeReason !== null ||
          state.cursor.blockId !== block.blockId
        )
          fail('block.open');
      } else if (
        block.closedAt === null ||
        block.closeReason === null ||
        block.closedAt < block.startedAt
      )
        fail('block.closed');
    }
  }
  if (
    open > 1 ||
    (open === 0) !== (state.cursor.blockId === null) ||
    (state.cursor.blockId === null) !== (state.cursor.itemId === null)
  )
    fail('cursor.block');
  if (
    state.cursor.blockId &&
    (!state.cursor.itemId || !idsForBlock(form, state.cursor.blockId).includes(state.cursor.itemId))
  )
    fail('cursor.item');
  if (state.status !== 'in-progress' && open !== 0) fail('terminal-block-open');
  if (state.status === 'submitted' && state.blocks.some((block) => block.status !== 'closed'))
    fail('submitted-block-pending');
  const audio = form.media.filter((media) => media.kind === 'audio');
  if (state.audio.length !== audio.length) fail('audio.shape');
  for (const [index, playback] of state.audio.entries()) {
    const media = audio[index]!;
    assertExactReference(playback.media, media);
    if (
      playback.positionMs > media.durationMs + 1000 ||
      (playback.status === 'unplayed') !== (playback.starts === 0) ||
      (state.mode === 'timed' && playback.starts > 1)
    )
      fail('audio.playback');
  }
}
function seal(form: FormVersion, raw: unknown): AssessmentAttemptV2 {
  const state = parse(payloadSchema, raw);
  validate(form, state);
  return immutable(revisionOf('attempt-v2', state));
}

export function parseAttemptV2(formRaw: unknown, raw: unknown): AssessmentAttemptV2 {
  const form = parseFormVersion(formRaw);
  const { revisionId, sha256, ...state } = parse(versionSchema, raw);
  assertRevision('attempt-v2', { revisionId, sha256 }, state);
  validate(form, state);
  return immutable({ ...state, revisionId, sha256 });
}
function openNext(form: FormVersion, state: Payload) {
  if (state.cursor.blockId !== null) fail('block-already-open');
  const block = state.blocks.find((entry) => entry.status === 'pending');
  if (!block) return;
  const spec = form.timingBlocks.find((entry) => entry.id === block.blockId)!;
  block.status = 'open';
  block.startedAt = state.recordedAt;
  block.startedElapsedMs = state.clock.elapsedMs;
  block.deadlineAt = state.mode === 'timed' ? state.recordedAt + spec.durationMs : null;
  state.cursor = { blockId: block.blockId, itemId: idsForBlock(form, block.blockId)[0]! };
  state.answers.find((answer) => answer.item.id === state.cursor.itemId)!.reached = true;
  event(state, 'block-opened', block.blockId);
}
function closeBlock(state: Payload, reason: 'submitted' | 'deadline' | 'abandoned') {
  const block = state.blocks.find((entry) => entry.blockId === state.cursor.blockId);
  if (!block || block.status !== 'open') return;
  block.status = 'closed';
  block.closedAt = state.recordedAt;
  block.closeReason = reason;
  event(state, 'block-closed', reason);
  state.cursor = { blockId: null, itemId: null };
  if (reason !== 'abandoned' && state.blocks.every((entry) => entry.status === 'closed')) {
    state.status = 'submitted';
    state.endedAt = state.recordedAt;
  }
}

/** A form is the chosen short, medium or full test. No question slicing occurs. */
export function beginAttemptV2(formRaw: unknown, raw: unknown): AssessmentAttemptV2 {
  const form = parseFormVersion(formRaw);
  const input = parse(startSchema, raw);
  const state: Payload = {
    format: 'kairo-assessment-attempt',
    v: 2,
    protocol: ASSESSMENT_DELIVERY_PROTOCOL_V2,
    attemptId: input.attemptId,
    scope: input.scope,
    form: { ...artifactReference(form), kind: 'form' },
    mode: input.mode,
    priorExposure: input.priorExposure,
    editorialAtStart: input.editorialAtStart,
    startedAt: input.now,
    recordedAt: input.now,
    endedAt: null,
    status: 'in-progress',
    revision: 0,
    previousRevisionId: null,
    cursor: { blockId: null, itemId: null },
    clock: {
      sessionId: input.clockSessionId,
      lastWallMs: input.now,
      lastMonotonicMs: input.monotonicMs ?? null,
      elapsedMs: 0,
      interrupted: false,
    },
    conditions: input.monotonicMs == null ? ['clock-unverified'] : [],
    blocks: form.timingBlocks.map((block) => ({
      blockId: block.id,
      status: 'pending',
      startedAt: null,
      startedElapsedMs: null,
      deadlineAt: null,
      elapsedMs: 0,
      closedAt: null,
      closeReason: null,
    })),
    answers: form.items.map((item) => ({
      item: { ...artifactReference(item), kind: 'item' },
      response: { kind: 'unanswered' },
      reached: false,
      flagged: false,
      elapsedMs: 0,
    })),
    audio: form.media
      .filter((media) => media.kind === 'audio')
      .map((media) => ({
        media: { ...artifactReference(media), kind: 'media' },
        status: 'unplayed',
        starts: 0,
        positionMs: 0,
        playedMs: 0,
      })),
    events: [],
  };
  openNext(form, state);
  return seal(form, state);
}

/** Advances the deadline before applying input. A late answer can never enter a
 * closed block. The returned timeout checkpoint must still be committed. */
export function updateAttemptV2(
  formRaw: unknown,
  previousRaw: unknown,
  raw: unknown,
): AssessmentAttemptV2 {
  const form = parseFormVersion(formRaw);
  const previous = parseAttemptV2(form, previousRaw);
  const input = parse(commandSchema, raw);
  if (input.expectedRevisionId !== previous.revisionId)
    throw new AssessmentValidationError('stale-checkpoint');
  if (previous.status !== 'in-progress') return previous;
  // Reopening an explanation already recorded for this item is not a new
  // event: no clock tick, no revision. Stale commands were rejected above, and
  // the item-specific preconditions are checked first, so an earlier mark
  // never makes an unsupported retry look accepted.
  const requested = input.action;
  if (
    requested.kind === 'assistance' &&
    requested.itemId !== undefined &&
    previous.answers.some((entry) => entry.item.id === requested.itemId && entry.assistance)
  ) {
    if (requested.reason !== 'explanation') fail('assistance-reason');
    if (previous.cursor.itemId !== requested.itemId) fail('assistance-not-current-item');
    return previous;
  }
  const { revisionId: _revisionId, sha256: _sha256, ...copied } = previous;
  const state = parse(payloadSchema, copied);
  const sameSession = input.clockSessionId === state.clock.sessionId;
  const monoDelta =
    sameSession && input.monotonicMs != null && state.clock.lastMonotonicMs !== null
      ? input.monotonicMs - state.clock.lastMonotonicMs
      : null;
  const wallDelta = input.now - state.clock.lastWallMs;
  if (
    wallDelta < 0 ||
    (monoDelta !== null && (monoDelta < 0 || Math.abs(wallDelta - monoDelta) > 2000))
  )
    condition(state, 'clock-discontinuity');
  if (!sameSession) condition(state, 'interrupted');
  if (monoDelta === null) condition(state, 'clock-unverified');
  const delta = Math.max(0, wallDelta, monoDelta ?? 0);
  const elapsed = state.clock.elapsedMs + delta;
  // A seven-day bounded record is enough for an interrupted test; never wrap clocks.
  state.clock.elapsedMs = Math.min(elapsed, 7 * 24 * 60 * 60 * 1000);
  state.recordedAt = Math.max(state.recordedAt, input.now);
  state.clock.lastWallMs = Math.max(state.clock.lastWallMs, input.now);
  state.clock.sessionId = input.clockSessionId;
  state.clock.lastMonotonicMs = input.monotonicMs ?? null;
  const active = state.blocks.find((block) => block.status === 'open');
  const action = input.action;
  let expired = false;
  if (active) {
    const spec = form.timingBlocks.find((block) => block.id === active.blockId)!;
    const previousElapsed = active.elapsedMs;
    // The retained aggregate clock is bounded, but an administrative break can
    // already have saturated it before this block opens. Advance timed blocks
    // from their own elapsed value so their deadline never stops advancing.
    const spent =
      state.mode === 'timed'
        ? previousElapsed + delta
        : state.clock.elapsedMs - active.startedElapsedMs!;
    active.elapsedMs = state.mode === 'timed' ? Math.min(spent, spec.durationMs) : spent;
    if (!state.clock.interrupted && state.cursor.itemId) {
      const answer = state.answers.find((entry) => entry.item.id === state.cursor.itemId)!;
      answer.elapsedMs += active.elapsedMs - previousElapsed;
    }
    expired = state.mode === 'timed' && spent >= spec.durationMs;
    // An audio-ended observation exactly at the block boundary belongs to the
    // still-open stimulus. Answer input remains excluded at that same boundary.
    if (
      expired &&
      spent === spec.durationMs &&
      action.kind === 'audio' &&
      action.action === 'ended'
    )
      applyAudio(form, state, action);
    if (expired) closeBlock(state, 'deadline');
  }
  if (
    state.status === 'in-progress' &&
    !(expired && !['tick', 'interruption', 'resume', 'abandon'].includes(action.kind))
  ) {
    if (action.kind === 'visit' || action.kind === 'answer' || action.kind === 'flag') {
      if (!state.cursor.blockId || !idsForBlock(form, state.cursor.blockId).includes(action.itemId))
        fail('closed-or-other-block');
      const answer = state.answers.find((entry) => entry.item.id === action.itemId)!;
      if (action.kind === 'visit') {
        state.cursor.itemId = action.itemId;
        answer.reached = true;
      } else if (action.kind === 'flag') answer.flagged = action.flagged;
      else {
        if (!answer.reached) fail('response-before-exposure');
        if (answer.assistance) fail('answer-locked-after-assistance');
        answer.response = parse(
          responseSchema,
          assertItemResponse(
            form.items.find((item) => item.id === action.itemId)!,
            action.response,
          ),
        );
      }
    } else if (action.kind === 'close-block') {
      if (state.cursor.blockId === action.blockId) closeBlock(state, 'submitted');
      else if (
        !state.blocks.some((block) => block.blockId === action.blockId && block.status === 'closed')
      )
        fail('close-block');
    } else if (action.kind === 'start-next-block') openNext(form, state);
    else if (action.kind === 'submit') {
      if (state.blocks.some((block) => block.status === 'pending'))
        fail('submit-before-final-block');
      closeBlock(state, 'submitted');
    } else if (action.kind === 'abandon') {
      closeBlock(state, 'abandoned');
      state.status = 'abandoned';
      state.endedAt = state.recordedAt;
    } else if (action.kind === 'interruption') {
      state.clock.interrupted = true;
      condition(state, 'interrupted');
      event(state, 'interruption', action.reason);
    } else if (action.kind === 'resume') {
      state.clock.interrupted = false;
      event(state, 'resume', 'resume');
    } else if (action.kind === 'assistance') {
      if (state.mode === 'timed') fail('assistance-in-timed-mode');
      if (action.itemId !== undefined) {
        if (action.reason !== 'explanation') fail('assistance-reason');
        if (state.cursor.itemId !== action.itemId) fail('assistance-not-current-item');
        const answer = state.answers.find((entry) => entry.item.id === action.itemId)!;
        const spec = form.items.find((item) => item.id === action.itemId)!.response;
        if (!answer.reached || answer.response.kind !== 'selected' || spec.kind !== 'selected')
          fail('assistance-before-answer');
        // A new explanation cannot account for help recorded before any item mark (the
        // aggregate condition with no mark, or more assistance events than marks). Carry that
        // known uncertainty into this revision instead of letting the new mark hide it.
        const marksBefore = state.answers.filter((entry) => entry.assistance).length;
        const eventsBefore = state.events.filter((entry) => entry.kind === 'assistance').length;
        if (
          (state.conditions.includes('assisted') && marksBefore === 0) ||
          eventsBefore > marksBefore
        )
          state.assistanceAttribution = 'unknown';
        answer.assistance = {
          kind: 'explanation',
          at: state.recordedAt,
          response: { ...answer.response },
        };
      }
      condition(state, 'assisted');
      event(state, 'assistance', action.reason);
    } else if (action.kind === 'audio') {
      applyAudio(form, state, action);
    }
  }
  state.previousRevisionId = previous.revisionId;
  state.revision += 1;
  return seal(form, state);
}

function applyAudio(
  form: FormVersion,
  state: Payload,
  action: Extract<AssessmentActionV2, { kind: 'audio' }>,
) {
  const playback = state.audio.find((entry) => entry.media.id === action.mediaId);
  const media = form.media.find((entry) => entry.id === action.mediaId);
  const itemIds = state.cursor.blockId ? idsForBlock(form, state.cursor.blockId) : [];
  if (
    !playback ||
    !media ||
    media.kind !== 'audio' ||
    !form.items.some(
      (item) => itemIds.includes(item.id) && item.media.some((ref) => ref.id === media.id),
    )
  )
    fail('audio.current-block');
  if (action.positionMs > media.durationMs + 1000) fail('audio.position');
  if (state.mode === 'timed' && (action.action === 'seek' || action.action === 'replay'))
    fail('audio-exam-control');
  if (state.mode === 'timed' && action.positionMs < playback.positionMs) fail('audio.rewind');
  if (action.action === 'start') {
    if (playback.status === 'ended') return;
    if (
      state.mode === 'timed' &&
      ((playback.status === 'unplayed' && action.positionMs > 250) ||
        (['paused', 'error'].includes(playback.status) &&
          Math.abs(action.positionMs - playback.positionMs) > 250))
    )
      fail('audio-start-position');
    if (playback.status === 'unplayed') playback.starts += 1;
    if (playback.status === 'error') condition(state, 'audio-interrupted');
    playback.status = 'playing';
  } else if (action.action === 'replay') {
    playback.starts += 1;
    playback.status = 'playing';
    condition(state, 'audio-replayed');
  } else if (action.action === 'seek') {
    if (playback.status === 'unplayed') fail('audio-before-start');
    condition(state, 'audio-seeked');
  } else if (action.action === 'pause') {
    if (playback.status !== 'playing') fail('audio-before-start');
    playback.status = 'paused';
    condition(state, 'audio-interrupted');
  } else if (action.action === 'error') {
    if (playback.starts === 0) playback.starts = 1;
    playback.status = 'error';
    condition(state, 'audio-error');
  } else {
    if (playback.status !== 'playing' || action.positionMs < media.durationMs - 1000)
      fail('audio-incomplete');
    playback.status = 'ended';
  }
  if (action.action !== 'seek' && action.action !== 'replay')
    playback.playedMs += Math.max(0, action.positionMs - playback.positionMs);
  playback.positionMs = action.positionMs;
  event(state, 'audio', `${action.mediaId}:${action.action}`);
}

export function scoreAttemptV2(formRaw: unknown, attemptRaw: unknown) {
  const form = parseFormVersion(formRaw);
  const attempt = parseAttemptV2(form, attemptRaw);
  if (attempt.status === 'in-progress')
    throw new AssessmentValidationError('attempt-not-submitted');
  const items = form.items.map((item, index) => {
    const answer = attempt.answers[index]!;
    const response = answer.response;
    const spec = item.response;
    let result: 'correct' | 'incorrect' | 'unanswered' | 'not-reached' | 'unscored';
    if (!answer.reached) result = 'not-reached';
    else if (response.kind === 'unanswered') result = 'unanswered';
    else if (spec.kind === 'written' && spec.marking.kind === 'manual') result = 'unscored';
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
    return {
      itemId: item.id,
      itemRevisionId: item.revisionId,
      result,
      response,
      skill: item.skill,
      task: item.task,
      subjects: item.subjects,
      elapsedMs: answer.elapsedMs,
    };
  });
  const count = (result: (typeof items)[number]['result']) =>
    items.filter((item) => item.result === result).length;
  return immutable({
    format: 'kairo-assessment-result',
    v: 2,
    attemptId: attempt.attemptId,
    attemptRevisionId: attempt.revisionId,
    form: attempt.form,
    status: attempt.status,
    correct: count('correct'),
    incorrect: count('incorrect'),
    unanswered: count('unanswered'),
    notReached: count('not-reached'),
    unscored: count('unscored'),
    totalItems: items.length,
    completed: attempt.status === 'submitted',
    items,
    /** Stopping, not reaching and skipping are never evidence of a weak concept. */
    weaknessItemIds:
      attempt.status === 'submitted'
        ? items.filter((item) => item.result === 'incorrect').map((item) => item.itemId)
        : [],
    conditions: attempt.conditions,
    priorExposure: attempt.priorExposure,
    editorialAtStart: attempt.editorialAtStart,
    incompleteAudioIds: attempt.audio
      .filter((audio) => audio.status !== 'ended')
      .map((audio) => audio.media.id),
    officialScore: null,
    passPrediction: null,
    certification: 'none',
  });
}
