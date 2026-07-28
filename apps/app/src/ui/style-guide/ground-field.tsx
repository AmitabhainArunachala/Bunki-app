/**
 * An era ground, painted as the stack it actually is (lane A1′).
 *
 * ## Why this file renders no text
 *
 * It imports `groundOf`, which is on `GROUND_PAINTING_EXPORTS`, and the rule
 * that list carries is that **a module which puts an era pigment on screen may
 * not render text**. `test/theme-ground.test.ts` enforces it across every file
 * in `src/` and `app/`, so it binds Wave B's map lane exactly as it binds this
 * one.
 *
 * The rule costs nothing here because text does not need the exemption: the
 * cards arrive as *data*, and this component composes `MuseumCard` and
 * `RubyText`, which render the words themselves and know nothing about grounds.
 * That is why `GroundFieldProps` has no `children` — a `children` slot would be
 * a hole through which a bare `<Text>` could reach the ground, and the museum
 * card is the whole guarantee that it never does.
 *
 * ## What is actually painted
 *
 * Three layers, bottom-up, exactly the list `groundLayers()` returns:
 *
 *   1. the era's **base** pigment, opaque;
 *   2. an atmospheric **wash** over it, translucent — mist on the mountain road,
 *      a bokashi sky on the highway, structure under the night;
 *   3. the 胡粉/墨 **mat**, translucent, under the content only.
 *
 * The wash and the mat are separate absolutely-positioned siblings rather than
 * wrappers with `opacity`, because `opacity` on a `View` fades its children too
 * — which would dim the card and the marks and make the composited colour a
 * fiction. As drawn, `EraGround.field` really is the colour a mark lands on, and
 * the test asserts that `superpose(groundLayers(ground))` is that same value.
 *
 * There is no shadow and no glow anywhere in here. Depth is the stack.
 */

import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AttributionFooter } from '../attribution.tsx';
import { type CapabilityId } from '../capability.ts';
import { RecallIndicator, RecallMeter } from '../recall.tsx';
import { RubyText } from '../ruby.tsx';
import { MuseumCard } from '../surface.tsx';
import {
  SPACE,
  TYPE,
  groundLayers,
  groundOf,
  planEmissive,
  type EmissiveSignal,
  type EraKey,
  type RecallBand,
} from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

/**
 * One museum card to float over the ground.
 *
 * Data, not a node. See the header: this is what keeps text off the ground by
 * construction rather than by convention.
 */
export interface GroundCard {
  /** The headword as written — 駅. */
  readonly written: string;
  /** Its reading, for the ruby — えき. */
  readonly reading: string;
  /** One line of sense. Never a list; the card is not a spreadsheet row. */
  readonly caption: string;
  /** Small print under the rule. */
  readonly catalogue: readonly string[];
  /** Which capability the band below belongs to. There is no "overall". */
  readonly capability: CapabilityId;
  /**
   * An illustrative band, so the specimen can show a real mark landing on a
   * real ground. Nothing here is measured and nothing here is evidence — the
   * card's own attribution says so on screen.
   */
  readonly band: RecallBand;
  /** The attribution line the card carries. Never folded away. */
  readonly standing: string;
}

export interface GroundFieldProps {
  readonly era: EraKey;
  readonly cards: readonly GroundCard[];
  /**
   * Signals asking for emitted light.
   *
   * Passed straight to `planEmissive`, which throws outside the rail register
   * and caps the rest at `MAX_EMISSIVE_POINTS`. Nothing here decides what counts
   * as a signal; it only draws the ones the plan lit.
   */
  readonly signals?: readonly EmissiveSignal[] | undefined;
  readonly testID?: string | undefined;
}

export function GroundField({ era, cards, signals = [], testID }: GroundFieldProps): ReactNode {
  const theme = useTheme();
  const ground = groundOf(era, theme.scheme);
  const plan = planEmissive(era, signals);

  /*
    `groundLayers()` is the whole stack, mat included. It is split here rather
    than re-derived because the mat is painted under the *content* while the
    washes fill the field, and the two must still be the same list the
    arithmetic composited. `superpose` refuses a stack whose bottom is
    translucent, so the base is never missing by the time this renders.
  */
  const stack = groundLayers(ground);
  const base = stack[0];
  const washes = stack.slice(1, -1);

  return (
    <View
      style={[styles.field, { backgroundColor: base?.pigment.hex, borderRadius: theme.radius.md }]}
      testID={testID}
    >
      {/*
        The atmospheric wash. Absolutely filled and hidden from the
        accessibility tree: it is weather, and weather is not a stop on a
        screen reader's walk through the page.
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
              borderRadius: theme.radius.sm,
              opacity: ground.mat.alpha,
            },
          ]}
        />

        <View style={styles.marks}>
          {cards.map((card) => (
            <RecallIndicator
              key={`${card.written}-mark`}
              band={card.band}
              capability={card.capability}
              size={20}
              testID={`ground-${era}-mark-${card.written}`}
            />
          ))}
          {plan.lit.map((point, index) => (
            <View
              // A lit point is a graphic that says something, so it carries the
              // basis as its label rather than being decoration in the tree.
              key={`${point.signal.kind}-${String(index)}`}
              accessibilityLabel={point.signal.basis}
              accessibilityRole="image"
              accessible
              style={[styles.lit, { backgroundColor: point.pigment.hex }]}
              testID={`ground-${era}-lit-${String(index)}`}
            />
          ))}
        </View>

        <View style={styles.cards}>
          {cards.map((card) => (
            <MuseumCard
              key={card.written}
              caption={card.caption}
              catalogue={card.catalogue}
              footer={<AttributionFooter lines={[]} standing={card.standing} />}
              specimen={
                <RubyText reading={card.reading} size={TYPE.headword} written={card.written} />
              }
              testID={`ground-${era}-card-${card.written}`}
            >
              {/*
                The meter rather than the indicator, deliberately. On the ground
                a band is a bare mark, because a map node has no room for a word;
                on the card there is room, so the band arrives with its
                capability and its word attached. Same band, two registers.
              */}
              <RecallMeter
                band={card.band}
                basis="Illustrative only: this specimen holds no memory state."
                capability={card.capability}
              />
            </MuseumCard>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    overflow: 'hidden',
    /*
      The ground gets real room. `SPACE.xxl` here is not decoration: the mat is a
      *mount*, and a mount that reaches the edge is a background. The margin is
      what lets the era pigment be seen at full strength — the wash is the thing
      the operator asked for depth from, and it cannot deliver any if the mat
      covers it.
    */
    padding: SPACE.xxl,
  },
  mount: {
    gap: SPACE.lg,
    padding: SPACE.xl,
  },
  marks: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.lg,
    minHeight: 24,
  },
  lit: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  cards: {
    gap: SPACE.lg,
  },
});
