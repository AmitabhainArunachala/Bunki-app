/**
 * The diagnosis: a lit surface with a dark interior (Campaign E, Wave C / lane
 * B2; `docs/design/BUNKI_THE_FRACTAL_DIVE_2026-07-28.md` §3).
 *
 * ## Why this is the point of the whole feature
 *
 * Different scales aggregate the **same** real numbers, and the mismatch between
 * them is information no flashcard queue can give. You know 森林 as a word, so
 * it reads strong at the word level. Dive in and the 林 inside it reads faint at
 * the character level. That is a specific, actionable fact: a whole-word memory
 * without a component memory, which will fail on 林道 and 山林 for a reason
 * nothing else would have told you.
 *
 * Seeing the inside of a lit node be dark *is* the diagnosis. This module is the
 * part of it that can be computed and tested; the surface's job is to draw it.
 *
 * ## It compares readings; it never produces one
 *
 * Nothing here reads a memory state, admits evidence, or knows what a scheduler
 * is. The caller supplies a {@link ScaleReading} per node per capability, taken
 * from whatever it actually holds, and this module compares them. That keeps the
 * evidence gate the sole factory for evidence and keeps this a projection.
 *
 * ## No aggregate, ever
 *
 * A finding names **one capability** and two specific nodes. There is no
 * function here that averages a ring, scores a dive, or returns a number for a
 * character — REQ-UI-07 forbids collapsing reading, meaning, listening,
 * production and writing into one light, and REQ-LM-03 forbids the global
 * scalar. The type is what enforces it: {@link ScaleMismatch} has a required
 * `capability`, and there is no member of the union that omits it.
 *
 * ## Only levels a contract could exist at
 *
 * A finding is a claim that something *can be acted on*: learn the part and the
 * next word that uses it stops failing. That presupposes the part is a thing the
 * learner could come to know on its own. Strokes are not — nobody captures a
 * stroke, and `strokeNodeOf` says so where it gives one an empty `componentIds`
 * — so a pair with a stroke at either end is skipped by
 * {@link import('./levels.ts').isRetrievalTarget} before any reading is
 * consulted.
 *
 * This was a real defect and not a hypothetical one. At a character the inward
 * rings are components *and* strokes, so the panel rendered "分 ⟶ 1/4 — 分 has
 * meaning evidence and 1/4 inside it has none", presented a permanent-by-rule
 * absence as an actionable memory gap, and pushed the genuine component findings
 * out of a list that shows four.
 *
 * ## Ramps are not comparable across ramps
 *
 * A reading carries the size of the ramp it came from, and two readings on
 * ramps of different sizes are never compared. A caller that mixed a five-band
 * ramp with a three-band one would otherwise get a finding out of arithmetic
 * rather than out of memory.
 */

import type { ScaleNode, ScaleNodeId } from './ladder.ts';
import type { ScaleView } from './dive.ts';
import { isRetrievalTarget } from './levels.ts';

/**
 * One capability's reading for one node, on the caller's own ramp.
 *
 * `step` is an ordinal on that ramp and means nothing outside it — it is not a
 * score, it is not comparable to another node's reading on a different ramp, and
 * it is deliberately not a fraction. `unseen` is separate from `step === 0`
 * because "we have measured this and it is weak" and "we have never measured
 * this" are different claims, and the evidence tiers exist to keep them apart.
 */
export interface ScaleReading {
  readonly nodeId: ScaleNodeId;
  /** Opaque to this module. Reading, meaning, listening, production, writing. */
  readonly capability: string;
  /** 0-based position on the ramp. Higher is stronger. */
  readonly step: number;
  /** How many steps the ramp has. Two readings with different values never meet. */
  readonly steps: number;
  /** No evidence at all, as distinct from weak evidence. */
  readonly unseen: boolean;
  /** Where the reading came from, in the learner's words. Rendered as the citation. */
  readonly basis: string;
}

export const MISMATCH_KINDS = ['interior_unseen', 'interior_weaker'] as const;
export type MismatchKind = (typeof MISMATCH_KINDS)[number];

/**
 * One node known better than something inside it, for one capability.
 *
 * `outer` is always a node the reading says something about; `inner` is one of
 * its constituents. Never the other way round: knowing a component better than
 * the word it appears in is ordinary and expected, and reporting it would bury
 * the finding that matters in noise.
 */
export interface ScaleMismatch {
  readonly kind: MismatchKind;
  readonly capability: string;
  readonly outer: ScaleNodeId;
  readonly outerLabel: string;
  readonly inner: ScaleNodeId;
  readonly innerLabel: string;
  readonly outerStep: number;
  /** `null` when the interior has no evidence at all. */
  readonly innerStep: number | null;
  readonly steps: number;
  /** The finding, as a sentence. Names both nodes and the capability. */
  readonly detail: string;
}

export interface MismatchPolicy {
  /**
   * How many ramp steps of difference count as a finding.
   *
   * Two, by default, on a five-step ramp: one step apart is the ordinary
   * texture of any two contracts and reporting it would make the diagnosis
   * constant, which is the same as making it useless. An interior with no
   * evidence at all is reported regardless of this number, because it is a
   * different finding.
   */
  readonly minimumGap?: number | undefined;
}

export const DEFAULT_MISMATCH_POLICY = Object.freeze({ minimumGap: 2 });

/** A reading index, so a caller can build one once and reuse it across a dive. */
export type ScaleReadingIndex = ReadonlyMap<string, ScaleReading>;

function key(nodeId: ScaleNodeId, capability: string): string {
  // `\u0000` separates the parts because it is the one character neither a node
  // id nor a capability name can contain, so two different pairs can never
  // collide. Written as an escape rather than as a raw byte: a literal NUL makes
  // the file binary to `git diff`.
  return `${nodeId}\u0000${capability}`;
}

/** Build the index {@link diagnoseInterior} reads. Last declaration wins. */
export function indexReadings(readings: Iterable<ScaleReading>): ScaleReadingIndex {
  const index = new Map<string, ScaleReading>();
  for (const reading of readings) index.set(key(reading.nodeId, reading.capability), reading);
  return index;
}

export function readingFor(
  index: ScaleReadingIndex,
  nodeId: ScaleNodeId,
  capability: string,
): ScaleReading | null {
  return index.get(key(nodeId, capability)) ?? null;
}

/**
 * Every lit-surface / dark-interior finding this view can support.
 *
 * Two shapes of pair are examined, and they are the two the surface can actually
 * draw:
 *
 *   1. the **centre** against the members of its inward rings — you are looking
 *      at 森林 and the 森 and 林 inside it are dark;
 *   2. each **outward or inward ring member** against its own preview — the ring
 *      of compounds around 林 contains a lit 森林 whose interior is dark, and the
 *      preview is exactly what made that visible.
 *
 * Deterministic and bounded: it walks only what the view already materialised,
 * so it costs nothing beyond the dive and cannot reach a node the dive culled.
 * Findings come back in view order, so two renders of one view agree.
 */
export function diagnoseInterior(
  view: ScaleView,
  readings: ScaleReadingIndex,
  capabilities: readonly string[],
  policy: MismatchPolicy = {},
): readonly ScaleMismatch[] {
  const minimumGap = Math.max(1, policy.minimumGap ?? DEFAULT_MISMATCH_POLICY.minimumGap);
  const findings: ScaleMismatch[] = [];
  const centre = view.centre;

  for (const capability of capabilities) {
    if (centre !== null) {
      for (const ring of view.rings) {
        if (ring.bucket !== 'inward') continue;
        for (const member of ring.members) {
          pushIfMismatched(findings, readings, capability, centre, member.node, minimumGap);
        }
      }
    }

    for (const ring of view.rings) {
      if (ring.bucket === 'alongside') continue;
      for (const member of ring.members) {
        for (const inner of member.preview) {
          pushIfMismatched(findings, readings, capability, member.node, inner, minimumGap);
        }
      }
    }
  }

  return Object.freeze(findings);
}

function pushIfMismatched(
  into: ScaleMismatch[],
  readings: ScaleReadingIndex,
  capability: string,
  outer: ScaleNode,
  inner: ScaleNode,
  minimumGap: number,
): void {
  /*
    Both ends have to be things a contract could exist on.

    A finding says "you know the whole and not this part, and that will cost you
    in another word". For the part, that sentence presupposes the part is
    something you could come to know separately. Strokes are not — see
    `RETRIEVAL_TARGET_LEVELS` — so a stroke reported as a dark interior is an
    absence that no action closes. It is filtered here rather than by the caller
    because the caller would have to know the rule to pass the right nodes, and a
    rule enforced by every caller is a rule enforced by none.
  */
  if (!isRetrievalTarget(inner.level) || !isRetrievalTarget(outer.level)) return;

  const outerReading = readingFor(readings, outer.id, capability);
  // No evidence on the outside means there is no whole-word memory to contrast
  // with, so there is nothing to diagnose. Reporting it would turn "you have not
  // met either of these" into a finding about the one inside.
  if (outerReading === null || outerReading.unseen) return;

  const innerReading = readingFor(readings, inner.id, capability);

  if (innerReading === null || innerReading.unseen) {
    into.push({
      kind: 'interior_unseen',
      capability,
      outer: outer.id,
      outerLabel: outer.label,
      inner: inner.id,
      innerLabel: inner.label,
      outerStep: outerReading.step,
      innerStep: null,
      steps: outerReading.steps,
      detail: `${outer.label} has ${capability} evidence and ${inner.label} inside it has none. That is a whole-unit memory without a memory of its part: nothing here has been checked at the smaller scale.`,
    });
    return;
  }

  // Ramps of different sizes are not comparable; see this file's header.
  if (innerReading.steps !== outerReading.steps) return;
  if (outerReading.step - innerReading.step < minimumGap) return;

  into.push({
    kind: 'interior_weaker',
    capability,
    outer: outer.id,
    outerLabel: outer.label,
    inner: inner.id,
    innerLabel: inner.label,
    outerStep: outerReading.step,
    innerStep: innerReading.step,
    steps: outerReading.steps,
    detail: `${outer.label} reads stronger for ${capability} than the ${inner.label} inside it. A whole-unit memory can carry a part it has not learned separately, and it will not carry it into another word.`,
  });
}

/**
 * The findings for one node, deduplicated to the sharpest one per pair.
 *
 * `interior_unseen` beats `interior_weaker` for the same pair and capability,
 * because "never checked" is a stronger and more actionable statement than
 * "checked and weaker". Order within the input is otherwise preserved.
 */
export function sharpestMismatches(findings: readonly ScaleMismatch[]): readonly ScaleMismatch[] {
  const best = new Map<string, ScaleMismatch>();
  for (const finding of findings) {
    const pair = `${finding.outer}\u0000${finding.inner}\u0000${finding.capability}`;
    const existing = best.get(pair);
    if (existing === undefined) {
      best.set(pair, finding);
      continue;
    }
    if (existing.kind === 'interior_weaker' && finding.kind === 'interior_unseen') {
      best.set(pair, finding);
    }
  }
  return Object.freeze([...best.values()]);
}
