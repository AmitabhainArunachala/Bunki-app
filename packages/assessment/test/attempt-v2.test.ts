import { describe, expect, it } from 'vitest';
import { sha256Hex } from '@bunki/ai/hash';
import { artifactReference, createMediaVersion } from '../src/content.ts';
import {
  beginAttemptV2,
  parseAttemptV2,
  scoreAttemptV2,
  updateAttemptV2,
  type AssessmentActionV2,
  type AssessmentAttemptV2,
} from '../src/attempt-v2.ts';
import { form, item, provenance, rights } from './fixtures.ts';

const NOW = Date.parse('2026-09-23T00:00:00Z');
const scope = { accountId: 'account:test', learnerId: 'learner:test' };
const initial = {
  attemptId: 'attempt:test',
  scope,
  mode: 'timed',
  priorExposure: 'unknown',
  editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] },
  now: NOW,
  monotonicMs: 0,
  clockSessionId: 'session:one',
};
const paper = form([item('one'), item('two'), item('three')]);
function update(
  attempt: AssessmentAttemptV2,
  action: AssessmentActionV2,
  elapsed = 0,
  options = {},
  selectedForm = paper,
) {
  return updateAttemptV2(selectedForm, attempt, {
    expectedRevisionId: attempt.revisionId,
    now: NOW + elapsed,
    monotonicMs: elapsed,
    clockSessionId: 'session:one',
    action,
    ...options,
  });
}

describe('v2 timed delivery', () => {
  it('pins the whole chosen form and preserves exposure, flags and changed answers', () => {
    let attempt = beginAttemptV2(paper, initial);
    expect(attempt.answers).toHaveLength(3);
    attempt = update(
      attempt,
      { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } },
      100,
    );
    attempt = update(attempt, { kind: 'flag', itemId: 'one', flagged: true }, 150);
    attempt = update(attempt, { kind: 'visit', itemId: 'two' }, 200);
    attempt = update(attempt, { kind: 'visit', itemId: 'one' }, 250);
    attempt = update(
      attempt,
      { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'a' } },
      300,
    );
    attempt = update(attempt, { kind: 'submit' }, 1000);
    const result = scoreAttemptV2(paper, attempt);
    expect(result).toMatchObject({
      correct: 1,
      incorrect: 0,
      unanswered: 1,
      notReached: 1,
      officialScore: null,
      passPrediction: null,
      weaknessItemIds: [],
    });
    expect(attempt.answers[0]).toMatchObject({ flagged: true, elapsedMs: 950 });
    expect(result.items.map((entry) => entry.result)).toEqual([
      'correct',
      'unanswered',
      'not-reached',
    ]);
  });

  it('commits a deadline closure even when the triggering action is a late answer', () => {
    const original = beginAttemptV2(paper, initial);
    const expired = update(
      original,
      { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'a' } },
      60_000,
    );
    expect(expired.status).toBe('submitted');
    expect(expired.answers[0]!.response.kind).toBe('unanswered');
    expect(expired.blocks[0]).toMatchObject({ elapsedMs: 60_000, closeReason: 'deadline' });
    const retry = update(expired, { kind: 'tick' }, 61_000);
    expect(retry).toEqual(expired);
    expect(retry.events.filter((event) => event.kind === 'block-closed')).toHaveLength(1);
    expect(() =>
      updateAttemptV2(paper, expired, {
        ...initial,
        expectedRevisionId: original.revisionId,
        action: { kind: 'tick' },
      }),
    ).toThrow();
  });

  it('rejects a stale checkpoint without overwriting a newer response', () => {
    const original = beginAttemptV2(paper, initial);
    const changed = update(original, { kind: 'flag', itemId: 'one', flagged: true });
    expect(() =>
      update(changed, { kind: 'visit', itemId: 'two' }, 0, {
        expectedRevisionId: original.revisionId,
      }),
    ).toThrow(/stale-checkpoint/u);
  });

  it('supports an untimed administrative break then starts a fresh continuous block', () => {
    const twoBlocks = form([item('one'), item('reading', { skill: 'reading' })]);
    let attempt = beginAttemptV2(twoBlocks, initial);
    attempt = update(attempt, { kind: 'tick' }, 60_000, {}, twoBlocks);
    expect(attempt).toMatchObject({
      status: 'in-progress',
      cursor: { blockId: null, itemId: null },
    });
    expect(attempt.blocks[1]!.status).toBe('pending');
    attempt = update(attempt, { kind: 'tick' }, 180_000, {}, twoBlocks);
    expect(attempt.blocks[1]!.elapsedMs).toBe(0);
    attempt = update(attempt, { kind: 'start-next-block' }, 180_000, {}, twoBlocks);
    expect(attempt.blocks[1]).toMatchObject({ status: 'open', deadlineAt: NOW + 240_000 });
    expect(() =>
      update(attempt, { kind: 'visit', itemId: 'one' }, 180_001, {}, twoBlocks),
    ).toThrow();
    attempt = update(attempt, { kind: 'tick' }, 240_000, {}, twoBlocks);
    expect(attempt.status).toBe('submitted');
    expect(attempt.events.filter((entry) => entry.kind === 'block-closed')).toHaveLength(2);
  });

  it('keeps the timer running across save/reload, background and resume', () => {
    let attempt = beginAttemptV2(paper, initial);
    attempt = update(attempt, { kind: 'interruption', reason: 'background' }, 10_000);
    const restored = parseAttemptV2(paper, JSON.parse(JSON.stringify(attempt)));
    attempt = update(restored, { kind: 'resume' }, 70_000, {
      clockSessionId: 'session:reloaded',
      monotonicMs: 0,
    });
    expect(attempt.status).toBe('submitted');
    expect(attempt.conditions).toContain('interrupted');
    expect(attempt.answers[0]!.elapsedMs).toBe(10_000);
    expect(attempt.blocks[0]!.elapsedMs).toBe(60_000);
  });

  it('expires the next timed block after a break saturates the retained aggregate clock', () => {
    const twoBlocks = form([item('one'), item('reading', { skill: 'reading' })]);
    const afterBreak = 8 * 24 * 60 * 60 * 1000;
    let attempt = beginAttemptV2(twoBlocks, initial);
    attempt = update(
      attempt,
      { kind: 'close-block', blockId: 'block:grammar' },
      1000,
      {},
      twoBlocks,
    );
    attempt = update(attempt, { kind: 'tick' }, afterBreak, {}, twoBlocks);
    expect(attempt.blocks[1]).toMatchObject({ status: 'pending', elapsedMs: 0 });
    attempt = update(attempt, { kind: 'start-next-block' }, afterBreak, {}, twoBlocks);
    expect(attempt.blocks[1]).toMatchObject({
      status: 'open',
      elapsedMs: 0,
      deadlineAt: NOW + afterBreak + 60_000,
    });
    expect(attempt.clock.elapsedMs).toBe(7 * 24 * 60 * 60 * 1000);
    attempt = update(attempt, { kind: 'tick' }, afterBreak + 30_000, {}, twoBlocks);
    expect(attempt.blocks[1]!.elapsedMs).toBe(30_000);
    attempt = update(
      attempt,
      { kind: 'answer', itemId: 'reading', response: { kind: 'selected', optionId: 'a' } },
      afterBreak + 60_000,
      {},
      twoBlocks,
    );
    expect(attempt.status).toBe('submitted');
    expect(attempt.blocks[1]).toMatchObject({ elapsedMs: 60_000, closeReason: 'deadline' });
    expect(attempt.answers[1]!.response.kind).toBe('unanswered');
    expect(attempt.clock.elapsedMs).toBe(7 * 24 * 60 * 60 * 1000);
    expect(attempt.events.filter((entry) => entry.kind === 'block-closed')).toHaveLength(2);
    expect(update(attempt, { kind: 'tick' }, afterBreak + 120_000, {}, twoBlocks)).toEqual(attempt);
  });

  it('cannot extend a deadline by moving the wall clock backwards', () => {
    let attempt = beginAttemptV2(paper, initial);
    attempt = update(attempt, { kind: 'tick' }, 30_000);
    attempt = update(attempt, { kind: 'tick' }, 10_000, { monotonicMs: 61_000 });
    expect(attempt.status).toBe('submitted');
    expect(attempt.conditions).toContain('clock-discontinuity');
  });

  it('allows practice to finish with blanks and never mistakes abandoning for weak concepts', () => {
    let attempt = beginAttemptV2(paper, { ...initial, mode: 'practice' });
    attempt = update(
      attempt,
      { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } },
      100_000,
    );
    expect(attempt.status).toBe('in-progress');
    attempt = update(attempt, { kind: 'abandon' }, 100_001);
    const result = scoreAttemptV2(paper, attempt);
    expect(result).toMatchObject({
      status: 'abandoned',
      completed: false,
      incorrect: 1,
      notReached: 2,
      weaknessItemIds: [],
    });
  });

  it('rejects mismatched form revisions and answer edits after closure', () => {
    const attempt = beginAttemptV2(paper, initial);
    const other = form([item('one', { prompt: '別の質問です。' }), item('two'), item('three')]);
    expect(() => parseAttemptV2(other, attempt)).toThrow(/reference-mismatch/u);
    const submitted = update(attempt, { kind: 'submit' }, 10);
    expect(
      update(
        submitted,
        { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'a' } },
        20,
      ),
    ).toEqual(submitted);
  });

  it('does not permit test-mode hints or a forged editorial label', () => {
    const attempt = beginAttemptV2(paper, initial);
    expect(() => update(attempt, { kind: 'assistance', reason: 'hint' })).toThrow();
    expect(() =>
      beginAttemptV2(paper, {
        ...initial,
        editorialAtStart: {
          status: 'ai-reviewed-full',
          policyVersion: null,
          decisionRevisionIds: [],
        },
      }),
    ).toThrow();
  });
});

describe('shared listening stimulus', () => {
  const audio = createMediaVersion({
    format: 'kairo-assessment-media',
    v: 1,
    id: 'audio:shared',
    provenance,
    rights,
    kind: 'audio',
    assetId: 'fixture-audio',
    bytesSha256: sha256Hex('fixture'),
    mimeType: 'audio/mp4',
    durationMs: 5000,
    transcript: '音声の確認。',
    transcriptSha256: sha256Hex('音声の確認。'),
    speakers: ['speaker:one'],
  });
  const listening = form(
    [
      item('a', { skill: 'listening', media: [artifactReference(audio)] }),
      item('b', { skill: 'listening', media: [artifactReference(audio)] }),
    ],
    { media: [audio] },
  );
  it('records audio ending exactly at its block deadline before closing the block', () => {
    const exact = form(listening.items, {
      media: listening.media,
      timingBlocks: listening.timingBlocks.map((block) => ({ ...block, durationMs: 5000 })),
    });
    let attempt = beginAttemptV2(exact, initial);
    attempt = update(
      attempt,
      { kind: 'audio', mediaId: audio.id, action: 'start', positionMs: 0 },
      0,
      {},
      exact,
    );
    attempt = update(
      attempt,
      { kind: 'audio', mediaId: audio.id, action: 'ended', positionMs: 5000 },
      5000,
      {},
      exact,
    );
    expect(attempt.status).toBe('submitted');
    expect(scoreAttemptV2(exact, attempt).incompleteAudioIds).toEqual([]);
  });
  it('does not count a start halfway through the stimulus as a complete first play', () => {
    const attempt = beginAttemptV2(listening, initial);
    expect(() =>
      update(
        attempt,
        { kind: 'audio', mediaId: audio.id, action: 'start', positionMs: 3000 },
        0,
        {},
        listening,
      ),
    ).toThrow();
  });
  it('resumes after a playback error at the saved position without granting a replay', () => {
    let attempt = beginAttemptV2(listening, initial);
    attempt = update(
      attempt,
      { kind: 'audio', mediaId: audio.id, action: 'start', positionMs: 0 },
      0,
      {},
      listening,
    );
    attempt = update(
      attempt,
      { kind: 'audio', mediaId: audio.id, action: 'error', positionMs: 2000 },
      2000,
      {},
      listening,
    );
    expect(() =>
      update(
        attempt,
        { kind: 'audio', mediaId: audio.id, action: 'start', positionMs: 4000 },
        2500,
        {},
        listening,
      ),
    ).toThrow();
    attempt = update(
      attempt,
      { kind: 'audio', mediaId: audio.id, action: 'start', positionMs: 2000 },
      2500,
      {},
      listening,
    );
    expect(attempt.audio[0]).toMatchObject({ status: 'playing', starts: 1, positionMs: 2000 });
    expect(attempt.conditions).toContain('audio-error');
    expect(attempt.conditions).toContain('audio-interrupted');
  });
  it('plays shared media once across two items and records a normal interruption', () => {
    let attempt = beginAttemptV2(listening, initial);
    const audioEvent = (action: 'start' | 'pause' | 'ended', positionMs: number, time: number) => {
      attempt = update(
        attempt,
        { kind: 'audio', mediaId: audio.id, action, positionMs },
        time,
        {},
        listening,
      );
    };
    audioEvent('start', 0, 0);
    audioEvent('pause', 2000, 2000);
    audioEvent('start', 2000, 3000);
    audioEvent('ended', 5000, 6000);
    attempt = update(attempt, { kind: 'visit', itemId: 'b' }, 6100, {}, listening);
    audioEvent('start', 5000, 6200);
    expect(attempt.audio).toHaveLength(1);
    expect(attempt.audio[0]).toMatchObject({ starts: 1, status: 'ended', playedMs: 5000 });
    expect(attempt.conditions).toContain('audio-interrupted');
    attempt = update(attempt, { kind: 'submit' }, 6500, {}, listening);
    expect(scoreAttemptV2(listening, attempt).incompleteAudioIds).toEqual([]);
  });
  it('blocks replay and seeking in timed mode, while practice records them', () => {
    const attempt = beginAttemptV2(listening, initial);
    expect(() =>
      update(
        attempt,
        { kind: 'audio', mediaId: audio.id, action: 'replay', positionMs: 0 },
        0,
        {},
        listening,
      ),
    ).toThrow();
    expect(() =>
      update(
        attempt,
        { kind: 'audio', mediaId: audio.id, action: 'seek', positionMs: 2000 },
        0,
        {},
        listening,
      ),
    ).toThrow();
    let practice = beginAttemptV2(listening, { ...initial, mode: 'practice' });
    practice = update(
      practice,
      { kind: 'audio', mediaId: audio.id, action: 'start', positionMs: 0 },
      0,
      {},
      listening,
    );
    practice = update(
      practice,
      { kind: 'audio', mediaId: audio.id, action: 'replay', positionMs: 0 },
      10,
      {},
      listening,
    );
    expect(practice.conditions).toContain('audio-replayed');
    expect(practice.audio[0]!.starts).toBe(2);
  });
});
