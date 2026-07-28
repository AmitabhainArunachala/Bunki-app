/**
 * The exchange (Campaign E / B6; map document §4.2).
 *
 * One turn per station-word: the seeded sentence, the guide's words about it
 * when the learner asks for them, and a row of stances the learner can choose
 * from. No turn has a right answer, so nothing here can render a tick, a cross,
 * or a running total — there is nothing in the data to render one from.
 *
 * The stance row is a `ChipButton` row for the same reason the uncertainty mark
 * is one (REQ-UI-01): the gesture is a single tap, it is visible which one is
 * chosen, and it stays editable afterwards. Choosing again replaces the
 * previous stance rather than adding a second.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  LEARNER_STANCES,
  LEARNER_STANCE_LABELS,
  type GuideConversation,
  type LearnerStance,
} from '@bunki/domain';

import { AppButton, ChipButton, Section } from '../primitives.tsx';
import { LoadingPanel } from '../screen-state.tsx';
import { Surface } from '../surface.tsx';
import { SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';
import { GUIDE_PROMPTS } from './guide-content.ts';
import { GuideSpeech } from './guide-speech.tsx';
import type { TurnSpeech } from './use-guide.ts';

export interface GuideConversationPanelProps {
  readonly conversation: GuideConversation;
  readonly speechByTurn: Readonly<Record<string, TurnSpeech>>;
  readonly asking: string | null;
  readonly onAsk: (turnId: string) => void;
  readonly onAnswer: (turnId: string, stance: LearnerStance) => void;
  readonly testID?: string | undefined;
}

/**
 * What is sent, said before anything is sent (OD-08, REQ-ARCH-07).
 *
 * Enumerated rather than summarised. The request carries exactly the three
 * fields `AiThreadContext` holds — the written form, the seeded sentence, and
 * the id of the seed record it came from — plus the envelope's own prompt
 * metadata. "Only the sentence" would have been *nearly* true, and the whole
 * value of a sentence like this is that a reader can check it against the type.
 */
const SENDING_NOTE =
  'Asking sends this word, the seeded sentence under it, and the id of the seed record that sentence came from. Nothing else about you goes with it. Your own answers never leave the device at all — they are chosen from the list below rather than typed, which is what keeps that true rather than promised.';

export function GuideConversationPanel({
  conversation,
  speechByTurn,
  asking,
  onAsk,
  onAnswer,
  testID = 'guide-conversation',
}: GuideConversationPanelProps): ReactNode {
  const theme = useTheme();

  return (
    <Section
      note="A conversation, not a placement test. Nothing here is right or wrong, nothing is counted, and none of it becomes a record of what you know."
      testID={testID}
      title="Talking to the guide"
    >
      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {SENDING_NOTE}
      </Text>

      {conversation.turns.map((turn) => {
        const prompt = GUIDE_PROMPTS.find((entry) => entry.turnId === turn.turnId);
        const speech = speechByTurn[turn.turnId];
        return (
          <Surface key={turn.turnId} level="card" pad="lg" testID={`guide-turn-${turn.turnId}`}>
            <Text style={[styles.form, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
              {turn.prompt.targetForm}
            </Text>
            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {prompt === undefined ? '' : `${prompt.reading} · ${prompt.gloss}`}
            </Text>
            <Text
              style={[
                styles.excerpt,
                {
                  color: theme.color.ink,
                  fontFamily: theme.font.mincho,
                  lineHeight: TYPE.body * theme.leading.japanese,
                },
              ]}
            >
              {turn.prompt.excerpt}
            </Text>

            {asking === turn.turnId ? (
              <LoadingPanel label={`Asking the guide about ${turn.prompt.targetForm}…`} />
            ) : speech === undefined ? (
              <AppButton
                accessibilityHint="Asks for one short generated note about this word."
                accessibilityLabel={`Ask the guide about ${turn.prompt.targetForm}`}
                label="Ask the guide about this"
                onPress={() => onAsk(turn.turnId)}
                testID={`guide-ask-${turn.turnId}`}
              />
            ) : (
              <GuideSpeech
                about={turn.prompt.targetForm}
                model={speech.model}
                provider={speech.provider}
                testID={`guide-speech-${turn.turnId}`}
                text={speech.text}
              />
            )}

            <Text
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              What would you say about it?
            </Text>
            <View style={styles.stances}>
              {LEARNER_STANCES.map((stance) => (
                <ChipButton
                  key={stance}
                  accessibilityLabel={`${LEARNER_STANCE_LABELS[stance]} — about ${turn.prompt.targetForm}`}
                  label={LEARNER_STANCE_LABELS[stance]}
                  onPress={() => onAnswer(turn.turnId, stance)}
                  selected={turn.answer === stance}
                  testID={`guide-stance-${turn.turnId}-${stance}`}
                />
              ))}
            </View>
          </Surface>
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  form: {
    fontSize: TYPE.headwordRow,
  },
  excerpt: {
    fontSize: TYPE.body,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  stances: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
});
