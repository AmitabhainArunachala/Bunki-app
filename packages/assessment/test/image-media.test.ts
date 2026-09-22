import { inputHashOf, sha256Hex } from '@bunki/ai/hash';
import { describe, expect, it } from 'vitest';
import {
  artifactReference,
  assessAttemptAdmission,
  beginAttempt,
  checkpointAttempt,
  createEditorialDecision,
  createFormVersion,
  createItemVersion,
  createMediaVersion,
  EDITORIAL_ASPECTS,
  evaluateReleaseReview,
  OPTIONAL_EDITORIAL_ASPECTS,
  parseAttempt,
  parseEditorialDecision,
  parseFormVersion,
  parseMediaVersion,
  scoreAttempt,
  unknownAssessmentRights,
  type AttemptFact,
  type EditorialDecision,
  type FormVersion,
} from '../src/index.ts';
import {
  answerFacts,
  authority,
  checkpointCommand,
  clone,
  complete,
  decision,
  factBase,
  form,
  fullForm,
  item,
  NOW,
  payloadOf,
  provenance,
  rights,
  start,
} from './fixtures.ts';
import expectedIdentities from './media-compatibility.json';
import { mediaCompatibilityObservations } from './media-compatibility.ts';

/** Synthetic metadata and grants below are test inputs, never authenticated media or review. */
const imagePayload = (change: Record<string, unknown> = {}) => ({
  format: 'kairo-assessment-media',
  v: 1,
  id: 'image:fixture',
  provenance,
  rights,
  kind: 'image',
  assetId: 'illustration-fixture-001',
  bytesSha256: sha256Hex('synthetic metadata only; no image bytes supplied'),
  mimeType: 'image/png',
  width: 640,
  height: 480,
  alt: '二人が駅の入口で待っています。',
  ...change,
});
function imageForm() {
  const image = createMediaVersion(imagePayload());
  return form([item('illustrated', { media: [artifactReference(image)] })], { media: [image] });
}
function mixedForm(full = false) {
  const old = fullForm();
  const audio = old.media[0]!;
  const image = createMediaVersion(imagePayload());
  if (!full)
    return form(
      [
        item('mixed-listening', {
          skill: 'listening',
          media: [artifactReference(image), artifactReference(audio)],
        }),
      ],
      { media: [image, audio] },
    );
  const payload = payloadOf(old);
  const selected = payload.items.find((entry) => entry.skill === 'listening')!;
  payload.items = payload.items.map((entry) =>
    entry.id === selected.id
      ? clone(
          createItemVersion({
            ...payloadOf(entry),
            media: [...entry.media, artifactReference(image)],
          }),
        )
      : entry,
  );
  payload.media.push(clone(image));
  return createFormVersion(payload);
}
function visualDecision(
  subject: FormVersion,
  visual: 'pass' | 'not-applicable' = 'pass',
  audio: 'pass' | 'not-applicable' = 'not-applicable',
) {
  const original = payloadOf(decision(subject));
  return createEditorialDecision({
    ...original,
    aspects: [
      ...original.aspects.map((entry) =>
        entry.aspect === 'audio' ? { ...entry, result: audio } : entry,
      ),
      {
        aspect: 'visual',
        result: visual,
        note: 'Synthetic visual-review assertion. No actual image was reviewed.',
        evidenceRefs: ['fixture-visual-check'],
      },
    ],
  });
}
function reviewedStart(subject: FormVersion, record: EditorialDecision) {
  const review = evaluateReleaseReview(subject, [record], authority);
  expect(review.productionEligible).toBe(true);
  return beginAttempt(subject, {
    attemptId: 'attempt:synthetic-image',
    scope: { accountId: 'fixture-account', learnerId: 'fixture-learner' },
    mode: 'timed',
    priorExposure: 'none-reported',
    startedAt: NOW,
    clockStatus: 'continuous',
    editorialAtStart: {
      status: 'reviewed',
      authorityPolicyVersion: review.authorityPolicyVersion,
      decisionRevisionIds: review.decisionRevisionIds,
    },
  });
}

describe('typed raster illustration metadata', () => {
  it.each(['image/png', 'image/jpeg', 'image/webp'])(
    'round trips %s metadata without asserting actual bytes or granting rights',
    (mimeType) => {
      const raw = imagePayload({
        mimeType,
        rights: unknownAssessmentRights(),
        width: 1,
        height: 8192,
      });
      const version = createMediaVersion(raw);
      expect(version.kind).toBe('image');
      if (version.kind !== 'image') throw new Error('image fixture');
      expect(version.width).toBe(1);
      expect(version.height).toBe(8192);
      expect(version.alt).toBe(raw.alt);
      expect(version.rights.display.status).toBe('unknown');
      expect(version.rights['synthesize-audio'].status).toBe('unknown');
      expect(Object.isFrozen(version)).toBe(true);
      expect(parseMediaVersion(JSON.parse(JSON.stringify(version)))).toEqual(version);
      raw.alt = 'Caller changed its data';
      expect(version.alt).not.toBe(raw.alt);
      expect('durationMs' in version).toBe(false);
      expect('speakers' in version).toBe(false);
    },
  );
  it.each([
    'image/svg+xml',
    'image/gif',
    'image/avif',
    'text/html',
    'audio/mp4',
    'image/png;foo=bar',
  ])('rejects unsupported raster MIME %s', (mimeType) => {
    expect(() => createMediaVersion(imagePayload({ mimeType }))).toThrow();
  });
  it.each([
    'https://example.invalid/image.png',
    'file:/image.png',
    'data:image',
    'blob:asset',
    'ftp:asset',
    'namespace:asset',
    'javascript:alert',
    '../image',
    '/image',
    'image\\file',
    'image%2Ffile',
    'image?token',
    'image#fragment',
    'image key',
    '',
  ])('rejects URL/path/encoded asset locator %s', (assetId) => {
    expect(() => createMediaVersion(imagePayload({ assetId }))).toThrow();
  });
  it.each(['width', 'height'])('requires positive bounded integral %s metadata', (field) => {
    for (const value of [
      undefined,
      null,
      0,
      -1,
      1.5,
      8193,
      Number.MAX_SAFE_INTEGER,
      NaN,
      Infinity,
    ]) {
      expect(() => createMediaVersion(imagePayload({ [field]: value }))).toThrow();
    }
  });
  it.each(['', '  ', 'あ'.repeat(2001), '\u0000', '\ud800'])(
    'rejects missing, malformed or unbounded alt text %#',
    (alt) => {
      expect(() => createMediaVersion(imagePayload({ alt }))).toThrow();
    },
  );
  it.each(['', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)])(
    'requires exact lowercase SHA-256 claim %#',
    (bytesSha256) => {
      expect(() => createMediaVersion(imagePayload({ bytesSha256 }))).toThrow();
    },
  );
  it('requires every image field and never borrows audio-only fields', () => {
    for (const field of ['kind', 'assetId', 'bytesSha256', 'mimeType', 'width', 'height', 'alt']) {
      const raw: Record<string, unknown> = imagePayload();
      delete raw[field];
      expect(() => createMediaVersion(raw)).toThrow();
    }
    for (const field of [
      'durationMs',
      'transcript',
      'transcriptSha256',
      'speakers',
      'approved',
      'url',
    ]) {
      expect(() =>
        createMediaVersion(imagePayload({ [field]: field === 'speakers' ? [] : 'untrusted' })),
      ).toThrow();
    }
    expect(() =>
      createMediaVersion({ ...payloadOf(fullForm().media[0]!), width: 4, height: 4, alt: 'extra' }),
    ).toThrow();
  });
  it('does not invoke image metadata getters', () => {
    let reads = 0;
    const raw = imagePayload();
    Object.defineProperty(raw, 'alt', {
      enumerable: true,
      get: () => {
        reads++;
        return 'not read';
      },
    });
    expect(() => createMediaVersion(raw)).toThrow();
    expect(reads).toBe(0);
  });
  it.each([
    ['assetId', 'other-asset'],
    ['bytesSha256', 'a'.repeat(64)],
    ['mimeType', 'image/jpeg'],
    ['width', 641],
    ['height', 481],
    ['alt', '別の説明'],
  ])('binds %s to the exact media revision', (field, value) => {
    const original = createMediaVersion(imagePayload());
    expect(() => parseMediaVersion({ ...original, [field]: value })).toThrow();
    expect(createMediaVersion({ ...payloadOf(original), [field]: value }).sha256).not.toBe(
      original.sha256,
    );
  });
  it('requires exact image references and rejects orphan illustrations', () => {
    const subject = imageForm();
    expect(parseFormVersion(subject)).toEqual(subject);
    const changed = payloadOf(subject);
    changed.media[0] = clone(createMediaVersion(imagePayload({ alt: 'A revised description' })));
    expect(() => createFormVersion(changed)).toThrow(/reference-mismatch/u);
    const orphan = createMediaVersion(imagePayload());
    expect(() => form([item()], { media: [orphan] })).toThrow(/unreferenced-assets/u);
  });
  it('an image cannot satisfy listening admission, including an image tagged with audio MIME', () => {
    const image = createMediaVersion(imagePayload());
    expect(() =>
      form([item('listening', { skill: 'listening', media: [artifactReference(image)] })], {
        media: [image],
      }),
    ).toThrow(/item.media/u);
    expect(() => createMediaVersion(imagePayload({ mimeType: 'audio/mp4' }))).toThrow();
    expect(parseFormVersion(mixedForm())).toEqual(mixedForm());
  });
  it('keeps existing constructor bytes and identities exact', () => {
    expect(mediaCompatibilityObservations()).toEqual(expectedIdentities);
    expect(expectedIdentities).toHaveLength(58);
  });
});

describe('illustration review is explicit and audio review is unchanged', () => {
  it('freezes both exported checklists against JavaScript array and property mutation', () => {
    for (const catalog of [EDITORIAL_ASPECTS, OPTIONAL_EDITORIAL_ASPECTS]) {
      const before = [...catalog];
      expect(Object.isFrozen(catalog)).toBe(true);
      for (const mutate of [
        () => Reflect.apply(Array.prototype.pop, catalog, []),
        () => Reflect.apply(Array.prototype.push, catalog, ['unrelated']),
        () => Reflect.apply(Array.prototype.splice, catalog, [0, 1]),
        () => Object.defineProperty(catalog, '0', { value: 'unrelated' }),
      ]) {
        expect(mutate).toThrow(TypeError);
        expect([...catalog]).toEqual(before);
      }
      expect(Reflect.set(catalog, '0', 'unrelated')).toBe(false);
      expect(Reflect.set(catalog, 'length', 0)).toBe(false);
      expect(Reflect.deleteProperty(catalog, '0')).toBe(false);
      expect(Reflect.setPrototypeOf(catalog, null)).toBe(false);
      expect(Object.getPrototypeOf(catalog)).toBe(Array.prototype);
      expect([...catalog]).toEqual(before);
    }
  });
  it('refuses correctly rehashed missing-base decisions after attempted checklist mutation', () => {
    const subject = mixedForm();
    const approved = payloadOf(visualDecision(subject, 'pass', 'pass'));
    expect(() => Reflect.apply(Array.prototype.pop, EDITORIAL_ASPECTS, [])).toThrow(TypeError);
    expect(EDITORIAL_ASPECTS).toEqual([
      'language',
      'answer-key',
      'level-fit',
      'coverage',
      'timing',
      'rights',
      'audio',
    ]);
    for (const missing of EDITORIAL_ASPECTS) {
      const raw = {
        ...approved,
        aspects: approved.aspects.filter((entry) => entry.aspect !== missing),
      };
      // Correct hashing of an incoming claim cannot replace a required review aspect.
      const sha256 = inputHashOf(raw);
      const imported = { ...raw, sha256, revisionId: `assessment-editorial:${sha256}` };
      expect(() => createEditorialDecision(raw)).toThrow(/aspects/u);
      expect(() => parseEditorialDecision(imported)).toThrow(/aspects/u);
      expect(() => evaluateReleaseReview(subject, [imported], authority)).toThrow(/aspects/u);
    }
  });
  it('keeps mixed-form audio and visual requirements after refused optional catalog mutation', () => {
    expect(Reflect.set(OPTIONAL_EDITORIAL_ASPECTS, '0', 'unrelated')).toBe(false);
    expect(OPTIONAL_EDITORIAL_ASPECTS).toEqual(['visual']);
    for (const full of [false, true]) {
      const subject = mixedForm(full);
      expect(
        evaluateReleaseReview(subject, [visualDecision(subject, 'pass', 'pass')], authority)
          .productionEligible,
      ).toBe(true);
      expect(
        evaluateReleaseReview(
          subject,
          [visualDecision(subject, 'pass', 'not-applicable')],
          authority,
        ).productionEligible,
      ).toBe(false);
      expect(
        evaluateReleaseReview(
          subject,
          [visualDecision(subject, 'not-applicable', 'pass')],
          authority,
        ).productionEligible,
      ).toBe(false);
      expect(
        evaluateReleaseReview(subject, [decision(subject)], authority).productionEligible,
      ).toBe(false);
    }
  });

  it('keeps the seven-aspect export exact and separates optional visual review', () => {
    expect(EDITORIAL_ASPECTS).toEqual([
      'language',
      'answer-key',
      'level-fit',
      'coverage',
      'timing',
      'rights',
      'audio',
    ]);
    expect(OPTIONAL_EDITORIAL_ASPECTS).toEqual(['visual']);
    const old = decision(form());
    expect(old.aspects).toHaveLength(7);
    expect(parseEditorialDecision(JSON.parse(JSON.stringify(old)))).toEqual(old);
  });
  it.each(EDITORIAL_ASPECTS)('visual cannot replace required base aspect %s', (missing) => {
    const original = payloadOf(visualDecision(imageForm()));
    expect(() =>
      createEditorialDecision({
        ...original,
        aspects: original.aspects.filter((entry) => entry.aspect !== missing),
      }),
    ).toThrow(/aspects/u);
  });
  it('rejects duplicate base or visual entries and unrelated review aspects', () => {
    const original = payloadOf(visualDecision(imageForm()));
    expect(() =>
      createEditorialDecision({
        ...original,
        aspects: [...original.aspects, original.aspects.at(-1)],
      }),
    ).toThrow();
    expect(() =>
      createEditorialDecision({
        ...original,
        aspects: [original.aspects[1], ...original.aspects.slice(1)],
      }),
    ).toThrow();
    expect(() =>
      createEditorialDecision({
        ...original,
        aspects: original.aspects.map((entry) =>
          entry.aspect === 'visual' ? { ...entry, aspect: 'generic-media' } : entry,
        ),
      }),
    ).toThrow();
  });
  it('requires an explicit visual pass even when a seven-aspect decision names the exact image form', () => {
    const subject = imageForm();
    expect(evaluateReleaseReview(subject, [decision(subject)], authority)).toMatchObject({
      productionEligible: false,
      status: 'unreviewed',
      problems: ['required-review-aspects-not-passed'],
    });
    expect(
      evaluateReleaseReview(subject, [visualDecision(subject, 'not-applicable')], authority)
        .productionEligible,
    ).toBe(false);
    expect(evaluateReleaseReview(subject, [visualDecision(subject)], authority)).toMatchObject({
      status: 'reviewed-practice',
      productionEligible: true,
    });
  });
  it('allows visual-only practice audio not-applicable but still requires audio pass on mixed forms', () => {
    const visual = imageForm();
    expect(
      evaluateReleaseReview(visual, [visualDecision(visual)], authority).productionEligible,
    ).toBe(true);
    for (const full of [false, true]) {
      const subject = mixedForm(full);
      expect(
        evaluateReleaseReview(subject, [visualDecision(subject)], authority).productionEligible,
      ).toBe(false);
      expect(
        evaluateReleaseReview(subject, [visualDecision(subject, 'pass', 'pass')], authority)
          .productionEligible,
      ).toBe(true);
      expect(
        evaluateReleaseReview(subject, [decision(subject)], authority).productionEligible,
      ).toBe(false);
    }
  });
  it('a visual failure cannot become an approval assertion', () => {
    const subject = imageForm();
    const payload = payloadOf(visualDecision(subject));
    const aspects = payload.aspects.map((entry) =>
      entry.aspect === 'visual' ? { ...entry, result: 'fail' as const } : entry,
    );
    expect(() => createEditorialDecision({ ...payload, aspects })).toThrow(/verdict/u);
    const observed = createEditorialDecision({ ...payload, aspects, verdict: 'review' });
    expect(evaluateReleaseReview(subject, [observed], authority).productionEligible).toBe(false);
  });
  it('a visual assertion cannot authenticate a reviewer, grant rights or defeat rejection', () => {
    const subject = imageForm();
    const approved = visualDecision(subject);
    expect(evaluateReleaseReview(subject, [approved], null).productionEligible).toBe(false);
    expect(
      evaluateReleaseReview(subject, [approved], {
        ...authority,
        reviewerIds: ['different-reviewer'],
      }).productionEligible,
    ).toBe(false);
    expect(
      evaluateReleaseReview(subject, [approved], {
        ...authority,
        checklistVersion: 'different-checklist',
      }).productionEligible,
    ).toBe(false);
    expect(
      evaluateReleaseReview(
        subject,
        [approved, decision(subject, 'reject', 'fixture-rejection')],
        authority,
      ).status,
    ).toBe('blocked');
    expect(() =>
      createEditorialDecision({
        ...payloadOf(approved),
        reviewer: { kind: 'automated', id: 'fixture-reviewer' },
      }),
    ).toThrow();
    const image = createMediaVersion(imagePayload({ rights: unknownAssessmentRights() }));
    const uncleared = form([item('uncleared-image', { media: [artifactReference(image)] })], {
      media: [image],
    });
    expect(evaluateReleaseReview(uncleared, [visualDecision(uncleared)], authority)).toMatchObject({
      productionEligible: false,
      problems: expect.arrayContaining(['display-or-retain-rights-not-established']),
    });
  });
  it('changed media or newly added visual aspect cannot retain prior decision identity', () => {
    const subject = imageForm();
    const old = decision(subject);
    const changed = clone(old);
    changed.aspects.push(clone(visualDecision(subject).aspects.at(-1)!));
    expect(() => parseEditorialDecision(changed)).toThrow(/revision-mismatch/u);
    const payload = payloadOf(subject);
    const image = createMediaVersion(imagePayload({ alt: 'Changed illustration description' }));
    payload.media = [clone(image)];
    payload.items = [
      clone(
        createItemVersion({ ...payloadOf(subject.items[0]!), media: [artifactReference(image)] }),
      ),
    ];
    const next = createFormVersion(payload);
    expect(
      evaluateReleaseReview(next, [visualDecision(subject)], authority).productionEligible,
    ).toBe(false);
  });
});

describe('audio facts remain audio-only', () => {
  it.each(['start', 'pause', 'seek', 'replay', 'ended', 'error'] as const)(
    'refuses %s audio facts targeting an exact image reference',
    (action) => {
      for (const subject of [imageForm(), mixedForm()]) {
        const initial = start(subject);
        const selected = subject.items[0]!;
        const image = subject.media.find((entry) => entry.kind === 'image')!;
        const fact: AttemptFact = {
          ...factBase(subject, selected, 'synthetic-image-audio'),
          kind: 'audio',
          action,
          positionMs: 0,
          media: { ...artifactReference(image), kind: 'media' },
        };
        expect(() =>
          checkpointAttempt(subject, initial, checkpointCommand(initial, [fact])),
        ).toThrow(/facts.media/u);
      }
    },
  );
  it('scores image-only responses without playback evaluation or audio facts', () => {
    const subject = imageForm();
    const finished = complete(subject);
    expect(parseAttempt(subject, finished)).toEqual(finished);
    expect(finished.facts.some((fact) => fact.kind === 'audio')).toBe(false);
    expect(scoreAttempt(subject, finished)).toMatchObject({
      correct: 1,
      scorableItems: 1,
      officialScore: null,
      certification: 'none',
      passPrediction: null,
    });
    expect(assessAttemptAdmission(subject, finished).reasons).not.toContain(
      'listening-completion-unverified',
    );
  });
  it('mixed full-form completion requires only its audio playback and retains separate admission authority', () => {
    const subject = mixedForm(true);
    const initial = reviewedStart(subject, visualDecision(subject, 'pass', 'pass'));
    const finished = complete(subject, initial);
    const audioIds = subject.media
      .filter((entry) => entry.kind === 'audio')
      .map((entry) => entry.id);
    expect(
      finished.facts.filter((fact) => fact.kind === 'audio').map((fact) => fact.media.id),
    ).toEqual([...audioIds, ...audioIds]);
    expect(scoreAttempt(subject, finished).correct).toBe(subject.items.length);
    expect(assessAttemptAdmission(subject, finished)).toMatchObject({
      disposition: 'candidate-for-separate-domain-gate',
      reasons: [],
      evidenceAdmitted: false,
      scheduling: 'unchanged',
      officialScore: null,
    });
  });
  it('mixed forms still reject missing audio completion and out-of-bounds audio positions', () => {
    const subject = mixedForm();
    const selected = subject.items[0]!;
    const initial = start(subject);
    const finished = checkpointAttempt(
      subject,
      initial,
      checkpointCommand(initial, answerFacts(subject, selected), 'submitted'),
    );
    expect(assessAttemptAdmission(subject, finished).reasons).toContain(
      'listening-completion-unverified',
    );
    const audio = subject.media.find((entry) => entry.kind === 'audio')!;
    if (audio.kind !== 'audio') throw new Error('audio fixture');
    const invalid: AttemptFact = {
      ...factBase(subject, selected, 'audio-bounds'),
      kind: 'audio',
      action: 'ended',
      positionMs: audio.durationMs + 1,
      media: { ...artifactReference(audio), kind: 'media' },
    };
    expect(() =>
      checkpointAttempt(subject, initial, checkpointCommand(initial, [invalid])),
    ).toThrow(/positionMs/u);
  });
});
