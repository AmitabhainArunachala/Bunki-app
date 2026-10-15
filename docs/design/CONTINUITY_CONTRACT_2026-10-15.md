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
