# Codex work order — re-baseline, re-land, then three deep missions (2026-08-12)

You are working in `AmitabhainArunachala/Bunki-app`. Your last delivery
(local commit `de14d558c1543583374381998ef90f6912a0ed47`, the 30 native
readings) is excellent content built on a **stale baseline**: your own
receipts say "first 40 index rows byte-identical to PR #69." The living
trunk is `claude/app-vision-next-steps-wei73a`, currently at
`ca07a8e5b1dc6d45ff70ad0feec3c7333285eff9`, roughly twenty substantive
commits past #69. Every file you modified has moved. Nothing you built is
lost — but the vehicle must change.

**Standing rules, non-negotiable:**

1. `claude/app-vision-next-steps-wei73a` is the ONLY integration branch.
   You never push to it, never merge into it, never open a PR against it.
   Each mission below lands on its OWN branch cut from `ca07a8e`, pushed
   to origin, reported, and harvested by the trunk keeper.
2. You do not modify `prototypes/corridor/corridor.js`,
   `prototypes/corridor/corridor.css`, `prototypes/corridor/tools/verify-corridor.mjs`,
   anything under `prototypes/drift/`, or `.github/workflows/pages-app.yml`.
   Where a mission needs app-side rendering, you deliver data + a written
   interface contract; the trunk keeper wires the UI. Exception: Mission 3
   may modify `prototypes/corridor/dictionary-worker.js` as specified.
3. Verify every claim against `ca07a8e`, not against #69, not against your
   memory. Your evidence culture is your best trait — keep it, but re-point
   it at the real baseline.
4. No content self-approval. Your 0/30 editorial gate on the native
   readings stays open until the operator reads them; carry the sidecar
   forward untouched.

**What changed since your baseline (read these before touching anything):**

- `data/articles/index.json`: five wikinews rows relabeled **CC BY 2.5**
  (bodies too); the three `real-*` classics now cite `bunki-v11-historical`;
  `sources.proprietary_safe` gained `snow-t15-t23` and `tanaka-corpus`
  records. Any regeneration must preserve all of this.
- `data/articles/archive/`: 694 minted wikinews bodies + a light
  `archive-index.json` (the 新聞アーカイブ stack; lazy-loaded, standalone
  excluded).
- `data/proprietary_safe/examples/`: a 45,276-sentence example bank
  (SNOW T15/T23 + Tanaka + wikinews; 16 fnv1a32(word)&15 index shards +
  23 sentence shards + manifest). Built by
  `prototypes/corridor/tools/build_examples.py`.
- `.github/workflows/pages-app.yml` carries a **fail-closed rights gate**:
  every index/archive row needs non-empty `pool/licence/attribution/source/file`,
  a `url` field (non-empty whenever the source registry record has a home
  URL), a `source` that resolves into the registry with a matching pool,
  and body↔index agreement on `pool/licence/attribution/url/source`.
  Your 30 articles must pass it or the deploy refuses.
- `corridor.js` gained: an append-only observation log, the yomi probe,
  the archive view, the bank loader, interactive sentence rendering with a
  tap circle (ふりがな → English → plain) and hold-for-definition,
  per-sentence reader pages, capture context scope, persisted dials
  (default furigana = タップで), click-driven activation (iOS
  pointercancel resilience), and a first-sense-wins gloss law.
- Suites: `tools/verify-corridor.mjs` = 116 checks,
  `tools/verify-corridor-accessibility.mjs` = 22, plus drift/storage/unit
  batteries. All must stay green on any branch you deliver.
- `tools/build-standalone.mjs` excludes `archive-index.json` and the
  examples bank. `corridor-standalone.html` is generated — regenerate,
  never hand-edit.

**Environment notes (verified working in this repo's toolchain):**
`pip install fugashi && pip install --no-deps jreadability`; `unidic-lite`
fails to wheel on Debian setuptools — download the sdist, extract, and put
the `unidic_lite` package dir on `PYTHONPATH` manually. `mwparserfromhell`
and `openpyxl` install cleanly. Run pipeline scripts with
`PYTHONPATH=corpus/src:<unidic dir>`. Prettier governs all JS/MD
(`npm run format:check` must pass).

---

## Mission 0 — preserve the evidence (five minutes)

Push `de14d55` exactly as it stands to `codex/native-readings-raw-20260812`.
Untouched — it is the archival record of your build. Do nothing else to it.

## Mission 1 — re-land the 30 native readings on the real trunk

Branch: `codex/native-readings-20260812` cut from `ca07a8e`.

Carry over from de14d55: the 30 article body JSONs, the source JSONL, the
editorial sidecar, the 497 append-only `words.json` records, your
`verify-native-readings.{py,mjs}`, and your evidence files. Then:

1. Register the articles' source in `sources.original` in
   `data/articles/index.json` (a named catalog record with name/licence/
   attribution/url — mirror how `bunki-wp9b-reading-catalog` is registered)
   and mirror the registration in `tools/build_articles.py` `SOURCES` so a
   regeneration cannot lose it.
2. Append the 30 index rows regenerated against the CURRENT index — your
   de14d55 index.json is unusable as-is because it predates the rights
   relabels and registry records. Every row and body must satisfy the
   rights-gate contract above (`pool: "original"`, non-empty licence/
   attribution, `url` field present, body agrees with row).
3. `words.json`: re-verify your 497 records against the trunk copy (it is
   unchanged since #69, so your append should apply cleanly — prove it:
   7,910 prior records value-identical and order-preserved).
4. Regenerate `corridor-standalone.html` with the CURRENT builder. Do not
   port your builder changes unless you can demonstrate the current one
   drops something of yours — if so, report the gap instead of patching.
5. Do NOT port your corridor.js / build_corridor.py changes. The current
   shelf renders whatever the index holds; if any of your 30 articles
   needs app behavior the trunk lacks, document it in the report — don't
   implement it.
6. Prove first-70 preservation **relative to ca07a8e**: the 40 curated
   rows/bodies byte-identical to the trunk's (NOT to #69's), archive index
   untouched, examples bank untouched.
7. Run the full battery and include the transcript: verify-corridor (116),
   accessibility (22), `npm test` (1645), `npm run verify:drift:fast`,
   `node prototypes/drift/tools/verify-storage-integrity.mjs` (9),
   `npm run format:check`, plus your own two verifiers, plus a local run
   of the rights-gate python (lift it verbatim from pages-app.yml).
8. Optional, flagged separately if done: rerun
   `tools/build_examples.py` so the 30 new articles donate sentences to
   the bank (the builder ingests minted bodies automatically). If you do:
   report coverage deltas and total size; keep the build deterministic.

## Mission 2 — JMdict sense honesty: carry the tags through

Branch: `codex/dict-sense-tags-20260812` cut from `ca07a8e`.

Context: the compact tiers strip JMdict sense metadata, so minor senses
stand bare — 半島's second sense showed as "Korea" with no [abbr] mark.
The display heuristic is fixed (first sense wins), but the data must carry
the truth.

1. Source of truth: the pinned JMdict via `corpus/sources/jmdict` (GitHub
   release asset, reachable). Inspect what `tools/build_dictionary.mjs`
   currently discards.
2. Extend the dict-v2 shards so each sense carries its JMdict tags: misc
   (abbr, arch, sens, uk, col, sl, derog, …), field (med, comp, …), and
   dialect. The shards are self-describing (`layout` key,
   `sharding.id = fnv1a32-ascii-seq-mask15`, 16 shards, schemaVersion) —
   bump schemaVersion, update the layout doc, keep byte-determinism
   (two runs → identical output).
3. Update `prototypes/corridor/dictionary-worker.js` (your one allowed
   app file) to validate and pass the new schema through. It currently
   hard-checks the sharding id and row shape — keep it fail-closed:
   old app + new shards, or new worker + old shards, must degrade
   loudly, not silently.
4. For the CORE tier (`data/share_alike/dict.json`), add a compact
   per-sense tag sidecar or inline field — your choice — but document
   the shape precisely.
5. Deliver `docs/briefs/DICT_TAGS_CONTRACT_2026-08-12.md`: the exact
   schema, the tag vocabulary with Japanese/English display names, and
   your recommended rendering rules (e.g. 〔略〕 chips on minor senses,
   [uk] informing kana-first display). The trunk keeper implements the
   rendering; your contract is the spec.
6. Regenerate all shards + dict.json; sizes reported; a verifier script
   (`tools/verify-dict-tags.mjs`) proving: every [abbr]/[sens] sense in
   the JMdict source is tagged in the output; 半島 sense 2 carries
   abbr+sens; zero rows lost vs the current build; determinism.
7. Battery: everything in Mission 1 step 7 (the app must keep working
   against the new shards through the updated worker — if any check
   fails because corridor.js validates the old schema, STOP, document
   the exact validator lines, and deliver the data + report; do not
   patch corridor.js).

## Mission 3 — the FSRS optimizer, ready before the data is

Branch: `codex/fsrs-optimizer-20260812` cut from `ca07a8e`.

The revlog was built for this. Layout (see `srsLogReview` in corridor.js):

    [t(ms), key, g, stBefore, elapsedDays, r, sBefore, dBefore, sAfter, dAfter, ivlDays, dueAfter(ms)]
    g: 1 Again · 2 Hard · 3 Good · 4 Easy; g=0 is a revocation row
    [t, key, 0, revokedIndex] — the revoked row must be excluded from
    training, and rows after an undo re-grade the same card.

Engine: vendored `ts-fsrs` v5.4.1 (`vendor/ts-fsrs.mjs`), pin
`data/fsrs-pin.json` (`bunki-fsrs6-r090-defaults-v1`, retention 0.90).

Deliver `tools/fsrs-optimize.mjs`, standalone, node-only:

1. Input: an exported envelope JSON (the 書き出す file). Reconstructs
   per-card (elapsed, rating) sequences from the revlog, honoring
   revocations and the short-term/same-day semantics FSRS-6 defines.
2. Fits the FSRS-6 weight vector (your choice of optimizer — full
   gradient descent on the FSRS loss, or a faithful port of the
   reference py-fsrs/fsrs-rs procedure; cite which and why).
3. Outputs: optimized weights, log-loss + calibration (predicted vs
   observed retention in bins) before/after, a minimum-data guard
   (refuse to emit weights under N=400 reviews with a clear message —
   state your chosen N with a citation), and a dry-run report format the
   operator can read.
4. Emits a candidate `data/fsrs-pin.json` with a NEW parameterSetId
   (`bunki-fsrs6-r090-personal-v1`) — emitted to stdout/file, never
   written into data/ by the tool itself.
5. Tests: synthetic revlog fixtures with known-good expected behavior
   (e.g. a simulated learner with true retention 0.85 → fitted weights
   predict better than defaults), revocation handling, determinism.
   Wire them so `npm test` picks them up without touching existing
   configs beyond an include if needed.

## Mission 4 (capacity permitting) — nightly CI for the battery

Branch: `codex/nightly-verify-20260812` cut from `ca07a8e`.

New workflow `.github/workflows/nightly-verify.yml` (do NOT touch
pages-app.yml): on `workflow_dispatch` + nightly cron + push to
`claude/app-vision-next-steps-wei73a`, run the full battery
(verify-corridor, accessibility, storage-integrity, drift fast, `npm
test`, `format:check`) on ubuntu with Playwright chromium, uploading
screenshots/reports as artifacts on failure. Mind the runners: the
corridor suite serves its own static server and needs no network beyond
npm/playwright installs.

---

## Report format (per mission)

Branch name · commit SHA · what changed (files added/modified/removed) ·
verification transcript with counts · deltas vs `ca07a8e` proven
byte-level where claimed · open gates honestly listed · anything you
chose NOT to do and why. No PRs. No merges. The trunk keeper harvests.

If any instruction here contradicts what you find in the repo at
`ca07a8e`, trust the repo, do the smaller safe thing, and put the
contradiction at the top of your report.
