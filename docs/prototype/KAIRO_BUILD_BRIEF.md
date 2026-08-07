# KAIRO 回廊 — Build Brief for the Long Build

Standing orders for the agent taking KAIRO from corridor prototype to the
first **fully integrated prototype** — one app the operator can walk end to
end and feel. This document is the contract. Read it whole before writing a
line of code.

---

## 1. Mission

**KAIRO 回廊 is ONE app.** Not a suite, not seams. A Japanese-learning
instrument that carries a learner from N5 to Kanken 1級:

- **Drift is the front door** — the interactive graphic entry surface
  (`prototypes/drift/`). Not a separate app. The learner arrives in Drift
  and walks from there into everything else.
- **The corridor is the spine** — reading + dictionary
  (`prototypes/corridor/`), currently at v1.8.2: article shelf, progressive
  reader, 22,934-word dictionary, 2,136 stroke-order sets, 60 original
  grammar entries, 18 particle pages, four-door search, lists with monthly
  buckets.
- **SRS/drilling and monthly assessment** close the loop: what you take,
  what you drill, what a monthly tier says you actually know (#64).

### The north star: The Walk

The deliverable is a single continuous path the operator can take on their
phone without hitting a dead end or leaving the app:

> Open the app → Drift's living surface → step into an article (one of
> _dozens_, from the revived pipeline) → tap a word (furigana), tap again
> (English), hold (mini-dictionary), keep holding (full Renzo-grade entry)
> → tap a kanji in it (kanji page, strokes) → 覚える into a list → see it
> scheduled in the drill surface → see the monthly view of what's known,
> what's fading, what's next.

Every phase below exists to make one more segment of The Walk real. If work
doesn't serve The Walk, it waits.

---

## 2. Read first (the canon, in order)

1. `docs/convergence/BUNKI_DESIGN_LANGUAGE_SESSION2_2026-08-05.md` —
   design language, Renzo teardown (§7), structural law, theme grammar.
2. `docs/prototype/KAIRO_PROTOTYPE_LOG.md` — every corridor round and why.
3. Issue #32 (Wayfinder map) and its sub-tickets; issues #63 (grammar
   dictionary), #64 (assessment tier), #36/#39/#40 (harvest, Anki import,
   scheduler writes).
4. `prototypes/corridor/` — the code itself, plus its README.
5. `prototypes/drift/` and `prototypes/bunki-sites-v11/` — the two other
   living surfaces to be woven in.
6. `corpus/README.md` — the licence law and what little of the pipeline
   actually landed.

---

## 3. Where things stand (truthful as of 2026-08-08)

- Branch `claude/bunki-app-prototype-2rds5a`, draft PR #62, head = v1.8.2.
- Verifier: `prototypes/corridor/tools/verify-corridor.mjs`, **71 checks
  green**, real Chromium, real CJK fonts, 390×844 DPR 3.
- Corpus pipeline: **only** `corpus/src/corpus/{provenance,records}.py`
  landed. The tokenizer/grader work of PRs **#52–#58 was closed unmerged**
  — the diffs still exist on those closed PRs. This is the #1 unblock.
- v11's 8 original reading texts (`prototypes/bunki-sites-v11/…
reading-catalog.ts`) are rights-clean but **parked** until the pipeline
  can tokenize/grade them.
- Artifact (phone-tappable single file):
  `https://claude.ai/code/artifact/706cfc68-847f-476a-8a21-d5761302fd9b`
  — from a _new_ conversation, republish by passing this as `url`.
- Grammar cues from the v11 harvest are preserved in
  `data/original/grammar-v11.json` for a future reader-detection pass.

---

## 4. The laws (non-negotiable — these were paid for in defects)

### 4.1 The verification discipline (operator-ratified, quote it back)

> Every visual round: verify with real CJK fonts at device scale, look at
> the screenshots with my own eyes, send them to the operator in chat
> before they have to find defects themselves, and never accept a layout
> that depends on font metrics to be correct.

The environment ships with **zero CJK fonts** — `apt-get install -y
fonts-noto-cjk` before any visual claim, or every screenshot is a lie.
`CHROMIUM_PATH=/opt/pw-browsers/chromium`, playwright-core, never
`playwright install`.

### 4.2 The click grammar (one discipline everywhere, every surface)

- tap = furigana above
- tap **again** on the same word = English underneath (progressive cycle,
  never a timed double-tap)
- third tap backs out
- long-press (~430ms) = floating mini-dictionary
- keep holding (~2.1s) = full dictionary entry
- particles: tap stays **inert** (reading rhythm); hold opens the particle
  page
- inline glosses are compact pointers (`inlineGloss`), wrap up to 3 lines,
  and are **never truncated** — a verifier check enforces this

### 4.3 The palette law (Nihonga, subtle)

Washi ground, sumi ink. 弁柄 red `#9e2b25` = **readings and warnings
only**. 藍 indigo `#2e4d6e` = "you can go here". Levels, metadata, chrome:
never red. WCAG AA is the default legibility ruling.

### 4.4 Clean print

Reader surfaces carry **no** provenance, licence chatter, ticket talk, or
self-narration. Attribution lives on its own page, once.

### 4.5 The licence walls (three pools, never mixed silently)

- `proprietary_safe` — CC0/CC BY/PD/permissive.
- `share_alike` — JMdict, KANJIDIC2, KanjiVG (CC BY-SA accepted, ruling
  #41). Derivatives inherit the licence; keep the boundary deliberate.
- `original` — everything authored here (grammar, particles, v11 texts).

**The DoJG books (Makino/Tsutsui blue/yellow/red) are the capability bar,
never a source.** No scraping, no copying, no paraphrase-laundering.
Every grammar entry is written from scratch (#63). Mainstream Japanese
news sources are contractually off-limits (see `corpus/README.md`).

### 4.6 Working truthfully

- Small commits, honest messages, verifier + lint + `format:check` green
  before every push.
- Keep a state file in the scratchpad (OVERNIGHT.md pattern). Its rule 7:
  **state notes record only what HAS happened — never planned outcomes.**
  No pre-checked boxes, no invented hashes.
- Screenshots go to the operator **every visual round** via file send —
  they should never discover a defect before you do.
- Self-schedule wakes (`send_later`) for long autonomous runs; watch your
  PR to green; batch nighttime findings into a morning report.

---

## 5. The build, in order (each phase: build → verify → screenshot → ship)

### Phase 1 — Revive the corpus pipeline (the gate for everything)

Recover the tokenizer/furigana/grader/dictionary-linking work from closed
PRs #52–#58 (read their diffs via the GitHub tools; re-land what holds up,
rebuild what doesn't). Target: a batch command that turns a rights-clean
text into a corridor article JSON (tokens, readings, level signals, dict
links). Definition of done: the 8 parked v11 texts flow through it and
appear on the shelf — **dozens of articles**, loaded lazily per file, with
provenance recorded. Todai-scale (hundreds per JLPT level) becomes a data
problem, not an app problem.

### Phase 2 — Drift becomes the front door

Fuse `prototypes/drift/` as the entry surface of the one app. One
navigation fabric: Drift → shelf → reader → dictionary → lists, with the
same click grammar, palette, and EN/日本語 chrome toggle throughout.
Definition of done: The Walk's first segment — you _arrive_ in Drift and
_step into_ an article without a context break.

### Phase 3 — The drill surface (SRS made visible)

Taken words and lists feed a visible scheduler: card formats already
prototyped in the variants strip (MCD cloze etc.), due queues, a daily
drill room reachable from the corridor. Wire the domain/persistence
packages (`packages/`) where they hold up. Anki import (#39) and
scheduler writes (#40) fold in here. Definition of done: take a word in
the reader, see it come due in the drill room.

### Phase 4 — The monthly tier (#64)

Both assessment modes the operator ruled: an ongoing SRS-derived view of
what you actually know/need/keep alive, and a monthly high-level
assessment surface. Auto-monthly list buckets already exist — build the
review surface over them. Definition of done: the last segment of The
Walk — a monthly view that tells the truth.

### Phase 5 — Grammar depth + reader detection (continuous, not blocking)

Grow original grammar entries from 60 toward the ~600-point DoJG-bar
horizon (#63), and use the preserved cues to light grammar patterns up
_inside_ articles (a fourth door into the grammar dictionary). Runs in
the gaps between phases; never blocks The Walk.

**Scope discipline:** prefer finishing The Walk thin over gold-plating one
room. A complete thin Walk beats three perfect rooms — the operator asked
to _see the entire feel of the whole app_.

---

## 6. Operational facts

- Build: `node prototypes/corridor/tools/build-standalone.mjs`
  (`--fragment <path>` for the artifact body; prepend
  `<script>document.documentElement.lang='ja'</script><style>:root{color-scheme:light}</style>`,
  favicon 🏮, keep the same artifact URL via `url`).
- Verify: `node prototypes/corridor/tools/verify-corridor.mjs` — keep it
  green and **growing**; every operator-reported defect becomes a check.
- Lint/format from `prototypes/corridor/`: `npm run lint`,
  `npm run format:check`.
- The single-file artifact is the phone-shareable snapshot; the real
  deployment serves article JSON lazily per file (loader already supports
  directory mode). Don't let the artifact's embed-everything constraint
  shape the architecture.
- Screenshots: device scale 390×844, DPR 2–3, CDP touch; aim at
  `getClientRects()[0]`, not the union box.

## 7. Provisional rulings (defaults unless the operator overrides)

Decision drafts posted and awaiting one-word ratification — **proceed on
these defaults, do not block**:

- #47: WCAG AA legibility is the default ruling.
- #49: the app is **KAIRO 回廊** (回廊 corridor reading; 回路 appears in
  operator messages — surface the naming question once, in passing).
- #41: CC BY-SA accepted for the dictionary stack (JMdict/KanjiVG),
  attribution on its own page.
- #46: grammar lives in the study surfaces, integrated, not a silo.

## 8. How to work with the operator

They are a daily learner (Renzo dictionary app is their bar), direct, and
allergic to narration, hedging, and telemetry-speak on reader surfaces.
They ratify by quoting back. They grant overnight autonomy explicitly —
when granted, run all night, batch a morning report, never ping at night.
Show, don't describe: every round ends with screenshots in chat and a
tappable artifact. When they report a defect, the fix is global and gets
a permanent verifier check — "this never happens at all on any word."
