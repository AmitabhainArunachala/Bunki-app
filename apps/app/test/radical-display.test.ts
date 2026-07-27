/**
 * The kanji page never renders a classification-scheme name (WP-09; REQ-UI-03).
 *
 * This closes the W3 carried item "'nelson' token on kanji page". The existing
 * scan in `screen-contract.test.ts` reads *source text*, and the leak did not
 * live in source: the seed's radical records carry a `kind` naming the scheme
 * that assigned them, two of the ten characters carry Nelson's, and the screen
 * printed `{radical.kind}` verbatim.
 *
 * So this file scans **data**, not source. It walks every radical record in the
 * seed, renders it the way the screen does, and asserts that no scheme label
 * from the dataset survives into the strings the page shows — including labels
 * this file has never heard of, because the list of labels is read from the
 * seed rather than typed here.
 *
 * That direction matters. A denylist test would only fail for the names someone
 * remembered to add; reading the labels out of the data means a future seed
 * that introduced a new scheme would fail this test on the day it arrived.
 */

import { describe, expect, it } from 'vitest';

import { seedDataset } from '@bunki/seed';

import { radicalDisplay, schemeLabelsInSeed } from '../src/data/radical-display.ts';

const SCHEME_LABELS = schemeLabelsInSeed(seedDataset.kanji);

describe('the seed really does carry scheme labels (the defect was real)', () => {
  it('records at least one scheme label per radical', () => {
    const withRadicals = seedDataset.kanji.filter((kanji) => kanji.radicals.length > 0);
    expect(withRadicals.length).toBeGreaterThan(0);
    expect(SCHEME_LABELS.length).toBeGreaterThan(0);
  });

  /**
   * Pinned as a fact about the dataset, not as an approval of it. If this list
   * changes, the assertions below still hold — they are computed from it — but
   * the change becomes visible in a diff instead of passing silently.
   */
  it('carries exactly the labels this build was written against', () => {
    expect(SCHEME_LABELS).toEqual(['general', 'nelson', 'tradit']);
  });
});

describe('no scheme label reaches a rendered string (REQ-UI-03)', () => {
  it.each(seedDataset.kanji.map((kanji) => [kanji.character, kanji] as const))(
    '%s renders no scheme label',
    (_character, kanji) => {
      const display = radicalDisplay(kanji.radicals);
      const rendered = [...display.elements, display.note].join(' ').toLocaleLowerCase('en-US');

      for (const label of SCHEME_LABELS) {
        expect(rendered, `“${label}” reached the page for ${kanji.character}`).not.toContain(
          label.toLocaleLowerCase('en-US'),
        );
      }
    },
  );

  it('renders the elements, which are what a learner can actually use', () => {
    const bunki = seedDataset.kanji.find((kanji) => kanji.character === '分');
    expect(bunki, 'fixture assumption: 分 is in the seed').toBeDefined();

    const display = radicalDisplay(bunki?.radicals ?? []);
    expect(display.elements).toEqual(['八', '刀']);
    expect(display.analyses).toBe(2);
  });

  it('says when the source records more than one analysis, rather than picking one', () => {
    const twoAnalyses = radicalDisplay([
      { element: '八', kind: 'nelson' },
      { element: '刀', kind: 'tradit' },
    ]);
    expect(twoAnalyses.note).toContain('more than one radical analysis');
    expect(twoAnalyses.note).toContain('join keys');

    const oneAnalysis = radicalDisplay([{ element: '日', kind: 'general' }]);
    expect(oneAnalysis.note).toContain('records this element as the radical');
    expect(oneAnalysis.elements).toEqual(['日']);
  });

  it('is total: no radicals produces a well-formed result, not an empty string', () => {
    const none = radicalDisplay([]);
    expect(none.elements).toEqual([]);
    expect(none.analyses).toBe(0);
    expect(none.note).toContain('No component role is recorded');
  });

  it('deduplicates an element two schemes agree on', () => {
    const display = radicalDisplay([
      { element: '水', kind: 'general' },
      { element: '水', kind: 'nelson' },
    ]);
    expect(display.elements).toEqual(['水']);
    expect(display.analyses).toBe(2);
    // One distinct element: the schemes agree, so there is nothing to warn about.
    expect(display.note).toContain('records this element as the radical');
  });

  /**
   * A scheme this build has never seen must be excluded too. The fix is a
   * rebuild from the fields that may be rendered, not a filter on the ones that
   * may not, so an unknown label has no path to the page at all.
   */
  it('excludes a scheme label that does not exist yet', () => {
    const display = radicalDisplay([{ element: '心', kind: 'a-scheme-invented-in-2031' }]);
    const rendered = [...display.elements, display.note].join(' ');
    expect(rendered).not.toContain('2031');
    expect(display.elements).toEqual(['心']);
  });
});
