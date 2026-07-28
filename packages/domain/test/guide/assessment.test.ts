/**
 * Assessment is a conversation, not a placement test (Campaign E / B6; map
 * document §4.2).
 *
 * The three claims that make that sentence checkable rather than rhetorical:
 * no item has a right answer, there is no total, and there is no verdict.
 */

import { describe, expect, it } from 'vitest';

import { CAPABILITY_LENSES } from '../../src/graph/lenses.ts';
import {
  ESTIMATE_LIMITS,
  LEARNER_STANCES,
  answerTurn,
  conversationProgress,
  formEstimate,
  nextUnansweredTurn,
  openConversation,
  proposedLenses,
  withGuideText,
} from '../../src/guide/index.ts';

import { AT, LATER, PROMPTS } from './support.ts';

describe('the exchange', () => {
  it('starts with every turn unanswered and none of them scored', () => {
    const conversation = openConversation(PROMPTS);
    expect(conversation.turns).toHaveLength(3);
    for (const turn of conversation.turns) {
      expect(turn.answer).toBeNull();
      expect(turn.guideText).toBeNull();
      // The load-bearing absence: there is no answer key on a turn, so nothing
      // in this module can mark one right.
      expect(Object.keys(turn)).not.toContain('correctAnswer');
      expect(Object.keys(turn)).not.toContain('score');
    }
  });

  it('walks turn by turn, and knows which one it is waiting on', () => {
    let conversation = openConversation(PROMPTS);
    expect(nextUnansweredTurn(conversation)?.turnId).toBe('turn-senro');

    conversation = answerTurn(conversation, 'turn-senro', 'read_it_without_help', AT);
    expect(nextUnansweredTurn(conversation)?.turnId).toBe('turn-bunkiten');
    expect(conversationProgress(conversation)).toEqual({ answered: 1, total: 3 });
  });

  it('lets a learner change what they said, because a correction is not a second answer', () => {
    let conversation = openConversation(PROMPTS);
    conversation = answerTurn(conversation, 'turn-senro', 'new_to_me', AT);
    conversation = answerTurn(conversation, 'turn-senro', 'read_it_without_help', LATER);

    expect(conversation.turns[0]?.answer).toBe('read_it_without_help');
    expect(conversation.turns[0]?.answeredAt).toBe(LATER);
    expect(conversationProgress(conversation).answered).toBe(1);
  });

  it('keeps the provider that produced the guide’s words', () => {
    const conversation = withGuideText(
      openConversation(PROMPTS),
      'turn-senro',
      '線路 is the pair of rails themselves.',
      'offline-fallback',
    );
    expect(conversation.turns[0]?.guideTextProvider).toBe('offline-fallback');
    // Attaching words never touches an answer.
    expect(conversation.turns[0]?.answer).toBeNull();
  });

  it('offers a way to decline, and declining is a real answer', () => {
    expect(LEARNER_STANCES).toContain('rather_not_say');
    const conversation = answerTurn(openConversation(PROMPTS), 'turn-senro', 'rather_not_say', AT);
    const estimate = formEstimate(conversation, AT);
    expect(estimate.declinedCount).toBe(1);
    expect(estimate.answeredCount).toBe(0);
    expect(estimate.unansweredCount).toBe(2);
  });
});

describe('the estimate', () => {
  it('is total: an empty conversation gives an estimate rather than an error', () => {
    const estimate = formEstimate(openConversation([]), AT);
    expect(estimate.impressions).toHaveLength(CAPABILITY_LENSES.length);
    expect(proposedLenses(estimate)).toEqual([]);
    expect(estimate.at).toBe(AT);
  });

  it('always answers for all five lenses and never for an aggregate', () => {
    const estimate = formEstimate(openConversation(PROMPTS), AT);
    expect(estimate.impressions.map((impression) => impression.lens)).toEqual([
      ...CAPABILITY_LENSES,
    ]);
    expect(estimate.impressions.map((i) => i.lens)).not.toContain('overall');
  });

  /**
   * The assertion that keeps this from becoming a placement test by accident.
   *
   * Every value on the estimate is either a lens name, a turn-count, a piece of
   * explanatory prose, or the fixed standing. `answeredCount` and its siblings
   * count *turns* and are asserted to equal the turns, so none of them can drift
   * into being a score without this failing.
   */
  it('holds no score, no level and no percentage', () => {
    let conversation = openConversation(PROMPTS);
    conversation = answerTurn(conversation, 'turn-senro', 'knew_the_form_not_the_reading', AT);
    conversation = answerTurn(conversation, 'turn-bunkiten', 'new_to_me', AT);
    const estimate = formEstimate(conversation, AT);

    expect(estimate.standing).toBe('conversation_impression');
    expect(estimate.answeredCount + estimate.declinedCount + estimate.unansweredCount).toBe(
      conversation.turns.length,
    );

    const json = JSON.stringify(estimate);
    for (const forbidden of ['score', 'level', 'percent', 'mastery', 'jlpt', 'rating', 'grade']) {
      expect(json.toLowerCase(), `the estimate mentions "${forbidden}"`).not.toContain(forbidden);
    }
    // No field is a fraction, which is what a percentage would have to be.
    for (const impression of estimate.impressions) {
      expect(typeof impression.attention).toBe('string');
    }
  });

  it('points at the lens the learner’s own words pointed at, and shows the working', () => {
    let conversation = openConversation(PROMPTS);
    conversation = answerTurn(conversation, 'turn-senro', 'knew_the_form_not_the_reading', AT);
    const estimate = formEstimate(conversation, AT);

    expect(proposedLenses(estimate)).toEqual(['reading']);
    const reading = estimate.impressions.find((i) => i.lens === 'reading');
    expect(reading?.basisTurnIds).toEqual(['turn-senro']);
    const meaning = estimate.impressions.find((i) => i.lens === 'meaning');
    expect(meaning?.attention).toBe('not_proposed');
  });

  it('proposes nothing from a turn that went well', () => {
    const conversation = answerTurn(
      openConversation(PROMPTS),
      'turn-senro',
      'read_it_without_help',
      AT,
    );
    // A good turn tells the guide where not to send the learner. Turning it
    // into a positive claim would be the guide recording something about recall.
    expect(proposedLenses(formEstimate(conversation, AT))).toEqual([]);
  });

  it('never proposes listening, production or writing, and says why', () => {
    let conversation = openConversation(PROMPTS);
    for (const turn of conversation.turns) {
      conversation = answerTurn(conversation, turn.turnId, 'new_to_me', AT);
    }
    const estimate = formEstimate(conversation, AT);

    for (const lens of ['listening', 'production', 'writing'] as const) {
      const impression = estimate.impressions.find((i) => i.lens === lens);
      expect(impression?.attention).toBe('not_proposed');
      expect(impression?.because).toMatch(/could see this part/);
    }
    expect(estimate.limits).toBe(ESTIMATE_LIMITS);
  });

  it('is deterministic: the same exchange gives the same estimate twice', () => {
    let conversation = openConversation(PROMPTS);
    conversation = answerTurn(conversation, 'turn-senro', 'met_it_but_it_slipped', AT);
    conversation = answerTurn(conversation, 'turn-kiro', 'rather_not_say', AT);

    expect(formEstimate(conversation, AT)).toEqual(formEstimate(conversation, AT));
  });

  it('covers every stance, so no stance can be added without a mapping', () => {
    for (const stance of LEARNER_STANCES) {
      const conversation = answerTurn(openConversation(PROMPTS), 'turn-senro', stance, AT);
      const estimate = formEstimate(conversation, AT);
      expect(estimate.impressions).toHaveLength(CAPABILITY_LENSES.length);
    }
  });
});
