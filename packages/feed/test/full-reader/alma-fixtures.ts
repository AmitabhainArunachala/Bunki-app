import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as core from '../../src/index.ts';
export const URL = 'https://alma-telescope.jp/news/fixture-202607.html';
export const POLICY = 'https://alma-telescope.jp/policy/';
export const NOW = '2026-09-10T05:50:00.000Z';
export const TITLE = '星とことばを調べる架空の研究';
export const LEAD =
  'これは試験専用の文章です。𠮷田さんは望遠鏡で星を調べながら、か\u3099という文字や宇宙へ🚀という夢について考えています。';
export const PARAGRAPH =
  '観測室では、架空の装置を使って日本語の読み方を学びます。この文章は実際の観測成果を示しておらず、抽出処理を確かめるために作成したものです。';
export const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export const response = (html: string, finalUrl = URL, fetchedAt = NOW) => ({
  html,
  finalUrl,
  fetchedAt,
  contentType: 'text/html; charset=UTF-8',
  responseSha256: sha(html),
  responseBytes: Buffer.byteLength(html),
});
export const RIGHTS = readFileSync(
  new globalThis.URL('./alma/reviewed-rights-section.html', import.meta.url),
  'utf8',
);
export const policyHtml = (rights = RIGHTS) =>
  `<!DOCTYPE html><html lang="ja"><head><link rel="canonical" href="https://alma-telescope.jp/policy"><meta property="og:url" content="https://alma-telescope.jp/policy"><meta property="og:title" content="利用規約 - アルマ望遠鏡"></head><body><section class="common_page_container"><div class="common_page_body wysiwyg"><div class="wysiwyg_box_inner-narrow">${rights}<h3>プライバシーポリシー</h3><p>Fixture privacy section; no change to the actual reviewed rights section.</p></div></div></section></body></html>`;
export const policyResponse = () => response(policyHtml(), POLICY);
export const html = (body = `<p>${PARAGRAPH}</p>`, lead = LEAD) =>
  `<!DOCTYPE html><html lang="ja"><head><link rel="canonical" href="${URL}"><meta property="og:url" content="${URL.slice(0, -5)}"><meta property="og:title" content="ニュース - ${TITLE} - アルマ望遠鏡"><meta property="og:type" content="article"><meta property="og:site_name" content="アルマ望遠鏡"></head><body><section class="feature_s"><article class="feature_s_article"><div class="feature_s_article_top"><div class="feature_s_article_top_title_area"><p class="feature_s_article_date">2026.07.14</p><h1><strong>${TITLE}</strong></h1><div class="feature_s_article_top_content">${lead}</div><div class="common_sns_link">Fixture controls</div></div></div><div class="content_with_side"><div class="content_with_side_left"><div class="feature_s_detail_wrap"><div class="feature_s_detail wysiwyg">${body}</div></div><div class="feature_s_author_wrap"></div><div class="feature_s_tags">Fixture tags</div></div><div class="content_with_side_right">Unrelated sidebar</div></div></article></section><footer><a href="https://alma-telescope.jp/policy">利用規約</a></footer></body></html>`;
export const entry = (overrides: { title?: string; url?: string; sourceId?: string } = {}) =>
  core.parseFeedXml(
    `<rss version="2.0"><channel><title>Original synthetic metadata</title><item><title>${overrides.title || TITLE}</title><link>${overrides.url || URL}</link><pubDate>Tue, 14 Jul 2026 02:13:42 GMT</pubDate></item></channel></rss>`,
    {
      sourceId: overrides.sourceId || 'alma-ja',
      finalUrl: core.getFeedSource(overrides.sourceId || 'alma-ja').feed!.url,
      fetchedAt: NOW,
    },
  ).entries[0]!;
export const selection = (selected = entry()) => core.publisherArticleRequest(selected).selection;
export const make = (markup = html(), policy: unknown = policyResponse(), selected = entry()) =>
  core.createAlmaArticle(selected, response(markup), policy);
