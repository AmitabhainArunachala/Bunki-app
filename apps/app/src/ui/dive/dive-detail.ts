/**
 * What a kanji page is, once the dive has stopped at L2 (lane B2).
 *
 * The operator's decision is that the dive **replaces** the flat kanji page
 * rather than sitting beside it — a kanji page is the dive stopped at the
 * character level. So everything the frozen §5 contract asks a kanji page to
 * carry has to be here, derived from the same graph the dive flies through, and
 * with the same rule: **nothing is inferred.**
 *
 * ## What each section is, and what it is allowed to claim
 *
 * - **Readings by type.** KANJIDIC2's own on- and kun-lists, rendered as the
 *   file writes them (the okurigana dot included). Which reading a given
 *   compound uses is *not* recorded per morpheme anywhere in the shipped data,
 *   so it is not asserted.
 * - **Components with their roles.** The role is `unclassified` for every one of
 *   them, because KanjiVG annotates a shape and not a role — see
 *   `scale-source.ts`. The page says so rather than letting an absence read as
 *   "no role".
 * - **Reading families.** Two characters are a family because they reach the
 *   same reading node, and the family carries *which* reading. That is a walk
 *   through the graph, not a scan, and the reading is the citation.
 * - **Characters that share a component.** Deliberately **not** called a
 *   contrast set: nothing in JMdict or KANJIDIC2 says two characters are
 *   confusable, and a shared shape is not a claim about confusability. Ordered
 *   by how *rare* the shared component is, because a component two characters
 *   share is informative and one that 287 characters share is not — and that
 *   rarity is a count over this build, stated as a count.
 * - **Compounds.** Ranked by JMdict's own priority tags, which is the ranking
 *   that selected the shipped 3,000 in the first place. Where the ring was cut
 *   by a budget the page says the ordering is over what was kept.
 * - **One note that is the character explaining itself.** See
 *   {@link buildSelfNote}. It is a *frame* around two sourced facts, never an
 *   etymology and never an encyclopedia paragraph.
 *
 * ## Cost
 *
 * Everything here is derived from one dive plus one bounded neighbourhood query
 * plus one dive per component. All three are local reads over pre-sorted
 * adjacency; none of them walks the graph. The numbers are in
 * `test/dive-detail.test.ts` and in `docs/build-evidence/PERF_DIVE.md`.
 */

import {
  attributeNodeEra,
  diveAt,
  groupOf,
  neighbourhoodOf,
  type CharacterReadings,
  type EraAttribution,
  type ScaleLadder,
  type ScaleNodeId,
} from '@bunki/domain';

import {
  findKanjiByCharacter,
  findLexemeById,
  importedExtras,
  type SeedKanji,
  type SeedLexeme,
} from '../../data/catalog.ts';
import { kanjiNodeId } from './scale-source.ts';

/* ------------------------------------------------------------------ *
 * Ranking compounds, by the dictionary's own signal
 * ------------------------------------------------------------------ */

const NF_BAND = /^nf(\d+)$/;

/**
 * JMdict's own commonness, as a sortable number. Lower is commoner.
 *
 * `nfXX` is JMdict's frequency band over a newspaper corpus — `nf01` is the
 * first 500 words, `nf02` the next 500, and so on — and it is the field the
 * importer ranked by when it chose which 3,000 entries to ship. Using it here is
 * therefore not a new judgement, it is the same one, applied again where the
 * learner can see its effect.
 *
 * A word with no band sorts last rather than first: the fixture tier carries no
 * priority tags at all, and treating "no tag" as "most common" would put the
 * sixteen hand-written entries above 子供.
 */
export function jmdictPriorityRank(tags: readonly string[]): number {
  for (const tag of tags) {
    const match = NF_BAND.exec(tag);
    if (match !== null) {
      const band = Number.parseInt(match[1] ?? '', 10);
      if (Number.isInteger(band)) return band;
    }
  }
  // `ichi1`/`news1`/`spec1` without an `nf` band still marks a common word.
  return tags.some((tag) => tag.endsWith('1')) ? 90 : 99;
}

export interface CompoundEntry {
  readonly nodeId: ScaleNodeId;
  readonly lexeme: SeedLexeme;
  readonly rank: number;
}

/* ------------------------------------------------------------------ *
 * Components
 * ------------------------------------------------------------------ */

export interface ComponentEntry {
  readonly nodeId: ScaleNodeId;
  readonly element: string;
  /** Always `unclassified` from this source. Rendered, not hidden. */
  readonly role: string;
  /** How many characters in this build use this shape. A count, not a claim. */
  readonly usedBy: number;
}

export const COMPONENT_ROLE_NOTE =
  'KanjiVG annotates which shape a component is, never whether it carries sound or meaning, so every role here is “unclassified”. A radical is often the meaning-bearing part and not always, and guessing which would be an invented etymology.';

/* ------------------------------------------------------------------ *
 * Neighbours
 * ------------------------------------------------------------------ */

export interface FamilyEntry {
  readonly nodeId: ScaleNodeId;
  readonly character: string;
  /** The reading both characters reach. The relation's citation. */
  readonly via: string;
}

export interface SharedComponentEntry {
  readonly nodeId: ScaleNodeId;
  readonly character: string;
  /** The shape they share. */
  readonly element: string;
  /** How many characters in this build use that shape. Lower is more telling. */
  readonly usedBy: number;
}

export const SHARED_COMPONENT_NOTE =
  'These characters are written with a shape this one also uses. Nothing in the shipped files says two characters are confusable, so this is a shared shape and not a contrast set. The count beside each is how many characters in this build use that shape — a shape two characters share tells you more than one that a hundred share.';

/* ------------------------------------------------------------------ *
 * The one note
 * ------------------------------------------------------------------ */

export interface SelfNote {
  /** The character's own recorded sense — KANJIDIC2. */
  readonly sense: string;
  /** Its own words, from the shipped dictionary, commonest first — JMdict. */
  readonly words: readonly string[];
  /** The whole line, as it is read. */
  readonly line: string;
}

export const SELF_NOTE_STANDING =
  'The sense is KANJIDIC2’s and the words are JMdict’s; the sentence around them is this project’s. It shows the character’s recorded sense recurring in its own words. It is not an etymology and makes no claim about how the character came to mean that.';

/**
 * The character in its own words.
 *
 * 奥 is the model the design document gives: *interior, depth* — and the same
 * sense turns up in 奥さん, 奥深い, 奥義. What makes that a good note is that it
 * is not a story about the character, it is the character's own meaning shown
 * recurring across its own vocabulary. Which is exactly what the shipped data
 * can support: the sense is KANJIDIC2's first meaning and the words are JMdict
 * entries that contain the character, ranked by JMdict's own commonness.
 *
 * What it deliberately does **not** do is assert the connection. The design
 * document's reading of 奥さん — "the person of the inner rooms" — is a real
 * historical claim with real sources, and none of those sources is in this
 * build. So the note shows the recurrence and lets it speak; a curated corpus
 * of sourced cultural notes is a different lane's work and is recorded as not
 * done.
 *
 * Returns `null` rather than a thin note: with fewer than two words there is no
 * recurrence to show, and one word beside a gloss is a definition, not a note.
 */
export function buildSelfNote(
  character: string,
  sense: string | undefined,
  words: readonly string[],
): SelfNote | null {
  if (sense === undefined || sense.trim() === '') return null;
  const distinct = [...new Set(words)].filter((word) => word !== character).slice(0, 3);
  if (distinct.length < 2) return null;
  return {
    sense,
    words: distinct,
    line: `${character} — “${sense}”. The same character in ${distinct.join('、')}.`,
  };
}

/* ------------------------------------------------------------------ *
 * The whole page model
 * ------------------------------------------------------------------ */

export interface KanjiDetail {
  readonly kanji: SeedKanji;
  readonly nodeId: ScaleNodeId;
  readonly components: readonly ComponentEntry[];
  readonly compounds: readonly CompoundEntry[];
  /** How many compounds the dive could see, before this page's own cut. */
  readonly compoundsAvailable: number;
  /** True when the dive's own budget cut the ring before this page ranked it. */
  readonly compoundsTruncatedUpstream: boolean;
  readonly readingFamily: readonly FamilyEntry[];
  readonly sharedComponent: readonly SharedComponentEntry[];
  readonly note: SelfNote | null;
  /** The era attribution for the character, which is always `unknown` by rule. */
  readonly era: EraAttribution;
}

/** How many neighbours a section shows before it stops being a page. */
export const DETAIL_SECTION_LIMIT = 8;

/**
 * Budgets for the detail dive.
 *
 * `perLevel: 60` is chosen against the real tier rather than picked: the busiest
 * character in the shipped 3,000 lexemes is 人 with 50 words, and the busiest
 * has 12 components, so 60 lets a character's own rings be *complete* — which is
 * what makes ranking them by commonness an honest claim rather than a ranking of
 * an arbitrary subset. It is still a hard constant, so a component hub reached
 * from the same call is still bounded.
 */
export const DETAIL_DIVE_OPTIONS = Object.freeze({ perLevel: 60, previewMembers: 6 });

/** The reading family and shared-component queries' shared ceiling. */
export const NEIGHBOUR_OPTIONS = Object.freeze({ depth: 2, maxNodes: 200, perGroup: 40 });

export function buildKanjiDetail(ladder: ScaleLadder, character: string): KanjiDetail | null {
  const kanji = findKanjiByCharacter(character);
  if (kanji === null) return null;
  const nodeId = kanjiNodeId(character);

  const view = diveAt(ladder, nodeId, DETAIL_DIVE_OPTIONS);

  /* ---------------------------------------------------------- components */

  const componentRing = view.rings.find(
    (ring) => ring.bucket === 'inward' && ring.level === 'component',
  );
  /*
    `perLevel: 0` is how "count without materialising" is said: a ring with no
    members still reports `available`, which is exactly the number wanted — how
    many characters in this build use this shape. Nothing is built to count it.
  */
  const components: ComponentEntry[] = (componentRing?.members ?? []).map((member) => {
    const outward = diveAt(ladder, member.node.id, { perLevel: 0, previewMembers: 0 }).rings.find(
      (ring) => ring.bucket === 'outward' && ring.level === 'kanji',
    );
    return {
      nodeId: member.node.id,
      element: member.node.label,
      role: member.role ?? 'unclassified',
      usedBy: outward?.available ?? 0,
    };
  });

  /* ---------------------------------------------------------- compounds */

  const wordRing = view.rings.find((ring) => ring.bucket === 'outward' && ring.level === 'word');
  const compounds: CompoundEntry[] = (wordRing?.members ?? [])
    .map((member) => {
      const lexeme = findLexemeById(member.node.id);
      if (lexeme === null) return null;
      return {
        nodeId: member.node.id,
        lexeme,
        rank: jmdictPriorityRank(importedExtras(lexeme.id)?.priorityTags ?? []),
      };
    })
    .filter((entry): entry is CompoundEntry => entry !== null)
    .sort((left, right) =>
      left.rank !== right.rank
        ? left.rank - right.rank
        : left.lexeme.headword.localeCompare(right.lexeme.headword, 'ja'),
    );

  /* ------------------------------------------------ reading family */

  const neighbourhood = neighbourhoodOf(ladder.graph, nodeId, {
    ...NEIGHBOUR_OPTIONS,
    edgeKinds: ['has_reading'],
  });
  const readingFamily: FamilyEntry[] = groupOf(neighbourhood, 'readingFamily')
    .filter((member) => member.node.kind === 'kanji')
    .map((member) => ({
      nodeId: member.node.id,
      character: member.node.label,
      via: ladder.graph.nodes.get(member.via ?? '')?.label ?? '',
    }))
    .filter((entry) => entry.via !== '')
    .slice(0, DETAIL_SECTION_LIMIT);

  /* --------------------------------------------- shared components */

  const shared = new Map<string, SharedComponentEntry>();
  for (const component of components) {
    const outward = diveAt(ladder, component.nodeId, {
      perLevel: DETAIL_SECTION_LIMIT * 4,
      previewMembers: 0,
    }).rings.find((ring) => ring.bucket === 'outward' && ring.level === 'kanji');
    for (const member of outward?.members ?? []) {
      if (member.node.id === nodeId) continue;
      if (shared.has(member.node.id)) continue;
      shared.set(member.node.id, {
        nodeId: member.node.id,
        character: member.node.label,
        element: component.element,
        usedBy: component.usedBy,
      });
    }
  }
  const sharedComponent = [...shared.values()]
    .sort((left, right) =>
      left.usedBy !== right.usedBy
        ? left.usedBy - right.usedBy
        : left.character.localeCompare(right.character, 'ja'),
    )
    .slice(0, DETAIL_SECTION_LIMIT);

  /* ------------------------------------------------------- the note */

  const note = buildSelfNote(
    character,
    kanji.meanings[0],
    compounds.map((entry) => entry.lexeme.headword),
  );

  /* -------------------------------------------------------- the era */

  const graphNode = ladder.graph.nodes.get(nodeId);
  const era: EraAttribution =
    graphNode === undefined
      ? {
          placement: 'unknown',
          basis: 'not_a_lexical_node',
          stratum: null,
          detail: 'this character is not in the indexed Atlas',
        }
      : attributeNodeEra(graphNode, undefined);

  return {
    kanji,
    nodeId,
    components,
    compounds: compounds.slice(0, DETAIL_SECTION_LIMIT),
    compoundsAvailable: wordRing?.available ?? 0,
    compoundsTruncatedUpstream: wordRing?.truncated ?? false,
    readingFamily,
    sharedComponent,
    note,
    era,
  };
}

/**
 * The era of a *word*, which is the only kind of node the attribution places.
 *
 * Built for one lexeme at a time, from the characters that lexeme is written
 * with — never for the whole tier. That is the same level-of-detail discipline
 * the dive keeps, applied to the ground: a surface asks about the node in front
 * of it and pays for that node.
 */
export function eraOfLexeme(ladder: ScaleLadder, lexemeId: string): EraAttribution | null {
  const node = ladder.graph.nodes.get(lexemeId);
  const lexeme = findLexemeById(lexemeId);
  if (node === undefined || lexeme === null) return null;

  const characterReadings = new Map<string, CharacterReadings>();
  for (const character of lexeme.kanjiUsed) {
    const kanji = findKanjiByCharacter(character);
    if (kanji === null) continue;
    characterReadings.set(character, { on: kanji.onReadings, kun: kanji.kunReadings });
  }

  return attributeNodeEra(node, {
    headword: lexeme.headword,
    reading: lexeme.reading,
    characterReadings,
  });
}
