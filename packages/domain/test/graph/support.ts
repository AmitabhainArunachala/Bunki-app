/**
 * Fixtures for the graph projections (Campaign E / A2).
 *
 * Two of them, and the split matters.
 *
 * {@link SEED_SHAPED_GRAPH} is small enough to read: the ten-kanji, sixteen-word
 * shape `@bunki/seed` actually ships, hand-written here because
 * `@bunki/domain` may not import a sibling package (ADR-001 boundary 1) and
 * because a projection test should be readable without opening a dataset.
 *
 * {@link buildDictionaryTierGraph} is the 3,000-lexeme tier the map has to stay
 * interactive over. It is generated rather than stored so the performance test
 * measures the projection and not JSON parsing, and it is generated
 * *deterministically* — index arithmetic, no randomness — so a slow run is a
 * regression and never a different graph.
 */

import type {
  ContractActivation,
  GraphEdge,
  GraphNode,
  KnowledgeGraphSource,
  ProjectedContract,
} from '../../src/index.ts';
import type { IsoInstant } from '../../src/index.ts';

export function componentIdFor(target: string): string {
  return `kc:${target}`;
}

// ---------------------------------------------------------------------------
// The small, readable graph
// ---------------------------------------------------------------------------

const KANJI: readonly (readonly [string, string, readonly string[]])[] = [
  ['分', 'kanji:分', ['reading:ブン', 'reading:フン']],
  ['岐', 'kanji:岐', ['reading:キ']],
  ['点', 'kanji:点', ['reading:テン']],
  ['文', 'kanji:文', ['reading:ブン', 'reading:モン']],
  ['聞', 'kanji:聞', ['reading:ブン', 'reading:モン']],
];

const COMPONENTS: readonly (readonly [string, string, string])[] = [
  ['八', 'component:八', 'kanji:分'],
  ['刀', 'component:刀', 'kanji:分'],
  ['山', 'component:山', 'kanji:岐'],
  ['支', 'component:支', 'kanji:岐'],
  ['門', 'component:門', 'kanji:聞'],
  ['耳', 'component:耳', 'kanji:聞'],
];

/** `component_of` roles, so the semantic/phonetic split is exercised. */
const COMPONENT_ROLES: Readonly<Record<string, 'semantic' | 'phonetic' | 'unclassified'>> = {
  'component:八': 'semantic',
  'component:刀': 'semantic',
  'component:山': 'semantic',
  'component:支': 'phonetic',
  'component:門': 'phonetic',
  'component:耳': 'semantic',
};

const LEXEMES: readonly (readonly [string, string, readonly string[], readonly string[]])[] = [
  ['分岐', 'lex-bunki', ['kanji:分', 'kanji:岐'], ['reading:ぶんき']],
  ['分岐点', 'lex-bunkiten', ['kanji:分', 'kanji:岐', 'kanji:点'], ['reading:ぶんきてん']],
  ['文学', 'lex-bungaku', ['kanji:文'], ['reading:ぶんがく']],
  ['新聞', 'lex-shinbun', ['kanji:聞'], ['reading:しんぶん']],
];

function readingNodes(): readonly GraphNode[] {
  const ids = new Set<string>();
  KANJI.forEach(([, , readings]) => readings.forEach((id) => ids.add(id)));
  LEXEMES.forEach(([, , , readings]) => readings.forEach((id) => ids.add(id)));
  return [...ids].sort().map((id) => ({
    id,
    kind: 'reading' as const,
    label: id.slice('reading:'.length),
    componentIds: [],
  }));
}

export const SEED_SHAPED_SOURCE: KnowledgeGraphSource = (() => {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  KANJI.forEach(([character, id, readings]) => {
    nodes.push({ id, kind: 'kanji', label: character, componentIds: [componentIdFor(character)] });
    readings.forEach((reading) => edges.push({ kind: 'has_reading', from: id, to: reading }));
  });

  COMPONENTS.forEach(([character, id, kanjiId]) => {
    nodes.push({ id, kind: 'component', label: character, componentIds: [] });
    edges.push({
      kind: 'component_of',
      from: id,
      to: kanjiId,
      role: COMPONENT_ROLES[id] ?? 'unclassified',
    });
  });

  LEXEMES.forEach(([headword, id, kanjiIds, readings]) => {
    nodes.push({ id, kind: 'lexeme', label: headword, componentIds: [componentIdFor(headword)] });
    kanjiIds.forEach((kanjiId) => edges.push({ kind: 'contains', from: id, to: kanjiId }));
    readings.forEach((reading) => edges.push({ kind: 'has_reading', from: id, to: reading }));
  });

  nodes.push(...readingNodes());

  // Senses, a construction, a sentence, an encounter — one of each so every
  // named group has something in it somewhere.
  nodes.push({
    id: 'sense:lex-bunki:branching',
    kind: 'sense',
    label: 'branching',
    componentIds: [],
  });
  edges.push({ kind: 'has_sense', from: 'lex-bunki', to: 'sense:lex-bunki:branching' });

  nodes.push({
    id: 'grammar:ni-yori',
    kind: 'grammar_construction',
    label: 'により',
    componentIds: [],
  });
  nodes.push({
    id: 'sentence:001',
    kind: 'sentence',
    label: '線路が分岐点で分かれる。',
    componentIds: [],
  });
  edges.push({ kind: 'contains', from: 'sentence:001', to: 'lex-bunkiten' });
  edges.push({ kind: 'contains', from: 'sentence:001', to: 'lex-bunki' });
  edges.push({ kind: 'realises', from: 'sentence:001', to: 'grammar:ni-yori' });

  nodes.push({
    id: 'encounter:e1',
    kind: 'encounter',
    label: 'NHK clip, 2026-05-02',
    componentIds: [],
    encounterId: 'enc-1',
  });
  edges.push({ kind: 'appeared_in', from: 'lex-bunki', to: 'encounter:e1' });

  // The confusable pair of frozen v1 §10.5, and one collocation.
  edges.push({ kind: 'contrasts_with', from: 'kanji:分', to: 'kanji:文' });
  edges.push({ kind: 'collocates_with', from: 'lex-bunki', to: 'lex-bunkiten' });

  return Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges) });
})();

// ---------------------------------------------------------------------------
// The dictionary tier
// ---------------------------------------------------------------------------

export interface DictionaryTier {
  readonly source: KnowledgeGraphSource;
  readonly lexemeIds: readonly string[];
  readonly kanjiIds: readonly string[];
}

function pad(value: number): string {
  return String(value).padStart(5, '0');
}

/**
 * A synthetic tier with the same *shape* as the real one: 3,000 lexemes over
 * ~2,000 kanji over ~400 components, with reading families and contrast pairs.
 *
 * The hub structure is deliberate. Real readings are hubs — hundreds of kanji
 * share ブン-class readings — and a bounded walk that only ever met sparse nodes
 * would prove nothing about the case that actually threatens an interactive map.
 */
export function buildDictionaryTierGraph(lexemeCount = 3000): DictionaryTier {
  const kanjiCount = Math.max(1, Math.floor(lexemeCount * 0.7));
  const componentCount = Math.max(1, Math.floor(kanjiCount / 5));
  const readingCount = Math.max(1, Math.floor(kanjiCount / 8));
  const sentenceCount = Math.max(1, Math.floor(lexemeCount / 3));

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const kanjiIds: string[] = [];
  const lexemeIds: string[] = [];

  for (let index = 0; index < componentCount; index += 1) {
    nodes.push({
      id: `component:${pad(index)}`,
      kind: 'component',
      label: `c${index}`,
      componentIds: [],
    });
  }
  for (let index = 0; index < readingCount; index += 1) {
    nodes.push({
      id: `reading:${pad(index)}`,
      kind: 'reading',
      label: `r${index}`,
      componentIds: [],
    });
  }

  for (let index = 0; index < kanjiCount; index += 1) {
    const id = `kanji:${pad(index)}`;
    kanjiIds.push(id);
    nodes.push({ id, kind: 'kanji', label: `k${index}`, componentIds: [`kc:k${index}`] });

    edges.push({
      kind: 'component_of',
      from: `component:${pad(index % componentCount)}`,
      to: id,
      role: index % 2 === 0 ? 'semantic' : 'phonetic',
    });
    edges.push({
      kind: 'component_of',
      from: `component:${pad((index * 7 + 3) % componentCount)}`,
      to: id,
      role: 'unclassified',
    });
    edges.push({ kind: 'has_reading', from: id, to: `reading:${pad(index % readingCount)}` });
    edges.push({
      kind: 'has_reading',
      from: id,
      to: `reading:${pad((index * 3 + 1) % readingCount)}`,
    });
    if (index % 11 === 0 && index + 1 < kanjiCount) {
      edges.push({ kind: 'contrasts_with', from: id, to: `kanji:${pad(index + 1)}` });
    }
  }

  for (let index = 0; index < lexemeCount; index += 1) {
    const id = `lex:${pad(index)}`;
    lexemeIds.push(id);
    nodes.push({ id, kind: 'lexeme', label: `w${index}`, componentIds: [`kc:w${index}`] });
    edges.push({ kind: 'contains', from: id, to: `kanji:${pad(index % kanjiCount)}` });
    edges.push({
      kind: 'contains',
      from: id,
      to: `kanji:${pad((index * 13 + 5) % kanjiCount)}`,
    });
    edges.push({ kind: 'has_reading', from: id, to: `reading:${pad(index % readingCount)}` });
  }

  for (let index = 0; index < sentenceCount; index += 1) {
    const id = `sentence:${pad(index)}`;
    nodes.push({ id, kind: 'sentence', label: `s${index}`, componentIds: [] });
    edges.push({ kind: 'contains', from: id, to: `lex:${pad(index % lexemeCount)}` });
    edges.push({
      kind: 'contains',
      from: id,
      to: `lex:${pad((index * 17 + 9) % lexemeCount)}`,
    });
  }

  return {
    source: { nodes, edges },
    lexemeIds,
    kanjiIds,
  };
}

// ---------------------------------------------------------------------------
// Trace-side fixtures
// ---------------------------------------------------------------------------

export function instant(dayOffset: number, hour = 9): IsoInstant {
  // 2026-01-01 plus `dayOffset` days, kept inside one year so the arithmetic
  // stays readable. No Date: the string is assembled from the calendar directly.
  const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let remaining = dayOffset;
  let month = 0;
  while (month < 11 && remaining >= (monthLengths[month] ?? 31)) {
    remaining -= monthLengths[month] ?? 31;
    month += 1;
  }
  const day = String(remaining + 1).padStart(2, '0');
  const monthText = String(month + 1).padStart(2, '0');
  const hourText = String(hour).padStart(2, '0');
  return `2026-${monthText}-${day}T${hourText}:00:00.000Z`;
}

export function contractsFor(
  componentId: string,
  skills: readonly ProjectedContract['skill'][],
): readonly ProjectedContract[] {
  return skills.map((skill) => ({
    contractId: `contract:${componentId}:${skill}`,
    targetComponentId: componentId,
    skill,
  }));
}

export function activationsFor(
  contracts: readonly ProjectedContract[],
  activatedAt: IsoInstant,
): readonly ContractActivation[] {
  return contracts.map((contract) => ({ contractId: contract.contractId, activatedAt }));
}
