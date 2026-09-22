/**
 * The one authority adapter used by the monthly projection.
 *
 * It is deliberately not injectable by an app caller. Authority can only be
 * promoted by a domain event schema and replay rule that carry the required
 * proof; a callback supplied by a screen would be schema shadow state. When an
 * authority-bearing review event lands, this function becomes the closed
 * dispatcher over that domain union. Until then its output has no verified
 * member and legacy ReviewGraded cannot be upgraded.
 */

import type { ReviewGradedEvent } from '../events/catalog.ts';

export interface MonthlyRecordedClaimAuthority {
  readonly kind: 'recorded_claim';
  readonly reason: 'response_and_grader_authority_not_recorded_in_v1';
}

export type MonthlyRetrievalAuthority = MonthlyRecordedClaimAuthority;

const LEGACY_REVIEW_AUTHORITY: MonthlyRecordedClaimAuthority = Object.freeze({
  kind: 'recorded_claim',
  reason: 'response_and_grader_authority_not_recorded_in_v1',
});

/** Adapt the only review schema currently accepted by parseEventLog. */
export function adaptMonthlyReviewAuthority(_event: ReviewGradedEvent): MonthlyRetrievalAuthority {
  return LEGACY_REVIEW_AUTHORITY;
}
