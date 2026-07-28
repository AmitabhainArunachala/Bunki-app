/**
 * How strongly something is currently recalled — per capability, never in total.
 *
 * ## The shape of the honesty
 *
 * The projection behind these components is a real number for a real thing: how
 * likely one capability of one item is to come back right now. Rendering that
 * number as "87%" would be defensible in isolation and indefensible in
 * aggregate, because the moment two of them appear on one screen a reader will
 * average them, and the average is the global scalar REQ-LM-03 forbids. Bands
 * do not average. "Settled" and "faint" have no midpoint, which is the whole
 * reason to use them.
 *
 * Three rules hold everything here together, and each is checked rather than
 * asserted:
 *
 *   1. **A band never appears without its capability.** `capability` is a
 *      required prop on both components. There is no `'overall'` capability to
 *      pass (`capability.ts`), so "overall strength" cannot be expressed.
 *   2. **A band never appears without a word.** The luminance ramp is the fast
 *      channel, not the only one; every mark carries a text or spoken label, so
 *      the meaning survives a reader who cannot separate the steps.
 *   3. **The two faintest steps only appear inside the meter.** They fall below
 *      3:1 on purpose — the operator asked for dim items to be dim — so they
 *      may only be drawn inside a component that supplies its own identifiable
 *      boundary. `RECALL_BAND_MARKS` declares this and
 *      `test/theme-tokens.test.ts` enforces it against the source.
 *
 * Nothing here writes state. These render a projection; the evidence gate in
 * `packages/domain` is the only thing that can change what they render.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { capabilityOf, type CapabilityId } from './capability.ts';
import { RECALL_BANDS, RECALL_BAND_MARKS, SPACE, TYPE, type RecallBand } from './theme.ts';
import { useTheme } from './theme-context.tsx';

/**
 * The word for each band, as a learner would say it.
 *
 * `unseen` says "no evidence", not "weak" — the difference between "we have
 * measured this and it is poor" and "we have never measured this" is the
 * difference the evidence tiers exist to keep, and a label that blurred it here
 * would undo that at the last inch.
 */
export const RECALL_BAND_LABELS: Readonly<Record<RecallBand, string>> = {
  unseen: 'No evidence yet',
  faint: 'Faint',
  emerging: 'Emerging',
  settled: 'Settled',
  durable: 'Durable',
};

/** How far along the ramp a band sits, for the meter's fill. */
function bandIndex(band: RecallBand): number {
  return RECALL_BANDS.indexOf(band);
}

export interface RecallMarkProps {
  /** Required: a mark with no capability is a mastery score. */
  readonly capability: CapabilityId;
  readonly band: RecallBand;
  /** True when the projection is stale or the evidence is thin. */
  readonly fragile?: boolean | undefined;
  /** Diameter in points. */
  readonly size?: number | undefined;
  readonly testID?: string | undefined;
}

/**
 * A bare mark: one node, no chrome.
 *
 * This is what a map node is made of, so it has to work at 10 points with
 * nothing beside it. Which means the two faintest bands may not use it — see
 * rule 3 in the header — and passing one is a caller error rather than a
 * silently dimmer dot.
 */
export function RecallMark({
  capability,
  band,
  fragile = false,
  size = 14,
  testID,
}: RecallMarkProps): ReactNode {
  const theme = useTheme();
  const mark = RECALL_BAND_MARKS[band];
  if (!mark.standalone) {
    throw new Error(
      `'${band}' is a meter-only band: draw it inside <RecallMeter>, which supplies a boundary and a label`,
    );
  }

  const color = theme.color.recall[band];
  const spoken = `${capabilityOf(capability).label}: ${RECALL_BAND_LABELS[band]}${
    fragile ? ', fragile' : ''
  }`;

  /*
    A fragile mark is drawn as a *ring* with a gap in it, not as a filled disc
    with a dashed edge. The first version did the latter and it was invisible at
    map size: a 2 pt dashed border around a filled circle of the same value is a
    circle. Fragility has to survive being 14 points wide with nothing beside it,
    so it changes the shape — the fill is dropped, the edge is the mark, and the
    dash is what makes it read as incomplete rather than merely smaller.
  */
  const fill = fragile || mark.shape === 'half' ? 'transparent' : color;
  const borderWidth = fragile ? 3 : mark.shape === 'disc' ? 0 : 2;

  return (
    <View
      accessibilityLabel={spoken}
      accessibilityRole="image"
      accessible
      style={[
        styles.mark,
        {
          backgroundColor: fill,
          borderColor: fragile ? theme.color.fragileEdge : color,
          borderRadius: size / 2,
          borderStyle: fragile ? 'dashed' : 'solid',
          borderWidth,
          height: size,
          width: size,
        },
      ]}
      testID={testID}
    >
      {/*
        `durable` gets a ring inside the disc rather than a brighter fill: the
        top of a five-step luminance ramp has nowhere brighter to go, so the
        last step is distinguished by form. That is the same reason the whole
        memory channel has an `EDGE_PATTERNS` half.
      */}
      {mark.shape === 'disc-ring' && !fragile ? (
        <View
          style={[
            styles.innerRing,
            { borderColor: theme.color.paper, borderRadius: size / 2, margin: size * 0.22 },
          ]}
        />
      ) : null}
      {mark.shape === 'half' && !fragile ? (
        <View style={[styles.half, { backgroundColor: color, borderBottomLeftRadius: size / 2 }]} />
      ) : null}
    </View>
  );
}

export interface RecallMeterProps {
  /** Required: a meter with no capability is a mastery score. */
  readonly capability: CapabilityId;
  readonly band: RecallBand;
  readonly fragile?: boolean | undefined;
  /**
   * One line saying where the band came from — the last evidence, in the
   * learner's words. Optional, but a meter with no provenance line is a claim
   * with no citation, and every surface that has the information should pass it.
   */
  readonly basis?: string | undefined;
  readonly testID?: string | undefined;
}

/**
 * The labelled version: capability, band word, and a five-segment track.
 *
 * The track is the identifiable boundary that lets the two faint bands be used
 * at all, and the band word is the non-colour encoding. Segments rather than a
 * continuous bar, because a continuous bar reads as a percentage and a
 * percentage is the thing this must not be.
 */
export function RecallMeter({
  capability,
  band,
  fragile = false,
  basis,
  testID,
}: RecallMeterProps): ReactNode {
  const theme = useTheme();
  const capabilityInfo = capabilityOf(capability);
  const filled = bandIndex(band);
  const spoken = `${capabilityInfo.label}: ${RECALL_BAND_LABELS[band]}${fragile ? ', fragile' : ''}`;

  return (
    <View accessibilityLabel={spoken} accessible style={styles.meter} testID={testID}>
      <View style={styles.meterHead}>
        <Text
          style={[styles.capability, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        >
          {capabilityInfo.label}
        </Text>
        <Text style={[styles.band, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {RECALL_BAND_LABELS[band]}
          {fragile ? ' · fragile' : ''}
        </Text>
      </View>

      <View
        /*
          Hidden from the accessibility tree: the container above already speaks
          the whole thing, and five unlabelled segments underneath it would be
          five more stops for a screen-reader user to walk past.
        */
        aria-hidden
        style={[
          styles.track,
          {
            borderColor: fragile ? theme.color.fragileEdge : theme.color.ruleStrong,
            borderRadius: theme.radius.sm,
            borderStyle: fragile ? 'dashed' : 'solid',
          },
        ]}
      >
        {RECALL_BANDS.map((step, index) => (
          <View
            key={step}
            style={[
              styles.segment,
              {
                backgroundColor:
                  index <= filled ? theme.color.recall[band] : theme.color.uncertainWash,
              },
            ]}
          />
        ))}
      </View>

      {basis === undefined ? null : (
        <Text style={[styles.basis, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {basis}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'stretch',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  innerRing: {
    borderWidth: 1.5,
    flex: 1,
  },
  half: {
    height: '55%',
    width: '100%',
  },
  meter: {
    gap: SPACE.xs,
  },
  meterHead: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: SPACE.sm,
    justifyContent: 'space-between',
  },
  capability: {
    fontSize: TYPE.meta,
    letterSpacing: 0.2,
  },
  band: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  track: {
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    height: 8,
    overflow: 'hidden',
    padding: 1,
  },
  segment: {
    flex: 1,
  },
  basis: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.55,
  },
});
