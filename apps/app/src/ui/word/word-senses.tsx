/**
 * The gloss list, its parts of speech and its commonness tags
 * (Campaign E / B3).
 *
 * The layout question this answers is the one frozen §5 poses for a kanji page
 * and the campaign brief repeats for a word: which zones earn pixels, and what
 * is "one unfold tap away, present but silent". Here the opening glosses earn
 * pixels; the long tail — 59 of 取る's 63 — is folded behind a `Disclosure`
 * that states its count and the reason before it is opened.
 *
 * Everything about *what these are* lives in `glosses.ts`, including the
 * refusal to number them as senses. This file only draws them.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Disclosure } from '../disclosure.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { GLOSS_STANDING, PART_OF_SPEECH_STANDING, splitGlosses, tailReason } from './glosses.ts';
import { PRIORITY_TAG_SOURCE, readPriorityTags } from './priority-tags.ts';

export interface WordSensesProps {
  readonly glosses: readonly string[];
  readonly partOfSpeech: readonly string[];
  /** JMdict's own `ke_pri`/`re_pri` tags, when the record carries them. */
  readonly priorityTags: readonly string[];
  readonly testID?: string | undefined;
}

export function WordSenses({
  glosses,
  partOfSpeech,
  priorityTags,
  testID = 'word-senses',
}: WordSensesProps): ReactNode {
  const theme = useTheme();
  const split = splitGlosses(glosses);
  const tags = readPriorityTags(priorityTags);

  return (
    <View style={styles.block} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[styles.heading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        What it means
      </Text>
      <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {GLOSS_STANDING}
      </Text>

      {split.empty ? (
        <Text style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          This record carries no English wording.
        </Text>
      ) : (
        <View style={styles.glosses} testID="word-glosses-open">
          {split.opening.map((gloss) => (
            <Text
              key={gloss}
              style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              {gloss}
            </Text>
          ))}
        </View>
      )}

      {split.tail.length === 0 ? null : (
        <Disclosure
          count={split.tail.length}
          note={tailReason(split.tail.length)}
          testID="word-glosses-tail"
          title="More wordings for this entry"
        >
          <View style={styles.glosses}>
            {split.tail.map((gloss) => (
              <Text
                key={gloss}
                style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              >
                {gloss}
              </Text>
            ))}
          </View>
        </Disclosure>
      )}

      <Text
        accessibilityRole="header"
        style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        Part of speech
      </Text>
      <Text
        style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        testID="word-part-of-speech"
      >
        {partOfSpeech.length === 0 ? 'Not recorded for this entry.' : partOfSpeech.join(' · ')}
      </Text>
      <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {PART_OF_SPEECH_STANDING}
      </Text>

      <Text
        accessibilityRole="header"
        style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        How common it is
      </Text>
      {tags.described.length === 0 && tags.unrecognised.length === 0 ? (
        <Text style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          This record carries no commonness tag. That is an absence in the record, not a statement
          that the word is rare.
        </Text>
      ) : (
        <>
          <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            {PRIORITY_TAG_SOURCE}
          </Text>
          <View style={styles.glosses} testID="word-priority-tags">
            {tags.described.map((tag) => (
              <View key={tag.code} style={styles.tagRow}>
                <Text
                  style={[styles.gloss, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                >
                  {tag.note}
                </Text>
                <Text
                  style={[
                    styles.tagCode,
                    { color: theme.color.inkFaint, fontFamily: theme.font.mono },
                  ]}
                >
                  {tag.code}
                </Text>
              </View>
            ))}
            {tags.unrecognised.length === 0 ? null : (
              <Text
                style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
              >
                This build has no wording for {tags.unrecognised.join(', ')}; the tag is shown
                rather than dropped.
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACE.sm,
  },
  heading: {
    fontSize: TYPE.title,
    fontWeight: '600',
  },
  subheading: {
    fontSize: TYPE.label,
    fontWeight: '600',
    marginTop: SPACE.md,
  },
  glosses: {
    gap: SPACE.xs,
  },
  gloss: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.55,
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  tagRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  tagCode: {
    fontSize: TYPE.meta,
  },
});
