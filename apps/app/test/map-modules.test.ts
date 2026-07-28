/**
 * The map's own predicates (Campaign E / B1).
 *
 * Each block below corresponds to a rule the lane was given, and every one of
 * them is checked against behaviour or against source rather than against a
 * comment. The rules this file exists to make un-assertable-without-proof:
 *
 *   1. every edge drawn is an edge the domain holds;
 *   2. nothing collapses five capability lenses into one light;
 *   3. an era is never guessed, and `unknown` is its own place;
 *   4. a route is a real ordered finite sequence and its position is a count;
 *   5. the scrubber reads two times from one axis, and writes nothing;
 *   6. exposure is never retrieval — no map module can reach a command;
 *   7. accumulation is not a streak.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ERA_LAYERS,
  attributeNodeEra,
  buildKnowledgeGraph,
  neighbourhoodOf,
  type GraphNode,
} from '@bunki/domain';

import { accumulationOf, dayOf } from '../src/ui/map/map-accumulation.ts';
import { BAND_LABELS, MAP_BANDS, bandOf, eraKeyOf, placeNodes } from '../src/ui/map/map-eras.ts';
import { layoutNeighbourhood } from '../src/ui/map/map-layout.ts';
import {
  LENS_IDS,
  MAP_MARK_STEPS,
  buildMapIndex,
  hasReached,
  markRank,
  projectMapNode,
} from '../src/ui/map/map-projection.ts';
import {
  MARKER_INTERVAL,
  ROUTE_GRADES,
  ROUTE_SUBSET_NOTE,
  buildRoutes,
  routeMarkers,
  routePosition,
} from '../src/ui/map/map-routes.ts';
import {
  daysBackAt,
  historyFrames,
  historySpanDays,
  resolveScrubber,
  scrubberRange,
} from '../src/ui/map/map-scrubber.ts';
import {
  buildMapAtlas,
  kanjiNodeId,
  mapAtlas,
  normaliseReading,
} from '../src/ui/map/map-source.ts';
import { RECALL_BANDS, isStandaloneRecallBand } from '../src/ui/theme.ts';
import type { MapLensView } from '../src/ui/map/map-projection.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(file, 'utf8');
const strip = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * Source with comments **and string literals** removed.
 *
 * Used only by the streak check, and the reason is worth stating because the
 * distinction bit once. Most scans here must keep strings: a place name or a hex
 * literal in rendered copy is exactly the defect being hunted. But the streak
 * ban is a ban on a *mechanism*, and the honest way to tell a learner there is
 * no streak is a sentence containing the word "streak" — which
 * `ACCUMULATION_NOTE` is. Scanning the copy would make the disclosure a
 * violation of the rule it discloses, which is the kind of test that gets
 * deleted rather than fixed.
 */
const identifiers = (text: string): string =>
  strip(text)
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""');

/**
 * Every `export function` in a module, with its parameter list read by balancing
 * parentheses rather than by a regex.
 *
 * A regex was what made the previous no-collapsed-light guard un-fireable, and a
 * lazy `\([^)]*\)` would have been fragile in its own way: a parameter whose type
 * is itself a function — `lensOf: (id, lens) => …`, which `map-routes.ts` has —
 * closes the group early and hides everything after it. Counting depth is a few
 * lines and cannot be fooled by either.
 */
const exportedSignatures = (
  text: string,
): readonly { readonly name: string; readonly params: string }[] => {
  const source = strip(text);
  const out: { name: string; params: string }[] = [];
  for (const match of source.matchAll(/export\s+function\s+(\w+)\s*\(/g)) {
    const name = match[1];
    if (name === undefined) continue;
    let depth = 1;
    let cursor = match.index + match[0].length;
    while (cursor < source.length && depth > 0) {
      const char = source[cursor];
      if (char === '(') depth += 1;
      else if (char === ')') depth -= 1;
      cursor += 1;
    }
    out.push({ name, params: source.slice(match.index + match[0].length, cursor - 1) });
  }
  return out;
};

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return ['.ts', '.tsx'].includes(extname(full)) ? [full] : [];
  });

/** Every file this lane owns. */
const LANE_FILES = [
  ...walk(resolve(APP_ROOT, 'src/ui/map')),
  resolve(APP_ROOT, 'src/screens/map-screen.tsx'),
  // `app/index.tsx`, not `app/map.tsx`: Wave D made the map the front door
  // (`src/ui/navigation.ts` §1), so the route that renders it is `/`.
  resolve(APP_ROOT, 'app/index.tsx'),
];

/* ------------------------------------------------------------------ *
 * A tiny hand-built atlas, so an extra edge cannot hide in 4,000 records
 * ------------------------------------------------------------------ */

const provenance = {
  source: 'test',
  license: null,
  retrieved_at: null,
  source_entry_id: null,
  notes: null,
};
const lexemeProvenance = {
  headword: provenance,
  reading: provenance,
  partOfSpeech: provenance,
  senses: provenance,
  kanjiUsed: provenance,
} as never;
const kanjiProvenance = {
  character: provenance,
  codepoint: provenance,
  strokeCount: provenance,
  components: provenance,
  radicals: provenance,
  strokeSvg: provenance,
  onReadings: provenance,
  kunReadings: provenance,
  meanings: provenance,
} as never;

const KANJI = [
  {
    id: 'k-yama',
    character: '山',
    codepoint: 'U+5C71',
    strokeCount: 3,
    components: ['山'],
    radicals: [],
    strokeSvg: '',
    onReadings: ['サン'],
    kunReadings: ['やま'],
    meanings: ['mountain'],
    provenance: kanjiProvenance,
  },
  {
    id: 'k-kawa',
    character: '川',
    codepoint: 'U+5DDD',
    strokeCount: 3,
    components: ['巛'],
    radicals: [],
    strokeSvg: '',
    onReadings: ['セン'],
    kunReadings: ['かわ'],
    meanings: ['river'],
    provenance: kanjiProvenance,
  },
];

const LEXEMES = [
  {
    id: 'lx-yama',
    headword: '山',
    reading: 'やま',
    partOfSpeech: ['n'],
    senses: ['mountain'],
    kanjiUsed: ['山'],
    provenance: lexemeProvenance,
  },
  {
    id: 'lx-sansen',
    headword: '山川',
    reading: 'さんせん',
    partOfSpeech: ['n'],
    senses: ['mountains and rivers'],
    kanjiUsed: ['山', '川'],
    provenance: lexemeProvenance,
  },
];

const tiny = buildMapAtlas(LEXEMES as never, KANJI as never);

/* ------------------------------------------------------------------ *
 * 1. Every edge drawn is an edge the domain holds
 * ------------------------------------------------------------------ */

describe('the Atlas declares only edges the seed carries', () => {
  it('builds the four edge kinds and no fifth', () => {
    const kinds = new Set<string>();
    tiny.graph.nodes.forEach((_node, id) => {
      for (const step of tiny.graph.adjacency.get(id) ?? []) kinds.add(step.kind);
    });
    expect([...kinds].sort()).toEqual(['component_of', 'contains', 'has_reading']);
  });

  it('never invents a contrast, because this build has no data for one', () => {
    const source = LANE_FILES.map((file) => strip(read(file))).join('\n');
    expect(source).not.toContain('contrasts_with');
  });

  it('drops a contains edge to a character this build does not ship', () => {
    // 岳 is in no kanji list above, so the lexeme that uses it must not point
    // at a node that is not there. A dangling edge is a line to nowhere.
    const atlas = buildMapAtlas(
      [
        {
          ...LEXEMES[0],
          id: 'lx-gaku',
          headword: '山岳',
          reading: 'さんがく',
          kanjiUsed: ['山', '岳'],
        },
      ] as never,
      KANJI as never,
    );
    expect(atlas.graph.diagnostics.filter((d) => d.kind === 'dangling_edge')).toEqual([]);
    expect(atlas.graph.nodes.has(kanjiNodeId('岳'))).toBe(false);
  });

  it('reports no duplicate-edge diagnostics over the shipped tier', () => {
    // The normalisation collapses KANJIDIC2 reading variants onto one node, so
    // the source deduplicates. If this regresses the graph still works and the
    // diagnostics that mean something get buried, which is the real cost.
    expect(mapAtlas().graph.diagnostics).toEqual([]);
  });

  it('normalises a KANJIDIC2 reading to the form a family joins on', () => {
    expect(normaliseReading('ひと.つ')).toBe('ひとつ');
    expect(normaliseReading('サン')).toBe('さん');
    expect(normaliseReading('ひと-')).toBe('ひと');
  });

  it('lays out only lines whose two ends it was given', () => {
    const neighbourhood = neighbourhoodOf(tiny.graph, 'lexeme:lx-sansen');
    const layout = layoutNeighbourhood(neighbourhood);
    const drawn = new Set(layout.points.map((point) => point.node.id));
    for (const line of layout.lines) {
      expect(drawn.has(line.from.node.id)).toBe(true);
      expect(drawn.has(line.to.node.id)).toBe(true);
    }
    // …and no more lines than the neighbourhood carried.
    expect(layout.lines.length).toBeLessThanOrEqual(neighbourhood.edges.length);
    expect(layout.unplaced).toEqual([]);
  });

  it('is deterministic: the same neighbourhood lays out identically twice', () => {
    const once = layoutNeighbourhood(neighbourhoodOf(tiny.graph, 'lexeme:lx-sansen'));
    const twice = layoutNeighbourhood(neighbourhoodOf(tiny.graph, 'lexeme:lx-sansen'));
    expect(once.points.map((p) => [p.node.id, p.x, p.y])).toEqual(
      twice.points.map((p) => [p.node.id, p.x, p.y]),
    );
  });

  it('renders an empty neighbourhood as an empty field rather than throwing', () => {
    const empty = layoutNeighbourhood(neighbourhoodOf(tiny.graph, 'lexeme:nope'));
    expect(empty.points).toEqual([]);
    expect(empty.lines).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * 2. Never one brightness for a whole node
 * ------------------------------------------------------------------ */

describe('no function collapses the five lenses into one light', () => {
  /**
   * This guard was a regex over a type the file does not import, so it could
   * not fire — and `map-projection.ts`'s header cited it as proof that "the
   * missing function stays missing".
   *
   * The old assertion was
   * `expect(source).not.toMatch(/export function \w+\([^)]*NodeRetrievability/)`.
   * `map-projection.ts` imports no `NodeRetrievability`; the only whole-node
   * type it has is its own `MapNodeView`. So the pattern had nothing to match
   * against in any version of the file, passing or failing. A literal collapse —
   * `export function nodeBand(view: MapNodeView): StandaloneRecallBand` returning
   * the mean of five lens ranks — typechecked, linted clean and passed all five
   * tests in this block.
   *
   * The invariant, stated so it can actually be checked: **an export may hold a
   * whole node only if it also names a lens.** `lensView(view, lens)` is the one
   * legitimate shape and it satisfies this by construction; `projectMapNode`
   * builds a node view and takes no lens, which is why the rule is about
   * *parameters* rather than about mentioning the type at all.
   */
  it('lets no export take a whole node without also naming a lens', () => {
    const file = resolve(APP_ROOT, 'src/ui/map/map-projection.ts');
    const signatures = exportedSignatures(read(file));
    // The guard is worthless if it is walking an empty list.
    expect(signatures.map((signature) => signature.name)).toContain('lensView');

    for (const signature of signatures) {
      if (!/\bMapNodeView\b/.test(signature.params)) continue;
      expect(
        /\bCapabilityId\b/.test(signature.params),
        `${signature.name} takes a whole node view and no lens, which is the collapsed light REQ-UI-07 forbids`,
      ).toBe(true);
    }
  });

  /**
   * The same rule as behaviour rather than as source: five lenses in, five
   * views out, in order, with nothing summarising them.
   */
  it('projects five separate lens views for a node and summarises none of them', () => {
    const node = tiny.graph.nodes.get('lexeme:lx-sansen');
    if (node === undefined) throw new Error('no node');
    const view = projectMapNode(buildMapIndex([], []), node, '2026-07-28T00:00:00.000Z');
    expect(view.lenses.map((lens) => lens.lens)).toEqual([...LENS_IDS]);
    // Every extra key on the node view would be a candidate summary. There is
    // exactly one, and it is the id.
    expect(Object.keys(view).sort()).toEqual(['lenses', 'nodeId']);
  });

  it('has no averaging, summing or percentage anywhere in the lane', () => {
    for (const file of LANE_FILES) {
      const source = strip(read(file));
      expect(source, relative(APP_ROOT, file)).not.toMatch(/\baverage\b|\bmastery\b/i);
      // A percent sign in a template literal would be a rendered percentage.
      expect(source, relative(APP_ROOT, file)).not.toMatch(/\$\{[^}]*\}\s*%/);
      // Arithmetic *over the lens array* is the mechanism a collapse needs, and
      // the word-level scan above cannot see it: the probe that beat the old
      // guard was spelled `ranks.reduce((a, b) => a + b, 0) / ranks.length` and
      // contains none of "average", "mastery" or "%". The lane reads `.lenses`
      // exactly twice — `.find` to pick one, `.map(toLensView)` to build them —
      // and any other operator on it is refused here.
      for (const [, operator] of source.matchAll(/\.lenses\s*\.\s*(\w+)/g)) {
        expect([operator, relative(APP_ROOT, file)]).toEqual([
          expect.stringMatching(/^(find|map)$/),
          relative(APP_ROOT, file),
        ]);
      }
    }
  });

  /**
   * The ramp position of a mark is computable in exactly one file.
   *
   * `markRank` turning a mark into a number is what any collapse — mean, max,
   * sum, "best lens" — needs, and `.lenses.map(markRank)` would slip past the
   * operator scan above. Keeping the function's *callers* inside
   * `map-projection.ts` means a surface cannot rank five lenses at all; the only
   * thing it can ask is `hasReached(oneLensView, band)`, which is per lens by
   * signature. This is the tight half of the rule and the scan above is the
   * loose half; both are here because neither alone was enough.
   */
  it('lets no surface turn a mark into a number', () => {
    for (const file of LANE_FILES) {
      if (file.endsWith('map-projection.ts')) continue;
      expect(strip(read(file)), relative(APP_ROOT, file)).not.toMatch(/\bmarkRank\b/);
    }
  });

  it('lit steps come from two real numbers, and are ordered brightest first', () => {
    const ranks = MAP_MARK_STEPS.map((step) => markRank({ kind: 'lit', band: step.band }));
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    for (const step of MAP_MARK_STEPS) {
      expect(RECALL_BANDS).toContain(step.band);
    }
  });

  /**
   * The map never draws one of the two meter-only ramp steps as a bare mark.
   *
   * `RECALL_BAND_MARKS` declares those steps meter-only because they sit below
   * 3:1 on purpose, and `RecallIndicator` handed one resolves to `RecallMeter` —
   * three lines of text under a 12-point dot. On a fresh install every node is
   * in one of them, so this is the common case rather than an edge one. The lane
   * expresses them as `MapMark` states drawn in form instead, and the step table
   * being typed to the standalone steps is what keeps that true.
   */
  it('offers no lit step the design system forbids as a bare mark', () => {
    for (const step of MAP_MARK_STEPS) {
      expect(isStandaloneRecallBand(step.band), `${step.band} may not be drawn bare`).toBe(true);
    }
    expect(markRank({ kind: 'nothing-observed' })).toBeLessThan(0);
    expect(markRank({ kind: 'under-the-floor' })).toBeLessThan(0);
  });

  it('treats an unmeasured lens as unseen rather than as weak', () => {
    const unmeasured: MapLensView = {
      lens: 'reading',
      mark: { kind: 'nothing-observed' },
      fragile: false,
      presence: 'unknown',
      uncertainty: 'unknown',
      coverage: 'none',
      dueState: 'not_scheduled',
      intervalDays: null,
      chance: null,
      admittedReviewCount: 0,
      basis: '',
    };
    expect(hasReached(unmeasured, 'emerging')).toBe(false);
    // …and neither is a lens that was observed and has fallen under the floor.
    expect(hasReached({ ...unmeasured, mark: { kind: 'under-the-floor' } }, 'emerging')).toBe(
      false,
    );
    expect(hasReached({ ...unmeasured, mark: { kind: 'lit', band: 'durable' } }, 'settled')).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------------------ *
 * 3. An era is never guessed
 * ------------------------------------------------------------------ */

describe('era layers are honest, and unknown is its own place', () => {
  it('has a band for each era layer and one more for unknown', () => {
    expect(MAP_BANDS).toEqual([...ERA_LAYERS, 'unknown']);
    expect(BAND_LABELS).toHaveLength(MAP_BANDS.length);
    expect(BAND_LABELS.at(-1)?.written).toBeNull();
  });

  it('places a node on exactly the layer the domain says, and never a default', () => {
    const nodes: GraphNode[] = [...tiny.graph.nodes.values()];
    const tallies = placeNodes(tiny, nodes);
    for (const tally of tallies) {
      for (const placed of tally.nodes) {
        // The band is the domain's placement, unchanged — not a fallback.
        expect(placed.band).toBe(bandOf(placed.attribution.placement));
        expect(placed.band).toBe(
          attributeNodeEra(placed.node, tiny.eraSources.get(placed.node.id)).placement,
        );
      }
    }
  });

  it('places 山 やま on the ancient road and 山川 nowhere', () => {
    const tallies = placeNodes(tiny, [...tiny.graph.nodes.values()]);
    const kodo = tallies.find((t) => t.band === 'kodo');
    const unknown = tallies.find((t) => t.band === 'unknown');
    expect(kodo?.nodes.map((n) => n.node.label)).toEqual(['山']);
    // The compound is native throughout and is still not placed: a compound's
    // coinage date is not its parts' stratum.
    expect(unknown?.nodes.some((n) => n.node.label === '山川')).toBe(true);
  });

  it('never places a kanji character on a layer', () => {
    const tallies = placeNodes(tiny, [...tiny.graph.nodes.values()]);
    for (const tally of tallies) {
      if (tally.band === 'unknown') continue;
      for (const placed of tally.nodes) {
        expect(placed.node.kind).not.toBe('kanji');
      }
    }
  });

  it('keeps every placed node accountable to a stated basis', () => {
    const tallies = placeNodes(tiny, [...tiny.graph.nodes.values()]);
    for (const tally of tallies) {
      for (const placed of tally.nodes) {
        expect(placed.attribution.detail.length).toBeGreaterThan(20);
        expect(placed.attribution.basis).toBeTruthy();
      }
    }
  });

  it('maps each era layer onto its own theme register', () => {
    expect(ERA_LAYERS.map(eraKeyOf)).toEqual(['kodo', 'kaido', 'tetsudo']);
  });
});

/* ------------------------------------------------------------------ *
 * 4. A route is a real sequence, and a position is a count
 * ------------------------------------------------------------------ */

describe('routes are named, ordered, finite sequences of real data', () => {
  const routes = buildRoutes(mapAtlas());

  it('builds at least one route, so the surface is not vacuous', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('names what the sequence is, and borrows no place name', () => {
    for (const route of routes) {
      expect(route.name).toMatch(/^Grade [1-6] kanji$/);
    }
    // The historical roads gave the shape, not the names.
    const source = LANE_FILES.map((file) => strip(read(file))).join('\n');
    for (const place of ['Tōkaidō', 'Nakasendō', 'Nihonbashi', 'Kumano']) {
      expect(source, `${place} is a place name, and a route may not borrow one`).not.toContain(
        place,
      );
    }
  });

  it('is ordered by a real field, totally and deterministically', () => {
    for (const route of routes) {
      const ranks = route.stations.map((s) => s.frequency ?? Number.POSITIVE_INFINITY);
      expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      expect(route.stations.map((s) => s.ordinal)).toEqual(
        route.stations.map((_s, index) => index + 1),
      );
    }
    // Same atlas, same sequence.
    expect(buildRoutes(mapAtlas()).map((r) => r.stations.map((s) => s.character))).toEqual(
      routes.map((r) => r.stations.map((s) => s.character)),
    );
  });

  it('only ever draws from the grades it says it draws from', () => {
    expect(routes.map((route) => route.id).sort()).toEqual(routes.map((route) => route.id).sort());
    for (const route of routes) {
      const grade = Number(route.id.replace('grade-', ''));
      expect(ROUTE_GRADES).toContain(grade);
    }
  });

  it('has a length that is a real count, and stations the map can open', () => {
    const atlas = mapAtlas();
    for (const route of routes) {
      expect(route.stations.length).toBeGreaterThan(0);
      for (const station of route.stations) {
        expect(atlas.graph.nodes.has(station.nodeId)).toBe(true);
      }
    }
  });

  it('reports position as a count on a named lens, and it can go down', () => {
    const route = routes[0];
    if (route === undefined) throw new Error('no route');
    const durable: MapLensView = {
      lens: 'reading',
      mark: { kind: 'lit', band: 'durable' },
      fragile: false,
      presence: 'attested',
      uncertainty: 'narrow',
      coverage: 'established',
      dueState: 'not_due',
      intervalDays: 90,
      chance: 0.99,
      admittedReviewCount: 9,
      basis: '',
    };

    const all = routePosition(route, 'reading', 'settled', () => durable);
    expect(all.reached).toBe(route.stations.length);
    expect(all.nextStation).toBeNull();
    expect(all.sentence).toBe(
      `${String(route.stations.length)} of ${String(route.stations.length)} stations reached`,
    );

    // The same road, the same lens, after decay: the count falls.
    const faded = routePosition(route, 'reading', 'settled', () => ({
      ...durable,
      mark: { kind: 'under-the-floor' },
    }));
    expect(faded.reached).toBe(0);
    expect(faded.nextStation?.ordinal).toBe(1);

    // A station with no projection is not reached — no evidence is not evidence.
    const none = routePosition(route, 'reading', 'settled', () => null);
    expect(none.reached).toBe(0);
  });

  /**
   * The count is not an ordinal, and nothing on screen may read as one.
   *
   * This is the shape that shipped: five stations reached at ordinals 3, 17, 40,
   * 55 and 70 printed "Station 5 of 77" above "Next unreached: 日 (station 1)"
   * with no 一里塚 filled — three statements about one position, disagreeing,
   * because `reached` is a count and both the sentence and the marker fill were
   * treating it as a place. Non-prefix reach is the *normal* case: KANJIDIC2
   * frequency order has nothing to do with which characters a learner captured.
   */
  it('never renders its count as an ordinal, and marks the stations it actually reached', () => {
    const route = routes[0];
    if (route === undefined) throw new Error('no route');
    const reachedAt = new Set([3, 17, 40, 55, 70]);
    const ordinalOf = new Map(route.stations.map((station) => [station.nodeId, station.ordinal]));
    const settled: MapLensView = {
      lens: 'reading',
      mark: { kind: 'lit', band: 'settled' },
      fragile: false,
      presence: 'attested',
      uncertainty: 'narrow',
      coverage: 'established',
      dueState: 'not_due',
      intervalDays: 30,
      chance: 0.95,
      admittedReviewCount: 3,
      basis: '',
    };
    const position = routePosition(route, 'reading', 'settled', (nodeId) => {
      const ordinal = ordinalOf.get(nodeId);
      return ordinal !== undefined && reachedAt.has(ordinal) ? settled : null;
    });

    expect(position.reached).toBe(5);
    expect(position.sentence).toBe(`5 of ${String(route.stations.length)} stations reached`);
    // The old sentence, in its exact shape, must not come back.
    expect(position.sentence).not.toMatch(/^Station \d+ of/);
    // The count is the membership, read another way — never an independent number.
    expect(position.reachedOrdinals.size).toBe(position.reached);
    expect([...position.reachedOrdinals].sort((a, b) => a - b)).toEqual([3, 17, 40, 55, 70]);
    // Station 1 is genuinely unreached, and the sentence no longer contradicts it.
    expect(position.nextStation?.ordinal).toBe(1);
    // The strip fills a marker from its own station. Ordinal 40 is reached and
    // is a marker; 10 is a marker and is not reached; a left-to-right fill would
    // have had it the other way round.
    expect(routeMarkers(route)).toContain(40);
    expect(position.reachedOrdinals.has(40)).toBe(true);
    expect(position.reachedOrdinals.has(10)).toBe(false);
  });

  /**
   * The road is as long as this build's dictionary, and says so.
   *
   * The rule used to promise "every kanji KANJIDIC2 assigns to this school
   * grade" and "nothing is sampled". The kanji tier is a sample by its own
   * admission, and grade 1 ships 77 characters where the grade has 80, so a
   * learner who reached all 77 would have believed they had finished grade 1.
   */
  it('discloses that its stations are a subset of the grade', () => {
    const tier = JSON.parse(
      read(resolve(APP_ROOT, '../../packages/seed/data/dictionary/kanji.json')),
    ) as { readonly _comment: readonly string[] };
    // The disclosure quotes the tier. If the importer stops limiting the set,
    // this fails and the sentence has to be rewritten rather than left standing.
    expect(tier._comment.join(' ')).toContain('limited to those the imported lexemes actually use');
    expect(ROUTE_SUBSET_NOTE).toContain('limited to those the imported lexemes actually use');

    for (const route of routes) {
      expect(route.rule, route.id).not.toContain('nothing is sampled');
      expect(route.rule, route.id).toContain('subset');
    }
    // The number the note states is the number the build actually ships.
    const grade1 = routes.find((route) => route.id === 'grade-1');
    expect(ROUTE_SUBSET_NOTE).toContain(`ships ${String(grade1?.stations.length ?? 0)} of`);
  });

  it('never reports a percentage or a ratio', () => {
    const route = routes[0];
    if (route === undefined) throw new Error('no route');
    const position = routePosition(route, 'reading', 'settled', () => null);
    expect(position.sentence).not.toContain('%');
    expect(Object.keys(position)).not.toContain('fraction');
    expect(Object.keys(position)).not.toContain('percent');
  });

  it('marks real intervals of the real sequence, and always marks the end', () => {
    const route = routes[0];
    if (route === undefined) throw new Error('no route');
    const markers = routeMarkers(route);
    expect(markers.at(-1)).toBe(route.stations.length);
    for (const ordinal of markers) {
      expect(ordinal).toBeGreaterThan(0);
      expect(ordinal).toBeLessThanOrEqual(route.stations.length);
    }
    expect(markers[0]).toBe(Math.min(MARKER_INTERVAL, route.stations.length));
  });
});

/* ------------------------------------------------------------------ *
 * 5. One control, two times
 * ------------------------------------------------------------------ */

describe('the scrubber reads two times from one axis', () => {
  const now = '2026-07-28T00:00:00.000Z';
  const frames = historyFrames('2026-07-01T00:00:00.000Z', now);

  it('has a detent at now, history behind it and the eras ahead', () => {
    const range = scrubberRange(frames.length);
    expect(range.min).toBeLessThan(0);
    expect(range.max).toBe(ERA_LAYERS.length);
    expect(resolveScrubber(0, frames, now).reading).toBe('now');
    expect(resolveScrubber(-1, frames, now).reading).toBe('your-history');
    expect(resolveScrubber(1, frames, now).reading).toBe('language-eras');
  });

  it('names the other direction at every position, so neither is hidden', () => {
    for (const value of [-3, -1, 0, 1, 2, 3]) {
      const position = resolveScrubber(value, frames, now);
      expect(position.label.length).toBeGreaterThan(0);
      expect(position.otherDirection.length).toBeGreaterThan(0);
      expect(position.otherDirection).not.toBe(position.label);
    }
  });

  it('shows every era band except when walking one', () => {
    expect(resolveScrubber(0, frames, now).bands).toEqual([...ERA_LAYERS]);
    expect(resolveScrubber(-2, frames, now).bands).toEqual([...ERA_LAYERS]);
    expect(resolveScrubber(2, frames, now).bands).toEqual([ERA_LAYERS[1]]);
  });

  it('projects at an earlier instant when pulled back, and at now otherwise', () => {
    expect(resolveScrubber(0, frames, now).at).toBe(now);
    expect(resolveScrubber(3, frames, now).at).toBe(now);
    expect(Date.parse(resolveScrubber(-5, frames, now).at)).toBeLessThan(Date.parse(now));
  });

  it('clamps rather than throwing, so no input can take the map down', () => {
    expect(resolveScrubber(999, frames, now).value).toBe(ERA_LAYERS.length);
    expect(resolveScrubber(-9999, frames, now).value).toBe(scrubberRange(frames.length).min);
  });

  it('still renders for a learner with no history at all', () => {
    const position = resolveScrubber(-1, [now], now);
    expect(position.at).toBe(now);
    expect(scrubberRange(0).min).toBe(0);
    expect(resolveScrubber(0, [], now).otherDirection).toContain('no earlier day recorded yet');
  });

  /**
   * A one-frame history has **no arm**, and the copy must agree with the control.
   *
   * `scrubberRange(1).min` is 0, so `scrubber.tsx` renders no negative step —
   * correctly. The copy keyed off `historyFrames === 0` instead, so a learner
   * with exactly one frame read "Pull left through 1 days of your own history"
   * beside a control with nothing to its left, with a broken plural. That is the
   * state of every fresh install and of every learner on their first day,
   * *including* immediately after capturing, keeping, promoting, sitting a
   * session and answering a probe — real work, one day of it.
   */
  it('does not invite a gesture it renders no step for', () => {
    for (const framesHeld of [[], [now]]) {
      const position = resolveScrubber(0, framesHeld, now);
      expect(scrubberRange(framesHeld.length).min).toBe(0);
      expect(position.otherDirection, JSON.stringify(framesHeld)).not.toMatch(/Pull left/);
      expect(position.otherDirection, JSON.stringify(framesHeld)).not.toMatch(/\b1 days\b/);
      expect(position.otherDirection).toContain('no earlier day recorded yet');
    }
    // Two frames is one real day back, and the arm exists, so the invitation is
    // honest — and singular.
    const oneDay = historyFrames('2026-07-27T00:00:00.000Z', now);
    expect(scrubberRange(oneDay.length).min).toBeLessThan(0);
    expect(resolveScrubber(0, oneDay, now).otherDirection).toContain('Pull left through 1 day of');
  });

  /**
   * A frame index is not a day once history passes the cap.
   *
   * `historyFrames` caps at 480 and widens the step, so on a 1,500-day log frame
   * −479 is 1,500 days back. Every day figure the learner reads used to be formed
   * from the *position*: a three-year history and a sixteen-month one both said
   * "479 days back", on the one control whose entire job is to say when.
   */
  it('names days from the frame’s own instant, not from its index', () => {
    const at = Date.parse(now);
    for (const days of [3, 479, 480, 1000, 1500]) {
      const from = new Date(at - days * 24 * 60 * 60 * 1000).toISOString();
      const held = historyFrames(from, now);
      const range = scrubberRange(held.length);
      const oldest = resolveScrubber(range.min, held, now);
      const actual = Math.round((at - Date.parse(oldest.at)) / (24 * 60 * 60 * 1000));

      expect(actual, `${String(days)}d span`).toBe(days);
      expect(oldest.label, `${String(days)}d span`).toBe(
        `Your history — ${String(days)} days back`,
      );
      expect(daysBackAt(range.min, held, now), `${String(days)}d span`).toBe(days);
      expect(historySpanDays(held, now), `${String(days)}d span`).toBe(days);
      // And the detent's invitation is a duration, not a frame count.
      expect(resolveScrubber(0, held, now).otherDirection).toContain(
        `Pull left through ${String(days)} days`,
      );
    }
  });

  it('ends its frame list exactly at the present', () => {
    expect(frames.at(-1)).toBe(now);
    expect(historyFrames('2020-01-01T00:00:00.000Z', now).at(-1)).toBe(now);
    // A very long history is capped in frames, not in reach.
    expect(historyFrames('2000-01-01T00:00:00.000Z', now).length).toBeLessThanOrEqual(480);
  });

  /**
   * The era arm has a consumer, not just a value.
   *
   * `ScrubberPosition.bands` was computed, documented ("exactly one when walking
   * the language's strata"), unit-tested three lines above — and read by nobody.
   * The screen rendered all four bands from `placeNodes` unconditionally, so
   * pressing +1/+2/+3 changed the caption and left the field byte-identical,
   * while the step's own `accessibilityHint` promised it "walks to this layer".
   *
   * A pure-function test cannot see that, which is exactly why it gave false
   * assurance. This one is about the wiring: the screen must read `position.bands`
   * and the list it renders must be the filtered one.
   */
  it('is read by the screen, and not only computed', () => {
    const screen = strip(read(resolve(APP_ROOT, 'src/screens/map-screen.tsx')));
    expect(screen, 'the screen never reads the era arm').toContain('position.bands');
    // The bands it maps over must be the filtered list, not the raw placement.
    expect(screen).toMatch(/\{shownBands\.map\(/);
    expect(screen, 'the raw placement is still being rendered').not.toMatch(/\{bands\.map\(/);
  });
});

/* ------------------------------------------------------------------ *
 * 6. Exposure is never retrieval
 * ------------------------------------------------------------------ */

describe('nothing on the map can produce evidence', () => {
  it.each(LANE_FILES.map((file) => [relative(APP_ROOT, file), file] as const))(
    '%s executes no command and mints no event',
    (name, file) => {
      const source = strip(read(file));
      expect(source, `${name} dispatches a command`).not.toMatch(/\.execute\s*\(/);
      expect(source, `${name} mints an event`).not.toContain('createDomainEvent');
      expect(source, `${name} persists minted events`).not.toContain('persistMinted');
      expect(source, `${name} reaches the evidence gate`).not.toMatch(
        /admitToScheduler|evidenceGate/,
      );
    },
  );

  it('reads the ledger and nothing else', () => {
    const screen = strip(read(resolve(APP_ROOT, 'src/screens/map-screen.tsx')));
    expect(screen).toContain('store.readDerived()');
    // `useAppStore` is present for the read; if a write ever appears the
    // per-file assertion above fails first.
    expect(screen).not.toMatch(/store\.execute/);
  });

  it('keeps the projection seam to one reader', () => {
    const source = strip(read(resolve(APP_ROOT, 'src/ui/map/map-projection.ts')));
    expect(source).toContain('function readProjection(');
    for (const file of LANE_FILES) {
      if (file.endsWith('map-projection.ts')) continue;
      expect(strip(read(file)), relative(APP_ROOT, file)).not.toMatch(
        /\.retrievability\b|\.stabilityDays\b/,
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * 7. Accumulation, and the streak it is not
 * ------------------------------------------------------------------ */

describe('accumulation is visible and is not a streak', () => {
  const now = '2026-07-28T09:00:00.000Z';
  const state = (activatedAt: string, reviews: number) => ({
    contractId: `c-${activatedAt}-${String(reviews)}`,
    activatedAt,
    lastReviewedAt: null,
    admittedReviewCount: reviews,
  });

  it('says plainly when today added nothing', () => {
    const empty = accumulationOf({ memoryStates: [], gateDecisions: [] }, now);
    expect(empty.todayAddedSomething).toBe(false);
    expect(empty.sentence).toContain('nothing yet');
  });

  it('counts what today put in, from the gate’s own record', () => {
    const result = accumulationOf(
      {
        memoryStates: [state('2026-07-28T08:00:00.000Z', 1), state('2026-01-01T00:00:00.000Z', 4)],
        gateDecisions: [
          { admitted: true, at: '2026-07-28T08:30:00.000Z' },
          { admitted: false, at: '2026-07-28T08:31:00.000Z' },
          { admitted: true, at: '2026-07-27T08:30:00.000Z' },
        ],
      },
      now,
    );
    expect(result.activatedToday).toBe(1);
    // The refused review is not work, which is the whole point of a gate.
    expect(result.admittedToday).toBe(1);
    expect(result.contractsStanding).toBe(2);
    expect(result.contractsAttested).toBe(2);
    expect(result.todayAddedSomething).toBe(true);
  });

  it('does not fall when a day is missed, because it counts no days', () => {
    const input = {
      memoryStates: [state('2026-01-01T00:00:00.000Z', 4)],
      gateDecisions: [{ admitted: true, at: '2026-01-01T00:00:00.000Z' }],
    };
    const early = accumulationOf(input, '2026-01-02T00:00:00.000Z');
    const muchLater = accumulationOf(input, '2027-06-01T00:00:00.000Z');
    expect(muchLater.contractsStanding).toBe(early.contractsStanding);
    expect(muchLater.contractsAttested).toBe(early.contractsAttested);
  });

  /**
   * The ban is on a **mechanism**, so it is checked as behaviour first.
   *
   * The name scan below is real but shallow: it greps identifiers for
   * `streak|daysActive|consecutive`, so a genuine consecutive-day counter called
   * `runLength` passed the whole file. (Measured: swapping `contractsStanding`
   * for a day-run counter named `runLength` left all 63 tests green; renaming it
   * `streak` went red, which is the proof it was a name grep.)
   *
   * What a streak actually *is*: a number that depends on how the same work was
   * **distributed across days**, and that a gap reduces. So the mechanism is
   * absent exactly when the result is invariant to that distribution. Two
   * ledgers, same totals, same `now`, nothing today: one on five consecutive
   * days, one scattered across five months with gaps everywhere. Every field of
   * the accumulation — including the rendered sentence — must be identical. A
   * `runLength` under any name differs on the first of those inputs.
   */
  it('is invariant to how the same work was spread across days', () => {
    const asOf = '2026-07-28T09:00:00.000Z';
    const build = (days: readonly string[]) => ({
      memoryStates: days.map((day, index) =>
        state(`${day}T08:00:00.000Z`, index === 0 ? 0 : index),
      ),
      gateDecisions: days
        .slice(1)
        .map((day) => ({ admitted: true, at: `${day}T08:30:00.000Z` }) as const),
    });

    const consecutive = accumulationOf(
      build(['2026-07-20', '2026-07-21', '2026-07-22', '2026-07-23', '2026-07-24']),
      asOf,
    );
    const scattered = accumulationOf(
      build(['2026-03-02', '2026-04-19', '2026-05-01', '2026-06-30', '2026-07-24']),
      asOf,
    );

    expect(scattered).toEqual(consecutive);
    // And the shape carries nothing a day-run could hide in: five fields, all
    // named for what they count, none of them a duration.
    expect(Object.keys(consecutive).sort()).toEqual([
      'activatedToday',
      'admittedToday',
      'contractsAttested',
      'contractsStanding',
      'sentence',
      'todayAddedSomething',
    ]);
  });

  it('has no consecutive-day counter anywhere in the lane', () => {
    for (const file of LANE_FILES) {
      const source = identifiers(read(file));
      const name = relative(APP_ROOT, file);
      expect(source, name).not.toMatch(/\bstreak\b|\bdaysActive\b|\bconsecutive\b/i);
      expect(source, name).not.toMatch(/\bxp\b|\bbadge\b|\bconfetti\b|\bleague\b/i);
    }
  });

  it('says in the copy that it is not a streak, and means it', () => {
    // The mechanism is absent (above) and the claim is present (here). Either
    // alone would be worth nothing: an unstated absence a learner cannot see,
    // or a sentence asserting a property the code does not have.
    const note = read(resolve(APP_ROOT, 'src/ui/map/map-accumulation.ts'));
    expect(note).toContain('not a streak');
    expect(identifiers(note)).not.toMatch(/\bstreak\b/i);
  });

  it('counts by the ledger’s own zone', () => {
    expect(dayOf('2026-07-28T23:59:59.999Z')).toBe('2026-07-28');
  });
});

/* ------------------------------------------------------------------ *
 * 8. The vocabulary that already exists is the vocabulary used
 * ------------------------------------------------------------------ */

describe('motion serves comprehension, and the claim about it is checked', () => {
  /**
   * The map settles, and it settles through the vocabulary's own primitive.
   *
   * `scrubber.tsx` described this in prose for a whole round while nothing on
   * the map imported `Settle` at all — a comment asserting a property the code
   * did not have, which is the defect class this repository is caught by most
   * often. The claim is now held here rather than by anyone remembering.
   *
   * The `key` is the load-bearing part: `Settle` animates on mount only (its own
   * docblock says why — a component that re-settled on every prop change would
   * make a live surface shiver), so it re-settles exactly when the field is
   * about something else. Origin, lens and scrubber position are what the field
   * is about.
   */
  it('settles the field through the shared primitive, keyed on what it is about', () => {
    const screen = strip(read(resolve(APP_ROOT, 'src/screens/map-screen.tsx')));
    expect(screen).toContain('<Settle');
    expect(screen).toMatch(/import \{ Settle \} from '\.\.\/ui\/motion\.tsx'/);
    const settle = screen.slice(screen.indexOf('<Settle'), screen.indexOf('<Settle') + 220);
    for (const dependency of ['originId', 'lens', 'position.value']) {
      expect(settle, `the settle key ignores ${dependency}`).toContain(dependency);
    }
  });

  /**
   * Nothing on this surface loops, pulses, spins or celebrates.
   *
   * The design bans ambient churn and bans anything reachable from being right
   * about something. `Settle` and `BranchLight` are the only motion the
   * vocabulary offers and both are one-shot; a raw `Animated.loop`, a CSS
   * animation or a timer driving a style would be neither.
   */
  it('runs no loop, no timer-driven style and no celebration', () => {
    for (const file of LANE_FILES) {
      const source = strip(read(file));
      expect(source, relative(APP_ROOT, file)).not.toMatch(
        /Animated\.loop|setInterval|requestAnimationFrame|infinite/,
      );
      /*
        Identifiers, not copy — the same distinction the streak check below
        already draws, and for the same reason. `ACCUMULATION_NOTE` has to be
        able to *say* "not a streak" to a learner, and a scan over strings would
        make the honest disclosure a violation of the rule it discloses. What
        must not exist is the mechanism.
      */
      expect(identifiers(source), relative(APP_ROOT, file)).not.toMatch(
        /\bconfetti\b|\bcelebrat|\bstreak\b|\bbadge\b|\bXP\b/i,
      );
    }
  });
});

describe('the lane extends the built vocabulary rather than forking it', () => {
  it('writes no hex literal in any component', () => {
    for (const file of LANE_FILES) {
      expect(strip(read(file)), relative(APP_ROOT, file)).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });

  /**
   * The lit steps are drawn by the design system's own component.
   *
   * This assertion used to name `RecallIndicator`, which was the wrong component
   * and hid a real defect: `RecallIndicator` is total over the five-step ramp by
   * *switching to `RecallMeter`* for the two meter-only steps, so every node on a
   * fresh install — where every node is in one of those two — rendered a
   * capability label, a band word, a five-segment track and a basis line inside a
   * 44-point press target. The lane draws `RecallMark` for the three steps that
   * may be bare and its own form marks for the two that may not, which is the
   * rule `RECALL_BAND_MARKS` states rather than an exception to it.
   */
  it('draws its lit marks with the shared recall component', () => {
    // Stripped, because the file has to be able to *name* the component it
    // deliberately does not use in order to explain why.
    const mark = strip(read(resolve(APP_ROOT, 'src/ui/map/node-mark.tsx')));
    expect(mark).toContain('RecallMark');
    expect(mark, 'the meter must not be reachable from a map node').not.toContain(
      'RecallIndicator',
    );
    const field = read(resolve(APP_ROOT, 'src/ui/map/map-field.tsx'));
    expect(field).toContain('<NodeMark');
    const screen = read(resolve(APP_ROOT, 'src/screens/map-screen.tsx'));
    expect(screen).toContain('<LensRow');
    expect(screen).toContain('<SeedEntryDisclosure />');
  });

  /**
   * No file in the lane may reach the meter, by any route.
   *
   * The component-level assertion above is about `node-mark.tsx`; this is about
   * the lane, because the defect it replaces was one component away from where
   * anybody was looking.
   */
  it('never reaches the labelled meter from a map surface', () => {
    for (const file of LANE_FILES) {
      const source = strip(read(file));
      expect(source, relative(APP_ROOT, file)).not.toMatch(/\bRecall(Indicator|Meter)\b/);
    }
  });

  it('paints a ground in exactly one file, and that file renders no text', () => {
    const painters = LANE_FILES.filter((file) =>
      /import\s*\{[^}]*\b(groundOf|groundLayers|planEmissive|ERA_PIGMENTS|GROUNDS)\b/.test(
        read(file),
      ),
    ).map((file) => relative(APP_ROOT, file));
    expect(painters).toEqual(['src/ui/map/era-ground.tsx']);
    expect(strip(read(resolve(APP_ROOT, 'src/ui/map/era-ground.tsx')))).not.toMatch(/<Text[\s/>]/);
  });

  it('never lets the unknown band render on an era ground', () => {
    const screen = strip(read(resolve(APP_ROOT, 'src/screens/map-screen.tsx')));
    // The unknown branch must be the one that does *not* reach EraGround.
    expect(screen).toMatch(/band\.band === 'unknown'[\s\S]{0,400}?<EraGround/);
    const unknownBranch = screen.slice(
      screen.indexOf("band.band === 'unknown'"),
      screen.indexOf('<EraGround'),
    );
    expect(unknownBranch).not.toContain('<EraGround');
  });
});

/* ------------------------------------------------------------------ *
 * 9. The graph the surface actually walks
 * ------------------------------------------------------------------ */

describe('the shipped atlas is what the map draws', () => {
  it('holds both tiers and joins them to the Trace by the kernel’s own id', () => {
    const atlas = mapAtlas();
    expect(atlas.lexemes.size).toBeGreaterThan(3000);
    expect(atlas.kanji.size).toBeGreaterThan(1200);
    const yama = atlas.graph.nodes.get(kanjiNodeId('山'));
    expect(yama?.componentIds).toEqual(['kc:山']);
  });

  it('bounds a local neighbourhood rather than returning the corpus', () => {
    const atlas = mapAtlas();
    const origin = [...atlas.graph.nodes.keys()].find((id) => id.startsWith('lexeme:'));
    if (origin === undefined) throw new Error('no lexeme node');
    const neighbourhood = neighbourhoodOf(atlas.graph, origin);
    expect(neighbourhood.nodes.length).toBeLessThanOrEqual(120);
    expect(neighbourhood.nodes.length).toBeLessThan(atlas.graph.nodes.size);
  });

  it('an empty source still builds a graph rather than throwing', () => {
    const empty = buildMapAtlas([], []);
    expect(empty.graph.nodes.size).toBe(0);
    expect(buildKnowledgeGraph({ nodes: [], edges: [] }).nodes.size).toBe(0);
  });
});
