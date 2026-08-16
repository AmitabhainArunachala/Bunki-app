# 回廊 KAIRO — SRS upgrade summary (2026-08-11)

One-page record of the review-engine work completed this day. The full
technical evidence — verbatim code, executed numbers — lives in
`docs/audits/SRS_AUDIT_2026-08-11.md` (Parts I–III). Live build: run #75,
commit `2b211f0`, deployed to the GitHub Pages URL.

## What the engine is

FSRS-6 via `ts-fsrs` v5.4.1 (vendored), pinned parameters: retention 0.90,
learning steps 1m/10m, relearning 10m, max interval 36,500 d. The app does
**zero interval arithmetic of its own** — every grade is one
`scheduler.repeat()` call; the pressed rating's precomputed card is stored
byte-for-byte. Cards are opaque `type:id` keys; the scheduler never sees
content.

## What the audit proved (Parts I–II)

- Core math correct through the real localStorage round-trip: new card
  1m/6m/10m/8d → graduation 2 d → 11 d → …; lapse collapses S (32.2 → 2.4)
  and raises D (4.7 → 8.3); post-lapse growth is slower — per-card
  difficulty working as designed.
- Long absence credited, not punished (90 d overdue, Good → 125 d).
- No ease-hell (Hard forever still grows: 8→19→36→57→81→107 d).
- Same-day presses cannot inflate stability (short-term branch clamps).
- Buttons map Again/Hard/Good/Easy → FSRS Rating 1/2/3/4; labels show the
  engine's true computed intervals.

## The five gaps — closed this day (Part III, executed proofs)

| Gap                                      | Fix                                                                                                                                                                                                                                                                       | Proof                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| No durable review log                    | Append-only `S.revlog`: one compact row per grade — ms timestamp, key, rating, state/elapsed/retrievability before, S/D before & after, resulting interval & due. Undo appends a revocation, never erases. Exported with 書き出す; quarantine-protected. Optimizer-ready. | 5 rows written in a live session; identical 5 after reload; Again row's due = press + 60,000 ms exactly          |
| Learning steps frozen out of the session | Cards inside 1m/10m steps re-queue into the **current** session; nearest-ripening card comes forward; a ≤ 90 s beat is held with a quiet zen countdown (「いま見る」 skips); longer gaps pull early (learn-ahead). Dojo drills regardless, safely.                        | Again card re-presented and graded **67 s after the press, same session**; 10-min steps pulled early, no parking |
| Per-session new-card cap                 | True daily cap: 20/day, counted at a card's **first grade**, honoured across all sessions, unwound by undo.                                                                                                                                                               | 25 fresh + 20 introduced → 予定なし (disabled); nnew=15 → exactly 5 offered                                      |
| Fuzz disabled                            | On by default at the corridor layer (`S.stats.fuzzOff` opts out). Deterministic: seed = `${timeMs}_${reps}_${d*s}`, all recorded in the revlog, so replay reproduces every interval.                                                                                      | Six batch-captured cards: 39 d ×6 unfuzzed → 35/39/40/42/43/38 d fuzzed; identical inputs → identical outputs    |
| One card type per item                   | Key grammar documented content-blind: `kanji:海:on`, `word:安堵:prod`, `sent:<id>#<n>` slot in with zero engine changes — each its own card, state, and log rows.                                                                                                         | Design documented at `srsKey`; engine path proven key-agnostic                                                   |

Also this day, from the operator's phone verdict: the **zen review room**
(nothing on the glass but the card, hairline progress, … for undo·rest·entry)
and **calendar-honest schedule labels** (due-in-3-hours is 今日, not 明日).

## Updated verdict

The core loop — capture → schedule → review → log — is trustworthy for real
long-term study **now**, with these open ends, in order:

1. **Log storage medium**: revlog lives in localStorage (~4–5 MB/year at
   heavy use). Export regularly (the tray nudges) until it moves to
   IndexedDB — format unchanged, only the shelf.
2. **The optimizer run** (personalized weights, retention-as-setting) — the
   log now feeds it; the fitting itself is unbuilt.
3. **Japanese card families** (on/kun, production, sentence mining) — the
   architecture is ready; the shapes are an operator design round.
4. Cosmetic: engine-side `scheduled_days` 36,501 at the cap; undo is
   session-scoped (revocation rows are permanent).

## Where everything lives

- Engine: `prototypes/corridor/vendor/ts-fsrs.mjs` + `data/fsrs-pin.json`
- App scheduling & log: `prototypes/corridor/corridor.js`
  (`srsCardOf` / `srsStore` / `srsLogReview` / `srsDueItems` / `renderReview`)
- Full audit: `docs/audits/SRS_AUDIT_2026-08-11.md`
- Trunk-unification record: `docs/briefs/HARVEST_LEDGER_2026-08-11.md`
