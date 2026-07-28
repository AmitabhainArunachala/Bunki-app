/**
 * The lookup that happens without leaving the passage (Campaign E, lane B4).
 *
 * ## The rule this component exists to keep
 *
 * Round-2 research, §4: the design to steal from Migaku is precise — *the lookup
 * and the capture must happen without leaving the content*. §5 turns it into an
 * instruction for this lane: "Measure it: if capturing costs a navigation, it is
 * wrong."
 *
 * So this is a panel, not a route. It mounts under the passage, inside the same
 * scroll view, with the text it is about still on screen; there is no router
 * anywhere in its module graph and there is no href it can produce. The word
 * page is still offered, as a deliberate exit for a learner who wants the full
 * page, and it is the only control here that moves anywhere.
 *
 * The claim is measured rather than asserted: `e2e/reading-surface.spec.ts`
 * counts `history.pushState`/`replaceState`/`popstate` across a tap and a keep
 * and requires zero, and `scripts/capture-reading.mjs` records the same counters
 * and the measured keep latency into the evidence README.
 *
 * ## What a capture is, and what it is not
 *
 * Keeping a word from here runs the same `capture` command the front door runs.
 * It records that the learner met this word, in this passage, at this moment.
 * It is **not** evidence: no probe was declared, nothing was answered before a
 * reveal, and the domain's evidence gate is not reached by any path from this
 * file. Reading is exposure; exposure is never retrieval. The panel says so on
 * screen, beside the button, rather than only in this comment.
 *
 * ## Why there is no recall meter here
 *
 * `RecallMeter` renders a band per capability, and this build holds no
 * per-capability memory state for a word met in a passage — the memory model
 * lives behind the evidence gate in `@bunki/domain` and the app may not compute
 * a second opinion about it (controller §5). Rendering a meter with an invented
 * band would be the exact defect class this project keeps catching, so the panel
 * states the absence with `UnsupportedLayer` instead.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AttributionFooter, type AttributionLine } from '../attribution.tsx';
import { Disclosure } from '../disclosure.tsx';
import { type FrontierMarkKind } from '../frontier-marks.ts';
import { UnsupportedLayer } from '../notices.tsx';
import { AppButton } from '../primitives.tsx';
import { RubyText } from '../ruby.tsx';
import { Surface } from '../surface.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

/** One example sentence, with the credit its licence requires beside it. */
export interface LookupExample {
  readonly text: string;
  readonly translation: string;
  /** Who this sentence belongs to. Rendered under it, never folded away. */
  readonly credit: string;
}

/** Everything the panel renders, resolved by the screen. */
export interface LookupEntry {
  readonly lexemeId: string;
  readonly headword: string;
  readonly reading: string;
  readonly senses: readonly string[];
  readonly partOfSpeech: readonly string[];
  /** Where this word sits relative to the learner's frontier, right now. */
  readonly mark: FrontierMarkKind;
  /** One line saying what that mark is derived from. */
  readonly markBasis: string;
  /** Which tier of the dataset answered — fixture or imported. */
  readonly tier: string;
  readonly examples: readonly LookupExample[];
  readonly attribution: readonly AttributionLine[];
  /** What this content *is*: sourced, project-written, unreviewed. */
  readonly standing: string;
}

export interface InlineLookupProps {
  readonly entry: LookupEntry;
  /** Keep this word. Runs a command; never mints evidence. */
  readonly onKeep: () => void;
  /**
   * The store's own acknowledgement sentence, or `null` before a keep. Rendered
   * verbatim: the screen derives it from what the command actually appended, so
   * the panel cannot claim a durability the store did not report.
   */
  readonly keepAcknowledgement: string | null;
  /** The deliberate exit. The only control here that navigates. */
  readonly onOpenWord: () => void;
  readonly onClose: () => void;
  readonly testID?: string | undefined;
}

/** Said beside the keep button, because it is the sentence most easily assumed away. */
export const EXPOSURE_NOTE =
  'Reading is exposure, not retrieval. Opening this lookup records nothing, and keeping the word records only that you met it here — no answer was asked for, so nothing about your memory changed.';

export function InlineLookup({
  entry,
  onKeep,
  keepAcknowledgement,
  onOpenWord,
  onClose,
  testID = 'reading-lookup',
}: InlineLookupProps): ReactNode {
  const theme = useTheme();

  return (
    <View
      // Polite rather than assertive: the panel appearing is not an interruption,
      // and a sighted reader gets the same fact from it arriving under the text.
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <Surface level="overlay" pad="lg">
        <View style={styles.head}>
          <Text
            accessibilityRole="header"
            style={[styles.eyebrow, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          >
            In the passage
          </Text>
          <AppButton
            accessibilityHint="Closes the lookup. The passage does not move."
            accessibilityLabel={`Close the lookup for ${entry.headword}`}
            label="Close"
            onPress={onClose}
            testID="reading-lookup-close"
            variant="quiet"
          />
        </View>

        <RubyText
          reading={entry.reading}
          size={TYPE.headwordRow}
          testID="reading-lookup-headword"
          written={entry.headword}
        />

        <Text
          style={[styles.senses, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          testID="reading-lookup-senses"
        >
          {entry.senses.join(' · ')}
        </Text>

        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {entry.partOfSpeech.join(' · ')}
          {entry.partOfSpeech.length === 0 ? '' : ' · '}
          {entry.tier}
        </Text>

        <Text
          style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
          testID="reading-lookup-basis"
        >
          {entry.markBasis}
        </Text>

        <View style={styles.actions}>
          {keepAcknowledgement === null ? (
            <AppButton
              accessibilityHint="Records that you met this word in this passage. It does not grade anything."
              accessibilityLabel={`Keep ${entry.headword}`}
              label="Keep this word"
              onPress={onKeep}
              testID="reading-lookup-keep"
              variant="primary"
            />
          ) : (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.kept, { color: theme.color.ink, fontFamily: theme.font.sans }]}
              testID="reading-lookup-kept"
            >
              {keepAcknowledgement}
            </Text>
          )}
          <AppButton
            accessibilityHint="Leaves the passage for the full word page."
            accessibilityLabel={`Open the word page for ${entry.headword}`}
            label="Word page"
            onPress={onOpenWord}
            testID="reading-lookup-word-page"
          />
        </View>

        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {EXPOSURE_NOTE}
        </Text>

        <Disclosure
          count={entry.examples.length}
          empty={
            entry.examples.length === 0
              ? 'No example sentence in this build references this entry.'
              : undefined
          }
          note="Each sentence is credited to whoever wrote it."
          testID="reading-lookup-examples"
          title="Example sentences"
        >
          {entry.examples.map((example) => (
            <View key={example.text} style={styles.example}>
              <Text
                style={[
                  styles.exampleText,
                  { color: theme.color.ink, fontFamily: theme.font.mincho },
                ]}
              >
                {example.text}
              </Text>
              <Text
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                {example.translation}
              </Text>
              <Text
                style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
              >
                {example.credit}
              </Text>
            </View>
          ))}
        </Disclosure>

        <UnsupportedLayer
          reason="This build records that you met a word; it holds no per-capability strength for one. A single figure across reading, meaning, listening, production and writing is the rollup REQ-LM-03 forbids, and inventing five would be worse than showing none."
          testID="reading-lookup-no-recall"
          title="Memory state per capability"
        />

        <AttributionFooter
          lines={entry.attribution}
          standing={entry.standing}
          testID="reading-lookup-attribution"
        />
      </Surface>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACE.md,
    justifyContent: 'space-between',
  },
  eyebrow: {
    fontSize: TYPE.meta,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  senses: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.6,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  kept: {
    flexShrink: 1,
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.6,
  },
  example: {
    gap: 2,
  },
  exampleText: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.75,
  },
});
