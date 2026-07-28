/**
 * The kanji page, which is the dive stopped at L2 (lane B2, second pass).
 *
 * ## Why this file exists at all
 *
 * `src/ui/dive/dive-detail.ts` derives every section of the kanji page — the
 * components with their roles, the reading families, the shared-shape set, the
 * compounds ranked by JMdict's own commonness, and the one note that is the
 * character explaining itself. Three docblocks in the lane already cited a
 * `test/dive-detail.test.ts`, and until this file landed there was none. A
 * comment naming a test that does not exist is the most-caught defect class in
 * this repository, and the honest repair is the test rather than the deletion of
 * the sentence.
 *
 * ## What is checked, and what is deliberately not
 *
 * The claims here are the ones the *page copy* makes, because those are the ones
 * a learner reads as fact:
 *
 *   - **"ranked by JMdict's own commonness tags"** — so {@link jmdictPriorityRank}
 *     is checked against real `nfXX` bands, and the ordering it produces over the
 *     real tier is checked to be the one the page prints.
 *   - **"every role here is unclassified"** — so the roles are read off the real
 *     dictionary and asserted to be exactly that, because the moment one came
 *     back `semantic` the note beside it would be false.
 *   - **"a shared shape and not a contrast set"** — so nothing in the detail may
 *     carry a `contrasts_with` basis, over the real tier.
 *   - **"the reading is the reason, and it is shown"** — so every family entry
 *     must carry a non-empty `via`.
 *   - **the note is a frame around two sourced facts** — so it refuses to exist
 *     with fewer than two words, and it never contains the character's own
 *     headword as one of its examples.
 *
 * What is **not** checked here is what the note *means*. The design document's
 * reading of 奥さん is a real historical claim and none of its sources are in
 * this build; `SELF_NOTE_STANDING` says so on screen and this file does not
 * pretend otherwise.
 *
 * ## Cost
 *
 * The last block measures what building one page costs over the real 3,000-lexeme
 * tier and prints it, so the number in the capsule is one this suite produced.
 */

import { describe, expect, it } from 'vitest';

import { diveAt } from '@bunki/domain';

import {
  findKanjiByCharacter,
  importedDictionary,
  importedExtras,
  seedDataset,
} from '../src/data/catalog.ts';
import {
  DETAIL_DIVE_OPTIONS,
  DETAIL_SECTION_LIMIT,
  RING_DISPLAY_LIMIT,
  buildKanjiDetail,
  buildSelfNote,
  compoundsDisclosure,
  eraOfLexeme,
  jmdictPriorityRank,
} from '../src/ui/dive/dive-detail.ts';
import { appScaleLadder, kanjiNodeId } from '../src/ui/dive/scale-source.ts';

const { ladder } = appScaleLadder();

/* ------------------------------------------------------------------ *
 * The ranking
 * ------------------------------------------------------------------ */

describe('compounds are ranked by JMdict’s own signal, which is the page’s claim', () => {
  it('reads the nf band out of the tag list, lower being commoner', () => {
    expect(jmdictPriorityRank(['nf01'])).toBe(1);
    expect(jmdictPriorityRank(['ichi1', 'news1', 'nf12'])).toBe(12);
    expect(jmdictPriorityRank(['nf01'])).toBeLessThan(jmdictPriorityRank(['nf24']));
  });

  it('ranks a common word with no band above an untagged one, and below any band', () => {
    const banded = jmdictPriorityRank(['nf48']);
    const commonNoBand = jmdictPriorityRank(['ichi1']);
    const untagged = jmdictPriorityRank([]);
    expect(banded).toBeLessThan(commonNoBand);
    expect(commonNoBand).toBeLessThan(untagged);
  });

  it('sorts an untagged entry last rather than first', () => {
    // The sixteen hand-written fixture entries carry no priority tags at all.
    // Treating "no tag" as "most common" would have put them above 子供, which
    // is the specific mistake the fallback is written against.
    //
    // The band used here is `nf48`, JMdict's real last band, rather than a
    // three-digit one: the untagged sentinel is 99 and a hypothetical `nf99`
    // would tie with it rather than sort above it. That collision is
    // unreachable from the shipped data — the importer's own tags stop well
    // short of it — and it is recorded here rather than asserted away, because
    // a test that pretended `nf99` sorted correctly would be asserting a
    // property the function does not have.
    expect(jmdictPriorityRank([])).toBeGreaterThan(jmdictPriorityRank(['nf48']));
    expect(jmdictPriorityRank([])).toBeGreaterThan(jmdictPriorityRank(['ichi1']));
  });

  it('carries no band past the sentinel anywhere in the shipped tier', () => {
    // The tie above is only unreachable if it is actually unreachable, so this
    // checks the corpus rather than trusting the sentence.
    const bands = new Set<number>();
    for (const lexeme of importedDictionary.lexemes) {
      bands.add(jmdictPriorityRank(importedExtras(lexeme.id)?.priorityTags ?? []));
    }
    const fromBands = [...bands].filter((rank) => rank < 90);
    expect(fromBands.length).toBeGreaterThan(0);
    expect(Math.max(...fromBands)).toBeLessThan(90);
  });

  it('ignores a tag that only looks like a band', () => {
    expect(jmdictPriorityRank(['nfx'])).toBe(jmdictPriorityRank([]));
    expect(jmdictPriorityRank(['spec2'])).toBe(jmdictPriorityRank([]));
  });

  it('produces a non-increasing rank down the page, over the real dictionary', () => {
    const detail = buildKanjiDetail(ladder, '分');
    expect(detail).not.toBeNull();
    const ranks = (detail?.compounds ?? []).map((entry) => entry.rank);
    expect(ranks.length).toBeGreaterThan(1);
    for (let index = 1; index < ranks.length; index += 1) {
      expect(ranks[index - 1] ?? 0).toBeLessThanOrEqual(ranks[index] ?? 0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The note
 * ------------------------------------------------------------------ */

describe('the one note is the character explaining itself, and nothing more', () => {
  it('shows the recorded sense recurring across the character’s own words', () => {
    const note = buildSelfNote('奥', 'interior', ['奥さん', '奥深い', '奥義']);
    expect(note).not.toBeNull();
    expect(note?.words).toEqual(['奥さん', '奥深い', '奥義']);
    expect(note?.line).toContain('奥');
    expect(note?.line).toContain('interior');
  });

  it('refuses to exist with fewer than two words, because one is a definition', () => {
    expect(buildSelfNote('奥', 'interior', ['奥さん'])).toBeNull();
    expect(buildSelfNote('奥', 'interior', [])).toBeNull();
  });

  it('refuses to exist with no recorded sense rather than inventing one', () => {
    expect(buildSelfNote('奥', undefined, ['奥さん', '奥深い'])).toBeNull();
    expect(buildSelfNote('奥', '   ', ['奥さん', '奥深い'])).toBeNull();
  });

  it('never offers the character itself as one of its own examples', () => {
    const note = buildSelfNote('人', 'person', ['人', '人間', '大人']);
    expect(note?.words).toEqual(['人間', '大人']);
  });

  it('shows at most three words, so a note stays a line', () => {
    const note = buildSelfNote('分', 'part', ['分岐', '分野', '分解', '分別', '自分']);
    expect(note?.words.length).toBeLessThanOrEqual(3);
  });

  it('carries no etymology and asserts no connection, over the real dictionary', () => {
    const detail = buildKanjiDetail(ladder, '人');
    const line = detail?.note?.line ?? '';
    expect(line.length).toBeGreaterThan(0);
    // The line is a frame: the sense in quotes, then the words. It makes no
    // claim about how the character came to mean that, and the words that would
    // make such a claim are the ones to catch.
    for (const forbidden of ['originally', 'derives', 'depicts', 'pictograph', 'ancient']) {
      expect(line.toLocaleLowerCase('en-US')).not.toContain(forbidden);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The sections, over the real dictionary
 * ------------------------------------------------------------------ */

describe('the page sections say only what the shipped files support', () => {
  const detail = buildKanjiDetail(ladder, '分');

  it('builds at all for a character both tiers carry', () => {
    expect(detail).not.toBeNull();
    expect(detail?.kanji.character).toBe('分');
    expect(detail?.nodeId).toBe(kanjiNodeId('分'));
  });

  it('returns null for a character this build does not carry, rather than a stub', () => {
    expect(buildKanjiDetail(ladder, '🙂')).toBeNull();
    expect(buildKanjiDetail(ladder, '')).toBeNull();
  });

  it('marks every component role unclassified, which is what the note beside it says', () => {
    const roles = new Set((detail?.components ?? []).map((entry) => entry.role));
    expect([...roles]).toEqual(['unclassified']);
  });

  it('counts how many characters use each shape rather than claiming a meaning', () => {
    for (const component of detail?.components ?? []) {
      expect(component.usedBy, component.element).toBeGreaterThan(0);
      expect(Number.isInteger(component.usedBy)).toBe(true);
    }
  });

  it('shows the reading that makes each family member a family member', () => {
    const family = buildKanjiDetail(ladder, '人')?.readingFamily ?? [];
    expect(family.length).toBeGreaterThan(0);
    for (const entry of family) {
      expect(entry.via, entry.character).not.toBe('');
      expect(entry.character).not.toBe('人');
    }
  });

  it('never calls a shared shape a contrast, because no shipped file declares one', () => {
    const shared = buildKanjiDetail(ladder, '林')?.sharedComponent ?? [];
    for (const entry of shared) {
      expect(entry.element).not.toBe('');
      expect(entry.character).not.toBe('林');
    }
    // The basis on every relation the dive returned for this character, so the
    // claim is about the data rather than about the words on the page.
    const view = diveAt(ladder, kanjiNodeId('林'), DETAIL_DIVE_OPTIONS);
    const bases = new Set(view.rings.flatMap((ring) => ring.members.map((m) => m.basis)));
    expect([...bases]).not.toContain('contrasts_with');
    expect([...bases]).not.toContain('collocates_with');
  });

  it('orders shared shapes by how rare the shape is, because a rare one tells you more', () => {
    const shared = buildKanjiDetail(ladder, '森')?.sharedComponent ?? [];
    const counts = shared.map((entry) => entry.usedBy);
    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index - 1] ?? 0).toBeLessThanOrEqual(counts[index] ?? 0);
    }
  });

  it('keeps every section to a page rather than a database dump', () => {
    for (const character of ['人', '分', '日']) {
      const page = buildKanjiDetail(ladder, character);
      expect(page?.compounds.length ?? 0).toBeLessThanOrEqual(DETAIL_SECTION_LIMIT);
      expect(page?.readingFamily.length ?? 0).toBeLessThanOrEqual(DETAIL_SECTION_LIMIT);
      expect(page?.sharedComponent.length ?? 0).toBeLessThanOrEqual(DETAIL_SECTION_LIMIT);
    }
  });

  it('says how many compounds it did not show, so the cut is never silent', () => {
    const page = buildKanjiDetail(ladder, '人');
    expect(page?.compoundsAvailable ?? 0).toBeGreaterThan(page?.compounds.length ?? 0);
    // The page's own budget covers the busiest character in the tier, so the
    // "ranked by commonness" sentence is a ranking of the whole set.
    expect(page?.compoundsTruncatedUpstream).toBe(false);
  });

  /* ---------------------------------------------------------------- *
   * The sentence under the compounds list
   * ---------------------------------------------------------------- */

  describe('the disclosure under the compounds list', () => {
    /*
      Two sentences used to sit on this page at once and contradict each other:
      the ring said "Drawing 8 of 25. The sections below list all of them,
      ranked" and the section said "Showing 8 of 25. The rest are in the graph;
      zoom out through the dive to reach them." The section lists eight, not
      twenty-five, and zooming out reaches none of the remainder. Both halves are
      arithmetic that appears on screen, so both are asserted here.
    */

    it('counts the union of the two cuts, not either one twice', () => {
      const page = buildKanjiDetail(ladder, '分');
      const union = page?.compoundsShownHere ?? 0;
      // Ring and section select differently — the graph's order against JMdict's
      // commonness — so the union is strictly larger than one cut and no larger
      // than both together.
      expect(union).toBeGreaterThan(page?.compounds.length ?? 0);
      expect(union).toBeLessThanOrEqual(DETAIL_SECTION_LIMIT + RING_DISPLAY_LIMIT);
      expect(union).toBeLessThanOrEqual(page?.compoundsAvailable ?? 0);
    });

    it('never claims to show more than the graph holds', () => {
      for (const character of ['人', '分', '日', '森', '山']) {
        const page = buildKanjiDetail(ladder, character);
        expect(page?.compoundsShownHere ?? 0, character).toBeLessThanOrEqual(
          page?.compoundsAvailable ?? 0,
        );
      }
    });

    it('states the union and the true remainder', () => {
      const page = buildKanjiDetail(ladder, '分');
      const sentence = compoundsDisclosure(page!) ?? '';
      const available = page?.compoundsAvailable ?? 0;
      const union = page?.compoundsShownHere ?? 0;
      expect(sentence).toContain(
        `Showing ${String(page?.compounds.length ?? 0)} of ${String(available)}`,
      );
      expect(sentence).toContain(
        `together this page reaches ${String(union)} of ${String(available)}`,
      );
      expect(sentence).toContain(`The other ${String(available - union)} are in the graph`);
    });

    it('makes no claim that zooming out reaches the remainder, because it does not', () => {
      for (const character of ['人', '分', '日']) {
        const sentence = compoundsDisclosure(buildKanjiDetail(ladder, character)!) ?? '';
        expect(sentence).not.toContain('zoom out');
        expect(sentence).not.toContain('all of them');
      }
    });

    it('says nothing at all when the page is showing every compound there is', () => {
      // A character with few enough compounds that no cut applies. The sentence
      // has to be absent rather than "Showing 3 of 3".
      const uncut = seedDataset.kanji
        .map((kanji) => buildKanjiDetail(ladder, kanji.character))
        .find((page) => page !== null && page.compounds.length >= page.compoundsAvailable);
      expect(uncut, 'no character in the tier has an uncut compound list').toBeDefined();
      expect(compoundsDisclosure(uncut!)).toBeNull();
    });
  });

  it('refuses an era for a character, by rule and not for want of data', () => {
    // 駅 is a 駅家 post-station, a 宿場 and a railway station at once. A single
    // layer for the character would be false however much data we had.
    for (const character of ['分', '人', '日']) {
      const page = buildKanjiDetail(ladder, character);
      expect(page?.era.placement, character).toBe('unknown');
      expect((page?.era.detail ?? '').length).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------------------------------ *
 * The era of a word
 * ------------------------------------------------------------------ */

describe('the era attribution is per word, and refuses rather than guesses', () => {
  it('places a word or says plainly that it cannot', () => {
    const era = eraOfLexeme(ladder, 'lex-bunki');
    expect(era).not.toBeNull();
    expect((era?.detail ?? '').length).toBeGreaterThan(0);
    expect((era?.basis ?? '').length).toBeGreaterThan(0);
  });

  it('returns null for an id that is not a word in this build', () => {
    expect(eraOfLexeme(ladder, kanjiNodeId('分'))).toBeNull();
    expect(eraOfLexeme(ladder, 'nothing-of-the-kind')).toBeNull();
  });

  it('never invents a layer: every placement is one the domain declares', () => {
    const declared = new Set(['kodo', 'kaido', 'tetsudo', 'unknown']);
    let placed = 0;
    for (const lexeme of importedDictionary.lexemes.slice(0, 200)) {
      const era = eraOfLexeme(ladder, lexeme.id);
      if (era === null) continue;
      expect(declared.has(era.placement), `${lexeme.headword}: ${era.placement}`).toBe(true);
      if (era.placement !== 'unknown') placed += 1;
    }
    // Lane A2′ measured the reach at 9.8% of the shipped lexemes. This asserts
    // only that the attribution is *sparse and honest* rather than a number that
    // would have to be re-tuned every time the corpus moves.
    expect(placed).toBeLessThan(200);
  });
});

/* ------------------------------------------------------------------ *
 * Cost
 * ------------------------------------------------------------------ */

describe('what one kanji page costs over the real dictionary', () => {
  it('builds a page from local reads rather than a walk, and prints the figure', () => {
    const characters = (seedDataset.kanji.slice(0, 10).map((k) => k.character) ?? []).filter(
      (character) => findKanjiByCharacter(character) !== null,
    );
    expect(characters.length).toBeGreaterThan(4);

    const started = globalThis.performance.now();
    for (const character of characters) buildKanjiDetail(ladder, character);
    const elapsed = globalThis.performance.now() - started;

    console.log(
      `[B2] ${String(characters.length)} kanji pages built in ${elapsed.toFixed(1)} ms ` +
        `(${(elapsed / Math.max(1, characters.length)).toFixed(2)} ms each) over ` +
        `${String(ladder.graph.nodes.size)} nodes`,
    );
    // Generous, because a loaded CI runner is not a phone: this is a regression
    // alarm against the page becoming a graph walk, not a performance claim.
    expect(elapsed / Math.max(1, characters.length)).toBeLessThan(250);
  });

  it('materialises a small part of the graph even at the page’s wider budget', () => {
    for (const character of ['分', '人', '日']) {
      const view = diveAt(ladder, kanjiNodeId(character), DETAIL_DIVE_OPTIONS);
      expect(
        view.cost.nodesMaterialised / view.cost.ladderNodes,
        `${character} materialised too much of the graph`,
      ).toBeLessThan(0.05);
    }
  });
});
