# WP-02 verification record (V2) — workflow wf_a1d7b3f2-694


---

## Round 1 — verdict: FAIL

- **P1** — ADR-002 field-for-field conformance breaks on exactly one field: `DataExported` carries `producedAt: isoInstantSchema.optional()` (packages/domain/src/events/catalog.ts:238), which appears nowhere in ADR-002's frozen v1 table or controller §6.1. ADR-002's Consequences clause is explicitly normative on this point: "Adding a field in Phase 0 means a schema version bump with a replay-tested migration, not an optional property quietly appended." No version bump, no ADR amendment, and no mention in the capsule's otherwise scrupulous 'Design decisions a reviewer should check' section. The field is live — golden-003-session-candidates-and-deletion.json:123 uses it — so it is baked into a T-03 fixture that WP-03 must round-trip losslessly (T-14/T-15). The catalog test asserts only family-set equality (DOMAIN_EVENT_TYPES vs an independently written SPEC_FAMILIES list), never field-set equality, so nothing in the suite can see this. Note the builder applied the opposite discipline elsewhere: coordination request #1 explicitly declines to invent a contract→thread field because "widening another WP's schema unilaterally is the collision orchestration spec §2.4 forbids." DataExported belongs to WP-03's export path.
  - fix: Either (a) delete `producedAt` from `dataExportedSchema` and from golden-003 (the fixture's expectedState is unaffected — replay.ts does not project the field), or (b) obtain an ADR-002 amendment from CON before claiming WP-02 closed. Additionally, add a field-set assertion to catalog.test.ts that compares each family's accepted key set against an independently written ADR-002 table, so the next schema drift is caught by the suite rather than by a verifier.
- **P1** — Capsule design-decision #5 states: "an identical re-append under one key is a no-op ...; the same key claiming _different_ content is rejected, because replay would otherwise have to choose between two histories." The second half is false. packages/domain/src/replay/replay.ts:403-411 keys the conflict check on `eventId` only — if a repeated `idempotencyKey` maps to the same `eventId`, replay increments `skippedDuplicateCount` and returns, without ever comparing payloads. I verified this directly: replaying two EncounterCaptured events sharing eventId `ev-1` and key `k1` but carrying different `encounterId` and `text` yielded `applied=1 skipped=1`, `encounterIds=["enc-1"]`, and no error. The second, materially different event was silently dropped. This contradicts the module header's own doctrine ("Nothing is ignored", "An event that cannot be applied ... throws rather than being passed over"). The existing test gives false confidence: determinism.test.ts:195 'rejects one key claimed by two different events' mutates BOTH eventId and encounterId, so it only exercises the differing-eventId branch and never the same-eventId case. Spec-mandated behavior (ADR-002: "re-appending the same key is a no-op") is met; it is the stronger guarantee the capsule advertises, and which WP-03's idempotent-append work will be built against, that does not hold.
  - fix: Either harden the check — compare `canonicalJson(event)` against the first event recorded under that key and throw `IdempotencyConflictError` on mismatch — or correct capsule design-decision #5 to state the actual rule ("a repeated key naming a different eventId is rejected; a repeated key naming the same eventId is treated as the same event and skipped without inspecting its payload"). Whichever is chosen, add a test covering same-eventId/same-key/different-payload so the branch is no longer untested.
- **P2** — The capsule's 'State' section is stale relative to the branch it describes: it records `Branch: agent/bunki-phase0-closed-loop-wp02, head d4ce8f84ccf370b703b7d880cc1c65ced1bdb2ac` and 'Five commits, all prefixed WP02(B2):'. The actual head is 2e0bf42f7f0c96b3884b7bdd9c8bab9a2d48ecb7 and `git rev-list --count f53ce4b..HEAD` is 7 (3a5e163, e281d95, 011da43, 737bb44, d4ce8f8, ca30e14, 2e0bf42 — all correctly prefixed). Some drift is unavoidable since the capsule cannot record the SHA of the commit that adds it, but 'Five commits' was already wrong when written (3a5e163 predates the capsule), and commit 2e0bf42 exists specifically to fix stale capsule counts while leaving these two untouched — its own message argues "a capsule whose figures do not reproduce is worth less than one that omits them."
  - fix: Append a short correction to the capsule: actual head 2e0bf42, seven commits from base f53ce4b. Do not rewrite the existing section (append-only per orchestration §2.6).
- **P2** — Predicate-table row 'Surface discipline: packages/domain/ only, plus the capsule appendix' is marked met, but its own evidence cell then lists root package.json and package-lock.json. A reader scanning statuses and row titles reads a claim that is false; only someone reading the full evidence cell sees the correction. The underlying edits are legitimate — WP-01's capsule explicitly hands the `test:replay` line to WP-02 ("Leaving one in place past its owning WP (WP-02 / WP-03 / WP-10) is a closure-predicate failure for that WP"), scripts/not-implemented.mjs names WP-02 as the owner, and controller §6.3 requires `npm run test:replay` to prove identical derived state at WP-02 — so this is a reporting-accuracy issue, not a boundary breach.
  - fix: Retitle the row to 'Surface discipline: packages/domain/ + two pre-authorized root files + capsule appendix' so the headline matches the evidence.

### Full report

> Verifier V2 — WP-02 (`agent/bunki-phase0-closed-loop-wp02` @ `2e0bf42f7f0c96b3884b7bdd9c8bab9a2d48ecb7`)
> **Verdict: FAIL** — 0 P0, 2 P1, 2 P2. PASS requires zero P0/P1.

## Bottom line

This is high-quality work and the FAIL is narrow. Every check in controller §17.5 that WP-02 owns passes from a clean checkout, every count the builder reported reproduces exactly, T-03 and T-04 assert what they claim, and determinism holds byte-identically **across separate processes**, not merely twice in one. The two P1s are a single stray schema field and a single false sentence in the capsule. Both are cheap to fix; neither suggests the kernel is unsound.

I want to be explicit that the builder's self-report was unusually honest. It marked the §17.5 row `partial` rather than claiming the WP-10/WP-03 placeholders as passes; it surfaced `@types/node` as off-register instead of burying it; and it filed a coordination request rather than inventing a contract→thread field. My findings are calibrated against that standard, not against a lower one.

## Launcher step 1 — integrity, done first

All eight spec hashes match `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`, including controller `de7b6fcc…` and v2 spec `5ee28477…`. No mismatch, no §21.3 stop condition.

## What I confirmed independently

| Check | Result |
|---|---|
| `npm ci` from clean clone at builder's SHA | exit 0 |
| `lint` / `format:check` / `typecheck` | all pass; domain typechecks **both** `tsconfig.json` and `tsconfig.test.json`, so narrowing `src/` to `types: []` did not drop test type coverage |
| `npm test` | 17 files, **225 tests**, 0 failed (domain 187) — matches the report exactly |
| `npm run test:replay` | 2 files, **40 tests** — placeholder genuinely replaced |
| `expo export --platform web` | 3 static routes, `Exported: dist` |
| Diff confinement | 40 files: 37 `packages/domain/`, capsule, root `package.json` (one line), `package-lock.json` (zod only) |
| `src/session/` untouched | zero commits touch it; `.gitkeep` only. Same for `src/contracts/`, `src/evidence/` |
| No `Date.now`/`Math.random` in `src` | my own grep: only comment prose explaining the prohibition |
| Only bare import in `src` | `zod`, confirmed by my own scan |
| Secrets | clean; only hits are the capsule describing its own check |

**Determinism, probed rather than trusted.** I replayed all three golden fixtures in two separate Node processes and diffed the canonical JSON: byte-identical. Each also matched its *committed* snapshot, so the golden comparison is against recorded state rather than against itself. Fixtures are substantive (3/14/10 events). I specifically checked `compareIds` (`derived-state.ts:145`) — it is byte-wise, not `localeCompare`, so cross-runtime sort order is safe for WP-03/WP-11.

**ADR-002, field-for-field.** I walked all fifteen families against the ADR table and `REQ-DM-05`/`REQ-SRC-01` in the v2 spec. Fourteen match exactly, including `ContractCreated`'s full REQ-DM-05 set and the seven-field `ProvenanceRecord`. One does not — see P1 #1.

**Adversarial probes.** Strictness survives `.extend()` through `.refine()` (both refined families reject unknown keys). All 15 families reject all seven non-`1` version values I threw at them, with the version checked before type and payload.

## Findings

### P1 #1 — `DataExported.producedAt` is outside ADR-002's frozen v1 set

`catalog.ts:238` adds `producedAt: isoInstantSchema.optional()`. It appears nowhere in ADR-002 or controller §6.1. ADR-002's Consequences are normative and specific: *"Adding a field in Phase 0 means a schema version bump with a replay-tested migration, not an optional property quietly appended."* No bump, no amendment, no mention in the capsule's design-decisions section. It is live in `golden-003…json:123`, so it is inside a T-03 fixture that WP-03 must round-trip losslessly.

`catalog.test.ts` asserts only *family-set* equality against an independently written list — never field sets — so the suite structurally cannot see this. Worth noting the builder applied the opposite rule elsewhere: coordination request #1 declines to invent a contract→thread field because "widening another WP's schema unilaterally is the collision orchestration spec §2.4 forbids." `DataExported` is WP-03's export path.

*Fix:* drop the field (replay does not project it, so no expectedState changes) or get an ADR-002 amendment from CON. Either way, add a per-family field-set assertion so the next drift is caught by CI.

### P1 #2 — Capsule claims an idempotency guarantee the code does not provide

Capsule design-decision #5: *"the same key claiming **different** content is rejected, because replay would otherwise have to choose between two histories."* False. `replay.ts:403-411` keys the conflict check on `eventId` alone; when a repeated key maps to the same `eventId`, it increments `skippedDuplicateCount` and returns without comparing payloads.

Probed directly — two `EncounterCaptured` sharing `eventId: ev-1` / `idempotencyKey: k1` but differing in `encounterId` and `text`:

```
applied = 1  skipped = 1
encounterIds = ["enc-1"]     // second event silently dropped, no error
```

This contradicts the module header's own doctrine ("Nothing is ignored"). The existing test hides it: `determinism.test.ts:195` mutates **both** `eventId` and `encounterId`, exercising only the differing-`eventId` branch.

To be fair to the builder: the *spec-mandated* behavior (ADR-002, "re-appending the same key is a no-op") is met. It is the stronger guarantee the capsule advertises — and that WP-03's idempotent-append work will be built against — that does not hold.

*Fix:* compare `canonicalJson(event)` before skipping and throw `IdempotencyConflictError` on mismatch, **or** correct the capsule sentence. Either way add the missing same-`eventId` test.

### P2 #1 — Capsule "State" section stale
Records head `d4ce8f8` and "Five commits"; actual head is `2e0bf42` with **seven** commits from `f53ce4b` (all correctly `WP02(B2):`-prefixed). Some drift is unavoidable, but "Five" was already wrong when written, and `2e0bf42` exists specifically to fix stale capsule counts. Append a correction — do not rewrite.

### P2 #2 — Predicate row title contradicts its own evidence
"Surface discipline: `packages/domain/` only" is marked met, then the evidence cell lists two root files. The edits are legitimate and I cleared them (see below); only the headline is wrong. Retitle to include the two pre-authorized root files.

## Boundary question I cleared rather than raised

The W2 surface lock marks "everything else LOCKED (no writer)", and B2 edited root `package.json`. I did not treat this as a P0, because the authorization is on the record from three directions: WP-01's capsule states *"Leaving one in place past its owning WP (WP-02 / WP-03 / WP-10) is a closure-predicate failure for that WP"*; `scripts/not-implemented.mjs` names WP-02 as the owner of `test:replay`; and controller §6.3 requires `npm run test:replay` to prove identical derived state **at WP-02**. `zod@4.4.3` was on the WP-00 register with installation explicitly deferred to WP-02, and the lockfile diff contains nothing else. `test:e2e` and `verify:export` were correctly left alone.

Branch naming (`agent/bunki-phase0-closed-loop-wp02` vs orchestration §2.3's `agent/bunki-phase0-wpNN-<role>`) is **not** a finding: the orchestration spec's own supremacy rule gives the controller precedence, the launcher references `agent/bunki-phase0-closed-loop-*`, and WP-00/WP-01 passed verification under the same convention.

## Re-verification path

Both P1s are confined to `packages/domain/` — B2's own surface — so repair needs no new authorization. After fixes, re-run `npm run test:replay` and `npm test`; only golden-003 and the capsule change. The stacking obligation the builder recorded still stands independently: this branch is cut from `origin/agent/bunki-phase0-integration @ f53ce4b`, and must be rebased onto refreshed `main` with §17.5 re-run before WP-02 is claimed closed.

I committed and pushed nothing; the scratch clone and my assigned worktree are both clean, and `origin/main` is unchanged at `bbaf0b31`.


---

## Round 2 (post-repair) — verdict: PASS


### Full report

## V2 re-verification addendum — WP-02, round 2

**Branch:** `agent/bunki-phase0-closed-loop-wp02` @ `5a9051e5801eeb885a54a800f38d19d672485f2c`
**Method:** fresh `git clone` from origin into a scratch directory, detached checkout at the assigned SHA, `npm ci` from the committed lockfile. Nothing was read from the builder's working copy.
**Verdict: PASS.** Both round-1 P1 findings are resolved, both are pinned by tests that fail when the fix is removed, and the full §17.5 check set is green. No P0. No new P0/P1.

### Step-1 integrity (re-run, not carried forward)

Controller hashes `de7b6fcc5a9958d3becda43e5dfa80928c5187fb90c1c22554d32da8fa859b47` — the launcher's expected value. All 14 entries in `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` verify OK, v2 architecture spec included. No frozen document was touched by this branch.

### P1-1 — `DataExported.producedAt` (ADR-002 field drift) — RESOLVED

`packages/domain/src/events/catalog.ts:244` now declares exactly `exportVersion` and `scope`, which is verbatim what ADR-002's v1 table freezes for that family. The only surviving occurrence of the string in the whole tree is the comment at `catalog.ts:237` recording why the field is absent. `golden-003-session-candidates-and-deletion.json` no longer carries it, and its `expectedState` is unchanged — I confirmed independently that replay projects `ExportRecord` without ever reading the field, so nothing downstream lost information.

I did not take the fix on trust. The envelope is `z.strictObject`, so I probed the runtime rather than the source: `parseEvent({...exportedEvent, producedAt: '...'})` throws `/Unrecognized key/`. The field cannot re-enter through data even if someone re-adds it to a fixture. I also confirmed all 15 families are strict objects, so this class of drift is closed catalog-wide, not just for `DataExported`.

The new `ADR_002_FIELDS` table in `test/events/catalog.test.ts` is the right shape of guard: it is hand-transcribed rather than derived from the code under test, so it cannot ratify whatever the schema happens to say. I checked all fifteen rows against ADR-002, and the `ContractCreated` row — the one ADR-002 defers on — against REQ-DM-05 in the v2 spec §4.4. All fifteen transcribe faithfully, optionality included.

**Negative control reproduced independently.** Re-adding `producedAt` to the schema reddens exactly one test, `DataExported accepts exactly the fields ADR-002 froze, no more`, and leaves the other fourteen families green. The builder's claim is accurate to the count.

The builder chose removal over an ADR-002 amendment and said so, on the grounds that `docs/adr/` is off its surface lock and that amending a frozen ADR to legalise one's own drift is the wrong direction. I agree, and note it here because it is the harder of the two available choices.

### P1-2 — idempotency check ignored payloads — RESOLVED

`replay.ts:408-434` now stores `canonicalJson(event)` beside the claiming `eventId` and throws `IdempotencyConflictError` when the id matches but the content does not. I reproduced the original defect's exact shape against a real fixture event — same `idempotencyKey`, same `eventId`, mutated payload — and it now throws, with `existingEventId` and `conflictingEventId` both correctly reported. The two branches that must *not* throw still do not: a byte-identical re-append and a re-append whose keys are serialised in reverse order both land as `skippedDuplicateCount: 1`. The pre-existing `DuplicateEventIdError` path (same id, different key) is intact.

Comparison on canonical text rather than structural equality is the correct call here and the reasoning generalises: WP-03's export round-trip (T-14) compares bytes, so the gate above it has to as well.

**Negative control reproduced independently.** Neutering the `canonicalJson(event) !== claim.canonical` guard reddens exactly two determinism tests and leaves the key-order test green — and reddens exactly the two corresponding assertions in my own probe suite, written without reference to theirs. The tests pin the branch; they are not tautologies over "any difference throws".

I checked the fix for the obvious follow-on hole: `canonicalJson` moved to its own module to break the `golden.ts → replay.ts` cycle, and `golden.ts` re-exports it, so the package's public surface is unchanged. Confirmed at `golden.ts:25,29`.

### Check set, from the clean checkout

| Command | Result |
| --- | --- |
| `npm ci` | exit 0 |
| `npm run lint` | **pass** — eslint clean |
| `npm run format:check` | **pass** |
| `npm run typecheck` | **pass** — root + all 6 workspaces |
| `npm run test` | **pass** — 17 files, **244** tests, 0 failed |
| `npm run test:replay` | **pass** — 2 files, **43** tests, 0 failed |
| `npm run test:e2e` | exit 0 — declared placeholder (WP-10), **not evidence** |
| `npm run verify:export` | exit 0 — declared placeholder (WP-03), **not evidence** |
| `expo export --platform web` | **pass** — 3 static routes |

Every count matches the capsule's table exactly. The `+19` reconciliation (16 in `catalog.test.ts`, 3 in `determinism.test.ts`) is arithmetically correct against the round-1 figures of 225 and 40.

### Process compliance

- Repair commit touches 8 files: 7 under `packages/domain/` plus `docs/build-evidence/CAPSULE.md`. Inside the W2 surface lock. No spec, ADR, convergence, handoff, or sibling-package file modified.
- CAPSULE.md is append-only — the diff removes **zero** lines.
- Branch is a clean stack: merge-base with `origin/agent/bunki-phase0-integration` equals that branch's tip `f53ce4bd`. `git branch -r --contains HEAD` returns the WP-02 branch alone; nothing reached main or the integration branch. The stacking rationale is recorded in the capsule appendix as required.
- Secrets scan over the full branch diff: 4 regex hits, all four being the capsule's own prose describing its secrets check. No secret material.

### Two observations, neither a finding

1. `packages/domain` pins `zod` `4.4.3` and resolves to it via a nested `node_modules`, while the root tree carries a transitive `zod` `3.25.76` from the Expo dependency graph. The domain kernel gets the version it pinned — I verified the resolved package, not just the manifest — and the zod-4 APIs it relies on (`strictObject`, `.isOptional()`) are exercised by the passing suite. Recording it because two majors of the same library in one tree is worth someone knowing before WP-03 adds another consumer.
2. The two placeholder scripts exit 0 and say so loudly in their own output. Correct behaviour for now, but the W2 exit criteria should not be read as covering `verify:export` or `test:e2e` in any form.

### Scope of this pass

Re-verification only, per mandate: the two round-1 P1s and the check set. Round-1's P2 batch, T-02/T-05..T-08 (WP-06), the in-memory-only status of T-03, and the **UNVERIFIED** native surface (WP-11) all carry forward untouched and unexamined here.

**Recommendation: W2 exit for WP-02 on the domain side.** The evidence is reproducible from a clean checkout by anyone who wants to repeat it; both negative controls take under a minute each.

