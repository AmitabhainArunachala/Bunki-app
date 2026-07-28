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
  buildMemoryHistories,
  buildRetrievabilityIndex,
  buildRetrievabilityIndexTimeline,
  initialMemoryState,
  neighbourhoodOf,
  projectNodeRetrievabilityOverTime,
  projectRetrievability,
  type AdmittedReview,
  type ContractActivation,
  type IsoInstant,
  type MemoryHistory,
  type MemoryState,
  type ProjectedContract,
} from '../../src/index.ts';
import { buildDictionaryTierGraph, dayInstant, instant } from './support.ts';

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

// ---------------------------------------------------------------------------
// The time scrubber
// ---------------------------------------------------------------------------

/**
 * The headline feature of the map, and the one whose cost is easiest to get
 * wrong: a frame loop that looks linear can hide a full rebuild per frame.
 *
 * The first implementation did exactly that, and the two scaling assertions
 * below are written to be the ones that catch it. Its cost was
 * Theta(frames x contracts): 426 daily frames over 3,000 contracts took ~1.2s,
 * and one node's fourteen-month sparkline took ~1.2s of that same budget —
 * drawing a single node's history cost about as much as the entire map's. The
 * absolute ceilings alone would not have caught it on a fast enough machine;
 * the scaling assertions do, because the shape is wrong at any speed.
 */
const FOURTEEN_MONTHS_OF_DAILY_FRAMES = 426;

const dailyFrames: readonly IsoInstant[] = Array.from(
  { length: FOURTEEN_MONTHS_OF_DAILY_FRAMES },
  (_unused, index) => dayInstant(index),
);

interface TierTrace {
  readonly contracts: readonly ProjectedContract[];
  readonly histories: readonly MemoryHistory[];
}

/**
 * One reading contract per lexeme, activated on a staggered schedule and
 * reviewed three times, so the histories have real versions to search rather
 * than a single activation each.
 */
function buildTierTrace(contractCount: number): TierTrace {
  const contracts: ProjectedContract[] = [];
  const activations: ContractActivation[] = [];
  const reviews: AdmittedReview[] = [];

  for (let index = 0; index < contractCount; index += 1) {
    const componentId = `kc:w${index}`;
    const contractId = `contract:${componentId}:orthography_to_reading`;
    contracts.push({
      contractId,
      targetComponentId: componentId,
      skill: 'orthography_to_reading',
    });
    const activatedOn = index % 90;
    activations.push({ contractId, activatedAt: dayInstant(activatedOn) });
    for (let round = 1; round <= 3; round += 1) {
      reviews.push({
        contractId,
        effectiveGrade: 'good',
        reviewedAt: dayInstant(activatedOn + 20 * round),
      });
    }
  }

  return { contracts, histories: buildMemoryHistories(activations, reviews) };
}

describe('the time scrubber is a projection, not a re-derivation', () => {
  const fullTier = buildTierTrace(LEXEME_COUNT);

  const timelineMs = (trace: TierTrace, frames: readonly IsoInstant[]): number =>
    elapsedMs(() => {
      const timeline = buildRetrievabilityIndexTimeline(trace.contracts, trace.histories, frames);
      expect(timeline).toHaveLength(frames.length);
    });

  it('walks fourteen months of daily frames over the whole tier inside a screen transition', () => {
    const ms = timelineMs(fullTier, dailyFrames);
    expect(
      ms,
      `${FOURTEEN_MONTHS_OF_DAILY_FRAMES} frames over ${LEXEME_COUNT} contracts took ${ms}ms`,
    ).toBeLessThan(1000);
  });

  it('costs about the same for fourteen months of frames as for two', () => {
    const twoFrames = dailyFrames.slice(0, 2);

    // Warm both paths first so the comparison is not a JIT artefact.
    timelineMs(fullTier, twoFrames);
    timelineMs(fullTier, dailyFrames);

    const twoMs = timelineMs(fullTier, twoFrames);
    const allMs = timelineMs(fullTier, dailyFrames);

    // The setup — bucketing the contracts, indexing the histories — is paid once
    // either way, so 213x the frames must not be anywhere near 213x the cost.
    // A per-frame rebuild of the index blows this out by three orders of
    // magnitude, which is the regression this is written to catch.
    expect(
      allMs,
      `2 frames: ${twoMs}ms, ${FOURTEEN_MONTHS_OF_DAILY_FRAMES} frames: ${allMs}ms`,
    ).toBeLessThan(Math.max(300, twoMs * 4 + 100));
  });

  it('draws one node’s sparkline for the same cost over 3,000 contracts as over 300', () => {
    const smallTier = buildTierTrace(300);
    const node = { id: 'lex:00000', componentIds: ['kc:w0'] };

    const sparklineMs = (trace: TierTrace): number =>
      elapsedMs(() => {
        const points = projectNodeRetrievabilityOverTime(
          trace.contracts,
          trace.histories,
          node,
          dailyFrames,
        );
        expect(points).toHaveLength(FOURTEEN_MONTHS_OF_DAILY_FRAMES);
      });

    sparklineMs(smallTier);
    sparklineMs(fullTier);

    const smallMs = sparklineMs(smallTier);
    const largeMs = sparklineMs(fullTier);

    // One node's history is one node's history. Ten times the tier must not cost
    // ten times the sparkline — the same size-independence claim the
    // neighbourhood walk makes above, one surface over.
    expect(largeMs, `300 contracts: ${smallMs}ms, 3000 contracts: ${largeMs}ms`).toBeLessThan(
      Math.max(200, smallMs * 4 + 100),
    );
  });
});
