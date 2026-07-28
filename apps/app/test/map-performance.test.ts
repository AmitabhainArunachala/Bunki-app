/**
 * What the map costs, measured (Campaign E / B1).
 *
 * ## Why this file exists
 *
 * The primary target is a phone, and this lane was named as the one most likely
 * to repeat lane A2's defect — *"the time scrubber rebuilt the whole index on
 * every frame"*, which measured 426 daily frames at ~1.2s and made one node's
 * sparkline cost about as much as the whole map's timeline. That defect passed
 * every correctness test it had. It was only visible as a number.
 *
 * So the shape the lane is held to is asserted here as behaviour, not as a
 * comment:
 *
 *   - the Atlas is built **once** and never rebuilt;
 *   - a scrubber move does **not** rebuild the bucketing;
 *   - per-view work is bounded by the nodes drawn, not by the corpus;
 *   - the whole-corpus pass is only paid by the view that asks for it.
 *
 * ## How to read the numbers
 *
 * The ceilings are deliberately loose — several times the measured value — for
 * the reason a tight one is worse than none: a timing assertion that fails on a
 * loaded CI box gets deleted, and then nothing is measured at all. The ceilings
 * catch an **order-of-magnitude regression**, which is what the A2 defect was.
 *
 * **These are Node on a build machine, not a phone.** They are a floor on what a
 * device will do, not a prediction of it. The capsule says so; a number
 * presented here as if it were a device measurement would be exactly the kind of
 * claim this project has been burned by.
 */

import { describe, expect, it } from 'vitest';

import { neighbourhoodOf } from '@bunki/domain';

import { layoutNeighbourhood } from '../src/ui/map/map-layout.ts';
import {
  buildMapTimeline,
  lensView,
  projectMapNode,
  type TimelineInput,
} from '../src/ui/map/map-projection.ts';
import { buildRoutes, routePosition } from '../src/ui/map/map-routes.ts';
import { historyFrames } from '../src/ui/map/map-scrubber.ts';
import { mapAtlas, resetMapAtlas } from '../src/ui/map/map-source.ts';
import { placeNodes } from '../src/ui/map/map-eras.ts';

/** Median of `runs` timings, so one scheduling hiccup does not decide a test. */
function medianMs(runs: number, body: () => void): number {
  const samples: number[] = [];
  for (let run = 0; run < runs; run += 1) {
    const started = performance.now();
    body();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] ?? 0;
}

const NOW = '2026-07-28T00:00:00.000Z';

/** A learner's log, at a size worth measuring rather than a size that passes. */
function ledger(contractCount: number): TimelineInput {
  const atlas = mapAtlas();
  const characters = [...atlas.kanji.keys()].slice(0, contractCount);
  return {
    contracts: characters.map((character, index) => ({
      contractId: `ct-${String(index)}`,
      targetComponentId: `kc:${character}`,
      skill: 'orthography_to_reading',
    })),
    memoryStates: characters.map((_character, index) => ({
      contractId: `ct-${String(index)}`,
      activatedAt: `2026-0${String((index % 6) + 1)}-01T00:00:00.000Z`,
    })),
    gateDecisions: characters.flatMap((_character, index) =>
      [0, 1, 2].map((step) => ({
        contractId: `ct-${String(index)}`,
        admitted: true,
        effectiveGrade: 'good' as const,
        at: `2026-0${String((index % 6) + 1)}-1${String(step)}T00:00:00.000Z`,
      })),
    ),
  };
}

describe('the Atlas is built once', () => {
  it('costs a bounded one-off and is not rebuilt on the next query', () => {
    resetMapAtlas();
    const cold = performance.now();
    const first = mapAtlas();
    const coldMs = performance.now() - cold;

    const warm = medianMs(20, () => {
      mapAtlas();
    });

    console.log(
      `[perf] atlas: ${String(first.graph.nodes.size)} nodes, cold ${coldMs.toFixed(0)}ms, warm ${warm.toFixed(4)}ms`,
    );

    expect(first.graph.nodes.size).toBeGreaterThan(9000);
    // The one-off. Loose: this is the whole dictionary indexed.
    expect(coldMs).toBeLessThan(3000);
    // The point: a second call is a memo read, not a rebuild.
    expect(warm).toBeLessThan(1);
    expect(mapAtlas()).toBe(first);
  });
});

describe('a view costs the nodes it draws, not the corpus', () => {
  it('resolves a neighbourhood, lays it out, and projects it inside a frame budget', () => {
    const atlas = mapAtlas();
    const origin = [...atlas.graph.nodes.keys()].find((id) => id.startsWith('lexeme:'));
    if (origin === undefined) throw new Error('no lexeme node');
    const input = ledger(400);
    const frames = historyFrames('2026-01-01T00:00:00.000Z', NOW);
    const timeline = buildMapTimeline(input, frames);
    const frame = timeline.at(-1);
    if (frame === undefined) throw new Error('no frame');

    let drawn = 0;
    const ms = medianMs(20, () => {
      const neighbourhood = neighbourhoodOf(atlas.graph, origin);
      const layout = layoutNeighbourhood(neighbourhood);
      const nodes = neighbourhood.nodes.map((entry) => entry.node);
      placeNodes(atlas, nodes);
      for (const node of nodes) lensView(projectMapNode(frame.index, node, NOW), 'reading');
      drawn = layout.points.length;
    });

    console.log(`[perf] view: ${String(drawn)} nodes drawn, ${ms.toFixed(1)}ms per redraw`);
    expect(drawn).toBeGreaterThan(1);
    // A whole-view redraw — every lens change and every scrubber step does this.
    expect(ms).toBeLessThan(120);
  });
});

describe('the scrubber does not rebuild the index per frame', () => {
  it('builds a year of daily frames once, and reads a frame in near-zero time', () => {
    const input = ledger(400);
    const frames = historyFrames('2025-07-28T00:00:00.000Z', NOW);

    const buildMs = medianMs(3, () => {
      buildMapTimeline(input, frames);
    });
    const timeline = buildMapTimeline(input, frames);

    const atlas = mapAtlas();
    const nodes = [...atlas.graph.nodes.values()].slice(0, 60);

    // What one scrubber step actually costs: pick a frame, redraw the view.
    const stepMs = medianMs(30, () => {
      const frame = timeline[timeline.length >> 1];
      if (frame === undefined) return;
      for (const node of nodes) lensView(projectMapNode(frame.index, node, frame.at), 'reading');
    });

    console.log(
      `[perf] scrubber: ${String(frames.length)} frames built in ${buildMs.toFixed(0)}ms; one step over ${String(nodes.length)} nodes ${stepMs.toFixed(2)}ms`,
    );

    expect(frames.length).toBeGreaterThan(300);
    expect(timeline.length).toBe(frames.length);
    // The A2 regression, as a number: rebuilding per frame put this in seconds.
    expect(buildMs).toBeLessThan(2000);
    // And a step is a lookup, so it stays inside a frame budget by a wide margin.
    expect(stepMs).toBeLessThan(30);
  });

  it('shares one bucketing across every frame rather than making a new one', () => {
    const input = ledger(50);
    const timeline = buildMapTimeline(input, historyFrames('2026-06-01T00:00:00.000Z', NOW));
    const first = timeline[0];
    const last = timeline.at(-1);
    if (first === undefined || last === undefined) throw new Error('no frames');
    // Identity, not equality: the same object is the evidence that it was built
    // once. Two equal-but-distinct maps would mean it was rebuilt per frame and
    // the timing test would be the only thing left to notice.
    expect(first.index.byComponentSkill).toBe(last.index.byComponentSkill);
  });

  it('shows past state as it stood, not today’s state backdated', () => {
    const input = ledger(1);
    // `ct-0` activates on 2026-01-01 and its three reviews land on the 10th,
    // 11th and 12th. The early frame is chosen to sit *between* activation and
    // the first review — the whole point is a frame at which the learner had a
    // contract and no evidence on it yet.
    const frames = ['2026-01-05T00:00:00.000Z', '2026-06-01T00:00:00.000Z', NOW];
    const timeline = buildMapTimeline(input, frames);
    const early = timeline[0];
    const late = timeline.at(-1);
    if (early === undefined || late === undefined) throw new Error('no frames');
    const reviewsAt = (frame: typeof early): number =>
      frame.index.stateOf('ct-0')?.admittedReviewCount ?? -1;

    // A static index reused at a past instant would report today's count at both
    // ends — the "already knew in March what they learned in June" defect.
    expect(reviewsAt(early)).toBe(0);
    expect(reviewsAt(late)).toBe(3);
  });
});

describe('the road and the census are paid for by the views that ask for them', () => {
  it('counts a whole route without walking the corpus per station', () => {
    const atlas = mapAtlas();
    const routes = buildRoutes(atlas);
    const route = routes.reduce(
      (longest, candidate) =>
        candidate.stations.length > longest.stations.length ? candidate : longest,
      routes[0] ?? { stations: [] as never[], id: '', name: '', rule: '' },
    );
    const input = ledger(400);
    const timeline = buildMapTimeline(input, [NOW]);
    const frame = timeline[0];
    if (frame === undefined) throw new Error('no frame');

    const ms = medianMs(10, () => {
      routePosition(route, 'reading', 'settled', (nodeId) => {
        const node = atlas.graph.nodes.get(nodeId);
        return node === undefined
          ? null
          : lensView(projectMapNode(frame.index, node, NOW), 'reading');
      });
    });

    console.log(
      `[perf] route: ${route.name}, ${String(route.stations.length)} stations counted in ${ms.toFixed(1)}ms`,
    );
    expect(route.stations.length).toBeGreaterThan(50);
    expect(ms).toBeLessThan(200);
  });

  it('costs the whole-corpus census only when the census is asked for', () => {
    const atlas = mapAtlas();
    const lexemes = [...atlas.graph.nodes.values()].filter((node) => node.kind === 'lexeme');
    const ms = medianMs(3, () => {
      placeNodes(atlas, lexemes);
    });
    console.log(
      `[perf] census: ${String(lexemes.length)} lexemes placed in ${ms.toFixed(0)}ms (deliberate destination only)`,
    );
    expect(lexemes.length).toBeGreaterThan(3000);
    // Loose, because it is a one-off behind a button — but it must not be so
    // slow that pressing it looks like a hang.
    expect(ms).toBeLessThan(4000);
  });
});
