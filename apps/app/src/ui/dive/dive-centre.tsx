/**
 * The specimen in the middle, at whatever level the dive has stopped at
 * (lane B2).
 *
 * ## One component for six levels, because that is the claim
 *
 * "One gesture, six levels, no mode switch and no new vocabulary at any depth"
 * is the design, and a surface that had a separate screen per level would have
 * broken it before the first zoom. So there is one centre component, it renders
 * a museum card at every level, and what changes is *what the card is about* —
 * a stroke, a shape, a character, a word, a sentence.
 *
 * There are no dead ends: every level renders something and says what it is,
 * including the two the shipped data is thin at.
 *
 * ## The era ground appears only where the domain actually placed the node
 *
 * `attributeNodeEra` places a **word** — and only a single native morpheme, at
 * that, which is 9.8% of the shipped lexemes — and refuses a character by rule.
 * So the register is painted for a placed word and for nothing else, and an
 * unplaced node gets a plain card carrying the attribution's own sentence about
 * why. Picking a layer for an unplaced node would be a guessed era.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { EraAttribution, ScaleNode } from '@bunki/domain';

import { importedStrokeSet } from '../../data/catalog.ts';
import { AttributionFooter } from '../attribution.tsx';
import { RubyText } from '../ruby.tsx';
import { MuseumCard } from '../surface.tsx';
import { SPACE, TYPE, type EraKey } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { DiveGround } from './dive-ground.tsx';

/** Everything the centre needs that the ladder does not carry. */
export interface CentreFacts {
  /** One line of sense. Never a list. */
  readonly caption: string;
  /** Small print under the rule: stroke count, codepoint, where it came from. */
  readonly catalogue: readonly string[];
  /** A reading, when the node has one — a word's ruby. */
  readonly reading: string | null;
  /** The era attribution for this node, when one was computed. */
  readonly era: EraAttribution | null;
  /** The character this stroke belongs to, for an L0 centre. */
  readonly strokeOwner: string | null;
  /** What the card claims and does not. Never folded away. */
  readonly standing: string;
}

const PLACED_ERAS: Readonly<Record<string, EraKey>> = {
  kodo: 'kodo',
  kaido: 'kaido',
  tetsudo: 'tetsudo',
};

export interface DiveCentreProps {
  readonly node: ScaleNode;
  readonly facts: CentreFacts;
  /** Rendered inside the card, above the rule — the lens marks, the strokes. */
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
}

export function DiveCentre({ node, facts, children, testID }: DiveCentreProps): ReactNode {
  const theme = useTheme();

  const placed =
    facts.era !== null && facts.era.placement !== 'unknown'
      ? PLACED_ERAS[facts.era.placement]
      : undefined;

  /*
    A placed word gets its era register under it. Nothing else does, and the
    card that follows says why in the attribution's own words.

    `facts.standing` is used verbatim. This branch used to prepend
    `facts.era?.detail` to it, which printed the 和語/古道 sentence twice
    back-to-back on every placed word, because the caller had already composed
    the same detail into `standing`. Composing a caller's string is this
    component deciding what the caller meant; the caller is the one that knows
    whether the era is already in there, and it does.
  */
  if (placed !== undefined && facts.reading !== null) {
    return (
      <DiveGround
        card={{
          written: node.label,
          reading: facts.reading,
          caption: facts.caption,
          catalogue: facts.catalogue,
          standing: facts.standing,
        }}
        era={placed}
        testID={testID}
      />
    );
  }

  return (
    <MuseumCard
      caption={facts.caption}
      catalogue={facts.catalogue}
      footer={<AttributionFooter lines={[]} standing={facts.standing} />}
      specimen={
        node.level === 'stroke' ? (
          <StrokeSpecimen node={node} owner={facts.strokeOwner} />
        ) : facts.reading !== null ? (
          <RubyText reading={facts.reading} size={TYPE.headword} written={node.label} />
        ) : (
          <Text
            accessibilityLabel={node.label}
            accessible
            style={[styles.glyph, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
            testID={`${testID ?? 'dive-centre'}-glyph`}
          >
            {node.label}
          </Text>
        )
      }
      testID={testID}
    >
      {children}
    </MuseumCard>
  );
}

/**
 * One stroke, drawn alone inside the character it belongs to.
 *
 * The rest of the character is a faint ghost, for the same reason the
 * stroke-order animation keeps one: a stroke shown with no character around it
 * is a squiggle, and where it sits is the whole content.
 */
function StrokeSpecimen({
  node,
  owner,
}: {
  readonly node: ScaleNode;
  readonly owner: string | null;
}): ReactNode {
  const theme = useTheme();
  const set = owner === null ? null : importedStrokeSet(owner);
  const order = node.stroke?.order ?? 0;

  if (set === null) {
    return (
      <Text style={[styles.glyph, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
        {node.label}
      </Text>
    );
  }

  return (
    <View
      accessibilityLabel={`Stroke ${String(order)} of ${String(node.stroke?.of ?? 0)}${
        owner === null ? '' : ` of ${owner}`
      }.`}
      accessibilityRole="image"
      accessible
      style={styles.strokeCanvas}
    >
      <Svg height={160} viewBox={set.viewBox} width={160}>
        {set.strokes.map((stroke) => (
          <Path
            d={stroke.d}
            fill="none"
            key={stroke.id}
            stroke={stroke.order === order ? theme.color.vermilion : theme.color.ink}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={stroke.order === order ? 1 : 0.12}
            strokeWidth={stroke.order === order ? 5 : 3.5}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  glyph: {
    fontSize: TYPE.kanjiHero,
    lineHeight: TYPE.kanjiHero * 1.1,
  },
  strokeCanvas: {
    alignItems: 'center',
    paddingVertical: SPACE.sm,
  },
});
