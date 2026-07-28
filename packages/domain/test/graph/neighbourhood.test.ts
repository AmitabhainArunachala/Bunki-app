/**
 * The bounded, deterministic neighbourhood walk (Campaign E / A2; REQ-UI-07).
 */

import { describe, expect, it } from 'vitest';

import {
  buildKnowledgeGraph,
  DEFAULT_NEIGHBOURHOOD_OPTIONS,
  EMPTY_NEIGHBOURHOOD,
  groupOf,
  neighbourhoodOf,
  NEIGHBOURHOOD_GROUP_NAMES,
  wasTruncated,
  type GraphEdge,
  type GraphNode,
} from '../../src/index.ts';
import { SEED_SHAPED_SOURCE } from './support.ts';

const graph = buildKnowledgeGraph(SEED_SHAPED_SOURCE);

function labels(members: readonly { readonly node: { readonly label: string } }[]): string[] {
  return members.map((member) => member.node.label).sort();
}

describe('neighbourhoodOf', () => {
  it('answers an unknown node with an empty neighbourhood, not a throw', () => {
    expect(neighbourhoodOf(graph, 'kanji:nope')).toBe(EMPTY_NEIGHBOURHOOD);
    expect(neighbourhoodOf(graph, 'kanji:nope').origin).toBeNull();
  });

  it('returns the origin alone at depth 0', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 0 });
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.node.id).toBe('kanji:分');
    expect(result.nodes[0]?.depth).toBe(0);
  });

  it('gives a kanji its components, its compounds, and their roles', () => {
    const result = neighbourhoodOf(graph, 'kanji:分');

    expect(labels(groupOf(result, 'components'))).toEqual(['八', '刀']);
    expect(
      groupOf(result, 'components')
        .map((member) => member.role)
        .sort(),
    ).toEqual(['semantic', 'semantic']);
    expect(labels(groupOf(result, 'compounds'))).toEqual(['分岐', '分岐点']);
  });

  it('gives a word its constituent kanji, its senses, and the sentences it appeared in', () => {
    const result = neighbourhoodOf(graph, 'lex-bunki');

    expect(labels(groupOf(result, 'constituents'))).toEqual(['分', '岐']);
    expect(labels(groupOf(result, 'senses'))).toEqual(['branching']);
    expect(labels(groupOf(result, 'sentences'))).toEqual(['線路が分岐点で分かれる。']);
    expect(labels(groupOf(result, 'encounters'))).toEqual(['NHK clip, 2026-05-02']);
    expect(labels(groupOf(result, 'collocations'))).toEqual(['分岐点']);
  });

  it('builds the reading family through the shared reading, and names it', () => {
    const result = neighbourhoodOf(graph, 'kanji:分');
    const family = groupOf(result, 'readingFamily');

    expect(labels(family)).toEqual(['文', '聞']);
    // The relation's provenance: they are a family because of ブン, and the
    // projection says which reading rather than asserting bare relatedness.
    family.forEach((member) => {
      expect(member.via).toBe('reading:ブン');
    });
  });

  it('excludes the origin from its own reading family', () => {
    const family = groupOf(neighbourhoodOf(graph, 'kanji:分'), 'readingFamily');
    expect(family.map((member) => member.node.id)).not.toContain('kanji:分');
  });

  it('carries the confusable neighbours of frozen v1 §10.5', () => {
    expect(labels(groupOf(neighbourhoodOf(graph, 'kanji:分'), 'contrasts'))).toEqual(['文']);
    expect(labels(groupOf(neighbourhoodOf(graph, 'kanji:文'), 'contrasts'))).toEqual(['分']);
  });

  it('is deterministic — repeated calls are deeply equal', () => {
    const first = neighbourhoodOf(graph, 'kanji:分');
    const second = neighbourhoodOf(graph, 'kanji:分');
    expect(second).toEqual(first);
  });

  it('does not depend on the order the source declared its edges', () => {
    const reversed = buildKnowledgeGraph({
      nodes: [...SEED_SHAPED_SOURCE.nodes].reverse(),
      edges: [...SEED_SHAPED_SOURCE.edges].reverse(),
    });
    expect(neighbourhoodOf(reversed, 'kanji:分')).toEqual(neighbourhoodOf(graph, 'kanji:分'));
  });

  it('returns only edges whose both ends were returned', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 1 });
    const ids = new Set(result.nodes.map((entry) => entry.node.id));
    result.edges.forEach((edge) => {
      expect(ids.has(edge.from), `${edge.from} → ${edge.to}`).toBe(true);
      expect(ids.has(edge.to), `${edge.from} → ${edge.to}`).toBe(true);
    });
  });

  it('draws a symmetric edge once, not twice', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 1 });
    const contrasts = result.edges.filter((edge) => edge.kind === 'contrasts_with');
    expect(contrasts).toHaveLength(1);
  });

  it('filters by edge kind and by node kind', () => {
    const onlyComponents = neighbourhoodOf(graph, 'kanji:分', {
      depth: 1,
      edgeKinds: ['component_of'],
    });
    expect(onlyComponents.nodes.map((entry) => entry.node.id).sort()).toEqual([
      'component:八',
      'component:刀',
      'kanji:分',
    ]);

    const onlyLexemes = neighbourhoodOf(graph, 'kanji:分', {
      depth: 1,
      nodeKinds: ['lexeme'],
    });
    onlyLexemes.nodes
      .filter((entry) => entry.depth > 0)
      .forEach((entry) => expect(entry.node.kind).toBe('lexeme'));
  });
});

/**
 * The filters govern the walk and the named groups identically.
 *
 * They used not to: `collectGroups` read the origin's adjacency directly and
 * applied none of `depth`, `edgeKinds` or `nodeKinds`, so a restricted query
 * returned a walk that honoured the restriction and a set of groups beside it
 * that did not — with nothing in the type or the doc saying so. Two halves of
 * one options object behaving differently is a trap, and these are the tests
 * that would have caught it.
 */
describe('the filters govern the groups exactly as they govern the walk', () => {
  it('empties every group at depth 0, where the walk returns the origin alone', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 0 });
    expect(result.nodes).toHaveLength(1);
    NEIGHBOURHOOD_GROUP_NAMES.forEach((name) => {
      expect(groupOf(result, name), name).toEqual([]);
    });
  });

  it('keeps one-hop groups but empties the two-hop reading family at depth 1', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 1 });
    expect(labels(groupOf(result, 'components'))).toEqual(['八', '刀']);
    expect(groupOf(result, 'readingFamily')).toEqual([]);
  });

  it('restricts the groups by edge kind', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 2, edgeKinds: ['component_of'] });
    expect(labels(groupOf(result, 'components'))).toEqual(['八', '刀']);
    expect(groupOf(result, 'compounds')).toEqual([]);
    expect(groupOf(result, 'contrasts')).toEqual([]);
    expect(groupOf(result, 'readingFamily')).toEqual([]);
  });

  it('restricts the groups by node kind', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 2, nodeKinds: ['component'] });
    expect(labels(groupOf(result, 'components'))).toEqual(['八', '刀']);
    expect(groupOf(result, 'compounds')).toEqual([]);
  });

  it('does not tunnel the reading family under a node-kind restriction', () => {
    // The family is walked *through* `reading:ブン`. A caller who excluded
    // `reading` asked for a query that does not go through readings, so the
    // family is empty even though 文 and 聞 are themselves an admitted kind.
    const result = neighbourhoodOf(graph, 'kanji:分', {
      depth: 2,
      nodeKinds: ['kanji', 'lexeme', 'component'],
    });
    expect(groupOf(result, 'readingFamily')).toEqual([]);
  });

  it('every group member is also a node the same walk returned', () => {
    const options = [
      { depth: 2 },
      { depth: 1 },
      { depth: 2, edgeKinds: ['component_of'] as const },
      { depth: 2, nodeKinds: ['component'] as const },
    ];
    options.forEach((option) => {
      const result = neighbourhoodOf(graph, 'kanji:分', { ...option, maxNodes: 500 });
      const walked = new Set(result.nodes.map((entry) => entry.node.id));
      NEIGHBOURHOOD_GROUP_NAMES.forEach((name) => {
        groupOf(result, name).forEach((member) => {
          expect(walked.has(member.node.id), `${name}: ${member.node.id}`).toBe(true);
        });
      });
    });
  });

  it('leaves the groups alone when maxNodes bites — that budget is the walk’s', () => {
    // Documented asymmetry, and the one the type comment argues for: a kanji
    // page's "components" section must not shrink because the word happens to
    // have many compounds.
    const tight = neighbourhoodOf(graph, 'kanji:分', { depth: 2, maxNodes: 2 });
    expect(tight.nodes.length).toBeLessThanOrEqual(2);
    expect(labels(groupOf(tight, 'components'))).toEqual(['八', '刀']);
  });

  it('filters the sibling as well as the reading a family is reached through', () => {
    // Both hops of a reading family are `has_reading`, so `edgeKinds` is already
    // settled by the check on the first hop. A sibling of an excluded *node*
    // kind is rejected only by the second check, and this is the test for it:
    // a query that excluded `kanji` must not get a kanji back in the family.
    const shared = buildKnowledgeGraph({
      nodes: [
        { id: 'kanji:origin', kind: 'kanji', label: '分', componentIds: [] },
        { id: 'reading:ブン', kind: 'reading', label: 'ブン', componentIds: [] },
        { id: 'kanji:sib', kind: 'kanji', label: '文', componentIds: [] },
        { id: 'lex:sib', kind: 'lexeme', label: '分岐', componentIds: [] },
      ],
      edges: [
        { kind: 'has_reading', from: 'kanji:origin', to: 'reading:ブン' },
        { kind: 'has_reading', from: 'kanji:sib', to: 'reading:ブン' },
        { kind: 'has_reading', from: 'lex:sib', to: 'reading:ブン' },
      ],
    });

    const unrestricted = neighbourhoodOf(shared, 'kanji:origin', { depth: 2 });
    expect(groupOf(unrestricted, 'readingFamily').map((member) => member.node.id)).toEqual([
      'kanji:sib',
      'lex:sib',
    ]);

    const noKanji = neighbourhoodOf(shared, 'kanji:origin', {
      depth: 2,
      nodeKinds: ['reading', 'lexeme'],
    });
    expect(groupOf(noKanji, 'readingFamily').map((member) => member.node.id)).toEqual(['lex:sib']);
  });
});

/**
 * `maxNodes` is the walk's budget and reaches nothing else.
 *
 * The table on `NeighbourhoodOptions` says so, and it was false: the groups read
 * each member's depth out of the walk's depth map, which `maxNodes` bounds. Two
 * things went wrong at once — a member genuinely one hop from the origin
 * reported depth 2 whenever the ceiling had refused it, and because group
 * members sort by depth, `perGroup` then showed a *different member*. These are
 * the tests that pin the claim to behaviour rather than to a doc comment.
 */
describe('the whole-walk ceiling does not reach into the groups', () => {
  // 文 is in 分's reading family through ブン *and* is one `contrasts_with` hop
  // from it, so its honest distance is 1. The extra kanji are there to give the
  // ceiling something to refuse and `perGroup` something to choose between.
  const family = buildKnowledgeGraph({
    nodes: [
      { id: 'kanji:分', kind: 'kanji', label: '分', componentIds: [] },
      { id: 'kanji:文', kind: 'kanji', label: '文', componentIds: [] },
      { id: 'kanji:聞', kind: 'kanji', label: '聞', componentIds: [] },
      { id: 'reading:ブン', kind: 'reading', label: 'ブン', componentIds: [] },
    ],
    edges: [
      { kind: 'has_reading', from: 'kanji:分', to: 'reading:ブン' },
      { kind: 'has_reading', from: 'kanji:文', to: 'reading:ブン' },
      { kind: 'has_reading', from: 'kanji:聞', to: 'reading:ブン' },
      { kind: 'contrasts_with', from: 'kanji:分', to: 'kanji:文' },
    ],
  });

  it('reports a member’s real distance, not the one the refused walk implies', () => {
    const roomy = neighbourhoodOf(family, 'kanji:分', { depth: 2, maxNodes: 100 });
    const tight = neighbourhoodOf(family, 'kanji:分', { depth: 2, maxNodes: 1 });

    const asPairs = (result: ReturnType<typeof neighbourhoodOf>): [string, number][] =>
      groupOf(result, 'readingFamily').map((member) => [member.node.id, member.depth]);

    // 文 is one hop away whether or not the walk had room to reach it.
    expect(asPairs(roomy)).toEqual([
      ['kanji:文', 1],
      ['kanji:聞', 2],
    ]);
    expect(asPairs(tight)).toEqual(asPairs(roomy));
    // And the walk really was cut, so this is not a vacuous comparison.
    expect(tight.nodes).toHaveLength(1);
    expect(tight.truncated.some((entry) => entry.cause === 'max_nodes')).toBe(true);
  });

  it('shows the same member under perGroup whatever maxNodes was', () => {
    // Deliberately named so the *nearer* member sorts later by id: members are
    // ordered by depth first and by id second, so corrupting one member's depth
    // is only visible here when the id tiebreak disagrees with the distance.
    // `kanji:zz` is one `contrasts_with` hop away and `kanji:aa` is two, so the
    // one member a `perGroup: 1` page shows must be `kanji:zz`.
    const tiebreak = buildKnowledgeGraph({
      nodes: [
        { id: 'kanji:分', kind: 'kanji', label: '分', componentIds: [] },
        { id: 'kanji:zz', kind: 'kanji', label: 'zz', componentIds: [] },
        { id: 'kanji:aa', kind: 'kanji', label: 'aa', componentIds: [] },
        { id: 'reading:ブン', kind: 'reading', label: 'ブン', componentIds: [] },
      ],
      edges: [
        { kind: 'has_reading', from: 'kanji:分', to: 'reading:ブン' },
        { kind: 'has_reading', from: 'kanji:zz', to: 'reading:ブン' },
        { kind: 'has_reading', from: 'kanji:aa', to: 'reading:ブン' },
        { kind: 'contrasts_with', from: 'kanji:分', to: 'kanji:zz' },
      ],
    });

    const shown = (maxNodes: number): string[] =>
      groupOf(
        neighbourhoodOf(tiebreak, 'kanji:分', { depth: 2, perGroup: 1, maxNodes }),
        'readingFamily',
      ).map((member) => member.node.id);

    expect(shown(100)).toEqual(['kanji:zz']);
    expect(shown(1)).toEqual(shown(100));
  });

  it('returns byte-identical groups across every ceiling, on the seed-shaped graph', () => {
    const at = (maxNodes: number) => neighbourhoodOf(graph, 'kanji:分', { depth: 2, maxNodes });
    const reference = at(500).groups;
    [1, 2, 3, 5, 8, 13].forEach((maxNodes) => {
      expect(at(maxNodes).groups, `maxNodes ${maxNodes}`).toEqual(reference);
    });
  });
});

describe('the bounds, and saying when they bit', () => {
  it('says nothing was truncated when the whole neighbourhood fits', () => {
    const closed = buildKnowledgeGraph({
      nodes: [
        { id: 'a', kind: 'kanji', label: 'a', componentIds: [] },
        { id: 'b', kind: 'component', label: 'b', componentIds: [] },
      ],
      edges: [{ kind: 'component_of', from: 'b', to: 'a' }],
    });
    const result = neighbourhoodOf(closed, 'a', { depth: 1 });

    expect(result.nodes).toHaveLength(2);
    expect(result.truncated).toEqual([]);
    expect(wasTruncated(result)).toBe(false);
  });

  it('says the depth bound hid something only when it actually did', () => {
    // 八 is one hop from 分, and 分 has compounds and a contrast beyond that
    // hop. The map is entitled to say "there is more here"; it is not entitled
    // to say so wherever a walk happens to stop.
    const bounded = neighbourhoodOf(graph, 'component:八', { depth: 1 });
    const depthCut = bounded.truncated.find((entry) => entry.cause === 'depth');
    expect(depthCut?.available).toBe(1);
    expect(depthCut?.detail).toContain('further connections');
  });

  it('reports the node ceiling rather than quietly returning fewer nodes', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 3, maxNodes: 4 });
    expect(result.nodes.length).toBeLessThanOrEqual(4);
    expect(wasTruncated(result)).toBe(true);
    const cut = result.truncated.find((entry) => entry.cause === 'max_nodes');
    expect(cut?.limit).toBe(4);
    expect(cut?.available).toBeGreaterThan(4);
    expect(cut?.detail).toContain('not shown');
  });

  it('reports a per-group cut with the count it cut from', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 2, perGroup: 1 });
    expect(groupOf(result, 'components')).toHaveLength(1);
    const cut = result.truncated.find(
      (entry) => entry.cause === 'per_group' && entry.group === 'components',
    );
    expect(cut?.available).toBe(2);
    expect(cut?.limit).toBe(1);
  });

  it('never returns more nodes than maxNodes, whatever the depth', () => {
    [1, 2, 3, 5, 8].forEach((depth) => {
      const result = neighbourhoodOf(graph, 'kanji:分', { depth, maxNodes: 6 });
      expect(result.nodes.length, `depth ${depth}`).toBeLessThanOrEqual(6);
    });
  });

  it('keeps the nearest ring when the ceiling bites', () => {
    const result = neighbourhoodOf(graph, 'kanji:分', { depth: 3, maxNodes: 3 });
    const depths = result.nodes.map((entry) => entry.depth);
    expect(Math.max(...depths)).toBeLessThanOrEqual(1);
  });

  it('exposes every named group on every result, empty or not', () => {
    const result = neighbourhoodOf(graph, 'component:八');
    NEIGHBOURHOOD_GROUP_NAMES.forEach((name) => {
      expect(Array.isArray(groupOf(result, name)), name).toBe(true);
    });
  });

  it('defaults to a local neighbourhood, not the whole graph (REQ-UI-07)', () => {
    expect(DEFAULT_NEIGHBOURHOOD_OPTIONS.depth).toBeLessThanOrEqual(2);
    expect(DEFAULT_NEIGHBOURHOOD_OPTIONS.maxNodes).toBeLessThanOrEqual(200);
  });
});

describe('a hub node cannot flood the walk', () => {
  it('bounds a node with a thousand neighbours to the ceiling, and reports it', () => {
    const nodes: GraphNode[] = [{ id: 'hub', kind: 'reading', label: 'ぶん', componentIds: [] }];
    const edges: GraphEdge[] = [];
    for (let index = 0; index < 1000; index += 1) {
      const id = `kanji:${index}`;
      nodes.push({ id, kind: 'kanji', label: `k${index}`, componentIds: [] });
      edges.push({ kind: 'has_reading', from: id, to: 'hub' });
    }
    const hubGraph = buildKnowledgeGraph({ nodes, edges });
    const result = neighbourhoodOf(hubGraph, 'hub', { depth: 2, maxNodes: 50, perGroup: 10 });

    expect(result.nodes).toHaveLength(50);
    expect(result.truncated.some((entry) => entry.cause === 'max_nodes')).toBe(true);
  });
});
