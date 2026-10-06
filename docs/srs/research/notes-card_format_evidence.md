# Card format and FSRS-era scheduling evidence for a Japanese sentence deck

Research note conventions: **[E]** = empirical finding (experiment, benchmark on real data); **[X]** = expert/developer guidance or documentation; **[W]** = weak or unverified source (blog, search-snippet only). Many publisher sites (Cambridge, Wiley, ResearchGate, ERIC, CiNii, docs.ankiweb.net, Semantic Scholar API) were blocked from this environment, so several SLA findings below come from abstracts as surfaced in search results, not full-text reading. That is flagged where relevant. The Anki manual was read in full from its GitHub source (ankitects/anki-manual).

## 1. Recognition vs recall/production vs cloze; order effects

### Takeaway

Direction matters: receptive (L2→meaning) practice is best for receptive meaning knowledge, and productive (meaning→L2) practice gives broader gains (orthography, productive meaning, syntax). Recall formats beat multiple-choice recognition when learners must know the form. Context (cloze/sentence) helps comprehension, but retrieval is what drives retention. For a sentence-mining deck whose goal is reading, a recognition card (Japanese sentence → meaning/reading) is the core card. A production/cloze card is worth adding when output or kanji/kana spelling matters.

### Cited Findings

- [E] Webb (2009), RELC Journal 40(3):360–376. EFL learners in Japan learned word pairs receptively or productively, and each word was tested in 10 ways across 5 knowledge aspects. "Productive learning led to larger gains in both receptive and productive knowledge of orthography, and productive knowledge of meaning, syntax, and grammatical functions. In contrast, receptive learning led to larger gains in receptive knowledge of meaning." The author concludes that "if only one method is used, productive learning of word pairs might be more effective." — [SAGE abstract](https://journals.sagepub.com/doi/10.1177/0033688209343854); [ERIC record](https://eric.ed.gov/?id=EJ865637)
- [E] Nakata (2016), "Effects of retrieval formats on second language vocabulary learning," IRAL 54(3):257–289, doi:10.1515/iral-2015-0022. The study compared recognition (multiple choice), recall, a hybrid (recognition and recall), and productive-recall-only conditions. Per the abstract as summarised in search results, recall formats are more effective than recognition for acquiring productive knowledge of orthography, while recognition formats are preferable when spelling knowledge is not required. — [De Gruyter](https://www.degruyterbrill.com/document/doi/10.1515/iral-2015-0022/html?lang=en) (full abstract not directly verified; publisher page blocked)
- [E] Nakata (2011) defined four retrieval formats in order of increasing difficulty: receptive recognition, productive recognition, receptive recall, productive recall. Nakata argues that well-designed flashcard programs should sequence tasks by increasing difficulty (the "retrieval effort" hypothesis: harder successful retrieval leads to better memory). This is a software review and a theoretical recommendation, not a direct test of ordering. — [Nakata 2011, CALL (ResearchGate)](https://www.researchgate.net/publication/254217121_Computer-assisted_second_language_vocabulary_learning_in_a_paired-associate_paradigm_A_critical_investigation_of_flashcard_software); [JALT CALL Journal review citing it](https://files.eric.ed.gov/fulltext/EJ1108008.pdf)
- [E] Learning direction and proficiency: search summaries of Schneider, Healy & Bourne (2002) and a later SSLA paper ("Effects of learning direction in retrieval practice on EFL vocabulary learning") report that L2→L1 learning was more effective for lower-proficiency learners and L1→L2 for higher-proficiency learners. The same summaries report larger semantic-clustering effects for receptive translation. — [SSLA abstract page](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/effects-of-learning-direction-in-retrieval-practice-on-efl-vocabulary-learning/159EE50F4B8835207764FB1B11077F29); [ResearchGate](https://www.researchgate.net/publication/353247937_EFFECTS_OF_LEARNING_DIRECTION_IN_RETRIEVAL_PRACTICE_ON_EFL_VOCABULARY_LEARNING). Caveat: the search summary may blend the 2002 and the SSLA study, and I could not open the full text.
- [E] Prince (1996), Modern Language Journal, n=48 French learners of English, 44 target words. Both weaker and advanced learners recalled more words learned with L1 translations than words learned in L2 context. However, weaker learners were less able to transfer translation-learned words into L2 context. — [ERIC EJ535943](https://eric.ed.gov/?id=EJ535943); [replication study](https://dergipark.org.tr/en/pub/ejal/article/460588)
- [E] van den Broek et al. (2018), Language Learning, "Contextual Richness and Word Learning: Context Enhances Comprehension but Retrieval Enhances Retention" (the title states the result). A follow-up, van den Broek et al. (2022, Cognitive Science), "Vocabulary Learning During Reading: Benefits of Contextual Inferences Versus Retrieval Opportunities." — [Wiley 2018](https://onlinelibrary.wiley.com/doi/10.1111/lang.12285); [PMC 2022](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9285746/) (full text not read; title-level claim only)
- [E] Webb also studied "Learning word pairs and glossed sentences: the effects of a single context on vocabulary knowledge." — [Semantic Scholar](https://www.semanticscholar.org/paper/Learning-word-pairs-and-glossed-sentences:-the-of-a-Webb/4fc37801a1417de587ac685374b135e796dd1695) (findings not retrieved)
- [E] Nakata (2017), SSLA, "Does repeated practice make perfect? The effects of within-session repeated retrieval on second language vocabulary learning." This bears on how many same-session repetitions are worthwhile. — [Cambridge](https://www.cambridge.org/core/journals/studies-in-second-language-acquisition/article/abs/does-repeated-practice-make-perfect-the-effects-of-withinsession-repeated-retrieval-on-second-language-vocabulary-learning/F14BA8A576CD2563D14CEA46E35D842E) (abstract blocked; from memory, the finding was that gains plateau after a few within-session retrievals. Verify before relying on it.)

### Inferences

- A reading-focused sentence deck should use a **recognition card as the default**: the Japanese sentence with the target word highlighted, answered with meaning and reading. Webb's receptive-learning advantage applies to exactly the knowledge being targeted (receptive meaning).
- A **production or cloze card** (L1 cue or sentence with a gap → Japanese word) adds orthographic and productive knowledge (Webb 2009; Nakata 2016). It costs extra reviews, so it should be optional or added for high-value words. Following Nakata's increasing-difficulty principle and the proficiency finding, introduce it **after** the recognition card has matured, for example by burying siblings or delaying the new production sibling.
- The sentence context on the front is valuable for comprehension and for disambiguating meaning (van den Broek 2018). Retention comes from the retrieval act, so the card must still demand retrieval of the target. Highlighting the target word and asking for its meaning/reading does this. Showing the sentence plus translation on the front would remove the retrieval.

### Gaps

- No experimental study comparing "full-sentence recognition card" vs "isolated-word card" vs "cloze card" specifically in SRS apps for Japanese was found.
- Could not read the Nakata 2016 abstract verbatim, so I could not confirm whether the hybrid (recognition→recall) sequence outperformed recall-only.

## 2. Hints/cues, desirable difficulties, retrieval practice

### Takeaway

Retrieval with feedback beats restudy, and effortful but successful retrieval is better than easy retrieval. Hints should therefore be minimal and opt-in: something that keeps retrieval possible without giving the answer away.

### Cited Findings

- [E] Kang, McDermott & Roediger (2007), Eur. J. Cognitive Psychology 19:528–558. Without feedback, multiple-choice (MC) initial tests helped more, because initial accuracy was higher (88% MC vs 68% short-answer). With corrective feedback, short-answer (recall) practice produced the largest benefit over the control and read-only conditions. — [WashU profile](https://profiles.wustl.edu/en/publications/test-format-and-corrective-feedback-modify-the-effect-of-testing-/); [Matuschak notes](https://notes.andymatuschak.org/zTxLkeaWCdBHQYW73o5n6Ka)
- [E] McDermott et al. (2014, JEP: Applied): both MC and short-answer quizzes enhanced later exam performance in classrooms. — [PDF](https://pdf.retrievalpractice.org/guide/McDermott_etal_2014_JEPA.pdf)
- [E] Schneider, Healy & Bourne (2002), "What is learned under difficult conditions is hard to forget: contextual interference effects in foreign vocabulary acquisition, retention, and transfer." Difficulty during learning improved retention (title-level claim). — via [ESP/EAP article citing it](https://espeap.junis.ni.ac.rs/index.php/espeap/article/download/1287/632)
- [E] A 2025 Behavioral Sciences paper explored whether making L2 vocabulary learning difficult enhances retention and transfer. A second 2025 paper examined how learning rounds moderate retrieval practice and context dependence in digital flashcards. — [MDPI 2025a](https://www.mdpi.com/2076-328X/15/5/692); [MDPI 2025b](https://doi.org/10.3390/bs15111540) (findings not read)
- [x] Anki manual, Again guidance: "If your answer is partially correct, you should be strict with yourself: if it counts as a fail in a real-life context outside of Anki, then it counts as a fail in Anki as well." It also suggests it is better to show the answer than to keep struggling to remember. — [Anki manual, studying.md](https://github.com/ankitects/anki-manual/blob/main/src/studying.md)

### Inferences

- An L1 gloss on the front of a recognition card gives away the answer and should not be shown. A tap-to-reveal hint (for example, the reading, or a first-kana hint for production cards) keeps retrieval effortful. If a hint was used, the review should arguably still be graded Hard/Good honestly. Hints should never be used to turn a fail into a pass.
- Feedback (the reveal) is essential. Recall plus feedback beats MC (Kang 2007).

### Gaps

- No direct SLA study of first-letter/first-kana hints on SRS cards was found in this session.

## 3. Furigana

### Takeaway

There is little high-quality accessible research. The recurring finding/concern is that furigana lowers decoding load and aids incidental kanji reading, but readers may look only at the kana and skip the kanji. Expert practice converges on not showing readings on the front for the target word, giving readings on reveal, and optionally showing furigana for non-target unknown kanji.

### Cited Findings

- [E, title/abstract only] "Harnessing Furigana to Improve Japanese Learners' Ability to Read Kanji," Babel (Australian journal), Sept 2005. — [ERIC EJ846104](https://eric.ed.gov/?id=EJ846104&pg=7161&pr=on&q=sociology+considerations+in+the+classroom); [ResearchGate](https://www.researchgate.net/publication/29455471_Harnessing_furigana_to_improve_Japanese_learners'_ability_to_read_kanji) (abstract could not be opened)
- [W] Search-summarised claims: experimental studies show furigana facilitates incidental kanji learning, especially for beginners, by reducing cognitive load. The same summaries record an educator concern that learners read only the furigana and never attend to kanji shapes (a "redundancy effect"). — [note.com essay](https://note.com/lyco_pene/n/n60f23622a075?hl=en). Specific statistics on the blog pages ("3.7× more text", "28% higher recognition", "up to 40% faster") came from unsourced commercial blogs ([kanjijo](https://kanjijo.com/blog/furigana-guide.html), [yomimaru](https://yomimaru.app/learn/what-is-furigana-and-how-does-it-help-beginners)). **Treat them as unreliable and do not cite them as evidence.**
- [x] Typography: W3C Japanese Layout Requirements (JLreq) says "The character size of ruby characters is, in principle, the half size of the base characters." For base characters of 12pt or larger, ruby is generally smaller than half. — [W3C JLreq source](https://github.com/w3c/jlreq) (w3c.github.io/jlreq)
- [E, indirect] Kakihana, Japanese Psychological Research: okurigana and lexical context help native readers read kun-reading kanji words. This supports the idea that sentence context aids reading. — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/jpr.12596)

### Inferences

- Recommended design: on the front, do **not** show furigana on the target word, since the reading is part of what is retrieved. Showing furigana on the **non-target** words the learner doesn't know is fine (i+1 principle, lower load). The back should show the target's reading. A per-user toggle (none / non-target only / all) is the safest choice.
- At half-size ruby, a 20px body font gives about 10px furigana, which is near the legibility floor on phones. Use a base size of at least 22–24px for sentence text when ruby is shown.

### Gaps

- No peer-reviewed L2 study comparing furigana always / back-only / on-tap was verifiable in this session (publisher sites blocked).

## 4. FSRS: desired retention, buttons, Hard, learning steps, leeches, siblings, benchmarks

### Takeaway

Use FSRS with desired retention of 0.90 by default (reasonable range 0.80–0.95). Keep (re)learning steps short and few, all under one day. Hard is a **pass** grade, never a fail. A two-button (Again/Good) scheme is officially supported and avoids Hard misuse. The default leech threshold is 8 lapses. Bury siblings so recognition and production cards of the same sentence don't appear on the same day.

### Cited Findings

- [x] "Choose a value of desired retention… **This is the most important setting in FSRS.** … The default is 90%, which offers a good balance of retention and workload. Above 90% the workload increases very quickly, and above 97% the workload can be overwhelming." — [Anki manual deck-options.md](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- [x] FSRS wiki: "Values between 70% and 97% are considered reasonable"; "users should not tweak the parameters manually"; FSRS-6 uses 21 parameters, and the defaults were fit on several hundred million reviews from ~10k users. "Users have to do 20–30% fewer reviews than with SM-2 algorithm to achieve the same retention level." A 2026-02-12 update notes that this figure is based on simulation. — [ABC of FSRS (awesome-fsrs wiki)](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/ABC-of-FSRS)
- [x] Compute Minimum Recommended Retention (CMRR) "attempts to find the desired retention value that leads to the most material learned, in the least amount of time… setting your desired retention lower than the minimum is not recommended." — [Anki manual](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- [x] On Hard: "FSRS can adapt to almost any habit, except for one: pressing 'Hard' instead of 'Again' when you forget… If you press 'Hard' when you have failed to recall the information, all intervals will be unreasonably high." Also: "Hard should **not** be used when you forgot the answer; it is a passing grade, not a failing grade." — [Anki manual](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- [x] On buttons: Again "about 5–20% of the time", Good "about 80–95%". "If you find it hard to use four answer buttons, you can also use only **Again** and **Good** buttons." Hard = "correct, but you had doubts about it or it took a long time to recall." — [Anki manual studying.md](https://github.com/ankitects/anki-manual/blob/main/src/studying.md)
- [X/E] FSRS rating effects: Again lowers stability and raises difficulty; Hard raises stability slightly and raises difficulty; Good raises stability more and slightly lowers difficulty; Easy raises it most. Treating Hard as Again in the optimiser was tested and degraded benchmark performance. — [Expertium, technical explanation of FSRS](https://expertium.github.io/Algorithm.html); [Anki Forums thread](https://forums.ankiweb.net/t/fsrs-hard-acting-as-a-again-in-learning-relearning-phase/67334)
- [x] Learning steps: "(Re)learning steps of 1 day or greater are not recommended when using FSRS"; keep all steps completable the same day ("Steps such as 10m or 30m are good"). "Keep the number of learning steps to a minimum. Evidence shows that repeating a card multiple times in a single day does not significantly contribute to long-term memory." Newer Anki can let FSRS control short-term scheduling if the steps field is left empty (experimental). — [Anki manual](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- [x] Parameter optimisation needs data: FSRS performs poorly with a "low number of reviews (less than a few hundred)". — [Anki manual](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- [x] Leeches: by default, when a card's lapse counter "reaches 8, Anki tags the note as a leech and suspends the card". Warnings then repeat every half-threshold (12, 16…). The recommended fixes are rewriting the card (often too much information on it), adding a mnemonic, or deleting it. — [Anki manual leeches.md](https://github.com/ankitects/anki-manual/blob/main/src/leeches.md)
- [x] Siblings: separate options bury new, review, and interday-learning siblings until the next day. With burying, earlier-gathered card types win (a review sibling is shown in preference to a new one). With burying disabled, the "Card type, then order gathered" setting shows all front→back cards before back→front. — [Anki manual](https://github.com/ankitects/anki-manual/blob/main/src/deck-options.md)
- [E] SRS benchmark (open-spaced-repetition): ~10k Anki users, ~727M reviews. Without same-day reviews (9,999 collections, ~350M reviews):

  | Algorithm        | Log loss | RMSE (bins) | AUC    |
  | ---------------- | -------- | ----------- | ------ |
  | FSRS-7 (recency) | 0.3370   | 0.0593      | 0.7220 |
  | FSRS-7           | 0.3401   | 0.0634      | 0.7167 |
  | FSRS-6           | 0.3460   | 0.0653      | 0.7034 |
  | FSRS-5           | 0.3561   | 0.0742      | 0.7010 |
  | FSRS-4.5         | 0.3625   | 0.0764      | 0.6891 |
  | HLR (Duolingo)   | 0.4694   | 0.1275      | 0.6369 |

  Lower log loss/RMSE is better. — [srs-benchmark](https://github.com/open-spaced-repetition/srs-benchmark); [Expertium benchmark page](https://expertium.github.io/Benchmark.html). FSRS vs SuperMemo SM-17 comparison: [fsrs-vs-sm17](https://github.com/open-spaced-repetition/fsrs-vs-sm17)

### Inferences

- For an app (not Anki), use a maintained FSRS library such as ts-fsrs, py-fsrs, or fsrs-rs from open-spaced-repetition. Start with default parameters and desired retention of 0.90. Offer per-user optimisation only after several hundred reviews.
- **Two-button grading (Again/Good) is the safest mobile default.** It maps cleanly to swipe left/right, removes the Hard-as-fail misuse that the FSRS docs single out as the one habit FSRS can't adapt to, and is officially supported. Hard and Easy can live behind an "advanced" toggle.
- Learning steps: 1–2 short steps (for example 1m, 10m) or FSRS-controlled short-term. Relearning step: 10m.
- Leech: suspend or flag at 8 lapses and prompt the user to edit or replace the sentence. For sentence mining specifically, replacing a sentence with a different one for the same word is a natural fix.
- Bury siblings across recognition and production cards of the same note.

### Gaps

- No published controlled study found directly comparing learning outcomes of two-button vs four-button grading. The benchmark shows FSRS works with any consistent pass/fail usage, but I found no head-to-head result.
- The 20–30% workload saving vs SM-2 is a simulation result, not a user RCT.

## 5. Mobile flashcard UX: swipe grading, contrast, font size

### Takeaway

Swipe and tap-zone grading is an established pattern (AnkiMobile is fully configurable). For accessibility, WCAG 2.x AA requires 4.5:1 contrast for normal text and 3:1 for large text and UI components. Colour alone must not carry meaning such as the Again/Good distinction.

### Cited Findings

- [x] AnkiMobile lets users assign Answer Again/Hard/Good/Easy, and other actions, to taps, swipes, tap zones, or the top bar, and supports an "Off" action to disable gestures. — [AnkiMobile manual, Study Tools](https://docs.ankimobile.net/study-tools.html)
- [x] WCAG 1.4.3 Contrast (Minimum): 4.5:1 for normal text and 3:1 for large-scale text, where large means 18pt, or 14pt bold. The ratio must not be rounded (4.499:1 fails). The 4.5:1 level is chosen to compensate for contrast loss in roughly 20/40 vision. — [W3C WCAG Understanding 1.4.3 source](https://github.com/w3c/wcag/blob/main/understanding/20/contrast-minimum.html)
- [x] WCAG 1.4.11 Non-text contrast: UI components and graphical objects need 3:1. — same source (example given in Understanding 1.4.3)
- [x] Furigana is half the size of the base characters (JLreq), which makes ruby the legibility bottleneck. — [W3C JLreq](https://github.com/w3c/jlreq)

### Inferences

- Swipe right = Good and swipe left = Again, with visible buttons as well (gestures aren't discoverable and some users can't perform them). Provide haptic feedback and undo. The colour cue (red/green) should be paired with a label or icon to meet WCAG 1.4.1 (use of colour). Keep the green/red text against the background at 4.5:1 or better.
- Because kanji strokes are dense, treat the target sentence like "large text" anyway: about 22–28px on phones, with ruby no smaller than about 11–12px.

### Gaps

- No peer-reviewed CJK-specific legibility threshold for phone screens was retrieved. WCAG does not define CJK-specific large-text sizes in the text I read.
- No public documentation of Duolingo, Quizlet, Mochi, or Migaku swipe conventions was retrieved.

## 6. Multiple-choice vs typed/self-graded recall

### Takeaway

With feedback, recall (short-answer, typed or self-graded) produces better retention than MC. MC can help beginners and when feedback is absent. For form (spelling or kanji) knowledge, recall wins.

### Cited Findings

- [E] Kang, McDermott & Roediger (2007): with feedback, short-answer practice gave the greatest retention benefit; without feedback, MC was better because of its higher initial success (88% vs 68%). — [WashU](https://profiles.wustl.edu/en/publications/test-format-and-corrective-feedback-modify-the-effect-of-testing-/)
- [E] McDermott et al. (2014): both MC and short-answer quizzes improved classroom exam performance. — [PDF](https://pdf.retrievalpractice.org/guide/McDermott_etal_2014_JEPA.pdf)
- [E] Nakata (2016): recall beats recognition (MC) for orthographic and productive knowledge, while recognition is adequate when spelling isn't needed. — [De Gruyter](https://www.degruyterbrill.com/document/doi/10.1515/iral-2015-0022/html?lang=en)

### Inferences

- Use self-graded recall (reveal, then Again/Good) as the default. Typing Japanese on mobile, via IME, adds friction and conversion ambiguity, so it is best kept optional for production cards. MC can serve as a first-exposure "intro" step for brand-new words.

### Gaps

- No study found comparing typed vs self-graded (covert) recall specifically within SRS apps.
