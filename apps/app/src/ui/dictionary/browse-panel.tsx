/**
 * The browse shelves, drawn.
 *
 * The arguments for what each axis is are in `src/data/browse.ts`; this file is
 * the drawing. Three decisions worth stating:
 *
 * **Every axis and every shelf is closed by default.** Four axes with a hundred
 * shelves between them, opened, would be the "database rendered as table views"
 * failure frozen §10.1 diagnoses in renzo. Closed, with a count, they are an
 * index — you open the one you want.
 *
 * **Each shelf says where it came from**, once per axis, in the axis's own note.
 * A grouping a learner cannot check is a grouping they have to trust.
 *
 * **Characters are a wrapping grid of tap targets, never a fixed-column table.**
 * A table with a column count would either overflow a 360 px viewport or force a
 * horizontal scroll, and `apps/app/e2e/viewport-overflow.spec.ts` measures
 * exactly that.
 */

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { browseAxes, INDEXES_NOT_BUILT, type BrowseAxis } from '../../data/browse.ts';
import { Disclosure } from '../disclosure.tsx';
import { Section } from '../primitives.tsx';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

/** How many characters one shelf shows before it says how many are left. */
export const SHELF_PREVIEW = 60;

export interface BrowsePanelProps {
  readonly onOpenKanji: (character: string) => void;
  readonly testID?: string | undefined;
}

export function BrowsePanel({ onOpenKanji, testID }: BrowsePanelProps): ReactNode {
  const theme = useTheme();
  const axes = browseAxes();

  return (
    <Section
      note="A dictionary you can only query is a lookup box. Every shelf here is a field the licensors ship — nothing is inferred, scored, or clustered."
      testID={testID ?? 'dictionary-browse'}
      title="Browse"
    >
      {axes.map((axis) => (
        <AxisBlock axis={axis} key={axis.id} onOpenKanji={onOpenKanji} />
      ))}
      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {INDEXES_NOT_BUILT}
      </Text>
    </Section>
  );
}

function AxisBlock({
  axis,
  onOpenKanji,
}: {
  readonly axis: BrowseAxis;
  readonly onOpenKanji: (character: string) => void;
}): ReactNode {
  const theme = useTheme();

  return (
    <Disclosure
      count={axis.shelves.length}
      note={axis.derivation}
      testID={`browse-axis-${axis.id}`}
      title={axis.label}
    >
      <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
        {axis.derivation}
      </Text>
      {axis.shelves.map((shelf) => (
        <Disclosure
          count={shelf.count}
          key={shelf.id}
          testID={`browse-shelf-${shelf.id}`}
          title={shelf.label}
        >
          <View style={styles.grid}>
            {shelf.characters.slice(0, SHELF_PREVIEW).map((kanji) => (
              <Pressable
                accessibilityHint="Opens its kanji page."
                accessibilityLabel={`${kanji.character}: ${kanji.meanings.slice(0, 3).join(', ')}`}
                accessibilityRole="button"
                key={kanji.id}
                onPress={() => onOpenKanji(kanji.character)}
                style={({ pressed }) => [
                  styles.cell,
                  {
                    backgroundColor: theme.color.raised,
                    borderColor: theme.color.rule,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
                testID={`browse-cell-${kanji.character}`}
              >
                <Text
                  style={[
                    styles.cellText,
                    { color: theme.color.ink, fontFamily: theme.font.mincho },
                  ]}
                >
                  {kanji.character}
                </Text>
              </Pressable>
            ))}
          </View>
          {shelf.count <= SHELF_PREVIEW ? null : (
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {String(shelf.count - SHELF_PREVIEW)} more on this shelf. Search for one directly, or
              reach it from a word that uses it.
            </Text>
          )}
        </Disclosure>
      ))}
    </Disclosure>
  );
}

const styles = StyleSheet.create({
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xs,
  },
  cell: {
    alignItems: 'center',
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    justifyContent: 'center',
    // 44 is the touch-target floor `test/touch-targets.test.ts` enforces, and it
    // is also small enough that eight fit across a 360 px column.
    minHeight: 44,
    minWidth: 44,
  },
  cellText: {
    fontSize: TYPE.headwordRow,
  },
});
