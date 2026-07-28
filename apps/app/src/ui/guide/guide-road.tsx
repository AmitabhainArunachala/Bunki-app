/**
 * The road, with the guide standing on it (Campaign E / B6; map document §4.1).
 *
 * A finite, numbered list of stations across three era layers, with two marks
 * on it: where the learner is, and where the guide is. That is the whole
 * component — the decisions are in `roadRows`, which is a function and is
 * tested as one.
 *
 * Three things it deliberately does not do:
 *
 *   - **No brightness.** A station carries no recall value, because the guide
 *     has none to show: memory state per capability belongs to the map's marks
 *     and comes from the evidence gate. A road row that dimmed would be the
 *     guide making the claim this lane exists to keep it from making.
 *   - **No progress bar.** The count is ordinal and stated in words — "station
 *     4 of 8" — which is the sentence the competitive research names as the
 *     answer to "it never ends". A bar reads as a percentage, and a percentage
 *     of a learner is forbidden (REQ-LM-03).
 *   - **No colour-only marks.** Each mark is a word and a rule, and the spoken
 *     row states the same thing, so the road survives a reader who cannot see
 *     the marks at all (WCAG 1.4.1).
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  ROUTE_LAYER_BLURBS,
  type GuidePosition,
  type GuideRouteRecord,
  type RouteLayer,
  type WaypointProgress,
} from '@bunki/domain';

import { Settle } from '../motion.tsx';
import { AppButton, RowButton } from '../primitives.tsx';
import { Surface } from '../surface.tsx';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { learnerHeadline, positionHeadline, roadRows, type RoadRow } from './guide-view-model.ts';

export interface GuideRoadProps {
  readonly route: GuideRouteRecord;
  readonly progress: readonly WaypointProgress[];
  readonly position: GuidePosition;
  readonly onOpenWord: (targetForm: string) => void;
  readonly onRemove: (waypointId: string) => void;
  readonly onMove: (waypointId: string, delta: -1 | 1) => void;
  readonly testID?: string | undefined;
}

function Row({
  row,
  onOpenWord,
  onRemove,
  onMove,
}: {
  readonly row: RoadRow;
  readonly onOpenWord: (targetForm: string) => void;
  readonly onRemove: (waypointId: string) => void;
  readonly onMove: (waypointId: string, delta: -1 | 1) => void;
}): ReactNode {
  const theme = useTheme();
  const marked = row.mark !== 'plain';

  return (
    <View style={styles.row} testID={`guide-road-row-${row.waypointId}`}>
      <View
        style={[
          styles.spine,
          {
            backgroundColor: marked ? theme.color.vermilion : theme.color.rule,
            width: marked ? 3 : 1,
          },
        ]}
      />
      <View style={styles.rowBody}>
        <RowButton
          accessibilityHint="Opens the word page for this station."
          accessibilityLabel={row.spoken}
          onPress={() => onOpenWord(row.targetForm)}
          testID={`guide-road-open-${row.waypointId}`}
        >
          <View style={styles.rowHead}>
            <Text
              style={[styles.ordinal, { color: theme.color.inkFaint, fontFamily: theme.font.mono }]}
            >
              {row.ordinal} / {row.total}
            </Text>
            <Text
              style={[styles.layer, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {row.layerName}
            </Text>
          </View>
          <Text style={[styles.name, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
            {row.name}
          </Text>
          <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            {row.note}
          </Text>
          <Text style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
            {row.progress}
          </Text>
        </RowButton>

        {row.mark === 'plain' ? null : (
          <Text
            style={[
              styles.mark,
              {
                borderColor: theme.color.vermilion,
                color: theme.color.vermilion,
                fontFamily: theme.font.sans,
              },
            ]}
            testID={`guide-road-mark-${row.waypointId}`}
          >
            {row.mark === 'both_here'
              ? 'you and the guide are here'
              : row.mark === 'guide_here'
                ? 'the guide is here'
                : 'you are here'}
          </Text>
        )}

        {!row.atDeclaredFork ? null : (
          <Text
            style={[
              styles.mark,
              {
                borderColor: theme.color.ruleStrong,
                color: theme.color.ink,
                fontFamily: theme.font.sans,
              },
            ]}
            testID={`guide-road-fork-${row.waypointId}`}
          >
            a fork was declared here
          </Text>
        )}

        <View style={styles.rowActions}>
          <AppButton
            accessibilityLabel={`Move ${row.name} one station earlier`}
            label="↑"
            onPress={() => onMove(row.waypointId, -1)}
            testID={`guide-road-up-${row.waypointId}`}
            variant="quiet"
          />
          <AppButton
            accessibilityLabel={`Move ${row.name} one station later`}
            label="↓"
            onPress={() => onMove(row.waypointId, 1)}
            testID={`guide-road-down-${row.waypointId}`}
            variant="quiet"
          />
          <AppButton
            accessibilityHint="Removes this station from the road. The earlier route is kept."
            accessibilityLabel={`Take ${row.name} off this road`}
            label="Take off the road"
            onPress={() => onRemove(row.waypointId)}
            testID={`guide-road-remove-${row.waypointId}`}
            variant="quiet"
          />
        </View>
      </View>
    </View>
  );
}

export function GuideRoad({
  route,
  progress,
  position,
  onOpenWord,
  onRemove,
  onMove,
  testID = 'guide-road',
}: GuideRoadProps): ReactNode {
  const theme = useTheme();
  const rows = roadRows(route, progress, position);
  const layers = [...new Set(rows.map((row) => row.layer))] as RouteLayer[];

  return (
    <Settle>
      <Surface level="well" pad="lg" testID={testID}>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.headline, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          testID="guide-position-headline"
        >
          {positionHeadline(position)}
        </Text>
        <Text
          style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="guide-position-learner"
        >
          {learnerHeadline(position)}
        </Text>
        <Text
          style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="guide-position-because"
        >
          {position.because}
        </Text>

        <View style={styles.rows}>
          {rows.map((row) => (
            <Row
              key={row.waypointId}
              onMove={onMove}
              onOpenWord={onOpenWord}
              onRemove={onRemove}
              row={row}
            />
          ))}
        </View>

        <View style={styles.legend}>
          {layers.map((layer) => (
            <Text
              key={layer}
              style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
            >
              {ROUTE_LAYER_BLURBS[layer]}
            </Text>
          ))}
        </View>
      </Surface>
    </Settle>
  );
}

const styles = StyleSheet.create({
  headline: {
    fontSize: TYPE.title,
    fontWeight: '600',
  },
  rows: {
    gap: SPACE.md,
    marginTop: SPACE.lg,
  },
  row: {
    flexDirection: 'row',
    gap: SPACE.md,
  },
  spine: {
    borderRadius: RADIUS.sm,
  },
  rowBody: {
    flex: 1,
    gap: SPACE.xs,
  },
  rowHead: {
    flexDirection: 'row',
    gap: SPACE.md,
  },
  ordinal: {
    fontSize: TYPE.meta,
  },
  layer: {
    fontSize: TYPE.meta,
  },
  name: {
    fontSize: TYPE.headwordRow,
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  mark: {
    alignSelf: 'flex-start',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    fontSize: TYPE.meta,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
  },
  rowActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  legend: {
    gap: SPACE.xs,
    marginTop: SPACE.lg,
  },
});
