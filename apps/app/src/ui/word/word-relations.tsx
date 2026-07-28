/**
 * The word's neighbours: the family and the contrast set (Campaign E / B3).
 *
 * Two lists, drawn differently because they answer different questions.
 *
 * **The family** answers *what else is written with these characters*. It is
 * grouped by the shared character, because the group heading is the reason the
 * words are together and a flat list would leave the learner to infer it.
 *
 * **The contrast set** answers *what else means roughly this*, which is frozen
 * §10.5's 類義漢字 idea. Its rows carry the usage boundary the data can
 * actually support: the wording the two entries share, and the wording each has
 * that the other does not. `CONTRAST_STANDING` says in the page's own words
 * that no nuance is being asserted, because JMdict carries no usage note and
 * inventing one is the failure the round-2 research documents in a competitor.
 *
 * Both are `Disclosure`s that state their count and their reason. Both are
 * tappable through to the word page of every entry they name — there is no row
 * here that is a dead end.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Disclosure } from '../disclosure.tsx';
import { RowButton } from '../primitives.tsx';
import { RubyText } from '../ruby.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import type { SeedLexeme } from '../../data/catalog.ts';
import { CONTRAST_STANDING, type ContrastSet, type FamilyGroup } from './neighbourhood.ts';

export interface WordFamilyProps {
  readonly groups: readonly FamilyGroup[];
  readonly onOpenWord: (lexemeId: string) => void;
  readonly testID?: string | undefined;
}

function WordRow({
  word,
  detail,
  onOpenWord,
  testID,
}: {
  readonly word: SeedLexeme;
  readonly detail: ReactNode;
  readonly onOpenWord: (lexemeId: string) => void;
  readonly testID?: string | undefined;
}): ReactNode {
  return (
    <RowButton
      accessibilityHint="Opens that word’s page."
      accessibilityLabel={`${word.headword}, read ${word.reading}: ${word.senses.slice(0, 3).join(', ')}`}
      onPress={() => onOpenWord(word.id)}
      testID={testID}
    >
      <View style={styles.rowBody}>
        <RubyText reading={word.reading} serif size={TYPE.headwordRow} written={word.headword} />
        {detail}
      </View>
    </RowButton>
  );
}

export function WordFamily({
  groups,
  onOpenWord,
  testID = 'word-family',
}: WordFamilyProps): ReactNode {
  const theme = useTheme();
  const total = groups.reduce((count, group) => count + group.words.length, 0);

  return (
    <Disclosure
      count={total === 0 ? undefined : total}
      {...(total === 0
        ? {
            empty:
              'No other word in this build shares a character with this one. That is a fact about this build’s 3,000-entry slice, not about the language.',
          }
        : {
            note: 'Words in this build written with one of the same characters. Grouped by the character that joins them; each word appears once, under the first character it shares.',
          })}
      testID={testID}
      title="Written with the same characters"
    >
      {groups.map((group) => (
        <View key={group.character} style={styles.group}>
          <Text
            accessibilityRole="header"
            style={[styles.groupTitle, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
          >
            {group.character}
          </Text>
          {group.words.map((word) => (
            <WordRow
              detail={
                <Text
                  style={[
                    styles.note,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  {word.senses.slice(0, 3).join(' · ')}
                </Text>
              }
              key={word.id}
              onOpenWord={onOpenWord}
              testID={`word-family-${word.id}`}
              word={word}
            />
          ))}
        </View>
      ))}
    </Disclosure>
  );
}

export interface WordContrastProps {
  readonly set: ContrastSet;
  readonly onOpenWord: (lexemeId: string) => void;
  readonly testID?: string | undefined;
}

export function WordContrast({
  set,
  onOpenWord,
  testID = 'word-contrast',
}: WordContrastProps): ReactNode {
  const theme = useTheme();
  const hidden = set.total - set.shown.length;

  return (
    <Disclosure
      count={set.total === 0 ? undefined : set.total}
      {...(set.total === 0
        ? {
            empty:
              'No other entry in this build is glossed with any of the same English words. Nothing is inferred here, so an empty set means the overlap really is empty.',
          }
        : {
            note:
              `${CONTRAST_STANDING}` +
              (hidden > 0
                ? ` Showing the ${String(set.shown.length)} that share the most wordings; ${String(hidden)} more are not listed.`
                : ''),
          })}
      testID={testID}
      title="Easy to confuse with"
    >
      {set.shown.map((pair) => (
        <WordRow
          detail={
            <View style={styles.contrastBody}>
              <Text
                style={[styles.note, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                testID={`word-contrast-shared-${pair.word.id}`}
              >
                Both are glossed: {pair.shared.join(' · ')}
              </Text>
              {pair.onlyHere.length === 0 ? null : (
                <Text
                  style={[
                    styles.note,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  Only this word: {pair.onlyHere.join(' · ')}
                </Text>
              )}
              {pair.onlyThere.length === 0 ? null : (
                <Text
                  style={[
                    styles.note,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  Only {pair.word.headword}: {pair.onlyThere.join(' · ')}
                </Text>
              )}
            </View>
          }
          key={pair.word.id}
          onOpenWord={onOpenWord}
          testID={`word-contrast-${pair.word.id}`}
          word={pair.word}
        />
      ))}

      {set.skippedGeneralGlosses.length === 0 ? null : (
        <Text style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          Skipped as too general to mean anything shared: {set.skippedGeneralGlosses.join(', ')}.
        </Text>
      )}
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: SPACE.sm,
    marginTop: SPACE.sm,
  },
  groupTitle: {
    fontSize: TYPE.title,
  },
  rowBody: {
    gap: SPACE.xs,
  },
  contrastBody: {
    gap: 2,
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
