import { inputHashOf } from '@bunki/ai/hash';
import { describe, expect, it } from 'vitest';
import {
  assessAttemptAdmission,
  assertItemResponse,
  beginAttempt,
  checkpointAttempt,
  createFormVersion,
  parseAttempt,
  scoreAttempt,
  type AttemptFact,
} from '../src/index.ts';
import {
  answerFacts,
  checkpointCommand,
  clone,
  complete,
  factBase,
  form,
  fullForm,
  item,
  NOW,
  payloadOf,
  start,
} from './fixtures.ts';

describe('durable attempt proposals', () => {
  it('retains distinct attempt identities even for identical form, answers and timestamps', () => {
    const subject = form();
    const first = start(subject);
    const second = beginAttempt(subject, {
      attemptId: 'attempt:fixture-two',
      scope: first.scope,
      mode: first.mode,
      priorExposure: first.priorExposure,
      editorialAtStart: first.editorialAtStart,
      startedAt: NOW,
      clockStatus: 'continuous',
    });
    const completed = [complete(subject, first), complete(subject, second)];
    expect(new Set(completed.map((attempt) => attempt.attemptId)).size).toBe(2);
    expect(completed[0]!.answers).toEqual(completed[1]!.answers);
    expect(completed[0]!.revisionId).not.toBe(completed[1]!.revisionId);
    expect(parseAttempt(subject, JSON.parse(JSON.stringify(completed[0])))).toEqual(completed[0]);
  });
  it('retains old responses and replaces only the current projection on a later checkpoint', () => {
    const subject = form();
    const initial = start(subject);
    const selected = subject.items[0]!;
    const first = checkpointAttempt(
      subject,
      initial,
      checkpointCommand(initial, answerFacts(subject, selected)),
    );
    const nextFact: AttemptFact = {
      ...factBase(subject, selected, 'changed-response', 200),
      kind: 'response',
      response: { kind: 'selected', optionId: 'b' },
    };
    const second = checkpointAttempt(
      subject,
      first,
      checkpointCommand(first, [nextFact], 'submitted'),
    );
    expect(second.facts.filter((fact) => fact.kind === 'response')).toHaveLength(2);
    expect(second.answers[0]!.response).toEqual({ kind: 'selected', optionId: 'b' });
    expect(first.answers[0]!.response).toEqual({ kind: 'selected', optionId: 'a' });
    expect(second.previousRevisionId).toBe(first.revisionId);
    expect(scoreAttempt(subject, second).correct).toBe(0);
  });
  it('requires a current checkpoint and refuses to reopen final attempts', () => {
    const subject = form();
    const initial = start(subject);
    const command = checkpointCommand(initial, answerFacts(subject, subject.items[0]!));
    const next = checkpointAttempt(subject, initial, command);
    expect(checkpointAttempt(subject, initial, command)).toEqual(next); // Same proposal, not a second durable commit.
    expect(() => checkpointAttempt(subject, next, command)).toThrow(/stale-checkpoint/u);
    const ended = checkpointAttempt(subject, next, checkpointCommand(next, [], 'abandoned'));
    expect(() => checkpointAttempt(subject, ended, checkpointCommand(ended))).toThrow(
      /attempt-finalized/u,
    );
    expect(() => scoreAttempt(subject, ended)).toThrow(/attempt-not-submitted/u);
  });
  it('rejects stale form revisions, invalid item references and invented response projections', () => {
    const subject = form();
    const attempt = complete(subject);
    const changed = payloadOf(subject);
    changed.title = 'New edition';
    expect(() => parseAttempt(createFormVersion(changed), attempt)).toThrow(/reference-mismatch/u);
    const tampered = clone(attempt);
    tampered.answers[0]!.response = { kind: 'selected', optionId: 'b' };
    // Even if an attacker recomputes the outer digest, the answers must agree with retained facts.
    const payload = payloadOf(tampered);
    tampered.sha256 = inputHashOf(payload);
    tampered.revisionId = `assessment-attempt:${tampered.sha256}`;
    expect(() => parseAttempt(subject, tampered)).toThrow(/answers/u);
    const initial = start(subject);
    const facts = clone(answerFacts(subject, subject.items[0]!));
    if (facts[0]!.kind !== 'exposure') throw new Error('fixture');
    facts[0]!.item.sha256 = 'f'.repeat(64);
    expect(() => checkpointAttempt(subject, initial, checkpointCommand(initial, facts))).toThrow(
      /reference-mismatch/u,
    );
  });
  it('refuses a rewritten initial revision containing a supposedly completed sitting', () => {
    const subject = form();
    const tampered = clone(complete(subject));
    tampered.revision = 0;
    tampered.previousRevisionId = null;
    const payload = payloadOf(tampered);
    tampered.sha256 = inputHashOf(payload);
    tampered.revisionId = `assessment-attempt:${tampered.sha256}`;
    expect(() => parseAttempt(subject, tampered)).toThrow(/initial-attempt-state/u);
  });
  it('records wall-clock rollback without converting it into negative or free elapsed time', () => {
    const subject = form();
    const initial = start(subject);
    const command = checkpointCommand(
      initial,
      answerFacts(subject, subject.items[0]!),
      'submitted',
    );
    command.recordedAt = '2025-01-01T00:00:00.000Z';
    const result = checkpointAttempt(subject, initial, command);
    expect(result.endedAt).toBe(command.recordedAt);
    expect(result.timings[0]!.elapsedMs).toBe(100);
    expect(scoreAttempt(subject, result).correct).toBe(1);
  });
  it('refuses timer regression, active time beyond elapsed time and a restored continuity claim', () => {
    const subject = form();
    const initial = start(subject);
    const first = checkpointAttempt(
      subject,
      initial,
      checkpointCommand(initial, answerFacts(subject, subject.items[0]!)),
    );
    const regression = checkpointCommand(first);
    regression.timings[0]!.elapsedMs = 99;
    regression.timings[0]!.activeMs = 99;
    expect(() => checkpointAttempt(subject, first, regression)).toThrow(/timing-regression/u);
    regression.timings[0]!.activeMs = 1000;
    expect(() => checkpointAttempt(subject, first, regression)).toThrow();
    const interrupted = checkpointCommand(first, [
      {
        id: 'process-killed',
        recordedAt: NOW,
        kind: 'interruption',
        reason: 'process-stop',
        timingBlockId: first.cursor.timingBlockId,
        elapsedMs: 100,
      },
    ]);
    expect(() => checkpointAttempt(subject, first, interrupted)).toThrow(/clockStatus/u);
    interrupted.clockStatus = 'unverified';
    const recovered = checkpointAttempt(subject, first, interrupted);
    const dishonest = checkpointCommand(recovered);
    dishonest.clockStatus = 'continuous';
    expect(() => checkpointAttempt(subject, recovered, dishonest)).toThrow(/clockStatus/u);
  });
  it('requires prompt exposure before answering and preserves explicit unanswered changes', () => {
    const subject = form();
    const initial = start(subject);
    const facts = answerFacts(subject, subject.items[0]!);
    expect(() =>
      checkpointAttempt(subject, initial, checkpointCommand(initial, facts.slice(1))),
    ).toThrow(/response-before-exposure/u);
    const first = checkpointAttempt(subject, initial, checkpointCommand(initial, facts));
    const erased: AttemptFact = {
      ...factBase(subject, subject.items[0]!, 'unanswered', 200),
      kind: 'response',
      response: { kind: 'unanswered' },
    };
    const final = checkpointAttempt(
      subject,
      first,
      checkpointCommand(first, [erased], 'submitted'),
    );
    expect(final.facts).toHaveLength(3);
    expect(scoreAttempt(subject, final).items[0]!.result).toBe('unanswered');
  });
  it('rejects duplicated fact identities, wrong option ids and facts beyond the current timer', () => {
    const subject = form();
    const initial = start(subject);
    const facts = answerFacts(subject, subject.items[0]!);
    expect(() =>
      checkpointAttempt(subject, initial, checkpointCommand(initial, [...facts, facts[0]!])),
    ).toThrow(/facts.id/u);
    const invalid = clone(facts);
    if (invalid[1]!.kind !== 'response') throw new Error('fixture');
    invalid[1]!.response = { kind: 'selected', optionId: 'unknown' };
    expect(() => checkpointAttempt(subject, initial, checkpointCommand(initial, invalid))).toThrow(
      /optionId/u,
    );
    const tooEarly = checkpointCommand(initial, facts);
    tooEarly.timings[0]!.elapsedMs = 0;
    tooEarly.timings[0]!.activeMs = 0;
    expect(() => checkpointAttempt(subject, initial, tooEarly)).toThrow(/facts.elapsedMs/u);
  });
  it('preserves a resumable cursor while enforcing forward timed block order', () => {
    const subject = fullForm();
    const initial = start(subject, 'timed');
    const skip = checkpointCommand(initial);
    skip.cursor = { timingBlockId: subject.timingBlocks[2]!.id, itemId: subject.items[4]!.id };
    expect(() => checkpointAttempt(subject, initial, skip)).toThrow(/timed-block-order/u);
    const next = checkpointCommand(initial);
    next.cursor = { timingBlockId: subject.timingBlocks[1]!.id, itemId: subject.items[1]!.id };
    const advanced = checkpointAttempt(subject, initial, next);
    const back = checkpointCommand(advanced);
    back.cursor = initial.cursor;
    expect(() => checkpointAttempt(subject, advanced, back)).toThrow(/timed-block-order/u);
    expect(parseAttempt(subject, JSON.parse(JSON.stringify(advanced))).cursor).toEqual(next.cursor);
  });
});

describe('response variants and conservative evidence admission', () => {
  it('scores selected, ordered and exact written responses while leaving manual marking pending', () => {
    const subject = form([
      item('selected'),
      item('ordered', {
        response: {
          kind: 'ordered',
          tokens: [
            { id: 'a', text: '駅に' },
            { id: 'b', text: '行く' },
          ],
          answerOrder: ['a', 'b'],
        },
      }),
      item('written-exact', {
        response: {
          kind: 'written',
          maxChars: 20,
          marking: { kind: 'exact', accepted: ['図書館'], normalization: 'none' },
        },
      }),
      item('written-manual', {
        response: {
          kind: 'written',
          maxChars: 100,
          marking: { kind: 'manual', rubric: 'Human review needed.' },
        },
      }),
    ]);
    expect(scoreAttempt(subject, complete(subject))).toMatchObject({
      label: 'Raw practice result',
      correct: 3,
      scorableItems: 3,
      totalItems: 4,
      pendingManualMarking: 1,
      officialScore: null,
      certification: 'none',
      passPrediction: null,
    });
  });
  it('does not normalize a written response or treat a partial ordering as correct', () => {
    const selected = item('written', {
      response: {
        kind: 'written',
        maxChars: 10,
        marking: { kind: 'exact', accepted: ['が'], normalization: 'none' },
      },
    });
    const subject = form([selected]);
    const initial = start(subject);
    const facts = clone(answerFacts(subject, selected));
    if (facts[1]!.kind !== 'response') throw new Error('fixture');
    facts[1]!.response = { kind: 'written', text: 'か\u3099' };
    expect(
      scoreAttempt(
        subject,
        checkpointAttempt(subject, initial, checkpointCommand(initial, facts, 'submitted')),
      ).correct,
    ).toBe(0);
    const ordered = item('ordered', {
      response: {
        kind: 'ordered',
        tokens: [
          { id: 'a', text: '駅へ' },
          { id: 'b', text: '行く' },
        ],
        answerOrder: ['a', 'b'],
      },
    });
    expect(() => assertItemResponse(ordered, { kind: 'ordered', tokenIds: ['a', 'a'] })).toThrow();
    expect(assertItemResponse(ordered, { kind: 'ordered', tokenIds: ['a'] })).toEqual({
      kind: 'ordered',
      tokenIds: ['a'],
    });
  });
  it('short or unreviewed practice remains practice-only and never schedules or certifies anything', () => {
    const subject = form();
    expect(assessAttemptAdmission(subject, complete(subject))).toMatchObject({
      disposition: 'practice-only',
      evidenceAdmitted: false,
      scheduling: 'unchanged',
      officialScore: null,
      certification: 'none',
      reasons: expect.arrayContaining(['practice-scope', 'unreviewed-at-start']),
    });
  });
  it('even a clean synthetic reviewed timed attempt only becomes a candidate for a separate domain gate', () => {
    const subject = fullForm();
    expect(
      assessAttemptAdmission(subject, complete(subject, start(subject, 'timed', true))),
    ).toMatchObject({
      disposition: 'candidate-for-separate-domain-gate',
      evidenceAdmitted: false,
      scheduling: 'unchanged',
      reasons: [],
    });
  });
  it.each(['dictionary', 'hint', 'translation', 'tutor', 'external'] as const)(
    '%s assistance remains attached after a correct answer',
    (assistance) => {
      const subject = form();
      const initial = start(subject);
      const selected = subject.items[0]!;
      const facts: AttemptFact[] = [
        { ...factBase(subject, selected, 'assisted'), kind: 'assistance', assistance },
        ...answerFacts(subject, selected),
      ];
      const finished = checkpointAttempt(
        subject,
        initial,
        checkpointCommand(initial, facts, 'submitted'),
      );
      expect(scoreAttempt(subject, finished).correct).toBe(1);
      expect(assessAttemptAdmission(subject, finished).reasons).toContain('assisted-or-revealed');
    },
  );
  it('answer reveal cannot be erased by a later correct response', () => {
    const subject = form();
    const initial = start(subject);
    const selected = subject.items[0]!;
    const facts: AttemptFact[] = [
      { ...factBase(subject, selected, 'revealed'), kind: 'exposure', content: 'answer' },
      ...answerFacts(subject, selected),
    ];
    const finished = checkpointAttempt(
      subject,
      initial,
      checkpointCommand(initial, facts, 'submitted'),
    );
    expect(assessAttemptAdmission(subject, finished).reasons).toContain('assisted-or-revealed');
  });
  it('audio failures, replay and unverified listening completion are visible admission reasons', () => {
    const subject = fullForm();
    const initial = start(subject);
    const selected = subject.items[4]!;
    const media = subject.media[0]!;
    const facts: AttemptFact[] = [
      {
        ...factBase(subject, selected, 'audio-failed'),
        kind: 'audio',
        action: 'error',
        media: { kind: 'media', id: media.id, revisionId: media.revisionId, sha256: media.sha256 },
        positionMs: 0,
      },
    ];
    const command = checkpointCommand(initial, facts, 'submitted');
    const finished = checkpointAttempt(subject, initial, command);
    expect(assessAttemptAdmission(subject, finished).reasons).toEqual(
      expect.arrayContaining(['audio-not-standard', 'listening-completion-unverified']),
    );
    const outOfBounds = clone(facts);
    if (outOfBounds[0]!.kind !== 'audio') throw new Error('fixture');
    outOfBounds[0]!.positionMs = 1001;
    expect(() =>
      checkpointAttempt(subject, initial, checkpointCommand(initial, outOfBounds)),
    ).toThrow(/positionMs/u);
  });
  it('an ended callback without a preceding playback start does not prove listening exposure', () => {
    const subject = fullForm();
    const initial = start(subject);
    const selected = subject.items[4]!;
    const media = subject.media[0]!;
    const facts: AttemptFact[] = [
      ...answerFacts(subject, selected),
      {
        ...factBase(subject, selected, 'ended-only', 1000),
        kind: 'audio',
        action: 'ended',
        media: { kind: 'media', id: media.id, revisionId: media.revisionId, sha256: media.sha256 },
        positionMs: 1000,
      },
    ];
    const finished = checkpointAttempt(
      subject,
      initial,
      checkpointCommand(initial, facts, 'submitted'),
    );
    expect(assessAttemptAdmission(subject, finished).reasons).toContain(
      'listening-completion-unverified',
    );
  });
  it('keeps actual overtime as a fact and excludes it from clean timing admission', () => {
    const subject = form();
    const initial = start(subject);
    const command = checkpointCommand(
      initial,
      answerFacts(subject, subject.items[0]!),
      'submitted',
    );
    command.timings[0]!.elapsedMs = subject.timingBlocks[0]!.durationMs + 1;
    const finished = checkpointAttempt(subject, initial, command);
    expect(finished.timings[0]!.elapsedMs).toBe(60_001);
    expect(assessAttemptAdmission(subject, finished).reasons).toContain('time-limit-exceeded');
  });
});
