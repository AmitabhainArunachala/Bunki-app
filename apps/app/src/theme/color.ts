/**
 * Colour tokens — ink, paper, one vermilion, and the memory-state channel
 * (REQ-UI-08, REQ-UI-07, REQ-LM-03).
 *
 * ## The rule this file exists to keep
 *
 * REQ-UI-08 asks for an ink-and-paper palette with **one** vermilion accent and
 * bans global-JLPT rainbow highlighting. REQ-UI-07 asks the map never to
 * collapse reading/meaning/listening/production/writing into one mastery light,
 * and to keep strength, fragility, uncertainty and coverage distinguishable.
 * Those two requirements pull in opposite directions if — and only if — you try
 * to say everything with hue. So this palette says almost nothing with hue.
 *
 * Three channels carry meaning, and each carries exactly one thing:
 *
 *   1. **Hue — the learner's own attention.** Vermilion, and vermilion only,
 *      marks what the learner is doing or being pointed at: the primary action,
 *      the focus ring, the quiet frontier mark under a word on their edge.
 *      Adding a second hue would be the rainbow, so there is no second hue.
 *   2. **Luminance — recall strength.** How present a mark is against the paper
 *      *is* how well the thing behind it is currently recalled. That is the
 *      operator's "node brightness IS the number" made literal: `RECALL_RAMP`
 *      is a five-step neutral ramp, and a dim node is dim because the projection
 *      says so.
 *   3. **Form — fragility, uncertainty, and absence of evidence.** A dashed
 *      edge, a dotted edge, an open ring. These carry no hue at all, which is
 *      what lets them sit on top of a strength value without fighting it, and
 *      what keeps them legible to a learner who cannot distinguish the ramp.
 *
 * The last point is also a WCAG 1.4.1 obligation: none of the three memory
 * semantics is encoded by colour alone. `EDGE_PATTERNS` beside the colours is
 * the non-colour half, and `test/theme-tokens.test.ts` asserts every memory
 * token has one.
 *
 * ## Why these tokens are not the accent
 *
 * Strength, fragility and uncertainty are *states of the record*, not calls to
 * action. Painting them vermilion would overload the one hue the design has, and
 * would make a page of ordinary words look like a page of alarms — the Todaii
 * failure the frozen spec §10.4 rejects by name. They get their own tokens, in
 * their own channel, and none of them is `vermilion`.
 *
 * ## Neutrals with a bias
 *
 * Paper is warm (a red-ward, yellow-ward bias, like unbleached washi) and ink is
 * warm-black rather than #000 — sumi, not printer toner. In dark, the bias
 * flips slightly cool so the surface reads as ink-wash on a dark ground rather
 * than as an inverted document. Both are deliberate and both are bounded: the
 * contrast test asserts the channel spread stays inside neutral territory, so a
 * "bias" can never quietly become a second brand colour.
 */

export const COLOR_SCHEMES = ['light', 'dark'] as const;
export type ColorSchemeName = (typeof COLOR_SCHEMES)[number];

/**
 * The five steps of the recall ramp.
 *
 * Named rather than numbered because a number invites arithmetic across
 * capabilities, and averaging reading recall with production recall is exactly
 * the global scalar REQ-LM-03 forbids. A band is a description of one contract's
 * current state; it does not add up with anything.
 *
 * `unseen` is not "weak": it is the absence of evidence, which is why it is the
 * faintest step *and* carries an open-ring mark rather than a filled one.
 */
export const RECALL_BANDS = ['unseen', 'faint', 'emerging', 'settled', 'durable'] as const;
export type RecallBand = (typeof RECALL_BANDS)[number];

export interface RecallRamp {
  readonly unseen: string;
  readonly faint: string;
  readonly emerging: string;
  readonly settled: string;
  readonly durable: string;
}

export interface Palette {
  /** Page background. Paper, not white. */
  readonly paper: string;
  /** Raised surfaces: cards, result rows, the reading surface. */
  readonly raised: string;
  /** A surface set *into* the page rather than above it: quoted passages, wells. */
  readonly sunken: string;
  /** Primary text. Sumi ink, not black. */
  readonly ink: string;
  /** Secondary text: labels, provenance, metadata. Still AA on paper. */
  readonly inkMuted: string;
  /** Tertiary text: ruby, timestamps, the quietest legible layer. AA on paper. */
  readonly inkFaint: string;
  /** Decorative hairline only. Never the boundary of an interactive control. */
  readonly rule: string;
  /** Boundary of interactive controls and meaningful graphics (AA non-text, 3:1). */
  readonly ruleStrong: string;
  /** The one accent (REQ-UI-08). Adding a second colour token is a spec violation. */
  readonly vermilion: string;
  /** A tint of the same accent, for accent-on-tint fills. */
  readonly vermilionSoft: string;
  /** The quiet personal-frontier mark. A vermilion tint, never a new hue. */
  readonly frontierMark: string;
  /** Keyboard focus ring. The accent again — one accent means one ring. */
  readonly focusRing: string;
  /** Recall strength as luminance. Never a second hue; never summed across capabilities. */
  readonly recall: RecallRamp;
  /** A fragile record's edge. Neutral, and always paired with a dashed pattern. */
  readonly fragileEdge: string;
  /** An unmeasured record's edge. Neutral, and always paired with a dotted pattern. */
  readonly uncertainEdge: string;
  /** Wash behind an unmeasured region: presence without a claim. */
  readonly uncertainWash: string;
}

/**
 * Light: unbleached paper, sumi ink, a vermilion that is a seal rather than a
 * warning light.
 */
const LIGHT: Palette = {
  paper: '#FBF8F3',
  raised: '#FFFDF8',
  sunken: '#F3EEE4',
  ink: '#1B1917',
  inkMuted: '#57514A',
  inkFaint: '#6E675E',
  rule: '#D8D0C2',
  ruleStrong: '#8C8375',
  vermilion: '#A6301A',
  vermilionSoft: '#F3E2DC',
  frontierMark: '#A6301A',
  focusRing: '#A6301A',
  recall: {
    unseen: '#C3BBAC',
    faint: '#A69E8F',
    emerging: '#867D6E',
    settled: '#5C554B',
    durable: '#2A2723',
  },
  fragileEdge: '#7E7466',
  uncertainEdge: '#8B8175',
  uncertainWash: '#EFEADF',
};

/**
 * Dark, designed rather than inverted.
 *
 * The ground is a warm near-black with a green-ward drift, which reads as ink
 * settling into paper instead of as a switched-off screen; the ramp runs the
 * other way (dim → luminous) because on a dark ground *presence is light*. The
 * vermilion lightens, because a #A6301A seal on a dark ground is a smudge, and
 * because the accent has to keep 4.5:1 against paper in both schemes.
 */
const DARK: Palette = {
  paper: '#15130F',
  raised: '#1E1B16',
  sunken: '#100E0B',
  ink: '#F2EDE3',
  inkMuted: '#B3AA9B',
  inkFaint: '#9C9384',
  rule: '#3A342B',
  ruleStrong: '#7C7364',
  vermilion: '#E8836A',
  vermilionSoft: '#33211C',
  frontierMark: '#E8836A',
  focusRing: '#E8836A',
  recall: {
    unseen: '#4A443A',
    faint: '#6A6355',
    emerging: '#8C8576',
    settled: '#B5ADA0',
    durable: '#EDE7DC',
  },
  fragileEdge: '#8D857A',
  uncertainEdge: '#776F61',
  uncertainWash: '#221F1A',
};

export const PALETTES: Readonly<Record<ColorSchemeName, Palette>> = { light: LIGHT, dark: DARK };

/**
 * The non-colour half of every memory semantic (WCAG 1.4.1).
 *
 * Dash arrays in points, for `strokeDasharray` on an SVG edge or a border on a
 * view. `solid` is the empty array. A component that renders one of the three
 * memory states must take its pattern from here as well as its colour, and
 * `test/theme-tokens.test.ts` checks that each state has a distinct one — two
 * states sharing a pattern would be back to colour-only.
 */
export const EDGE_PATTERNS = {
  /** A measured, currently-held record. */
  solid: [] as readonly number[],
  /** Fragile: measured, and the projection says it is slipping. */
  fragile: [4, 3] as readonly number[],
  /** Uncertain: no measurement, or one too old to stand behind. */
  uncertain: [1, 3] as readonly number[],
} as const;

export type EdgePatternName = keyof typeof EDGE_PATTERNS;

/**
 * Which bands may be drawn as a bare mark, and which may not (WCAG 1.4.11).
 *
 * The operator's brief is that a dim node is dim — "due items literally dim" —
 * and a step that has been lifted to 3:1 against paper is not dim. So the ramp
 * keeps its faint end, and the constraint is honoured by *where* the faint end
 * is allowed to appear rather than by flattening it:
 *
 *   - `standalone: true` — the step clears 3:1 against both paper and card in
 *     both schemes, so it may be a bare node on a map with nothing around it.
 *   - `standalone: false` — the step does not, so it may only appear as the fill
 *     of a component that supplies its own identifiable boundary (`ruleStrong`,
 *     which does clear 3:1) and its own text label. That is the meter case,
 *     where the graphic conveying the value is the track-and-fill pair rather
 *     than the fill on its own.
 *
 * `test/theme-tokens.test.ts` checks both halves: that every `standalone: true`
 * step really does clear 3:1 everywhere it can be drawn, and that the two that
 * do not are used by no component other than the bounded, labelled meter.
 */
export const RECALL_BAND_MARKS: Readonly<
  Record<RecallBand, { readonly standalone: boolean; readonly shape: string }>
> = {
  unseen: { standalone: false, shape: 'ring' },
  faint: { standalone: false, shape: 'ring-thick' },
  emerging: { standalone: true, shape: 'half' },
  settled: { standalone: true, shape: 'disc' },
  durable: { standalone: true, shape: 'disc-ring' },
};

/**
 * Foreground/background pairs the app actually renders, named so the contrast
 * test can walk them. A pair that is not listed here is a pair nothing checked;
 * adding a new colour combination to a screen means adding it here too.
 *
 * `recall.*` entries are declared at the `nonText` minimum because the ramp
 * paints marks — a node, a bar segment, a rule — and never body copy. The two
 * strongest steps are also checked as text, since a headword may be tinted by
 * its own band. Only the three `standalone` steps appear here; the other two are
 * meter fills, and `RECALL_BAND_MARKS` above says why that is the whole of the
 * obligation for them.
 */
export const CONTRAST_PAIRS: readonly {
  readonly name: string;
  readonly foreground: string;
  readonly background: string;
  readonly minimum: 'text' | 'largeText' | 'nonText';
}[] = [
  { name: 'body text on paper', foreground: 'ink', background: 'paper', minimum: 'text' },
  { name: 'body text on card', foreground: 'ink', background: 'raised', minimum: 'text' },
  { name: 'body text in a well', foreground: 'ink', background: 'sunken', minimum: 'text' },
  { name: 'metadata on paper', foreground: 'inkMuted', background: 'paper', minimum: 'text' },
  { name: 'metadata on card', foreground: 'inkMuted', background: 'raised', minimum: 'text' },
  { name: 'metadata in a well', foreground: 'inkMuted', background: 'sunken', minimum: 'text' },
  { name: 'faint text on paper', foreground: 'inkFaint', background: 'paper', minimum: 'text' },
  { name: 'faint text on card', foreground: 'inkFaint', background: 'raised', minimum: 'text' },
  { name: 'accent text on paper', foreground: 'vermilion', background: 'paper', minimum: 'text' },
  { name: 'accent text on card', foreground: 'vermilion', background: 'raised', minimum: 'text' },
  {
    name: 'accent text on accent tint',
    foreground: 'vermilion',
    background: 'vermilionSoft',
    minimum: 'text',
  },
  {
    name: 'body text on accent tint',
    foreground: 'ink',
    background: 'vermilionSoft',
    minimum: 'text',
  },
  {
    name: 'primary button label on accent fill',
    foreground: 'paper',
    background: 'vermilion',
    minimum: 'text',
  },
  {
    name: 'control border on paper',
    foreground: 'ruleStrong',
    background: 'paper',
    minimum: 'nonText',
  },
  {
    name: 'control border on card',
    foreground: 'ruleStrong',
    background: 'raised',
    minimum: 'nonText',
  },
  { name: 'focus ring on paper', foreground: 'focusRing', background: 'paper', minimum: 'nonText' },
  { name: 'focus ring on card', foreground: 'focusRing', background: 'raised', minimum: 'nonText' },
  {
    name: 'frontier mark on card',
    foreground: 'frontierMark',
    background: 'raised',
    minimum: 'nonText',
  },
  {
    name: 'stroke ink on reading surface',
    foreground: 'ink',
    background: 'raised',
    minimum: 'nonText',
  },
  {
    name: 'recall mark: emerging on paper',
    foreground: 'recall.emerging',
    background: 'paper',
    minimum: 'nonText',
  },
  {
    name: 'recall mark: settled on paper',
    foreground: 'recall.settled',
    background: 'paper',
    minimum: 'nonText',
  },
  {
    name: 'recall mark: durable on paper',
    foreground: 'recall.durable',
    background: 'paper',
    minimum: 'nonText',
  },
  {
    name: 'recall mark: settled on card',
    foreground: 'recall.settled',
    background: 'raised',
    minimum: 'nonText',
  },
  {
    name: 'recall label: settled as text on paper',
    foreground: 'recall.settled',
    background: 'paper',
    minimum: 'text',
  },
  {
    name: 'recall label: durable as text on paper',
    foreground: 'recall.durable',
    background: 'paper',
    minimum: 'text',
  },
  {
    name: 'fragile edge on card',
    foreground: 'fragileEdge',
    background: 'raised',
    minimum: 'nonText',
  },
  {
    name: 'fragile edge on paper',
    foreground: 'fragileEdge',
    background: 'paper',
    minimum: 'nonText',
  },
  {
    name: 'uncertain edge on card',
    foreground: 'uncertainEdge',
    background: 'raised',
    minimum: 'nonText',
  },
  {
    name: 'uncertain edge on uncertain wash',
    foreground: 'uncertainEdge',
    background: 'uncertainWash',
    minimum: 'nonText',
  },
  {
    name: 'metadata on uncertain wash',
    foreground: 'inkMuted',
    background: 'uncertainWash',
    minimum: 'text',
  },
];

/**
 * Read a `CONTRAST_PAIRS` token path — `'ink'` or `'recall.settled'` — off a
 * palette.
 *
 * The ramp is nested because it is one idea with five steps rather than five
 * unrelated colours, and the contrast test still has to reach every leaf. This
 * is the one place that flattening happens, so nothing else has to know the
 * shape.
 */
export function paletteValue(palette: Palette, path: string): string {
  const [head, tail] = path.split('.');
  if (head === 'recall') {
    if (tail === undefined) throw new Error(`'${path}' names the ramp, not a step`);
    const step = RECALL_BANDS.find((band) => band === tail);
    if (step === undefined) throw new Error(`'${tail}' is not a recall band`);
    return palette.recall[step];
  }
  if (tail !== undefined) throw new Error(`'${path}' is not a nested palette token`);
  const value = (palette as unknown as Record<string, unknown>)[head ?? ''];
  if (typeof value !== 'string') throw new Error(`'${path}' is not a palette colour`);
  return value;
}

/** Every leaf colour in a palette, flattened. Used by the "no stray hue" tests. */
export function paletteLeaves(palette: Palette): readonly { path: string; value: string }[] {
  const out: { path: string; value: string }[] = [];
  for (const [key, value] of Object.entries(palette)) {
    if (typeof value === 'string') out.push({ path: key, value });
    else if (value !== null && typeof value === 'object') {
      for (const [step, nested] of Object.entries(value as Record<string, string>)) {
        out.push({ path: `${key}.${step}`, value: nested });
      }
    }
  }
  return out;
}
