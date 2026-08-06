# Drift v10 Red-Team Findings Ledger — 2026-08-06

Full-spectrum adversarial audit of `prototypes/drift/drift-artifact.html` per the
charter in `docs/prompts/DRIFT_V10_RED_TEAM_CHARTER_2026-08-05.md` (PR #22).

- **Baseline commit:** `93f3b02` (Port Drift v10 from dharma_swarm)
- **Method:** real Chromium via `prototypes/drift/tools/red-team-harness.mjs` (CDP
  `Input.dispatchTouchEvent`; mouse events not accepted as evidence). Mobile
  viewport 390×844 @ DPR 2, `hasTouch`.
- **Provenance:** the original Codex run completed discovery on L1/L2/L3, lost L4
  to a false-positive OpenAI cyber-policy filter, never ran L5–L8, and hit its
  usage limit before applying any fix. This ledger is the Claude continuation:
  L4–L8 re-run, all eight lanes consolidated, the safe cluster fixed and
  runtime-verified, the rest documented for operator judgment.

> **Evidence location caveat:** per-lane probe scripts, JSON results, and
> screenshots were written to `/private/tmp/bunki-l*-*` and `/tmp/bunki-l*-*` on
> the audit machine (they are large binaries / transient and are **not** checked
> into git). The paths are recorded below so the machine operator can retrieve
> them; a future agent on a fresh machine must re-run the probes to regenerate
> them. Fix-verification results: `/private/tmp/bunki-verify-fixes.json`,
> script `/private/tmp/bunki-verify-fixes.mjs`.

---

## FIXED and runtime-verified this round

All 14 verification probes pass (`bunki-verify-fixes.json`). Line numbers are
against the **patched** file.

| ID         | Sev          | Finding                                                                                                                                                                                                                                                                                    | Fix                                                                                                                                                                            | Verify                                                                                                                          |
| ---------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| F-DUP      | P0           | Repeated kanji spawned duplicate orbit nodes (`日曜日`→`[日,曜,日]`), violating invariant 2. 12 corpus rows affected.                                                                                                                                                                      | Dedup with `[...new Set(n.w)]` at the dive spawn (was `[...n.w]`) and in the word-card.                                                                                        | `dedup_日曜日` → `[日,曜]`                                                                                                      |
| F-BRICK    | P0           | A wrong-schema `bunki-drift-v1` payload (truthy `known`, missing/`null` `unknown`) passed the load guard and was adopted wholesale; first world build dereferenced `store.unknown[...]` → uncaught TypeError, 0 words, blank canvas, **permanent** across reloads. Invariant 8.            | Load guard now validates each field's shape (`isMap`) and coerces `lk`/`lu` via `Number()`, building a clean store instead of adopting the raw object.                         | `brick_known_only`, `brick_unknown_null`, `typecorrupt_known_string`, `typecorrupt_known_array` all load 64 words, 0 pageerrors |
| F-XSS-TRAY | HIGH         | Persisted `lu`/`lk` counters flowed unescaped into `tray.innerHTML` and **executed** injected `<img onerror>` (only injection reachable without a source edit — stored-XSS foothold on any shared origin).                                                                                 | Counters coerced to `Number` at hydration; a string payload becomes `0` and never reaches the sink.                                                                            | `l7_09_tray_xss` → xss 0, gathered/settled 0                                                                                    |
| F-ESC      | MED (latent) | 7 `innerHTML` sinks concatenated raw data (spawnWord reading/word/gloss; spawnGlyph gloss; spawnPart def; openCard word/part/kanji branches; a `data-ch="…"` attribute breakout). Inert today (data is the file's own), live the moment glosses/notes come from a server or imported deck. | Added `esc()` (escapes `&<>"'`) applied to every interpolated **data** value; static markup untouched, so intended `<i>`/`<div>` structure and Japanese text render unchanged. | `esc_helper`, `latent_gloss_injection` (payload renders as `&lt;img…`, no element, no script)                                   |
| F-UNDEF    | P1           | Word cards printed literal `undefined` for any kanji outside the 59-entry `K[c]` map (6,488/6,687 rows).                                                                                                                                                                                   | Card uses `glossOf(c)` (has `K→RAD→KINFO→"component"→""` fallbacks) instead of `K[c]`.                                                                                         | `gloss_no_undefined`, `card_word_branch` (no `undefined`)                                                                       |
| F-GRADE    | P1           | Grading a word "unknown" never cleared a prior "known" entry → a word simultaneously `fragile` and well-known, with a presence value matching no real judgment.                                                                                                                            | The unknown branch of `grade()` now `delete store.known[key]`.                                                                                                                 | `asymmetric_grade` → knownAfter undefined                                                                                       |

Post-fix smoke: 64 words render, unfold/dive works, 0 page errors. Patched
artifact SHA-256 recorded in the PR.

---

## DEFERRED — real findings, not fixed here (need a data pipeline or operator judgment)

Not fixed because a blind hand-edit would either introduce new errors
(authoritative data), risk unverified regressions (gesture/physics), or override
an intentional design choice (aesthetics). Each carries enough to resume.

### Kanji / dictionary data truth (L2, L3)

- **P0 wrong learner readings** shown to learners: 旺 `かがや.き`, 頑 `かたく`, 頒 `わか.つ`. A wrong reading in a teaching app is a compounding harm.
- **P0 radical-family mislabel:** current component families are labeled as Kangxi radical families; 5,681/7,599 rows (74.76%) have a different authoritative classical radical. L2's recommended fix: keep `RADK` as `COMPONENT_FAMILY` ("contains this component"), add a separate authoritative `RADICAL_OF`/`RADICAL_FAMILY` derived from Kangxi.
- **P0 nav dead-ends:** 149 CJK chars / 188 words lack both KINFO and KRAD, so word→kanji→radical navigation cannot complete (invariant 7). `undefined` display is now fixed, but the missing **data** remains — the chain still dead-ends until authoritative coverage is ingested. 22 of 66 final L6 lock pins also lack both.
- **P1** wrong stroke counts (稽 16→15, 衷 10→9); six omitted kun readings; unpinned generators can't reproduce committed schemas.
- **P1** gloss corruption: every gloss capped at 32 chars (482 at the cap, 154 with unbalanced parens); needs regeneration from upstream without the cap.
- **P1** JLPT levels can't be authoritatively verified (no official post-2010 list); the honest typed claim is `editorial_level_from(upstream)`, not `official_JLPT_level`. Declared upstream (`open-anki-jlpt-decks`) has drifted (8,131 rows now vs 6,687 embedded).
- Evidence: `/private/tmp/bunki_l2_audit.py`, `/private/tmp/bunki-l2-*.png`, `/private/tmp/bunki-l3-audit.json`, `/private/tmp/bunki_l3_audit.py`, `/private/tmp/bunki_l3_runtime_probe.mjs`.

### Gestures (L1)

- **P0** pinch/zoom steals navigation authority inside dives (violates invariant 1: zoom must be pure travel). 889 measured CDP sequences.
- **P1** `pointercancel` leaves gesture state dangling in 166/166 cancel cases.
- Evidence: `/tmp/bunki-l1-cdp-audit.mjs`, `/tmp/bunki-l1-cdp-results.json`, `/tmp/bunki-l1-pinch-steals-altitude.png`. Deferred to avoid shipping unverified gesture-state changes.

### Lock physics (L6)

- **P0** viewport containment fails at zoom 2.6 for 60/60 locked words (members up to ~280px offscreen; 30/60 also leak at z=1.0). Root cause: spring rest-length uses `inv=1/cam.z` fixed at lock time (`:966,978,1000-1003`), while the containment force scales with live zoom (`0.03*inv`, `:1037-1040`) against constant spring stiffness 0.035 (`:1025`) — at high zoom the springs beat the boundary correction.
- **P2** kana-only words silently cannot lock (`:951` bails when no kanji) — vacuous today (0 kana-only entries in the 6,693-word corpus) but breaks the "≥12 members for EVERY word" invariant the day any kana word enters.
- **P2** release tap within 40px of an edge-pinned member is captured as a member tap, not a release (compounded by F1 crowding edges at high zoom).
- Otherwise sound: no duplicates, no self-orbit, member floors and SEM-tier ordering hold; all 27 SEM pilot words + ghost collocations render; chains 10-deep verified. Evidence: `/private/tmp/bunki-l6-results.json`, `/private/tmp/bunki-l6-shots/`.

### UX (L8) — operator design calls

- **P0** field-word text below WCAG in all 5 themes (min 1.16–1.33 vs 4.5:1). Collides directly with the intentional depth-by-fade aesthetic — this is a "pretty AND functional" operator decision, not a mechanical fix.
- **P0** hit targets far below 40px (words down to 11×13px; slider handle 12×12px).
- **P0** zero gesture discoverability — the only hint (「ことばに触れて」) fades at ~7s and never returns; swipe-grade, long-press-lock, pinch, and the level slider are unannounced.
- **P1** 自 (adaptive) mode is a silent no-op — selecting it changes nothing visible and shows only a Japanese-only hint (in an app for Japanese learners).
- **P1** chrome text (hint/tray/slider labels) also fails contrast in every theme.
- Evidence: `/private/tmp/bunki-l8-results.json`, `/private/tmp/bunki-l8-evidence/`.

### State + performance (L4, L5)

- **P2** quota-full: grades silently lost with no user warning (fail-soft, no crash — `saveStore` swallows QuotaExceeded). UX decision: warn the user.
- **INFO** (L5) FPS is a hard PASS on real GPU and pure SwiftShader (flat ~120fps); no leak (full 10-min soak, balanced node census, sawtooth heap), no rAF spiral after blur/focus. The only regression is sub-23fps under an extreme 6× CPU throttle, where **min-zoom** (whole vault drawn) is the expensive case, not max-zoom. Re-characterize the documented "SwiftShader floor" as CPU-bound. Evidence: `/private/tmp/bunki-l5-*`.

---

## Charter steps not completed

- **Republish to the same claude.ai artifact URL** — that URL belongs to the
  original Claude Code session that minted it; it cannot be republished from this
  environment. Left to the operator or the originating session.
- **Skeptic convergence "until two clean rounds"** was run against the _fixed_
  cluster (each fix re-tested with the exact attack payload that caught it). The
  _deferred_ findings were not driven to a fix, so their convergence loop is open
  by design, not by omission.
