/**
 * Cutting the seed passage into interactive pieces (WP-08; controller §10.5).
 *
 * Pure, no React, no store — so the segmentation can be tested exhaustively and
 * the canvas screen stays a renderer.
 *
 * The rule is deliberately dumb: longest literal match wins, left to right,
 * over a list of forms the seed already knows about. There is no tokeniser, no
 * morphological analysis, and no inference. That is not a shortcut to be fixed
 * later — a canvas that *guessed* which span was the promoted target could
 * declare a probe on a word the learner was never being asked about, and the
 * whole of REQ-SCH-06 rests on the probe naming its exact contract. A literal
 * match either finds the target form or does not, and "does not" is a visible
 * empty state rather than a plausible wrong answer.
 */

/** One form the canvas is willing to make interactive. */
export interface PassageMark {
  /** The literal surface form as it appears in the passage body. */
  readonly form: string;
  /** The KnowledgeComponent this form stands for (`kc:…`, WP-06 identity). */
  readonly componentId: string;
  /**
   * True for the one promoted target the passage was written around. Only a
   * target mark can ever carry a declared probe; everything else is exposure.
   */
  readonly isTarget: boolean;
  readonly reading?: string | undefined;
  readonly gloss?: string | undefined;
}

export type PassageSegment =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'mark';
      readonly text: string;
      readonly mark: PassageMark;
      /** 0-based index among occurrences of this same form. Part of the key. */
      readonly occurrence: number;
    };

/**
 * Split a passage body into plain text and interactive marks.
 *
 * Two ordering rules, and the first one is load-bearing.
 *
 * **The promoted target wins, even against a longer word that contains it.** The
 * seed passage embeds 分岐 only inside 分岐点 (controller §8's hand-written
 * passage; `packages/seed/data/passages.json`). Under a plain longest-first rule
 * 分岐点 would swallow the span, the target would have no mark, and the canvas
 * written around the target would silently offer no probe at all — a failure
 * that looks exactly like a working page. So target marks are tried first, and
 * 「この分岐点が」 becomes 「この▢▢点が」, which is a cloze on the target in its
 * real context rather than on a word standing alone.
 *
 * **Then longest-first**, so a longer non-target form claims its span rather
 * than leaving a stray character behind. Remaining ties keep the caller's order,
 * which the caller controls and the canvas keeps stable.
 */
export function segmentPassage(
  body: string,
  marks: readonly PassageMark[],
): readonly PassageSegment[] {
  const ordered = [...marks]
    .filter((mark) => mark.form.length > 0)
    .sort((left, right) => {
      const byTarget = Number(right.isTarget) - Number(left.isTarget);
      if (byTarget !== 0) return byTarget;
      return right.form.length - left.form.length;
    });

  const segments: PassageSegment[] = [];
  const occurrences = new Map<string, number>();
  let plain = '';
  let index = 0;

  const flush = (): void => {
    if (plain.length === 0) return;
    segments.push({ kind: 'text', text: plain });
    plain = '';
  };

  while (index < body.length) {
    const hit = ordered.find((mark) => body.startsWith(mark.form, index));
    if (hit === undefined) {
      plain += body[index] ?? '';
      index += 1;
      continue;
    }
    flush();
    const seen = occurrences.get(hit.form) ?? 0;
    occurrences.set(hit.form, seen + 1);
    segments.push({ kind: 'mark', text: hit.form, mark: hit, occurrence: seen });
    index += hit.form.length;
  }

  flush();
  return segments;
}

/** Every mark segment for the promoted target, in reading order. */
export function targetSegments(
  segments: readonly PassageSegment[],
): readonly Extract<PassageSegment, { kind: 'mark' }>[] {
  return segments.filter(
    (segment): segment is Extract<PassageSegment, { kind: 'mark' }> =>
      segment.kind === 'mark' && segment.mark.isTarget,
  );
}

/** A stable React key for a segment at a position. */
export function segmentKey(segment: PassageSegment, position: number): string {
  return segment.kind === 'text'
    ? `t${String(position)}`
    : `m${String(position)}-${segment.mark.componentId}-${String(segment.occurrence)}`;
}
