/**
 * A generated learner's log leaves and comes back unchanged (lane L1; T-14).
 *
 * `verify-export.test.ts` proves the round trip over a hand-assembled
 * representative log and over one real sitting. Neither is the shape lane L1
 * introduces: thousands of events, hundreds of contracts, corrections that
 * retract admitted reviews, a tombstone and a purge, and two years of instants.
 * A log that size exercises things a nine-event fixture cannot — the
 * supersession pre-pass, the idempotency-key map, the seed-reference index over
 * hundreds of encounters — and it is the log a demonstration actually exports.
 *
 * So this file runs the same check the controller specifies, over the scripted
 * learner: build the envelope, serialise it to bytes, parse the bytes back
 * through the fail-closed parser, replay them, and assert the derived state is
 * byte-identical to the live one. The comparison is canonical bytes rather than
 * structural equality, for the reason `verify.ts` gives: the export *is* bytes.
 *
 * It also asserts the half that keeps the first half from being a tautology:
 * the exported `seedRefs` index announces that this is demonstration data. That
 * is the only labelling that survives leaving the app — a reader who never saw
 * the banner still cannot mistake the file for a person's history.
 */

import {
  canonicalJson,
  generateScriptedLearner,
  MONTH_2,
  MONTH_8,
  replay,
  SCRIPTED_LEARNER_SOURCE_ID,
  type DemoStageScript,
  type DemoTarget,
} from '@bunki/domain';
import { describe, expect, it } from 'vitest';

import {
  buildExportEnvelope,
  EXPORT_VERSION,
  serializeExportEnvelope,
  verifyExportRoundTrip,
} from '../src/index.ts';

/**
 * A synthetic corpus.
 *
 * `@bunki/export` imports `@bunki/domain` and nothing else, which is the
 * package's own rule, and the generator takes its corpus as an argument for
 * exactly this reason. What the app passes — real JMdict entries — is checked
 * in `apps/app/test/`, where the seed is available.
 */
function corpus(size: number): readonly DemoTarget[] {
  return Array.from({ length: size }, (_unused, index) => ({
    key: `lex-${String(index).padStart(4, '0')}`,
    text: `語${String(index).padStart(4, '0')}`,
    reading: `ご${String(index).padStart(4, '0')}`,
    senses: [`meaning ${String(index)}`],
  }));
}

function generate(script: DemoStageScript): ReturnType<typeof generateScriptedLearner> {
  return generateScriptedLearner({
    script,
    corpus: corpus(script.corpusBudget),
    startDay: '2024-01-01T00:00:00.000Z',
    idPrefix: `export-${script.id}`,
    contractIdFor: (target, skill) => `contract-${skill}-${target.key}`,
  });
}

const STAGES: readonly DemoStageScript[] = [MONTH_2, MONTH_8];

describe.each(STAGES.map((script) => [script.id, script] as const))(
  'a %s scripted learner exports and replays back',
  (id, script) => {
    const log = generate(script);
    const liveState = replay(log.events);
    const envelope = buildExportEnvelope({
      events: log.events,
      // From an argument, never a clock — the same rule the envelope states.
      generatedAt: '2026-07-29T00:00:00.000Z',
      appVersions: { domain: '@bunki/domain@0.0.0', fsrs: 'ts-fsrs@5.4.1' },
    });
    const bytes = serializeExportEnvelope(envelope);

    it('replays the exported bytes to the live derived state, byte for byte', () => {
      const raw: unknown = JSON.parse(bytes);
      const result = verifyExportRoundTrip(raw, liveState);
      expect(result.firstDifference, `${id} diverged`).toBeNull();
      expect(result.equal).toBe(true);
      expect(result.eventCount).toBe(log.events.length);
    }, 120_000);

    it('loses nothing on the way out', () => {
      expect(envelope.exportVersion).toBe(EXPORT_VERSION);
      expect(envelope.events).toHaveLength(log.events.length);
      // Every family the generator can emit is in the bytes, not summarised
      // away. A count is not enough: an export that dropped one family and
      // duplicated another would have the same length.
      const exported = new Set(envelope.events.map((event) => event.type));
      const produced = new Set(log.events.map((event) => event.type));
      expect([...exported].sort()).toEqual([...produced].sort());
    });

    it('serialises to the same bytes twice', () => {
      expect(serializeExportEnvelope(envelope)).toBe(bytes);
      expect(canonicalJson(envelope)).toBe(bytes);
    });

    it('announces in the export itself that this is demonstration data', () => {
      const refs = envelope.seedRefs.filter((ref) => ref.sourceId === SCRIPTED_LEARNER_SOURCE_ID);
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(ref.source).toBe(SCRIPTED_LEARNER_SOURCE_ID);
        expect(ref.attribution).toMatch(/does not exist/);
        expect(ref.encounterIds.length).toBeGreaterThan(0);
      }
      // …and nothing in the export claims a provenance the events do not carry.
      expect(envelope.seedRefs.every((ref) => ref.sourceId === SCRIPTED_LEARNER_SOURCE_ID)).toBe(
        true,
      );
    });

    it('carries the sittings, the refusals and the corrections it recorded', () => {
      const types = envelope.events.map((event) => event.type);
      expect(types).toContain('SessionStarted');
      expect(types).toContain('SessionClosed');
      expect(types).toContain('ReviewGraded');
      expect(types).toContain('ExposureLogged');
      expect(types).toContain('EvidenceSuperseded');
      // A refusal is a row in the replayed ledger, not an absence in the log:
      // "why did that one not count" has to be answerable from the bytes alone.
      const refused = liveState.gateDecisions.filter((decision) => !decision.admitted);
      expect(refused.length).toBeGreaterThan(0);
      for (const decision of refused) expect(decision.reason).not.toBeNull();
    });
  },
);
