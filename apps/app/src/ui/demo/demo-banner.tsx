/**
 * The demonstration strip — one line on every surface (lane L1).
 *
 * ## What it is for, before anything about how it looks
 *
 * The operator asked to see all the elements of this app working at once, at
 * several stages of a learner's life. Loading a generated learner is how that
 * happens, and **losing track of whether what is on screen is yours is the
 * failure mode of doing it at all**. So the label is not a toast, not a badge
 * on one screen, and not a setting buried in a menu: it is a persistent line
 * carried by the shell, above every route, that says which of the two you are
 * looking at and offers the way to the other.
 *
 * It is present in *both* states. A banner that appeared only in the
 * demonstration would train the eye to ignore its absence; a strip that always
 * says something makes "your own data" a thing you read rather than a thing you
 * assume. It is also the only door to the demonstration, which is why it is
 * there when nothing is loaded.
 *
 * ## Why it is chrome and not a route
 *
 * `src/ui/navigation.ts` §3 argues the information architecture: five
 * destinations, grouped by verb, and a sixth costs an argument. This is not a
 * sixth verb — it is a statement about *which data every other surface is
 * showing*, which belongs to all of them and to none. The same reasoning put
 * the 案内人 in the shell as a presence rather than a tab. A route would also
 * be wrong in practice: the label has to be on the map, in the dive, during a
 * sitting, and a route is somewhere you leave.
 *
 * ## The colour spend
 *
 * Vermilion is the one accent this design has and it means *your attention is
 * wanted here* (`theme/color.ts`). A loaded demonstration is precisely that, so
 * the strip takes the accent when a stage is loaded and takes none at all when
 * it is not — the quiet state is quiet. Nothing here encodes state by colour
 * alone: the state is in the words, and the words are what a screen reader gets.
 *
 * ## What this component may not do
 *
 * It reads no store, executes no command, and mints nothing. It reads which
 * stage is loaded and calls two functions that swap a provider. The
 * demonstration's *data* is generated in the domain and judged by the evidence
 * gate; nothing on this strip can grade, schedule or claim anything about a
 * learner.
 */

import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { DEMO_STAGES, SCRIPTED_LEARNER_NOTE } from '@bunki/domain';

import { useDemo } from '../../state/demo/demo-context.tsx';
import {
  demoBuildNote,
  demoFacts,
  demoLensSpread,
  demoSittings,
} from '../../state/demo/demo-summary.ts';
import {
  BUILDING_LABEL,
  DEMONSTRATION_LABEL,
  FAILED_LABEL,
  OWN_DATA_LABEL,
  OWN_DATA_NOTE,
  RELOAD_NOTE,
} from './demo-copy.ts';
import { MIN_TOUCH_TARGET, RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

export function DemoBanner(): ReactNode {
  const theme = useTheme();
  const { state, load, returnToOwnData, panelOpen: open, setPanelOpen: setOpen } = useDemo();

  const loaded = state.kind === 'loaded';
  const accent = loaded ? theme.color.vermilion : theme.color.rule;
  const headline =
    state.kind === 'loaded'
      ? `${DEMONSTRATION_LABEL} · ${state.build.script.label}`
      : state.kind === 'building'
        ? BUILDING_LABEL
        : state.kind === 'failed'
          ? FAILED_LABEL
          : OWN_DATA_LABEL;

  return (
    <View
      role="region"
      aria-label="Which data this app is showing"
      style={[
        styles.strip,
        {
          backgroundColor: loaded ? theme.color.vermilionSoft : theme.color.sunken,
          borderBottomColor: accent,
          borderBottomWidth: loaded ? 2 : StyleSheet.hairlineWidth,
        },
      ]}
      testID="demo-banner"
    >
      <View style={styles.line}>
        {/* The live region is the headline alone: a screen reader should hear
            "demonstration data" when a stage lands, and should not hear the
            whole panel re-read every time it is opened. */}
        <Text
          accessibilityLiveRegion="polite"
          numberOfLines={2}
          style={[
            styles.headline,
            {
              color: loaded ? theme.color.vermilion : theme.color.inkMuted,
              fontFamily: theme.font.sans,
            },
          ]}
          testID="demo-banner-headline"
        >
          {headline}
        </Text>

        <StripButton
          accent={loaded}
          expanded={open}
          label={open ? 'Close' : loaded ? 'Change' : 'Demonstrations'}
          onPress={() => {
            setOpen(!open);
          }}
          testID="demo-banner-toggle"
        />
      </View>

      {open ? (
        <ScrollView style={styles.panel} contentContainerStyle={styles.panelContent}>
          <Text style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
            {loaded ? SCRIPTED_LEARNER_NOTE : OWN_DATA_NOTE}
          </Text>
          <Text style={[styles.body, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            {RELOAD_NOTE}
          </Text>

          {state.kind === 'failed' ? (
            <Text
              style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              testID="demo-banner-error"
            >
              {`Building ${state.stageId} failed: ${state.message}. Your own data is untouched.`}
            </Text>
          ) : null}

          {state.kind === 'loaded' ? (
            <LoadedDetail
              buildNote={demoBuildNote(state.build.generateMs, state.build.replayMs)}
              facts={demoFacts(state.build.log.summary)}
              lenses={demoLensSpread(state.build.log.summary)}
              sittings={demoSittings(state.build.log.summary)}
            />
          ) : null}

          <View style={styles.choices}>
            {DEMO_STAGES.map((stage) => (
              <ChoiceRow
                current={state.kind === 'loaded' && state.build.stageId === stage.id}
                key={stage.id}
                busy={state.kind === 'building' && state.stageId === stage.id}
                onPress={() => {
                  load(stage.id);
                }}
                subtitle={stage.blurb}
                testID={`demo-stage-${stage.id}`}
                title={`${stage.label} · ${stage.ja}`}
              />
            ))}
            <ChoiceRow
              current={state.kind !== 'loaded'}
              busy={false}
              onPress={() => {
                returnToOwnData();
                setOpen(false);
              }}
              subtitle={OWN_DATA_NOTE}
              testID="demo-stage-own"
              title={OWN_DATA_LABEL}
            />
          </View>
        </ScrollView>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Pieces
 * ------------------------------------------------------------------ */

interface StripButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly expanded: boolean;
  readonly accent: boolean;
  readonly testID: string;
}

/**
 * The strip's own control.
 *
 * Not `AppButton`: this one carries `aria-expanded`, which a general button
 * does not have and should not grow a prop for. `aria-expanded` is forwarded by
 * react-native-web and mapped onto native accessibility state by React Native,
 * which is why the disclosure state travels on it rather than on
 * `accessibilityState` — a prop the web target silently drops
 * (`test/design-vocabulary.test.ts` bans it everywhere under `src/`).
 */
function StripButton({ label, onPress, expanded, accent, testID }: StripButtonProps): ReactNode {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityHint="Choose a demonstration learner to load, or return to your own data."
      accessibilityLabel={`${label} — demonstration data`}
      accessibilityRole="button"
      aria-expanded={expanded}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.control,
        {
          backgroundColor: theme.color.raised,
          borderColor: focused
            ? theme.color.focusRing
            : accent
              ? theme.color.vermilion
              : theme.color.ruleStrong,
          borderWidth: focused ? 2 : 1,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      testID={testID}
    >
      <Text
        numberOfLines={1}
        style={[styles.controlLabel, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

interface ChoiceRowProps {
  readonly title: string;
  readonly subtitle: string;
  readonly current: boolean;
  readonly busy: boolean;
  readonly onPress: () => void;
  readonly testID: string;
}

/**
 * One stage, or the way back.
 *
 * Which one is loaded is spoken as a word in the label as well as marked with
 * `aria-pressed`, because a border colour is not a channel a screen reader has
 * and is not a channel a monochrome display has either (WCAG 1.4.1).
 */
function ChoiceRow({ title, subtitle, current, busy, onPress, testID }: ChoiceRowProps): ReactNode {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const state = busy ? ' — building' : current ? ' — showing now' : '';

  return (
    <Pressable
      accessibilityLabel={`${title}${state}`}
      accessibilityHint={subtitle}
      accessibilityRole="button"
      aria-pressed={current}
      onBlur={() => setFocused(false)}
      onFocus={() => setFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: theme.color.raised,
          borderColor: focused
            ? theme.color.focusRing
            : current
              ? theme.color.vermilion
              : theme.color.ruleStrong,
          borderWidth: focused || current ? 2 : 1,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
      testID={testID}
    >
      <Text
        style={[
          styles.choiceTitle,
          { color: current ? theme.color.vermilion : theme.color.ink, fontFamily: theme.font.sans },
        ]}
      >
        {`${title}${state}`}
      </Text>
      <Text
        style={[styles.choiceBody, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
      >
        {subtitle}
      </Text>
    </Pressable>
  );
}

interface LoadedDetailProps {
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly lenses: readonly { readonly label: string; readonly value: string }[];
  readonly sittings: string;
  readonly buildNote: string;
}

/**
 * What the loaded stage contains, counted off its own log.
 *
 * The five capability rows are printed separately and never combined. There is
 * no total here and there cannot be one: REQ-UI-07 forbids collapsing the five
 * into a single mastery figure, and a switcher card showing "78% studied" would
 * be that collapse wearing a percentage.
 */
function LoadedDetail({ facts, lenses, sittings, buildNote }: LoadedDetailProps): ReactNode {
  const theme = useTheme();
  return (
    <View style={styles.detail}>
      <View style={styles.facts}>
        {facts.map((fact) => (
          <Text
            key={fact.label}
            style={[styles.fact, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          >
            <Text style={{ color: theme.color.inkMuted }}>{`${fact.label} `}</Text>
            {fact.value}
          </Text>
        ))}
      </View>
      <Text style={[styles.body, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {`Sittings: ${sittings}.`}
      </Text>
      <Text style={[styles.body, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {`Contracts per capability, never averaged — ${lenses
          .map((lens) => `${lens.label} ${lens.value}`)
          .join(', ')}.`}
      </Text>
      <Text style={[styles.body, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {buildNote}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Layout
 *
 * Every horizontal rule here exists because of the 309-pixel overflow seven
 * lanes shipped: the row wraps, its text shrinks, and nothing is allowed to
 * demand the width of its own content. `e2e/viewport-overflow.spec.ts` measures
 * it at 390 and 360 CSS px with the panel open as well as closed.
 * ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  body: { fontSize: TYPE.small, lineHeight: TYPE.small * 1.5 },
  choice: {
    borderRadius: RADIUS.md,
    gap: 2,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 0,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    width: '100%',
  },
  choiceBody: { fontSize: TYPE.ruby, lineHeight: TYPE.ruby * 1.5 },
  choiceTitle: { fontSize: TYPE.label },
  choices: { gap: SPACE.sm, maxWidth: '100%', width: '100%' },
  control: {
    alignItems: 'center',
    borderRadius: RADIUS.md,
    flexShrink: 0,
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    minWidth: 88,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
  },
  controlLabel: { fontSize: TYPE.small },
  detail: { gap: SPACE.xs, maxWidth: '100%', width: '100%' },
  fact: { fontSize: TYPE.small },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md, maxWidth: '100%' },
  headline: { flexGrow: 1, flexShrink: 1, fontSize: TYPE.small, minWidth: 0 },
  line: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACE.sm,
    maxWidth: '100%',
    width: '100%',
  },
  panel: { maxHeight: 320, maxWidth: '100%', width: '100%' },
  panelContent: { gap: SPACE.sm, paddingTop: SPACE.sm },
  strip: {
    gap: SPACE.xs,
    maxWidth: '100%',
    overflow: 'hidden',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.xs,
    width: '100%',
  },
});
