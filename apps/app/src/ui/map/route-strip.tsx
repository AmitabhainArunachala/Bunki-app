/**
 * The road, with its 一里塚 (Campaign E / B1).
 *
 * ## The one sentence
 *
 * *"Station 11 of 160."* An ordinal count on a named, finite road — not a
 * percentage, not a mastery score, and not a claim about a learner in general.
 * It is the literal answer to the operator's complaint that SRS "never ends",
 * which is why the research calls it load-bearing rather than a flourish.
 *
 * Everything about how it is drawn follows from that:
 *
 *   - **Ticks, not a bar.** A continuous fill reads as a percentage, and a
 *     percentage over a capability lens is the global scalar REQ-LM-03 forbids.
 *     The strip is a row of discrete marks, one per interval, so what the eye
 *     measures is *stations* and the number beside it is the same unit.
 *   - **The lens is in the sentence.** A position exists for `reading` and a
 *     different one for `production`; a strip with no lens named would be the
 *     average of five roads, which is exactly the collapse the requirement bans.
 *   - **The band is in the sentence.** "Reached" has to mean something, and what
 *     it means is stated: settled or better, on this lens, right now.
 *   - **It can go down, and the caption says so.** Retrievability decays; a
 *     station that was reached can stop being reached. A control that could only
 *     grow would be lying about a memory model that genuinely forgets.
 *
 * ## The markers mark the sequence, not a fraction
 *
 * `routeMarkers` emits real ordinals — every tenth station of *this* list, plus
 * the last one so the end of the road is always visible. A 一里塚 stood every
 * *ri*, so a traveller always knew how far they had come; the borrowing is the
 * fixed real interval, not the distance. Converting 3.927 km into a number of
 * kanji would be the invented correspondence the route module refuses.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { capabilityOf } from '../capability.ts';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { MARKER_INTERVAL, routeMarkers, type RoutePosition } from './map-routes.ts';
import { RECALL_BAND_LABELS } from '../recall.tsx';

export interface RouteStripProps {
  readonly position: RoutePosition;
  readonly testID?: string | undefined;
}

export function RouteStrip({ position, testID }: RouteStripProps): ReactNode {
  const theme = useTheme();
  const markers = routeMarkers(position.route);
  const capability = capabilityOf(position.lens);
  const spoken =
    `${position.route.name}: station ${String(position.reached)} of ${String(position.length)}, ` +
    `counting members at ${RECALL_BAND_LABELS[position.atLeast].toLowerCase()} or better on the ${capability.label.toLowerCase()} lens`;

  return (
    <View accessibilityLabel={spoken} accessible style={styles.wrapper} testID={testID}>
      <View style={styles.head}>
        <Text style={[styles.name, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {position.route.name}
        </Text>
        <Text
          style={[styles.sentence, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          testID={testID === undefined ? undefined : `${testID}-sentence`}
        >
          {position.sentence}
        </Text>
      </View>

      {/*
        The road. Hidden from the accessibility tree because the label above
        already speaks the whole thing; a screen-reader user walking sixteen
        unlabelled tick marks learns nothing the sentence did not say.
      */}
      <View aria-hidden style={styles.road}>
        {markers.map((ordinal) => (
          <View
            key={ordinal}
            style={[
              styles.marker,
              {
                backgroundColor:
                  ordinal <= position.reached ? theme.color.recall.settled : 'transparent',
                borderColor:
                  ordinal <= position.reached ? theme.color.recall.settled : theme.color.rule,
                borderRadius: RADIUS.sm,
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        Counting members at {RECALL_BAND_LABELS[position.atLeast].toLowerCase()} or better on the{' '}
        {capability.label.toLowerCase()} lens. This is a count, not a score, and it goes down again
        when something is forgotten.{' '}
        {/*
          The marker sentence is derived from the same call the road is drawn
          from, not written beside it. It used to read "a marker stands every
          {markers[0]} stations", which is the interval only when the road is
          longer than one — on a short road `markers[0]` is the last station, and
          the sentence then claimed an interval nothing used.
        */}
        {markers.length === 1
          ? `The only marker on this road is its last station, ${String(position.length)}.`
          : `A marker stands every ${String(MARKER_INTERVAL)} stations, and the last station is marked too — ${String(markers.length)} markers on this road.`}
      </Text>

      {position.nextStation === null ? (
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          Every station on this road has been reached on this lens.
        </Text>
      ) : (
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.mincho }]}
          testID={testID === undefined ? undefined : `${testID}-next`}
        >
          Next unreached: {position.nextStation.character} (station{' '}
          {String(position.nextStation.ordinal)})
        </Text>
      )}

      <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
        {position.route.rule}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: SPACE.sm,
  },
  head: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
    justifyContent: 'space-between',
  },
  name: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  sentence: {
    fontSize: TYPE.label,
  },
  road: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  marker: {
    borderWidth: 1,
    height: 10,
    width: 10,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
