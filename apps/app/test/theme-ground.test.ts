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
 * Five other properties are checked here because each of them is a claim the
 * module's docblocks make and none of them would otherwise be true of anything
 * but the prose:
 *
 *   1. the two colour layers cannot be crossed (a compile-time proof, below);
 *   2. every hex is the value the sourced chart gives, character for character;
 *   3. the declared luminance bands match the arithmetic;
 *   4. emitted light is capped and confined to the rail register;
 *   5. a mineral ramp really is one mineral, coarse to fine.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

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
  EMISSIVE_REGISTER,
  GROUNDS,
  GROUND_BAND_WINDOWS,
  GROUND_CONTRAST_PAIRS,
  GROUND_PAINTING_EXPORTS,
  MAX_EMISSIVE_POINTS,
  MAX_MAT_ALPHA,
  MINERAL_RAMPS,
  PALETTES,
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
   * Which files put a pigment on screen, read from their import statements.
   *
   * A file is bound by the rule when it imports one of `GROUND_PAINTING_EXPORTS`
   * from anywhere — the ground module, `src/theme`, or the `@/ui/theme` barrel
   * every screen already uses. Reading the *binding names* rather than the
   * module path is what makes the barrel a convenience instead of a loophole:
   * `import { groundOf } from '@/ui/theme'` is caught exactly as
   * `import { groundOf } from '../theme/ground.ts'` is.
   */
  const paintsAGround = (body: string): readonly string[] => {
    const imports = body.match(/import\s+(?:type\s+)?\{[^}]*\}\s+from\s+'[^']+'/g) ?? [];
    const named = new Set<string>();
    for (const statement of imports) {
      const inner = statement.slice(statement.indexOf('{') + 1, statement.lastIndexOf('}'));
      for (const raw of inner.split(',')) {
        const name =
          raw
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0]
            ?.trim() ?? '';
        // A type-only binding is erased and paints nothing.
        if (name !== '' && !raw.trim().startsWith('type ')) named.add(name);
      }
    }
    return GROUND_PAINTING_EXPORTS.filter((name) => named.has(name));
  };

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
      expect(stripped, `${name} renders <Text> while painting ${painted.join(', ')}`).not.toMatch(
        /<Text[\s/>]/,
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

  it('lights at most the cap, and says how many it suppressed', () => {
    const many = Array.from({ length: MAX_EMISSIVE_POINTS + 4 }, () => signal('branch-open'));
    const plan = planEmissive('tetsudo', many);
    expect(plan.lit).toHaveLength(MAX_EMISSIVE_POINTS);
    expect(plan.suppressed).toBe(4);
    for (const point of plan.lit) expect(point.pigment.emissive).toBe(true);
  });

  it('refuses a lit point with nothing true to say about itself', () => {
    expect(() => planEmissive('tetsudo', [{ kind: 'due-now', basis: '   ' }])).toThrow(/basis/);
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
