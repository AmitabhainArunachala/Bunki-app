/**
 * Where a node sits, and which lines may be drawn between them (Campaign E / B1).
 *
 * ## The rule, restated because it is the one a layout breaks
 *
 * > **Every edge drawn must be an edge the domain holds.** Never invent a
 * > connection for visual balance or symmetry.
 *
 * A layout is where that rule dies quietly, because a layout is the one part of
 * a map whose job *is* to look right. So {@link layoutNeighbourhood} takes a
 * `Neighbourhood` and returns lines built **only** from `neighbourhood.edges` —
 * it has no way to add one, since it never sees the graph and cannot query it.
 * A line whose two ends are not both in the returned node set is dropped rather
 * than drawn to the edge of the view; the domain already guarantees both ends
 * are present, and the check costs one lookup and closes the hole for good.
 *
 * The fractal-dive brief also rules out the prettiest available option by name:
 * *"kaleidoscopic mirror symmetry… is beautiful and it destroys meaning: a
 * mirrored 森 is not a kanji, and the symmetry would imply relationships that do
 * not exist."* Nothing here mirrors anything.
 *
 * ## Rings, not a force simulation
 *
 * Position is a pure function of `(depth, index within depth)`. The origin is at
 * the centre; depth 1 sits on a ring around it; depth 2 on a wider one. Three
 * consequences, all wanted:
 *
 *   - **It is deterministic.** The same neighbourhood lays out identically every
 *     time, on every device. A force simulation would give a different picture
 *     per run and per frame, and "the map moved" would be indistinguishable from
 *     "your memory changed".
 *   - **It costs one pass.** No iteration to convergence, nothing per frame. The
 *     phone is the primary target and a settling simulation over even 60 nodes
 *     is the kind of thing that shows up as heat.
 *   - **Distance from the centre means hops from the origin**, and nothing else.
 *     A reader can trust the radius. In a force layout the radius means whatever
 *     the solver settled on.
 *
 * Angles are spread evenly around the ring and offset per depth so the two rings
 * do not line up into spokes, which would read as a hierarchy the graph does not
 * have. The offset is a constant, not a random jitter — see above.
 *
 * ## Nothing here is about the learner
 *
 * A position encodes graph distance. It does not encode retrievability, era, or
 * anything else about the person: those are drawn *on* the node by the marks,
 * where they can be labelled. A layout that moved fragile nodes outward would be
 * a second, unlabelled mastery channel, and an unlabelled channel is exactly
 * what REQ-UI-07 forbids.
 */

import type { GraphNode, GraphNodeId, Neighbourhood } from '@bunki/domain';

/** A node with a place in the view, in the unit square. */
export interface PlacedPoint {
  readonly node: GraphNode;
  readonly depth: number;
  /** 0…1 across the field. */
  readonly x: number;
  /** 0…1 down the field. */
  readonly y: number;
}

/** A line the domain holds, with both of its ends resolved to points. */
export interface PlacedLine {
  readonly from: PlacedPoint;
  readonly to: PlacedPoint;
  readonly kind: string;
  /** Component role where the edge carries one; `null` everywhere else. */
  readonly role: string | null;
}

export interface MapLayout {
  readonly points: readonly PlacedPoint[];
  readonly lines: readonly PlacedLine[];
  /** Nodes the ring geometry could not place. Always empty; kept honest. */
  readonly unplaced: readonly GraphNodeId[];
}

/**
 * Radius of each depth ring, as a fraction of half the field.
 *
 * Depth 3 and beyond share the outermost ring rather than marching off the
 * field. The default neighbourhood depth is 2, so that case is a guard rather
 * than a common path, and clamping is better than drawing a node outside the
 * view where a learner would never find it.
 */
const RING_RADII: readonly number[] = [0, 0.3, 0.46, 0.5];

/**
 * A per-depth angular offset so rings do not form spokes. Fixed, not random.
 *
 * The golden angle, because the first value tried (0.37 rad) was too small to
 * do the job at the sparse end: a band with one node per ring put both of them
 * within 21° of each other and their labels overlapped. The browser capture
 * showed it. 2.3999 rad separates consecutive rings by 137°, which is the
 * largest rotation that never repeats — the same property that makes it the
 * angle a sunflower uses.
 *
 * Still a constant, still deterministic, and still nothing to do with the
 * learner: it is a function of `depth` alone.
 */
const RING_PHASE = 2.399963;

function radiusFor(depth: number): number {
  return RING_RADII[Math.min(depth, RING_RADII.length - 1)] ?? 0.5;
}

/**
 * Lay a neighbourhood out on rings, and draw only the edges it carries.
 *
 * Pure and total: an empty neighbourhood lays out to an empty field rather than
 * throwing, because "you have nothing near here" is a state the map has to be
 * able to render.
 */
export function layoutNeighbourhood(neighbourhood: Neighbourhood): MapLayout {
  const byDepth = new Map<number, GraphNode[]>();
  for (const entry of neighbourhood.nodes) {
    const bucket = byDepth.get(entry.depth);
    if (bucket === undefined) byDepth.set(entry.depth, [entry.node]);
    else bucket.push(entry.node);
  }

  const points = new Map<GraphNodeId, PlacedPoint>();
  for (const [depth, nodes] of [...byDepth.entries()].sort((a, b) => a[0] - b[0])) {
    const radius = radiusFor(depth);
    nodes.forEach((node, index) => {
      if (depth === 0) {
        points.set(node.id, { node, depth, x: 0.5, y: 0.5 });
        return;
      }
      const angle = (index / nodes.length) * Math.PI * 2 + depth * RING_PHASE;
      points.set(node.id, {
        node,
        depth,
        x: 0.5 + radius * Math.cos(angle),
        y: 0.5 + radius * Math.sin(angle),
      });
    });
  }

  const lines: PlacedLine[] = [];
  for (const edge of neighbourhood.edges) {
    const from = points.get(edge.from);
    const to = points.get(edge.to);
    // Both ends or nothing. The domain returns only edges whose ends it
    // returned, so this never fires today — and it is what makes "no invented
    // line" a property of this function rather than of its caller.
    if (from === undefined || to === undefined) continue;
    lines.push({ from, to, kind: edge.kind, role: edge.role });
  }

  return {
    points: [...points.values()],
    lines,
    unplaced: neighbourhood.nodes
      .filter((entry) => !points.has(entry.node.id))
      .map((entry) => entry.node.id),
  };
}
