/**
 * The era register under a word the domain could actually place (lane B2).
 *
 * ## Why the ground appears here and almost nowhere else
 *
 * The ground layer says *when and where*, never *how well you know it*. Which
 * means it may only be painted where the era attribution genuinely reaches — and
 * lane A2′ measured how far that is: **9.8% of the shipped lexemes**, and
 * **never a character**. `attributeNodeEra` refuses a kanji by rule, not for want
 * of data: 駅 is a 駅家 post-station, a 宿場 and a railway station at once, so a
 * single layer for the character would be false however much data we had.
 *
 * So this component renders only when the placement is a layer, and the surface
 * that composes it renders a plain card with the attribution's own sentence when
 * it is `unknown`. Choosing a register for an unplaced node would be a guessed
 * era, which is a P0 in this build and rightly so.
 *
 * ## Why this file renders no text
 *
 * It imports `groundOf` and `groundLayers`, which are on `GROUND_PAINTING_EXPORTS`,
 * and the rule that list carries is that a module putting an era pigment on
 * screen may not render text. `test/theme-ground.test.ts` walks every file in
 * `src/` and `app/` and enforces it.
 *
 * The rule costs nothing because text does not need the exemption: the card
 * arrives as **data** and this file composes `MuseumCard` and `RubyText`, which
 * render the words themselves and know nothing about grounds. `DiveGroundProps`
 * therefore has no `children` — a children slot would be a hole a bare `<Text>`
 * could reach the ground through, and the museum card is the whole contrast
 * guarantee.
 *
 * Depth is the stack: base pigment, atmospheric wash, 胡粉/墨 mat, composited by
 * the same arithmetic `EraGround.field` was computed with. No shadow, no glow.
 */

import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AttributionFooter } from '../attribution.tsx';
import { RubyText } from '../ruby.tsx';
import { MuseumCard } from '../surface.tsx';
import { SPACE, TYPE, groundLayers, groundOf, type EraKey } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

/** The specimen, as data. See the header for why this is not a `children` slot. */
export interface DiveGroundCard {
  /** 森林 — the headword as written. */
  readonly written: string;
  /** しんりん — its reading, for the ruby. */
  readonly reading: string;
  /** One line of sense. Never a list; a card is not a spreadsheet row. */
  readonly caption: string;
  /** Small print under the rule. */
  readonly catalogue: readonly string[];
  /** What the era claim is and is not. Never folded away. */
  readonly standing: string;
}

export interface DiveGroundProps {
  readonly era: EraKey;
  readonly card: DiveGroundCard;
  readonly testID?: string | undefined;
}

export function DiveGround({ era, card, testID }: DiveGroundProps): ReactNode {
  const theme = useTheme();
  const ground = groundOf(era, theme.scheme);

  /*
    `groundLayers()` is the whole stack, mat included, and it is split rather
    than re-derived so the painted pixels are the ones the arithmetic
    composited. The washes are absolutely-positioned siblings rather than
    wrappers with `opacity`, because `opacity` on a `View` fades its children
    too — which would dim the card and make the composited colour a fiction.
  */
  const stack = groundLayers(ground);
  const base = stack[0];
  const washes = stack.slice(1, -1);

  return (
    <View
      style={[styles.field, { backgroundColor: base?.pigment.hex, borderRadius: theme.radius.md }]}
      testID={testID}
    >
      {washes.map((wash) => (
        <View
          aria-hidden
          key={wash.pigment.reading}
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: wash.pigment.hex, opacity: wash.alpha },
          ]}
        />
      ))}

      <View style={styles.mount}>
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
        <MuseumCard
          caption={card.caption}
          catalogue={card.catalogue}
          footer={<AttributionFooter lines={[]} standing={card.standing} />}
          specimen={<RubyText reading={card.reading} size={TYPE.headword} written={card.written} />}
          testID={`${testID ?? 'dive-ground'}-card`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    overflow: 'hidden',
    // The era pigment needs room to be seen at full strength; a mat that reaches
    // the edge is a background rather than a mount.
    padding: SPACE.xl,
  },
  mount: {
    padding: SPACE.lg,
  },
});
