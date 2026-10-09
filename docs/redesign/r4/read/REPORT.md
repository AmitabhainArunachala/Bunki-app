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

## Review and refine

This section supersedes the first-pass verification, photographs and open-item list above. Codex Sol read every draft hunk from `7c1b2036`, created `claude/r4-read-final-20261010`, and merged the verified skin/cards/today head `3d81031b`. The merge was clean; the read surfaces were checked against the merged Tokens v2 and shell. No push or main merge was made.

**Verified product code:** `40806a264fd8f42669bcc8a0d974d5d2209c6e4d`, clean source (`sourceDirty: false`). **Artifact:** `34cf6d10501d730cc305142a83d392cbcb3a0aa5d95d049f51d574541e07d449`. The later documentation/photos commit records those exact tested bytes. The immutable site is under `~/.dharma/bunki_review/2026-10-10/r4-finish/site`; the final battery used its staging name `site-next` before it was moved intact. Logs, receipts and runtime photographs are under that same `r4-finish` directory. The superseded runs and shots are archived separately and are not final evidence.

### The three rule breaks

1. **Protected-record assertions restored.** The first-pass claim that no storage assertion changed was wrong. Its replacement annotation case omitted both capture-failure checks. In `verify-annotation-lookup.mjs`, `failed-capture-inside-a-list-is-honest-and-recoverable` now holds the exact assertions **“A failed native write protects the host until reload”** (disabled submit) and **“The required recovery reload preserves the unsaved list name”** (`Capture first`). It also requires read-only record state, a reload instruction, no durable change through fault/reload, writable recovery, and a retry that creates the list with 電車 and exactly one card. The `list-form-reenabled-before-reload` negative control exercises both capture and list-only failure; both deliberately broken cases are rejected. `verify-vocabulary-chooser` retains the list-only protection/draft recovery and denies another Save after a native capture fault even after its bounce guard expires. The historical REPORT claim is corrected inline; VERIFIER_CHANGES preserves its prior text and appends the correction.
2. **44px version switch restored.** Both choices have `min-height: 44px`; the help target is 44×44. G7 measures all three targets at 390 and 320 and asserts `box.w >= 44 && box.h >= 44`. Final choice sizes are 134×44 at 390, and 97×44 / 101×44 at 320. An external negative control rejects the actual first-pass 40px buttons at both widths.
3. **Only transform/opacity animate.** Removed background-colour motion and scoped inherited reader icon colour/background transitions to instantaneous highlights. G8 observes computed positive-duration transitions and named keyframes, including pseudo-elements, with reduced motion disabled; its exact assertions are **“Reader and word popup may animate only transform and opacity”** and **“The sentence popup may animate only transform and opacity”**, each requiring an empty violations array. It proves it observed motion (966 nodes, 911 transition entries and three animations in Chromium). Both widths and both engines pass.

### All eleven review fixes

| # | Result | What now holds |
|---|---|---|
| 1 | Done | 44px version choices and help at 390/320, with runtime G7 and a failing first-pass control. |
| 2 | Done | Both lost record assertions, reload/retry, capture/list negative controls and honest documentation restored, with no product storage change. |
| 3 | Done | Instant press colour; only transform/opacity transitions or animations in the reader and popup. |
| 4 | Done | Fine washi on reading paper and title by day; faint fibre by night. The paper remains brighter than its room with a real ink edge; relief and readability checks retain their floors. |
| 5 | Done | Sentence pane keeps the word card's top within 1px, including short その cards. Tall content scrolls inside its card. Initial Back and later Ask/Practice focus stay visible without article scrolling. A constrained card above its token meets the fixed chrome, eliminating the narrow strip of cut title glyphs. Practice return focus remains visible. |
| 6 | Done under the finish brief's authorization | Exact glossary copy “No audio for this article yet” / “この記事の音声はまだない”; contextual sentence equivalent. Locked Kore/Charon provenance remains in exact accessible descriptions. All six voice pin edits are logged and silence/no-picker/no-device-voice protections remain. No separate lead reply is claimed. Source/date/level/state/audio use one bundled UI face at 12px; character count is removed from the reader. |
| 7 | Done | Kinsoku groups keep opening brackets with following words and closing punctuation with preceding words, in title and article, across all three spacing modes. G9 checks actual painted glyph lines, unsplit title lookup words, and exact source title/article text. |
| 8 | Done | Popup shadow falls away from the touched word. Night ruby is visibly clear in the final photographs; its computed ink/opaque-paper contrast is 9.26:1 (day 10.90:1). This computed number excludes grain/shadow compositing; it is not a pixel-sampled claim. |
| 9 | Done | “Practice it” says “Recall it or use it” / “思い出す・使う”, matching its choice screen. Quiet “Save the sentence” is inside the sentence pane and keeps exactly one tutor context, without activating it or leaving the reader. A real native abort preserves the record and disables all three actions until reload. |
| 10 | Done | English part names use UI sans; kana remain Mincho. The popup note says “to review”, matching “Saved to review”. Save, Saved and Add to a list share their button family and lip. |
| 11 | Done | Rebuilt after the merge, rechecked accessibility/relief, and re-photographed day-en/night-en/day-ja on the exact final artifact. Added 320px, saved popup, sentence/short-card and list-sheet views with byte identities. |

### John's T3, T4 and T5 in the final build

His full lines remain quoted above. T3's mark is padded **読**, legible as a seal, rather than 永. T4's merged white/day or ink/night chrome and footer, lacquer picture mat, taller 136px phone print, raised title/subtitle card, recessed version track, and textured reading paper have distinct surfaces and edges. The version explanation is one plain line behind ⓘ, and the reader tip remains one line. T5's card separates its word, Save, kanji and sentence bands; the real path is **Save → Saved → Add to a list**. “Related words ›”, “Study this sentence ›” and the one-line reader tip are retained exactly as requested. The sentence's Ask/Practice/Save choices live inside that one named door.

### Final verification

The required serial runner battery uses Chromium and the exact final artifact/SHA; root tools use the same environment. Reader design was also run separately in WebKit. Every behavioural assertion was retained or strengthened; cosmetic/path pin edits and the historical protection loss are individually logged in `docs/redesign/VERIFIER_CHANGES.md`.

| Name | Result | Note |
|---|---|---|
| `verify-corridor` | Pass | 259/259 |
| `verify-corridor-storage-integrity` | Pass | Record invariants |
| `verify-corridor-accessibility` | Pass | 53/53 |
| `lint-ui-language-core` | Pass | Core EN/JA |
| `verify-relief` | Pass | Edges ≥25% and lifting shadows |
| `verify-theme-consistency` | Pass | World sweep |
| `verify-writing-room` | Pass | 51/51 |
| `verify-kotoba-mine` | Pass | Deck integrity |
| `verify-n2n1-decks` | Pass | N2/N1 integrity |
| `verify-personal-collections` | Pass | 9 cases |
| `verify-dojo-door` | Pass | 30 room/width journeys |
| `verify-guided-session` | Pass | 211 checks |
| `sw-shell` | Pass | Vitest shell checks |
| `test-navigation-returns` | Pass | Return paths |
| `verify-srs-today` | Pass | 32/32; 2/2 mutants caught |
| `verify-experience` | Pass | 42/42; frozen assets |
| `verify-drift-hunt` | Pass | All hunt regressions green |
| `verify-design-reader-shelf` | Pass | 45/45 Chromium |
| `verify-reader-doors` | Pass | 93/93 |
| `verify-reader-lookup` | Pass | Lookup and roving |
| `verify-playback` | Pass | Silence/provenance/layout |
| `verify-annotation-lookup` | Pass | 10/10; both failure controls caught |
| `verify-shelf-search` | Pass | Query races |
| `verify-vocabulary-chooser` | Pass | 5/5; protected failure/retry |
| `verify-corridor-doors` | Inherited fail | T13 only; matches accepted baseline |
| `verify-pr77-ports` | Inherited fail | 52/56; exact same four accepted failures |
| `verify-redesign-foundation` | Pass | 6 language/width journeys |
| `verify-redesign-docks` | Pass | 24/24, Chromium + WebKit |
| `verify-today-sky` | Pass | 81 checks |
| `verify-bundled-listening` | Pass | Pending-audio silence/provenance |
| `verify-listening-failures` | Pass | Native failure silence/provenance |
| `verify-sentence-drafts` | Pass | 8/8; desktop and phone |
| `test-approved-voice` | Pass | 11/11, executable fixture |
| `verify-design-reader-shelf-webkit` | Pass | 45/45 WebKit |

Syntax checks passed for the changed reader JavaScript/verifiers. ESLint exits zero but ignores the three reader verifier files under the repository policy, so it supplies no coverage for them. Their executable and negative-control checks above are the verification. The external final sentence fault/focus probe passed 11/11 assertions.

### Photographs and protected scope

The supplied capture command completed all 36 room photographs in day-en, night-en and day-ja. The extra public-UI capture completed 48 reader/popup/list/short-card images in six fresh 390×844 / 320×700 profiles at 2×. It checks the fetched build identity, font origins, target geometry, one-card Save/list membership, no horizontal overflow, no page or record faults, and no external requests. All 36 room frames were inspected as contact sheets, with full-size reader/popup and narrow/list views inspected separately.

The supplied script probes an absent legacy `build-sha` meta tag, so its `sha` fields are blank. `shots/HOST_IDENTITY.json` records the pinned immutable server identity and the exact extra-capture identity check. `docs/redesign/r4/read/shots/IDENTITY.json` records SHA-256 for each of the 51 copied lane photos; every copied file is byte-identical to its final runtime original. The photo server on 57102 was stopped.

No protected storage marker/function changed. A byte audit against `3d81031b` confirms the entire prefix before `renderShelfBody`, the FSRS pin (`prototypes/corridor/data/fsrs-pin.json`), the shared player engine, and all N2N1 source files: 536 protected files are identical. Card/Anki identities and storage keys are untouched; storage-integrity, SRS, deck, collection, service-worker and navigation checks provide runtime coverage. The real node_modules was used as provided, without replacement or installation. No secrets were read. No push, main merge, history rewrite or stash was performed.

### What remains open

- The accepted inherited failures remain: corridor-doors **T13 only**, and pr77-ports **the same four checks, 52/56**. Their exact failure names were compared to the accepted PR-head logs; JSON comparisons are in the final verify directory. The four ports checks are the 未確認/review reason, the rights-held reason, review-room ×/… contrast, and the kdx-chip-state probe timeout. No verifier was weakened to remove them.
- These are headless Chromium and Playwright WebKit checks, not acceptance on a physical iPhone. The night ruby figure is computed colour contrast, not pixel-sampled contrast.
- The full-entry, tutor and source-page sentence chips remain outside this read-lane scope. The old shell “memorize”/bookmark wrap, dense metadata, missing-audio wording and broken approved-voice fixture are resolved here or by the merged skin lane.
- The first-pass assessment-written-section failure is historical and outside the finish battery; it was not retested in this pass. No claim is made that it is resolved.

The current user's instruction to execute the finish brief authorizes adopting its glossary audio copy. There is no separately obtained lead reply; this report makes the provenance decision explicit without claiming an additional approval.

### Gate review, after the verified artifact

The gate reviewed `890cd522` and found four defects. All four were reproduced on that code and are fixed. **These fixes change product bytes** (`prototypes/corridor/corridor.js` and `prototypes/corridor/rooms/read.css`), so artifact `34cf6d10…` does not contain them. The verification table and photographs above describe `40806a26` and nothing later. The required battery and the photographs have to be run again on a clean build of the commit that carries these fixes.

| Finding | What was wrong on `890cd522` | Fix | Check that now holds it |
|---|---|---|---|
| 1. One path in the galaxy | In the galaxy, a word's entry opens over the sky and its example words open the same popup. There "Add to a list" stood beside an unsaved Save, because the one rule that honours the path's `hidden` attribute excluded that view and a shared rule gave the button a display of its own. | That one rule now applies in every view. No galaxy styling was added. | `G5-galaxy-one-path`: real taps to the entry, then no list before Save, the list after it with one card, and none after Undo. |
| 2. Motion outside the title card | Fix 3 above claimed transform and opacity only "in the reader and popup", but G8 measured only the title card, the article's words and the popup. The top bar, the 日本語 / EN switch, the tab bar, the bookmark and finished chips, the text settings choices and the list sheet's Add still animated colour through shared rules. | Scoped overrides in `rooms/read.css`, in the reader room and on the list sheet's Add: colour changes at once, and a chip's press keeps its 140ms transform. No skin token or shell rule was edited. Outside the reader room the only change is the list sheet's Add, which this lane already restyles. | G8 measures all of `#app` in the reader room, the word menu, the popup, the toast and the list sheet, across six stages, and names the groups it must have seen. |
| 3. Return from Practice on a lookup word | A name, kana run or ending opens its popup after its dictionary rows load. Returning from Practice looked for the Practice button before that popup existed, so the reader landed on the word with the sentence pane closed. | The lookup door's reopen returns its promise. The return focuses the word, then opens the pane and focuses Practice once the popup is there, provided the word is still on the page, the popup is its own and focus has not moved. The particle popup now shares the same focus reveal as the word popup. | `G6-sentence-return-motion-390` and `-320`, with motion enabled, on の (a particle), ダマスカス (a lookup word) and その (a content word). |
| 4. The pinned seat | The sentence pane pinned itself to the card's painted box, which includes the entrance animation's offset. On return from Practice, or on a quick second tap, the card sat up to 10px low with 10px less room. | The pin is the laid-out top that placement already wrote. | The same two cases: the returned card and a card opened while rising sit within 1px of the word card's seat. |

Fix 3's row in the table above is true of what G8 measured at the time. It holds for the whole reader room only from this round.

**What was run in this round.** Only `verify-design-reader-shelf`, as the focused check for the changed files.

| Build | Engine | Result |
|---|---|---|
| Rebuild of `890cd522`, clean source, digest `34cf6d10…` (identical to the verified artifact) | Chromium | 43/48. The five failures are the three new cases and the two widened G8 cases, which is the reproduction. The return cases report ダマスカス on its word view, and の, その and the rising その each 10px below the seat. |
| Fixed worktree, `sourceDirty: true`, digest `67d67bed…` | Chromium | 48/48 |
| Fixed worktree, same build | WebKit | 48/48 |

Logs and receipts are under `~/.dharma/bunki_review/2026-10-10/r4-finish/review-fix-01M4GJ26/`. The canonical site, logs, receipts and photographs under `r4-finish` were not touched.

**Still open from this round.** The particle popup's shared focus reveal is covered by the return case but was not shown failing before the fix: on `890cd522` の's Practice was already visible on return. The reviewed build was reproduced in Chromium only. No other suite was run on the fixed code here: the storage, accessibility, relief, reader-doors, reader-lookup, annotation-lookup and corridor suites last passed on `40806a26`. Night worlds, the 日本語 interface and the 1368 width were not measured by the new motion stages. The galaxy case reaches its entry through whichever kanji word the sky offers first inside the safe area (触れる in both engines here).
