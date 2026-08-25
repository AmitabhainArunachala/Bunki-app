# 掌 TENOHIRA — RUN_STATE

**Campaign:** `docs/prompts/KAIRO_TENOHIRA_CAMPAIGN_2026-08-19.md`
**Base:** `main` @ `ae1d901` (RENKAN #74 + KAIRO-next #76 merged 2026-08-19)

## Position

| PR  | State       | Branch / evidence                                                       |
| --- | ----------- | ----------------------------------------------------------------------- |
| 一  | **MERGED**  | content via #80 (2026-08-21), receipt via #78 (operator, 2026-08-25)    |
| 二  | queued      | —                                                                       |
| 三  | next        | first rubric pass shipped in 一; the living loop remains                |
| 四  | queued      | —                                                                       |
| 五  | queued      | voice research done (operator artifact, 2026-08-19); shootout unrun     |
| 六  | queued      | awaits mockup approval round                                            |

## Next command

When PR 一 merges: branch fresh from `main`, build PR 二 (§2 of the spec) —
essentials-first word sheet + the lesson lane as the father's front door.
Convicting probes for the fold behavior go into `verify-corridor.mjs`.

## Notes for the resuming session

- Decision 8 (per-learner English default) needed **no code**: `S.lang` lives
  in the per-device store and fresh devices default to `bi`. Recorded here so
  nobody "implements" it again.
- The corridor suite counts **216** after the kanjidex probe;
  `kairo-next/RUN_STATE.md`'s "215/215" predates that commit (addendum there).
- The ひとこと friction-note door (PR 一) writes `[ts, 'note', 'op', text]`
  obslog rows through the guarded store boundary; notes ride the export.
  Weekly triage of those notes is §3 of the spec.
- The E3 double-dry instrument (T5/OD-19) remains unbuilt — it is a standing
  debt, not forgotten.

## Resequencing (operator escalation, 2026-08-19)

The operator asked repeatedly for the voice and for better articles; the
順路 had them at 五 and 三. Their word outranks the sequence: **聞く (the
interim reader voice) shipped immediately** on PR 一's branch — the device's
best Japanese voice, marked 仮の声・検収前 on its face, article read-along
only (word-level audio stays absent until PR 五's judged voice) — and **the
feed (PR 三) is the very next work**, before the word page. PR 二 slides to
third. The judged-voice shootout (PR 五) is unchanged and still the law for
anything that teaches pitch.

## PR 三 (the feed) — first rubric pass, 2026-08-19

`docs/content/feed-approval-rubric.md` (rubric-v1) is live, delegated per
Decision 4: 7 mints approved (sports/culture/civic within the cap), 5
rejected (the Nantan child-death case ×3 by rule T1; two court verdicts by
T2), 1 defect cull applied, 30 authored originals approved out of 検収前.
Left for the operator: wikinews:1483 (OD-16), the 10 rights rows (OD-24),
and wikinews:45227 — whose approval the feed gate CONVICTED (its
final-revision caveat is verification, not taste; the rubric yielded and
its text now says so). The census check follows the queue with a pairing
assertion. verify-feed 31/31; the queue file is the per-row audit trail.

## Review-debt interstitial (2026-08-25, after 一 merged)

PR 一's outside review (Codex, on #78) found real defects that rode into
`main` via #80; they are paid as one small PR before 三 resumes:

- `sw.js`: fetch-handler `cache.put` now held open by `event.waitUntil`;
  activate deletes only `kairo-` caches (CacheStorage is origin-wide on a
  shared Pages origin); the three boot-critical data files
  (`manifest.json`, `fsrs-pin.json`, `articles/index.json`) precache at
  install so offline FIRST boot works — not just offline revisit.
- `openPassage` stops a running 聞く when the passage actually changes:
  the glossary cross-ref door and the word sheet's この記事を読む door
  switch passages without leaving the reader view, so the view-change
  guard alone let article A keep speaking over article B.
- `verify-native-readings`: the `reviewRows.length > 0` floor convicted a
  legitimately finished review queue; the marking law is vacuous when
  nothing is pending, and lift legitimacy already belongs to the pairing
  check. Floor removed — a truthfulness repair, not a weakening.
- The residual-storage ledger's line-pins were recomputed (the tray-door
  pin had already drifted 105 lines on `main` — the 書の間 lane grew
  corridor.js above it without a recompute; latent gate red, repaired
  here).

Codex's two voice findings were re-examined and are **already answered on
`main`** (the boot voiceschanged warm-up + repaint), except the passage
switch above, which was real.

## 書の間 escalations (operator, 2026-08-24)

Four real-phone escalations landed and closed the same day, all on `main`:

1. **Issue #79** (circular crop, legacy flash) — root-caused in #82: the
   radial mask deleted, the classic write gated behind the renderer
   decision, KanjiVG made the canonical glyph authority.
2. **「もう、美しくない！」** — the fail-closed KanjiVG ruling took the
   gallery brush from every kanji, and the operator's wife named the loss.
   The **equivalence manifest** answers both laws at once
   (`tools/build-animcjk-equivalence.mjs` →
   `data/share_alike/animcjk/equivalence.json`): 1,947 of 2,134 characters
   proven stroke-by-stroke equivalent to canonical KanjiVG regain AnimCJK's
   true brush; 187 (経's 經 body among them, convicted by geometry at equal
   stroke count; 衷 by count) keep the canonical hand. The metric itself
   convicts 経 — no hand-curated exception list.
3. **没入** — "the whole screen, not a square." First attempt shrank the
   glyph inside the lattice and the hand went soft (fewer cells per
   stroke); convicted by eye and reverted. The shipped design keeps the
   glyph at FULL lattice on the strip-sized sheet and paints
   `.ink-ground` — a strokeless still from the same engine, sized so the
   sheet's texture is its exact centre crop — to every edge of the screen.
   One paper, no card, no mask, no resolution loss. A faint tonal shift
   where the live (WebGPU) sheet meets the 2D-painted ground remains —
   reads as light on the writing area; named here as open polish, not
   hidden.
4. `verify-writing-room` grew to **51 checks**: manifest law (経→kanjivg,
   永→animcjk, 衷→nine), immersion coverage, glyph-whole-at-full-lattice,
   and the reduced-motion pending-gate conviction from #82's review.
