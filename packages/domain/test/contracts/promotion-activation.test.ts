/**
 * Promotion activates contracts (WP-06; REQ-DM-09, DL-05, DL-36).
 *
 * The ladder's four rungs are not four labels: `keep` is "retain and resurface
 * opportunistically, **no mandatory SRS**", `learn` activates the
 * recognition/reading/sense directions, `master` adds production and
 * discrimination. Getting this table wrong is how a save button becomes a
 * commitment the learner never made.
 *
 * The rate limiter is deliberately absent. This suite asserts that the absence
 * is *recorded* — Phase 0 guarantees promotion is explicit and never automatic,
 * and says plainly that throughput limiting is not built.
 */

import { describe, expect, it } from 'vitest';

import {
  PROMOTION_ACTIVE_STATES,
  PROMOTION_ORIGINS,
  PROMOTION_RATE_LIMIT_SEAM,
  PROMOTION_STATES,
  RETRIEVAL_SKILLS,
  SKILLS_ACTIVATED_BY_PROMOTION,
  activatesSkill,
  isPromotionActive,
} from '../../src/index.ts';
import {
  T,
  capture,
  decisionOf,
  memoryStateOf,
  productionContract,
  promote,
  review,
  run,
} from '../support/wp06.ts';

describe('the activation table is REQ-DM-09, as data', () => {
  it('captured and keep activate nothing', () => {
    expect(SKILLS_ACTIVATED_BY_PROMOTION.captured).toEqual([]);
    expect(SKILLS_ACTIVATED_BY_PROMOTION.keep).toEqual([]);
    expect(isPromotionActive('captured')).toBe(false);
    expect(isPromotionActive('keep')).toBe(false);
  });

  it('learn activates recognition, reading, and sense', () => {
    expect([...SKILLS_ACTIVATED_BY_PROMOTION.learn].sort()).toEqual([
      'audio_to_meaning',
      'form_to_meaning',
      'orthography_to_reading',
    ]);
  });

  it('master adds production and discrimination on top of learn', () => {
    const learn = new Set(SKILLS_ACTIVATED_BY_PROMOTION.learn);
    const master = new Set(SKILLS_ACTIVATED_BY_PROMOTION.master);
    expect([...learn].every((skill) => master.has(skill))).toBe(true);
    expect([...master].sort()).toEqual([...RETRIEVAL_SKILLS].sort());
    expect(activatesSkill('learn', 'meaning_to_production')).toBe(false);
    expect(activatesSkill('master', 'meaning_to_production')).toBe(true);
  });

  it('covers every promotion state, so no rung is undefined behaviour', () => {
    PROMOTION_STATES.forEach((state) => {
      expect(SKILLS_ACTIVATED_BY_PROMOTION[state]).toBeDefined();
    });
    expect(PROMOTION_ACTIVE_STATES).toEqual(['learn', 'master']);
  });
});

describe('the table is reachable through a replayed log', () => {
  it('a production contract is inert under learn and live under master', () => {
    const base = [capture(), promote('learn'), productionContract()];

    const underLearn = run([
      ...base,
      review({ eventId: 'ev-early', at: T.review1, contractId: 'contract-production' }),
    ]);
    expect(memoryStateOf(underLearn, 'contract-production')).toBeUndefined();
    expect(decisionOf(underLearn, 'ev-early')?.reason).toBe('skill_not_activated_by_promotion');

    const underMaster = run([
      ...base,
      promote('master', { eventId: 'ev-master', at: T.review2, from: 'learn' }),
      review({ eventId: 'ev-late', at: T.review3, contractId: 'contract-production' }),
    ]);
    expect(decisionOf(underMaster, 'ev-late')?.admitted).toBe(true);
    expect(memoryStateOf(underMaster, 'contract-production')?.admittedReviewCount).toBe(1);
  });

  it('demoting from master deactivates the production contract without deleting it', () => {
    const state = run([
      capture(),
      promote('learn'),
      productionContract(),
      promote('master', { eventId: 'ev-master', at: T.review1, from: 'learn' }),
      review({ eventId: 'ev-review', at: T.review2, contractId: 'contract-production' }),
      promote('learn', { eventId: 'ev-demote', at: T.review3, from: 'master' }),
    ]);

    const memory = memoryStateOf(state, 'contract-production');
    expect(memory?.active).toBe(false);
    expect(memory?.admittedReviewCount).toBe(1);
  });
});

describe('promotion is explicit, and the rate limiter is an honest absence', () => {
  it('has no automatic origin for a reducer to reach for', () => {
    expect([...PROMOTION_ORIGINS]).toEqual(['user', 'nomination_accepted']);
    expect(PROMOTION_ORIGINS).not.toContain('automatic');
  });

  it('records the rate-limit seam with an owner and what is missing', () => {
    expect(PROMOTION_RATE_LIMIT_SEAM.capability).toMatch(/rate limit/i);
    expect(PROMOTION_RATE_LIMIT_SEAM.whatPhase0Guarantees).toMatch(/explicit/);
    expect(PROMOTION_RATE_LIMIT_SEAM.whatIsMissing).toMatch(/workload/);
    expect(PROMOTION_RATE_LIMIT_SEAM.anchors).toContain('DL-36');
    expect(PROMOTION_RATE_LIMIT_SEAM.anchors).toContain('REQ-DM-09');
  });
});
