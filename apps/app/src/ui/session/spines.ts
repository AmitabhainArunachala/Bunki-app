/**
 * Spines — the SRS's organisation, derived from the ledger rather than stored.
 *
 * ## What the operator asked for, and what this is
 *
 * Frozen §10.2, from the operator's own Anki archaeology:
 *
 * > Personal-domain decks (Ashtanga special, NIHON DHARMA) validate personal
 * > domains as first-class spines/tags.
 *
 * and the meta-finding above it: each methodology reboot orphaned the previous
 * deck's scheduling history, so the principle is **one Trace, many views** —
 * "methods/drill styles are filters over one permanent memory state; a
 * methodology change must never lose memory history again."
 *
 * That principle is the reason a spine here is a **view**, not a container. A
 * word belongs to every spine it qualifies for, moving between them changes no
 * schedule, and deleting one would delete nothing. There is exactly one memory
 * state per contract and a spine cannot own, copy or fork it.
 *
 * ## What is honestly derivable today, and what is not
 *
 * Two of the three groupings below come out of the durable event log, so they
 * survive a reload, appear in an export, and replay:
 *
 *   - **where you kept it** — `EncounterCaptured.sourceRef.locator`, which the
 *     app writes at capture and which names the surface the learner was on;
 *   - **what it is written with** — the kanji of the seed entry the thread
 *     resolved to, which is a dictionary fact, not a learner one.
 *
 * The third — **a personal-domain deck the learner names**, "Ashtanga", "NIHON
 * DHARMA" — is **not built**, and that is not an oversight to be papered over
 * with an app-local list. The frozen v1 event catalog (ADR-002) has no family
 * that can carry a learner-authored label on a thread: `EncounterCaptured` has
 * `text`, `span`, `sourceRef`, `provenance` and `uncertaintyMark`, and nothing
 * else. Encoding a deck name into `sourceRef.locator` would durably record a
 * false statement about *where an encounter came from*, and a React-state list
 * would vanish on reload and never reach the export — which is exactly the
 * "vocabulary graveyard" failure §10.1 diagnoses in renzo.
 *
 * So {@link NAMED_DECKS_NOT_AVAILABLE} says so on screen, names the schema
 * change it needs, and the two real groupings ship. A surface that offered a
 * deck-shaped control over storage that cannot hold it would be worse than one
 * that says what it has.
 */

import type { DomainEvent, EncounterCapturedEvent } from '@bunki/domain';

import type { StudyTarget } from '../../screens/session-loop.ts';

/** How a spine was derived. Rendered, so a learner can check the grouping. */
export type SpineKind = 'source' | 'kanji';

export interface StudySpine {
  readonly id: string;
  readonly kind: SpineKind;
  readonly label: string;
  /** One sentence naming the field this grouping was read off. */
  readonly derivation: string;
  readonly targets: readonly StudyTarget[];
}

export const SPINE_DERIVATION_NOTE =
  'These are views over one memory state, not decks that own anything. A word can appear in several, moving between them changes nothing about when a word comes back, and every one of them is derived from the event log rather than stored — so none of them can be lost, and none of them can be edited into disagreeing with the ledger.';

export const NAMED_DECKS_NOT_AVAILABLE =
  'Decks you name yourself — the personal domains the frozen spec asks for — are not in this build. The v1 event catalog has no field that can carry a learner-authored label on a thread, and the two places one could be hidden are both worse than the gap: writing it into the capture’s source record would durably misstate where the encounter came from, and keeping it in screen state would lose it on reload and leave it out of every export. It needs an ADR-002 amendment, not a screen.';

/** The `sourceRef.locator` of the capture that started a thread, if any. */
function locatorFor(log: readonly DomainEvent[], threadId: string): string | null {
  const capture = log.find(
    (event): event is EncounterCapturedEvent =>
      event.type === 'EncounterCaptured' && event.threadId === threadId,
  );
  return capture?.sourceRef.locator ?? null;
}

/**
 * A locator as a person would read it.
 *
 * The locators the app writes are screen names (`capture-screen`, `word-screen`,
 * `reading-screen`). An unrecognised one is shown verbatim rather than mapped to
 * something friendlier — a guess here would put a place the learner never was on
 * a grouping of their own words.
 */
const LOCATOR_LABELS: Readonly<Record<string, string>> = {
  'capture-screen': 'kept while searching',
  'word-screen': 'kept from a word page',
  'kanji-screen': 'kept from a kanji page',
  'reading-screen': 'kept while reading',
};

export function spineLabelForLocator(locator: string): string {
  return LOCATOR_LABELS[locator] ?? `kept from ${locator}`;
}

/**
 * Group the promoted words into spines.
 *
 * Deterministic: spines are ordered by size then by label, and members keep the
 * order they were given. Two runs over the same log produce the same list, which
 * is what lets a screenshot of this be reproducible.
 *
 * `minMembers` exists because a "spine" of one is not a grouping, it is the word
 * itself with extra chrome — and a page of forty one-member spines would be the
 * "database rendered as table views" failure §10.1 names.
 */
export function spinesFrom(
  studyTargets: readonly StudyTarget[],
  log: readonly DomainEvent[],
  options: { readonly minMembers?: number } = {},
): readonly StudySpine[] {
  const minMembers = options.minMembers ?? 2;
  const spines: StudySpine[] = [];

  const bySource = new Map<string, StudyTarget[]>();
  for (const target of studyTargets) {
    const locator = locatorFor(log, target.threadId);
    if (locator === null) continue;
    const bucket = bySource.get(locator);
    if (bucket === undefined) bySource.set(locator, [target]);
    else bucket.push(target);
  }
  for (const [locator, targets] of bySource) {
    if (targets.length < minMembers) continue;
    spines.push({
      id: `source:${locator}`,
      kind: 'source',
      label: spineLabelForLocator(locator),
      derivation: `Read off the sourceRef.locator of each thread’s EncounterCaptured event: “${locator}”.`,
      targets,
    });
  }

  const byKanji = new Map<string, StudyTarget[]>();
  for (const target of studyTargets) {
    for (const character of new Set(target.lexeme.kanjiUsed)) {
      const bucket = byKanji.get(character);
      if (bucket === undefined) byKanji.set(character, [target]);
      else bucket.push(target);
    }
  }
  for (const [character, targets] of byKanji) {
    if (targets.length < minMembers) continue;
    spines.push({
      id: `kanji:${character}`,
      kind: 'kanji',
      label: `written with ${character}`,
      derivation: `Every word you have taken up that is written with ${character}, from the seed entry each thread resolved to.`,
      targets,
    });
  }

  return spines.sort((left, right) => {
    const bySize = right.targets.length - left.targets.length;
    return bySize !== 0 ? bySize : left.label.localeCompare(right.label, 'en');
  });
}
