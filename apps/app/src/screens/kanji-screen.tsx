/**
 * Screen 3 — kanji page (WP-05; controller §10.3, REQ-UI-03).
 *
 * Layer 0 is the character, its meaning centre, the reading it carries in the
 * word the learner met, the stroke animation, and the personal state. Layer 1
 * is the compounds actually in the seed, the readings those compounds draw on,
 * the components with their roles where the source gives one, the dimension the
 * learner marked uncertain, and one contrast.
 *
 * **Dictionary indices are never rendered.** REQ-UI-03 is explicit: SKIP,
 * Henshall, NJECD, Gakken, New Nelson, KALD and Daikanwa/Morohashi are join
 * keys in a database and not page content — "a kanji page should feel like a
 * museum card, not a spreadsheet row".
 *
 * WP-05 shipped this file claiming "the Phase-0 seed carries none of them, so
 * there is nothing here to leak". **That was false.** The seed's radical
 * records carry a `kind` naming the classification scheme that assigned them,
 * and two of the ten characters carry the one from Nelson's dictionary — which
 * this page printed verbatim, under a subtitle promising it never would. The
 * source scan in `test/screen-contract.test.ts` missed it because the token
 * arrived through data, not through source text.
 *
 * WP-09 closed it: the components section renders elements only, via
 * `src/data/radical-display.ts`, and no scheme label reaches the page from any
 * value. `test/radical-display.test.ts` scans the rendered strings the seed can
 * actually produce, so the rule now survives a dataset change as well as a
 * source change.
 *
 * Layers 2 and 3 need reading families, sourced phonetic/semantic patterns and
 * full KANJIDIC2 fields. The seed has none of that (LICENSES.md D-1), so those
 * sections state what is missing and why rather than being quietly dropped.
 *
 * Stroke data is the one genuinely third-party thing on this page: KanjiVG,
 * CC BY-SA 3.0, retrieved and licence-verified by WP-04. Its attribution is
 * rendered from the seed's own upstream record.
 */

import { useCallback, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  findKanjiByCharacter,
  readingContextFor,
  seedDataset,
  wordsUsingKanji,
  type SeedKanji,
} from '../data/catalog.ts';
import { parseKanjiVgStrokes, type KanjiStrokeSet } from '../data/kanjivg.ts';
import { radicalDisplay } from '../data/radical-display.ts';
import { KanjiKeepPanel } from './kanji-keep.tsx';
import { useAppSnapshot, useDebugFlags } from '../state/app-context.tsx';
import { UNCERTAINTY_LABELS } from '../state/store.ts';
import { useLookup } from '../state/use-lookup.ts';
import {
  ProvenanceLine,
  ProvenanceTable,
  SeedEntryDisclosure,
  UnsupportedLayer,
} from '../ui/notices.tsx';
import { AppButton, Hairline, RowButton, Section } from '../ui/primitives.tsx';
import { RubyText } from '../ui/ruby.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { StrokeOrder } from '../ui/stroke-order.tsx';
import { SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';

export interface KanjiScreenProps {
  readonly character: string;
  /**
   * The raw KanjiVG text for this character, or `null` when the seed has none.
   * Passed in rather than imported so this component stays free of the Metro
   * `.svg` transformer — see `src/data/stroke-sources.ts`.
   */
  readonly strokeSvg: string | null;
  readonly onOpenWord: (lexemeId: string) => void;
  readonly onBack: () => void;
}

export function KanjiScreen({
  character,
  strokeSvg,
  onOpenWord,
  onBack,
}: KanjiScreenProps): ReactNode {
  const theme = useTheme();
  const flags = useDebugFlags();
  const snapshot = useAppSnapshot();

  const resolve = useCallback(() => findKanjiByCharacter(character), [character]);
  const { state, retry } = useLookup<SeedKanji>(resolve, {
    flags,
    emptyMessage: `“${character}” is not one of the ${String(seedDataset.kanji.length)} kanji in the Phase-0 seed.`,
    emptyDetail: 'This is a seed dataset, not a dictionary.',
  });

  /**
   * Parsing is fallible and its failure is a *different* failure from the
   * lookup's, so it is resolved separately: a character that exists with an
   * unreadable stroke file still gets its meanings, readings and compounds.
   */
  const strokes = useMemo<{ set: KanjiStrokeSet | null; error: string | null }>(() => {
    if (strokeSvg === null) return { set: null, error: null };
    try {
      return { set: parseKanjiVgStrokes(strokeSvg), error: null };
    } catch (cause) {
      return {
        set: null,
        error: cause instanceof Error ? cause.message : 'The stroke file could not be read.',
      };
    }
  }, [strokeSvg]);

  if (state.kind === 'loading') {
    return (
      <ScreenShell testID="screen-kanji" title="Kanji">
        <LoadingPanel label="Looking up…" />
      </ScreenShell>
    );
  }

  if (state.kind === 'error') {
    return (
      <ScreenShell testID="screen-kanji" title="Kanji">
        <ErrorPanel detail={state.detail} message={state.message} onRetry={retry} />
        <AppButton accessibilityHint="Returns to search." label="Back to search" onPress={onBack} />
      </ScreenShell>
    );
  }

  if (state.kind === 'empty') {
    return (
      <ScreenShell testID="screen-kanji" title="Kanji">
        <EmptyPanel detail={state.detail} message={state.message} />
        <AppButton accessibilityHint="Returns to search." label="Back to search" onPress={onBack} />
      </ScreenShell>
    );
  }

  const kanji = state.data;
  const compounds = wordsUsingKanji(kanji.character);
  const readings = readingContextFor(kanji);
  const radicals = radicalDisplay(kanji.radicals);
  const upstream = seedDataset.strokes.upstream;

  // The reading this character carries in a word the learner actually kept —
  // REQ-UI-03 Layer 0 "the actual reading in the encountered word". Only shown
  // when such a thread exists; never inferred from the reading list.
  const encounteredIn =
    snapshot.threads
      .map((thread) =>
        thread.lexemeId === null
          ? null
          : (compounds.find((lexeme) => lexeme.id === thread.lexemeId) ?? null),
      )
      .find((lexeme) => lexeme !== null) ?? null;

  // A thread counts as marked when *either* the app still holds the dimension
  // or the log records that a mark was made. After a reload only the second is
  // true (WP05-D2), and dropping such a thread here would report "nothing marked"
  // about a character the learner did mark.
  const markedThread = snapshot.threads.find(
    (thread) =>
      (thread.uncertainty !== null || thread.markRecordedInLog) &&
      compounds.some((lexeme) => lexeme.id === thread.lexemeId),
  );

  // "One useful contrast" (Layer 1): another seed kanji sharing a component.
  // A real relation in this dataset, or nothing.
  const contrast =
    seedDataset.kanji.find(
      (other) =>
        other.character !== kanji.character &&
        other.components.some((component) => kanji.components.includes(component)),
    ) ?? null;

  return (
    <ScreenShell
      lede={<SeedEntryDisclosure />}
      subtitle="Layers 0 and 1. Dictionary index numbers are database join keys and are never shown here."
      testID="screen-kanji"
      title="Kanji"
    >
      {/* ------------------------------------------------ Layer 0 */}
      <View
        style={[
          styles.hero,
          { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
        ]}
        testID="kanji-layer-0"
      >
        <View style={styles.heroTop}>
          <Text
            accessibilityLabel={`The kanji ${kanji.character}`}
            accessible
            // The hero glyph is laid in the theme's first mineral pigment
            // (Drift fusion §2) — 96pt is display type, and the pigment
            // tokens clear the 3:1 display floor in every theme.
            style={[styles.character, { color: theme.color.pig1, fontFamily: theme.font.mincho }]}
            testID="kanji-character"
          >
            {kanji.character}
          </Text>
          <View style={styles.heroMeaning}>
            <Text
              style={[
                styles.meaningCentre,
                { color: theme.color.ink, fontFamily: theme.font.sans },
              ]}
              testID="kanji-meaning-centre"
            >
              {kanji.meanings[0] ?? ''}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {kanji.meanings.slice(1).join(' · ')}
            </Text>
            <ProvenanceLine field="meanings" record={kanji.provenance.meanings} />
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {String(kanji.strokeCount)} strokes · {kanji.codepoint}
            </Text>
            <Text
              style={[
                styles.personalState,
                {
                  // The accent marks the learner's own frontier. "You have no
                  // thread here" is an absence, not a frontier — spending the
                  // one accent on it would make every unvisited character shout.
                  color:
                    markedThread === undefined ? theme.color.inkMuted : theme.color.frontierMark,
                  fontFamily: theme.font.sans,
                },
              ]}
              testID="kanji-personal-state"
            >
              {markedThread === undefined
                ? 'No thread of yours uses this character yet.'
                : `On your ${markedThread.state.promotion} thread ${markedThread.displayText}`}
            </Text>
          </View>
        </View>

        {encounteredIn === null ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            No kept word of yours contains this character yet, so there is no “reading in the
            encountered word” to show.
          </Text>
        ) : (
          <View style={styles.encountered} testID="kanji-encountered-reading">
            <Text
              style={[styles.label, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              In the word you kept
            </Text>
            <RubyText
              reading={encounteredIn.reading}
              size={TYPE.headwordRow}
              written={encounteredIn.headword}
            />
          </View>
        )}

        {/* Stroke order — Layer 0. Its own loading/error/empty handling. */}
        {strokes.error !== null ? (
          <ErrorPanel
            detail="The rest of this page is unaffected."
            message="The stroke file for this character could not be read."
            testID="kanji-stroke-error"
          />
        ) : strokes.set === null ? (
          <EmptyPanel
            detail="Stroke data comes from KanjiVG and the Phase-0 seed ships it for ten characters only."
            message="No stroke order in the seed for this character."
            testID="kanji-stroke-empty"
          />
        ) : (
          <View style={styles.strokeBlock}>
            <StrokeOrder
              character={kanji.character}
              startRevealed={flags.strokesRevealed}
              strokes={strokes.set}
              testID="kanji-stroke-order"
            />
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {upstream.project} · {upstream.license} · retrieved {upstream.retrievedAt}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {upstream.repository}
            </Text>
          </View>
        )}
      </View>

      {/* ---------------------------------- Keep the encounter (R4-A, P2-18) */}
      <KanjiKeepPanel character={kanji.character} tier="seed" />

      {/* ------------------------------------------------ Layer 1 */}
      <Section
        note="Compounds are the seed words that literally contain this character; nothing is ranked by an invented relevance model."
        testID="kanji-layer-1"
        title="Layer 1 — how you have met it"
      >
        <Text style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          Compounds in the seed
        </Text>
        {compounds.length === 0 ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            No seed word uses this character.
          </Text>
        ) : (
          compounds.map((lexeme) => (
            <RowButton
              accessibilityHint="Opens that word’s page."
              accessibilityLabel={`${lexeme.headword}, read ${lexeme.reading}: ${lexeme.senses.join(', ')}`}
              key={lexeme.id}
              onPress={() => onOpenWord(lexeme.id)}
              testID={`kanji-compound-${lexeme.id}`}
            >
              <RubyText
                reading={lexeme.reading}
                serif={false}
                size={TYPE.body}
                written={lexeme.headword}
              />
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                {lexeme.senses.slice(0, 3).join(' · ')}
              </Text>
            </RowButton>
          ))
        )}

        <Text style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          Readings
        </Text>
        <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
          音 {readings.onReadings.join('・')}
        </Text>
        <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
          訓 {readings.kunReadings.join('・')}
        </Text>
        <ProvenanceLine field="onReadings" record={kanji.provenance.onReadings} />
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          Which reading each compound above uses is not recorded in the seed, so it is not asserted
          here.
        </Text>

        <Text style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          Components
        </Text>
        <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
          {kanji.components.join(' + ')}
        </Text>
        {radicals.elements.length === 0 ? null : (
          <Text
            style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
            testID="kanji-radical-elements"
          >
            Radical: {radicals.elements.join(' · ')}
          </Text>
        )}
        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="kanji-radical-note"
        >
          {radicals.note}
        </Text>
        <ProvenanceLine field="components" record={kanji.provenance.components} />

        <Text style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          Your weakest dimension here
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {markedThread === undefined
            ? 'Nothing marked uncertain on a thread that uses this character.'
            : markedThread.uncertainty === null
              ? `You marked ${markedThread.displayText} as uncertain. Which part was marked before this device stored dimensions durably, so it did not survive the reload.`
              : `You marked ${UNCERTAINTY_LABELS[markedThread.uncertainty.dimension]} on ${markedThread.displayText}.`}
        </Text>

        <Text style={[styles.subheading, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          One contrast
        </Text>
        {contrast === null ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            No other seed kanji shares a component with this one.
          </Text>
        ) : (
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
            {kanji.character} ({kanji.components.join('+')}) vs {contrast.character} (
            {contrast.components.join('+')}) — {contrast.meanings.slice(0, 2).join(' · ')}
          </Text>
        )}
      </Section>

      <Hairline />

      {/* ---------------------------------------------- Layers 2–3 */}
      <Section testID="kanji-layer-2-3" title="Layers 2 and 3">
        <UnsupportedLayer
          reason="Reading families and sourced phonetic/semantic patterns need a licensed character database. None could be retrieved for the Phase-0 seed."
          testID="kanji-layer-2-unfilled"
          title="Reading families, phonetic and semantic patterns"
        />
        <UnsupportedLayer
          reason="Full character-database fields, school grade, frequency and JLPT/Kanken mappings need a licensed source. Dictionary index numbers are excluded on principle as well: REQ-UI-03 makes them join keys, never page content."
          testID="kanji-layer-3-unfilled"
          title="Full character-database fields, grade, frequency, JLPT"
        />
        <ProvenanceTable provenance={kanji.provenance} testID="kanji-provenance-table" />
      </Section>

      <Hairline />
      <AppButton accessibilityHint="Returns to search." label="Back to search" onPress={onBack} />
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: 8,
    borderWidth: 1,
    gap: SPACE.lg,
    padding: SPACE.lg,
  },
  heroTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.lg,
  },
  character: {
    fontSize: TYPE.kanjiHero,
    lineHeight: TYPE.kanjiHero * 1.1,
  },
  heroMeaning: {
    flexBasis: 240,
    flexGrow: 1,
    flexShrink: 1,
    gap: SPACE.xs,
  },
  meaningCentre: {
    fontSize: TYPE.title,
    fontWeight: '600',
  },
  personalState: {
    fontSize: TYPE.label,
    marginTop: SPACE.xs,
  },
  encountered: {
    gap: SPACE.xs,
  },
  strokeBlock: {
    gap: SPACE.xs,
  },
  label: {
    fontSize: TYPE.meta,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  subheading: {
    fontSize: TYPE.label,
    fontWeight: '600',
    marginTop: SPACE.md,
  },
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.7,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
