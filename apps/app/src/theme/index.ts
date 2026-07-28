/**
 * The design system's one entry point.
 *
 * Everything a surface needs — colour, type, space, motion — resolves through
 * `Theme`, and `Theme` is produced from a scheme name and nothing else. That is
 * the shape that makes "components never branch on theme" enforceable rather
 * than aspirational: a component that wants a dark-mode value asks the theme for
 * the token, and the theme is the only thing that knows which scheme is on.
 * `test/theme-tokens.test.ts` scans for the failure mode directly — a
 * `scheme === 'dark'` test, or a hex literal, inside a component.
 *
 * The token modules beside this one are pure data with no React and no
 * `react-native` import, so the unit-test runner reads them as data. Anything
 * that needs a renderer lives in `src/ui/`.
 */

import {
  CONTRAST_PAIRS,
  COLOR_SCHEMES,
  EDGE_PATTERNS,
  PALETTES,
  RECALL_BANDS,
  RECALL_BAND_MARKS,
  isStandaloneRecallBand,
  paletteLeaves,
  paletteValue,
  type ColorSchemeName,
  type EdgePatternName,
  type MeterOnlyRecallBand,
  type Palette,
  type RecallBand,
  type RecallRamp,
  type SemanticColor,
  type StandaloneRecallBand,
} from './color.ts';
import {
  EMISSIVE_REGISTER,
  EMISSIVE_SIGNAL_KINDS,
  ERA_KEYS,
  ERA_PIGMENTS,
  ERA_REGISTERS,
  GROUNDS,
  GROUND_BANDS,
  GROUND_BAND_WINDOWS,
  GROUND_CONTRAST_PAIRS,
  GROUND_PAINTING_EXPORTS,
  MAX_EMISSIVE_POINTS,
  MAX_MAT_ALPHA,
  MINERAL_RAMPS,
  eraPigment,
  figurePaletteOn,
  groundLayers,
  groundOf,
  planEmissive,
  superpose,
  type EmissivePlan,
  type EmissiveSignal,
  type EmissiveSignalKind,
  type EraGround,
  type EraKey,
  type EraRegister,
  type EraRole,
  type GroundBand,
  type GroundColor,
  type GroundContrastPair,
  type GroundPigment,
  type GroundWash,
  type LitPoint,
  type MineralRamp,
} from './ground.ts';
import {
  ELEVATION,
  HAIRLINE,
  MIN_TOUCH_TARGET,
  RADIUS,
  SPACE,
  type ElevationName,
  type RadiusName,
  type SpaceName,
} from './layout.ts';
import {
  DURATION,
  EASING,
  MIN_UNLIT_OPACITY,
  resolveDuration,
  strokeSequenceDuration,
  type DurationName,
  type EasingName,
} from './motion.ts';
import {
  FONT_STACKS,
  LEADING,
  MEASURE,
  SELF_HOSTED_FACES,
  TRACKING,
  TYPE,
  VERTICAL,
  type SelfHostedFace,
  type TypeSizeName,
} from './typography.ts';

export {
  COLOR_SCHEMES,
  CONTRAST_PAIRS,
  DURATION,
  EASING,
  EDGE_PATTERNS,
  ELEVATION,
  EMISSIVE_REGISTER,
  EMISSIVE_SIGNAL_KINDS,
  ERA_KEYS,
  ERA_PIGMENTS,
  ERA_REGISTERS,
  FONT_STACKS,
  GROUNDS,
  GROUND_BANDS,
  GROUND_BAND_WINDOWS,
  GROUND_CONTRAST_PAIRS,
  GROUND_PAINTING_EXPORTS,
  HAIRLINE,
  LEADING,
  MAX_EMISSIVE_POINTS,
  MAX_MAT_ALPHA,
  MEASURE,
  MINERAL_RAMPS,
  MIN_TOUCH_TARGET,
  MIN_UNLIT_OPACITY,
  PALETTES,
  RADIUS,
  RECALL_BANDS,
  RECALL_BAND_MARKS,
  SELF_HOSTED_FACES,
  SPACE,
  TRACKING,
  TYPE,
  VERTICAL,
  eraPigment,
  figurePaletteOn,
  groundLayers,
  groundOf,
  isStandaloneRecallBand,
  paletteLeaves,
  paletteValue,
  planEmissive,
  resolveDuration,
  strokeSequenceDuration,
  superpose,
};
export type {
  ColorSchemeName,
  DurationName,
  EasingName,
  EdgePatternName,
  ElevationName,
  EmissivePlan,
  EmissiveSignal,
  EmissiveSignalKind,
  EraGround,
  EraKey,
  EraRegister,
  EraRole,
  GroundBand,
  GroundColor,
  GroundContrastPair,
  GroundPigment,
  GroundWash,
  LitPoint,
  MeterOnlyRecallBand,
  MineralRamp,
  Palette,
  RadiusName,
  RecallBand,
  RecallRamp,
  SelfHostedFace,
  SemanticColor,
  SpaceName,
  StandaloneRecallBand,
  TypeSizeName,
};

export interface Theme {
  readonly scheme: ColorSchemeName;
  readonly color: Palette;
  readonly font: typeof FONT_STACKS;
  readonly space: typeof SPACE;
  readonly type: typeof TYPE;
  readonly leading: typeof LEADING;
  readonly tracking: typeof TRACKING;
  readonly radius: typeof RADIUS;
  readonly elevation: typeof ELEVATION;
  readonly duration: typeof DURATION;
  readonly easing: typeof EASING;
  readonly edgePattern: typeof EDGE_PATTERNS;
  readonly vertical: typeof VERTICAL;
  readonly measure: number;
  readonly hairline: number;
  readonly minTouchTarget: number;
}

/**
 * Resolve a surface level to the two colours it needs.
 *
 * A component says `elevation="card"` and gets a background and a border. It
 * never says "if dark then #1E1B16", which is the branch this function exists to
 * make unnecessary.
 */
export function surfaceOf(
  theme: Theme,
  level: ElevationName,
): {
  readonly background: SemanticColor;
  readonly border: SemanticColor | 'transparent';
  readonly borderWidth: number;
} {
  const spec = ELEVATION[level];
  return {
    background: paletteValue(theme.color, spec.surface),
    border: spec.border === 'none' ? 'transparent' : paletteValue(theme.color, spec.border),
    borderWidth: spec.borderWidth,
  };
}

export function createTheme(scheme: ColorSchemeName): Theme {
  return {
    scheme,
    color: PALETTES[scheme],
    font: FONT_STACKS,
    space: SPACE,
    type: TYPE,
    leading: LEADING,
    tracking: TRACKING,
    radius: RADIUS,
    elevation: ELEVATION,
    duration: DURATION,
    easing: EASING,
    edgePattern: EDGE_PATTERNS,
    vertical: VERTICAL,
    measure: MEASURE,
    hairline: HAIRLINE,
    minTouchTarget: MIN_TOUCH_TARGET,
  };
}
