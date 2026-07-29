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
 * **Empty channels say why.** An empty section that explained nothing would read
 * as "nothing happened on this channel", which is a different and unearned
 * claim. The AI channel is wired as of WP-10 (the runtime is built in
 * `AppProvider` with the route ring as its sink, closing B7's coordination
 * request 2), so an empty AI channel now means no candidate was requested this
 * session rather than that the path does not exist.
 *
 * **Where the bytes are is its own section.** `StorageSection` renders the
 * adapter's own label and its own disclosure sentence verbatim (REQ-ARCH-05,
 * P0-CAP-15) — this is the "about screen" controller §7 requires the provisional
 * web adapter to be labelled on. It reports three facts that fail separately:
 * which adapter is running, whether it really has storage, and whether any
 * acknowledged write remains unconfirmed.
 *
 * **Its four states are mutually exclusive.** The records region resolves
 * through `useLookup`, the same state machine the other screens use, so
 * `resolveViewState` hands back exactly one of loading / error / empty / ready.
 * An earlier revision of this screen rendered `LoadingPanel` and `EmptyPanel`
 * side by side whenever the ring was empty, and carried a comment claiming a
 * forced-lag flag gated the spinner — a flag this file never read. On `/debug`
 * with no records that put an `accessibilityRole="progressbar"` inside a polite
 * live region next to "Nothing recorded yet.", so a screen reader announced
 * work permanently in progress on a screen that had already finished. The lag
 * flag described by that comment now genuinely exists here, because the lookup
 * this screen runs is the one that honours it.
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
import {
  useAppSnapshot,
  useDebugFlags,
  useObservabilityRing,
  useStorageFacts,
  useWriteState,
} from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import { SESSION_INTEGRATION_NOTE } from './session-loop.ts';
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
  const flags = useDebugFlags();
  const [serialized, setSerialized] = useState<string | null>(null);
  const [serializeError, setSerializeError] = useState<string | null>(null);
  /**
   * Ring mutations no command caused.
   *
   * "Clear the buffer" empties the ring without appending an event, so
   * `snapshot.revision` does not move and the lookup below would keep serving
   * the records it resolved before the clear. This counter is the change token
   * for that one case.
   */
  const [localRevision, setLocalRevision] = useState(0);

  const entries = ring.entries();

  /**
   * The records, through the same state machine every other screen uses.
   *
   * Reading a ring is synchronous, so `loading` lasts one frame unless `?lag=`
   * holds it — which is the *only* reason this screen has a loading state, and
   * the reason it is routed through `useLookup` rather than through a hand-
   * written conditional. `resolveViewState` returns one member of a closed
   * union, so loading, error, empty and ready are mutually exclusive by
   * construction: this screen previously rendered a spinner *and* an empty
   * panel together, announcing a progressbar that never resolved beside
   * "Nothing recorded yet."
   */
  const resolveEntries = useCallback((): readonly RingEntry[] | null => {
    const current = ring.entries();
    return current.length === 0 ? null : current;
    // `localRevision` and `snapshot.revision` are change tokens, not values the
    // resolver reads; the ring is not something React can compare.
  }, [ring, snapshot.revision, localRevision]);

  const { state, retry } = useLookup<readonly RingEntry[]>(resolveEntries, {
    flags,
    emptyMessage: 'Nothing recorded yet.',
    emptyDetail:
      'Use the app — search for something, keep it, open the evidence inspector — and the records appear here.',
  });

  const byChannel = (
    records: readonly RingEntry[],
    channel: ObservabilityChannel,
  ): readonly RingEntry[] => records.filter((entry) => entry.record.channel === channel);

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

      <StorageSection />

      {/* Exactly one of these four branches renders. `state.kind` is a closed
          union, so there is no arrangement of flags that shows two at once. */}
      {state.kind === 'loading' ? (
        <LoadingPanel label="Reading the diagnostic buffer…" />
      ) : state.kind === 'error' ? (
        <ErrorPanel
          detail={state.detail}
          message={state.message}
          onRetry={retry}
          testID="debug-error"
        />
      ) : state.kind === 'empty' ? (
        <EmptyPanel detail={state.detail} message={state.message} testID="debug-empty" />
      ) : (
        OBSERVABILITY_CHANNELS.map((channel) => (
          <Section
            key={channel}
            note={CHANNEL_NOTES[channel]}
            testID={`debug-${channel}`}
            title={channel}
          >
            {byChannel(state.data, channel).length === 0 ? (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                No records on this channel.
              </Text>
            ) : (
              byChannel(state.data, channel).map((entry) => (
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
            // No event is appended, so the store's revision does not move; this
            // is what tells the lookup the ring underneath it changed.
            setLocalRevision((value) => value + 1);
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
 * Where this build keeps the learner's data (WP-10; REQ-ARCH-05, P0-CAP-15).
 *
 * Controller §7 requires the provisional web adapter to be "labelled provisional
 * in code, UI (about screen), and README". This is the about surface, and it
 * renders `@bunki/persistence`'s own sentence verbatim rather than a paraphrase
 * — a screen that restated the guarantee in its own words is a screen that can
 * restate it more strongly than the adapter earns.
 *
 * Three separate facts, because they fail separately: which adapter is running,
 * whether that adapter actually has storage, and whether any acknowledged write
 * remains unconfirmed. A build reporting "web-provisional" while the browser refused
 * `localStorage` looks durable and is not, which is why the second line exists.
 */
function StorageSection(): ReactNode {
  const theme = useTheme();
  const storage = useStorageFacts();
  const writeState = useWriteState();

  if (storage === null) {
    return (
      <Section
        note="This screen is running against an injected store, so there is no adapter to describe."
        testID="debug-storage"
        title="Where this build keeps your data"
      >
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          No durable adapter is attached to this render. Nothing here is a durability claim.
        </Text>
      </Section>
    );
  }

  return (
    <Section testID="debug-storage" title="Where this build keeps your data">
      <Text
        style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        testID="debug-storage-runtime"
      >
        Adapter: {storage.runtimeLabel}
      </Text>
      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {storage.disclosure}
      </Text>
      {storage.provisionalNotice === null ? null : (
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="debug-storage-provisional"
        >
          {storage.provisionalNotice}
        </Text>
      )}
      <Text
        style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        testID="debug-storage-snapshot"
      >
        {storage.snapshotAvailable
          ? 'Browser storage is available, so what you save survives a reload.'
          : 'This browser refused persistent storage, so this session is in memory only and a reload will clear it.'}
      </Text>
      <Text
        style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        testID="debug-storage-session-gap"
      >
        {SESSION_INTEGRATION_NOTE}
      </Text>
      <Text
        style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        testID="debug-storage-writes"
      >
        {writeState === null
          ? 'Durable writes: not applicable.'
          : writeState.kind === 'settled'
            ? 'All changes from this session are saved locally.'
            : writeState.kind === 'writing'
              ? 'Saving changes locally…'
              : `Saving problem: Bunki could not confirm that one or more changes were saved. They may still appear now but disappear after you reopen the app. A newer save can succeed without resolving this earlier gap. Most recent storage message: ${writeState.message}`}
      </Text>
    </Section>
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
