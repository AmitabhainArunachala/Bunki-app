import { describe, expect, it } from 'vitest';
import { inputHashOf } from '@bunki/ai/hash';
import { createArticleAnchor, resolveArticleAnchor } from '@bunki/reading';
import {
  createGlobalVoicesArticle,
  parsePublisherReadResult,
  parsePublisherReadSelection,
  publisherArticleRequest,
} from '../../src/index.ts';
import { BODY, entry, html, NOW, response, URL } from './fixtures.ts';

describe('Global Voices authentic reading intake', () => {
  it('handles the observed publisher lang="jp" marker while still rejecting non-Japanese body text', () => {
    const observedTemplate = html().replace('lang="ja"', 'lang="jp"');
    expect(createGlobalVoicesArticle(entry(), response(observedTemplate)).status).toBe(
      'full-reader',
    );
    const nonJapanese = html(
      '<p>This is an entirely English paragraph without Japanese content.</p>',
    ).replace('lang="ja"', 'lang="jp"');
    expect(createGlobalVoicesArticle(entry(), response(nonJapanese)).reason).toBe(
      'japanese-text-missing',
    );
    expect(
      createGlobalVoicesArticle(entry(), response(html().replace('lang="ja"', 'lang="en"'))).reason,
    ).toBe('japanese-text-missing');
  });
  it('creates the existing immutable ArticleCandidate with exact credits, dates and pending review', () => {
    const result = createGlobalVoicesArticle(entry(), response());
    expect(result.status).toBe('full-reader');
    expect(result.reason).toBeNull();
    expect(result.candidate.article).toMatchObject({
      kind: 'full-reader-article',
      title: '地域と図書館',
      author: 'Fixture Author',
      canonicalUrl: URL,
      publishedAt: '2026-08-03T02:27:56.000Z',
      lineage: { kind: 'publisher-original' },
      suggestedVocabulary: [],
      body: {
        text: `${BODY}\n\n次の話\n\n小さな町の歴史を、みんなでゆっくり学びます。`,
        locationUnit: 'utf16-code-unit',
        annotations: [],
      },
    });
    expect(result.candidate.editorial).toEqual({ status: 'pending' });
    expect(result.candidate.automaticChecks).toMatchObject({
      factualAccuracy: 'not-checked',
      japaneseEditorialQuality: 'not-checked',
    });
    expect(result.sourceDocument).toMatchObject({
      updatedAt: '2026-08-04T02:27:56.000Z',
      authors: [{ name: 'Fixture Author', url: 'https://globalvoices.org/author/fixture-author/' }],
      translators: [
        { name: '翻訳者', url: 'https://jp.globalvoices.org/author/fixture-translator/' },
      ],
      responseSha256: response().responseSha256,
      license: { id: 'CC-BY-3.0' },
    });
    expect(result.candidate.article.source.attribution).toContain('翻訳者');
    expect(result.candidate.article.capabilities['retain-offline'].status).toBe('allowed');
    expect(result.candidate.article.capabilities['sync-body'].status).toBe('allowed');
    expect(result.candidate.article.capabilities['ai-transform'].status).toBe('unknown');
    expect(result.candidate.article.capabilities['synthesize-audio'].status).toBe('unknown');
    expect(Object.isFrozen(result.candidate.article.body)).toBe(true);
    expect(parsePublisherReadResult(JSON.parse(JSON.stringify(result)), result.selection)).toEqual(
      result,
    );
  });

  it('preserves astral characters and combining marks with exact UTF-16 anchors across storage', () => {
    const first = createGlobalVoicesArticle(entry(), response());
    const article = first.candidate.article;
    const start = article.body!.text.indexOf('𠮷');
    const anchor = createArticleAnchor(article, { start, end: start + 2, quote: '𠮷' });
    expect(
      resolveArticleAnchor(
        parsePublisherReadResult(JSON.parse(JSON.stringify(first))).candidate.article,
        anchor,
      ),
    ).toBe('𠮷');
    expect(() =>
      createArticleAnchor(article, {
        start,
        end: start + 1,
        quote: article.body!.text.slice(start, start + 1),
      }),
    ).toThrow();
    expect(article.body!.text).toContain('か\u3099');
    const changed = createGlobalVoicesArticle(
      entry(),
      response(html(`<p>${BODY} 新しい一文です。</p>`)),
    );
    expect(() => resolveArticleAnchor(changed.candidate.article, anchor)).toThrow(
      'version-mismatch',
    );
  });

  it('keeps the article identity stable when only transport time or unrelated page markup changes', () => {
    const first = createGlobalVoicesArticle(entry(), response());
    const later = {
      ...response(html().replace('Unrelated footer text', 'Other footer text')),
      fetchedAt: '2026-09-11T03:00:00Z',
    };
    const second = createGlobalVoicesArticle(entry(), later);
    expect(second.candidate.article.versionId).toBe(first.candidate.article.versionId);
    expect(second.sourceDocument!.responseSha256).not.toBe(first.sourceDocument!.responseSha256);
    expect(second.receiptSha256).not.toBe(first.receiptSha256);
  });

  it('ignores related-post titles but refuses duplicate current-page titles', () => {
    const related = html().replace('</footer>', '<h3 class="post-title">別の記事</h3></footer>');
    expect(createGlobalVoicesArticle(entry(), response(related)).candidate.article.title).toBe(
      '地域と図書館',
    );
    const ambiguous = related.replace(
      '</footer>',
      '<h2 class="screen-title post-title">別の本文</h2></footer>',
    );
    expect(createGlobalVoicesArticle(entry(), response(ambiguous)).reason).toBe('title-missing');
  });

  it('preserves the observed optional proofreader credit in attribution without adding credit layout to the body', () => {
    const contribution =
      '<div class="contributors">校正:<a href="https://jp.globalvoices.org/author/fixture-proofreader/">Proofreader</a></div>';
    const result = createGlobalVoicesArticle(
      entry(),
      response(html(`<p>${BODY}</p>${contribution}`)),
    );
    expect(result.status).toBe('full-reader');
    expect(result.candidate.article.body!.text).toBe(BODY);
    expect(result.sourceDocument!.otherCredits).toEqual([
      {
        role: '校正',
        name: 'Proofreader',
        url: 'https://jp.globalvoices.org/author/fixture-proofreader/',
      },
    ]);
    expect(result.candidate.article.source.attribution).toContain('校正: Proofreader');
    expect(parsePublisherReadResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
    for (const invalid of [
      contribution.replace('校正:', '未確認の役割:'),
      contribution.replace('/fixture-proofreader/', '/fixture-proofreader/?unknown=1'),
    ])
      expect(
        createGlobalVoicesArticle(entry(), response(html(`<p>${BODY}</p>${invalid}`))).reason,
      ).toBe('attribution-ambiguous');
  });

  it('drops scripts, forms, hidden text, images/captions and third-party embeds without evaluating them', () => {
    const malicious = `<p>${BODY}<script>globalThis.__publisherExecuted = true;</script><img src="file:///private" onerror="attack()" /></p>
      <form><p>FORM_SECRET</p></form><div class="wp-caption"><p>IMAGE_SECRET</p></div>
      <blockquote class="twitter-tweet"><p>EMBED_SECRET</p></blockquote><p hidden="hidden">HIDDEN_SECRET</p>
      <iframe src="https://127.0.0.1/private">FRAME_SECRET</iframe>`;
    const result = createGlobalVoicesArticle(entry(), response(html(malicious)));
    expect(result.status).toBe('full-reader');
    expect(result.candidate.article.body!.text).toBe(BODY);
    for (const excluded of ['SECRET', 'publisherExecuted', 'file:///private', 'attack()'])
      expect(JSON.stringify(result)).not.toContain(excluded);
    expect((globalThis as Record<string, unknown>)['__publisherExecuted']).toBeUndefined();
    expect(result.sourceDocument!.omittedElements).toBe(7);
  });

  it.each([
    [
      'missing body template',
      (value: string) => value.replace('class="entry"', 'class="new-template"'),
      'template-changed',
    ],
    [
      'missing translator',
      (value: string) => value.replace('翻訳 (日本語)', '編集 (日本語)'),
      'attribution-ambiguous',
    ],
    [
      'conflicting author',
      (value: string) =>
        value.replace(
          'name="author" content="Fixture Author"',
          'name="author" content="Someone Else"',
        ),
      'attribution-ambiguous',
    ],
    [
      'unsafe credit URL',
      (value: string) =>
        value.replace(
          'https://jp.globalvoices.org/author/fixture-translator/',
          'javascript:alert(1)',
        ),
      'attribution-ambiguous',
    ],
    [
      'missing licence',
      (value: string) => value.replace('class="license"', 'class="removed-license"'),
      'license-missing',
    ],
    [
      'licence revoked',
      (value: string) => value.replace('/licenses/by/3.0/', '/licenses/by-nc-nd/4.0/'),
      'license-unreviewed',
    ],
    [
      'conflicting title',
      (value: string) =>
        value.replace(
          'property="og:title" content="地域と図書館"',
          'property="og:title" content="別の記事"',
        ),
      'title-ambiguous',
    ],
    [
      'wrong canonical',
      (value: string) =>
        value.replace(
          'rel="canonical" href="' + URL,
          'rel="canonical" href="https://jp.globalvoices.org/2026/08/03/999/',
        ),
      'canonical-mismatch',
    ],
    [
      'future date',
      (value: string) => value.replace('2026-08-04T02:27:56+0000', '2099-08-04T02:27:56+0000'),
      'date-invalid',
    ],
    [
      'missing date',
      (value: string) => value.replace('article:published_time', 'unreviewed:published_time'),
      'date-missing',
    ],
  ])('uses a publisher link for %s', (_name, mutate, reason) => {
    const result = createGlobalVoicesArticle(
      entry(),
      response((mutate as (value: string) => string)(html())),
    );
    expect(result.status).toBe('publisher-link');
    expect(result.reason).toBe(reason);
    expect(result.candidate.article.body).toBeNull();
    expect(result.candidate.article.capabilities['display-body'].status).not.toBe('allowed');
    expect(result.sourceDocument).toBeNull();
    expect(parsePublisherReadResult(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });

  it('rejects DTD/entity expansion, malformed nesting and excessive depth before extracting text', () => {
    for (const content of [
      html().replace('<!DOCTYPE html>', '<!DOCTYPE html [<!ENTITY x SYSTEM "file:///private">]>'),
      html().replace('</head>', '</wrong>'),
      html('<div>'.repeat(100) + `<p>${BODY}</p>` + '</div>'.repeat(100)),
    ]) {
      const result = createGlobalVoicesArticle(entry(), response(content));
      expect(result.status).toBe('publisher-link');
      expect(result.reason).toBe('html-structure-invalid');
    }
  });

  it('does not silently lose tables or turn huge/empty/non-Japanese bodies into full readers', () => {
    for (const [content, reason] of [
      [html(`<table><tr><td>${BODY}</td></tr></table>`), 'unsupported-body-structure'],
      [html(`<p>${'あ'.repeat(120_001)}</p>`), 'body-size-limit'],
      [html(''), 'body-missing'],
      [
        html('<p>This is an entirely English paragraph without Japanese content.</p>'),
        'japanese-text-missing',
      ],
    ])
      expect(createGlobalVoicesArticle(entry(), response(content))).toMatchObject({
        status: 'publisher-link',
        reason,
      });
  });

  it('requires exact transport bytes, HTML MIME and an enabled adapter policy', () => {
    expect(
      createGlobalVoicesArticle(entry(), { ...response(), responseSha256: 'f'.repeat(64) }),
    ).toMatchObject({ reason: 'response-identity-mismatch' });
    expect(
      createGlobalVoicesArticle(entry(), { ...response(), contentType: 'application/json' }),
    ).toMatchObject({ reason: 'unsupported-mime' });
    expect(createGlobalVoicesArticle(entry(), response(), false)).toMatchObject({
      status: 'publisher-link',
      reason: 'policy-disabled',
    });
  });

  it('accepts only a selected Global Voices entry and its exact same-article slash redirect', () => {
    const selected = entry();
    const plan = publisherArticleRequest(selected);
    expect(plan.allowedUrls).toEqual([URL, URL.slice(0, -1)]);
    expect(parsePublisherReadSelection(plan.selection)).toEqual(plan.selection);
    expect(() =>
      parsePublisherReadSelection({ ...plan.selection, url: 'https://attacker.invalid/' }),
    ).toThrow('invalid-reader-selection');
    for (const url of [
      URL + '?secret=1',
      URL.replace('jp.globalvoices.org', 'jp.globalvoices.org.attacker.invalid'),
      URL.replace('https:', 'http:'),
      'https://jp.globalvoices.org/about/',
    ])
      expect(() => publisherArticleRequest(entry({ url }))).toThrow('unsupported-article-url');
    expect(() => publisherArticleRequest(entry({ sourceId: 'asahi' }))).toThrow(
      'unsupported-publisher',
    );
    expect(() =>
      publisherArticleRequest(selected, {
        ...plan.selection,
        revisionId: 'feedv:' + 'f'.repeat(64),
      }),
    ).toThrow('entry-revised');
  });

  it('rejects rehashed receipt metadata that disagrees with article attribution or exact block boundaries', () => {
    const original = createGlobalVoicesArticle(entry(), response());
    for (const mutate of [
      (value: typeof original) => {
        (value.sourceDocument!.translators[0] as { name: string }).name = 'Wrong translator';
      },
      (value: typeof original) => {
        (value.sourceDocument!.blocks[0] as { end: number }).end -= 1;
      },
    ]) {
      const candidate = JSON.parse(JSON.stringify(original)) as typeof original;
      mutate(candidate);
      const { receiptSha256: _old, ...payload } = candidate;
      expect(() =>
        parsePublisherReadResult({ ...payload, receiptSha256: inputHashOf(payload) }),
      ).toThrow('invalid-reader-result');
    }
  });

  it('rejects stale selections when rehydrating otherwise valid output', () => {
    const result = createGlobalVoicesArticle(entry(), { ...response(), fetchedAt: NOW });
    expect(() =>
      parsePublisherReadResult(result, {
        ...result.selection,
        revisionId: 'feedv:' + '0'.repeat(64),
      }),
    ).toThrow('invalid-reader-result');
  });
});
