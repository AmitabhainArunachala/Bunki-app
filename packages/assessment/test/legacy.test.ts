import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { inputHashOf } from '@bunki/ai/hash';
import { describe, expect, it } from 'vitest';
import {
  adaptLegacySet,
  assessmentLabel,
  assessAttemptAdmission,
  evaluateReleaseReview,
  parseFormVersion,
  parseLegacyEvidence,
  parseLegacySetAdaptation,
  preserveLegacyRun,
  preserveLegacySummary,
} from '../src/index.ts';
import { authority, clone, complete, decision } from './fixtures.ts';

const setDirectory = new URL('../../../prototypes/corridor/data/mock/sets/', import.meta.url);
const files = readdirSync(setDirectory)
  .filter((name) => name.endsWith('.json'))
  .sort();
function readSet(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(name, setDirectory), 'utf8')) as Record<string, unknown>;
}

describe('actual legacy content, without content or authority promotion', () => {
  it.each(files)(
    'preserves every field of %s and exposes only short unreviewed practice',
    (name) => {
      const original = readSet(name);
      const before = JSON.stringify(original);
      const adapted = adaptLegacySet(original);
      expect(adapted.original).toEqual(original);
      expect(adapted.sourceContentSha256).toBe(inputHashOf(original));
      expect(JSON.stringify(original)).toBe(before);
      expect(Object.isFrozen(original)).toBe(false);
      expect(Object.isFrozen(adapted.original)).toBe(true);
      expect(adapted.form.scope).toBe('short-practice');
      expect(adapted.review).toBe('unreviewed');
      expect(adapted.form.media).toHaveLength(0);
      expect(adapted.label).toMatch(/short practice · unreviewed$/u);
      expect(assessmentLabel(adapted.form)).toBe(adapted.label);
      expect(parseFormVersion(adapted.form)).toEqual(adapted.form);
      expect(parseLegacySetAdaptation(adapted)).toEqual(adapted);
      expect(evaluateReleaseReview(adapted.form, [], null).productionEligible).toBe(false);
      expect(adapted.form.rights.sync.status).toBe('unknown');
    },
  );
  it('audits the actual 25 sets as 423 short placements and zero listening or reviewed forms', () => {
    const adaptations = files.map((file) => adaptLegacySet(readSet(file)));
    expect(files).toHaveLength(25);
    expect(adaptations.reduce((sum, entry) => sum + entry.form.items.length, 0)).toBe(423);
    expect(adaptations.filter((entry) => entry.form.scope === 'full-candidate')).toHaveLength(0);
    expect(
      adaptations
        .flatMap((entry) => entry.form.items)
        .filter((entry) => entry.skill === 'listening'),
    ).toHaveLength(0);
    expect(
      Object.fromEntries(
        ['N5', 'N4', 'N3', 'N2', 'N1'].map((level) => [
          level,
          adaptations
            .filter((entry) => entry.form.exam.track === level)
            .reduce((sum, entry) => sum + entry.form.items.length, 0),
        ]),
      ),
    ).toEqual({ N5: 88, N4: 92, N3: 93, N2: 71, N1: 79 });
  });
  it('preserves an ambiguous N5 item without confusing a single key index with a unique valid answer', () => {
    const adapted = adaptLegacySet(readSet('n5-01.json'));
    const ambiguous = adapted.form.items.find((entry) => entry.prompt.startsWith('食器を'))!;
    expect(ambiguous.response.kind).toBe('selected');
    if (ambiguous.response.kind !== 'selected') throw new Error('fixture');
    expect(ambiguous.response.options.map((entry) => entry.text)).toEqual(
      expect.arrayContaining(['洗う', '洗おう']),
    );
    expect(adapted.issues).toContain('linguistic-correctness-not-established');
    // Even a separately recorded approval assertion cannot make unverified legacy rights valid.
    expect(
      evaluateReleaseReview(adapted.form, [decision(adapted.form)], authority).productionEligible,
    ).toBe(false);
    expect(assessAttemptAdmission(adapted.form, complete(adapted.form)).reasons).toContain(
      'content-not-cleared',
    );
  });
  it('does not translate a legacy approved boolean or rights-cleared prose into authority', () => {
    const source = readSet('n5-01.json');
    source['approved'] = true;
    const adapted = adaptLegacySet(source);
    expect(adapted.review).toBe('unreviewed');
    expect(adapted.issues).toContain('legacy-approval-not-version-bound');
    expect(adapted.form.items.every((entry) => entry.rights.display.status === 'unknown')).toBe(
      true,
    );
  });
  it('retains unknown source fields while any source-content change gets new bound versions', () => {
    const source = readSet('n5-01.json');
    const first = adaptLegacySet(source);
    source['futureMetadata'] = { label: 'preserve me', values: [1, true, null, '日本語'] };
    const next = adaptLegacySet(source);
    expect((next.original as Record<string, unknown>)['futureMetadata']).toEqual(
      source['futureMetadata'],
    );
    expect(next.form.revisionId).not.toBe(first.form.revisionId);
    expect(next.form.items[0]!.id).toBe(first.form.items[0]!.id);
    expect(next.form.items[0]!.revisionId).not.toBe(first.form.items[0]!.revisionId);
  });
  it('refuses a broken key, a future schema and a non-JSON source without silently fixing it', () => {
    const source = readSet('n5-01.json');
    source['schemaVersion'] = 2;
    expect(() => adaptLegacySet(source)).toThrow();
    const invalid = readSet('n5-01.json');
    const sections = invalid['sections'] as { items: { right: number }[] }[];
    sections[0]!.items[0]!.right = 20;
    expect(() => adaptLegacySet(invalid)).toThrow();
    invalid['private'] = () => 'do not execute';
    expect(() => adaptLegacySet(invalid)).toThrow();
  });
  it('uses the real production source fixture path, not an invented copy', () => {
    expect(fileURLToPath(setDirectory)).toContain('/prototypes/corridor/data/mock/sets/');
  });
  it('rejects altered original snapshots and projected content even when one claimed digest is updated', () => {
    const adapted = adaptLegacySet(readSet('n5-01.json'));
    const altered = clone(adapted);
    (altered.original as Record<string, unknown>)['built'] = 'tampered';
    expect(() => parseLegacySetAdaptation(altered)).toThrow(/revision-mismatch/u);
    altered.sourceContentSha256 = inputHashOf(altered.original);
    expect(() => parseLegacySetAdaptation(altered)).toThrow(/revision-mismatch/u);
    const projection = clone(adapted);
    projection.form.title = 'Approved official full test';
    expect(() => parseLegacySetAdaptation(projection)).toThrow(/revision-mismatch/u);
    expect(() => parseLegacySetAdaptation({ ...adapted, extraAuthority: true })).toThrow();
  });
});

describe('historical summaries and unbound runs', () => {
  it('retains a summary without inventing an attempt identity, answers or missing sittings', () => {
    const source = {
      score: 16,
      total: 18,
      ts: 1_778_000_000_000,
      extension: { learnerNote: '昔の記録' },
    };
    const saved = preserveLegacySummary('n5-01', source);
    expect(saved).toMatchObject({
      completeness: 'summary-only',
      binding: 'unverified',
      attemptId: null,
      formRevision: null,
      answers: null,
      reported: { score: 16, total: 18, timestamp: source.ts },
      original: source,
    });
    expect(preserveLegacySummary('n5-01', clone(source))).toEqual(saved);
    expect(saved.issues).toContain('historical-sittings-not-reconstructable');
    expect(Object.isFrozen(source)).toBe(false);
  });
  it('preserves malformed historical score claims and labels them unverified', () => {
    const saved = preserveLegacySummary('n5-01', {
      score: -3.5,
      total: 2,
      ts: -1,
      unknown: 'retained',
    });
    expect(saved.reported.score).toBe(-3.5);
    expect(saved.issues).toContain('reported-score-unverified');
    expect(preserveLegacySummary('n5-01', {}).reported).toEqual({
      score: null,
      total: null,
      timestamp: null,
    });
  });
  it('preserves completed and in-progress runs but refuses to bind indices to a current form', () => {
    const source = {
      setId: 'n5-01',
      level: 'N5',
      ix: 3,
      answers: [2, null, 1],
      ts: 10,
      extension: ['retain'],
    };
    const saved = preserveLegacyRun(source);
    expect(saved).toMatchObject({
      attemptId: null,
      formRevision: null,
      binding: 'unverified',
      resumeAllowed: false,
      admission: 'practice-only',
      original: source,
      reported: source,
    });
    const changedForm = readSet('n5-01.json');
    changedForm['built'] = 'a different edition';
    adaptLegacySet(changedForm);
    expect(preserveLegacyRun(source)).toEqual(saved);
    expect(preserveLegacyRun({ ...source, done: 20 }).reported.done).toBe(20);
  });
  it('preserves backward/equal timestamps and explicitly missing response positions', () => {
    const run = preserveLegacyRun({ setId: 'n5-01', ix: 1, answers: [null, 0], ts: 100, done: 50 });
    expect(run.reported).toMatchObject({ answers: [null, 0], ts: 100, done: 50 });
    expect(run.resumeAllowed).toBe(false);
  });
  it('refuses invalid legacy response indices without remapping or dropping them', () => {
    expect(() => preserveLegacyRun({ setId: 'n5-01', ix: 0, answers: [4] })).toThrow();
    expect(() => preserveLegacyRun({ setId: 'n5-01', ix: 401, answers: [] })).toThrow();
  });
  it('rehydrates summary/run wrappers by recomputing every projected field from original evidence', () => {
    const summary = preserveLegacySummary('n5-01', { score: 2, total: 18, extra: 'retained' });
    const run = preserveLegacyRun({ setId: 'n5-01', ix: 0, answers: [null] });
    expect(parseLegacyEvidence(summary)).toEqual(summary);
    expect(parseLegacyEvidence(run)).toEqual(run);
    expect(() =>
      parseLegacyEvidence({ ...summary, reported: { ...summary.reported, score: 18 } }),
    ).toThrow(/revision-mismatch/u);
    expect(() => parseLegacyEvidence({ ...run, resumeAllowed: true })).toThrow(
      /revision-mismatch/u,
    );
    expect(() => parseLegacyEvidence({ ...run, kind: 'unsupported' })).toThrow();
  });
});
