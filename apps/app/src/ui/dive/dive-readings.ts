/**
 * What this build can honestly say about a node, per capability (lane B2).
 *
 * ## The claim this file is careful not to make
 *
 * The design document's diagnosis — a lit surface with a dark interior — reads
 * "different scales aggregate the **same real numbers**". In a build with a
 * running scheduler those numbers are per-contract and per-capability. **This
 * build does not have them on this surface.** The app's store holds captured
 * threads, the promotion rung each is on, and the one-tap uncertainty mark; it
 * holds no per-capability strength for anything, and `test/screen-contract.test.ts`
 * keeps the app out of that vocabulary entirely.
 *
 * So the reading this file produces is derived from **what the app actually
 * records**, and every reading carries a `basis` naming it. The bands are the
 * design system's own five steps, and the mapping is deliberately coarse:
 *
 *   | what the app holds                                   | band       |
 *   | ---------------------------------------------------- | ---------- |
 *   | nothing — no thread of yours touches this node        | `unseen`   |
 *   | a thread exists, and you marked this capability unsure | `faint`    |
 *   | a thread exists and is still at capture               | `emerging` |
 *   | you took the thread up for study (`keep` and beyond)   | `settled`  |
 *
 * `durable` is never produced. Nothing this build records could support it, and
 * a top band handed out for a thread somebody kept would be exactly the
 * "low-effort recall producing the illusion of mastery" the round-2 research
 * documents. The absence is the honesty.
 *
 * ## What this is not
 *
 * It is not evidence, it does not become evidence, and nothing here writes.
 * A reading is a *display* value derived from state the evidence gate already
 * admitted; producing one is reading the store, not adding to it.
 *
 * ## Why an uncertainty mark maps to one capability and not to all five
 *
 * The mark's dimension is what the learner said was unsure — meaning, reading,
 * use, kanji, or "not sure". Applying it to every capability would turn one tap
 * into five claims. So it lowers exactly the capability it names, and
 * `not-sure` — which names none — lowers none of them.
 */

import type { ScaleNodeId, ScaleReading } from '@bunki/domain';

import type { AppSnapshot, ThreadView, UncertaintyDimension } from '../../state/store.ts';
import type { CapabilityId } from '../capability.ts';
import { RECALL_BANDS, type RecallBand } from '../theme.ts';

/** The five-step ramp the surface draws. Step 0 is the no-evidence end. */
export const READING_STEPS = RECALL_BANDS.length;

/**
 * The ramp is addressed by *position*, never by band name.
 *
 * Two of the five bands may only ever be drawn inside the meter — they fall
 * below 3:1 on purpose, so the operator's "dim items are dim" is possible — and
 * `test/theme-tokens.test.ts` enforces that by forbidding any module outside
 * `recall.tsx` and `color.ts` from naming them as string literals. Deriving them
 * from `RECALL_BANDS` by index keeps this file inside that rule and makes it
 * ramp-shaped rather than name-coupled: a ramp that grew a sixth step would need
 * no edit here.
 */
export const NO_EVIDENCE_STEP = 0;
/** A capability the learner marked unsure. The weakest *measured* step. */
export const MARKED_UNSURE_STEP = 1;
/** A thread that exists and has not been taken up. */
export const KEPT_STEP = 2;
/** A thread deliberately taken up for study. The strongest this build reaches. */
export const TAKEN_UP_STEP = 3;

export function bandStep(band: RecallBand): number {
  return RECALL_BANDS.indexOf(band);
}

export function bandAtStep(step: number): RecallBand {
  const clamped = Math.min(Math.max(step, 0), RECALL_BANDS.length - 1);
  const band = RECALL_BANDS[clamped];
  if (band === undefined) throw new Error(`step ${String(step)} is off the recall ramp`);
  return band;
}

/** Whether a band means "never measured", as distinct from "measured and weak". */
export function isUnseen(band: RecallBand): boolean {
  return bandStep(band) === NO_EVIDENCE_STEP;
}

/**
 * Which capability an uncertainty mark is about.
 *
 * `use` is production: "I do not know how to use this" is a statement about
 * reaching for it yourself. `kanji` is writing — the mark is about the
 * characters, and writing is the capability whose evidence is the form. And
 * `not-sure` maps to nothing, because a learner who could not name the dimension
 * has not told us which capability is weak and inventing one would be putting
 * words in their mouth.
 */
export const UNCERTAINTY_CAPABILITY: Readonly<Record<UncertaintyDimension, CapabilityId | null>> = {
  meaning: 'meaning',
  reading: 'reading',
  use: 'production',
  kanji: 'writing',
  'not-sure': null,
};

/**
 * The band a thread supports for one capability, and the sentence that says why.
 *
 * `uncertain` is a separate channel from the band, and it is form rather than
 * luminance on screen — a dashed open ring, per the visual language's rule that
 * fragility and uncertainty are carried by shape. It is true in exactly one
 * case, and it is a real one: the event log records `uncertaintyMark` as
 * `true | absent` and never which dimension, so after a reload the app knows a
 * mark exists and cannot say what it was about (WP05-D2). A node in that state
 * is genuinely uncertain in a way a band cannot express.
 */
export interface DerivedBand {
  readonly band: RecallBand;
  readonly basis: string;
  readonly uncertain: boolean;
}

const NO_THREAD: DerivedBand = {
  band: bandAtStep(NO_EVIDENCE_STEP),
  basis: 'No kept thread of yours reaches this yet, so there is nothing measured here.',
  uncertain: false,
};

export function bandForThread(thread: ThreadView | null, capability: CapabilityId): DerivedBand {
  if (thread === null) return NO_THREAD;

  // A mark whose dimension did not survive the reload: the log says one was
  // made and cannot say about what. Reporting it as "nothing marked" would be
  // false about a thread the learner did mark.
  const dimensionLost = thread.uncertainty === null && thread.markRecordedInLog;

  const marked =
    thread.uncertainty !== null &&
    UNCERTAINTY_CAPABILITY[thread.uncertainty.dimension] === capability;
  if (marked) {
    return {
      band: bandAtStep(MARKED_UNSURE_STEP),
      basis: `You marked ${capability} unsure on ${thread.displayText}.`,
      uncertain: false,
    };
  }

  // The promotion ladder is `captured → keep → learn → master`. Anything past
  // capture is a thread the learner deliberately took up; that is the strongest
  // thing this build knows, and it is still not a measurement of recall.
  if (thread.state.promotion === 'captured') {
    return {
      band: bandAtStep(KEPT_STEP),
      basis: dimensionLost
        ? `You kept ${thread.displayText} with a mark. Which part you marked was never stored, so it did not survive the reload.`
        : `You kept ${thread.displayText}; nothing has tested it yet.`,
      uncertain: dimensionLost,
    };
  }
  return {
    band: bandAtStep(TAKEN_UP_STEP),
    basis: dimensionLost
      ? `You took ${thread.displayText} up for study (${thread.state.promotion}) and marked it; which part was never stored.`
      : `You took ${thread.displayText} up for study (${thread.state.promotion}). This is what you did, not what a review measured.`,
    uncertain: dimensionLost,
  };
}

/** The display mark for one node, for one capability. */
export function markForNode(
  reach: ThreadReach,
  nodeId: ScaleNodeId,
  capability: CapabilityId,
): DerivedBand {
  return bandForThread(reach.byNodeId.get(nodeId) ?? null, capability);
}

/**
 * The thread that touches a node, if any.
 *
 * A thread reaches a node when it resolved to that lexeme, or when the node is a
 * character the thread's own word is written with. Both are real links the store
 * already holds — the second is what makes the diagnosis possible at all, since
 * it is the only way a word-level thread says anything about a character.
 */
export interface ThreadReach {
  /** Graph node id → the newest thread that reaches it. */
  readonly byNodeId: ReadonlyMap<ScaleNodeId, ThreadView>;
}

export function reachOfThreads(
  snapshot: AppSnapshot,
  kanjiNodeIdOf: (character: string) => ScaleNodeId,
  charactersOfLexeme: (lexemeId: string) => readonly string[],
): ThreadReach {
  const byNodeId = new Map<ScaleNodeId, ThreadView>();
  // `snapshot.threads` is newest first, so the first writer wins and the newest
  // thread is the one a node reports. Later threads about the same word do not
  // overwrite it with an older state.
  for (const thread of snapshot.threads) {
    if (thread.lexemeId === null) continue;
    if (!byNodeId.has(thread.lexemeId)) byNodeId.set(thread.lexemeId, thread);
    for (const character of charactersOfLexeme(thread.lexemeId)) {
      const id = kanjiNodeIdOf(character);
      if (!byNodeId.has(id)) byNodeId.set(id, thread);
    }
  }
  return { byNodeId };
}

/**
 * Readings for a set of nodes, for one capability.
 *
 * Bounded by the caller: it is handed the ids a view already materialised, so
 * producing readings never walks anything the dive culled.
 */
export function readingsForNodes(
  nodeIds: readonly ScaleNodeId[],
  reach: ThreadReach,
  capability: CapabilityId,
): readonly ScaleReading[] {
  return nodeIds.map((nodeId) => {
    const derived = bandForThread(reach.byNodeId.get(nodeId) ?? null, capability);
    return {
      nodeId,
      capability,
      step: bandStep(derived.band),
      steps: READING_STEPS,
      unseen: isUnseen(derived.band),
      basis: derived.basis,
    };
  });
}

/**
 * The sentence a surface prints beside the diagnosis, so nobody reads the bands
 * as a scheduler's opinion.
 *
 * Rendered, not commented: the honesty rules here are explicit that a claim the
 * code does not enforce may not appear in a doc comment *or* in a user-visible
 * string, and the converse obligation is that a limit the code does have must be
 * on the screen rather than in a file nobody opens.
 */
export const READING_STANDING = `These marks come from what this build records — the threads you kept and the one-tap marks you made — and not from a review measurement. Nothing here reaches past step ${String(TAKEN_UP_STEP + 1)} of ${String(READING_STEPS)} on the ramp, because nothing this build stores could support it.`;
