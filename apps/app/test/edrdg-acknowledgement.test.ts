/**
 * The acknowledgement obligation, checked per screen rather than per memory.
 *
 * ## The failure this exists to make impossible
 *
 * §3 of the EDRDG licence statement: *"If a WWW server is providing a dictionary
 * function or an on-screen display of words from the files, the acknowledgement
 * must be made on each screen display."* On **each** screen — not on the screens
 * a route list happened to name.
 *
 * Twice now the list has been the bug. `/` shipped rendering JMdict readings,
 * senses and parts of speech with no EDRDG string anywhere in the DOM, because
 * the disclosure was wired to the word and kanji pages and nobody re-derived
 * which surfaces display licensed words. It was fixed by adding one route to a
 * hand-written list — and `/canvas`, which renders the target's headword and
 * reading inside the passage, was still missing. A verifier drove the browser
 * and found it. A hand-written list of screens is exactly the artefact that goes
 * stale, so this file does not contain one.
 *
 * ## What it checks instead
 *
 * The obligation is derived from the *data*. `@bunki/seed` computes
 * {@link FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION} by walking its own records and
 * asking which fields carry a source whose licence demands on-screen
 * attribution. A field that changes provenance changes that list; a new licensed
 * field joins it automatically. This test then reads every screen module the
 * navigation map declares, follows its imports inside `apps/app`, and requires
 * the acknowledgement of any screen whose module graph touches one of those
 * fields.
 *
 * Transitive on purpose. `session-screen.tsx` renders `target.lexeme.headword`
 * through `session-loop.ts`; a check that only looked at the screen file could be
 * defeated — accidentally, which is how it happens — by moving one property read
 * into a helper.
 *
 * ## What it does not check
 *
 * That the notice is *visible* to a person. A component can be imported and
 * rendered into a branch nobody reaches. That claim needs a browser, and
 * `e2e/edrdg-acknowledgement.spec.ts` makes it by walking the loop and asserting
 * the acknowledgement is on screen at each stop. Neither test substitutes for
 * the other: this one cannot be fooled by a route nobody thought to add to a
 * list, and that one cannot be fooled by an import that renders nothing.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION, ON_SCREEN_ATTRIBUTION_SOURCES } from '@bunki/seed';

import { DESTINATIONS } from '../src/ui/navigation.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(file, 'utf8');

/** The JSX usage, not the declaration in `ui/notices.tsx`. */
const RENDERS_DISCLOSURE = /<SeedEntryDisclosure[\s/>]/;

/**
 * Reads of a licensed field, as they appear in source.
 *
 * Property access (`lexeme.senses`) and destructuring from a seed record are the
 * two shapes these values are consumed in. Matching the dot form catches the
 * first directly; the second is caught because a destructured value is read from
 * something that had to be reached by property access first, somewhere in the
 * same graph.
 *
 * Deliberately over-inclusive: `styles.reading` would match too. Erring toward
 * *requiring* an acknowledgement is the safe direction of a licence check — a
 * spurious requirement costs one line on a screen, and a missed one is a licence
 * breach shipped to a user.
 */
function licensedFieldReads(source: string): readonly string[] {
  const pattern = new RegExp(`\\.(${FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION.join('|')})\\b`, 'g');
  return [...new Set([...source.matchAll(pattern)].map((match) => match[1] as string))].sort();
}

/**
 * Resolve a relative import to a file inside `apps/app`.
 *
 * The codebase writes explicit extensions (`./session-loop.ts`), so this is
 * mostly identity; the fallbacks cover the `@/`-aliased and extensionless forms
 * the route files use.
 */
function resolveImport(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(APP_ROOT, 'src', specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      try {
        if (readFileSync(candidate).length >= 0) return candidate;
      } catch {
        /* a directory; try the next shape */
      }
    }
  }
  return null;
}

const IMPORT_PATTERN = /from\s+'([^']+)'/g;

/** Every module inside `apps/app` reachable from `entry`, including itself. */
function moduleGraph(entry: string): readonly string[] {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const match of read(file).matchAll(IMPORT_PATTERN)) {
      const next = resolveImport(file, match[1] as string);
      if (next !== null && !seen.has(next)) queue.push(next);
    }
  }
  return [...seen].sort();
}

interface ScreenAudit {
  readonly label: string;
  readonly screen: string;
  readonly fields: readonly string[];
  readonly acknowledges: boolean;
  readonly acknowledgedIn: readonly string[];
}

/**
 * The audit is over the whole module graph, in both directions.
 *
 * Field reads are counted anywhere the screen can reach, and the
 * acknowledgement is accepted from anywhere it can reach. Both halves are
 * deliberately generous, and the generosity points the same way: toward
 * *requiring* the notice.
 *
 * The alternative — reads counted only in the screen's own file — is the exact
 * hole this test was written to close. `session-screen.tsx` reaches the headword
 * through `session-loop.ts`; a per-file check could be defeated, accidentally,
 * by moving one property read into a helper. And a narrower rule needs an
 * exemption list, which is the artefact that went stale twice already.
 *
 * The cost is that every screen in this app owes an acknowledgement, including
 * *About & diagnostics*, whose observability records have had their
 * content-bearing fields stripped before they render. That turned out to be the
 * right answer rather than a false positive: §3 of the EDRDG statement has a
 * second clause asking for exactly such a screen, and it is now what carries it.
 */
const audits: readonly ScreenAudit[] = DESTINATIONS.map((destination) => {
  const entry = join(APP_ROOT, 'src', destination.screen);
  const graph = moduleGraph(entry);
  const fields = [...new Set(graph.flatMap((file) => licensedFieldReads(read(file))))].sort();
  const acknowledgedIn = graph.filter((file) => RENDERS_DISCLOSURE.test(read(file)));
  return {
    label: destination.label,
    screen: destination.screen,
    fields,
    acknowledges: acknowledgedIn.length > 0,
    acknowledgedIn,
  };
});

describe('the obligation is derived from the data, not from a list', () => {
  it('names the sources whose licence is not satisfied by a file', () => {
    // If this ever empties, every assertion below passes vacuously.
    expect(ON_SCREEN_ATTRIBUTION_SOURCES.length).toBeGreaterThan(0);
    expect(ON_SCREEN_ATTRIBUTION_SOURCES).toContain('JMdict (EDRDG)');
    expect(ON_SCREEN_ATTRIBUTION_SOURCES).toContain('KANJIDIC2 (EDRDG)');
  });

  it('derives the licensed fields from the seed records themselves', () => {
    expect(FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION.length).toBeGreaterThan(0);
    // The fields a screen displays as a dictionary entry.
    for (const field of ['senses', 'reading', 'partOfSpeech', 'onReadings', 'meanings']) {
      expect(FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION, field).toContain(field);
    }
    // …and not the ones this project wrote itself.
    expect(FIELDS_REQUIRING_ON_SCREEN_ATTRIBUTION).not.toContain('explanation');
  });

  it('audits every destination in the navigation map, so no screen is off the list', () => {
    expect(audits.length).toBe(DESTINATIONS.length);
    expect(audits.length).toBeGreaterThan(1);
  });
});

describe('every screen that displays licensed words acknowledges their source', () => {
  it.each(audits.filter((audit) => audit.fields.length > 0).map((audit) => audit.label))(
    '%s renders the acknowledgement',
    (label) => {
      const audit = audits.find((entry) => entry.label === label);
      expect(
        audit?.acknowledges,
        `${String(audit?.screen)} reads ${String(audit?.fields.join(', '))} — fields whose licence ` +
          'requires the acknowledgement on the screen that displays them (EDRDG statement §3) — ' +
          'but no module in its graph renders <SeedEntryDisclosure />.',
      ).toBe(true);
    },
  );

  it('finds licensed fields on more than one screen, so the suite is not vacuous', () => {
    const displaying = audits.filter((audit) => audit.fields.length > 0);
    expect(
      displaying.length,
      'no screen was found to display a licensed field, which means the scan stopped working',
    ).toBeGreaterThan(3);
  });

  it('exempts no screen, so there is no list for a surface to fall off', () => {
    // The two misses were both a screen missing from a list, not a screen
    // failing a rule. Having no exemptions is what makes that failure mode
    // unavailable: every destination is audited, and every audited destination
    // owes the acknowledgement.
    const exempt = audits.filter((audit) => audit.fields.length === 0).map((audit) => audit.label);
    expect(exempt).toEqual([]);
  });

  it('covers the two surfaces a verifier caught shipping without one', () => {
    // `/` and `/canvas`, by name. Both were found rendering JMdict fields with
    // no EDRDG string in the DOM, in two separate rounds, and both were missed
    // because the check was a list somebody maintained by hand.
    for (const label of ['Capture', 'Integration canvas']) {
      const audit = audits.find((entry) => entry.label === label);
      expect(audit?.fields.length, `${label} reads no licensed field`).toBeGreaterThan(0);
      expect(audit?.acknowledges, `${label} does not acknowledge`).toBe(true);
    }
  });
});

describe('the scan fails the thing it is supposed to fail', () => {
  // Without this, the predicate could be quietly loosened to something that
  // passes on any input and every assertion above would still be green.
  const OFFENDING_SCREEN = `
    export function BadScreen({ lexeme }) {
      return <ScreenShell title="Word">{lexeme.senses.join(' · ')}</ScreenShell>;
    }
  `;

  it('sees a licensed field read in a screen that renders no acknowledgement', () => {
    expect(licensedFieldReads(OFFENDING_SCREEN)).toContain('senses');
    expect(RENDERS_DISCLOSURE.test(OFFENDING_SCREEN)).toBe(false);
  });

  it('accepts the same screen once the acknowledgement is rendered', () => {
    const fixed = OFFENDING_SCREEN.replace('<ScreenShell', '<SeedEntryDisclosure /><ScreenShell');
    expect(licensedFieldReads(fixed)).toContain('senses');
    expect(RENDERS_DISCLOSURE.test(fixed)).toBe(true);
  });

  it('does not mistake the component declaration for a rendering of it', () => {
    // `ui/notices.tsx` declares `SeedEntryDisclosure` and renders nothing.
    // Matching the bare identifier would let every screen in the app pass by
    // transitively importing that module.
    const declaration = 'export function SeedEntryDisclosure({ testID }) { return null; }';
    expect(RENDERS_DISCLOSURE.test(declaration)).toBe(false);
  });
});
