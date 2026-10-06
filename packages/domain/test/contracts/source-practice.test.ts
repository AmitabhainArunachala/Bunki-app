import { describe, expect, it } from 'vitest';
import {
  createSourcePracticePlan,
  parseSourcePracticePlan,
  checkSourceCloze,
  gradeSourceCloze,
  observeSourceProduction,
  observeSourceListening,
  sourcePracticeContract,
} from '../../src/contracts/source-practice.ts';
import { admitToScheduler } from '../../src/evidence/gate.ts';
import { replay } from '../../src/replay/replay.ts';
import type { EvidenceGateContext } from '../../src/evidence/gate.ts';

const at = '2026-09-13T00:00:00.000Z';
function context(prefix = 'event') {
  let id = 0;
  return {
    clock: { now: () => at },
    ids: { nextId: () => `${prefix}:${id++}` },
    random: { nextUnitInterval: () => 0 },
  };
}
const origin = {
  contextRef: `teacher-context:${'a'.repeat(64)}`,
  sourceId: 'fixture-reading',
  sourceDigest: 'b'.repeat(64),
  text: '町の図書館で本を読みます。',
  sentenceStart: 12,
  start: 0,
  end: 1,
  title: '図書館での一日',
  attribution: 'Learner supplied; synthetic fixture',
};
const plan = () => createSourcePracticePlan(context(), origin, ['cloze', 'production']);
const listeningOrigin = {
  contextRef: origin.contextRef,
  sourceId: 'bundled-fixture',
  sourceDigest: origin.sourceDigest,
  text: '窓を開けます。',
  start: 0,
  end: 1,
  title: '窓',
  attribution: 'Synthetic fixture',
  tokenSpan: {
    unit: 'token-index' as const,
    start: 9,
    end: 14,
    index: 9,
    surfaces: ['窓', 'を', '開け', 'ます', '。'],
  },
};
const cue = {
  version: 1,
  path: 'audio/s/ami/bundled-fixture-001.m4a',
  sha256: 'c'.repeat(64),
  bytes: 9000,
  sentenceIndex: 1,
  voice: 'ami',
  alignment: 'sentence-order',
  transcriptStatus: 'unreviewed',
};

describe('explicit source wording and production contracts', () => {
  it('binds listening to an audio/free rubric without confounding text recall or claiming comprehension', () => {
    const value = createSourcePracticePlan(
      context(),
      listeningOrigin,
      ['cloze', 'production', 'listening'],
      undefined,
      cue,
    );
    expect(parseSourcePracticePlan(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(sourcePracticeContract(value, 'listening')).toMatchObject({
      skill: 'audio_to_meaning',
      cueModality: 'audio',
      responseModality: 'free',
      rubricId: 'kairo-source-listening',
      rubricVersion: '1',
    });
    expect(sourcePracticeContract(value, 'cloze').cueModality).toBe('text');
    const observed = observeSourceListening(context('heard'), value, 'response-listening');
    expect(observed).toMatchObject({
      type: 'ProductionObserved',
      tier: 'B',
      elicited: true,
      rubricId: 'kairo-source-listening',
    });
    expect(observed).not.toHaveProperty('grade');
    expect(admitToScheduler(observed, {} as EvidenceGateContext)).toMatchObject({
      admitted: false,
      reason: 'production_is_not_tier_a',
    });
    expect(() =>
      replay([value.capture, value.confirmation, ...value.contracts, observed]),
    ).not.toThrow();
  });
  it('refuses absent, external, shifted and editorially promoted listening descriptors', () => {
    expect(() => createSourcePracticePlan(context(), listeningOrigin, ['listening'])).toThrow();
    expect(() =>
      createSourcePracticePlan(context(), origin, ['listening'], undefined, cue),
    ).toThrow();
    expect(() =>
      createSourcePracticePlan(context(), listeningOrigin, ['cloze'], undefined, cue),
    ).toThrow();
    for (const change of [
      { path: 'https://example.com/clip.m4a' },
      { path: '../clip.m4a' },
      { sentenceIndex: 2 },
      { bytes: 0 },
      { sha256: 'invalid' },
      { transcriptStatus: 'reviewed' },
      { alignment: 'verified' },
    ])
      expect(() =>
        createSourcePracticePlan(context(), listeningOrigin, ['listening'], undefined, {
          ...cue,
          ...change,
        }),
      ).toThrow();
  });
  it('cannot bless changed clip bytes or modality by retaining a listening contract id', () => {
    const value = createSourcePracticePlan(
      context(),
      listeningOrigin,
      ['listening'],
      undefined,
      cue,
    );
    for (const change of [{ sha256: 'd'.repeat(64) }, { bytes: 8999 }])
      expect(() =>
        parseSourcePracticePlan({ ...value, listeningCue: { ...cue, ...change } }),
      ).toThrow();
    expect(() =>
      parseSourcePracticePlan({
        ...value,
        contracts: [{ ...value.contracts[0], cueModality: 'text' }],
      }),
    ).toThrow();
    expect(() => observeSourceListening(context(), plan(), 'unconfirmed')).toThrow();
  });
  it('preserves the existing text-origin serialization', () => {
    expect(JSON.stringify(plan().origin)).toBe(JSON.stringify(origin));
  });
  it('keeps a bundled token occurrence separate from UTF-16 offsets, including repeated wording and an emoji', () => {
    const { sentenceStart: _start, ...fields } = origin;
    const bundled = {
      ...fields,
      text: '🚀の窓と窓。',
      start: 5,
      end: 6,
      tokenSpan: {
        unit: 'token-index',
        start: 8,
        end: 14,
        index: 12,
        surfaces: ['🚀', 'の', '窓', 'と', '窓', '。'],
      },
    };
    const value = createSourcePracticePlan(context(), bundled, ['cloze', 'production']);
    expect(parseSourcePracticePlan(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(value.capture.sourceRef.locator).toBe(
      `${origin.contextRef}#token=12;sentence-utf16=5,6`,
    );
    expect(value.capture.span).toEqual({ start: 5, end: 6 });
    expect(value.contracts[0]?.acceptedAnswers).toEqual(['窓']);
    const observation = gradeSourceCloze(context('grade'), value, {
      response: '窓',
      revealed: false,
      grade: 'good',
      latencyMs: 230,
      responseId: 'bundled-response',
    }).observation;
    expect(() =>
      replay([value.capture, value.confirmation, ...value.contracts, observation]),
    ).not.toThrow();
    expect(
      admitToScheduler(
        observeSourceProduction(context('written'), value, 'written-response'),
        {} as EvidenceGateContext,
      ),
    ).toMatchObject({ admitted: false, reason: 'production_is_not_tier_a' });
  });
  it('rejects mixed coordinates, shifted occurrences, partial tokens and malformed token boundaries', () => {
    const { sentenceStart: _start, ...fields } = origin;
    const bundled = {
      ...fields,
      text: '窓を開けます。',
      start: 2,
      end: 4,
      tokenSpan: {
        unit: 'token-index',
        start: 7,
        end: 12,
        index: 9,
        surfaces: ['窓', 'を', '開け', 'ます', '。'],
      },
    };
    expect(
      createSourcePracticePlan(context(), bundled, ['cloze']).contracts[0]?.acceptedAnswers,
    ).toEqual(['開け']);
    for (const altered of [
      { ...bundled, sentenceStart: 7 },
      { ...bundled, start: 2, end: 3 },
      { ...bundled, tokenSpan: { ...bundled.tokenSpan, index: 8 } },
      { ...bundled, tokenSpan: { ...bundled.tokenSpan, unit: 'utf16-code-unit' } },
      { ...bundled, tokenSpan: { ...bundled.tokenSpan, end: 13 } },
      {
        ...bundled,
        text: '🚀を開けます。',
        tokenSpan: {
          ...bundled.tokenSpan,
          end: 13,
          surfaces: ['\ud83d', '\ude80', 'を', '開け', 'ます', '。'],
        },
      },
    ])
      expect(() => createSourcePracticePlan(context(), altered, ['cloze'])).toThrow();
  });
  it('pins source occurrence, versioned wording policy, rubric, and explicit Master choice', () => {
    const value = plan();
    expect(parseSourcePracticePlan(JSON.parse(JSON.stringify(value)))).toEqual(value);
    expect(value.capture.sourceRef.locator).toBe(`${origin.contextRef}#utf16=12,13`);
    expect(value.confirmation).toMatchObject({
      type: 'ThreadPromotionChanged',
      from: 'captured',
      to: 'master',
      origin: 'user',
    });
    expect(value.contracts[0]).toMatchObject({
      skill: 'discrimination',
      responseModality: 'text',
      acceptedAnswers: ['町'],
      promptFamilyVersion: 'source-wording-nfc-trim@1',
    });
    expect(value.contracts[1]).toMatchObject({
      skill: 'meaning_to_production',
      responseModality: 'free',
      rubricId: 'kairo-source-production',
      rubricVersion: '1',
    });
    expect(value.contracts[1]).not.toHaveProperty('acceptedAnswers');
  });
  it('keeps identities stable across clocks/ids, while distinct occurrences cannot share a card', () => {
    const first = plan(),
      other = createSourcePracticePlan(context('other'), origin, ['cloze', 'production']);
    expect(other.id).toBe(first.id);
    expect(other.contracts[0]?.eventId).not.toBe(first.contracts[0]?.eventId);
    const later = createSourcePracticePlan(
      context('later'),
      { ...origin, contextRef: `teacher-context:${'c'.repeat(64)}` },
      ['cloze'],
      first.confirmation,
    );
    expect(later.id).not.toBe(first.id);
    expect(later.capture.threadId).toBe(first.capture.threadId);
    expect(later.confirmation).toEqual(first.confirmation);
    expect(() =>
      replay([
        first.capture,
        first.confirmation,
        ...first.contracts,
        later.capture,
        ...later.contracts,
      ]),
    ).not.toThrow();
  });
  it.each([
    'acceptedAnswers',
    'promptFamilyVersion',
    'responseModality',
    'targetComponentId',
  ] as const)('refuses an unchanged id with altered %s', (field) => {
    const value = JSON.parse(JSON.stringify(plan()));
    value.contracts[0][field] = field === 'acceptedAnswers' ? ['村'] : 'changed';
    expect(() => parseSourcePracticePlan(value)).toThrow();
  });
  it('refuses invented authority, unknown fields, duplicate modes and an unchosen practice mode', () => {
    const value = JSON.parse(JSON.stringify(plan()));
    value.confirmation.origin = 'automatic';
    expect(() => parseSourcePracticePlan(value)).toThrow();
    expect(() => parseSourcePracticePlan({ ...plan(), approved: true })).toThrow();
    expect(() => createSourcePracticePlan(context(), origin, ['cloze', 'cloze'])).toThrow();
    expect(() => createSourcePracticePlan(context(), origin, [])).toThrow();
    expect(() =>
      Reflect.apply(createSourcePracticePlan, null, [context(), origin, ['cloze'], 'noticed']),
    ).toThrow();
    expect(() =>
      sourcePracticeContract(createSourcePracticePlan(context(), origin, ['production']), 'cloze'),
    ).toThrow();
  });
  it('adds a later contract using the original promotion and replays without a Master to Master no-op', () => {
    const first = createSourcePracticePlan(context(), origin, ['production']);
    const later = createSourcePracticePlan(context('later'), origin, ['cloze'], first.confirmation);
    const combined = { ...first, contracts: [...first.contracts, ...later.contracts] };
    expect(parseSourcePracticePlan(combined)).toEqual(combined);
    expect(combined.contracts.map((event) => event.responseModality)).toEqual(['free', 'text']);
    expect(() => replay([first.capture, first.confirmation, ...combined.contracts])).not.toThrow();
    expect(() =>
      parseSourcePracticePlan({
        ...combined,
        confirmation: { ...combined.confirmation, from: 'master' },
      }),
    ).toThrow();
    expect(() =>
      createSourcePracticePlan(
        context('other'),
        { ...origin, text: '村の図書館で読む。' },
        ['cloze'],
        first.confirmation,
      ),
    ).toThrow();
  });
  it('checks exact NFC/trim wording without claiming semantic correctness', () => {
    expect(checkSourceCloze(plan(), ' 町\n', false)).toEqual({
      matchesWording: true,
      revealedBeforeRecall: false,
      mustRepeat: false,
    });
    expect(checkSourceCloze(plan(), '街', false)).toMatchObject({
      matchesWording: false,
      mustRepeat: true,
    });
    const combined = createSourcePracticePlan(
      context(),
      { ...origin, text: 'か\u3099好きです。', start: 0, end: 2 },
      ['cloze'],
    );
    expect(checkSourceCloze(combined, 'が', false).matchesWording).toBe(true);
    expect(checkSourceCloze(combined, 'か', false).matchesWording).toBe(false);
  });
  it('rejects split surrogate targets, malformed answers and missing/oversized source spans', () => {
    expect(() =>
      createSourcePracticePlan(context(), { ...origin, text: '🚀へ行く', end: 1 }, ['cloze']),
    ).toThrow();
    expect(() =>
      createSourcePracticePlan(context(), { ...origin, start: 99, end: 100 }, ['cloze']),
    ).toThrow();
    expect(() => checkSourceCloze(plan(), '\ud800', false)).toThrow();
    expect(() => checkSourceCloze(plan(), 'a'.repeat(1001), false)).toThrow();
  });
  it('uses the actual evidence gate: mismatch and reveal force Again; Easy records explicit confirmation', () => {
    const value = plan(),
      base = { responseId: 'response-1', latencyMs: 350, grade: 'easy' as const };
    for (const input of [
      { response: '村', revealed: false },
      { response: '町', revealed: true },
    ]) {
      const result = gradeSourceCloze(context('grade'), value, { ...base, ...input });
      expect(result.grade).toBe('again');
      expect(result.observation.grade).toBe('again');
      expect(result.observation).not.toHaveProperty('userConfirmedEasy');
    }
    const exact = gradeSourceCloze(context('correct'), value, {
      ...base,
      response: '町',
      revealed: false,
    });
    expect(exact.grade).toBe('easy');
    expect(exact.observation).toMatchObject({ tier: 'A', userConfirmedEasy: true, hintsUsed: 0 });
    expect(() =>
      replay([value.capture, value.confirmation, ...value.contracts, exact.observation]),
    ).not.toThrow();
  });
  it('mints elicited production without a grade; the kernel refuses it for FSRS', () => {
    const event = observeSourceProduction(context('production'), plan(), 'response-2');
    expect(event).toMatchObject({
      type: 'ProductionObserved',
      tier: 'B',
      elicited: true,
      rubricVersion: '1',
    });
    expect(event).not.toHaveProperty('grade');
    // The production branch rejects before consulting schedule context.
    expect(admitToScheduler(event, {} as EvidenceGateContext)).toMatchObject({
      admitted: false,
      reason: 'production_is_not_tier_a',
    });
  });
});
