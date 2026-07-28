/**
 * Screen 1 — capture / search (WP-05; controller §10.1, REQ-UI-01).
 *
 * The requirement is a *sequence*, and the sequence is the thing being built:
 *
 *   search or receive text → correct answer immediately → one tap to Keep →
 *   optional one-gesture uncertainty mark → return to the original activity;
 *   enrichment finishes asynchronously.
 *
 * Each clause maps to something visible here:
 *
 * **Correct answer immediately.** The top result renders from the bundled seed
 * as the query changes. Nothing is fetched, nothing is generated, no AI is
 * consulted — WP-07 owns candidates and none exist on this screen.
 *
 * **One tap to Keep.** `keep()` runs two domain commands — the capture, then
 * the promotion out of `captured` — and both are synchronous. The
 * acknowledgment renders from the value they return, so it cannot appear before
 * the events exist and cannot wait on anything after them.
 *
 * **Enrichment after the acknowledgment, never before.** `runEnrichment` is
 * scheduled *after* `setAcknowledgment`, and the screen shows both timestamps
 * so the ordering is visible in the screenshot rather than asserted in prose.
 * `test/capture-flow.test.ts` asserts the same ordering on the store.
 *
 * **One-gesture uncertainty mark.** Five chips, one tap each, in the
 * requirement's own vocabulary. Before Keep the tap arms the mark that the
 * captured event will carry; after Keep it edits the annotation, because
 * REQ-UI-01 says the mark stays editable. Those two paths reach the event log
 * very differently — the first writes `uncertaintyMark` on the captured event,
 * the second writes nothing at all — so the sentence under the chips is derived
 * from the thread by `uncertaintyLogNote` rather than stated once and left to go
 * stale (REQ-GATE-03).
 *
 * **Taking a thread up for study is a separate press.** Keep stops at the `keep`
 * rung, which activates no contracts; `learn` is what does (REQ-DM-09), and the
 * only thing in this app that reaches it is the per-thread button below the kept
 * list. That separation is definition-of-done §3 step 3 — "promote it Captured →
 * Learn; confirm the review queue was empty of it *before* promotion" — and it
 * is the reason the session screen no longer promotes anything on mount.
 *
 * What this screen does *not* claim: that a saved thread survives a reload. It
 * renders the store's own durability sentence instead (P0-CAP-15).
 *
 * **The EDRDG acknowledgement belongs here too, and unconditionally.** §3 of the
 * EDRDG licence statement is explicit: "If a WWW server is providing a dictionary
 * function or an on-screen display of words from the files, the acknowledgement
 * must be made on each screen display, e.g. in the form of a message at the foot
 * of the screen or page." A result row here is a reading, a set of senses and a
 * part of speech — JMdict fields, all of them — so this screen is a dictionary
 * display in exactly that sense.
 *
 * The notice has been gated twice and both gates were too narrow. It first
 * rendered on the word and kanji pages only. Then it rendered here whenever a
 * search result did — and that still missed the **kept-threads list**, which is
 * the part of this screen that survives the query being cleared and the page
 * being reloaded. `capturedText` below is `topLexeme?.headword`, so keeping an
 * imported result stores the *JMdict headword* as the thread's `displayText`:
 * search じかん, press Keep, reload, and the front door renders 時間 — a string
 * that came from the files and never from anything the learner typed.
 *
 * So there is no condition on it now. The gate is the artefact that keeps going
 * stale, and the screens that never had one never had the bug.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { isPromotionActive } from '@bunki/domain';

import {
  constituentKanji,
  DEFAULT_CANONICAL_TARGET,
  importedDictionary,
  searchSeed,
  seedDataset,
  sentencesForLexeme,
  wordFamily,
  type SearchResult,
  type SeedLexeme,
} from '../data/catalog.ts';
import { useAppSnapshot, useAppStore, useDebugFlags } from '../state/app-context.tsx';
import { MANUAL_PROVENANCE, manualSource } from '../state/encounter-source.ts';
import {
  DURABILITY_NOTES,
  UNCERTAINTY_DIMENSIONS,
  UNCERTAINTY_LABELS,
  uncertaintyLogNote,
  type CommandAck,
  type UncertaintyDimension,
} from '../state/store.ts';
import { useLookup } from '../state/use-lookup.ts';
import { searchFieldStyle } from '../ui/interactive-styles.ts';
import { destinationFor } from '../ui/navigation.ts';
import { DurabilityNotice, SeedCoverageDisclosure, SeedEntryDisclosure } from '../ui/notices.tsx';
import { AppButton, ChipButton, Hairline, RowButton, Section } from '../ui/primitives.tsx';
import { RubyText } from '../ui/ruby.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { RADIUS, SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

/**
 * Where a typed query comes from, in REQ-SRC-01 terms.
 *
 * The record itself moved to `src/state/encounter-source.ts` when the word page
 * gained a Keep of its own — see that module for why a shared record with a
 * per-surface locator is more honest than a constant that said `capture-screen`
 * wherever it was used.
 */
const MANUAL_SOURCE = manualSource('capture-screen');

interface Enrichment {
  readonly finishedAt: string;
  readonly kanjiCount: number;
  readonly exampleCount: number;
  readonly familyCount: number;
}

export interface CaptureScreenProps {
  /** Navigate to a word page. Injected so the screen has no router dependency. */
  readonly onOpenWord: (lexemeId: string) => void;
  readonly onOpenKanji: (character: string) => void;
  /** Opens the evidence inspector (WP-09). */
  readonly onOpenEvidence: () => void;
  /**
   * Opens the reading surface (Campaign E, lane B4).
   *
   * Reading is a shell destination in its own right now (`navigation.ts` §3),
   * so this is *circulation* rather than the passage's only door — the thing
   * frozen §10.1 names as renzo's missing piece. A learner who has just looked a
   * word up is one press from meeting it in a passage.
   */
  readonly onOpenReading: () => void;
  /** Seeds the query box; the evidence harness uses it to reach a state directly. */
  readonly initialQuery?: string | undefined;
  /**
   * Leave capture and return to the surface it was opened from.
   *
   * Capture is an action rather than a destination (`navigation.ts` §2): the
   * shell offers it everywhere and it hands the learner back. Optional because
   * the screen must still render when it is reached as a bare URL, in which case
   * there is nowhere to hand them back to and no control is drawn.
   */
  readonly onDone?: (() => void) | undefined;
  /** The path {@link onDone} returns to, so the control can name it. */
  readonly returnTo?: string | undefined;
}

export function CaptureScreen({
  onOpenWord,
  onOpenKanji,
  onOpenEvidence,
  onOpenReading,
  initialQuery = '',
  onDone,
  returnTo,
}: CaptureScreenProps): ReactNode {
  const theme = useTheme();
  const store = useAppStore();
  const snapshot = useAppSnapshot();
  const flags = useDebugFlags();

  const [query, setQuery] = useState(initialQuery);
  const [pendingMark, setPendingMark] = useState<UncertaintyDimension | null>(null);
  const [acknowledgment, setAcknowledgment] = useState<CommandAck | null>(null);
  const [enrichment, setEnrichment] = useState<Enrichment | null>(null);
  const [enriching, setEnriching] = useState(false);

  const resolve = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed === '') return null;
    const results = searchSeed(trimmed);
    return results.length === 0 ? null : results;
  }, [query]);

  const { state, retry } = useLookup<readonly SearchResult[]>(resolve, {
    flags,
    emptyMessage:
      query.trim() === ''
        ? 'Type a word, a reading, or a kanji.'
        : `No seed entry matches “${query.trim()}”.`,
    emptyDetail:
      query.trim() === ''
        ? `The Phase-0 seed contains ${String(seedCounts.lexemes)} words and ${String(seedCounts.kanji)} kanji. Try ${DEFAULT_CANONICAL_TARGET}.`
        : undefined,
  });

  // A new query invalidates the previous acknowledgment: leaving "Kept" on
  // screen while the answer under it changed would attach the confirmation to
  // the wrong word.
  useEffect(() => {
    setAcknowledgment(null);
    setEnrichment(null);
    setEnriching(false);
    setPendingMark(null);
  }, [query]);

  const topResult = state.kind === 'ready' ? state.data[0] : undefined;
  const topLexeme: SeedLexeme | null =
    topResult !== undefined && topResult.kind === 'lexeme' ? topResult.lexeme : null;

  const capturedText = topLexeme?.headword ?? query.trim();
  const activeThread =
    acknowledgment === null ? null : (snapshot.threadsById[acknowledgment.threadId] ?? null);

  /**
   * One tap: capture, then leave `captured` for `keep`.
   *
   * Both commands are synchronous and the acknowledgment is set from their
   * return value before anything else is scheduled. The enrichment below is
   * deliberately the last statement in the function.
   */
  const keep = useCallback(() => {
    if (capturedText === '') return;

    const captureAck = store.execute({
      kind: 'capture',
      text: capturedText,
      sourceRef: MANUAL_SOURCE,
      provenance: MANUAL_PROVENANCE,
      uncertainty: pendingMark,
      ...(topLexeme === null ? {} : { lexemeId: topLexeme.id }),
    });

    const thread = store.getSnapshot().threadsById[captureAck.threadId];
    const promoteAck =
      thread !== undefined && thread.state.promotion === 'captured'
        ? store.execute({ kind: 'promote', threadId: captureAck.threadId, to: 'keep' })
        : null;

    const ack: CommandAck =
      promoteAck === null
        ? captureAck
        : { ...promoteAck, events: [...captureAck.events, ...promoteAck.events] };

    // --- acknowledgment renders from here; nothing above it awaited anything.
    setAcknowledgment(ack);
    setEnriching(true);
    setEnrichment(null);

    // --- everything below is enrichment, and it runs after the tap returns.
    runEnrichment(topLexeme, flags.lagMs, (result) => {
      setEnrichment(result);
      setEnriching(false);
    });
  }, [capturedText, flags.lagMs, pendingMark, store, topLexeme]);

  /**
   * Take a kept thread up for study — the learner's own hand on the ladder
   * (REQ-DM-09, definition-of-done §3 step 3).
   *
   * This is the only thing in the app that moves a thread to `learn`, and it is
   * only ever a press handler. Until the WP-10 repair round the session screen
   * did it silently on mount, which put a promotion the learner never made into
   * their exportable log; the fix was to delete that and give them the gesture
   * here instead, beside the thread it is about.
   *
   * `keep` and `captured` activate no contracts, so nothing in the loop can
   * observe a thread until this is pressed — which is the whole of DL-05's
   * "capture is not card creation", made a thing you can see happen.
   */
  const takeUpForStudy = useCallback(
    (threadId: string) => {
      store.execute({ kind: 'promote', threadId, to: 'learn' });
    },
    [store],
  );

  const markUncertainty = useCallback(
    (dimension: UncertaintyDimension) => {
      const next = pendingMark === dimension ? null : dimension;
      setPendingMark(next);
      if (acknowledgment !== null) {
        store.execute({
          kind: 'markUncertainty',
          threadId: acknowledgment.threadId,
          dimension: next,
        });
      }
    },
    [acknowledgment, pendingMark, store],
  );

  const results = state.kind === 'ready' ? state.data : [];
  const otherResults = useMemo(() => results.slice(1), [results]);

  /**
   * The way back, named.
   *
   * `navigation.ts` §2 makes capture an action: you open it from wherever you
   * are and it hands you back. The browser's Back button does that too, and on a
   * phone nobody reaches for it, so the way back is a control on the screen with
   * the surface's own name on it — 地図 Map, 稽古 Session — rather than a
   * generic "back".
   */
  const back = returnTo === undefined ? null : destinationFor(returnTo);

  return (
    <ScreenShell
      subtitle="Look something up, keep it in one tap, and mark what felt uncertain. This is an action, not a place: it hands you back where you were."
      testID="screen-capture"
      title="Capture"
      titleJa="拾う"
    >
      {onDone === undefined ? null : (
        <AppButton
          accessibilityHint="Closes capture and returns to the surface you opened it from. Nothing you kept is lost."
          accessibilityLabel={
            back === null ? 'Done — back to the map' : `Done — back to ${back.label}`
          }
          label={
            back === null ? 'Done — back to the map' : `Done — back to ${back.ja} ${back.label}`
          }
          onPress={onDone}
          style={styles.doneDoor}
          testID="capture-done"
          variant="quiet"
        />
      )}

      <View style={styles.searchRow}>
        <TextInput
          accessibilityHint="Results appear as you type. Nothing is sent anywhere."
          accessibilityLabel="Search the seed dataset by word, reading, or kanji"
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setQuery}
          placeholder="分岐 · ぶんき · branching · 岐"
          placeholderTextColor={theme.color.inkMuted}
          style={[
            searchFieldStyle,
            {
              backgroundColor: theme.color.raised,
              borderColor: theme.color.ruleStrong,
              color: theme.color.ink,
              fontFamily: theme.font.sans,
              fontSize: TYPE.body,
            },
          ]}
          testID="capture-search-input"
          value={query}
        />
        <AppButton
          accessibilityHint="Clears the query and the result."
          disabled={query === ''}
          label="Clear"
          onPress={() => setQuery('')}
          testID="capture-clear"
          variant="quiet"
        />
      </View>

      {/*
        The door to the reading surface (Campaign E, lane B4).

        Circulation, not the only door: 読む Reading is a shell destination of
        its own since Wave D. Frozen §10.1's diagnosis of renzo was that the
        five-tab shape is right and the missing piece is *circulation between
        tabs*, so a learner who has just looked a word up is offered the passage
        without going back to the bar to find it.
      */}
      <AppButton
        accessibilityHint="Opens the reading passage. Looking a word up there happens on the page, without leaving it."
        label="Read a passage"
        onPress={onOpenReading}
        style={styles.readingDoor}
        testID="capture-open-reading"
      />

      {state.kind === 'loading' ? <LoadingPanel label="Looking up…" /> : null}

      {state.kind === 'error' ? (
        <ErrorPanel detail={state.detail} message={state.message} onRetry={retry} />
      ) : null}

      {state.kind === 'empty' ? (
        <EmptyPanel detail={state.detail} message={state.message}>
          <SeedCoverageDisclosure />
        </EmptyPanel>
      ) : null}

      {state.kind === 'ready' && topResult !== undefined ? (
        <View
          style={[
            styles.answer,
            { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
          ]}
          testID="capture-top-answer"
        >
          {topResult.kind === 'lexeme' ? (
            <>
              <RubyText
                reading={topResult.lexeme.reading}
                size={TYPE.headwordRow}
                testID="capture-top-headword"
                written={topResult.lexeme.headword}
              />
              <Text
                style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                testID="capture-top-gloss"
              >
                {topResult.lexeme.senses.join(' · ')}
              </Text>
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                {topResult.lexeme.partOfSpeech.join(' · ')}
              </Text>
            </>
          ) : (
            <>
              <Text
                style={[
                  styles.kanjiAnswer,
                  { color: theme.color.ink, fontFamily: theme.font.mincho },
                ]}
              >
                {topResult.kanji.character}
              </Text>
              <Text style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
                {topResult.kanji.meanings.join(' · ')}
              </Text>
            </>
          )}

          <View style={styles.actions}>
            <AppButton
              accessibilityHint="Saves this encounter as a thread and moves it out of Captured into Keep."
              accessibilityLabel={`Keep ${capturedText}`}
              label="Keep"
              onPress={keep}
              testID="capture-keep"
              variant="primary"
            />
            {topResult.kind === 'lexeme' ? (
              <AppButton
                accessibilityHint="Opens the full word page."
                accessibilityLabel={`Open the word page for ${topResult.lexeme.headword}`}
                label="Word page"
                onPress={() => onOpenWord(topResult.lexeme.id)}
                testID="capture-open-word"
              />
            ) : (
              <AppButton
                accessibilityHint="Opens the full kanji page."
                accessibilityLabel={`Open the kanji page for ${topResult.kanji.character}`}
                label="Kanji page"
                onPress={() => onOpenKanji(topResult.kanji.character)}
                testID="capture-open-kanji"
              />
            )}
          </View>

          <View style={styles.markBlock}>
            <Text
              style={[
                styles.markLabel,
                { color: theme.color.inkMuted, fontFamily: theme.font.sans },
              ]}
            >
              What felt uncertain? (optional, one tap)
            </Text>
            {/*
              `group`, not `radiogroup`.

              ARIA requires a `radiogroup` to own elements with `role="radio"`,
              and these are `ChipButton`s — buttons, carrying `aria-pressed`
              since the A1 repair. `radiogroup` was therefore promising children
              that were never going to arrive, the same `aria-required-children`
              mistake the lens row made with `tablist` (`src/ui/lens.tsx`). axe
              never saw it because these chips only exist once a word has been
              searched for, and the route sweep scans the screen at rest.

              `role` rather than `accessibilityRole` because React Native's
              `AccessibilityRole` union has no `group`; `Role` does, and
              react-native-web forwards it verbatim.
            */}
            <View accessibilityLabel="What felt uncertain?" role="group" style={styles.chips}>
              {UNCERTAINTY_DIMENSIONS.map((dimension) => (
                <ChipButton
                  accessibilityHint={
                    acknowledgment === null
                      ? 'Marks this dimension on the encounter when you keep it.'
                      : 'Updates the uncertainty mark on the kept thread.'
                  }
                  accessibilityLabel={`Mark ${UNCERTAINTY_LABELS[dimension]} as uncertain`}
                  key={dimension}
                  label={UNCERTAINTY_LABELS[dimension]}
                  onPress={() => markUncertainty(dimension)}
                  selected={pendingMark === dimension}
                  testID={`capture-mark-${dimension}`}
                />
              ))}
            </View>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              testID="capture-mark-log-note"
            >
              {uncertaintyLogNote(activeThread?.uncertainty ?? null, {
                kept: acknowledgment !== null,
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
              testID="capture-acknowledgment"
            >
              <Text
                style={[styles.ackTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              >
                {acknowledgment.deduplicated
                  ? `Already kept — ${capturedText}`
                  : `Kept — ${capturedText}`}
              </Text>
              <Text style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
                Acknowledged at {acknowledgment.acknowledgedAt}
                {activeThread === null ? '' : ` · ${activeThread.state.promotion}`}
              </Text>
              <Text style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
                {acknowledgment.events.length === 0
                  ? 'No new events — this exact capture was already in the log.'
                  : `${String(acknowledgment.events.length)} event(s): ${acknowledgment.events.map((event) => event.type).join(', ')}`}
              </Text>
              <DurabilityNotice note={DURABILITY_NOTES[acknowledgment.durability]} />

              <Text
                style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                testID="capture-enrichment"
              >
                {enriching
                  ? 'Enrichment running… (started after this acknowledgment)'
                  : enrichment === null
                    ? 'Enrichment not started.'
                    : `Enrichment finished at ${enrichment.finishedAt} — ${String(enrichment.kanjiCount)} kanji, ${String(enrichment.exampleCount)} example sentence(s), ${String(enrichment.familyCount)} related word(s).`}
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {otherResults.length === 0 ? null : (
        <Section
          note="Ordered by how the query matched: written form, then reading, then meaning."
          testID="capture-other-results"
          title="Other matches"
        >
          {otherResults.map((result) => (
            <RowButton
              accessibilityHint="Opens its page."
              accessibilityLabel={
                result.kind === 'lexeme'
                  ? `${result.lexeme.headword}, read ${result.lexeme.reading}: ${result.lexeme.senses.join(', ')}`
                  : `Kanji ${result.kanji.character}: ${result.kanji.meanings.join(', ')}`
              }
              key={result.kind === 'lexeme' ? result.lexeme.id : result.kanji.id}
              onPress={() =>
                result.kind === 'lexeme'
                  ? onOpenWord(result.lexeme.id)
                  : onOpenKanji(result.kanji.character)
              }
            >
              {result.kind === 'lexeme' ? (
                <>
                  <RubyText
                    reading={result.lexeme.reading}
                    serif={false}
                    size={TYPE.body}
                    written={result.lexeme.headword}
                  />
                  <Text
                    style={[
                      styles.meta,
                      { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                    ]}
                  >
                    {result.lexeme.senses.slice(0, 3).join(' · ')}
                  </Text>
                </>
              ) : (
                <>
                  <Text
                    style={[
                      styles.rowKanji,
                      { color: theme.color.ink, fontFamily: theme.font.mincho },
                    ]}
                  >
                    {result.kanji.character}
                  </Text>
                  <Text
                    style={[
                      styles.meta,
                      { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                    ]}
                  >
                    {result.kanji.meanings.slice(0, 3).join(' · ')}
                  </Text>
                </>
              )}
            </RowButton>
          ))}
        </Section>
      )}

      {/*
        Unconditional, which is the third and final version of this line.

        It was first wired to the word and kanji pages only; then to the search
        results here, on the reasoning that "no licensed word on screen, no
        acknowledgement to make". That reasoning was wrong, and the way it was
        wrong is the reason there is no condition here any more: the search
        results are not the only licensed content on this screen. The kept-threads
        list below outlives the query, and a thread's `displayText` is the
        matched entry's headword — a JMdict field in the imported tier. Keep 時間,
        がっこう and ともだち, clear the box, reload: the front door renders three
        JMdict headwords, and under the old condition it rendered them with no
        EDRDG string anywhere in the DOM.

        A condition here has now gone stale three times, each time because the
        set of licensed things on screen grew and the predicate did not. The
        other seven screens carry the notice unconditionally; so does this one.
      */}
      <SeedEntryDisclosure />

      <Hairline />

      <Section
        note={DURABILITY_NOTES[store.durability]}
        testID="capture-threads"
        title={`Kept threads (${String(snapshot.threads.length)})`}
      >
        {snapshot.threads.length === 0 ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            Nothing kept yet in this session.
          </Text>
        ) : (
          snapshot.threads.map((thread) => (
            <View key={thread.state.threadId} style={styles.threadBlock}>
              <RowButton
                accessibilityHint={
                  thread.lexemeId === null
                    ? 'This capture did not match a seed word, so it has no word page yet.'
                    : 'Opens the word page for this thread.'
                }
                accessibilityLabel={`${thread.displayText}, ${thread.state.promotion}${
                  thread.uncertainty === null
                    ? thread.markRecordedInLog
                      ? ', marked uncertain; which part was not stored'
                      : ''
                    : `, uncertain about ${UNCERTAINTY_LABELS[thread.uncertainty.dimension]}`
                }`}
                onPress={() => {
                  if (thread.lexemeId !== null) onOpenWord(thread.lexemeId);
                }}
              >
                <Text
                  style={[
                    styles.threadText,
                    { color: theme.color.ink, fontFamily: theme.font.mincho },
                  ]}
                >
                  {thread.displayText}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  {thread.state.promotion}
                  {thread.uncertainty === null
                    ? // The log kept the *fact* of the mark and never held the
                      // dimension (WP05-D2), so a reloaded thread says that rather
                      // than reading as though nothing was marked.
                      thread.markRecordedInLog
                      ? ' · marked uncertain (which part was not stored)'
                      : ''
                    : ` · uncertain: ${UNCERTAINTY_LABELS[thread.uncertainty.dimension]}`}
                  {` · ${String(thread.state.encounterIds.length)} encounter(s)`}
                </Text>
              </RowButton>
              {isPromotionActive(thread.state.promotion) ? (
                <Text
                  style={[
                    styles.meta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                  testID={`capture-promoted-${thread.state.threadId}`}
                >
                  Taken up for study — a sitting can now be planned over it, and the evidence
                  inspector will show the promotion with your name on it.
                </Text>
              ) : (
                <AppButton
                  accessibilityHint="Moves this thread to Learn. That rung is what activates its retrieval contracts; keeping alone activates none."
                  accessibilityLabel={`Take ${thread.displayText} up for study`}
                  label="Take it up for study"
                  onPress={() => takeUpForStudy(thread.state.threadId)}
                  testID={`capture-promote-${thread.state.threadId}`}
                />
              )}
            </View>
          ))
        )}
        {snapshot.threads.length === 0 ? null : (
          <AppButton
            accessibilityHint="Opens the evidence inspector for your newest thread: why it is here, what has been observed about it, and the export."
            label="Open the evidence inspector"
            onPress={onOpenEvidence}
            testID="capture-open-evidence"
          />
        )}
      </Section>
    </ScreenShell>
  );
}

/**
 * Phase-0 enrichment: a second pass over the seed for the things the answer
 * card did not need.
 *
 * It is genuinely asynchronous and genuinely after the acknowledgment. It is
 * *not* an AI call — `@bunki/ai` and the candidate path are WP-07's, and this
 * screen has no provider, no key, and no candidate rendering. Under `?lag=` it
 * takes long enough to photograph mid-flight, which is the point of the flag.
 */
function runEnrichment(
  lexeme: SeedLexeme | null,
  lagMs: number,
  done: (result: Enrichment) => void,
): void {
  setTimeout(
    () => {
      done({
        finishedAt: new Date().toISOString(),
        kanjiCount: lexeme === null ? 0 : constituentKanji(lexeme).length,
        exampleCount: lexeme === null ? 0 : sentencesForLexeme(lexeme.id).length,
        familyCount: lexeme === null ? 0 : wordFamily(lexeme).length,
      });
    },
    Math.max(lagMs, 16),
  );
}

/** Counted from the dataset, never typed in: a stale number here would be a false claim. */
const seedCounts = {
  lexemes: seedDataset.lexemes.length + importedDictionary.lexemes.length,
  kanji: seedDataset.kanji.length + importedDictionary.kanji.length,
} as const;

const styles = StyleSheet.create({
  searchRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  readingDoor: {
    alignSelf: 'flex-start',
  },
  doneDoor: {
    alignSelf: 'flex-start',
  },
  answer: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.md,
    padding: SPACE.lg,
  },
  gloss: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.6,
  },
  kanjiAnswer: {
    fontSize: TYPE.headword,
    lineHeight: TYPE.headword * 1.2,
  },
  rowKanji: {
    fontSize: TYPE.headwordRow,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
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
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  ackTitle: {
    fontSize: TYPE.body,
    fontWeight: '700',
  },
  threadBlock: {
    gap: SPACE.xs,
  },
  threadText: {
    fontSize: TYPE.body,
  },
});
