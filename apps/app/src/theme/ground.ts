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
 * Todaii global-JLPT-rainbow failure the frozen spec rejects by name. Nothing in
 * this file encodes learner state. A malachite hillside is not a claim about
 * anyone's recall of 山.
 *
 * The separation is enforced by the compiler rather than by this paragraph:
 *
 *   - `GroundColor` (here) and `SemanticColor` (`color.ts`) are branded, so they
 *     are both usable as CSS colour strings and mutually non-assignable. A
 *     component cannot pass a ground where a semantic token is required, or the
 *     reverse. `test/theme-ground.test.ts` proves it with `@ts-expect-error`
 *     blocks, which fail `npm run typecheck` if the mistake ever becomes legal.
 *   - `GroundContrastPair.minimum` has exactly one member, `'nonText'`. The
 *     system has no way to *declare* text sitting on an era ground, because text
 *     never does — it sits on a 胡粉/墨 card floating over it.
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
 * Names that only *read* the ground — `ERA_REGISTERS`, `figurePaletteOn`,
 * `MAX_EMISSIVE_POINTS`, the types — are deliberately absent. A page that wants
 * to name the three eras in prose is not painting anything, and binding it
 * would make the rule an obstacle rather than a guarantee.
 */
export const GROUND_PAINTING_EXPORTS: readonly string[] = [
  'GROUNDS',
  'groundOf',
  'groundLayers',
  'eraPigment',
  'ERA_PIGMENTS',
  'planEmissive',
  'superpose',
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
 * How many emitted-light points may be on screen at once.
 *
 * "Emissive light is rationed: a handful of saturated points against a deep
 * ground, never a glowing interface" — the visual-language doc §3.3, which is
 * *Akira*'s discipline rather than its reputation. Three is the handful. Past
 * that the register stops being a night scene with signals in it and becomes a
 * dashboard.
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

export interface LitPoint {
  readonly signal: EmissiveSignal;
  readonly pigment: GroundPigment;
}

export interface EmissivePlan {
  readonly lit: readonly LitPoint[];
  /** How many real signals were not lit because of the cap. Never hidden. */
  readonly suppressed: number;
}

/** Which lamp a state lights. Declared, so a state cannot invent a new colour. */
const EMISSIVE_ROLE: Readonly<Record<EmissiveSignalKind, 'signal' | 'platformLight'>> = {
  'due-now': 'platformLight',
  'branch-open': 'signal',
  'evidence-stale': 'signal',
};

/**
 * Decide which signals get to be lit points.
 *
 * Throws — rather than silently drawing nothing — when a caller asks for emitted
 * light outside the rail register, because that is a design error at the call
 * site and a silent no-op would hide it until someone looked at a screenshot.
 * Over the cap it does *not* throw: real signals past the third are reported as
 * `suppressed` so a surface can say "and 4 more" instead of pretending they are
 * not there.
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
    pigment: ERA_PIGMENTS.tetsudo[EMISSIVE_ROLE[signal.kind]],
  }));
  return { lit, suppressed: Math.max(0, signals.length - lit.length) };
}

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
