import { describe, expect, it } from 'vitest';
import { sha256Hex } from '@bunki/ai/hash';
import {
  importSuppliedTranscript,
  parseTimedTranscript,
  transcriptTimeRange,
  userSuppliedTranscriptProvider,
  TRANSCRIPT_LIMITS,
  type SuppliedTranscriptInput,
} from '../src/index.ts';

const raw =
  '\uFEFFWEBVTT\r\n\r\nNOTE supplied example\r\nretained in the original\r\n\r\none\r\n00:12.250 --> 00:19.500 align:start\r\n  町の図書館。e\u0301 🚀  \r\n二行目。\r\n\r\ntwo\r\n00:18.000 --> 00:22.125\r\n<v Speaker>重なる字幕。</v>\r\n';
const input: SuppliedTranscriptInput = {
  origin: 'file',
  format: 'webvtt',
  name: '学び.vtt',
  text: raw,
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe('supplied transcript provider and verified time mappings', () => {
  it('retains the exact UTF-8 text including BOM, CRLF, combining marks, settings, comments and literal markup', () => {
    const doc = importSuppliedTranscript(input);
    expect(doc.input.text).toBe(raw);
    expect(doc.rawSha256).toBe(sha256Hex(raw));
    expect(doc.body).toBe('  町の図書館。e\u0301 🚀  \n二行目。\n\n<v Speaker>重なる字幕。</v>');
    expect(doc.cues.map((cue) => [cue.startMs, cue.endMs])).toEqual([
      [12250, 19500],
      [18000, 22125],
    ]);
    expect(doc.ignoredBlocks).toBe(1);
    expect(doc.bodySha256).toBe(sha256Hex(doc.body));
    expect(parseTimedTranscript(clone(doc))).toEqual(doc);
    expect(Object.isFrozen(doc.cues[0])).toBe(true);
  });
  it('uses millisecond SubRip clocks and preserves multiline text as a single body', () => {
    const doc = importSuppliedTranscript({
      ...input,
      format: 'srt',
      text: '1\n01:02:03,004 --> 01:02:05,999\n日本語。\n二行。\n\n2\n01:03:00,000 --> 01:03:01,000\n続き。\n',
    });
    expect(doc.cues[0]?.startMs).toBe(3723004);
    expect(doc.cues[0]?.endMs).toBe(3725999);
    expect(doc.body).toBe('日本語。\n二行。\n\n続き。');
  });
  it('keeps unavailable sources pointer-only and grants no operation through provider data', () => {
    expect(userSuppliedTranscriptProvider.read(null)).toEqual({
      status: 'pointer-only',
      reason: 'not-supplied',
    });
    const result = userSuppliedTranscriptProvider.read(input);
    expect(result.status).toBe('available');
    expect(result).not.toHaveProperty('capabilities');
    expect(result).not.toHaveProperty('approved');
    expect(() => importSuppliedTranscript({ ...input, license: 'allowed' })).toThrow();
  });
  it('resolves exact UTF-16 selections across overlapping cues, and no timestamp for separator-only text', () => {
    const doc = importSuppliedTranscript(input),
      cue = doc.cues[0]!;
    const selection = {
      sourceDigest: doc.bodySha256,
      start: cue.start,
      end: cue.end,
      quote: doc.body.slice(cue.start, cue.end),
    };
    expect(transcriptTimeRange(doc, selection)).toEqual({
      startMs: 12250,
      endMs: 19500,
      cueIndexes: [0],
    });
    expect(
      transcriptTimeRange(doc, { ...selection, end: doc.body.length, quote: doc.body }),
    ).toEqual({ startMs: 12250, endMs: 22125, cueIndexes: [0, 1] });
    expect(
      transcriptTimeRange(doc, { ...selection, start: cue.end, end: cue.end + 2, quote: '\n\n' }),
    ).toBeNull();
    for (const change of [
      { sourceDigest: '0'.repeat(64) },
      { quote: 'wrong' },
      { start: -0 },
      { end: 1.5 },
    ])
      expect(() => transcriptTimeRange(doc, { ...selection, ...change })).toThrow();
    const rocket = doc.body.indexOf('🚀');
    expect(() =>
      transcriptTimeRange(doc, {
        ...selection,
        start: rocket,
        end: rocket + 1,
        quote: doc.body.slice(rocket, rocket + 1),
      }),
    ).toThrow();
  });
  it.each([
    'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00.000,MPEGTS:900000\n\n00:01.000 --> 00:02.000\ntext',
    'WEBVTT\n\n00:01.000 --> 00:01.000\ntext',
    'WEBVTT\n\n00:02.000 --> 00:01.000\ntext',
    'WEBVTT\n\n00:61.000 --> 00:62.000\ntext',
    'WEBVTT\n\n00:02.000 --> 00:03.000\ntext\n\n00:01.000 --> 00:02.000\nolder',
    'WEBVTT\n\nNOTE only a comment',
    'WEBVTT\n\n00:01.000 --> 00:02.000\n',
    'WEBVTT\n\n00:01.000 --> 00:02.000\ntext\n\nnot a cue',
    'WEBVTT\n\n169:00:00.000 --> 170:00:00.000\ntext',
  ])('rejects unsupported/malformed timing without skipping an unparsed cue: %s', (text) => {
    expect(() => importSuppliedTranscript({ ...input, text })).toThrow();
  });
  it('rejects all forged portable mappings, including matching body hashes and changed times', () => {
    const doc = importSuppliedTranscript(input);
    const variants = [
      { ...doc, provider: 'publisher-approved' },
      { ...doc, rawSha256: '0'.repeat(64) },
      { ...doc, body: '別の文章', bodySha256: sha256Hex('別の文章') },
      { ...doc, ignoredBlocks: 0 },
      { ...doc, cues: doc.cues.map((cue) => ({ ...cue, startMs: cue.startMs + 1 })) },
      { ...doc, cues: doc.cues.map((cue) => ({ ...cue, start: cue.start + 1 })) },
      { ...doc, input: { ...input, text: raw.replace('12.250', '12.251') } },
    ];
    for (const value of variants) expect(() => parseTimedTranscript(value)).toThrow();
  });
  it('does not evaluate accessors, custom coercion, sparse cue arrays or extra portable fields', () => {
    let touched = false;
    expect(() =>
      importSuppliedTranscript({
        ...input,
        get text() {
          touched = true;
          return raw;
        },
      }),
    ).toThrow();
    expect(() =>
      importSuppliedTranscript({
        ...input,
        origin: {
          toString() {
            touched = true;
            return 'file';
          },
        },
      }),
    ).toThrow();
    const doc = importSuppliedTranscript(input),
      cues = [...doc.cues];
    Object.defineProperty(cues, '0', {
      enumerable: true,
      get() {
        touched = true;
        return doc.cues[0];
      },
    });
    expect(() => parseTimedTranscript({ ...doc, cues })).toThrow();
    expect(touched).toBe(false);
    expect(() => parseTimedTranscript({ ...doc, cues: new Array(doc.cues.length) })).toThrow();
    expect(() => parseTimedTranscript({ ...doc, approved: true })).toThrow();
  });
  it('bounds input/body/cue count and rejects broken Unicode and control bytes', () => {
    for (const text of [
      raw + '\ud800',
      raw + '\u0000',
      'x'.repeat(TRANSCRIPT_LIMITS.characters + 1),
      `WEBVTT\n\n00:01.000 --> 00:02.000\n${'x'.repeat(TRANSCRIPT_LIMITS.body + 1)}`,
      `WEBVTT\n\n${Array.from({ length: TRANSCRIPT_LIMITS.cues + 1 }, () => '00:01.000 --> 00:02.000\nx').join('\n\n')}`,
    ])
      expect(() => importSuppliedTranscript({ ...input, text })).toThrow();
  });
});
