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
 */

export {
  COLOR_SCHEMES,
  CONTRAST_PAIRS,
  DURATION,
  EASING,
  EDGE_PATTERNS,
  ELEVATION,
  FONT_STACKS,
  HAIRLINE,
  LEADING,
  MEASURE,
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
  paletteLeaves,
  paletteValue,
  resolveDuration,
  strokeSequenceDuration,
  surfaceOf,
} from '../theme/index.ts';

export type {
  ColorSchemeName,
  DurationName,
  EasingName,
  EdgePatternName,
  ElevationName,
  Palette,
  RadiusName,
  RecallBand,
  RecallRamp,
  SelfHostedFace,
  SpaceName,
  Theme,
  TypeSizeName,
} from '../theme/index.ts';
