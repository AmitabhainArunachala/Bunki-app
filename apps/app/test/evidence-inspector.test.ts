/**
 * The WP-09 closure predicate, at the seam (REQ-UI-06, REQ-LM-06,
 * REQ-ARCH-08, controller §11, §18 WP-09).
 *
 * These run against the store and the pure chain projection rather than a
 * renderer — this project installs no React Native test renderer — so each
 * assertion is about the function the screen calls, not about a mock of it.
 * What that does not cover is stated in the capsule rather than implied here.
 *
 * The four predicate clauses, in order:
 *
 *   1. the chain shows every state change with its cause, tier, versions and
 *      supersession history;
 *   2. a correction produces `EvidenceSuperseded` through the domain command
 *      path and never edits history;
 *   3. the export button's output replays to the live state (T-14) and carries
 *      its licence obligations (T-15);
 *   4. the four states resolve.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  componentIdOfEncounter,
  createDeterministicContext,
  isEvidenceClassEvent,
  replay,
  type DomainContext,
  type EncounterCapturedEvent,
} from '@bunki/domain';
import { prepareExport, appVersionsForBuild, exportLicenceLines } from '@bunki/export';

import {
  buildEvidenceChain,
  describeCorrectable,
  explainRefusal,
  summariseStrength,
  TIER_MEANINGS,
  whyThisAppeared,
  type ChainRow,
} from '../src/screens/evidence-chain.ts';
import { createMemoryAppStore } from '../src/state/memory-store.ts';
import {
  CorrectionRefusedError,
  DEMONSTRATION_CHAIN_NOTE,
  uncertaintyLogNote,
  type AppStore,
} from '../src/state/store.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Source with comments removed, for the one source-level assertion below.
 *
 * Same rule as `screen-contract.test.ts`: the subject has to be nameable in
 * prose to be documented at all, so scanning raw text would make every
 * explanation of the guard a way of satisfying it. Strings and JSX survive.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const SOURCE = { sourceId: 'manual-entry', kind: 'manual', locator: 'capture-screen' } as const;
const PROVENANCE = {
  source: 'user_encounter',
  license: 'CC BY-SA 4.0',
  attribution: 'Fixture attribution that must survive export (T-15)',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

/** Long enough that the demonstration chain never exhausts the scripted clock. */
const INSTANTS = Array.from(
  { length: 40 },
  (_value, index) =>
    `2026-07-27T09:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000Z`,
);

const newContext = (): DomainContext =>
  createDeterministicContext({ instants: INSTANTS, idPrefix: 'insp-' });

interface Fixture {
  readonly store: AppStore;
  readonly threadId: string;
}

function seededStore(options: { readonly demonstrate: boolean } = { demonstrate: true }): Fixture {
  const store = createMemoryAppStore({ context: newContext() });
  const ack = store.execute({
    kind: 'capture',
    text: '分岐',
    sourceRef: SOURCE,
    provenance: PROVENANCE,
    uncertainty: 'meaning',
  });
  if (options.demonstrate) {
    store.execute({
      kind: 'seedEvidenceDemonstration',
      threadId: ack.threadId,
      acceptedAnswers: ['branching', 'forking'],
      skill: 'form_to_meaning',
    });
  }
  return { store, threadId: ack.threadId };
}

function chainOf(store: AppStore, threadId: string): ReturnType<typeof buildEvidenceChain> {
  const log = store.readAll();
  const capture = log.find(
    (event): event is EncounterCapturedEvent =>
      event.type === 'EncounterCaptured' && event.threadId === threadId,
  );
  if (capture === undefined) throw new Error('fixture has no capture');
  const thread = store.getSnapshot().threadsById[threadId];
  if (thread === undefined) throw new Error('fixture has no thread');
  return buildEvidenceChain({
    state: store.readDerived(),
    log,
    thread: thread.state,
    displayText: thread.displayText,
    componentId: componentIdOfEncounter(capture),
    uncertaintyMark: thread.uncertainty?.dimension ?? null,
    uncertaintyLogNote: uncertaintyLogNote(thread.uncertainty, {
      kept: thread.state.promotion !== 'captured',
    }),
  });
}

// ---------------------------------------------------------------------------
// 1. The chain
// ---------------------------------------------------------------------------

describe('the chain shows every state change with its cause (REQ-UI-06)', () => {
  it('lists each promotion with the event that caused it', () => {
    const { store, threadId } = seededStore();
    const chain = chainOf(store, threadId);

    expect(chain.stateChanges.map((change) => `${change.from}->${change.to}`)).toEqual([
      'captured->keep',
      'keep->learn',
    ]);
    for (const change of chain.stateChanges) {
      const cause = store.readAll().find((event) => event.eventId === change.causeEventId);
      expect(cause?.type, 'every state change names a real event in the log').toBe(
        'ThreadPromotionChanged',
      );
      expect(change.origin).toBe('user');
    }
  });

  it('records a tier for every evidence-class observation, and none for others', () => {
    const { store, threadId } = seededStore();
    const chain = chainOf(store, threadId);

    const tiers = chain.rows.map((row) => `${row.type}:${String(row.tier)}`);
    expect(tiers).toEqual([
      'ReviewGraded:A',
      'ReviewGraded:A',
      'ReviewGraded:A',
      'ExposureLogged:D',
    ]);
    for (const row of chain.rows) {
      if (row.tier !== null) expect(TIER_MEANINGS[row.tier]).toBeTruthy();
    }
  });

  it('carries the versions the log records and nothing it does not', () => {
    const { store, threadId } = seededStore();
    const labels = chainOf(store, threadId).versions.map((version) => version.label);

    expect(labels).toContain('Prompt family version');
    expect(labels).toContain('Contract version');
    expect(labels).toContain('Event schema version');
    // No AI candidate was attached and no rubric was used, so neither appears.
    expect(labels).not.toContain('AI model');
    expect(labels).not.toContain('Rubric');
  });

  it('shows the gate’s verdict on every observation, admitted or not', () => {
    const { store, threadId } = seededStore();
    const chain = chainOf(store, threadId);

    const verdicts = chain.rows.map((row) => row.decision?.admitted);
    // The plain `good` counts. The revealed `easy` also counts — but as the
    // `again` the reveal rule forced, not as the `easy` that was submitted.
    // The unconfirmed `easy` and the tier-D exposure are refused.
    expect(verdicts).toEqual([true, true, false, false]);
    expect(chain.rows.map((row) => row.decision?.reason)).toEqual([
      null,
      null,
      'easy_requires_user_confirmation',
      'exposure_is_never_retrieval',
    ]);

    const refused = chain.rows.filter((row) => row.decision?.admitted === false);
    for (const row of refused) {
      expect(row.decision?.reason).not.toBeNull();
      expect(explainRefusal(row.decision?.reason ?? null)).not.toBe('');
    }
  });

  it('records the reveal rule’s override rather than the submitted grade (T-06)', () => {
    const { store, threadId } = seededStore();
    const revealed = store
      .readAll()
      .filter((event) => event.type === 'ReviewGraded')
      .find((event) => event.revealedBeforeRecall);

    expect(revealed?.grade, 'the mint rewrites a revealed answer to `again`').toBe('again');

    // The inspector shows the override as an override, not as a plain `again`
    // the learner chose. It reads the *event's* flag, because the gate's
    // `forcedByReveal` is structurally false for anything the mint corrected
    // first — see `ChainRow.revealedBeforeRecall`.
    const row = chainOf(store, threadId).rows.find((entry) => entry.eventId === revealed?.eventId);
    expect(row?.decision?.admitted).toBe(true);
    expect(row?.decision?.effectiveGrade).toBe('again');
    expect(row?.revealedBeforeRecall).toBe(true);

    // The trap this guards: keying the UI off `forcedByReveal` would print
    // nothing here, and the learner would read a forced `again` as their own.
    expect(
      row?.decision?.forcedByReveal,
      'the gate cannot force what the mint already corrected',
    ).toBe(false);
  });

  it('leaves revealedBeforeRecall null on families that do not carry it', () => {
    const { store, threadId } = seededStore();
    const exposure = chainOf(store, threadId).rows.find((row) => row.type === 'ExposureLogged');
    expect(exposure?.revealedBeforeRecall).toBeNull();
  });

  it('has an empty but well-formed chain before anything is observed', () => {
    const { store, threadId } = seededStore({ demonstrate: false });
    const chain = chainOf(store, threadId);

    expect(chain.rows).toEqual([]);
    expect(chain.stateChanges).toEqual([]);
    expect(chain.strength.recordedCount).toBe(0);
    expect(chain.strength.sentence).toContain('No observations yet');
    expect(chain.correctable).toEqual([]);
  });

  /**
   * The default surface is a summary; the chain is behind the disclosure. A
   * correction affordance labelled with a raw event id would put the chain on
   * both sides of that line.
   */
  it('labels the correction affordance in words, not in event ids', () => {
    const { store, threadId } = seededStore();
    const correctable = chainOf(store, threadId).correctable;

    expect(correctable).toHaveLength(4);
    for (const observation of correctable) {
      expect(observation.label).not.toContain(observation.eventId);
      expect(observation.label).toMatch(/counted$/);
    }
    // Every row on this thread was appended by the demonstration button, so no
    // label may claim the learner did anything. The study-produced wording is
    // asserted directly below, where a non-demonstration row can be built.
    expect(correctable[0]?.label).toContain('a demonstration answer');
    expect(correctable[1]?.label).toContain('recorded as revealed first');
    expect(correctable[3]?.label).toContain('a demonstration exposure');
    expect(correctable.map((observation) => observation.counted)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('keeps the study-produced wording for a row no demonstration wrote', () => {
    const row: ChainRow = {
      eventId: 'event-0001',
      type: 'ReviewGraded',
      at: '2026-07-27T09:00:00.000Z',
      tier: 'A',
      contractId: 'contract-0001',
      decision: null,
      superseded: false,
      supersededByEventId: null,
      supersedesEventId: null,
      correctionNote: null,
      correctionReason: null,
      revealedBeforeRecall: false,
      fromDemonstration: false,
    };

    expect(describeCorrectable(row).label).toContain('the answer you gave');
    expect(describeCorrectable({ ...row, type: 'ExposureLogged', tier: 'D' }).label).toContain(
      'meeting it in passing',
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The correction flow
// ---------------------------------------------------------------------------

describe('a correction produces EvidenceSuperseded and never edits history', () => {
  it('appends a correction through the domain command path', () => {
    const { store, threadId } = seededStore();
    const target = chainOf(store, threadId).correctable[0]?.eventId;
    expect(target).toBeDefined();

    const before = store.readAll();
    const ack = store.execute({
      kind: 'correctEvidence',
      supersededEventId: String(target),
      reason: 'misgraded',
      note: 'I had already seen the answer on the previous screen.',
    });

    expect(ack.events).toHaveLength(1);
    const [correction] = ack.events;
    expect(correction?.type).toBe('EvidenceSuperseded');
    expect(isEvidenceClassEvent(correction!)).toBe(true);

    // History is appended to, never rewritten: every prior event is unchanged
    // and still present, in the same order.
    const after = store.readAll();
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after).toHaveLength(before.length + 1);
  });

  it('marks the original superseded in the chain while leaving it in place', () => {
    const { store, threadId } = seededStore();
    const target = String(chainOf(store, threadId).correctable[0]?.eventId);
    store.execute({
      kind: 'correctEvidence',
      supersededEventId: target,
      reason: 'user_correction',
      note: 'That was not a real recall.',
    });

    const chain = chainOf(store, threadId);
    const original = chain.rows.find((row) => row.eventId === target);
    const correction = chain.rows.find((row) => row.supersedesEventId === target);

    expect(original?.superseded).toBe(true);
    expect(original?.supersededByEventId).toBe(correction?.eventId);
    expect(correction?.correctionNote).toBe('That was not a real recall.');
    expect(correction?.correctionReason).toBe('user_correction');
    // The correction is not itself an observation with a tier.
    expect(correction?.tier).toBeNull();
  });

  it('is not automatic mastery — the only event it can produce carries no grade', () => {
    const { store, threadId } = seededStore();
    const target = String(chainOf(store, threadId).correctable[0]?.eventId);
    const [correction] = store.execute({
      kind: 'correctEvidence',
      supersededEventId: target,
      reason: 'data_error',
      note: 'Recorded against the wrong word.',
    }).events;

    expect(correction).toBeDefined();
    expect(Object.keys(correction!)).not.toContain('grade');
    expect(Object.keys(correction!)).not.toContain('tier');
  });

  it('refuses corrections that would produce a log replay cannot read', () => {
    const { store, threadId } = seededStore();
    const target = String(chainOf(store, threadId).correctable[0]?.eventId);

    expect(() =>
      store.execute({
        kind: 'correctEvidence',
        supersededEventId: 'event-that-does-not-exist',
        reason: 'user_correction',
        note: 'x',
      }),
    ).toThrow(CorrectionRefusedError);

    store.execute({
      kind: 'correctEvidence',
      supersededEventId: target,
      reason: 'user_correction',
      note: 'first correction',
    });

    expect(() =>
      store.execute({
        kind: 'correctEvidence',
        supersededEventId: target,
        reason: 'user_correction',
        note: 'second correction',
      }),
    ).toThrow(/already been corrected/);

    // A capture is not an observation.
    const capture = store.readAll().find((event) => event.type === 'EncounterCaptured');
    expect(() =>
      store.execute({
        kind: 'correctEvidence',
        supersededEventId: String(capture?.eventId),
        reason: 'user_correction',
        note: 'x',
      }),
    ).toThrow(/Only recorded observations/);

    expect(() =>
      store.execute({
        kind: 'correctEvidence',
        supersededEventId: target,
        reason: 'user_correction',
        note: '   ',
      }),
    ).toThrow(/reason in your own words/);
  });

  it('leaves the corrected log replayable, which is what “never edits history” buys', () => {
    const { store, threadId } = seededStore();
    const target = String(chainOf(store, threadId).correctable[0]?.eventId);
    store.execute({
      kind: 'correctEvidence',
      supersededEventId: target,
      reason: 'misgraded',
      note: 'Wrong on reflection.',
    });

    const state = replay(store.readAll());
    const observation = state.observations.find((row) => row.eventId === target);
    expect(observation?.superseded).toBe(true);
    expect(state.appliedEventCount).toBe(store.readAll().length);
  });
});

// ---------------------------------------------------------------------------
// 3. Export (T-14, T-15) from the UI path
// ---------------------------------------------------------------------------

describe('the export button’s output replays to the live state', () => {
  /** Exactly what `EvidenceInspectorScreen.runExport` does, in order. */
  function runExport(store: AppStore): ReturnType<typeof prepareExport> {
    const ack = store.execute({ kind: 'recordExport', exportVersion: '1' });
    return prepareExport({
      events: store.readAll(),
      generatedAt: ack.acknowledgedAt,
      appVersions: appVersionsForBuild(),
      liveState: store.readDerived(),
    });
  }

  it('passes the replay check and says what that check covers', () => {
    const { store } = seededStore();
    const result = runExport(store);

    expect(result.verification.equal).toBe(true);
    expect(result.verification.badge.status).toBe('pass');
    expect(result.verification.firstDifference).toBeNull();
    expect(result.verification.eventCount).toBe(store.readAll().length);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('contains the record of itself, so the two sides describe one log', () => {
    const { store } = seededStore();
    const result = runExport(store);
    const exportRecords = result.envelope.events.filter((event) => event.type === 'DataExported');
    expect(exportRecords).toHaveLength(1);
  });

  it('still replays after a correction is in the log', () => {
    const { store, threadId } = seededStore();
    store.execute({
      kind: 'correctEvidence',
      supersededEventId: String(chainOf(store, threadId).correctable[0]?.eventId),
      reason: 'misgraded',
      note: 'Corrected before export.',
    });

    expect(runExport(store).verification.equal).toBe(true);
  });

  it('carries the licence obligations of the events it exports (T-15)', () => {
    const { store } = seededStore();
    const lines = exportLicenceLines(runExport(store).envelope);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.license).toBe('CC BY-SA 4.0');
    expect(lines[0]?.attribution).toBe(PROVENANCE.attribution);
    expect(lines[0]?.encounterCount).toBe(1);
  });

  it('names the pinned scheduling engine rather than claiming none is pinned', () => {
    const { store } = seededStore();
    const versions = runExport(store).envelope.appVersions;
    expect(versions.domain).toBe('@bunki/domain@0.0.0');
    expect(versions.fsrs, 'WP-06 landed; `null` would now be a false claim').not.toBeNull();
    expect(versions.schema).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 4. REQ-LM-06's default surface
// ---------------------------------------------------------------------------

describe('the default surface answers why-this without a score (REQ-LM-06)', () => {
  it('never produces a single number for how well anything is known', () => {
    const { store, threadId } = seededStore();
    const chain = chainOf(store, threadId);

    const surface = [chain.whyThis, chain.strength.sentence, ...chain.uncertainties].join(' ');
    expect(surface).not.toMatch(/\d+\s*%/);
    expect(surface).not.toMatch(/\bscore\b/i);
    expect(surface).not.toMatch(/\b\d+\s*(out of|\/)\s*\d+\b/);
    expect(surface).not.toMatch(/\bmastery\b/i);
  });

  it('grounds “why this” in the promotion rung, which is what decides it', () => {
    const { store, threadId } = seededStore({ demonstrate: false });
    expect(chainOf(store, threadId).whyThis).toContain('kept');

    const seeded = seededStore();
    expect(chainOf(seeded.store, seeded.threadId).whyThis).toContain('took');
  });

  it('states the learner’s mark and what the log actually holds about it', () => {
    const { store, threadId } = seededStore();
    const uncertainties = chainOf(store, threadId).uncertainties;

    // [0] is the demonstration disclosure — see the WP-09 repair block below.
    // The learner's own mark follows it.
    expect(uncertainties[1]).toContain('meaning');
    expect(uncertainties.join(' ')).toContain('not exported');
    expect(uncertainties.at(-1)).toContain('has not been measured');
  });

  /**
   * The WP-09 repair: provenance belongs on the surface that makes the claim.
   *
   * `DEMONSTRATION_CHAIN_NOTE` is rendered inside the raw chain, which is
   * behind a disclosure control that initialises closed. A learner who never
   * opens it used to read a default surface stating they had answered
   * retrievals a button appended — with the only correction to that statement
   * hidden behind the very disclosure REQ-LM-06 exists to keep the raw chain
   * behind. So each of the four default-surface elements is asserted here
   * separately: a fix that qualified only why-this would leave three lying.
   */
  describe('names the demonstration on the default surface, not only in the chain', () => {
    it('names it in why-this, strength, uncertainty and every correction label', () => {
      const { store, threadId } = seededStore();
      const chain = chainOf(store, threadId);

      expect(chain.whyThis).toContain('demonstration');
      expect(chain.strength.sentence).toContain('demonstration');
      // Leading, ahead of the learner's own mark: it is the entry that says
      // part of this ledger is not a record of them at all.
      expect(chain.uncertainties[0]).toContain('demonstration');
      expect(chain.correctable).not.toHaveLength(0);
      for (const observation of chain.correctable) {
        expect(observation.label).toContain('demonstration');
      }
    });

    it('never claims on that surface that the learner answered anything', () => {
      const { store, threadId } = seededStore();
      const chain = chainOf(store, threadId);
      const surface = [
        chain.whyThis,
        chain.strength.sentence,
        ...chain.uncertainties,
        ...chain.correctable.map((observation) => observation.label),
      ].join(' ');

      expect(surface).not.toContain('answered retrieval');
      expect(surface).not.toContain('the answer you gave');
      expect(surface).not.toContain('meeting it in passing');
    });

    it('counts what the button wrote and what the gate let count', () => {
      const { store, threadId } = seededStore();
      const { demonstration } = chainOf(store, threadId);

      expect(demonstration.present).toBe(true);
      expect(demonstration.rowCount).toBe(4);
      expect(demonstration.admittedCount).toBe(2);
      expect(demonstration.allAdmittedAreDemonstration).toBe(true);
    });

    it('detects the exposure too, which carries no contract to stamp', () => {
      const { store, threadId } = seededStore();
      const exposure = chainOf(store, threadId).rows.find((row) => row.type === 'ExposureLogged');

      expect(exposure?.fromDemonstration).toBe(true);
    });

    it('says nothing about a demonstration on a chain that has none', () => {
      const { store, threadId } = seededStore({ demonstrate: false });
      const chain = chainOf(store, threadId);
      const surface = [chain.whyThis, chain.strength.sentence, ...chain.uncertainties].join(' ');

      expect(chain.demonstration.present).toBe(false);
      expect(surface).not.toContain('demonstration');
    });
  });

  it('describes strength by counting, and says when nothing counted', () => {
    const none: readonly ChainRow[] = [];
    expect(summariseStrength(none).sentence).toContain('No observations yet');

    const { store, threadId } = seededStore();
    const strength = chainOf(store, threadId).strength;
    expect(strength.recordedCount).toBe(4);
    expect(strength.admittedCount).toBe(2);
    expect(strength.byTier.A).toBe(3);
    expect(strength.byTier.D).toBe(1);
    expect(strength.sentence).toContain('changed review timing');
  });

  it('refuses to explain a refusal reason it has never heard of', () => {
    expect(explainRefusal('a_reason_from_the_future')).toContain('no explanation');
    expect(explainRefusal(null)).toBe('');
  });

  it('says plainly when a promotion rung has no wording', () => {
    const sentence = whyThisAppeared({ promotion: 'not-a-rung' } as never, [], '分岐');
    expect(sentence).toContain('no wording for');
  });
});

// ---------------------------------------------------------------------------
// The demonstration chain is labelled as one
// ---------------------------------------------------------------------------

describe('the demonstration chain is real and says it is a demonstration', () => {
  it('is idempotent, so a double tap adds one chain', () => {
    const { store, threadId } = seededStore();
    const before = store.readAll().length;
    const ack = store.execute({
      kind: 'seedEvidenceDemonstration',
      threadId,
      acceptedAnswers: ['branching'],
      skill: 'form_to_meaning',
    });
    expect(ack.deduplicated).toBe(true);
    expect(store.readAll()).toHaveLength(before);
  });

  it('mints its evidence through the gate, which stamps the tiers', () => {
    const { store } = seededStore();
    const evidence = store.readAll().filter(isEvidenceClassEvent);
    expect(evidence.map((event) => event.type)).toEqual([
      'ReviewGraded',
      'ReviewGraded',
      'ReviewGraded',
      'ExposureLogged',
    ]);
    // The store passes no tier; every one below was stamped by `src/evidence/`.
    expect(evidence.map((event) => ('tier' in event ? event.tier : null))).toEqual([
      'A',
      'A',
      'A',
      'D',
    ]);
  });

  it('carries a note that stops it reading as the learner’s own history', () => {
    expect(DEMONSTRATION_CHAIN_NOTE).toContain('not by a study session');
    expect(DEMONSTRATION_CHAIN_NOTE).toContain('real events');
  });

  /**
   * Where that note is rendered, not only what it says (WP-10 repair P1).
   *
   * The assertion above is about the sentence. This one is about the condition,
   * and the absence of it is what let the defect ship: the screen rendered
   * `DEMONSTRATION_CHAIN_NOTE` unconditionally inside the Observations section.
   * That read true for as long as the demonstration button was the only writer
   * that could put a row there, and became false the moment WP-10 closed
   * COORD-B8-2 and the sitting's own graded reviews arrived in the durable log —
   * at which point the inspector told a learner who had just answered two
   * reviews that those rows were not a record of them answering anything.
   * REQ-GATE-03 in the second direction, and the inverse of definition of done
   * §2 item 6.
   *
   * This project installs no React Native test renderer, so the render
   * condition is asserted over the source the way `screen-contract.test.ts`
   * asserts what a screen must never contain — comments stripped, so this
   * file's own explanation of the guard cannot satisfy the check. The
   * browser-side half, over the built bundle, is `apps/app/e2e/
   * closed-loop.spec.ts` steps 10 and 12: absent after a real sitting, present
   * after the button.
   */
  it('is disclosed by the screen only when a demonstration row is in the chain', () => {
    const source = stripComments(
      readFileSync(resolve(HERE, '../src/screens/evidence-inspector-screen.tsx'), 'utf8'),
    );

    const marker = 'testID="evidence-demonstration-note"';
    const at = source.indexOf(marker);
    // Still rendered somewhere, and once. Deleting the disclosure would silence
    // the false claim by dropping the true one, and pass a test that only
    // looked for the note's absence on a real sitting.
    expect(at).toBeGreaterThan(-1);
    expect(source.indexOf(marker, at + 1)).toBe(-1);
    expect(source).toContain('{DEMONSTRATION_CHAIN_NOTE}');

    const guard = '{chain.demonstration.present && (';
    const opened = source.lastIndexOf(guard, at);
    expect(opened, 'the note is not inside a chain.demonstration.present guard').toBeGreaterThan(
      -1,
    );
    // And the guard is still open where the note is written: a `)}` between the
    // two would mean it closed around something else on the way past.
    expect(source.slice(opened + guard.length, at)).not.toContain(')}');
  });

  it('refuses a thread it cannot link to a capture', () => {
    const store = createMemoryAppStore({ context: newContext() });
    expect(() =>
      store.execute({
        kind: 'seedEvidenceDemonstration',
        threadId: 'thread-that-does-not-exist',
        acceptedAnswers: ['x'],
        skill: 'form_to_meaning',
      }),
    ).toThrow(/unknown thread/);
  });
});
