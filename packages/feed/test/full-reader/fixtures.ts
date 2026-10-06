import { createHash } from 'node:crypto';
import { getFeedSource, parseFeedXml } from '../../src/index.ts';

export const URL = 'https://jp.globalvoices.org/2026/08/03/65560/';
export const NOW = '2026-09-10T03:00:00.000Z';
export const BODY =
  '地域の図書館で𠮷田さんが日本語の本を読みます。宇宙へ🚀という夢を語り、か\u3099という文字も調べます。';
export const html = (
  body = `<p>${BODY}</p><h3>次の話</h3><p>小さな町の歴史を、みんなでゆっくり学びます。</p>`,
) => `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8" />
<link rel="canonical" href="${URL}" /><meta property="og:url" content="${URL}" />
<meta property="og:type" content="article" /><meta property="og:title" content="地域と図書館" />
<meta name="author" content="Fixture Author" />
<meta property="article:published_time" content="2026-08-03T02:27:56+0000" />
<meta property="article:modified_time" content="2026-08-04T02:27:56+0000" />
</head><body><div id="page-content"><h2 class="screen-title post-title">地域と図書館</h2>
<div id="post-header-credit"><div class="contributor-name"><span class="credit-label">記者 (English)</span><a class="user-link" href="https://globalvoices.org/author/fixture-author/">Fixture Author</a></div>
<div class="contributor-name"><span class="credit-label">翻訳 (日本語)</span><a class="user-link" href="https://jp.globalvoices.org/author/fixture-translator/">翻訳者</a></div></div>
<div class="post post-65560"><div class="entry-container"><div class="entry">${body}</div></div></div>
<div class="postfooter-credits"><div class="license"><a href="https://creativecommons.org/licenses/by/3.0/">CC BY 3.0</a></div></div>
</div><footer>Unrelated footer text</footer></body></html>`;
export const entry = (overrides: { title?: string; url?: string; sourceId?: string } = {}) => {
  const sourceId = overrides.sourceId || 'global-voices';
  return parseFeedXml(
    `<rss version="2.0"><channel><title>Fixture</title><item><title>${overrides.title || '地域と図書館'}</title><link>${overrides.url || URL}</link><pubDate>Mon, 03 Aug 2026 02:27:56 GMT</pubDate></item></channel></rss>`,
    {
      sourceId,
      finalUrl: getFeedSource(sourceId).feed!.url,
      fetchedAt: NOW,
    },
  ).entries[0]!;
};
export const response = (content = html()) => ({
  html: content,
  contentType: 'text/html; charset=UTF-8',
  finalUrl: URL,
  fetchedAt: NOW,
  responseBytes: Buffer.byteLength(content),
  responseSha256: createHash('sha256').update(content).digest('hex'),
});
