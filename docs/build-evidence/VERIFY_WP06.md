# WP-06 verification record (V2) — wf_5714bcc8-a2c


---

## Round 1 — verdict: PASS

- **P2** — `GateDecision.forcedByReveal` is documented at packages/domain/src/evidence/gate.ts:79 as "True when the submitted grade was overridden by the reveal rule", but it is computed as `event.revealedBeforeRecall && event.grade !== 'again'` (gate.ts:317). On the primary production path `mintReviewGraded` has already rewritten `grade` to `'again'`, so the field is ALWAYS `false` for exactly the events where the override actually happened. Verified by probe: minting `{grade:'good', revealedBeforeRecall:true}` yields `grade='again'`, and admitting that same event yields `{admitted:true, effectiveGrade:'again', forcedByReveal:false}`. The one `forcedByReveal:true` in golden-004 comes from a raw fixture event that never went through the minter. Scheduling is correct in both cases; the defect is in a derived-state field that REQ-UI-06's evidence inspector (WP-08/WP-09) will consume — a "grade was forced" badge built on it would never light up for real in-app reviews.
  - fix: Either (a) narrow the comment to what the code means ("true when ADMISSION, not minting, had to override the grade — the mint path records the override as revealedBeforeRecall on the event itself"), or (b) compute it as `event.revealedBeforeRecall` alone so the field means "the reveal rule determined this grade", and add a T-06 assertion covering the minted path. Option (b) changes golden fixture snapshots, so (a) is the cheaper close.
- **P2** — packages/domain/src/contracts/retrieval-contract.ts line 17 states "Every field below is REQ-DM-05's normative minimum. Nothing is added." The `RetrievalContract` interface immediately below adds two fields REQ-DM-05 does not list: `createdAt` and `createdByEventId` (lines 60-61). They are envelope projections rather than new event-schema fields, so there is no ADR-002 consequence, but the comment as written is false and a verifier checking REQ-DM-05 field-for-field has to stop and reconcile it.
  - fix: Amend the comment to "Every REQ-DM-05 field is present and none is dropped; `createdAt` and `createdByEventId` are projections of the ContractCreated envelope, not additions to the REQ-DM-05 field set — no new event field, no schema version bump."
- **P2** — The retargeted absence scan in packages/domain/test/purity/seams-left-empty.test.ts narrowed WP-02's banned-substring list for WP-08's surface. WP-02 scanned `JSON.stringify(replay([]))` for ['memoryState','stability','difficulty','dueAt','interval','retrievability','plan']; WP-06 replaced it with ['sessionPlan','dueContracts','plannedItems']. The first five words are legitimately now the deliverable, but the bare substring 'plan' was dropped and not equivalently replaced — a derived key named exactly `plan` (or `reviewPlan`, `studyPlan`) would no longer fail the suite. The capsule claims "Every claim about WP-08's surface ... is intact and still asserted", which is very slightly stronger than what the code now asserts.
  - fix: Add `'plan'` back to the banned list in the `derives no session plan and no due queue` test (it still passes today — nothing in the current DerivedState contains the substring), so the WP-08 absence claim is as broad as WP-02 left it.

### Full report

> **Read-only run.** Nothing was committed, nothing was pushed. `origin/main` is still `e02b8b2` and `origin/agent/bunki-phase0-integration` is still `755c090`, both untouched. The three bypass attempts were made in a throwaway `git worktree` under the scratchpad, which has been removed.

## Verdict: **PASS** — 0 P0, 0 P1, 3 P2

WP-06 does what its closure predicate says. I re-derived every claim from a clean checkout rather than reading the builder's table, and every predicate B5 marked `met` is met. The one predicate B5 marked `partial` (6b, the six retargeted WP-02 assertions) I have adjudicated below: **the retargeting is sound**, with one narrow exception recorded as P2-3.

---

## 1. Integrity gate (launcher step 1, done first)

| File | SHA-256 | Matches |
|---|---|---|
| `docs/specs/BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md` | `de7b6fcc…a859b47` | launcher line 29 **and** integrity file line 18 |
| `docs/specs/BUNKI_V2_CONVERGED_PRODUCT_ARCHITECTURE_SPEC_2026-07-27.md` | `5ee28477…1b0c55` | integrity file line 17 |

All ten spec files hashed against `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`; all match. The controller is authentic and was verified before I read a line of WP-06 code.

---

## 2. Check set, from a clean checkout

`git clone` → `git checkout 209d113` → `npm ci`, then the full §17.5 set:

```
npm run lint          → eslint . — 0 problems
npm run format:check  → All matched files use Prettier code style!
npm run typecheck     → clean: root + 6 workspaces, incl. domain's tsconfig.json (types:[]) and tsconfig.test.json
npm run test          → Test Files 33 passed (33) | Tests 468 passed (468)
npm run test:replay   → Test Files  2 passed  (2) | Tests  47 passed  (47)   [run twice, identical]
npm run test:e2e      → PLACEHOLDER, exit 0 (WP-10) — not counted as verification
npm run verify:export → PLACEHOLDER, exit 0 (WP-03) — not counted as verification
(cd apps/app && npx expo export --platform web)
                      → Web Bundled 2077ms; entry 1.1MB; 3 static routes; "Exported: dist"
```

Every number matches the capsule verbatim, including the `468`.

**Baseline independently reproduced.** A separate clean clone at `755c090` with its own `npm ci` gives **328 passed (328)** — so the `328 → 468` claim is real, and the delta is +140 new tests rather than a re-count.

---

## 3. §18 WP-06 closure predicate, line by line

| Controller clause | Verdict | What I checked |
|---|---|---|
| §6.2 gate complete | ✅ | All 7 §6.2 bullets present as named branches; `GATE_REJECTION_REASONS` is a closed list of 15 and `gate.test.ts` fails if any entry is unexercised |
| Contracts per REQ-DM-05 | ✅ | Every normative-minimum field present; `acceptedAnswers` XOR `rubricId`+`rubricVersion` enforced as a discriminated union; `RETRIEVAL_SKILLS` = the five REQ-DM-05 names; `MODALITIES` = text/audio/visual/choice/free |
| FSRS pin per §6.3 with recorded version/params | ✅ | Exact `"5.4.1"` (no caret/tilde), retention 0.90, fuzz off, all 21 weights written out, `verifyFsrsPin()` diffs the installed library and a test gates on it |
| Promotion flow per REQ-DM-09 | ✅ | `captured`/`keep` activate nothing; `learn` = recognition/reading/sense; `master` adds production/discrimination; rate-limit declared as a typed seam |
| T-02, T-05, T-06, T-07, T-08 passing | ✅ | One named file each, 30 tests, read in full — see §4 |
| Meaning/reading separate contracts in fixtures | ✅ | golden-002 and golden-004 both carry two skills on one component |
| Contract→thread link per CON's W2 disposition | ✅ | Projection from `EncounterCaptured`; **no file under `packages/domain/src/events/` was touched**, so no ADR-002 schema change |
| Golden replay extended with a scheduling fixture | ✅ | golden-004: 19 events, 12 gate decisions, 5 admitted, 7 refused across 6 distinct reasons, 3 memory states — B5's numbers are exact |
| `src/session/` left empty | ✅ | Contains `.gitkeep` only |

### REQ-DM-09's "rate-limited" clause is legitimately a seam, not a gap

I pushed on this, because §18's *Not done* list for WP-06 mentions only FSRS parameter fitting and Tier-B/C math — it does **not** excuse rate limiting. The excuse is elsewhere and it holds: controller §2 excludes "no generalized journey compiler, no `ContentReadinessEstimate` ranking" and instructs "**Preserve seams (ports, event compatibility, policy-manifest types) without implementing them.**" `PromotionRateLimitPolicy` + `PROMOTION_RATE_LIMIT_SEAM` is exactly that instruction executed. The half of REQ-DM-09 that Phase 0 *can* guarantee — promotion never happens automatically — **is** structural: `PROMOTION_ORIGINS = ['user', 'nomination_accepted']` with no `automatic` member. Not a finding.

---

## 4. The five named tests — read, not counted

I read every body. None is a renamed trivial test; all five drive the real `parseEventLog → replay` pipeline (`test/support/wp06.ts:114`), not a hand-built gate context.

- **T-02** asserts the claim at two levels: no `MemoryState` exists, *and* a review arriving anyway is refused **by name** (`thread_not_promotion_active`). It separately proves `keep` schedules nothing, that activation is the later of promotion and contract creation **in both orders**, and that demotion sets `active:false` while preserving `admittedReviewCount` and `reps`. That is the controller's meaning, not a proxy for it.
- **T-05** asserts `JSON.stringify(after) === JSON.stringify(before)` on the meaning contract's state after a reading failure — byte-identity, not similarity — and that exactly one `contractId` is admitted per grade.
- **T-06** tests **both doors**: minting rewrites `grade` to `again` and drops a now-meaningless `userConfirmedEasy`; admission re-corrects a raw event that bypassed the minter. It then proves a forced `again` schedules **byte-identically to an honest `again`** and **differently from the submitted `good`** (difficulty strictly greater). That last pair is what makes it a real test.
- **T-07** asserts the `LookupFrictionLogged` *schema* has no `grade`, `tier` or `contractId` key at all, then that the whole `memoryStates` array is byte-identical with and without a lookup — neither punished nor rewarded.
- **T-08** covers the harder version: exposure **to the very component under study**, plus tier-B *and* tier-C production, all refused; and the gate stamps `tier: 'D'` so a caller cannot relabel exposure as review.

---

## 5. Three written bypass attempts — verbatim

Constructed in a scratch worktree, run against the branch's own source. All three fail. Full transcripts are in the `commandsRun` list; the shape:

**Bypass 1 — construct an accepted `EvidenceEvent` outside `src/evidence`.**
Compile-time: five `@ts-expect-error` directives on `createDomainEvent(ctx, <each evidence family>, …)` were all *consumed* → `TSC_EXIT=0`. **Negative control:** swapping one family for the non-evidence `'DataExported'` produced `error TS2578: Unused '@ts-expect-error' directive` — so the probe is live, not vacuous. Runtime through `any`: five `EvidenceFactoryBoundaryError`s. The only remaining route is hand-writing wire JSON and parsing it — which yields a *well-formed* event but never an *accepted* one: refused `contract_unknown` on an empty log, and refused `easy_requires_user_confirmation` inside a fully legitimate capture→`learn`→contract log, with `admittedReviewCount=0, reps=0`.

**Bypass 2 — send a `Candidate` into the gate.**
Compile-time: two directives consumed. Runtime: five distinct `CandidateEvidenceBoundaryError` markers — `type=CandidateAttached`, `candidateId`, `envelope.taskClass=T2`, `promptFamilyId`, `promptVersion` — including one that survived a `JSON.parse(JSON.stringify())` round trip, which is the case where classes and brands are worth nothing. A `CandidateAttached` inside a replayed log produces **no gate decision at all** and moves nothing.

**Bypass 3 — reach the FSRS reducer with an `ExposureLogged`.**
Compile-time: four directives consumed, including the attempt to read `effectiveGrade` off an unnarrowed `GateDecision`. Runtime through `any`: three `FSRSValidationError`s. End to end: `exposure_is_never_retrieval`, with `memoryStates` **byte-identical with and without** the exposure. Relabelling a minted exposure as `tier:'A' type:'ReviewGraded'` is refused by the parser on six required fields plus two unrecognized keys.

---

## 6. Replay determinism **with** scheduling

Beyond running `test:replay` twice (47/47 both times), I wrote an independent two-process probe that hashes `canonicalJson(replay(events))` for all four fixtures and prints every contract's phase/stability/difficulty/dueAt/reps/lapses. **`diff` exit 0 — byte-identical across two separate Node processes.**

```
golden-004  sha256=754ae55b8f62c03e601ec59ed99300b8f160ecc44a1f5be045b6acc1e5ac584f
  contract-bunki-meaning     phase=review    stability=18.52175344 difficulty=1          reps=2
  contract-bunki-production  phase=learning  stability=2.3065      difficulty=2.11810397 reps=1
  contract-bunki-reading     phase=learning  stability=3.17368654  difficulty=6.40211507 reps=2
```

The capsule's honesty about the residual cross-runtime float risk is correct and correctly bounded: the mitigation (integer-day intervals; 8-decimal rounding **fed back in** at each step) is real, it is not a proof, and **no cross-runtime determinism claim is made**.

---

## 7. ts-fsrs FSRS-6 primary-source check — exists and is plausible

Re-verified from the installed package, not from the capsule:

| Source | Finding |
|---|---|
| `CHANGELOG.md:119` | "1. Upgraded to FSRS-6 algorithm" |
| `CHANGELOG.md:122` | PR #174 "Feat/FSRS-6" |
| `CHANGELOG.md:90` | PR #196 "Fix/FSRS-6 default parameters" |
| `README.md:3` | badge `FSRS-v6` → fsrs4anki wiki `#fsrs-6` |
| runtime | `FSRSVersion === 'v5.4.1 using FSRS-6.0'` |
| runtime | `default_w.length === 21`; `default_w[20] === 0.1542 === FSRS6_DEFAULT_DECAY`; `FSRS5_DEFAULT_DECAY === 0.5` |
| `package.json` | `license: MIT` |

All 21 installed default weights are byte-equal to `FSRS_WEIGHTS` in `fsrs-pin.ts`. The structural argument (21 weights + decay term vs FSRS-5's 19 + fixed 0.5) is sound and independently reproducible.

---

## 8. Surface confinement, capsule discipline, secrets

`git diff --stat 755c090..209d113` → 40 files, +5228/−133, entirely within:

- `packages/domain/**` (38 files)
- `docs/build-evidence/CAPSULE.md` — **147 added, 0 removed; zero `^-` deletion lines**. Appended, never rewritten.
- root `package-lock.json` — **+10 lines only**, the `ts-fsrs@5.4.1` entry (integrity sha512, MIT) and its `dependencies` line.

**Zero** files under `docs/specs`, `docs/convergence`, `docs/handoffs`, `docs/adr`, `apps/`, `packages/ai`, `packages/seed`, `packages/persistence`, `packages/export`. **No file under `packages/domain/src/events/`** — the ADR-002 no-schema-change constraint from CON's W2 disposition is structurally satisfied, not merely asserted.

Secrets: `0` matches for `api[_-]?key|secret|bearer|password|token` across the entire code/test/fixture diff. REQ-GATE-03: no efficacy, retention, burden-reduction or "optimized" claim anywhere (the only regex hit was `provenance`).

---

## 9. Adjudicating predicate 6b — the six retargeted assertions

B5 flagged this `partial` and asked a verifier to judge. **Judgement: the retargeting is legitimate.** Each of the six was a WP-02 statement about work that had not happened yet, and five of the six were replaced by a *stronger* claim, not a weaker one:

- `src/contracts`/`src/evidence` empty → now populated, **and `src/session` is still asserted empty**, which is the absence claim that still has a subject.
- no `ts-fsrs` dependency → now `=== '5.4.1'` exactly, `devDependencies` asserted undefined, **plus a new assertion that only two named files import it**.
- bare imports `['zod']` → `['ts-fsrs','zod']`, still exhaustive: a third bare import still fails.
- one envelope minter → exactly `['events/factories.ts','evidence/mint.ts']`. Two named files is a stronger claim than one file plus an unenforced convention, and the split *is* the REQ-ARCH-04 boundary.
- exhaustive `DerivedState` key list → 11 → 13 keys, still exhaustive, still rejecting `sessionPlan`/`dueContracts`.

The sixth (the substring scan) narrowed very slightly — that is P2-3.

---

## 10. Findings

**P2-1 — `forcedByReveal` is always `false` on the production path.** `gate.ts:79` documents the field as "True when the submitted grade was overridden by the reveal rule", but `gate.ts:317` computes `event.revealedBeforeRecall && event.grade !== 'again'`, and `mintReviewGraded` has already rewritten `grade` to `'again'`. Probe: minting `{grade:'good', revealedBeforeRecall:true}` then admitting it gives `{admitted:true, effectiveGrade:'again', forcedByReveal:false}`. The single `forcedByReveal:true` in golden-004 comes from a raw fixture event that never went through the minter. **Scheduling is correct either way** — the harm is downstream: a REQ-UI-06 evidence-inspector badge built on this field would never light up for a real in-app review.

**P2-2 — `retrieval-contract.ts:17` says "Nothing is added"** while the interface adds `createdAt` and `createdByEventId` (envelope projections, no ADR-002 consequence). A verifier checking REQ-DM-05 field-for-field has to stop and reconcile it.

**P2-3 — the WP-08 absence scan narrowed.** `seams-left-empty.test.ts` dropped the bare substring `'plan'` when it swapped the banned-word list. `'sessionPlan'` and `'plannedItems'` cover most of the ground but a derived key named exactly `plan` would now slip. Adding `'plan'` back passes today and restores the claim to WP-02's breadth.

---

## 11. Observations (not findings — for CON, no action required of B5)

1. **`applyAdmittedReview` is a public export reachable without the gate.** A caller can fabricate an `AdmittedReview` and get a real `MemoryState` back (`{reps:1, stability:8.2956, dueAt:'2026-08-04T09:03:00.000Z'}`). This is **not** a REQ-ARCH-04 violation: REQ-ARCH-04 governs *appending accepted `EvidenceEvent`s*, and canonical derived state is produced solely by `replay()`, which routes every evidence-class event through `admitToScheduler`. The fabricated value is a local return that never enters the ledger. Worth flagging to **B8 (WP-08)** and **WP-09** so no screen renders a `MemoryState` that did not come out of `replay()`. Note also that the three runtime blocks in Bypass 3 came from ts-fsrs's own `FSRSValidationError`, not a Bunki-authored guard — the boundary holds, but it holds via a library invariant.
2. **REQ-SCH-06's positive clause is untested end to end.** An embedded declared micro-probe *may* update FSRS; the gate correctly does not discriminate on `probeContext`, and `mint.test.ts:63` exercises `probeContext:'embedded'` at the minting layer, but no replayed log proves an embedded probe schedules. This most naturally lands with WP-08's integration canvas (screen 5) and is not in WP-06's §18 predicate.
3. **The W3 lock table assigns `docs/build-evidence/` to CON**, and B5 wrote to `docs/build-evidence/CAPSULE.md`. No conflict in practice: controller §3.7 requires a per-WP capsule append, B5 appended only (147/0), and `ORCHESTRATION_LOG.md` and the `VERIFY_*.md` files were untouched. Flagging so the lock table's wording is not read as a breach.
4. **The golden-002 span fix is correct** and I re-derived it independently: `彼`=0 `は`=1 `憮`=2 `然`=3, so the old `{3,5}` sliced `然と` and the new `{2,4}` slices `憮然`. `thread-0102` gaining `{0,3}` = `案の定` is likewise right. golden-001 and golden-003 event logs are byte-identical to `755c090`; only their `expectedState` grew the two new keys. B5's P2 self-report is accurate.

---

## 12. Recommendation

**PASS.** WP-06 may be stacked onto the integration branch after WP-01/02/04. The three P2s are comment/coverage polish with no effect on scheduling, evidence admission, or replay determinism; they belong in the carried P2 batch, not in a rework cycle.

---

### Paths

Verification checkout (clean, at `209d113`): `/tmp/claude-0/-home-user-Bunki-app/ad73754c-c068-5162-8e62-5a7eda022b57/scratchpad/v2-clean`
Independent baseline checkout (clean, at `755c090`): `/tmp/claude-0/-home-user-Bunki-app/ad73754c-c068-5162-8e62-5a7eda022b57/scratchpad/base-clean`

Files carrying the findings, on branch `agent/bunki-phase0-closed-loop-wp06` (repo root `/home/user/Bunki-app`):

- `/home/user/Bunki-app/packages/domain/src/evidence/gate.ts` — P2-1 at lines 79 and 317
- `/home/user/Bunki-app/packages/domain/src/contracts/retrieval-contract.ts` — P2-2 at line 17
- `/home/user/Bunki-app/packages/domain/test/purity/seams-left-empty.test.ts` — P2-3
- `/home/user/Bunki-app/packages/domain/src/reducers/memory-state.ts` — Observation 1 (`applyAdmittedReview`, line 196)
- `/home/user/Bunki-app/packages/domain/src/evidence/mint.ts`, `/home/user/Bunki-app/packages/domain/src/reducers/fsrs-pin.ts`, `/home/user/Bunki-app/packages/domain/src/replay/replay.ts` — read in full, no findings

