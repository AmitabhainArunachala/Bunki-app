/**
 * One node in a ring, and the interior you can see inside it (lane B2).
 *
 * ## The three channels, kept apart
 *
 * The visual language is explicit about which channel carries what, and this is
 * the component where all three meet:
 *
 *   - **Luminance is recall, per capability.** `RecallIndicator` draws the band
 *     for the lens the surface is currently on. There is no capability-free
 *     mark here and there cannot be — `capability` is a required prop.
 *   - **Form is fragility and uncertainty.** A node whose mark exists but whose
 *     dimension did not survive a reload is drawn as a dashed open ring, not as
 *     a different colour. That survives on any ground and for any learner.
 *   - **Hue is attention only.** The accent marks the centre and nothing else.
 *
 * ## The interior strip is the diagnosis
 *
 * Under each node is a row of small marks: the bands of what that node is *made
 * of*. That row is the whole point of the feature. A word that reads settled
 * above a row of unseen characters is a whole-word memory without a component
 * memory, and you can see it without reading a word of prose. Where the dive did
 * not look inside a member — past its preview budget — the row says so instead
 * of drawing an empty strip that would read as "nothing in there".
 *
 * ## Pressing a node is exposure
 *
 * `onZoom` re-centres the dive. It submits nothing, marks nothing, and grades
 * nothing. This component takes no callback that could.
 */

import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ScaleNode } from '@bunki/domain';

import { type CapabilityId } from '../capability.ts';
import { RecallIndicator, RECALL_BAND_LABELS } from '../recall.tsx';
import { RADIUS, SPACE, TYPE, type RecallBand } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

/** What the surface knows about one node's strength, for the active lens. */
export interface NodeMark {
  readonly band: RecallBand;
  readonly uncertain: boolean;
  /** Where the band came from, in the learner's words. Spoken, and shown on the centre. */
  readonly basis: string;
}

export interface DiveNodeProps {
  readonly node: ScaleNode;
  readonly capability: CapabilityId;
  readonly mark: NodeMark;
  /** One line saying why this node is beside the centre. Always present. */
  readonly because: string;
  /** The bands of what this node is made of, in the order the dive returned them. */
  readonly interior: readonly { readonly id: string; readonly mark: NodeMark }[];
  /** False when the dive's budget stopped it looking inside this one. */
  readonly interiorKnown: boolean;
  readonly onZoom: () => void;
  readonly testID?: string | undefined;
}

export function DiveNode({
  node,
  capability,
  mark,
  because,
  interior,
  interiorKnown,
  onZoom,
  testID,
}: DiveNodeProps): ReactNode {
  const theme = useTheme();

  const interiorSpoken = !interiorKnown
    ? 'Its inside has not been looked at.'
    : interior.length === 0
      ? 'Nothing recorded inside it.'
      : `Inside: ${interior.map((entry) => RECALL_BAND_LABELS[entry.mark.band]).join(', ')}.`;

  return (
    <Pressable
      accessibilityHint="Makes this the centre of the dive. Nothing is recorded."
      accessibilityLabel={`${node.label}. ${because} ${interiorSpoken}`}
      accessibilityRole="link"
      onPress={onZoom}
      style={({ pressed }) => [
        styles.node,
        {
          backgroundColor: theme.color.raised,
          borderColor: theme.color.ruleStrong,
          borderRadius: RADIUS.sm,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      testID={testID}
    >
      <Text
        style={[styles.label, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
        // The mark and the interior strip beside it already carry the whole
        // spoken description on the pressable, so the glyph itself is a
        // duplicate stop on a screen reader's walk.
        aria-hidden
      >
        {node.label}
      </Text>

      <RecallIndicator
        band={mark.band}
        basis={mark.basis}
        capability={capability}
        fragile={mark.uncertain}
        size={12}
      />

      <View aria-hidden style={styles.interior}>
        {!interiorKnown ? (
          <Text
            style={[
              styles.interiorNote,
              { color: theme.color.inkFaint, fontFamily: theme.font.sans },
            ]}
          >
            not looked into
          </Text>
        ) : interior.length === 0 ? (
          <Text
            style={[
              styles.interiorNote,
              { color: theme.color.inkFaint, fontFamily: theme.font.sans },
            ]}
          >
            nothing inside
          </Text>
        ) : (
          interior.map((entry) => (
            <RecallIndicator
              band={entry.mark.band}
              capability={capability}
              fragile={entry.mark.uncertain}
              key={entry.id}
              size={7}
            />
          ))
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  node: {
    alignItems: 'center',
    borderWidth: 1,
    gap: SPACE.xs,
    // 44 pt is the floor `interactive-styles.ts` holds everywhere else; a ring
    // member is a link and gets the same target.
    minHeight: 72,
    minWidth: 56,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.sm,
  },
  label: {
    fontSize: TYPE.headwordRow,
    lineHeight: TYPE.headwordRow * 1.15,
  },
  interior: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    minHeight: 10,
  },
  interiorNote: {
    fontSize: TYPE.meta,
  },
});
