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

import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  SESSION_STEP_PURPOSE,
  currentStep,
  sessionProgress,
  srsStanding,
  type DomainContext,
  type Grade,
  type SessionStep,
  type SrsStanding,
} from '@bunki/domain';

import { useDebugFlags } from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import { Disclosure } from '../ui/disclosure.tsx';
import { SeedEntryDisclosure } from '../ui/notices.tsx';
import { AppButton, Hairline, RowButton, Section } from '../ui/primitives.tsx';
import { RubyText } from '../ui/ruby.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import {
  NAMED_DECKS_NOT_AVAILABLE,
  SPINE_DERIVATION_NOTE,
  spinesFrom,
  type StudySpine,
} from '../ui/session/spines.ts';
import { SrsPanel } from '../ui/session/srs-panel.tsx';
import { RADIUS, SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';
import {
  contractLabelsForAll,
  NO_PROMOTED_TARGET_NOTE,
  SESSION_INTEGRATION_NOTE,
  useSessionLoop,
  type SessionLoop,
  type SessionTarget,
  type StudyTarget,
} from './session-loop.ts';
import { elapsedMs, usePresentedAt } from './session-timing.ts';

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
  /**
   * Open the word page for something in the study list.
   *
   * Optional so the screen still renders when it is mounted without a router —
   * the tests and the screenshot harness do that — in which case the rows are
   * plain text rather than dead controls.
   */
  readonly onOpenWord?: ((lexemeId: string) => void) | undefined;
}

export function SessionScreen({
  context,
  timeBudgetMin = 12,
  newBudget = 1,
  onOpenCanvas,
  onOpenRepair,
  onBack,
  onOpenWord,
}: SessionScreenProps): ReactNode {
  const theme = useTheme();
  const flags = useDebugFlags();
  const loop = useSessionLoop({ context });
  const [revealed, setRevealed] = useState(false);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showBacklog, setShowBacklog] = useState(false);

  /*
    The gate is "has the learner taken anything up for study", not "is there a
    passage for it".

    Until the one-word ceiling was removed this resolved `loop.target`, which is
    the *canvas* target and therefore required the seed's single hand-written
    passage to embed the word. A learner with thirty promoted words and no 分岐
    was shown the empty state — see `StudyTarget` in `session-loop.ts` for what
    that cost. The canvas is now one optional step of a sitting rather than its
    precondition.
  */
  const resolve = useCallback(
    () => (loop.studyTargets.length === 0 ? null : loop.studyTargets),
    [loop.studyTargets],
  );
  const { state: view, retry } = useLookup<readonly StudyTarget[]>(resolve, {
    flags,
    emptyMessage: 'Nothing is taken up for study yet.',
    emptyDetail: loop.error ?? NO_PROMOTED_TARGET_NOTE,
  });

  if (view.kind === 'loading') {
    return (
      <ScreenShell testID="screen-session" title="Session" titleJa="稽古">
        <LoadingPanel label="Composing a session for your budget…" />
      </ScreenShell>
    );
  }

  if (view.kind === 'error') {
    return (
      <ScreenShell testID="screen-session" title="Session" titleJa="稽古">
        <ErrorPanel detail={view.detail} message={view.message} onRetry={retry} />
        <AppButton accessibilityHint="Returns to search." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  if (view.kind === 'empty') {
    return (
      <ScreenShell testID="screen-session" title="Session" titleJa="稽古">
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
      onOpenWord={onOpenWord}
      revealed={revealed}
      setHintsUsed={setHintsUsed}
      setRevealed={setRevealed}
      setShowBacklog={setShowBacklog}
      showBacklog={showBacklog}
      studyTargets={view.data}
      target={loop.target}
      theme={theme}
      timeBudgetMin={timeBudgetMin}
    />
  );
}

interface SessionBodyProps {
  readonly loop: SessionLoop;
  /** The canvas step's subject, or `null` when this sitting has no canvas step. */
  readonly target: SessionTarget | null;
  readonly studyTargets: readonly StudyTarget[];
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
  readonly onOpenWord?: ((lexemeId: string) => void) | undefined;
}

function SessionBody({
  loop,
  target,
  studyTargets,
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
  onOpenWord,
}: SessionBodyProps): ReactNode {
  const runtime = loop.state.runtime;
  const step = runtime === null ? null : currentStep(runtime);

  // Every contract every promoted word minted, not only the ones the canvas
  // probes. The planner draws from all of them — and because reading and meaning
  // are minted on the same tick, `compareDueContracts` falls through to its id
  // tiebreak and routinely draws the *meaning* contract first. A map narrower
  // than the set of contracts that exist leaves those steps to the planner's
  // `?? memory.contractId` fallback, which puts a raw `contract-meaning-…` in
  // front of the learner as the thing they are being asked to recall.
  const labels = contractLabelsForAll(studyTargets);

  // Straight from the kernel's own replay of the sitting's log, at the sitting's
  // own injected clock. Not a second projection: `loop.state.derived` is
  // `replay(log)`, the same value an export replays to.
  const standing: SrsStanding = srsStanding(loop.state.derived, {
    asOf: loop.now(),
    labelByContract: labels,
  });

  const spines: readonly StudySpine[] = spinesFrom(studyTargets, loop.state.log);

  // When the prompt now in front of the learner appeared. Re-marked whenever the
  // session moves to another step, so the latency reported for an answer is the
  // time spent on *that* step and not on the sitting so far.
  const presentedAt = usePresentedAt(
    loop.now,
    `${runtime?.sessionId ?? 'unstarted'}:${step?.stepId ?? 'none'}`,
  );

  const start = (): void => {
    loop.dispatch({
      kind: 'start',
      timeBudgetMin,
      newBudget,
      // Only when a promoted word is actually in the seed's passage. An absent
      // `canvasId` is an ordinary input to `planSession`; it composes a sitting
      // without an integration step rather than refusing to compose one.
      ...(target === null ? {} : { canvasId: target.passage.id }),
      asOf: loop.now(),
      labelByContract: labels,
    });
  };

  if (runtime === null) {
    return (
      <ScreenShell
        // The intro names the words the sitting will be built from, which are
        // JMdict headwords on a screen — the display §3 of the EDRDG statement
        // attaches the acknowledgement to.
        notice={<SeedEntryDisclosure />}
        subtitle={`A finite sitting for the time you have. ${String(timeBudgetMin)} minutes, one new item at most.`}
        testID="screen-session"
        title="Session"
        titleJa="稽古"
      >
        <Section
          note="The plan is composed once, before you begin, and cannot grow while you are in it."
          testID="session-intro"
          title="Ready when you are"
        >
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {`The sitting will be built from what is due across the ${String(studyTargets.length)} word(s) you have taken up for study.`}{' '}
            {target === null
              ? 'None of them is in the seed’s hand-written passage, so this sitting has no integration step — the passage is one step, not a requirement.'
              : `${target.lexeme.headword} is in the passage, so this sitting also has an integration step.`}
          </Text>
          <AppButton
            accessibilityHint="Composes the plan for the chosen budget and opens the session."
            label="Compose the session"
            onPress={start}
            testID="session-start"
            variant="primary"
          />
        </Section>

        <SrsPanel standing={standing} testID="session-srs-panel" />

        <StudyList onOpenWord={onOpenWord} spines={spines} studyTargets={studyTargets} />

        <Hairline />
        <AppButton accessibilityHint="Returns to search." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  const plan = runtime.plan;
  const progress = sessionProgress(runtime);
  const closed = runtime.status === 'closed';

  const answer = (grade: Grade): void => {
    loop.dispatch({
      kind: 'answerStep',
      attempt: {
        grade,
        // Measured, not assumed: from the instant this step's prompt appeared to
        // the instant the grade was pressed, both read from the injected clock.
        // REQ-SCH-06 makes a logged latency a precondition for an embedded probe
        // to count, and REQ-SCH-05 (latency is auxiliary and confounded) licenses
        // never *reading* it as a mastery signal — not writing one nobody took.
        latencyMs: elapsedMs(presentedAt, loop.now()),
        hintsUsed,
        revealedBeforeRecall: revealed,
        ...(grade === 'easy' ? { userConfirmedEasy: true as const } : {}),
      },
    });
    setRevealed(false);
    setHintsUsed(0);
  };

  /**
   * Move past this step without answering.
   *
   * The hint count and the reveal flag are cleared here as well as on an answer.
   * They describe *this* prompt, and carrying them into the next step would
   * attribute one step's hints to another step's attempt — a small lie of
   * exactly the kind the measured latency above exists to stop telling.
   */
  const skip = (): void => {
    loop.dispatch({ kind: 'skipStep' });
    setRevealed(false);
    setHintsUsed(0);
  };

  return (
    <ScreenShell
      notice={<SeedEntryDisclosure />}
      subtitle={`${String(plan.stepCount)} steps · about ${String(plan.estimatedMinutes)} min of the ${String(plan.budget.timeBudgetMin)} you gave`}
      testID="screen-session"
      title="Session"
      titleJa="稽古"
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
            /*
              A canvas step only exists when `start` passed a `canvasId`, and it
              only does that when `target` is non-null. The narrowing is still
              written out rather than asserted: a `!` here would be the screen
              promising something the planner, not the screen, decides.
            */
            target === null ? (
              <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
                This sitting has no integration passage. Nothing you have taken up for study is in
                the seed’s hand-written passage.
              </Text>
            ) : (
              <>
                <Text
                  style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                >
                  Read {target.passage.title} with {target.lexeme.headword} in it. What you do there
                  is classified when you do it — some of it is a real review, most of it is
                  exposure.
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
            )
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
                onPress={skip}
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

      {/*
        The statistics, one level deeper while a sitting is open.

        Leading with them mid-sitting would put the backlog in front of the
        learner at exactly the moment REQ-SCH-04 exists to protect — but hiding
        them entirely would be the dishonest hiding Codex §15.6 names. A closed
        disclosure is the shape that is neither.
      */}
      <Disclosure
        note="The same figures as before the sitting, recomputed from this sitting’s own log."
        testID="session-stats-disclosure"
        title="What you are holding, and the load ahead"
      >
        <SrsPanel standing={standing} testID="session-srs-panel-open" />
      </Disclosure>

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

/**
 * Everything taken up for study, and the spines it falls into.
 *
 * The list is the whole of it — no pagination, no "top 5" — because a learner
 * asking "what am I studying" is asking for the set, and a truncated answer to
 * that question is how a list becomes a graveyard (frozen §10.1).
 */
function StudyList({
  studyTargets,
  spines,
  onOpenWord,
}: {
  readonly studyTargets: readonly StudyTarget[];
  readonly spines: readonly StudySpine[];
  readonly onOpenWord?: ((lexemeId: string) => void) | undefined;
}): ReactNode {
  const theme = useTheme();

  return (
    <Section
      note={SPINE_DERIVATION_NOTE}
      testID="session-study-list"
      title={`Taken up for study (${String(studyTargets.length)})`}
    >
      {studyTargets.map((study) =>
        onOpenWord === undefined ? (
          <View
            key={study.threadId}
            style={styles.studyRow}
            testID={`session-study-${study.lexeme.id}`}
          >
            <StudyRowContent study={study} theme={theme} />
          </View>
        ) : (
          <RowButton
            accessibilityHint="Opens its word page."
            accessibilityLabel={`${study.lexeme.headword}, read ${study.lexeme.reading}: ${study.lexeme.senses.join(', ')}`}
            key={study.threadId}
            onPress={() => onOpenWord(study.lexeme.id)}
            testID={`session-study-${study.lexeme.id}`}
          >
            <StudyRowContent study={study} theme={theme} />
          </RowButton>
        ),
      )}

      <Disclosure
        count={spines.length}
        empty={
          spines.length === 0
            ? 'No grouping has two members yet. A spine of one is the word itself with extra chrome.'
            : undefined
        }
        note="Views over one memory state, derived from the log."
        testID="session-spines"
        title="Spines"
      >
        {spines.map((spine) => (
          <View key={spine.id} style={styles.studyRow}>
            <Text
              style={[styles.planLabel, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              {spine.label} · {String(spine.targets.length)}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {spine.targets.map((target) => target.lexeme.headword).join('、')}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
            >
              {spine.derivation}
            </Text>
          </View>
        ))}
      </Disclosure>

      <Text
        style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        testID="session-named-decks-gap"
      >
        {NAMED_DECKS_NOT_AVAILABLE}
      </Text>
    </Section>
  );
}

/** One study-list row's content, shared by the tappable and inert variants. */
function StudyRowContent({
  study,
  theme,
}: {
  readonly study: StudyTarget;
  readonly theme: ReturnType<typeof useTheme>;
}): ReactNode {
  return (
    <>
      <RubyText
        reading={study.lexeme.reading}
        serif={false}
        size={TYPE.body}
        written={study.lexeme.headword}
      />
      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {study.lexeme.senses.slice(0, 2).join(' · ')}
        {study.passage === null ? '' : ' · in the passage'}
      </Text>
    </>
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
  studyRow: {
    gap: 2,
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
