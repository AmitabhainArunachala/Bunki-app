# Bunki SRS deck standard

Version: 1.0 proposed · 2026-10-04

Scope: every new or revised Bunki deck, including the app, standalone HTML and Anki.

Baseline reviewed: `d01dda7c2d3b312cae5ff1bec709ecae56e48ec4` (PR #116).

This is the requested implementation standard, not a declaration that current decks pass it.
The [review](review-2026-10-04/REVIEW.md) records violations, the
[fix plan](review-2026-10-04/FIX_PLAN.md) stages adoption, and the
[research](review-2026-10-04/RESEARCH.md) separates empirical findings, community practice
and design judgments. Existing frozen specifications remain unchanged. Direct learner
instructions control conflicts. The learner's 2026-10-04 clarification reopens the
brief's stated MCD choices. Method defaults below are recommendations for a
reading-first goal, not settled preferences or demonstrated format superiority.
Rules marked **decision** identify meaningful learner choices; reliability,
identity and evidence requirements do not depend on choosing MCD or 文.

## 1. Product and evidence contract

**S01. Proposed default:** targeted meaning retrieval from Japanese, with a prominent
word and enough source context to identify the sense. Offer selective MCD for
form, construction, collocation or spelling needs. Keep both existing entry points
and progress during transition, but move toward one sense collection with named
study presets and a shared workload budget. This does not merge different task
histories. MCD-first remains a valid learner preference to test. Keep a short English
gloss visible after the attempt by default; offer Japanese-first feedback as a
preference. Neither feedback language nor deck count is a scientific requirement.
See the [choice assessment](review-2026-10-04/RESEARCH.md#choices-reopened).

**S02.** A capture is an encounter, not enrollment. Saving a word opens the list
chooser; it preserves source, selected span and sense without creating a due date.
Only an explicit learner action starts scheduled retrieval.

**S03.** The device owns one append-only evidence history and one derived learner
model. Per-deck keys are compatibility views, not competing authorities. Exposure,
assisted practice, choice recognition, reading recall, listening, speaking and
handwriting remain distinguishable. Anki is a separate execution environment;
exporting a deck does not synchronize review histories.

**S04.** AI may propose examples, explanations, distractors and repairs. It must not
grade, append a review as the learner, set due dates or silently alter a retrieval
contract. Deterministic answer checking may provide feedback; the learner confirms
a scheduled result. Existing domain evidence-gate semantics are the reference.

**S05.** FSRS-6 is the sole scheduler. No second heuristic computes authoritative
intervals. Queue limits, sibling burying and learner pauses affect eligibility, not
FSRS due dates. Store their reasons separately.

Acceptance: capture creates no review; mode-specific events replay deterministically;
undo appends a revocation; storage failure leaves both model and visible progress
unchanged; export and replay reproduce the same state.

## 2. Method and what a card measures

Spaced retrieval with corrective feedback is the common foundation. A card's visible
cue and required response define its contract. A correct answer to one contract must
not stand in for success on another. No comparative trial found in this review
establishes that MCD is universally superior or inferior to TSC for Japanese SRS.

| Contract            | Front and task                                                                                              | Default role                                               | Evidence boundary                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Contextual cloze    | Coherent passage with one scored gap; retrieve the declared word, chunk, particle or character              | Selective form/use practice; optional MCD-first preset     | Cued recall, not proof of spontaneous production                           |
| Targeted sentence   | Target visibly marked; retrieve its contextual meaning; reading only if explicitly included in the contract | Provisional reading-first default                          | Targeted receptive retrieval, not the same as multiple choice              |
| Word first          | Target plus necessary sense/register cue; reveal context on request                                         | Faster variant where sense is clear; transfer/repair probe | Prevent homograph ambiguity; context reveal is recorded                    |
| Reading recall      | Written word in sufficient context; supply its reading                                                      | Optional for reading failures                              | Target furigana would reveal the answer                                    |
| Listening           | Audio first; retrieve meaning or transcribe the specified target; transcript after attempt                  | Optional, learner-selected                                 | Separate from visual recognition; TTS labelled synthetic                   |
| Constrained use     | Situation or collocation frame with a bounded response                                                      | Optional for words the learner wants to use                | More than one valid response requires alternatives or learner adjudication |
| Orthographic recall | Reading and context; recall a character or spelling                                                         | Optional 字 practice                                       | Mental recall is not evidence of handwriting motor skill                   |
| Four choices        | Choose among plausible, distinct options                                                                    | Practice by default                                        | Guessing/recognition must not improve a free-recall schedule               |

**S06.** Preserve a stable `contractId` per scored task. A mode switch can change
presentation without changing the contract only when required response and assistance
remain equivalent. Otherwise select a different contract or record practice only.
Never silently reuse the same FSRS state across all three current modes.

**S07.** MCD means focused retrieval within useful context. It does not mean every
passage must contain several unknown words, nor that every word needs a paragraph of
a fixed length. The learner should understand the scene before grading its gap.
Keep full context available; visually emphasize the local target clause. Do not
truncate into a fragment to hit a character quota. [AJATT original examples and
format evolution](review-2026-10-04/RESEARCH.md#primary-source-register).

**S08.** A gap is one scored unit, not necessarily one glyph. Whole-word, kana-chunk,
collocation and particle gaps are allowed when meaningful and answerable. Generate
字 gaps only from verified reading alignments. Never require a guessed per-character
reading of a jukujikun or proper name.

**S09.** A model ranking the intended answer first does not prove a cloze unique.
Review realistic alternatives. Add a sense/reading cue when it does not answer the
task, accept an explicit alternatives set, or use a different contract. A learner
who supplies another valid word needs an “also fits” route, not a compulsory fail.

**S10.** Preserve natural modern spelling and register. Do not force rare kanji
spellings just because a dictionary lists them. Literary forms and slang need
register labels and suitable contexts; 係助 is a dictionary label, not ordinary
conversation vocabulary. Single kanji are identified as character/morpheme targets
inside a specified host word, not mislabeled standalone words.

## 3. How many contexts and which order

**S11.** Do not treat any fixed count as a learning optimum. A single adequate context
may suffice; several may be justified by sense, register, active-use needs or a
specific failure. Begin with an effective anchor and stop adding scheduled contexts
when they add no material benefit within the learner's time budget. Reference
examples need not all become cards. Every added context records its purpose. A new sense gets its
own sense identity, gloss and eligible contract; unrelated senses must not share a
generic Japanese definition.

Selection order is the learner's actual encounter when suitable, then a verified
authentic example, then an explicitly labelled original when it adds necessary
clarity or fills a documented gap. Clarity and sense fit outrank an automatic
“real first” or “written first” rule. Familiar context can support initial learning;
later different contexts and delayed probes test transfer. The research does not
establish a universal 3-day or 14-day unlock threshold.

| Entry type or need    | Selection rule                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Frequent, useful word | Start with the encountered sense; add a contrasting collocation/register only for a clear learning need |
| Polysemous word       | Separate selected senses; contextual gloss on each card                                                 |
| Rare/literary word    | Retain exact register; default to understanding the encountered use; additional production is voluntary |
| Slang/onomatopoeia    | Natural spoken or informal context; spelling, tone and connotation recorded                             |
| Set phrase            | Treat meaningful phrase as a unit; partner-word practice is a separate contract                         |
| Single kanji          | Host-word sense and contextual reading take precedence over a list of every dictionary reading          |
| Repeated failure      | Diagnose the cause before adding debt; offer repair, pause or another context                           |

**S12.** Existing schedules and identities survive the transition. Replace current
3/14-day unlock heuristics for new enrollment with explicit comprehension, task
intent and workload checks under a versioned policy; do not present these thresholds
as empirically established prerequisites. Do not label stability as mastery. Do not
automatically add a new sibling after three lapses: offer a repair preview that the
learner accepts. **Decision:** make automatic 字 generation opt-in for new
enrollments; preserve and continue existing 字 progress.

**S13.** Default sibling protection applies across both decks by shared lexical
sense/family and, where appropriate, passage. It survives reopening, reload and
midnight/timezone changes according to an explicit study-day policy. It suppresses
other cards that could cue the same answer; it does not suppress legitimate
same-card learning steps. Burying is an engineering policy, not a proven optimal
24-hour biological interval. Show deferred counts honestly.

## 4. Sourcing and rights

**S14.** Every passage records `sourceId`, title, creator where available, original
URL or corpus record ID, retrieval date, source revision/hash, exact quoted span,
language/register, provenance category, and a rights record. Every adaptation and
translation has its own provenance. A source domain is not a sufficient citation.

Source preference and redistribution permission are separate dimensions:

| Tier               | Material                                                 | Public artifact rule                                                          |
| ------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Encounter          | User-selected reading/listening context                  | Private by default unless redistribution rights are established               |
| Verified authentic | Original source or traceable corpus example              | Ship only under documented applicable permission/license                      |
| Adapted authentic  | Edited or simplified original                            | Label adaptation and retain transformation lineage; confirm derivative rights |
| Written            | Original human/AI-assisted composition                   | Label 書き下ろし, record authorship/review; do not invent source citations    |
| Unverified         | Broken provenance, uncertain rights or unverified claims | Hold from public release; do not count as verified authentic                  |

**S15. Proposed sourcing policy:** minimum real-text coverage is not an arbitrary percentage:
for every selected sense with a suitable, verified, redistributable authentic
candidate, retain at least one authentic context unless a documented learner/editor
reason rejects it. A failed search or rights problem can leave zero authentic
contexts for that sense. There is no unconditional deck-wide percentage floor.
This is an editorial preference to test, not a proven retention requirement;
a clearer original can be the learning anchor even when authentic references exist.
Report authentic, adapted, written and unresolved shares over **unique passages**,
plus coverage by sense and source. Do not inflate the real share by generating many
cards from one authentic passage. No quota may cause poor text to be shipped.

**S16.** The previous “web quotation (personal study)” label is not public
redistribution permission. GitHub Pages, downloadable HTML, TSV and APKG are public
distribution surfaces. The public build excludes unresolved rights records.
Private encounter storage remains separate. Legal eligibility is determined from
applicable terms/permission and, when needed, jurisdiction-specific review, not from
a text-length heuristic or the presence of a link.

**S17.** For Aozora, inspect the exact work's copyright-status card and permission;
the site is not uniformly public domain. For ND/NC-ND material, unchanged underlying
text alone does not establish permission for translations, cloze transformations
or every commercial use. Default public profile excludes these transformations
without documented clearance. Record per-work/per-version CC attribution and
share-alike obligations for Wikimedia/corpus material; do not substitute a mirror's
software license for rights in its text. For Tatoeba/SNOW, retain exact corpus and
sentence identifiers and contributor/license data instead of collapsing them into
one generic bank. Rights checks apply to audio, images, definitions and kanji data too.

Acceptance: `rights.distribution` explicitly allows every emitted artifact;
unresolved records fail the public build; attribution exports with each artifact;
quoted source span matches its pinned source; adapted/written text cannot be
counted as verbatim authentic material.

## 5. Writing, translation and Japanese quality

**S18.** Write a coherent situation with a clear referent and the intended sense.
Use typical collocations and the register the learner would meet. Dense context
means useful information, not redundant sentences or harder vocabulary surrounding
an easier target. No obligatory 2–4 passages, 2–4 sentences or 1–2 originals.

Reject unresolved anaphora, mid-sentence excerpts, unexplained abbreviations,
unnecessary proper-name lists, repeated canned explanations, translationese and
definition-like “Xとは…である” padding unless the genre warrants it. These are
review flags, not blanket bans on natural Japanese connectives or technical Latin
letters. Do not mechanically remove parentheses or reorder sentences in quotations.

**S19.** Distinguish a fictional illustrative scenario from a factual explanation.
Laws, numerical thresholds, dates, scientific mechanisms, election statistics and
historical claims require an authoritative fact-check record with date. If the
detail is unnecessary, use an explicitly fictional scenario instead. Avoid
floating “last election” and undated “currently” claims in durable cards.

**S20.** Every card binds a selected sense to `glossEn`, a plain `definitionJa`,
contextual reading and faithful translation. An English gloss should be simpler
than a dictionary essay. The Japanese definition must not merely repeat the target
or use needlessly harder words. Translation is checked independently for negation,
modality, tense, referents and numbers; it must preserve errors only in clearly
labelled quotations, never silently repair a factual mistake on the Japanese side.

**S21.** Tokenization is candidate generation, not lexical truth. Match lemma,
part of speech, sense and exact span. Variant mappings are typed by lexical entry:
撹拌/攪拌 is not permission to equate any substring or homophone. Negative fixtures
include 率直≠率 as rate, きれいなお花≠なお, 県ごと≠ごとく and 失敗しがち≠slang ガチ.
Morpheme/character targets within compounds require a separate explicit target kind.

**S22.** Ruby must reconstruct the source exactly and be lexically correct. Keep
whole-word ruby for irregular readings; `讃岐→さぬき` does not license `讃→さぬ`
as a general character reading. Never fabricate a split to satisfy a validator.
Review non-target readings too (e.g. 一般の方, proper names, dates, counters).
Correctly suppress an unsupported 字 card rather than fill it with a guess.

**S23.** Front-render checks search every visible region, hint, ruby, title,
accessibility label and alternative spelling for answer leakage. Multiple target
occurrences require reviewed masking or a different excerpt; first-occurrence-only
replacement fails. Kanji gaps also check whether another compound reveals the
same character. A default Japanese hint is not automatically appropriate.

Acceptance: schema, exact/near duplicate, target boundary, repeated answer, ruby,
source, sense and factual-claim checks all pass; flagged rows have a named disposition.
No automated naturalness score is represented as native-editor approval.

## 6. Card anatomy, assistance and copy

**S24. Front:** small task label; readable passage with one focal target; only cues
allowed by the contract; one clear reveal control. For 文, no target reading or
meaning before the attempt. For 字, reading may be a legitimate prompt. For listening,
transcript is hidden until attempt/reveal. Background assistance is allowed without
being confused with target retrieval.

**S25. Back:** recovered passage/target → target form and contextual reading →
plain English gloss (recommended visible default; optional Japanese-first order) → short Japanese sense definition →
optional relevant kanji explanation → expandable full translation → source and
rights link → optional mnemonic/audio/pitch note. Keep the response and grading
controls easy to reach; long content may scroll without hiding essential feedback.
Do not show every dictionary reading as the answer to one contextual reading task.

**S26.** Record whether the learner attempted recall before reveal. Ordinary
post-attempt answer checking is not a failed review. A target-revealing hint used
before recall prevents an unaided pass under the existing contract. Assistance
already specified in a contract (e.g. pronunciation cue for orthography) is different.
Do not retrospectively guess which occurred from a final Good button alone.

**S27.** Default scheduled grading is two visible buttons: `もう一度` / `思い出せた`
(Again/Good). Hard/Easy may be an advanced option with plain guidance; Hard always
means recalled with difficulty, never forgotten. `覚えた` must not promise permanent
mastery. Choice practice shows feedback and awaits learner confirmation before any
separate scheduled-choice event. Reveal, hint and scoring transitions are idempotent.

**S28.** Use ordinary Japanese and English. Explain “one blank” instead of MCD
internals in task instructions; keep technical details in optional method/help.
Use `漢字の形と意味` instead of making a heuristic decomposition sound anatomical or
etymologically authoritative. Mnemonics are labelled memory aids, not origin facts.
Do not claim a theme, texture or hue increases retention without a measured study.

## 7. Scheduling and workload

**S29.** Preserve the pinned `ts-fsrs` 5.4.1 / FSRS-6 configuration initially:
desired retention 0.90; fuzz off; 1m/10m learning; 10m relearning; 36,500-day maximum;
8-decimal state precision; append-order monotonic clock policy. These are compatible
defaults, not demonstrated optima for these decks. Keep raw press time and effective
scheduler time separately. Parameter updates are versioned and learner-confirmed.

**S30.** Learning cards never appear before their due instant as scheduled reviews.
If waiting would end the sitting, show the next due time and let the learner leave.
An explicit practice-now action writes practice evidence and does not impersonate
an on-time review. Persist a bounded sitting plan and counts for due, new, deferred,
buried and next-learning items. Daily review handling uses one documented study-day
cutoff; do not mix local-date semantics with timestamps without a rule.

**S31.** One new-card budget covers the learner's scheduled decks. Existing per-deck
budgets remain readable during migration. Offer zero new cards, pause, and a time
budget. Do not force all 2,100 available cards into active study. Retention tuning
is based on clean history, observed workload and held-out calibration, not cloze vs
recognition labels alone. No automatic 0.95 target for a supposedly harder deck.

**S32.** Six genuine card lapses is a provisional repair trigger, not a scientific
constant and not the sum of all siblings' failures. Offer: inspect ambiguous cue,
fix sense/reading, reduce assistance mismatch, add a mnemonic, propose another
context, pause or retire. Never automatically replace the content under an existing
contract or unlock more debt because the learner failed.

**S33.** Progress reports distinguish “introduced,” “due,” “in review” and measured
transfer. One final sibling in review cannot mark a whole word known while an
earlier sibling is relearning. Estimated recall is an estimate with time/context,
not a proficiency certificate. Review speed is diagnostic, never an automatic grade.

## 8. Visual and interaction system

**S34.** Deck identity, part of speech, topic and grading state have separate visual
roles. Pair semantic colors with text/shape; test normal and common color-vision
deficiency views. A topic edge is optional and never needed to solve a card.
Preserve saved theme preferences; make distinct deck defaults optional. Reconcile
shared semantic tokens with the wider app. Color variety is a preference, not a
requirement for learning or a reason to fail contrast thresholds.

Use one named semantic palette in app and exports: noun → blue/cyan; verb → amber;
adjective → green; adverb → violet; expression → teal; onomatopoeia → rose;
unknown/other → neutral. Themes change luminance to pass S35, not the assigned
category. These are proposed design roles, not memory-effect claims. Keep the
written POS badge authoritative. A registry maps each immutable topic ID to one
edge token used consistently in app and Anki; changing source kind must not change
that edge. Source kind uses its own written label. Optional topic hue changes do
not change a retrieval contract. Textures stay outside the text surface or are
included in worst-pixel contrast testing; no animated/decorative texture behind ruby.

**S35.** Test all text against its actual composited background in every theme and
state. Minimum normal text contrast 4.5:1, large text 3:1, essential UI boundaries
3:1; use 7:1 for passage text as the project target. Muted source text, POS labels,
glosses, ruby and colored targets count as text. “High contrast” must satisfy the
same rules; an attractive screenshot is not a measurement. See W3C sources in the
research register.

**S36.** Phone reference viewport is 390×844; also test 320px, 200% zoom and dynamic
text. Start with passage 24px and ruby 12px as design defaults, not universal
legibility thresholds. Reflow with native ruby; do not clip long compounds. Grade
buttons and other frequent touch controls target at least 44×44 CSS pixels; preserve
keyboard focus and accessible labels. Textures may not reduce measured contrast.

**S37.** Swipe grading requires horizontal intent, a completed pointer-up and
visible outcome feedback. Vertical scrolling, `pointercancel`, selection, source
links and details taps never grade. Buttons provide equivalent operation. Undo is
reachable by touch on the final/done screen too, not only by a keyboard shortcut.
Reduced-motion preference removes transforms, animated progress and unnecessary
transitions. Focus follows screen transitions and errors are announced accessibly.

**S38.** Add visual-memory features selectively: source-backed component structure,
optional stroke-order access, learner-written mnemonics and relevant licensed images.
Prioritize sense-correct audio and reading accuracy over decorative density. Pitch
accent is optional, sourced and variant-aware; synthetic audio is not evidence for
a particular native pitch pattern. Stable spatial placement supports usability;
transfer probes vary nonessential context to check cue dependence.

## 9. Content schema and migration

Version 1 cannot express sense-specific tasks, provenance verification and assistance
history adequately. Define `bunki-srs-content` version 2; retain adapters for existing
`bunki-cloze-deck` v1 and `bunki-srs-deck` v1. Content format, content revision,
evidence format, scheduler pin and renderer version are separate fields.

**S39. Required v2 records:**

| Record             | Required fields and checks                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deck               | Immutable `id`, `format`, integer `schemaVersion`, `contentRevision`, title, groups, default presentation, artifact profiles, source/word/passage/contract collections                                                                |
| Lexical entry      | Stable `wordId`, lemma, orthography variants, POS, target kind, group IDs; no duplicate IDs                                                                                                                                           |
| Sense              | Stable `senseId`, word ID, contextual gloss/definition, register, dictionary reference/review status                                                                                                                                  |
| Passage            | Stable `passageId`, exact text, translation + provenance, source ID, source span, revision/hash, editorial status, factual checks                                                                                                     |
| Retrieval contract | Immutable `contractId`, legacy card ID if any, sense/passage IDs, task kind, exact Unicode target spans, response specification/alternatives, allowed cues, sibling families, contextual reading and verification                     |
| Source             | Per-record provenance and rights fields from S14–17; HTTPS or approved safe URL scheme; content may be held separately if redistribution is restricted                                                                                |
| Ruby span          | Valid character offsets, surface, reading, verification/source and alignment type; exact text reconstruction                                                                                                                          |
| Evidence event     | Unique ID, append sequence, device ID, event kind, contract/content revision, raw and effective time, attempt/reveal/help observations, learner-confirmed grade when eligible, scheduler pin/policy IDs, causal/revocation references |
| Preference         | Per-deck display settings and global workload settings, separately versioned and validated; never authoritative knowledge                                                                                                             |

All numeric fields are finite and bounded; enums, valid dates, unique IDs, referential
integrity and supported versions are checked before use. Unknown future state is
preserved/quarantined, not normalized into an empty successful restore. Loading
untrusted JSON must not evaluate code or accept unsafe source URLs.

**S40. Migration discipline:**

1. Export exact legacy bytes and counts before migration, with a checksum.
2. Freeze current `kotoba-mine` and `kotoba-mcd` card IDs and Anki GUID mappings.
   Reordering contexts must not regenerate positional identities.
3. Import existing state as a labelled legacy baseline plus the surviving historical
   tuples. Do not invent lost events, modality, assistance or clock provenance.
4. Preserve each snapshot's due/state so scheduling continues. Legacy snapshots
   seed replay explicitly; newly appended evidence is the authority thereafter.
5. Use an idempotent migration receipt with input hash and policy version. Replay
   and export round-trip tests prove no lost, duplicated or newly due cards.
6. Continue to recognize `bunki-cloze:<deckId>` and v3 preference keys. A reader
   detects migrated ownership and prevents dual writes. Do not erase old bytes as
   part of a successful migration; retain the rollback artifact.
7. A correction that changes the required answer/sense creates a new contract with
   a link to the old one and explicit enrollment; typographic fixes can keep the
   contract while incrementing content revision. Never award transferred mastery.

**S41.** Backup and import validate the entire envelope before mutation. Wrong
deck, empty object, future version, invalid dates/state, duplicate IDs or conflicting
events fail visibly and leave current bytes untouched. Import merges append-only
events with deterministic deduplication; replacement is an explicitly described
recovery action with its own preserved backup. Undo appends a revocation.

## 10. Reusable deck factory

The following layout and CLI are **specified for implementation**, not existing
commands. Reuse the current tokenizer, dictionary data and FSRS core; do not build a
new app or scheduler.

```text
decks/<deck-id>/
  deck.config.json
  source/words.json
  source/senses.json
  source/sources.json
  source/passages.json
  source/contracts.json
  source/decisions.jsonl
  source/rights.json
  locks/dependencies.json
  locks/source-manifest.json
  qa/editorial-review.jsonl
  qa/fact-checks.jsonl
  qa/waivers.json
  release/
tools/deck-factory/
prototypes/corridor/decks/registry.json
```

**S42.** A manifest pins inputs, source versions/hashes, dependency versions,
tokenizer dictionary/overrides, ranker configuration, prompts, model-run provenance
when relevant, accepted outputs, reviewer dispositions and generator version.
Never commit secrets or unlicensed full text. Cache permissible extracts by hash;
for restricted text retain a private cache and sufficient retrieval metadata.
Separate **rebuilding approved content** from **repeating acquisition and selection**.
Document exactly which can run offline.

**S43.** Proposed CLI stages are `acquire`, `rank`, `review`, `validate`, `build`,
`verify` and `register`, taking `--deck` and an explicit public/private profile.
`build --offline --frozen` consumes only approved locked inputs. It produces app
JSON, standalone HTML, APKG, TSV, attribution and a release manifest. Failures do
not partially overwrite a known-good release. Canonical JSON and HTML are byte
deterministic; APKG is either deterministic with a fixed build epoch or compared
by a documented semantic manifest excluding unavoidable container timestamps.

**S44.** LLM proposals use a strict schema; validate spans, source matches, ID
uniqueness, omitted input words, sense compatibility, repetition, duplicates,
readings and factual claims. A second pass reviews meaning/translation independently
from the authoring pass. Machine agreement is not independent human certification.
Acceptance records identify the actual reviewer role and uncertainty.

**S45.** GDEX-style ranking is a triage tool. Version weights and retain component
scores and rejection reasons. Use context-appropriate soft penalties for names,
length, background difficulty and register. Do not import European word-length or
Japanese document-readability cutoffs as universal laws. The learner's familiarity
is inferred cautiously from evidence; JLPT lists do not prove a word is known.

**S46.** Register a deck once. Generate chooser entries, deep links, service-worker
asset manifests, Pages packaging, offline dependency closure and verifier cases
from `registry.json`. The build checks that every generated consumer matches the
registry and that every registered artifact is included. Counts are derived.

## 11. Anki and standalone parity

**S47.** Preserve shipped model IDs, deck IDs, field order and GUIDs for updates.
Add a tested field migration rather than silently renaming/reordering fields.
Reimport into a collection with real scheduled cards must update approved content
while preserving note/card count, due dates and review history.

**S48.** Retain the existing custom Basic-note cloze format for current
decks to protect identity. Prefer native Anki cloze for a future deck when one source
note should naturally generate related clozes and all clients render it correctly.
Do not convert existing notes merely for theoretical purity. Basic custom clozes
are valid presentation, but distinct notes are not Anki siblings: explicitly disclose
that ordinary sibling burying cannot implement Bunki's lexical-family rule.

**S49.** Anki parity covers target, task, sense, reading, passage, translation,
source/rights, visual semantics and optional media. It does not mean the web app
controls Anki's scheduler. Provide tested setup instructions for compatible FSRS-6,
0.90 retention and grading; export metadata declares actual scheduler configuration
included or absent. Never claim APKG imported under the recipient's default preset
automatically uses Bunki's settings.

**S50.** Native cloze hint syntax, custom blank rendering, ruby, day/night theme,
long passages, font fallback and accessibility must be tested on actual supported
clients. Desktop backend import/render is partial evidence; AnkiMobile and AnkiDroid
require device/client checks. New models avoid reserved field names such as `Type`.
Existing field changes require migration evidence.

**S51.** Standalone HTML bundles content, scheduler pin, engine and rendering
dependencies without hidden network requirements. State remains origin/device-local;
opening the same file elsewhere does not synchronize progress. Clear storage error
and export/recovery flows are required, including environments that restrict `file:`
storage. No claim of native iPhone persistence without a physical-device test.

## 12. Merge and release gates

Every release has a checklist mapping each numbered rule to evidence or an explicit
hold. Existing green tests do not waive a violated rule. The following are required
target gates; the review's verification file states which exist and ran today.

| Gate                | Required acceptance                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Content             | Both styles, every card: unique IDs, complete references, correct spans, no visible answer leak, ruby reconstruction, sense-specific answers, source/rights validation                                        |
| Japanese editorial  | For the first corrected release: qualified Japanese review of every active passage/gloss/translation and all irregular readings; do not represent this 73-word audit as that sign-off                         |
| Subsequent sampling | All changed/written/high-risk items plus a reproducible stratified sample of unchanged words: at least 60 or all if smaller, covering every topic and hard case; expand affected class when defects are found |
| Identity            | Frozen legacy-ID/GUID manifest; reorder test; content revision and contract migration fixtures                                                                                                                |
| Scheduling          | Due-boundary fake clock, short/empty queue, reload/reopen, global new cap including zero, timezone/day cutoff, sibling protection, lapse repair, no passive scheduling                                        |
| Evidence/storage    | Atomic failed writes, invalid imports, unknown versions, lossless export, append-only undo, long history, clock skew, duplicate events and multi-tab conflicts                                                |
| Modes               | Every mode × both decks; hints and choice cannot credit unaided recall; per-deck preferences persist; last-card undo works                                                                                    |
| Visual              | 390×844 front/back matrix for every theme/mode/deck; computed text contrast incl. ruby and semantic colors; 320px/zoom/reduced motion; keyboard/touch/assistive semantics                                     |
| Anki                | Real backend import, reimport after review, information parity and rendering; manual AnkiMobile/AnkiDroid checklist with versions                                                                             |
| Offline/update      | Fresh install, then first-ever deck open offline in a fresh tab; warm reopen; every transitive dependency; interrupted update; coherent content/engine/pin version; learner data unchanged                    |
| Repository          | Build, targeted verifier, format, lint, unit tests; corridor walk and storage pins when integrated code changes                                                                                               |
| Deployment          | PR CI exercises actual release output; registry drives packaged-asset tests; approved production branch only; rollback-ready release manifest                                                                 |

**S52.** Service-worker installation caches the complete declared dependency
closure, including FSRS and its pin. A coherent version is activated only when its
required assets are available. Offer an update notice and safe restart after a
committed answer; preserve progress and offline content through version changes.
Browser storage eviction is handled through honest local-storage status, durable
storage requests where available, and learner-owned exports.
Cache cleanup is restricted to this app's namespaced keys and explicitly known
retired versions; an unrelated-origin-cache sentinel must survive activation.

**S53.** Tests wait for meaningful ready states, not arbitrary sleeps or retrying
any failed action. Retries are bounded and logged; final failure preserves the
trace. A retry must not hide an incorrect navigation or duplicate a grade. CI may
retry an identified transport race, not a semantic assertion.

**S54.** Retire duplicated runtime engines by migration, not by deleting decks or
history. 文脈札 can remain available through an adapter while new enrollment uses
the common contract and ledger. Mark old `BRIEF_V2`, `REVIEW_V2`, `check_v2` and
preview paths as historical and link here; do not use their fixed-count writing
rules for new work. Keep old source arrays until provenance and rebuild consumers
are mapped, then archive deliberately.

## 13. Learning evaluation

**S55.** Evaluate delayed performance outside the trained sentence as well as
within-card retention. Measure contextual meaning, reading, listening and intended
production separately; record time, review count, assistance and ambiguity. The
goal is useful Japanese per unit of learner time, not maximum completed cards.

For a learner-approved exploratory comparison, assign matched **words/families**,
not sibling cards, to MCD or 文; prevent practice of the same test word in both
conditions; hold time budget and content quality comparable. Use unseen-context
probes after approximately 7 and 28 days, recording outside exposure and attrition.
Those delays and sample size are practical choices, not validated optima. Treat a
single-learner result as personal evidence, not a population efficacy claim.
Do not switch scheduled contracts mid-experiment or let AI supply grades.

## Amendments (refinement 2026-10-04)

These amendments come from the lead reviewer's
[refinement](review-2026-10-04/REFINEMENT.md) of the review and the three critiques. Each
quotes the rule it changes; the original text above is left as written so the change is
visible. Where an amendment and the original conflict, the amendment applies.

**A01 → S01.** Replaces "Proposed default: targeted meaning retrieval from Japanese … Offer
selective MCD for form, construction, collocation or spelling needs." with: "Two presets
exist: MCD (語 + 字 cloze in a passage) and 文 (read and recall). The default preset for
newly enrolled words is a recorded learner decision; a deck ships neither as a hidden
default. Both presets must satisfy S02–S05." Why: `RESEARCH.md:17` says no winner is
established; the brief requires explicit choices to be challenged as questions, not
overridden in a standing rule. The reading-first recommendation stays in FIX_PLAN.

**A02 → S12.** Deletes "**Decision:** make automatic 字 generation opt-in for new
enrollments" and adds: "字 cards are generated for every passage whose character alignment
is verified (S08, S22), not only the first passage; the learner may switch 字 off per deck;
the build reports the share of 字 cards built on real text. Sibling unlock chains are
typed: a 語 card may be gated only by the previous 語 card of the same word; 字 cards form
their own branch from the first passage; the deck records the gating parent explicitly
(`after`) instead of relying on array order. The repair trigger counts Again in every FSRS
state; a card that has not graduated after N consecutive Again is offered repair and does
not block its siblings." Why: 字 is the most AJATT-faithful card type; the measured defects
are the 100%-written 字 layer, 288 words gated behind 字 cards, and a lapse counter blind to
learning state.

**A03 → S23.** Adds to "Kanji gaps also check whether another compound reveals the same
character.": "Measured gates: a 字 card is invalid if its blanked glyph appears anywhere
else in the visible front. A 語 card is invalid if the form or term appears anywhere outside
the gap; every further occurrence is masked under the same task or the excerpt is changed.
A 語 card is flagged if a run of two or more consecutive kanji of the answer appears
elsewhere on the front (計算 → 計算機). A 文 card's form occurs exactly once or the cloze
modes are disabled for that card. A front cue (hint, definition, reading) must not contain
the target's reading, the target form, a compound containing the target, or share a kanji
with the answer; under the MCD preset a 語 card on passage ≥ 2 carries no word-level
definition by default. The verifier reports each count and fails on any non-zero value
without a recorded disposition." Why: 12 word cards, 103 字 cards and 6 文 cards leak today;
131/323 hints share a kanji with the answer.

**A04 → S24.** Replaces "For 文, no target reading or meaning before the attempt." with:
"For 文, the target segment is never tappable or hoverable before reveal under any furigana
preference; non-target tap furigana is allowed and each tap is logged as assistance (S26)."
Why: `mount.js:119–129` makes the target tappable under the default preference.

**A05 → S27.** Adds: "The deck's method text, the grade bar and the keyboard map describe
the same button set. A two-button default means two buttons are rendered, with Hard/Easy
behind an advanced setting." Why: `deck.json` `method[6]` promises two buttons while
`mount.js:436` renders four.

**A06 → S30.** Adds: "A learning card may be shown before its due instant only when no
other eligible card remains in the sitting (Anki learn-ahead semantics), and the event
records that it was early. Queue mutation during a sitting may only insert at positions
after the current card; the card at the cursor never changes except through grade, undo or
quit. A learning card that comes due mid-sitting is appended after the current card." Why:
F05 is a trigger bug; `refill()` currently swaps the card under the learner.

**A07 → S29.** Adds: "The player applies `reviewTimePolicyId`
append-order-monotonic-clamp-v1: effective review time is max(now, last_review); the raw
press time is stored alongside. A negative delta never reaches the scheduler." Why:
`fsrs-pin.json:42` declares the policy; only `corridor.js` implements it and the player
throws.

**A08 → S31.** Adds: "New cards are introduced interleaved across groups (round-robin, or
learner capture order when known) with a per-group daily cap; deck file order is not an
introduction order. The daily new-card budget counts cards and the settings label says
カード; 字 and 語 are reported separately in the home tiles." Why: `engine.js:177`
introduces topic blocks; R13 reports more interference for related items learned together;
"一日の新しい文" hides that most new MCD items are 字 cards.

**A09 → S11 table.** Adds a row "Kanji in host word (字 card)": "Generated from any verified
passage; the visible remainder of the host word plus the reading hint must not uniquely
spell the answer in a choice task; choice mode is disabled for 字 cards until reviewed
distractors exist." Why: F38.

**A10 → S15.** Adds to "Report authentic, adapted, written and unresolved shares over
unique passages": "Anchor passages (passage 1) and all 字-bearing passages are reported
separately. A written anchor requires a per-word reason recorded in `decisions.jsonl`.
Tatoeba/Tanaka rows without a checked/OK flag rank below edited sources and their share
among anchors is reported." Why: 322/323 MCD anchors are written; 131/323 文 anchors are
unchecked example-bank rows.

**A11 → S17.** Adds: "For Aozora, the licence of record is the per-work notice in the text
file's trailer after the 底本 block (for example 「この作品は、クリエイティブ・コモンズ「表示
2.1 日本」でライセンスされています」), read and stored verbatim by the miner; the work card's
＊著作権存続＊ flag alone is neither a permission nor a prohibition. CC BY works are
public-profile eligible with author, translator and licence credit; CC BY-ND and BY-NC-ND
works are private-profile only. A miner must never cut the trailer before reading it. An
Aozora record with no stored licence of record is unverified." Why: 富田倫生 is CC BY 2.1 JP;
片岡義男, 鶴岡雄二 and 小泉八雲『赤い婚礼』 records are ND or NC-ND; `mine_aozora.py:27–31`
discards the deciding line.

**A12 → S14.** Adds required fields: for literary sources `author`, `translator`
(separate), `workId` and the work-card URL (`cards/<author>/card<work>.html`), parsed from
the full Aozora header, never from a fixed line number; for example banks `corpus`
(tanaka | snow-t15 | snow-t23 | tatoeba) and the corpus sentence ID; for Wikimedia the
article title and revision or URL. Acceptance: a record with `url: ''` or `author: ''`
cannot enter the public profile. Why: 15+ works are credited to a subtitle; one site label
carries three licences; 125 Wikinews/Wikipedia records have no URL.

**A13 → S16.** Adds: "Posts by private individuals on social platforms or personal blogs
(x.com, instagram, threads, note.com, ameblo.jp, hatena, chiebukuro) are excluded from
public artifacts regardless of licence analysis; official organisational accounts may be
quoted under their terms with attribution. The private-study profile may keep them." Why:
km-245 S1 and km-044 S1 publish a private person's post with the identifying URL.

**A14 → S22.** Adds to "Review non-target readings too": "Readings come from the tokeniser
only as candidates. The build applies context rules for the known unidic-lite failure
classes (nationality or group suffix 人 → じん, 曜日 → び, adverbial 一日 → いちにち, 他の/他に
→ ほか, 〜の方 for a person → かた, いい方/下の方 → ほう, 皇族方 → がた, 上手 → じょうず
outside the stage sense) and every occurrence of a watchlist kanji (方・日・人・他・上手・一日・
生・風・市・下・上) carries a reviewed disposition before release. Known wrong readings become
negative fixtures in the verifier." Why: the five reported cases are classes with dozens of
instances.

**A15 → S21.** Adds: "Hard filters are evaluated on the text outside the matched target
span. The classical-grammar filter exempts the target and the productive forms 〜たる /
〜なる / 〜ざる / 〜ごとく / 〜べき / 〜しき; a target that the tokeniser tags as 文語 must
still obtain candidates. Every rejection is logged with the filter name per candidate
(S45)." Why: `rank.py:142–143` rejected all 24 candidates for 由々しき.

**A16 → S11 and S18.** Adds: "One passage has one identity across decks (`passageId`). A
passage already serving as a word's 文 card is not re-shipped as that word's MCD passage; if
both decks need it they share the `passageId` and the sibling rule buries the other copy.
One Japanese text has exactly one English translation across all artifacts." Why: 45 MCD
passages are byte copies of the 文 card, 20 with a conflicting translation.

**A17 → S20 and S39.** Adds: "Each passage binds the sense actually used in it. Learner
lookups that are the same lexeme in different orthography (栞/しおり) or head-word plus
fixed phrase (礎/礎を築く) may be one lexical entry with several forms; existing card IDs
stay; whether to merge is a recorded learner decision." Why: 13 duplicate-lexeme pairs;
km-132 P3's hint contradicts its own passage.

**A18 → S10 and S24.** Adds: "The marked or blanked span is the whole inflected word as
written (勝ち残った, たくらんでいる), never a stem cut at a tokeniser boundary (勝ち残っ)."
Why: 16 文 and 4 MCD forms are stem-cut; the learner's requirement 5 bans truncated examples.

**A19 → S19.** Adds: "Conventional elliptical phrasings that are standard in educational
text (地軸は公転面に対して23.4度傾いている) are precision improvements, not factual errors;
the fact-check hold is for claims that would mislead (mis-attributed laws, undated
statistics)." Why: F16 was out of proportion; F23's 皇室典範 attribution is the real case.

**A20 → S35.** Adds: "Measure each text token against the surface it actually sits on: the
card panel, the tinted grade button (`color-mix`), the page background, and the worst 5%
of pixels under any texture. A theme passes only if every (token, surface) pair passes."
Why: the review's and the critique's numbers differ exactly because the surface was
unstated.

**A21 → S41.** Replaces "Wrong deck, empty object, future version, invalid dates/state,
duplicate IDs or conflicting events fail visibly and leave current bytes untouched." with:
"Any import that fails validation leaves current bytes untouched and says why. Any import
whose card set is empty, or whose card count is smaller than the current ledger's, requires
an explicit second confirmation that names both counts. A pre-import snapshot is written to
a separate key before any replace. Ledger entries for card IDs not in the current deck are
kept, never dropped." Why: the real-world loss is pasting an older valid backup, and
`normalizeState` currently drops orphaned states.

**A22 → S52.** Adds: "The service-worker precache list is generated from the registry and
includes every module reachable by static or dynamic import from the shell (today
`vendor/ts-fsrs.mjs` and `data/fsrs-pin.json`). Lazily imported modules
(`decks/player/mount.js`, `deck.json`) are fetched with the same release version as the
running shell; a mismatch reloads at the next safe boundary. Cache cleanup deletes only
keys with this app's prefix. The verifier serves the app over a worker-enabled origin so
`sw.js` runs in at least one automated test." Why: `index.html:57` registers the worker
only over https; `sw.js:67` deletes every cache on the origin.

**A23 → S46.** Adds the fifth consumer: "The registry also generates the worker precache
(`sw.js` SHELL) and the Pages copy and smoke lists; a build check diffs each generated list
against the committed file." Why: F52 lists four places; `sw.js` and `pages-app.yml` are
two more that drift by hand.

**A24 → Section 12, Repository row.** Replaces "targeted verifier" with:
"`verify-kotoba-mine.mjs` runs on every pull request that touches
`prototypes/corridor/decks/**` or `decks/**`; pure engine rules (`buildQueue`,
`nextNewCard`, `normalizeState`, `grade` with the monotonic clamp) are vitest unit tests
included by `vitest.config.ts`." Why: today the deck verifier is in no workflow and vitest
excludes `prototypes/`.

**A25 → S40 and S47.** Adds: "Card IDs and Anki GUIDs are assigned from a committed
identity manifest keyed by word, passage text and card kind, never from array position. A
card that disappears keeps its ID reserved; a new card takes the next free number for its
word. The build fails under `--frozen` if a key has no manifest entry." Why: F26;
`build.py:240–242,303` number cards by position and `guid_for(card id, deck id)` follows.

## Amendments (card contract v2, 2026-10-04)

These amendments record what [card contract v2](CARD_CONTRACT_V2.md) changed in the deck
player (`prototypes/corridor/decks/player/`), in the standalone study pages `build.py`
bundles from it, and, where Anki can carry it, in the `decks/kotoba-mine/tools/anki*/`
templates. They follow the same form as A01–A25: each quotes the rule it changes, and the
amendment applies where they conflict. None of them changes FSRS numbers, the unlock
constants, card IDs, Anki GUIDs or model IDs, or the `bunki-cloze:<deckId>` and
`bunki-cloze:prefs:v3:<deckId>` ledger keys; new prefs fields and ledger keys are optional
and read as empty when absent.

**A26 → S24.** Adds to "Front: … only cues allowed by the contract": "On both decks the
front shows no readings, no English and no tap targets inside the passage. The tap-for-
furigana path and the English hint are removed; a stored `furigana` pref is ignored, and so
is a stored `hint` (A37: no front hint in any mode). A hint appears on a 読んで思い出す front only after the
learner added one through the repair ladder (A35), and that card is marked
`data-repaired`." Why: contract §2 locks the front. (The MCD blank preset's Japanese
definition under the gap, left open here, is removed by A37.)

**A27 → S25.** Replaces the back order with two tiers: "Tier one, under the passage with no
taps: the target with its reading and part-of-speech badge (pitch only when the deck
carries it; none does yet), a reading over every kanji of the passage, the one Japanese
definition as the primary line, and a Japanese usage note only when there is one. Tier
two, native `<details>` folds in this order: 英語 (gloss and English note, muted), 英訳
(the target sentence only, never the whole passage; a card whose sentences cannot be
matched to the English says 未対応 instead of dropping the fold), 漢字の形と意味 (open by
default on a 字 card), 類語 (only dictionary or collection entries, only once the card is
in review state), the word's other passages as titles only (「この語の他の文章」 on a passage
card, 「この語の他の文」 on the one-sentence deck), then 出典 as the last fold: the author (and
translator) when the record names one, the site (a link when the record has a URL; a passage
written for the deck says 書き下ろし), the licence from `card.src.licence` (`lang="en"`), and
on a passage card which of the word's passages this is. A fold the learner opened stays open
through the zoom toggle and the rule's dismiss." Why: contract §3 (§3.10 for 出典; updated
with the Phase 1 follow-ups, when the source line became a fold and gained its licence). Anki
folds 出典 last too, with the site and link; the licence is not a note field (S47 keeps the
field list), so Anki readers find it in `ATTRIBUTION-<deck id>.md`. At 390×844 the target,
its reading and the definition stay on the first screen above the grade bar, even with the
repair ladder shown.

**A28 → S25.** Replaces "plain English gloss (recommended visible default; optional
Japanese-first order)" with: "The English gloss sits behind the 英語 fold by default
(`deck.defaults.gloss: 'tap'` on both decks). A per-deck switch, 設定 › 英語の意味 ›
いつも開いておく (`prefs.gloss: 'show'`), opens it on every card. English is never coloured
and carries `lang="en"` on the English text itself, not on the fold." Why: contract §3.5
keeps the earlier always-show request available while making Japanese the default.

**A29 → S27.** Replaces "Hard/Easy may be an advanced option with plain guidance" with:
"The scheduled grade bar is もう一度／思い出せた only, on both decks. The four-button
setting and keys 2 and 4 are removed. The rule 「答えを見て理解が深まったなら もう一度」
shows once under the bar and can be dismissed (`prefs.ruleSeen`); the method text in 設定
says 「迷ったら『もう一度』」." Why: contract §4 (TheMoeWay rule).

**A30 → S24 and S36.** Adds: "A passage card (MCD) carries a 全文／焦点 toggle in its header
after the reveal. 焦点 dims the sentences around the target (opacity only; nothing is
removed or reflowed). `prefs.zoom` is `'auto'` by default: a new card opens in 全文, a card
seen before opens in 焦点; choosing either stores it for that deck. The toggle's buttons
have a 44px hit area." Why: contract §2. The one-sentence deck has no zoom.

**A31 → S36 and S37.** Adds: "At phone width the grade bar is fixed to the bottom of the
viewport, with room reserved under the card so no content sits behind it. 削除 sits at the
right end of the study top bar, 44px high, on front and back." Why: contract §9 ("grade
bar pinned") and §4 ("delete is one tap").

**A32 → S34.** Adds: "A level is a monochrome text chip (N1, N2 or N3), never a hue or an
edge. It comes from a public word list (`prototypes/drift/data/wbig.json`, joined on
headword and reading) and is shown only when the list gives the word exactly one level
(76 of 323 words); its label reads 「N1相当（公開リストによる目安）」. Anki shows the
same chip from a `level::Nx` note tag, with no new field. The card edge and first chip say
the item kind (語, 字, 文法); the target and its reading share one part-of-speech hue;
state chips and grades use red, green and amber only." Why: contract §9; the list is an
estimate, not an exam result.

**A33 → S34 and S38.** Adds: "Removed from the card as clutter: the 見て覚えるコツ tips
panel, the topic hue on the card edge, the level 1–3 edge, and every texture (paper,
chalk, gradient) behind the card; textures paint the page only. The method panel moves
from the deck home to 設定. The reveal is one transition finished by 180 ms; with
`prefers-reduced-motion` nothing animates, transitions or drags." Why: contract §9 and
`brief-2026-10-04/aesthetics.md`.

**A34 → S32 and S37.** Adds: "削除 suspends the card in one tap: the record and the card ID
stay, the card leaves the sitting at once, and the toast's 元に戻す (or ↶) undoes it. 設定 ›
保留中のカード counts suspended cards and 復元 brings them back. A card deleted before it was
ever graded does not hold its word: the word's next passage becomes its first, and the
culled passage's 字 cards are skipped too. Whole-deck reset is not offered. The ledger
gains an optional `suspended` map `{id: {at, by}}`." Why: contract §4.

**A35 → S32.** Replaces "Six genuine card lapses is a provisional repair trigger" with
"Five genuine card lapses (`LEECH_LAPSES = 5`)", and replaces the open list of offers with
an ordered ladder: "別の文に替える (the word's next unseen passage takes the card's place,
due at once, progress kept), ヒントを付ける (a hint on that card's front only), 保留
(suspend), or このまま続ける. The ladder sits inside the answer, after tier one and before
the folds, and is offered again only after further lapses. Every choice is written to
optional ledger keys `repairs {id: {at, lapses, hint?, swap?, keep?}}` and `repairLog
[[id, action, iso, detail?]]`. Nothing is replaced or unlocked automatically." Why:
contract §4. A 字 card has no passage to swap to; its hint is the kanji's parts.

**A36 → S28 and S38.** Adds to 漢字の形と意味: "The fold lists the learner's own words that
share a kanji of the target (同) or a reading of one of its kanji written with another
kanji (読, at most eight shown). The family is deck-relative: only words of this deck with
a card in this deck's ledger count, so the fold never shows a word before its own card
does. Each entry links to 語の一覧 and ← returns to the card. Anki, which has no card state
in a template, uses the words before the target in the deck's new-card order. No
etymology, no mnemonics." Why: contract §3.7 and §5 (the JPMN/Kiku model).

**A37 → S24, S28 (amends A26).** Replaces the MCD deck's default task: "Both decks open in
読んで思い出す (`deck.defaults.mode: 'read'`): the target is marked in the deck's target style,
nothing is blanked, and the learner recalls its sense and reading. 穴埋め (the MCD blank preset)
and 4択 stay one switch away in 設定 › 答え方. No front shows a hint in any mode: the Japanese
definition under the gap and the 設定 › ヒント row are removed, a stored `hint` pref is ignored,
and the only hint a front can show is a repair-ladder hint (A35). The 538 single-kanji 字 cards
are neither suspended nor deleted: in 読んで思い出す the queue leaves them out (`skipFor(mode)` in
`engine.js`, applied to due cards, new cards and learning steps alike), their records and ids
stay as they are, and they return the moment the learner chooses 穴埋め or 4択 (where a 字 card
is asked as 穴埋め). The learner may later decide to suspend them for good; that is their call,
not a default." Why: contract §2 ("default task 読んで思い出す … never single kanji", "no hint
unless the card has been repaired"). Anki cannot mirror the mode switch: a template cannot drop
a note's cards, so the Anki MCD note type keeps its blank front (now without the hint line); a
learner who wants the 字 cards out of Anki suspends them with the search `Type:字`.

**A38 → S36 (amends A30).** Replaces "焦点 dims the sentences around the target (opacity only;
nothing is removed or reflowed)" with: "焦点 folds the sentences before the target, and those
after it, into one group each, dimmed, two lines high: the before group shows its last two
lines, the after group its first two, each fading at its cut edge. A group longer than two
lines carries ⋯ (44px reach, `aria-expanded`, labelled 前の文をすべて表示／後の文をすべて表示)
that opens it in place, in a 56px gutter the group keeps clear at its right edge (folded and
opened), so the ⋯ never covers a glyph. Nothing is removed: the passage text is whole in the DOM, and 全文 lays
the groups out inline as if they were not there. The front is never grouped." Why: the Phase 1
critic found the first screen after a long reveal could be all dimmed text.

**A39 → S25, S36 (amends A31).** Adds: "After the reveal the player settles the page: by the
least scroll that does it (smooth, instant with reduced motion), the target sentence, the word
and its definition sit between the host's pinned header and the pinned grade bar; when all three
cannot fit, the word and definition win. At that resting position no fold row is cut by the
bar: a row that would be is scrolled wholly above it, or wholly under it, whichever keeps the
rest in view; on a host with no pinned header (the standalone study pages) that step never
slides the study top bar (× n/N 削除) under the top edge of the screen, so there a row may stay
cut when the only way to un-cut it would hide the top bar. The page keeps the bar's measured
height free under the card, so the last fold (出典) always scrolls clear of the bar." Why:
contract §3 (tier one is read on every pass) and the critic's clipped fourth fold. In 焦点 on
a long passage the target sentence wins the scroll, so the before group and its ⋯ can sit
above the screen at rest; scrolling up reaches them. Verified on km-298-m02 (195 characters) in 焦点 and 全文, and
on new, seen, unmatched and 字 backs.

**A40 → S34, S35.** Adds: "The 字 hue (`--kp-kind-ji`, a 字 card's edge and kind chip) is at
least ΔE_ok 10 (OKLab distance ×100) from every other hue of its theme: the 語 and 文法 kinds,
the six part-of-speech hues, the accent, and the grade and state colours
(`tools/contrast-kotoba.mjs`, `kindJiTable`), as well as ≥ 4.5:1 on the card." Retuned with the
Phase 1 follow-ups, contrast on the card before → after:

| Theme       | Before    | Nearest, ΔE_ok                 | After     | Nearest, ΔE_ok | On card      |
| ----------- | --------- | ------------------------------ | --------- | -------------- | ------------ |
| 墨 dark     | `#ff8fd8` | sound 4.4                      | `#ffb0ea` | sound 11.6     | 8.56 → 10.65 |
| 抹茶 matcha | `#ff9ad5` | sound 6.7                      | `#ffb3d9` | 文法 10.6      | 8.21 → 9.62  |
| 和紙 washi  | `#1e5da4` | verb 0.0 (the verb's own blue) | `#64075b` | sound 16.0     | 6.17 → 11.30 |
| 桜 sakura   | `#2665a7` | verb 0.0 (the verb's own blue) | `#5e0b63` | 文法 16.6      | 6.00 → 12.32 |
| 白 light    | `#a3237a` | sound 4.4                      | `#7f1f86` | adverb 12.4    | 6.82 → 8.60  |

藍, 黒板 and 高 already cleared the floor (13.5, 10.8, 10.6) and are unchanged. Anki's light
and night 字 edges follow 白 and 墨. Why: aesthetics.md §3 (one hue axis per surface; a 字 edge
the same blue as a verb target read as a part-of-speech mark).

**A41 → S24, S28.** Adds: "「タップして答えを見る」 (and 「意味を思い出してからタップ」 in 読んで思い出す)
and the swipe hint under the grade bar show for a deck's first three sittings and are gone from
the fourth (`prefs.sittings`, counted when a sitting starts; an older prefs record reads as 0).
答えを見る and the grade buttons stay. Labels: the one-sentence deck's other-sentences fold reads
「この語の他の文」; Anki's part-of-speech badge says 形容動詞 for な-adjectives (POS field
`adjna`, the adjective colour), as the player does." Why: aesthetics.md §6 and §9. Anki has no
類語 fold: the player shows 類語 only once a card is in review state, which a template cannot
read, and no deck word has 類語 entries yet; adding the field would change the note type (S47).

**A42 → S37 (completes A34).** Removes 設定 › バックアップ › 記録を消す, the two-tap reset that
wrote an empty ledger over the deck's record. バックアップ keeps コピー and 復元. A card leaves
through 削除 (undone by 保留中のカード › 復元) and a topic through テーマ; "Whole-deck reset is not
offered" in A34 is now true of the player and the standalone study pages. Why: contract §4.

**A43 → S39, S49, S51 (Phase 2, stage B).** Adds to the `bunki-cloze-deck` v1 adapter: "A deck
may name a tokens side file (`deck.tokens`, `tokens.json` beside `deck.json`; the public build
writes `tokens-<deck id>.json`). It holds each card's passage as dictionary-sized tokens
`[surface, lemma, reading, kind, ref]` (kind 語・字・文法 or other; ref a boot-core dictionary
head, a glyph or a grammar id), whose surfaces spell the passage exactly as `ruby[]` does.
`ruby[]` stays the display source and tokens are the tap source; card IDs and `ruby[]` do not
change. The tokens ride in a side file because inline they would grow `deck.json` by more than
25% (kotoba-mcd +82%, kotoba-mine +51%); the player fetches the file only when a host asks.
The corridor mounts the player with a host lexicon adapter (`decks/player/host.js`: `lookup`,
`open`, `isTaken`, `take`, `lists`) built from its own lexicon, entry sheets and 覚える store; a
lookup or a take never writes the observation log or any schedule, and never enrols the word in
the deck. The standalone study pages mount with no adapter (null) and bundle no tokens." The
tap itself on the back is the next stage. Anki cannot carry tokens or a host: the templates
keep furigana only. A token is a dictionary word, not a UniDic short unit: adjacent content
units that together spell a boot-core head with the same reading are one token. A grammar cue
that starts on a nominal (上, こと, よう) counts only after a predicate, and a cue ending in で
does not count before ある. Why: learning-design.md §3, integration.md A2.

**A44 → S26, S39, S49, S51 (Phase 2, stage C; completes CARD_CONTRACT_V2 §3, last paragraph).**
Adds: "After the reveal only, every word of the passage and of the Japanese definition is a tap
target: each 語・字 token, a grammar cue as one target, the target itself, and any token that is a
word of this deck. Particles, endings and punctuation are not words and stay plain. A target has
no colour, box or underline at rest; hover or keyboard focus draws a dotted underline. Its reach
is 44px tall across the word's width. The front never has one. With a host lexicon (the corridor)
a tap opens the player's entry sheet, filled through the adapter (A43). The sheet shows the reading,
then the Japanese sense: a deck word's definition, a grammar point's 意味, a kanji's 音・訓. The
corridor's dictionary is English only, so for any other word the sheet says so in Japanese. English
waits behind 英語. Then comes the reader's 覚える chooser (どこに保存しますか？, 覚えるの札 always,
named lists, a new list, nothing saved until 保存する) and a door to the corridor's full entry. A
word of this deck shows 「このデッキにあります」 and no chooser (A17); the card's own word is one. A
word in the sheet's definition opens one more sheet. That second sheet shows 「ここで止めよう」 and
has nothing left to tap (Khatz's cut-off, depth 2). While a sheet is open, the grade keys do nothing,
the grade bar sits under its backdrop, and Escape closes it. A tap is capture, never evidence. It
never grades, never changes a card's schedule, never adds a card, and never writes the corridor's
observation log. It is one row in the ledger's new `lookups` field ([iso, cardId, where p|d|s, surface,
key, depth], last 2,000). Ledgers without the field read as empty, and undo keeps the rows. Without
a host (the standalone study pages), the page carries a built-in gloss map (`bunki-cloze-gloss`, the
deck's own words' offsets in each passage and definition, from build.py `gloss_map`) beside its
furigana. Only those words are tappable. A tap shows a small popover with the term, reading,
definition and English behind 英語, but no 覚える, and a one-line note says so. Anki has no
tap-to-define: the templates are unchanged (furigana only)." The tokens side file gains `defs`,
each word's definition as tokens (format version 1, additive). The swipe now takes pointer capture
only once the finger moves, so a tap on a word stays a click on it. The deck method text says that
words on the back can be tapped. Why: learning-design.md §3, integration.md A2, RESEARCH #2.

**A45 → S52 (Phase 2, final; amends A22's list).** Adds to the worker's install-time SHELL: "Each
deck that names a tokens side file (A43) has that file precached beside its `deck.json`
(`decks/kotoba-mine/tokens.json`, `decks/kotoba-mcd/tokens.json`), so a first visit followed by
going offline still draws the back's tap targets (A44). A change to the player or to a deck's
outputs bumps `VERSION`; this run's is `kairo-v15-tap-define`." Why: mount.js fetches the tokens
once a sitting starts, a request the shell would otherwise miss offline, and the tap layer and
the regenerated decks must not be served from a v14 cache. `tools/sw-shell.test.mjs` checks that
every SHELL path exists.

The Phase 2 run (2026-10-04) is recorded in A37–A45. Read default and the 字 skip: A37. Hint
retirement: A26 and A37. Reset re-scoped to 削除 and 復元: A42. Source fold with its licence: A27.
Bar reserve and the settling scroll: A39. 焦点 groups and the ⋯ gutter: A38. Tokens side file,
compound joins, cue rules and the host adapter: A43. Tap to define as capture only, the `lookups`
ledger field, the depth-2 cut-off and the standalone gloss-map fallback: A44. Service worker: A45.
