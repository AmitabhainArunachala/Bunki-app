/**
 * The token module every existing screen already imports.
 *
 * WP-05 put the design tokens here, when there were six of them. The experience
 * layer needs a system rather than a file — colour with a memory-state channel,
 * a type scale with two Japanese families behind it, motion with roles — so the
 * tokens moved to `src/theme/`, and this module re-exports them.
 *
 * It is a re-export rather than a deletion for a specific reason: this lane is
 * the vocabulary, not the surfaces. Every screen in the app imports
 * `@/ui/theme`, and rewriting ten screens' imports would be this lane editing
 * files it does not own, in a wave where other lanes are about to edit them for
 * real reasons. So the old names keep working, unchanged, and the screens adopt
 * `@/theme` when they are next opened for their own reasons.
 *
 * What did change under them, deliberately: `FONT_STACKS` now starts with the
 * self-hosted faces in `src/theme/fonts/`. A screen that asked for mincho was
 * getting the platform's mincho or, on a host with none, a generic serif; it now
 * gets Shippori Mincho — the face REQ-UI-08 and the frozen spec §8 actually
 * name. That is the design system doing its job under a surface rather than a
 * change to the surface.
 *
 * `CONTRAST_PAIRS` also grew, and one of its fields changed shape: entries now
 * name tokens by path (`'recall.settled'`) rather than by top-level key, because
 * the recall ramp is one token with five steps. `paletteValue` resolves a path;
 * `test/theme-contrast.test.ts` walks the pairs through it.
 *
 * Lane A1′ added the ground layer under all of it — `GROUNDS`, `ERA_REGISTERS`,
 * `GROUND_CONTRAST_PAIRS` and the emissive cap — and it is re-exported here for
 * the same reason: the screens already import `@/ui/theme`, and a lane that
 * needs an era register should not have to learn a second import path to get
 * one. Nothing that was here before changed name or shape.
 */

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
  createTheme,
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
  surfaceOf,
} from '../theme/index.ts';

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
  Theme,
  TypeSizeName,
} from '../theme/index.ts';
