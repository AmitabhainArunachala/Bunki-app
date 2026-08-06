/**
 * The Drift-tier kanji page (BUNKI_ONE_APP_CONVERGENCE_SPEC_2026-08-06.md §2).
 *
 * Serves the 2,500+ characters the seed's ten curated kanji don't cover:
 * readings, meaning, stroke count, KanjiVG components, and words using the
 * character, under the tier's disclosure. No stroke-order animation — the
 * tier ships no per-stroke data, and the absence is stated rather than
 * papered over (the seed kanji keep their animated page).
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  driftKanjiComponents,
  driftKanjiInfo,
  driftWordsUsingKanji,
} from '../data/drift-lexicon.ts';
import { AppButton, RowButton, Section } from '../ui/primitives.tsx';
import { DriftTierDisclosure } from '../ui/notices.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

export interface DriftKanjiScreenProps {
  readonly character: string;
  readonly onBack: () => void;
  readonly onOpenKanji: (character: string) => void;
  readonly onOpenWord: (headword: string) => void;
}

export function DriftKanjiScreen({
  character,
  onBack,
  onOpenKanji,
  onOpenWord,
}: DriftKanjiScreenProps): ReactNode {
  const theme = useTheme();
  const info = driftKanjiInfo(character);

  if (info === null) {
    return (
      <ScreenShell testID="screen-drift-kanji-missing" title="Kanji">
        <DriftTierDisclosure />
        <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          “{character}” is not in the JLPT lexicon tier either.
        </Text>
        <AppButton accessibilityLabel="Back" label="← Back" onPress={onBack} variant="secondary" />
      </ScreenShell>
    );
  }

  const components = driftKanjiComponents(character);
  const words = driftWordsUsingKanji(character);

  return (
    <ScreenShell testID="screen-drift-kanji" title="Kanji">
      <DriftTierDisclosure />

      <View
        style={[
          styles.hero,
          { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
        ]}
        testID="drift-kanji-hero"
      >
        <Text
          accessibilityLabel={`The kanji ${info.character}`}
          accessible
          style={[styles.glyph, { color: theme.color.pig1, fontFamily: theme.font.mincho }]}
          testID="drift-kanji-character"
        >
          {info.character}
        </Text>
        <Text style={[styles.meaning, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {info.meaning}
        </Text>
        {info.on ? (
          <Text
            style={[styles.reading, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          >
            音 {info.on}
          </Text>
        ) : null}
        {info.kun ? (
          <Text
            style={[styles.reading, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          >
            訓 {info.kun}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {info.strokeCount} strokes · stroke-order animation is available for seed kanji only
        </Text>
      </View>

      {components.length > 0 ? (
        <Section note="KanjiVG decomposition — the shapes inside the shape." title="Components">
          {components.map((component) => {
            const componentInfo = driftKanjiInfo(component);
            return (
              <RowButton
                accessibilityLabel={`Component ${component}${componentInfo ? `, ${componentInfo.meaning}` : ''}`}
                key={component}
                onPress={() => onOpenKanji(component)}
                testID={`drift-kanji-component-${component}`}
              >
                <View style={styles.rowInner}>
                  <Text
                    style={[
                      styles.rowGlyph,
                      { color: theme.color.pig2, fontFamily: theme.font.mincho },
                    ]}
                  >
                    {component}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.rowMeta,
                      { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                    ]}
                  >
                    {componentInfo?.meaning ?? ''}
                  </Text>
                </View>
              </RowButton>
            );
          })}
        </Section>
      ) : null}

      {words.length > 0 ? (
        <Section
          note="Easiest JLPT level first. Capped — a page, not a corpus."
          title="Words using it"
        >
          {words.map((word) => (
            <RowButton
              accessibilityLabel={`Word ${word.headword}, ${word.gloss}`}
              key={word.headword}
              onPress={() => onOpenWord(word.headword)}
              testID={`drift-kanji-word-${word.headword}`}
            >
              <View style={styles.rowInner}>
                <Text
                  style={[
                    styles.rowWord,
                    { color: theme.color.ink, fontFamily: theme.font.mincho },
                  ]}
                >
                  {word.headword}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.rowMeta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  {word.reading} · {word.gloss}
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
  glyph: { fontSize: TYPE.kanjiHero, lineHeight: TYPE.kanjiHero * 1.15 },
  hero: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: SPACE.lg,
    padding: SPACE.lg,
  },
  meaning: { fontSize: TYPE.title, marginTop: SPACE.sm },
  meta: { fontSize: TYPE.meta, marginTop: SPACE.md },
  reading: { fontSize: TYPE.label, marginTop: SPACE.xs },
  rowGlyph: { fontSize: TYPE.headwordRow },
  rowInner: { alignItems: 'baseline', flexDirection: 'row', gap: SPACE.md, width: '100%' },
  rowMeta: { flexShrink: 1, fontSize: TYPE.meta },
  rowWord: { fontSize: TYPE.title },
});
