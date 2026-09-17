import { describe, expect, it } from 'vitest';
import {
  checkSourceCloze, checkSourceKanjiReading, createSourceKanjiReadingPlan, createSourcePracticePlan,
  gradeSourceCloze, gradeSourceKanjiReading, observeSourceListening, observeSourceProduction,
  parseSourceKanjiReadingCue, parseSourceKanjiReadingPlan, parseSourcePracticePlan,
  type SourceKanjiReadingCue, type SourceTokenOrigin,
} from '../../src/contracts/source-practice.ts';
import { buildTargetThreadIndex, resolveComponentThread } from '../../src/contracts/thread-link.ts';
import { replay } from '../../src/replay/replay.ts';

const at = '2026-09-13T00:00:00.000Z';
function context(prefix = 'reading', time = at) {
  let id = 0;
  return { clock: { now: () => time }, ids: { nextId: () => `${prefix}:${id++}` },
    random: { nextUnitInterval: () => 0 } };
}
const origin: SourceTokenOrigin = {
  contextRef: `teacher-context:${'a'.repeat(64)}`, sourceId: 'bunki-graded-n5-morning',
  sourceDigest: 'b'.repeat(64), text: '窓を開けます。', start: 0, end: 1,
  title: '窓', attribution: 'Synthetic fixture',
  tokenSpan: { unit: 'token-index', start: 9, end: 14, index: 9, surfaces: ['窓', 'を', '開け', 'ます', '。'] },
};
const cue: SourceKanjiReadingCue = {
  version: 1, focusKanji: '窓', token: { s: '窓', b: '窓', r: 'まど' },
  rubySource: 'tokenizer', reviewStatus: 'unreviewed',
};
function wholeToken(surface: string): SourceTokenOrigin {
  return { ...origin, text: `${surface}。`, end: surface.length,
    tokenSpan: { unit: 'token-index', start: 9, end: 11, index: 9, surfaces: [surface, '。'] } };
}
const plan = () => createSourceKanjiReadingPlan(context(), origin, cue);
const input = { response: 'まど', revealed: false, grade: 'good' as const,
  latencyMs: 220, responseId: 'response-reading' };

describe('1. reading-only siblings preserve existing v1 serialization', () => {
  it('separates the reading plan and contract while preserving the original cloze bytes', () => {
    const cloze = createSourcePracticePlan(context('cloze'), origin, ['cloze', 'production']);
    const before = JSON.stringify(cloze);
    const reading = createSourceKanjiReadingPlan(context(), origin, cue, cloze.confirmation);
    expect(reading).toMatchObject({ version: 2, kind: 'kanji-reading', readingCue: cue });
    expect(reading.id).not.toBe(cloze.id);
    expect(reading.capture.encounterId).not.toBe(cloze.capture.encounterId);
    expect(reading.capture.threadId).toBe(cloze.capture.threadId);
    expect(reading.confirmation).toEqual(cloze.confirmation);
    expect(reading.contracts).toHaveLength(1);
    expect(reading.contracts[0]).toMatchObject({ contractId: `${reading.id}:kanji-reading`, contractVersion: 1,
      targetComponentId: 'kc:窓', skill: 'orthography_to_reading', cueModality: 'text', responseModality: 'text',
      acceptedAnswers: ['まど'], promptFamilyVersion: 'source-token-reading-nfc-kana-fold@1',
      hintPolicy: { hintsAllowed: false, maxHints: 0 },
      revealPolicy: { revealAllowed: true, revealIsRecorded: true } });
    expect(reading.contracts[0].contractId).not.toBe(cloze.contracts[0]?.contractId);
    expect(reading.capture.sourceRef.locator).toBe(`${origin.contextRef}#token=9;sentence-utf16=0,1`);
    expect(reading.capture.provenance).toMatchObject({ license: 'unverified', reviewStatus: 'unreviewed' });
    expect(JSON.stringify(cloze)).toBe(before);
    expect(JSON.stringify(parseSourcePracticePlan(JSON.parse(before)))).toBe(before);
    expect(JSON.stringify(createSourcePracticePlan(context('cloze'), origin, ['cloze', 'production']))).toBe(before);
    expect(cloze).not.toHaveProperty('kind');
    expect(cloze).not.toHaveProperty('readingCue');
  });

  it('binds a compound reading to the whole token rather than constituent mastery', () => {
    const reading = createSourceKanjiReadingPlan(context(), wholeToken('窓口'), {
      ...cue, token: { s: '窓口', b: '窓口', r: 'まどぐち' },
    });
    expect(reading.contracts[0].targetComponentId).toBe('kc:窓口');
    expect(reading.contracts[0].acceptedAnswers).toEqual(['まどぐち']);
    expect(checkSourceKanjiReading(reading, 'まど', false)).toMatchObject({ matchesReading: false, mustRepeat: true });
    expect(reading.readingCue).toMatchObject({ focusKanji: '窓', rubySource: 'tokenizer', reviewStatus: 'unreviewed' });
    const index = buildTargetThreadIndex([reading.capture]);
    expect(resolveComponentThread(index, 'kc:窓口').linked).toBe(true);
    expect(resolveComponentThread(index, 'kc:窓').linked).toBe(false);
    expect(resolveComponentThread(index, 'kc:口').linked).toBe(false);
  });
});

describe('2. reading identity binds exact annotation facts and occurrence', () => {
  it('is independent of event ids, time and property insertion order', () => {
    const first = plan();
    const reordered = { reviewStatus: 'unreviewed', rubySource: 'tokenizer',
      token: { r: 'まど', b: '窓', s: '窓' }, focusKanji: '窓', version: 1 };
    const other = createSourceKanjiReadingPlan(context('other', '2026-09-14T00:00:00.000Z'), origin, reordered);
    expect(other.id).toBe(first.id);
    expect(other.contracts[0].contractId).toBe(first.contracts[0].contractId);
    expect(other.capture.eventId).not.toBe(first.capture.eventId);
    expect(other.capture.occurredAt).not.toBe(first.capture.occurredAt);
    expect(parseSourceKanjiReadingPlan({ ...other, readingCue: reordered })).toEqual(other);
    expect(first.id).toBe(`source-kanji-reading:${origin.contextRef}:0:1:v1:` +
      encodeURIComponent('[1,"窓","窓","窓","まど","tokenizer","unreviewed"]'));
  });

  it('keeps repeated glyphs and UTF-16 offsets tied to the selected occurrence', () => {
    const repeated: SourceTokenOrigin = { ...origin, text: '🚀の窓と窓。', start: 3, end: 4,
      tokenSpan: { unit: 'token-index', start: 8, end: 14, index: 10, surfaces: ['🚀', 'の', '窓', 'と', '窓', '。'] } };
    const first = createSourceKanjiReadingPlan(context('first'), repeated, cue);
    const second = createSourceKanjiReadingPlan(context('second'), { ...repeated, start: 5, end: 6,
      tokenSpan: { ...repeated.tokenSpan, index: 12 } }, cue, first.confirmation);
    expect(second.id).not.toBe(first.id);
    expect(second.capture.sourceRef.locator).toBe(`${origin.contextRef}#token=12;sentence-utf16=5,6`);
    expect(second.capture.span).toEqual({ start: 5, end: 6 });
    expect(() => parseSourceKanjiReadingPlan({ ...second, id: first.id })).toThrow();
    expect(() => createSourceKanjiReadingPlan(context(), { ...repeated,
      tokenSpan: { ...repeated.tokenSpan, index: 12 } }, cue)).toThrow();
  });

  it.each([
    ['surface', { token: { s: '窓辺', b: '窓口', r: 'まどぐち' } }],
    ['dictionary form', { token: { s: '窓口', b: 'まどぐち', r: 'まどぐち' } }],
    ['supplied reading', { token: { s: '窓口', b: '窓口', r: 'まどこう' } }],
    ['provenance', { rubySource: 'fixture-curator' }],
    ['focus', { focusKanji: '口' }],
  ] as const)('changes identity for changed %s and refuses the previous id', (_name, change) => {
    const compound = { ...cue, token: { s: '窓口', b: '窓口', r: 'まどぐち' } };
    const first = createSourceKanjiReadingPlan(context('first'), wholeToken('窓口'), compound);
    const changed = { ...compound, ...change };
    const second = createSourceKanjiReadingPlan(context('second'), wholeToken(changed.token.s), changed);
    expect(second.id).not.toBe(first.id);
    expect(second.contracts[0].contractId).not.toBe(first.contracts[0].contractId);
    expect(() => parseSourceKanjiReadingPlan({ ...second, id: first.id })).toThrow();
  });

  it('preserves raw canonically equivalent reading bytes as separate annotation identities', () => {
    const decomposed = { ...cue, token: { ...cue.token, r: 'まと\u3099' } };
    const first = plan(), other = createSourceKanjiReadingPlan(context('other'), origin, decomposed);
    expect(other.id).not.toBe(first.id);
    expect(other.readingCue.token.r).toBe('まと\u3099');
    expect(other.contracts[0].acceptedAnswers).toEqual(first.contracts[0].acceptedAnswers);
    expect(() => parseSourceKanjiReadingPlan({ ...first, readingCue: decomposed })).toThrow();
  });
});

describe('3. malformed or invented source reading facts fail closed', () => {
  it('validates a prospective cue against the exact token without an event context or confirmation', () => {
    expect(parseSourceKanjiReadingCue(cue, origin)).toEqual(cue);
    expect(() => parseSourceKanjiReadingCue(cue, wholeToken('窓口'))).toThrow();
    expect(() => parseSourceKanjiReadingCue(cue, { ...origin, sentenceStart: 9 })).toThrow();
    expect(() => parseSourceKanjiReadingCue(cue, { ...origin, tokenSpan: { ...origin.tokenSpan, index: 10 } })).toThrow();
    expect(() => parseSourceKanjiReadingCue({ ...cue, reviewStatus: 'reviewed' }, origin)).toThrow();
  });

  it.each([undefined, null, '', ' ', '\n', '\ud800', 'mado', '窓', 'まど1', 'ま・ど', 'ま ど', 'r'.repeat(201), 'ま'.repeat(201)])(
    'refuses missing, malformed, non-kana or oversized reading %j', (r) => {
      expect(() => parseSourceKanjiReadingCue({ ...cue, token: { ...cue.token, r } }, origin)).toThrow();
      expect(() => createSourceKanjiReadingPlan(context(), origin, { ...cue, token: { ...cue.token, r } })).toThrow();
    });

  it('refuses absent cue fields, invalid focus, invented review and unknown fields', () => {
    const { r: _reading, ...noReading } = cue.token;
    for (const altered of [undefined, null, { ...cue, token: noReading },
      { ...cue, focusKanji: '' }, { ...cue, focusKanji: 'ま' }, { ...cue, focusKanji: '戸' },
      { ...cue, focusKanji: '窓窓' }, { ...cue, focusKanji: '\ud800' },
      { ...cue, version: 2 }, { ...cue, reviewStatus: 'reviewed' },
      { ...cue, editoriallyApproved: true }, { ...cue, token: { ...cue.token, c: true } },
      { ...cue, token: { ...cue.token, s: ' ' } }, { ...cue, token: { ...cue.token, s: '\ud800窓' } },
      { ...cue, token: { ...cue.token, b: '' } }, { ...cue, token: { ...cue.token, b: '\ud800' } },
      { ...cue, token: { ...cue.token, b: '窓'.repeat(201) } },
      { ...cue, rubySource: '' }, { ...cue, rubySource: ' ' }, { ...cue, rubySource: '\ud800' },
      { ...cue, rubySource: 'x'.repeat(161) }])
      expect(() => createSourceKanjiReadingPlan(context(), origin, altered)).toThrow();
  });

  it('requires a whole exact token, with one coordinate system and well-formed boundaries', () => {
    const compound = wholeToken('窓口'), compoundCue = { ...cue, token: { s: '窓口', b: '窓口', r: 'まどぐち' } };
    const { tokenSpan: _span, ...textOrigin } = origin;
    for (const altered of [{ ...textOrigin, sentenceStart: 9 }, { ...origin, sentenceStart: 9 },
      { ...origin, tokenSpan: { ...origin.tokenSpan, unit: 'utf16-code-unit' } },
      { ...origin, tokenSpan: { ...origin.tokenSpan, index: 10 } },
      { ...origin, tokenSpan: { ...origin.tokenSpan, index: 14 } },
      { ...origin, tokenSpan: { ...origin.tokenSpan, end: 15 } },
      { ...origin, tokenSpan: { ...origin.tokenSpan, extra: true } },
      { ...origin, start: 0, end: 2 }, { ...origin, start: 2, end: 1 }])
      expect(() => createSourceKanjiReadingPlan(context(), altered, cue)).toThrow();
    expect(() => createSourceKanjiReadingPlan(context(), { ...compound, end: 1 }, cue)).toThrow();
    expect(() => createSourceKanjiReadingPlan(context(), compound, cue)).toThrow();
    expect(() => createSourceKanjiReadingPlan(context(), origin, compoundCue)).toThrow();
    expect(() => createSourceKanjiReadingPlan(context(), {
      ...origin, text: '🚀窓。', start: 2, end: 3,
      tokenSpan: { unit: 'token-index', start: 9, end: 13, index: 11, surfaces: ['\ud83d', '\ude80', '窓', '。'] },
    }, cue)).toThrow();
    const supplementary = createSourceKanjiReadingPlan(context(), wholeToken('𠮟る'), {
      ...cue, focusKanji: '𠮟', token: { s: '𠮟る', b: '𠮟る', r: 'しかる' },
    });
    expect(supplementary.readingCue.focusKanji).toBe('𠮟');
    expect(supplementary.capture.span).toEqual({ start: 0, end: 3 });
  });

  it('accepts exact bounded annotation fields without normalizing their source bytes', () => {
    const surface = `窓${'口'.repeat(199)}`;
    const value = createSourceKanjiReadingPlan(context(), wholeToken(surface), { ...cue,
      token: { s: surface, b: '窓'.repeat(200), r: 'ま'.repeat(200) }, rubySource: 'x'.repeat(160) });
    expect(parseSourceKanjiReadingPlan(value)).toEqual(value);
    expect(() => createSourceKanjiReadingPlan(context(), wholeToken(`${surface}口`), { ...cue,
      token: { s: `${surface}口`, b: '窓', r: 'まど' } })).toThrow();
  });

  it('rejects mixed/multiple contracts, foreign events, duplicate event ids and new authority', () => {
    const reading = plan(), cloze = createSourcePracticePlan(context('cloze'), origin, ['cloze']);
    for (const altered of [
      { ...reading, version: 1 }, { ...reading, kind: 'cloze' }, { ...reading, approved: true },
      { ...reading, contracts: [] }, { ...reading, contracts: [cloze.contracts[0]] },
      { ...reading, contracts: [...reading.contracts, ...cloze.contracts] },
      { ...reading, contracts: [reading.contracts[0], reading.contracts[0]] },
      { ...reading, capture: reading.contracts[0] }, { ...reading, confirmation: reading.capture },
      { ...reading, contracts: [reading.capture] },
      { ...reading, contracts: [{ ...reading.contracts[0], eventId: reading.capture.eventId }] },
      { ...reading, confirmation: { ...reading.confirmation, eventId: reading.capture.eventId } },
      { ...reading, confirmation: { ...reading.confirmation, origin: 'automatic' } },
      { ...reading, confirmation: { ...reading.confirmation, from: 'master' } },
      { ...reading, confirmation: { ...reading.confirmation, to: 'learn' } },
      { ...reading, capture: { ...reading.capture, span: { start: 2, end: 4 } } },
    ]) expect(() => parseSourceKanjiReadingPlan(altered)).toThrow();
    expect(() => createSourceKanjiReadingPlan(context(), wholeToken('窓口'), {
      ...cue, token: { s: '窓口', b: '窓口', r: 'まどぐち' },
    }, reading.confirmation)).toThrow();
  });
});

describe('4. deterministic reading checks and evidence preserve modality and explicit grades', () => {
  it('matches supplied kana under NFC, outer trim, ordinary full-width fold and iteration marks', () => {
    const reading = plan();
    for (const response of ['まど', ' マド\n', 'まと\u3099', 'マト\u3099'])
      expect(checkSourceKanjiReading(reading, response, false)).toEqual({
        matchesReading: true, revealedBeforeRecall: false, mustRepeat: false });
    const annotated = createSourceKanjiReadingPlan(context(), origin, {
      ...cue, token: { ...cue.token, r: 'マト\u3099' },
    });
    expect(annotated.readingCue.token.r).toBe('マト\u3099');
    expect(annotated.contracts[0].acceptedAnswers).toEqual(['まど']);
    const iterated = createSourceKanjiReadingPlan(context(), wholeToken('窓'), {
      ...cue, token: { ...cue.token, r: 'クヽヾ' },
    });
    expect(checkSourceKanjiReading(iterated, 'くゝゞ', false).matchesReading).toBe(true);
  });

  it.each(['窓', 'mado', 'ﾏﾄﾞ', 'まどう', 'まどー', 'ま ど', 'まと', '', ' '])(
    'does not infer an equivalent reading from %j', (response) => {
      expect(checkSourceKanjiReading(plan(), response, false)).toMatchObject({ matchesReading: false, mustRepeat: true });
    });

  it.each([
    ['キョー', 'きょー', 'きょう'], ['シャ', 'しゃ', 'しや'], ['コウ', 'こう', 'こお'],
    ['ヮヵヶ', 'ゎゕゖ', 'わかけ'], ['ヷ', 'ヷ', 'わ\u3099'],
  ])('preserves the distinctions in %s', (supplied, matching, other) => {
    const reading = createSourceKanjiReadingPlan(context(), origin, { ...cue, token: { ...cue.token, r: supplied } });
    expect(checkSourceKanjiReading(reading, matching, false).matchesReading).toBe(true);
    expect(checkSourceKanjiReading(reading, other, false).matchesReading).toBe(false);
  });

  it('forces wrong and revealed answers to Again without retaining Easy confirmation', () => {
    const reading = plan();
    for (const answer of [{ response: 'まと', revealed: false }, { response: 'まど', revealed: true },
      { response: 'まと', revealed: true }]) {
      const result = gradeSourceKanjiReading(context('grade'), reading, { ...input, ...answer, grade: 'easy' });
      expect(result.grade).toBe('again');
      expect(result.checked.mustRepeat).toBe(true);
      expect(result.observation).toMatchObject({ type: 'ReviewGraded', tier: 'A', grade: 'again',
        contractId: reading.contracts[0].contractId, hintsUsed: 0, revealedBeforeRecall: answer.revealed });
      expect(result.observation).not.toHaveProperty('userConfirmedEasy');
    }
  });

  it.each(['again', 'hard', 'good', 'easy'] as const)('retains an explicit %s on a matching supplied reading', (grade) => {
    const reading = plan();
    const result = gradeSourceKanjiReading(context('grade'), reading, { ...input, grade });
    expect(result.grade).toBe(grade);
    expect(result.checked).toEqual({ matchesReading: true, revealedBeforeRecall: false, mustRepeat: false });
    if (grade === 'easy') expect(result.observation.userConfirmedEasy).toBe(true);
    else expect(result.observation).not.toHaveProperty('userConfirmedEasy');
    const state = replay([reading.capture, reading.confirmation, ...reading.contracts, result.observation]);
    expect(state.gateDecisions[0]).toMatchObject({ admitted: true, contractId: reading.contracts[0].contractId });
  });

  it('refuses malformed responses and grade metadata', () => {
    const reading = plan();
    for (const response of ['\ud800', 'ま'.repeat(1001), undefined, 1])
      expect(() => Reflect.apply(checkSourceKanjiReading, null, [reading, response, false])).toThrow();
    expect(() => Reflect.apply(checkSourceKanjiReading, null, [reading, 'まど', 'false'])).toThrow();
    for (const change of [{ grade: 'automatic' }, { responseId: '' }, { latencyMs: -1 }, { latencyMs: NaN }])
      expect(() => Reflect.apply(gradeSourceKanjiReading, null, [context(), reading, { ...input, ...change }])).toThrow();
  });

  it('refuses reading/cloze swaps and free production or listening in the reading grader', () => {
    const reading = plan();
    const legacy = createSourcePracticePlan(context('legacy'), origin, ['cloze', 'production', 'listening'], undefined, {
      version: 1, path: 'audio/s/ami/bunki-graded-n5-morning-001.m4a', sha256: 'c'.repeat(64),
      bytes: 9000, sentenceIndex: 1, voice: 'ami', alignment: 'sentence-order', transcriptStatus: 'unreviewed',
    });
    expect(() => checkSourceKanjiReading(legacy, 'まど', false)).toThrow();
    expect(() => gradeSourceKanjiReading(context(), legacy, input)).toThrow();
    expect(() => checkSourceCloze(reading, '窓', false)).toThrow();
    expect(() => gradeSourceCloze(context(), reading, { ...input, response: '窓' })).toThrow();
    expect(() => observeSourceProduction(context(), reading, 'free')).toThrow();
    expect(() => observeSourceListening(context(), reading, 'heard')).toThrow();
    expect(() => parseSourcePracticePlan(reading)).toThrow();
    expect(() => parseSourceKanjiReadingPlan(legacy)).toThrow();
  });
});

describe('5. one original promotion supports isolated reading and cloze schedules', () => {
  it('grades only the reading contract and keeps the cloze memory-state bytes unchanged', () => {
    const cloze = createSourcePracticePlan(context('cloze'), origin, ['cloze']);
    const originalEvents = [cloze.capture, cloze.confirmation, ...cloze.contracts];
    const original = replay(originalEvents);
    const reading = createSourceKanjiReadingPlan(context('reading', '2026-09-14T00:00:00.000Z'), origin, cue, cloze.confirmation);
    const events = [...originalEvents, reading.capture, ...reading.contracts];
    const before = replay(events);
    const observed = gradeSourceKanjiReading(context('grade', '2026-09-14T00:01:00.000Z'), reading, input).observation;
    const after = replay([...events, observed]);
    const clozeId = cloze.contracts[0]!.contractId, readingId = reading.contracts[0].contractId;
    const member = (state: typeof before, id: string) => state.memoryStates.find((item) => item.contractId === id);
    expect(member(original, clozeId)).toBeDefined();
    expect(member(before, readingId)).toBeDefined();
    expect(JSON.stringify(member(after, clozeId))).toBe(JSON.stringify(member(original, clozeId)));
    expect(JSON.stringify(member(after, clozeId))).toBe(JSON.stringify(member(before, clozeId)));
    expect(JSON.stringify(member(after, readingId))).not.toBe(JSON.stringify(member(before, readingId)));
    expect(after.memoryStates).toHaveLength(2);
    expect(after.threads).toHaveLength(1);
    expect(after.gateDecisions).toHaveLength(1);
    expect(after.gateDecisions[0]).toMatchObject({ admitted: true, contractId: readingId });
    expect(after.contracts.find((contract) => contract.contractId === readingId)?.skill).toBe('orthography_to_reading');
    expect(after.contracts.find((contract) => contract.contractId === clozeId)?.skill).toBe('discrimination');
    expect(events.filter((event) => event.type === 'ThreadPromotionChanged')).toEqual([cloze.confirmation]);
    expect(reading.confirmation).toEqual(cloze.confirmation);
    expect(after.skippedDuplicateCount).toBe(0);
    expect(resolveComponentThread(buildTargetThreadIndex(events), 'kc:窓'))
      .toEqual({ linked: true, threadId: cloze.capture.threadId });
  });
});

describe('6. historical facts remain parseable and corrections create new siblings', () => {
  it.each([
    { acceptedAnswers: ['まと'] }, { skill: 'discrimination' }, { targetComponentId: 'kc:戸' },
    { promptFamilyVersion: 'source-token-reading-nfc-kana-fold@2' }, { contractVersion: 2 },
    { cueModality: 'audio' }, { responseModality: 'free' },
    { acceptedAnswers: ['まど', 'まと'] }, { hintPolicy: { hintsAllowed: true, maxHints: 1 } },
    { revealPolicy: { revealAllowed: false, revealIsRecorded: true } },
  ])('refuses altered contract facts under the existing id: %j', (change) => {
    const reading = plan();
    expect(() => parseSourceKanjiReadingPlan({ ...reading, contracts: [{ ...reading.contracts[0], ...change }] })).toThrow();
  });

  it.each([
    { token: { ...cue.token, r: 'まと' } }, { token: { ...cue.token, b: 'まど' } },
    { rubySource: 'fixture-curator' }, { reviewStatus: 'reviewed' },
  ])('refuses altered saved cue facts under the old id: %j', (change) => {
    expect(() => parseSourceKanjiReadingPlan({ ...plan(), readingCue: { ...cue, ...change } })).toThrow();
  });

  it('parses saved facts without an article and keeps old bytes when a corrected annotation is confirmed', () => {
    const original = createSourceKanjiReadingPlan(context('original'), origin, { ...cue, token: { ...cue.token, r: 'まと' } });
    const saved = JSON.stringify(original);
    const recovered = parseSourceKanjiReadingPlan(JSON.parse(saved));
    expect(JSON.stringify(recovered)).toBe(saved);
    // A supplied annotation can match while remaining unreviewed; this is not
    // an assertion that the annotation is a correct Japanese reading.
    expect(checkSourceKanjiReading(recovered, 'まと', false).matchesReading).toBe(true);
    expect(recovered.readingCue.reviewStatus).toBe('unreviewed');
    const corrected = createSourceKanjiReadingPlan(context('corrected'), origin, cue, recovered.confirmation);
    expect(corrected.id).not.toBe(recovered.id);
    expect(corrected.contracts[0].contractId).not.toBe(recovered.contracts[0].contractId);
    expect(corrected.capture.threadId).toBe(recovered.capture.threadId);
    expect(corrected.confirmation).toEqual(recovered.confirmation);
    expect(JSON.stringify(original)).toBe(saved);
    expect(JSON.stringify(recovered)).toBe(saved);
    expect(parseSourceKanjiReadingPlan(corrected)).toEqual(corrected);
    expect(() => parseSourceKanjiReadingPlan({ ...corrected, id: original.id })).toThrow();
    const state = replay([recovered.capture, recovered.confirmation, ...recovered.contracts,
      corrected.capture, ...corrected.contracts]);
    expect(state.contracts).toHaveLength(2);
    expect(state.threads).toHaveLength(1);
    expect(state.skippedDuplicateCount).toBe(0);
  });
});
