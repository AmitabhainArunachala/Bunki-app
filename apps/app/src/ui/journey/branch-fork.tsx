/**
 * The fork, drawn (Campaign E, lane B5; frozen spec §3, REQ-JRN-02/03).
 *
 * One line comes down, reaches a branch point, and every road available from it
 * is drawn. The road being taken is lit; the roads not being taken are **dimmed
 * and still there**. That is the frozen spec's sentence, and `BranchLight` is
 * the component that already holds it — it floors an unlit branch at
 * `MIN_UNLIT_OPACITY` and will not accept a value that hides one, so "still
 * visible" is enforced by the vocabulary rather than by this file remembering.
 *
 * ## Three things this deliberately does not do
 *
 *   - **It does not colour a rail by state.** Lighting is presence, not hue.
 *     The one accent is spent on the recommended default and on focus, exactly
 *     as everywhere else, and a rail's state is carried by opacity *and* by a
 *     word in its row — never by colour alone (WCAG 1.4.1).
 *   - **It does not celebrate a rejoin.** The closed road curves back to the
 *     main line and that is the whole of it. No burst, no colour change, no
 *     sound: a repair is a fact, and the frozen spec bans the rest.
 *   - **It does not offer a road the domain would refuse.** `Rail.enterable`
 *     mirrors `enterJourneyBranch`'s own guard, so a control that appears is a
 *     control that works.
 *
 * The drawing is hidden from the accessibility tree. Every rail's state and
 * reason is in its row as text, and an unlabelled decorative graphic in the
 * tree is a stop a screen-reader user has to walk past for nothing.
 *
 * ## Why the rails are measured
 *
 * The rows are the content and the drawing follows them, not the other way
 * round: each row reports its own centre through `onLayout` and the geometry is
 * rebuilt from those centres. A fixed row height would have been simpler and
 * would have been wrong the first time a hypothesis wrapped onto three lines —
 * the curve would land beside its row rather than at it. Until the first layout
 * arrives there are no measurements, so no rails are drawn; the trunk and the
 * junction node still are, and the rows are already legible without them
 * because the drawing carries nothing the text does not.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { BranchLight } from '../motion.tsx';
import { AppButton } from '../primitives.tsx';
import { MIN_UNLIT_OPACITY, RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { forkGeometry } from './fork-geometry.ts';
import { RAIL_RESTING_OPACITY, type Rail, type RailState } from './rails.ts';

/** The word beside each rail. The non-colour channel for its state. */
export const RAIL_STATE_WORDS: Readonly<Record<RailState, string>> = Object.freeze({
  taking: 'taking this road',
  open: 'open, not taken',
  closed: 'nowhere to go for this word',
});

/** Where a row's curve should land: its vertical centre. */
interface RowBox {
  readonly top: number;
  readonly height: number;
}

export interface BranchForkProps {
  readonly rails: readonly Rail[];
  /** Enter a road. Absent makes the fork a picture rather than a choice. */
  readonly onTake?: ((rail: Rail) => void) | undefined;
  /** True once the evidence closed the road being taken. */
  readonly rejoined?: boolean | undefined;
  readonly testID?: string | undefined;
}

export function BranchFork({
  rails,
  onTake,
  rejoined = false,
  testID = 'journey-fork',
}: BranchForkProps): ReactNode {
  const theme = useTheme();
  const [boxes, setBoxes] = useState<readonly (RowBox | null)[]>(() => rails.map(() => null));
  const [columnHeight, setColumnHeight] = useState(0);

  const measureRow = useCallback((index: number, box: RowBox) => {
    setBoxes((previous) => {
      const existing = previous[index];
      if (existing?.top === box.top && existing.height === box.height) return previous;
      const next = [...previous];
      // The list can change length between renders (a journey compiled for a
      // different word offers a different set). Growing here rather than
      // resetting keeps a measurement from being lost between the two renders.
      while (next.length <= index) next.push(null);
      next[index] = box;
      return next;
    });
  }, []);

  const centres = rails.map((_, index) => {
    const box = boxes[index];
    return box === undefined || box === null ? null : box.top + box.height / 2;
  });
  const measured = centres.every((centre) => centre !== null);

  const takingIndex = rails.findIndex((rail) => rail.state === 'taking');
  const geometry = forkGeometry({
    rowCentres: measured ? (centres as readonly number[]) : [],
    height: columnHeight,
    rejoinedIndex: rejoined && takingIndex >= 0 ? takingIndex : null,
  });

  return (
    <View style={styles.fork} testID={testID}>
      <View aria-hidden style={styles.gutter}>
        <Svg height={geometry.height} width={geometry.width}>
          <Path
            d={geometry.trunkD}
            stroke={theme.color.ruleStrong}
            strokeLinecap="round"
            strokeWidth={2}
          />
          {geometry.rails.map((path, index) => {
            const rail = rails[index];
            const lit = rail?.state === 'taking';
            return (
              <Path
                d={path.d}
                fill="none"
                key={`rail-${String(index)}`}
                /*
                  Opacity, not colour. The same channel `BranchLight` uses on the
                  row beside it, so the drawing and the text dim together — and
                  the floor is the vocabulary's own `MIN_UNLIT_OPACITY`, so a
                  rail can never be drawn at nothing.
                */
                opacity={Math.max(MIN_UNLIT_OPACITY, RAIL_RESTING_OPACITY[rail?.state ?? 'closed'])}
                stroke={lit ? theme.color.ink : theme.color.ruleStrong}
                strokeLinecap="round"
                strokeWidth={lit ? 2.5 : 1.5}
              />
            );
          })}
          {geometry.rails.map((path, index) =>
            path.rejoinD === null ? null : (
              <Path
                d={path.rejoinD}
                fill="none"
                key={`rejoin-${String(index)}`}
                stroke={theme.color.ink}
                strokeLinecap="round"
                strokeWidth={2.5}
              />
            ),
          )}
          <Circle
            cx={geometry.forkX}
            cy={geometry.forkY}
            fill={theme.color.paper}
            r={4}
            stroke={theme.color.ruleStrong}
            strokeWidth={2}
          />
        </Svg>
      </View>

      <View
        onLayout={(event: LayoutChangeEvent) => setColumnHeight(event.nativeEvent.layout.height)}
        style={styles.rows}
      >
        {rails.map((rail, index) => (
          <RailRow
            key={rail.family}
            onMeasure={(box) => measureRow(index, box)}
            onTake={onTake === undefined ? undefined : () => onTake(rail)}
            rail={rail}
          />
        ))}
      </View>
    </View>
  );
}

function RailRow({
  rail,
  onTake,
  onMeasure,
}: {
  readonly rail: Rail;
  readonly onTake: (() => void) | undefined;
  readonly onMeasure: (box: RowBox) => void;
}): ReactNode {
  const theme = useTheme();

  return (
    /*
      The measurement sits on this outer view rather than on the card inside
      `BranchLight`, because `onLayout` reports a position relative to the
      *parent*: measured one level in, every row would report y = 0 and every
      curve would land on the first one.
    */
    <View
      onLayout={(event: LayoutChangeEvent) =>
        onMeasure({ top: event.nativeEvent.layout.y, height: event.nativeEvent.layout.height })
      }
      style={styles.row}
    >
      <BranchLight
        lit={rail.state === 'taking'}
        restingOpacity={RAIL_RESTING_OPACITY[rail.state]}
        testID={`journey-rail-${rail.family}`}
      >
        <View
          style={[
            styles.card,
            {
              backgroundColor: rail.state === 'closed' ? theme.color.sunken : theme.color.raised,
              borderColor: rail.recommended ? theme.color.vermilion : theme.color.rule,
              borderRadius: RADIUS.md,
              // A recommended default is the one thing on this fork the accent
              // is spent on. It is still only a default (REQ-JRN-03), which the
              // row's own words say.
              borderWidth: rail.recommended ? 2 : 1,
            },
          ]}
        >
          <View style={styles.head}>
            <Text style={[styles.label, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
              {rail.label}
            </Text>
            <Text
              style={[styles.state, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              testID={`journey-rail-state-${rail.family}`}
            >
              {RAIL_STATE_WORDS[rail.state]}
            </Text>
          </View>

          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {rail.hypothesis}
          </Text>

          {rail.closedBecause === null ? (
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {rail.work}
            </Text>
          ) : (
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              testID={`journey-rail-closed-${rail.family}`}
            >
              Drawn and not offered — {rail.closedBecause}.
            </Text>
          )}

          {rail.support.length === 0 ? null : (
            <View style={styles.support}>
              {rail.support.map((line) => (
                <Text
                  key={line}
                  style={[
                    styles.meta,
                    { color: theme.color.inkFaint, fontFamily: theme.font.sans },
                  ]}
                >
                  · {line}
                </Text>
              ))}
            </View>
          )}

          {rail.enterable && onTake !== undefined ? (
            <AppButton
              accessibilityHint={rail.work}
              accessibilityLabel={`Take the ${rail.label} road${rail.recommended ? ', the recommended default' : ''}`}
              label={rail.recommended ? 'Take this road (default)' : 'Take this road'}
              onPress={onTake}
              testID={`journey-take-${rail.family}`}
              variant={rail.recommended ? 'primary' : 'secondary'}
            />
          ) : null}
        </View>
      </BranchLight>
    </View>
  );
}

const styles = StyleSheet.create({
  fork: {
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  gutter: {
    width: 56,
  },
  rows: {
    flex: 1,
    gap: SPACE.md,
  },
  row: {
    justifyContent: 'center',
  },
  card: {
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  head: {
    alignItems: 'baseline',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
    justifyContent: 'space-between',
  },
  label: {
    flexShrink: 1,
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  state: {
    fontSize: TYPE.meta,
  },
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.6,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  support: {
    gap: 2,
  },
});
