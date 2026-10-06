# Track 02 — Established Japanese-learning and immersion tools

Research cutoff and access date: **2026-09-28**. This is a documentation teardown, not a signed-in product test. Product claims below describe what the vendor or project documents, not independently demonstrated learning effects. Every source in the register has a URL, a publication/update date where exposed, and an access date. **UNVERIFIED** means the research did not establish the claim; it does not mean a feature is absent. Prices are public web/store observations, not a checkout quote for a particular country or tax treatment.

## Takeaway

Bunki cannot credibly distinguish itself by saying that other products do not remember items, adapt reading, or select comprehensible examples. JPDB documents automatic i+1 sentences and vocabulary-driven kanji prerequisites; Satori Reader adjusts kanji/furigana to learner knowledge; Bunpro imports WaniKani state; LingQ changes word highlighting across future texts; and asbplayer now documents local/Anki/WaniKani word states and media comprehension statistics. These are existing baselines. [T02-07](https://jpdb.io/) [T02-08](https://jpdb.io/faq) [T02-13](https://bunpro.jp/pricing) [T02-17](https://www.satorireader.com/features) [T02-21](https://www.lingq.com/en/ios-app-support/) [T02-28](https://github.com/asbplayer/asbplayer)

**Design inference:** the defensible opening is the combination of auditable evidence provenance, distinct receptive/productive capabilities, uncertainty, confirmed tutor actions, and demonstrated transfer across surfaces. No reviewed source establishes the whole combination. That observation does **not** establish the universal claim “no product does this.” Keep that claim **UNVERIFIED** until competitors are tested directly.

FSRS-6 is a valid pinned architectural choice under the owner's law, but it must not be advertised as the newest FSRS. The current primary benchmark includes FSRS-7 as well as FSRS-6. Benchmark accuracy is not an effect size for Japanese acquisition. [T02-05](https://github.com/open-spaced-repetition/srs-benchmark)

## Cited findings

### Anki with FSRS

- **Core loop/model:** learner recalls, reveals and self-rates a card; FSRS predicts recall from review history and fits learner parameters. Desired retention controls the recall/workload tradeoff; the manual's default is **0.90**. “Hard” is a successful recall, not a replacement for “Again.” Optimization can be unreliable with few reviews. This is a card-memory model, not documented grammar/sense mastery across the app. [T02-01](https://docs.ankiweb.net/deck-options.html)
- **Version:** official AnkiMobile version history records **25.07**, dated **2025-07-21**, matching desktop **25.07** and explicitly mentioning **FSRS6**. Do not infer that every old Anki client has this version. [T02-03](https://apps.apple.com/us/app/ankimobile-flashcards/id373493387)
- **Ownership and fields:** `.colpkg` exports the full collection including scheduling; `.apkg` can include review history and media; tab-separated text exports note fields. Optional cloud sync and local file import/export are documented. Cards can contain audio, images and video. [T02-02](https://docs.ankiweb.net/exporting.html) [T02-03](https://apps.apple.com/us/app/ankimobile-flashcards/id373493387) [T02-04](https://apps.ankiweb.net/)
- **Price/platform:** desktop Windows/macOS/Linux **USD 0**, AnkiDroid **USD 0**, AnkiWeb sync **USD 0**. US-store AnkiMobile for iPhone/iPad is **USD 24.99**, one purchase; the listing says sync is optional and data can be transferred through USB/AirDrop. [T02-03](https://apps.apple.com/us/app/ankimobile-flashcards/id373493387) [T02-04](https://apps.ankiweb.net/)
- **Benchmark:** numerical results and dataset limitations are preserved in Track 03. These measure recall prediction, not Japanese-learning gains. [T02-05](https://github.com/open-spaced-repetition/srs-benchmark)
- **UNVERIFIED:** a native Japanese whole-language learner graph, automatic i+1 selection in core Anki, and cross-session AI tutor memory. Add-ons may supply functionality, but must be evaluated separately. **Inference:** preserve Anki interoperability and transparent review semantics; do not treat imported cards as proof of productive ability.

### JPDB

- **Known state and scheduling:** FAQ documents New, Learning, Known, Due, Failed, Locked, Never forget, Suspended, Blacklisted and Redundant states. “Known” means a positively reviewed card reaches an internal level and is not due; the exact threshold is **UNVERIFIED**. Suspended items count as not known; blacklisted items are removed from coverage consideration. Kana variants can inherit a reviewed kanji variant's state. Scheduler is a proprietary forgetting-curve model trained on review histories, not documented as FSRS. [T02-08](https://jpdb.io/faq)
- **Adaptation:** vocabulary determines the kanji/components taught bottom-up. Global difficulty is machine-learned from relative human comparisons and text features, including vocabulary, grammar and sentence complexity; this is separate from a particular learner's coverage. [T02-08](https://jpdb.io/faq)
- **Mining/i+1:** pasted text becomes chronological vocabulary; vocabulary cards receive examples where all words except the target are known. The site advertises a sentence database exceeding **130,000,000** examples; this is a vendor count, not a reuse license. [T02-07](https://jpdb.io/)
- **Coverage:** the dated changelog defines coverage as percentage of **total word occurrences**, distinct from unique-word count. A per-deck target can stop new vocabulary from that deck once reached. The documented feature dates to **2022-02-22**, so the idea is not a new market gap. [T02-09](https://jpdb.io/changelog)
- **Price/platform:** official creator page says core website is free (**USD 0**) and patron support starts at **USD 5/month**. FAQ says there is no native mobile app and recommends adding the website to the home screen. Current membership entitlements and a complete export contract are **UNVERIFIED**. [T02-10](https://www.patreon.com/jpdb) [T02-08](https://jpdb.io/faq)
- **Inference/unmet need:** word-form equivalence can conceal reading-specific weaknesses; a known-word coverage indicator does not measure listening or production. The exact tokenizer, SRS formulas, independent benchmark, API completeness and rights to the full sentence corpus remain **UNVERIFIED**.

### WaniKani

- **Mechanics:** a staged SRS for radicals, kanji and vocabulary; successful reviews advance a stage and failures reduce it. Guru unlocks associated material. Standard waits are **4 hours, 8 hours, 1 day, 2 days, 1 week, 2 weeks, 1 month, 4 months**; introductory levels have accelerated timing. Burned items stop appearing unless restored. This documented stage schedule is not FSRS-6. [T02-11](https://knowledge.wanikani.com/wanikani/srs-stages/)
- **Price:** **USD 9/month**, **USD 89/year**, **USD 299 lifetime**. These are regular public prices, excluding temporary promotions. [T02-12](https://knowledge.wanikani.com/account-and-membership/payment-and-billing/subscription-plans/)
- **Integration:** the official API exposes assignments, review statistics and spaced-repetition-system resources; the existence of an API is not the same as a device-owned append-only ledger. Bunpro documents using Burned/Guru states; Satori lists knowledge-sync integrations. [T02-34](https://docs.api.wanikani.com/20170710/) [T02-13](https://bunpro.jp/pricing) [T02-18](https://www.satorireader.com/resources)
- **Platforms:** browser service is verified; current first-party native-app availability is **UNVERIFIED** in this track. **Inference:** useful model for explicit prerequisite unlocking and typed answers, but do not use “Burned” as evidence that a learner can spontaneously produce a word or comprehend it in speech. Independent Japanese outcome effect sizes: **UNVERIFIED**.

### Bunpro

- **Core loop:** grammar/vocabulary review using changing contexts, alternate correct answers, explanations and optional “Ghost” remedial reviews. The public product page claims more than **900 grammar items**, **10,000 grammar examples**, **120 graded passages** and **100,000 vocabulary context sentences**; these are vendor counts. Native grammar-example audio is documented. [T02-13](https://bunpro.jp/pricing)
- **Adaptation:** WaniKani level can control furigana; matching Burned vocabulary can be marked known; Guru vocabulary can be added for practice. This is documented cross-product knowledge reuse. [T02-13](https://bunpro.jp/pricing)
- **SRS:** review settings describe Ghosts as a separate SRS focusing on the failed sentence/nuance while ordinary review proceeds. Exact current algorithm/version and **FSRS-6 integration are UNVERIFIED**. The presence of community requests for FSRS is not sufficient to prove present absence. [T02-14](https://bunpro.jp/support/account/Review-Settings) [T02-15](https://community.bunpro.jp/t/fsrs/129842/26)
- **Price/platform:** free reference tier **USD 0**, Premium **USD 5/month**, lifetime **USD 150**; **30-day** trial. Web plus official iOS and Android links are on the pricing page. Annual billing is offered by a toggle, but its amount was not exposed in the retrieved page: **UNVERIFIED**. [T02-13](https://bunpro.jp/pricing)
- **Inference/unmet need:** keep targeted remediation separate from global grammar competence, and avoid letting repeated cloze recognition imply spontaneous production. No reviewed documentation establishes a local authoritative export ledger, cross-session AI memory, or independent causal Japanese efficacy: **UNVERIFIED**.

### Satori Reader

- **Reader and cards:** curated Japanese stories, contextual dictionary senses, sentence-level explanations, native actor audio, knowledge-dependent kanji/furigana and contextual flashcards retaining the original sentence/audio. Native apps support offline downloads. The site describes **1,650+ episodes** in **43 series**. [T02-17](https://www.satorireader.com/features)
- **Content verification:** Satori explicitly documents human writing/licensing, editing for difficulty, linking each word to its dictionary entry and sense, annotations and repeated proofreading. This is a meaningful quality baseline for Bunki's generated teaching content. It is **human content QA**, not a validated generated-Japanese pipeline. [T02-19](https://www.satorireader.com/ai)
- **Known state integrations:** WaniKani, Kanji Study and MaruMori are documented as sources of known-character information; spelling display is adapted to that knowledge. [T02-18](https://www.satorireader.com/resources)
- **Price:** free **$0**; Pro **$9/month** or **$89/year**. The public pricing text returned dollar signs without an explicit currency code; **USD denomination is UNVERIFIED** in this retrieval. Native-app offline access is included; exact iOS/Android store pricing can differ and was not quoted. [T02-16](https://www.satorireader.com/pricing)
- **UNVERIFIED:** exact SRS algorithm/version, cross-session AI tutor memory, complete learner-history export and controlled Japanese-learning effect size. **Inference:** borrow sense-specific glossing and reviewed source audio before generating large quantities of novel material.

### LingQ

- **Known state:** unseen words are blue, saved learning words yellow and known words white. The official iOS instructions say moving to the next page treats unselected blue words as known. Reviewing correctly **twice** raises word status; learners can also change it manually. This is a mixture of inferred exposure and review success, unlike Bunki's required provenance separation. [T02-21](https://www.lingq.com/en/ios-app-support/)
- **Immersion:** imports from URL, text, files and scans; sentence view offers translation, audio, rearrangement and dictation. Vocabulary states appear across future content. Exact Japanese lemmatization/sense disambiguation and coverage formula are **UNVERIFIED**. [T02-21](https://www.lingq.com/en/ios-app-support/)
- **Current AI offer:** Premium Plus now lists Advanced Lynx Chat, AI voices, AI Simplified Lessons and **6× audio transcription**. Cross-session Lynx memory, constraints on simplification and generated-Japanese verification remain **UNVERIFIED**. [T02-20](https://www.lingq.com/en/signup/)
- **Price:** Premium **USD 14.99/month**, **USD 119.99/12 months**, **USD 215.76/24 months**. Premium Plus **USD 29.99/month**, **USD 269.99/12 months**. Longer periods are paid up front and renew. [T02-20](https://www.lingq.com/en/signup/)
- **Export:** a staff forum reply documents filtered vocabulary export, including learned statuses; this does not establish full review-log export or local authority. Web and iOS are verified here; current Android details are **UNVERIFIED** in this track. Exact SRS version and Japanese causal efficacy are **UNVERIFIED**. [T02-22](https://forum.lingq.com/t/vocabulary-manually-add-new-words-export-the-learned-words-issue-with-the-phrase-highlighting/1922701/2)
- **Inference:** never copy “not looked up therefore known” into measured evidence. Save it as exposure or explicitly labeled self-report and invite a later probe.

### Renshuu

- **Scope:** official site demonstrates kanji-sensitive display, vocabulary, grammar, listening, sentence completion, typed kana and sentence ordering. Its learning paths can follow a textbook or learner choice. [T02-23](https://www.renshuu.org/index.php?page=main/landing)
- **Knowledge mechanics:** explanations on its own community forum say mastery is tracked separately for directions such as meaning→Japanese and kanji→kana. **Evidence limitation:** this verifies the community explanation, not a reviewed source-code implementation; precise scheduler/aggregation formulas remain **UNVERIFIED**. This is nevertheless a relevant precedent for multidimensional item state, requiring a signed-in follow-up. [T02-25](https://www.renshuu.org/forums/topics/13954/What%2Bdo%2Bthe%2B%26quot%3Bmastery%2Btypes%26quot%3B%2Bmean%2Fdo%3F%2BLike%2B%26quot%3Bkanji%E2%86%92kana%26quot%3B%3F)
- **Price/platform:** US iOS listing is free with IAP. It lists subscription SKUs at **USD 3.99** and **USD 6.99** without exposing billing period; annual SKUs **USD 49.99** and **USD 59.99**; lifetime **USD 109.99** and **USD 129.99**. These are multiple SKUs, not proof all are offered to new purchasers. Which is the current default is **UNVERIFIED**. Browser/iPhone/iPad are verified; precise Android listing not inspected here. [T02-24](https://apps.apple.com/us/app/renshuu-japanese-learning/id1542730063)
- **UNVERIFIED:** native FSRS-6, complete export, cross-session AI tutor and controlled Japanese-learning efficacy. **Inference:** test existing multidirectional mastery UX before claiming Bunki invented separate receptive/productive states.

### Yomitan

- **Role/platform/price:** free (**USD 0**) browser popup dictionary with dictionary, frequency, audio and Anki integration; official website lists Chrome, Firefox, Edge and Android support. iOS support is **UNVERIFIED**, not assumed from desktop extension support. [T02-26](https://yomitan.wiki/)
- **Mining contract:** configured Anki note types accept expression, reading, dictionary, glossary, original inflection, conjugation path, sentence/cloze fragments, document title, URL, audio, image and pitch-related markers. The experimental note generator exports plain-text Anki notes; that path excludes media. AnkiConnect supplies scheduling, rather than Yomitan implementing FSRS itself. [T02-27](https://yomitan.wiki/anki/)
- **Ownership:** extension storage contains settings/dictionaries; permissions cover page scanning, audio requests and Anki connections. Offline dictionary data should not be mistaken for permission to reuse every installed dictionary. [T02-35](https://yomitan.wiki/privacy/)
- **UNVERIFIED:** independent whole-language learner model or tutor memory. **Inference:** Bunki should import/export a comparable rich note schema and retain the original surface form, dictionary identity, context and source; a plain “word+translation” card loses important provenance.

### asbplayer

- **Current scope:** browser media player and Chrome extension, subtitle extraction/loading, navigable subtitles, media cards, condensed playback, fast-forward through gaps and automatic subtitle-boundary pause. Word states can come from Anki, WaniKani or local tracking; readings, pitch and frequency can be annotated conditionally, and current-media comprehension statistics are documented. [T02-28](https://github.com/asbplayer/asbplayer)
- **Important shipped/planned distinction:** status-driven auto-pause, auto-mining and cross-media statistics are explicitly listed as planned in the current README. Do not mark them shipped. [T02-28](https://github.com/asbplayer/asbplayer)
- **Mining:** the project documents a Yomitan + AnkiConnect proxy pipeline to enrich dictionary cards with image and audio; asbplayer alone does not supply word definitions. [T02-29](https://docs.asbplayer.dev/docs/guides/one-click-mining/)
- **License/cost:** current repository displays **AGPL-3.0**. Source-download license fee **USD 0**; this says nothing about external media, hosting or service costs. Some secondary pages call it MIT: use the exact selected revision's license at integration time. [T02-28](https://github.com/asbplayer/asbplayer)
- **UNVERIFIED:** a calibrated learner model, Japanese learning effect size, full tutor memory and native scheduler. **Inference:** the integration is an important interoperability target; reuse of implementation requires a license review distinct from adopting a workflow idea.

### Language Reactor

- **Verified scope/platform:** current official Chrome listing describes Netflix/YouTube dual subtitles, popup dictionary, playback controls, imported-text machine translation and text-to-speech, for Chrome on Windows/macOS desktop/laptop. Listing version **5.1.8**, updated **2026-07-01**. [T02-30](https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm?hl=en)
- **Price limitation:** official Pro page returned no readable price. Third-party competitor comparison reports **USD 5.95/month**, **USD 13.95/3 months**, **USD 39.95/year**, but these are **UNVERIFIED against a live official checkout** and must not enter Bunki unit-economics assumptions as confirmed values. [T02-31](https://www.languagereactor.com/pro-mode) [T02-36](https://lexirise.app/blog/article/lexirise-vs-language-reactor)
- **UNVERIFIED:** exact known-word formula, Japanese segmentation, current SRS/version, AI tutor memory, native mobile equivalence, export scope and Japanese efficacy. Official forum bug reports show individual playback/translation failures, but frequency and prevalence cannot be inferred. [T02-37](https://forum.languagelearningwithnetflix.com/t/language-reactor-gets-stuck-on-loading/40501)
- **Inference:** an extension tied to third-party playback UIs needs graceful degradation and local-file fallbacks; do not equate platform integration with perpetual media access.

### mokuro

- **Mechanics:** offline page detection/OCR creates a `.mokuro` metadata file to open with the manga images in a web reader. Legacy HTML remains supported. It uses comic-text-detector and manga-ocr; selectable text enables Yomitan lookups. Original project is **GPL-3.0** and requires **Python 3.10+**. Source-download license fee **USD 0**; compute and lawful manga acquisition are separate. [T02-32](https://github.com/kha-white/mokuro)
- **UNVERIFIED:** built-in mastery model, scheduler, coverage/i+1 selection, tutor memory and OCR correctness for arbitrary content. Separate mokuro-reader forks may add capabilities; do not attribute them automatically to the original package.
- **Inference:** import OCR results as unverified source text, preserve bounding boxes and page identity, allow correction, and do not silently mine misrecognized Japanese into teaching cards. Open-source OCR code conveys no license to redistribute input manga.

### Jimaku

- **Verified scope:** public web index provides named subtitle collections, search by file name/AniList URL and a login-to-upload interface. The inspected surface is an asset index, not an SRS or tutor. [T02-33](https://jimaku.cc/)
- **UNVERIFIED:** blanket commercial license for hosted subtitles, per-file rights chains, subscription/API pricing, accuracy guarantees and learning efficacy. Public accessibility is not evidence of redistribution rights. Do not package this corpus with Bunki under an assumed open-content license.
- **Inference:** a learner-import workflow can retain each subtitle's provenance; any shipping bundle requires item-level permission, not just an index link.

### subs2srs

- **Mechanics/card fields:** parses subtitles and timestamps, aligns optional translated subtitles, extracts clips/snapshots and emits TSV plus media. Its example card schema includes source dialogue, translation, audio, image/video, tags, sequence/time marker and neighboring context. Preview is explicitly for checking subtitle correspondence and audio alignment. It is a mining pipeline, not a scheduler. [T02-38](https://subs2srs.sourceforge.net/)
- **Platform/license:** project page lists Windows/WINE, .NET/Mono and **GPLv3**; last project update shown is **2017-10-01**. Source-download license fee **USD 0**. This is intentionally an older source because it is the original maintained documentation available, not evidence of a recent rewrite. [T02-39](https://sourceforge.net/projects/subs2srs/)
- **UNVERIFIED:** current operating-system compatibility, knowledge-aware selection, scheduler, learner graph, tutor and Japanese outcome effect size. **Inference:** borrow explicit timing/context fields and preview gates; avoid automatically scheduling every subtitle as a card.

### Capability matrix candidates

Legend: **D** = directly documented; **P** = partial/integration-dependent; **U** = **UNVERIFIED**; **N/A** = documented tool role makes the capability inapplicable. These are documentation findings, not benchmark results. “State changes content” includes annotations and item selection, not necessarily generative personalization. “FSRS-6” means explicit implementation/integration, not a generic SRS. A bare U must never be converted into “No” in the final matrix.

| Tool | Japanese | Cross-session tutor memory | Explicit per-item state | State changes content | Immersion mining | FSRS-6 | Source keys |
|---|---|---|---|---|---|---|---|
| Anki | D: Japanese cards | U | D: cards | P: review selection | P: integrations | D: compatible releases | T02-01–04,27–29 |
| JPDB | D | U | D: vocab/kanji | D: i+1/prerequisites | D: pasted text | U: proprietary SRS | T02-07–10 |
| WaniKani | D | U | D: item SRS | D: prerequisite unlock | U | N/A: documented stage SRS | T02-11,34 |
| Bunpro | D | U | D: grammar/vocab | D: contexts/furigana | P: existing study content | U | T02-13–15 |
| Satori Reader | D | U | D: words/kanji | D: display | D: story cards | U | T02-17–19 |
| LingQ | D | U | D: word statuses | D: reader | D: imports | U | T02-20–22 |
| Renshuu | D | U | D; vector details provisional | D: display | U | U | T02-23–25 |
| Yomitan | D | N/A: dictionary | P: Anki | U | D | P: through Anki | T02-26–27 |
| asbplayer | D: annotations | N/A: media tool | D: word statuses | D: annotations | D | P: through Anki | T02-28–29 |
| Language Reactor | D | U | U | U | P: imported media/text | U | T02-30–31 |
| mokuro | D | N/A: OCR | U | U | P: OCR+dictionary | P: external chain only | T02-32 |
| Jimaku | D: assets | N/A: index | N/A | N/A | P: subtitle source | N/A | T02-33 |
| subs2srs | D: supported input | N/A: converter | N/A | N/A | D | P: export to Anki | T02-38–39 |

| Tool | Speech conversation | Listening content | Production feedback | Local/export ownership | Validated generated Japanese | Independent Japanese efficacy | Source keys |
|---|---|---|---|---|---|---|---|
| Anki | U | P: supplied audio | P: self-rating | D: local + full export | U | U | T02-01–05 |
| JPDB | U | P: examples/audio | U | U | U | U | T02-07–10 |
| WaniKani | U | U: word audio ≠ listening course | P: bounded review answers | P: API | U | U | T02-11,34 |
| Bunpro | U | D: example audio | D: bounded alternate answers | U | U | U | T02-13–14 |
| Satori Reader | U | D: human story audio | P: human discussion help | P: offline; full export U | N/A: human-authored QA | U | T02-17–19 |
| LingQ | P: tutoring offer; AI voice loop U | D | P: dictation/writing service | P: vocabulary export/offline | U | U | T02-20–22 |
| Renshuu | U | D: drills | D: bounded exercises | U | U | U | T02-23–25 |
| Yomitan | N/A | P: lexical audio | N/A | D: local dictionaries/export | N/A | U | T02-26–27,35 |
| asbplayer | N/A | D: user media | N/A | D: local media/mining | N/A | U | T02-28–29 |
| Language Reactor | U | D: media | U | U | U | U | T02-30–31 |
| mokuro | N/A | N/A | N/A | D: offline OCR/files | N/A | U | T02-32 |
| Jimaku | N/A | P: text asset only | N/A | P: downloadable asset; rights U | N/A | U | T02-33 |
| subs2srs | N/A | D: supplied media | N/A | D: TSV/media files | N/A | U | T02-38–39 |

## Inferences for Bunki's build specification

These are **design recommendations**, not external scientific findings.

1. **Retain item identity without collapsing modalities.** Use stable dictionary entry/sense/reading/form IDs plus source surface text. An imported “known” word is an import assertion with original provenance, never automatically a measured productive success.
2. **Separate learning evidence from scheduling evidence.** All surfaces may add exposure or confirmed observations; only learner-confirmed review grades feed FSRS-6. Tutor suggestions cannot manufacture dates or schedule state. Schema validation should reject a proposed card object that contains a due date or grade.
3. **Distinguish coverage from comprehension.** Report token coverage and uncertain/unknown target counts for a particular text. Preserve denominator rules for punctuation, names, multiword expressions, suspended/ignored items and tokenizer version. Do not turn coverage into an overall learner-level claim.
4. **Separate difficulty from personal fit.** A corpus difficulty rating and learner coverage answer different questions. Rank attested sentences using known/uncertain words, reading/form pain nodes, goal relevance and genuine novelty; do not assume lexical i+1 ensures comprehensible grammar.
5. **Use explicit confirmation and provenance for mining.** Proposed card fields: source URI/title, source hash, source time/page/region, context before/after, exact Japanese span, dictionary ID, sense ID, reading, conjugation, gloss, audio range and ownership/license status. Learner accepts, edits or declines before the append-only record is changed.
6. **Make source corrections reversible.** OCR and subtitle text are candidate evidence, not gold. Correction should append a replacement/retraction event preserving the original content and reason. A corrected reading must invalidate derived examples using the wrong association.
7. **Compete on measured transfer.** Use held-out reading, listening and production probes. Scheduler log loss, total vocabulary, review streaks and content completion are not interchangeable with language-learning outcomes.
8. **Keep personal choices in data.** Existing known items, dictionaries, interests, desired retention, goals, accessibility and content exclusions should be editable record rows, not code branches named after a learner.

## Gaps and follow-up gates

- **Not a live teardown:** no signed-in accounts or test purchases were used. Cross-session memory claims, paid feature limits, negative behavior and exact export completeness require reproducible scripted account tests. This notes file must not be represented as exhaustive hands-on product evaluation.
- **Prices:** Satori's currency code, Bunpro annual price, Renshuu default checkout SKU/billing interval and Language Reactor official Pro amount remain **UNVERIFIED**. Do not derive a “cheaper than competitors” claim from these rows.
- **Algorithms:** proprietary version/formula details for JPDB, Bunpro, LingQ, Satori and Renshuu remain **UNVERIFIED**. “Uses machine learning” is not enough to infer BKT, DKT, FSRS or any particular graph model.
- **Efficacy:** this search did not establish independent, controlled Japanese-specific learning effect sizes for the reviewed products. Mark the matrix U; do not write that no studies exist. Anki/FSRS benchmark results establish prediction performance for the sampled logs, not causal superiority for Japanese learners.
- **Coverage:** JPDB's token-vs-type distinction is verified; exact current tokenizer/version, coverage handling for all item states and empirical relationship to comprehension remain to be tested. Displaying a percent of known tokens is permissible under Bunki's law only if clearly scoped to the document and not presented as readiness.
- **Rights:** open-source tool licenses and media-content licenses are separate. No blanket redistributable license for Jimaku or JPDB's full sentence bank was established. Verify every selected asset independently. Pin tool versions; current asbplayer license differs from some secondary descriptions.
- **Source mutability:** the live FSRS benchmark and software READMEs can change. Preserve retrieval snapshots/commit hashes before implementing comparisons. Do not assume the benchmark's latest algorithm supersedes Bunki's explicit FSRS-6 law.

## Source register

All access dates below are **2026-09-28**. “Undated” means no reliable publication/update date was exposed; crawl dates are not publication dates. Exact dates are used only where the source exposes them. A citation to a community post establishes that author's reported behavior, not vendor-wide guarantees.

| Key | Source URL | Publication/update date | Access date / role |
|---|---|---|---|
| T02-01 | https://docs.ankiweb.net/deck-options.html | Undated, live manual | 2026-09-28; primary mechanics |
| T02-02 | https://docs.ankiweb.net/exporting.html | Undated, live manual | 2026-09-28; primary export |
| T02-03 | https://apps.apple.com/us/app/ankimobile-flashcards/id373493387 | Store page undated; relevant version 25.07 dated 2025-07-21 | 2026-09-28; primary US price/features/version |
| T02-04 | https://apps.ankiweb.net/ | Undated | 2026-09-28; primary platforms/free availability |
| T02-05 | https://github.com/open-spaced-repetition/srs-benchmark | Undated live README; snapshot date 2026-09-28 | 2026-09-28; primary benchmark, developer-maintained |
| T02-07 | https://jpdb.io/ | Undated | 2026-09-28; primary product claims |
| T02-08 | https://jpdb.io/faq | Undated | 2026-09-28; primary state/mechanics |
| T02-09 | https://jpdb.io/changelog | Relevant coverage entry 2022-02-22 | 2026-09-28; dated primary change history |
| T02-10 | https://www.patreon.com/jpdb | Undated | 2026-09-28; official creator pricing |
| T02-11 | https://knowledge.wanikani.com/wanikani/srs-stages/ | Undated | 2026-09-28; primary algorithm/stages |
| T02-12 | https://knowledge.wanikani.com/account-and-membership/payment-and-billing/subscription-plans/ | Undated | 2026-09-28; primary USD prices |
| T02-13 | https://bunpro.jp/pricing | Undated | 2026-09-28; primary prices/features/platforms |
| T02-14 | https://bunpro.jp/support/account/Review-Settings | Last updated 2025-03-11 | 2026-09-28; primary Ghost explanation retrieved in search excerpt; body renderer incomplete |
| T02-15 | https://community.bunpro.jp/t/fsrs/129842/26 | Exact publication date UNVERIFIED; search metadata approximately 2026-07 | 2026-09-28; community request, not proof of absence |
| T02-16 | https://www.satorireader.com/pricing | Undated | 2026-09-28; primary prices; currency code not exposed |
| T02-17 | https://www.satorireader.com/features | Undated | 2026-09-28; primary reader/cards/audio |
| T02-18 | https://www.satorireader.com/resources | Undated | 2026-09-28; primary integrations |
| T02-19 | https://www.satorireader.com/ai | Undated | 2026-09-28; primary human content-QA process |
| T02-20 | https://www.lingq.com/en/signup/ | Undated | 2026-09-28; primary USD prices/current AI offer |
| T02-21 | https://www.lingq.com/en/ios-app-support/ | Undated | 2026-09-28; primary reader/state/import mechanics |
| T02-22 | https://forum.lingq.com/t/vocabulary-manually-add-new-words-export-the-learned-words-issue-with-the-phrase-highlighting/1922701/2 | Exact date UNVERIFIED; search metadata approximately 2025-08 | 2026-09-28; staff export explanation |
| T02-23 | https://www.renshuu.org/index.php?page=main/landing | Undated | 2026-09-28; primary public product UI |
| T02-24 | https://apps.apple.com/us/app/renshuu-japanese-learning/id1542730063 | Undated live listing | 2026-09-28; primary US IAP SKU list |
| T02-25 | https://www.renshuu.org/forums/topics/13954/What%2Bdo%2Bthe%2B%26quot%3Bmastery%2Btypes%26quot%3B%2Bmean%2Fdo%3F%2BLike%2B%26quot%3Bkanji%E2%86%92kana%26quot%3B%3F | Exact date UNVERIFIED | 2026-09-28; community vector explanation, lower confidence than code/docs |
| T02-26 | https://yomitan.wiki/ | Undated | 2026-09-28; primary features/platforms/free availability |
| T02-27 | https://yomitan.wiki/anki/ | Page dated 2026-02-25 | 2026-09-28; primary marker/export contract |
| T02-28 | https://github.com/asbplayer/asbplayer | Undated live README | 2026-09-28; primary features/license; pin a commit before reuse |
| T02-29 | https://docs.asbplayer.dev/docs/guides/one-click-mining/ | Undated | 2026-09-28; primary integration workflow |
| T02-30 | https://chromewebstore.google.com/detail/language-reactor/hoombieeljmmljlkjmnheibnpciblicm?hl=en | Updated 2026-07-01 | 2026-09-28; primary extension feature/platform listing |
| T02-31 | https://www.languagereactor.com/pro-mode | Undated | 2026-09-28; primary endpoint; readable price unavailable |
| T02-32 | https://github.com/kha-white/mokuro | Undated live README | 2026-09-28; primary processing/license |
| T02-33 | https://jimaku.cc/ | Undated live index; item timestamps vary | 2026-09-28; primary index only, no blanket license established |
| T02-34 | https://docs.api.wanikani.com/20170710/ | Version URL 20170710; live-doc update date UNVERIFIED | 2026-09-28; primary API schema |
| T02-35 | https://yomitan.wiki/privacy/ | Undated | 2026-09-28; primary storage/permissions |
| T02-36 | https://lexirise.app/blog/article/lexirise-vs-language-reactor | Search metadata 2026-09-27; article says price observed 2026-08-24 | 2026-09-28; competitor-authored secondary lead; price remains UNVERIFIED |
| T02-37 | https://forum.languagelearningwithnetflix.com/t/language-reactor-gets-stuck-on-loading/40501 | Includes 2026-05-25 reply | 2026-09-28; anecdotal issue, prevalence unknown |
| T02-38 | https://subs2srs.sourceforge.net/ | Undated historical manual | 2026-09-28; primary mining schema |
| T02-39 | https://sourceforge.net/projects/subs2srs/ | Project last update 2017-10-01 | 2026-09-28; primary project metadata/license |

