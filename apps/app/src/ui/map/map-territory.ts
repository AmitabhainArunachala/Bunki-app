/**
 * The country, before anyone has walked it (Wave D).
 *
 * ## The problem this closes
 *
 * Open `/map` in a fresh browser and the first sentence used to be:
 *
 * > 0 of 0 contracts have evidence behind them.
 *
 * True, and the worst possible opening. The map is the app's home and the
 * emotional centre — the round-2 research's whole argument for it is that it is
 * *"the only surface that answers 'what have I built' rather than 'what do I
 * owe'"* — and on day one it answered "nothing", in the largest type on the
 * page, above an empty field.
 *
 * ## The fix is not to fake anything
 *
 * Nothing here may claim evidence that does not exist, and no progress may be
 * seeded. There is no need: **the language's own structure is real and needs no
 * learner history.** The era layers, the roads, the graph and its edges are all
 * there before a single review, and they are the thing a learner is looking at
 * when they look at a map. A map of a country you have not walked is still a map
 * of a country.
 *
 * So this module counts the territory, from the shipped dictionary, with no
 * reference to the ledger at all. Its inputs are the Atlas and the routes.
 * `AccumulationInput` is not one of them and cannot become one: this module
 * imports nothing from the domain's memory-state side, which is what makes
 * "these marks are the language, not you" a property rather than a caption.
 *
 * ## Which marks are which, said on screen
 *
 * The distinction has to be *stated*, not implied by layout, because the whole
 * risk of drawing a rich map on day one is that a learner reads the richness as
 * theirs. {@link TERRITORY_RULE} and {@link LEARNER_RULE} are the two sentences
 * the screen renders verbatim, and `test/map-modules.test.ts` asserts both are
 * on the surface.
 *
 * ## What it costs
 *
 * Everything except the era census is a read of a `Map`'s `size` or one pass
 * over the edge list. The era census is one pass over the lexeme nodes —
 * measured at 28 ms for 3,016 lexemes in `test/map-performance.test.ts` — and it
 * is memoised here at module scope, so the front door pays it once per session
 * rather than once per open. That measurement is what moved it out from behind
 * the "Count the whole dictionary" button: it was hidden because it was assumed
 * expensive, and it is not.
 */

import type { GraphNode } from '@bunki/domain';

import { placeNodes, type BandTally } from './map-eras.ts';
import type { Route } from './map-routes.ts';
import type { MapAtlas } from './map-source.ts';

/**
 * The sentence that says the territory is not a claim about the learner.
 *
 * Rendered verbatim. It is the load-bearing honesty of this whole panel: a map
 * that is beautiful on day one is a map that can be misread on day one.
 */
export const TERRITORY_RULE =
  'Everything in this panel is the language’s own structure, read from the dictionary this build ships. It is here before you have done anything, it does not change when you do, and none of it is a claim about what you know.';

/** Its opposite number, rendered on the learner's panel. */
export const LEARNER_RULE =
  'Everything in this panel is yours, and every mark in it was put there by the evidence gate admitting a review. Nothing here is inferred, estimated, or filled in on your behalf.';

/**
 * What the map says on a learner's first open, and why it is not an empty state.
 *
 * An `EmptyPanel` would be the wrong component: the screen is not empty, the
 * *learner's layer* of it is. Saying so plainly — and saying what puts the first
 * mark on it — is more useful than a shrug, and it is the one place the map can
 * name the act that starts the loop without pretending the act has happened.
 */
export const NOTHING_BUILT_YET =
  'You have not built anything here yet, and this is the true reading of that rather than a screen that failed to load. The country below is real and already drawn; none of it is yours. Your first mark appears when you take a word up for study and the evidence gate admits a review of it.';

export interface RouteSummary {
  readonly id: string;
  readonly name: string;
  readonly stations: number;
}

export interface Territory {
  /** Words the shipped dictionary holds. */
  readonly words: number;
  /** Characters it holds. */
  readonly kanji: number;
  /** Every node in the graph, of every kind. */
  readonly nodes: number;
  /**
   * Edges the domain holds — never a count of edges *drawn*.
   *
   * The two differ and the difference is honest: a field draws only the edges
   * between the nodes it drew. Stating the held count here and the drawn count
   * under the field is what keeps "every edge drawn is an edge the domain holds"
   * from quietly becoming "every edge the domain holds is drawn".
   */
  readonly connections: number;
  /** The named, finite roads, with their real lengths. */
  readonly routes: readonly RouteSummary[];
  /** Stations across all roads — a sum of lengths, not of anything about you. */
  readonly stations: number;
}

/**
 * Count the country.
 *
 * Pure, cheap, and takes exactly what it reads. No ledger, no instant, no lens:
 * a signature that could not express a learner claim if the body tried.
 */
export function territoryOf(atlas: MapAtlas, routes: readonly Route[]): Territory {
  let stations = 0;
  const summaries: RouteSummary[] = [];
  for (const route of routes) {
    stations += route.stations.length;
    summaries.push({ id: route.id, name: route.name, stations: route.stations.length });
  }

  return {
    words: atlas.lexemes.size,
    kanji: atlas.kanji.size,
    nodes: atlas.graph.nodes.size,
    connections: atlas.graph.edgeCount,
    routes: summaries,
    stations,
  };
}

/**
 * The era census over the whole corpus, memoised for the session.
 *
 * Module-level rather than a `useMemo`, for the same reason `mapAtlas()` is:
 * the map is the front door and a learner returns to it, so the cost has to be
 * once per session rather than once per mount. `resetEraCensus` exists for the
 * tests, which need a cold measurement.
 */
let censusCache: { atlas: MapAtlas; tallies: readonly BandTally[] } | null = null;

export function eraCensus(atlas: MapAtlas): readonly BandTally[] {
  if (censusCache !== null && censusCache.atlas === atlas) return censusCache.tallies;
  const lexemes: GraphNode[] = [];
  atlas.graph.nodes.forEach((node) => {
    if (node.kind === 'lexeme') lexemes.push(node);
  });
  const tallies = placeNodes(atlas, lexemes);
  censusCache = { atlas, tallies };
  return tallies;
}

/** Drop the memo. For tests that measure a cold census. */
export function resetEraCensus(): void {
  censusCache = null;
}

/**
 * A count, grouped in threes.
 *
 * Hand-written rather than `Intl.NumberFormat`, and that is a decision: `Intl`
 * would group by the *device's* locale, so the same build would render 18,129
 * on one phone and 18.129 on another, and a screenshot would stop being
 * reproducible. Every number this app renders is a count of records, not a
 * quantity in a currency — so one grouping, chosen and stated, is more honest
 * than a locale-sensitive one nobody asked for.
 */
export function countLabel(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
