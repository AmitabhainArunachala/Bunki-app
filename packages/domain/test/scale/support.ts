/**
 * Fixtures for the scale ladder (Campaign E, Wave C / lane B2).
 *
 * The design document's own worked example, hand-written so the tests read as
 * the argument they are checking: 木 is a kanji and a component of 林; 林 is a
 * kanji and a component of 森; 森 is a kanji and a constituent of 森林. That
 * recursion is the whole claim, so the fixture has to actually contain it.
 *
 * `@bunki/domain` may not import a sibling package (ADR-001 boundary 1), so the
 * shape of the shipped tier is written here rather than loaded from `@bunki/seed`
 * — the same reason `test/graph/support.ts` gives.
 */

import {
  buildKnowledgeGraph,
  buildScaleLadder,
  type ComponentRole,
  type GraphEdge,
  type GraphNode,
  type KnowledgeGraphSource,
  type ScaleLadder,
  type StrokeRecord,
} from '../../src/index.ts';

/* ------------------------------------------------------------------ *
 * The forest
 * ------------------------------------------------------------------ */

const KANJI: readonly (readonly [character: string, id: string])[] = [
  ['木', 'kanji:木'],
  ['林', 'kanji:林'],
  ['森', 'kanji:森'],
  ['青', 'kanji:青'],
  ['道', 'kanji:道'],
];

/**
 * Components, as KANJIDIC2 gives them: `component:木` is a separate node from
 * `kanji:木`, because a component is a role a shape plays inside a character and
 * the two are joined by nothing this dataset records.
 */
const COMPONENT_OF: readonly (readonly [component: string, kanji: string, role: ComponentRole])[] =
  [
    ['component:木', 'kanji:林', 'semantic'],
    ['component:木', 'kanji:森', 'semantic'],
    ['component:木', 'kanji:木', 'semantic'],
    ['component:辶', 'kanji:道', 'semantic'],
    ['component:首', 'kanji:道', 'phonetic'],
  ];

const LEXEMES: readonly (readonly [headword: string, id: string, kanji: readonly string[]])[] = [
  ['森林', 'lex-shinrin', ['kanji:森', 'kanji:林']],
  ['青森', 'lex-aomori', ['kanji:青', 'kanji:森']],
  ['林道', 'lex-rindo', ['kanji:林', 'kanji:道']],
  ['木', 'lex-ki', ['kanji:木']],
];

export const FOREST_SOURCE: KnowledgeGraphSource = (() => {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  KANJI.forEach(([character, id]) => {
    nodes.push({ id, kind: 'kanji', label: character, componentIds: [`kc:${character}`] });
  });

  const componentIds = new Set(COMPONENT_OF.map(([component]) => component));
  componentIds.forEach((id) => {
    nodes.push({
      id,
      kind: 'component',
      label: id.slice('component:'.length),
      componentIds: [],
    });
  });
  COMPONENT_OF.forEach(([component, kanji, role]) => {
    /*
      `role` is declared on the tuple as `ComponentRole`, not as `string` cast
      through `GraphEdge['role']`. Under `exactOptionalPropertyTypes` that cast
      widened the value to `ComponentRole | undefined` — the indexed access of an
      optional property includes `undefined` — and assigning that back into the
      optional property is an error. The cast was the whole defect: it looked
      like it was narrowing and was in fact the only thing that could widen.
    */
    edges.push({ kind: 'component_of', from: component, to: kanji, role });
  });

  LEXEMES.forEach(([headword, id, kanji]) => {
    nodes.push({ id, kind: 'lexeme', label: headword, componentIds: [`kc:${headword}`] });
    kanji.forEach((kanjiId) => edges.push({ kind: 'contains', from: id, to: kanjiId }));
  });

  // A reading, so the ladder is exercised against a node kind that is a facet
  // rather than a scale, and a sentence so L5 has something in it.
  nodes.push({ id: 'reading:しんりん', kind: 'reading', label: 'しんりん', componentIds: [] });
  edges.push({ kind: 'has_reading', from: 'lex-shinrin', to: 'reading:しんりん' });

  nodes.push({
    id: 'sentence:001',
    kind: 'sentence',
    label: '森林が広がっている。',
    componentIds: [],
  });
  edges.push({ kind: 'contains', from: 'sentence:001', to: 'lex-shinrin' });

  return Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges) });
})();

export const FOREST_GRAPH = buildKnowledgeGraph(FOREST_SOURCE);

/* ------------------------------------------------------------------ *
 * Strokes
 * ------------------------------------------------------------------ */

/** 木 has four strokes; 林 has eight. Geometry stands in for KanjiVG's. */
export const FOREST_STROKES: Readonly<Record<string, readonly StrokeRecord[]>> = {
  'kanji:木': [
    { order: 1, path: 'M10,20 L90,20', kind: '㇐' },
    { order: 2, path: 'M50,10 L50,95', kind: '㇑' },
    { order: 3, path: 'M50,40 L20,80', kind: '㇒' },
    { order: 4, path: 'M50,40 L80,80', kind: null },
  ],
  'kanji:林': [
    { order: 1, path: 'M5,20 L45,20', kind: '㇐' },
    { order: 2, path: 'M25,10 L25,95', kind: '㇑' },
    { order: 3, path: 'M25,40 L8,80', kind: '㇒' },
    { order: 4, path: 'M25,40 L42,80', kind: null },
    { order: 5, path: 'M55,20 L95,20', kind: '㇐' },
    { order: 6, path: 'M75,10 L75,95', kind: '㇑' },
    { order: 7, path: 'M75,40 L58,80', kind: '㇒' },
    { order: 8, path: 'M75,40 L92,80', kind: null },
  ],
};

/** Counts how many times the ladder reached for stroke geometry. */
export interface CountingStrokeSource {
  readonly strokesFor: (id: string) => readonly StrokeRecord[];
  calls: number;
}

export function countingStrokes(
  table: Readonly<Record<string, readonly StrokeRecord[]>> = FOREST_STROKES,
): CountingStrokeSource {
  const counter: CountingStrokeSource = {
    calls: 0,
    strokesFor: (id: string): readonly StrokeRecord[] => {
      counter.calls += 1;
      return table[id] ?? [];
    },
  };
  return counter;
}

export function forestLadder(): ScaleLadder {
  return buildScaleLadder({
    graph: FOREST_GRAPH,
    strokesFor: (id) => FOREST_STROKES[id] ?? [],
  });
}
