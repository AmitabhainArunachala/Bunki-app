/**
 * Surfaces — and the museum card.
 *
 * "A kanji page should feel like a museum card, not a spreadsheet row" is the
 * operator's bar, stated in the frozen spec §8 and again in the campaign brief.
 * A museum card is a specific object and it is worth being literal about what
 * makes it one, because every difference from a spreadsheet row is a decision
 * this file has to actually take:
 *
 *   - **The object is the largest thing on it, by a lot.** Not "slightly bigger
 *     than the label" — the ratio between the specimen and the catalogue text is
 *     three or four to one. `TYPE.kanjiHero` over `TYPE.meta` is 96 over 13.
 *   - **The object is set in its own type.** Mincho, not the UI sans.
 *   - **The metadata is small, quiet, and beneath.** It never competes; it is
 *     there for the reader who leans in.
 *   - **There is space around it.** A card that is padded like a table cell is a
 *     table cell. `SPACE.hero` exists for this.
 *   - **There is one line of context, not fifteen fields.** Everything else is
 *     under a disclosure.
 *
 * `Surface` is the plain version — a levelled box, taking its background and
 * border from `ELEVATION` through the theme, so no component anywhere writes a
 * colour. `MuseumCard` is the composed version.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Settle } from './motion.tsx';
import { SPACE, TYPE, surfaceOf, type ElevationName } from './theme.ts';
import { useTheme } from './theme-context.tsx';

export interface SurfaceProps {
  readonly level?: ElevationName | undefined;
  readonly children: ReactNode;
  /** Padding step. `lg` is the card default; `hero` is for a specimen. */
  readonly pad?: 'none' | 'md' | 'lg' | 'xl' | 'hero' | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly testID?: string | undefined;
}

const PADDING = {
  none: 0,
  md: SPACE.md,
  lg: SPACE.lg,
  xl: SPACE.xl,
  hero: SPACE.hero,
} as const;

/**
 * A levelled box.
 *
 * The only place in the system that turns an elevation name into colours, which
 * is what lets every other component say `level="card"` and never mention a
 * palette token — and lets the "no component hard-codes a colour" test have
 * something true to assert.
 */
export function Surface({
  level = 'card',
  children,
  pad = 'lg',
  style,
  testID,
}: SurfaceProps): ReactNode {
  const theme = useTheme();
  const { background, border, borderWidth } = surfaceOf(theme, level);

  return (
    <View
      style={[
        styles.surface,
        {
          backgroundColor: background,
          borderColor: border,
          borderRadius: theme.radius.md,
          borderWidth,
          padding: PADDING[pad],
        },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export interface MuseumCardProps {
  /**
   * The specimen. A character, a headword — the thing the card is *about*.
   *
   * Taken as a node rather than a string so a caller can pass ruby-annotated
   * text, which is the common case for a word rather than a kanji.
   */
  readonly specimen: ReactNode;
  /** The one line of context. A gloss, a reading, a sense. Never a list. */
  readonly caption?: string | undefined;
  /**
   * Catalogue text: the small print under the rule. Kanken band, stroke count,
   * where it was met. Rendered in sans at `meta`, and never given emphasis.
   */
  readonly catalogue?: readonly string[] | undefined;
  /**
   * Anything that earns a place beside the specimen — a recall meter, a lens
   * row. Rendered above the rule, below the caption.
   */
  readonly children?: ReactNode;
  /** Attribution and disclosures. Rendered last, quietest, always visible. */
  readonly footer?: ReactNode;
  readonly testID?: string | undefined;
}

export function MuseumCard({
  specimen,
  caption,
  catalogue,
  children,
  footer,
  testID,
}: MuseumCardProps): ReactNode {
  const theme = useTheme();

  return (
    <Settle>
      <Surface level="card" pad="xl" testID={testID}>
        {/*
          The specimen sits in its own block with generous space under it. The
          space is the difference between a card and a row: a row would put the
          next field 4 points below.
        */}
        <View style={styles.specimen}>{specimen}</View>

        {caption === undefined ? null : (
          <Text
            style={[
              styles.caption,
              {
                color: theme.color.ink,
                fontFamily: theme.font.mincho,
                lineHeight: TYPE.body * theme.leading.japanese,
              },
            ]}
          >
            {caption}
          </Text>
        )}

        {children}

        {catalogue === undefined || catalogue.length === 0 ? null : (
          <>
            <View style={[styles.rule, { backgroundColor: theme.color.rule }]} />
            <View style={styles.catalogue}>
              {catalogue.map((line) => (
                <Text
                  key={line}
                  style={[
                    styles.catalogueLine,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  {line}
                </Text>
              ))}
            </View>
          </>
        )}

        {footer}
      </Surface>
    </Settle>
  );
}

const styles = StyleSheet.create({
  surface: {
    gap: SPACE.md,
  },
  specimen: {
    alignItems: 'center',
    paddingBottom: SPACE.lg,
    paddingTop: SPACE.sm,
  },
  caption: {
    fontSize: TYPE.body,
    textAlign: 'center',
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginTop: SPACE.lg,
    width: '100%',
  },
  catalogue: {
    gap: SPACE.xs,
  },
  catalogueLine: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
