/**
 * The small parts the specimen page is built from.
 *
 * These are *not* part of the vocabulary Wave B adopts — they exist to display
 * the vocabulary, which is a different job with different rules. A swatch has to
 * name a colour, which is exactly the thing every other component is forbidden
 * from doing, so the exemption lives in one file with this docblock on it rather
 * than being sprinkled across the page.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DrawnRule } from '../motion.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

export interface SpecimenSectionProps {
  readonly title: string;
  /** What the section is showing, and what rule it is keeping. */
  readonly note: string;
  readonly children: ReactNode;
  readonly testID?: string | undefined;
}

export function SpecimenSection({
  title,
  note,
  children,
  testID,
}: SpecimenSectionProps): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.section} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        {title}
      </Text>
      <DrawnRule />
      <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {note}
      </Text>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

export interface SwatchProps {
  readonly label: string;
  readonly value: string;
  /** Ratio against the page, printed under the swatch. */
  readonly ratio?: number | undefined;
  /** Draw the chip as a ring rather than a fill, for edge tokens. */
  readonly edge?: boolean | undefined;
}

export function Swatch({ label, value, ratio, edge = false }: SwatchProps): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.swatch}>
      <View
        // The one component in the system that is *given* a colour rather than
        // asking the theme for one, because printing the token is its whole job.
        aria-hidden
        style={[
          styles.chip,
          {
            backgroundColor: edge ? 'transparent' : value,
            borderColor: edge ? value : theme.color.rule,
            borderRadius: theme.radius.sm,
            borderWidth: edge ? 3 : 1,
          },
        ]}
      />
      <Text style={[styles.swatchLabel, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {label}
      </Text>
      <Text
        style={[styles.swatchMeta, { color: theme.color.inkFaint, fontFamily: theme.font.mono }]}
      >
        {value}
        {ratio === undefined ? '' : `  ${ratio.toFixed(2)}:1`}
      </Text>
    </View>
  );
}

export interface SpecimenRowProps {
  readonly label: string;
  readonly children: ReactNode;
}

/** A labelled row: the token name on the left, the thing it produces on the right. */
export function SpecimenRow({ label, children }: SpecimenRowProps): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.color.inkMuted, fontFamily: theme.font.mono }]}>
        {label}
      </Text>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: SPACE.sm,
    marginTop: SPACE.xxl,
  },
  title: {
    fontSize: TYPE.title,
    fontWeight: '700',
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.7,
  },
  body: {
    gap: SPACE.lg,
    marginTop: SPACE.md,
  },
  swatch: {
    gap: 2,
    width: 156,
  },
  chip: {
    height: 40,
    width: '100%',
  },
  swatchLabel: {
    fontSize: TYPE.meta,
    fontWeight: '600',
  },
  swatchMeta: {
    fontSize: 11,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.md,
  },
  rowLabel: {
    fontSize: TYPE.meta,
    paddingTop: SPACE.xs,
    width: 130,
  },
  rowBody: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 200,
  },
});
