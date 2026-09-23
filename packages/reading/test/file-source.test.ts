import { describe, expect, it } from 'vitest';
import {
  FILE_SOURCE_LIMITS,
  fileTextSourceRange,
  parseFileReference,
  parseFileTextObservation,
  parseReviewedFileText,
  reviewFileText,
  sameFileBytes,
} from '../src/file-source.ts';
import { canPerformArticleOperation, normalizeArticleIntake } from '../src/index.ts';
import { NOW, context, metadata } from './fixtures.ts';

const file = {
  name: '日本語.pdf',
  sha256: 'a'.repeat(64),
  bytes: 1200,
  mimeType: 'application/pdf',
  kind: 'pdf',
  pageCount: 8,
};
const original = '町で🚀を見た。\n図書館に行く。';
const page = (number: number, text = original) => ({
  page: number,
  width: 800,
  height: 600,
  rotation: 0,
  coordinateSpace: 'normalized-top-left-unrotated-media-box',
  unit: 'utf16-code-unit',
  provider: 'apple-pdfkit-text',
  text,
  regions: text
    ? [
        {
          start: 0,
          end: text.length,
          text,
          bounds: { left: 0.1, top: 0.2, width: 0.7, height: 0.1 },
        },
      ]
    : [],
});
const observation = () => ({
  version: 1,
  file: { ...file },
  pages: [page(3), page(4, '次のページ。')],
});
const review = () =>
  reviewFileText(observation(), [
    { page: 3, text: original },
    { page: 4, text: '修正した次のページ。' },
  ]);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
describe('file source observations and reviewed mappings', () => {
  it('uses a distinct neutral file-pointer type while retaining the web-link URL obligation', () => {
    const adapter = context({
      lineage: { kind: 'user-supplied' },
      capabilities: {
        'discover-metadata': {
          status: 'allowed',
          basis: { kind: 'user-action', reference: 'local-file:test', checkedAt: NOW },
        },
      },
    });
    const pointer = normalizeArticleIntake(
      { ...metadata({ canonicalUrl: null, body: null }), fileReference: file },
      adapter,
    );
    expect(pointer.article.kind).toBe('local-file-reference');
    expect(pointer.article.body).toBeNull();
    expect(canPerformArticleOperation(pointer.article, 'discover-metadata')).toBe(true);
    expect(canPerformArticleOperation(pointer.article, 'display-body')).toBe(false);
    expect(() =>
      normalizeArticleIntake(metadata({ canonicalUrl: null, body: null }), adapter),
    ).toThrow();
    expect(() =>
      normalizeArticleIntake({ ...metadata({ body: null }), fileReference: file }, adapter),
    ).toThrow();
    expect(() =>
      normalizeArticleIntake(
        { ...metadata({ canonicalUrl: null, body: null }), fileReference: file },
        context(),
      ),
    ).toThrow();
  });
  it('normalizes omitted Swift PDF optionals to null without treating extraction as truth', () => {
    const parsed = parseFileTextObservation(observation());
    expect(parsed.pages[0]!.revision).toBeNull();
    expect(parsed.pages[0]!.regions[0]!.confidence).toBeNull();
    expect(parseFileTextObservation(clone(parsed))).toEqual(parsed);
    expect(Object.isFrozen(parsed.pages[0]!.regions)).toBe(true);
  });
  it('keeps machine evidence and corrections separately, with page-only references after edits', () => {
    const result = review();
    expect(result.observation.pages[1]!.text).toBe('次のページ。');
    expect(result.body).toBe(original + '\n\n修正した次のページ。');
    expect(result.pages[0]!.regions).toHaveLength(1);
    expect(result.pages[1]!.changed).toBe(true);
    expect(result.pages[1]!.regions).toEqual([]);
    expect(parseReviewedFileText(clone(result))).toEqual(result);
  });
  it('maps exact UTF-16 selections to original pages, including supplementary characters and crossings', () => {
    const result = review();
    expect(
      fileTextSourceRange(result, {
        sourceDigest: result.bodySha256,
        start: 2,
        end: 4,
        quote: '🚀',
      })?.pages[0]!.page,
    ).toBe(3);
    const start = result.pages[0]!.end - 1,
      end = result.pages[1]!.start + 1;
    expect(
      fileTextSourceRange(result, {
        sourceDigest: result.bodySha256,
        start,
        end,
        quote: result.body.slice(start, end),
      })?.pages.map((p) => p.page),
    ).toEqual([3, 4]);
    expect(
      fileTextSourceRange(result, {
        sourceDigest: result.bodySha256,
        start: result.pages[0]!.end,
        end: result.pages[1]!.start,
        quote: '\n\n',
      }),
    ).toBeNull();
    expect(() =>
      fileTextSourceRange(result, {
        sourceDigest: result.bodySha256,
        start: 2,
        end: 3,
        quote: result.body.slice(2, 3),
      }),
    ).toThrow();
    expect(() =>
      fileTextSourceRange(result, { sourceDigest: 'b'.repeat(64), start: 0, end: 1, quote: '町' }),
    ).toThrow();
  });
  it('supports blank machine pages for manual review without inventing regions', () => {
    const raw = { ...observation(), pages: [page(5, '')] };
    const result = reviewFileText(raw, [{ page: 5, text: '自分で読んだ文章。' }]);
    expect(result.pages[0]!.changed).toBe(true);
    expect(result.pages[0]!.regions).toEqual([]);
  });
  it('accepts oriented Vision observations but rejects mismatched providers, spaces and missing confidence', () => {
    const vision = {
      version: 1,
      file: { ...file, name: '画像.png', mimeType: 'image/png', kind: 'image', pageCount: 1 },
      pages: [
        {
          ...page(1),
          provider: 'apple-vision',
          revision: 3,
          coordinateSpace: 'normalized-top-left-oriented-page',
          regions: page(1).regions.map((r) => ({ ...r, confidence: 0.73 })),
        },
      ],
    };
    expect(parseFileTextObservation(vision).pages[0]!.regions[0]!.confidence).toBe(0.73);
    const edits: ((d: typeof vision) => void)[] = [
      (d) => {
        d.pages[0]!.provider = 'publisher-approved';
      },
      (d) => {
        d.pages[0]!.coordinateSpace = 'pixels';
      },
      (d) => {
        d.pages[0]!.regions[0]!.confidence = 1.01;
      },
      (d) => {
        d.pages[0]!.rotation = 90;
      },
    ];
    for (const edit of edits) {
      const changed = clone(vision);
      edit(changed);
      expect(() => parseFileTextObservation(changed)).toThrow();
    }
    expect(() =>
      parseFileTextObservation({
        ...vision,
        pages: [{ ...vision.pages[0], regions: page(1).regions }],
      }),
    ).toThrow();
  });
  it('rejects unbounded, unordered or inexact native mappings', () => {
    const edits: ((d: ReturnType<typeof observation>) => void)[] = [
      (d) => {
        d.pages[1]!.page = 6;
      },
      (d) => {
        d.pages[0]!.regions[0]!.end++;
      },
      (d) => {
        d.pages[0]!.regions[0]!.bounds.width = 1;
      },
      (d) => {
        d.pages[0]!.text = 'x'.repeat(FILE_SOURCE_LIMITS.body + 1);
      },
      (d) => {
        d.pages[0]!.regions.push(clone(d.pages[0]!.regions[0]!));
      },
      (d) => {
        d.pages[0]!.width = Infinity;
      },
    ];
    for (const edit of edits) {
      const changed = observation();
      edit(changed);
      expect(() => parseFileTextObservation(changed)).toThrow();
    }
  });
  it('rejects portable body/page/region changes without a recomputed review mapping', () => {
    const good = review();
    const changes = [
      { ...good, body: good.body + 'x' },
      { ...good, bodySha256: 'b'.repeat(64) },
      { ...good, pages: good.pages.map((p, i) => (i ? { ...p, changed: false } : p)) },
      { ...good, reviewedPages: [{ page: 4, text: original }, good.reviewedPages[1]] },
      { ...good, pages: good.pages.map((p, i) => (i ? p : { ...p, regions: [] })) },
    ];
    for (const changed of changes) expect(() => parseReviewedFileText(changed)).toThrow();
  });
  it('file references never contain paths or imply access; byte identity may survive a rename', () => {
    expect(
      sameFileBytes(parseFileReference(file), parseFileReference({ ...file, name: 'renamed.pdf' })),
    ).toBe(true);
    expect(
      sameFileBytes(
        parseFileReference(file),
        parseFileReference({ ...file, sha256: 'b'.repeat(64) }),
      ),
    ).toBe(false);
    for (const changed of [
      { ...file, path: '/private/file.pdf' },
      { ...file, name: '../a.pdf' },
      { ...file, bytes: MAX_SAFE_INTEGER },
      { ...file, mimeType: 'text/html' },
      { ...file, pageCount: -0 },
      { ...file, name: '.' },
    ])
      expect(() => parseFileReference(changed)).toThrow();
  });
  it('never executes accessors, coercion functions or array getters', () => {
    let calls = 0;
    const getter = {
      ...file,
      get name() {
        calls++;
        return 'secret';
      },
    };
    const mime = {
      ...file,
      kind: 'image',
      pageCount: 1,
      mimeType: {
        toString() {
          calls++;
          return 'image/png';
        },
      },
    };
    const array = [page(3)];
    Object.defineProperty(array, '0', {
      enumerable: true,
      get() {
        calls++;
        return page(3);
      },
    });
    for (const run of [
      () => parseFileReference(getter),
      () => parseFileReference(mime),
      () => parseFileTextObservation({ ...observation(), pages: array }),
    ])
      expect(run).toThrow();
    expect(calls).toBe(0);
  });
});
const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
