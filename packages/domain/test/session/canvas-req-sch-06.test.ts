/**
 * REQ-SCH-06 on the integration canvas (WP-08; controller §10.5, T-06, T-08).
 *
 * The requirement in one sentence: immersion may replace a standalone review
 * **only** when the immersion experience contains a declared, contract-conforming
 * retrieval of the same memory. Everything else is exposure.
 *
 * That sentence has two failure modes and this file is written against both.
 * Counting a passage sighting as a review inflates a schedule from nothing —
 * the "relabelled exposure → false mastery" risk DL-19 names. Refusing a genuine
 * embedded probe merely wastes it. So the assertions are asymmetric on purpose:
 * every non-conforming shape is checked to produce exposure *and nothing else*,
 * while the conforming shape is checked to produce exactly one tier-A review.
 *
 * The two named in WP-08's closure predicate are here by name:
 *
 *   - a canvas reveal-before-recall grades `Again` (`describe` "a reveal…");
 *   - a passive tap logs exposure only (`describe` "a passive tap…").
 *
 * Both are asserted twice — once on the minted event, and once end-to-end
 * through `replay`, where the evidence gate has the final word about whether
 * anything reached FSRS.
 */

import { describe, expect, it } from 'vitest';

import {
  CANVAS_EXPOSURE_EXPLANATIONS,
  CANVAS_EXPOSURE_REASONS,
  CANVAS_IMMERSION_PROMISE,
  applySessionCommand,
  canvasProbeOffer,
  classifyCanvasInteraction,
  createDeterministicContext,
  createSessionWorkspace,
  recordCanvasInteraction,
  retrievalContractFromEvent,
  type CanvasInteraction,
  type CanvasProbeOffer,
  type ContractCreatedEvent,
  type DomainContext,
  type PromotionState,
} from '../../src/index.ts';
import { COMPONENT, seededLog } from './support.ts';

const FIXED = '2026-07-27T10:00:00.000Z';
const CANVAS = 'pas-bunki-01';
const READING_CONTRACT = 'contract-reading';
/** Another component the passage contains — a word the learner may tap. */
const OTHER_COMPONENT = 'kc:線路';

const newContext = (prefix = 'canvas-'): DomainContext =>
  createDeterministicContext({ instants: FIXED, idPrefix: prefix });

function offerFor(promotion: PromotionState = 'learn'): CanvasProbeOffer {
  const created = seededLog().find(
    (event) => event.type === 'ContractCreated' && event.contractId === READING_CONTRACT,
  ) as ContractCreatedEvent | undefined;
  if (created === undefined) throw new Error('the seeded log is missing the reading contract');
  const result = retrievalContractFromEvent(created);
  return canvasProbeOffer(result.contract, { threadId: 'thread-wp06', promotion });
}

const interaction = (overrides: Partial<CanvasInteraction> = {}): CanvasInteraction => ({
  experienceId: CANVAS,
  kind: 'cloze_attempt',
  componentIds: [COMPONENT],
  declaredContractId: READING_CONTRACT,
  targetWasHidden: true,
  attempt: {
    response: 'ぶんき',
    effort: 'good',
    latencyMs: 3200,
    hintsUsed: 0,
    revealedBeforeRecall: false,
  },
  ...overrides,
});

// ---------------------------------------------------------------------------

describe('a reveal before recall on the promoted target grades Again (T-06)', () => {
  it('without a recorded response is exposure, never an inferred retrieval', () => {
    const classification = classifyCanvasInteraction(
      interaction({ kind: 'reveal', attempt: undefined }),
      offerFor(),
    );
    expect(classification).toMatchObject({ kind: 'exposure', reason: 'no_attempt_recorded' });
  });

  it('mints a tier-A ReviewGraded whose grade is again, whatever was pressed', () => {
    const record = recordCanvasInteraction(
      newContext(),
      // The learner revealed the answer and then claimed `easy`. The reveal is
      // the fact that decides it; the claim is not preserved as a second field,
      // because `revealedBeforeRecall: true` *is* the record that it was forced.
      interaction({
        attempt: {
          response: 'ぶんき',
          effort: 'easy',
          latencyMs: 800,
          hintsUsed: 0,
          revealedBeforeRecall: true,
          userConfirmedEasy: true,
        },
      }),
      offerFor(),
      { idempotencyKey: 'canvas:reveal-then-easy' },
    );

    expect(record.classification.kind).toBe('declared_probe');
    expect(record.event.type).toBe('ReviewGraded');
    if (record.event.type !== 'ReviewGraded') throw new Error('unreachable');
    expect(record.event.grade).toBe('again');
    expect(record.event.tier).toBe('A');
    expect(record.event.probeContext).toBe('embedded');
    expect(record.event.revealedBeforeRecall).toBe(true);
    expect('userConfirmedEasy' in record.event).toBe(false);
  });

  it('a blank reveal writes exposure and cannot reach the scheduler', () => {
    const context = newContext('canvas-e2e-');
    const before = createSessionWorkspace(seededLog());
    const after = applySessionCommand(context, before, {
      kind: 'canvasInteraction',
      interaction: interaction({ kind: 'reveal', attempt: undefined }),
      offer: offerFor(),
    });

    const decision = after.derived.gateDecisions.at(-1);
    expect(decision?.admitted).toBe(false);
    expect(decision?.reason).toBe('exposure_is_never_retrieval');

    const memory = after.derived.memoryStates.find(
      (state) => state.contractId === READING_CONTRACT,
    );
    expect(memory?.admittedReviewCount).toBe(0);
    expect(memory?.phase).toBe('new');
  });

  it('records the override when a non-again grade was submitted after a reveal', () => {
    const context = newContext('canvas-forced-');
    const after = applySessionCommand(context, createSessionWorkspace(seededLog()), {
      kind: 'canvasInteraction',
      interaction: interaction({
        attempt: {
          response: 'ぶんき',
          effort: 'good',
          latencyMs: 900,
          hintsUsed: 0,
          revealedBeforeRecall: true,
        },
      }),
      offer: offerFor(),
    });

    const graded = after.log.at(-1);
    expect(graded?.type).toBe('ReviewGraded');
    if (graded?.type !== 'ReviewGraded') throw new Error('unreachable');
    // The mint already corrected it, so by the time the gate sees the event the
    // submitted grade is gone — which is why `forcedByReveal` is false here and
    // the *evidence* of the forcing is `revealedBeforeRecall` (ADR-002).
    expect(graded.grade).toBe('again');
    expect(graded.revealedBeforeRecall).toBe(true);
  });
});

describe('a passive tap logs exposure only (T-08)', () => {
  it('is classified as exposure, by name', () => {
    const classification = classifyCanvasInteraction(
      interaction({ kind: 'tap', componentIds: [OTHER_COMPONENT], declaredContractId: null }),
      offerFor(),
    );
    expect(classification.kind).toBe('exposure');
    if (classification.kind !== 'exposure') throw new Error('unreachable');
    expect(classification.reason).toBe('not_a_retrieval_attempt');
  });

  it('mints exactly one tier-D ExposureLogged and no graded review', () => {
    const record = recordCanvasInteraction(
      newContext('canvas-tap-'),
      interaction({ kind: 'tap', componentIds: [OTHER_COMPONENT], declaredContractId: null }),
      offerFor(),
      { idempotencyKey: 'canvas:tap' },
    );
    expect(record.event.type).toBe('ExposureLogged');
    if (record.event.type !== 'ExposureLogged') throw new Error('unreachable');
    expect(record.event.tier).toBe('D');
    expect(record.event.componentIds).toEqual([OTHER_COMPONENT]);
    expect(record.event.experienceId).toBe(CANVAS);
    expect('grade' in record.event).toBe(false);
    expect('contractId' in record.event).toBe(false);
  });

  it('changes no memory state, even when it touches the promoted target itself', () => {
    const context = newContext('canvas-tap-e2e-');
    const before = createSessionWorkspace(seededLog());
    const after = applySessionCommand(context, before, {
      kind: 'canvasInteraction',
      // The most dangerous case: the tap is *on* the promoted target, on a
      // canvas that does offer a probe for it. Only the missing declaration and
      // the missing attempt separate it from a review, and that is enough.
      interaction: interaction({ kind: 'tap', declaredContractId: null, attempt: undefined }),
      offer: offerFor(),
    });

    expect(after.log).toHaveLength(before.log.length + 1);
    expect(after.log.at(-1)?.type).toBe('ExposureLogged');
    expect(after.derived.memoryStates).toEqual(before.derived.memoryStates);

    const decision = after.derived.gateDecisions.at(-1);
    expect(decision?.admitted).toBe(false);
    expect(decision?.reason).toBe('exposure_is_never_retrieval');
    expect(decision?.effectiveGrade).toBeNull();
  });

  it('logs smooth reading as exposure too, never as a review', () => {
    const record = recordCanvasInteraction(
      newContext('canvas-read-'),
      interaction({
        kind: 'read',
        componentIds: [COMPONENT, OTHER_COMPONENT],
        declaredContractId: READING_CONTRACT,
        attempt: undefined,
      }),
      offerFor(),
      { idempotencyKey: 'canvas:read' },
    );
    expect(record.event.type).toBe('ExposureLogged');
    expect(record.classification.kind).toBe('exposure');
  });
});

describe('the narrowness of "contract-conforming" (REQ-SCH-06)', () => {
  const cases: readonly {
    readonly name: string;
    readonly interaction: CanvasInteraction;
    readonly offer: CanvasProbeOffer | null;
    readonly reason: (typeof CANVAS_EXPOSURE_REASONS)[number];
  }[] = [
    {
      name: 'an undeclared cloze',
      interaction: interaction({ declaredContractId: null }),
      offer: offerFor(),
      reason: 'no_declared_contract',
    },
    {
      name: 'a canvas that offers no probe',
      interaction: interaction(),
      offer: null,
      reason: 'canvas_offers_no_probe',
    },
    {
      name: 'a declaration naming some other contract',
      interaction: interaction({ declaredContractId: 'contract-meaning' }),
      offer: offerFor(),
      reason: 'declared_contract_is_not_the_offered_one',
    },
    {
      name: 'a probe on a component the interaction never touched',
      interaction: interaction({ componentIds: [OTHER_COMPONENT] }),
      offer: offerFor(),
      reason: 'contract_does_not_test_a_touched_component',
    },
    {
      name: 'a thread the learner only kept',
      interaction: interaction(),
      offer: offerFor('keep'),
      reason: 'promotion_does_not_activate_this_contract',
    },
    {
      name: 'a thread still merely captured',
      interaction: interaction(),
      offer: offerFor('captured'),
      reason: 'promotion_does_not_activate_this_contract',
    },
    {
      name: 'a target that was on screen the whole time',
      interaction: interaction({ targetWasHidden: false }),
      offer: offerFor(),
      reason: 'target_was_already_visible',
    },
    {
      name: 'a cloze with no attempt recorded at all',
      interaction: interaction({ attempt: undefined }),
      offer: offerFor(),
      reason: 'no_attempt_recorded',
    },
    {
      name: 'more hints than the contract budgets',
      interaction: interaction({
        attempt: {
          response: 'ぶんき',
          effort: 'good',
          latencyMs: 4000,
          hintsUsed: 4,
          revealedBeforeRecall: false,
        },
      }),
      offer: offerFor(),
      reason: 'hints_exceeded_the_contract_budget',
    },
    {
      name: 'a reveal on a contract that forbids revealing',
      interaction: interaction({
        attempt: {
          response: 'ぶんき',
          effort: 'good',
          latencyMs: 400,
          hintsUsed: 0,
          revealedBeforeRecall: true,
        },
      }),
      offer: { ...offerFor(), revealAllowed: false },
      reason: 'reveal_not_permitted_by_this_contract',
    },
  ];

  it.each(cases.map((entry) => [entry.name, entry] as const))(
    '%s is exposure, not a review',
    (_name, entry) => {
      const classification = classifyCanvasInteraction(entry.interaction, entry.offer);
      expect(classification.kind).toBe('exposure');
      if (classification.kind !== 'exposure') throw new Error('unreachable');
      expect(classification.reason).toBe(entry.reason);
      expect(classification.detail.length).toBeGreaterThan(20);

      const record = recordCanvasInteraction(
        newContext(`canvas-neg-${entry.reason}-`),
        entry.interaction,
        entry.offer,
        { idempotencyKey: `neg:${entry.reason}` },
      );
      expect(record.event.type).toBe('ExposureLogged');
    },
  );

  it('has an explanation for every reason it can give', () => {
    const seen = new Set(
      cases.map((entry) => entry.reason).concat(['not_a_retrieval_attempt' as const]),
    );
    // Every closed-list reason is either exercised above or is the passive-tap
    // one exercised in its own block. A reason with no test would be a rule
    // nobody checked.
    expect([...CANVAS_EXPOSURE_REASONS].filter((reason) => !seen.has(reason))).toEqual([]);
  });
});

describe('what the canvas may say about itself (REQ-SCH-06, REQ-GATE-03)', () => {
  it('states the promise the requirement wrote, verbatim', () => {
    expect(CANVAS_IMMERSION_PROMISE).toBe(
      'Your immersion contributes encounters and can contain real reviews; the system verifies which is which.',
    );
  });

  it('makes no burden-reduction claim in any string it can render', () => {
    // REQ-SCH-06 marks "embedded probes reduce standalone burden" an untested
    // experiment (H4) and forbids it in product copy until it passes. Every
    // user-facing string this module owns is checked, not just the promise.
    const vocabulary = [
      CANVAS_IMMERSION_PROMISE,
      ...Object.values(CANVAS_EXPOSURE_EXPLANATIONS),
    ].join(' ');
    expect(vocabulary).not.toMatch(/reduce[sd]?\s+(your\s+)?(standalone\s+)?review/i);
    expect(vocabulary).not.toMatch(/instead\s+of\s+reviewing/i);
    expect(vocabulary).not.toMatch(/fewer\s+reviews/i);
  });
});
