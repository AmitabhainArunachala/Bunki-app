import assert from 'node:assert/strict';
import { test } from 'vitest';
import { inputHashOf } from '@bunki/ai/hash';
import * as reading from '@bunki/reading';
import * as core from '../../src/index.ts';
import {
  URL,
  POLICY,
  LEAD,
  PARAGRAPH,
  RIGHTS,
  html,
  policyHtml,
  policyResponse,
  response,
  entry,
  selection,
  make,
} from './alma-fixtures.ts';
import * as globalVoices from './fixtures.ts';
import provenance from './alma/policy-provenance.json';
import { createHash } from 'node:crypto';
const rehash = (raw: Record<string, unknown>) => {
  const { receiptSha256: _, ...payload } = raw;
  return { ...payload, receiptSha256: inputHashOf(payload) };
};
function link(result: core.AlmaReadResult, reason: core.PublisherLinkReason) {
  assert.equal(result.status, 'publisher-link');
  assert.equal(result.reason, reason);
  assert.equal(result.sourceDocument, null);
  assert.equal(result.candidate.article.body, null);
  assert.notEqual(result.candidate.article.capabilities['display-body'].status, 'allowed');
  assert.deepEqual(core.parsePublisherReadResult(JSON.parse(JSON.stringify(result))), result);
}

test('ALMA synthetic prose uses the explicit provider default, exact grants, pending editorial state and full immutable wrapper', () => {
  const result = make();
  assert.equal(result.status, 'full-reader');
  assert.equal(result.candidate.article.body!.text, LEAD + '\n\n' + PARAGRAPH);
  assert.equal(result.candidate.article.author, null);
  assert.equal(result.sourceDocument!.textCredit.provider, '国立天文台');
  assert.equal(result.sourceDocument!.textCredit.basis, 'explicit-site-text-default');
  assert.equal(result.sourceDocument!.license.id, 'CC-BY-4.0');
  assert.equal(
    result.sourceDocument!.policyObservation.responseSha256,
    policyResponse().responseSha256,
  );
  assert.equal(result.sourceDocument!.publicationDisplayDate, '2026.07.14');
  assert.equal(result.sourceDocument!.publishedAt, '2026-07-14T02:13:42.000Z');
  assert.equal(result.sourceDocument!.articleModifiedAt, null);
  assert.equal(result.candidate.editorial.status, 'pending');
  assert.equal(result.candidate.generationJob, null);
  assert.deepEqual(result.candidate.article.suggestedVocabulary, []);
  assert.deepEqual(result.candidate.suggestedWords, []);
  assert.deepEqual(
    Object.entries(result.candidate.article.capabilities)
      .filter(([, d]) => d.status === 'allowed')
      .map(([key]) => key)
      .sort(),
    ['discover-metadata', 'display-body', 'quote-extract', 'retain-offline', 'sync-body'],
  );
  assert.match(result.candidate.article.source.attribution, /CC BY 4\.0/u);
  assert.match(result.candidate.article.source.attribution, /No endorsement/u);
  assert(Object.isFrozen(result.candidate.article.body));
  assert.deepEqual(
    core.parsePublisherReadResult(JSON.parse(JSON.stringify(result)), selection()),
    result,
  );
});

test('Unicode anchors preserve astral characters and combining marks, and reject stale versions or split surrogates', () => {
  const result = make();
  const article = result.candidate.article;
  const start = article.body!.text.indexOf('𠮷');
  const anchor = reading.createArticleAnchor(article, { start, end: start + 2, quote: '𠮷' });
  assert.equal(reading.resolveArticleAnchor(article, anchor), '𠮷');
  assert.throws(() =>
    reading.createArticleAnchor(article, { start, end: start + 1, quote: '\ud842' }),
  );
  assert(article.body!.text.includes('か\u3099'));
  const revised = make(html(`<p>${PARAGRAPH}追記です。</p>`));
  assert.notEqual(article.versionId, revised.candidate.article.versionId);
  assert.throws(() => reading.resolveArticleAnchor(revised.candidate.article, anchor));
  for (const block of result.sourceDocument!.blocks)
    reading.assertExactSpan(article.body!.text, {
      ...block,
      quote: article.body!.text.slice(block.start, block.end),
    });
});

test('media captions, scripts, hidden text and exact trailing related links do not enter text or change its version', () => {
  const clean = make();
  const altered = make(
    html(
      `<p>${PARAGRAPH}</p><figure><img src="https://never-fetch.invalid/image.png"><figcaption>CAPTION_ONLY</figcaption></figure><script>globalThis.__executed = true</script><p hidden="hidden">HIDDEN_ONLY</p><p>関連リンク<br><a href="https://alma-telescope.jp/wsu/">RELATED_ONLY</a></p>`,
    ),
  );
  assert.equal(altered.status, 'full-reader');
  assert.equal(altered.candidate.article.body!.text, clean.candidate.article.body!.text);
  assert.equal(altered.candidate.article.versionId, clean.candidate.article.versionId);
  assert.notEqual(altered.sourceDocument!.responseSha256, clean.sourceDocument!.responseSha256);
  assert(altered.sourceDocument!.omittedElements > clean.sourceDocument!.omittedElements);
  assert.equal((globalThis as typeof globalThis & { __executed?: unknown }).__executed, undefined);
});

const mutations: [string, (html: string) => string, core.PublisherLinkReason][] = [
  [
    'marked third-party caption',
    (s) =>
      s.replace(
        '<p>' + PARAGRAPH + '</p>',
        '<p>' +
          PARAGRAPH +
          '</p><figure><figcaption>Third party © Example. All Rights Reserved.</figcaption></figure>',
      ),
    'license-unreviewed',
  ],
  [
    'hidden restriction',
    (s) =>
      s.replace(
        '<p>' + PARAGRAPH + '</p>',
        '<p>' + PARAGRAPH + '</p><p hidden="hidden">転載禁止</p>',
      ),
    'license-unreviewed',
  ],
  [
    'unknown body provider credit',
    (s) => s.replace('<p>' + PARAGRAPH, '<p>文章提供：別の機関</p><p>' + PARAGRAPH),
    'license-unreviewed',
  ],
  [
    'unknown body English credit',
    (s) => s.replace('<p>' + PARAGRAPH, '<p>Courtesy of an external publisher</p><p>' + PARAGRAPH),
    'license-unreviewed',
  ],
  [
    'unknown body license link',
    (s) =>
      s.replace(
        '<p>' + PARAGRAPH,
        '<p><a href="https://creativecommons.org/licenses/by-nc/4.0/">Terms</a></p><p>' + PARAGRAPH,
      ),
    'license-unreviewed',
  ],
  [
    'unknown author credit',
    (s) =>
      s.replace(
        'class="feature_s_author_wrap">',
        'class="feature_s_author_wrap">External contributor',
      ),
    'attribution-ambiguous',
  ],
  [
    'unknown metadata author',
    (s) => s.replace('</head>', '<meta name="author" content="Unknown Author"></head>'),
    'attribution-ambiguous',
  ],
  [
    'unknown license metadata',
    (s) => s.replace('</head>', '<meta name="license" content="Unknown"></head>'),
    'attribution-ambiguous',
  ],
  [
    'conflicting page license',
    (s) =>
      s.replace(
        '</head>',
        '<link rel="license" href="https://creativecommons.org/licenses/by-nc/4.0/"></head>',
      ),
    'license-unreviewed',
  ],
  [
    'body license data',
    (s) => s.replace('<p>' + PARAGRAPH, '<p data-license="unknown">' + PARAGRAPH),
    'license-unreviewed',
  ],
  [
    'missing policy link',
    (s) =>
      s.replace('href="https://alma-telescope.jp/policy"', 'href="https://www.nao.ac.jp/terms/"'),
    'license-missing',
  ],
  [
    'missing author area',
    (s) => s.replace('feature_s_author_wrap', 'new_credit_template'),
    'attribution-missing',
  ],
  [
    'unknown body shape',
    (s) =>
      s.replace('<p>' + PARAGRAPH + '</p>', '<table><tr><td>' + PARAGRAPH + '</td></tr></table>'),
    'unsupported-body-structure',
  ],
  [
    'changed outer template',
    (s) => s.replace('class="feature_s_article"', 'class="new_article"'),
    'template-changed',
  ],
  [
    'injected scaffold text',
    (s) =>
      s.replace('class="feature_s_article_top">', 'class="feature_s_article_top">Unmapped prose'),
    'template-changed',
  ],
  [
    'hidden body',
    (s) =>
      s.replace(
        'class="feature_s_detail wysiwyg"',
        'class="feature_s_detail wysiwyg" hidden="hidden"',
      ),
    'template-changed',
  ],
  [
    'wrong canonical',
    (s) =>
      s.replace(
        'rel="canonical" href="' + URL,
        'rel="canonical" href="https://alma-telescope.jp/news/other.html',
      ),
    'canonical-mismatch',
  ],
  [
    'wrong OG alias',
    (s) => s.replace('content="' + URL.slice(0, -5) + '"', 'content="' + URL + '"'),
    'canonical-mismatch',
  ],
  [
    'duplicate canonical',
    (s) => s.replace('</head>', '<link rel="canonical" href="' + URL + '"></head>'),
    'canonical-mismatch',
  ],
  ['different title', (s) => s.replace('<h1><strong>', '<h1><strong>別の題名'), 'title-ambiguous'],
  ['wrong publication day', (s) => s.replace('2026.07.14', '2026.07.15'), 'date-invalid'],
  [
    'new modified metadata',
    (s) =>
      s.replace(
        '</head>',
        '<meta property="article:modified_time" content="2026-07-15T00:00:00Z"></head>',
      ),
    'template-changed',
  ],
  ['foreign language', (s) => s.replace('lang="ja"', 'lang="en"'), 'japanese-text-missing'],
  [
    'DTD entity',
    (s) => s.replace('<!DOCTYPE html>', '<!DOCTYPE html [<!ENTITY x SYSTEM "file:///private">]>'),
    'html-structure-invalid',
  ],
];
for (const [name, mutation, reason] of mutations)
  test('ALMA refuses ' + name + ' without a partial body', () =>
    link(make(mutation(html())), reason),
  );

test('missing, changed, stale, redirected or byte-mismatched policy never grants body rights', () => {
  link(make(html(), null), 'license-missing');
  link(
    make(html(), response(policyHtml(RIGHTS.replace('複製、再配布', '利用禁止、再配布')), POLICY)),
    'license-unreviewed',
  );
  link(
    make(html(), { ...policyResponse(), fetchedAt: '2026-09-09T00:00:00Z' }),
    'license-unreviewed',
  );
  link(
    make(html(), { ...policyResponse(), finalUrl: 'https://www.nao.ac.jp/terms/' }),
    'redirect-rejected',
  );
  link(
    make(html(), { ...policyResponse(), responseSha256: 'f'.repeat(64) }),
    'response-identity-mismatch',
  );
  link(
    make(
      html(),
      response(
        policyHtml().replace(
          'https://creativecommons.org/licenses/by/4.0/deed.ja',
          'https://attacker.invalid/license',
        ),
        POLICY,
      ),
    ),
    'license-unreviewed',
  );
  const changedCards = policyResponse();
  changedCards.html = changedCards.html.replace(
    'Fixture privacy section',
    'Unrelated changing privacy prose',
  );
  assert.equal(make(html(), response(changedCards.html, POLICY)).status, 'full-reader');
});

test('strict IDs, article paths and fixed policy plan cannot confer authority through arbitrary URL input', () => {
  for (const url of [
    URL + '?q=1',
    URL + '#x',
    URL + '/',
    URL.slice(0, -5),
    URL.replace('https:', 'http:'),
    URL.replace('alma-telescope.jp', 'www.nao.ac.jp'),
    URL.replace('/news/', '/publication/'),
    'https://user:pass@alma-telescope.jp/news/a.html',
    'https://alma-telescope.jp/news/%61.html',
    'https://alma-telescope.jp.attacker.invalid/news/a.html',
  ])
    assert.throws(() => core.almaArticleUrl(url));
  assert.deepEqual(core.publisherArticleRequest(entry()).allowedUrls, [URL]);
  assert.deepEqual(core.publisherPolicyRequest(entry(), selection()).allowedUrls, [POLICY]);
  for (const raw of [
    { ...selection(), url: URL },
    { ...selection(), sourceId: 'naoj' },
    { ...selection(), sourceId: 'unknown' },
  ])
    assert.throws(() => core.parsePublisherReadSelection(raw));
  assert.throws(() =>
    core.publisherArticleRequest(entry(), { ...selection(), sourceId: 'global-voices' }),
  );
  assert.throws(() =>
    core.publisherArticleRequest(entry(), {
      ...selection(),
      revisionId: 'feedv:' + 'a'.repeat(64),
    }),
  );
  assert.throws(() => core.publisherArticleRequest(entry({ sourceId: 'naoj' })));
});

test('redirect, MIME, encoding, digest and policy-disable refusals keep the selected link truthful', () => {
  for (const [patch, reason] of [
    [{ finalUrl: URL.slice(0, -5) }, 'redirect-rejected'],
    [{ contentType: 'text/html; charset=Shift_JIS' }, 'unsupported-mime'],
    [{ responseSha256: 'f'.repeat(64) }, 'response-identity-mismatch'],
    [{ responseBytes: 1 }, 'response-identity-mismatch'],
  ] satisfies [Partial<ReturnType<typeof response>>, core.PublisherLinkReason][])
    link(
      core.createAlmaArticle(entry(), { ...response(html()), ...patch }, policyResponse()),
      reason,
    );
  link(make(html() + '\ud800'), 'invalid-encoding');
  link(
    core.createAlmaArticle(entry(), response(html()), policyResponse(), false),
    'policy-disabled',
  );
});

test('rehashed wrong credit, license, feed identity, spans and version are rejected at storage rehydration', () => {
  const original = make();
  const changes: [string[], unknown][] = [
    [['sourceDocument', 'textCredit', 'provider'], 'Unknown'],
    [['sourceDocument', 'license', 'id'], 'CC-BY-3.0'],
    [['sourceDocument', 'policyObservation', 'rightsSectionSha256'], 'f'.repeat(64)],
    [['sourceDocument', 'selectedFeedEntry', 'title'], 'Unbound title'],
    [['sourceDocument', 'blocks', '0', 'end'], original.sourceDocument!.blocks[0]!.end - 1],
    [['sourceDocument', 'contentSha256'], 'f'.repeat(64)],
    [['sourceDocument', 'articleVersionId'], 'different'],
    [['sourceDocument', 'publicationDisplayDate'], '2026.07.15'],
    [['sourceDocument', 'ogUrl'], URL],
    [['candidate', 'article', 'source', 'attribution'], 'Forged credit'],
  ];
  for (const [path, replacement] of changes) {
    const value: Record<string, unknown> = JSON.parse(JSON.stringify(original));
    let target = value;
    for (const key of path.slice(0, -1)) {
      const next = target[key];
      assert(next && typeof next === 'object');
      target = next as Record<string, unknown>;
    }
    target[path.at(-1)!] = replacement;
    assert.throws(
      () => core.parsePublisherReadResult(rehash(value), selection()),
      /invalid-reader-result/u,
    );
  }
});

test('reviewed legal fixture retains exact provenance and typed presentation distinguishes ALMA unknowns from Global Voices credits', () => {
  assert.equal(createHash('sha256').update(RIGHTS).digest('hex'), provenance.fixtureSha256);
  const alma = make();
  assert.equal(alma.status, 'full-reader');
  assert.equal(
    alma.sourceDocument!.policyObservation.rightsSectionSha256,
    provenance.reviewedRightsTextSha256,
  );
  assert.deepEqual(core.publisherReadingDetails(alma), {
    authors: [],
    translators: [],
    otherCredits: [],
    authorUnspecified: true,
    provider: { name: '国立天文台', url: POLICY },
    license: { label: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
    publishedAt: '2026-07-14T02:13:42.000Z',
    publicationInstantSource: 'selected-rss-entry',
    updatedAt: null,
  });
  const global = core.createGlobalVoicesArticle(globalVoices.entry(), globalVoices.response());
  assert.equal(global.status, 'full-reader');
  assert.deepEqual(core.publisherReadingDetails(global), {
    authors: global.sourceDocument!.authors,
    translators: global.sourceDocument!.translators,
    otherCredits: global.sourceDocument!.otherCredits,
    authorUnspecified: false,
    provider: null,
    license: { label: 'CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' },
    publishedAt: '2026-08-03T02:27:56.000Z',
    publicationInstantSource: 'article-page',
    updatedAt: '2026-08-04T02:27:56.000Z',
  });
  assert.throws(() => core.publisherReadingDetails(make(html(), null)), /invalid-reader-result/u);
});
