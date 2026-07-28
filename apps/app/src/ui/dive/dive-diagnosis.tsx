/**
 * A lit surface with a dark interior, said in words (lane B2).
 *
 * The canvas already shows this — a node's band above a row of its interior's
 * bands is the picture, and seeing a bright node with a dark strip under it *is*
 * the diagnosis. This component is the sentence beside the picture, for the
 * learner who wants to know what they are looking at and for the one who cannot
 * see it.
 *
 * Two rules it keeps that the honesty rules make expensive to break:
 *
 *   - **It never aggregates.** Every finding names one capability and two nodes.
 *     There is no summary line, no count of "weak spots", no score. The domain's
 *     `ScaleMismatch` has a required `capability` for the same reason.
 *   - **It says what its bands are made of.** The marks on this surface come from
 *     kept threads and one-tap marks, not from a review measurement, and
 *     `READING_STANDING` says so on screen rather than in a comment.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ScaleMismatch } from '@bunki/domain';

import { capabilityOf, type CapabilityId } from '../capability.ts';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { READING_STANDING, noSourceNote } from './dive-readings.ts';

export const NO_MISMATCH_NOTE =
  'Nothing here reads stronger on the outside than on the inside — which, with marks this coarse, mostly means there is not enough recorded yet for the comparison to say anything.';

/**
 * The empty state, chosen by *why* it is empty.
 *
 * {@link NO_MISMATCH_NOTE} says "not enough recorded yet", and "yet" is a
 * promise: keep going and this will fill in. Under listening, production and
 * writing that promise is false — nothing this build does will ever record
 * anything for them — so those lenses get the reason instead. Reading the same
 * "yet" under five lenses was part of the same collapse `dive-readings.ts`
 * describes: an absence with a cause looked exactly like an absence with a
 * backlog.
 */
export function emptyDiagnosisNote(capability: CapabilityId): string {
  return noSourceNote(capability) ?? NO_MISMATCH_NOTE;
}

export interface DiveDiagnosisProps {
  readonly findings: readonly ScaleMismatch[];
  readonly capability: CapabilityId;
  /** How many findings to show. The rest are counted, never hidden silently. */
  readonly limit?: number | undefined;
  readonly testID?: string | undefined;
}

export function DiveDiagnosis({
  findings,
  capability,
  limit = 4,
  testID,
}: DiveDiagnosisProps): ReactNode {
  const theme = useTheme();
  const shown = findings.slice(0, limit);
  const hidden = findings.length - shown.length;

  return (
    <View style={styles.block} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        Inside what you know — {capabilityOf(capability).label.toLocaleLowerCase('en-US')}
      </Text>

      {shown.length === 0 ? (
        <Text
          style={[styles.detail, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="dive-diagnosis-none"
        >
          {emptyDiagnosisNote(capability)}
        </Text>
      ) : (
        shown.map((finding) => (
          <View
            key={`${finding.outer}|${finding.inner}|${finding.capability}`}
            style={[
              styles.finding,
              { borderColor: theme.color.ruleStrong, borderRadius: RADIUS.sm },
            ]}
            testID={`dive-finding-${finding.inner}`}
          >
            <Text style={[styles.pair, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
              {finding.outerLabel} ⟶ {finding.innerLabel}
            </Text>
            <Text
              style={[styles.detail, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {finding.detail}
            </Text>
          </View>
        ))
      )}

      {hidden > 0 ? (
        <Text style={[styles.detail, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {String(hidden)} more like this in view.
        </Text>
      ) : null}

      <Text style={[styles.detail, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
        {READING_STANDING}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACE.sm,
  },
  title: {
    fontSize: TYPE.title,
    fontWeight: '600',
  },
  finding: {
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  pair: {
    fontSize: TYPE.headwordRow,
  },
  detail: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.65,
  },
});
