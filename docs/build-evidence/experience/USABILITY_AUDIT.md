# Bunki whole-experience usability audit

Date: 2026-09-14. Scope: the integrated Corridor browser prototype, reference-library cleanup, and a prospective combination with the separately reviewed SKIP feature. Neither feature is merged by this work. This is an agent-operated real-browser evaluation, not a study with recruited human participants or a physical iPhone acceptance test.

## Result

The reference branch's clean-context journey passed **39 checks**, with one expected SKIP-absence marker, and produced **61 final screenshots**. The disposable combined build passed **40 checks with SKIP required**, with no failures or skips, and produced **63 final screenshots**. The two final walkthroughs therefore provide **124 manifest-declared full-resolution captures**, separately from focused regression screenshots and earlier diagnostics.

The implementation revisions tested are reference `e35beb3e32f5ef63cc9e4bb93306b62f4c8d29dc` and SKIP `66e5a3785b15f0281bffb5c80aaa0b6b5a97dc29`. Git's three-way merge-tree computation was conflict-free; detached verification snapshot `3040f8faccf503d6c2bca7d27114e4510cef0119` was used only for testing, with its standalone artifact rebuilt. The reference and SKIP PRs remain independent and unmerged.

| Verification layer | Result | Evidence |
|---|---:|---|
| Reference source/core assertions, raw pinned archive enabled | 20/20 | [reference-core.log](../experience-regressions/reference-core.log) |
| Byte-identical reference archive rebuild | Pass | [reference-data.log](../experience-regressions/reference-data.log) |
| Reference packaging | 4/4 | [reference-packaging.log](../experience-regressions/reference-packaging.log) |
| Reference browser behavior, including blocked-network standalone | 49/49 on combined tree | [reference-browser.log](../experience-combined/reference-browser.log) |
| Recursive connections, focus, scroll and evidence boundaries | 19/19 on both trees | [connections.log](../experience-combined/connections.log) |
| Existing stock mock-paper isolation | 25/25 | [mock.log](../experience-regressions/mock.log) |
| Existing accessibility regressions | 46/46 | [accessibility.json](../experience-regressions/accessibility.json) |
| Existing writing-room regressions, serial run | 51/51 | [writing-room.log](../experience-regressions/writing-room.log) |
| Historical uninterrupted learner journey | 11/11 stations | [journey.log](../experience-regressions/journey.log) |
| New clean-context reference walkthrough | 39 pass, 1 expected absence | [results.json](results.json) |
| New clean-context combined walkthrough | 40/40, SKIP required | [combined results.json](../experience-combined/results.json) |
| SKIP source/core checks, raw archive enabled | 19/19 | [skip-core.log](../experience-combined/skip-core.log) |
| SKIP packaging | 3/3 | [skip-packaging.log](../experience-combined/skip-packaging.log) |
| SKIP UI: typed codes, wheels, filters, recursion, reload, retries | 41/41 | [skip-ui.log](../experience-combined/skip-ui.log) |
| Combined SKIP standalone with subresource network blocked | Pass | [skip-standalone.log](../experience-combined/skip-standalone.log) |

Counts are suite-specific assertions, not a sum of unique product requirements or a claim of full application acceptance. The hosted workflow now runs the recursive and continuous browser suites, requires SKIP when installed, and uploads screenshots even on failure. The local sandbox used Node 20; the hosted workflow uses the repository's supported Node 22.

## What “connected” means

A feature is not accepted merely because its own page works. Its entry point, onward relationships, return path, current location, retained search/page/scroll/focus, and learner-state consequences must also make sense. The starting inventory is [inventory.md](inventory.md); the repeatable walkthrough and its individual outcomes are [results.json](results.json).

The learner-facing relationship map is:

```text
Drift
 ├─ navigation → reading shelf
 │   ├─ search → word → kanji → radical/component → containing kanji
 │   │                    ├─ compounds → word → examples → sentence
 │   │                    ├─ writing room → controls/palette → same kanji
 │   │                    └─ level label → full reference collection
 │   ├─ article → token → reading/gloss → entry → source sentence
 │   │                                             └─ original article → entry
 │   ├─ reference library → JLPT / Kanji Kentei → collection → entry
 │   │                   ├─ dictionary search → result → return
 │   │                   ├─ My Study → return
 │   │                   └─ mock papers → return
 │   ├─ lessons → learn → answer → practice outcome
 │   ├─ mock papers → answer → submit → assessment outcome
 │   ├─ grammar / thesaurus / idioms → canonical recursive entries
 │   ├─ shape finder → components + strokes → kanji
 │   │               └─ SKIP lens / typed code → kanji [combined tree]
 │   ├─ learner mirror → evidence by learning dimension
 │   └─ tutor setup → honest unconfigured/offline state
 └─ explicit Memorize → My Study → recall → grade → review trace

Any entry → search detour → result → return to original entry
Any supported recursive step → Back → same parent and place
Settings → ten worlds / interface language → restore and reload
My Study → local export → learner-owned backup
```

These are navigation relationships, not equivalences between learning outcomes. Browsing is not retrieval; lesson and mock completion do not silently enroll material; dictionary matches do not confer JLPT classifications on every sense; related Kentei forms do not inherit each other's readings or grades.

The full data-level graph is separately reproducible in [../reference/relationships.json](../reference/relationships.json). Its nodes and edges retain canonical identities and source assignments rather than collapsing visually similar characters or homographs. The graph is build evidence, not an additional runtime data download.

## Defects repaired

| Finding | Learner consequence | Repair and evidence |
|---|---|---|
| Search and source-reading detours discarded the entry stack | An exploratory lookup could lose its origin instead of behaving like a reversible branch | Transient return frames preserve canonical nodes, origin, query and place. Recursive-connection browser tests exercise the outward and return journeys. |
| Nested entry return lost focus or expanded compounds | The learner had to hunt for the previous door and reopen already expanded content | Parent-sheet scroll, initiating door and expansion state are retained through recursion. |
| Enter opened a search result and could immediately activate its newly focused Back button | Keyboard lookup appeared not to open an entry | Native Enter activation is canceled before the result handler runs; composition Enter does not navigate. This works with ordinary and optional SKIP result types. |
| Level tags and reference collections were insufficiently connected | The full index could feel like a separate mini-app rather than the destination of a level label | Canonical JLPT/Kentei tags open the shared exhaustive collections and return to the originating entry. |
| The reference index had no obvious full-dictionary escape | A collection miss could look like the word did not exist anywhere | Visible dictionary-search actions preserve the query and support returning to the reference origin. |
| Narrow header labels wrapped despite no page overflow | Japanese labels became awkward vertical fragments and controls competed for space | Responsive spacing preserves 44px controls and unbroken labels; the full breadcrumb remains available to assistive technology while the page names its room. |
| Legacy language-toggle styling darkened both choices | The inactive Japanese label had poor contrast on the English-selected switch | The old single-button selector no longer styles the modern grouped control; both language states were visually inspected. |
| Tappable category badges used provenance-sized typography and height | Recursive category doors were difficult to read and hit accurately | Interactive category badges now use 12px text and a minimum 44px touch target; passive source badges are not enlarged indiscriminately. |
| The closed Drift radical explainer appeared in an accessibility snapshot | A user could encounter unrelated hidden explanatory prose at the front door | The generated layer now applies explicit hidden/ARIA state, focuses the open explanation, and restores focus on Close/Escape. The preserved original artwork is unchanged. |
| A historical journey test used an obsolete interaction sequence | The useful whole-journey regression failed before exercising its intended shape-search assertion | The test now opens the visible “by strokes” lens before selecting eight strokes. Its original requirement that 木 + 8 finds 林 remains intact. |

## Usability assessment

**Orientation and recovery:** The strongest improvement is making exploration reversible. Word, kanji, component, collection and source reading now behave more like connected branches of one learning thread. A visible action alone was not enough for signoff: the return had to retain the relevant parent, query, expanded material and place.

**Discoverability:** The bilingual shelf names its destinations and provides a workable index into a large prototype. It still presents many similarly weighted choices, and the immersive Drift front door asks a newcomer to discover its navigation symbol. Those are product-design questions for observed human sessions, not reasons to impose an unrelated redesign during this cleanup.

**Reading and visual hierarchy:** Phone and desktop screenshots must be judged independently of numerical overflow checks. The narrow-header defect is a concrete example of why “everything is technically inside the viewport” is not sufficient. Reference collections remain long-form, paginated browsing surfaces, not fixed-height dashboards; scrolling is intentional, but the collection title, scope, search and first result should establish the task before deeper exploration.

**Learning-state clarity:** The current entry action is explicitly named Memorize and starts that chosen learning item. This audit does not invent a separate save-only control that the sheet does not expose. Passive browsing, lesson completion and mock completion are separately checked for unintended enrollment; the mirror remains an evidence view rather than a certificate of proficiency.

**Truthful absence:** Empty collections, source-only records, missing metadata and an unconfigured tutor should remain understandable rather than acquire guessed data or simulated success. A related form is a useful research relationship, not permission to copy its missing readings or grade.

**Data footprint:** Preserving the full source record is not free. The supplemental payload grows from 939,004 to 3,032,827 raw bytes, or 163,065 to 792,278 gzip bytes; the 10,400,660-byte full relationship graph remains evidence-only. A same-sandbox Node benchmark showed a lower median catalog-build time after sorting optimization but higher retained heap, roughly 42.2 to 70.3 MB. These are comparative diagnostics, not low-end-phone performance guarantees; the raw measurements and method are in [../reference/performance.json](../reference/performance.json).

**Animation responsiveness:** The living-ink writing room can make headless software-rendered input slow. A concurrent run of the existing writing-room suite timed out while its locator already reported a visible palette; that diagnostic is retained rather than erased. The serial rerun passed 51/51 and both continuous journeys completed; the reference run still measured approximately 6.2 seconds to wake the controls in this environment. Real-device latency remains an explicit acceptance item.

## Verification and screenshots

The execution ledger records checks, expected outcomes, observed outcomes, screenshots, viewport geometry, input method, errors and runtime asset hashes. Initial exploratory failures are retained separately and are not counted as final successes. The whole-experience run is complemented by the reference coverage suite, recursive-connection suite, existing accessibility and writing-room suites, mock isolation tests, and the repaired historical flowing journey.

The primary walkthrough uses a clean learner context and normal browser input. Read-only inspection of DOM and local state verifies visible outcomes; hidden application mutators, seeded learner history and fabricated tutor responses do not satisfy that primary journey. Ancillary suites that stage conditions are identified as such rather than being described as a fresh-user test.

Full-resolution viewport captures and their expected-state descriptions are in the screenshot manifest. The visual review considers control visibility, text wrapping, touch targets, layered-sheet readability, current location, empty states and dark/light continuity, not just screenshot existence.

Use the [reference screenshot manifest](screenshot-manifest.md) and [combined screenshot manifest](../experience-combined/screenshot-manifest.md) for the exact final image sets. They distinguish full-resolution reviews, contact-sheet reviews, and limitations of individual captures; animated writing frames do not prove a completed glyph, and an offscreen section cannot be judged from a viewport screenshot.

## Remaining boundaries

| Dimension | What this audit can establish | What remains unproven |
|---|---|---|
| Browser interaction | Real local Chromium, normal pointer/keyboard inputs, responsive viewports and persistent learner-state transitions | Physical iPhone Safari gestures, OS interruptions, native share sheets and force-quit recovery |
| Accessibility | Browser focus/dialog/keyboard regressions, contrast and geometry checks, visual inspection | A full VoiceOver or other screen-reader session with an actual user |
| Offline | Explicitly identified warmed-content and standalone/network-blocked tests | A general cold-start/native offline guarantee across every content/provider path |
| Tutor | Safe unconfigured and offline behavior, no invented provider response | A live paid-provider conversation, privacy/resilience/cost acceptance or pedagogical quality |
| Listening and speech | Only the controls and limitations actually exposed by this prototype | Full listening examinations, speech capture, pronunciation judgment or validated audio-provider behavior |
| Reference completeness | Exhaustive indexing of the attested committed sources and auditable relationship integrity | An official complete modern JLPT syllabus, fabricated N3 kanji assignments, or missing Kentei glyph/reading/meaning data |
| Product acceptance | Repeatable browser evidence for this bounded cleanup | A recruited-user usability study, the native seven-day acceptance, or “Bunki complete” |

The older product constitution and later writing-room implementation comments differ about visible corner controls. This audit preserves the later implemented back/seal/number/speed controls and tests their current behavior; it does not silently rewrite the frozen or historical authority record.
