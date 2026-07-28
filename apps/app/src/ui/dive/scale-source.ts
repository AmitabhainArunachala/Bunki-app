/**
 * The Atlas, assembled from the shipped dictionary (lane B2).
 *
 * ## What this file is
 *
 * `@bunki/domain` indexes a typed content graph and projects a scale ladder over
 * it, and it may not import `@bunki/seed` (ADR-001 boundary 1). So somebody has
 * to hand it nodes and edges. This is that somebody, for the app: it reads the
 * two shipped tiers and emits a `KnowledgeGraphSource`, once.
 *
 * ## Every edge here is in the files
 *
 * That is the rule this module exists to keep, and it is the same rule the era
 * attribution keeps on the other side of the house: **nothing is inferred.**
 *
 *   - `contains` from a word to a character is JMdict's own `kanjiUsed`.
 *   - `component_of` from a component to a character is KanjiVG's `kvg:element`
 *     and `kvg:radical` annotations, extracted by the importer from the verbatim
 *     files and re-derived from those bytes by the seed's own tests.
 *   - `has_reading` is KANJIDIC2's on- and kun-reading lists.
 *   - `contains` from a sentence to a word is the Tatoeba pair's own `entSeq`,
 *     which is the JMdict entry whose headword selected it.
 *
 * And two edges the graph model has that this source deliberately **does not
 * emit**, because no shipped file declares them:
 *
 *   - `contrasts_with`. Nothing in JMdict or KANJIDIC2 says two characters are
 *     confusable. A "contrast set" derived from a shared component would be this
 *     module's guess wearing the domain's vocabulary, so the surface says
 *     "characters that share a component" and never says "contrast".
 *   - `collocates_with`. There is no phrase inventory in any shipped file.
 *
 * ## Component roles are `unclassified`, and that is the data
 *
 * `ComponentRole` has `semantic`, `phonetic`, `corrupted` and `unclassified`,
 * and `unclassified` is a first-class member precisely so that "we do not know
 * whether this shape is carrying sound or meaning" can be said. KanjiVG's
 * `kvg:element` is a *shape* annotation and carries no such claim, so every edge
 * from this source is `unclassified` and the page says so out loud. Marking a
 * radical `semantic` would be exactly the invented etymology the frozen spec's
 * §2.5 split exists to prevent — a radical is often, and not always, the
 * meaning-bearing part.
 *
 * ## Cost
 *
 * Built once, lazily, on the first dive rather than at module load: a learner
 * who never opens a character page never pays for it. The measured cost of the
 * build over the real 3,000-lexeme tier is recorded in
 * `docs/build-evidence/PERF_DIVE.md` and asserted by `test/dive-scale-source.test.ts`.
 */

import {
  buildKnowledgeGraph,
  buildScaleLadder,
  type GraphEdge,
  type GraphNode,
  type KnowledgeGraphSource,
  type ScaleLadder,
  type StrokeRecord,
} from '@bunki/domain';

import {
  importedDictionary,
  importedStrokeSet,
  seedDataset,
  type SeedKanji,
  type SeedLexeme,
} from '../../data/catalog.ts';
import { IMPORTED_KANJI, IMPORTED_LEXEMES } from '../../data/imported-tier.ts';

/* ------------------------------------------------------------------ *
 * Ids
 * ------------------------------------------------------------------ */

/**
 * Node ids, in one place.
 *
 * `graph/model.ts` is explicit that an id is an identity and never a
 * classification — nothing in the domain parses one. These helpers exist so the
 * *app* has one spelling of each id rather than four, not so that anything can
 * read a kind back out of a string.
 */
export const kanjiNodeId = (character: string): string => `kanji:${character}`;
export const componentNodeId = (element: string): string => `component:${element}`;
export const readingNodeId = (reading: string): string => `reading:${reading}`;
export const sentenceNodeId = (id: string): string => `sentence:${id}`;
/** A lexeme keeps the id the dictionary gave it, so a route can round-trip it. */
export const lexemeNodeId = (lexeme: SeedLexeme): string => lexeme.id;

/* ------------------------------------------------------------------ *
 * The source
 * ------------------------------------------------------------------ */

/**
 * KANJIDIC2 writes a kun reading as `き.る` — the dot marks where the okurigana
 * begins. The dot is orthographic bookkeeping rather than part of the reading,
 * so it comes out for the purpose of grouping characters that genuinely share a
 * reading; the page still renders the reading as the file writes it.
 */
const readingKey = (reading: string): string => reading.replace('.', '');

interface Accumulator {
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly seenNodes: Set<string>;
}

function addNode(into: Accumulator, node: GraphNode): void {
  if (into.seenNodes.has(node.id)) return;
  into.seenNodes.add(node.id);
  into.nodes.push(node);
}

function addKanji(into: Accumulator, kanji: SeedKanji): void {
  const id = kanjiNodeId(kanji.character);
  addNode(into, {
    id,
    kind: 'kanji',
    label: kanji.character,
    // No contract is instantiated for a dictionary entry nobody captured
    // (REQ-LM-01 instantiates sparsely, on capture), and an invented join key
    // would make an unmet character render as *weak* rather than as *unknown*.
    componentIds: [],
  });

  const elements = new Set<string>([
    ...kanji.components,
    ...kanji.radicals.map((radical) => radical.element),
  ]);
  elements.forEach((element) => {
    if (element === '') return;
    const componentId = componentNodeId(element);
    addNode(into, { id: componentId, kind: 'component', label: element, componentIds: [] });
    into.edges.push({
      kind: 'component_of',
      from: componentId,
      to: id,
      // See this file's header: KanjiVG annotates a shape, never a role.
      role: 'unclassified',
    });
  });

  [...kanji.onReadings, ...kanji.kunReadings].forEach((reading) => {
    const key = readingKey(reading);
    if (key === '') return;
    const nodeId = readingNodeId(key);
    addNode(into, { id: nodeId, kind: 'reading', label: key, componentIds: [] });
    into.edges.push({ kind: 'has_reading', from: id, to: nodeId });
  });
}

function addLexeme(into: Accumulator, lexeme: SeedLexeme): void {
  const id = lexemeNodeId(lexeme);
  addNode(into, { id, kind: 'lexeme', label: lexeme.headword, componentIds: [] });
  lexeme.kanjiUsed.forEach((character) => {
    if (character === '') return;
    into.edges.push({ kind: 'contains', from: id, to: kanjiNodeId(character) });
  });
}

/**
 * The graph source for this build.
 *
 * Both tiers, fixture first — the same ordering rule the search uses, and for
 * the same reason: `buildKnowledgeGraph` keeps the *first* declaration of a
 * duplicate id, so the canonical fixture records the closed loop is written
 * against must be declared before the imported ones.
 */
export function buildAppGraphSource(): KnowledgeGraphSource {
  const into: Accumulator = { nodes: [], edges: [], seenNodes: new Set() };

  seedDataset.kanji.forEach((kanji) => addKanji(into, kanji));
  IMPORTED_KANJI.forEach((kanji) => addKanji(into, kanji));

  seedDataset.lexemes.forEach((lexeme) => addLexeme(into, lexeme));
  IMPORTED_LEXEMES.forEach((lexeme) => addLexeme(into, lexeme));

  seedDataset.sentences.forEach((sentence) => {
    const id = sentenceNodeId(sentence.id);
    addNode(into, { id, kind: 'sentence', label: sentence.japanese, componentIds: [] });
    sentence.lexemeIds.forEach((lexemeId) => {
      into.edges.push({ kind: 'contains', from: id, to: lexemeId });
    });
  });

  // A Tatoeba pair reaches its word through the JMdict `ent_seq` that selected
  // it, which is the only join the import records. A pair whose entry is not in
  // the shipped 3,000 simply has no edge — the dangling edge would be reported
  // by the builder, and there is no reason to create one.
  const lexemeByEntSeq = new Map<string, string>();
  importedDictionary.lexemes.forEach((lexeme) => {
    if (!lexemeByEntSeq.has(lexeme.sourceEntryId)) {
      lexemeByEntSeq.set(lexeme.sourceEntryId, lexeme.id);
    }
  });
  importedDictionary.sentences.forEach((sentence) => {
    const lexemeId = lexemeByEntSeq.get(sentence.entSeq);
    if (lexemeId === undefined) return;
    const id = sentenceNodeId(sentence.id);
    addNode(into, { id, kind: 'sentence', label: sentence.japanese, componentIds: [] });
    into.edges.push({ kind: 'contains', from: id, to: lexemeId });
  });

  return { nodes: into.nodes, edges: into.edges };
}

/* ------------------------------------------------------------------ *
 * Strokes
 * ------------------------------------------------------------------ */

/**
 * KanjiVG geometry for one character, on demand.
 *
 * The whole tier's geometry is 4.7 MB of verbatim SVG that may not leave
 * `packages/seed` (controller §4, DL-33). The importer extracted the paths from
 * those same committed bytes and the seed's own test re-derives every one of
 * them from the originals, so this is the licensor's drawing either way. What
 * matters here is that it is fetched **per character**: the ladder never holds
 * more than the strokes of what is on screen.
 *
 * `character` rather than a node id would have been the obvious signature; the
 * ladder hands over the *node id* it was given, so this reverses the one mapping
 * this file owns rather than asking the domain to know about `kanji:` prefixes.
 */
const KANJI_ID_PREFIX = 'kanji:';

/**
 * The character a `kanji:` node id names, or `null`.
 *
 * The inverse of {@link kanjiNodeId}, and the *only* place in the app that reads
 * a kind back out of an id — which is legitimate here because this module is the
 * one that mints them. `graph/model.ts`'s rule is about not deriving meaning
 * from an id somebody else's convention produced.
 */
export function characterOfKanjiNodeId(nodeId: string): string | null {
  if (!nodeId.startsWith(KANJI_ID_PREFIX)) return null;
  const character = nodeId.slice(KANJI_ID_PREFIX.length);
  return character === '' ? null : character;
}

export function strokesForNodeId(nodeId: string): readonly StrokeRecord[] {
  const character = characterOfKanjiNodeId(nodeId);
  if (character === null) return [];
  const set = importedStrokeSet(character);
  if (set === null) return [];
  return set.strokes.map((stroke) => ({
    order: stroke.order,
    path: stroke.d,
    kind: stroke.type,
  }));
}

/* ------------------------------------------------------------------ *
 * The ladder, built once
 * ------------------------------------------------------------------ */

export interface LadderBuildCost {
  /** Milliseconds spent indexing the graph and building the ladder. */
  readonly buildMs: number;
  readonly nodeCount: number;
  readonly edgeCount: number;
  /** What `buildKnowledgeGraph` had to say about the source. */
  readonly diagnosticCount: number;
}

let cached: { readonly ladder: ScaleLadder; readonly cost: LadderBuildCost } | null = null;

/**
 * The ladder, built on first use and kept.
 *
 * Module-level memoisation rather than a React cache: the graph is a function of
 * the shipped bundle and nothing else, so it cannot go stale within a session,
 * and rebuilding it per mount is precisely the defect lane A2 had to repair on
 * the time scrubber. `resetLadderCache` exists for the tests that measure the
 * cold build; nothing in the app calls it.
 */
export function appScaleLadder(): { readonly ladder: ScaleLadder; readonly cost: LadderBuildCost } {
  if (cached !== null) return cached;

  // `performance.now()` rather than a clock from the domain context: this
  // measures the app's own wall-clock cost for the evidence record, and it feeds
  // no state, no event and no projection. Nothing branches on it.
  const started = globalThis.performance.now();
  const source = buildAppGraphSource();
  const graph = buildKnowledgeGraph(source);
  const ladder = buildScaleLadder({ graph, strokesFor: strokesForNodeId });
  const buildMs = globalThis.performance.now() - started;

  cached = {
    ladder,
    cost: {
      buildMs,
      nodeCount: graph.nodes.size,
      edgeCount: graph.edgeCount,
      diagnosticCount: graph.diagnostics.length,
    },
  };
  return cached;
}

/** Drop the memoised ladder. For measurement only; the app never calls it. */
export function resetLadderCache(): void {
  cached = null;
}
