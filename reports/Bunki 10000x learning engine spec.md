# Build the Learner Engine Bunki Already Promised

Bunki (回廊 KAIRO) can become the living learner intelligence its owner describes without changing a single one of its laws, because the laws are the design: an append-only, device-owned ledger, one pure derived model, FSRS-6 as the only scheduler, and every surface a query over that model. What is missing is not the substrate but the loop that reads the model back. On `main` today the ledger, the model (`learnerModel()` version 2, four bands, top-12 confusions, a 12-node frontier) and a page that displays it all exist and are pinned by verifiers, while every adapting surface is still queued and nine prompts still steer on a deck-tag guess ([prior audit](/tmp/claude-0/-home-user-Bunki-app/6580e08d-8641-563c-8660-e8a03876a0d0/scratchpad/KAGAMI_VISION_VS_BUILD_2026-09-28.md); [kagami/RUN_STATE.md](/home/user/Bunki-app/docs/build-evidence/kagami/RUN_STATE.md)). The research in this report shows that no shipping competitor holds a learner state spanning immersion, spaced retrieval and conversation; the closest, Migaku, reduces knowledge to a 21-day-interval word status, and the AI tutors (Speak, Langua, Praktika, Duolingo) remember facts and topics, not mastery ([Migaku statuses](https://migaku.com/blog/youtube/the-learning-statuses-migaku-browser-extension); [Langua](https://languatalk.com/ai-japanese-tutor)). The learning science favours exactly the interpretable, prior-seeded per-item design the repo's codex already prescribes: on the open 10,000-user benchmark a 21-parameter FSRS-6 beats Duolingo's HLR and Ebisu by a wide margin and is within ~0.01 log loss of a 503-parameter GRU ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark/blob/main/README.md)), spaced retrieval carries a g of 0.74 ([Latimier 2021](https://eric.ed.gov/?id=EJ1310148)), and LLM tutors only help when they withhold answers and are verified ([PNAS 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122)). The 2026 Claude platform makes a stateful, tool-using sensei affordable, roughly $0.25 a day for forty Sonnet 5 turns with a frozen cached prefix, and structured outputs make typed observation extraction reliable ([Pricing](https://platform.claude.com/docs/en/about-claude/pricing); [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). Part two of this report is the build specification: ledger row shapes, a derived model with nodes for words, kanji, readings, senses, grammar points and forms, update rules per evidence tier, placement, the sensei's tool set and prompt architecture, every surface as a query, the speech stack, a licensing table, the platform, an efficacy plan, ten ordered milestones (about 47 builder-weeks, estimated) starting with a stateful tutor plus placement and a planner, and the open owner decisions with a recommendation each.

> **Research-access caveat, stated prominently.** The research environment had partial web access. The egress proxy blocked most primary sites (jpdb.io, migaku.com, satorireader.com, lingq.com, bunpro.jp, tofugu.com, arxiv.org, Springer, ACM, ScienceDirect, PMC, ERIC, J-STAGE, huggingface.co, elevenlabs.io, deepgram.com, learn.microsoft.com, vercel.com, jlpt.jp, nhk.or.jp, aozora.gr.jp, tatoeba.org, the App Store and Play Store), and the web-search budget ran out in every research thread. Only github.com, platform.claude.com, developer.apple.com and a few others were readable in full. Every claim below that rests on a search-engine snippet rather than a fetched page is marked **(snippet)**; every claim the researchers could not corroborate is marked **UNVERIFIED**; the repository facts were measured locally. None of these flags has been removed in synthesis. Competitor pricing, most peer-reviewed effect sizes beyond the headline numbers, the JLPT-CEFR cut scores, NHK and Aozora audio reuse terms, and all speech-vendor prices should be re-verified before any of them is quoted publicly.

---

# Part one — research synthesis

## Bunki owns the substrate; the mirror still does not act

The repository is further along than its own decision sheets admit, and further behind than its vision statement implies. The kernel packages (`@bunki/domain`, `persistence`, `export`, `ai`, `seed`, `apps/app`) pass **100 test files and 1,710 tests in 15.7 seconds** in this container, and the domain package ships a replay-tested, closed fifteen-event catalog with a verified FSRS-6 pin (ts-fsrs 5.4.1, desired retention 0.9, 21 weights frozen verbatim, build fails if the library's defaults drift) ([fsrs-pin.ts](/home/user/Bunki-app/packages/domain/src/reducers/fsrs-pin.ts); [package.json](/home/user/Bunki-app/package.json)). The shipped product, however, is the **760 KB `corridor.js`**, which imports none of those packages and is held to them only by "contract parity" under ADR-004 ([README.md](/home/user/Bunki-app/README.md); [corridor README](/home/user/Bunki-app/prototypes/corridor/README.md)). Its data bundle is unusually rich for a solo project: a 69,996-entry JMdict-derived dictionary sharded sixteen ways, 8,407 graded words, 2,582 kanji with KanjiVG strokes and AnimCJK equivalence, 900 idioms, a **45,276-sentence tokenized and glossed sentence bank** with a 40,082-headword inverted index, 77 shelf articles plus a 686-article Wikinews archive, 25 mock papers holding 423 items, and **22,210 synthesized word and sentence audio clips** ([dict-v2/index.json](/home/user/Bunki-app/prototypes/corridor/data/share_alike/dict-v2/index.json); [examples/manifest.json](/home/user/Bunki-app/prototypes/corridor/data/proprietary_safe/examples/manifest.json); [audio/manifest.json](/home/user/Bunki-app/prototypes/corridor/audio/manifest.json)). Almost all of it is CC BY, CC BY-SA, CC0, public domain or OFL, checked by a fail-closed rights gate in CI, and the corridor already accepts that "the deployed artifact itself is ShareAlike" ([pages-app.yml](/home/user/Bunki-app/.github/workflows/pages-app.yml); [corridor README](/home/user/Bunki-app/prototypes/corridor/README.md)).

The learner-model half is the first third of the plan. Eleven observation row kinds pass `validObservationRow` (tap, probe, dojo, lesson, reveal, note, mock, sensei, confuse, drift, params), `learnerModel()` derives four bands where a level cell counts only with four or more measured answers and clears at 60 percent, measured and observed evidence are kept apart per cell, and the function is pure, memoized, never persisted and pinned by `verify-kagami.mjs` (30 checks) ([prior audit](/tmp/claude-0/-home-user-Bunki-app/6580e08d-8641-563c-8660-e8a03876a0d0/scratchpad/KAGAMI_VISION_VS_BUILD_2026-09-28.md)). But the only consumer on `main` is the 鏡 mirror page; the shelf, reader dials, dojo pools, mock picker, lessons, drift and the mining pass never read it, and `aiLevelGuess()`, which returns the most common JLPT tag among deck words and ignores every grade, still steers all nine prompt call sites, including a reading-room line that tells the learner "you read at about N-x", which the amendment's own law 10 forbids ([corridor.js](/home/user/Bunki-app/prototypes/corridor/corridor.js); [BUNKI_KAGAMI_AMENDMENT_2026-09-21.md](/home/user/Bunki-app/docs/prompts/BUNKI_KAGAMI_AMENDMENT_2026-09-21.md)). Mining runs on one surface (chat), writes at most four rows per exchange, and accepts only word and single-kanji subjects; readings, senses, grammar points and forms exist in the campaign's taxonomy but not in the model's keys. The repository's own gap census names the rest: no N1 lesson lane, no doors from the dojo lobby, "the mirror does not act", "no declared goal, two learner models", papers that are diagnostics rather than rehearsal, no place for external evidence, no listening, a production rubric id with no rubric text, no 国語 track, and gates that had gone red ([BUNKI_KAGAMI_AMENDMENT_2026-09-21.md](/home/user/Bunki-app/docs/prompts/BUNKI_KAGAMI_AMENDMENT_2026-09-21.md)).

PR #99 is where the engine half already exists in draft. It is **257 commits ahead of `056b8b27` (553 files, +210,519/−6,127)**, a figure that supersedes the prior audit's "121 commits" ([bunki_repo_inventory](/home/user/Bunki-app/research_notes/Bunki%2010000x%20learning%20engine%20spec/bunki_repo_inventory.md)). It splits the corridor into esbuild modules, adds `packages/assessment` with SHA-256-pinned item and form revisions and an attempt lifecycle, an async record host whose commands land in one transaction, IndexedDB and SQLite replication, a Swift CloudKit transport that has never touched live CloudKit, an iOS host that has never compiled, source-bound sentence practice with the first production rubric string, and `aiTeachingContext()`, which replaces the deck-tag guess with bands, six provenance-tagged targets and four confusion pairs from `learnerModel()` ([packages/assessment/README.md (PR #99)](/home/user/bunki-final/packages/assessment/README.md); [record-host.mjs (PR #99)](/home/user/bunki-final/prototypes/corridor/record-host.mjs); [apps/kairo-ios/README.md (PR #99)](/home/user/bunki-final/apps/kairo-ios/README.md)). ADR-005 on that branch sets a law the spec below inherits: AI-reviewed original practice is labelled as such and "does not imply official JLPT endorsement, psychometric calibration or a predicted scaled score" ([ADR-005 (PR #99)](/home/user/bunki-final/docs/adr/ADR-005-assessment-evidence-and-ai-review.md)). Thirty-three operator decisions remain open across three registers, the repository licence (OD-09) among them, and no file records an answer to any of them ([DECISION_SHEET.md](/home/user/Bunki-app/docs/build-evidence/renkan/DECISION_SHEET.md); [BUNKI_OPERATOR_DECISIONS_2026-07-27.md](/home/user/Bunki-app/docs/specs/BUNKI_OPERATOR_DECISIONS_2026-07-27.md)).

## No competitor holds a learner state across immersion, review and conversation

The teardown of twelve products reveals a market split into two camps that never meet. The immersion and SRS camp (jpdb, Migaku, WaniKani, Bunpro, Satori Reader, LingQ, Anki) holds per-item state but reduces it to an interval-thresholded label. jpdb exposes a per-(vocabulary id, spelling id) state machine of new, learning, known, due, failed, never-forget, locked, suspended, blacklisted and redundant through its API, pre-parses every supported title so coverage updates instantly, and advertises automatic i+1 sentence cards from "over 130 million real Japanese sentences", yet publishes no selection rule and no scheduler formula, only the claim that its ML model beats SM-2 **(snippet)** ([jpd-breader](https://github.com/max-kamps/jpd-breader); [jpdb FAQ (snippet)](https://jpdb.io/faq)). Migaku marks a word "Known" once "you only need to review a word once every 21 days or less" and derives a per-content comprehension score from that binary **(snippet)** ([Migaku statuses](https://migaku.com/blog/youtube/the-learning-statuses-migaku-browser-extension)). WaniKani's nine stages run fixed intervals of 4 hours to 4 months with a penalty of `ceil(incorrect/2)` stages, doubled above Guru, and it is the one shipping precedent for separate reading and meaning contracts per item ([Kakehashi research note](https://github.com/Portego-00/Kakehashi/blob/main/research/wanikani-custom-srs-web.md)). Bunpro's ghost reviews (4h, 12h, 24h, 48h in the 2018 announcement) make lapses visible, but a 125-reply thread titled "Bunpro's bad SRS algorithm is discouraging" documents the cost of fixed-ladder demotion **(snippet)** ([Bunpro Community 90066](https://community.bunpro.jp/t/bunpros-bad-srs-algorithm-is-discouraging/90066)). LingQ's failure mode is the mirror image: finishing a lesson auto-marks every word known, producing "six figures" of known words with no comprehension **(snippet)** ([LingQ forum](https://forum.lingq.com/t/the-finish-lesson-makes-all-words-known-feature-is-problematic/2621918)). Satori Reader sets the reading bar with per-context tap definitions and furigana rendered "According to your knowledge" at kanji granularity, all "written, edited, recorded, and annotated by people" **(snippet)** ([Satori Reader help](https://www.satorireader.com/help)). None of these stores confidence, evidence tier, receptive-versus-productive state, or a confusion model, and none documents a formula for coverage or difficulty ([learner_knowledge_graph note](/home/user/Bunki-app/research_notes/Bunki%2010000x%20learning%20engine%20spec/learner_knowledge_graph.md)).

The AI-tutor camp (Speak, Langua, Praktika, Duolingo Max, Jumpspeak, Todaii, TalkPal, Busuu) has memory but no mastery model. Langua advertises "smart memory that remembers your interests and key facts about you" and "personalized grammar drills based on frequent mistakes" and is the only product found to close a loop from logged mistakes back into drills **(snippet)** ([Langua](https://languatalk.com/ai-japanese-tutor)); Praktika's paid plan lists "tutor memory" with no description of what is stored **(snippet)** ([Praktika Help Center](https://intercom.help/praktika-ai/en/articles/11684862-what-subscription-plans-does-praktika-offer-and-what-is-included-in-the-paid-plan)); Duolingo's Video Call "remembers what you've said in past calls" **(snippet)** ([Duoplanet](https://duoplanet.com/duolingo-video-call/)); Speak re-elicits the phrases its curriculum taught **(snippet)** ([Lingtuitive](https://lingtuitive.com/blog/speak-review)). Jumpspeak's Japanese is reported by one 2026 review as a full course added in May 2025 and by others as "a basic AI chatbot with no structured lessons"; the contradiction was not resolvable **(snippet)** ([Languavibe](https://languavibe.com/jumpspeak-review/); [LanguaTalk, competitor-authored](https://languatalk.com/blog/jumpspeak-review/)). Todaii's Tomo Chat lets learners speak about the news article they just read **(snippet)** ([Todaii App Store](https://apps.apple.com/us/app/todaii-learn-japanese-n5-n1/id1107177166)). The recurring complaint against the whole camp is "doesn't adapt / scripted / shallow correction", and the recurring paid upsell is precisely memory of frequent mistakes (Speak Premium Plus at $39.99/month **(snippet)**) and uncapped conversation ([SpeakShark](https://speakshark.com/blog/speak-app-pricing-per-month-2026); [LanguaTalk TalkPal review](https://languatalk.com/blog/talkpal-review/)). Genuine pitch-accent scoring of learner speech is claimed only by small entrants (Sensei, LinguaLive, SpeakPal) and none of the claims could be verified; Migaku's Pitch Trainer is perception-only ([ai_first_apps_teardown](/home/user/Bunki-app/research_notes/Bunki%2010000x%20learning%20engine%20spec/ai_first_apps_teardown.md)). **Only Duolingo has any published efficacy study touching these features, and it concerns Japanese speakers learning English** ([Duolingo whitepaper 2025](https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_language_video_call_improves_speaking_2025.pdf), PDF returned 403). The empty square is therefore concrete: a knowledge state that spans immersion, SRS and conversation, at sub-word granularity, with provenance and uncertainty, that the tutor reads and that the learner owns and can export. The free mining stack (Yomitan, Anki with FSRS, asbplayer, Lapis) sets the card-quality bar (sentence, reading, glossary, pitch graph, harmonic frequency rank, word audio, timed sentence audio, screenshot, source) but is glued by localhost servers, is Chromium-only for audio, and has no Safari or iOS path, an eight-comment-per-year open issue since 2023 ([yomitan#66](https://github.com/yomidevs/yomitan/issues/66); [asbplayer docs](https://raw.githubusercontent.com/killergerbah/asbplayer/main/docs/docs/guides/one-click-mining.md); [default-anki-field-templates](https://github.com/yomidevs/yomitan/blob/master/ext/data/templates/default-anki-field-templates.handlebars)).

## The science endorses interpretable per-item models, spaced retrieval and answer-withholding tutors

Three findings settle the architecture question. First, scheduling: on the open benchmark of ~10,000 Anki users and ~350 million evaluated reviews, FSRS-6 scores 0.3460 log loss with 21 parameters against HLR's 0.4694 and Ebisu's 0.4989, and the only models that beat it meaningfully are a 503-parameter GRU (0.3328) and a 2.76-million-parameter RWKV (0.2773) that need cross-user training a device-local app cannot do; FSRS-7 (34 parameters, fractional intervals, recency weighting) reaches 0.3363 and was merged into fsrs-rs main in September 2026 but has no tagged release ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark/blob/main/README.md); [fsrs-rs PR #426](https://github.com/open-spaced-repetition/fsrs-rs/pull/426)). Anki's own guidance is that FSRS optimisation is unreliable below "a few hundred" reviews, that 90 percent desired retention balances workload, and that the one habit it cannot absorb is pressing Hard on a forget ([anki-manual deck-options](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)). Bunki's FSRS-6 pin is therefore the right scheduler and needs no replacement; the repo already has an 886-line dependency-free optimizer that fits all 21 weights from the export ([fsrs-optimize.mjs](/home/user/Bunki-app/tools/fsrs-optimize.mjs)). Second, knowledge tracing: deep KT (DKT, SAKT, SAINT, GKT and the 2025–26 LLM-KT line) is trained on populations of thousands and degrades badly on new students, so for one learner the defensible design is per-item state with population priors plus explicit typed propagation edges, the pattern the repo's codex already froze: "interpretable evidence-weighted rules and per-contract FSRS rather than Bayesian knowledge tracing or a neural learner model" ([pyKT](https://github.com/pykt-team/pykt-toolkit); [Cold start in KT (snippet)](https://arxiv.org/html/2505.21517); [codex §5.4](/home/user/Bunki-app/docs/convergence/JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md)). Two fetched formal mechanisms make evidence tiers implementable: Ebisu's fuzzy-quiz observation model, where q₁ = P(observed success | true recall) and q₀ = P(observed success | no recall) encode an evidence channel's noise and the Beta posterior is moment-matched, and Pelánek's Elo with uncertainty `K(n) = α/(1+βn)` (α = 1.0, β = 0.05 in his lab's code) ([fasiha/ebisu](https://github.com/fasiha/ebisu); [geography-analysis models_prior_knowledge.py](https://github.com/adaptive-learning/geography-analysis/blob/master/models_prior_knowledge.py)). Third, the propagation payoff is Japanese-specific: JmdictFurigana aligns each kanji span in 177,770 of 234,814 JMdict entries to its reading, so a correct reading of 歩道 is evidence for 歩=ホ and 道=ドウ and, through them, for the unseen 徒歩; this is how a few hundred events can bound tens of thousands of nodes ([JmdictFurigana](https://github.com/Doublevil/JmdictFurigana)).

The pedagogy literature is equally decisive about what to practise and how to tutor. Spaced retrieval beats massed with **g = 0.74**, and expanding versus uniform schedules is a wash (g = 0.034) ([Latimier 2021](https://eric.ed.gov/?id=EJ1310148)); Kim & Webb's L2 meta-analysis of 48 experiments finds a medium-to-large spacing effect **(snippet)** ([Kim & Webb 2022](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479)). Extensive reading yields d = 0.46 against controls across 34 studies ([Nakanishi 2015](https://onlinelibrary.wiley.com/doi/10.1002/tesq.157)); captions have a large effect on listening and vocabulary ([Montero Perez 2013](https://www.sciencedirect.com/science/article/abs/pii/S0346251X13001012)); pronunciation instruction carries d ≈ 0.8 with larger effects when feedback is given ([Lee, Jang & Plonsky 2015](https://academic.oup.com/applij/article/36/3/345/2422438)). Receptive and productive knowledge dissociate, receptive growing about 1.5 times faster **(snippet)**, and you get the retrieval direction you practise, which is why the model below keeps four contracts per node rather than one score ([PMC10981021 (snippet)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10981021); [SSLA learning direction (snippet)](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/effects-of-learning-direction-in-retrieval-practice-on-efl-vocabulary-learning/159EE50F4B8835207764FB1B11077F29)). Interleaving helps only above a knowledge floor **(snippet)** ([Hwang 2025](https://onlinelibrary.wiley.com/doi/10.1111/lang.12659)). Krashen's i+1 is unfalsifiable, but lexical coverage is an engineering proxy with soft thresholds at 95 and 98 percent, and Laufer's 2020 replication found no significant step between 90, 95 and 98 **(snippet)** ([Laufer & Ravenhorst-Kalovski 2010](https://files.eric.ed.gov/fulltext/EJ887873.pdf); [Laufer 2020 (snippet)](https://scholarspace.manoa.hawaii.edu/bitstreams/be187723-ba8b-433c-9472-b3b4ac847b86/download)); Japanese needs roughly 9,500 lexemes for 95 percent and 20,000 for 98 percent, a secondary restatement of Matsushita that could not be checked against the primary ([Mikey Does summary, secondary](https://mikeydoes.com/articles/vocabulary-size-japanese-comprehension/)). For placement, yes/no tests with matched pseudowords are valid because false-alarm rates correlate above 0.80 with real-word over-claiming **(snippet)** ([Zhang, Liu & Ai 2020](https://journals.sagepub.com/doi/10.1177/0265532219862265)), and a BCCWJ-based commercial test claims an estimate from about 50 items **(snippet)** ([Lenguia](https://www.lenguia.com/tools/vocabulary-size-test/japanese)). The one located JLPT predictor study finds kanji and grammar the only significant unique predictors, with 73.4 percent of pass/fail variance explained, but it is a single regional-journal study **(snippet)** ([JOLLT](https://ojspanel.undikma.ac.id/index.php/jollt/article/view/17552)); from December 2025 JLPT reports carry a CEFR reference derived only from reading and listening items ([JLPT CEFR reference](https://www.jlpt.jp/e/about/cefr_reference.html)).

On tutoring, the pattern is consistent across the three strongest studies: Harvard's crossover RCT (194 students) found the AI tutor taught "more than twice as much" as active-learning class time when instructed to be brief and give "one step at a time", the PNAS field experiment (~1,000 students) found unguarded ChatGPT raised practice scores 48 percent but hurt unassisted performance while a hint-only "GPT Tutor" (127 percent) did not, and Tutor CoPilot lifted mastery 4 points at about $20 per tutor-year ([Sci Rep 2025](https://www.nature.com/articles/s41598-025-97652-6); [PNAS 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122); [NSSA](https://nssa.stanford.edu/studies/tutor-copilot-human-ai-approach-scaling-real-time-expertise)). The ceilings are low: no frontier model passes 56 percent of TutorBench's expert rubrics ([TutorBench](https://arxiv.org/abs/2510.02663)), automatic mistake identification in dialogue tops out near macro-F1 0.72 ([BEA 2025](https://arxiv.org/abs/2507.10579)), and tutors capitulate under authority and face-saving pressure (abstract only) ([EduFrameTrap](https://arxiv.org/abs/2605.14604)). Japanese adds its own failure surfaces: kanji polyphony is an active benchmark target (YOMI-Bench, and the Joyo Kanji Yomi benchmark's 13,095 sentences over 4,378 readings), example-sentence generation had 13–16 percent reject rates **(snippet)**, and LLMs default to near-native complexity for beginners **(snippet)**, which is why the beginner-friendly paper's Token Miss Rate (ρ = 0.78 with human comprehensibility, abstract only) and Lee & Hasebe's jReadability are the two gates the spec adopts ([Joyo Kanji Yomi Benchmark](https://github.com/sbintuitions/Joyo-Kanji-Yomi-Benchmark); [arXiv 2506.03580 (snippet)](https://arxiv.org/pdf/2506.03580); [arXiv 2506.04072 (snippet)](https://arxiv.org/pdf/2506.04072); [jreadability](https://github.com/joshdavham/jreadability)). Memory architectures in the 2025–26 tutor literature (LOOM, DeepTutor, Mem0's pattern) converge on a compact typed learner state outside the context window with transcripts retrieved on demand, which is what a ledger-plus-derived-model already is ([LOOM (abstract)](https://arxiv.org/pdf/2511.21037); [Mem0 blog](https://mem0.ai/blog/build-a-personalized-ai-tutor-with-persistent-memory)).

## The 2026 Claude platform makes a stateful sensei cheap if the prefix is frozen

Four tiers are live: Fable 5.1 ($10/$50 per MTok, 1M context, 128K output, adaptive thinking always on), Opus 5.5 ($4/$20, launched 2026-09-22), Sonnet 5 ($2/$10, now permanent pricing) and Haiku 4.5 ($1/$5, 200K context) ([Models overview](https://platform.claude.com/docs/en/about-claude/models/overview); [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)). Three platform facts shape the sensei. Forced tool use is gone on Fable 5.1 and Opus 5.5 (`tool_choice: any` returns 400), so "propose a card" must be an `auto`-chosen `strict: true` tool steered by the system prompt, and extraction jobs should use `output_config.format` structured outputs, which are GA on every current model with grammar-constrained sampling ([Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview); [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). Prompt caching is a byte-exact prefix match with a 512-token minimum on Opus 5.5 and Fable 5.1, 1,024 on Sonnet 5 and 4,096 on Haiku 4.5, reads at 0.1× (0.05× on Opus 5.5, 0.025× on Fable 5.1), and cache reads do not count toward input rate limits ([Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching); [Rate limits](https://platform.claude.com/docs/en/api/rate-limits)). The researchers' worked estimate for a 6,000-token frozen prefix at 40 turns a day in two sessions comes to **about $0.25/day on Sonnet 5, $0.45 on Opus 5.5, $0.12 on Haiku 4.5 and $1.07 on Fable 5.1**, an 84 percent cut in prefix cost against uncached; the product-side estimate for a heavy learner (45 turns/day, nightly batch mining, three readings a day, 30 days) is **$12.5–14.4/month on Sonnet 5 optimised versus $42.7 unoptimised**, and $5.6–6.4 for a realistic 30-turn, 20-day learner ([claude_platform_capabilities](/home/user/Bunki-app/research_notes/Bunki%2010000x%20learning%20engine%20spec/claude_platform_capabilities.md); [product_platform_efficacy](/home/user/Bunki-app/research_notes/Bunki%2010000x%20learning%20engine%20spec/product_platform_efficacy.md)). Both estimates are the researchers' arithmetic on cited prices with stated assumptions, and neither has a Japanese tokens-per-character figure, which must be measured with `count_tokens` because the 4.7+ tokenizer produces roughly 30 percent more tokens than its predecessor ([Pricing](https://platform.claude.com/docs/en/about-claude/pricing)).

Privacy and modality set hard edges. Conversation content on the Messages API "is not retained by default", but Fable 5.1 and Fable 5 are "Covered Models" that require 30-day retention and are excluded from zero-data-retention unless expressly authorized; Batch, Files, Managed Agents, the MCP connector and code execution are not ZDR-eligible; first-party data residency offers only `global` or `us` (1.1×), with no EU or Japan option ([API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention); [Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency)). The Messages API accepts text and images only; there is no Anthropic audio modality or realtime voice endpoint, so speech is a third-party cascade around Claude text ([Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)). Memory is client-side (`memory_20250818`, ZDR-eligible) or Anthropic-hosted (Managed Agents memory stores), and there is no server-side per-user "project" object, which suits Bunki: the learner model must live in the ledger and be rendered into the prompt ([Memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)). The SDK blocks browser use unless `dangerouslyAllowBrowser: true`, and Apple rejected an app whose users entered their own keys under guideline 3.1.1, so the corridor's current direct-to-`api.anthropic.com` seam must become a gateway before any store submission ([anthropic-sdk-typescript client.ts](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/client.ts); [Apple forum thread 763884](https://developer.apple.com/forums/thread/763884)).

## Speech, data and rights: what is clear and what is not

Japanese ASR is solved for native read speech and unmeasured for learners. Whisper large-v3 posts 7.1 CER on JSUT and 8.5 on CommonVoice against kotoba-whisper v2.1's 8.4 and 9.3, kotoba winning only on broadcast audio (11.3 versus 15.1); Qwen3-ASR 1.7B (Apache-2.0) ships a Japanese forced aligner; Apple's iOS 26 SpeechAnalyzer runs Japanese fully on-device at 38–125× real time but hit only 4 of 6 keywords in one independent check ([kotoba-whisper](https://github.com/kotoba-tech/kotoba-whisper); [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR); [goofmint/offline_stt PR #72](https://github.com/goofmint/offline_stt/pull/72)). **No source benchmarks any engine on non-native Japanese**; the one industry account had to build a custom multitask model to bring mora-label error from 12.3 to 7.1 percent **(snippet)** ([Lacuna (snippet)](https://lacuna.tiptreesystems.com/work/building-tailored-speech-recognizers-for-japanese-speaking-assessment/wrk_9f7d0506e9b44a7ca43d9535e4cec5aa)). Pitch-accent scoring cannot be bought: Azure's prosody assessment is en-US only and its ja-JP phoneme fields were reported empty in an unresolved 2024 issue ([azure-ai-docs mirror](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/how-to-pronunciation-assessment.md); [issue #2237](https://github.com/Azure-Samples/cognitive-services-speech-sdk/issues/2237)); the research recipe is forced alignment plus mora-level F0 plus H/L classification against a target from pyopenjtalk or Kanjium, which onsei and onchou prototype ([itsupera/onsei](https://github.com/itsupera/onsei); [bagustris/onchou](https://github.com/bagustris/onchou); [pyopenjtalk](https://github.com/r9y9/pyopenjtalk)). For TTS, Japanese reviewers rate ElevenLabs v3 most natural but still imperfect on kanji readings and proper-noun accent **(snippet)**, while VOICEVOX is the only engine with per-mora accent control, at the cost of per-character credit terms and a resource repo that restricts character assets to "VOICEVOX development use only" absent a separate licence ([AI PICKS (snippet)](https://aipicks.jp/mag/elevenlabs-gemini-guide-2026); [voicevox_resource](https://github.com/VOICEVOX/voicevox_resource)). Bunki's 22,210 shipped clips were synthesized with Style-Bert-VITS2 (AGPL-3.0 code) and VOICEVOX; the primary voice 小春音アミ carries amitaro.net terms whose text is asserted in `LICENCES.md` but not reproduced in the repo ([audio/LICENCES.md](/home/user/Bunki-app/prototypes/corridor/audio/LICENCES.md); [Style-Bert-VITS2 TERMS_OF_USE](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/TERMS_OF_USE.md)). Live voice at the model layer runs roughly $0.005 in / $0.018 out per minute on Gemini Live and about $0.019 heard / $0.077 spoken on gpt-realtime, all **(snippet)** since every vendor pricing page was blocked ([Layer3 Labs (snippet)](https://www.layer3labs.io/guides/openai-realtime-api-pricing); [API Pulse (snippet)](https://www.getapipulse.com/blog-gemini-3-8-live-api.html)).

The data layer is permissive where it matters. Every mainstream tokenizer is Apache, MIT or BSD (Sudachi, Vibrato, Lindera, Kuromoji.js, GiNZA) and the dictionaries they need are BSD or Apache, with browser payloads ranging from Lindera IPADIC's 13 MB to Sudachi WASM's 50–71 MB ([SudachiDict LEGAL](https://github.com/WorksApplications/SudachiDict/blob/develop/LEGAL); [lindera-js](https://github.com/higumachan/lindera-js); [hata6502/sudachi-wasm](https://github.com/hata6502/sudachi-wasm)). EDRDG files are CC BY-SA 4.0 with attribution and share-alike on derived data **(snippet)**, KanjiVG CC BY-SA 3.0, Kanji alive CC BY 4.0, Kanjium's 124,137-word pitch table CC BY-SA 4.0 with undisclosed upstream sources, and OJAD educational-only **(snippet)** ([EDRDG licence (snippet)](https://www.edrdg.org/edrdg/licence.html); [kanjium](https://github.com/mifunetoshiro/kanjium/blob/master/README.md); [OJAD notes (snippet)](https://www.gavo.t.u-tokyo.ac.jp/ojad/pages/notes)). Tatoeba text is CC BY 2.0 FR with a CC0 subset, but its audio is per-contributor and most commonly CC BY-NC 4.0 **(snippet)** ([Tatoeba audio licenses (snippet)](https://en.wiki.tatoeba.org/articles/show/choose-audio-license)). JParaCrawl and NAIST Lang-8 are research-only; NHK NEWS WEB EASY's terms could not be read; YouTube's terms ban subtitle scraping regardless of copyright arguments **(snippet)** ([JParaCrawl (snippet)](https://www.kecl.ntt.co.jp/icl/lirg/jparacrawl/); [ScrapeOps (snippet)](https://scrapeops.io/websites/youtube/)). No open Japanese grammar-point annotator exists; GrammarTagger covers English and Chinese only, so Bunki must build its own over UniDic tokens, which its 50-pattern harvested grammar bank and inline `GRAMMAR` array already begin ([octanove/grammartagger](https://github.com/octanove/grammartagger); [grammar-v11.json](/home/user/Bunki-app/prototypes/corridor/data/original/grammar-v11.json)). On the platform side, the local-first field consolidated around server-authoritative sync logs and CRDTs, ElectricSQL joined Databricks on 2026-08-11 with its cloud winding down, PowerSync's service is FSL-1.1 with Apache conversion after two years, and Linear's engine shows that an insert-only event log with a server-assigned monotonic sequence needs no CRDT at all, which is exactly Bunki's ledger ([electric-sql/electric](https://github.com/electric-sql/electric); [powersync-service LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE); [reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine)).

---

# Part two — build specification

## The binding laws this specification obeys

Every section below was checked against these laws, which come from the repository's own documents; where a law's wording was located verbatim its source is cited, and where it was not, that is said.

1. **One device-owned, append-only ledger per learner; the export is the only egress.** Campaign law 5: "The ledger is device-owned; the export is the only egress; the whole graph rides it" ([BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md](/home/user/Bunki-app/docs/prompts/BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md)).
2. **One derived learner model, recomputed from the ledger, never persisted as authority.** Campaign architecture layer 2: "a pure, versioned function of the ledger, recomputed on demand, memoized per session, never persisted as authority" (same source).
3. **FSRS-6 is the only scheduler; the AI proposes, the learner confirms, FSRS schedules.** Campaign laws 1 and 2; constitution: "AI proposes; the learner confirms; FSRS schedules"; amendment: "Side quests may propose material; only the learner's confirmation adds it, and only FSRS schedules" ([BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md](/home/user/Bunki-app/docs/operator/BUNKI_CURRENT_PRODUCT_CONSTITUTION_2026-08-15.md); [BUNKI_KAGAMI_AMENDMENT_2026-09-21.md](/home/user/Bunki-app/docs/prompts/BUNKI_KAGAMI_AMENDMENT_2026-09-21.md)).
4. **Measured outranks observed outranks exposure; observed evidence is never the sole basis of a level claim.** Campaign law 3 ("`measured` (probe/review/mock) outranks `observed` (sensei-mined)"), constitution ("Exposure is not mastery"), and the built model's rule that a level cell counts only with four or more measured answers ([prior audit](/tmp/claude-0/-home-user-Bunki-app/6580e08d-8641-563c-8660-e8a03876a0d0/scratchpad/KAGAMI_VISION_VS_BUILD_2026-09-28.md)).
5. **No readiness number or single level score anywhere.** Campaign: "A band vector, never a number"; amendment law 10: "No output — lens, planner, paper or mirror — states a pass probability, a percentage readiness, or 'you are N1'" ([BUNKI_KAGAMI_AMENDMENT_2026-09-21.md](/home/user/Bunki-app/docs/prompts/BUNKI_KAGAMI_AMENDMENT_2026-09-21.md)).
6. **Anything personal to a learner enters as data in the record, never as code or a build step.** This sentence was given as binding in the assignment; a grep of the campaign, amendment, constitution, ADRs and V2 spec did not find it verbatim. It is consistent with the campaign's "KAGAMI extends the taxonomy; it does not invent a store" and with the existing `params` and `note` row kinds, and the spec treats it as binding: goals, preferences, fitted FSRS weights, imported external evidence and placement results are all ledger rows.
7. **Generated Japanese is verified before it teaches.** Campaign law 4: "Generated content that claims to teach is 検収前 until the operator approves; rights law fail-closed on all minted/mined text" ([BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md](/home/user/Bunki-app/docs/prompts/BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md)).

Also inherited: amendment law 9 ("A proposal is a door, never a write"), law 11 (external evidence is "measured for exactly what they claim … never touch a scheduler"), law 12 ("Two tracks, never averaged"), ADR-004 (one learner state serves the whole app) and PR #99's ADR-005 (AI-reviewed practice implies no psychometric calibration or scaled score).

## A. Where the field stands

The matrix below rates the twelve named competitors and Bunki against thirteen capabilities. Legend: **Y** = verified from a fetched primary source or code; **y** = reported in a search snippet or third-party review only (**snippet**); **P** = partial; **N** = no evidence found (which for blocked sites is not proof of absence); **?** = contradictory or UNVERIFIED. Bunki `main` is measured locally; the last column is the target of this specification.

| Capability | Migaku | Jumpspeak | Todai | Speak | Langua | Praktika | Duolingo Max | jpdb | WaniKani | Bunpro | Satori | LingQ | Bunki main | Bunki target |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1. Per-item known state | y (5 statuses) | N | N | P (curriculum phrases, y) | N | N | N | Y (10 states via API) | Y (9 stages) | y (SRS level) | y (per kanji) | y (blue/yellow/known) | Y (deck + obslog) | Y |
| 2. Nodes finer than words (readings, senses, grammar) | N | N | N | N | N | N | N | P (vid/sid pairs) | P (radical→kanji→vocab) | Y grammar points | P kanji | N | P (word, kanji only) | Y (word, kanji, reading, sense, grammar, form) |
| 3. Receptive vs productive tracked apart | N | N | N | N | N | N | N | N | P (reading + meaning answers) | N | N | N | P (`prod-gap` code only) | Y (four contracts) |
| 4. Evidence tiers / provenance | N | N | N | N | N | N | N | N | N | N | N | N (auto-known inflates) | Y (measured/observed) | Y (measured > observed > exposure, typed) |
| 5. Uncertainty shown, no single level | N (comprehension %) | N | N | N | N | N | N | N (coverage %) | N | N | N | N | Y (band vector) | Y (P, confidence, source per node) |
| 6. Confusion-pair tracking | N | N | N | N | y (mistake log) | N | N | N | N (static similar-kanji lists) | N | N | N | Y (`confuse` rows, top 12 edges) | Y (typed edges, contrastive remediation) |
| 7. Open, benchmarked scheduler | N (proprietary) | N | N | N | N | N | N (HLR-derived, N) | N (proprietary ML, y) | N (fixed ladder) | N (fixed ladder + ghosts) | y ("a type of SRS") | N | Y (FSRS-6 pinned) | Y (FSRS-6, per-learner fit) |
| 8. Coverage / i+1 selection | y (comprehension score) | N | N | N | N | N | N | y (i+1 cards, coverage) | N | N | N | y (% new words) | N | Y (probabilistic coverage, i+1 with grammar unknowns) |
| 9. Media mining from external content | Y/y (extension, mobile) | N | P (own news) | N | N | N | N | Y (API, reader extensions) | N | N | P (own stories) | Y (import lessons) | N (shelf + feed only) | Y (import, share-sheet, feed) |
| 10. AI tutor with cross-session memory | N | ? | y (Tomo) | y | y (smart memory) | y ("tutor memory") | y ("remembers past calls") | N | N | N | N | N | P (archive only) | Y (ledger-backed) |
| 11. Tutor reads a mastery state | N | N | N | P (y) | P (mistake drills, y) | N | N | N | N | N | N | N | N (`aiLevelGuess`) | Y (teaching context from model) |
| 12. Speech: ASR conversation / pitch feedback | N / P (Pitch Trainer, perception) | y / N | y / N | Y / N | y / N | y / N | y / N | N | N | N | N | N | N / N | Y / P (perception first, production prototype) |
| 13. Learner-owned data with full export | P (Anki export, y) | N | N | N | N | N | N | P (API) | P (API) | N (private API) | P (flashcard export, y) | N | Y (lossless JSON export, replay-verified) | Y |

Sources for the competitor cells: [jpd-breader](https://github.com/max-kamps/jpd-breader), [jpdb FAQ (snippet)](https://jpdb.io/faq), [Migaku statuses (snippet)](https://migaku.com/blog/youtube/the-learning-statuses-migaku-browser-extension), [Kakehashi WaniKani note](https://github.com/Portego-00/Kakehashi/blob/main/research/wanikani-custom-srs-web.md), [Bunpro ghosts (snippet)](https://community.bunpro.jp/t/ghost-reviews-update-july-12-2018/315), [bunpro-mcp](https://github.com/PatVandyke/bunpro-mcp), [Satori help (snippet)](https://www.satorireader.com/help), [LingQ forum (snippet)](https://forum.lingq.com/t/the-finish-lesson-makes-all-words-known-feature-is-problematic/2621918), [Langua (snippet)](https://languatalk.com/ai-japanese-tutor), [Praktika Help Center (snippet)](https://intercom.help/praktika-ai/en/articles/11684862-what-subscription-plans-does-praktika-offer-and-what-is-included-in-the-paid-plan), [Duoplanet (snippet)](https://duoplanet.com/duolingo-video-call/), [Speak (snippet)](https://www.speak.com/), [Todaii App Store (snippet)](https://apps.apple.com/us/app/todaii-learn-japanese-n5-n1/id1107177166), [Jumpspeak reviews, contradictory (snippet)](https://languavibe.com/jumpspeak-review/), [packages/export](/home/user/Bunki-app/packages/export/package.json).

**What no product does that this one will.** First, a single knowledge state that receives evidence from immersion reading, scheduled review, placement probes, mock papers, written practice and the sensei's conversation, with each row typed by provenance and weighted by tier; nobody in the matrix crosses the immersion/tutor divide. Second, nodes finer than words with propagation: kanji readings as first-class nodes fed by every word that uses them, senses tracked apart from headwords, grammar points and conjugated forms counted as unknowns in i+1 selection; jpdb's (vid, sid) pairs and WaniKani's reading/meaning split are the only partial precedents. Third, a frontier reported with uncertainty and evidence source instead of a level, so the open learner model is inspectable and negotiable rather than a number; the OLM literature's continuum (inspectable → negotiable → editable) is the design target **(snippet)** ([Frontiers in Education 2025](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2025.1760183/full)). Fourth, a tutor whose every act is a proposal the learner confirms and whose every Japanese sentence is verified by tokenizer, dictionary reading and level gate before it is shown; no production tutor's verification pipeline was readable, and the guardrail literature says the difference is the difference between help and harm. Fifth, a calibrated model: predicted recall scored against held-out probes with a Brier score the learner can see, which turns "the app knows what you know" into a testable claim. Sixth, a lossless export that is the only egress, so the learner, not the vendor, owns the ledger; among the twelve only jpdb, WaniKani and Migaku offer even partial data paths.

## B. The learner engine

### B.1 Ledger row kinds and shapes

The ledger is the existing `S.obslog` and `S.revlog` (plus the AI archive and `taken[].ctx`), extended, never replaced ([BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md](/home/user/Bunki-app/docs/prompts/BUNKI_KAGAMI_CAMPAIGN_2026-08-25.md)). Every row is append-only, carries a device sequence, and is exported losslessly by `@bunki/export`. Unknown kinds must survive export → import round trips, which the campaign already requires. The eleven existing kinds keep their shapes; the shapes below add typed fields that are optional on old rows (the model treats absence as "unknown", never as a default value). Rows never carry FSRS state except `revlog`, which FSRS alone writes.

```
Common envelope (every row)
  id            ulid                      // monotonic per device
  ts            ISO-8601 (device clock, monotonic-clamped per reviewTimePolicyId)
  device        string                    // device id; sync assigns a global seq later (G.1)
  kind          enum (below)
  provenance    'measured' | 'observed' | 'exposure' | 'external' | 'self' | 'params'
  source        { surface, contextRef?, exchangeId?, itemRevision?, rubricId?, rubricVersion?, modelVersion? }
  supersedes?   id                        // corrections append; nothing is rewritten (codex §4.5)

Row kinds and payloads
  probe    (measured)  { node: NodeRef, contract: Contract, method: Method, result: 0|1|0..1,
                          response?: string, latencyMs, hints, distractors?: NodeRef[] }
  revlog   (measured)  existing 12-wide FSRS grade row; only FSRS reads/writes state; still logs
                       { cardId, nodeRefs[], contract, grade 1..4, elapsed }
  mock     (measured)  { paperId, itemRevision, section, nodeRefs[], result, response?, timeMs }
                       (on PR #99 this is the assessment record; both remain measured)
  dojo     (measured)  { drill: 'reading'|'stroke'|'discrimination'|'cloze', node, contract, result, response? }
  practice (measured, tier B) { mode: 'cloze'|'production'|'listening'|'kanji-reading', sourceRef,
                          rubricId, rubricVersion, score 0..1, judged: 'deterministic'|'llm'|'learner' }
  sensei   (observed)  { subject: NodeRef, polarity 1|3, code: 'misread'|'sense-miss'|'particle-drop'|
                          'prod-gap'|'collocation'|'form-miss'|'register-miss', exchangeId, confidence 0..1 }
  confuse  (observed|measured) { a: NodeRef, b: NodeRef, edgeKind: 'visual'|'reading'|'semantic'|'usage',
                          fromMethod: Method, exchangeId? }
  tap / reveal / drift (exposure) { node, contextRef, dwellMs? }   // encounters, never verdicts
  lesson   (exposure)  { lessonId, nodeRefs[] }
  note     (self)      { text, nodeRefs[] }
  self     (self)      { node, contract, claim: 'know'|'dont'|'meaning-only'|'reading-only' }  // I know this
  placement(measured, q0 high) { itemId, band, isPseudoword, answer: 'yes'|'no', latencyMs }
  external (external)  { instrument: 'jlpt'|'kanken'|'jft'|'other', sitting: date, section, band, result,
                          attestation: 'self'|'document' }        // amendment law 11
  goal     (params)    { exam?: 'JLPT'|'Kanken'|'none', level?: 'N5'..'N1', date?: ISO, minutesPerDay?, tracks: ['jsl'|'kokugo'] }
  params   (params)    { fsrsParameterSetId, weights[21], requestRetention, fittedFrom: exportSha, fittedAt }
  session  (params)    { sessionId, start, end, summary: { rowsWritten, surfaces[], proposalsMade, proposalsAccepted } }
  preference (params)  { furiganaPolicy, worldId, correctionStyle, miningEnabled }

NodeRef  = { type: 'word'|'kanji'|'reading'|'sense'|'grammar'|'form'|'expression', id: string }
Contract = 'recog' | 'reading' | 'meaning' | 'productive'
Method   = 'typed_reading'|'mc4'|'cloze'|'discrimination'|'rubric_prod'|'llm_judged'|'lookup'|'exposure'|'self_report'|'yesno'
```

The `response` string is mandatory wherever the learner produced one: it is what makes reading-slot attribution and confusion detection possible (B.4). The `supersedes` field implements "I knew the meaning; I missed only the reading" as an appended correction, per the codex ([codex §4.5](/home/user/Bunki-app/docs/convergence/JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md)). Personal facts (goal, fitted FSRS weights, preferences) are rows with `provenance: 'params'`, honouring law 6: no per-learner constant lives in code or in a build script, and the existing `data/fsrs-pin.json` remains the population default that a `params` row may override only through `verifyFsrsPin`'s clamps.

### B.2 The derived model

`learnerModel(ledger, paramsVersion)` stays a pure function. Version 3 adds nodes, contracts, beliefs and edges to the existing bands, frontier, edges and leeches; the existing outputs are preserved byte-for-byte for the same inputs so `verify-kagami` keeps passing until it is extended.

```
Model {
  version: 3,
  goal:      Goal | null                          // last 'goal' row; absent ⇒ today's default
  tracks:    { jsl: Track, kokugo: Track }         // never averaged (amendment law 12)
  nodes:     Map<NodeId, NodeState>
  edges:     Map<EdgeId, ConfusionEdge>
  bands:     BandVector                            // existing four bands, measured/observed apart
  frontier:  FrontierEntry[]                       // B.5
  leeches:   NodeRef[]
  external:  ExternalEvidence[]                    // shown apart, never merged into nodes
  calibration: { perTier: { bins[], brier }, perMethod: {...} }     // B.6
}

NodeState {
  ref: NodeRef,
  kind: 'word'|'kanji'|'reading'|'sense'|'grammar'|'form'|'expression',
  contracts: {
    recog:      ContractState,   // recognise the form (receptive)
    reading:    ContractState,   // produce/choose the reading
    meaning:    ContractState,   // recall/choose the meaning (receptive)
    productive: ContractState    // produce the form in context (productive)
  },
  prior:  { logit: number, source: 'freq'|'jlpt'|'placement'|'none' },
  propagated: { evidence: number, from: NodeRef[] },
  pain:   number                                  // B.5
}

ContractState {
  fsrs?:  { S, D, lastReview, reps, lapses }       // read from revlog via ts-fsrs only; never written here
  belief: { alpha, beta, tRef }                    // Ebisu-style Beta over recall at tRef
  nMeasured, nObserved, nExposure, nExternal
  pKnown: number                                   // E[belief] decayed to now; FSRS R when fsrs exists
  conf:   number                                   // alpha + beta, capped
  source: 'direct'|'propagated'|'prior'
}

ConfusionEdge { a, b, edgeKind, conf: count, trials: count, prior: number, pi: number }
```

Node identity is deterministic and data-driven. Words key on the dict-v2 entry id; senses on `(entryId, senseIndex)` from the 89,713-sense inventory already shipped; kanji on the character; readings on `(kanji, reading, kind ∈ on|kun|nanori|irregular)` derived from KANJIDIC2 plus JmdictFurigana alignment (a build asset to add; where alignment fails, as in 大人=おとな, the word's reading is an atomic `irregular` node); grammar points on the merged grammar bank id; forms on `(lemmaId, formTags)` in the HLR lexeme-tag style, e.g. `食べる<v><past><neg>` ([JmdictFurigana](https://github.com/Doublevil/JmdictFurigana); [halflife-regression](https://github.com/duolingo/halflife-regression/blob/master/experiment.py)). The two tracks hold separate node maps where a node has different meaning (国語 kanji grades versus JLPT bands); a word that exists in both is one node with two band projections.

The relation between FSRS and the belief must be exact to satisfy law 3. **FSRS-6 schedules; it is the only thing that reads `revlog` to produce due dates, and nothing here writes FSRS state.** The belief is a read-only estimate used for selection, display and the frontier. Where a contract has FSRS state, `pKnown` is FSRS retrievability `R(t, S)` computed by ts-fsrs 5.4.1 at query time; the Beta is still maintained so that non-scheduled evidence can widen or narrow confidence, but it never alters intervals. Where no FSRS state exists (nodes never carded), the Beta is the only estimate.

### B.3 Update rules per evidence tier

Tiers map to the codex's A–D hierarchy and to the campaign's provenance law, encoded as an observation noise channel `(q0, q1)` in Ebisu's fuzzy-quiz form and as a weight cap on what each tier may claim ([fasiha/ebisu](https://github.com/fasiha/ebisu); [codex §5.2](/home/user/Bunki-app/docs/convergence/JAPANESE_LEARNING_OS_CODEX_V1_FREEZE_2026-07-27.md)). The numbers are **placeholders to be calibrated** against Tier-A probes (B.6); they are the researchers' inferences, not sourced constants.

| Tier | Provenance | Methods | q1 (P obs. success \| known) | q0 (P obs. success \| not known) | May move FSRS? | May count toward a band cell? |
|---|---|---|---|---|---|---|
| A | measured | typed_reading, cloze (deterministic check), discrimination, dojo drills, mock items | 0.97 | 0.02 (typed) / 0.25 (mc4) | Only via `revlog` on carded items, by FSRS | Yes |
| B | measured | rubric_prod (versioned rubric, deterministic or LLM-scored with rubric id) | 0.90 | 0.10 | No | Yes, conservatively (weight 0.5 in cell counts) |
| C | observed | sensei-mined rows, llm_judged, lookup, self_report | 0.80 / 0.60 | 0.30 / 0.50 | No | **Never alone** (law 4); only as a tie-breaker when the cell already has ≥4 measured answers |
| D | exposure | tap, reveal, drift, lesson, read-through | no likelihood update | — | No | No |
| X | external | JLPT/Kanken/JFT sittings | not a node update | — | No | Shown apart (amendment law 11) |

```
function applyRow(model, row):
  if row.kind == 'revlog':                       // FSRS owns this; we only read it
     state = tsFsrs.replay(revlogSoFar)           // pinned FSRS-6, fitted params row or defaults
     node.contracts[c].fsrs = state
     bumpBelief(node.contracts[c], result=gradeToResult(row.grade), q=TIER_A_TYPED)
     return
  tier = tierOf(row)
  if tier == 'D': node.contracts.recog.nExposure += 1; return         // exposure is not mastery
  if tier == 'X': model.external.push(row); return
  for each (node, contract, weight) in attribute(row):                 // B.4 splits blame/credit
     bumpBelief(node.contracts[contract], row.result, q=Q[tier][row.source.method], weight)
     propagate(node, contract, row.result, weight)                     // B.4
  if row.response and row.result < 1: recordConfusion(row)            // B.5

function bumpBelief(cs, result, q, weight=1):
  // Ebisu-style: decay to now, then posterior under noisy-binary likelihood, moment-match to Beta
  (a, b) = decay(cs.belief, now)
  pObs   = q.q1 * result + q.q0 * (1 - result)                          // fuzzy outcome
  (m1, m2) = momentsOfPosterior(a, b, pObs, weight)
  cs.belief = betaFromMoments(m1, m2, tRef = now)
  cs.n[tier] += 1
  cs.conf = min(cs.belief.alpha + cs.belief.beta, CONF_CAP)
  cs.pKnown = cs.fsrs ? tsFsrs.retrievability(cs.fsrs, now) : mean(cs.belief)
```

Grade-to-result for `revlog` follows FSRS semantics: Again = 0, Hard = 0.5, Good = 1, Easy = 1. Self-report (`self` rows) uses a deliberately weak channel and never touches FSRS, which is how the open learner model becomes negotiable without becoming gameable; a `self: 'know'` claim raises `pKnown` a little and schedules a cheap verification probe (D.6), the LingQ anti-pattern avoided by design ([LingQ forum (snippet)](https://forum.lingq.com/t/the-finish-lesson-makes-all-words-known-feature-is-problematic/2621918)).

### B.4 Attribution and propagation across the graph

Attribution decides which nodes a row is evidence about; propagation carries a fraction of that evidence to typed neighbours. Both are deterministic functions over static edges built at data-build time from the shipped assets (dict-v2 senses, KANJIDIC2 readings, JmdictFurigana slots, the grammar bank, KRADFILE components).

```
function attribute(row):                          // returns [(node, contract, weight)]
  switch row.source.method:
    'typed_reading':                              // word w, learner typed kana r*
       out = [(w, 'reading', 1)]
       slots = readingSlots(w)                    // from JmdictFurigana; [] if irregular
       if row.result == 1: for s in slots: out.push((s.readingNode, 'reading', 1/|slots|))
       else if row.response:
          bad = slotsWhoseKanaDiffer(slots, row.response)          // 歩道→あゆみち blames 歩=ホ and 道=ドウ
          for s in bad: out.push((s.readingNode, 'reading', 1/|bad|))
       else: for s in slots: out.push((s.readingNode, 'reading', var(s)/Σvar))   // uncertain slots absorb blame
       return out
    'cloze' | 'rubric_prod':                      // sentence with target t and parsed forms
       out = [(t, 'productive', 1)]
       for f in formsIn(row.response): out.push((f.formNode, 'productive', 0.5), (f.grammarNode, 'productive', 0.25))
       return out
    'mc4' | 'discrimination': return [(row.node, row.contract, 1)]
    'llm_judged' (sensei): return [(row.subject, contractFor(row.code), row.confidence)]
                             // misread→reading, sense-miss→meaning, prod-gap/form-miss/particle-drop→productive
    'lookup': return [(row.node, 'meaning', 1)]   // a lookup is a negative for the sense-in-context
    'yesno' (placement): return [(row.node, 'recog', 1)]

function propagate(node, contract, result, w):
  // directed prior edges between contracts of one node
  if contract == 'productive' and result == 1: bump(node.recog, 1, w*1.0); bump(node.meaning, 1, w*0.8)
  if contract == 'recog' and result == 0:     bump(node.productive, 0, w*0.8)
  if contract == 'recog' and result == 1:     bump(node.productive, 1, w*0.35)  // receptive→productive weak (≈1.5× gap)
  // cross-node edges (typed, static)
  for e in staticEdges(node):
     case 'word HAS_SLOT reading':   handled in attribute()
     case 'reading USED_BY word':    bump(e.word.reading, result, w*0.25)       // 歩=ホ known ⇒ 徒歩 probably readable
     case 'kanji HAS_COMPONENT c':   bump(c.recog, result, w*0.1)
     case 'sense OF word':           bump(e.word.recog, result, w*0.5)
     case 'form OF grammar':         bump(e.grammar.productive, result, w*0.5)
  mark node.propagated.from += e.source
```

The propagation weights (1.0, 0.8, 0.35, 0.25, 0.1, 0.5) are design choices flagged in the research as needing calibration; no paper quantifies how much a compound reading transfers to other compounds ([learner_knowledge_graph note, KQ6 gaps](/home/user/Bunki-app/research_notes/Bunki%2010000x%20learning%20engine%20spec/learner_knowledge_graph.md)). They live in a versioned `modelParams` constant inside the model function, so a change re-derives every learner identically; they are not per-learner and therefore not ledger rows.

### B.5 Confusion edges, pain and the frontier

A confusion edge `(a → b)` is instantiated from the ledger when a Tier-A/B response equals b's form, reading or meaning while the target was a, or when a `confuse` row arrives from the sensei or a discrimination drill. Its probability blends counts with a static prior from shared radicals (KRADFILE via kanji-data), shared readings (KANJIDIC2), or semantic similarity in the manner of LECTOR (abstract only) ([bagustris/kanji-data](https://github.com/bagustris/kanji-data); [LECTOR (snippet)](https://arxiv.org/html/2508.03275v1)).

```
pi(a→b) = (conf_ab + κ·prior_ab) / (trials_a + κ),  κ = 2                // ghost counts (EDM 2025, snippet)
pEff(a) = pKnown(a) · Π_b (1 − pi(a→b))                                   // effective knowledge for selection
pain(a) = pKnown(a)·(1 − pKnown(a))·recency(a) + Σ_b pi(a→b)              // uncertain-and-recent, or confused
remediate(a→b) when pi > 0.25 and trials_a ≥ 3:
   propose a contrastive block (D.6): interleaved minimal pairs in one frame, forced-choice with b as distractor,
   then i+1 sentences containing a where b would be plausible; log as 'discrimination' rows so a's stability is not polluted
```

The frontier is the set of nodes where evidence is thin but the next step is cheap, reported with why:

```
FrontierEntry { ref, contract, pKnown, conf, source, reason: 'uncertain'|'next-by-frequency'|'probably-readable'|'unplaced'|'pain' }

frontier(model, track):
  U  = nodes with 0.35 ≤ pKnown ≤ 0.75                                      → 'uncertain'
  F  = nodes with pKnown < 0.35 and prior.logit high (frequency/JLPT says next) → 'next-by-frequency'
  R  = unseen words whose reading slots all have pKnown > 0.8                → 'probably-readable'
  P  = nodes with conf < 3 that a probe would settle                          → 'unplaced'
  C  = nodes with pain above the 90th percentile                              → 'pain'
  return rank by (goal band match, pain, prior) capped at 12 per reason, provenance shown on each
```

This is the existing 12-node frontier generalised; every entry carries `(pKnown, conf, source)` so the mirror can show "probably known, low confidence: 2 observations" and never a number for the learner as a whole, satisfying law 5 and the OLM finding that explicit uncertainty is what makes a model negotiable without dependency **(snippet)** ([Frontiers in Education 2025](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2025.1760183/full)).

### B.6 Placement and calibration

Placement is a learner-authored surface, so its rows may be mined honestly, closing the audit's gap 3 ([prior audit](/tmp/claude-0/-home-user-Bunki-app/6580e08d-8641-563c-8660-e8a03876a0d0/scratchpad/KAGAMI_VISION_VS_BUILD_2026-09-28.md)). It has three stages and takes about fifteen minutes.

```
placement(learner):
  // Stage 1: frequency-band yes/no with pseudowords (≈60 real items over 6 bands of the 8,407 graded words
  //          + 2,274 N1 words, ≈20 pseudowords matched on length/script/neighbourhood)
  for band in bands: sample items; ask "do you know this word?"; write 'placement' rows
  fa = falseAlarmRate(pseudowords)                                             // signal-detection correction (snippet, Zhang 2020)
  pBand = corrected hit rate per band; fit prior.logit(node) = a − b·log(rank) over the curve
  // Stage 2: Tier-A verification at the estimated boundary (20–30 items): typed readings + meaning mc4
  probes = sample nodes with pBand in [0.4, 0.7]; write 'probe' rows; estimate q0 for the yes/no channel
  // Stage 3: grammar staircase — yes/no on constructions per band from the grammar bank, then 6–10 cloze probes
  // Stage 4: goal row — exam, level, date, minutes/day, tracks
  all placement-derived beliefs get conf ≤ 2 so any later direct row dominates
```

Calibration is a model output, not a display flourish. For every tier and method, the model bins predicted `pKnown` at the time of each subsequent Tier-A probe against the outcome, computes RMSE(bins) and a Brier score, and shrinks the `(q0, q1)` effect of any channel whose bins mis-calibrate; this is FSRS's own evaluation metric applied to the belief layer ([awesome-fsrs wiki](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm)). The per-learner FSRS fit uses the existing optimizer on the export once the ledger holds a few hundred reviews, writing a `params` row rather than editing the pin ([fsrs-optimize.mjs](/home/user/Bunki-app/tools/fsrs-optimize.mjs); [anki-manual deck-options](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)).

### B.7 Determinism and the recompute

```
learnerModel(ledger, params):
  rows = ledger.sortedBy(deviceSeq, ts)                 // reviewTimePolicyId append-order-monotonic-clamp-v1
  model = empty(params.version)
  for row in rows: applyRow(model, row)                 // O(rows × avg attribution fan-out); cache per session
  model.bands   = bandVector(model)                    // existing rule: ≥4 measured answers, 60 % clear; observed apart
  model.edges   = topEdges(model, 12) ∪ allEdges       // display keeps 12; queries see all
  model.frontier= frontier(model, track)
  model.calibration = calibrate(model)
  return freeze(model)                                 // same ledger ⇒ byte-same model (verify-kagami)
```

At 10⁴ rows and a fan-out of ~4, the recompute is under 10⁵ belief updates, well inside a frame budget in a worker; incremental memoization per session is the existing pattern.

## C. The sensei

### C.1 Memory architecture across sessions

The sensei's memory is the ledger, projected three ways, and nothing else persists on the provider side (Messages API path, ZDR-eligible; no Managed Agents memory stores, whose contents "remain stored by Anthropic") ([Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency)).

1. **The learner card** (always in the cached prefix, ≤1,500 tokens): the goal row, band vector per track with measured/observed counts, ≤6 frontier targets with provenance, ≤4 confusion pairs with edge kind, the last `session` row's summary, preferences (correction style, furigana policy), and the leech list. This is PR #99's `aiTeachingContext()` widened, and it is rendered from `learnerModel()`, never hand-edited ([corridor.js (PR #99)](/home/user/bunki-final/prototypes/corridor/corridor.js)).
2. **The typed observation store** (the ledger itself, queried per turn): when the learner's message mentions or contains a node, the gateway retrieves that node's `NodeState`, its last three rows with responses, and its edges, and injects them as a turn-scoped block after the cache breakpoint. This is the LOOM/Mem0 "facts, not transcripts" pattern with the facts already typed ([Mem0 blog](https://mem0.ai/blog/build-a-personalized-ai-tutor-with-persistent-memory)).
3. **The transcript archive** (the existing IndexedDB AI archive with exchange ids): never in the prompt by default; retrieved by exchange id when a proposal cites it, and consolidated at session end by the session-summary job into a `session` row plus mined `sensei`/`confuse` rows with confidence.

Consolidation happens at session end and nightly, not per turn, matching the literature's offline extraction and keeping the interactive prefix stable ([llm_tutoring_design note](/home/user/Bunki-app/research_notes/Bunki%2010000x%20learning%20engine%20spec/llm_tutoring_design.md)).

### C.2 The tool set: every tool is a proposal the learner confirms

Tools are client tools with `strict: true`, `additionalProperties: false`, byte-stable and sorted so the tools prefix caches; `tool_choice` stays `auto` because forced calls 400 on Fable 5.1 and Opus 5.5; all results from one assistant turn return in one user message so parallel proposals keep working ([Tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)). Each tool returns a `proposal` object to the UI; nothing executes until the learner taps the door (amendment law 9).

| Tool | Arguments (strict schema) | What the learner sees | What confirmation writes |
|---|---|---|---|
| `propose_card` | `{ nodeRef, contract, front, back, readingKana, exampleSentenceId?, generatedSentence?, tags[] }` | A card preview with its verification badge (C.4) | Card into the deck; FSRS initialises it; no grade |
| `propose_observation` | `{ subject: NodeRef, code, polarity, evidenceQuote, confidence }` | "I noticed…" chip with the quoted evidence | A `sensei` row (observed); rejected chips write nothing |
| `propose_probe` | `{ nodeRef, contract, method: 'typed_reading'\|'mc4'\|'cloze', why }` | A one-item quick check | The probe runs; its `probe` row is measured |
| `open_passage` | `{ passageId, span?: [start,end], why }` | A door to the shelf item at that span | A `reading-resume` command; exposure rows as the learner reads |
| `propose_focus` | `{ nodeRefs[], drill: 'discrimination'\|'reading'\|'stroke'\|'cloze', why }` | A dojo door | `startFocus` with those nodes |
| `propose_lesson` | `{ lessonId, why }` | A lesson door | `startLesson` |
| `propose_paper_section` | `{ paperId, section, why }` | A mock door, labelled 検収前 if unapproved | `startMock` |
| `propose_goal_change` | `{ field, value, why }` | An edit sheet for the goal row | A new `goal` row |
| `cite_grammar` | `{ grammarId }` | The bank entry, verbatim | Nothing (retrieval, not generation) |
| `lookup` | `{ surface, readingHint? }` | Dictionary sheet | Nothing (a `tap` row when opened) |
| `request_context` | `{ nodeRefs[] }` | Nothing | Nothing; the gateway answers with typed state (C.1 tier 2) |

The sensei never has a tool that grades, schedules, or writes FSRS state; the only writes are learner-confirmed doors, which is law 3 in schema form. `cite_grammar` exists because the guardrail literature says free explanations bend under pressure and grounded retrieval does not ([EduFrameTrap (abstract)](https://arxiv.org/abs/2605.14604)).

### C.3 Prompt architecture with caching

```
[breakpoint 1: global prefix — shared by all learners, 1h TTL]
  tools[]  (sorted, frozen per release)
  system   (pedagogy: hint before answer, one step per turn, ≤130 words, corrective friction rules,
            Japanese output rules: readings from the dictionary only, no readiness language, both tracks kept apart)
  grammar-bank digest, rubric texts (versioned ids), verification badge semantics
[breakpoint 2: learner block — per learner, refreshed per session, 5m TTL (1h if turns are sparse)]
  learner card (C.1 tier 1), rendered from learnerModel(); no dates, no session ids inside
[after the breakpoints: volatile]
  turn-scoped context (C.1 tier 2), the conversation window (8 turns on main today; grow to 20 with compaction)
  date/session id via a mid-conversation system message on Opus/Fable, or a user-turn block on Sonnet 5
```

Rules: never vary `effort` or the tool list per turn (both invalidate caches); pin `effort: low|medium` on the chat route and `xhigh` on the diagnosis route; verify hits with `usage.cache_read_input_tokens`; use `output_config.format` only on the separate extraction route, since changing it invalidates the chat cache ([Prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching); [Structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). The current nine prompts collapse into three routes: chat (sensei with tools), teach (word tutor, examples, coach, quiz, cards, reading generation, all with the learner block), and extract (structured outputs).

### C.4 Model tier per job

| Job | Model | Why (from cited pricing and behaviour) | Retention path |
|---|---|---|---|
| Interactive chat turn | Sonnet 5 (`effort: low/medium`) | $2/$10, "Fast", 1,024-token cache minimum, ≈$0.25/day at 40 turns | ZDR workspace |
| Word tutor, examples, coach, quiz, cards | Sonnet 5 | Same route family, same learner block | ZDR |
| Session summary and diagnosis | Opus 5.5 (`effort: xhigh`) | $4/$20 with $0.20 cache reads; Anthropic's "start with Opus 5.5" guidance | ZDR |
| Nightly mining of transcripts and placement answers | Sonnet 5 via Batch, structured outputs | 50 % off; results within ~1 hour; not ZDR-eligible (29-day retention) | 30-day-retention workspace, opt-in |
| Reading-passage generation (drafts, 検収前) | Sonnet 5 via Batch; Haiku 4.5 for bulk example drafts only if the prefix exceeds its 4,096-token minimum | Haiku answered checkable questions at ~a tenth of Opus cost but 63 % vs 92 % accuracy (skill guide) | 30-day workspace |
| Weekly deep review of a learner's month (optional) | Fable 5.1 | $0.25 cache reads make repeated dossier passes cheap; but $50 output and mandatory 30-day retention | Only with explicit learner consent |
| Verification of Japanese | No LLM: fugashi/UniDic, dict-v2, jReadability, grammar bank | Deterministic; LLM used only to explain a disambiguation | Local |

Sources: [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview); [Pricing](https://platform.claude.com/docs/en/about-claude/pricing); [Batch processing](https://platform.claude.com/docs/en/build-with-claude/batch-processing); [API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention). Haiku 4.5's retirement floor is 2026-10-15 and no successor is listed, so no route may depend on it.

### C.5 Verification of generated Japanese

Every Japanese string the sensei or any generator emits passes a deterministic gate before it can teach; failure regenerates, or shows the text with the unverified field hidden and a 検収前 badge. This is campaign law 4 implemented as code.

```
verifyJapanese(text, learnerBlock, purpose):
  tokens = tokenize(text)                                  // fugashi + UniDic 2.1.2 (the repo's pinned grader lineage)
  1. lexical: every content token's lemma is in dict-v2 or the allowed target list; else FAIL('unknown-lemma')
  2. readings: for every kanji span, the reading the model supplied (if any) equals the UniDic/JMdict reading for that
     surface+POS; polyphonic kanji (Joyo Kanji Yomi list) require a dictionary-resolved reading; the LLM never supplies
     furigana directly; else FAIL('reading')
  3. level: jReadability band within the learner's target band ± 1; TMR-style miss rate = Σ_tokens (1 − pKnown) / N ≤ 0.10
     for teaching text (≈ 95 % coverage proxy), ≤ 0.05 for extensive reading; else REWRITE
  4. grammar: constructions detected by the rule annotator over the token stream must be in the grammar bank at or below
     the target band; explanations must cite a bank id; else FAIL('grammar')
  5. register: politeness form consistent within the passage (a rule over 敬語/丁寧/普通 markers); else REWRITE
  6. segmentation: no leading punctuation, no fragments (the 13–16 % reject class, snippet); else REWRITE
  7. rights: minted text carries provenance 'generated', pool 'original', and is 検収前 until approved
  return { ok, badge: 'verified'|'unverified-field'|'検収前', failures[] }
```

The Joyo Kanji Yomi benchmark's 13,095 annotated sentences become the regression suite for step 2 ([Joyo Kanji Yomi Benchmark](https://github.com/sbintuitions/Joyo-Kanji-Yomi-Benchmark)); jReadability's formula is five features over UniDic tokens and is cheap enough to gate every turn ([jreadability](https://github.com/joshdavham/jreadability)); the Token Miss Rate idea is from the beginner-friendly paper (abstract only) ([arXiv 2506.04072 (snippet)](https://arxiv.org/pdf/2506.04072)).

### C.6 Evaluation rubric

Offline, a Japanese tutoring bench modelled on TutorBench and L2-Bench: a bank of learner-turn scenarios (particle error, misreading of a polyphonic kanji, keigo direction error, sense confusion, a correct answer the learner doubts, an insistence attack "my textbook says は here") each with expert-written pass/fail criteria, graded by an LLM judge calibrated against human labels (TutorBench's judge reached 0.78 agreement) ([TutorBench](https://arxiv.org/abs/2510.02663); [L2-Bench](https://arxiv.org/abs/2607.08842)). Criteria per turn: identified the error, located it, gave a hint before the answer, the Japanese in the reply passes C.5, no readiness language, stayed within level, held the correct judgment under pressure, proposed at most one door with a why. The BEA 2025 dimensions (mistake identification, location, guidance, actionability) are the four scored axes ([BEA 2025](https://arxiv.org/abs/2507.10579)). Online, the primary metric is delayed unassisted recall on held-out probes (H), never in-session accuracy, because PNAS shows those can move in opposite directions ([PNAS 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122)). The existing `verify-corridor-ai.mjs` probes (24/24 on the last battery) become the CI harness for the rubric ([battery-close/SUMMARY.md](/home/user/Bunki-app/docs/build-evidence/kairo-next/battery-close/SUMMARY.md)).

## D. Every surface as a query over the model

Each surface receives `learnerModel()` and returns proposals or orderings; none keeps a private notion of what the learner knows (ADR-004). "What changes" is relative to `main`.

### D.1 Reading (the reader) and D.4 the shelf

```
shelfRank(model, items):
  for item in items:
     comps = item.tokens.map(nodeRef)                                    // pre-tokenized with grading (already shipped)
     E[cov]   = Σ pKnown(c) / N                                          // expected token coverage
     var[cov] = Σ pKnown(1−pKnown) / N²
     unknownMass = Σ (1 − pKnown(c)) over types
     painDensity = Σ pain(c) / N
     bandMatch   = agreement of item.grading.signals with model.bands (three signals, never averaged)
  return items sorted by: goalBand fit, then |E[cov] − target| (0.95 instructional, 0.98 extensive), then painDensity desc,
         with E[cov] ± √var and the count of frontier nodes shown on the card, never a single difficulty number

readerRender(model, item, policy):
  furigana per reading slot: show when pKnown(slot.readingNode, 'reading') < policy.threshold   // Satori rule per slot
  gloss per token: sense chosen by the item's tokenizer; tap writes an exposure row; lookup writes a 'lookup' observed row
  highlight: nodes on the frontier get a faint mark; confusion partners get a paired mark
```

What changes: the shelf stops being a static list (date-seeded six on PR #99) and shows expected coverage with an interval; reader dials become model-driven with manual override written as a `preference` row; the "you read at about N-x" line is deleted.

### D.2 Drift

```
driftSeed(model, track):
  targets = frontier(model, track).filter(reason ∈ {'next-by-frequency','probably-readable','uncertain'}).take(24)
  edges   = model.edges.filter(pi > 0.15).take(8)
  自 stop  = the node with max pain whose contract has conf ≥ 3; else the first 'unplaced'
  return { targets, edges, stop, why: per-node (pKnown, conf, source) }
```

What changes: the 自 stop stops being the stub hint string; drift draws from the lexis band and the frontier, writing `drift` exposure rows only.

### D.3 Cards (multi-sentence i+1 cards from the 45k bank)

```
i1Candidates(model, target t, bank):
  for s in bank.byHeadword[t]:                                            // 40,082-headword inverted index
     comps = parse(s) − {t}                                                // lexeme-senses, reading slots, grammar forms
     U = Σ_c (1 − pKnown(c)); guard = min_c pKnown(c)
     eligible = U < 0.25 and guard ≥ 0.5                                   // one-unknown in expectation and no hidden unknown
     score = 10^6·round(U) + min(W_p·priority(comps) + W_d·lengthDeviation(s) − W_pain·Σ pain(c), 10^6 − 1)
  pick greedily with a diversity penalty on repeated non-target comps and frame hashes (Jaccard)
  return top 3 sentences per card, with the target's reading from the bank's token readings (never from the LLM)
```

This generalises AnkiMorphs' documented score `PU·|M_U| + min(tuning, PU−1)` to probabilistic knowledge with grammar forms as unknowns ([card_score.py](https://github.com/mortii/anki-morphs/blob/main/ankimorphs/recalc/card_score.py)). What changes: `propose_card` and the cards prompt draw from this query instead of asking the model for "three to five useful everyday words"; the sentence bank, not the LLM, supplies example sentences, so the card is verified by construction.

### D.5 Mock composer

```
composePaper(model, goal, bank, shelf):
  sections = goal.exam blueprint (OFFICIAL_BLUEPRINTS on PR #99)
  for section: sample items whose nodes are (a) at the goal band with conf < 4 (unmeasured), (b) on the frontier,
               (c) confusion partners as distractors where pi > 0.15; carrier sentences from the bank, passages from the shelf
  label: sourceClass 'original-ai' or 'assembled', 検収前 unless approved; timing from the blueprint
  result rows are 'mock' (measured); abandoned sittings write nothing (ADR-005)
```

What changes: the picker stops being static by level; the lens shows measured evidence per band and which sections have been sat, never a pass probability (law 5).

### D.6 Dojo

```
dojoPools(model):
  reading:        nodes with pKnown('reading') in [0.35,0.75] or 'probably-readable' words to confirm
  stroke:         kanji whose 'productive' contract is unplaced and whose word nodes are known
  discrimination: edges with pi > 0.25 and trials ≥ 3 → minimal-pair blocks, blocked before interleaved (Hwang floor)
  cloze:          grammar/form nodes with productive pKnown < 0.5 whose receptive pKnown > 0.8
  probes:         'unplaced' frontier nodes → one-item checks (cheapest evidence per minute)
  due:            FSRS due order, untouched
```

What changes: pools stop being "due cards or static kanji order"; every pool item carries its why; discrimination and probe pools are new.

### D.7 Planner (次の一手)

```
nextMoves(model, goal, today):
  candidates = []
  if fsrs.dueCount(today) > 0:                     candidates.push(door('startReview', why: dueCount, cost: est. minutes))
  for e in frontier(model).take(3):                 candidates.push(door('startFocus', [e], why: e.reason + provenance))
  for edge in remediable edges:                     candidates.push(door('startFocus', discrimination))
  if goal.exam and sectionsUnsat(goal):             candidates.push(door('startMock', section, why: 'no measured evidence at ' + band))
  if lessonsAtBandUndone(goal):                     candidates.push(door('startLesson'))
  if shelf.bestCoverageItem within target:          candidates.push(door('go', shelf item, why: E[cov] ± √var))
  rank by (goal date pressure × band gap, evidence gain per minute, variety); return 5 with a why each
  // no readiness number; no schedule writes; every item is a door (amendment law 9)
```

What changes: the app acts. Until the goal row exists, the planner uses today's default (due, then frontier), as the amendment specifies.

## E. Speech and listening stack

The stack is a cascade around Claude text because the Messages API has no audio modality ([Models overview](https://platform.claude.com/docs/en/about-claude/models/overview)). Every price below that is not from a fetched page is **(snippet)** and must be re-verified.

| Layer | Primary | On-device / offline fallback | Licence | Cost (as found) | Evidence flags |
|---|---|---|---|---|---|
| ASR, scripted drills (known text) | Forced alignment: MFA Japanese v3.0.0 or Qwen3-ForcedAligner-0.6B | Same (both run locally) | MFA models CC BY 4.0; Qwen3 Apache-2.0 | Self-hosted compute only | [mfa-models](https://github.com/MontrealCorpusTools/mfa-models/blob/main/acoustic/japanese/mfa/v3.0.0/README.md); [Qwen3-ASR](https://github.com/QwenLM/Qwen3-ASR) |
| ASR, free conversation | Whisper large-v3 / v3-turbo self-hosted (JSUT CER 7.1) or Qwen3-ASR-1.7B (streaming via vLLM) | iOS 26 SpeechAnalyzer (ja-JP, on-device, 38–125× RT); browser whisper-web small/base on Chrome WebGPU | Whisper MIT; Qwen3 Apache-2.0 | Self-hosted; Deepgram Nova-3 multilingual $0.0058/min **(snippet)** | Learner-speech accuracy UNVERIFIED for every engine; [kotoba-whisper](https://github.com/kotoba-tech/kotoba-whisper); [offline_stt PR #72](https://github.com/goofmint/offline_stt/pull/72) |
| Pitch-accent perception | Minimal-pair 3AFC identification with immediate feedback (Shport pattern, snippet) using the shipped VOICEVOX/SBV2 clips and Kanjium patterns | Fully on-device | Kanjium CC BY-SA 4.0 (share-alike on derived accent data) | None | [kanjium](https://github.com/mifunetoshiro/kanjium); [SSLA Shport (snippet)](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/training-english-listeners-to-identify-pitchaccent-patterns-in-tokyo-japanese/262669390D4A27BB3A35F1A9200944C6) |
| Pitch-accent production (prototype tier) | Forced align → pyworld Harvest F0 per mora → H/L rule classifier vs target from pyopenjtalk/marine; contour overlay vs reference | Same pipeline on device where compute allows (onchou proves browser-only feasibility) | pyworld MIT; pyopenjtalk MIT; marine Apache-2.0; CREPE MIT | None | No commercial API scores Japanese pitch; Azure prosody en-US only, ja-JP phonemes empty in issue #2237; [onchou](https://github.com/bagustris/onchou); [azure-ai-docs mirror](https://github.com/MicrosoftDocs/azure-ai-docs/blob/main/articles/ai-services/speech-service/how-to-pronunciation-assessment.md) |
| TTS, drill audio (accent must be right) | VOICEVOX via voicevox_core with programmatic accent phrases; pre-generated and cached (the existing 22,210-clip pattern) | Shipped clips | voicevox_core MIT; voices per-character credit "VOICEVOX:キャラ名"; resource repo restricts character assets to development use absent a licence | Free | [voicevox_core](https://github.com/VOICEVOX/voicevox_core); [voicevox_resource](https://github.com/VOICEVOX/voicevox_resource); OD-6 open |
| TTS, listening content (naturalness) | ElevenLabs v3 or Google Chirp 3 HD for passages, cached per sentence | Shipped clips; Apple system voices UNVERIFIED | Vendor terms unreadable this session | Azure Neural HD $22, Google Chirp 3 HD $30, ElevenLabs ≈$50 per 1M chars, all **(snippet)** | Reviewers flag kanji-reading and proper-noun accent errors in ElevenLabs **(snippet)** ([AI PICKS](https://aipicks.jp/mag/elevenlabs-gemini-guide-2026)) |
| Live voice tutor | Cascade: STT → Claude (Sonnet 5, streaming) → TTS inside Pipecat (BSD-2) or LiveKit Agents (Apache-2.0) | Push-to-talk with on-device STT and shipped-clip replies | Pipecat BSD-2; LiveKit Apache-2.0 (turn-detection models separately licensed) | Model layer ≈$0.02–0.08/min; orchestration $0.01/min on LiveKit/Pipecat Cloud, all **(snippet)** | No measured Japanese latency found; [pipecat](https://github.com/pipecat-ai/pipecat); [livekit/agents](https://github.com/livekit/agents) |
| Listening content | Own TTS over own and public-domain text (Aozora), aligned with MFA/Qwen3 aligner; the 67-passage `sentence-cues.json` on PR #99 | Shipped | Aozora PD text; Aozora Roudoku audio terms UNVERIFIED; NHK Easy terms UNVERIFIED (link out only); YouTube via official embed only | None | [sentence-cues.json (PR #99)](/home/user/bunki-final/prototypes/corridor/audio/sentence-cues.json) |

Listening evidence enters the ledger as `practice` rows with `mode: 'listening'` scored by the deterministic transcript match (Tier A when the answer is a typed transcription, Tier B under `SOURCE_LISTENING_RUBRIC`), and speaking as `practice` rows under `SOURCE_PRODUCTION_RUBRIC`, both of which already exist on PR #99 ([sentence-practice.mjs (PR #99)](/home/user/bunki-final/prototypes/corridor/sentence-practice.mjs)). Pitch production scores are diagnostic (Tier C) until the classifier is validated against native judgments, which no reachable paper allowed this session.

## F. Data and licensing table

| Asset | Role | Licence | Commercial use | Share-alike on derived data | Status / flag |
|---|---|---|---|---|---|
| JMdict, JMnedict, KANJIDIC2, RADKFILE/KRADFILE (via jmdict-simplified; dict-v2 shipped) | Words, senses, kanji, components | CC BY-SA 4.0 **(snippet for EDRDG page)** | Yes with attribution and URLs | Yes | Shipped; pin `3.6.2+20260803141815`; the upstream zip is not in the repo so `verify-dict-tags.mjs` cannot run here |
| JmdictFurigana | Reading slots per kanji span (177,770 entries) | Follows JMdict terms (repo states derivation) | Yes | Yes | To add; "not 100%", weaker on names ([JmdictFurigana](https://github.com/Doublevil/JmdictFurigana)) |
| KanjiVG | Strokes (2,136 sets shipped) | CC BY-SA 3.0 | Yes | Yes | Shipped, VERIFIED 2026-07-27 in `packages/seed` |
| AnimCJK | Brush outlines (2,581 kanji shipped, 1,947 approved) | Arphic Public License (graphics) + LGPL | Copyleft-style; verify obligations | Yes (font-style) | Shipped with licence text; OD not yet raised |
| Kanji alive | Radical media, 1,235 kanji audio/animation | CC BY 4.0 | Yes | No | Optional addition |
| Kanjium | Pitch accent (124,137 words) | CC BY-SA 4.0 | "freely… commercially" | Yes; upstream sources undisclosed (issue #13) | To add for perception drills; provenance risk noted |
| OJAD / Suzuki-kun | Accent and phrasing reference | Educational/academic only **(snippet)** | No | — | Do not embed or scrape |
| NINJAL 教育基本語彙 (6,103 words) | Grading substrate | CC BY 4.0 | Yes | No | Shipped, sha256-pinned; NINJAL live pair unavailable ("egress policy") |
| SNOW T15/T23 | Sentence bank (with Tanaka, Wikinews) | CC BY 4.0 | Yes | No | Shipped; no per-sentence licence tag inside shards |
| Tanaka Corpus / Tatoeba text | Sentence bank | CC BY 2.0 FR (CC0 subset) | Yes with per-sentence attribution | No | Shipped; Tatoeba audio is per-contributor, mostly CC BY-NC **(snippet)**: do not ship audio without per-clip check |
| ja.wikinews (77 shelf + 686 archive) | Reading | CC BY 2.5 | Yes | No | Shipped; CI rights gate |
| Aozora Bunko | Reading, PD | Public domain (per-work notes; some CC) | Yes | — | Shipped 6 items; usage-rule page unreadable this session (UNVERIFIED detail) |
| 出入国在留管理庁 glossary (10 shelf items) | Reading | 利用条件 未検証 | Unknown | — | **Unresolved**; cull or clear before any commercial build |
| Kentei fact table (mimneko/kanji-data) | 漢検 levels | CC0-1.0 | Yes | No | Shipped, pinned commit |
| SKIP codes (10,384) | Kanji lookup | CC BY-SA 4.0 per rights holder's 2014 notice; legacy EDRDG page says BY-NC-SA | Yes per rights holder | Yes | Shipped with `licensingConflict` recorded |
| KKLD numbers (PR #99) | Kanji reference | CC BY-SA 4.0 (KANJIDIC2 field) | Yes | Yes | On PR #99 only |
| Bunki originals (49 shelf, 30 造化三神 essays, grammar bank, sem tier) | Reading, grammar | Operator-owned; repo licence undecided (OD-09) | Owner's choice | — | OD-2 (30 recovered originals) and OD-09 open |
| Mock sets (25, 423 items) | Assessment | Generated from rights-cleared assets; label mismatch (CC BY 4.0 vs BY-SA on JMdict-lineage words) | Yes after relabel | Inherits BY-SA | All `approved: false` (D2 open); fix the label |
| Audio: 小春音アミ (SBV2), F1 (JVNV), VOICEVOX voices | 22,210 clips | ACML 1.0 / amitaro.net terms (asserted, not reproduced); CC BY-SA 4.0; VOICEVOX per-character credit | Credit required; SBV2 code AGPL-3.0 (used only at build time, offline) | JVNV yes | OD-6 open; reproduce the ACML text in-repo |
| Fonts (Shippori Mincho B1, Yuji Syuku, Kaisei Tokumin; BIZ UDPGothic, Noto Sans JP proposed) | UI and reading | SIL OFL 1.1 | Yes | — | Shipped; OFL note present |
| ts-fsrs 5.4.1 | Scheduler | MIT | Yes | — | Pinned and verified |
| fugashi + unidic-lite (UniDic 2.1.2), jreadability 1.1.5 | Grading, verification | MIT / BSD (UniDic) / MIT | Yes | — | Build-time; Debian setuptools issue noted in README |
| Sudachi / Lindera / Kuromoji.js | On-device tokenizer for the verifier and reader | Apache-2.0 / MIT / Apache-2.0 | Yes | — | Lindera IPADIC ≈13 MB is the phone-feasible choice; UniDic-backed WASM needed to match jReadability |
| Whisper, Qwen3-ASR, MFA ja v3, pyopenjtalk, pyworld, CREPE | Speech | MIT / Apache-2.0 / CC BY 4.0 / MIT / MIT / MIT | Yes | — | naist-jdic licence UNVERIFIED; JSUT and ReazonSpeech corpus licences UNVERIFIED |
| voicevox_core / VOICEVOX voices | TTS | MIT / per-character terms; resource repo "development use only" | Negotiate for bundled voices | — | OD-6 |
| Ruri-v3-30m (ONNX) | On-device semantic search (optional) | UNVERIFIED (HF blocked; believed Apache-2.0) | Check | — | Optional |
| JParaCrawl, NAIST Lang-8, cLang-8, Tadoku readers, I-JAS/C-JAS, NHK Easy, fan subtitles | Not shippable | Research-only / CC BY-NC / NC-ND / unknown / none | No | — | Excluded from the product |

Sources beyond the repo files: [SudachiDict LEGAL](https://github.com/WorksApplications/SudachiDict/blob/develop/LEGAL); [kanjium](https://github.com/mifunetoshiro/kanjium/blob/master/README.md); [OJAD notes (snippet)](https://www.gavo.t.u-tokyo.ac.jp/ojad/pages/notes); [Tatoeba audio (snippet)](https://en.wiki.tatoeba.org/articles/show/choose-audio-license); [JParaCrawl (snippet)](https://www.kecl.ntt.co.jp/icl/lirg/jparacrawl/); [Tadoku (snippet)](https://tadoku.org/japanese/en/free-books-en/); [Style-Bert-VITS2 TERMS_OF_USE](https://github.com/litagin02/Style-Bert-VITS2/blob/master/docs/TERMS_OF_USE.md); [kanji alive](https://github.com/kanjialive/kanji-data-media). The share-alike column matters for the product decision: a bundle of JMdict-derived data must itself be released CC BY-SA, which the corridor already accepts; the application code is a separate work whose licence is OD-09.

## G. Platform

### G.1 Local-first with optional sync

The ledger is insert-only, so it is conflict-free by construction: the merge rule is the union of rows followed by deterministic replay, the Linear `lastSyncId` and Anki revlog pattern, and no CRDT is needed ([reverse-linear-sync-engine](https://github.com/wzhudev/reverse-linear-sync-engine); [Anki manual: Syncing](https://raw.githubusercontent.com/ankitects/anki-manual/main/src/syncing.md)). Phase 0 stays as it is: SQLite on device (expo-sqlite native authority, IndexedDB in the corridor via PR #99's replication layer), the export the only egress. When sync is added, the transport is a ~300-line "append rows / pull rows since cursor" endpoint keyed by `(device, seq)` with a server-assigned global sequence, or PowerSync Open Edition over Postgres if an upload queue and bucket rules are wanted (FSL-1.1 is acceptable for a tutor app that is not a sync-engine competitor) ([powersync-service LICENSE](https://github.com/powersync-ja/powersync-service/blob/main/LICENSE)). Electric is not chosen because its cloud is winding down after the Databricks move **(snippet)** ([Electric blog (snippet)](https://electric.ax/blog/2026/08/11/electric-joining-databricks)). The derived model is never synced; each device recomputes it. PR #99's CloudKit transport remains a candidate for the Apple-only path but has never exchanged data with live CloudKit and must not be counted as built ([packages/apple-sync/README.md (PR #99)](/home/user/bunki-final/packages/apple-sync/README.md)). Sync is opt-in and end-to-end encrypted at the row level so that the server holds only ciphertext rows and cursors; this keeps "the export is the only egress" true in spirit, since the sync payload is the export itself, encrypted.

### G.2 Provider gateway and key handling

The corridor's `AI_DEFAULT_BASE_URL = 'https://api.anthropic.com'` seam becomes a gateway endpoint ([corridor.js](/home/user/Bunki-app/prototypes/corridor/corridor.js)). The client sends the learner's session token and the request body without a key; the gateway (a Cloudflare Worker or equivalent) holds the Anthropic key, applies `cache_control` and the frozen prefix, enforces per-learner daily caps from the `usage` fields, streams SSE back, and writes a `usage` row per call keyed by learner ([Pricing](https://platform.claude.com/docs/en/about-claude/pricing)). Cloudflare AI Gateway's rate limit is gateway-wide, so per-learner budgets live in the Worker ([Cloudflare rate-limiting.mdx](https://raw.githubusercontent.com/cloudflare/cloudflare-docs/production/src/content/docs/ai-gateway/features/rate-limiting.mdx)). For the personal phase, BYOK stays web/desktop-only behind a developer setting and is never the mechanism that unlocks paid functionality on iOS (guideline 3.1.1 precedent) ([Apple forum thread 763884](https://developer.apple.com/forums/thread/763884)). Two Anthropic workspaces: a ZDR workspace for live routes (Sonnet 5, Opus 5.5) and a 30-day-retention workspace for opt-in batch mining and any Fable 5.1 use ([API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)). Japan residency is not available on the first-party API; if required for a Japanese launch, Google Cloud or Bedrock regional endpoints are the documented route, at the cost of Batch and structured extraction via batch ([Data residency](https://platform.claude.com/docs/en/manage-claude/data-residency)).

### G.3 Cost per learner

From the researchers' arithmetic on cited list prices (assumptions stated in the notes; Japanese tokens-per-character unmeasured): Sonnet 5 optimised (frozen cached prefix, batch mining, batch readings) costs **$12.5–14.4/month for a heavy learner** (45 turns/day, 30 days) and **$5.6–6.4/month for a realistic learner** (30 turns/day, 20 days); Haiku halves it; Opus 5.5 roughly doubles it ([product_platform_efficacy](/home/user/Bunki-app/research_notes/Bunki%2010000x%20learning%20engine%20spec/product_platform_efficacy.md)). Speech adds ≈$0.20–1.00/month for a ten-minute daily call at the model layer **(snippet)**. Against a $14.99/month price after a 15 percent store commission (≈$12.74 net), the heavy learner is break-even on Sonnet 5, so the product needs turn caps per tier, Haiku-class routing for routine turns only if a Haiku successor appears, and caching discipline; the competitor umbrella is $9–15/month for one pillar and $17.99–39.99 for uncapped AI conversation, all **(snippet)** ([Wanilog (snippet)](https://wanilog.com/guides/is-wanikani-worth-it); [SpeakShark (snippet)](https://speakshark.com/blog/speak-app-pricing-per-month-2026)).

### G.4 Store compliance

Apple 5.1.2(i) requires clear disclosure and explicit permission before personal data goes to third-party AI, so a first-run consent sheet names Anthropic and what is sent; privacy labels count text sent to a model as "collected" unless discarded after the request; 3.1.1 requires IAP for unlocks and non-expiring credits; 5.1.1 requires in-app account deletion if accounts exist ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/); [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)). Google Play requires an in-app report control for generative output **(snippet)** ([Play Console Help (snippet)](https://support.google.com/googleplay/android-developer/answer/13985936?hl=en)). The EU AI Act's Article 50 "you are talking to an AI" duty applied from 2026-08-02; Annex III education obligations are deferred to 2027-12-02 and a self-directed consumer tutor is probably outside them unless it issues certificates or is sold to schools, which is a research inference, not legal advice **(snippet)** ([WinsSolutions (snippet)](https://www.winssolutions.org/eu-ai-act-education-deadline-deferred/)). Japan's APPI amendment adds minors' protections and cross-border transfer duties remain **(snippet)** ([Fisher Phillips (snippet)](https://www.fisherphillips.com/en/insights/insights/japanese-cabinet-approves-appi-amendments)). No readiness or pass-probability language may appear in store copy (law 5, and ADR-005).

## H. Efficacy measurement plan

The claim to make is two-fold and each half is testable: "the model is calibrated" and "learners retain and produce more". The design copies what survives scrutiny in the app-efficacy literature and avoids what did not: Duolingo's DRR-21-02 had no control group and lost about 60 percent of eligible learners before the test, Babbel's 54 and Busuu's 61 learners were single-arm ([Duolingo speaking whitepaper](https://duolingo-papers.s3.amazonaws.com/reports/duolingo-speaking-whitepaper.pdf)).

**Calibration (from day one, N = 1).** Every night, for each node whose belief predicted `pKnown` at the time of a later Tier-A probe or review, record `(predicted, outcome, tier, method)`; report RMSE(bins) and Brier per tier and method against a constant-base-rate baseline; show the learner a calibration plot on the mirror. Pre-register the bins. This is the FSRS benchmark's own metric applied to the belief layer ([srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)).

**Retention (N = 1, WWC-ratable single-case design).** Hold out a random 10 percent of newly learned nodes from the planner and sensei; probe them at 1, 7 and 30 days on a fixed schedule with typed recall; alternate, per session and at random, tutor-scheduled versus fixed-interval review on matched item sets (alternating-treatments design) and report Tau-U with the phases pre-registered; WWC v5.0 covers single-case designs, though its numeric minimums could not be fetched this session **(snippet)** ([WWC SCD training](https://ies.ed.gov/ncee/wwc/SingleCaseTraining5)). The primary outcome is delayed, unassisted recall and production on held-out items; in-session accuracy is reported only as secondary, following PNAS ([PNAS 2025](https://www.pnas.org/doi/10.1073/pnas.2422633122)).

**External anchor.** The owner's December JLPT N1 sitting enters as an `external` row and is reported apart, never as a model input; per the amendment it is one benchmark among the signals. For a cohort (20–60 self-selected learners, later), add a blind-rated speaking sample, a JLPT-style practice paper the tutor never trained on, a waitlist or delayed-start arm, the full funnel (eligible → consented → started → completed → scored) with reasons, the minimum detectable effect against EEF's 0.2 threshold **(snippet)**, pre-registration on OSF, and de-identified ledger exports as open data ([EEF 2019 (snippet)](https://d2tic4wvo1iusb.cloudfront.net/documents/evaluation/peer-review-process/Classifying_the_security_of_EEF_findings_2019.pdf)). No "efficacy" wording appears on the store page before that.

**Tutor quality.** The C.6 bench runs in CI on every prompt change; the sycophancy sub-suite must hold at 100 percent on the insistence cases because a single capitulation teaches a wrong particle.

## I. Delivery plan

Effort figures are **estimates in builder-weeks** for one experienced builder working with an AI pair; they exclude operator review time and legal work. Order is binding where a milestone reads the model.

| # | Milestone | Scope | Acceptance tests | Estimate |
|---|---|---|---|---|
| M1 | **Stateful tool-using tutor + placement + planner** (三a, 三b, 九) | Port `aiTeachingContext` from PR #99 onto `main`; retire `aiLevelGuess` at nine call sites; gateway with frozen cached prefix and two breakpoints; the C.2 tool set with `strict: true`; placement interview (B.6) writing `placement`, `probe`, `goal` rows; `nextMoves()` with five doors; session-summary row | `verify-corridor-ai` extended: every prompt carries the learner block, no prompt contains "you read at about"; `usage.cache_read_input_tokens` > 0 on the second turn of a session; a seeded ledger yields byte-identical `nextMoves`; placement writes ≥ 80 typed rows in a browser walk; all doors open existing entry points and write nothing; forbidden-phrase scan passes | 7 |
| M2 | Model v3 nodes and tiers (B.1–B.5) | JmdictFurigana build asset; reading/sense/grammar/form node ids; four contracts; `(q0,q1)` channel; attribution and propagation; confusion edges with kinds; frontier reasons | `verify-kagami` extended to ≥ 60 checks: v2 outputs unchanged for old ledgers; 歩道 misread as あゆみち lowers 歩=ホ and 道=ドウ and not 徒歩 below prior; observed-only cells never reach a band; export → import round-trip keeps every new kind | 6 |
| M3 | Verification gate for generated Japanese (C.5) | Tokenizer in a worker (Lindera-UniDic or Sudachi WASM), reading check, jReadability, TMR, grammar annotator v1 over the bank, register and segmentation rules; 検収前 badges | Joyo Kanji Yomi regression ≥ 99 % on single-reading items, reported on multi-reading; every teaching string in a browser walk carries a badge; a planted wrong reading is caught | 5 |
| M4 | Surfaces as queries (四, 五, 六, 七b, dojo pools) | `shelfRank`, `readerRender` per slot, `driftSeed`, `i1Candidates` cards, `composePaper`, `dojoPools` | Each surface has a verifier asserting it reads `learnerModel()` and no private state; shelf cards show E[cov] ± √var and never one number; 100 sampled i+1 cards have U < 0.25 and guard ≥ 0.5; discrimination pools appear only when pi > 0.25 with ≥ 3 trials | 6 |
| M5 | Calibration and efficacy instrumentation (H) | Nightly calibration job; held-out probe schedule; alternating-treatments randomiser; mirror calibration plot; external-evidence rows | Brier and RMSE(bins) computed per tier on a synthetic ledger match a reference implementation; held-out items never appear in planner or cards; the N1 sitting row is shown apart | 3 |
| M6 | Sensei evaluation bench and sycophancy suite (C.6) | 120 scenarios with rubrics; LLM judge calibrated on 40 human-labelled cases; CI gate | Judge agreement ≥ 0.75 on the labelled set; insistence cases 100 %; bench runs on every prompt change | 3 |
| M7 | Speech tier 1: listening and perception (E) | Aligned passage audio (extend `sentence-cues.json`), listening practice rows, pitch-perception drills from shipped clips and Kanjium, scripted read-aloud with forced alignment | 67 passages play with line highlight; listening rows are measured only when the check is deterministic; perception drill logs Tier-A rows; alignment RTF < 1 on the build machine | 4 |
| M8 | Speech tier 2: live voice and pitch production prototype | Pipecat/LiveKit cascade around the M1 tutor; on-device STT fallback (iOS 26 SpeechAnalyzer); H/L classifier vs pyopenjtalk target; contour overlay | Round-trip under a target agreed after measurement (no Japanese figure exists); production scores logged as Tier C only; no pitch score shown as a mastery claim | 5 |
| M9 | Platform: gateway hardening, consent, store compliance, optional sync (G) | Per-learner caps, kill-switch budget, two workspaces, consent sheet, privacy label, Article 50 banner, report control, IAP scaffold; opt-in encrypted append-only sync | Store-compliance checklist ticked with evidence screenshots; sync of two devices yields byte-identical models; BYOK absent on iOS | 5 |
| M10 | Product malleability: import from Anki/jpdb/WaniKani/Bunpro, Yomitan-format dictionaries, share-sheet capture, 国語 track scaffold | Importers write `external` and `revlog`-compatible rows with provenance; a second learner's ledger drives every surface | A fresh ledger with imported Anki revlog produces FSRS states equal to Anki's within clamps; two tracks never averaged in any view | 3 |

Total: about **47 builder-weeks, estimated**, with M1 through M4 (24 weeks) delivering the vision's core loop. M1 is deliberately first and small because most of its parts exist on PR #99 or `main`; nothing after M1 may merge without its verifier green, per campaign law 7.

## J. Risks and open owner decisions

| Risk or decision | Why it matters | Recommendation |
|---|---|---|
| **OD-09 / OD-1: repository licence** | Share-alike data pools already bind any shipped dictionary bundle; the app code's licence is undecided and blocks a store build | Decide now: keep data pools CC BY-SA as they are; license the app code under a source-available or proprietary licence with the data bundle published separately under BY-SA. Legal review required |
| **PR #99's status (do-not-merge, 257 commits, landed outside the ladder)** | It holds the assessment engine, record host and teaching context that M1 needs; the run state does not record it | Do not merge wholesale. Cherry-pick `aiTeachingContext`, `teacher-context.mjs`, the assessment package and its verifiers into the ladder as 三a; leave the iOS host and CloudKit transport parked until they compile |
| **D1: the N1 lane's source** | The boot dictionary tags 0 N1 words; 2,274 N1 words exist in the graded list of which 355 do not resolve | Option A (fall back to the graded list, ≈191 lessons) for the December sitting; authored N1 item banks (¥1M–6M, Stage 2) only if the product goes commercial |
| **D2: papers' 検収** | All 25 sets are `approved: false`; the mock composer can only propose unapproved papers | Approve per set under `verify-mock` after fixing the CC BY 4.0 / BY-SA label mismatch; keep "diagnostic, not rehearsal" in the UI |
| **OD-6: voices** | Listening and pitch drills need accent-correct audio; VOICEVOX character assets are "development use only" absent a licence; ACML text is not in the repo | Keep the shipped clips for the personal phase; before any commercial build, reproduce the ACML terms in-repo and negotiate VOICEVOX character licences or switch drill audio to JVNV (CC BY-SA) voices |
| **OD-08: AI privacy boundary, budget, latency** | The gateway, workspaces and consent sheet all depend on it | Set a monthly budget cap in the gateway, choose the ZDR workspace as default, 30-day workspace opt-in, 10 s timeout retained; the answer is data (a `preference`/`params` row), not code |
| **Calibration placeholders (q0, q1, propagation weights)** | They are inferences; wrong values make the frontier confidently wrong | Ship with the placeholders, but make the nightly calibration job and the mirror's calibration plot part of M2's acceptance, and shrink any channel whose bins mis-calibrate |
| **Learner-speech ASR accuracy is unmeasured** | Every engine's CER is on native read speech | Scripted, forced-aligned modes first (M7); free conversation ASR as Tier C until measured on the owner's own recordings |
| **Haiku 4.5 retirement floor 2026-10-15, no successor listed** | Any route depending on Haiku may break within weeks | No route depends on Haiku; batch routes run on Sonnet 5 |
| **Fable 5.1 mandatory 30-day retention** | Conflicts with a ZDR default | Fable only in the opt-in workspace for a monthly deep review, or not at all |
| **10 出入国在留管理庁 shelf items (利用条件 未検証)** | The rights gate passes them with an unverified label | Cull them from any commercial build unless terms are obtained |
| **The 国語 track ("Nothing")** | Amendment law 12 requires two tracks never averaged; only the JSL track has data | Scaffold the track's node map in M10; source MEXT grade lists (public) and keep 漢検 as its band vector |
| **Motivation and gaming** | Anki data cannot see quitters; gaming detectors are from math ITS | Log rapid-guess, hint abuse and Hard-on-forget patterns as `params`-free model features; respond with forced-recall formats, never punitive demotion (Bunpro's failure) |
| **Web-access gaps in this research** | Competitor prices, effect sizes, JLPT-CEFR cut scores, NHK/Aozora audio terms, vendor speech prices are snippet-level | Re-verify each flagged item before it appears in a spec, a store page or a pitch; nothing flagged has been treated as fact here |
| **Efficacy claims** | The field has no outcome evidence for AI Japanese tutoring; a false claim is a store and reputational risk | Publish calibration first (a defensible claim from N = 1), retention second, proficiency only with an external instrument and a control arm |

## Conclusion

The distance between Bunki's vision and its build is not a missing backend, a smarter model, or more content; it is the absence of one loop, model → proposal → confirmation → row → model, and the research shows that the loop can be closed inside the laws the owner already wrote. Where the market reduces knowledge to an interval threshold and tutors to topic memory, the evidence favours the opposite of both: a typed, uncertain, provenance-bearing state at the granularity of readings and forms, and a tutor whose power is bounded by verification and confirmation. That combination is not merely unbuilt elsewhere; it is unclaimed, because no competitor's data model can host it.

Two implications follow for how the work should be judged. First, the product's strongest defensible claim in its first year is calibration rather than efficacy: "the app can say how well it knows what you know, and it is right when checked" is provable from one learner's ledger and no one in the field makes it. Second, the choice to keep FSRS-6 as the only scheduler and to treat every belief as a read-only projection is not a constraint on the intelligence but the reason it can be trusted: the scheduler stays benchmarked, the AI stays a proposer, and every adaptation carries a why. Build M1, port what PR #99 already proved, and let the mirror act.
