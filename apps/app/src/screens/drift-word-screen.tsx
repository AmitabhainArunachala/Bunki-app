/**
 * The Drift-tier word page (BUNKI_ONE_APP_CONVERGENCE_SPEC_2026-08-06.md §2).
 *
 * Where a tap on any of the universe's 6,692 words lands when the word is not
 * one of the sixteen curated seed entries. It renders exactly what the tier
 * honestly knows — headword, reading, one community-list gloss, JLPT level,
 * the word's kanji, and words that literally share a kanji — under the tier's
 * disclosure. Nothing here imitates the seed page's layers; a thin page that
 * says what it is beats a full-looking page that fabricates.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  driftKanjiInfo,
  driftKanjiOf,
  driftRelatedWords,
  findDriftWord,
} from '../data/drift-lexicon.ts';
import { AppButton, RowButton, Section } from '../ui/primitives.tsx';
import { DriftTierDisclosure } from '../ui/notices.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

export interface DriftWordScreenProps {
  readonly headword: string;
  readonly onBack: () => void;
  readonly onOpenKanji: (character: string) => void;
  readonly onOpenWord: (headword: string) => void;
}

export function DriftWordScreen({
  headword,
  onBack,
  onOpenKanji,
  onOpenWord,
}: DriftWordScreenProps): ReactNode {
  const theme = useTheme();
  const word = findDriftWord(headword);

  if (word === null) {
    return (
      <ScreenShell testID="screen-drift-word-missing" title="Word">
        <DriftTierDisclosure />
        <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          “{headword}” is not in the JLPT lexicon tier either.
        </Text>
        <AppButton accessibilityLabel="Back" label="← Back" onPress={onBack} variant="secondary" />
      </ScreenShell>
    );
  }

  const kanji = driftKanjiOf(word.headword);
  const related = driftRelatedWords(word.headword);

  return (
    <ScreenShell testID="screen-drift-word" title="Word">
      <DriftTierDisclosure />

      <View
        style={[
          styles.hero,
          { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
        ]}
        testID="drift-word-hero"
      >
        <Text
          style={[styles.reading, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {word.reading}
        </Text>
        <Text
          accessibilityLabel={`The word ${word.headword}`}
          accessibilityRole="header"
          style={[styles.headword, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
          testID="drift-word-headword"
        >
          {word.headword}
        </Text>
        <Text style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {word.gloss}
        </Text>
        <Text style={[styles.level, { color: theme.color.pig2, fontFamily: theme.font.sans }]}>
          JLPT N{word.level}
        </Text>
      </View>

      {kanji.length > 0 ? (
        <Section
          note="Tap a character for its readings, components, and other words."
          title="Kanji in this word"
        >
          {kanji.map((character) => {
            const info = driftKanjiInfo(character);
            return (
              <RowButton
                accessibilityLabel={`Kanji ${character}${info ? `, ${info.meaning}` : ''}`}
                key={character}
                onPress={() => onOpenKanji(character)}
                testID={`drift-word-kanji-${character}`}
              >
                <View style={styles.rowInner}>
                  <Text
                    style={[
                      styles.rowGlyph,
                      { color: theme.color.pig1, fontFamily: theme.font.mincho },
                    ]}
                  >
                    {character}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.rowMeta,
                      { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                    ]}
                  >
                    {info ? [info.meaning, info.on, info.kun].filter(Boolean).join(' · ') : ''}
                  </Text>
                </View>
              </RowButton>
            );
          })}
        </Section>
      ) : null}

      {related.length > 0 ? (
        <Section
          note="Words whose written form literally shares a kanji — no inferred similarity."
          title="Shares a kanji"
        >
          {related.map((other) => (
            <RowButton
              accessibilityLabel={`Word ${other.headword}, ${other.gloss}`}
              key={other.headword}
              onPress={() => onOpenWord(other.headword)}
              testID={`drift-word-related-${other.headword}`}
            >
              <View style={styles.rowInner}>
                <Text
                  style={[
                    styles.rowWord,
                    { color: theme.color.ink, fontFamily: theme.font.mincho },
                  ]}
                >
                  {other.headword}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.rowMeta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  {other.reading} · {other.gloss}
                </Text>
              </View>
            </RowButton>
          ))}
        </Section>
      ) : null}

      <AppButton accessibilityLabel="Back" label="← Back" onPress={onBack} variant="secondary" />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  body: { fontSize: TYPE.body, marginBottom: SPACE.lg },
  gloss: { fontSize: TYPE.body, marginTop: SPACE.sm },
  headword: { fontSize: TYPE.headword, lineHeight: TYPE.headword * 1.2 },
  hero: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: SPACE.lg,
    padding: SPACE.lg,
  },
  level: { fontSize: TYPE.meta, letterSpacing: 0.4, marginTop: SPACE.md },
  reading: { fontSize: TYPE.label, letterSpacing: 1 },
  rowGlyph: { fontSize: TYPE.headwordRow },
  rowInner: { alignItems: 'baseline', flexDirection: 'row', gap: SPACE.md, width: '100%' },
  rowMeta: { flexShrink: 1, fontSize: TYPE.meta },
  rowWord: { fontSize: TYPE.title },
});
