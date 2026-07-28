/**
 * Reading surfaces, and the quiet marks on them.
 *
 * ## The rule, and the app it was learned from
 *
 * Todaii underlines nearly every content word in global-JLPT colours. The
 * operator's verdict, in the frozen spec §10.4: "when everything is highlighted
 * nothing is." Bunki inverts it — the text renders clean, and only words on this
 * learner's own frontier carry a mark (REQ-UI-08: "personal frontier, never
 * global-JLPT rainbow highlighting").
 *
 * So there are exactly two marks, and both are underlines rather than fills,
 * because a fill changes the colour of the text and the text is the thing being
 * read:
 *
 *   - **frontier** — no evidence for this yet. A hairline in the one accent.
 *   - **fragile** — evidence exists and the projection says it is slipping. A
 *     dashed hairline in the neutral fragile token, *not* the accent: a word the
 *     learner has met is not a call to action, and spending the accent on it
 *     would make a page of familiar words look like a page of alarms.
 *
 * There is no third mark and no per-level colour. A `kind` union of three
 * members is the enforcement.
 *
 * ## The density guard
 *
 * A passage far past the learner's edge would carry marks on most of its words,
 * which is the Todaii failure arriving by a different route. `FrontierPassage`
 * measures the marked proportion and, past `MAX_MARK_DENSITY`, renders the
 * passage clean with one line saying why. That is not hiding information: the
 * information "most of this is new" is *better* carried by the sentence than by
 * forty underlines, and every word is still tappable.
 */

import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  MAX_MARK_DENSITY,
  OVERWHELMED_NOTE,
  markDensity,
  marksAreOverwhelming,
  type FrontierMarkKind,
  type FrontierSpan,
} from './frontier-marks.ts';
import { RubyText } from './ruby.tsx';
import { SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

export {
  MAX_MARK_DENSITY,
  OVERWHELMED_NOTE,
  markDensity,
  marksAreOverwhelming,
  type FrontierMarkKind,
  type FrontierSpan,
};

export interface FrontierPassageProps {
  readonly spans: readonly FrontierSpan[];
  /** Show readings above the spans that have them. */
  readonly furigana?: boolean | undefined;
  /** Tapping a span with a `lexemeId`. Absent makes the passage read-only. */
  readonly onOpen?: ((lexemeId: string) => void) | undefined;
  /** Font size of the running text. */
  readonly size?: number | undefined;
  readonly testID?: string | undefined;
}

export function FrontierPassage({
  spans,
  furigana = false,
  onOpen,
  size = TYPE.body,
  testID,
}: FrontierPassageProps): ReactNode {
  const theme = useTheme();
  const overwhelmed = marksAreOverwhelming(spans);

  return (
    <View style={styles.passage} testID={testID}>
      {overwhelmed ? (
        <Text
          style={[styles.overwhelmed, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {OVERWHELMED_NOTE}
        </Text>
      ) : null}

      <View style={[styles.run, { rowGap: furigana ? SPACE.sm : SPACE.xs }]}>
        {spans.map((span, index) => (
          <FrontierSpanView
            // Position is the identity: the same word twice in a passage is two
            // spans, and they can be on different sides of the frontier.
            key={`${index}-${span.text}`}
            furigana={furigana}
            mark={overwhelmed ? 'none' : span.mark}
            onOpen={onOpen}
            size={size}
            span={span}
          />
        ))}
      </View>
    </View>
  );
}

interface FrontierSpanViewProps {
  readonly span: FrontierSpan;
  readonly mark: FrontierMarkKind;
  readonly furigana: boolean;
  readonly size: number;
  readonly onOpen: ((lexemeId: string) => void) | undefined;
}

function FrontierSpanView({
  span,
  mark,
  furigana,
  size,
  onOpen,
}: FrontierSpanViewProps): ReactNode {
  const theme = useTheme();

  const underline =
    mark === 'none'
      ? null
      : {
          color: mark === 'frontier' ? theme.color.frontierMark : theme.color.fragileEdge,
          dashed: mark === 'fragile',
        };

  const body =
    furigana && span.reading !== undefined ? (
      <RubyText color={theme.color.ink} reading={span.reading} size={size} written={span.text} />
    ) : (
      <Text
        style={{
          color: theme.color.ink,
          fontFamily: theme.font.mincho,
          fontSize: size,
          lineHeight: Math.round(size * theme.leading.japanese),
        }}
      >
        {span.text}
      </Text>
    );

  const content = (
    <View style={styles.span}>
      {body}
      {underline === null ? null : (
        <View
          /*
            The mark is drawn as a sibling rule rather than as `textDecoration`
            for two reasons: React Native has no dashed underline, and an
            underline that is part of the text inherits the text colour, which
            would make the mark change colour with the word. It is hidden from
            the accessibility tree because the state it encodes is spoken by the
            pressable's own label, and an unlabelled decoration in the tree is
            noise.
          */
          aria-hidden
          style={[
            styles.mark,
            {
              backgroundColor: underline.dashed ? 'transparent' : underline.color,
              borderBottomColor: underline.color,
              borderBottomWidth: underline.dashed ? 1 : 0,
              borderStyle: underline.dashed ? 'dashed' : 'solid',
            },
          ]}
        />
      )}
    </View>
  );

  if (span.lexemeId === undefined || onOpen === undefined) return content;

  const state = mark === 'frontier' ? ', new to you' : mark === 'fragile' ? ', fragile' : '';

  return (
    <Pressable
      accessibilityHint="Opens the word."
      accessibilityLabel={`${span.text}${state}`}
      accessibilityRole="link"
      onPress={() => onOpen(span.lexemeId ?? '')}
      style={({ pressed }) => [styles.pressable, { opacity: pressed ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  passage: {
    gap: SPACE.md,
  },
  overwhelmed: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.65,
  },
  run: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  span: {
    alignItems: 'stretch',
  },
  pressable: {
    /*
      No padding, and no 44 pt minimum — deliberately, and within the rule
      rather than in spite of it. WCAG 2.2 SC 2.5.8 (Target Size, Minimum)
      exempts targets that are "in a sentence or its size is otherwise
      constrained by the line-height of non-target text", which is exactly a
      word inside a passage. Padding these apart would put gaps in a Japanese
      sentence, which has none, and the gaps would be the defect: the reading
      surface would stop being a reading surface.

      Everything else in the app keeps the 44 pt floor through
      `interactive-styles.ts`, which `test/touch-targets.test.ts` walks.
    */
    alignSelf: 'flex-end',
  },
  mark: {
    height: 1.5,
    marginTop: 1,
    width: '100%',
  },
});
