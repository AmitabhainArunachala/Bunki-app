/**
 * The 案内人's hard boundary (Campaign E / B6; map document §4.3,
 * REQ-ARCH-04, REQ-SCH-03).
 *
 * The design document states the division of labour as a table and then says
 * the thing that matters most about it:
 *
 * > This is the division of labour, and it is a **hard boundary**, not a style
 * > preference. […] A branch point is **caused by the data**. The guide
 * > _narrates and routes_; it does not decide.
 *
 * A comment cannot hold that line. Three mechanisms do, and they fail
 * separately on purpose:
 *
 * 1. **A marker every guide artefact carries.** Everything this module
 *    produces has a `guideArtefact` field whose value is a member of
 *    {@link GUIDE_ARTEFACT_KINDS}. It is a plain string, so it survives a JSON
 *    boundary — which is where a class or a brand stops being a guarantee, and
 *    is exactly why `assertNotCandidate` in the evidence gate checks shape
 *    rather than identity. {@link assertNotGuideArtefact} is the runtime guard
 *    built on it.
 * 2. **A wiring scan.** `packages/domain/test/guide/boundary.test.ts` walks the
 *    transitive import graph of every module on the evidence path and every
 *    module on the review-timing path, and fails if any of them can reach this
 *    directory or the app's guide surface. It also walks this directory's own
 *    graph and fails if the guide can reach the evidence gate, the evidence
 *    minter, the memory-state reducer, or `ts-fsrs`. That test carries a
 *    self-check so the predicate cannot be quietly loosened into one that
 *    passes on any input.
 * 3. **A one-verb action vocabulary.** {@link GUIDE_ACTION_KINDS} has exactly
 *    one member and it is `look_at`. The guide's entire repertoire of things it
 *    can ask the app to *do* is "go and look at this". There is no member that
 *    grades, no member that marks, and no member that changes when anything is
 *    next asked. Adding one is a visible edit to a frozen tuple that a test
 *    asserts by equality.
 *
 * ## What this module does not claim
 *
 * `assertNotGuideArtefact` is **not** called by the evidence gate. The gate
 * lives in `packages/domain/src/evidence/`, which is outside this lane's write
 * surface, so wiring it there is filed as a coordination request in the build
 * capsule with the exact diff rather than done here — the same route WP-07 took
 * for `assertNotCandidate`. The guard is exercised by this lane's own tests and
 * is used at the one place in the app where a guide value could plausibly be
 * handed onward. The property that holds *today* without any cooperation from
 * another lane is mechanism 2: nothing on the evidence or review-timing path can
 * even name a guide value.
 */

import type { CapabilityLens } from '../graph/lenses.ts';

/**
 * Every kind of thing the guide produces.
 *
 * A closed tuple rather than an open string so that a new guide output cannot
 * appear without a name — and so the boundary test can assert that every
 * exported constructor in this directory stamps one of these.
 */
export const GUIDE_ARTEFACT_KINDS = [
  'guide_turn',
  'guide_estimate',
  'guide_route',
  'guide_plan',
  'guide_position',
] as const;

export type GuideArtefactKind = (typeof GUIDE_ARTEFACT_KINDS)[number];

/** The marker every guide value carries. */
export interface GuideArtefact {
  readonly guideArtefact: GuideArtefactKind;
}

/** Thrown when a guide artefact is offered somewhere it may never go. */
export class GuideAuthorityBoundaryError extends Error {
  readonly marker: string;

  constructor(marker: string) {
    super(
      `a guide artefact (${marker}) was offered to a path that decides memory state or review timing; ` +
        'the guide narrates and routes and never decides (map document §4.3, REQ-ARCH-04)',
    );
    this.name = 'GuideAuthorityBoundaryError';
    this.marker = marker;
  }
}

const ARTEFACT_KIND_SET: ReadonlySet<string> = new Set(GUIDE_ARTEFACT_KINDS);

/**
 * Runtime half of the boundary.
 *
 * Shallow on the value itself and one level into a `payload`/`record` wrapper,
 * because the realistic mistake is not a deeply buried artefact — it is someone
 * passing the route record, or an object holding it, straight into a command.
 *
 * @throws GuideAuthorityBoundaryError when `value` carries a guide marker.
 */
export function assertNotGuideArtefact(value: unknown): void {
  if (typeof value !== 'object' || value === null) return;

  const inspect = (candidate: unknown, path: string): void => {
    if (typeof candidate !== 'object' || candidate === null) return;
    const marker = (candidate as Record<string, unknown>)['guideArtefact'];
    if (typeof marker === 'string' && ARTEFACT_KIND_SET.has(marker)) {
      throw new GuideAuthorityBoundaryError(path === '' ? marker : `${path}=${marker}`);
    }
  };

  inspect(value, '');
  const record = value as Record<string, unknown>;
  for (const wrapper of ['payload', 'record', 'route', 'plan', 'estimate', 'position']) {
    inspect(record[wrapper], wrapper);
  }
  for (const member of Array.isArray(value) ? value : []) inspect(member, 'item');
}

// ---------------------------------------------------------------------------
// The action vocabulary
// ---------------------------------------------------------------------------

/**
 * Everything the guide is able to ask the app to do. One verb.
 *
 * This is the boundary expressed as a type rather than as a rule. A surface
 * driven by this union cannot grade, cannot mark, cannot promote and cannot
 * change when anything is next asked, because there is no member that means any
 * of those things and the union is closed.
 */
export const GUIDE_ACTION_KINDS = ['look_at'] as const;

export type GuideActionKind = (typeof GUIDE_ACTION_KINDS)[number];

export interface GuideAction {
  readonly kind: GuideActionKind;
  /** The written form to go and look at. */
  readonly targetForm: string;
  /** Why the guide is pointing there, in one line. Never a claim about recall. */
  readonly why: string;
  /** The lens the invitation is about, so no invitation is capability-free. */
  readonly lens: CapabilityLens;
}

// ---------------------------------------------------------------------------
// The division of labour, as data
// ---------------------------------------------------------------------------

/**
 * Map document §4.3's table, kept as data so a surface renders the same words
 * the code is written against.
 *
 * Both halves are here, including the guide's *never* column, because a screen
 * that only listed what the guide does would be describing a chatbot.
 */
export const GUIDE_AUTHORITY = Object.freeze({
  guideDecides: Object.freeze([
    'which road to walk, over months',
    'which few stations come next, over days',
    'how a fork is framed and explained',
    'what to talk about next',
  ]),
  guideNeverDoes: Object.freeze([
    'mint evidence',
    'write a memory state',
    'mark anything known',
    'override the scheduler',
    'decide that a fork exists',
  ]),
  srsDecides: Object.freeze([
    'when a contract is due',
    'when a contract is fragile',
    'when a stumble becomes a 分岐',
  ]),
  srsNeverDoes: Object.freeze(['speak', 'motivate', 'explain']),
});

/** The rule in one sentence, for a surface that has room for exactly one. */
export const GUIDE_BOUNDARY_RULE =
  'The guide proposes a road and explains a fork. It never records what you know, never changes when anything comes back, and never decides that a fork exists — a fork is declared by the evidence gate and the review timing, from what actually happened.';

/**
 * What a guide record is, said in the words a learner reads.
 *
 * Paired with `standing: 'proposal'` on {@link import('./records.ts').GuideProvenance},
 * which is a literal type: a guide record cannot be constructed with any other
 * standing, so the sentence below cannot become false while the data stays the
 * same shape.
 */
export const GUIDE_RECORD_STANDING_NOTE =
  'A proposal, with a time on it. It records what the guide suggested and when — not what you know, and not what the app has measured.';
