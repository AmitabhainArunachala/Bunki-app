/**
 * The characters the word is written with (Campaign E / B3).
 *
 * ## The diagnosis this section exists to make possible
 *
 * The fractal-dive brief names it: *"You know 森林 as a word — bright at L3.
 * Dive in and 林 alone is faint at L2. Seeing the inside of a bright node be
 * dark is the diagnosis."* That is only visible if the characters carry their
 * **own** memory state rather than inheriting the word's, so each row here is
 * projected from that character's own component id, not from the headword's.
 *
 * ## Why a meter per row and not a dot
 *
 * `RecallMark` is the dot, and it refuses the two faintest bands by design —
 * they fall below 3:1 and may only be drawn inside a component that supplies
 * its own boundary and word. A row whose commonest state is "no evidence yet"
 * is exactly the case that would hit that refusal, so the row uses the meter,
 * which is bounded, labelled, and legal at every band. The lens the row is
 * about comes from the page's `LensRow`, so one row can never show a blend.
 *
 * ## A character with no page still gets a line
 *
 * `kanjiInWord` returns every character in the headword, including ones this
 * build carries no record for. Those render as a row without a link and say so.
 * Dropping them would leave a learner unable to tell a missing card from a
 * missing character — the dead end the master definition of done forbids, in
 * its quietest form.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RowButton } from '../primitives.tsx';
import { RecallMeter } from '../recall.tsx';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import type { CapabilityId } from '../capability.ts';
import type { KanjiInWord } from './neighbourhood.ts';
import type { LensView } from './memory.ts';

export interface KanjiRow {
  readonly entry: KanjiInWord;
  readonly lens: LensView;
}

export interface WordKanjiProps {
  readonly rows: readonly KanjiRow[];
  /** Which lens the rows are currently about. */
  readonly capability: CapabilityId;
  readonly onOpenKanji: (character: string) => void;
  readonly testID?: string | undefined;
}

export function WordKanji({
  rows,
  capability,
  onOpenKanji,
  testID = 'word-kanji',
}: WordKanjiProps): ReactNode {
  const theme = useTheme();

  return (
    <View style={styles.block} testID={testID}>
      <Text style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        Each character carries its own memory state, on the lens selected above. A word you know
        well can be built from a character you do not — that gap is what this list is for.
      </Text>

      {rows.length === 0 ? (
        <Text style={[styles.note, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          This word is written without kanji.
        </Text>
      ) : null}

      {rows.map(({ entry, lens }) =>
        entry.kanji === null ? (
          <View
            key={entry.character}
            style={[styles.unlinked, { borderColor: theme.color.rule }]}
            testID={`word-kanji-missing-${entry.character}`}
          >
            <Text
              style={[styles.character, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
            >
              {entry.character}
            </Text>
            <Text
              style={[styles.note, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              This build carries no card for this character, so there is nothing to open. It is
              listed because it is in the word.
            </Text>
          </View>
        ) : (
          <RowButton
            accessibilityHint="Opens the kanji page."
            accessibilityLabel={`Kanji ${entry.character}: ${entry.kanji.meanings.join(', ')}`}
            key={entry.character}
            onPress={() => onOpenKanji(entry.character)}
            testID={`word-kanji-${entry.character}`}
          >
            <View style={styles.row}>
              <Text
                style={[
                  styles.character,
                  { color: theme.color.ink, fontFamily: theme.font.mincho },
                ]}
              >
                {entry.character}
              </Text>
              <View style={styles.rowBody}>
                <Text
                  style={[styles.meaning, { color: theme.color.ink, fontFamily: theme.font.sans }]}
                >
                  {entry.kanji.meanings.slice(0, 4).join(' · ')}
                </Text>
                <Text
                  style={[
                    styles.note,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  {String(entry.kanji.strokeCount)} strokes
                  {entry.kanji.onReadings.length === 0
                    ? ''
                    : ` · ${entry.kanji.onReadings.slice(0, 3).join('・')}`}
                  {entry.kanji.kunReadings.length === 0
                    ? ''
                    : ` · ${entry.kanji.kunReadings.slice(0, 3).join('・')}`}
                </Text>
                <RecallMeter
                  band={lens.band}
                  basis={lens.basis}
                  capability={capability}
                  fragile={lens.fragile}
                  testID={`word-kanji-lens-${entry.character}`}
                />
              </View>
            </View>
          </RowButton>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: SPACE.sm,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: SPACE.lg,
  },
  rowBody: {
    flex: 1,
    gap: SPACE.xs,
  },
  unlinked: {
    borderRadius: RADIUS.sm,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  character: {
    fontSize: TYPE.kanjiLarge,
    lineHeight: TYPE.kanjiLarge * 1.08,
  },
  meaning: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.5,
  },
  note: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
