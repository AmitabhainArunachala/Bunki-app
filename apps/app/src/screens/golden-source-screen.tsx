/** The real A1 source surface: 静かな朝, anchored at exact 自分. */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { componentIdOfEncounter, type EncounterCapturedEvent } from '@bunki/domain';

import {
  GOLDEN_LOOKUP_ID,
  findGoldenSourceCapture,
  goldenCaptureCommand,
  goldenContractIds,
  goldenLearnCommand,
  goldenLookupCommand,
  goldenSourceStudy,
} from '../data/golden-source.ts';
import { useAppSnapshot, useAppStore } from '../state/app-context.tsx';
import { DURABILITY_NOTES, type ThreadView } from '../state/store.ts';
import { DurabilityNotice, ProvenanceLine, SeedEntryDisclosure } from '../ui/notices.tsx';
import { AppButton, Hairline, Section } from '../ui/primitives.tsx';
import { RubyText } from '../ui/ruby.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { RADIUS, SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

interface FocusableTarget {
  focus?: () => void;
}

export interface GoldenSourceScreenProps {
  readonly focusAnchorId?: string | undefined;
  readonly onBack: () => void;
  readonly onBeginDrill: (threadId: string) => void;
  readonly onInspectEvidence: (threadId: string) => void;
  readonly onOpenWord: (lexemeId: string) => void;
}

interface GoldenProgress {
  readonly exactCapture: EncounterCapturedEvent | null;
  readonly thread: ThreadView | null;
  readonly lookupRecorded: boolean;
  readonly readingContract: boolean;
  readonly meaningContract: boolean;
  readonly admittedReviews: number;
  readonly reintroductions: number;
}

export function GoldenSourceScreen({
  focusAnchorId,
  onBack,
  onBeginDrill,
  onInspectEvidence,
  onOpenWord,
}: GoldenSourceScreenProps): ReactNode {
  const theme = useTheme();
  const store = useAppStore();
  const snapshot = useAppSnapshot();
  const study = goldenSourceStudy();
  const targetRef = useRef<FocusableTarget | null>(null);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [actionNote, setActionNote] = useState<string | null>(null);

  const progress = useMemo<GoldenProgress>(() => {
    const log = store.readAll();
    const exactCapture = findGoldenSourceCapture(log);
    const targetThread =
      exactCapture === null ? null : (snapshot.threadsById[exactCapture.threadId] ?? null);
    const ids = targetThread === null ? null : goldenContractIds(targetThread.state.threadId);
    const readingContract =
      ids !== null &&
      log.some(
        (event) => event.type === 'ContractCreated' && event.contractId === ids.reading.contractId,
      );
    const meaningContract =
      ids !== null &&
      log.some(
        (event) => event.type === 'ContractCreated' && event.contractId === ids.meaning.contractId,
      );
    const contractIds = new Set(
      ids === null ? [] : [ids.reading.contractId, ids.meaning.contractId],
    );
    const decisions = new Map(
      store.readDerived().gateDecisions.map((decision) => [decision.eventId, decision]),
    );
    const admittedReviews = log.filter(
      (event) =>
        event.type === 'ReviewGraded' &&
        contractIds.has(event.contractId) &&
        decisions.get(event.eventId)?.admitted === true,
    ).length;
    const componentId = exactCapture === null ? null : componentIdOfEncounter(exactCapture);
    const reintroductions = log.filter(
      (event) =>
        event.type === 'ExposureLogged' &&
        event.experienceId === study.passage.id &&
        componentId !== null &&
        event.componentIds.includes(componentId),
    ).length;

    return {
      exactCapture,
      thread: targetThread,
      lookupRecorded: log.some(
        (event) =>
          event.type === 'LookupFrictionLogged' &&
          event.idempotencyKey === `lookup-friction:${encodeURIComponent(GOLDEN_LOOKUP_ID)}`,
      ),
      readingContract,
      meaningContract,
      admittedReviews,
      reintroductions,
    };
  }, [snapshot.revision, snapshot.threads, snapshot.threadsById, store, study]);

  // Route focus is navigation only. No lookup, capture, promotion, contract, or
  // observation is dispatched here: returning to a source must not become a
  // fresh encounter merely because the view mounted.
  useEffect(() => {
    if (focusAnchorId !== study.anchor.id) return undefined;
    const timer = setTimeout(() => targetRef.current?.focus?.(), 0);
    return () => clearTimeout(timer);
  }, [focusAnchorId, study.anchor.id]);

  const quickLook = useCallback((): void => {
    setLookupOpen(true);
    const ack = store.execute(goldenLookupCommand());
    setActionNote(
      ack.deduplicated
        ? 'This quick look was already in the log. No grade was added.'
        : 'Quick look recorded as friction only — no grade, no review-memory update.',
    );
  }, [store]);

  const keep = useCallback((): void => {
    const captured = store.execute(goldenCaptureCommand());
    const thread = store.getSnapshot().threadsById[captured.threadId];
    const promoted =
      thread?.state.promotion === 'captured'
        ? store.execute({ kind: 'promote', threadId: captured.threadId, to: 'keep' })
        : null;
    const exact = [...captured.events, ...(promoted?.events ?? [])].some(
      (event) => event.type === 'EncounterCaptured' && event.sourceRef.sourceId === study.source.id,
    );
    setActionNote(
      exact
        ? `Kept exact ${study.targetText} at [${String(study.anchor.start)}, ${String(study.anchor.end)}).`
        : captured.deduplicated
          ? 'This component already had an origin encounter. Its earlier source lineage was preserved rather than guessed over.'
          : `Kept ${study.targetText}.`,
    );
  }, [store, study]);

  const learn = useCallback((): void => {
    if (progress.thread === null) return;
    const ack = store.execute(goldenLearnCommand(progress.thread.state.threadId));
    setActionNote(
      ack.deduplicated
        ? 'The versioned reading + meaning pair was already active.'
        : 'Learn activated by this gesture: one reading contract and one meaning contract.',
    );
  }, [progress.thread, store]);

  const before = study.source.body.slice(0, study.anchor.start);
  const exact = study.source.body.slice(study.anchor.start, study.anchor.end);
  const after = study.source.body.slice(study.anchor.end);
  const kept = progress.thread !== null && progress.thread.state.promotion !== 'captured';
  const learned = progress.readingContract && progress.meaningContract;

  return (
    <ScreenShell
      subtitle="A project-authored graded reader. Tap the marked span only when you choose to look."
      testID="screen-golden-source"
      title={study.source.title}
    >
      <View
        style={[
          styles.paper,
          { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
        ]}
        testID="golden-source-body"
      >
        <Text style={[styles.source, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
          {before}
          <Text
            accessibilityHint="Opens the seed quick look and records lookup friction only."
            accessibilityLabel={`Look up exact source span ${exact}`}
            accessibilityRole="button"
            onPress={quickLook}
            ref={(node: unknown) => {
              targetRef.current = node as FocusableTarget | null;
            }}
            style={[
              styles.target,
              { backgroundColor: theme.color.vermilionSoft, color: theme.color.vermilion },
            ]}
            testID="golden-source-target"
          >
            {exact}
          </Text>
          {after}
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          Exact anchor {study.anchor.id} · UTF-16 [{String(study.anchor.start)},{' '}
          {String(study.anchor.end)}) · sha256 {study.source.contentSha256}
        </Text>
        <ProvenanceLine field="body" record={study.source.provenance.body} />
      </View>

      {lookupOpen ? (
        <Section
          note="This is seed data, shown because you asked. Opening it records friction, not success or failure."
          testID="golden-lookup-panel"
          title="Quick look"
        >
          <RubyText
            reading={study.lexeme.reading}
            size={TYPE.headwordRow}
            testID="golden-lookup-headword"
            written={study.lexeme.headword}
          />
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {study.lexeme.senses.join(' · ')}
          </Text>
          <SeedEntryDisclosure />
          <AppButton
            accessibilityHint="Opens the full word page for this seed entry."
            label="Open the word page"
            onPress={() => onOpenWord(study.lexeme.id)}
            testID="golden-open-word"
          />
        </Section>
      ) : null}

      <Section
        note="Each line below is read from the canonical event log. Merely opening this route changes none of them."
        testID="golden-source-progress"
        title="Source → Learn → return"
      >
        <ProgressLine
          done={progress.lookupRecorded}
          label="Quick look recorded as LookupFrictionLogged; no grade field exists"
          testID="golden-progress-lookup"
        />
        <ProgressLine
          done={kept && progress.exactCapture !== null}
          label={`Exact Keep at [${String(study.anchor.start)}, ${String(study.anchor.end)})`}
          testID="golden-progress-keep"
        />
        <ProgressLine
          done={learned}
          label="Version 1 reading + meaning contracts in the durable log"
          testID="golden-progress-learn"
        />
        <ProgressLine
          done={progress.admittedReviews > 0}
          label={`${String(progress.admittedReviews)} admitted graded response(s) with review-memory state`}
          testID="golden-progress-grade"
        />
        <ProgressLine
          done={progress.reintroductions > 0}
          label={`${String(progress.reintroductions)} exposure(s) in ${study.passage.title}`}
          testID="golden-progress-reintroduction"
        />

        <View style={styles.actions}>
          <AppButton
            accessibilityHint="Records one quick look as friction only."
            label="Quick look at 自分"
            onPress={quickLook}
            testID="golden-lookup"
          />
          <AppButton
            accessibilityHint="Captures the full source with only the exact marked span as identity, then moves it to Keep."
            disabled={kept}
            label={kept ? 'Exact span kept' : 'Keep exact 自分'}
            onPress={keep}
            testID="golden-keep"
            variant="primary"
          />
          <AppButton
            accessibilityHint="Activates the supplied versioned reading and meaning contracts."
            disabled={!kept || learned}
            label={learned ? 'Learn pair active' : 'Learn reading + meaning'}
            onPress={learn}
            testID="golden-learn"
            variant="primary"
          />
        </View>

        {actionNote === null ? null : (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.note, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            testID="golden-action-note"
          >
            {actionNote}
          </Text>
        )}
        <DurabilityNotice note={DURABILITY_NOTES[store.durability]} />
      </Section>

      <Hairline />
      <AppButton
        accessibilityHint="Composes a finite drill from the two contracts already in the durable log."
        disabled={!learned || progress.thread === null}
        label="Begin the finite drill"
        onPress={() => {
          if (progress.thread !== null) onBeginDrill(progress.thread.state.threadId);
        }}
        testID="golden-begin-drill"
        variant="primary"
      />
      <AppButton
        accessibilityHint="Opens exact source and contract lineage, followed by export verification."
        disabled={progress.thread === null}
        label="Inspect lineage and export"
        onPress={() => {
          if (progress.thread !== null) onInspectEvidence(progress.thread.state.threadId);
        }}
        testID="golden-inspect"
      />
      <AppButton accessibilityHint="Returns to capture." label="Back" onPress={onBack} />
    </ScreenShell>
  );
}

function ProgressLine({
  done,
  label,
  testID,
}: {
  readonly done: boolean;
  readonly label: string;
  readonly testID: string;
}): ReactNode {
  const theme = useTheme();
  return (
    <Text
      accessibilityLabel={`${done ? 'Complete' : 'Not complete'}: ${label}`}
      style={[styles.progress, { color: done ? theme.color.ink : theme.color.inkMuted }]}
      testID={testID}
    >
      {done ? '●' : '○'} {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  body: { fontSize: TYPE.body, lineHeight: TYPE.body * 1.7 },
  meta: { fontSize: TYPE.meta, lineHeight: TYPE.meta * 1.6 },
  note: {
    borderLeftWidth: 3,
    borderRadius: RADIUS.sm,
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  paper: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: SPACE.md,
    padding: SPACE.lg,
  },
  progress: { fontSize: TYPE.meta, lineHeight: TYPE.meta * 1.6 },
  source: { fontSize: TYPE.body, lineHeight: TYPE.body * 2.05 },
  target: { fontWeight: '700', textDecorationLine: 'underline' },
});
