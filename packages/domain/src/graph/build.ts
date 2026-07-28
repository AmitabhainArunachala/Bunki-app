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
  type GraphNode,
  type GraphNodeId,
  type GraphNodeKind,
  type KnowledgeGraphSource,
} from './model.ts';

/** One thing about the source that a reader should know. Data, not a throw. */
export interface GraphDiagnostic {
  readonly kind: 'duplicate_node' | 'dangling_edge' | 'self_edge';
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

    edgeCount += 1;
    const role = edge.role ?? null;

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
