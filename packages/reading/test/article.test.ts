import { sha256Hex } from '@bunki/ai/hash';
import { describe, expect, it } from 'vitest';

import {
  ARTICLE_OPERATIONS,
  ReadingValidationError,
  articleReference,
  canPerformArticleOperation,
  canonicalWebUrl,
  createArticleAnchor,
  normalizeArticleIntake,
  parseArticleCandidate,
  parseArticleVersion,
  recordEditorialDecision,
  resolveArticleAnchor,
} from '../src/index.ts';
import {
  ALLOWED,
  BODY,
  LATER,
  NOW,
  article,
  capabilities,
  context,
  decision,
  metadata,
} from './fixtures.ts';

describe('source intake identity and provenance', () => {
  it('repeated intake preserves one immutable version and both retrieval endpoints', () => {
    const first = article();
    const observedLater = context({
      provenance: context().provenance.map((entry) => ({ ...entry, retrievedAt: LATER })),
    });
    const second = normalizeArticleIntake(metadata(), observedLater, first);
    const replay = normalizeArticleIntake(metadata(), observedLater, second);
    expect(second.article).toEqual(first.article);
    expect(second.candidateId).toBe(first.candidateId);
    expect(second.provenance).toHaveLength(1);
    expect(second.provenance[0]).toMatchObject({ firstRetrievedAt: NOW, lastRetrievedAt: LATER });
    expect(replay).toEqual(second);
    expect(first.provenance[0]?.lastRetrievedAt).toBe(NOW);
  });

  it('keeps distinct provenance snapshots without deduplicating by title', () => {
    const first = article();
    const second = normalizeArticleIntake(
      metadata(),
      context({
        provenance: context().provenance.map((entry) => ({ ...entry, sourceVersion: 'feed-2' })),
      }),
      first,
    );
    expect(second.article.versionId).toBe(first.article.versionId);
    expect(second.provenance.map((entry) => entry.sourceVersion).sort()).toEqual([
      'feed-1',
      'feed-2',
    ]);
    const another = normalizeArticleIntake(metadata({ itemId: 'different-item' }), context());
    expect(another.article.articleId).not.toBe(first.article.articleId);
    expect(another.article.title).toBe(first.article.title);
  });

  it('falls back to a canonical URL only when a source has no item ID', () => {
    const first = normalizeArticleIntake(
      metadata({ itemId: null, canonicalUrl: 'https://PUBLISHER.example:443/a#first' }),
      context(),
    );
    const second = normalizeArticleIntake(
      metadata({ itemId: null, canonicalUrl: 'https://publisher.example/a#second' }),
      context(),
    );
    expect(second.article).toEqual(first.article);
    expect(first.article.canonicalUrl).toBe('https://publisher.example/a');
    expect(
      normalizeArticleIntake(
        metadata({ itemId: null, canonicalUrl: 'https://publisher.example/a?edition=2' }),
        context(),
      ).article.articleId,
    ).not.toBe(first.article.articleId);
  });

  it('rejects a previous candidate belonging to another source item', () => {
    expect(() =>
      normalizeArticleIntake(metadata({ itemId: 'other' }), context(), article()),
    ).toThrow(ReadingValidationError);
  });

  it('preserves exact body bytes and isolates the caller from immutable output', () => {
    const mutable = { ...metadata(), body: { text: BODY } };
    const candidate = normalizeArticleIntake(mutable, context());
    mutable.body.text = '変更';
    expect(candidate.article.body?.text).toBe(BODY);
    expect(candidate.article.body?.contentSha256).toBe(sha256Hex(BODY));
    expect(Object.isFrozen(candidate.article.body)).toBe(true);
    expect(Object.isFrozen(candidate.provenance)).toBe(true);
  });
});

describe('source operation checks', () => {
  it('keeps a denied or unknown body as a useful publisher-site item without retaining text', () => {
    for (const status of ['denied', 'unknown'] as const) {
      const candidate = normalizeArticleIntake(
        metadata(),
        context({
          capabilities: capabilities({
            'display-body': { status, reason: 'fixture-basis-unavailable' },
          }),
        }),
      );
      expect(candidate.article.kind).toBe('publisher-site-link');
      expect(candidate.article.canonicalUrl).toBe('https://publisher.example/article/1');
      expect(candidate.article.body).toBeNull();
      expect(JSON.stringify(candidate)).not.toContain(BODY);
      expect(canPerformArticleOperation(candidate.article, 'discover-metadata')).toBe(true);
      for (const operation of ARTICLE_OPERATIONS.filter((name) => name !== 'discover-metadata')) {
        expect(canPerformArticleOperation(candidate.article, operation)).toBe(false);
        expect(candidate.article.capabilities[operation].status).not.toBe('allowed');
      }
    }
  });

  it('a permitted reader body still has no implicit offline, sync, transformation or audio permission', () => {
    const candidate = normalizeArticleIntake(
      metadata(),
      context({
        capabilities: { 'display-body': ALLOWED },
      }),
    );
    expect(candidate.article.kind).toBe('full-reader-article');
    expect(canPerformArticleOperation(candidate.article, 'display-body')).toBe(true);
    for (const operation of [
      'retain-offline',
      'sync-body',
      'quote-extract',
      'ai-transform',
      'synthesize-audio',
      'redistribute-audio',
      'new-unknown-operation',
    ]) {
      expect(canPerformArticleOperation(candidate.article, operation)).toBe(false);
    }
    expect(() =>
      createArticleAnchor(candidate.article, { start: 0, end: 2, quote: '宇宙' }),
    ).toThrow(ReadingValidationError);
  });

  it('a missing body cannot retain capabilities that require one', () => {
    const candidate = normalizeArticleIntake(metadata({ body: null }), context());
    expect(candidate.article.kind).toBe('publisher-site-link');
    expect(candidate.article.capabilities['retain-offline']).toEqual({
      status: 'unknown',
      reason: 'body-unavailable',
    });
  });

  it('feed metadata cannot grant itself capabilities or editorial approval', () => {
    for (const extra of [
      { capabilities: capabilities() },
      { editorial: { status: 'approved' } },
      { grade: 'good' },
    ]) {
      expect(() => normalizeArticleIntake({ ...metadata(), ...extra }, context())).toThrow(
        ReadingValidationError,
      );
    }
    expect(() =>
      normalizeArticleIntake(
        metadata(),
        context({ capabilities: { unsupported: { status: 'allowed' } } } as never),
      ),
    ).toThrow(ReadingValidationError);
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///etc/passwd',
    '//example.com/a',
    'https://user:password@example.com/a',
    'https://example.com\\@evil.example/a',
    'https://example.com/\npage',
    ' https://example.com/a',
    'https:///example.com/a',
  ])('refuses an unsafe/noncanonical web URL: %s', (url) => {
    expect(() => canonicalWebUrl(url)).toThrow(ReadingValidationError);
  });

  it('preserves semantic query parameters and normalizes international web hosts with the platform parser', () => {
    expect(canonicalWebUrl('https://例え.jp/記事?edition=2#section')).toBe(
      'https://xn--r8jz45g.jp/%E8%A8%98%E4%BA%8B?edition=2',
    );
  });
});

describe('immutable editions, annotations and UTF-16 source continuity', () => {
  it('a changed body is a new version while the old exact anchor remains readable on the old version', () => {
    const first = article();
    const start = BODY.indexOf('犬');
    const anchor = createArticleAnchor(first.article, { start, end: start + 1, quote: '犬' });
    expect(start).toBe(6); // Astral rocket occupies two UTF-16 code units.
    const second = normalizeArticleIntake(
      metadata({ body: { text: `新しい。${BODY}` } }),
      context(),
      first,
    );
    expect(second.article.articleId).toBe(first.article.articleId);
    expect(second.article.versionId).not.toBe(first.article.versionId);
    expect(resolveArticleAnchor(first.article, anchor)).toBe('犬');
    expect(() => resolveArticleAnchor(second.article, anchor)).toThrow(ReadingValidationError);
    expect(first.article.body?.text).toBe(BODY);
  });

  it('does not accept an anchor inside a surrogate pair or a mismatched quote', () => {
    const candidate = article();
    expect(() =>
      createArticleAnchor(candidate.article, { start: 3, end: 4, quote: '\ud83d' }),
    ).toThrow(ReadingValidationError);
    expect(() => createArticleAnchor(candidate.article, { start: 6, end: 7, quote: '猫' })).toThrow(
      ReadingValidationError,
    );
    expect(() =>
      normalizeArticleIntake(metadata({ body: { text: '不正\ud800' } }), context()),
    ).toThrow(ReadingValidationError);
  });

  it('checks imported annotations against the exact body', () => {
    const annotation = {
      id: 'ruby-1',
      start: 6,
      end: 7,
      quote: '犬',
      kind: 'reading',
      text: 'いぬ',
    };
    expect(
      normalizeArticleIntake(
        metadata({ body: { text: BODY, annotations: [annotation] } } as never),
        context(),
      ).article.body?.annotations,
    ).toEqual([annotation]);
    expect(() =>
      normalizeArticleIntake(
        metadata({ body: { text: BODY, annotations: [{ ...annotation, start: 7 }] } } as never),
        context(),
      ),
    ).toThrow(ReadingValidationError);
    expect(() =>
      normalizeArticleIntake(
        metadata({ body: { text: BODY, annotations: [annotation, annotation] } } as never),
        context(),
      ),
    ).toThrow(ReadingValidationError);
  });

  it('recomputes both text and full-version hashes on restore', () => {
    const candidate = article();
    expect(parseArticleVersion(JSON.parse(JSON.stringify(candidate.article)))).toEqual(
      candidate.article,
    );
    const changed = {
      ...candidate.article,
      body: { ...candidate.article.body, text: '変更', contentSha256: sha256Hex('変更') },
    };
    expect(() => parseArticleVersion(changed)).toThrow(ReadingValidationError);
    expect(() => parseArticleVersion({ ...candidate.article, title: '別の題名' })).toThrow(
      ReadingValidationError,
    );
  });
});

describe('automatic checks and explicit editorial decisions', () => {
  it('passing integrity checks leave Japanese/editorial and factual quality unclaimed', () => {
    const candidate = article();
    expect(candidate.automaticChecks).toMatchObject({
      bodyIntegrity: 'passed',
      anchors: 'passed',
      factualAccuracy: 'not-checked',
      japaneseEditorialQuality: 'not-checked',
    });
    expect(candidate.editorial).toEqual({ status: 'pending' });
    expect(() =>
      parseArticleCandidate({
        ...candidate,
        automaticChecks: { ...candidate.automaticChecks, editorialApproved: true },
      }),
    ).toThrow(ReadingValidationError);
    expect(() =>
      recordEditorialDecision(candidate, { ...decision(candidate), userAction: false }),
    ).toThrow(ReadingValidationError);
  });

  it('preserves an exact-version explicit approval only on identical intake', () => {
    const first = article();
    const approved = recordEditorialDecision(first, decision(first));
    expect(approved.editorial.status).toBe('approved');
    expect(first.editorial.status).toBe('pending');
    expect(normalizeArticleIntake(metadata(), context(), approved).editorial.status).toBe(
      'approved',
    );
    expect(
      normalizeArticleIntake(metadata({ body: { text: `${BODY}翌日。` } }), context(), approved)
        .editorial.status,
    ).toBe('pending');
    expect(
      normalizeArticleIntake(metadata({ title: '改訂題名' }), context(), approved).editorial.status,
    ).toBe('pending');
  });

  it('reading/explanation edits invalidate approval even when the plain-text body hash stays the same', () => {
    const first = article();
    const approved = recordEditorialDecision(first, decision(first));
    const revised = normalizeArticleIntake(
      metadata({
        body: {
          text: BODY,
          annotations: [
            { id: 'reading-1', start: 6, end: 7, quote: '犬', kind: 'reading', text: 'いぬ' },
          ],
        },
      }),
      context(),
      approved,
    );
    expect(revised.article.body?.contentSha256).toBe(first.article.body?.contentSha256);
    expect(revised.article.versionId).not.toBe(first.article.versionId);
    expect(revised.editorial.status).toBe('pending');
    expect(() => recordEditorialDecision(revised, decision(first))).toThrow(ReadingValidationError);
    expect(() => parseArticleCandidate({ ...revised, editorial: approved.editorial })).toThrow(
      ReadingValidationError,
    );
  });

  it('a new operation policy creates a new revision and never retains an old approval', () => {
    const first = article();
    const approved = recordEditorialDecision(first, decision(first));
    const changed = normalizeArticleIntake(
      metadata(),
      context({
        capabilities: capabilities({
          'sync-body': { status: 'denied', reason: 'withdrawn-in-fixture' },
        }),
      }),
      approved,
    );
    expect(changed.article.versionId).not.toBe(first.article.versionId);
    expect(changed.editorial.status).toBe('pending');
    expect(canPerformArticleOperation(changed.article, 'sync-body')).toBe(false);
  });

  it('source adaptation must resolve the exact parent and its actual processing basis', () => {
    const parent = article().article;
    const permitted = context({
      lineage: {
        kind: 'source-adaptation',
        parents: [articleReference(parent)],
        processingBasisRefs: ['fixture-author-permission-v1'],
        generation: null,
      },
      adaptationParents: [parent],
    });
    const adapted = normalizeArticleIntake(metadata({ itemId: 'adaptation-1' }), permitted);
    expect(adapted.article.lineage.kind).toBe('source-adaptation');
    expect(() =>
      normalizeArticleIntake(metadata(), { ...permitted, adaptationParents: [] }),
    ).toThrow(ReadingValidationError);
    expect(() =>
      normalizeArticleIntake(metadata(), {
        ...permitted,
        lineage: { ...permitted.lineage, processingBasisRefs: ['invented-permission'] },
      }),
    ).toThrow(ReadingValidationError);
    const denied = normalizeArticleIntake(
      metadata(),
      context({
        capabilities: capabilities({
          'ai-transform': { status: 'denied', reason: 'no-transform' },
        }),
      }),
    ).article;
    expect(() =>
      normalizeArticleIntake(metadata({ itemId: 'adaptation-2' }), {
        ...permitted,
        adaptationParents: [denied],
        lineage: { ...permitted.lineage, parents: [articleReference(denied)] },
      }),
    ).toThrow(ReadingValidationError);
  });
});
