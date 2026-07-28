/**
 * The ladder itself: what a scale node is, and where each level's data comes
 * from (Campaign E, Wave C / lane B2).
 *
 * ## This is a reading of the Atlas, not a second copy of it
 *
 * `src/graph/` already indexes the typed content graph — nodes, typed edges,
 * pre-sorted adjacency, both traversal directions. A ladder that re-indexed all
 * of that would be a parallel model, and a parallel model is a second place for
 * the truth to be wrong. So {@link ScaleLadder} **holds the graph** and adds
 * exactly the two things the graph has no vocabulary for:
 *
 *   - **L0 strokes.** KanjiVG geometry is not a graph node anywhere, and it
 *     should not become one: 1,241 characters at roughly ten strokes each is
 *     twelve thousand nodes whose only edge is "belongs to this character".
 *     They arrive through a *function* the caller supplies, consulted only for
 *     the character actually in view. That is level-of-detail culling pushed all
 *     the way down to the source.
 *   - **L4 collocations.** The graph has a `collocates_with` edge kind and no
 *     phrase node, so a collocation as a *unit* has to be declared. The shipped
 *     dictionary tier declares none — see {@link ScaleSource.collocations} — and
 *     the level is reported empty rather than filled with anything invented.
 *
 * Everything else — components, kanji, words, sentences — is a graph node
 * already, kept under its own id, with its own edges. Nothing is copied.
 *
 * ## Which graph node kinds are on the ladder, and which are not
 *
 * `sense`, `reading`, `grammar_construction` and `encounter` are **not** levels.
 * They are facets of a node rather than a scale it can be viewed at: a reading
 * is not made of kanji and does not make words, it is a property two kanji
 * share. Zooming toward one would not change scale, so putting them on the
 * ladder would break the single law the whole design rests on. They remain
 * reachable through `neighbourhoodOf`, which is where a reading family belongs.
 *
 * ## Purity
 *
 * No clock, no randomness, no I/O. {@link ScaleSource.strokesFor} is a function
 * the caller supplies and is expected to be pure; the ladder calls it at most
 * once per character per view and never stores its result, so an impure one
 * would show up as a caller's defect rather than as hidden state here.
 */

import type { ComponentId } from '../primitives.ts';
import { adjacencyOf, type KnowledgeGraph } from '../graph/build.ts';
import type { GraphNode, GraphNodeId, GraphNodeKind } from '../graph/model.ts';

import { SCALE_LEVELS, type ScaleLevel } from './levels.ts';

/* ------------------------------------------------------------------ *
 * Node identity
 * ------------------------------------------------------------------ */

/**
 * A node on the ladder.
 *
 * Opaque, exactly as `GraphNodeId` is: for the four levels that come from the
 * graph it **is** the graph node's own id, unchanged, so a caller holding one
 * can go straight back to `neighbourhoodOf` with it. Stroke ids are the one kind
 * this package mints, and {@link parseStrokeNodeId} is in the same module that
 * mints them — reading back an id you wrote yourself is not the mistake
 * `graph/model.ts` warns about, which is deriving meaning from an id somebody
 * else's convention produced.
 */
export type ScaleNodeId = string;

/**
 * The prefix on a minted stroke id.
 *
 * The stroke's *order* comes before the character's node id so that parsing is
 * unambiguous with no escaping: digits, one colon, then the caller's id
 * verbatim, whatever is in it.
 */
export const STROKE_ID_PREFIX = 'scale-stroke:';

export function strokeNodeId(kanjiNodeId: GraphNodeId, order: number): ScaleNodeId {
  return `${STROKE_ID_PREFIX}${String(order)}:${kanjiNodeId}`;
}

/** The character and stroke a minted id names, or `null` for any other id. */
export function parseStrokeNodeId(
  id: ScaleNodeId,
): { readonly kanjiNodeId: GraphNodeId; readonly order: number } | null {
  if (!id.startsWith(STROKE_ID_PREFIX)) return null;
  const rest = id.slice(STROKE_ID_PREFIX.length);
  const colon = rest.indexOf(':');
  if (colon <= 0) return null;
  const order = Number.parseInt(rest.slice(0, colon), 10);
  if (!Number.isInteger(order) || order < 1) return null;
  return { kanjiNodeId: rest.slice(colon + 1), order };
}

/* ------------------------------------------------------------------ *
 * The source
 * ------------------------------------------------------------------ */

/** One stroke of one character, in writing order. KanjiVG's own geometry. */
export interface StrokeRecord {
  /** 1-based position in the writing order. */
  readonly order: number;
  /** The SVG path `d` attribute, verbatim. */
  readonly path: string;
  /**
   * The upstream stroke-type annotation (`㇑a`, `㇔`), or `null`.
   *
   * Upstream vocabulary, carried rather than translated: it is KanjiVG's claim
   * about the stroke, not this package's.
   */
  readonly kind: string | null;
}

/**
 * A collocation or phrase, declared as a unit.
 *
 * **The shipped dictionary tier declares none.** JMdict carries headwords,
 * readings, senses and part-of-speech tags; it carries no phrase inventory, and
 * KANJIDIC2 and Tatoeba carry none either. So L4 is empty in every build this
 * repository can currently produce, and {@link summariseScaleLadder} says so out
 * loud with a reason attached.
 *
 * That is the honest answer and it is deliberately the *only* one available
 * here: there is no rule in this package that derives a collocation from
 * anything, because every such rule would be an invention. A later dataset that
 * genuinely carries phrases populates this array and the level fills in with no
 * change to any consumer.
 */
export interface CollocationRecord {
  readonly id: ScaleNodeId;
  /** 道が分かれる — what the surface draws. */
  readonly label: string;
  /** The graph nodes this phrase is made of, in reading order. */
  readonly memberIds: readonly GraphNodeId[];
  /** The `KnowledgeComponent` ids whose contracts test it. Usually empty. */
  readonly componentIds: readonly ComponentId[];
}

export interface ScaleSource {
  /** The indexed Atlas. Held, never copied. */
  readonly graph: KnowledgeGraph;
  /**
   * The strokes of one character, or an empty list when none are available.
   *
   * A function rather than a table on purpose. The whole imported tier's
   * geometry is several megabytes; a ladder that ingested all of it would have
   * materialised the entire bottom level to draw one character's worth, which is
   * the exact failure the level-of-detail rule exists to prevent. Returning `[]`
   * is the honest answer for a character whose stroke file is not in the build,
   * and it becomes a reported gap rather than an empty ring nobody can explain.
   */
  readonly strokesFor: (kanjiNodeId: GraphNodeId) => readonly StrokeRecord[];
  /** Declared phrases. Empty in every shipped build; see {@link CollocationRecord}. */
  readonly collocations?: readonly CollocationRecord[] | undefined;
}

/* ------------------------------------------------------------------ *
 * The node
 * ------------------------------------------------------------------ */

/** Stroke geometry, present only on an L0 node. */
export interface ScaleStrokeDetail {
  readonly order: number;
  readonly path: string;
  readonly kind: string | null;
  /** How many strokes the character has in total, so "3 of 12" is sayable. */
  readonly of: number;
}

export interface ScaleNode {
  readonly id: ScaleNodeId;
  readonly level: ScaleLevel;
  /** What a surface draws — 森, 森林, ぶんき. Opaque here; nothing sorts by it. */
  readonly label: string;
  /**
   * The `KnowledgeComponent` ids whose retrieval contracts test this node.
   *
   * Carried straight through from the graph node, because it is the Atlas→Trace
   * join and a surface reading strength per level needs it at every level.
   * Empty is the normal case, and it is what makes a node render as *unknown*
   * rather than as *weak*.
   */
  readonly componentIds: readonly ComponentId[];
  /** The graph node this stands for, or `null` for a stroke or a collocation. */
  readonly graphKind: GraphNodeKind | null;
  /** Geometry, on an L0 node only. */
  readonly stroke: ScaleStrokeDetail | null;
}

/**
 * Which level a graph node kind sits at, or `null` for a facet that is not a
 * scale at all.
 *
 * Exhaustive over `GRAPH_NODE_KINDS` by construction: the type annotation is a
 * total record, so a new node kind is a type error here rather than a silent
 * omission that would quietly drop a whole class of node off the ladder.
 */
export const LEVEL_OF_GRAPH_KIND: Readonly<Record<GraphNodeKind, ScaleLevel | null>> =
  Object.freeze({
    kanji: 'kanji',
    component: 'component',
    lexeme: 'word',
    sentence: 'sentence',
    // Facets, not scales. See this file's header.
    sense: null,
    reading: null,
    grammar_construction: null,
    encounter: null,
  });

/* ------------------------------------------------------------------ *
 * The ladder
 * ------------------------------------------------------------------ */

export const SCALE_DIAGNOSTIC_KINDS = [
  'stroke_id_collision',
  'collocation_id_collision',
  'collocation_dangling_member',
  'duplicate_collocation',
] as const;

export type ScaleDiagnosticKind = (typeof SCALE_DIAGNOSTIC_KINDS)[number];

/** One thing about the source a reader should know. Data, not a throw. */
export interface ScaleDiagnostic {
  readonly kind: ScaleDiagnosticKind;
  readonly detail: string;
}

export interface ScaleLadder {
  /** The Atlas, held. Every L1–L3 and L5 node is one of its nodes. */
  readonly graph: KnowledgeGraph;
  readonly strokesFor: (kanjiNodeId: GraphNodeId) => readonly StrokeRecord[];
  /** Declared phrases by id. Empty in every shipped build. */
  readonly collocations: ReadonlyMap<ScaleNodeId, CollocationRecord>;
  /** Which phrases a graph node participates in. Empty in every shipped build. */
  readonly collocationsByMember: ReadonlyMap<GraphNodeId, readonly ScaleNodeId[]>;
  readonly diagnostics: readonly ScaleDiagnostic[];
}

/**
 * Index a source into a ladder.
 *
 * O(C · m) in the declared collocations and their members, and **O(1) in the
 * graph** — the graph is taken as already indexed, which is the point. Building
 * a ladder over the 3,000-lexeme tier is therefore free; the cost was paid once
 * by `buildKnowledgeGraph`.
 */
export function buildScaleLadder(source: ScaleSource): ScaleLadder {
  const diagnostics: ScaleDiagnostic[] = [];
  const collocations = new Map<ScaleNodeId, CollocationRecord>();
  const byMember = new Map<GraphNodeId, ScaleNodeId[]>();

  for (const record of source.collocations ?? []) {
    if (record.id.startsWith(STROKE_ID_PREFIX)) {
      diagnostics.push({
        kind: 'stroke_id_collision',
        detail: `collocation id ${JSON.stringify(record.id)} starts with ${JSON.stringify(STROKE_ID_PREFIX)}, which this package mints for strokes; it is excluded so the two cannot be confused`,
      });
      continue;
    }
    if (source.graph.nodes.has(record.id)) {
      diagnostics.push({
        kind: 'collocation_id_collision',
        detail: `collocation id ${JSON.stringify(record.id)} is already a graph node id; it is excluded so one id never names two things`,
      });
      continue;
    }
    if (collocations.has(record.id)) {
      diagnostics.push({
        kind: 'duplicate_collocation',
        detail: `collocation id ${JSON.stringify(record.id)} was declared more than once; the first declaration is kept so the index does not depend on input order`,
      });
      continue;
    }
    collocations.set(record.id, record);

    for (const memberId of record.memberIds) {
      if (!source.graph.nodes.has(memberId)) {
        diagnostics.push({
          kind: 'collocation_dangling_member',
          detail: `collocation ${JSON.stringify(record.id)} names member ${JSON.stringify(memberId)}, which the graph does not declare; the phrase is kept and that member is not drawn`,
        });
        continue;
      }
      const list = byMember.get(memberId);
      if (list === undefined) byMember.set(memberId, [record.id]);
      else list.push(record.id);
    }
  }

  const frozenByMember = new Map<GraphNodeId, readonly ScaleNodeId[]>();
  byMember.forEach((list, id) => {
    list.sort();
    frozenByMember.set(id, Object.freeze(list));
  });

  return Object.freeze({
    graph: source.graph,
    strokesFor: source.strokesFor,
    collocations,
    collocationsByMember: frozenByMember,
    diagnostics: Object.freeze(diagnostics),
  });
}

/* ------------------------------------------------------------------ *
 * Resolving one node
 * ------------------------------------------------------------------ */

function nodeFromGraph(node: GraphNode): ScaleNode | null {
  const level = LEVEL_OF_GRAPH_KIND[node.kind];
  if (level === null) return null;
  return {
    id: node.id,
    level,
    label: node.label,
    componentIds: node.componentIds,
    graphKind: node.kind,
    stroke: null,
  };
}

/**
 * The scale node an id names, or `null`.
 *
 * `null` covers three honest cases and does not distinguish them, because a
 * caller cannot act differently on any of them: the id is not in the graph, the
 * id is a graph node whose kind is a facet rather than a level, or the id is a
 * stroke of a character whose geometry this build does not carry.
 */
export function scaleNodeAt(ladder: ScaleLadder, id: ScaleNodeId): ScaleNode | null {
  const stroke = parseStrokeNodeId(id);
  if (stroke !== null) {
    const strokes = ladder.strokesFor(stroke.kanjiNodeId);
    const record = strokes.find((entry) => entry.order === stroke.order);
    if (record === undefined) return null;
    return strokeNodeOf(stroke.kanjiNodeId, record, strokes.length);
  }

  const collocation = ladder.collocations.get(id);
  if (collocation !== undefined) {
    return {
      id: collocation.id,
      level: 'collocation',
      label: collocation.label,
      componentIds: collocation.componentIds,
      graphKind: null,
      stroke: null,
    };
  }

  const graphNode = ladder.graph.nodes.get(id);
  if (graphNode === undefined) return null;
  return nodeFromGraph(graphNode);
}

/** A stroke as a ladder node. Exported for the dive, which mints them in bulk. */
export function strokeNodeOf(
  kanjiNodeId: GraphNodeId,
  record: StrokeRecord,
  of: number,
): ScaleNode {
  return {
    id: strokeNodeId(kanjiNodeId, record.order),
    // A stroke's label is its position, not its path: "stroke 3" is what a
    // surface says out loud, and the geometry travels beside it.
    label: `${String(record.order)}/${String(of)}`,
    level: 'stroke',
    // A stroke is never a retrieval target on its own — REQ-LM-01 instantiates
    // contracts on captured targets, and nobody captures a stroke — so this is
    // empty by rule rather than by missing data.
    componentIds: [],
    graphKind: null,
    stroke: { order: record.order, path: record.path, kind: record.kind, of },
  };
}

/* ------------------------------------------------------------------ *
 * Coverage
 * ------------------------------------------------------------------ */

export const LEVEL_SUPPORT = ['sourced', 'empty'] as const;
export type LevelSupport = (typeof LEVEL_SUPPORT)[number];

export interface LevelCoverage {
  readonly level: ScaleLevel;
  readonly support: LevelSupport;
  /** How many nodes the ladder can reach at this level. */
  readonly count: number;
  /** Where they came from, or why there are none. Never empty. */
  readonly basis: string;
}

export interface ScaleCoverage {
  readonly levels: readonly LevelCoverage[];
  /** Levels with nothing in them. The honest headline. */
  readonly emptyLevels: readonly ScaleLevel[];
}

/**
 * What each level actually holds, over one ladder.
 *
 * Walks the graph's `byKind` index — which `buildKnowledgeGraph` already
 * materialised — so this is a summary rather than a scan. **L0 is deliberately
 * reported as `empty` with a reason**: strokes arrive per character through a
 * function, so there is no total to count without calling it 1,241 times, and
 * inventing a number here would be worse than saying which question this
 * summary cannot answer.
 *
 * Nothing in the app is required to call this. It exists so that "L4 is thin"
 * is a value a screen can render and a test can assert, rather than a sentence
 * in a document.
 */
export function summariseScaleLadder(ladder: ScaleLadder): ScaleCoverage {
  const graphCounts = new Map<ScaleLevel, number>();
  ladder.graph.byKind.forEach((ids, kind) => {
    const level = LEVEL_OF_GRAPH_KIND[kind];
    if (level === null) return;
    graphCounts.set(level, (graphCounts.get(level) ?? 0) + ids.length);
  });

  const levels: LevelCoverage[] = SCALE_LEVELS.map((level) => {
    if (level === 'stroke') {
      return {
        level,
        support: 'empty' as const,
        count: 0,
        basis:
          'Strokes are fetched per character from KanjiVG rather than indexed, so this summary cannot count them. A character with no stroke file reports an inward gap on its own dive.',
      };
    }
    if (level === 'collocation') {
      const count = ladder.collocations.size;
      return {
        level,
        support: count > 0 ? ('sourced' as const) : ('empty' as const),
        count,
        basis:
          count > 0
            ? 'Declared collocation records supplied by the caller.'
            : 'No source in this build declares collocations. JMdict carries headwords, readings, senses and part-of-speech tags; it carries no phrase inventory, and neither KANJIDIC2 nor Tatoeba carries one. Nothing here derives a phrase from anything, because every such rule would be an invention.',
      };
    }
    const count = graphCounts.get(level) ?? 0;
    return {
      level,
      support: count > 0 ? ('sourced' as const) : ('empty' as const),
      count,
      basis:
        count > 0
          ? `${String(count)} node${count === 1 ? '' : 's'} of this level in the indexed Atlas.`
          : 'The indexed Atlas declares no node of this kind.',
    };
  });

  return Object.freeze({
    levels: Object.freeze(levels),
    emptyLevels: Object.freeze(
      levels.filter((entry) => entry.support === 'empty').map((entry) => entry.level),
    ),
  });
}

/**
 * How many adjacency entries one node has, without materialising any of them.
 *
 * The dive uses it to say "there is more down there" without paying for the
 * "more" — which is the whole level-of-detail contract in one function.
 */
export function adjacencyDegree(ladder: ScaleLadder, id: GraphNodeId): number {
  return adjacencyOf(ladder.graph, id).length;
}
