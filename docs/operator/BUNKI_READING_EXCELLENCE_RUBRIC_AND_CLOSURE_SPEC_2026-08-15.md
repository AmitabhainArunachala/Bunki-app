# Bunki Reading Excellence Rubric and Closure Spec

**Date:** 2026-08-15

**Status:** Binding corrective specification; reading is **not accepted**

**Operator score:** 3/10

**Evidence score at this audit:** 17/100 (1.7/10), with a hard ceiling of 30/100 until an end-to-end reader is demonstrated on the current phone build

This document completes the requested **admission, benchmark research, rubric, and corrective specification**. It does **not** complete the product repair, the current-SHA live screenshot audit, or the physical-device verification. Those remain blocking work.

## 1. Apology and correction

I am sorry. The operator asked for a living reading product and I reported corpus and code progress as though it were user-visible completion. That was wrong.

The central mistake was to conflate four different things:

1. a body file existing with an article being discoverable;
2. a reader function existing in source with the reader being attached and usable in the current build;
3. a count of records with breadth, freshness, categories, and editorial quality;
4. passing static checks with a complete learner experience.

The operator's 3/10 assessment controls. The stricter evidence score is 17/100 because the current surface does not demonstrate a reliable discovery → open → read/listen → inspect → understand → save → review → resume loop.

## 2. Explicit omissions ledger

These are the things I did **not** complete and should not have implied were complete:

1. I did not perform a current, physical-iPhone reading audit.
2. I did not capture a fresh screenshot itinerary from the exact current deployed SHA before making completion claims.
3. I did not prove that every shelf card opens its full article body in the current user-facing build.
4. I did not prove correct Back, resume, error, offline, reload, and cross-device behavior.
5. I did not build a reading home. I left a fixed, build-ordered list.
6. I did not build categories, topical browsing, series, or coherent reading journeys.
7. I did not build article search. The prominent shelf search is a dictionary search.
8. I did not build a genuine freshness pipeline or a visible publishing cadence.
9. I did not build exposure-aware rotation or a useful `Surprise me` action.
10. I did not build `Continue`, `Fresh`, `For your edge`, `Saved`, `History`, or `Recently added` lanes.
11. I did not attach article audio.
12. I did not provide three real, distinguishable Japanese voice styles.
13. I did not provide article play, sentence replay, synchronized highlighting, scrubbing, background playback, speed controls, or downloads.
14. I did not run a native-speaker pronunciation and prosody bake-off.
15. I did not connect reader capture to the one canonical learner event log and FSRS system.
16. I did not preserve article, sentence, sense, audio timestamp, and provenance in a reader-created learning item.
17. I did not add comprehension questions, answer explanations, or evidence spans to every approved reading.
18. I did not make AI synthesize edge-appropriate follow-up material from the learner graph.
19. I did not implement a real article recommendation engine, and I did not make recommendations explainable.
20. I did not complete human editorial review of the 30 new drafts; 0/30 are approved.
21. I did not make the 694-item archive bilingual; it has zero English titles.
22. I did not supply category, topic, added date, audio, image, or reading-time metadata for the catalog.
23. I did not implement article sharing, related readings, discussion, or a sentence-anchored tutor thread.
24. I did not establish offline article/audio downloads and observable cache health.
25. I did not verify promised cloud/backup restoration for authenticated users after reinstall or device change.
26. I did not benchmark the reading UX against current Todaii and Satori screenshots before grading my own work.
27. I over-weighted the number `70`. Thirty of those records are private, AI-assisted drafts awaiting human Japanese review, and quantity cannot compensate for a broken loop.

No future progress report may use article count as a proxy for reading-product completion.

## 3. Current-state evidence

### 3.0 Audit coordinate

- Repository branch: `agent/bunki-integrated-prototype-2026-08-15`
- Repository HEAD: `11bf5680cf125a5d43ae55e3e4d2bf48c9e3dd2c`
- Repository tree: `cf77e8d17920de3823686b1557ef02b86d177886`
- Audit time: `2026-08-15 18:47 JST`
- Operator-facing candidate URL: `https://bunki-integrated-prototype.simandharswami1111.chatgpt.site`
- Deployment caveat: this audit did not prove that the candidate URL served the exact repository SHA above. That missing URL↔SHA receipt is itself a blocking evidence gap.

### 3.1 What is genuinely present

- The primary index contains 70 records.
- Thirty records are explicitly private editorial drafts.
- Japanese and English titles exist for all 70 primary records.
- The separate archive contains 694 entries.
- The reader source contains ruby modes, word/phrase spacing, token interaction, contextual dictionary doors, a finished marker, and saved scroll position.
- Existing historical evidence includes a rendered shelf and a reader screen.

### 3.2 What the current data proves is absent

Primary 70-record index:

- 8/70 have a non-empty `date`; only 5 are normalized ISO dates, one is the string `None`, and two are bibliographic source strings;
- 0/70 have category or genre metadata;
- 0/70 have topic tags;
- 0/70 have attached audio;
- 0/70 have an image;
- 0/70 have an added-at timestamp;
- 0/70 have a reading-time or word-count field, although 70/70 have a character-count field.

Archive:

- 694 entries;
- 0 English titles;
- 0 category or topic metadata;
- 0 audio;
- 0 images;
- 0 added-at timestamps;
- 0 reading-time fields.

### 3.3 What the current shelf proves

- With no query, records are rendered in stored `D.passages` order.
- The first visible items remain old records, including 2005, 2006, 2008, and 2011 news.
- The main search field routes to dictionary results rather than searching article titles, article bodies, categories, grammar, level, or source.
- There is no `For you`, `Fresh`, `Continue`, `Surprise me`, category rail, series rail, or exposure-aware rotation.

### 3.4 Reader truth

A reader implementation exists in source and an older screenshot shows it. The operator's current build nevertheless does not present a reliably attached reader, and this audit could not obtain a fresh live-browser capture. Therefore the reader receives only source/historical-screenshot credit, not working-product credit.

The current Corridor reader has no article audio implementation. No marketing or status text may imply otherwise.

### 3.5 Existing Bunki screenshot evidence

These are historical repository receipts, not a new capture of the current deployed SHA:

- [Bunki fixed shelf — older evidence](../build-evidence/kairo-feel-lock/wp5/screenshots/after-d-1280-shelf.png)
- [Bunki reader — older evidence](../build-evidence/kairo-feel-lock/wp5/screenshots/after-d-390-reader.png)
- [Historical minimal reader prototype](../build-evidence/sites-v11-p0/70-reader-immediate.png)

The old shelf image visibly begins with the same old news cards and exposes no reading lanes. The old reader demonstrates attractive typography and ruby, but also demonstrates the missing audio, navigation, discovery, and learning-loop layers.

### 3.6 Reproducible audit commands

Run from the repository root at the pinned SHA:

```bash
git rev-parse HEAD HEAD^{tree}
python prototypes/corridor/tools/verify-native-readings.py
python prototypes/corridor/tools/sync_native_reading_graph.py --check
rg -n "speechSynthesis|new Audio|<audio|For You|Surprise me" prototypes/corridor/corridor.js
python - <<'PY'
import json, re

primary = json.load(open("prototypes/corridor/data/articles/index.json"))["articles"]
archive = json.load(open("prototypes/corridor/data/articles/archive-index.json"))
if isinstance(archive, dict):
    archive = archive.get("articles", archive)

def present(rows, key):
    return sum(row.get(key) not in (None, "", [], {}) for row in rows)

print("primary", len(primary))
print("primary.date.nonempty", present(primary, "date"))
print("primary.date.iso", sum(bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(row.get("date", "")))) for row in primary))
for key in ("titleEn", "genre", "category", "tags", "audio", "image", "addedAt", "readingTime", "wordCount", "chars"):
    print(f"primary.{key}", present(primary, key))
print("archive", len(archive))
for key in ("titleEn", "genre", "category", "tags", "audio", "image", "addedAt", "readingTime", "wordCount", "chars"):
    print(f"archive.{key}", present(archive, key))
PY
```

The metadata counts in this document are computed directly from `prototypes/corridor/data/articles/index.json` and `prototypes/corridor/data/articles/archive-index.json`. A future audit must preserve its exact script and JSON receipt rather than relying on prose.

## 4. Benchmark findings

### 4.1 Todaii / Easy Japanese

Verified from the current public product, official guide, App Store listing, and dated review evidence:

- on the 2026-08-15 scrape, `Reading by Day` exposed twelve unique entries dated 2026-08-14 and `For You` exposed three additional unique entries from that date: fifteen unique DOM-listed articles in total;
- the official listing claims more than ten fresh news articles per day;
- the live home exposes `For You`, `Reading by Day`, article search, hide-read, and 23 topic links; vendor tutorial artwork additionally shows a History rail;
- official guidance documents level, topic, and source selectors, plus visible vocabulary and grammar counts;
- live web cards expose category, JLPT level, date, and view count; current-listed App Store artwork additionally shows source labels, a `2 min` duration signal, and a JLPT-mix bar;
- the reader exposes furigana, JLPT highlighting, bilingual text, lookup, grammar, questions, related material, favorite, comments, and sharing;
- the official guide names three voices—Robot, Sophia, and Yui—and documents audio auto-scroll and sentence pronunciation practice; App Store copy documents adjustable speed, while current-listed artwork shows seek, repeat, speed, and a download-shaped control. These sources do not prove every control currently works across the corpus;
- notebooks, flashcards, memory states, and comprehension questions connect reading to study.

Todaii's weaknesses are equally important: crowded presentation; ambiguous audio provenance, because official documentation names Robot, Sophia, and Yui and describes “high-quality voices” without identifying whether article narration is human-recorded or synthesized, while the 2021 Tofugu review describes it as machine-generated; and some inspected public articles that showed only `Source: TODAII`, without a clear original-source chain. No public explanation of the `For You` ranking logic was found. Individual store-review reports—not independently reproduced here—allege furigana/audio mismatches, disappearing features, entitlement problems, and restore/sync loss. Bunki must not copy those failures.

Evidence:

- [Todaii current home](https://japanese.todaiinews.com/en)
- [Todaii official tutorial](https://japanese.todaiinews.com/en/tutorial)
- [Todaii App Store listing and reviews](https://apps.apple.com/us/app/todaii-learn-japanese-n5-n1/id1107177166)
- [Todaii independent workflow review — Tofugu, 2021](https://www.tofugu.com/reviews/todai-easy-japanese-news-app/)
- [2026 mirrored store reviews](https://mwm.ai/ko/apps/todaii-learn-japanese-n5-n1/1107177166)
- [Inspected public article displaying only `Source: TODAII`](https://japanese.todaiinews.com/en/news/a563149bc863c538fc1be131dcadff5c)

Screenshot references:

The following are vendor-hosted tutorial or current-listed marketing images retrieved on 2026-08-15, not fresh screenshots captured from a pinned Todaii runtime. The tutorial home contains March 2026 sample dates, and the store sample article is older; these images establish intended interaction patterns, not current corpus-wide functionality.

- [Discovery home / history / Reading by Day](https://japanese.todaiinews.com/assets/images/tutorial/home.webp)
- [Article reader / furigana / media](https://japanese.todaiinews.com/assets/images/tutorial/detail_news.webp)
- [Dictionary](https://japanese.todaiinews.com/assets/images/tutorial/dict_vocab.webp)
- [Video and podcast discovery](https://japanese.todaiinews.com/assets/images/tutorial/video_home.webp)
- [Current-listed App Store screenshot catalog](https://apps.appfollow.io/ios/todaii-learn-japanese-n5-n1/1107177166?country=us)
- [Lookup, ruby, JLPT mix, and audio-bar artwork](https://is1-ssl.mzstatic.com/image/thumb/PurpleSource221/v4/09/91/ec/0991ec2f-bedf-1b12-cf6b-18618343e9a0/2.png/2048x2732.png)

### 4.2 Satori Reader

Verified from current official pages, the current App Store listing, release notes, and reviews:

- 1,625+ episodes across 42 series;
- the four audited weekly drops—2026-07-22, 07-29, 08-05, and 08-12—each added episodes across three continuing series;
- art-led series pages with premise, numbered episodes, synopsis, and notes; many series or episodes offer sound-effects and voice-only editions;
- dashboard sections for recently started, bookmarked, and newly released material;
- difficulty grouping and learner feedback on difficulty;
- calm text-first presentation with adaptive kanji, furigana, and spacing;
- manually segmented expressions and context-selected dictionary senses;
- sentence-anchored human grammar and culture notes;
- native Japanese actors, whole-episode and sentence playback, speed control, background play, auto-scroll, and offline downloads;
- context-preserving study cards carrying the original context sentence, its audio clip, and notes;
- explicit human author, editor, annotator, and voice provenance.

Satori's remaining gaps are useful openings for Bunki: no clearly verified global article search, no verified `Surprise me`, and occasional web/native feature drift. A dated 2018 Tofugu review described a narrow intermediate “sweet spot”; that is a historical design warning, not proof of the current 2026 catalog's limits.

Evidence:

- [Satori current features](https://www.satorireader.com/features)
- [Satori how it works](https://www.satorireader.com/how-it-works)
- [Satori series catalog](https://www.satorireader.com/series)
- [Satori editorial and AI statement](https://www.satorireader.com/ai)
- [Satori App Store listing and reviews](https://apps.apple.com/us/app/satori-reader/id1382950847)
- [Satori historical design review — Tofugu, 2018](https://www.tofugu.com/reviews/satori-reader/)

Screenshot references:

These images remain hosted on the current App Store listing but are legacy visual captures. They are interaction references, not pixel-current evidence. For example, the legacy series image shows `DATE / UNREAD / DIFFICULTY`, while the current web series surface shows `DATE / UNREAD / BOOKMARKED`.

- [Art-led series catalog](https://is1-ssl.mzstatic.com/image/thumb/Purple113/v4/3d/9d/7e/3d9d7e29-66bd-aa73-1d0a-8f5b36cde7bf/pr_source.png/600x1300bb.webp)
- [Series detail and episode organization](https://is1-ssl.mzstatic.com/image/thumb/Purple113/v4/69/8f/af/698fafc2-154f-ed81-af89-ba243311fcde/pr_source.png/600x1300bb.webp)
- [Reader display settings](https://is1-ssl.mzstatic.com/image/thumb/Purple113/v4/bc/53/42/bc5342c8-9b7d-3abd-f407-0b6b2c15739e/pr_source.png/600x1300bb.webp)
- [Contextual dictionary and save](https://is1-ssl.mzstatic.com/image/thumb/Purple113/v4/b2/77/37/b27737c9-a203-7cd6-f63f-06e9f56a34b9/pr_source.png/600x1300bb.webp)
- [Active audio and sentence highlight](https://is1-ssl.mzstatic.com/image/thumb/Purple123/v4/0a/cd/19/0acd1983-18a4-3398-afb3-434284b9a266/pr_source.png/600x1300bb.webp)
- [Extended grammar note](https://is1-ssl.mzstatic.com/image/thumb/Purple113/v4/48/e2/6f/48e26fe8-3b3d-1049-d15d-9177f63e4e9d/pr_source.png/600x1300bb.webp)

### 4.3 Wider triangulation

| Product                                                                            | Verified strength worth learning from                                                                                              | Boundary Bunki must exceed                                                          |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [LingQ](https://www.lingq.com/en/ios-app/)                                         | Very broad authentic/imported audio-text library, known-word tracking, offline/sync                                                | Source-dependent rights and Japanese parsing quality; not an owned editorial corpus |
| [Manabi Reader](https://reader.manabi.io/)                                         | Calm Apple-native RSS/EPUB/web reading, adaptive furigana, lookup, known-word state, privacy/offline                               | Feed reliability, article rights, and no integrated AI tutor or formal assessment   |
| [Migaku](https://migaku.com/faq/features)                                          | Low-friction capture of sentence, audio, image, and context from real media                                                        | Extension/platform fragility and no deep owned reading catalog                      |
| [Bunpro Reading Practice](https://bunpro.jp/support/using-bunpro/Reading-Practice) | Grammar sequencing, multiple contexts, review linkage, graded reading practice                                                     | Not a fresh diverse editorial/news library; interface can become workload-heavy     |
| [MaruMori](https://apps.apple.com/us/app/marumori/id6642702724)                    | Human-made integrated path across vocabulary, kanji, grammar, reading, SRS, and [mock exams](https://marumori.io/tools/mock-exams) | Smaller independent evidence base and no fresh-news system                          |

These products reinforce the same design conclusion: broad-but-fragile libraries, deep-but-narrow editorial products, and integrated-but-busy systems each solve only part of the problem.

### 4.4 Target synthesis

Bunki should combine:

- Todaii's observed freshness, broad discovery, documented selectors, documented audio system, and article-to-study loop;
- Satori's editorial trust, context-sensitive explanations, audio recorded by native Japanese actors, serialized journeys, and context-preserving SRS;
- Migaku's low-friction capture of rich sentence context;
- Bunpro's multi-context grammar retrieval;
- Bunki's own quiet, progressive-disclosure, washi-and-ink visual language.

Feature parity does **not** mean button parity. The text remains primary; capability appears on intent.

### 4.5 Screenshot-derived comparison

| Visible evidence | Todaii reference imagery                                        | Satori reference imagery                                             | Bunki historical evidence                                     | Binding conclusion                                                                     |
| ---------------- | --------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Reading home     | Multiple content zones, dated material, history, topics, search | Art-led series identity and progress-oriented catalog                | One fixed vertical list beginning with old news               | Bunki needs lanes, categories, series, dates, and rotation before more card polishing  |
| Card information | Level/JLPT mix, date, source/category, count/time signals       | Art, premise, episode order, status                                  | JP/EN title, difficulty signal, source/date when present      | Add topic, date truth, duration, audio, state, learner-fit reason, and visual identity |
| Reader hierarchy | Media/audio and learning controls are visibly attached          | Japanese text remains dominant; controls and notes appear in context | Attractive Japanese typography and ruby; no attached audio    | Preserve Bunki calmness but attach the complete loop                                   |
| Lookup           | Word popup with reading, POS, meaning, example, notes/save      | Context-selected sense and Studylist action without leaving text     | Token doors exist historically, but current route is unproven | Context sense first; full entry second; canonical save in place                        |
| Audio            | Persistent transport and documented voice/speed system          | Whole-episode and sentence audio with active sentence highlight      | None in the Corridor reader                                   | Audio is a core reading surface, not a future accessory                                |
| Continuity       | History/notebooks/questions                                     | Recently started, bookmarked, contextual SRS, next episode           | Local position/finished markers only                          | Continue, exact resume, related/next, canonical SRS, and durable restore are mandatory |

This table compares observable interaction grammar, not aesthetic quality. Current live screenshots of all three products at matched viewports are still required by R0.

## 5. The 100-point reading rubric

### 5.1 Evidence scale for every criterion

| Score | Evidence requirement                                                                 |
| ----: | ------------------------------------------------------------------------------------ |
|     0 | Absent, broken, unreachable, or unverified                                           |
|     1 | Source code, schema, static fixture, or visual mock only                             |
|     2 | Partial happy path or screenshot evidence; not robustly persisted                    |
|     3 | Complete core behavior verified on a physical phone with persisted state             |
|     4 | Benchmark-level behavior verified across phone/web/offline/error/accessibility cases |
|     5 | Category-leading behavior with instrumentation and longitudinal user evidence        |

No evidence means 0. Code alone cannot score above 1. Screenshots alone cannot score above 2.

### 5.2 Weighted dimensions

| Dimension                                 |  Weight | What earns a 5                                                                                                    |
| ----------------------------------------- | ------: | ----------------------------------------------------------------------------------------------------------------- |
| Catalog breadth and level coverage        |       5 | Approved, full-length N5–N1 corpus across registers, genres, lengths, and interests; no level desert              |
| Freshness and publishing cadence          |       8 | Real dated additions, visible cadence, archive health, and new-to-user freshness without false labels             |
| Discovery, navigation, and search         |      10 | Lanes, categories, series, exact/semantic search, filters, stable Back/resume, related content                    |
| Personalization and rotation              |       7 | Explainable learner-edge ranking, exposure suppression, controllable diversity, deterministic session stability   |
| Card metadata and presentation            |       5 | JP/EN title, topic, level evidence, source, dates, duration, audio, state, and image where appropriate            |
| Core reader UX                            |      10 | Fast full body, literary typography, ruby/spacing/translation modes, resume, related/next, no dead state          |
| Audio and listening                       |      10 | Three excellent voices/styles, article/sentence playback, sync, speed, scrub, background, queue, offline          |
| Linguistic assistance                     |       9 | Context sense, reading, POS/conjugation, grammar role, pitch where reliable, examples, progressive notes          |
| Capture and canonical SRS                 |       8 | Article/sentence/word/kanji/grammar/audio saves with provenance into one event log, no implicit debt              |
| Adaptive AI                               |       6 | Explainable edge detection, cited explanations, practice synthesis, correction lineage, no AI grading authority   |
| Comprehension and transfer                |       5 | Evidence-backed questions, explanations, listening/production variations, objective progress without fake mastery |
| Sharing, continuity, and discussion       |       3 | Safe share links, sentence/bookmark continuity, discussion/tutor thread, exact context preservation               |
| Editorial quality, provenance, and rights |       5 | Author/source/license/editor/model/voice/approval truth visible and auditable                                     |
| Offline, performance, and accessibility   |       5 | Downloaded text/audio/data, fast open/play, WCAG 2.2 AA, VoiceOver, resilience, observable cache state            |
| Durability and engagement                 |       4 | Saved progress survives reload/device changes; Continue/forecast/history support long-term use without coercion   |
| **Total**                                 | **100** |                                                                                                                   |

Weighted points are `criterion score ÷ 5 × weight`. Divide the total by ten for the familiar 10-point score.

### 5.3 Hard gates and score caps

1. No reliable complete reader: Core reader = 0 and total cap = 30/100.
2. No working article audio: total cap = 60/100.
3. Freshness and discovery both below 2: total cap = 59/100.
4. No original-source/license truth: public release is blocked regardless of score.
5. Any meaning-changing, assessed-answer, name, number, source-span, or spoken-text mismatch is a release failure. The release gold set allows zero such defects. Minor cosmetic ruby defects use a separately published error budget and may never conceal a systematic reading error.
6. Save/SRS state loss after reload or offline transition is a release failure. For authenticated users—or wherever Bunki promises cloud/backup restoration—loss after reinstall or device restoration is also a release failure.
7. Private, unapproved, title-only, excerpt-only, duplicated, or inaccessible records do not count as public catalog breadth.
8. `Fresh` means newly published or newly added with a visible date. A shuffled old list may be `New to you`, never `Fresh`.
9. A control counts only when the complete action persists and can be recovered.
10. Without the complete physical-device journey—discover → open → read/listen → inspect → capture → review → return/resume—the relevant dimensions cannot exceed 2.

## 6. Current Bunki scorecard

| Dimension                         | Score / 5 | Weighted points | Reason                                                                                                                         |
| --------------------------------- | --------: | --------------: | ------------------------------------------------------------------------------------------------------------------------------ |
| Catalog breadth                   |         2 |             2.0 | 70 primary records and 694 archive rows exist, but 30 are private drafts and level/register coverage is not a finished product |
| Freshness                         |         0 |             0.0 | No ingestion/publishing cadence; no truthful fresh lane                                                                        |
| Discovery/search                  |         1 |             2.0 | Fixed list plus separate archive; shelf search is a dictionary search                                                          |
| Personalization/rotation          |         0 |             0.0 | Same stored order; no learner-edge feed or exposure suppression                                                                |
| Metadata/presentation             |         2 |             2.0 | JP/EN titles on 70 and some source/license truth; categories, most dates, duration, audio, and images absent                   |
| Core reader                       |         1 |             2.0 | Source and old screenshot exist; current operator route is not reliably attached or freshly demonstrated                       |
| Audio/listening                   |         0 |             0.0 | No reader audio or voice system                                                                                                |
| Linguistic assistance             |         2 |             3.6 | Ruby and contextual token doors are demonstrated historically, but no complete current-phone loop                              |
| Capture/canonical SRS             |         1 |             1.6 | Corridor-local capture exists; canonical one-state reader integration is not demonstrated                                      |
| Adaptive AI                       |         0 |             0.0 | No reader-edge AI loop                                                                                                         |
| Comprehension/transfer            |         0 |             0.0 | No per-article verified question/explanation system                                                                            |
| Sharing/continuity/discussion     |         0 |             0.0 | No sharing or sentence-anchored discussion; limited local resume only                                                          |
| Editorial/provenance/rights       |         2 |             2.0 | Source/licence and draft disclosure exist; 30 drafts have no human approval and generation lineage is incomplete               |
| Offline/performance/accessibility |         1 |             1.0 | Some static/accessibility work exists; text/audio download and current device evidence do not                                  |
| Durability/engagement             |         1 |             0.8 | Local finished/position state exists; no complete durable cross-surface proof                                                  |
| **Raw total**                     |           |  **17.0 / 100** | **1.7/10; operator lived score remains 3/10**                                                                                  |

This score is not an insult to the visual work. It is the consequence of scoring the whole learning loop instead of counting records and controls.

## 7. Binding product specification

### 7.1 Reading home: a living shelf

The default reading home contains these progressively disclosed lanes:

1. **Continue** — exact article and position, followed by recently started items.
2. **Fresh today / this week** — only genuinely dated additions.
3. **For your edge** — explainable recommendations near the learner's current comprehension boundary.
4. **New to you** — approved back-catalog material not recently exposed.
5. **By theme** — current affairs, culture/history, daily life, technology/AI, science/nature, spirituality/philosophy, literature/stories, essays/opinion, work/business, and JLPT practice.
6. **By level** — N5, N4, N3, N2, N1, plus measured comfort bands.
7. **Series and journeys** — coherent sequences with premise, order, progress, and next episode.
8. **Saved and history** — bookmarks, completed, downloads, and recent lookups.
9. **Surprise me** — learner-appropriate, exposure-aware selection with a reason.

The visual shell stays quiet. The first screen should answer four questions immediately: What was I reading? What is fresh? What fits me? What is due?

### 7.2 Rotation law

- Stable within a session; never reshuffle on each render.
- `Continue` is stable and state-driven.
- `Fresh` is chronological and truthful.
- `For your edge` may retain continuity but must rotate at least 30% between daily sessions when enough eligible material exists.
- The first twelve recommended items contain at least four categories and no more than two items from one source.
- Completed items are suppressed for a configurable interval unless a reread has an explicit learning reason.
- `Surprise me` does not repeat an item within the last fourteen uses and never leaves the learner's chosen difficulty envelope without consent.
- Back navigation restores the identical ordering and scroll position.

### 7.3 Article search

One reading-search surface indexes:

- Japanese title;
- English title;
- kana title/reading;
- article body and lemmas;
- category, series, register, and topic tags;
- JLPT and empirical comfort band;
- grammar and kanji targets;
- source/publisher;
- publication date and added date;
- duration/length;
- audio availability and voice provenance;
- saved/read/downloaded state.

Search supports exact and semantic modes, visible filters, clear/reset, Japanese IME, romaji, kana, kanji, and English. It must not silently turn into dictionary search.

### 7.4 Article-card contract

Every card displays, with progressive disclosure:

- Japanese title and English title;
- category/series;
- estimated level plus the evidence behind it;
- known-word/comprehension estimate for this learner;
- source and original publication date;
- Bunki added/reviewed date;
- reading/listening duration;
- audio availability and human/TTS label;
- unread/in-progress/completed/saved/downloaded state;
- visible draft/editorial warning where applicable.

Images are used when licensed and meaningful, not as generic decoration.

### 7.5 Reader contract

The reader is a real route/state, not an expanded card. It must provide:

- the complete approved body;
- exact Back and resume behavior;
- Japanese-first literary typography;
- font size, line height, measure, day/night, and washi theme controls;
- kanji as written / knowledge-aware / kana modes;
- furigana all / unknown / tap / off;
- spacing none / words / phrases;
- translation hidden / sentence / full modes;
- tap lookup and long-press full entry;
- sentence focus and sentence repeat;
- next/previous/related readings;
- save/bookmark/share/download actions;
- quiet immersive mode where controls recede;
- explicit loading, missing, offline, rights-blocked, and editorial-draft states;
- exact position restoration after navigation, reload, and offline recovery.

### 7.6 Audio and voice contract

No neural voice is accepted from marketing copy or one agent's taste. The candidate bake-off begins with this matrix:

| Candidate                                                                                                                                                 | Intended role                                                              | Verified reason to test                                                            | Main risk                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Human native-Japanese recording                                                                                                                           | Gold anchor; canonical stories, listening tests, pronunciation instruction | Editorially strongest reference and the model Satori uses with named native actors | Cost, cadence, and retake workflow                                                                                         |
| [Google Cloud Chirp 3 HD Japanese](https://cloud.google.com/text-to-speech/docs/chirp3-hd)                                                                | Clear article narration                                                    | Broad Japanese voice inventory, pronunciation controls, streaming/batch support    | Voice/model behavior can change; editor overrides still required                                                           |
| [Azure Japanese Dragon HD / neural voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)                           | Clear teacher and explanatory voice                                        | Named Japanese voices and enterprise SSML/tooling                                  | Style controls are not uniformly supported across languages/models                                                         |
| [ElevenLabs Japanese-capable models](https://elevenlabs.io/docs/overview/capabilities/text-to-speech) with a consented native-Japanese professional voice | Warm fiction/dialogue candidate                                            | Expressive long-form and dialogue capabilities                                     | Training-language accent, voice-rights, consistency, and model drift                                                       |
| [OpenAI `gpt-4o-mini-tts`](https://developers.openai.com/api/docs/guides/text-to-speech)                                                                  | Experimental dynamic conversation voice                                    | Instruction-controlled delivery and streaming                                      | Built-in voices are documented as English-optimized; not a canonical Japanese-reading default without blind-test clearance |

The eventual choices are expressed as user-facing styles, not vendor names:

1. **澄 / Clear reader** — neutral, intelligible news and essays.
2. **語 / Warm storyteller** — fiction and narrative prose.
3. **話 / Conversational** — dialogue and everyday pieces.

Required behavior:

- article play/pause;
- sentence play/replay;
- scrubber and ±10 seconds;
- 0.70×, 0.85×, 1.00×, 1.15×, and 1.30× presets;
- current-sentence highlight and auto-scroll;
- background/lock-screen playback;
- queue and continuous series play;
- per-article voice switching without losing position;
- audio download and offline playback;
- visible `human recording` or `neural voice` disclosure;
- provider/model/voice/version, generated-at, and approval metadata stored behind the user-facing style.

Each article stores both `surface_text` and editor-approved `spoken_text`, plus pronunciation overrides and sentence timestamps. Canonical dictionary readings and scored listening material may not rely on unreviewed TTS.

Release requires a randomized, blinded Japanese listening panel with at least 24 native listeners, a human-recording anchor, concealed provider identity, confidence intervals, and a gold set covering polyphonic kanji, counters/dates, names, place names, particles, numbers, loanwords, quoted dialogue, and N5–N1 prose. Score correctness, naturalness, listening effort, prosody, long-form consistency, and preference separately. Required targets:

- zero meaning-changing, name, number, counter, or place-name errors in the gold set;
- no more than one minor pronunciation defect per 1,000 mora after editorial overrides;
- mean naturalness ≥ 4.2/5;
- the winning neural candidate's confidence interval must not show a practically significant naturalness deficit against the approved threshold;
- sentence highlight alignment within 150 ms;
- cached playback begins within 500 ms and ordinary network playback within 1.5 s at p75.

### 7.7 Contextual learning assistance

A word or phrase tap opens the exact in-context sense first, then the full dictionary. The compact layer contains:

- surface, reading, lemma, and part of speech;
- conjugation/morphology;
- context-selected meaning and confidence;
- grammar role and register;
- pitch accent only when a reliable source supports it;
- word and sentence audio;
- two to four examples with provenance;
- one-tap `覚える` and list choice.

Extended grammar/culture notes remain sentence-anchored and use progressive depth. They must not swamp the text.

### 7.8 One capture and SRS law

The top-right `覚える` transaction is the same system everywhere. From the reader it may save an article, sentence, word, kanji, grammar point, or audio span.

A saved item preserves:

- source article ID/version;
- Japanese and English title;
- exact sentence/span and token identity;
- selected dictionary sense;
- reading and grammar context;
- audio voice/version and timestamp range;
- learner note/list;
- source/license/editorial status;
- created-at and later correction lineage.

Save/Keep creates no review debt. Explicit Learn or Master activates the canonical retrieval contracts. The Corridor-local `S.srs` and any Sites-local learner model may not become a second authority.

### 7.9 Comprehension and assessment

Every approved article has at least three editorially verified questions, with:

- answer and explanation;
- exact evidence span;
- one literal, one inference, and one language/structure target when appropriate;
- alternate listening form where audio exists;
- optional short production prompt;
- no schedule mutation from unverified AI judgment.

Question results become typed learner evidence. They do not collapse to a single global mastery number.

### 7.10 Sharing, continuity, and discussion

Every approved article has a canonical deep link and native share-sheet action. A share contains:

- Japanese and English title;
- publisher/author and Bunki attribution;
- licensed social-preview image or a text-only preview;
- article link plus optional sentence anchor;
- no learner score, list name, reading history, note, AI conversation, or other private state.

Sentence sharing obeys source-license excerpt limits and never republishes a full restricted body. A receiver lands on a useful public preview with the same sentence highlighted when rights permit; otherwise the receiver sees source metadata, a lawful excerpt, and the original-source/paywall route. Offline sharing queues the link without exposing cached private content.

Discussion or tutor threads are anchored to article version and sentence span. Corrections survive article revisions through explicit lineage rather than drifting to the wrong sentence.

### 7.11 Adaptive AI

AI may:

- explain the selected sentence at the requested depth;
- generate cited examples grounded in approved lexical/grammar facts;
- propose a context-rich SRS card;
- create a follow-up passage or dialogue at the learner's measured edge;
- create a study plan or diagnostic question set;
- recommend readings with an explicit reason;
- remember sentence-anchored discussions through a versioned derived learner graph.

AI may not:

- silently create review debt;
- grade recall without an accepted-answer/evidence contract;
- overwrite canonical dictionary facts;
- present generated text as human-edited;
- hide model, prompt/version, approval, correction, or deletion lineage.

### 7.12 Editorial, freshness, and rights pipeline

Every reading belongs to one visibly labeled lane:

1. commissioned or licensed originals;
2. public-domain works;
3. permitted feeds, link-outs, or user imports with rights retained by the source;
4. AI-assisted practice drafts, clearly labeled and private until human approval.

Every record carries:

- Japanese and English title;
- author and original publisher;
- canonical source URL;
- license/permission and allowed transformations;
- original publication date and Bunki added date;
- authoring method and model/prompt lineage where relevant;
- Japanese editor, annotation reviewer, and approval state;
- level evidence and target learner band;
- audio source/voice provenance;
- last content, reading, translation, and audio verification dates.

Prototype breadth milestone: at least 150 **approved** full readings, 30 per JLPT band, across at least ten categories. No category may contain only one token example. Private drafts are visible only behind an explicit prototype filter.

Freshness milestone: at least five approved additions per week across at least three categories and two learner bands, with the cadence visible. A smaller team may surface older items as `New to you`; it may not call them `Fresh`.

Longer-term beta milestone: at least 300 approved readings with no level or major-category desert.

### 7.13 Offline, performance, and accessibility

- A saved article downloads body, ruby, lookup essentials, notes, progress, and selected audio.
- Offline state is visible before the user boards the train or plane.
- Reader first meaningful text: ≤1.5 s p75 on ordinary mobile network, ≤500 ms warm cache.
- Tap lookup: ≤150 ms local p75.
- Text position and audio position survive reload and network transition.
- WCAG 2.2 AA, correct landmarks/language changes, Dynamic Type, reduced motion, high contrast, VoiceOver/TalkBack, external keyboard, and 44×44 touch targets are mandatory.
- Feed prefetch is bounded; the app may not download all article bodies shortly after boot.

## 8. Delivery sequence

### R0 — Evidence reset

- Pin one candidate URL and exact SHA.
- Capture current shelf and every route at 390×844, 320×568, large iPhone, and desktop.
- Publish a click ledger with pass/fail and console/network errors.
- Stop making completion claims from source inspection.

### R1 — Attach the reader

- Prove every eligible card opens the correct full body.
- Prove loading, error, offline, Back, reload, resume, finish, and rights-blocked states.
- Remove broken cards from the user-facing catalog.

### R2 — Replace the flat list

- Add the binding lanes, category taxonomy, exact/semantic search, filters, and rotation laws.
- Add complete metadata and truth labels.
- Add article/series visual identity without crowding the page.

### R3 — Attach audio

- Implement the provider abstraction and three voice styles.
- Ship article/sentence controls, sync, speed, queue, background, and offline.
- Complete the native-listener bake-off and reading-correctness gate.

### R4 — Close the learning loop

- Context sense, grammar notes, examples, and sentence audio.
- Canonical `覚える` and list transaction.
- Explicit Learn/Master activation into the one event-log/FSRS authority.
- Per-article comprehension with typed evidence.

### R5 — Add adaptive intelligence

- Explainable `For your edge` ranking.
- Sentence-anchored tutor memory.
- Provenance-visible practice synthesis, card proposals, and plans.
- Mock/diagnostic linkage without AI becoming memory authority.

### R6 — Editorial scale and dogfood

- Clear 150-approved-reading prototype gate and cadence gate.
- Run a seven-day operator trial using reading as the daily product, not a demo.
- Measure cold/practiced reading time, assistance rate, comprehension, saved-item follow-through, recommendation acceptance, audio use, resume success, and defects.

## 9. Acceptance matrix

The following are release-blocking executable gates.

### 9.1 Discovery and freshness

- Twenty cold opens across three learner profiles.
- Stable ordering within a session.
- At least 30% daily rotation in eligible recommendation slots.
- First twelve recommendations contain at least four categories and at most two from one source.
- `Fresh` timestamps are truthful.
- `Surprise me` has no repeat in fourteen uses.
- Back restores exact order and scroll.
- Fixed learner fixtures from beginner through advanced have explicit eligible, excluded, and expected-top-item sets.
- Recommendation eligibility and safety exclusions are 100% correct on the fixture set.
- Difficulty calibration, novelty, category/source diversity, and completed/recent-item suppression are reported separately.
- Every displayed reason is factually true for that learner and item; no generic “for you” reason receives credit.
- Personalized ranking must beat a dated, level-filtered unpersonalized baseline on predeclared relevance and acceptance metrics.

### 9.2 Search

- A versioned gold set contains at least 100 queries with expected relevant-result judgments spanning JP title, EN title, kana, romaji, body phrase, grammar, kanji, category, source, date, state, and audio.
- Exact known-item queries achieve Recall@10 ≥ 0.98; mixed discovery queries achieve nDCG@10 ≥ 0.85 against the judged set.
- Kana/kanji variants, full/half width, Unicode normalization, okurigana, and reasonable romaji variants resolve consistently.
- Zero-result states explain the active filters, offer recovery, and never silently become dictionary results.
- Query p95 is ≤300 ms from the local index and ≤800 ms where a remote semantic stage is required.
- Search works during IME composition, by keyboard, and with a screen reader.

### 9.3 Reader

- Open first, middle, last, draft, public-domain, licensed, missing, and offline records.
- Correct complete body and title pair.
- Exact position restoration within one sentence and 20 px.
- All display modes preserve meaning and controls.
- No dead or placeholder control.

### 9.4 Audio

- Three distinguishable voices/styles on the gold set.
- Article and sentence playback, speed, scrub, queue, background, download, and offline.
- Highlight timing and spoken-text correctness gates.
- Switching voice preserves sentence/audio position.

### 9.5 Lookup, capture, and SRS

- Context sense matches the sentence.
- Save every supported entity type.
- Reload/device restore retains exact lineage.
- Keep creates no debt; Learn creates only the declared contracts.
- Review answer snapshot returns to the source sentence and article.

### 9.6 Sharing and continuity

- Native share sheet produces the canonical deep link, JP/EN title, lawful preview, source attribution, and no learner-state fields.
- Sentence links reopen the correct article version and span, or degrade to a lawful source preview when excerpt rights do not permit it.
- Logged-out, paywalled, rights-blocked, offline, and deleted/revised article receiver paths are all tested.
- Share metadata leaks no learner ID, level, history, list, note, score, AI exchange, or private-draft body.

### 9.7 Editorial and rights

- No private draft appears in public lanes by default.
- 100% of visible items have author/source/license/approval truth.
- 100% have JP and EN titles.
- 100% of audio has human/TTS provenance.
- Every public body, reading, translation, question, and spoken-text override has an approval receipt.

### 9.8 Screenshot itinerary

For every candidate SHA, capture:

1. three consecutive cold-open reading homes;
2. every lane expanded;
3. category and level views;
4. exact and semantic search;
5. empty, loading, error, rights-blocked, and offline states;
6. article card metadata;
7. reader default and immersive modes;
8. ruby/spacing/translation settings;
9. word lookup, grammar note, examples, and sentence audio;
10. all three voice styles, speed, scrub, queue, background, and download;
11. `覚える`, list selection, Learn, review, and return to article;
12. comprehension answer and explanation;
13. `For your edge` reason;
14. exact Back/resume after reload;
15. VoiceOver/TalkBack and Dynamic Type;
16. 320×568, 390×844, large iPhone, tablet, and desktop.

Every screenshot is labeled with product, exact SHA/version, date, viewport/device, learner state, network/offline state, and preceding action. Marketing screenshots never substitute for live evidence.

## 10. Closure rule

Reading may not be called complete because:

- there are 70 or 700 records;
- `renderReader()` exists;
- a static screenshot looks attractive;
- a unit test passes;
- an AI can generate an article;
- a voice API can synthesize Japanese.

Reading closes only when the operator can repeatedly discover different worthwhile material, open it, hear excellent Japanese, understand it without leaving context, save precisely what matters, receive appropriate retrieval later, return to the same place, and trust the source, editorial, AI, and learner-state truth.

Until that journey is demonstrated on the current build and exact SHA, the reading section remains unaccepted.
