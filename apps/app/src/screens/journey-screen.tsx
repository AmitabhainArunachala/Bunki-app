/**
 * Journeys — the branch point (Campaign E, lane B5; REQ-JRN-01/02/03).
 *
 * 分岐 is a railway word and this is the screen that makes the product's name
 * mean something: you stumble, a branch opens, the fork shows the road that
 * repairs it beside the roads you are not taking, you walk one, and the
 * evidence — not a button — puts you back on the main line.
 *
 * ## Who declares a branch
 *
 * Not the learner and not this screen. A branch exists here if and only if the
 * ledger holds a `ReviewGraded` that the evidence gate **admitted** and
 * **counted as `again`** after the reveal rule had its say. There is no control
 * on this screen that opens a branch, and `src/ui/journey/stumbles.ts` reads the
 * gate's own decision record rather than the grade the learner pressed. A
 * learner who wants a branch has to miss something; a learner who missed
 * something has one whether they wanted it or not.
 *
 * ## Who declares a rejoin
 *
 * The evidence. `evaluateJourneyRejoin` is re-run whenever the log moves, and
 * when it says the criterion is met the phase changes on its own. There is
 * deliberately **no "I'm done" control**: a branch that could be closed by a tap
 * would be a branch whose ending said nothing about memory. The one control
 * that ends a road is *Step off this road*, and it explicitly does not repair
 * anything — the domain has no `abandoned` phase for the reason its own header
 * gives, and neither does this copy.
 *
 * ## What this screen may and may not write
 *
 * It writes **nothing**. It reads `AppStore.readAll()` and `readDerived()`, and
 * every state transition it performs is over `@bunki/domain`'s pure
 * `JourneyState` — a value in React state, not an event. A probe answer here is
 * routing and `DiagnosticProbe.producesEvidence` is the literal `false`; the
 * evidence gate remains the sole factory for evidence, and this surface never
 * calls `execute` or `persistMinted` at all.
 *
 * ## A journey is a consequence, never a punishment
 *
 * Nothing on this screen scores, ranks, or congratulates. Every hypothesis is
 * conditional ("may", "might"), because REQ-JRN-01 forbids inferring a cause
 * confidently from one stumble; every account of an answer that did not qualify
 * names the clause of the criterion rather than anything about the learner; and
 * the roads not taken are dimmed and drawn rather than deleted, because the
 * frozen spec §3 says they stay revisitable.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  BRANCH_FAMILY_STATUS,
  QUIET_OPPORTUNITY_POLICY,
  REJOIN_IS_NEVER_A_STEP_COUNT,
  activeQuietOpportunities,
  answerProbe,
  applyJourneyRejoin,
  createSessionWorkspace,
  enterJourneyBranch,
  evaluateJourneyRejoin,
  leaveJourney,
  openJourney,
  selectBranch,
  threadIndexByContract,
  type DomainContext,
  type JourneyStumble,
  type ProbeOutcome,
} from '@bunki/domain';

import { findLexemeById, findLexemeByHeadword, type SeedLexeme } from '../data/catalog.ts';
import { useAppStore, useAppSnapshot, useDebugFlags } from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import { capabilityOf, type CapabilityId } from '../ui/capability.ts';
import { Disclosure } from '../ui/disclosure.tsx';
import { BranchFork } from '../ui/journey/branch-fork.tsx';
import { JourneyHistory } from '../ui/journey/journey-history.tsx';
import { OpenConditionPanel } from '../ui/journey/open-condition-panel.tsx';
import { journeyHistory, PHASE_LINES } from '../ui/journey/history.ts';
import { openConditionFor } from '../ui/journey/open-conditions.ts';
import { railSummary, railsOfState } from '../ui/journey/rails.ts';
import {
  SEPARATE_SITTINGS_NOT_AVAILABLE,
  journeyObservationsFrom,
  stumblesFrom,
} from '../ui/journey/stumbles.ts';
import { SeedEntryDisclosure } from '../ui/notices.tsx';
import { AppButton, ChipButton, Hairline, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { Surface } from '../ui/surface.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

/**
 * Which capability lens a stumbled contract exercises.
 *
 * A display mapping and nothing more — the domain has no such relation, and
 * this table asserts none. `discrimination` maps to `null` on purpose: telling
 * two confusables apart is not exactly reading and not exactly meaning, and a
 * table that picked one would be inventing a fact to avoid an honest blank.
 * `unknown` is a first-class value here for the same reason it is on the era
 * attribute.
 */
const LENS_OF_SKILL: Readonly<Record<string, CapabilityId | null>> = Object.freeze({
  orthography_to_reading: 'reading',
  form_to_meaning: 'meaning',
  meaning_to_production: 'production',
  audio_to_meaning: 'listening',
  discrimination: null,
});

/**
 * What survives leaving this screen, and what does not. Said on screen.
 *
 * The **branch** is durable, because it is not stored: it is derived from the
 * miss in the ledger every time this screen opens, so it is still here after a
 * reload and after a year. The **routing** — which probe answers were given and
 * which road was taken — is React state and goes when the screen does.
 *
 * That is a real gap and not a design position. Persisting it needs a place to
 * put app-local state, and the one this app has (`AppStore`) is another lane's
 * module; writing an *event* for it would be worse, because taking a road is
 * not evidence of anything and the log is for what the learner did, not for
 * where a surface had got to. So the limitation is disclosed to the learner
 * rather than hidden behind a fork that silently forgets.
 */
export const ROUTING_IS_NOT_STORED =
  'The branch itself is permanent — it is read back out of your ledger every time you open this screen. Which road you took is not: it is remembered while you are on this screen and forgotten when you leave. The evidence that would end the branch is in the ledger either way.';

/** What the screen is about: one miss, and the word it was about. */
interface JourneySubject {
  readonly stumble: JourneyStumble;
  readonly lexeme: SeedLexeme | null;
  /** Every other branch point in the ledger, so none of them is hidden. */
  readonly others: readonly JourneyStumble[];
}

export interface JourneyScreenProps {
  readonly context: DomainContext;
  readonly onBack: () => void;
  /** Open the word a branch is about. Absent leaves the target un-linked. */
  readonly onOpenWord?: ((lexemeId: string) => void) | undefined;
}

export function JourneyScreen({ context, onBack, onOpenWord }: JourneyScreenProps): ReactNode {
  const flags = useDebugFlags();
  const store = useAppStore();
  const snapshot = useAppSnapshot();

  /**
   * Every branch point the ledger holds, newest first.
   *
   * Rebuilt whenever the log moves. `snapshot.revision` is the store's change
   * token — the log itself is not a value React can compare — which is the same
   * mechanism the evidence inspector uses for the same reason.
   *
   * The contract→thread join is `threadIndexByContract`, the kernel's own. It
   * resolves a contract's `targetComponentId` back to the encounter that
   * created the thread, and it is deliberately not re-derived here: a locally
   * re-derived link that disagreed would attach a branch to the wrong word, and
   * the same rule already applies to the session (`session-loop.ts` takes the
   * component id from the kernel for exactly this reason).
   */
  const stumbles = useMemo(() => {
    const log = store.readAll();
    const workspace = createSessionWorkspace(log);
    const threadByContract = threadIndexByContract(workspace);
    const threadsById = new Map(snapshot.threads.map((thread) => [thread.state.threadId, thread]));

    const threadOfContract = (contractId: string): string | null =>
      threadByContract.get(contractId) ?? null;

    return stumblesFrom({
      log,
      state: workspace.derived,
      threadForContract: threadOfContract,
      lexemeForContract: (contractId) => {
        const threadId = threadOfContract(contractId);
        if (threadId === null) return null;
        const thread = threadsById.get(threadId);
        if (thread === undefined) return null;
        if (thread.lexemeId !== null) {
          const byId = findLexemeById(thread.lexemeId);
          if (byId !== null) return byId;
        }
        return findLexemeByHeadword(thread.displayText);
      },
    });
  }, [store, snapshot.revision, snapshot.threads]);

  const resolve = useCallback((): JourneySubject | null => {
    const [newest, ...others] = stumbles;
    if (newest === undefined) return null;
    const thread = snapshot.threads.find((entry) => entry.state.threadId === newest.threadId);
    const lexeme =
      thread === undefined
        ? null
        : ((thread.lexemeId === null ? null : findLexemeById(thread.lexemeId)) ??
          findLexemeByHeadword(thread.displayText));
    return { stumble: newest, lexeme, others };
  }, [snapshot.threads, stumbles]);

  const { state, retry } = useLookup<JourneySubject>(resolve, {
    flags,
    emptyMessage: 'No branch is open.',
    emptyDetail:
      'A branch opens on a miss the evidence gate counted — nothing on this screen opens one, and nothing you do here can. Sit a session, and if a retrieval does not come back, the fork appears here on its own.',
  });

  if (state.kind === 'loading') {
    return (
      <ScreenShell
        notice={<SeedEntryDisclosure />}
        testID="screen-journey"
        title="Journeys"
        titleJa="分岐"
      >
        <LoadingPanel label="Reading the ledger for branch points…" />
      </ScreenShell>
    );
  }

  if (state.kind === 'error') {
    return (
      <ScreenShell
        notice={<SeedEntryDisclosure />}
        testID="screen-journey"
        title="Journeys"
        titleJa="分岐"
      >
        <ErrorPanel detail={state.detail} message={state.message} onRetry={retry} />
        <AppButton
          accessibilityHint="Returns to the map."
          label="Back to 地図 Map"
          onPress={onBack}
        />
      </ScreenShell>
    );
  }

  if (state.kind === 'empty') {
    return (
      <ScreenShell
        notice={<SeedEntryDisclosure />}
        subtitle="分岐 — a branch point. One opens when a retrieval does not come back."
        testID="screen-journey"
        title="Journeys"
        titleJa="分岐"
      >
        <EmptyPanel detail={state.detail} message={state.message} testID="journey-empty" />
        <AppButton
          accessibilityHint="Returns to the map."
          label="Back to 地図 Map"
          onPress={onBack}
        />
      </ScreenShell>
    );
  }

  return (
    <JourneyBody
      context={context}
      onBack={onBack}
      onOpenWord={onOpenWord}
      revision={snapshot.revision}
      subject={state.data}
    />
  );
}

function JourneyBody({
  subject,
  context,
  revision,
  onBack,
  onOpenWord,
}: {
  readonly subject: JourneySubject;
  readonly context: DomainContext;
  readonly revision: number;
  readonly onBack: () => void;
  readonly onOpenWord: ((lexemeId: string) => void) | undefined;
}): ReactNode {
  const theme = useTheme();
  const store = useAppStore();

  const [journey, setJourney] = useState(() => openJourney(subject.stumble));

  /*
    A new branch point replaces the journey rather than merging into it.

    Two misses on two contracts are two branches; carrying probe answers from
    one into the other would route the second using the first's diagnosis. Keyed
    on the event id, because that is what identifies the miss.
  */
  const [openedFor, setOpenedFor] = useState(subject.stumble.eventId);
  if (openedFor !== subject.stumble.eventId) {
    setOpenedFor(subject.stumble.eventId);
    setJourney(openJourney(subject.stumble));
  }

  /** Every graded answer in the ledger, in the shape the criterion reads. */
  const observations = useMemo(
    () => journeyObservationsFrom(store.readAll(), store.readDerived()),
    // `revision` is the store's change token; the log is not a value React can
    // compare, so the revision is what tells this memo to re-run.
    [store, revision],
  );

  /**
   * Rejoin, declared by the evidence and by nothing else.
   *
   * Re-evaluated whenever the ledger moves. `applyJourneyRejoin` is a no-op on a
   * refusal, so this cannot advance the phase on anything but a satisfied
   * criterion — and there is no control anywhere on this screen that could.
   */
  useEffect(() => {
    setJourney((current) =>
      applyJourneyRejoin(current, evaluateJourneyRejoin(current, observations)),
    );
  }, [observations]);

  const rails = railsOfState(journey);
  const condition = openConditionFor(journey.criterion, journey.enteredAt, observations);
  const history = journeyHistory(journey, condition);
  const selection = selectBranch(journey.compiled, journey.answers);
  const quiet = activeQuietOpportunities(journey.untaken, context.clock.now());
  const lens = LENS_OF_SKILL[subject.stumble.skill] ?? null;

  const headword = subject.lexeme?.headword ?? null;

  return (
    <ScreenShell
      // The fork, the branch copy and the target line all render the JMdict
      // headword and reading, so §3 of the EDRDG statement attaches to this
      // screen as much as to the word page.
      notice={<SeedEntryDisclosure />}
      subtitle={
        headword === null
          ? '分岐 — a branch point, opened by the evidence gate.'
          : `分岐 — the branch that opened on ${headword}.`
      }
      testID="screen-journey"
      title="Journeys"
      titleJa="分岐"
    >
      {/*
        `Surface`, not a hand-rolled box: a levelled surface is what the design
        vocabulary already owns, and `well` is its name for one set into the
        page. Re-deriving `sunken` here would be a second copy of a mapping the
        theme is the single source of.
      */}
      <Surface level="well" pad="md" style={styles.standing} testID="journey-standing">
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.phase, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          testID="journey-phase"
        >
          {PHASE_LINES[journey.phase]}
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {railSummary(rails)}
        </Text>
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="journey-lens"
        >
          {lens === null
            ? 'The contract that missed does not fall under exactly one capability lens, so this branch does not claim one.'
            : `This branch is about one capability: ${capabilityOf(lens).label} (${capabilityOf(lens).japanese}). ${capabilityOf(lens).blurb} It says nothing about the others.`}
        </Text>
        {headword !== null && onOpenWord !== undefined && subject.lexeme !== null ? (
          <AppButton
            accessibilityHint="Opens the word this branch is about."
            accessibilityLabel={`Open ${headword}`}
            label={`Open ${headword}`}
            onPress={() => onOpenWord(subject.lexeme?.id ?? '')}
            testID="journey-open-word"
            variant="quiet"
          />
        ) : null}
      </Surface>

      <Section
        note="Not a diagnosis. One miss raises several possibilities and settles none of them."
        testID="journey-what-opened"
        title="What opened this"
      >
        <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {headword === null ? 'A contract' : headword} came back as{' '}
          {subject.stumble.effectiveGrade} — the grade the evidence gate counted, after its reveal
          rule. That is one observation, and this fork is its consequence.
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {BRANCH_FAMILY_STATUS}
        </Text>
      </Section>

      {journey.phase === 'diagnosing' && journey.compiled.probes.length > 0 ? (
        <Section
          note="One or two cheap questions that tell the roads apart. Neither answer is a verdict about you, and nothing you press here reaches the ledger."
          testID="journey-probes"
          title="Two questions, before you choose"
        >
          {journey.compiled.probes.map((probe) => (
            <Surface
              key={probe.id}
              level="card"
              pad="md"
              style={styles.probe}
              testID={`journey-probe-${probe.id}`}
            >
              <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
                {probe.question}
              </Text>
              <View style={styles.probeAnswers}>
                {(['yes', 'no', 'unsure'] as readonly ProbeOutcome[]).map((outcome) => (
                  <ChipButton
                    accessibilityHint="Routes the fork. It is not an answer to a review and produces no evidence."
                    accessibilityLabel={`Answer ${outcome} to: ${probe.question}`}
                    key={outcome}
                    label={outcome}
                    onPress={() =>
                      setJourney((current) => answerProbe(current, { probeId: probe.id, outcome }))
                    }
                    selected={journey.answers.some(
                      (answer) => answer.probeId === probe.id && answer.outcome === outcome,
                    )}
                    testID={`journey-probe-${probe.id}-${outcome}`}
                  />
                ))}
              </View>
            </Surface>
          ))}

          <Text
            accessibilityLiveRegion="polite"
            style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            testID="journey-selection"
          >
            {selection.selected
              ? `The answers point at the ${journey.compiled.offered.find((option) => option.family === selection.family)?.label ?? selection.family} road. Any other road on the fork is still yours to take.`
              : selection.detail}
          </Text>
        </Section>
      ) : null}

      <Section
        note="Every road this build knows how to route, drawn. The ones with nowhere to go for this word are drawn too, dimmed, with the reason."
        testID="journey-fork-section"
        title="The fork"
      >
        <BranchFork
          onTake={(rail) =>
            setJourney((current) => enterJourneyBranch(current, rail.family, context.clock.now()))
          }
          rails={rails}
          rejoined={journey.phase === 'rejoined'}
        />
      </Section>

      <Hairline />

      <OpenConditionPanel condition={condition} neverAStepCount={REJOIN_IS_NEVER_A_STEP_COUNT} />

      {journey.phase === 'in_branch' ? (
        <AppButton
          accessibilityHint="Leaves this road. The miss stays in the ledger, nothing is queued, and the fork stays where it is."
          label="Step off this road"
          onPress={() => setJourney((current) => leaveJourney(current, context.clock.now()))}
          testID="journey-leave"
          variant="quiet"
        />
      ) : null}

      <Section
        note={QUIET_OPPORTUNITY_POLICY}
        testID="journey-quiet"
        title="The roads you did not take"
      >
        {quiet.length === 0 ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            Nothing has been set aside — you have not taken a road yet, so all of them are still on
            the fork above.
          </Text>
        ) : (
          quiet.map((opportunity) => (
            <Text
              key={`${opportunity.contractId}-${opportunity.family}`}
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              testID={`journey-quiet-${opportunity.family}`}
            >
              · {opportunity.hypothesis}
            </Text>
          ))
        )}
      </Section>

      <Disclosure
        count={history.length}
        note="What opened this branch, what has been tried, and what closed it — each entry naming the record it came from."
        testID="journey-history-section"
        title="This journey's history"
      >
        <JourneyHistory entries={history} />
      </Disclosure>

      <Disclosure
        count={subject.others.length}
        empty={
          subject.others.length === 0 ? 'This is the only branch point in your ledger.' : undefined
        }
        note="Older misses the gate counted. This screen shows the newest one; the others are named here rather than hidden."
        testID="journey-other-branch-points"
        title="Other branch points"
      >
        {subject.others.map((other) => (
          <Text
            key={other.eventId}
            style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          >
            {other.contractId} · {other.at} · {other.eventId}
          </Text>
        ))}
      </Disclosure>

      <Text
        style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
        testID="journey-routing-note"
      >
        {ROUTING_IS_NOT_STORED}
      </Text>

      <Text
        style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
        testID="journey-sittings-note"
      >
        {SEPARATE_SITTINGS_NOT_AVAILABLE}
      </Text>

      <AppButton
        accessibilityHint="Returns to the map."
        label="Back to 地図 Map"
        onPress={onBack}
      />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  standing: {
    gap: SPACE.sm,
  },
  phase: {
    fontSize: TYPE.body,
    fontWeight: '600',
  },
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.7,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.65,
  },
  probe: {
    gap: SPACE.sm,
  },
  probeAnswers: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
});
