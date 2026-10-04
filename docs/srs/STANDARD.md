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
