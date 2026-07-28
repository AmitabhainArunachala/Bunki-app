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
import { RECALL_BAND_THRESHOLDS, bandRank, hasReached } from '../src/ui/map/map-projection.ts';
import {
  MARKER_INTERVAL,
  ROUTE_GRADES,
  buildRoutes,
  routeMarkers,
  routePosition,
} from '../src/ui/map/map-routes.ts';
import { historyFrames, resolveScrubber, scrubberRange } from '../src/ui/map/map-scrubber.ts';
import { buildMapAtlas, kanjiNodeId, mapAtlas, normaliseReading } from '../src/ui/map/map-source.ts';
import { RECALL_BANDS } from '../src/ui/theme.ts';
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
  resolve(APP_ROOT, 'app/map.tsx'),
];

/* ------------------------------------------------------------------ *
 * A tiny hand-built atlas, so an extra edge cannot hide in 4,000 records
 * ------------------------------------------------------------------ */

const provenance = { source: 'test', license: null, retrieved_at: null, source_entry_id: null, notes: null };
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
  it('exposes no export that takes a whole node projection and returns a band', () => {
    const source = strip(read(resolve(APP_ROOT, 'src/ui/map/map-projection.ts')));
    // A signature over `NodeRetrievability` is the shape a collapse would take.
    expect(source).not.toMatch(/export function \w+\([^)]*NodeRetrievability/);
  });

  it('has no averaging, summing or percentage anywhere in the lane', () => {
    for (const file of LANE_FILES) {
      const source = strip(read(file));
      expect(source, relative(APP_ROOT, file)).not.toMatch(/\baverage\b|\bmastery\b/i);
      // A percent sign in a template literal would be a rendered percentage.
      expect(source, relative(APP_ROOT, file)).not.toMatch(/\$\{[^}]*\}\s*%/);
    }
  });

  it('bands come from two real numbers, and the thresholds are ordered', () => {
    const ranks = RECALL_BAND_THRESHOLDS.map((t) => bandRank(t.band));
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    for (const threshold of RECALL_BAND_THRESHOLDS) {
      expect(RECALL_BANDS).toContain(threshold.band);
    }
  });

  it('treats an unmeasured lens as unseen rather than as weak', () => {
    const unmeasured: MapLensView = {
      lens: 'reading',
      band: 'unseen',
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
    expect(hasReached(unmeasured, 'faint')).toBe(false);
    expect(hasReached({ ...unmeasured, band: 'durable' }, 'settled')).toBe(true);
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
    expect(routes.map((route) => route.id).sort()).toEqual(
      routes.map((route) => route.id).sort(),
    );
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
      band: 'durable',
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
    expect(all.sentence).toBe(`Station ${String(route.stations.length)} of ${String(route.stations.length)}`);

    // The same road, the same lens, after decay: the count falls.
    const faded = routePosition(route, 'reading', 'settled', () => ({ ...durable, band: 'faint' }));
    expect(faded.reached).toBe(0);
    expect(faded.nextStation?.ordinal).toBe(1);

    // A station with no projection is not reached — no evidence is not evidence.
    const none = routePosition(route, 'reading', 'settled', () => null);
    expect(none.reached).toBe(0);
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
    expect(resolveScrubber(0, [], now).otherDirection).toContain('none recorded yet');
  });

  it('ends its frame list exactly at the present', () => {
    expect(frames.at(-1)).toBe(now);
    expect(historyFrames('2020-01-01T00:00:00.000Z', now).at(-1)).toBe(now);
    // A very long history is capped in frames, not in reach.
    expect(historyFrames('2000-01-01T00:00:00.000Z', now).length).toBeLessThanOrEqual(480);
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
      expect(source, `${name} reaches the evidence gate`).not.toMatch(/admitToScheduler|evidenceGate/);
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

describe('the lane extends the built vocabulary rather than forking it', () => {
  it('writes no hex literal in any component', () => {
    for (const file of LANE_FILES) {
      expect(strip(read(file)), relative(APP_ROOT, file)).not.toMatch(/#[0-9a-fA-F]{6}\b/);
    }
  });

  it('draws its marks with the shared recall components', () => {
    const field = read(resolve(APP_ROOT, 'src/ui/map/map-field.tsx'));
    expect(field).toContain('RecallIndicator');
    const screen = read(resolve(APP_ROOT, 'src/screens/map-screen.tsx'));
    expect(screen).toContain('<LensRow');
    expect(screen).toContain('<SeedEntryDisclosure />');
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
