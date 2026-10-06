import { sha256Hex } from '@bunki/ai/hash';
import { DOMParser } from '@xmldom/xmldom';
import { z } from 'zod';
import { instantSchema } from '../model.ts';
import {
  ALMA_ORIGIN,
  ALMA_POLICY_URL,
  MAX_PUBLISHER_HTML_BYTES,
  PublisherReaderError,
} from './selection.ts';
export { ALMA_ORIGIN, ALMA_POLICY_URL } from './selection.ts';

export const ALMA_LICENSE_URL = 'https://creativecommons.org/licenses/by/4.0/';
export const ALMA_POLICY_CHECKED_AT = '2026-09-10T05:39:23.410Z';
export const ALMA_RIGHTS_SHA256 =
  '13cd5a92ed941819781c6cf93937295dc62c791196b11c4202949141a4409818';
export const ALMA_READER_VERSION = 'alma-ja/1';
export const ALMA_PROVIDER = '国立天文台';

export const almaHas = (node: Element, name: string) =>
  (node.getAttribute('class') || '').split(/\s+/u).includes(name);
export const almaElements = (root: Document | Element): Element[] =>
  Array.from(root.getElementsByTagName('*'));
export const almaWithClass = (root: Document | Element, name: string) =>
  almaElements(root).filter((node) => almaHas(node, name));
export const almaCompact = (text: string) => text.replace(/[\t\r\n ]+/gu, ' ').trim();
export const almaChildren = (root: Node): Element[] =>
  Array.from(root.childNodes || []).filter((node): node is Element => node.nodeType === 1);
export const almaOne = (
  nodes: Element[],
  code: ConstructorParameters<typeof PublisherReaderError>[0],
) => {
  if (nodes.length !== 1) throw new PublisherReaderError(code);
  return nodes[0]!;
};
export function almaMeta(doc: Document, name: string, required = true): string | null {
  const nodes = Array.from(doc.getElementsByTagName('meta')).filter(
    (node) => node.getAttribute('property') === name || node.getAttribute('name') === name,
  );
  if (!required && !nodes.length) return null;
  return almaOne(nodes, 'template-changed').getAttribute('content');
}

export function parseAlmaDocument(html: string): Document {
  if (new TextEncoder().encode(html).length > MAX_PUBLISHER_HTML_BYTES)
    throw new PublisherReaderError('html-size-limit');
  const doctypes = html.match(/<!DOCTYPE[^>]*>/giu) || [];
  if (
    doctypes.length !== 1 ||
    !/^<!DOCTYPE\s+html\s*>$/iu.test(doctypes[0]!) ||
    /<!ENTITY|<\?xml/iu.test(html) ||
    (html.match(/</gu)?.length || 0) > 20_000
  )
    throw new PublisherReaderError('html-structure-invalid');
  let invalid = false,
    warnings = 0;
  let doc: Document;
  try {
    doc = new DOMParser({
      errorHandler: {
        warning(message: string) {
          warnings += 1;
          // These exact valid HTML booleans occur in the observed inert template.
          if (warnings > 100 || !/attribute "(?:async|itemscope)" missed value/u.test(message))
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
  const pending = [{ node: doc as Node, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (++count > 30_000 || depth > 64) throw new PublisherReaderError('html-structure-invalid');
    for (const child of Array.from(node.childNodes || []))
      pending.push({ node: child, depth: depth + 1 });
  }
  const envelope = Array.from(doc.documentElement?.childNodes || []).filter(
    (node) => node.nodeType === 1 || (node.nodeType === 3 && (node.nodeValue || '').trim()),
  );
  if (
    invalid ||
    doc.documentElement?.tagName.toLowerCase() !== 'html' ||
    envelope.length !== 2 ||
    envelope[0]?.nodeName !== 'head' ||
    envelope[1]?.nodeName !== 'body' ||
    doc.getElementsByTagName('head').length !== 1 ||
    doc.getElementsByTagName('body').length !== 1
  )
    throw new PublisherReaderError('html-structure-invalid');
  if (!/^ja(?:-jp)?$/iu.test(doc.documentElement.getAttribute('lang') || ''))
    throw new PublisherReaderError('japanese-text-missing');
  return doc;
}

const sha = z.string().regex(/^[a-f0-9]{64}$/u);
const responseSchema = z.strictObject({
  html: z.string().max(MAX_PUBLISHER_HTML_BYTES),
  finalUrl: z.string().min(1).max(4096),
  contentType: z.string().min(1).max(300),
  fetchedAt: instantSchema,
  responseSha256: sha,
  responseBytes: z.number().int().min(1).max(MAX_PUBLISHER_HTML_BYTES),
});
export type AlmaHtmlResponse = Readonly<z.infer<typeof responseSchema>>;
export function validateAlmaResponse(raw: unknown): AlmaHtmlResponse {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw new PublisherReaderError('invalid-reader-result');
  const response = { ...parsed.data, fetchedAt: new Date(parsed.data.fetchedAt).toISOString() };
  if (!/^text\/html(?:\s*;\s*charset\s*=\s*"?utf-?8"?)?\s*$/iu.test(response.contentType))
    throw new PublisherReaderError('unsupported-mime');
  const bytes = new TextEncoder().encode(response.html);
  if (bytes.length > MAX_PUBLISHER_HTML_BYTES) throw new PublisherReaderError('html-size-limit');
  if (new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== response.html)
    throw new PublisherReaderError('invalid-encoding');
  if (
    bytes.length !== response.responseBytes ||
    sha256Hex(response.html) !== response.responseSha256
  )
    throw new PublisherReaderError('response-identity-mismatch');
  return response;
}

export const almaPolicyEvidenceSchema = z.strictObject({
  url: z.literal(ALMA_POLICY_URL),
  canonicalUrl: z.literal(`${ALMA_ORIGIN}/policy`),
  fetchedAt: instantSchema,
  responseSha256: sha,
  responseBytes: z.number().int().min(1).max(MAX_PUBLISHER_HTML_BYTES),
  rightsSectionSha256: z.literal(ALMA_RIGHTS_SHA256),
  reviewedAt: z.literal(ALMA_POLICY_CHECKED_AT),
  licenseUrl: z.literal(ALMA_LICENSE_URL),
  provider: z.literal(ALMA_PROVIDER),
});

/** Compare the authoritative rights section, not the changing related-news cards.
 * A hash is only an integrity check; the native fixed policy URL supplies origin.
 */
export function verifyAlmaPolicyResponse(raw: unknown) {
  const response = validateAlmaResponse(raw);
  if (response.finalUrl !== ALMA_POLICY_URL) throw new PublisherReaderError('redirect-rejected');
  const doc = parseAlmaDocument(response.html);
  const canonical = almaOne(
    Array.from(doc.getElementsByTagName('link')).filter((node) =>
      (node.getAttribute('rel') || '').split(/\s/u).includes('canonical'),
    ),
    'canonical-mismatch',
  );
  if (
    canonical.getAttribute('href') !== `${ALMA_ORIGIN}/policy` ||
    almaMeta(doc, 'og:url') !== `${ALMA_ORIGIN}/policy` ||
    almaMeta(doc, 'og:title') !== '利用規約 - アルマ望遠鏡'
  )
    throw new PublisherReaderError('license-unreviewed');
  const area = almaOne(
    almaWithClass(doc, 'common_page_body').filter((node) => almaHas(node, 'wysiwyg')),
    'license-missing',
  );
  const inner = almaOne(almaWithClass(area, 'wysiwyg_box_inner-narrow'), 'license-missing');
  const children = almaChildren(inner);
  const stop = children.findIndex(
    (node) =>
      node.tagName === 'h3' && almaCompact(node.textContent || '') === 'プライバシーポリシー',
  );
  const rights = children.slice(0, stop);
  if (
    stop !== 11 ||
    rights.map((node) => node.tagName).join(',') !== 'h3,p,ul,p,ul,p,p,p,dl,p,dl' ||
    almaCompact(rights[0]?.textContent || '') !== 'アルマ望遠鏡 著作物利用規程'
  )
    throw new PublisherReaderError('license-unreviewed');
  // Do not ignore hidden or unknown additions in the reviewed legal section.
  const links = rights.flatMap((node) => Array.from(node.getElementsByTagName('a')));
  if (links.length !== 1 || links[0]!.getAttribute('href') !== `${ALMA_LICENSE_URL}deed.ja`)
    throw new PublisherReaderError('license-unreviewed');
  const text = rights.map((node) => almaCompact(node.textContent || '')).join('\n\n');
  if (sha256Hex(text) !== ALMA_RIGHTS_SHA256) throw new PublisherReaderError('license-unreviewed');
  return almaPolicyEvidenceSchema.parse({
    url: ALMA_POLICY_URL,
    canonicalUrl: `${ALMA_ORIGIN}/policy`,
    fetchedAt: response.fetchedAt,
    responseSha256: response.responseSha256,
    responseBytes: response.responseBytes,
    rightsSectionSha256: ALMA_RIGHTS_SHA256,
    reviewedAt: ALMA_POLICY_CHECKED_AT,
    licenseUrl: ALMA_LICENSE_URL,
    provider: ALMA_PROVIDER,
  });
}
