/**
 * Memory state for one node, as five independent lenses (Campaign E / B3).
 *
 * ## What this module is
 *
 * A **reader**. `@bunki/domain`'s `src/graph/` owns the projection; this turns
 * one of its `LensProjection`s into the props the design vocabulary's
 * `RecallMeter` takes. It holds no arithmetic about memory, calls nothing that
 * grades, and cannot write: the only functions it invokes are the projection's
 * own, and every one of them takes state and an instant and returns a
 * description. Opening a word page is not a review (REQ-DM-07, T-08), and there
 * is nothing here that could make it one.
 *
 * ## Why there are five meters and no summary
 *
 * REQ-UI-07 forbids collapsing reading/meaning/listening/production/writing into
 * one light and REQ-LM-03 forbids a global scalar. {@link lensViewsFor} returns
 * all five, always, in the requirement's own order, and there is no function in
 * this file that reduces them to one value — not a maximum, not a mean, not a
 * "best lens". A word page shows five meters or it shows none.
 *
 * ## The band policy, stated because it is a policy
 *
 * The five-step band is a *display* vocabulary (`src/theme/color.ts`), and
 * something has to decide which step one lens is on. That decision is here, it
 * is one function, and {@link BAND_RULE} is the sentence the surface prints so a
 * learner can check the mapping rather than trust it:
 *
 *   - nothing observed, or a contract with no graded retrieval yet → the
 *     no-evidence step. "Not measured" is not "weak";
 *   - observed, and the projection's own fragility predicate says fragile →
 *     the faint step;
 *   - otherwise the step follows the projection's uncertainty band, which
 *     counts admitted reviews and nothing else ({@link UNCERTAINTY_RULE}).
 *
 * What it deliberately does **not** do is turn the projection's real-valued
 * recall estimate into a step of its own. That number is the scheduler's, it
 * moves continuously, and a band drawn from it would read as a percentage the
 * moment two of them appeared side by side — which is the aggregate REQ-LM-03
 * forbids. Fragility already carries the scheduler's own verdict about that
 * number, and it carries it as a verdict rather than as a figure.
 */

import {
  CAPABILITY_LENSES,
  UNCERTAINTY_RULE,
  WRITING_LENS_DISCLOSURE,
  buildRetrievabilityIndex,
  componentIdForTargetKey,
  isFragile,
  isUnknown,
  isUntested,
  projectNodeRetrievability,
  RETRIEVAL_SKILLS,
  type CapabilityLens,
  type ContractRecord,
  type IsoInstant,
  type LensProjection,
  type RetrievalSkill,
} from '@bunki/domain';

import { CAPABILITY_IDS, type CapabilityId } from '../capability.ts';
import { RECALL_BANDS, type RecallBand } from '../theme.ts';

export { UNCERTAINTY_RULE, WRITING_LENS_DISCLOSURE };

/**
 * The band names, taken from the ramp rather than typed.
 *
 * The two faintest steps may only be drawn inside `RecallMeter`, and
 * `test/theme-tokens.test.ts` enforces that by scanning every file outside
 * `recall.tsx` for their literal names. Destructuring the ordered tuple gives
 * this module the values without writing them down — the same move the design
 * specimen makes for the same reason.
 */
const [NO_EVIDENCE_BAND, FADING_BAND, EMERGING_BAND, SETTLED_BAND, DURABLE_BAND] = RECALL_BANDS;

export const BAND_RULE =
  'A band is a summary of the evidence, not a probability. No graded retrieval yet is “no evidence”; a lens the projection calls fragile is the faint step; otherwise the step follows how many reviews have been admitted. Nothing here is averaged across lenses, and there is no band for the word as a whole.';

/** What the page says about a lens nothing has ever been observed for. */
export const NOT_MEASURED_NOTE =
  'Not measured. This is the absence of evidence, not a weak result — nothing has been asked of you on this capability yet.';

/**
 * The two vocabularies are the same five names in the same order, and this is
 * where that is required rather than assumed.
 *
 * `CAPABILITY_IDS` is the design system's list and `CAPABILITY_LENSES` is the
 * kernel's; they are declared in different packages for good reasons (the UI one
 * carries labels and blurbs, the kernel one carries the skill mapping). A
 * mismatch would put a meter's label on another lens's evidence, so it throws
 * here and `test/word-depth.test.ts` asserts the lists agree.
 */
function capabilityIdOf(lens: CapabilityLens): CapabilityId {
  const found = CAPABILITY_IDS.find((candidate) => candidate === lens);
  if (found === undefined) {
    throw new Error(`the kernel lens '${lens}' has no capability of the same name in the UI list`);
  }
  return found;
}

/**
 * The five lenses in the requirement's own order, as UI capability ids.
 *
 * Derived from the kernel's list rather than from the UI's, so the order a page
 * renders in is the order REQ-UI-07 names and cannot drift from the mapping
 * above.
 */
export const LENS_ORDER: readonly CapabilityId[] = CAPABILITY_LENSES.map(capabilityIdOf);

/** One lens, ready to hand to `RecallMeter`. */
export interface LensView {
  readonly capability: CapabilityId;
  readonly band: RecallBand;
  readonly fragile: boolean;
  /** One line saying where the band came from. Never omitted. */
  readonly basis: string;
  /** Whether anything at all has been observed for this lens. */
  readonly measured: boolean;
}

function bandOf(lens: LensProjection): RecallBand {
  if (isUnknown(lens) || isUntested(lens)) return NO_EVIDENCE_BAND;
  if (isFragile(lens)) return FADING_BAND;
  if (lens.uncertainty === 'narrow') return DURABLE_BAND;
  if (lens.uncertainty === 'moderate') return SETTLED_BAND;
  return EMERGING_BAND;
}

/** What is due, in a learner's words. */
function dueNote(lens: LensProjection): string {
  if (lens.dueState === 'due') return 'Due for review now.';
  if (lens.dueState === 'not_due') return 'Not due yet.';
  return 'No review planned for this capability yet.';
}

function basisOf(lens: LensProjection): string {
  if (isUnknown(lens)) {
    return lens.lens === 'writing' ? WRITING_LENS_DISCLOSURE : NOT_MEASURED_NOTE;
  }
  if (isUntested(lens)) {
    return `Taken up for study, and nothing has been asked of you yet — ${String(lens.contractCount)} contract(s), no graded retrieval. ${dueNote(lens)}`;
  }
  const reviews = `${String(lens.admittedReviewCount)} review(s) admitted`;
  const lapses = lens.lapses === 0 ? 'no lapses' : `${String(lens.lapses)} lapse(s)`;
  return `${reviews}, ${lapses}; evidence coverage ${lens.coverage}, uncertainty ${lens.uncertainty}. ${dueNote(lens)}`;
}

function viewOf(lens: LensProjection): LensView {
  return {
    capability: capabilityIdOf(lens.lens),
    band: bandOf(lens),
    fragile: isFragile(lens),
    basis: basisOf(lens),
    measured: !isUnknown(lens),
  };
}

/**
 * Canonical component ids for a written form.
 *
 * A Phase-0 KnowledgeComponent is identified by the exact text the learner
 * captured (`kc:<target>`), so a word page's node is the headword and a kanji
 * row's node is that one character. Passing the extra captured targets a thread
 * recorded lets a word the learner met inside a longer selection still find its
 * own evidence.
 */
export function componentIdsFor(targets: readonly string[]): readonly string[] {
  return [...new Set(targets.filter((target) => target !== ''))].map(componentIdForTargetKey);
}

/**
 * Exactly what the projection's own index builder accepts, second argument.
 *
 * Spelled as a lookup on the kernel's function rather than by naming the type,
 * so this module can hand the derived state's records straight through without
 * ever holding an opinion about their shape — and so a kernel change to that
 * shape is a compile error here rather than a silent mismatch. The records
 * themselves are never read in this file; they are carried.
 */
type ProjectableStates = Parameters<typeof buildRetrievabilityIndex>[1];

export interface MemoryReadInput {
  /** From `AppStore.readDerived()`. Never rebuilt here. */
  readonly contracts: readonly ContractRecord[];
  /** From the same derived state, passed through untouched. */
  readonly memoryStates: ProjectableStates;
  /** When the page drew. Supplied by the caller; this module reads no clock. */
  readonly at: IsoInstant;
}

const isRetrievalSkill = (skill: string): skill is RetrievalSkill =>
  (RETRIEVAL_SKILLS as readonly string[]).includes(skill);

/**
 * A reader over one page's evidence, with the index built once.
 *
 * The word page asks this question for the word and again for every character
 * in it. Building the (component, skill) bucketing inside each of those calls
 * would make one page cost a rebuild per row — the same shape as the defect
 * lane A2 measured and fixed in its own timeline, where the invariant half of
 * the index was being rebuilt per frame. It is a function of the contract set,
 * the contract set does not change between rows, so it is built here and shared.
 */
export interface WordMemoryReader {
  /**
   * The five lens views for one node.
   *
   * Always five, always in `CAPABILITY_LENSES` order, whatever the evidence — a
   * surface that rendered only the measured ones would quietly turn "we have
   * never asked you to produce this word" into "there is nothing to say about
   * production", which is the distinction the whole evidence model exists to
   * keep.
   */
  readonly lensViewsFor: (componentIds: readonly string[]) => readonly LensView[];
  /** One named lens, for a compact row that shows a single meter. */
  readonly lensViewFor: (componentIds: readonly string[], capability: CapabilityId) => LensView;
  /** How many contracts this page's evidence was read from. Inspectable, not a score. */
  readonly contractCount: number;
}

export function readWordMemory(input: MemoryReadInput): WordMemoryReader {
  /*
    Contracts whose skill this kernel version knows, narrowed one at a time.

    A contract naming a skill outside `RETRIEVAL_SKILLS` cannot be projected
    onto a lens, and dropping it here is the honest handling: the lens it would
    have belonged to reads "not measured", which is true, rather than being
    silently widened to include evidence nobody can place.
  */
  const projectable: {
    readonly contractId: string;
    readonly targetComponentId: string;
    readonly skill: RetrievalSkill;
  }[] = [];
  for (const contract of input.contracts) {
    const skill = contract.skill;
    if (!isRetrievalSkill(skill)) continue;
    projectable.push({
      contractId: contract.contractId,
      targetComponentId: contract.targetComponentId,
      skill,
    });
  }

  const index = buildRetrievabilityIndex(projectable, input.memoryStates);

  const lensViewsFor = (componentIds: readonly string[]): readonly LensView[] =>
    projectNodeRetrievability(
      index,
      { id: componentIds[0] ?? '', componentIds },
      input.at,
    ).lenses.map(viewOf);

  return {
    lensViewsFor,
    lensViewFor: (componentIds, capability) => {
      const found = lensViewsFor(componentIds).find((view) => view.capability === capability);
      if (found === undefined) throw new Error(`no lens view for '${capability}'`);
      return found;
    },
    contractCount: projectable.length,
  };
}

/**
 * True when nothing has been observed on any lens for this node.
 *
 * A presence test, not a rollup: it answers "is there any evidence here at
 * all", which is what decides whether the page says "nothing observed yet"
 * instead of printing five identical empty meters. It says nothing about how
 * well anything is known, and there is deliberately no counterpart that
 * combines the measured ones.
 */
export function nothingMeasured(views: readonly LensView[]): boolean {
  return views.every((view) => !view.measured);
}
