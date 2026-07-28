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
 * ## The hole the header used to miss: composition
 *
 * "No `children` slot, and MuseumCard/RubyText are composed" is not the whole
 * argument, and this file was the counterexample to its own header. It rendered
 * `RecallIndicator` for every card, straight onto the mat. `RecallIndicator` is
 * *total* over `RecallBand`: handed `faint` or `unseen` it resolves to
 * `RecallMeter`, which renders a capability label, a band word and a basis line
 * — three `<Text>` nodes on an era ground, with the source scan green, because
 * the scan looks for `<Text>` in *this* file and there was none. A band read off
 * a projection is exactly the input that would have done it, and reading a band
 * off a projection is the stated reason `RecallIndicator` exists.
 *
 * The fix is a type rather than a bigger scan. `GroundCard.band` is
 * `StandaloneRecallBand` — the three steps that clear 3:1 as a bare mark — and
 * the marks row draws `RecallMark`, which accepts only those. The meter-only
 * bands cannot reach a ground, and a lane that tries stops compiling. The meter
 * still appears on this page, on the card, where it has always belonged.
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
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AttributionFooter } from '../attribution.tsx';
import { type CapabilityId } from '../capability.ts';
import { RecallMark, RecallMeter } from '../recall.tsx';
import { RubyText } from '../ruby.tsx';
import { MuseumCard } from '../surface.tsx';
import {
  SPACE,
  TYPE,
  groundLayers,
  groundOf,
  planEmissive,
  type EmissiveShape,
  type EmissiveSignal,
  type EraKey,
  type GroundColor,
  type StandaloneRecallBand,
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
   *
   * `StandaloneRecallBand`, not `RecallBand`, and that narrowing is the museum
   * card rule holding where a source scan could not reach. The two meter-only
   * steps resolve to `RecallMeter`, which is three lines of text; letting one in
   * here would put those lines on an era ground with every check green. The type
   * is derived from `RECALL_BAND_MARKS`, so flipping a step's `standalone` flag
   * moves it in or out of this prop without anyone remembering to.
   */
  readonly band: StandaloneRecallBand;
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
            <RecallMark
              key={`${card.written}-mark`}
              band={card.band}
              capability={card.capability}
              size={20}
              testID={`ground-${era}-mark-${card.written}`}
            />
          ))}
          {plan.lit.map((point, index) => (
            <View
              /*
                A lit point is a graphic that says something, so it carries its
                kind and its basis as a label rather than being decoration in the
                tree. All three kinds share one pigment — see `EMISSIVE_LAMP` —
                so the shape is what a sighted reader tells them apart by and the
                label is what a screen reader hears. Neither of them is the hue.
              */
              key={`${point.signal.kind}-${String(index)}`}
              accessibilityLabel={`${point.mark.label}. ${point.signal.basis}`}
              accessibilityRole="image"
              accessible
              style={litStyle(point.mark.shape, point.pigment.hex)}
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

/**
 * The size a lit point is drawn at, and the stroke a hollow one keeps.
 *
 * 12 rather than 10 because a ring needs a hole: at 10 points with a 3-point
 * stroke the middle is 4 points across and reads as a slightly soft disc, which
 * would put `evidence-stale` and `due-now` back to being the same graphic. The
 * bar is wider than it is tall for the same reason — a semaphore blade has to
 * be unmistakably not-a-circle at a glance.
 */
const LIT_SIZE = 12;
const LIT_STROKE = 3;

/**
 * One lamp, three forms.
 *
 * A `switch` over the shape rather than a table of styles, because the three
 * differ in which properties they set at all — a ring has no fill and a bar has
 * no matching width and height — and a merged style object would leave the
 * unset ones inherited from whichever entry ran last. Exhaustive over
 * `EmissiveShape`, so adding a fourth signal form is a compile error here until
 * someone says what it looks like.
 */
function litStyle(shape: EmissiveShape, lamp: GroundColor): ViewStyle {
  switch (shape) {
    case 'disc':
      return {
        backgroundColor: lamp,
        borderRadius: LIT_SIZE / 2,
        height: LIT_SIZE,
        width: LIT_SIZE,
      };
    case 'ring':
      return {
        borderColor: lamp,
        borderRadius: LIT_SIZE / 2,
        borderWidth: LIT_STROKE,
        height: LIT_SIZE,
        width: LIT_SIZE,
      };
    case 'bar':
      return {
        backgroundColor: lamp,
        borderRadius: 1,
        height: LIT_STROKE + 1,
        width: LIT_SIZE + LIT_STROKE,
      };
  }
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
  cards: {
    gap: SPACE.lg,
  },
});
