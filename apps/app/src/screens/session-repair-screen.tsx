/**
 * Screen 7 — the minimal repair branch (WP-08; controller §10 screen 7,
 * REQ-JRN-01/02/03).
 *
 * One stumble, two hypotheses, one cheap diagnostic, and an ending declared by
 * evidence. Nothing here routes, ranks, or diagnoses: the two paths are
 * hard-coded in `@bunki/domain`'s `repair.ts`, the recommendation is a lookup on
 * the skill that missed, and the branch closes when {@link REJOIN_CRITERION} is
 * satisfied — never after a number of steps.
 *
 * Three things this screen is careful to *say*, because a repair flow that
 * cannot be predicted is indistinguishable from one the system invented:
 *
 *   - the criterion is on screen **before** it is met, verbatim from the domain;
 *   - the recommended path is marked as recommended and the other is equally
 *     tappable (REQ-JRN-03's reversible default: a choice between at most two
 *     paths with a recommended default);
 *   - the path not taken is described by the domain's own policy sentence, so
 *     the learner knows it is not becoming a queue (REQ-JRN-02).
 *
 * Every hypothesis is phrased with "may". REQ-JRN-01 forbids inferring a cause
 * confidently from one stumble, and copy that told the learner what was wrong
 * with them would be exactly that inference wearing a helpful voice.
 */

import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  REJOIN_CRITERION,
  REPAIR_UNTAKEN_POLICY,
  latestStumble,
  type DomainContext,
  type Grade,
  type RepairBranchOption,
  type RepairState,
} from '@bunki/domain';

import { useDebugFlags } from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import { AppButton, Hairline, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { RADIUS, SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';
import { useSessionLoop, type SessionLoop, type SessionTarget } from './session-loop.ts';
import { elapsedMs, usePresentedAt } from './session-timing.ts';

export interface SessionRepairScreenProps {
  readonly context: DomainContext;
  readonly onBack: () => void;
}

export function SessionRepairScreen({ context, onBack }: SessionRepairScreenProps): ReactNode {
  const flags = useDebugFlags();
  const loop = useSessionLoop({ context });

  const resolve = useCallback(() => loop.target, [loop.target]);
  const { state: view, retry } = useLookup<SessionTarget>(resolve, {
    flags,
    emptyMessage: 'There is nothing to repair.',
    emptyDetail:
      loop.error ??
      'A repair branch opens on a miss. Nothing has been missed on the seeded target in this session.',
  });

  if (view.kind === 'loading') {
    return (
      <ScreenShell testID="screen-session-repair" title="Repair branch">
        <LoadingPanel label="Looking for the miss…" />
      </ScreenShell>
    );
  }

  if (view.kind === 'error') {
    return (
      <ScreenShell testID="screen-session-repair" title="Repair branch">
        <ErrorPanel detail={view.detail} message={view.message} onRetry={retry} />
        <AppButton accessibilityHint="Returns to the session." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  if (view.kind === 'empty') {
    return (
      <ScreenShell testID="screen-session-repair" title="Repair branch">
        <EmptyPanel detail={view.detail} message={view.message} />
        <AppButton accessibilityHint="Returns to the session." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  return <RepairBody loop={loop} onBack={onBack} target={view.data} />;
}

function RepairBody({
  loop,
  target,
  onBack,
}: {
  readonly loop: SessionLoop;
  readonly target: SessionTarget;
  readonly onBack: () => void;
}): ReactNode {
  const theme = useTheme();
  const repair = loop.state.repair;
  const stumble = latestStumble(loop.state);

  // ------------------------------------------------ nothing missed yet
  if (repair === null) {
    return (
      <ScreenShell
        subtitle={`For ${target.lexeme.headword}. One flow, hard-coded — Phase 0 has no general routing.`}
        testID="screen-session-repair"
        title="Repair branch"
      >
        {stumble === null ? (
          <EmptyPanel
            detail="A branch opens on an Again — the grade that says the retrieval did not happen. A Hard is a success under strain and opens nothing."
            message="Nothing has been missed yet."
            testID="repair-empty"
          />
        ) : (
          <Section
            note="One miss, two hypotheses, one cheap question to tell them apart."
            testID="repair-open"
            title="Something was missed"
          >
            <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
              {target.lexeme.headword} came back as Again. That is one observation, not a diagnosis.
            </Text>
            <AppButton
              accessibilityHint="Opens the repair branch on that miss."
              label="Look at it"
              onPress={() => loop.dispatch({ kind: 'openRepair', stumble })}
              testID="repair-start"
              variant="primary"
            />
          </Section>
        )}
        <Hairline />
        <AppButton accessibilityHint="Returns to the session." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      subtitle={`For ${target.lexeme.headword}. One flow, hard-coded — Phase 0 has no general routing.`}
      testID="screen-session-repair"
      title="Repair branch"
    >
      <CriterionPanel />

      {repair.phase === 'diagnosing' ? (
        <Section
          note="Two possible causes, neither of them assumed. Answer whichever question you can."
          testID="repair-diagnostic"
          title="Which of these fits?"
        >
          {repair.offered.map((option) => (
            <BranchCard
              key={option.id}
              onChoose={() =>
                loop.dispatch({ kind: 'chooseRepairBranch', branch: option.id, at: loop.now() })
              }
              option={option}
              recommended={option.id === repair.recommended}
            />
          ))}
        </Section>
      ) : null}

      {repair.phase === 'in_branch' ? (
        <InBranch loop={loop} repair={repair} target={target} />
      ) : null}

      {repair.phase === 'rejoined' ? (
        <View
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={[
            styles.rejoined,
            { backgroundColor: theme.color.raised, borderColor: theme.color.vermilion },
          ]}
          testID="repair-rejoined"
        >
          <Text
            accessibilityRole="header"
            style={[styles.rejoinedTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          >
            Rejoined
          </Text>
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            You got it on your own, so the branch is done. The evidence that closed it is in the
            ledger as {repair.rejoinedByEventId ?? 'an admitted review'}.
          </Text>
        </View>
      ) : null}

      {repair.phase === 'left' ? (
        <EmptyPanel
          detail="The miss is still in the ledger, and nothing was added because you left."
          message="You left this branch."
          testID="repair-left"
        />
      ) : null}

      <Hairline />

      <Section
        note={REPAIR_UNTAKEN_POLICY}
        testID="repair-untaken"
        title="The path you did not take"
      >
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {repair.untaken.length === 0
            ? 'You have not chosen yet, so both are still open.'
            : `Still open, quietly: ${repair.untaken.join(', ')}.`}
        </Text>
      </Section>

      <AppButton accessibilityHint="Returns to the session." label="Back" onPress={onBack} />
    </ScreenShell>
  );
}

function InBranch({
  loop,
  repair,
  target,
}: {
  readonly loop: SessionLoop;
  readonly repair: RepairState;
  readonly target: SessionTarget;
}): ReactNode {
  const theme = useTheme();
  const chosen = repair.offered.find((option) => option.id === repair.chosen);
  const attempts = countProbes(loop);

  // Each probe re-presents the same prompt, so the attempt ordinal is part of
  // the presentation's identity: the mark is re-taken after every press and the
  // latency reported is the time spent on that attempt alone.
  const presentedAt = usePresentedAt(
    loop.now,
    `${repair.chosen ?? 'unchosen'}:${String(attempts)}`,
  );

  const probe = (grade: Grade): void => {
    loop.dispatch({
      kind: 'repairProbe',
      attempt: {
        grade,
        // Measured from the injected clock, like every other graded attempt in
        // this app. A repair probe is a real probe against the missed contract.
        latencyMs: elapsedMs(presentedAt, loop.now()),
        hintsUsed: 0,
        revealedBeforeRecall: false,
        ...(grade === 'easy' ? { userConfirmedEasy: true as const } : {}),
      },
    });
    loop.dispatch({ kind: 'checkRejoin' });
  };

  return (
    <Section
      note={chosen?.work ?? 'Work the branch, then try the target again.'}
      testID="repair-branch"
      title={chosen === undefined ? 'In the branch' : `In the ${chosen.id} branch`}
    >
      <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {target.lexeme.headword} is written with {target.lexeme.kanjiUsed.join(' and ')}.{' '}
        {chosen?.hypothesis ?? ''}
      </Text>

      <Text
        style={[styles.prompt, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
        testID="repair-prompt"
      >
        {target.lexeme.headword}
      </Text>

      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        Try it unaided. A hinted or revealed success is a success of the hint, and it will not close
        this branch.
      </Text>

      <View style={styles.actions}>
        {(['again', 'hard', 'good', 'easy'] as const).map((grade) => (
          <AppButton
            accessibilityHint={`Records ${grade} for the contract that was missed.`}
            accessibilityLabel={`${grade} for ${target.lexeme.headword}`}
            key={grade}
            label={grade}
            onPress={() => probe(grade)}
            testID={`repair-grade-${grade}`}
            variant={grade === 'good' ? 'primary' : 'secondary'}
          />
        ))}
      </View>

      <AppButton
        accessibilityHint="Leaves this branch. The miss stays in the ledger and nothing is queued."
        label="Leave this branch"
        onPress={() => loop.dispatch({ kind: 'leaveRepair' })}
        testID="repair-leave"
        variant="quiet"
      />

      <Text
        style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        testID="repair-attempts"
      >
        {attempts} attempt(s) so far. The number does not decide anything.
      </Text>
    </Section>
  );
}

/** How many repair probes this branch has taken. Displayed, never a criterion. */
function countProbes(loop: SessionLoop): number {
  const contractId = loop.state.repair?.stumble.contractId;
  if (contractId === undefined) return 0;
  return loop.state.log.filter((event) => event.idempotencyKey.startsWith(`repair:${contractId}:`))
    .length;
}

function CriterionPanel(): ReactNode {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.criterion,
        { backgroundColor: theme.color.vermilionSoft, borderColor: theme.color.vermilion },
      ]}
      testID="repair-criterion"
    >
      <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {REJOIN_CRITERION}
      </Text>
    </View>
  );
}

function BranchCard({
  option,
  recommended,
  onChoose,
}: {
  readonly option: RepairBranchOption;
  readonly recommended: boolean;
  readonly onChoose: () => void;
}): ReactNode {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.branch,
        {
          backgroundColor: theme.color.raised,
          borderColor: recommended ? theme.color.vermilion : theme.color.rule,
        },
      ]}
      testID={`repair-branch-${option.id}`}
    >
      <Text style={[styles.branchTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {option.diagnostic}
      </Text>
      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {option.hypothesis} · {option.family}
      </Text>
      <AppButton
        accessibilityHint={option.work}
        accessibilityLabel={`Take the ${option.id} path${recommended ? ', recommended' : ''}`}
        label={recommended ? `${option.id} (recommended)` : option.id}
        onPress={onChoose}
        testID={`repair-choose-${option.id}`}
        variant={recommended ? 'primary' : 'secondary'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.7,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  prompt: {
    fontSize: TYPE.headword,
    lineHeight: TYPE.headword * 1.3,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  criterion: {
    borderLeftWidth: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
  },
  branch: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.sm,
    padding: SPACE.md,
  },
  branchTitle: {
    fontSize: TYPE.body,
    fontWeight: '600',
  },
  rejoined: {
    borderRadius: RADIUS.md,
    borderWidth: 2,
    gap: SPACE.sm,
    padding: SPACE.lg,
  },
  rejoinedTitle: {
    fontSize: TYPE.title,
    fontWeight: '700',
  },
});
