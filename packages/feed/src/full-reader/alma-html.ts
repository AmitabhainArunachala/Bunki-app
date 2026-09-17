import { sha256Hex } from '@bunki/ai/hash';
import { MAX_ARTICLE_CHARS } from '@bunki/reading';
import type { FeedEntry } from '../model.ts';
import { almaArticleUrl, PublisherReaderError } from './selection.ts';
import {
  ALMA_ORIGIN,
  ALMA_LICENSE_URL,
  ALMA_PROVIDER,
  almaChildren,
  almaCompact,
  almaElements,
  almaHas,
  almaMeta,
  almaOne,
  almaWithClass,
  parseAlmaDocument,
} from './alma-policy.ts';

const mediaTags = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'form',
  'input',
  'button',
  'select',
  'textarea',
  'iframe',
  'object',
  'embed',
  'img',
  'picture',
  'video',
  'audio',
  'source',
  'canvas',
  'svg',
  'math',
  'figure',
  'figcaption',
  'rt',
  'rp',
]);
const media = (node: Element) =>
  mediaTags.has(node.tagName.toLowerCase()) ||
  ['wp-caption', 'wp-caption-text', 'wp-block-embed', 'twitter-tweet', 'instagram-media'].some(
    (name) => almaHas(node, name),
  );
const hidden = (node: Element) =>
  node.hasAttribute('hidden') ||
  node.getAttribute('aria-hidden') === 'true' ||
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/iu.test(
    node.getAttribute('style') || '',
  );
const inline = new Set([
  'a',
  'span',
  'strong',
  'em',
  'b',
  'i',
  'u',
  's',
  'small',
  'sub',
  'sup',
  'ruby',
  'rb',
  'br',
  'q',
  'cite',
  'abbr',
  'code',
]);

function checkArticleExclusions(doc: Document, article: Element) {
  // Inspect restrictions before dropping any media/hidden caption. Unknown scope
  // refuses the whole body instead of guessing which paragraph it qualifies.
  if (
    /all\s+rights\s+reserved|copyright|著作権|転載|改変禁止|非営利|CC\s*BY|©|クレジット|(?:文章|記事)提供|(?:提供|翻訳|出典|引用|執筆|文)\s*[:：]|(?:credits?|source|author|text)\s*[:：]|written by|provided by|courtesy of/iu.test(
      article.textContent || '',
    )
  )
    throw new PublisherReaderError('license-unreviewed');
  for (const node of almaElements(article)) {
    if (
      node.tagName.toLowerCase() === 'a' &&
      ((node.getAttribute('rel') || '').split(/\s/u).includes('license') ||
        /^https?:\/\/creativecommons\.org\//iu.test(node.getAttribute('href') || ''))
    )
      throw new PublisherReaderError('license-unreviewed');
    if (
      ['data-license', 'data-rights', 'data-copyright', 'data-credit', 'data-author'].some((name) =>
        node.hasAttribute(name),
      )
    )
      throw new PublisherReaderError('license-unreviewed');
    if (
      /(?:^|\s)(?:copyright|license|rights|credit|third-party)(?:\s|$)/iu.test(
        node.getAttribute('class') || '',
      )
    )
      throw new PublisherReaderError('license-unreviewed');
  }
  for (const name of [
    'copyright',
    'license',
    'rights',
    'dc:rights',
    'dc:creator',
    'article:author',
  ])
    if (almaMeta(doc, name, false) !== null)
      throw new PublisherReaderError('attribution-ambiguous');
  const author = almaMeta(doc, 'author', false);
  if (author !== null && author !== ALMA_PROVIDER)
    throw new PublisherReaderError('attribution-ambiguous');
  const holder = almaOne(almaWithClass(article, 'feature_s_author_wrap'), 'attribution-missing');
  if (almaCompact(holder.textContent || '') || almaChildren(holder).length)
    throw new PublisherReaderError('attribution-ambiguous');
  const policyLinks = Array.from(doc.getElementsByTagName('a')).filter(
    (node) => node.getAttribute('href') === `${ALMA_ORIGIN}/policy`,
  );
  if (!policyLinks.length) throw new PublisherReaderError('license-missing');
  // A different page-level license overrides, rather than inheriting the default.
  for (const link of Array.from(doc.getElementsByTagName('link')))
    if (
      (link.getAttribute('rel') || '').split(/\s/u).includes('license') &&
      link.getAttribute('href') !== ALMA_LICENSE_URL
    )
      throw new PublisherReaderError('license-unreviewed');
}

/** ONE reviewed Japanese news template. Unknown structure does not yield a partial body. */
export function extractAlmaHtml(html: string, entry: FeedEntry, fetchedAt: string) {
  const canonicalUrl = almaArticleUrl(entry.canonicalUrl);
  const doc = parseAlmaDocument(html);
  const canonical = almaOne(
    Array.from(doc.getElementsByTagName('link')).filter((node) =>
      (node.getAttribute('rel') || '').split(/\s/u).includes('canonical'),
    ),
    'canonical-mismatch',
  );
  if (
    canonical.getAttribute('href') !== canonicalUrl ||
    almaMeta(doc, 'og:url') !== canonicalUrl.slice(0, -5) ||
    almaMeta(doc, 'og:type') !== 'article' ||
    almaMeta(doc, 'og:site_name') !== 'アルマ望遠鏡'
  )
    throw new PublisherReaderError('canonical-mismatch');
  const article = almaOne(almaWithClass(doc, 'feature_s_article'), 'template-changed');
  if (
    article.tagName !== 'article' ||
    article.parentNode?.nodeType !== 1 ||
    !almaHas(article.parentNode as Element, 'feature_s')
  )
    throw new PublisherReaderError('template-changed');
  const top = almaOne(almaWithClass(article, 'feature_s_article_top'), 'template-changed');
  const columns = almaOne(almaWithClass(article, 'content_with_side'), 'template-changed');
  if (
    almaChildren(article).length !== 2 ||
    top.parentNode !== article ||
    columns.parentNode !== article
  )
    throw new PublisherReaderError('template-changed');
  const titleArea = almaOne(
    almaWithClass(top, 'feature_s_article_top_title_area'),
    'template-changed',
  );
  if (almaChildren(top).length !== 1 || titleArea.parentNode !== top)
    throw new PublisherReaderError('template-changed');
  const lead = almaOne(
    almaWithClass(titleArea, 'feature_s_article_top_content'),
    'template-changed',
  );
  const titleNode = almaOne(Array.from(titleArea.getElementsByTagName('h1')), 'title-missing');
  const dateNode = almaOne(almaWithClass(titleArea, 'feature_s_article_date'), 'date-missing');
  const social = almaOne(almaWithClass(titleArea, 'common_sns_link'), 'template-changed');
  if (
    almaChildren(titleArea).length !== 4 ||
    [lead, titleNode, dateNode, social].some((node) => node.parentNode !== titleArea)
  )
    throw new PublisherReaderError('template-changed');
  const title = almaCompact(titleNode.textContent || '');
  if (!title || title.length > 500) throw new PublisherReaderError('title-missing');
  if (title !== entry.title || almaMeta(doc, 'og:title') !== `ニュース - ${title} - アルマ望遠鏡`)
    throw new PublisherReaderError('title-ambiguous');
  const displayDate = almaCompact(dateNode.textContent || '');
  if (!/^20\d{2}\.\d{2}\.\d{2}$/u.test(displayDate) || !entry.publishedAt)
    throw new PublisherReaderError('date-missing');
  const publishedAt = new Date(entry.publishedAt).toISOString();
  // The HTML supplies a Japanese calendar day, not a fabricated midnight instant.
  // The exact instant is retained from the selected, validated RSS revision.
  if (
    new Date(Date.parse(publishedAt) + 9 * 3_600_000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/gu, '.') !== displayDate ||
    Date.parse(publishedAt) > Date.parse(fetchedAt) + 300_000
  )
    throw new PublisherReaderError('date-invalid');
  for (const name of ['article:published_time', 'article:modified_time'])
    if (almaMeta(doc, name, false) !== null) throw new PublisherReaderError('template-changed');
  checkArticleExclusions(doc, article);
  const left = almaOne(almaWithClass(columns, 'content_with_side_left'), 'template-changed');
  const right = almaOne(almaWithClass(columns, 'content_with_side_right'), 'template-changed');
  if (
    almaChildren(columns).length !== 2 ||
    left.parentNode !== columns ||
    right.parentNode !== columns
  )
    throw new PublisherReaderError('template-changed');
  const wrap = almaOne(almaWithClass(left, 'feature_s_detail_wrap'), 'template-changed');
  const author = almaOne(almaWithClass(left, 'feature_s_author_wrap'), 'attribution-missing');
  const tags = almaOne(almaWithClass(left, 'feature_s_tags'), 'template-changed');
  if (
    almaChildren(left).length !== 3 ||
    [wrap, author, tags].some((node) => node.parentNode !== left)
  )
    throw new PublisherReaderError('template-changed');
  const body = almaOne(
    almaWithClass(wrap, 'feature_s_detail').filter((node) => almaHas(node, 'wysiwyg')),
    'template-changed',
  );
  if (body.parentNode !== wrap || almaChildren(wrap).length !== 1)
    throw new PublisherReaderError('template-changed');
  for (const node of [
    article,
    top,
    columns,
    titleArea,
    lead,
    titleNode,
    dateNode,
    left,
    wrap,
    body,
  ])
    if (hidden(node)) throw new PublisherReaderError('template-changed');
  for (const node of [article, top, columns, titleArea, left, wrap])
    if (
      Array.from(node.childNodes).some(
        (child) => child.nodeType === 3 && (child.nodeValue || '').trim(),
      )
    )
      throw new PublisherReaderError('template-changed');
  let omittedElements = 2; // The social controls and related sidebar are never text.
  const inlineText = (node: Node): string => {
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    const element = node as Element;
    if (media(element) || hidden(element)) {
      omittedElements += 1;
      return '';
    }
    if (!inline.has(element.tagName)) throw new PublisherReaderError('unsupported-body-structure');
    if (element.tagName === 'br') return '\n';
    return Array.from(element.childNodes).map(inlineText).join('');
  };
  const paragraphText = (node: Element) =>
    almaCompact(Array.from(node.childNodes).map(inlineText).join(''));
  const parts = [paragraphText(lead)];
  if (!parts[0] || parts[0].length < 20) throw new PublisherReaderError('body-missing');
  const children = almaChildren(body);
  for (const node of Array.from(body.childNodes)) {
    if (node.nodeType === 8) continue;
    if (node.nodeType !== 1) {
      if ((node.nodeValue || '').trim())
        throw new PublisherReaderError('unsupported-body-structure');
      continue;
    }
    const element = node as Element;
    if (media(element) || hidden(element)) {
      omittedElements += 1;
      continue;
    }
    if (element.tagName !== 'p') throw new PublisherReaderError('unsupported-body-structure');
    const rawStart = almaCompact(element.firstChild?.nodeValue || '');
    if (rawStart === '関連リンク') {
      if (
        children.at(-1) !== element ||
        !element.getElementsByTagName('a').length ||
        almaChildren(element).some((child) => !['br', 'a'].includes(child.tagName)) ||
        Array.from(element.childNodes).some(
          (child, index) => index > 0 && child.nodeType === 3 && (child.nodeValue || '').trim(),
        )
      )
        throw new PublisherReaderError('unsupported-body-structure');
      omittedElements += 1;
      continue;
    }
    const text = paragraphText(element);
    if (text) parts.push(text);
  }
  const text = parts.join('\n\n');
  if (parts.length < 2 || text.length < 100) throw new PublisherReaderError('body-missing');
  if (parts.length > 2048 || text.length > MAX_ARTICLE_CHARS)
    throw new PublisherReaderError('body-size-limit');
  if (!/[ぁ-ゖァ-ヺ]/u.test(text)) throw new PublisherReaderError('japanese-text-missing');
  let cursor = 0;
  const blocks = parts.map((part) => {
    const start = cursor;
    cursor += part.length + 2;
    return { kind: 'paragraph' as const, start, end: start + part.length, sha256: sha256Hex(part) };
  });
  return {
    canonicalUrl,
    ogUrl: canonicalUrl.slice(0, -5),
    title,
    publishedAt,
    displayDate,
    text,
    blocks,
    omittedElements,
  };
}
