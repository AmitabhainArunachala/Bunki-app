# Orchestration log (Conductor-owned; orchestration spec §5)

## Wave state
| Wave | Status | Notes |
|---|---|---|
| W0 (WP-00) | CLOSED + MERGED | PR #4 merged by operator (main bbaf0b3) |
| W1 (WP-01) | CLOSED — V1 PASS | PR #5 open (draft) |
| W2 (WP-02 ∥ WP-04) | CLOSED — V2 PASS (round 2), V3 PASS (round 1) | wp02 @ 5a9051e, wp04 @ fdcfddd; integrated: 328 tests green; evidence VERIFY_WP02.md / VERIFY_WP04.md |
| W3 (WP-03 ∥ WP-06 ∥ WP-05) | OPENING | B4 persistence/export, B5 contracts+FSRS (sole domain writer), B6 UI; V4/V2/V5 shadows |
| W4+ | pending | |

## Surface locks — W3
| Surface | Owner |
|---|---|
| packages/persistence/, packages/export/ | B4 (WP-03) |
| packages/domain/ | B5 (WP-06) — sole domain writer |
| apps/app/ | B6 (WP-05) |
| packages/seed/ | LOCKED (read-only consumer access) |
| docs/build-evidence/ | CON |

## Coordination-request dispositions (from W2)
1. Contract→thread link (WP06_CONTRACT_THREAD_LINK_OPEN_QUESTION): RESOLVED by CON — WP-06 builds a target→thread projection from EncounterCaptured events; NO ADR-002 schema change. If projection proves impossible, escalate before inventing an event.
2. DataExported extra-field note: WP-03 owns export semantics; any new field = explicit ADR-002 amendment path, never silent.
3. eslint Node-globals glob (packages/*/scripts) + ambient-globals rule migration: stays in WP-10 sweep batch.
4. @types/node@26.1.1 (MIT, type-only) added by WP-02/WP-04 beyond WP-00 register: recorded; re-verify at WP-10 license pass.

## OPERATOR ACTION REQUESTED (blocks licensed seed content only, not the build)
Egress proxy denies (403 CONNECT, org policy): www.edrdg.org, ftp.edrdg.org, tatoeba.org, downloads.tatoeba.org, creativecommons.org.
Consequence: seed ships with REAL KanjiVG stroke data (fetched + verbatim CC BY-SA 3.0 attribution) but lexical entries are project-authored (labeled unreviewed, UI disclosure string exported) and sentences are original compositions — no EDRDG/Tatoeba content could be licensed-verified without fabricating attribution.
Smallest action: allow those domains in the environment's network policy, then re-run the WP-04 source pass (touches only the provenance registry + per-field source ids).

## Carried P2 batch
W1 items 1-11 (unchanged) + W2: capsule field-count wording (WP-02), package-lock touch notes (accepted), SEED sources deferral D-1/D-2/D-3 (operator gate above).

## Merge queue
PR #5 (WP-01) open; wp02 + wp04 PRs opening now. Integration branch carries all, tests green.
