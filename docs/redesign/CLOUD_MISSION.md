# CLOUD MISSION: Bunki, the best Japanese-learning app in the world

You're running in an Anthropic cloud environment. The repo AmitabhainArunachala/Bunki-app is checked out at branch `claude/redesign-20261008`. Use `gh`, or the GitHub tools, if either is available and authenticated; §6 says what to do if neither is.

The quotes in this file are lightly typo-corrected so they read easily. `vision/JOHN_10-08_VERBATIM.md` is the authority, with his typos kept.

John (the owner) is travelling, and **GitHub is the only channel that reaches him.** Run long. Iterate until you are proud of it. **Draft PRs only, never merges, never deploys.**

## 0. Read first, in this order, and hold it whole
1. `docs/redesign/vision/JOHN_10-08_VERBATIM.md`: John's words, verbatim.
   - **Message 1 is THE BRIEF**, the core.
   - **Messages 3–5 are direction:** "just hints, just direction". They tune the brief and must never replace it (message 7).
   - **Message 9 is THE BAR:** "it would make Dogen and Musashi and Basho and Hakuin to their knees crying at the beauty. As well as all the great 80s and 90s anime artists and directors. I mean this very very seriously! let's make it epic".
   - **Message 9b:** "singular focus on the best app in the world".
   - **Message 10:** "it has to make massive money and splash as a japanese learning app that rivals all the others!"
2. `docs/redesign/vision/bank-look.md`, `bank-learning.md` and `bank-founding.md`: 431 of his quotes since August, checked against their sources. His look and feel, his learning and life goals, and the app's founding soul.
3. `docs/redesign/vision/draft-journey.md` and `draft-engine.md`: two vision drafts (the experience as a journey; the learning engine).
4. `docs/redesign/research/SURFACE.md` (the code map: where the look lives, what verifiers pin, what must never move) and `INSPO.md` (the inspiration research).
5. Sol's foundation, already on this branch (draft PR #126): `docs/redesign/FOUNDATION.md`, `BASELINE.md`, `AFTER.md`, `VERIFIER_CHANGES.md`, `briefs/SOL_REPORT.md`. It gives:
   - the five-destination tab navigation Today 今日 · Read 読む · Learn 学ぶ · Words 辞書 · Me 私;
   - the EN/JA language law and lint;
   - Tokens v2 at the end of `prototypes/corridor/editorial.css`;
   - `html[data-room]` on every view.
6. `docs/redesign/reference/*.png`: today's look, the last three versions side by side, and Sol's foundation.

**The failure to avoid**, named by John himself: letting the latest hint or one line become the whole frame. "i need a holistic vision of what i want".

## 1. VISION: write `docs/redesign/vision/VISION.md` and `VISION-ONE-PAGE.md`
**A deep, holistic reframing of THE BRIEF**, from all the sources above. The world-lens draft is missing, so write that lens yourself, then synthesize. The structure:
- the vision in one sentence and one paragraph;
- who he is and what he's reaching for: N1, master's-level Japanese in his fields, his Japanese YouTube channel, Kanken 1級;
- the feeling: layers of depth, clarity and calm, balanced with the engaging, soothing, crisp and deeply detailed recursive animation of masters;
- the world: ancient Japan × cutting-edge tech Japan × beautiful, hyper-detailed cyberpunk Japan; cyberpunk meets washi;
- the experience: quick, punchy, clean, organised, never confusing; rooms distinct yet one family; no clutter; the EN/JA law;
- the learning: the recursive word ↔ kanji ↔ parts ↔ siblings ↔ passages ↔ grammar ↔ culture; reading feeds cards and cards feed reading; compounding cards; a daily ritual; honest, beautiful progress;
- the ambition: falling in love, tears, viral, the best on the planet, and **massive money**. Positioning against Duolingo, WaniKani, Bunpro, Satori Reader, Migaku, Renshuu and LingQ; the shareable moments; freemium to subscription, with premium shown tastefully; the App Store path (the repo already has native CloudKit code); content rights for commercial use (JMdict CC BY-SA share-alike, Wikinews and Global Voices CC BY, Aozora public domain, AI pictures' terms);
- the laws (always, never);
- **two tracks:** an evolution of today's app, AND a from-scratch version ("show me both");
- how we'll know: THE BAR, plus concrete checks;
- an appendix of the verbatim quotes used.

Then **self-check it adversarially**: anything omitted, collapsed, over-weighted, or put in his mouth? Fix it. Commit and push.

## 2. CONCEPTS: four, under `docs/redesign/concepts/<key>/` (HTML/CSS/JS prototypes, mobile 390×844)
Each answers the WHOLE vision; its angle is only a lens.
- **A 磨き Migaki: evolution, refined.** Precision; layers of depth and clarity; materials you can almost touch; every room distinct yet one family.
- **B 夜の文机 Night Desk: evolution with a signal layer.** Cyberpunk meets washi; light that traces meaning; hairline patterns; a luminous day and a 藍 night that glows like Tokyo seen from a quiet room.
- **C 生きた本棚 Living Shelf: evolution made alive.** The recursive animation of masters; the sky of words becomes the word web you move through; motion like ink and breath.
- **D 白紙 Hakushi: from scratch.** A blank page that keeps only the energy and the content.

Each needs:
- **Five screens** on the five tabs:
  - Today (the daily loop);
  - Read (the shelf, an open article, the word popup);
  - Learn (a card front and back, in passage form with furigana);
  - Words (the word web);
  - Me (progress).
- **Day and night.**
- **Real content:** article pictures from `prototypes/corridor/data/articles/pictures/`, and cards from `prototypes/corridor/decks/n1/deck.json`.
- **Fonts:** only the bundled faces (Shippori Mincho B1, Yuji Syuku, Kaisei Tokumin) and the system stacks.
- **Motion:** transform and opacity only.
- **`SPEC.md`:** Tokens v2 values, a per-`[data-room]` identity, a component map, and every animation.
- **Evidence:** screenshots, plus a playwright-recorded motion journey with an 8–12-frame contact sheet.

Refine each concept at least twice, until you are proud of it.

**Then judge all four**, scoring 0–10 on beauty, clarity, engagement, Japan depth and buildability, plus fidelity to VISION.md, through four lenses:
1. John himself.
2. A top Tokyo product designer.
3. A growth and learning-science lead.
4. THE BAR panel: 道元, 宮本武蔵, 芭蕉, 白隠, 大友克洋, 押井守, 宮崎駿, 今敏.

Write `docs/redesign/concepts/JUDGEMENT.md`. **Choose the best EVOLUTION** plus its grafts, and keep 白紙 as a full prototype for comparison.

## 3. BUILD: the chosen evolution, into the real app, on this branch
Follow `docs/redesign/plan/STAGE2_PLAN.md` (Stage 2):
1. **Merge Astra's 2,000 cards:** `git merge origin/claude/n2n1-decks-20261007` (PR #124; the N2 358, N1 666 and 専門 976 decks).
2. **Apply the skin through Tokens v2**, then a per-room identity through `html[data-room]`.
3. **Register modular room stylesheets** `prototypes/corridor/rooms/{today,read,learn,words,me,cards}.css` once, in index.html, sw.js SHELL, scripts/corridor-assets.mjs, tools/build-standalone.mjs and tools/sw-shell.test.mjs.
4. **Rebuild each room:**
   - **Read:** the shelf, the reader and the popup; woodblock pictures at a natural crop; no "coming soon".
   - **Learn:** the old 集中道場 split into clear sections, with live counts.
   - **Words:** the word web, as a new module on the existing data (dict, kanji anatomy, deck tokens, gloss_ja, grammar).
   - **Today** and **Me.**
   - **The deck players** (`decks/player`, `personal`, `context-dense`), with the zero-leak guards holding.
5. **The front-door word sky** is evolved only gently, and only if the vision demands it.

Setup:
```
npm ci
npx playwright install --with-deps chromium
pip install fugashi==1.5.2 unidic-lite==1.0.8 genanki==0.13.1
```
Build: `node scripts/build-corridor-site.mjs --out <dir>`. Serve: `KAIRO_SITE_DIR=… KAIRO_ARTIFACT_SHA256=… node scripts/serve-corridor-dev.mjs --port N`.

## 4. VERIFY: the verification law
- **Name the verifier before writing code.**
- **Run Sol's F1 subset before and after:** verify-corridor, storage-integrity, corridor-doors, dojo-door, design-reader-shelf, relief, theme-consistency, accessibility, experience, kotoba-mine, n2n1-decks, personal-collections, sw-shell, plus `tools/lint-ui-language.mjs`.
- **Never weaken a behavioural assertion** (storage, SRS, ledgers, offline, zero-leak fronts, 44px hits, contrast). Change a cosmetic or label pin only deliberately, logged in `docs/redesign/VERIFIER_CHANGES.md`.
- **Never touch:** the storage and record markers in corridor.js (SURFACE §3), `data/fsrs-pin.json`, card ids, `bunki-cloze:*` keys.
- **Tour every room** at 390×844: day and night, EN and 日本語. **Look at every screenshot yourself.** Judge them against VISION.md and THE BAR, fix what falls short, and repeat.

## 5. SHIP: the cloud-run rules (anything left on the runner's disk is lost to him)
- **Commit everything** (vision, concepts, screenshots, contact sheets, logs) under `docs/redesign/`, and push often.
- **Update draft PR #126:**
  - title: "[DRAFT · DO NOT MERGE] Bunki: the 100x evolution";
  - body: at the very top, VISION-ONE-PAGE; then the four concepts with their motion contact sheets embedded as images; before → after per room; the verifier table; the honest coverage (what works, what's placeholder); open decisions.
  - Comment on #126 when each phase finishes, so he can follow along from his phone.
- **Open a separate draft PR** for 白紙 (from scratch) as a standalone prototype, so he can compare ("show me both").
- **Never block on him.** Take the best path and note the question in the PR.
- **Log** progress in `docs/redesign/CLOUD_LOG.md` with UTC times.

## 6. If the environment fights you (never stop; route around it)
- **Push to `claude/redesign-20261008` refused:** push to the branch this session is allowed to use. Name it at the top of `CLOUD_LOG.md`, and open (or describe) a draft PR from it.
- **No `gh` or GitHub tools:** write the PR body to `docs/redesign/PR_BODY.md`, and your phase reports to `CLOUD_LOG.md`, then commit and push them. The pushed branch is what reaches him.
- **Playwright can't download Chromium:** look for one that's already installed (`ls ~/.cache/ms-playwright`, `which chromium chromium-browser google-chrome`), and point `PLAYWRIGHT_BROWSERS_PATH` or `executablePath` at it. If there's no browser at all, finish all the static work, mark screenshots and verifiers as "not run here", and say so plainly.
- **`pip install fugashi` fails:** the decks are already built. Don't rebuild cards; only rebuild a deck if a verifier needs it.
- **Merge conflicts from Astra's branch:** for `decks/n2n1/**` and `prototypes/corridor/decks/{n2,n1,senmon}/**`, take Astra's side, then re-run `verify-n2n1-decks.mjs`.
- **Running short of context or time:** commit and push. Then write in `CLOUD_LOG.md` exactly where you are, and the next step, so the next run can resume from the repo alone.

## The standard
His words: "if just pretty it fails, if just functional it fails — it must be both." And: "don`t stok until you are proud of it" (don't stop until you are proud of it).
