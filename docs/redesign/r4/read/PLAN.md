# Read lane, round 4: the plan

**Lane:** read (T3, T4, T5). **Worktree:** `~/worktrees/Bunki-app/r4-read_20261009`, branch `claude/r4-read-20261009`. **Start:** d98cbd3a. The cloud's r3-read landed on `claude/redesign-20261008` at 23:13 JST and was fast-forwarded in (picture → title → one instrument line, a centred popup with one Save, the shelf's head). The brief's base, 345dba92, is kept for attribution: its build is byte-identical to the tour John saw tonight (artifact `23ccb8bc…`). Verifier tags: `-base` = 345dba92, `-start` = d98cbd3a, `-final` = this lane's last commit.
**Owned files:** `prototypes/corridor/rooms/read.css`; in `corridor.js`, the shelf, the reader and the word popup (`showMini`, `miniKanjiWeb`, `readerSentenceRow` and their helpers).
**Not touched:** the app's top bar and tab bar (skin lane), Tokens v2 (skin), storage and record markers, fsrs-pin, card ids, deck sources.

The three lines below are John's, word for word, typos kept. Under each: what changes, then what proves it.

---

## T3 — Read: a woodblock magazine

> **Close, needs work** — Why is the Water kanji the marker for bookshelf?

**His question, answered.** The seal is 永 (*ei*, "forever"), not 水. It was picked as a calligrapher's emblem, because its strokes hold the eight basic brush strokes (永字八法). That meaning is invisible, and at 36 px 永 really does look like 水. It says nothing about a shelf or about reading.

**Change.** The seal becomes **読** (*yomu*, "read"). That is the kanji the Read tab already uses (読む). It is drawn in the bundled brush face (Yuji Syuku), white on the same 藍 ground, with the same dry-brush mottling as the old mark, so it is the same object saying the right word.
- The file keeps its path, `design/ink-hoku-nami.png`. The offline gates, the service worker and the standalone build pin the path, not the picture, and they compare bytes against the build's own copy.
- The code comment that names 永 is updated.

**Verifiers.**
- verify-design-reader-shelf S4 and M1: the seal sits inside the 本棚 title, at 48 px or less.
- verify-offline: the shelf art is precached and loads on a cold offline start.
- verify-skip-standalone: the standalone build carries the art.
- Shot: `read.png` in each mode.

---

## T4 — The reader

> **Close, needs work** — Still needs to be more clear, more polished, have more contrast, depth, tesxture an clarity. the color theme all blends together too much and looks sloppy and slilghlty confusing.  the top header, the background of the picture, th etitle, the subtitle, the explanaiton (that is too verbose and.. confusing) and the artile itslef, and the bottom are all the exact same make me wanna puke beige that is overused....

**Change.** Every layer gets its own surface, edge and ink, so no two neighbours share a beige.

1. **The picture's mat.** The woodblock stops fading into the page. It is mounted on a dark lacquer mat with a fine keyline. Its credit ("Illustration · Bunki") becomes a small label on the mat, not a chip over the print. At night the mat goes deeper and a lantern-gold keyline lights its edge.
2. **The title card.** This is a raised paper card that overlaps the mat's foot, so it stands visibly in front of the print. It holds:
   - the provenance line;
   - the title, in near-black Shippori 800;
   - the English subtitle in its own ink (藍, sans), never the title's;
   - the version switch, as a crisp segmented control (a sunk track with a raised selected side).
3. **The explainer: one plain line.**
   - The cloud's r3 already put the version caption behind an ⓘ beside the switch.
   - The first-visit tip, "Tap any word to see what it means. Right-click (or press and hold) for more.", becomes one plain line: **"Tap any word for its meaning."** The longer form stays in the text settings.
4. **The article's paper.** The text stands on its own smooth sheet, brighter than the page and edged at the top, in near-black ink. Reading sizes, ruby and line leading are unchanged, because they are pinned.
5. **The bottom.** On a phone the cloud's r3 moved "no recording yet · Kore" into the instrument line, so the foot is the article's own end and then the app's tab bar (skin lane). The article paper ends on its own edge; a narrated article's play bar keeps a surface of its own.

The app's top bar is also the skin lane's. Read's layers are built to contrast with it either way.

**Verifiers.**
- verify-design-reader-shelf:
  - R1–R3: reader sizes, contrast, and the first sentence inside the first 390×844 screen;
  - P1: the tip;
  - G7: the version switch.
- verify-corridor-accessibility: contrast and 44 px targets.
- verify-relief: the desk play bar's edge and shadow.
- verify-playback, verify-reader-doors, verify-reader-lookup.
- Shot: `reader.png` in each mode.

**Pins changed on purpose (labels only), logged in VERIFIER_CHANGES.md:**
- P1's exact tip text.

---

## T5 — Tap any word

> **Close, needs work** — Not close, needs a lot of work.  THe same thing, it all bledns together! It lacks modularity, it lacks contrast, texture, depth, separtion, user ease, emotional depth, sharp contrast, and stand out clarity. Save and add to list are confusing???  shouldn:t they be one or the other? or click save and then add to list from there?   Open the web?? what does that even mean.  *this sentice, save astk the tutor, practice. very very confusing... "

**Change.** The popup becomes a distinct raised card made of separate bands, each with its own surface.

1. **The word band.** A lacquer cartouche holds the word large (Shippori), its reading in lantern gold and its meaning in light ink. "Full entry ›" sits in the band's corner. This band carries the card's emotional weight, like a printed sign.
2. **One path: Save, then Add to a list.**
   - Before saving, the card offers one action: **Save**.
   - After the press it reads **Saved ✓**, and **Add to a list** appears beside it. It opens the same list popover as today.
   - Unsaving, or Undo in the toast, takes "Add to a list" away again.
3. **"Open the web" gets a plain name:** **Kanji & related words ›** (「漢字と関連語 ›」). It opens the same word web. The kanji band gets a small label, and its tiles stay where they are.
4. **The sentence row becomes one action: "Study this sentence ›".**
   - The action shows the start of the sentence, so it is clear which sentence is meant.
   - It opens the sentence inside the card: the whole sentence with the word marked, then two plainly described choices:
     - **Ask the tutor:** get it explained;
     - **Practice it:** fill in its missing words.
   - The cloud's r3 already took "Save" (keep the sentence for the tutor) out of this row; it stays in the word menu as "Save the sentence".
   - "‹ Back" returns to the word.
   - Coming back from Practice reopens it there, as today.
5. **Depth.** The card has a float shadow, a crisp edge, a short rise on opening (transform and opacity only), and press feedback on every control.

**Verifiers.**
- verify-design-reader-shelf:
  - G1: one tap shows the word, its reading, "suburb", a filled Save and Full entry ›, inside the screen;
  - G3: Save and Undo;
  - G5: the lists popover;
  - G6: the sentence actions.
- verify-corridor-accessibility: the popup fits, Save is focused, and no sentence bar shows outside the popup.
- verify-reader-lookup, verify-annotation-lookup, verify-vocabulary-chooser, verify-corridor (R2-B).
- The tutor and practice suites (verify-ai-adaptation, verify-teacher-drafts, verify-bundled-practice, verify-bundled-listening, verify-listening-failures, verify-later-encounters, verify-sentence-drafts, verify-reference-connections).
- verify-assessment-written-section, because the same popup appears in the test paper.
- verify-playback: the popup stays clear of the player on a phone. That check fails on the base by 2 px at 320; the redesign must clear it.
- Shot: `popup.png` in each mode.

**Pins changed on purpose, logged in VERIFIER_CHANGES.md:**
- *Path pins.* "Add to a list" now appears after Save, and the sentence actions sit one tap behind "Study this sentence". The suites that reached them directly gain that one tap. Every assertion about what a control does stays the same.
- *Label pins.* G6's row text ("This sentence: Ask the tutor · Practice" → the one named action).

---

## Order of work
1. T3: the seal.
2. T5: the popup (structure, path, then surfaces).
3. T4: the reader's layers.
4. Two refinement passes against his words and THE BAR, in day, night and 日本語.
5. Final verifiers (TAG=-final), compared with the base.
