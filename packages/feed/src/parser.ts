import { DOMParser } from '@xmldom/xmldom';
import { feedEntryId, feedRevisionId } from './identity.ts';
import {
  canonicalFeedLink,
  deepFreeze,
  FeedError,
  instantSchema,
  type FeedEntry,
  type FeedSnapshot,
  type FeedSource,
} from './model.ts';
import { getFeedSource } from './registry.ts';

export const MAX_FEED_BYTES = 2_000_000;
export const MAX_FEED_ITEMS = 250;
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RSS1 = 'http://purl.org/rss/1.0/';
const ATOM = 'http://www.w3.org/2005/Atom';
const DC = 'http://purl.org/dc/elements/1.1/';
const XML = 'http://www.w3.org/XML/1998/namespace';

/** A lexical budget runs before DOM allocation; it is not the XML validator. */
function budget(xml: string) {
  if (
    typeof xml !== 'string' ||
    !xml ||
    xml.length > MAX_FEED_BYTES ||
    new TextEncoder().encode(xml).length > MAX_FEED_BYTES
  )
    throw new FeedError('feed-size-limit');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) throw new FeedError('xml-declarations-forbidden');
  let depth = 0;
  let nodes = 0;
  for (let cursor = 0; cursor < xml.length;) {
    const at = xml.indexOf('<', cursor);
    if (at < 0) break;
    const special = xml.startsWith('<!--', at)
      ? '-->'
      : xml.startsWith('<![CDATA[', at)
        ? ']]>'
        : xml.startsWith('<?', at)
          ? '?>'
          : null;
    if (special) {
      const end = xml.indexOf(special, at + 2);
      if (end < 0) throw new FeedError('invalid-xml');
      cursor = end + special.length;
      continue;
    }
    let quote: string | null = null;
    let end = at + 1;
    for (; end < xml.length; end += 1) {
      const char = xml[end];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end >= xml.length) throw new FeedError('invalid-xml');
    if (xml[at + 1] === '/') depth -= 1;
    else {
      nodes += 1;
      if (xml[end - 1] !== '/') depth += 1;
    }
    if (depth > 32 || nodes > 20_000) throw new FeedError('xml-complexity-limit');
    cursor = end + 1;
  }
}

function children(node: Node, name?: string, namespace?: string | null): Element[] {
  const result: Element[] = [];
  for (let index = 0; index < node.childNodes.length; index += 1) {
    const child = node.childNodes.item(index);
    if (child.nodeType !== 1) continue;
    const element = child as Element;
    if (name && element.localName !== name) continue;
    if (namespace !== undefined && (element.namespaceURI || null) !== namespace) continue;
    result.push(element);
  }
  return result;
}

function field(node: Element, name: string, namespace: string | null): string | null {
  const found = children(node, name, namespace);
  if (found.length > 1) throw new FeedError('ambiguous-item');
  const value = found[0]?.textContent?.trim();
  if (!value) return null;
  if (value.length > 4096) throw new FeedError('metadata-field-limit');
  return value;
}

function published(value: string | null): string | null {
  if (!value || value.length > 100) return null;
  // Never infer a device-local timezone from an ambiguous publisher timestamp.
  if (!/(?:Z|[+-]\d\d:?\d\d|GMT|UT|UTC)$/iu.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time >= 0 ? new Date(time).toISOString() : null;
}

function baseFor(element: Element, feedUrl: string): string {
  const lineage: Element[] = [];
  let node: Node | null = element;
  while (node?.nodeType === 1) {
    lineage.unshift(node as Element);
    node = node.parentNode;
  }
  let base = feedUrl;
  for (const ancestor of lineage) {
    const next = ancestor.getAttributeNS(XML, 'base');
    if (next) base = canonicalFeedLink(next, base);
  }
  return base;
}

function entryFrom(
  item: Element,
  source: FeedSource,
  format: FeedSnapshot['format'],
  feedUrl: string,
  fetchedAt: string,
): FeedEntry {
  const ns = format === 'rss1' ? RSS1 : format === 'atom' ? ATOM : null;
  const title = field(item, 'title', ns);
  if (!title || title.length > 1000) throw new FeedError('missing-or-long-title');
  let link: string | null;
  let uid: string | null;
  if (format === 'atom') {
    const links = children(item, 'link', ATOM).filter(
      (node) => !node.getAttribute('rel') || node.getAttribute('rel') === 'alternate',
    );
    const selected =
      links.find(
        (node) => !node.getAttribute('type') || node.getAttribute('type') === 'text/html',
      ) || links[0];
    link = selected?.getAttribute('href') || null;
    if (link && selected) link = canonicalFeedLink(link, baseFor(selected, feedUrl));
    uid = field(item, 'id', ATOM);
  } else {
    link = field(item, 'link', ns);
    uid = format === 'rss1' ? item.getAttributeNS(RDF, 'about') || null : field(item, 'guid', null);
    const guid = children(item, 'guid', null)[0];
    if (!link && uid && guid?.getAttribute('isPermaLink') !== 'false') link = uid;
  }
  if (!link || (uid && uid.length > 4096)) throw new FeedError('missing-or-long-link');
  const canonicalUrl = canonicalFeedLink(link, baseFor(item, feedUrl));
  const publishedAt = published(
    format === 'atom'
      ? field(item, 'published', ATOM)
      : field(item, 'pubDate', null) || field(item, 'date', DC),
  );
  const updatedAt = published(
    format === 'atom'
      ? field(item, 'updated', ATOM)
      : field(item, 'modified', 'http://purl.org/dc/terms/'),
  );
  const categories = [
    ...new Set(
      [
        ...children(item, 'category', ns).map((node) =>
          format === 'atom' ? node.getAttribute('term') || '' : node.textContent?.trim() || '',
        ),
        ...children(item, 'subject', DC).map((node) => node.textContent?.trim() || ''),
      ].filter(Boolean),
    ),
  ].sort();
  if (categories.length > 20 || categories.some((value) => value.length > 120))
    throw new FeedError('metadata-field-limit');
  // Publisher GUIDs can be regenerated or reused; the published canonical
  // article link is the stable cross-channel discovery identity.
  const id = feedEntryId(source.publisherId, canonicalUrl);
  const revisionId = feedRevisionId({
    id,
    canonicalUrl,
    title,
    publishedAt,
    updatedAt,
    categories,
  });
  return deepFreeze({
    id,
    revisionId,
    sourceId: source.id,
    publisherId: source.publisherId,
    publisherUid: uid,
    canonicalUrl,
    title,
    publishedAt,
    updatedAt,
    categories,
    discoveredAt: fetchedAt,
    body: null,
    readerMode: 'publisher-window',
  });
}

/** XML input is discarded. No feed HTML, images, enclosures or body cross this API. */
export function parseFeedXml(
  xml: string,
  options: { sourceId: string; finalUrl: string; fetchedAt: string },
): FeedSnapshot {
  budget(xml);
  if (!instantSchema.safeParse(options.fetchedAt).success) throw new FeedError('invalid-clock');
  const source = getFeedSource(options.sourceId);
  const finalUrl = canonicalFeedLink(options.finalUrl);
  if (!source.feed || ![source.feed.url, ...source.feed.redirectUrls].includes(finalUrl))
    throw new FeedError('unregistered-feed-url');
  const reject = () => {
    throw new FeedError('invalid-xml');
  };
  let document: Document;
  try {
    document = new DOMParser({
      errorHandler: { warning: reject, error: reject, fatalError: reject },
    }).parseFromString(xml, 'application/xml');
  } catch {
    throw new FeedError('invalid-xml');
  }
  if (document.doctype) throw new FeedError('xml-declarations-forbidden');
  const roots = children(document);
  const root = roots[0];
  if (roots.length !== 1 || !root) throw new FeedError('invalid-xml');
  const pending: Array<{ node: Node; depth: number }> = [{ node: document, depth: 0 }];
  let nodeCount = 0;
  while (pending.length) {
    const current = pending.pop()!;
    nodeCount += 1;
    if (
      nodeCount > 30_000 ||
      current.depth > 34 ||
      (current.node.nodeType === 1 && (current.node as Element).attributes.length > 64)
    )
      throw new FeedError('xml-complexity-limit');
    const childNodes = current.node.childNodes;
    // xmldom's text/comment nodes have no child list, unlike browser DOM nodes.
    if (childNodes)
      for (let i = 0; i < childNodes.length; i += 1)
        pending.push({ node: childNodes.item(i), depth: current.depth + 1 });
  }
  let format: FeedSnapshot['format'];
  let items: Element[];
  let channel: Element;
  if (root.localName === 'RDF' && root.namespaceURI === RDF) {
    format = 'rss1';
    items = children(root, 'item', RSS1);
    const found = children(root, 'channel', RSS1);
    if (found.length !== 1) throw new FeedError('invalid-feed-channel');
    channel = found[0]!;
  } else if (
    root.localName === 'rss' &&
    !root.namespaceURI &&
    root.getAttribute('version') === '2.0'
  ) {
    format = 'rss2';
    const found = children(root, 'channel', null);
    if (found.length !== 1) throw new FeedError('invalid-feed-channel');
    channel = found[0]!;
    items = children(channel, 'item', null);
  } else if (root.localName === 'feed' && root.namespaceURI === ATOM) {
    format = 'atom';
    channel = root;
    items = children(root, 'entry', ATOM);
  } else throw new FeedError('unsupported-feed-format');
  if (items.length > MAX_FEED_ITEMS) throw new FeedError('feed-item-limit');
  const entries = new Map<string, FeedEntry>();
  let rejectedItems = 0;
  let duplicateItems = 0;
  let futureItems = 0;
  let latestPublishedAt: string | null = null;
  const fetched = Date.parse(options.fetchedAt);
  for (const item of items) {
    try {
      const entry = entryFrom(item, source, format, finalUrl, options.fetchedAt);
      const previous = entries.get(entry.id);
      if (previous) {
        duplicateItems += 1;
        if (entry.revisionId !== previous.revisionId) rejectedItems += 1;
        continue;
      }
      entries.set(entry.id, entry);
      if (entry.publishedAt) {
        const time = Date.parse(entry.publishedAt);
        if (time > fetched + 5 * 60_000) futureItems += 1;
        else if (!latestPublishedAt || entry.publishedAt > latestPublishedAt)
          latestPublishedAt = entry.publishedAt;
      }
    } catch (error) {
      if (!(error instanceof FeedError)) throw error;
      rejectedItems += 1;
    }
  }
  // A 200 HTML error page cannot become an empty successful RSS snapshot.
  if (items.length > 0 && entries.size === 0) throw new FeedError('no-valid-feed-items');
  return deepFreeze({
    sourceId: source.id,
    publisherId: source.publisherId,
    format,
    title:
      field(channel, 'title', format === 'rss1' ? RSS1 : format === 'atom' ? ATOM : null) ||
      source.name,
    fetchedAt: options.fetchedAt,
    finalUrl,
    entries: [...entries.values()],
    rejectedItems,
    duplicateItems,
    futureItems,
    latestPublishedAt,
  });
}
