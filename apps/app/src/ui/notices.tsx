/**
 * Truth labels and provenance display (WP-05).
 *
 * These components exist because of one rule: nothing on a screen may imply a
 * standing the data does not have (REQ-GATE-03, REQ-SRC-01, controller §8).
 * The seed's lexical entries are project-authored pending licensed sources, so
 * a word page that looks like a dictionary page is a false claim regardless of
 * how careful the surrounding prose is. `SeedEntryDisclosure` is therefore not
 * decoration — the disclosure string comes from `@bunki/seed` itself, so the
 * package that knows what it is is the package that words it.
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
  provenanceBadge,
  provenanceEntries,
  provenanceSummary,
  standingOf,
} from '../data/provenance.ts';
import type { ProvenanceRecord } from '@bunki/seed';
import { RADIUS, SPACE, TYPE } from './theme.ts';
import { useTheme } from './theme-context.tsx';

/**
 * The seed's own entry disclosure, verbatim (controller §8).
 *
 * Required on word and kanji pages: an entry that *is* present can still be
 * incomplete, and none of the readings or senses were checked against a
 * published dictionary.
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
      style={[
        styles.disclosure,
        { backgroundColor: theme.color.vermilionSoft, borderColor: theme.color.vermilion },
      ]}
      testID={testID}
    >
      <Text
        style={[styles.disclosureText, { color: theme.color.ink, fontFamily: theme.font.sans }]}
      >
        {SEED_ENTRY_DISCLOSURE}
      </Text>
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
          color: standing === 'source-verified' ? theme.color.inkMuted : theme.color.vermilion,
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
          borderColor:
            standing === 'source-verified' ? theme.color.ruleStrong : theme.color.vermilion,
          color: standing === 'source-verified' ? theme.color.inkMuted : theme.color.vermilion,
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
    borderLeftWidth: 3,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.md,
  },
  disclosureText: {
    fontSize: TYPE.label,
    lineHeight: TYPE.label * 1.55,
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
