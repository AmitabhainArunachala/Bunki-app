/**
 * **T-08 — Passive/contextual exposure never updates FSRS.**
 *
 * Controller §17.1 and §6.2, REQ-DM-06 (tier D), REQ-SCH-06, DL-19. Seeing a
 * word go past in a passage is not retrieving it. Relabelling exposure as
 * review is the exact mechanism by which an immersion feature manufactures
 * false mastery, which is why REQ-SCH-06 was the resolution of a whole
 * convergence conflict rather than a detail.
 *
 * The suite covers the harder version of the claim too: exposure to the very
 * component under study, and tier-B/C production evidence, both of which are
 * *more* informative than a passage sighting and still do not write FSRS. The
 * only thing that does is a declared, contract-conforming tier-A retrieval.
 */

import { describe, expect, it } from 'vitest';

import { createDeterministicContext, mintExposureLogged } from '../../src/index.ts';
import { exposureLogged, productionObserved } from '../support/events.ts';
import {
  COMPONENT,
  T,
  decisionOf,
  learnableLog,
  memoryStateOf,
  review,
  run,
} from '../support/wp06.ts';

describe('T-08: passive and contextual exposure never updates FSRS', () => {
  it('exposure to the component under study is refused by name', () => {
    const state = run([
      ...learnableLog(),
      exposureLogged({ eventId: 'ev-exposure', at: T.review1 }, { componentIds: [COMPONENT] }),
    ]);

    expect(decisionOf(state, 'ev-exposure')).toMatchObject({
      admitted: false,
      reason: 'exposure_is_never_retrieval',
      effectiveGrade: null,
    });
  });

  it('and changes no memory state at all', () => {
    const withoutExposure = run([
      ...learnableLog(),
      review({ eventId: 'ev-review', at: T.review1, contractId: 'contract-reading' }),
    ]);
    const withExposure = run([
      ...learnableLog(),
      review({ eventId: 'ev-review', at: T.review1, contractId: 'contract-reading' }),
      exposureLogged({ eventId: 'ev-exposure', at: T.review2 }, { componentIds: [COMPONENT] }),
    ]);

    expect(JSON.stringify(withExposure.memoryStates)).toBe(
      JSON.stringify(withoutExposure.memoryStates),
    );
  });

  it('is still recorded as tier D — refused is not the same as ignored', () => {
    const state = run([
      ...learnableLog(),
      exposureLogged({ eventId: 'ev-exposure', at: T.review1 }, { componentIds: [COMPONENT] }),
    ]);

    const observation = state.observations.find((entry) => entry.eventId === 'ev-exposure');
    expect(observation?.tier).toBe('D');
  });

  it('tier B production is refused too — deliberate elicitation is not tier A', () => {
    const state = run([
      ...learnableLog(),
      productionObserved(
        { eventId: 'ev-production', at: T.review1, tier: 'B' },
        { contractId: 'contract-reading' },
      ),
    ]);

    expect(decisionOf(state, 'ev-production')).toMatchObject({
      admitted: false,
      reason: 'production_is_not_tier_a',
    });
    expect(memoryStateOf(state, 'contract-reading')?.admittedReviewCount).toBe(0);
  });

  it('tier C spontaneous production is refused as well', () => {
    const state = run([
      ...learnableLog(),
      productionObserved({ eventId: 'ev-production-c', at: T.review1, tier: 'C' }),
    ]);

    expect(decisionOf(state, 'ev-production-c')?.admitted).toBe(false);
  });

  it('only a tier-A review moves anything', () => {
    const state = run([
      ...learnableLog(),
      exposureLogged({ eventId: 'ev-exposure', at: T.review1 }, { componentIds: [COMPONENT] }),
      productionObserved({ eventId: 'ev-production', at: T.review1, tier: 'B' }),
      review({ eventId: 'ev-review', at: T.review2, contractId: 'contract-reading' }),
    ]);

    const admitted = state.gateDecisions.filter((decision) => decision.admitted);
    expect(admitted.map((decision) => decision.eventId)).toEqual(['ev-review']);
  });

  it('the gate stamps the tier so a caller cannot relabel exposure as review', () => {
    const event = mintExposureLogged(
      createDeterministicContext({ instants: T.review1, idPrefix: 't08-', seed: 1 }),
      { componentIds: [COMPONENT], experienceId: 'experience-1' },
      { idempotencyKey: 'exposure:1' },
    );

    expect(event.tier).toBe('D');
  });
});
