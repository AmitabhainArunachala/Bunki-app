/**
 * The road the guide can offer, and the words it can raise (Campaign E / B6).
 *
 * Both come out of `@bunki/seed`. The kernel's guide holds no vocabulary — it
 * takes candidates as an argument — so this module is where the abstract road
 * meets real Japanese, and it is deliberately the only place in this lane that
 * does.
 *
 * ## Why these eight stations
 *
 * They are the seed's own road words, laid on the three era layers of the map
 * document §2, oldest first:
 *
 *   - **古道** 道 and 分かれる — native kun vocabulary, the oldest stratum.
 *   - **街道** 岐路, 分岐点, 道路 — 漢語 compounds, the literate-commoner layer.
 *   - **鉄道** 駅, 線路, 分岐 — the rail era, and 分岐 is a railway term, which
 *     is where the product's name comes from.
 *
 * 駅 sits on the rail layer with a note about where it came from rather than
 * being duplicated onto all three. The map document's point about 駅 is that the
 * *character* travelled — 駅家 on the ancient road, 宿場 on the highway, the
 * railway station in Meiji — and a road that listed it three times would be
 * asserting three stations where the language has one word.
 *
 * ## What the notes are, and are not
 *
 * Each note is one line and each one is about the word: where it sits, what it
 * is made of, which register it belongs to. None of them is a claim about the
 * learner, and none is an etymology this project cannot source (REQ-SRC-05).
 * The layer attribution is this project's own reading of the vocabulary, which
 * is why the screen says so rather than presenting it as a dictionary fact.
 *
 * ## Turn prompts
 *
 * A turn may only raise a word the OD-08 content policy already permits, so the
 * prompts are built by `seededContextFor` — the same function the candidate
 * panel uses — and a word with no seeded sentence simply does not become a
 * turn. Nothing here can widen what may leave the device.
 */

import type { RouteWaypointCandidate } from '@bunki/domain';

import { seededContextFor } from '../../candidate/candidate-context.ts';
import { findLexemeById, findLexemeByHeadword } from '../../data/catalog.ts';
import { distinctProvenance, provenanceEntries, provenanceSummary } from '../../data/provenance.ts';
import type { GuidePromptWithId } from './guide-types.ts';

/** The seed lexeme behind each station, in road order. */
const STATIONS: readonly {
  readonly id: string;
  readonly lexemeId: string;
  readonly layer: RouteWaypointCandidate['layer'];
  readonly lens: RouteWaypointCandidate['lens'];
  readonly note: string;
}[] = [
  {
    id: 'wp-michi',
    lexemeId: 'lex-michi',
    layer: 'kodo',
    lens: 'reading',
    note: 'the native word for a road, read with its kun reading',
  },
  {
    id: 'wp-wakareru',
    lexemeId: 'lex-wakareru',
    layer: 'kodo',
    lens: 'meaning',
    note: 'the native verb for a road dividing — the same 分 as 分岐',
  },
  {
    id: 'wp-kiro',
    lexemeId: 'lex-kiro',
    layer: 'kaido',
    lens: 'meaning',
    note: 'a literary compound for a forked road, almost always figurative',
  },
  {
    id: 'wp-bunkiten',
    lexemeId: 'lex-bunkiten',
    layer: 'kaido',
    lens: 'reading',
    note: '点 makes it the place a road divides rather than the dividing',
  },
  {
    id: 'wp-douro',
    lexemeId: 'lex-douro',
    layer: 'kaido',
    lens: 'reading',
    note: 'the made road as a two-character compound, on reading throughout',
  },
  {
    id: 'wp-eki',
    lexemeId: 'lex-eki',
    layer: 'tetsudo',
    lens: 'reading',
    note: 'the post-station word the railways took back up; its radical is 馬',
  },
  {
    id: 'wp-senro',
    lexemeId: 'lex-senro',
    layer: 'tetsudo',
    lens: 'reading',
    note: 'the rails themselves — 線 the line, 路 the road',
  },
  {
    id: 'wp-bunki',
    lexemeId: 'lex-bunki',
    layer: 'tetsudo',
    lens: 'meaning',
    note: 'a railway term for a split, and the word this app is named after',
  },
];

/**
 * The stations, as the kernel's guide takes them.
 *
 * A station whose lexeme is not in this build is dropped rather than rendered
 * empty — the road must never contain a word the data does not have, and a
 * station that opened onto nothing is the "dead list inbox" the frozen spec
 * rejects by name (§10.1).
 */
export const ROUTE_CANDIDATES: readonly RouteWaypointCandidate[] = STATIONS.flatMap((station) => {
  const lexeme = findLexemeById(station.lexemeId);
  if (lexeme === null) return [];
  return [
    {
      id: station.id,
      layer: station.layer,
      name: lexeme.headword,
      targetForm: lexeme.headword,
      lens: station.lens,
      note: station.note,
    },
  ];
});

/**
 * How the era layer was decided, said on the screen that shows it.
 *
 * The seed carries no era field, so this attribution is a reading of the
 * vocabulary by this project rather than a dictionary claim. Saying which is a
 * REQ-SRC-01 obligation and not a modesty.
 */
export const LAYER_ATTRIBUTION_NOTE =
  'Which layer a station sits on is this project’s own reading of the vocabulary — native word, Chinese-derived compound, or rail-era term. The dictionary this build ships carries no era field, so nothing here is a dictionary claim.';

/**
 * Which words the guide opens with.
 *
 * These four, in this order, because they are the four the offline fixtures in
 * `@bunki/ai` actually cover. A web export holds no API key by construction, so
 * every one of these turns is served from those fixtures — and a turn about a
 * word with no fixture correctly renders "no pre-written note covers this",
 * which is honest but is a poor first thing to say. Choosing the covered words
 * is not a way of hiding the uncovered case: that path still runs for any word
 * whose fixture is missing, and it still says so.
 */
const TURN_LEXEME_IDS = ['lex-bunki', 'lex-bunkiten', 'lex-kiro', 'lex-wakareru'] as const;

/**
 * The turns the guide can open with.
 *
 * Four, because a conversation that runs to a dozen turns is a placement test
 * with better manners, and because four seeded sentences is what this build can
 * ask about honestly.
 */
export const GUIDE_PROMPTS: readonly GuidePromptWithId[] = TURN_LEXEME_IDS.flatMap((lexemeId) => {
  const lexeme = findLexemeById(lexemeId);
  if (lexeme === null) return [];
  const context = seededContextFor(lexeme);
  if (context === null) return [];
  return [
    {
      turnId: `turn-${lexemeId}`,
      targetForm: context.targetForm,
      excerpt: context.excerpt,
      seedRef: context.seedRef,
      /** The gloss, so the learner is answering about a word they can see. */
      gloss: lexeme.senses.slice(0, 2).join(' · '),
      reading: lexeme.reading,
    },
  ];
});

/** The road's name before anyone renames it. The seed passage's own title. */
export const DEFAULT_ROUTE_TITLE = '分かれた道';

export const DEFAULT_PLAN_TITLE = 'The next few stations';

/**
 * Where each thing on this screen came from, read out of the seed's own
 * provenance rather than typed here.
 *
 * A hard-coded `'JMdict (EDRDG), CC BY-SA 4.0'` would be correct today and
 * would go stale silently: the licence lives in `packages/seed/data/provenance.json`
 * and a screen that restated it would keep saying the old one after it changed.
 * `provenanceSummary` is the same function the word and kanji pages render, so
 * all three surfaces say one thing.
 *
 * The lines for the era layer and for the guide's own words have no provenance
 * record because they are not sourced data — one is this project's reading and
 * the other is generated. Saying so is the point; omitting them would leave a
 * reader to assume the whole screen is sourced.
 */
export function guideAttributionLines(): readonly { field: string; source: string }[] {
  const station = ROUTE_CANDIDATES[0];
  const lexeme = station === undefined ? null : findLexemeByHeadword(station.targetForm);
  const lines: { field: string; source: string }[] = [];

  if (lexeme !== null) {
    const distinct = distinctProvenance(
      provenanceEntries(lexeme.provenance).map((entry) => entry.record),
    );
    for (const record of distinct) {
      lines.push({
        field: 'Station words, readings and senses',
        source: provenanceSummary(record),
      });
    }
  }

  lines.push(
    {
      field: 'Era layer of each station',
      source: 'this project’s own reading of the vocabulary — the seed carries no era field',
    },
    {
      field: 'The guide’s words',
      source: 'generated, and labelled as generated on every block that shows them',
    },
  );
  return lines;
}
