# Bunki End-to-End Goal Ledger

**Schema:** human-readable companion to
`docs/goal/BUNKI_END_TO_END_GOAL_STATE.json`  
**Snapshot date:** 2026-07-29  
**Repository:** `AmitabhainArunachala/Bunki-app`  
**State:** `ACTIVE` for F02

## Plain outcome

John selected the full Bunki end-to-end autonomous controller and instructed:
“Publish G00 and start.”

G00 is human-merged and governs execution. F02 is the first bounded code child:
close the export test server’s root-containment defect without changing Bunki
product behavior, dependencies, data, providers, or release state.

## Bootstrap receipt

- PR #15 was human-merged at 2026-07-29T10:43:47Z.
- Reviewed PR #15 head:
  `29e2fa46020c3dd2a4d32f7acc8b6764ebb1deea`
- Resulting `main`:
  `307ddc222ee63e2b8a9b66627a2591f55493a847`
- PR #15 makes the unresolved-save warning truthful.
- PR #15 does not retry, reconcile, or recover an uncertain write.
- Real idempotent reconciliation remains F06 in the selected controller.
- G00 PR #16 was human-merged at 2026-07-29T11:17:14Z.
- Reviewed G00 head:
  `6387917e37096fe9ebde816d0b42b950187ca135`
- Resulting `main`:
  `c4e1662dfffae362462e6cf42e53e9647c9c80f4`
- Comparing the reviewed head to the merge reports one merge commit and zero
  changed files, so the human-merged tree is exactly the admitted G00 tree.

## Selected controller

- Repository path:
  `docs/prompts/BUNKI_END_TO_END_ONE_LONG_GOAL_2026-07-29.md`
- G00 input SHA-256:
  `6e7449149efb0fb60c8475809f451e6faecdfeb83e830e96f26f6ca04e9bcbb7`
- Product-completeness falsifier: PASS.
- Autonomous-controller falsifier: PASS.
- The Product Lock and frozen specifications remain higher authority.
- The older whole-product controller remains historical evidence and is
  superseded only for sequencing after human merge of G00.

## G00 child contract

**Child:** `G00.1`  
**Base:** `main@307ddc222ee63e2b8a9b66627a2591f55493a847`  
**Branch:** `agent/bunki-g00-end-to-end-controller`  
**Writer:** one Integrator  
**Merge authority:** John only

Allowed paths:

1. `docs/prompts/BUNKI_END_TO_END_ONE_LONG_GOAL_2026-07-29.md`
2. `docs/prompts/BUNKI_CONTROLLER_SUPERSESSION_2026-07-29.md`
3. `docs/goal/BUNKI_END_TO_END_GOAL_STATE.json`
4. `docs/goal/BUNKI_END_TO_END_GOAL_LEDGER.md`
5. `docs/goal/BUNKI_OPERATOR_VISUAL_REFERENCES.json`
6. `docs/goal/decisions/ADR-000-G00-CONTROLLER-ADMISSION.md`
7. `docs/operator/BUNKI_OPERATOR_LOCK_INTEGRITY_SHA256_2026-07-29.txt`

Non-goals:

- no application or test changes;
- no frozen-specification edits;
- no branch harvesting;
- no provider, source, data, sync, Apple, or license choice;
- no merge, deployment, or release; and
- no claim that Bunki implementation is complete.

## G00 closure receipt

- PR: `#16`
- State: `MERGED`
- Exact reviewed head:
  `6387917e37096fe9ebde816d0b42b950187ca135`
- Human merge:
  `c4e1662dfffae362462e6cf42e53e9647c9c80f4`
- Exact-tree equivalence: PASS; zero file differences from reviewed head to
  merge commit.
- Exact-head CI: PASS.
- Independent governance/admission review: PASS, no P0/P1.
- Independent product/autonomy review: PASS, no P0/P1.
- Open Bunki PRs before F02 branch creation: zero.

## F02.1 child contract

**Milestone:** `F02`  
**Child:** `F02.1`  
**Base:** `main@c4e1662dfffae362462e6cf42e53e9647c9c80f4`  
**Branch:** `agent/bunki-f02-export-server-containment`  
**Writer:** one Integrator  
**Merge authority:** John only

Allowed paths:

1. `apps/app/e2e/support/export-server.ts`
2. `apps/app/test/export-server.test.ts`
3. `docs/goal/BUNKI_END_TO_END_GOAL_STATE.json`
4. `docs/goal/BUNKI_END_TO_END_GOAL_LEDGER.md`

Observed defect:

- `resolveFile` decodes the request path and passes it to `join(dist, clean)`
  without first proving containment.
- A plain or percent-encoded `..` path can resolve outside `dist` and be read
  when the outside file exists.
- The old resolver can return a directory when its name has an extension,
  throws on malformed percent encoding, follows symlinks without proving their
  final target remains inside `dist`, and exposes absolute runner paths and
  filesystem errors in a 404 body.

Closure predicate:

- every candidate and its final real path remain inside the real export root;
- plain, percent-encoded, nested, slash-encoded, and backslash-encoded traversal
  fail closed;
- malformed encodings and NUL paths fail closed;
- symlink escape and directory-as-file attempts fail closed;
- absent files produce no arbitrary filesystem read or path disclosure;
- Expo’s not-found document is served with HTTP 404 rather than a false success;
- root, direct assets, extensionless HTML, directory indexes, query strings,
  and the existing word/kanji dynamic-route fallbacks still resolve;
- the loopback host returns a generic 404 for unsafe paths;
- focused adversarial tests cover the policy; and
- no dependency, production server, app route, dataset, schema, provider, or
  release behavior changes.

Focused verification:

```text
npx vitest run apps/app/test/export-server.test.ts
```

Full exact-head gate:

```text
npm run lint
npm run format:check
npm run typecheck
npm run test
npm run test:replay
npm run verify:export
npm run test:e2e:build
npm run test:e2e
sha256sum -c docs/operator/BUNKI_OPERATOR_LOCK_INTEGRITY_SHA256_2026-07-29.txt
```

Rollback is the four-file F02 delta only. Reverting the server and focused test
restores prior runtime behavior; the mutable state and ledger retain the honest
attempt and disposition.

Non-goals:

- no change to `apps/app/scripts/capture-evidence.mjs`; its analogous loopback
  traversal risk is recorded for a separate bounded internal-tool-hardening
  child rather than being silently treated as fixed here;
- no change to `scripts/measure-web-latency.mjs`; its independent loopback
  server also needs a separately bounded containment audit before F08;
- no change to the separately contained adversarial host; its lexical guard is
  retained as-is, and this child makes no claim about its symlink policy;
- no new shared server abstraction or package;
- no production hosting claim; and
- no harvesting of any divergent branch.

## Visual references

No operator screenshot bytes were available in the G00 publication context.
The manifest is initialized honestly as empty. New images must be appended with
their hash, received date, visible surface, actual evidence, accepted
preference/constraint, supersession state, and exact build/SHA when known.

## Evidence boundary

The checked-in state intentionally leaves the F02 PR number, final head SHA,
and exact-head verification fields null. Adding those after verification would
change the reviewed head. The draft PR body, checks, and review threads are the
post-freeze live overlay keyed to the exact candidate SHA.

The state, this ledger, and the visual-reference manifest are deliberately
mutable runtime evidence. Their G00 hashes are recorded as non-gating bootstrap
receipts in ADR-000; they are schema- and semantic-validated inside each active
child rather than frozen by the operator-lock integrity check.

## Next safe action

1. Create the F02 branch from exact merged `main`.
2. Publish only the four allowed files and fetch back every remote byte.
3. Run focused tests and the full repository CI ladder on the exact candidate
   head.
4. Obtain independent code/security and test/contract reviews.
5. Resolve every P0/P1 and rerun on any changed head.
6. Ask John to human-merge only the final verified F02 head.
