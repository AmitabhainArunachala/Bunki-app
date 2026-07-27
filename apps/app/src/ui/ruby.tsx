/**
 * Ruby (furigana) rendering (WP-05, REQ-UI-08).
 *
 * React Native has no `<ruby>`, so a segment is a column: the reading in small
 * type, the written form under it, baselines aligned by the column itself. The
 * row wraps, which is what keeps Japanese line-breaking sane — a break can fall
 * between segments but never between a character and the reading above it.
 *
 * ## How the single spoken label is produced, and why it is done this way
 *
 * A screen reader walking the visual columns would interleave reading and
 * written form ("わ 分 かれる"), so the pieces must be hidden and one label
 * spoken instead. Two mechanisms were measured against the Phase-0 target
 * runtime (Expo Web, REQ-ARCH-01) before this shape was chosen:
 *
 *   - **`importantForAccessibility="no"` does nothing on the web.** It is an
 *     Android/iOS prop. `react-native-web@0.21.2` forwards only the props in
 *     `modules/forwardedProps` — `aria-hidden` is there, `importantForAccessibility`
 *     is not — so the prop is dropped and every piece stays in the accessibility
 *     tree. `test/ruby-accessibility.test.ts` asserts this against the installed
 *     copy of react-native-web, so an upgrade that drops `aria-hidden` fails a
 *     test instead of silently un-hiding the pieces. The pieces therefore carry
 *     `aria-hidden`, which React Native ≥0.71 also maps on native
 *     (`accessibilityElementsHidden` on iOS, `importantForAccessibility:
 *     'no-hide-descendants'` on Android), so one prop covers both targets.
 *
 *   - **`accessibilityLabel` on this container is not enough on the web.** The
 *     container is a plain `View`; react-native-web maps `accessibilityRole="text"`
 *     to *no* ARIA role (`AccessibilityUtil/propsToAriaRole` → `text: null`), so
 *     the element stays `role=generic`, where ARIA prohibits naming and
 *     assistive technologies may drop `aria-label` entirely. The label is
 *     therefore carried as **real text content** in a clipped node, which no
 *     assistive technology can ignore, and `accessible` lets native merge the
 *     column into that one element.
 *
 * What is actually verified, and where: `scripts/capture-evidence.mjs` runs an
 * `Accessibility.getFullAXTree` audit over the real `expo export` output and
 * asserts that under a `RubyText` exactly one non-ignored node is named, that
 * its name is the full label, and that no written form, no reading and no
 * placeholder appears in the tree. The audit result is written to
 * `docs/build-evidence/screenshots-wp05/accessibility-audit.json`.
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
  const rubyLineHeight = Math.round(rubySize * 1.25);
  const fontFamily = serif ? theme.font.mincho : theme.font.sans;
  const spokenLabel = furiganaAccessibilityLabel(written, reading);

  return (
    <View accessibilityRole="text" accessible style={styles.row} testID={testID}>
      {/*
        The only thing an assistive technology reads here. It is clipped to a
        1×1 box rather than hidden with `opacity: 0` or `display: none`: a
        clipped node stays in the accessibility tree, and the two alternatives
        either keep it selectable (opacity) or remove it from the tree entirely.
      */}
      <View style={styles.spokenClip}>
        <Text>{spokenLabel}</Text>
      </View>

      {segments.map((segment, index) => (
        <View
          // Segment order is the identity here: the same word always splits the
          // same way, and two identical segments (々-style repeats) are distinct
          // positions rather than the same node.
          key={`${index}-${segment.text}`}
          style={styles.segment}
        >
          {segment.ruby === null ? (
            // Reserve the ruby line even when a segment has none, so the written
            // forms of a mixed word sit on one baseline. A sized spacer rather
            // than a transparent ideographic space: an empty text node is real
            // content — it lands in the accessibility tree and in a copied
            // selection, and a placeholder should be neither.
            <View aria-hidden style={{ height: rubyLineHeight }} />
          ) : (
            <Text
              allowFontScaling
              aria-hidden
              style={[
                styles.ruby,
                {
                  color: theme.color.inkMuted,
                  fontFamily,
                  fontSize: rubySize,
                  lineHeight: rubyLineHeight,
                },
              ]}
            >
              {segment.ruby}
            </Text>
          )}
          <Text
            allowFontScaling
            aria-hidden
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
  /** The standard visually-hidden clip: out of flow, 1×1, contents clipped. */
  spokenClip: {
    height: 1,
    overflow: 'hidden',
    position: 'absolute',
    width: 1,
  },
});
