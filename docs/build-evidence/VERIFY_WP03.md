# WP-03 verification record (V4) — wf_5714bcc8-a2c


---

## Round 1 — verdict: PASS

- **P2** — The hand-rolled SHA-256 (packages/persistence/src/hash.ts) diverges from node:crypto on LONE surrogates. utf8Bytes() encodes an unpaired surrogate as WTF-8 (3 raw bytes) where every standard UTF-8 encoder substitutes U+FFFD. I found this with a 5000-input randomized differential fuzz against node:crypto (deterministic PRNG, seed 0x5eed). I then isolated it: all 0..200 block-boundary lengths match, all BMP non-surrogate code points match, all valid astral surrogate PAIRS match ('😀','𠮷','𝄞','分岐😀峠'), and the published empty-string/'abc' vectors match. ONLY unpaired surrogates differ (e.g. '\ud800' -> mine 91a681b9..., node 83d544cc...). NOT reachable through the production path, which I verified empirically rather than by inspection: the sole caller is fingerprintBatch() = sha256Hex(canonicalJson(events)), and canonicalJson uses JSON.stringify, which since ES2019 is well-formed and escapes a lone surrogate to the six ASCII characters \ud800. canonicalJson({text:'a\ud800b'}) contains no raw surrogate and both hashers agree on it byte-for-byte. So no stored fingerprint is wrong and no idempotency decision is affected. It is a latent trap only because sha256Hex is re-exported from the package barrel (src/index.ts:28 `export * from './hash.ts'`), so a future caller that hashes a raw user string instead of canonical JSON would mint a digest disagreeing with every other tool on the platform. The builder's own claim is accurate and does not overstate: hash.test.ts covers 'surrogate pair' ('a🌸b'), and the capsule says 'surrogate pairs', not lone surrogates.
  - fix: Either (a) normalize in utf8Bytes(): when a high surrogate is not followed by a low surrogate (or a low surrogate appears unpaired), emit U+FFFD's bytes EF BF BD, matching TextEncoder/Buffer; or (b) if the WTF-8 behavior is deliberate, state the precondition on sha256Hex's docblock ('input must be well-formed UTF-16; callers should pass canonicalJson output') and add a lone-surrogate test that pins the chosen behavior so it cannot change silently.
- **P2** — packages/persistence/README.md line 21 states the web adapter is "**provisional** — labeled provisional in code, in the about screen, and here". No about screen exists: apps/app/app contains only _layout.tsx and index.tsx. Controller §7 requires the provisional label in code, UI (about screen), AND README, so the README asserts a §7/REQ-ARCH-05 conformance point that is not currently true. This is not a boundary violation — apps/app is B6's surface under the W3 lock, so WP-03 correctly cannot write it, and the code comment at src/web/adapter.ts:73 properly attributes the about screen to WP-05/WP-09 and exports PROVISIONAL_WEB_ADAPTER_NOTICE as the single shared string for it to consume. The mechanism is built and correct; only the README's present tense overstates. The real risk is that the obligation is untracked: nothing in CAPSULE.md or the orchestration log records the about-screen disclosure as owed by WP-05/WP-09, so a downstream reader consulting this table would conclude the label already ships. WP-03's own closure predicate (§18) does not include the about screen, so closure is not blocked.
  - fix: Change the README cell to future tense with the owner named (e.g. 'labeled provisional in code and here; the about-screen label is owed by WP-05/WP-09 and consumes PROVISIONAL_WEB_ADAPTER_NOTICE'), and record it as an explicit cross-lane obligation in the capsule so WP-05/WP-09 inherits a tracked item rather than a satisfied-looking table row.
- **P2** — Circular package relationship between the two WP-03 packages: @bunki/persistence declares @bunki/export as a runtime dependency (it needs buildExportEnvelope/ExportEnvelope for exportJson), while @bunki/export declares @bunki/persistence as a devDependency (verify-export.test.ts opens real SQLite and web stores). The runtime import graph is acyclic because the back-edge is test-only, and lint, typecheck, and the boundary suite all pass, so nothing is broken today. It is justified on the merits — controller §11 requires verify:export to assert equality against a live store, which is only honest if real adapters are used, and the negative control in that suite depends on opening two different real stores. Recording it because a cycle that is currently dev-only is one import away from becoming a runtime cycle, and no test currently pins the direction.
  - fix: No change required for WP-03. If cheap, add an assertion to the existing boundary suite (test/boundaries.test.ts) that no file under packages/export/src imports @bunki/persistence, so the dev-only direction of the cycle is enforced rather than merely observed.

### Full report

« V4 VERIFICATION REPORT — WP-03 (Local persistence, migrations, idempotency, deletion, export) »

**Builder:** B4 — `agent/bunki-phase0-closed-loop-wp03` @ `388996b0f20575eb3a4891cd89e480d02c382da9`
**Verdict: PASS** — zero P0, zero P1, three P2.

---

## 1. Integrity, run before anything else

Launcher step 1 first, as required. Observed controller hash `de7b6fcc…a859b47` equals the launcher's expected value; I re-hashed the same blob from `origin/main` and got the identical digest. v2 design authority `5ee28477…b0c55` matches the controller header. I then verified all 13 files in `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` — all match. No §21.3(1) trigger. Authority to obey the controller was established before I read a single build instruction.

**Stacking:** `git merge-base` of the WP-03 branch and `755c090` is exactly `755c090557cffbe0f316445b77c74a0a909d9a46`, as declared and as recorded in the capsule appendix.

## 2. I ran everything myself, in a clean checkout

Fresh clone, `git checkout 388996b`, `npm ci` on node v22.22.2 / npm 10.9.7. Not the builder's working copy.

| Check | Result | Builder claimed |
|---|---|---|
| `lint` | PASS | PASS |
| `format:check` | PASS | PASS |
| `typecheck` | PASS | PASS |
| `test` | **451/451** (31 files) | 451/451 |
| `test:replay` | **43/43** | 43/43 |
| `verify:export` | **10/10** | 10/10 |
| `expo export --platform web` | exit 0, `Exported: dist` | green |

Every count reproduces exactly. `test:e2e` correctly remains WP-10's placeholder.

## 3. Port contract suite against ALL adapters — run by me

**20 cases on the SQLite adapter via `node:sqlite` (file-backed, not `:memory:`) and the same 20 on the provisional web adapter. 40/40 green.** The suite lives in `src/`, not `test/`, with a framework-free `runPortContractSuite()`, so WP-11 can run the identical list on a device — a genuinely good decision.

## 4. ci-substitute labeling and the native boundary

Held. Every SQLite test name begins `[ci-substitute]`, every web name `[web-provisional]`, forced by `contractCaseName()` rather than by discipline.

**No passing test claims native.** I grepped every test name in both packages. The only `native` occurrences are disclaimers: `expo-binding.test.ts` is titled *"shape only — NOT native verification"*, and one of its cases asserts the driver *"labels itself native, which is a statement about the runtime it is for, not a result"*. I confirmed `expo-driver.ts` is wired into no suite runner, so a native-labeled store cannot be minted in CI at all. The README records **T-16 native as UNVERIFIED**, belonging to WP-11.

The builder deliberately declined to run the contract suite through the expo binding — which would have produced exactly the false native evidence §7 forbids. That restraint is the right call and worth naming.

## 5. Purge really removes bytes — verified two independent ways

**(a) My own adversarial test.** I wrote a check that does not trust the builder's harness: raw `Buffer.includes` over **every file in the database directory** (not the three it expects), my own canary, plus a second case dumping every column of every row of every table from `sqlite_master`. Canary present before purge (precondition asserted, so the absence check is not vacuous), gone after; no table retains it; audit trail intact.

**(b) Mutation test — the decisive one.** I removed `PRAGMA secure_delete = ON`, `wal_checkpoint(TRUNCATE)` and `VACUUM` from the adapter. **Three of the builder's tests failed immediately.** They are load-bearing, not decorative.

Worth recording honestly: **my independent test did *not* catch that mutation** — it seeds one small event, so freed pages get reused. The builder's `representativeLog`-based test is strictly more sensitive than the one I wrote to check it. Adapter restored; tree verified clean.

The two defects the builder self-reports finding (canonical event JSON surviving in the batch table; bytes left on freed pages and in the WAL) are real classes of bug, and the fixes — digest instead of text, plus dropping referring batch rows, plus reclamation *after* commit so a crash leaves a purge that is recorded and re-runnable — are correct.

## 6. Down-migrations actually run

Confirmed by reading, not by trusting the summary. Every shipped migration is driven **up → down → up individually**, comparing a canonical `sqlite_master` fingerprint (exact `CREATE` text of every table *and index*). Critically, **line 101 asserts `expect(before).not.toBe(after)`** — a down-migration that silently does nothing **fails**. Full teardown asserts `rolledBack [3,2,1]` and that re-migrating reproduces a byte-identical fingerprint.

The §21.3(7) guard is exercised with fixture migrations that genuinely are destructive, including one whose `destructive: false` flag is contradicted by `classifyStatements()` reading the actual SQL. No destructive migration ships in Phase 0 — all three forward migrations are additive, which the tests assert rather than assume. Putting the demonstration one-way door in a fixture instead of a real upgrade path was the right choice.

## 7. T-01 / T-16 / T-14 — do they assert what they claim?

**Yes, all three.**

- **T-01** separates the two claims properly: immediacy is read-your-write on the *same* handle; durability is identical bytes from a *different* handle over the same storage. `withStore` closes every time and the SQLite harness always uses a real file — an in-memory database would have made this pass while proving nothing.
- **T-16** captures five port answers before and after a full reopen and compares them, plus the log against what went in. `t16-web-restart.test.ts` adds a genuine page-reload simulation and proves unknown snapshot version, corrupt storage, and unparseable events all **fail closed** rather than silently starting empty.
- **T-14** runs against **real stores on both adapters**, covers empty and purged stores and a serialise-to-text-and-back case, and carries a real **negative control**: verifying one store's export against a different store's state must report inequality. A verifier stuck at `true` would fail. That control is what makes the other nine assertions mean anything.

`verify:export` is genuinely real — one root script line changed, `not-implemented.mjs` → the actual suite.

## 8. Boundaries

**Fully confined.** Nothing outside `packages/persistence/`, `packages/export/`, `docs/build-evidence/CAPSULE.md`, `package.json` (exactly one line, the `verify:export` script, recorded), and `package-lock.json` (mechanical, adding no new external dependency — only `zod@4.4.3`, already the pin at base). `packages/domain` (B5), `packages/seed` (LOCKED), `apps/app` (B6), and all frozen docs are untouched — verified by explicit grep returning empty. CAPSULE.md append-only holds: `grep '^-'` returns 1, the diff header alone, zero prior content removed.

Licence claims independently re-verified from the registry: `better-sqlite3@13.0.1` MIT (the rejected candidate), `expo-sqlite@57.0.1` MIT. Secrets scan clean.

## 9. Findings (all P2, none blocking)

1. **Hand-rolled SHA-256 diverges from `node:crypto` on lone surrogates.** Found by a 5000-input differential fuzz I wrote. WTF-8 encoding where standard encoders substitute U+FFFD. **Not reachable in production** — I verified empirically, not by inspection, that `canonicalJson` escapes lone surrogates to ASCII before hashing, so no stored fingerprint is wrong and no idempotency decision is affected. It is a latent trap only because `sha256Hex` is re-exported from the package barrel. The builder's claim is accurate and does not overstate — they said "surrogate pairs", which is exactly what their test covers and exactly what passes.
2. **README overstates one labeling location.** `packages/persistence/README.md:21` says the web adapter is labeled provisional "in the about screen"; no about screen exists. Not a boundary violation — `apps/app` is B6's surface and the code comment correctly attributes the about screen to WP-05/WP-09, with `PROVISIONAL_WEB_ADAPTER_NOTICE` exported for it to consume. The mechanism is built; only the tense is wrong, and the obligation is untracked.
3. **Dev-only package cycle** between `@bunki/persistence` and `@bunki/export`. Justified (T-14 needs real stores) and currently harmless, but unpinned by any test.

None of these touch WP-03's §18 closure predicate.

## 10. Judgement

The predicate table is accurate. I checked its load-bearing claims by re-running or re-deriving them rather than reading them, and where I tried hardest to break something — the purge, the migrations, the hash, the native boundary — the work held. Two things stood out as better than required: the negative control in `verify:export`, and the refusal to run the contract suite through the expo binding when doing so would have manufactured native-looking evidence.

The one caveat I want on the record is not a defect in this WP: **a `ci-substitute` pass is evidence about SQL, transactions, and invariants, and about nothing else.** Nothing here has been demonstrated on a device. WP-11 owns that claim, the build says so in its README, its test names, its capsule, and its port type — and it should keep saying so.

**PASS.** Recommend the three P2s be carried, with #2 converted into a tracked WP-05/WP-09 obligation rather than left as a satisfied-looking README row.
