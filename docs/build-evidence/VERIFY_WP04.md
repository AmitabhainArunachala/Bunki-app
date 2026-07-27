# WP-04 verification record (V3) — workflow wf_a1d7b3f2-694


---

## Round 1 — verdict: PASS

- **P2** — CAPSULE.md line 255 states "199 field→provenance pairs" as the evidence for the REQ-SRC-01 predicate. The actual count is 224. The loader's own key lists give 16 lexemes x 5 (LEXEME_KEYS) + 10 kanji x 9 (KANJI_KEYS) + 3 grammar x 5 (GRAMMAR_KEYS) + 8 sentences x 4 (SENTENCE_KEYS) + 1 passage x 7 (PASSAGE_KEYS) = 80+90+15+32+7 = 224. No test asserts the total, so nothing caught the miscount. The predicate itself is met (I independently confirmed all 224 fields resolve to complete provenance records); only the number in the audit record is wrong.
  - fix: Correct 199 to 224 in the CAPSULE.md WP-04 predicate table. Optionally add an assertion in packages/seed/test/provenance.test.ts that counts resolved provenance entries and pins the total, so the capsule figure becomes test-backed rather than hand-tallied.
- **P2** — Controller §8 names JMdict/KANJIDIC2 (EDRDG) and Tatoeba as the intended sources for lexeme/kanji/sentence content; none of that content ships. Readings, senses, parts of speech and kanji meanings are hand-written and labelled bunki-editorial / review_status "unreviewed" / confidence "medium" / source_entry_id null. I independently reproduced the cause: www.edrdg.org, www.csse.monash.edu.au and tatoeba.org all return `curl: (56) CONNECT tunnel failed, response 403` from this environment's egress proxy, so the deferral is environment-forced and not a builder shortcut. This is the reason the LICENSES.md predicate item is only "partial", and it leaves WP-05 consuming lexical content that no dictionary has confirmed.
  - fix: Operator action to close: allow www.edrdg.org + ftp.edrdg.org and tatoeba.org + downloads.tatoeba.org through the egress policy, then re-run WP-04's source pass to flip the affected fields from bunki-editorial to an EDRDG source with real ent_seq values in source_entry_id. Until then, WP-05 must render SEED_ENTRY_DISCLOSURE on every word/kanji page, not only on empty-search states — that string is the only thing preventing unreviewed lexical claims from reading as dictionary truth.
- **P2** — The WP-04 diff touches root package-lock.json (16 lines), which is outside the packages/seed/ surface lock held by B3 in W2. It is the mechanical projection of two devDependency entries added to packages/seed/package.json, and npm workspaces keep a single root lockfile, so it is unavoidable; the builder disclosed it as a coordination note. The residual risk is a merge collision: B2 (WP-02) is building in the same wave and any dependency it declares will conflict in the same file.
  - fix: No change to the branch. Orchestration spec §4 puts lockfiles explicitly in INT's remit as mechanical conflict resolution, so INT should regenerate the lockfile after merging WP-02 and WP-04 rather than resolving hunks by hand, and CON should note the shared-file exception in the W2 surface lock table so the next wave's builders do not read the lock as absolute.
- **P2** — Passed through from the builder's own coordination request, confirmed by inspection: eslint.config.mjs declares Node globals with `files: ['scripts/**/*.mjs', …]`, a root-only glob that does not reach packages/*/scripts/*.mjs. As a result packages/seed/scripts/fetch-kanjivg.mjs needs a local `/* global … */` comment to lint clean. eslint.config.mjs is WP-01's surface so B3 correctly requested rather than edited it.
  - fix: WP-01 owner widens the Node-globals glob to include packages/*/scripts/**/*.mjs, after which the local /* global */ declaration in fetch-kanjivg.mjs can be removed.

### Full report

# V3 Verification Report — WP-04 (Licensed seed data, field provenance, truth labels)

**Builder:** B3 · **Branch:** `agent/bunki-phase0-closed-loop-wp04` · **SHA:** `fdcfddd665306470a2666e1e3ca7eb30bcd9d08b`
**Base:** `origin/agent/bunki-phase0-integration` @ `f53ce4bd91dccd4cf7587b8b1bd2f5fff6fe6ca4`
**Verifier:** V3, read-only. Nothing committed, nothing pushed.

## Verdict: PASS — zero P0, zero P1, four P2

Every closure-predicate item in controller §18 WP-04 is met for what actually ships. The one item B3 self-reported as "partial" (LICENSES.md) is partial only with respect to sources from which **no content ships**, which I confirmed independently rather than taking on trust.

---

## Step 1 — integrity, done first

All five binding documents re-hashed against `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt` before any other action. All match, including the controller at `de7b6fcc…` and the launcher at `b0a6811d…`. No mismatch, no stop trigger.

## Clean-checkout reproduction

Fresh clone, `git checkout fdcfddd…`, clean tree, `npm ci` exit 0 (703 packages). `git merge-base --is-ancestor` confirms the declared stacking on `f53ce4b` is real, not asserted — matching the STACKING NOTE, and recorded in the capsule's "Branch stacking" section as required.

| §17.5 check | Result |
|---|---|
| `npm run lint` | PASS, 0 problems |
| `npm run format:check` | PASS |
| `npm run typecheck` | PASS — 7 invocations (root + 6/6 workspaces), 0 errors |
| `npm run test` | PASS — 11 files, **124/124** (87 from `packages/seed`) |
| `npm run test:e2e` | exit 0, but it is the WP-01 placeholder that prints *"NOT A PASSING TEST SUITE"* — disclosed in the capsule, not a WP-04 defect |
| `npx expo export --platform web` | PASS — 3 static routes, `Exported: dist` |

Every number B3 reported reproduced exactly.

## §8 dataset — walked line by line

| §8 requirement | Required | Found | |
|---|---|---|---|
| Lexemes | 12–20 | 16 | ok |
| Kanji incl. 分 and 岐 (OD-02) | 8–12 | 10 — 分 岐 点 路 線 道 車 駅 自 部 | ok |
| Grammar constructions | 2–3 | 3, each attested by a sentence | ok |
| Example sentences | 6–10 | 8 | ok |
| KanjiVG stroke SVGs | for the seed kanji | 10, one per kanji | ok |
| Thematic integration passage | exactly one, ~100–200 chars, embeds the default target, own provenance record | 1 — `pas-bunki-01`「分かれた道」, **160 chars**, contains 分岐 at index 43, `bunki-authored-text` / `modification_status: original` | ok |

## Provenance — verified twice, independently of the builder's loader

I wrote my own walker over the raw JSON rather than reusing `validate.ts`. Result: **224** field→provenance pairs, every one resolving to a record with all seven REQ-SRC-01 fields present and non-empty; zero unprovenanced fields, zero stray provenance keys, zero attempts to override the non-overridable five.

I also hand-inspected five records (`lex-bunki`, `lex-jibun`, `kanji-05206` 分, `kanji-05c90` 岐, `kanji-099c5` 駅, plus `gram-kadouka`, `sen-03`, `pas-bunki-01`). The per-field override mechanism is used correctly: KanjiVG fields carry `source_entry_id: "kanji/XXXXX.svg"`, lexical claims carry `source_entry_id: null` rather than an invented `ent_seq`.

The design is genuinely fail-closed. `validate.ts` rejects in **both** directions — a field with no provenance entry *and* a provenance entry for a field that does not exist — and `index.ts::expectDataKeys` asserts each record's data keys are *exactly* the loader's expected set, so a new field cannot be smuggled in unprovenanced.

## KanjiVG — re-fetched from the primary source, not trusted

I re-fetched all ten SVGs plus `README.md` and `COPYING` from `raw.githubusercontent.com/KanjiVG/kanjivg` at the pinned commit `61e39cf`:

- **All 10 SVGs byte-identical** to the committed copies (`cmp`: 10 identical, 0 differ).
- `README.md` → `aae5625e…` and `COPYING` → `d255e079…`, both exactly as LICENSES.md claims; the shipped `licenses/KanjiVG-COPYING.txt` is byte-identical to upstream at the stated 20,595 bytes.
- **Every one of the 10 digests in the §1.5 table matches my own fetch.**
- 分 and 岐 SVG headers carry the intact upstream *"Copyright (C) 2009/2010/2011 Ulrich Apel… Attribution-Share Alike 3.0… (http://kanjivg.tagaini.net)"* notice. Real KanjiVG files, no hand-drawn or generated strokes.

I went further and **re-derived** `strokeCount`, `components` and `radicals` from the *upstream-fetched* bytes rather than the committed ones. All ten kanji match; every claimed radical and component traces to a `kvg:element` in the source. Nothing was fabricated and then rubber-stamped by a self-referential test.

## Adversarial probes — the tests actually bite

Seven mutations, each reverted, tree verified back to its original digests:

| Mutation | Outcome |
|---|---|
| Delete `lex-bunki.senses` provenance entry | RED — 4 seed test files fail at import |
| Flip one path coordinate in 岐 (`M25.76`→`M75.76`) | RED — digest assertion, exactly 1 failure |
| Falsify 分 `strokeCount` 4→5 | RED — re-derivation disagrees |
| Truncate the passage below 100 chars | RED — 2 failures |
| Relabel `bunki-editorial` source as JMdict | RED — honesty test |
| Strip the KanjiVG copyright header | RED — 2 failures |
| Delete 岐 from the kanji set | RED — OD-02 fixture test + 3 more |

## Licensing hygiene and §21.3(3)

**No scraped or unlicensed content.** The only third-party asset is KanjiVG, verified above. I confirmed the EDRDG/Tatoeba deferral is real by probing the hosts myself — `www.edrdg.org`, `www.csse.monash.edu.au` and `tatoeba.org` all return `curl: (56) CONNECT tunnel failed, response 403`. This is an egress-policy denial, which per `/root/.ccr/README.md` is to be reported, not routed around.

`grep` across `data/` finds no field claiming JMdict, KANJIDIC2, EDRDG or Tatoeba — the only mentions are `_comment` strings explaining why those sources are *not* used, and my probe confirmed `dataset.test.ts` fails if that ever changes.

**Controller §21.3(3) is correctly not triggered.** The trigger is *unresolved source licensing entering fixtures or product data*. No EDRDG or Tatoeba asset is present to be unresolved. B3 faced a real fork — ship third-party redistributions labelled EDRDG with licence text written from memory, or ship nothing from those sources and label the content honestly — and took the second. That is the right call: the first would have manufactured the exact audit trail this work package exists to make trustworthy, and would itself have tripped §21.3(3).

REQ-GATE-03 grep is clean; the only near-hit is the compliant `SEED_COVERAGE_DISCLOSURE`.

## Surface discipline

`git diff --stat f53ce4b..HEAD` = 33 files, 3956 insertions: `packages/seed/**` + `docs/build-evidence/CAPSULE.md` + root `package-lock.json`. The lockfile is 16 lines, exactly the two devDependency entries plus the `zod` resolution and nothing else — the unavoidable projection of an in-surface manifest edit under npm workspaces, and explicitly INT's remit per orchestration spec §4. All six commits use the required `WP04(B3): <predicate>` form. No frozen doc, no other WP's surface, no CI, no `eslint.config.mjs`. Capsule diff is **134 insertions, 0 deletions** — a pure append. Secrets scan clean.

---

## Findings

### P2-1 — Capsule field count is wrong (199 vs 224)
`CAPSULE.md:255` claims "199 field→provenance pairs". The real figure from the loader's own key lists is **224** (16×5 + 10×9 + 3×5 + 8×4 + 1×7). No test pins the total, so nothing caught it. The predicate is met — I verified all 224 — but the audit record misstates its own evidence.
**Fix:** correct the number; optionally assert the total in `provenance.test.ts` so the capsule figure becomes test-backed.

### P2-2 — EDRDG/Tatoeba content deferred (D-1/D-2), operator action required
Controller §8's named canonical sources contribute nothing; lexical claims are hand-written and labelled `bunki-editorial` / `unreviewed` / `medium` / `source_entry_id: null`. Environment-forced, fully disclosed in three places, and enforced by tests — but it leaves WP-05 rendering lexical content no dictionary has confirmed.
**Fix:** operator allows the EDRDG and Tatoeba hosts through egress, then re-run WP-04's source pass. **Until then, WP-05 must surface `SEED_ENTRY_DISCLOSURE` on every word/kanji page, not only on empty-search states** — that string is the only thing keeping unreviewed claims from reading as dictionary truth.

### P2-3 — `package-lock.json` touched outside the surface lock
Mechanically unavoidable and disclosed. Residual risk is a merge collision with B2 (WP-02), building in the same wave.
**Fix:** INT regenerates the lockfile after merging both rather than resolving hunks by hand; CON notes the shared-file exception in the W2 lock table.

### P2-4 — ESLint Node-globals glob is root-only (passed through from B3)
`files: ['scripts/**/*.mjs', …]` does not reach `packages/*/scripts/*.mjs`, forcing a local `/* global … */` in `fetch-kanjivg.mjs`. B3 correctly requested rather than edited WP-01's surface.
**Fix:** WP-01 owner widens the glob to `packages/*/scripts/**/*.mjs`.

---

## Note on the verification record

My role card (orchestration §4) specifies output at `docs/build-evidence/VERIFY_WP04.md`, but my launch instructions make me read-only with nothing committed or pushed. This report is returned to CON for filing rather than written to the branch.

## Recommendation

**Merge-ready.** No P0 or P1. The four P2s are one factual correction to the capsule, one operator gate, and two coordination items owned by INT and WP-01 — none blocks WP-04's closure, and none requires B3 to touch code. D-1/D-2 should be carried forward as open items into WP-05's brief, since WP-05 is where the honest-labelling obligation becomes user-visible.
