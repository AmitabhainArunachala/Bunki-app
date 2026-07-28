/**
 * Turning a seed provenance record into something a person can read (WP-05).
 *
 * REQ-UI-02 requires provenance on the word page and REQ-SRC-01 defines what a
 * provenance record contains. The gap between them is wording, and wording is
 * where honesty is usually lost: "分岐 — branching" beside a source name reads
 * like a dictionary citation even when the gloss was written by this project
 * and reviewed by nobody.
 *
 * So the summary is built from `review_status` first, not from `source`:
 *
 *   - `unreviewed`      → says so, in those words;
 *   - `reviewed-in-project` → says the project wrote and checked it;
 *   - `licensed-redistribution` → real licensed dictionary content with a real
 *     upstream entry id, but obtained from a pinned redistribution because the
 *     licensor's own host was unreachable. It reads as a citation, because it is
 *     one, and it says where it actually came from rather than implying the
 *     licensor was contacted;
 *   - `primary-source-verified` → data checked against the source project's own
 *     artefacts over HTTPS (KanjiVG, in this dataset).
 *
 * The two sourced standings are deliberately distinct strings. Collapsing them
 * would erase the one fact this build cannot demonstrate: that www.edrdg.org
 * was never reached.
 *
 * Pure functions over the seed's own types; unit-tested against every record in
 * `test/provenance-display.test.ts`, which also asserts that no summary of an
 * unreviewed field can be mistaken for a sourced one.
 */

import type { ProvenanceRecord } from '@bunki/seed';

/** How much weight a field's provenance can bear, worst first. */
export type ProvenanceStanding =
  'unreviewed' | 'project-authored' | 'source-licensed' | 'source-verified';

export function standingOf(record: ProvenanceRecord): ProvenanceStanding {
  switch (record.review_status) {
    case 'primary-source-verified':
      return 'source-verified';
    case 'licensed-redistribution':
      return 'source-licensed';
    case 'reviewed-in-project':
      return 'project-authored';
    case 'unreviewed':
      return 'unreviewed';
    default: {
      // A status this build does not know about is treated as the weakest one.
      // Failing open here would let a future value inherit a citation's weight.
      return 'unreviewed';
    }
  }
}

/** Standings that may be presented as a citation rather than as a caveat. */
export function isSourced(standing: ProvenanceStanding): boolean {
  return standing === 'source-verified' || standing === 'source-licensed';
}

/** The short line rendered next to a field. */
export function provenanceSummary(record: ProvenanceRecord): string {
  const standing = standingOf(record);
  if (standing === 'source-verified') {
    const version = record.source_version === '' ? '' : ` ${record.source_version}`;
    return `${record.source}${version} · ${record.license}`;
  }
  if (standing === 'source-licensed') {
    return `${record.source} · ${record.license} · from a pinned redistribution, not the licensor's own site`;
  }
  if (standing === 'project-authored') {
    return `Written for this project · reviewed in project · not from a published dictionary`;
  }
  return `Written for this project · not reviewed · not from a published dictionary`;
}

/** A one-word badge, for dense rows where the full summary will not fit. */
export function provenanceBadge(record: ProvenanceRecord): string {
  switch (standingOf(record)) {
    case 'source-verified':
      return 'sourced';
    case 'source-licensed':
      return 'licensed';
    case 'project-authored':
      return 'project-written';
    case 'unreviewed':
      return 'unreviewed';
  }
}

/**
 * Distinct provenance records across a set of fields, in a stable order.
 *
 * Word and kanji pages show a per-field line *and* a sources block; the block
 * would otherwise repeat the same registry entry five times.
 */
export function distinctProvenance(
  records: readonly ProvenanceRecord[],
): readonly ProvenanceRecord[] {
  const seen = new Set<string>();
  const out: ProvenanceRecord[] = [];
  for (const record of records) {
    const key = `${record.source}|${record.source_version}|${record.license}|${record.review_status}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(record);
  }
  return out;
}

/** The attribution block for a source, including retrieval date where there is one. */
export function attributionLines(record: ProvenanceRecord): readonly string[] {
  const lines: string[] = [record.attribution];
  if (record.source_url !== null) lines.push(record.source_url);
  if (record.retrieved_at !== null) lines.push(`Retrieved ${record.retrieved_at}`);
  if (record.source_entry_id !== null) lines.push(`Entry: ${record.source_entry_id}`);
  if (record.notes !== null) lines.push(record.notes);
  return lines;
}

/** Field-name → provenance pairs, for a record type's `provenance` map. */
export function provenanceEntries<T extends Readonly<Record<string, ProvenanceRecord>>>(
  provenance: T,
): readonly { readonly field: string; readonly record: ProvenanceRecord }[] {
  return Object.keys(provenance)
    .sort()
    .map((field) => ({ field, record: provenance[field] as ProvenanceRecord }));
}
