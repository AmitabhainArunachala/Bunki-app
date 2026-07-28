/**
 * Which era layer each drawn node sits on (Campaign E / B1).
 *
 * ## The layers are three, and two of them are empty
 *
 * The map has three era grounds — 古道, 街道, 鉄道 — and a fourth state that is
 * not a ground at all. Lane A2′ measured what the shipped dictionary can
 * actually place and the answer is in `docs/build-evidence/era-coverage/`:
 *
 * > 9.8% of the 3,000-lexeme dictionary tier can be placed on an era layer. All
 * > 295 of them land on 古道 `kodo`, all by one rule. **街道 `kaido` and 鉄道
 * > `tetsudo` cannot be populated from this data at all** — 0 lexemes each, and
 * > not because the rules missed: because no rule for them exists that would not
 * > be a guess.
 *
 * So this surface will draw a 街道 layer with nothing on it and a 鉄道 layer
 * with nothing on it, and it will say so on screen in those words. That is the
 * design working, not the design failing. The alternative — spreading nodes
 * across three layers so each one looks inhabited — is precisely the guessed era
 * the whole era module exists to refuse, and it would be undetectable in a
 * screenshot, which is what makes it worth being explicit about here.
 *
 * ## Unknown is a place, not a fallback
 *
 * `EraPlacement` includes `unknown` as a member of the union rather than as
 * `EraLayer | null`, and the domain says why: *"a nullable layer invites `??
 * 'kodo'`, and a default layer is exactly the invented confidence this file
 * exists to refuse."* This module honours that by giving `unknown` **its own
 * band on the map**, with its own heading and its own count, drawn on no era
 * ground at all. A node whose era we do not know is not quietly dropped and is
 * not quietly placed; it is shown, in the largest group, under a label that says
 * we do not know when it entered the language.
 *
 * Every attribution keeps the `EraBasis` and the one-sentence `detail` the
 * domain produced, so a learner tapping "why is this here?" gets the kernel's
 * own words rather than a re-explanation this file invented.
 *
 * ## Nothing here is about the learner
 *
 * An era is a property of the language. `packages/domain/src/graph/era.ts` is
 * explicit that nothing in it reads a memory state, and neither does this: the
 * ground carries *when and where*, never *how well you know it*. That separation
 * is the whole reconciliation with the frozen §8 one-accent rule
 * (`BUNKI_VISUAL_LANGUAGE_NIHONGA` §5), and it is why era and retrievability are
 * two files here as well as two layers on screen.
 */

import {
  attributeNodeEra,
  ERA_LAYERS,
  type EraAttribution,
  type EraLayer,
  type EraPlacement,
  type GraphNode,
} from '@bunki/domain';
import { ERA_REGISTERS, type EraKey } from '../theme.ts';

import type { MapAtlas } from './map-source.ts';

/**
 * The four bands the map lays out, in the order it stacks them.
 *
 * Oldest road at the top, newest below it, and `unknown` last — which is also
 * the order of decreasing confidence, so the reader walks from what we can say
 * to what we cannot.
 */
export const MAP_BANDS = [...ERA_LAYERS, 'unknown'] as const;
export type MapBand = (typeof MAP_BANDS)[number];

/**
 * The domain's `EraLayer` and the theme's `EraKey` are the same three strings.
 *
 * They are declared in two packages because neither may depend on the other —
 * the domain must not know about a palette and the theme must not know about a
 * dictionary. This function is the seam, and it is a `satisfies`-checked
 * identity rather than a cast so that a rename on either side becomes a type
 * error here instead of a layer silently rendering in the wrong register.
 */
export function eraKeyOf(layer: EraLayer): EraKey {
  const table = { kodo: 'kodo', kaido: 'kaido', tetsudo: 'tetsudo' } satisfies Record<
    EraLayer,
    EraKey
  >;
  return table[layer];
}

/** What a band is called on screen, and what it is. */
export interface BandLabel {
  readonly band: MapBand;
  /** 古道 — how it is written. `null` for the unknown band, which is not a road. */
  readonly written: string | null;
  readonly title: string;
  readonly blurb: string;
}

/**
 * The headings, taken from the ground layer where there is one.
 *
 * The three era rows read their words out of `ERA_REGISTERS` rather than
 * repeating them, so the map cannot describe 街道 differently from the design
 * specimen. The unknown row has no register to read from and its wording is
 * this lane's, which is why it is the only entry written out here.
 */
export const BAND_LABELS: readonly BandLabel[] = MAP_BANDS.map((band) => {
  if (band === 'unknown') {
    return {
      band,
      written: null,
      title: 'Era not known',
      blurb:
        'These words are on no layer because the dictionary carries nothing that dates them. This is “we do not know”, not “modern”.',
    };
  }
  const register = ERA_REGISTERS[eraKeyOf(band)];
  return {
    band,
    written: register.written,
    title: `${register.written} — ${register.gloss}`,
    blurb: `${register.period}. ${register.stratum}`,
  };
});

/** One node, placed. */
export interface PlacedNode {
  readonly node: GraphNode;
  readonly attribution: EraAttribution;
  readonly band: MapBand;
}

/**
 * How a band came out over the nodes actually drawn.
 *
 * `count` is over *this view*, not over the corpus. A band that is empty here
 * may be populated elsewhere, and a band that is empty everywhere — which is the
 * real situation for 街道 and 鉄道 — is empty for a reason the surface states
 * separately. Conflating "nothing near you" with "nothing anywhere" would be its
 * own small dishonesty.
 */
export interface BandTally {
  readonly band: MapBand;
  readonly label: BandLabel;
  readonly nodes: readonly PlacedNode[];
}

/**
 * Place a set of nodes, in the order given, into the four bands.
 *
 * Over the drawn nodes only — never over the corpus. A local neighbourhood is at
 * most a few dozen nodes, so this is the per-view cost and it is linear in what
 * is on screen, which is the discipline the whole lane is held to.
 */
export function placeNodes(atlas: MapAtlas, nodes: readonly GraphNode[]): readonly BandTally[] {
  const byBand = new Map<MapBand, PlacedNode[]>(MAP_BANDS.map((band) => [band, []]));

  for (const node of nodes) {
    const attribution = attributeNodeEra(node, atlas.eraSources.get(node.id));
    const band = bandOf(attribution.placement);
    byBand.get(band)?.push({ node, attribution, band });
  }

  return BAND_LABELS.map((label) => ({
    band: label.band,
    label,
    nodes: byBand.get(label.band) ?? [],
  }));
}

/**
 * The band a placement renders in.
 *
 * A total function over the union rather than a lookup with a fallback: adding a
 * fourth `EraPlacement` in the domain should be a type error here, not a node
 * silently landing in `unknown`.
 */
export function bandOf(placement: EraPlacement): MapBand {
  return placement;
}

/**
 * What the corpus can support, stated on screen rather than in a document.
 *
 * This sentence is the finding of lane A2′ and it is rendered by the map's
 * legend. It is kept here, beside the code that lays out the empty layers, so
 * that the day a rule for 街道 exists the claim and the behaviour change
 * together.
 */
export const ERA_COVERAGE_DISCLOSURE =
  'Only one rule places anything: a single native (訓) morpheme is 和語, the oldest stratum, so it sits on 古道. Nothing in this dictionary dates a 漢語 word, so 街道 and 鉄道 have no members and every other word is “era not known”. A layer is never guessed.';
