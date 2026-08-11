# KAIRO / Bunki — handoff to a new agent (2026-08-11)

You are picking up an in-progress Japanese-learning app. Read this whole file
first, then read the standing brief at
`docs/briefs/KAIRO_BUNKI_BRIEF_2026-08-10.md` (product vision, in the operator's
own words) and the depth canon it points to
(`docs/convergence/BUNKI_WORKING_SPEC_2026-07-27.md`,
`JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md`). This handoff is current
state + what the operator wants next; that brief is the enduring "what this
product is."

## Authority and how to work (unchanged, and it matters)

- **Only the operator defines the product.** Previous agents' specs, "laws," and
  the verify suites are AI work-product — tools and history, never binding. When
  the repo contradicts the operator, the operator wins.
- **Ask rather than invent.** Several tasks below are deliberately open — the
  operator wants _ideas and options_, then picks. Propose 2–4 concrete
  directions and let them choose; do not silently commit to one.
- **Ship by feel.** The operator experiences every build on a real iPhone. Look
  with your own eyes at phone size (screenshots/recordings) before and after
  every change. Their felt reaction is ground truth.
- **Deliver by deploying, then one plain paragraph** on what will FEEL
  different — no jargon, no numbers. An honest partial with a clear list of what
  remains beats a polished claim.

## Where the app is right now (all live on the branch tip)

The vessel is `prototypes/corridor/` — one app at one URL. Front door is the
**銀河 (galaxy)** — a full-bleed field of drifting words, the app's hero.
Shipped this last run and live:

- **銀河 hero:** the galaxy rests bare but for one **鳥居 (torii) symbol**
  (top-center). Tap it → a top bar drops in (back/forward · an **EN⇄日本語
  sliding toggle** · a **search** field · **集中道場**) and two corner bubbles
  rise: **本棚 "bookshelf"** (bottom-left) and **先生 sensei** (bottom-right,
  opens the AI surface). A **faint world-seal** sits top-right (~0.2 opacity) and
  "comes to life" on tap, cycling the five nihonga worlds
  (北斎 · 墨 · 岩絵具 · 緑青 · 夜). Dismiss and it all recedes to just galaxy +
  symbol. Only on 銀河; inner pages keep an ordinary top bar.
- **集中道場 (focus dojo):** pick a Pomodoro length (5 / 10 / 20 / 40 min) and
  what to drill — due cards (real FSRS) or a kanji-only run — and a timed session
  runs with a live countdown; it keeps drilling if cards run dry, and ends gently
  when the clock does.
- **Real 部首 radical system:** every kanji shows its one official radical —
  glyph, Japanese positional name (きへん…), position type (へん/left…), and
  Kangxi number (1–214). The radical's page names it as such. Data from a
  KANJIDIC2 mirror + an authored 214-radical table.
- **Category catalogs:** the 漢検 / JLPT / stroke-count chips (on a kanji entry
  and on the stroke-order page) are tappable → an exhaustive grid of _every_
  kanji in that group. This is a pattern to extend to other groupings.
- **Stroke order:** the full-screen page has a five-layer ink treatment with
  pigment options; the small tile is a framed washi tile. **Ten nihonga
  direction mockups** have been shown (墨 · 枯筆 · 金泥 · 淡墨 · 朱印 · 雲肌 ·
  金屏風 · 藍摺 · 雨過天青 · 拓本) — **the operator has not yet picked the final
  treatment.** That pick is open; when made, wire it into both the tile and the
  full-screen view (they may want one-per-light/dark-world).
- Smaller: editorial する stripped from single-word readings (故障 → こしょう);
  night-theme (夜) small-print contrast lifted.

Already present from before (don't rebuild — extend): a ~23k-word dictionary, a
7,910-word graded lexicon, a ~40-article shelf + reader with furigana and
tap-to-look-up, a kanji room with animated stroke order, an FSRS memorize list +
review sessions, a five-lens 字引 kanji finder (parts · handwriting · reading ·
meaning · strokes), a 類語 thesaurus, grammar and yoji surfaces, JLPT/Kanken
lanes, and a key-gated AI example generator + tutor surface.

## The vessel — build, deploy, constraints

- **Repo** `AmitabhainArunachala/Bunki-app`. **Develop on**
  `claude/kairo-bunki-brief-j11dm2` (the operator ships by feel; merge nothing
  without being told). All this run's work is on that branch as **PR #69**.
- **Drift source of truth** is `prototypes/drift/drift-artifact.html`. The
  corridor's drift files (`drift-layer.*`) and `corridor-standalone.html` are
  **GENERATED — never hand-edit them.** Regenerate after any drift/data change:
  `node prototypes/corridor/tools/build-drift-layer.mjs` then
  `node prototypes/corridor/tools/build-standalone.mjs`.
- **Deploy:** dispatch `pages-app.yml` on the branch (Actions). `main`
  auto-deploys; the feature branch does not. The operator's live URL is the
  GitHub Pages site; hard-reload (or `?v=<sha>`) to bust cache. The app also
  builds to **one self-contained file** (`corridor-standalone.html`) that runs
  offline — useful for phone-side testing.
- **CI gates on push:** Prettier `format:check`, `verify-drift-consistency`
  (fast), accessibility. Run `npx prettier --write` and the relevant
  `tools/verify-*.mjs` before pushing. Treat the verify suites as regression
  tripwires, not law — **update them when a deliberate design change invalidates
  their mechanism** (e.g. this run, hiding the drift's own theme seal broke a
  click-based check; it was rewired to drive the seal's handler).
- **Data provenance:** JMdict / KANJIDIC2 / KanjiVG are CC BY-SA — keep the
  attribution blocks in the data files intact.
- **Network reality (verified this run):** `raw.githubusercontent.com` and the
  npm registry are reachable; `edrdg.org`, GitHub _release assets_, jsdelivr,
  Wikipedia, and sljfaq are **egress-blocked**. Full JMdict (~200k) and Tatoeba
  downloads are not directly fetchable; a KANJIDIC2 JSON mirror on GitHub _is_
  (that's how the radical data arrived). Plan data work around this.
- **AI:** features are key-gated — the app asks once for the user's API key,
  stored on-device only; with it AI comes alive, without it AI features are
  quietly absent, never broken.

## Orientation — key code (so you move fast)

Main SPA: `prototypes/corridor/corridor.js` (+ `corridor.css`, `index.html`).
State object `S`; `render()`; navigation `go()` / `back()` / `S.stack`; sheets
via `renderSheet` dispatching on `node.t`. Notable seams:

- 銀河 hero + nav: `buildGingaChrome`, `GINGA_SYMBOL_SVG`, the faint seal
  (`.ginga-seal`, reuses `cycleKairoTheme`), `renderDrift`.
- Dojo: `renderFocus`, `startFocus`, `S.focus`, `renderFocusHud`.
- SRS/FSRS engine: `startReview(scope)`, `S.review`, `srsDueItems`,
  `reviewBack`, `renderReview`; scheduler from `vendor/ts-fsrs.mjs` +
  `data/fsrs-pin.json` (`tools/build_fsrs_pin.mjs`). The learner state lives in
  `S.srs` / `S.taken` / `S.lists` (localStorage).
- AI: the `ai` view (`renderAiSetup`) and `renderAiExamples` (key-gated); the
  先生 bubble opens `S.view='ai'`.
- Example sentences today: mined from the shelf articles via `findExamples` /
  the passages+tokens in `data/articles/`.
- Catalogs: `renderCatalogNode`, `catalogMatch`, `catalogChip`.
- Radicals: `tools/build-radicals.mjs` → `data/share_alike/radicals214.json`.
- Data build tools live in `prototypes/corridor/tools/` (`build_corridor.py`
  needs the full corpus + a tokenizer and generally won't run in-session; the
  committed `data/share_alike/*.json` are patched by targeted JS tools instead).

## What the operator wants next (their words, faithfully)

1. **More example articles, higher quality.** Grow the shelf well beyond ~40 with
   better pieces. Mind the network constraints when sourcing; keep
   provenance/attribution. (AI-generated leveled readings are an option once a
   key is present — see the codex's "custom readings at the user's level.")

2. **Standalone example sentences** — "Example sentences that are not from the
   Hondaana [本棚 / the shelf] but standalone examples." Today a word's examples
   are mined only from the ~40 shelf articles. The operator wants an
   **independent example-sentence source** per word (and kanji). Propose the
   sourcing (a bundled example corpus vs. AI-generated leveled sentences vs. a
   hybrid) — Tatoeba is egress-blocked, so weigh what's actually buildable — and
   get the operator's pick before building.

3. **A dedicated kanji-study place — "inside 集中道場 but also standalone."**
   Verbatim: _"Should be our own version of this; do not take literally, just
   draw inspiration and give different ideas on what a kanji-alone portion of the
   app looks like, and how we weave that organically with the SRS, the vocab, the
   AI."_ So: a kanji-focused study surface reachable **both** from inside the dojo
   **and** as its own place. It must be **our own** take — inspired by, not a copy
   of, any reference. **Your job first is to propose several distinct directions**
   for what "kanji alone" study looks like and, critically, how it **weaves
   organically** with: FSRS scheduling, the vocab that uses each kanji, and the AI
   (adaptive explanation / quizzing). Show the options (ideally as phone-size
   mockups), let the operator choose, then build. Do not silo it — the weave is
   the point.

4. **A persistent AI conversation graph.** Verbatim: _"The AI needs its own graph
   so that every single conversation gets recorded. Not a word is lost. No matter
   the model provider."_ Design a **durable, provider-agnostic store** for every
   AI turn — nothing dropped — that survives across sessions and works regardless
   of which model backend is behind the key. "Graph" implies structure: link
   conversations to the vocab, kanji, grammar, and themes they touch, so the
   record is queryable, not just a transcript. This is infrastructure the next
   pillar depends on — design it deliberately (on-device persistence given the
   key-on-device rule) and get the operator's buy-in on the shape before building
   broadly.

5. **An always-on adaptive layer built from those sessions.** Verbatim: _"SRS and
   mock tests and suggestions and readings are made from those sessions. That
   structure should be there regardless of the model so a part of the app is
   always adapting to the user's level. From several angles and dimensions that
   are always finding the balance between the user's strengths and weaknesses,
   from very finite details to larger concepts and themes, and mapping that as
   intelligently as possible so the app as a whole is used to help the user
   progress robustly."_ Architect a **provider-independent learner model** that
   ingests the conversation graph (and ordinary usage) and continuously maintains
   a **multi-dimensional picture of the learner** — from the finest grain (a
   specific kanji, word, reading, grammar point) up to concepts and themes —
   always balancing strengths against weaknesses. From that model, **generate**
   the SRS cards/scheduling, mock tests, suggestions, and custom readings. The
   model is pluggable; the **learner-model + generation structure is the app's
   own** and always adapting. This aligns with the codex's north stars: one
   shared learner model across every surface, AI proposes but FSRS schedules,
   partial knowledge first-class.

Treat (4) and (5) as one architectural backbone — the app's memory and its
adaptation engine — and the biggest, most foundational work here. Propose the
architecture and confirm direction with the operator before committing to it.

## Pending decision to close early

- **The nihonga stroke treatment pick** (ten options shown). Get it and wire it
  in — a quick, satisfying win that finishes a thread from the last run.

## Recommended first moves

1. Read this + the standing brief + the codex; open the live build on a phone and
   actually feel the current 銀河 / dojo / radicals / catalogs.
2. Close the nihonga pick (ask, wire, deploy).
3. For items 3–5, come back with **options/mockups**, not a finished build —
   these are where the operator wants to steer. For 4–5, bring an architecture
   sketch first.
4. Then take 1–2 (articles + standalone examples) as concrete breadth once the
   sourcing approach is chosen.
5. Deploy in small rounds; after each, one plain-language paragraph on what feels
   different.

Everything from the previous run is committed and pushed (PR #69, CI green).
Build the next thing on the same branch unless the operator says otherwise.
