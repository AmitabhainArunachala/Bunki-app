/**
 * The diagnostics screen (WP-09; controller §12, REQ-ARCH-07).
 *
 * > Local structured log (dev console + ring buffer surfaced in a debug
 * > screen): event appends, command latencies, AI route/latency/fallback,
 * > persistence timings. Never log encounter text, AI payloads, or secrets.
 * > Sufficient to diagnose REQ-ARCH-06 latency budget misses.
 *
 * This screen is the "surfaced in a debug screen" half. It renders the ring's
 * own projected records and its own privacy note — it does not format, filter,
 * or summarise anything on its way to the page, because a screen that
 * reformatted the buffer would be a second place where a content field could be
 * reintroduced. What you see here is what `serialize()` would write.
 *
 * ## What it is honest about
 *
 * **Latency figures are elapsed milliseconds on this runtime, and it says so.**
 * Controller §13 is explicit that measurements must be labelled with what they
 * were measured on and that web numbers are demonstration data. The header line
 * carries that label, so a screenshot of this page cannot be read as a
 * performance claim (REQ-GATE-03).
 *
 * **The AI channel is empty here and says why.** `@bunki/ai` is not wired into
 * this build of the app — B7's coordination request 2 hands over
 * `AiTelemetrySink`, and the ring already implements it. An empty section that
 * explained nothing would read as "no AI calls happened", which is a different
 * and unearned claim.
 *
 * **The persistence channel is empty and says why.** `@bunki/persistence` is a
 * W4/WP-10 swap-in; this build keeps the log in memory, so there are no
 * persistence timings to record and none are invented.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  CLOSED_ENUMS,
  OBSERVABILITY_CHANNELS,
  RING_PRIVACY_NOTE,
  type ObservabilityChannel,
  type RingEntry,
} from '../observability/index.ts';
import { useAppSnapshot, useObservabilityRing } from '../state/app-context.tsx';
import { AppButton, Hairline, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

/**
 * What each channel is for, and — where it is empty in this build — why.
 *
 * Kept as data beside the channel list so a channel cannot be added without a
 * sentence explaining what an empty one means.
 */
const CHANNEL_NOTES: Readonly<Record<ObservabilityChannel, string>> = {
  command:
    'One record per command the store applied, with the milliseconds it spent inside `execute`.',
  'event-append': 'One record per event appended, by family. Types only — never payloads.',
  'ai-route':
    'Route class, latency and fallback for AI requests. Empty in this build: the AI adapter is a separate package that nothing here imports yet, so no request has been made — not “no requests failed”.',
  persistence:
    'Storage timings. Empty in this build: the event log is in memory for this session, so there is no durable write to time.',
};

const RUNTIME_LABEL =
  'Elapsed milliseconds measured on whatever runtime you are reading this on. Web figures are demonstration data, not a performance claim; native measurement is a later work package.';

export interface InspectorDebugScreenProps {
  readonly onBack: () => void;
}

export function InspectorDebugScreen({ onBack }: InspectorDebugScreenProps): ReactNode {
  const theme = useTheme();
  const ring = useObservabilityRing();
  // The snapshot is the app's change token; reading it here is what re-renders
  // this screen when a command elsewhere appends to the ring.
  const snapshot = useAppSnapshot();
  const [serialized, setSerialized] = useState<string | null>(null);
  const [serializeError, setSerializeError] = useState<string | null>(null);

  const entries = ring.entries();
  const byChannel = (channel: ObservabilityChannel): readonly RingEntry[] =>
    entries.filter((entry) => entry.record.channel === channel);

  const showSerialized = useCallback((): void => {
    try {
      setSerialized(ring.serialize());
      setSerializeError(null);
    } catch (cause) {
      setSerialized(null);
      setSerializeError(
        cause instanceof Error ? cause.message : 'The buffer could not be serialised.',
      );
    }
  }, [ring]);

  const stripped = entries.reduce((total, entry) => total + entry.strippedFields, 0);

  return (
    <ScreenShell subtitle={RUNTIME_LABEL} testID="screen-inspector-debug" title="Diagnostics">
      <Section testID="debug-privacy" title="What this buffer can hold">
        <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {RING_PRIVACY_NOTE}
        </Text>
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="debug-stripped-count"
        >
          Fields removed by that rebuild so far: {String(stripped)}. Their names are not kept — a
          key can be as revealing as a value.
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          Buffer: {String(entries.length)} of {String(ring.capacity)} slots ·{' '}
          {String(ring.appended())} records appended since this session started · store revision{' '}
          {String(snapshot.revision)}
        </Text>
      </Section>

      {entries.length === 0 ? (
        <>
          {/* The one honest loading state this screen has: a ring is read
              synchronously, so there is nothing to wait for and the panel is
              shown only while a forced-lag flag is holding the app. */}
          <LoadingPanel label="Waiting for the first record…" />
          <EmptyPanel
            detail="Use the app — search for something, keep it, open the evidence inspector — and the records appear here."
            message="Nothing recorded yet."
            testID="debug-empty"
          />
        </>
      ) : (
        OBSERVABILITY_CHANNELS.map((channel) => (
          <Section
            key={channel}
            note={CHANNEL_NOTES[channel]}
            testID={`debug-${channel}`}
            title={channel}
          >
            {byChannel(channel).length === 0 ? (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                No records on this channel.
              </Text>
            ) : (
              byChannel(channel).map((entry) => (
                <Text
                  key={`${channel}-${String(entry.record.seq)}`}
                  style={[styles.mono, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                  testID={`debug-record-${String(entry.record.seq)}`}
                >
                  {formatRecord(entry)}
                </Text>
              ))
            )}
          </Section>
        ))
      )}

      <Hairline />

      <Section
        note="The exact bytes `serialize()` produces, projected through the field table a second time on the way out."
        testID="debug-serialized"
        title="The buffer as text"
      >
        <AppButton
          accessibilityHint="Renders the serialised buffer below."
          label="Show serialised buffer"
          onPress={showSerialized}
          testID="debug-serialize-button"
        />
        {serializeError === null ? null : (
          <ErrorPanel
            detail="The buffer itself is unaffected."
            message={serializeError}
            testID="debug-serialize-error"
          />
        )}
        {serialized === null ? null : (
          <ScrollView
            horizontal
            style={[
              styles.codeBlock,
              { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
            ]}
            testID="debug-serialized-output"
          >
            <Text
              accessibilityLabel="The serialised diagnostic buffer."
              style={[styles.mono, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              {serialized}
            </Text>
          </ScrollView>
        )}
      </Section>

      <Section
        note="Identifier fields in this buffer are members of these closed sets, so a record cannot carry a name the domain does not define."
        testID="debug-enums"
        title="Closed sets the records draw from"
      >
        <Text style={[styles.mono, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          commandKind: {CLOSED_ENUMS.commandKind.join(', ')}
        </Text>
        <Text style={[styles.mono, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          eventType: {CLOSED_ENUMS.eventType.join(', ')}
        </Text>
      </Section>

      <Hairline />
      <View style={styles.actions}>
        <AppButton
          accessibilityHint="Empties the diagnostic buffer. Your event log is untouched."
          label="Clear the buffer"
          onPress={() => {
            ring.clear();
            setSerialized(null);
          }}
          testID="debug-clear"
        />
        <AppButton
          accessibilityHint="Returns to the evidence inspector."
          label="Back"
          onPress={onBack}
          testID="debug-back"
        />
      </View>
    </ScreenShell>
  );
}

/**
 * One record, as a line.
 *
 * Iterates the record's own keys — which the ring has already rebuilt from the
 * allowlist — rather than a list this file keeps, so a new allowlisted field
 * appears here automatically and a field that is not allowlisted cannot appear
 * at all.
 */
function formatRecord(entry: RingEntry): string {
  const parts = Object.keys(entry.record)
    .filter((key) => key !== 'channel')
    .sort()
    .map((key) => `${key}=${String(entry.record[key])}`);
  const suffix = entry.strippedFields === 0 ? '' : ` (+${String(entry.strippedFields)} removed)`;
  return `${parts.join(' ')}${suffix}`;
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
  codeBlock: {
    borderRadius: 8,
    borderWidth: 1,
    maxHeight: 320,
    padding: SPACE.md,
  },
  actions: {
    gap: SPACE.sm,
  },
});
