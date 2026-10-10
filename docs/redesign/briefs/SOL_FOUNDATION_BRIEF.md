# Codex Sol (gpt-6.1-sol): the redesign FOUNDATION for Bunki

From the Claude lead, 2026-10-08 ~01:00 JST. John's direction tonight: "use and delegate to Astra and sol 6.1 as well use the whole estate. singluar focus on the best app in the world."

## North star: read first
- **John's words, verbatim:** `~/.dharma/bunki_review/2026-10-08/redesign/vision/JOHN_10-08_VERBATIM.md`.
  - Message 1 is THE BRIEF.
  - Message 9 is THE BAR: "it would make Dogen and Musashi and Basho and Hakuin to their knees crying at the beauty… I mean this very very seriously".
- **The holistic vision** is being written now at `~/.dharma/bunki_review/2026-10-08/redesign/vision/VISION.md`. Read it as soon as it exists. Until then, the brief is enough for your lane.
- **The code map:** `~/.dharma/bunki_review/2026-10-08/redesign/code/SURFACE.md`. Read it fully; it has the line numbers, the selectors verifiers pin, and the safe sequence.

## Your lane
**Engineering that every design direction needs, whichever concept wins.** Claude agents are designing four concept directions in parallel. When one is chosen, its skin and room designs land on top of your foundation. Build the foundation so that applying a concept is a matter of tokens, CSS and room markup, never re-plumbing. Make it fast, clean and modular.

Worktree `~/worktrees/Bunki-app/redesign_20261008`, branch `claude/redesign-20261008` (from `claude/final-integration-20261007`: main + #122 + #124). Python with fugashi: `~/.dharma/bunki_review/2026-10-05/gates/venv312/bin/python`. Build: `node scripts/build-corridor-site.mjs --out <dir under ~/.dharma>`. Serve: `KAIRO_SITE_DIR=… KAIRO_ARTIFACT_SHA256=… node scripts/serve-corridor-dev.mjs --port 57086`.

### F1. Baseline
Build the site and run the visual and navigation verifier subset, recording pass/fail per verifier in `docs/redesign/BASELINE.md`, so later failures can be attributed:
- `prototypes/corridor/tools/verify-corridor.mjs`
- `verify-corridor-storage-integrity.mjs`
- `verify-corridor-doors.mjs`
- `verify-dojo-door.mjs`
- `verify-navigation-returns.mjs`
- `verify-design-reader-shelf.mjs`
- `verify-relief.mjs`
- `verify-theme-consistency.mjs`
- `verify-corridor-accessibility.mjs`
- `verify-experience.mjs`
- `verify-kotoba-mine.mjs`
- `verify-n2n1-decks.mjs`
- `verify-personal-collections.mjs`
- `npx vitest run tools/sw-shell.test.mjs`

### F2. The language law (John: "No silly contradictions like the English setting showing japanese buttons")
- **Root cause** (SURFACE §1): `tx(ja, en)` falls back to Japanese when `en` is missing, plus literal Japanese in `el('button', …)`, `REGISTER_*` lists and aria-labels.
- **Rule:** in EN mode every piece of UI chrome (buttons, tabs, headings, labels, aria) is English, with the Japanese as an optional quiet subtitle where it adds beauty. In 日本語 mode it's Japanese. The Japanese CONTENT being learned is never translated away.
- **Fix every call site.** Add `tools/lint-ui-language.mjs`, a real Playwright check: render every room in EN mode, then flag CJK in chrome elements (button, [role=button], nav, headings, labels, aria-label), with an allow-list for learning content and named marks.
- **Verifiers:** update a verifier's label assertions only where they pin the old leaking labels, and log each one (below).

### F3. Design tokens v2
- **Where:** a fenced block at the END of `editorial.css` (SURFACE §4 explains why: no manifest changes).
- **What:** a complete, named token system: colour ROLES (ground, surface, ink, ink-2, accent, signal, seal, line…), a type scale, a spacing scale, radii, elevation, motion durations and easings. It maps onto today's variables, so today's look is unchanged by default.
- **Goal:** a chosen concept can later restyle the whole app by changing token VALUES.
- **Constraints:** keep relief (border + shadow) so `verify-relief.mjs` stays meaningful. No new fonts beyond the bundled Shippori Mincho B1 / Yuji Syuku / Kaisei Tokumin and the system stacks (offline PWA).

### F4. The navigation shell (John: "confusing navigation", "the dojo page having everything strewn together")
An ADDITIVE persistent bottom tab bar, appended in `render()` after the existing chrome. Five destinations; labels come from ONE table, through the language law:
- **Today 今日**, the daily loop. Until a Today room exists, route it to the review/home queue.
- **Read 読む:** the shelf and the reader.
- **Learn 学ぶ:** the decks, JLPT, the guided session and lessons. Split today's 集中道場 into clear sections.
- **Words 辞書:** search, kanji, grammar and the word web.
- **Me 私:** progress, collections and settings.

Constraints:
- It calls the existing `S.view = …; render()` paths, and keeps every existing id and class alive (`#back`, `#chrome-dojo`, `.bubble-shelf`, `#ginga-symbol`, the `#*-link` ids) so verifiers still resolve.
- It's hidden on the front door (the word sky stays untouched), in zen review/probe, and in sheet layers.
- It respects `env(safe-area-inset-bottom)` and the play-bar and store-alert docking (SURFACE §4).
- It goes behind `S.variants.nav = 'tabs'` (default on in this branch).

### F5. Room differentiation plumbing (John: "no more pages that look the same")
Extend `stampRegister()` so EVERY view stamps `html[data-room]`: shelf, reader, review, dojo/learn, deckplay, contextdeck, personal, mock/jlpt, guided, lessons, search, kanji, grammar, tray, settings and so on. Each room can then own its material and identity in CSS.

### F6. Verify, commit, push
- Re-run the F1 subset, then fix regressions in the code. A change to a verifier is allowed only where it pinned something the redesign deliberately changes (a label, a selector moved behind the tab bar), and every one gets a line in `docs/redesign/VERIFIER_CHANGES.md` (file, assertion, before → after, why).
- **Never delete or weaken a behavioural assertion** (storage, SRS, ledgers, offline, zero-leak deck fronts, a11y hit size and contrast).
- Commit after each step, and push the branch.
- Open a draft PR: "[DRAFT · DO NOT MERGE] Bunki redesign foundation (Sol): language law, tokens v2, tab-bar navigation, room stamps", with BASELINE vs AFTER results and 390×844 screenshots of each room in EN and 日本語 mode. Look at the screenshots yourself.

## Hard rules
- No merges to main, no force-pushes, no history rewrites, no bare `git stash`.
- Don't touch:
  - the storage and record markers in corridor.js (`STORE_KEY`, `storeEnvelope`, `loadStore`/`hydrateStore`/`validStoreEnvelope`/`commitStorePatch`, `recordWritable`/`recordApp`…; SURFACE §3);
  - `data/fsrs-pin.json`, card ids, `bunki-cloze:*` keys;
  - `decks/n2n1/source/**` (Astra's lane);
  - the front-door word sky (`drift-layer.*`).
- Never shell-read `~/.dharma/agent_keys.env`.
- Report at `~/.dharma/bunki_review/2026-10-08/redesign/briefs/SOL_REPORT.md`: what was done, the verifier results before and after, what's left.
