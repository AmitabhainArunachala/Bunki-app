# Bunki Phase 2 — Living Japanese Engine One‑Shot `/goal`

**Controller date:** 2026-07-30  
**Mode:** long-running, autonomous, implementation-first  
**Target:** replace the 35/100 broad prototype with a coherent, evidence-backed
learning specimen whose core loop is genuinely useful  
**Stop condition:** all acceptance gates below pass, or one irreducible external
gate remains with every key-independent surface finished and verified

---

## Executor prompt

You are the sole source-writing implementation agent for **Bunki Living
Japanese**. Continue from the current deployed Sites project and its current
human-approved public audience. Build, validate, and publish Phase 2 in one
continuous run. Do not ask the user for intermediate product choices. Use the
vision, observed 35/100 critique, current source, repository history, and
read-only specialist audits as inputs; use product judgment where details are
missing.

This is not a documentation exercise. The deliverable is the working public
application. Plans, diagrams, prompts, datasets, and tests count only when they
directly improve or prove the running product.

### Product truth

Bunki is one adaptive Japanese-learning organism, not a collection of tools. It
must combine:

- a Japanese–English dictionary;
- a kanji dictionary and kanji-learning system;
- a grammar curriculum;
- a reader comparable in daily usefulness to Todai;
- a living FSRS-based sentence-mining system;
- an AI-native conversational Japanese teacher;
- universal capture for articles, YouTube, podcasts, screenshots, PDFs, books,
  manual notes, and conversations;
- a persistent learner model that can begin at zero, N5, N4, N3, N2, N1, or
  beyond N1;
- cross-pollination of vocabulary, kanji, grammar, sources, conversations,
  mistakes, and scheduled reviews;
- an effortless walking workflow: save a URL now, enrich and mine it later;
- transparent provenance so every learned item can point back to where it was
  encountered.

The defining behavior is:

> encounter → understand → estimate knowledge → choose the n+1 edge → create or
> improve a learning object → review → update the learner model → reintroduce
> the same material naturally in a new context → measure whether it became
> usable.

If a feature does not strengthen that loop, defer it.

### Baseline honesty

The current build has useful infrastructure but is approximately 35/100:

- feature nouns exist, but the adaptive verbs are weak;
- the tutor fallback is deterministic rather than a live model;
- the learner model is a handful of statuses, not calibrated knowledge;
- source lineage is stored but weakly used;
- SRS review lacks editing, leeches, suspension, answer support, and card
  lifecycle control;
- the reader is not yet a dependable everyday reading environment;
- dictionary data volume is not the same as ranked, nuanced dictionary UX;
- kanji pages lack component, confusion, production, and phonetic-series
  pedagogy;
- level selection is not a credible zero-to-N1 curriculum;
- media ingestion is narrow;
- the first viewport is a dashboard rather than one clear next action;
- tests prove build/data/auth basics, not a real learning journey.

Never relabel a fallback as AI, raw corpus rows as curated lessons, generated
frames as natural examples, a count as mastery, or a stored link as active
cross-pollination.

---

## Operating rules

1. **One organism.** Use shared learner state, shared lineage, and shared
   scheduling across every surface.
2. **One obvious daily path.** The first viewport must answer:
   - what should I do now?
   - why this?
   - how long will it take?
   - what changed because of my last session?
3. **Main agent is the sole source editor.** Specialist agents may inspect,
   falsify, design tests, and review, but must not edit the Sites checkout.
4. **No mock-completion.** A button must either perform the action, expose an
   honest unavailable state, or not exist.
5. **No silent destructive migration.** Normalize old version-1 state into the
   Phase-2 schema and preserve sources, cards, reviews, messages, and memories.
6. **No unsafe credential handling.** OpenAI credentials are server-only
   production secrets. Never put them in source, browser storage, logs, or
   responses.
7. **Public read, identity-aware write.** Anonymous visitors may explore using
   device-local state. Signed-in users receive server-backed personal state.
   Model and transcript API routes must be bounded, authenticated, validated,
   and rate-conscious.
8. **Performance is product quality.** Do not load morphology and full
   dictionary machinery before the user needs it if that delays the daily
   screen. Avoid rebuilding large indexes on every keystroke.
9. **Accessibility is a gate.** Keyboard, focus, labels, color contrast,
   reduced motion, and touch targets must work.
10. **Finish the whole phase.** Do not stop at the first green build.

---

## Required Phase‑2 architecture

### A. Learner model

Evolve state without losing backward compatibility. At minimum model:

- stable concept identity for vocabulary, kanji, grammar, and constructions;
- exposure count and distinct-context count;
- first/last encounter and source lineage;
- recognition confidence;
- production confidence;
- listening confidence when evidence exists;
- uncertainty reasons such as meaning, reading, usage, kanji, grammar, or
  pronunciation;
- recent success/failure and lapse pressure;
- known, learning, fragile, unseen, suspended, and leech behavior derived from
  evidence rather than manually treated as truth;
- session history and daily activity;
- active goals, interests, start level, target level, and preferred content;
- placement evidence and a recalculable n+1 frontier.

Implement pure selectors that compute:

- due review queue;
- fragile queue;
- recent encounter queue;
- best next action;
- source readiness;
- candidate n+1 concepts;
- knowledge summary by level and skill;
- why a recommendation was chosen.

Every recommendation shown to the learner must include a short human-readable
reason.

### B. Woven learning engine

Create deterministic, testable functions that:

- extract candidate vocabulary and grammar from a source;
- score candidates using learner evidence, source recurrence, JLPT distance,
  frequency/rank evidence when available, and sentence usefulness;
- avoid particles, trivial fragments, known-easy items, duplicates, broken
  lemmas, and context-free cards;
- find a clean source sentence or bounded multi-sentence passage;
- connect vocabulary to its kanji, grammar, source, conversation, and previous
  encounters;
- generate a **learning packet** containing a small, editable set of high-value
  cards rather than dumping everything into SRS;
- reintroduce fragile concepts in a different source, generated sentence, or
  conversation prompt;
- keep generated material clearly marked and source material exactly traced;
- never claim a generated sentence is curated or native-verified.

Expose the weave in the product as useful actions and explanations, not a
decorative graph.

### C. Live teacher contract

Implement a server-side `/api/teacher` route using the OpenAI Responses API and
the current recommended GPT-5.6 family when `OPENAI_API_KEY` is configured.
Use a cost-conscious default suitable for frequent conversation and reserve
frontier depth for explicit deep explanation.

The model receives a bounded snapshot containing:

- learner level and goal;
- recent messages;
- current source excerpt;
- selected vocabulary/kanji/grammar;
- fragile and learning concepts;
- recent review evidence;
- interests;
- requested teacher mode.

Return schema-validated structured output containing:

- natural teacher reply;
- Japanese correction with original, corrected form, concise explanation, and
  severity when a correction is needed;
- detected vocabulary and grammar worth tracking;
- 0–3 editable card proposals;
- 2–4 meaningful next branches;
- learner-evidence updates;
- a short explanation of why the response matches the current n+1 edge.

The prompt must make the teacher:

- converse primarily at the learner’s comprehensible-input edge;
- correct without derailing the conversation;
- distinguish dictionary meaning, nuance, register, and natural usage;
- reuse relevant prior material naturally;
- avoid inventing source provenance;
- admit uncertainty;
- keep card proposals concise and pedagogically useful.

If no server secret exists, the interface must say **AI not connected** and
offer a clearly labelled local practice coach. Never present fallback output as
live AI.

### D. SRS and card lifecycle

Keep FSRS and add:

- card preview/edit before admission;
- cloze, recognition, production, listening, kanji, and grammar templates;
- source sentence, translation/meaning, reading, note, tags, lineage, and
  generated/source distinction;
- answer reveal and four FSRS ratings with keyboard shortcuts;
- undo last rating;
- suspend/resume;
- delete with confirmation;
- duplicate detection by concept + normalized context;
- leech detection and repair suggestion;
- daily limits and mixed queue ordering;
- visible “why this card now?”;
- review history and next due date;
- memory updates that distinguish recognition from production evidence;
- export of user-owned cards/state as JSON and a simple Anki-friendly TSV.

### E. Reader and source inbox

Make the reader a dependable primary workspace:

- source library with inbox, ready, reading, mined, and archived states;
- URL-only quick capture;
- resumable reading position and progress;
- font size, line height, furigana mode, focus mode, and translation/notes
  panels;
- sentence navigation;
- tappable morphology-aware tokens that preserve reading position;
- selected-sentence actions: explain, mine, mark understood, ask teacher;
- coverage estimate using learner evidence;
- detected grammar;
- source-level unknown/fragile/known summaries;
- staged mining packet preview;
- original-source link and provenance;
- public YouTube caption import when available;
- transcript paste with timestamp cleanup;
- honest paste/OCR placeholder when automatic extraction is unavailable.

Support the user’s walking workflow as a first-class mobile action:

1. paste/share a URL and optionally a title in under ten seconds;
2. see it in the inbox;
3. later attach captions or text;
4. let Bunki analyze it;
5. approve a small packet;
6. meet those concepts again in review and conversation.

### F. Dictionary

Upgrade search and entry usefulness:

- exact Japanese and reading matches before prefix and gloss matches;
- deduplicated senses and readable part-of-speech labels;
- search by kanji, kana, romaji, and English;
- visible match reason;
- learner status and encounter history;
- conjugation support for common Japanese inflections via morphology;
- commonness/frequency indicator only when supported by data;
- source occurrences;
- collocation/related-word section derived honestly from available data;
- editable notes and uncertainty tags;
- one-tap add to a staged learning packet rather than immediate noisy SRS;
- generated practice explicitly marked as generated.

### G. Kanji

Upgrade each kanji page with:

- readings, meanings, stroke count, grade/JLPT when present, and animated stroke
  order;
- components/radical information when supported;
- vocabulary grouped by reading or usefulness;
- known vocabulary using the kanji;
- confusing-neighbor practice using evidence available in the dataset;
- recognition and production prompts;
- handwriting self-check surface;
- connection to source sentences and current learner memories;
- honest KanKen-oriented stretch path beyond JLPT without pretending a complete
  KanKen corpus exists.

### H. Grammar and curriculum

Expand beyond a tiny flat list. Ship a useful, searchable grammar map across
N5–N1 with:

- pattern, meaning, formation, register, cautions, example, translation,
  related/contrasting patterns, and level;
- reader detection;
- staged grammar cards;
- contrast practice;
- learner evidence;
- curriculum lanes for zero/N5/N4/N3/N2/N1/N1+;
- a placement flow that is explicitly provisional and adjustable;
- different daily recommendations for a beginner and an N2→N1 learner.

Do not claim formal JLPT completeness without a verified complete licensed
corpus. The product may call the map a practical curriculum and show coverage
honestly.

### I. Media and capture

Within platform limits:

- preserve public YouTube caption import;
- accept and clean pasted VTT/SRT/plain transcripts;
- accept article, podcast, PDF, screenshot/OCR, book, conversation, and manual
  source types;
- add safe text-file upload if platform support is viable without widening the
  storage threat surface;
- structure podcast/RSS or audio transcription as honest ready/not-connected
  adapters when credentials or blob storage are absent;
- never silently scrape protected media.

### J. Daily UX

Replace the dashboard feel with a calm, decisive first viewport:

- one primary **Continue** action;
- a compact “Bunki noticed” explanation;
- today’s review/workload estimate;
- quick walking capture;
- a visible current thread/source;
- secondary access to dictionary, reader, teacher, review, kanji, grammar, and
  memory;
- progressive disclosure instead of simultaneous panels;
- excellent mobile bottom navigation and safe-area handling;
- no duplicated icons, placeholder metrics, misleading percentages, or sample
  content masquerading as the user’s history.

Preserve the dark navy, aged-paper, gold, and restrained vermilion visual
language. Make it feel like a quiet Japanese study, not a generic SaaS
dashboard.

---

## Acceptance gates

### Gate 1 — Migration and persistence

- Existing version-1 state loads without losing sources, cards, reviews,
  messages, or memories.
- Phase-2 state round-trips through device-local and signed-in D1 storage.
- Stale writes cannot overwrite newer state.
- Anonymous users do not share state.
- Oversized and malformed writes fail safely.

### Gate 2 — Beginner journey

From clean state, a learner can:

1. choose “from zero”;
2. receive a provisional starting path;
3. complete one comprehensible micro-lesson;
4. create no more than five useful cards;
5. review one card;
6. see the learner model change and understand why the next action changed.

### Gate 3 — N2→N1 immersion journey

A learner can:

1. quick-capture a YouTube URL while walking;
2. return later and attach/import a transcript;
3. read with morphology-aware lookup;
4. see a ranked unknown/fragile/grammar analysis;
5. preview and edit a small mining packet;
6. admit selected cards;
7. review them;
8. start a conversation in which at least one relevant concept is deliberately
   reintroduced;
9. trace every source-derived card back to the original source.

### Gate 4 — Dictionary and kanji

- Exact Japanese, kana/romaji, and English searches return sensible top results.
- Common inflected forms resolve to a usable dictionary lemma.
- A word page exposes senses, status, sources, uncertainty, kanji, and a staged
  card action.
- A kanji page connects stroke order, readings, vocabulary, sources, and
  recognition/production practice.

### Gate 5 — SRS

- New, review, lapse, undo, suspend, resume, edit, delete, duplicate, and leech
  paths are tested.
- Four ratings update FSRS deterministically.
- Review evidence updates the correct learner skill without falsely upgrading
  every dimension.
- Export includes every admitted card and its lineage.

### Gate 6 — Teacher

- API route rejects anonymous, malformed, oversized, and prompt-injection-shaped
  source payloads safely.
- With a mocked OpenAI response, structured output validates and maps into
  messages, corrections, evidence, branches, and staged cards.
- Without a key, the UI says AI is not connected and local practice remains
  usable.
- No key or internal prompt reaches the browser.

### Gate 7 — Product quality

- Production build and lint pass.
- Unit tests cover learner selectors, mining ranking, state migration, FSRS,
  duplicate/leech behavior, transcript cleanup, and AI schema parsing.
- Integration tests cover the beginner and immersion journeys.
- Primary mobile and desktop surfaces have no horizontal overflow, broken focus,
  inaccessible controls, or sub-44px primary touch targets.
- Initial daily screen does not require the full dictionary or morphology
  engine before it becomes usable.
- Large-source analysis is bounded and does not freeze the interface.

### Gate 8 — Honest completion

The final handoff must separate:

- working and verified;
- working but dependent on public third-party availability;
- implemented but awaiting a user-owned secret;
- explicitly deferred because it needs licensed content, external infrastructure,
  or a separate security decision.

No percentage score may be claimed without a named rubric.

---

## Execution sequence

1. Recover the current Sites checkout and independently inspect the deployed
   baseline.
2. Run three read-only specialist audits:
   - adaptive architecture/security;
   - Japanese pedagogy/content;
   - UX/journey/accessibility.
3. Convert audit findings into the schema and pure-engine layer first.
4. Add state migration and tests before replacing UI consumers.
5. Build the daily path and staged-learning-packet workflow.
6. Upgrade reader/source analysis, dictionary, kanji, grammar, and review.
7. Add the server-side teacher contract and mocked tests; connect production
   only through a server secret.
8. Run adversarial code/content/vision reviews.
9. Use agent-preview interaction QA when available; if unavailable after the
   bounded official attempt, use the production build and integration tests
   rather than improvising another browser.
10. Fix every P0/P1 issue and every acceptance-gate failure.
11. Checkpoint the exact tested source and publish it to the existing public
    Bunki URL.
12. Verify terminal deployment status directly.
13. Return only:
    - the public URL;
    - the genuinely completed loop;
    - test evidence in plain language;
    - any single irreducible external gate and precisely what unlocks it.

---

## Completion condition

Phase 2 is complete only when:

- the application behaves as one adaptive learning loop;
- both named journeys pass;
- the user can meaningfully use it on a phone;
- source-derived learning is staged, editable, scheduled, remembered, and
  reintroduced;
- live AI is connected and verified **or** all application work is complete and
  the sole remaining blocker is the absent production API secret;
- the public deployment is verified;
- the final report is honest about every dependency.

Continue autonomously until that condition is met.
