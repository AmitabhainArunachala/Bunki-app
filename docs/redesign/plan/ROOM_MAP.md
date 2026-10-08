# Room build map: the five rooms and the card players

This map is a read-only survey of `claude/redesign-20261008` (HEAD `934c9755`), made on 2026-10-08. Read it with `../FOUNDATION.md` and `../research/SURFACE.md`. The chosen concept is **C 生きた本棚 Living Shelf, finished with A's craft** (`../concepts/JUDGEMENT.md`).

`C/` means `prototypes/corridor/`. Line numbers are for `C/corridor.js` (29,075 lines) at this HEAD, and they shift as soon as anyone edits the file. **Lanes should name functions, never line numbers.** Verifier paths are relative to `C/tools/` unless they start with `tools/` (the repo-root redesign verifiers).

Pin classes used below:

- **B (behavioural):** truth, storage, SRS, routing, focus, geometry or contrast. Never weaken one; the markup or CSS has to satisfy it.
- **C (cosmetic or label):** an exact string or a cosmetic selector. It may be changed deliberately, with a row in `../VERIFIER_CHANGES.md` and the Grok audit.

---

## 0. Shared machinery (read before any lane starts)

### 0.1 `el`, `tx`, `withEn`, `biLabel`

| Helper | Line | Behaviour |
|---|---|---|
| `el(tag, cls, text)` | 3979 | Calls `createElement`, sets `className` and `textContent`. It never writes inline style. |
| `bi()` | 4035 | `S.lang === 'bi'`, which is the English UI. `'ja'` selects Japanese. |
| `tx(ja, en)` | 4040 | Returns `ja` in JA mode. In EN mode it returns `en`, and **throws `Missing English UI label`** when `en == null`. A thrown error inside a room aborts it, and `renderRoomError` (28464) then paints `.room-error[data-room-error]`, which the language tour fails on. |
| `withEn(node, en)` | 4047 | In EN mode it replaces the node's whole `textContent` with `tx(old, en)`. Many call sites pass a third argument such as `'en-inline'`, which is **ignored**. Call it before appending children, and never on a node that is already translated (`withEn(x, null)` throws). |
| `biLabel(tag, cls, ja, en)` | 4052 | Returns `<tag class=cls><span class="l-ja">{tx(ja,en)}</span></tag>`. The span is still named `.l-ja` in English, and verifiers and CSS key on `.l-ja`. |

Learned Japanese (titles, words, readings, sentences) never goes through `tx`. Mark the learned span itself with `data-ui-content="learning"` and `lang="ja"`. For a control or aria label that embeds a word, use `data-ui-content-value="語|…"`. `tools/lint-ui-language.mjs` enforces this. Its tour runs over the `ROOMS` list (l.16), the guided flow, the deck players (`.kp`, `.cd-room`) and the personal import.

### 0.2 Tab bar: `PRIMARY_TABS` and `buildPrimaryTabs`

- `PRIMARY_TABS` (28246) holds `{id, ja, en, view, views[]}` for today/tray, read/shelf, learn/dojo, words/search and me/me. `views[]` decides which tab carries `aria-current="page"`.
- `buildPrimaryTabs(root, {personal})` (28292) is called from `render()` at 28804 and from the personal boot at 4146. The bar is hidden on `drift` and `entry`, under `body.zen`, while `S.stack` holds a sheet, and while `S.strokes` is set. It toggles `body.has-primary-tabs` and emits `nav#primary-tabs.primary-tabs[aria-label]` containing `button.primary-tab#tab-{id}`. A click resets `S.stack` and calls `render()`. Words routes through `openSearchPage()`. In the personal collection the bar navigates by URL (`?entry=shelf&room=…&ui=…`).
- `observePrimaryDocks()` (28256) measures `.kp-grades, .pc-controls, .cd-dock, .listen-row.play-bar, .pc-status, .reader-toast` and writes `--foundation-dock-clearance` on body.
- The CSS lives in `editorial.css` 3306–3391, **outside** the token fence. It sets `--nav-clearance: calc(60px + env(safe-area-inset-bottom))`, `.primary-tabs`, `.primary-tab[aria-current]::after`, docks lifted above the bar, and `:has(#sheet, …) .primary-tabs {display:none}`.
- `tools/verify-redesign-foundation.mjs:53–88` checks the labels exactly (`Today Read Learn Words Me` / `今日 読む 学ぶ 辞書 私`) [C]. It also checks each target is at least 44×44 and inside the viewport, that exactly one tab is `aria-current` [B], the `data-room` per tab [B], that the play bar sits above the tabs below 600px [B], that no sheet shows tabs [B], and that there is no horizontal scroll [B].
- `tools/verify-redesign-docks.mjs` checks dock clearance for the reader play bar, `.kp-grades`, `.cd-dock button`, `.pc-status`, `.kp-swatch` and `#kp-rule-dismiss` [B].
- **Ownership:** the tab bar belongs to the Shell/Skin lane only. Room lanes do not edit `PRIMARY_TABS`, `buildPrimaryTabs`, `observePrimaryDocks` or editorial.css 3306–3391. The concept's due-count badge on Today ("the Line") is a Shell-lane change to `buildPrimaryTabs`. Keep the button text equal to the label, or update the foundation verifier deliberately.

### 0.3 Room identity: `stampRegister`, `data-room`, `data-view`

- `render()` (28481) sets `body[data-view] = S.view` (28550), toggles `body.zen` (28575), creates `<main>` (28841), dispatches the room (28880–28913), and then calls `stampRegister()` (28850 for the sheet-only path, 28946 after the rooms). The personal boot calls it at 4148.
- `ROOM_IDS` (28406) maps view to room. Identical names are left out. The mappings are: `drift→door`, `dojo→learn`, `srs-stats→progress`, `kagami→progress`, `personaldeck→personal`, `aiquiz→quiz`, `levels→reference`, `ai→tutor`, `mock→jlpt`, `thesaurus→word-web`, `airead→personal-reading`, `kanjidex→kanji` and `yoji→idioms`.
- `stampRegister()` (28421) sets `html[data-room]`. It also sets `html[data-register]` by **sniffing the DOM**: `.mock-opts`, `.exam-confirm`, `.exam-score`, `.exam-levels`, `.chat-log`, `#shelf-body` and `.mock-review`, with `hall` as the default. It sets `data-room-entering` for 220ms, `--stage` and `data-answered`, and stamps `#shelf-body button.grammar-link[data-grade]` by **label text** (`REGISTER_ROOM_DOORS`, `REGISTER_LINE_DOORS` at 28418–28419). Renaming a shelf door label or removing a sniffed class therefore changes the material. register.css keys on `data-register`, and the entrance lift `kairo-lift` is in register.css:627.
- **Ownership:** Shell lane only. Room lanes read `data-room` in their CSS and do not edit `ROOM_IDS` or `stampRegister`.

### 0.4 Themes: `data-theme` worlds, day and night

- `THEME_UI` (27163) has 11 worlds. `PUBLIC_THEME_IDS` (27229) holds the 10 public ones. `themeId()` reads localStorage `kairo-theme`; with nothing stored, `prefers-color-scheme: dark` gives `yoru`, otherwise `hokusai`.
- `setKairoTheme(id)` (27260) sets `html[data-theme]` to `''` for hokusai (the bare `:root` default) or to the id. It sets `colorScheme` and `meta[color-scheme]`, writes `kairo-theme`, and then runs `applyPaper(id)` (27600, the `--paper-url` data URI) and `syncDriftTheme()` (`DRIFT_THEME_BY_WORLD`).
- **Night worlds:** `rokusho`, `yoru`, `nami`, `hakuu` and `kaku`. **Day worlds:** `hokusai` (default), `sumi`, `shu`, `akafuji`, `iwa` and `keyblock`.
- The world palettes are in corridor.css: base `:root` at l.12 and `:root[data-theme=…]` blocks at 2126–2350. Tokens v2 (editorial.css 3475–3833) snapshots `--world-*` on `:root` and maps the `--color-*` roles on `:where(body:not([data-view='drift']))`. Night overrides are at editorial.css:3685 using `:root:is([data-theme='rokusho'], [data-theme='yoru'], [data-theme='nami'], [data-theme='hakuu'], [data-theme='kaku'])`.
- **Rule for rooms:** write a night variant with that same `:is(...)` list. Do not use `prefers-color-scheme`, because a stored day world on a dark OS must stay day.
- `verify-theme-consistency.mjs` [B] walks every world through shelf, reader, review, sheet, dojo and search. Each computed background must equal one of that world's tokens (`--ground`, `--ground-0`, `--zen-stage*`, `--card-ground-0`). A room surface painted in a non-token colour fails it. Derive room colours from `--color-*` and `--world-*` roles.
- `verify-corridor-accessibility.mjs:752–773` [B] requires `--paper-url` to be a data URI and checks ground luminance.

### 0.5 Cascade facts for the room files

- `index.html` 34–52 loads, in order: fonts, corridor, reference-ui, drift-layer, skip-ui, register, report-client, editorial, then `rooms/{today,read,learn,words,me,cards}.css`. The room files are already registered in `sw.js`, `scripts/corridor-assets.mjs`, the standalone builder and `sw-shell.test`.
- **Injected sheets load after the room files.** These are `decks/player/player.css` (`ensureCss`, mount.js:2265), `decks/personal/personal.css` (mount.mjs:129), `decks/context-dense/context-deck.css` (mount.js:480) and `guided-session.css`/`guided-moments.css`. A room rule that only ties on specificity loses to them, so prefix with `html[data-room='…']`.
- editorial.css uses selectors such as `body.v-depth-layered .study-door` (0,2,1). Prefix with `html[data-room='learn']` to win without `!important`.
- Set tokens on **body** (FOUNDATION): `html[data-room='x'] body:not([data-view='drift']) { --color-…: … }`.
- `verify-relief.mjs` [B-ish, in the F1 subset] requires a border of at least 1px with alpha ≥ 0.25 **and** a box-shadow in the layered variant. The checked selectors are `#levels-link`, `.search-page`, `.skip-ui`, `.study-door`, `.listen-row` and `#reader`. It also requires an accent `::before` rule of at least 2px on `.eyebrow.shelf-section`. A flat, borderless redesign of those surfaces fails it, so keep the edge and lift or log a deliberate change.
- `verify-corridor-accessibility.mjs:280–330` [B] fails any tabbable element whose ancestor has `opacity: 0`. An entrance animation that starts at opacity 0 must use `animation-fill-mode: both` with a short duration, or animate transform only. Hit regions of at least 44px use `::before` (`verify-corridor.mjs:410`, accessibility:350), so do not hide the `::before` of `button.tok`, `.sent-door` or `.rest-toggle`.
- z-index: `verify-corridor-storage-integrity.mjs:1005` checks that `.store-warning-live` (z-index 130 in corridor.css) is above every z-index in **corridor.css and drift-layer.css**. The room files are not scanned, but keep room z-indexes below 130 anyway.
- Reduced motion: every new animation needs a `@media (prefers-reduced-motion: reduce)` off-switch, following register.css:630.

### 0.6 Protected (every lane)

These are listed in FOUNDATION §end and SURFACE §3.

- `STORE_KEY = 'kairo-corridor-v1'` (600) through `// Only acknowledged changed roots` (1611), plus `validStoreEnvelope` 1401, `loadStore` 1510, `hydrateStore` 1556, `storeEnvelope` 1746, and `record*` 1824–2110 (`recordWritable` 2087, `recordReady` 2084).
- Everything `verify-corridor-storage-integrity.mjs` slices by text (`between`/`definitions`): `bundledArticle`…`新聞アーカイブ`, `srsSchedulerInstant`…`the review log`, `srsReviewLogRow`…`advanceReviewSession`, `/** Items ready to review:`…`/** Midnight at the start of a date` (todayQueue family 19971–20112), `/** How many pool items a dojo refill`…`const LEECH_LAPSES`, `refillFocusQueue`…`startFocus`, `fsrsApi = window.__TSFSRS__`…`} catch (err) {` (boot 4303), and `readDonePending`, `commitReadDone`, `captureStorePatch` (17910), `commitCapture`, `commitStorePatch`, `canonicalRecordJson` (22915), `plainRecord`, `pinnedSchedulerInput`, `srsSchedulePolicy`, `buildSrsScheduler` (19746) and `startReview` (20168).
- The same verifier also pins corridor.css source text: the rule `body.zen .grade-row` must keep `position: sticky; bottom: 0; z-index: 3`, the safe-area inset, and a background starting with `var(--ground-0`. **Do not move or rename that rule in corridor.css.** Override it from today.css only for cosmetic properties.
- 56 tools read corridor.js source. Do not rename functions they slice: grep `definitions(` and `between(` in `tools/` before renaming anything.
- `data/fsrs-pin.json`, card ids (`km-064-1` …), `bunki-cloze:<deck>` / `:before-restore` / `:quarantine` / `bunki-cloze:prefs:v3:<deck>` (player mount.js:116–121), `bunki-srs-deck:<id>` and `:look` (context-dense mount.js:24), IndexedDB `bunki-personal-collections-v1` (personal store.mjs:3), `decks/n2n1/source/**` and `drift-layer.*`.
- The zero-leak front: `sentenceNodes(card, {front:true})` (player mount.js:456/786) must yield the passage only, with no ruby, rt, English, button or listener. This is pinned by `tools/kotoba-player-front.test.mjs` and `tools/kotoba-deck-leaks.test.mjs`.

---

## 1. Today (tab `today`, entry view `tray`)

### 1.1 Entry points and DOM

| View | `data-room` | Entry function |
|---|---|---|
| `tray` | `tray` | `renderTray` 10774–11320 |
| `list` | `list` | `renderListPage` 11321 |
| `browse` | `browse` | `renderBrowse` 21032 |
| `review` | `review` | `renderReview` 20330 (+ `renderReviewBreak` 21275, `renderReviewWait` 21308, `renderReviewUndo` 21359) |
| `aiquiz` | `quiz` | `renderAiQuiz` 14346 |

`body[data-view]` carries the same view name. Review in zen mode sets `body.zen`, which hides the tabs and chrome.

**Tray helpers:** `deckCounts` 20945, `renderDeckTable` 20970, `renderDeckDoors` 20999, `renderSrsPrefs` 9977, `renderRecordSync` 10574, `renderReadingPlaces` 10710, `renderRecordNotes` 10755, `renderPortRow` 11512, `renderNoteDoor` 11688, `renderSentencePracticeLibrary` 18233 (shared with Learn's `sentence-practice`). The chrome's `#tray` button is built in `render()` at 28774 and belongs to the Shell lane.

**Tray DOM, top to bottom:**

- `p.eyebrow` and `h1.view-title` ("Memorizing N items")
- `div.deck-counts#deck-counts` with `.deck-count-n` and `.deck-count-l`
- `button.take.review-start#review-start` (`.quiet` when nothing is due)
- `p.srs-forecast`, `.srs-held`, `.srs-trace`
- `div.deck-table#deck-table` containing `div.deck-row.deck-head` and `button.deck-row[data-deck]`, each with `span.d-name` and `span.c-new|c-learn|c-due` (`.zero` when empty)
- `div.deck-doors` holding `#deck-browse` and `#deck-stats` (`.chip.deck-door`)
- the SRS prefs fold (`#srs-prefs-toggle`, `[data-preset]`)
- `#aiq-start`, `.aiq-resume-row` (`#aiq-resume`, `#aiq-drop`)
- `p.store-nudge`, `.sem-empty`
- `div.list-maker` (`#list-maker-field`, `#list-maker-make`, `.list-rename`)
- month and list sections: `p.eyebrow.list-head`, `.tray-line`, `button.list-open`, `.list-op`, `.chip.list-review[data-list-review]`, `.rest-toggle.srs-start`, `.pool-tag`
- `section.reading-places#record-reading-places`, `section.record-notes#record-notes`, `div.record-sync#record-sync`, `.port-row`

**Review DOM:**

- `.anki-counts`, `#review-counts`, `.zen-progress`, `#zen-exit`, `#zen-more`
- `.review-face` containing `.review-front.reveal.r-0`, `.review-reading-row`, `.review-sense-primary`, `.review-sense-rest`, `.review-example` and `.review-cloze`
- `button.take.review-reveal#reveal`
- `.grade-row` > `button.grade.g-{again,hard,good,easy}` with `.g-seal`, `.g-label`, `.g-sub` and `.g-when`
- `.kintsugi`, `.leech-row`, `.review-summary`, `.close-doors`, `.anki-undo-slot`, `#review-rest`, `#review-raise-limit`

**Browse:** `.browse-bar`, `input.browse-q#browse-q`, `select#browse-sort`, `.browse-filters` > `.chip.browse-filter(.on)`, `.browse-list`, `.browse-meta`, `.fine.browse-count`.

### 1.2 Data at render time

- `S.taken` (saved items), `S.srs` (FSRS cards keyed by `srsKey(t,id)`), `S.stats` (per-day counts and `lastExportTs`), `S.lists`, `S.suspended`, `S.obslog`, `S.aiQuiz`, `S.storeError`, `S.trayFrom`.
- `scheduler`, `todayQueue()` (20059, **the single truth for every count**), `srsForecast()` (20136), `srsDecks()`, `srsDueItems()`, `srsReviewsPerDay()`.
- The tray has the per-day trace already (`S.stats[dayKey]`). That is enough for an "honest minutes / today's line" strip without new storage.
- Deck-player dues (`deckSummaries`) are only populated by Learn (`loadDeckPlayer().summary`). Today does not load the player. If "Today's line" should include deck dues, call the existing `loadDeckPlayer().then(m=>m.summary(id))` path, which is cached in `deckSummaries`.

### 1.3 Verifier pins

- **B** `verify-srs-today.mjs:140–150`: the numbers in `#review-start`, `#deck-counts .deck-count-n` and `.deck-row[data-deck="*"] > span:not(.d-name)` must equal `__KAIRO_SRS__.today()`. **The DOM shape is pinned**: three numeric spans after `.d-name`, in new/learn/due order. Also `[data-preset]` and `#srs-prefs-toggle`.
- **B** `verify-corridor.mjs:3453–3455`: the review-start label matches `/予定なし|nothing due yet/` or `/いまは予定なし|nothing due right now/` (truth wording, so treat it as B). Also `verify-corridor.mjs:2945` (`.srs-forecast` text).
- **B** `verify-corridor-storage-integrity.mjs:1022`: the corridor.css rule `body.zen .grade-row`, as in §0.6.
- **B** `.grade-row .grade.g-good`, which the grading paths click (`verify-pr77-ports.mjs:906`, `verify-corridor.mjs:2229`, `verify-learning-record.mjs:316`). `#reveal` appears in 18 files and `.review-front` in 6, including `verify-search-fallback.mjs:220`, which checks innerText `原典`.
- **B** `#review-start` (24 files), `#aiq-start`, `#aiq-resume` and `#aiq-drop` (7 files: ai-adaptation, corridor-ai, tutor-quiz-storage, learning-record, record-note-views), `#list-maker-field` and `#list-maker-make` (7 files including `verify-experience.mjs:131`, which checks that an empty name is rejected), `#deck-browse` (`verify-pr77-ports.mjs:954`) and `#record-sync` (5 files).
- **B** `verify-theme-consistency.mjs:71`: review-front grounds belong to world tokens.
- **C** `verify-corridor.mjs` crumb strings ("review", "focus block").

### 1.4 Protected nearby

The whole SRS block sits between `buildSrsScheduler` 19746 and `startReview` 20168, which includes `todayQueue` and `srsForecast`. The grade handlers inside `renderReview` write through the scheduler and record, so **do not touch their click handlers or the button/grade ids**. Also protected: `toggleWordSave`, `aiQuizCommit`, `listRecordPending` and `recordWritable()` gating.

### 1.5 Restyle path and risk

- **CSS only (today.css), low risk.** Scope with `html[data-room='tray']`, `html[data-room='review']` (and `body.zen`), `html[data-room='browse']` and `html[data-room='list']`. The deck table, forecast, doors and lists can all be restyled freely.
- **Markup, medium risk.** A "Today's line" hero (cards · article · question) can be added at the top of `renderTray` as **new** nodes in a new helper placed directly above `renderTray`. Leave `#review-start`, `#deck-counts` and `#deck-table` intact; they may be visually demoted.
- Review face changes stay CSS-only. The concept's togidashi reveal is a CSS animation on `.review-face` children, which already carry `.reveal.r-0…r-4`.
- **The concept puts the word sky as Today.** That is the `drift` view: the tabs are hidden there, and drift is "do not touch". Treat it as a Shell decision, not a Today-lane change.

---

## 2. Read (tab `read`, entry view `shelf`)

### 2.1 Entry points and DOM

| View | `data-room` | Entry function |
|---|---|---|
| `shelf` | `shelf` | `renderShelf` 5445 → `renderShelfBody` 5470–6015 (`refreshShelfBody` 16845 repaints only the body) |
| `reader` | `reader` | `renderReader` 9419–9804 |
| `archive` | `archive` | `renderArchive` 4377 |
| `airead` | `personal-reading` | `renderAiReading` 23652 |
| `feed` | `feed` | `renderFeed` 7326 |
| `publisher` | `publisher` | `renderPublisherReading` 7070 |
| `source-inbox` | `source-inbox` | `renderSourceInbox` 6258 |
| `source-reader` | `source-reader` | `renderSourceReading` 6866 |

`html[data-register]` is `shelf` whenever `#shelf-body` is present.

**Shelf DOM:**

- `p.eyebrow`, then `input.search-field#search`
- `div#shelf-body[data-render-token]`
- `header.shelf-masthead` > `.shelf-mast-title` > `.shelf-mast-name` (containing `img.shelf-art`, the 永 seal from `design/ink-hoku-nami.png` or `__KAIRO_SHELF_ART_URL__`, and `h1.view-title`), followed by the dateline `p.shelf-snippet.intro.shelf-dateline` with `.dateline-date`, `.dateline-tally`, `.tally-long` and `.tally-short`
- `button.shelf-tools-toggle#shelf-tools-toggle` and the panel `#shelf-tools-panel` > `section.shelf-tools-group` > `.shelf-tools-grid`, holding `button.grammar-link` doors (`#feed-link #source-inbox-link #levels-link #lessons-link #mock-link #decks-link #kagami-link #grammar-link #thesaurus-link #yoji-link #kanjidex-link #ai-link #airead-link #archive-link #context-deck-link`)
- `.shelf-controls.shelf-chipbar` > `label.filter-chip#shelf-filter-{key}` and `.shelf-reading-search`
- `.shelf-review-note`, `details.shelf-filter-help`
- `section.shelf-daily-selection.shelf-band#shelf-today` and `.shelf-today-strip`
- `section.shelf-definitions.shelf-band` (`.shelf-definition-grid`)
- `section.shelf-encounters.shelf-band` (`button.shelf-encounter`)
- `h2.shelf-band-head.eyebrow.shelf-section`
- story cards from `shelfCard(p, rank)` (7657): `[data-passage]` > `button.shelf-open` > `.shelf-head`, `.story-topline`, `.shelf-title`, `.shelf-title-en`, `p.story-lede`, `.story-foot`, `time.story-date` and `.read-tag`. Pictures come from `storyPicture(p)` (7521): `.story-picture` with `.story-picture-word`.

**Reader DOM:**

- `#reader-source-back` or `#source-entry-return`
- `div.reader-head` > `p.eyebrow.reader-meta` (`.reader-source`, date, level chip, `.unreviewed`) and `button.icon-button.dials-toggle#dials-toggle`, with `div.dials` and `.dials-hint`
- `h1.view-title[data-ui-content=learning]` and `p.view-title-en`
- `readerPicture(p)` (`figure` > `img.reader-picture-img`, `figcaption.reader-picture-caption`)
- `#reader-tip` (`renderReaderTip` 7578)
- the version toggle (`.version-block`, `.version-toggle`, `button.version-choice`, `#version-caption`)
- `div.reader#reader` holding token buttons `.tok.content`, `.tok.named` and `.tok.plain` (9606) with `[data-index]`, `ruby`/`rt` and state classes `tok-due`, `tok-learning`, `tok-current` and `lit`, plus `.bunsetsu`, `.para-break`, `.token-door`, `.sent-door.glossary-ref` and spacing classes `sp-word`/`sp-bunsetsu`
- `div.read-done` and `#read-fin`
- `section.article-about` (`h2.article-about-head`, `dl.article-facts`, `a.inline-link`) and `footer.article-footer`
- the play bar `div.listen-row.play-bar[data-passage]` (`buildListenRow` 9363)
- the capture door `#reader-take`, built in `render()` chrome at 28740 (Shell-owned)

**Word popup and menu.** `showMini(span, token, …)` (8316) emits `#mini` containing:

- `.mini-word`, `.mini-reading`, `.mini-gloss` (`.mini-miss`)
- `.mini-sentence-wrap` > `.mini-sentence` (`#mini-sentence-label`, `.mini-sentence-action`)
- `.mini-actions` > `button.mini-take.btn-primary#mini-take`, `#mini-take-open`, `button.mini-lists.btn-tertiary#mini-lists`, `button.mini-entry.btn-tertiary` (`.mini-entry-label`, `.mini-entry-chevron`)
- `.mini-status`

`removeMini()` is at 7810. `openReaderWordMenu` (8550) emits `div.reader-word-menu#reader-word-menu[role=menu]` > `button.reader-word-menu-item[data-menu-action=save-word|save-sentence|entry|ask-tutor|copy]`. `closeReaderWordMenu` is at 8542 and the keyboard handler `readerWordKey` at 8644. Inline gloss is `.tok-en` (8760).

**Full-entry sheet.** `renderSheet(root)` (26787) emits `.scrim` and `div.sheet#sheet[role=dialog][data-node="t:id"]` > `.sheet-grip`, `.sheet-bar` (`#sheet-back`, `.sheet-depth`, `#sheet-search`, `#sheet-close`), then a node renderer (see Words §4). The sheet is a shared layer and not a room: it does not change `data-room`.

### 2.2 Data at render time

- `D.passages`: the article index (126 rows in `data/articles/index.json`, `{id,title,titleEn,source,date,file,snippet,grading,…}`). Bodies load lazily through `ensureArticle(p)` (4326) and `prefetchArticles()`, giving `p.tokens = [{s,b,p,r,f,c}]`, `p.paras`, `p.text` and `p.grading`.
- `passage()` (5132) is the current article. Also used: `S.passageId`, `S.dials`, `S.glossed`, `S.revealed`, `S.readDone`, `S.readerTake`, `S.shelfFilters`, `S.shelfToolsOpen`, `S.query` (shelf search → `renderSearchResults`, which is shared with Words) and `S.shelfScroll`.
- `D.dict` and `lookup()` (3240) give the popup gloss. `D.sem` gives the shelf's synonym rows. Per-token state comes from `S.srs`/`S.taken`.
- `localStorage['kairo-shelf-day']` is a test seam only.

### 2.3 Verifier pins (the most numerically pinned room)

`verify-design-reader-shelf.mjs` (F1):

- **B** l.279–281: `#reader` computed font-size is 18–19px at 390px and 21–22px at 1368px.
- **B** l.283: `.tok.content` contrast ≥ 4.5.
- **B** l.290–296: furigana is at least 0.55× the body, with opacity > 0.9.
- **B** l.300–305: `#mini .mini-gloss` is at least 15px, with contrast ≥ 4.5.
- **B** l.267–272: token gap is at most `GAP_MAX`, with no whitespace text nodes between tokens.
- **B** l.326: the first sentence is wholly on the first screen.
- **B** l.357: the first story headline is in the viewport.
- **B** l.376–377: the stated count equals the number of cards.
- **B** l.417–442: picture slots, the `.story-picture-word` size, kicker, headline, English line and level, and the 永 seal at most 48px inside the title.
- **C/B** l.470–498: the Tools toggle is in the title block with label `^Tools` (C), collapsed on arrival, with no doors visible and nothing between the filters and the first story (B). The panel must hold every `TOOL_DOORS` id (l.447), each on one line with an English accessible name (B).
- **B** l.531–542: the dateline is one line, and the Unreviewed note is one line with an ⓘ.
- **B** l.557–580: no horizontal overflow and no sideways-scrolling rows at 320px.
- **B** l.593–630: `#reader-tip` is static or relative, sits above the first word, and is dismissed and remembered.
- **B** l.648–720: the capture seal's opacity, the filled take button, and `pop` position fixed.

Other files:

- **B** `tools/verify-redesign-foundation.mjs:108–152`: `#levels-link` is visible after `openShelfTools`, `.shelf-open` opens `#reader`, `data-room=reader`, the play bar sits above the tabs, `.chrome` height is unchanged when `#mini` opens (≤1px), `#reader-take` is at least 44×44, and `#mini .mini-entry` opens `#sheet` with the tabs gone.
- **B** `verify-relief.mjs:80–90`: `#levels-link`, `.eyebrow.shelf-section::before`, `.listen-row` and `#reader` need an edge plus shadow.
- **B** `shelf-tools-support.mjs`: `#shelf-tools-toggle[aria-expanded]` and `#shelf-tools-panel` (used by 49 tools). `.shelf-open` appears in 27 files and `#shelf-body` in 8.
- **B** `#reader` (28 files, 326 hits) and `#mini` (22 files), including `.mini-take` (11 files) and `.mini-gloss` (9 files): verify-reader-gloss, reader-doors (computed `cursor` at 418/498), reader-lookup, annotation-lookup, playback, word-saved-answer-controls. `.reader-word-menu` appears in 5 files.
- **B** `verify-corridor.mjs:332–451` and `verify-corridor-accessibility.mjs`: global visibility, contrast and the 44px `::before` on `button.tok`, `.sent-door` and `.rest-toggle`.
- **B** `verify-experience.mjs:143–146, 279`: title ink against ground, and no overflow on the 320px shelf.
- **C** `bookshelf › archive › …` crumbs (`verify-corridor.mjs:2328`), `Tools` and `Unreviewed` (VERIFIER_CHANGES rows).

### 2.4 Protected nearby

- `ensureArticle`/`bundledArticle`…`新聞アーカイブ` (sliced by storage-integrity).
- `commitReadDone` and `readDonePending`, the read-done record.
- Reading-position and bookmark modules (`ensureReadingPositionModule` 951).
- `toggleWordSave` and `captureStorePatch`, the save path from the popup and menu.
- `render()`'s scroll-restore list (reader, airead, feed, …), and the `#shelf-body` sniff that sets `data-register=shelf`.
- The `REGISTER_ROOM_DOORS` label text.
- Do not crop or replace the woodblock pictures (`readerPicture`, `storyPicture`), per the brief: natural crop.

### 2.5 Restyle path and risk

- **Shelf, CSS (read.css, `html[data-room='shelf']`), low to medium risk.** The living-spine look for `.shelf-open` and `.story-*` is possible in CSS, but full titles must stay readable and wrap rather than truncate. Keep the 永 seal at most 48px, and keep the count and dateline on one line.
- **Shelf markup, medium risk.** New spine or band wrappers inside `renderShelfBody` must keep `[data-passage] > button.shelf-open`, the tools toggle and panel position ("nothing between the filters and the first story"), and every `#…-link` id.
- **Reader, CSS only, high risk numerically.** `--type-reading` is free only within 18–19px on phone and 21–22px on desktop. Furigana ≥ 0.55×, gap rules, no added header rows, and the play bar above the tabs.
- **Popup and menu.** CSS on `#mini` and `.reader-word-menu` is fine. Keep `.mini-gloss` ≥ 15px and ≥ 4.5 contrast, and keep the action button ids. Note that `#mini` is appended to `body` (outside `main`); scope it as `html[data-room='reader'] #mini`.
- **The sheet:** see Words.

---

## 3. Learn (tab `learn`, entry view `dojo`)

### 3.1 Entry points and DOM

| View | `data-room` | Entry function |
|---|---|---|
| `dojo` | `learn` | `renderFocus` 21867–22160 |
| `deckplay` | `deckplay` | `renderDeckPlay` 21835 (wrapper; the player is Cards) |
| `contextdeck` | `contextdeck` | `renderContextDeck` 5411 (wrapper) |
| `probe` | `probe` | `renderProbe` 22161 |
| `mock` | `jlpt` | `renderMock` 13371 (assessment; its own modules) |
| `guided` | `guided` | `renderGuided` 21653 (`guided-session.mjs`, `guided-session.css`) |
| `lessons` | `lessons` | `renderLessons` 11882 |
| `levels` | `reference` | `renderLevels` 15379 (`reference-ui.js`) |
| `sentence-practice` | `sentence-practice` | `renderSentencePractice` 18612 |
| `ai` | `tutor` | `renderAiSetup` 15195 |

The `#chrome-dojo` door is built in `render()` (Shell-owned).

**The grouped Learn hub Sol added** (`renderFocus`):

```
h1.view-title  ("the focus dojo")
section.learn-section[data-learn-section=guided]  ← renderStudyHall(guided) 21694
   p.eyebrow · div.study-hall#study-hall > button.study-door[data-study-door=review|mock|guided|lessons|sentence|probe|levels]
        (span.study-door-t, span.study-door-sub) · p.fine.study-hall-note
section.learn-section[data-learn-section=decks]   ← renderDojoDecks(decks) 21787
   p.eyebrow · div.dojo-decks > button.dojo-deck[data-deck=personal|n2|n1|senmon|kotoba-mcd|kotoba-mine|context|mine|list:<name>]
        (span.dojo-deck-t, span.dojo-deck-sub)
section.learn-section[data-learn-section=focus]
   p.eyebrow · p.gloss · div.focus-choices > button.focus-chip(.on)[aria-pressed] (span.focus-chip-n, .focus-chip-u)
   div.focus-modes > button.focus-mode(.on)[aria-pressed] (span.focus-mode-t, .focus-mode-sub) · button.take.focus-start
```

`DOJO_DECKS` is at 21756. The existing CSS is `.learn-section` at editorial.css 3369–3372, `.study-hall` and `.study-door` at editorial 345–369 and corridor.css 133–156 / 7645, and `html[data-register='jlpt'] .study-hall.guided-entry` at editorial 2673.

### 3.2 Data at render time

- `srsForecast()` gives the review due count.
- `D.mock` comes from `ensureMockIndex` 12844. `assessmentCatalog` comes from `loadAssessmentCatalog` 12180 (ready tests, sections, written). Both load asynchronously and re-render while `S.view==='dojo'`.
- `deckSummaries[id]` comes from `loadDeckPlayer()` 21761 → `mod.summary(id)` (player mount.js:2318), giving `{due, fresh}` per deck as live counts. It loads asynchronously and re-renders.
- `S.lists`, `srsDueItems()`, `srsKey()`.
- `S.focusMin`, `S.focusMode`, `FOCUS_MINUTES`, `S.focus`, `S.probe`, `S.obslog`, `S.taken`.
- `guidedFrom` and `openGuidedRoom('dojo')`.

### 3.3 Verifier pins

- **B** `tools/verify-redesign-foundation.mjs:90–96`: `[data-learn-section]` order is exactly `guided, decks, focus`.
- **B** `verify-study-hall.mjs:56–75`: `#study-hall [data-study-door]` has at least 6 doors, `mock` goes to the mock view, and `review` goes to tray.
- **B** `[data-study-door="mock"|"guided"]` clicks in verify-corridor-doors:84, assessment-written-section:1390, guided-lookup:38, guided-offline:97, guided-session:149 and report-entries:298.
- **B** `[data-deck="<id>"]` in verify-n2n1-decks:68, kotoba-mine:2388 and skip-standalone:95 (`.dojo-deck[data-deck="context"]`), and `tools/verify-redesign-foundation.mjs:287` (`[data-deck="personal"]`).
- **B** `.focus-mode` and `.focus-start` (verify-corridor:2173, learning-record:1152 filters `.focus-mode` by text 'yomi probe', report-entries:212 by '読み探査'). `.focus-chip` is in pr77-ports:477.
- **B** `verify-dojo-door.mjs`: `#chrome-dojo` is present, visible and in the viewport, with no `.chrome` sideways scroll, and reads as current inside the dojo.
- **B** `verify-relief.mjs:86`: `.study-door` edge plus shadow.
- **C** labels "yomi probe" and "読み探査" (used as filters, so keep them, or change them with the verifier). "集中道場" appears in comments and descriptions only (corridor-doors, kotoba-mine).

### 3.4 Protected nearby

`startFocus` 21505, `refillFocusQueue` 21490 (sliced), `startFocusTicker` 21447, the `LEECH_LAPSES` batch block 19989–19995, `startReview`, `openPersonalCollection`, and `openDeck` (sets `S.deckPlay`).

### 3.5 Restyle path and risk

- **CSS (learn.css, `html[data-room='learn']`), low risk.** Section headers, door cards, deck rows with live counts, and focus chips. Beat `body.v-depth-layered .study-door` with the `html[data-room]` prefix. Keep the edge and shadow on `.study-door`.
- **Markup, low to medium risk, and the best place to start.** Inside `renderStudyHall`, `renderDojoDecks` and `renderFocus` only, you can add section headings, count badges and a JLPT/guided entry card with live counts (the data is already there). Keep the three sections in order with their `data-learn-section` values, every `data-study-door` id, at least 6 doors, every `data-deck` id, and `.focus-mode`/`.focus-start`. Adding new spans inside the buttons is safe.
- Rooms reached from Learn (jlpt, guided, lessons, reference, tutor, sentence-practice) are separate modules with heavy behavioural verifiers. Give them **token-only** CSS for this pass.

---

## 4. Words (tab `words`, entry view `search`)

### 4.1 Entry points and DOM

| View | `data-room` | Entry function |
|---|---|---|
| `search` | `search` | `renderSearchPage` 27880–28105 **then** `renderWordsDoors` 28390 (dispatch at 28910) |
| `kanjidex` | `kanji` | `renderKanjidex` 15660 (+ `renderKdxGrid` 15760, `renderKdxParts` 15804, `renderKdxStrokes` 15896, `renderKdxRadical` 15924, `renderKdxFrequency` 15982, `renderKdxLevel` 16029, `renderKdxKkld` 16091, `renderKdxText` 16162, `renderKdxDraw` 16215, `renderSkipLookup` 15732) |
| `grammar` | `grammar` | `renderGrammar` 17266 |
| `thesaurus` | `word-web` | `renderThesaurus` 16458 (the Words "Word web" door `#words-web` opens it) |
| `yoji` | `idioms` | `renderYoji` 15596 / `renderYojiBody` 15625 |

**Search DOM:**

- `p.eyebrow`, then `div.search-page` holding `input.nav-search-input.search-page-input#nav-search-input`, `p.search-page-hint`, the lens row `div.kdx-lenses.search-lenses#search-lenses[role=group]` > `button.kdx-lens(.on)[data-search-lens][aria-pressed]` (11 lenses in `SEARCH_LENSES`: words, skip, parts, radical, draw, reading, meaning, strokes, freq, level, kkld), `button.skip-search-opener#search-skip-opener`, `#search-skip-results`, and `div.search-page-results` > `button.nav-search-row` (`.nsr-glyph`, `.nsr-stack`, `.nsr-read`, `.nsr-gloss`) or `.nav-search-empty`
- `#search-finder`
- then `section.foundation-section` > `h2.eyebrow` > `div.foundation-doors` > `button.grammar-link.foundation-door#words-kanji|#words-grammar|#words-web|#words-idioms` (`foundationDoor` 28334)

**Shelf search results** (`renderSearchResults` 17192, shared with Read): `#search-results`, `.entry-rows` > `button.entry-row.compound[data-result]` (`.row-glyph`, `.row-stack`, `.row-word`, `.row-reading`, `.row-gloss`, `.row-go`), `.search-syn` > `button.sem-row` (`.sem-word`, `.thes-rel`, `.sem-note`) and `.chip.search-syn-door`.

**Thesaurus:** `div.thes-block` > `button.thes-head[data-thes]` (`.thes-word`, `.thes-reading`, `.thes-gloss`) + `button.sem-row[data-thes-row]`.

**Grammar:** `.chips` > `button.chip.wide[data-glevel][aria-pressed]` and `.entry-rows` > `button.entry-row.compound[data-grammar]`.

**Sheet node renderers** (dictionary content inside `#sheet`):

- `renderWordNode` 24621: `h2.headword`, `.reading`, `.senses`/`.dictionary-senses`, `ol.sense-list`, `.sem-group`, `.sem-head`, `.sem-row[data-sem]`, `.entry-row[data-kanjirow]`, `.example`, `.example-ja`, `.example-en`, `.example-src`
- `renderKanjiNode` 24934: `.hero`, `.hero-glyph`, `.hero-mean`, `.hero-meta`, `dl.kv`, `.rad-door`, `[data-component]`, `[data-confusable]`, `.more-row`, `#kanji-kkld`, `#kanji-shape-lookup`
- `renderRadicalNode` 26602, `renderIdiomNode` 26683, `renderGrammarNode` 17315, `renderParticleNode` 16518, `renderSentenceNode` 17363, `renderCatalogNode` 17469, `renderReferenceNode` 15552 and `renderReferenceConnections` 15506
- `renderDictionaryRelations` 24065, `renderDictionaryDetails` 24104, `renderDictionaryHomographs` 24195, `renderConjugation` 24004 and `renderEncounterTrail` 26751
- `renderStudyFold` 22384 and `renderCardVariant` 22452 sit near `renderSentenceTokens` 22650

### 4.2 Data at render time, and the word web's real sources

All of the following are in memory after boot (`boot()` loads at 4185–4300), unless marked lazy.

| Edge | Source in memory | File | Loader / helper |
|---|---|---|---|
| word → reading, meaning, POS | `D.dict[w]` `{r, m[], alt, p, k?}` (22,934); `D.words[w]` `{w,r,g,jlpt,k[]}` (8,407 graded) | `data/share_alike/dict.json`, `words.json` | boot; `lookup(id, seq, reading, gloss)` 3240 |
| word → full senses, xrefs, antonyms (lazy) | `D.dictionaryDetails`, `D.dictionaryBySeq` | `data/share_alike/dict-v2/index.json` + 17 shards | `ensureDictionaryIndex` 3808 (worker), `ensureDictionaryDetails(node)` 3949, `ensureDictionaryRowsForForm` 3850 |
| word → kanji | `D.words[w].k` / `D.dict[w].k`, else `[...w].filter(c => D.kanji[c])` | same | inline |
| kanji → meaning, readings, strokes, Kanken, radical, **components** | `D.kanji[c]` `{c,on[],kun[],m,st,kk,kr,parts[],rad}` (2,582; 2,223 with `parts`) | `share_alike/kanji.json` | boot |
| component → kanji family | `D.radicals[part]` `{c,name,st,kanji[],kanjiCount,isKanji}` (926; capped at 80 kanji, `manifest.caps.radicalKanjiCap`) | `kanji.json` `.radicals` | boot |
| official radical | `D.radInfo[n]` (Kangxi 1–214), `D.radByGlyph[glyph]` | `share_alike/radicals214.json` | boot |
| kanji → **sibling words** | `D.kanjiWords[c]`: every dict and graded word containing it, ranked by commonness (`D.wordCap` = 60 shown) | derived at boot 4285–4302 | boot |
| kanji → look-alikes | — | — | `confusablesFor(c)` 24919 |
| kanji → idioms | `D.idiomsByKanji[c]`, `D.idioms[w]` `{w,r,g[],yoji,k[]}` (900) | `share_alike/idioms.json` | boot |
| kanji → strokes, shape | `D.strokes`, `D.kmeta`; SKIP; KKLD; frequency | `strokes.json`, `skip.json`, `kkld.json`, `animcjk/` | boot / `ensureKkld` 16062 / `ensureKanjiFrequency` 15958 / skip-core.js |
| kanji → Kanken level | `D.kanken[c]` `{kk,kr}` | `proprietary_safe/kanken.json` | boot |
| word → synonyms, family, theme, collocations, antonyms, register | `D.sem[w]` → `[{w, rel: syn\|fam\|thm\|col\|ant\|reg, note}]` (82 heads, 718 edges); `REL` labels at 156 | `proprietary_safe/sem.json` | boot; `thesClusters()` 16446 |
| word → **passages** (shelf) | `D.passages[i].tokens` `{s,b,p,r,f,c}` | `data/articles/*.json` | `ensureArticle(p)` 4326 / `prefetchArticles()`; `findExamples(id, cap)` 22515 scans `t.c && t.b === id` per sentence; `sentenceSource()` resolves the position |
| word → example sentences (bank, lazy, not in standalone) | `D.exampleBank` | `proprietary_safe/examples/` (FNV-sharded: 16 index + 23 sentence shards) | `ensureBankExamples(word)` 22595 |
| grammar points | `GRAMMARS()` 23 = 220 authored `GRAMMAR` (169) merged with 24 `grammar-v11` entries (`{id,p,lv,mEn,mJa,form,ex[],note,cues[]}`) | `data/original/grammar-v11.json` | boot `mergeGrammar` 27 |
| grammar ↔ deck passages | per deck `tokens.json`: `grammar {id: pattern}` plus passage rows `[s,b,r,k,ref]` where `k ∈ 語/字/文法` and `ref` is the grammar id on `文法` rows (n2 has 1,359 grammar tokens). All 23 deck grammar ids resolve in `GRAMMARS()`. | `decks/{n1,n2,senmon,kotoba-mine,kotoba-mcd}/tokens.json` | player `tokensFor(deckId, cardId)` (mount.js:84); `deckHost()` grammar resolver 29060 |
| deck word anatomy | `deck.words[]` `{id, term, reading, meaning, defJa, pos, kanji:[{c,m,parts[],st,r}], cards:[{id,ja,form,en,ruby}], tip}` | `decks/*/deck.json` (0.4–5.7 MB) | via player only (`loadDeckPlayer`); **not loaded by Words today** |
| **gloss_ja** (Japanese senses) | tokens.json `defs {wordId\|lemma: token rows}` | built from repo-root `decks/kotoba-mine/source/gloss_ja.json` (build input, not served) | player `lemmaSense(tok)` mount.js:1330 |
| particles | `PARTICLES` 16496, `PARTICLE_BY_SURFACE` | in code | — |
| the learner's own trail | `S.obslog` rows `[ts, kind, key, g]`, `S.taken`, `S.srs` | record | `encounterTrail(key)` 26724, `srsKey(t,id)`, `wordCaptureState(node)` |
| reference catalog | `D.referenceExtra` | `share_alike/reference-extra.json` | `loadReferenceExtra` 15348 |

**Word web recommendation.** Build the graph from `D.dict`/`D.words`, `D.kanji[c].parts`, `D.radicals`, `D.kanjiWords`, `D.sem`, `findExamples` (warm with `ensureArticle`) and `GRAMMARS()`. All of these are already in memory with no new fetch. Deck-token grammar edges and gloss_ja need a lazy fetch of a deck `tokens.json`; treat that as an optional second layer and keep it lazy, because the files are large.

**Where the web goes.** The `word-web` room (`renderThesaurus`) is the natural mount: prepend a web above the clusters. Each node navigates with `go({t:'word'|'kanji'|'radical'|'grammar', id})` (4664), which opens the existing sheet stack. The sheet's word and kanji renderers already draw most of the edges, so a compact "web" strip can also be added inside `renderWordNode`/`renderKanjiNode`.

**Where the code goes.** Put new code in a fenced block directly **after `renderThesaurus`** in corridor.js. A separate `word-web.mjs` would need sw.js PRECACHE, `scripts/corridor-assets.mjs`, the standalone builder and the sw-shell test all updated together, and the standalone build blocks dynamic imports.

### 4.3 Verifier pins

- **B** `#nav-search-input` (15 files), `verify-search-lenses.mjs`, `verify-search-fallback.mjs`, `verify-reference-connections.mjs`, `verify-shelf-search.mjs`, and `[data-grammar]` (5 files).
- **B** `.kdx-lens` filtered by text 'by its shape' (verify-experience:259, skip-standalone:84, skip-ui:81). Its aria-pressed state is checked in pr77-ports:460.
- **B** `verify-relief.mjs:78–82`: `.search-page` and `.skip-ui` need an edge plus shadow.
- **B** `.thes-head` (verify-corridor:296; verify-record-live:209, `.thes-head` containing `.thes-word` '時間'), and `.search-syn .sem-row` (verify-experience:87, verify-journey:243).
- **B** `tools/verify-redesign-foundation.mjs`: tab words → `data-room=search`.
- **B** `verify-corridor-accessibility.mjs:728–740`: contrast of the `#sheet[data-node="word:学校"]` eyebrow 'kanji in this word' and of `.pool-tag[data-reference-door="jlpt:N5"]`. `#sheet` appears in 43 files (510 hits).
- **C (logged label pins)** `verify-corridor.mjs` sheet headers: 'common compounds' / 'words that contain it' (~1204), 'main components' (~1226), 'kanji that contain this part' (~1257), `^\d+ idioms and set phrases$` (~1196) and `Kanji Kentei` (~1140). A word web that relabels these sheet sections must update them deliberately.
- No verifier pins `#words-*` or `.foundation-door`, so they are free to restyle.

### 4.4 Protected nearby

The dictionary worker queue (`dictionarySearchGeneration`, `navSearchRepaint`, the `D.dictionarySearch*` maps); `ensureDictionary*` performance recording; `captureStorePatch` and `toggleWordSave` from the sheet `#sheet-take`; `renderContextPicker` and `renderListPicker` (list writes); and `S.navSourceContext` (source return frames).

### 4.5 Restyle path and risk

- **CSS (words.css; `html[data-room='search'|'kanji'|'grammar'|'word-web'|'idioms']`), low risk.** The B-concept night "phosphor plate" is a night-world `:is(...)` block scoped to these rooms.
- **The sheet is global.** Style it as `#sheet` without a room prefix, because it opens over every room. It must still pass `verify-theme-consistency` (sheet grounds are `--sheet-*`/`--world-sheet-*`) and the accessibility contrast checks.
- **Markup, medium risk.** The word web is new code, with no label pins until it changes existing sheet sections. `renderSearchResults` is shared with the shelf search: changing its markup breaks Read pins (`.search-syn .sem-row`, `[data-result]`), so share that change with the Read lane or leave it CSS-only.

---

## 5. Me (tab `me`, entry view `me`)

### 5.1 Entry points and DOM

| View | `data-room` | Entry function |
|---|---|---|
| `me` | `me` | `renderMe` 28350 |
| `settings` | `settings` | `renderSettings` 28367 (`attachWorldPicker` for the world picker) |
| `kagami` | `progress` | `renderKagami` 14068–14345 (helpers `kagamiBand` 13825, `kagamiNote` 13836, `kagamiEdge` 13860) |
| `srs-stats` | `progress` | `renderSrsStats` 21150 (reached from Today's `#deck-stats`) |
| `personaldeck` | `personal` (`data-register=hall`) | the personal collection; see Cards |

**Me DOM:** `h1.view-title`, `p.gloss`, then `div.foundation-doors` > `button.grammar-link.foundation-door` with ids `#me-progress`→kagami, `#me-statistics`→srs-stats, `#me-collections`→tray, `#me-settings`→settings and `#me-personal`→the `?deck=personal` URL. `foundationDoor` (28334) uses `keepNavigationReturn`.

**Settings DOM:** `section.foundation-section` > `h2.eyebrow` and `div.lang-seg.settings-language[role=group]` > `button[data-lang=bi|ja][aria-pressed]`, then `.foundation-doors` holding `#settings-world`, `#settings-pace` (→tray with `S.srsPrefsOpen`), `#settings-reading` (→airead), `#settings-tutor` (→ai) and `#settings-backup` (→tray).

**Kagami DOM:** `.kagami-band`, `.kagami-cell`, `.kagami-levels`, `.kagami-level`, `.kagami-count`, `.kagami-frontier`, `.kagami-edges`, `.kagami-edge-row`, `button.entry-row.kagami-row`, `.kagami-pair`, `.kagami-obs`, `.kagami-warn`, `.kagami-prov`, `.kagami-thin` and `#kagami-unverified-practice`.

**Stats DOM:** `.stats-standing`, `.stats-col`, `.stats-n`, `.stats-l`, `.stats-today`, `.stats-retention` and `.fine.stats-axis`.

### 5.2 Data at render time

`S.stats` (daily reviews and export timestamp), `S.srs`, `S.taken`, `S.lists`, `S.obslog` (encounters: tap, drift, probe, lesson, reveal, dojo), and the kagami model (`kagami/2`, bands per level, measured vs unverified). Assessment results come from `reconcileAssessmentResults`. Also `THEME_UI`/`themeId()` and `S.lang`.

The concept's A-graft "Me book" (seal calendar, gold mended seams, characters read unaided) can be derived from `S.stats` days, `S.srs` lapses→recovered, and `S.obslog` tap and probe rows. **Read only**: no new storage.

### 5.3 Verifier pins

- **B** `tools/verify-redesign-foundation.mjs:97–104, 286–301`: `#me-settings` → `data-room=settings`, `#back` returns to `me`, and the personal route ends with `data-room=personal` and `#tab-me[aria-current]`.
- **B** the `#kagami-link` shelf door (verify-dojo-door:42, verify-experience:265, verify-corridor:1475, verify-design-reader-shelf:447). The `verify-kagami.mjs` and `verify-kagami-freshness.mjs` model checks are behavioural truth.
- **B** `.lang-seg` (verify-corridor:436 `navigationLabelSize`, and the language cycle in verify-experience:269).
- **C** no exact Me labels are pinned.

### 5.4 Protected nearby

The record and export (`renderRecordSync`, `recordSha256` 11400), the kagami admission policy (`kagami-admission/2`, tutor binding), and `setKairoTheme` / `kairo-theme`.

### 5.5 Restyle path and risk

- **CSS (me.css; `html[data-room='me'|'settings'|'progress']`), low risk.**
- **Markup, low risk for `renderMe` and `renderSettings`.** They are tiny Sol-built functions with only id pins. A "Me book" lead (characters read unaided, seal calendar) can be a new helper called first in `renderMe`. Keep the five door ids, and keep `#me-settings` reachable.
- Kagami markup changes are medium risk, because the truth wording matters. Restyle only.

---

## 6. Cards (deck players; Codex Astra, after content)

### 6.1 Entry points and DOM

| Player | `data-room` | Mounted by | Entry |
|---|---|---|---|
| Kotoba player (n2, n1, senmon, kotoba-mcd, kotoba-mine) | `deckplay` | `renderDeckPlay` 21835 → `loadDeckPlayer` 21761 → `decks/player/mount.js` `render(main, {deckId, english, storage, host: deckHost(), onLeave})` 2274 | The DOM is built with `el()` inside mount.js (2,324 lines): `.kp[data-look][data-host]`, `section.kp-home/.kp-study/.kp-list/.kp-settings/.kp-done`, `#kp-card` (`.kp-sentence`, `.kp-tok`, `.kp-target`, `.kp-blank`, `.kp-answer` > `.kp-def`, `.kp-ctx`, `.kp-more`), `.kp-grades` > `.kp-grade`, `#kp-pop`, `.kp-progress i`, `.kp-count`, `.kp-chip`, `.kp-levelchip`, `.kp-kindchip`, `.kp-swatch` |
| Personal collections | `personal` (Me tab) | the `?deck=personal` boot at 4127 → `decks/personal/mount.mjs` `mount(container, {bridge, themes, currentTheme, onTheme, english})`, plus `personalDictionaryBridge` 3305 for the sheet overlay | `.pc-*`: `.pc-card`, `.pc-controls`, `.pc-grades`, `.pc-status`, `.pc-file`, `.pc-answer`, `.pc-relations`, … |
| Context deck 文脈札 | `contextdeck` | `renderContextDeck` 5411 → `decks/context-dense/mount.js` `render(host, {bilingual, storage, onLeave})` | `.cd-room`, `.cd-paper`, `.cd-sheet`, `.cd-front`, `.cd-backline`, `.cd-dock` > `.cd-choice`, `.cd-btn`, `.cd-primary`, `.cd-swatch`; `html[data-cd-focus]` (cleared in `render()`) |

The deck CSS is injected on mount **after** cards.css (§0.5). The deck host adapter is `deckHost()` 29056 (word, kanji, grammar, open, taken, capture → `toggleWordSave`, addToList).

### 6.2 Data

- `deck.json`: `words[]` with `kanji[{c,m,parts,st,r}]` and `cards[{id,lv,ja,form,en,ruby,kind,src}]`.
- `tokens.json`: `passages`, `cards` (card id → passage index), `defs` (gloss_ja) and `grammar`.
- Player state is in localStorage under `bunki-cloze:<deck>`, scheduled by FSRS with `data/fsrs-pin.json` (`createScheduler`, engine.js:110).

### 6.3 Verifier pins

- **B** `verify-kotoba-mine.mjs` has 27 computed-style checks: token and colour readings (2061–2077), page textures on the page and never on the card (`cardTex`/`pageTex` 2073), reveal animation name and duration on `.kp-answer` and `rt` (2284–2287), `.kp-progress i --kp-frac` (2295), `.kp-tok` underline on hover (996–1008), grade bar clear of the tabs (1326), and focus and dim opacity (1298).
- **B** `contrast-kotoba.mjs` reads **player.css source text** (`.kp` and `.kp[data-look=…]` blocks): passage contrast ≥ 7, body ≥ 4.5, gloss and muted floors, and 字-hue distinctness ΔE_ok ≥ 10. **Token overrides placed in cards.css are invisible to this check.** Change `--kp-*` in player.css itself, or extend the check.
- **B** `verify-n2n1-decks.mjs:68–76` (`[data-deck]`, `.kp-settings .kp-icon`), `tools/kotoba-player-front.test.mjs` and `tools/kotoba-deck-leaks.test.mjs` (zero-leak front), and `tools/kotoba-player-engine/host.test.mjs`.
- **B** `verify-personal-collections.mjs:38` and `verify-personal-host.mjs:56` (`.pc-file`).
- **B** `tools/verify-redesign-docks.mjs:241, 273, 352` (`.cd-dock button` ×4, `.kp-swatch`, `#kp-rule-dismiss` clearance).

### 6.4 Protected

The `bunki-cloze:*` and `bunki-srs-deck:*` keys, card ids, `normalizeState`/`inspectState`/`repairCard`, the before-restore backup, `sentenceNodes({front:true})`, `decks/n2n1/source/**`, and the deck build outputs (Astra's lane).

### 6.5 Restyle path and risk

- **CSS, medium risk.** Put the edits in player.css, personal.css and context-deck.css themselves (they are Cards-lane files) so that contrast-kotoba measures them. Use `rooms/cards.css` only for room-frame tokens (`html[data-room='deckplay'|'contextdeck'|'personal'] body`). A front-face rule may **never** reveal `rt`, `.kp-en` or answer nodes: no `display`/`visibility` overrides on `.kp-answer`, `rt` or `[hidden]`.
- **Markup:** only inside the deck mount files. They are separate from corridor.js, so there is zero collision with the room lanes.

---

## 7. Recommended order and lane boundaries

### 7.1 Order

1. **Skin/Shell lane first** (one agent, short). It applies concept C+A to the Tokens v2 values (editorial.css fence) and builds any tab-bar change ("the Line" due badge). After that it freezes the shared surface. Run the F1 subset, `verify-redesign-foundation` and `lint-ui-language`.
2. **Learn, Me and Today in parallel.** These have the smallest pinned surface. Learn and Me have no numeric typography pins, and Today's pins are counts and ids.
3. **Words** (the word web is new code, the largest build) in parallel with **Read** (CSS-first, numerically pinned).
4. **Cards** last (Astra, after the content rebuild).
5. **Integrate** in this merge order: Skin → Learn → Me → Today → Words → Read → Cards. Then run storage-integrity, sw-shell, n2n1-decks and the 390×844 day/night EN/日本語 tour.

### 7.2 Lane ownership (corridor.js by function, CSS by file)

| Lane | corridor.js functions it may edit (add new helpers directly above or below them, never at end of file) | CSS it owns | Must not edit |
|---|---|---|---|
| **Shell/Skin** | `render()` chrome and crumbs 28481–29047, `buildGingaChrome`, `PRIMARY_TABS`, `buildPrimaryTabs`, `observePrimaryDocks`, `foundationDoor`, `ROOM_IDS`, `REGISTER_*`, `stampRegister`, `renderRoomError`, `tx`/`withEn`/`biLabel`, `THEME_UI`/`setKairoTheme` | editorial.css (token fence and 3306–3391), corridor.css global, register.css | room renderers |
| **Today** | `renderTray`, `deckCounts`, `renderDeckTable`, `renderDeckDoors`, `srsRoomBack`, `renderListPage`, `renderBrowse` (+`BROWSE_*`), `renderReview` view code (not grade handlers), `renderReviewBreak`/`Wait`/`Undo`, `renderAiQuiz` (view only), `renderSrsPrefs`, `renderReadingPlaces`, `renderRecordNotes`, `renderPortRow`, `renderNoteDoor` | rooms/today.css | `todayQueue`…`startReview`, `body.zen .grade-row` in corridor.css, `renderRecordSync` internals |
| **Read** | `renderShelf`, `renderShelfBody`, `shelfCard`, `storyPicture`/`readerPicture` (markup around the image, not the crop), `storyLede`/`storyDate`, `renderReader`, `renderReaderTip`, `buildListenRow` (view), `showMini`, `openReaderWordMenu`, `renderArchive`, `renderFeed`, `renderPublisherReading`, `renderSourceInbox`/`renderSourceReading` (CSS-first) | rooms/read.css | `ensureArticle` block, `commitReadDone`, `REGISTER_ROOM_DOORS` labels, `#reader-take` (Shell) |
| **Learn** | `renderFocus`, `renderStudyHall`, `renderDojoDecks`, `DOJO_DECKS` labels, `renderDeckPlay`/`renderContextDeck` wrappers (loading/error states only) | rooms/learn.css | `startFocus`/`refillFocusQueue`, `renderMock`/`renderGuided`/`renderLessons`/`renderLevels`/`renderAiSetup`/`renderSentencePractice` (token-only this pass) |
| **Words** | `renderSearchPage`, `renderWordsDoors`, `renderThesaurus` (+ the new word-web block after it), `thesClusters`, `renderGrammar`, `renderYoji*`, `renderKanjidex`/`renderKdx*`, `renderSheet` frame, the node renderers (`renderWordNode`, `renderKanjiNode`, `renderRadicalNode`, `renderIdiomNode`, `renderGrammarNode`, `renderParticleNode`, `renderDictionary*`, `renderEncounterTrail`) | rooms/words.css (+ global `#sheet` rules) | `renderSearchResults` markup (shared with Read: CSS only, or coordinate), the dictionary worker and `ensureDictionary*`, `go()`, `back()` |
| **Me** | `renderMe`, `renderSettings`, `renderKagami` (view; helpers read-only), `renderSrsStats` | rooms/me.css | kagami model and admission, `setKairoTheme`, the record/export |
| **Cards** | none in corridor.js (only `deckHost` if Astra needs an adapter field; coordinate with Shell) | decks/player/player.css, decks/personal/personal.css, decks/context-dense/context-deck.css, rooms/cards.css | storage keys, engine.js scheduling, `sentenceNodes` front, deck JSON |

### 7.3 Collision rules

- Merge conflicts in corridor.js come from **adjacent hunks**. Every lane inserts new helpers next to its own functions, which are thousands of lines apart. Nobody appends at the end of the file or touches `render()` except Shell.
- New labels always go through `tx(ja, en)` with both arguments. Run `node tools/lint-ui-language.mjs` per lane.
- Each lane runs its named verifiers (§n.3) plus `verify-theme-consistency`, `verify-relief`, `verify-corridor-accessibility` and `verify-corridor-storage-integrity` before handing back. Any pin change gets a `VERIFIER_CHANGES.md` row marked C, and never a B.
