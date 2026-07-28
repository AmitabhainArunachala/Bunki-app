/**
 * The projections stay interactive over the full dictionary tier
 * (Campaign E / A2; REQ-UI-07 "zoom, filter, search, tap into threads").
 *
 * ## What a performance test can and cannot claim
 *
 * Wall-clock budgets on shared CI are noisy, so the assertions below are
 * deliberately two-layered:
 *
 *   1. **Generous absolute ceilings.** They catch an accidental O(N) scan per
 *      query — the actual regression risk — and are far enough above the
 *      observed cost that ordinary machine variance cannot reach them.
 *   2. **A scaling assertion**, which is the real claim: a neighbourhood query
 *      costs the same over 3,000 lexemes as over 300, because the walk touches
 *      only what it returns. A change that made queries proportional to graph
 *      size would fail this even on a fast machine.
 *
 * The tier is generated deterministically (see `support.ts`), so a slow run is
 * a regression and never a differently-shaped graph.
 */

import { describe, expect, it } from 'vitest';

import {
  buildKnowledgeGraph,
  buildRetrievabilityIndex,
  initialMemoryState,
  neighbourhoodOf,
  projectRetrievability,
  type MemoryState,
  type ProjectedContract,
} from '../../src/index.ts';
import { buildDictionaryTierGraph, instant } from './support.ts';

function elapsedMs(run: () => void): number {
  const started = Date.now();
  run();
  return Date.now() - started;
}

const LEXEME_COUNT = 3000;
const tier = buildDictionaryTierGraph(LEXEME_COUNT);

describe('the dictionary tier', () => {
  it('is the size the campaign brief names', () => {
    expect(tier.lexemeIds).toHaveLength(LEXEME_COUNT);
    expect(tier.source.nodes.length).toBeGreaterThan(5000);
    expect(tier.source.edges.length).toBeGreaterThan(10_000);
  });

  it('indexes in one pass, well inside a screen transition', () => {
    let graph = buildKnowledgeGraph({ nodes: [], edges: [] });
    const ms = elapsedMs(() => {
      graph = buildKnowledgeGraph(tier.source);
    });
    expect(graph.nodes.size).toBe(tier.source.nodes.length);
    expect(graph.diagnostics).toEqual([]);
    expect(ms, `building the index took ${ms}ms`).toBeLessThan(4000);
  });
});

describe('neighbourhood queries stay interactive', () => {
  const graph = buildKnowledgeGraph(tier.source);

  it('answers a thousand bounded queries in well under a second of budget', () => {
    const ms = elapsedMs(() => {
      for (let index = 0; index < 1000; index += 1) {
        const id = tier.lexemeIds[(index * 7) % tier.lexemeIds.length];
        if (id === undefined) continue;
        const result = neighbourhoodOf(graph, id, { depth: 2, maxNodes: 120, perGroup: 24 });
        expect(result.nodes.length).toBeLessThanOrEqual(120);
      }
    });
    expect(ms, `1000 queries took ${ms}ms`).toBeLessThan(4000);
  });

  it('costs the same over 3,000 lexemes as over 300 — the walk is local', () => {
    const small = buildKnowledgeGraph(buildDictionaryTierGraph(300).source);
    const query = (built: typeof graph, ids: readonly string[]): number =>
      elapsedMs(() => {
        for (let index = 0; index < 500; index += 1) {
          const id = ids[(index * 3) % ids.length];
          if (id !== undefined) neighbourhoodOf(built, id, { depth: 2, maxNodes: 120 });
        }
      });

    // Warm both paths first so the comparison is not a JIT artefact.
    query(small, buildDictionaryTierGraph(300).lexemeIds);
    query(graph, tier.lexemeIds);

    const smallMs = query(small, buildDictionaryTierGraph(300).lexemeIds);
    const largeMs = query(graph, tier.lexemeIds);

    // Ten times the graph must not cost ten times the query. The factor is
    // loose because both numbers are small and noisy; a per-query scan over the
    // graph would blow it out by an order of magnitude, which is the regression
    // this is written to catch.
    expect(largeMs, `300 lexemes: ${smallMs}ms, 3000 lexemes: ${largeMs}ms`).toBeLessThan(
      Math.max(200, smallMs * 4 + 100),
    );
  });

  it('bounds a hub reading node like any other node', () => {
    const hub = 'reading:00000';
    const result = neighbourhoodOf(graph, hub, { depth: 2, maxNodes: 100 });
    expect(result.nodes.length).toBeLessThanOrEqual(100);
    expect(result.truncated.some((entry) => entry.cause === 'max_nodes')).toBe(true);
  });
});

describe('a whole-map retrievability render', () => {
  it('projects three thousand nodes against three thousand contracts once', () => {
    const contracts: ProjectedContract[] = [];
    const states: MemoryState[] = [];
    tier.lexemeIds.forEach((id, index) => {
      const componentId = `kc:w${index}`;
      const contractId = `contract:${componentId}:orthography_to_reading`;
      contracts.push({
        contractId,
        targetComponentId: componentId,
        skill: 'orthography_to_reading',
      });
      if (index % 3 === 0) states.push(initialMemoryState(contractId, instant(0)));
      void id;
    });

    const nodes = tier.lexemeIds.map((id, index) => ({
      id,
      componentIds: [`kc:w${index}`],
    }));

    let projected: readonly unknown[] = [];
    const ms = elapsedMs(() => {
      const index = buildRetrievabilityIndex(contracts, states);
      projected = projectRetrievability(index, nodes, instant(30));
    });

    expect(projected).toHaveLength(LEXEME_COUNT);
    expect(ms, `whole-map projection took ${ms}ms`).toBeLessThan(4000);
  });
});
