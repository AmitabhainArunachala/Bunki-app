import { describe, expect, it } from 'vitest';
import {
  assessmentLabel,
  createEditorialDecision,
  createFormVersion,
  createItemVersion,
  EDITORIAL_ASPECTS,
  evaluateReleaseReview,
  parseEditorialDecision,
} from '../src/index.ts';
import { authority, clone, decision, form, fullForm, NOW, payloadOf } from './fixtures.ts';

describe('editorial authority and exact version binding', () => {
  it('structural checks and an imported human approval do not authenticate a reviewer', () => {
    const subject = fullForm();
    const review = decision(subject);
    expect(evaluateReleaseReview(subject, [], authority).productionEligible).toBe(false);
    expect(evaluateReleaseReview(subject, [review], null)).toMatchObject({
      status: 'unreviewed',
      productionEligible: false,
    });
    expect(assessmentLabel(subject)).toBe('N5 full-form candidate · unreviewed');
  });
  it('uses explicit host authority, exact checklist and exact form digest for a review observation', () => {
    const subject = fullForm();
    const reviewed = evaluateReleaseReview(subject, [decision(subject)], authority);
    expect(reviewed).toMatchObject({
      status: 'reviewed-full-form',
      productionEligible: true,
      authorityPolicyVersion: authority.policyVersion,
    });
    expect(assessmentLabel(subject, reviewed)).toBe('N5 full practice form · reviewed');
    expect(
      evaluateReleaseReview(subject, [decision(subject)], {
        ...authority,
        reviewerIds: ['someone-else'],
      }).productionEligible,
    ).toBe(false);
    expect(
      evaluateReleaseReview(subject, [decision(subject)], {
        ...authority,
        checklistVersion: 'new-checklist',
      }).productionEligible,
    ).toBe(false);
  });
  it('an answer-key change invalidates an old full-form approval and display label', () => {
    const old = fullForm();
    const review = decision(old);
    const oldRelease = evaluateReleaseReview(old, [review], authority);
    const payload = payloadOf(old);
    const changed = payloadOf(old.items[0]!);
    if (changed.response.kind !== 'selected') throw new Error('fixture');
    changed.response.answerOptionId = 'b';
    payload.items[0] = clone(createItemVersion(changed));
    const next = createFormVersion(payload);
    expect(evaluateReleaseReview(next, [review], authority).status).toBe('unreviewed');
    expect(assessmentLabel(next, oldRelease)).toBe('N5 full-form candidate · unreviewed');
  });
  it('never resolves concurrent approval and rejection by timestamp', () => {
    const subject = fullForm();
    const approval = decision(subject);
    const rejection = decision(subject, 'reject', 'rejected:fixture');
    expect(evaluateReleaseReview(subject, [approval, rejection], authority)).toMatchObject({
      status: 'blocked',
      productionEligible: false,
    });
    expect(evaluateReleaseReview(subject, [rejection, approval], authority)).toEqual(
      evaluateReleaseReview(subject, [approval, rejection], authority),
    );
  });
  it('rejects automated approval, tampered decision bytes and missing review aspects', () => {
    const payload = payloadOf(decision(fullForm()));
    payload.reviewer.kind = 'automated';
    expect(() => createEditorialDecision(payload)).toThrow();
    payload.verdict = 'review';
    expect(createEditorialDecision(payload).verdict).toBe('review');
    const tampered = clone(decision(fullForm()));
    tampered.subject.sha256 = 'f'.repeat(64);
    expect(() => parseEditorialDecision(tampered)).toThrow();
    payload.aspects.pop();
    expect(() => createEditorialDecision(payload)).toThrow();
  });
  it('requires language/key/rights checks for practice and coverage/timing/audio for complete forms', () => {
    const subject = fullForm();
    const incomplete = createEditorialDecision({
      format: 'kairo-assessment-editorial-decision',
      v: 1,
      id: 'na-review',
      subject: decision(subject).subject,
      reviewer: { kind: 'human', id: 'fixture-reviewer' },
      checklistVersion: authority.checklistVersion,
      decidedAt: NOW,
      verdict: 'approve',
      aspects: EDITORIAL_ASPECTS.map((aspect) => ({
        aspect,
        result: aspect === 'audio' ? 'not-applicable' : 'pass',
        note: 'Synthetic fixture',
        evidenceRefs: [],
      })),
    });
    expect(evaluateReleaseReview(subject, [incomplete], authority).productionEligible).toBe(false);
    const practice = form();
    expect(evaluateReleaseReview(practice, [decision(practice)], authority).status).toBe(
      'reviewed-practice',
    );
  });
  it('an asserted human rights check cannot make an unknown capability allowed', () => {
    const payload = payloadOf(fullForm());
    payload.rights.display = { status: 'unknown', reason: 'no-basis' };
    const subject = createFormVersion(payload);
    expect(evaluateReleaseReview(subject, [decision(subject)], authority)).toMatchObject({
      status: 'blocked',
      productionEligible: false,
      problems: expect.arrayContaining(['display-or-retain-rights-not-established']),
    });
  });
  it('an authoring-count miss remains a blocker even with an approval assertion', () => {
    const payload = payloadOf(fullForm());
    payload.authoring.requirements[0]!.minimumItems = 20;
    const subject = createFormVersion(payload);
    expect(evaluateReleaseReview(subject, [decision(subject)], authority).productionEligible).toBe(
      false,
    );
  });
});
