/** A2's explicit, fail-closed seam for future authority-bearing reviews. */

import { describe, expect, it } from 'vitest';

import { adaptMonthlyReviewAuthority, parseEvent } from '../../src/index.ts';
import { reviewGraded } from '../support/events.ts';

describe('adaptMonthlyReviewAuthority', () => {
  it('classifies every accepted v1 ReviewGraded as an unverified recorded claim', () => {
    const event = parseEvent(
      reviewGraded({
        eventId: 'event-authority-v1',
        at: '2026-08-09T00:00:00.000Z',
        contractId: 'contract-authority-v1',
      }),
    );
    if (event.type !== 'ReviewGraded') throw new Error('fixture is not ReviewGraded');

    const authority = adaptMonthlyReviewAuthority(event);

    expect(authority).toEqual({
      kind: 'recorded_claim',
      reason: 'response_and_grader_authority_not_recorded_in_v1',
    });
    expect(Object.isFrozen(authority)).toBe(true);
    expect(Object.values(authority)).not.toContain('verified');
  });

  it('does not accept response or grader shadow fields on the v1 event boundary', () => {
    const forged = reviewGraded(
      {
        eventId: 'event-authority-forged',
        at: '2026-08-09T00:00:00.000Z',
        contractId: 'contract-authority-forged',
      },
      {
        response: 'a response the v1 schema cannot bind',
        graderAuthority: { kind: 'self_asserted' },
      },
    );

    expect(() => parseEvent(forged)).toThrow(/Unrecognized keys|response|graderAuthority/);
  });
});
