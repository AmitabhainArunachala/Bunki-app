# Round 4 · skin lane plan (the global look)

Branch `claude/r4-skin-20261009` from `345dba92`. Base build `site-base` (artifact `23ccb8bc…`): all seven lane verifiers pass (relief, theme consistency, accessibility, language core, foundation, experience 42/42, corridor 259/259). Base shots: `~/.dharma/bunki_review/2026-10-09/r4/skin/shots-base/`.

**What I own:** the token values at the end of `editorial.css` (a new fenced R4 block after the existing skin, polish and shell blocks), `corridor.css`, `register.css`, the shell in `corridor.js` (top line, the Line, header icons, theme picker), `LABELS.md`. **What I don't touch:** room structure (`rooms/*.css` belong to read, today and cards), storage markers, `fsrs-pin.json`, card ids, `bunki-cloze:*`, `decks/n2n1/source/**`, `drift-layer.*`.

## His lines in my scope → the change → the verifier that proves it

### T2: "this new build could even be sharper and cleaner. why do i feel that native ios expeirnce is alreayd way smoother and tighter and crisper than almost everythign we have?"
- **Tight type:** UI text on the system face at iOS sizes (17 title, 15–16 body, 13 footnote, 11 caption); eyebrows lose their wide tracking (0.14em → 0.06em) and gain weight; titles keep Shippori 800 but tighter leading.
- **4/8 rhythm and hairlines:** separators are true 0.5px hairlines; relief surfaces keep their 1px edge.
- **Instant press feedback:** one passive `touchstart` listener so iOS Safari applies `:active` at all; every button, row and tab dims or presses down at touch-down (0 ms in, ~150 ms out); primaries travel 1px. No grey tap flash.
- **Short spring-like motion:** `--ease-standard` becomes an ease-out-quart curve; sheets use the iOS sheet curve `cubic-bezier(.32,.72,0,1)`; press 80 ms, quick 150 ms, standard 200 ms, sheet 320 ms. Reduced motion still turns it all off.
- **Proof:** screenshots at 390×844 beside the before shots; `verify-corridor-accessibility` (44px hit regions, contrast, reduced motion), `verify-redesign-foundation` (tabs, docks, no horizontal scroll), `verify-experience` (E19 header 44px).

### The common thread (T4, T5, T8, T9 read app-wide): "it all blends together" · "the top header, the background of the picture, th etitle … and the bottom are all the exact same make me wanna puke beige" · "more sharp, more depth, more contrast, more distinction" · "more clarity, more crispness, more tightness"
- **Separation by material, not one beige.** Day: the bars (top line and the Line) become bright 胡粉 paper on a crisp hairline; the page becomes a cooler, less yellow washi with a finer, truer fibre; raised cards become clean white paper with a defined edge and a two-step shadow (contact plus ambient). Night: the bars are the deep frame, the page the world's ground, and raised surfaces step up in light with a lit top edge.
- **Ink near-black on paper:** the default ink darkens toward sumi; secondary text, eyebrows and captions move up the ink ramp, so nothing reads washed out (every quiet label stays ≥ 4.5:1).
- **Proof:** `verify-relief` (edges ≥ 1px at ≥ 25% alpha plus a lifting shadow), `verify-theme-consistency` (world grounds untouched; now also 殻), `verify-corridor-accessibility` (quiet labels ≥ 4.5:1 in all eleven worlds, the living-paper law), and the before/after screenshots.

### D2 (The night look): "Offer both"
- `kaku` (殻 · electric phosphor) joins `PUBLIC_THEME_IDS` beside 金 (the 藍 night, `yoru`); a saved `kaku` keeps working as before.
- The picker becomes two labelled rows, **Day** and **Night** (昼 · 夜), so both night looks are visible side by side.
- **Proof:** the roster pins in `verify-experience` (E04) and `verify-writing-room` change from the ten to the eleven, logged in `VERIFIER_CHANGES.md`; `verify-theme-consistency` gains `kaku`; `verify-corridor-accessibility` already measures `kaku`.

### D3 (The name): "回廊 KAIRO"
- The remaining visible "Bunki" captions change: the reader's picture credit, the shelf's "New to Bunki" sort, the guided session's eyebrow and credit, the grammar-held reason, the report sheet, the reference note, two deck-player notes. Repository, storage keys and `bunki-*` ids stay.
- **Proof:** `lint-ui-language-core` (no CJK in EN chrome: 回廊 carries `lang="ja"` as a named mark), `grep` of the built site for visible "Bunki" strings.

### D7 (The header's Learn / Lists icons): "Keep them for now — figure out the smartest way to work with this"
- **Kept** in place with their ids, 44px boxes and texts (≈60 verifiers click them).
- **Quieter:** one small tools group, lower-contrast glyphs, tighter spacing, set off from the preferences by a hairline.
- **Smarter:** each shows what the tab bar can't. The Learn cap carries a small ink dot when cards are due (its name says how many); the Lists bookmark shows its count only when you have saved words, and is a quiet outline at 0. The current room's door is marked.
- **Proof:** `verify-corridor` (`#tray` still reads `Lists N`), `verify-redesign-foundation`, `verify-experience` (header 44px), screenshots.

### Plain words (the common thread, T2 and T5 named three)
- `LABELS.md` holds the glossary for every lane. In my files: the Learn room's coined labels (no lane owns Learn; T7 said carry on), Learn's deck names, the shell's names (`#tray` 覚 → リスト, the theme seal).
- **Proof:** `lint-ui-language-core`, `verify-corridor`, screenshots in EN and 日本語.

## Order of work
1. Tokens and materials (R4 block in `editorial.css`), build, shoot, look.
2. Shell: press feedback, D7, D2 picker, D3 captions, Learn labels; build, shoot, look.
3. Refine twice against his words and THE BAR.
4. Final run of the seven lane verifiers (plus `verify-writing-room` for the roster pin), compare with the base, fix what I broke, `REPORT.md`, final shots.
