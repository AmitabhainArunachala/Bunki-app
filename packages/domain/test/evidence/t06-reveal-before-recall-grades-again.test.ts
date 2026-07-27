/**
 * **T-06 — Reveal-before-recall grades `Again`.**
 *
 * Controller §17.1 and §6.2, REQ-DM-07, ADR-002. A learner who saw the answer
 * did not recall it, whatever they then pressed. Letting a post-reveal "good"
 * count is grade inflation with a spaced-repetition schedule attached to it,
 * and DL-08 rates the cost of getting this wrong as high.
 *
 * The rule is applied at both doors, and both are tested here:
 *
 *   - **minting** — `mintReviewGraded` writes `grade: "again"` into the event
 *     itself, so the log records the authoritative grade and no consumer has to
 *     re-derive it (ADR-002: "forces grade `again` regardless of the submitted
 *     grade");
 *   - **admission** — `admitToScheduler` corrects again, so a `ReviewGraded`
 *     that reached the log some other way (a fixture, an import, a future
 *     adapter) is corrected on its way to FSRS too.
 *
 * `revealedBeforeRecall: true` survives on the event, which is what records
 * that the grade was forced.
 */

import { describe, expect, it } from 'vitest';

import { createDeterministicContext, mintReviewGraded } from '../../src/index.ts';
import { T, decisionOf, learnableLog, memoryStateOf, review, run } from '../support/wp06.ts';

const context = () =>
  createDeterministicContext({ instants: T.review1, idPrefix: 't06-', seed: 1 });

describe('T-06: reveal-before-recall grades Again', () => {
  it('minting forces the grade to again and keeps the reveal on the record', () => {
    const event = mintReviewGraded(
      context(),
      {
        contractId: 'contract-reading',
        grade: 'good',
        latencyMs: 9100,
        hintsUsed: 0,
        revealedBeforeRecall: true,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:reveal:1' },
    );

    expect(event.grade).toBe('again');
    expect(event.revealedBeforeRecall).toBe(true);
    expect(event.tier).toBe('A');
  });

  it('minting leaves an honest grade alone', () => {
    const event = mintReviewGraded(
      context(),
      {
        contractId: 'contract-reading',
        grade: 'good',
        latencyMs: 3200,
        hintsUsed: 0,
        revealedBeforeRecall: false,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:honest:1' },
    );

    expect(event.grade).toBe('good');
  });

  it('an easy submitted after a reveal does not keep its confirmation', () => {
    const event = mintReviewGraded(
      context(),
      {
        contractId: 'contract-reading',
        grade: 'easy',
        userConfirmedEasy: true,
        latencyMs: 1200,
        hintsUsed: 0,
        revealedBeforeRecall: true,
        probeContext: 'standalone',
      },
      { idempotencyKey: 'review:reveal-easy:1' },
    );

    expect(event.grade).toBe('again');
    // A confirmation of a grade that no longer exists is not evidence of
    // anything, and `exactOptionalPropertyTypes` keeps "absent" distinguishable
    // from "present and undefined".
    expect('userConfirmedEasy' in event).toBe(false);
  });

  it('admission corrects a revealed review that reached the log some other way', () => {
    // Built raw, bypassing the mint path entirely — this is the import/fixture
    // case the second door exists for.
    const state = run([
      ...learnableLog(),
      review(
        { eventId: 'ev-revealed', at: T.review1, contractId: 'contract-reading', grade: 'good' },
        { revealedBeforeRecall: true },
      ),
    ]);

    const decision = decisionOf(state, 'ev-revealed');
    expect(decision).toMatchObject({
      admitted: true,
      effectiveGrade: 'again',
      forcedByReveal: true,
    });
  });

  it('a forced again schedules exactly like an honest again', () => {
    const forced = run([
      ...learnableLog(),
      review(
        { eventId: 'ev-review', at: T.review1, contractId: 'contract-reading', grade: 'good' },
        { revealedBeforeRecall: true },
      ),
    ]);
    const honest = run([
      ...learnableLog(),
      review({
        eventId: 'ev-review',
        at: T.review1,
        contractId: 'contract-reading',
        grade: 'again',
      }),
    ]);

    expect(JSON.stringify(memoryStateOf(forced, 'contract-reading'))).toBe(
      JSON.stringify(memoryStateOf(honest, 'contract-reading')),
    );
  });

  it('and not like the good it was submitted as', () => {
    const forced = run([
      ...learnableLog(),
      review(
        { eventId: 'ev-review', at: T.review1, contractId: 'contract-reading', grade: 'good' },
        { revealedBeforeRecall: true },
      ),
    ]);
    const believed = run([
      ...learnableLog(),
      review({
        eventId: 'ev-review',
        at: T.review1,
        contractId: 'contract-reading',
        grade: 'good',
      }),
    ]);

    const forcedState = memoryStateOf(forced, 'contract-reading');
    const believedState = memoryStateOf(believed, 'contract-reading');
    expect(forcedState?.stability).not.toBe(believedState?.stability);
    expect(forcedState?.difficulty).toBeGreaterThan(believedState?.difficulty ?? 0);
  });
});
