# Bunki Whole-Product Admission Receipt

**Observed:** 2026-07-29  
**Repository:** `AmitabhainArunachala/Bunki-app`  
**Mode:** Read-only live audit  
**Purpose:** Establish the exact starting truth for the whole-product controller  
**Closure status:** Admission only; Wave 0 is not closed

## Plain conclusion

`main` is the only canonical authority.

No existing feature branch is a complete, verified whole-product superset.
`agent/bunki-e-weave` is the best observed aggregation candidate, but it remains
unmerged input until its unique commits, inherited defects, data rights, tests,
and sibling branches are reconciled.

Do not start new product work by choosing the newest or largest branch.

## Repository and latest merge

- Canonical base:
  `main@cbb7f29eee1c056ba0898f6172eaeb67ae34dc37`
- Latest merge: PR #13, **Phase-0 closed loop: complete integrated build
  (W2–W5 + closeout + export completeness)**
- Merge time: 2026-07-28 03:21:50Z
- PR #13 head:
  `d24f17e72ca66ab93e0389e283771cfcef68214b`
- PR #13 workflow run: `30324802614`
- Recorded PR checks:
  - lint / format / typecheck / test — success;
  - web build proof / E2E / accessibility / adversarial matrix — success.
- PR #12 was closed unmerged as a subset/superseded branch.
- Open pull requests at audit time: 0
- Open issues at audit time: 0

Workflow run `30324802614` establishes only that the listed jobs succeeded on
PR head `d24f17e72ca66ab93e0389e283771cfcef68214b`. It does not establish formal
Phase-0 closure, a done-ladder rung, or the absence of known and expected-fail
defects. It also does not establish the new whole-product lock, native iPhone
proof, a production dictionary, or live AI.

## Unresolved post-merge review

PR #13 has two unresolved, non-outdated review threads that arrived after the
merge:

1. `apps/app/src/state/durable-store.ts` can keep reporting that the last save
   was rejected even after a later durable write succeeds.
2. `apps/app/e2e/support/export-server.ts` lacks a directory-containment guard
   and can resolve a traversal path outside the intended static export root.

These files and findings remain present in the large post-main lines and must be
reproduced and repaired before a clean foundation claim.

## Known open defects and missing proof

Reproduce or disprove each on the exact implementation base:

- `ADV-T1-01` P1: backward wall-clock movement across UTC midnight can produce
  an unclassified FSRS validation failure after an acknowledged review.
- `T4-1b`: the pre-hydration static HTML title is empty.
- `T3-3`: leaving an AI request can still attach a fallback candidate.
- replay on the lived-in line may become quadratic at a long history.
- tombstoned-thread projection behavior requires re-verification.
- dictionary parsing previously dropped attributed glosses.
- dictionary disclosure/license version previously differed from the actual
  EDRDG source terms.
- demo learner history can be visually mistaken for real history.

Still missing:

- completed independent Codex whole-product verification;
- completed Fable experience/closure receipt;
- physical native-iPhone evidence;
- live AI proof;
- production-complete dictionary/kanji and grammar coverage;
- Anki warm-start;
- rights-approved source/transcript ingestion;
- voice conversation;
- the operator’s deep-engagement week.

The current dictionary branch reported roughly 3,000 entries against a
218,173-entry upstream scale. Treat it as importer progress, not a complete
dictionary.

## Observed branch heads

| Branch | Observed head | Ahead of main | Admission disposition |
|---|---|---:|---|
| `agent/bunki-real-dictionary` | `0b3400a10ee1bc851bba6a1fccd4ff8478f042eb` | 19 | Candidate input; parser/license fixes require proof |
| `agent/bunki-real-dictionary-v3` | `c225ea7e82bf77818502ec76dcf1f8758f4c06ff` | 13 | Historical verifier evidence, not a code base |
| `agent/bunki-e-integration` | `5826ddededd8e6141bb5fad795d6b87c8d591f08` | 103 | Candidate input; one unique ops/evidence patch line |
| `agent/bunki-e-weave` | `f8e5f16b8cab32d36c42b8bea7fc37a1e9506bb1` | 109 | Best aggregation candidate; not canonical |
| `agent/bunki-pillars-dict-srs` | `cdeea5a5002d1dc19c1da78852647f1ba7386cb0` | 114 | Five-commit child of e-weave; reconcile |
| `agent/bunki-lived-in` | `fe516da4e647e6b3acd7863814909efa396e1799` | 115 | Six-commit child of e-weave; reconcile and remeasure |
| `agent/bunki-campaign-e` | `91b64026398a3ecfa9740144f29ba12165f42ae6` | 2 | Design/spec input already represented in e-weave |
| `agent/bunki-codex-handoff` | `58e271a241cf1cf28bcb6daf840e40dfa2aca503` | 1 | Preserve its unique `CODEX_HANDOFF_PROMPT.md`; the verification packet is already identical in e-weave |

Ahead counts are orientation only. Recompute if a branch head moves.

## Observed topology

The proved relationships are:

- `real-dictionary@0b3400a` is an ancestor of `e-weave@f8e5f16`.
- `campaign-e@91b6402` is an ancestor of `e-weave@f8e5f16`.
- `e-integration` and `e-weave` diverged after
  `e1abe14bd10d40b619c410b49b49a78f4b119a39`.
- `pillars-dict-srs` is a five-commit child of `e-weave`.
- `lived-in` is a six-commit child of `e-weave`.
- `real-dictionary-v3` diverged from `real-dictionary` at `9051e8a` and
  contributes one evidence-only commit outside the later repaired
  real-dictionary line.

The `e-integration`-only delta was observed as five non-overlapping files:
`OPEN_ITEMS_REGISTER.md` plus four `scripts/operator/*` files.

`pillars-dict-srs` and `lived-in` are independent children of `e-weave`. Their
observed changed-file overlap was limited to the append-only build-evidence
capsule, but that does not prove semantic compatibility. Preserve every capsule
block while reconciling.

The V3 branch has one exclusive evidence appendix. Its three substantive
findings were later repaired on the real-dictionary line and inherited by
e-weave. Preserve the audit receipt; do not use V3 as the implementation base.

## Frozen integrity

The audit independently computed SHA-256 for every file named by the frozen
integrity manifest on `main`:

- 14 of 14 hashes matched exactly.
- None of the relevant post-main branches modified those frozen paths.

Future work must preserve this result. Never edit a frozen artifact to make a
new claim appear compatible.

## Working-base recommendation

Keep two ideas separate:

- **Canonical authority:** `main@cbb7f29...`
- **Candidate implementation aggregation:** `e-weave@f8e5f16...`

Wave 0 starts from canonical `main@cbb7f29...` for authority and inspects each
candidate at its exact SHA. Run e-weave clean checks only in an isolated or
detached checkout; do not create a writable branch from it before operator
ratification. The reconciliation receipt must explicitly account for:

1. the five-file e-integration-only delta;
2. the five pillars commits;
3. the six lived-in commits;
4. the unique `docs/build-evidence/CODEX_HANDOFF_PROMPT.md`; the existing
   `CODEX_VERIFICATION_PACKET.md` needs no duplicate copy;
5. the V3 audit appendix;
6. every confirmed P0/P1 and unresolved PR #13 thread;
7. dictionary parser, coverage, attribution, and license evidence;
8. replay performance and learner-state semantic conflicts.

The operator must ratify the exact implementation base and dispositions before
an Integrator opens the first code PR. Until then, `e-weave` is a useful input,
not “the new main.”

## Screenshot and photo evidence

No new operator screenshot or photo attachment was available to this audit.
Existing repository screenshots predate parts of the unmerged experience work
and cannot prove the current whole-product flow.

When new operator images arrive:

- inventory each by date and visible surface;
- record the behavior it actually demonstrates;
- distinguish visual preference from implemented interaction;
- do not infer off-screen behavior;
- tie any replacement evidence to an exact build and commit SHA.

This pending visual inventory does not weaken the product lock.

## Admission decision

Approved now:

- publish the additive product lock, controller, admission receipt, and their
  integrity record from the exact canonical `main`;
- begin a read-only Wave 0 reconciliation team;
- repair documentation or findings only through draft PRs.

Not approved by this receipt:

- selecting a feature branch as canonical;
- merging or deleting branches;
- importing copyrighted or private content;
- processing live sources through an unofficial transcript adapter;
- calling any post-main branch clean, verified, or complete;
- claiming Bunki is done.
