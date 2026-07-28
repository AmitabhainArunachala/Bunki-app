/**
 * Assessment as conversation (Campaign E / B6; map document §4.2).
 *
 * > No level quiz. The guide talks; from the conversation it forms an estimate
 * > of where the learner actually is.
 *
 * ## What "conversation, not a placement test" means in code
 *
 * A placement test has items with right answers, a total, and a verdict. None
 * of the three exists here, and their absence is checkable:
 *
 *   - **No item has a right answer.** A turn holds a seeded word, a seeded
 *     excerpt, and the guide's words about it. There is no answer key on the
 *     type, so nothing can be marked correct.
 *   - **There is no total.** {@link GuideEstimate} has no numeric field at all.
 *     `answeredCount` and `skippedCount` count *turns*, not points, and a test
 *     asserts no field of the estimate is a score.
 *   - **There is no verdict.** The estimate names which lenses the learner's
 *     own answers pointed at. It never says how good they are at one, and it
 *     never names a level (REQ-LM-03, REQ-GATE-03).
 *
 * ## Why the learner's answers are a closed set
 *
 * OD-08's Phase-0 default is that **only seeded fixture content may leave the
 * device**. A conversation that took free text and sent it to a provider would
 * break that on its first turn. So the learner's side of the exchange is a
 * closed vocabulary of stances — chosen, not typed — and the only text that
 * ever crosses the boundary is the seeded form and the seeded excerpt the guide
 * raised. That is a real constraint honestly met, not a shortcut: the exchange
 * is still a conversation, in that each turn is about something particular and
 * the learner decides what to say about it, and it is still not a test, because
 * no stance is better than another and `rather_not_say` is a first-class answer.
 *
 * ## And what the estimate is *not*
 *
 * It is not evidence, it is not a memory state, and it does not reach the
 * scheduler. It carries the `guide_estimate` marker precisely so a value that
 * escaped into a command can be recognised — see `boundary.ts`.
 */

import { CAPABILITY_LENSES, type CapabilityLens } from '../graph/lenses.ts';
import type { IsoInstant } from '../primitives.ts';
import type { GuideArtefact } from './boundary.ts';

// ---------------------------------------------------------------------------
// Turns
// ---------------------------------------------------------------------------

/**
 * What the guide raises in one turn.
 *
 * Exactly the shape `@bunki/ai`'s thread context takes, and deliberately so:
 * the guide may only talk about something the content policy already permits,
 * and duplicating the field set here would be an invitation to add a field the
 * policy does not check.
 */
export interface GuidePrompt {
  readonly targetForm: string;
  readonly excerpt: string;
  readonly seedRef: string;
}

/**
 * The closed set of things a learner can say back.
 *
 * Six stances, none of them a grade. `rather_not_say` exists because a
 * conversation a learner cannot decline is an interrogation, and because a
 * declined turn is a genuinely different fact from an answered one — the
 * estimate counts them separately rather than treating silence as a "no".
 */
export const LEARNER_STANCES = [
  'read_it_without_help',
  'knew_the_form_not_the_reading',
  'knew_the_reading_not_the_sense',
  'met_it_but_it_slipped',
  'new_to_me',
  'rather_not_say',
] as const;

export type LearnerStance = (typeof LEARNER_STANCES)[number];

/** What each stance says, in the learner's own voice. Rendered on the chips. */
export const LEARNER_STANCE_LABELS: Readonly<Record<LearnerStance, string>> = Object.freeze({
  read_it_without_help: 'I read that without help',
  knew_the_form_not_the_reading: 'I knew the shape, not how to say it',
  knew_the_reading_not_the_sense: 'I could say it, not what it means',
  met_it_but_it_slipped: 'I have met it, and it slipped',
  new_to_me: 'That one is new to me',
  rather_not_say: 'I would rather not say',
});

export interface GuideTurn extends GuideArtefact {
  readonly guideArtefact: 'guide_turn';
  readonly turnId: string;
  readonly prompt: GuidePrompt;
  /**
   * The guide's words for this turn — generated text, or `null` before it has
   * arrived. Whatever is here is AI output and is labelled as such wherever it
   * renders; nothing in this module ever presents it as checked.
   */
  readonly guideText: string | null;
  /** The provider that produced `guideText`, so a fixture is never shown as live. */
  readonly guideTextProvider: string | null;
  readonly answer: LearnerStance | null;
  readonly answeredAt: IsoInstant | null;
}

export interface GuideConversation {
  readonly turns: readonly GuideTurn[];
}

export function openConversation(
  prompts: readonly (GuidePrompt & { readonly turnId: string })[],
): GuideConversation {
  return Object.freeze({
    turns: Object.freeze(
      prompts.map((prompt) =>
        Object.freeze({
          guideArtefact: 'guide_turn' as const,
          turnId: prompt.turnId,
          prompt: Object.freeze({
            targetForm: prompt.targetForm,
            excerpt: prompt.excerpt,
            seedRef: prompt.seedRef,
          }),
          guideText: null,
          guideTextProvider: null,
          answer: null,
          answeredAt: null,
        }),
      ),
    ),
  });
}

/** Attach the guide's words to a turn. Never changes an answer. */
export function withGuideText(
  conversation: GuideConversation,
  turnId: string,
  guideText: string,
  provider: string,
): GuideConversation {
  return Object.freeze({
    turns: Object.freeze(
      conversation.turns.map((turn) =>
        turn.turnId === turnId
          ? Object.freeze({ ...turn, guideText, guideTextProvider: provider })
          : turn,
      ),
    ),
  });
}

/**
 * Record what the learner said.
 *
 * Answering again replaces the previous stance, because a learner correcting
 * themselves is a correction rather than a second data point, and because
 * REQ-UI-01's mark is editable for the same reason.
 */
export function answerTurn(
  conversation: GuideConversation,
  turnId: string,
  answer: LearnerStance,
  at: IsoInstant,
): GuideConversation {
  return Object.freeze({
    turns: Object.freeze(
      conversation.turns.map((turn) =>
        turn.turnId === turnId ? Object.freeze({ ...turn, answer, answeredAt: at }) : turn,
      ),
    ),
  });
}

/** The turn the exchange is waiting on, or `null` when every turn has an answer. */
export function nextUnansweredTurn(conversation: GuideConversation): GuideTurn | null {
  return conversation.turns.find((turn) => turn.answer === null) ?? null;
}

export interface ConversationProgress {
  readonly answered: number;
  readonly total: number;
}

export function conversationProgress(conversation: GuideConversation): ConversationProgress {
  return Object.freeze({
    answered: conversation.turns.filter((turn) => turn.answer !== null).length,
    total: conversation.turns.length,
  });
}

// ---------------------------------------------------------------------------
// The estimate
// ---------------------------------------------------------------------------

/**
 * Which lens a stance points at.
 *
 * Read this table as "the learner's own words are about this part of knowing
 * the word", never as "this part is weak". `read_it_without_help` points at
 * nothing, because a turn that went well tells the guide where *not* to send
 * the learner, and turning it into a positive claim would be the guide
 * recording something about recall.
 */
const STANCE_LENSES: Readonly<Record<LearnerStance, readonly CapabilityLens[]>> = Object.freeze({
  read_it_without_help: Object.freeze([]),
  knew_the_form_not_the_reading: Object.freeze(['reading' as CapabilityLens]),
  knew_the_reading_not_the_sense: Object.freeze(['meaning' as CapabilityLens]),
  met_it_but_it_slipped: Object.freeze(['reading' as CapabilityLens, 'meaning' as CapabilityLens]),
  new_to_me: Object.freeze(['reading' as CapabilityLens, 'meaning' as CapabilityLens]),
  rather_not_say: Object.freeze([]),
});

export const ATTENTION_STATES = ['proposed_focus', 'not_proposed'] as const;
export type AttentionState = (typeof ATTENTION_STATES)[number];

/**
 * One lens, as the conversation left it.
 *
 * There is no strength here and there is no number. A lens is either one the
 * learner's own answers pointed at, or one they did not — and `basisTurnIds`
 * says which answers, so a learner can see the working.
 */
export interface LensImpression {
  readonly lens: CapabilityLens;
  readonly attention: AttentionState;
  readonly basisTurnIds: readonly string[];
  /** Why this lens is or is not proposed, in one line the surface renders. */
  readonly because: string;
}

export interface GuideEstimate extends GuideArtefact {
  readonly guideArtefact: 'guide_estimate';
  readonly at: IsoInstant;
  /** Always all five, in {@link CAPABILITY_LENSES} order. Never a rollup. */
  readonly impressions: readonly LensImpression[];
  readonly answeredCount: number;
  readonly declinedCount: number;
  readonly unansweredCount: number;
  /** A literal: this is an impression from an exchange, and nothing more. */
  readonly standing: 'conversation_impression';
  /** What this exchange could not see, stated rather than left to be inferred. */
  readonly limits: string;
}

/**
 * What the conversation structurally cannot observe.
 *
 * Listening, production and writing are never proposed from this exchange, and
 * that is a property of the exchange rather than a gap in the guide: nothing in
 * a turn plays audio, asks the learner to say anything, or asks them to write.
 * Saying so is the difference between a silent absence and an honest one.
 */
export const ESTIMATE_LIMITS =
  'This came from a short exchange about words the app already has, and from what you chose to say about them. Nothing here was measured. Listening, production and writing are never proposed from it, because nothing in the exchange listens to you, asks you to speak, or asks you to write.';

const NOT_OBSERVABLE_HERE: readonly CapabilityLens[] = Object.freeze([
  'listening' as CapabilityLens,
  'production' as CapabilityLens,
  'writing' as CapabilityLens,
]);

/**
 * Form the estimate.
 *
 * Deterministic and total: the same conversation gives the same estimate, and
 * an empty conversation gives an estimate with five `not_proposed` lenses
 * rather than an exception. A guide that could not say "I have nothing yet"
 * would have to invent something.
 */
export function formEstimate(conversation: GuideConversation, at: IsoInstant): GuideEstimate {
  const byLens = new Map<CapabilityLens, string[]>(
    CAPABILITY_LENSES.map((lens) => [lens, [] as string[]]),
  );

  let answered = 0;
  let declined = 0;
  let unanswered = 0;

  for (const turn of conversation.turns) {
    if (turn.answer === null) {
      unanswered += 1;
      continue;
    }
    if (turn.answer === 'rather_not_say') {
      declined += 1;
      continue;
    }
    answered += 1;
    for (const lens of STANCE_LENSES[turn.answer]) {
      byLens.get(lens)?.push(turn.turnId);
    }
  }

  const impressions = CAPABILITY_LENSES.map<LensImpression>((lens) => {
    const basis = byLens.get(lens) ?? [];
    if (basis.length > 0) {
      return Object.freeze({
        lens,
        attention: 'proposed_focus' as AttentionState,
        basisTurnIds: Object.freeze([...basis]),
        because: `You said something about this part of knowing a word on ${basis.length} ${
          basis.length === 1 ? 'turn' : 'turns'
        }.`,
      });
    }
    return Object.freeze({
      lens,
      attention: 'not_proposed' as AttentionState,
      basisTurnIds: Object.freeze([]),
      because: NOT_OBSERVABLE_HERE.includes(lens)
        ? 'Nothing in this exchange could see this part, so the guide proposes nothing about it.'
        : 'Nothing you said in this exchange pointed here.',
    });
  });

  return Object.freeze({
    guideArtefact: 'guide_estimate' as const,
    at,
    impressions: Object.freeze(impressions),
    answeredCount: answered,
    declinedCount: declined,
    unansweredCount: unanswered,
    standing: 'conversation_impression' as const,
    limits: ESTIMATE_LIMITS,
  });
}

/** The lenses the exchange pointed at, in {@link CAPABILITY_LENSES} order. */
export function proposedLenses(estimate: GuideEstimate): readonly CapabilityLens[] {
  return Object.freeze(
    estimate.impressions
      .filter((impression) => impression.attention === 'proposed_focus')
      .map((impression) => impression.lens),
  );
}
