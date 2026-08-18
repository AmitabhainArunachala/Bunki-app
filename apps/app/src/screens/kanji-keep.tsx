/**
 * Keep an encounter from a kanji page (RENKAN R4-A, P2-18).
 *
 * ## Why this exists
 *
 * The kanji pages were encounter surfaces from which nothing could enter the
 * loop: a learner could meet a character, feel the gap, and have no gesture —
 * `store.execute` was unreachable from either kanji screen. The one-app triage
 * names that a defect (P2-18), and this panel is the closure: the same
 * one-tap Keep the capture screen offers, dispatched through the same domain
 * command handler, so the `EncounterCaptured` comes out of the kernel's
 * validated factory with real provenance and the thread joins the learner's
 * one durable log.
 *
 * ## What a Keep here does not do
 *
 * It creates **no review debt**. The capture moves the thread to the `keep`
 * rung, which activates no contracts (REQ-DM-09) — nothing is queued, nothing
 * is graded, and the session planner cannot see the thread until the learner's
 * separate "Take it up for study" gesture on the capture screen. DL-05's
 * "capture is not card creation" holds on this surface exactly as it does on
 * search.
 *
 * ## The mark
 *
 * REQ-UI-01's five-way one-gesture uncertainty mark travels with the panel: a
 * chip pressed before Keep rides on the captured event's `uncertaintyMark`,
 * and afterwards the chips stay editable through `markUncertainty`. The
 * sentence under them is `uncertaintyLogNote`, derived from the thread rather
 * than typed here, so this surface cannot drift from what the log holds.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { kanjiKeepCaptureCommand, type KanjiPageTier } from '../data/kanji-keep.ts';
import { useAppSnapshot, useAppStore } from '../state/app-context.tsx';
import { targetKeyOf } from '../state/memory-store.ts';
import {
  DURABILITY_NOTES,
  UNCERTAINTY_DIMENSIONS,
  UNCERTAINTY_LABELS,
  uncertaintyLogNote,
  type CommandAck,
  type ThreadView,
  type UncertaintyDimension,
} from '../state/store.ts';
import { DurabilityNotice } from '../ui/notices.tsx';
import { AppButton, ChipButton, Section } from '../ui/primitives.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

export interface KanjiKeepPanelProps {
  readonly character: string;
  readonly tier: KanjiPageTier;
}

export function KanjiKeepPanel({ character, tier }: KanjiKeepPanelProps): ReactNode {
  const theme = useTheme();
  const store = useAppStore();
  const snapshot = useAppSnapshot();

  const [pendingMark, setPendingMark] = useState<UncertaintyDimension | null>(null);
  const [acknowledgment, setAcknowledgment] = useState<CommandAck | null>(null);

  // The thread this character already lives on, if any — matched by the same
  // normalised key the store itself joins re-encounters on, so this panel and
  // the command handler cannot disagree about "already kept".
  const targetKey = targetKeyOf(character);
  const existing: ThreadView | null =
    snapshot.threads.find((thread) => thread.targetKey === targetKey) ?? null;
  const activeThread: ThreadView | null =
    acknowledgment === null
      ? existing
      : (snapshot.threadsById[acknowledgment.threadId] ?? existing);

  const selectedDimension: UncertaintyDimension | null =
    activeThread === null ? pendingMark : (activeThread.uncertainty?.dimension ?? null);

  /**
   * One tap: capture, then leave `captured` for `keep` — the capture screen's
   * exact two commands, synchronous, acknowledgment set from their return
   * value. A repeat on an already-kept character dedupes in the store and the
   * acknowledgment says so instead of pretending a second thread appeared.
   */
  const keep = useCallback(() => {
    const captureAck = store.execute(
      kanjiKeepCaptureCommand(character, tier, activeThread === null ? pendingMark : null),
    );
    const thread = store.getSnapshot().threadsById[captureAck.threadId];
    const promoteAck =
      thread !== undefined && thread.state.promotion === 'captured'
        ? store.execute({ kind: 'promote', threadId: captureAck.threadId, to: 'keep' })
        : null;
    setAcknowledgment(
      promoteAck === null
        ? captureAck
        : { ...promoteAck, events: [...captureAck.events, ...promoteAck.events] },
    );
  }, [activeThread, character, pendingMark, store, tier]);

  const markUncertainty = useCallback(
    (dimension: UncertaintyDimension) => {
      const next = selectedDimension === dimension ? null : dimension;
      if (activeThread === null) {
        setPendingMark(next);
        return;
      }
      store.execute({
        kind: 'markUncertainty',
        threadId: activeThread.state.threadId,
        dimension: next,
      });
    },
    [activeThread, selectedDimension, store],
  );

  return (
    <Section
      note="Keeping is capture, not study: the thread stops at the keep rung, which activates no retrieval contracts and queues nothing. Taking it up for study is a separate choice on the capture screen."
      testID="kanji-keep-panel"
      title="Keep this encounter"
    >
      {activeThread !== null && acknowledgment === null ? (
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="kanji-keep-thread"
        >
          Already on your {activeThread.state.promotion} thread {activeThread.displayText} — keeping
          again records a re-encounter on the same thread, never a second one.
        </Text>
      ) : null}

      <AppButton
        accessibilityHint="Saves this encounter as a thread and moves it out of Captured into Keep. No review is created."
        accessibilityLabel={`Keep ${character}`}
        label={`Keep ${character}`}
        onPress={keep}
        testID="kanji-keep"
        variant="primary"
      />

      <View style={styles.markBlock}>
        <Text
          style={[styles.markLabel, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          What felt uncertain? (optional, one tap)
        </Text>
        <View accessibilityRole="radiogroup" style={styles.chips}>
          {UNCERTAINTY_DIMENSIONS.map((dimension) => (
            <ChipButton
              accessibilityHint={
                activeThread === null
                  ? 'Marks this dimension on the encounter when you keep it.'
                  : 'Updates the uncertainty mark on the kept thread.'
              }
              accessibilityLabel={`Mark ${UNCERTAINTY_LABELS[dimension]} as uncertain`}
              key={dimension}
              label={UNCERTAINTY_LABELS[dimension]}
              onPress={() => markUncertainty(dimension)}
              selected={selectedDimension === dimension}
              testID={`kanji-mark-${dimension}`}
            />
          ))}
        </View>
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="kanji-keep-note"
        >
          {uncertaintyLogNote(activeThread?.uncertainty ?? null, {
            kept: activeThread !== null,
            markRecordedInLog: activeThread?.markRecordedInLog ?? false,
          })}
        </Text>
      </View>

      {acknowledgment === null ? null : (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.ack,
            { borderColor: theme.color.vermilion, backgroundColor: theme.color.vermilionSoft },
          ]}
          testID="kanji-keep-acknowledgment"
        >
          <Text style={[styles.ackTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {acknowledgment.deduplicated ? `Already kept — ${character}` : `Kept — ${character}`}
          </Text>
          <Text style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {acknowledgment.events.length === 0
              ? 'No new events — this exact capture was already in the log.'
              : `${String(acknowledgment.events.length)} event(s): ${acknowledgment.events.map((event) => event.type).join(', ')}`}
          </Text>
          <DurabilityNotice note={DURABILITY_NOTES[acknowledgment.durability]} />
        </View>
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  markBlock: {
    gap: SPACE.sm,
  },
  markLabel: {
    fontSize: TYPE.label,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  ack: {
    borderLeftWidth: 3,
    borderRadius: 4,
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  ackTitle: {
    fontSize: TYPE.body,
    fontWeight: '700',
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
