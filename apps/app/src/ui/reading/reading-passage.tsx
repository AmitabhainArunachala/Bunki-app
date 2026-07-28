/**
 * The passage itself — the surface a learner actually reads (Campaign E, lane
 * B4).
 *
 * Presentational. It takes spans and callbacks; it holds no store, dispatches
 * nothing, and cannot write anything. Everything it renders is
 * `FrontierPassage` plus the chrome that surrounds a page of text: a title, a
 * furigana toggle, a legend for whichever marks are actually on the page, and a
 * folded translation.
 *
 * ## The three decisions that make it a reading surface rather than a list
 *
 * **The text is set in mincho at the running-text rung, on its own well.**
 * `FrontierPassage` already sets `theme.font.mincho` and
 * `theme.leading.japanese` (1.75, which is Japanese leading rather than Latin
 * leading — see `src/theme/typography.ts`). The well is padded at `SPACE.xl`
 * inside a 720 pt measure, which puts a line at roughly 38 characters: long
 * enough not to shred the prose, short enough to track back to without word
 * spaces to land on.
 *
 * **Nothing on the page is highlighted except this learner's own edge.** Two
 * marks, hairline and dashed, both drawn under the text rather than behind it,
 * both capped by `FrontierPassage`'s own density guard. Frozen §10.4 rejects
 * Todaii's global-JLPT rainbow by name and this is the inversion of it.
 *
 * **The legend states only the marks that are on this page.** A legend that
 * described a mark the learner cannot see would be teaching them to look for
 * something that is not there.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Disclosure } from '../disclosure.tsx';
import { FrontierPassage } from '../frontier.tsx';
import { type FrontierMarkKind, type FrontierSpan } from '../frontier-marks.ts';
import { ChipButton } from '../primitives.tsx';
import { Surface } from '../surface.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { FRONTIER_MARK_BASIS } from './frontier-state.ts';

/** How a mark is drawn, said in words, for the legend. */
const MARK_APPEARANCE: Readonly<Record<Exclude<FrontierMarkKind, 'none'>, string>> = {
  frontier: 'a hairline in the accent',
  fragile: 'a dashed neutral line',
};

export interface ReadingPassageProps {
  /** The passage's own title, as written. */
  readonly title: string;
  readonly titleTranslation: string;
  readonly spans: readonly FrontierSpan[];
  /** The whole translation, folded away. Reading it is never required. */
  readonly translation: string;
  readonly furigana: boolean;
  readonly onToggleFurigana: () => void;
  /** Tapping a span. Opens the lookup in place; it must never navigate. */
  readonly onOpen: (lexemeId: string) => void;
  /**
   * Said under the toggle: which words carry a reading at all. A toggle that
   * annotates eight words out of thirty needs to say why, or it reads as broken.
   */
  readonly furiganaScopeNote: string;
  readonly testID?: string | undefined;
}

export function ReadingPassage({
  title,
  titleTranslation,
  spans,
  translation,
  furigana,
  onToggleFurigana,
  onOpen,
  furiganaScopeNote,
  testID,
}: ReadingPassageProps): ReactNode {
  const theme = useTheme();

  const present = (['frontier', 'fragile'] as const).filter((mark) =>
    spans.some((span) => span.mark === mark),
  );

  return (
    <View style={styles.block} testID={testID}>
      <View style={styles.heading}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
          testID="reading-title"
        >
          {title}
        </Text>
        <Text
          style={[styles.titleGloss, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {titleTranslation}
        </Text>
      </View>

      <View style={styles.controls}>
        <ChipButton
          accessibilityHint="Shows the dictionary reading above the words this build has one for."
          accessibilityLabel="Furigana"
          label="Furigana"
          onPress={onToggleFurigana}
          selected={furigana}
          testID="reading-furigana-toggle"
        />
        <Text
          style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="reading-furigana-scope"
        >
          {furiganaScopeNote}
        </Text>
      </View>

      {/*
        `well`, not `card`. A passage is set *into* the page rather than raised
        above it — `src/theme/layout.ts` keeps that distinction as two elevation
        names precisely so a reading surface and a museum card do not end up
        looking like the same object.
      */}
      <Surface level="well" pad="xl">
        <FrontierPassage
          furigana={furigana}
          onOpen={onOpen}
          spans={spans}
          testID="reading-passage"
        />
      </Surface>

      {present.length === 0 ? (
        <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          Nothing on this page is on your frontier right now, so it renders clean.
        </Text>
      ) : (
        <View style={styles.legend} testID="reading-legend">
          {present.map((mark) => (
            <Text
              key={mark}
              style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {`${MARK_APPEARANCE[mark]} — ${FRONTIER_MARK_BASIS[mark]}`}
            </Text>
          ))}
        </View>
      )}

      <Disclosure
        note="The passage is this project's own writing, and so is this translation. Reading it is not a test and it is not recorded as one."
        testID="reading-translation"
        title="Translation"
      >
        <Text style={[styles.translation, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {translation}
        </Text>
      </Disclosure>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACE.lg,
  },
  heading: {
    gap: SPACE.xs,
  },
  title: {
    fontSize: TYPE.headwordRow,
    lineHeight: TYPE.headwordRow * 1.3,
  },
  titleGloss: {
    fontSize: TYPE.label,
  },
  controls: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.md,
  },
  legend: {
    gap: SPACE.xs,
  },
  note: {
    flexShrink: 1,
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  translation: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.65,
  },
});
