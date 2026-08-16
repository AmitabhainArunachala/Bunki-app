# PR #70 reconciliation — donor audit and disposition

Date: 2026-08-15
Purpose: make the deliberate PR #70 reconciliation visible to Claude and every
other remote agent working on PR #72.

## Audited revisions

- PR #70 donor branch: `agent/kairo-one-prototype-2026-08-10`
- Donor merge base: `4270855256aee55794681ed4f1f68e3f4db511dc`
- Donor head: `aaf51bdcb812955654b4c46261090ac518b5bca8`
- Donor-only commits, in order:
  - `ffa725db0bcca527ea16f737dadbf3705a256dbe` — finite FSRS review and the Codex Drift rebuild
  - `015421531f74760b74b594218a771c6ef9ff4d50` — one-prototype learner flow, dictionary tier, lesson, and storage work
  - `dc9839165109d785e2b67d16cf23d5ea1ad4b0d3` — Drift gesture-verifier hardening
  - `aaf51bdcb812955654b4c46261090ac518b5bca8` — chained constellation layout fix
- Integration baseline: `b5124438849a2a26ad801396e0c32bfc02142349`
  (PR #71 writing-room head).
- Integration head audited locally: `c8ceb73e9524678d05e3f37fb5d87343adb22c9d`
  (PR #72 after the quiet-room integration and atomic stroke-number fix).
- Reported remote integration head at audit time: `726598e2`.

The later contrast-verifier-only heads (`d077dbb` locally / `8b38f3f` remotely)
do not touch any PR #70 runtime path and therefore do not change this
classification.

The PR #70 range changes 89 paths. Against both `b512443` and `c8ceb73`, the
classification is identical: 25 byte-identical files already harvested, seven
donor files absent, 52 files present but evolved differently, and five old
screenshots deleted by PR #70 but retained on the integration line.

The 25 byte-identical files are the 17 files under
`prototypes/corridor/data/share_alike/dict-v2/` (`00.json`–`0f.json` plus
`index.json`), and these eight files:

- `prototypes/corridor/data/proprietary_safe/sem.json`
- `prototypes/corridor/data/share_alike/dict.json`
- `prototypes/corridor/dictionary-worker.js`
- `prototypes/corridor/tools/build-dictionary-v2.mjs`
- `prototypes/corridor/tools/build_dictionary.mjs`
- `prototypes/drift/tools/sem_expand.py`
- `prototypes/drift/tools/verify-storage-integrity.mjs`
- `prototypes/drift/tools/verify-v11.mjs`

The seven absent files are the two lesson sources
`data/original/lessons-v1.json` and `tools/verify-lessons.mjs`, plus five
historical screenshots: `03c-word-relations-room.png`, `05-review-room.png`,
`11b-stroke-room.png`, `23-guided-path.png`, and `24-first-lesson.png`.

## Decision: do not cherry-pick PR #70

PR #70 is a mixed donor, not a compatible branch. Its dictionary bytes and
several integrity fixes are already present; its review engine predates the
integration line's FSRS learning/relearning steps, daily new-card cap, fuzz,
undo, append-only revlog, cloze cards, filtered review, zen room, and review
trace (`25faa11`, `7684f5d`, `07d52ec`, `2b211f0`, `898cd52`, `cc947f1`,
`00e38e9`). Its Drift layout and word-relations room also conflict with the
operator-selected trunk. Generated standalone HTML, reports, and all 45 changed
screenshots are historical evidence, not merge inputs.

Therefore: **no PR #70 commit or large file is to be cherry-picked.** Only the
small verifier hardening below is safe for PR #72. The learner-state work is a
separate migration with dedicated fixtures and failure-path tests.

## Safe now in PR #72

### Port only `aimWord` verifier hardening

Donor `dc983916`,
`prototypes/corridor/tools/verify-drift-consistency.mjs`, adds `aimWord`. It
waits for the intended word, required `.bsat`/`.bctr` and gloss state, stable
coordinates, visible/interactable geometry, and actual hit ownership through
`document.elementFromPoint`. The current verifier still snapshots coordinates
and taps them later. Porting this helper and its call-site substitutions is
test-only and does not change product feel or learner state.

No other PR #70 behavior should enter PR #72.

## Why `aaf51bd` is not applicable to current Drift

The line is textually absent, but the defect and layout engine it repaired are
also absent.

- Donor `aaf51bd`, `drift-layer.js:1098-1172`, computes the next bloom origin as
  `n.wref.wx + n.wref.ox` / `wy + oy` before calling the donor-only
  `prepareBloomLayout` and `placeBloom` safe-body clamping engine.
- That engine could collapse several clamped targets onto one corner when a
  promoted satellite's corpus home was off-screen. The donor's new geometry
  probes assert that clamped, non-overlapping layout.
- Current `c8ceb73`, `drift-layer.js:2543-2552`, instead recomputes the live
  anchor from `focusN.x/y` every frame and retargets every satellite around it.
  Current `drift-layer.js:1061-1067` intentionally glides the camera toward the
  corpus anchor. There is no `prepareBloomLayout` or `placeBloom` to fix.
- The committed current Drift report records passing satellite re-centres and
  all three chain hops.

Do not copy the `wx + ox` patch or the donor geometry probes into PR #72. A
future Drift-only feel experiment may test live-position distance tie-breaking,
but it must preserve the current camera-glide grammar and be judged separately.

## Follow-up backlog — separate branch and tests required

These items are ordered by integrity risk. They must stay out of PR #72: mixing
them into a writing-room reconciliation could silently re-key cards, create
review debt, or partially persist learner actions.

### P0 — learner-state integrity

1. **Explicit lesson disposition and typed evidence.** Donor `0154215`,
   `data/original/lessons-v1.json` and `tools/verify-lessons.mjs`, defines an
   article-anchored grammar → canonical room → practice → kanji/strokes → Reader
   thread. Practice writes evidence only; Keep writes a thread only; Learn
   explicitly creates review debt; there is no default action. Current
   `c8ceb73:corridor.js:3401-3556` generates broad JLPT/漢検 lessons, but
   `3540-3545` pushes every lesson item into `S.taken` at completion. Preserve
   the current breadth; migrate the donor's disposition/evidence semantics and
   adapt its verifier instead of restoring the one old lesson wholesale.

2. **Review target identity and immutable answer snapshots.** Donor `0154215`,
   `corridor.js:4528-4570` (`reviewKey`, `sameLearningTarget`, contract IDs) and
   `4923-5035` (`wordReviewAnswer`, `learnTarget`), distinguishes a word by
   printed form plus encountered reading, aggregates prompt-indistinguishable
   homographs, and stores `entrySeq`, `cueReading`, and the answer snapshot.
   Current `c8ceb73:corridor.js:5415-5457` deduplicates by only `t + id`, stores
   deep answers under spelling only, `5576` keys FSRS as `type:id`, and
   `5738-5742` renders the answer with `lookup(item.id)`. This requires an
   explicit key/data migration; it is not a one-line fix.

3. **Evidence-honest grading and scheduler provenance.** Donor `ffa725d` plus
   `0154215`, `corridor.js:2956-2989`, separates “recalled, now reveal” from
   “could not recall”; the latter records/forces Again. Donor
   `corridor.js:4525-4647` stamps prompt and scheduler contracts, and
   `4755-4840` records reveal path, latency, submitted/effective grade, before
   and after memory, then rolls back on save failure. Current
   `c8ceb73:corridor.js:5985-6046` reveals and enables all four grades without a
   declared retrieval result, contract ID, reveal flag, or latency, and
   advances even when persistence fails. Extend the current revlog/FSRS engine;
   do not replace it with the donor engine.

4. **Deep store validation and transactional writes.** Donor `0154215`,
   `corridor.js:378-548`, validates captured rows, lists, review cards/history,
   learning threads/evidence, and observations before accepting a store. Its
   mutation paths restore prior state when `saveStore()` fails; donor
   `verify-corridor.mjs:1819+` probes malformed/future payloads and rollback.
   Current `c8ceb73:corridor.js:578-632` accepts shallow arrays/records (for
   example, `taken: [null]`), while `5415-5457` and `6017-6046` mutate then
   ignore a failed save. Build a current-schema validator and transactional
   mutation helper, with malformed, future-version, quota, and rollback tests.

### P1 — controlled migrations and cross-surface state

1. **No-debt legacy list migration.** Donor `ffa725d`,
   `corridor.js:2713-2843` and `4660-4672`, leaves old list rows cardless until
   the learner presses “start learning.” Current
   `c8ceb73:corridor.js:5661-5673` treats every `S.taken` row without `S.srs`
   as a fresh due card. Add an explicit promotion/migration marker; imports and
   legacy lists must not fabricate FSRS state.

2. **A bounded finite standard review plan.** Donor `ffa725d`,
   `corridor.js:4874-4903`, freezes at most 20 IDs and reports a deferred count.
   Current `c8ceb73:corridor.js:5725-5733` freezes all due items. Keep timed
   Focus's intentional refill behavior, but chunk ordinary Review explicitly.

3. **Drift judgment bridge into the learner observation log.** Donor `0154215`,
   `corridor.js:582-626` and `drift-layer.js:1865-1895`, writes a Drift
   familiar/fragile judgment to both stores and rolls the Drift store back if
   the host cannot synchronously persist the observation. Current Drift
   `c8ceb73:drift-layer.js:1706-1754` writes only `bunki-drift-v1`; current
   corridor has `obsLog` but no `bunki:drift-judgment` listener. Add a
   current-native append-only observation; never turn it directly into an FSRS
   grade.

### P2 — performance/harness follow-up

1. **Remove Drift recycler polling only after an interaction audit.** Donor
   `ffa725d`, `drift-layer.js:938-972` and `3018`, gates `refreshActive` on
   camera/phase/viewport change and checks from the frame loop. Current
   `c8ceb73:drift-layer.js:2980-2981` retains a 650 ms interval. The change has
   battery value but must cover every path currently relying on the poll.

## Deliberately conflicting or historical donor work

- The PR #70 Drift motion/layout/shell/hint rewrite and `aaf51bd` clamped
  geometry probes conflict with the selected camera-glide Drift.
- The PR #70 word-relations room conflicts with the current paper 類語辞典 and
  search weave (`e005f3d`, `49627f4`); the JMdict relation data is already on
  word sheets.
- PR #70's `index.html` title/description is deliberately not adopted.
- `corridor-standalone.html`, generated manifests/reports, old review tests, and
  all changed screenshots describe the donor snapshot and must not overwrite
  current generated evidence.

This disposition refines, rather than reverses,
`docs/briefs/HARVEST_LEDGER_2026-08-11.md`: the donor's valuable deferred
semantics are now named as a bounded migration backlog, while PR #72 stays safe.
