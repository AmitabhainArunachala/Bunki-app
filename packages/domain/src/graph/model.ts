/**
 * The Atlas as data: typed nodes and typed edges (Campaign E / A2; frozen v1
 * §2.1, converged REQ-UI-07).
 *
 * ## What this file is, and what it deliberately is not
 *
 * The frozen v1 calls the content graph "typed": nodes are kanji, components,
 * words, grammar patterns and sentences, and edges are `contains`,
 * `contrasts-with`, `collocates-with`, `derives-from`, and role-tagged
 * `component-of`. This file is that vocabulary, spelled as a closed list, plus
 * the two edges Campaign E's map needs on top of it — the reading families that
 * make "words that share this reading" a walk rather than a scan, and the
 * encounters that make a node's history part of its neighbourhood.
 *
 * It is **not** a dictionary. `@bunki/domain` may not import `@bunki/seed`
 * (ADR-001 boundary 1), and it should not want to: a projection that owned the
 * content would have to be rebuilt every time the dictionary tier grew. The
 * caller supplies nodes and edges; this package supplies the index, the walk,
 * and the ordering guarantees. The 3,000-lexeme dictionary tier is therefore an
 * *input size*, not a dependency.
 *
 * ## Node ids are namespaced by the caller
 *
 * A `GraphNodeId` is opaque here. The convention the app follows is
 * `kind:key` — `kanji:分`, `lex-bunki`, `reading:ぶん` — but nothing in this
 * file parses one, because a projection that derived meaning from an id's shape
 * would silently mis-file the first id that did not follow the convention. The
 * `kind` field is the authority; the id is only an identity.
 *
 * ## Direction is meaning, so both directions are kept
 *
 * `contains` runs sentence → lexeme → kanji, and the map needs it in both
 * directions: "the kanji inside this word" is outgoing, "the compounds this
 * kanji appears in" is the same edge read backwards. The index materialises
 * both and labels which is which, rather than storing two edges — one edge with
 * two readings cannot fall out of sync with itself.
 */

import type { ComponentId, EncounterId } from '../primitives.ts';

/**
 * Every kind of thing the map can draw.
 *
 * `reading` and `sense` are nodes rather than fields because the whole point of
 * a reading family is that the *reading* is the shared thing: 分 and 文 are
 * neighbours because both reach `reading:ぶん`, and that is one hop through a
 * node instead of a scan over every kanji's reading list. Same for senses and
 * the confusable near-synonyms of frozen v1 §10.5.
 */
export const GRAPH_NODE_KINDS = [
  'kanji',
  'component',
  'lexeme',
  'sense',
  'reading',
  'grammar_construction',
  'sentence',
  'encounter',
] as const;

export type GraphNodeKind = (typeof GRAPH_NODE_KINDS)[number];

export type GraphNodeId = string;

/**
 * The role a component plays in the kanji it is part of (frozen v1 §2.1).
 *
 * First-class, and `unclassified` is a member: "we do not know whether 寅 is
 * carrying sound or meaning here" is a real and common answer, and collapsing
 * it into `semantic` would put an invented etymology on a museum card. §2.5
 * splits deterministic stroke data, cited etymology, and invented mnemonic art
 * for exactly this reason.
 */
export const COMPONENT_ROLES = ['semantic', 'phonetic', 'corrupted', 'unclassified'] as const;
export type ComponentRole = (typeof COMPONENT_ROLES)[number];

export interface GraphNode {
  readonly id: GraphNodeId;
  readonly kind: GraphNodeKind;
  /**
   * What the map draws — 分岐, ぶんき, "branch point". Opaque to this package:
   * nothing here reads it, sorts by it, or matches on it, so no ordering
   * guarantee can depend on a locale collation this kernel does not control.
   */
  readonly label: string;
  /**
   * The `KnowledgeComponent` ids whose retrieval contracts test this node.
   *
   * This is the join key between the Atlas and the Trace, and it is a list
   * rather than a single id because one node can be tested through more than
   * one captured target (REQ-LM-01 instantiates components sparsely, on
   * capture, so the same kanji met twice in two spellings has two). Empty is
   * the normal case for a dictionary node nobody has captured — and it is
   * precisely what makes that node render as *unknown* rather than as *weak*.
   */
  readonly componentIds: readonly ComponentId[];
  /** Set only on `encounter` nodes; the encounter this node stands for. */
  readonly encounterId?: EncounterId;
}

/**
 * The closed edge list.
 *
 * `contains` is structural containment down the Atlas (sentence → lexeme →
 * kanji). `component_of` is deliberately a separate kind pointing the other way
 * (component → kanji) because it is the only edge that carries a role, and a
 * role-tagged variant of a general containment edge would make "which of these
 * `contains` edges may have a role?" a question every reader has to answer
 * again.
 */
export const GRAPH_EDGE_KINDS = [
  'contains',
  'component_of',
  'contrasts_with',
  'collocates_with',
  'derives_from',
  'has_reading',
  'has_sense',
  'realises',
  'appeared_in',
] as const;

export type GraphEdgeKind = (typeof GRAPH_EDGE_KINDS)[number];

/**
 * Edges whose two ends mean the same thing.
 *
 * 末 contrasts with 未 exactly as much as 未 contrasts with 末. The index stores
 * one edge and reports it from both ends with direction `symmetric`, so a
 * caller can never see a contrast set that is asymmetric because somebody
 * entered the pair once.
 */
export const SYMMETRIC_EDGE_KINDS: readonly GraphEdgeKind[] = Object.freeze([
  'contrasts_with',
  'collocates_with',
]);

export function isSymmetricEdgeKind(kind: GraphEdgeKind): boolean {
  return SYMMETRIC_EDGE_KINDS.includes(kind);
}

export interface GraphEdge {
  readonly kind: GraphEdgeKind;
  readonly from: GraphNodeId;
  readonly to: GraphNodeId;
  /** Only meaningful on `component_of`; absent elsewhere. */
  readonly role?: ComponentRole;
}

/**
 * How an edge was traversed to reach a neighbour.
 *
 * `outgoing` means the neighbour is the edge's `to`, `incoming` means it is the
 * `from`, and `symmetric` means the question does not arise. Kept on every
 * adjacency entry because "the kanji in this word" and "the words with this
 * kanji" are the same edge and different answers.
 */
export const TRAVERSAL_DIRECTIONS = ['outgoing', 'incoming', 'symmetric'] as const;
export type TraversalDirection = (typeof TRAVERSAL_DIRECTIONS)[number];

/** One step away from a node: the edge taken, the way it was read, where it lands. */
export interface Adjacency {
  readonly kind: GraphEdgeKind;
  readonly direction: TraversalDirection;
  readonly other: GraphNodeId;
  readonly role: ComponentRole | null;
}

/**
 * The caller's raw material. Duplicates and dangling edges are tolerated and
 * *reported* by {@link import('./build.ts').buildKnowledgeGraph}, never silently
 * dropped — a dictionary tier assembled from several sources will have both,
 * and a build that hid them would make the map quietly incomplete.
 */
export interface KnowledgeGraphSource {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/**
 * Canonical rank for edge kinds.
 *
 * Every ordered result in this package sorts by (depth, this rank, node id), so
 * two builds of one source produce byte-identical output regardless of the
 * order the caller happened to hand over its edges. The rank order is the order
 * a kanji page reads: what it is made of, what it appears in, what it sounds
 * like, what it means, what it is confusable with, where it was met.
 */
const EDGE_KIND_RANK: Readonly<Record<GraphEdgeKind, number>> = Object.freeze({
  component_of: 0,
  contains: 1,
  has_reading: 2,
  has_sense: 3,
  contrasts_with: 4,
  collocates_with: 5,
  derives_from: 6,
  realises: 7,
  appeared_in: 8,
});

export function edgeKindRank(kind: GraphEdgeKind): number {
  return EDGE_KIND_RANK[kind];
}

const DIRECTION_RANK: Readonly<Record<TraversalDirection, number>> = Object.freeze({
  outgoing: 0,
  incoming: 1,
  symmetric: 2,
});

/**
 * Total order on adjacency entries.
 *
 * Byte-wise on ids, locale-independent, for the reason `compareIds` in
 * `replay/derived-state.ts` gives: a sort that consulted the host locale would
 * make one log project differently on two devices.
 */
export function compareAdjacency(left: Adjacency, right: Adjacency): number {
  const byKind = edgeKindRank(left.kind) - edgeKindRank(right.kind);
  if (byKind !== 0) return byKind;
  const byDirection = DIRECTION_RANK[left.direction] - DIRECTION_RANK[right.direction];
  if (byDirection !== 0) return byDirection;
  if (left.other < right.other) return -1;
  if (left.other > right.other) return 1;
  return 0;
}
