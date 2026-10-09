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

**Verified product code:** `6ca33a4e3203906611ac211cc0c0e338a8ac1f1c`, clean source (`sourceDirty: false`). **Artifact:** `cb8d61c82b83194a5ae059803949a6f75752c337283b81817f0976e2e429578c`; source-asset SHA-256 `4427e50c53322ae9cefec1fd6974d23b4e84930207b847fcafdd96c07fdf77cc`. The later documentation/photos commit records those exact tested bytes. The immutable site is under `~/.dharma/bunki_review/2026-10-10/r4-finish/site`. Every final suite and photograph uses this canonical build, including the galaxy structure, focus-check race and exact below-word seat repairs described below. Logs, receipts and runtime photographs are under that same `r4-finish` directory. Prior builds are archived; `site-release` and `shots-release` retain their historical `76c40528` identity and are not final evidence.

### The three rule breaks

1. **Protected-record assertions restored.** The first-pass claim that no storage assertion changed was wrong. Its replacement annotation case omitted both capture-failure checks. In `verify-annotation-lookup.mjs`, `failed-capture-inside-a-list-is-honest-and-recoverable` now holds the exact assertions **“A failed native write protects the host until reload”** (disabled submit) and **“The required recovery reload preserves the unsaved list name”** (`Capture first`). It also requires read-only record state, a reload instruction, no durable change through fault/reload, writable recovery, and a retry that creates the list with 電車 and exactly one card. The `list-form-reenabled-before-reload` negative control exercises both capture and list-only failure; both deliberately broken cases are rejected. `verify-vocabulary-chooser` retains the list-only protection/draft recovery and denies another Save after a native capture fault even after its bounce guard expires. The historical REPORT claim is corrected inline; VERIFIER_CHANGES preserves its prior text and appends the correction.
2. **44px version switch restored.** Both choices have `min-height: 44px`; the help target is 44×44. G7 measures all three targets at 390 and 320 and asserts `box.w >= 44 && box.h >= 44`. Final choice sizes are 134×44 at 390, and 97×44 / 101×44 at 320. An external negative control rejects the actual first-pass 40px buttons at both widths.
3. **Only transform/opacity animate.** Removed background-colour motion and scoped inherited reader icon colour/background transitions to instantaneous highlights. G8 observes computed positive-duration transitions and named keyframes, including pseudo-elements, with reduced motion disabled; its exact assertions are **“Reader and word popup may animate only transform and opacity”** and **“The sentence popup may animate only transform and opacity”**, each requiring an empty violations array. The expanded observer covers the whole reader room (`#app`), popup, menu, toast and list sheet across word, sentence, Save/toast, list, settings and menu stages. Both phone widths and both engines pass. An additional motion-enabled audit passes 54/54 stages across day-en/night-en/day-ja at 320, 390 and 1368 widths, with no disallowed properties. The fresh final receipt is `r4-finish/motion-extra-final/motion-extra.json`; fetched identity and four served runtime hashes match before and after all 54 stages.

### All eleven review fixes

| # | Result | What now holds |
|---|---|---|
| 1 | Done | 44px version choices and help at 390/320, with runtime G7 and a failing first-pass control. |
| 2 | Done | Both lost record assertions, reload/retry, capture/list negative controls and honest documentation restored, with no product storage change. |
| 3 | Done | Instant press colour; only transform/opacity transitions or animations in the reader and popup. |
| 4 | Done | Fine washi on reading paper and title by day; faint fibre by night. The paper remains brighter than its room with a real ink edge; relief and readability checks retain their floors. |
| 5 | Done | Sentence pane keeps the word card's top within 1px, including short その cards and the below-word 大丈夫 fixture. The exact raw placement top survives CSS serialization: the formerly 336.625px Chromium jump is now 0px in both engines, with article scroll and token anchor unchanged. Tall content scrolls inside its card. Initial Back and later Ask/Practice focus stay visible without article scrolling. A constrained card above its token meets the fixed chrome, eliminating the narrow strip of cut title glyphs. Practice return focus remains visible. |
| 6 | Done under the finish brief's authorization | Exact glossary copy “No audio for this article yet” / “この記事の音声はまだない”; contextual sentence equivalent. Locked Kore/Charon provenance remains in exact accessible descriptions. All six voice pin edits are logged and silence/no-picker/no-device-voice protections remain. No separate lead reply is claimed. Source/date/level/state/audio use one bundled UI face at 12px; character count is removed from the reader. |
| 7 | Done | Kinsoku groups keep opening brackets with following words and closing punctuation with preceding words, in title and article, across all three spacing modes. G9 checks actual painted glyph lines, unsplit title lookup words, and exact source title/article text. |
| 8 | Done | Popup shadow falls away from the touched word. Night ruby is visibly clear in the final photographs; its computed ink/opaque-paper contrast is 9.26:1 (day 10.90:1). This computed number excludes grain/shadow compositing; it is not a pixel-sampled claim. |
| 9 | Done | “Practice it” says “Recall it or use it” / “思い出す・使う”, matching its choice screen. Quiet “Save the sentence” is inside the sentence pane and keeps exactly one tutor context, without activating it or leaving the reader. A real native abort preserves the record and disables all three actions until reload. |
| 10 | Done | English part names use UI sans; kana remain Mincho. The popup note says “to review”, matching “Saved to review”. Save, Saved and Add to a list share their button family and lip. |
| 11 | Done | Rebuilt after the merge, rechecked accessibility/relief, and re-photographed day-en/night-en/day-ja on the exact final artifact. Added 320px, saved popup, sentence/short-card and list-sheet views with byte identities. |

### John's T3, T4 and T5 in the final build

His full lines remain quoted above. T3's mark is padded **読**, legible as a seal, rather than 永. T4's merged white/day or ink/night chrome and footer, lacquer picture mat, taller 136px phone print, raised title/subtitle card, recessed version track, and textured reading paper have distinct surfaces and edges. The version explanation is one plain line behind ⓘ, and the reader tip remains one line. T5's card separates its word, Save, kanji and sentence bands; the real path is **Save → Saved → Add to a list**. “Related words ›”, “Study this sentence ›” and the one-line reader tip are retained exactly as requested. The sentence's Ask/Practice/Save choices live inside that one named door.

### Final verification

Two disjoint runner groups each ran their suites serially against the same frozen Chromium artifact/SHA; the core corridor check ran alone and root tools used the same environment. Reader design also ran in WebKit. All 29 required checks meet the brief's bar: 27 pass and two fail exactly as accepted on the PR head. All five supplementary checks pass. Dojo initially failed at `390/reader: no passage card on the shelf`; one unchanged isolated retry, after the other browser work ended, passed all 30 journeys. Both attempts are retained; no specific cause is claimed. Every behavioural assertion was retained or strengthened; cosmetic/path pin edits and the historical protection loss are individually logged in `docs/redesign/VERIFIER_CHANGES.md`.

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
| `verify-dojo-door` | Pass | 30 journeys on unchanged isolated retry; first shelf-start failure retained |
| `verify-guided-session` | Pass | 211 checks |
| `sw-shell` | Pass | 8/8 Vitest shell checks |
| `test-navigation-returns` | Pass | Return paths |
| `verify-srs-today` | Pass | 32/32; 2/2 mutants caught |
| `verify-experience` | Pass | 42/42; frozen assets |
| `verify-drift-hunt` | Pass | All hunt regressions green |
| `verify-design-reader-shelf` | Pass | 49/49 Chromium; public below-seat regression added |
| `verify-reader-doors` | Pass | 93/93 |
| `verify-reader-lookup` | Pass | Lookup and roving |
| `verify-playback` | Pass | 22/22; silence/provenance/layout |
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
| `verify-design-reader-shelf-webkit` | Pass | 49/49 WebKit |

Syntax checks passed for the changed reader JavaScript/verifiers. ESLint exits zero but ignores the three reader verifier files under the repository policy, so it supplies no coverage for them. Their executable and negative-control checks above are the verification. Fresh final supplemental receipts pass 15/15 public below-seat assertions (8 Chromium, 7 WebKit), seven protected-byte assertions, and 54/54 motion stages. The reader suite passes all prior 48 cases plus the new public below-seat case in both engines. The earlier 25/25 runtime/protected audit (`r4-finish/draft-audit/release/release-audit-76c40528-summary.json`) belongs to `76c40528` and is historical evidence only; it is not misattributed to the new final build.

### Photographs and protected scope

The supplied capture command completed all 36 room photographs in day-en, night-en and day-ja. The extra public-UI capture completed 48 reader/popup/list/short-card images in six fresh 390×844 / 320×700 profiles at 2×. It checks the fetched build identity, font origins, target geometry, one-card Save/list membership, no horizontal overflow, no page or record faults, and no external requests. All 36 room frames were inspected as contact sheets, with full-size reader/popup and narrow/list views inspected separately. The fresh 36 + 48 captures are pinned to `6ca33a4e` / `cb8d61c8…`; the visual-review receipt is `r4-finish/visual-review-final/review.json`.

The supplied script probes an absent legacy `build-sha` meta tag, so its `sha` fields are blank. `shots/HOST_IDENTITY.json` records the pinned immutable server identity and the exact extra-capture identity check. `docs/redesign/r4/read/shots/IDENTITY.json` records SHA-256 for each of the 51 copied lane photos; every copied file is byte-identical to its final runtime original. One PNG changed relative to the earlier set; the other fresh frames are byte-identical to their earlier counterparts. The photo server on 57102 was stopped.

No protected storage marker/function changed. A byte audit against `3d81031b` confirms the entire prefix before `renderShelfBody`, the FSRS pin (`prototypes/corridor/data/fsrs-pin.json`), the shared player engine, and all N2N1 source files: 536 protected files are identical. Card/Anki identities and storage keys are untouched; storage-integrity, SRS, deck, collection, service-worker and navigation checks provide runtime coverage. The real node_modules was used as provided, without replacement or installation. No secrets were read. No push, main merge, history rewrite or stash was performed.

### What remains open

- The accepted inherited failures remain: corridor-doors **T13 only**, and pr77-ports **the same four checks, 52/56**. Their exact failure names were compared to the accepted PR-head logs; JSON comparisons are in the final verify directory. The four ports checks are the 未確認/review reason, the rights-held reason, review-room ×/… contrast, and the kdx-chip-state probe timeout. No verifier was weakened to remove them.
- Tall sentence quotes and actions scroll inside the pinned card. At short-card/320 sizes, actions begin below the initial visible quote; the normal night preview can clip at its lower scroll boundary. Keyboard focus reveals controls without scrolling the article.
- These are headless Chromium and Playwright WebKit checks, not acceptance on a physical iPhone. The night ruby figure is computed colour contrast, not pixel-sampled contrast.
- The full-entry, tutor and source-page sentence chips remain outside this read-lane scope. The old shell “memorize”/bookmark wrap, dense metadata, missing-audio wording and broken approved-voice fixture are resolved here or by the merged skin lane.
- The first-pass assessment-written-section failure is historical and outside the finish battery; it was not retested in this pass. No claim is made that it is resolved.
- The gate recorded an informational, source-derived Practice-failure note that may begin below the card viewport, and unused legacy reader CSS/class cleanup. Neither was a reproduced final failure or a blocking finding; details and limits are preserved in the third review below.

The current user's instruction to execute the finish brief authorizes adopting its glossary audio copy. There is no separately obtained lead reply; this report makes the provenance decision explicit without claiming an additional approval.

### Gate review history, before the final verification

The gate reviewed `890cd522` and found four defects. The four defects were reproduced and fixed; the details below retain the intermediate evidence. These fixes change product bytes (`prototypes/corridor/corridor.js` and `prototypes/corridor/rooms/read.css`). The final table and photographs above now describe the clean `6ca33a4e` build, including all four fixes, the hidden-selector follow-up and the later repairs. The superseded `40806a26`/`34cf6d10…` evidence is archived under `r4-finish/archive/`.

| Finding | What was wrong on `890cd522` | Fix | Check that now holds it |
|---|---|---|---|
| 1. One path in the galaxy | In the galaxy, a word's entry opens over the sky and its example words open the same popup. There "Add to a list" stood beside an unsaved Save, because the one rule that honours the path's `hidden` attribute excluded that view and a shared rule gave the button a display of its own. | That one rule now applies in every view. No galaxy styling was added. | `G5-galaxy-one-path`: real taps to the entry, then no list before Save, the list after it with one card, and none after Undo. |
| 2. Motion outside the title card | Fix 3 above claimed transform and opacity only "in the reader and popup", but G8 measured only the title card, the article's words and the popup. The top bar, the 日本語 / EN switch, the tab bar, the bookmark and finished chips, the text settings choices and the list sheet's Add still animated colour through shared rules. | Scoped overrides in `rooms/read.css`, in the reader room and on the list sheet's Add: colour changes at once, and a chip's press keeps its 140ms transform. No skin token or shell rule was edited. Outside the reader room the only change is the list sheet's Add, which this lane already restyles. | G8 measures all of `#app` in the reader room, the word menu, the popup, the toast and the list sheet, across six stages, and names the groups it must have seen. |
| 3. Return from Practice on a lookup word | A name, kana run or ending opens its popup after its dictionary rows load. Returning from Practice looked for the Practice button before that popup existed, so the reader landed on the word with the sentence pane closed. | The lookup door's reopen returns its promise. The return focuses the word, then opens the pane and focuses Practice once the popup is there, provided the word is still on the page, the popup is its own and focus has not moved. The particle popup now shares the same focus reveal as the word popup. | `G6-sentence-return-motion-390` and `-320`, with motion enabled, on の (a particle), ダマスカス (a lookup word) and その (a content word). |
| 4. The pinned seat | The sentence pane pinned itself to the card's painted box, which includes the entrance animation's offset. On return from Practice, or on a quick second tap, the card sat up to 10px low with 10px less room. | The pin is the laid-out top that placement already wrote. | The same two cases: the returned card and a card opened while rising sit within 1px of the word card's seat. |

The expanded G8 now holds fix 3 for the whole reader room, including the inherited shell controls.

**What was run in this round.** Only `verify-design-reader-shelf`, as the focused check for the changed files.

| Build | Engine | Result |
|---|---|---|
| Rebuild of `890cd522`, clean source, digest `34cf6d10…` (identical to the verified artifact) | Chromium | 43/48. The five failures are the three new cases and the two widened G8 cases, which is the reproduction. The return cases report ダマスカス on its word view, and の, その and the rising その each 10px below the seat. |
| Fixed worktree, `sourceDirty: true`, digest `67d67bed…` | Chromium | 48/48 |
| Fixed worktree, same build | WebKit | 48/48 |

Logs and receipts are under `~/.dharma/bunki_review/2026-10-10/r4-finish/review-fix-01M4GJ26/`. That intermediate gate round left the earlier site, logs, receipts and photographs intact; they were subsequently archived for the final release run.

**Limits of that intermediate round (superseded by final checks above).** The particle popup's shared focus reveal is covered by the return case but was not shown failing before the fix: on `890cd522` の's Practice was already visible on return. The reviewed build was reproduced in Chromium only. No other suite was run on the fixed code here: the storage, accessibility, relief, reader-doors, reader-lookup, annotation-lookup and corridor suites last passed on `40806a26`. Night worlds, the 日本語 interface and the 1368 width were not measured by the new motion stages. The galaxy case reaches its entry through whichever kanji word the sky offers first inside the safe area (触れる in both engines here).

The first AXI run ended `failed`: its fix/review window reached 30 minutes while the review agent was still active. Commit `6fe6e3d0` was preserved and recovered by the offered `axi sync --recover` action, without a push or history rewrite. The fix review had identified a specificity regression: widening the hidden rule lowered its strength. A 320px runtime probe reproduced a painted “Study this sentence” door despite `hidden:true`. The follow-up retains the original selector strength in every app view and G6 now asserts the door's actual invisibility while its pane is open. That first run is not claimed passed. After the final required checks and photo/documentation commit, a fresh AXI run validates delivery with rebase, push, PR and CI explicitly skipped under the brief’s no-push rule. Its outcome is reported separately in the final handoff.

### Second gate review: the galaxy popup's word band

The gate then reviewed `7a48cd77` (product code `76c40528`, artifact `0ef83749…`) and found one defect. Its fix changes product bytes (`prototypes/corridor/rooms/read.css` only). At that point the verification table and photographs described `76c40528` and predated this change. The fresh full battery and photographs on clean `6ca33a4e`, recorded above, now include this fix; the intermediate results below remain historical.

| Finding | What was wrong on `76c40528` | Fix | Check that now holds it |
|---|---|---|---|
| The word band in the galaxy | The popup's word, reading and meaning now sit in a word band with "Full entry" in its corner, in every view. The rules that lay that band out excluded the galaxy. There a word of an entry's example sentence opened a popup whose word, reading and meaning ran together on one line, with "Full entry" alone on a row at the left. At the PR head each had its own row and "Full entry" stood at the right. | The band's structure applies in every view: three rules, moved out of the rooms' rule and not duplicated (the band's two columns, the text column's rows, and the gap between "Full entry" and its chevron). The lacquer, the colours and the type stay the rooms' own, so the galaxy popup keeps its own paper, palette and fonts. Computed styles outside the galaxy are unchanged. | `G5-galaxy-one-path` now also measures the painted rows and the "Full entry" target before Save. |

**What was run in this round.** Only `verify-design-reader-shelf`, as the focused check for the changed files, and a probe that photographs the galaxy popup on both builds.

| Build | Engine | Result |
|---|---|---|
| Final site `76c40528`, clean source, digest `0ef83749…` | Chromium | 47/48. The one failure is `G5-galaxy-one-path`, which is the reproduction: 動画, どうが and "video (esp. digital)" on one line. |
| Fixed worktree on `7a48cd77`, `sourceDirty: true`, digest `ddaf5370…` | Chromium | 48/48 |
| Fixed worktree, same build, run beside the Chromium run and the probe | WebKit | 47/48. `G6-sentence-pane-seat-320` failed its focus reveal (the focused "Ask the tutor" lay below the card). `G5-galaxy-one-path` passed. |
| Fixed worktree, same build, run again alone | WebKit | 48/48 |

Logs, receipts and the photographs `galaxy-popup-before-0ef.png` and `galaxy-popup-after-fix.png` are under `~/.dharma/bunki_review/2026-10-10/r4-finish/review-fix-01M4GQMR/`. Nothing earlier under `r4-finish` was changed. The worktree had no `node_modules`; the lane worktree's was cloned into it for the build, where git ignores it, and removed afterwards.

**Limits of this round.** The reviewed build was reproduced in Chromium only. The one WebKit failure was first read here as timing under load. That reading was wrong about the cause: it was a race in the verifier, which measured the focused control before the popup's one-frame focus reveal had run. The next section records it and its repair. No other suite was run on the fixed code. The galaxy popup was measured and photographed at 390 wide by day in the English interface, on 動画; night, 日本語 and other widths were not. In the galaxy the "to review" note stands close beside Save, as it did before this change; it was not part of the finding and is left as it is.

### Third gate review: a race in the verifier's focus check

The gate then reviewed `b0104ffc` and selected one finding, in the verifier. **No product file changes in this round**, so the product bytes are those of `b0104ffc`. A fresh full battery and photographs were owed at that point. The final clean `6ca33a4e` results and identities above now fulfill that requirement.

| Finding | What was wrong | Fix | What holds it |
|---|---|---|---|
| Focus measured before the reveal | The popup reveals a newly focused control one animation frame after `focusin`, by scrolling inside the pinned card. `G6-sentence-pane-seat` pressed Tab and measured at once. In WebKit a measurement could land before that frame, which is the 47/48 recorded above: "Ask the tutor" focused at 386.7 to 444.7px, the card ending at 326.6px. The product was behaving as designed. | After each of the three Tab presses the case waits two of the page's own animation frames, then measures. No fixed sleep was added. | Every assertion, floor and tolerance of the case is unchanged, and the count stays 48 per engine. |

**What was run in this round.** Only `verify-design-reader-shelf`, and a probe of the window itself.

| Build | Engine | Result |
|---|---|---|
| Worktree on `b0104ffc`, `sourceDirty: true` (verifier and documents only), digest `ddaf5370…`, the same product bytes as the build above | Probe, WebKit | At `focusin`, before any frame, "Ask the tutor" stands at 386.7 to 444.7px with the card ending at 326.6px and not scrolled: the figures of the logged failure. Two frames later it stands at 260.7 to 318.7px, inside the card. |
| Same build | Probe, Chromium | Already inside the card at `focusin`: that engine scrolls a focused control into view at once, so only WebKit showed the race. |
| Same build, both engines run at the same time | Chromium | 48/48 |
| Same build, both engines run at the same time | WebKit | 48/48 |

Logs, receipts and the probe are under `~/.dharma/bunki_review/2026-10-10/r4-finish/review-fix-r6-1/`. Nothing earlier under `r4-finish` was changed. As in the round before, the lane worktree's `node_modules` was cloned into this worktree, where git ignores it, and removed afterwards; the supplied one was not touched.

**Limits of this round.** The verifier's own failure depends on when its measurement lands, so it was not made to fail again on demand; the probe shows the window it fell into, and the suite was run once under the same two-engine load that produced the logged failure. The probe was run at 320 wide on その only. No other suite was run.

**Follow-ups recorded, not fixed.**

- When Practice fails, its message is written into the sentence pane's note, the last element of the pane, below "Save the sentence". In a pinned, clipped card nothing scrolls that note into view, because the reveal follows only the focused control, so a sighted reader may not see it without scrolling the card. "Ask the tutor" and "Save the sentence" report through the toast instead. This is derived from the source and was not reproduced at runtime; no verifier reads the note. The note is a `role="status"` region, so a screen reader still hears it, and the card still scrolls by hand. It is a corner of the accepted pinned-card tradeoff. Sending Practice's failure through the toast would close it, but that changes where a message appears, so it is left as a choice for later.
- The older reader rules that select the title, the English line, the instrument line, the version block and the tip as direct children of `main` can no longer match, now that those sit inside the title card, and `renderReader` still adds an `on-hero` class that nothing styles. No behaviour depends on them. They are left for a later cleanup.


### Fourth review: preserve the exact below-word seat

The second AXI run ended `failed` after the test agent reached its 30-minute limit. It preserved `b0104ffc` and `98f29059`; the offered `axi sync --recover` returned both commits to this branch by fast-forward. That run is not claimed passed. Its partial test receipts, including a repeated corridor walk-through failure, are diagnostic only; the final battery has since passed independently on clean `6ca33a4e`, except for the two exact accepted inherited failures.

The last review's source-derived `read-r7-1` was reproduced through the public UI on the clean `98f2905933f2a36f04f1989959b9573c3b719fb3` artifact `ddaf53700a17269b9141a63178514953801eb5cff4e8a3952fc8830859c547d7`. In やまなし (`aozora:046605`), tapping token816 大丈夫 at390×844 and article scroll4716 places the word card below its word at394.578125px. Chromium serializes its CSS top as394.578px; the sentence pin then falls0.000125px short of the safe below-word boundary. Opening Study this sentence moves the card above the word to57.953125px: a336.625px jump, without moving the article or anchor. The external public regression fails6/8, exactly the final side and top assertions. The same fixture in WebKit retains full precision and passes7/7 with0px movement. Neither uses injected learner records or styles.

Placement now retains its finite raw numeric top on the card, separately from CSS serialization. The sentence pin uses that exact number with the prior fallback for missing/nonfinite values. All viewport, chrome, side-gap,96px room and safe-placement guards remain unchanged. New cards start fresh; ResizeObserver placement refreshes the cache, Back clears the sentence pin and places again, and removal destroys the card. No storage or record code changes.

A public G6 regression is added for this below-word path, retaining all previous48cases and the1px placement tolerance. The repaired clean candidate is `6ca33a4e`, artifact `cb8d61c8…`: 49/49 reader checks in Chromium and 49/49 in WebKit. A separate public probe passes 15/15 assertions, with 0px movement in both engines and exactly unchanged article scroll and token anchor. All 34 finish suites and the fresh 36 + 48 photographs are complete on this build, as recorded above. Direct before evidence and the minimal proposal/harness are under `r4-finish/below-seat-audit/`; the earlier evidence remains intact.

The actual updated reader suite was also run alone against the clean `98f29059` control: **48/49**, with every prior case passing and only `G6-sentence-below-seat-390` failing on the same336.625px jump. The new case contains11 assertions over the public rendered behavior; it does not pin the cache or CSS serialization shape. Both engine checks on the repaired candidate now pass 49/49. The paired before/after public photographs were visually inspected. Fixed receipts: `r4-finish/below-seat-audit/fixed-6ca33a4e-summary.json`; clean protected-byte proof: `r4-finish/protected-scope-audit-6ca33a4e.json`.
