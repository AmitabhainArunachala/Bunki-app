/**
 * Truth labels and provenance display (WP-05).
 *
 * These components exist because of one rule: nothing on a screen may imply a
 * standing the data does not have (REQ-GATE-03, REQ-SRC-01, controller §8).
 *
 * That rule now cuts both ways. The seed's lexical entries *are* real licensed
 * JMdict and KANJIDIC2 data, so understating them would be its own falsehood —
 * but its example sentences, grammar notes and passage are still this project's
 * own writing, and the EDRDG licence additionally requires its acknowledgement
 * to appear on the screen displaying the words rather than in a file nobody
 * opens. `SeedEntryDisclosure` carries all three facts at once, and it is not
 * decoration: the string comes from `@bunki/seed` itself, so the package that
 * knows what the data is is the package that words it.
 *
 * `DurabilityNotice` does the same job for saving: the Phase-0 store is in
 * memory, and a "Saved" acknowledgment with nothing beside it would be read as
 * durability the app does not have (P0-CAP-15).
 */

import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SEED_COVERAGE_DISCLOSURE, SEED_ENTRY_DISCLOSURE } from '../data/catalog.ts';
import {
  attributionLines,
  distinctProvenance,
  isSourced,
  provenanceBadge,
  provenanceEntries,
  provenanceSummary,
  standingOf,
} from '../data/provenance.ts';
import type { ProvenanceRecord } from '@bunki/seed';
import { RADIUS, SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

/**
 * The seed's own entry disclosure, verbatim (controller §8; EDRDG statement §3).
 *
 * Required on every screen that displays words from the files: an entry that
 * *is* present can still be incomplete, none of the readings or senses were
 * checked against a published dictionary, and the licensor must be named where
 * the words are shown.
 *
 * ## Why it is quiet, and how quiet is allowed to be
 *
 * It shipped as a boxed vermilion block — 3 pt accent border, tinted fill,
 * label-size type — rendered *above* the content of eight screens. At 390 CSS
 * px it occupied the top 700 px of the map: a licence notice taller than the
 * subject of the page, in the one accent colour the whole design language
 * reserves for "where you are". The operator's first sight of the app was a
 * paragraph about CC BY-SA.
 *
 * §3 asks for the acknowledgement to be *made on the screen*. It does not ask
 * for it to be the loudest thing on it, and REQ-UI-08's calm surface is the
 * other requirement in the room. So:
 *
 *   - **Every word of it still renders, unfolded.** Not truncated, not behind a
 *     disclosure, not a link to a licence page. `attribution.tsx` has the rule
 *     and it is right: folding a licence condition away is not progressive
 *     disclosure. `e2e/edrdg-acknowledgement.spec.ts` asserts the element is
 *     *visible* and its text is the string verbatim, on every stop of the loop.
 *   - **It is set as small print**, at the foot of the screen, in the muted ink
 *     the rest of the app's provenance lines use, under a hairline. That is the
 *     register the same information already has everywhere else — the per-field
 *     `ProvenanceLine`, the `AttributionFooter` — so this stops being the one
 *     notice with its own visual language.
 *   - **The accent is not spent here.** Vermilion means "this is where you are"
 *     in the shell and "this claim is weaker than it looks" on a provenance
 *     line. A standing, permanent, always-true notice is neither.
 */
export function SeedEntryDisclosure({
  testID = 'seed-entry-disclosure',
}: {
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();
  return (
    <View
      // Not `alert`: this is a standing truth label, not an event. React
      // Native's role list has no `note`, so the label is carried by the text
      // itself and the container stays a plain grouping element.
      accessibilityLabel={`About this entry: ${SEED_ENTRY_DISCLOSURE}`}
      accessible
      style={styles.disclosure}
      testID={testID}
    >
      <View style={[styles.disclosureRule, { backgroundColor: theme.color.rule }]} />
      <Text
        style={[
          styles.disclosureText,
          // `inkFaint`, the register `AttributionFooter` and `ProvenanceLine`
          // already use for a source line. One notice with its own colour is
          // one notice that reads as louder than the others.
          { color: theme.color.inkFaint, fontFamily: theme.font.sans },
        ]}
      >
        {SEED_ENTRY_DISCLOSURE}
      </Text>
    </View>
  );
}

/**
 * The Sources screen's attribution block (EDRDG licence statement §3, clause 2).
 *
 * §3 has two obligations and this is the second one, which the build has been
 * carrying as an open coordination request:
 *
 * > For smartphone and tablet apps, acknowledgement must be made, e.g. on a
 * > separate screen accessed from a menu, such as one labelled "About",
 * > "Sources", etc. It is not sufficient just to mention it on a
 * > start-up/launch page of the app.
 *
 * `LICENSES.md` §2.2 recorded it as **not met** — "there is no Sources screen" —
 * and named it a precondition for any packaged mobile app. There is one now: the
 * shell's *About & diagnostics* destination, reached from the persistent menu on
 * every route, which is exactly the shape the clause asks for.
 *
 * Every source in the registry is listed, not only the ones with an obligation.
 * A screen that names JMdict and quietly omits the material this project wrote
 * itself would be the mirror-image dishonesty — the reader could not tell which
 * of the app's claims have a dictionary behind them and which do not, which is
 * the whole distinction {@link ProvenanceLine} exists to draw.
 */
export function SourcesSection({
  sources,
  testID = 'sources-attribution',
}: {
  readonly sources: Readonly<Record<string, ProvenanceRecord>>;
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();
  const listed = distinctProvenance(Object.values(sources));

  return (
    <View style={styles.attributions} testID={testID}>
      {listed.map((record) => (
        <View
          key={`${record.source}|${record.source_version}|${record.review_status}`}
          style={styles.attributionBlock}
        >
          <Text
            style={[
              styles.attributionSource,
              { color: theme.color.ink, fontFamily: theme.font.sans },
            ]}
          >
            {record.source} · {record.license}
          </Text>
          {attributionLines(record).map((line, index) => (
            <Text
              key={`${index}-${line.slice(0, 24)}`}
              style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
            >
              {line}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** The seed's coverage disclosure, for empty search results (controller §8). */
export function SeedCoverageDisclosure({
  testID = 'seed-coverage-disclosure',
}: {
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();
  return (
    <Text
      style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
      testID={testID}
    >
      {SEED_COVERAGE_DISCLOSURE}
    </Text>
  );
}

export function DurabilityNotice({
  note,
  testID = 'durability-notice',
}: {
  readonly note: string;
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();
  return (
    <Text
      style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
      testID={testID}
    >
      {note}
    </Text>
  );
}

/** One field's provenance, rendered inline under the value it describes. */
export function ProvenanceLine({
  record,
  field,
  testID,
}: {
  readonly record: ProvenanceRecord;
  readonly field?: string | undefined;
  readonly testID?: string | undefined;
}): ReactNode {
  const theme = useTheme();
  const standing = standingOf(record);
  return (
    <Text
      accessibilityLabel={`${field === undefined ? 'Source' : `Source of ${field}`}: ${provenanceSummary(record)}`}
      style={[
        styles.provenance,
        {
          color: isSourced(standing) ? theme.color.inkMuted : theme.color.vermilion,
          fontFamily: theme.font.sans,
        },
      ]}
      testID={testID}
    >
      {field === undefined ? '' : `${field} — `}
      {provenanceSummary(record)}
    </Text>
  );
}

/** A compact standing badge for dense rows. */
export function ProvenanceBadge({ record }: { readonly record: ProvenanceRecord }): ReactNode {
  const theme = useTheme();
  const standing = standingOf(record);
  return (
    <Text
      style={[
        styles.badge,
        {
          borderColor: isSourced(standing) ? theme.color.ruleStrong : theme.color.vermilion,
          color: isSourced(standing) ? theme.color.inkMuted : theme.color.vermilion,
          fontFamily: theme.font.sans,
        },
      ]}
    >
      {provenanceBadge(record)}
    </Text>
  );
}

/**
 * The per-field provenance table for one seed record (REQ-UI-02 Layer 3,
 * REQ-UI-03 Layer 3 — "attribution and provenance").
 *
 * This is the one part of layers 2–3 the Phase-0 seed supports fully, because
 * provenance is exactly what WP-04 made complete.
 */
export function ProvenanceTable({
  provenance,
  testID = 'provenance-table',
}: {
  readonly provenance: Readonly<Record<string, ProvenanceRecord>>;
  readonly testID?: string;
}): ReactNode {
  const theme = useTheme();
  const entries = provenanceEntries(provenance);
  const sources = distinctProvenance(entries.map((entry) => entry.record));

  return (
    <View style={styles.table} testID={testID}>
      {entries.map(({ field, record }) => (
        <View key={field} style={[styles.tableRow, { borderBottomColor: theme.color.rule }]}>
          <Text
            style={[styles.tableField, { color: theme.color.ink, fontFamily: theme.font.sans }]}
          >
            {field}
          </Text>
          <ProvenanceLine record={record} />
        </View>
      ))}

      <View style={styles.attributions}>
        {sources.map((record) => (
          <View
            key={`${record.source}|${record.source_version}|${record.review_status}`}
            style={styles.attributionBlock}
          >
            <Text
              style={[
                styles.attributionSource,
                { color: theme.color.ink, fontFamily: theme.font.sans },
              ]}
            >
              {record.source} · {record.license}
            </Text>
            {attributionLines(record).map((line, index) => (
              <Text
                key={`${index}-${line.slice(0, 24)}`}
                style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}
              >
                {line}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * A layer the seed cannot fill, said plainly.
 *
 * Controller §19 WP-05 excludes "any layer-2/3 content the seed cannot support
 * honestly". Omitting the section silently would leave the impression the app
 * has nothing to show there; naming what is missing and why is the difference
 * between an incomplete page and a misleading one.
 */
export function UnsupportedLayer({
  title,
  reason,
  testID,
}: {
  readonly title: string;
  readonly reason: string;
  readonly testID?: string | undefined;
}): ReactNode {
  const theme = useTheme();
  return (
    <View style={[styles.unsupported, { borderColor: theme.color.rule }]} testID={testID}>
      <Text
        accessibilityRole="header"
        style={[
          styles.unsupportedTitle,
          { color: theme.color.inkMuted, fontFamily: theme.font.sans },
        ]}
      >
        {title}
      </Text>
      <Text style={[styles.meta, { color: theme.color.inkMuted, fontFamily: theme.font.sans }]}>
        {reason}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disclosure: {
    gap: SPACE.sm,
  },
  disclosureRule: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  disclosureText: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  meta: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  provenance: {
    fontSize: TYPE.meta,
    lineHeight: TYPE.meta * 1.6,
  },
  badge: {
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    fontSize: TYPE.meta,
    paddingHorizontal: SPACE.sm,
    paddingVertical: 2,
  },
  table: {
    gap: SPACE.sm,
  },
  tableRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 2,
    paddingBottom: SPACE.sm,
  },
  tableField: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
  attributions: {
    gap: SPACE.md,
    marginTop: SPACE.md,
  },
  attributionBlock: {
    gap: 2,
  },
  attributionSource: {
    fontSize: TYPE.meta,
    fontWeight: '600',
  },
  unsupported: {
    borderRadius: RADIUS.sm,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: SPACE.xs,
    padding: SPACE.md,
  },
  unsupportedTitle: {
    fontSize: TYPE.label,
    fontWeight: '600',
  },
});
