/**
 * Where you are, and the one gesture back out (lane B2).
 *
 * The design document names getting lost as risk 3: "six levels of continuous
 * zoom with no chrome is a maze. There must always be a visible answer to *where
 * am I* and a single gesture for *take me back out*." This file is both answers,
 * and neither is optional — the ladder and the exit render on every dive, at
 * every depth, including depth zero where the exit is absent rather than dead.
 *
 * ## The ladder is the answer to "where am I"
 *
 * Six rungs, the one you are on marked in more than fill: it carries the
 * accent, a bullet, and the level's name in Japanese and English. A rung the
 * dive cannot reach at all from here is dimmed rather than hidden — the frozen
 * spec keeps untaken rails on the map as dimmed rails, and the same rule applies
 * one scale down.
 *
 * ## The exit is one gesture, and it goes all the way
 *
 * "Back out" is *out*, not *up one*. Both are offered, and they are different
 * controls with different labels, because a learner four levels deep who wants
 * to leave should not have to press four times.
 *
 * ## Reduced motion is stated, not silently applied
 *
 * When the platform asks for reduced motion the dive is stepped: each level
 * arrives without flight. That is a change in how the surface behaves and the
 * learner is told, because a surface that quietly behaves differently is a
 * surface whose behaviour cannot be trusted.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SCALE_LEVELS, SCALE_LEVEL_NAMES, type ScaleLevel } from '@bunki/domain';

import { AppButton } from '../primitives.tsx';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import type { DiveStop } from './dive-state.ts';

export const STEPPED_NOTE =
  'Your system asks for reduced motion, so the dive is stepped: each level arrives in place, with no flight between them. Nothing else changes.';

export const FLIGHT_NOTE =
  'Each level flies in from the one before it. Turn on reduced motion in your system settings for a stepped dive instead.';

export interface DiveChromeProps {
  readonly path: readonly DiveStop[];
  readonly centre: DiveStop;
  /** Levels the dive can actually reach from here. Everything else is dimmed. */
  readonly reachableLevels: readonly ScaleLevel[];
  readonly reduced: boolean;
  readonly canGoBack: boolean;
  readonly onBack: () => void;
  readonly onSurface: () => void;
  readonly testID?: string | undefined;
}

export function DiveChrome({
  path,
  centre,
  reachableLevels,
  reduced,
  canGoBack,
  onBack,
  onSurface,
  testID,
}: DiveChromeProps): ReactNode {
  const theme = useTheme();
  const reachable = new Set(reachableLevels);

  return (
    <View style={styles.chrome} testID={testID}>
      {/* ------------------------------------------------ where am I */}
      <View
        accessibilityLabel={`Scale: ${SCALE_LEVEL_NAMES[centre.level].gloss}, level ${String(
          SCALE_LEVELS.indexOf(centre.level),
        )} of ${String(SCALE_LEVELS.length - 1)}.`}
        accessibilityRole="progressbar"
        accessible
        style={styles.ladder}
        testID="dive-ladder"
      >
        {SCALE_LEVELS.map((level) => {
          const here = level === centre.level;
          const open = here || reachable.has(level);
          const name = SCALE_LEVEL_NAMES[level];
          return (
            <View
              aria-hidden
              key={level}
              style={[
                styles.rung,
                {
                  backgroundColor: here ? theme.color.vermilionSoft : 'transparent',
                  borderColor: here ? theme.color.vermilion : theme.color.rule,
                  borderRadius: RADIUS.sm,
                  /*
                    A level with nothing to reach is marked by **form**, not by
                    an opacity. Dimming the whole rung to 0.45 was the first
                    version and axe measured its label at 2.1:1 on the exported
                    bundle — well under AA. `MIN_UNLIT_OPACITY` is a floor for
                    an unlit *graphic*, and a dimmed rail is not a dimmed word:
                    text has to stay legible whatever it is saying. So a level
                    the dive cannot reach from here keeps full opacity and gets a
                    dashed edge, which is the same channel `EDGE_PATTERNS` uses
                    for fragility and which survives on any ground.
                  */
                  borderStyle: open ? 'solid' : 'dashed',
                },
              ]}
            >
              <Text
                style={[
                  styles.rungWritten,
                  {
                    color: here
                      ? theme.color.vermilion
                      : open
                        ? theme.color.inkMuted
                        : theme.color.inkFaint,
                    fontFamily: theme.font.mincho,
                  },
                ]}
              >
                {here ? `• ${name.written}` : name.written}
              </Text>
              <Text
                style={[
                  styles.rungGloss,
                  {
                    /*
                      The active rung's background is the accent tint, and
                      `inkFaint` on it measures 4.44:1 — under AA for 13 px
                      body text, which axe caught on the exported bundle. The
                      two foregrounds `CONTRAST_PAIRS` declares against
                      `vermilionSoft` are `ink` and `vermilion`, and both are
                      checked; this uses one of them rather than adding a
                      fourteenth pair for a shade that does not clear.
                    */
                    color: here ? theme.color.ink : theme.color.inkFaint,
                    fontFamily: theme.font.sans,
                  },
                ]}
              >
                {name.gloss}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ---------------------------------------------- the way here */}
      <Text
        accessibilityLabel={`You are at ${centre.label}, ${String(path.length - 1)} ${
          path.length === 2 ? 'zoom' : 'zooms'
        } from ${path[0]?.label ?? ''}.`}
        style={[styles.path, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        testID="dive-path"
      >
        {path.map((stop) => stop.label).join('  ›  ')}
      </Text>

      {/* ------------------------------------------------- the way out */}
      <View style={styles.exits}>
        {canGoBack ? (
          <>
            <AppButton
              accessibilityHint="Returns to the node you were on before this one."
              label="Back one"
              onPress={onBack}
              testID="dive-back"
            />
            <AppButton
              accessibilityHint="Returns to the character this dive started from, in one step."
              label={`Out to ${path[0]?.label ?? ''}`}
              onPress={onSurface}
              testID="dive-surface"
              variant="primary"
            />
          </>
        ) : (
          <Text
            style={[styles.atSurface, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
            testID="dive-at-surface"
          >
            You are at the surface of this dive.
          </Text>
        )}
      </View>

      <Text
        style={[styles.motion, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
        testID="dive-motion-mode"
      >
        {reduced ? STEPPED_NOTE : FLIGHT_NOTE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    gap: SPACE.sm,
  },
  ladder: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xs,
  },
  rung: {
    borderWidth: 1,
    gap: 1,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
  },
  rungWritten: {
    fontSize: TYPE.label,
  },
  rungGloss: {
    fontSize: TYPE.meta,
  },
  path: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.6,
  },
  exits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  atSurface: {
    fontSize: TYPE.meta,
    paddingVertical: SPACE.sm,
  },
  motion: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
