# Round 4, cards lane: the plan (2026-10-09, written 23:06 JST)

Worktree `r4-cards_20261009`, branch `claude/r4-cards-20261009`, started at `345dba92`.
His answers are quoted word for word, typos kept. Under each: the change, then the check that proves it.

## T2 (the deck home)

> this is nice, but things like *Real Sentences read and recall.. is just very confusing, obtuse and way to generic to mean anyhting at all...   the english is clean though and more understanaalbe, I did like the color of the other side an dthe four windows but maybe not so big.  also, this new build could even be sharper and cleaner.  why do i feel that native ios expeirnce is alreayd way smoother and tighter and crisper than almost everythign we have?

- **The name.** The 323 words in both 言葉の鉱脈 decks are the words he looked up in the Japanese app (`decks/kotoba-mine/README.md`). So the plain English names are **Words you looked up · sentences** (`kotoba-mine`, one real sentence per card) and **Words you looked up · passages** (`kotoba-mcd`). The names change in the deck data (`titleEn`), in `build.py` (so a rebuild keeps them) and in the Learn list (`DOJO_DECKS`). The Japanese names stay as they are.
- **The four windows.** Under the name: four small tiles, Due · New · Known · Difficult, with each number in the old home's colour (amber, ink, green, red). They sit in one row, about 60px tall. The old ones were a 2×2 grid, each about 170px tall.
- **Sharper and cleaner.** Tighter type and spacing, hairline rules, and instant press feedback on every key.
- **Proved by:** the deck-home shots in day-en, night-en and day-ja; a new verify-kotoba-mine check that the four tiles carry the queue's counts in order; lint-ui-language-core (no Japanese in English chrome).

## T8 (the front)

> More sharp, more depth, more contrast, more distinction.

- **The study stage sits deeper than the page, and the card stands off it.** 墨 gets a darker stage, a crisp light edge on the card and a real shadow. 藍 by day was a lacquer band over the washi page, so the card sat half on lacquer and half on paper. Now the whole study screen is the 藍漆 lacquer stage and the washi card is the lit sheet on it, as 藍 already does at night.
- **The head.** The instruction comes first, then the facts as one quiet line. Only the kind (WORD) is boxed and only the level keeps its tint. The トンボ corner crosses go, because at phone size they read as stray marks.
- **The passage.** Full-strength ink, and a little heavier.
- **The key.** 答えを見る becomes one clear key framed in the deck's accent, as on the old home.
- **Proved by:** the deck-front and n1-deck shots; contrast-kotoba (every pair over its floor, now with the new hue); the verify-kotoba-mine visual checks (kind edge and chip, level chip, target colour, no texture on the card, the chips on one row at 390, the front pin).

## T9 (the back)

> same as above, needs more clarity, more crispness, more tightness.

- **The answer.** It opens under a crisp rule. The word, its reading and its part of speech sit on one line, with the Japanese definition in full ink under them.
- **The folds.** They become one grouped list, every row the same: 44px, the label on the left and a chevron on the right. English is the first row instead of a dashed slip of its own.
- **Proved by:** the deck-back shots; verify-kotoba-mine's back hierarchy (fold order, tier one has no English, the 44px reach, nothing cut by the pinned bar, the first screen with the ladder shown).

## D1 (the grade buttons)

> Four (Again · Hard · Good · Easy) — and color coded

- **Four pads in a row.** They read Again · Hard · Good · Easy, or in Japanese もう一度 · 難しい · 正解 · 簡単 with the seals 再 難 良 易. Each grades FSRS 1 · 2 · 3 · 4 and has the key 1 · 2 · 3 · 4.
- **Each pad shows its real interval,** the engine's `preview()` under the pinned parameters.
- **The colour is restrained.** The hue sits on the word and on a 2px top edge: red, amber, green and blue. Only Good, the expected answer, is tinted, as before.
- **Hard is a pass.** In FSRS it means recalled with effort, not a lapse, so the sitting's Kept count and recall rate include it.
- **Swipe stays.** Right is Good and left is Again.
- **The written rules move with the buttons.** The method text in 設定 names the four. The contract gets a dated amendment: `docs/srs/CARD_CONTRACT_V2.md` §4, plus a standard amendment A53 that replaces A29's two-button rule.
- **Storage stays compatible.** No ledger field changes. A log row was always `[cardId, rating, iso]` with a rating from 1 to 4, so a ledger written by the two-button player loads unchanged. The `bunki-cloze:*` keys, card ids, `data/fsrs-pin.json` and the engine are untouched.
- **Proved by:**
  - verify-kotoba-mine's grade-bar check, rewritten deliberately and logged. It checks the four labels in order, the ids, that each interval equals the engine's preview, that keys 1–4 write ratings 1–4 to the ledger, that the bar stays fixed and that a stored `grades` pref changes nothing.
  - A new check that a ledger written by two buttons loads and takes a Hard.
  - verify-redesign-docks: four pads docked above the tab bar.
  - contrast-kotoba: each hue on its pad.

## D4 (the samurai on a wrong answer)

> Blood

- **What changes on the incorrect cut only** (`guided-moments.css`): the blade's wake turns crimson past the cut, a fan of 臙脂 drops sprays from where the learner stood, one dark-red frame flashes inside the blackout, the paper scraps carry the stain, and a pool spreads on the ground line.
- **The register.** Flat woodblock colour with crisp edges and no glow, in the 80s and 90s anime style: the red frame and the slow drops.
- **The limits.** Quiet mode and the rematch get no blood. Transform and opacity only. Under reduced motion a forced replay jumps to the still end.
  *Corrected 2026-10-09 (review and refine): a forced replay under reduced motion is not a still. Only the guided session's replay and demo buttons force one, and each blood part then plays at its own `--samurai-motion` length, 320 ms (the red frame) to 1,000 ms (the pool, which starts 250 ms in). On its own the moment never plays under reduced motion.*
- **The age rating** (likely 12+, or 13+ on Apple's new scale) is noted in the REPORT.
  *Corrected 2026-10-09: Apple's scale is now 4+, 9+, 13+, 16+ and 18+, so 12+ no longer exists. Blood on every wrong answer is likely "Frequent Cartoon or Fantasy Violence", which is 13+. That is an estimate, to be checked in App Store Connect's questionnaire before any store submission, and whether to ship it is his call. The note sits beside the blood in `guided-moments.css`.*
- **Proved by:** verify-guided-session's M checks (the cut still plays, its phases occur and the saved response is untouched), plus frame captures of the cut at 390×844.

## Carry on (no answer): T7 (Learn), T11 (the 2,000 cards)

The same contrast and crispness pass reaches the N1, N2 and 専門 decks through the shared player. I photograph Learn but don't redesign it; its only change is the two plain deck names.

## Verifiers (base = `site-base` at 345dba92, then final)

verify-kotoba-mine, verify-n2n1-decks, verify-personal-collections, verify-dojo-door, lint-ui-language-core, verify-corridor-accessibility and sw-shell. On top of those I run verify-redesign-docks (it pins two pads) and verify-guided-session (the samurai), base and final.
