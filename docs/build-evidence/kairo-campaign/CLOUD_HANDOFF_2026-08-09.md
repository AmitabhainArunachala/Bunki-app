# KAIRO full-build cloud handoff — 2026-08-09

This is a deliberate safe-stop boundary. All valuable work is either on the
clean integration branch or on a named remote side branch. Do not continue from
the primary checkout at `/Users/dhyana/Bunki-app`; it is unrelated user work.

## Start here

- Repository: `AmitabhainArunachala/Bunki-app`
- Integration branch: `codex/kairo-full-build-20260808`
- Draft integration PR: `#67` (temporarily based on the PR #65 branch)
- Safe integrated product SHA: `976233dfef53a5958063fac13c12b5531c174a29`
- Starting campaign SHA: `e8be255e1ea13a350759198f3e85caf0e239560d`
- Upstream prototype PR: `#65`, still draft/open/clean at
  `dda0d123c45afd3be7825d67ce556ee06843bb84`
- Source instructions:
  `/Users/dhyana/.codex/attachments/3c799406-fa14-4674-bf97-3e4683328469/pasted-text-1.txt`

Fetch first, then work in a new isolated worktree. Never reset or reuse the
primary checkout.

```sh
git fetch origin --prune
git worktree add /tmp/bunki-cloud-handoff \
  -b cloud/kairo-resume-20260809 \
  origin/codex/kairo-full-build-20260808
```

## What is safely integrated

`976233d` contains:

- reconciliation of PR #65 / Opus head with the four corrected Drift hunts;
- authoritative SEM source repair and generated artifact reconciliation;
- fail-closed A0 verifier and CI wiring;
- Corridor interaction/a11y closure;
- the real `静かな朝` golden source at exact `自分` UTF-16 `[283,285)`;
- durable Learn pair, finite session, `分かれた道` reintroduction,
  inspector/export/return UI;
- full-capture v2 SHA-256 idempotency, exact legacy dual-read, whitespace
  quarantine, and typed `origin_ambiguous` lineage failure;
- a fail-closed integration-manifest verifier. The checked-in manifest is still
  schema v1, so `npm run verify:integration-manifest` is intentionally red until
  the final schema-v2 campaign receipt is written.

Exact integrated checks already run:

- domain: 568/568;
- app: 617/617;
- focused combined A1: 42/42;
- lint, Prettier, and all-workspace typecheck: pass;
- Drift union hunt twice: pass, zero page errors;
- Drift fast twice: 45/45 each, zero violations/page errors;
- Corridor: 91/91;
- Corridor accessibility: 20/20;
- generated Drift layer/standalone: byte-identical across two builds;
- local diagnostic performance: boot p95 97 ms, warm lookup p95 132.6 ms;
  production performance remains explicitly **unproven**.

## Promotion blocker — do this first

Branch `origin/codex/kairo-a1-verified-grade-20260809` is clean and pushed at
`d85d62796c92f23d76dea9b125dcac56983cdef0`. It is an explicit WIP and must not
be promoted by itself. Commit `7b39955` preserves the eight-case red proof;
`d85d627` makes those eight adversarial domain cases green and passes the domain
source typecheck.

The WIP implements the v2 parser/schema, deterministic NFKC/trim proof,
v1 `response_unverified`, tamper rejection, and source-bound gate/activation.
It intentionally leaves the minter, session/canvas/repair UI, evidence copy,
golden ambiguity state, exact routing, and broad regression migration undone.
Resume from that branch and begin with the domain workspace typecheck to
enumerate the remaining call sites.

The independent judge reproduced a P0 authority bug: the current session has no
response input. Clicking `Good` mints v1 `ReviewGraded`, the gate admits it, and
FSRS increments `reps` even though no answer or grader proof exists. The current
golden E2E is itself the reproducer. A1 is **not promoted**.

Implement the mapped fix:

1. Keep v1 `ReviewGraded` parse/export lossless, but reject it from new scheduler
   truth as `response_unverified`.
2. Add versioned `ReviewGraded` v2 with raw response plus a closed, recomputable
   accepted-answer grader proof tied to the exact contract version, response
   modality, and pinned NFKC/trim policy.
3. The domain minter accepts response + effort, never caller-authored
   correctness/final grade/proof. The gate independently recomputes it.
4. Wrong, revealed, or helped attempts become `Again`; blank/tampered/rubric/
   free/audio-without-a-real-grader attempts fail closed. `Easy` remains an
   explicit confirmation on a correct unhelped response.
5. Scheduler admission must also require `bindRetrievalContract` success. Two
   eligible origins must never be bypassed by the component→thread index.
6. Golden UI must distinguish “contracts recorded” from “retrieval ready” and
   show `origin_ambiguous` instead of claiming Learn success.
7. Explicit source/anchor/thread routes must exact-match or refuse; never fall
   back to another active thread or offer a mislabeled golden return.
8. Add migration/tamper/import/export/replay tests and convert the golden E2E to
   enter the real answer (`じぶん`) before choosing effort.

The detailed judge report is in the originating Codex thread; the seams are
`events/catalog.ts`, `events/envelope.ts`, `events/parse.ts`, `evidence/mint.ts`,
`evidence/gate.ts`, `replay/replay.ts`, `session/commands.ts`, the app session/
repair/evidence screens, and golden tests.

## Ready side lane — A2 monthly truth

Remote branch: `origin/codex/kairo-a2-monthly-20260809`

Commits:

- `87f54c6` — pure non-scalar UTC monthly projection + export proof;
- `3a7d22f` — accessible `/monthly` Expo route/navigation.

The pushed branch is clean at
`3a7d22fa1cf2daac542a3dc895d926a8f5acadea`. Checks: projection/export 5/5,
navigation 10/10, domain/export/app typechecks, focused ESLint/Prettier/diff,
and a fresh 15-route Expo export all pass.

Dedicated Chromium falsified two UI assumptions before cutoff: the 390 px
viewport overflows horizontally by 38 px, and the UTC month-switch test could
not find `monthly-month-2026-07`. The uncommitted diagnostic spec/fix is safely
preserved in immutable stash commit
`cb93ceee68f0cc4026f792e11ab371d15ff23992`, published so a remote runner can
fetch it at `origin/codex/kairo-a2-monthly-wip-20260809`. Fetch that ref, then
apply the commit as a stash only when resuming this lane. Full E2E/axe and
screenshot inspection remain undone.

It exposes eight separate lenses and no aggregate mastery/level: recognition,
meaning recall, production, listening, kanji reading, writing, grammar
discrimination, and source familiarity/exposure. Unsupported entity/writing/
source links remain visibly unresolved. It deliberately classifies v1
`ReviewGraded` only as an unverified recorded claim. After grading v2 lands,
extend this closed classifier with the proof-bearing variant, then integrate and
run Chromium.

## Ready side lane — Drift accessibility

Remote branch: `origin/codex/kairo-drift-a11y-20260809`

Latest commits:

- `c44025c` — authoritative real-Chromium red verifier/evidence, 5/30 green and
  25/30 red;
- `7e9efa8` — explicit WIP runtime checkpoint, syntax-valid but not generated.
- `1940ee3` — generator-reconciled WIP with real Chromium at 19/30.

The branch is clean and pushed at
`1940ee3`. Artifact/generator syntax, both generator `--check` commands,
generated parity, assets, and console checks are green. The remaining 11 rows
cover per-frame availability/AX sync, typed fallback relations, pointer
double-routing, closed-dialog tab leakage, paused TTL, and truly static reduced
motion. Do not apply the old local stash; it duplicates committed `7e9efa8`.
Do not promote the WIP commit itself. Required closure is verifier 30/30, union
hunts twice, Drift fast twice, Corridor 91/91, zero page errors, and inspected
green screenshots.

## Safe integration order

1. Finish and independently review verified grading/source-bound admission on
   `codex/kairo-a1-verified-grade-20260809`.
2. Cherry-pick that result onto `codex/kairo-full-build-20260808`; run domain,
   app, replay, export, built golden E2E, lint/format/typecheck.
3. Rebase or adapt the A2 two-commit lane to grading v2; run its Chromium and
   axe proof; integrate.
4. Finish the Drift a11y WIP from `7e9efa8`, regenerate canonically, run the full
   protected matrix, then integrate.
5. Re-run exact-head A0/A0.5 and the complete app E2E. Update
   `integration-manifest.json` to schema v2 and make
   `npm run verify:integration-manifest` green.
6. Push the integration branch, inspect every CI job, and only then continue
   source/listening, AI teacher, native durability, corpus/search, and engine
   lanes.

Never interpret the green v1 replay verdict as verified recall. That distinction
is the most important open handoff invariant.
