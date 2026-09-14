# Reference library verification

## Scope

Build exhaustive browsing of the committed JLPT and Kanji Kentei reference
records, separate from learner-selected study, AI-tutor material, and mock
papers. This is not a claim of a complete official exam syllabus.

The baseline is `124f08b3` on main. The SKIP feature remains a separate PR.
Frozen specifications, source corpus data, the quiet writing room, lesson
selection, scheduler, and learner-state schema are outside this change.

## Coverage inventory

- All source-tagged JLPT words from both dictionary layers, including N1.
- All available JLPT-tagged kanji and Kentei grade memberships.
- Source disagreements, ambiguous Kentei assignments, and unassigned records
  remain distinguishable rather than being silently reclassified.
- Every collection exposes its total, every page, and its final entry.
- Search covers full collections, not just the visible page, by written form,
  reading, and meaning, with kana and full-width normalization.
- Level navigation, paging, search/clear, empty results, entry opening, and
  return navigation remain usable with keyboard and on narrow screens.
- Entry detail sheets remain the canonical path; no new learner-state store.
- Browsing does not create cards, grades, mock scores, or scheduler updates.
- Existing explicit saving from an entry remains a deliberate learner action.
- New assets ship in served, service-worker, Pages, and standalone builds.
- Standalone reference browsing works with subresource network blocked.
- Desktop, 390px and 320px mobile, and existing dark-world visual checks.
- Error cases include missing runtime module and invalid/empty search input.

## Source boundaries

JLPT does not publish the vocabulary/kanji/grammar specification lists for the
current test; Bunki's level labels are corpus assignments, not an official
exhaustive syllabus ([official guidebook, Q7–Q8](https://www.jlpt.jp/e/reference/pdf/guidebook_s_e.pdf)).

Kanji Kentei describes cumulative scopes of approximately 3,000 characters for
準1級 and 6,000 for 1級; the committed grade table is a smaller set of available
records, not proof of full official coverage ([official grade overview](https://www.kanken.or.jp/kanken/grades/overview/)).

## Executed results

- **14/14 index tests passed:** independent source-union checks, every full
  Kentei source row, source conflicts, unknown bins, immutability, all pages,
  normalized search, and browser/CommonJS export parity.
- **Projection parity passed:** generated supplemental data matches an
  independent rebuild against the pinned raw KANJIDIC archive.
- **4/4 packaging tests passed:** script order, actual service-worker cache
  installation, Pages assets, standalone and fragment embedding.
- **49/49 Chromium reference checks passed:** all 27 collections' counts,
  first/final pages, exact final entries, intermediate page/jump controls,
  corpus-wide normalized search, empty-state recovery, sheet return
  focus/scroll, supplemental/glyphless read-only sheets, study-state equality,
  320/390/1280px layout, dark `yoru` world, separate room navigation, missing
  module/data recovery, and network-blocked standalone browsing.
- **25/25 existing mock checks passed**, covering 423 questions across 25
  papers and unchanged explicit-enrollment boundaries.
- **Existing journey regression: 10/11 stations passed.** Station 10 timed out
  at `[data-kdx-st="8"]` in the unrelated kanji stroke-filter interface. A
  separate untouched `124f08b3` worktree, independently rebuilt to standalone,
  reproduced the exact same selector timeout. The reference entry/back,
  grammar, and thesaurus navigation all completed before that failure.
  The stale journey failure is recorded, not counted as a pass or changed
  as part of this feature.

Screenshots and machine-readable browser results are under `screenshots/`.
Coverage and exact source counts are in `coverage.json`.

## Environment and limitations

Local execution used Node 20.20.1 and real Chromium through Playwright. The
repository's hosted workflows use Node 22; hosted CI status is separate from
these local receipts.

The preview deployment service rejected the existing, browser-tested
`index.html` as missing. No hosted preview was produced or claimed.

Physical iPhone Safari, VoiceOver, and native-device Japanese IME behavior
remain unverified. Tests demonstrate source-index coverage, not correctness
of every upstream classification or official examination completeness.
