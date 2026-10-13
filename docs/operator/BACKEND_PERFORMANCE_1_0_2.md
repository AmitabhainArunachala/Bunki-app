# Backend performance pass for KAIRO 1.0.2

This compatible patch removes repeated backend work while preserving the existing interface and storage format. It is based on main `ddfe767f8751a7e21dc84d3c1cc566340c3ac1e0`. No new deployment route or release-gate exemption is introduced.

## What changed

| Area                 | Implementation                                                                                                                                                          | Boundary retained                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Record copies        | `copyLocalJson` validates and produces immutable JSON without computing a discarded SHA. App, host and controller copy helpers use it.                                  | Accessors, cycles, lossy values, prototype-like own keys, depth, nodes, characters and encoded size are checked.                          |
| Canonical encoding   | Private weak metadata reuses checked roots and substantial immutable subtrees. Short review tuples do not each allocate cache metadata. Arrays need no key sort.        | Canonical stored strings and SHA-256 remain byte-compatible. Raw caller objects are never trusted because they are frozen.                |
| Stored JSON          | Handle-local LRU, at most 4,096 entries and 8 Mi UTF-16 characters of retained canonical text.                                                                          | A hit requires exact text **and** digest. This is a text budget, not an assertion about total heap bytes.                                 |
| Journal reads        | Reuse parsed operations and an admitted replica when policy and every operation match. Feed additions through the existing planner. Rebuild after changed/deleted rows. | Every storage read still checks current policy, persisted projection and actor state. Revision numbers alone never authorize a cache hit. |
| Read-only planning   | Genuine replicas return immediately for empty or duplicate delivery after authority/input checks.                                                                       | Foreign owners, stale sessions, forged handles and changed duplicate identities still fail.                                               |
| Derived views        | Weakly cache note, reading, source, exam, assessment and learning views, plus a shared operation index.                                                                 | Only a planner-owned handle can reach reuse. New replicas derive new views.                                                               |
| Launch               | Independent validator imports overlap.                                                                                                                                  | All validators settle before ownership, record admission and ordered recovery. Failure text and protection remain.                        |
| Deep search          | 80 ms coalescing instead of 320 ms; redraws do not restart an unchanged pending query. Composition pauses deep dispatch.                                                | One active request, one replaceable pending query, generation/current-query checks; existing core/exact lookup and rendering retained.    |
| Offline installation | Four complete fetch/verify/cache lanes. Identity is written after all required writes. Drain in-flight lanes before failure cleanup.                                    | Entire promised offline core, content hashes, old working cache and waiting-worker activation rules retained.                             |
| Optional warming     | Article queue observes input, gestures, visibility, idle callbacks and departure. Font warming receives bounded activity notifications.                                 | Required installation, demanded content and durable writes are not cancelled. Article warming remains one request at a time.              |

## Frontend scope

A TypeScript AST comparison of the top-level functions in `corridor.js` against the base found 990 unchanged functions. The only changed existing functions are `boot`, `departArticlePrefetch`, `prefetchArticles`, `dispatchQueuedDictionarySearch` and `requestDictionarySearch`. Two activity-scheduling functions and IME listeners were added. The generated installed-version constant changes through the normal release preparation command.

No HTML, CSS, render functions, public/private deck player, card controls, navigation functions, content, domain scheduler or FSRS pin changed. This is source evidence, not a screenshot or physical-device check.

## Verification

- Workspace typechecks, lint, formatting and `release:verify` pass.
- Focused backend run: 362 tests pass, including real SQLite abort/retry, commit-acknowledgement loss, SIGKILL/reopen, restore and ownership isolation.
- Full local Vitest: non-browser tests pass. IndexedDB and restore browser fixtures cannot launch because the pinned Chromium/WebKit binaries are unavailable after a failed browser download. These required suites and the complete release battery must run in CI; they have not been removed or relaxed.
- Added coverage exercises corrupted bytes after cache warmup, changed operation metadata, row removal, policy changes, repeated-subtree budgets, immutable view invalidation, IME/stale replies, validator ordering, input/visibility/departure pauses, install concurrency and incomplete-candidate cleanup.

The synthetic CPU diagnostic is reproducible with:

```sh
node scripts/benchmark-record-backend.mjs
node scripts/benchmark-record-backend.mjs --baseline /absolute/path/to/record-core.mjs
```

The canonical production diagnostic in `docs/build-evidence/backend-performance-2026-10-14/backend-benchmark-production.json` contains compiler identity, source hashes, bundle hashes, hardware, individual samples and limitations. Its current module SHA-256 exactly matches the staged production bundle (`3eafb3fecc0f769ee5a5073695d21a1a757336625516eaefdf1385efe0c928df`). The earlier `backend-benchmark.json` is retained as an initial, separately bundled diagnostic; the numbers below use the canonical production compiler settings. The baseline is the audited deployed 1.0.1 module with SHA-256 `257065eb60b2ed0cf8c1043d1e71764b8b9dc04977db830b61025854e26d2b9e`. The harness asserts canonical-byte and digest parity on every fixture.

For 10,000 synthetic review rows plus 10,000 observation rows, one local run measured cold encoding medians of 125.09 ms for that baseline and 104.13 ms for this implementation. Re-copying a wrapper around an already admitted immutable record measured approximately 0.002 ms; the baseline helper traversed and hashed it again. Such very short measurements are near timer resolution and demonstrate eliminated work, not a phone latency promise. Nine samples after one warmup provide medians and ranges, not reliable p95/p99 claims. These are CPU-only JSON fixtures, not full records or app interactions.

## Remaining architectural work

This patch does **not** make ordinary writes independent of total history: schema 1 still reads all scoped rows, whole-record/receipt integrity still has linear work, and additions still use the existing graph planner. Large initial loads continue to need validation. The operation cache retains the current journal; article bodies continue to accumulate as they did before. No stable long-session memory plateau is claimed.

The next storage release needs a versioned per-entity append protocol, checkpoint/legacy-digest verification, bounded worker command queues, explicit scope/session/revision messages, and crash/upgrade/rollback evidence. Public-deck grading is a separate localStorage backend and needs its own atomic adapter and migration/undo tests. Static cross-index generation and corpus sharding also remain separate work. These migrations must preserve learner history and pass real browser admission before publication; changing the version number does not satisfy that obligation.

Retaining the existing frontend also leaves its full-root rendering behavior in place. No claim is made that backend work alone eliminates every visible delay. End-to-end launch, grade, undo, lookup and long-session traces on the target phone remain necessary to establish the requested experience.
