# Bunki tighten pass, 2026-11-10 evening

Lead's design direction for tonight. Five builders work from this one file so the result is one app.

## John's words (17:57 JST, the brief for this pass)

"i want you to keep what works, clean up all the noise, make it tighter, then connect and create ... a novel way to tie it all together ... while synchronizing with me on nuance, style and feel but making it a world class app"

Earlier today: "on a word or kanji page you see a kanji in 4 different places, same kanji ... all the same beige, there is no sense of depth, color distinction". "the SRS BUILD, the NIHONGO SRS study engine is actually the best thing going for us." "KEEP WHAT WORKS AND WHAT MAKES SENSE AND MAKE IT ALL SMOOTH, SEXY, liminal, coherent, fast, and with exquisite attention to detail."

His standing design law (read once, `~/.dharma/bunki/MASTER-SPEC-2026-11/PRIOR-RULINGS.md` R1 to R8): never sacrifice life for a numbed look; a tasteful variant of the existing object reads as failure; "use high level design principles, I cannot be babysitting every single detail".

## This pass removes and tightens. It invents nothing (part E is the one marked trial).

## KEEP: do not change the look or the behaviour of these

1. The study card and everything behind it: the `kp-` player (passage card, marked word, Reveal, the back with readings, the four coloured grades and their intervals), `decks/` (the Nihongo engine's player and frozen deck pages), `modules/srs-core*`, the shared-study frame, the schedule. Not a pixel, not a rule.
2. The reading ladder in an article: tap for the reading, again for the meaning, again for the box (`#mini`), again for the full entry. It is deliberate. Do not shorten it.
3. The word web in Words. The drift field and its constellation on the first screen. The writing room and its brush. The article illustrations.
4. The eleven looks (`THEME_UI`) and their colours.
5. The insides of Orbit, Rajōmon, Passage, Build a character and the quest (wording rules below still apply to their labels).
6. Every element id. Every function stays reachable (one tap further is allowed where a section says "fold").

## The rules that make it one app

- **Subject once.** The word or kanji a page is about appears at heading size one time. Lists under it never reprint it at full strength: in a list of compounds the page's kanji is drawn at 40% strength and the partner characters carry the line.
- **A fact is text. A door is a control.** Only things that go somewhere or do something may look like buttons. Stroke count, Kanken grade and JLPT level are one quiet line of text.
- **The builder never speaks on the learner's page.** No dataset names, file names, licences, data-build dates, edition numbers, or notes about what the software lacks. They go behind one quiet "Sources" disclosure at the foot of the page, or are removed. A missing fact is not announced: the row and its heading are absent.
- **Nothing empty is shown.** A heading with nothing under it is removed. A count of zero is not printed.
- **One name per place.** The five rooms are Today, Read, Learn, Words, Me, the words on the tabs. The bar shows that name. Nothing else names the room again on the same screen.
- **One word for going back:** "Back", with the same chevron, in the same place.
- **Sentence case** for every label and button ("Browse cards", "Stats", "Keep it", "Send", "Lessons", "Sentence practice", "Reference library"). Small mono kickers stay, one per block at most.
- **New features** keep the 新 / "new" mark from the prototype layer and lose the suffix "· preview".

## Parts (one builder each; stay inside your part)

### A. Entry pages: word, kanji, sentence
Evidence: `PROGRAM/ux/shots/t2-09-word-tap4.png`, `t5-02b-kanji-page-full.png`, `t2-11-sentence-scale.png`, `t7-passage-03.png`. Measured on the 門 page at 17:52 JST: 門 printed 27 times (26 at 21 px or larger), 4.3 screens long, 84 tappable things.
- Word entry: word and reading once (the hero). The met-line keeps "Met once" and drops the repeated reading. "Dictionary entry 分野 ぶんや ›" becomes a quiet door "Full dictionary entry ›" that does not reprint the word. "I know this" and "Not yet" become two real controls directly under the hero (they are the study engine's two answers for a word). "JMdict · EDRDG · CC BY-SA 4.0" goes behind "Sources".
- Kanji page: facts as one line under the meaning ("8 strokes · Kanken 9 · JLPT N4"). The doors (look up by shape and strokes, practice reading in this sentence, Rajōmon, Build, Practise in words, Resume the passage) sit together directly under that line. Behind "Sources": the Kodansha numbers, "Complete dictionary meanings, KANJIDIC2 2026-08-03", "KANJIDIC2 · もんがまえ", "Classical radical 169", "strokes · KanjiVG". Removed with their headings when nothing remains: "Source grouping is not bundled for this character ...", "This dataset has no sound relationship ...", "This dataset has no meaning relationship ...", "study progress no history yet", the empty "MORE LANGUAGE TOOLS". The radical stays as one door row. Compounds: the page's kanji at 40% strength.
- Sentence page: the sentence appears once; Save and "Practice it" sit under it; the instruction paragraph becomes one quiet line.

### B. The frame
Read `PROGRAM/ux/fixes.md` section "## 2. One frame on every screen" (parts a to d) and the evidence in `PROGRAM/ux/walk.md` ("Everything that changes from screen to screen": 8 kinds of top bar, 14 back controls with 6 words).
- Top bar on every screen: Back, the room's name, the seal, search. Take off the graduation cap, the bookmark and EN / 日本語 (language stays in Me, Settings; saved words stay in Today; keep in the page any element the learner walk reads, hidden).
- Remove the vertical side labels ("TODAY 11·10 ■", "READ ■", "LEARN ■", "WORDS ■", "ME ■"): they name the room and the date a second time.
- First screen: remove the white bar "宙 shelf ›" (at the sky there is no trail to show) and show the five tabs in place of the lone "Today" button.
- Back returns where the learner came from (Today's reading returns to Today).
- The trail (宙 › shelf › article › sentence › word › kanji › part) stays as it is. Part E works on it.

### C. The rooms: Today, Learn, Me, Words
Evidence: `PROGRAM/ux/shots/t3-05b-today-with-saved-full.png`, `t4-02b-learn-full.png`, `t7-01b-me-full.png`, `t3-01b-words-full.png`. Measured: Today 2.2 screens, Learn 3.3 screens with "0 due" printed 7 times, Me 2.9 screens.
- Today keeps its composition (date, the words, Today's word, cards waiting, today's reading, saved words). Everything below that (the deck table, coming up, browse cards, stats, pace, saved notes, the sync notice, export and import, "A note to the builder") folds into one closed row at the foot, "Your record and backup", on the same page with every id kept.
- Learn keeps the dark header and its paper stack exactly. Deck rows: no zero counts; a row with nothing due and nothing new today reads quiet. One name (Learn). Sentence case.
- Me: the empty states say it once ("Not started yet" three times becomes one line); the line about help per 1,000 characters shows only once there is a number.
- Words: on a profile that has visited nothing, do not print "Words you visited"; label the example honestly. Remove the empty "MORE LANGUAGE TOOLS".
- The new study screen's notice becomes plain words: "Trial copy. Your real study record stays as it is."

### D. Controls and type: one new stylesheet, nothing else
Measured at 17:52 JST on nine screens: 73 different stylings of tappable things; 19 text sizes; 7 weights.
- Add one stylesheet, loaded last (register it wherever the build lists its assets, or the build drops it). Do not edit the existing stylesheets.
- One control family, mapped onto the existing classes: primary (filled, one per screen), secondary (outlined), quiet (text with a chevron), and segmented choice. Same height, corner, weight and padding everywhere, in every one of the eleven looks, taking colours only from the existing variables.
- Text sizes mapped down to a scale of eight; weights to three. Hairlines and section gaps consistent across the five rooms.
- Order of work: controls first, then text sizes, then rhythm. Stop where the time ends with what you have checked by eye in the day look and in `yoru` and `kaku`.
- Leave the study card, the word web, the drift, the writing room and the worlds alone (see KEEP).

### E. 糸 depth: a marked trial inside the prototype layer, off until switched on
Files: `prototypes/corridor/prototype-layer.mjs` and its styles only. A switch in the 試 panel, "糸 Depth · trial", kept in the layer's own storage, never in the learner record.
The idea (lead's): the app is one zoom, from the sky of words down into the inside of a character. Calm at the surface, vivid in the depths. Two things make that visible:
1. **Depth as light.** Read the level from the app's own trail. At the sky, the rooms, an article and a sentence the learner's chosen look stays. At a word entry the look moves to dusk (`iwa`, persimmon; captured beside `akafuji` at 18:07 JST and iwa reads as dusk). At a kanji or a part it moves to night (`yoru`). Coming back up returns to day. Use only the existing looks; set the attribute the way `setKairoTheme` does without writing the saved choice; cross-fade about 450 ms; no motion when the system asks for reduced motion. If the learner's own look is already a night look, the word level keeps it and the kanji level moves to `kaku`.
2. **The cord.** A thin red cord down the left edge with one bead per level of the trail, the current bead marked. Tapping a bead goes to that level through the app's own trail handler. While the trial is on, the breadcrumb row is hidden because the cord carries it. Port the look from the lead's sketch: `PROGRAM/design/index.html`, `.spine`, `#thread`, `.knot`, `drawThread()`.
Both must be exquisite or absent: no jitter, no layout shift, nothing over the reading text.

## Working rules (all parts)

- Base: `git -C /Users/dhyana/Bunki-app fetch origin`, then a new worktree from `origin/integrate/everything-on-20261110` at `~/worktrees/Bunki-app/tight-<part>_20261110` on branch `tight/<part>-20261110`. Compare file counts with `~/worktrees/Bunki-app/everything-on_20261110` (a copied sparse filter gives a fraction of the files: disable it in the new worktree only).
- Dependencies: APFS-clone `node_modules` AND every `packages/*/node_modules` from `~/worktrees/Bunki-app/everything-on_20261110` with `cp -c -R`. Node 22 is at `/opt/homebrew/opt/node@22/bin`.
- Build the way `PROGRAM/preview/rebuild-everything-on.sh` does and serve your own copy on a free port (not 8810, 18830, 18840, 18841).
- Browser automation with Playwright launch only. Never start Chrome by hand.
- Look at your own pixels at 390x844 and 1440x900, in the day look and in `yoru`, after every pass. Fix what a careful designer would see.
- Do not delete or weaken a test. Where a test or the learner walk (`PROGRAM/preview/learner-check.mjs`) finds something by words you changed, update that expectation and list it.
- Never push to `main`, `next` or an `integrate/` branch. No force pushes. No pull request. Do not touch other worktrees, the running previews, the notes store in `PROGRAM/feedback/`, or John's installed Nihongo Study app. Spend no money.
- zsh: an unquoted `$VAR` holding several words is one argument. A command guard rejects commands containing a line that begins with the word `pass` followed by another word, and the bare words used by password tools; write such files with a file tool, not a shell here-document.
- Stop and report if free disk falls under 8 GiB.

## Finish line (all parts)

- Before and after screenshots of every screen you changed, at 390x844, day look and `yoru`, in `PROGRAM/design/tight-shots/<part>/`. First ones by 19:00 JST.
- The learner walk passes against your build. `npm test -- --testTimeout=120000` passes.
- `git push origin tight/<part>-20261110`.
- Report by 19:45 JST, under 20 lines: what was removed, what was folded, what moved, each with its count before and after; tests and walk steps you updated; files with line counts; anything you left and why.

## John's clarification, 18:13 JST. Where it differs, this overrides the parts above.

"by tighten i mean tiget the code adn minimal cutting. if you look there are obvious things."

- **Minimal cutting.** Clean only the obvious noise: the subject repeated on its own page, the builder's voice on the learner's page, headings with nothing under them, labels that are false. Nothing a learner can use is deleted; it moves behind "Sources" or stays.
- **Lead's calls (18:16 JST, after John: "just be INTUITIVE ... read the room"). No item waits on John.** Left exactly as they are tonight: the graduation cap, the bookmark and EN / 日本語 in the bars; the vertical side labels; the first screen's 宙 bar. Done tonight: everything else in parts A to E, including the fold of Today's record drawer (collapsed on the same page, nothing removed).
- **Tighten the code.** In the code you touch, bring repeated builders to one function and repeated styles to one rule, without changing what shows. Report lines before and after. For part D: list every old rule your family makes dead (file and line) in `tight-shots/controls/dead-rules.txt` so it can be deleted once John accepts the look.
