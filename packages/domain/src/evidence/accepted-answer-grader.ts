/** Deterministic accepted-answer grading shared by mint and replay admission. */

import type { RetrievalContract } from '../contracts/retrieval-contract.ts';
import {
  ACCEPTED_ANSWER_GRADING_POLICY_VERSION,
  type ReviewGradedV2Event,
} from '../events/catalog.ts';
import type { Grade, ProbeContext } from '../events/shared.ts';
import type {
  ReviewVerificationFailureReason,
} from '../errors.ts';

export type ReviewEffort = 'hard' | 'good' | 'easy';

export interface VerifiedReviewAttempt {
  readonly response: string;
  readonly effort: ReviewEffort;
  readonly latencyMs: number;
  readonly hintsUsed: number;
  readonly revealedBeforeRecall: boolean;
  readonly userConfirmedEasy?: true | undefined;
  readonly probeContext: ProbeContext;
}

export interface AcceptedAnswerProof {
  readonly grader: 'accepted_answers';
  readonly policyVersion: typeof ACCEPTED_ANSWER_GRADING_POLICY_VERSION;
  readonly contractVersion: number;
  readonly responseModality: RetrievalContract['responseModality'];
  readonly normalizedResponse: string;
  readonly decision: 'correct' | 'incorrect';
  readonly acceptedAnswerIndex: number | null;
}

export type AttemptVerificationResult =
  | {
      readonly verified: true;
      readonly proof: AcceptedAnswerProof;
      readonly grade: Grade;
    }
  | {
      readonly verified: false;
      readonly reason: ReviewVerificationFailureReason;
      readonly detail: string;
    };

/** Pinned by ACCEPTED_ANSWER_GRADING_POLICY_VERSION. */
export function normalizeAcceptedAnswer(value: string): string {
  return value.normalize('NFKC').trim();
}

export function verifyAcceptedAnswerAttempt(
  contract: RetrievalContract,
  attempt: VerifiedReviewAttempt,
): AttemptVerificationResult {
  const normalizedResponse = normalizeAcceptedAnswer(attempt.response);
  if (normalizedResponse.length === 0) {
    return {
      verified: false,
      reason: 'response_blank',
      detail: 'a blank or whitespace-only response proves no retrieval',
    };
  }
  if (contract.responseModality !== 'text' && contract.responseModality !== 'choice') {
    return {
      verified: false,
      reason: 'response_modality_unverified',
      detail: `no versioned grader exists for response modality ${contract.responseModality}`,
    };
  }
  if (contract.scoring.kind !== 'accepted_answers') {
    return {
      verified: false,
      reason: 'grading_method_unverified',
      detail: 'a versioned rubric grader is not implemented by this build',
    };
  }
  if (
    (!contract.hintPolicy.hintsAllowed && attempt.hintsUsed > 0) ||
    attempt.hintsUsed > contract.hintPolicy.maxHints ||
    (!contract.revealPolicy.revealAllowed && attempt.revealedBeforeRecall)
  ) {
    return {
      verified: false,
      reason: 'attempt_violates_contract_policy',
      detail: 'the attempt exceeds the exact contract hint or reveal policy',
    };
  }

  const normalizedAnswers = contract.scoring.acceptedAnswers.map(normalizeAcceptedAnswer);
  if (normalizedAnswers.some((answer) => answer.length === 0)) {
    return {
      verified: false,
      reason: 'grading_method_unverified',
      detail: 'the accepted-answer set normalizes to an empty answer',
    };
  }
  const acceptedAnswerIndex = normalizedAnswers.findIndex(
    (answer) => answer === normalizedResponse,
  );
  const correct = acceptedAnswerIndex >= 0;
  const grade: Grade =
    !correct || attempt.revealedBeforeRecall || attempt.hintsUsed > 0
      ? 'again'
      : attempt.effort;
  return {
    verified: true,
    proof: {
      grader: 'accepted_answers',
      policyVersion: ACCEPTED_ANSWER_GRADING_POLICY_VERSION,
      contractVersion: contract.contractVersion,
      responseModality: contract.responseModality,
      normalizedResponse,
      decision: correct ? 'correct' : 'incorrect',
      acceptedAnswerIndex: correct ? acceptedAnswerIndex : null,
    },
    grade,
  };
}

export type GraderProofFailureReason =
  | ReviewVerificationFailureReason
  | 'contract_version_mismatch'
  | 'grading_policy_mismatch'
  | 'grader_proof_mismatch'
  | 'grade_not_derived_from_proof'
  | 'easy_requires_user_confirmation';

export type GraderProofVerification =
  | { readonly verified: true; readonly effectiveGrade: Grade }
  | {
      readonly verified: false;
      readonly reason: GraderProofFailureReason;
      readonly detail: string;
    };

/** Independently recompute every caller-carried v2 proof field. */
export function verifyReviewGraderProof(
  event: ReviewGradedV2Event,
  contract: RetrievalContract,
): GraderProofVerification {
  if (event.graderProof.contractVersion !== contract.contractVersion) {
    return {
      verified: false,
      reason: 'contract_version_mismatch',
      detail: `proof names contract version ${String(event.graderProof.contractVersion)} but the active exact contract is version ${String(contract.contractVersion)}`,
    };
  }
  if (event.graderProof.policyVersion !== ACCEPTED_ANSWER_GRADING_POLICY_VERSION) {
    return {
      verified: false,
      reason: 'grading_policy_mismatch',
      detail: `unsupported grading policy ${JSON.stringify(event.graderProof.policyVersion)}`,
    };
  }

  const recomputed = verifyAcceptedAnswerAttempt(contract, {
    response: event.response,
    effort: event.effort,
    latencyMs: event.latencyMs,
    hintsUsed: event.hintsUsed,
    revealedBeforeRecall: event.revealedBeforeRecall,
    probeContext: event.probeContext,
    ...(event.userConfirmedEasy === true ? { userConfirmedEasy: true } : {}),
  });
  if (!recomputed.verified) return recomputed;

  const expected = recomputed.proof;
  const observed = event.graderProof;
  if (
    observed.grader !== expected.grader ||
    observed.responseModality !== expected.responseModality ||
    observed.normalizedResponse !== expected.normalizedResponse ||
    observed.decision !== expected.decision ||
    observed.acceptedAnswerIndex !== expected.acceptedAnswerIndex
  ) {
    return {
      verified: false,
      reason: 'grader_proof_mismatch',
      detail: 'the recorded grader proof disagrees with deterministic recomputation',
    };
  }
  if (event.grade !== recomputed.grade) {
    return {
      verified: false,
      reason: 'grade_not_derived_from_proof',
      detail: `recorded grade ${event.grade} does not equal recomputed grade ${recomputed.grade}`,
    };
  }
  if (event.grade === 'easy' && event.userConfirmedEasy !== true) {
    return {
      verified: false,
      reason: 'easy_requires_user_confirmation',
      detail: 'grade "easy" requires an explicit user confirmation',
    };
  }
  return { verified: true, effectiveGrade: recomputed.grade };
}
