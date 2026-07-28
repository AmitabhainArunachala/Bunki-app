/**
 * Reachability (WP-10).
 *
 * Two verifier passes recorded the same P2: screens existed that no running app
 * could reach. The definition-of-done calls that "tests pass but the app
 * doesn't" and makes it a failure of done rather than a nuance, and it blocks
 * T-17 — an automated loop can only walk paths a person could walk.
 *
 * This file is the assertion that the app has doors. It reads `src/ui/navigation.ts`
 * as the map and checks it against the filesystem and against the source of the
 * screens the map says do the linking, so three separate lies are catchable:
 *
 *   - a route file that exists but is in no one's map (a page with no door);
 *   - a map entry whose route file does not exist (a door onto nothing);
 *   - a map entry claiming a parent screen links to it when that screen does
 *     not (a door drawn on the wall).
 *
 * It is deliberately source-scanning rather than rendering. The project installs
 * no React Native test renderer, and a scan proves a link exists in the tree,
 * which is the property at issue. The E2E suite walks the same paths in a real
 * browser; neither substitutes for the other.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ACTION_DESTINATIONS,
  DESTINATIONS,
  EMBEDDED_SURFACES,
  LEARNER_DESTINATIONS,
  NESTED_DESTINATIONS,
  PRESENCE_DESTINATIONS,
  SHELL_DESTINATIONS,
  SPECIMEN_DESTINATIONS,
} from '../src/ui/navigation.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTES_ROOT = resolve(APP_ROOT, 'app');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');

/**
 * Route files, relative to `apps/app/app/`.
 *
 * Two kinds of file live in `app/` without being routes, and both are excluded
 * by name rather than by a pattern loose enough to hide a real screen:
 *
 *   - `_layout.tsx` — expo-router layouts. They wrap routes; they are not
 *     destinations and have no href.
 *   - `+html.tsx` — the static-export HTML shell (the `+` prefix is
 *     expo-router's own marker for a file that is not a route). It renders
 *     `<html>`, not a screen, and exists only to carry the export's `<head>`.
 *
 * Anything else new in `app/` must appear in `DESTINATIONS`, which is the point
 * of this test: a screen with no door fails here rather than in someone's hands.
 */
const routeFiles = walk(ROUTES_ROOT)
  .map((file) => relative(ROUTES_ROOT, file))
  .filter((file) => !file.endsWith('_layout.tsx') && !file.endsWith('+html.tsx'))
  .sort();

describe('every route is on the map', () => {
  it('maps every route file, with none left over', () => {
    expect(routeFiles).toEqual(DESTINATIONS.map((d) => d.routeFile).sort());
  });

  it('points every map entry at a route file that exists', () => {
    for (const destination of DESTINATIONS) {
      expect(routeFiles, `${destination.href} has no route file`).toContain(destination.routeFile);
    }
  });

  it('renders the screen each entry names', () => {
    for (const destination of DESTINATIONS) {
      const source = read(resolve(ROUTES_ROOT, destination.routeFile));
      // The component name is derived from the module's *basename*. It used to
      // be derived from the path with a `screens/` prefix stripped, which was
      // the same thing while every screen lived in `src/screens/` and silently
      // wrong the moment one did not — `ui/style-guide/style-guide-page.tsx`
      // would have produced `Ui/styleGuide/styleGuidePage`. Same assertion,
      // stated in terms of what it was always checking.
      const component = (destination.screen.split('/').pop() ?? '')
        .replace(/\.tsx?$/, '')
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      expect(source, `${destination.routeFile} does not render ${component}`).toContain(component);
    }
  });

  it('points every map entry at a screen module that exists', () => {
    for (const destination of DESTINATIONS) {
      const module = resolve(APP_ROOT, 'src', destination.screen);
      expect(existsSync(module), `${destination.href} names a missing module`).toBe(true);
    }
  });
});

describe('every destination has a door a learner can open', () => {
  it('offers the shell destinations in the navigation shell', () => {
    const shell = read(resolve(APP_ROOT, 'src/ui/nav-shell.tsx'));
    // The shell renders from the same constant, so this is a check that it uses
    // the map rather than a hand-written copy of it.
    expect(shell).toContain('SHELL_DESTINATIONS');
    expect(SHELL_DESTINATIONS.length).toBeGreaterThan(0);
  });

  /**
   * Actions and presences are carried by the shell itself — `navigation.ts` §2
   * and §4.
   *
   * Both are reachable from every surface *because the shell holds them*, so the
   * check is against `nav-shell.tsx` rather than against a screen. A `via` that
   * named a control the shell does not render would be a door drawn on the wall,
   * which is the same failure the `from` kind guards against one level down.
   */
  it('carries every action and presence in the shell, on every surface', () => {
    const shell = read(resolve(APP_ROOT, 'src/ui/nav-shell.tsx'));
    expect(ACTION_DESTINATIONS.length + PRESENCE_DESTINATIONS.length).toBeGreaterThan(0);
    for (const destination of [...ACTION_DESTINATIONS, ...PRESENCE_DESTINATIONS]) {
      const reach = destination.reach;
      if (reach.kind !== 'action' && reach.kind !== 'presence') continue;
      expect(shell, `the shell does not render ${reach.via}`).toContain(reach.via);
      const staticPrefix = destination.href.split('/[')[0] ?? destination.href;
      expect(shell, `the shell never navigates to ${staticPrefix}`).toContain(staticPrefix);
    }
  });

  /**
   * Capture returns the learner where they were — `navigation.ts` §2.
   *
   * "An action, not a destination" is only true if leaving it is not a new
   * place. The shell records the surface in `?from=` and the route hands it to
   * the screen; without both halves the claim in the module header is prose.
   * The browser half — that the round trip actually lands back on the surface —
   * is `e2e/cross-surface-trace.spec.ts`.
   */
  it('gives the capture action a way back to the surface it was opened from', () => {
    const shell = read(resolve(APP_ROOT, 'src/ui/nav-shell.tsx'));
    expect(shell, 'the capture action records no origin').toContain('from=');
    const route = read(resolve(ROUTES_ROOT, 'capture.tsx'));
    expect(route).toContain('onDone');
    expect(route).toContain('returnTo');
    const screen = read(resolve(APP_ROOT, 'src/screens/capture-screen.tsx'));
    expect(screen, 'the capture screen offers no way back').toContain('capture-done');
  });

  it('mounts the shell above every route', () => {
    const layout = read(resolve(ROUTES_ROOT, '_layout.tsx'));
    expect(layout).toContain('NavShell');
  });

  it('links to each nested destination from the screen that claims to', () => {
    for (const destination of NESTED_DESTINATIONS) {
      const reach = destination.reach;
      if (reach.kind !== 'from') continue;
      const parent = read(resolve(APP_ROOT, reach.from));
      expect(parent, `${reach.from} does not offer ${destination.href} via ${reach.via}`).toContain(
        reach.via,
      );
    }
  });

  /**
   * The parent's link has to be wired at the route, not only accepted as a prop.
   *
   * A screen that takes `onOpenCanvas` and a route that never passes it is the
   * exact shape of the defect this wave is closing: the callback exists, the
   * test that looks only at the screen passes, and the button does nothing.
   */
  it('wires each nested destination at the route that renders its parent', () => {
    for (const destination of NESTED_DESTINATIONS) {
      const reach = destination.reach;
      if (reach.kind !== 'from') continue;
      const parentScreen = reach.from.replace(/^src\//, '');
      const parentDestination = DESTINATIONS.find((d) => d.screen === parentScreen);
      expect(parentDestination, `no route renders ${reach.from}`).toBeDefined();
      if (parentDestination === undefined) continue;

      const routeSource = read(resolve(ROUTES_ROOT, parentDestination.routeFile));
      expect(
        routeSource,
        `${parentDestination.routeFile} renders the parent but never passes ${reach.via}`,
      ).toContain(reach.via);
      // The href itself, so a route that passes the prop with a wrong target
      // fails too. Dynamic segments are checked by their static prefix.
      const staticPrefix = destination.href.split('/[')[0] ?? destination.href;
      const message = `${parentDestination.routeFile} does not navigate to ${staticPrefix}`;
      expect(routeSource, message).toContain(staticPrefix);
    }
  });

  it('mounts every embedded surface in the screen that hosts it', () => {
    for (const surface of EMBEDDED_SURFACES) {
      const host = read(resolve(APP_ROOT, surface.mountedIn));
      expect(host, `${surface.name} is not mounted in ${surface.mountedIn}`).toContain(surface.via);
    }
  });
});

describe('the map describes the app it is in', () => {
  /**
   * The eight screens controller §10 names, in the order the loop is walked.
   *
   * Not a list of "the app's routes" — a list of the Phase-0 screens. Keeping
   * it separate from the Campaign E list below is what lets both assertions stay
   * exhaustive while a wave of parallel surface lanes is landing: a lane appends
   * one label to {@link CAMPAIGN_E_SCREENS} and touches nothing else, and a
   * Phase-0 screen that went missing in a merge still fails here.
   */
  const CONTROLLER_SCREENS = [
    'Capture',
    'Word',
    'Kanji',
    'Session',
    'Integration canvas',
    'Repair branch',
    'Evidence',
    'About & diagnostics',
  ] as const;

  /**
   * Learner destinations Campaign E adds, sorted.
   *
   * Sorted rather than in wave order so that two lanes appending in the same
   * round produce a mergeable diff. Every entry here is a real learner
   * destination with a real door; development surfaces are `specimen` and are
   * pinned separately, below.
   */
  const CAMPAIGN_E_SCREENS = ['Journeys', 'Map', 'Reading', 'The guide'] as const;

  it('covers every screen the controller §10 list names', () => {
    const labels = LEARNER_DESTINATIONS.map((destination) => destination.label);
    for (const name of CONTROLLER_SCREENS) {
      expect(labels, `${name} is no longer on the map`).toContain(name);
    }
    // Order is part of the claim: the map is documented as being in the order
    // the loop is walked, and a reordering would make that comment false.
    expect(labels.filter((label) => CONTROLLER_SCREENS.includes(label as never))).toEqual([
      ...CONTROLLER_SCREENS,
    ]);
  });

  /**
   * …and nothing arrives unregistered.
   *
   * The half that keeps the assertion above from being a containment check that
   * anything can pass: every learner destination is either one of the eight or
   * one this campaign declared, and a new surface that skipped both lists fails
   * here rather than shipping unowned.
   */
  it('registers every learner destination the campaign added', () => {
    const added = LEARNER_DESTINATIONS.map((destination) => destination.label)
      .filter((label) => !CONTROLLER_SCREENS.includes(label as never))
      .sort();
    expect(added).toEqual([...CAMPAIGN_E_SCREENS].sort());
  });

  /**
   * The open item this file carried, closed.
   *
   * The comment that stood here recorded three lanes each appending one entry to
   * the shell, each with a defensible argument, none able to see the others; the
   * shell reached seven and the comment said the information architecture was
   * Wave D's work. It was, and this is it. `src/ui/navigation.ts` holds the
   * argument in full; the assertions here are what stop it being re-litigated by
   * appending.
   */
  it('holds five destinations, grouped by what the learner is doing', () => {
    // Not a magic number and not a quota. Five *verbs*: see what I have built,
    // sit a session, close a branch, read a passage, look at the record.
    // Anything that is a step of one of those does not belong here, which is how
    // the canvas, the repair branch and the About screen left; anything that is
    // not a place does not belong here either, which is how capture and the
    // guide left.
    //
    // An equality rather than a bound, so a sixth entry is a visible edit that
    // has to answer §3 of the module — which verb is it, and which existing tab
    // is it not a step of — rather than a line appended in a merge.
    expect(SHELL_DESTINATIONS.map((destination) => destination.label)).toEqual([
      'Map',
      'Session',
      'Evidence',
      'Journeys',
      'Reading',
    ]);
  });

  it('puts the map at the front door', () => {
    // `navigation.ts` §1. The map is `/` rather than first-of-seven: the
    // round-2 research found it is the only surface that answers "what have I
    // built" rather than "what do I owe", and the front door is the one place
    // that distinction is felt.
    const home = DESTINATIONS.find((destination) => destination.href === '/');
    expect(home?.label).toBe('Map');
    expect(home?.screen).toBe('screens/map-screen.tsx');
  });

  it('keeps capture an action and the guide a presence, not tabs', () => {
    // §2 and §4. Both were tabs; both are carried by the shell now. Promoting
    // either back to the shell fails here, which is the point — it should cost
    // an argument rather than an append.
    expect(ACTION_DESTINATIONS.map((destination) => destination.href)).toEqual(['/capture']);
    expect(PRESENCE_DESTINATIONS.map((destination) => destination.href)).toEqual(['/guide']);
    const shellHrefs = SHELL_DESTINATIONS.map((destination) => destination.href);
    expect(shellHrefs).not.toContain('/capture');
    expect(shellHrefs).not.toContain('/guide');
  });

  it('names every learner destination in Japanese as well as English', () => {
    // Typography-first (frozen §8) applies to the chrome. A navigation bar in
    // English only teaches that Japanese is the content and English is the
    // frame, in an app whose whole subject is the opposite.
    for (const destination of LEARNER_DESTINATIONS) {
      expect(destination.ja, `${destination.label} has no Japanese name`).not.toBe('');
      expect(destination.yomi, `${destination.ja} has no reading`).not.toBe('');
      // Kanji, kana, or both — never a romanised label wearing a Japanese slot.
      expect(destination.ja, `${destination.label}'s Japanese name is not Japanese`).toMatch(
        /^[぀-ヿ一-龯]+$/u,
      );
      expect(destination.yomi, `${destination.ja}'s reading is not kana`).toMatch(
        /^[぀-ゟ゠-ヿ]+$/u,
      );
    }
  });

  it('sets the Japanese names in mincho, where the type scale puts them', () => {
    // The rule is typography-first, and mincho is the reading face the frozen
    // spec names. A Japanese label set in the UI sans is the label without the
    // decision.
    const shell = read(resolve(APP_ROOT, 'src/ui/nav-shell.tsx'));
    expect(shell).toContain('theme.font.mincho');
    expect(shell).toContain('destination.ja');
  });

  /**
   * The specimen exemption, pinned.
   *
   * Exactly one route may be a development surface, it may not be in the shell,
   * and it may not be a link target from a learner screen — otherwise "not a
   * learner destination" is a label rather than a fact. Growing this list is a
   * visible edit here, which is the whole point of writing it as an equality.
   */
  it('keeps development surfaces out of the learner-facing app', () => {
    expect(SPECIMEN_DESTINATIONS.map((destination) => destination.href)).toEqual(['/style-guide']);
    for (const destination of SPECIMEN_DESTINATIONS) {
      expect(SHELL_DESTINATIONS).not.toContain(destination);
      const screens = walk(resolve(APP_ROOT, 'src/screens')).map(read).join('\n');
      expect(screens, 'a learner screen links to a development surface').not.toContain(
        destination.href,
      );
    }
  });
});
