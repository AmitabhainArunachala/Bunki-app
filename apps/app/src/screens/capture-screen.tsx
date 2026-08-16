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
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { isPromotionActive } from '@bunki/domain';

import {
  constituentKanji,
  DEFAULT_CANONICAL_TARGET,
  searchSeed,
  seedDataset,
  sentencesForLexeme,
  wordFamily,
  type SearchResult,
  type SeedLexeme,
} from '../data/catalog.ts';
import { seedEntryForThread, seedLearnCommand } from '../data/learn-specification.ts';
import { useAppSnapshot, useAppStore, useDebugFlags } from '../state/app-context.tsx';
import { captureLookupCommand, type CaptureLookupTarget } from '../state/lookup-friction.ts';
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
import { DurabilityNotice, SeedCoverageDisclosure } from '../ui/notices.tsx';
import { AppButton, ChipButton, Hairline, RowButton, Section } from '../ui/primitives.tsx';
import { RubyText } from '../ui/ruby.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

/**
 * Where a typed query comes from, in REQ-SRC-01 terms.
 *
 * The learner typed it, so the source is the learner and the licence is theirs.
 * Recording it as anything else — or leaving it blank — would make the one
 * piece of genuinely user-owned content in the log indistinguishable from
 * unattributed data (T-15).
 */
const MANUAL_SOURCE = {
  sourceId: 'manual-entry',
  kind: 'manual',
  locator: 'capture-screen',
} as const;

const MANUAL_PROVENANCE = {
  source: 'user_encounter',
  license: 'user_owned',
  modificationStatus: 'unmodified',
  reviewStatus: 'unreviewed',
} as const;

interface Enrichment {
  readonly finishedAt: string;
  readonly kanjiCount: number;
  readonly exampleCount: number;
  readonly familyCount: number;
}

export interface CaptureScreenProps {
  /** Opens the authored A1 reading source. */
  readonly onOpenGoldenSource: () => void;
  /** Navigate to a word page. Injected so the screen has no router dependency. */
  readonly onOpenWord: (lexemeId: string) => void;
  readonly onOpenKanji: (character: string) => void;
  /** Opens the evidence inspector (WP-09). */
  readonly onOpenEvidence: () => void;
  /** Seeds the query box; the evidence harness uses it to reach a state directly. */
  readonly initialQuery?: string | undefined;
}

export function CaptureScreen({
  onOpenGoldenSource,
  onOpenWord,
  onOpenKanji,
  onOpenEvidence,
  initialQuery = '',
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

  /**
   * Lookups this presentation has already recorded (T-07, ledger P1-17).
   *
   * A real lookup here is the press that opens a full entry — the "Word page"
   * and "Kanji page" doors, and the rows under "Other matches" — not the
   * ambient top-answer resolution, which is the app resolving as you type and
   * carries no gesture. One press records one `LookupFrictionLogged` through
   * the same store command the golden route uses; the event is grade-free by
   * schema (ADR-002) and the gate refuses it for FSRS by name, so nothing here
   * can become review debt.
   *
   * The set makes the gesture idempotent per presentation: a double-tap, or
   * re-opening the same entry from the same search, records once. A new query
   * clears it (below), and a fresh mount starts empty, so a genuinely new
   * reach for the same word is a new event — the store never collapses lookups
   * into one lifetime record.
   */
  const recordedLookups = useRef(new Set<string>());

  const recordLookup = useCallback(
    (target: CaptureLookupTarget): void => {
      const presentationKey = `${target.targetType}:${target.targetId}`;
      if (recordedLookups.current.has(presentationKey)) return;
      recordedLookups.current.add(presentationKey);
      store.execute(captureLookupCommand(store.readAll(), target));
    },
    [store],
  );

  // A new query invalidates the previous acknowledgment: leaving "Kept" on
  // screen while the answer under it changed would attach the confirmation to
  // the wrong word.
  useEffect(() => {
    setAcknowledgment(null);
    setEnrichment(null);
    setEnriching(false);
    setPendingMark(null);
    recordedLookups.current.clear();
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
   * Only ever a press handler. Until the WP-10 repair round the session screen
   * did it silently on mount, which put a promotion the learner never made into
   * their exportable log; the fix was to delete that and give them the gesture
   * here instead, beside the thread it is about.
   *
   * Since R4-A (P1-18) the gesture is `activateLearn` whenever the thread
   * resolves to a seed entry: the same validated command the A1 source route
   * dispatches, so the promotion *and* the immutable reading/meaning pair are
   * minted together through `createLearnContractPair`, under the one
   * deterministic id lineage. A thread that resolves to no seed entry falls
   * back to the bare promotion — there is no answer set to grade it against,
   * so minting a contract for it would be the app asserting a lexical fact.
   *
   * `keep` and `captured` activate no contracts, so nothing in the loop can
   * observe a thread until this is pressed — which is the whole of DL-05's
   * "capture is not card creation", made a thing you can see happen.
   */
  const takeUpForStudy = useCallback(
    (threadId: string) => {
      const thread = store.getSnapshot().threadsById[threadId];
      const entry = thread === undefined ? null : seedEntryForThread(thread);
      if (entry === null) {
        store.execute({ kind: 'promote', threadId, to: 'learn' });
        return;
      }
      store.execute(seedLearnCommand(threadId, entry));
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

  return (
    <ScreenShell
      lede={
        <AppButton
          accessibilityHint="Opens the authored source 静かな朝 at its exact 自分 anchor."
          label="Read 静かな朝 — exact source"
          onPress={onOpenGoldenSource}
          testID="capture-open-golden-source"
        />
      }
      subtitle="Look something up, keep it in one tap, and mark what felt uncertain."
      testID="screen-capture"
      title="分岐 Bunki — capture"
    >
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
                accessibilityHint="Opens the full word page. Recorded as lookup friction only — never a grade."
                accessibilityLabel={`Open the word page for ${topResult.lexeme.headword}`}
                label="Word page"
                onPress={() => {
                  recordLookup({ targetType: 'lexeme', targetId: topResult.lexeme.id });
                  onOpenWord(topResult.lexeme.id);
                }}
                testID="capture-open-word"
              />
            ) : (
              <AppButton
                accessibilityHint="Opens the full kanji page. Recorded as lookup friction only — never a grade."
                accessibilityLabel={`Open the kanji page for ${topResult.kanji.character}`}
                label="Kanji page"
                onPress={() => {
                  recordLookup({ targetType: 'kanji', targetId: topResult.kanji.id });
                  onOpenKanji(topResult.kanji.character);
                }}
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
            <View accessibilityRole="radiogroup" style={styles.chips}>
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
              onPress={() => {
                if (result.kind === 'lexeme') {
                  recordLookup({ targetType: 'lexeme', targetId: result.lexeme.id });
                  onOpenWord(result.lexeme.id);
                } else {
                  recordLookup({ targetType: 'kanji', targetId: result.kanji.id });
                  onOpenKanji(result.kanji.character);
                }
              }}
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
  lexemes: seedDataset.lexemes.length,
  kanji: seedDataset.kanji.length,
} as const;

const styles = StyleSheet.create({
  searchRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  answer: {
    borderRadius: 8,
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
    borderRadius: 4,
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
