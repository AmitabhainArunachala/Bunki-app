/**
 * One era ground, painted as the stack it is (Campaign E / B1).
 *
 * ## This file may not render text, and does not want to
 *
 * It imports `groundOf`, `groundLayers` and `planEmissive`, all on
 * `GROUND_PAINTING_EXPORTS`, so the museum-card rule binds it:
 * `test/theme-ground.test.ts` walks every file in `src/` and `app/` and fails
 * any that imports one of those names *and* contains a `<Text>` tag or a `Text`
 * import. **Text never sits on an era ground.**
 *
 * The rule costs nothing because the text does not need the exemption. Every
 * word the map shows arrives from a module that knows nothing about grounds and
 * lands on an opaque 胡粉/墨 card — `MuseumCard`, `Surface`, or the labelled
 * chips in `map-field.tsx` — whose contrast the ground underneath cannot touch.
 * That is the guarantee, and `theme-ground.test.ts` proves the arithmetic half
 * of it against all six grounds.
 *
 * `children` is accepted here where `GroundField` refuses it, and the difference
 * is deliberate rather than a loosening. `GroundField` is a *specimen*: it owns
 * its cards, so taking them as data is what keeps a bare `<Text>` from reaching
 * the ground through it. This is a *field* whose contents are the map — nodes,
 * marks and chips composed by `map-field.tsx`, which is scanned by the same test
 * and which renders its own words on its own cards. The scan is over every file,
 * so the guarantee is not weakened by the composition; it is discharged one file
 * across.
 *
 * ## What is painted, bottom to top
 *
 * Exactly the list `groundLayers()` returns, which is the same list
 * `superpose()` composited to produce `EraGround.field`:
 *
 *   1. the era's **base** pigment, opaque;
 *   2. an atmospheric **wash**, translucent — mist on the mountain road, a
 *      bokashi sky on the highway, structure under the night;
 *   3. the 胡粉/墨 **mat**, translucent, under the content.
 *
 * Separate absolutely-positioned siblings rather than nested `opacity`, because
 * `opacity` on a `View` fades its children too — which would dim the nodes and
 * make the composited colour a fiction. As drawn, `EraGround.field` really is
 * the colour a mark lands on.
 *
 * No shadow, no glow, no gradient. Depth is superposition, because that is what
 * 岩絵具 in 膠 actually does.
 *
 * ## The figure resolves against the ground, not against the app
 *
 * `EraGround.figureScheme` says which semantic palette a mark should use *on
 * this ground*. Today it agrees with the app's scheme for all six grounds, and
 * the day one does not — a dark ground in the light scheme — a mark resolved
 * from the app's scheme would go invisible. So the ground publishes its own
 * scheme through {@link useFigureTheme}, and `map-field.tsx` draws with that.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  MAX_EMISSIVE_POINTS,
  SPACE,
  createTheme,
  groundLayers,
  groundOf,
  planEmissive,
  type EmissiveSignal,
  type EraKey,
  type Theme,
} from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

/* ------------------------------------------------------------------ *
 * The figure palette for whatever ground is above
 * ------------------------------------------------------------------ */

const FigureThemeContext = createContext<Theme | null>(null);

/**
 * The theme a figure element should draw with here.
 *
 * Falls back to the ambient theme when there is no ground above, so a component
 * can be used on a card and on a ground without knowing which — the fallback is
 * the correct answer off a ground, not a guess.
 */
export function useFigureTheme(): Theme {
  const ambient = useTheme();
  return useContext(FigureThemeContext) ?? ambient;
}

/* ------------------------------------------------------------------ *
 * The ground
 * ------------------------------------------------------------------ */

export interface EraGroundProps {
  readonly era: EraKey;
  /**
   * Signals asking for emitted light.
   *
   * Handed straight to `planEmissive`, which throws outside the rail register
   * and caps the rest at `MAX_EMISSIVE_POINTS`. This component decides nothing
   * about what a signal is; it draws the ones the plan lit and reports the ones
   * it suppressed through `onSuppressed`, so the surface can say "and 4 more"
   * rather than quietly dropping them.
   */
  readonly signals?: readonly EmissiveSignal[] | undefined;
  readonly onSuppressed?: ((count: number) => void) | undefined;
  readonly children: ReactNode;
  readonly testID?: string | undefined;
}

export function EraGround({
  era,
  signals = [],
  onSuppressed,
  children,
  testID,
}: EraGroundProps): ReactNode {
  const ambient = useTheme();
  const ground = groundOf(era, ambient.scheme);
  const plan = planEmissive(era, signals);
  const figure = useMemo(() => createTheme(ground.figureScheme), [ground.figureScheme]);

  onSuppressed?.(plan.suppressed);

  const stack = groundLayers(ground);
  const base = stack[0];
  const washes = stack.slice(1, -1);

  return (
    <View
      style={[
        styles.field,
        { backgroundColor: base?.pigment.hex, borderRadius: ambient.radius.md },
      ]}
      testID={testID}
    >
      {/*
        Weather. Hidden from the accessibility tree: an atmospheric wash is not
        a stop on a screen reader's walk through the page.
      */}
      {washes.map((wash) => (
        <View
          key={wash.pigment.reading}
          aria-hidden
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: wash.pigment.hex, opacity: wash.alpha },
          ]}
        />
      ))}

      <View style={styles.mount}>
        {/* The 胡粉/墨 mat: the mount every figure element sits on. */}
        <View
          aria-hidden
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: ground.mat.pigment.hex,
              borderRadius: ambient.radius.sm,
              opacity: ground.mat.alpha,
            },
          ]}
        />

        {/*
          Lit points, at most `MAX_EMISSIVE_POINTS` of them, in the one register
          that permits emitted light. Each carries its basis as its label,
          because a lit point says something about the learner and is therefore
          figure — a graphic with meaning, not decoration.
        */}
        {plan.lit.length === 0 ? null : (
          <View style={styles.lamps} testID={`${testID ?? 'era'}-lamps`}>
            {plan.lit.slice(0, MAX_EMISSIVE_POINTS).map((point, index) => (
              <View
                key={`${point.signal.kind}-${String(index)}`}
                accessibilityLabel={point.signal.basis}
                accessibilityRole="image"
                accessible
                style={[styles.lamp, { backgroundColor: point.pigment.hex }]}
              />
            ))}
          </View>
        )}

        <FigureThemeContext.Provider value={figure}>{children}</FigureThemeContext.Provider>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    overflow: 'hidden',
    /*
      The ground gets real room outside the mat. The mat is a *mount*; a mount
      that reaches the edge is a background, and the wash — which is where the
      depth the operator asked for actually lives — would never be visible.
    */
    padding: SPACE.lg,
  },
  mount: {
    gap: SPACE.md,
    padding: SPACE.lg,
  },
  lamps: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  lamp: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
});
