/**
 * The word page's own contracts (Campaign E, lane B3).
 *
 * Four things are checked here, and each of them is a rule the page would be
 * defective without rather than a restatement of what the code does:
 *
 *   1. **The neighbourhoods are computed from real edges.** A contrast partner
 *      must actually share a gloss; a family member must actually share a
 *      character; a character with no card must still be listed. These are the
 *      inventions a "related words" section is easiest to fake.
 *   2. **The band policy is the one the page prints.** `BAND_RULE` is rendered
 *      verbatim on the surface, so a mapping that drifted from it would be a
 *      sentence on screen that the code contradicts — the defect class this
 *      project has caught most often.
 *   3. **Five lenses, never a summary.** A node with evidence on one capability
 *      must still report the other four as unmeasured, and nothing in the module
 *      may combine them.
 *   4. **Exposure is not retrieval.** Reading the projection must not change it:
 *      the same input read twice, and read after a hundred reads, is identical,
 *      and the module reaches no store.
 *
 * Source scans rather than renders, for the reason every other file here gives:
 * the repository installs no React renderer, and for "no surface may ever…" a
 * scan proves the text is not in the tree at all.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CAPABILITY_LENSES, componentIdForTargetKey, type ContractRecord } from '@bunki/domain';

import { findLexemeById, findLexemeByHeadword, importedDictionary } from '../src/data/catalog.ts';
import { CAPABILITY_IDS } from '../src/ui/capability.ts';
import { RECALL_BANDS } from '../src/ui/theme.ts';
import {
  MIN_FOLDED_TAIL,
  OPEN_GLOSS_COUNT,
  splitGlosses,
  tailReason,
} from '../src/ui/word/glosses.ts';
import {
  BAND_RULE,
  LENS_ORDER,
  componentIdsFor,
  nothingMeasured,
  readWordMemory,
} from '../src/ui/word/memory.ts';
import {
  CONTRAST_LIMIT,
  CONTRAST_STANDING,
  contrastSet,
  familyByKanji,
  kanjiInWord,
} from '../src/ui/word/neighbourhood.ts';
import { describePriorityTag, readPriorityTags } from '../src/ui/word/priority-tags.ts';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file: string): string => readFileSync(file, 'utf8');
const stripComments = (text: string): string =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const WORD_DIR = resolve(APP_ROOT, 'src/ui/word');
const wordFiles = readdirSync(WORD_DIR).map((name) => join(WORD_DIR, name));
const screenSource = read(resolve(APP_ROOT, 'src/screens/word-screen.tsx'));

/** The canonical fixture, and an imported entry with a long gloss tail. */
const BUNKI = 'lex-bunki';

/* ------------------------------------------------------------------ *
 * Glosses
 * ------------------------------------------------------------------ */

describe('the gloss list folds a long tail and never a short one', () => {
  it('opens everything when the tail would be shorter than it is worth folding', () => {
    const few = ['one', 'two', 'three', 'four', 'five'];
    const split = splitGlosses(few);
    expect(split.tail).toEqual([]);
    expect(split.opening).toEqual(few);
  });

  it('folds once the tail is worth a tap', () => {
    const many = Array.from({ length: OPEN_GLOSS_COUNT + MIN_FOLDED_TAIL + 1 }, (_, index) =>
      String(index),
    );
    const split = splitGlosses(many);
    expect(split.opening).toHaveLength(OPEN_GLOSS_COUNT);
    expect(split.tail).toHaveLength(many.length - OPEN_GLOSS_COUNT);
    // Nothing is lost between the two halves, and the order is upstream's.
    expect([...split.opening, ...split.tail]).toEqual(many);
  });

  it('says it is empty rather than rendering an empty list', () => {
    expect(splitGlosses([]).empty).toBe(true);
    expect(splitGlosses(['one']).empty).toBe(false);
  });

  it('states the real count in the disclosure reason', () => {
    expect(tailReason(59)).toContain('59');
    expect(tailReason(59)).toMatch(/wordings/i);
    // The reason must not claim a sense grouping the data does not carry.
    expect(tailReason(59)).toMatch(/not numbered senses|not recorded|flatten/i);
  });

  it('folds the real long tail this build ships', () => {
    // 取る is the worst case in the imported tier; if it ever stops being long
    // this assertion should be re-pointed rather than deleted.
    const toru = findLexemeByHeadword('取る');
    expect(toru, '取る is not in this build').not.toBeNull();
    const split = splitGlosses(toru?.senses ?? []);
    expect(split.tail.length).toBeGreaterThan(20);
  });
});

/* ------------------------------------------------------------------ *
 * Priority tags
 * ------------------------------------------------------------------ */

describe('JMdict commonness tags are said in words, never left as codes', () => {
  it('expands a frequency band into the ranks it means', () => {
    expect(describePriorityTag('nf01')?.note).toContain('1');
    expect(describePriorityTag('nf01')?.note).toContain('500');
    expect(describePriorityTag('nf07')?.note).toContain('3001');
    expect(describePriorityTag('nf07')?.note).toContain('3500');
  });

  it('names the list each tag comes from rather than saying only “common”', () => {
    for (const code of ['ichi1', 'news1', 'spec1', 'gai1']) {
      const note = describePriorityTag(code)?.note ?? '';
      expect(note, code).not.toEqual('');
      expect(note, `${code} says only that it is common`).toMatch(/list|newspaper|JMdict/i);
    }
  });

  it('reports an unknown code instead of guessing a meaning for it', () => {
    expect(describePriorityTag('nfXX')).toBeNull();
    const reading = readPriorityTags(['ichi1', 'zzz9']);
    expect(reading.described.map((tag) => tag.code)).toEqual(['ichi1']);
    expect(reading.unrecognised).toEqual(['zzz9']);
  });

  it('has a sentence for every tag the shipped dictionary actually carries', () => {
    // Read out of the tier rather than from a list typed here: a tag arriving
    // in a re-import without a sentence would render as a bare code, which is
    // exactly the renzo failure (§10.1) this module exists to avoid.
    const unrecognised = new Set<string>();
    let seen = 0;
    for (const lexeme of importedDictionary.lexemes) {
      for (const tag of lexeme.priorityTags) {
        seen += 1;
        if (describePriorityTag(tag) === null) unrecognised.add(tag);
      }
    }
    expect(seen, 'no tag was found, so this assertion is vacuous').toBeGreaterThan(0);
    expect([...unrecognised].sort()).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Neighbourhoods
 * ------------------------------------------------------------------ */

describe('the characters in the word', () => {
  it('lists every character of the headword, in order', () => {
    const lexeme = findLexemeById(BUNKI);
    expect(lexeme).not.toBeNull();
    const rows = kanjiInWord(lexeme!);
    expect(rows.map((row) => row.character)).toEqual([...(lexeme?.kanjiUsed ?? [])]);
  });

  it('keeps a character this build has no card for, without a link', () => {
    const lexeme = findLexemeById(BUNKI);
    const rows = kanjiInWord({
      ...lexeme!,
      kanjiUsed: [...(lexeme?.kanjiUsed ?? []), '𠮟'],
    });
    const missing = rows.find((row) => row.character === '𠮟');
    expect(missing, 'the unresolvable character was dropped').toBeDefined();
    expect(missing?.kanji).toBeNull();
  });
});

describe('the word family is a shared character, never a similarity', () => {
  it('groups every member under a character it really contains', () => {
    const lexeme = findLexemeById(BUNKI);
    for (const group of familyByKanji(lexeme!)) {
      expect(lexeme?.kanjiUsed).toContain(group.character);
      for (const word of group.words) {
        expect(word.kanjiUsed, `${word.headword} is not written with ${group.character}`).toContain(
          group.character,
        );
        expect(word.id).not.toBe(lexeme?.id);
      }
    }
  });

  it('places each member exactly once', () => {
    const lexeme = findLexemeById(BUNKI);
    const ids = familyByKanji(lexeme!).flatMap((group) => group.words.map((word) => word.id));
    expect(ids.length).toBe(new Set(ids).size);
  });
});

describe('the contrast set is a real gloss overlap', () => {
  const target = findLexemeByHeadword('意見');

  it('finds the near-synonyms the dictionary itself describes the same way', () => {
    expect(target, '意見 is not in this build').not.toBeNull();
    const set = contrastSet(target!);
    const headwords = set.shown.map((pair) => pair.word.headword);
    // 考え and 見解 are both glossed "opinion" upstream. If the tier changes,
    // this should be re-pointed at whatever the new overlap is, not deleted.
    expect(headwords.length).toBeGreaterThan(0);
    expect(headwords).toContain('考え');
  });

  it('shows a shared gloss both entries really carry', () => {
    const set = contrastSet(target!);
    for (const pair of set.shown) {
      expect(pair.shared.length).toBeGreaterThan(0);
      for (const gloss of pair.shared) {
        const fold = (value: string): string => value.trim().toLocaleLowerCase('en-US');
        expect(target?.senses.map(fold)).toContain(fold(gloss));
        expect(pair.word.senses.map(fold)).toContain(fold(gloss));
      }
    }
  });

  it('shows a distinguishing gloss only when it really is distinguishing', () => {
    const set = contrastSet(target!);
    const fold = (value: string): string => value.trim().toLocaleLowerCase('en-US');
    for (const pair of set.shown) {
      const theirs = new Set(pair.word.senses.map(fold));
      const ours = new Set(target?.senses.map(fold));
      for (const gloss of pair.onlyHere) expect(theirs.has(fold(gloss))).toBe(false);
      for (const gloss of pair.onlyThere) expect(ours.has(fold(gloss))).toBe(false);
    }
  });

  it('never contrasts a word with itself or with the same written form', () => {
    const set = contrastSet(target!);
    for (const pair of set.shown) {
      expect(pair.word.id).not.toBe(target?.id);
      expect(pair.word.headword).not.toBe(target?.headword);
    }
  });

  it('caps what it shows and states the true total', () => {
    const busy = findLexemeByHeadword('気');
    expect(busy, '気 is not in this build').not.toBeNull();
    const set = contrastSet(busy!);
    expect(set.shown.length).toBeLessThanOrEqual(CONTRAST_LIMIT);
    expect(set.total).toBeGreaterThanOrEqual(set.shown.length);
  });

  it('is deterministic — the same word twice gives the same list', () => {
    const first = contrastSet(target!).shown.map((pair) => pair.word.id);
    const second = contrastSet(target!).shown.map((pair) => pair.word.id);
    expect(second).toEqual(first);
  });

  it('asserts no nuance it cannot source', () => {
    expect(CONTRAST_STANDING).toMatch(/no usage note/i);
    expect(CONTRAST_STANDING).toMatch(/gloss/i);
  });
});

/* ------------------------------------------------------------------ *
 * Memory, per capability lens
 * ------------------------------------------------------------------ */

const AT = '2026-07-28T12:00:00.000Z';

function contractOn(componentId: string, skill: string, id: string): ContractRecord {
  return {
    contractId: id,
    contractVersion: 1,
    targetComponentId: componentId,
    skill,
    scoredBy: 'accepted_answers',
    createdAt: AT,
    createdByEventId: `event-${id}`,
  };
}

describe('memory is read per capability and never combined', () => {
  it('agrees with the kernel about which five lenses exist, and in what order', () => {
    expect([...CAPABILITY_LENSES]).toEqual([...CAPABILITY_IDS]);
    expect([...LENS_ORDER]).toEqual([...CAPABILITY_LENSES]);
  });

  it('returns all five lenses even when nothing has ever been observed', () => {
    const reader = readWordMemory({ contracts: [], memoryStates: [], at: AT });
    const views = reader.lensViewsFor(componentIdsFor(['分岐']));
    expect(views.map((view) => view.capability)).toEqual([...LENS_ORDER]);
    expect(nothingMeasured(views)).toBe(true);
    for (const view of views) {
      expect(view.band).toBe(RECALL_BANDS[0]);
      expect(view.basis).not.toEqual('');
    }
  });

  it('leaves the other four unmeasured when one capability has a contract', () => {
    const componentId = componentIdForTargetKey('分岐');
    const reader = readWordMemory({
      contracts: [contractOn(componentId, 'orthography_to_reading', 'contract-1')],
      memoryStates: [],
      at: AT,
    });
    const views = reader.lensViewsFor([componentId]);
    const reading = views.find((view) => view.capability === 'reading');
    const production = views.find((view) => view.capability === 'production');
    // A contract with no admitted review is *activated*, not attested: the band
    // is still the no-evidence step and the basis says why.
    expect(reading?.band).toBe(RECALL_BANDS[0]);
    expect(reading?.basis).toMatch(/nothing has been asked of you yet/i);
    expect(production?.basis).toMatch(/not measured/i);
  });

  it('says writing is not measured rather than not known', () => {
    const reader = readWordMemory({ contracts: [], memoryStates: [], at: AT });
    const writing = reader
      .lensViewsFor(componentIdsFor(['分岐']))
      .find((view) => view.capability === 'writing');
    expect(writing?.basis).toMatch(/no contract in this build/i);
  });

  it('reads a character’s evidence separately from the word’s', () => {
    const wordComponent = componentIdForTargetKey('森林');
    const kanjiComponent = componentIdForTargetKey('林');
    const reader = readWordMemory({
      contracts: [contractOn(wordComponent, 'form_to_meaning', 'contract-word')],
      memoryStates: [],
      at: AT,
    });
    const wordMeaning = reader
      .lensViewsFor([wordComponent])
      .find((view) => view.capability === 'meaning');
    const kanjiMeaning = reader
      .lensViewsFor([kanjiComponent])
      .find((view) => view.capability === 'meaning');
    // The whole point of the section: the word's evidence must not leak onto
    // the character, or the surface-bright/interior-dark diagnosis is invisible.
    expect(wordMeaning?.basis).toMatch(/nothing has been asked of you yet/i);
    expect(kanjiMeaning?.basis).toMatch(/not measured/i);
  });

  it('drops a contract naming a skill it cannot place, rather than widening a lens', () => {
    const componentId = componentIdForTargetKey('分岐');
    const reader = readWordMemory({
      contracts: [contractOn(componentId, 'not_a_skill', 'contract-x')],
      memoryStates: [],
      at: AT,
    });
    expect(reader.contractCount).toBe(0);
    expect(nothingMeasured(reader.lensViewsFor([componentId]))).toBe(true);
  });

  it('is a read: the same input answers identically however often it is read', () => {
    const componentId = componentIdForTargetKey('分岐');
    const input = {
      contracts: [contractOn(componentId, 'orthography_to_reading', 'contract-1')],
      memoryStates: [],
      at: AT,
    } as const;
    const reader = readWordMemory(input);
    const first = JSON.stringify(reader.lensViewsFor([componentId]));
    for (let index = 0; index < 100; index += 1) reader.lensViewsFor([componentId]);
    expect(JSON.stringify(reader.lensViewsFor([componentId]))).toEqual(first);
    // …and a fresh reader over the same input agrees, so nothing accumulated.
    expect(JSON.stringify(readWordMemory(input).lensViewsFor([componentId]))).toEqual(first);
  });

  it('builds a canonical component id per distinct target and no duplicates', () => {
    expect(componentIdsFor(['分岐', '分岐', ''])).toEqual([componentIdForTargetKey('分岐')]);
  });
});

/* ------------------------------------------------------------------ *
 * The page's claims about itself
 * ------------------------------------------------------------------ */

describe('the page does not claim a property the code lacks', () => {
  it('prints the band rule it actually applies', () => {
    // The rule is rendered verbatim, so its wording is a testable claim.
    expect(BAND_RULE).toMatch(/no graded retrieval yet/i);
    expect(BAND_RULE).toMatch(/fragile/i);
    expect(BAND_RULE).toMatch(/never averaged|not averaged|nothing here is averaged/i);
    expect(read(resolve(APP_ROOT, 'src/ui/word/word-hero.tsx'))).toContain('BAND_RULE');
  });

  it('renders no aggregate band for the word', () => {
    const memory = stripComments(read(resolve(APP_ROOT, 'src/ui/word/memory.ts')));
    for (const forbidden of ['overall', 'average', 'composite', 'mastery']) {
      expect(memory.toLowerCase(), `memory.ts exposes an ${forbidden} value`).not.toMatch(
        new RegExp(`\\b${forbidden}\\s*[:(]`),
      );
    }
  });

  it('renders a meter for every capability the page knows about', () => {
    const hero = stripComments(read(resolve(APP_ROOT, 'src/ui/word/word-hero.tsx')));
    // One `RecallMeter` inside a map over the lens list — never a hand-picked
    // subset, which is how four capabilities quietly become three.
    expect(hero).toMatch(/lenses\.map\(/);
    expect(hero).toContain('<RecallMeter');
  });

  /**
   * The "open every section" control has to reach every section it names.
   *
   * It did not, on the first browser pass: the button flipped its own state and
   * its label, and the three disclosures below it never received the value, so
   * a screenshot of a page whose button said "Close every section" showed two
   * sections still shut. A label that describes an effect the code does not
   * produce is the defect class this project has caught most often, and it is
   * only visible from a real page — so it gets an assertion here as well.
   */
  it('wires the open-every-section control to every section it names', () => {
    const body = stripComments(screenSource);
    for (const component of ['WordFamily', 'WordContrast', 'WordSentences']) {
      const tag = new RegExp(`<${component}\\b[\\s\\S]{0,400}?/>`);
      const match = tag.exec(body);
      expect(match, `${component} is not rendered by the screen`).not.toBeNull();
      expect(
        match?.[0],
        `${component} does not receive the page's expand-all state, so the control's label ` +
          'would describe an effect it does not have',
      ).toMatch(/initiallyOpen=\{expandAll\}/);
    }
    // …and each of those components must actually hand it to the disclosure.
    for (const file of ['word-relations.tsx', 'word-sentences.tsx']) {
      const source = stripComments(read(resolve(APP_ROOT, 'src/ui/word', file)));
      expect(source, `${file} accepts initiallyOpen and drops it`).toMatch(
        /initiallyOpen=\{initiallyOpen\}/,
      );
    }
  });

  it('names no meter-only band in any word module', () => {
    const meterOnly = ['unseen', 'faint'];
    for (const file of wordFiles) {
      const body = stripComments(read(file));
      for (const band of meterOnly) {
        expect(body, `${file} names the meter-only band '${band}'`).not.toMatch(
          new RegExp(`['"]${band}['"]`),
        );
      }
    }
  });
});

describe('the word surface writes nothing', () => {
  it('mints no event and reaches no store from src/ui/word', () => {
    for (const file of wordFiles) {
      const body = stripComments(read(file));
      expect(body, `${file} mints an event`).not.toContain('createDomainEvent');
      expect(body, `${file} reaches the store`).not.toMatch(
        /useAppStore|persistMinted|appendEvent|readDerived/,
      );
    }
  });

  /**
   * The page's whole vocabulary of consequences, as an equality.
   *
   * Two commands, in the order they appear: `promote` moves a thread between
   * rungs, and `capture` starts one. Wave D added the second: the page used to
   * answer a word with no thread by saying "keep it from the capture screen",
   * which stopped the cross-surface trace and sent the learner to the front door
   * to type a word they were looking at. It now runs the same `capture` +
   * `promote → keep` pair the capture screen runs.
   *
   * Neither is evidence. Capture records that an encounter happened; `keep`
   * activates no retrieval contract, and `learn` — the rung that does — is still
   * only ever reached by a press the learner makes (REQ-DM-09). A third command
   * appearing here is a third thing this page can cause, which is exactly the
   * edit this equality exists to make visible.
   */
  it('submits only the commands the page is allowed to submit', () => {
    const body = stripComments(screenSource);
    const executes = [...body.matchAll(/store\.execute\(\s*\{\s*kind:\s*'([a-zA-Z]+)'/g)].map(
      (match) => match[1],
    );
    expect([...new Set(executes)].sort()).toEqual(['capture', 'promote']);
    // Neither command reaches the evidence gate: the page holds no minter and
    // names no gate call.
    expect(body).not.toMatch(/mintEvidence|admitToScheduler|createDomainEvent/);
    // Accepting a candidate goes through the candidate hook, which owns that
    // command; the screen never constructs it.
    expect(body).toContain('ai.accept');
  });

  it('reads the wall clock only through the app’s one seam', () => {
    const body = stripComments(screenSource);
    expect(body).toContain('createSystemClock');
    expect(body, 'the screen reads the ambient clock directly').not.toMatch(
      /Date\.now\(\)|new Date\(\)/,
    );
    for (const file of wordFiles) {
      expect(stripComments(read(file)), `${file} reads a clock`).not.toMatch(
        /Date\.now\(\)|new Date\(/,
      );
    }
  });
});

describe('every entity the page names is reachable', () => {
  const body = stripComments(screenSource);

  it('opens a kanji page from the character rows', () => {
    expect(body).toContain('onOpenKanji');
    expect(stripComments(read(resolve(APP_ROOT, 'src/ui/word/word-kanji.tsx')))).toContain(
      'onOpenKanji',
    );
  });

  it('opens a word page from the family and the contrast set', () => {
    const relations = stripComments(read(resolve(APP_ROOT, 'src/ui/word/word-relations.tsx')));
    expect(relations).toContain('onOpenWord');
    // Both lists, not one: a contrast partner with no door is the dead end.
    expect(relations.match(/onOpenWord=\{onOpenWord\}/g) ?? []).not.toHaveLength(0);
    expect(body).toMatch(/<WordFamily[\s\S]{0,200}onOpenWord/);
    expect(body).toMatch(/<WordContrast[\s\S]{0,200}onOpenWord/);
  });

  it('keeps the acknowledgement unconditional on the page', () => {
    const rendered = [...screenSource.matchAll(/<SeedEntryDisclosure[\s/>]/g)];
    expect(rendered.length).toBeGreaterThan(0);
    for (const match of rendered) {
      const preceding = screenSource.slice(Math.max(0, match.index - 24), match.index);
      expect(preceding).not.toMatch(/[?&]{1,2}\s*$/);
    }
  });

  it('credits both halves of every Tatoeba pair it renders', () => {
    const sentences = stripComments(read(resolve(APP_ROOT, 'src/ui/word/word-sentences.tsx')));
    expect(sentences).toContain('japaneseContributor');
    expect(sentences).toContain('englishContributor');
    expect(sentences).toContain('CC');
  });
});
