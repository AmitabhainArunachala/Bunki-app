/**
 * The word as a museum card (Campaign E / B3).
 *
 * "A kanji page should feel like a museum card, not a spreadsheet row" is the
 * operator's bar in frozen §8, and the campaign brief repeats it. `MuseumCard`
 * in `src/ui/surface.tsx` is that register already built — the specimen three
 * or four times the catalogue text, in mincho, with silence around it — so this
 * file composes it rather than laying out another card.
 *
 * What it adds is the *word* version of the register:
 *
 *   - the specimen is `RubyText`, because a word's reading is first-class type
 *     above the written form rather than a field beside it;
 *   - the caption is one gloss. Not the gloss list — that is the section below,
 *     and a caption that grew into a list would make this a row again;
 *   - the catalogue lines are the small print a card carries: the entry's parts
 *     of speech, its commonness in JMdict's own words, the characters it is
 *     written with, and which tier of this build the record came from;
 *   - the memory state is five meters, never one. See {@link WordLenses}.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AttributionFooter, type AttributionLine } from '../attribution.tsx';
import { RecallMeter } from '../recall.tsx';
import { RubyText } from '../ruby.tsx';
import { MuseumCard } from '../surface.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { BAND_RULE, nothingMeasured, type LensView } from './memory.ts';

export interface WordHeroProps {
  readonly headword: string;
  readonly reading: string;
  /** One line of context. The first gloss, never the list. */
  readonly caption: string;
  readonly catalogue: readonly string[];
  readonly lenses: readonly LensView[];
  readonly attribution: readonly AttributionLine[];
  readonly standing: string;
  readonly testID?: string | undefined;
}

export function WordHero({
  headword,
  reading,
  caption,
  catalogue,
  lenses,
  attribution,
  standing,
  testID = 'word-hero',
}: WordHeroProps): ReactNode {
  return (
    <MuseumCard
      caption={caption}
      catalogue={catalogue}
      footer={<AttributionFooter lines={attribution} standing={standing} />}
      specimen={
        <RubyText
          reading={reading}
          size={TYPE.headword}
          testID="word-headword"
          written={headword}
        />
      }
      testID={testID}
    >
      <WordLenses lenses={lenses} testID="word-lenses" />
    </MuseumCard>
  );
}

export interface WordLensesProps {
  readonly lenses: readonly LensView[];
  readonly testID?: string | undefined;
}

/**
 * Five meters, one per capability, and no sixth line summarising them.
 *
 * REQ-UI-07 forbids collapsing the five into one mastery light and REQ-LM-03
 * forbids a global scalar; both are kept here structurally rather than by
 * intention, because `RecallMeter` requires a capability and there is no
 * `'overall'` capability to pass it.
 *
 * The rule that produced the bands is printed under them. A learner who wants
 * to know why a lens says what it says should not have to read the source, and
 * a rule visible on the page is a rule that cannot quietly change.
 */
export function WordLenses({ lenses, testID }: WordLensesProps): ReactNode {
  const theme = useTheme();
  const measuredNothing = nothingMeasured(lenses);

  return (
    <View style={styles.lenses} testID={testID}>
      {measuredNothing ? (
        <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          Nothing has been observed about this word yet. Every capability below reads “no evidence”,
          which is different from reading “weak”.
        </Text>
      ) : null}

      {lenses.map((lens) => (
        <RecallMeter
          band={lens.band}
          basis={lens.basis}
          capability={lens.capability}
          fragile={lens.fragile}
          key={lens.capability}
          testID={`word-lens-${lens.capability}`}
        />
      ))}

      <Text
        style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
        testID="word-band-rule"
      >
        {BAND_RULE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lenses: {
    gap: SPACE.md,
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
