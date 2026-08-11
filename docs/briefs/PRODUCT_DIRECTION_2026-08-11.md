# 回廊 KAIRO — product direction for the real user (2026-08-11)

Reasoned from the operator's actual situation — 20 years in/out of Japan,
conversationally fluent, diffuse real holes in kanji/reading precision,
goal: JLPT N1 + genuine book/newspaper reading by end of year — and from
the current technical state (unified trunk: 70k dictionary, FSRS-6 +
append-only revlog, ~40-article instrumented reader, key-gated tutor,
corpus pipeline in-repo, content-blind card keys).

## 1 · Diagnosis architecture

At this level, ignorance does not follow frequency order — placement tests
and frequency lists are useless instruments. The unit of ignorance is one
of four things: kanji→reading mappings (on-yomi compounds above all),
sense precision on half-known formal/literary words, N1 grammar that never
occurs in speech, and orthography choice (遵守 vs 順守). Build for those:

1. **Reading telemetry — the tap is a confession.** Log every reader
   tap-ladder interaction (item key, tap depth, article, ts) into the
   append-only event log the SRS now has. Furigana tap = reading gap;
   gloss tap = sense gap; full entry = real hole. Continuous, zero
   friction, no AI needed. The single most informative diagnostic for
   this learner.
2. **Yomi-probes — active sweep.** A dojo mode drawing uncaptured
   compounds stratified across kanji × reading-type × Kanken band
   (generatable offline from the 70k dict + KANJIDIC2 + kanken table).
   See compound in a real sentence → produce the reading mentally →
   reveal → self-grade. Failures auto-mint cards and log probe rows.
   Stratified sampling is what makes diffuse gaps systematizable.
3. **Mechanical error clustering — no ML.** Aggregate lapses/taps/probe
   failures by shared kanji, radical, reading-type, band, grammar tag
   (graph data already in the app). Render weekly as the 苦手の地図
   (weakness map): converts "diffuse" into a steerable list.
4. **LLM probes for sense precision and grammar** (key-gated): the tutor
   receives the clusters and probes — near-synonym choice in context,
   targeted-pattern translation. The LLM files STRUCTURED findings
   (item key, verdict, evidence) into the log; FSRS alone schedules.

## 2 · Content strategy — hybrid, specific shape

Do not chase Satori/Shinobi's hand-crafted graded libraries; this learner
does not need graded content. He needs real register plus rigged
encounters with his specific weak items.

- **Authentic lane (bulk, ~70%):** run the in-repo pipelines as a weekly
  routine — ja.wikinews mirror (CC, genuine newsprint register: the N1
  register) and Aozora (public-domain literature: the book register),
  through the existing tokenizer + 3-signal grader. 150–300 articles by
  autumn at near-zero editorial cost.
- **Bring-your-own-text (the real unlock):** port kuromoji.js from the
  retired sites-v11 so ANY pasted text becomes a fully instrumented
  reader page (furigana ladder, tap logging, capture). Library size
  becomes permanently irrelevant; the operator's own immersion material
  lives inside the corridor. Personal use, on-device only.
- **Adaptive lane (daily, ~30%):** upgrade 私の読み物 from "at your
  level" to gap-targeted: each generated piece receives the week's
  failure clusters + due-soon words + one untested N1 pattern and must
  weave 8–12 of them into 400–600 chars of natural prose, tokenized so
  the reader instrumentation measures the outcome. Always marked
  AI-generated in provenance. Generation concentrates; it never replaces
  register truth.

## 3 · Production — low-friction, same holes, same keys

Principle: every production exercise keys to the SAME item as its
recognition twin (`word:X:prod` — today's key architecture, zero engine
changes), so the weakness map sees both directions of one hole.

- **Auto-minted production twins** when a recognition card graduates —
  no decision cost, governed by the same daily cap. Front: gloss + real
  corpus sentence with a blank. Kanji answer face = the existing
  stroke-order animation.
- **再構成 (60-second reconstruction)** after finishing an article:
  three just-read sentences with the target blanked; produce before
  reveal. Existing cloze machinery, zero new content.
- **Back-translation with the tutor** (precision instrument): English of
  a sentence read this week → operator writes the Japanese → LLM diffs
  against the original for particle/register/collocation gaps → files
  structured items. Targets exactly the fluent-but-imprecise profile.
- **Typing before handwriting.** IME candidate choice IS the orthography
  test. Handwriting only if Kanken becomes a real goal; N1 never asks
  for it.

## 4 · Architecture tension — where the line goes

**Personalization is data, never code.**

- General infrastructure (sterile): scheduler + append-only log
  (content-blind keys), dictionary/kanji/grammar data layers with
  provenance pools, reader instrumentation, tokenize→grade→shard
  pipeline, export/import. A beginner runs identical code.
- Personal layer (all data, in the learner envelope): log, clusters,
  weakness map, generated-article history, tutor findings. The learner
  model is a derived, recomputable view over the log.
- Policy layer (constants today, settings later): probe mix, daily caps,
  auto-mint rules, generation register targets — kept in one place.
- Do NOT unify curriculum yet: beginners need ordered introduction (the
  lesson lanes), this learner needs diagnosis-driven flow. Two doors,
  one spine. Premature unification is the tear-up risk.

## 5 · Highest-leverage next moves

1. **Instrument the reader + yomi-probe dojo mode** — the diagnosis
   backbone; daily reading becomes a continuous gap-finder; the probes
   sweep the kanji-reading space that blocks newspaper reading. No key,
   no new content. (Also quietly the first half of the handoff's
   conversation-graph/adaptive backbone, built where it pays for itself
   immediately.)
2. **Corpus pipeline to 200+ articles + kuromoji paste-any-text** — the
   shelf stops being the constraint; his own reading becomes the
   library.
3. **Gap-targeted 私の読み物 + weekly weakness map** — closes the loop:
   log → clusters → map → rigged encounters → measured outcomes.
   Production twins ride behind at near-zero cost.

If forced to two: 1 and 2. Move 3 needs ~two weeks of log data to have
something to aim at — exactly the trial period now starting.

Explicitly deferred: building the AI-conversation-graph backbone as an
abstraction first. Move 1 delivers its foundation as a side effect of
something useful this week.
