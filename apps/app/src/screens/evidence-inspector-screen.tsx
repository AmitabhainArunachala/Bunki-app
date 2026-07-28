/**
 * Screen 6 — evidence inspector (WP-09; controller §10.5, §11, REQ-UI-06,
 * REQ-LM-06, REQ-ARCH-08).
 *
 * The requirement is two screens wearing one name, and keeping them apart is
 * the whole design:
 *
 * > **[REQ-LM-06]** default surface answers *why this appeared*, with evidence
 * > strength, uncertainty, and a correction affordance; expansion shows
 * > evidence events, source/probe, rubric/model version, supersession history
 *
 * So the default view holds four things and no table: why this thread is in
 * front of you, how much evidence there is and of what kind, what the ledger
 * does not settle, and a way to say "that was wrong". The chain — every event,
 * its tier, the gate's verdict on it, the versions it carried, what superseded
 * what — is behind one disclosure control, announced to a screen reader, and
 * off by default.
 *
 * That ordering is not a layout preference. A ledger opened on the raw table
 * teaches the reader that the answer to "why am I seeing this" is a list of
 * event ids, and REQ-LM-06 was conceded specifically to prevent that.
 *
 * ## Three things this screen refuses to do
 *
 * **It never shows one number.** No score, no percentage, no bar. REQ-LM-06
 * says "never one mastery score" and REQ-GATE-03 forbids publishing an
 * unmeasured number; a single figure here would violate both at once. Strength
 * is counted and described in words by `evidence-chain.ts`.
 *
 * **It never edits history.** The correction affordance appends
 * `EvidenceSuperseded` through the store's domain command path. The corrected
 * observation stays exactly where it was, gains a marker, and both rows are
 * shown together — the correction pointing at what it corrects.
 *
 * **It never calls its export "verified" unqualified.** The badge's wording
 * comes from `@bunki/export`'s `prepareExport`, which states what the check
 * establishes and, beside it, what it does not (durability, agreement between
 * two independent projections). A screen cannot upgrade that sentence, because
 * a screen does not write it.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  componentIdOfEncounter,
  SUPERSESSION_REASONS,
  type EncounterCapturedEvent,
} from '@bunki/domain';
import {
  appVersionsForBuild,
  exportLicenceLines,
  exportSummaryLine,
  prepareExport,
  WIDER_VERIFICATION_COMMAND,
  type PreparedExport,
  type StorageDurabilityClaim,
} from '@bunki/export';

import { findLexemeById } from '../data/catalog.ts';
import { useAppSnapshot, useAppStore, useDebugFlags } from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import {
  CorrectionRefusedError,
  DEMONSTRATION_CHAIN_NOTE,
  DURABILITY_NOTES,
  UNCERTAINTY_LABELS,
  uncertaintyLogNote,
  type DurabilityLevel,
  type SupersessionReason,
  type ThreadView,
} from '../state/store.ts';
import { SeedEntryDisclosure } from '../ui/notices.tsx';
import { searchFieldStyle } from '../ui/interactive-styles.ts';
import { AppButton, ChipButton, Hairline, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';
import {
  buildEvidenceChain,
  explainRefusal,
  TIER_MEANINGS,
  type ChainRow,
  type EvidenceChain,
} from './evidence-chain.ts';

/** `DataExported.exportVersion` is a string in the v1 schema (ADR-002). */
const EXPORT_EVENT_VERSION = '1';

/**
 * The store's durability label, in `@bunki/export`'s vocabulary.
 *
 * A total map over `DurabilityLevel` rather than a conditional, so adding a
 * rung to the label without deciding what the export surface should say about it
 * stops compiling here instead of silently falling into a default.
 *
 * The two vocabularies are deliberately different words for deliberately
 * different things: `DurabilityLevel` says where the app's bytes live, and
 * `StorageDurabilityClaim` says what an export screen is entitled to tell a
 * reader about that. This map is the only place they meet.
 */
const STORAGE_DURABILITY_CLAIM: Readonly<Record<DurabilityLevel, StorageDurabilityClaim>> = {
  'in-memory-session-only': 'session-only',
  'device-local': 'survives-reload',
};

export interface EvidenceInspectorScreenProps {
  /** Which thread to inspect; the newest one when absent. */
  readonly threadId?: string | undefined;
  readonly onBack: () => void;
  readonly onOpenDebug: () => void;
}

export function EvidenceInspectorScreen({
  threadId,
  onBack,
  onOpenDebug,
}: EvidenceInspectorScreenProps): ReactNode {
  const theme = useTheme();
  const store = useAppStore();
  const snapshot = useAppSnapshot();
  const flags = useDebugFlags();

  const [expanded, setExpanded] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [correctionReason, setCorrectionReason] = useState<SupersessionReason>('user_correction');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [exported, setExported] = useState<PreparedExport | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const resolve = useCallback((): ThreadView | null => {
    if (threadId !== undefined) return snapshot.threadsById[threadId] ?? null;
    return snapshot.threads[0] ?? null;
  }, [snapshot, threadId]);

  const { state, retry } = useLookup<ThreadView>(resolve, {
    flags,
    emptyMessage: 'Nothing to inspect yet.',
    emptyDetail:
      'The evidence inspector reads your own event log. Capture and keep something on the search screen first, and its chain appears here.',
  });

  const thread = state.kind === 'ready' ? state.data : null;

  /**
   * The chain, rebuilt whenever the log moves.
   *
   * `readDerived()` is the kernel's `replay` — the observations, verdicts and
   * contracts below are its output, not this screen's arithmetic.
   */
  const chain = useMemo<EvidenceChain | null>(() => {
    if (thread === null) return null;
    const log = store.readAll();
    const capture = log.find(
      (event): event is EncounterCapturedEvent =>
        event.type === 'EncounterCaptured' && event.threadId === thread.state.threadId,
    );
    if (capture === undefined) return null;
    return buildEvidenceChain({
      state: store.readDerived(),
      log,
      thread: thread.state,
      displayText: thread.displayText,
      componentId: componentIdOfEncounter(capture),
      uncertaintyMark:
        thread.uncertainty === null ? null : UNCERTAINTY_LABELS[thread.uncertainty.dimension],
      uncertaintyLogNote: uncertaintyLogNote(thread.uncertainty, {
        kept: thread.state.promotion !== 'captured',
        markRecordedInLog: thread.markRecordedInLog,
      }),
    });
    // `snapshot.revision` is the store's change token; the log is not a value
    // React can compare, so the revision is what tells this memo to re-run.
  }, [store, thread, snapshot.revision]);

  const seedDemonstration = useCallback((): void => {
    if (thread === null) return;
    const lexeme = thread.lexemeId === null ? null : findLexemeById(thread.lexemeId);
    store.execute({
      kind: 'seedEvidenceDemonstration',
      threadId: thread.state.threadId,
      // The answer set comes from the seed entry when the capture resolved to
      // one, and from the learner's own text otherwise. Either way it is
      // something already in the log or the dataset — never invented here.
      acceptedAnswers: lexeme === null ? [thread.displayText] : [...lexeme.senses],
      skill: 'form_to_meaning',
    });
  }, [store, thread]);

  const submitCorrection = useCallback((): void => {
    if (correcting === null) return;
    try {
      store.execute({
        kind: 'correctEvidence',
        supersededEventId: correcting,
        reason: correctionReason,
        note: correctionNote,
      });
      setCorrecting(null);
      setCorrectionNote('');
      setCorrectionError(null);
    } catch (cause) {
      setCorrectionError(
        cause instanceof CorrectionRefusedError
          ? cause.message
          : 'The correction could not be recorded.',
      );
    }
  }, [correcting, correctionNote, correctionReason, store]);

  /**
   * Export, then verify (T-14, T-15 from the UI).
   *
   * The `DataExported` record is appended **first**, so the bytes contain the
   * record of themselves and the two sides of the equality check describe the
   * same log. Reading `readAll()` and `readDerived()` after that append is what
   * makes the ordering visible here rather than buried in a helper.
   */
  const runExport = useCallback((): void => {
    try {
      const ack = store.execute({ kind: 'recordExport', exportVersion: EXPORT_EVENT_VERSION });
      const result = prepareExport({
        events: store.readAll(),
        generatedAt: ack.acknowledgedAt,
        // Assembled by `@bunki/export` from the kernel's own pin. The app must
        // not name the engine that produces intervals (REQ-SCH-01), and a
        // screen that built this object would be doing exactly that.
        appVersions: appVersionsForBuild(),
        liveState: store.readDerived(),
        // The store's own label, not a guess and not a constant. `@bunki/export`
        // has no adapter and must not assert a storage fact; this screen has the
        // `AppStore` whose `durability` is exactly what `durabilityFor()`
        // computed from the runtime and whether storage was granted. Before
        // WP-10's repair round the export surface carried a frozen "this build
        // keeps the log in memory for one session" while /debug in the same
        // build said the opposite — see `STORAGE_DURABILITY_CLAIM`.
        storageDurability: STORAGE_DURABILITY_CLAIM[store.durability],
      });
      setExported(result);
      setExportError(null);
    } catch (cause) {
      setExported(null);
      setExportError(cause instanceof Error ? cause.message : 'The export could not be produced.');
    }
  }, [store]);

  if (state.kind === 'loading') {
    return (
      <ScreenShell
        notice={<SeedEntryDisclosure />}
        testID="screen-evidence"
        title="Evidence"
        titleJa="記録"
      >
        <LoadingPanel label="Reading your event log…" />
        {/*
        The About & sources door, in every state of this screen.

        EDRDG §3 clause 2 wants the acknowledgement on "a separate screen
        accessed from a menu", and since Wave D that menu is 記録 rather than a
        sixth tab. A door that only exists once the learner has a thread would
        make the licence obligation conditional on having done some work, which
        is not a shape a licence clause has. So it is rendered in the loading,
        error, empty and populated branches alike.
      */}
        <AppButton
          accessibilityHint="Names every source this build uses, the licence each is used under, and what the app stores locally."
          label="About & sources · 典拠"
          onPress={onOpenDebug}
          testID="evidence-open-debug"
        />
      </ScreenShell>
    );
  }

  if (state.kind === 'error') {
    return (
      <ScreenShell
        notice={<SeedEntryDisclosure />}
        testID="screen-evidence"
        title="Evidence"
        titleJa="記録"
      >
        <ErrorPanel detail={state.detail} message={state.message} onRetry={retry} />
        {/*
        The About & sources door, in every state of this screen.

        EDRDG §3 clause 2 wants the acknowledgement on "a separate screen
        accessed from a menu", and since Wave D that menu is 記録 rather than a
        sixth tab. A door that only exists once the learner has a thread would
        make the licence obligation conditional on having done some work, which
        is not a shape a licence clause has. So it is rendered in the loading,
        error, empty and populated branches alike.
      */}
        <AppButton
          accessibilityHint="Names every source this build uses, the licence each is used under, and what the app stores locally."
          label="About & sources · 典拠"
          onPress={onOpenDebug}
          testID="evidence-open-debug"
        />
        <AppButton
          accessibilityHint="Returns to the map."
          label="Back to 地図 Map"
          onPress={onBack}
        />
      </ScreenShell>
    );
  }

  if (state.kind === 'empty' || thread === null || chain === null) {
    return (
      <ScreenShell
        notice={<SeedEntryDisclosure />}
        testID="screen-evidence"
        title="Evidence"
        titleJa="記録"
      >
        <EmptyPanel
          detail={
            state.kind === 'empty'
              ? state.detail
              : 'This thread has no capture event, so there is no chain to read. That should not happen; it is reported rather than hidden.'
          }
          message={state.kind === 'empty' ? state.message : 'This thread cannot be read.'}
        />
        {/*
        The About & sources door, in every state of this screen.

        EDRDG §3 clause 2 wants the acknowledgement on "a separate screen
        accessed from a menu", and since Wave D that menu is 記録 rather than a
        sixth tab. A door that only exists once the learner has a thread would
        make the licence obligation conditional on having done some work, which
        is not a shape a licence clause has. So it is rendered in the loading,
        error, empty and populated branches alike.
      */}
        <AppButton
          accessibilityHint="Names every source this build uses, the licence each is used under, and what the app stores locally."
          label="About & sources · 典拠"
          onPress={onOpenDebug}
          testID="evidence-open-debug"
        />
        <AppButton
          accessibilityHint="Returns to the map."
          label="Back to 地図 Map"
          onPress={onBack}
        />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      // The chain shows what was asked and what was accepted, and for a thread
      // that resolved to a seed entry the accepted answers *are* JMdict senses
      // (`seedDemonstration` reads them straight off the lexeme). Words from the
      // files on a screen means §3 of the EDRDG statement applies here too — the
      // acknowledgement does not become optional because the surface is an
      // inspector rather than a dictionary page.
      notice={<SeedEntryDisclosure />}
      subtitle="Everything here is read from your own event log. Nothing on this page is inferred."
      testID="screen-evidence"
      title={`Evidence — ${chain.displayText}`}
      titleJa="記録"
    >
      {/* ------------------------------------------- REQ-LM-06 default surface */}
      <Section testID="evidence-why" title="Why this is here">
        <Text
          style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          testID="evidence-why-this"
        >
          {chain.whyThis}
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          Promotion rung: {chain.promotion} · thread {chain.threadId}
        </Text>
      </Section>

      <Section
        note="Counted, not scored. There is deliberately no single number here for how well you know this."
        testID="evidence-strength"
        title="How much evidence there is"
      >
        <Text
          style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          testID="evidence-strength-sentence"
        >
          {chain.strength.sentence}
        </Text>
      </Section>

      <Section testID="evidence-uncertainty" title="What this does not settle">
        {chain.uncertainties.map((line, index) => (
          <Text
            key={line.slice(0, 48) + String(index)}
            style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          >
            • {line}
          </Text>
        ))}
      </Section>

      {/* ------------------------------------------------- correction affordance */}
      <Section
        note="A correction is appended as a new event that names the one it corrects. The original stays in the log, and in the chain below, exactly as it was recorded."
        testID="evidence-correction"
        title="Something here is wrong"
      >
        {chain.correctable.length === 0 ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            There are no uncorrected observations on this thread to correct.
          </Text>
        ) : (
          chain.correctable.map((observation) => (
            <AppButton
              accessibilityHint="Opens a note field for correcting that observation."
              // The exact record stays in the spoken label, so an auditor can
              // still tie a button to a row without the id being the headline.
              accessibilityLabel={`Correct ${observation.label}, recorded as ${observation.eventId}`}
              key={observation.eventId}
              label={
                correcting === observation.eventId
                  ? `Correcting: ${observation.label}`
                  : `Correct: ${observation.label}`
              }
              onPress={() => {
                setCorrecting(correcting === observation.eventId ? null : observation.eventId);
                setCorrectionError(null);
              }}
              testID={`evidence-correct-${observation.eventId}`}
            />
          ))
        )}

        {correcting === null ? null : (
          <View style={styles.correctionForm} testID="evidence-correction-form">
            <Text
              style={[styles.label, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              Why is it wrong?
            </Text>
            <View style={styles.chipRow}>
              {SUPERSESSION_REASONS.map((reason) => (
                <ChipButton
                  accessibilityLabel={`Reason: ${reason.replace(/_/g, ' ')}`}
                  key={reason}
                  label={reason.replace(/_/g, ' ')}
                  onPress={() => setCorrectionReason(reason)}
                  selected={correctionReason === reason}
                  testID={`evidence-reason-${reason}`}
                />
              ))}
            </View>
            <TextInput
              accessibilityLabel="Your note about this correction. It is stored in the event log beside the observation."
              multiline
              onChangeText={setCorrectionNote}
              placeholder="In your own words — what actually happened?"
              placeholderTextColor={theme.color.inkMuted}
              style={[
                searchFieldStyle,
                styles.noteField,
                {
                  backgroundColor: theme.color.raised,
                  borderColor: theme.color.ruleStrong,
                  color: theme.color.ink,
                  fontFamily: theme.font.sans,
                },
              ]}
              testID="evidence-correction-note"
              value={correctionNote}
            />
            {correctionError === null ? null : (
              <ErrorPanel message={correctionError} testID="evidence-correction-error" />
            )}
            <AppButton
              accessibilityHint="Appends a correction event naming the observation above."
              label="Record this correction"
              onPress={submitCorrection}
              testID="evidence-correction-submit"
              variant="primary"
            />
          </View>
        )}
      </Section>

      <Hairline />

      {/* ------------------------------------------------------- the raw chain */}
      <Pressable
        accessibilityHint="Shows or hides every event on this thread, with the verdict recorded for each."
        accessibilityLabel={expanded ? 'Hide the full event chain' : 'Show the full event chain'}
        accessibilityRole="button"
        // `aria-expanded`, not `accessibilityState={{ expanded }}`:
        // react-native-web forwards the first and drops the second entirely
        // (`src/ui/primitives.tsx` has the mechanism and the measurement).
        aria-expanded={expanded}
        onPress={() => setExpanded(!expanded)}
        style={[
          styles.disclosure,
          { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
        ]}
        testID="evidence-disclosure"
      >
        <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {expanded ? '▾' : '▸'} The full chain — {String(chain.rows.length)} recorded observation
          {chain.rows.length === 1 ? '' : 's'} and {String(chain.stateChanges.length)} state change
          {chain.stateChanges.length === 1 ? '' : 's'}
        </Text>
      </Pressable>

      {!expanded ? null : (
        <View accessibilityLiveRegion="polite" testID="evidence-chain">
          <Section testID="evidence-state-changes" title="State changes and their cause">
            {chain.stateChanges.length === 0 ? (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                This thread has not changed promotion state since it was captured.
              </Text>
            ) : (
              chain.stateChanges.map((change) => (
                <Text
                  key={change.causeEventId}
                  style={[styles.mono, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                >
                  {change.at} · {change.from} → {change.to} · caused by {change.causeEventId} ·
                  origin {change.origin}
                </Text>
              ))
            )}
          </Section>

          <Section
            note="Every observation, whether or not it counted. A ledger that showed only what counted could not answer “why did that one not count”."
            testID="evidence-observations"
            title="Observations"
          >
            {chain.rows.length === 0 ? (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                No observations on this thread yet.
              </Text>
            ) : (
              chain.rows.map((row) => <ChainRowView key={row.eventId} row={row} />)
            )}
            {/*
              Only when a demonstration row is actually in this chain.

              The note says these observations were appended by the button below
              it and are "not a record of you answering anything". That was true
              of every chain the inspector could show while COORD-B8-2 was open,
              because the session never reached the durable log and the button
              was the only way to make the Observations list non-empty. WP-10
              closed that seam, so the same unconditional note now tells a
              learner who has just finished a sitting that the rows above — their
              own graded answers — are demonstration output. That is REQ-GATE-03
              in the second direction, and the exact inverse of definition of
              done §2 item 6: not evidence with no gesture behind it, but a
              gesture the app disowns.

              Gated on the chain's own structural fact rather than on a flag the
              screen sets, so the note and the rows it describes cannot disagree:
              `demonstration.present` is derived in `evidence-chain.ts` from the
              `promptFamilyVersion` the button stamps on its contract and the
              `experienceId` prefix it stamps on its exposure — both read off the
              events themselves.
            */}
            {chain.demonstration.present && (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
                testID="evidence-demonstration-note"
              >
                {DEMONSTRATION_CHAIN_NOTE}
              </Text>
            )}
            <AppButton
              accessibilityHint="Appends a demonstration contract and three observations to this thread, through the kernel's own factories."
              label="Add a demonstration chain"
              onPress={seedDemonstration}
              testID="evidence-seed-demonstration"
            />
          </Section>

          <Section
            note="Read from the events themselves. A blank here means the log records no version, not that none existed."
            testID="evidence-versions"
            title="Versions this chain carries"
          >
            {chain.versions.map((version) => (
              <Text
                key={`${version.label}-${version.value}-${version.fromEventId}`}
                style={[styles.mono, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              >
                {version.label}: {version.value} (from {version.fromEventId})
              </Text>
            ))}
          </Section>
        </View>
      )}

      <Hairline />

      {/* ------------------------------------------------------------- export */}
      {/* The scope sentence is "your log", not "this session": WP-10 made the
          log durable, so a session is no longer the boundary of what an export
          contains. The storage half comes from the store's own note rather than
          from a literal here, which is the same rule the capture screen follows
          (P0-CAP-15) and the reason this line cannot drift away from /debug. */}
      <Section
        note={`Complete, versioned, lossless JSON of every event in your log — the same bytes the verification below was run against. ${DURABILITY_NOTES[store.durability]}`}
        testID="evidence-export"
        title="Take your data"
      >
        <AppButton
          accessibilityHint="Builds the export and runs the replay check on the resulting bytes."
          label="Export and verify"
          onPress={runExport}
          testID="evidence-export-button"
          variant="primary"
        />

        {exportError === null ? null : (
          <ErrorPanel
            detail="Nothing was lost — the export is a read of the log, not a move."
            message={exportError}
            testID="evidence-export-error"
          />
        )}

        {exported === null ? (
          <EmptyPanel
            detail="Nothing has been exported in this session yet."
            message="No export yet."
            testID="evidence-export-empty"
          />
        ) : (
          <View style={styles.exportBlock}>
            <View
              accessibilityLabel={`${exported.verification.badge.headline} ${exported.verification.badge.qualifier}`}
              accessibilityLiveRegion="polite"
              accessible
              style={[
                styles.badge,
                {
                  backgroundColor:
                    exported.verification.badge.status === 'pass'
                      ? theme.color.raised
                      : theme.color.vermilionSoft,
                  borderColor:
                    exported.verification.badge.status === 'pass'
                      ? theme.color.ruleStrong
                      : theme.color.vermilion,
                },
              ]}
              testID="evidence-export-badge"
            >
              <Text
                style={[styles.badgeTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              >
                {exported.verification.badge.headline}
              </Text>
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                {exported.verification.badge.qualifier}
              </Text>
            </View>

            <Text style={[styles.mono, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
              {exportSummaryLine(exported.envelope)} · {String(exported.byteLength)} bytes
            </Text>

            <Text
              style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              What that check established
            </Text>
            {exported.verification.checked.map((line) => (
              <Text
                key={line.slice(0, 48)}
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                • {line}
              </Text>
            ))}

            <Text
              style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              What it did not
            </Text>
            {exported.verification.notChecked.map((line) => (
              <Text
                key={line.slice(0, 48)}
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                • {line}
              </Text>
            ))}
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              The wider check runs as `{WIDER_VERIFICATION_COMMAND}`.
            </Text>

            {exported.verification.firstDifference === null ? null : (
              <Text
                style={[styles.mono, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                testID="evidence-export-difference"
              >
                First difference — {exported.verification.firstDifference}
              </Text>
            )}

            <Text
              style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              Licence obligations travelling with this export
            </Text>
            {exportLicenceLines(exported.envelope).length === 0 ? (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                None — no exported event cites a source.
              </Text>
            ) : (
              exportLicenceLines(exported.envelope).map((line) => (
                <Text
                  key={`${line.sourceId}-${line.license}`}
                  style={[styles.mono, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                  testID={`evidence-export-licence-${line.sourceId}`}
                >
                  {line.sourceId} · {line.license}
                  {line.attribution === null ? '' : ` · ${line.attribution}`} ·{' '}
                  {String(line.encounterCount)} encounter
                  {line.encounterCount === 1 ? '' : 's'}
                </Text>
              ))
            )}
          </View>
        )}
      </Section>

      <Hairline />
      {/*
        The About & sources screen, reached from the record (`navigation.ts` §3).

        It used to be a sixth entry in the navigation shell. It is here now
        because 記録 *is* the menu the EDRDG licence statement §3 clause 2 asks
        for — "a separate screen accessed from a menu, such as one labelled
        About, Sources" — and 記録 is a tab on every route, so the About screen is
        one tap from anywhere. The label says About & sources rather than
        Diagnostics because naming it for the diagnostic buffer buried the thing
        the licence is actually about.
      */}
      <AppButton
        accessibilityHint="Names every source this build uses, the licence each is used under, and what the app stores locally."
        label="About & sources · 典拠"
        onPress={onOpenDebug}
        testID="evidence-open-debug"
      />
      <AppButton
        accessibilityHint="Returns to the map."
        label="Back to 地図 Map"
        onPress={onBack}
      />
    </ScreenShell>
  );
}

/**
 * One observation row.
 *
 * A correction and the thing it corrects are both shown, each naming the other,
 * because "supersession history" is a relationship and rendering only one end
 * of it leaves the reader to infer the other.
 */
function ChainRowView({ row }: { readonly row: ChainRow }): ReactNode {
  const theme = useTheme();
  const admitted = row.decision?.admitted === true;

  return (
    <View
      style={[styles.row, { borderColor: theme.color.rule }]}
      testID={`evidence-row-${row.eventId}`}
    >
      <Text style={[styles.mono, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {row.at} · {row.type} · {row.eventId}
      </Text>

      {row.tier === null ? (
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          No tier — this family carries none.
        </Text>
      ) : (
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          Tier {row.tier} — {TIER_MEANINGS[row.tier]}
        </Text>
      )}

      {row.decision === null ? null : (
        <Text
          style={[
            styles.meta,
            {
              color: admitted ? theme.color.ink : theme.color.inkMuted,
              fontFamily: theme.font.sans,
            },
          ]}
          testID={`evidence-verdict-${row.eventId}`}
        >
          {admitted
            ? `Counted. Recorded grade: ${String(row.decision.effectiveGrade)}${row.revealedBeforeRecall === true ? ' — set to “again” because you saw the answer before recalling it, whatever was submitted.' : '.'}`
            : `Not counted — ${explainRefusal(row.decision.reason)}`}
        </Text>
      )}

      {row.supersedesEventId === null ? null : (
        <Text
          style={[styles.meta, { color: theme.color.vermilion, fontFamily: theme.font.sans }]}
          testID={`evidence-supersedes-${row.eventId}`}
        >
          Corrects {row.supersedesEventId} · reason {String(row.correctionReason)} · your note: “
          {String(row.correctionNote)}”
        </Text>
      )}

      {!row.superseded ? null : (
        <Text
          style={[styles.meta, { color: theme.color.vermilion, fontFamily: theme.font.sans }]}
          testID={`evidence-superseded-${row.eventId}`}
        >
          You corrected this. It is still here, unchanged, and superseded by{' '}
          {String(row.supersededByEventId)}.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.6,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  mono: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.7,
  },
  label: {
    fontSize: TYPE.meta,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  subheading: {
    fontSize: TYPE.label,
    fontWeight: '600',
    marginTop: SPACE.md,
  },
  disclosure: {
    borderRadius: 8,
    borderWidth: 1,
    marginTop: SPACE.lg,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACE.xs,
    paddingVertical: SPACE.sm,
  },
  correctionForm: {
    gap: SPACE.sm,
    marginTop: SPACE.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  noteField: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  exportBlock: {
    gap: SPACE.sm,
  },
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  badgeTitle: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
});
