/**
 * The sentences this word appears in (Campaign E / B3).
 *
 * ## The credit is a licence condition, not a courtesy
 *
 * Tatoeba is CC BY 2.0 FR, which attributes the **individual author**, and a
 * Japanese sentence with its English translation is two works by two people. So
 * each card names both, by contributor and by sentence id, on the card the
 * learner is looking at. A credit that lived only in `LICENSES.md` would not be
 * the attribution this licence asks for — the same reasoning that puts the
 * EDRDG acknowledgement on the screen rather than in a file.
 *
 * The pipeline that imported these refused any pair it could not credit on both
 * halves, so a card with a missing name cannot occur; if one ever did, the
 * absence would be rendered rather than hidden.
 *
 * ## Two kinds of sentence, kept apart
 *
 * The eight worked examples in the fixture tier are **this project's own
 * writing**, not corpus text, and their provenance line says so. Rendering them
 * in the same list as the Tatoeba pairs with one shared heading would let a
 * reader take a project-authored sentence for an attested one. They get their
 * own block and their own standing line.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Disclosure } from '../disclosure.tsx';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import type { ImportedSentence, SeedSentence } from '../../data/catalog.ts';
import type { ProvenanceRecord } from '@bunki/seed';
import { ProvenanceLine } from '../notices.tsx';

export interface WordSentencesProps {
  /** Tatoeba pairs for this entry, in the order the pipeline selected them. */
  readonly tatoeba: readonly ImportedSentence[];
  /** The project's own worked examples, for a fixture-tier word. */
  readonly worked: readonly SeedSentence[];
  /** Per-field provenance for the imported tier's sentences. */
  readonly tatoebaProvenance: ProvenanceRecord | null;
  /** Open on first render. The page's "open every section" gesture sets it. */
  readonly initiallyOpen: boolean;
  readonly testID?: string | undefined;
}

export function WordSentences({
  tatoeba,
  worked,
  tatoebaProvenance,
  initiallyOpen,
  testID = 'word-sentences',
}: WordSentencesProps): ReactNode {
  const theme = useTheme();
  const total = tatoeba.length + worked.length;

  return (
    <Disclosure
      count={total === 0 ? undefined : total}
      initiallyOpen={initiallyOpen}
      {...(total === 0
        ? {
            empty:
              'No sentence in this build uses this word. The imported corpus is 2,000 Tatoeba pairs selected for other entries, so an absence here says nothing about the word.',
          }
        : {
            note: 'Sentences this build actually holds for this entry. Each Tatoeba pair names the member who wrote each half, which its licence requires.',
          })}
      testID={testID}
      title="Where it appears"
    >
      {tatoeba.map((sentence) => (
        <View
          key={sentence.id}
          style={[
            styles.card,
            { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
          ]}
          testID={`word-tatoeba-${sentence.id}`}
        >
          <Text
            style={[
              styles.japanese,
              {
                color: theme.color.ink,
                fontFamily: theme.font.mincho,
                lineHeight: TYPE.body * theme.leading.japanese,
              },
            ]}
          >
            {sentence.japanese}
          </Text>
          <Text style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {sentence.english}
          </Text>
          <Text
            style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            testID={`word-tatoeba-credit-${sentence.id}`}
          >
            Tatoeba #{sentence.tatoeba.japaneseId} by {sentence.tatoeba.japaneseContributor} ·
            translation #{sentence.tatoeba.englishId} by {sentence.tatoeba.englishContributor} · CC
            BY 2.0 FR
          </Text>
          {tatoebaProvenance === null ? null : (
            <ProvenanceLine field="japanese" record={tatoebaProvenance} />
          )}
        </View>
      ))}

      {worked.length === 0 ? null : (
        <>
          <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            The sentences below are this project’s own writing, kept apart from the corpus pairs
            above because they are not attested text.
          </Text>
          {worked.map((sentence) => (
            <View
              key={sentence.id}
              style={[
                styles.card,
                { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
              ]}
              testID={`word-worked-${sentence.id}`}
            >
              <Text
                style={[
                  styles.japanese,
                  {
                    color: theme.color.ink,
                    fontFamily: theme.font.mincho,
                    lineHeight: TYPE.body * theme.leading.japanese,
                  },
                ]}
              >
                {sentence.japanese}
              </Text>
              <Text style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
                {sentence.english}
              </Text>
              <ProvenanceLine field="japanese" record={sentence.provenance.japanese} />
            </View>
          ))}
        </>
      )}
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  japanese: {
    fontSize: TYPE.body,
  },
  gloss: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.55,
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
