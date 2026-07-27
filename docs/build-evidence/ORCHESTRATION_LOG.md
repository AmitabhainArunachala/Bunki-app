# Orchestration log (Conductor-owned; orchestration spec §5)

## Wave state
| Wave | Status | Notes |
|---|---|---|
| W0-W2 | CLOSED + MERGED | PRs #4/#5/#6/#7 merged; main e02b8b2 |
| W3 (WP-03 ∥ WP-06 ∥ WP-05) | CLOSED — V4 PASS r1, V2 PASS r1, V5 PASS r2 | wp03 @ 388996b, wp06 @ 209d113, wp05 @ 55a2fdd; integrated: 792 tests green, verify:export REAL and green; evidence VERIFY_WP03/05/06.md |
| W4 (WP-07 ∥ WP-08 ∥ WP-09) | OPENING | B7 AI adapter, B8 session/canvas (sole domain writer: src/session/), B6 inspector screens; V6/V5 shadows |
| W5+ | pending | |

## Surface locks — W4
| Surface | Owner |
|---|---|
| packages/ai/ + apps/app candidate-UI slice (src/screens/candidate*) | B7 (WP-07) |
| packages/domain/src/session/ + apps/app session/canvas screens (src/screens/session*, src/screens/canvas*) | B8 (WP-08) |
| apps/app inspector/evidence screens (src/screens/inspector*, src/screens/evidence*) + packages/export UI hooks | B6 (WP-09) |
| shared apps/app files (app/_layout etc.) | B6 owns; B7/B8 file coordination requests |
| docs/build-evidence/ | CON |
| everything else | LOCKED |

## W3 notable events
- WP-03's own tests caught purged bytes surviving in the batch-idempotency table and SQLite WAL/free pages — fixed (digest storage; secure_delete + wal_checkpoint + VACUUM).
- WP-05 round-1 P1s: ruby pieces exposed to screen readers (double reading); a false UI claim about the event log for post-Keep uncertainty marks. Both repaired; V5 round 2 PASS.
- CON process defect (recorded honestly): the wp05 capsule merge-resolution script failed and a commit with conflict markers reached the integration branch (906c876..eed3068); repaired at 6654603. Root cause: unverified chained shell commands; mitigation: marker-grep now precedes every capsule commit.

## Carried P2 batch (WP-10 sweep unless noted)
W1 items 1-11; W2 items; W3 additions: hand-rolled SHA-256 lone-surrogate divergence note (persistence), README wording, @bunki/persistence↔@bunki/export circular devDependency, GateDecision.forcedByReveal doc wording, retrieval-contract comment wording, seams-scan narrowing note, screenshots index metadata mismatches, "nelson" token on kanji page (REQ-UI-03 index-name leak — B6 fixes in W4 while owning those screens), stale comment references, V5-round-1 report filing gap (now filed).

## Operator gates open
- Egress allowlist for EDRDG/Tatoeba (seed upgrade)
- WP-11 native device checkpoint (W6)
- Codex 5.6 verification pass (W7)
- Operator trial (W8)
