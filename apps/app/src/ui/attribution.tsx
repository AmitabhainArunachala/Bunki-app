/**
 * Provenance and attribution footers.
 *
 * Every rendered sourced field keeps its provenance and its required
 * attribution — that is a campaign non-negotiable and a REQ-SRC obligation, and
 * for the share-alike sources in `packages/seed` it is a licence condition, not
 * a style preference. `src/ui/notices.tsx` already renders the seed's own
 * disclosures on the pages that carry seed content; this file is the *generic*
 * footer the rest of the experience layer needs, so a new surface has somewhere
 * correct to put an attribution instead of inventing one.
 *
 * Three things it does that a `<small>` would not:
 *
 *   - **It refuses to be empty.** `AttributionFooter` with no lines renders the
 *     absence explicitly rather than nothing, because a sourced field with no
 *     attribution and no visible gap is the failure mode: it looks finished.
 *   - **It separates the source from the standing.** "KANJIDIC2, CC BY-SA" is a
 *     source; "not checked against a published dictionary" is a standing. They
 *     are different claims and they are rendered as different lines.
 *   - **It stays visible.** Attribution is never behind a `Disclosure`. Folding
 *     a licence condition away is not progressive disclosure.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

export interface AttributionLine {
  /** What the field is: "Readings", "Stroke order", "Example sentence". */
  readonly field: string;
  /** Where it came from, with the licence the source requires be shown. */
  readonly source: string;
}

export const NO_ATTRIBUTION_NOTE =
  'No source is recorded for this panel, so nothing here should be read as sourced.';

export interface AttributionFooterProps {
  readonly lines: readonly AttributionLine[];
  /**
   * Standing: what this content *is* and is not. Rendered above the source
   * lines, because "project-authored, not checked against a dictionary" changes
   * how the source lines should be read.
   */
  readonly standing?: string | undefined;
  readonly testID?: string | undefined;
}

export function AttributionFooter({
  lines,
  standing,
  testID = 'attribution-footer',
}: AttributionFooterProps): ReactNode {
  const theme = useTheme();

  return (
    <View style={styles.footer} testID={testID}>
      <View style={[styles.rule, { backgroundColor: theme.color.rule }]} />

      {standing === undefined ? null : (
        <Text
          style={[styles.standing, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {standing}
        </Text>
      )}

      {lines.length === 0 ? (
        <Text style={[styles.line, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {NO_ATTRIBUTION_NOTE}
        </Text>
      ) : (
        lines.map((line) => (
          <Text
            key={`${line.field}:${line.source}`}
            style={[styles.line, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
          >
            <Text style={styles.field}>{line.field}</Text>
            {` — ${line.source}`}
          </Text>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    gap: SPACE.xs,
    marginTop: SPACE.lg,
  },
  rule: {
    height: StyleSheet.hairlineWidth,
    marginBottom: SPACE.sm,
    width: '100%',
  },
  standing: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.65,
  },
  line: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.55,
  },
  field: {
    fontWeight: '600',
  },
});
