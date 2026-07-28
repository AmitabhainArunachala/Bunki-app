/**
 * Screen 2 — word page (WP-05; controller §10.2, REQ-UI-02).
 *
 * REQ-UI-02 defines four layers. This screen renders layers 0 and 1 in full,
 * and layers 2 and 3 exactly as far as the Phase-0 seed honestly reaches —
 * which is controller §19 WP-05's own boundary: "not done: any layer-2/3
 * content the seed cannot support honestly."
 *
 * What "honestly" costs here is worth being explicit about, because the
 * temptation is to fill a section with something plausible:
 *
 *   - **pitch accent** is layer 2 "only when a licensed source is selected".
 *     None is. The section renders as an unfilled layer with the reason, not as
 *     an omission and not as a guess.
 *   - **frequency, JLPT, full JMdict fields** are layer 3. The seed carries
 *     none of them; no lexical source could be licence-verified in this build
 *     (ORCHESTRATION_LOG operator action, seed LICENSES.md D-1/D-2).
 *   - **"recent related encounters"** is layer 1 and is rendered from the
 *     learner's own threads in the store — real data, possibly empty, never
 *     padded with seed words pretending to be encounters.
 *   - **"one high-value explanation or contrast"** is rendered only when a seed
 *     grammar construction actually references this lexeme. There is no
 *     generated explanation on this screen; that is WP-07's candidate path and
 *     it does not exist yet.
 *
 * The seed's own `SEED_ENTRY_DISCLOSURE` sits above layer 0, because everything
 * below it — readings, senses, part of speech — is project-authored pending
 * licensed sources, and a page that looks like a dictionary page while that is
 * true would be the false claim REQ-GATE-03 forbids.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  constituentKanji,
  findLexemeById,
  passageForLexeme,
  sentencesForLexeme,
  wordFamily,
  type SeedLexeme,
} from '../data/catalog.ts';
import { seedDataset } from '../data/catalog.ts';
import { CandidatePanel, seededContextFor, useCandidate } from '../candidate/index.ts';
import {
  useAiRuntime,
  useAppSnapshot,
  useAppStore,
  useConnectivity,
  useDebugFlags,
} from '../state/app-context.tsx';
import { DEFERRED_BY_ID } from '../state/deferred.ts';
import { UNCERTAINTY_LABELS, uncertaintyLogNote } from '../state/store.ts';
import { useLookup } from '../state/use-lookup.ts';
import {
  ProvenanceLine,
  ProvenanceTable,
  SeedEntryDisclosure,
  UnsupportedLayer,
} from '../ui/notices.tsx';
import { AppButton, Hairline, RowButton, Section } from '../ui/primitives.tsx';
import { RubyText } from '../ui/ruby.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

export interface WordScreenProps {
  readonly lexemeId: string;
  readonly onOpenKanji: (character: string) => void;
  readonly onOpenWord: (lexemeId: string) => void;
  readonly onBack: () => void;
}

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
  const [showDeeper, setShowDeeper] = useState(false);

  const resolve = useCallback(() => findLexemeById(lexemeId), [lexemeId]);
  const { state, retry } = useLookup<SeedLexeme>(resolve, {
    flags,
    emptyMessage: `No seed word has the id “${lexemeId}”.`,
    emptyDetail: `The Phase-0 seed holds ${String(seedDataset.lexemes.length)} words. This is a seed dataset, not a dictionary.`,
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
  const kanji = constituentKanji(lexeme);
  const family = wordFamily(lexeme);
  const examples = sentencesForLexeme(lexeme.id);
  const passage = passageForLexeme(lexeme.id);
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
      examples.some((sentence) => sentence.constructionIds.includes(entry.id)),
    ) ?? null;

  const promote = (to: 'keep' | 'learn' | 'master'): void => {
    if (thread === null) return;
    store.execute({ kind: 'promote', threadId: thread.state.threadId, to });
  };

  return (
    <ScreenShell
      lede={<SeedEntryDisclosure />}
      subtitle="Layers 0 and 1 in full; layers 2 and 3 as far as the Phase-0 seed reaches."
      testID="screen-word"
      title="Word"
    >
      {/* ------------------------------------------------ Layer 0 */}
      <View
        style={[
          styles.hero,
          { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
        ]}
        testID="word-layer-0"
      >
        <RubyText
          reading={lexeme.reading}
          size={TYPE.headword}
          testID="word-headword"
          written={lexeme.headword}
        />
        <Text style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {lexeme.senses[0] ?? ''}
        </Text>
        <ProvenanceLine field="senses" record={lexeme.provenance.senses} />
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {lexeme.partOfSpeech.join(' · ')}
        </Text>

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
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              Keep it from the capture screen to start a thread.
            </Text>
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

        <UnsupportedLayer
          reason={DEFERRED_BY_ID['WP05-D5']?.reason ?? 'No local audio in the Phase-0 seed.'}
          testID="word-audio-unfilled"
          title="Audio (Layer 0, “when local”)"
        />
      </View>

      {/* ------------------------------------------------ Layer 1 */}
      <Section
        note="The encounter that started this thread, what looked uncertain, and what to do next."
        testID="word-layer-1"
        title="Layer 1 — this encounter"
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

        {/* The bounded AI exchange (WP-07, mounted in WP-10 per that package's
            coordination request 1). It sits *below* the seed's own explanation
            deliberately: what the seed can say with provenance comes first, and
            the generated candidate is an addition to it rather than a
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

        <Text style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          Constituent kanji
        </Text>
        {kanji.map((entry) => (
          <RowButton
            accessibilityHint="Opens the kanji page with its stroke order."
            accessibilityLabel={`Kanji ${entry.character}: ${entry.meanings.join(', ')}`}
            key={entry.id}
            onPress={() => onOpenKanji(entry.character)}
            testID={`word-kanji-${entry.character}`}
          >
            <Text
              style={[styles.rowKanji, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
            >
              {entry.character}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {entry.meanings.join(' · ')} · {String(entry.strokeCount)} strokes
            </Text>
          </RowButton>
        ))}
      </Section>

      <Hairline />

      <AppButton
        accessibilityHint={
          showDeeper
            ? 'Hides layers 2 and 3.'
            : 'Shows other senses, examples, and full provenance.'
        }
        label={showDeeper ? 'Hide layers 2 and 3' : 'Show layers 2 and 3'}
        onPress={() => setShowDeeper((value) => !value)}
        testID="word-toggle-deeper"
      />

      {!showDeeper ? null : (
        <>
          {/* ---------------------------------------------- Layer 2 */}
          <Section
            note="What the seed supports: other senses, the word family, and authentic-form examples written for this project."
            testID="word-layer-2"
            title="Layer 2 — around the word"
          >
            <Text
              style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              Other senses
            </Text>
            {lexeme.senses.length <= 1 ? (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                The seed records one sense for this word.
              </Text>
            ) : (
              <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
                {lexeme.senses.slice(1).join(' · ')}
              </Text>
            )}

            <Text
              style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              Word family (shares a kanji)
            </Text>
            {family.length === 0 ? (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                No other seed word shares a kanji with this one.
              </Text>
            ) : (
              family.map((relative) => (
                <RowButton
                  accessibilityHint="Opens that word’s page."
                  accessibilityLabel={`${relative.headword}, read ${relative.reading}: ${relative.senses.join(', ')}`}
                  key={relative.id}
                  onPress={() => onOpenWord(relative.id)}
                >
                  <RubyText
                    reading={relative.reading}
                    serif={false}
                    size={TYPE.body}
                    written={relative.headword}
                  />
                  <Text
                    style={[
                      styles.meta,
                      { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                    ]}
                  >
                    {relative.senses.slice(0, 3).join(' · ')}
                  </Text>
                </RowButton>
              ))
            )}

            <Text
              style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              Examples
            </Text>
            {examples.length === 0 ? (
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                No seed sentence references this word.
              </Text>
            ) : (
              examples.map((sentence) => (
                <View
                  key={sentence.id}
                  style={[
                    styles.card,
                    { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
                  ]}
                >
                  <Text
                    style={[
                      styles.example,
                      { color: theme.color.ink, fontFamily: theme.font.mincho },
                    ]}
                  >
                    {sentence.japanese}
                  </Text>
                  <Text
                    style={[
                      styles.meta,
                      { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                    ]}
                  >
                    {sentence.english}
                  </Text>
                  <ProvenanceLine field="japanese" record={sentence.provenance.japanese} />
                </View>
              ))
            )}

            {passage === null ? null : (
              <>
                <Text
                  style={[
                    styles.subheading,
                    { color: theme.color.ink, fontFamily: theme.font.sans },
                  ]}
                >
                  In the seed passage
                </Text>
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
                      { color: theme.color.ink, fontFamily: theme.font.mincho },
                    ]}
                  >
                    {passage.body}
                  </Text>
                  <ProvenanceLine field="body" record={passage.provenance.body} />
                  <Text
                    style={[
                      styles.meta,
                      { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                    ]}
                  >
                    The interactive reading canvas over this passage is a later work package; here
                    it is shown as text.
                  </Text>
                </View>
              </>
            )}

            <UnsupportedLayer
              reason="REQ-UI-02 places pitch accent in Layer 2 “only when a licensed source is selected”. No pitch-accent source is selected, so nothing is shown rather than guessed."
              testID="word-pitch-unfilled"
              title="Pitch accent"
            />
            <UnsupportedLayer
              reason="Collocations, register notes and confusables need a corpus or a licensed dictionary. The Phase-0 seed has neither."
              testID="word-collocations-unfilled"
              title="Collocations, register, confusables"
            />
          </Section>

          {/* ---------------------------------------------- Layer 3 */}
          <Section
            note="Everything the seed can say about where each field came from."
            testID="word-layer-3"
            title="Layer 3 — provenance and attribution"
          >
            <ProvenanceTable provenance={lexeme.provenance} testID="word-provenance-table" />
            <UnsupportedLayer
              reason={
                DEFERRED_BY_ID['WP05-D3']?.reason ?? 'No licensed dictionary source is available.'
              }
              testID="word-jmdict-unfilled"
              title="Full dictionary fields, conjugation tables, frequency and JLPT labels"
            />
          </Section>
        </>
      )}

      <Hairline />
      <AppButton accessibilityHint="Returns to search." label="Back to search" onPress={onBack} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 8,
    borderWidth: 1,
    gap: SPACE.sm,
    padding: SPACE.lg,
  },
  card: {
    borderRadius: 6,
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  cardTitle: {
    fontSize: TYPE.body,
    fontWeight: '600',
  },
  gloss: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.6,
  },
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.7,
  },
  example: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.9,
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
  rowKanji: {
    fontSize: TYPE.headwordRow,
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
