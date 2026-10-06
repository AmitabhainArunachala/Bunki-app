/** The A2 monthly truth surface: records stay separate by capability and authority. */

import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  availableMonthlyTruthMonths,
  deriveMonthlyTruth,
  isMonthId,
  type MonthId,
  type MonthlyAiSignal,
  type MonthlyCapabilityLens,
  type MonthlyCapabilitySupport,
  type MonthlyExposureSignal,
  type MonthlyImportSignal,
  type MonthlyLookupSignal,
  type MonthlyRecordedRetrievalClaim,
  type MonthlySelfReportSignal,
  type MonthlyTruth,
} from '@bunki/domain';

import { useAppSnapshot, useAppStore } from '../state/app-context.tsx';
import { ChipButton } from '../ui/primitives.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

export const MONTHLY_CAPABILITY_COPY = {
  recognition: {
    title: 'Recognition',
    note: 'Form to meaning with a choice response.',
  },
  meaning_recall: {
    title: 'Meaning recall',
    note: 'Form to meaning with a text or free response.',
  },
  production: {
    title: 'Production',
    note: 'Meaning to production, with observations kept distinct from retrieval claims.',
  },
  listening: {
    title: 'Listening',
    note: 'Audio cue to meaning.',
  },
  kanji_reading: {
    title: 'Kanji reading',
    note: 'Unmeasured until a component says whether its orthography target is kanji or a lexeme.',
  },
  writing: {
    title: 'Writing',
    note: 'Unmeasured because the v1 contract vocabulary has no writing retrieval skill.',
  },
  grammar_discrimination: {
    title: 'Grammar discrimination',
    note: 'Unmeasured until a discrimination target says whether it is grammar or lexical.',
  },
} as const;

export const MONTHLY_SIGNAL_COPY = {
  exposure: {
    marker: 'E',
    title: 'Exposure-only records',
    note: 'Exposure never supplies a retrieval grade. Its source link is unresolved in v1.',
  },
  selfReport: {
    marker: '?',
    title: 'Self-report records',
    note: 'A learner-marked uncertainty is diagnostic, not a retrieval result.',
  },
  lookup: {
    marker: '↗',
    title: 'Lookup-friction records',
    note: 'A lookup records friction and context; it does not say whether recall succeeded.',
  },
  ai: {
    marker: 'AI',
    title: 'AI candidate and note records',
    note: 'Generated candidates and accepted notes remain generated content, not evidence.',
  },
  import: {
    marker: 'I',
    title: 'Imported encounter records',
    note: 'An imported encounter does not import an earlier learning history.',
  },
} as const;

interface MonthlyTruthScreenProps {
  readonly requestedMonth?: string | undefined;
  readonly onSelectMonth: (month: MonthId) => void;
}

type ProjectionResult =
  | {
      readonly kind: 'ready';
      readonly availableMonths: readonly MonthId[];
      readonly truth: MonthlyTruth;
    }
  | { readonly kind: 'error'; readonly message: string };

/** Uses UTC only; the pure domain projection itself never reads this clock. */
function currentUtcMonth(): MonthId {
  const candidate = new Date().toISOString().slice(0, 7);
  if (!isMonthId(candidate)) throw new Error('The runtime did not produce a UTC month.');
  return candidate;
}

export function MonthlyTruthScreen({
  requestedMonth,
  onSelectMonth,
}: MonthlyTruthScreenProps): ReactNode {
  const theme = useTheme();
  const store = useAppStore();
  const snapshot = useAppSnapshot();

  const result = useMemo<ProjectionResult>(() => {
    try {
      if (requestedMonth !== undefined && !isMonthId(requestedMonth)) {
        return {
          kind: 'error',
          message: `“${requestedMonth}” is not a UTC month. Use YYYY-MM.`,
        };
      }
      const events = store.readAll();
      const recordedMonths = availableMonthlyTruthMonths(events);
      const selected = requestedMonth ?? recordedMonths[0] ?? currentUtcMonth();
      if (!isMonthId(selected)) {
        return { kind: 'error', message: 'The selected month is not a UTC month.' };
      }
      return {
        kind: 'ready',
        availableMonths: [...new Set([selected, ...recordedMonths])],
        truth: deriveMonthlyTruth(events, selected),
      };
    } catch (cause) {
      return {
        kind: 'error',
        message:
          cause instanceof Error ? cause.message : 'The monthly record could not be projected.',
      };
    }
    // `snapshot.revision` is the raw log's change token.
  }, [requestedMonth, snapshot.revision, store]);

  if (result.kind === 'error') {
    return (
      <ScreenShell
        subtitle="Projection stopped without guessing at malformed or unsupported history."
        testID="screen-monthly-truth"
        title="Monthly truth"
      >
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.notice,
            { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
          ]}
          testID="monthly-error"
        >
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {result.message}
          </Text>
        </View>
      </ScreenShell>
    );
  }

  const { truth } = result;
  return (
    <ScreenShell
      lede={
        <View
          style={[
            styles.notice,
            { backgroundColor: theme.color.vermilionSoft, borderColor: theme.color.vermilion },
          ]}
          testID="monthly-method-no-scalar"
        >
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            These are separate records, not one ability number. No row is added to, averaged with,
            or ranked against another. Exposure, self-report, lookup, AI, and import records remain
            outside retrieval claims.
          </Text>
        </View>
      }
      subtitle={`${truth.month} · UTC event time · current full-log corrections`}
      testID="screen-monthly-truth"
      title="Monthly truth"
    >
      <View style={styles.monthPicker} testID="monthly-month-picker">
        <Text
          accessibilityRole="header"
          style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        >
          Recorded UTC months
        </Text>
        <View style={styles.monthChoices}>
          {result.availableMonths.map((month) => (
            <ChipButton
              accessibilityHint={`Shows only records whose event time falls in ${month} UTC.`}
              accessibilityLabel={`Show monthly truth for ${month}`}
              key={month}
              label={month}
              onPress={() => onSelectMonth(month)}
              selected={month === truth.month}
              testID={`monthly-month-${month}`}
            />
          ))}
        </View>
      </View>

      {truth.capabilities.map((lens) => (
        <CapabilityRow key={lens.id} lens={lens} />
      ))}

      <SourceExposureRow truth={truth} />

      <View
        style={[styles.limitations, { borderColor: theme.color.ruleStrong }]}
        testID="monthly-unresolved"
      >
        <Text
          accessibilityRole="header"
          style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        >
          Unresolved links
        </Text>
        {truth.unresolvedRecords.length === 0 ? (
          <MutedText>No unresolved event-to-capability links in this UTC month.</MutedText>
        ) : (
          truth.unresolvedRecords.map((record) => (
            <Text
              key={record.eventId}
              style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              testID={`monthly-unresolved-${record.eventId}`}
            >
              {record.occurredAt} · {record.kind} · {record.reason} · capability unmeasured
            </Text>
          ))
        )}
      </View>
    </ScreenShell>
  );
}

function CapabilityRow({ lens }: { readonly lens: MonthlyCapabilityLens }): ReactNode {
  const theme = useTheme();
  const copy = MONTHLY_CAPABILITY_COPY[lens.id];
  const empty =
    lens.contracts.length === 0 &&
    lens.retrievalClaims.length === 0 &&
    lens.productionObservations.length === 0;

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
      ]}
      testID={`monthly-row-${lens.id}`}
    >
      <Text
        accessibilityRole="header"
        style={[styles.rowTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        {copy.title}
      </Text>
      <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {supportNote(lens.support, copy.note)}
      </Text>

      {lens.contracts.map((contract) => (
        <RecordBlock key={contract.contractId} testID={`monthly-contract-${contract.contractId}`}>
          <Text style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            Contract · {contract.skill} · {contract.cueModality} → {contract.responseModality}
          </Text>
          <MutedText>
            Target component reference: {contract.targetComponentId}. Entity kind is not inferred.
          </MutedText>
          <MutedText>
            {contract.lineage.kind === 'bound'
              ? `Bound source: ${contract.lineage.sourceRef.sourceId} · ${contract.lineage.sourceRef.kind}${contract.lineage.sourceRef.locator === undefined ? '' : ` · ${contract.lineage.sourceRef.locator}`}`
              : `Source lineage unresolved: ${contract.lineage.reason}`}
          </MutedText>
        </RecordBlock>
      ))}

      {lens.retrievalClaims.map((claim) => (
        <RetrievalClaim key={claim.eventId} claim={claim} />
      ))}

      {lens.productionObservations.map((observation) => (
        <RecordBlock
          key={observation.eventId}
          testID={`monthly-production-observation-${observation.eventId}`}
        >
          <Text style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            Production observation · {observation.occurredAt} · tier {observation.evidenceTier}
          </Text>
          <MutedText>
            Conservative observation only; it is not a retrieval result and does not update this row
            by itself.
          </MutedText>
        </RecordBlock>
      ))}

      {empty ? <MutedText>No classifiable records in this UTC month.</MutedText> : null}
    </View>
  );
}

function RetrievalClaim({ claim }: { readonly claim: MonthlyRecordedRetrievalClaim }): ReactNode {
  const theme = useTheme();
  const gate =
    claim.gate.kind === 'admitted_by_replay_gate'
      ? `Replay gate admitted the recorded grade as ${claim.gate.effectiveGrade}${claim.gate.forcedByReveal ? ' after reveal forced Again' : ''}.`
      : `Replay gate rejected the record: ${claim.gate.reason}.`;

  return (
    <RecordBlock testID={`monthly-retrieval-claim-${claim.eventId}`}>
      <Text style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        Recorded retrieval claim · {claim.occurredAt} · submitted {claim.submittedGrade}
      </Text>
      <MutedText>{gate}</MutedText>
      <MutedText>
        Recorded claim only. The v1 event carries neither the response nor grader authority, so it
        is not independently verified recall.
      </MutedText>
    </RecordBlock>
  );
}

function supportNote(support: MonthlyCapabilitySupport, classifiableNote: string): string {
  return support.kind === 'classifiable_from_v1_contract'
    ? classifiableNote
    : `${classifiableNote} Reason: ${support.reason}.`;
}

function SourceExposureRow({ truth }: { readonly truth: MonthlyTruth }): ReactNode {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
      ]}
      testID="monthly-row-source_familiarity_exposure"
    >
      <Text
        accessibilityRole="header"
        style={[styles.rowTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        Source familiarity / exposure
      </Text>
      <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        Familiarity is not inferred. Source encounters and exposure-only records are shown as
        occurrences, never retrieval.
      </Text>

      <SignalGroup
        marker="S"
        note="A source encounter says where something entered the log. It does not measure familiarity."
        testID="monthly-source-encounters"
        title="Source encounters"
      >
        {truth.sourceExposure.sourceEncounters.length === 0 ? (
          <MutedText>No source encounters in this UTC month.</MutedText>
        ) : (
          truth.sourceExposure.sourceEncounters.map((record) => (
            <SignalLine
              key={record.eventId}
              text={`${record.occurredAt} · ${record.sourceRef.sourceId} · ${record.sourceRef.kind}${record.sourceRef.locator === undefined ? '' : ` · ${record.sourceRef.locator}`} · familiarity not inferred`}
            />
          ))
        )}
      </SignalGroup>

      <SignalGroupFromCopy kind="exposure">
        {truth.nonRetrievalSignals.exposure.length === 0 ? (
          <MutedText>No exposure-only records in this UTC month.</MutedText>
        ) : (
          truth.nonRetrievalSignals.exposure.map((signal) => (
            <ExposureLine key={signal.eventId} signal={signal} />
          ))
        )}
      </SignalGroupFromCopy>

      <SignalGroupFromCopy kind="selfReport">
        {truth.nonRetrievalSignals.selfReport.length === 0 ? (
          <MutedText>No self-report records in this UTC month.</MutedText>
        ) : (
          truth.nonRetrievalSignals.selfReport.map((signal) => (
            <SelfReportLine key={signal.eventId} signal={signal} />
          ))
        )}
      </SignalGroupFromCopy>

      <SignalGroupFromCopy kind="lookup">
        {truth.nonRetrievalSignals.lookup.length === 0 ? (
          <MutedText>No lookup-friction records in this UTC month.</MutedText>
        ) : (
          truth.nonRetrievalSignals.lookup.map((signal) => (
            <LookupLine key={signal.eventId} signal={signal} />
          ))
        )}
      </SignalGroupFromCopy>

      <SignalGroupFromCopy kind="ai">
        {truth.nonRetrievalSignals.ai.length === 0 ? (
          <MutedText>No AI candidate or note records in this UTC month.</MutedText>
        ) : (
          truth.nonRetrievalSignals.ai.map((signal) => (
            <AiLine key={signal.eventId} signal={signal} />
          ))
        )}
      </SignalGroupFromCopy>

      <SignalGroupFromCopy kind="import">
        {truth.nonRetrievalSignals.import.length === 0 ? (
          <MutedText>No imported encounters in this UTC month.</MutedText>
        ) : (
          truth.nonRetrievalSignals.import.map((signal) => (
            <ImportLine key={signal.eventId} signal={signal} />
          ))
        )}
      </SignalGroupFromCopy>
    </View>
  );
}

type SignalKind = keyof typeof MONTHLY_SIGNAL_COPY;

function SignalGroupFromCopy({
  kind,
  children,
}: {
  readonly kind: SignalKind;
  readonly children: ReactNode;
}): ReactNode {
  const copy = MONTHLY_SIGNAL_COPY[kind];
  return (
    <SignalGroup
      marker={copy.marker}
      note={copy.note}
      testID={`monthly-signal-${kind}`}
      title={copy.title}
    >
      {children}
    </SignalGroup>
  );
}

function SignalGroup({
  marker,
  title,
  note,
  testID,
  children,
}: {
  readonly marker: string;
  readonly title: string;
  readonly note: string;
  readonly testID: string;
  readonly children: ReactNode;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={[styles.signalGroup, { borderColor: theme.color.rule }]} testID={testID}>
      <View style={styles.signalHeading}>
        <Text
          accessibilityElementsHidden
          importantForAccessibility="no"
          style={[
            styles.marker,
            {
              backgroundColor: theme.color.vermilionSoft,
              color: theme.color.vermilion,
              fontFamily: theme.font.sans,
            },
          ]}
        >
          {marker}
        </Text>
        <Text
          accessibilityRole="header"
          style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        >
          {title}
        </Text>
      </View>
      <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {note}
      </Text>
      {children}
    </View>
  );
}

function ExposureLine({ signal }: { readonly signal: MonthlyExposureSignal }): ReactNode {
  return (
    <SignalLine
      text={`${signal.occurredAt} · experience ${signal.experienceId} · source unresolved: exposure event has no source reference`}
    />
  );
}

function SelfReportLine({ signal }: { readonly signal: MonthlySelfReportSignal }): ReactNode {
  return <SignalLine text={`${signal.occurredAt} · uncertainty mark · diagnostic only`} />;
}

function LookupLine({ signal }: { readonly signal: MonthlyLookupSignal }): ReactNode {
  return (
    <SignalLine
      text={`${signal.occurredAt} · ${signal.context} · ${signal.targetRef.targetType}:${signal.targetRef.targetId} · friction only`}
    />
  );
}

function AiLine({ signal }: { readonly signal: MonthlyAiSignal }): ReactNode {
  return (
    <SignalLine
      text={`${signal.occurredAt} · ${signal.action} · ${signal.candidateId} · generated content, not evidence${signal.threadId === null ? ' · thread link unresolved' : ''}`}
    />
  );
}

function ImportLine({ signal }: { readonly signal: MonthlyImportSignal }): ReactNode {
  return (
    <SignalLine
      text={`${signal.occurredAt} · ${signal.sourceRef.sourceId} · encounter only; prior learning history not assumed`}
    />
  );
}

function SignalLine({ text }: { readonly text: string }): ReactNode {
  const theme = useTheme();
  return (
    <Text style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
      {text}
    </Text>
  );
}

function RecordBlock({
  children,
  testID,
}: {
  readonly children: ReactNode;
  readonly testID: string;
}): ReactNode {
  const theme = useTheme();
  return (
    <View
      style={[styles.record, { backgroundColor: theme.color.paper, borderColor: theme.color.rule }]}
      testID={testID}
    >
      {children}
    </View>
  );
}

function MutedText({ children }: { readonly children: ReactNode }): ReactNode {
  const theme = useTheme();
  return (
    <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: TYPE.body, lineHeight: TYPE.body * 1.55 },
  limitations: { borderTopWidth: 1, gap: SPACE.sm, marginTop: SPACE.xl, paddingTop: SPACE.lg },
  marker: {
    borderRadius: 14,
    fontSize: TYPE.meta,
    fontWeight: '700',
    minWidth: 28,
    overflow: 'hidden',
    paddingHorizontal: SPACE.xs,
    paddingVertical: SPACE.xs,
    textAlign: 'center',
  },
  meta: { fontSize: TYPE.meta, lineHeight: TYPE.meta * 1.6 },
  monthChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  monthPicker: { gap: SPACE.sm, marginTop: SPACE.lg },
  note: { fontSize: TYPE.label, lineHeight: TYPE.label * 1.55 },
  notice: { borderLeftWidth: 3, gap: SPACE.sm, padding: SPACE.md },
  record: { borderLeftWidth: 2, gap: SPACE.xs, padding: SPACE.md },
  row: {
    borderWidth: 1,
    gap: SPACE.sm,
    marginTop: SPACE.lg,
    padding: SPACE.lg,
  },
  rowTitle: { fontSize: TYPE.title, fontWeight: '700' },
  signalGroup: { borderTopWidth: 1, gap: SPACE.xs, marginTop: SPACE.md, paddingTop: SPACE.md },
  signalHeading: { alignItems: 'center', flexDirection: 'row', gap: SPACE.sm },
  subheading: { fontSize: TYPE.label, fontWeight: '700', lineHeight: TYPE.label * 1.4 },
});
