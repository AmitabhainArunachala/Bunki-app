# N2/N1 collection: plan

Status: proposal for the learner, 2026-10-04. Branch `srs-review`, after the seven repair
steps that followed the [review](../review-2026-10-04/REVIEW.md) and its
[refinement](../review-2026-10-04/REFINEMENT.md). Nothing in this plan changes the two
shipped decks, their card IDs, their Anki identities or the `bunki-cloze:<deckId>` ledgers.

Superseded in part (2026-10-07): the collection shipped as three decks, `n2`, `n1` and
`senmon`, with ledgers `bunki-cloze:<id>` and deep links `?deck=<id>`, registered by hand in
`DOJO_DECKS` rather than through `registry.json`. The identity in §5 does not describe them;
see `decks/n2n1/BATON_CODEX_2026-10-07.md`.

The learner's direction (PR #117): a combined N2/N1 collection covering vocabulary, grammar,
expressions and contextual kanji knowledge; every released card carries at least one
coherent, substantive, multi-sentence Japanese paragraph while its scored task stays focused
and fast; coverage is traceable and deduplicated; no invented "official" JLPT inventory;
Bunki's evidence and FSRS architecture, existing progress, source provenance and the three
delivery surfaces (app, Anki, standalone) are preserved; release blockers are repaired before
content scales.

This plan rests on three read-only scouts (vocabulary inventory, grammar/expression/kanji
inventory, text sources) run against HEAD `7afa1a36`. Their counts are quoted below with the
file they came from. Where a count is an upper bound (substring or token-run matches before
review) it says so.

## 0. What is settled before any content is written

Repairs already on this branch: grade persistence (F01, F07), staged restore (F02, A21),
frozen card and Anki identity (F26, A25), leak masking and alignment (F15, F18, A03), ruby
classes and the two factual sentences (F16, F17, F23), licence of record with private and
public build profiles (F12–F14, N07, N11, A11–A13), and the player repairs (F34–F38, F40,
F42, F49, F51, N02, N05, N12). All gates passed at the time of writing (`format:check`
passes on tracked files; the seven failing files are untracked local notes).

Still open and required before the pilot ships to a public surface (FIX_PLAN numbers):

| Precondition                                                        | Why it blocks the pilot                                                                                                  | Plan step |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| Registry (`registry.json`) generating chooser, deep link, SW, Pages | A new deck must not be a fourth hand edit in four files (F52, S46, A23). `corridor.js` line pins forbid casual edits.    | PR 12     |
| Deck verifier in CI (A24)                                           | The pilot adds a third deck to a verifier that no workflow runs today (F53, N12).                                        | PR 12     |
| Content schema v2 with sense identity (S39)                         | Items in this collection are senses, not headwords; grammar and kanji targets need an explicit target kind (F19, F20).   | PR 5      |
| Written policy on the tanos lineage                                 | `corpus/src/corpus/grading/tmr.py:24–25` calls it "contaminated lineage"; `wbig.json` is that lineage and ships. See D3. | D3        |

Nothing above requires resetting progress or editing `corridor.js`. `DOJO_DECKS`
(`corridor.js:10651`) is a one-line array, so even a manual registration would keep the
line count; the registry route is still the one to take.

## 1. Scope and traceability

### 1.1 Scope

Four item kinds, one collection:

| Kind     | Source of the inventory                                                                                                                     | Level source                                                               | Size of the full inventory                                          |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 語 vocab | `prototypes/drift/data/wbig.json` N2/N1 rows, plus the 678 kana-only N2/N1 rows the snapshot dropped (upstream open-anki-jlpt-decks CSVs)   | open-anki-jlpt-decks tag (chyyran → tanos lineage); editorial, pre-2010    | N2 1,489 + N1 2,274 kanji headwords; +298 / +380 kana-only          |
| 文法     | corridor `GRAMMAR` (`corridor.js:163–384`, read only) merged with `data/original/grammar-v11.json`; 10 points still unharvested from v11 TS | the author's own label; no external source                                 | N2 92 + N1 50 merged, +10 unharvested (2 N2 absent: わけだ, につき) |
| 表現     | `corpus/datasets/jmdict_idioms/idioms.jsonl` (id / yoji / proverb / quote), plus wbig rows JMdict tags `exp`                                | none exists; "unlevelled" is the honest label                              | 4,198 idiom rows; usable share decided by attestation and review    |
| 字 kanji | glyphs of the chosen vocabulary; levels from `corpus/datasets/kanji/kanken.jsonl` (CC0); readings and parts from `share_alike/kanji.json`   | Kanken band (secondary-school jōyō = 4級–2級); explicitly not a JLPT level | derived from the vocabulary; 56 in the pilot                        |

Out of scope: an "official" N2/N1 list (none has been published since 2010), the
`reference-extra.json` and `kotobako-static.json` kanji "N1/N2" labels (renamed pre-2010
KANJIDIC2 levels with no N3; do not ship), `drift/data/sem.json` relations (model-written,
unchecked), and any private-only text source (they add about 2 N2 and 1 N1 headwords of
coverage over the public pools; not worth the rights exposure).

### 1.2 Every item carries three things

Schema v2 (S39) fields, required on every lexical entry, grammar point, expression and kanji
target:

1. **`source`**: the file and row/line/seq the item was taken from (`wbig.json` row,
   `corridor.js` line, JMdict `ent_seq`, `kanken.jsonl` glyph). For vocabulary the JMdict
   `seq` is stored too, so the join to definitions is by ID, not by string (the wbig join is
   by surface and is ambiguous for 70 headwords that appear at more than one level).
2. **`level.label` + `level.derivation`**: `N2`, `N1`, `unlevelled` or a Kanken band, with the
   derivation string naming the list and its lineage. The learner-facing rendering is
   「N2相当（公開リストによる目安）」 / "N2 (from a public list; the JLPT publishes no
   list)". The string "JLPT N2 word" never appears on a card.
3. **`dedupKey`**: `v|<headword>|<reading>` for vocabulary and `x|jmdict:<seq>` for
   expressions, `g|<pattern id>` for grammar, `k|<glyph>` for kanji. Item IDs are assigned
   from a committed manifest keyed by `dedupKey` (A25): a key keeps its ID forever, a
   dropped key is reserved, a new key takes the next number.

A second difficulty signal (NINJAL 教育基本語彙, CC BY 4.0, `corpus/data/ninjal` is empty in
this checkout) is recorded when fetched as `signals.ninjalBand`, never as a JLPT level.

### 1.3 Overlap with kotoba-mine is one sense collection

Measured against `decks/kotoba-mine/source/entries.json` (323 terms, exact headword match;
splitting wbig on `;`, stripping `～` and trailing に/な/と/する adds nothing):

- 79 of the learner's terms are in wbig: N1 43, N2 19, N3 17 (風 is listed twice).
- 244 have no level in any repo source (俯瞰, 灼熱, 攪拌, 牛耳る, 軈 …).
- So 62 learner words fall inside the N2/N1 inventory; 6 of them are in the pilot slice
  (箇所 km-007, 上下 km-081, 性能 km-187, 可決 km-248, 縮小 km-180, 記号 km-172).

Rule: an N2/N1 item whose lexeme already has kotoba-mine cards is **linked**, not rebuilt.
`source/links.json` maps `nn-v-NNNN → km-NNN`; the N2/N1 build emits no new card for a
linked sense; the sibling rule (S13, A16) buries the kotoba-mine cards on days the learner
meets the item through another contract. The learner's own gloss stays the primary sense
(S11 "learner's actual encounter"); the N2/N1 definition becomes a second sense only when
the learner's sense differs (A17), and that is a recorded decision, never automatic. Linked
items count toward coverage reports; they never create duplicate enrollment (FIX_PLAN 10).
Passages shared across decks share one `passageId` and one English translation (A16).

## 2. Card contracts

Common to all four kinds:

- **Paragraph requirement.** Every released item has at least one passage of two or more
  sentences, 70–220 characters, one scene with named referents (S18), the target used exactly
  once as the whole inflected word (A03, A18). The upper bound is from F40 (a 195-character
  front pushed the grade bar below the fold at 390×844); it is a layout limit, not a quota,
  and a longer verbatim quotation may be kept with the focal clause emphasised (S07).
  More than one passage per item needs a recorded purpose (S11); there is no count target.
- **Fast scored task.** One target per card, visually focused inside the paragraph; two
  grade buttons (S27, A05); the paragraph is context, not the test. Reveal shows target →
  reading → English gloss (visible by default, requirement 10) → short Japanese definition →
  translation behind a tap → source (S25).
- **Default contract.** Per STANDARD A01 the default preset for newly enrolled items is a
  recorded learner decision, not a hidden default; both presets must exist. The
  recommendation (FIX_PLAN "reading first", RESEARCH top five #1) is 読んで思い出す as the
  default for 語 and 表現, with the MCD cloze preset available. Decision D1.
- Every contract has an immutable `contractId`; a mode switch that changes the required
  response is a different contract (S06). 4択 remains practice, never a scheduled grade
  (S04, F04), and stays off for 字 cards until reviewed distractors exist (A09).

| Kind     | Default contract (recommended)                                                                                                                                                  | MCD-preset contract                                                                                                                                                                          | Cue rules                                                                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 語 vocab | **Targeted meaning**: word marked in the paragraph, no reading or meaning before reveal (A04); recall the sense used here.                                                      | **語 cloze**: the word is the gap; Japanese definition as hint on passage 1 only (REFINEMENT Q5); every further occurrence masked under the same task (A03).                                 | Hint must not share a kanji with the answer or contain its reading (A03, N06). The gloss is per sense (S20), rebuilt from JMdict senses, never the 32-character wbig gloss.   |
| 文法     | **Targeted meaning of the pattern**: the pattern chunk marked; recall what it does here (mJa/mEn, formation shown on the back).                                                 | **Chunk cloze**: the pattern chunk is the gap with the meaning cue; a reviewed alternatives set is mandatory (S09): 〜ざるを得ない also fits 〜ないわけにはいかない in many frames.          | The gap is the grammatical chunk as written (〜ざるを得なかった), never a stem cut. Register note on the back. A detection cue list per point drives mining.                  |
| 表現     | **Targeted meaning**: the whole set phrase marked (S11 "set phrase as a unit").                                                                                                 | **Partner-word gap**: one slot of the phrase is the gap (礎を［築く］, 鍵を［握る］); the rest visible. Reviewed alternatives (握る／担う).                                                  | Yoji: the four-character unit is the target; 字 cards are not generated from yoji (a visible half of a yoji identifies the rest, A03).                                        |
| 字 kanji | **Reading recall of the host word**: host word in the paragraph with the target glyph visible, no furigana on it; supply the host word's reading (STANDARD §2, reading recall). | **字 cloze** (A02): the glyph is the gap, reading as hint, generated only from a verified alignment (S08, S22); the host word is named on the back with its other hosts (稽古 → 滑稽 shape). | Invalid if the glyph appears anywhere else on the front (A03). Kanken band shown as 「漢字検定の目安」 is **not** used; the band is internal. 漢検 is never used as branding. |

Contextual kanji knowledge, concretely: a 字 item is a glyph plus a ranked list of host
words from the collection (`hostWords`, pilot: 1–3 per glyph), the reading used in each host
(from the verified ruby of that host's passage), the component list from `kanji.json`
(KANJIDIC2/KanjiVG, CC BY-SA) labelled 漢字の形と意味 (S28), and optional stroke order from
`share_alike/strokes.json`. There is no per-kanji sentence; the paragraph is the host word's.

## 3. Sourcing

### 3.1 Order of preference (S14 tiers, public release first)

| Rank | Source                                                             | Rights                                                                                                   | Volume and coverage (upper bounds, token-run or substring)                                             | What must be fixed first                                                                                                             |
| ---- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `corpus/datasets/wikinews/archive.jsonl` (694 articles, committed) | CC BY; version differs by date (2.1 JP before 2005-09-25, 2.5 after) and is recorded inconsistently      | 2,042 units; N2 532 / N1 1,009 headwords hit; pilot vocabulary chosen from here                        | Per-article licence version; store revision id or `dump_last_modified` as the pin (S14, A12)                                         |
| 2    | Aozora CC BY works (trailer verified) and copyright-expired works  | CC BY per trailer (A11); copyright-expired needs the index CSV join (作品著作権フラグ, 人物著作権フラグ) | 143 CC BY files, 21,949 units; 10,205 modern-kana no-notice files, 537k units, N2 1,332 / N1 2,221 hit | The index join is the blocker: 83/97 `rights.json` Aozora entries are unverified; the index could not be fetched in this environment |
| 3    | Wikipedia-derived paragraphs (JaQuAD, JSQuAD, WAC, KFTT)           | CC BY-SA 3.0/4.0 → every derived card ships CC BY-SA in the share_alike pool                             | 39,887 units; N2 1,176 / N1 2,033 hit                                                                  | Decision D2 (accept share-alike for part of the collection); article title + revision/URL required (A12)                             |
| 4    | Wikinews via `Japanese-Fakenews-Dataset` (`isfake == 0` only)      | CC BY, but rows have no title, URL or page id                                                            | 3,685 articles, 10,684 units; N2 867 / N1 1,548 hit                                                    | Unusable for public until matched to the dump (S14); the dump host was unreachable here                                              |
| 5    | Tatoeba / example bank                                             | CC BY 2.0 FR / CC0 per sentence; corpus ids and contributors not stored                                  | 232,778 single sentences                                                                               | Single sentences cannot satisfy the paragraph requirement; secondary short context only; F14 corpus ids first                        |
| 6    | Written passages (書き下ろし)                                      | Bunki original (OD-09 pending)                                                                           | unlimited; today 322/323 MCD anchors are written (N01)                                                 | Only where 1–4 fail for the sense, with the reason in `decisions.jsonl` (A10); see 3.2                                               |

Private-only sources (livedoor ND, WRIME NC-ND, unread web pages, Aozora ND/NC) are not
used for this collection at all. The private study profile remains available for the two
existing decks; the new collection is built public-profile-clean from the start so that the
learner's decision D2 is about share-alike, not about rights holds.

Pool arithmetic from the text-sources scout: CC BY only (Wikinews + Aozora CC BY) reaches
N2 1,187/1,489 and N1 2,024/2,274 headwords with at least one unit (≥3 units: 1,016 / 1,806).
Adding copyright-expired Aozora lifts this to 1,336 / 2,233. These are substring upper
bounds; after lemma matching, the rank filters, context-independence (F22) and sense binding
(F19) the real figure will be materially lower, and literary Aozora text will rarely suit
N2 news vocabulary. Plan on written passages for a large minority of senses and say so in
the coverage report (S15).

### 3.2 Written passages: the REVIEW_MCD rules, corrected

`decks/kotoba-mine/source/REVIEW_MCD.md` stays the base. These corrections apply to the new
collection and supersede the matching lines there:

| REVIEW_MCD rule                               | Correction                                                                                                                                                                                                                                       | Source   |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| "Every word gets 2–4 passages", "write 1–2"   | No count. One paragraph per sense is the floor; a second needs a recorded purpose (new sense, register, failed transfer).                                                                                                                        | S11, F24 |
| "Put the clearest passage first; often yours" | A written anchor needs a per-item reason in `decisions.jsonl`; the share of written anchors is reported separately.                                                                                                                              | A10, N01 |
| "the word appears once"                       | Kept, and enforced by the leak validator over lemma, variants and every visible region, including the hint.                                                                                                                                      | A03      |
| "2–4 sentences, 70–160 characters"            | 2 or more sentences, 70–220 characters; the paragraph is one scene.                                                                                                                                                                              | §2, F40  |
| (no rule on facts)                            | A written passage is `claims: none`, `claims: fictional` or `claims: checked`; `checked` needs a `qa/fact-checks.jsonl` row with date and source. Undated 「現在」「先日の選挙」 are rejected. Conventional elliptical phrasing is not an error. | S19, A19 |
| "no 〜について説明します framing"             | Kept and extended: no 「Xとは…である」 padding, no 「様々な」「重要です」「〜と言えるでしょう」 strings of hedges, no translated feel, no canned explanation repeated across items. These are review flags; natural connectives are not banned.  | S18      |
| (no rule on span)                             | `form` is the whole inflected word as written (勝ち残った), never a tokeniser stem.                                                                                                                                                              | A18      |
| "no private person's name"                    | Kept; also no real private person's post as a source, by URL or by content.                                                                                                                                                                      | A13      |
| (no rule on level words)                      | The surrounding vocabulary is easier than the target as a soft score (S45), not a hard rule; grammar paragraphs for N2 points use N3-or-easier vocabulary where the scene allows.                                                                | S18      |
| "Mark `original: true`"                       | Kept, as `kind: written`, `author: <role>`, `review: <role, date>`; the label on the card stays 書き下ろし.                                                                                                                                      | S14      |

Two passes are mandatory (S44): one writes, a second checks meaning, translation, sense and
naturalness without seeing the first pass's notes. Neither is native sign-off; the first
corrected release gets qualified Japanese review of every active passage (S12 gates), and
the reviewer's role and date are recorded, never "model agreement".

### 3.3 Mining and ranking

Reuse `decks/kotoba-mine/tools/mine_*.py`, `rank.py` and `rank_passages.py` through the
factory stages (S43), with these changes before the pilot runs them:

- lemma and token-run matching replaces substring (`pilot_slice.py` already does this for
  selection; `rank.py:32–46,123–144` must follow), with the negative fixtures of S21 and the
  文語 exemption of A15;
- a grammar point is found by its cue list (from `grammar.ts` `cues[]`, extended by hand),
  then confirmed by a human-read pass, because cues such as 上で or ものの over-match;
- an idiom is found as a token run of up to 8 tokens over its JMdict kanji forms;
- every rejection is logged with the filter name (S45), inputs are sorted, `wordfreq` is a
  pinned dependency that fails loudly when missing (F28);
- selected snapshots are pinned by commit or sha256 in `locks/source-manifest.json` (S42);
  `mining/` stays git-ignored, approved extracts are committed in `source/passages.json`.

### 3.4 Validators (fail the build; a non-zero count needs a named disposition)

| ID  | Check                                                                                                                                                                                                           | Rule           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| V1  | **Leak, all occurrences**: the target lemma, its variants, its reading and any compound containing it, searched in every front region (passage, hint, ruby, title, aria label); 字: the glyph anywhere else.    | A03, S23       |
| V2  | **Sense per example**: each passage binds one `senseId`; gloss and definition belong to that sense; the hint shares no kanji with the answer and does not contain its reading.                                  | A17, S20, N06  |
| V3  | **Ruby verification**: tokeniser readings are candidates; `readings.json` overrides; every watchlist kanji (方・日・人・他・上手・一日・生・風・市・下・上) has a disposition; 字 only from verified alignment. | A14, S22       |
| V4  | **Fact-claim register**: every written passage declares `claims`; `checked` rows exist in `qa/fact-checks.jsonl` with date and source; floating dates rejected.                                                 | S19, A19       |
| V5  | **Match fixtures**: 率直≠率, きれいなお花≠なお, 県ごと≠ごとく, 失敗しがち≠ガチ, plus one negative fixture per grammar cue that over-matched in review.                                                          | S21, A15       |
| V6  | **Duplicates**: one `passageId` per text across all decks; one translation per passage; near-duplicate paragraphs (normalised) across items flagged; linked items emit no card.                                 | A16, §1.3      |
| V7  | **Rights**: public profile rejects any record without licence, URL, author (literary) or revision pin; attribution file exported per artifact; CC BY-SA records only when D2 allows.                            | S16–17, A11–13 |
| V8  | **Level wording**: every learner-facing level string carries the 目安 note; no "JLPT N2 word" or 漢検 branding; the deck's method text names the list the levels came from.                                     | §1.2           |
| V9  | **Paragraph contract**: ≥2 sentences, 70–220 characters, target once, whole inflected span, no mid-sentence excerpt, no unresolved こんな／その／彼 without an antecedent in the passage.                       | §2, A18, F22   |
| V10 | **Copy**: banned-pattern list from 3.2 over Japanese and English; UI strings use 新しいカード, 思い出せた, 定着.                                                                                                | S18, S28, F42  |
| V11 | **Schema and identity**: v2 records validate; `ids.json` frozen under `--frozen`; reorder test; Anki model/deck IDs unchanged across rebuilds.                                                                  | S39, A25, S47  |

## 4. Pilot slice

### 4.1 What and why

`docs/srs/n2n1/pilot-slice.json`, generated by `decks/n2n1/tools/pilot_slice.py` from
committed data only (`--check` fails if a fresh run differs). Counts at HEAD:

| Kind               | New | Linked to kotoba-mine | Selection rule                                                                                                                                                                                 |
| ------------------ | --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 語 vocabulary (N2) | 300 | 6                     | wbig N2, has kanji, not an affix, JMdict-common entry with that written form, ≥2 Wikinews units containing it as a token run or lemma; ordered by distinct articles, then units, then headword |
| 表現 expression    | 43  | 0                     | wbig N2 rows tagged `exp` (1) + JMdict idiom-layer entries attested in ≥1 Wikinews unit (42); labelled `unlevelled`                                                                            |
| 文法 grammar (N2)  | 92  | 0                     | every N2 point in corridor `GRAMMAR` (85) + grammar-v11 N2 points not already covered (7)                                                                                                      |
| 字 kanji           | 56  | 0                     | glyphs of the 300 chosen headwords whose Kanken band is 4級–2級, each with its host words                                                                                                      |

Dropped from the N2 pool and why: 143 affix rows (～化), 51 without a JMdict-common entry,
799 with fewer than 2 units in the committed archive, 189 beyond the 300 target.

Why this slice, and not N1 or everything:

1. **It is buildable from a clean checkout.** The only passage source in git is the Wikinews
   archive; every pilot vocabulary item has at least two candidate units there, most have
   tens (以降 44 articles, 対策 42). The N1 inventory is better served by Aozora and
   Wikipedia, both of which have an unresolved precondition (index join, D2).
2. **It exercises all four contracts** and the kotoba-mine link (6 items) at a size a
   second-pass review can cover in full, not by sampling.
3. **N2 news vocabulary is where the learner reads** (CODEX_REVIEW_PROMPT §1: news,
   economics, technology). The ranking by distinct articles favours words that recur across
   the news register over words carried by one long article.
4. **Grammar is the gap nobody has filled.** 271 N2/N1 examples exist today and 268 are
   single sentences (the corridor's longest is 29 characters); no grammar card exists in either deck. Doing all 92
   N2 points at once makes the alternatives review (S09) consistent across near-synonyms.
5. **Kanji come from the words**, so the 56 字 items reuse the vocabulary paragraphs; no
   separate kanji sourcing is needed for the pilot.

Known biases to state in the release notes: the archive is news, so the pilot leans to
public-affairs vocabulary (競馬 ranks high because Wikinews covered racing); kana-only N2
words are absent (they are not in `wbig.json`; restoring them is D4); the expression set is
whatever the archive happened to attest, not a frequency-ranked cut (D6).

### 4.2 Acceptance gates for the pilot

| Gate                                                                                                                                              | Evidence                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Every one of the 491 new items has ≥1 passage meeting V9; written anchors have a `decisions.jsonl` reason; the written share is reported per kind | build report, `qa/` files                                                            |
| V1–V11 all zero or dispositioned                                                                                                                  | `validate` stage output committed under `qa/`                                        |
| Public profile builds with zero unresolved rights records; ATTRIBUTION exported with per-article Wikinews licence version                         | `release/public/`                                                                    |
| `ids.json` frozen; `build --frozen` passes; reorder test passes; the 6 linked items emit no card and bury correctly                               | `verify` stage                                                                       |
| `pilot_slice.py --check` passes; `locks/source-manifest.json` pins the archive sha256                                                             | CI                                                                                   |
| Second-pass review complete for 100% of items; reviewer role and date recorded; no "native approval" claim                                        | `qa/editorial-review.jsonl`                                                          |
| Player: 390×844 front/back for each contract × both presets × 8 themes, contrast per A20; the longest paragraph keeps the grade bar on screen     | `review-player.mjs` matrix                                                           |
| Anki: real-backend import, reimport after a content change preserves note count and schedule; new model ids do not collide with `kotoba-mine-*`   | `verify-kotoba-mine.mjs` extended, or a sibling verifier generated from the registry |
| Standalone HTML opens offline with the pinned FSRS; fresh first-open test                                                                         | A22 check                                                                            |
| No change to `corridor.js` line count, kotoba IDs, GUIDs or ledgers; existing verifier still green                                                | `git diff --stat`, verifier                                                          |

### 4.3 Effort estimate

Agent-hours, excluding qualified native review (people, not code) and excluding the
preconditions in §0:

| Work                                                                                                            | Hours   |
| --------------------------------------------------------------------------------------------------------------- | ------- |
| Factory tooling for `decks/n2n1` (stages, schema v2 records, validators V1–V11, registry entry, verifier cases) | 20–28   |
| Mining and ranking runs, cue lists for 92 grammar points, idiom token-run matcher                               | 6–8     |
| Vocabulary: choose or write one paragraph, translate, bind sense, rebuild gloss from JMdict (300 × ~8 min)      | 40      |
| Grammar: paragraph, alternatives set, formation and register note (92 × ~12 min)                                | 18      |
| Expressions (43 × ~10 min) and kanji host lists, alignment check (56 × ~5 min)                                  | 12      |
| Second pass over everything (S44)                                                                               | 20–25   |
| Fixtures, release build, three-surface verification, attribution                                                | 8–10    |
| **Total**                                                                                                       | 124–141 |

The per-item minutes are the review's observed pace on the 73-word sample, not a measured
throughput for this pipeline; treat the total as ±30%.

## 5. Registry entries and identity

Deck layout (STANDARD §10), created by the first tooling PR:

```text
decks/n2n1/
  deck.config.json          id, titles, presets, defaultPreset (D1), artifact profiles
  source/words.json         lexical entries (from pilot-slice.json, kind v/x/g/k)
  source/senses.json        one sense per card, gloss/definition rebuilt from JMdict
  source/sources.json       Wikinews article records with licence version and pin
  source/passages.json      approved passages with passageId, span, translation, provenance
  source/contracts.json     contractId per scored task, target kind, alternatives
  source/links.json         nn-* → km-* for the same lexeme
  source/decisions.jsonl    written-anchor reasons, sense merges, dispositions
  source/rights.json        licence of record per source
  source/ids.json           item and card id manifest (A25); seeded from pilot-slice.json
  locks/dependencies.json   fugashi, unidic-lite 1.0.8, genanki, wordfreq, ts-fsrs 5.4.1
  locks/source-manifest.json  sha256 of every input (pilot-slice.json already records them)
  qa/editorial-review.jsonl, qa/fact-checks.jsonl, qa/waivers.json
  tools/pilot_slice.py      (exists)
  release/
```

Identity, fixed now so nothing moves later:

| Field           | Value                                                                     | Note                                                                                            |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Deck id         | `n2n1`                                                                    | no "jlpt" in the id or the ledger key; the method text names the list the levels come from      |
| Title           | 「N2・N1の言葉と文法」 / "N2–N1 words, grammar and kanji"                 | the level note 「レベルは公開リストによる目安」 appears in the method panel                     |
| Ledger key      | `bunki-cloze:n2n1`                                                        | new key; `bunki-cloze:kotoba-mine` and `bunki-cloze:kotoba-mcd` untouched                       |
| Preferences key | `bunki-cloze:prefs:v3:n2n1`                                               | per-deck display settings; the global new-card budget (S31) is shared                           |
| Item ids        | `nn-v-0001`, `nn-x-0001`, `nn-g-0001`, `nn-k-0001`                        | from `ids.json`, keyed by `dedupKey`                                                            |
| Card ids        | `<itemId>-c01`, `-c02` …                                                  | keyed by item, passage text and contract kind, as `kotoba-mine` does since A25                  |
| Anki            | model `n2n1-v1`, deck `N2・N1の言葉と文法`, GUID seed `card id + deck id` | distinct from `kotoba-mine-mcd-v4` and `kotoba-mine-sentence-v3`; custom Basic cloze kept (S48) |
| Deep link       | `?deck=n2n1`                                                              | generated from the registry                                                                     |
| Content format  | `bunki-srs-content` v2 with a v1 adapter                                  | the player reads v1 today; the adapter ships with PR 5                                          |

`prototypes/corridor/decks/registry.json` entry (consumers generated per S46/A23):

```json
{
  "id": "n2n1",
  "titleJa": "N2・N1の言葉と文法",
  "titleEn": "N2–N1 words, grammar and kanji",
  "deck": "decks/n2n1/deck.json",
  "ledger": "bunki-cloze:n2n1",
  "prefs": "bunki-cloze:prefs:v3:n2n1",
  "presets": ["read", "mcd"],
  "defaultPreset": null,
  "links": { "kotoba-mine": "decks/n2n1/source/links.json" },
  "profiles": ["public"],
  "verifier": "generated"
}
```

`defaultPreset: null` is deliberate: the build refuses to ship until D1 is recorded.

When FIX_PLAN 10 (one collection, selectable presets) lands, `n2n1` becomes a group of that
collection and `bunki-cloze:n2n1` a compatibility view (S03, S40.6); nothing in this plan
has to be redone for that.

## 6. Decisions for the learner

Each changes what gets built. Everything else in this plan proceeds without a decision.

| #   | Decision                                                                                                                                                                              | Recommendation                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Default preset** for the new collection: 読んで思い出す (meaning first, about 1–2 cards per item) or MCD cloze with 字 (about 3–5 cards per item)?                                  | Meaning first for 語・表現・文法; 字 cards generated and on under the MCD preset only. No study in `docs/srs/research` shows a winner; this is the lower-workload default and matches reading-mined goals.                       |
| D2  | **Share-alike text**: accept CC BY-SA (Wikipedia-derived) paragraphs, which makes those cards CC BY-SA and keeps them in the share_alike pool with EDRDG-style attribution on screen? | Yes for N1 and for senses the CC BY pools miss, as a labelled pool; no for the N2 pilot, which does not need it.                                                                                                                 |
| D3  | **Level lineage**: keep using the open-anki-jlpt-decks (tanos) levels as labelled estimates, or wait for the NINJAL bands? `tmr.py:24–25` forbids the lineage for graders.            | Use them, labelled as in §1.2, and write the decision into `corpus/README.md`: the grader ban stays; deck level labels are estimates with a named source. Fetch NINJAL as a second signal when reachable, never as a JLPT label. |
| D4  | **Kana-only words**: restore the 678 N2/N1 kana rows the snapshot dropped (やがて, すっかり, いきなり, しみじみ)?                                                                     | Yes, as a pinned fetch with the upstream `guid` column stored; a second pilot slice covers them.                                                                                                                                 |
| D5  | **Linked senses**: for the 62 overlapping lexemes, keep the learner's own gloss as the primary sense and add the N2/N1 sense only when it differs?                                    | Yes. Never a second card for the same sense.                                                                                                                                                                                     |
| D6  | **Expression scope**: idiom-layer entries attested in open text only (43 now), or a frequency-ranked cut of the 4,198 using `wordfreq` with human review?                             | Attested-only for the pilot; frequency cut for the full collection, reviewed in batches of 100, since the layer includes archaic yoji.                                                                                           |
| D7  | **Grammar paragraphs**: mined only (slow; cues over-match) or written-with-label where mining fails inside the pilot budget?                                                          | Written where mining fails, with the reason recorded (A10); mined share reported. All 92 points ship with a paragraph either way.                                                                                                |
| D8  | **Order after the pilot**: N1 vocabulary next, or the rest of N2 (the 189 dropped past the target plus kana words)?                                                                   | Rest of N2 first, so one level is complete and transfer probes (S55) can run on it; N1 waits for D2 and the Aozora index join.                                                                                                   |
| D9  | **Kanji on the reading preset**: reading recall of the host word (as in §2) or no 字-type card at all outside MCD?                                                                    | Reading recall, opt-in per deck; it is the contract that matches the learner's "contextual kanji knowledge" without producing 字 debt.                                                                                           |
| D10 | **Public surface** for the pilot: GitHub Pages and shared `.apkg` from the first release, or private devices first?                                                                   | Public from the first release, because the pilot uses only CC BY text and written passages; this is the point of choosing the slice this way.                                                                                    |
