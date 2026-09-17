import { sha256Hex } from '@bunki/ai/hash';
import { immutable, isWellFormedText, ReadingValidationError, type DeepReadonly } from './common.ts';

export const FILE_SOURCE_LIMITS = Object.freeze({ bytes: 20 * 1024 * 1024, pages: 20, body: 120_000, regions: 8000 });
export type FileReference = Readonly<{ name: string; sha256: string; bytes: number; mimeType: string; kind: 'image' | 'pdf'; pageCount: number }>;
export type FileTextBounds = Readonly<{ left: number; top: number; width: number; height: number }>;
export type FileTextRegion = Readonly<{ start: number; end: number; text: string; confidence: number | null; bounds: FileTextBounds }>;
type Page = { page: number; width: number; height: number; rotation: number; coordinateSpace: string;
  unit: 'utf16-code-unit'; provider: 'apple-vision' | 'apple-pdfkit-text' | 'apple-vision-pdf';
  revision: number | null; text: string; regions: FileTextRegion[] };
type Observation = { version: 1; file: FileReference; pages: Page[] };
declare const mappedObservation: unique symbol;
/** The brand proves bounded shape and exact text/region mapping only. Imported
 * provider/confidence claims are observations, never correctness or authority. */
export type FileTextObservation = DeepReadonly<Observation> & { readonly [mappedObservation]: true };
type Review = { version: 1; observation: FileTextObservation; reviewedPages: { page: number; text: string }[];
  body: string; bodySha256: string; pages: { page: number; start: number; end: number; changed: boolean; regions: FileTextRegion[] }[] };
declare const reviewedMapping: unique symbol;
export type ReviewedFileText = DeepReadonly<Review> & { readonly [reviewedMapping]: true };
const observations = new WeakSet<object>(), reviews = new WeakSet<object>();
const reject = (path: string): never => { throw new ReadingValidationError('invalid-input', [`file-source.${path}`]); };
function record<const K extends readonly string[]>(raw: unknown, required: K, optional: readonly string[] = []): Record<K[number], unknown> & Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![Object.prototype, null].includes(Object.getPrototypeOf(raw)) ||
      Object.getOwnPropertySymbols(raw).length) return reject('fields');
  const ds = Object.getOwnPropertyDescriptors(raw), keys = Object.keys(ds);
  if (!required.every(k => Object.hasOwn(ds, k)) || keys.some(k => !required.includes(k) && !optional.includes(k)) ||
      keys.some(k => !('value' in ds[k]!) || !ds[k]!.enumerable)) return reject('fields');
  return raw as Record<K[number], unknown> & Record<string, unknown>;
}
function list(raw: unknown, maximum: number): unknown[] {
  if (!Array.isArray(raw) || raw.length > maximum || Object.getOwnPropertySymbols(raw).length ||
      Object.keys(Object.getOwnPropertyDescriptors(raw)).length !== raw.length + 1) return reject('list');
  const values: unknown[] = [];
  for (let i = 0; i < raw.length; i++) {
    const d = Object.getOwnPropertyDescriptor(raw, String(i));
    if (!d || !('value' in d) || !d.enumerable) return reject('list');
    values.push(d.value);
  }
  return values;
}
function prose(raw: unknown, max: number): string {
  // eslint-disable-next-line no-control-regex -- Source prose permits tab/newline only among controls.
  if (typeof raw !== 'string' || raw.length > max || !isWellFormedText(raw) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(raw)) return reject('text');
  return raw;
}
function number(raw: unknown, min: number, max: number, integer = false): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw) || Object.is(raw, -0) || raw < min || raw > max || (integer && !Number.isSafeInteger(raw))) return reject('number');
  return raw;
}
export function parseFileReference(raw: unknown): FileReference {
  const d = record(raw, ['name', 'sha256', 'bytes', 'mimeType', 'kind', 'pageCount']);
  const name = prose(d.name, 255), bytes = number(d.bytes, 1, FILE_SOURCE_LIMITS.bytes, true), pageCount = number(d.pageCount, 1, 10_000, true);
  if (!name.trim() || /[/\\\t\r\n]/u.test(name) || ['.', '..'].includes(name) || typeof d.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(d.sha256)) return reject('reference');
  if (!(d.kind === 'pdf' && d.mimeType === 'application/pdf') && !(d.kind === 'image' && pageCount === 1 &&
      typeof d.mimeType === 'string' && ['image/png', 'image/jpeg', 'image/heic', 'image/heif', 'image/tiff'].includes(d.mimeType))) return reject('type');
  return immutable({ name, sha256: d.sha256, bytes, mimeType: d.mimeType as string, kind: d.kind as FileReference['kind'], pageCount });
}
export function sameFileBytes(a: FileReference, b: FileReference): boolean {
  const left = parseFileReference(a), right = parseFileReference(b);
  return ['sha256', 'bytes', 'mimeType', 'kind', 'pageCount'].every(k => left[k as keyof FileReference] === right[k as keyof FileReference]);
}
function region(raw: unknown, body: string, isPDFText: boolean): FileTextRegion {
  const d = record(raw, ['start', 'end', 'text', 'bounds'], ['confidence']);
  const start = number(d.start, 0, body.length, true), end = number(d.end, start + 1, body.length, true), text = prose(d.text, FILE_SOURCE_LIMITS.body);
  if (body.slice(start, end) !== text || !text.length) return reject('region-text');
  const b = record(d.bounds, ['left', 'top', 'width', 'height']);
  const left = number(b.left, 0, 1), top = number(b.top, 0, 1), width = number(b.width, Number.MIN_VALUE, 1), height = number(b.height, Number.MIN_VALUE, 1);
  if (left + width > 1 + 1e-9 || top + height > 1 + 1e-9) return reject('bounds');
  const confidence = !Object.hasOwn(d, 'confidence') || d['confidence'] === null ? null : number(d['confidence'], 0, 1);
  if (isPDFText ? confidence !== null : confidence === null) return reject('confidence');
  return { start, end, text, confidence, bounds: { left, top, width, height } };
}
export function parseFileTextObservation(raw: unknown): FileTextObservation {
  if (raw && typeof raw === 'object' && observations.has(raw)) return raw as FileTextObservation;
  const d = record(raw, ['version', 'file', 'pages']), file = parseFileReference(d.file);
  if (d.version !== 1) return reject('version');
  let total = 0, regionCount = 0, previous = 0;
  const pages = list(d.pages, FILE_SOURCE_LIMITS.pages).map(value => {
    const p = record(value, ['page', 'width', 'height', 'rotation', 'coordinateSpace', 'unit', 'provider', 'text', 'regions'], ['revision']);
    const page = number(p.page, 1, file.pageCount, true), width = number(p.width, Number.MIN_VALUE, 40_000), height = number(p.height, Number.MIN_VALUE, 40_000);
    const rotation = number(p.rotation, 0, 270, true), text = prose(p.text, FILE_SOURCE_LIMITS.body), pdfText = p.provider === 'apple-pdfkit-text';
    if ((previous && page !== previous + 1) || ![0, 90, 180, 270].includes(rotation) || p.unit !== 'utf16-code-unit' ||
        (file.kind === 'image' ? p.provider !== 'apple-vision' || rotation !== 0 || width * height > 40_000_000
          : typeof p.provider !== 'string' || !['apple-pdfkit-text', 'apple-vision-pdf'].includes(p.provider)) ||
        p.coordinateSpace !== (pdfText ? 'normalized-top-left-unrotated-media-box' : 'normalized-top-left-oriented-page')) return reject('page');
    previous = page; total += text.length;
    const revision = !Object.hasOwn(p, 'revision') || p['revision'] === null ? null : number(p['revision'], 1, 1000, true);
    if (pdfText ? revision !== null : revision === null) return reject('revision');
    let cursor = 0;
    const regions = list(p.regions, 4000).map(r => {
      const mapped = region(r, text, pdfText);
      if (mapped.start < cursor) return reject('region-order');
      cursor = mapped.end; return mapped;
    });
    regionCount += regions.length;
    if (total > FILE_SOURCE_LIMITS.body || regionCount > FILE_SOURCE_LIMITS.regions) return reject('capacity');
    return { page, width, height, rotation, coordinateSpace: p.coordinateSpace as string, unit: 'utf16-code-unit' as const,
      provider: p.provider as Page['provider'], revision, text, regions };
  });
  if (!pages.length) return reject('pages');
  const result = immutable({ version: 1, file, pages }) as FileTextObservation;
  observations.add(result); return result;
}
/** Learner review is explicit, but is not editorial approval. Conservative
 * page-only anchoring after a correction avoids moving a box to other words. */
export function reviewFileText(observation: unknown, input: unknown): ReviewedFileText {
  const parsed = parseFileTextObservation(observation), values = list(input, FILE_SOURCE_LIMITS.pages);
  if (values.length !== parsed.pages.length) return reject('review-pages');
  let body = '';
  const reviewedPages = values.map((raw, i) => {
    const p = record(raw, ['page', 'text']);
    if (p.page !== parsed.pages[i]!.page) return reject('review-page');
    return { page: p.page as number, text: prose(p.text, FILE_SOURCE_LIMITS.body) };
  });
  const pages = reviewedPages.map((p, i) => {
    if (i) body += '\n\n';
    const start = body.length; body += p.text;
    if (body.length > FILE_SOURCE_LIMITS.body) return reject('capacity');
    const original = parsed.pages[i]!, changed = p.text !== original.text;
    return { page: p.page, start, end: body.length, changed,
      regions: changed ? [] : original.regions.map(r => ({ ...r, start: r.start + start, end: r.end + start })) };
  });
  const result = immutable({ version: 1, observation: parsed, reviewedPages, body, bodySha256: sha256Hex(body), pages }) as ReviewedFileText;
  reviews.add(result); return result;
}
export function parseReviewedFileText(raw: unknown): ReviewedFileText {
  if (raw && typeof raw === 'object' && reviews.has(raw)) return raw as ReviewedFileText;
  const d = record(raw, ['version', 'observation', 'reviewedPages', 'body', 'bodySha256', 'pages']);
  const expected = reviewFileText(d.observation, d.reviewedPages);
  if (d.version !== 1 || d.body !== expected.body || d.bodySha256 !== expected.bodySha256) return reject('review-mapping');
  const pages = list(d.pages, FILE_SOURCE_LIMITS.pages);
  if (pages.length !== expected.pages.length) return reject('review-mapping');
  pages.forEach((rawPage, i) => {
    const p = record(rawPage, ['page', 'start', 'end', 'changed', 'regions']), e = expected.pages[i]!;
    if (p.page !== e.page || p.start !== e.start || p.end !== e.end || p.changed !== e.changed || Object.is(p.start, -0) || Object.is(p.end, -0)) return reject('review-mapping');
    const regions = list(p.regions, 4000).map(r => region(r, expected.body, expected.observation.pages[i]!.provider === 'apple-pdfkit-text'));
    if (JSON.stringify(regions) !== JSON.stringify(e.regions)) return reject('review-mapping');
  });
  return expected;
}
export function fileTextSourceRange(document: ReviewedFileText, selection: { sourceDigest: string; start: number; end: number; quote: string }):
  DeepReadonly<{ pages: { page: number; changed: boolean; regions: FileTextRegion[] }[] }> | null {
  const parsed = parseReviewedFileText(document), { start, end, quote, sourceDigest } = selection;
  number(start, 0, parsed.body.length, true); number(end, start + 1, parsed.body.length, true);
  if (sourceDigest !== parsed.bodySha256 || parsed.body.slice(start, end) !== quote || !isWellFormedText(quote)) return reject('selection');
  const pages = parsed.pages.filter(p => p.start < end && p.end > start).map(p => ({ page: p.page, changed: p.changed,
    regions: p.regions.filter(r => r.start < end && r.end > start) }));
  return pages.length ? immutable({ pages }) : null;
}
