/**
 * One node's mark, at map size (Campaign E / B1).
 *
 * ## Why this is not `RecallIndicator`
 *
 * `RecallIndicator` is the design system's total renderer over the five-step
 * ramp, and it is total by *switching component*: handed one of the two steps
 * `RECALL_BAND_MARKS` declares meter-only, it renders `RecallMeter` — a
 * capability label, a band word, a five-segment track and a basis line. That is
 * the right answer on a card and the wrong one on a map node, which is a
 * 12-point dot with nothing beside it. It is also not a rare case: on a fresh
 * install every node on the map is in one of those two steps, so the map would
 * render a wall of meters where it should render a field of dots.
 *
 * So this composes rather than forks. The three standalone steps are drawn by
 * `RecallMark` itself — same component, same shapes, same colours, one import —
 * and the two states below the standalone floor are drawn here as **form**:
 *
 *   - **nothing observed** — a dotted ring in `uncertainEdge`. Dotted is what
 *     `EDGE_PATTERNS.uncertain` means everywhere else in this system: no
 *     measurement to stand behind. Absence, not weakness.
 *   - **under the floor** — a dashed ring in `fragileEdge`, the same pairing
 *     `EDGE_PATTERNS.fragile` uses: measured, and the projection says it is
 *     slipping. This is what a due item looks like.
 *
 * Both tokens are in `GROUND_CONTRAST_PAIRS`, so `test/theme-ground.test.ts`
 * already checks them at 3:1 against every one of the six era grounds — which is
 * the obligation the meter-only *fills* could not meet and the reason they are
 * meter-only in the first place.
 *
 * ## Nothing here is encoded by colour alone
 *
 * Every mark carries the capability and the state in its spoken label, and the
 * two unlit states differ in dash pattern as well as in token. WCAG 1.4.1 is met
 * by form and by words, exactly as `EDGE_PATTERNS` and `RECALL_BAND_MARKS` meet
 * it for the rest of the memory channel.
 *
 * ## And never one brightness for a whole node
 *
 * `capability` is required, as it is on `RecallMark`. There is no way to ask
 * this component for "the" mark of a node, because a node does not have one.
 */

import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { capabilityOf, type CapabilityId } from '../capability.ts';
import { RecallMark, RECALL_BAND_LABELS } from '../recall.tsx';
import { useFigureTheme } from './era-ground.tsx';
import type { MapMark } from './map-projection.ts';

/** The word for each map mark, spoken and printed. Never colour alone. */
export function markLabel(mark: MapMark): string {
  switch (mark.kind) {
    case 'lit':
      return RECALL_BAND_LABELS[mark.band];
    case 'under-the-floor':
      return 'Under the recall floor';
    default:
      return 'No evidence yet';
  }
}

export interface NodeMarkProps {
  /** Required: a mark with no capability is a mastery score. */
  readonly capability: CapabilityId;
  readonly mark: MapMark;
  /** True when the kernel's fragility policy says this record is slipping. */
  readonly fragile?: boolean | undefined;
  /** Diameter in points. */
  readonly size?: number | undefined;
  readonly testID?: string | undefined;
}

export function NodeMark({
  capability,
  mark,
  fragile = false,
  size = 12,
  testID,
}: NodeMarkProps): ReactNode {
  const theme = useFigureTheme();

  if (mark.kind === 'lit') {
    return (
      <RecallMark
        band={mark.band}
        capability={capability}
        fragile={fragile}
        size={size}
        testID={testID}
      />
    );
  }

  const unlit = mark.kind === 'under-the-floor';
  const spoken = `${capabilityOf(capability).label}: ${markLabel(mark)}`;

  return (
    <View
      accessibilityLabel={spoken}
      accessibilityRole="image"
      accessible
      style={[
        styles.ring,
        {
          borderColor: unlit ? theme.color.fragileEdge : theme.color.uncertainEdge,
          borderRadius: size / 2,
          borderStyle: unlit ? 'dashed' : 'dotted',
          borderWidth: unlit ? 3 : 2,
          height: size,
          width: size,
        },
      ]}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create({
  ring: {
    backgroundColor: 'transparent',
  },
});
