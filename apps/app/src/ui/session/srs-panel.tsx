/**
 * The SRS's own statistics surface — what you hold, and what is coming.
 *
 * Every figure and every sentence here comes from `@bunki/domain`'s
 * `session/standing.ts`. This file draws them and nothing else: it computes no
 * count, decides no threshold, and authors no copy that uses the scheduler's
 * vocabulary. That is controller §5 in the ordinary way, and it is also what
 * `apps/app/test/screen-contract.test.ts` enforces by scanning app source for
 * those nouns.
 *
 * Two drawing decisions are load-bearing enough to state, because both are
 * places a chart normally lies:
 *
 * **The load bars are proportions of a shared peak, with the count printed
 * beside each one.** The picture and the number cannot disagree, and there is no
 * implied axis — which is the standard way a small number is made to look large.
 *
 * **Nothing here has a total across lenses.** Reading, meaning, listening,
 * production and writing are five rows and stay five rows. No summary line, no
 * ratio, and no ordering by "how well you are doing", because there is no such
 * quantity (REQ-LM-03, REQ-UI-07).
 *
 * ## Width discipline
 *
 * Every row is `flexDirection: 'row'` with wrapping or with a `flex: 1` middle,
 * and nothing has a fixed width wider than a phone's content column.
 * `apps/app/e2e/viewport-overflow.spec.ts` measures the result at 390 and 360
 * CSS px; seven lanes once shipped 309 px of overflow because nothing did.
 */

import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  CONTRACT_STANDINGS,
  DEMOTED_CONTRACTS_NOTE,
  LENS_NOT_TAKEN_UP_NOTE,
  LOAD_AHEAD_DISCLOSURE,
  NO_COLLAPSED_LIGHT_RULE,
  NOTHING_SCHEDULED_NOTE,
  STANDING_LABEL,
  STANDING_MEANING,
  WRITING_LENS_DISCLOSURE,
  type LensStanding,
  type SrsStanding,
} from '@bunki/domain';

import { Disclosure } from '../disclosure.tsx';
import { Section } from '../primitives.tsx';
import { RADIUS, SPACE, TYPE } from '../theme.ts';
import { useTheme } from '../theme-context.tsx';

export interface SrsPanelProps {
  readonly standing: SrsStanding;
  readonly testID?: string | undefined;
}

export function SrsPanel({ standing, testID }: SrsPanelProps): ReactNode {
  const theme = useTheme();

  return (
    <View style={styles.wrapper} testID={testID}>
      <Section
        note={NO_COLLAPSED_LIGHT_RULE}
        testID="srs-standing"
        title={`What you are holding (${String(standing.contractCount)} contracts)`}
      >
        {standing.contractCount === 0 ? (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            {NOTHING_SCHEDULED_NOTE}
          </Text>
        ) : null}

        {standing.lenses.map((lens) => (
          <LensStandingRow key={lens.lens} standing={lens} />
        ))}

        {standing.inactiveCount === 0 ? null : (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            {String(standing.inactiveCount)} contract(s): {DEMOTED_CONTRACTS_NOTE}
          </Text>
        )}

        <Disclosure
          note="What each word means, in the kernel’s own terms."
          testID="srs-terms"
          title="The four words"
        >
          {CONTRACT_STANDINGS.map((entry) => (
            <Text
              key={entry}
              style={[styles.meta, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              <Text style={styles.termName}>{STANDING_LABEL[entry]}</Text> —{' '}
              {STANDING_MEANING[entry]}
            </Text>
          ))}
        </Disclosure>
      </Section>

      <Section note={LOAD_AHEAD_DISCLOSURE} testID="srs-load" title="The load ahead">
        <Text
          style={[styles.body, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          testID="srs-load-overdue"
        >
          {standing.load.overdue === 0
            ? 'Nothing has gone past its date.'
            : `${String(standing.load.overdue)} contract(s) have come round and are waiting.`}
        </Text>

        {standing.load.days.map((day) => (
          <View key={day.date} style={styles.loadRow}>
            <Text
              style={[styles.loadDay, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {day.offset === 0 ? 'today' : `+${String(day.offset)}d`}
            </Text>
            <View
              accessibilityLabel={`${day.date}: ${String(day.count)} contract(s)`}
              accessible
              style={[styles.track, { backgroundColor: theme.color.rule }]}
            >
              <View
                style={[
                  styles.bar,
                  {
                    backgroundColor: day.count === 0 ? 'transparent' : theme.color.vermilion,
                    // `flexGrow` on the filled part and a spacer for the rest
                    // keeps the whole thing inside the track's own width at any
                    // viewport, which a percentage string would not guarantee
                    // once the track itself is `flex: 1`.
                    flexGrow: day.count,
                  },
                ]}
              />
              <View style={{ flexGrow: Math.max(standing.load.peak - day.count, 0) }} />
            </View>
            <Text
              style={[styles.loadCount, { color: theme.color.ink, fontFamily: theme.font.sans }]}
            >
              {String(day.count)}
            </Text>
          </View>
        ))}

        {standing.load.beyondWindow === 0 ? null : (
          <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
            {String(standing.load.beyondWindow)} contract(s) come back after this window.
          </Text>
        )}
      </Section>
    </View>
  );
}

function LensStandingRow({ standing }: { readonly standing: LensStanding }): ReactNode {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.lensRow,
        { borderColor: theme.color.rule, backgroundColor: theme.color.raised },
      ]}
      testID={`srs-lens-${standing.lens}`}
    >
      <Text style={[styles.lensName, { color: theme.color.ink, fontFamily: theme.font.sans }]}>
        {standing.lens}
      </Text>
      {standing.unmeasurable ? (
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {WRITING_LENS_DISCLOSURE}
        </Text>
      ) : standing.contractCount === 0 ? (
        <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
          {LENS_NOT_TAKEN_UP_NOTE}
        </Text>
      ) : (
        <View style={styles.countRow}>
          {CONTRACT_STANDINGS.map((entry) => (
            <Text
              key={entry}
              style={[
                styles.count,
                {
                  color: standing.counts[entry] === 0 ? theme.color.inkFaint : theme.color.ink,
                  fontFamily: theme.font.sans,
                },
              ]}
              testID={`srs-count-${standing.lens}-${entry}`}
            >
              {String(standing.counts[entry])} {STANDING_LABEL[entry]}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: SPACE.lg,
  },
  body: {
    fontSize: TYPE.body,
    lineHeight: TYPE.body * 1.6,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  termName: {
    fontWeight: '700',
  },
  lensRow: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    gap: SPACE.xs,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
  },
  lensName: {
    fontSize: TYPE.label,
    fontWeight: '700',
  },
  countRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  count: {
    fontSize: TYPE.meta,
  },
  loadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: SPACE.sm,
  },
  loadDay: {
    fontSize: TYPE.meta,
    width: 44,
  },
  track: {
    borderRadius: 2,
    flexDirection: 'row',
    flexGrow: 1,
    flexShrink: 1,
    height: 10,
    overflow: 'hidden',
  },
  bar: {
    borderRadius: 2,
    height: 10,
  },
  loadCount: {
    fontSize: TYPE.meta,
    minWidth: 20,
    textAlign: 'right',
  },
});
