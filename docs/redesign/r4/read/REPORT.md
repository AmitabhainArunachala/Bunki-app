# Read lane, round 4: report

The first-pass account below is historical (92e8a341). The **Review and refine** section records the final merged build, corrections and verification.

**Lane:** read (T3, T4, T5).
**Branch:** `claude/r4-read-20261009` (not pushed).
**Started from:** `d98cbd3a`. The brief's base was `345dba92`; the cloud's r3-read landed on top of it at 23:13 JST and I fast-forwarded to it.
**Verified build:** `e581b4b7`, artifact `ecea131e…`.
- The commits after it add only this report.
- The final shots are of artifact `23577f7c…` (`6a68998f`). It differs from the verified build in one CSS value: the text paper's top edge, from 16% ink to 30% (gold 16% → 36% at night).

**Photos:** 390×844 at 2×, Chromium with an iPhone user agent, in day-en (北斎), night-en (夜) and day-ja.

## How the night started

- **The cloud's lane landed, so I built on it.** The cloud's r3-read merged into `claude/redesign-20261008` at 23:13 JST, on the ninth 3-minute poll. I fast-forwarded to `d98cbd3a` and built on what it landed:
  - the reader opens on picture → title → one instrument line;
  - the popup is centred and has one Save;
  - "no recording yet · Kore" sits in the instrument line on a phone.

  Its round-4 lanes had been stopped before any edits, so T3, T4 and T5 were all still open.
- **The linked `node_modules` built a broken app.** The build resolved the root's zod 3 instead of the packages' zod 4. Every page said "Saving could not be confirmed. Your record is protected", and verifiers failed with "The app has no installed record binding".
  - I cloned `node_modules` and each `packages/*/node_modules` into this worktree. Those paths are gitignored.
  - After that, the `345dba92` build matched the tour build byte for byte (artifact `23ccb8bc…`).
  - I told the lead at 22:52.

## His lines, and what changed

### T3 (Read: a woodblock magazine)

> **Close, needs work** — Why is the Water kanji the marker for bookshelf?

**The answer to his question.** The mark was not 水 (water). It was 永 (*ei*, "forever"): the calligrapher's practice character, whose strokes hold the eight basic brush strokes (永字八法). At 36 px it does read as 水, and it never meant a shelf or reading.

**What changed:**
- **The seal is 読** (*yomu*, "read"), the Read tab's own kanji.
  - It is brushed in the bundled Yuji Syuku face, white on the same 藍 tile, with the same dry-brush grain as the old mark.
  - It has a keyline: ink by day, lantern gold by night, so it never melts into the 藍.
  - The file keeps its path, `design/ink-hoku-nami.png`, so the offline precache, the worker and the standalone build carry it unchanged. verify-offline and verify-skip-standalone are green.
- **The lead story stands on a raised card** in front of its woodblock: level, kicker, headline, English line, first sentence and date. It is the reader's composition in miniature.

**Shots:** `shots/day-en/read.png`, `shots/night-en/read.png`, `shots/day-ja/read.png`.

### T4 (The reader)

> **Close, needs work** — Still needs to be more clear, more polished, have more contrast, depth, tesxture an clarity. the color theme all blends together too much and looks sloppy and slilghlty confusing.  the top header, the background of the picture, th etitle, the subtitle, the explanaiton (that is too verbose and.. confusing) and the artile itslef, and the bottom are all the exact same make me wanna puke beige that is overused....

What changed, in his order:
- **The top header.** This is the skin lane's top line; I didn't change it here. The reader's own layers now contrast with it: the dark mat starts directly under it.
- **The background of the picture.** The print sits on a dark lacquer mat with a keyline, and no longer fades into the page. Its credit is a small label on the print. At night the lamp and the rain fall on the print only, and the mat's foot carries a lantern-gold edge.
- **The title.** It sits on a raised title card in front of the mat: white by day, a lifted navy with a gold edge by night. It is set in near-black Shippori 800.
- **The subtitle.** It has its own ink, 藍 and sans-serif, behind a short 藍 rule. It no longer shares the title's ink or the page's tracking.
- **The explanation.**
  - The first-visit tip is one plain line: **"Tap any word for its meaning."**
  - The note behind the version switch's ⓘ (put there by the cloud's r3) is one short line: **"Simplified: the same story in easier Japanese."**
  - The switch itself is a segmented control: a sunk track with a raised chosen side.
- **The article itself.** It has its own smooth paper, brighter than the page, under a real ink edge, in near-black ink. Reading sizes, ruby and leading are unchanged, because they are pinned.
- **The bottom.** The reader's room is now the washi page itself. The paper ends on its own edge, then the article's footer, then the tab bar (the skin lane's). "Reading places · keep this place" is now **"Bookmarks · Bookmark this spot"**.
- **With the text settings open**, the print folds to a slim band at every width, so the first sentence never falls under the tab bar. A phone already did this.

**Shots:** `shots/<mode>/reader.png` for each mode, and `shots/<mode>/reader-scrolled.png` (the text on its paper).

### T5 (Tap any word)

> **Close, needs work** — Not close, needs a lot of work.  THe same thing, it all bledns together! It lacks modularity, it lacks contrast, texture, depth, separtion, user ease, emotional depth, sharp contrast, and stand out clarity. Save and add to list are confusing???  shouldn:t they be one or the other? or click save and then add to list from there?   Open the web?? what does that even mean.  *this sentice, save astk the tutor, practice. very very confusing... "

What changed:
- **The popup is a raised card of four separate bands**, each with its own surface. It is the same in every room it opens in, so it is styled app-wide.
  1. **The word band** is a lacquer cartouche: the word in light ink, its reading in lantern gold, its meaning, and faint 青海波 waves for texture. **Full entry ›** is a pill in its corner.
  2. **One path.** Before a word is saved, the card offers one action: **Save**, with a short note, "to your reviews".
     - After the press it reads **Saved ✓**, and **Add to a list** appears beside it.
     - Undo or unsaving takes "Add to a list" away again.
     - Lists still open the same list sheet, which now matches the card: paper, keyline and depth, a sunk field, and **Add** as the primary button, like Save.
  3. **The kanji band** is sunk and labelled **KANJI**, with its tiles raised on it.
     - "Open the web" is now **Related words ›**, at the end of the band's head. It opens the same word web.
     - In the glossary this row reads "Kanji & related words". I left out "Kanji &" because the band's label already says it.
  4. **The sentence band** is one named action, **Study this sentence ›**. It shows the sentence's first words, so it is clear which sentence it means.
     - Pressing it opens the sentence inside the card, with the word marked, and two plain choices side by side: **Ask the tutor** ("Get it explained") and **Practice it** ("Fill in the gaps").
     - **‹ Back to the word** returns.
     - Coming back from Practice reopens this pane with Practice focused.
     - Keeping a sentence for the tutor stays in the word menu ("Save the sentence"), as the cloud's r3 left it: one Save in the popup.
- **A particle's popup** (の, に…) has the same word band.
- **The "Saved to review · Undo" toast** is a lacquer slip.
- **Motion.** The card rises on transform and opacity only, and every control answers a press. Reduced motion turns both off.
- **Small phones.** On 320–360 px phones the bands are set tighter, so the card fits above its word. Every target keeps its 44 px.

**Shots:**
- `shots/<mode>/popup.png`: the card as it opens.
- `shots/<mode>/popup-saved.png`: after Save, with "Add to a list".
- `shots/<mode>/popup-sentence.png`: the sentence pane.

## Verifiers

Tags:
- **base** is `345dba92`, the brief's base.
- **start** is `d98cbd3a`, where this lane started.
- **final** is the verified build.
  - The first eleven rows (the brief's nine read-lane suites, plus relief and experience) ran on `e581b4b7`.
  - The other rows ran on `6a68998f`, which differs only in the paper edge's colour value. That value cannot change behaviour or layout: the border stays 1 px.

The rows after the first nine are extra suites that touch the popup, the list sheet or the sentence actions this lane moved. Logs are in `~/.dharma/bunki_review/2026-10-09/r4/read/verify/logs/`.

| Suite | base `345dba92` | start `d98cbd3a` | final | |
|---|---|---|---|---|
| verify-corridor | pass | pass | pass | lane |
| verify-reader-doors | pass | pass | pass | lane |
| verify-reader-lookup | pass | pass | pass | lane |
| verify-design-reader-shelf | pass | pass | pass | lane |
| verify-playback | **fail** (1) | pass | pass | lane |
| verify-annotation-lookup | pass | pass | pass | lane |
| verify-shelf-search | pass | pass | pass | lane |
| lint-ui-language-core | pass | pass | pass | lane |
| verify-corridor-accessibility | pass | pass | pass | lane |
| verify-relief | pass | pass | pass | extra, final on `e581b4b7` |
| verify-experience | pass | pass | pass | extra, final on `e581b4b7` |
| verify-skip-standalone | pass | pass | pass | extra |
| verify-offline | pass | pass | pass | extra |
| verify-vocabulary-chooser | pass | pass | pass | extra |
| verify-ai-adaptation | — | pass | pass | extra |
| verify-teacher-drafts | pass | pass | pass | extra |
| verify-bundled-practice | pass | pass | pass | extra |
| verify-listening-failures | pass | pass | pass | extra |
| verify-later-encounters | pass | pass | pass | extra |
| verify-bundled-listening | pass | pass | pass | extra |
| verify-sentence-drafts | — | pass | pass | extra |
| verify-reference-connections | — | pass | pass | extra |
| verify-assessment-written-section | **fail** (1) | **fail** (1) | **fail** (1) | extra |

Notes on the non-passes:
- **verify-playback, base.** On `345dba92` at 320 px the popup's foot (y 724) overlapped the player bar's top (y 722) by 2 px. It passes from `d98cbd3a` on, where the cloud's r3 moved the pending bar into the instrument line.
- **verify-assessment-written-section.** It fails on base, start and final in the same case, `public-catalog-and-dojo-practice-labels`: a 20 s click timeout in the public test catalogue.
  - That case is outside this lane. Every other case passes on final, including `prose-roving-accessibility`, which carries this lane's Save-before-lists step.
  - The base and start runs used the updated file, but the failing case's code is unchanged.
- **verify-ai-adaptation, base "—".**
  - The first base attempt stopped at the suite's own argument check: it needs a fresh `--evidence-out`, which the shared runner doesn't pass. From the start run on, `KAIRO_ADAPTATION_EVIDENCE` was set.
  - A later base attempt ran the updated file against the old build, which has no "Study this sentence" door. It is not a valid base result.
- **verify-sentence-drafts and verify-reference-connections.**
  - Their start column is the *original* verifier, from `d98cbd3a`, on the start build: both pass.
  - The first start runs were spoiled by my editing these verifiers while the run was going. sentence-drafts passed all 8 cases but tripped its own "verifier unchanged during the run" check, and reference-connections ran the new door tap against the old build.
  - There is no valid base run.
- **verify-relief.** It failed once, on `6a68998f`: the paper's top edge was 16% ink, under the 25% floor. I fixed it in `e581b4b7` by making the edge 30%, a CSS change, not a change to the check.
- **test-approved-voice (not in the list).** It fails at base, start and final alike, because its source boundary `/** Lists are chosen` was removed in `422251a0`, long before this round.

## Verifier changes (all logged in `docs/redesign/VERIFIER_CHANGES.md`, section "Round 4, read lane")

- **Label pins:**
  - P1's tip text: "Tap any word for its meaning.".
  - G6's sentence row, now one door, "Study this sentence", with its pane's two choices.
  - G7's caption: "Simplified: the same story in easier Japanese.".
- **Path pins:**
  - "Save" comes before "Add to a list": G5, annotation-lookup, vocabulary-chooser, corridor R2-B and assessment-written-section.
  - One tap on `#mini-sentence-open` comes before `#reader-teacher` or `#reader-sentence-practice`: ai-adaptation, teacher-drafts, bundled-practice, bundled-listening, listening-failures, later-encounters, sentence-drafts and reference-connections.
- **Added assertions:**
  - G5, vocabulary-chooser and R2-B now also assert that no list is offered before Save.
  - A new annotation-lookup case, `failed-capture-inside-a-list-is-honest-and-recoverable`, still drives the one scenario the popup can no longer produce: a capture failing inside a list creation. The personal deck's list sheet still has that path.
- **Correction after independent review:** the first pass accidentally dropped two protected-record assertions on the capture-failure path: the disabled create button and the unsaved list name surviving the required reload. The initial replacement annotation case did not restore them. They are restored in the final annotation case; see **Review and refine**. List membership, one card per word, context scopes, SRS, ledgers, offline, tutor context and practice return focus remain protected.
- **Fixed without loosening the pin:** verify-relief's reader-body edge (at least 25% ink) failed on `6a68998f`, because the paper's hairline was 16%. I fixed the CSS (30%), not the check.

## Labels, against the glossary (`docs/redesign/r4/LABELS.md`, the skin lane's)

- **Followed:**
  - Save first, then **Add to a list** (リストに追加).
  - The short version note.
  - **Bookmarks · Bookmark this spot** (栞 · ここに栞をはさむ).
- **Different, on purpose:**
  - **"Related words ›"** rather than "Kanji & related words": it sits under the band's "KANJI" label.
  - **"Study this sentence ›"** rather than "Practise this sentence": it holds Ask the tutor as well as Practice.
  - **"Tap any word for its meaning."** without "Press and hold for more": one instruction, one line. The text settings keep the full form.

The lead has these, so LABELS.md can match what ships.

## Still open

- **The top header** (T4 names it) and the tab bar belong to the skin lane. At 320 px the top bar wraps its bookmark onto a second row.
- **The top bar's save door (`#reader-take`) still says "memorize" on a desk**, while the popup says "Save". It is the skin lane's shell. The glossary asks for "Save".
- **"no recording yet · Kore"** is still in the instrument line. "Kore" is a voice's name and means nothing to a first-time user. Six voice suites pin the exact text, and some of them require the locked voice to be named, so changing it needs a decision first.
- **The full entry's, the tutor page's and the source pages' sentence chips** still read "save this sentence · discuss this sentence · practice this sentence". About ten suites outside this lane select them, and they are not the read lane's surfaces.
- **The instrument line is dense:** source, date, level, characters, unreviewed and the voice state. Its density is the cloud's r3; I only moved it into the title card.
- **What these photos can't show.** They are headless Chromium with an iPhone user agent, not a real phone. The press feedback, the rise and the 青海波 at a real phone's pixel density haven't been seen on glass. A WebKit capture of the verified build (Playwright WebKit, the Safari engine) looks the same as Chromium: the bands, the waves, the keylines and the segmented switch all render. Those shots are in `~/.dharma/bunki_review/2026-10-09/r4/read/shots-webkit/`. It is still not a real device.
- **Two mistakes of mine during the night**, both caught and corrected:
  - I edited verifiers while a start run was still going. That made two start results meaningless: sentence-drafts tripped its own "verifier unchanged during the run" check, and reference-connections ran the new door tap against the old build. Both were re-run with their original files.
  - My paper rule broke verify-relief until the final run caught it.

## Commits

- `338a1c85` docs(redesign): r4 read lane plan (T3 seal, T4 reader layers, T5 popup)
- `d4372d10` Read (T3): the shelf seal is 読, read, not 永
- `af6c5127` Read (T5): the word popup is a raised card of separate bands, with one path
- `98de3d45` Read (T4): every layer of the reader has its own surface and edge
- `40e59580` Verifiers: the popup's one path and the reader's one-line help (round 4, T4/T5)
- `8d064cfb` Read (T4): the reader's room is the washi page; the text's paper is its own
- `f58e137f` Read (T4): the reader's room really is the page (selector outranks editorial's main)
- `84d3ff29` Read (T5): the popup fits above its word on a 320px phone; Save's bounce guard resets
- `82b23838` Read (T4): while the text settings are open, the print folds to a slim band at every width
- `1fc297c1` Read (shelf): the lead story stands on a raised card over its woodblock; the 読 seal is keylined
- `958a020d` Read (T5): a particle's popup has the same word band as every word's
- `e574f5d1` Read: labels follow the round-4 glossary (Add to a list, the version note, Bookmarks)
- `ee033a67` Read (T5): the list sheet that "Add to a list" opens is the same material as the card
- `49c471f8` Verifiers: R2-B puts the popup away before the next step, as the old order did
- `6a68998f` docs(r4/read): final shots, 390x844 at 2x, in day-en, night-en and day-ja
- `1f0791d3` Verifiers: a capture that fails inside a list creation is still driven (annotation-lookup)
- `e581b4b7` Read (T4): the text paper's top edge is a real ink line (30%; gold 36% at night)
- (this report)
