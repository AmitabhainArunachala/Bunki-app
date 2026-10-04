# Refinement of the 2026-10-04 review

Lead reviewer's pass over [REVIEW.md](REVIEW.md), [FIX_PLAN.md](FIX_PLAN.md) and
[STANDARD.md](../STANDARD.md) after three independent critiques (method, engineering,
content and rights). Where they disagreed, this file decides and says why. Claims were
re-checked against the working tree at `c55f0d07` unless marked "not re-verified": scans
over both built `deck.json` files and the source JSON, licence trailers fetched from the
`aozorahack/aozorabunko_text` mirror. Accepted rule changes are appended to STANDARD.md
("Amendments (refinement 2026-10-04)"); the repair list is in the structured output that
accompanies this file; section 6 lists what is deferred.

## 1. Verdict on the review

The review is sound in its two most important calls: progress can be lost (F01, F02) and
the shipped decks teach some wrong material (F15–F18). Its severities drift in both
directions: F03 is not a blocker, F16 is a nit, F10 should be Major, and the rights
picture is at once better (Tomita is CC BY) and worse (five Aozora records are ND or
NC-ND) than stated. Its largest gap is structural: every 字 card and 322 of
323 MCD anchor passages are written text, the sibling chain puts 字 cards in front of the
second real passage, and the leak count is 121, not 12. The standard converts an open
question (MCD or 文 first) into a default, which the learner's brief does not allow.

## 2. Confirmed, with corrections

All three critics confirmed F01, F02, F04–F10, F15, F17–F19, F24, F26, F29, F30, F34–F38,
F40, F42–F44, F47, F49–F55, F57 and F58. Corrections that change what the fix must do:

| ID  | Decision                     | Correction and evidence                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Blocker, confirmed           | Realistic triggers are Safari private mode, `file:` origins and storage eviction, not quota on a 1 MB ledger. `writeJson` (`mount.js:59–66`) returns false; `save()` discards it; `commit()` (`:447–460`) advances regardless.                                                                                                                                          |
| F02 | Blocker, confirmed           | An empty textarea is safe (`JSON.parse('')` throws). `{}`, `[]`, `null`, `{"cards":{}}` and any valid backup with no cards pass the guard at `mount.js:622`. Unstated and larger: 復元 replaces the whole ledger with no preview or snapshot, so an older valid backup silently discards newer reviews.                                                                 |
| F03 | Downgraded to Major          | Only `log` is sliced to 5,000 (`engine.js:93,213`); every card's FSRS state survives. Lost is revlog beyond about three months, which matters for optimiser fitting, not the schedule. Deferred to FIX_PLAN 8a.                                                                                                                                                         |
| F05 | Downgraded to Minor          | `mount.js:467–468` re-inserts a learning card four positions ahead whenever its due is under 15 min. Anki's learn-ahead applies only when nothing else is due, so this is a trigger bug; the in-repo research says same-day repeats contribute little. The buttons still promise 10分.                                                                                  |
| F07 | Major, scope narrowed        | Only a backward step that makes the integer day delta negative throws (`Invalid delta_t "-1"`); hours back inside the same day do not. Then the grade handler throws, nothing saves, and the card cannot be graded until the clock passes `last_review`. `fsrs-pin.json:42` declares the clamp; only `corridor.js` implements it.                                       |
| F08 | Major, reframed              | The 3/14-day and 6-lapse numbers implement the repo's own research recommendation (`report-sentence-mining-deck-design.md:90,124`) and `engine.js:17–22` labels them policy. The real defects are `engine.js:236–240` (lapses summed across siblings) and `:134` (the failing card stays active while a sibling is added). See N04.                                     |
| F10 | Raised to Major              | The deck's method text (`build.py:253`, shipped as `method[6]`) promises 「もう一度／覚えた」の二択 while `mount.js:436` renders four buttons; Hard counts as not-correct (`:454`). Shipping what does not match the stated method is a recurring learner complaint.                                                                                                    |
| F12 | Blocker reassigned           | 富田倫生's works are CC BY 2.1 JP: the text-file trailer says so (verified, `cards/000055/files/365_txt_185`). The defect is the "public domain" label and missing attribution (Major). `mine_aozora.py:27–31` cuts the text at 底本： and discards the licence line. The blocker moves to N07.                                                                         |
| F13 | Blocker for a public profile | 191 MCD + 39 文 livedoor (CC BY-ND) records carry a translation and a cloze rendering; 223 "web quotation (personal study)" records; one WRIME record. 著作権法30条 covers all of it for the learner's own study, so the fix is a public/private build profile, not a hold. `export_mined.py:33` still invents "quotation (personal study)" for unknown sources.        |
| F14 | Major, widened               | One example-bank label carries three licences and no sentence IDs; Wikinews and Wikipedia records have `url: ''`; every Aozora URL is the author directory; the author is read from line 2 of the text file, which for works with a subtitle is not the author (『緋のエチュード』 is credited to "A STUDY IN SCARLET").                                                |
| F15 | Major, count corrected       | The 12 MCD word cards reproduce exactly. In addition 103 字 cards show the blanked kanji elsewhere on the front (target glyph anywhere outside the gap; the content critic's stricter rule counts 99) and 6 文 cards repeat the form (`km-109-2, 220-1, 062-1, 255-2, 035-1, 245-1`), leaking in 穴埋め. Cause: `build.py:355` masks `ja.index(form)` only.             |
| F16 | Downgraded to nit            | 「公転面に対しておよそ23.4度傾いている」 is the conventional elliptical phrasing in educational text. The precise wording is a cheap improvement, kept in the repair list, but not a top-five risk.                                                                                                                                                                     |
| F17 | Major, systemic              | The five cases are tokeniser classes: nationality 人→にん (about 16 fronts), 他の→た (6), adverbial 一日→ついたち (5), 〜の方→ほう for people (5), 恋愛上手→かみて. `fugashi`/`unidic-lite` reproduces each; `build_corridor.py:231–247` copies `feat.kana` and the override lexicon has no entry for them.                                                             |
| F23 | Split                        | km-314 P1 (訴額 140万円) is the ordinary statutory statement; nit. km-250 P1 attributes the husband's-surname rule to 皇室典範; genuine mis-attribution, Major, fixed in the repair list by narrowing the sentence to what 皇室典範 does say.                                                                                                                           |
| F24 | Minor, quantified            | 45 MCD passages are single sentences, 39 under 60 characters, and 45 are byte-identical to the word's own 文 card (N09). `REVIEW_MCD.md:3,13` caused it.                                                                                                                                                                                                                |
| F35 | Major, surfaces specified    | Light and sakura fail on the card panel (gloss/Good 4.14, Hard 3.99; sakura Hard 4.24, badges 4.48); Codex's Good 3.57 is the same token on the tinted button, the right surface. Washi passes every token on the panel; if it fails it is on the page background or under texture, and the finding must say which.                                                     |
| F38 | Major, sharpened             | `choicesFor(word)` (`mount.js:266–277`) always offers whole terms, so a 字 card showing 市の〔ざい〕政 is answered by matching the visible 政. It is a zero-retrieval task that writes Good.                                                                                                                                                                            |
| F49 | Major, effort XS             | `corridor.js:2250,2348` fetch the pin and import ts-fsrs at every boot, so both are runtime-cached from the second online visit. The failing window is a first visit followed by going offline, which is exactly a home-screen install; Major stands. The fix is two SHELL entries and a VERSION bump; Pages already copies `vendor/` and `data/` (`pages-app.yml:82`). |
| F53 | Major, sharper               | `verify-kotoba-mine.mjs` is in no workflow; `verify-corridor.mjs` never touches the player; `vitest.config.ts` excludes `prototypes/`; `index.html:57` registers the worker only over https. The player and `sw.js` have zero automated coverage on pull requests.                                                                                                      |
| F56 | Confirmed, detail corrected  | Chen, Miller & Ke 2026: d = 0.444, 95% CI [0.329, 0.559]; "15 + 5 effect sizes" was the pre-removal count. The "never two kanji" byline is rigabamboo, not Khatz.                                                                                                                                                                                                       |

Not re-verified here: F11, F20–F22, F25, F27, F28, F31–F33, F39, F41, F45, F46, F48.

## 3. Disputed items, decided

**S01 default preset.** The method critic is right. `RESEARCH.md:17` says no winner is
established; the brief (`CODEX_REVIEW_PROMPT.md:401–403`) says explicit choices are
challenged with evidence, as a question. A standing rule that opens with "Proposed
default: targeted meaning retrieval" is neither. S01 is amended to name two co-equal
presets and record the default as a learner decision; the recommendation stays in
FIX_PLAN. F57 stands as a workload judgement.

**S12 字 opt-in.** Rejected as written. 字 cards are the most AJATT-faithful element in the
repo (Khatz's 2017 format keeps the furigana and hides the kanji). The measured defects are
cost, the 103 leaks, the guessed alignments (F18) and the all-written 字 layer (N01); those
are fixed without opting the type out. 字 stays default-on under the MCD preset with a
per-deck switch; whether it stays is a learner question.

**F03 severity.** Engineering critic wins; see table.

**F05 severity.** Both critics agree on Minor; adopted.

**F12 Tomita.** Content critic wins; verified against the file trailer.

**F16 severity.** Content critic wins; nit, fix kept.

**F35 washi.** Engineering critic wins; the finding must name the surface.

**F49 effort.** Engineering critic wins; XS, Major kept.

**RESEARCH "overgeneralises van den Broek 2018".** Method critic wins: the paraphrase is
the paper's title. The valid addition is the 2022 boundary condition (informative context
can beat retrieval under weak encoding), stated as an addition, not as a flaw.

**F23 訴額.** Content critic wins; nit.

**Where critics overlapped on the same new finding** (leak counts, 字-before-語 chain, the
Tanaka corpus), the stricter, verified number is used below.

## 4. Added findings

| ID  | Severity                | Finding and evidence                                                                                                                                                                                                                                                                                                                                                            |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N01 | Major                   | Every 字 card and 322/323 MCD anchors are written, not mined (`deck.json`: 字 from original passages 654, from real 0; passage 1 `kind=original` for 322 words). `REVIEW_MCD.md:62–63` tells writers to put the clearest passage first, "often your written one", and `build.py:235–236` restricts 字 to passage 1. Requirement 3 is "write originals only where mining fails". |
| N02 | Major                   | `refill()` (`mount.js:258–264`) splices a newly due learning card at `ui.pos` on every paint, including the paint after reveal or a furigana tap. The card under the learner changes while `ui.revealed` is true; the next grade applies to the wrong card.                                                                                                                     |
| N03 | Major                   | `build.py:225–242` numbers cards [語p1, 字, 字, 語p2, 語p3] and `engine.js:125–135` chains each card on the one before it. 288/323 words gate the second real passage behind every kanji card of passage 1; measured Good→Good gives stability 2.31 d (< 3), so passage 2 opens after one to two weeks at best.                                                                 |
| N04 | Major                   | ts-fsrs increments `lapses` only in review state; a card failed repeatedly in the 1m/10m steps keeps `lapses = 0`. `engine.js:134` (unlock after 3 lapses) and `:240` (苦手 at 6) are blind to the commonest failure, and a stuck learning card blocks every later sibling forever.                                                                                             |
| N05 | Major                   | On the 文 front the target's reading is one tap away: `sentenceNodes` (`mount.js:119–129`) makes every kanji segment tappable under the default `furigana: 'tap'`, including the target. The deck's method text (`build.py:45`) promises 「英語も読みも出ない」.                                                                                                                |
| N06 | Major                   | The 語 cloze hint is `word.defJa` on every passage (`mount.js:311`); 131/323 definitions share a kanji with the answer (金利 ← 「お金を貸し借りするときの利息の割合」). After passage 1 the hint alone retrieves the word. Default hint policy is a learner question; the validator is not.                                                                                     |
| N07 | Blocker, public profile | Five shipped Aozora records are ND or NC-ND and labelled "public domain": 片岡義男『七月の水玉』 (CC BY-NC-ND 2.1 JP, trailer verified) and 『東京青年』, 鶴岡雄二『45回転の夏』 ×2 (NC-ND per the content critic's local checkout; not re-verified here), 小泉八雲『赤い婚礼』 (CC BY-ND 2.1 JP, verified).                                                                    |
| N08 | Major                   | New cards are introduced in deck order (`engine.js:177–185`), which is module order: the first 32 new words are all m01-money. R13 (Nakata & Suzuki 2019), which the review cites, reports more interference for semantically related sets learned together.                                                                                                                    |
| N09 | Major                   | 45 MCD passages are byte-identical to the word's own 文 sentence, 20 with a different English translation; with both decks studied side by side the learner drills one sentence under two ledgers.                                                                                                                                                                              |
| N10 | Major                   | `rank.py:142–143` rejects a candidate when any token is tagged 文語, including the target itself (由々しき, ごとく, 〜たる, 〜ざる): km-183 pool 24, passed 0. Six words are all-original in both decks; 29 MCD words are all-original.                                                                                                                                         |
| N11 | Major                   | Private individuals' social posts ship with their URLs (km-245 S1 an x.com status, km-044 S1 an Instagram reel, plus note.com, ameblo, chiebukuro records). `REVIEW_MINED.md:5` bans a private person's name; the URL identifies the author just as well.                                                                                                                       |
| N12 | Major                   | No workflow runs the deck verifier; Safari can evict the ledger after seven days without interaction and nothing calls `navigator.storage.persist()`.                                                                                                                                                                                                                           |
| N13 | Minor                   | 16 文 and 4 MCD forms are cut at the tokeniser boundary (勝ち残っ); the blank reads 〔 〕た. 41% of 文 anchors are unchecked Tanaka/Tatoeba rows the research said to rank lower.                                                                                                                                                                                               |

## 5. Learner questions

Only decisions that change what gets built, each with the reviewer's recommendation.

1. **Public or private?** On your own devices 著作権法30条 covers the livedoor, web-quotation
   and ND Aozora material. On GitHub Pages or as a shared `.apkg`, about 458 records must
   be excluded and attribution shipped. Recommendation: private profile now, public later.
2. **Default preset for new words:** MCD-first (about 5 cards/word) or 文-first (about 1.6)?
   No study in `docs/srs/research` shows either learns Japanese better.
3. **Unlock order:** should the second real passage open independently of the 字 cards?
   Recommendation: yes.
4. **字 cards:** default under MCD, or opt-in? Recommendation: keep, once the 103 leaking
   cards are retired.
5. **語 hint:** Japanese definition on every passage, first passage only, or none?
   Recommendation: first passage only.
6. **文 contract:** meaning only, or meaning and reading? Recommendation: meaning only; the
   target is never tappable before reveal.
7. **Restore:** replace after a confirmation naming both counts now, merge later.
   Recommendation: as stated.
8. **Learning steps:** honour the 10-minute step, or keep "back after four cards" as a
   labelled setting? Recommendation: honour the due time.
9. **New-card order:** topic blocks, interleaved, or lookup order? Recommendation:
   interleaved.
10. **Duplicate lexemes** (栞/しおり and 12 more pairs) and the 45 MCD passages that repeat
    the 文 sentence: merge and delete? Recommendation: yes to both.
11. **Accepted alternatives:** exact source word, or natural Japanese that fits?
    Recommendation: accept reviewed alternatives.

## 6. Deferred from this run, and why

The repair list (structured output) has seven steps covering F01, F02, F07, F12–F18
(labelling and quarantine only), F23, F26, F34–F38, F40, F42, F49, F51, N02, N05, N07,
N11 and N12. Deferred:

- **F03, F11** (event-sourced history): no progress is lost today; needs the shared
  adapter (FIX_PLAN 8a).
- **F04, F06, F08, F09, N03, N04, N08** (contracts, cross-reopen burying, typed unlock
  chains, lapse counting in learning state, global budget, interleaving): change which card
  appears next and depend on learner questions 2, 3, 8 and 9; nothing is lost meanwhile.
  FIX_PLAN 7 and 9.
- **F05**: Minor; belongs with FIX_PLAN 7's fake-clock tests.
- **F19–F22, F25, N06, N09, N10, N13**: sense identity, duplicate lexemes, ranker false
  matches and the 文語 filter need re-mining or a native editorial pass; code alone would
  ship new unreviewed Japanese. Validators for N06 and N09 go with FIX_PLAN 5.
- **F14 corpus IDs, F17 full watchlist review, N01**: need the mining checkout and learner
  question 3; the enumerated ruby classes are fixed in this run.
- **F27–F33, F39, F41, F43–F48, F50, F52–F55**: reproducibility, Anki settings, registry,
  CI and update coherence lose nothing and teach nothing wrong; FIX_PLAN 11–13. Adding
  `verify-kotoba-mine.mjs` to `corridor-gate.yml` is the one XS item worth doing early.
- **Rights clearance and native sign-off**: people, not code.
