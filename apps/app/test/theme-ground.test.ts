/**
 * The ground layer's own rules, checked against its own source (lane A1′).
 *
 * `theme-contrast.test.ts` walks `CONTRAST_PAIRS` against one paper and one
 * card. That was the whole obligation when there was one ground. There are now
 * six — three era registers × two schemes — and the visual-language doc §5.1 is
 * explicit that this is where the cost of the redirect lands: *"a token that
 * fails 3:1 or 4.5:1 on any reachable ground fails the build."* So this file
 * multiplies the pair list by the grounds rather than adding a handful of spot
 * checks, and it is more test surface than lane A1 had, which is correct.
 *
 * Other properties are checked here because each of them is a claim the module's
 * docblocks make and none of them would otherwise be true of anything but the
 * prose:
 *
 *   1. the two colour layers cannot be crossed (a compile-time proof, below);
 *   2. every hex is the value the sourced chart gives, character for character;
 *   3. the declared luminance bands match the arithmetic;
 *   4. emitted light is capped and confined to the rail register;
 *   5. a mineral ramp really is one mineral, coarse to fine.
 *
 * Five more arrived with the first verification round, and each of them is a
 * check that was missing rather than a check that failed — which is the useful
 * distinction, because a suite of 2088 green tests said nothing about any of
 * these:
 *
 *   6. **a pigment painted as figure clears 3:1 where it lands.**
 *      `GROUND_CONTRAST_PAIRS` walks the semantic palette, so 山吹 shipped at
 *      1.578:1 on 鉄道's daylight field with everything green.
 *      `GROUND_FIGURE_PIGMENTS` × its own register's fields is the missing walk.
 *   7. **the three signal kinds differ by form, and not by hue.** Both halves:
 *      distinct shapes, and one shared pigment. Two of the three used to be
 *      pixel-identical.
 *   8. **the museum-card scan sees a namespace or dynamic import.** It read
 *      `import { … }` braces only, so `import * as t` plus `t.groundOf(…)`
 *      painted a ground and was treated as painting nothing.
 *   9. **the meter cannot reach a ground through composition.** A source scan
 *      cannot see that `RecallIndicator` resolves to three `<Text>` nodes for two
 *      of five bands; a narrowed prop type can.
 *  10. **a count in a user-visible sentence is the count.** The page printed the
 *      cap where the number lit belonged.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

// Namespace import so the drift test below can walk every export by value
// rather than by a hand-written list — see 'binds every exported name…'.
import * as groundModule from '../src/theme/ground.ts';
import {
  AA_NON_TEXT,
  contrastRatio,
  parseHexColor,
  relativeLuminance,
} from '../src/ui/contrast.ts';
import {
  COLOR_SCHEMES,
  CONTRAST_PAIRS,
  ERA_KEYS,
  ERA_PIGMENTS,
  ERA_REGISTERS,
  EMISSIVE_LAMP,
  EMISSIVE_MARKS,
  EMISSIVE_REGISTER,
  EMISSIVE_SIGNAL_KINDS,
  GROUNDS,
  GROUND_BAND_WINDOWS,
  GROUND_CONTRAST_PAIRS,
  GROUND_FIGURE_PIGMENTS,
  GROUND_PAINTING_EXPORTS,
  MAX_EMISSIVE_POINTS,
  MAX_MAT_ALPHA,
  MINERAL_RAMPS,
  PALETTES,
  UNLIT_EMISSIVE_PIGMENTS,
  emissiveTally,
  eraPigment,
  figurePaletteOn,
  groundLayers,
  groundOf,
  paletteValue,
  planEmissive,
  superpose,
  type EraGround,
  type EraKey,
  type GroundColor,
  type GroundPigment,
  type SemanticColor,
} from '../src/ui/theme.ts';
import type { GroundCard } from '../src/ui/style-guide/ground-field.tsx';
import {
  RAIL_RATION_NOTE,
  RAIL_SIGNALS,
  RAIL_SUPPRESSED_BASES,
  RAIL_TALLY,
  railRationNote,
} from '../src/ui/style-guide/specimen-content.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Every era × scheme pair, as the tests below all walk the same six. */
const ALL_GROUNDS: readonly EraGround[] = ERA_KEYS.flatMap((era) =>
  COLOR_SCHEMES.map((scheme) => groundOf(era, scheme)),
);

const label = (ground: EraGround): string => `${ground.era}/${ground.scheme}`;

/* ------------------------------------------------------------------ *
 * 1. The two layers cannot be crossed — proved by the compiler
 * ------------------------------------------------------------------ */

describe('ground and figure colours are different types', () => {
  /**
   * The proof is the `@ts-expect-error` directives, not the `expect` calls.
   *
   * A `@ts-expect-error` on a line that turns out to have no error is itself an
   * error ("unused '@ts-expect-error' directive"), so if branding were ever
   * weakened — a brand dropped, a type widened back to `string` — this file
   * would stop compiling and `npm run typecheck` would fail. That makes the
   * separation a property of the build rather than of a runtime assertion,
   * which is the right register for it: a runtime check cannot catch a mistake
   * whose whole nature is that both values are strings.
   *
   * The `expect` lines below only record that the values really are strings at
   * run time, which is the other half of the claim — branding must cost nothing
   * where the colour is actually used.
   */
  it('rejects a ground colour where a semantic colour is required', () => {
    const ground = groundOf('kodo', 'light');
    const takesSemantic = (color: SemanticColor): string => color;

    // @ts-expect-error a ground is not a semantic token
    takesSemantic(ground.field);
    // @ts-expect-error nor is a raw pigment
    takesSemantic(ERA_PIGMENTS.tetsudo.railBlue.hex);
    // @ts-expect-error nor is a plain string
    takesSemantic('#FFFFFF');

    expect(typeof ground.field).toBe('string');
    expect(takesSemantic(paletteValue(figurePaletteOn(ground), 'ink'))).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('rejects a semantic colour where a ground colour is required', () => {
    const ground = groundOf('tetsudo', 'dark');
    const takesGround = (color: GroundColor): string => color;
    const ink = paletteValue(figurePaletteOn(ground), 'ink');

    // @ts-expect-error a semantic token is not a ground
    takesGround(ink);
    // @ts-expect-error nor is a plain string
    takesGround('#000000');

    expect(typeof ink).toBe('string');
    expect(takesGround(ground.ground)).toMatch(/^#[0-9A-F]{6}$/);
  });

  /**
   * The type ban on text-on-ground, stated as the only thing a runtime test can
   * add: that no declared pair asks for a text ratio.
   *
   * `GroundContrastPair.minimum` is the literal `'nonText'`, so a 4.5:1
   * text-on-ground entry is a type error rather than a failing assertion. This
   * checks the data too, because a type is only as good as the file that has to
   * keep compiling — and this one is cheap.
   */
  it('has no way to declare text on an era ground', () => {
    for (const pair of GROUND_CONTRAST_PAIRS) {
      expect(pair.minimum, `${pair.name} asks for a text ratio on a ground`).toBe('nonText');
    }
  });
});

/* ------------------------------------------------------------------ *
 * 2. The pigments are transcribed, not chosen
 * ------------------------------------------------------------------ */

describe('the pigments are the sourced chart', () => {
  /**
   * The values as printed in `docs/design/BUNKI_VISUAL_LANGUAGE_NIHONGA_2026-07-28.md`
   * §4, retyped here from the document rather than imported from the module.
   *
   * Duplication is the point. A test that read the same table it is checking
   * would assert only that the module is self-consistent; typing the chart out a
   * second time is what makes an accidental edit — a digit dropped, a value
   * "corrected" to taste — show up as a failure instead of as a new design.
   */
  const CHART: Readonly<Record<EraKey, Readonly<Record<string, string>>>> = {
    kodo: {
      ground: '#0F4C3A',
      groundLight: '#DAC9A6',
      mid: '#24936E',
      mist: '#A8D8B9',
      earth: '#B68E55',
      deep: '#36563C',
      ink: '#1C1C1C',
    },
    kaido: {
      skyUpper: '#006284',
      skyLower: '#A5DEE4',
      ground: '#D7B98E',
      structure: '#9A5034',
      accent: '#D75455',
      snow: '#FFFFFB',
      ink: '#3A3226',
    },
    tetsudo: {
      nightGround: '#08192D',
      structure: '#434343',
      concrete: '#787D7B',
      railBlue: '#4C6CB3',
      signal: '#C73E3A',
      platformLight: '#FFB11B',
      farLight: '#78C2C4',
    },
  };

  it.each(ERA_KEYS)('%s matches the chart exactly', (era) => {
    const declared = ERA_PIGMENTS[era] as Readonly<Record<string, GroundPigment>>;
    const expected = CHART[era];
    expect(Object.keys(declared).sort()).toEqual(Object.keys(expected).sort());
    for (const [role, hex] of Object.entries(expected)) {
      expect(declared[role]?.hex, `${era}.${role}`).toBe(hex);
    }
  });

  it('carries the Japanese name and reading with every pigment', () => {
    for (const era of ERA_KEYS) {
      for (const [role, entry] of Object.entries(
        ERA_PIGMENTS[era] as Readonly<Record<string, GroundPigment>>,
      )) {
        expect(entry.written, `${era}.${role} has no name`).not.toBe('');
        expect(entry.reading, `${era}.${role} has no reading`).not.toBe('');
        // Every name is Japanese script, not a romanisation wearing the slot.
        expect(entry.written, `${era}.${role}`).toMatch(/[぀-ヿ一-鿿]/u);
      }
    }
  });

  it('declares a ground for every era in every scheme', () => {
    expect(ALL_GROUNDS).toHaveLength(ERA_KEYS.length * COLOR_SCHEMES.length);
    for (const era of ERA_KEYS) {
      for (const scheme of COLOR_SCHEMES) {
        // `groundOf` is a reader over `GROUNDS`, not a second source of truth.
        expect(groundOf(era, scheme)).toBe(GROUNDS[era][scheme]);
        expect(GROUNDS[era][scheme].era).toBe(era);
        expect(GROUNDS[era][scheme].scheme).toBe(scheme);
      }
    }
  });

  it('names each of the three registers as the map does', () => {
    expect(ERA_KEYS).toEqual(['kodo', 'kaido', 'tetsudo']);
    expect(ERA_REGISTERS.kodo.written).toBe('古道');
    expect(ERA_REGISTERS.kaido.written).toBe('街道');
    expect(ERA_REGISTERS.tetsudo.written).toBe('鉄道');
    for (const era of ERA_KEYS) {
      const register = ERA_REGISTERS[era];
      expect(register.key).toBe(era);
      expect(register.gloss.length).toBeGreaterThan(0);
      expect(register.period.length).toBeGreaterThan(0);
      expect(register.stratum.length).toBeGreaterThan(0);
    }
  });

  it('rejects a role that is not in the register', () => {
    expect(() => eraPigment('kodo', 'mist')).not.toThrow();
    // @ts-expect-error 'nightGround' belongs to the rail register, not to kodo
    expect(() => eraPigment('kodo', 'nightGround')).toThrow();
  });
});

/* ------------------------------------------------------------------ *
 * 3. Superposition, and the field the arithmetic promises
 * ------------------------------------------------------------------ */

describe('depth is superposition, not shadow', () => {
  it('composites source-over in sRGB', () => {
    // Half of white over black is the sRGB midpoint, not the perceptual one.
    const half = superpose([
      { pigment: ERA_PIGMENTS.kodo.ink, alpha: 1 },
      { pigment: ERA_PIGMENTS.kaido.snow, alpha: 0.5 },
    ]);
    const { r, g, b } = parseHexColor(half);
    expect(r).toBe(Math.round(255 * 0.5 + 0x1c * 0.5));
    expect(g).toBe(Math.round(255 * 0.5 + 0x1c * 0.5));
    expect(b).toBe(Math.round(0xfb * 0.5 + 0x1c * 0.5));
  });

  it('refuses a stack whose bottom is translucent', () => {
    expect(() => superpose([{ pigment: ERA_PIGMENTS.kodo.mist, alpha: 0.5 }])).toThrow(/opaque/);
    expect(() => superpose([])).toThrow(/at least one layer/);
  });

  it.each(ALL_GROUNDS.map((ground) => [label(ground), ground] as const))(
    '%s is really the stack it hands out',
    (_name, ground) => {
      // The whole honesty of `field`: it is only a true prediction of what a
      // mark lands on if a renderer paints exactly these layers at exactly
      // these alphas, so the list and the arithmetic come from one place.
      expect(superpose(groundLayers(ground))).toBe(ground.field);
      expect(superpose(ground.layers)).toBe(ground.ground);
    },
  );

  it.each(ALL_GROUNDS.map((ground) => [label(ground), ground] as const))(
    '%s stacks translucent washes rather than painting over',
    (name, ground) => {
      const stack = groundLayers(ground);
      expect(stack.length, `${name} is a single flat colour`).toBeGreaterThanOrEqual(3);
      expect(stack[0]?.alpha).toBe(1);
      for (const wash of stack.slice(1)) {
        expect(wash.alpha, `${name} has an opaque "wash"`).toBeGreaterThan(0);
        expect(wash.alpha, `${name} paints its ground out`).toBeLessThanOrEqual(MAX_MAT_ALPHA);
      }
    },
  );

  /**
   * The ban on shadow, extended to the layer that was most likely to want one.
   *
   * `theme-tokens.test.ts` already walks `src/ui` and `src/screens`. The ground
   * layer is where a drop shadow would be most tempting — a card floating over
   * a landscape is exactly the picture a `boxShadow` gets reached for — and the
   * material's answer is that depth is stacked veils, so the scan is extended
   * here rather than left implied.
   */
  it('writes no shadow anywhere in the theme layer', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return ['.ts', '.tsx'].includes(extname(full)) ? [full] : [];
      });
    for (const file of walk(resolve(APP_ROOT, 'src/theme'))) {
      // Comments stripped first, as `theme-tokens.test.ts` does: `layout.ts`
      // explains in prose why there is no `boxShadow`, and a rule has to be
      // nameable in its own docblock without tripping the scan that keeps it.
      const body = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      for (const property of ['shadowColor', 'shadowOffset', 'shadowOpacity', 'boxShadow']) {
        expect(body, `${relative(APP_ROOT, file)} uses ${property}`).not.toContain(property);
      }
    }
  });
});

/* ------------------------------------------------------------------ *
 * 4. The luminance bands are measurements, not adjectives
 * ------------------------------------------------------------------ */

describe('every era ground declares a luminance band that holds', () => {
  it.each(ALL_GROUNDS.map((ground) => [label(ground), ground] as const))(
    '%s sits inside its declared band',
    (name, ground) => {
      const window = GROUND_BAND_WINDOWS[ground.band];
      const measured = relativeLuminance(ground.ground);
      expect(
        measured,
        `${name} declares '${ground.band}' at ${measured.toFixed(3)}`,
      ).toBeGreaterThan(window.min - Number.EPSILON);
      expect(
        measured,
        `${name} declares '${ground.band}' at ${measured.toFixed(3)}`,
      ).toBeLessThanOrEqual(window.max);
    },
  );

  /**
   * The declared `figureScheme` must match the field, not the app's scheme.
   *
   * This is "the semantic ramp resolves against the active ground" made
   * checkable. On a dark field, presence is light and the dark ramp is the right
   * one; on a pale field it is the other way round. Today the two agree for all
   * six grounds, and this assertion is what will catch the first era register
   * that is dark in the light scheme.
   */
  it.each(ALL_GROUNDS.map((ground) => [label(ground), ground] as const))(
    '%s resolves the ramp against its own field',
    (name, ground) => {
      const fieldIsPale = relativeLuminance(ground.field) >= 0.5;
      expect(ground.figureScheme, `${name} would draw a dark ramp on a pale field`).toBe(
        fieldIsPale ? 'light' : 'dark',
      );
      // And the palette handed out is the shared one that scheme names, not a
      // copy that could drift from what the rest of the app renders.
      expect(figurePaletteOn(ground)).toBe(PALETTES[ground.figureScheme]);
    },
  );

  /**
   * A tripwire, not an invariant — and the difference matters.
   *
   * `RecallMark` and every other figure component read the ramp from
   * `useTheme()`, which is the *app's* scheme. That is correct today only
   * because all six grounds happen to resolve their figure to the same scheme
   * the app is in. The first era register that is dark in the light scheme
   * breaks that coincidence, and its marks would silently be drawn from the
   * wrong end of the ramp.
   *
   * So this fails at exactly that moment, and the failure is the instruction:
   * thread `figurePaletteOn(ground)` through to the mark instead of letting it
   * read the app theme. Written down here rather than in a comment, because a
   * comment would not fire.
   */
  it.each(ALL_GROUNDS.map((ground) => [label(ground), ground] as const))(
    '%s still lets a figure component read the ramp off the app theme',
    (name, ground) => {
      expect(
        ground.figureScheme,
        `${name} needs figurePaletteOn threaded into the mark components`,
      ).toBe(ground.scheme);
    },
  );

  it.each(COLOR_SCHEMES)('%s keeps the three eras tonally apart', (scheme) => {
    const luminances = ERA_KEYS.map((era) => relativeLuminance(groundOf(era, scheme).ground));
    const lightest = Math.max(...luminances);
    const darkest = Math.min(...luminances);
    // Three tints of one value would be three eras a learner cannot tell apart.
    expect((lightest + 0.05) / (darkest + 0.05)).toBeGreaterThan(1.5);
  });
});

/* ------------------------------------------------------------------ *
 * 5. Every figure token, on every reachable ground, in both schemes
 * ------------------------------------------------------------------ */

describe('the semantic ramp clears on every ground it can land on', () => {
  const CASES = ALL_GROUNDS.flatMap((ground) =>
    GROUND_CONTRAST_PAIRS.map((pair) => [`${label(ground)} · ${pair.name}`, ground, pair] as const),
  );

  it.each(CASES)('%s', (_name, ground, pair) => {
    const value = paletteValue(figurePaletteOn(ground), pair.figure);
    expect(contrastRatio(value, ground.field)).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  /**
   * Nothing that draws on a ground may be missing from the ground pair list.
   *
   * Stated as coverage rather than as a count, for the reason
   * `theme-contrast.test.ts` gives about its own completeness check: a count is
   * satisfied by adding any entry, and only coverage is satisfied by checking
   * the token that was added. The source of truth is `CONTRAST_PAIRS` — every
   * token it draws at the non-text minimum is a mark, an edge or a ring, and
   * every one of those can end up on a map over an era ground.
   */
  it('checks every non-text token the app draws', () => {
    const drawnOnAGround = new Set(
      CONTRAST_PAIRS.filter((pair) => pair.minimum === 'nonText').map((pair) => pair.foreground),
    );
    const covered = new Set(GROUND_CONTRAST_PAIRS.map((pair) => pair.figure));
    // `ink` appears at the non-text minimum only as stroke ink on a reading
    // surface, which is a card; text and strokes never touch a ground.
    const onCardsOnly = new Set(['ink']);
    const missing = [...drawnOnAGround].filter(
      (token) => !covered.has(token) && !onCardsOnly.has(token),
    );
    expect(missing, 'add a GROUND_CONTRAST_PAIRS entry for each of these').toEqual([]);
  });

  /**
   * The museum-card rule, doing double duty as the text guarantee.
   *
   * Text never touches a ground, so its 4.5:1 obligation is discharged by the
   * card it does sit on — which is opaque, and whose ink ratio is already
   * checked in `theme-contrast.test.ts`. What is checked here is the part that
   * is new: that the card is opaque relative to *this* ground, i.e. that the
   * ratio the card gives its text does not depend on what is underneath it.
   */
  it.each(ALL_GROUNDS.map((ground) => [label(ground), ground] as const))(
    '%s carries its text on a card whose contrast the ground cannot change',
    (name, ground) => {
      const palette = figurePaletteOn(ground);
      const onCard = contrastRatio(paletteValue(palette, 'ink'), paletteValue(palette, 'raised'));
      expect(onCard, `${name}`).toBeGreaterThanOrEqual(4.5);
      // The card surface is a flat opaque token — it is not composited with the
      // ground, so no era can dilute it. Asserted by construction: the card
      // colour is a palette value and appears in no ground stack.
      const inStack = groundLayers(ground).map((wash) => String(wash.pigment.hex));
      expect(inStack).not.toContain(String(paletteValue(palette, 'raised')));
    },
  );
});

/* ------------------------------------------------------------------ *
 * 5b. Text never sits on an era ground — checked across the whole app
 * ------------------------------------------------------------------ */

describe('the museum-card rule: no module paints a ground and renders text', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) return walk(full);
      return ['.ts', '.tsx'].includes(extname(full)) ? [full] : [];
    });

  /**
   * Every file in the app, minus the token modules themselves.
   *
   * `src/theme/` is exempt because it is pure data with no JSX in it — the rule
   * is about the modules that *render* a ground, and the module that declares
   * one has nothing to render.
   */
  const APP_FILES = [...walk(resolve(APP_ROOT, 'src')), ...walk(resolve(APP_ROOT, 'app'))].filter(
    (file) => !relative(APP_ROOT, file).startsWith('src/theme/'),
  );

  /**
   * Which files put a pigment on screen, read from the identifiers in the body.
   *
   * A file is bound by the rule when it *names* one of `GROUND_PAINTING_EXPORTS`
   * anywhere outside comments — however it got hold of the name, and from
   * whichever of the three paths that re-export it (the ground module,
   * `src/theme`, or the `@/ui/theme` barrel every screen uses).
   *
   * ## Why not the import statements
   *
   * This scan used to parse `import { … } from '…'` braces, and that had a hole
   * wide enough to drive the whole rule through:
   *
   * ```
   * import * as tokens from '../theme.ts';
   * <View style={{ backgroundColor: tokens.groundOf('kodo', 'light').ground }}>
   *   <Text>text sitting directly on an era ground</Text>
   * </View>
   * ```
   *
   * No brace list, so no binding, so the file "painted nothing" and its `<Text>`
   * was never looked at. `await import('../theme.ts')` escaped identically. A
   * scan whose guarantee can be lifted by changing import syntax is not a
   * guarantee, so the unit is now the identifier: an accessor has to be named
   * somewhere to be called, whatever route the name arrived by.
   *
   * The cost is that a file merely *mentioning* one of these names is treated as
   * painting. That is the right direction to be wrong in — the rule then binds a
   * file too many rather than one too few — and today it binds exactly the four
   * that reference a pigment accessor, three of which are token modules.
   */
  const paintsAGround = (body: string): readonly string[] => {
    const stripped = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return GROUND_PAINTING_EXPORTS.filter((name) => new RegExp(`\\b${name}\\b`).test(stripped));
  };

  /**
   * The scan's own behaviour, checked against bodies rather than against files.
   *
   * The three escapes below are the ones that mattered: a namespace import, a
   * dynamic import, and the two false-positive shapes that would make the rule
   * an obstacle. Written as strings so the probe cannot itself be a file that
   * has to be deleted afterwards and remembered about.
   */
  it('catches a name however it arrived, and only when it is really there', () => {
    expect(paintsAGround(`import { groundOf } from '../theme.ts';`)).toContain('groundOf');
    expect(
      paintsAGround(`import * as tokens from '../theme.ts';\ntokens.groundOf('kodo', 'light');`),
      'a namespace import painted a ground and the scan did not see it',
    ).toContain('groundOf');
    expect(
      paintsAGround(`const t = await import('../theme.ts');\nt.ERA_PIGMENTS.kodo.mist.hex;`),
      'a dynamic import painted a ground and the scan did not see it',
    ).toContain('ERA_PIGMENTS');
    // Comments are stripped, so a rule can be named in the docblock that keeps it…
    expect(paintsAGround(`/* groundOf is the accessor */\n// and superpose composites`)).toEqual(
      [],
    );
    // …and a name that only reads the ground does not bind the file.
    expect(paintsAGround(`import { ERA_REGISTERS, emissiveTally } from '../theme.ts';`)).toEqual(
      [],
    );
  });

  it('finds the module that actually paints one, so the scan is not vacuous', () => {
    const painters = APP_FILES.filter(
      (file) => paintsAGround(readFileSync(file, 'utf8')).length > 0,
    )
      .map((file) => relative(APP_ROOT, file))
      .sort();
    // If this list were empty the assertions below would pass by checking
    // nothing, which is the failure mode a scan is most prone to.
    expect(painters).toContain('src/ui/style-guide/ground-field.tsx');
  });

  it.each(APP_FILES.map((file) => [relative(APP_ROOT, file), file] as const))(
    '%s keeps text off any ground it paints',
    (name, file) => {
      const body = readFileSync(file, 'utf8');
      const painted = paintsAGround(body);
      if (painted.length === 0) return;
      const stripped = body.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
      // Identifier-level, like the painting half above, and for the same reason.
      //
      // These two checks used to read `<Text` and an `import { … } from
      // 'react-native'` brace list. Neither matches `import * as RN from
      // 'react-native'` followed by `<RN.Text>`, so a file that IS bound by the
      // scan could still render text straight onto an era ground and stay green —
      // the identical escape the painting half was repaired for, left behind in
      // the half nobody re-read. Matching the JSX tag in any namespaced form
      // closes it, because the element has to be *written* to be rendered.
      expect(stripped, `${name} renders <Text> while painting ${painted.join(', ')}`).not.toMatch(
        /<(?:[A-Za-z_$][\w$]*\.)?Text[\s/>]/,
      );
      expect(
        stripped,
        `${name} imports Text from react-native while painting ${painted.join(', ')}`,
      ).not.toMatch(/import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*'react-native'/);
    },
  );

  /**
   * And the ground component has no hole a bare `<Text>` could go through.
   *
   * The scan above stops a ground-painting module from writing text itself. This
   * stops it from accepting text: `GroundFieldProps` takes its content as data
   * and composes `MuseumCard`, so the words arrive on an opaque card by
   * construction. A `children` slot would undo both halves at once.
   */
  it('takes its cards as data rather than as children', () => {
    const body = readFileSync(resolve(APP_ROOT, 'src/ui/style-guide/ground-field.tsx'), 'utf8');
    const props = body.slice(
      body.indexOf('export interface GroundFieldProps'),
      body.indexOf('}', body.indexOf('export interface GroundFieldProps')),
    );
    expect(props, 'GroundField grew a children slot').not.toMatch(/\bchildren\b/);
    expect(props).toMatch(/cards: readonly GroundCard\[\]/);
    expect(body, 'the ground draws its own card rather than composing the museum card').toContain(
      '<MuseumCard',
    );
  });

  /**
   * The escape a source scan structurally cannot see: composition.
   *
   * `GroundField` renders a recall figure for every card directly on the mat. If
   * that figure is `RecallIndicator` — which is *total* over `RecallBand` — then
   * a `faint` or `unseen` band resolves to `RecallMeter`, three `<Text>` nodes,
   * on an era ground, with the scan above green because no `<Text>` appears in
   * the painting file. Reading a band off a projection is the stated reason
   * `RecallIndicator` exists, so this was not a hypothetical input.
   *
   * The guard is a type, and the proof is that the wrong band does not compile.
   * An unused `@ts-expect-error` is itself an error, so widening `GroundCard.band`
   * back to `RecallBand` fails `npm run typecheck` rather than failing here.
   */
  it('cannot be handed a band that would put the meter on a ground', () => {
    const ok: GroundCard = {
      written: '駅',
      reading: 'えき',
      caption: 'a station',
      catalogue: [],
      capability: 'reading',
      band: 'settled',
      standing: 'illustrative',
    };
    expect(ok.band).toBe('settled');

    // @ts-expect-error 'faint' resolves to the meter, which renders text
    const meterOnly: GroundCard = { ...ok, band: 'faint' };
    // @ts-expect-error and so does 'unseen'
    const noEvidence: GroundCard = { ...ok, band: 'unseen' };
    expect([meterOnly.band, noEvidence.band]).toEqual(['faint', 'unseen']);
  });

  it('draws the bare mark on the ground and keeps the meter on the card', () => {
    const body = readFileSync(resolve(APP_ROOT, 'src/ui/style-guide/ground-field.tsx'), 'utf8');
    const marks = body.slice(body.indexOf('styles.marks'), body.indexOf('styles.cards'));
    expect(marks, 'the marks row can still resolve to the meter').not.toContain('<RecallIndicator');
    expect(marks).toContain('<RecallMark');
    expect(body.slice(body.indexOf('<MuseumCard'))).toContain('<RecallMeter');
  });
});

/* ------------------------------------------------------------------ *
 * 6. Emitted light is rationed
 * ------------------------------------------------------------------ */

describe('emissive colour is capped and confined', () => {
  const signal = (kind: 'due-now' | 'branch-open' | 'evidence-stale') =>
    ({ kind, basis: 'the scheduler says so' }) as const;

  it('caps the number of lit points at a handful', () => {
    expect(MAX_EMISSIVE_POINTS).toBeGreaterThan(0);
    expect(MAX_EMISSIVE_POINTS).toBeLessThanOrEqual(3);
  });

  it('lights nothing outside the rail register', () => {
    for (const era of ERA_KEYS.filter((key) => key !== EMISSIVE_REGISTER)) {
      expect(() => planEmissive(era, [signal('due-now')])).toThrow(/only permitted/);
      // Asking for none is fine: an era with no signals is the normal case.
      expect(planEmissive(era, []).lit).toEqual([]);
    }
  });

  it('lights at most the cap, and hands back the ones it did not light', () => {
    const many = Array.from({ length: MAX_EMISSIVE_POINTS + 4 }, () => signal('branch-open'));
    const plan = planEmissive('tetsudo', many);
    expect(plan.lit).toHaveLength(MAX_EMISSIVE_POINTS);
    // The signals themselves, not a count: "reported, never hidden" is a promise
    // a surface can only keep if it can say *what* was turned down.
    expect(plan.suppressed).toHaveLength(4);
    expect(plan.suppressed.every((entry) => entry.basis === 'the scheduler says so')).toBe(true);
    for (const point of plan.lit) expect(point.pigment.emissive).toBe(true);
  });

  it('refuses a lit point with nothing true to say about itself', () => {
    expect(() => planEmissive('tetsudo', [{ kind: 'due-now', basis: '   ' }])).toThrow(/basis/);
  });

  /* ---------------------------------------------------------------- *
   * The lamp: one pigment, three forms, checked where it lands
   * ---------------------------------------------------------------- */

  /**
   * WCAG 1.4.1, for the one memory semantic that did not have it.
   *
   * `theme-tokens.test.ts` asserts a distinct dash pattern per edge state and a
   * distinct mark shape per recall band. The three emissive kinds had neither:
   * two of them mapped to the same pigment and every lit point was the same
   * 10×10 disc, so 'branch-open' and 'evidence-stale' were pixel-identical and
   * 'due-now' differed only in hue. This is that gap closed, in the same shape as
   * the two tests it sits beside.
   */
  it('gives each emissive signal kind a distinct form', () => {
    const shapes = EMISSIVE_SIGNAL_KINDS.map((kind) => EMISSIVE_MARKS[kind].shape);
    expect(new Set(shapes).size, 'two signal kinds share a form').toBe(shapes.length);
    for (const kind of EMISSIVE_SIGNAL_KINDS) {
      expect(EMISSIVE_MARKS[kind].label, `${kind} has no spoken label`).not.toBe('');
    }
    const labels = EMISSIVE_SIGNAL_KINDS.map((kind) => EMISSIVE_MARKS[kind].label);
    expect(new Set(labels).size, 'two signal kinds share a spoken label').toBe(labels.length);
  });

  /**
   * And the other half: hue must *not* vary with the kind.
   *
   * A distinct form is only worth having if the colour is not quietly doing the
   * same job with more authority. One lamp for every kind is what makes the
   * frozen §8 claim true of this module — there is no state → hue table left to
   * check, so the check is that every lit point comes out the same colour.
   */
  it('lights every kind in one pigment, so hue carries no state', () => {
    const plan = planEmissive(
      'tetsudo',
      EMISSIVE_SIGNAL_KINDS.map((kind) => signal(kind)),
    );
    expect(plan.lit).toHaveLength(EMISSIVE_SIGNAL_KINDS.length);
    expect(new Set(plan.lit.map((point) => String(point.pigment.hex))).size).toBe(1);
    for (const point of plan.lit) {
      expect(point.pigment).toBe(EMISSIVE_LAMP);
      expect(point.mark).toBe(EMISSIVE_MARKS[point.signal.kind]);
    }
    // The mapping that used to be here is gone, not renamed.
    const source = readFileSync(resolve(APP_ROOT, 'src/theme/ground.ts'), 'utf8');
    expect(source, 'a state → pigment table is back').not.toMatch(/EMISSIVE_ROLE\s*[:=]/);
  });

  /**
   * WCAG 1.4.11 for a pigment, which nothing checked before.
   *
   * `GROUND_CONTRAST_PAIRS` walks the semantic palette, so it says nothing about
   * a mineral pigment painted straight onto a field — and a lit point is exactly
   * that. 山吹 shipped at **1.578:1** on 鉄道's daylight field with the whole
   * suite green. This is the check that was missing; the visual-language doc
   * §5.1.2 says a token failing 3:1 on a reachable ground fails the build, and
   * this is what makes that true of the pigments as well as of the tokens.
   */
  it.each(
    GROUND_FIGURE_PIGMENTS.flatMap((entry) =>
      COLOR_SCHEMES.map(
        (scheme) => [`${entry.name} on ${entry.era}/${scheme}`, entry, scheme] as const,
      ),
    ),
  )('%s clears the non-text floor', (name, entry, scheme) => {
    const ground = groundOf(entry.era, scheme);
    const ratio = contrastRatio(entry.pigment.hex, ground.field);
    expect(ratio, `${name} is ${ratio.toFixed(3)}:1`).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('draws every lit point in a pigment that list covers', () => {
    const covered = new Set(GROUND_FIGURE_PIGMENTS.map((entry) => String(entry.pigment.hex)));
    const plan = planEmissive(
      'tetsudo',
      EMISSIVE_SIGNAL_KINDS.map((kind) => signal(kind)),
    );
    for (const point of plan.lit) {
      expect(covered, `${point.signal.kind} paints an unchecked pigment`).toContain(
        String(point.pigment.hex),
      );
    }
  });

  /**
   * The pigment that is declared and not painted, with its reason checked.
   *
   * 山吹 stays in `ERA_PIGMENTS` because §4.3 prints it and that table is a
   * transcription. It is not a lamp for a measured reason, and a recorded reason
   * that nothing verifies is just a comment — so the arithmetic in the reason is
   * asserted here. Every emissive pigment is in exactly one of the two lists, so
   * a new lamp cannot arrive unaccounted for in either direction.
   */
  it('accounts for every emissive pigment, painted or not', () => {
    const emissive = ERA_KEYS.flatMap((era) =>
      Object.values(ERA_PIGMENTS[era] as Readonly<Record<string, GroundPigment>>).filter(
        (entry) => entry.emissive,
      ),
    );
    const painted = GROUND_FIGURE_PIGMENTS.map((entry) => entry.pigment);
    const unlit = UNLIT_EMISSIVE_PIGMENTS.map((entry) => entry.pigment);
    expect(new Set([...painted, ...unlit]).size).toBe(emissive.length);
    for (const pigment of emissive) {
      const inPainted = painted.includes(pigment);
      const inUnlit = unlit.includes(pigment);
      expect(inPainted !== inUnlit, `${pigment.reading} is in both lists or in neither`).toBe(true);
    }
  });

  it.each(UNLIT_EMISSIVE_PIGMENTS.map((entry) => [entry.pigment.reading, entry] as const))(
    '%s is left unpainted for a reason that is still true',
    (name, entry) => {
      expect(entry.reason, `${name} is unpainted with no reason given`).not.toBe('');
      const worst = Math.min(
        ...COLOR_SCHEMES.map((scheme) =>
          contrastRatio(entry.pigment.hex, groundOf(entry.era, scheme).field),
        ),
      );
      // If it cleared everywhere, the reason on the entry would be false and the
      // pigment would have no business being excluded on contrast grounds.
      expect(worst, `${name} clears 3:1 everywhere; its recorded reason is stale`).toBeLessThan(
        AA_NON_TEXT,
      );
    },
  );

  it('records 山吹 at the ratio that took it off the lamp list', () => {
    const ratio = contrastRatio(
      ERA_PIGMENTS.tetsudo.platformLight.hex,
      groundOf('tetsudo', 'light').field,
    );
    expect(ratio).toBeCloseTo(1.578, 3);
    expect(EMISSIVE_LAMP).toBe(ERA_PIGMENTS.tetsudo.signal);
  });

  /* ---------------------------------------------------------------- *
   * The tally the page prints
   * ---------------------------------------------------------------- */

  /**
   * The count in a user-visible sentence has to be the count.
   *
   * The page said "{RAIL_SIGNALS.length} real signals were offered and
   * {MAX_EMISSIVE_POINTS} are lit", which is the *cap*, not the number lit. With
   * four signals and a cap of three the two agree by coincidence; with two
   * signals the sentence was simply false. `emissiveTally` computes both from the
   * same `planEmissive` the field renders from.
   */
  it('reports what was lit rather than what the cap is', () => {
    const two = emissiveTally('tetsudo', [signal('due-now'), signal('branch-open')]);
    expect(two.offered).toBe(2);
    expect(two.lit).toBe(2);
    expect(two.lit).not.toBe(MAX_EMISSIVE_POINTS);
    expect(two.suppressed).toEqual([]);

    const five = emissiveTally(
      'tetsudo',
      Array.from({ length: 5 }, () => signal('evidence-stale')),
    );
    expect(five.offered).toBe(5);
    expect(five.lit).toBe(MAX_EMISSIVE_POINTS);
    expect(five.suppressed).toHaveLength(2);
  });

  /**
   * The sentence itself, at tallies this page does not happen to produce.
   *
   * The old sentence was only accidentally true — four offered, cap of three. A
   * count in prose has to survive the inputs that would expose it, so the note is
   * a function and this is the case that used to lie.
   */
  it('writes a ration sentence that survives a tally under the cap', () => {
    const under = railRationNote(
      emissiveTally('tetsudo', [signal('due-now'), signal('branch-open')]),
    );
    expect(under).toContain('2 real signals were offered');
    expect(under).toContain('2 are lit');
    expect(under, 'the cap leaked back into the sentence').not.toContain('3 are lit');
    expect(under, 'nothing was suppressed but the sentence says something was').not.toMatch(
      /not, and/,
    );

    const over = railRationNote(
      emissiveTally(
        'tetsudo',
        Array.from({ length: 5 }, () => signal('evidence-stale')),
      ),
    );
    expect(over).toContain('5 real signals were offered');
    expect(over).toContain('3 are lit');
    expect(over).toContain('2 are not');
  });

  it('prints the page from the same plan the field renders', () => {
    expect(RAIL_TALLY.offered).toBe(RAIL_SIGNALS.length);
    expect(RAIL_TALLY.lit).toBe(planEmissive('tetsudo', RAIL_SIGNALS).lit.length);
    expect(RAIL_SUPPRESSED_BASES).toEqual(RAIL_TALLY.suppressed.map((entry) => entry.basis));
    expect(RAIL_RATION_NOTE).toBe(railRationNote(RAIL_TALLY));
    // …and every suppressed signal really does reach the page, by its own words.
    const page = readFileSync(resolve(APP_ROOT, 'src/ui/style-guide/style-guide-page.tsx'), 'utf8');
    expect(page).toContain('RAIL_SUPPRESSED_BASES');
    expect(page, 'the cap is being printed as a count again').not.toContain('MAX_EMISSIVE_POINTS');
    expect(RAIL_SUPPRESSED_BASES.length).toBeGreaterThan(0);
  });

  it('keeps the reader off the painting list, so a page may report the ration', () => {
    expect(GROUND_PAINTING_EXPORTS).not.toContain('emissiveTally');
    expect(GROUND_PAINTING_EXPORTS).not.toContain('EMISSIVE_MARKS');
  });

  /**
   * The list may not drift again, and this is why the previous version of the
   * test above could not stop it.
   *
   * That version named three exports by hand and checked those three. It was
   * therefore vacuous against the one that was missing: `MINERAL_RAMPS` is
   * re-exported through `src/ui/theme.ts` — the barrel every screen and every
   * Wave B lane imports — and its grades carry full-strength `GroundColor`
   * hexes. A verifier proved the hole by writing four lines that put text
   * directly on 群青 `#4C6CB3` with no card under it; the museum-card scan
   * treated the file as painting nothing, the no-hex-literal scan had nothing to
   * find, and lint, tsc and 992 tests all passed.
   *
   * So this derives the obligation instead of restating it: walk every value
   * `ground.ts` exports, and if a hex string is reachable from it, the name that
   * yields it must be bound by the scan. A hand-maintained list guarding against
   * hand-maintenance drift was always going to lose.
   *
   * Functions are unreachable this way and stay on the list explicitly — the
   * point of this test is the *data* exports, which is where the gap was.
   */
  it('binds every exported name from which a pigment is reachable', () => {
    const yieldsHex = (value: unknown, depth = 0): boolean => {
      if (depth > 6) return false;
      if (typeof value === 'string') return /^#[0-9a-f]{6}$/i.test(value);
      if (Array.isArray(value)) return value.some((entry) => yieldsHex(entry, depth + 1));
      if (value !== null && typeof value === 'object') {
        return Object.values(value).some((entry) => yieldsHex(entry, depth + 1));
      }
      return false;
    };

    const unbound = Object.entries(groundModule)
      .filter(([name, value]) => yieldsHex(value) && !GROUND_PAINTING_EXPORTS.includes(name))
      .map(([name]) => name);

    expect(
      unbound,
      `these exports yield a pigment but are not on GROUND_PAINTING_EXPORTS, so a file ` +
        `using them paints an era ground while the museum-card scan sees nothing: ` +
        unbound.join(', '),
    ).toEqual([]);
  });

  it('declares emissive pigments only in the rail register, and only two', () => {
    for (const era of ERA_KEYS) {
      const emissive = Object.values(
        ERA_PIGMENTS[era] as Readonly<Record<string, GroundPigment>>,
      ).filter((entry) => entry.emissive);
      if (era === EMISSIVE_REGISTER) {
        expect(emissive.length).toBeGreaterThan(0);
        expect(emissive.length).toBeLessThanOrEqual(MAX_EMISSIVE_POINTS);
      } else {
        expect(emissive, `${era} declares emitted light`).toEqual([]);
      }
    }
  });

  /**
   * The declaration has to be consistent with the pigments it points at.
   *
   * "Emissive" cannot be computed from a hex — a signal lamp and a red-lead post
   * are both saturated red — so it is declared. What *can* be checked is that
   * the declaration is not arbitrary: every pigment marked as emitted light must
   * be brighter and more saturated than every pigment that is not.
   *
   * The margin is thin on purpose and worth knowing about: 銀朱 ginshu at 0.553
   * clears 縹 hanada at 0.518 by 0.035 on S×V. That is a real ordering fact
   * about these two pigments, and a new register whose loudest colour landed
   * between them would fail here — which is the correct outcome, because it
   * would mean the register had acquired something that reads as a lamp.
   */
  it('marks as emitted light exactly the pigments that read as light', () => {
    const saturationTimesValue = (hex: string): number => {
      const { r, g, b } = parseHexColor(hex);
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      return max === 0 ? 0 : ((max - min) / max) * max;
    };
    const all = ERA_KEYS.flatMap((era) =>
      Object.values(ERA_PIGMENTS[era] as Readonly<Record<string, GroundPigment>>),
    );
    const lit = all
      .filter((entry) => entry.emissive)
      .map((entry) => saturationTimesValue(entry.hex));
    const unlit = all
      .filter((entry) => !entry.emissive)
      .map((entry) => saturationTimesValue(entry.hex));
    expect(Math.min(...lit)).toBeGreaterThan(Math.max(...unlit));
  });
});

/* ------------------------------------------------------------------ *
 * 7. A ramp is one mineral, coarse to fine
 * ------------------------------------------------------------------ */

describe('ground ramps come from one pigment', () => {
  /** HSV hue in degrees, saturation in [0, 1]. */
  const hsv = (hex: string): { hue: number; saturation: number } => {
    const { r, g, b } = parseHexColor(hex);
    const [rr, gg, bb] = [r / 255, g / 255, b / 255];
    const max = Math.max(rr, gg, bb);
    const min = Math.min(rr, gg, bb);
    const delta = max - min;
    let hue = 0;
    if (delta !== 0) {
      if (max === rr) hue = 60 * (((gg - bb) / delta) % 6);
      else if (max === gg) hue = 60 * ((bb - rr) / delta + 2);
      else hue = 60 * ((rr - gg) / delta + 4);
    }
    return { hue: hue < 0 ? hue + 360 : hue, saturation: max === 0 ? 0 : delta / max };
  };

  it('declares at least one ramp', () => {
    expect(MINERAL_RAMPS.length).toBeGreaterThan(0);
  });

  it.each(MINERAL_RAMPS.map((ramp) => [ramp.mineral, ramp] as const))(
    '%s runs coarse to fine',
    (name, ramp) => {
      expect(ramp.grades.length).toBeGreaterThanOrEqual(2);
      for (let index = 1; index < ramp.grades.length; index += 1) {
        const coarser = ramp.grades[index - 1];
        const finer = ramp.grades[index];
        if (coarser === undefined || finer === undefined) throw new Error('ramp has a hole');
        // Finer grind scatters more light: paler…
        expect(
          relativeLuminance(finer.hex),
          `${name}: ${finer.reading} is not paler than ${coarser.reading}`,
        ).toBeGreaterThan(relativeLuminance(coarser.hex));
        // …and chalkier.
        expect(
          hsv(finer.hex).saturation,
          `${name}: ${finer.reading} is not chalkier than ${coarser.reading}`,
        ).toBeLessThan(hsv(coarser.hex).saturation);
      }
    },
  );

  it.each(MINERAL_RAMPS.map((ramp) => [ramp.mineral, ramp] as const))(
    '%s never leaves its own hue family',
    (name, ramp) => {
      const [low, high] = ramp.hueBand;
      for (const grade of ramp.grades) {
        const { hue } = hsv(grade.hex);
        expect(hue, `${name}: ${grade.reading} at ${hue.toFixed(1)}°`).toBeGreaterThanOrEqual(low);
        expect(hue, `${name}: ${grade.reading} at ${hue.toFixed(1)}°`).toBeLessThanOrEqual(high);
      }
    },
  );

  it('takes both grades of a ramp from the era register that uses them', () => {
    for (const ramp of MINERAL_RAMPS) {
      const register = Object.values(
        ERA_PIGMENTS[ramp.era] as Readonly<Record<string, GroundPigment>>,
      );
      for (const grade of ramp.grades) {
        expect(register, `${ramp.mineral}: ${grade.reading} is not in ${ramp.era}`).toContain(
          grade,
        );
      }
    }
  });
});
