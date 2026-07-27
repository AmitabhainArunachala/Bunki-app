/**
 * Screen 5 — integration canvas (WP-08; controller §10.5, REQ-UI-05,
 * REQ-SCH-06).
 *
 * The hand-written seed passage (分岐, controller §8) rendered as a reading
 * surface with inline interactions. One visible experience, several
 * observations — and the screen's job is to make the difference between them
 * *visible* rather than to decide it.
 *
 * ## The one thing this screen must not do
 *
 * It must not classify. Every tap is handed to `@bunki/domain`'s session module
 * as an interaction, and what comes back is a judgement the screen renders:
 * "this was a declared probe" or "this was exposure, because …". The screen
 * cannot mint a `ReviewGraded`, cannot choose a tier, and cannot mark something
 * a probe by styling it like one. If the rendering and the classification ever
 * disagreed, the classification is the one that reached the ledger.
 *
 * ## What the learner sees, and why
 *
 *   - the **target is a cloze**: hidden until they attempt or reveal it. That is
 *     the priming rule (REQ-SCH-06: "confirmation probes are deferred so a
 *     just-seen form is not 'retrieved' under priming") made physical — you
 *     cannot declare a retrieval of a form the page is showing you. The
 *     presentation is a state machine in `canvas-cloze.ts`, and every
 *     `targetWasHidden` this screen reports is read out of it rather than
 *     asserted; one blank yields at most one declared probe, and the buttons
 *     that could produce a second one are disabled once it is settled;
 *   - **every other word is a tap**, and a tap is exposure. Tier D, recorded,
 *     surfaced, never scheduled on (T-08);
 *   - **each interaction reports what it became**, immediately, in the ledger
 *     strip. REQ-SCH-06's user-facing promise is that the system verifies which
 *     is which; a canvas that verified silently would be asking to be trusted.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  CANVAS_IMMERSION_PROMISE,
  type CanvasLedgerEntry,
  type DomainContext,
  type Grade,
} from '@bunki/domain';

import { useDebugFlags } from '../state/app-context.tsx';
import { useLookup } from '../state/use-lookup.ts';
import { ProvenanceLine } from '../ui/notices.tsx';
import { AppButton, Hairline, Section } from '../ui/primitives.tsx';
import { RubyText } from '../ui/ruby.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { ScreenShell } from '../ui/screen-shell.tsx';
import { RADIUS, SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';
import {
  answerCloze,
  canAttempt,
  exposeOnCanvas,
  presentCloze,
  revealCloze,
  targetIsHidden,
  type ClozeTarget,
} from './canvas-cloze.ts';
import { segmentKey, segmentPassage, type PassageSegment } from './canvas-passage.ts';
import {
  NO_PROMOTED_TARGET_NOTE,
  passageMarks,
  useSessionLoop,
  type SessionLoop,
  type SessionTarget,
} from './session-loop.ts';

/** The cloze mask. Fixed width so revealing does not reflow the paragraph. */
const CLOZE_MASK = '▢▢';

export interface CanvasScreenProps {
  readonly context: DomainContext;
  readonly onBack: () => void;
}

export function CanvasScreen({ context, onBack }: CanvasScreenProps): ReactNode {
  const flags = useDebugFlags();
  const loop = useSessionLoop({ context });

  const resolve = useCallback(() => loop.target, [loop.target]);
  const { state: view, retry } = useLookup<SessionTarget>(resolve, {
    flags,
    emptyMessage: 'No passage is open yet.',
    emptyDetail: loop.error ?? NO_PROMOTED_TARGET_NOTE,
  });

  if (view.kind === 'loading') {
    return (
      <ScreenShell testID="screen-canvas" title="Integration canvas">
        <LoadingPanel label="Opening the passage…" />
      </ScreenShell>
    );
  }

  if (view.kind === 'error') {
    return (
      <ScreenShell testID="screen-canvas" title="Integration canvas">
        <ErrorPanel detail={view.detail} message={view.message} onRetry={retry} />
        <AppButton accessibilityHint="Returns to the session." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  if (view.kind === 'empty') {
    return (
      <ScreenShell testID="screen-canvas" title="Integration canvas">
        <EmptyPanel detail={view.detail} message={view.message} />
        <AppButton accessibilityHint="Returns to the session." label="Back" onPress={onBack} />
      </ScreenShell>
    );
  }

  return <CanvasBody loop={loop} onBack={onBack} target={view.data} />;
}

function CanvasBody({
  loop,
  target,
  onBack,
}: {
  readonly loop: SessionLoop;
  readonly target: SessionTarget;
  readonly onBack: () => void;
}): ReactNode {
  const theme = useTheme();

  // The blank's whole life, in one value. `useState`'s initialiser runs once, so
  // the mark is the instant the passage went on screen — which is what the
  // measured latency of an answer is measured from.
  const [cloze, setCloze] = useState(() => presentCloze(loop.now()));
  const targetHidden = targetIsHidden(cloze);
  const settled = !canAttempt(cloze);

  const clozeTarget: ClozeTarget = {
    experienceId: target.passage.id,
    componentId: target.componentId,
    probeContractId: target.probeContractId,
  };

  const segments = segmentPassage(target.passage.body, passageMarks(target));

  /** A tap on anything that is not the promoted target: exposure, tier D. */
  const tap = (componentId: string): void => {
    loop.dispatch({
      kind: 'canvasInteraction',
      offer: loop.offer,
      interaction: exposeOnCanvas(cloze, target.passage.id, 'tap', [componentId]),
    });
  };

  /** Reveal the cloze without answering. A declared probe that grades Again. */
  const reveal = (): void => {
    const step = revealCloze(cloze, clozeTarget, loop.now());
    loop.dispatch({ kind: 'canvasInteraction', offer: loop.offer, interaction: step.interaction });
    setCloze(step.next);
  };

  /** Answer the cloze. A declared probe under the target's exact contract. */
  const answer = (grade: Grade): void => {
    const step = answerCloze(cloze, clozeTarget, { grade, at: loop.now() });
    loop.dispatch({ kind: 'canvasInteraction', offer: loop.offer, interaction: step.interaction });
    setCloze(step.next);
  };

  /** Reading the whole passage without stopping: exposure over everything seen. */
  const readThrough = (): void => {
    const componentIds = segments
      .filter(
        (segment): segment is Extract<PassageSegment, { kind: 'mark' }> => segment.kind === 'mark',
      )
      .map((segment) => segment.mark.componentId);
    if (componentIds.length === 0) return;

    loop.dispatch({
      kind: 'canvasInteraction',
      offer: loop.offer,
      interaction: exposeOnCanvas(cloze, target.passage.id, 'read', componentIds),
    });
  };

  return (
    <ScreenShell
      lede={
        <Text style={[styles.promise, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
          {CANVAS_IMMERSION_PROMISE}
        </Text>
      }
      subtitle={`${target.passage.title} — ${target.passage.titleTranslation}`}
      testID="screen-canvas"
      title="Integration canvas"
    >
      {/* --------------------------------------------- the passage */}
      <View
        style={[
          styles.paper,
          { backgroundColor: theme.color.raised, borderColor: theme.color.rule },
        ]}
        testID="canvas-passage"
      >
        <Text style={[styles.passage, { color: theme.color.ink, fontFamily: theme.font.mincho }]}>
          {segments.map((segment, position) =>
            segment.kind === 'text' ? (
              <Text key={segmentKey(segment, position)}>{segment.text}</Text>
            ) : segment.mark.isTarget ? (
              <Text
                accessibilityHint="This is the blank. Answer it from memory, or show the answer."
                accessibilityLabel={
                  targetHidden ? 'Hidden target word' : `Target word ${segment.text}`
                }
                accessibilityRole="text"
                key={segmentKey(segment, position)}
                style={[
                  styles.cloze,
                  {
                    backgroundColor: theme.color.vermilionSoft,
                    color: theme.color.vermilion,
                  },
                ]}
                testID={`canvas-cloze-${String(segment.occurrence)}`}
              >
                {targetHidden ? CLOZE_MASK : segment.text}
              </Text>
            ) : (
              <Text
                accessibilityHint="Shows what this word is. Recorded as exposure, never as a review."
                accessibilityLabel={`${segment.text}${segment.mark.gloss === undefined ? '' : `: ${segment.mark.gloss}`}`}
                accessibilityRole="button"
                key={segmentKey(segment, position)}
                onPress={() => tap(segment.mark.componentId)}
                style={[styles.tappable, { color: theme.color.ink }]}
                testID={`canvas-tap-${segment.mark.componentId}`}
              >
                {segment.text}
              </Text>
            ),
          )}
        </Text>
        <ProvenanceLine field="body" record={target.passage.provenance.body} />
      </View>

      {/* --------------------------------------------- the declared probe */}
      <Section
        note={
          loop.offer === null
            ? 'This canvas offers no declared probe right now, so everything on it is exposure.'
            : `The blank is the one declared probe on this canvas: ${target.lexeme.headword}, under its reading contract. One answer settles it, and everything else you touch is exposure.`
        }
        testID="canvas-probe"
        title="The blank"
      >
        {targetHidden ? (
          // Deliberately not a `RubyText` with an empty reading: a ruby column
          // with nothing above it would still announce the written form, and
          // the whole point of the blank is that neither is on screen yet.
          <Text
            accessibilityLabel="The blank. The word and its reading are both hidden until you answer or reveal."
            style={[styles.blank, { color: theme.color.vermilion, fontFamily: theme.font.mincho }]}
            testID="canvas-probe-target"
          >
            {CLOZE_MASK}
          </Text>
        ) : (
          <RubyText
            reading={target.lexeme.reading}
            size={TYPE.headwordRow}
            testID="canvas-probe-target"
            written={target.lexeme.headword}
          />
        )}

        <View style={styles.actions}>
          <AppButton
            accessibilityHint="Shows the answer. Recorded, and the result becomes Again."
            disabled={settled}
            label="Show the answer"
            onPress={reveal}
            testID="canvas-reveal"
          />
        </View>

        <View style={styles.actions}>
          {(['again', 'hard', 'good', 'easy'] as const).map((grade) => (
            <AppButton
              accessibilityHint={`Records ${grade} for the reading contract, from inside the passage.`}
              accessibilityLabel={`${grade} for ${target.lexeme.headword}`}
              disabled={settled}
              key={grade}
              label={grade}
              onPress={() => answer(grade)}
              testID={`canvas-grade-${grade}`}
              variant={grade === 'good' ? 'primary' : 'secondary'}
            />
          ))}
        </View>

        {settled ? (
          <Text
            accessibilityLiveRegion="polite"
            style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            testID="canvas-settled"
          >
            The word is on the page now, so this blank is finished. Anything further you do with it
            is an encounter, not a recall — one blank, one answer.
          </Text>
        ) : null}

        <AppButton
          accessibilityHint="Records that you read the passage through. Exposure only."
          label="I just read it through"
          onPress={readThrough}
          testID="canvas-read-through"
          variant="quiet"
        />
      </Section>

      <Hairline />

      {/* --------------------------------------------- what each tap became */}
      <Section
        note="Every interaction above, and what the system judged it to be. This is the verification the promise refers to."
        testID="canvas-ledger"
        title="What happened here"
      >
        {loop.state.canvasLedger.length === 0 ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            Nothing yet. Tap a word, or answer the blank.
          </Text>
        ) : (
          loop.state.canvasLedger.map((entry) => <LedgerRow entry={entry} key={entry.eventId} />)
        )}
      </Section>

      <AppButton accessibilityHint="Returns to the session." label="Back" onPress={onBack} />
    </ScreenShell>
  );
}

function LedgerRow({ entry }: { readonly entry: CanvasLedgerEntry }): ReactNode {
  const theme = useTheme();
  const probe = entry.classification.kind === 'declared_probe';

  return (
    <View
      accessibilityLabel={
        probe
          ? `${entry.interactionKind}: a declared review of the target`
          : `${entry.interactionKind}: exposure. ${entry.classification.kind === 'exposure' ? entry.classification.detail : ''}`
      }
      accessible
      style={[
        styles.ledgerRow,
        {
          backgroundColor: theme.color.raised,
          borderColor: probe ? theme.color.vermilion : theme.color.rule,
        },
      ]}
      testID={`canvas-ledger-${entry.eventId}`}
    >
      <Text
        style={[
          styles.ledgerVerdict,
          {
            color: probe ? theme.color.vermilion : theme.color.inkMuted,
            fontFamily: theme.font.sans,
          },
        ]}
      >
        {probe ? 'declared review' : 'exposure'}
      </Text>
      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {entry.interactionKind} ·{' '}
        {entry.classification.kind === 'exposure'
          ? entry.classification.detail
          : 'Recorded against the target’s own contract, under the same rules a standalone review follows.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  promise: {
    fontSize: TYPE.label,
    fontStyle: 'italic',
    lineHeight: TYPE.label * 1.6,
  },
  paper: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    gap: SPACE.md,
    padding: SPACE.lg,
  },
  passage: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 2.1,
  },
  cloze: {
    borderRadius: RADIUS.sm,
    fontWeight: '700',
  },
  blank: {
    fontSize: TYPE.headwordRow,
    fontWeight: '700',
    letterSpacing: 2,
  },
  tappable: {
    textDecorationLine: 'underline',
    textDecorationStyle: 'dotted',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  ledgerRow: {
    borderLeftWidth: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  ledgerVerdict: {
    fontSize: TYPE.label,
    fontWeight: '700',
  },
});
