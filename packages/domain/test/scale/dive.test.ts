/**
 * One bounded view of the ladder, and the level-of-detail contract it reports
 * rather than promises (Campaign E, Wave C / lane B2).
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DIVE_OPTIONS,
  buildKnowledgeGraph,
  buildScaleLadder,
  bucketOf,
  canZoom,
  diveAt,
  ringOf,
  strokeNodeId,
  viewGraphNodeIds,
  type ScaleRelation,
} from '../../src/index.ts';
import { buildDictionaryTierGraph } from '../graph/support.ts';
import { FOREST_GRAPH, countingStrokes, forestLadder } from './support.ts';

const ladder = forestLadder();

const labels = (members: readonly ScaleRelation[]): string[] =>
  members.map((member) => member.node.label).sort();

describe('the law, on the design document’s own example', () => {
  it('gives 森 its components inward and the words it makes outward', () => {
    const view = diveAt(ladder, 'kanji:森');
    expect(view.centre?.label).toBe('森');

    expect(labels(ringOf(view, 'inward', 'component')?.members ?? [])).toEqual(['木']);
    expect(labels(ringOf(view, 'outward', 'word')?.members ?? [])).toEqual(['森林', '青森']);
  });

  it('reads the same relationship from the other end', () => {
    // 森林 inward is 森 and 林; 森 outward is 森林. One edge, two readings.
    const word = diveAt(ladder, 'lex-shinrin');
    expect(labels(ringOf(word, 'inward', 'kanji')?.members ?? [])).toEqual(['林', '森']);

    const kanji = diveAt(ladder, 'kanji:森');
    expect(labels(ringOf(kanji, 'outward', 'word')?.members ?? [])).toContain('森林');
  });

  it('carries the role on a component relation, because a role is the teaching', () => {
    const view = diveAt(ladder, 'kanji:道');
    const components = ringOf(view, 'inward', 'component')?.members ?? [];
    expect(components.map((member) => [member.node.label, member.role] as const).sort()).toEqual(
      [
        ['辶', 'semantic'],
        ['首', 'phonetic'],
      ].sort(),
    );
  });

  it('recurses: the same call shape answers at every level', () => {
    // stroke → kanji → word → sentence, one function, four ids.
    expect(diveAt(ladder, strokeNodeId('kanji:木', 1)).centre?.level).toBe('stroke');
    expect(diveAt(ladder, 'kanji:木').centre?.level).toBe('kanji');
    expect(diveAt(ladder, 'lex-shinrin').centre?.level).toBe('word');
    expect(diveAt(ladder, 'sentence:001').centre?.level).toBe('sentence');
  });
});

describe('strokes are the floor, and they behave like every other level', () => {
  it('gives a stroke its character outward and its siblings beside it', () => {
    const view = diveAt(ladder, strokeNodeId('kanji:木', 2));
    expect(view.centre?.label).toBe('2/4');
    expect(labels(ringOf(view, 'outward', 'kanji')?.members ?? [])).toEqual(['木']);
    expect(ringOf(view, 'alongside', 'stroke')?.members).toHaveLength(3);
  });

  it('says the floor is a floor rather than reporting thin data', () => {
    const view = diveAt(ladder, strokeNodeId('kanji:木', 1));
    const gap = view.gaps.find((entry) => entry.bucket === 'inward');
    expect(gap?.reason).toBe('atomic');
    expect(gap?.detail).toMatch(/not because the data is thin/i);
    expect(canZoom(view, 'inward')).toBe(false);
  });

  it('gives a character its own strokes inward, beside its components', () => {
    const view = diveAt(ladder, 'kanji:木');
    expect(ringOf(view, 'inward', 'stroke')?.members).toHaveLength(4);
    expect(labels(ringOf(view, 'inward', 'component')?.members ?? [])).toEqual(['木']);
  });

  it('reports a character with no geometry rather than drawing an empty ring', () => {
    const view = diveAt(ladder, 'kanji:道');
    expect(ringOf(view, 'inward', 'stroke')).toBeNull();
    const gap = view.gaps.find((entry) => entry.reason === 'no_stroke_source');
    expect(gap?.detail).toMatch(/Nothing is inferred from the stroke count/i);
  });
});

describe('the gaps are first-class, and the collocation level is the honest one', () => {
  it('names the empty phrase level, with the reason, on a word', () => {
    const view = diveAt(ladder, 'lex-shinrin');
    const gap = view.gaps.find((entry) => entry.level === 'collocation');
    expect(gap?.reason).toBe('level_unpopulated');
    expect(gap?.bucket).toBe('outward');
    expect(gap?.detail).toMatch(/no phrase inventory/i);
  });

  it('still reaches the sentence past the level it skipped', () => {
    const view = diveAt(ladder, 'lex-shinrin');
    expect(labels(ringOf(view, 'outward', 'sentence')?.members ?? [])).toEqual([
      '森林が広がっている。',
    ]);
    expect(view.gaps.find((entry) => entry.level === 'collocation')?.detail).toBeDefined();
  });

  it('names the ceiling at a sentence', () => {
    const view = diveAt(ladder, 'sentence:001');
    const gap = view.gaps.find((entry) => entry.reason === 'ceiling');
    expect(gap?.detail).toMatch(/outermost level/i);
    expect(canZoom(view, 'outward')).toBe(false);
    expect(canZoom(view, 'inward')).toBe(true);
  });

  it('says nothing rather than something when a node simply has no neighbours there', () => {
    const view = diveAt(ladder, 'kanji:青');
    // 青 has no `component_of` edge in this fixture and no geometry.
    const gap = view.gaps.find((entry) => entry.bucket === 'inward' && entry.level === 'component');
    expect(gap?.reason).toBe('no_data');
  });
});

describe('a facet is not a scale', () => {
  it('never puts a reading on a ring', () => {
    const view = diveAt(ladder, 'lex-shinrin');
    const everything = view.rings.flatMap((ring) => ring.members.map((m) => m.node.id));
    expect(everything).not.toContain('reading:しんりん');
  });
});

describe('an unknown centre is an honest empty, not a throw', () => {
  it('returns a view with no centre and a cost of nothing', () => {
    const view = diveAt(ladder, 'kanji:nope');
    expect(view.centre).toBeNull();
    expect(view.rings).toEqual([]);
    expect(view.cost.nodesMaterialised).toBe(0);
    expect(view.cost.adjacencyReads).toBe(0);
  });
});

describe('every edge drawn is an edge the domain holds', () => {
  it('cites a basis on every relation in every ring', () => {
    for (const id of ['kanji:森', 'lex-shinrin', 'kanji:木', 'sentence:001']) {
      for (const ring of diveAt(ladder, id).rings) {
        for (const member of ring.members) {
          expect(member.basis.length, `${id} → ${member.node.id}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('draws nothing that is not in the graph or in a declared source', () => {
    const graphEdges = new Set<string>();
    FOREST_GRAPH.adjacency.forEach((steps, from) => {
      steps.forEach((step) => graphEdges.add(`${from}|${step.other}`));
    });

    for (const id of ['kanji:森', 'kanji:林', 'kanji:木', 'lex-shinrin', 'lex-rindo']) {
      const view = diveAt(ladder, id);
      for (const ring of view.rings) {
        for (const member of ring.members) {
          if (member.basis === 'kanjivg_stroke' || member.basis === 'writing_order') continue;
          expect(
            graphEdges.has(`${id}|${member.node.id}`),
            `${id} → ${member.node.id} (${member.basis}) is not an edge the graph holds`,
          ).toBe(true);
        }
      }
    }
  });
});

describe('the preview is what makes the interior visible', () => {
  it('looks one level inside the first few members of a scale ring', () => {
    const view = diveAt(ladder, 'kanji:林');
    const compounds = ringOf(view, 'outward', 'word')?.members ?? [];
    const shinrin = compounds.find((member) => member.node.label === '森林');
    expect(shinrin?.previewMaterialised).toBe(true);
    expect(shinrin?.preview.map((node) => node.label).sort()).toEqual(['林', '森']);
  });

  it('never previews the same-level bucket, which is not a zoom', () => {
    const view = diveAt(ladder, strokeNodeId('kanji:木', 1));
    for (const member of ringOf(view, 'alongside', 'stroke')?.members ?? []) {
      expect(member.previewMaterialised).toBe(false);
      expect(member.preview).toEqual([]);
    }
  });

  it('marks a member past the budget as un-looked-into rather than as empty', () => {
    const view = diveAt(ladder, 'kanji:森', { previewMembers: 1 });
    const compounds = ringOf(view, 'outward', 'word')?.members ?? [];
    expect(compounds[0]?.previewMaterialised).toBe(true);
    expect(compounds[1]?.previewMaterialised).toBe(false);
    expect(compounds[1]?.preview).toEqual([]);
  });
});

describe('the budgets bound the view, and the truncation is visible', () => {
  it('caps a ring per landing level and says how many there were', () => {
    const view = diveAt(ladder, 'kanji:森', { perLevel: 1 });
    const ring = ringOf(view, 'outward', 'word');
    expect(ring?.members).toHaveLength(1);
    expect(ring?.available).toBe(2);
    expect(ring?.truncated).toBe(true);
  });

  it('does not report a truncation that did not happen', () => {
    const ring = ringOf(diveAt(ladder, 'kanji:森'), 'outward', 'word');
    expect(ring?.truncated).toBe(false);
    expect(ring?.available).toBe(2);
  });

  it('is deterministic: two dives of one id are deeply equal', () => {
    expect(diveAt(ladder, 'kanji:森')).toEqual(diveAt(ladder, 'kanji:森'));
    expect(diveAt(ladder, 'kanji:森', { perLevel: 1 }).rings).toEqual(
      diveAt(ladder, 'kanji:森', { perLevel: 1 }).rings,
    );
  });
});

describe('level-of-detail: the cost does not move when the graph grows', () => {
  /**
   * The claim under test, stated as an experiment rather than as a comment.
   *
   * Two synthetic tiers, one ten times the size of the other, and one node with
   * the same local shape in both. If the dive walked the graph, the second would
   * cost ten times the first. A2 already had to repair exactly this defect class
   * once ("the time scrubber rebuilt the whole index on every frame"), so it is
   * measured here rather than asserted.
   */
  function ladderOfSize(lexemeCount: number): ReturnType<typeof buildScaleLadder> {
    const tier = buildDictionaryTierGraph(lexemeCount);
    return buildScaleLadder({
      graph: buildKnowledgeGraph(tier.source),
      strokesFor: () => [],
    });
  }

  const small = ladderOfSize(300);
  const large = ladderOfSize(3000);

  it('has genuinely different graph sizes, so the comparison means something', () => {
    const smallView = diveAt(small, 'kanji:00000');
    const largeView = diveAt(large, 'kanji:00000');
    expect(largeView.cost.ladderNodes).toBeGreaterThan(smallView.cost.ladderNodes * 5);
    expect(largeView.cost.ladderNodes).toBeGreaterThan(4000);
  });

  it('reads a bounded number of adjacency lists at either size', () => {
    const smallView = diveAt(small, 'kanji:00000');
    const largeView = diveAt(large, 'kanji:00000');
    const ceiling = 1 + DEFAULT_DIVE_OPTIONS.previewMembers * 4;
    expect(smallView.cost.adjacencyReads).toBeLessThanOrEqual(ceiling);
    expect(largeView.cost.adjacencyReads).toBeLessThanOrEqual(ceiling);
  });

  it('materialises a bounded number of nodes at either size', () => {
    const largeView = diveAt(large, 'kanji:00000');
    // centre + (rings × perLevel) + (previewed members × previewLimit), and no
    // term in that sum mentions the size of the graph.
    const ceiling =
      1 +
      largeView.rings.length * DEFAULT_DIVE_OPTIONS.perLevel +
      largeView.rings.length *
        DEFAULT_DIVE_OPTIONS.previewMembers *
        DEFAULT_DIVE_OPTIONS.previewLimit;
    expect(largeView.cost.nodesMaterialised).toBeLessThanOrEqual(ceiling);
    expect(largeView.cost.nodesMaterialised).toBeLessThan(largeView.cost.ladderNodes / 10);
  });

  it('touches a hub node without walking its whole fan-out into the result', () => {
    // A reading in this tier is a hub. A kanji reaching one is the shape that
    // makes a naive walk explode; the facet filter and the budgets are what stop
    // it, and the result must still be small.
    const view = diveAt(large, 'kanji:00007');
    expect(view.cost.nodesMaterialised).toBeLessThan(200);
    for (const ring of view.rings) {
      expect(ring.members.length).toBeLessThanOrEqual(DEFAULT_DIVE_OPTIONS.perLevel);
    }
  });

  it('never calls the stroke source for a node that is not a character', () => {
    const strokes = countingStrokes();
    const local = buildScaleLadder({ graph: FOREST_GRAPH, strokesFor: strokes.strokesFor });
    diveAt(local, 'lex-shinrin');
    expect(strokes.calls).toBe(0);
    diveAt(local, 'kanji:木');
    expect(strokes.calls).toBe(1);
  });
});

describe('reading a view', () => {
  it('flattens a bucket nearest level first', () => {
    const view = diveAt(ladder, 'kanji:木');
    const inward = bucketOf(view, 'inward');
    expect(inward[0]?.node.level).toBe('component');
    expect(inward[inward.length - 1]?.node.level).toBe('stroke');
  });

  it('lists the graph node ids a caller can join against another index', () => {
    const ids = viewGraphNodeIds(diveAt(ladder, 'kanji:森'));
    expect(ids).toContain('kanji:森');
    expect(ids).toContain('lex-shinrin');
    expect(ids.some((id) => id.startsWith('scale-stroke:'))).toBe(false);
  });
});
