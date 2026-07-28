/**
 * The division of labour, on the screen (Campaign E / B6; map document §4.3).
 *
 * The guide is the one surface in the app that has an opinion about where to go
 * next, which makes it the one surface where a learner could reasonably wonder
 * whether the opinion is also the verdict. So the answer is on the page rather
 * than in a docblock, and both columns are shown — what the guide decides *and*
 * what it can never do — because a panel that listed only the first would be
 * describing something else.
 *
 * Every string comes from `@bunki/domain`'s `GUIDE_AUTHORITY`, which is the
 * same constant the boundary test is written around. A screen that retyped the
 * table could drift from what the code enforces, and the drift would be
 * invisible: it would still read well.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GUIDE_AUTHORITY, GUIDE_BOUNDARY_RULE, GUIDE_RECORD_STANDING_NOTE } from '@bunki/domain';

import { Disclosure } from '../disclosure.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

function Column({
  title,
  lines,
  testID,
}: {
  readonly title: string;
  readonly lines: readonly string[];
  readonly testID: string;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.column} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[styles.columnTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        {title}
      </Text>
      {lines.map((line) => (
        <Text
          key={line}
          style={[styles.line, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          · {line}
        </Text>
      ))}
    </View>
  );
}

export function GuideBoundaryPanel({
  testID = 'guide-boundary',
}: {
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();

  return (
    <View style={styles.wrapper} testID={testID}>
      <Text
        style={[styles.rule, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        testID="guide-boundary-rule"
      >
        {GUIDE_BOUNDARY_RULE}
      </Text>

      <Disclosure
        note="The whole division of labour, both columns. It is enforced by a test rather than by this paragraph."
        testID="guide-boundary-detail"
        title="What the guide decides, and what it never does"
      >
        <View style={styles.columns}>
          <Column
            lines={GUIDE_AUTHORITY.guideDecides}
            testID="guide-boundary-decides"
            title="The guide decides"
          />
          <Column
            lines={GUIDE_AUTHORITY.guideNeverDoes}
            testID="guide-boundary-never"
            title="The guide never"
          />
          <Column
            lines={GUIDE_AUTHORITY.srsDecides}
            testID="guide-boundary-srs-decides"
            title="The evidence gate and the review timing decide"
          />
          <Column
            lines={GUIDE_AUTHORITY.srsNeverDoes}
            testID="guide-boundary-srs-never"
            title="They never"
          />
        </View>
        <Text style={[styles.line, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {GUIDE_RECORD_STANDING_NOTE}
        </Text>
      </Disclosure>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: SPACE.sm,
  },
  rule: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.7,
  },
  columns: {
    gap: SPACE.lg,
  },
  column: {
    gap: SPACE.xs,
  },
  columnTitle: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  line: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
