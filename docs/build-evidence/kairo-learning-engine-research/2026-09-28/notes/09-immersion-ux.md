# Track 09 — Immersion mining, reading and listening UX

Research cutoff and access date: **2026-09-28**. Every external factual statement links to a primary product/documentation source or rights holder. “Undated” denotes no reliable publication date on the reviewed page. All architecture, schema, thresholds and tests in the Inferences section are **PROPOSED DESIGN**; they are not measured efficacy findings. Existing Bunki assets and counts are **USER-SUPPLIED / NOT REPOSITORY-VERIFIED** in this track.

## Takeaway

The useful unit of mining is a source-linked learning opportunity, not a bare dictionary word. Preserve the written span, contextual sense, reading, audio interval, learner assistance and rights provenance. Keep extensive reading uninterrupted by default; make lookup, deliberate practice and card creation distinct choices. The model should personalize presentation and recommendations without treating viewing, hovering, playing audio or finishing a page as proof of knowledge.

Adaptive furigana, known-word highlighting, multimedia cards, contextual dictionary senses and sentence replay already exist in shipping products. Bunki's plausible distinction is their integration with a single replayable evidence model, separate receptive/productive states and auditable uncertainty. That combination's absence across the entire market is **UNVERIFIED**, and superiority must be tested.

## Cited findings

### Documented immersion mechanics

| Product/tool | Verified mechanics and source | Design relevance and limits |
|---|---|---|
| Yomitan | Local/online pronunciation sources, selectable-text dictionary lookup, dictionary imports and Anki integration are documented. Android supports Firefox, Edge or Elixir; mobile Chrome and iOS are not supported by Yomitan's documented setup. [Getting started](https://yomitan.wiki/getting-started/), updated 2026-03-08, accessed 2026-09-28. | A powerful reference workflow; “browser extension” does not imply identical iPhone functionality. |
| Yomitan card templates | The Anki integration exposes expression, reading, furigana, dictionary glossaries, sentence/context, audio, pitch and other fields through templates. [Anki documentation](https://yomitan.wiki/anki/), undated, accessed 2026-09-28. | Bunki should preserve field provenance and let the learner select a contextual sense rather than dump every dictionary entry into a card. |
| asbplayer | It combines video, subtitles, screenshots and audio in sentence cards. Mining dialogs allow selected-time-range changes; sentence text and local audio can be updated to the range, and streaming audio re-recorded. [Mining guide](https://docs.asbplayer.dev/docs/guides/mining-in-depth/), undated, accessed 2026-09-28. | Previewing and trimming media is part of card quality. Browser capture is a technical capability, not redistribution permission. |
| asbplayer annotation | Word styling follows known state imported/synced from Anki or WaniKani or stored locally; reading, frequency and pitch annotations are configurable. It depends on Yomitan plus its API. [Annotation documentation](https://docs.asbplayer.dev/docs/guides/annotation/), undated, accessed 2026-09-28. | State-sensitive subtitle display is already shipped. Bunki's evidence mapping must not blindly interpret external SRS “known” labels as measured transfer. |
| Migaku | Official documentation defines **5 statuses** and uses them for content difficulty and sentence suggestions. One explanation marks “known” when estimated review interval reaches **21 days or longer**. [Learning-status explanation](https://migaku.com/blog/youtube/supercharge-your-language-learning-tracking-learned-words), undated, accessed 2026-09-28. | This is a documented product heuristic, not a validated threshold for receptive and productive mastery. Exact applicability to every current client/version is **UNVERIFIED**. |
| Migaku mobile | Its official FAQ lists mobile Browser, Clipboard, Dictionary, Local Player and Memory components. [Official FAQ](https://migaku.com/faq/getting-started), undated, accessed 2026-09-28. | A built-in mobile reader/player can provide a coherent experience when system-wide popup tooling is unavailable. |
| Satori Reader | Adaptive kanji/kana/furigana; context-specific dictionary definitions; sentence translations and notes; cards retaining original sentence, audio and notes, with multiple contexts per word. [How it works](https://www.satorireader.com/how-it-works), undated, accessed 2026-09-28. | These are minimum comparison requirements, not Bunki inventions. “Kanji known” still need not mean every word reading or sense is known. |
| Satori content quality | Satori says it writes or licenses human-created content, uses human voice performances, manually links words to dictionary senses, annotates and proofreads. [Official AI statement](https://www.satorireader.com/ai), undated, accessed 2026-09-28. | Human-curated content is a concrete competitor quality bar. These process statements are vendor claims, not independent measured defect rates. |
| Language Reactor | The official guide describes Netflix/YouTube extension tools, dual subtitle controls, keyboard navigation and subtitle-based auto-pause. [Official guide](https://dev.languagereactor.com/help/basic), undated, accessed 2026-09-28. | Platform-specific availability of every control is **UNVERIFIED**; test on exact intended services. Do not assume DRM audio can be captured. |
| mokuro | Offline text detection/OCR produces selectable manga text and `.mokuro` metadata for a browser reader. Repository code is labeled **GPL-3.0**. [Official repository](https://github.com/kha-white/mokuro), undated, accessed 2026-09-28. | Useful import format/workflow. Software rights do not include manga rights or guarantee OCR accuracy. Model/dependency licensing needs a separate audit before bundling. |

### How shipped products check generated or graded content

- **Speak:** its help center says learning designers write lessons, AI assists workflow, and every lesson is reviewed/refined by a human. [Official help](https://help.speak.com/en/articles/11396732-how-does-speak-curate-its-content-and-curriculum), 2025-11-28, accessed 2026-09-28. Its separate custom-course feature exists, but whether every real-time custom generation receives the same review is **UNVERIFIED**; do not extend the statement beyond documented scope.
- **Duolingo English Test:** its Interactive Speaking description says prompts and rubrics are prepared in advance, human reviewed, and selected within a structured system. [Official process description](https://blog.englishtest.duolingo.com/interactive-speaking/), 2025-06-30, accessed 2026-09-28. This is an assessment process example, not permission for Bunki to use AI card grading.
- **Langua:** its official help describes AI stories with synthesized audio and synchronized word/sentence highlighting. [Official help](https://support.languatalk.com/article/137-are-the-ai-stories-any-good), updated 2023-12-22, accessed 2026-09-28. Independent error rates, Japanese-specific difficulty verification and human review of each generated story are **UNVERIFIED**.
- **Research comparator:** Japanese controllable-generation work with **6 participants** reports comprehensible utterances **40.4% → 84.3%** for its method versus prompting; this tests comprehensibility, not retention. [Primary preprint](https://arxiv.org/html/2506.04072v1), 2025-06-04, accessed 2026-09-28. Details and limitations are in Track 04. Do not label prompted stories “N4-verified” because a model followed a level instruction.

### Rights-clear source inventory for reader/listener use

| Source | Verified permission/restriction | Proposed Bunki use |
|---|---|---|
| Commissioned Bunki text, dialogue, audio | Rights must be granted by actual contracts; existing ownership/performer permissions **UNVERIFIED**. | Preferred baseline: original text, contextual senses, translations, timestamped audio, explicit commercial redistribution and adaptation rights. |
| Tatoeba text | Default **CC BY 2.0 FR** text attribution; audio has separate contributor-specific licenses. The official reuse guide recommends proofreading teaching sentences and warns that quality labels are incomplete. [Official reuse guide](https://en.wiki.tatoeba.org/articles/show/using-the-tatoeba-corpus), undated, accessed 2026-09-28. | Use only manifest-approved text/audio; include author/source/license and correction status. “Attested in Tatoeba” does not mean human-verified Japanese. |
| Aozora copyright-expired works | Rights-holder guidance allows copying, redistribution and performance, including paid use, under its stated conditions; copyrighted works need permission except permitted private use. Bibliographic data is **CC BY 4.0**. Translator rights can remain live. [Official handling rules](https://www.aozora.gr.jp/guide/kijyunn.html), updated 2022-01-01, accessed 2026-09-28. | Curate work-by-work and market-by-market rights status, keep original credits/change history, and commission narration separately. Do not treat all Aozora entries as public domain everywhere. |
| Free Tadoku Books | Current guidance specifies **CC BY-NC-ND 4.0**, allows linking, and restricts commercial reuse. It explicitly disallows editing or adding translations/explanations/tests and prohibits commercial resale. Limited class/personal-support permissions do not grant blanket commercial app adaptation. [Official use guide](https://tadoku.org/japanese/en/free-books-en/note-en/), undated, accessed 2026-09-28. | Link out with attribution or negotiate a license. Do not bundle annotated/adapted copies merely because they are free to read. |
| NHK Easy / NHK news | A public site or scraper is not a license. Commercial redistribution, cached audio and derivative exercises under a specific applicable NHK agreement: **UNVERIFIED** in this track. | Link out; exclude from shipped content packs until exact rights are verified. |
| Commercial novels, manga, video and subtitles | Bunki redistribution permission: **UNVERIFIED** unless separately licensed. Tool repositories do not convey media rights. | User-controlled lawful local import only; retain local provenance and restrict export-media inclusion according to rights. No media republishing pipeline. |

### Mobile and offline constraints

Apple documents Safari web-extension website permissions, including host-pattern permissions and learner control over site access. [Official documentation](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions), undated, accessed 2026-09-28. **INFERENCE:** an extension cannot promise lookup across every native app or every protected web surface. Use explicit Safari permission and a separate share/import flow.

Android exposes `ACTION_PROCESS_TEXT`/`EXTRA_PROCESS_TEXT`; `EXTRA_PROCESS_TEXT` is a `CharSequence` introduced at **API level 23**. [Official Intent reference](https://developer.android.com/reference/android/content/Intent#EXTRA_PROCESS_TEXT), undated, accessed 2026-09-28. **INFERENCE:** this supports a user-initiated selected-text route; it does not guarantee full surrounding paragraph or media context from every app.

WebKit documents quota-limited browser storage and possible origin eviction; default storage is best effort, while `StorageManager.persist()` requests persistence. Safari **17** introduced the documented updated policy, and an origin's quota is an upper bound, not guaranteed available disk. [WebKit engineering announcement](https://webkit.org/blog/14403/updates-to-storage-policy/), 2023-08-10, accessed 2026-09-28. **PROPOSED:** ledger writes must report success/failure before UI confirmation, backups must be explicit exports, and content caches must be recoverable. Persistent mode does not replace an export backup.

## Inferences and proposed specification

Everything in this section is **PROPOSED DESIGN**. Numbered parameters, examples, acceptance counts and schemas are design choices, not evidence of efficacy.

### End-to-end mining transaction

```text
capture(source, selection, mediaRange):
    store local source locator + exact excerpt hash + rights metadata
    create exposure row; do not infer correctness or weakness
    parse selection with pinned tokenizer and dictionary versions
    resolve candidates: word -> contextual reading -> sense -> form/grammar
    show candidate alternatives; learner selects intended target
    retrieve licensed contextual definitions and verified examples
    if media exists: preview transcript, timing, clip and screenshot
    create draft with assistance flags and verification statuses
    learner edits and confirms target + test modality + card fields
    append card_definition + confirmation (never review state)
    FSRS-6 creates/schedules card through its own deterministic adapter
```

The same pipeline accepts a reader passage, subtitle, learner-authored sentence, mock-test error, dictation result, dojo answer or chat exchange. The source row's original provenance survives reuse. A correct answer typed after looking at a translation is assisted evidence. The model does not turn it into an unaided production success.

Duplicate protection keys on target node, tested modality, prompt hash and source context. Distinguish attaching another example to an existing card from creating another scheduled card. Preview the pending review load from the scheduler, and allow “save for later” without enrollment. The AI proposes; the learner confirms; FSRS-6 schedules.

### Fields of a complete card definition

“Complete” describes traceability, not a requirement to show every field at once. The front should test a specific retrieval target.

| Group | Required/proposed fields |
|---|---|
| Identity | Stable `cardId`, `cardDefinitionVersion`, `targetNodeIds`, `promptHash`, `createdBy` and `confirmedBy` ledger rows. |
| Target | Written form, lemma ID, reading ID, sense ID; optional grammar/form ID; confusion-pair edge ID when relevant. |
| Test | Modality (`written-recognition`, `reading-recall`, `audio-recognition`, `prompted-production`, `free-production`), task instruction, cue, accepted answer references, assistance conditions. |
| Context | Exact source sentence, target offsets, adjacent context if needed, source document/episode/page/line/time locator, source text hash, capture timestamp. |
| Meaning | Selected contextual gloss, dictionary/source ID, learner's own note, explanation with provenance; translation hidden until reveal. |
| Reading/pitch | Furigana aligned to the exact surface form, attested reading variants, pitch source and pattern, dialect/variant notes when known; `unverified` otherwise. |
| Audio | Local clip hash, start/end, transcript version, speaker/source identity where licensed, human/TTS origin, generated-voice version if relevant. |
| Visual | Optional screenshot/image hash, crop and attribution; exclude cues that give away the target unintentionally. |
| Verification | Independent flags for dictionary resolution, reading, grammatical form, naturalness, contextual meaning, transcript alignment and rights; checker/model/human/version/time. |
| Rights | License identifier/URL, author attribution, redistribution/adaptation permissions, commercial-use status, restrictions and reviewer decision. |
| Evolution | Definition supersession links and correction reasons; old reviews retain their original prompt/answer version. |
| Scheduling separation | No AI-created `rating`, `due`, `interval`, `stability` or `difficulty`. Reviews are separate learner-confirmed ledger events consumed by FSRS-6. |

Typed-answer comparison may display literal differences and a verified answer key. The learner assigns a review grade; an AI cannot assign it. A multi-target production task is a drill unless its scheduling semantics and independent target assessment are explicitly defined.

### Reader query and lookup ladder

`readerView(documentId, model, preferences)` resolves each token/span to its contextual reading/sense/form, retrieves evidence by modality, and returns display hints plus uncertainty. Presentation should be deterministic from ledger/model/content versions.

Proposed lookup ladder:

1. The learner may reveal reading or replay source audio without opening a full definition.
2. Show the selected contextual meaning and dictionary evidence; allow alternative senses/readings.
3. Offer morphology, grammar explanation or neighboring sentence context.
4. Offer a sentence translation explicitly labeled as such.
5. Offer a drill or card proposal with source and expected queue impact.

Each action records exposure/assistance, not failure. Lookup can reflect curiosity, checking a nuance or accidental selection. Learner-stated “I did not know this reading” is a self-report; it is not equivalent to a validated probe.

Furigana policy should follow **contextual reading evidence**, not simply the presence of known kanji. Options are `all`, `on-demand`, `unmeasured-or-uncertain-readings`, and `none`; store the preference in the learner record. Unknown names, irregular readings and ambiguous parses remain explicitly marked. Offer a separate undistracted extensive-reading mode with annotation reduced by learner choice.

Pitch accents may be displayed as an optional contour/label supported by a licensed source. Color is redundant with shape/text, never the only carrier of meaning. Absence of pitch data means unknown; it never means flat accent. A dictionary pattern is a lexical reference, not proof of the exact sentence's acoustic contour.

### Coverage and i+1 selection without a readiness score

Coverage describes a document under explicit assumptions; it never estimates “percent ready for N2.” Show an interpretable vector: measured-known lexical tokens, uncertain reading occurrences, unresolved senses, unfamiliar grammar/forms, names/OOV spans and assistance available. State tokenizer, denominator, content version and evidence cutoff. Do not exclude unknown/OOV tokens merely to improve the displayed coverage.

```text
selectNextPassages(bank, model, goal, constraints):
    candidates = rightsAndVerificationApproved(bank)
    for passage in candidates:
        profile = contextualNodeProfile(passage)
        gaps = nodesWithoutApplicableMeasuredEvidence(profile, model)
        pain = unresolvedObservedErrors(profile, model)
        target = intersect(profile.nodes, goal.targetNodes, model.frontier)
        support = availableVerifiedGlossAudioReading(profile)
        reject if exceeds learnerChosenLengthOrDifficultyBudget
        rank lexicographically by:
            satisfies learner's current goal/task
            includes intended target with interpretable context
            limits unrelated unknown readings/senses/forms
            exposes confusion pair without giving answer away
            matches learner's declared interests
            adds new context rather than repeats memorized wording
        return ranked choices with reasons and uncertainty
```

For focused drills, `i+1` is a **PROPOSED selection heuristic**, not a universal law: aim for one target dimension with surrounding support, counting grammar and reading burdens separately. Pain-node density is a diagnostic feature, not an instruction to maximize errors per sentence. Repeated hits to the same lemma should not hide several distinct senses/readings. Rank by expected task value with visible uncertainty; never manufacture knowledge evidence to meet a coverage target.

### Listening, shadowing and dictation

Offer separate modes because they provide different evidence:

| Mode | Interaction | Ledger meaning |
|---|---|---|
| Listen for meaning | Play clip without text, ask a validated content question if learner opted in. | Answer against a prevalidated key can be measured listening evidence; mere playback is exposure. |
| Read and listen | Synchronized transcript, word/sentence lookup, repeat range. | Supported exposure; no inference of unaided listening. |
| Dictation | Hide transcript, accept answer, show exact alignment and acceptable orthographic variants. | Measured only under a validated instrument/key and stated assistance conditions; distinguish kana spelling from hearing/meaning. |
| Shadow | Play/repeat, record locally, replay side by side; optional contour reference. | Practice/exposure unless a validated human or objective instrument supplies a measured judgment. |
| Delayed retell | Hide text; learner speaks or writes an account of meaning. | Preserve response; AI rubric suggestions remain observed until an authorized human/instrument produces measured evidence. |

ASR should produce editable transcription with uncertainty and source audio; it must not silently repair grammar before diagnosis. A transcription edit invalidates observations tied to old text. Pitch/contour overlay is explanatory feedback; automated accuracy on non-native speech, noisy recordings and variable voices is **UNVERIFIED** until tested. Do not map ASR confidence to pronunciation correctness. Keep spoken input and derived audio features local under the export-only law.

### On-device and import architecture

- Ship the dictionary, tokenizer and approved content manifests as versioned non-personal assets. Reader queries operate locally; do not call remote lookup APIs with the learner's selected text.
- Prefer a built-in reader/media player first. Add Safari extension, Android selected-text/share import and desktop extension only after a cross-platform capability matrix is tested.
- Import an EPUB/text/subtitle/audio/mokuro file into a local staging area. Show extracted title, source, rights status, encoding, unsupported features and OCR/transcript uncertainty before enrollment.
- Keep rendering overlays separate from immutable original text/media. Store learner annotations as ledger rows anchored to content hashes; changes to source editions require explicit re-anchoring.
- A “local file” claim must pass network inspection: no transcript upload, automatic OCR upload, external fonts/media beacons, analytics text capture or provider diagnostics containing learner excerpts.
- Cache content independently of the ledger. Evicting a downloadable audio pack cannot remove evidence rows. Export bundles should state which media are included, omitted for rights reasons, or restorable from licensed packages.
- Accessibility defaults include selectable text, ruby that does not duplicate screen-reader speech, keyboard and touch alternatives, transcript access, reduced motion and non-color uncertainty markers. Exact WCAG conformance is **UNVERIFIED** until a dedicated audit.

### Shippable acceptance tests

All criteria are **PROPOSED**, not claims of current performance.

1. A learner mines a subtitle while offline, adjusts its clip, confirms a contextual sense and creates a card. Only FSRS-6 creates its schedule; no AI review or due-date field is accepted.
2. Two words sharing a kanji but having different readings display differently when their reading evidence differs.
3. A sense known in a food context does not automatically mark its technical sense as measured-known.
4. A dictionary lookup and a page completion append exposure/assistance only; they never lower or raise measured knowledge.
5. An OCR error or unresolved reading blocks the draft from entering verified teaching content until corrected and rechecked.
6. Correcting source text creates a new version; prior evidence continues to identify the original question and prompt.
7. An export/import round trip yields the same model and reader annotations with pinned versions; omitted copyrighted media is reported without silently losing evidence.
8. Reader, mining, listening playback, draft confirmation and ledger replay work after network access is disabled. Personalized actions cause **0** network requests.
9. Touch lookup does not hijack scroll; dictionary popups can be dismissed and used with assistive technology; permissions denied on Safari/Android produce an explicit supported import alternative.
10. A passage coverage display shows its denominator and unknowns; no screen emits a JLPT readiness percentage or overall learner level claim.

## Gaps

- The license/provenance and sentence-level proofreading status of Bunki's existing example bank, articles, mock papers and audio: **UNVERIFIED** until repository and asset manifests are audited.
- Bunki's exact target iOS/Android versions, offline storage footprint, device performance, codec compatibility and background audio behavior: **UNVERIFIED**; make a supported-device matrix before commitments.
- Commercial reuse of NHK Easy, subtitle archives, scraped examples and any provider's voice recordings: **UNVERIFIED** unless a specific license is recorded.
- A general “perfect card” format or fixed i+1 threshold producing superior Japanese outcomes: **UNVERIFIED**. The field list and selection procedure above are traceability/design proposals.
- Exact current shipping quality-control processes for real-time AI content in every competitor: **UNVERIFIED**; vendor help pages do not substitute for independent audits.
- Transfer from adaptive furigana, pitch coloring or automated contour feedback to delayed receptive/productive competence in Bunki: **UNVERIFIED**; evaluate them separately with assistance tracked.
