/**
 * The ladder over the Atlas (Campaign E, Wave C / lane B2).
 */

import { describe, expect, it } from 'vitest';

import {
  LEVEL_OF_GRAPH_KIND,
  GRAPH_NODE_KINDS,
  STROKE_ID_PREFIX,
  adjacencyDegree,
  buildScaleLadder,
  parseStrokeNodeId,
  scaleNodeAt,
  strokeNodeId,
  summariseScaleLadder,
  type CollocationRecord,
} from '../../src/index.ts';
import { FOREST_GRAPH, FOREST_STROKES, countingStrokes, forestLadder } from './support.ts';

const ladder = forestLadder();

describe('a ladder is a reading of the graph, not a second copy of it', () => {
  it('holds the very graph it was given', () => {
    expect(ladder.graph).toBe(FOREST_GRAPH);
  });

  it('costs nothing in the graph to build', () => {
    // No node or edge is re-indexed: the only structures a ladder owns are the
    // collocation indexes, which are empty here because nothing declared one.
    expect(ladder.collocations.size).toBe(0);
    expect(ladder.collocationsByMember.size).toBe(0);
    expect(ladder.diagnostics).toEqual([]);
  });

  it('places every graph node kind explicitly, including the ones that are not levels', () => {
    // Exhaustive: a new node kind must be given a level or an explicit `null`,
    // or a whole class of node would silently vanish from the ladder.
    GRAPH_NODE_KINDS.forEach((kind) => {
      expect(Object.prototype.hasOwnProperty.call(LEVEL_OF_GRAPH_KIND, kind), kind).toBe(true);
    });
    expect(LEVEL_OF_GRAPH_KIND.kanji).toBe('kanji');
    expect(LEVEL_OF_GRAPH_KIND.component).toBe('component');
    expect(LEVEL_OF_GRAPH_KIND.lexeme).toBe('word');
    expect(LEVEL_OF_GRAPH_KIND.sentence).toBe('sentence');
    // Facets. A reading is not made of kanji and does not make words.
    expect(LEVEL_OF_GRAPH_KIND.reading).toBeNull();
    expect(LEVEL_OF_GRAPH_KIND.sense).toBeNull();
    expect(LEVEL_OF_GRAPH_KIND.grammar_construction).toBeNull();
    expect(LEVEL_OF_GRAPH_KIND.encounter).toBeNull();
  });
});

describe('resolving one node', () => {
  it('gives a graph node its level and keeps its own id', () => {
    const node = scaleNodeAt(ladder, 'kanji:森');
    expect(node?.id).toBe('kanji:森');
    expect(node?.level).toBe('kanji');
    expect(node?.label).toBe('森');
    expect(node?.graphKind).toBe('kanji');
    expect(node?.stroke).toBeNull();
    // The Atlas→Trace join travels with the node at every level.
    expect(node?.componentIds).toEqual(['kc:森']);
  });

  it('answers a facet with null rather than inventing a level for it', () => {
    expect(scaleNodeAt(ladder, 'reading:しんりん')).toBeNull();
  });

  it('answers an unknown id with null rather than a throw', () => {
    expect(scaleNodeAt(ladder, 'kanji:nope')).toBeNull();
  });

  it('resolves a stroke through the source, with its position in the writing order', () => {
    const node = scaleNodeAt(ladder, strokeNodeId('kanji:木', 3));
    expect(node?.level).toBe('stroke');
    expect(node?.stroke?.order).toBe(3);
    expect(node?.stroke?.of).toBe(4);
    expect(node?.stroke?.path).toBe(FOREST_STROKES['kanji:木']?.[2]?.path);
    expect(node?.label).toBe('3/4');
    // A stroke is never a retrieval target: nobody captures one.
    expect(node?.componentIds).toEqual([]);
  });

  it('answers a stroke this build has no geometry for with null', () => {
    expect(scaleNodeAt(ladder, strokeNodeId('kanji:道', 1))).toBeNull();
    expect(scaleNodeAt(ladder, strokeNodeId('kanji:木', 99))).toBeNull();
  });
});

describe('stroke ids round-trip and cannot be confused with anything else', () => {
  it('parses back the character and the order, whatever is in the id', () => {
    for (const id of ['kanji:木', 'k:with:colons', '森', 'lex-shinrin']) {
      const minted = strokeNodeId(id, 7);
      expect(parseStrokeNodeId(minted)).toEqual({ kanjiNodeId: id, order: 7 });
    }
  });

  it('refuses anything that is not one of its own', () => {
    expect(parseStrokeNodeId('kanji:森')).toBeNull();
    expect(parseStrokeNodeId(STROKE_ID_PREFIX)).toBeNull();
    expect(parseStrokeNodeId(`${STROKE_ID_PREFIX}:kanji:木`)).toBeNull();
    expect(parseStrokeNodeId(`${STROKE_ID_PREFIX}0:kanji:木`)).toBeNull();
    expect(parseStrokeNodeId(`${STROKE_ID_PREFIX}x:kanji:木`)).toBeNull();
  });
});

describe('the stroke source is consulted per character and never in bulk', () => {
  it('is not called at all by building the ladder', () => {
    const strokes = countingStrokes();
    buildScaleLadder({ graph: FOREST_GRAPH, strokesFor: strokes.strokesFor });
    expect(strokes.calls).toBe(0);
  });

  it('is called once to resolve one stroke', () => {
    const strokes = countingStrokes();
    const local = buildScaleLadder({ graph: FOREST_GRAPH, strokesFor: strokes.strokesFor });
    scaleNodeAt(local, strokeNodeId('kanji:木', 1));
    expect(strokes.calls).toBe(1);
  });
});

describe('declared collocations, which no shipped build has', () => {
  const phrase: CollocationRecord = {
    id: 'phrase:mori-ga-hirogaru',
    label: '森が広がる',
    memberIds: ['lex-shinrin', 'lex-nope'],
    componentIds: [],
  };

  it('indexes a declared phrase and reports the member the graph does not have', () => {
    const local = buildScaleLadder({
      graph: FOREST_GRAPH,
      strokesFor: () => [],
      collocations: [phrase],
    });
    expect(local.collocations.get('phrase:mori-ga-hirogaru')?.label).toBe('森が広がる');
    expect(local.collocationsByMember.get('lex-shinrin')).toEqual(['phrase:mori-ga-hirogaru']);
    expect(local.collocationsByMember.get('lex-nope')).toBeUndefined();
    expect(local.diagnostics.map((entry) => entry.kind)).toEqual(['collocation_dangling_member']);
  });

  it('refuses an id that already names a graph node, so one id never names two things', () => {
    const local = buildScaleLadder({
      graph: FOREST_GRAPH,
      strokesFor: () => [],
      collocations: [{ ...phrase, id: 'kanji:森' }],
    });
    expect(local.collocations.size).toBe(0);
    expect(local.diagnostics[0]?.kind).toBe('collocation_id_collision');
  });

  it('refuses an id in the stroke namespace this package mints', () => {
    const local = buildScaleLadder({
      graph: FOREST_GRAPH,
      strokesFor: () => [],
      collocations: [{ ...phrase, id: `${STROKE_ID_PREFIX}1:kanji:森` }],
    });
    expect(local.collocations.size).toBe(0);
    expect(local.diagnostics[0]?.kind).toBe('stroke_id_collision');
  });

  it('keeps the first of two declarations, so the index does not depend on input order', () => {
    const local = buildScaleLadder({
      graph: FOREST_GRAPH,
      strokesFor: () => [],
      collocations: [phrase, { ...phrase, label: 'something else' }],
    });
    expect(local.collocations.get(phrase.id)?.label).toBe('森が広がる');
    expect(local.diagnostics.map((entry) => entry.kind)).toContain('duplicate_collocation');
  });
});

describe('coverage is reported honestly, including the level that is empty', () => {
  const coverage = summariseScaleLadder(ladder);

  it('reports the collocation level empty, and says why', () => {
    const l4 = coverage.levels.find((entry) => entry.level === 'collocation');
    expect(l4?.support).toBe('empty');
    expect(l4?.count).toBe(0);
    expect(l4?.basis).toMatch(/no phrase inventory/i);
    expect(coverage.emptyLevels).toContain('collocation');
  });

  it('refuses to count strokes rather than guessing a number', () => {
    const l0 = coverage.levels.find((entry) => entry.level === 'stroke');
    expect(l0?.support).toBe('empty');
    expect(l0?.count).toBe(0);
    expect(l0?.basis).toMatch(/cannot count/i);
  });

  it('counts the levels the Atlas really holds', () => {
    const count = (level: string): number =>
      coverage.levels.find((entry) => entry.level === level)?.count ?? -1;
    expect(count('component')).toBe(3);
    expect(count('kanji')).toBe(5);
    expect(count('word')).toBe(4);
    expect(count('sentence')).toBe(1);
  });

  it('gives every level a basis, so no empty level is unexplained', () => {
    coverage.levels.forEach((entry) => {
      expect(entry.basis.length, entry.level).toBeGreaterThan(0);
    });
  });
});

describe('degree without materialising', () => {
  it('counts a node’s adjacency entries without building a single node', () => {
    // 森: one `component_of` in, two `contains` in (森林, 青森).
    expect(adjacencyDegree(ladder, 'kanji:森')).toBe(3);
    expect(adjacencyDegree(ladder, 'kanji:nope')).toBe(0);
  });
});
