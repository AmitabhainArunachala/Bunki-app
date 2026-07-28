/**
 * The nihonga ground layer — era, atmosphere, and the road under the learner's
 * feet (Campaign E, lane A1′).
 *
 * ## What this module is, and what it deliberately is not
 *
 * `color.ts` beside this one is the **figure**: a three-channel semantic system
 * where hue is the learner's attention, luminance is recall strength, and form
 * is fragility. Every one of its rules stands, unchanged. This module is the
 * **ground**: the era register a surface is set in, drawn from the sourced 日本画
 * palette in `docs/design/BUNKI_VISUAL_LANGUAGE_NIHONGA_2026-07-28.md` §2 and §4.
 *
 * The two layers never do each other's job, and that is the whole reconciliation
 * with the frozen §8 "one vermilion accent" rule. That rule was never a ban on
 * colour — it was the ban on **encoding learner state in hue**, which is the
 * Todaii global-JLPT-rainbow failure the frozen spec rejects by name.
 *
 * ## What this file says about the learner — exactly, because the earlier
 * ## version of this paragraph said "nothing", and that was false
 *
 * The **ground** says nothing about anyone's memory: `ERA_REGISTERS`,
 * `ERA_PIGMENTS`, `GROUND_SPECS`, every stack and every mat change with the era
 * layer, the route and the hour, and with nothing else. A malachite hillside is
 * not a claim about anyone's recall of 山.
 *
 * One thing here does touch learner state, and the honest move is to name it
 * rather than to let a flat denial stand over it. `planEmissive` takes scheduler
 * and evidence states — due now, a repair branch open after a stumble, evidence
 * old enough to doubt — and decides which of them get a lit point. It lives in
 * this file because the **ration** is a property of the register: only 鉄道 has
 * lamps, and only three at a time, and a cap declared away from the register it
 * caps is a cap nobody applies.
 *
 * A lit point is therefore a **figure** element drawn in a ground pigment, which
 * is the one place in the app where the two layers touch. What it does not do is
 * the thing §8 bans:
 *
 *   - **Hue encodes nothing.** All three signal kinds are painted in the same
 *     pigment, `EMISSIVE_LAMP`. There is no state → colour table; there used to
 *     be one and it is gone.
 *   - **Form is what distinguishes them.** `EMISSIVE_MARKS` gives each kind its
 *     own shape, the way `EDGE_PATTERNS` and `RECALL_BAND_MARKS` do for the
 *     other memory semantics — the WCAG 1.4.1 obligation lane A1 accepted for
 *     every one of them, now accepted for this one too.
 *   - **The lamp is contrast-checked where it lands.** `GROUND_FIGURE_PIGMENTS`
 *     is the list of ground pigments this layer paints as figure, and
 *     `test/theme-ground.test.ts` walks it against every field of its own
 *     register at 3:1. That is why the lamp is 銀朱 and not 山吹: 山吹 is
 *     1.58:1 on the 鉄道 daylight field, and `UNLIT_EMISSIVE_PIGMENTS` records
 *     that as a measurement rather than as a preference.
 *
 * ## What the brands do and do not bind
 *
 * `GroundColor` (here) and `SemanticColor` (`color.ts`) are branded, so they are
 * both usable as CSS colour strings and mutually non-assignable.
 * `test/theme-ground.test.ts` proves it with `@ts-expect-error` blocks, which
 * fail `npm run typecheck` if the mistake ever becomes legal.
 *
 * The brand binds **at every signature that names it** — `paletteValue`,
 * `surfaceOf`, `figurePaletteOn`, `eraPigment`, `superpose`. It does **not** bind
 * a React Native `style` prop, which the framework types as `string`: a component
 * really can write `backgroundColor: ERA_PIGMENTS.kodo.mist.hex` on any node it
 * likes and the compiler will not stop it. What stops that is not the type, it is
 * that the only names which yield a pigment are on `GROUND_PAINTING_EXPORTS`, and
 * every file naming one of those is bound by the museum-card scan. The type is a
 * guard on the accessors; the scan is the guard on the pixels. Neither is a
 * substitute for the other and this file no longer claims either one is.
 *
 * `GroundContrastPair.minimum` has exactly one member, `'nonText'`. The system
 * has no way to *declare* text sitting on an era ground, because text never does
 * — it sits on a 胡粉/墨 card floating over it.
 *
 * ## Depth is superposition, because that is what the material does
 *
 * 岩絵具 iwa-enogu is ground mineral bound in 膠 nikawa and laid in translucent
 * layers; colour is built by stacking veils, not mixed on a palette. So a ground
 * here is a **stack**, not a hex: an opaque base pigment, an atmospheric wash
 * over it, and a 胡粉/墨 **mat** — the mount every figure element sits on.
 * `superpose` composites the stack in sRGB, and `EraGround.field` is the result.
 * There are no drop shadows and no glows anywhere in this layer;
 * `test/theme-tokens.test.ts` scans for them.
 *
 * The mat is the load-bearing part, and it is the museum-card rule doing double
 * duty as a contrast guarantee. A figure mark on a full-strength era ground would
 * fail WCAG 1.4.11 on most of these pigments — 群青 and 鳥の子 were chosen by
 * Edo dyers, not for a 3:1 obligation. The mat is what makes the guarantee true,
 * and `GROUND_CONTRAST_PAIRS` × six grounds is what checks it.
 *
 * ## Ramps come from one pigment, not five hues
 *
 * `MINERAL_RAMPS` records the two ramps this palette actually contains: azurite
 * 群青 → 白群 and malachite 緑青 → 白緑, each *coarse to finest grind* rather
 * than dark-to-light on a tint slider. Both already have a job in the era
 * registers — they are the near/far pair of the rail layer and of the mountain
 * road — so the ramp is atmospheric depth, which is what a single mineral's
 * grades are for. Hue is **not** held constant across a ramp, and holding it
 * constant would be the wrong test: finely ground azurite really does shift
 * blue-green (see the visual-language doc §1). What is held is the direction of
 * travel — paler and less saturated as the grind gets finer — inside one hue
 * band.
 *
 * ## Every value here is transcribed, not chosen
 *
 * Hex values come from the chart in the design document, which took them from
 * the NIPPON COLORS set. They are not adjusted. The only numbers this module
 * chooses are the **wash and mat alphas**, which are not in any chart; they were
 * picked so that every figure token clears 3:1 on every ground in both schemes,
 * and the test is what holds them there.
 */

import { COLOR_SCHEMES, PALETTES, type ColorSchemeName, type Palette } from './color.ts';

/* ------------------------------------------------------------------ *
 * The brand
 * ------------------------------------------------------------------ */

declare const GROUND_BRAND: unique symbol;

/**
 * A colour belonging to the ground layer.
 *
 * A `string` at runtime — it goes straight into a style prop — and a distinct
 * type at compile time, so the two layers cannot be crossed by accident. The
 * brand is phantom: `groundHex` is the only way to make one, and it is not
 * exported, so a `GroundColor` can only come from this module's own tables.
 */
export type GroundColor = string & { readonly [GROUND_BRAND]: 'ground' };

const groundHex = (hex: string): GroundColor => hex as GroundColor;

/* ------------------------------------------------------------------ *
 * The three era registers
 * ------------------------------------------------------------------ */

export const ERA_KEYS = ['kodo', 'kaido', 'tetsudo'] as const;
export type EraKey = (typeof ERA_KEYS)[number];

/**
 * What an era register *is*, as a reader would say it.
 *
 * The strata come from `docs/design/BUNKI_THE_MAP_AS_VOYAGE_THROUGH_TIME_2026-07-28.md`
 * §2. This is metadata about the language's history, not about any learner: it
 * is safe for a screen to render and it never becomes a claim about knowledge.
 */
export interface EraRegister {
  readonly key: EraKey;
  /** 古道 — how it is written. */
  readonly written: string;
  /** kodo — how it is read. */
  readonly reading: string;
  /** "the ancient road" — one line, in English. */
  readonly gloss: string;
  /** The period the layer belongs to. */
  readonly period: string;
  /** The stratum of the language this layer carries. */
  readonly stratum: string;
}

export const ERA_REGISTERS: Readonly<Record<EraKey, EraRegister>> = {
  kodo: {
    key: 'kodo',
    written: '古道',
    reading: 'kodō',
    gloss: 'the ancient road',
    period: 'Nara / Heian → medieval',
    stratum:
      'Kumano Kodō and the Shikoku pilgrimage: 訓読み, native vocabulary, the first Chinese imports, Buddhist vocabulary.',
  },
  kaido: {
    key: 'kaido',
    written: '街道',
    reading: 'kaidō',
    gloss: 'the Edo highway',
    period: 'Edo',
    stratum:
      'The 五街道 out of Nihonbashi, 宿場 towns and 一里塚 markers: 漢語 in daily use, trade and craft, the vocabulary of travel.',
  },
  tetsudo: {
    key: 'tetsudo',
    written: '鉄道',
    reading: 'tetsudō',
    gloss: 'the rail era',
    period: 'Meiji → now',
    stratum:
      'Rail laid over the old roads: 和製漢語 Meiji coinages, katakana loans, signage, contemporary registers.',
  },
};

/* ------------------------------------------------------------------ *
 * The pigments
 * ------------------------------------------------------------------ */

/**
 * One mineral pigment, with the name it is actually called by.
 *
 * The Japanese name and reading travel with the hex on purpose. A surface that
 * shows a ground should be able to say *which* pigment it is showing without
 * looking anything up, and a reviewer checking a value against the chart should
 * not have to guess which row it came from.
 */
export interface GroundPigment {
  /** 藍海松茶 — the traditional name. */
  readonly written: string;
  /** ai-mirucha — its reading. */
  readonly reading: string;
  readonly hex: GroundColor;
  /**
   * Whether this pigment reads as *emitted* light rather than as reflected
   * pigment — a signal lamp, a platform light. Declared rather than computed:
   * you cannot tell a lamp from a red-lead post by looking at a hex value, and
   * pretending otherwise would put 鉛丹 on the Edo highway into the same class
   * as a signal. `test/theme-ground.test.ts` checks that the declaration is at
   * least *consistent* with the pigments — every emissive one is brighter and
   * more saturated than every non-emissive one.
   */
  readonly emissive: boolean;
}

const pigment = (
  written: string,
  reading: string,
  hex: string,
  emissive = false,
): GroundPigment => ({ written, reading, hex: groundHex(hex), emissive });

/**
 * The era registers' own pigment sets — visual-language doc §4, transcribed.
 *
 * Role names are the document's own ("mist", "structure", "far light"), so a
 * reader can put this table beside §4 and check it line by line. Each era has
 * its own role names because the eras are not three tints of one thing: an Edo
 * highway has a sky and a post, a rail viaduct has concrete and a signal.
 */
export const ERA_PIGMENTS = {
  kodo: {
    /** 4.1 "ground" — the deep register, used as the dark scheme's base. */
    ground: pigment('藍海松茶', 'ai-mirucha', '#0F4C3A'),
    /** 4.1 "ground (light)" — the light scheme's base. */
    groundLight: pigment('鳥の子', 'torinoko', '#DAC9A6'),
    /** Coarse malachite. The near end of the mountain-road depth ramp. */
    mid: pigment('緑青', 'rokushō', '#24936E'),
    /** Finest malachite. The far end — cedar dissolving into fog. */
    mist: pigment('白緑', 'byakuroku', '#A8D8B9'),
    earth: pigment('黄土', 'ōdo', '#B68E55'),
    deep: pigment('千歳緑', 'chitose-midori', '#36563C'),
    ink: pigment('墨', 'sumi', '#1C1C1C'),
  },
  kaido: {
    skyUpper: pigment('縹', 'hanada', '#006284'),
    skyLower: pigment('瓶覗', 'kamenozoki', '#A5DEE4'),
    ground: pigment('砥粉', 'tonoko', '#D7B98E'),
    structure: pigment('弁柄', 'bengara', '#9A5034'),
    accent: pigment('鉛丹', 'entan', '#D75455'),
    snow: pigment('胡粉', 'gofun', '#FFFFFB'),
    ink: pigment('檳榔子染', 'binrōjizome', '#3A3226'),
  },
  tetsudo: {
    nightGround: pigment('褐', 'kachi', '#08192D'),
    structure: pigment('消炭', 'keshizumi', '#434343'),
    concrete: pigment('素鼠', 'sunezumi', '#787D7B'),
    /** Coarse azurite. The near end of the rail depth ramp. */
    railBlue: pigment('群青', 'gunjō', '#4C6CB3'),
    signal: pigment('銀朱', 'ginshu', '#C73E3A', true),
    platformLight: pigment('山吹', 'yamabuki', '#FFB11B', true),
    /** Finest azurite. The far end — a light down the line. */
    farLight: pigment('白群', 'byakugun', '#78C2C4'),
  },
} satisfies Readonly<Record<EraKey, Readonly<Record<string, GroundPigment>>>>;

export type EraRole<E extends EraKey> = keyof (typeof ERA_PIGMENTS)[E];

/**
 * Read one pigment out of an era register.
 *
 * Throws on an unknown role rather than returning `undefined`, for the reason
 * `paletteValue` does: a silent `undefined` in a colour slot is a transparent
 * element, which is the failure mode hardest to see in a screenshot.
 */
export function eraPigment<E extends EraKey>(era: E, role: EraRole<E>): GroundPigment {
  const table = ERA_PIGMENTS[era] as Readonly<Record<string, GroundPigment | undefined>>;
  const found = table[role as string];
  if (found === undefined) {
    throw new Error(`'${String(role)}' is not a role in the ${era} register`);
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * Superposition
 * ------------------------------------------------------------------ */

/** One translucent veil in a ground stack. */
export interface GroundWash {
  readonly pigment: GroundPigment;
  /** `1` for the opaque base; strictly between 0 and `MAX_MAT_ALPHA` above it. */
  readonly alpha: number;
}

/**
 * A wash may never be so opaque that it has replaced the pigment under it.
 *
 * Without a ceiling, "superposition" degenerates into painting the ground out
 * and calling the result a layer stack — which is exactly how a nihonga ground
 * would stop being one. 0.9 leaves a tenth of what is beneath showing at the
 * most-covered step, which is `tetsudo/light`: concrete under a heavy 胡粉 mat.
 */
export const MAX_MAT_ALPHA = 0.9;

const HEX = /^#[0-9a-f]{6}$/i;

function channels(hex: string): readonly [number, number, number] {
  if (!HEX.test(hex)) throw new Error(`'${hex}' is not a #rrggbb ground colour`);
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toHex(rgb: readonly [number, number, number]): GroundColor {
  return groundHex(
    `#${rgb
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`,
  );
}

/**
 * Composite a stack of washes, bottom first, in sRGB.
 *
 * Straight `source-over` on non-premultiplied channels — the same arithmetic a
 * browser does for a stack of translucent `View`s, which is what a surface
 * actually paints. That correspondence is the point: `EraGround.field` is only
 * an honest prediction of what a mark lands on if the renderer stacks the same
 * layers with the same alphas, so `groundLayers()` hands out the very list this
 * function consumed.
 *
 * Deliberately *not* a perceptual or linear-light blend. A browser blends in
 * sRGB, so blending in linear light here would make the computed field disagree
 * with the pixels.
 */
export function superpose(stack: readonly GroundWash[]): GroundColor {
  const first = stack[0];
  if (first === undefined) throw new Error('a ground stack needs at least one layer');
  if (first.alpha !== 1) throw new Error('the bottom of a ground stack must be opaque');
  let acc = channels(first.pigment.hex);
  for (const wash of stack.slice(1)) {
    if (!(wash.alpha > 0 && wash.alpha < 1)) {
      throw new Error(`a wash alpha must be strictly between 0 and 1, got ${wash.alpha}`);
    }
    const top = channels(wash.pigment.hex);
    acc = [0, 1, 2].map((i) =>
      Math.round((top[i] ?? 0) * wash.alpha + (acc[i] ?? 0) * (1 - wash.alpha)),
    ) as unknown as readonly [number, number, number];
  }
  return toHex(acc);
}

/* ------------------------------------------------------------------ *
 * Luminance bands
 * ------------------------------------------------------------------ */

export const GROUND_BANDS = ['deep', 'dusk', 'pale'] as const;
export type GroundBand = (typeof GROUND_BANDS)[number];

/**
 * The window each band claims, in WCAG relative luminance.
 *
 * Declared here and checked against the arithmetic in `test/theme-ground.test.ts`,
 * so "this ground is deep" is a measurement rather than an adjective. The bands
 * are what a surface lane asks when it wants to know how much light a register
 * has before deciding what to draw on it.
 */
export const GROUND_BAND_WINDOWS: Readonly<Record<GroundBand, { min: number; max: number }>> = {
  deep: { min: 0, max: 0.1 },
  dusk: { min: 0.1, max: 0.45 },
  pale: { min: 0.45, max: 1 },
};

/* ------------------------------------------------------------------ *
 * The six grounds
 * ------------------------------------------------------------------ */

/**
 * A resolved era ground: the stack, what it composites to, and which semantic
 * palette a figure resolves to on it.
 */
export interface EraGround {
  readonly era: EraKey;
  readonly scheme: ColorSchemeName;
  /** Bottom-up. `[0]` is opaque; everything above it is a wash. */
  readonly layers: readonly GroundWash[];
  /** The 胡粉/墨 mount that every figure element sits on. */
  readonly mat: GroundWash;
  /** `superpose(layers)` — the era at full strength, with nothing on it. */
  readonly ground: GroundColor;
  /** `superpose([...layers, mat])` — what a figure mark actually lands on. */
  readonly field: GroundColor;
  /** Declared; checked against the measured luminance of `ground`. */
  readonly band: GroundBand;
  /**
   * Which palette a figure resolves to **on this ground**.
   *
   * This is the sentence "the semantic ramp resolves against the active ground"
   * made into a value. It is declared, and checked against `field`: a ground
   * whose field is dark takes the dark ramp, where presence is light, whatever
   * scheme the rest of the app is in.
   */
  readonly figureScheme: ColorSchemeName;
}

interface GroundSpec {
  readonly base: GroundPigment;
  readonly wash: GroundPigment;
  readonly washAlpha: number;
  readonly mat: GroundPigment;
  readonly matAlpha: number;
  readonly band: GroundBand;
  readonly figureScheme: ColorSchemeName;
}

/**
 * The declarations, one per era × scheme.
 *
 * Each scheme is a *reading of the era*, not an inversion of the other one: the
 * light scheme is the register by day and the dark scheme is the register at
 * night, and both take their pigments from that register's own row in §4.
 *
 * Two of the six rows use a pigment outside its §4 role, and they are called out
 * rather than quietly repurposed. §4 gives no dark ground for 街道 and no light
 * ground for 鉄道 — the chart has a daytime highway and a night railway, which
 * is historically apt and computationally incomplete. So:
 *
 *   - `kaido/dark` takes 檳榔子染 binrōjizome, the register's own ink, as its
 *     base. The Edo highway after dark is its own ink.
 *   - `tetsudo/light` takes 素鼠 sunezumi, the register's concrete, as its base.
 *     A viaduct by day is concrete.
 *
 * Both are values from that register's own table, used at the far end of their
 * own tonal range. Nothing was invented and nothing was adjusted.
 */
const GROUND_SPECS: Readonly<Record<EraKey, Readonly<Record<ColorSchemeName, GroundSpec>>>> = {
  kodo: {
    light: {
      base: ERA_PIGMENTS.kodo.groundLight,
      wash: ERA_PIGMENTS.kodo.mist,
      washAlpha: 0.3,
      mat: ERA_PIGMENTS.kaido.snow,
      matAlpha: 0.7,
      band: 'pale',
      figureScheme: 'light',
    },
    dark: {
      base: ERA_PIGMENTS.kodo.ground,
      wash: ERA_PIGMENTS.kodo.deep,
      washAlpha: 0.3,
      mat: ERA_PIGMENTS.kodo.ink,
      matAlpha: 0.82,
      band: 'deep',
      figureScheme: 'dark',
    },
  },
  kaido: {
    light: {
      base: ERA_PIGMENTS.kaido.ground,
      wash: ERA_PIGMENTS.kaido.skyLower,
      washAlpha: 0.3,
      mat: ERA_PIGMENTS.kaido.snow,
      matAlpha: 0.72,
      band: 'pale',
      figureScheme: 'light',
    },
    dark: {
      base: ERA_PIGMENTS.kaido.ink,
      wash: ERA_PIGMENTS.kaido.skyUpper,
      washAlpha: 0.3,
      mat: ERA_PIGMENTS.kodo.ink,
      matAlpha: 0.8,
      band: 'deep',
      figureScheme: 'dark',
    },
  },
  tetsudo: {
    light: {
      base: ERA_PIGMENTS.tetsudo.concrete,
      wash: ERA_PIGMENTS.tetsudo.farLight,
      washAlpha: 0.3,
      mat: ERA_PIGMENTS.kaido.snow,
      matAlpha: 0.86,
      band: 'dusk',
      figureScheme: 'light',
    },
    dark: {
      base: ERA_PIGMENTS.tetsudo.nightGround,
      wash: ERA_PIGMENTS.tetsudo.structure,
      washAlpha: 0.3,
      mat: ERA_PIGMENTS.kodo.ink,
      matAlpha: 0.35,
      band: 'deep',
      figureScheme: 'dark',
    },
  },
};

function resolve(era: EraKey, scheme: ColorSchemeName): EraGround {
  const spec = GROUND_SPECS[era][scheme];
  const layers: readonly GroundWash[] = [
    { pigment: spec.base, alpha: 1 },
    { pigment: spec.wash, alpha: spec.washAlpha },
  ];
  const mat: GroundWash = { pigment: spec.mat, alpha: spec.matAlpha };
  return {
    era,
    scheme,
    layers,
    mat,
    ground: superpose(layers),
    field: superpose([...layers, mat]),
    band: spec.band,
    figureScheme: spec.figureScheme,
  };
}

export const GROUNDS: Readonly<Record<EraKey, Readonly<Record<ColorSchemeName, EraGround>>>> =
  Object.fromEntries(
    ERA_KEYS.map((era) => [
      era,
      Object.fromEntries(COLOR_SCHEMES.map((scheme) => [scheme, resolve(era, scheme)])),
    ]),
  ) as Readonly<Record<EraKey, Readonly<Record<ColorSchemeName, EraGround>>>>;

export function groundOf(era: EraKey, scheme: ColorSchemeName): EraGround {
  return GROUNDS[era][scheme];
}

/**
 * The exact layer list a surface must paint to get `EraGround.field`.
 *
 * Handed out rather than described, because `field` is only an honest claim
 * about what a mark lands on if the renderer stacks these very layers with these
 * very alphas. `test/theme-ground.test.ts` asserts `superpose(groundLayers(g))`
 * is `g.field`, so the two cannot drift.
 */
export function groundLayers(ground: EraGround): readonly GroundWash[] {
  return [...ground.layers, ground.mat];
}

/**
 * The semantic palette to resolve figure tokens against, on this ground.
 *
 * Not `PALETTES[theme.scheme]`: the ramp resolves against the ground it lands
 * on. Today those agree for all six grounds; the day an era ground is dark in
 * the light scheme, this is the seam that keeps the marks legible, and the test
 * that ties `figureScheme` to the measured field luminance is what keeps this
 * from being a comment.
 */
export function figurePaletteOn(ground: EraGround): Palette {
  return PALETTES[ground.figureScheme];
}

/* ------------------------------------------------------------------ *
 * The museum-card rule, as a rule about modules
 * ------------------------------------------------------------------ */

/**
 * The exports that put an era pigment on screen.
 *
 * **Any module that imports one of these may not render text.** That is the
 * museum-card rule — "a kanji page should feel like a museum card, not a
 * spreadsheet row", and text never sits on an era ground — stated as something
 * a scan can check across every file in the app, now and in Wave B.
 * `test/theme-ground.test.ts` walks `src/` and `app/` and fails any file that
 * imports one of these names *and* contains a `<Text>` tag or a `Text` import.
 *
 * The rule works because text does not need the exemption. A ground-painting
 * module composes `MuseumCard` and `RubyText`, which render the text
 * themselves and know nothing about grounds — so the words arrive on an opaque
 * card whose contrast the ground cannot touch, which is precisely the
 * guarantee. `src/ui/style-guide/ground-field.tsx` is the worked example.
 *
 * **A source scan cannot see through composition, and the worked example proved
 * it.** `GroundField` renders a `RecallIndicator` for every card straight onto
 * the mat, and `RecallIndicator` is *total* over `RecallBand` — handed one of the
 * two meter-only bands it resolves to `RecallMeter`, which renders three `<Text>`
 * nodes. So a band read off a projection could put a capability label, a band
 * word and a basis line directly on an era ground with the scan green, because
 * no `<Text>` appears in the painting file. The scan is not what closes that; a
 * type is. `GroundCard.band` is `StandaloneRecallBand`, and `GroundField` draws
 * `RecallMark`, which takes only that — so the meter cannot be reached from a
 * ground at all, and the mistake is a compile error rather than a screenshot.
 *
 * Names that only *read* the ground — `ERA_REGISTERS`, `figurePaletteOn`,
 * `MAX_EMISSIVE_POINTS`, `emissiveTally`, `EMISSIVE_MARKS`, the types — are
 * deliberately absent. A page that wants to name the three eras in prose, or to
 * report how many signals the ration turned down, is not painting anything, and
 * binding it would make the rule an obstacle rather than a guarantee.
 *
 * The scan reads **identifiers in the file body**, not import statements. It used
 * to read `import { … } from '…'` braces only, which meant
 * `import * as tokens from '../theme.ts'` followed by `tokens.groundOf(...)`
 * painted an era ground while the file was treated as painting nothing — and a
 * dynamic `await import(...)` escaped the same way. Both are caught now: the
 * accessor has to be *named* somewhere to be called.
 */
export const GROUND_PAINTING_EXPORTS: readonly string[] = [
  'GROUNDS',
  'groundOf',
  'groundLayers',
  'eraPigment',
  'ERA_PIGMENTS',
  'planEmissive',
  'superpose',
  'EMISSIVE_LAMP',
  'GROUND_FIGURE_PIGMENTS',
  'UNLIT_EMISSIVE_PIGMENTS',
];

/* ------------------------------------------------------------------ *
 * What must clear on a ground
 * ------------------------------------------------------------------ */

/**
 * A figure token that lands directly on a ground, and the floor it must clear.
 *
 * `minimum` has exactly one member. That is the museum-card rule expressed as a
 * type: **text never sits on an era ground**, so there is no way to declare that
 * it does. A lane that tried to register a 4.5:1 text-on-ground pair would not
 * get a failing test, it would get a type error — which is the right place for a
 * rule that has no legitimate exception.
 */
export interface GroundContrastPair {
  readonly name: string;
  /** A `CONTRAST_PAIRS` token path, resolved through `figurePaletteOn`. */
  readonly figure: string;
  readonly minimum: 'nonText';
}

/**
 * Everything the figure layer draws straight onto a ground.
 *
 * This is the list the visual-language doc §5.1 asks for — "a token that fails
 * 3:1 or 4.5:1 on any reachable ground fails the build" — and it is checked
 * against all six grounds rather than against one paper and one card. The two
 * meter-only recall steps are absent for the same reason they are absent from
 * `CONTRAST_PAIRS`: they may only be drawn inside the bounded, labelled meter,
 * which lives on a card and never on a ground.
 */
export const GROUND_CONTRAST_PAIRS: readonly GroundContrastPair[] = [
  { name: 'map node: emerging', figure: 'recall.emerging', minimum: 'nonText' },
  { name: 'map node: settled', figure: 'recall.settled', minimum: 'nonText' },
  { name: 'map node: durable', figure: 'recall.durable', minimum: 'nonText' },
  { name: 'fragile edge', figure: 'fragileEdge', minimum: 'nonText' },
  { name: 'uncertain edge', figure: 'uncertainEdge', minimum: 'nonText' },
  { name: 'control border', figure: 'ruleStrong', minimum: 'nonText' },
  { name: 'focus ring', figure: 'focusRing', minimum: 'nonText' },
  { name: 'the one accent', figure: 'vermilion', minimum: 'nonText' },
  { name: 'frontier mark', figure: 'frontierMark', minimum: 'nonText' },
];

/* ------------------------------------------------------------------ *
 * The emissive cap
 * ------------------------------------------------------------------ */

/**
 * How many emitted-light points one `planEmissive` call may light.
 *
 * "Emissive light is rationed: a handful of saturated points against a deep
 * ground, never a glowing interface" — the visual-language doc §3.3, which is
 * *Akira*'s discipline rather than its reputation. Three is the handful. Past
 * that the register stops being a night scene with signals in it and becomes a
 * dashboard.
 *
 * **Per plan, not per screen, and the difference is real.** This docblock used to
 * say "on screen at once", which `planEmissive` cannot enforce: it is a pure
 * function over one signal list, so two `GroundField`s side by side put six lit
 * points on one screen with every check green. Making the cap per-screen would
 * need a mount-time registry that throws or warns from render, which is exactly
 * the trap this lane removed from `RecallMark` — so the honest thing is the
 * narrower guarantee, stated here and disclosed in the capsule rather than
 * asserted wider than it holds. One field, one ration.
 */
export const MAX_EMISSIVE_POINTS = 3;

/** The only register where emitted light is permitted (doc §4.3). */
export const EMISSIVE_REGISTER: EraKey = 'tetsudo';

/**
 * The states that may light a signal.
 *
 * A closed set, and every one of them is a real scheduler or evidence state that
 * the domain already computes. "Only for real signals" is not enforceable
 * against a free-form string, so the kind is a union and the basis is required
 * and must be non-empty: a lit point always has something true it can say about
 * itself.
 */
export const EMISSIVE_SIGNAL_KINDS = ['due-now', 'branch-open', 'evidence-stale'] as const;
export type EmissiveSignalKind = (typeof EMISSIVE_SIGNAL_KINDS)[number];

export interface EmissiveSignal {
  readonly kind: EmissiveSignalKind;
  /** Where it came from, in the learner's words. Never empty. */
  readonly basis: string;
}

/**
 * The one pigment every lit point is painted in.
 *
 * A single lamp, not a lamp per state, and that is the load-bearing part. The
 * first version of this module mapped each signal kind to a pigment — 山吹 for
 * due-now, 銀朱 for the other two — which was a **state → hue** table, the exact
 * shape frozen §8 bans, and which left two of the three kinds pixel-identical
 * anyway. One lamp fixes both halves at once: hue now says only "a signal is
 * lit here", which is presence rather than state, and `EMISSIVE_MARKS` carries
 * which signal it is.
 *
 * 銀朱 rather than 山吹 for a measured reason. A lit point is drawn on the mat,
 * so the colour it must clear WCAG 1.4.11 against is `EraGround.field`. Of the
 * two emissive pigments in §4.3, 銀朱 clears on both fields of its own register
 * (4.37:1 by day, 3.16:1 at night) and 山吹 does not (1.58:1 by day). See
 * `UNLIT_EMISSIVE_PIGMENTS`.
 */
export const EMISSIVE_LAMP: GroundPigment = ERA_PIGMENTS.tetsudo.signal;

/**
 * The form each signal kind takes. Hue is shared; this is what tells them apart.
 *
 * The same obligation `EDGE_PATTERNS` and `RECALL_BAND_MARKS` discharge for the
 * other memory semantics — WCAG 1.4.1, no meaning by colour alone — and the same
 * shape of answer, so a reader who knows those two knows this one.
 * `test/theme-ground.test.ts` asserts the three forms are distinct, exactly as
 * `test/theme-tokens.test.ts` does for bands and edges.
 *
 * The forms are rail vocabulary rather than decoration:
 *
 *   - `disc` — a lamp that is simply on. Due now.
 *   - `bar` — a semaphore blade, the arm that says the road ahead has a choice
 *     in it. A repair branch is open.
 *   - `ring` — a lamp with its middle out. The evidence is old enough to doubt,
 *     which is the same "absence rather than weakness" that gives `unseen` an
 *     open ring in `RECALL_BAND_MARKS`.
 *
 * `label` travels with the shape because a screen reader cannot see either the
 * hue or the form: it is spoken before the basis, so the kind is carried in all
 * three channels rather than in one.
 */
export const EMISSIVE_MARKS = {
  'due-now': { shape: 'disc', label: 'Due now' },
  'branch-open': { shape: 'bar', label: 'Branch open' },
  'evidence-stale': { shape: 'ring', label: 'Evidence stale' },
} as const satisfies Readonly<
  Record<EmissiveSignalKind, { readonly shape: string; readonly label: string }>
>;

export type EmissiveMark = (typeof EMISSIVE_MARKS)[EmissiveSignalKind];
export type EmissiveShape = EmissiveMark['shape'];

export interface LitPoint {
  readonly signal: EmissiveSignal;
  /** Always `EMISSIVE_LAMP`. Carried on the point so a surface cannot pick. */
  readonly pigment: GroundPigment;
  /** The form to draw it as. The only channel that varies with the kind. */
  readonly mark: EmissiveMark;
}

export interface EmissivePlan {
  readonly lit: readonly LitPoint[];
  /**
   * The real signals the ration would not light.
   *
   * The signals themselves rather than a count, because "reported, never hidden"
   * is a claim a count cannot support: a surface holding the number 1 can say
   * "and one more" but cannot say *what*. Holding the signals, it can print
   * every basis, which is what `style-guide-page.tsx` does.
   */
  readonly suppressed: readonly EmissiveSignal[];
}

/**
 * Decide which signals get to be lit points.
 *
 * Throws — rather than silently drawing nothing — when a caller asks for emitted
 * light outside the rail register, because that is a design error at the call
 * site and a silent no-op would hide it until someone looked at a screenshot.
 * Over the cap it does *not* throw: real signals past the third come back in
 * `suppressed` so a surface can name them instead of pretending they are not
 * there.
 */
export function planEmissive(era: EraKey, signals: readonly EmissiveSignal[]): EmissivePlan {
  if (era !== EMISSIVE_REGISTER && signals.length > 0) {
    throw new Error(
      `emitted light is only permitted in the ${EMISSIVE_REGISTER} register; ${era} asked for ${signals.length}`,
    );
  }
  for (const signal of signals) {
    if (signal.basis.trim() === '') {
      throw new Error(`a lit point needs a basis: '${signal.kind}' gave none`);
    }
  }
  const lit = signals.slice(0, MAX_EMISSIVE_POINTS).map((signal) => ({
    signal,
    pigment: EMISSIVE_LAMP,
    mark: EMISSIVE_MARKS[signal.kind],
  }));
  return { lit, suppressed: signals.slice(lit.length) };
}

/**
 * What a plan came to, in numbers a surface may print.
 *
 * A *reader*, deliberately: it hands back counts and the caller's own signals,
 * never a pigment, so it is not on `GROUND_PAINTING_EXPORTS` and a page that
 * reports the ration is not thereby banned from rendering text. That seam is the
 * whole reason this function exists — `style-guide-page.tsx` used to print
 * `MAX_EMISSIVE_POINTS` as though it were the number of points actually lit,
 * which is a user-visible sentence asserting a count the code never computed.
 * With four signals and a cap of three the two agree by luck; with two signals
 * the page said "3 are lit" over two lit points.
 */
export interface EmissiveTally {
  /** How many real signals were offered. */
  readonly offered: number;
  /** How many were lit. Never larger than `MAX_EMISSIVE_POINTS`. */
  readonly lit: number;
  /** The ones the ration turned down, so a surface can report each of them. */
  readonly suppressed: readonly EmissiveSignal[];
}

export function emissiveTally(era: EraKey, signals: readonly EmissiveSignal[]): EmissiveTally {
  const plan = planEmissive(era, signals);
  return { offered: signals.length, lit: plan.lit.length, suppressed: plan.suppressed };
}

/* ------------------------------------------------------------------ *
 * Ground pigments that land on a ground as figure
 * ------------------------------------------------------------------ */

/**
 * A ground pigment this layer paints as a **figure** element, and the register
 * whose fields it has to clear 3:1 against.
 *
 * `GROUND_CONTRAST_PAIRS` walks the semantic palette, which was the whole of the
 * obligation while the only things drawn on a ground came from `color.ts`. A lit
 * point does not: it is a mineral pigment carrying meaning, painted straight onto
 * a field, and nothing checked it. `test/theme-ground.test.ts` now walks this
 * list against every field of its own register at `AA_NON_TEXT`, so a pigment
 * that cannot be seen where it is drawn fails the build the way §5.1.2 says it
 * should.
 */
export interface GroundFigurePigment {
  readonly name: string;
  readonly era: EraKey;
  readonly pigment: GroundPigment;
}

export const GROUND_FIGURE_PIGMENTS: readonly GroundFigurePigment[] = [
  { name: 'the signal lamp', era: EMISSIVE_REGISTER, pigment: EMISSIVE_LAMP },
];

/**
 * Emissive pigments that are declared and never painted as figure, with the
 * reason recorded as a number rather than as a preference.
 *
 * 山吹 stays in `ERA_PIGMENTS` because §4.3 prints it and this table is a
 * transcription, not a use-list. It is not a lamp because it cannot be seen as
 * one on half the register: 1.58:1 against 鉄道's daylight field. The test
 * checks the reason as well as the entry — if a later change made 山吹 clear,
 * this row would be wrong and the suite says so.
 */
export interface UnlitEmissivePigment {
  readonly pigment: GroundPigment;
  readonly era: EraKey;
  readonly reason: string;
}

export const UNLIT_EMISSIVE_PIGMENTS: readonly UnlitEmissivePigment[] = [
  {
    pigment: ERA_PIGMENTS.tetsudo.platformLight,
    era: 'tetsudo',
    reason:
      '山吹 is 1.58:1 against the 鉄道 daylight field, far below the 3:1 a meaningful graphic owes WCAG 1.4.11, so it is scenery in this register and never a signal.',
  },
];

/* ------------------------------------------------------------------ *
 * One pigment, coarse to fine
 * ------------------------------------------------------------------ */

export interface MineralRamp {
  /** 群青 → 白群. */
  readonly mineral: string;
  readonly era: EraKey;
  /** Coarsest grind first, finest last. Two grades, because the chart names two. */
  readonly grades: readonly GroundPigment[];
  /**
   * The hue window, in degrees, the whole ramp stays inside.
   *
   * Wide on purpose. Fine-ground azurite genuinely shifts toward blue-green, so
   * pinning hue would be asserting something false about the mineral; what the
   * ramp must not do is *leave its family*, and a band is how that is said.
   */
  readonly hueBand: readonly [number, number];
}

/**
 * The ramps this palette actually contains, and the job each one already has.
 *
 * Both are `coarse → finest grind` on a single mineral, which is the one honest
 * way to build a ramp out of 岩絵具: particle size is what changes, and vivid-
 * and-dark to pale-and-chalky is a physical consequence, not a tint slider. Both
 * are also already load-bearing in their era register — the near and far ends of
 * an atmospheric depth ramp — so this is a description of the palette rather
 * than an addition to it.
 *
 * Two grades each, not five, because the source chart names two grades of each
 * mineral. Interpolating three more would be exactly the tint slider the method
 * rejects, and would put invented hex values in a table whose whole claim is
 * that it is transcribed.
 */
export const MINERAL_RAMPS: readonly MineralRamp[] = [
  {
    mineral: '群青 → 白群 (azurite)',
    era: 'tetsudo',
    grades: [ERA_PIGMENTS.tetsudo.railBlue, ERA_PIGMENTS.tetsudo.farLight],
    hueBand: [170, 250],
  },
  {
    mineral: '緑青 → 白緑 (malachite)',
    era: 'kodo',
    grades: [ERA_PIGMENTS.kodo.mid, ERA_PIGMENTS.kodo.mist],
    hueBand: [100, 180],
  },
];
