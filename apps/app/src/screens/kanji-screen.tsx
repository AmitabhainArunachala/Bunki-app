/**
 * Screen 3 — the kanji page, rebuilt as the fractal dive (lane B2;
 * `docs/design/BUNKI_THE_FRACTAL_DIVE_2026-07-28.md`).
 *
 * ## The operator's decision, and what it changes
 *
 * The dive **replaces** the flat kanji page rather than sitting beside it. A
 * kanji page is the dive stopped at L2 — one way to see one thing. So this file
 * is not a page with a dive bolted on: it is the dive, and everything the frozen
 * §5 kanji-page contract asks for is what the dive shows when the centre happens
 * to be a character.
 *
 * ## What that buys, and it is the DoD clause nothing else closed
 *
 * The master definition of done asks for *recursively explorable*: "from any
 * word: kanji → components → compounds → related/contrasting words → sentences →
 * back; no dead-end screens". Screens with links satisfy that on paper. Here
 * there is no screen to leave — zooming is changing which node is the centre —
 * so a context loss is structurally impossible rather than merely avoided.
 *
 * ## Exposure is never retrieval, and it is the rule this lane exists to prove
 *
 * Every gesture on this surface is navigation. Nothing here submits a command,
 * mints evidence, writes a memory state, or reaches a scheduling path — this
 * screen does not even hold a dispatch function. Wave C3 adds probes later, and
 * it can only do that safely because this lane proves the boundary first;
 * `test/dive-boundary.test.ts` walks this screen's whole module graph and fails
 * if it can reach one, and `e2e/dive-exposure.spec.ts` drives the dive in a real
 * browser and asserts the durable event log is byte-identical afterwards.
 *
 * ## What is on the page at L2
 *
 * Readings by type, the meaning centre, the stroke order drawn with the brush,
 * components with their roles, reading families, the characters that share a
 * shape, the compounds ranked by the dictionary's own commonness signal, and one
 * note that is the character explaining itself. `src/ui/dive/dive-detail.ts`
 * derives all of it and is explicit about what each section may and may not
 * claim.
 *
 * **Dictionary indices are never rendered.** REQ-UI-03 is explicit: SKIP,
 * Henshall, NJECD, Gakken, New Nelson, KALD and Daikanwa/Morohashi are join keys
 * in a database and not page content. WP-09 closed the one leak that reached the
 * page through *data* rather than through source text, and `radicalDisplay` is
 * still what stands between the seed's radical records and this screen.
 */

import { useCallback, useMemo, useReducer, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  SCALE_LEVELS,
  SCALE_LEVEL_DEPTH,
  SCALE_LEVEL_NAMES,
  diagnoseInterior,
  diveAt,
  indexReadings,
  parseStrokeNodeId,
  scaleNodeAt,
  sharpestMismatches,
  viewGraphNodeIds,
  type ScaleLevel,
  type ScaleNode,
} from '@bunki/domain';

import {
  findKanjiByCharacter,
  findLexemeById,
  importedDictionary,
  seedDataset,
  type SeedKanji,
} from '../data/catalog.ts';
import { parseKanjiVgStrokes, type KanjiStrokeSet } from '../data/kanjivg.ts';
import { radicalDisplay } from '../data/radical-display.ts';
import { useAppSnapshot, useDebugFlags } from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import { AttributionFooter } from '../ui/attribution.tsx';
import { CAPABILITY_IDS, type CapabilityId } from '../ui/capability.ts';
import { Disclosure } from '../ui/disclosure.tsx';
import { DiveCanvas } from '../ui/dive/dive-canvas.tsx';
import { DiveCentre } from '../ui/dive/dive-centre.tsx';
import { DiveChrome } from '../ui/dive/dive-chrome.tsx';
import { DiveDiagnosis } from '../ui/dive/dive-diagnosis.tsx';
import {
  COMPONENT_ROLE_NOTE,
  DETAIL_DIVE_OPTIONS,
  SELF_NOTE_STANDING,
  SHARED_COMPONENT_NOTE,
  buildKanjiDetail,
  compoundsDisclosure,
  eraOfLexeme,
} from '../ui/dive/dive-detail.ts';
import type { NodeMark } from '../ui/dive/dive-node.tsx';
import {
  READING_STANDING,
  markForNode,
  reachOfThreads,
  readingsForNodes,
} from '../ui/dive/dive-readings.ts';
import { appScaleLadder, characterOfKanjiNodeId, kanjiNodeId } from '../ui/dive/scale-source.ts';
import {
  beginDive,
  centreOf,
  canSurface,
  diveReducer,
  flightDirection,
  type DiveStop,
} from '../ui/dive/dive-state.ts';
import { LensRow } from '../ui/lens.tsx';
import { useReducedMotion } from '../ui/motion.tsx';
import { ProvenanceLine, ProvenanceTable, SeedEntryDisclosure } from '../ui/notices.tsx';
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
  /**
   * Already-extracted geometry, for the imported tier.
   *
   * Its 1,241 verbatim SVGs are 4.7 MB and may not be copied out of
   * `packages/seed` (controller §4, DL-33), so the importer extracts their
   * strokes from those same committed bytes and
   * `packages/seed/test/dictionary.test.ts` re-derives every one of them from
   * the originals. Same drawing, same licensor; only the parse happened earlier.
   */
  readonly strokes?: KanjiStrokeSet | null | undefined;
  readonly onOpenWord: (lexemeId: string) => void;
  readonly onBack: () => void;
}

export function KanjiScreen({
  character,
  strokeSvg,
  strokes: providedStrokes = null,
  onOpenWord,
  onBack,
}: KanjiScreenProps): ReactNode {
  const flags = useDebugFlags();

  const resolve = useCallback(() => findKanjiByCharacter(character), [character]);
  const { state, retry } = useLookup<SeedKanji>(resolve, {
    flags,
    emptyMessage: `“${character}” is not one of the ${String(seedDataset.kanji.length + importedDictionary.kanji.length)} kanji this build carries.`,
    emptyDetail: 'This is a seed dataset, not a dictionary.',
  });

  /**
   * Parsing is fallible and its failure is a *different* failure from the
   * lookup's, so it is resolved separately: a character that exists with an
   * unreadable stroke file still gets its meanings, readings and compounds.
   */
  const strokes = useMemo<{ set: KanjiStrokeSet | null; error: string | null }>(() => {
    if (strokeSvg === null) return { set: providedStrokes, error: null };
    try {
      return { set: parseKanjiVgStrokes(strokeSvg), error: null };
    } catch (cause) {
      return {
        set: null,
        error: cause instanceof Error ? cause.message : 'The stroke file could not be read.',
      };
    }
  }, [strokeSvg, providedStrokes]);

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

  return (
    <Dive
      kanji={state.data}
      onBack={onBack}
      onOpenWord={onOpenWord}
      strokeError={strokes.error}
      strokeSet={strokes.set}
      strokesRevealed={flags.strokesRevealed}
    />
  );
}

/* ------------------------------------------------------------------ *
 * The dive
 * ------------------------------------------------------------------ */

/**
 * Split from `KanjiScreen` so the hooks below run only once a character has
 * resolved.
 *
 * The four REQ-UI-09 states are decided above, before any of this mounts, which
 * is what keeps the state branches free of hooks and the "no two state panels at
 * once" rule structural rather than reviewed.
 */
function Dive({
  kanji,
  strokeSet,
  strokeError,
  strokesRevealed,
  onOpenWord,
  onBack,
}: {
  readonly kanji: SeedKanji;
  readonly strokeSet: KanjiStrokeSet | null;
  readonly strokeError: string | null;
  readonly strokesRevealed: boolean;
  readonly onOpenWord: (lexemeId: string) => void;
  readonly onBack: () => void;
}): ReactNode {
  const theme = useTheme();
  const snapshot = useAppSnapshot();
  const reduced = useReducedMotion();
  const [capability, setCapability] = useState<CapabilityId>('meaning');

  const { ladder } = useMemo(() => appScaleLadder(), []);

  const origin: DiveStop = useMemo(
    () => ({ id: kanjiNodeId(kanji.character), level: 'kanji', label: kanji.character }),
    [kanji.character],
  );
  const [dive, dispatchDive] = useReducer(diveReducer, origin, beginDive);
  /*
    Arriving at a different character is a *different dive*, not a deeper one.
    The route's parameter can change without this component unmounting, and a
    path that survived that would tell the learner they had zoomed from a
    character they never opened.
  */
  const state = dive.origin.id === origin.id ? dive : beginDive(origin);
  const centre = centreOf(state);

  const view = useMemo(() => diveAt(ladder, centre.id, DETAIL_DIVE_OPTIONS), [ladder, centre.id]);

  /* ------------------------------------------------------ the marks */

  const reach = useMemo(
    () =>
      reachOfThreads(
        snapshot,
        (written) => kanjiNodeId(written),
        (lexemeId) => findLexemeById(lexemeId)?.kanjiUsed ?? [],
      ),
    [snapshot],
  );

  const markFor = useCallback(
    (nodeId: string): NodeMark => {
      const derived = markForNode(reach, nodeId, capability);
      return { band: derived.band, uncertain: derived.uncertain, basis: derived.basis };
    },
    [reach, capability],
  );

  /* -------------------------------------------------- the diagnosis */

  const findings = useMemo(() => {
    // Bounded by the view: only the nodes the dive already materialised get a
    // reading, so the diagnosis never reaches a node level-of-detail culled.
    const readings = indexReadings(readingsForNodes(viewGraphNodeIds(view), reach, capability));
    return sharpestMismatches(diagnoseInterior(view, readings, [capability]));
  }, [view, reach, capability]);

  /* -------------------------------------------------- the L2 detail */

  const detail = useMemo(
    () => (centre.level === 'kanji' ? buildKanjiDetail(ladder, centre.label) : null),
    [ladder, centre.level, centre.label],
  );

  /* ------------------------------------------------------ the flight */

  const [previousLevel, setPreviousLevel] = useState<ScaleLevel | null>(null);
  const direction = flightDirection(previousLevel, centre.level, SCALE_LEVEL_DEPTH);

  const zoomTo = useCallback(
    (nodeId: string) => {
      const node: ScaleNode | null = scaleNodeAt(ladder, nodeId);
      if (node === null) return;
      setPreviousLevel(centre.level);
      dispatchDive({ kind: 'zoom', to: { id: node.id, level: node.level, label: node.label } });
    },
    [ladder, centre.level],
  );

  const reachableLevels = useMemo<readonly ScaleLevel[]>(
    () => [
      centre.level,
      ...view.rings.filter((ring) => ring.members.length > 0).map((r) => r.level),
    ],
    [centre.level, view.rings],
  );

  const centreNode = view.centre;
  const era = centre.level === 'word' ? eraOfLexeme(ladder, centre.id) : null;
  const centreLexeme = centre.level === 'word' ? findLexemeById(centre.id) : null;
  // The character a stroke belongs to, read back out of the id this app minted
  // through the domain's own parser rather than guessed from the ring.
  const strokeOwner =
    centre.level === 'stroke'
      ? characterOfKanjiNodeId(parseStrokeNodeId(centre.id)?.kanjiNodeId ?? '')
      : null;

  return (
    <ScreenShell
      notice={<SeedEntryDisclosure />}
      subtitle={`The dive, stopped at ${SCALE_LEVEL_NAMES[centre.level].written} ${SCALE_LEVEL_NAMES[centre.level].gloss}. Moving through it records nothing. Dictionary index numbers are database join keys and are never shown here.`}
      testID="screen-kanji"
      title="Kanji"
    >
      <DiveChrome
        canGoBack={canSurface(state)}
        centre={centre}
        onBack={() => {
          setPreviousLevel(centre.level);
          dispatchDive({ kind: 'back' });
        }}
        onSurface={() => {
          setPreviousLevel(centre.level);
          dispatchDive({ kind: 'surface' });
        }}
        path={state.path}
        reachableLevels={reachableLevels}
        reduced={reduced}
        testID="dive-chrome"
      />

      <LensRow active={capability} available={CAPABILITY_IDS} onChange={setCapability} />

      {centreNode === null ? (
        <EmptyPanel
          detail="Nothing in this build sits at that node, so there is nothing to draw."
          message="That node is not on the ladder."
          testID="dive-centre-empty"
        />
      ) : (
        <DiveCanvas
          capability={capability}
          centreSlot={
            <DiveCentre
              facts={{
                caption: captionFor(centreNode, kanji, centreLexeme?.senses ?? []),
                catalogue: catalogueFor(centreNode, kanji, view.cost.ladderNodes),
                reading: centreLexeme?.reading ?? null,
                era,
                strokeOwner,
                standing: era === null ? READING_STANDING : `${era.detail} ${READING_STANDING}`,
              }}
              node={centreNode}
              testID="dive-centre-card"
            />
          }
          direction={direction}
          markFor={markFor}
          onZoom={zoomTo}
          testID="dive-canvas"
          view={view}
        />
      )}

      <Text
        style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
        testID="dive-cost"
      >
        This view materialised {String(view.cost.nodesMaterialised)} nodes of the{' '}
        {String(view.cost.ladderNodes)} this build indexes, from {String(view.cost.adjacencyReads)}{' '}
        adjacency lists. The rest of the graph was not touched.
      </Text>

      <Hairline />

      <DiveDiagnosis capability={capability} findings={findings} testID="dive-diagnosis" />

      {/* ------------------------------------------------ the kanji page */}
      {detail === null ? null : (
        <>
          <Hairline />

          <Section
            note="What this character is, in the fields the shipped dictionary actually carries."
            testID="kanji-detail"
            title={`${detail.kanji.character} — ${detail.kanji.meanings[0] ?? ''}`}
          >
            <Text
              style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              testID="kanji-meanings"
            >
              {detail.kanji.meanings.join(' · ')}
            </Text>
            <ProvenanceLine field="meanings" record={detail.kanji.provenance.meanings} />
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {String(detail.kanji.strokeCount)} strokes · {detail.kanji.codepoint}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              testID="kanji-era"
            >
              {detail.era.detail}
            </Text>
          </Section>

          {detail.note === null ? null : (
            <Disclosure
              count={detail.note.words.length}
              initiallyOpen
              note="One line, and it is the character explaining itself."
              testID="kanji-self-note"
              title="In its own words"
            >
              <Text
                style={[styles.selfNote, { color: theme.color.ink, fontFamily: theme.font.mincho }]}
                testID="kanji-self-note-line"
              >
                {detail.note.line}
              </Text>
              <AttributionFooter lines={[]} standing={SELF_NOTE_STANDING} />
            </Disclosure>
          )}

          <Disclosure
            initiallyOpen
            note="KANJIDIC2's own lists, written as the file writes them. Which reading a given compound uses is not recorded per morpheme anywhere in the shipped data, so it is not asserted."
            testID="kanji-readings"
            title="Readings"
          >
            <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
              音 {detail.kanji.onReadings.join('・') || '—'}
            </Text>
            <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
              訓 {detail.kanji.kunReadings.join('・') || '—'}
            </Text>
            <ProvenanceLine field="onReadings" record={detail.kanji.provenance.onReadings} />
          </Disclosure>

          <Disclosure
            count={detail.components.length}
            empty={
              detail.components.length === 0
                ? 'This build carries no component annotation for this character.'
                : undefined
            }
            initiallyOpen
            note={COMPONENT_ROLE_NOTE}
            testID="kanji-components"
            title="Components"
          >
            {detail.components.map((component) => (
              <RowButton
                accessibilityHint="Makes that shape the centre of the dive."
                accessibilityLabel={`${component.element}, role ${component.role}, used by ${String(component.usedBy)} characters in this build`}
                key={component.nodeId}
                onPress={() => zoomTo(component.nodeId)}
                testID={`kanji-component-${component.element}`}
              >
                <Text
                  style={[
                    styles.rowGlyph,
                    { color: theme.color.ink, fontFamily: theme.font.mincho },
                  ]}
                >
                  {component.element}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  role: {component.role} · used by {String(component.usedBy)} characters here
                </Text>
              </RowButton>
            ))}
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              testID="kanji-radical-note"
            >
              {radicalDisplay(detail.kanji.radicals).note}
            </Text>
            <ProvenanceLine field="components" record={detail.kanji.provenance.components} />
          </Disclosure>

          <Disclosure
            count={detail.readingFamily.length}
            empty={
              detail.readingFamily.length === 0
                ? 'No other character in this build shares a reading with this one.'
                : undefined
            }
            note="Two characters are a family here because they reach the same reading. The reading is the reason, and it is shown."
            testID="kanji-reading-family"
            title="Reading family"
          >
            {detail.readingFamily.map((entry) => (
              <RowButton
                accessibilityHint="Makes that character the centre of the dive."
                accessibilityLabel={`${entry.character}, which shares the reading ${entry.via}`}
                key={entry.nodeId}
                onPress={() => zoomTo(entry.nodeId)}
                testID={`kanji-family-${entry.character}`}
              >
                <Text
                  style={[
                    styles.rowGlyph,
                    { color: theme.color.ink, fontFamily: theme.font.mincho },
                  ]}
                >
                  {entry.character}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  via {entry.via}
                </Text>
              </RowButton>
            ))}
          </Disclosure>

          <Disclosure
            count={detail.sharedComponent.length}
            empty={
              detail.sharedComponent.length === 0
                ? 'No other character in this build is written with a shape this one uses.'
                : undefined
            }
            note={SHARED_COMPONENT_NOTE}
            testID="kanji-shared-component"
            title="Written with a shape this one uses"
          >
            {detail.sharedComponent.map((entry) => (
              <RowButton
                accessibilityHint="Makes that character the centre of the dive."
                accessibilityLabel={`${entry.character}, which shares ${entry.element}, a shape ${String(entry.usedBy)} characters in this build use`}
                key={entry.nodeId}
                onPress={() => zoomTo(entry.nodeId)}
                testID={`kanji-shared-${entry.character}`}
              >
                <Text
                  style={[
                    styles.rowGlyph,
                    { color: theme.color.ink, fontFamily: theme.font.mincho },
                  ]}
                >
                  {entry.character}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  shares {entry.element} · {String(entry.usedBy)} characters here use that shape
                </Text>
              </RowButton>
            ))}
          </Disclosure>

          <Disclosure
            count={detail.compoundsAvailable}
            empty={
              detail.compounds.length === 0
                ? 'No word in this build is written with this character.'
                : undefined
            }
            initiallyOpen
            note={
              detail.compoundsTruncatedUpstream
                ? 'Ordered by JMdict’s own commonness tags — over the ones the dive kept, not over every word in the dictionary.'
                : 'Ordered by JMdict’s own commonness tags, which is the same signal that chose which entries this build ships.'
            }
            testID="kanji-compounds"
            title="Words written with it"
          >
            {detail.compounds.map((entry) => (
              <RowButton
                accessibilityHint="Opens that word’s page."
                accessibilityLabel={`${entry.lexeme.headword}, read ${entry.lexeme.reading}: ${entry.lexeme.senses.join(', ')}`}
                key={entry.nodeId}
                onPress={() => onOpenWord(entry.lexeme.id)}
                testID={`kanji-compound-${entry.lexeme.id}`}
              >
                <RubyText
                  reading={entry.lexeme.reading}
                  serif={false}
                  size={TYPE.body}
                  written={entry.lexeme.headword}
                />
                <Text
                  style={[
                    styles.meta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  {entry.lexeme.senses.slice(0, 3).join(' · ')}
                </Text>
              </RowButton>
            ))}
            {compoundsDisclosure(detail) !== null ? (
              <Text
                style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
                testID="kanji-compounds-cut"
              >
                {compoundsDisclosure(detail)}
              </Text>
            ) : null}
          </Disclosure>

          <Disclosure
            initiallyOpen
            note="KanjiVG's own drawing, one stroke at a time, in writing order."
            testID="kanji-strokes"
            title="Stroke order"
          >
            <StrokeSection
              character={detail.kanji.character}
              revealed={strokesRevealed}
              strokeError={strokeError}
              strokeSet={strokeSet}
            />
          </Disclosure>

          <Disclosure
            note="Every field on this page, with where it came from."
            testID="kanji-provenance"
            title="Sources"
          >
            <ProvenanceTable provenance={detail.kanji.provenance} testID="kanji-provenance-table" />
          </Disclosure>
        </>
      )}

      <Hairline />
      <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
        The ladder has {String(SCALE_LEVELS.length)} levels:{' '}
        {SCALE_LEVELS.map((level) => SCALE_LEVEL_NAMES[level].gloss).join(' · ')}. Where a level is
        empty in this build the dive says so above rather than leaving a blank.
      </Text>
      <AppButton accessibilityHint="Returns to search." label="Back to search" onPress={onBack} />
    </ScreenShell>
  );
}

/* ------------------------------------------------------------------ *
 * Stroke order
 * ------------------------------------------------------------------ */

/**
 * The stroke panel, and the reason it is its own component.
 *
 * Its three outcomes are one screen state each — unreadable file, no geometry in
 * this build, geometry drawn — and only ever one of them renders. Keeping them
 * in the page body put an `ErrorPanel` and an `EmptyPanel` inside one JSX
 * fragment, which `test/screen-contract.test.ts` refuses: siblings in a fragment
 * render together *by definition*, and the defect that rule was written against
 * shipped a permanent `progressbar` beside "Nothing recorded yet." Extracting it
 * makes "only one of these renders" structural rather than a promise about a
 * ternary somebody has to read.
 *
 * `draw` is on, so the strokes are written with the brush rather than revealed
 * whole — a claim `e2e/stroke-brush.spec.ts` holds to by sampling the live dash
 * offsets rather than by being written here. Under reduced motion `InkDraw`'s
 * duration is zero and each stroke lands complete on the first frame — the
 * character stays fully legible, which is the part that carries the teaching.
 */
function StrokeSection({
  character,
  strokeSet,
  strokeError,
  revealed,
}: {
  readonly character: string;
  readonly strokeSet: KanjiStrokeSet | null;
  readonly strokeError: string | null;
  readonly revealed: boolean;
}): ReactNode {
  const upstream = seedDataset.strokes.upstream;

  if (strokeError !== null) {
    return (
      <ErrorPanel
        detail="The rest of this page is unaffected."
        message="The stroke file for this character could not be read."
        testID="kanji-stroke-error"
      />
    );
  }
  if (strokeSet === null) {
    return (
      <EmptyPanel
        detail="Stroke data comes from KanjiVG and this build carries it only for the characters KANJIDIC2 and KanjiVG both cover."
        message="No stroke order in this build for this character."
        testID="kanji-stroke-empty"
      />
    );
  }
  return (
    <View style={styles.strokeBlock}>
      <StrokeOrder
        character={character}
        draw
        startRevealed={revealed}
        strokes={strokeSet}
        testID="kanji-stroke-order"
      />
      {/*
        KanjiVG is CC BY-SA 3.0 and the licence asks for the project to be named
        and reachable, so the repository URL is rendered rather than described.
        The commit and the licence-text URL are the seed’s own record of what
        this build was actually checked against.
      */}
      <AttributionFooter
        lines={[
          {
            field: 'Stroke order',
            source: `${upstream.project}, ${upstream.license} — ${upstream.repository}`,
          },
        ]}
        standing={`Retrieved ${upstream.retrievedAt} at commit ${upstream.commit.slice(0, 12)}. The licence text this build was checked against is at ${upstream.licenseTextUrl}.`}
        testID="kanji-stroke-attribution"
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Centre copy
 * ------------------------------------------------------------------ */

function captionFor(node: ScaleNode, kanji: SeedKanji, senses: readonly string[]): string {
  switch (node.level) {
    case 'kanji':
      return node.label === kanji.character
        ? (kanji.meanings[0] ?? 'no meaning recorded in this build')
        : (findKanjiByCharacter(node.label)?.meanings[0] ?? 'no meaning recorded in this build');
    case 'word':
      return senses[0] ?? 'no sense recorded in this build';
    case 'component':
      return 'a shape characters are written with; this build records no meaning for it';
    case 'stroke':
      return `stroke ${String(node.stroke?.order ?? 0)} of ${String(node.stroke?.of ?? 0)}`;
    /*
      Not "a sentence this word was met in", which is what this said and what
      the design document's L5 is. The build has no record of any encounter:
      these are Tatoeba examples joined to a lexeme by the JMdict `ent_seq` that
      selected it (`scale-source.ts`), and the graph's own vocabulary for a real
      encounter — an `encounter` node and an `appeared_in` edge — is defined and
      never emitted. So the caption says what the join actually is. L5 becomes
      the design document's sentence on the day something writes an encounter,
      and not before.
    */
    case 'sentence':
      return 'an example sentence, paired with this word by its dictionary entry';
    case 'collocation':
      return 'a phrase';
  }
}

function catalogueFor(node: ScaleNode, kanji: SeedKanji, ladderNodes: number): readonly string[] {
  const level = SCALE_LEVEL_NAMES[node.level];
  const lines = [
    `${level.written} ${level.gloss} · level ${String(SCALE_LEVEL_DEPTH[node.level])}`,
  ];
  if (node.level === 'kanji') {
    const resolved = node.label === kanji.character ? kanji : findKanjiByCharacter(node.label);
    if (resolved !== null) {
      lines.push(`${String(resolved.strokeCount)} strokes · ${resolved.codepoint}`);
    }
  }
  if (node.level === 'stroke' && node.stroke?.kind !== null && node.stroke !== null) {
    lines.push(`KanjiVG stroke type ${node.stroke.kind ?? '—'}`);
  }
  lines.push(`one of ${String(ladderNodes)} nodes this build indexes`);
  return lines;
}

/* ------------------------------------------------------------------ *
 * Styles
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.7,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  rowGlyph: {
    fontSize: TYPE.headwordRow,
  },
  selfNote: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.8,
  },
  strokeBlock: {
    gap: SPACE.md,
  },
});
