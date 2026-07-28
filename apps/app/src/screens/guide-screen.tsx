/**
 * 案内人 — the guide (Campaign E / B6; map document §4).
 *
 * The operator has deliberately not defined this thing's character, so nothing
 * on this screen gives it a name, a face, a voice or a personality. What it has
 * instead is the four things §4 does decide, and they are structural rather
 * than cosmetic — a later character design changes what stands at a station and
 * changes nothing about the page.
 *
 *   1. **A position.** Not a bubble in a corner: a station on a finite, numbered
 *      road, one ahead of the learner, and at the fork when a fork exists.
 *   2. **A conversation.** No level quiz. Each turn raises one seeded word, the
 *      guide can be asked for its words about it, and the learner says what they
 *      like about it from a closed set of stances — closed because OD-08 says
 *      only seeded content leaves the device, and a free-text answer would break
 *      that on the first turn.
 *   3. **Two records.** A long road in months and a short plan in days, both
 *      with a time and an author on them, both editable, both kept when they are
 *      revised so a learner can read what the guide believed last week.
 *   4. **The boundary.** The guide narrates and routes. It does not decide.
 *
 * ## What this screen writes
 *
 * Nothing. There is no `store.execute` here or anywhere under `src/ui/guide/`,
 * and `test/guide-boundary.test.ts` asserts it. The route and the plan live in
 * this screen's state for as long as the learner is on it, which is the same
 * standing an unaccepted AI candidate has — and the screen says so in its own
 * words rather than letting a record look durable.
 *
 * ## Why there is no capability lens row
 *
 * A lens row is a filter over memory state, and this screen shows none: the
 * guide has no memory state to show and must never appear to. What it shows is
 * all five lenses at once with the reason each is or is not proposed, which is
 * the shape REQ-UI-07 asks for when a surface has something to say per
 * capability and nothing to say in aggregate.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DeclaredBranch } from '@bunki/domain';
import { conversationProgress } from '@bunki/domain';

import { AttributionFooter } from '../ui/attribution.tsx';
import {
  GUIDE_PROMPTS,
  guideAttributionLines,
  GuideBoundaryPanel,
  GuideConversationPanel,
  GuideEstimatePanel,
  GuideHistoryPanel,
  GuidePlanPanel,
  GuideRoad,
  LAYER_ATTRIBUTION_NOTE,
  useGuide,
} from '../ui/guide/index.ts';
import { SeedEntryDisclosure } from '../ui/notices.tsx';
import { AppButton, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { currentPlan } from '@bunki/domain';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

export interface GuideScreenProps {
  readonly onOpenWord: (targetForm: string) => void;
  /**
   * Forks declared elsewhere in the app.
   *
   * A prop rather than something this screen derives, because deriving one here
   * is precisely what the guide may not do. `DeclaredBranch` has one
   * constructor in the kernel and its input is a stumble the evidence gate
   * admitted, so a screen cannot manufacture the value either.
   *
   * Empty in this build, and the screen says so: the only declarer that exists
   * so far is the session workspace's stumble, and that workspace is mounted
   * inside the session group rather than here. Wiring it is a coordination
   * request in the build capsule, not something this lane can do to another
   * lane's provider.
   */
  readonly declaredBranches?: readonly DeclaredBranch[] | undefined;
}

/**
 * What the guide's own records are, said before a learner could assume more.
 *
 * The sentence is checked against the code by `test/guide-boundary.test.ts`,
 * which asserts this directory executes no command — so "not written to your
 * record" is a property rather than a promise.
 */
const DURABILITY_NOTE =
  'The guide’s route and plan live on this screen while you are on it. They are not written to your record, are not exported, and do not survive a reload. That is deliberate for now: a proposal is not something that happened, and this build has no event family for one.';

const NO_FORK_NOTE =
  'No fork has been declared for you here. A fork is declared by the evidence gate when a retrieval actually fails — the guide cannot open one, and cannot close one either. In this build the only place a fork can be declared is inside a sitting, so this screen will show one only once that is wired through.';

export function GuideScreen({ onOpenWord, declaredBranches = [] }: GuideScreenProps): ReactNode {
  const theme = useTheme();
  const guide = useGuide({ declaredBranches });
  const progress = conversationProgress(guide.conversation);
  const plan = currentPlan(guide.ledger);

  const meta = (text: string, id?: string): ReactNode => (
    <Text
      style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
      testID={id}
    >
      {text}
    </Text>
  );

  return (
    <ScreenShell
      lede={
        <View style={styles.lede}>
          <GuideBoundaryPanel />
          {meta(DURABILITY_NOTE, 'guide-durability-note')}
        </View>
      }
      notice={<SeedEntryDisclosure />}
      subtitle="Somewhere on the road, ahead of you. It proposes a way and explains a fork; it never records what you know."
      testID="guide-screen"
      title="The guide"
      titleJa="案内人"
    >
      {guide.failure === null ? null : (
        <ErrorPanel
          detail={guide.failure}
          message="The guide could not be asked about that."
          testID="guide-error"
        />
      )}

      <Section
        note="A finite road with named stations across three era layers, and two marks on it: where you are, and where the guide is."
        testID="guide-position"
        title="Where the guide is standing"
      >
        {guide.route === null || guide.position === null ? (
          <EmptyPanel
            detail="Talk to the guide below, then ask it to write a road. Until then there is nowhere for it to stand, and it says so rather than drawing one."
            message="No road yet"
            testID="guide-position-empty"
          />
        ) : (
          <>
            <GuideRoad
              onMove={guide.moveWaypoint}
              onOpenWord={onOpenWord}
              onRemove={guide.removeWaypoint}
              position={guide.position}
              progress={guide.progress}
              route={guide.route}
            />
            {guide.position.branch === null
              ? meta(NO_FORK_NOTE, 'guide-no-fork-note')
              : meta(guide.position.branch.because, 'guide-fork-note')}
            {meta(LAYER_ATTRIBUTION_NOTE, 'guide-layer-attribution')}
            <AppButton
              accessibilityHint="Replaces the current road with one written from the conversation as it stands now. The earlier road is kept."
              accessibilityLabel="Ask the guide to write the road again"
              label="Write it again from the conversation"
              onPress={guide.propose}
              testID="guide-repropose"
            />
          </>
        )}
      </Section>

      <GuideConversationPanel
        asking={guide.asking}
        conversation={guide.conversation}
        onAnswer={guide.answer}
        onAsk={guide.ask}
        speechByTurn={guide.speechByTurn}
      />

      <Section
        note="Nothing about the conversation is scored, so this button is available whenever you like — including before you have answered anything, in which case the guide says it has nothing to go on."
        testID="guide-propose"
        title="Ask for a road and a plan"
      >
        {meta(
          `${progress.answered} of ${progress.total} turns answered. ${GUIDE_PROMPTS.length} words in this exchange.`,
          'guide-progress',
        )}
        <AppButton
          accessibilityHint="Writes a long road and a short plan from the conversation so far, both with a time on them."
          accessibilityLabel="Ask the guide to write a road and a plan"
          label="Write a road and a plan"
          onPress={guide.propose}
          testID="guide-write-records"
          variant="primary"
        />
      </Section>

      <GuideEstimatePanel estimate={guide.estimate} />

      <GuidePlanPanel onOpenWord={onOpenWord} onRemoveStep={guide.removePlanStep} plan={plan} />

      <GuideHistoryPanel ledger={guide.ledger} />

      {/*
        Derived, not typed. The licence a source requires be shown lives in the
        seed's provenance records, and a screen that restated it would keep
        saying the old one after it changed.
      */}
      <AttributionFooter
        lines={guideAttributionLines()}
        standing="Nothing on this screen was measured, and nothing on it changes what the app has stored."
        testID="guide-attribution"
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  lede: {
    gap: SPACE.md,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
