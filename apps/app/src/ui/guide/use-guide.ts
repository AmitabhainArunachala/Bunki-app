/**
 * The guide's React binding (Campaign E / B6).
 *
 * Thin on purpose, like the candidate hook it is modelled on: every decision
 * worth asserting lives in `@bunki/domain`'s `src/guide/` (position, estimate,
 * records) or in `guide-view-model.ts` (what the screen says). This wires them
 * to a component's lifecycle and to the seeded content policy.
 *
 * ## What it writes
 *
 * Nothing. There is no `store.execute` in this file and no import that could
 * reach one. The conversation, the estimate, the route and the plan live in
 * component state for as long as the learner is on the screen — the same
 * standing an unaccepted AI candidate has, and for the same reason: none of it
 * is a record of what the learner did.
 *
 * That is a real limitation and the screen says so in its own words rather than
 * implying durability. Making guide records durable needs a new event family in
 * the frozen v1 catalog, which is an ADR-level decision and another lane's
 * surface; it is filed as a coordination request in the build capsule.
 *
 * ## What it reads
 *
 * The app store's snapshot, for where the learner is on the road — captures and
 * promotions, both of which are events a person caused. Reading is all it does
 * with it.
 *
 * ## Asking is never automatic
 *
 * No effect fires a request on mount. The learner presses a button, one turn at
 * a time. An exchange that called a model four times on page load would spend
 * the operator's budget without anyone deciding to (OD-08) and would make "the
 * app asked a model about you" something that happened by itself.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { AiRuntime } from '@bunki/ai';
import {
  EMPTY_GUIDE_LEDGER,
  answerTurn,
  currentPlan,
  currentRoute,
  formEstimate,
  guidePositionOn,
  guideProvenance,
  openConversation,
  proposePlan,
  proposeRoute,
  recordPlan,
  recordRoute,
  withGuideText,
  withRouteTitle,
  withWaypointMoved,
  withoutPlanStep,
  withoutWaypoint,
  type DeclaredBranch,
  type GuideConversation,
  type GuideEstimate,
  type GuideLedger,
  type GuidePosition,
  type GuideRouteRecord,
  type LearnerStance,
  type WaypointProgress,
} from '@bunki/domain';

import { useAiRuntime, useAppSnapshot } from '../../state/app-context.tsx';
import { createSystemClock } from '../../state/runtime.ts';
import {
  DEFAULT_PLAN_TITLE,
  DEFAULT_ROUTE_TITLE,
  GUIDE_PROMPTS,
  ROUTE_CANDIDATES,
} from './guide-content.ts';
import { progressFromSnapshot, takenUpWaypointIds } from './guide-progress.ts';
import { sendableOf } from './guide-types.ts';

/** The record the guide keeps for one turn's words. Display only. */
export interface TurnSpeech {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
}

export interface UseGuideOptions {
  /** Injected by tests; the app uses the provider's runtime. */
  readonly runtime?: AiRuntime | undefined;
  /** Forks declared elsewhere. The guide can neither open nor close one. */
  readonly declaredBranches?: readonly DeclaredBranch[] | undefined;
  /** Injected by tests; the app reads the same wall clock every event uses. */
  readonly now?: (() => string) | undefined;
}

export interface UseGuideResult {
  readonly conversation: GuideConversation;
  /**
   * The estimate as the exchange currently stands.
   *
   * Its `at` is the moment of the most recent answer, not the moment of the
   * render — an estimate stamped "now" on every repaint would be claiming to
   * have been formed at a time nothing happened, and the whole point of the
   * timestamp is that a learner can see *when* the guide came to think this.
   * Empty string before there is anything to time; the panel renders that case
   * as "nothing yet" rather than printing it.
   */
  readonly estimate: GuideEstimate;
  readonly speechByTurn: Readonly<Record<string, TurnSpeech>>;
  readonly ledger: GuideLedger;
  readonly route: GuideRouteRecord | null;
  readonly position: GuidePosition | null;
  readonly progress: readonly WaypointProgress[];
  readonly asking: string | null;
  readonly failure: string | null;
  /** Ask the guide for its words about one turn. One press, one request. */
  readonly ask: (turnId: string) => void;
  readonly answer: (turnId: string, stance: LearnerStance) => void;
  /** Write the route and the plan from the exchange so far. */
  readonly propose: () => void;
  readonly removeWaypoint: (waypointId: string) => void;
  readonly moveWaypoint: (waypointId: string, delta: -1 | 1) => void;
  readonly renameRoute: (title: string) => void;
  readonly removePlanStep: (stepId: string) => void;
}

export function useGuide(options: UseGuideOptions = {}): UseGuideResult {
  const ambientRuntime = useAiRuntime();
  const runtime = options.runtime ?? ambientRuntime;
  const snapshot = useAppSnapshot();
  const now = useMemo(() => options.now ?? createSystemClock().now, [options.now]);

  const [conversation, setConversation] = useState<GuideConversation>(() =>
    openConversation(GUIDE_PROMPTS.map(sendableOf)),
  );
  const [speechByTurn, setSpeech] = useState<Record<string, TurnSpeech>>({});
  const [ledger, setLedger] = useState<GuideLedger>(EMPTY_GUIDE_LEDGER);
  const [asking, setAsking] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  /**
   * Record ids for this session.
   *
   * A counter rather than the kernel's id generator: these are not events, they
   * never reach the log, and reaching for the event id source would put the
   * guide one import away from the thing it must not touch.
   */
  const nextRecordId = useRef(0);
  const mintId = useCallback((prefix: string): string => {
    nextRecordId.current += 1;
    return `${prefix}-${String(nextRecordId.current).padStart(3, '0')}`;
  }, []);

  const active = useRef(true);
  const abort = useRef<(() => void) | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      abort.current?.();
    };
  }, []);

  const ask = useCallback(
    (turnId: string) => {
      if (asking !== null) return;
      const prompt = GUIDE_PROMPTS.find((entry) => entry.turnId === turnId);
      if (prompt === undefined) return;

      setAsking(turnId);
      setFailure(null);
      const controller = new AbortController();
      abort.current = () => controller.abort();

      void runtime
        .requestCandidate({
          context: {
            contentClass: 'seeded-fixture',
            targetForm: prompt.targetForm,
            excerpt: prompt.excerpt,
            seedRef: prompt.seedRef,
          },
          signal: controller.signal,
        })
        .then((outcome) => {
          if (!active.current) return;
          const { envelope } = outcome;
          setSpeech((was) => ({
            ...was,
            [turnId]: {
              text: envelope.payload.explanation,
              provider: envelope.provider,
              model: envelope.model,
            },
          }));
          setConversation((was) =>
            withGuideText(was, turnId, envelope.payload.explanation, envelope.provider),
          );
        })
        .catch((error: unknown) => {
          // The runtime resolves for every runtime condition, so reaching here
          // means this build could not form a request at all — a caller bug.
          if (!active.current) return;
          setFailure(
            error instanceof Error ? error.message : 'The guide could not be asked about this.',
          );
        })
        .finally(() => {
          if (active.current) setAsking(null);
          abort.current = null;
        });
    },
    [asking, runtime],
  );

  const answer = useCallback(
    (turnId: string, stance: LearnerStance) => {
      setConversation((was) => answerTurn(was, turnId, stance, now()));
    },
    [now],
  );

  /**
   * The estimate, stamped with the last thing that actually happened.
   *
   * Recomputed when the conversation changes and not otherwise, so the same
   * exchange renders the same estimate — including its time — however many
   * times React repaints it.
   */
  const estimate = useMemo(() => {
    const lastAnswerAt =
      [...conversation.turns].reverse().find((turn) => turn.answeredAt !== null)?.answeredAt ?? '';
    return formEstimate(conversation, lastAnswerAt);
  }, [conversation]);

  const propose = useCallback(() => {
    const at = now();
    const proposalEstimate = formEstimate(conversation, at);
    const answeredTurnIds = conversation.turns
      .filter((turn) => turn.answer !== null)
      .map((turn) => turn.turnId);

    // Whether the guide's words came live or from the app's own fixtures is a
    // fact about the exchange the record has to carry: a route that said "from
    // a live model" about a fixture-served conversation would be the exact
    // misrepresentation `@bunki/ai` labels every candidate to prevent.
    const providers = new Set(
      conversation.turns
        .map((turn) => turn.guideTextProvider)
        .filter((provider): provider is string => provider !== null),
    );
    const anyLive = [...providers].some((provider) => provider !== 'offline-fallback');
    const provenance = {
      author: anyLive ? ('guide_ai' as const) : ('guide_offline_fixture' as const),
      at,
      basisTurnIds: answeredTurnIds,
      provider: providers.size === 1 ? ([...providers][0] ?? null) : null,
      model: null,
    };

    const route = proposeRoute({
      estimate: proposalEstimate,
      candidates: ROUTE_CANDIDATES,
      recordId: mintId('route'),
      title: DEFAULT_ROUTE_TITLE,
      provenance,
    });
    const plan = proposePlan({
      route,
      recordId: mintId('plan'),
      title: DEFAULT_PLAN_TITLE,
      provenance,
      alreadyTakenUp: takenUpWaypointIds(progressFromSnapshot(snapshot, ROUTE_CANDIDATES)),
    });

    setLedger((was) => recordPlan(recordRoute(was, route), plan));
  }, [conversation, mintId, now, snapshot]);

  const editRoute = useCallback(
    (edit: (record: GuideRouteRecord, recordId: string, at: string) => GuideRouteRecord) => {
      setLedger((was) => {
        const record = currentRoute(was);
        if (record === null) return was;
        const at = now();
        const next = edit(record, mintId('route'), at);
        return next === record ? was : recordRoute(was, next);
      });
    },
    [mintId, now],
  );

  const removeWaypoint = useCallback(
    (waypointId: string) => {
      editRoute((record, recordId, at) =>
        withoutWaypoint(
          record,
          waypointId,
          recordId,
          guideProvenance({ author: 'learner_edit', at }),
        ),
      );
    },
    [editRoute],
  );

  const moveWaypoint = useCallback(
    (waypointId: string, delta: -1 | 1) => {
      editRoute((record, recordId, at) =>
        withWaypointMoved(
          record,
          waypointId,
          delta,
          recordId,
          guideProvenance({ author: 'learner_edit', at }),
        ),
      );
    },
    [editRoute],
  );

  const renameRoute = useCallback(
    (title: string) => {
      editRoute((record, recordId, at) =>
        withRouteTitle(record, title, recordId, guideProvenance({ author: 'learner_edit', at })),
      );
    },
    [editRoute],
  );

  const removePlanStep = useCallback(
    (stepId: string) => {
      setLedger((was) => {
        const record = currentPlan(was);
        if (record === null) return was;
        const next = withoutPlanStep(
          record,
          stepId,
          mintId('plan'),
          guideProvenance({ author: 'learner_edit', at: now() }),
        );
        return next === record ? was : recordPlan(was, next);
      });
    },
    [mintId, now],
  );

  const route = currentRoute(ledger);
  const progress = useMemo(() => progressFromSnapshot(snapshot, ROUTE_CANDIDATES), [snapshot]);
  const position = useMemo(
    () =>
      route === null ? null : guidePositionOn(route, progress, options.declaredBranches ?? []),
    [route, progress, options.declaredBranches],
  );

  return {
    conversation,
    estimate,
    speechByTurn,
    ledger,
    route,
    position,
    progress,
    asking,
    failure,
    ask,
    answer,
    propose,
    removeWaypoint,
    moveWaypoint,
    renameRoute,
    removePlanStep,
  };
}
