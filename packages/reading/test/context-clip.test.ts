import { describe, expect, it } from 'vitest';
import {
  importSuppliedTranscript,
  selectContextClip,
  type TimedTranscript,
} from '../src/index.ts';

function transcript(rows: readonly (readonly [number, number, string])[]): TimedTranscript {
  const clock = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
  };
  return importSuppliedTranscript({
    origin: 'paste', format: 'webvtt', name: 'capture.vtt',
    text: `WEBVTT\n\n${rows.map(([start, end, text]) => `${clock(start)} --> ${clock(end)}\n${text}`).join('\n\n')}`,
  });
}
const doc = transcript([
  [1000, 5000, '昨日、駅で'],
  [5000, 9000, '友達に会った。'],
  [9000, 15000, '一緒に本を買った。'],
  [15000, 21000, 'それから茶を飲んだ。'],
  [21000, 27000, '明日も勉強する。'],
  [27000, 33000, 'ゆっくり話した。'],
  [33000, 39000, 'そして帰った。'],
]);
function options(document = doc, word = '本', presetSeconds: 7 | 15 | 30 | 40 = 15) {
  const start = document.body.indexOf(word);
  return {
    presetSeconds,
    availableStartMs: 0,
    availableEndMs: 40000,
    target: { sourceDigest: document.bodySha256, start, end: start + word.length, quote: word },
  };
}

describe('context clip planning, not media capture or review enrollment', () => {
  it.each([
    [7, 9000, 15000, [2]],
    [15, 1000, 15000, [0, 1, 2]],
    [30, 1000, 27000, [0, 1, 2, 3, 4]],
    [40, 1000, 39000, [0, 1, 2, 3, 4, 5, 6]],
  ] as const)('retains the selected target and whole cue-group sentences under %is', (preset, startMs, endMs, cueIndexes) => {
    const plan = selectContextClip(doc, options(doc, '本', preset));
    expect(plan.status).toBe('ready');
    if (plan.status !== 'ready') throw new Error('expected ready');
    expect(plan).toMatchObject({ startMs, endMs, presetSeconds: preset, sourceDigest: doc.bodySha256 });
    expect(plan.cueIndexes).toEqual(cueIndexes);
    expect(plan.quote).toBe(doc.body.slice(doc.cues[cueIndexes[0]]!.start, doc.cues[cueIndexes[cueIndexes.length - 1]]!.end));
    expect(plan.quote).toContain('本');
    expect(plan.endMs - plan.startMs).toBeLessThanOrEqual(preset * 1000);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.cueIndexes)).toBe(true);
    expect(plan).not.toHaveProperty('audioUri');
    expect(plan).not.toHaveProperty('grade');
  });
  it('does not mistake the target subtitle line for a complete sentence', () => {
    const plan = selectContextClip(doc, options(doc, '駅'));
    expect(plan).toMatchObject({ status: 'ready', startMs: 1000, endMs: 15000, cueIndexes: [0, 1, 2] });
  });
  it('preserves a target spanning two cue-group sentences instead of dropping one', () => {
    const start = doc.body.indexOf('会った'), end = doc.body.indexOf('本') + 1;
    const plan = selectContextClip(doc, { ...options(), target: {
      sourceDigest: doc.bodySha256, start, end, quote: doc.body.slice(start, end),
    } });
    expect(plan).toMatchObject({ status: 'ready', startMs: 1000, endMs: 15000 });
  });
  it('waits rather than cutting the target sentence at the current buffer edge', () => {
    const plan = selectContextClip(doc, { ...options(), availableEndMs: 13000 });
    expect(plan).toEqual({ status: 'pending', reason: 'awaiting-media' });
  });
  it('reports an evicted beginning instead of clamping into a sentence', () => {
    const plan = selectContextClip(doc, { ...options(doc, '駅'), availableStartMs: 4000 });
    expect(plan).toEqual({ status: 'unresolved', reason: 'media-unavailable' });
  });
  it('does not expand into context that has already been evicted', () => {
    const plan = selectContextClip(doc, { ...options(), availableStartMs: 9000 });
    expect(plan).toMatchObject({ status: 'ready', startMs: 9000, endMs: 21000, cueIndexes: [2, 3] });
  });
  it('does not trim an overlong anchor sentence to make a preset appear satisfied', () => {
    const long = transcript([[0, 41000, 'これは長い文。']]);
    const plan = selectContextClip(long, { ...options(long, '長い', 40), availableEndMs: 50000 });
    expect(plan).toEqual({ status: 'unresolved', reason: 'sentence-too-long' });
  });
  it('labels an unfinished transcript tail without fabricating a sentence ending', () => {
    const unfinished = transcript([[0, 2000, 'これは'], [2000, 4000, 'まだ続く']]);
    expect(selectContextClip(unfinished, options(unfinished, '続く')))
      .toEqual({ status: 'unresolved', reason: 'sentence-incomplete' });
  });
  it('requires a target proposal rather than guessing an unknown word or silently using the last cue', () => {
    expect(selectContextClip(doc, { ...options(), target: null }))
      .toEqual({ status: 'unresolved', reason: 'target-not-selected' });
    const end = doc.cues[0]!.end;
    expect(selectContextClip(doc, { ...options(), target: {
      sourceDigest: doc.bodySha256, start: end, end: end + 2, quote: '\n\n',
    } })).toEqual({ status: 'unresolved', reason: 'target-not-timed' });
  });
  it('does not join separate scenes to fill a preset', () => {
    const scenes = transcript([[0, 2000, '前の場面。'], [10000, 14000, '対象の本。'], [14000, 18000, '続く文。']]);
    expect(selectContextClip(scenes, options(scenes)))
      .toMatchObject({ status: 'ready', startMs: 10000, endMs: 18000, cueIndexes: [1, 2] });
  });
  it('retains millisecond clocks and includes complete overlapping cues', () => {
    const overlaps = transcript([[1250, 6500, '対象の本。'], [6000, 9250, '別の文。']]);
    expect(selectContextClip(overlaps, options(overlaps)))
      .toMatchObject({ status: 'ready', startMs: 1250, endMs: 9250, cueIndexes: [0, 1] });
  });
  it.each(['「本だ！」', '本です？', '<v Speaker>本です。</v>', '本です。\n'])('recognizes terminal punctuation with closers/markup while preserving exact text: %s', (text) => {
    const closed = transcript([[0, 3000, text]]);
    expect(selectContextClip(closed, options(closed)))
      .toMatchObject({ status: 'ready', startMs: 0, endMs: 3000, quote: closed.body });
  });
  it('does not mutate the supplied transcript or caller options', () => {
    const request = options(), before = JSON.stringify({ doc, request });
    selectContextClip(doc, request);
    expect(JSON.stringify({ doc, request })).toBe(before);
  });
  it('revalidates portable transcript mappings and rejects stale/forged target mappings', () => {
    const bad = JSON.parse(JSON.stringify(doc)) as TimedTranscript;
    (bad.cues[0] as unknown as { startMs: number }).startMs++;
    expect(() => selectContextClip(bad, options())).toThrow();
    for (const change of [{ sourceDigest: '0'.repeat(64) }, { quote: '偽物' }, { start: -1 }, { end: 1.5 }]) {
      expect(() => selectContextClip(doc, { ...options(), target: { ...options().target, ...change } })).toThrow();
    }
  });
  it.each([
    { presetSeconds: 16 }, { presetSeconds: '15' },
    { availableStartMs: -1 }, { availableStartMs: -0 },
    { availableStartMs: 0.5 }, { availableEndMs: Number.NaN },
    { availableEndMs: Number.POSITIVE_INFINITY }, { availableEndMs: 0 },
    { availableEndMs: -1 }, { availableStartMs: 50000 },
  ])('rejects invalid clocks/presets instead of coercing: %j', (change) => {
    expect(() => selectContextClip(doc, { ...options(), ...change } as unknown as Parameters<typeof selectContextClip>[1])).toThrow();
  });
});
