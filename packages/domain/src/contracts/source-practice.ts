/** Explicit, source-bound wording retrieval and free production.
 *
 * A cloze tests the wording at ONE occurrence, not semantic equivalence. A
 * different valid paraphrase is not a language error. Free production has a
 * versioned rubric and never goes through the cloze grader or directly to FSRS.
 * The caller must verify source bytes/permission before confirming this plan.
 */
import { z } from 'zod';
import type { DomainContext } from '../context/index.ts';
import { createDomainEvent } from '../events/factories.ts';
import { parseEvent } from '../events/parse.ts';
import { mintReviewGraded, mintProductionObserved } from '../evidence/mint.ts';
import { admitToScheduler } from '../evidence/gate.ts';
import { buildTargetThreadIndex } from './thread-link.ts';
import { retrievalContractFromEvent } from './retrieval-contract.ts';
import type {
  ContractCreatedEvent,
  EncounterCapturedEvent,
  ThreadPromotionChangedEvent,
} from '../events/catalog.ts';
import type { Grade } from '../events/shared.ts';

function wellFormed(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
const prose = z
  .string()
  .min(1)
  .max(4000)
  .refine((text) => wellFormed(text) && text.trim().length > 0);
const originFields = {
  contextRef: z.string().regex(/^teacher-context:[0-9a-f]{64}$/u),
  sourceId: z.string().min(1).max(500),
  sourceDigest: z.string().regex(/^[0-9a-f]{64}$/u),
  text: prose,
  start: z.number().int().min(0),
  end: z.number().int().min(1),
  title: z.string().min(1).max(500),
  attribution: z.string().max(1000),
};
// Existing text-source events retain their exact shape. A bundled encounter
// names token coordinates separately from character offsets inside its quote.
const tokenSpanSchema = z
  .strictObject({
    unit: z.literal('token-index'),
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    index: z.number().int().min(0),
    surfaces: z.array(z.string().max(4000).refine(wellFormed)).min(1).max(4000),
  })
  .refine(
    (span) =>
      span.end - span.start === span.surfaces.length &&
      span.index >= span.start &&
      span.index < span.end,
  );
const originSchema = z
  .union([
    z.strictObject({
      contextRef: originFields.contextRef,
      sourceId: originFields.sourceId,
      sourceDigest: originFields.sourceDigest,
      text: originFields.text,
      sentenceStart: z.number().int().min(0),
      start: originFields.start,
      end: originFields.end,
      title: originFields.title,
      attribution: originFields.attribution,
    }),
    z.strictObject({ ...originFields, tokenSpan: tokenSpanSchema }),
  ])
  .refine(
    (value) =>
      value.start < value.end &&
      value.end <= value.text.length &&
      wellFormed(value.text.slice(value.start, value.end)) &&
      value.text.slice(value.start, value.end).trim().length > 0 &&
      value.end - value.start <= 200,
    {
      message:
        'Choose a complete, nonblank phrase of at most 200 UTF-16 units inside the source sentence',
    },
  )
  .refine(
    (value) => {
      if (!('tokenSpan' in value)) return true;
      const span = value.tokenSpan,
        offset = span.index - span.start;
      const start = span.surfaces.slice(0, offset).join('').length;
      return (
        span.surfaces.join('') === value.text &&
        value.start === start &&
        value.end === start + span.surfaces[offset]!.length
      );
    },
    { message: 'The selected wording must be the exact encountered token in its sentence' },
  );

export type SourcePracticeOrigin = z.infer<typeof originSchema>;
export type SourcePracticeMode = 'cloze' | 'production' | 'listening';
const listeningCueSchema = z.strictObject({
  version: z.literal(1),
  path: z.string().min(1).max(700),
  sha256: z.string().regex(/^[0-9a-f]{64}$/u),
  bytes: z.number().int().min(1).max(10_000_000),
  sentenceIndex: z.number().int().min(0).max(100_000),
  voice: z.literal('ami'),
  alignment: z.literal('sentence-order'),
  transcriptStatus: z.literal('unreviewed'),
});
export type SourceListeningCue = z.infer<typeof listeningCueSchema>;
/** A coherent descriptor is not editorial review or permission to fetch a URL.
 * The caller must resolve the installed source/catalog and verify actual bytes. */
export function parseSourceListeningCue(
  raw: unknown,
  origin: SourcePracticeOrigin,
): SourceListeningCue {
  const cue = listeningCueSchema.parse(raw);
  if (
    !('tokenSpan' in origin) ||
    !/^[A-Za-z0-9][A-Za-z0-9:_-]*$/u.test(origin.sourceId) ||
    cue.path !==
      `audio/s/ami/${origin.sourceId.replaceAll(':', '_')}-${String(cue.sentenceIndex).padStart(3, '0')}.m4a`
  )
    throw new TypeError('invalid-listening-cue');
  return cue;
}
export interface SourcePracticePlan {
  readonly version: 1;
  readonly id: string;
  readonly origin: SourcePracticeOrigin;
  readonly capture: EncounterCapturedEvent;
  /** Later contracts and source occurrences reference the original promotion. */
  readonly confirmation: ThreadPromotionChangedEvent;
  readonly contracts: readonly ContractCreatedEvent[];
  readonly listeningCue?: SourceListeningCue;
}

export const SOURCE_PRODUCTION_RUBRIC = Object.freeze({
  id: 'kairo-source-production',
  version: '1',
  prompt: 'Use the selected expression to say something of your own in Japanese.',
  criteria: Object.freeze([
    'The response expresses the intended idea.',
    'The selected expression is used appropriately.',
    'Grammar and register suit the intended situation.',
  ]),
  automaticAssessment: false,
});
export const SOURCE_LISTENING_RUBRIC = Object.freeze({
  id: 'kairo-source-listening',
  version: '1',
  prompt: 'Listen to this sentence, then explain what you understood in your own words.',
  criteria: Object.freeze([
    'The response identifies the meaning of the spoken sentence.',
    'Details and uncertainty are represented faithfully.',
  ]),
  automaticAssessment: false,
});

export function normalizeSourceWording(text: string): string {
  return text.normalize('NFC').trim();
}

function planIdentity(origin: SourcePracticeOrigin): string {
  return `source-practice:${origin.contextRef}:${origin.start}:${origin.end}:v1`;
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aa = a as Record<string, unknown>,
    bb = b as Record<string, unknown>;
  return (
    Object.keys(aa).length === Object.keys(bb).length &&
    Object.keys(aa).every((key) => Object.hasOwn(bb, key) && equal(aa[key], bb[key]))
  );
}

function masterConfirmation(context: DomainContext, threadId: string) {
  return createDomainEvent(
    context,
    'ThreadPromotionChanged',
    {
      threadId,
      from: 'captured',
      to: 'master',
      origin: 'user',
    },
    { idempotencyKey: `${threadId}:master:confirm` },
  );
}

function definition(
  origin: SourcePracticeOrigin,
  mode: SourcePracticeMode,
  cue?: SourceListeningCue,
) {
  const answer = origin.text.slice(origin.start, origin.end);
  const rubric = mode === 'listening' ? SOURCE_LISTENING_RUBRIC : SOURCE_PRODUCTION_RUBRIC;
  return {
    contractId: `${planIdentity(origin)}:${mode}`,
    contractVersion: 1,
    targetComponentId: `kc:${answer}`,
    skill:
      mode === 'cloze'
        ? ('discrimination' as const)
        : mode === 'listening'
          ? ('audio_to_meaning' as const)
          : ('meaning_to_production' as const),
    cueModality: mode === 'listening' ? ('audio' as const) : ('text' as const),
    responseModality: mode === 'cloze' ? ('text' as const) : ('free' as const),
    ...(mode === 'cloze'
      ? { acceptedAnswers: [normalizeSourceWording(answer)] }
      : { rubricId: rubric.id, rubricVersion: rubric.version }),
    hintPolicy: { hintsAllowed: false, maxHints: 0 },
    revealPolicy: { revealAllowed: true, revealIsRecorded: true as const },
    promptFamilyVersion:
      mode === 'cloze'
        ? 'source-wording-nfc-trim@1'
        : mode === 'listening'
          ? `source-listening-explain@1:${cue!.sha256}:${cue!.bytes}:${cue!.sentenceIndex}`
          : 'source-personal-production@1',
  };
}

export function createSourcePracticePlan(
  context: DomainContext,
  raw: unknown,
  modes: readonly SourcePracticeMode[],
  priorConfirmation?: ThreadPromotionChangedEvent,
  rawListeningCue?: unknown,
): SourcePracticePlan {
  const origin = originSchema.parse(raw);
  if (
    !modes.length ||
    modes.length > 3 ||
    new Set(modes).size !== modes.length ||
    modes.some((mode) => !['cloze', 'production', 'listening'].includes(mode))
  )
    throw new TypeError('invalid-practice-modes');
  const listeningCue = modes.includes('listening')
    ? parseSourceListeningCue(rawListeningCue, origin)
    : undefined;
  if (!listeningCue && rawListeningCue !== undefined)
    throw new TypeError('listening-mode-not-confirmed');
  const id = planIdentity(origin),
    target = origin.text.slice(origin.start, origin.end);
  // Repeated wording has one component/thread, while each occurrence has an
  // explicit source edge. Never infer an origin by picking the first capture.
  const threadId = `thread:source-practice:${encodeURIComponent(target)}`;
  const capture = createDomainEvent(
    context,
    'EncounterCaptured',
    {
      encounterId: `${id}:encounter`,
      threadId,
      text: origin.text,
      span: { start: origin.start, end: origin.end },
      sourceRef: {
        sourceId: origin.sourceId,
        kind: 'text',
        locator:
          'tokenSpan' in origin
            ? `${origin.contextRef}#token=${origin.tokenSpan.index};sentence-utf16=${origin.start},${origin.end}`
            : `${origin.contextRef}#utf16=${origin.sentenceStart + origin.start},${origin.sentenceStart + origin.end}`,
      },
      provenance: {
        source: origin.sourceId,
        sourceVersion: origin.sourceDigest,
        license: 'unverified',
        attribution: origin.attribution,
        modificationStatus: 'unmodified',
        reviewStatus: 'unreviewed',
      },
    },
    { idempotencyKey: `${id}:encounter` },
  );
  let confirmation: ThreadPromotionChangedEvent;
  if (priorConfirmation !== undefined) {
    const prior = parseEvent(priorConfirmation);
    const expected = masterConfirmation(
      {
        clock: { now: () => prior.occurredAt },
        ids: { nextId: () => prior.eventId },
        random: { nextUnitInterval: () => 0 },
      },
      threadId,
    );
    if (!equal(prior, expected)) throw new TypeError('invalid-source-promotion');
    confirmation = expected;
  } else {
    confirmation = masterConfirmation(context, threadId);
  }
  const contracts = modes.map((mode) =>
    createDomainEvent(context, 'ContractCreated', definition(origin, mode, listeningCue), {
      idempotencyKey: `${id}:${mode}:create`,
    }),
  );
  return {
    version: 1,
    id,
    origin,
    capture,
    confirmation,
    contracts,
    ...(listeningCue ? { listeningCue } : {}),
  };
}

/** An imported id cannot bless altered prompts, answers, modality or lineage. */
export function parseSourcePracticePlan(raw: unknown): SourcePracticePlan {
  const shape = z
    .strictObject({
      version: z.literal(1),
      id: z.string(),
      origin: originSchema,
      capture: z.unknown(),
      confirmation: z.unknown(),
      contracts: z.array(z.unknown()).min(1).max(3),
      listeningCue: listeningCueSchema.optional(),
    })
    .parse(raw);
  const capture = parseEvent(shape.capture),
    confirmation = parseEvent(shape.confirmation);
  const contracts = shape.contracts.map(parseEvent);
  if (
    capture.type !== 'EncounterCaptured' ||
    confirmation.type !== 'ThreadPromotionChanged' ||
    contracts.some((event) => event.type !== 'ContractCreated')
  )
    throw new TypeError('invalid-practice-events');
  const typedContracts = contracts as ContractCreatedEvent[];
  const modes = typedContracts.map((event): SourcePracticeMode => {
    if (event.contractId === `${shape.id}:cloze`) return 'cloze';
    if (event.contractId === `${shape.id}:production`) return 'production';
    if (event.contractId === `${shape.id}:listening`) return 'listening';
    throw new TypeError('invalid-practice-contract');
  });
  const observed = [capture, ...typedContracts];
  let next = 0;
  const expected = createSourcePracticePlan(
    {
      clock: { now: () => observed[next - 1]!.occurredAt },
      ids: { nextId: () => observed[next++]!.eventId },
      random: { nextUnitInterval: () => 0 },
    },
    shape.origin,
    modes,
    confirmation,
    shape.listeningCue,
  );
  if (
    !equal(shape, expected) ||
    new Set([...observed, confirmation].map((event) => event.eventId)).size !== observed.length + 1
  )
    throw new TypeError('source-practice-binding-mismatch');
  for (const event of typedContracts)
    if (!retrievalContractFromEvent(event).valid) throw new TypeError('invalid-practice-contract');
  return expected;
}

export function sourcePracticeContract(
  raw: unknown,
  mode: SourcePracticeMode,
): ContractCreatedEvent {
  const plan = parseSourcePracticePlan(raw);
  const contract = plan.contracts.find((event) => event.contractId === `${plan.id}:${mode}`);
  if (!contract) throw new TypeError('practice-mode-not-confirmed');
  return contract;
}

export function checkSourceCloze(raw: unknown, response: string, revealed: boolean) {
  const contract = sourcePracticeContract(raw, 'cloze');
  if (
    typeof response !== 'string' ||
    !wellFormed(response) ||
    response.length > 1000 ||
    typeof revealed !== 'boolean'
  )
    throw new TypeError('invalid-cloze-response');
  const matchesWording = normalizeSourceWording(response) === contract.acceptedAnswers![0];
  return {
    matchesWording,
    revealedBeforeRecall: revealed,
    mustRepeat: revealed || !matchesWording,
  };
}

export function gradeSourceCloze(
  context: DomainContext,
  raw: unknown,
  input: {
    response: string;
    revealed: boolean;
    grade: Grade;
    latencyMs: number;
    responseId: string;
  },
) {
  if (!['again', 'hard', 'good', 'easy'].includes(input.grade) || !input.responseId)
    throw new TypeError('invalid-cloze-grade');
  const plan = parseSourcePracticePlan(raw),
    event = sourcePracticeContract(plan, 'cloze');
  const checked = checkSourceCloze(plan, input.response, input.revealed);
  const observation = mintReviewGraded(
    context,
    {
      contractId: event.contractId,
      grade: checked.mustRepeat ? 'again' : input.grade,
      latencyMs: input.latencyMs,
      hintsUsed: 0,
      revealedBeforeRecall: input.revealed,
      ...(input.grade === 'easy' && !checked.mustRepeat
        ? { userConfirmedEasy: true as const }
        : {}),
      probeContext: 'standalone',
    },
    { idempotencyKey: `${input.responseId}:grade` },
  );
  const entity = retrievalContractFromEvent(event);
  if (!entity.valid) throw new TypeError('invalid-practice-contract');
  const gate = admitToScheduler(observation, {
    contracts: new Map([[event.contractId, entity.contract]]),
    invalidContractIds: new Set(),
    threadIndex: buildTargetThreadIndex([plan.capture]),
    promotionByThread: new Map([[plan.confirmation.threadId, plan.confirmation.to]]),
    deletedThreadIds: new Set(),
    supersededEventIds: new Set(),
  });
  if (!gate.admitted) throw new TypeError(`cloze-evidence-refused:${gate.reason}`);
  return { observation, grade: gate.effectiveGrade, checked };
}

export function observeSourceProduction(context: DomainContext, raw: unknown, responseId: string) {
  const contract = sourcePracticeContract(raw, 'production');
  return mintProductionObserved(
    context,
    {
      contractId: contract.contractId,
      rubricId: contract.rubricId!,
      rubricVersion: contract.rubricVersion!,
      elicited: true,
      tier: 'B',
    },
    { idempotencyKey: `${responseId}:production` },
  );
}

/** Elicited free writing after an audio cue remains unchecked tier B. The
 * existing scheduler gate refuses it; playback is never a comprehension grade. */
export function observeSourceListening(context: DomainContext, raw: unknown, responseId: string) {
  const contract = sourcePracticeContract(raw, 'listening');
  return mintProductionObserved(
    context,
    {
      contractId: contract.contractId,
      rubricId: contract.rubricId!,
      rubricVersion: contract.rubricVersion!,
      elicited: true,
      tier: 'B',
    },
    { idempotencyKey: `${responseId}:listening` },
  );
}

export type SourceTokenOrigin = Extract<SourcePracticeOrigin, { tokenSpan: unknown }>;

/** An exact whole-token annotation, not an editorially approved reading or a
 * character-level answer. The focus glyph only records the exploration link. */
export interface SourceKanjiReadingCue {
  readonly version: 1;
  readonly focusKanji: string;
  readonly token: { readonly s: string; readonly b: string; readonly r: string };
  readonly rubySource: string;
  readonly reviewStatus: 'unreviewed';
}

export interface SourceKanjiReadingPlan {
  readonly version: 2;
  readonly kind: 'kanji-reading';
  readonly id: string;
  readonly origin: SourceTokenOrigin;
  readonly readingCue: SourceKanjiReadingCue;
  readonly capture: EncounterCapturedEvent;
  /** A sibling contract references the original component/thread promotion. */
  readonly confirmation: ThreadPromotionChangedEvent;
  readonly contracts: readonly [ContractCreatedEvent];
}

const readingTokenText = z
  .string()
  .min(1)
  .max(200)
  .refine((text) => wellFormed(text) && text.trim().length > 0);
const kanjiReadingCueSchema = z
  .strictObject({
    version: z.literal(1),
    focusKanji: z.string().regex(/^\p{Script=Han}$/u),
    token: z.strictObject({
      s: readingTokenText,
      b: readingTokenText,
      r: readingTokenText.refine((text) =>
        /^[\p{Script=Hiragana}\p{Script=Katakana}\u3099\u309a\u30fc]+$/u.test(
          text.normalize('NFC'),
        ),
      ),
    }),
    rubySource: z
      .string()
      .min(1)
      .max(160)
      .refine((text) => wellFormed(text) && text.trim().length > 0),
    reviewStatus: z.literal('unreviewed'),
  })
  .refine((cue) => cue.token.s.includes(cue.focusKanji), {
    message: 'The focus must be one Han code point in the exact whole-token surface',
  });

function parseSourceTokenOrigin(raw: unknown): SourceTokenOrigin {
  const origin = originSchema.parse(raw);
  if (!('tokenSpan' in origin)) throw new TypeError('invalid-kanji-reading-origin');
  return origin;
}

/** Validate a prospective annotation without creating events or confirming it.
 * Current article equality and source admission are still the caller's checks. */
export function parseSourceKanjiReadingCue(
  raw: unknown,
  rawOrigin: unknown,
): SourceKanjiReadingCue {
  const origin = parseSourceTokenOrigin(rawOrigin),
    cue = kanjiReadingCueSchema.parse(raw);
  if (
    cue.token.s !== origin.text.slice(origin.start, origin.end) ||
    cue.token.s !== origin.tokenSpan.surfaces[origin.tokenSpan.index - origin.tokenSpan.start]
  )
    throw new TypeError('invalid-kanji-reading-origin');
  return cue;
}

/** Version 1 folds only ordinary full-width katakana and iteration marks.
 * Long vowels, small kana, half-width forms and phonetic alternatives stay
 * distinct. The raw annotation remains unchanged in the plan and its id. */
function normalizeSourceTokenReading(text: string): string {
  return text
    .normalize('NFC')
    .trim()
    .replace(/[\u30a1-\u30f6\u30fd\u30fe]/gu, (kana) =>
      String.fromCharCode(kana.charCodeAt(0) - 0x60),
    );
}

function kanjiReadingIdentity(origin: SourceTokenOrigin, cue: SourceKanjiReadingCue): string {
  const tuple = JSON.stringify([
    1,
    cue.focusKanji,
    cue.token.s,
    cue.token.b,
    cue.token.r,
    cue.rubySource,
    cue.reviewStatus,
  ]);
  return `source-kanji-reading:${origin.contextRef}:${origin.start}:${origin.end}:v1:${encodeURIComponent(tuple)}`;
}

/** The caller verifies current source bytes and permission before confirmation.
 * This pure constructor binds the supplied facts; it cannot approve the source. */
export function createSourceKanjiReadingPlan(
  context: DomainContext,
  rawOrigin: unknown,
  rawReadingCue: unknown,
  priorConfirmation?: ThreadPromotionChangedEvent,
): SourceKanjiReadingPlan {
  const origin = parseSourceTokenOrigin(rawOrigin),
    readingCue = parseSourceKanjiReadingCue(rawReadingCue, origin);
  const id = kanjiReadingIdentity(origin, readingCue);
  const threadId = `thread:source-practice:${encodeURIComponent(readingCue.token.s)}`;
  const capture = createDomainEvent(
    context,
    'EncounterCaptured',
    {
      encounterId: `${id}:encounter`,
      threadId,
      text: origin.text,
      span: { start: origin.start, end: origin.end },
      sourceRef: {
        sourceId: origin.sourceId,
        kind: 'text',
        locator: `${origin.contextRef}#token=${origin.tokenSpan.index};sentence-utf16=${origin.start},${origin.end}`,
      },
      provenance: {
        source: origin.sourceId,
        sourceVersion: origin.sourceDigest,
        license: 'unverified',
        attribution: origin.attribution,
        modificationStatus: 'unmodified',
        reviewStatus: 'unreviewed',
      },
    },
    { idempotencyKey: `${id}:encounter` },
  );
  let confirmation: ThreadPromotionChangedEvent;
  if (priorConfirmation !== undefined) {
    const prior = parseEvent(priorConfirmation);
    const expected = masterConfirmation(
      {
        clock: { now: () => prior.occurredAt },
        ids: { nextId: () => prior.eventId },
        random: { nextUnitInterval: () => 0 },
      },
      threadId,
    );
    if (!equal(prior, expected)) throw new TypeError('invalid-source-promotion');
    confirmation = expected;
  } else {
    confirmation = masterConfirmation(context, threadId);
  }
  const contract = createDomainEvent(
    context,
    'ContractCreated',
    {
      contractId: `${id}:kanji-reading`,
      contractVersion: 1,
      targetComponentId: `kc:${readingCue.token.s}`,
      skill: 'orthography_to_reading',
      cueModality: 'text',
      responseModality: 'text',
      acceptedAnswers: [normalizeSourceTokenReading(readingCue.token.r)],
      hintPolicy: { hintsAllowed: false, maxHints: 0 },
      revealPolicy: { revealAllowed: true, revealIsRecorded: true },
      promptFamilyVersion: 'source-token-reading-nfc-kana-fold@1',
    },
    { idempotencyKey: `${id}:kanji-reading:create` },
  );
  return {
    version: 2,
    kind: 'kanji-reading',
    id,
    origin,
    readingCue,
    capture,
    confirmation,
    contracts: [contract],
  };
}

/** Saved history is checked against its own exact facts, with no current
 * article lookup. Prospective source verification belongs to the caller. */
export function parseSourceKanjiReadingPlan(raw: unknown): SourceKanjiReadingPlan {
  const shape = z
    .strictObject({
      version: z.literal(2),
      kind: z.literal('kanji-reading'),
      id: z.string(),
      origin: originSchema,
      readingCue: kanjiReadingCueSchema,
      capture: z.unknown(),
      confirmation: z.unknown(),
      contracts: z.tuple([z.unknown()]),
    })
    .parse(raw);
  const capture = parseEvent(shape.capture),
    confirmation = parseEvent(shape.confirmation);
  const contract = parseEvent(shape.contracts[0]);
  if (
    capture.type !== 'EncounterCaptured' ||
    confirmation.type !== 'ThreadPromotionChanged' ||
    contract.type !== 'ContractCreated'
  )
    throw new TypeError('invalid-kanji-reading-events');
  const observed = [capture, contract];
  let next = 0;
  const expected = createSourceKanjiReadingPlan(
    {
      clock: { now: () => observed[next - 1]!.occurredAt },
      ids: { nextId: () => observed[next++]!.eventId },
      random: { nextUnitInterval: () => 0 },
    },
    shape.origin,
    shape.readingCue,
    confirmation,
  );
  if (
    !equal(shape, expected) ||
    new Set([...observed, confirmation].map((event) => event.eventId)).size !== 3
  )
    throw new TypeError('source-kanji-reading-binding-mismatch');
  if (!retrievalContractFromEvent(contract).valid)
    throw new TypeError('invalid-kanji-reading-contract');
  return expected;
}

/** Matching means retrieval of this unreviewed whole-token annotation only. */
export function checkSourceKanjiReading(raw: unknown, response: string, revealed: boolean) {
  const plan = parseSourceKanjiReadingPlan(raw);
  if (
    typeof response !== 'string' ||
    !wellFormed(response) ||
    response.length > 1000 ||
    typeof revealed !== 'boolean'
  )
    throw new TypeError('invalid-kanji-reading-response');
  const matchesReading =
    normalizeSourceTokenReading(response) === plan.contracts[0].acceptedAnswers![0];
  return {
    matchesReading,
    revealedBeforeRecall: revealed,
    mustRepeat: revealed || !matchesReading,
  };
}

export function gradeSourceKanjiReading(
  context: DomainContext,
  raw: unknown,
  input: {
    response: string;
    revealed: boolean;
    grade: Grade;
    latencyMs: number;
    responseId: string;
  },
) {
  if (!['again', 'hard', 'good', 'easy'].includes(input.grade) || !input.responseId)
    throw new TypeError('invalid-kanji-reading-grade');
  const plan = parseSourceKanjiReadingPlan(raw),
    event = plan.contracts[0];
  const checked = checkSourceKanjiReading(plan, input.response, input.revealed);
  const observation = mintReviewGraded(
    context,
    {
      contractId: event.contractId,
      grade: checked.mustRepeat ? 'again' : input.grade,
      latencyMs: input.latencyMs,
      hintsUsed: 0,
      revealedBeforeRecall: input.revealed,
      ...(input.grade === 'easy' && !checked.mustRepeat
        ? { userConfirmedEasy: true as const }
        : {}),
      probeContext: 'standalone',
    },
    { idempotencyKey: `${input.responseId}:grade` },
  );
  const entity = retrievalContractFromEvent(event);
  if (!entity.valid) throw new TypeError('invalid-kanji-reading-contract');
  const gate = admitToScheduler(observation, {
    contracts: new Map([[event.contractId, entity.contract]]),
    invalidContractIds: new Set(),
    threadIndex: buildTargetThreadIndex([plan.capture]),
    promotionByThread: new Map([[plan.confirmation.threadId, plan.confirmation.to]]),
    deletedThreadIds: new Set(),
    supersededEventIds: new Set(),
  });
  if (!gate.admitted) throw new TypeError(`kanji-reading-evidence-refused:${gate.reason}`);
  return { observation, grade: gate.effectiveGrade, checked };
}
