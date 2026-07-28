/**
 * The candidate panel (WP-07; controller §9, T-12's structural half,
 * REQ-UI-09).
 *
 * A block a page embeds beside a word, holding one bounded AI note. It renders
 * all four REQ-UI-09 states plus the two this panel genuinely has — `idle`
 * (nothing asked for yet) and `unavailable` (nothing we may send) — and it
 * cannot render a candidate without the "AI candidate / generated" label,
 * because the label comes from `labelsFor`, which returns one unconditionally.
 *
 * Every string on screen is derived: the labels and the standing note from
 * `@bunki/ai`, the origin line and the check line from the envelope the event
 * log holds. Nothing here is a literal a refactor could leave behind while the
 * data moved on.
 *
 * ## What accepting is
 *
 * One press, one `CandidateAcceptedAsNote`. There is no auto-accept path and no
 * timer; `userAction: true` is a literal in the frozen schema and this button
 * is the only thing in the app that produces it. Accepting keeps the text as
 * the learner's note — it does not make it canonical, does not create evidence,
 * and does not change what the app believes they know (REQ-ARCH-04).
 *
 * ## Mounting
 *
 * Not yet routed. The word page is a shared surface owned by another builder
 * this wave, so mounting is a coordination request (recorded in the build
 * capsule with the exact three-line diff) rather than an edit made here. The
 * E2E half of T-12 — that the label is visible in the exported web build — is
 * WP-10's and depends on that mount.
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppButton, Section } from '../ui/primitives.tsx';
import { EmptyPanel, ErrorPanel, LoadingPanel } from '../ui/screen-state.tsx';
import { RADIUS, SPACE, TYPE } from '../ui/theme.ts';
import { useTheme } from '../ui/theme-context.tsx';
import {
  CANDIDATE_ACCEPT_NOTE,
  checkLine,
  labelsFor,
  OFFLINE_PANEL_NOTE,
  originLine,
  statusLine,
  type CandidatePanelState,
} from './candidate-view-model.ts';

export interface CandidatePanelProps {
  readonly state: CandidatePanelState;
  readonly onRequest: () => void;
  readonly onAccept: () => void;
  /** The word this panel is about, for the spoken labels. */
  readonly headword: string;
  /** `true` only when connectivity is *known* to be offline. */
  readonly offline?: boolean | undefined;
  readonly testID?: string | undefined;
}

/**
 * The two badges.
 *
 * Both are text, not colour: a fill alone is information conveyed by colour
 * only, and the whole point of these is that they cannot be missed.
 */
function LabelRow({
  primary,
  secondary,
  accessibilityLabel,
}: {
  readonly primary: string;
  readonly secondary: string | null;
  readonly accessibilityLabel: string;
}): ReactNode {
  const theme = useTheme();
  return (
    <View accessibilityLabel={accessibilityLabel} accessible style={styles.labelRow}>
      <Text
        style={[
          styles.badge,
          {
            backgroundColor: theme.color.vermilionSoft,
            borderColor: theme.color.vermilion,
            color: theme.color.ink,
            fontFamily: theme.font.sans,
          },
        ]}
        testID="candidate-label"
      >
        {primary}
      </Text>
      {secondary === null ? null : (
        <Text
          style={[
            styles.badge,
            {
              backgroundColor: theme.color.raised,
              borderColor: theme.color.ruleStrong,
              color: theme.color.ink,
              fontFamily: theme.font.sans,
            },
          ]}
          testID="candidate-fallback-label"
        >
          {secondary}
        </Text>
      )}
    </View>
  );
}

export function CandidatePanel({
  state,
  onRequest,
  onAccept,
  headword,
  offline = false,
  testID = 'candidate-panel',
}: CandidatePanelProps): ReactNode {
  const theme = useTheme();

  const meta = (text: string, id?: string): ReactNode => (
    <Text
      style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
      testID={id}
    >
      {text}
    </Text>
  );

  return (
    <Section
      note="One bounded AI note about this word. Generated text, always labelled, never part of your record until you keep it."
      testID={testID}
      title="AI note"
    >
      {!offline ? null : meta(OFFLINE_PANEL_NOTE, 'candidate-offline-note')}

      {state.kind === 'idle' ? (
        <>
          {meta(
            'Nothing has been requested yet. Asking sends only the seeded example sentence for this word — never your own text.',
          )}
          <AppButton
            accessibilityHint="Requests one short generated note about this word."
            accessibilityLabel={`Ask for an AI note about ${headword}`}
            label="Ask for a note"
            onPress={onRequest}
            testID="candidate-request"
          />
        </>
      ) : null}

      {state.kind === 'loading' ? <LoadingPanel label="Asking…" /> : null}

      {state.kind === 'unavailable' ? (
        <EmptyPanel
          detail={state.message}
          message="No note available for this word."
          testID="candidate-unavailable"
        />
      ) : null}

      {state.kind === 'error' ? (
        <ErrorPanel
          detail={state.detail}
          message={state.message}
          onRetry={onRequest}
          testID="candidate-error"
        />
      ) : null}

      {state.kind === 'ready' ? (
        <View
          style={[
            styles.card,
            { backgroundColor: theme.color.raised, borderColor: theme.color.ruleStrong },
          ]}
          testID="candidate-card"
        >
          <LabelRow
            accessibilityLabel={labelsFor(state.candidate).accessibilityLabel}
            primary={labelsFor(state.candidate).primary}
            secondary={labelsFor(state.candidate).secondary}
          />
          {meta(labelsFor(state.candidate).standingNote, 'candidate-standing-note')}

          <Text
            style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            testID="candidate-text"
          >
            {state.candidate.text}
          </Text>

          {meta(originLine(state.candidate), 'candidate-origin')}
          {meta(checkLine(state.candidate), 'candidate-check')}
          {meta(statusLine(state.candidate), 'candidate-status')}

          {state.candidate.status === 'accepted' ? null : (
            <>
              {meta(CANDIDATE_ACCEPT_NOTE)}
              <AppButton
                accessibilityHint="Keeps this generated note on the thread. It stays labelled as generated."
                accessibilityLabel={`Keep this AI note about ${headword} as my own note`}
                label="Keep as my note"
                onPress={onAccept}
                testID="candidate-accept"
              />
            </>
          )}
        </View>
      ) : null}
    </Section>
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
  badge: {
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
