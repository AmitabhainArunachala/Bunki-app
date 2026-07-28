/**
 * Building the index the map queries (Campaign E / A2).
 *
 * The whole performance story of the map lives in this file. `buildKnowledgeGraph`
 * is paid once per dataset; every neighbourhood query afterwards touches only
 * the entries it returns, because the adjacency lists are materialised and
 * pre-sorted here. Over the 3,000-lexeme dictionary tier that is the difference
 * between a map that settles and a map that scans the dictionary each time a
 * finger moves.
 *
 * ## Nothing is silently dropped
 *
 * A dangling edge — one naming a node the source did not declare — is a real
 * defect in an assembled dataset, and it is also the kind of defect that makes
 * a map *quietly* incomplete: the compound simply is not there, and nobody can
 * tell whether the word has no compounds or the edge was mistyped. So dangling
 * edges are excluded from the adjacency (a walk cannot land on a node that does
 * not exist) and reported on {@link KnowledgeGraph.diagnostics}, where a build
 * check or a debug screen can see them.
 *
 * Duplicate nodes are the same story: last-wins would make the result depend on
 * input order, which is exactly what this package promises it never does. The
 * first declaration wins — first in the caller's own array, which is a stable
 * property of the source — and the collision is reported.
 *
 * Duplicate *edges* are the third case, and the one with a visible consequence:
 * a repeated `contains` edge pushes a second adjacency entry, and the kanji page
 * then renders the same compound twice. A learner reading "this kanji appears in
 * 分岐, 分岐, 分点" is being told something false about the dictionary by a bug in
 * the indexer. So a second declaration of an edge already seen is dropped from
 * the adjacency, reported as `duplicate_edge`, and not counted again in
 * {@link KnowledgeGraph.edgeCount} — the count is edges in the index, and it
 * would be a strange number if it disagreed with what the walk can reach.
 *
 * ## Purity
 *
 * No clock, no randomness, no ambient anything; `test/purity` scans for all
 * three. Two calls with equal input produce deeply equal output, and the
 * ordering is fixed by `compareAdjacency` rather than by insertion.
 */

import {
  compareAdjacency,
  isSymmetricEdgeKind,
  type Adjacency,
  type ComponentRole,
  type GraphEdge,
  type GraphNode,
  type GraphNodeId,
  type GraphNodeKind,
  type KnowledgeGraphSource,
} from './model.ts';

export const GRAPH_DIAGNOSTIC_KINDS = [
  'duplicate_node',
  'duplicate_edge',
  'dangling_edge',
  'self_edge',
] as const;

export type GraphDiagnosticKind = (typeof GRAPH_DIAGNOSTIC_KINDS)[number];

/** One thing about the source that a reader should know. Data, not a throw. */
export interface GraphDiagnostic {
  readonly kind: GraphDiagnosticKind;
  readonly detail: string;
}

export interface KnowledgeGraph {
  /** Node lookup by id. */
  readonly nodes: ReadonlyMap<GraphNodeId, GraphNode>;
  /** Pre-sorted adjacency, by {@link compareAdjacency}. Never mutated after build. */
  readonly adjacency: ReadonlyMap<GraphNodeId, readonly Adjacency[]>;
  /** Node ids per kind, ascending byte order — the Observatory's filter index. */
  readonly byKind: ReadonlyMap<GraphNodeKind, readonly GraphNodeId[]>;
  /**
   * Every `KnowledgeComponent` id declared by a node, mapped to the nodes that
   * declared it. This is the Atlas→Trace join, precomputed: given a memory state
   * the map can find its node without scanning.
   */
  readonly nodesByComponentId: ReadonlyMap<string, readonly GraphNodeId[]>;
  readonly edgeCount: number;
  readonly diagnostics: readonly GraphDiagnostic[];
}

/**
 * The identity of an edge, for duplicate detection.
 *
 * A symmetric kind is keyed on the *unordered* pair, because `末 contrasts_with
 * 未` and `未 contrasts_with 末` are one edge — the index already reports a
 * single declaration from both ends, so admitting both would double the contrast
 * set. An asymmetric kind keeps its direction: `contains` from a sentence to a
 * lexeme and from that lexeme to the sentence are two different claims, and only
 * one of them is right, which is not this function's argument to settle.
 *
 * `\u0000` separates the parts because it is the one character a node id cannot
 * contain, so two different edges can never collide on one key. Written as an
 * escape rather than as a raw byte: a literal NUL makes the file binary to
 * `git diff`, and a separator nobody can see in review is a separator nobody can
 * check.
 */
function edgeIdentity(edge: GraphEdge): string {
  if (isSymmetricEdgeKind(edge.kind) && edge.to < edge.from) {
    return `${edge.kind}\u0000${edge.to}\u0000${edge.from}`;
  }
  return `${edge.kind}\u0000${edge.from}\u0000${edge.to}`;
}

function pushAdjacency(
  into: Map<GraphNodeId, Adjacency[]>,
  from: GraphNodeId,
  entry: Adjacency,
): void {
  const list = into.get(from);
  if (list === undefined) {
    into.set(from, [entry]);
    return;
  }
  list.push(entry);
}

/**
 * Index a source into a queryable graph.
 *
 * O(N + E log E) — every adjacency list is sorted once. The sort is what buys
 * the deterministic walk later, and doing it here rather than per query is what
 * keeps the map interactive.
 */
export function buildKnowledgeGraph(source: KnowledgeGraphSource): KnowledgeGraph {
  const nodes = new Map<GraphNodeId, GraphNode>();
  const diagnostics: GraphDiagnostic[] = [];

  source.nodes.forEach((node) => {
    if (nodes.has(node.id)) {
      diagnostics.push({
        kind: 'duplicate_node',
        detail: `node id ${JSON.stringify(node.id)} was declared more than once; the first declaration is kept so the index does not depend on input order`,
      });
      return;
    }
    nodes.set(node.id, node);
  });

  const adjacency = new Map<GraphNodeId, Adjacency[]>();
  const seenEdges = new Map<string, ComponentRole | null>();
  let edgeCount = 0;

  source.edges.forEach((edge) => {
    const fromExists = nodes.has(edge.from);
    const toExists = nodes.has(edge.to);
    if (!fromExists || !toExists) {
      const missing = !fromExists && !toExists ? 'both ends' : !fromExists ? 'from' : 'to';
      diagnostics.push({
        kind: 'dangling_edge',
        detail: `${edge.kind} edge ${JSON.stringify(edge.from)} → ${JSON.stringify(edge.to)} names an undeclared node (${missing}); it is excluded from the walk`,
      });
      return;
    }
    if (edge.from === edge.to) {
      diagnostics.push({
        kind: 'self_edge',
        detail: `${edge.kind} edge from ${JSON.stringify(edge.from)} to itself is excluded; a node is not its own neighbour`,
      });
      return;
    }

    const role = edge.role ?? null;
    const identity = edgeIdentity(edge);
    if (seenEdges.has(identity)) {
      const firstRole = seenEdges.get(identity) ?? null;
      const roleNote =
        firstRole === role
          ? 'the second declaration is dropped'
          : `the second declaration carries role ${JSON.stringify(role)} where the first carried ${JSON.stringify(firstRole)}; the first is kept, so the source disagrees with itself and only the first answer is rendered`;
      diagnostics.push({
        kind: 'duplicate_edge',
        detail: `${edge.kind} edge ${JSON.stringify(edge.from)} → ${JSON.stringify(edge.to)} was declared more than once; ${roleNote}. A repeated edge would otherwise put the same neighbour in a rendered group twice`,
      });
      return;
    }
    seenEdges.set(identity, role);

    edgeCount += 1;

    if (isSymmetricEdgeKind(edge.kind)) {
      pushAdjacency(adjacency, edge.from, {
        kind: edge.kind,
        direction: 'symmetric',
        other: edge.to,
        role,
      });
      pushAdjacency(adjacency, edge.to, {
        kind: edge.kind,
        direction: 'symmetric',
        other: edge.from,
        role,
      });
      return;
    }

    pushAdjacency(adjacency, edge.from, {
      kind: edge.kind,
      direction: 'outgoing',
      other: edge.to,
      role,
    });
    pushAdjacency(adjacency, edge.to, {
      kind: edge.kind,
      direction: 'incoming',
      other: edge.from,
      role,
    });
  });

  const frozenAdjacency = new Map<GraphNodeId, readonly Adjacency[]>();
  adjacency.forEach((list, id) => {
    list.sort(compareAdjacency);
    frozenAdjacency.set(id, Object.freeze(list));
  });

  const byKindMutable = new Map<GraphNodeKind, GraphNodeId[]>();
  const byComponentMutable = new Map<string, GraphNodeId[]>();

  nodes.forEach((node) => {
    const kindList = byKindMutable.get(node.kind);
    if (kindList === undefined) byKindMutable.set(node.kind, [node.id]);
    else kindList.push(node.id);

    node.componentIds.forEach((componentId) => {
      const componentList = byComponentMutable.get(componentId);
      if (componentList === undefined) byComponentMutable.set(componentId, [node.id]);
      else componentList.push(node.id);
    });
  });

  const byKind = new Map<GraphNodeKind, readonly GraphNodeId[]>();
  byKindMutable.forEach((list, kind) => {
    list.sort();
    byKind.set(kind, Object.freeze(list));
  });

  const nodesByComponentId = new Map<string, readonly GraphNodeId[]>();
  byComponentMutable.forEach((list, componentId) => {
    list.sort();
    nodesByComponentId.set(componentId, Object.freeze(list));
  });

  return Object.freeze({
    nodes,
    adjacency: frozenAdjacency,
    byKind,
    nodesByComponentId,
    edgeCount,
    diagnostics: Object.freeze(diagnostics),
  });
}

/** The empty graph. Useful as an initial value and as the honest offline state. */
export const EMPTY_KNOWLEDGE_GRAPH: KnowledgeGraph = buildKnowledgeGraph({
  nodes: [],
  edges: [],
});

const EMPTY_ADJACENCY: readonly Adjacency[] = Object.freeze([]);

/** Neighbours of one node, in canonical order. Empty for an unknown id. */
export function adjacencyOf(graph: KnowledgeGraph, id: GraphNodeId): readonly Adjacency[] {
  return graph.adjacency.get(id) ?? EMPTY_ADJACENCY;
}
