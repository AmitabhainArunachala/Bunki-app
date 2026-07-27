# Orchestration log (Conductor-owned; orchestration spec §5)

## Wave state
| Wave | Status | Notes |
|---|---|---|
| W0 (WP-00) | CLOSED | this commit |
| W1 (WP-01) | OPENING | B1 + V1 dispatched |
| W2+ | pending | opens on W1 exit |

## Roster (full-20 configuration)
CON = session agent (Fable 5; recorded deviation). B1..B8, V1..V6, T1..T4, INT = Opus 5 instances, dispatched per wave.

## Surface locks — W1
| Surface | Owner |
|---|---|
| root config (package.json, tsconfig.base.json), .github/, docs/adr/, package skeletons | B1 (WP-01) |
| docs/build-evidence/ | CON |
| everything else | LOCKED (no writer) |

## Coordination requests
(none)

## Merge queue
- WP-00 PR (this branch) → main, draft, human merge
