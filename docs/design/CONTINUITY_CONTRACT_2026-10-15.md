# The continuity contract (the one-hand pass), 2026-10-15

**Why.** John, 10-15: "a jaggedness to it all that just irks me… at every level." 10-08: "why do i feel that
native ios experience is already way smoother and tighter and crisper than almost everything we have?" 10-02:
"fresh, crisp, smooth, elegant, like an apple iOS feel"; "buttons still feel antiquated and not sharp."
09-29: "it all blends together." His word to start this pass: "Ok go" (10-15).

**What it is.** The app was built by many hands over three months; every screen passed its own test and nobody ran
one eye over the whole. This document is that one eye. One design lead (Claude) owns every decision below; workers
implement slices under it; John judges the result on the phone test copy. Nothing new is added until the pass is on
his phone. The worklist with file:line evidence is `~/.dharma/bunki_review/2026-10-15/juncture/one-hand/SEAM_INVENTORY.md`.

**His standing rules this pass obeys.** Keep his current look (no new colour scheme); the word universe stays the
door; the five places stay a test; four colour-coded grades; blood on; a card front stays sealed until answered; the
header icons stay for now (D7); his 10-14 asks: tap ANY word anywhere and cycle through the layers and back; one
Save with a menu inside, never "crowding over" another button; a way to clear the reading.

**Verifier law.** Never loosen a check. Where the design changes on purpose, rewrite the assertion to the new truth as
strictly as before, in the same file, and say so in the commit. Every slice names its verifiers before it starts, runs
them on a built site (`npm run -s bunki:web:build -- --out <new dir>`; `KAIRO_SITE_DIR=<site> KAIRO_BROWSER=chromium`),
and runs one negative control (a deliberate break that must make the verifier fail). Runtime output under `~/.dharma/`.

---

## 1. One word, one slip (the word grammar)

- Every Japanese word, kanji or particle the learner can touch, anywhere in the app (reader, exam paper, quoted passage,
  deck card back, guided session, the Words room, the sky), answers a tap with the **same slip**: one DOM, one stylesheet,
  one behaviour. Name: `openSlip(node, { anchor, from })` in `corridor.js`, exposed as `window.__BUNKI_OPEN_SLIP`
  beside `__BUNKI_OPEN_ENTRY`. The #mini band is the slip; delete the other six builders (inventory §1).
- The cycle (his 10-14 words): tap 1 → the reading appears above the word and the slip opens (word · reading · meaning ·
  Save ▾ · kanji band · sentence row). Tap the **same word** again → the full entry sheet. Tap elsewhere, Close, Back,
  or Escape → the original word, reading removed. Escape steps out one layer at a time. **Closing the full entry also
  clears the reading** (today it does not).
- The headword band is the door into the full entry (chevron ›); there is no "Full entry" button in the slip. The one
  text door "全項目 · Full entry" lives only in the long-press menu. Accessible name on the band: "Open the full entry".
- **Save** is one button, "保存 · Save" → "保存済み ✓ · Saved ✓", everywhere (sheet, slip, menu, deck, guided). Its ▾
  opens the Lists menu **inside the slip, under the button** (Review · lists · + New list · Copy); it never covers
  another control; it works without any `?concept` switch. Delete the `?concept=a|b|c` preview and its palette CSS
  (`rooms/read.css` end block); keep only the inline-menu styling and the tab-bar `:not(.is-inline)` rule from that commit.
- A **card front stays sealed**: on the deck's front nothing is tappable until the answer is shown; on the back every
  word opens the slip.
- Placement: beside the word on wide screens; on a phone the slip sits under the word when there is room, else above;
  it grows from the word (transform-origin at the anchor, 200 ms, the slip ease). The sheet rises from the slip.

## 2. The chrome holds still

- Opening a slip, a sheet, the stroke page or a menu **never re-lays the top bar** and never shifts the page under the
  scrim. Fix: stop toggling `has-primary-tabs` on `S.stack`/`S.strokes` (corridor.js:31692-31695); the CSS
  `:has(#sheet…)` rule hides the tabs; delete the wrap fallbacks (corridor.css:2850, editorial.css:830);
  `--nav-clearance` keeps its value.
- One top bar in every room, including the deck, the stroke page, the guided session and the sheet bar: one height
  (44), one back glyph, one glyph set, one seal. Items 13 of the inventory; the galaxy's own chrome is retired or
  becomes an instance.

## 3. One hand in motion

- **One press:** opacity .55 for 150 ms on every control. Delete scale and translate presses.
- **One easing/duration set:** the V2 names (`--motion-*`, `--ease-*`) with the skin's values; delete the other four
  sets and every literal bezier.
- **Rooms travel along the Line.** One entrance system (the view transition). Going to a tab to the right, the room
  enters from the right (24 px, 220 ms, `--ease-enter`); going left, from the left; `back()` is the reverse of the
  way in. Delete `feel-fade`, both lifts and the per-room entrances. The Line car and the room move together.
- **Things come from where they were:** the shelf picture becomes the reader's picture (shared element); the slip
  grows from the word; the sheet rises from the slip; the deck's next card arrives the way the last one left.
- `prefers-reduced-motion`: every one of these collapses to a ≤120 ms fade, in one rule.

## 4. One material

- **One paper per world.** Delete the generic `--texture-washi` layer (editorial.css:4260 and its three re-declarations).
  `body::before` paints the world's own ground (`--skin-light, --skin-ground, --page`), so 柿渋 is persimmon, 紺紙 is
  indigo. The deck reads the world's tokens (`--kp-bg/--kp-stage` from `--color-*`); it is no longer a dark island.
- **One sheet skin, one slip skin** (inventory 8, 9): one radius for overlays (18 top), one scrim, one rise; delete
  the three stacked skins on each.
- **Eight button families**, written once (inventory §2 table): A Primary · B Secondary · C Quiet · D Glyph · E Door ·
  F Segment/tab · G Grade · H Word. Legacy classes map with `:is()` lists; per-module button CSS is deleted.
  Radius: control 6, card 4, overlay 18, seal 3. Heights: 48 primary, 44 everything else.
- **One type ladder, one ruby:** `--type-*` only; every literal size goes; one `rt` rule (.5 em, native), readings
  never touch (seatReadings from #136 is in the base).

## 5. One voice

- Room names come from one table (`ROOM_NAMES`); the tab, the title and the way back use the same word.
- The house voice (guided-session's "every word is a door", the 一息 line) everywhere; the spec voice goes
  (inventory §7 rows 3–19, 34–39). The honest notes ("written by AI, not yet reviewed by a person", "a guide, not the
  official list") become **one `note` component** with one wording, used by assessment, guided, reference and the sheet.
- One verb for saving; one door label in the menu; sentence case in English, no "test-speak" in Settings.

## 6. Colour: the bar and the table

**His bar (10-08, verbatim), the test every colour decision passes:** "don't stop until you are proud of it and it would
make Dogen and Musashi and Basho and Hakuin to their knees crying at the beauty. As well as all the great 80s and 90s
anime artists and directors. I mean this very very seriously! let's make it epic" — "cyberpunk meets washi", "layers of
depth, clarity, calm balanced with the engaging soothing crisp and deep detailed recursive animation of masters", "a
mixture between ancient japan and cutting edge tech japan". And 10-15: "things can be their own color. That is not a
problem. But the contrast should be deeply considered and have roots in artistic or aesthetic inspiration… Color
gradation throughout the app is actually preferred and can bring deeper focus and texture and professionalism but it
has to be done right… Every design decision should have to pass through that."

**The law.** An overlay (the slip, the sheet, a menu, the picker) may carry its own colour; it may not float with no
relation to the page. Each value is the world's own pigment or a mix of two of them, never a default. Ink on paper
reads at 4.5:1 or better; a band stands as figure on its ground; a gradient is a brush stroke or a lacquer's depth,
never a gradient for its own sake. Every overlay paints opaque paper from a plain value (`var(--color-paper, …)`)
before any colour chain, in every world. `verify-theme-consistency` walks every world and asserts the table below.

**The slip, by day (six worlds).** The head band is the world's ink as a brushed stroke (濃淡): full ink where the word
and its reading stand, washing at its foot to ink 90% + paper where the brush lifts into the slip's paper. The word is
the paper showing through the ink (白抜き). The reading is the world's red lit by its paper (red 40% + paper 60%): the
one warm note, 5.0:1 or better on the ink in every world (the pure red read 1.7–2.7:1). Save is the A family: the
world's 藍, the colour the page already uses for "you can go here" — ベロ藍 names the default world; 藍 beside 墨, on
柿渋 and with 朱 is the dyer's pairing. The sheet's paper is the world's raised paper (`--ground-0`).

| world | band (ink → its foot) | band word | reading | Save (A) | sheet paper | why |
|---|---|---|---|---|---|---|
| 藍 ベロ藍・浪 (default) | #14171d → #2b2d32 | #faf6ea | #dcab9f | #1f3a5f | #faf6ea | the print's key line carries the word (the default world's ink is the R4 skin's #14171d, a step deeper than its block's #1b1f26); the Berlin blue that names the world is its one key |
| 墨 墨・楮紙 | #211e17 → #37342c | #faf6ea | #d6a498 | #2e4d6e | #faf6ea | sumi 濃淡 — ink, then the greys of the lifting brush; bengara thinned by kōzo is the one warm note; 藍 the one cool key |
| 朱 朱・胡粉 | #2b2620 → #403b35 | #fdfaf2 | #dea49b | #2e4d6e | #fdfaf2 | shell-white on soot ink; the vermilion stays the seal's; 藍 keys |
| 赤 凱風快晴 | #45291a → #573c2d | #f8ecdc | #d5a591 | #2a5d8a | #f8ecdc | the umber of Fuji's flank, its red lit by dawn paper; the lake's 藍 keys |
| 柿 焦茶・柿渋 | #2e1a0c → #402a19 | #e6bd92 | #bc805e | #2c3d5c | #e6bd92 | 焦茶 on persimmon tannin; 藍 on 柿渋 is the dyer's pairing (the 藍 a step deeper, 4.5:1 on tannin) |
| 板 板木・墨 | #26221c → #3b3731 | #faf6ea | #dcab9f | #2a5d8a | #faf6ea | the keyblock's sumi line; 藍 is the colour block |

Measured in WebKit (`E/worlds-slip.json`, the contact sheet `E/worlds-slip-contact.png`): every value above, in all
eleven worlds. Receipts (WCAG 2, every day world): band word on the wash ≥ 7.7:1 (柿 the floor; ≥ 9.5 on full ink); reading on the ink
≥ 5.0:1 (柿); Save's word on Save ≥ 6.2:1; Save on the paper ≥ 5.9:1; band on the page ≥ 8.4:1.

**The slip, at night (five worlds).** The band is the world's lacquer: its depth (ground 48% + black) under the word,
its sheen (ground 72% + black) at the foot where it meets the raised lacquer paper, a lit accent hairline on its top
edge so it stands on the dark ground (light is emitted — edges and glows — never a solid phosphor fill). The word is
the world's shell-white or sutra-cream ink; the reading the world's own lit red; Save the lit A (the accent at 9% on
the ground, the accent for its word, its glow).

| world | band (depth → sheen) | band word | reading | Save (lit A) | sheet paper | why |
|---|---|---|---|---|---|---|
| 漆 胡粉・黒漆 | #0b0908 → #110e0c | #f2ecdf | #e0796b | #d9b25f on #282117 | #251e16 | shell-white on black lacquer; the gold is the maki-e key |
| 金 紺紙金泥 | #090c17 → #0e1323 | #f4ecd9 | #ef8079 | #9db8e6 on #1f2840 | #1d2645 | sutra cream on indigo lacquer; 夜's light is 藍 |
| 浪 神奈川沖浪裏 | #08131c → #0c1c2a | #eae6d8 | #e08a6e | #8fb3d1 on #1c3448 | #1a3450 | foam on the deep sea; the spray's blue keys |
| 雷 山下白雨 | #100d09 → #18130d | #efe5cf | #e0796b | #d9a93f on #322816 | #30271b | storm lacquer, lightning gold |
| 殻 攻殻・燐光 | #020609 → #04090d | #d8efe9 | #ff6b4a | #37e8b0 on #0a2120 | #0d1921 | terminal black, phosphor edge |

Receipts (every night world): band word on the lacquer ≥ 13.8:1; reading ≥ 6.2:1; Save's word on its fill ≥ 5.9:1. The
lacquer band sits 1.04–1.23:1 against the night page by design — a lacquer box, not a panel — and stands as figure by
its lit edge, the slip's gold hairline and the raised paper under it.

**What was replaced.** The band had been a fixed 藍 lacquer (#141a28 → #1d2638) with fixed cream (#f3ecdd) and fixed
gold (#e5c27a) in every world; the slip's and the sheet's paper came only through `color-mix()` chains. The grade
pigments, the seal red, the reader's lacquer mat and the toast are untouched.

## Order of slices (one worker each, in sequence on this branch; the lead reviews screenshots between slices)

A. **The word.** §1 for the reader/exam/guided-host lookups (the #mini slip): cycle, clear-on-close, Save ▾ inline
   without the switch, delete `?concept`; §2 first bullet (the top bar holds still); one Save verb and one door label.
B. **The slip everywhere.** §1 routing for the deck back, the sky and the guided session (`openSlip` hook); delete
   their own builders.
C. **The hand.** §3: one press, one easing set, rooms travel along the Line, reduced motion in one rule.
D. **The material.** §4: one paper per world, one sheet skin, one slip skin, eight button families.
E. **The chrome and the voice.** §2 second bullet, §5.
F. **Type and continuity.** §4 last bullet, §3 "things come from where they were".

Each slice ends with: its verifiers green on a built site, one negative control red, a phone-width walk
(390×844, `serviceWorkers: 'block'`) with screenshots in `~/.dharma/bunki_review/2026-10-15/juncture/one-hand/<slice>/`,
and one commit series on `claude/one-hand-20261015`. The lead decides when the branch goes to the phone test copy.
