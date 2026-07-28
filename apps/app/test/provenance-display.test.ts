/**
 * Provenance wording (REQ-SRC-01, REQ-GATE-03, controller §8).
 *
 * The failure this file exists to catch is a *tone* failure that no type can
 * catch: a project-authored, unreviewed gloss rendered in the same shape as a
 * verified citation. Every seed record is walked, so a future dataset that
 * mixes sources cannot slip a fabricated-looking line onto a page.
 */

import { describe, expect, it } from 'vitest';

import { allSeedRecords, seedDataset, type ProvenanceRecord } from '@bunki/seed';

import {
  attributionLines,
  distinctProvenance,
  provenanceBadge,
  provenanceEntries,
  provenanceSummary,
  isSourced,
  standingOf,
} from '../src/data/provenance.ts';

const allRecords = (): readonly ProvenanceRecord[] =>
  allSeedRecords.flatMap((record) =>
    provenanceEntries(record.provenance as Readonly<Record<string, ProvenanceRecord>>).map(
      (entry) => entry.record,
    ),
  );

describe('standing', () => {
  it('maps each review status to the weight it can bear', () => {
    for (const record of allRecords()) {
      const standing = standingOf(record);
      if (record.review_status === 'primary-source-verified')
        expect(standing).toBe('source-verified');
      if (record.review_status === 'licensed-redistribution')
        expect(standing).toBe('source-licensed');
      if (record.review_status === 'reviewed-in-project') expect(standing).toBe('project-authored');
      if (record.review_status === 'unreviewed') expect(standing).toBe('unreviewed');
    }
  });

  it('treats an unrecognised status as the weakest, not the strongest', () => {
    const alien = { ...allRecords()[0], review_status: 'blessed' } as unknown as ProvenanceRecord;
    expect(standingOf(alien)).toBe('unreviewed');
  });
});

describe('summary wording', () => {
  it('never lets an unsourced field read as a dictionary citation', () => {
    for (const record of allRecords()) {
      if (isSourced(standingOf(record))) continue;
      const summary = provenanceSummary(record);
      expect(summary).toMatch(/written for this project/i);
      expect(summary).toMatch(/not from a published dictionary/i);
      expect(summary).not.toMatch(/jmdict|kanjidic|tatoeba|edrdg/i);
    }
  });

  /**
   * No record carries `licensed-redistribution` any more: EDRDG's own host became
   * reachable, so its data is primary-source-verified and the whole dataset is
   * sourced directly. The standing is deliberately **kept** rather than deleted —
   * the next import that can only reach a redistribution will need it, and
   * deleting it would mean re-inventing the distinction under deadline, which is
   * how a mirror gets quietly labelled as a primary source.
   *
   * So these two tests drive it with a synthetic record. That is the honest shape:
   * the guarantee is about the rendering functions, not about the current data,
   * and asserting `length > 0` over the dataset would only have been a statement
   * about today's contents that today's contents now falsify.
   */
  const redistributed: ProvenanceRecord = {
    ...(allRecords().find((r) => standingOf(r) === 'source-verified') as ProvenanceRecord),
    review_status: 'licensed-redistribution',
  };

  it('says where licensed-redistribution data actually came from', () => {
    // The whole point of the separate standing: a reader must not come away
    // believing the licensor's own host was reached when it was not.
    expect(standingOf(redistributed)).toBe('source-licensed');
    const summary = provenanceSummary(redistributed);
    expect(summary).toContain(redistributed.source);
    expect(summary).toContain(redistributed.license);
    expect(summary).toMatch(/pinned redistribution/i);
    expect(summary).not.toMatch(/written for this project/i);
  });

  it('keeps the two sourced standings from collapsing into one string', () => {
    const verified = allRecords().find((r) => standingOf(r) === 'source-verified');
    expect(verified).toBeDefined();
    expect(provenanceSummary(verified as ProvenanceRecord)).not.toBe(
      provenanceSummary(redistributed),
    );
    expect(provenanceBadge(verified as ProvenanceRecord)).not.toBe(provenanceBadge(redistributed));
  });

  it('now has nothing left standing on a redistribution', () => {
    // The positive claim this round earns, asserted rather than described.
    expect(allRecords().filter((r) => standingOf(r) === 'source-licensed')).toHaveLength(0);
  });

  it('distinguishes reviewed-in-project from unreviewed', () => {
    const reviewed = allRecords().find((r) => r.review_status === 'reviewed-in-project');
    const unreviewed = allRecords().find((r) => r.review_status === 'unreviewed');
    if (reviewed !== undefined) expect(provenanceSummary(reviewed)).toMatch(/reviewed in project/i);
    if (unreviewed !== undefined) expect(provenanceSummary(unreviewed)).toMatch(/not reviewed/i);
  });

  it('names the source and licence for verified data', () => {
    const verified = allRecords().filter((r) => standingOf(r) === 'source-verified');
    expect(verified.length).toBeGreaterThan(0);
    for (const record of verified) {
      const summary = provenanceSummary(record);
      expect(summary).toContain(record.source);
      expect(summary).toContain(record.license);
    }
  });

  it('badges every record with one of exactly four words', () => {
    for (const record of allRecords()) {
      expect(['sourced', 'licensed', 'project-written', 'unreviewed']).toContain(
        provenanceBadge(record),
      );
    }
  });
});

describe('attribution', () => {
  it('always leads with the attribution text the seed records', () => {
    for (const record of allRecords()) {
      expect(attributionLines(record)[0]).toBe(record.attribution);
    }
  });

  it('omits fields the seed left null rather than printing "null"', () => {
    for (const record of allRecords()) {
      const lines = attributionLines(record).join('\n');
      expect(lines).not.toMatch(/\bnull\b/);
      if (record.source_url === null) expect(lines).not.toMatch(/^https?:/m);
    }
  });

  it('collapses repeated registry entries so a page shows each source once', () => {
    const lexeme = seedDataset.lexemes[0];
    expect(lexeme).toBeDefined();
    const records = provenanceEntries(
      lexeme!.provenance as Readonly<Record<string, ProvenanceRecord>>,
    ).map((entry) => entry.record);
    expect(distinctProvenance(records).length).toBeLessThanOrEqual(records.length);
    expect(distinctProvenance(records).length).toBeGreaterThan(0);
  });
});

describe('field coverage', () => {
  it('produces one entry per data field of every seed record', () => {
    for (const record of allSeedRecords) {
      const provenance = record.provenance as Readonly<Record<string, ProvenanceRecord>>;
      const entries = provenanceEntries(provenance);
      expect(entries.length).toBe(Object.keys(provenance).length);
      for (const entry of entries) {
        expect(entry.record.source).not.toBe('');
        expect(entry.record.license).not.toBe('');
      }
    }
  });

  it('sorts fields, so the rendered table is stable between runs', () => {
    const lexeme = seedDataset.lexemes[0];
    const fields = provenanceEntries(
      lexeme!.provenance as Readonly<Record<string, ProvenanceRecord>>,
    ).map((entry) => entry.field);
    expect(fields).toEqual([...fields].sort());
  });
});
