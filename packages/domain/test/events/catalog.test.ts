/**
 * The v1 catalog accepts every §6.1 family and rejects the shapes that would
 * quietly weaken it (WP-02).
 */

import { describe, expect, it } from 'vitest';

import {
  DOMAIN_EVENT_TYPES,
  EVENT_SCHEMA_VERSION,
  EVENT_SCHEMAS,
  EVIDENCE_EVENT_TYPES,
  isEvidenceClassEvent,
  parseEvent,
  type DomainEventType,
} from '../../src/index.ts';
import {
  AT,
  contractCreated,
  encounterCaptured,
  oneOfEachFamily,
  reviewGraded,
} from '../support/events.ts';

/**
 * The controller §6.1 table and ADR-002, as a literal list.
 *
 * Written out here rather than imported from the catalog: a test that derived
 * its expectations from the code under test would agree with any catalog,
 * including one missing a family the spec requires.
 */
const SPEC_FAMILIES: readonly string[] = [
  'EncounterCaptured',
  'ThreadPromotionChanged',
  'ContractCreated',
  'ReviewGraded',
  'ProductionObserved',
  'ExposureLogged',
  'LookupFrictionLogged',
  'CandidateAttached',
  'CandidateAcceptedAsNote',
  'EvidenceSuperseded',
  'SessionStarted',
  'SessionClosed',
  'DataExported',
  'ThreadTombstoned',
  'ContentPurged',
];

/**
 * The envelope ADR-002 puts on every event, plus the discriminator.
 *
 * ADR-002's table lists each family's fields "beyond `eventId`, `v`,
 * `occurredAt`, `idempotencyKey`"; `type` is the family name itself, carried as
 * a literal so the union stays discriminated.
 */
const ENVELOPE_FIELDS = ['eventId', 'v', 'occurredAt', 'idempotencyKey', 'type'] as const;

/**
 * ADR-002's frozen v1 field table, transcribed by hand.
 *
 * Like `SPEC_FAMILIES` above, this is written out rather than derived from the
 * catalog — a table read out of the code under test would ratify whatever the
 * code happens to say, which is exactly the drift this is here to catch. `?`
 * marks the fields ADR-002 marks optional.
 *
 * `ContractCreated` is the one row ADR-002 does not spell out inline: it defers
 * to "full REQ-DM-05 field set", so this row is transcribed from REQ-DM-05 in
 * the v2 architecture spec (§4.4) instead. `CandidateAttached.envelope` is the
 * "envelope metadata (§9)" the table names.
 *
 * A field that is genuinely needed later does not get appended here. ADR-002's
 * Consequences clause is explicit: "Adding a field in Phase 0 means a schema
 * version bump with a replay-tested migration, not an optional property quietly
 * appended." This table is the thing that makes that sentence enforceable.
 */
const ADR_002_FIELDS: Readonly<Record<string, readonly string[]>> = {
  EncounterCaptured: [
    'encounterId',
    'threadId',
    'text',
    'span?',
    'sourceRef',
    'provenance',
    'uncertaintyMark?',
  ],
  ThreadPromotionChanged: ['threadId', 'from', 'to', 'origin'],
  ContractCreated: [
    'contractId',
    'contractVersion',
    'targetComponentId',
    'skill',
    'cueModality',
    'responseModality',
    'acceptedAnswers?',
    'rubricId?',
    'rubricVersion?',
    'hintPolicy',
    'revealPolicy',
    'promptFamilyVersion',
  ],
  ReviewGraded: [
    'contractId',
    'grade',
    'latencyMs',
    'hintsUsed',
    'revealedBeforeRecall',
    'userConfirmedEasy?',
    'probeContext',
    'tier',
  ],
  ProductionObserved: ['contractId?', 'rubricId?', 'rubricVersion?', 'elicited', 'tier'],
  ExposureLogged: ['componentIds', 'experienceId', 'tier'],
  LookupFrictionLogged: ['targetRef', 'context'],
  CandidateAttached: ['threadId', 'candidateId', 'envelope', 'status'],
  CandidateAcceptedAsNote: ['candidateId', 'userAction'],
  EvidenceSuperseded: ['supersededEventId', 'reason', 'correction'],
  SessionStarted: ['sessionId', 'budget'],
  SessionClosed: ['sessionId', 'completionState'],
  DataExported: ['exportVersion', 'scope'],
  ThreadTombstoned: ['threadId', 'reason'],
  ContentPurged: ['targetIds', 'tombstoneEventId'],
};

/** `['span?', 'text']` → `['span', 'text']`, keeping the `?` as an optionality flag. */
function splitOptionality(entries: readonly string[]): { name: string; optional: boolean }[] {
  return entries.map((entry) =>
    entry.endsWith('?')
      ? { name: entry.slice(0, -1), optional: true }
      : { name: entry, optional: false },
  );
}

/** What a schema actually accepts, read off its shape: field name → optional?. */
function acceptedFields(type: DomainEventType): { name: string; optional: boolean }[] {
  const schema = EVENT_SCHEMAS[type] as unknown as {
    shape?: Record<string, { isOptional(): boolean }>;
    def?: { shape?: Record<string, { isOptional(): boolean }> };
    _def?: { shape?: Record<string, { isOptional(): boolean }> };
  };
  const shape = schema.shape ?? schema.def?.shape ?? schema._def?.shape;
  if (shape === undefined) throw new Error(`cannot inspect ${type} schema shape`);
  return Object.entries(shape)
    .map(([name, field]) => ({ name, optional: field.isOptional() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

describe('v1 catalog coverage (controller §6.1, ADR-002)', () => {
  it('implements exactly the families the spec lists — no more, no fewer', () => {
    expect([...DOMAIN_EVENT_TYPES].sort()).toEqual([...SPEC_FAMILIES].sort());
  });

  it('covers every family in the hand-written ADR-002 field table', () => {
    // Guards the table below against rotting quietly if a family is added.
    expect(Object.keys(ADR_002_FIELDS).sort()).toEqual([...SPEC_FAMILIES].sort());
  });

  describe('field-for-field conformance to the ADR-002 v1 table', () => {
    SPEC_FAMILIES.forEach((family) => {
      it(`${family} accepts exactly the fields ADR-002 froze, no more`, () => {
        const expected = [
          ...splitOptionality(ENVELOPE_FIELDS as unknown as readonly string[]),
          ...splitOptionality(ADR_002_FIELDS[family] ?? []),
        ].sort((a, b) => a.name.localeCompare(b.name));

        // Name *and* optionality: an extra optional property is the exact drift
        // ADR-002's Consequences clause forbids, and it is invisible to a
        // required-fields-only check.
        expect(acceptedFields(family as DomainEventType)).toEqual(expected);
      });
    });
  });

  it('parses one valid instance of every family', () => {
    const samples = oneOfEachFamily();
    expect(Object.keys(samples).sort()).toEqual([...SPEC_FAMILIES].sort());

    Object.entries(samples).forEach(([type, raw]) => {
      const event = parseEvent(raw);
      expect(event.type).toBe(type);
      expect(event.v).toBe(EVENT_SCHEMA_VERSION);
    });
  });

  it('stamps every family with the envelope the ADR froze', () => {
    Object.values(oneOfEachFamily()).forEach((raw) => {
      const event = parseEvent(raw);
      expect(typeof event.eventId).toBe('string');
      expect(typeof event.idempotencyKey).toBe('string');
      expect(event.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });
});

describe('the evidence partition (REQ-ARCH-04, T-09)', () => {
  it('classifies observations as evidence and AI candidates as not', () => {
    expect([...EVIDENCE_EVENT_TYPES].sort()).toEqual([
      'EvidenceSuperseded',
      'ExposureLogged',
      'LookupFrictionLogged',
      'ProductionObserved',
      'ReviewGraded',
    ]);
  });

  it('keeps Candidate* outside the evidence class, so AI output can never be assignable to it', () => {
    const samples = oneOfEachFamily();
    const attached = parseEvent(samples['CandidateAttached']);
    const accepted = parseEvent(samples['CandidateAcceptedAsNote']);

    expect(isEvidenceClassEvent(attached)).toBe(false);
    expect(isEvidenceClassEvent(accepted)).toBe(false);
    expect(isEvidenceClassEvent(parseEvent(samples['ReviewGraded']))).toBe(true);
  });

  it('leaves no family unclassified', () => {
    const evidence = new Set<string>(EVIDENCE_EVENT_TYPES);
    DOMAIN_EVENT_TYPES.forEach((type: DomainEventType) => {
      expect(typeof evidence.has(type)).toBe('boolean');
    });
    expect(EVIDENCE_EVENT_TYPES.every((type) => DOMAIN_EVENT_TYPES.includes(type))).toBe(true);
  });
});

describe('EncounterCaptured', () => {
  const base = { eventId: 'e1', at: AT.t0, encounterId: 'encounter-1', threadId: 'thread-1' };

  it('accepts a span inside its own text', () => {
    const event = parseEvent(
      encounterCaptured({ ...base, text: '峠を越えた。' }, { span: { start: 0, end: 1 } }),
    );
    expect(event.type).toBe('EncounterCaptured');
  });

  it('rejects a span that runs past the end of the text', () => {
    expect(() =>
      parseEvent(encounterCaptured({ ...base, text: '峠' }, { span: { start: 0, end: 9 } })),
    ).toThrow(/span must lie inside text/);
  });

  it('rejects an empty span — a zero-width highlight selected nothing', () => {
    expect(() => parseEvent(encounterCaptured(base, { span: { start: 3, end: 3 } }))).toThrow(
      /strictly less than/,
    );
  });

  it('requires provenance, because "we never recorded it" must stay distinguishable', () => {
    const raw = encounterCaptured(base);
    delete (raw as Record<string, unknown>)['provenance'];
    expect(() => parseEvent(raw)).toThrow(/provenance/);
  });

  it('requires a license on the provenance record (REQ-SRC-01)', () => {
    expect(() =>
      parseEvent(
        encounterCaptured(base, {
          provenance: {
            source: 'user_encounter',
            modificationStatus: 'unmodified',
            reviewStatus: 'user_reviewed',
          },
        }),
      ),
    ).toThrow(/license/);
  });

  it('rejects an unrecognised extra field rather than ignoring it', () => {
    expect(() =>
      parseEvent(encounterCaptured(base, { futureField: 'from a v2 producer' })),
    ).toThrow(/Unrecognized key/);
  });
});

describe('ContractCreated (REQ-DM-05)', () => {
  const base = { eventId: 'e1', at: AT.t0, contractId: 'contract-1' };

  it('accepts a contract scored by accepted answers', () => {
    expect(parseEvent(contractCreated(base)).type).toBe('ContractCreated');
  });

  it('accepts a contract scored by a versioned rubric', () => {
    const raw = contractCreated(base, { rubricId: 'rubric-1', rubricVersion: '1.0.0' });
    delete (raw as Record<string, unknown>)['acceptedAnswers'];
    expect(parseEvent(raw).type).toBe('ContractCreated');
  });

  it('rejects a contract that claims both — two graders that can disagree', () => {
    expect(() =>
      parseEvent(contractCreated(base, { rubricId: 'rubric-1', rubricVersion: '1.0.0' })),
    ).toThrow(/exactly one/);
  });

  it('rejects a half-specified rubric', () => {
    const raw = contractCreated(base, { rubricId: 'rubric-1' });
    delete (raw as Record<string, unknown>)['acceptedAnswers'];
    expect(() => parseEvent(raw)).toThrow(/exactly one|half-specified/);
  });

  it('rejects a contract scored by neither', () => {
    const raw = contractCreated(base);
    delete (raw as Record<string, unknown>)['acceptedAnswers'];
    expect(() => parseEvent(raw)).toThrow(/exactly one/);
  });
});

describe('evidence-class field shapes', () => {
  it('accepts a ReviewGraded with easy + userConfirmedEasy', () => {
    const event = parseEvent(
      reviewGraded(
        { eventId: 'e1', at: AT.t0, contractId: 'contract-1', grade: 'easy' },
        { userConfirmedEasy: true },
      ),
    );
    expect(event.type).toBe('ReviewGraded');
  });

  it('still *represents* an easy grade with no confirmation — the gate rejects it, the schema records it', () => {
    // REQ-DM-07 is the evidence gate's rule (controller §6.2, WP-06). If the
    // schema made this unrepresentable, the log could not record that a
    // learner pressed easy and the gate turned it down.
    const event = parseEvent(
      reviewGraded({ eventId: 'e1', at: AT.t0, contractId: 'c1', grade: 'easy' }),
    );
    expect(event.type).toBe('ReviewGraded');
    expect('userConfirmedEasy' in event).toBe(false);
  });

  it('rejects userConfirmedEasy: false — the field records a confirmation, not its absence', () => {
    expect(() =>
      parseEvent(
        reviewGraded({ eventId: 'e1', at: AT.t0, contractId: 'c1' }, { userConfirmedEasy: false }),
      ),
    ).toThrow(/userConfirmedEasy/);
  });

  it('pins ReviewGraded to tier A', () => {
    expect(() =>
      parseEvent(reviewGraded({ eventId: 'e1', at: AT.t0, contractId: 'c1' }, { tier: 'B' })),
    ).toThrow(/tier/);
  });

  it('gives LookupFrictionLogged no grade field to fill in (T-07)', () => {
    const samples = oneOfEachFamily();
    const event = parseEvent(samples['LookupFrictionLogged']);
    expect('grade' in event).toBe(false);
    expect('tier' in event).toBe(false);
    expect(() => parseEvent({ ...samples['LookupFrictionLogged'], grade: 'good' })).toThrow(
      /Unrecognized key/,
    );
  });

  it('requires CandidateAcceptedAsNote.userAction to be the literal true (controller §9)', () => {
    const samples = oneOfEachFamily();
    expect(() => parseEvent({ ...samples['CandidateAcceptedAsNote'], userAction: false })).toThrow(
      /userAction/,
    );
  });

  it('requires a candidate envelope to be labeled (T-12)', () => {
    const samples = oneOfEachFamily();
    const raw = samples['CandidateAttached'] as Record<string, unknown>;
    const envelope = raw['envelope'] as Record<string, unknown>;
    expect(() =>
      parseEvent({
        ...raw,
        envelope: { ...envelope, checks: { targetFormPresent: true, isLabeled: false } },
      }),
    ).toThrow(/isLabeled/);
  });
});
