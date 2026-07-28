/**
 * One view of the ladder, bounded (Campaign E, Wave C / lane B2).
 *
 * ## The whole level-of-detail contract, in one function
 *
 * {@link diveAt} answers "what is around this node, right now" and **never
 * walks the graph**. It reads the centre's own pre-sorted adjacency list, reads
 * one further list for each of a handful of previewed members, and stops. The
 * budget is per landing level, so a hub node with four hundred compounds costs
 * the same as one with three.
 *
 * That is not asserted, it is *reported*: every view carries a {@link ScaleCost}
 * saying how many adjacency lists were read, how many entries were examined, and
 * how many nodes were materialised, beside how many nodes the ladder holds in
 * total. A test can then assert the first three do not move when the fourth
 * grows tenfold — which is the property the design document asks for and the one
 * lane A2 already had to repair once ("the time scrubber rebuilt the whole index
 * on every frame").
 *
 * ## Zooming is changing which node is the centre
 *
 * There is no other operation. A dive from 森林 to 森 to 木 is three calls to
 * this function with three different ids; nothing accumulates, nothing is
 * incrementally updated, and so nothing can drift out of step with the graph.
 * The surface's continuity is a rendering concern; the projection is stateless.
 *
 * ## Every edge drawn is an edge the domain holds
 *
 * Relations come from `adjacencyOf` and from the two sources the graph has no
 * vocabulary for (KanjiVG strokes, declared collocations). Nothing here creates
 * a relation for symmetry, balance or to fill a ring: a level with nothing in it
 * produces a {@link ScaleGap} with a reason, and the surface says so.
 *
 * ## Nothing here writes anything
 *
 * This is a projection. It reads the Atlas; it does not touch the Trace, does
 * not mint an event, and has no access to the evidence gate. Navigating it is
 * exposure and exposure is never retrieval — the rule is kept by this module
 * having no way to express a write, not by a comment saying so.
 */

import type { ComponentRole, GraphNodeId } from '../graph/model.ts';
import type { GraphEdgeKind } from '../graph/model.ts';
import { adjacencyOf } from '../graph/build.ts';

import {
  LEVEL_OF_GRAPH_KIND,
  parseStrokeNodeId,
  scaleNodeAt,
  strokeNodeOf,
  type ScaleLadder,
  type ScaleNode,
  type ScaleNodeId,
} from './ladder.ts';
import {
  SCALE_LEVEL_DEPTH,
  levelInwardOf,
  levelOutwardOf,
  relationDirectionBetween,
  type RelationBucket,
  type ScaleLevel,
} from './levels.ts';

/* ------------------------------------------------------------------ *
 * What produced a relation
 * ------------------------------------------------------------------ */

/**
 * Why two nodes are next to each other.
 *
 * The graph's own edge kinds, plus the three this package adds for the levels
 * the graph has no vocabulary for. Carried on every relation because "these are
 * related" is a claim and the basis is its citation — the difference between a
 * map and a mood board.
 */
export type ScaleBasis =
  GraphEdgeKind | 'kanjivg_stroke' | 'writing_order' | 'collocation_member' | 'collocation_of';

/** One node next to the centre, with the reason it is there. */
export interface ScaleRelation {
  readonly node: ScaleNode;
  readonly bucket: RelationBucket;
  readonly basis: ScaleBasis;
  /** Semantic, phonetic, corrupted or unclassified — only on `component_of`. */
  readonly role: ComponentRole | null;
  /**
   * A glimpse one level further in, for the first few members of a ring.
   *
   * This is the feature the design document calls the diagnosis: *seeing the
   * inside of a bright node be dark*. A surface that only drew the ring could
   * never show that 森林 is well known while the 林 inside it is not, because it
   * would never have drawn the inside. So the first `previewMembers` of each
   * scale ring carry their own inward ring, truncated to `previewLimit`.
   *
   * Bounded twice over, deliberately: the number of members previewed and the
   * size of each preview are both budgets, so the preview cannot become a second
   * uncapped walk.
   */
  readonly preview: readonly ScaleNode[];
  /** How many the previewed node has inward in total, before the budget. */
  readonly previewAvailable: number;
  /** False when this member was past `previewMembers` and was not looked into. */
  readonly previewMaterialised: boolean;
}

/** One ring: every relation of one bucket that lands on one level. */
export interface ScaleRing {
  readonly bucket: RelationBucket;
  readonly level: ScaleLevel;
  readonly members: readonly ScaleRelation[];
  /** How many were available before the per-level budget applied. */
  readonly available: number;
  readonly truncated: boolean;
}

/* ------------------------------------------------------------------ *
 * Gaps
 * ------------------------------------------------------------------ */

export const SCALE_GAP_REASONS = [
  'atomic',
  'ceiling',
  'no_data',
  'level_unpopulated',
  'no_stroke_source',
] as const;

export type ScaleGapReason = (typeof SCALE_GAP_REASONS)[number];

/**
 * A level with nothing in it, and why.
 *
 * A first-class value rather than an absence, for the same reason `unknown` is a
 * member of the era placement union: an empty ring a renderer cannot explain
 * looks like a bug or, worse, like a claim that the relation does not exist.
 * "There is nothing here and here is the reason" is a different sentence from
 * "there is nothing here", and only one of them is honest.
 */
export interface ScaleGap {
  readonly bucket: RelationBucket;
  readonly level: ScaleLevel;
  readonly reason: ScaleGapReason;
  readonly detail: string;
}

/* ------------------------------------------------------------------ *
 * Cost
 * ------------------------------------------------------------------ */

/**
 * What this view actually cost, measured rather than promised.
 *
 * `ladderNodes` is here so the other numbers mean something: "twenty-two nodes
 * materialised" is only a level-of-detail claim beside "out of six thousand".
 */
export interface ScaleCost {
  /** Adjacency lists read — one for the centre, one per previewed member. */
  readonly adjacencyReads: number;
  /** Adjacency entries examined across all of those reads. */
  readonly adjacencySteps: number;
  /** Calls into the caller's stroke source. */
  readonly strokeLookups: number;
  /** `ScaleNode` objects built, the centre included. */
  readonly nodesMaterialised: number;
  /** How many nodes the whole ladder holds. Not touched, only counted. */
  readonly ladderNodes: number;
}

export interface ScaleView {
  /** `null` when the id names nothing on the ladder — an honest empty, not a throw. */
  readonly centre: ScaleNode | null;
  readonly rings: readonly ScaleRing[];
  readonly gaps: readonly ScaleGap[];
  readonly cost: ScaleCost;
}

/* ------------------------------------------------------------------ *
 * Budgets
 * ------------------------------------------------------------------ */

export interface DiveOptions {
  /** Ceiling per landing level, per bucket. A hub costs the same as a leaf. */
  readonly perLevel?: number | undefined;
  /** How many members of each scale ring get a preview of their own interior. */
  readonly previewMembers?: number | undefined;
  /** Ceiling on one preview. */
  readonly previewLimit?: number | undefined;
}

/**
 * The budgets a dive gets if it asks for nothing.
 *
 * Twelve is the number of things a person can take in as a ring at a glance
 * without it becoming a list, and it is comfortably above the real fan-out at
 * the levels that matter: a kanji has two or three components, a word has two or
 * three kanji. It bites on the outward side — 人 appears in hundreds of words —
 * which is exactly where a budget should bite and where `available` and
 * `truncated` are what keep the truncation visible.
 *
 * Four × six for the preview is the smaller of two costs: four extra adjacency
 * reads per ring, and twenty-four extra nodes. Both are constant in the size of
 * the graph, which is the property that matters.
 */
export const DEFAULT_DIVE_OPTIONS = Object.freeze({
  perLevel: 12,
  previewMembers: 4,
  previewLimit: 6,
});

const EMPTY_RINGS: readonly ScaleRing[] = Object.freeze([]);

function emptyView(ladder: ScaleLadder, adjacencyReads: number): ScaleView {
  return Object.freeze({
    centre: null,
    rings: EMPTY_RINGS,
    gaps: Object.freeze([]),
    cost: Object.freeze({
      adjacencyReads,
      adjacencySteps: 0,
      strokeLookups: 0,
      nodesMaterialised: 0,
      ladderNodes: ladder.graph.nodes.size + ladder.collocations.size,
    }),
  });
}

interface Collected {
  readonly bucket: RelationBucket;
  readonly level: ScaleLevel;
  readonly node: ScaleNode;
  readonly basis: ScaleBasis;
  readonly role: ComponentRole | null;
}

/**
 * A view of the ladder centred on one node.
 *
 * Deterministic: the graph's adjacency is pre-sorted by `compareAdjacency`, and
 * the collection below preserves that order, so two calls with the same ladder
 * and id produce deeply equal results and a truncated ring keeps the same
 * members between renders.
 */
export function diveAt(ladder: ScaleLadder, id: ScaleNodeId, options: DiveOptions = {}): ScaleView {
  const perLevel = Math.max(0, options.perLevel ?? DEFAULT_DIVE_OPTIONS.perLevel);
  const previewMembers = Math.max(0, options.previewMembers ?? DEFAULT_DIVE_OPTIONS.previewMembers);
  const previewLimit = Math.max(0, options.previewLimit ?? DEFAULT_DIVE_OPTIONS.previewLimit);

  let adjacencyReads = 0;
  let adjacencySteps = 0;
  let strokeLookups = 0;
  let nodesMaterialised = 0;

  const centre = scaleNodeAt(ladder, id);
  if (centre === null) return emptyView(ladder, adjacencyReads);
  nodesMaterialised += 1;
  // `scaleNodeAt` consults the stroke source when the id is a stroke id.
  if (centre.level === 'stroke') strokeLookups += 1;

  const collected: Collected[] = [];
  const gaps: ScaleGap[] = [];

  if (centre.level === 'stroke') {
    // ------------------------------------------------------------------
    // A stroke: atomic inward, its own character outward, its siblings beside.
    // ------------------------------------------------------------------
    const parsed = parseStrokeNodeId(centre.id);
    gaps.push({
      bucket: 'inward',
      level: 'stroke',
      reason: 'atomic',
      detail:
        'A stroke is the floor of this ladder. KanjiVG records the geometry of a stroke and nothing that a stroke is made of, so there is nothing further in — not because the data is thin, but because the level below does not exist.',
    });

    if (parsed !== null) {
      const siblings = ladder.strokesFor(parsed.kanjiNodeId);
      strokeLookups += 1;
      for (const record of siblings) {
        if (record.order === parsed.order) continue;
        collected.push({
          bucket: 'alongside',
          level: 'stroke',
          node: strokeNodeOf(parsed.kanjiNodeId, record, siblings.length),
          basis: 'writing_order',
          role: null,
        });
      }

      const owner = scaleNodeAt(ladder, parsed.kanjiNodeId);
      if (owner === null) {
        gaps.push({
          bucket: 'outward',
          level: 'kanji',
          reason: 'no_data',
          detail:
            'This stroke names a character the indexed Atlas does not declare, so there is nothing to zoom out to.',
        });
      } else {
        collected.push({
          bucket: 'outward',
          level: owner.level,
          node: owner,
          basis: 'kanjivg_stroke',
          role: null,
        });
      }
    }
  } else if (centre.graphKind === null) {
    // ------------------------------------------------------------------
    // A declared collocation: its members inward, nothing outward yet.
    // ------------------------------------------------------------------
    const record = ladder.collocations.get(centre.id);
    for (const memberId of record?.memberIds ?? []) {
      const member = scaleNodeAt(ladder, memberId);
      if (member === null) continue;
      collected.push({
        bucket: relationDirectionBetween(centre.level, member.level),
        level: member.level,
        node: member,
        basis: 'collocation_member',
        role: null,
      });
    }
  } else {
    // ------------------------------------------------------------------
    // A graph node: one adjacency list, read once.
    // ------------------------------------------------------------------
    const adjacency = adjacencyOf(ladder.graph, centre.id);
    adjacencyReads += 1;
    adjacencySteps += adjacency.length;

    for (const step of adjacency) {
      const other = ladder.graph.nodes.get(step.other);
      if (other === undefined) continue;
      const level = LEVEL_OF_GRAPH_KIND[other.kind];
      // A facet — a reading, a sense, an encounter. Real, and not a scale. It
      // stays reachable through `neighbourhoodOf`, which is where a reading
      // family belongs; putting it on the ladder would break the one law.
      if (level === null) continue;
      collected.push({
        bucket: relationDirectionBetween(centre.level, level),
        level,
        node: {
          id: other.id,
          level,
          label: other.label,
          componentIds: other.componentIds,
          graphKind: other.kind,
          stroke: null,
        },
        basis: step.kind,
        role: step.role,
      });
      nodesMaterialised += 1;
    }

    // The strokes of a character are constituents the graph has no edge for.
    if (centre.level === 'kanji') {
      const strokes = ladder.strokesFor(centre.id);
      strokeLookups += 1;
      if (strokes.length === 0) {
        gaps.push({
          bucket: 'inward',
          level: 'stroke',
          reason: 'no_stroke_source',
          detail:
            'This build carries no KanjiVG geometry for this character, so its strokes cannot be drawn or dived into. Nothing is inferred from the stroke count.',
        });
      }
      for (const record of strokes.slice(0, perLevel)) {
        collected.push({
          bucket: 'inward',
          level: 'stroke',
          node: strokeNodeOf(centre.id, record, strokes.length),
          basis: 'kanjivg_stroke',
          role: null,
        });
        nodesMaterialised += 1;
      }
    }

    // Declared phrases this node participates in. Empty in every shipped build.
    for (const phraseId of ladder.collocationsByMember.get(centre.id) ?? []) {
      const phrase = ladder.collocations.get(phraseId);
      if (phrase === undefined) continue;
      collected.push({
        bucket: 'outward',
        level: 'collocation',
        node: {
          id: phrase.id,
          level: 'collocation',
          label: phrase.label,
          componentIds: phrase.componentIds,
          graphKind: null,
          stroke: null,
        },
        basis: 'collocation_of',
        role: null,
      });
      nodesMaterialised += 1;
    }
  }

  /* -------------------------------------------------- rings, with budgets */

  const buckets = new Map<string, Collected[]>();
  for (const entry of collected) {
    const key = `${entry.bucket}|${entry.level}`;
    const list = buckets.get(key);
    if (list === undefined) buckets.set(key, [entry]);
    else list.push(entry);
  }

  const rings: ScaleRing[] = [];
  buckets.forEach((entries) => {
    const first = entries[0];
    if (first === undefined) return;
    const kept = entries.slice(0, perLevel);
    const members: ScaleRelation[] = kept.map((entry, index) => {
      const shouldPreview = entry.bucket !== 'alongside' && index < previewMembers;
      if (!shouldPreview) {
        return {
          node: entry.node,
          bucket: entry.bucket,
          basis: entry.basis,
          role: entry.role,
          preview: [],
          previewAvailable: 0,
          previewMaterialised: false,
        };
      }
      const glimpse = previewInwardOf(ladder, entry.node, previewLimit);
      adjacencyReads += glimpse.adjacencyReads;
      adjacencySteps += glimpse.adjacencySteps;
      nodesMaterialised += glimpse.nodes.length;
      return {
        node: entry.node,
        bucket: entry.bucket,
        basis: entry.basis,
        role: entry.role,
        preview: glimpse.nodes,
        previewAvailable: glimpse.available,
        previewMaterialised: true,
      };
    });
    rings.push({
      bucket: first.bucket,
      level: first.level,
      members: Object.freeze(members),
      available: entries.length,
      truncated: entries.length > kept.length,
    });
  });

  // Nearest level first in each direction, so a dive reads as a dive: the ring
  // one step in comes before the ring two steps in.
  const centreDepth = SCALE_LEVEL_DEPTH[centre.level];
  const bucketRank: Readonly<Record<RelationBucket, number>> = {
    inward: 0,
    alongside: 1,
    outward: 2,
  };
  rings.sort((left, right) => {
    const byBucket = bucketRank[left.bucket] - bucketRank[right.bucket];
    if (byBucket !== 0) return byBucket;
    const leftDistance = Math.abs(SCALE_LEVEL_DEPTH[left.level] - centreDepth);
    const rightDistance = Math.abs(SCALE_LEVEL_DEPTH[right.level] - centreDepth);
    return leftDistance - rightDistance;
  });

  gaps.push(...missingRings(ladder, centre, rings));

  return Object.freeze({
    centre,
    rings: Object.freeze(rings),
    gaps: Object.freeze(gaps),
    cost: Object.freeze({
      adjacencyReads,
      adjacencySteps,
      strokeLookups,
      nodesMaterialised,
      ladderNodes: ladder.graph.nodes.size + ladder.collocations.size,
    }),
  });
}

/* ------------------------------------------------------------------ *
 * The preview
 * ------------------------------------------------------------------ */

interface Preview {
  readonly nodes: readonly ScaleNode[];
  readonly available: number;
  readonly adjacencyReads: number;
  readonly adjacencySteps: number;
}

const NO_PREVIEW: Preview = Object.freeze({
  nodes: Object.freeze([]),
  available: 0,
  adjacencyReads: 0,
  adjacencySteps: 0,
});

/**
 * What is immediately inside one node, bounded.
 *
 * Deliberately *inward only*, at every bucket. The diagnosis the design document
 * names — a bright surface with a dark interior — is a statement about what a
 * node is made of, so looking outward here would answer a different question and
 * cost the same.
 *
 * Strokes are excluded from a preview even though they are constituents: a
 * twelve-stroke character would fill every preview with geometry and push the
 * components out, and the components are what the diagnosis is about.
 */
function previewInwardOf(ladder: ScaleLadder, node: ScaleNode, limit: number): Preview {
  if (limit === 0) return NO_PREVIEW;
  if (node.graphKind === null) return NO_PREVIEW;

  const adjacency = adjacencyOf(ladder.graph, node.id);
  const nodes: ScaleNode[] = [];
  let available = 0;

  for (const step of adjacency) {
    const other = ladder.graph.nodes.get(step.other);
    if (other === undefined) continue;
    const level = LEVEL_OF_GRAPH_KIND[other.kind];
    if (level === null) continue;
    if (relationDirectionBetween(node.level, level) !== 'inward') continue;
    available += 1;
    if (nodes.length >= limit) continue;
    nodes.push({
      id: other.id,
      level,
      label: other.label,
      componentIds: other.componentIds,
      graphKind: other.kind,
      stroke: null,
    });
  }

  return {
    nodes: Object.freeze(nodes),
    available,
    adjacencyReads: 1,
    adjacencySteps: adjacency.length,
  };
}

/* ------------------------------------------------------------------ *
 * Gaps
 * ------------------------------------------------------------------ */

/**
 * The levels a dive could have shown and did not, each with a reason.
 *
 * Two shapes matter and they are different sentences:
 *
 *   - the level next door is empty and something *further* is not — the ladder
 *     skips a rung here, which is what a word reaching a sentence past the
 *     collocation level looks like;
 *   - the direction is empty altogether — the floor, the ceiling, or a node with
 *     nothing there in this dataset.
 */
function missingRings(
  ladder: ScaleLadder,
  centre: ScaleNode,
  rings: readonly ScaleRing[],
): readonly ScaleGap[] {
  const gaps: ScaleGap[] = [];
  const present = new Set(rings.map((ring) => `${ring.bucket}|${ring.level}`));
  const hasBucket = (bucket: RelationBucket): boolean =>
    rings.some((ring) => ring.bucket === bucket && ring.members.length > 0);

  const nominalInward = levelInwardOf(centre.level);
  if (nominalInward === null) {
    // The floor is reported by the stroke branch, which can say more about it.
    if (centre.level !== 'stroke') {
      gaps.push({
        bucket: 'inward',
        level: centre.level,
        reason: 'atomic',
        detail: 'This is the innermost level of the ladder.',
      });
    }
  } else if (!present.has(`inward|${nominalInward}`)) {
    gaps.push({
      bucket: 'inward',
      level: nominalInward,
      reason: nominalInward === 'collocation' ? unpopulated(ladder) : 'no_data',
      detail:
        nominalInward === 'collocation'
          ? COLLOCATION_DETAIL
          : `The Atlas records nothing at the ${nominalInward} level inside this node${
              hasBucket('inward') ? ', though there is something further in' : ''
            }.`,
    });
  }

  const nominalOutward = levelOutwardOf(centre.level);
  if (nominalOutward === null) {
    gaps.push({
      bucket: 'outward',
      level: centre.level,
      reason: 'ceiling',
      detail:
        'A sentence is the outermost level of this ladder. Anything larger is a passage, which the map handles rather than the dive.',
    });
  } else if (!present.has(`outward|${nominalOutward}`)) {
    gaps.push({
      bucket: 'outward',
      level: nominalOutward,
      reason: nominalOutward === 'collocation' ? unpopulated(ladder) : 'no_data',
      detail:
        nominalOutward === 'collocation'
          ? COLLOCATION_DETAIL
          : `The Atlas records nothing at the ${nominalOutward} level around this node${
              hasBucket('outward') ? ', though there is something further out' : ''
            }.`,
    });
  }

  return gaps;
}

const COLLOCATION_DETAIL =
  'No source in this build declares collocations, so the phrase level is empty everywhere rather than empty here. JMdict carries headwords, readings, senses and part-of-speech tags and no phrase inventory; nothing derives one, because every such rule would be an invention.';

function unpopulated(ladder: ScaleLadder): ScaleGapReason {
  return ladder.collocations.size === 0 ? 'level_unpopulated' : 'no_data';
}

/* ------------------------------------------------------------------ *
 * Reading a view
 * ------------------------------------------------------------------ */

/** The ring of one bucket at one level, or `null`. */
export function ringOf(
  view: ScaleView,
  bucket: RelationBucket,
  level: ScaleLevel,
): ScaleRing | null {
  return view.rings.find((ring) => ring.bucket === bucket && ring.level === level) ?? null;
}

/** Every relation in one bucket, nearest level first. */
export function bucketOf(view: ScaleView, bucket: RelationBucket): readonly ScaleRelation[] {
  return view.rings.filter((ring) => ring.bucket === bucket).flatMap((ring) => ring.members);
}

/**
 * Whether the centre has anywhere to go in a direction.
 *
 * What a surface needs to decide whether a zoom gesture is available, without
 * having to know that "no ring" and "an empty ring" are the same answer.
 */
export function canZoom(view: ScaleView, bucket: RelationBucket): boolean {
  return view.rings.some((ring) => ring.bucket === bucket && ring.members.length > 0);
}

/** The graph node ids in a view, for a caller joining against another index. */
export function viewGraphNodeIds(view: ScaleView): readonly GraphNodeId[] {
  const ids = new Set<GraphNodeId>();
  if (view.centre !== null && view.centre.graphKind !== null) ids.add(view.centre.id);
  for (const ring of view.rings) {
    for (const member of ring.members) {
      if (member.node.graphKind !== null) ids.add(member.node.id);
      for (const inner of member.preview) {
        if (inner.graphKind !== null) ids.add(inner.id);
      }
    }
  }
  return [...ids].sort();
}
