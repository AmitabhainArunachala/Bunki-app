/**
 * The two records, visible and editable (Campaign E / B6; map document §4.2).
 *
 * > Both are visible, editable, and revisable, and both are written down as
 * > records with provenance, so a learner can see what the guide believed and
 * > when.
 *
 * Three panels, each answering one clause of that sentence:
 *
 *   - {@link GuideEstimatePanel} — what the exchange left, per capability lens
 *     and never as one number. There is no lens row here on purpose: this is
 *     not a memory-state surface and a lens *filter* would suggest it were.
 *     Every lens is shown at once, including the three the exchange cannot see,
 *     each with the reason it is where it is.
 *   - {@link GuidePlanPanel} — the next few stations, each an invitation with
 *     a lens, each removable.
 *   - {@link GuideHistoryPanel} — every earlier belief, still readable. This is
 *     the panel that makes "and when" answerable.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { GuideEstimate, GuideLedger, GuidePlanRecord, GuideRouteRecord } from '@bunki/domain';

import { CAPABILITIES } from '../capability.ts';
import { Disclosure } from '../disclosure.tsx';
import { AppButton, Section } from '../primitives.tsx';
import { EmptyPanel } from '../screen-state.tsx';
import { Surface } from '../surface.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { provenanceLine, summarise } from './guide-view-model.ts';

// ---------------------------------------------------------------------------
// The estimate
// ---------------------------------------------------------------------------

export function GuideEstimatePanel({
  estimate,
  testID = 'guide-estimate',
}: {
  readonly estimate: GuideEstimate;
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();

  return (
    <Section
      note="What the guide took from the exchange, per capability. Never one number: reading, meaning, listening, production and writing are separate here because they are separate everywhere in this app."
      testID={testID}
      title="What the guide took from the conversation"
    >
      <Surface level="card" pad="lg">
        {/*
          The time is the moment of the last answer, not the moment of the
          render, and it is omitted rather than faked before there is one. An
          estimate stamped with a time at which nothing happened would undo the
          only thing the timestamp is for.
        */}
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="guide-estimate-summary"
        >
          {estimate.answeredCount} answered · {estimate.declinedCount} declined ·{' '}
          {estimate.unansweredCount} not yet answered ·{' '}
          {estimate.at === ''
            ? 'nothing said yet, so there is nothing to date'
            : `as you left it at ${estimate.at}`}
        </Text>

        <View style={styles.lenses}>
          {estimate.impressions.map((impression) => {
            const capability = CAPABILITIES.find((entry) => entry.id === impression.lens);
            const proposed = impression.attention === 'proposed_focus';
            return (
              <View
                key={impression.lens}
                accessibilityLabel={`${capability?.label ?? impression.lens}: ${
                  proposed ? 'proposed as a focus' : 'not proposed'
                }. ${impression.because}`}
                accessible
                style={styles.lensRow}
                testID={`guide-estimate-${impression.lens}`}
              >
                <Text
                  style={[
                    styles.lensName,
                    {
                      color: proposed ? theme.color.vermilion : theme.color.inkMuted,
                      fontFamily: theme.font.sans,
                    },
                  ]}
                >
                  {capability?.label ?? impression.lens}
                  {proposed ? ' · proposed as a focus' : ' · not proposed'}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    { color: theme.color.inkFaint, fontFamily: theme.font.sans },
                  ]}
                >
                  {impression.because}
                </Text>
              </View>
            );
          })}
        </View>

        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {estimate.limits}
        </Text>
      </Surface>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The short-term plan
// ---------------------------------------------------------------------------

export function GuidePlanPanel({
  plan,
  onOpenWord,
  onRemoveStep,
  testID = 'guide-plan',
}: {
  readonly plan: GuidePlanRecord | null;
  readonly onOpenWord: (targetForm: string) => void;
  readonly onRemoveStep: (stepId: string) => void;
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();

  if (plan === null) {
    return (
      <Section
        note="The short road: the next few stations, in days."
        testID={testID}
        title="The short-term plan"
      >
        <EmptyPanel
          detail="Talk to the guide first. It writes a plan from the exchange, and it will say when it did."
          message="No plan yet"
          testID="guide-plan-empty"
        />
      </Section>
    );
  }

  const summary = summarise(plan);

  return (
    <Section
      note="An invitation, not a queue. Nothing here has a date on it, nothing is owed, and taking a step off the list costs nothing."
      testID={testID}
      title={`The short-term plan · ${summary.horizon}`}
    >
      <Surface level="card" pad="lg">
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="guide-plan-provenance"
        >
          {summary.provenance}
        </Text>
        {plan.steps.length === 0 ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            Nothing left on this plan. That is a finished list, not an empty one.
          </Text>
        ) : null}
        {plan.steps.map((step) => (
          <View key={step.id} style={styles.step} testID={`guide-plan-step-${step.id}`}>
            <Text
              style={[styles.stepText, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              {step.ordinal}. {step.invitation}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
            >
              about {step.lens}
            </Text>
            <View style={styles.stepActions}>
              <AppButton
                accessibilityLabel={`Open the word page for ${step.targetForm}`}
                label={`Look at ${step.targetForm}`}
                onPress={() => onOpenWord(step.targetForm)}
                testID={`guide-plan-open-${step.id}`}
              />
              <AppButton
                accessibilityHint="Removes this step. The earlier plan is kept and stays readable."
                accessibilityLabel={`Take ${step.targetForm} off the plan`}
                label="Take off the plan"
                onPress={() => onRemoveStep(step.id)}
                testID={`guide-plan-remove-${step.id}`}
                variant="quiet"
              />
            </View>
          </View>
        ))}
      </Surface>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// The history
// ---------------------------------------------------------------------------

export function GuideHistoryPanel({
  ledger,
  testID = 'guide-history',
}: {
  readonly ledger: GuideLedger;
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();
  const routes = [...ledger.routes].reverse();
  const plans = [...ledger.plans].reverse();
  const count = routes.length + plans.length;

  const line = (record: GuideRouteRecord | GuidePlanRecord): ReactNode => (
    <View
      key={record.recordId}
      style={styles.historyRow}
      testID={`guide-history-${record.recordId}`}
    >
      <Text style={[styles.stepText, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {record.recordId} · {record.title} ·{' '}
        {record.guideArtefact === 'guide_route'
          ? `${record.waypoints.length} stations`
          : `${record.steps.length} steps`}
      </Text>
      <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
        {provenanceLine(record.provenance)}
        {record.supersedes === null ? '' : ` · replaces ${record.supersedes}`}
      </Text>
    </View>
  );

  return (
    <Disclosure
      count={count}
      empty={
        count === 0
          ? 'The guide has not written anything yet, so there is nothing to look back at.'
          : undefined
      }
      note="Every route and plan the guide has written, newest first. Editing one keeps the old one — a record you could overwrite could not answer “what did it believe, and when”."
      testID={testID}
      title="What the guide believed, and when"
    >
      {routes.map(line)}
      {plans.map(line)}
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  lenses: {
    gap: SPACE.md,
    marginTop: SPACE.md,
  },
  lensRow: {
    gap: 2,
  },
  lensName: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  step: {
    gap: SPACE.xs,
    marginTop: SPACE.md,
  },
  stepText: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.6,
  },
  stepActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  historyRow: {
    gap: 2,
    marginTop: SPACE.sm,
  },
});
