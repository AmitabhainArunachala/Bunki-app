# WP-05 verification record (V5) — wf_5714bcc8-a2c


---

## Round 1 — verdict: FAIL

- **P1** — Ruby/furigana pieces are NOT hidden from the accessibility tree on the Phase-0 target runtime (Expo Web), contradicting an explicit claim in the code and in the capsule. apps/app/src/ui/ruby.tsx sets importantForAccessibility="no" on both Text pieces of every ruby segment; that prop is Android/iOS-only and react-native-web has no handler for it (node_modules/react-native-web/src/modules/forwardedProps/index.js forwards 'aria-hidden' and nothing named importantForAccessibility or accessibilityElementsHidden). Verified empirically against the committed expo export via CDP Accessibility.getFullAXTree: on /word/lex-wakareru the container is role=generic name="分かれる（わかれる）" and its descendants are exposed, non-ignored StaticText nodes in DOM order わ / 分 / 　 / かれる — i.e. reading and written form interleaved, which is exactly what the ruby.tsx header says is prevented ("the pieces are hidden from the accessibility tree, so a screen reader says the word and its reading once instead of interleaving them"), and what the CAPSULE predicate row asserts ("One spoken label per word, visual pieces hidden from the a11y tree"). Two aggravating details: (a) the opacity:0 ideographic-space placeholder (ruby.tsx line 79, segment.ruby ?? '　') is still an exposed StaticText, so an empty ruby slot is announced as content; (b) the intended single label sits on a role=generic container, where aria-label is not a valid ARIA naming target and is commonly dropped by AT — so the correct label may be lost while the interleaved pieces are read. REQ-UI-09 states screen-reader labels are "requirements, not polish", and REQ-ARCH-01 makes Expo Web the Phase-0 target runtime. No test catches this because the suite has no renderer.
  - fix: In apps/app/src/ui/ruby.tsx replace importantForAccessibility="no" on both inner <Text> elements with a prop react-native-web actually forwards — aria-hidden (RN >=0.71 maps aria-hidden on native too, so one prop covers both targets) — and give the outer View accessibilityRole="text" so the single label is announced from a leaf rather than a generic. Render the empty-ruby placeholder as a sized spacer View instead of an opacity-0 '　' Text so nothing empty reaches the a11y tree. Then add a renderer-free regression guard or a CDP assertion in the evidence harness that the exposed AX subtree under a RubyText contains exactly one named node, and correct the ruby.tsx header and the CAPSULE predicate row to state what was actually verified.
- **P1** — The capture and word screens render a false statement about the event log whenever an uncertainty mark is applied AFTER Keep. capture-screen.tsx lines 366-368 always render "The event log records that a mark exists; which dimension you chose is kept on this device only and is not exported (deferred item WP05-D2)." and word-screen.tsx line 236 renders "...the log records that a mark exists, not which one". But markUncertainty writes no event at all (memory-store.ts applyMarkUncertainty returns events: [], asserted by capture-flow.test.ts "stays editable after capture and writes no event when edited"), and uncertaintyMark is only ever set on the EncounterCaptured event at capture time (memory-store.ts line 174). Reproduced live against the committed expo export: search 分岐 -> Keep with no chip selected -> tap the "reading" chip. The screen then simultaneously shows the selected chip, the thread row "keep · uncertain: reading", the acknowledgment "2 event(s): EncounterCaptured, ThreadPromotionChanged" (no uncertaintyMark anywhere in the log), and the sentence claiming the log records that a mark exists. Screenshot at /tmp/claude-0/-home-user-Bunki-app/ad73754c-c068-5162-8e62-5a7eda022b57/scratchpad/v5-shots/mark-after-keep.png. The user is told the fact of their mark is durable and exportable when in that path the entire mark — fact and dimension — is lost. This is the REQ-GATE-03 / P0-CAP-15 honesty class the work package is judged on, and deferred item WP05-D2 understates the loss by describing only the dimension as app-local.
  - fix: Make the sentence conditional on what actually happened to the log: derive it from the acknowledgment/thread (e.g. thread.uncertainty.markedAtCapture), rendering "The event log records that a mark exists; the dimension is kept on this device only" when the mark was on the captured event, and "This mark is on this device only — it is not in the event log and will not be exported" when it was applied after Keep. Apply the same conditional to word-screen.tsx line 236. Widen WP05-D2 in apps/app/src/state/deferred.ts and the CAPSULE deferred table to record that a post-capture mark reaches the log in no form at all. Add a capture-flow.test.ts case asserting that a capture with uncertainty: null followed by markUncertainty leaves no uncertaintyMark in readAll().
- **P2** — docs/build-evidence/screenshots-wp05/index.json declares shot 20 as state "ready (stroke 3 of 7)"; the committed 20-kanji-stroke-midway.png actually reads "stroke 2 of 7". The value is hard-coded, unmeasured metadata in capture-evidence.mjs shotList() line 609 rather than read from the page. The behaviour is correct — ?strokes=all starts revealed=total, so the first stroke-step wraps to 0 and three steps land on 2 — so the manifest, not the app, is wrong. The builder's own predicate table says "stroke 2 of 7", so the committed artifact contradicts the builder's report. The human-readable README says only "mid stroke order" and is accurate.
  - fix: Either correct the string to "ready (stroke 2 of 7)" or, better, have the harness read the live counter text ([data-testid="kanji-stroke-order"] innerText) into the manifest so the state field is measured rather than asserted.
- **P2** — The kanji page renders the literal token "nelson" — one of the eleven names REQ-UI-03 enumerates as excluded — and the guard test cannot see it. On /kanji/分 line "八 — radical, nelson" is rendered by kanji-screen.tsx line 347 from seed data (packages/seed/data/kanji.json: {"element":"八","kind":"nelson"}), which is KanjiVG's kvg:radical scheme name. Substantively REQ-UI-03 is respected — no dictionary index NUMBER is rendered, and Layer 1 explicitly asks for "visible components with roles where sourced" — but test/screen-contract.test.ts FORBIDDEN_INDICES scans only apps/app source files, and its companion data assertion only checks that no kanji.provenance FIELD NAME matches /index|skip|nelson|.../, never a rendered VALUE. So a future dataset carrying a skipCode or nelson index in a rendered field would reach the page with the test still green. Separately, "nelson" is an unexplained upstream taxonomy token shown to a learner on a page the spec says should read like a museum card.
  - fix: Extend the screen-contract data assertion to walk the seed VALUES that the screens actually render (kanji.radicals[].kind, meanings, components) against the FORBIDDEN_INDICES list, not just provenance field names. On screen, map the raw scheme name to plain language or drop it (e.g. "八 — radical" with the scheme carried in the provenance line rather than the body).
- **P2** — Two code comments point a reader at guarantee files that do not exist. apps/app/src/screens/kanji-screen.tsx line 14 cites `test/no-dictionary-indices.test.ts` (the scan actually lives in test/screen-contract.test.ts); apps/app/src/data/stroke-sources.ts line 14 and apps/app/src/data/stroke-manifest.ts line 7 both cite `test/stroke-sources.test.ts` (the manifest cross-check actually lives in test/stroke-order.test.ts). Both guarantees are real and passing; only the pointers are stale. In a build whose standard is that every claim is checkable, a pointer to a nonexistent test is a claim a reviewer cannot follow.
  - fix: Update the three comments to name the files that hold the assertions: test/screen-contract.test.ts and test/stroke-order.test.ts.
- **P2** — Minor evidence/reporting inaccuracies in the WP-05 capsule appendix, none affecting a predicate. (a) The capsule and README repeatedly cite "controller §19 WP-05"; the work packages are in §18 of BUNKI_PHASE0_CLOSED_LOOP_LONG_RUNNING_GOAL_V1_2026-07-27.md (§18 Work-package DAG at line 487, WP-05 at line 566) — there is no §19. (b) The capsule records the export as "869 modules"; a clean `npm ci` checkout of ef689ba reports "Web Bundled … (848 modules)" — the builder ran `npm install`, so the figure is not reproducible from the documented clean-checkout path. (c) Root package-lock.json is modified (160 insertions) and sits outside the declared `apps/app/` surface; this is mechanically unavoidable under npm workspaces and IS disclosed in the capsule deviations section, so it is recorded rather than charged.
  - fix: Correct the §19 citations to §18 throughout the WP-05 capsule appendix and the screenshots README, and restate the module count from a `npm ci` run (or drop the figure, which evidences nothing).
- **P2** — REQ-UI-02 Layer 1 asks for "'what appears uncertain' with confidence" and REQ-UI-01 for uncertainty INFERENCE (from query type, opened sections, replays, prior evidence). The word page renders only the explicit manual mark and, when none exists, the flat sentence "Nothing marked uncertain." (word-screen.tsx line 235). No confidence value and no inference exist — correctly, since the evidence layer is WP-06's — but unlike every other unfillable section on these screens this one does not use the UnsupportedLayer pattern, so it reads as a complete answer rather than as a capability that is not built yet.
  - fix: Render an UnsupportedLayer beside the mark naming what is absent ("inferred uncertainty and confidence need the evidence layer; only your explicit mark is shown"), consistent with how pitch accent, collocations and audio are handled, and add it to the deferred register with WP-06 as owner.

### Full report

## V5 verification of WP-05 — VERDICT: **FAIL** (2 × P1, 5 × P2, 0 × P0)

Branch `agent/bunki-phase0-closed-loop-wp05` @ `ef689ba9175aebecfacfbbb9434b222e8c8a01f7`, stacked on `755c090` as declared. Clean checkout, `npm ci`, full check set, real `expo export --platform web`, and an **independently written** CDP driver against the exported bundle (Chromium 141 at `/opt/pw-browsers/chromium-1194`) — deliberately not B6's harness, so its assertions were not the thing under test.

This is strong work. The closure predicate is genuinely met, the screenshots reproduce, and the honesty discipline is better than most of what I would expect to see. It fails on two claims that are false on the Phase-0 target runtime — and both are of the exact class this campaign exists to catch: a statement about the system that nothing measured.

---

### Integrity and boundaries — clean

All five binding documents hash-verified, controller first: `de7b6fcc…59b47` / `5ee28477…b0c55` / `41631840…155a71` / `b0a6811d…8fce7` / `d5fb46c7…0cab43`, all matching `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`.

Stacking is as claimed. `git diff --stat 755c090 HEAD` outside `apps/app/`, `docs/build-evidence/screenshots-wp05/` and `CAPSULE.md` yields only `package-lock.json` (160 insertions), which npm workspaces make unavoidable and which the capsule already discloses as a deviation. No frozen doc touched, no other lane's surface, one commit, nothing pushed to `main` or the integration branch. The capsule appendix is appended, not rewritten.

### Check set — all green on a clean `npm ci`

`lint` 0 · `format:check` clean · `typecheck` 0 across root + 6 workspaces · `test` **30 files / 515 tests** · `test:replay` 43 · `expo export --platform web` → `Exported: dist`, 5 static routes. `test:e2e` and `verify:export` are WP-10/WP-03 placeholders that print an explicit "not evidence of anything working" notice — correctly not counted as evidence. `apps/app` contributes exactly the 10 files / 189 tests the capsule claims.

### Predicate walked against the live build, not the report

| §18 WP-05 predicate | V5 finding |
|---|---|
| Screens 1–3 functional on Expo Web against seed data | **met** — driven live |
| REQ-UI-01 ack before enrichment | **met** — at t+172 ms the acknowledgment panel (2 events, instant, durability sentence) and "Enrichment running… (started after this acknowledgment)" are on screen together; enrichment lands 3 s later |
| Layers render with provenance | **met** — layers 0–3 present, 2092-char provenance table with per-field attribution |
| loading / error / empty / offline on every screen | **met** — 12/12 observed live, offline via Chrome network emulation |
| Screenshot evidence under `docs/build-evidence/` | **met and reproducible** |
| Stroke animation from seed KanjiVG | **met** — 7 rendered `d` attributes are an exact ordered byte match to `packages/seed/data/strokes/05c90.svg` |
| Indices never rendered | **met in substance** (no index numbers) — but see P2 |
| `SEED_ENTRY_DISCLOSURE` on word + kanji | **met** — verbatim from `@bunki/seed`, and absent from the capture screen |
| No `@bunki/persistence`, no scheduling/evidence logic | **met** — the single bundle occurrence is the `WP05-D1` prose string, not an import |

**Screenshots match reality.** Re-running the harness produced 26/26 with identical dimensions; 21 of 26 are byte-identical in size and the 5 that differ do so only by rendered ISO timestamps.

**Live a11y measurement:** 0 undersized touch targets and 0 unlabeled interactive nodes across all three screens; exactly one accent hue painted (`rgb(166,48,26)`) with no per-state or per-JLPT colour.

---

### P1-1 — Furigana is not hidden from the accessibility tree on the target runtime

`ruby.tsx` sets `importantForAccessibility="no"` on both pieces of every segment. That prop is Android/iOS-only; `react-native-web`'s `forwardedProps` allowlist contains `aria-hidden` and has **no** entry for it, so it is dropped. `Accessibility.getFullAXTree` on `/word/lex-wakareru` returns exposed, non-ignored StaticText nodes in order **わ / 分 / 　 / かれる** — reading and written form interleaved, which is precisely what the file header says is prevented and what the capsule asserts as met. Two aggravating details: the `opacity: 0` ideographic-space placeholder is announced as content, and the intended single label sits on a `role=generic` container where `aria-label` is not a valid ARIA naming target — so the good label may be dropped while the bad pieces are read. REQ-UI-09 makes this a requirement, not polish, and REQ-ARCH-01 makes Expo Web the Phase-0 target. No test catches it because the suite has no renderer.

### P1-2 — A false statement about the event log, rendered next to its own refutation

Mark the uncertainty **after** Keep and the app writes no event at all (`applyMarkUncertainty` returns `events: []`, and `uncertaintyMark` is only ever set at capture). Reproduced live: search 分岐 → Keep with no chip → tap "reading". The resulting screen shows, in one viewport, the selected chip, the thread row `keep · uncertain: reading`, the acknowledgment `2 event(s): EncounterCaptured, ThreadPromotionChanged`, and the sentence *"The event log records that a mark exists; which dimension you chose is kept on this device only and is not exported."* The log records nothing of the kind. The word page repeats the claim. The user is told the fact of their mark is durable and exportable when in that path the whole mark is lost — and `WP05-D2` understates it by describing only the *dimension* as app-local.

Screenshot: `/tmp/claude-0/-home-user-Bunki-app/ad73754c-c068-5162-8e62-5a7eda022b57/scratchpad/v5-shots/mark-after-keep.png`

---

### P2s in brief

1. `index.json` calls shot 20 "stroke 3 of 7"; the PNG reads "stroke 2 of 7" (hard-coded, unmeasured metadata — B6's own report says 2).
2. `八 — radical, nelson` renders on `/kanji/分` from seed data; the `FORBIDDEN_INDICES` guard scans **source only**, and its data assertion checks provenance *field names*, never rendered *values*.
3. Two comments cite test files that do not exist (`no-dictionary-indices.test.ts`, `stroke-sources.test.ts`); the assertions are real but live elsewhere.
4. Capsule cites "controller §19 WP-05" throughout — work packages are in **§18**; and the "869 modules" figure is 848 on a clean `npm ci`.
5. Layer 1 "what appears uncertain **with confidence**" renders a flat "Nothing marked uncertain." instead of the `UnsupportedLayer` pattern used everywhere else for absent capability.

---

### Credit where due

The ADR-002 tension was handled exactly right — conservative reading, escalated to CON, not patched in the app. `createDomainEvent` is called from one file. The durability sentence is rendered from the store rather than typed. Unfillable layers name what is missing and why. The evidence harness exits non-zero on a failed shot, and the debug flags drive the real state machine and say so on screen. Two genuine defects (the hydration/colour-scheme bug and the double-tap promotion throw) were found and fixed by the builder and reported rather than buried.

### What PASS needs

Fix P1-1 and P1-2 — both are small, local changes plus a corrected claim in `ruby.tsx`, `CAPSULE.md` and `deferred.ts`. Neither touches another lane. I would re-verify on the same evidence: the AX subtree under a `RubyText` exposing exactly one named node, and a `capture-flow.test.ts` case asserting that capture-with-`null` followed by `markUncertainty` leaves no `uncertaintyMark` in `readAll()`.



---

## Round 2 (post-repair) — verdict: PASS

- **P2** — V5 round 1 was never filed as docs/build-evidence/VERIFY_WP05.md. `git log --all -- docs/build-evidence/VERIFY_WP05*` returns nothing; VERIFY_WP01/02/04.md were all filed by CON at 755c090 and no WP-05 record was among them. The only surviving statement of what round 1 found is the builder's own restatement inside its repair appendix in CAPSULE.md, so WP-05's verification history currently lives only inside the account of the party being verified.
  - fix: CON files docs/build-evidence/VERIFY_WP05.md at W3 close covering both rounds. Until then, this round's scope is honestly limited to 'the two defects as the builder characterised them' — if round 1 raised anything the builder did not restate, this round could not have caught it.
- **P2** — The WP-05 repair appendix states '13 re-captured PNGs, 1 new PNG'. The actual count is 11 modified PNGs plus 1 new. 13 is the number of modified *files* in docs/build-evidence/screenshots-wp05/ (11 PNGs + README.md + index.json), verified with `git diff --diff-filter=M --name-only ef689ba 55a2fdd -- docs/build-evidence/screenshots-wp05`.
  - fix: Correct the count in a later appended capsule section (never by rewriting the existing one). Same count-wording class as the W2 carried P2; touches no predicate, so batch it rather than reopening WP-05.
- **P2** — The evidence harness (apps/app/scripts/capture-evidence.mjs, which carries the 8/8 accessibility audit) is not wired into CI, so the gate that catches the exact regression this repair closed is local-only today. It does exit 1 correctly on a failed assertion — verified — but nothing runs it on a PR.
  - fix: Correct for now, since WP-10 owns extending CI to the full §17.5 set. Name it explicitly in the WP-10 handoff so the accessibility audit is among the checks CI picks up, rather than being remembered as 'screenshots'.

### Full report

## V5 re-verification addendum — WP-05

**Subject:** `agent/bunki-phase0-closed-loop-wp05` @ `55a2fdda7541b51bdb945a8454864ef9102d48bc`
**Verifier branch:** `agent/bunki-phase0-wp05-v5` @ `3c3f91d` (pushed; cut from `origin/agent/bunki-phase0-integration` @ `755c090`)
**Verdict: PASS — no open P0/P1.** Three P2 observations.

Scope per the mandate: confirm each round-1 P1 is resolved and that the §17.5 set still passes. Round 1's full predicate walk is not re-litigated.

### Integrity (verified first, from `origin/main`)

Controller `de7b6fcc…859b47` matches the launcher's expected hash. The v2 architecture spec, orchestration spec, Phase-0 DoD and Master DoD all match `BUNKI_SPEC_INTEGRITY_SHA256_2026-07-27.txt`. Hashes computed via `git show origin/main:…`, not from a working tree.

### Stacking

Cut from `755c090`. Integration has since advanced to `f9f4d0e` ("refresh from main, PRs #5/#6/#7 merged"), but `git diff --stat 755c090 f9f4d0e` is **empty** — merge commits only, identical tree. The subject branch stacks on the same base, so builder and verifier ran against the same content, and that content is what integration holds today. No rebase needed.

### A caveat this report will not paper over

**V5 round 1 was never filed as `docs/build-evidence/VERIFY_WP05.md`.** No independent record of it exists on any branch. `VERIFY_WP01/02/04.md` were filed by CON at `755c090`; no WP-05 record was among them. The only surviving statement of what round 1 found is the **builder's own restatement** inside its repair appendix.

So the honest scope is: *the two defects as the builder characterised them are independently reproduced against the pre-repair source and independently confirmed absent from the repaired source.* If round 1 raised anything the builder did not restate, this round could not have caught it. That is P2 **V5-O1** below.

### Finding 1 (P1) — ruby pieces exposed in the accessibility tree · RESOLVED

Reproduced before being re-closed:

1. Pre-repair `ruby.tsx` restored from `ef689ba` — it does carry `importantForAccessibility="no"` twice plus a container `accessibilityLabel`, as described.
2. Re-exported and re-audited: **1/8 checks passed**, Chrome printing the interleaved list verbatim — `分かれる（わかれる） | わ | 分 | 　 | かれる`, five exposed named nodes including the ideographic-space placeholder.
3. Harness true exit status on that run: **`1`**. A failing assertion fails the run.
4. `ruby-accessibility.test.ts` against pre-repair source: **5 of 6 fail**.
5. Repaired source restored: **27/27 screenshots, 8/8 accessibility checks**, exactly one exposed node named `分かれる（わかれる）` and one named `分岐（ぶんき）`.
6. The regenerated `accessibility-audit.json` is **byte-identical** to the committed one.

The deliberate deviation from the prescribed fix is sound: `accessibilityRole="text"` is kept for its native meaning, but the label is carried as real clipped text content because `propsToAriaRole` maps `text → null` on the installed react-native-web. The audit passes because of the text node, and the code comment says so rather than claiming the role does the work.

### Finding 2 (P1) — screens stated a falsehood about the event log · RESOLVED

1. `applyMarkUncertainty` returns `events: []` — the premise holds in code, not just in the comment.
2. Both screens call `uncertaintyLogNote`; neither contains the old literal, and `screen-contract.test.ts` fails if either regresses.
3. All four branches check out, including the fourth the finding did not name: clearing a mark after Keep leaves `marksInLog === 1`, and the sentence correctly declines to claim the log is now free of one.
4. **Photographed in the real exported app.** `27-capture-mark-after-keep.png` shows the corrected sentence under a selected `reading` chip beside an acknowledgment reading `2 event(s): EncounterCaptured, ThreadPromotionChanged`. Screen and log agree.

### Check set, clean checkout, verbatim

| Command | Result | Matches builder |
| --- | --- | --- |
| `npm ci` | 717 packages, 724 audited | — |
| `npm run lint` | clean, exit 0 | yes |
| `npm run format:check` | "All matched files use Prettier code style!" | yes |
| `npm run typecheck` | clean, root + 6 workspaces | yes |
| `npm run test` | **31 files, 529 tests, 529 passed** | yes (exact) |
| `npm run test:replay` | 2 files, 43 passed | yes (exact) |
| `npm run test:e2e` / `verify:export` | placeholders, exit 0, "NOT A PASSING TEST SUITE" | n/a |
| `expo export --platform web` | `Exported: dist` — 5 static routes | yes |
| `capture-evidence.mjs` | **27/27 shots, 8/8 a11y**, exit 0 | yes (exact) |
| same, pre-repair `ruby.tsx` | **27/27 shots, 1/8 a11y**, exit **1** | yes (exact) |
| `ruby-accessibility.test.ts`, pre-repair | **5 failed, 1 passed** | yes (exact) |

Regenerating all 27 shots gave **18 byte-identical** PNGs; the 9 that differ are timing-sensitive states. The two the accessibility claim rests on (11, 12) are byte-identical, as is `accessibility-audit.json`.

### Surface audit (`git diff` against `755c090`)

- Nothing outside `apps/app/`, `docs/build-evidence/screenshots-wp05/`, `CAPSULE.md`, `package-lock.json`.
- **Zero** files under `docs/specs/`, `docs/convergence/`, `docs/handoffs/`, `docs/adr/`, `.github/`; no `eslint.config.mjs`, no `package.json`.
- No other W3 lane touched: no `packages/domain/`, `persistence/`, `export/`, `seed/`.
- `package-lock.json` (+160) is from round 1; `ef689ba..55a2fdd` does not touch it, so the repair round added no dependency, as claimed.
- `CAPSULE.md` over the repair round: **214 insertions, 0 deletions** — append-only, verified by `--numstat`.
- REQ-GATE-03 forbidden-claim grep over `apps/app/src`: **0 matches**.

### P2 observations

| Id | Observation |
| --- | --- |
| V5-O1 | **For CON.** File `VERIFY_WP05.md` at W3 close covering both rounds, so WP-05's verification history does not live only inside the builder's own appendix. |
| V5-O2 | The repair appendix says "13 re-captured PNGs"; the true count is **11** modified PNGs plus 1 new. 13 is the modified-*file* count (11 PNGs + `README.md` + `index.json`). Same class as the W2 carried P2; touches no predicate. |
| V5-O3 | The evidence harness is not CI-wired, so the 8/8 audit is a local gate. Correct for now (WP-10 owns extending CI to the full §17.5 set), but name it in the WP-10 handoff — an un-wired gate is how this regression shipped. |

### Next safe command

- **CON:** mark the WP-05 exit item in `ORCHESTRATION_LOG.md`; file `VERIFY_WP05.md` (V5-O1).
- **INT:** `55a2fdd` is mergeable as-is — it stacks on `755c090`, whose tree equals `f9f4d0e`.
- **To falsify this report rather than trust it,** from a clean checkout of `55a2fdd`: `git show ef689ba:apps/app/src/ui/ruby.tsx > apps/app/src/ui/ruby.tsx`, re-export, re-run the harness → must drop to 1/8 and exit 1. Restore with `git checkout -- apps/app/src/ui/ruby.tsx`.

Nothing was pushed to `main` or to the integration branch; nothing was merged or approved; no frozen doc was edited.
