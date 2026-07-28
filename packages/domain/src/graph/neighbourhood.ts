/**
 * The neighbourhood query — the map's only way of asking "what is near this?"
 * (Campaign E / A2; REQ-UI-07, frozen v1 §2.1, §8).
 *
 * REQ-UI-07's first sentence is the design brief for this file: *"Local
 * neighborhoods are the default working surface."* The global Observatory is a
 * deliberate destination, not the home screen, so the primitive is a bounded
 * walk from one node — not a whole-graph layout that a screen then crops.
 *
 * ## Three bounds, all reported when they bite
 *
 * `depth` bounds how far the walk goes, `maxNodes` bounds how much comes back,
 * and `perGroup` bounds each named bucket a page renders. All three exist
 * because the dictionary tier has hub nodes — the reading ぶん, the component 口,
 * the grammar pattern に — whose unbounded neighbourhood is most of the graph.
 *
 * Every bound that actually bit is recorded in {@link Neighbourhood.truncated}.
 * A map that silently showed 12 of 340 compounds would be telling the learner
 * that this kanji has 12 compounds, which is false in the specific way this
 * codebase spends most of its effort avoiding.
 *
 * ## Deterministic
 *
 * Breadth-first, FIFO, over adjacency lists the build step already sorted. Two
 * calls with the same graph and the same options return deeply equal results,
 * and reordering the source's `edges` array cannot change them. There is no
 * clock and no randomness: an interactive map that re-queried on every frame
 * must not shimmer.
 */

import { adjacencyOf, type KnowledgeGraph } from './build.ts';
import type {
  Adjacency,
  ComponentRole,
  GraphEdgeKind,
  GraphNode,
  GraphNodeId,
  GraphNodeKind,
  TraversalDirection,
} from './model.ts';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * What a caller may ask for — and which half of the result each option governs.
 *
 * The result has two halves: the walk (`nodes` / `edges`) and the named groups.
 * They are not governed identically, and the difference is stated here rather
 * than discovered:
 *
 * | option | walk | groups |
 * | --- | --- | --- |
 * | `depth` | yes | yes — a group is a walk of fixed length, so `depth: 0` empties every group and `depth: 1` empties `readingFamily` |
 * | `edgeKinds` | yes | yes |
 * | `nodeKinds` | yes | yes — including the intermediate `reading` node a family is walked through |
 * | `maxNodes` | yes | **no** — not their membership, their order, or the `depth` each member reports |
 * | `perGroup` | no | yes |
 *
 * `depth`, `edgeKinds` and `nodeKinds` are *filters*: they say which parts of
 * the graph this query is about, and a group that ignored them would answer a
 * different question from the walk beside it. `maxNodes` and `perGroup` are
 * *budgets*, and each has exactly one thing it is a budget for. Letting the
 * whole-walk ceiling reach into the groups would make a kanji page's
 * "components" section depend on how many compounds the word happens to have,
 * which is a coupling nobody could predict from the call site; that is why
 * `maxNodes` stops at the walk and `perGroup` — reported through
 * {@link Truncation} whenever it bites — is what bounds a page section.
 *
 * The `maxNodes` row is enforced structurally rather than promised: the group
 * collector is not given the walk's bounded depth map at all, and measures its
 * members' distance from the origin's adjacency itself. It used to be given
 * that map, and the promise above was false in three ways at once — a member
 * one hop from the origin reported depth 2 whenever the ceiling had refused it,
 * {@link GroupMember} ordering is by depth, and so under `perGroup` the member
 * a page *showed* changed with a budget that has nothing to do with it.
 */
export interface NeighbourhoodOptions {
  /** Hops from the origin. 0 returns the origin alone, and empties every group. */
  readonly depth?: number;
  /** Hard ceiling on returned nodes, origin included. Bounds the walk only. */
  readonly maxNodes?: number;
  /** Ceiling per named group. Bounds the groups only. */
  readonly perGroup?: number;
  /** Restrict to these edge kinds. Omit for all of them. Applies to walk and groups. */
  readonly edgeKinds?: readonly GraphEdgeKind[];
  /**
   * Restrict to these node kinds. The origin is always included. Applies to walk
   * and groups — a `readingFamily` is walked *through* a `reading` node, so
   * excluding that kind empties the family rather than tunnelling under the
   * restriction.
   */
  readonly nodeKinds?: readonly GraphNodeKind[];
}

/**
 * The defaults a map screen gets if it asks for nothing.
 *
 * Depth 2 is not arbitrary: it is exactly the distance at which the
 * interesting relations live. A kanji's components are one hop; the words
 * sharing its reading are two (kanji → reading → word), and so are the other
 * kanji of a compound (kanji → word → kanji). Depth 3 crosses into "most of
 * the dictionary" on any hub node, which is the Observatory's job, not a local
 * neighbourhood's.
 */
export const DEFAULT_NEIGHBOURHOOD_OPTIONS = Object.freeze({
  depth: 2,
  maxNodes: 120,
  perGroup: 24,
});

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

/** One node in the returned subgraph, with how far away it is. */
export interface NeighbourhoodNode {
  readonly node: GraphNode;
  readonly depth: number;
}

/** One edge in the returned subgraph, both of whose ends were returned. */
export interface NeighbourhoodEdge {
  readonly kind: GraphEdgeKind;
  readonly direction: TraversalDirection;
  readonly from: GraphNodeId;
  readonly to: GraphNodeId;
  readonly role: ComponentRole | null;
}

export const TRUNCATION_CAUSES = ['max_nodes', 'per_group', 'depth'] as const;
export type TruncationCause = (typeof TRUNCATION_CAUSES)[number];

/** A bound that bit, named so a surface can say so out loud. */
export interface Truncation {
  readonly cause: TruncationCause;
  /** The group it applied to, or `null` for a whole-walk bound. */
  readonly group: NeighbourhoodGroupName | null;
  readonly limit: number;
  /** How many were available before the bound applied. */
  readonly available: number;
  readonly detail: string;
}

/**
 * One member of a named group, with the path that put it there.
 *
 * `via` is the intermediate node — the shared reading for a reading family, the
 * compound for a co-occurring kanji. It is the group's provenance: "these words
 * are related" is a claim, and `via: reading:ぶん` is the reason for it, which
 * is the difference between a map and a mood board.
 *
 * `depth` is how many admitted hops this member is from the origin: 1 for a
 * direct neighbour, 2 for a reading-family sibling that is not also a direct
 * neighbour. It is a fact about the graph under this query's *filters* and
 * about nothing else — in particular it does not move when `maxNodes` changes,
 * because a member's distance from the origin is not a function of how many
 * nodes the caller was willing to receive.
 */
export interface GroupMember {
  readonly node: GraphNode;
  readonly depth: number;
  readonly via: GraphNodeId | null;
  readonly role: ComponentRole | null;
}

export const NEIGHBOURHOOD_GROUP_NAMES = [
  'components',
  'compounds',
  'constituents',
  'readingFamily',
  'contrasts',
  'collocations',
  'senses',
  'constructions',
  'sentences',
  'encounters',
] as const;

export type NeighbourhoodGroupName = (typeof NEIGHBOURHOOD_GROUP_NAMES)[number];

/**
 * The buckets a kanji page, a word page, and a node's map card render.
 *
 * Named rather than derived from edge kinds because the learner-facing question
 * is not "which edges point here" — it is "what is this made of, what is it
 * part of, what sounds like it, what is it confusable with, and where did I
 * meet it". The mapping from that question to edges is this file's job.
 */
export type NeighbourhoodGroups = Readonly<Record<NeighbourhoodGroupName, readonly GroupMember[]>>;

export interface Neighbourhood {
  /** `null` when the id is not in the graph — an honest empty, not a throw. */
  readonly origin: GraphNode | null;
  readonly depth: number;
  readonly nodes: readonly NeighbourhoodNode[];
  readonly edges: readonly NeighbourhoodEdge[];
  readonly groups: NeighbourhoodGroups;
  readonly truncated: readonly Truncation[];
}

function emptyGroups(): NeighbourhoodGroups {
  const groups: Partial<Record<NeighbourhoodGroupName, readonly GroupMember[]>> = {};
  NEIGHBOURHOOD_GROUP_NAMES.forEach((name) => {
    groups[name] = Object.freeze([]);
  });
  return Object.freeze(groups) as NeighbourhoodGroups;
}

const EMPTY_GROUPS = emptyGroups();

export const EMPTY_NEIGHBOURHOOD: Neighbourhood = Object.freeze({
  origin: null,
  depth: 0,
  nodes: Object.freeze([]),
  edges: Object.freeze([]),
  groups: EMPTY_GROUPS,
  truncated: Object.freeze([]),
});

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

interface WalkEntry {
  readonly id: GraphNodeId;
  readonly depth: number;
}

/**
 * Bounded breadth-first neighbourhood.
 *
 * The queue is FIFO and the adjacency is pre-sorted, so the visit order is a
 * function of the graph alone. When `maxNodes` bites, the nodes that survive are
 * the nearest ones in canonical order — which is the right thing to drop to,
 * because a local neighbourhood that discarded its own first ring would not be
 * local.
 */
export function neighbourhoodOf(
  graph: KnowledgeGraph,
  originId: GraphNodeId,
  options: NeighbourhoodOptions = {},
): Neighbourhood {
  const origin = graph.nodes.get(originId);
  if (origin === undefined) return EMPTY_NEIGHBOURHOOD;

  const depthLimit = Math.max(0, options.depth ?? DEFAULT_NEIGHBOURHOOD_OPTIONS.depth);
  const maxNodes = Math.max(1, options.maxNodes ?? DEFAULT_NEIGHBOURHOOD_OPTIONS.maxNodes);
  const perGroup = Math.max(0, options.perGroup ?? DEFAULT_NEIGHBOURHOOD_OPTIONS.perGroup);
  const edgeKinds = options.edgeKinds === undefined ? null : new Set(options.edgeKinds);
  const nodeKinds = options.nodeKinds === undefined ? null : new Set(options.nodeKinds);

  const depthById = new Map<GraphNodeId, number>([[originId, 0]]);
  const order: WalkEntry[] = [{ id: originId, depth: 0 }];
  const truncated: Truncation[] = [];

  let cursor = 0;
  let capacityRefused = 0;

  while (cursor < order.length) {
    const current = order[cursor];
    cursor += 1;
    if (current === undefined) break;
    if (current.depth >= depthLimit) continue;

    for (const step of adjacencyOf(graph, current.id)) {
      if (edgeKinds !== null && !edgeKinds.has(step.kind)) continue;
      const neighbour = graph.nodes.get(step.other);
      if (neighbour === undefined) continue;
      if (nodeKinds !== null && !nodeKinds.has(neighbour.kind)) continue;
      if (depthById.has(step.other)) continue;

      if (order.length >= maxNodes) {
        capacityRefused += 1;
        continue;
      }
      depthById.set(step.other, current.depth + 1);
      order.push({ id: step.other, depth: current.depth + 1 });
    }
  }

  if (capacityRefused > 0) {
    truncated.push({
      cause: 'max_nodes',
      group: null,
      limit: maxNodes,
      available: maxNodes + capacityRefused,
      detail: `the walk reached its ${maxNodes}-node ceiling; at least ${capacityRefused} further neighbour${capacityRefused === 1 ? '' : 's'} within depth ${depthLimit} are not shown`,
    });
  }

  // The depth bound only counts as a truncation when it actually hid something.
  // Reporting it whenever a node sits at the limit would make the map claim
  // there is more to see wherever the neighbourhood happens to end, which is the
  // same dishonesty as hiding a cut, pointing the other way.
  const frontierWithMore = countFrontierWithUnexplored(
    graph,
    order,
    depthById,
    depthLimit,
    edgeKinds,
    nodeKinds,
  );
  if (frontierWithMore > 0) {
    truncated.push({
      cause: 'depth',
      group: null,
      limit: depthLimit,
      available: frontierWithMore,
      detail: `${frontierWithMore} node${frontierWithMore === 1 ? ' at the edge of this view has' : 's at the edge of this view have'} further connections; anything beyond ${depthLimit} hop${depthLimit === 1 ? '' : 's'} is not shown`,
    });
  }

  const nodes: NeighbourhoodNode[] = order.map((entry) => ({
    // Non-null: every id in `order` was resolved through `graph.nodes` above.
    node: graph.nodes.get(entry.id) as GraphNode,
    depth: entry.depth,
  }));
  nodes.sort((left, right) => {
    if (left.depth !== right.depth) return left.depth - right.depth;
    if (left.node.id < right.node.id) return -1;
    if (left.node.id > right.node.id) return 1;
    return 0;
  });

  const included = new Set(order.map((entry) => entry.id));
  const edges = collectEdges(graph, included, edgeKinds);
  const groups = collectGroups(graph, origin, perGroup, truncated, {
    depthLimit,
    edgeKinds,
    nodeKinds,
  });

  return Object.freeze({
    origin,
    depth: depthLimit,
    nodes: Object.freeze(nodes),
    edges,
    groups,
    truncated: Object.freeze(truncated),
  });
}

/**
 * How many returned nodes have a neighbour this walk did not reach.
 *
 * Early-exits per node — the claim is "these nodes have more", not "there are
 * exactly N hidden nodes", so one hit per frontier node is all that is needed
 * and a reading hub at the edge does not cost a thousand iterations to
 * describe.
 */
function countFrontierWithUnexplored(
  graph: KnowledgeGraph,
  order: readonly WalkEntry[],
  depthById: ReadonlyMap<GraphNodeId, number>,
  depthLimit: number,
  edgeKinds: ReadonlySet<GraphEdgeKind> | null,
  nodeKinds: ReadonlySet<GraphNodeKind> | null,
): number {
  let count = 0;
  for (const entry of order) {
    if (entry.depth < depthLimit) continue;
    for (const step of adjacencyOf(graph, entry.id)) {
      if (edgeKinds !== null && !edgeKinds.has(step.kind)) continue;
      const neighbour = graph.nodes.get(step.other);
      if (neighbour === undefined) continue;
      if (nodeKinds !== null && !nodeKinds.has(neighbour.kind)) continue;
      if (depthById.has(step.other)) continue;
      count += 1;
      break;
    }
  }
  return count;
}

/**
 * The induced sub-edge set: every edge whose *both* ends were returned.
 *
 * Read once per included node and de-duplicated on the canonical
 * `from → to` pair, so an undirected pair appears once rather than twice and a
 * renderer never draws a doubled line.
 */
function collectEdges(
  graph: KnowledgeGraph,
  included: ReadonlySet<GraphNodeId>,
  edgeKinds: ReadonlySet<GraphEdgeKind> | null,
): readonly NeighbourhoodEdge[] {
  const seen = new Set<string>();
  const edges: NeighbourhoodEdge[] = [];

  included.forEach((id) => {
    for (const step of adjacencyOf(graph, id)) {
      if (edgeKinds !== null && !edgeKinds.has(step.kind)) continue;
      if (!included.has(step.other)) continue;

      const from = step.direction === 'incoming' ? step.other : id;
      const to = step.direction === 'incoming' ? id : step.other;
      // `\u0000` as the separator because it is the one character a node id
      // cannot contain, so two different edges can never collide on one key.
      // Written as an escape rather than as a raw byte: a literal NUL makes the
      // file binary to `git diff`, and a separator nobody can see in review is
      // a separator nobody can check.
      const canonical =
        step.direction === 'symmetric' && to < from
          ? `${step.kind}\u0000${to}\u0000${from}`
          : `${step.kind}\u0000${from}\u0000${to}`;
      if (seen.has(canonical)) continue;
      seen.add(canonical);

      edges.push({
        kind: step.kind,
        direction: step.direction,
        from: step.direction === 'symmetric' && to < from ? to : from,
        to: step.direction === 'symmetric' && to < from ? from : to,
        role: step.role,
      });
    }
  });

  edges.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind < right.kind ? -1 : 1;
    if (left.from !== right.from) return left.from < right.from ? -1 : 1;
    if (left.to !== right.to) return left.to < right.to ? -1 : 1;
    return 0;
  });

  return Object.freeze(edges);
}

// ---------------------------------------------------------------------------
// The named groups
// ---------------------------------------------------------------------------

interface GroupRule {
  readonly name: NeighbourhoodGroupName;
  readonly kind: GraphEdgeKind;
  readonly direction: TraversalDirection;
  /** Node kinds admitted into the group; `null` admits any. */
  readonly memberKinds: readonly GraphNodeKind[] | null;
}

/**
 * One-hop groups, as rules rather than as code.
 *
 * Each line is a sentence from the kanji-page spec (frozen v1 §5) turned into
 * an edge query: *what it is made of* (incoming `component_of`), *what it
 * appears in* (incoming `contains` from a lexeme), *what it is made of at the
 * next level down* (outgoing `contains`), the confusables of §10.5, the senses,
 * the constructions, the sentences, and the encounters.
 */
const ONE_HOP_GROUPS: readonly GroupRule[] = Object.freeze([
  { name: 'components', kind: 'component_of', direction: 'incoming', memberKinds: null },
  { name: 'compounds', kind: 'contains', direction: 'incoming', memberKinds: ['lexeme'] },
  {
    name: 'constituents',
    kind: 'contains',
    direction: 'outgoing',
    memberKinds: ['kanji', 'component', 'lexeme'],
  },
  { name: 'contrasts', kind: 'contrasts_with', direction: 'symmetric', memberKinds: null },
  { name: 'collocations', kind: 'collocates_with', direction: 'symmetric', memberKinds: null },
  { name: 'senses', kind: 'has_sense', direction: 'outgoing', memberKinds: ['sense'] },
  {
    name: 'constructions',
    kind: 'realises',
    direction: 'outgoing',
    memberKinds: ['grammar_construction'],
  },
  { name: 'sentences', kind: 'contains', direction: 'incoming', memberKinds: ['sentence'] },
  { name: 'encounters', kind: 'appeared_in', direction: 'outgoing', memberKinds: ['encounter'] },
]);

function matchesRule(step: Adjacency, rule: GroupRule, neighbour: GraphNode): boolean {
  if (step.kind !== rule.kind) return false;
  if (step.direction !== rule.direction) return false;
  if (rule.memberKinds !== null && !rule.memberKinds.includes(neighbour.kind)) return false;
  return true;
}

/**
 * The filter half of {@link NeighbourhoodOptions}, resolved.
 *
 * Passed as one object so that adding a filter to the options cannot be applied
 * to the walk and forgotten in the groups — the compiler asks for it in both
 * places. That asymmetry was a real defect: the groups used to read the origin's
 * adjacency directly and applied none of `depth`, `edgeKinds` or `nodeKinds`, so
 * a caller who restricted a query got a walk that honoured the restriction and a
 * set of groups beside it that did not, with nothing saying so.
 */
interface GroupFilters {
  readonly depthLimit: number;
  readonly edgeKinds: ReadonlySet<GraphEdgeKind> | null;
  readonly nodeKinds: ReadonlySet<GraphNodeKind> | null;
}

function admits(filters: GroupFilters, step: Adjacency, neighbour: GraphNode): boolean {
  if (filters.edgeKinds !== null && !filters.edgeKinds.has(step.kind)) return false;
  if (filters.nodeKinds !== null && !filters.nodeKinds.has(neighbour.kind)) return false;
  return true;
}

/**
 * The named groups, measured from the graph rather than read off the walk.
 *
 * This function is deliberately *not* handed the walk's `depthById`. That map is
 * bounded by `maxNodes`, and every use of it here would have leaked the walk's
 * budget into the groups — which is exactly what the table on
 * {@link NeighbourhoodOptions} says does not happen. The one thing it was used
 * for is a member's `depth`, and that is cheaper to get right: under this
 * query's filters a group member is one hop away iff it is an admitted
 * neighbour of the origin, and a reading-family sibling that is not is two.
 * Both facts come out of the origin's own adjacency, which this function reads
 * anyway.
 */
function collectGroups(
  graph: KnowledgeGraph,
  origin: GraphNode,
  perGroup: number,
  truncated: Truncation[],
  filters: GroupFilters,
): NeighbourhoodGroups {
  const collected = new Map<NeighbourhoodGroupName, GroupMember[]>();
  NEIGHBOURHOOD_GROUP_NAMES.forEach((name) => collected.set(name, []));

  // Every group is at least one hop, so `depth: 0` — "the origin alone" — leaves
  // all of them empty rather than quietly returning a ring the walk refused.
  if (filters.depthLimit < 1) return freezeGroups(collected, perGroup, truncated);

  /** Everything exactly one admitted hop from the origin. The family needs it. */
  const oneHop = new Set<GraphNodeId>();

  for (const step of adjacencyOf(graph, origin.id)) {
    const neighbour = graph.nodes.get(step.other);
    if (neighbour === undefined) continue;
    if (!admits(filters, step, neighbour)) continue;
    if (neighbour.id !== origin.id) oneHop.add(neighbour.id);
    ONE_HOP_GROUPS.forEach((rule) => {
      if (!matchesRule(step, rule, neighbour)) return;
      collected.get(rule.name)?.push({
        node: neighbour,
        depth: 1,
        via: null,
        role: step.role,
      });
    });
  }

  // The reading family is the one two-hop group, so it needs the depth for both
  // hops before it can be walked at all.
  if (filters.depthLimit >= 2) collectReadingFamily(graph, origin, oneHop, collected, filters);

  return freezeGroups(collected, perGroup, truncated);
}

function freezeGroups(
  collected: Map<NeighbourhoodGroupName, GroupMember[]>,
  perGroup: number,
  truncated: Truncation[],
): NeighbourhoodGroups {
  const groups: Partial<Record<NeighbourhoodGroupName, readonly GroupMember[]>> = {};
  NEIGHBOURHOOD_GROUP_NAMES.forEach((name) => {
    const members = collected.get(name) ?? [];
    members.sort(compareGroupMembers);
    if (members.length > perGroup) {
      truncated.push({
        cause: 'per_group',
        group: name,
        limit: perGroup,
        available: members.length,
        detail: `${name} has ${members.length} member${members.length === 1 ? '' : 's'}; ${perGroup} are shown`,
      });
      groups[name] = Object.freeze(members.slice(0, perGroup));
      return;
    }
    groups[name] = Object.freeze(members);
  });

  return Object.freeze(groups) as NeighbourhoodGroups;
}

/**
 * The reading family: two hops through a shared `reading` node.
 *
 * This is the one group that is not a single edge, and it is the one the
 * operator's own reference pair (frozen v1 §10.5) is about — 分/文/聞 are a
 * family because they *sound* alike, and the shared reading is the reason. It
 * is carried on `via` so a surface can say "shares ブン" rather than asserting a
 * bare relatedness.
 *
 * The origin itself is excluded (a node is not in its own family), and so are
 * nodes reachable by a single `has_reading` edge from the origin — those are
 * the readings, not the family.
 *
 * Both hops are filtered, including the intermediate `reading` node: a caller
 * who excluded `reading` from `nodeKinds` asked for a query that does not go
 * through readings, and a family that tunnelled under that restriction would be
 * reporting a relation the same call said it did not want. The second
 * {@link admits} call — the one on the sibling — is not redundant with the
 * first: both hops are `has_reading`, so the `edgeKinds` half is already
 * settled, but a sibling of an excluded *node* kind is rejected only there.
 *
 * `oneHop` is how a sibling's depth is decided. A family member is two hops
 * *through the reading*, but a node can be in the family and also be a direct
 * neighbour by some other admitted edge — 分 and 文 share ブン and are declared
 * `contrasts_with` — and the honest distance is the shorter one.
 */
function collectReadingFamily(
  graph: KnowledgeGraph,
  origin: GraphNode,
  oneHop: ReadonlySet<GraphNodeId>,
  collected: Map<NeighbourhoodGroupName, GroupMember[]>,
  filters: GroupFilters,
): void {
  const family = collected.get('readingFamily');
  if (family === undefined) return;
  const seen = new Set<GraphNodeId>([origin.id]);

  for (const step of adjacencyOf(graph, origin.id)) {
    if (step.kind !== 'has_reading' || step.direction !== 'outgoing') continue;
    const readingId = step.other;
    const readingNode = graph.nodes.get(readingId);
    if (readingNode === undefined) continue;
    if (!admits(filters, step, readingNode)) continue;

    for (const back of adjacencyOf(graph, readingId)) {
      if (back.kind !== 'has_reading' || back.direction !== 'incoming') continue;
      if (seen.has(back.other)) continue;
      const sibling = graph.nodes.get(back.other);
      if (sibling === undefined) continue;
      if (!admits(filters, back, sibling)) continue;
      seen.add(back.other);
      family.push({
        node: sibling,
        depth: oneHop.has(sibling.id) ? 1 : 2,
        via: readingId,
        role: null,
      });
    }
  }
}

function compareGroupMembers(left: GroupMember, right: GroupMember): number {
  if (left.depth !== right.depth) return left.depth - right.depth;
  if (left.node.id < right.node.id) return -1;
  if (left.node.id > right.node.id) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Convenience reads a surface actually makes
// ---------------------------------------------------------------------------

/** The named group, or an empty list. Never `undefined`, never a throw. */
export function groupOf(
  neighbourhood: Neighbourhood,
  name: NeighbourhoodGroupName,
): readonly GroupMember[] {
  return neighbourhood.groups[name];
}

/** Did any bound bite? A surface that shows counts must be able to ask. */
export function wasTruncated(neighbourhood: Neighbourhood): boolean {
  return neighbourhood.truncated.length > 0;
}
