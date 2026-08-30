# 鏡 KAGAMI — the learner-model campaign

**Date:** 2026-08-25 · **Author:** Claude (operator-directed) · **Status:** active
when a session is pointed at this file. The wayfinder for all learning-system
work; TENOHIRA's real-use loop (ひとこと triage, phone acceptance, the voice
shootout) continues alongside.

The operator's instruction, verbatim in intent: _every single interaction
between learner and sensei tracked, judged, gauged and adapted around — one
compounding learning graph informing kanji drills, the drift screen, custom
SRS with multi-sentence cards, sentence mining with the pain points baked in,
the bookshelf at my band, and mock JLPT tests — cumulative across sessions._

鏡 — the mirror. The app finally sees the learner it is teaching.

---

> One ledger, one recomputable model, surfaces as queries.

## Context — why

The operator's stated biggest desire (2026-08-25): every interaction between learner and
app — reading, reviewing, drifting, talking to the sensei, testing — must be tracked,
judged, and **compounded** into a system that adapts around the learner's real edges,
cumulatively across sessions. Wanted lenses: kanji drills, drift population, multi-sentence
SRS cards, sentence mining (internal + external) targeting pain points, shelf population at
the training band, and mock JLPT tests.

Today each surface keeps a private learner model (`aiLevelGuess()` reads deck JLPT tags;
FSRS reads revlog; drift reads its own store). KAGAMI inverts this: **one object, many
lenses**. The live placement session of 2026-08-25 (conducted in chat) is the proof of
concept and supplied the node taxonomy: failures land on *reading* nodes (歩→ほ),
*confusion* edges (歩↔足), *sense* nodes (によって), *form* nodes (potential
答えられません) — with receptive and productive ability measurably split.

The repo's own law already mandates the shape: **ADR-004** — "any future surface state is
derived or an observation"; corridor obslog is already a typed, fail-closed, append-only
ledger; the export envelope `{v:1, taken, srs, revlog, obslog, …}` is the canonical
interchange. KAGAMI is the evidence-gate law grown up, not a new religion.

## Architecture (operator-approved 2026-08-25)

- **Layer 1 — the Ledger** (facts, append-only): `S.obslog` (8 kinds live today, validator
  `validObservationRow` at `prototypes/corridor/corridor.js:702`), `S.revlog` (12-wide
  grade rows + 4-wide revocations, `:683`), the AI IndexedDB archive (every exchange,
  `surface`/`contextRef`), `taken[].ctx` passage provenance. KAGAMI extends the taxonomy;
  it does not invent a store.
- **Layer 2 — the Model** (inference): `learnerModel(S)` — a **pure, versioned function of
  the ledger**, recomputed on demand, memoized per session, **never persisted as
  authority**. Same store ⇒ byte-same model (the deterministic-replay culture extended to
  the learner).
- **Nodes finer than words**: words · kanji · readings (kanji→reading) · senses (the
  schema-3 `senseTagRows` inventory) · grammar points · forms — each tracked **receptive
  and productive separately**.
- **A band vector, never a number** (the shelf's no-composite law, #42, extended to the
  learner): lexis-by-band, kanji-readings, syntax, production as separate signals with
  disagreement flags.

### Laws (binding)

1. FSRS-6 with the learner's fitted weights stays the **only scheduler**.
2. **Amendment of 2026-08-24 recorded**: the sensei may create cards and write
   *observations*; it still never grades, never schedules, never writes FSRS state.
3. Observation provenance is typed and weighted: `measured` (probe/review/mock) outranks
   `observed` (sensei-mined) in the model.
4. Generated content that claims to teach is 検収前 until the operator approves; rights
   law fail-closed on all minted/mined text; licence pools stay separated.
5. The ledger is device-owned; the export is the only egress; the whole graph rides it.
6. ADR-004 parity: the kernel stays semantic authority; the model is derived state (legal
   under the ADR as written); a later kernel migration inherits the ledger unchanged.
7. Battery discipline unchanged: every PR gate-green before push; verifier changes are
   build products with their own verify loop; no proxy metrics ("you would pass N3" is
   forbidden — the mocks proposal's honesty constraint).

### Relationship to TENOHIRA

KAGAMI becomes the wayfinder for learning-system work and **absorbs** TENOHIRA PR 三 (the
feed → lens 六) and the R4-D mocks proposal (→ lens 七, Stage 1 DIAGNOSTIC as recommended).
TENOHIRA's real-use loop (ひとこと triage, phone acceptance, voice shootout PR 五)
continues unchanged.

## Observation taxonomy v1 (the ledger extension)

Extend `validObservationRow` (corridor.js:702) with, all append-only tuples:

- `[t, 'sensei', key, polarity, code, ref]` — 6-wide. polarity ∈ {1 struggled, 3 handled};
  `code` from a **pinned slug set**: `misread · sense-miss · particle-drop · prod-gap ·
  collocation · form-miss`; `ref` = AI-archive contextRef (evidence traceability).
- `[t, 'confuse', key, otherKey]` — 4-wide confusion edge (e.g. `kanji:歩` ↔ `kanji:足`).
- `[t, 'mock', key, g, setId]` — 5-wide, reserved for movement 七 (validator lands now so
  older builds preserve rows they don't understand — the envelope already guarantees this).

Subjects are fail-closed like tutor cards: a `sensei`/`confuse` subject must resolve in the
dictionary (`lookup()`) or already exist in the deck, or no row is written.

## The model — `learnerModel(S)` outputs

`{ modelVersion, bands: {lexis: n5..n1+oov vector, readings, syntax, production} each with
evidence counts and a disagreement flag · nodes: key → {r, p, evidence} · edges: confusions
+ sense-misses · frontier: warm items just past the edge · leeches (reuses `isLeech`) }`.
Derived only from ledger rows + deck + dictionary; the passage-provenance on `taken[].ctx`
and the per-word evidence trail (`TRAIL_KINDS`, corridor.js:12359) are its raw material.

## 順路 — the PR ladder (each: fresh branch from main → battery → operator's word)

**一 · 台帳 (the ledger + sensei-writes)** — files: `prototypes/corridor/corridor.js`
(validator + taxonomy comment; a bounded mining pass after each `aiConverse` reply on
chat/word-tutor/reading/quiz surfaces: one structured `aiAsk` (surface `'mine'`) returning
strict JSON observations, dictionary-validated, committed via the existing debounced
`obsLog`/`commitStorePatch` path), `tools/verify-corridor-ai.mjs` (+probes: a mined
observation lands typed and fail-closed; an unresolvable subject writes nothing; the
exchange itself still archives whole), storage-integrity pins recomputed.
*Verify:* battery; new AI probes; export→import round-trip keeps unknown-kind rows.

**二 · 鏡 (the model + mirror page)** — `learnerModel(S)` as a pure section in corridor.js;
new 鏡 view (nav entry beside 級): band vector rendered as separate signals (house
no-averaging idiom from the shelf), top edges with their evidence trails, warm frontier as
doors, leeches. New `tools/verify-kagami.mjs`: determinism (same seeded store ⇒ identical
model), no-averaging probe, every rendered claim traceable to ledger rows.
*Verify:* battery + verify-kagami; a11y on the new view.

**三 · 先生の目 (sensei-reads + in-app placement)** — replace `aiLevelGuess()` at its 7
call sites with model queries (band line + top edges + frontier sample in prompts); the
placement interview productized: staircase built live from shelf articles **by their real
grading signals** (`data/articles/index.json`), grammar items from the deck, answers mined
into the ledger (movement 一's machinery); cumulative by construction.
*Verify:* battery; AI probes assert prompts carry model context; interview writes typed rows.

**四 · 潮 (drift 自)** — implement the stubbed adaptive stop (`drift-layer.js:2031`; source
patched via `tools/build-drift-layer.mjs` anchors): `自` level from the model's lexis band;
`buildDeck()` pick-set seeded by frontier + confusion words; `rePri()` gains a model
priority term; card count follows FSRS load. The ack/rollback judgment path unchanged.
*Verify:* battery incl. verify-drift suites; a probe that 自 with an empty ledger falls
back to today's behavior.

**五 · 札の文 (multi-sentence cards + internal mining)** — mine the shipped 45,276-sentence
bank first (`data/proprietary_safe/examples/`, `ensureBankExamples`/`findExamples`,
corridor.js:9206-9312): card fronts = real bank sentences dense in the learner's pain
nodes (index-shard intersection); optional `item.exCtx` (bank sentence ids — envelope
already admits unknown item keys); generation only where bank coverage is zero
(`coverage.with_0 = 7,655`), marked 検収前. 札を頼む grows a sentence-card mode.
*Verify:* battery; review-room renders multi-sentence fronts; rights strings ride each card.

**六 · 棚 (shelf at the band)** — build-side: `tools/feed_ingest.py` gains `--band` and
`--pain-nodes <exported-record.json>` (reads the canonical export; ADR-004 names it the
interchange): tranche selection weighted by band match + pain-node density. Queue, rubric
(`feed_apply_review.py`), rights gate untouched.
*Verify:* verify-feed 27+ green; a fixture export steers a tranche deterministically.

**七 · 模試 (mock, Stage 1 DIAGNOSTIC)** — per the R4-D proposal's recommended option:
diagnostic-lite composing yomi-probe history + tutor quiz + deck band composition into a
**coverage estimate with stated uncertainty** — never a pass prediction; surfaces at the
drift 自 stop (replacing the stub hint honestly) and on the 鏡 page; results land as the
reserved `mock` rows. Stage 2 (authored item banks, real money: ¥1M–6M) stays typed on the
decision sheet — operator's call, not this campaign's.
*Verify:* battery; probe that no output string ever claims a JLPT pass.

## Verification (campaign-wide)

Full battery per PR (corridor 224+, writing-room 51+, a11y 46, AI 30+, storage-integrity,
dict-tags 40, feed, replay/export/e2e) plus the new `verify-kagami.mjs` joining
`battery.sh`. Standalone regenerated whenever corridor sources change. Every PR merged
only on the operator's word; Pages deploys from main only.

## Honest limits

- Sensei-mined observations are noisy → provenance-weighted, never sole evidence for a
  band claim; the mirror page shows evidence counts, not certainty theater.
- No external calibration until 模試 exists; before that, bands are descriptions of
  evidence, not measurements of a person (the proposal's own language).
- Cost: +1 bounded mining call per AI exchange (~sub-cent); a 設定 dial can disable mining.
- Listening is absent until the voice decision (TENOHIRA PR 五).

## Kickoff (implementation step 0)

Commit this plan as `docs/prompts/BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md` +
`docs/build-evidence/kagami/RUN_STATE.md` (position: PR 一 next), add the ground-truth
reading pointer to the TENOHIRA RUN_STATE, then open PR 一 on a fresh branch from main.
