/**
 * The journey's own history (Campaign E, lane B5).
 *
 * A road you are walking should be able to tell you where you set out from.
 * This renders the typed entries `history.ts` builds: what opened the branch,
 * what has been tried, and what is left.
 *
 * ## The register
 *
 * Every entry is one clause and one fact. The fact is an event id, a contract
 * or a clause name — something the learner can carry to the evidence inspector
 * and check. That is the belief-ledger rule (REQ-LM-06, "every judgement cites
 * its evidence") applied to a timeline: an unsourced history is a story.
 *
 * ## What is not here
 *
 * No duration, no visit count, no "days active", no streak under any name. The
 * only number in the whole panel is how many answers the condition has looked
 * at, which is a property of the evidence rather than of the learner's
 * diligence — and it lives on the condition panel, not here.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DrawnRule } from '../motion.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import type { JourneyHistoryEntry } from './history.ts';

export interface JourneyHistoryProps {
  readonly entries: readonly JourneyHistoryEntry[];
  readonly testID?: string | undefined;
}

export function JourneyHistory({
  entries,
  testID = 'journey-history',
}: JourneyHistoryProps): ReactNode {
  const theme = useTheme();

  return (
    <View style={styles.list} testID={testID}>
      {entries.map((entry, index) => (
        <View
          // Position is the identity: the same kind of entry can legitimately
          // appear twice (two answers offered, two probes answered), and keying
          // on the kind would collapse them.
          key={`${String(index)}-${entry.kind}`}
          style={styles.entry}
          testID={`journey-history-${entry.kind}`}
        >
          <View style={styles.head}>
            <Text style={[styles.what, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
              {entry.what}
            </Text>
            {entry.at === null ? null : (
              <Text
                style={[styles.when, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
              >
                {entry.at}
              </Text>
            )}
          </View>
          <Text
            style={[styles.detail, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          >
            {entry.detail}
          </Text>
          {index === entries.length - 1 ? null : <DrawnRule />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: SPACE.md,
  },
  entry: {
    gap: SPACE.xs,
  },
  head: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
    justifyContent: 'space-between',
  },
  what: {
    flexShrink: 1,
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  when: {
    fontSize: TYPE.meta,
  },
  detail: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.65,
  },
});
