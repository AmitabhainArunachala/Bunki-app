/**
 * The index is deterministic, total, and honest about its input
 * (Campaign E / A2).
 */

import { describe, expect, it } from 'vitest';

import {
  adjacencyOf,
  buildKnowledgeGraph,
  compareAdjacency,
  EMPTY_KNOWLEDGE_GRAPH,
  edgeKindRank,
  GRAPH_EDGE_KINDS,
  isSymmetricEdgeKind,
  SYMMETRIC_EDGE_KINDS,
  type GraphEdge,
  type GraphNode,
} from '../../src/index.ts';
import { SEED_SHAPED_SOURCE } from './support.ts';

describe('buildKnowledgeGraph', () => {
  it('indexes every declared node and both readings of every edge', () => {
    const graph = buildKnowledgeGraph(SEED_SHAPED_SOURCE);

    expect(graph.nodes.size).toBe(SEED_SHAPED_SOURCE.nodes.length);
    expect(graph.edgeCount).toBe(SEED_SHAPED_SOURCE.edges.length);
    expect(graph.diagnostics).toEqual([]);

    // 分 → 分岐 is the same edge as 分岐 → 分, read from the other end.
    const fromKanji = adjacencyOf(graph, 'kanji:分').filter(
      (step) => step.other === 'lex-bunki' && step.kind === 'contains',
    );
    const fromLexeme = adjacencyOf(graph, 'lex-bunki').filter(
      (step) => step.other === 'kanji:分' && step.kind === 'contains',
    );
    expect(fromKanji).toHaveLength(1);
    expect(fromLexeme).toHaveLength(1);
    expect(fromKanji[0]?.direction).toBe('incoming');
    expect(fromLexeme[0]?.direction).toBe('outgoing');
  });

  it('reports a symmetric edge from both ends, as symmetric', () => {
    const graph = buildKnowledgeGraph(SEED_SHAPED_SOURCE);
    const forward = adjacencyOf(graph, 'kanji:分').find((step) => step.kind === 'contrasts_with');
    const backward = adjacencyOf(graph, 'kanji:文').find((step) => step.kind === 'contrasts_with');

    expect(forward?.direction).toBe('symmetric');
    expect(backward?.direction).toBe('symmetric');
    expect(forward?.other).toBe('kanji:文');
    expect(backward?.other).toBe('kanji:分');
  });

  it('carries the component role, including "unclassified"', () => {
    const graph = buildKnowledgeGraph(SEED_SHAPED_SOURCE);
    const roles = adjacencyOf(graph, 'kanji:岐')
      .filter((step) => step.kind === 'component_of')
      .map((step) => `${step.other}=${String(step.role)}`)
      .sort();
    expect(roles).toEqual(['component:山=semantic', 'component:支=phonetic']);
  });

  it('does not depend on the order the caller supplied nodes or edges', () => {
    const forward = buildKnowledgeGraph(SEED_SHAPED_SOURCE);
    const reversed = buildKnowledgeGraph({
      nodes: [...SEED_SHAPED_SOURCE.nodes].reverse(),
      edges: [...SEED_SHAPED_SOURCE.edges].reverse(),
    });

    [...forward.nodes.keys()].forEach((id) => {
      expect(adjacencyOf(reversed, id), id).toEqual(adjacencyOf(forward, id));
    });
    expect([...reversed.byKind.entries()].sort()).toEqual([...forward.byKind.entries()].sort());
  });

  it('excludes a dangling edge from the walk and says so', () => {
    const nodes: readonly GraphNode[] = [{ id: 'a', kind: 'kanji', label: 'a', componentIds: [] }];
    const edges: readonly GraphEdge[] = [{ kind: 'contains', from: 'a', to: 'ghost' }];
    const graph = buildKnowledgeGraph({ nodes, edges });

    expect(adjacencyOf(graph, 'a')).toEqual([]);
    expect(graph.edgeCount).toBe(0);
    expect(graph.diagnostics).toHaveLength(1);
    expect(graph.diagnostics[0]?.kind).toBe('dangling_edge');
    expect(graph.diagnostics[0]?.detail).toContain('ghost');
  });

  it('keeps the first of two nodes with one id, and reports the collision', () => {
    const graph = buildKnowledgeGraph({
      nodes: [
        { id: 'a', kind: 'kanji', label: 'first', componentIds: [] },
        { id: 'a', kind: 'lexeme', label: 'second', componentIds: [] },
      ],
      edges: [],
    });
    expect(graph.nodes.get('a')?.label).toBe('first');
    expect(graph.diagnostics[0]?.kind).toBe('duplicate_node');
  });

  it('refuses a self-edge rather than making a node its own neighbour', () => {
    const graph = buildKnowledgeGraph({
      nodes: [{ id: 'a', kind: 'kanji', label: 'a', componentIds: [] }],
      edges: [{ kind: 'contrasts_with', from: 'a', to: 'a' }],
    });
    expect(adjacencyOf(graph, 'a')).toEqual([]);
    expect(graph.diagnostics[0]?.kind).toBe('self_edge');
  });

  it('indexes the Atlas→Trace join by component id', () => {
    const graph = buildKnowledgeGraph(SEED_SHAPED_SOURCE);
    expect(graph.nodesByComponentId.get('kc:分岐')).toEqual(['lex-bunki']);
    expect(graph.nodesByComponentId.get('kc:分')).toEqual(['kanji:分']);
    expect(graph.nodesByComponentId.get('kc:never-captured')).toBeUndefined();
  });

  it('answers an unknown node with an empty adjacency, not a throw', () => {
    expect(adjacencyOf(EMPTY_KNOWLEDGE_GRAPH, 'nope')).toEqual([]);
    expect(EMPTY_KNOWLEDGE_GRAPH.nodes.size).toBe(0);
  });
});

describe('the canonical order', () => {
  it('ranks every edge kind exactly once', () => {
    const ranks = GRAPH_EDGE_KINDS.map(edgeKindRank).sort((left, right) => left - right);
    expect(ranks).toEqual(GRAPH_EDGE_KINDS.map((_, index) => index));
  });

  it('is a total order — reflexive, antisymmetric, and transitive on ties', () => {
    const a = { kind: 'contains', direction: 'outgoing', other: 'x', role: null } as const;
    const b = { kind: 'contains', direction: 'outgoing', other: 'y', role: null } as const;
    expect(compareAdjacency(a, a)).toBe(0);
    expect(compareAdjacency(a, b)).toBeLessThan(0);
    expect(compareAdjacency(b, a)).toBeGreaterThan(0);
  });

  it('names the symmetric kinds and agrees with the predicate', () => {
    GRAPH_EDGE_KINDS.forEach((kind) => {
      expect(isSymmetricEdgeKind(kind)).toBe(SYMMETRIC_EDGE_KINDS.includes(kind));
    });
    expect([...SYMMETRIC_EDGE_KINDS]).toEqual(['contrasts_with', 'collocates_with']);
  });
});
