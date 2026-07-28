/**
 * Vertical writing (縦書き).
 *
 * REQ-UI-08 lists it as optional and no shipped surface uses it yet. It is here
 * anyway for a reason that is about the type system rather than about the
 * feature: a horizontal-only text layer bakes assumptions into every component
 * that touches a measure, a line height or an alignment, and unpicking them
 * later is a rewrite. Having the tokens and one working component now means the
 * assumptions never get baked in, and means the specimen page can show the
 * operator what a vertical passage would look like before anyone commits to it.
 *
 * ## What is genuinely different about a vertical column
 *
 *   - **The inline axis is vertical.** A `maxWidth` measure does nothing; the
 *     measure is a `maxHeight`, and `VERTICAL.measure` is that value.
 *   - **Latin lies down unless told not to.** `textOrientation: 'upright'` is
 *     what keeps a year or a romanised gloss readable inside a vertical run.
 *   - **It is web-only, honestly.** `writingMode` is a CSS property that
 *     `react-native-web` passes through and that React Native on iOS/Android
 *     does not implement. Rather than pretend, `VerticalRun` falls back to a
 *     horizontal run on native and says so in its own docblock — a component
 *     that silently rendered horizontally would be a feature that appears to
 *     exist.
 *
 * ## Ruby in a vertical run
 *
 * Furigana in vertical setting sits to the *right* of the base column, not
 * above it. `RubyText` builds a column per segment and would put the reading
 * above the glyph, rotated — wrong on both counts. So `VerticalRun` takes plain
 * text, and vertical furigana is left undone rather than done incorrectly; the
 * docblock is the record of that being a decision.
 */

import { type ReactNode } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { TYPE, VERTICAL } from './theme.ts';
import { useTheme } from './theme-context.tsx';

/** True where `writing-mode` is a real property: the web export. */
export const VERTICAL_TEXT_SUPPORTED = Platform.OS === 'web';

export const VERTICAL_UNSUPPORTED_NOTE =
  'Vertical setting needs a CSS writing mode, which this runtime does not have; the passage is set horizontally instead.';

export interface VerticalRunProps {
  readonly text: string;
  readonly size?: number | undefined;
  /** Column height in points; the vertical equivalent of a reading measure. */
  readonly measure?: number | undefined;
  readonly testID?: string | undefined;
}

export function VerticalRun({
  text,
  size = TYPE.body,
  measure = VERTICAL.measure,
  testID,
}: VerticalRunProps): ReactNode {
  const theme = useTheme();

  const textStyle = {
    color: theme.color.ink,
    fontFamily: theme.font.mincho,
    fontSize: size,
    lineHeight: Math.round(size * theme.leading.japanese),
  };

  if (!VERTICAL_TEXT_SUPPORTED) {
    return (
      <View style={styles.fallback} testID={testID}>
        <Text style={textStyle}>{text}</Text>
        <Text style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {VERTICAL_UNSUPPORTED_NOTE}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.column, { maxHeight: measure }]} testID={testID}>
      <Text
        style={[
          textStyle,
          // Cast at the one place a web-only CSS property enters the system.
          // React Native's `TextStyle` has no `writingMode`; react-native-web
          // forwards it. Confining the cast here is what keeps every other
          // component honestly typed.
          {
            writingMode: VERTICAL.writingMode,
            textOrientation: VERTICAL.textOrientation,
          } as unknown as Record<string, never>,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  column: {
    alignSelf: 'flex-start',
  },
  fallback: {
    gap: 8,
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.55,
  },
});
