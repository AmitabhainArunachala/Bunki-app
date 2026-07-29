# Bunki Operator Product Lock

**Date:** 2026-07-29  
**Status:** Binding operator clarification  
**Scope:** Product identity, minimum product, and final acceptance

## 1. Authority

This is the plain-language product lock for Bunki.

It does not edit, weaken, or invalidate the frozen Bunki specifications. Their
rules for evidence, provenance, licensing, privacy, deterministic state,
export, AI authority, and review scheduling remain binding.

Where an earlier document is unclear about whether a capability is optional,
deferred, experimental, or merely an extension, this lock controls product
scope. A capability may be built in a later implementation phase, but it does
not stop being part of the minimum product.

Phase 0 and Campaign C1 are protected technical foundations. They are not the
goal of Bunki and must never be presented as the finished app.

## 2. The product in one sentence

**Bunki is one living Japanese-learning system that turns every chosen
encounter with Japanese into an interconnected path through understanding,
memory, reading, listening, kanji, and conversation.**

A learner saves something once. Bunki preserves it as one continuing learning
thread across:

- dictionary lookup;
- word, grammar, and kanji exploration;
- source reading and listening;
- AI conversation and explanation;
- sentence mining and spaced retrieval;
- later encounters in new contexts.

Nothing meaningful is silently lost. Nothing becomes mandatory review merely
because it was captured. The same learner state follows the item everywhere.

Bunki must serve a true beginner, an intermediate learner, and an N1+ or
Kanken-depth learner without forcing them through the same linear curriculum
or pretending that one global “level” describes everything they know.

## 3. The inseparable minimum

The capabilities below are one product. None is an optional add-on to a claim
that Bunki is complete.

### A. A complete, recursive dictionary

- Complete, versioned imports from the selected authoritative production
  dictionary and kanji releases—such as full JMdict and KANJIDIC2 releases—not
  a curated subset or demonstration seed. The release, license, coverage
  counts, update process, and deterministic reindex procedure are recorded.
- Fast local search by Japanese form, reading, inflection, English meaning,
  kanji, and pasted text.
- Clear senses, parts of speech, conjugation, examples, register, related and
  contrasting words, and source attribution where available.
- Recent lookups become durable encounters that can later be promoted, woven
  into practice, or discussed with the teacher.
- Recursive movement among a word, its sense, kanji, components, compounds,
  grammar, sentences, source encounters, and back again without losing the
  learner’s place.
- Linked grammar records cover the supported beginner-through-advanced
  language inventory and remain expandable when no single authoritative
  grammar corpus can honestly be called complete.
- Honest source and coverage gaps remain available through concise
  disclosures. Ordinary learner pages must not read like compliance reports.

### B. Deep kanji study fused with real language

- Production-scale kanji coverage with stroke order, readings tied to real
  words, compounds, components, sourced semantic and phonetic roles, frequency,
  and goal mappings where licensed.
- Kanji are fused into the learner’s actual words, sentences, media, reviews,
  and conversations rather than kept in a separate silo.
- A kanji first met through one word can return through compounds, component
  families, contrasting characters, authentic passages, audio, clozes,
  production, and later conversation.
- The experience supports practical literacy as well as N1+ and
  Kanken-depth exploration.

### C. A living SRS and sentence-mining system

- Any chosen word, phrase, sentence, paragraph, audio moment, image/OCR span,
  article passage, or conversation turn can become a durable learning thread.
- The thread preserves its authentic source, surrounding context, timestamp or
  timecode, the learner’s uncertainty, and later uses.
- **Capture creates no automatic review debt.**
- Only an explicit learner choice such as **Learn** or **Master** activates
  scheduled retrieval.
- The evidence-aware, pinned FSRS timing core stays beneath the experience. AI
  cannot directly alter FSRS state or quietly declare mastery.
- Review is not limited to tiny isolated flashcards. Bunki can use full
  sentences, 10–15-sentence cards, dense multi-paragraph readings, dialogues,
  one- to two-minute listening passages, clozes, sentence rebuilding,
  production, contrasts, and varied contexts.
- Existing Anki material and history can warm-start Bunki through a transparent
  import and mapping process. Imported history is preserved but is not treated
  as unquestionable truth.

### D. A recursive AI conversational language teacher

- AI conversation is a primary learning surface, not a one-shot explanation
  box.
- The teacher uses the learner’s actual threads, evidence, interests, recent
  sources, and fragile knowledge.
- It explains in context, asks useful questions, notices uncertainty, proposes
  practice, and can offer bounded two- or three-way learning journeys that
  later rejoin.
- It can move recursively from a sentence to grammar, vocabulary, kanji,
  components, contrast, production, and back to the original conversation.
- Conversation turns can be nominated for sentence mining and transformed into
  personalized practice after learner confirmation.
- AI output is visibly generated, sourced where factual, and unable to silently
  modify canonical dictionary facts, mastery, or review scheduling.
- Text, voice, and listening modes use the same learner state.

### E. A Todai-like living article reader

- Fresh Japanese articles open as calm reading surfaces with strong Japanese
  typography, optional furigana, tap lookup, source context,
  personal-frontier marking, and position-preserving navigation.
- When lawful source audio exists, the reader supports synced audio, speed
  control, seeking, replay, and capture from the exact text and audio position.
- AI help stays inside the reading context and remembers what the learner asked
  about or captured.
- A lookup or capture can circulate into dictionary pages, conversation, kanji
  exploration, sentence mining, and review.
- An article or selected passage can be deliberately transformed into
  source-anchored sentence-mining material without confusing authentic text
  with AI-generated variants.

### F. An immersion source inbox

One inbox accepts and remembers:

- articles, RSS items, and other primary reading sources;
- YouTube videos and lawful captions or transcripts;
- podcasts and lawful transcripts;
- screenshots, photographs, OCR text, books/PDF excerpts, and manual paste;
- iPhone share-sheet captures;
- AI conversations;
- recent dictionary lookups and saved encounters.

Each source item retains its identity, rights status, URL or file reference,
timestamp or timecode, processing status, transcript provenance, and captured
spans. A learner must be able to save a source in seconds while walking and
process it later.

The inbox also acts as a practical listening/reading queue. It records the
latest confirmed position and progress across sources and resumes through a
lawful embedded player, local user-owned media, or the official external app or
deep link. Bunki does not need to download protected media to provide continuity.

Transcript access uses a provider interface rather than one fragile scraper.
Allowed routes include publisher-supplied, officially authorized, user-owned,
user-supplied, or licensed/open transcripts and selected excerpts. Any other
route requires an explicit rights and terms review plus operator approval. An
unofficial YouTube transcript MCP may be evaluated with synthetic or
specifically authorized data as an experimental adapter, but it is not the
product foundation and cannot participate in acceptance or process live learner
sources without that approval. If Bunki has no permitted transcript route, it
keeps the source pointer and timecode, says so plainly, and offers a lawful
later path instead of ripping captions.

### G. Source recommendations and immersion tracking

- Bunki recommends useful primary sources near the learner’s current frontier:
  articles, videos, podcasts, stories, essays, and other authentic Japanese.
- Recommendations consider modality-specific evidence, interests, goals,
  register, density, and known/fragile/unknown language. They are not based on
  a single JLPT number.
- The learner can see why a source was suggested and can accept, dismiss, or
  correct the suggestion.
- Bunki remembers what was read or heard, how far the learner got, what was
  captured, what could not be processed, and which later learning experiences
  came from it.
- Source tracking supports immersion rather than turning leisure listening
  into an administrative chore.

### H. Personalized media weaving and reintroduction

Bunki does more than extract a list of unknown words.

With learner confirmation, it uses recent sources, conversations, lookups,
fragile knowledge, prior known language, interests, and goals to compose a
personal learning weave. That weave can include:

- source-anchored full-sentence cards;
- personalized multi-sentence cards and dense paragraphs;
- dialogues and recursive teacher conversations;
- listening passages and audio recall;
- clozes, sentence rebuilding, production, and contrasts;
- separate kanji practice that remains connected to the learner’s real words
  and sentences;
- fresh contextual variations that reuse the same language for a genuinely
  different purpose.

Authentic source material and generated material remain visibly distinct.
Generated material links back to the threads and sources that motivated it.
Important language should return at least three times in meaningfully different
contexts or styles when that is useful; superficial rewording of one template
does not count.

When several authentic sources contribute to one generated passage, card,
audio artifact, or export, Bunki preserves lineage at the smallest practical
quoted or derived span. Each span can retain its source identity and timecode or
text position; an artifact-level “AI generated” badge is not enough.

The complete weave must support and prove every major experience form: a
source-anchored full sentence, a dense multi-sentence or multi-paragraph
experience, an audio/listening experience where source or generated audio is
permitted, a cloze, active production, and separate kanji practice connected
back to real words and sentences. These are not interchangeable optional demos.

The target is the learner’s multidimensional **known/fragile/unknown frontier**:
challenging enough to grow, supported enough to understand, and never reduced
to a false scalar “i+1 level.”

### I. An iPhone-first daily experience

- Native iPhone capture, lookup, reading, listening, conversation, and review
  are the primary daily experience.
- Share-sheet/manual-paste capture, one-handed use, backgrounding, force-quit
  recovery, and offline core behavior are required.
- Web remains useful for long text, imports, administration, and broad
  exploration. Web proof does not substitute for native proof.
- Internal terms such as Phase 0, work packages, contracts, tiers, event IDs,
  or evidence machinery must not dominate learner-facing screens.
- The normal product should feel like one place: a guide and universal capture
  at the center, recursive Dictionary/Kanji/Grammar, finite Practice,
  Reader/Listener and source inbox, with Map/Garden and diagnostics as secondary
  views.

## 4. The shared learning metabolism

Every surface uses one learner model and one durable thread system:

1. **Encounter:** the learner reads, hears, sees, says, or looks up Japanese.
2. **Capture:** Bunki stores the encounter and its provenance without creating
   review debt.
3. **Understand:** dictionary, kanji, grammar, source context, and teacher help
   explain it.
4. **Nominate:** Bunki or the learner identifies useful words, kanji, grammar,
   sentences, and connections.
5. **Confirm:** the learner chooses Keep, Learn, Master, or Ignore.
6. **Weave:** Bunki creates or selects full-context learning material at the
   learner’s current frontier.
7. **Retrieve:** finite SRS sessions ask for real recall in suitable modalities.
8. **Reintroduce:** the same language returns in reading, listening,
   conversation, kanji, contrast, and new sources.
9. **Update:** valid retrieval evidence updates the relevant parts of the
   learner model. Passive exposure remains exposure, not mastery.
10. **Recommend:** Bunki suggests the next useful source or learning action and
    explains why.

This loop is the product. Separate tabs that do not share it are not.

## 5. Plain acceptance tests

### Test 1 — One-state trace

Capture one real phrase from an iPhone article. Without recreating it, find the
same thread in its dictionary entry, constituent kanji, AI conversation, finite
session, source inbox, and export. Every surface remembers the original sentence
and source position.

### Test 2 — No automatic debt

Capture twenty interesting items quickly. The review queue remains unchanged.
Promote exactly three to Learn. Only those three acquire scheduled retrieval
work; the other seventeen remain safely searchable and may resurface naturally.

### Test 3 — Ten-minute recursive walk

Start from one word and explore sense → kanji → component → compound → grammar
→ example → original source → related contrast → back to the starting thread.
For ten minutes there is no dead end, lost position, or context reset.

For the same source encounter, use at least one constituent kanji in a
reading/component/compound exploration, promote a connected learning
experience, retrieve it in SRS, and meet it later in conversation plus a new
context. A static component panel does not pass.

### Test 4 — Five-YouTube walk

During an ordinary walk, using only the iPhone:

1. Share five different Japanese YouTube videos into Bunki.
2. Bunki places all five in the immersion inbox with title, channel, URL,
   rights/transcript status, and usable timecodes.
3. Where a permitted transcript is available, Bunki obtains it through its
   declared provider. Where it is not, Bunki stays pointer-only and offers a
   lawful later route.
4. The learner keeps listening. There is no requirement to stop and perform
   dictionary work while walking.
5. The inbox keeps the five-source queue and the latest confirmed progress or
   resume anchor for each source, including when official external playback is
   used.
6. Later, Bunki compares available content with the learner’s state and proposes
   a manageable shortlist of uncertain vocabulary, kanji, grammar, and passages.
7. The learner confirms Keep, Learn, Master, or Ignore. Nothing was scheduled
   merely because the videos were saved.
8. The teacher explains connections among the sources and produces clearly
   labeled, personalized full-sentence and multi-sentence learning material from
   content Bunki is permitted to process.
9. At least one item is fused through kanji/components, and at least three are
   reintroduced in different forms such as source replay, a new paragraph,
   audio, cloze, and conversation.
10. A source-derived item returns to the correct original video and timecode.
11. After a force-quit and reopen, all five sources, positions, choices, and
    generated artifacts remain intact.

Caption ripping, lost timecodes, fabricated sources, automatic review creation,
or a generic unrelated AI lesson fails this test.

### Test 5 — Article to living study

Open one fresh Japanese article, read with optional furigana, tap several
lookups, ask the teacher a contextual question, and save one passage. Convert
only the learner-confirmed material into a source-anchored learning weave. Later
meet that language in a finite graded retrieval session and conversation, with
a route back to the original article and reading position. The confirmed item
has a versioned retrieval contract, receives FSRS timing only after promotion,
and updates only from valid graded evidence.

### Test 6 — Conversation and lookup to living study

Hold a real Japanese conversation with the teacher and perform several
dictionary lookups. Bunki remembers the useful turns and recent lookups, proposes
a small shortlist, and—only after confirmation—uses them in sentences,
multi-sentence passages, kanji fusion, and later conversation. At least one
confirmed turn and one confirmed lookup enter scheduled retrieval through
versioned retrieval contracts, are graded, and update the appropriate
modality-specific memory. Ad-hoc practice alone does not pass.

### Test 7 — Frontier recommendations from beginner through N1+

Using a clean beginner profile, an intermediate profile, and an N1+ profile,
complete the same real loop: receive an explained primary-source
recommendation, start it, record partial or complete consumption, capture
something, accept or correct Bunki’s estimate, and receive a changed follow-up
recommendation that reflects that evidence.

The true beginner receives kana, foundational language, and comprehensible
support without advanced clutter. The N1+ learner can immediately study formal
register, nuance, rare compounds, deep kanji, authentic dense prose, and
production without beginner gates. The intermediate learner is not treated as
an average of the other two. All three use one system and retain
multidimensional rather than scalar learner state.

A static list labeled N5/N3/N1, one beginner demo, or one advanced passage does
not pass. The recommendation explains why it fits; the learner can accept,
dismiss, or correct it; source progress is preserved; and that history affects
the next recommendation.

### Test 8 — Context variation

Promote one real item to Learn. Over subsequent use, encounter it in at least
three meaningfully different contexts or styles and at least two modalities.
Rewording one template does not count. Bunki records which encounters were
passive exposure, which were retrieval, and which were AI-generated. Across the
verified weave, exercise a dense multi-sentence or multi-paragraph form,
audio/listening, cloze, active production, and connected kanji practice rather
than substituting one easy form for all of them.

### Test 9 — Truth, rights, and correction

For any woven item, the learner can see whether each relevant span is
authentic, generated, inferred, or user-supplied; open each source when
permitted at the correct timecode or text position; and correct Bunki’s
interpretation. Verify this with a generated artifact that draws from at least
two authentic sources. AI cannot silently rewrite canonical facts, source
history, or memory state.

### Test 10 — Deep-engagement week

For seven consecutive days, the operator uses a signed native build on a
physical supported iPhone for real share-sheet capture, lookup,
reading/listening, conversation, and finite review without data loss or a
blocking failure. The week includes offline use, backgrounding or interruption,
and force-quit recovery. A PWA, simulator, or device-sized browser does not
count. The operator is not forced back to the old dictionary, Anki, or kanji app
for the normal loop and voluntarily continues into day eight.

Only the operator may declare this acceptance.

## 6. Anti-drift rules

Bunki is not complete if it is:

- an audit console presented as a learning app;
- a map or visual metaphor without the daily learning loop;
- a set of isolated dictionary, kanji, reader, chat, and flashcard tabs;
- an SRS with an AI explanation bolt-on;
- a transcript importer that stops at a vocabulary list;
- a collection of atomic cards with no dense or cross-context practice;
- demo content or simulated learner history presented as real;
- a single JLPT score presented as the learner model;
- a web mockup used as proof of native iPhone behavior;
- architecture, documentation, or test volume used as a substitute for missing
  learner-facing capability.

## 7. Product lock versus implementation phases

This lock defines what must exist, not how many campaigns, branches, pull
requests, agents, or weeks are used to build it.

Implementers may simplify architecture, reorder work, and land capabilities in
small reviewed slices. They may not:

- redefine the finished product as the current Phase 0 proof;
- call a preserved seam an implemented capability;
- remove a locked capability by calling it “future”;
- let one surface maintain a separate, contradictory learner state;
- expose verification machinery as a substitute for a coherent experience.

Each implementation phase must create visibly greater real-world usefulness.
“Bunki complete” is reserved for the inseparable product above passing the
acceptance tests, not for completion of an internal phase.
