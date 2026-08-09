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

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  DESTINATIONS,
  EMBEDDED_SURFACES,
  NESTED_DESTINATIONS,
  SHELL_DESTINATIONS,
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
      const component = basename(destination.screen)
        .replace(/\.tsx?$/, '')
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join('');
      expect(source, `${destination.routeFile} does not render ${component}`).toContain(component);
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
  it('covers every screen the controller §10 list names', () => {
    const labels = DESTINATIONS.map((destination) => destination.label);
    expect(labels).toEqual([
      'Capture',
      'Source',
      'Word',
      'Kanji',
      'Session',
      'Integration canvas',
      'Repair branch',
      'Evidence',
      'Monthly truth',
      'About & diagnostics',
    ]);
  });

  it('keeps the shell small enough to stay calm (REQ-UI-08)', () => {
    // Four is not a magic number: it is capture, session, evidence, about — the
    // places a learner *starts* from. A fifth entry means something that belongs
    // to a screen has been promoted to chrome, which is how a masthead becomes a
    // debug menu.
    expect(SHELL_DESTINATIONS.map((destination) => destination.label)).toEqual([
      'Capture',
      'Session',
      'Evidence',
      'Monthly truth',
    ]);
  });
});
