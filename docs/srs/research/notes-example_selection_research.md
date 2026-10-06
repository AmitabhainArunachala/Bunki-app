# Automatic Selection and Ranking of Good Example Sentences for Learners (with Japanese focus)

Method note: research done 2026-10-04. Direct fetching of PDFs was blocked by the network proxy (arxiv.org, aclanthology.org, sketchengine.eu all returned egress denial), so findings below come from search-result abstracts/snippets of the primary sources. Formulas quoted are as returned from those sources; anything I could not confirm is flagged in Gaps or Inferences.

## 1. GDEX and follow-ups: features, weights, scoring

### Takeaway

GDEX (Kilgarriff et al. 2008) is a weighted heuristic scorer: hard filters (whole sentence, length bounds, no illegal chars, all words above a frequency floor) plus soft multiplicative penalties (rare chars, anaphoric pronouns, bad words, abbreviations, starting with a conjunction) and an optimal-length interval; sentence length and word frequency carry the most weight. Later systems (HitEx for Swedish, DWDS for German, Slovene/Estonian configs) keep this filter+ranker architecture and add CEFR-level classifiers, typicality and context-independence checks.

### Cited Findings

- GDEX = "Good Dictionary EXamples", Kilgarriff, Husák, McAdam, Rundell, Rychlý (Euralex 2008); ranks corpus sentences on criteria such as sentence length, vocabulary frequency, anaphoric pronouns, controversial topics — [Kilgarriff et al. 2008 PDF](https://www.sketchengine.eu/wp-content/uploads/2015/05/GDEX_Automatically_finding_2008.pdf); [Sketch Engine GDEX guide](https://www.sketchengine.eu/guide/gdex/)
- Good examples are characterised (Atkins & Rundell framing used by GDEX) as _typical_ ("exhibiting frequent and well-dispersed patterns of usage"), _intelligible_ ("avoiding gratuitously difficult lexis and structures") and _informative_ ("helping to elucidate the definition") — [Semantic Scholar entry for GDEX 2008](https://www.semanticscholar.org/paper/GDEX:-Automatically-Finding-Good-Dictionary-in-a-Kilgarriff-Hus%C3%A1k/d7a8e7aee25703f2b0e1b9cc94d7f65801abd4b2); [Kosem et al. 2019 (IJL)](https://www.researchgate.net/publication/327163304_Identification_and_automatic_extraction_of_good_dictionary_examples_The_cases_of_GDEX)
- As summarised by a later GDEX ML study: original GDEX heuristics favour sentences of 10–25 words, all words within the top ~17,000 most frequent, containing the target collocation, with the collocation in the main clause, starting with a capital and ending with . ! or ?; sentence length and word frequency should get the highest weight — [Automated Prediction of GDEX (secondary summary)](https://www.academia.edu/54155569/Automated_Prediction_of_Good_Dictionary_EXamples_GDEX_A_Comprehensive_Experiment_with_Distant_Supervision_Machine_Learning_and_Word_Embedding_Based_Deep_Learning_Techniques)
- GDEX config primitives (Sketch Engine): `optimal_interval(value, low, high)` returns 1 inside [low, high], rising linearly from 0 at low/2 to 1 at low and falling from 1 at high to 0 at 2*high; `greylist(tokens, pattern, penalty)` subtracts `penalty` from 1 for each matching token (floored at 0); `blacklist` = hard 0 on any match — [Syntax of GDEX configuration files](https://www.sketchengine.eu/syntax-of-gdex-configuration-files/)
- Slovene pedagogical GDEX config (Kosem et al.), verbatim structure:
  `50 * all(is_whole_sentence(), length > 5, length < 20, max(len(w)) < 20, blacklist(words, illegal_chars), 1-match(lemmas[0], adverbs_bad_start), min(word_frequency(w, 250000000)) > 5)`
  `+ 50 * optimal_interval(length, 10, 12) * greylist(words, rare_chars, 0.05) * 1.09 * greylist(lemposs, anaphors, 0.1) * greylist(lemmas, bad_words, 0.25) * greylist(tags, abbreviation, 0.5) * (0.5 + 0.5 * (tags[0] != conjunction))`
  i.e. 50 points for passing all hard filters + up to 50 points from a product of soft penalties; ideal length 10–12 tokens for learners — [Syntax of GDEX configuration files](https://www.sketchengine.eu/syntax-of-gdex-configuration-files/); [GDEX in Sketch Engine, Michelfeit slides](https://www.elexicography.eu/wp-content/uploads/2015/04/gdex_Jan_Michelfeit.pdf)
- Kosem, Koppel, Zingano Kuhn, Michelfeit, Tiberius (2019, Int. J. Lexicography 32(2):119–137) describe pedagogically oriented GDEX configurations for Slovene, Dutch, Estonian and Brazilian Portuguese and evaluate the Estonian one — [ResearchGate](https://www.researchgate.net/publication/327163304_Identification_and_automatic_extraction_of_good_dictionary_examples_The_cases_of_GDEX)
- Estonian learner dictionary work evaluated GDEX output with both lexicographers and learners — [Koppel et al., Estonian evaluation](https://www.researchgate.net/publication/337079528_Leksikograafide_ja_keeleoppijate_hinnangud_automaatselt_tuvastatud_korpuslausete_sobivusele_oppesonastiku_naitelauseks); [Estonian Collocations Dictionary slides](https://www.sketchengine.eu/wp-content/uploads/Estonian_Collocations_Dictionary_presentation_2015-1.pdf)
- German DWDS (Didakowski, Lemnitzer, Geyken, Euralex 2012): rule-based; criteria = prescribed sentence length, whole-sentence form, low sentence complexity, no free (unresolved) pronouns; project requirement that examples cover _all senses_ of the headword; distinguishes _global_ criteria (balance across text type and publication date) and _local_ criteria (correctness, comprehensibility); 95.3% of extracted examples judged acceptable — [Euralex 2012 abstract](https://euralex.org/publications/automatic-example-sentence-extraction-for-a-contemporary-german-dictionary/); [Kosem et al. 2019 summary](http://izvolitve.ijs.si/Stacks/Articles/67655778.pdf)
- HitEx (Pilán, Volodina, Borin 2016/2017, TAL 57(3)): hybrid — ML classifier for CEFR-level L2 complexity + heuristic rules for everything else; criteria cover target CEFR level, typicality via word co-occurrence, absence of anaphoric expressions, absence of sensitive vocabulary (profanity), context dependence — [arXiv 1706.03530](https://arxiv.org/abs/1706.03530); [ACL Anthology](https://aclanthology.org/2016.tal-3.4/)
- HitEx evaluation settings: most criteria as **filters**; **rankers** = typicality, proper names, KELLY and SVALex frequency lists; sentence length min 6 / max 20 tokens; max 30% non-alphabetic or non-lemmatised tokens; evaluated by 5 teachers and 19 learners (A1–B1); teacher agreement on sentence CEFR level was above chance but below α=0.8 — [arXiv PDF 1706.03530](https://arxiv.org/pdf/1706.03530); [ResearchGate](https://www.researchgate.net/publication/317544689_Candidate_sentence_selection_for_language_learning_exercises_From_a_comprehensive_framework_to_an_empirical_evaluation)
- Context dependence (whether the sentence makes sense out of context — e.g. anaphora, connectives like "however" at start, demonstratives) was modelled as a separate detection task — [Pilán et al., Detecting Context Dependence in Exercise Item Candidates (2016)](https://arxiv.org/pdf/1605.01845)
- Later work moved to ML/distant supervision predicting GDEX-style goodness — [Automated Prediction of GDEX](https://www.researchgate.net/publication/354354484_Automated_Prediction_of_Good_Dictionary_EXamples_GDEX_A_Comprehensive_Experiment_with_Distant_Supervision_Machine_Learning_and_Word_Embedding-Based_Deep_Learning_Techniques); eLex 2023 work stresses variation among selected examples — [Corpus-based extraction of good example sentences with a high range of variation (eLex 2023)](https://elex.link/elex2023/wp-content/uploads/14_30-Corpus-based-extraction-of-good-example-sentences-with-a-high-range-of-variation.pdf)
- SASA dictionary examples used as a gold standard for tuning GDEX for Serbian — [eLex 2019](https://elex.link/elex2019/wp-content/uploads/2019/09/eLex_2019_14.pdf)

### Inferences

- An implementable Japanese port of the Slovene formula: score = 50·[hard filters pass] + 50·optimal_interval(len, lo, hi)·Π greylist penalties. Japanese adaptations: length in morphemes (SudachiPy/MeCab+UniDic) or characters rather than space tokens; "illegal chars" = Latin/URL/emoji/half-width katakana, unmatched 「」; "anaphors" = sentence-initial こそあど demonstratives (これ/それ/あの/そこ), 彼/彼女, and context-dependent connectives at start (しかし, だから, そして, それで, また, 一方); "bad start" = sentence-initial conjunctions/fillers; "rare chars" = kanji outside Jōyō (or outside learner's known kanji); whole sentence = ends in 。！？ (or 」 after one) and contains a predicate.
- Proper names should be a ranker (penalty), not a filter, matching HitEx practice.

### Gaps

- Exact default weights of the original English 2008 GDEX could not be verified from the primary PDF (fetch blocked); the "10–25 words, top 17,000" figures come from a secondary summary.
- Detailed Estonian configuration formula not retrieved.

## 2. Example-sentence selection for Japanese specifically

### Takeaway

The main recent published Japanese system is Benedetti et al. (ACL SRW 2024): retrieval from a JLPT-labelled web-sentence corpus, ranked by (a) closeness to target JLPT level via a BERT classifier, (b) contextual sense similarity of the target word, then a diversity-aware subset selection; retrieval beat LLM generation in human and GPT-4 evaluation. No published Japanese GDEX configuration was found.

### Cited Findings

- Benedetti et al. 2024 "Automatically Suggesting Diverse Example Sentences for L2 Japanese Learners Using Pre-Trained Language Models": scores sentences on four criteria — difficulty, sense similarity, syntactic diversity, lexical diversity; candidates ranked by closeness to target difficulty and by semantic similarity of the target word in candidate vs. a context sentence; final list selected to maximise total diversity — [ACL Anthology](https://aclanthology.org/2024.acl-srw.55/); [arXiv 2506.03580](https://arxiv.org/html/2506.03580v1)
- Built WJTSentDiL corpus (web sentences with JLPT labels); JLPT difficulty classifier = BERT fine-tuned on ~5,000 sentences from learning websites; raters = learners, native speakers, GPT-4; retrieval approach preferred by all evaluator groups, esp. for beginner and advanced targets; generative approaches scored lower on average — [arXiv 2506.03580](https://arxiv.org/abs/2506.03580); [ACL PDF](https://aclanthology.org/2024.acl-srw.55.pdf)
- Nakamachi, Sato, Nishiuchi, Asahara, Okumura (NLP2022, NINJAL/LINE): sentence-level JLPT difficulty estimator trained on JLPT study materials, evaluated on past JLPT questions, showing high correlation — [ANLP 2022 PDF](https://www.anlp.jp/proceedings/annual_meeting/2022/pdf_dir/E4-4.pdf); [LY Corp research page](https://research.lycorp.co.jp/jp/publications/1588)
- Simplification of example sentences for learners of Japanese functional expressions (2016) — [ACL W16-4901](https://aclanthology.org/W16-4901.pdf)
- NINJAL's Q&A on using corpora for teaching example sentences (focus on finding frequently used real patterns) — [ことば研究館 Q&A](https://kotobaken.jp/qa/yokuaru/qa-52/)
- Corpora available: BCCWJ (104.3M words, balanced written), NWJC web corpus — [BCCWJ](https://clrd.ninjal.ac.jp/bccwj/); [NWJC](https://masayu-a.github.io/NWJC/)
- Tanaka Corpus (~150k JA–EN pairs by Prof. Yasuhito Tanaka's students, mostly from textbook material) originally had many errors (transcription, grammar, mismatched translations) and duplicates; Jim Breen cleaned, indexed and word-linked it for WWWJDIC; merged into Tatoeba in 2006, which now maintains it — [EDRDG Tanaka Corpus wiki](https://www.edrdg.org/wiki/Tanaka_Corpus.html); [Tatoeba Wikipedia](https://en.wikipedia.org/wiki/Tatoeba)

### Inferences

- For a sentence-mining deck, a pipeline mirroring Benedetti et al. is directly applicable: (1) retrieve all sentences containing the lemma; (2) GDEX-style hard filters; (3) difficulty match to learner level; (4) sense match (embedding of target token vs. a sense gloss/prototype); (5) MMR-style diversity selection.
- Tatoeba/Tanaka sentences should still be quality-filtered (the corpus has known residual errors and translationese).

### Gaps

- No Japanese-specific GDEX configuration or a NINJAL study on dictionary 例文 selection criteria with explicit weights was found.
- Precise diversity algorithm in Benedetti et al. (e.g. whether MMR) not confirmed from full text.

## 3. Japanese readability / difficulty measures and i+1

### Takeaway

jReadability (Lee & Hasebe) gives a linear formula over sentence length, kango/wago ratios, verb and particle ratios (score 0.5–6.4, higher = easier) plus a 17,920-word vocabulary list with 6 teacher-rated levels; Obi-2 (Sato et al.) gives a 13-grade score from character-bigram LMs. For i+1, the L2 coverage literature (Hu & Nation 2000; Schmitt et al. 2011) supports ~98% known-word coverage for unassisted comprehension, which at sentence scale means exactly one unknown content word.

### Cited Findings

- jReadability formula: `readability = (mean words per sentence)×−0.056 + (% kango)×−0.126 + (% wago)×−0.042 + (% verbs)×−0.145 + (% particles)×−0.044 + 11.724`; bands 5.5–6.4 very easy (初級前半), 4.5–5.4 easy, 3.5–4.4 neutral, 2.5–3.4 somewhat difficult, 1.5–2.4 difficult, 0.5–1.4 very difficult — [jreadability on PyPI](https://pypi.org/project/jreadability/1.1.4/); [Hasebe & Lee 2015 CASTEL/J](https://jreadability.net/file/hasebe-lee-2015-castelj.pdf); [Lee 2016 paper](http://jhlee.sakura.ne.jp/papers/lee2016.pdf)
- Lee & Hasebe system computes readability from average sentence length, word difficulty, POS proportions and character types — [Lee, levelled corpora chapter](https://researchmap.jp/jhlee/published_papers/21426109/attachment_file.pdf); [jReadability Portal](https://jreadability.net/)
- 日本語教育語彙表 (Japanese Language Education Vocabulary List): ~17,920 entries, 6 teacher-judged levels (初級前半 → 上級後半), also lists old JLPT level, POS, word type, notation, accent; downloadable as Excel — [JEV site](https://jhlee.sakura.ne.jp/JEV/)
- Since the 2010 JLPT revision made official specifications non-public, this list has become a de facto standard for vocabulary difficulty — [JEV / search summary](https://jhlee.sakura.ne.jp/JEV/)
- Obi / Obi-2 (Sato, Matsuyoshi, Kondoh, LREC 2008): trained on 1,478 passages from 127 textbooks (~1M chars) across 13 grade levels (1–12 school grades, 13 = university); Obi-2 uses character-bigram LMs (Obi-1 unigram); works on short/irregular fragments; higher = harder — [LREC 2008 paper](https://www.cs.brandeis.edu/~marc/misc/proceedings/lrec-2008/pdf/165_paper.pdf); [ACL L08-1230](https://aclanthology.org/L08-1230/); [Sato, LREC 2014](http://www.lrec-conf.org/proceedings/lrec2014/pdf/633_Paper.pdf)
- Sentence-level JLPT classifiers: Nakamachi et al. 2022 (above); Benedetti et al. 2024 BERT classifier — [ANLP 2022](https://www.anlp.jp/proceedings/annual_meeting/2022/pdf_dir/E4-4.pdf); [arXiv 2506.03580](https://arxiv.org/abs/2506.03580)
- Lexical coverage: Hu & Nation (2000) found learners needed 98–99% known words for adequate unassisted comprehension of fiction; Schmitt, Jiang & Grabe (2011) found a roughly linear coverage–comprehension relationship between 90–100%, with ~98% coverage for ~60% comprehension — [Schmitt et al. 2011 PDF](https://www.lextutor.ca/cover/papers/schmitt_etal_2011.pdf)

### Inferences

- i+1 scoring for a learner model: count unknown content lemmas U (excluding the target); hard-filter U=0 (true i+1) or allow U≤1 at higher levels; known-word ratio = known/(content tokens). Treat particles, auxiliaries and copula as always "known" after N5.
- jReadability is designed for texts; on single sentences it is noisy — use it as a soft feature, and use per-word JEV level / JLPT level (max and mean) plus a sentence-level JLPT classifier for difficulty matching.
- Kanji difficulty feature: max kanji level (Jōyō grade or old JLPT kanji level) of non-target words; penalise non-Jōyō kanji (GDEX "rare_chars" analogue).

### Gaps

- No authoritative sentence-length norms by JLPT level were found (e.g. "N5 sentences average X chars").
- Original Lee & Hasebe paper coefficients were confirmed only via the PyPI package description and the readability portal summary, not the original paper text.

## 4. Typicality / collocation measures and polysemy

### Takeaway

logDice (Rychlý 2008) is the standard lexicographic association score for picking sentences that display a word's most typical collocates; HitEx uses co-occurrence typicality as a ranker; DWDS required examples covering every sense, and Benedetti et al. use contextual-embedding sense similarity.

### Cited Findings

- logDice = 14 + log2(2·f_xy / (f_x + f_y)); theoretical max 14, usually < 10; stable across corpus sizes/subcorpora; designed for lexicographers (used in Sketch Engine word sketches) — [Rychlý 2008, RASLAN](https://nlp.fi.muni.cz/raslan/2008/papers/13.pdf); [Laurence Anthony, corpus statistics](https://www.laurenceanthony.net/resources/statistics/common_statistics_used_in_corpus_linguistics.pdf)
- Collocation ranking comparison of frequency vs. semantic measures (Ljubešić, Logar, Kosem) — [Slovenščina 2.0](https://journals.uni-lj.si/slovenscina2/article/download/10365/9997/31528)
- HitEx uses typicality (word co-occurrence) as a ranking criterion — [arXiv 1706.03530](https://arxiv.org/abs/1706.03530)
- GDEX favours sentences containing the target collocation in the main clause — [secondary summary](https://www.academia.edu/54155569/Automated_Prediction_of_Good_Dictionary_EXamples_GDEX_A_Comprehensive_Experiment_with_Distant_Supervision_Machine_Learning_and_Word_Embedding_Based_Deep_Learning_Techniques)
- DWDS: extracted examples must exemplify all meanings of the headword — [Euralex 2012](https://euralex.org/publications/automatic-example-sentence-extraction-for-a-contemporary-german-dictionary/); tool for sense-disambiguated example extraction via user feedback — [EACL 2017 demo E17-3018](https://aclanthology.org/E17-3018.pdf)

### Inferences

- Typicality score for a sentence s and target t: Σ over dependency collocates c of t in s of logDice(t, c), or max; compute from BCCWJ/NWJC using dependency pairs (e.g. noun–を–verb, noun–が–adj) which suit Japanese case-particle frames. Prefer sentences containing the top-k logDice collocate frames.
- Polysemy: cluster contextual embeddings of all target-word occurrences (or align with JMdict senses via gloss embeddings) and pick the top-scoring sentence per cluster/sense; order senses by cluster frequency.

### Gaps

- No Japanese-specific study on logDice-based example ranking found.

## 5. Cloze-specific: answerability and unambiguity

### Takeaway

Cloze quality depends on low ambiguity (few plausible fillers) and high contextual informativeness; ambiguity can be estimated from local collocational evidence or a masked LM's probability for the target, and informativeness can be predicted by models trained on rated contexts.

### Cited Findings

- Horsmann & Zesch (2014) rank cloze contexts by ambiguity using local collocated word sequences and sentence-structure evidence; for top-ranked low-ambiguity items participants produced the target 59.9% of the time vs 36.5% for bottom-ranked — ambiguity reduced but not eliminated — [ACL W14-3503](https://aclanthology.org/W14-3503.pdf)
- Contextual informativeness: Kapelner, Soterwood, Frishkoff, Collins-Thompson et al. built a dataset of ~70,000 contexts for 1,000 words, each rated by 10 people on a 4-point informativeness scale, plus predictive models; an attention-based model with pretrained embeddings later achieved SOTA; scaffolded presentation (highly informative contexts first, then less) gave +15% long-term retention vs other curricula — [Predicting Contextual Informativeness (ERIC)](https://files.eric.ed.gov/fulltext/ED589145.pdf); [arXiv 2204.09885](https://arxiv.org/pdf/2204.09885)
- Rich context improves comprehension but retrieval practice improves retention (van den Broek et al. 2018) — [Language Learning](https://onlinelibrary.wiley.com/doi/10.1111/lang.12285)
- Distractor criteria from pedagogy: plausibility (semantically related, grammatically consistent) and reliability (makes the sentence logically wrong) — [NAACL 2024 Pedagogically Aligned Objectives](https://aclanthology.org/2024.naacl-long.220.pdf)
- Masked-LM–based open cloze generation (Mask and Cloze, 2022) — [arXiv 2205.07202](https://arxiv.org/pdf/2205.07202); BERT-based distractor generation CDGP — [arXiv 2403.10326](https://arxiv.org/pdf/2403.10326)

### Inferences

- Implementable answerability check: mask the target in a Japanese MLM (e.g. cl-tohoku BERT) and compute P(target | context) and its rank; accept if rank ≤ 3 or P above a threshold; also compute entropy of the top-k distribution (low entropy = unambiguous). For production cards, a hint (reading/English gloss) can compensate where the sentence is informative but not unique.
- For Japanese, blanking should cover the whole inflected form or the stem with the okurigana shown; cloze ambiguity is high for particles and common verbs unless collocates constrain them.

### Gaps

- No Japanese-specific cloze ambiguity study found.

## 6. LLM-generated vs corpus example sentences (2023–2026)

### Takeaway

Recent studies find LLM-generated examples are often preferred by learners/judges at sentence level (largely because corpus sentences can be context-dependent), but for Japanese, Benedetti et al. found corpus retrieval preferred over generation.

### Cited Findings

- L2 Spanish (NLP4CALL 2024, "Leading by Example"): in 400 pairwise comparisons learners preferred GenAI examples 265 times vs. corpus 10; ~30% of corpus sentences were not fully comprehensible without context; authors suggest GenAI for sentence-level examples, corpora for paragraph-level context — [ACL 2024.nlp4call-1.3](https://aclanthology.org/2024.nlp4call-1.3.pdf)
- Low-cost generation and evaluation of dictionary examples (NAACL 2024): OxfordEval = LLM-judged win-rate vs Oxford Dictionary examples; LLM sentences won 83.9% vs 39.8% for earlier model-generated sentences — [ACL 2024.naacl-long.194](https://aclanthology.org/2024.naacl-long.194/); [arXiv 2404.06224](https://arxiv.org/html/2404.06224)
- Bilingual example generation with LLMs (2024) for French, Indonesian, Tetun → English, also LLM rating of examples, quality varying with resource level — [arXiv 2410.03182](https://arxiv.org/pdf/2410.03182)
- Japanese: retrieval preferred over generative approaches by learners, natives and GPT-4 (Benedetti et al. 2024) — [arXiv 2506.03580](https://arxiv.org/abs/2506.03580)

### Inferences

- Hybrid approach suggested by the evidence: mine and rank real sentences first; fall back to (verified) LLM-written sentences only when no corpus sentence passes filters at the learner's level; LLM-as-judge can be used as a final reranker.
- LLM-judge win-rates (OxfordEval) measure judge preference, not learning outcomes.

### Gaps

- No study found comparing learning outcomes (retention) from LLM vs corpus examples for Japanese.
