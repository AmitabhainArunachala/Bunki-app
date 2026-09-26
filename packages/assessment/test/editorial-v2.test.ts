import { describe, expect, it } from 'vitest';
import { artifactReference, createFormVersion, createItemVersion } from '../src/content.ts';
import {
  AI_ITEM_ASPECTS,
  AI_REVIEW_ROLES,
  aiAssessmentLabel,
  createAiEditorialReceipt,
  createAiConcernResolution,
  createAiConcernResolutionInput,
  parseAiConcernResolution,
  createAiReviewInput,
  createAiReviewPresentation,
  createHostAiReviewAuthority,
  evaluateAiReleaseReview as evaluateRaw,
  parseAiEditorialReceipt,
  type AiEditorialReceipt,
  type AiReviewRole,
  type HostAiReviewAuthority,
} from '../src/editorial-v2.ts';
import { clone, form, fullForm, NOW, payloadOf } from './fixtures.ts';

const models = [
  { providerId: 'fixture-provider-a', modelId: 'fixture-a', familyId: 'fixture-family-a' },
  { providerId: 'fixture-provider-b', modelId: 'fixture-b', familyId: 'fixture-family-b' },
  { providerId: 'fixture-provider-c', modelId: 'fixture-c', familyId: 'fixture-family-c' },
] as const;
const policy = {
  policyVersion: 'synthetic-ai-review/v2',
  checklistVersion: 'synthetic-japanese-checklist/v2',
  authorFamilyIds: ['fixture-author-family'],
  reviewers: models.map((model) => ({ ...model, roles: [...AI_REVIEW_ROLES] })),
};
function presentation(subject: ReturnType<typeof form>) {
  if (!subject.media.length) return undefined;
  return {
    schema: 'kairo-assessment-bank-delivery/1',
    form: artifactReference(subject),
    assets: subject.media.map((media) => ({
      assetId: media.assetId,
      path: `audio/${media.sha256}.wav`,
      bytesSha256: media.bytesSha256,
      mimeType: media.mimeType,
    })),
    units: subject.media
      .filter((media) => media.kind === 'audio')
      .map((media) => ({
        id: media.id,
        kind: 'question',
        itemIds: subject.items
          .filter((item) => item.media.some((ref) => ref.id === media.id))
          .map((item) => item.id),
        media: artifactReference(media),
        printedOptions: true,
        stimulusPlayCount: 1,
      })),
  };
}
const evaluateAiReleaseReview = (
  subject: ReturnType<typeof form>,
  receipts: unknown,
  trust: HostAiReviewAuthority | null,
) => evaluateRaw(subject, receipts, trust, presentation(subject));
function receipt(subject: ReturnType<typeof form>, role: AiReviewRole, modelIndex = 2) {
  const delivery = presentation(subject);
  return createAiEditorialReceipt({
    format: 'kairo-assessment-ai-editorial-receipt',
    v: 2,
    id: `fixture:${role}:${modelIndex}`,
    form: artifactReference(subject),
    role,
    model: models[modelIndex],
    checklistVersion: policy.checklistVersion,
    inputSha256: createAiReviewInput(subject, role, null, delivery).inputSha256,
    ...(delivery
      ? { presentationSha256: createAiReviewPresentation(subject, delivery).deliverySha256 }
      : {}),
    decidedAt: NOW,
    verdict: 'pass',
    answers:
      role !== 'blind-solver'
        ? []
        : subject.items.map((item) => ({
            item: artifactReference(item),
            response: {
              kind: 'selected',
              optionId:
                item.response.kind === 'selected' ? item.response.answerOptionId : 'fixture',
            },
            uniqueAnswer: true,
            reason: 'Synthetic test assertion, not an actual model review.',
          })),
    itemChecks:
      role !== 'adversarial-editor'
        ? []
        : subject.items.map((item) => ({
            item: artifactReference(item),
            checks: AI_ITEM_ASPECTS.map((aspect) => ({
              aspect,
              result: 'pass',
              note: 'Synthetic editorial fixture.',
            })),
          })),
    formChecks:
      role !== 'form-auditor'
        ? []
        : ['coverage', 'timing'].map((aspect) => ({
            aspect,
            result: 'pass',
            note: 'Synthetic coverage fixture.',
          })),
    inspections:
      role === 'blind-solver' || role === 'media-inspector'
        ? subject.media.map((media) => ({
            media: artifactReference(media),
            bytesSha256: media.bytesSha256,
            mode: media.kind === 'audio' ? 'rendered-audio' : 'rendered-image',
            result: 'pass',
            note: 'Synthetic attachment assertion; no real audio is reviewed in this unit fixture.',
            evidenceRefs: ['synthetic:attachment'],
          }))
        : [],
    evidenceRefs: ['synthetic:runtime-receipt'],
  });
}
function reviews(subject = form()) {
  return [
    receipt(subject, 'blind-solver', 0),
    receipt(subject, 'blind-solver', 1),
    receipt(subject, 'adversarial-editor'),
    receipt(subject, 'form-auditor'),
    ...(subject.media.length ? [receipt(subject, 'media-inspector')] : []),
  ];
}
function authority(receipts: readonly AiEditorialReceipt[], patch = {}) {
  return createHostAiReviewAuthority({
    ...policy,
    verifiedReceiptSha256: receipts.map((entry) => entry.sha256),
    ...patch,
  });
}
function replace(
  receipts: AiEditorialReceipt[],
  index: number,
  change: (payload: ReturnType<typeof payloadOf<AiEditorialReceipt>>) => void,
) {
  const payload = payloadOf(receipts[index]!);
  change(payload);
  receipts[index] = createAiEditorialReceipt(payload);
}

describe('AI editorial v2, separate from human review v1', () => {
  it('allows an explicitly AI reviewed practice form after independent verified roles', () => {
    const subject = form();
    const receipts = reviews(subject);
    const review = evaluateAiReleaseReview(subject, receipts, authority(receipts));
    expect(review).toMatchObject({
      status: 'ai-reviewed-practice',
      productionEligible: true,
      officialScoreCalibrated: false,
      problems: [],
    });
    expect(aiAssessmentLabel(subject, review)).toBe('N5 quick practice · AI reviewed');
  });
  it('requires actual-media receipt bindings as well as full-form structure and timing', () => {
    const subject = fullForm();
    const receipts = reviews(subject);
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).status).toBe(
      'ai-reviewed-full',
    );
    replace(receipts, 0, (payload) => {
      payload.inspections = [];
    });
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).problems).toContain(
      'blind-solver-media-not-inspected',
    );
    replace(receipts, 4, (payload) => {
      payload.inspections[0]!.bytesSha256 = 'f'.repeat(64);
    });
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).problems).toContain(
      'rendered-media-review-required',
    );
  });
  it('does not admit an imported review or serialized authority as authority', () => {
    const subject = form();
    const receipts = reviews(subject);
    const trusted = authority(receipts);
    expect(evaluateAiReleaseReview(subject, receipts, null).status).toBe('unreviewed');
    expect(
      evaluateAiReleaseReview(subject, receipts, clone(trusted) as HostAiReviewAuthority).status,
    ).toBe('unreviewed');
    expect(evaluateAiReleaseReview(subject, receipts, authority([])).status).toBe('unreviewed');
  });
  it('binds media approval to presentation and rejects a changed or missing delivery', () => {
    const subject = fullForm(),
      receipts = reviews(subject),
      delivery = presentation(subject)!;
    expect(evaluateRaw(subject, receipts, authority(receipts)).problems).toContain(
      'exact-presentation-review-required',
    );
    const changed = clone(delivery);
    changed.units[0]!.printedOptions = false;
    expect(evaluateRaw(subject, receipts, authority(receipts), changed).problems).toContain(
      'review-input-mismatch',
    );
    const packet = createAiReviewInput(subject, 'blind-solver', null, changed);
    const listening = packet.payload.items.find((item) => item.skill === 'listening')!;
    expect(listening.response).toMatchObject({
      options: [
        { id: 'a', text: '1' },
        { id: 'b', text: '2' },
      ],
    });
    expect(JSON.stringify(packet)).not.toContain('"answerOptionId"');
    expect(packet.payload.presentation?.deliverySha256).not.toBe(
      createAiReviewPresentation(subject, delivery).deliverySha256,
    );
    const stale = clone(delivery);
    stale.form.sha256 = 'f'.repeat(64);
    expect(() => createAiReviewPresentation(subject, stale)).toThrow();
    const incomplete = clone(delivery);
    incomplete.units = [];
    expect(() => createAiReviewPresentation(subject, incomplete)).toThrow();
  });
  it('keeps historical absent presentation fields absent without admitting them for media', () => {
    const subject = fullForm(),
      old = payloadOf(receipt(subject, 'blind-solver', 0));
    delete old.presentationSha256;
    old.inputSha256 = createAiReviewInput(subject, 'blind-solver').inputSha256;
    const stored = createAiEditorialReceipt(old);
    expect(stored).not.toHaveProperty('presentationSha256');
    expect(parseAiEditorialReceipt(stored)).toEqual(stored);
    expect(evaluateRaw(subject, [stored], authority([stored])).productionEligible).toBe(false);
  });
  it('does not count aliases of one family as independent solvers', () => {
    const subject = form();
    const receipts = reviews(subject);
    replace(receipts, 1, (payload) => {
      payload.model.familyId = models[0].familyId.toUpperCase();
    });
    const reviewers = policy.reviewers.map((model, index) =>
      index === 1 ? { ...model, familyId: models[0].familyId.toUpperCase() } : model,
    );
    expect(
      evaluateAiReleaseReview(subject, receipts, authority(receipts, { reviewers })).problems,
    ).toContain('two-independent-blind-solvers-required');
  });
  it('rejects model identity claimed by the response instead of the configured runtime', () => {
    const subject = form();
    const receipts = reviews(subject);
    replace(receipts, 1, (payload) => {
      payload.model.familyId = 'claimed-new-family';
    });
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).productionEligible).toBe(
      false,
    );
  });
  it('excludes the author family and requires a separate adversarial family', () => {
    const subject = form();
    const receipts = reviews(subject);
    expect(
      evaluateAiReleaseReview(
        subject,
        receipts,
        authority(receipts, { authorFamilyIds: [models[0].familyId] }),
      ).problems,
    ).toContain('reviewer-is-author-family');
    replace(receipts, 2, (payload) => {
      payload.model = clone(models[0]);
    });
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).problems).toContain(
      'independent-adversarial-editor-required',
    );
  });
  it('withholds every blind key and explanation, including ordered and written marking', () => {
    const payload = payloadOf(form().items[0]!);
    const ordered = createItemVersion({
      ...payload,
      id: 'item:ordered',
      response: {
        kind: 'ordered',
        tokens: [
          { id: 'a', text: '私' },
          { id: 'b', text: 'です' },
        ],
        answerOrder: ['a', 'b'],
      },
    });
    const written = createItemVersion({
      ...payload,
      id: 'item:written',
      response: {
        kind: 'written',
        maxChars: 20,
        marking: { kind: 'exact', accepted: ['回答'], normalization: 'none' },
      },
    });
    const packet = createAiReviewInput(form([form().items[0]!, ordered, written]), 'blind-solver');
    const serialized = JSON.stringify(packet.payload);
    for (const forbidden of [
      'answerOptionId',
      'answerOrder',
      'rationale',
      'marking',
      'accepted',
      'subjects',
    ])
      expect(serialized).not.toContain(`"${forbidden}"`);
    const audioPacket = createAiReviewInput(fullForm(), 'blind-solver');
    expect(JSON.stringify(audioPacket.payload)).not.toContain('"transcript"');
    expect(JSON.stringify(audioPacket.payload)).not.toContain('"alt"');
  });
  it('a key-visible input hash cannot be used for a blind solver', () => {
    const subject = form();
    const receipts = reviews(subject);
    replace(receipts, 0, (payload) => {
      payload.inputSha256 = createAiReviewInput(subject, 'adversarial-editor').inputSha256;
    });
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).problems).toContain(
      'review-input-mismatch',
    );
  });
  it('any solver disagreement blocks without voting the pinned key away', () => {
    const subject = form();
    const receipts = reviews(subject);
    replace(receipts, 0, (payload) => {
      payload.answers[0]!.response = { kind: 'selected', optionId: 'b' };
    });
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts))).toMatchObject({
      status: 'blocked',
      productionEligible: false,
      problems: expect.arrayContaining(['blind-answer-disagreement-or-missing']),
    });
    expect(subject.items[0]!.response).toMatchObject({ answerOptionId: 'a' });
  });
  it('ambiguity, a missing item check, and a missing timing review all block', () => {
    const subject = form();
    const receipts = reviews(subject);
    replace(receipts, 0, (payload) => {
      payload.answers[0]!.uniqueAnswer = false;
    });
    replace(receipts, 2, (payload) => {
      payload.itemChecks[0]!.checks.pop();
    });
    replace(receipts, 3, (payload) => {
      payload.formChecks.pop();
    });
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).problems).toEqual(
      expect.arrayContaining([
        'blind-answer-disagreement-or-missing',
        'item-editorial-checks-incomplete',
        'form-coverage-and-timing-review-required',
      ]),
    );
  });
  it('preserves negative findings instead of choosing a newer passing receipt', () => {
    const subject = form();
    const receipts = reviews(subject);
    const negative = payloadOf(receipts[2]!);
    negative.id = 'fixture:negative';
    negative.verdict = 'revise';
    receipts.push(createAiEditorialReceipt(negative));
    const result = evaluateAiReleaseReview(subject, receipts, authority(receipts));
    expect(result.problems).toContain('editorial-disagreement');
    expect(evaluateAiReleaseReview(subject, [...receipts].reverse(), authority(receipts))).toEqual(
      result,
    );
  });
  it('a form edit invalidates all older review receipts and the old display label', () => {
    const old = form();
    const receipts = reviews(old);
    const approved = evaluateAiReleaseReview(old, receipts, authority(receipts));
    const payload = payloadOf(old);
    const changed = payloadOf(old.items[0]!);
    changed.prompt = '新しい設問です。';
    payload.items[0] = clone(createItemVersion(changed));
    const next = createFormVersion(payload);
    expect(evaluateAiReleaseReview(next, receipts, authority(receipts)).status).toBe('unreviewed');
    expect(aiAssessmentLabel(next, approved)).toContain('Practice draft');
  });
  it('AI agreement never supplies missing rights or score calibration', () => {
    const payload = payloadOf(form());
    payload.rights.display = { status: 'unknown', reason: 'no-license' };
    const subject = createFormVersion(payload);
    const receipts = reviews(subject);
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts))).toMatchObject({
      productionEligible: false,
      officialScoreCalibrated: false,
      problems: expect.arrayContaining(['display-or-retain-rights-not-established']),
    });
  });
  it('rejects tampered receipts, duplicate model routes and repeated item reviews', () => {
    const raw = clone(reviews()[0]!);
    raw.verdict = 'reject';
    expect(() => parseAiEditorialReceipt(raw)).toThrow();
    expect(() =>
      authority([], { reviewers: [policy.reviewers[0], policy.reviewers[0]] }),
    ).toThrow();
    const payload = payloadOf(reviews()[0]!);
    payload.answers.push(payload.answers[0]!);
    expect(() => createAiEditorialReceipt(payload)).toThrow();
  });
  it('requires two independent solvers for every item when review is batched', () => {
    const first = form().items[0]!;
    const second = createItemVersion({ ...payloadOf(first), id: 'item:second' });
    const subject = form([first, second]);
    const receipts = reviews(subject).flatMap((receipt) => {
      if (receipt.role !== 'blind-solver' && receipt.role !== 'adversarial-editor')
        return [receipt];
      return subject.items.map((item) => {
        const payload = payloadOf(receipt);
        payload.id += `:${item.id}`;
        payload.itemIds = [item.id];
        payload.inputSha256 = createAiReviewInput(
          subject,
          receipt.role,
          payload.itemIds,
        ).inputSha256;
        payload.answers = payload.answers.filter((answer) => answer.item.id === item.id);
        payload.itemChecks = payload.itemChecks.filter((check) => check.item.id === item.id);
        return createAiEditorialReceipt(payload);
      });
    });
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).productionEligible).toBe(
      true,
    );
    receipts.splice(0, 1);
    expect(evaluateAiReleaseReview(subject, receipts, authority(receipts)).problems).toContain(
      'two-independent-blind-solvers-required',
    );
    expect(() => createAiReviewInput(subject, 'form-auditor', [first.id])).toThrow();
  });
});

describe('explicit written concern resolution', () => {
  function fixture(subject = form()) {
    const receipts = reviews(subject);
    replace(receipts, 2, (payload) => {
      payload.itemChecks[0]!.checks.find((check) => check.aspect === 'unique-answer')!.result =
        'inconclusive';
    });
    const original = receipts[2]!;
    const replacement = createAiEditorialReceipt({
      ...payloadOf(receipt(subject, 'adversarial-editor')),
      id: 'fixture:reassessment',
    });
    receipts.push(replacement);
    const item = subject.items[0]!;
    const packet = createAiConcernResolutionInput(
      subject,
      original,
      replacement,
      item.id,
      'unique-answer',
      presentation(subject),
    );
    const resolution = createAiConcernResolution({
      format: 'kairo-assessment-ai-concern-resolution',
      v: 1,
      id: 'fixture:resolution',
      form: packet.payload.form,
      item: packet.payload.item,
      aspect: packet.payload.aspect,
      original: {
        receiptSha256: original.sha256,
        checkSha256: packet.payload.original.checkSha256,
      },
      replacement: {
        receiptSha256: replacement.sha256,
        checkSha256: packet.payload.replacement.checkSha256,
      },
      model: original.model,
      checklistVersion: policy.checklistVersion,
      inputSha256: packet.inputSha256,
      ...(presentation(subject)
        ? {
            presentationSha256: createAiReviewPresentation(subject, presentation(subject))
              .deliverySha256,
          }
        : {}),
      decidedAt: NOW,
      outcome: 'resolved',
      reason: 'Synthetic explicit adjudication of the specific earlier concern.',
      evidenceRefs: ['synthetic:resolution-runtime'],
    });
    const trust = (patch = {}) =>
      authority(receipts, { verifiedResolutionSha256: [resolution.sha256], ...patch });
    const evaluate = (value = resolution, patch = {}) =>
      evaluateRaw(
        subject,
        receipts,
        trust({ verifiedResolutionSha256: [value.sha256], ...patch }),
        presentation(subject),
        [value],
      );
    return { subject, receipts, original, replacement, resolution, trust, evaluate };
  }
  it('requires an explicit verified adjudication and preserves both findings in the decision', () => {
    const f = fixture(),
      before = JSON.stringify(f.original);
    expect(evaluateAiReleaseReview(f.subject, f.receipts, f.trust()).productionEligible).toBe(
      false,
    );
    const review = f.evaluate();
    expect(review.productionEligible).toBe(true);
    expect(review.decisionRevisionIds).toEqual(
      expect.arrayContaining([
        f.original.revisionId,
        f.replacement.revisionId,
        f.resolution.revisionId,
      ]),
    );
    expect(JSON.stringify(f.original)).toBe(before);
    expect(parseAiConcernResolution(f.resolution)).toEqual(f.resolution);
  });
  it('rejects self-asserted imported resolutions and serialized host authority', () => {
    const f = fixture();
    expect(f.evaluate(f.resolution, { verifiedResolutionSha256: [] }).problems).toContain(
      'invalid-concern-resolution',
    );
    expect(
      evaluateRaw(
        f.subject,
        f.receipts,
        clone(f.trust()) as HostAiReviewAuthority,
        presentation(f.subject),
        [f.resolution],
      ).productionEligible,
    ).toBe(false);
    const tampered = clone(f.resolution);
    tampered.reason = 'Changed after verification';
    expect(() => parseAiConcernResolution(tampered)).toThrow();
  });
  it('rejects stale or broader check/item/form/presentation/input bindings', () => {
    const f = fixture();
    for (const mutate of [
      (p: ReturnType<typeof payloadOf<typeof f.resolution>>) => {
        p.original.checkSha256 = 'f'.repeat(64);
      },
      (p: ReturnType<typeof payloadOf<typeof f.resolution>>) => {
        p.replacement.checkSha256 = 'f'.repeat(64);
      },
      (p: ReturnType<typeof payloadOf<typeof f.resolution>>) => {
        p.item.sha256 = 'f'.repeat(64);
      },
      (p: ReturnType<typeof payloadOf<typeof f.resolution>>) => {
        p.form.sha256 = 'f'.repeat(64);
      },
      (p: ReturnType<typeof payloadOf<typeof f.resolution>>) => {
        p.inputSha256 = 'f'.repeat(64);
      },
      (p: ReturnType<typeof payloadOf<typeof f.resolution>>) => {
        p.presentationSha256 = 'f'.repeat(64);
      },
      (p: ReturnType<typeof payloadOf<typeof f.resolution>>) => {
        p.aspect = 'distractors';
      },
      (p: ReturnType<typeof payloadOf<typeof f.resolution>>) => {
        p.original.receiptSha256 = 'f'.repeat(64);
      },
    ]) {
      const payload = payloadOf(f.resolution);
      mutate(payload);
      expect(f.evaluate(createAiConcernResolution(payload)).productionEligible).toBe(false);
    }
    expect(() =>
      createAiConcernResolution({ ...payloadOf(f.resolution), mediaInspected: true }),
    ).toThrow();
    expect(() =>
      createAiConcernResolution({ ...payloadOf(f.resolution), replacement: f.resolution.original }),
    ).toThrow();
  });
  it('cannot resolve a hard failure or a stale replacement review', () => {
    const f = fixture(),
      old = payloadOf(f.original);
    old.itemChecks[0]!.checks.find((check) => check.aspect === 'unique-answer')!.result = 'fail';
    expect(() =>
      createAiConcernResolutionInput(
        f.subject,
        createAiEditorialReceipt(old),
        f.replacement,
        f.subject.items[0]!.id,
        'unique-answer',
        presentation(f.subject),
      ),
    ).toThrow();
    const stale = payloadOf(f.replacement);
    stale.inputSha256 = 'f'.repeat(64);
    expect(() =>
      createAiConcernResolutionInput(
        f.subject,
        f.original,
        createAiEditorialReceipt(stale),
        f.subject.items[0]!.id,
        'unique-answer',
        presentation(f.subject),
      ),
    ).toThrow();
  });
  it('keeps an explicit unresolved adjudication blocking', () => {
    const f = fixture();
    expect(
      f.evaluate(createAiConcernResolution({ ...payloadOf(f.resolution), outcome: 'unresolved' }))
        .problems,
    ).toContain('editorial-concern-unresolved');
  });
  it('requires the original reviewer identity or an explicitly configured independent adjudicator', () => {
    const f = fixture();
    const alias = createAiConcernResolution({
      ...payloadOf(f.resolution),
      model: { ...models[2], modelId: 'unverified-alias' },
    });
    expect(f.evaluate(alias).productionEligible).toBe(false);
    const independent = createAiConcernResolution({ ...payloadOf(f.resolution), model: models[0] });
    expect(f.evaluate(independent).productionEligible).toBe(false);
    expect(f.evaluate(independent, { concernAdjudicators: [models[0]] }).productionEligible).toBe(
      true,
    );
    expect(
      f.evaluate(independent, {
        concernAdjudicators: [models[0]],
        authorFamilyIds: [models[0].familyId],
      }).problems,
    ).toContain('invalid-concern-resolution');
  });
  it('does not resolve other checks, blind answers, or actual media requirements', () => {
    const f = fixture(fullForm());
    const audioItem = f.subject.items.find((item) => item.media.length)!;
    const audioConcern = payloadOf(f.replacement);
    audioConcern.id = 'fixture:audio-concern';
    audioConcern.itemChecks
      .find((entry) => entry.item.id === audioItem.id)!
      .checks.find((check) => check.aspect === 'unique-answer')!.result = 'inconclusive';
    expect(() =>
      createAiConcernResolutionInput(
        f.subject,
        createAiEditorialReceipt(audioConcern),
        f.replacement,
        audioItem.id,
        'unique-answer',
        presentation(f.subject),
      ),
    ).toThrow();
    replace(f.receipts, 0, (payload) => {
      payload.inspections = [];
    });
    const review = evaluateRaw(f.subject, f.receipts, f.trust(), presentation(f.subject), [
      f.resolution,
    ]);
    expect(review.problems).toContain('blind-solver-media-not-inspected');
    const other = payloadOf(f.original);
    other.id = 'fixture:another-concern';
    other.itemChecks[0]!.checks.find((check) => check.aspect === 'distractors')!.result =
      'inconclusive';
    f.receipts.push(createAiEditorialReceipt(other));
    expect(
      evaluateRaw(f.subject, f.receipts, f.trust(), presentation(f.subject), [f.resolution])
        .problems,
    ).toContain('editorial-check-not-passed');
  });
  it('rejects conflicting or duplicate dispositions for one concern', () => {
    const f = fixture();
    const duplicate = createAiConcernResolution({
      ...payloadOf(f.resolution),
      id: 'fixture:duplicate',
    });
    const trust = f.trust({ verifiedResolutionSha256: [f.resolution.sha256, duplicate.sha256] });
    expect(
      evaluateRaw(f.subject, f.receipts, trust, presentation(f.subject), [f.resolution, duplicate])
        .problems,
    ).toContain('invalid-concern-resolution');
  });
});
