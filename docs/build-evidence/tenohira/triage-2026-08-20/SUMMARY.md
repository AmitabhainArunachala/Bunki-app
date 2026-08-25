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

## Round two, same day — "SRS is STILL sloppy. Take a look at it."

Walked the whole SRS surface at 390×844 and judged it harshly. The card
room was fixed in round one; the SURFACE AROUND it was the remaining
slop, and the operator was right:

- **The lists page led with admin furniture.** The new-list maker stood
  ABOVE the learner's own words; export/import and the note door crowded
  the same column. Order now: title → 復習する door → forecast → the
  words themselves → maker → a hairlined utility foot.
- **Chip noise.** Every row wore a `[word]` chip on a page that is
  almost all words — the kind now speaks only when it differs from the
  default. A full column of red "due now" wore urgency as decoration —
  red now marks only what is due at this moment; the rest of the
  schedule speaks in ink.
- **"just these — 4" looked like a label.** It is the filtered-deck
  door; it now reads as a button.
- **The session close was a scrap pile.** Grey chips became the
  session's own seals with counts (再難良易, the same hanko the thumb
  pressed); leeches sit behind hairlines; リストへ and ひとつ戻す stand
  in one doors row.

## The voice, continued (operator: "the absolute worst voice possible")

What round one shipped made the DEVICE voice speak — the compact default
is genuinely poor. This round adds the voice picker (声 select beside
聞く when the device holds more than one Japanese voice; the choice is a
device preference in its own key, `kairo-voice-pref-v1`, never the
learner store) and prefers enhanced/premium/拡張 voices. The real fix
remains PR 五 / OD-6: every top-tier candidate (Chirp 3 HD, Azure,
ElevenLabs) needs the operator's key — no key exists in this
environment, and the free neural tier (VOICEVOX) could not be fetched
this session (repo attach requires an approval that was not available).
Typed to the operator, again, with the cost table already in
`renkan/proposals/TTS_VOICES_PROPOSAL.md`.

## Round three, same day — the operator's own screenshot

The operator sent the dojo mid-block from their real phone: "It's still
terrible — are you looking at the screenshots?" Looking closely at THEIR
frame found three defects the staged shots had missed (rounds one and two
never staged a RUNNING focus block):

- **終わる crushed into a vertical strand.** The focus HUD is a fixed
  shrink-wrapped pill; zen stripped its chrome but kept the shrink-wrap,
  and the end button collapsed to 48px — its label wrapped character by
  character beside the clock. Measured and reproduced at 430×932. The
  zen HUD is now one full-width quiet top line: clock centred, 終わる
  whole (white-space: nowrap, also applied to the base pill) in the
  right corner — the same corner as plain review's ×.
- **A line began with 、.** In renderSentenceTokens, content words are
  atomic inline-flex buttons and punctuation rides as bare text; WebKit
  breaks between the atom and the text run, so a clinging mark could
  open a line — 禁則処理 violated on the operator's cloze card. A token
  that is nothing but clinging punctuation is now glued to the box it
  follows in one no-break span (`.kinsoku-glue`); ordinary text keeps
  native flow. Covers 用例, the 文 page, and both review faces; the
  reader body has its own token path and should be audited for the same
  break (named, not done here).
- **A sea of empty paper.** The sheet's min-height (50vh) left one word
  floating in a huge card on a tall phone; it now hugs its content
  (min(36vh, 340px)) and still centres on the stage.

Round-three runs: corridor 223/223 · a11y 46/46 · storage-integrity
green (ledger repinned for the line shifts) · standalone regenerated.
Honest note: the first corridor run of this round threw once in the
R3-D import-door probe (`waitForSelector('#import-file')`) before that
station's checks ran; the immediate rerun passed 223/223 with no code
change. One rerun, recorded, not hidden.

## Evidence (rounds one and two, sequential runs)

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
