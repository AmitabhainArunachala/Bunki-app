# Round 4 · cards lane: report

_Written by the lead on 2026-10-09 from the lane agents' returned results (workflow `wf_8e80e3e9-a03`). The agent harness refused to let a subagent write this file, so the lane returned its report as data; nothing here is rewritten beyond formatting._

- Branch `claude/r4-cards-20261009`: first pass `2e1f43cd`, after the independent review and refine `3f7a646a`.
- Independent review verdict on the first pass: **fix**, 7 fixes, 1 process finding (this report was missing). The refine answered them (below).

## His lines, and what changed (after the refine)

### T2 (the deck home): "this is nice, but things like *Real Sentences read and recall.. is just very confusing, obtuse and way to generic to mean anyhting at all...   the english is clean though and more understanaalbe, I did like the color of the other side an dthe four windows but maybe not so big.  also, this new build could even be sharper and cleaner.  why do i feel that native ios expeirnce is alreayd way smoother and tighter and crisper than almost everythign we have?"

Earlier in the lane:
- The coined name is gone. The home reads 'Words you looked up' over 'Sentences · 323 words · 503 cards'. The 323 words are his lookups from his Japanese app (decks/kotoba-mine/README.md). The Japanese names stay.
- The four windows (Due · New · Known · Difficult) sit in one row of small tiles, each at most 72px tall by the verifier, in the old home's colours (amber, ink, green, red).
- The type is tighter, the topic rows are 50px, there is one radius per kind of thing, and every key gives instant press feedback.

In this pass:
- Figures carry a thousands separator: 'Passages · 323 words · 2,435 cards' and '2,435枚'.
- The English agrees in number: 'Begin — 1 card', and '1 card' in Settings.

Shots: docs/redesign/r4/cards/shots/{day-en,night-en,day-ja}/deck-home.png; shots/extra/<mode>/mcd-home.png (2,435); shots/<mode>/learn.png

### T8 (Cards: the front): "More sharp, more depth, more contrast, more distinction."

Earlier in the lane:
- The stage sits deeper than the page.
- 藍 by day is now all lacquer, with the washi card as the lit sheet.
- The トンボ crosses are gone, only WORD is boxed and the sentence is weight 600.
- Reveal answer is one framed key at the foot, where the grades come up.

In this pass:
- 墨's card is lifted by light, because a black shadow can't show on near-black. It is #1a2330 on a #030406 stage, with a 12% white top edge and a faint light hairline. Sampled at 1.29–1.30:1 (it was 1.16–1.18:1).
- The chip line is WORD · topic · level · state. The bare 'Examples' and 'Lecture' chips moved to the back's Source fold.
- The card holds only its content, and the bare stage around it also reveals. Option (b), a tall sheet that reads as paper, is kept as docs/redesign/r4/cards/options/front-b.css for him to choose.

Shots: shots/<mode>/deck-front.png; shots/<mode>/n1-deck.png; shots/options/<mode>/front-a.png vs front-b.png (and front-a-n1/front-b-n1)

### T9 (Cards: the back): "same as above, needs more clarity, more crispness, more tightness."

Earlier in the lane:
- The answer opens under a crisp rule.
- 財政 (36px), its reading and the part-of-speech badge sit on one line, with the Japanese definition in full ink at weight 600.
- The folds are one grouped list of 44px rows with chevrons (English, Translation, Kanji form and meaning, Other sentences, Source), with English the first row.

In this pass:
- The 墨 lift from T8 reaches the back too. The grouped list is 1.12:1 off the card and 1.46:1 off the stage, sampled.
- A written passage's Source fold names its style on its first line: 'Style Lectures and book summaries' (文体 講義・本の要約).

Shots: shots/<mode>/deck-back.png; shots/extra/<mode>/n1-back.png; shots/extra/<mode>/mcd-source.png (Source fold open)

### D1 (Grade buttons on a card): "Four (Again · Hard · Good · Easy) — and color coded"

Earlier in the lane:
- Four pads, Again · Hard · Good · Easy (もう一度 · 難しい · 正解 · 簡単, seals 再 難 良 易), grading FSRS 1–4 with keys 1–4.
- Each pad shows the real interval from the engine's preview() under the pinned parameters.
- The hue is on the word and a 2px top edge, and only Good is tinted.
- Hard counts as kept. Swipe right is Good, left is Again.
- CARD_CONTRACT_V2 §4 is amended (2026-10-09), with STANDARD A53. Storage is unchanged: a two-button ledger loads and takes a Hard.

In this pass:
- fmtWait prints '1 day', '1 month' and '1 year' (and '1.5 years', '1年'). It never prints '1 days' or '1.0 years', and the verifier now refuses both.

Shots: shots/<mode>/deck-back.png

### D4 (The samurai on a wrong answer): "Blood"

On the incorrect cut only, all in guided-moments.css, transform and opacity only:
- the blade's wake turns crimson;
- one dark-red frame flashes inside the blackout;
- the blade's path is written once in blood.

In this pass:
- The circles, capsules and centred stripes are replaced by brush marks, inline SVGs from docs/redesign/r4/cards/blood_svg.py, which reproduces the CSS exactly.
- Blood leaves the cut in one flick along the blade's way: a splat, then a ribbon breaking into teardrops. It is gone in 900 ms.
- Three heavy drops fall from chest height to the ground line under gravity and vanish into a flat, lobed pool.
- Each scrap carries a torn-edge stain soaked in from a cut edge.
- At ≤600px the spray and pool move in to stay inside the frame.
- Nothing hangs in the air at 2100 ms.
- Quiet, the rematch and the reduced-motion rules are kept, and they cover the new drops.

Shots: shots/extra/samurai/samurai-playful-{1000,1150,1300,1600,2100}.png vs shots/extra/samurai-base/ (same times); exact paused frames shots/extra/samurai-frames/playful-390-r{0150,0400,0800,0960,1250}.png and playful-320-r0400.png

### D4 age-rating note (brief §4: 'with the age-rating note in the REPORT')

Where the blood shows:
- In guided practice (集中道場's guided session), on every wrong answer, while moments are on. They are on by default, in the playful mode (the default) and the dramatic mode.
- Quiet mode never shows it. The rematch never shows it: the outcome is 'incorrect' or 'rematch', never both (guided-moments.mjs l.300, l.377).
- Grading a deck card Again never plays the samurai.

Under reduced motion:
- The moment never plays on its own: play() returns false.
- Only the session's replay and demo buttons force it. A forced replay is not a still: each blood part plays at its --samurai-motion length, 320 ms (the red frame) to 1,000 ms (the pool, which starts 250 ms in). The PLAN's 'jumps to the still end' was wrong and is corrected in PLAN.md (3f7a646a).

The likely rating (an estimate, not checked with Apple):
- Apple's definitions put Infrequent Cartoon or Fantasy Violence at 9+ and Frequent at 13+, with Realistic Violence higher. Source: App Store Connect help, 'Age ratings values and definitions', https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions, read 2026-10-09.
- The scale is now 4+, 9+, 13+, 16+ and 18+, so 12+ no longer exists (https://9to5mac.com/2025/07/24/apple-notifies-developers-of-new-app-store-age-rating-system/).
- A painted samurai cutting a paper figure in flat woodblock red, on every wrong answer, is likely 'Frequent Cartoon or Fantasy Violence', so 13+.
- A reviewer who reads it as realistic violence could rate it higher.
- Check the questionnaire before any store submission. A 3-line note sits beside the blood in guided-moments.css.

His call: to stay at 9+, the blood could be dramatic-only, or quiet could be the default.

Shots: shots/extra/samurai/samurai-playful-1300.png

### Carry-on T11 (the 2,000 cards): "the same contrast and crispness pass, and no rethinking"

- The N1, N2 and 専門 decks share the player. They get the four pads, the lacquer stage, the grouped folds and now the shorter chip line (WORD · World history · N1 · New).
- The N1 home reads 'N1 vocabulary' over 'Passages · 666 words · 666 cards', with the small tiles.
- None of those decks' method text names grade buttons, so A05 holds.

Shots: shots/<mode>/n1-deck.png; shots/extra/<mode>/n1-home.png; shots/extra/<mode>/n1-back.png

### Review fix 1 and the rule break (brief §7: REPORT.md never committed)

docs/redesign/r4/cards/REPORT.md is still not a file. My Write of it was refused by the harness: 'Subagents should return findings as text, not write report files. Include this content in your final response instead.' I did not route around that refusal.

The REPORT's content is this output:
- his lines with changes and shots, and the age-rating note (above);
- the verifier table (verifiers);
- the logged pin changes (verifier_changes);
- the out-of-lane files and the hard-rule audit (below);
- what's open (open).

The lead can write and commit REPORT.md on claude/r4-cards-20261009 from it. The PLAN's two wrong D4 lines carry dated corrections (3f7a646a).

### Review fix 3 (墨 card lift, player.css)

- --kp-panel #1a2330, --kp-stage #030406, --kp-panel-2 #1f2836. The study ground's glow was cut from 0.06 to 0.035.
- --kp-card-depth for 墨 is a 12% white inset top edge plus a 4% white outer hairline. The black-shadow claim is dropped.
- Sampled 1.29–1.30:1 (it was 1.16–1.18:1). contrast-kotoba: every pair clears its floor.

Shots: shots/day-en/deck-front.png; shots/night-en/deck-front.png

### Review fix 4 (blood craft, guided-moments.css)

(a) At ≤600px the pool sits at right 11% (width 27%) and the spray at left 64% (width 28%). The red now ends at x=706 at 2100 ms against the frame line at 759 (it was 764).
(b) The spray is SVG teardrops and a splat along one ballistic curve.
(c) The scraps carry torn-edge stains in three shapes, and every fifth scrap is clean.
(d) Three drops fall under gravity (linear between t² samples) and vanish exactly on the ground line. Paused frames r0800 and r0960 show the fall, and r1250 shows only the pool.

Shots: shots/extra/samurai-frames/playful-390-r{0400,0800,0960,1250}.png; shots/extra/samurai/samurai-playful-2100.png

### Review fix 5 (fmtWait plurals, thousands separator)

- mount.js has fmtN (en-US grouping) and nounEn helpers. fmtWait prints singular units for 1 and drops '.0' on whole years.
- The home counts, tiles, Begin button and paused-cards line use them.
- verify-kotoba-mine has waitOk, whose number-agreement rule refuses '1 days', '2 day', '1.0 years' and '1 years' (checked against those strings with node). holds() is widened, and the 'Begin — 1 card' and tiles pins changed. All logged.

Shots: shots/extra/day-en/mcd-home.png; shots/<mode>/deck-back.png

### Review fix 6 (bare 'Examples' / 'Lecture' chips on the front)

- The source chip and register chip left the front, so the chip line is kind · topic · level · state. The back's Source fold names a written passage's style in full on its first line.
- CARD_CONTRACT_V2 §9 is amended (2026-10-09).
- The verifier's passage pilot check now asserts the topic chip, no register or source chip, and one row. A new check covers the Source fold's style line on 3 cards. Logged.
- The label lines for LABELS.md are in ~/.dharma/bunki_review/2026-10-09/r4/notes/cards-lane-labels-note.md. I sent no message to any lane.

Shots: shots/<mode>/deck-front.png; shots/extra/<mode>/mcd-front.png; shots/extra/<mode>/mcd-source.png

### Review fix 7 (the stretched one-sentence front)

- Shipping (a): the card holds only its content, and the bare stage around it is also a tap that reveals (mount.js studyScreen). The stage-tap probe passed, including its control.
- (b) is kept as docs/redesign/r4/cards/options/front-b.css and shot by injecting it.
- I chose (a) because it is the tighter of the two and the closest to a native card app: the key never moves, and the empty part is the stage, not a box. I didn't disagree with any finding.

Shots: shots/options/{day-en,night-en,day-ja}/front-a.png, front-b.png, front-a-n1.png, front-b-n1.png

### Brief §4: files touched outside the lane's set (and why)

- prototypes/corridor/corridor.js: one line, the English names of the two 言葉の鉱脈 decks in DOJO_DECKS, so Learn and the deck home say the same thing.
- prototypes/corridor/maintenance/report-client.css: 5 lines. Under reduced motion the report button's colour transition is none. It was the one animation still running, and it failed kotoba-mine (e) on the base.
- prototypes/corridor/decks/kotoba-mine/deck.json and kotoba-mcd/deck.json: titleEn and one method line each. A structural JSON diff against 345dba92 shows nothing else changed.
- decks/kotoba-mine/tools/build.py: the same titles and method lines, so a rebuild keeps them.

The deck verifiers' grade-button pins (verify-kotoba-mine.mjs, tools/verify-redesign-docks.mjs, contrast-kotoba.mjs) are in scope by the brief and logged.

### Brief §5: hard-rule audit

- `git diff --name-only 345dba92..HEAD -- data/fsrs-pin.json prototypes/corridor/decks/player/engine.js decks/n2n1/source prototypes/corridor/decks/n2n1` prints nothing.
- The deck.json files differ only in /titleEn and one /method[i] each, so no card or Anki id moved.
- The Anki tuples in build.py are unchanged context lines.
- In corridor.js only DOJO_DECKS changed. No storage or record marker was touched, and the bunki-cloze:* keys are unchanged.
- Motion is transform and opacity only. Option (b)'s mask is static. No fonts were added.
- Commits are on the lane branch only. Nothing was pushed or merged, nothing was stashed and no history was rewritten.
- Server 57104 was stopped at 2026-10-09 01:03 JST.

## Verifiers (base → final)

| Verifier | Base | Final | Note |
|---|---|---|---|
| verify-kotoba-mine | exit 1: 151 ok, 1 fail ((e) under reduced motion); the same on a re-run | exit 0: 158 ok, 0 fail (refine2, build 5ba016df) | Before the review (build 81ee06a5): exit 0, 155 ok. The base failure was the report button's 200 ms colour transition, fixed in maintenance/report-client.css. The first refine run (d49c77fe) had 156 ok and 2 fail, both the delete-and-restore check's '1 cards' pins. Those were changed on purpose in f460a8e2 and logged. Logs: R4/cards/verify/logs/verify-kotoba-mine-{base,base-rerun,final,refine,refine2}.log |
| verify-n2n1-decks | exit 0, status passed | exit 0, status passed (refine2) |  |
| verify-personal-collections | exit 0 | exit 0, 9 passed (refine2) |  |
| verify-dojo-door | exit 0, DOJO DOOR CLEAN (30 rooms × widths) | exit 0, DOJO DOOR CLEAN (refine2) |  |
| lint-ui-language-core | exit 0, no room errors, no shell issues | exit 0, no room errors, no shell issues (refine2) |  |
| verify-corridor-accessibility | exit 0, 53/53 | exit 0, 53/53 (refine2) |  |
| sw-shell | exit 0, 8/8 | exit 0, 8/8 (refine2) |  |
| verify-redesign-docks (extra; pins the pads) | exit 0, 24/24 | exit 0, 24/24 (refine2) |  |
| verify-guided-session (extra; the samurai) | exit 0, 211/211 | exit 0, 211/211 (refine2) |  |
| verify-corridor-storage-integrity (extra) | not run | exit 0, PASS, 26 checks (refine2) |  |
| contrast-kotoba (extra; token pairs) | every pair clears its floor | exit 0, every pair clears its floor | 墨, before → after: passage 15.92 → 14.70 (floor 7); muted 5.36 → 4.90 (floor 4.5). A #222d3b second panel would have left muted at 4.60, so it ships as #1f2836. Log: verify/logs/contrast-kotoba-refine2.log |
| kotoba vitest suites (tools/kotoba-*.test.mjs, 8 files) | not run | exit 0, 236/236 on the final source | The receipt the reviewer asked for: verify/logs/vitest-kotoba-refine2.log (and -refine.log at d49c77fe) |
| probe: stage tap (scratchpad cards-refine/stage-tap.mjs) |  | A tap on the bare stage reveals the back (4 pads, 0 ledger rows written). A tap on the count text, the control, reveals nothing. Card bottom 364px, key top 709px. | Not a repo verifier. It proves the new tap path of option (a). |
| probe: 墨 lift sampled from the shot (cards-refine/lift.mjs, 5×5 patches) |  | day-en/deck-front.png: card rgb(26,35,48) on stage rgb(4,5,7)/rgb(3,4,6), 1.29–1.30:1 | It was 1.16–1.18:1 at 2e1f43cd. The reviewer sampled 1.11:1 on the head he toured, and 1.23:1 for an iOS dark elevated surface. |
| probe: blood against the frame (cards-refine/redscan.mjs) |  | At 390@2× the blood's red ends at x=706 at 2100 ms and x≤739 at 1150/1300/1600 ms. The frame's inner line is x=759. At 320@2× (r0400) it ends at x=607, inside the frame. | Before this pass, the 2100 ms frame's red ran to x=764, past the line. |

## Verifier changes (also logged in `docs/redesign/VERIFIER_CHANGES.md`)

- verify-kotoba-mine, four-pad check: the wait regex /^[\d.]+ (min|hr|days|months|years)$/ becomes waitOk(). A unit is singular exactly when the number is 1, with no '.0'. This is stronger: it refuses '1 days', '2 day', '1.0 years' and '1 years'.
- verify-kotoba-mine, holds(): it parses the same units in either number through WAIT, refuses whatever waitOk refuses, and reads a singular unit as its plural's length. The years tolerance (±0.05) and the stored-interval assertion are unchanged.
- verify-kotoba-mine, 'Done for today / Begin' mode check: self === 'Begin — 1 cards' becomes 'Begin — 1 card'.
- verify-kotoba-mine, delete-and-restore check a) on both decks: /1 cards/ and /^1 cards \(Remove 1\)$/ become /^Begin — 1 card$/ (matched whole, so stricter) and /^1 card \(Remove 1\)$/. The refine run's first pass found these.
- verify-kotoba-mine, T2 tiles check: /^\d+$/ becomes /^\d{1,3}(,\d{3})*$/, and the start button's number is read without separators. due + new = start, one row, ≤72px and the four colours are unchanged.
- verify-kotoba-mine, passage pilot chip check (the pilot card and two full-run cards): 'register chip on the front, with the aria-label naming the source' becomes 'topic chip on the front, no register or source chip, no group chip, one row'. A new check after the reveal requires the Source fold to read 'Style <the register's full name>'.
- All are logged in docs/redesign/VERIFIER_CHANGES.md under '## Round 4 cards lane, review and refine (2026-10-09, Mac)'. The earlier D1/T2 pin changes are in the block above it.

## Still open (the lane's own list)

- docs/redesign/r4/cards/REPORT.md still needs writing by the lead (not a subagent). The harness refused my Write of a report .md, and this output carries its content.
- His choice, the front: option (a) ships (the card holds its content), and option (b) is options/front-b.css. If he picks (b), its fade is relative to the card's height, so on a long passage the frame fades halfway down. It would need a version that knows the content's length.
- His call, the blood: the age rating (likely 13+) and whether blood stays on by default in playful mode.
- The deck's English name conflicts across lanes. The skin lane's LABELS.md proposes 'Your word list · one real sentence each' and 単語帳・実例文で一語ずつ; this lane ships 'Words you looked up · sentences' and keeps 言葉の鉱脈・文. The lead should pick one for the deck home, Learn's DOJO_DECKS and deck.json together. Reasons are in R4/notes/cards-lane-labels-note.md.
- LABELS.md proposals for this lane I didn't take, with reasons:
  - 良い for Good: I kept 正解, which matches the guided practice's 正解/不正解.
  - The rule-hint sentence: UI_RULE_TEXT pins it and A53 fixes it.
  - 'Whole passage · Just the sentence': it needs a layout check at 320 and 390 first.
- Settings' backup and restore messages still print '1 cards · 1 answers'. It is the same defect class, but verify-kotoba-mine pins it, and that screen was outside this round.
- 抹茶 and 黒板, the other dark looks: their card-on-stage lift was neither measured nor changed. Only 墨, the deck he toured, was.
- The blood is still drawn by code beside a painted samurai. A hand-painted blood sheet from the same source as the samurai sprites (guided/SAMURAI-PROVENANCE.md) would match the painting better. That is an asset job.
- At 390 some unstained paper scraps still fly past the frame line at 1150 ms. That is the base geometry of the scraps; the red scan finds no blood past x=739.
- The blood was checked at 1280×800 for position only.
- Not this lane's: the beige header and tab bar around the black deck belong to the skin lane.

## The independent review of the first pass

- **addressed**: T2 (the deck home): "this is nice, but things like *Real Sentences read and recall.. is just very confusing, obtuse and way to generic to mean anyhting at all..
- **partly**: T8 (Cards: the front): "More sharp, more depth, more contrast, more distinction."
- **addressed**: T9 (Cards: the back): "same as above, needs more clarity, more crispness, more tightness."
- **addressed**: D1 (Grade buttons on a card): "Four (Again · Hard · Good · Easy) — and color coded"
- **partly**: D4 (The samurai on a wrong answer): "Blood"
- **addressed**: Carry-on (no answer): T11 (the 2,000 cards): "the same contrast and crispness pass, and no rethinking"
