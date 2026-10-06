# Learning design of one card

Angle: what one card should make the learner do, and what it should merely make
available. Sources: the learner brief, `review-2026-10-04/RESEARCH.md` (R-numbers),
`STANDARD.md` (S/A-numbers), `n2n1/PLAN.md` §2, the operator note on the private
player, and `decks/player/mount.js` as it runs today.

## 1. Wrestling with the brief

The brief asks for two things that pull against each other: a card whose T1 is
"front and centre and super, super clear", and a back that is "multi-layered,
recursive … a bit haywire". The research we hold is clear about which one earns the
review minute.

**Supported by evidence we hold**

- _T1 untouchable on the front, readings only after reveal._ S24, A04 and
  `notes-card_format_evidence.md` §3 all say the target's reading is part of the
  retrieval; R03 (Khatz's own reversal on furigana) shows even AJATT kept kana
  off the scored gap. `sentenceNodes(…, { front: true })` already renders the target
  as plain text (`mount.js:168–211`), so this is now a contract to keep, not a
  change.
- _Feedback right after the attempt._ R01, R02, R04, R10: retrieval followed by
  corrective feedback is the one mechanism every cited study shares. The back's job
  is to close the loop in seconds; everything else is secondary.
- _Full furigana on the back._ Weak but consistent: `notes-card_format_evidence.md`
  §3 recommends target reading on reveal and a per-user toggle for the rest; no
  peer-reviewed always/back-only/on-tap comparison was found. The player already does
  `ruby: 'all'` on reveal. Harmless, cheap, keep.
- _Tap a word, define it, add it to 覚える._ This is capture, not learning. RESEARCH
  top-five #2 says exactly this: "capture useful reading encounters without
  automatically enrolling them". Supported as long as the tap never grades,
  never enrolls, and is logged separately from scheduling evidence.
- _Japanese explanation beside English._ RESEARCH "Choices reopened" row 3: short
  English gloss visible after the attempt, Japanese explanation nearby,
  Japanese-first preference available; S25 says the same.

**Unsupported but harmless (if it stays behind a tap)**

- Kanji components (S28 label 漢字の形と意味, S38). R15 finds keyword mnemonics
  narrow and costly; components are reference, not memory magic.
- Colour coding by level. RESEARCH: "JLPT and frequency lists are proxies, not
  personal knowledge measurements"; S34: colour is a preference, "not a requirement
  for learning"; F41 already flags tips that promise memory benefits. An N1/N2 hue
  is decoration. A written chip is honest; a hue is not.
- "Recursive" depth (entry → synonym → its kanji → its words). Fine as a reference
  door; no evidence it adds retention per minute.

**Would hurt learning**

1. _Back-side reading cost._ R14 (Nakata): more retrievals raised raw scores, but
   one retrieval was most efficient per minute. Every ALWAYS-visible line on the back
   is paid on every one of ~100 reviews a day. The learner's own F40 session shows the
   cost concretely: a 195-character front put the grade bar at y=947 on a 390×844
   phone. A haywire back pushes the buttons further.
2. _Synonyms on the back of a new card._ R13: semantically related items learned
   together produced more interference, with no relatedness advantage. Showing
   厳しい・苛酷・劣悪 beside 過酷 at first exposure is the condition that study
   warns against. Synonyms belong behind two taps, and only once the card is in
   review state.
3. _Leaking answers across siblings._ S13 and A03 bury siblings because a visible
   passage cues the next card's answer. The current 語の一覧 shows every passage of
   a word with full ruby and English (`mount.js:702`); putting that on the study back
   would pre-expose passage 2 and the 字 host word, and the next "retrieval" becomes
   recognition. Other passages stay off the back.
4. _Tapping deck words._ If the tapped word is another word's T1, the mini shows its
   answer. That is incidental exposure, no worse than reading, but capturing it as a
   new 覚える item duplicates a card (A17). The mini must say "このデッキにあります"
   and link, not capture.

**The English-visibility reversal.** PR #116 (learner: "a simple definition must
be visible on the answer") and this brief ("you have to click and work a little bit
to see the English") are not the same request. #116 was about _confirming_ fast;
the brief is about English _dominating_. The research row quoted above says hiding
clear feedback "can waste time or leave misconceptions unresolved", and a one-line
J-J definition of an N1 word (`defJa` is ~20 characters) is exactly where a quiet
misreading survives if there is no cheap check. Resolution:

- The **per-sense English gloss stays ALWAYS visible**, but it is the last line of
  the feedback strip, after the Japanese definition, in muted small type, ≤ 5 words.
  Eyes land on Japanese first; English is one saccade away, not one tap away.
- Everything else in English (full translation, dictionary senses, grammar `mEn`,
  synonym notes) is ONE TAP or deeper.
- The existing `gloss: 'tap'` preference stays for a Japanese-only session.

This keeps #116's substance (a check that costs nothing) and the brief's substance
(English never leads). Hiding the gloss outright would be a 1-second tap × 100
cards × 365 days to satisfy a phrase the learner said three times not to read
literally.

## 2. Card anatomy spec

Common to all fronts: passage ≤ 220 characters, 24px, native ruby (S36, F40); target
span never tappable, never ruby'd (A04); non-target kanji tap-to-ruby allowed and
logged as `assist` (S26); task chip, 文章 n chip, deck chip; **no level hue** — level
as a written chip only (S34). One reveal control. Grade bar sticky in the safe area,
outside the scrolling text, two buttons (S27, A05, F40).

### Front per task

| Task                                | Front shows                                                                    | Front must not show                               |
| ----------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------- |
| Meaning (文 · 語 / 表現 / 文法)     | Passage, whole inflected target marked (A18); chip 意味; prompt 意味を思い出す | Any hint, reading, gloss, `mJa/mEn`               |
| Cloze (語 / partner-word / chunk)   | Passage with one 〔gap〕; J-definition hint on passage 1 only (REFINEMENT Q5)  | Hint sharing a kanji or reading with answer (A03) |
| Reading (字 reading recall of host) | Passage, host word marked, glyph visible, no ruby on host; chip 読み           | Ruby on the host word; furigana-all preference    |
| 字 cloze (MCD preset)               | Passage, glyph gap, reading hint; chip 字                                      | The glyph anywhere else on the front (A03)        |
| Grammar (文法 targeted meaning)     | Passage, pattern chunk marked as written; prompt ここで何をしている？          | `form`, `mJa`, `mEn`, example sentences           |

### Back layers, in fixed order

Spatial order never changes between cards (S38 "stable spatial placement"). The
learner's "organized" is this list; the "haywire" is allowed only below L3.

| #   | Layer                                                                                                                                                                     | Visibility                       | Data needed · in repo?                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| L0  | Passage recovered, gap filled, target still highlighted, **ruby on every kanji**, every word a tap target                                                                 | ALWAYS                           | `card.ruby` ✓; word-level `tokens` ✗ (see §3)                                                                                                       |
| L1  | **Feedback strip**, pinned directly under the target: term · reading · POS badge · `defJa` (per sense, S20) · one-line English gloss, muted, last · `tip` (register, S10) | ALWAYS                           | `term/reading/meaning/defJa` 323/323 ✓; `tip` 285/323 ✓. 文法: `p · form · mJa` — `grammar-v11.json` has `mJa` 0/24 ✗ (corridor `GRAMMAR` has ~220) |
| L2  | 英訳 full passage translation; 文法: two examples                                                                                                                         | ONE TAP (`details`)              | `card.en` ✓; grammar `ex` ✓                                                                                                                         |
| L2  | **Word mini** on any tapped word: reading, first gloss, 覚 seal, 全項目 door                                                                                              | ONE TAP                          | corridor `lookup()` + dict-v2 (16 shards, JMdict) ✓ in corridor; ✗ standalone                                                                       |
| L3  | 漢字の形と意味: per glyph meaning, on/kun, parts, strokes                                                                                                                 | ONE TAP (ALWAYS on 字 cards)     | `word.kanji` 298/323 ✓; `kanji.json` 2,582 glyphs with `on/kun/parts/rad/kk` ✓; `strokes.json` ✓                                                    |
| L4  | 類語・使い分け with the contrast note; shown only when card state is review (R13)                                                                                         | TWO TAPS                         | `sem.json` edges for **82 words** only, rels syn/ant/reg/fam/col/thm ✓ sparse                                                                       |
| L4  | 同じ字の言葉: other deck/dictionary words sharing the glyph                                                                                                               | TWO TAPS                         | `idioms.json byKanji` ✓; deck index ✓                                                                                                               |
| L5  | Source and licence line                                                                                                                                                   | ALWAYS, small, bottom (S25)      | `card.src` ✓                                                                                                                                        |
| L6  | This word's other passages                                                                                                                                                | OFF on study back; 語の一覧 only | leak (S13)                                                                                                                                          |
| L7  | Mnemonic, audio, pitch                                                                                                                                                    | OFF-BY-DEFAULT                   | none ✗ (S38)                                                                                                                                        |

Budget: L0 + L1 + the grade bar fit a 390×844 viewport for a 220-character passage
with ruby; that is the acceptance test, not a style preference. A Good card should
be gradeable with zero taps and under ~6 seconds of reading.

Changes from today's `answerBlock` (`mount.js:477–496`): gloss moves below `defJa`
and shrinks; `kanjiAnatomy` moves from ALWAYS to ONE TAP (except 字); 英訳 stays a
`details`; synonyms and glyph family are new, gated; the grade bar leaves the scroll.

## 3. Tap a word → define → add to 覚える

**Unit of tap.** `card.ruby` splits at kanji-run boundaries (`["減","へ"],["り、",""]`),
so a tap on 減 today would look up a glyph, not 減る. The build (fugashi/unidic-lite,
already a locked dependency, A14) must emit per-card `tokens` in the article shape
`{s, b, p, r, c}` (`data/articles/*.json`), with `b` the dictionary base, plus a
`g` field for grammar-cue spans (PLAN §2 "detection cue list per point"). Ruby stays
the display source; tokens are the tap source.

**In the corridor.** The player is lazily imported (`corridor.js:10679`) and receives
only `{ deckId, storage, onLeave }` (`:10764`). `lookup()` (`:1501`), `showMini()`
(`:3743`), `renderTakeChooser()` (`:9391`), `commitCapture`, `S.taken` and `S.lists`
are module-private. Rather than reaching across, the host passes one adapter:

```js
render(main, { deckId, storage, onLeave, lexicon: { lookup, isTaken, capture, lists, open } });
```

`lookup(base, seq?)` returns the corridor record; `capture(node, label, lists)` runs
the existing chooser flow (`どこに保存しますか？`, 覚えるの札 always on, named lists,
new-list field); `open({t:'word'|'kanji'|'grammar', id})` navigates to the full entry
(`:8167` and `:7647` already do this for grammar and kanji). The player draws its own
mini in `player.css` so the dialog stays inside the card and survives the player's
full repaint. Capture carries `from: { deck, cardId, passage }` so the 覚える item
keeps its sentence, exactly as reader captures do (`ctxScope: 'sent'`).

**Standalone page** (`__CORRIDOR_STANDALONE__`, no dict index, no `S`). No adapter →
the player falls back to deck-local data: a tapped word that is another deck entry
shows that entry's `term · reading · defJa`; any other word shows its ruby reading
and 「辞書は回廊で」; the 覚 seal writes to `bunki-cloze:<deck>:captures` in
localStorage, included in the backup JSON, importable by the corridor later. Nothing
pretends to be a dictionary it does not have.

**Rules.**

- Post-reveal taps are not assistance (S26) and never touch the FSRS ledger; log them
  as `lookup` events for the learner, not the scheduler.
- Pre-reveal non-target ruby taps are `assist` (A04).
- Capture never enrolls in this deck (RESEARCH #2). A tapped word that is already a
  deck entry shows 「このデッキにあります・文章 n」 with a link, not a 覚 seal (A17).
- Grammar: tapping a `g` span opens the pattern mini (`p · form · mJa`, `mEn` behind
  the same muted rule as L1). Kanji: long-press any glyph inside the word mini →
  kanji mini → 覚 as `{t:'kanji'}`.
- The target word itself has no 覚 seal on the back; it is already this deck's card.

## 4. Two disagreements, stated plainly

1. **English should not take "a click and a little work".** The per-sense gloss stays
   visible, subordinate, last. Hiding it trades a free check for a daily tax and
   leaves J-J misreadings unresolved (RESEARCH row 3, R04/R10 on feedback).
2. **"Haywire" is capped at two layers above the fold.** Synonyms, glyph families and
   dictionary recursion exist, but behind taps and gated by card state (R13, R14,
   F40). Density on the back is measured in retrievals per minute, not information
   per card; the learner can reach any of it, but the default back is a feedback
   strip, not an encyclopaedia.

A third, smaller one: no N1/N2 hue. Levels are chips.
