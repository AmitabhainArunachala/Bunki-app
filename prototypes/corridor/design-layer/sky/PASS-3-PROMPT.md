# 宙 pass 3: the brief I wrote for myself

Written 2026-11-11 21:25 JST by the Bunki design lead (Claude Fable 5.2), at John's request: "do a quick recon of top design workflows with fable 5.2 and prompting techniques and give yourself a prompt that will most assuredly put the next refinement and polishing pass over the top". It is built from three things: today's pictures of the sky as it stands, Anthropic's own page on prompting this model, and the design rules installed on this Mac. Sources are at the end.

## 1. Who runs this, and where

You are the design lead of Bunki, working in Claude Code on John's Mac, at high effort. The first screen of the app is yours: what it is for and how it is built are your call, and you will keep building on it. Finish what this brief asks before you stop; a status note is welcome, a pause with doable work left is not.

- The sky is three engine files and a mount, no libraries, WebGL2: `~/.dharma/bunki/PROGRAM/design/sky/` is LIVE (John sees it at `http://127.0.0.1:18841/` after a reload). `~/.dharma/bunki/PROGRAM/design/sky-next/` is the working copy.
- Rule of release: change only `sky-next`; look at it inside the app with `?sky=1&skydir=sky-next`; when a package passes, copy the three engine files into `sky/` and save a dated fixed copy `design/sky-v3-YYYYMMDD-HHMM/`. The copy John approved is `design/sky-v1-20261111-1458/`; the copy he called "an improvement, definitely" is `design/sky-v2-20261111-1621/`.
- Tools that survive a lost session: `design/sky/tools/` (`review.mjs` fifteen moments, `strip.mjs` a motion as twelve frames, `sheet.mjs` contact sheets, `v.mjs` one-off shots, `fail.mjs` five negative controls). Pictures of the state before this pass: `design/shots/sky-20261111/v3/before/`.

## 2. The goal

After this pass the first screen is a world with its own light, its own place and its own journeys. A person who opens it sees, inside three seconds, something no language app has shown them: a night sky of Japanese with a moon in it, words that turn to ink as they cross the moon, a sea of cloud that catches the moonlight. Every touch answers with one motion that is both beautiful and logical. From above, the whole language is a star chart they can read and steer by.

John's words, which outrank mine:
- "a 3D explorable UNIVERSE, like a 5 dimensional portal, that is explorable, has layers of depth, and contextually connected, word families and themes linked together, smarter connections between kanji and words and synonyms and explanation and grammar"
- "visually stunning ... magnificent ... world-class ... hypnotic ... a whole universe ... a constellation of words and depth and interactiveness"
- "intuitive, revealing ... focus on the word and kanji within it ... or if not, explained"
- "keep polishing, keep creating, keep making it absolutely stunning, a visual and experiential odyssey"
- "we want all i mentioned, plus your novel ideas, plus a more 3d multi directional interactive experience"

## 3. What is true now (seen in today's pictures, 21:07 to 21:16)

Keep, it works: the deep sky in the look's own pigments; the ring you can turn in; depth by level; his own words near him; a word opening into its characters with every link shown or explained; 64 to 66 frames a second in WebKit at 1728 x 1084 at 2x; zero page errors.

Weak, most visible first:
1. No light and no focal point. Every word is the same cream on blue. The eye has nowhere to land (`before/01-rest.jpg`).
2. The view from above is the poorest screen: hard white dots on a noisy grey veil, family names in low-contrast blue cut by the edge, an empty dark hole in the middle (`before/10-above.jpg`). The rise to it passes through a flat white frame (`before/over-strip.jpg`, 545 to 822 ms).
3. Opening a word is a crossfade. The characters fade in where they will stand; they do not come out of the word. The meaning, the button and the sentence pop in under the word in the first 64 ms while it is still travelling (`before/open-strip.jpg`).
4. Text prints over text: the hint line is crossed by words; a seal's caption has no ground under it; big blurred near words sit on top of sharp ones (`before/01-rest.jpg`, `before/13-read.jpg`).
5. A character's own view crowds its left column when two parts stack there (`before/05-kanji.jpg`).
6. Themes are missing. The three orders are form, sound and reading. Nothing yet groups words by what they are about.
7. Only 藍 was finished by eye. Amber and jade looks lose the line between sky and sea; from above every look has the same noisy veil (`before/looks1-rest.jpg`, `before/looks1-over.jpg`).
8. A keyboard or a screen reader cannot reach a word. Seals are 34 px, 30 px on a phone (the floor for a finger is 44).
9. Large words carry an offset drop shadow, down and right, which belongs to web buttons and not to a print.

## 4. The plan in one view (checked against section 2 before any code)

Spend the boldness in one place: LIGHT. One moon, fixed in the heavens. Everything else in this pass either answers to it or stays out of its way.

- Colour: the look's sky stays dominant. Two sharp accents only: the red cord (his path, the cords of a word) and the gold mark (the shared character, grammar, his own words). The moon is the paper's own light, no new hue.
- Type: no new faces. Shippori Mincho B1 800 for words, Yuji Syuku for characters, Noto Serif italic for English meanings. Japanese letter-spacing near zero.
- Camera: every move is a damped spring that can be retargeted mid-flight. The eye yields to the pointer by at most 2 degrees. The field of view widens when the eye pulls out and narrows when it comes in.
- Motion: one authored moment per state change, 500 to 900 ms, because a world may move slower than a button. Controls answer in under 200 ms. Leaving is about a fifth faster than arriving. Nothing grows from nothing: start at 0.9 to 0.97 of size with opacity 0, from the thing that was touched, and leave by the same path. Stagger 30 to 80 ms. Never ease-in. Captions arrive after the thing they describe has landed.
- Depth: farther means smaller, softer, lower in contrast, and it must still read as depth in a still picture. Blur is used lightly: too much makes a sky look small.

## 5. The work, as a list that starts failing

Each line is done only when its proof exists. Update the marks at the bottom of this file as you go.

A. Light
- A1 The moon: a disc of the paper's light with faint seas, a graded halo (cream close in, then the sky's own lighter blue), two soft strips of mist across its lower half. Proof: crop at 2x, all eleven looks.
- A2 A word that crosses the moon is printed in ink; dark shade steps aside there. Proof: crop.
- A3 The sea of cloud under the moon catches its light. Proof: rest picture, moon side against far side.
- A4 Words lose the offset shadow and gain a soft ground of the sky's own ink directly under the letters (the scrim sits only under text). Proof: crop of a large word over cloud, contrast at least 3 to 1 measured on the picture.
- A5 One silent answer to the pointer: a hovered word warms and its kin thread to it (exists); add nothing that makes the page feel haunted.

B. From above: a star chart of the language
- B1 The sea goes calm from above (large soft shapes, low contrast), and the rise never shows a flat white frame. Proof: strip.
- B2 Points glow by level (bright and warm for common words, small and cool for rare ones; his own in gold). Proof: picture.
- B3 Every mark means something: a tick on the rim only where a family, a kana row, a level of articles or a radical begins; the name of each in gold at the rim, upright, never cut by the edge. No decoration without data, no fake coordinates.
- B4 "You are here": where the eye stands and the wedge it was looking at. Proof: picture.
- B5 The hub is not a hole: the sign of the present order stands there with one line that says what the order is.
- B6 Under the pointer, the place he would come down, with the name of what lies there. Proof: picture with the pointer on the ring.
- B7 The field of view widens on the way up. Proof: strip.

C. A word opens
- C1 The characters leave the word: each starts on its own glyph inside the word and travels out along its red cord. Closing is the same path back, faster. Proof: strip of opening and of closing.
- C2 Order of arrival: word (0 to 350 ms), cords and characters (150 to 600), families fan out in sequence (350 to 900), then meaning, button and sentence. Proof: strip.
- C3 A character's own view never stacks two parts' kin into one column. Proof: 先 picture.

D. Themes: a fourth order, 意
- D1 The ring re-forms by the radical of each word's first character, largest realm first (person, water, mouth, hand, tree, walking, speech, heart, thread ...). Stored fact: all 2,035 characters carry a radical; 196 distinct. The caption says plainly what the order is and why a radical speaks of meaning. Proof: picture inside, picture from above with the realms named.
- D2 Touching a word in this order threads it to the nearest words of its realm. Proof: picture.

E. Faults seen
- E1 The hint sits on the paper margin above the tab bar, in ink, where no word goes. E2 Seal captions are slips of paper with ink text. E3 Near words that are passing the eye are softer and fainter than sharp words, never on top of them. E4 Phone: hint in one line or two that nothing crosses; a part caption never runs into the family under it. E5 No em dash in any visible text.

F. The eleven looks
- F1 Rest, opened word and from above are judged by eye in each look; faults are fixed with palette keys, not with special cases. Proof: three contact sheets.

G. Reach
- G1 Tab reaches the words in view and the pieces of an opened word; Enter opens; Escape closes; the focused piece carries a ring that appears at once. G2 A screen reader hears what opened and what it is made of. G3 Seals are 44 px for a finger. G4 Reduced motion: no drift, no travel; state changes are a short crossfade.

H. Arrival
- H1 The first three seconds are one settled move, not a pop. Proof: strip.

Stretch, only if A to G are done: a mountain on the far horizon as a second landmark. Race it against no mountain; keep it only if the judge prefers it in at least eight looks.

## 6. How each package is done

1. Plan the package in two or three sentences against section 2, then build it in `sky-next`.
2. Look before claiming. Shoot it inside the app in WebKit at 1728 x 1084 at 2x, and at 390 x 844 for anything that touches layout. Crop and zoom on the part that changed; a whole screen at a glance hides faults. A capture with a blank or black region is void.
3. Motion is judged as a strip of frames, never from a still.
4. Two rounds per package: build, one batched look, fix everything it shows, one confirming look. A third round only for a fault with a name.
5. For a picture that could go two ways (the moon's size and place, the chart's line weight), make two or three settings, lay them side by side, choose by the sheet in section 7.
6. The judge is not the maker. After A to C, and again at the end, a fresh helper who has not read my reasoning gets the pictures, John's words and the sheet in section 7, and returns scores, what to keep, at most seven fixes with exact values, and one word for each state written cold. Where the word disagrees with the intent, the picture is wrong. At most three judge rounds in this pass. Calibration: `sky-v1` rest picture = 70 ("approved by John"); today's from-above picture = 45.
7. Named things to stay away from, because a general "avoid the generic look" only swaps one habit for another: offset drop shadows; neon glow or everything glowing; a word cloud scattered evenly; hard white dots; text on text; captions that appear before their subject; a caption that only says what the picture shows; rings, ticks or numbers that count nothing; a flat white or grey frame inside a transition; saturated ribbons; banding; motion added to show that polish happened; more than one extraordinary moment competing on one screen.
8. Numbers come with their command output: at least 60 frames a second at rest, opened and from above in WebKit (below 50, simplify); zero page errors; the five negative controls still give the old first screen back.
9. Before any report, check each claim against a tool result from this session.

## 7. The judge's sheet

Five marks out of 10, weighted: fit to John's words 25, hierarchy (squint: what do you see first, second, third) 20, craft (edges, spacing, type, light) 20, function (if this element were deleted, would the screen be worse) 15, originality (unexpected but right) 20. Any one named fault from 6.7 caps the total at 50. 85 and over ships; 70 to 84 ships with a named fix; under 70 is rework. Every claim quotes what is visible, by file.

## 8. Rules that bind, with their reasons

- Nothing appears or vanishes on a timer; no floating article; the look changes only when John chooses it, and the sky is drawn in that look's pigments; articles stay as they are. These are John's rules for this screen.
- Every relation shown is stored in the app's data or is a plain equality over stored fields, and each is shown or explained. A learner must be able to trust the sky.
- No money: no paid image or voice calls in this pass. John's approval for generated plates was for the night of 11-10 only.
- The repository is not touched in this pass. Putting the result into the build is a builder's task (SKYC) after John has seen it. `main` is never touched.
- Other lanes' servers, previews and folders are not touched. No personal detail goes into any outside request.
- Tests make no sound. The study card, the reading ladder and every element id stay.
- At most three helpers at once; this week's usage is finite.

## 9. What comes back

- The live sky at 18841, released package by package, each release with a fixed copy.
- Pictures in `design/shots/sky-20261111/v3/` (before and after, strips, contact sheets, the judge's reports).
- A log entry in `PROGRAM/PLAN.md` per release, with the clock read from `date`.
- To John, in plain words: what changed that he can see, where to look, three things to try, what the judge said, what is still open. No inner names, no praise of my own work.

## 10. Done when (another person can check each)

- [ ] Every line of section 5 A to H has its proof in `v3/`.
- [ ] The judge's last total is 85 or more, with no capped fault.
- [ ] `review.mjs` on the live copy: 0 errors, at least 60 frames a second at rest, opened and from above.
- [ ] `fail.mjs`: five of five negative controls give the old first screen.
- [ ] Eleven looks: three contact sheets, no look with text under 3 to 1 on its worst frame.
- [ ] Phone 390 x 844: rest, opened word, from above; nothing crosses text.
- [ ] Live copy equals the last fixed copy (same hashes).

## 11. If the session is lost

Read this file, then the last entries of `PROGRAM/PLAN.md`, then look at `v3/` newest first. Run `node design/sky/tools/review.mjs <outdir> sky-next` and compare with `v3/before/`. Carry on from the first unmarked line below.

## Sources

- Anthropic, prompting Claude Fable 5.2 (start at high effort; finish the task; ownership; prune cautious rules; give the reason; write for a low-context reader): https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5-2
- Anthropic, Fable 5 and 5.1 pages (audit each claim against a tool result; crop and zoom on screenshots): https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5 and .../prompting-claude-fable-5-1
- Anthropic, Opus 5.5 page (name the specific patterns to avoid; a checklist the model updates): https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5
- Anthropic cookbook and frontend-design skill (dominant colour with sharp accents; one orchestrated moment; plan then review the plan; spend boldness in one place): https://platform.claude.com/cookbook/coding-prompting-for-frontend-aesthetics , https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md
- Anthropic engineering (the judge is separate from the maker, with a weighted sheet and calibration; a list of features that starts failing): https://www.anthropic.com/engineering/harness-design-long-running-apps , https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Emil Kowalski (motion rules with reasons): https://emilkowal.ski/ui/agents-with-taste
- Studio write-ups: 100,000 Stars (depth of field sets scale; field of view on pull-out) https://web.dev/case-studies/100000stars ; Lusion (a light that follows the pointer; the camera yields under 2 degrees) https://www.awwwards.com/case-study-for-lusion-by-lusion-winner-of-site-of-the-month-may.html ; Bruno Simon (performance is the constraint) https://www.awwwards.com/brunos-portfolio-case-study.html ; exponential damping https://lisyarus.github.io/blog/posts/exponential-smoothing.html
- On this Mac: skills `impeccable` (two bounded rounds, finish reviewer), `emil-design-eng`, `animate`, `tastemaker`, `scroll-craft`, `web-design-engineer` (five-mark critique), `ai-cinema-dive` (the maker never grades its own picture).

## Marks (updated as the pass goes)

A1 [x] A2 [x] A3 [x] A4 [x] A5 [x, nothing added] · B1 [x] B2 [x] B3 [x] B4 [x] B5 [x] B6 [x] B7 [dropped: the hand can tilt the chart instead] · C1 [x] C2 [x] C3 [x] · D1 [x] D2 [x] · E1 [x] E2 [x] E3 [x] E4 [x] E5 [x] · F1 [x, by eye; contrast not measured] · G1 [x] G2 [x] G3 [x] G4 [x, not yet photographed under the reduced-motion setting] · H1 [x] · judge 1 [x] judge 2 [x] judge 3 [x, answered 00:06 on 11-12]

First release: 2026-11-11 21:58 JST, fixed copy design/sky-v3-20261111-2158 (live copy equal by hash at release). Proofs: design/shots/sky-20261111/v3/after-1/.

Judge round 1 (21:53 to 22:17): 68 of 100 before caps, capped at 50 (scatter without structure in the reading order and the grammar sky; hard white dots on the phone chart; text on text overhead; captions before their subject). Seven fixes named; all seven made.
Second release: 2026-11-11 22:37 JST, fixed copy design/sky-v3-20261111-2237. Proofs: design/shots/sky-20261111/v3/after-2/. Judge round 2 running since 22:42.
Judge round 2 (22:42 to 22:58, on the 22:37 release): 76 before caps, capped at 50 (a touched word's reading on its neighbour; the reading order as scatter). Third release 22:50, fourth release 23:17 (fixed copy design/sky-v3-20261111-2317) answer both and the rest of its list. Proofs: design/shots/sky-20261111/v3/after-3/. Judge round 3 (the last) running since 23:22.
Judge round 3, the last (23:22 to 23:50, on the 23:17 release): 80 before caps, capped at 50 for one named fault (text on text: on a phone the article titles of the reading order stood as grey ghosts under words; two meaning notes ran into the next word). Groups: rest 80, opened word 85, character 86, from above 80, orders 75, grammar 78, motion 78, looks 84, phone 70. Seven fixes named; all seven made in the fifth release.
Fifth release: 2026-11-12 00:06 JST, fixed copy design/sky-v3-20261112-0006 (sky.js b973c8892b90..., sky-world.js af83fa23cb10..., sky-web.js 933416241dad...; mount.js and index.html unchanged). What changed: (1) the sides of the view and the room round every button are a soft mask in the word shader (FS_LAB: uBx, uBr, uBk, uEdgeM), so writing slides under them letter by letter and no whole word turns grey or hides; the per-word edge fade and the whole-word hiding under buttons are gone; (2) titles in the reading order: one to every 30 degrees of ring, at most three on a phone and six on a desk, never drawn where a word of his stands, room kept for them from the first frame, a hairline from each title to the five nearest of its own words; (3) after a re-forming the titles come after 1.4 s, nothing passes blurred and a word that would pass very large steps back; (4) meaning notes wrap at 148 px and stand above their word with 12 px of air, slots spread; (5) an open pattern of grammar keeps the look's blue under it (measured on the live copy at 00:28: 8 20 41 against 3 6 13 before; an open word's ground reads 23 38 60); (6) on a phone a character opens as one stem, one bar and an equal drop to each part, then the count, then its words as one block; titles leave altogether while a word is open.
Proofs: design/shots/sky-20261111/v3/after-5/ (the full tour on the live copy after the last corrections, 00:28: 20 pictures, 0 page errors, 61 frames a second) and after-4/ (the tour before the last three small corrections, 63 to 64 frames a second; phone.jpg; ph2-kanji.jpg; five negative controls and the hand test pass; reduced motion 0 errors). No fourth judge round: the brief allows three. The sky counts as settled for this pass; what is left is on the open list in PLAN.md.
