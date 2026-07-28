/**
 * The map is worth opening on day one, and it lies about nothing to be (Wave D).
 *
 * ## The defect
 *
 * A fresh browser opened `/map` and the largest sentence on the app's emotional
 * centre was *"0 of 0 contracts have evidence behind them."* Correct arithmetic,
 * and the first thing the operator would ever see.
 *
 * ## The two ways to fix it, one of which is forbidden
 *
 * Seeding a demo learner, or an "explore mode" with pretend marks, would fix the
 * screen and break the build's whole claim. So the fix has to come from the only
 * other source of real structure: **the language itself**, which is present
 * before any review and is not a claim about anybody.
 *
 * This file is the assertion that it stayed that way. Three properties:
 *
 *   1. the country is computed from the dictionary alone — its inputs cannot
 *      express a learner claim;
 *   2. the counts are the dictionary's real counts, not a floor or a rounding;
 *   3. the screen says on it, in words, which marks are the language and which
 *      are the learner.
 */

import { describe, expect, it } from 'vitest';

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRoutes } from '../src/ui/map/map-routes.ts';
import { mapAtlas } from '../src/ui/map/map-source.ts';
import {
  countLabel,
  eraCensus,
  resetEraCensus,
  territoryOf,
  LEARNER_RULE,
  NOTHING_BUILT_YET,
  TERRITORY_RULE,
} from '../src/ui/map/map-territory.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(resolve(APP_ROOT, file), 'utf8');
const SCREEN = read('src/screens/map-screen.tsx');

/**
 * The module's *code*, with its prose removed.
 *
 * The docblock names `AccumulationInput` and `Intl` precisely to say the module
 * does not use them, so a scan over the raw file would fail on the sentences
 * that promise the property. Comments are the argument; the code is the claim.
 */
const TERRITORY = read('src/ui/map/map-territory.ts')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the country is the language, and could not be anything else', () => {
  it('imports nothing that carries learner state', () => {
    // The strongest form of "this panel is not about you": the module cannot
    // reach a memory state, a gate decision, or a contract. A caption saying so
    // would be a promise; an import list saying so is a property.
    for (const forbidden of [
      'map-accumulation',
      'map-projection',
      'AccumulationInput',
      'memoryStates',
      'gateDecisions',
      'contracts',
      'lensView',
      'store.execute',
    ]) {
      expect(TERRITORY, `map-territory.ts reaches ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('counts the dictionary that actually shipped', () => {
    const atlas = mapAtlas();
    const territory = territoryOf(atlas, buildRoutes(atlas));

    // Non-vacuity first: a territory of zeros would satisfy every equality
    // below and would be exactly the empty screen this work is about.
    expect(territory.words).toBeGreaterThan(3000);
    expect(territory.kanji).toBeGreaterThan(1000);
    expect(territory.connections).toBeGreaterThan(1000);

    // …and the numbers are the atlas's own, not a re-derivation that could
    // drift from it.
    expect(territory.words).toBe(atlas.lexemes.size);
    expect(territory.kanji).toBe(atlas.kanji.size);
    expect(territory.nodes).toBe(atlas.graph.nodes.size);
    expect(territory.connections).toBe(atlas.graph.edgeCount);
  });

  it('sums the roads it names, and names every road it sums', () => {
    const atlas = mapAtlas();
    const routes = buildRoutes(atlas);
    const territory = territoryOf(atlas, routes);

    expect(territory.routes.map((route) => route.id)).toEqual(routes.map((route) => route.id));
    expect(territory.stations).toBe(
      routes.reduce((total, route) => total + route.stations.length, 0),
    );
    // Every road is finite and its length is a count of stations that exist —
    // the "this road has 53 stations" sentence the round-2 research names as the
    // answer to "it never ends".
    for (const summary of territory.routes) {
      expect(summary.stations).toBeGreaterThan(0);
    }
  });

  it('places every word in the corpus on exactly one era band', () => {
    resetEraCensus();
    const atlas = mapAtlas();
    const census = eraCensus(atlas);
    const placed = census.reduce((total, band) => total + band.nodes.length, 0);
    const lexemeNodes = [...atlas.graph.nodes.values()].filter((node) => node.kind === 'lexeme');
    expect(placed).toBe(lexemeNodes.length);
  });

  it('memoises the census, so returning to the front door costs nothing', () => {
    resetEraCensus();
    const atlas = mapAtlas();
    const first = eraCensus(atlas);
    const second = eraCensus(atlas);
    // Identity, not equality: a fresh array of the same numbers would mean the
    // whole-corpus walk ran again, which is the cost this memo exists to avoid.
    expect(second).toBe(first);
  });

  it('groups counts without asking the device what locale it is', () => {
    // `Intl` would render 18,129 on one phone and 18.129 on another from the
    // same build, and a screenshot would stop being reproducible.
    expect(countLabel(0)).toBe('0');
    expect(countLabel(77)).toBe('77');
    expect(countLabel(3016)).toBe('3,016');
    expect(countLabel(18129)).toBe('18,129');
    expect(TERRITORY).not.toContain('toLocaleString');
    expect(TERRITORY).not.toContain('Intl.');
  });
});

describe('the screen says which marks are the language and which are the learner', () => {
  it('renders both rules verbatim', () => {
    expect(SCREEN).toContain('TERRITORY_RULE');
    expect(SCREEN).toContain('LEARNER_RULE');
    expect(SCREEN).toContain('map-territory-rule');
    expect(SCREEN).toContain('map-learner-rule');
  });

  it('states the distinction in each rule rather than implying it by layout', () => {
    expect(TERRITORY_RULE).toMatch(/language’s own structure/);
    expect(TERRITORY_RULE).toMatch(/none of it is a claim about what you know/);
    expect(LEARNER_RULE).toMatch(/evidence gate/);
    expect(LEARNER_RULE).toMatch(/Nothing here is inferred/);
  });

  it('puts the country before the learner’s own marks', () => {
    // The ordering *is* the fix. A country panel below the fold would leave the
    // first sentence unchanged.
    const country = SCREEN.indexOf('testID="map-territory"');
    const learner = SCREEN.indexOf('testID="map-accumulation"');
    expect(country).toBeGreaterThan(-1);
    expect(learner).toBeGreaterThan(-1);
    expect(country).toBeLessThan(learner);
  });
});

describe('the first open is honest, and is not an empty state', () => {
  it('says what is true and what makes the first mark', () => {
    expect(NOTHING_BUILT_YET).toMatch(/not built anything here yet/);
    expect(NOTHING_BUILT_YET).toMatch(/none of it is yours/);
    expect(NOTHING_BUILT_YET).toMatch(/evidence gate admits a review/);
  });

  it('claims no progress, no level and no score', () => {
    for (const claim of [
      /\bmastery\b/i,
      /\bJLPT\b/i,
      /\bN[1-5]\b/,
      /\bstreak\b/i,
      /\bXP\b/,
      /\blevel\b/i,
      /\d+\s*%/,
    ]) {
      expect(NOTHING_BUILT_YET, String(claim)).not.toMatch(claim);
      expect(TERRITORY_RULE, String(claim)).not.toMatch(claim);
      expect(LEARNER_RULE, String(claim)).not.toMatch(claim);
    }
  });

  it('swaps the sentence on the count rather than hiding the panel', () => {
    // A screen that hid the learner panel until there was something in it would
    // be a different defect: the learner could not see that the layer exists.
    expect(SCREEN).toContain('accumulation.contractsStanding === 0');
    expect(SCREEN).toContain('NOTHING_BUILT_YET');
    expect(SCREEN).toContain('contracts have evidence behind them');
  });
});
