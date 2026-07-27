/**
 * Ruby (furigana) rendering (WP-05, REQ-UI-08).
 *
 * React Native has no `<ruby>`, so a segment is a column: the reading in small
 * type, the written form under it, baselines aligned by the column itself. The
 * row wraps, which is what keeps Japanese line-breaking sane — a break can fall
 * between segments but never between a character and the reading above it.
 *
 * The whole word carries one `accessibilityLabel` ("分岐（ぶんき）") and the
 * pieces are hidden from the accessibility tree, so a screen reader says the
 * word and its reading once instead of interleaving them.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { alignFurigana, furiganaAccessibilityLabel, type FuriganaPrecision } from './furigana.ts';
import { SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

export interface RubyTextProps {
  readonly written: string;
  readonly reading: string;
  /** Font size of the written form; the ruby scales with it. */
  readonly size?: number | undefined;
  /** Mincho on reading surfaces (headwords, passages); sans in dense UI rows. */
  readonly serif?: boolean | undefined;
  readonly color?: string | undefined;
  readonly testID?: string | undefined;
  /** Reports how precise the alignment was, for the evidence harness. */
  readonly onPrecision?: ((precision: FuriganaPrecision) => void) | undefined;
}

export function RubyText({
  written,
  reading,
  size = TYPE.body,
  serif = true,
  color,
  testID,
}: RubyTextProps): ReactNode {
  const theme = useTheme();
  const { segments } = alignFurigana(written, reading);
  const inkColor = color ?? theme.color.ink;
  const rubySize = Math.max(TYPE.ruby, Math.round(size * 0.42));
  const fontFamily = serif ? theme.font.mincho : theme.font.sans;

  return (
    <View
      accessibilityLabel={furiganaAccessibilityLabel(written, reading)}
      accessible
      style={styles.row}
      testID={testID}
    >
      {segments.map((segment, index) => (
        <View
          // Segment order is the identity here: the same word always splits the
          // same way, and two identical segments (々-style repeats) are distinct
          // positions rather than the same node.
          key={`${index}-${segment.text}`}
          style={styles.segment}
        >
          <Text
            allowFontScaling
            importantForAccessibility="no"
            style={[
              styles.ruby,
              {
                color: theme.color.inkMuted,
                fontFamily,
                fontSize: rubySize,
                lineHeight: Math.round(rubySize * 1.25),
                // Reserve the ruby line even when a segment has none, so the
                // written forms of a mixed word sit on one baseline.
                opacity: segment.ruby === null ? 0 : 1,
              },
            ]}
          >
            {segment.ruby ?? '　'}
          </Text>
          <Text
            allowFontScaling
            importantForAccessibility="no"
            style={{
              color: inkColor,
              fontFamily,
              fontSize: size,
              lineHeight: Math.round(size * 1.35),
            }}
          >
            {segment.text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: SPACE.xs,
  },
  segment: {
    alignItems: 'center',
    flexDirection: 'column',
  },
  ruby: {
    textAlign: 'center',
  },
});
