/**
 * The shape of a branch point (Campaign E, lane B5).
 *
 * 分岐 is a railway term and this is the railway drawing: one line comes down,
 * reaches a point, and fans out into every road available from it. When the
 * evidence closes a branch the taken road curves back to the main line — 合流,
 * the other half of the same word.
 *
 * ## Why it takes measured row centres rather than a row height
 *
 * The first version took a constant `rowHeight` and gave every rail a fixed
 * slot. That is a drawing that is only correct while every rail's text happens
 * to fit: a family with four supporting facts is taller than one with none, a
 * narrow window wraps a hypothesis onto three lines, and the curve then lands
 * beside its row instead of at it. Since the rows are laid out by the
 * component, the component is what knows where they ended up — so it measures
 * and passes the centres in, and this module draws to them.
 *
 * ## Why the geometry is a pure module and not inline in the component
 *
 * Because it can then be asserted. "The untaken rails are still drawn" is a
 * property of the path set, and a test can check that every rail has a path
 * whose endpoint is inside the canvas — which is what the frozen spec §3 asks
 * for. Left inline it would be checkable only by looking at a screenshot, and a
 * screenshot is evidence of one render rather than of a rule.
 *
 * ## What it does not encode
 *
 * Nothing about the learner. A rail's position is its row's position, which is
 * its family's fixed rank; the only thing that varies with state is which rail
 * is lit, and lighting is opacity, handled by `BranchLight`. Geometry never
 * means memory.
 */

/** One drawn rail: its row index and the path that reaches it. */
export interface ForkRailPath {
  readonly index: number;
  /** The `d` of the rail as it leaves the fork and reaches its row. */
  readonly d: string;
  /** Where it lands, so a caller can put a node there. */
  readonly endX: number;
  readonly endY: number;
  /**
   * The return to the main line, drawn only for a road the evidence closed.
   * `null` on every other rail — a rejoin drawn speculatively would be a
   * picture of something that has not happened.
   */
  readonly rejoinD: string | null;
}

export interface ForkGeometry {
  readonly width: number;
  readonly height: number;
  /** The line coming into the branch point. */
  readonly trunkD: string;
  /** Where the fan-out begins. A node is drawn here. */
  readonly forkX: number;
  readonly forkY: number;
  readonly rails: readonly ForkRailPath[];
}

export interface ForkGeometryOptions {
  /** Vertical centre of each rail's row, in the drawing's own coordinates. */
  readonly rowCentres: readonly number[];
  /** Full height of the drawing — the height of the row column. */
  readonly height: number;
  readonly width?: number | undefined;
  /** Row index of the road the evidence closed, or `null`. */
  readonly rejoinedIndex?: number | null | undefined;
}

/** Horizontal position of the incoming line. */
export const TRUNK_X = 11;

/** The furthest down the branch point is allowed to sit. */
export const MAX_APPROACH = 22;

const DEFAULT_WIDTH = 56;

/** One decimal place, so two runs produce byte-identical path data. */
export const round = (value: number): number => Math.round(value * 10) / 10;

/**
 * Build the fork.
 *
 * The trunk descends to the branch point; every rail leaves it as a cubic whose
 * control points hold the line vertical at the fork and horizontal at the row,
 * which is how a real turnout reads — a curve that leaves at an angle looks
 * like a fold rather than a switch.
 *
 * No rows yields a trunk and no rails, which is the honest drawing of a target
 * with no route at all rather than a thrown error: the compiler can legitimately
 * offer nothing, and the surface says so in words beside this.
 */
export function forkGeometry(options: ForkGeometryOptions): ForkGeometry {
  const width = options.width ?? DEFAULT_WIDTH;
  const centres = options.rowCentres.map(round);
  const height = round(Math.max(options.height, ...centres, MAX_APPROACH));

  // Above the first row, but never off the top: a fork point drawn at y=0 has
  // no line coming into it, and a line with no approach does not read as a
  // junction.
  const firstCentre = centres[0];
  const forkY = round(
    firstCentre === undefined ? MAX_APPROACH : Math.max(6, Math.min(MAX_APPROACH, firstCentre - 8)),
  );

  const endX = round(width - 6);

  const rails = centres.map<ForkRailPath>((endY, index) => {
    const control = round(forkY + (endY - forkY) * 0.55);
    return Object.freeze({
      index,
      d: `M ${String(TRUNK_X)} ${String(forkY)} C ${String(TRUNK_X)} ${String(control)}, ${String(round(endX - 18))} ${String(endY)}, ${String(endX)} ${String(endY)}`,
      endX,
      endY,
      rejoinD:
        options.rejoinedIndex === index
          ? // Back to the trunk's line at the foot of the drawing. The mirror of
            // the outbound curve, so the pair reads as one 分岐 → 合流 movement.
            `M ${String(endX)} ${String(endY)} C ${String(round(endX - 18))} ${String(endY)}, ${String(TRUNK_X)} ${String(round(endY + (height - endY) * 0.45))}, ${String(TRUNK_X)} ${String(height)}`
          : null,
    });
  });

  return Object.freeze({
    width,
    height,
    trunkD: `M ${String(TRUNK_X)} 0 L ${String(TRUNK_X)} ${String(forkY)}`,
    forkX: TRUNK_X,
    forkY,
    rails: Object.freeze(rails),
  });
}
