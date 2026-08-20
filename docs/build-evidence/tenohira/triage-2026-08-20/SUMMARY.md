# 掌 TENOHIRA · operator triage round — 2026-08-20

The operator's real-phone morning report, verbatim in intent: _still no
voice reading at all; the SRS page and experience is sloppy; the search
button needs to open a search-only screen that is its own separate page._
Clarified live: search = its own full-screen page; SRS = looks/layout,
flow/too many taps, grading buttons, "use your highest intuition."

Base: `claude/bunki-kairo-pr76-review-qa1qnh` @ `0bf8b44` (PR #78 head).
Branch: `claude/app-updates-review-gd0929`.

## 1 · 聞く was silent on every real phone — a gate, not a voice

`bestJaVoice()` read `speechSynthesis.getVoices()` synchronously and
treated the empty list phones return before their asynchronous voice
delivery as "no Japanese voice on this device," then returned without
speaking — on every first tap, forever. The lab never saw it because the
probe accepts the honest no-voice note, which is exactly what the phone
was left holding.

Fix: the door speaks. `u.lang='ja-JP'` lets the platform choose its own
voice even before the list lands; the list is warmed at boot
(`voiceschanged`); the best voice is re-resolved per sentence so a
late-arriving list upgrades mid-read; a genuine synthesis failure (not a
cancel) surfaces through the note. No gate on `getVoices().length`.

## 2 · the zen room was a moving target — and the sheet a pillar

Two real defects behind "sloppy":

- **The sheet collapsed to content width.** `main`'s inline-auto margins
  make it shrink-to-fit between flex parents, so `width: 100%` on the
  sheet chased a 200px parent — one word on the front face = one narrow
  pillar. `body.zen main` now claims `width: 100%`.
- **The buttons moved between faces.** The declarations floated
  mid-screen; the grade seals lived at the bottom. The room is now a
  fixed stage: sheet centred by block-auto margins, ONE action zone
  riding the bottom edge — まだ/思い出した first, the seals in the same
  place after. `body.zen .declare-row` mirrors the pinned
  `body.zen .grade-row` posture without touching that byte-pinned rule.
- Grade seals sit in four equal bounded cells (label + honest interval
  aligned); examples read left-aligned behind a hairline; the progress
  hairline and the two corner doors are slightly more present.

## 3 · 検索の間 — search is a room, not a strip

The bar's 71px field and its drop-over-the-galaxy results are gone. The
bar holds a field-shaped door (glass alone on tight bars — a truncated
検.. would be the old sin again); the door opens a full page: one big
box, roomy rows, glosses allowed to finish, the same entry sheets. The
session (S.navQ) survives a result round-trip; Back out of the room ends
it and returns to the view the door was opened from. The dead navReturn
machinery was retired with the bar field. The R3-B probe now walks the
room (two checks added, 221 → 223).

## Ledger

The five retained direct-save callers shifted lines with these edits;
`residual-storage-callers.json` repins them — same five surfaces, same
dispositions, same two export/import bypasses.

## Evidence (this head, sequential runs)

- corridor **223/223** · a11y **46/46** · storage-integrity **green** ·
  drift fast **52/52 · 0 violations** — all on the final bytes (see the
  regenerated reports committed beside this note).
- **verify-journey station 10** (levels · grammar · thesaurus · 字引)
  fails with a click timeout **identically on the unmodified PR #78
  head** — pre-existing, reproduced before and after these changes, not
  addressed here. Stations 1–9 and 11 pass. Named for the next session.
- Standalone regenerated from these exact sources.
- Real-phone verification of the voice remains the operator's (OD-7):
  web-verified only. The iPhone silent switch also mutes speechSynthesis
  — worth one check before calling the voice dead again.
