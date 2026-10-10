# Bunki redesign — code surface map (read-only survey, 2026-10-08)

Worktree: `/Users/dhyana/worktrees/Bunki-app/final_20261007` (HEAD 2ba2967f). Root = `prototypes/corridor/` (call it `C/`). Nothing was edited.

## 1. Where the visual design lives

### Stylesheets (load order from `C/index.html`; later wins)
| File | Bytes | Role |
|---|---:|---|
| fonts.css | 137,717 | 182 `@font-face` unicode-range slices (122 Shippori Mincho B1, 58 Yuji Syuku, 1 Kaisei Tokumin) |
| corridor.css | 210,725 (8,293 lines) | base: `:root` tokens (l.12), 10 world palettes (`:root[data-theme=…]` from l.2049), all rooms, chrome, sheet |
| reference-ui.css | 12,178 | reference library |
| drift-layer.css | 14,243 | the word sky (front door; "perfectly fine", leave) |
| skip-ui.css | 7,897 | SKIP kanji finder |
| register.css | 26,907 | per-room "material" via `<html data-room>` (door/shelf/hall/attempt/results/jlpt/tutor/review/threshold) |
| maintenance/report-client.css | 10,161 | bug-report entry |
| **editorial.css** | 156,226 (3,292 lines) | LAST sheet, the "iOS feel" layer: redefines tokens on `body` (--page --surface --glass --shadow-* --r-card 16 --r-control 12 --ease --dur 220ms, --t-* sizes, --sans SF stack) and restyles almost everything. Most of the look is decided here; it overrides corridor.css |
| guided-session.css 31,972 / guided-moments.css 19,019 | guided lessons | loaded by their modules |
| decks/player/player.css | 34,749 | kotoba decks player (own tokens, own HTML-string renderer) |
| decks/personal/personal.css | 14,517 | private collections player (own renderer) |
| decks/context-dense/context-deck.css | 10,435 | 文脈札 deck |

Total CSS ~686 KB. `corridor-standalone.html` is a 71 MB single-file build (inlines everything incl. fonts) made by `scripts/build-standalone`/`tools/build-standalone.mjs`; every CSS file also appears in `scripts/corridor-assets.mjs` (asset manifest) and `sw.js` SHELL/PRECACHE lists.

### Theme tokens
- Base `:root` in corridor.css: `--ground --ground-2 --ink --ink-2 --red --line --faint --serif --sans --t-read 21 --t-hero 30 --t-body 16 --t-label 12 --t-chrome 13 --tap 44px`.
- 10 public worlds (`PUBLIC_THEME_IDS`, corridor.js l.27207): sumi shu iwa rokusho yoru hokusai akafuji nami keyblock hakuu; each a `:root[data-theme]` block. Default (no data-theme) = ベロ藍・浪 on cream. Night worlds: rokusho yoru nami hakuu kaku. UI metadata `THEME_UI` (l.27141), storage key `kairo-theme`. editorial.css derives surface/glass/shadow from the world's `--ground/--ink/--ai`, so a re-skin should change tokens, not worlds.
- Variants as body classes: `v-contrast-wcag`, `v-depth-layered` (default), `ui-bi`, `zen`, `ginga`, `ginga-open`; `body[data-view]`, `html[data-room]`.

### Fonts, offline
`C/fonts/`: 182 woff2 (7.0 MB; hash-named `shippori-<10hex>.woff2`, `yuji-…`, one kaisei) + OFL licence. Declared in fonts.css with `font-display: swap` and unicode-range slicing, linked first in index.html, precached by sw.js (`fonts.css` in SHELL, slices fetched on demand and cached). Body UI text actually uses the system stacks (`--sans` SF/Hiragino, `--serif` Hiragino Mincho/Yu Mincho); bundled Shippori/Yuji are the display/ink faces. A new bundled face = re-subset + new hashed files + sw/manifest entries + standalone rebuild. Safer: keep the stacks, change weights/sizes/tracking.

### Inline styles in corridor.js
Not a styling channel: 0 `style="` literals, 0 `cssText`, 71 `.style.` writes (positioning/measurement, CSS vars like `--stage`). Markup is built with `el(tag, class, text)`, `biLabel()`, and `innerHTML` SVG constants (GINGA_SYMBOL_SVG, SEARCH_SVG). So visuals are class-driven: restyling is almost entirely CSS. Per-deck players build HTML strings in their own files.

### Views and routes
corridor.js = 28,873 lines. State `S.view` (string), `S.stack` (sheet stack), `S.navOpen`. `render()` at l.28283 rebuilds `#app`: builds `.chrome` (back `#back`, crumb, level chip, `#chrome-dojo` door), optional galaxy chrome `buildGingaChrome()` (l.28080: `#ginga-symbol`, `#ginga-theme-seal`, `#ginga-search`, `#home-review`, `.nav-bar` with `#nav-review`, `.nav-dojo`, language slider, `.bubble-shelf`, `.bubble-sensei`), then a dispatch chain (l.~28680) `drift|entry|reader|tray|list|browse|srs-stats|review|probe|archive|dojo|deckplay|aiquiz|levels|ai|lessons|mock|kagami|thesaurus|airead|feed|publisher|source-inbox|source-reader|sentence-practice|kanjidex|yoji|grammar|guided|contextdeck|search|else renderShelf`. Back is `back()` (l.~4690, explicit per-view ladder). Room errors caught by `renderRoomError`. Then `stampRegister()` sets `html[data-room]` by sniffing DOM (`.mock-opts`, `.exam-score`, `.chat-log`, `#shelf-body`...) — DOM class names are an input to styling. Shelf doors are found by label text (`REGISTER_ROOM_DOORS`: いまの日本を読む, 日本語を持ち込む, 参考書庫, レッスン, JLPT の練習; `REGISTER_LINE_DOORS`: 読み物の好み).
Room renderers: shelf 5419, reader 9404, drift 9789, entry 9823, tray 10758, review 20309, dojo decks 21766, focus/dojo 21847. The dojo "cluster" John dislikes = `renderFocus`+`renderDojoDecks`; also personal/deck players are separate mount points (`personaldeck`, `deckplay`, `contextdeck`).

### The English-shows-Japanese contradiction (root cause)
`tx(ja, en) = bi() && en != null ? en : ja` (l.4031) and `biLabel(tag, cls, ja, en)`. Japanese is the default and English exists only where a call site supplied a second arg; any `tx('…')` with one arg, any literal Japanese in `el('button', cls, '…')`, `REGISTER_*` lists, and `aria-label`s leak Japanese in English mode. This is fixable in one place (tx/biLabel policy + a lint that finds one-arg tx and literal CJK in button text) with no storage pin involved.

## 2. What the verifiers pin

Verifiers are mostly Playwright walkers that serve `C/` (or `KAIRO_SITE_DIR`) and assert on real DOM; a few read source text.
- **Release orchestrator** `scripts/verify-release-gates.mjs` (4,930 lines) runs the battery, checks that editorial.css is precached and byte-identical offline (l.929–939 strings), asset hash of the built site, official-content denylist (`verify-no-official-content`), integration manifest.
- **Selector/id pins** (count of verifier files referencing): `#ginga-symbol` 23, `#back` 33, `#app` 24, `.shelf-open` 26, `.view-title` 18, `.bubble-shelf` 18, `#shelf-body` 7, `.chrome` 6, `.crumb` 3, `.chip` 4, `#home-review` 2, `#ginga-theme-seal` 1, `#chrome-dojo` (verify-dojo-door/verify-corridor-doors, required visible, in-viewport, `aria-current=page` in dojo, no `.chrome` sideways scroll, at several widths), room links `#levels-link #lessons-link #mock-link #kagami-link #grammar-link #thesaurus-link #yoji-link #kanjidex-link #ai-link #feed-link #source-inbox-link`, `body.dataset.view`, `[data-exam-level=N1]`, `[data-action=…]`.
- **Exact label strings**: `未確認` chip must read exactly that; `/no listening|聴解/`; `Loading tests|読み込み中` absence; 3-way back/crumb labels; verify-corridor.mjs (4,336 lines) is the biggest string/ID surface. Renaming nav labels or moving to a tab bar will red these.
- **Computed-style pins**: `verify-corridor-accessibility.mjs` (44px hit regions via `::before`, contrast ratios sheet/ink, `--paper-url` present as data URI, ground luminance), `verify-design-reader-shelf.mjs` (reader font-size read from `#reader`, ruby/rt sizes, story-picture-word size, background/colour contrast, fixed positions, no horizontal overflow), `verify-relief.mjs` (search/SKIP panels, shelf room doors, study-hall doors and listen row must carry a >=1px non-transparent non-hairline border AND a lifting shadow in the layered variant, section eyebrows an accent rule: a flat, no-border redesign fails it), `verify-theme-consistency.mjs` (10 worlds: computed grounds must belong to each world's token set across shelf→reader→review→sheet→dojo→search), `verify-experience.mjs` (reads `--paper-url`, title ink vs ground; 320px noOverflow on shelf/reference; hard-codes the tracked asset list incl. corridor.css), `verify-corridor-performance.mjs` (asset byte/stylesheet list; `corridor.css`, `drift-layer.css` named), `verify-writing-room.mjs` (reads corridor.css source l.674), `verify-offline.mjs` (editorial.css + design/ink-hoku-nami.png must be cached and match bytes).
- **Static CSS-name pins**: 20 verifier/scripts files name `corridor.css`, 8 name `drift-layer.css`, 5 `register.css`, 4 `editorial.css`, 3 `player.css`, 2 `personal.css`, 1 `context-deck.css`. Adding, removing or renaming a stylesheet means updating `index.html`, `sw.js` SHELL/PRECACHE, `scripts/corridor-assets.mjs`, `tools/build-standalone.mjs`, `tools/sw-shell.test.mjs` and the offline gates together.
- **Unit tests** (`tools/*.test.mjs`): sw-shell (SHELL array shape, `VERSION` derived from asset hash), kotoba-player-front/engine/host, deck leaks/rights/ruby/tokens (zero-leak build guard on deck fronts: do not restyle in a way that unhides answer text), official-content guards. Deck DOM ids are in `decks/**/tests`.
- **Source-text pins on corridor.js**: verify-corridor-storage-integrity.mjs extracts source blocks by marker (`between("const STORE_KEY = 'kairo-corridor-v1';", '// Only acknowledged changed roots')`, `definitions('storeEnvelope')`) and runs them in a `vm` context. Other verifiers slice named functions out of corridor.js the same way (20+ files read corridor.js). Do not rename or restructure those marker lines/functions.

## 3. The hard constraint: "storage-ledger line pins" — CORRECTED
Doctrine (docs/srs/brief-2026-10-04/integration.md l.34, HANDOFF_2026-10-04) says `docs/build-evidence/reading-r5-learning-loop-r5-20260815/residual-storage-callers.json` pins six `saveStore();` lines (1425, 2622, 2676, 2828, 3685, 16384) and the storage-integrity verifier asserts them, so any insertion above turns the suite red.

**Verified against this tree (HEAD 2ba2967f): that is stale.** `saveStore`/`writeStore` no longer exist in corridor.js (only a comment at l.15325); the six pinned lines now hold unrelated code (a CSS selector string, `sentenceDraftController.view`, etc.); `verify-corridor-storage-integrity.mjs` contains no `lineAfterPatch` check and its own ledger says historical counts were retired (l.1298–1300). The JSON only survives as a `checks.json` hash entry and in docs. I found no live gate comparing it. Caveat: I did not run the full battery, so confirm with one run of `verify-corridor-storage-integrity.mjs` before relying on this.

What a redesign still must not move, regardless:
1. The storage/record block markers named above, `STORE_KEY`, `storeEnvelope`, `loadStore/hydrateStore/validStoreEnvelope/commitStorePatch`, `recordWritable/recordApp/...` (l.~1355–1700, 15325 controller comment). Add new code BELOW these or in new modules; edit nothing inside them.
2. Anything that persists learner state; UI work stays in `S.variants`, theme key `kairo-theme`, bookmarks.
3. `render()`'s focus-restore / scroll-restore / inert-layer logic and the `stampRegister` DOM sniffing.
4. If you do touch lines above any pin anyway, recompute the JSON in the same commit (the documented rule), cheap insurance.

## 4. Safest way to do each layer

### (1) Global design-system re-skin — lowest risk, highest leverage
- Add ONE new final stylesheet `design-system.css` (or append a clearly fenced block at the end of editorial.css) that only redefines tokens on `body` (the same names editorial.css already owns: `--page --surface --glass --separator --tint --shadow-* --r-* --ease --dur --t-*`, plus new `--space-*`, `--type-*`, `--hit`) and restyles shared primitives by class: `.chrome`, `.chip`, `button`, `.card`, `.view-title`, `.sheet`, `.shelf-open`, `.grammar-link`. New buttons are a class-level change (the "buttons feel antiquated" fix), no JS.
- Do not delete ink/woodblock art or worlds; keep `.v-depth-layered` relief (border>=1px + shadow) so verify-relief stays green, or update that verifier deliberately in the same change.
- Language fix lives in `tx/biLabel` plus a CJK-in-English-mode lint (no pin involved).
- Blast radius: every room; visual only. Verifiers touched: theme-consistency, relief, accessibility (contrast, 44px), design-reader-shelf (reader sizes, overflow), experience (320px overflow), corridor-performance (if a file is added). If adding a stylesheet: update the 5 manifests listed in §2. Adding a block inside editorial.css avoids that entirely (recommended; already precached and byte-checked by offline gates, which self-update since they compare to the build).
- Do not touch decks players' own CSS in step 1 beyond mapping their tokens to the shared ones.

### (2) New global navigation — highest risk, do it as an additive layer
- Today nav is split: `.chrome` (back/crumb/dojo door) on inner rooms, `buildGingaChrome` galaxy bar + corner bubbles on home, and the shelf as a catch-all room. Many verifiers walk through `.bubble-shelf`, `#ginga-symbol`, `#back`, `#chrome-dojo`, `#*-link` ids.
- Safest: add a persistent bottom tab bar (e.g. 今日 Today, 読む Read, 道場 Practise, 辞書 Look up, 私 Me) as a new element appended in `render()` AFTER `root.append` of the existing chrome, calling the existing `S.view = …; render()` paths (same code as `.nav-review/.nav-dojo/.bubble-shelf`). Keep every existing id/class alive (visually hidden or re-skinned rather than removed) so verifier selectors still resolve; move them only after the verifiers are updated.
- Hide on `zen` (review/probe), `ginga` hero (front door untouched per John), sheet/stroke layers; respect `env(safe-area-inset-bottom)` and the existing sticky/bottom-dock logic (`updateMeasurements`, play bar dock, store alert positioning) which reads layout: test the reader play bar and store alert don't collide.
- Keep `back()` ladder unchanged.
- Blast radius: all rooms. Verifiers touched: verify-corridor (4,336 lines, nav strings), corridor-doors, dojo-door (`#chrome-dojo` must stay visible and in-viewport and not overflow `.chrome` at narrow widths), navigation-returns, accessibility (focus order, 44px), experience/performance, theme-consistency (ground under the bar), reader-doors, plus screenshots. Expect to update label-string assertions on purpose in the same PR.
- Relabeling doors in `REGISTER_ROOM_DOORS` breaks the register grades: update both together.

### (3) Per-room redesigns
Order by independence (lowest coupling first):
- Dojo (`renderFocus`, `renderDojoDecks`, `#chrome-dojo`): restructure markup inside the room only; keep `body[data-view=dojo]`, door id, `aria-current`. Verifiers: verify-dojo-door, corridor-doors, guided-session (guided entry), n2n1-decks, kotoba-mine, study-hall.
- Shelf (`renderShelf/renderShelfBody`, `#shelf-body`, `.shelf-open`, `#…-link`): the home catalogue; must keep link ids and `data-grade` stamping. Verifiers: design-reader-shelf (995 lines), shelf-search, relief, corridor-doors, experience.
- Reader (`renderReader` l.9404; `#reader` font-size, ruby, word menu, play bar): LEAVE the woodblock article pictures; reader typography is numerically pinned. Verifiers: design-reader-shelf, accessibility, reader-gloss, reader-doors, annotation-lookup, playback.
- Review/tray (`renderReview` l.20309, `renderTray`): zen mode and FSRS grade buttons are pinned (four honest buttons); restyle only. Verifiers: srs-today, practice-history, record-*.
- JLPT/mock, guided, lessons, tutor, kagami: self-contained renderers with their own CSS (`assessment-*.mjs`, guided-session.css); differentiate via `html[data-room]` rules in register.css (already the mechanism for "pages that look different"; the cheapest differentiation lever: extend it from 9 rooms to the full set by adding stamps in `stampRegister`, a non-storage function).
- Deck players (`decks/player`, `personal`, `context-dense`): separate renderers and CSS; zero-leak guards. Leave to last; only token mapping.
- Front door (drift): do not touch.

### Recommended sequence
1. Language-policy fix (tx/biLabel + lint) and token re-skin block, run the visual-verifier subset, screenshot tour. 2. Differentiate rooms via `data-room` stamps + per-room CSS. 3. Additive tab bar, keep old ids. 4. Per-room markup work, one PR each, with the named verifiers. 5. Full battery + `verify-release-gates` + SW/offline gates before any merge.
Per the doctrine in this tree, run storage-integrity once up front and again at the end to confirm no pin or marker regression.
