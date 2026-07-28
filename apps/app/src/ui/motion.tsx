/**
 * Motion primitives — draw, settle, light.
 *
 * Three components and one hook, matching the three motion roles in
 * `src/theme/motion.ts`. Every one of them takes its duration through
 * `resolveDuration`, so reduced motion is a duration of zero rather than a
 * second rendering path that nobody looks at.
 *
 * What is deliberately absent: anything that scales, bounces, spins or
 * celebrates. The campaign brief bans confetti and the frozen spec bans XP; the
 * quieter version of the same rule is that no animation here is *reachable from
 * being right about something*. These animate arrival, order and attention —
 * facts about the surface — never approval.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode, type ComponentProps } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Path } from 'react-native-svg';

import { svgPathLength } from './path-length.ts';
import { EASING, MIN_UNLIT_OPACITY, resolveDuration } from './theme.ts';
import { useTheme } from './theme-context.tsx';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function bezier(name: keyof typeof EASING): ReturnType<typeof Easing.bezier> {
  const [x1, y1, x2, y2] = EASING[name];
  return Easing.bezier(x1, y1, x2, y2);
}

/**
 * Whether the platform is asking for reduced motion.
 *
 * On the web `react-native-web` maps this onto the `prefers-reduced-motion`
 * media query, including the change event, so a learner who flips the setting
 * mid-session gets the change without a reload. It starts `true` and relaxes
 * once the platform has answered: erring toward *less* motion during the first
 * frames means a learner who asked for stillness never sees a burst of movement
 * before the query resolves.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(true);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduced(value);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/** Drive one `Animated.Value` from 0 to 1 (or back) whenever `active` changes. */
function useProgress(
  active: boolean,
  duration: number,
  easing: keyof typeof EASING,
): Animated.Value {
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    if (duration === 0) {
      progress.setValue(active ? 1 : 0);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration,
      easing: bezier(easing),
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [active, duration, easing, progress]);

  return progress;
}

export interface SettleProps {
  /** Rendered once mounted; the settle runs on the first frame after mount. */
  readonly children: ReactNode;
  /**
   * How far the surface travels before it lands, in points. Small on purpose:
   * a surface that slides in from off-screen is a transition, not a settling.
   */
  readonly rise?: number | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly testID?: string | undefined;
}

/**
 * A surface settling into place.
 *
 * Opacity and a few points of vertical travel, over `settle`. Its job is to
 * make the relationship between "what was here" and "what is here now" legible
 * — a list that swaps contents instantly makes the reader re-find their place.
 *
 * It animates on mount only. A component that re-settled on every prop change
 * would make a live surface, like a map under a time scrubber, shiver.
 */
export function Settle({ children, rise = 6, style, testID }: SettleProps): ReactNode {
  const reduced = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const duration = resolveDuration('settle', reduced);
  const progress = useProgress(entered, duration, 'settle');

  useEffect(() => {
    setEntered(true);
  }, []);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] });

  return (
    <Animated.View
      style={[{ opacity: progress, transform: [{ translateY }] }, style]}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
}

export interface BranchLightProps {
  /** True while this branch is the one being pointed at. */
  readonly lit: boolean;
  readonly children: ReactNode;
  /**
   * How dim an unlit branch is. Untaken rails stay *visible* — the frozen spec
   * §3 keeps them on the map as dimmed rails, revisitable — so this floor is
   * well above zero and the component will not accept a value that hides them.
   */
  readonly restingOpacity?: number | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
  readonly testID?: string | undefined;
}

/**
 * A branch lighting up.
 *
 * Asymmetric by design: `lightIn` is quicker than `lightOut`, so arrival is
 * noticed and departure is not. There is no colour change — lighting is a
 * change in presence, and spending the one accent on "this row is hovered"
 * would leave nothing to say "this is your frontier" with.
 */
export function BranchLight({
  lit,
  children,
  restingOpacity = 0.55,
  style,
  testID,
}: BranchLightProps): ReactNode {
  const reduced = useReducedMotion();
  const duration = resolveDuration(lit ? 'lightIn' : 'lightOut', reduced);
  const progress = useProgress(lit, duration, lit ? 'enter' : 'exit');
  const floor = Math.max(MIN_UNLIT_OPACITY, restingOpacity);

  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [floor, 1] });

  return (
    <Animated.View style={[{ opacity }, style]} testID={testID}>
      {children}
    </Animated.View>
  );
}

export interface InkDrawProps extends Omit<ComponentProps<typeof Path>, 'strokeDasharray'> {
  /** The path data. Also the source of the length the dash animation needs. */
  readonly d: string;
  /** Draw when true; hold undrawn when false. */
  readonly drawing: boolean;
  /** Wait this long before starting, so a caller can stagger a stroke sequence. */
  readonly delay?: number | undefined;
  /** Told when the stroke has finished, so a sequence can advance. */
  readonly onDrawn?: (() => void) | undefined;
}

/**
 * One stroke, drawn.
 *
 * `strokeDasharray` is set to the whole path length and `strokeDashoffset`
 * animates from that length to zero, which is the standard way to make a line
 * appear to be written rather than to fade in. The length comes from
 * `svgPathLength` rather than from `getTotalLength()`, for the portability
 * reason that file's header sets out.
 *
 * Under reduced motion the duration is zero, so the stroke lands complete on
 * the first frame — the character is still fully legible, which is the part
 * that carries the teaching.
 */
export function InkDraw({ d, drawing, delay = 0, onDrawn, ...pathProps }: InkDrawProps): ReactNode {
  const reduced = useReducedMotion();
  const length = useMemo(() => Math.max(1, Math.round(svgPathLength(d))), [d]);
  const offset = useRef(new Animated.Value(drawing ? 0 : length)).current;
  const duration = resolveDuration('drawStroke', reduced);

  /*
    `onDrawn` is held in a ref rather than listed as a dependency of the effect
    below. A caller that builds the callback inline — which a stroke sequence
    always does, because the callback closes over the stroke index — would
    otherwise give the effect a new identity every render and restart the stroke
    every frame. The ref keeps the *latest* callback without making the
    animation depend on its identity.
  */
  const onDrawnRef = useRef(onDrawn);
  useEffect(() => {
    onDrawnRef.current = onDrawn;
  }, [onDrawn]);

  useEffect(() => {
    if (!drawing) {
      offset.setValue(length);
      return;
    }
    if (duration === 0) {
      offset.setValue(0);
      onDrawnRef.current?.();
      return;
    }
    const animation = Animated.timing(offset, {
      toValue: 0,
      duration,
      delay,
      easing: bezier('ink'),
      useNativeDriver: false,
    });
    animation.start(({ finished }) => {
      if (finished) onDrawnRef.current?.();
    });
    return () => {
      animation.stop();
    };
  }, [d, drawing, delay, duration, length, offset]);

  return (
    <AnimatedPath
      {...pathProps}
      d={d}
      strokeDasharray={[length, length]}
      strokeDashoffset={offset}
    />
  );
}

/**
 * A hairline that draws itself left to right.
 *
 * The smallest piece of the vocabulary, and the one most used: a rule under a
 * section heading that arrives *with* the section rather than being there
 * before it. Uses width rather than a dash offset because a straight line needs
 * no path.
 */
export function DrawnRule({ testID }: { readonly testID?: string }): ReactNode {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [entered, setEntered] = useState(false);
  const progress = useProgress(entered, resolveDuration('settle', reduced), 'settle');

  useEffect(() => {
    setEntered(true);
  }, []);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View aria-hidden style={styles.ruleTrack} testID={testID}>
      <Animated.View style={[styles.rule, { backgroundColor: theme.color.rule, width }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  ruleTrack: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  rule: {
    height: '100%',
  },
});
