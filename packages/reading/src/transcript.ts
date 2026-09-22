import { sha256Hex } from '@bunki/ai/hash';
import { immutable, isWellFormedText, ReadingValidationError, type DeepReadonly } from './common.ts';

/** A local timed-text adapter. Supplied provenance is not a copyright or
 * processing grant. No URL, credentials, transport or learner commands enter it. */
export const TRANSCRIPT_LIMITS = Object.freeze({ characters: 240_000, body: 120_000, cues: 3000, milliseconds: 604_800_000 });
export type SuppliedTranscriptInput = Readonly<{
  origin: 'file' | 'paste'; format: 'webvtt' | 'srt'; name: string; text: string;
}>;
export type TranscriptCue = Readonly<{ id: string | null; startMs: number; endMs: number; start: number; end: number }>;
type TranscriptData = {
  version: 1; provider: 'user-supplied-timed-text/v1'; input: SuppliedTranscriptInput;
  rawSha256: string; body: string; bodySha256: string; cues: TranscriptCue[]; ignoredBlocks: number;
};
declare const verifiedTranscript: unique symbol;
/** Only the parser promotes file data to a verified body/time mapping. */
export type TimedTranscript = DeepReadonly<TranscriptData> & { readonly [verifiedTranscript]: true };
export type TranscriptProviderResult =
  | Readonly<{ status: 'available'; document: TimedTranscript }>
  | Readonly<{ status: 'pointer-only'; reason: 'not-supplied' }>;
export interface TranscriptProvider {
  readonly id: 'user-supplied-timed-text/v1';
  read(input: SuppliedTranscriptInput | null): TranscriptProviderResult;
}
const owned = new WeakSet<object>();
const reject = (path: string): never => { throw new ReadingValidationError('invalid-input', [`transcript.${path}`]); };
function record<const K extends readonly string[]>(value: unknown, keys: K): Record<K[number], unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length) return reject('fields');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.keys(descriptors).length !== keys.length || !keys.every((key) =>
    Object.hasOwn(descriptors, key) && 'value' in descriptors[key]! && descriptors[key]!.enumerable)) return reject('fields');
  return value as Record<K[number], unknown>;
}
function prose(value: unknown, maximum: number): string {
  // eslint-disable-next-line no-control-regex -- Preserve tabs and all source line endings.
  if (typeof value !== 'string' || value.length > maximum || !isWellFormedText(value) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(value)) return reject('text');
  return value;
}
function inputOf(raw: unknown): SuppliedTranscriptInput {
  const input = record(raw, ['origin', 'format', 'name', 'text']);
  if (typeof input.origin !== 'string' || typeof input.format !== 'string' ||
      !['file', 'paste'].includes(input.origin) || !['webvtt', 'srt'].includes(input.format)) return reject('format');
  const name = prose(input.name, 255), text = prose(input.text, TRANSCRIPT_LIMITS.characters);
  if (!name.trim() || /[/\\]/u.test(name) || !text.trim()) return reject('empty');
  return { origin: input.origin as SuppliedTranscriptInput['origin'], format: input.format as SuppliedTranscriptInput['format'], name, text };
}
function timestamp(value: string, format: SuppliedTranscriptInput['format']): number {
  const match = (format === 'srt' ? /^(\d{2,6}):([0-5]\d):([0-5]\d),(\d{3})$/u
    : /^(?:(\d{2,6}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/u).exec(value);
  if (!match) return reject('time');
  const milliseconds = ((Number(match[1] || 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
  if (milliseconds > TRANSCRIPT_LIMITS.milliseconds) return reject('time');
  return milliseconds;
}
/** A strict, bounded text-reading subset, not a browser caption renderer.
 * Retain source bytes (as valid UTF-8 text), cue text/markup and order. Only
 * reader line endings become LF; settings/styles remain in the original file. */
export function importSuppliedTranscript(raw: unknown): TimedTranscript {
  const input = inputOf(raw);
  const normalized = input.text.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n');
  const blocks = normalized.split(/\n[\t ]*\n/gu).filter((block) => block.trim());
  if (input.format === 'webvtt') {
    const header = blocks.shift();
    // Reject HLS X-TIMESTAMP-MAP and unknown header metadata instead of losing offsets.
    if (!header || !/^WEBVTT(?:[\t ][^\n]*)?$/u.test(header) || header.includes('-->')) return reject('header');
  }
  const cues: TranscriptCue[] = []; let body = '', ignoredBlocks = 0;
  for (const block of blocks) {
    const lines = block.replace(/\n$/u, '').split('\n');
    if (input.format === 'webvtt' && (/^NOTE(?:[\t ]|$)/u.test(lines[0]!) || ['STYLE', 'REGION'].includes(lines[0]!))) {
      if (lines[0] !== 'NOTE' && !lines[0]!.startsWith('NOTE ') && !lines[0]!.startsWith('NOTE\t') && cues.length) return reject('late-style');
      ignoredBlocks++; continue;
    }
    let id: string | null = null;
    if (!lines[0]?.includes('-->')) id = lines.shift() ?? null;
    if (input.format === 'srt' && (!id || !/^[1-9]\d{0,8}$/u.test(id))) return reject('cue-number');
    const timing = lines.shift()?.match(/^(\S+)[\t ]+-->[\t ]+(\S+)(?:[\t ]+(.*))?$/u);
    if (!timing || (input.format === 'srt' && timing[3])) return reject('cue-timing');
    const startMs = timestamp(timing[1]!, input.format), endMs = timestamp(timing[2]!, input.format);
    const payload = lines.join('\n');
    if (endMs <= startMs || (cues.length && startMs < cues[cues.length - 1]!.startMs) || !payload.trim() || payload.includes('-->')) return reject('cue');
    if (cues.length) body += '\n\n';
    const start = body.length; body += payload;
    cues.push({ id, startMs, endMs, start, end: body.length });
    if (cues.length > TRANSCRIPT_LIMITS.cues || body.length > TRANSCRIPT_LIMITS.body) return reject('capacity');
  }
  if (!cues.length) return reject('no-cues');
  const result = immutable({ version: 1, provider: 'user-supplied-timed-text/v1', input,
    rawSha256: sha256Hex(input.text), body, bodySha256: sha256Hex(body), cues, ignoredBlocks }) as TimedTranscript;
  owned.add(result); return result;
}
export const userSuppliedTranscriptProvider: TranscriptProvider = Object.freeze({
  id: 'user-supplied-timed-text/v1',
  read: (input: SuppliedTranscriptInput | null): TranscriptProviderResult => input === null
    ? Object.freeze({ status: 'pointer-only', reason: 'not-supplied' })
    : Object.freeze({ status: 'available', document: importSuppliedTranscript(input) }),
});
/** Portable mappings are data: recompute from the original, never trust a
 * supplied digest, cue time, offset, provider claim or even a matching hash. */
export function parseTimedTranscript(raw: unknown): TimedTranscript {
  if (raw && typeof raw === 'object' && owned.has(raw)) return raw as TimedTranscript;
  const data = record(raw, ['version', 'provider', 'input', 'rawSha256', 'body', 'bodySha256', 'cues', 'ignoredBlocks']);
  const expected = importSuppliedTranscript(data.input);
  for (const key of ['version', 'provider', 'rawSha256', 'body', 'bodySha256', 'ignoredBlocks'] as const)
    if (data[key] !== expected[key]) return reject('mapping-mismatch');
  if (!Array.isArray(data.cues) || data.cues.length !== expected.cues.length || Object.getOwnPropertySymbols(data.cues).length ||
      Object.keys(Object.getOwnPropertyDescriptors(data.cues)).length !== data.cues.length + 1) return reject('cues');
  for (let i = 0; i < expected.cues.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(data.cues, String(i));
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return reject('cues');
    const cue = record(descriptor.value, ['id', 'startMs', 'endMs', 'start', 'end']);
    for (const key of ['id', 'startMs', 'endMs', 'start', 'end'] as const)
      if (cue[key] !== expected.cues[i]![key] || Object.is(cue[key], -0)) return reject('mapping-mismatch');
  }
  return expected;
}
export function transcriptTimeRange(document: TimedTranscript, selection: {
  sourceDigest: string; start: number; end: number; quote: string;
}): Readonly<{ startMs: number; endMs: number; cueIndexes: readonly number[] }> | null {
  const parsed = parseTimedTranscript(document), { start, end, quote, sourceDigest } = selection;
  if (sourceDigest !== parsed.bodySha256 || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
      Object.is(start, -0) || Object.is(end, -0) || start < 0 || end <= start || end > parsed.body.length ||
      parsed.body.slice(start, end) !== quote || !isWellFormedText(quote)) return reject('selection');
  const cueIndexes = parsed.cues.flatMap((cue, index) => cue.start < end && cue.end > start ? [index] : []);
  if (!cueIndexes.length) return null;
  return immutable({ startMs: Math.min(...cueIndexes.map((index) => parsed.cues[index]!.startMs)),
    endMs: Math.max(...cueIndexes.map((index) => parsed.cues[index]!.endMs)), cueIndexes });
}
