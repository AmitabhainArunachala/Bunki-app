# Build brief: the chosen evolution, into the real app

Every build lane reads this file first. **The look and feel we are building is C 生きた本棚 Living Shelf, polished with A 磨き's craft, plus the grafts.** The authority is `docs/redesign/concepts/JUDGEMENT.md`; read it whole, including the 10 build gates.

## Read first
1. `docs/redesign/concepts/JUDGEMENT.md`: the choice, the grafts and the gates.
2. `docs/redesign/vision/VISION-ONE-PAGE.md`, then VISION.md §5 (experience), §8 (laws) and §10.2 (checks).
3. The concepts you build from:
   - **C** (`docs/redesign/concepts/c-living-shelf/`): SPEC.md, NOTES.md, `css/`, `js/`, `shots/`.
   - **A** (`docs/redesign/concepts/a-migaki/`): its SPEC.md, typesetting, night woodblock and Me book.
   - **B** (`b-night-desk`) and **D** (`d-hakushi`): only for the specific grafts JUDGEMENT names.
   - Look at the screenshots. The prototypes are the visual target; the real app must reach that level.
4. `docs/redesign/plan/ROOM_MAP.md`: functions, DOM, data, verifier pins (B = behavioural, C = cosmetic) and lane boundaries.
5. `docs/redesign/FOUNDATION.md`:
   - Tokens v2, the role names at the end of `prototypes/corridor/editorial.css`;
   - `tx`/`withEn`/`biLabel`, the EN/JA law;
   - `PRIMARY_TABS`;
   - `html[data-room]`.
6. `docs/redesign/cloud-baseline/RESULTS.md`: how to build and run verifiers in this container, and the known flakes.

## Hard rules (never break)
- **Never** edit the storage/record blocks in `prototypes/corridor/corridor.js` (`STORE_KEY` … `storeEnvelope` … `record*`, roughly lines 600–1611), or any function `verify-corridor-storage-integrity.mjs` slices by text.
- **Never** edit `data/fsrs-pin.json`, card ids, `bunki-cloze:*` / `bunki-srs-deck:*` keys, `decks/n2n1/source/**`, or `drift-layer.*` (the front door's word sky stays as is).
- **Never weaken a behavioural verifier assertion.** This covers storage, SRS, ledgers, offline, zero-leak card fronts, 44px hits, contrast, overflow and reader font-size ranges.
  - A cosmetic or label pin may change only deliberately, with an entry appended to `docs/redesign/VERIFIER_CHANGES.md` (file:line, old → new, why it's cosmetic).
  - **Name the verifiers for your change before you write code** (from ROOM_MAP).
- **Keep:**
  - every existing id and class that verifiers select (restyle them; don't remove them);
  - the four grade buttons;
  - the reader's numeric typography ranges;
  - relief (border plus shadow) on the surfaces `verify-relief` checks.
- **Motion:** animate only transform and opacity, and honour `prefers-reduced-motion`. A fade-in must never leave a control's ancestor at opacity 0 when the accessibility check samples it; use `animation-fill-mode: backwards` with a short duration, or start at opacity 0.01 and settle to 1.
- **Fonts:**
  - bundled faces only: Shippori Mincho B1 (weight 800), Yuji Syuku (400), and Kaisei Tokumin, which has 4 glyphs;
  - otherwise the system stacks;
  - no new font files or network requests.
- **EN/JA law:**
  - In EN, no Japanese chrome (`tx(ja, en)` needs both arguments, and throws in EN without one).
  - In 日本語, Japanese chrome.
  - Learned Japanese is marked `data-ui-content='learning'` with `lang='ja'`.
  - Run `node tools/lint-ui-language.mjs --core-only` before you finish.
- **Honest data:**
  - no fake learner numbers in the real app;
  - time estimates are computed or omitted;
  - kanji parts come from `D.kanji[c].parts` / `D.radicals`, never hand-picked;
  - the word of the day is never a card that is due today.
- **CSS placement:**
  - put CSS in your room's `prototypes/corridor/rooms/<room>.css`, scoped by `html[data-room=…]`;
  - shared tokens and skin go only in the Skin lane's region (the end of editorial.css after the token fence, or `rooms/` shared rules).
  - Deck players inject their own CSS later, so prefix rules with `html[data-room=…]` to win.

## How to check your work
- **Build and serve:** see `cloud-baseline/RESULTS.md`.
  - Always `export PLAYWRIGHT_BROWSERS_PATH=/root/pw KAIRO_BROWSER=chromium PERSONAL_BROWSERS=chromium`.
  - Build output and evidence must be under `/root/.dharma/…`.
- **Quick visual loop:** serve `prototypes/corridor/` from the source tree. `node scripts/serve-corridor-dev.mjs` or a static server works, but check how the verifiers serve it. Then screenshot at 390×844 with Playwright in:
  - day: the default world;
  - night: the yoru world, `localStorage['kairo-theme']='yoru'`, or whatever FOUNDATION/ROOM_MAP says sets a night world;
  - EN and 日本語.
- **LOOK at your screenshots** (Read tool) and compare them with the concept's shots. Iterate until it matches the concept's quality.
- **Evidence:**
  - Save before/after screenshots of your room to `docs/redesign/build/<room>/before-*.png` and `after-*.png` (day and night, EN and JA; 390×844 @2x is fine).
  - Write a short `docs/redesign/build/<room>/REPORT.md`: what changed, which verifiers you ran and their results, and what is still a placeholder.
