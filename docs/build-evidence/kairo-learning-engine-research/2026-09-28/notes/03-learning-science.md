# Track 03 — Learning science for L2 Japanese

Research cutoff and access date: **2026-09-28**. External findings below are cited to primary research, original research syntheses, or official documentation. `PROPOSED` denotes a design choice, not an empirically established effect. `UNVERIFIED` means the requested evidence was not obtained. Publication dates are given at the precision the source supports; an undated live page is not proof of historical availability.

## Takeaway

Build repeated retrieval, delayed independent probes, and modality-specific evidence into the product. FSRS-6 predicts recall for scheduled cards; it does not validate a Japanese proficiency claim. Keep reading, listening, lexical recall, handwriting, and spontaneous production distinguishable. Use the graph to choose diagnostic opportunities and explain uncertainty, not to fabricate mastery from conversational fluency. These are **PROPOSED engineering inferences** from the findings below and the owner's laws.

The strongest broadly replicated foundation is spacing plus retrieval. Direct Japanese evidence is narrower: pitch and kanji studies often measure trained-item performance, convenience samples, self-reports, or short follow-up. Lexical coverage is useful descriptive information but a fixed coverage percentage is not a comprehension guarantee. No causal evidence identified establishes that Bunki's proposed whole-app adaptation will outperform its competitors.

## Cited findings

### 1. Retrieval and spacing: quantitative foundation

| Evidence | Verified numerical result | Population/outcome and limitation |
|---|---|---|
| Yang et al., classroom retrieval meta-analysis | **Hedges g = 0.499**; **222 independent studies**, **48,478 students** | Classroom academic achievement, heterogeneous subjects and controls; not an L2-Japanese or FSRS effect. Publication **2021-04**, DOI [10.1037/bul0000309](https://doi.org/10.1037/bul0000309); author's institutional record [HKBU](https://scholars.hkbu.edu.hk/en/publications/testing-quizzing-boosts-classroom-learning-a-systematic-and-meta-/); accessed **2026-09-28**. |
| Latimier, Peyre & Ramus, spaced retrieval meta-analysis | Spaced vs massed retrieval **g = 0.74**; expanding vs uniform spacing **g = 0.034**, not significant; **29 studies**, **39** and **54 effect sizes** in the respective subsets | Final retention, varied materials; evidence for spacing, not evidence that one precise algorithm is universally optimal. Published online **2020-10-07**, volume **2021**; [publisher](https://link.springer.com/article/10.1007/s10648-020-09572-8); accessed **2026-09-28**. |
| Kim & Webb, L2 spacing meta-analysis | **48 experiments**, **N = 3,411**, **98 effect sizes** | Immediate and delayed L2 posttests; longer spacing benefited delayed more than immediate testing; equal and expanding schedules were statistically equivalent. Published **2022-02-06**; [publisher](https://onlinelibrary.wiley.com/doi/10.1111/lang.12479); accessed **2026-09-28**. **UNVERIFIED:** precise pooled standardized effects were not available in the publisher abstract retrieved; do not turn its qualitative abstract into an invented g. |

**PROPOSED:** Teaching may explain and demonstrate; assessment must obtain an unaided response before feedback. Record whether furigana, choices, translation, audio replay, a hint, or an answer reveal was present. Keep trained-item retention separate from transfer to unfamiliar sentences. A successful answer immediately after seeing the solution is a practice outcome, not independent evidence of durable recall.

### 2. FSRS-6 prediction benchmark, with the correct interpretation

The official live SRS benchmark reports the following **non-same-day evaluation**: **9,999 Anki collections**, **349,923,850 evaluated reviews**, time-ordered training/test splits, means with **99% confidence intervals**. FSRS-6 has **21 trainable parameters** and reports **log loss 0.3460 ± 0.0042**, **RMSE(bins) 0.0653 ± 0.0011**, **AUC 0.7034 ± 0.0023**. FSRS-5 reports **log loss 0.3561 ± 0.0044** on the same table. The log-loss difference is **−0.0101**, or **−2.84% relative** (calculated as `(0.3460−0.3561)/0.3561`). These are prediction comparisons, not learning gains. Source: [official benchmark](https://github.com/open-spaced-repetition/srs-benchmark), **undated live README**, accessed **2026-09-28**. **UNVERIFIED historical cutoff:** no immutable pre-cutoff commit was frozen in this track; snapshot these results before product publication.

**PROPOSED:** Pin the exact FSRS-6 implementation, default weights, optimizer configuration, numerical precision and test fixtures. Never silently substitute a later scheduler. Show item recall predictions only in their stated card/mode/time context; do not average them into a level or readiness score. FSRS is the sole writer of a due date after an explicit learner grade. A probe may nominate a card for a review; it does not backdoor an FSRS grade.

### 3. Knowledge tracing and sparse single-learner data

| Method | What the original evidence supports | Bunki implication — PROPOSED |
|---|---|---|
| BKT / Markov models | Corbett & Anderson model acquisition of procedural rules as latent knowledge traced through observable responses. [Original paper record](https://doi.org/10.1007/BF01099821), **1994-12**, accessed **2026-09-28**. | Understandable baseline, but do not fit unconstrained learn/slip/guess parameters separately to a handful of personal attempts. A learner's Japanese knowledge is not established as binary, irreversible rule acquisition. |
| DKT | Original DKT uses recurrent neural models of response sequences. [Original paper](https://arxiv.org/abs/1506.05908), **2015-06-19**, accessed **2026-09-28**. | A sequence model is a later experimental challenger, not the starting authority for one learner. |
| Logistic / IRT-related approaches vs DKT | A comparison on **9 real-world datasets** found feature-rich logistic models strongest in some moderate-data conditions and DKT strongest in some larger/temporally informative conditions; BKT lagged in that comparison. [Gervet et al.](https://jedm.educationaldatamining.org/index.php/JEDM/article/view/451), **2020-10-24**, accessed **2026-09-28**. | Start with transparent evidence aggregates and optional validated item-response predictions. Complexity must earn its place on held-out personal data. The study is not a Japanese single-learner benchmark. |
| Elo / IRT | Educational Elo updates learner/item estimates from performance; Pelánek presents variants and a geography application. [Author manuscript](https://www.fi.muni.cz/~xpelanek/publications/CAE-elo.pdf), **2016**, DOI [10.1016/j.compedu.2016.03.017](https://doi.org/10.1016/j.compedu.2016.03.017), accessed **2026-09-28**. | Use only with anchored item difficulty or sufficient cross-learner calibration. Simultaneously learning one person's ability and every new item's difficulty is not an identified placement scale. |
| Graph KT | GKT represents concepts and relations in a graph and uses a graph neural architecture for student response prediction. [Nakagawa et al. original paper](https://rlgm.github.io/papers/70.pdf), **2019**; [publication](https://dl.acm.org/doi/10.1145/3350546.3352513), **2019-10-14**, accessed **2026-09-28**. | Use expert/data-asset relations for retrieval and prerequisite suggestions first. Graph edges are not evidence that knowing a parent proves a child. |

**Failure modes with recent primary evidence:** KTbench identifies label leakage when one multi-concept answer is expanded into adjacent concept-answer rows, and inconsistent sequence lengths across benchmarks. [Badran & Preisach, original submission](https://arxiv.org/abs/2403.15304v1), **2024-03-22**, accessed **2026-09-28**. SparseKT addresses overfitting in attention KT on smaller educational datasets and compares against **11 models** on **3 datasets**. [Huang et al.](https://arxiv.org/abs/2407.17097v1), **2024-07-24**, accessed **2026-09-28**. These are response-prediction studies; neither establishes Japanese tutoring efficacy or validates a graph for a single learner.

### 4. Lexical coverage and morphology

The classic academic-reading study used **661 participants from 8 countries** and suggested **98% lexical coverage** as a reasonable target. [Schmitt, Jiang & Grabe](https://onlinelibrary.wiley.com/doi/10.1111/j.1540-4781.2011.01146.x), **2011**, accessed **2026-09-28**. A preregistered replication with **104 Sri Lankan adult L2-English learners** could not fully reproduce the original threshold findings; it also critiques ignoring polysemy, phraseology, genre, and purpose. [Kremmel et al.](https://onlinelibrary.wiley.com/doi/full/10.1111/lang.12622), **2023-11-27**, accessed **2026-09-28**. Therefore the numerical threshold is not an established universal Japanese-comprehension cutoff.

A Japanese corpus analysis of Aozora texts reports a possible progression from approximately **3,500-word** vocabulary to **9,500 words for 95% token coverage**, or **20,000 for 98% coverage** of the analyzed Japanese texts. This is corpus coverage analysis, not a randomized comprehension or acquisition effect. [Original article](https://www.sciencedirect.com/science/article/pii/S0346251X2400349X), **2025**, accessed **2026-09-28**. **UNVERIFIED:** the exact publication day and full table/morphological-unit audit were unavailable from the successfully retrieved publisher search text; do not equate these counts with JMdict entries or English word families.

**PROPOSED:** Define every coverage number by tokenizer version, segmentation mode, denominator, sense/readings policy, and evidence source. Report token coverage and unique unknown targets separately. A repeated unknown word can dominate token burden while adding only one target. Compute a conservative lower bound from measured support and an upper bound including uncertain/observed support; label them as estimated lexical coverage, never comprehension probability. Grammar and unknown-sense burden must remain additional dimensions.

### 5. Receptive/productive knowledge, kanji, and transfer

Webb's experiments compare receptive sentence reading with sentence production, measuring multiple kinds of word knowledge in Japanese learners of English. Task and test format matter; this is not evidence that a recognized word is available for spontaneous speech. [Original study](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/receptive-and-productive-vocabulary-learning-the-effects-of-reading-and-writing-on-word-knowledge/DDF362AE7B13D1949B1CD591DA2F3414), **2005**, accessed **2026-09-28**. **UNVERIFIED:** exact standardized transfer effect from the retrieved abstract.

A recent kanji-strategy study analyzed **273 learners** after **9 exclusions** from **282** recruited participants, with L1/orthographic groups in Australia and Sri Lanka. It is a strategy questionnaire, not a randomized comparison establishing a best kanji method. [Haththotuwa Gamage](https://link.springer.com/article/10.1186/s40862-025-00379-0), published **2026-02-09** (the DOI contains 2025 but the article does not), accessed **2026-09-28**. **UNVERIFIED:** a replicated numerical superiority effect for Heisig, radicals, mnemonic stories, handwriting, or typing in adult L2 Japanese.

**PROPOSED:** Let learners choose component mnemonics, whole-word context, copying, or retrieval writing according to their goal. Treat mnemonic explanations as aids, not etymological claims. Test script recognition, word-in-context reading, kana-to-kanji selection, and unaided writing separately. Knowing 生 in one word must not propagate success to all its readings. A handwriting goal belongs in the learner's goal rows; no owner-specific curriculum branches belong in code.

### 6. Corrective feedback

Lyster & Saito synthesize **15 classroom studies**, **N = 827**; prompts show greater effects than recasts and constructed responses reveal effects particularly clearly. [Publisher](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/oral-feedback-in-classroom-sla/4999EE1C8379B2BF026B148EAF373CA1), published online **2010-04-23**, DOI [10.1017/S0272263109990520](https://doi.org/10.1017/S0272263109990520), accessed **2026-09-28**. **UNVERIFIED:** the exact between-group standardized effects were not retrieved successfully from the author's full PDF, so none is asserted here. The result does not validate LLM error diagnosis or establish that every utterance should be corrected.

**PROPOSED feedback policy:** first elicit an attempt; ask a focused clarification or metalinguistic hint if the learner opts into it; allow self-repair; provide a verified explicit correction when requested or after the attempt; then test transfer in a different context. Store `feedback_type`, `hint_depth`, and `self_repair` as context. The tutor's proposed diagnosis remains observed evidence even when the learner accepts it; learner confirmation of a diagnosis is not a test result. Never let AI feedback set a card grade.

### 7. Pitch accent: actual Japanese results and limits

Ochiai's study of **48 American L1-English learners of Japanese** reports no-line production scores (out of **13**) rising **5.35→6.65** in the training group and **6.41→6.95** in controls: change **+1.30 vs +0.54**, difference-in-change **+0.76 points**, calculated from reported means. The three-way group×time×line interaction was not significant, so a significant within-group change does not establish between-group superiority. For the listening accent-line task, group×time **η² = .000**, **p = .902**. [Original paper, Tables 3–4 and results](https://jalt-publications.org/sites/default/files/pdf-article/jj46.2-art2.pdf), **2024-11**, accessed **2026-09-28**. One study, constrained words, not general conversational pronunciation efficacy.

Hirata et al.'s first experiment included **66 participants**; their second experiment found no significant pitch-identification difference across its multimodal conditions. [Original paper](https://www.cambridge.org/core/journals/language-and-cognition/article/multimodal-training-on-l2-japanese-pitch-accent-learning-outcomes-neural-correlates-and-subjective-assessments/AB2195C963F348823C8175220F9F9EA1), **2024-09-18**, accessed **2026-09-28**. **UNVERIFIED:** numerical between-condition effect sizes were not available in the extracted table image; no effect magnitude is invented.

**PROPOSED:** Offer perceptual discrimination, reference audio, and optional visual contours. Label acoustic comparison as an aid with recording-quality flags. Accent judgments require word/sense/dialect context. Measure intelligibility and communicative success independently. A TTS voice is not a pronunciation-scoring reference merely because it speaks fluently.

### 8. JLPT, CEFR, and JF Can-do

Official CEFR references apply to passed JLPT results starting **December 2025**. Mappings are **N5 ≥80 → A1; N4 ≥90 → A2; N3 95–103 → A2 and ≥104 → B1; N2 90–111 → B1 and ≥112 → B2; N1 100–141 → B2 and ≥142 → C1**. They refer to tested linguistic/reception competence, explicitly excluding speaking, writing, and interaction. [JLPT official explanation](https://www.jlpt.jp/e/about/cefr_reference.html), **undated official page describing 2025-12 introduction**, accessed **2026-09-28**. Imported official results may be shown as historical documents; Bunki must not generate its own equivalent level assertion.

JF Standard uses CEFR and situation-specific JF Can-do descriptors as communicative objectives. [Japan Foundation official pamphlet](https://www.jfstandard.jpf.go.jp/pdf/jfs2015_pamphlet_eng.pdf), **2015**, accessed **2026-09-28**. **PROPOSED:** Goals may reference a Can-do identifier and learner-authored target situation; measured samples remain evidence of that task, not a blanket CEFR level. Preserve the owner's per-level vector requirement even when a source uses a scalar score.

## Inferences

All points in this section are **PROPOSED**, pending Bunki validation.

1. Maintain one evidence vector per target and modality. Retention on a card, ability to disambiguate a sense, recognition of spoken form, and ability to produce an appropriate utterance are separate measurements.
2. Calibrate predictions with future, unaided outcomes. Split by time and hold out sentence/item families so paraphrases or repeated templates cannot leak answer information. Report Brier score, log loss, calibration plots and sample counts by task; do not report a readiness score.
3. Use outcomes at **1, 7, and 30 days** as a **proposed measurement cadence**, not a competing scheduler. A pre-registered research protocol nominates probes; the app's FSRS-6 scheduler alone governs card due dates. Record probe exposure so its own teaching effect can be modeled.
4. For an N-of-1 pilot, randomize comparable target families to adaptation versus an active baseline with matched time/materials. Analyze delayed unaided retention and transfer separately. Repeated answers from one learner are not independent learners; do not claim population efficacy or treat hundreds of card events as hundreds of participants. Replicated cohorts and blinded assessors are needed for broader claims. These are design recommendations; this track did not perform a power calculation.
5. Separate diagnostic exploration from remediation. A learner who repeatedly selects easy tasks may look successful while difficult nodes remain unknown; reserve explicit learner-confirmed probes of uncertainty, with opt-out and no punitive labels.

## Gaps

- **UNVERIFIED:** Bunki-versus-competitor learning effect, Japanese-specific FSRS-6 randomized efficacy, calibrated item difficulties for Bunki's mock bank, per-modality diagnostic reliability, and graph transfer coefficients.
- **UNVERIFIED:** optimal universal i+1 policy, a guaranteed Japanese comprehension threshold, superiority of a single kanji method, and pooled motivation effect of an open learner model.
- **UNVERIFIED:** exact quantitative effect sizes for the inaccessible L2-spacing, feedback, receptive/productive, and multimodal-pitch tables. Retrieved claims are not promoted to invented numbers.
- Authoritative outcomes need instrument rights, scoring rubrics, scorer independence, alternate forms, adherence tracking, missing-data rules, and learner consent before a trial.
- Mutable benchmark/product pages need commit/version capture. No post-2026-09-28 publication should enter the frozen report.
