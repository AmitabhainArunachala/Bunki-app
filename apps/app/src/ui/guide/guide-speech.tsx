/**
 * Everything the guide says, labelled before it can be read (Campaign E / B6).
 *
 * The rule the campaign brief sets for this lane: *everything the guide says is
 * AI output and must be labelled as such in the DOM before it is readable,
 * exactly as the existing candidate-label e2e case requires of AI candidates.*
 *
 * So this component takes the label row from `guideSpeechLabels`, which returns
 * a primary label unconditionally, and renders it **above** the text in source
 * order — which on a column layout is above it on screen, which is what the
 * e2e case measures with a bounding box. There is no prop that suppresses the
 * label and no branch that omits it; a caller who wants the guide's words gets
 * the label chip with them.
 *
 * The second chip is the fallback marker, and it is a *second* label rather
 * than a replacement, for the reason `@bunki/ai`'s `labels.ts` gives: a served
 * fixture is still generated content, and presenting one as a live model's
 * answer is the failure the whole labelling discipline exists to prevent.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { guideSpeechLabels, speechOriginLine } from './guide-view-model.ts';

export interface GuideSpeechProps {
  readonly text: string;
  readonly provider: string;
  readonly model: string;
  /** The word this was said about, for the spoken label. */
  readonly about: string;
  readonly testID?: string | undefined;
}

export function GuideSpeech({ text, provider, model, about, testID }: GuideSpeechProps): ReactNode {
  const theme = useTheme();
  const labels = guideSpeechLabels(provider);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
      ]}
      testID={testID}
    >
      <View
        accessibilityLabel={`${labels.accessibilityLabel} About ${about}.`}
        accessible
        style={styles.labelRow}
      >
        <Text
          style={[
            styles.labelChip,
            {
              backgroundColor: theme.color.vermilionSoft,
              borderColor: theme.color.vermilion,
              color: theme.color.ink,
              fontFamily: theme.font.sans,
            },
          ]}
          testID={testID === undefined ? undefined : `${testID}-label`}
        >
          {labels.primary}
        </Text>
        {labels.secondary === null ? null : (
          <Text
            style={[
              styles.labelChip,
              {
                backgroundColor: theme.color.raised,
                borderColor: theme.color.ruleStrong,
                color: theme.color.ink,
                fontFamily: theme.font.sans,
              },
            ]}
            testID={testID === undefined ? undefined : `${testID}-fallback-label`}
          >
            {labels.secondary}
          </Text>
        )}
      </View>

      <Text
        style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
        testID={testID === undefined ? undefined : `${testID}-standing-note`}
      >
        {labels.standingNote}
      </Text>

      <Text
        style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
        testID={testID === undefined ? undefined : `${testID}-text`}
      >
        {text}
      </Text>

      <Text
        style={[styles.meta, { color: theme.color.inkFaint, fontFamily: theme.font.sans }]}
        testID={testID === undefined ? undefined : `${testID}-origin`}
      >
        {speechOriginLine(provider, model)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: RADIUS.md,
    borderWidth: 1,
    gap: SPACE.sm,
    padding: SPACE.lg,
  },
  labelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  labelChip: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    fontSize: TYPE.meta,
    fontWeight: '700',
    letterSpacing: 0.3,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
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
