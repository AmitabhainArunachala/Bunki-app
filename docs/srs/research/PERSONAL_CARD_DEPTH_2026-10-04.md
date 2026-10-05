# Bunki SRS research: a focused retrieval task inside a rich personal context

Research date: 2026-10-04. This extends the earlier SRS review and supports the personal-collection redesign. The latest learner direction supersedes the earlier visible-English default and treats MCD as an open design question. Scheduling parameters remain unchanged. Implementation and remaining work are recorded in `../PERSONAL_DEPTH_IMPLEMENTATION_2026-10-04.md`.

## Recommendation

Build a **paragraph reader with one graded target** and a layered Japanese answer. Its front preserves the learner's personal passage and visibly marks exactly one target. Its back first resolves that target in Japanese, then becomes a real reading and exploration surface. Correct-answer feedback is mandatory; extra explanation, dictionary exploration, new captures and transfer practice are optional. Keep FSRS6 and its existing scheduling semantics unchanged.

The central distinction is between **information available** and **information required for a successful repetition**. A rich paragraph and rich back can coexist with an atomic retrieval task. There is good causal support for retrieval and feedback, but no direct trial establishes this exact Bunki interface, AJATT MCDs, large backs, Japanese-only definitions, or personal paragraphs as universally superior. Those parts need to be presented as informed design choices and tested for usefulness and cost.

## Five strategies, ranked

### 1. Declare one retrieval contract and protect the attempt

Default vocabulary task: given a marked Japanese expression in its original paragraph, recall its meaning **in this occurrence**. The criterion is semantic understanding, not verbatim recitation of a dictionary definition. Show a small task label such as `この文での意味`; for an actual reading card use `読み方`. Avoid silently combining meaning, reading, pitch, spelling and grammar into one grade.

Make the target unmissable with one accent color, a substantial underline or shape, and a corresponding target label. Neighboring text stays fully readable; it is supporting context, not additional highlighted homework. The full front has no furigana, dictionary activation, grammar popovers, translated hints, answer audio or target-containing accessible labels. Revealing the answer is the single transition to help. Preserve text selection for accessibility only if it cannot trigger the app's lookup.

Evidence: Karpicke & Roediger experimentally manipulated continued retrieval versus continued study of foreign-language pairs; retrieval after initial success benefited delayed recall [S1]. This supports effortful recall before feedback; it does not choose paragraph versus word cards. SuperMemo's minimum-information principle supports a precise answer as a practitioner heuristic [P1].

Tradeoff: full paragraphs can slow reviews and provide cues that make a target guessable. Keep the passage visually stable and spotlight the relevant sentence without collapsing the paragraph or treating all of it as required reading every time. A user who actually remembers a word from context may still be successful at the specified contextual task; isolated recall is a different task.

### 2. Separate fast correction from optional depth

On reveal, retain the paragraph in place, enable all-kanji furigana, and immediately expose a compact answer: target, reading, one Japanese paraphrase tied to this context, and the existing grading controls. Do not require scrolling through explanations or opening panels before grading.

Below that, add optional layers: `使い方`, `似た表現との違い`, `別の場面`, `辞書・漢字`, and a quiet English-reveal control. A contrast should address an actual plausible confusion, not insert a synonym list on every card. Usage examples should illustrate the relevant sense, register or argument pattern, not merely repeat the target. For kanji, show contextual reading first and additional character information only when requested.

Evidence: Butler, Karpicke & Roediger's two experiments found answer feedback improved retention, including low-confidence correct responses [S2]. They tested correct-answer feedback, not huge explanatory backs. Therefore, immediate confirmation is justified; compulsory elaboration is not. Make deeper study easy after an error, but optional after every answer.

Tradeoff: more available content creates temptation to turn each review into a lesson. Grade the original unaided attempt even after studying the back. Looking up a neighboring word after reveal must not retroactively change the target grade.

### 3. Use Japanese first, with a useful English rescue

The primary answer is Japanese: a plain-language paraphrase, relevant usage, and selective contrast. Display source-backed dictionary entries separately from Bunki-written explanations so an AI paraphrase never masquerades as a dictionary quotation. English remains a deliberate per-card action, not a persistent bilingual wall; choosing it should not be punished or framed as failure.

Evidence boundary: the primary L1/L2 gloss study located was Yoshii (2006) [S6], but its full text was blocked during this research, so no detailed finding is claimed here. Even a gloss experiment would not directly settle Japanese-first advanced SRS. Refold's archived original guidance recommends a gradual transition, expandable definitions, and bilingual fallback for burdensome or concrete definitions [P4]. TheMoeWay's original author describes both monolingual and bilingual use and recommends retaining only the sense relevant to the mined sentence [P5]. These are practice reports, not causal evidence.

Tradeoff: Japanese explanations add input and may express nuances well, but unfamiliar definition vocabulary can create a recursive lookup trap. Offer a concise paraphrase before an exhaustive entry. Do not automatically mine every unfamiliar word in a definition or require full monolingual comprehension to grade the original target.

### 4. Anchor in the personal paragraph, then offer bounded transfer

Preserve the source paragraph as the stable home context. Let the revealed back optionally show one genuinely different usage context or a short contrast. Offer a user-chosen “try in another context” practice action or end-of-session sampler; it must not silently change a scheduled card's task, difficulty or FSRS6 history.

Evidence is conditional. Webb (2007) found no significant advantage for one glossed sentence over word pairs across ten vocabulary measures in Japanese learners of English [S3]. Norman et al. found diverse training contexts helped application to new contexts, while same-topic training helped familiar-context performance [S4]. Hulme et al.'s preregistered experiment found better initial semantic recall when new words were embedded in one coherent narrative [S5]. These studies support distinguishing anchoring from generalization, not declaring “more context is always better.”

Tradeoff: automatic daily paraphrasing can sacrifice a helpful memory cue and turn one card into an unstable measurement. Conversely, permanently testing only the same wording risks passage-specific success. Keep optional transfer checks distinct and measure them independently.

### 5. Make lookup and capture real; control review debt through choice

After reveal, every kanji-bearing token should have usable furigana and support actual lookup. A dictionary result needs a lemma, contextual form or deinflection, readings, senses and source provenance. A kanji view needs character data. Grammar lookup needs relevant grammar data rather than reusing a generic vocabulary gloss. Empty/loading/error states must be truthful.

`覚える` should use the app's existing remember workflow with duplicate handling and retain the selected expression and content type. The overlay must return to the original paragraph. Persistently attaching a private collection/paragraph reference and the selected dictionary sense to each saved encounter is a further improvement; the current bridge saves the host's canonical entry identity. Do not turn the whole paragraph into many new cards automatically. Optional captures are available without interrupting the current grade. Yomitan provides a strong original product precedent for lookup-to-card creation and preserving the surface occurrence [P7].

Review quality is more consequential than forcing every possible card layer. Expose a clear finish/pause path, retain progress, and allow repair or suspension of ambiguous cards. No mandatory streak repair, output drill or daily quota is required to access normal reviews. Anki's documented grading contract distinguishes forgetting from difficult success [P6]; retain the existing FSRS6 mapping exactly.

## MCD decision

MCD is a useful option, not the default answer to every learning objective. AJATT's original articles combine substantial context with extremely small deletions, including one kanji at a time. The author's output argument explicitly begins as a hunch/limited experience, and the same article acknowledges users who prefer sentence cards or a mixture [P2–P3]. That is authentic historical practice, not comparative experimental validation.

| Format | Good use | Main risk | Bunki choice |
|---|---|---|
| Highlighted target in paragraph | Meaning in context; natural reading comprehension | Familiar passage may allow guessing | Default for personal vocabulary/sense cards |
| One constrained cloze | Grammar form, a fixed collocation, selected phrase reconstruction | Multiple natural completions; arbitrary exact-match failures | Opt-in and authored with explicit criterion |
| One-character MCD | Intentional kanji spelling practice | Fragment completion does not establish reading/meaning; many sibling cards | Specialized optional mode, not automatic generation |
| Isolated word | Fast recognition outside the source cue | Loses local sense and register | Optional separate practice; do not replace the personal source |
| Free sentence production | User explicitly wants productive use | Time cost and open-ended grading | Optional complementary practice outside the required review loop |

For cloze grammar, show a legitimate alternate answer without branding it ungrammatical. Bunpro's original N1 update documents its effort to distinguish near-valid alternatives, slips and incorrect constructions [P8]. This is a concrete warning against assuming Japanese gaps have a unique answer. If Bunki cannot evaluate alternatives reliably, prefer transparent self-grading with a clear intended target over brittle automatic rejection.

## Specific front/back architecture

### Front: recall mode

1. Quiet session progress and a working exit/pause control.
2. Brief retrieval label: meaning-in-context, reading, or one constrained cloze.
3. One highlighted target inside the original personal paragraph; typography gives the target sentence prominence while preserving surrounding narrative.
4. One primary `答えを見る` action with existing keyboard affordance.

No primary dictionary navigation, ruby, English, explanation preview or accidental hover help. Target highlighting must map to the original text, including tokens split by ruby. Repeated occurrences can refer to the same declared target; they must not introduce additional grading requirements. Handle inflection and overlapping spans explicitly. Missing targets must fail validation before import.

### Back: answer mode plus reading mode

1. The same paragraph stays anchored; ruby becomes available for **all kanji in it**, and lookup is enabled.
2. The compact answer appears immediately: expression, contextual reading, short Japanese explanation, and relevant usage/collocation if brief.
3. Existing four ratings remain readily reachable. Labels explain that failure is failure and hard means successful recall with difficulty; no FSRS parameters, interval formula, due logic, history writes or rating semantics change.
4. Optional Japanese depth: usage / contrast / another context.
5. Separate dictionary/kanji/grammar drawer with real data; capture from any lookup using existing remember behavior.
6. English translation or clarification hidden behind a deliberate per-card reveal.

A subtle futuristic treatment can use restrained translucent surfaces, fine borders, muted navigation, a single luminous target accent and a clear revealed-state transition. It must not dim supporting Japanese below readable contrast or cover the passage with too many pills. Animation should be short and respect reduced motion. This visual recommendation is design judgment, not a learning-science result.

Recommended default balance: open the compact target explanation and a relevant short grammar note when this occurrence needs one. Collapse extended contrasts, alternate contexts and reference detail. Functional color should communicate target/grammar/interactive state consistently; do not decorate every noun or invent unsourced proficiency-level badges. A Japanese explanation is adequate only if it identifies this sense accurately, uses accessible language, resolves the learner's likely ambiguity and does not define the term circularly. The English rescue is a comprehension tool, not a competing default.

## Acceptance criteria and evidence collection

Functional gates: before reveal no app-controlled lookup or answer leakage; after reveal all kanji can receive ruby and actual token/kanji/grammar lookup works; capture persists and deduplicates; English reveal resets on the next card; ratings use the pre-existing scheduler path unchanged; keyboard focus does not skip into hidden content.

Evaluate design with target recall, accuracy in an unfamiliar context, median review time, session completion, optional-panel usage, capture volume and ambiguous-card reports. Separate time spent recalling from time spent exploring the back. Higher raw in-card success alone could reflect stronger contextual cues. “More panels opened” is not automatically better learning. Compare fast-path versus optional-depth behavior before requiring any extra layer.

## Interleaving, interference and broader evidence

The retrieval recommendation is not based on one famous experiment alone. Rowland's 2014 meta-analysis reports larger testing benefits for initial recall than recognition tests [M1]. Pan & Rickard's transfer meta-analysis finds a positive average transfer effect, moderated by the type of transfer [M2]. Neither licenses a claim that any difficult activity improves learning: practice must actually elicit the intended retrieval, and correct feedback must resolve errors.

Interleaving is especially useful to consider when the learner must decide **which known construction fits**, rather than simply produce a previously announced form. Nakata & Suzuki studied 115 Japanese learners practicing five English grammar structures; mixed practice produced more training errors but better one-week grammaticality judgments than blocking [S8]. This gives a plausible basis for an optional contrast practice set after the learner understands the individual structures. It does not require reshuffling Bunki's due queue or modifying its scheduler.

Do not generalize that into “introduce all synonyms together.” Brunmair & Richter's meta-analysis varies substantially by material; its word-learning subset favored blocking [M3]. Nakata & Suzuki's separate vocabulary experiment found more interference errors for semantically related words despite no significant overall related/unrelated posttest difference [S9]. These findings make targeted confusion repair more defensible than adding several unfamiliar lookalikes to every card. An optional compare action should compare two already encountered items using a decisive semantic/register/construction difference and one discriminating example; it should not expand into a taxonomy.

The current user can legitimately prefer rich Japanese material even when a controlled study has not established its superiority. The positive design proposition is to increase _available understanding_ while keeping the _required retrieval_ narrow. Japanese definitions, context, grammar, pitch or audio, kanji structure and contrasts each answer different questions. Their complementarity is useful precisely because they need not all be consumed or graded in every repetition.

## Concrete follow-up experiments

These are proposed experiments, not automatic production behavior. Keep FSRS6 identical across conditions; log experimental practice separately and never disguise exploratory attempts as normal scheduled reviews.

| Question                                            | Comparison                                                                                                | Measures and safeguards                                                                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Does optional depth earn its time?                  | Compact Japanese answer versus same answer plus optional usage/contrast layers                            | Randomly assign matched _new sense-items_; compare delayed contextual meaning accuracy, unfamiliar-context accuracy, total study seconds and completion. Count all exploration time. Keep paragraph, target and scheduling identical.      |
| Does Japanese-first feedback remain comprehensible? | Simple Japanese paraphrase with optional English versus Japanese dictionary excerpt with optional English | Both honor Japanese-first preference. Measure rescue usage, meaning misunderstandings, perceived friction and delayed recall. Check content for equal sense accuracy. Do not infer superiority from lower English usage alone.             |
| When does an MCD help?                              | Highlighted meaning retrieval versus a constrained form/collocation cloze                                 | Analyze comprehension and production separately; use parallel item sets matched on prior knowledge and ambiguity. Do not declare a winner solely from the outcome closest to one format. Have a fluent reviewer verify valid alternatives. |
| Does a second context improve transfer?             | Stable personal context only versus stable context plus one optional different example                    | Test genuinely unseen context at a prespecified later delay; retain source-context accuracy and time as secondary measures. Do not replace the home paragraph.                                                                             |
| Does contrast repair reduce a real confusion?       | Ordinary feedback versus a short discriminating comparison for identified confusions                      | Compare later confusion errors, not just general recall. Start with a small number of personally relevant pairs; avoid new synonym sets.                                                                                                   |

For a single learner, alternate or randomize by item rather than pretending a before/after week is causal: item difficulty, seasonality and enthusiasm change over time. Use new items to reduce contamination from established cards. Preselect one primary outcome and a realistic time ceiling, record external exposure where feasible, and report uncertainty. A pragmatic pilot can establish usability and estimate variability; it should not claim population-level efficacy. Keep the richer default if it improves understanding and enjoyment within the user's time budget even if average recall is indistinguishable.

## Sources and evidence ledger

Scientific sources include primary experiments and original meta-analyses. Community sources are original author or product material. Claims are deliberately narrower than practitioner rhetoric. A learning mechanism, a community testimonial, and a validated whole-app result are distinct forms of evidence.

| ID  | Source and URL                                                                                                                                                                                                                                                    | Strength and relevance                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | Karpicke & Roediger (2008), The Critical Importance of Retrieval for Learning. https://doi.org/10.1126/science.1152408                                                                                                                                            | Strong causal support for retrieval in foreign-language paired associates; indirect for intermediate Japanese paragraphs. Publisher abstract retrieved; direct open failed.  |
| S2  | Butler, Karpicke & Roediger (2008), Correcting a Metacognitive Error. https://learninglab.psych.purdue.edu/downloads/2008/2008_Butler_Karpicke_Roediger_JEPLMC.pdf                                                                                                | Two controlled experiments support correct-answer feedback; general-knowledge tasks, not proof of rich backs.                                                                |
| S3  | Webb (2007), Learning word pairs and glossed sentences. https://journals.sagepub.com/doi/abs/10.1177/1362168806072463                                                                                                                                             | Controlled vocabulary study; useful negative/null evidence against assuming a single context improves all word knowledge. Japanese EFL population, not Japanese L2.          |
| S4  | Norman et al. (2023; online 2022), Contextual diversity during word learning. https://journals.sagepub.com/doi/10.1177/17470218221126976                                                                                                                          | Controlled within-person experiments, 239 adults, pseudowords; generalization benefit is specific to new-context test. Transfer to Japanese SRS is an inference.             |
| S5  | Hulme et al. (2023), Diversity of narrative context disrupts the early stage of learning. https://link.springer.com/article/10.3758/s13423-023-02316-z                                                                                                            | Preregistered controlled experiment, 100 adults, eight pseudowords; coherent narrative aided early meaning recall. Boundary condition, not evidence against later variation. |
| S6  | Yoshii (2006), L1 and L2 Glosses. https://www.lltjournal.org/item/10125-44076/                                                                                                                                                                                    | Primary article located, full PDF blocked. Do not cite numerical or outcome claims from this research pass.                                                                  |
| S7  | Butler (2010), Repeated testing produces superior transfer. https://pubmed.ncbi.nlm.nih.gov/20804289/                                                                                                                                                             | Four experiments reported; supports investigating transfer beyond identical questions. No direct validation of Bunki paragraph format.                                       |
| S8  | Nakata & Suzuki (2019), Mixing Grammar Exercises Facilitates Long-Term Retention. https://onlinelibrary.wiley.com/doi/10.1111/modl.12581 ; author manuscript https://yuichisuzuki.net/wp-content/uploads/2023/04/Nakata-Suzuki-2019-MLJ.pdf                       | Controlled L2 grammar study, 115 Japanese learners of English. One-week judgment outcome; not general proof for word-card mixing.                                            |
| S9  | Nakata & Suzuki (2019), Effects of Massing and Spacing on the Learning of Semantically Related and Unrelated Words. https://doi.org/10.1017/S0272263118000219 ; author manuscript https://yuichisuzuki.net/wp-content/uploads/2023/04/Nakata-Suzuki-2019-SSLA.pdf | Controlled paired-associate vocabulary study. Related items caused more interference errors, with no significant overall relatedness posttest difference.                    |
| M1  | Rowland (2014), The effect of testing versus restudy on retention. https://pubmed.ncbi.nlm.nih.gov/25150680/                                                                                                                                                      | Original meta-analysis, broader evidential support for retrieval; not a direct Bunki trial.                                                                                  |
| M2  | Pan & Rickard (2018), Transfer of test-enhanced learning. https://pubmed.ncbi.nlm.nih.gov/29733621/                                                                                                                                                               | Original meta-analysis; average transfer effect and important outcome moderators.                                                                                            |
| M3  | Brunmair & Richter (2019), Similarity matters. https://pubmed.ncbi.nlm.nih.gov/31556629/ ; https://doi.org/10.1037/bul0000209                                                                                                                                     | Original meta-analysis, 59 studies; domain-dependent interleaving effects. Publisher DOI direct open failed, indexed abstract retrieved.                                     |
| P1  | Wozniak, Twenty rules of formulating knowledge. https://www.supermemo.com/en/blog/twenty-rules-of-formulating-knowledge                                                                                                                                           | Original practitioner guidance. Atomic answer, understand first, cloze; not an RCT of these rules.                                                                           |
| P2  | AJATT, What is it about these MCDs? Part 3: The Format. https://alljapanesealltheti.me/blog/what-is-it-about-these-mcds-part-3/index.html                                                                                                                         | Original MCD community article; practical rationale and testimonials.                                                                                                        |
| P3  | AJATT, What is it about these MCDs? Part 4: The Active Output. https://alljapanesealltheti.me/what-is-it-about-these-mcds-part-4-the-active-output/index.html                                                                                                     | Original community evidence, explicitly limited experience, mixed format preference.                                                                                         |
| P4  | Refold v1, Casual Monolingual Transition. https://refoldroadmapv1.codeberg.page/roadmap/stage-2/b/casual-monolingual-transition/index.html                                                                                                                        | Archived original guidance. Current URL redirects to app-like roadmap with little retrievable body; treat v1 as historical, not current controlled evidence.                 |
| P5  | TheMoeWay, The Shoui Method. https://learnjapanese.moe/shouimethod/                                                                                                                                                                                               | Original detailed autobiographical learning practice. Particularly relevant to relevant-sense grading and flexible dictionary use; causal claims unproven.                   |
| P6  | Anki Manual, Deck Options / Studying. https://docs.ankiweb.net/deck-options ; https://docs.ankiweb.net/studying.html                                                                                                                                              | Authoritative product semantics for review ratings; not a reason to alter Bunki FSRS6.                                                                                       |
| P7  | Yomitan. https://yomitan.wiki/ ; https://yomitan.wiki/anki/                                                                                                                                                                                                       | Authoritative feature/workflow precedent for real lookup and capture, not proof of learning effectiveness.                                                                   |
| P8  | Bunpro staff, N1 Grammar Hint Update (June 2026). https://community.bunpro.jp/t/n1-grammar-hint-update-june-2026/196687                                                                                                                                           | Original product implementation evidence for alternate-answer complexity; not an efficacy experiment.                                                                        |

## Claims to avoid

- “MCDs are scientifically superior to sentence or vocabulary cards.” No direct comparison identified.
- “Japanese-to-Japanese eliminates translation and always learns faster.” Not established; dictionary accessibility and task matter.
- “Every review should include reading, pronunciation, output, comparison and kanji analysis.” That combines objectives and imposes untested time cost.
- “Richer backs improve retention.” Correct-answer feedback has evidence; unlimited optional content is a design affordance, not the same intervention.
- “Changing the context every time makes the scheduler more accurate.” No evidence supplied, and it changes the measured task.
- “Minimum information means no paragraph.” It concerns what must be retrieved; context can be rich while the answer remains narrow.

## Further design conclusions

- **Use color for roles before levels.** One target accent, quieter grammar/relationship treatments, and explicit labels are useful interface signals. An N1/N2 color must come from disclosed source metadata. The [official JLPT FAQ](https://www.jlpt.jp/e/faq/) explains why exhaustive vocabulary, kanji and grammar lists are no longer published. Specialist vocabulary and difficult ideas are not automatically N1.
- **Furigana is an annotation problem.** Whole lexical/contextual readings need review; isolated character alignment is unsafe for jukujikun and specialist compounds. Every enriched paragraph must reconstruct the original exactly, with no kanji-bearing segment missing a reading. Japanese explanatory text should get the same support.
- **Improve latency at the actual bottleneck.** The present needs are typography, hierarchy, local data access and state-preserving overlays. A Rust rewrite would not itself improve the learning contract or visual design. Keep the current app architecture and measure response time before choosing a new runtime.
- **Keep full content private.** Package reusable UI and synthetic tests publicly. Import the personal passages and answer guides onto the learner's device. Local dictionary assets are permitted; sending a paragraph to an external tokenizer or explanation service is not necessary for this experience.
- **Treat richness as a resource budget.** Useful next additions are verified audio/pitch, a second context tied to the same sense, confusion-specific repair, and encounter backlinks. They require source/identity/quality work. Auto-generating every variant or decorating every token can increase review burden without establishing transfer.
