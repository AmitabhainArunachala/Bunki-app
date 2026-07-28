/**
 * Screen 2 — the word page (WP-05, rebuilt for Campaign E lane B3;
 * controller §10.2, REQ-UI-02).
 *
 * ## What changed, and why
 *
 * The Phase-0 version of this screen was a correct lookup result: four labelled
 * layers, one toggle, and a list of fields. The campaign brief's bar is the
 * operator's own sentence — *"a kanji page should feel like a museum card, not
 * a spreadsheet row"* — and at dictionary scale a lookup result is exactly the
 * spreadsheet row: 取る has 63 English wordings, 気 has 76 words it can be
 * confused with, and a flat page renders both as a wall.
 *
 * So this is the same four layers of REQ-UI-02, laid out as a card with depth
 * behind it. The layer test ids are kept (`word-layer-0` … `word-layer-3`)
 * because the layers are still the skeleton and other harnesses resolve them:
 *
 *   - **Layer 0** is now a `MuseumCard`: the headword large in mincho with its
 *     reading as first-class furigana, one gloss as the caption, the catalogue
 *     small and beneath, and memory state as five meters — one per capability
 *     lens, never one number for the word (REQ-UI-07, REQ-LM-03).
 *   - **Layer 2** — what is around the word — is now four sections, each behind
 *     a `Disclosure` that states how many things are inside and why: the
 *     wordings, the characters (each with its own memory state, so a bright
 *     word built from a dark character is visible), the family, the contrast
 *     set, and the sentences it actually appears in.
 *   - **Layer 1** — this encounter — is unchanged in substance: the thread, the
 *     mark, the promotion gesture and the bounded AI candidate.
 *   - **Layer 3** is the provenance table and the honest gaps.
 *
 * ## What this screen may and may not do
 *
 * It reads and it submits commands. It mints nothing. The memory state it draws
 * comes from `@bunki/domain`'s own projection over the kernel's derived state
 * (`src/ui/word/memory.ts`), which is a read: opening this page produces no
 * event, no grade, and no change to anything scheduled — tapping through the
 * characters is exposure, and exposure is never retrieval (REQ-DM-07, T-08).
 * The only writes on the page are the promotion buttons and accepting a
 * candidate, and both go through `AppStore.execute`.
 *
 * ## What is still honestly missing
 *
 *   - **Per-sense grouping and per-sense part of speech.** JMdict has both;
 *     this build's importer flattens glosses across senses and collects parts of
 *     speech at the entry level, and `src/ui/word/glosses.ts` refuses to fake
 *     the structure back. The page says so where a reader would otherwise
 *     assume it.
 *   - **Pitch accent, conjugation tables, frequency and JLPT labels.** No
 *     licensed source for the first, no per-entry data for the rest.
 *   - **Audio.** None in this build.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  findLexemeById,
  importedDictionary,
  importedSentencesFor,
  passageForLexeme,
  seedDataset,
  sentencesForLexeme,
  tierOf,
  type SeedLexeme,
} from '../data/catalog.ts';
import { importedExtras, importedSentenceProvenance } from '../data/imported-tier.ts';
import { distinctProvenance } from '../data/provenance.ts';
import type { ProvenanceRecord } from '@bunki/seed';
import { CandidatePanel, seededContextFor, useCandidate } from '../candidate/index.ts';
import {
  useAiRuntime,
  useAppSnapshot,
  useAppStore,
  useConnectivity,
  useDebugFlags,
} from '../state/app-context.tsx';
import { DEFERRED_BY_ID } from '../state/deferred.ts';
import { MANUAL_PROVENANCE, manualSource } from '../state/encounter-source.ts';
import { createSystemClock } from '../state/runtime.ts';
import { UNCERTAINTY_LABELS, uncertaintyLogNote } from '../state/store.ts';
import { useLookup } from '../state/use-lookup.ts';
import {
  ProvenanceLine,
  ProvenanceTable,
  SeedEntryDisclosure,
  UnsupportedLayer,
} from '../ui/notices.tsx';
import { AppButton, Hairline, RowButton, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { RADIUS, SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';
import { LensRow } from '../ui/lens.tsx';
import { CAPABILITY_IDS, type CapabilityId } from '../ui/capability.ts';
import { componentIdsFor, readWordMemory } from '../ui/word/memory.ts';
import { contrastSet, familyByKanji, kanjiInWord } from '../ui/word/neighbourhood.ts';
import { WordHero } from '../ui/word/word-hero.tsx';
import { WordKanji } from '../ui/word/word-kanji.tsx';
import { WordSenses } from '../ui/word/word-senses.tsx';
import { WordContrast, WordFamily } from '../ui/word/word-relations.tsx';
import { WordSentences } from '../ui/word/word-sentences.tsx';

export interface WordScreenProps {
  readonly lexemeId: string;
  readonly onOpenKanji: (character: string) => void;
  readonly onOpenWord: (lexemeId: string) => void;
  readonly onBack: () => void;
}

/** The one lens the character rows are about when the page opens. */
const DEFAULT_LENS: CapabilityId = 'reading';

export function WordScreen({
  lexemeId,
  onOpenKanji,
  onOpenWord,
  onBack,
}: WordScreenProps): ReactNode {
  const theme = useTheme();
  const flags = useDebugFlags();
  const store = useAppStore();
  const snapshot = useAppSnapshot();
  const [lens, setLens] = useState<CapabilityId>(DEFAULT_LENS);
  const [expandAll, setExpandAll] = useState(false);

  const resolve = useCallback(() => findLexemeById(lexemeId), [lexemeId]);
  const { state, retry } = useLookup<SeedLexeme>(resolve, {
    flags,
    emptyMessage: `No seed word has the id “${lexemeId}”.`,
    emptyDetail: `This build carries ${String(seedDataset.lexemes.length + importedDictionary.lexemes.length)} words — the Phase-0 seed plus an imported slice of JMdict. It is not the whole dictionary.`,
  });

  // The candidate hook is resolved *above* the early returns, because hooks
  // cannot be called conditionally and the loading/error/empty branches below
  // return before the body. It tolerates every not-ready shape — a null lexeme,
  // a null thread, a word the seed has no sentence for — by refusing to request,
  // which is why it can be wired here rather than inside the ready branch.
  const resolvedLexeme = state.kind === 'ready' ? state.data : null;
  const candidateThread =
    resolvedLexeme === null
      ? null
      : (snapshot.threads.find((candidate) => candidate.lexemeId === resolvedLexeme.id) ?? null);
  const ai = useCandidate({
    runtime: useAiRuntime(),
    threadId: candidateThread?.state.threadId ?? null,
    context: resolvedLexeme === null ? null : seededContextFor(resolvedLexeme),
    existing: snapshot.candidatesByThread[candidateThread?.state.threadId ?? '']?.[0] ?? null,
  });
  const connectivity = useConnectivity();

  /*
    The evidence this page draws, read once per applied command.

    `readDerived` is the kernel's own replay; `readWordMemory` builds the
    projection index over it once and answers for the word and for every
    character from that one index. The instant comes from `createSystemClock`,
    which is the app's single seam onto the wall clock (`src/state/runtime.ts`);
    a screen that called `Date.now()` itself would make that file's statement
    about being the only reader false.
  */
  const memory = useMemo(() => {
    const derived = store.readDerived();
    return readWordMemory({
      contracts: derived.contracts,
      memoryStates: derived.memoryStates,
      at: createSystemClock().now(),
    });
    // `snapshot.revision` bumps on every applied command, which is exactly when
    // the answer can change; `store` is stable for the app's lifetime.
  }, [store, snapshot.revision]);

  if (state.kind === 'loading') {
    return (
      <ScreenShell testID="screen-word" title="Word">
        <LoadingPanel label="Looking up…" />
      </ScreenShell>
    );
  }

  if (state.kind === 'error') {
    return (
      <ScreenShell testID="screen-word" title="Word">
        <ErrorPanel detail={state.detail} message={state.message} onRetry={retry} />
        <AppButton accessibilityHint="Returns to search." label="Back to search" onPress={onBack} />
      </ScreenShell>
    );
  }

  if (state.kind === 'empty') {
    return (
      <ScreenShell testID="screen-word" title="Word">
        <EmptyPanel detail={state.detail} message={state.message} />
        <AppButton accessibilityHint="Returns to search." label="Back to search" onPress={onBack} />
      </ScreenShell>
    );
  }

  const lexeme = state.data;
  const characters = kanjiInWord(lexeme);
  const family = familyByKanji(lexeme);
  const contrasts = contrastSet(lexeme);
  const worked = sentencesForLexeme(lexeme.id);
  const passage = passageForLexeme(lexeme.id);
  // Tatoeba pairs, for an imported word. Empty for a fixture word, whose eight
  // worked examples are this project's own writing.
  const tatoeba = importedSentencesFor(lexeme);
  const extras = importedExtras(lexeme.id);
  // Same lookup the candidate hook above already did; reused rather than
  // repeated so the panel and the page can never disagree about which thread
  // this word belongs to.
  const thread = candidateThread;
  const otherEncounters = snapshot.threads.filter(
    (candidate) => candidate.state.threadId !== thread?.state.threadId,
  );
  // "One high-value explanation or contrast" (Layer 1), only when the seed has
  // one that names this word's construction. Nothing is generated here.
  const construction =
    seedDataset.grammar.find((entry) =>
      worked.some((sentence) => sentence.constructionIds.includes(entry.id)),
    ) ?? null;

  /*
    The node this word's evidence hangs on.

    A Phase-0 KnowledgeComponent is identified by the exact text that was
    captured, so the headword is the id when the learner searched for the word,
    and a thread's own captured text is the id when they selected it out of
    something longer. Both are offered; a component nothing was ever captured
    against simply has no contracts and reads as unmeasured.
  */
  const wordComponentIds = componentIdsFor([
    lexeme.headword,
    ...snapshot.threads
      .filter((candidate) => candidate.lexemeId === lexeme.id)
      .map((candidate) => candidate.displayText),
  ]);
  const wordLenses = memory.lensViewsFor(wordComponentIds);
  const kanjiRows = characters.map((entry) => ({
    entry,
    lens: memory.lensViewFor(componentIdsFor([entry.character]), lens),
  }));

  const promote = (to: 'keep' | 'learn' | 'master'): void => {
    if (thread === null) return;
    store.execute({ kind: 'promote', threadId: thread.state.threadId, to });
  };

  /**
   * Start a thread from the page you are already on (Wave D).
   *
   * The master definition-of-done asks that *"a word met anywhere shows up
   * everywhere it should"*, and this page used to answer a word with no thread
   * by saying "keep it from the capture screen" — sending the learner to the
   * front door to type a word they were looking at. That is where the
   * cross-surface trace stopped: a word reached from the guide's road, from a
   * map node, or from a passage could not become a thread without leaving.
   *
   * The two commands are the same pair the capture screen executes, in the same
   * order, through the same store: `capture` then `promote → keep`. Nothing here
   * touches the evidence gate — keeping activates no retrieval contract, and
   * `learn`, the rung that does, stays a separate press the learner makes
   * (REQ-DM-09). The source record says `word-screen`, so the log records where
   * the encounter actually happened rather than claiming the front door.
   */
  const keepFromHere = (): void => {
    if (lexeme === null) return;
    const captured = store.execute({
      kind: 'capture',
      text: lexeme.headword,
      sourceRef: manualSource('word-screen'),
      provenance: MANUAL_PROVENANCE,
      uncertainty: null,
      lexemeId: lexeme.id,
    });
    const started = store.getSnapshot().threadsById[captured.threadId];
    if (started !== undefined && started.state.promotion === 'captured') {
      store.execute({ kind: 'promote', threadId: captured.threadId, to: 'keep' });
    }
  };

  /*
    The card's own attribution: which source each displayed field came from, and
    under what licence. One line per source, not the licensor's full statement —
    the statement is long, it is required to be *available* rather than to be
    the loudest thing on the card, and Layer 3 below renders it in full through
    `ProvenanceTable`. The `<SeedEntryDisclosure />` above the card is the
    on-screen acknowledgement EDRDG §3 asks for, and it is unconditional.
  */
  const HERO_FIELDS = [
    ['Headword', lexeme.provenance.headword],
    ['Reading', lexeme.provenance.reading],
    ['Senses', lexeme.provenance.senses],
    ['Part of speech', lexeme.provenance.partOfSpeech],
  ] as const;
  const attribution = distinctProvenance(HERO_FIELDS.map(([, record]) => record)).map((record) => ({
    field: HERO_FIELDS.filter(([, candidate]) => candidate.source === record.source)
      .map(([name]) => name)
      .join(', '),
    source: `${record.source} · ${record.license}`,
  }));

  const catalogue = [
    lexeme.partOfSpeech.length === 0
      ? 'Part of speech not recorded for this entry.'
      : lexeme.partOfSpeech.join(' · '),
    `Written with ${lexeme.kanjiUsed.length === 0 ? 'no kanji' : lexeme.kanjiUsed.join('・')}`,
    `${tierOf(lexeme.id)} tier${extras === null ? '' : ` · JMdict entry ${extras.sourceEntryId}`}`,
  ];

  return (
    <ScreenShell
      notice={<SeedEntryDisclosure />}
      subtitle="The entry, the characters it is built from, what it is confused with, and where it appears."
      testID="screen-word"
      title="Word"
    >
      {/* ------------------------------------------------ Layer 0 */}
      <View testID="word-layer-0">
        <WordHero
          attribution={attribution}
          caption={lexeme.senses[0] ?? ''}
          catalogue={catalogue}
          headword={lexeme.headword}
          lenses={wordLenses}
          reading={lexeme.reading}
          standing="Readings and senses are JMdict’s, flattened by this build’s importer. The memory state above is this device’s own event log, read through the kernel’s projection. Each source’s full statement is under “Provenance and the gaps” at the foot of this page."
        />
      </View>

      {/* ------------------------------------------------ Layer 2 */}
      <View style={styles.depth} testID="word-layer-2">
        <WordSenses
          glosses={lexeme.senses}
          partOfSpeech={lexeme.partOfSpeech}
          priorityTags={extras?.priorityTags ?? []}
        />

        <Section
          note="Choose the capability the character rows below are about. Exactly one at a time — five capabilities blended into one light is the mastery score this app does not have."
          testID="word-lens-picker"
          title="The characters it is written with"
        >
          <LensRow
            active={lens}
            available={CAPABILITY_IDS}
            onChange={setLens}
            testID="word-lens-row"
          />
          <WordKanji capability={lens} onOpenKanji={onOpenKanji} rows={kanjiRows} />
        </Section>

        {/*
          The label names exactly the three sections below it, and not "every
          section" — the gloss tail above has its own disclosure and this control
          does not reach it. A label describing more than the code does is the
          defect this page already shipped once this round.
        */}
        <AppButton
          accessibilityHint={
            expandAll
              ? 'Closes the family, contrast and sentence sections.'
              : 'Opens the family, contrast and sentence sections at once.'
          }
          label={expandAll ? 'Close the three sections below' : 'Open the three sections below'}
          onPress={() => setExpandAll((was) => !was)}
          testID="word-toggle-deeper"
        />

        {/*
          Keyed on the toggle so that flipping it re-mounts the three sections
          with the new initial state. `Disclosure` owns its own open/closed
          state, which is right — a section a learner opened should stay open —
          so overriding all three at once means giving them a fresh mount rather
          than reaching into their state. Each header still states its count and
          its reason whether it is open or shut.
        */}
        <View key={expandAll ? 'all-open' : 'all-shut'} style={styles.depth}>
          <WordFamily groups={family} initiallyOpen={expandAll} onOpenWord={onOpenWord} />
          <WordContrast initiallyOpen={expandAll} onOpenWord={onOpenWord} set={contrasts} />
          <WordSentences
            initiallyOpen={expandAll}
            tatoeba={tatoeba}
            tatoebaProvenance={(importedSentenceProvenance['japanese'] as ProvenanceRecord) ?? null}
            worked={worked}
          />
        </View>

        {passage === null ? null : (
          <Section
            note="The hand-written thematic passage this word appears in. The interactive reading canvas over it is the session's surface, not this page's."
            testID="word-passage"
            title="In the seed passage"
          >
            <View
              style={[
                styles.card,
                { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
              ]}
            >
              <Text
                style={[
                  styles.cardTitle,
                  { color: theme.color.ink, fontFamily: theme.font.mincho },
                ]}
              >
                {passage.title}
              </Text>
              <Text
                style={[
                  styles.example,
                  {
                    color: theme.color.ink,
                    fontFamily: theme.font.mincho,
                    lineHeight: TYPE.body * theme.leading.japanese,
                  },
                ]}
              >
                {passage.body}
              </Text>
              <ProvenanceLine field="body" record={passage.provenance.body} />
            </View>
          </Section>
        )}
      </View>

      <Hairline />

      {/* ------------------------------------------------ Layer 1 */}
      <Section
        note="The encounter that started this thread, what looked uncertain, and what to do next."
        testID="word-layer-1"
        title="This encounter"
      >
        {thread === null ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            No encounter recorded for this word in this session.
          </Text>
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
            ]}
          >
            <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
              {thread.displayText}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              Captured {thread.capturedAt} · source: manual entry ·{' '}
              {String(thread.state.encounterIds.length)} encounter(s)
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              testID="word-uncertainty"
            >
              {thread.uncertainty === null
                ? thread.markRecordedInLog
                  ? uncertaintyLogNote(null, { kept: true, markRecordedInLog: true })
                  : 'Nothing marked uncertain.'
                : `Marked uncertain: ${UNCERTAINTY_LABELS[thread.uncertainty.dimension]}. ${uncertaintyLogNote(thread.uncertainty, { kept: true })}`}
            </Text>
          </View>
        )}

        <View style={styles.promotionRow}>
          <Text
            style={[
              styles.promotionState,
              { color: theme.color.vermilion, fontFamily: theme.font.sans },
            ]}
            testID="word-promotion-state"
          >
            {thread === null ? 'not kept' : thread.state.promotion}
          </Text>
          {thread === null ? (
            <View style={styles.actions}>
              <AppButton
                accessibilityHint="Records this encounter and starts a thread for it, without leaving this page. Keeping activates no retrieval contract; taking it up for study is a separate press."
                accessibilityLabel={`Keep ${lexeme.headword}`}
                label={`Keep ${lexeme.headword}`}
                onPress={keepFromHere}
                testID="word-keep"
                variant="primary"
              />
            </View>
          ) : (
            <View style={styles.actions}>
              {(['keep', 'learn', 'master'] as const)
                .filter((target) => target !== thread.state.promotion)
                .map((target) => (
                  <AppButton
                    accessibilityHint={`Moves this thread from ${thread.state.promotion} to ${target}.`}
                    accessibilityLabel={`Promote ${lexeme.headword} to ${target}`}
                    key={target}
                    label={target}
                    onPress={() => promote(target)}
                    testID={`word-promote-${target}`}
                  />
                ))}
            </View>
          )}
        </View>

        {construction === null ? (
          <UnsupportedLayer
            reason="No seed grammar construction is attached to this word’s example sentences. The panel below can ask for a generated one, which arrives labelled as a candidate and is never a canonical field on this page."
            testID="word-explanation-unfilled"
            title="One high-value explanation or contrast"
          />
        ) : (
          <View
            style={[
              styles.card,
              { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
            ]}
          >
            <Text
              style={[styles.cardTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              {construction.pattern} — {construction.name}
            </Text>
            <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
              {construction.explanation}
            </Text>
            <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
              {construction.example}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {construction.exampleTranslation}
            </Text>
            <ProvenanceLine field="explanation" record={construction.provenance.explanation} />
          </View>
        )}

        {/* The bounded AI exchange (WP-07). It sits *below* the seed's own
            explanation deliberately: what the seed can say with provenance comes
            first, and the generated candidate is an addition to it rather than a
            replacement for it. Everything the panel renders is labelled by
            `@bunki/ai`'s own view model (T-12), and accepting one is an explicit
            press that produces `CandidateAcceptedAsNote` — never a canonical
            field on this page (REQ-ARCH-04, T-09). */}
        <CandidatePanel
          headword={lexeme.headword}
          offline={connectivity === 'offline'}
          onAccept={ai.accept}
          onRequest={ai.request}
          state={ai.state}
          testID="word-candidate-panel"
        />

        <Text style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          Recent related encounters
        </Text>
        {otherEncounters.length === 0 ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            None yet. This list shows threads you actually kept, not seed words.
          </Text>
        ) : (
          otherEncounters.slice(0, 5).map((other) => (
            <RowButton
              accessibilityHint="Opens that thread’s word page."
              accessibilityLabel={`${other.displayText}, ${other.state.promotion}`}
              key={other.state.threadId}
              onPress={() => {
                if (other.lexemeId !== null) onOpenWord(other.lexemeId);
              }}
            >
              <Text
                style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
              >
                {other.displayText}
              </Text>
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                {other.state.promotion} · kept {other.capturedAt}
              </Text>
            </RowButton>
          ))
        )}
      </Section>

      <Hairline />

      {/* ------------------------------------------------ Layer 3 */}
      <Section
        note="Everything this build can say about where each field came from, and the fields it has no source for."
        testID="word-layer-3"
        title="Provenance and the gaps"
      >
        <ProvenanceTable provenance={lexeme.provenance} testID="word-provenance-table" />
        <UnsupportedLayer
          reason={DEFERRED_BY_ID['WP05-D5']?.reason ?? 'No local audio in the Phase-0 seed.'}
          testID="word-audio-unfilled"
          title="Audio"
        />
        <UnsupportedLayer
          reason="REQ-UI-02 places pitch accent in Layer 2 “only when a licensed source is selected”. No pitch-accent source is selected, so nothing is shown rather than guessed."
          testID="word-pitch-unfilled"
          title="Pitch accent"
        />
        <UnsupportedLayer
          reason="JMdict groups its glosses into numbered senses and tags each sense with its own part of speech. This build’s importer flattens the glosses into one list and collects the parts of speech at the entry level, so the grouping is not available to render. Restoring it is an importer change, not a screen change."
          testID="word-sense-grouping-unfilled"
          title="Numbered senses, each with its own part of speech"
        />
        <UnsupportedLayer
          reason={
            DEFERRED_BY_ID['WP05-D3']?.reason ?? 'No licensed dictionary source is available.'
          }
          testID="word-jmdict-unfilled"
          title="Conjugation tables, frequency and JLPT labels"
        />
      </Section>

      <Hairline />
      <AppButton accessibilityHint="Returns to search." label="Back to search" onPress={onBack} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  depth: {
    gap: SPACE.lg,
  },
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  cardTitle: {
    fontSize: TYPE.body,
    fontWeight: '600',
  },
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.7,
  },
  example: {
    fontSize: TYPE.body,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  subheading: {
    fontSize: TYPE.label,
    fontWeight: '600',
    marginTop: SPACE.md,
  },
  promotionRow: {
    gap: SPACE.sm,
    marginTop: SPACE.sm,
  },
  promotionState: {
    fontSize: TYPE.label,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'lowercase',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
});
