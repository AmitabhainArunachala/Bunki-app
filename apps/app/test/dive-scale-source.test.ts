/**
 * The Atlas the app hands the domain, and what it costs (lane B2).
 *
 * Two claims are checked here and both are the kind that has been wrong before:
 *
 *   - **every edge is in the files.** Nothing is inferred, and in particular no
 *     contrast set and no collocation is emitted, because no shipped file
 *     declares one.
 *   - **the build is paid once and it is affordable.** The measurement is
 *     printed and pinned, so the number in `docs/build-evidence/PERF_DIVE.md` is
 *     one this suite produced rather than one somebody typed.
 */

import { describe, expect, it } from 'vitest';

import { buildKnowledgeGraph, diveAt, summariseScaleLadder } from '@bunki/domain';

import { seedDataset, importedDictionary } from '../src/data/catalog.ts';
import { DETAIL_DIVE_OPTIONS } from '../src/ui/dive/dive-detail.ts';
import {
  appScaleLadder,
  buildAppGraphSource,
  kanjiNodeId,
  resetLadderCache,
  strokesForNodeId,
} from '../src/ui/dive/scale-source.ts';

const source = buildAppGraphSource();
const graph = buildKnowledgeGraph(source);

describe('the source is the shipped dictionary and nothing else', () => {
  it('declares a node for every kanji in both tiers', () => {
    const kanjiNodes = graph.byKind.get('kanji') ?? [];
    const characters = new Set([
      ...seedDataset.kanji.map((kanji) => kanji.character),
      ...importedDictionary.kanji.map((kanji) => kanji.character),
    ]);
    expect(kanjiNodes.length).toBe(characters.size);
    expect(kanjiNodes).toContain(kanjiNodeId('分'));
  });

  it('declares a node for every lexeme in both tiers', () => {
    const lexemeNodes = graph.byKind.get('lexeme') ?? [];
    expect(lexemeNodes.length).toBeGreaterThanOrEqual(importedDictionary.lexemes.length);
    expect(lexemeNodes).toContain('lex-bunki');
  });

  it('emits no contrast edge, because no shipped file declares one', () => {
    expect(source.edges.some((edge) => edge.kind === 'contrasts_with')).toBe(false);
  });

  it('emits no collocation edge, because no shipped file declares one', () => {
    expect(source.edges.some((edge) => edge.kind === 'collocates_with')).toBe(false);
  });

  it('marks every component role unclassified, because KanjiVG annotates a shape', () => {
    const roles = new Set(
      source.edges.filter((edge) => edge.kind === 'component_of').map((edge) => edge.role),
    );
    expect([...roles]).toEqual(['unclassified']);
  });

  it('joins a Tatoeba pair to its word through the entry that selected it', () => {
    const withSentences = source.edges.filter(
      (edge) => edge.kind === 'contains' && edge.from.startsWith('sentence:'),
    );
    expect(withSentences.length).toBeGreaterThan(100);
    // Every sentence edge lands on a lexeme the source also declares, so nothing
    // dangles into a word this build does not carry.
    const lexemeIds = new Set(graph.byKind.get('lexeme') ?? []);
    withSentences.forEach((edge) => {
      expect(lexemeIds.has(edge.to), `${edge.from} → ${edge.to}`).toBe(true);
    });
  });

  it('leaves the index clean enough that nothing is quietly missing', () => {
    // Duplicates and dangling edges are *reported* by the builder rather than
    // dropped silently. A handful is expected — the two tiers overlap — and a
    // flood would mean the source is malformed.
    expect(graph.diagnostics.length).toBeLessThan(source.edges.length / 20);
  });
});

describe('the ladder built over it', () => {
  const { ladder } = appScaleLadder();

  it('reports the phrase level empty over the real dictionary, with the reason', () => {
    const coverage = summariseScaleLadder(ladder);
    const l4 = coverage.levels.find((entry) => entry.level === 'collocation');
    expect(l4?.support).toBe('empty');
    expect(l4?.basis).toMatch(/no phrase inventory/i);
    expect(coverage.emptyLevels).toContain('collocation');
  });

  it('reaches strokes for a character the build carries geometry for', () => {
    const strokes = strokesForNodeId(kanjiNodeId('分'));
    expect(strokes.length).toBeGreaterThan(0);
    expect(strokes[0]?.order).toBe(1);
    expect(strokes[0]?.path.length).toBeGreaterThan(0);
  });

  it('answers a node id that is not a character with no strokes rather than a throw', () => {
    expect(strokesForNodeId('lex-bunki')).toEqual([]);
    expect(strokesForNodeId('kanji:🙂')).toEqual([]);
  });

  it('dives 分 into its components and out into the words that use it', () => {
    // The page's own budget, which is sized so a character's rings are complete
    // over this tier — that is what makes ranking them by commonness honest.
    const view = diveAt(ladder, kanjiNodeId('分'), DETAIL_DIVE_OPTIONS);
    expect(view.centre?.label).toBe('分');
    const components = view.rings.find(
      (ring) => ring.bucket === 'inward' && ring.level === 'component',
    );
    expect(components?.members.length).toBeGreaterThan(0);
    const words = view.rings.find((ring) => ring.bucket === 'outward' && ring.level === 'word');
    expect(words?.members.length).toBeGreaterThan(0);
    expect(words?.truncated, 'the page budget cut the ring it ranks').toBe(false);
    expect(words?.members.map((member) => member.node.label)).toContain('分岐');
  });

  it('cuts the ring at the default budget, and says so rather than hiding it', () => {
    // The default is deliberately smaller than the page's, and 分 is past it.
    // A cut that was not reported would be the map quietly lying about a
    // character's vocabulary.
    const view = diveAt(ladder, kanjiNodeId('分'));
    const words = view.rings.find((ring) => ring.bucket === 'outward' && ring.level === 'word');
    expect(words?.truncated).toBe(true);
    expect(words?.available).toBeGreaterThan(words?.members.length ?? 0);
  });

  it('is complete at the page budget for the busiest character in the tier', () => {
    // 人 is the widest fan-out in the shipped 3,000 lexemes. If the page budget
    // ever stopped covering it, the compounds ordering would silently become an
    // ordering of an arbitrary subset — so this is the assertion that keeps the
    // "ranked by commonness" sentence true.
    const view = diveAt(ladder, kanjiNodeId('人'), DETAIL_DIVE_OPTIONS);
    const words = view.rings.find((ring) => ring.bucket === 'outward' && ring.level === 'word');
    expect(words?.available).toBeGreaterThan(20);
    expect(words?.truncated).toBe(false);
  });
});

describe('what one dive costs over the real dictionary', () => {
  const { ladder, cost } = appScaleLadder();

  it('indexes the whole dictionary once, and it is affordable', () => {
    // Printed so the number in the evidence file is one this suite produced.
    console.log(
      `[B2] ladder build: ${cost.buildMs.toFixed(1)} ms, ${String(cost.nodeCount)} nodes, ` +
        `${String(cost.edgeCount)} edges, ${String(cost.diagnosticCount)} diagnostics`,
    );
    expect(cost.nodeCount).toBeGreaterThan(4000);
    // Generous, because a CI runner under load is not a phone and this is a
    // regression alarm rather than a performance claim. The measured figure and
    // the claim it does or does not support are in PERF_DIVE.md.
    expect(cost.buildMs).toBeLessThan(5000);
  });

  it('is memoised, so a second dive pays nothing for the index', () => {
    const first = appScaleLadder();
    const second = appScaleLadder();
    expect(second.ladder).toBe(first.ladder);
  });

  it('materialises a tiny fraction of the graph for one view, at any node', () => {
    const measured: { id: string; nodes: number; reads: number; steps: number }[] = [];
    // A common character, a hub, and the canonical fixture target.
    for (const character of ['分', '人', '日', '木', '森']) {
      const view = diveAt(ladder, kanjiNodeId(character));
      if (view.centre === null) continue;
      measured.push({
        id: character,
        nodes: view.cost.nodesMaterialised,
        reads: view.cost.adjacencyReads,
        steps: view.cost.adjacencySteps,
      });
      expect(view.cost.nodesMaterialised, character).toBeLessThan(200);
      expect(view.cost.adjacencyReads, character).toBeLessThanOrEqual(64);
      expect(
        view.cost.nodesMaterialised / view.cost.ladderNodes,
        `${character} materialised too much of the graph`,
      ).toBeLessThan(0.02);
    }
    expect(measured.length).toBeGreaterThan(2);
    console.log(
      `[B2] one dive over ${String(ladder.graph.nodes.size)} nodes: ` +
        measured
          .map(
            (entry) =>
              `${entry.id} → ${String(entry.nodes)} nodes / ${String(entry.reads)} lists / ${String(entry.steps)} steps`,
          )
          .join(', '),
    );
  });

  it('costs a bounded time per dive, not a walk', () => {
    // A hundred dives across the tier, timed as one batch: a per-dive walk over
    // a 4,000-node graph would be visible here and a local read is not.
    const characters = (ladder.graph.byKind.get('kanji') ?? []).slice(0, 100);
    const started = globalThis.performance.now();
    for (const id of characters) diveAt(ladder, id);
    const elapsed = globalThis.performance.now() - started;
    console.log(
      `[B2] ${String(characters.length)} dives in ${elapsed.toFixed(1)} ms ` +
        `(${(elapsed / Math.max(1, characters.length)).toFixed(2)} ms each)`,
    );
    expect(elapsed / Math.max(1, characters.length)).toBeLessThan(20);
  });

  it('can be reset for a cold measurement', () => {
    resetLadderCache();
    const rebuilt = appScaleLadder();
    expect(rebuilt.cost.nodeCount).toBe(cost.nodeCount);
  });
});
