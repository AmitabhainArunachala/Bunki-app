# Cards lane: report

Branch `claude/redesign-lane-cards`. Built: concept C's card (the washi sheet on the lacquer stage), with A's 研ぎ出し reveal and B's light bracket, inside the real deck player (`decks/player`). All data comes from the deck and the scheduler. Every id, class and data attribute that a verifier selects is kept.

## What changed (before → after)

**Kotoba player** (`decks/player/mount.js`, `player.css`): n1, n2, senmon, kotoba-mcd, kotoba-mine.

- **Stage.**
  - New tokens: `--kp-stage`, with its own text tokens `--kp-stage-ink` and `--kp-stage-mute`.
  - 和紙 now sets its washi card on a 藍漆 lacquer stage. This is concept C exactly, and senmon opens in this look by default.
  - The other seven looks use their own page as the stage.
  - In the corridor the player now runs edge to edge (`rooms/cards.css`). The 2px side strips and the washi band under the card are gone.
- **Top bar.**
  - The ✕ is bare.
  - The rail is a hairline, cut into one segment per card on sittings of 30 cards or fewer. The `--kp-frac` transform tick is unchanged.
  - 削除 is quieter.
- **Card.**
  - A near-square sheet with トンボ corner marks. The marks are a pseudo-element, so the card's own `background-image` stays `none`. The kind edge is 3px.
  - **Eyebrow:** "Recall the marked word" / 印の語を思い出す, or "…missing word / kanji" in the gap modes, with a 朱 rule.
    - It sits inside `.kp-chips`, which is chrome, so the zero-leak front check still sees no Latin.
  - The passage is in Mincho.
  - **The marked word** gets 朱 corner brackets and a wash.
    - They are drawn as backgrounds, so the word keeps its 44px tap-reach `::before`.
    - Its text colour is still its part-of-speech colour, as pinned.
- **Back.**
  - The headword is in Shippori B1 800 with its reading beside it. defJa is in Mincho.
  - The 英語 fold is a dashed "Show English" slip.
  - **Kanji anatomy:**
    - A 田字格 plate per kanji, built from the deck's own `kanji` data (c, m, st, parts).
    - When two of the word's kanji really share a part, that part is lit on both plates and a bracket line joins them, e.g. 木 in 集積. This is real for 21 of the 323 kotoba-mcd words. Nothing is guessed.
    - Same-kanji siblings are the existing 同 links, which only list the learner's own words.
  - Readings are `max(11px, .5em)` with no extra tracking.
- **Grade pads.**
  - Panel slabs with relief; Again has a red top rule.
  - In 日本語 each pad carries a seal glyph, 再 or 良, in Kaisei Tokumin (`aria-hidden`). EN has no glyph, and no seal carries Latin.
  - The intervals are the real `preview()` FSRS waits.
  - The room reserved under the passage is the bar's measured height plus 12px.
- **Motion.** Transform and opacity only, inside the pinned 180ms reveal budget, and off under reduced motion.
  - **研ぎ出し:** a polish band crosses the card in 180ms. Each reading fades in 120ms after a 0–60ms delay that follows its x position and its line, so the readings surface in the band's wake.
  - **Again:** a brief 朱 slash crosses the screen (`.kp-slash`, 180ms, inert, then removed).
- **Session close.**
  - It opens at the top with:
    - the eyebrow "Session complete";
    - the heading "The surface is clear." / 机の上は、空になった。;
    - the words of this sitting rising, with the Again ones in 朱;
    - Kept / Again / Time, from `ui.right`, `ui.done − ui.right` and the elapsed time since 始める;
    - the recall rate and the number of answers;
    - the real next-review line;
    - one door, デッキに戻る (`#kp-home`), plus ↶ undo.
  - Undo restores this sitting's log as well.
- **Home.** Paper slips, a Shippori title and numbers, and a pressable primary.

**Personal collections and 文脈札.** Readings never render below 11px (`max(11px, …)`).

## Honest limits

- **Four grade buttons in the Kotoba player: not done.**
  - `verify-kotoba-mine` pins exactly two pads: `n === 2`, no `#kp-grade-hard` or `#kp-grade-easy`, labels "Again/Recalled". This follows CARD_CONTRACT_V2 §4.
  - Four would weaken a behavioural pin, so the player keeps two honest pads with real intervals.
  - Four pads already exist in the personal collections and in the corridor review (the Today lane).
- **The washi card exists only in the 和紙 look.**
  - Most decks open in other looks: n1, n2 and mcd in 藍; kotoba in 墨. Those keep a dark card.
  - A washi card on a dark page cannot meet contrast-kotoba's floors: no ink reaches 7:1 on washi and 4.5:1 on lacquer at once.
  - No look was added and no default was changed: deck defaults are build outputs, the count of 8 swatches is pinned, and the kotoba `dark` look is pinned.
- **Kanji anatomy stays in its fold,** closed on a 語 card (pinned).
- **Part meanings are not shown.** The deck has glyphs only.
- **Base stretching under long readings remains in places,** e.g. 招集 or 力関係 at the 11px floor.

## VERIFIER_CHANGES

None. `contrast-kotoba.mjs` was **extended**: a new `stage` row (stage ink and stage mute on `--kp-stage`, ≥ 4.5) means the new stage colours are measured from player.css. Every theme clears it; the lowest is 6.34.

## Verifiers

All runs used a clean committed tree at e46bc73a, built to `/root/.dharma/cards/c3`, Chromium only.

| Verifier | Result |
|---|---|
| vitest tools/kotoba-*.test.mjs + sw-shell | PASS, 240 passed, 4 skipped |
| contrast-kotoba | PASS, every pair, stage row included |
| verify-kotoba-mine | PASS, all checks green |
| verify-n2n1-decks | PASS |
| verify-personal-collections | PASS |
| verify-corridor-storage-integrity | PASS |
| verify-theme-consistency | PASS |
| verify-relief | PASS |
| verify-corridor-accessibility | PASS |
| lint-ui-language --core-only | PASS |
| verify-redesign-docks | Chromium 12/12 PASS. The WebKit half cannot launch here (no webkit-2359 in this container), as in the Skin report. |

The first verify-kotoba-mine run failed 4 checks, all fixed before the final run:

- the tap reach (the passage size was restored);
- the chip row on one line, front and back (the card's padding was restored);
- the term and definition on the first screen with a leech ladder (the reading went back beside the term, and the pad height was restored).

## Evidence

- `before-mcd-*`: base build 98582fef (藍 look).
- `after-*`, from the final build:
  - decks: senmon (和紙 on lacquer, the concept look) and mcd (藍);
  - day (default world) and night (yoru), EN and 日本語;
  - states: home, front, back and done.
- `after-motion-polish` and `after-motion-slash`: the band and the 朱 slash, frozen at 70ms.

The player's look is chosen per deck, not per world, so day and night differ only in the chrome.
