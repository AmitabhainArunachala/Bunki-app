/**
 * Stroke-order animation (WP-05, REQ-UI-03 Layer 0).
 *
 * Strokes are drawn in writing order from the seed's KanjiVG paths: those
 * already written are ink, the stroke being written is the one vermilion
 * accent, and the strokes still to come are a faint ghost so the character
 * stays legible as a whole while the order is being shown. That ghost is the
 * same ink at low opacity, not a second colour — REQ-UI-08 allows exactly one
 * accent and this page does not spend it twice.
 *
 * ## Two ways to show one stroke, and why both are here
 *
 * WP-05 shipped a **discrete reveal** — stroke N appears whole — and recorded
 * the reason: path-length interpolation needs per-stroke measurement, and
 * `SVGGeometryElement.getTotalLength()` exists in the browser and not, portably,
 * in `react-native-svg` on every platform.
 *
 * That reason expired. Lane A1 built `src/ui/path-length.ts`, which computes the
 * length from the path data in arithmetic that runs the same in a browser, on a
 * device and in the test runner, and `InkDraw` in `src/ui/motion.tsx` animates a
 * dash offset from it. So the brief's own first example of motion that teaches —
 * "strokes that draw" — is now available on every target.
 *
 * The reveal is kept as the default rather than deleted, because it is what the
 * existing specimen and screenshot evidence were captured against and because it
 * is the right register for a still frame. `draw` opts into the brush, which is
 * what the character page uses. Under reduced motion `InkDraw`'s duration is
 * zero and the stroke lands complete on the first frame, so the two modes
 * converge exactly where they should.
 *
 * Accessibility: the SVG is one accessible element with a spoken description of
 * how many strokes are shown; the controls are ordinary labelled buttons, so
 * the sequence is reachable without seeing it. Autoplay stops as soon as the
 * learner touches a control — an animation that fights the user is a trap for
 * anyone reading slowly.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Path, Rect } from 'react-native-svg';

import { strokeAccessibilityLabel, type KanjiStrokeSet } from '../data/kanjivg.ts';
import { InkDraw } from './motion.tsx';
import { AppButton } from './primitives.tsx';
import { SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

/** Milliseconds between strokes while playing. Slow enough to follow a brush. */
const STROKE_INTERVAL_MS = 520;
/** Pause on the finished character before the loop restarts. */
const REPLAY_PAUSE_MS = 1200;

export interface StrokeOrderProps {
  readonly character: string;
  readonly strokes: KanjiStrokeSet;
  /** Rendered size in points. */
  readonly size?: number | undefined;
  /**
   * Start with every stroke shown and autoplay off. The screenshot harness sets
   * this so the captured frame is deterministic.
   */
  readonly startRevealed?: boolean | undefined;
  /**
   * Draw each stroke with the brush instead of revealing it whole.
   *
   * Off by default so nothing that already renders this component changes. See
   * the header for why both modes exist and why the original reason for having
   * only one of them no longer holds.
   */
  readonly draw?: boolean | undefined;
  readonly testID?: string | undefined;
}

export function StrokeOrder({
  character,
  strokes,
  size = 208,
  startRevealed = false,
  draw = false,
  testID,
}: StrokeOrderProps): ReactNode {
  const theme = useTheme();
  const total = strokes.strokes.length;
  const [revealed, setRevealed] = useState(startRevealed ? total : 0);
  const [playing, setPlaying] = useState(!startRevealed);
  /**
   * Whether the accent is marking a stroke being written.
   *
   * "Show all" produces the finished character, and a finished character has no
   * stroke in progress — highlighting its last stroke would read as an error
   * mark on a correct glyph. Stepping and playing do have a current stroke, so
   * they keep the highlight even on the final one.
   */
  const [marking, setMarking] = useState(!startRevealed);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => {
    if (!playing) return undefined;
    const delay = revealed >= total ? REPLAY_PAUSE_MS : STROKE_INTERVAL_MS;
    timer.current = setTimeout(() => {
      setRevealed((current) => (current >= total ? 0 : current + 1));
    }, delay);
    return clearTimer;
  }, [playing, revealed, total, clearTimer]);

  const stop = useCallback(() => {
    setPlaying(false);
    clearTimer();
  }, [clearTimer]);

  const step = useCallback(() => {
    stop();
    setMarking(true);
    setRevealed((current) => (current >= total ? 0 : current + 1));
  }, [stop, total]);

  const showAll = useCallback(() => {
    stop();
    setMarking(false);
    setRevealed(total);
  }, [stop, total]);

  const restart = useCallback(() => {
    clearTimer();
    setMarking(true);
    setRevealed(0);
    setPlaying(true);
  }, [clearTimer]);

  const gridColor = theme.color.rule;

  return (
    <View style={styles.container} testID={testID}>
      <View
        accessibilityLabel={strokeAccessibilityLabel(character, revealed, total)}
        accessibilityRole="image"
        accessible
        style={[
          styles.canvas,
          { backgroundColor: theme.color.raised, borderColor: theme.color.rule, width: size },
        ]}
      >
        <Svg height={size} viewBox={strokes.viewBox} width={size}>
          {/* The 田 guide, the way a practice sheet is ruled. Decorative. */}
          <G>
            <Rect
              fill="none"
              height="100%"
              stroke={gridColor}
              strokeWidth={1}
              width="100%"
              x="0"
              y="0"
            />
            <Line
              stroke={gridColor}
              strokeDasharray="4 5"
              strokeWidth={1}
              x1="50%"
              x2="50%"
              y1="0"
              y2="100%"
            />
            <Line
              stroke={gridColor}
              strokeDasharray="4 5"
              strokeWidth={1}
              x1="0"
              x2="100%"
              y1="50%"
              y2="50%"
            />
          </G>
          {strokes.strokes.map((stroke) => {
            const written = stroke.order <= revealed;
            const current = marking && stroke.order === revealed;
            const shared = {
              d: stroke.d,
              fill: 'none',
              stroke: current ? theme.color.vermilion : theme.color.ink,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              strokeWidth: current ? 4.5 : 3.5,
            } as const;

            /*
              The ghost of a stroke not yet written is the *same* ink at low
              opacity, in both modes: the character has to stay legible as a
              whole while its order is being shown, and a second colour would
              spend the one accent twice.
            */
            if (!draw || !written) {
              return <Path {...shared} key={stroke.id} strokeOpacity={written ? 1 : 0.12} />;
            }
            return <InkDraw {...shared} drawing key={stroke.id} strokeOpacity={1} />;
          })}
        </Svg>
      </View>

      <Text style={[styles.counter, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {revealed >= total ? `${total} strokes` : `stroke ${revealed} of ${total}`}
      </Text>

      <View style={styles.controls}>
        <AppButton
          accessibilityHint={
            playing
              ? 'Stops the stroke animation.'
              : 'Replays the stroke order from the first stroke.'
          }
          label={playing ? 'Pause' : 'Replay'}
          onPress={playing ? stop : restart}
          testID="stroke-play-toggle"
        />
        <AppButton
          accessibilityHint="Shows the next stroke and stops the animation."
          label="Next stroke"
          onPress={step}
          testID="stroke-step"
        />
        <AppButton
          accessibilityHint="Shows the finished character with every stroke."
          label="Show all"
          onPress={showAll}
          testID="stroke-show-all"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  canvas: {
    aspectRatio: 1,
    borderRadius: 4,
    borderWidth: 1,
    overflow: 'hidden',
  },
  counter: {
    fontSize: TYPE.meta,
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
});
