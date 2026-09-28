# Learning science that determines whether a Japanese-learning system raises proficiency (evidence brief, as of 2026-09)

Research-environment note for the report writer: the network proxy in this session blocked WebFetch for essentially every publisher/repository domain (Wiley, Cambridge, Springer, MDPI, arXiv, ERIC, PMC, Semantic Scholar, Frontiers, jlpt.jp, jpf.go.jp, Wikipedia, Duolingo research). Only github.com was fetchable. Findings below therefore come from (a) full-text fetches of GitHub-hosted material (FSRS/SRS benchmark, Anki manual, Duolingo HLR repo) and (b) search-result snippets for peer-reviewed sources, each cited to its canonical URL. Where a number could not be confirmed against the paper it is flagged **[snippet-only]**; where a claim comes from prior knowledge and could not be sourced at all it is flagged **[unverified]** and kept out of Cited Findings. Evidence strength is labelled: **[META]** = meta-analysis/large benchmark; **[REPL]** = replication; **[SINGLE]** = single study; **[SECONDARY]** = aggregator/blog restating primary work.

---

## KQ1. Optimal spacing and retrieval for L2 vocabulary; how well FSRS-class models predict recall (benchmarks 2023-2026)

### Takeaway
Spaced retrieval is the best-supported mechanism in the entire brief (spaced > massed g ≈ 0.74 in a 2021 meta-analysis; medium-to-large in the 2022 L2-specific meta-analysis), while expanding-vs-uniform spacing is a wash on average. For scheduling, the open SRS benchmark (~10k Anki users, ~727M reviews) shows FSRS-6/7 substantially outperforms SM-2, HLR and Ebisu on log loss/AUC, is beaten only by heavier neural models, and that untuned FSRS defaults are still far better than legacy schedulers.

### Cited Findings
**Spacing / retrieval (L2)**
- **[META]** Kim & Webb (2022), *Language Learning*: 98 effect sizes from 48 experiments (N = 3,411); compared spaced vs massed, longer vs shorter spacing, and equal vs expanding spacing on immediate and delayed posttests; found a medium-to-large effect for spacing (spaced vs massed). Most primary studies were L2 vocabulary; L2 grammar under-researched. [snippet-only for the effect magnitude] — [Kim & Webb 2022](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479)
- **[META]** Latimier, Peyre & Ramus (2021), *Educational Psychology Review*: strong benefit of spaced over massed retrieval practice (g = 0.74); no significant difference between expanding and uniform schedules (g = 0.034); moderator: the more retrieval exposures per item, the more expanding schedules beat uniform ones. — [ERIC EJ1310148](https://eric.ed.gov/?id=EJ1310148); PDF: [lscp.net](http://www.lscp.net/persons/ramus/docs/EPR20.pdf)
- **[SINGLE]** Japanese EFL classroom study comparing expanding vs equally-spaced retrieval for vocabulary (ARELE 27) exists; result direction not captured in snippet. — [J-STAGE](https://www.jstage.jst.go.jp/article/arele/27/0/27_217/_pdf)
- **[SINGLE]** Spaced practice effects differ by activity type (fill-in-the-blanks vs flashcards). — [Academia.edu](https://www.academia.edu/120579340/Does_spaced_practice_have_the_same_effects_on_different_second_language_vocabulary_learning_activities_Fill_in_the_blanks_versus_flashcards)
- **[SINGLE]** Retrieval practice + feedback beat repeated study for L3 vocabulary. — [Int. J. Multilingualism 2024](https://www.tandfonline.com/doi/abs/10.1080/14790718.2022.2102172)
- **[SINGLE]** Cumulative (mixed old+new) testing benefits L2 vocabulary retention; retrieval effect moderated by proficiency (Maie 2025, *TESOL Quarterly*). [snippet-only] — [Maie 2025](https://onlinelibrary.wiley.com/doi/10.1002/tesq.3391)
- **[SINGLE]** Learning-direction study in *SSLA*: variable (both-direction) retrieval practice improved retention, clearest when tested in the harder (productive) direction after a delay. [snippet-only] — [SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/effects-of-learning-direction-in-retrieval-practice-on-efl-vocabulary-learning/159EE50F4B8835207764FB1B11077F29)

**FSRS-class scheduling: model and benchmarks**
- FSRS is a DSR (Difficulty, Stability, Retrievability) model derived from MaiMemo's DHP model; trained with BPTT + maximum-likelihood on review logs. Papers: Ye et al., "Optimizing Spaced Repetition Schedule by Capturing the Dynamics of Memory" (IEEE TKDE) and "A Stochastic Shortest Path Algorithm for Optimizing Spaced Repetition Scheduling" (KDD 2022). — [FSRS wiki](https://github.com/open-spaced-repetition/fsrs4anki/wiki/abc-of-fsrs); [paper](https://www.researchgate.net/publication/369045947_Optimizing_Spaced_Repetition_Schedule_by_Capturing_the_Dynamics_of_Memory)
- FSRS encodes three empirical laws: (1) more complex material → smaller stability increase; (2) higher current stability → smaller stability increase ("stabilization decay"); (3) lower retrievability at review → larger stability increase (the "stabilization curve", i.e., desirable difficulty). — [FSRS repo](https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler)
- **[META/benchmark]** Open SRS benchmark: ~10,000 Anki users, ~727M reviews (evaluation set 349.9M reviews excluding same-day reviews); TimeSeriesSplit so models only see the past; metrics = log loss (calibration), RMSE(bins), AUC. Results without same-day reviews: RWKV-Instant 0.2773 log loss / AUC 0.8329 (2.76M params); RWKV-Curve 0.3193 / 0.7683; GRU 0.3328 / 0.7324 (503 params); LSTM 0.3332 / 0.7329; FSRS-7 recency 0.3370 / 0.7220 (34 params); Logistic regression 0.3393 (34 params); SBD 7-param interpretable 0.3410; FSRS-6 0.3443 / 0.7074; FSRS-7 default (no per-user optimization) 0.3620 / 0.7029; FSRS-4.5 0.3625 / 0.6891; AVG (constant per-user mean) baseline 0.3945; HLR (Duolingo) 0.4694; Ebisu v2 0.4989. Caveat: all data from self-selected Anki users; RWKV trained differently (5,000 users). — [srs-benchmark README](https://github.com/open-spaced-repetition/srs-benchmark)
- FSRS-7 is designed for fractional intervals and is the only version giving realistic same-day recall predictions. — [Expertium benchmark page](https://expertium.github.io/Benchmark.html)
- **[SINGLE/small]** FSRS vs SuperMemo: 19 collections, 687,662 repetitions: FSRS-6 log loss 0.367±0.040 vs SM-17 0.432±0.084 vs SM-16 0.417±0.034; RMSE(bins) 0.048 vs 0.066; AUC 0.662 vs 0.606; FSRS-6 better on 83.3% of collections. Required grade-scale mapping (6→4) and first-interval normalisation. — [fsrs-vs-sm17](https://github.com/open-spaced-repetition/fsrs-vs-sm17)
- Anki operational guidance: default desired retention 90% "offers a good balance of retention and workload"; stay below 97% ("above 90% the workload increases very quickly, above 97% the workload can be overwhelming"); FSRS performs poorly with "less than a few hundred" reviews; re-optimize parameters about monthly; the one habit FSRS cannot absorb is pressing "Hard" instead of "Again" on a forget (produces unreasonably long intervals). — [Anki manual, deck options](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- Duolingo half-life regression (Settles & Meeder, ACL 2016): estimates word half-life in a learner's memory from features; evaluated by MAE, AUC and Spearman correlation of half-life; 13M learning-trace dataset released. — [HLR repo](https://github.com/duolingo/halflife-regression); [paper PDF](https://research.duolingo.com/papers/settles.acl16.pdf)

### Inferences
- The spacing effect itself is robust; the specific *shape* of the schedule (expanding vs uniform) matters far less than (a) doing retrieval rather than re-study, and (b) having enough retrieval episodes. A product should optimise number-of-successful-retrievals-per-item and lag, not fetishise a particular interval multiplier.
- FSRS-6/7 is the practical frontier for a per-learner scheduler at 17–34 parameters; the ~0.03–0.06 log-loss gap to GRU/RWKV is real but requires orders of magnitude more parameters and cross-user training, and RWKV's advantage is on Anki-population data (selection bias). A single-learner Japanese app should start with FSRS defaults (already ≥ SM-2/HLR/Ebisu per the benchmark) and optimise per user after a few hundred reviews.
- Because the benchmark uses only Anki users and excludes same-day reviews in the headline table, absolute log-loss values will not transfer to a different UI; only rank order should be assumed.
- HLR's poor benchmark score (0.4694, near Ebisu) plus its Duolingo-specific features suggests it should not be the model of choice for a new product despite being "language-specific".

### Gaps
- Could not retrieve the actual effect sizes from Kim & Webb 2022 (spaced vs massed, long vs short lag, expanding vs equal) — only the qualitative "medium-to-large" characterisation.
- Could not retrieve Settles & Meeder's numeric results (MAE/AUC vs Leitner/Pimsleur) nor their A/B engagement outcomes.
- No FSRS benchmark is Japanese-specific; there is no published evidence on whether kanji/vocabulary/grammar cards need different parameters (Anki presets per deck are the usual workaround). **[unverified]**
- No peer-reviewed evaluation of FSRS in a controlled learning-outcome (proficiency) study was found; all evidence is predictive accuracy on logs, not transfer to proficiency.
- Direction-of-card effects on FSRS parameters (JP→EN vs EN→JP) not benchmarked.

---

## KQ2. Knowledge tracing (BKT, DKT, IRT/Elo, graph-based): what is practical for a single learner with sparse data; cold-start and calibration; language-learning results

### Takeaway
For a single learner with sparse data, simple models (Elo/IRT-style logistic models, BKT, half-life or FSRS-style memory models) are practical and competitive; deep KT (DKT/DKVMN/attention/graph KT) needs population-scale data and still degrades badly in the first interactions with a new student. The best published language-learning-specific KT results (Duolingo data) come from memory-model hybrids, not vanilla DKT.

### Cited Findings
- **[SINGLE]** Cold-start study (2025): all KT models "show initial difficulty in accurately predicting knowledge states for new students"; DKVMN adapts fastest with minimal data; DKT improves steadily as interactions accumulate. Cold start defined as limited total data or short per-student sequences. [snippet-only] — [arXiv 2505.21517](https://arxiv.org/html/2505.21517)
- **[SINGLE]** Variational DKT on Duolingo language data (LAK 2021): Duolingo's HLR achieved the best MAE; VDKT outperformed standard DKT and prior SOTA on MAE and AUC simultaneously. [snippet-only] — [Ruan et al. LAK21](https://dl.acm.org/doi/fullHtml/10.1145/3448139.3448170)
- Elo rating in adaptive education (Pelánek 2016, *Computers & Education*; Pelánek et al. 2017 *UMUAI* "Elo-based learner modeling for the adaptive practice of facts"): person and item ratings updated by a simple formula after each interaction; popular because of simplicity and computational efficiency; deployed at scale for fact practice (geography). — [Pelánek 2016](https://www.researchgate.net/publication/299590303_Applications_of_the_Elo_Rating_System_in_Adaptive_Educational_Systems); [Pelánek et al. 2017](https://www.semanticscholar.org/paper/Elo-based-learner-modeling-for-the-adaptive-of-Pel%C3%A1nek-Papousek/5e6616b8b5341c95ff1217fe5361ad1529bbc33d)
- **[SINGLE]** Enhanced Elo (EELO) for polytomous items outperformed IRT and BKT extensions on assessment datasets. [snippet-only] — [EELO](https://www.researchgate.net/publication/356827908_An_enhanced_Elo-based_student_model_for_polychotomously_scored_items_in_adaptive_educational_system)
- Multidimensional Elo extensions evaluated for tracking ability in online learning (EDM 2025); Elo psychometrics at large scale (2025). — [EDM 2025](https://educationaldatamining.org/EDM2025/proceedings/2025.EDM.long-papers.99/index.html); [Psychometrics of Elo](https://www.sciencedirect.com/science/article/pii/S2666920X25000165)
- "Modeling language learning using specialized Elo ratings" (Duolingo-adjacent work) exists. — [Academia.edu](https://www.academia.edu/42680116/Modeling_language_learning_using_specialized_Elo_ratings)
- LLM-integrated KT (2024–25) claims improvements by feeding item text / difficulty into KT; these are population-trained models. — [arXiv 2406.02893](https://arxiv.org/pdf/2406.02893); [arXiv 2502.19915](https://arxiv.org/pdf/2502.19915)
- Graph-based KT (relation-aware, forgetting-aware) exists but was evaluated on non-language datasets. — [arXiv 2304.03945](https://arxiv.org/pdf/2304.03945); domain-generalisable KT [arXiv 2407.02547](https://arxiv.org/pdf/2407.02547)
- Anki/FSRS empirical minimum: parameter optimisation unreliable below "a few hundred" reviews; defaults still beat SM-2-class heuristics (KQ1). — [Anki manual](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md); [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)

### Inferences
- For a single-learner Japanese app: use an Elo/IRT-style logistic model for *item difficulty and learner ability per skill* (fast, no training set, tolerant of sparse data, interpretable) combined with FSRS-style per-item memory state for *when* to review. This mirrors the benchmark finding that a 34-parameter logistic regression is within 0.005 log loss of FSRS-7 and near the deep models.
- Cold start: seed item difficulty from priors (frequency rank, JLPT level, kanji stroke count/component count, word length) and seed learner ability from a short adaptive placement; the KT literature shows even the best neural models are unreliable for the first tens of interactions, so a designed placement test is worth more than a smarter model.
- Calibration matters as much as ranking: FSRS-style models are evaluated on log loss/RMSE(bins) precisely because a scheduler acts on probabilities; deep KT papers mostly report AUC only, so their calibration for scheduling is unknown.
- Graph KT is attractive for Japanese (kanji→vocab→grammar prerequisites) but no language-learning evaluation was found; treat as speculative.

### Gaps
- No numeric AUC figures from the 2025 cold-start paper could be retrieved.
- No published head-to-head of BKT vs Elo vs FSRS on Japanese-learner data.
- Duolingo's "Birdbrain" model description not retrievable in this session. **[unverified: prior knowledge says it is a logistic-regression/IRT-style model trained at population scale]**
- Sparse-data guidance in KT literature is largely from math/ITS datasets (ASSISTments, EdNet), not L2.

---

## KQ3. Evidence for "i+1" and coverage-based text selection (95–98% known-word coverage)

### Takeaway
Krashen's i+1 is not operationalisable and is widely judged unfalsifiable; what is empirically supported is the *lexical coverage* literature, which shows a monotonic (probably roughly linear) relationship between known-word coverage and comprehension, with 95% as a commonly cited floor for minimally adequate reading and 98% for comfortable/independent reading — though recent replications find no sharp threshold. For Japanese, corpus work implies far more lexemes are needed for the same coverage than in English (≈9,500 lexemes for 95%, ≈20,000 for 98%).

### Cited Findings
- **[SINGLE, classic]** Hu & Nation (2000) proposed 98% as the coverage at which most learners can read adequately and 95% as the coverage for minimally acceptable comprehension; Laufer (1989) found adequate comprehension (≥55% on the test) at 95%. — summarised in [Laufer & Ravenhorst-Kalovski 2010 (ERIC EJ887873)](https://files.eric.ed.gov/fulltext/EJ887873.pdf)
- **[REPL]** Schmitt, Jiang & Grabe (2011) and Hu & Nation (2000) support ~98% for adequate comprehension. — [same source](https://files.eric.ed.gov/fulltext/EJ887873.pdf)
- **[REPL]** Laufer (2020, *Reading in a Foreign Language*, "Lexical coverage and reading comprehension revisited") extended Hu & Nation with 90/95/98% versions of the same text and the same MC test and did **not** find significant comprehension differences among 90%, 95%, and 98%. [snippet-only] — [RFL / ScholarSpace](https://scholarspace.manoa.hawaii.edu/bitstreams/be187723-ba8b-433c-9472-b3b4ac847b86/download)
- **[REPL]** Kremmel, Brunfaut & Alderson (2023, *Language Learning*) published a replication of Hu & Nation (2000) on unknown-vocabulary density and comprehension. Results not captured. — [Kremmel et al. 2023](https://onlinelibrary.wiley.com/doi/10.1111/lang.12622)
- **[SINGLE]** Eye-tracking study on how lexical coverage affects *processing* of L2 texts (Applied Linguistics 2024). — [Applied Linguistics 45(6)](https://academic.oup.com/applij/article/45/6/953/7841943)
- **[SINGLE]** Lexical coverage in L1/L2 *viewing* (video) comprehension (SSLA) and vocabulary–viewing comprehension relationship. — [SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/lexical-coverage-in-l1-and-l2-viewing-comprehension/DFCA6605076705D5762C98F286D16B27); [System 2019](https://www.sciencedirect.com/science/article/abs/pii/S0346251X19300703)
- **[SECONDARY]** Practitioner synthesis arguing input should be 95–98% comprehensible, restating the above research. — [Conti 2025](https://gianfrancoconti.com/2025/02/27/why-the-input-we-give-our-learners-must-be-95-98-comprehensible-in-order-to-enhance-language-acquisition-the-theory-and-the-research-evidence/)
- **Japanese-specific:** Matsushita (2014) corpus figures: ~9,500 lexemes for 95% token coverage of written Japanese, ~20,000 lexemes for 98%; "lexeme" used because word boundaries are ill-defined in agglutinative Japanese. [SECONDARY restatement] — [Mikey Does summary](https://mikeydoes.com/articles/vocabulary-size-japanese-comprehension/); the Aozora repository study for L2 Japanese extensive reading uses the 95% / 3,000–9,500-word band to define intermediate-suitable texts — [System 2024](https://www.sciencedirect.com/science/article/pii/S0346251X2400349X)
- Direct coverage studies for Japanese are "less numerous than for English"; Sato (2014) found the proportion of high-frequency words to tokens is lower in Japanese than in English (more vocabulary needed for equal coverage, and more genre variation); Tono, Yamazaki & Maekawa (2013) provide a 100M-word-corpus frequency list (closest analogue to Nation's BNC lists); the "word family" unit does not map cleanly onto Japanese (Sino-Japanese compounding, multiple readings, script). — [je-dict-1 research note (secondary, cites primary)](https://github.com/tkgally/je-dict-1/blob/main/planning/wiki/research/vocabulary-size-coverage.md)
- **Krashen critique:** the Input Hypothesis is "the most criticized major hypothesis in SLA" for unfalsifiability (i+1 is defined relative to an unmeasurable i; Gregg 1984); Swain's Output Hypothesis (1985) showed learners with extensive comprehensible input still had gaps that only surfaced in production; a 2025 neuro-ecological critique (Nguyen & Doan, *Frontiers in Psychology*) argues converging evidence supports language development as active, interactive, feedback-driven and multimodal rather than input-only. — [Frontiers 2025](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1636777/full); [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12577063/)

### Inferences
- Use coverage as an *engineering proxy* for i+1: choose/generate texts where the learner's known-lexeme coverage is ≥95% for instructional reading and ≥98% for fluency/extensive reading, but treat these as soft targets on a continuous curve, not cliffs (Laufer 2020 found no significant step). Lower coverage is fine when the goal is intentional learning with glossing/support.
- For Japanese the coverage curve is flatter: a learner at N3-ish vocabulary (~3,750 words per secondary estimates) is far below 95% coverage of native text, which explains why graded/generated text and heavy glossing are needed for much longer than in English learning.
- Coverage should be computed on lexemes (with reading+kanji form as separate knowledge dimensions), since a "known" word in kana may be unknown in kanji.

### Gaps
- Could not read Kremmel et al. (2023) results; the shape (linear vs threshold) is contested and the replication's verdict is exactly the missing piece.
- Matsushita's coverage figures are cited only through secondary sources; the primary (Matsushita 2012 thesis / 2014 paper) was not accessible.
- No empirical Japanese study was found linking a specific coverage level to comprehension test scores (all thresholds come from English L2 studies).
- No evidence found for "i+1" grammar sequencing beyond vocabulary coverage.

---

## KQ4. Learning kanji efficiently (Heisig-style keyword mnemonics, component decomposition, writing vs recognition, frequency ordering)

### Takeaway
Component/radical-based analysis is the best-supported strategy family (learners who use component information process unfamiliar kanji better; educators and learners rate it effective), and handwriting appears to strengthen meaning recall and encoding. But rigorous controlled comparisons of Heisig keyword mnemonics vs rote vs frequency ordering are scarce; most "evidence" is pedagogical or survey-based.

### Cited Findings
- **[SINGLE]** English-speaking learners' use of component information when processing unfamiliar kanji (Toyoda et al.): learners can use semantic radicals and phonetic components of new kanji, i.e., component awareness is a usable skill. [snippet-only] — [ResearchGate](https://www.researchgate.net/publication/308977761_English-speaking_learners'_use_of_component_information_in_processing_unfamiliar_kanji)
- **[SINGLE]** Kubota & Toyoda: radical and whole-character analysis were effective for Australian learners. [snippet-only, via review] — [Tackling the Kanji hurdle](https://www.researchgate.net/publication/271258201_Tackling_the_Kanji_hurdle_Investigation_of_Kanji_learning_in_Non-Kanji_background_learners)
- **[SINGLE/survey]** L2 learners' attitudes toward and use of mnemonic strategies for kanji (Rose). — [ResearchGate](https://www.researchgate.net/publication/259551232_L2_learners'_attitudes_toward_and_use_of_mnemonic_strategies_when_learning_Japanese_Kanji); educators' strategies/attitudes — [ResearchGate](https://www.researchgate.net/publication/227725530_Japanese_Language_Educators'_Strategies_for_and_Attitudes_toward_Teaching_Kanji)
- **[SINGLE]** Learners' perceptions of kanji learning relate to novel kanji-word learning ability (Mori). — [ResearchGate](https://www.researchgate.net/publication/227892143_Japanese_Language_Students'_Perceptions_on_Kanji_Learning_and_Their_Relationship_to_Novel_Kanji_Word_Learning_Ability); role of context and word morphology in learning new kanji words (Mori & Nagy) — [ResearchGate](https://www.researchgate.net/publication/229506125_The_Roles_of_Context_and_Word_Morphology_in_Learning_New_Kanji_Words)
- **[SINGLE]** Paper vs tablet kanji training with inexperienced L2 learners: paper-based writers showed greater recall of the English meaning at post and delayed posttest; neither medium advantaged recall of the Japanese vocabulary. [snippet-only] — [TLTL 3(2) 2021, ERIC EJ1478049](https://files.eric.ed.gov/fulltext/EJ1478049.pdf)
- **[SINGLE]** Handwriting kanji activates left posterior inferior temporal cortex; handwriting's "encoding effect" (effortful letter formation) improves retention; greater engagement of left fusiform and superior parietal areas. [snippet-only] — [PMC11943480](https://pmc.ncbi.nlm.nih.gov/articles/PMC11943480/)
- **[SINGLE]** Web-based automated kanji handwriting test (validated): higher lexical proficiency and higher kanji frequency → faster initiation; more strokes → longer writing; more frequent kanji written more accurately. [snippet-only] — [PMC11685258](https://pmc.ncbi.nlm.nih.gov/articles/PMC11685258/)
- **[SINGLE]** Key factors behind Vietnamese learners' kanji handwriting competence (Frontiers in Language Sciences, 2026) — exists; results not captured. — [Frontiers 2026](https://www.frontiersin.org/journals/language-sciences/articles/10.3389/flang.2026.1705688/full)
- **[REVIEW, Chinese]** Synthetic review of typing vs handwriting in Chinese learning; typing-primary learners produced longer essays with equal character accuracy. [snippet-only] — [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0883035521000100); [TCLT 2021](http://www.tclt.us/journal/2021v12n2/zhangn.pdf)
- **[SINGLE, adjacent]** Keyword method vs rote for English collocations (mixed-methods): keyword method effective, evidence from a non-kanji domain. — [PMC10375987](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10375987/)
- **[SINGLE, HCI]** CHI 2026 LATE-BREAKING: LLM-generated adaptive kanji mnemonics; notes that existing approaches assign semantic or visual keywords to components, and that standardised keyword inventories reduce confusion but limit flexibility. — [ACM CHI EA 2026](https://dl.acm.org/doi/10.1145/3772363.3798551)
- **[SECONDARY]** Heisig's *Remembering the Kanji* (RTK) teaches all components ("primitives") plus an "imaginative memory" story per character, keyword→writing only (no readings in vol. 1). — [Wikipedia](https://en.wikipedia.org/wiki/Remembering_the_Kanji_and_Remembering_the_Hanzi); practitioner claims like "cuts memorisation by 80%" are unsupported marketing — [Tofugu](https://www.tofugu.com/japanese/kanji-radicals-mnemonic-method/)
- **[SINGLE]** Kanji recognition by L2 learners depends on L1 writing system and L2 exposure (Modern Language Journal 2013). — [ERIC EJ1009581](https://eric.ed.gov/?id=EJ1009581)
- **[SINGLE]** Post-study-abroad kanji knowledge; kanji-learning strategies vs language background (2025/26). — [ResearchGate](https://www.researchgate.net/publication/318770316_Post_study_abroad_investigation_of_kanji_knowledge_in_Japanese_as_a_second_language_learners); [ResearchGate](https://www.researchgate.net/publication/400592815_Kanji_learning_strategies_and_language_background_of_L2_Japanese_language_learners)

### Inferences
- Product design should explicitly teach and track *components* (semantic radicals, phonetic components) as first-class knowledge units, because component awareness is the one kanji strategy with convergent (if small-n) support and it generalises to unfamiliar characters.
- Mnemonics are plausibly useful for the *meaning/keyword→form* link (consistent with general keyword-method findings) but there is no rigorous evidence that Heisig's ordering (by component, not frequency) outperforms frequency ordering for reading proficiency; and Heisig defers readings entirely, which conflicts with the JLPT-predictor evidence that kanji-in-vocabulary knowledge drives outcomes (KQ7). A frequency/JLPT-ordered, component-aware sequence with meaning + reading in vocabulary context is the defensible default.
- Handwriting (even finger-tracing on screen) is worth including as an *encoding* activity for meaning retention, not as a mastery criterion; recognition/reading is what proficiency tests measure.

### Gaps
- No randomised or quasi-experimental study comparing Heisig keyword mnemonics vs rote vs component-only instruction on delayed kanji recognition/recall was found.
- No study on frequency ordering vs component ordering for kanji.
- No effect sizes retrieved for any kanji intervention; the field is dominated by strategy surveys and small classroom studies.
- Reading-vs-meaning learning order (on/kun readings first vs meaning first) has no located empirical study. **[unverified]**

---

## KQ5. Productive vs receptive practice for transfer; corrective feedback types (recasts, metalinguistic) in tutoring and LLM tutors

### Takeaway
Intentional word-focused activities (flashcards, lists, writing, fill-in) all work, with productive-recall practice giving the largest gains on productive tests and receptive recall being more time-efficient; test-direction matters (you get what you practise). Corrective feedback is robustly effective in both oral and written modes; direct, indirect and metalinguistic written CF yield similar effects (Bayesian meta-analysis), and explicit/metalinguistic oral CF tends to beat recasts on explicit-knowledge measures. LLM-tutor CF evidence is early (2024–26): recasts that trigger successful learner repair correlate with gains, but LLM feedback accuracy/pedagogy is a documented risk.

### Cited Findings
**Receptive vs productive; activity types**
- **[META]** Webb, Yanagisawa & Uchihara (2020, *MLJ*): meta-analysis of intentional vocabulary-learning activities comparing flashcards, word lists, writing and fill-in-the-blank. [effect sizes not retrieved] — [Webb et al. 2020](https://onlinelibrary.wiley.com/doi/abs/10.1111/modl.12671)
- **[SINGLE]** Receptive vs productive learning of word pairs (Webb): productive recall best for overall gains especially on productive tests; receptive recall better in words learned per minute. [snippet-only] — [ResearchGate](https://www.researchgate.net/publication/249769008_The_Effects_of_Receptive_and_Productive_Learning_of_Word_Pairs_on_Vocabulary_Knowledge); reading vs writing effects on word knowledge — [ResearchGate](https://www.researchgate.net/publication/231938045_Receptive_and_productive_vocabulary_learning_-_The_effects_of_reading_and_writing_on_word_knowledge)
- Nakata & Webb (2017) evaluated common vocabulary exercises; flashcards are common and effective (Nakata 2008, 2011; Nation & Webb 2011). — [Nakata & Webb 2017](https://www.academia.edu/42180185/Nakata_T_and_Webb_S_A_2017_Vocabulary_learning_exercises_Evaluating_a_selection_of_exercises_commonly_featured_in_language_learning_materials)
- **[REVIEW]** Mini-review of digital flashcard studies (Frontiers in Education 2024): flashcards enhance both receptive and productive knowledge. — [Frontiers 2024](https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2024.1496578/full); computer vs smartphone flashcards — [ScienceDirect 2024](https://www.sciencedirect.com/science/article/pii/S2590291124000974)
- **[SINGLE]** Learning-direction/retrieval-format studies: retrieval in the harder (productive) direction pays off on delayed productive tests (see KQ1). — [SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/effects-of-learning-direction-in-retrieval-practice-on-efl-vocabulary-learning/159EE50F4B8835207764FB1B11077F29); [Nakata retrieval formats](https://www.researchgate.net/publication/294443124_Effects_of_retrieval_formats_on_second_language_vocabulary_learning)
- **[META]** Incidental vocabulary learning meta-analysis (Language Teaching) exists for the input side. — [Cambridge](https://www.cambridge.org/core/journals/language-teaching/article/how-effective-is-second-language-incidental-vocabulary-learning-a-metaanalysis/E38E3468FD2090B1FA3051051DE8E70C)
- **[SINGLE, interleaving]** Hwang (2025, *Language Learning*): interleaved practice alone harmed intentional L2 vocabulary learning for low-achieving adolescents; initial blocked practice needed before interleaving ("undesirable difficulty" below a prior-knowledge threshold). [snippet-only] — [Hwang 2025](https://onlinelibrary.wiley.com/doi/10.1111/lang.12659); interleaving + rest study (2025) — [ResearchGate](https://www.researchgate.net/publication/393034649_The_effects_of_interleaving_and_rest_on_L2_vocabulary_learning)
- Output Hypothesis (Swain 1985): input-only learners retained production gaps (see KQ3 critique source). — [Frontiers 2025](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1636777/full)

**Corrective feedback**
- **[META]** Brown, Liu & Norouzian (Bayesian meta-analysis of written CF, *Language Teaching Research*, online 2023/print 2026): 52 controlled primary studies; direct, indirect and metalinguistic feedback yielded similar effect sizes; first meta-analysis to separate short-, medium-, and long-term effects. [snippet-only] — [Brown et al.](https://dx.doi.org/10.1177/13621688221147374)
- **[META]** Technique × timing meta-analysis for specific grammatical features (2020): e.g., for the conditional, direct feedback d = 2.76 vs metalinguistic d = 2.67 (very large, within-study designs). [snippet-only] — [Springer Open 2020](https://link.springer.com/article/10.1186/s40862-020-00097-9)
- **[META]** Earlier WCF meta-analysis (TESL-EJ 2020). — [TESL-EJ](https://tesl-ej.org/wordpress/issues/volume24/ej95/ej95a3/); Li (2010) CF meta-analysis in SLA — [ResearchGate](https://www.researchgate.net/publication/229940242_The_Effectiveness_of_Corrective_Feedback_in_SLA_A_Meta-Analysis)
- **[SINGLE]** Lira-Gonzales et al. (2024): oral recast vs oral metalinguistic vs written direct vs written metalinguistic CF on 3rd-person -s; no overall oral-vs-written difference, but differences by measure type (explicit vs implicit knowledge) and CF subtype. [snippet-only] — [LTR 2024](https://journals.sagepub.com/doi/10.1177/13621688241248440)
- **[SINGLE]** Explicit vs implicit oral CF study (ERIC 2025). — [ERIC EJ1472386](https://files.eric.ed.gov/fulltext/EJ1472386.pdf)

**LLM / chatbot tutors**
- **[SINGLE]** "Personalized Language Learning With an LLM Chatbot: Effects of Immediate vs. Delayed Corrective Feedback" (2025) — little prior evidence on how CF should be timed in LLM chat; study compares immediate vs delayed CF. [results not retrieved] — [ResearchGate](https://www.researchgate.net/publication/391485619_Personalized_Language_Learning_With_an_LLM_Chatbot_Effects_of_Immediate_vs_Delayed_Corrective_Feedback)
- **[SINGLE]** LLT study: learners' successful repair after AI-chatbot corrective recasts correlated positively with learning gains; noticeability of chatbot CF is key. [snippet-only] — [Language Learning & Technology](https://www.lltjournal.org/item-detail/1132/)
- **[SINGLE]** LLM-as-tutor in EFL writing: evaluation of student–LLM interaction. — [arXiv 2310.05191](https://arxiv.org/pdf/2310.05191)
- LLM tutors "might exhibit notable weaknesses, such as the generation of erroneous feedback and a lack of pedagogical nuance without careful design"; automated evaluation of LLM feedback is immature (Dean of LLM Tutors 2025; TUTORBENCH 2025). — [arXiv 2508.05952](https://arxiv.org/html/2508.05952v1); [Training LLM tutors to improve outcomes in dialogues](https://arxiv.org/html/2503.06424v1)
- 2026 preprints: "Can LLMs replace language teachers?" (clause-level grammar) and micro-level feedback features in consecutive LLM tutoring interactions. — [arXiv 2608.16286](https://arxiv.org/pdf/2608.16286); [arXiv 2607.08952](https://arxiv.org/pdf/2607.08952)

### Inferences
- Design rule: practice the retrieval direction you want to transfer. Receptive-only flashcards (JP→meaning) will not reliably produce speaking/writing ability; include JP production (meaning→JP, cloze in sentence, spoken recall) for items intended for output, accepting lower items/minute.
- Interleave only after initial blocked exposure for new/low-knowledge items; interleaving is a "desirable difficulty" only above a knowledge floor (Hwang 2025).
- For an LLM tutor: CF type matters less than *noticing and repair*. Design feedback so that (a) the learner is prompted to repair (uptake), (b) metalinguistic explanation is available on demand, (c) feedback correctness is verified (rule-based grammar/reading checks, JLPT-graded lexicon) because LLM-generated CF errors are documented. Log repair success as a learning signal.

### Gaps
- Could not obtain effect sizes from Webb et al. (2020) or from Kim & Webb.
- No meta-analysis of *transfer* from flashcard learning to reading/listening comprehension was found; evidence is indirect (coverage → comprehension).
- LLM-tutor CF studies are single, small, mostly EFL/writing; nothing Japanese-specific and nothing on spoken-dialogue CF accuracy for Japanese (particles, keigo, pitch).
- Results of the immediate-vs-delayed LLM CF study not retrieved.

---

## KQ6. Pitch accent and pronunciation: does explicit training with feedback improve perception/production, and what tools are used?

### Takeaway
Pronunciation instruction in general is effective (d ≈ 0.8–0.9 across 86 studies), with larger effects when feedback is given and interventions are longer; ASR-based feedback has a medium effect (g ≈ 0.69), stronger for segmentals than suprasegmentals. Japanese pitch accent specifically: identification training with immediate feedback produces small but generalisable perception gains; the unaccented pattern is hardest; digital programs (PALP) and multimodal (auditory+visual+gesture) training show learning, but effect sizes are small-sample.

### Cited Findings
- **[META]** Lee, Jang & Plonsky (2015, *Applied Linguistics*): 86 reports; pronunciation instruction d = 0.89 (within) and 0.80 (between; 95% CI [.77, .81]); larger effects for longer interventions, treatments providing feedback, and more controlled outcome measures. — [Applied Linguistics 36(3)](https://academic.oup.com/applij/article/36/3/345/2422438)
- **[META]** Saito & Plonsky (2019) revisited with a measurement framework. — [Language Learning](https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12345)
- **[META]** ASR in ESL/EFL pronunciation (ReCALL): overall g = 0.69; ASR with explicit corrective feedback largely effective, indirect feedback moderately; large effect on segmentals, small on suprasegmentals. [snippet-only] — [ReCALL](https://www.cambridge.org/core/journals/recall/article/effectiveness-of-automatic-speech-recognition-in-eslefl-pronunciation-a-metaanalysis/A915444CF252B61D14961D2FE733822D)
- **[REVIEW]** Systematic review of shadowing for L2 pronunciation (2025). — [Taylor & Francis](https://www.tandfonline.com/doi/full/10.1080/29984475.2025.2546827)
- **[SINGLE]** Shport (SSLA): English listeners trained on three Tokyo-Japanese pitch patterns (initial-accented, second-accented, unaccented) with a 3AFC identification task and immediate feedback over three sessions; small training effect that generalised to new stimuli in new sentence contexts by a familiar talker; the unaccented pattern is a novel category with high native variability and is the hardest. [snippet-only] — [SSLA](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/training-english-listeners-to-identify-pitchaccent-patterns-in-tokyo-japanese/262669390D4A27BB3A35F1A9200944C6)
- **[SINGLE]** PALP (Pitch Accent Learning and Practice) digital program: presents patterns visually and aurally, learner selects correct pattern for new vocabulary; treatment n = 20 vs control n = 8 (traditional study); examined L1 influence. [snippet-only; results not retrieved] — [PLSA proceedings](https://journals.linguisticsociety.org/proceedings/index.php/PLSA/article/download/4276/3884/6268)
- **[SINGLE]** Multimodal training (auditory, visual, gestural) of L2 Japanese pitch accent with behavioural, neural and metacognitive outcomes (*Language and Cognition*). [results not retrieved] — [Cambridge](https://www.cambridge.org/core/journals/language-and-cognition/article/multimodal-training-on-l2-japanese-pitch-accent-learning-outcomes-neural-correlates-and-subjective-assessments/AB2195C963F348823C8175220F9F9EA1)
- **[SINGLE]** Muradás-Taylor (2022): accuracy and *stability* of English speakers' production of Japanese pitch accent. — [Language and Speech](https://journals.sagepub.com/doi/10.1177/00238309211022376); UCL thesis on production, perception and teaching — [UCL Discovery](https://discovery.ucl.ac.uk/id/eprint/10101809/); Sugita on American learners — [Perspectivia](https://perspectivia.net/servlets/MCRFileNodeServlet/pnet_derivate_00001049/165-187_ACQUISITION-OF-JAPANESE-PITCH-ACCENT-BY-AMERICAN-LEARNERS_43-Heinrich_Sugita-11.pdf)
- **[SINGLE]** Interactive visual (pitch-contour) feedback improved intonation for Japanese EFL learners (reverse direction, but same tool class). — [Academia.edu](https://www.academia.edu/92518048/Effect_of_interactive_visual_feedback_on_the_improvement_of_English_intonation_of_Japanese_EFL_learners)

### Inferences
- Explicit pitch-accent training is worth building but expectations should be modest: perception identification with immediate feedback and a categorical visual display (pattern name + contour) is the evidence-backed core; production feedback via pitch tracking is plausible by analogy with ASR/visual-feedback findings but unproven for Japanese pitch.
- Prioritise the unaccented (heiban) vs accented contrast and minimal pairs; expect slower learning for heiban.
- Because ASR/pronunciation effects are larger for segmentals than suprasegmentals, a Japanese product should not over-promise pitch-accent production gains and should measure perception and production separately.

### Gaps
- No effect sizes retrieved for any Japanese pitch-accent training study; sample sizes are small (n ≈ 20–30).
- Tools: studies name custom programs (PALP), 3AFC training software, and visual feedback; use of OJAD/Praat/pitch trackers in controlled studies could not be verified in this session. **[unverified: OJAD is commonly used in teaching]**
- No study on long-term retention of trained pitch perception or transfer to spontaneous speech.

---

## KQ7. What predicts JLPT success; JLPT ↔ CEFR / JF Standard Can-do mapping

### Takeaway
The only located predictor study (single, regional journal) finds kanji and grammar the strongest individual predictors, with kanji+grammar+reading+listening explaining ~73% of pass/fail variance. Officially, from December 2025 JLPT score reports carry a CEFR reference level (A1–C1) derived from expert judgment of Reading/Listening items and cut scores on the total score — i.e., a linking study, not a claim of equivalence for speaking/writing. Pass rates run ~50% at N5 and ~29–36% at N4–N1.

### Cited Findings
- **[SINGLE]** "Evidence-Based Predictors of JLPT Success" (JOLLT): SEM + binary logistic regression; kanji, grammar (bunpō), reading (dokkai), listening (chōkai) jointly explained 73.4% of variance; model classified 95% of cases (88% of failures, 98% of passes); when entered simultaneously only kanji and grammar were significant. [snippet-only; sample/level not retrieved] — [JOLLT](https://ojspanel.undikma.ac.id/index.php/jollt/article/view/17552)
- **[SINGLE]** Cognitive underpinnings of multidimensional Japanese literacy and its impact on higher-level skills (PMC 2021) — literacy components predict higher-level Japanese skills. — [PMC7838263](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7838263/)
- **Official CEFR link:** from the December 2025 test, JLPT score reports include a CEFR level for reference; CEFR levels A1–C1; experts judged the CEFR level of Reading and Listening items at each N-level, and cut scores on the JLPT *total* score were set from those judgments. — [JLPT: Indication of the CEFR level](https://www.jlpt.jp/e/about/cefr_reference.html); [Japan Foundation notice](https://www.jpf.go.jp/e/project/japanese/teach/tsushin/news/202601.html)
- Japan Foundation's *Marugoto* series is built on the JF Standard (CEFR-based Can-do). — [Wikipedia JLPT](https://en.wikipedia.org/wiki/Japanese-Language_Proficiency_Test); JV-Campus level check tool — [jv-campus](https://www.jv-campus.org/en/nihongo-hiroba/level-check/)
- **[SECONDARY, citing JF/JEES]** 2025 worldwide pass rates: N5 50.5%, N4 35.6%, N3 34.4%, N2 33.4%, N1 28.9%; 2024: overseas pass rates higher than in-Japan at N3–N1 (N2 38.7% overseas vs 26.4% in Japan; N1 31.7% vs 24.3%). — [JLPT Mastery](https://jlptmastery.com/blog/jlpt-pass-rates-by-level); [JLPT Sensei](https://jlptsensei.com/jlpt-info/jlpt-pass-rate-statistics/); official archive — [jlpt.jp 2024 July data](https://www.jlpt.jp/e/statistics/archive/202401.html)
- **[SECONDARY]** Pass marks: N5 80, N4 90, N3 95, N2 90, N1 100 (of 180), with sectional minimums. — [nihongopass](https://nihongopass.com/jlpt/scoring)
- **[SECONDARY]** Study-hour estimates: N1 ≈ 1,700–2,600 h with kanji background vs ≈ 3,000–4,800 h without; kanji-background learners need ~30–50% fewer hours. — [Coto Academy](https://cotoacademy.com/study-hours-needed-pass-jlpt-comparison-levels/); CEFR-hour estimates for Japanese: B1 ≈ 720 h cumulative, B2 ≈ 1,320 h — [nihongo-career](https://nihongo-career.com/tips/2026/05/24/how-many-hours-reach-cefr-level-japanese/); JFT-Basic (A1–A2) ≈ 150–200 h — [NihongoDoya](https://nihongodoya.com/jft-study-roadmap)
- **[SECONDARY]** Approximate vocabulary/kanji per level: N5 ≈ 800 words/100 kanji; N1 ≈ 10,000 words/2,000 kanji (no official lists since 2010). — [Japan Living Life](https://japanlivinglife.com/articles/jlpt-levels-explained); je-dict-1 estimates N3 ≈ 3,750, N2 ≈ 6,000, N1 ≈ 10–12k — [je-dict-1](https://github.com/tkgally/je-dict-1/blob/main/planning/wiki/research/vocabulary-size-coverage.md)

### Inferences
- A JLPT-oriented engine should weight kanji-in-context and grammar-pattern mastery heavily in its learner model, since these were the significant unique predictors; reading and listening gains appear largely mediated by them in that model.
- The CEFR link only covers reading/listening; a product that claims "B1" on the basis of JLPT-style items must not imply speaking/writing ability — align speaking/writing goals to JF Standard Can-do descriptors instead.
- Pass rates ≈ 1/3 at N4–N1 imply many candidates sit under-prepared; a predictive "readiness" estimate (ability vs cut score) is a valuable product feature, and the official sectional minimums mean the model must track sections separately.

### Gaps
- The precise CEFR cut scores per N-level (which total scores map to which CEFR level) were not retrievable (jlpt.jp blocked).
- The JOLLT predictor study's sample, level and country were not retrievable; it is a single study in a regional journal — treat as weak.
- No longitudinal study linking spaced-repetition app usage or extensive reading volume to JLPT outcomes was found.
- All study-hour and vocabulary-size figures are secondary estimates; JF's own official hour guidance for the current test was not retrievable.

---

## KQ8. Known failure modes of adaptive systems (over-fitting to easy items, motivation loss, leeches, gaming)

### Takeaway
The ITS literature documents three well-replicated failure modes: gaming the system (hint abuse/rapid guessing; gamers learn ~2/3 as much), wheel-spinning (persistent failure to reach mastery, cognitive rather than motivational, correlated with confusion and gaming), and practice avoidance/coasting. SRS-specific failure modes are documented operationally rather than experimentally: leeches (Anki default: 8 lapses → tag + suspend), workload explosion as desired retention → 100%, and mis-grading (Hard instead of Again) corrupting the model.

### Cited Findings
- **[SINGLE, replicated program]** Gaming the system (Baker et al.): students who frequently game learn only about 2/3 as much as similar non-gamers; gaming = systematic guessing or hint abuse; detectable from logs; specific design features make gaming more/less likely. — [Baker, Corbett & Koedinger ITS 2004](http://pact.cs.cmu.edu/koedinger/pubs/Baker,%20Corbett,%20Koedinger%20ITS04.pdf); [generalisable detector, UMUAI 2008](https://link.springer.com/article/10.1007/s11257-007-9045-6); [predictors and impacts](https://www.researchgate.net/publication/220116347_An_analysis_of_students%27_gaming_behaviors_in_an_intelligent_tutoring_system_Predictors_and_impacts); [adapting to gaming](https://www.researchgate.net/publication/221413987_Adapting_to_When_Students_Game_an_Intelligent_Tutoring_System)
- **[SINGLE, replicated program]** Wheel-spinning (Beck & Gong): substantial time on a skill without reaching mastery; positively correlated with gaming and confusion, negatively with flow, uncorrelated with boredom; "primarily cognitive in nature and not related to student motivation"; associated with help avoidance; early detection feasible in ASSISTments. — [Wheel-Spinning](https://www.researchgate.net/publication/290777423_Wheel-Spinning_Students_Who_Fail_to_Master_a_Skill); [affective factors](https://link.springer.com/chapter/10.1007/978-3-319-07221-0_20); [early detection](https://link.springer.com/chapter/10.1007/978-3-030-52237-7_46); [productive persistence in games](https://files.eric.ed.gov/fulltext/ED599202.pdf)
- **[SINGLE, 2026]** "Coasting": learning-opportunity loss from practice avoidance during individual seatwork. — [arXiv 2604.25014](https://arxiv.org/pdf/2604.25014)
- **[POSITION, 2026]** "AIED's Unfinished Mission": in the age of "effortless bypass" (LLMs), agency and motivation must be centred; students can bypass effort entirely. — [arXiv 2607.05557](https://arxiv.org/pdf/2607.05557)
- **[SINGLE, 2026]** Think-aloud analysis of gaming vs self-regulated learning. — [arXiv 2601.04487](https://arxiv.org/html/2601.04487)
- **Leeches (operational):** Anki tags a note as a leech and suspends the card when its lapse counter reaches 8 (default; re-warns every 4 lapses); recommended handling = edit the card (too much content / learned without understanding), delete it, or wait (suspend interfering similar cards until one is mastered). — [Anki manual: leeches](https://github.com/ankitects/anki-manual/blob/main/src/leeches.md)
- **Workload/retention:** workload rises exponentially with desired retention; >90% "very quickly", >97% "overwhelming"; FSRS default 90%. Mis-grading (Hard for a forget) yields unreasonably high intervals. Few hundred reviews needed before per-user optimisation is trustworthy. — [Anki manual: deck options](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- **Metric gaming in schedulers:** the SRS benchmark includes an "RMSE-BINS-EXPLOIT" entry showing the calibration metric can be gamed (4.608 log loss while exploiting bins) — a caution for anyone optimising a scheduler to a single metric. — [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)
- Selection bias caveat: the largest SRS evidence base is self-selected Anki users, so dropout/motivation effects of scheduling are unobserved. — [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark)

### Inferences
- Build detectors for: rapid-guess/"Again-spam", hint abuse, self-grade inflation (systematic "Good" with later lapses — checkable because FSRS predictions become mis-calibrated per user), leeches (lapse counters), and wheel-spinning (a skill with many attempts and flat Elo/mastery). Respond with item rewrite (leech), prerequisite remediation (wheel-spinning), or forced-recall formats instead of self-grading (gaming).
- "Over-fitting to easy items" is not a named construct in the literature I found; the closest are (a) adaptive systems that keep success rate too high (Pelánek's Elo work tunes a target success rate) and (b) the desirable-difficulty result in FSRS's third law (lower retrievability at review → bigger stability gain). Design implication: target retrievability ≈ 0.85–0.9, not 0.95+, and audit the difficulty distribution of items served.
- Motivation loss is under-measured in SRS research (Anki data cannot see quitters); product analytics must track retention of *users*, not only retention of *items*.

### Gaps
- No experimental study on leech handling strategies or on the learning cost of leeches.
- No published dropout/motivation study specifically of FSRS-scheduled review load; Duolingo's A/B results on HLR engagement could not be retrieved.
- Gaming/wheel-spinning findings are from math ITS (Cognitive Tutor, ASSISTments); no language-learning replication located.

---

## Additional mechanisms requested (extensive reading; listening; testing effect; interleaving/desirable difficulties)

### Takeaway
Extensive reading has consistent medium effects on reading proficiency (d ≈ 0.46 vs controls, 0.71 pre/post; 34 studies, N = 3,942) and captioned video has large effects on listening and vocabulary; these are the input-side complements to retrieval practice. Interleaving is beneficial only above a knowledge floor.

### Cited Findings
- **[META]** Nakanishi (2015, *TESOL Quarterly*): 34 studies, 43 effect sizes, N = 3,942; ER groups d = 0.71 pre→post and d = 0.46 vs control on reading proficiency (speed, comprehension, vocabulary, grammar). — [Nakanishi 2015](https://onlinelibrary.wiley.com/doi/10.1002/tesq.157)
- **[META]** Jeon & Day (2016) ER meta-analysis (reading proficiency). — [ERIC EJ1117026](https://files.eric.ed.gov/fulltext/EJ1117026.pdf); ER effects on vocabulary meta-analysis — [ERIC EJ1179114](https://files.eric.ed.gov/fulltext/EJ1179114.pdf)
- **[META, 2025]** "Learning a Language Through Reading" (*Educational Psychology Review* 2025): newest ER meta-analysis across L2 outcomes. [effect sizes not retrieved] — [Springer](https://link.springer.com/article/10.1007/s10648-025-10068-6)
- **[SINGLE, Japanese]** Aozora Bunko repository evaluated as a source for L2 Japanese reading development/ER using 95%-coverage bands. — [System 2024](https://www.sciencedirect.com/science/article/pii/S0346251X2400349X)
- **[META]** Montero Perez et al. (2013, *System*): 18 studies; captions had a large effect on listening comprehension (15 studies) and vocabulary learning (10 studies); test type moderated listening effects; proficiency did not moderate. — [System 2013](https://www.sciencedirect.com/science/article/abs/pii/S0346251X13001012)
- **[META]** Subtitles in L2 classrooms meta-analysis (2023). — [MDPI Education 13(3)](https://www.mdpi.com/2227-7102/13/3/274)
- **[SINGLE]** Bilingual subtitles eye-tracking (SSLA): L1 subtitles beat L2 captions for content comprehension in this study, prior vocabulary knowledge predicted comprehension (especially with captions) — contradicts other studies where captions beat subtitles. — [SSLA](https://cambridge.org/core/journals/studies-in-second-language-acquisition/article/examining-the-effectiveness-of-bilingual-subtitles-for-comprehension-an-eyetracking-study/D3E6D4CDE5C5023CE085E95CA4D18ACE); captioned video and L2 speech segmentation — [RFL](https://scholarspace.manoa.hawaii.edu/bitstreams/97a26308-1393-48cb-a150-b9e24a182200/download)
- Testing effect / desirable difficulties: covered in KQ1 (Latimier 2021 g = 0.74 spaced retrieval; retrieval + feedback > restudy) and KQ5 (Hwang 2025 interleaving floor).

### Inferences
- A proficiency-raising system needs an input loop (graded/generated reading at ≥95% coverage; captioned audio/video) feeding the retrieval loop (SRS), with words met in input entering the scheduler — the two literatures are complementary and neither alone is sufficient.
- Captions (L2 text) are the evidence-backed default for listening practice; L1 subtitles help content comprehension but are weaker for form learning.

### Gaps
- No Japanese-specific ER or captioning meta-analysis; effect sizes are from EFL populations.
- No study on generated (LLM) graded text vs human graded readers for L2 Japanese.
- Listening strategy-instruction meta-analyses and speech-rate manipulation studies were not reached.
