/**
 * The condition that is still open (Campaign E, lane B5; REQ-JRN-02).
 *
 * The learner's brief for this lane is one sentence: *"the learner should be
 * able to see what condition is still open."* This is that panel, and it is
 * built around a refusal — it will not render a progress bar.
 *
 * A bar would say "you are 50% of the way to rejoining", which is false in a
 * specific and damaging way: the criterion is not a distance, it is a predicate
 * over evidence, and the next answer either satisfies it or does not. What the
 * panel shows instead is the predicate itself, clause by clause, with the
 * answers that were offered to it and the clauses each one missed.
 *
 * ## Why the refused answers are shown at all
 *
 * Because "why did that not count" is the question a learner actually asks, and
 * a list of only the qualifying answers cannot answer it. The evidence
 * inspector makes the same argument one level down (REQ-UI-06), and the gate
 * records a decision for every observation, admitted or not, for exactly this
 * reason.
 *
 * There is no failure language anywhere here. An answer that did not qualify is
 * described by the clause it is still open on, which is a fact about the
 * evidence — never by a word about the learner.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Disclosure } from '../disclosure.tsx';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { clauseOf, stillOpenLine, type OpenCondition } from './open-conditions.ts';

export interface OpenConditionPanelProps {
  readonly condition: OpenCondition;
  /** The domain's own sentence that a branch never ends on a step count. */
  readonly neverAStepCount: string;
  readonly testID?: string | undefined;
}

export function OpenConditionPanel({
  condition,
  neverAStepCount,
  testID = 'journey-condition',
}: OpenConditionPanelProps): ReactNode {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.panel,
        { backgroundColor: theme.color.vermilionSoft, borderColor: theme.color.vermilion },
      ]}
      testID={testID}
    >
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        {condition.satisfied ? 'The condition that closed this' : 'What is still open'}
      </Text>

      {/* Verbatim from the domain, so the sentence a learner reads is the one
          the evaluator applies. */}
      <Text
        style={[styles.statement, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        testID="journey-condition-statement"
      >
        {condition.statement}
      </Text>

      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {neverAStepCount}
      </Text>

      <View style={[styles.clauses, { borderTopColor: theme.color.rule }]}>
        {condition.clauses.map((clause) => (
          <View key={clause.id} style={styles.clause}>
            <Text style={[styles.asks, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
              {clause.asks}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {clause.because}
            </Text>
          </View>
        ))}
      </View>

      <Text
        accessibilityLiveRegion="polite"
        style={[styles.counts, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        testID="journey-condition-counts"
      >
        {condition.qualifyingSoFar} of {condition.required} qualifying{' '}
        {condition.required === 1 ? 'answer' : 'answers'} so far. {stillOpenLine(condition)}
      </Text>

      <Disclosure
        count={condition.considered.length}
        empty={
          condition.considered.length === 0
            ? 'Nothing has been offered to this condition yet, so there is nothing to account for.'
            : undefined
        }
        note="Every answer this condition has looked at, newest first, and the clauses each one is still open on."
        testID="journey-condition-considered"
        title="Answers offered to this condition"
      >
        {condition.considered.map((verdict) => (
          <View
            key={verdict.eventId}
            style={[styles.verdict, { borderColor: theme.color.rule, borderRadius: RADIUS.sm }]}
            testID={`journey-verdict-${verdict.eventId}`}
          >
            <Text style={[styles.asks, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
              {verdict.qualifies ? 'Met every clause.' : 'Still open on:'}
            </Text>
            {verdict.qualifies ? null : (
              <View style={styles.support}>
                {verdict.openClauses.map((id) => (
                  <Text
                    key={id}
                    style={[
                      styles.meta,
                      { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                    ]}
                  >
                    · {clauseOf(id).asks} {clauseOf(id).because}
                  </Text>
                ))}
              </View>
            )}
            <Text
              style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
            >
              {verdict.eventId} · {verdict.at}
            </Text>
          </View>
        ))}
      </Disclosure>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderLeftWidth: 3,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
  },
  title: {
    fontSize: TYPE.title,
    fontWeight: '600',
  },
  statement: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.65,
  },
  clauses: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: SPACE.sm,
    paddingTop: SPACE.sm,
  },
  clause: {
    gap: 2,
  },
  asks: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  counts: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.6,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  verdict: {
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.sm,
  },
  support: {
    gap: 2,
  },
});
