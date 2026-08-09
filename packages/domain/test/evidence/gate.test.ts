/**
 * The evidence gate, branch by branch (WP-06; controller §6.2).
 *
 * The named mandatory tests (T-02, T-05, T-06, T-07, T-08) each live in their
 * own file and drive the gate through a real replayed log. This suite is the
 * complement: every entry in `GATE_REJECTION_REASONS` reached at least once,
 * plus the type-level and runtime halves of T-09.
 *
 * A gate is a security boundary shaped like a pure function, and the failure
 * mode that matters is a branch nobody exercised — the reason an observation
 * *should* have been refused for, which turns out to be unreachable or to
 * return the wrong verdict. So the coverage assertion at the end of this file
 * is a real assertion, not decoration: it fails if a reason exists that no test
 * in the package produces.
 */

import { describe, expect, it } from 'vitest';

import {
  CandidateEvidenceBoundaryError,
  GATE_REJECTION_REASONS,
  admitToScheduler,
  assertNotCandidate,
  componentIdForTargetKey,
  effectiveGradeOf,
  emptyTargetThreadIndex,
  indexEncounter,
  parseEvent,
  projectContractCreated,
  type ContractCreatedEvent,
  type DomainEvent,
  type EncounterCapturedEvent,
  type EvidenceClassEvent,
  type EvidenceGateContext,
  type GateRejectionReason,
  type ReviewGradedEvent,
  type RetrievalContract,
} from '../../src/index.ts';
import {
  candidateAttached,
  contractCreated,
  dataExported,
  encounterCaptured,
  evidenceSuperseded,
  exposureLogged,
  lookupFrictionLogged,
  productionObserved,
  reviewGraded,
} from '../support/events.ts';
import {
  COMPONENT,
  T,
  TARGET,
  TEXT,
  THREAD,
  capture,
  decisionOf,
  learnableLog,
  review,
  run,
} from '../support/wp06.ts';

const parse = (raw: Record<string, unknown>): DomainEvent => parseEvent(raw);

function contextFrom(options: {
  contracts?: readonly RetrievalContract[];
  invalidContractIds?: readonly string[];
  encounters?: readonly EncounterCapturedEvent[];
  promotion?: Record<string, 'captured' | 'keep' | 'learn' | 'master'>;
  deletedThreadIds?: readonly string[];
  supersededEventIds?: readonly string[];
}): EvidenceGateContext {
  const index = emptyTargetThreadIndex();
  (options.encounters ?? []).forEach((event) => indexEncounter(index, event));
  const contractEvents = (options.contracts ?? []).map((contract) => {
    const scoring =
      contract.scoring.kind === 'accepted_answers'
        ? { acceptedAnswers: [...contract.scoring.acceptedAnswers] }
        : {
            rubricId: contract.scoring.rubricId,
            rubricVersion: contract.scoring.rubricVersion,
          };
    return parse(
      contractCreated(
        {
          eventId: contract.createdByEventId,
          at: contract.createdAt,
          contractId: contract.contractId,
        },
        {
          contractVersion: contract.contractVersion,
          targetComponentId: contract.targetComponentId,
          skill: contract.skill,
          cueModality: contract.cueModality,
          responseModality: contract.responseModality,
          hintPolicy: contract.hintPolicy,
          revealPolicy: contract.revealPolicy,
          promptFamilyVersion: contract.promptFamilyVersion,
          ...scoring,
          ...(contract.scoring.kind === 'rubric' ? { acceptedAnswers: undefined } : {}),
        },
      ),
    );
  });
  return {
    contracts: new Map(
      (options.contracts ?? []).map((contract) => [contract.contractId, contract]),
    ),
    invalidContractIds: new Set(options.invalidContractIds ?? []),
    threadIndex: index,
    promotionByThread: new Map(Object.entries(options.promotion ?? {})),
    deletedThreadIds: new Set(options.deletedThreadIds ?? []),
    supersededEventIds: new Set(options.supersededEventIds ?? []),
    eventLog: [...(options.encounters ?? []), ...contractEvents],
  };
}

const captureEvent = parse(capture()) as EncounterCapturedEvent;

const meaning = projectContractCreated(
  parse(
    contractCreated(
      { eventId: 'c1', at: T.contract, contractId: 'contract-meaning' },
      { targetComponentId: COMPONENT, skill: 'form_to_meaning' },
    ),
  ) as ContractCreatedEvent,
);

const production = projectContractCreated(
  parse(
    contractCreated(
      { eventId: 'c2', at: T.contract, contractId: 'contract-production' },
      { targetComponentId: COMPONENT, skill: 'discrimination' },
    ),
  ) as ContractCreatedEvent,
);

const audio = projectContractCreated(
  parse(
    contractCreated(
      { eventId: 'c-audio', at: T.contract, contractId: 'contract-audio' },
      { targetComponentId: COMPONENT, responseModality: 'audio' },
    ),
  ) as ContractCreatedEvent,
);

const rubricRaw = contractCreated(
  { eventId: 'c-rubric', at: T.contract, contractId: 'contract-rubric' },
  {
    targetComponentId: COMPONENT,
    responseModality: 'text',
    rubricId: 'rubric-text',
    rubricVersion: '1.0.0',
    acceptedAnswers: undefined,
  },
);
const rubric = projectContractCreated(parse(rubricRaw) as ContractCreatedEvent);

const gradedReview = (overrides: Record<string, unknown> = {}): ReviewGradedEvent => {
  const requestedGrade = typeof overrides['grade'] === 'string' ? overrides['grade'] : 'good';
  const { grade: _grade, ...rest } = overrides;
  return parse(
    review(
      {
        eventId: 'r1',
        at: T.review1,
        contractId: 'contract-meaning',
        grade: requestedGrade,
      },
      rest,
    ),
  ) as ReviewGradedEvent;
};

const reviewFor = (
  contractId: string,
  overrides: Record<string, unknown> = {},
): ReviewGradedEvent => {
  const requestedGrade = typeof overrides['grade'] === 'string' ? overrides['grade'] : 'good';
  const { grade: _grade, ...rest } = overrides;
  return parse(
    review({ eventId: `r-${contractId}`, at: T.review1, contractId, grade: requestedGrade }, rest),
  ) as ReviewGradedEvent;
};

const tamperedReview = (overrides: Record<string, unknown>): ReviewGradedEvent =>
  parse({ ...gradedReview(), ...overrides }) as ReviewGradedEvent;

const reasonsSeen = new Set<GateRejectionReason>();

function expectRejection(
  decision: ReturnType<typeof admitToScheduler>,
  reason: GateRejectionReason,
) {
  expect(decision.admitted).toBe(false);
  if (!decision.admitted) {
    expect(decision.reason).toBe(reason);
    expect(decision.detail.length).toBeGreaterThan(20);
    reasonsSeen.add(decision.reason);
  }
}

describe('the gate admits exactly one thing', () => {
  it('a tier-A review of a valid, promotion-active contract', () => {
    const decision = admitToScheduler(
      gradedReview(),
      contextFrom({
        contracts: [meaning],
        encounters: [captureEvent],
        promotion: { [THREAD]: 'learn' },
      }),
    );

    expect(decision).toEqual({
      admitted: true,
      contractId: 'contract-meaning',
      threadId: THREAD,
      effectiveGrade: 'good',
      forcedByReveal: false,
      authority: {
        kind: 'verified_retrieval_v2',
        grader: 'accepted_answers',
        policyVersion: 'accepted_answers:nfkc_trim@1',
        contractVersion: 1,
        sourceBinding: 'exact_origin',
      },
    });
  });
});

describe('every rejection branch', () => {
  const active = {
    contracts: [meaning, production],
    encounters: [captureEvent],
    promotion: { [THREAD]: 'learn' as const },
  };

  it('non-evidence families are refused by name, not by falling through', () => {
    expectRejection(
      admitToScheduler(parse(dataExported({ eventId: 'x', at: T.review1 })), contextFrom(active)),
      'not_evidence_class',
    );
  });

  it('exposure (tier D)', () => {
    expectRejection(
      admitToScheduler(parse(exposureLogged({ eventId: 'x', at: T.review1 })), contextFrom(active)),
      'exposure_is_never_retrieval',
    );
  });

  it('lookup friction', () => {
    expectRejection(
      admitToScheduler(
        parse(lookupFrictionLogged({ eventId: 'x', at: T.review1 })),
        contextFrom(active),
      ),
      'lookup_is_friction_not_a_grade',
    );
  });

  it('production observation (tier B/C)', () => {
    expectRejection(
      admitToScheduler(
        parse(productionObserved({ eventId: 'x', at: T.review1 })),
        contextFrom(active),
      ),
      'production_is_not_tier_a',
    );
  });

  it('a correction is not itself an observation', () => {
    expectRejection(
      admitToScheduler(
        parse(evidenceSuperseded({ eventId: 'x', at: T.review1, supersededEventId: 'r1' })),
        contextFrom(active),
      ),
      'correction_is_not_an_observation',
    );
  });

  it('a superseded review stops scheduling', () => {
    expectRejection(
      admitToScheduler(gradedReview(), contextFrom({ ...active, supersededEventIds: ['r1'] })),
      'evidence_superseded',
    );
  });

  it('legacy v1 self-grades stay visible but have no scheduler authority', () => {
    expectRejection(
      admitToScheduler(
        parse(
          reviewGraded({ eventId: 'legacy-r1', at: T.review1, contractId: 'contract-meaning' }),
        ),
        contextFrom(active),
      ),
      'response_unverified',
    );
  });

  it('a contract that failed REQ-DM-05 validation', () => {
    expectRejection(
      admitToScheduler(
        gradedReview(),
        contextFrom({ ...active, contracts: [], invalidContractIds: ['contract-meaning'] }),
      ),
      'contract_invalid',
    );
  });

  it('a contract this log never created', () => {
    expectRejection(
      admitToScheduler(gradedReview(), contextFrom({ ...active, contracts: [] })),
      'contract_unknown',
    );
  });

  it('a component no capture instantiated', () => {
    expectRejection(
      admitToScheduler(gradedReview(), contextFrom({ ...active, encounters: [] })),
      'component_never_captured',
    );
  });

  it('a component two threads claim — ambiguity fails closed rather than guessing', () => {
    const rival = parse(
      encounterCaptured(
        {
          eventId: 'ev-rival',
          at: T.capture,
          encounterId: 'encounter-2',
          threadId: 'thread-other',
        },
        { text: TEXT, span: { start: 0, end: TARGET.length } },
      ),
    ) as EncounterCapturedEvent;

    expectRejection(
      admitToScheduler(
        gradedReview(),
        contextFrom({
          ...active,
          encounters: [captureEvent, rival],
          promotion: { [THREAD]: 'learn', 'thread-other': 'learn' },
        }),
      ),
      'component_ambiguous',
    );
  });

  it('two same-thread pre-contract origins fail closed rather than inventing lineage', () => {
    const secondOrigin = parse(
      encounterCaptured(
        {
          eventId: 'ev-second-origin',
          at: '2026-07-27T09:00:30.000Z',
          encounterId: 'encounter-second-origin',
          threadId: THREAD,
        },
        { text: TEXT, span: { start: 0, end: TARGET.length } },
      ),
    ) as EncounterCapturedEvent;

    expectRejection(
      admitToScheduler(
        gradedReview(),
        contextFrom({ ...active, encounters: [captureEvent, secondOrigin] }),
      ),
      'source_lineage_unverified',
    );
  });

  it('a thread with no promotion state in the log', () => {
    expectRejection(
      admitToScheduler(gradedReview(), contextFrom({ ...active, promotion: {} })),
      'thread_not_promotion_active',
    );
  });

  it('a skill the current rung does not activate', () => {
    expectRejection(
      admitToScheduler(reviewFor('contract-production'), contextFrom(active)),
      'skill_not_activated_by_promotion',
    );
  });

  it('a tombstoned thread', () => {
    expectRejection(
      admitToScheduler(gradedReview(), contextFrom({ ...active, deletedThreadIds: [THREAD] })),
      'thread_deleted',
    );
  });

  it('an easy nobody confirmed', () => {
    expectRejection(
      admitToScheduler(gradedReview({ grade: 'easy' }), contextFrom(active)),
      'easy_requires_user_confirmation',
    );
  });

  it('a blank response proves no retrieval even when the v2 envelope parses', () => {
    const base = gradedReview();
    if (base.v !== 2) throw new Error('fixture must be ReviewGraded v2');
    expectRejection(
      admitToScheduler(
        tamperedReview({
          response: '   ',
          effort: 'good',
          grade: 'again',
          graderProof: {
            ...base.graderProof,
            normalizedResponse: '   ',
            decision: 'incorrect',
            acceptedAnswerIndex: null,
          },
        }),
        contextFrom(active),
      ),
      'response_blank',
    );
  });

  it('a response modality without a closed grader remains typed-unverified', () => {
    const event = reviewFor('contract-audio');
    if (event.v !== 2) throw new Error('fixture must be ReviewGraded v2');
    expectRejection(
      admitToScheduler(
        tamperedReview({
          contractId: 'contract-audio',
          graderProof: { ...event.graderProof, responseModality: 'audio' },
        }),
        contextFrom({ ...active, contracts: [meaning, audio] }),
      ),
      'response_modality_unverified',
    );
  });

  it('a rubric claim stays unverified until that exact grader exists', () => {
    const event = reviewFor('contract-rubric');
    expectRejection(
      admitToScheduler(event, contextFrom({ ...active, contracts: [meaning, rubric] })),
      'grading_method_unverified',
    );
  });

  it('rejects an attempt outside the exact contract hint policy', () => {
    expectRejection(
      admitToScheduler(gradedReview({ hintsUsed: 2 }), contextFrom(active)),
      'attempt_violates_contract_policy',
    );
  });

  it('rejects a proof tied to another contract version', () => {
    const event = gradedReview();
    if (event.v !== 2) throw new Error('fixture must be ReviewGraded v2');
    expectRejection(
      admitToScheduler(
        tamperedReview({ graderProof: { ...event.graderProof, contractVersion: 99 } }),
        contextFrom(active),
      ),
      'contract_version_mismatch',
    );
  });

  it('rejects an unpinned grading policy', () => {
    const event = gradedReview();
    if (event.v !== 2) throw new Error('fixture must be ReviewGraded v2');
    expectRejection(
      admitToScheduler(
        tamperedReview({ graderProof: { ...event.graderProof, policyVersion: 'future-policy' } }),
        contextFrom(active),
      ),
      'grading_policy_mismatch',
    );
  });

  it('rejects a proof payload that deterministic recomputation contradicts', () => {
    const event = gradedReview();
    if (event.v !== 2) throw new Error('fixture must be ReviewGraded v2');
    expectRejection(
      admitToScheduler(
        tamperedReview({
          graderProof: { ...event.graderProof, normalizedResponse: 'tampered' },
        }),
        contextFrom(active),
      ),
      'grader_proof_mismatch',
    );
  });

  it('rejects a grade that was not derived from the verified response', () => {
    expectRejection(
      admitToScheduler(tamperedReview({ grade: 'hard' }), contextFrom(active)),
      'grade_not_derived_from_proof',
    );
  });

  it('a confirmed easy is admitted', () => {
    const decision = admitToScheduler(
      gradedReview({ grade: 'easy', userConfirmedEasy: true }),
      contextFrom(active),
    );
    expect(decision.admitted).toBe(true);
  });

  it('a tier that is not A, arriving past the parser', () => {
    const smuggled = { ...gradedReview(), tier: 'B' } as unknown as ReviewGradedEvent;
    expectRejection(admitToScheduler(smuggled, contextFrom(active)), 'not_a_graded_review');
  });
});

describe('T-09 (unit half): AI candidates cannot enter the gate', () => {
  it('rejects a CandidateAttached event at runtime', () => {
    const event = parse(
      candidateAttached({
        eventId: 'cand',
        at: T.review1,
        threadId: THREAD,
        candidateId: 'candidate-1',
      }),
    );

    expect(() => admitToScheduler(event, contextFrom({}))).toThrow(CandidateEvidenceBoundaryError);
  });

  it('rejects a candidate payload that crossed a JSON boundary and lost its class', () => {
    const smuggled = JSON.parse(
      JSON.stringify({
        contractId: 'contract-meaning',
        candidateId: 'candidate-9',
        grade: 'easy',
        payload: 'an AI-written gloss',
      }),
    ) as unknown;

    expect(() => assertNotCandidate(smuggled)).toThrow(/AI output is never evidence/);
  });

  it('rejects an AI envelope offered as an observation', () => {
    expect(() =>
      assertNotCandidate({ envelope: { taskClass: 'T2', model: 'some-model' } }),
    ).toThrow(CandidateEvidenceBoundaryError);
  });

  it('rejects a bare prompt-family marker', () => {
    expect(() => assertNotCandidate({ promptFamilyId: 'pf-gloss' })).toThrow(
      CandidateEvidenceBoundaryError,
    );
  });

  it('lets a genuine observation through untouched', () => {
    expect(() => assertNotCandidate(gradedReview())).not.toThrow();
  });

  it('a candidate in a replayed log never produces a gate decision or a schedule', () => {
    const state = run([
      ...learnableLog(),
      candidateAttached({
        eventId: 'ev-candidate',
        at: T.review1,
        threadId: THREAD,
        candidateId: 'candidate-1',
      }),
    ]);

    expect(decisionOf(state, 'ev-candidate')).toBeUndefined();
    expect(state.memoryStates.every((memory) => memory.admittedReviewCount === 0)).toBe(true);
  });

  /**
   * The compile-time half. `tsc -p tsconfig.test.json` runs over this file, so
   * a `@ts-expect-error` that stops being an error is a typecheck failure —
   * which is exactly the regression this guards: someone widening
   * `EVIDENCE_EVENT_TYPES` or the gate's input type until AI output fits.
   */
  it('candidate events are not assignable to the evidence-class union', () => {
    const candidate = parse(
      candidateAttached({
        eventId: 'cand2',
        at: T.review1,
        threadId: THREAD,
        candidateId: 'candidate-2',
      }),
    );

    // @ts-expect-error CandidateAttached is deliberately outside EvidenceClassEvent.
    const asEvidence: EvidenceClassEvent = candidate;
    expect(asEvidence).toBeDefined();

    // @ts-expect-error a candidate id is not a field any evidence family has.
    const asReview: ReviewGradedEvent = { ...gradedReview(), candidateId: 'candidate-2' };
    expect(asReview).toBeDefined();
  });
});

describe('the reveal correction is a function, not a special case', () => {
  it('returns the submitted grade when nothing was revealed', () => {
    expect(effectiveGradeOf(gradedReview({ grade: 'hard' }))).toBe('hard');
  });

  it('returns again for every submitted grade once revealed', () => {
    (['again', 'hard', 'good'] as const).forEach((grade) => {
      expect(effectiveGradeOf(gradedReview({ grade, revealedBeforeRecall: true }))).toBe('again');
    });
    expect(
      effectiveGradeOf(
        gradedReview({ grade: 'easy', userConfirmedEasy: true, revealedBeforeRecall: true }),
      ),
    ).toBe('again');
  });
});

describe('rejection-reason coverage', () => {
  it('every reason in the closed list is produced by a test above', () => {
    const untested = GATE_REJECTION_REASONS.filter((reason) => !reasonsSeen.has(reason));
    expect(untested, 'a rejection reason nothing exercises is a branch nobody has checked').toEqual(
      [],
    );
  });

  it('component identity is derived, not guessed', () => {
    expect(componentIdForTargetKey(TARGET)).toBe(COMPONENT);
  });
});
