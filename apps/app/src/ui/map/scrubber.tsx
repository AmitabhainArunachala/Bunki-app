/**
 * The dual-reading scrubber, as one control (Campaign E / B1).
 *
 * ## The instruction this component answers
 *
 * *"One control, two times: pulled one way it replays the learner's own history
 * from the event log; pulled the other it walks the language's eras. This is the
 * design's best single idea — make the duality legible, not hidden in a mode."*
 *
 * "Not hidden in a mode" is the whole design problem, and it rules out the
 * obvious build. A `History | Eras` segmented control above a slider would be
 * two controls stacked, and a learner who never pressed the second segment would
 * never learn the second time exists. So:
 *
 *   - There is **one row of steps**, running from the learner's oldest recorded
 *     day on the left, through a detent at *now*, to the language's three era
 *     layers on the right. Moving is one gesture along one axis.
 *   - **Both readings are on screen at every position.** The active one is the
 *     heading; the other is `otherDirection`, rendered underneath in the same
 *     voice. Standing at "now" you can read what lies either way without
 *     touching anything, which is what makes the duality legible rather than
 *     discoverable.
 *   - The two ends are **labelled in their own words** — 「あなたの記憶」 and
 *     「言葉の時代」 — so the axis is legible before any step is pressed.
 *
 * ## The asymmetry is honest
 *
 * The left side is as long as the learner's history and is empty for a learner
 * with none; the right side has exactly three stops for everyone, because there
 * are three era layers and there will not be a fourth. `map-scrubber.ts` has the
 * reasoning. Rendering them as one uniform slider would mean inventing history
 * a learner does not have, or eras the language does not have.
 *
 * ## Scrubbing is exposure
 *
 * Pressing a step changes which instant the map projects at. It writes nothing —
 * no event, no grade, no scheduling change. The domain's projection is a read of
 * the log and this control is a read of the projection. Nothing here can reach
 * the evidence gate, and nothing here is a probe.
 *
 * ## Motion
 *
 * None in this component. The steps do not slide, ease, or animate between
 * positions. A scrubber that animated would churn continuously while dragged,
 * which is the ambient motion the design bans and the vertigo risk the
 * fractal-dive brief names.
 *
 * The motion budget for the surface is spent one level up, in `map-screen.tsx`,
 * where each band's field is wrapped in `Settle` keyed on the origin, the lens
 * and this control's position — so moving a step settles the map once and
 * nothing else moves. This paragraph used to say so from here while nothing on
 * the map imported `Settle` at all; it is true now, and it is stated where the
 * code that makes it true can be read beside it.
 */

import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MIN_TOUCH_TARGET, RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { scrubberRange, type ScrubberPosition } from './map-scrubber.ts';

export interface ScrubberProps {
  readonly position: ScrubberPosition;
  readonly historyFrameCount: number;
  readonly onChange: (value: number) => void;
  readonly testID?: string | undefined;
}

/** How many history steps get their own button. */
const MAX_HISTORY_STEPS = 14;

export function Scrubber({
  position,
  historyFrameCount,
  onChange,
  testID,
}: ScrubberProps): ReactNode {
  const theme = useTheme();
  const range = scrubberRange(historyFrameCount);

  /*
    The steps, oldest first. History is thinned to at most `MAX_HISTORY_STEPS`
    buttons — a learner with 400 recorded days gets 14 evenly spaced stops
    rather than 400 targets 3 points wide. The thinning is over the *positions*,
    so every button still lands on a real recorded instant; nothing is
    interpolated into existence.
  */
  const historyStops: number[] = [];
  if (range.min < 0) {
    const span = -range.min;
    const step = Math.max(1, Math.ceil(span / MAX_HISTORY_STEPS));
    for (let value = range.min; value < 0; value += step) historyStops.push(value);
  }
  const stops = [...historyStops, 0, ...Array.from({ length: range.max }, (_, i) => i + 1)];

  return (
    <View style={styles.wrapper} testID={testID}>
      <View style={styles.ends}>
        <Text style={[styles.end, { color: theme.color.inkMuted, fontFamily: theme.font.mincho }]}>
          あなたの記憶
        </Text>
        <Text style={[styles.end, { color: theme.color.inkMuted, fontFamily: theme.font.mincho }]}>
          言葉の時代
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.track}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {stops.map((value) => {
          const current = value === position.value;
          const isNow = value === 0;
          return (
            <Pressable
              accessibilityHint={
                value < 0
                  ? 'Replays your own recorded history at this point.'
                  : value === 0
                    ? 'Returns to now, with every era layer shown.'
                    : 'Walks to this layer of the language’s history.'
              }
              accessibilityLabel={
                value < 0
                  ? `Your history, ${String(-value)} days back`
                  : value === 0
                    ? 'Now'
                    : `The language’s history, layer ${String(value)}`
              }
              accessibilityRole="button"
              aria-current={current ? 'true' : undefined}
              key={value}
              onPress={() => onChange(value)}
              style={({ pressed }) => [
                styles.step,
                isNow ? styles.detent : null,
                {
                  backgroundColor: current ? theme.color.vermilionSoft : 'transparent',
                  borderColor: current ? theme.color.vermilion : theme.color.rule,
                  borderRadius: RADIUS.sm,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
              testID={`scrubber-step-${String(value)}`}
            >
              <Text
                style={[
                  styles.stepLabel,
                  {
                    color: current ? theme.color.ink : theme.color.inkMuted,
                    fontFamily: theme.font.sans,
                  },
                ]}
              >
                {value === 0 ? '今' : value < 0 ? String(value) : `+${String(value)}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/*
        Both readings, always. The heading is what the control is doing; the line
        under it is what the untravelled direction offers. A polite live region,
        because moving the control changes what the whole map is about and a
        sighted reader gets that from the field redrawing.
      */}
      <Text
        accessibilityLiveRegion="polite"
        style={[styles.reading, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        testID={testID === undefined ? undefined : `${testID}-reading`}
      >
        {position.label}
      </Text>
      <Text style={[styles.other, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {position.otherDirection}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: SPACE.xs,
  },
  ends: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  end: {
    fontSize: TYPE.meta,
  },
  track: {
    alignItems: 'center',
    gap: SPACE.xs,
    paddingVertical: SPACE.xs,
  },
  step: {
    alignItems: 'center',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: SPACE.xs,
  },
  /** The detent is wider, so "now" is findable without reading the labels. */
  detent: {
    minWidth: MIN_TOUCH_TARGET + SPACE.md,
  },
  stepLabel: {
    fontSize: TYPE.meta,
  },
  reading: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  other: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
