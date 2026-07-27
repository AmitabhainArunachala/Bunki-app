/**
 * Screen 4 — session (WP-08; controller §10.4, REQ-UI-05, REQ-SCH-04).
 *
 * REQ-UI-05 asks for four things and this screen is those four things:
 *
 *   1. **it leads with the finite plan for the chosen budget** — the whole
 *      sitting is on screen before the first step, so the learner can see the
 *      end from the beginning. It is deliberately not a "cards remaining"
 *      counter that only ever shrinks toward a number nobody chose;
 *   2. **a visible recipe** — `plan.recipe`, the shape of the sitting in one
 *      line, from the planner rather than reassembled here;
 *   3. **an explicit completion state** — the closing panel names which of the
 *      three terminal states the session reached, and the `SessionClosed` event
 *      that carries it;
 *   4. **backlog one level deeper, on demand** — the deferred count is behind a
 *      disclosure. Hiding it entirely would be dishonest (Codex §15.6); leading
 *      with it would be the treadmill REQ-SCH-04 exists to end.
 *
 * Everything this screen does with a tap is a domain command. It holds no
 * grading, no interval arithmetic, and no judgement about whether an answer
 * counted — `useSessionLoop` submits, `@bunki/domain` decides, and what comes
 * back is rendered. The one number it computes is `n of m`, which is arithmetic
 * about the plan, not about the learner (REQ-LM-03: no global scalar).
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  SESSION_STEP_PURPOSE,
  currentStep,
  sessionProgress,
  type DomainContext,
  type Grade,
  type SessionStep,
} from '@bunki/domain';

import { useDebugFlags } from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import { AppButton, Hairline, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { RADIUS, SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';
import {
  SESSION_INTEGRATION_NOTE,
  useSessionLoop,
  type SessionLoop,
  type SessionTarget,
} from './session-loop.ts';

/** The four grades, with the wording REQ-DM-07 makes true of each. */
const GRADE_BUTTONS: readonly { readonly grade: Grade; readonly label: string }[] = [
  { grade: 'again', label: 'Again' },
  { grade: 'hard', label: 'Hard' },
  { grade: 'good', label: 'Good' },
  { grade: 'easy', label: 'Easy' },
];

/** How a completion state is worded for a person, from the domain's own value. */
const COMPLETION_WORDING: Readonly<Record<string, string>> = {
  completed: 'Finished. Every step in the plan has an outcome.',
  abandoned: 'Ended early. Some steps were left, and nothing was added because of it.',
  budget_exhausted: 'The budget you gave fitted no work — only the ending.',
};

export interface SessionScreenProps {
  readonly context: DomainContext;
  /** Minutes the learner offered. Chosen upstream; the plan never exceeds it. */
  readonly timeBudgetMin?: number | undefined;
  readonly newBudget?: number | undefined;
  readonly onOpenCanvas: (canvasId: string) => void;
  readonly onOpenRepair: () => void;
  readonly onBack: () => void;
}

export function SessionScreen({
  context,
  timeBudgetMin = 12,
  newBudget = 1,
  onOpenCanvas,
  onOpenRepair,
  onBack,
}: SessionScreenProps): ReactNode {
  const theme = useTheme();
  const flags = useDebugFlags();
  const loop = useSessionLoop({ context });
  const [revealed, setRevealed] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showBacklog, setShowBacklog] = useState(false);

  // The seed resolution goes through the same state machine as every other
  // screen, so loading and error are the real ones, not a stand-in (REQ-UI-09).
  const resolve = useCallback(() => loop.target, [loop.target]);
  const { state: view, retry } = useLookup<SessionTarget>(resolve, {
    flags,
    emptyMessage: 'No session can be composed from the Phase-0 seed.',
    emptyDetail:
      loop.error ??
      'A session needs a promoted target with a retrieval contract. The seed provides one; if this is empty, the dataset changed.',
  });

  if (view.kind === 'loading') {
    return (
      <ScreenShell testID="screen-session" title="Session">
        <LoadingPanel label="Composing a session for your budget…" />
      </ScreenShell>
    );
  }

  if (view.kind === 'error') {
    return (
      <ScreenShell testID="screen-session" title="Session">
        <ErrorPanel detail={view.detail} message={view.message} onRetry={retry} />
        <AppButton accessibilityHint="Returns to search." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  if (view.kind === 'empty') {
    return (
      <ScreenShell testID="screen-session" title="Session">
        <EmptyPanel detail={view.detail} message={view.message} />
        <AppButton accessibilityHint="Returns to search." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  return (
    <SessionBody
      hintsUsed={hintsUsed}
      loop={loop}
      newBudget={newBudget}
      onBack={onBack}
      onOpenCanvas={onOpenCanvas}
      onOpenRepair={onOpenRepair}
      revealed={revealed}
      setHintsUsed={setHintsUsed}
      setRevealed={setRevealed}
      setShowBacklog={setShowBacklog}
      showBacklog={showBacklog}
      target={view.data}
      theme={theme}
      timeBudgetMin={timeBudgetMin}
    />
  );
}

interface SessionBodyProps {
  readonly loop: SessionLoop;
  readonly target: SessionTarget;
  readonly theme: ReturnType<typeof useTheme>;
  readonly timeBudgetMin: number;
  readonly newBudget: number;
  readonly revealed: boolean;
  readonly setRevealed: (value: boolean) => void;
  readonly hintsUsed: number;
  readonly setHintsUsed: (value: number) => void;
  readonly showBacklog: boolean;
  readonly setShowBacklog: (value: boolean) => void;
  readonly onOpenCanvas: (canvasId: string) => void;
  readonly onOpenRepair: () => void;
  readonly onBack: () => void;
}

function SessionBody({
  loop,
  target,
  theme,
  timeBudgetMin,
  newBudget,
  revealed,
  setRevealed,
  hintsUsed,
  setHintsUsed,
  showBacklog,
  setShowBacklog,
  onOpenCanvas,
  onOpenRepair,
  onBack,
}: SessionBodyProps): ReactNode {
  const runtime = loop.state.runtime;

  const labels = useMemo(
    () => new Map([[target.probeContractId, target.lexeme.headword]]),
    [target.probeContractId, target.lexeme.headword],
  );

  const start = (): void => {
    loop.dispatch({
      kind: 'start',
      timeBudgetMin,
      newBudget,
      canvasId: target.passage.id,
      asOf: loop.now(),
      labelByContract: labels,
    });
  };

  if (runtime === null) {
    return (
      <ScreenShell
        subtitle={`A finite sitting for the time you have. ${String(timeBudgetMin)} minutes, one new item at most.`}
        testID="screen-session"
        title="Session"
      >
        <Section
          note="The plan is composed once, before you begin, and cannot grow while you are in it."
          testID="session-intro"
          title="Ready when you are"
        >
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            The sitting will be built from what is due for {target.lexeme.headword} and the passage
            that embeds it.
          </Text>
          <AppButton
            accessibilityHint="Composes the plan for the chosen budget and opens the session."
            label="Compose the session"
            onPress={start}
            testID="session-start"
            variant="primary"
          />
        </Section>
        <Hairline />
        <AppButton accessibilityHint="Returns to search." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  const plan = runtime.plan;
  const progress = sessionProgress(runtime);
  const step = currentStep(runtime);
  const closed = runtime.status === 'closed';

  const answer = (grade: Grade): void => {
    loop.dispatch({
      kind: 'answerStep',
      attempt: {
        grade,
        // Latency is auxiliary and confounded (REQ-SCH-05); it is recorded
        // because the contract requires a latency, and it is never read as a
        // mastery signal anywhere in this app.
        latencyMs: 0,
        hintsUsed,
        revealedBeforeRecall: revealed,
        ...(grade === 'easy' ? { userConfirmedEasy: true as const } : {}),
      },
    });
    setRevealed(false);
    setHintsUsed(0);
  };

  return (
    <ScreenShell
      subtitle={`${String(plan.stepCount)} steps · about ${String(plan.estimatedMinutes)} min of the ${String(plan.budget.timeBudgetMin)} you gave`}
      testID="screen-session"
      title="Session"
    >
      {/* --------------------------------------------- the finite plan */}
      <Section
        note={`Recipe: ${plan.recipe}. This list is the whole sitting; it cannot grow while you are in it.`}
        testID="session-plan"
        title="The plan"
      >
        {plan.steps.map((planStep) => (
          <PlanRow
            key={planStep.stepId}
            outcome={runtime.outcomes[planStep.index] ?? 'pending'}
            current={!closed && planStep.index === runtime.cursor}
            step={planStep}
          />
        ))}
      </Section>

      {/* --------------------------------------------- progress */}
      <View
        accessibilityLiveRegion="polite"
        style={[
          styles.progress,
          { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
        ]}
        testID="session-progress"
      >
        <Text
          style={[styles.progressText, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        >
          {String(progress.settledCount)} of {String(progress.stepCount)} done ·{' '}
          {String(progress.answeredCount)} answered · {String(progress.skippedCount)} skipped
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          About {String(progress.remainingMinutes)} min of the plan left.
        </Text>
      </View>

      {/* --------------------------------------------- the current step */}
      {closed ? (
        <CompletionPanel
          completionState={runtime.completionState}
          onBack={onBack}
          sessionId={runtime.sessionId}
        />
      ) : step === null ? (
        <Section
          note="Every step has an outcome. Closing writes the SessionClosed event that says how it ended."
          testID="session-finish"
          title="That is the whole sitting"
        >
          <AppButton
            accessibilityHint="Ends the session and records how it finished."
            label="Finish the session"
            onPress={() => loop.dispatch({ kind: 'close' })}
            testID="session-close"
            variant="primary"
          />
        </Section>
      ) : (
        <Section
          note={SESSION_STEP_PURPOSE[step.kind]}
          testID="session-current"
          title={`Now: ${step.label}`}
        >
          {step.kind === 'canvas' ? (
            <>
              <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
                Read {target.passage.title} with {target.lexeme.headword} in it. What you do there
                is classified when you do it — some of it is a real review, most of it is exposure.
              </Text>
              <AppButton
                accessibilityHint="Opens the integration canvas for this passage."
                label="Open the passage"
                onPress={() => onOpenCanvas(step.canvasId ?? target.passage.id)}
                testID="session-open-canvas"
                variant="primary"
              />
              <AppButton
                accessibilityHint="Marks the reading done and moves to the next step."
                label="Done reading"
                onPress={() => loop.dispatch({ kind: 'completeStep' })}
                testID="session-complete-canvas"
              />
            </>
          ) : step.kind === 'closure' ? (
            <AppButton
              accessibilityHint="Ends the session and records how it finished."
              label="Finish the session"
              onPress={() => loop.dispatch({ kind: 'close' })}
              testID="session-close"
              variant="primary"
            />
          ) : (
            <>
              <Text
                style={[styles.prompt, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
                testID="session-prompt"
              >
                {step.label}
              </Text>
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                {revealed
                  ? 'You saw the answer before recalling it, so this will be recorded as Again whatever you press.'
                  : hintsUsed > 0
                    ? `${String(hintsUsed)} hint taken. It is recorded with the answer.`
                    : 'Answer from memory, then say how it went.'}
              </Text>

              <View style={styles.actions}>
                <AppButton
                  accessibilityHint="Takes one hint. The hint is recorded with your answer."
                  disabled={revealed}
                  label="Hint"
                  onPress={() => setHintsUsed(hintsUsed + 1)}
                  testID="session-hint"
                />
                <AppButton
                  accessibilityHint="Shows the answer. Recorded, and the result becomes Again."
                  label={revealed ? 'Answer shown' : 'Show the answer'}
                  onPress={() => setRevealed(true)}
                  testID="session-reveal"
                />
              </View>

              <View style={styles.actions}>
                {GRADE_BUTTONS.map((entry) => (
                  <AppButton
                    accessibilityHint={
                      entry.grade === 'easy'
                        ? 'Records Easy, which you are confirming explicitly.'
                        : `Records ${entry.label} for this step.`
                    }
                    accessibilityLabel={`${entry.label} for ${step.label}`}
                    key={entry.grade}
                    label={entry.label}
                    onPress={() => answer(entry.grade)}
                    testID={`session-grade-${entry.grade}`}
                    variant={entry.grade === 'good' ? 'primary' : 'secondary'}
                  />
                ))}
              </View>

              <AppButton
                accessibilityHint="Moves past this step without answering. Recorded as skipped."
                label="Skip"
                onPress={() => loop.dispatch({ kind: 'skipStep' })}
                testID="session-skip"
                variant="quiet"
              />
            </>
          )}
        </Section>
      )}

      <Hairline />

      {/* --------------------------------------------- one level deeper */}
      <AppButton
        accessibilityHint={
          showBacklog ? 'Hides the backlog figure.' : 'Shows what did not fit this budget.'
        }
        label={showBacklog ? 'Hide what did not fit' : 'What did not fit?'}
        onPress={() => setShowBacklog(!showBacklog)}
        testID="session-backlog-toggle"
      />
      {!showBacklog ? null : (
        <Section
          note="Reported, never queued. Nothing here was added to the sitting you are in, and nothing will be added while you are in it."
          testID="session-backlog"
          title="Beyond this sitting"
        >
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {plan.deferredDueCount === 0
              ? 'Everything that was due fitted into this plan.'
              : `${String(plan.deferredDueCount)} due item(s) did not fit the ${String(plan.budget.timeBudgetMin)}-minute budget.`}
          </Text>
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            {SESSION_INTEGRATION_NOTE}
          </Text>
        </Section>
      )}

      <AppButton
        accessibilityHint="Opens the repair branch for the most recent miss."
        label="Repair branch"
        onPress={onOpenRepair}
        testID="session-open-repair"
        variant="quiet"
      />
      <AppButton accessibilityHint="Returns to search." label="Back" onPress={onBack} />
    </ScreenShell>
  );
}

function PlanRow({
  step,
  outcome,
  current,
}: {
  readonly step: SessionStep;
  readonly outcome: string;
  readonly current: boolean;
}): ReactNode {
  const theme = useTheme();
  const marker = outcome === 'answered' ? '●' : outcome === 'skipped' ? '○' : current ? '▶' : '·';

  return (
    <View
      accessibilityLabel={`Step ${String(step.index + 1)}: ${step.kind}, ${step.label}, ${outcome}${current ? ', current step' : ''}`}
      accessible
      style={[
        styles.planRow,
        {
          backgroundColor: current ? theme.color.vermilionSoft : theme.color.raised,
          borderColor: current ? theme.color.vermilion : theme.color.rule,
        },
      ]}
      testID={`session-plan-step-${step.stepId}`}
    >
      <Text
        style={[styles.planMarker, { color: theme.color.vermilion, fontFamily: theme.font.sans }]}
      >
        {marker}
      </Text>
      <View style={styles.planText}>
        <Text style={[styles.planLabel, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {step.kind} — {step.label}
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          about {String(step.costMinutes)} min · {outcome}
        </Text>
      </View>
    </View>
  );
}

function CompletionPanel({
  completionState,
  sessionId,
  onBack,
}: {
  readonly completionState: string | null;
  readonly sessionId: string;
  readonly onBack: () => void;
}): ReactNode {
  const theme = useTheme();
  const wording =
    completionState === null
      ? 'The session is closed.'
      : (COMPLETION_WORDING[completionState] ?? 'The session is closed.');

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      style={[
        styles.completion,
        { backgroundColor: theme.color.raised, borderColor: theme.color.vermilion },
      ]}
      testID="session-completion"
    >
      <Text
        accessibilityRole="header"
        style={[styles.completionTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        testID="session-completion-state"
      >
        {completionState ?? 'closed'}
      </Text>
      <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {wording}
      </Text>
      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        Recorded as SessionClosed for {sessionId}. Nothing was queued behind it.
      </Text>
      <AppButton accessibilityHint="Returns to search." label="Back" onPress={onBack} />
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
  planRow: {
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: SPACE.md,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  planMarker: {
    fontSize: TYPE.label,
    width: 18,
  },
  planText: {
    flex: 1,
    gap: 2,
  },
  planLabel: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  progress: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  progressText: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  completion: {
    borderRadius: RADIUS.md,
    borderWidth: 2,
    gap: SPACE.sm,
    padding: SPACE.lg,
  },
  completionTitle: {
    fontSize: TYPE.title,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
