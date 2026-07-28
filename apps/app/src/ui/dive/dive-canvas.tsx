/**
 * The dive surface: rings around a centre, and the flight between centres
 * (lane B2).
 *
 * ## The layout follows the real graph, and nothing else
 *
 * There is no mirror symmetry here and there is no kaleidoscope. The reference
 * images are bilaterally symmetric and beautiful, and symmetry would be a lie:
 * a mirrored 森 is not a kanji, and a reflected node implies a relationship that
 * does not exist. So the arrangement is the plainest one that is *true* — the
 * ring one step out above the centre, the ring one step in below it, each ring
 * a wrapped row in the order the domain returned.
 *
 * The one connector drawn is a rule between the centre and each ring, and it is
 * drawn because it is true: **every** member of a ring has an edge to the
 * centre. No line is ever drawn between two ring members, because whether *they*
 * are connected is a different question this view did not ask.
 *
 * ## Continuous zoom, one gesture, no mode
 *
 * Pressing any node makes it the centre. That is the only gesture, it is the
 * same at all six levels, and no new vocabulary appears at depth. The flight is
 * a scale-and-fade over `resolveDuration('settle')`: inward arrives *large and
 * settling down*, outward arrives *small and settling up*, so the direction of
 * travel is legible from the motion itself.
 *
 * ## Reduced motion is a stepped dive, and that is a WCAG obligation
 *
 * `useReducedMotion` and `resolveDuration` already exist for exactly this, so
 * this is wiring rather than invention: under reduction the duration is zero, the
 * scale never leaves 1, and each level simply arrives. There is no second
 * rendering path — the same component runs both ways, so the stepped variant
 * cannot rot separately — and `DiveChrome` says on screen which of the two is
 * running.
 *
 * ## Level of detail is the domain's, and it is reported
 *
 * This component draws exactly what `diveAt` materialised and asks for nothing
 * more. What the budgets cut is stated under the ring it cut, with the number.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import {
  SCALE_LEVEL_NAMES,
  type RelationBucket,
  type ScaleGap,
  type ScaleRing,
  type ScaleView,
} from '@bunki/domain';

import type { CapabilityId } from '../capability.ts';
import { useReducedMotion } from '../motion.tsx';
import { RADIUS, SPACE, TYPE, resolveDuration } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { RING_DISPLAY_LIMIT } from './dive-detail.ts';
import { DiveNode, type NodeMark } from './dive-node.tsx';
import type { FlightDirection } from './dive-state.ts';

/**
 * How many members of one ring are drawn on the canvas.
 *
 * Separate from the domain's own `perLevel` budget, and deliberately smaller.
 * The dive materialises up to sixty so the page below can rank a character's
 * *complete* set by JMdict's own commonness; the ring is a ring, and a ring of
 * sixty is a list. Eight is what a person takes in at a glance.
 *
 * The number itself now lives in `dive-detail.ts`, next to the section's own
 * cut, and is re-exported here so existing readers of this module still find it.
 * The reason for the move is in that file's docblock and it is not tidiness: a
 * caption can only be honest about "the rest" if one module can see both cuts.
 */
export { RING_DISPLAY_LIMIT };

/** How a relation reads out loud, so every drawn edge cites what produced it. */
export const BASIS_PHRASES: Readonly<Record<string, string>> = {
  component_of: 'a component of it, from KanjiVG’s own shape annotation',
  contains: 'written with it, from the dictionary’s own character list',
  has_reading: 'shares a reading with it',
  has_sense: 'a sense of it',
  contrasts_with: 'recorded as confusable with it',
  collocates_with: 'recorded as collocating with it',
  derives_from: 'derived from it',
  realises: 'realises it',
  appeared_in: 'where you met it',
  kanjivg_stroke: 'one of its strokes, from KanjiVG',
  writing_order: 'another stroke of the same character',
  collocation_member: 'part of this phrase',
  collocation_of: 'a phrase it is part of',
};

export function phraseForBasis(basis: string): string {
  return BASIS_PHRASES[basis] ?? `related to it (${basis})`;
}

/** The heading over a ring. Says the direction *and* the level, in both scripts. */
function ringTitle(ring: ScaleRing): string {
  const name = SCALE_LEVEL_NAMES[ring.level];
  const direction =
    ring.bucket === 'inward'
      ? 'what it is made of'
      : ring.bucket === 'outward'
        ? 'what it makes'
        : 'beside it';
  return `${direction} — ${name.written} ${name.gloss}`;
}

export interface DiveCanvasProps {
  readonly view: ScaleView;
  readonly capability: CapabilityId;
  /** The band for one node, for the active lens. Pure; the screen supplies it. */
  readonly markFor: (nodeId: string) => NodeMark;
  readonly onZoom: (nodeId: string) => void;
  /** The specimen in the middle. Composed by the screen so the detail lives there. */
  readonly centreSlot: ReactNode;
  /** Which way the last move went, so the flight can fly the right way. */
  readonly direction: FlightDirection;
  readonly testID?: string | undefined;
}

export function DiveCanvas({
  view,
  capability,
  markFor,
  onZoom,
  centreSlot,
  direction,
  testID,
}: DiveCanvasProps): ReactNode {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const duration = resolveDuration('settle', reduced);
  const centreId = view.centre?.id ?? '';

  /*
    One animated value, restarted whenever the centre changes. Under reduced
    motion `duration` is 0 and `setValue(1)` lands it complete on the first
    frame — the same code, no branch, no second rendering of the surface.
  */
  const progress = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (duration === 0) {
      progress.setValue(1);
      return;
    }
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration,
      useNativeDriver: false,
    });
    animation.start();
    return () => {
      animation.stop();
    };
  }, [centreId, direction, duration, progress]);

  // Inward arrives large and settles down; outward arrives small and settles up.
  // A lateral move gets no scale at all, because nothing about the scale changed.
  const from = direction === 'in' ? 1.18 : direction === 'out' ? 0.86 : 1;
  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [from, 1] });
  const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] });

  const inward = view.rings.filter((ring) => ring.bucket === 'inward');
  const outward = view.rings.filter((ring) => ring.bucket === 'outward');
  const alongside = view.rings.filter((ring) => ring.bucket === 'alongside');

  return (
    <Animated.View style={[styles.canvas, { opacity, transform: [{ scale }] }]} testID={testID}>
      {/*
        Outward furthest-first, so reading down the page is going in. This is a
        display order over the rings the domain returned; no ring is created,
        merged or reordered within itself.
      */}
      {[...outward].reverse().map((ring) => (
        <Ring
          capability={capability}
          key={`${ring.bucket}-${ring.level}`}
          markFor={markFor}
          onZoom={onZoom}
          ring={ring}
        />
      ))}
      {gapsFor(view.gaps, 'outward').map((gap) => (
        <GapLine gap={gap} key={`gap-outward-${gap.level}`} />
      ))}

      <View style={[styles.spine, { backgroundColor: theme.color.rule }]} aria-hidden />
      <View testID="dive-centre">{centreSlot}</View>
      <View style={[styles.spine, { backgroundColor: theme.color.rule }]} aria-hidden />

      {alongside.map((ring) => (
        <Ring
          capability={capability}
          key={`${ring.bucket}-${ring.level}`}
          markFor={markFor}
          onZoom={onZoom}
          ring={ring}
        />
      ))}

      {inward.map((ring) => (
        <Ring
          capability={capability}
          key={`${ring.bucket}-${ring.level}`}
          markFor={markFor}
          onZoom={onZoom}
          ring={ring}
        />
      ))}
      {gapsFor(view.gaps, 'inward').map((gap) => (
        <GapLine gap={gap} key={`gap-inward-${gap.level}`} />
      ))}
    </Animated.View>
  );
}

function gapsFor(gaps: readonly ScaleGap[], bucket: RelationBucket): readonly ScaleGap[] {
  return gaps.filter((gap) => gap.bucket === bucket);
}

function Ring({
  ring,
  capability,
  markFor,
  onZoom,
}: {
  readonly ring: ScaleRing;
  readonly capability: CapabilityId;
  readonly markFor: (nodeId: string) => NodeMark;
  readonly onZoom: (nodeId: string) => void;
}): ReactNode {
  const theme = useTheme();
  const drawn = ring.members.slice(0, RING_DISPLAY_LIMIT);

  return (
    <View style={styles.ring} testID={`dive-ring-${ring.bucket}-${ring.level}`}>
      <Text
        accessibilityRole="header"
        style={[styles.ringTitle, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
      >
        {ringTitle(ring)}
      </Text>
      <View style={styles.ringRow}>
        {drawn.map((member) => (
          <DiveNode
            because={phraseForBasis(member.basis)}
            capability={capability}
            interior={member.preview.map((node) => ({ id: node.id, mark: markFor(node.id) }))}
            interiorKnown={member.previewMaterialised}
            key={member.node.id}
            mark={markFor(member.node.id)}
            node={member.node}
            onZoom={() => onZoom(member.node.id)}
            testID={`dive-node-${member.node.id}`}
          />
        ))}
      </View>
      {drawn.length < ring.available ? (
        <Text
          style={[styles.ringNote, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
          testID={`dive-ring-cut-${ring.bucket}-${ring.level}`}
        >
          {/*
            The caption speaks about the ring and nothing else.

            It used to end "The sections below list all of them, ranked", which
            was false twice over: the section has its own cut of eight, and it
            ranks by commonness while the ring takes the graph's order, so the
            two are not even the same eight. A ring drawn by this component can
            appear on a page that has no section at all, so it is not in a
            position to make any claim about what is underneath it. The section
            that *does* know both numbers says so itself — see
            `compoundsDisclosure` in `dive-detail.ts`.
          */}
          {ring.truncated
            ? `Drawing ${String(drawn.length)} of the ${String(ring.available)} the graph holds here, in the order it holds them; the dive itself kept ${String(ring.members.length)}.`
            : `Drawing ${String(drawn.length)} of ${String(ring.available)}, in the order the graph holds them.`}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A level with nothing in it, said out loud.
 *
 * Dashed, quiet, and carrying the domain's own sentence verbatim. The alternative
 * — drawing nothing — makes an empty ring read as a claim that the relation does
 * not exist, which is the difference between an incomplete page and a misleading
 * one.
 */
function GapLine({ gap }: { readonly gap: ScaleGap }): ReactNode {
  const theme = useTheme();
  const name = SCALE_LEVEL_NAMES[gap.level];
  return (
    <View
      style={[styles.gap, { borderColor: theme.color.rule, borderRadius: RADIUS.sm }]}
      testID={`dive-gap-${gap.bucket}-${gap.level}`}
    >
      <Text style={[styles.gapTitle, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {name.written} {name.gloss} — nothing here
      </Text>
      <Text style={[styles.ringNote, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
        {gap.detail}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    gap: SPACE.lg,
  },
  ring: {
    gap: SPACE.sm,
  },
  ringTitle: {
    fontSize: TYPE.meta,
    letterSpacing: 0.3,
  },
  ringRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  ringNote: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  spine: {
    alignSelf: 'center',
    height: SPACE.lg,
    width: StyleSheet.hairlineWidth * 3,
  },
  gap: {
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 2,
    padding: SPACE.md,
  },
  gapTitle: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
});
