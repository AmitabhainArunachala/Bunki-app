# 回廊 KAIRO — master handoff & execution plan (2026-08-11)

**Read this file first.** It folds the whole 2026-08-11 session into one
spine: what shipped, what was decided, what is still a plan awaiting
review feedback, and the build phases a fresh agent can run as a workflow.
It supersedes `KAIRO_BUNKI_HANDOFF_2026-08-11.md` (the previous session's
handoff) as the entry point; that file remains valid background.

**Plan status: v1.** The product-direction and content-strategy sections
are the operator's working plan, deliberately open: external reviews
(Grok and others) are still coming in. **Before building Phases C–D,
fold any new feedback into the debate document and let the operator
arbitrate.** Phases 0–B are decided and buildable now.

---

## 0 · Authority and how to work (unchanged, binding)

- **Only the operator defines the product.** All specs, laws, verify
  suites — including this document — are AI work-product: tools, never
  binding. When the repo contradicts the operator, the operator wins.
- **Ask rather than invent.** Where this plan says "operator picks,"
  bring 2–4 options and wait.
- **Ship by feel.** The operator judges every build on a real iPhone at
  390×844. Look with your own eyes (screenshots/recordings) before and
  after every change.
- **Deliver by deploying**, then one plain paragraph on what will FEEL
  different. An honest partial beats a polished claim.
- **Merge nothing without being told.**
- **Aesthetic doctrine (operator, 2026-08-11): zen is not softness.**
  Hakuin's stick as much as the still water — the fierce zen of the
  burning Dogen and the ajari in the snow. The instrument's rigor IS the
  zen: Shinkansen precision, Japanese-grade engineering, exact numbers
  delivered quietly. Never bury the stillness under dashboards; never
  soften the truth to protect the calm.

## 1 · Where things stand (verified, do not re-derive)

- **Branch:** `claude/app-vision-next-steps-wei73a` — the unified trunk.
  Started from PR #69's tip (`cfb73c6`); contains the triple-checked
  harvest of everything valuable from the codex line (PR #70/#67).
  PR #62/#65/#68/main are ancestors. The `corpus/*` branches are subsets.
- **Live:** deploy run #75 (commit `2b211f0`) is on the operator's GitHub
  Pages URL. Docs commits since (`b54e54e`…`43e72e2`) are pushed but not
  yet deployed (docs only — nothing to deploy).
- **Session commits, newest first:**
  - `43e72e2` content-strategy debate (research + revised four-lane plan)
  - `1f1ceb1` product direction (diagnosis/content/production/architecture)
  - `b54e54e` SRS upgrade summary (one page)
  - `2b211f0` **SRS five gaps closed** — append-only revlog, in-session
    learning steps, daily new cap, fuzz on, card-key architecture
  - `b79e127` / `f06e7b1` SRS audit Parts II / I
  - `07d52ec` **zen review room + calendar-honest schedule labels**
  - `a71b259` **trunk unification** — 70k dictionary tier + worker,
    storage quarantine, drift bug fixes, data corrections, deploy gates
- **Open PRs:** #69 (this trunk's parent — superseded by this branch),
  #70/#67 (codex, harvested), #68/#65/#62 (contained), #60 (subset).
  Recommendation on record: after the operator's feel verdict and merge
  to main, close them all. **Operator has not yet given the merge word.**

## 2 · Document index (all committed, all current)

| Document                                                         | What it holds                                                                                                          |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `docs/briefs/HARVEST_LEDGER_2026-08-11.md`                       | Trunk unification: every item taken/left/deferred from the codex branches, with proofs                                 |
| `docs/audits/SRS_AUDIT_2026-08-11.md`                            | Parts I–III: FSRS-6 verified numerically; the five gaps closed with executed evidence                                  |
| `docs/briefs/SRS_UPGRADE_SUMMARY_2026-08-11.md`                  | One-page version of the above                                                                                          |
| `docs/briefs/PRODUCT_DIRECTION_2026-08-11.md`                    | Diagnosis architecture, content strategy, production, architecture line, next moves                                    |
| `docs/briefs/CONTENT_STRATEGY_DEBATE_2026-08-11.md`              | Research + debate vs Grok; the **revised four-lane content plan (v1)** — the file new review feedback gets folded into |
| `docs/briefs/KAIRO_BUNKI_BRIEF_2026-08-10.md`                    | The standing product vision in the operator's own words                                                                |
| `docs/briefs/KAIRO_BUNKI_HANDOFF_2026-08-11.md`                  | Previous session's handoff (five asks; superseded as entry point by this file)                                         |
| `docs/build-evidence/kairo-campaign/CLOUD_HANDOFF_2026-08-09.md` | Preserved PR #67 record (P0 authority critique — read before touching packages/domain FSRS surfaces)                   |

## 3 · Practical facts (build · deploy · verify)

- **Vessel:** `prototypes/corridor/` — one app, one URL. Main SPA
  `corridor.js` (+`corridor.css`, `index.html`, `dictionary-worker.js`).
- **Drift source of truth** `prototypes/drift/drift-artifact.html` →
  regenerate after any drift edit:
  `node prototypes/corridor/tools/build-drift-layer.mjs` then
  `node prototypes/corridor/tools/build-standalone.mjs`.
  Never hand-edit `drift-layer.*` or `corridor-standalone.html`.
- **Deploy:** dispatch `pages-app.yml` on this branch (Actions). `main`
  auto-deploys. The workflow now gates on `node --check` + a dict-v2
  integrity check. Cache-bust with `?v=<sha>`.
- **Verify before pushing:** `npm run format:check` ·
  `node prototypes/corridor/tools/verify-corridor.mjs` (91) ·
  `verify-corridor-accessibility.mjs` (20) · `npm run verify:drift:fast`
  (45) · `node prototypes/drift/tools/verify-storage-integrity.mjs` (9) ·
  `npm run test` (1645). Known-stale, pre-existing, logged:
  `verify-journey.mjs` (targets a pre-galaxy door) and `verify-v11.mjs`
  17/21.
- **Learner data:** everything lives in the localStorage envelope
  (`kairo-corridor-v1`): srs, **revlog** (append-only, ms timestamps,
  optimizer-ready), deepWords, stats (incl. daily `nnew`), lists.
  Quarantine protects unreadable envelopes; unknown keys survive saves;
  書き出す exports the whole record. Card keys are content-blind
  `type:id[:direction]`.
- **Network reality (build sessions):** raw.githubusercontent + npm OK;
  edrdg/jsdelivr/Wikipedia/GitHub release assets blocked. NHK Easy is
  token-walled — a design reference, never a pipe. JMdict/KANJIDIC2/
  KanjiVG are CC BY-SA — keep attribution intact.
- **Corpus pipeline (in-repo, runs locally):** wikinews mirror + Aozora +
  SNOW + 3-signal grader; `build_corridor.py` needs fugashi/unidic;
  `--sem-only` regenerates the SEM tier alone; committed
  `data/share_alike/*.json` are patched by targeted JS tools.

## 4 · Decisions ledger

**DECIDED (operator-ratified or shipped and felt):**

- Trunk = PR #69's feel; codex design tweaks excluded; harvest complete.
- Zen review room; calendar-honest schedule labels.
- SRS architecture: FSRS-6 pinned, append-only revlog, in-session
  learning steps, daily new cap (20), fuzz on (off-switch
  `S.stats.fuzzOff`), content-blind keys.
- Diagnosis principle: the log is the learner model's substrate; AI
  proposes structured findings, FSRS alone schedules.
- **Vessel (operator ruling, 2026-08-11): the corridor IS the product and
  stays KAIRO — the theme, the vibe, everything built to now.** The R1
  review's Expo-pivot verdict is rejected (it audited stale `main`); R1's
  contracts land as corridor-native increments. Do not re-litigate.

**PLAN v3 (revised 2026-08-11 after review round 3 — see
`R1_REVIEW_RESPONSE_2026-08-11.md` and
`R1_ROUND3_RESPONSE_2026-08-11.md` for the concede/hold records):**

- Content modes over a **personal-coverage router** with honest bands:
  Cold Flow ≥~98% (a routing prior, validated by observed assistance and
  comprehension — never a guarantee) · Supported Study ~95–98% ·
  Intensive/Decode ~90–95% · Unscored when analysis fails closed.
  Coverage reported as confirmed–possible intervals; OOV stays in the
  denominator.
- Fresh content portfolio: government PDL pages (labeled official
  source), Global Voices JA, Aozora, **Wikinews archive only** (all
  editions read-only since 2026-05-04 — fresh wikinews is dead), BYOT,
  reviewed adaptations. SLO: eligible choices per mode per day and
  8–12 reviewed units/week; no 300-count acceptance gate.
- Knowledge bootstrap before routing: Anki/known-list import +
  contextual calibration as ROUTING-ONLY assertions (never FSRS state),
  alongside graded-retrieval history from the revlog. **deepWords and
  captures are encounter provenance, not knownness** — a capture usually
  marks a word you did NOT securely know; routing knownness comes from
  graded retrieval evidence only.
- Coverage is reported as **evidence shares**, not a pseudo-interval:
  observed (graded retrieval) · provisional (import/calibration) ·
  friction (recent lookups/failures) · unobserved · unresolved. Fail
  closed to unscored. Four matched cold passages / 20 scored responses
  establish a **provisional baseline**, not a validated trend.
- Fluency (CPM) contract: cold / practiced / assisted structurally
  separate; explicit Start; assistance marks the run; live speed hidden;
  passage removed before probes; 80% comprehension floor as product
  rule; no trend claimed before ≥4 matched cold passages and ≥20 scored
  responses; 250–300 CPM is a provisional personal zone, not an N1 fact.
- Production approach: `:prod` twins are **proposed on graduation and
  admitted by one explicit tap — never silently minted** (no review debt
  without consent); 再構成 reconstruction; tutor back-translation. Port
  kuromoji from sites-v11 WITHOUT its
  coverage math (OOV-dropping, partial credit, sentence-level mass
  updates — named defects, do not carry).

**OPEN — operator's word required:**

1. **Feel verdict on the current deploy** → merge trunk to `main` →
   retire PRs #60–#70. (The standing gate on everything.)
2. Nihonga stroke-treatment pick (ten mockups shown two sessions ago —
   still unchosen).
3. Kanji-place design round (options + mockups first, then build).
4. AI conversation-graph shape (architecture sketch first).
5. Any content-strategy revisions once external reviews land.

## 5 · Execution plan — phases a fresh agent can run

Run phases in order; each ends with the full verify battery, a branch
deploy, and one plain-language paragraph to the operator. Phases are
sized for one focused run each. Where a phase says PLAN v1, re-read the
debate doc first and fold in any new feedback before building.

**Phase 0 — standing gate (no code).** Confirm the operator has felt the
current build. On their word: merge to `main`, confirm auto-deploy,
close stale PRs. Never do this unprompted.

**Phase A — diagnosis backbone. DONE 2026-08-11** (items 1–2; the
bootstrap importer remains open, below).

1. ~~Reader tap telemetry~~ **DONE**: every tap-ladder interaction logs
   `[t, 'tap', key, depth, articleId]` into `S.obslog` — append-only,
   quarantine-protected, exported with the envelope, persisted on a
   1.2 s trailing debounce with a pagehide flush. Depth 1 ふりがな ·
   2 gloss (incl. the long-press mini) · 3 full entry. A tap never
   writes FSRS state.
2. ~~Yomi-probe dojo mode~~ **DONE**: 読み探査 is the dojo's third
   mode. 13,713 untaken core compounds, each carrying its hardest
   kanji's 漢検 band and a reading type (音/訓/混/熟 — classified
   against KANJIDIC2 on/kun with rendaku + sokuon variants; 熟 means
   "not resolvable here"). Batches of 20 draw stratified: bands
   round-robin hardest-first, reading types cycled, no head kanji
   repeated. Same zen glass as 復習; shelf sentence context when one
   exists; reveal → 読めた/読めなかった; a miss mints the word into
   覚える (daily cap applies) and logs `[t,'probe',key,1,minted]`;
   a hit logs and costs nothing. Probes are observations — zero FSRS
   writes, enforced by suite check. Instrument handle:
   `window.__KAIRO_PROBE__`.
3. Acceptance landed as permanent checks: verify-corridor now runs
   99 checks (tap-ladder rows, envelope persistence, no-FSRS doctrine,
   classifier/pool/draw stats, a probe walk at 390×844).
4. Still open from Phase A's original scope: the **knowledge bootstrap**
   (Anki/known-list import + contextual calibration, routing-only) —
   build alongside the shadow router in Phase B/C.

**Phase B — content + rights integrity (decided; parallel-safe with A).**

0. ~~Slice-0 corrections first~~ **DONE 2026-08-11** (commit
   `6b9e47c`): the five Wikinews shelf items relabeled **CC BY 2.5**
   in bodies, index, and the generator; `wikinews:45227` flagged
   `pendingVerification` with a visible bilingual provenance note in
   the reader (final-revision check against the frozen archive still
   an open task); attribution renders as a clickable source link
   wherever `url` is non-empty; `pages-app.yml` carries a fail-closed
   rights gate (pool/licence/attribution/source non-empty, url where
   the source has a home, registry-consistent pooling, index/body
   agreement, exact CC BY 2.5 on ja.wikinews). The gate immediately
   caught a second defect: the three `real-*` classical texts cited
   the original-pool catalog while pooled `proprietary_safe`; they
   now cite `bunki-v11-historical`.
1. Content flow — fresh from **PDL government pages (labeled official
   source) + Global Voices JA + Aozora**; the Wikinews **archive** as a
   finite, license-isolated pool (all editions read-only since
   2026-05-04). Week-1 checkpoint: ~30 attributed substantive units
   (current shelf truth: 28 of 40 items reach 250+ chars). Sustainable
   8–12 reviewed units/week. Content _addition_ starts week 1; content
   _throughput SLOs_ are measured only once the router exists.
2. Port kuromoji.js from `prototypes/bunki-sites-v11` for in-browser
   tokenization → paste-any-text becomes an instrumented reader page
   (BYOT). On-device only, never redistributed. Do not port its
   coverage math.
3. Personal-coverage scoring as **evidence shares** (observed graded
   retrieval / provisional import / friction / unobserved / unresolved);
   run the router in **shadow mode first** — it ranks invisibly and logs
   whether its Flow predictions matched observed assistance and
   comprehension, before it ever steers the learner.
4. Acceptance: rights labels verified; BYOT walk; shadow-router log
   showing predictions vs outcomes on known articles.

**Phase C — speed lane (PLAN v3).**
Timed reading of high-readiness texts (router-ranked, shadow-validated);
chars/min logged per session — cold / practiced / assisted structurally
separate; **250–300 cpm appears only as a provisional personal training
zone (JLPT defines no CPM threshold)**; repeated timed re-reading of
studied articles as the zero-cost feedstock; generated-easy as the
targeted feedstock. Zen presentation consistent with the review room:
fierce precision, quiet delivery.

**Phase D — loop closing (PLAN v1; operator steers).**
Weekly 苦手の地図 weakness map (mechanical clustering over the log);
gap-targeted 私の読み物 (clusters + due-soon words + one untested N1
pattern woven into 400–600 chars, provenance-marked); proposed-on-graduation
`:prod` production twins (one-tap admission, never silent); 再構成 after finishing an
article; tutor back-translation probes (key-gated, structured findings).

**Phase E — infrastructure debts (any time, low risk).**
Revlog shelf to IndexedDB (format unchanged); FSRS optimizer run over
the revlog + desired-retention setting; journey-suite rewrite for the
galaxy chrome; `scheduled_days` 36,501 cosmetic; timer-churn removal in
the drift (audit `refreshActive` callers first — see harvest ledger).

## 6 · Folding in review feedback (the refinement loop)

When the operator relays new critiques (Grok or others):

1. Append the critique and its evidence to
   `CONTENT_STRATEGY_DEBATE_2026-08-11.md` (or a dated sibling).
2. Concede / hold / synthesize — explicitly, with evidence, as done for
   round one.
3. Update §4's PLAN v1 entries and the affected phases here.
4. The operator arbitrates disagreements; never silently adopt a
   reviewer's position over the operator's ruling.

## 7 · Running this as a workflow

A single agent can walk Phases A→E sequentially. If orchestrating with
subagents: one worker per phase-item, but **all corridor.js edits through
one writer at a time** (it is one large file; parallel writers will
conflict), verification fanned out freely, and every phase's deploy +
felt-paragraph delivered before the next begins. The operator can stop,
reorder, or redirect at any phase boundary — the plan serves the
operator, not the other way around.
