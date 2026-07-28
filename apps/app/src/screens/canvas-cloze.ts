/**
 * The cloze presentation — one blank, one attempt (WP-08 repair round;
 * REQ-SCH-06, REQ-UI-05, DL-19).
 *
 * ## The defect this file closes
 *
 * `canvas-screen.tsx` used to build its interactions inline, and on the two
 * paths that can declare a probe it wrote `targetWasHidden: true` as a *literal*
 * while holding the real answer in its own state. The four grade buttons carried
 * no `disabled` prop, so they stayed live after the blank was settled and the
 * word was printed in the passage. Pressing Good a second time therefore
 * submitted recognition of a form that was on screen as a declared probe, and
 * the kernel — which is correct — believed it, because the kernel is told
 * `targetWasHidden` rather than being able to see the screen.
 *
 * That is exactly the priming rule REQ-SCH-06 states ("confirmation probes are
 * deferred so a just-seen form is not 'retrieved' under priming"), defeated at
 * the one seam where the kernel has to trust the caller. Ten presses of Good on
 * one blank minted ten tier-A reviews, all admitted. It is DL-19's "relabelled
 * exposure → false mastery" arriving through the app rather than through the
 * classifier.
 *
 * ## Why it is a module and not three lines in the component
 *
 * Every app-level test of the canvas passed `targetWasHidden: true` by hand.
 * A test that supplies the field it is meant to be checking cannot fail for this
 * class of defect, and none of them did. So the screen's state machine lives
 * here, as data and pure functions, and the tests drive *it* — the same
 * transitions and the same interaction payloads the component dispatches. The
 * component's only remaining job is to render the phase and forward the events.
 *
 * ## The rule, stated once
 *
 *   - the blank is answerable **only** while it is hidden;
 *   - revealing it and answering it both settle it, permanently, for that
 *     presentation;
 *   - `targetWasHidden` is read from the phase, never asserted;
 *   - a settled blank disables the reveal and the four grades, so the "second
 *     press" has no button. If one ever reappeared, the honest
 *     `targetWasHidden: false` makes the kernel classify it `exposure` /
 *     `target_was_already_visible` — belt and braces, and the braces are tested.
 */

import type {
  CanvasInteraction,
  ComponentId,
  ContractId,
  ExperienceId,
  Grade,
  IsoInstant,
} from '@bunki/domain';

import { elapsedMs } from './session-timing.ts';

/**
 * Where one blank is in its life.
 *
 * `revealed` and `answered` are both settled states and are distinguished only
 * so the ledger strip and the accessibility label can say which happened.
 */
export type ClozePhase = 'hidden' | 'revealed' | 'answered';

export interface ClozePresentation {
  readonly phase: ClozePhase;
  /** When this blank became answerable, from the injected clock. */
  readonly presentedAt: IsoInstant;
}

/** The identifiers one blank needs to name itself to the kernel. */
export interface ClozeTarget {
  readonly experienceId: ExperienceId;
  readonly componentId: ComponentId;
  readonly probeContractId: ContractId;
}

/** A fresh, hidden blank, marked with the instant it went on screen. */
export function presentCloze(at: IsoInstant): ClozePresentation {
  return { phase: 'hidden', presentedAt: at };
}

/**
 * Is the written form off screen right now?
 *
 * The single source of truth for the cloze mask, the accessibility label, the
 * `disabled` props, and the `targetWasHidden` the kernel is told. One reader for
 * all four is the point: they cannot disagree.
 */
export function targetIsHidden(presentation: ClozePresentation): boolean {
  return presentation.phase === 'hidden';
}

/** May this presentation still produce a declared probe? */
export function canAttempt(presentation: ClozePresentation): boolean {
  return presentation.phase === 'hidden';
}

/** One transition: what to send to the kernel, and the phase it leaves behind. */
export interface ClozeStep {
  readonly interaction: CanvasInteraction;
  readonly next: ClozePresentation;
}

/**
 * Reveal the blank without answering it.
 *
 * A complete observation on its own — the learner asked for the answer without
 * producing one — so the kernel mints a probe from it and the reveal rule grades
 * it `again`. It settles the presentation for that reason: a second graded press
 * afterwards would be a second tier-A observation of one attempt.
 *
 * The attempt is stated rather than left to the kernel's default, for the same
 * reason the answer path states one: giving up *took* time, and the interval
 * between the blank appearing and the reveal is a real measurement. The default
 * would have carried `latencyMs: 0` — accurate as "nothing was recorded", but
 * indistinguishable from a fabricated zero once it is in the ledger. The grade
 * is `again` because that is the only thing a reveal can honestly say, and the
 * mint forces it there anyway from `revealedBeforeRecall` (T-06).
 */
export function revealCloze(
  presentation: ClozePresentation,
  target: ClozeTarget,
  at: IsoInstant,
): ClozeStep {
  return {
    interaction: {
      experienceId: target.experienceId,
      kind: 'reveal',
      componentIds: [target.componentId],
      declaredContractId: target.probeContractId,
      targetWasHidden: targetIsHidden(presentation),
      attempt: {
        grade: 'again',
        latencyMs: elapsedMs(presentation.presentedAt, at),
        hintsUsed: 0,
        revealedBeforeRecall: true,
      },
    },
    next: { phase: 'revealed', presentedAt: presentation.presentedAt },
  };
}

export interface ClozeAnswer {
  readonly grade: Grade;
  /** Read from the injected clock at the moment the grade was pressed. */
  readonly at: IsoInstant;
}

/**
 * Answer the blank.
 *
 * `latencyMs` is the measured gap between the blank going on screen and this
 * press, both read from the injected clock (see `session-timing.ts`).
 *
 * `revealedBeforeRecall` is *derived* from the phase rather than asserted. Under
 * the one-attempt rule a revealed blank cannot be graded at all, so it is
 * always `false` today — but it is computed, so a future change that re-opened
 * grading after a reveal would report the truth instead of inheriting a literal
 * that used to be true.
 */
export function answerCloze(
  presentation: ClozePresentation,
  target: ClozeTarget,
  answer: ClozeAnswer,
): ClozeStep {
  return {
    interaction: {
      experienceId: target.experienceId,
      kind: 'cloze_attempt',
      componentIds: [target.componentId],
      declaredContractId: target.probeContractId,
      targetWasHidden: targetIsHidden(presentation),
      attempt: {
        grade: answer.grade,
        latencyMs: elapsedMs(presentation.presentedAt, answer.at),
        hintsUsed: 0,
        revealedBeforeRecall: presentation.phase === 'revealed',
        ...(answer.grade === 'easy' ? { userConfirmedEasy: true as const } : {}),
      },
    },
    next: { phase: 'answered', presentedAt: presentation.presentedAt },
  };
}

/**
 * A tap or a read-through: exposure over whatever was touched.
 *
 * It declares no contract, so it has no probe path at all — but it still reports
 * the blank's real visibility, because the ledger entry and the inspector show
 * what the page looked like when it happened.
 */
export function exposeOnCanvas(
  presentation: ClozePresentation,
  experienceId: ExperienceId,
  kind: 'tap' | 'read',
  componentIds: readonly ComponentId[],
): CanvasInteraction {
  return {
    experienceId,
    kind,
    componentIds: [...componentIds],
    declaredContractId: null,
    targetWasHidden: targetIsHidden(presentation),
  };
}
