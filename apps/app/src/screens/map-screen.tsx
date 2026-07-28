/**
 * The map — the surface that answers "what have I built" (Campaign E / B1).
 *
 * ## Why this screen exists, in the research's words
 *
 * > The queue empties daily and shows nothing accumulated. The map only ever
 * > accumulates. **It is the only surface that answers "what have I built"
 * > rather than "what do I owe."** Any design decision that makes the map
 * > decorative rather than the home of that answer is a mistake.
 *
 * So the order of this page is the order of that sentence. The accumulation card
 * is first, because it is the answer. The road is second, because *"station 11
 * of 160"* is the literal reply to "it never ends". The neighbourhood is third,
 * because that is where the learner walks. The era census is last, because it is
 * about the language rather than about them.
 *
 * ## Local neighbourhood by default
 *
 * REQ-UI-07: the whole-state view is *"a deliberate destination, not the home
 * screen"*. The map opens on one origin's neighbourhood — bounded by the
 * domain's own `maxNodes`, which is what keeps a phone's frame budget intact —
 * and the census is a second view the learner asks for. The census does not plot
 * 9,245 nodes; it counts them, once, memoised, and says what the counts are.
 * A whole-corpus scatter is not more information, it is the same information
 * rendered unusably.
 *
 * ## Exposure is never retrieval, and this screen is all exposure
 *
 * Every interaction here — choosing a lens, moving the scrubber, tapping a node,
 * switching view — is a read. This module imports no command, executes nothing
 * through the store, and reaches no minter. `store.readDerived()` is the
 * kernel's replay and `readAll()` is the log; both are reads. There is no probe
 * on this screen and therefore nothing on it can produce evidence.
 *
 * That is not a promise about intent, it is a property of the imports:
 * `test/map-modules.test.ts` asserts this file and every module under
 * `src/ui/map/` calls no `store.execute`, so a later edit that added one would
 * fail rather than quietly grade a tap.
 *
 * ## Never one brightness for a whole node
 *
 * The map is seen through exactly one capability lens at a time and the lens is
 * named everywhere a mark appears (REQ-UI-07). There is no view of this screen
 * that shows an average, a total, or a percentage over the five, because
 * `map-projection.ts` exposes no function that could compute one.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { neighbourhoodOf, type GraphNode, type GraphNodeId } from '@bunki/domain';

import { findLexemeByHeadword, DEFAULT_CANONICAL_TARGET } from '../data/catalog.ts';
import { useAppSnapshot, useAppStore, useDebugFlags } from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import { LensRow } from '../ui/lens.tsx';
import { EraGround } from '../ui/map/era-ground.tsx';
import { MapField } from '../ui/map/map-field.tsx';
import { accumulationOf, ACCUMULATION_NOTE } from '../ui/map/map-accumulation.ts';
import {
  BAND_LABELS,
  ERA_COVERAGE_DISCLOSURE,
  eraKeyOf,
  placeNodes,
  type BandTally,
} from '../ui/map/map-eras.ts';
import { layoutNeighbourhood } from '../ui/map/map-layout.ts';
import {
  buildMapIndex,
  buildMapTimeline,
  lensView,
  projectMapNode,
  MAP_MARK_RULE,
} from '../ui/map/map-projection.ts';
import { buildRoutes, routePosition, ROUTE_EXCLUSION_NOTE } from '../ui/map/map-routes.ts';
import { historyFrames, resolveScrubber } from '../ui/map/map-scrubber.ts';
import { lexemeNodeId, mapAtlas, nodeSubject } from '../ui/map/map-source.ts';
import { RouteStrip } from '../ui/map/route-strip.tsx';
import { Scrubber } from '../ui/map/scrubber.tsx';
import { SeedEntryDisclosure } from '../ui/notices.tsx';
import { AppButton, ChipButton, Hairline, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { Surface } from '../ui/surface.tsx';
import { NO_COLLAPSED_LIGHT_RULE, WRITING_LENS_DISCLOSURE } from '@bunki/domain';
import { SPACE, TYPE, type StandaloneRecallBand } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';
import type { CapabilityId } from '../ui/capability.ts';

/**
 * The step a route counts a station as reached at. Stated, never implied.
 *
 * `StandaloneRecallBand` rather than `RecallBand`: a road may only count
 * stations at a step a node can be *seen* to have reached, and the two dimmest
 * ramp steps are never drawn on a map node (see `node-mark.tsx`). Asking for one
 * of them would be a threshold nothing on screen could show.
 */
const ROUTE_BAND: StandaloneRecallBand = 'settled';

/**
 * Why no lamp is lit anywhere on this map, said where a reader can see it.
 *
 * The visual language permits emitted light in the 鉄道 register alone, and on
 * this map 鉄道 has no members — lane A2′ measured that nothing in the shipped
 * dictionary can be placed there without guessing. So there is no node for a
 * signal to be about. This sentence exists because the absence would otherwise
 * read as an oversight, and because the design specimen *does* show lamps.
 */
const NO_EMITTED_LIGHT_NOTE =
  'The visual language allows lit signal points in the 鉄道 register only, and 鉄道 has no members in this build, so no node here is lit. That is the layer being empty, not a signal being suppressed.';

export interface MapScreenProps {
  readonly onOpenWord: (lexemeId: string) => void;
  readonly onOpenKanji: (character: string) => void;
  /** Fixed instant, for the screenshot harness. The app passes none. */
  readonly now?: string | undefined;
}

export function MapScreen({ onOpenWord, onOpenKanji, now }: MapScreenProps): ReactNode {
  const theme = useTheme();
  const store = useAppStore();
  const snapshot = useAppSnapshot();
  const flags = useDebugFlags();

  const [lens, setLens] = useState<CapabilityId>('reading');
  const [scrub, setScrub] = useState(0);
  const [origin, setOrigin] = useState<GraphNodeId | null>(null);
  const [census, setCensus] = useState(false);

  /**
   * The Atlas, built once for the session.
   *
   * `useMemo` with no dependencies plus the module-level memo inside
   * `mapAtlas()`: the second is what makes the cost once per *session* rather
   * than once per mount, which matters because this screen is a shell
   * destination a learner returns to.
   */
  const atlas = useMemo(() => mapAtlas(), []);

  /** The kernel's replay. Re-read when the log moves, never per frame. */
  const derived = useMemo(() => store.readDerived(), [store, snapshot.revision]);

  const nowInstant = now ?? new Date().toISOString();

  /**
   * The scrubber's history side, from the log's own instants.
   *
   * Oldest activation to now. A learner with no contracts gets a single frame,
   * so the axis has a detent and no history arm — which is the truth, and is
   * what the control says.
   */
  const frames = useMemo(() => {
    const first = derived.memoryStates
      .map((state) => state.activatedAt)
      .sort()
      .at(0);
    return first === undefined ? [nowInstant] : historyFrames(first, nowInstant);
  }, [derived, nowInstant]);

  const position = useMemo(
    () => resolveScrubber(scrub, frames, nowInstant),
    [scrub, frames, nowInstant],
  );

  /**
   * One index per frame, built **once** for the whole run.
   *
   * Not one index reused at different instants. A static index answers from
   * *current* memory states, so projecting it at a past instant draws a learner
   * who already knew in March everything they learned in June — plausible,
   * smooth, and false. The timeline rebuilds each frame's state by folding the
   * reviews the gate admitted, which is the honest answer and is also the shape
   * that keeps the cost off the frame: the (component, skill) bucketing is
   * invariant and shared, and a frame is one object.
   */
  const timeline = useMemo(() => buildMapTimeline(derived, frames), [derived, frames]);

  /**
   * The index for where the scrubber stands.
   *
   * The era side and the detent both read the present, which is the last frame.
   * The history side steps back from it. `buildMapIndex` is the fallback for the
   * degenerate case of an empty timeline, so the map still draws for a learner
   * with no log at all.
   */
  const index = useMemo(() => {
    // A reverse scan rather than `findLast`: the ES2023 method is not in this
    // project's lib target, and a frame list is at most a few hundred entries
    // walked once per scrubber move — not per node and not per frame.
    let chosen = timeline.at(-1);
    for (let cursor = timeline.length - 1; cursor >= 0; cursor -= 1) {
      const frame = timeline[cursor];
      if (frame !== undefined && frame.at <= position.at) {
        chosen = frame;
        break;
      }
    }
    return chosen?.index ?? buildMapIndex(derived.contracts, derived.memoryStates);
  }, [timeline, position.at, derived]);

  /**
   * Where the map is centred.
   *
   * The learner's own most recent kept thread first — the map should open on
   * something of theirs — then the seed's canonical target, then nothing. The
   * fallback chain never invents a node: each step resolves against the atlas
   * and the last step is an honest empty state.
   */
  const defaultOrigin = useMemo<GraphNodeId | null>(() => {
    for (const thread of snapshot.threads) {
      if (thread.lexemeId === null) continue;
      const id = lexemeNodeId(thread.lexemeId);
      if (atlas.graph.nodes.has(id)) return id;
    }
    const canonical = findLexemeByHeadword(DEFAULT_CANONICAL_TARGET);
    if (canonical !== null) {
      const id = lexemeNodeId(canonical.id);
      if (atlas.graph.nodes.has(id)) return id;
    }
    return atlas.graph.nodes.keys().next().value ?? null;
  }, [atlas, snapshot.threads]);

  const originId = origin ?? defaultOrigin;

  /**
   * The neighbourhood, through the hook every screen shares.
   *
   * `useLookup` rather than a bare `useMemo` so this screen gets the same four
   * REQ-UI-09 states as every other one *and* honours the `?lag=` and `?fail=1`
   * evidence flags — which is what lets the screenshot harness photograph the
   * loading and error states of this screen for real rather than by mocking.
   *
   * A neighbourhood whose `origin` is `null` means the id is not in the graph,
   * which the domain returns as an honest empty rather than a throw; returning
   * `null` here turns it into the empty *state*, which is the distinction the
   * hook exists to keep.
   */
  const resolveNeighbourhood = useCallback(() => {
    if (originId === null) return null;
    const found = neighbourhoodOf(atlas.graph, originId);
    return found.origin === null ? null : found;
  }, [atlas, originId]);

  const { state, retry } = useLookup(resolveNeighbourhood, {
    flags,
    emptyMessage: 'There is nothing on the map yet.',
    emptyDetail:
      'The map draws the dictionary this build ships and your own memory state over it. Capture and keep something on the search screen and it will have a centre.',
  });

  const drawn = useMemo<readonly GraphNode[]>(
    () => (state.kind === 'ready' ? state.data.nodes.map((entry) => entry.node) : []),
    [state],
  );

  const layout = useMemo(
    () => (state.kind === 'ready' ? layoutNeighbourhood(state.data) : null),
    [state],
  );

  /** Era bands over the *drawn* nodes only — a per-view cost, not a corpus walk. */
  const bands = useMemo<readonly BandTally[]>(
    () => (drawn.length === 0 ? [] : placeNodes(atlas, drawn)),
    [atlas, drawn],
  );

  /**
   * Which band each drawn node landed in, and how many held edges cross bands.
   *
   * The map is *strata*: each band is painted on its own era ground, so a line
   * can only be drawn inside one of them. That means an edge the domain really
   * holds between a node on 古道 and a node on no layer at all is not drawn
   * anywhere — and silently not drawing a real relation is the same class of
   * dishonesty as drawing an invented one, pointing the other way. So the count
   * is computed and stated under the field rather than left to be noticed.
   *
   * Linear in the drawn nodes and the drawn lines, both of which the domain's
   * `maxNodes` already bounds.
   */
  const strata = useMemo(() => {
    const bandOfNode = new Map<string, string>();
    for (const band of bands) {
      for (const placed of band.nodes) bandOfNode.set(placed.node.id, band.band);
    }
    let crossing = 0;
    for (const line of layout?.lines ?? []) {
      const from = bandOfNode.get(line.from.node.id);
      const to = bandOfNode.get(line.to.node.id);
      if (from !== undefined && to !== undefined && from !== to) crossing += 1;
    }
    return { bandOfNode, crossing, total: layout?.lines.length ?? 0 };
  }, [bands, layout]);

  /** One lens view per drawn node, for the chosen lens at the chosen instant. */
  const views = useMemo(() => {
    const out = new Map<string, ReturnType<typeof lensView>>();
    for (const node of drawn) {
      const projected = projectMapNode(index, node, position.at);
      out.set(node.id, lensView(projected, lens));
    }
    const compact = new Map<string, NonNullable<ReturnType<typeof lensView>>>();
    out.forEach((value, key) => {
      if (value !== null) compact.set(key, value);
    });
    return compact;
  }, [drawn, index, position.at, lens]);

  const routes = useMemo(() => buildRoutes(atlas), [atlas]);
  const [routeId, setRouteId] = useState<string | null>(null);
  const route = routes.find((candidate) => candidate.id === routeId) ?? routes[0] ?? null;

  /**
   * The road position.
   *
   * Memoised on the four things it depends on. Without the memo it would run
   * once per keystroke of any unrelated state — a 160-station route is 160 node
   * projections, which is cheap once and wasteful sixty times a second.
   */
  const standing = useMemo(() => {
    if (route === null) return null;
    return routePosition(route, lens, ROUTE_BAND, (nodeId) => {
      const node = atlas.graph.nodes.get(nodeId);
      if (node === undefined) return null;
      // The same projection the field draws with, for the same instant, so the
      // road and the neighbourhood can never disagree about one node.
      return lensView(projectMapNode(index, node, position.at), lens);
    });
  }, [route, lens, atlas, index, position.at]);

  const accumulation = useMemo(() => accumulationOf(derived, nowInstant), [derived, nowInstant]);

  const openNode = useCallback(
    (nodeId: GraphNodeId) => {
      const node = atlas.graph.nodes.get(nodeId);
      const subject = node === undefined ? null : nodeSubject(node);
      if (subject === null) return;
      // A lexeme and a kanji have pages. A reading or a component does not in
      // this build, so it re-centres instead — the honest affordance, and never
      // a dead tap.
      if (subject.kind === 'lexeme') onOpenWord(subject.lexemeId);
      else if (subject.kind === 'kanji') onOpenKanji(subject.character);
      else setOrigin(nodeId);
    },
    [atlas, onOpenWord, onOpenKanji],
  );

  /*
    The acknowledgement rides on the shell's `lede` in all four states, not only
    in the two that draw words. EDRDG §3 asks for it on each screen display of
    words from the files, and this screen's module graph reaches those fields; a
    state-by-state judgement about which branch happens to show one is exactly
    the reasoning that shipped `/` and `/canvas` without it, twice. Rendering it
    unconditionally costs one line and removes the judgement.
  */
  if (state.kind === 'loading') {
    return (
      <ScreenShell lede={<SeedEntryDisclosure />} testID="screen-map" title="Map">
        <LoadingPanel label="Assembling the map…" />
      </ScreenShell>
    );
  }

  if (state.kind === 'error') {
    return (
      <ScreenShell lede={<SeedEntryDisclosure />} testID="screen-map" title="Map">
        <ErrorPanel detail={state.detail} message={state.message} onRetry={retry} />
      </ScreenShell>
    );
  }

  if (state.kind === 'empty') {
    return (
      <ScreenShell lede={<SeedEntryDisclosure />} testID="screen-map" title="Map">
        <EmptyPanel detail={state.detail} message={state.message} />
      </ScreenShell>
    );
  }

  const originNode = state.data.origin;

  return (
    <ScreenShell
      lede={<SeedEntryDisclosure />}
      subtitle="What you have built, on the roads the language came in on. Every mark is one capability at one instant; nothing here is a score."
      testID="screen-map"
      title="Map"
    >
      {/* ---------------------------------------------- what you have built */}
      <Surface level="well" testID="map-accumulation">
        <Text style={[styles.heading, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          What you have built
        </Text>
        <Text
          style={[styles.standing, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          testID="map-standing"
        >
          {String(accumulation.contractsAttested)} of {String(accumulation.contractsStanding)}{' '}
          contracts have evidence behind them.
        </Text>
        <Text
          accessibilityLiveRegion="polite"
          style={[
            styles.today,
            {
              color: accumulation.todayAddedSomething ? theme.color.ink : theme.color.inkMuted,
              fontFamily: theme.font.sans,
            },
          ]}
          testID="map-today"
        >
          {accumulation.sentence}
        </Text>
        <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {ACCUMULATION_NOTE}
        </Text>
      </Surface>

      {/* ------------------------------------------------------ the lens */}
      <Section
        note={NO_COLLAPSED_LIGHT_RULE}
        testID="map-lens-section"
        title="Seen through one capability"
      >
        <LensRow active={lens} onChange={setLens} testID="map-lens-row" />
        {lens === 'writing' ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            {WRITING_LENS_DISCLOSURE}
          </Text>
        ) : null}
        <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {MAP_MARK_RULE}
        </Text>
      </Section>

      {/* ------------------------------------------------------- the road */}
      {standing === null ? null : (
        <Section
          note={ROUTE_EXCLUSION_NOTE}
          testID="map-route-section"
          title="The road, and how far along it you are"
        >
          <View style={styles.routePicker}>
            {routes.map((candidate) => (
              <ChipButton
                accessibilityLabel={`${candidate.name}, ${String(candidate.stations.length)} stations`}
                key={candidate.id}
                label={candidate.name}
                onPress={() => setRouteId(candidate.id)}
                selected={candidate.id === standing.route.id}
                testID={`map-route-${candidate.id}`}
              />
            ))}
          </View>
          <RouteStrip position={standing} testID="map-route-strip" />
        </Section>
      )}

      {/* -------------------------------------------------- the scrubber */}
      <Section
        note="One control, two times. Moving it is a read of your log — it records nothing and grades nothing."
        testID="map-scrubber-section"
        title="How did this get here?"
      >
        <Scrubber
          historyFrameCount={frames.length}
          onChange={setScrub}
          position={position}
          testID="map-scrubber"
        />
      </Section>

      {/* ----------------------------------------------- the neighbourhood */}
      <Section
        note="Only edges this build's dictionary actually holds are drawn. A dotted line is a component whose role KANJIDIC2 does not classify."
        testID="map-neighbourhood"
        title={`Around ${originNode?.label ?? ''}`}
      >
        {bands.map((band) => {
          if (band.nodes.length === 0) {
            return (
              <View key={band.band} style={styles.bandEmpty} testID={`map-band-${band.band}`}>
                <Text
                  style={[
                    styles.bandTitle,
                    { color: theme.color.ink, fontFamily: theme.font.sans },
                  ]}
                >
                  {band.label.title}
                </Text>
                <Text
                  style={[
                    styles.meta,
                    { color: theme.color.inkMuted, fontFamily: theme.font.sans },
                  ]}
                >
                  No node here sits on this layer.
                </Text>
              </View>
            );
          }

          const layerLayout =
            layout === null
              ? null
              : {
                  ...layout,
                  points: layout.points.filter((point) =>
                    band.nodes.some((placed) => placed.node.id === point.node.id),
                  ),
                  lines: layout.lines.filter(
                    (line) =>
                      band.nodes.some((placed) => placed.node.id === line.from.node.id) &&
                      band.nodes.some((placed) => placed.node.id === line.to.node.id),
                  ),
                };

          const body =
            layerLayout === null ? null : (
              <MapField
                layout={layerLayout}
                lens={lens}
                onOpenNode={openNode}
                testID={`map-field-${band.band}`}
                views={views}
              />
            );

          return (
            <View key={band.band} style={styles.band}>
              <Text
                style={[styles.bandTitle, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              >
                {band.label.title} · {String(band.nodes.length)}
              </Text>
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                {band.label.blurb}
              </Text>
              {/*
                An era band is painted on its own ground; the `unknown` band is
                painted on no ground at all, because it is not a road. Defaulting
                it onto one would be the guessed era the whole era module refuses.
              */}
              {band.band === 'unknown' ? (
                <Surface level="card" testID="map-unknown-field">
                  {body}
                </Surface>
              ) : (
                <EraGround era={eraKeyOf(band.band)} testID={`map-ground-${band.band}`}>
                  {body}
                </EraGround>
              )}
            </View>
          );
        })}

        <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {ERA_COVERAGE_DISCLOSURE}
        </Text>
        {strata.crossing === 0 ? null : (
          <Text
            style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            testID="map-crossing-edges"
          >
            {String(strata.crossing)} of {String(strata.total)} connections here join nodes on two
            different layers. Each layer is painted on its own ground, so those lines are not drawn
            in any single field — they are held, and they are counted, and they are said here rather
            than left to be noticed.
          </Text>
        )}
        <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
          {NO_EMITTED_LIGHT_NOTE}
        </Text>
        {state.data.truncated.map((cut) => (
          <Text
            key={`${cut.cause}-${String(cut.limit)}`}
            style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            testID={`map-truncation-${cut.cause}`}
          >
            {cut.detail}
          </Text>
        ))}
      </Section>

      <Hairline />

      {/* -------------------------------------------------- the whole state */}
      <Section
        note="A deliberate destination, not the home view (REQ-UI-07). It counts the corpus; it does not plot it."
        testID="map-census-section"
        title="The whole state"
      >
        <AppButton
          accessibilityHint="Counts every word in this build by which era layer it can be placed on."
          label={census ? 'Hide the census' : 'Count the whole dictionary'}
          onPress={() => setCensus((open) => !open)}
          variant="secondary"
        />
        {census ? <Census /> : null}
      </Section>
    </ScreenShell>
  );
}

/**
 * The era census over the whole corpus.
 *
 * Rendered only when asked for, and computed inside its own component so that
 * mounting it is what pays for it — a `useMemo` in the parent would run the
 * whole-corpus pass on every map open whether or not anyone opened the census.
 */
function Census(): ReactNode {
  const theme = useTheme();
  const atlas = useMemo(() => mapAtlas(), []);
  const tallies = useMemo(() => {
    const lexemes: GraphNode[] = [];
    atlas.graph.nodes.forEach((node) => {
      if (node.kind === 'lexeme') lexemes.push(node);
    });
    return placeNodes(atlas, lexemes);
  }, [atlas]);

  const total = tallies.reduce((sum, band) => sum + band.nodes.length, 0);

  return (
    <View style={styles.census} testID="map-census">
      <Text style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {String(total)} words in this build.
      </Text>
      {tallies.map((band) => (
        <Text
          key={band.band}
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID={`map-census-${band.band}`}
        >
          {BAND_LABELS.find((label) => label.band === band.band)?.title ?? band.band} ·{' '}
          {String(band.nodes.length)}
        </Text>
      ))}
      <Text style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}>
        {ERA_COVERAGE_DISCLOSURE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: {
    fontSize: TYPE.meta,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  standing: {
    fontSize: TYPE.title,
    lineHeight: TYPE.title * 1.4,
  },
  today: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.6,
  },
  routePicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  band: {
    gap: SPACE.xs,
  },
  bandEmpty: {
    gap: SPACE.xs,
  },
  bandTitle: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  census: {
    gap: SPACE.xs,
    marginTop: SPACE.md,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
});
