/**
 * The Atlas the map draws, assembled from the seed (Campaign E / B1).
 *
 * ## Every edge here is an edge the data holds
 *
 * This is the rule the whole lane turns on, and it is the reason this file is
 * mostly a list of justifications rather than a list of edges. The fractal-dive
 * brief names the failure it prevents: *"the most seductive failure available to
 * this feature is a layout that looks like a fractal but does not follow the
 * actual graph — an invented edge for visual balance. That is the same defect
 * class as a guessed era."*
 *
 * So each of the four edge kinds below cites the field it was read from, and no
 * fifth kind exists. In particular there is **no `contrasts_with` edge**, even
 * though the domain models one and a contrast set would look good on a map: the
 * frozen v1 §10.5 contrast dimension needs the 類義漢字 semantic-field data,
 * and this build ships none of it. Two kanji sharing a component is a
 * *component* relation, already drawn as one, and re-labelling it "confusable"
 * would be an assertion about a learner's eyes that nothing measured.
 *
 * | Edge | Read from | What it means |
 * |---|---|---|
 * | `contains` | `SeedLexeme.kanjiUsed` | this word is written with that character |
 * | `component_of` | `SeedKanji.components` | that element is drawn inside this character |
 * | `has_reading` (lexeme) | `SeedLexeme.reading` | this word is read so |
 * | `has_reading` (kanji) | `SeedKanji.onReadings`/`kunReadings` | KANJIDIC2 lists this reading |
 *
 * The `component_of` edges carry role `unclassified` and that is not laziness.
 * KANJIDIC2's component list says *which* elements a character contains and says
 * nothing about whether one is carrying sound or meaning; `COMPONENT_ROLES`
 * includes `unclassified` precisely so that answer can be given. Tagging them
 * `semantic` would put an invented etymology on the map, which is the defect
 * frozen v1 §10.1 diagnoses in renzo's 演 page from the other direction.
 *
 * ## Reading nodes are what make a family one hop
 *
 * A `reading` node is why 分 and 文 are neighbours: both reach `reading:ぶん`.
 * The domain's `neighbourhood.ts` walks *through* that node, so a reading family
 * is a two-hop walk rather than a scan over every kanji's reading list — which
 * is what keeps a local query local. Readings are normalised to hiragana with
 * KANJIDIC2's okurigana and affix marks stripped, so 「ひと.つ」 and 「ヒト」
 * reach the same node; the normalisation is shared with the era rules through
 * `toHiragana`, so the two cannot drift.
 *
 * ## Cost, measured rather than asserted
 *
 * The index is built **once**, lazily, on the first query, and memoised. It is
 * never rebuilt — not per frame, not per scrubber tick, not per lens change.
 * That is the discipline lane A2 had to repair ("the time scrubber rebuilt the
 * whole index on every frame") and this lane is the one most likely to repeat
 * it, so the build is behind one function and `test/map-performance.test.ts`
 * measures it and asserts a ceiling. Per-frame work is bounded by
 * `neighbourhoodOf`'s own `maxNodes`, which never walks the whole graph.
 *
 * Nothing in this file reads a memory state, a contract, or an event. It is the
 * Atlas half only; the Trace arrives separately in `map-projection.ts`.
 */

import {
  buildKnowledgeGraph,
  componentIdForTargetKey,
  toHiragana,
  type CharacterReadings,
  type EraSource,
  type GraphEdge,
  type GraphNode,
  type GraphNodeId,
  type KnowledgeGraph,
} from '@bunki/domain';

import { seedDataset, type SeedKanji, type SeedLexeme } from '../../data/catalog.ts';
// The adapted imported tier, from the module that owns the adaptation. The
// catalog barrel re-exports the raw `importedDictionary`, whose records are a
// different shape (`strokeCount: number | null`); adapting them a second time
// here would be a second place the adaptation could drift.
import { IMPORTED_KANJI, IMPORTED_LEXEMES } from '../../data/imported-tier.ts';

/* ------------------------------------------------------------------ *
 * Ids
 * ------------------------------------------------------------------ */

/**
 * Node ids are `kind:key`, and nothing parses them back.
 *
 * The domain is explicit that a `GraphNodeId` is an identity and `kind` is the
 * authority (`graph/model.ts`), so these helpers exist to *make* ids
 * consistently, never to recover meaning from one. `nodeSubject` below reads the
 * node's own `kind` and `label` instead.
 */
export const lexemeNodeId = (lexemeId: string): GraphNodeId => `lexeme:${lexemeId}`;
export const kanjiNodeId = (character: string): GraphNodeId => `kanji:${character}`;
export const componentNodeId = (element: string): GraphNodeId => `component:${element}`;
export const readingNodeId = (reading: string): GraphNodeId => `reading:${reading}`;

/**
 * The canonical KnowledgeComponent id for a target, mirroring the kernel's rule.
 *
 * `packages/domain/src/contracts/component-identity.ts` derives a component id
 * as `"kc:" + the exact text the learner captured`. A map node's
 * `componentIds` is the join key between the Atlas and the Trace, so it has to
 * be that same string or every node would project as unknown for want of a
 * matching key rather than for want of evidence — which is the one confusion
 * this map may not make.
 *
 * The kernel's own `componentIdForTargetKey` is called rather than the prefix
 * being retyped here, so the two cannot drift: if the kernel ever namespaces
 * ids differently, this moves with it instead of silently missing every lookup.
 */
const componentIdForTarget = (target: string): string => componentIdForTargetKey(target);

/* ------------------------------------------------------------------ *
 * Reading normalisation
 * ------------------------------------------------------------------ */

/**
 * A KANJIDIC2 reading, reduced to the form a reading family joins on.
 *
 * Katakana on-readings and hiragana kun-readings become one hiragana string;
 * `.` (the okurigana split) and `-` (the affix mark) are dropped. Returns `''`
 * for a reading that reduces to nothing, and the caller drops those rather than
 * minting an empty node.
 */
export function normaliseReading(raw: string): string {
  return toHiragana(raw.replaceAll('-', '').replaceAll('.', '')).trim();
}

/* ------------------------------------------------------------------ *
 * What a node is about, for the surfaces that draw it
 * ------------------------------------------------------------------ */

/** What a node stands for, so a tap knows where to go. */
export type NodeSubject =
  | { readonly kind: 'lexeme'; readonly lexemeId: string; readonly headword: string }
  | { readonly kind: 'kanji'; readonly character: string }
  | { readonly kind: 'component'; readonly element: string }
  | { readonly kind: 'reading'; readonly reading: string };

/** The seed records behind the graph, indexed for the surfaces. */
export interface MapAtlas {
  readonly graph: KnowledgeGraph;
  readonly lexemes: ReadonlyMap<string, SeedLexeme>;
  readonly kanji: ReadonlyMap<string, SeedKanji>;
  /** `EraSource` per lexeme node id, for `attributeNodeEra`. */
  readonly eraSources: ReadonlyMap<GraphNodeId, EraSource>;
  /** How long the build took, in milliseconds, on this device. */
  readonly buildMs: number;
}

/**
 * What a node stands for, read from the node itself.
 *
 * `null` for a kind this file does not mint, which keeps the function total
 * against a graph that grew a node kind without this file noticing — a
 * `default: throw` would take the map down for a node it could simply not
 * decorate.
 */
export function nodeSubject(node: GraphNode): NodeSubject | null {
  switch (node.kind) {
    case 'lexeme':
      return { kind: 'lexeme', lexemeId: node.id.slice('lexeme:'.length), headword: node.label };
    case 'kanji':
      return { kind: 'kanji', character: node.label };
    case 'component':
      return { kind: 'component', element: node.label };
    case 'reading':
      return { kind: 'reading', reading: node.label };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ *
 * The build
 * ------------------------------------------------------------------ */

/**
 * Assemble the Atlas from a fixed pair of record lists.
 *
 * Exported and parameterised so the tests can build a five-record atlas and
 * assert edge-for-edge that nothing was invented, rather than asserting against
 * 4,000 records where an extra edge would hide. The app calls {@link mapAtlas},
 * which memoises this over the shipped tiers.
 */
export function buildMapAtlas(
  lexemes: readonly SeedLexeme[],
  kanji: readonly SeedKanji[],
): MapAtlas {
  const startedAt = Date.now();

  const nodes = new Map<GraphNodeId, GraphNode>();
  const edges: GraphEdge[] = [];
  const lexemeIndex = new Map<string, SeedLexeme>();
  const kanjiIndex = new Map<string, SeedKanji>();
  const eraSources = new Map<GraphNodeId, EraSource>();

  /** Readings per character, for the era rules. Built alongside the nodes. */
  const characterReadings = new Map<string, CharacterReadings>();

  const put = (node: GraphNode): void => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  /**
   * Edges already emitted, so one relation is declared once.
   *
   * This is not defensive tidying, it is a consequence of the normalisation
   * above and it is worth naming. KANJIDIC2 lists 上 with 「あ.げる」 and
   * 「あ.がる」 *and* their okurigana-less variants; `normaliseReading` maps
   * several of those raw strings onto one reading node, which is exactly what a
   * reading family wants. Emitting one edge per raw string would then declare
   * the same relation up to four times.
   *
   * The domain would handle it — `buildKnowledgeGraph` drops a repeat and
   * records a `duplicate_edge` diagnostic — but 149 diagnostics that all say
   * "your normalisation worked" would drown the diagnostics that mean something.
   * So the collapse happens here, where the reason for it is.
   */
  const emitted = new Set<string>();
  const link = (edge: GraphEdge): void => {
    const key = `${edge.kind}\u0000${edge.from}\u0000${edge.to}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    edges.push(edge);
  };

  // --- kanji, their components, and their readings -------------------------
  for (const record of kanji) {
    if (kanjiIndex.has(record.character)) continue;
    kanjiIndex.set(record.character, record);
    characterReadings.set(record.character, {
      on: record.onReadings,
      kun: record.kunReadings,
    });

    const id = kanjiNodeId(record.character);
    put({
      id,
      kind: 'kanji',
      label: record.character,
      componentIds: [componentIdForTarget(record.character)],
    });

    for (const element of record.components) {
      // A character lists itself among its own components in KANJIDIC2 often
      // enough to matter. A self-edge is not a relation and the domain would
      // report it as a diagnostic, so it is dropped at the source.
      if (element === record.character || element === '') continue;
      const elementId = componentNodeId(element);
      put({
        id: elementId,
        kind: 'component',
        label: element,
        componentIds: [componentIdForTarget(element)],
      });
      // Role `unclassified`: KANJIDIC2 says which elements are present and
      // never says which is phonetic. See the header.
      link({ kind: 'component_of', from: elementId, to: id, role: 'unclassified' });
    }

    for (const raw of [...record.onReadings, ...record.kunReadings]) {
      const reading = normaliseReading(raw);
      if (reading === '') continue;
      const id2 = readingNodeId(reading);
      put({ id: id2, kind: 'reading', label: reading, componentIds: [] });
      link({ kind: 'has_reading', from: id, to: id2 });
    }
  }

  // --- lexemes, the kanji they are written with, and their own reading -----
  for (const record of lexemes) {
    if (lexemeIndex.has(record.id)) continue;
    lexemeIndex.set(record.id, record);

    const id = lexemeNodeId(record.id);
    put({
      id,
      kind: 'lexeme',
      label: record.headword,
      componentIds: [componentIdForTarget(record.headword)],
    });

    for (const character of record.kanjiUsed) {
      const target = kanjiNodeId(character);
      // Only when the character is a node we actually hold. An edge to a
      // character this build does not ship would be a dangling edge — the
      // domain reports those rather than dropping them, and a map that drew
      // one would be pointing at nothing.
      if (!kanjiIndex.has(character)) continue;
      link({ kind: 'contains', from: id, to: target });
    }

    const reading = normaliseReading(record.reading);
    if (reading !== '') {
      const readingId = readingNodeId(reading);
      put({ id: readingId, kind: 'reading', label: reading, componentIds: [] });
      link({ kind: 'has_reading', from: id, to: readingId });
    }

    eraSources.set(id, {
      headword: record.headword,
      reading: record.reading,
      // The whole table is shared rather than copied per lexeme: the era rules
      // only ever `get` the characters of the headword in front of them, and
      // 3,000 sliced maps would cost more than the graph.
      characterReadings,
    });
  }

  const graph = buildKnowledgeGraph({ nodes: [...nodes.values()], edges });

  return {
    graph,
    lexemes: lexemeIndex,
    kanji: kanjiIndex,
    eraSources,
    buildMs: Date.now() - startedAt,
  };
}

/* ------------------------------------------------------------------ *
 * The memo
 * ------------------------------------------------------------------ */

let memo: MapAtlas | null = null;

/**
 * The shipped Atlas, built at most once per session.
 *
 * Lazy rather than a module-level constant: importing this module must not cost
 * a graph build, because `map-routes.ts` and the tests import it for types and
 * helpers. The first *query* pays, and nothing after it does.
 */
export function mapAtlas(): MapAtlas {
  memo ??= buildMapAtlas(
    [...seedDataset.lexemes, ...IMPORTED_LEXEMES],
    [...seedDataset.kanji, ...IMPORTED_KANJI],
  );
  return memo;
}

/** Drop the memo. For tests that need to measure a cold build. */
export function resetMapAtlas(): void {
  memo = null;
}
