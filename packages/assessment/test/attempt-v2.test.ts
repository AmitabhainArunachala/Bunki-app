import { describe, expect, it } from 'vitest';
import { inputHashOf, sha256Hex } from '@bunki/ai/hash';
import { revisionOf } from '../src/common.ts';
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

describe('per-item explanation after a committed practice answer', () => {
  const practice = { ...initial, mode: 'practice' };
  const answered = () =>
    update(
      beginAttemptV2(paper, practice),
      { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } },
      100,
    );
  const explain = (attempt: AssessmentAttemptV2, itemId = 'one', elapsed = 200) =>
    update(attempt, { kind: 'assistance', itemId, reason: 'explanation' }, elapsed);
  type Stored = {
    mode: string;
    recordedAt: number;
    conditions: string[];
    assistanceAttribution?: string;
    events: { kind: string }[];
    answers: {
      response: unknown;
      reached: boolean;
      assistance?: { kind: string; at: number; response: unknown };
    }[];
  };
  // Re-seal an edited copy with a valid public digest, so parse must judge the content.
  function reseal(attempt: AssessmentAttemptV2, edit: (state: Stored) => void) {
    const {
      revisionId: _revisionId,
      sha256: _sha256,
      ...payload
    } = JSON.parse(JSON.stringify(attempt)) as Stored & { revisionId: string; sha256: string };
    edit(payload);
    return revisionOf('attempt-v2', payload);
  }

  it('records one mark with a canonical copy of the committed answer, then locks the answer', () => {
    const before = answered();
    const marked = explain(before);
    expect(marked.revision).toBe(before.revision + 1);
    expect(marked.answers[0]!.assistance).toEqual({
      kind: 'explanation',
      at: NOW + 200,
      response: { kind: 'selected', optionId: 'b' },
    });
    expect(inputHashOf(marked.answers[0]!.assistance!.response)).toBe(
      inputHashOf(marked.answers[0]!.response),
    );
    expect(marked.conditions).toContain('assisted');
    expect(marked.events.filter((entry) => entry.kind === 'assistance')).toHaveLength(1);
    for (const response of [{ kind: 'selected', optionId: 'a' }, { kind: 'unanswered' }] as const)
      expect(() => update(marked, { kind: 'answer', itemId: 'one', response }, 300)).toThrow(
        /answer-locked-after-assistance/u,
      );
    let later = update(marked, { kind: 'flag', itemId: 'one', flagged: true }, 300);
    later = update(later, { kind: 'visit', itemId: 'two' }, 400);
    later = update(later, { kind: 'visit', itemId: 'one' }, 500);
    const submitted = update(later, { kind: 'submit' }, 600);
    expect(submitted.answers[0]).toMatchObject({
      response: { kind: 'selected', optionId: 'b' },
      flagged: true,
      assistance: marked.answers[0]!.assistance,
    });
    expect(parseAttemptV2(paper, JSON.parse(JSON.stringify(submitted))).revisionId).toBe(
      submitted.revisionId,
    );
  });

  it('reopens without a tick or a revision, but still refuses a stale command', () => {
    const marked = explain(answered());
    const again = explain(marked, 'one', 900);
    expect(again.revisionId).toBe(marked.revisionId);
    expect(again.clock).toEqual(marked.clock);
    expect(again.events).toEqual(marked.events);
    expect(() =>
      updateAttemptV2(paper, marked, {
        expectedRevisionId: `assessment-attempt-v2:${'c'.repeat(64)}`,
        now: NOW + 900,
        monotonicMs: 900,
        clockSessionId: 'session:one',
        action: { kind: 'assistance', itemId: 'one', reason: 'explanation' },
      }),
    ).toThrow(/stale-checkpoint/u);
  });

  it('carries inherited unknown attribution through a later lawful explanation', () => {
    // S: an admitted active practice state with two selected answers (the second current),
    // the aggregate condition, and no item mark or assistance event: a parser-valid legacy shape.
    const payload = {
      format: 'kairo-assessment-attempt',
      v: 2,
      protocol: 'assessment-delivery/v2',
      attemptId: 'attempt:legacy',
      scope,
      form: { ...artifactReference(paper), kind: 'form' },
      mode: 'practice',
      priorExposure: 'unknown',
      editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] },
      startedAt: NOW,
      recordedAt: NOW + 2000,
      endedAt: null,
      status: 'in-progress',
      revision: 4,
      previousRevisionId: `assessment-attempt-v2:${'d'.repeat(64)}`,
      cursor: { blockId: 'block:grammar', itemId: 'two' },
      clock: {
        sessionId: 'session:one',
        lastWallMs: NOW + 2000,
        lastMonotonicMs: 2000,
        elapsedMs: 2000,
        interrupted: false,
      },
      conditions: ['assisted'],
      blocks: [
        {
          blockId: 'block:grammar',
          status: 'open',
          startedAt: NOW,
          startedElapsedMs: 0,
          deadlineAt: null,
          elapsedMs: 2000,
          closedAt: null,
          closeReason: null,
        },
      ],
      answers: paper.items.map((entry, index) => ({
        item: { ...artifactReference(entry), kind: 'item' },
        response:
          index < 2
            ? { kind: 'selected', optionId: index === 0 ? 'b' : 'a' }
            : { kind: 'unanswered' },
        reached: index < 2,
        flagged: false,
        elapsedMs: index < 2 ? 1000 : 0,
      })),
      audio: [],
      events: [
        { kind: 'block-opened', at: NOW, blockId: 'block:grammar', detail: 'block:grammar' },
      ],
    };
    const sha256 = inputHashOf(payload);
    const stored = { ...payload, revisionId: `assessment-attempt-v2:${sha256}`, sha256 };
    const legacy = parseAttemptV2(paper, JSON.parse(JSON.stringify(stored)));
    expect(inputHashOf(legacy)).toBe(inputHashOf(stored));
    expect('assistanceAttribution' in legacy).toBe(false);
    // One lawful explanation on the current answer keeps the inherited uncertainty.
    const marked = updateAttemptV2(paper, legacy, {
      expectedRevisionId: legacy.revisionId,
      now: NOW + 3000,
      monotonicMs: 3000,
      clockSessionId: 'session:one',
      action: { kind: 'assistance', itemId: 'two', reason: 'explanation' },
    });
    expect(marked.assistanceAttribution).toBe('unknown');
    expect(
      marked.answers.filter((entry) => entry.assistance).map((entry) => entry.item.id),
    ).toEqual(['two']);
    const reread = parseAttemptV2(
      paper,
      JSON.parse(JSON.stringify(update(marked, { kind: 'submit' }, 3500))),
    );
    expect(reread.assistanceAttribution).toBe('unknown');
    expect(reread.answers[1]!.response).toEqual({ kind: 'selected', optionId: 'a' });
    expect(reread.answers[1]!.assistance?.response).toEqual({ kind: 'selected', optionId: 'a' });
    // A fresh attempt's first explanation records nothing extra.
    const fresh = explain(
      update(
        update(answered(), { kind: 'visit', itemId: 'two' }, 150),
        { kind: 'answer', itemId: 'two', response: { kind: 'selected', optionId: 'a' } },
        160,
      ),
      'two',
      200,
    );
    expect('assistanceAttribution' in fresh).toBe(false);
    // The record needs the aggregate condition and at least one item mark.
    const orphan = reseal(fresh, (state) => {
      state.assistanceAttribution = 'unknown';
      delete state.answers[1]!.assistance;
    });
    expect(() => parseAttemptV2(paper, orphan)).toThrow(/assistance\.attribution/u);
  });

  it('checks a marked item retry like a first request before its no-op', () => {
    const marked = explain(answered());
    // An earlier mark must not make an unsupported item-specific request look accepted.
    expect(() =>
      update(marked, { kind: 'assistance', itemId: 'one', reason: 'hint' }, 300),
    ).toThrow(/assistance-reason/u);
    const away = update(marked, { kind: 'visit', itemId: 'two' }, 300);
    expect(() => explain(away, 'one', 400)).toThrow(/assistance-not-current-item/u);
    // Back on the marked item, a valid reopen is the exact previous state.
    const back = update(away, { kind: 'visit', itemId: 'one' }, 500);
    const reopened = explain(back, 'one', 900);
    expect(reopened.revisionId).toBe(back.revisionId);
    expect(inputHashOf(reopened)).toBe(inputHashOf(back));
    expect(reopened.clock).toEqual(back.clock);
    expect(reopened.events).toEqual(back.events);
    expect(() =>
      updateAttemptV2(paper, back, {
        expectedRevisionId: marked.revisionId,
        now: NOW + 900,
        monotonicMs: 900,
        clockSessionId: 'session:one',
        action: { kind: 'assistance', itemId: 'one', reason: 'explanation' },
      }),
    ).toThrow(/stale-checkpoint/u);
    // The historical command without an item stays lawful after a mark, adding its event.
    const generic = update(back, { kind: 'assistance', reason: 'hint' }, 600);
    expect(generic.revision).toBe(back.revision + 1);
    expect(generic.events.filter((entry) => entry.kind === 'assistance')).toHaveLength(2);
    expect(generic.answers.filter((entry) => entry.assistance)).toHaveLength(1);
  });

  it('refuses a mark before an answer, off the current item, for another reason, or while timed', () => {
    expect(() => explain(beginAttemptV2(paper, practice))).toThrow(/assistance-before-answer/u);
    const moved = update(answered(), { kind: 'visit', itemId: 'two' }, 150);
    expect(() => explain(moved, 'one')).toThrow(/assistance-not-current-item/u);
    expect(() => explain(moved, 'two')).toThrow(/assistance-before-answer/u);
    expect(() =>
      update(answered(), { kind: 'assistance', itemId: 'one', reason: 'hint' }, 200),
    ).toThrow(/assistance-reason/u);
    const timed = update(
      beginAttemptV2(paper, initial),
      { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } },
      100,
    );
    expect(() => explain(timed)).toThrow(/assistance-in-timed-mode/u);
  });

  it('keeps terminal and deadline behaviour: once closed there is no mark and no timed exception', () => {
    const submitted = update(answered(), { kind: 'submit' }, 300);
    expect(explain(submitted, 'one', 400)).toEqual(submitted);
    const timed = update(
      beginAttemptV2(paper, initial),
      { kind: 'answer', itemId: 'one', response: { kind: 'selected', optionId: 'b' } },
      100,
    );
    const expired = explain(timed, 'one', 61_000);
    expect(expired.status).toBe('submitted');
    expect(expired.answers[0]!.assistance).toBeUndefined();
    expect(expired.conditions).not.toContain('assisted');
  });

  it('rejects inconsistent stored marks, but cannot authenticate a jointly re-sealed answer', () => {
    const marked = explain(answered());
    const rejects = (edit: (state: Stored) => void, reason: RegExp) =>
      expect(() => parseAttemptV2(paper, reseal(marked, edit))).toThrow(reason);
    rejects((state) => {
      state.answers[0]!.response = { kind: 'selected', optionId: 'a' };
    }, /assistance\.copy/u);
    rejects((state) => {
      state.answers[0]!.assistance!.response = { kind: 'selected', optionId: 'a' };
    }, /assistance\.copy/u);
    rejects((state) => {
      state.answers[0]!.response = { kind: 'unanswered' };
      state.answers[0]!.assistance!.response = { kind: 'unanswered' };
    }, /assistance\.response/u);
    rejects((state) => {
      state.answers[1]!.assistance = {
        kind: 'explanation',
        at: NOW + 200,
        response: { kind: 'unanswered' },
      };
    }, /assistance\.reached/u);
    rejects((state) => {
      state.answers[0]!.assistance!.at = NOW - 1;
    }, /assistance\.at/u);
    rejects((state) => {
      state.answers[0]!.assistance!.at = state.recordedAt + 1;
    }, /assistance\.at/u);
    rejects((state) => {
      state.conditions = state.conditions.filter((value) => value !== 'assisted');
    }, /assistance\.condition/u);
    rejects((state) => {
      state.events = state.events.filter((entry) => entry.kind !== 'assistance');
    }, /assistance\.events/u);
    rejects((state) => {
      state.mode = 'timed';
    }, /assistance\.mode/u);
    rejects((state) => {
      state.answers[0]!.response = { kind: 'selected', optionId: 'z' };
      state.answers[0]!.assistance!.response = { kind: 'selected', optionId: 'z' };
    }, /response\.optionId/u);
    rejects((state) => {
      state.answers[0]!.assistance!.kind = 'hint';
    }, /invalid-input/u);
    // Documented limits, not guarantees (C6): changing both copies together, or
    // removing the mark with its condition and event, then re-sealing, gives a
    // consistent standalone record. Catching either needs retained history.
    const forged = reseal(marked, (state) => {
      state.answers[0]!.response = { kind: 'selected', optionId: 'a' };
      state.answers[0]!.assistance!.response = { kind: 'selected', optionId: 'a' };
    });
    expect(parseAttemptV2(paper, forged).answers[0]!.response).toEqual({
      kind: 'selected',
      optionId: 'a',
    });
    const erased = reseal(marked, (state) => {
      delete state.answers[0]!.assistance;
      state.conditions = state.conditions.filter((value) => value !== 'assisted');
      state.events = state.events.filter((entry) => entry.kind !== 'assistance');
    });
    expect(parseAttemptV2(paper, erased).answers[0]!.assistance).toBeUndefined();
  });

  it('keeps attempt-level history unattributed when a later item mark is added', () => {
    const aggregate = update(answered(), { kind: 'assistance', reason: 'hint' }, 150);
    const both = explain(aggregate);
    expect(both.answers.filter((entry) => entry.assistance)).toHaveLength(1);
    expect(both.events.filter((entry) => entry.kind === 'assistance')).toHaveLength(2);
    expect(both.events.map((entry) => entry.detail)).toEqual(
      expect.arrayContaining(['hint', 'explanation']),
    );
    expect(parseAttemptV2(paper, JSON.parse(JSON.stringify(both))).revisionId).toBe(
      both.revisionId,
    );
  });

  it('keeps old unassisted and lawful attempt-level assisted checkpoints byte-identical', () => {
    const checkpoint = (conditions: string[], events: object[], answeredFirst = true) => {
      const payload = {
        format: 'kairo-assessment-attempt',
        v: 2,
        protocol: 'assessment-delivery/v2',
        attemptId: 'attempt:golden',
        scope,
        form: { ...artifactReference(paper), kind: 'form' },
        mode: 'practice',
        priorExposure: 'unknown',
        editorialAtStart: { status: 'unreviewed', policyVersion: null, decisionRevisionIds: [] },
        startedAt: NOW,
        recordedAt: NOW + 2000,
        endedAt: null,
        status: 'in-progress',
        revision: 2,
        previousRevisionId: `assessment-attempt-v2:${'b'.repeat(64)}`,
        cursor: { blockId: 'block:grammar', itemId: 'one' },
        clock: {
          sessionId: 'session:one',
          lastWallMs: NOW + 2000,
          lastMonotonicMs: 2000,
          elapsedMs: 2000,
          interrupted: false,
        },
        conditions,
        blocks: [
          {
            blockId: 'block:grammar',
            status: 'open',
            startedAt: NOW,
            startedElapsedMs: 0,
            deadlineAt: null,
            elapsedMs: 2000,
            closedAt: null,
            closeReason: null,
          },
        ],
        answers: paper.items.map((entry, index) => ({
          item: { ...artifactReference(entry), kind: 'item' },
          response:
            index === 0 && answeredFirst
              ? { kind: 'selected', optionId: 'b' }
              : { kind: 'unanswered' },
          reached: index === 0,
          flagged: false,
          elapsedMs: index === 0 ? 2000 : 0,
        })),
        audio: [],
        events: [
          { kind: 'block-opened', at: NOW, blockId: 'block:grammar', detail: 'block:grammar' },
          ...events,
        ],
      };
      const sha256 = inputHashOf(payload);
      return { ...payload, revisionId: `assessment-attempt-v2:${sha256}`, sha256 };
    };
    for (const stored of [
      checkpoint([], []),
      // Historical attempt-level help: a condition and an event, no item attribution.
      checkpoint(
        ['assisted'],
        [{ kind: 'assistance', at: NOW + 2000, blockId: 'block:grammar', detail: 'hint' }],
      ),
      // The old command was also lawful before any answer existed.
      checkpoint(
        ['assisted'],
        [{ kind: 'assistance', at: NOW + 2000, blockId: 'block:grammar', detail: 'hint' }],
        false,
      ),
      // Parser-valid imported legacy shape: the aggregate condition with no event
      // and no item mark. Accepted and kept byte-identical; never rewritten.
      checkpoint(['assisted'], []),
    ]) {
      const parsed = parseAttemptV2(paper, JSON.parse(JSON.stringify(stored)));
      expect(inputHashOf(parsed)).toBe(inputHashOf(stored));
      expect(parsed.revisionId).toBe(stored.revisionId);
      expect(parsed.answers.some((entry) => 'assistance' in entry)).toBe(false);
    }
    const aggregate = update(answered(), { kind: 'assistance', reason: 'hint' }, 200);
    expect(aggregate.conditions).toContain('assisted');
    expect(aggregate.answers.some((entry) => 'assistance' in entry)).toBe(false);
  });
});
