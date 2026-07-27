/**
 * **T-07 — A lookup grades neither `Again` nor success.**
 *
 * Controller §17.1 and §6.2, REQ-DM-07 ("a lookup is a **fluency-friction
 * event**"), DL-04. Both halves matter and both are easy to get wrong in
 * opposite directions: counting a lookup as a failure punishes curiosity, and
 * counting the reading that followed it as a success records a recall that
 * never happened.
 *
 * So a lookup is recorded, is refused by name, and is available as a nomination
 * signal — REQ-DM-09 is explicit that friction may *nominate* and may never
 * promote. `LookupFrictionLogged` carries no grade field at all (ADR-002), so
 * there is nothing for a later reducer to reach for.
 */

import { describe, expect, it } from 'vitest';

import {
  EVENT_SCHEMAS,
  createDeterministicContext,
  mintLookupFrictionLogged,
} from '../../src/index.ts';
import { lookupFrictionLogged } from '../support/events.ts';
import { T, decisionOf, learnableLog, memoryStateOf, run } from '../support/wp06.ts';

describe('T-07: a lookup grades neither Again nor success', () => {
  it('the event has no grade-shaped field to misuse', () => {
    const shape = Object.keys(
      (EVENT_SCHEMAS.LookupFrictionLogged as unknown as { shape: Record<string, unknown> }).shape,
    );
    expect(shape).not.toContain('grade');
    expect(shape).not.toContain('tier');
    expect(shape).not.toContain('contractId');
  });

  it('is recorded in the ledger with no tier and no contract', () => {
    const state = run([
      ...learnableLog(),
      lookupFrictionLogged({ eventId: 'ev-lookup', at: T.review1 }),
    ]);

    const observation = state.observations.find((entry) => entry.eventId === 'ev-lookup');
    expect(observation).toBeDefined();
    expect(observation?.tier).toBeNull();
    expect(observation?.contractId).toBeNull();
  });

  it('is refused by the gate by name', () => {
    const state = run([
      ...learnableLog(),
      lookupFrictionLogged({ eventId: 'ev-lookup', at: T.review1 }),
    ]);

    expect(decisionOf(state, 'ev-lookup')).toMatchObject({
      admitted: false,
      reason: 'lookup_is_friction_not_a_grade',
      effectiveGrade: null,
    });
  });

  it('leaves every schedule exactly where it was — neither worse nor better', () => {
    const withoutLookup = run(learnableLog());
    const withLookup = run([
      ...learnableLog(),
      lookupFrictionLogged({ eventId: 'ev-lookup', at: T.review1 }),
    ]);

    expect(JSON.stringify(withLookup.memoryStates)).toBe(
      JSON.stringify(withoutLookup.memoryStates),
    );
    expect(memoryStateOf(withLookup, 'contract-reading')?.lapses).toBe(0);
    expect(memoryStateOf(withLookup, 'contract-reading')?.reps).toBe(0);
  });

  it('the gate is still the only factory for one', () => {
    const event = mintLookupFrictionLogged(
      createDeterministicContext({ instants: T.review1, idPrefix: 't07-', seed: 1 }),
      { targetRef: { targetType: 'lexeme', targetId: 'lexeme-bunki' }, context: 'reading' },
      { idempotencyKey: 'lookup:1' },
    );

    expect(event.type).toBe('LookupFrictionLogged');
    expect(event.occurredAt).toBe(T.review1);
    expect('grade' in event).toBe(false);
  });
});
