/**
 * Routes — a named, ordered, finite sequence, and a position that is a count
 * (Campaign E / B1).
 *
 * ## The sentence this file exists to make true
 *
 * The round-2 research names one defect behind three complaints. In Anki the
 * only visible quantity is the queue; the queue is unbounded, regenerates, and
 * empties daily, so *"you see the bill, you never see the house"*, and
 * "it never ends" and "hard to sense progress" turn out to be the same thing.
 *
 * The historical roads answer it because they are **finite, named, ordered and
 * marked at intervals**: the Tōkaidō has 53 post stations, the Nakasendō 69, the
 * Shikoku pilgrimage 88 temples, and a 一里塚 stood every *ri* so a traveller
 * always knew how far they had come. *"This road has 53 stations and you are at
 * the 11th"* is a sentence no app in the operator's list can say.
 *
 * ## What a route is here, and what it deliberately is not
 *
 * **It is not geography, and it must not pretend to be.** Shipping a list of
 * real Tōkaidō place names and mapping memory onto them would assert a
 * correspondence between a historical road and a learner's recall that nothing
 * supports — the same defect class as a guessed era. What the roads give us is
 * the *shape*, and the shape is the whole borrowing.
 *
 * So a route is: **a named, ordered, finite sequence of learning targets drawn
 * from data we actually hold.** Its length is a real count. Its name says what
 * the sequence *is* rather than borrowing a place name.
 *
 * ## The one rule that builds one, stated exactly
 *
 * > A route is the set of kanji **this build's dictionary holds** for one 常用漢字
 * > school grade, ordered by KANJIDIC2's own newspaper-frequency rank ascending,
 * > with unranked characters last in codepoint order.
 *
 * Both fields are real KANJIDIC2 columns carried through the importer
 * (`ImportedExtras.grade`, `ImportedExtras.frequency`). Neither is computed,
 * inferred or scored by this project. The order is total and deterministic —
 * frequency, then codepoint — so the same build always produces the same
 * sequence, and a station's ordinal is a fact about the data rather than about
 * when it happened to be indexed.
 *
 * ## "This build's dictionary holds" is doing real work in that sentence
 *
 * The rule used to read *"every kanji KANJIDIC2 assigns to this school grade"*
 * and end *"nothing is sampled"*. Both halves were wrong together, and the
 * combination was worse than either: the kanji tier says of itself
 *
 * > Imported KANJIDIC2 characters, **limited to those the imported lexemes
 * > actually use.**
 *
 * so the tier *is* a sample of KANJIDIC2, and grade 1 ships 77 characters where
 * the grade has 80 — 貝, 糸 and 田 are in the grade and not in this build. A
 * learner who reached all 77 and read that rule would believe they had finished
 * grade 1 without ever having met three of its characters.
 *
 * That is load-bearing rather than pedantic, because the whole point of a route
 * is the sentence *"this road has 53 stations and you are at the 11th"* — a
 * claim of **completeness over a named set**. A road that is quietly missing
 * stations is the one defect that destroys the claim while looking identical.
 *
 * So {@link ROUTE_SUBSET_NOTE} states the subset in the dictionary's own words,
 * it is part of every route's printed rule, and the surface renders it. The
 * number of characters the grade has upstream is deliberately **not** asserted:
 * the raw KANJIDIC2 is not committed (it is a ~200 MB gitignored download,
 * `packages/seed/data/dictionary/manifest.json`), so this build cannot count it,
 * and hard-coding a total from memory would be the unsourced claim the lane
 * refuses everywhere else. What it can say, and now does, is that its own count
 * is a count of *its own* entries and is not the grade.
 *
 * **Why grade and not something else.** It is the only field in the tier that is
 * simultaneously (a) a real published grouping, (b) exhaustive over the
 * characters it covers, and (c) *ordered* by an equally real second field. JLPT
 * level would give bands but the frozen spec forbids a JLPT claim; a stroke-count
 * band would be arbitrary; "the kanji in a passage" would be a route of four.
 *
 * **Only grades 1–6 become routes.** KANJIDIC2 uses grade 8 for the secondary-
 * school 常用 remainder and 9/10 for 人名用 name characters. Those are real
 * groupings, but "Grade 8" is not a school year and calling it one would be a
 * small lie in the route's own name, so they are excluded and
 * {@link ROUTE_EXCLUSION_NOTE} says why on screen.
 *
 * ## Position is a count, on a named lens, at a stated band
 *
 * `11 of 160 stations reached` is *not* an ordinal walk along the sequence and
 * *not* a percentage. It is: **how many members of this sequence have reached a
 * stated band on one named capability lens.** Three properties make it honest:
 *
 *   - It is a count of real things, from real FSRS, per contract.
 *   - It is **never averaged across capabilities** — a route position exists for
 *     `reading`, and a different one for `production`, and there is no third
 *     number over both. {@link routePosition} requires a lens argument and there
 *     is no overload without one.
 *   - It can go **down**. Retrievability decays, so a station that was reached
 *     can stop being reached. That is the honest version of the research's
 *     "decay is real and visible" pressure: the thing you are losing is a thing
 *     you actually had.
 *
 * ## 一里塚
 *
 * A distance marker marks a real interval of the real sequence — every tenth
 * station of *this* list — and never a fraction of a bar. {@link routeMarkers}
 * emits them from the length, so a 160-station route has sixteen and a
 * 20-station route has two.
 *
 * A marker is drawn *passed* when **the station standing at that ordinal has
 * itself been reached** — {@link RoutePosition.reachedOrdinals} — and never when
 * the running count happens to have got that high. Filling the first `reached`
 * markers left to right is the discrete form of the percentage bar this file
 * refuses: it reads as an ordinal walk, and reach is not a prefix. Frequency
 * order has nothing to do with which characters a learner captured, so a count
 * of five with the reached stations at ordinals 3, 17, 40, 55 and 70 is the
 * normal case, not an edge one. Under the old rule it lit no marker at all
 * while the sentence beside it said "Station 5".
 *
 * ## No score anywhere
 *
 * There is no route completion percentage, no total across routes, and no
 * ranking of routes by how far along they are. Each route reports one count and
 * one length for one lens. Adding a "42% complete" here would reintroduce the
 * global scalar REQ-LM-03 forbids through the one door the map left open.
 */

import type { GraphNodeId } from '@bunki/domain';

import type { CapabilityId } from '../capability.ts';
import type { StandaloneRecallBand } from '../theme.ts';
import { hasReached, type MapLensView } from './map-projection.ts';
import { kanjiNodeId, type MapAtlas } from './map-source.ts';
import { importedExtras } from '../../data/catalog.ts';

/* ------------------------------------------------------------------ *
 * Shape
 * ------------------------------------------------------------------ */

/** One member of a route, at its place in the sequence. */
export interface RouteStation {
  /** 1-based place in this sequence. A count of positions, not a score. */
  readonly ordinal: number;
  readonly nodeId: GraphNodeId;
  readonly character: string;
  /** The KANJIDIC2 frequency rank that ordered it, or `null` when unranked. */
  readonly frequency: number | null;
}

export interface Route {
  readonly id: string;
  /** "Grade 2 kanji". Says what the sequence is; borrows no place name. */
  readonly name: string;
  /** The sequence. Finite, ordered, and its length is the real count. */
  readonly stations: readonly RouteStation[];
  /** The rule that produced it, for the surface to print verbatim. */
  readonly rule: string;
}

/**
 * The grades that become routes, and the interval a 一里塚 marks.
 *
 * `MARKER_INTERVAL` is 10 rather than a *ri* converted into stations, because a
 * *ri* is a distance and a station is not. Borrowing the *shape* — a marker at a
 * fixed real interval, so you always know how far you have come — is the whole
 * borrowing; converting 3.927 km into a number of kanji would be the invented
 * correspondence this file refuses.
 */
export const ROUTE_GRADES: readonly number[] = Object.freeze([1, 2, 3, 4, 5, 6]);
export const MARKER_INTERVAL = 10;

export const ROUTE_EXCLUSION_NOTE =
  'Only the six 常用漢字 school grades become routes. KANJIDIC2 also uses grade 8 for the secondary-school remainder and 9–10 for name characters; those are real groupings but not school years, so naming a route after one would be a claim the data does not make.';

/**
 * The subset, in the shipped dictionary's own words, rendered on screen.
 *
 * Quoted from `packages/seed/data/dictionary/kanji.json`'s `_comment` rather
 * than paraphrased, so the claim and the data cannot drift: the day the importer
 * stops limiting the tier, that sentence changes and this one has to change with
 * it. `test/map-modules.test.ts` asserts the quote is still the tier's own.
 */
export const ROUTE_SUBSET_NOTE =
  'This road is as long as this build’s dictionary, which is not as long as the grade. The kanji tier imports “KANJIDIC2 characters, limited to those the imported lexemes actually use”, so a grade’s road here is missing the characters no imported word happens to contain — grade 1 ships 77 of the grade’s characters. Reaching the last station on this road is finishing this road, not finishing the grade.';

const ROUTE_RULE =
  'Every kanji this build’s dictionary holds for this school grade, in KANJIDIC2’s own newspaper-frequency order, unranked characters last. Nothing is scored or ranked by this app, and the order is KANJIDIC2’s — but the set is a subset, and the length is a count of this build’s entries rather than of the grade.';

/* ------------------------------------------------------------------ *
 * Building
 * ------------------------------------------------------------------ */

/**
 * The routes this build can state, in grade order.
 *
 * Built from the atlas's own kanji index, so a route can only ever contain a
 * character the map can actually draw and open. A grade with no members yields
 * no route rather than an empty one: a road with no stations is not a road, and
 * showing one would be the "dead list inbox" the frozen spec rejects (§10.1).
 */
export function buildRoutes(atlas: MapAtlas): readonly Route[] {
  const byGrade = new Map<number, { character: string; frequency: number | null }[]>();

  atlas.kanji.forEach((record, character) => {
    const extras = importedExtras(record.id);
    // A fixture-tier character carries no `grade`; it is absent from every
    // route rather than being assigned one. An unknown grade is not grade 1.
    if (extras === null || extras.grade === null) return;
    if (!ROUTE_GRADES.includes(extras.grade)) return;
    const bucket = byGrade.get(extras.grade);
    const entry = { character, frequency: extras.frequency };
    if (bucket === undefined) byGrade.set(extras.grade, [entry]);
    else bucket.push(entry);
  });

  const routes: Route[] = [];
  for (const grade of ROUTE_GRADES) {
    const members = byGrade.get(grade);
    if (members === undefined || members.length === 0) continue;

    members.sort((left, right) => {
      // Unranked last, rather than sorted as if rank 0 — the most common
      // character in the language would otherwise be whichever one KANJIDIC2
      // happened not to rank.
      const leftRank = left.frequency ?? Number.POSITIVE_INFINITY;
      const rightRank = right.frequency ?? Number.POSITIVE_INFINITY;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.character < right.character ? -1 : left.character > right.character ? 1 : 0;
    });

    routes.push({
      id: `grade-${String(grade)}`,
      name: `Grade ${String(grade)} kanji`,
      rule: ROUTE_RULE,
      stations: members.map((member, index) => ({
        ordinal: index + 1,
        nodeId: kanjiNodeId(member.character),
        character: member.character,
        frequency: member.frequency,
      })),
    });
  }
  return routes;
}

/* ------------------------------------------------------------------ *
 * Position
 * ------------------------------------------------------------------ */

/**
 * Where the learner stands on one route, on one lens.
 *
 * `reached` is the count and `length` is the road. There is no third field
 * dividing them, and there is no field summarising several routes, because
 * either would be the mastery percentage the whole build refuses.
 */
export interface RoutePosition {
  readonly route: Route;
  readonly lens: CapabilityId;
  readonly atLeast: StandaloneRecallBand;
  readonly reached: number;
  readonly length: number;
  /**
   * The ordinals of the stations that are reached.
   *
   * `reached` is `reachedOrdinals.size` and nothing else — the count is derived
   * from the membership rather than the membership guessed from the count. This
   * exists because a surface that wants to draw *which* stations are behind the
   * learner cannot get that from a count, and the version that tried — filling
   * the first `reached` markers — silently asserted that reach is a prefix of
   * the sequence. It is not: frequency order is unrelated to what a learner
   * captured.
   */
  readonly reachedOrdinals: ReadonlySet<number>;
  /** The next station not yet reached, so the road ahead has a first step. */
  readonly nextStation: RouteStation | null;
  /**
   * "11 of 160 stations reached" — the sentence, formed once, rendered verbatim.
   *
   * A count in the subject position, never `Station 11 of 160`, which reads as
   * an ordinal and would then contradict the line beneath it: a learner with
   * five scattered stations reached had "Station 5 of 77" printed above
   * "Next unreached: 日 (station 1)", which is two different meanings of
   * *station* four lines apart, one of them false.
   */
  readonly sentence: string;
}

/**
 * Count how far along a route the learner is, for one named lens.
 *
 * `lensOf` is a lookup the caller supplies — the map already holds projections
 * for the nodes it drew, and re-projecting here would make a route strip cost a
 * whole-corpus pass. A station whose node has no projection counts as not
 * reached, which is correct: no evidence is not evidence.
 *
 * Linear in the route's length and nothing else. A 160-station route is 160 map
 * lookups, once, not once per frame.
 */
export function routePosition(
  route: Route,
  lens: CapabilityId,
  atLeast: StandaloneRecallBand,
  lensOf: (nodeId: GraphNodeId, lens: CapabilityId) => MapLensView | null,
): RoutePosition {
  const reachedOrdinals = new Set<number>();
  let nextStation: RouteStation | null = null;

  for (const station of route.stations) {
    const projection = lensOf(station.nodeId, lens);
    if (projection !== null && hasReached(projection, atLeast)) {
      reachedOrdinals.add(station.ordinal);
      continue;
    }
    nextStation ??= station;
  }

  return {
    route,
    lens,
    atLeast,
    // Derived from the membership, so the count and the marks a surface draws
    // are the same fact read two ways rather than two facts that can disagree.
    reached: reachedOrdinals.size,
    length: route.stations.length,
    reachedOrdinals,
    nextStation,
    sentence: `${String(reachedOrdinals.size)} of ${String(route.stations.length)} stations reached`,
  };
}

/**
 * The 一里塚 of a route: the ordinals a distance marker stands at.
 *
 * Real intervals of the real sequence. The last station is included when it is
 * not already a multiple, so the end of the road is always marked — a traveller
 * who cannot see the final marker cannot see that the road ends, which is the
 * one thing this whole mechanism is for.
 */
export function routeMarkers(route: Route, interval: number = MARKER_INTERVAL): readonly number[] {
  const length = route.stations.length;
  if (length === 0 || interval <= 0) return [];
  const markers: number[] = [];
  for (let ordinal = interval; ordinal <= length; ordinal += interval) markers.push(ordinal);
  if (markers[markers.length - 1] !== length) markers.push(length);
  return markers;
}
