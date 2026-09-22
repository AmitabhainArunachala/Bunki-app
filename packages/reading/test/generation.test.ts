import { assertNotCandidate, CandidateEvidenceBoundaryError } from '@bunki/domain';
import { describe, expect, it, vi } from 'vitest';

import {
  GENERATION_LIMITS,
  ReadingValidationError,
  acceptArticleDraft,
  articleReference,
  buildGenerationBrief,
  createArticleAnchor,
  normalizeArticleIntake,
  parseArticleCandidate,
  parseGenerationBrief,
  recordEditorialDecision,
  type ArticleAcceptanceBoundary,
  type ArticleCandidate,
  type ArticleDraft,
  type GenerationBriefInput,
  type GenerationJobIdentity,
} from '../src/index.ts';
import {
  BODY,
  DRAFT,
  LATER,
  NOW,
  WORDS,
  article,
  briefInput,
  capabilities,
  context,
  decision,
  draftContext,
  metadata,
} from './fixtures.ts';

function boundary(): ArticleAcceptanceBoundary {
  return {
    isCurrent: () => true,
    lookupWord: (form) => WORDS[form as keyof typeof WORDS] ?? null,
  };
}

function measuredLearner(): GenerationBriefInput['learner'] {
  return {
    modelVersion: 'kagami-1',
    bands: [
      {
        dimension: 'lexis',
        edge: 'N3',
        measured: 42,
        observed: 7,
        sampled: true,
        disagreement: false,
        evidenceRefs: ['private-recall-ref'],
      },
      {
        dimension: 'readings',
        edge: 'N4',
        measured: 18,
        observed: 4,
        sampled: true,
        disagreement: true,
        evidenceRefs: ['private-reading-ref'],
      },
      {
        dimension: 'syntax',
        edge: null,
        measured: 0,
        observed: 30,
        sampled: false,
        disagreement: false,
        evidenceRefs: ['private-observation-ref'],
      },
    ],
    targets: [
      {
        kind: 'grammar',
        form: 'によって',
        reason: 'recent-struggle',
        evidenceRefs: ['private-struggle-ref'],
      },
    ],
  };
}

describe('selected, bounded personalization briefs', () => {
  it('retains sparse evidence without fabricating a level or measured success', () => {
    const brief = buildGenerationBrief(briefInput());
    expect(brief.providerPayload.startingLevel).toBeNull();
    expect(brief.providerPayload.learningContext.bands).toEqual(
      ['lexis', 'readings', 'syntax', 'production'].map((dimension) => ({
        dimension,
        workingBand: null,
        evidence: 'sparse',
        observedSignalsPresent: false,
      })),
    );
    expect(brief.learner.bands).toEqual([]);
    expect(brief.settings.interests).toEqual(['space science', 'animals']);
    expect(parseGenerationBrief(JSON.parse(JSON.stringify(brief)))).toEqual(brief);
  });

  it('keeps measured, observed and conflicting dimensions separate without transmitting raw evidence identifiers/counts', () => {
    const brief = buildGenerationBrief(briefInput({ learner: measuredLearner() }));
    expect(brief.providerPayload.learningContext.bands).toEqual([
      { dimension: 'lexis', workingBand: 'N3', evidence: 'measured', observedSignalsPresent: true },
      {
        dimension: 'readings',
        workingBand: 'N4',
        evidence: 'conflicting',
        observedSignalsPresent: true,
      },
      { dimension: 'syntax', workingBand: null, evidence: 'sparse', observedSignalsPresent: true },
      {
        dimension: 'production',
        workingBand: null,
        evidence: 'sparse',
        observedSignalsPresent: false,
      },
    ]);
    expect(brief.providerPayload.learningContext.targets).toEqual([
      { kind: 'grammar', form: 'によって' },
    ]);
    expect(brief.learner.bands[0]?.measured).toBe(42);
    const payload = JSON.stringify(brief.providerPayload);
    for (const privateValue of [
      'private-learner',
      'private-session',
      'private-job',
      'private-recent',
      'private-recall',
      'private-reading',
      'private-observation',
      'private-struggle',
      'evidenceRefs',
      'measured":42',
      'observed":7',
    ]) {
      expect(payload).not.toContain(privateValue);
    }
  });

  it('revoked/removed measurements cannot leave an old edge as a precise ability claim', () => {
    const brief = buildGenerationBrief(
      briefInput({
        learner: {
          modelVersion: 'kagami-1',
          bands: [
            {
              dimension: 'lexis',
              edge: 'N1',
              measured: 0,
              observed: 50,
              sampled: true,
              disagreement: false,
            },
          ],
          targets: [],
        },
      }),
    );
    expect(brief.providerPayload.learningContext.bands[0]).toMatchObject({
      workingBand: null,
      evidence: 'sparse',
      observedSignalsPresent: true,
    });
  });

  it('explicit starting settings and harder text requests remain adjustable and distinct from measured ability', () => {
    const input = briefInput();
    const brief = buildGenerationBrief({
      ...input,
      settings: { ...input.settings, startingLevel: 'N2', challenge: 'stretch' },
    });
    expect(brief.providerPayload.startingLevel).toBe('N2');
    expect(brief.providerPayload.style.challenge).toBe('stretch');
    expect(
      brief.providerPayload.learningContext.bands.every((band) => band.workingBand === null),
    ).toBe(true);
  });

  it('same ability with different interests and same interests with different evidence produce different useful requests', () => {
    const input = briefInput();
    const first = buildGenerationBrief(input);
    const interestChanged = buildGenerationBrief({
      ...input,
      settings: { ...input.settings, interests: ['railways', 'regional food'] },
    });
    const evidenceChanged = buildGenerationBrief({ ...input, learner: measuredLearner() });
    expect(interestChanged.providerPayload.interests).toEqual(['railways', 'regional food']);
    expect(interestChanged.providerPayload.learningContext).toEqual(
      first.providerPayload.learningContext,
    );
    expect(evidenceChanged.providerPayload.interests).toEqual(first.providerPayload.interests);
    expect(evidenceChanged.providerPayload.learningContext).not.toEqual(
      first.providerPayload.learningContext,
    );
    expect(
      new Set([
        first.providerPayloadSha256,
        interestChanged.providerPayloadSha256,
        evidenceChanged.providerPayloadSha256,
      ]).size,
    ).toBe(3);
  });

  it('binds owner, job revision, prompt and model locally without putting those private references into the prompt', () => {
    const original = buildGenerationBrief(briefInput());
    const otherOwner = buildGenerationBrief(
      briefInput({ owner: { learnerId: 'father-profile', sessionEpoch: 'father-epoch' } }),
    );
    const otherJob = buildGenerationBrief(
      briefInput({ job: { id: 'private-job-1', revision: 1 } }),
    );
    const newPrompt = buildGenerationBrief(briefInput({ promptVersion: 'article-prompt-v2' }));
    const newModel = buildGenerationBrief(briefInput({ modelId: 'other-requested-model' }));
    for (const changed of [otherOwner, otherJob, newPrompt, newModel]) {
      expect(changed.briefId).not.toBe(original.briefId);
      expect(changed.providerPayload).toEqual(original.providerPayload);
    }
  });

  it('does not mutate the selected learner snapshot and freezes the request snapshot', () => {
    const input = briefInput({ learner: measuredLearner() });
    const before = JSON.parse(JSON.stringify(input));
    const brief = buildGenerationBrief(input);
    expect(input).toEqual(before);
    expect(Object.isFrozen(input)).toBe(false);
    expect(Object.isFrozen(brief.learner.bands)).toBe(true);
    expect(Object.isFrozen(brief.providerPayload.learningContext)).toBe(true);
  });

  it('rejects a whole record, chat, credentials or extra private fields instead of silently including them', () => {
    const secret = 'synthetic-secret-do-not-log';
    for (const extra of [
      { ledger: [{ secret }] },
      { chat: secret },
      { credentials: secret },
      { apiKey: secret },
    ]) {
      let failure: unknown;
      try {
        buildGenerationBrief({ ...briefInput(), ...extra });
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(ReadingValidationError);
      expect(String(failure)).not.toContain(secret);
    }
    expect(() =>
      buildGenerationBrief({ ...briefInput(), learner: { ...measuredLearner(), revlog: [] } }),
    ).toThrow(ReadingValidationError);
    expect(() =>
      buildGenerationBrief({
        ...briefInput(),
        settings: { ...briefInput().settings, credential: secret },
      }),
    ).toThrow(ReadingValidationError);
  });

  it('rejects over-budget context without retaining a truncated raw ledger', () => {
    const input = briefInput();
    expect(() =>
      buildGenerationBrief({
        ...input,
        settings: {
          ...input.settings,
          interests: Array.from(
            { length: GENERATION_LIMITS.interests + 1 },
            (_, index) => `interest ${index}`,
          ),
        },
      }),
    ).toThrow(ReadingValidationError);
    expect(() =>
      buildGenerationBrief({
        ...input,
        recentArticleIds: Array.from({ length: 41 }, (_, index) => `article-${index}`),
      }),
    ).toThrow(ReadingValidationError);
    expect(() =>
      buildGenerationBrief({
        ...input,
        settings: { ...input.settings, interests: ['x'.repeat(81)] },
      }),
    ).toThrow(ReadingValidationError);
    const selected = buildGenerationBrief({
      ...input,
      settings: {
        ...input.settings,
        interests: Array.from({ length: 12 }, (_, index) => `interest ${index}`),
      },
      recentTopics: Array.from({ length: 10 }, (_, index) => `recent topic ${index}`),
    });
    expect(JSON.stringify(selected.providerPayload).length).toBeLessThanOrEqual(
      GENERATION_LIMITS.providerPayloadCharacters,
    );
  });

  it('rejects duplicate model dimensions and contradictory fiction settings', () => {
    const learner = measuredLearner();
    expect(() =>
      buildGenerationBrief({
        ...briefInput(),
        learner: { ...learner, bands: [learner.bands[0], learner.bands[0]] },
      }),
    ).toThrow(ReadingValidationError);
    expect(() =>
      buildGenerationBrief({
        ...briefInput(),
        settings: { ...briefInput().settings, mode: 'original-factual' },
      }),
    ).toThrow(ReadingValidationError);
  });

  it('does not allow a persisted request to be changed behind its content hash', () => {
    const brief = buildGenerationBrief(briefInput());
    expect(() =>
      parseGenerationBrief({
        ...brief,
        providerPayload: { ...brief.providerPayload, interests: ['injected topic'] },
      }),
    ).toThrow(ReadingValidationError);
    expect(() =>
      parseGenerationBrief({ ...brief, owner: { ...brief.owner, learnerId: 'other-owner' } }),
    ).toThrow(ReadingValidationError);
    expect(() =>
      parseGenerationBrief({
        ...brief,
        providerPayload: { ...brief.providerPayload, credentials: 'synthetic' },
      }),
    ).toThrow(ReadingValidationError);
  });
});

describe('drafts remain original or explicitly adapted candidates', () => {
  it('accepts display text, validates dictionary suggestions and keeps editorial status pending', () => {
    const brief = buildGenerationBrief(briefInput());
    const candidate = acceptArticleDraft(DRAFT, brief, draftContext(), boundary());
    expect(candidate.kind).toBe('ArticleCandidate');
    expect(candidate.article.body?.text).toBe(BODY);
    expect(candidate.article.lineage.kind).toBe('original-fiction');
    expect(candidate.article.source.name).toBe('KAIRO original');
    expect(candidate.editorial.status).toBe('pending');
    expect(candidate.suggestedWords.map((word) => word.form)).toEqual(['犬', '猫']);
    expect(
      candidate.suggestedWords.every(
        (word) => word.source.versionId === candidate.article.versionId,
      ),
    ).toBe(true);
    expect(candidate.generationJob).toEqual({ owner: brief.owner, job: brief.job });
    expect(parseArticleCandidate(JSON.parse(JSON.stringify(candidate)))).toEqual(candidate);
    expect(() =>
      parseArticleCandidate({
        ...candidate,
        generationJob: {
          ...candidate.generationJob,
          owner: { learnerId: 'another-owner', sessionEpoch: 'other-session' },
        },
      }),
    ).toThrow(ReadingValidationError);
  });

  it('only offers words that both resolve locally and occur in the accepted text', () => {
    const candidate = acceptArticleDraft(
      { ...DRAFT, suggestedWords: ['犬', '魚', '猫'] },
      buildGenerationBrief(briefInput()),
      draftContext(),
      {
        isCurrent: () => true,
        lookupWord: (form) =>
          form === '魚'
            ? { lexemeId: 'lex-fish', form: '魚', reading: 'さかな' }
            : form === '猫'
              ? { lexemeId: 'lex-other', form: '鳥', reading: 'とり' }
              : WORDS.犬,
      },
    );
    expect(candidate.suggestedWords.map((word) => word.form)).toEqual(['犬']);
  });

  it('pins suggested vocabulary into the version, so changing a teaching suggestion cannot retain old approval', () => {
    const brief = buildGenerationBrief(briefInput());
    const first = acceptArticleDraft(DRAFT, brief, draftContext(), boundary());
    const approved = recordEditorialDecision(first, decision(first));
    const changed = acceptArticleDraft(
      { ...DRAFT, suggestedWords: ['犬'] },
      brief,
      draftContext(),
      boundary(),
    );
    expect(changed.article.body?.contentSha256).toBe(first.article.body?.contentSha256);
    expect(changed.article.versionId).not.toBe(first.article.versionId);
    expect(changed.editorial.status).toBe('pending');
    expect(() =>
      parseArticleCandidate({ ...approved, suggestedWords: changed.suggestedWords }),
    ).toThrow(ReadingValidationError);
  });

  it('replaying the same draft/job after a later local receipt does not manufacture a new edition', () => {
    const brief = buildGenerationBrief(briefInput());
    const first = acceptArticleDraft(DRAFT, brief, draftContext(), boundary());
    const later = acceptArticleDraft(
      DRAFT,
      brief,
      { ...draftContext(), completedAt: '2026-09-10T03:00:00.000Z' },
      boundary(),
    );
    expect(later.article.versionId).toBe(first.article.versionId);
    expect(later.candidateId).toBe(first.candidateId);
    expect(later.provenance[0]?.lastRetrievedAt).not.toBe(first.provenance[0]?.lastRetrievedAt);
  });

  it('factual references from the provider stay unverified and are never attributed as a newspaper original', () => {
    const input = briefInput();
    const brief = buildGenerationBrief({
      ...input,
      settings: { ...input.settings, mode: 'original-factual', genre: 'explainer' },
    });
    const candidate = acceptArticleDraft(
      {
        ...DRAFT,
        references: [{ title: 'Fixture space reference', url: 'https://science.example/research' }],
      },
      brief,
      draftContext(),
      boundary(),
    );
    expect(candidate.article.lineage).toMatchObject({
      kind: 'original-factual',
      references: [{ verifiedAt: null, evidenceRef: null }],
    });
    expect(candidate.automaticChecks.supportingReferences).toBe('present');
    expect(candidate.automaticChecks.factualAccuracy).toBe('not-checked');
    expect(candidate.article.source.id).toBe('kairo-original');
    expect(candidate.editorial.status).toBe('pending');
    const missing = acceptArticleDraft(DRAFT, brief, draftContext(), boundary());
    expect(missing.automaticChecks.supportingReferences).toBe('missing');
    expect(missing.editorial.status).toBe('pending');
  });

  it('rejects asserted verification, approval, grades and provider-created permissions', () => {
    const brief = buildGenerationBrief(briefInput());
    for (const extra of [
      { approved: true },
      { editorial: { status: 'approved' } },
      { taken: ['犬'] },
      { started: 1 },
      { srs: {} },
      { grade: 'good' },
      { commands: [{ type: 'Promote' }] },
      { capabilities: capabilities() },
      { owner: brief.owner },
    ]) {
      expect(() =>
        acceptArticleDraft({ ...DRAFT, ...extra }, brief, draftContext(), boundary()),
      ).toThrow(ReadingValidationError);
    }
    const factual = buildGenerationBrief({
      ...briefInput(),
      settings: { ...briefInput().settings, mode: 'original-factual', genre: 'essay' },
    });
    expect(() =>
      acceptArticleDraft(
        {
          ...DRAFT,
          references: [{ url: 'https://example.com', title: 'Claim', verifiedAt: LATER }],
        },
        factual,
        draftContext(),
        boundary(),
      ),
    ).toThrow(ReadingValidationError);
  });

  it('does not accept a fiction request as factual citation-backed news or an oversized short article', () => {
    const brief = buildGenerationBrief(briefInput());
    expect(() =>
      acceptArticleDraft(
        { ...DRAFT, references: [{ url: 'https://example.com', title: 'Claim' }] },
        brief,
        draftContext(),
        boundary(),
      ),
    ).toThrow(ReadingValidationError);
    expect(() =>
      acceptArticleDraft({ ...DRAFT, text: 'あ'.repeat(2001) }, brief, draftContext(), boundary()),
    ).toThrow(ReadingValidationError);
    expect(() =>
      acceptArticleDraft(DRAFT, brief, { ...draftContext(), capabilities: {} }, boundary()),
    ).toThrow(ReadingValidationError);
  });

  it('twenty accepted generated articles produce zero learning commands and fail the real evidence boundary', () => {
    const accepted: ArticleCandidate[] = [];
    for (let index = 0; index < 20; index += 1) {
      const brief = buildGenerationBrief(briefInput({ job: { id: `job-${index}`, revision: 0 } }));
      const candidate = acceptArticleDraft(
        { ...DRAFT, title: `月の話 ${index + 1}` },
        brief,
        draftContext(),
        boundary(),
      );
      accepted.push(candidate);
      expect(() => assertNotCandidate(candidate)).toThrow(CandidateEvidenceBoundaryError);
      expect(Object.keys(candidate).sort()).toEqual(
        [
          'article',
          'automaticChecks',
          'candidateId',
          'editorial',
          'generationJob',
          'kind',
          'provenance',
          'suggestedWords',
        ].sort(),
      );
      expect(candidate.editorial.status).toBe('pending');
    }
    expect(accepted).toHaveLength(20);
    expect(new Set(accepted.map((candidate) => candidate.article.articleId)).size).toBe(20);
    expect(accepted.flatMap((candidate) => candidate.suggestedWords)).toHaveLength(40);
  });
});

describe('owner and job acceptance boundaries', () => {
  it.each([NOW, '2026-09-09T01:00:00.000Z'])(
    'accepts a current-owner reply after an equal/backwards wall clock and preserves the raw receipt %s',
    (completedAt) => {
      const brief = buildGenerationBrief(briefInput());
      const candidate = acceptArticleDraft(
        DRAFT,
        brief,
        { ...draftContext(), completedAt },
        boundary(),
      );
      expect(candidate.provenance[0]?.firstRetrievedAt).toBe(completedAt);
      expect(candidate.provenance[0]?.lastRetrievedAt).toBe(completedAt);
      expect(candidate.generationJob).toEqual({ owner: brief.owner, job: brief.job });
      expect(() =>
        acceptArticleDraft(
          DRAFT,
          brief,
          { ...draftContext(), completedAt },
          { ...boundary(), isCurrent: () => false },
        ),
      ).toThrowError(expect.objectContaining({ code: 'stale-generation' }));
    },
  );

  it('refuses a completed old-owner request before even looking up its suggested words', async () => {
    const brief = buildGenerationBrief(briefInput());
    let owner = brief.owner;
    let resolveDraft: ((value: ArticleDraft) => void) | undefined;
    const pending = new Promise<ArticleDraft>((resolve) => {
      resolveDraft = resolve;
    });
    const lookupWord = vi.fn(boundary().lookupWord);
    const handle = pending.then((raw) =>
      acceptArticleDraft(raw, brief, draftContext(), {
        isCurrent: (identity) =>
          identity.owner.learnerId === owner.learnerId &&
          identity.owner.sessionEpoch === owner.sessionEpoch,
        lookupWord,
      }),
    );
    owner = { learnerId: 'father-profile', sessionEpoch: 'new-session' };
    resolveDraft?.(DRAFT);
    await expect(handle).rejects.toMatchObject({ code: 'stale-generation' });
    expect(lookupWord).not.toHaveBeenCalled();
  });

  it.each(['sessionEpoch', 'jobRevision', 'jobId'])(
    'refuses an obsolete %s even for the same learner',
    (change) => {
      const brief = buildGenerationBrief(briefInput());
      const current: GenerationJobIdentity = {
        owner: {
          ...brief.owner,
          sessionEpoch: change === 'sessionEpoch' ? 'new-session' : brief.owner.sessionEpoch,
        },
        job: {
          id: change === 'jobId' ? 'new-job' : brief.job.id,
          revision: change === 'jobRevision' ? 1 : brief.job.revision,
        },
      };
      expect(() =>
        acceptArticleDraft(DRAFT, brief, draftContext(), {
          ...boundary(),
          isCurrent: (identity) => JSON.stringify(identity) === JSON.stringify(current),
        }),
      ).toThrowError(expect.objectContaining({ code: 'stale-generation' }));
    },
  );

  it('rechecks after a synchronous host callback changes ownership', () => {
    let current = true;
    expect(() =>
      acceptArticleDraft(DRAFT, buildGenerationBrief(briefInput()), draftContext(), {
        isCurrent: () => current,
        lookupWord: (form) => {
          current = false;
          return boundary().lookupWord(form);
        },
      }),
    ).toThrowError(expect.objectContaining({ code: 'stale-generation' }));
  });

  it('throws instead of accepting when the injected authority fails', () => {
    expect(() =>
      acceptArticleDraft(DRAFT, buildGenerationBrief(briefInput()), draftContext(), {
        ...boundary(),
        isCurrent: () => {
          throw new Error('fixture authority unavailable');
        },
      }),
    ).toThrow('fixture authority unavailable');
  });
});

describe('a bounded source adaptation', () => {
  it('sends only a permitted anchored excerpt, binds lineage and keeps source text in the data role', () => {
    const parent = article().article;
    const anchor = createArticleAnchor(parent, { start: 0, end: BODY.length, quote: BODY });
    const input = briefInput();
    const brief = buildGenerationBrief({
      ...input,
      settings: { ...input.settings, mode: 'source-adaptation', genre: 'explainer' },
      source: { article: parent, anchor },
    });
    expect(brief.providerPayload.sourceExcerpt).toEqual({
      title: parent.title,
      attribution: parent.source.attribution,
      url: parent.canonicalUrl,
      text: BODY,
      contentRole: 'untrusted-source-text',
    });
    expect(brief.source).toEqual(articleReference(parent));
    expect(JSON.stringify(brief.providerPayload)).not.toContain(parent.articleId);
    const candidate = acceptArticleDraft(
      DRAFT,
      brief,
      { ...draftContext(), sourceArticle: parent },
      boundary(),
    );
    expect(candidate.article.source.id).toBe('kairo-adaptation');
    expect(candidate.article.lineage).toMatchObject({
      kind: 'source-adaptation',
      parents: [articleReference(parent)],
    });
    expect(candidate.editorial.status).toBe('pending');
  });

  it('denied AI processing and a different parent version cannot reach draft acceptance', () => {
    const parent = article().article;
    const anchor = createArticleAnchor(parent, { start: 0, end: BODY.length, quote: BODY });
    const input = briefInput();
    const settings = { ...input.settings, mode: 'source-adaptation', genre: 'explainer' };
    const brief = buildGenerationBrief({ ...input, settings, source: { article: parent, anchor } });
    const changed = normalizeArticleIntake(
      metadata({ body: { text: `変更。${BODY}` } }),
      context(),
    ).article;
    expect(() =>
      acceptArticleDraft(DRAFT, brief, { ...draftContext(), sourceArticle: changed }, boundary()),
    ).toThrow(ReadingValidationError);
    expect(() => acceptArticleDraft(DRAFT, brief, draftContext(), boundary())).toThrow(
      ReadingValidationError,
    );
    const denied = normalizeArticleIntake(
      metadata(),
      context({
        capabilities: capabilities({
          'ai-transform': { status: 'unknown', reason: 'not-established' },
        }),
      }),
    ).article;
    expect(() =>
      buildGenerationBrief({
        ...input,
        settings,
        source: {
          article: denied,
          anchor: createArticleAnchor(denied, { start: 0, end: BODY.length, quote: BODY }),
        },
      }),
    ).toThrow(ReadingValidationError);
  });
});
