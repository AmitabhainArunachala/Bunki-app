/**
 * The words a scripted learner meets (lane L1).
 *
 * The generator in `@bunki/domain` takes its corpus as an argument and reads no
 * dictionary — the kernel may not import `@bunki/seed` (ADR-001 boundary 1),
 * and should not want to: a generator that invented headwords would put words
 * in the ledger that no surface could resolve, so the map would draw nothing
 * and the demonstration would fail at its own purpose. This module is the other
 * half of that arrangement: it hands the kernel real JMdict entries out of the
 * dictionary this build actually ships.
 *
 * ## Why the order is what it is
 *
 * The order is not decoration; three surfaces depend on it.
 *
 * 1. **The integration passage comes first.** Controller §8 ships exactly one
 *    passage, and `session-loop.ts` will only plan a sitting over a thread whose
 *    entry that passage embeds — a session step that opened a passage the target
 *    is not in would be the screen asserting a relation the seed does not hold.
 *    Eight lexemes qualify. If the scripted learner never met any of them, the
 *    Session tab of a loaded stage would say "nothing promoted yet", which is
 *    the empty case this whole lane exists to stop showing. So they are the
 *    first eight words this learner ever meets, on day one, in every stage.
 * 2. **The rest of the fixture tier next**, because 分岐 and its family are the
 *    entries the closed-loop tests, the canvas and the E2E were written against.
 * 3. **Then the imported tier, commonest first.** JMdict's own priority tags
 *    (`ichi1`, `news1`, `spec1`, `nfxx`) are the only frequency signal this
 *    build has, and using them means a scripted learner meets 人 before they
 *    meet an obscure compound — which is what a person does, and which is what
 *    makes the map's neighbourhoods dense enough to be worth drawing.
 *
 * Ties break on the record id, so the order is total and the corpus is the same
 * list on every run. A corpus that reordered between runs would make a stage
 * non-reproducible even with a fixed seed.
 *
 * ## What this module does not do
 *
 * It reads no learner state, mints nothing, and knows nothing about stages. It
 * is a projection of the dictionary into the shape the generator's argument
 * has, memoised once per session because sorting three thousand records is not
 * work to repeat on a switch.
 */

import type { DemoTarget, RetrievalSkill } from '@bunki/domain';

import { seedDataset, type SeedLexeme } from '../../data/catalog.ts';
import { IMPORTED_LEXEMES, importedExtras } from '../../data/imported-tier.ts';

/**
 * JMdict priority tags, most common first.
 *
 * The list is JMdict's own vocabulary and its order is JMdict's own meaning:
 * `ichi1` marks the first thousand of the Ichimango list, `news1` the first
 * twelve thousand of a newspaper frequency count, `nf01` the first five
 * hundred of that same count in blocks of five hundred. Nothing here invents a
 * frequency number; a record either carries one of these markers or it does
 * not, and a record with none sorts after every record with one.
 */
const PRIORITY_ORDER: readonly string[] = [
  'nf01',
  'ichi1',
  'news1',
  'spec1',
  'nf02',
  'nf03',
  'nf04',
  'nf05',
  'gai1',
];

/** Lower is commoner. `PRIORITY_ORDER.length` means "carries no marker". */
function priorityRank(lexemeId: string): number {
  const tags = importedExtras(lexemeId)?.priorityTags ?? [];
  let best = PRIORITY_ORDER.length;
  for (const tag of tags) {
    const rank = PRIORITY_ORDER.indexOf(tag);
    if (rank !== -1 && rank < best) best = rank;
  }
  return best;
}

/**
 * The lexeme ids the one shipped integration passage embeds.
 *
 * Read from the passage rather than listed, so a change to the seed moves this
 * with it instead of leaving a stale list that silently stops matching.
 */
export function passageLexemeIds(): readonly string[] {
  return seedDataset.passages.flatMap((passage) => [...passage.lexemeIds]);
}

/**
 * The generator's contract-id convention, which is the app's.
 *
 * Reading and meaning use exactly the ids `session-loop.ts` mints for a target
 * it plans a sitting over. That is the whole reason `contractIdFor` is an
 * argument to the generator: with the ids aligned, the first sitting on a
 * loaded stage finds the contracts already established and adds none; with them
 * misaligned, every scripted word would grow a second, duplicate pair the
 * moment the learner opened the Session tab.
 *
 * Listening and production have no app-side convention to match, because
 * nothing in the app mints them yet, so they take names of the same shape.
 */
export function demoContractIdFor(target: DemoTarget, skill: RetrievalSkill): string {
  switch (skill) {
    case 'orthography_to_reading':
      return `contract-reading-${target.key}`;
    case 'form_to_meaning':
      return `contract-meaning-${target.key}`;
    case 'audio_to_meaning':
      return `contract-listening-${target.key}`;
    case 'meaning_to_production':
      return `contract-production-${target.key}`;
    default:
      return `contract-${skill}-${target.key}`;
  }
}

/**
 * One dictionary entry, as the generator's argument.
 *
 * `key` is the lexeme id, so a scripted thread can be re-attached to its word
 * page; `text` is the headword, so the kernel's component id (`"kc:" + the
 * captured text`) matches the map node's, which is the join between the Atlas
 * and the Trace. Get that wrong and every node projects as unknown for want of
 * a matching key rather than for want of evidence.
 */
function asTarget(lexeme: SeedLexeme): DemoTarget {
  return {
    key: lexeme.id,
    text: lexeme.headword,
    reading: lexeme.reading,
    senses: lexeme.senses.length > 0 ? [...lexeme.senses] : [lexeme.headword],
  };
}

let memo: readonly DemoTarget[] | null = null;

/** The corpus, ordered and built at most once per session. */
export function demoCorpus(): readonly DemoTarget[] {
  if (memo !== null) return memo;

  const inPassage = new Set(passageLexemeIds());
  const fixtureById = new Map(seedDataset.lexemes.map((lexeme) => [lexeme.id, lexeme] as const));

  const passageFirst = [...inPassage]
    .map((id) => fixtureById.get(id))
    .filter((lexeme): lexeme is SeedLexeme => lexeme !== undefined);

  const restOfFixture = seedDataset.lexemes.filter((lexeme) => !inPassage.has(lexeme.id));

  const imported = [...IMPORTED_LEXEMES].sort((left, right) => {
    const byPriority = priorityRank(left.id) - priorityRank(right.id);
    if (byPriority !== 0) return byPriority;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  // A headword can appear in both tiers (分岐 is in the fixture tier and could
  // also be an imported record). Two threads capturing one text would make the
  // component ambiguous, and the gate would then refuse every review on it —
  // `thread-link.ts` fails closed on exactly this, and correctly. So the corpus
  // is deduplicated on the text the learner would capture.
  const seen = new Set<string>();
  const targets: DemoTarget[] = [];
  for (const lexeme of [...passageFirst, ...restOfFixture, ...imported]) {
    if (seen.has(lexeme.headword)) continue;
    seen.add(lexeme.headword);
    targets.push(asTarget(lexeme));
  }

  memo = Object.freeze(targets);
  return memo;
}

/** Drop the memo. For tests that need to measure a cold build. */
export function resetDemoCorpus(): void {
  memo = null;
}
