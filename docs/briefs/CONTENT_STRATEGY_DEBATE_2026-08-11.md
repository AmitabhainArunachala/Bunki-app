# Content strategy debate — Grok's position vs mine (2026-08-11)

Researched, then argued. Facts first, verdicts second, revised strategy
third. No diplomacy.

## What the research actually says

**The comparators:**

- Satori Reader: 1,625+ episodes across 42 series, weekly additions —
  and by its own description "written or adapted for **intermediate**
  Japanese learners."
- Shinobi: 455 stories, 91 levels — the product's own site banner reads
  "**JLPT N5 to N2**." It does not even serve the N1-bound reader.
- Todaii: 31,076 articles — scraped news feeds (NHK, CNN, BBC, Asahi)
  with a dictionary overlay, updated daily. Not an editorial library; an
  instrumented news pipe.

**The reading science:**

- Hu & Nation (2000; replicated Kremmel et al. 2023): unassisted adequate
  comprehension needs ~**98% lexical coverage**; at 90–95% most learners
  fail to reach it. Nation (2006): 98% coverage of newspapers/novels ≈
  **8,000–9,000 word families**.
- Nation's Four Strands: **fluency development is a co-equal strand**,
  requiring material with essentially zero unknown items, read fast.
  Timed reading, repeated reading, and easy extensive reading all
  measurably raise L2 reading rates; 200–250 wpm is achievable with
  controlled material.
- JLPT N1: 110 minutes for language knowledge + reading combined;
  practical guidance converges on **~250–300 characters/minute** to
  finish the reading section. The N1 clock is a fluency test as much as
  a knowledge test.

## Where I concede — Grok is right, twice

**1. My strategy had no fluency strand. That is a real hole, and Grok
found it.** I dismissed graded material with "he doesn't need graded
content," which conflated two different functions. For _comprehension_,
he doesn't need simplified text — true. For _reading speed_, the research
is unambiguous: speed is built on material at ~98%+ coverage, read fast,
in volume — and struggle-reading 92%-coverage editorials does not build
it. His goal has a literal clock on it: the N1 reading section fails
people on speed, not comprehension. A dedicated speed lane with easy
material and a timer is not a beginner's crutch; it is N1 training.
Full concession.

**2. The 40-article shelf is blocking _now_, and my remedy was
future-tense.** I leaned on bring-your-own-text and pipeline scale-up —
neither of which exists yet in the shipped app. Until they ship, the
shelf is the entire reading surface, and at his reading rate 40 articles
is roughly two weeks of material. Choice also matters independently
(self-selection is a load-bearing principle of extensive reading — reading
what pulls you is what makes you return daily). The content work is a
this-week problem, not a phase-2 problem. Conceded, and the build order
moves accordingly.

## Where I hold — Grok's evidence is weaker than his conclusion

**1. The comparator numbers are a category error, and one comparator
argues for my side.** Grok's scale table mixes three different content
classes. Shinobi (455 stories, N5–N2) does not serve this user at all —
citing it in an argument about an N1-bound reader is padding. Satori's
1,625 episodes are intermediate-targeted; the at-his-level inventory is a
modest fraction of the number on the box, and a static library at the
wrong level is not volume for him. And Todaii — the biggest number in the
list — is _not an editorial library at all_: it is scraped authentic news
with furigana and a dictionary bolted on. In other words, the only
comparator that operates at "volume" achieves it with exactly the
architecture I proposed: an automated authentic pipe plus
instrumentation. Todaii is not evidence against my strategy; it is my
strategy, shipped by someone else.

**2. Stock is the wrong metric; flow at level is the right one.** For a
newspaper-reading goal, what matters is fresh at-register material per
week, forever. Satori adds a handful of episodes weekly; the in-repo
wikinews pipeline can produce 20–40 genuine newsprint-register articles
weekly, inexhaustibly, legally. A 1,625-stock intermediate library is
worth less to this user than a 30/week newsprint flow. Volume matters —
Grok is right — but the unit is articles-per-week-at-level, not
articles-in-database.

**3. "A real graded layer" cannot be sourced honestly — and doesn't need
to be.** The options for true graded content are: license Satori's
(unavailable), pipe NHK Easy (verified token-walled behind a paid
receiving contract — dead end, documented in the Wayfinder research), or
hand-write hundreds of graded articles (years of editorial work). But the
research says the operative variable was never "graded-ness" — it is
**coverage percent relative to the reader**. Satori grades against a
population; KAIRO holds something Satori structurally cannot: this
learner's actual knowledge state (mature FSRS items + capture history +
tap log) and a tokenizer. It can therefore compute **personal coverage**
for any text — the percent of tokens he demonstrably knows — and route
texts accordingly. A text at ≥98% _personal_ coverage IS graded material
for him, whatever its origin. That is a stronger implementation of Grok's
layer 2 than the thing Grok asked for.

## Revised strategy — four lanes, mapped to the Four Strands

The personal-coverage router sits under everything: every text (pipeline,
generated, pasted) is tokenized and scored against his known-item set.

1. **Study lane** (meaning-focused input + language-focused learning):
   authentic wikinews + Aozora + BYOT at **90–97% personal coverage** —
   the stretch zone, instrumented, feeding capture. Pipeline run weekly;
   shelf to 300+ by October.
2. **Speed lane** (fluency development — new, conceded to Grok): texts at
   **≥98% personal coverage**, read against a gentle timer, with
   chars/minute logged per session and charted toward the 250–300 cpm N1
   band. Sources, in cost order: (a) **repeated timed reading of articles
   he already studied** — research-backed, zero new content; (b) easy
   authentic (Aozora young-readers tier, light prose); (c) **generated
   easy text** — the one place generation is structurally unbeatable,
   because the generator knows his known-set and can hit 98%+ coverage
   by construction, in newsprint register, on current topics.
3. **Bring-your-own-text** (kuromoji in-browser): unchanged — the only
   route to _books_, which no library ships. First-class, deeply
   instrumented.
4. **Gap-targeted generation**: demoted from "30% of diet" to a precision
   instrument — rigged re-encounters with this week's failure clusters —
   plus feedstock for lane 2. Always provenance-marked.

Suggested time split for the trial weeks: ~50% study lane, ~30% speed
lane, ~20% review-driven re-reading. Weekly numbers on the weakness map:
articles read, cpm trend, coverage distribution of what he chose.

## Net verdict

Grok wins the two framing fights that matter — the missing fluency strand
and the urgency of volume — and the revised plan changes because of them.
Grok loses the evidence fight: two of three comparators don't serve this
user's level, the third is an automated pipe that vindicates the pipeline
architecture, and "a real graded layer" is neither obtainable nor, per
the coverage research, the actual requirement. The synthesis — a
personal-coverage router over authentic flow, with a timed speed lane —
is better than either original position, and every piece of it runs on
infrastructure this repo already has: the tokenizer, the grader, the
knowledge state, the log.

## Sources

- [Satori Reader — how it works](https://www.satorireader.com/how-it-works) · [features](https://www.satorireader.com/features) · [GaijinPot review](https://blog.gaijinpot.com/satori-reader-online-tool-japanese-reading-skills-next-level/)
- [Shinobi Japanese — official site (N5 to N2)](https://www.shinobi-japanese.com/) · [AppBrain listing (455 stories, 91 levels)](https://www.appbrain.com/app/shinobi-learn-japanese/com.shinobiapp.shinobi)
- [Todaii — App Store (31,076 articles, NHK/CNN/BBC/Asahi)](https://apps.apple.com/us/app/todaii-learn-japanese-n5-n1/id1107177166) · [Tofugu review](https://www.tofugu.com/reviews/todai-easy-japanese-news-app/)
- [Hu & Nation 2000 replication — Kremmel et al., Language Learning 2023](https://onlinelibrary.wiley.com/doi/10.1111/lang.12622) · [coverage research overview](https://gianfrancoconti.com/2025/02/27/why-the-input-we-give-our-learners-must-be-95-98-comprehensible-in-order-to-enhance-language-acquisition-the-theory-and-the-research-evidence/)
- [Nation 2006 — vocabulary size for reading/listening](https://www.researchgate.net/publication/239928724_How_Large_a_Vocabulary_Is_Needed_for_Reading_and_Listening) · [Webb & Nation 2008](https://www.wgtn.ac.nz/lals/resources/paul-nations-resources/paul-nations-publications/publications/documents/2008-Webb-Evaluating-vocabulary-load.pdf)
- [Nation — The Four Strands](https://www.academia.edu/41764855/The_Four_Strands) · [Timed + repeated reading fluency study, System 2022](https://www.sciencedirect.com/science/article/abs/pii/S0346251X22000835) · [ER + speed reading integration, JALT](https://jalt-publications.org/content/index.php/jer/article/download/1206/112/6996)
- [JLPT official test sections](https://www.jlpt.jp/sp/e/guideline/testsections.html) · [N1 reading strategy (250–300 cpm guidance)](https://jlptjapanesetest.com/reading-section-strategies-for-jlpt/)
