/**
 * Screen — reading (Campaign E, lane B4; campaign brief "B4: reading surface").
 *
 * ## What this screen is for
 *
 * It is where immersion happens, and the round-2 research names the one rule it
 * has to keep (`docs/design/BUNKI_COMPETITIVE_RESEARCH_ROUND2_2026-07-28.md` §4
 * and §5): **the lookup and the capture must happen without leaving the
 * content**, and if capturing costs a navigation it is wrong — measured, not
 * asserted. `src/ui/reading/inline-lookup.tsx` is the panel that keeps it and
 * `e2e/reading-surface.spec.ts` is the measurement.
 *
 * ## Reading is exposure
 *
 * Nothing here writes evidence and nothing here moves a memory state. The only
 * commands this file can issue are `capture` and `promote`-to-`keep`, which are
 * the same two the front door issues: they record that the learner met a word,
 * which is a different thing from answering a question about it. There is no
 * probe on this screen, nothing is revealed after an answer, and no path from
 * this module reaches the evidence gate. `test/reading-surface.test.ts` asserts
 * the command list from the source rather than trusting this paragraph.
 *
 * `keep` is also the rung that activates nothing: REQ-DM-09 puts contract
 * activation at `learn`, and taking a thread up for study stays where it already
 * is — a deliberate press on the capture screen, beside the thread it is about.
 *
 * ## Where the marks come from
 *
 * Only words on *this* learner's frontier carry one, and the whole rule is in
 * `src/ui/reading/frontier-state.ts`: no capture in the log at all is the
 * frontier mark, and a capture the learner flagged uncertain is the fragile
 * mark. There is no per-level colouring and there is no third mark — frozen
 * §10.4 rejects Todaii's global-JLPT rainbow by name, and `FrontierPassage`
 * caps the marked proportion of the page on top of that.
 *
 * ## Where the words come from
 *
 * The seed passage declares its own vocabulary (`SeedPassage.lexemeIds`), and
 * those are the only forms made interactive. Scanning the 3,000-entry imported
 * tier for the longest substring that happens to be a headword would light up
 * far more of the page and would sometimes be confidently wrong —
 * 「聞いていたからだ」 ends in a real headword that is not the word in the
 * sentence. `src/ui/reading/passage-spans.ts` has the argument in full; the
 * screen states the consequence where a learner can read it.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  findLexemeById,
  IMPORTED_TIER,
  passageForLexeme,
  sentencesForLexeme,
  tierOf,
  type SeedLexeme,
  type SeedPassage,
} from '../data/catalog.ts';
import { distinctProvenance, provenanceSummary } from '../data/provenance.ts';
import { useAppSnapshot, useAppStore, useDebugFlags } from '../state/app-context.tsx';
import { DURABILITY_NOTES, type CommandAck } from '../state/store.ts';
import { useLookup } from '../state/use-lookup.ts';
import { type AttributionLine } from '../ui/attribution.tsx';
import { type FrontierSpan } from '../ui/frontier-marks.ts';
import { SeedEntryDisclosure } from '../ui/notices.tsx';
import { markFor, FRONTIER_MARK_BASIS } from '../ui/reading/frontier-state.ts';
import {
  InlineLookup,
  type LookupEntry,
  type LookupExample,
} from '../ui/reading/inline-lookup.tsx';
import {
  buildPassageSpans,
  lookupSpanCount,
  type LookupForm,
} from '../ui/reading/passage-spans.ts';
import { ReadingPassage } from '../ui/reading/reading-passage.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

/**
 * The passage this build ships, found by the target it was written around
 * rather than by its record id.
 *
 * `passageForLexeme` asks the dataset which passage embeds the canonical target
 * (OD-02), so renaming a record cannot silently empty this screen — it would
 * have to stop embedding 分岐, which is a change to what the passage *is*.
 */
const CANONICAL_PASSAGE_LEXEME = 'lex-bunki';

/**
 * What a capture from this surface says about itself (REQ-SRC-01).
 *
 * `text`, because the encounter physically came from a passage of text, and the
 * locator is that passage's own record id, so the event can say which page the
 * word was met on rather than only that it was met somewhere.
 */
function readingSourceRef(passage: SeedPassage): {
  readonly sourceId: string;
  readonly kind: 'text';
  readonly locator: string;
} {
  return { sourceId: 'seed-reading-passage', kind: 'text', locator: passage.id };
}

/**
 * The encounter is the learner's own act, so it carries their licence — the
 * wording REQ-SRC-01's own note uses. The attribution names the page it
 * happened on, which is this project's writing rather than theirs, so the two
 * facts stay separable in the log.
 */
function readingProvenance(passage: SeedPassage): {
  readonly source: string;
  readonly license: string;
  readonly attribution: string;
  readonly modificationStatus: 'unmodified';
  readonly reviewStatus: 'unreviewed';
} {
  return {
    source: 'user_encounter',
    license: 'user_owned',
    attribution: `Met while reading “${passage.title}” (${passage.id}), written by this project.`,
    modificationStatus: 'unmodified',
    reviewStatus: 'unreviewed',
  };
}

export interface ReadingScreenProps {
  /** The deliberate exit from the lookup. The only navigation this screen offers. */
  readonly onOpenWord: (lexemeId: string) => void;
}

export function ReadingScreen({ onOpenWord }: ReadingScreenProps): ReactNode {
  const theme = useTheme();
  const store = useAppStore();
  const snapshot = useAppSnapshot();
  const flags = useDebugFlags();

  const [furigana, setFurigana] = useState(false);
  const [openLexemeId, setOpenLexemeId] = useState<string | null>(null);
  const [acknowledgements, setAcknowledgements] = useState<Readonly<Record<string, string>>>({});

  const resolve = useCallback(() => passageForLexeme(CANONICAL_PASSAGE_LEXEME), []);

  const { state, retry } = useLookup<SeedPassage>(resolve, {
    flags,
    emptyMessage: 'This build ships no reading passage.',
    emptyDetail:
      'The seed carries exactly one hand-written passage and it is found by the canonical target it was written around. Nothing was lost — there is nothing here to show.',
  });

  /**
   * What the learner's own log says about each word, keyed by lexeme.
   *
   * Read from the snapshot, never recomputed: `ThreadView` is what the store
   * derives from `@bunki/domain`'s reducer, and a second opinion computed here
   * would be a second answer to "do I know this", which is the fragmentation the
   * whole Trace exists to cure (frozen §10.6).
   */
  const knowledge = useMemo(() => {
    const byLexeme = new Map<string, { captured: boolean; flaggedUncertain: boolean }>();
    for (const thread of snapshot.threads) {
      if (thread.lexemeId === null) continue;
      const previous = byLexeme.get(thread.lexemeId);
      const flagged = thread.uncertainty !== null || thread.markRecordedInLog;
      byLexeme.set(thread.lexemeId, {
        captured: true,
        flaggedUncertain: (previous?.flaggedUncertain ?? false) || flagged,
      });
    }
    return byLexeme;
  }, [snapshot.threads]);

  const passage = state.kind === 'ready' ? state.data : null;

  const forms = useMemo<readonly LookupForm[]>(() => {
    if (passage === null) return [];
    return passage.lexemeIds
      .map((lexemeId) => findLexemeById(lexemeId))
      .filter((lexeme): lexeme is SeedLexeme => lexeme !== null)
      .map((lexeme) => ({
        form: lexeme.headword,
        lexemeId: lexeme.id,
        reading: lexeme.reading,
        mark: markFor(knowledge.get(lexeme.id) ?? { captured: false, flaggedUncertain: false }),
      }));
  }, [passage, knowledge]);

  const spans = useMemo(
    () => (passage === null ? [] : buildPassageSpans(passage.body, forms)),
    [passage, forms],
  );

  const openEntry = useMemo<LookupEntry | null>(() => {
    if (openLexemeId === null) return null;
    const lexeme = findLexemeById(openLexemeId);
    if (lexeme === null) return null;
    const mark = markFor(knowledge.get(lexeme.id) ?? { captured: false, flaggedUncertain: false });
    return {
      lexemeId: lexeme.id,
      headword: lexeme.headword,
      reading: lexeme.reading,
      senses: lexeme.senses,
      partOfSpeech: lexeme.partOfSpeech,
      mark,
      // The clause plus its subject: "線路 — nothing in your log mentions it
      // yet." The clause itself is shared with the passage legend, so the two
      // cannot drift into saying different things about the same mark.
      markBasis: `${lexeme.headword} — ${FRONTIER_MARK_BASIS[mark]}.`,
      tier: tierOf(lexeme.id) === IMPORTED_TIER ? 'imported tier' : 'fixture tier',
      examples: examplesFor(lexeme.id),
      attribution: attributionFor(lexeme),
      standing:
        'Readings, senses and parts of speech are dictionary fields. The passage, its translation and the worked example sentences are this project’s own writing and were reviewed by nobody outside it.',
    };
  }, [openLexemeId, knowledge]);

  /**
   * Keep the open word.
   *
   * The same two commands the front door runs, in the same order, for the same
   * reason: `capture` records the encounter and `promote` moves the thread out
   * of `captured` to `keep`, which activates nothing. Both are synchronous, so
   * the acknowledgement below renders from what was actually appended.
   */
  const keep = useCallback(() => {
    if (passage === null || openEntry === null) return;

    const captureAck = store.execute({
      kind: 'capture',
      text: openEntry.headword,
      sourceRef: readingSourceRef(passage),
      provenance: readingProvenance(passage),
      uncertainty: null,
      lexemeId: openEntry.lexemeId,
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

    setAcknowledgements((previous) => ({
      ...previous,
      [openEntry.lexemeId]: acknowledgementLine(openEntry.headword, ack),
    }));
  }, [openEntry, passage, store]);

  return (
    <ScreenShell
      subtitle="One passage, set to be read. Tap a word to look it up here — the page does not move."
      testID="screen-reading"
      title="Reading"
      titleJa="読む"
    >
      {state.kind === 'loading' ? <LoadingPanel label="Opening the passage…" /> : null}

      {state.kind === 'error' ? (
        <ErrorPanel detail={state.detail} message={state.message} onRetry={retry} />
      ) : null}

      {state.kind === 'empty' ? <EmptyPanel detail={state.detail} message={state.message} /> : null}

      {passage === null ? null : (
        <ReadingPassage
          furigana={furigana}
          furiganaScopeNote={furiganaScopeNote(spans)}
          lookup={
            openEntry === null ? (
              <Text
                style={[styles.hint, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
                testID="reading-lookup-hint"
              >
                {`${String(lookupSpanCount(spans))} places on this page have an entry in this build and open a lookup where they stand. Everything else renders as ordinary text rather than being guessed at.`}
              </Text>
            ) : (
              <InlineLookup
                entry={openEntry}
                keepAcknowledgement={acknowledgements[openEntry.lexemeId] ?? null}
                onClose={() => setOpenLexemeId(null)}
                onKeep={keep}
                onOpenWord={() => onOpenWord(openEntry.lexemeId)}
                testID="reading-lookup"
              />
            )
          }
          onOpen={setOpenLexemeId}
          onToggleFurigana={() => setFurigana((was) => !was)}
          spans={spans}
          testID="reading-surface"
          title={passage.title}
          titleTranslation={passage.titleTranslation}
          translation={passage.english}
        />
      )}

      {/*
        Unconditional, for the reason the capture screen's own note gives at
        length: every gate anyone has put on this notice has gone stale as the
        set of licensed things on the screen grew. The passage is this project's
        writing, but every lookup on it renders JMdict readings, senses and parts
        of speech, and §3 of the EDRDG licence statement asks for the
        acknowledgement on the screen that displays them.
      */}
      <SeedEntryDisclosure />

      <View style={styles.footnote}>
        <Text style={[styles.hint, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {DURABILITY_NOTES[store.durability]}
        </Text>
      </View>
    </ScreenShell>
  );
}

/** The store's own report of what a keep did. Never upgraded by this screen. */
function acknowledgementLine(headword: string, ack: CommandAck): string {
  if (ack.events.length === 0) {
    return `Already kept — ${headword}. No new events; this exact capture was already in the log. ${DURABILITY_NOTES[ack.durability]}`;
  }
  const types = ack.events.map((event) => event.type).join(', ');
  return `Kept — ${headword} at ${ack.acknowledgedAt}. ${String(ack.events.length)} event(s): ${types}. ${DURABILITY_NOTES[ack.durability]}`;
}

/**
 * The worked example sentences that reference this entry.
 *
 * The fixture tier's eight sentences are this project's own writing, so the
 * credit under each one says that rather than naming a corpus. The imported
 * tier's Tatoeba pairs name their contributor instead, and neither wording is
 * reachable from the other — the credit is built from the record's own
 * provenance.
 */
function examplesFor(lexemeId: string): readonly LookupExample[] {
  return sentencesForLexeme(lexemeId).map((sentence) => ({
    text: sentence.japanese,
    translation: sentence.english,
    credit: provenanceSummary(sentence.provenance.japanese),
  }));
}

/**
 * How the surface says which words carry a reading, without over-claiming.
 *
 * A count of *places*, not of words: 道 is one entry and three occurrences, and
 * "the 10 words in this passage" would be wrong about both numbers. The
 * distinction matters because the sentence exists to stop a learner concluding
 * the toggle is broken on the rest of the page.
 */
function furiganaScopeNote(spans: readonly FrontierSpan[]): string {
  const places = lookupSpanCount(spans);
  const entries = new Set(
    spans.map((span) => span.lexemeId).filter((id): id is string => id !== undefined),
  ).size;
  return (
    `Furigana appears at the ${String(places)} places in this passage — ${String(entries)} distinct entries — where this build ` +
    'has a dictionary reading. The rest carries no reading data, so none is guessed.'
  );
}

/**
 * Attribution lines for the fields the lookup actually displays.
 *
 * The required attribution and where it came from, and deliberately not the
 * provenance record's `notes`. Those notes are several hundred words of
 * importer bookkeeping — why a modification status is `derived`, which host
 * answered — and on a reading surface they are a wall of text under a passage
 * that is 160 characters long. They are not dropped: the whole record is on
 * *About & diagnostics*, which is also the screen the EDRDG statement's second
 * clause asks for, and the last line here says so.
 */
function attributionFor(lexeme: SeedLexeme): readonly AttributionLine[] {
  const shown: readonly (readonly [string, keyof SeedLexeme['provenance']])[] = [
    ['Reading', 'reading'],
    ['Senses', 'senses'],
    ['Part of speech', 'partOfSpeech'],
  ];
  const fieldLines = shown.map(([label, field]) => ({
    field: label,
    source: provenanceSummary(lexeme.provenance[field]),
  }));

  const sources = distinctProvenance(shown.map(([, field]) => lexeme.provenance[field]));
  const sourceLines = sources.map((record) => ({
    field: record.source,
    source: [record.attribution, record.source_url]
      .filter((part): part is string => part !== null && part !== '')
      .join(' · '),
  }));

  return [
    ...fieldLines,
    ...sourceLines,
    {
      field: 'Full record',
      source:
        'Every field of this entry’s provenance — version, retrieval date, upstream entry id and the importer’s notes — is on About & diagnostics.',
    },
  ];
}

const styles = StyleSheet.create({
  hint: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.65,
  },
  footnote: {
    marginTop: SPACE.lg,
  },
});
