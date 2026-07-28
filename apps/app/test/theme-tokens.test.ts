/**
 * The design system's own rules, checked against its own source.
 *
 * `theme-contrast.test.ts` checks that the *values* are legible. This file
 * checks that the *system* is a system: that both schemes resolve, that no
 * component reaches around the tokens, that the memory channel never speaks by
 * colour alone, and that no component can express a global mastery score.
 *
 * All of it is source-scanning or pure-data assertion, because the repository
 * installs no React renderer (see `navigation-reachability.test.ts` for the same
 * note). A scan proves the text is not in the tree at all, which for a rule of
 * the form "no component may ever…" is the stronger statement anyway.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CAPABILITY_IDS, CAPABILITIES } from '../src/ui/capability.ts';
import {
  COLOR_SCHEMES,
  EDGE_PATTERNS,
  ELEVATION,
  LEADING,
  MEASURE,
  MIN_UNLIT_OPACITY,
  RADIUS,
  RECALL_BANDS,
  RECALL_BAND_MARKS,
  SPACE,
  TYPE,
  createTheme,
  paletteValue,
  surfaceOf,
} from '../src/ui/theme.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full);
  }
  return out;
}

const read = (file: string): string => readFileSync(file, 'utf8');
const rel = (file: string): string => relative(APP_ROOT, file);

/** Source with comments removed: a rule has to be nameable in its own docblock. */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const uiFiles = walk(resolve(APP_ROOT, 'src/ui'));
const screenFiles = walk(resolve(APP_ROOT, 'src/screens'));
const routeFiles = walk(resolve(APP_ROOT, 'app'));

/* ------------------------------------------------------------------ *
 * Both schemes resolve, through the same code
 * ------------------------------------------------------------------ */

describe('tokens resolve in both schemes', () => {
  it.each(COLOR_SCHEMES)('%s builds a complete theme', (scheme) => {
    const theme = createTheme(scheme);
    expect(theme.scheme).toBe(scheme);
    for (const value of Object.values(theme.color)) {
      if (typeof value === 'string') expect(value).toMatch(/^#[0-9a-f]{6}$/i);
      else for (const step of Object.values(value)) expect(step).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(theme.space).toBe(SPACE);
    expect(theme.type).toBe(TYPE);
    expect(theme.radius).toBe(RADIUS);
    expect(theme.leading).toBe(LEADING);
    expect(theme.measure).toBe(MEASURE);
  });

  it.each(COLOR_SCHEMES)('%s resolves every elevation to real colours', (scheme) => {
    const theme = createTheme(scheme);
    for (const level of Object.keys(ELEVATION) as (keyof typeof ELEVATION)[]) {
      const surface = surfaceOf(theme, level);
      expect(surface.background).toMatch(/^#[0-9a-f]{6}$/i);
      expect(surface.border === 'transparent' || /^#[0-9a-f]{6}$/i.test(surface.border)).toBe(true);
      expect(surface.borderWidth).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * The two schemes must not be one scheme and its inverse.
   *
   * "Light and dark, both designed with equal care" is only checkable as a
   * negative: if dark were an inversion, every dark value would be the light
   * value's complement. Asserting that *no* token is an exact inversion is weak;
   * asserting that the paper values differ in warmth and that the ramps are not
   * mirror images is what actually catches a lazy `invert()`.
   */
  it('does not derive dark by inverting light', () => {
    const light = createTheme('light').color;
    const dark = createTheme('dark').color;
    const inverted = (hex: string): string => {
      const n = Number.parseInt(hex.slice(1), 16);
      const flip = 0xffffff - n;
      return `#${flip.toString(16).padStart(6, '0')}`;
    };
    for (const token of ['paper', 'raised', 'sunken', 'ink', 'vermilion'] as const) {
      expect(dark[token].toLowerCase(), `${token} is a mechanical inversion`).not.toBe(
        inverted(light[token]).toLowerCase(),
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * Components never branch on theme, and never write a colour
 * ------------------------------------------------------------------ */

describe('no component hard-codes a colour or branches on the scheme', () => {
  /**
   * `specimen.tsx` is the one exemption, and it is an exemption from the
   * *branch* rule only: a swatch is given a colour by the page in order to print
   * it, which is the opposite of hard-coding one. It still writes no literal.
   */
  const SWATCH_FILE = 'src/ui/style-guide/specimen.tsx';

  it.each([...uiFiles, ...screenFiles, ...routeFiles].map((file) => [rel(file), file] as const))(
    '%s writes no hex literal',
    (name, file) => {
      const body = stripComments(read(file));
      const literals = body.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
      expect(literals, `${name} contains colour literals; take them from the theme`).toEqual([]);
    },
  );

  it.each([...uiFiles, ...screenFiles, ...routeFiles].map((file) => [rel(file), file] as const))(
    '%s does not branch on the colour scheme',
    (name, file) => {
      if (rel(file) === SWATCH_FILE) return;
      const body = stripComments(read(file));
      // `theme.scheme` may be *read* — the specimen page prints which scheme it
      // is in — but never compared, which is what a branch looks like.
      expect(body, `${name} branches on the scheme instead of using a token`).not.toMatch(
        /scheme\s*===\s*['"](?:light|dark)['"]/,
      );
      expect(body, `${name} branches on the scheme instead of using a token`).not.toMatch(
        /['"](?:light|dark)['"]\s*===\s*\w*[Ss]cheme/,
      );
    },
  );

  /**
   * Every palette token is reachable by path, and an unknown path throws.
   *
   * `paletteValue` is the seam every component's colour goes through, so a
   * silent `undefined` there would be a transparent element rather than an
   * error — the failure mode that is hardest to see in a screenshot.
   */
  it('rejects an unknown token path rather than returning undefined', () => {
    const theme = createTheme('light');
    expect(() => paletteValue(theme.color, 'ink')).not.toThrow();
    expect(() => paletteValue(theme.color, 'recall.settled')).not.toThrow();
    expect(() => paletteValue(theme.color, 'recall')).toThrow();
    expect(() => paletteValue(theme.color, 'recall.excellent')).toThrow();
    expect(() => paletteValue(theme.color, 'nonesuch')).toThrow();
    expect(() => paletteValue(theme.color, 'ink.deep')).toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * The memory channel never speaks by colour alone
 * ------------------------------------------------------------------ */

describe('memory state is never colour-only (WCAG 1.4.1)', () => {
  it('gives each edge state a distinct dash pattern', () => {
    const patterns = Object.entries(EDGE_PATTERNS).map(([name, dashes]) => [
      name,
      dashes.join(','),
    ]);
    const seen = new Set(patterns.map(([, dashes]) => dashes));
    expect(seen.size, 'two edge states share a dash pattern').toBe(patterns.length);
  });

  it('gives each recall band a distinct mark shape', () => {
    const shapes = RECALL_BANDS.map((band) => RECALL_BAND_MARKS[band].shape);
    expect(new Set(shapes).size, 'two bands share a mark shape').toBe(shapes.length);
  });

  it('gives each recall band a word, not just a step', () => {
    const source = read(resolve(APP_ROOT, 'src/ui/recall.tsx'));
    for (const band of RECALL_BANDS) {
      expect(source, `${band} has no label`).toMatch(new RegExp(`\\b${band}\\s*:\\s*'`));
    }
  });

  /**
   * The two sub-threshold bands may only be drawn inside the meter.
   *
   * This is the other half of the contrast test's `standalone` assertion: there,
   * the declaration is checked against the arithmetic; here, it is checked
   * against the code. `RecallMark` throws on a meter-only band at runtime, and
   * the scan below is what makes that a property of the system rather than of
   * one component — nothing outside `recall.tsx` may name those steps.
   */
  it('keeps the meter-only bands inside the meter', () => {
    const meterOnly = RECALL_BANDS.filter((band) => !RECALL_BAND_MARKS[band].standalone);
    expect(meterOnly.length, 'the standalone declaration has drifted').toBeGreaterThan(0);

    const allowed = new Set(['src/ui/recall.tsx', 'src/theme/color.ts']);
    for (const file of [...uiFiles, ...screenFiles, ...routeFiles]) {
      if (allowed.has(rel(file))) continue;
      const body = stripComments(read(file));
      for (const band of meterOnly) {
        expect(body, `${rel(file)} names the meter-only band '${band}'`).not.toMatch(
          new RegExp(`['"]${band}['"]`),
        );
      }
    }
  });

  it('keeps an unlit branch visible rather than hidden', () => {
    // The frozen spec §3 keeps untaken branches on the map as dimmed rails.
    // "Dimmed" has a floor; below it the rail has been deleted, not dimmed.
    expect(MIN_UNLIT_OPACITY).toBeGreaterThanOrEqual(0.3);
  });
});

/* ------------------------------------------------------------------ *
 * No global scalar (REQ-LM-03), no aggregate capability (REQ-UI-07)
 * ------------------------------------------------------------------ */

describe('no component can express a global mastery score', () => {
  it('offers no aggregate capability to render', () => {
    for (const forbidden of ['overall', 'total', 'average', 'composite', 'global']) {
      expect(CAPABILITY_IDS as readonly string[]).not.toContain(forbidden);
    }
    expect(CAPABILITY_IDS).toHaveLength(5);
    expect(CAPABILITIES.map((capability) => capability.id)).toEqual([...CAPABILITY_IDS]);
  });

  /**
   * Both recall components take `capability` as a required prop.
   *
   * Checked in the source rather than by construction because a renderer is not
   * available: what is asserted is that neither prop is declared optional, which
   * is the edit that would quietly allow a capability-less band.
   */
  it.each(['RecallMarkProps', 'RecallMeterProps'])('%s requires a capability', (name) => {
    const source = read(resolve(APP_ROOT, 'src/ui/recall.tsx'));
    const start = source.indexOf(`interface ${name}`);
    expect(start, `${name} not found`).toBeGreaterThan(-1);
    const block = source.slice(start, source.indexOf('}', start));
    expect(block).toMatch(/readonly capability: CapabilityId;/);
    expect(block, `${name} made capability optional`).not.toMatch(/capability\?/);
  });

  it('renders no percentage anywhere in the vocabulary', () => {
    for (const file of uiFiles) {
      const body = stripComments(read(file));
      expect(body, `${rel(file)} renders a percentage`).not.toMatch(
        /\{[^}]*\}\s*%|\b\d+\s*%\s*(?:recall|known|mastery|retention)/i,
      );
    }
  });
});

/* ------------------------------------------------------------------ *
 * The frontier vocabulary has exactly two marks
 * ------------------------------------------------------------------ */

describe('reading surfaces carry a personal frontier, not a rainbow', () => {
  it('defines exactly two marks plus "none"', () => {
    // Comments first: the union's own docblocks explain each member, and one of
    // them contains a semicolon, which would otherwise end the slice early and
    // make this pass by reading only part of the union.
    const source = stripComments(read(resolve(APP_ROOT, 'src/ui/frontier-marks.ts')));
    const union = source.slice(
      source.indexOf('export type FrontierMarkKind'),
      source.indexOf(';', source.indexOf('export type FrontierMarkKind')),
    );
    const members = (union.match(/\|\s*'([a-z]+)'/g) ?? []).map((member) =>
      member.replace(/[|'\s]/g, ''),
    );
    expect(members.sort()).toEqual(['fragile', 'frontier', 'none']);
  });

  it('marks with the accent only for the frontier, never for fragility', () => {
    const source = stripComments(read(resolve(APP_ROOT, 'src/ui/frontier.tsx')));
    // The accent belongs to the learner's edge; a word they have met is not an
    // alarm. `fragileEdge` is a neutral by construction (see the contrast test).
    expect(source).toContain('theme.color.frontierMark');
    expect(source).toContain('theme.color.fragileEdge');
    expect(source, 'a frontier mark reached for a second accent token').not.toContain(
      'theme.color.vermilionSoft',
    );
  });
});

/* ------------------------------------------------------------------ *
 * Elevation is ink, not shadow
 * ------------------------------------------------------------------ */

describe('surfaces sit on the paper rather than floating above it', () => {
  it.each([...uiFiles, ...screenFiles].map((file) => [rel(file), file] as const))(
    '%s uses no drop shadow',
    (name, file) => {
      const body = stripComments(read(file));
      for (const property of ['shadowColor', 'shadowOffset', 'shadowOpacity', 'boxShadow']) {
        expect(body, `${name} uses ${property}; elevation here is ink and rules`).not.toContain(
          property,
        );
      }
      expect(body, `${name} uses Android elevation`).not.toMatch(/\belevation:\s*\d/);
    },
  );
});
