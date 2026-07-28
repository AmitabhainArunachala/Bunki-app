/**
 * The design specimen — every token and every component of the experience
 * layer's vocabulary, on one page, in real Japanese.
 *
 * ## Why this route exists
 *
 * Two audiences. The operator, who said the Phase-0 UI was a far cry from the
 * vision and now needs one page to look at rather than ten screens to infer a
 * system from; and the surface lanes, who need to see the vocabulary before
 * adopting it, because a design system that is only readable as source gets
 * reinvented per screen.
 *
 * It is a specimen, not a product screen. It renders the vocabulary and nothing
 * else: no store, no commands, no evidence. Every piece of Japanese on it is
 * real content from `@bunki/seed` (`specimen-content.ts` says why that matters),
 * and every colour it prints is read out of the theme rather than typed.
 *
 * ## What a reviewer should be able to check from it
 *
 *   - both schemes are designed, not one inverted (open it twice);
 *   - the reading register and the chrome register are visibly different faces;
 *   - furigana sits where it should and is announced once, not twice;
 *   - the frontier marks are quiet, and there are exactly two of them;
 *   - recall strength is never shown without the capability it belongs to;
 *   - motion draws, settles and lights, and stops entirely under reduced motion;
 *   - the four REQ-UI-09 states exist and look like the same family.
 */

import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg from 'react-native-svg';

import { findLexemeById, findKanjiByCharacter } from '../../data/catalog.ts';
import { parseKanjiVgStrokes } from '../../data/kanjivg.ts';
import { AttributionFooter } from '../attribution.tsx';
import { CAPABILITY_IDS, type CapabilityId } from '../capability.ts';
import { Disclosure } from '../disclosure.tsx';
import { FrontierPassage } from '../frontier.tsx';
import { LensRow } from '../lens.tsx';
import { SeedEntryDisclosure } from '../notices.tsx';
import { BranchLight, InkDraw, Settle, useReducedMotion } from '../motion.tsx';
import { AppButton, ChipButton } from '../primitives.tsx';
import { RecallMark, RecallMeter } from '../recall.tsx';
import { RubyText } from '../ruby.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel, OfflineBanner } from '../screen-state.tsx';
import { MuseumCard, Surface } from '../surface.tsx';
import { contrastRatio } from '../contrast.ts';
import { DURATION, EASING, RADIUS, RECALL_BANDS, SPACE, TYPE, paletteLeaves } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { VerticalRun } from '../vertical.tsx';
import {
  OVERWHELMED_SPANS,
  PASSAGE,
  PASSAGE_SPANS,
  SPECIMEN_KANJI,
  SPECIMEN_LEXEME_ID,
  VERTICAL_SPECIMEN,
} from './specimen-content.ts';
import { SpecimenRow, SpecimenSection, Swatch } from './specimen.tsx';

export interface StyleGuidePageProps {
  /**
   * KanjiVG text for the stroke specimen, passed in by the route.
   *
   * Same reason as the kanji page: `src/data/stroke-sources.ts` can only be
   * loaded by the bundler, so keeping that import at the route leaves this
   * component renderable anywhere.
   */
  readonly strokeSvg: string | null;
}

export function StyleGuidePage({ strokeSvg }: StyleGuidePageProps): ReactNode {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [lens, setLens] = useState<CapabilityId>('reading');
  const [litBranch, setLitBranch] = useState<'form' | 'meaning' | 'usage'>('form');
  const [drawing, setDrawing] = useState(true);
  const [furigana, setFurigana] = useState(true);

  const lexeme = findLexemeById(SPECIMEN_LEXEME_ID);
  const kanji = findKanjiByCharacter(SPECIMEN_KANJI);
  const strokes = strokeSvg === null ? null : parseKanjiVgStrokes(strokeSvg);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={[styles.scroll, { backgroundColor: theme.color.paper }]}
      testID="style-guide"
    >
      <View style={[styles.measure, { maxWidth: theme.measure }]}>
        <Settle>
          <Text
            accessibilityRole="header"
            style={[styles.pageTitle, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
          >
            分岐 — design specimen
          </Text>
          <Text style={[styles.lede, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            Every token and component of the experience layer, in the {theme.scheme} scheme. The
            Japanese on this page is the seed corpus, not filler. Reduced motion is currently{' '}
            {reduced ? 'on' : 'off'}.
          </Text>
        </Settle>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Ink and paper with one vermilion accent. Nothing else on this page carries a hue: recall strength is luminance, and fragility and uncertainty are dash patterns. That is how one accent and a five-step memory channel coexist."
          testID="specimen-colour"
          title="Colour"
        >
          <View style={styles.swatches}>
            {paletteLeaves(theme.color).map((leaf) => (
              <Swatch
                key={leaf.path}
                edge={leaf.path.endsWith('Edge')}
                label={leaf.path}
                ratio={contrastRatio(leaf.value, theme.color.paper)}
                value={leaf.value}
              />
            ))}
          </View>
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Mincho for what is read, sans for what is read past. Both are self-hosted subsets — Shippori Mincho and Noto Sans JP — so a host with no CJK serif still gets the reading register."
          testID="specimen-type"
          title="Type"
        >
          <SpecimenRow label="kanjiHero 96">
            <Text
              style={[
                styles.specimenText,
                {
                  color: theme.color.ink,
                  fontFamily: theme.font.mincho,
                  fontSize: TYPE.kanjiHero,
                  lineHeight: TYPE.kanjiHero * theme.leading.display,
                },
              ]}
            >
              岐
            </Text>
          </SpecimenRow>
          <SpecimenRow label="headword 44">
            <Text
              style={[
                styles.specimenText,
                {
                  color: theme.color.ink,
                  fontFamily: theme.font.mincho,
                  fontSize: TYPE.headword,
                  lineHeight: TYPE.headword * theme.leading.tight,
                },
              ]}
            >
              分岐点
            </Text>
          </SpecimenRow>
          <SpecimenRow label="body 17 mincho">
            <Text
              style={[
                styles.specimenText,
                {
                  color: theme.color.ink,
                  fontFamily: theme.font.mincho,
                  fontSize: TYPE.body,
                  lineHeight: TYPE.body * theme.leading.japanese,
                },
              ]}
            >
              {PASSAGE.body.slice(0, 60)}
            </Text>
          </SpecimenRow>
          <SpecimenRow label="body 17 sans">
            <Text
              style={[
                styles.specimenText,
                {
                  color: theme.color.ink,
                  fontFamily: theme.font.sans,
                  fontSize: TYPE.body,
                  lineHeight: TYPE.body * theme.leading.japanese,
                },
              ]}
            >
              {PASSAGE.body.slice(0, 60)}
            </Text>
          </SpecimenRow>
          <SpecimenRow label="label 15 / meta 13">
            <View style={styles.stack}>
              <Text
                style={[
                  styles.specimenText,
                  { color: theme.color.ink, fontFamily: theme.font.sans, fontSize: TYPE.label },
                ]}
              >
                訓読み · kun reading
              </Text>
              <Text
                style={[
                  styles.specimenText,
                  { color: theme.color.inkFaint, fontFamily: theme.font.sans, fontSize: TYPE.meta },
                ]}
              >
                KanjiVG, CC BY-SA · stroke count derived
              </Text>
            </View>
          </SpecimenRow>
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Furigana is a column per segment, so a line can break between segments but never between a character and its reading. The whole run speaks once — 分かれる（わかれる）— rather than interleaving reading and written form."
          testID="specimen-furigana"
          title="Furigana and vertical setting"
        >
          <SpecimenRow label="RubyText 28">
            <RubyText reading="わかれる" size={TYPE.headwordRow} written="分かれる" />
          </SpecimenRow>
          <SpecimenRow label="RubyText 44">
            <RubyText reading="ぶんきてん" size={TYPE.headword} written="分岐点" />
          </SpecimenRow>
          <SpecimenRow label="VerticalRun">
            <VerticalRun measure={280} text={VERTICAL_SPECIMEN} />
          </SpecimenRow>
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Space is the difference between a museum card and a spreadsheet row. The three large steps are the ones that do the work: xl separates blocks, xxl separates arguments, hero is the silence around a subject."
          testID="specimen-space"
          title="Ma, radii and surfaces"
        >
          {(['xs', 'sm', 'md', 'lg', 'xl', 'xxl', 'hero'] as const).map((step) => (
            <SpecimenRow key={step} label={`SPACE.${step} · ${SPACE[step]}`}>
              <View
                aria-hidden
                style={{ backgroundColor: theme.color.ruleStrong, height: 6, width: SPACE[step] }}
              />
            </SpecimenRow>
          ))}
          <SpecimenRow label="elevation">
            <View style={styles.surfaces}>
              <Surface level="card" pad="md">
                <Text
                  style={[
                    styles.specimenText,
                    { color: theme.color.ink, fontFamily: theme.font.sans, fontSize: TYPE.label },
                  ]}
                >
                  card
                </Text>
              </Surface>
              <Surface level="well" pad="md">
                <Text
                  style={[
                    styles.specimenText,
                    { color: theme.color.ink, fontFamily: theme.font.sans, fontSize: TYPE.label },
                  ]}
                >
                  well
                </Text>
              </Surface>
              <Surface level="overlay" pad="md">
                <Text
                  style={[
                    styles.specimenText,
                    { color: theme.color.ink, fontFamily: theme.font.sans, fontSize: TYPE.label },
                  ]}
                >
                  overlay
                </Text>
              </Surface>
            </View>
          </SpecimenRow>
          <SpecimenRow label="radius">
            <View style={styles.surfaces}>
              {(['sm', 'md', 'lg'] as const).map((name) => (
                <View
                  key={name}
                  aria-hidden
                  style={{
                    backgroundColor: theme.color.sunken,
                    borderColor: theme.color.rule,
                    borderRadius: RADIUS[name],
                    borderWidth: 1,
                    height: 44,
                    width: 64,
                  }}
                />
              ))}
            </View>
          </SpecimenRow>
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="A kanji page should feel like a museum card, not a spreadsheet row: the specimen is three or four times the catalogue text, set in its own face, with space around it and one line of context."
          testID="specimen-card"
          title="The museum card"
        >
          {lexeme === null ? null : (
            <MuseumCard
              caption={lexeme.senses.slice(0, 2).join(' · ')}
              catalogue={[
                `${lexeme.partOfSpeech.join(', ')}`,
                `Kanji used: ${lexeme.kanjiUsed.join('・')}`,
              ]}
              footer={
                <AttributionFooter
                  lines={[
                    { field: 'Headword', source: 'project-authored seed entry' },
                    {
                      field: 'Reading and senses',
                      source: 'project-authored, not dictionary-checked',
                    },
                  ]}
                  standing="A seed entry, not a dictionary entry. Readings and senses here were assembled by this project."
                />
              }
              specimen={
                <RubyText reading={lexeme.reading} size={TYPE.headword} written={lexeme.headword} />
              }
              testID="specimen-museum-card"
            >
              <RecallMeter
                band="settled"
                basis="Last direct evidence: read in context, without a lookup."
                capability="reading"
                testID="specimen-meter-inline"
              />
            </MuseumCard>
          )}
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Clean text; a mark only where this learner's own edge is. Two marks and no more: a hairline in the accent for something with no evidence yet, a dashed neutral for something met before and slipping. Never a per-level rainbow."
          testID="specimen-frontier"
          title="Reading surface and frontier marks"
        >
          <ChipButton
            accessibilityLabel="Furigana"
            label="Furigana"
            onPress={() => setFurigana((was) => !was)}
            selected={furigana}
            testID="specimen-furigana-toggle"
          />
          <Surface level="well" pad="lg">
            <FrontierPassage furigana={furigana} spans={PASSAGE_SPANS} testID="specimen-passage" />
          </Surface>
          <Surface level="well" pad="lg">
            <FrontierPassage
              furigana={furigana}
              spans={OVERWHELMED_SPANS}
              testID="specimen-passage-overwhelmed"
            />
          </Surface>
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Capability is a dimension, never a rollup. There is no 'overall' lens to choose, and no component in this system will render a band without the capability it belongs to."
          testID="specimen-lens"
          title="Capability lenses"
        >
          <LensRow active={lens} onChange={setLens} testID="specimen-lens-row" />
          <View style={styles.meters}>
            {CAPABILITY_IDS.map((capability, index) => (
              <RecallMeter
                key={capability}
                /* No literal band names here: the two faintest steps may only
                   be drawn inside this meter, and `test/theme-tokens.test.ts`
                   enforces that by scanning for their names outside it. */
                band={RECALL_BANDS[index] ?? RECALL_BANDS[0]}
                capability={capability}
                fragile={capability === 'production'}
                testID={`specimen-meter-${capability}`}
              />
            ))}
          </View>
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Bare marks, as a map node would draw them. The two faintest bands are missing on purpose: they fall below 3:1 by design, so they may only appear inside the meter above, which supplies a boundary and a word."
          testID="specimen-recall"
          title="Recall marks"
        >
          <View style={styles.marks}>
            {(['emerging', 'settled', 'durable'] as const).map((band) => (
              <View key={band} style={styles.markCell}>
                <RecallMark band={band} capability={lens} size={22} />
                <Text
                  style={[
                    styles.specimenText,
                    {
                      color: theme.color.inkMuted,
                      fontFamily: theme.font.mono,
                      fontSize: TYPE.meta,
                    },
                  ]}
                >
                  {band}
                </Text>
              </View>
            ))}
            <View style={styles.markCell}>
              <RecallMark band="settled" capability={lens} fragile size={22} />
              <Text
                style={[
                  styles.specimenText,
                  { color: theme.color.inkMuted, fontFamily: theme.font.mono, fontSize: TYPE.meta },
                ]}
              >
                fragile
              </Text>
            </View>
          </View>
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note={`Three roles and nothing else: a stroke draws, a surface settles, a branch lights. No token here is reachable from being right about something. Reduced motion sets every duration to zero rather than taking a second path — currently ${reduced ? 'reduced' : 'full'}.`}
          testID="specimen-motion"
          title="Motion"
        >
          {/*
            A bar per duration, one point per millisecond, so the ladder can be
            compared by eye. A column of numbers with an empty gutter beside it
            is a table of constants; the point of a specimen is that the reader
            can see that `lightOut` really is twice `lightIn`.
          */}
          {(Object.keys(DURATION) as (keyof typeof DURATION)[]).map((name) => (
            <SpecimenRow key={name} label={`${name} · ${DURATION[name]}ms`}>
              <View
                aria-hidden
                style={{
                  backgroundColor: theme.color.recall.settled,
                  borderRadius: RADIUS.sm,
                  height: 8,
                  marginTop: SPACE.xs,
                  width: Math.max(2, DURATION[name]),
                }}
              />
            </SpecimenRow>
          ))}
          {(Object.keys(EASING) as (keyof typeof EASING)[]).map((name) => (
            <SpecimenRow key={name} label={`easing.${name}`}>
              <Text
                style={[
                  styles.specimenText,
                  { color: theme.color.inkFaint, fontFamily: theme.font.mono, fontSize: TYPE.meta },
                ]}
              >
                cubic-bezier({EASING[name].join(', ')})
              </Text>
            </SpecimenRow>
          ))}

          {strokes === null ? null : (
            <SpecimenRow label="InkDraw">
              <View style={styles.stack}>
                <Svg height={160} viewBox={strokes.viewBox} width={160}>
                  {strokes.strokes.map((stroke, index) => (
                    <InkDraw
                      key={stroke.id}
                      d={stroke.d}
                      delay={index * (DURATION.drawStroke + DURATION.drawGap)}
                      drawing={drawing}
                      fill="none"
                      stroke={theme.color.ink}
                      strokeLinecap="round"
                      strokeWidth={4}
                    />
                  ))}
                </Svg>
                <AppButton
                  accessibilityHint="Replays the stroke-order animation."
                  label={drawing ? 'Reset strokes' : 'Draw strokes'}
                  onPress={() => setDrawing((was) => !was)}
                  testID="specimen-draw-toggle"
                />
              </View>
            </SpecimenRow>
          )}

          <SpecimenRow label="BranchLight">
            <View style={styles.stack}>
              <View style={styles.branches}>
                {(['form', 'meaning', 'usage'] as const).map((branch) => (
                  <BranchLight key={branch} lit={litBranch === branch}>
                    <Surface level="card" pad="md">
                      <Text
                        style={[
                          styles.specimenText,
                          {
                            color: theme.color.ink,
                            fontFamily: theme.font.sans,
                            fontSize: TYPE.label,
                          },
                        ]}
                      >
                        {branch}
                      </Text>
                    </Surface>
                  </BranchLight>
                ))}
              </View>
              <View style={styles.branches}>
                {(['form', 'meaning', 'usage'] as const).map((branch) => (
                  <ChipButton
                    key={branch}
                    accessibilityLabel={`Light the ${branch} branch`}
                    label={branch}
                    onPress={() => setLitBranch(branch)}
                    selected={litBranch === branch}
                  />
                ))}
              </View>
            </View>
          </SpecimenRow>
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Five zones earn pixels; everything else is one unfold away, present but silent. A closed section still says what is inside and how much of it, and a section with nothing in it says so instead of opening onto an empty box."
          testID="specimen-disclosure"
          title="Progressive disclosure"
        >
          {kanji === null ? null : (
            <>
              <Disclosure
                count={kanji.onReadings.length + kanji.kunReadings.length}
                initiallyOpen
                note="On and kun, as recorded in the seed."
                testID="specimen-disclosure-readings"
                title="Readings"
              >
                <Text
                  style={[
                    styles.specimenText,
                    { color: theme.color.ink, fontFamily: theme.font.mincho, fontSize: TYPE.body },
                  ]}
                >
                  {kanji.onReadings.join('・')} / {kanji.kunReadings.join('・')}
                </Text>
              </Disclosure>
              <Disclosure
                count={kanji.components.length}
                note="Which part carries the sound and which the meaning is the fact worth having; the seed records the parts."
                testID="specimen-disclosure-components"
                title="Components"
              >
                <Text
                  style={[
                    styles.specimenText,
                    {
                      color: theme.color.ink,
                      fontFamily: theme.font.mincho,
                      fontSize: TYPE.headwordRow,
                    },
                  ]}
                >
                  {kanji.components.join('　')}
                </Text>
              </Disclosure>
              <Disclosure
                empty="No handwriting evidence in this build, so there is nothing to unfold here yet."
                testID="specimen-disclosure-empty"
                title="Handwriting"
              />
            </>
          )}
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Loading, error, empty and offline — one family, all four defined, never two at once on a real screen. They are side by side here only because this is a specimen."
          testID="specimen-states"
          title="The four states"
        >
          <LoadingPanel label="Looking up 分岐…" />
          <ErrorPanel
            detail="The seed could not be read. Nothing was lost; nothing was written."
            message="That lookup did not complete"
            onRetry={() => undefined}
          />
          <EmptyPanel
            detail="This build ships a sixteen-word seed, so a miss means the seed does not have it — not that it is not a word."
            message="Nothing in the seed matches that"
          />
          <OfflineBanner />
        </SpecimenSection>

        {/* ---------------------------------------------------------------- */}
        <SpecimenSection
          note="Attribution is never folded away and never implied. A panel with no recorded source says so, because a sourced-looking field with no attribution is the failure that matters."
          testID="specimen-attribution"
          title="Provenance and attribution"
        >
          <Surface level="card" pad="lg">
            <AttributionFooter
              lines={[
                { field: 'Stroke order', source: 'KanjiVG, CC BY-SA 3.0' },
                { field: 'Passage', source: `project-authored — “${PASSAGE.title}”` },
              ]}
              standing="Everything on this specimen is display data. Nothing here was measured, and nothing here writes to the record."
              testID="specimen-attribution-footer"
            />
          </Surface>
          <Surface level="card" pad="lg">
            <AttributionFooter lines={[]} testID="specimen-attribution-empty" />
          </Surface>
          {/*
            The specimen renders real JMdict headwords and senses and real
            KANJIDIC2 readings — 分岐 and 岐 come out of `@bunki/seed`, which is
            the whole reason the page is trustworthy as a specimen. §3 of the
            EDRDG licence statement asks for the acknowledgement on each screen
            that displays words from the files, and "it is a specimen, not a
            product screen" is not an exemption the licence offers. Merging the
            dictionary tier onto this lane is what surfaced it: the tier ships
            `test/edrdg-acknowledgement.test.ts`, which walks each route's module
            graph for licensed field reads, and this page was the one screen in
            the app reading them without acknowledging them.
          */}
          <SeedEntryDisclosure />
        </SpecimenSection>

        <View style={styles.tail} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xl,
  },
  measure: {
    width: '100%',
  },
  pageTitle: {
    fontSize: TYPE.headword,
    letterSpacing: 0.3,
  },
  lede: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.7,
    marginTop: SPACE.sm,
  },
  specimenText: {
    // Sizes and families are set per use; this only carries what is shared.
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.md,
  },
  stack: {
    alignItems: 'flex-start',
    gap: SPACE.md,
  },
  surfaces: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.md,
  },
  meters: {
    gap: SPACE.lg,
  },
  marks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xl,
  },
  markCell: {
    alignItems: 'center',
    gap: SPACE.xs,
  },
  branches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.md,
  },
  tail: {
    height: SPACE.hero,
  },
});
