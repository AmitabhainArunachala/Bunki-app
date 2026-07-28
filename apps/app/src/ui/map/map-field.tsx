/**
 * The plotted neighbourhood: real edges, real marks, tappable everywhere
 * (Campaign E / B1).
 *
 * ## What it draws, and what it cannot draw
 *
 * Lines come from {@link MapLayout.lines}, which `layoutNeighbourhood` built
 * from `Neighbourhood.edges` and nothing else. This component never sees a
 * graph, so **it has no way to invent a connection** — the rule that every edge
 * drawn is an edge the domain holds is enforced by what this file is not given,
 * rather than by care.
 *
 * ## Never one brightness for a whole node
 *
 * REQ-UI-07 forbids collapsing the five capabilities into one mastery light. A
 * node here is drawn as the mark for **the lens the learner has chosen**, and
 * the lens is named in the node's accessibility label and in the chip beside it,
 * so a mark is never a claim about the node in general. Switching lens redraws
 * every node, which is the point: the map looks different through `production`
 * than through `reading`, and that difference is the diagnosis.
 *
 * The four REQ-UI-07 values reach the mark through four separate channels, and
 * no two share one:
 *
 *   - **the recall chance** → luminance, through `NodeMark`'s lit step, and
 *     through form below the lit floor;
 *   - **fragility** → form, a dashed open ring rather than a filled disc;
 *   - **uncertainty** → the node's spoken label, never a colour;
 *   - **coverage** → the same, as a count of contracts and admitted reviews.
 *
 * ## Tappable everywhere, no dead ends
 *
 * Every node is a `Pressable` with a real destination: a lexeme opens its word
 * page, a kanji its kanji page. A `reading` or `component` node has no page in
 * this build, so instead of a dead tap it **re-centres the map on itself** —
 * which is the honest affordance, because its neighbourhood is exactly what it
 * has to offer. Nothing here is inert.
 *
 * ## It paints no ground
 *
 * This file renders text, so it must import none of `GROUND_PAINTING_EXPORTS` —
 * and it does not. It sits *inside* `<EraGround>` and takes its figure palette
 * from `useFigureTheme()`, so its marks resolve against the ground they land on
 * rather than against the app's scheme. Its words sit on opaque chips, which is
 * the museum-card rule discharged one file across from the ground that binds it.
 */

import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { EDGE_PATTERNS, MIN_TOUCH_TARGET, RADIUS, TYPE } from '../theme.ts';
import { capabilityOf, type CapabilityId } from '../capability.ts';
import { useFigureTheme } from './era-ground.tsx';
import type { MapLayout, PlacedPoint } from './map-layout.ts';
import type { MapLensView } from './map-projection.ts';
import { markLabel, NodeMark } from './node-mark.tsx';
import { nodeSubject } from './map-source.ts';

/** The largest square a field is drawn in, in points. */
const MAX_FIELD = 380;
/** The smallest, so a two-node band is still a field rather than a line. */
const MIN_FIELD = 220;
/** Inset so a node at the rim is not clipped by the field's own edge. */
const INSET = 30;

/**
 * How big this band's field should be.
 *
 * Scaled to the number of nodes rather than fixed, because a fixed square is
 * wrong at both ends: a 22-node band needs the room, and a 2-node band drawn in
 * the same square is a mostly-empty rectangle whose mat covers the era ground it
 * is supposed to be showing. The browser capture showed both.
 *
 * Deterministic in the node count alone, so the same band is always the same
 * size — a field that resized on anything else would make "the map moved" and
 * "your memory changed" look alike.
 *
 * The count is this band's own, which it can be because each band is laid out
 * on its own (see `layoutNeighbourhood`). There was a `spread` prop here that
 * carried the *whole walk's* count instead, because the layout used to be one
 * whole-walk layout filtered four ways and shrinking the frame around filtered
 * coordinates pushed neighbours on top of each other. Laying each band out
 * separately removed the reason for the prop, so the prop is gone rather than
 * left as a parameter that looks like it means something.
 */
function fieldSize(nodeCount: number): number {
  return Math.max(MIN_FIELD, Math.min(MAX_FIELD, 150 + nodeCount * 11));
}

export interface MapFieldProps {
  readonly layout: MapLayout;
  /** The lens the map is currently seen through. Always named on screen. */
  readonly lens: CapabilityId;
  /** One lens view per node id, for the chosen lens. Missing means unmeasured. */
  readonly views: ReadonlyMap<string, MapLensView>;
  readonly onOpenNode: (nodeId: string) => void;
  readonly testID?: string | undefined;
}

function place(point: PlacedPoint, size: number): { readonly left: number; readonly top: number } {
  const span = size - INSET * 2;
  return { left: INSET + point.x * span, top: INSET + point.y * span };
}

export function MapField({ layout, lens, views, onOpenNode, testID }: MapFieldProps): ReactNode {
  const theme = useFigureTheme();
  const capability = capabilityOf(lens);
  const size = fieldSize(layout.points.length);

  return (
    <View style={[styles.field, { height: size, width: size }]} testID={testID}>
      {/*
        The lines, under everything, and hidden from the accessibility tree: an
        edge is already spoken by the two nodes it joins, and 40 unlabelled
        line segments would be 40 stops on a screen reader's walk. The relations
        themselves are listed in prose under the field.
      */}
      <Svg aria-hidden height={size} style={StyleSheet.absoluteFill} width={size}>
        {layout.lines.map((line) => {
          const from = place(line.from, size);
          const to = place(line.to, size);
          /*
            A `component_of` edge whose role KANJIDIC2 does not classify is
            drawn `uncertain` — dotted — because that is exactly what the
            pattern means: no measurement to stand behind. Everything else is
            solid. The pattern is form, never hue, so it survives on any ground.
          */
          const pattern =
            line.role === 'unclassified' ? EDGE_PATTERNS.uncertain : EDGE_PATTERNS.solid;
          return (
            <Line
              key={`${line.from.node.id}-${line.to.node.id}-${line.kind}`}
              stroke={line.role === 'unclassified' ? theme.color.uncertainEdge : theme.color.rule}
              // `EDGE_PATTERNS.solid` is the empty array, and an empty dash array
              // is already a solid line — so the token goes through verbatim
              // rather than being branched around, which keeps the pattern the
              // declaration's business rather than this component's.
              strokeDasharray={[...pattern]}
              strokeWidth={1}
              x1={from.left}
              x2={to.left}
              y1={from.top}
              y2={to.top}
            />
          );
        })}
      </Svg>

      {layout.points.map((point) => {
        const view = views.get(point.node.id);
        const subject = nodeSubject(point.node);
        const spokenBand =
          view === undefined
            ? `${capability.label}: not measured`
            : `${capability.label}: ${markLabel(view.mark)}${view.fragile ? ', fragile' : ''}`;
        const position = place(point, size);

        return (
          <Pressable
            accessibilityHint={
              subject?.kind === 'lexeme' || subject?.kind === 'kanji'
                ? 'Opens its page.'
                : 'Centres the map here.'
            }
            accessibilityLabel={`${point.node.label} — ${spokenBand}, ${String(point.depth)} ${point.depth === 1 ? 'hop' : 'hops'} away`}
            accessibilityRole="button"
            key={point.node.id}
            onPress={() => onOpenNode(point.node.id)}
            style={({ pressed }) => [
              styles.node,
              {
                left: position.left - MIN_TOUCH_TARGET / 2,
                opacity: pressed ? 0.7 : 1,
                top: position.top - MIN_TOUCH_TARGET / 2,
              },
            ]}
            testID={`map-node-${point.node.id}`}
          >
            {/*
              The mark carries the number; the chip carries the word. The chip is
              an opaque card — this is where the museum-card rule is discharged
              for text that has to sit over a ground.
            */}
            <View aria-hidden>
              {/*
                Hidden from the accessibility tree, and this is not a shortcut.
                `NodeMark`, and `RecallMark` under it, are `accessible` with
                their own labels — which is right when a mark stands alone on a
                card. Here it sits inside a `Pressable` whose label already names
                the node, the capability and the state, so leaving it exposed
                would make one node two stops saying overlapping things.

                A node with no projection at all draws the same dotted ring as a
                node whose lens has never been observed, and correctly: both mean
                nothing has been measured here. The label above says which.
              */}
              <NodeMark
                capability={lens}
                fragile={view?.fragile ?? false}
                mark={view?.mark ?? { kind: 'nothing-observed' }}
                size={point.depth === 0 ? 18 : 12}
                testID={`map-mark-${point.node.id}`}
              />
            </View>
            <View
              style={[
                styles.chip,
                {
                  backgroundColor: theme.color.raised,
                  borderColor: point.depth === 0 ? theme.color.vermilion : theme.color.rule,
                  borderRadius: RADIUS.sm,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.chipText, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
              >
                {point.node.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    alignSelf: 'center',
    position: 'relative',
  },
  node: {
    alignItems: 'center',
    gap: 2,
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    position: 'absolute',
    width: MIN_TOUCH_TARGET,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    // Wide enough for a three-character headword: the first capture truncated
    // 分ける and 不十分 to an ellipsis, which makes a node unidentifiable.
    maxWidth: 64,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  chipText: {
    fontSize: TYPE.meta,
    textAlign: 'center',
  },
});
