import { sha256Hex } from '@bunki/ai/hash';
import { DOMParser } from '@xmldom/xmldom';
import { MAX_ARTICLE_CHARS } from '@bunki/reading';
import { canonicalFeedLink, instantSchema } from '../model.ts';
import {
  GLOBAL_VOICES_LICENSE_URL,
  MAX_PUBLISHER_HTML_BYTES,
  globalVoicesArticleUrl,
  PublisherReaderError,
} from './selection.ts';

export interface PublisherCredit {
  readonly name: string;
  readonly url: string;
}
export interface PublisherTextBlock {
  readonly kind: 'paragraph' | 'heading' | 'list-item';
  readonly start: number;
  readonly end: number;
  readonly sha256: string;
}
export interface ExtractedGlobalVoicesArticle {
  readonly canonicalUrl: string;
  readonly title: string;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly authors: readonly PublisherCredit[];
  readonly translators: readonly PublisherCredit[];
  readonly otherCredits: readonly (PublisherCredit & { readonly role: '校正' })[];
  readonly licenseUrl: string;
  readonly text: string;
  readonly blocks: readonly PublisherTextBlock[];
  readonly omittedElements: number;
}

const classes = (element: Element) => (element.getAttribute('class') || '').split(/\s+/u);
const has = (element: Element, name: string) => classes(element).includes(name);
const elements = (root: Document | Element): Element[] =>
  Array.from(root.getElementsByTagName('*'));
const withClass = (root: Document | Element, name: string) =>
  elements(root).filter((node) => has(node, name));
const one = (
  nodes: Element[],
  code: ConstructorParameters<typeof PublisherReaderError>[0],
): Element => {
  if (nodes.length !== 1) throw new PublisherReaderError(code);
  return nodes[0]!;
};
const hidden = (node: Element) =>
  node.hasAttribute('hidden') ||
  node.getAttribute('aria-hidden') === 'true' ||
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/iu.test(
    node.getAttribute('style') || '',
  );
const discardedTags = new Set([
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
const discard = (node: Element) =>
  hidden(node) ||
  discardedTags.has(node.tagName.toLowerCase()) ||
  classes(node).some((name) =>
    [
      'wp-caption',
      'wp-caption-text',
      'twitter-tweet',
      'instagram-media',
      'wp-block-embed',
      'fb-post',
      'tiktok-embed',
      'contributors',
    ].includes(name),
  );

function inertText(node: Node): string {
  if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue || '';
  if (node.nodeType !== 1 || discard(node as Element)) return '';
  if ((node as Element).tagName.toLowerCase() === 'br') return '\n';
  return Array.from(node.childNodes).map(inertText).join('');
}
const compact = (value: string) => value.replace(/[\t\r\n ]+/gu, ' ').trim();
function text(node: Element, max: number): string {
  const result = compact(inertText(node));
  if (!result || result.length > max) throw new PublisherReaderError('attribution-ambiguous');
  return result;
}
function metadata(doc: Document, key: string, required = true): string | null {
  const values = Array.from(doc.getElementsByTagName('meta'))
    .filter((node) => node.getAttribute('property') === key || node.getAttribute('name') === key)
    .map((node) => node.getAttribute('content'));
  if (values.length === 0 && !required) return null;
  if (values.length !== 1 || !values[0]) throw new PublisherReaderError('template-changed');
  return values[0]!;
}

function parseDocument(html: string): Document {
  if (typeof html !== 'string' || new TextEncoder().encode(html).length > MAX_PUBLISHER_HTML_BYTES)
    throw new PublisherReaderError('html-size-limit');
  const declarations = html.match(/<!DOCTYPE[^>]*>/giu) || [];
  if (
    declarations.length !== 1 ||
    !/^<!DOCTYPE\s+html\s*>$/iu.test(declarations[0]!) ||
    /<!ENTITY|<\?xml/iu.test(html) ||
    (html.match(/</gu)?.length || 0) > 20_000
  )
    throw new PublisherReaderError('html-structure-invalid');
  let warnings = 0;
  let invalid = false;
  let document: Document;
  try {
    document = new DOMParser({
      errorHandler: {
        warning(message: string) {
          warnings += 1;
          // The installed XML DOM's HTML mode reports valid valueless HTML
          // booleans. Only the observed harmless template attributes are accepted.
          if (
            warnings > 100 ||
            !/attribute "(?:async|defer|autofocus|data-a11y-dialog-hide)" missed value/gu.test(
              message,
            )
          )
            invalid = true;
        },
        error() {
          invalid = true;
        },
        fatalError() {
          throw new PublisherReaderError('html-structure-invalid');
        },
      },
    }).parseFromString(html, 'text/html');
  } catch {
    throw new PublisherReaderError('html-structure-invalid');
  }
  const pending: { node: Node; depth: number }[] = [{ node: document, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const selected = pending.pop()!;
    count += 1;
    if (count > 30_000 || selected.depth > 64)
      throw new PublisherReaderError('html-structure-invalid');
    // xmldom represents leaves (including the doctype) with null childNodes.
    for (const child of Array.from(selected.node.childNodes || []))
      pending.push({ node: child, depth: selected.depth + 1 });
  }
  if (invalid || document.documentElement?.tagName.toLowerCase() !== 'html')
    throw new PublisherReaderError('html-structure-invalid');
  const envelope = Array.from(document.documentElement.childNodes).filter(
    (node) => node.nodeType === 1 || (node.nodeType === 3 && (node.nodeValue || '').trim()),
  );
  if (
    envelope.length !== 2 ||
    envelope[0]?.nodeName.toLowerCase() !== 'head' ||
    envelope[1]?.nodeName.toLowerCase() !== 'body' ||
    document.getElementsByTagName('head').length !== 1 ||
    document.getElementsByTagName('body').length !== 1
  )
    throw new PublisherReaderError('html-structure-invalid');
  const language = document.documentElement.getAttribute('lang');
  // This publisher's current Japanese template uses the legacy non-BCP47
  // marker "jp". Admission still requires the exact Japanese-site canonical
  // URL, its translator credits and actual Japanese body text below.
  if (!language || !/^(?:ja(?:-jp)?|jp)$/iu.test(language))
    throw new PublisherReaderError('japanese-text-missing');
  return document;
}

function date(value: string | null, fetchedAt: string): string {
  if (!value) throw new PublisherReaderError('date-missing');
  const selected = value.replace(/([+-]\d{2})(\d{2})$/u, '$1:$2');
  if (
    !instantSchema.safeParse(selected).success ||
    !Number.isFinite(Date.parse(selected)) ||
    Date.parse(selected) > Date.parse(fetchedAt) + 300_000
  )
    throw new PublisherReaderError('date-invalid');
  return new Date(selected).toISOString();
}

function creditLink(link: Element): PublisherCredit {
  let url: string;
  try {
    const rawUrl = link.getAttribute('href') || '';
    url = canonicalFeedLink(rawUrl);
    const parsed = new URL(url);
    if (
      url !== rawUrl ||
      parsed.protocol !== 'https:' ||
      parsed.search ||
      parsed.hash ||
      !(
        parsed.hostname === 'globalvoices.org' ||
        /^[a-z]{2,3}\.globalvoices\.org$/u.test(parsed.hostname)
      ) ||
      !parsed.pathname.startsWith('/author/')
    )
      throw new Error('credit-link');
  } catch {
    throw new PublisherReaderError('attribution-ambiguous');
  }
  return { name: text(link, 100), url };
}

function credits(doc: Document) {
  const header = one(
    elements(doc).filter((node) => node.getAttribute('id') === 'post-header-credit'),
    'attribution-missing',
  );
  const authors: PublisherCredit[] = [];
  const translators: PublisherCredit[] = [];
  for (const contributor of withClass(header, 'contributor-name')) {
    const role = text(one(withClass(contributor, 'credit-label'), 'attribution-ambiguous'), 100);
    const link = one(withClass(contributor, 'user-link'), 'attribution-ambiguous');
    const credit = creditLink(link);
    if (/^(?:記者|原文)(?:\s|\(|$)/u.test(role)) authors.push(credit);
    else if (/^翻訳(?:\s|\(|$)/u.test(role)) translators.push(credit);
    else throw new PublisherReaderError('attribution-ambiguous');
  }
  if (!authors.length || !translators.length) throw new PublisherReaderError('attribution-missing');
  for (const group of [authors, translators]) {
    if (
      group.length > 4 ||
      new Set(group.map((credit) => credit.url)).size !== group.length ||
      group.map((credit) => credit.name).join(', ').length > 300
    )
      throw new PublisherReaderError('attribution-ambiguous');
  }
  const metaAuthor = metadata(doc, 'author', false);
  if (metaAuthor && compact(metaAuthor) !== authors.map((credit) => credit.name).join(', '))
    throw new PublisherReaderError('attribution-ambiguous');
  const otherCredits: (PublisherCredit & { role: '校正' })[] = [];
  for (const element of withClass(doc, 'contributors')) {
    const link = one(Array.from(element.getElementsByTagName('a')), 'attribution-ambiguous');
    const selected = creditLink(link);
    // Read the contributor's children because the container itself is excluded
    // from body extraction after its exact attribution has been checked here.
    const label = compact(Array.from(element.childNodes).map(inertText).join(''));
    if (label !== `校正:${selected.name}` && label !== `校正: ${selected.name}`)
      throw new PublisherReaderError('attribution-ambiguous');
    otherCredits.push({ role: '校正', ...selected });
  }
  if (
    otherCredits.length > 4 ||
    new Set(otherCredits.map((credit) => credit.url)).size !== otherCredits.length
  )
    throw new PublisherReaderError('attribution-ambiguous');
  return { authors, translators, otherCredits };
}

function checkedLicense(doc: Document): string {
  const area = one(withClass(doc, 'postfooter-credits'), 'license-missing');
  const badge = one(withClass(area, 'license'), 'license-missing');
  const links = Array.from(badge.getElementsByTagName('a'));
  if (!links.length) throw new PublisherReaderError('license-missing');
  for (const link of links) {
    let url: URL;
    try {
      url = new URL(link.getAttribute('href') || '');
    } catch {
      throw new PublisherReaderError('license-unreviewed');
    }
    if (
      url.origin !== 'https://creativecommons.org' ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !['/licenses/by/3.0/', '/licenses/by/3.0/deed.ja'].includes(url.pathname)
    )
      throw new PublisherReaderError('license-unreviewed');
  }
  if (/all rights reserved|無断転載|転載禁止|改変禁止|非営利/iu.test(inertText(badge)))
    throw new PublisherReaderError('license-unreviewed');
  return GLOBAL_VOICES_LICENSE_URL;
}

function body(entry: Element) {
  const parts: { kind: PublisherTextBlock['kind']; text: string }[] = [];
  let omittedElements = 0;
  const blocks = new Set(['p', 'h2', 'h3', 'h4', 'h5', 'h6', 'li']);
  const containers = new Set(['div', 'section', 'blockquote', 'ul', 'ol']);
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
  const inlineText = (node: Node): string => {
    if (node.nodeType === 3 || node.nodeType === 4) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    const element = node as Element;
    if (discard(element)) {
      omittedElements += 1;
      return '';
    }
    if (!inline.has(element.tagName.toLowerCase()))
      throw new PublisherReaderError('unsupported-body-structure');
    if (
      element.tagName.toLowerCase() === 'a' &&
      (element.getAttribute('rel') || '').split(/\s/u).includes('license') &&
      element.getAttribute('href') !== GLOBAL_VOICES_LICENSE_URL
    )
      throw new PublisherReaderError('license-unreviewed');
    return element.tagName.toLowerCase() === 'br'
      ? '\n'
      : Array.from(element.childNodes).map(inlineText).join('');
  };
  const visit = (node: Node): void => {
    if (node.nodeType === 8) return;
    if (node.nodeType !== 1) {
      if ((node.nodeValue || '').trim())
        throw new PublisherReaderError('unsupported-body-structure');
      return;
    }
    const element = node as Element;
    if (discard(element)) {
      omittedElements += 1;
      return;
    }
    const tag = element.tagName.toLowerCase();
    if (blocks.has(tag)) {
      const selected = compact(Array.from(element.childNodes).map(inlineText).join(''));
      if (selected)
        parts.push({
          kind: tag === 'li' ? 'list-item' : tag.startsWith('h') ? 'heading' : 'paragraph',
          text: selected,
        });
    } else if (containers.has(tag))
      for (const child of Array.from(element.childNodes)) visit(child);
    else throw new PublisherReaderError('unsupported-body-structure');
    if (parts.length > 2048) throw new PublisherReaderError('body-size-limit');
  };
  for (const child of Array.from(entry.childNodes)) visit(child);
  const value = parts.map((part) => part.text).join('\n\n');
  if (value.length > MAX_ARTICLE_CHARS) throw new PublisherReaderError('body-size-limit');
  if (value.length < 32 || !parts.length) throw new PublisherReaderError('body-missing');
  if (!/[ぁ-ゖァ-ヺ]/u.test(value)) throw new PublisherReaderError('japanese-text-missing');
  let offset = 0;
  const spans = parts.map((part) => {
    const start = offset;
    offset += part.text.length + 2;
    return { kind: part.kind, start, end: start + part.text.length, sha256: sha256Hex(part.text) };
  });
  return { text: value, blocks: spans, omittedElements };
}

/** Inert XML-DOM HTML mode is deliberately limited to this verified template. */
export function extractGlobalVoicesHtml(
  html: string,
  canonicalUrl: string,
  fetchedAt: string,
): ExtractedGlobalVoicesArticle {
  const document = parseDocument(html);
  const canonical = one(
    Array.from(document.getElementsByTagName('link')).filter((link) =>
      (link.getAttribute('rel') || '').split(/\s/u).includes('canonical'),
    ),
    'canonical-mismatch',
  );
  if (
    canonical.getAttribute('href') !== canonicalUrl ||
    metadata(document, 'og:url') !== canonicalUrl ||
    metadata(document, 'og:type') !== 'article'
  )
    throw new PublisherReaderError('canonical-mismatch');
  globalVoicesArticleUrl(canonicalUrl);
  // Related-article cards also use post-title. Only the current page's
  // screen-title is an article title, and it must agree with its OG metadata.
  const titleNode = one(
    withClass(document, 'post-title').filter((node) => has(node, 'screen-title')),
    'title-missing',
  );
  const title = compact(inertText(titleNode));
  if (!title || title.length > 500) throw new PublisherReaderError('title-missing');
  if (compact(metadata(document, 'og:title') || '') !== title)
    throw new PublisherReaderError('title-ambiguous');
  const articleNumber = canonicalUrl.split('/').filter(Boolean).at(-1)!;
  const post = one(
    withClass(document, 'post').filter((node) => has(node, `post-${articleNumber}`)),
    'template-changed',
  );
  const entry = one(withClass(post, 'entry'), 'template-changed');
  if (
    !entry.parentNode ||
    (entry.parentNode as Element).nodeType !== 1 ||
    !has(entry.parentNode as Element, 'entry-container')
  )
    throw new PublisherReaderError('template-changed');
  const { authors, translators, otherCredits } = credits(document);
  const licenseUrl = checkedLicense(document);
  const publishedAt = date(metadata(document, 'article:published_time', false), fetchedAt);
  const updatedAt = date(metadata(document, 'article:modified_time', false), fetchedAt);
  if (updatedAt < publishedAt) throw new PublisherReaderError('date-invalid');
  return {
    canonicalUrl,
    title,
    publishedAt,
    updatedAt,
    authors,
    translators,
    otherCredits,
    licenseUrl,
    ...body(entry),
  };
}
