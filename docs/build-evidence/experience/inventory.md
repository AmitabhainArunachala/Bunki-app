# Whole-experience QA inventory

Prepared before signoff execution, 2026-09-14. Authority: `docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md`. Initial visible-control discovery: fresh Chromium, landing → navigation → shelf. The existing journey harness is historical evidence, not the acceptance authority.

## Method and dimensions

The primary journey uses one clean browser context and normal Playwright pointer/keyboard input only; no seeded storage, route shortcuts, evaluated clicks, hidden mutators or HTTP mocks. Read-only DOM/storage inspection supplements (never replaces) visible outcomes. Warm offline checks change browser network availability, not app state. Supplemental contexts are explicitly labeled ancillary; none may retroactively satisfy a failed primary step. Source tested is the reference branch's actual `index.html` and assets served over local HTTP. Standalone/native/live-provider equivalence is not inferred.

For each row: check functional outcome, visible state and legibility, return/context behavior, canonical learner-state boundary, and evidence. Viewports: mobile 390×844 throughout primary; narrow 320×844 and desktop 1280×900 on representative dense surfaces. Palette: default, complete ten-world chooser, dark `yoru`, restoration. Inputs: mouse/touch-equivalent clicks, fill/select, real keyboard Tab/Enter/Escape/Back. Empty/error: search misses, unconfigured tutor, offline actions. Reload/back: saved learner state, palette, room return.

| ID | User intent / observed controls | Functional & state expectations | Visual / usability check and screenshot evidence | Coverage dimensions |
|---|---|---|---|---|
| E01 | Fresh Drift; `open navigation`, search, `choose a world`; nav shelf bubble | Clean landing; no review debt from passive exposure; navigation reveals a clear shelf door | Resting Drift, expanded navigation, shelf; discoverability without instructional clutter | 390, clean, pointer |
| E02 | Shelf search; `#search`; result and semantic-neighbor rows | Japanese word query, kana/English/romaji where supported; miss clearable; hit opens correct sheet without enrollment | Results, miss, semantic cluster; input remains usable | 390, keyboard, empty |
| E03 | Word sheet; kanji rows; components; containing-kanji; compounds; sheet back/close | Recursive word → kanji → component → other kanji → compound; back retains original context; browsing is not mastery | Each distinct recursive node; dense sheet scrolling and clear way out | 390, recursion, return |
| E04 | Writing room entry, faint wake, ten palettes, 音読み/訓読み, stroke-number toggle | Dormant only kanji + wake; awake allowed controls only; exact palette roster; Escape sleeps/exits and Back restores origin | Dormant, awake, dark numbers, restored kanji | 390, dark, keyboard, history |
| E05 | Shelf article buttons and details | Source details disclose provenance/difficulty honestly; reader loads actual text | Details and reader first viewport, no accidental merged difficulty/mastery | 390, content |
| E06 | Reader tokens, reading/gloss/entry stages; independent reading dials; capture | Normal input opens token stages; capture saves encounter with NO scheduling unless explicitly chosen; return restores article/place | Reading rung, gloss/entry, captured state, resumed reader | 390, keyboard, capture boundary |
| E07 | My Study/lists tray (`#tray`); saved item; explicit enrollment/review doors | Saved and enrolled states distinguished; explicit opt-in before review; review recall/grade produces visible outcome and durable trace | Empty or saved-only tray, enrolled tray, recall, grade, summary | 390, empty, explicit scheduling |
| E08 | Lessons; level selector; lesson row; next; quiz option; end enrollment button | Complete a real lesson; evidence recorded but no automatic new enrollment; leave via normal back control | Catalog, learning, quiz, completion, returning shelf | 390, progression, no auto-enrollment |
| E09 | Mock papers; choice/start/answer/next/submit/results | Start and answer real bundled paper, submit, see score/results; NO automatic review enrollment | Paper catalog, question, chosen answer, results | 390, assessment boundary |
| E10 | Reference library; vocab/kanji tabs; N1/N3/advanced Kentei collection; paging/search/detail | Reach complete bundled collections, search/paging/entry return work; supplementary records honest/read-only; no state mutation from browsing | Overview, N1 and N3, advanced Kentei, source-only detail, empty/recovery | 390, 320, 1280, long/dense |
| E11 | Grammar door, search/index, grammar entry and links | Index and detail accessible and recursive; no mastery side effect | Grammar index and entry | 390, content |
| E12 | Thesaurus, semantic cluster, neighbor; four-character idioms | Differences/meaning useful; word entry doors reachable; return path | Synonym cluster and idiom list/detail | 390, recursion |
| E13 | 字引 shape finder; component/stroke/SKIP controls actually shown | Observe current controls first; validate intended 木+8→林 or equivalent current flow; do NOT require absent legacy `[data-kdx-st="8"]` | Shape selection and real result sheet; distinguish stale test vs defect | 390, search, regression investigation |
| E14 | Learner mirror (`#kagami-link`), lens/time/profile controls if shown | Evidence not falsely flattened into mastery; empty or personal history clearly distinguished | Mirror primary and changed lens if accessible | 390, semantics |
| E15 | Export/import doors; download | Export real local envelope, parse exported document; do not import/overwrite primary state | Export affordance and successful download receipt | 390, persistence |
| E16 | Palette/settings & EN/日本語 toggles | Exactly sumi, shu, iwa, rokusho, yoru, hokusai, akafuji, nami, keyblock, hakuu; no public kaku; UI language and palette full reversible cycle | World chooser, dark shelf, Japanese chrome, restored English/default | 390, dark, persistence |
| E17 | Tutor invite; endpoint/key/privacy/config controls if shown; prompt/send | Safe unavailable behavior with no key/provider; no fabricated response; no state changes. No mock HTTP claims about live tutor | Unconfigured screen, empty validation/offline messaging | 390, empty/error, offline |
| E18 | Reload, browser Back, home return | Saved/enrolled/review/lesson/mock evidence persists; warmed offline reference/reader works within actual architecture; browser history behaves coherently | Reloaded study or settings, offline content, final Drift | 390, reload/back, offline |
| E19 | Dense responsive surfaces | No horizontal overflow or obstructed controls on 320 and 1280; sensible typographic hierarchy | Narrow reference, desktop reference/shelf; focus state screenshots | 320, 1280, keyboard |

## Exploratory/off-happy-path scenarios

1. Search nonsense or malformed-looking plain text, recover using clear control/keyboard; verify no injected markup and no learner-state mutation.
2. Disconnect after warm content loading; attempt safe tutor operation and navigate cached/reference material. Distinguish warm in-memory behavior from a cold offline guarantee.
3. Open recursive detail from a scrolled/paged reference list, close/back, inspect query/page/scroll/focus continuity.
4. Keyboard Tab into significant controls, Enter to activate, Escape twice in writing room; look for hidden DOM content erroneously exposed to assistive technology.
5. Narrow 320 px dense catalog and top navigation; inspect clipping separately from document-level overflow.

## Initial visual observations (not signoff)

Fresh Drift is visually distinctive, but its icon-only navigation requires exploration. Shelf has bilingual labels and many equally weighted doors; the top view title is truncated on 390 px. These are usability questions to revisit, not assertions of blocker defects. The fresh Drift accessibility snapshot exposed hidden radical-explanation text even though the screenshot showed only Drift; investigate separately rather than ignoring it.

## Signoff boundaries

A local Chromium viewport is not a real iPhone, a screen-reader audit, native packaging, live tutor reliability, corpus completeness, or a production-offline guarantee. Screenshots are viewport captures; expected/observed results and status are recorded per image in results.json. Failed steps remain failed, follow-on blockers remain blocked, and exploratory recovery never erases an earlier product failure. No runtime/core/generator edits, commits, pushes, merges, or deployment are owned by this QA lane.

## Final planned-versus-actual reconciliation — 2026-09-14 08:54 UTC

This section supersedes acceptance wording in the **pre-run inventory** where actual controls or later operator directions differ. It preserves the original plan rather than rewriting history.

- **E01:** Fresh Drift → expanded navigation → shelf completed. Closed radical explanation is absent from accessibility snapshot after main's fix.
- **E02–E03:** Semantic-neighbor search, literal malformed input, 森林 → 森 → 林 component → 林 kanji → compound completed without enrollment. No exhaustive kana/romaji/English query matrix.
- **E04:** Later inline operator redirects permit back, world seal and corner controls, unlike constitution §6's stricter resting-room wording. Tested actual wake, ten-world roster, dark numbering, two Escapes restoring 森. Device/browser history Back not independently tested. Living-ink screenshots show animation; physical-device latency remains unknown.
- **E05:** Source-details disclosure clicked; screenshot 15 cuts off its expanded content below fold. Do not treat that screenshot as full provenance-disclosure visual signoff.
- **E06–E07:** Current sheet control is explicitly **memorize**. It enrolls the deliberate choice immediately; no independent save-only capture door exists there. Passive reading/lookups leave debt unchanged; one chosen 朝 creates no FSRS grade until deliberate review. Two deliberate grades (including new-learning repeat), visible completion and durable trace verified. Empty list rejected; named list created; Escape cancels rename. No assertion that a save-only tray exists.
- **E08–E09:** One real lesson and one complete mock paper completed, each with exact deck/schedule/review snapshot unchanged. Optional enrollment controls deliberately left untouched. Mock previous restores selected answer.
- **E10–E14:** N1 paging/detail/page return, empty recovery, N3, advanced Kentei source-only entry, grammar, thesaurus, idiom, current shape finder and learner mirror exercised. Not every corpus row, grammar link, mirror lens or shape-reading/drawing variant. SKIP absent reference-only; mandatory combined-tree hook exists in harness.
- **E15–E16:** Real export downloaded and JSON parsed; destructive import not attempted. EN → 日本語 → EN and default → dark → default cycle completed; palette reload persisted. All ten seals checked, not all ten rendered-world combinations. Representative keyboard Tab/Enter/Escape only.
- **E17–E18:** No-key online/offline tutor remains setup-only; blank save returns shelf without key, provider request or canonical-state change. No configured/live provider test and no HTTP response mocks. HTTP architecture allows **warm loaded offline** reference browsing here, not HTTPS service-worker cold/reload-offline proof. Normal reload preserved chosen item, two review records, lesson and mock. UI back/home succeeded; browser/device history behavior needs complementary suite.
- **E19:** Reference tested at 320 and 1280, shelf at 390/320/1280, dark shelf and selected keyboard focus. No horizontal overflow on asserted surfaces; narrow header language controls are exactly 44px tall with nowrap. At 320 long search placeholder truncates inside input; shelf doors wrap into a longer page. Not every page at every viewport.

Final automated result: **39 pass, 0 fail, 1 expected SKIP absence; 61 screenshots**. Runtime revision `e35beb3e32f5ef63cc9e4bb93306b62f4c8d29dc`; nine runtime/data asset hashes unchanged. `results.json` includes per-shot expectation and actual visual review, `screenshot-manifest.md` is the human-readable manifest, and `visual-review.json` preserves final reviewer annotations. All final screenshot filenames start `20260914085149`; earlier runs are diagnostics, not canonical final evidence.
