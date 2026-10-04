# What Japanese self-study / immersion communities prescribe for sentence-based vocabulary SRS cards

**Access notes:** The network egress proxy blocked most community websites directly: animecards.site, tatsumoto.neocities.org, learnjapanese.moe, refold.la, web.archive.org, ankiweb.net, reddit, japaneselevelup.com, chinese-forums.com and kumasensei.net all returned EGRESS_BLOCKED, and alljapaneseallthetime.com no longer resolves. GitHub was reachable, so the following primary sources were read in full from their **source repositories**:

- **AJATT:** the full Khatzumoto blog archive at `github.com/all-japanese-all-the-time/all-japanese-all-the-time`, an HTML mirror of alljapaneseallthetime.com/blog.
- **Tatsumoto:** the Markdown source of the site at `github.com/tatsumoto-ren/tatsumoto-ren.github.io`. Its README says it mirrors tatsumoto.neocities.org and ajatt.top.
- **TheMoeWay:** the Markdown source of learnjapanese.moe at `github.com/shoui520/shoui520.github.io`.
- **kuri's guide:** donkuri's built guide at `github.com/donkuri/learn-japanese`.
- **Decks and note types:** the READMEs and docs for Kaishi, Lapis, jp-mining-note (both the Aquafina original and the arbyste fork), Kiku, and friedrich-de's Basic-Mining-Deck.

**Refold/Matt vs Japan and Animecards could NOT be read first-hand.** Claims about them below come only from search-engine snippets and second-hand descriptions in other primary sources, and are flagged that way. Links to blog posts use the public URL. The text was verified against the repository copy.

---

## 1. AJATT (Khatzumoto): 10,000 Sentences → MCDs, and "delete freely"

### Takeaway

The original "10,000 Sentences" method (c. 2006–2008) used one native sentence per card, shown as a recognition card: Japanese sentence on the front, no furigana, and a reading, definition and optional translation on the back. Sentences were kept short. Khatz's limit for Japanese was a hard 30 characters, with most cards at 10–15. Around 2010 he replaced this with MCDs (Massive-Context Cloze Deletions). An MCD keeps a large native passage on the front and blanks out only one tiny unit: one kanji, one particle, or one word chunk. One passage produces many cards, one per unknown. Throughout, AJATT insists on aggressive card deletion ("If in doubt, throw it out") but warns against wiping the whole deck.

### Cited Findings

**Original 10,000 Sentences method**

- Pace: "you can easily learn about 50 every day no sweat… Don't freak out if you only do 15-25 every day. The important thing is to learn every day." — [AJATT, 10,000 Sentences: How](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-how) (orig. alljapaneseallthetime.com/blog/10000-sentences-how)
- Pass criteria for a sentence:
  1. "Read it in full, aloud, with kanji, no furigana"
  2. "Know the meaning of every word"
  3. "Understand the meaning of the entire sentence"
  4. Copy it out by hand (optional)

  Translations "in the 'answer' field" are only "a check of your understanding". — [same](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-how)

- **Recognition only; production from English is explicitly rejected:** "Do not translate from English to Japanese… there are so many possible translations for a given sentence, how are you going to say which is right… Good Japanese starts with mindlessly imitating good Japanese. Don't go inventing your own Japanese." Also: "Do not memorize the sentences." — [same](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-how)
- **Sentence selection (i+1 in all but name):** "Pick the ones that stretch your knowledge slightly, not so much that you're lost, and not so little that you're simply tagging 'です' on the end… learn [a noun] with the verbs that act on it… Picking the ones you'd like to say or write one day is an excellent start." — [AJATT, 10,000 Sentences: Where](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-where)
- **Source trustworthiness:** Use native sources. He warns that WWWJDIC/Tanaka example sentences "sometimes contain errors… I would avoid them to be safe… when sentences are your primary learning medium, you need to be able to trust what you read 100%." He also warns against Yahoo dictionary sentences labelled 慣用表現 as "awkward". Rigorously edited paper-derived dictionaries are preferred. — [same](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-where)
- **Early content priority:** demonstratives, then interrogatives, indefinite pronouns, particles and conjunctions, then native Japanese words (especially action verbs). Avoid stiff Sino-Japanese vocabulary in favour of natural everyday phrasing. — [AJATT, More on What Sentences to Learn](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-more-on-what-sentences-to-learn)
- **Length:** "KISS: Keep It Short and Sweet… Break up long sentences… commas, pronouns, and particles… generally represent a good breaking point… hard upper limit 30 characters (kanji-kana mix), with most items being 10-15 characters long… Earlier in your journey… 5-10 character range." He suggests putting the full original sentence on the answer side for reference. Example: a long news sentence was trimmed to 「捨てぜりふを発した。」. — [AJATT, Popping Bubblewrap: Tips for Better SRS Sentence Items](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/popping-bubblewrap-tips-for-better-srs-sentence-items)
- **Card format example ("Real Sample Sentences"):** QUESTION is the bare native sentence, e.g. 「ＩＴ革命において、主要先進国のナショナルフラッグキャリアは熾烈な国際競争を繰り広げ、」. ANSWER is a dictionary entry for the unknown word only (しれつ【熾烈】…). The answer has no full translation. — [AJATT, Real Sample Sentences](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/real-sample-sentences)
- **Friction:** quoting reader きのこ approvingly: "No sentences I have to type in… If the word or phrase is that important, I figure I'll meet it again somewhere more convenient." — [AJATT, SRS Convenience: copy-paste only](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/srs-convenience-and-logistics-with-sentences-copy-paste-only-no-typing-in)

**"10,000 Sentences is Dead, Long Live MCDs"**

- "On October 18, 2010, my sentence deck breathed its final breath… actually about 15,000 sentence cards died that day." MCD = "Massive-Context Cloze Deletions". There are also "miniMCDs or μMCDs (microMCDs)", so not every MCD has to be massive. He does not demand that you delete your old sentence deck. Instead he suggests "Make a new, separate, MCD-only deck… convert some of your favorite and/or most problematic sentence cards into MCD cards." — [AJATT, 10,000 Sentences is Dead. Let the MCD Revolution Begin!](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-is-dead-long-live-mcds)
- Claimed benefits, quoted:
  - "MCDs free you from the shackles, the crushingly unnatural brevity of short, near-context-less sentences… [and] from the mental and physical burden of overly long sentence cards"
  - "forgiving of the incomplete knowledge of… beginners… because you only have to get the hidden text right"
  - "only a single point of comparison/failure"
  - "train both vocabulary and grammar"
  - "Everything becomes i+1, because we're only ever handling one thing at a time."
  - Khatz says other cloze examples (SuperMemo, Wikipedia) "would make very bad (difficult, ineffective) MCDs".

  — [same](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-is-dead-long-live-mcds)

- **How small the deletion is:** "Never quiz yourself on two kanji at once… instead of having one card with a nine kanji term… I've got nine cards with one kanji to remember." — [AJATT, What is it about these MCDs? Part 3: The Format](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/what-is-it-about-these-mcds-part-3)
- **How big the context is (worked example):** the front is a full ~3-sentence paragraph with "############収". The back is 吸, plus the 吸収 dictionary entry and the full paragraph. "It's hiding just one kanji… The extra stuff is just to give you context… It's not there to be read – just glanced at until you recall the answer." — [AJATT, What is it about these MCDs? Part 1](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/what-is-it-about-these-mcds-part-1)
- **Cards per source text:** "the basic MCD principle is this: instead of having 1 card with 9 unknowns, you have 9 cards with 1 unknown each. But you keep the same massive context." Worked examples:
  - 感覚を研ぎ澄ますことじゃ。そうすればわかる。 → separate cards blanking 感, 覚, 研ぎ澄ま, すれば.
  - 一緒に行きます → separate cards blanking 緒 and に.

  The back holds the answer plus dictionary entry, readings and audio. — [AJATT, 12 Free MCD Examples](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/12-free-mcd-examples)

- **Three MCD types:**
  - Bilingual: Japanese plus an English sentence translation on the front. For beginners. "don't go writing your own translations. If you're noob enough to need a translation, ya shouldn't be rolling your own."
  - Transitional: clozes in J-J dictionary definitions of words you already know, with an English gloss on the back.
  - Monolingual: long native passages, e.g. Yahoo!知恵袋 posts and news articles.

  — [12 Free MCD Examples](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/12-free-mcd-examples)

- **Furigana:** Khatz first advised removing all furigana from MCD fronts. Later he reversed this: "you actually want to leave the furigana there, right on the front… [base clozetexts] はんね 半値". These base clozes undergo "combinatorial explosion", e.g. 9 clozetexts from はんね/半値. The rationale is that this separates testing the reading from testing the kanji. — [AJATT, A New MCD Card Format for Japanese](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/a-new-mcd-card-format-for-japanese-even-lazier-and-more-effective-than-before)
- **Automation:** "Surusu can create up to 512 MCDs in a single click". There was also an Anki "MCD Support" plugin: you paste a passage, then list the clozes space-separated. — [AJATT, MCDs BONUS: The Easy Button](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/what-is-it-about-these-mcds-bonus-the-easy-button)
- **Comprehension caveat:** "If you don't get it, don't use it… If it's too hard or boring, delete it." — [AJATT, MCDs: But What If I Don't Understand the Meaning of the Whole?](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/mcds-but-what-if-i-dont-understand-the-meaning-of-the-whole)

**Deletion and anti-perfectionism**

- "If in doubt, throw it out. Delete that card… Cards you're ambivalent about are worse than cards that you hate… deletion is just another form of rep. Delete those SRS cards with extreme prejudice." — [AJATT, SRS: If In Doubt, Throw It Out](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/srs-if-in-doubt-throw-it-out-ambivalence-is-the-greatest-enemy)
- "Expect to have to delete sentences… not deleting… implies that you make 100% perfect item entry decisions on the front end… Typos, bad judgment, bad writing and misunderstanding do creep in… leeches and duds that are too obtuse or too obscure or too long or too irrelevant." — [AJATT, Secrets to Smoother SRSing Part 4: Collect 'Em to Throw Away](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/secrets-to-smoother-srsing-part-4-collect-em-to-throw-away)
- The limit on deletion: "Point deletion good. Bulk deletion good. Total deletion bad." This covers leech-killing and statistical culling, but not clean-slate resets. — [AJATT, SRS: How Not To Delete Cards](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/srs-how-not-to-delete-cards)

### Inferences

- An MCD is effectively a cloze card with a production-style answer: you recall the hidden kanji or word. The MCD posts give no numeric context size. The examples run from one sentence (12 Free Examples) to a full paragraph (Part 1). In practice "massive" means as much native context as the source naturally gives, and the deletion is a single kanji, kana chunk, or particle.
- The two AJATT eras disagree on length. In 2008 Khatz says keep sentences short (≤30 chars). In 2010+ he says long context is fine because only the blank is tested. The reconciling principle is the same in both: test one thing per card.

### Gaps

- The paid "MCD Revolution Kit" (MCD 101, etc.) was not available, so any finer rules in it are unknown.
- Khatz never gives a recommended daily new-MCD count in the free posts I read.

---

## 2. Tatsumoto (AJATT successor; Ankidrone decks): Targeted Sentence Cards

### Takeaway

Tatsumoto's default is the **Targeted Sentence Card (TSC)**:

- Front: a native sentence (or a few) with the target word **bolded**.
- Back: the definition, plus audio, picture and pitch accent if available.
- Grading: on the target word only.
- Mining: prefer "1T" sentences (exactly one unknown), ideally the original sentence the word was found in.
- Recognition only, apart from optional handwriting production TSCs.
- No furigana on the front.
- 10–30 new cards a day.
- Leech threshold 4–6, then suspend and fix.
- Cards should be kept long-term.
- He is explicitly sceptical of MCD/cloze cards and of LLM explanations.

### Cited Findings

- **Card taxonomy:** Simple Word Cards, Word Context Cards (word front, sentence back, i.e. "animecards"), sentence cards, and TSCs. "Card templates are differentiated by what you put on the front." The governing principle is "practice how you play… the preference is given to card formats that have sentences in them." — [Tatsumoto, Discussing various card templates](https://tatsumoto-ren.github.io/blog/discussing-various-card-templates.html)
- **Word cards** are only for concrete nouns: "word cards should comprise around 15% of your total number of cards." — [same](https://tatsumoto-ren.github.io/blog/discussing-various-card-templates.html)
- **Sentence cards** contain "**one** unknown word or phrase", and they "originate from Antimoon". Weaknesses: "On average, it takes 20 seconds to answer a sentence card", and they create "context-dependent memories". — [same](https://tatsumoto-ren.github.io/blog/discussing-various-card-templates.html)
- **TSC definition:** "you always **highlight** the target word… If you accidentally forget some part that is not highlighted, it shouldn't be taken into account when grading." On the back, "it is enough to write the definition… You can also include the translation of the entire sentence, although in the AJATT method, this is usually not practiced." There are three review modes: read the full sentence, read the full sentence but grade only the target, or read only the target and nearby words. "When learning a targeted sentence card for the first time, make sure to read and understand the sentence fully." — [same](https://tatsumoto-ren.github.io/blog/discussing-various-card-templates.html)
- **Claimed TSC gains:** "up to 2 times faster compared to sentence cards" when reading the full sentence, and "up to 4 times faster" when reading only the target. "Any length will do… Often short sentences lack enough context." "Keep your cards": he rejects deleting cards at a fixed interval and calls that idea "a cope invented to deal with" slow sentence-card reviews. — [same](https://tatsumoto-ren.github.io/blog/discussing-various-card-templates.html); see also [Thoughts on removing cards once they pass a certain interval](https://tatsumoto-ren.github.io/blog/thoughts-on-removing-cards-once-they-pass-a-certain-interval.html), which says only retire cards at intervals of "10-15 years".
- **1T rule:** 0T / 1T / MT sentences. "only take 1T sentences and avoid MT… If you have several words you want to learn, create different targeted sentence cards for each… Don't fail a card because you couldn't recall a word that is not the target." Premade basic-vocab decks exist "to 'unlock' as many 1T sentences as possible". He also distinguishes 1T from Krashen's i+1. — [Tatsumoto, One target sentences](https://tatsumoto-ren.github.io/blog/one-target-sentences.html)
- **Mining process:** "We recommend picking the original sentence you found the word in. Using a sentence from a familiar source greatly aids memorization." If the sentence is MT, substitute one from a sentence bank (subs2srs decks of anime/drama, etc.). For words with several meanings, "Make separate cards for other meanings when it's necessary." "the question field may contain more than one sentence if it helps… However, prefer examples that aren't too long… It's okay to add parts of longer sentences… The clause must remain grammatically correct." — [Tatsumoto, Sentence mining](https://tatsumoto-ren.github.io/blog/sentence-mining.html)
- **MT sentences are tolerable on TSCs:** "If you're using TSCs, you can learn MT sentences just fine… what you really need to make sure is that you fully understand the target word." — [Is it OK to make cards for sentences I don't fully understand?](https://tatsumoto-ren.github.io/blog/is-it-ok-to-make-cards-for-sentences-i-dont-fully-understand.html)
- **On MCDs/cloze:** "Essentially they are just cloze cards… there is always an infinite number of answers for any given 'fill in the blank' question. For this reason cloze cards stop working once the intervals grow big enough. You either memorize the card itself… Or you just guess… I can't imagine a good application for MCDs and cloze cards in general when learning languages." His production alternative is "production TSCs": the word is shown in kana in context, and you write the kanji. — [Tatsumoto, What do you think of using MCDs to train production?](https://tatsumoto-ren.github.io/blog/what-do-you-think-of-using-mcds-to-train-production.html)
- **Recognition vs production:** "The AJATT method recommends using only recognition cards… Production cards are used in AJATT, but only where the task is to write a word by hand given its Japanese pronunciation and an example sentence." — [Is it worth making production cards?](https://tatsumoto-ren.github.io/blog/is-it-worth-making-production-cards.html)
- **Furigana:** "If you add furigana on the front of your cards, you're not going to learn the readings." For trouble kanji, he makes several TSCs with _different words_ sharing the kanji (悠々 / 悠長 / 悠久). — [I forget kanji readings in sentences, should I use furigana?](https://tatsumoto-ren.github.io/blog/i-forget-kanji-readings-in-sentences-should-i-use-furigana.html)
- **Kana words:** "if it **can** technically be written in kanji… kanjify it when making a flashcard." — [How should I make cards for Japanese words that don't have any kanji?](https://tatsumoto-ren.github.io/blog/how-should-i-make-cards-for-japanese-words-that-dont-have-any-kanji.html)
- **Audio:** "Don't put audio on the front of your cards" (on Tango TSCs). — [Do your Tango decks have audio or text on the front?](https://tatsumoto-ren.github.io/blog/do-your-tango-decks-have-audio-or-text-on-the-front.html)
- **Pacing:** "We recommend learning **10–30 new cards per day**… start with 10 new cards a day and see how it goes." — [Sentence mining § Daily amount](https://tatsumoto-ren.github.io/blog/sentence-mining.html); [How many new cards to learn each day](https://tatsumoto-ren.github.io/blog/how-many-new-cards-to-learn-each-day.html)
- **Scheduler settings:** learning steps "1 10" for beginners. He is sceptical of FSRS: "Update: FSRS appears to be a dead end." — [Setting up Anki](https://tatsumoto-ren.github.io/blog/setting-up-anki.html)
- **Leeches:** "Keep the leech threshold low (4-6 lapses) and suspend the cards when they become leeches… After you've neutralized a leech… Change the content of the card to make it easier to memorize or just wait until your brain is ready to learn it again." — [How to review § Leeches](https://tatsumoto-ren.github.io/blog/how-to-review.html); [Setting up Anki § Leech threshold](https://tatsumoto-ren.github.io/blog/setting-up-anki.html)
- **On Animecards/WCCs:** "WCCs are harder than TSCs due to the lack of visible context… WCCs violate the _practice how you play_ principle." He concedes that "the memories that you create are less likely to be context-dependent". — [What do you think of Animecards?](https://tatsumoto-ren.github.io/blog/what-do-you-think-of-animecards.html)
- **Bias:** Tatsumoto is openly hostile to Matt vs Japan and Refold ("Refooled is another scam site"). Treat his characterisation of Refold as partisan. — [Should I trust mattvsjapan and the Refold site?](https://tatsumoto-ren.github.io/blog/should-i-trust-mattvsjapan-and-the-refold-site.html)

### Inferences

- In Tatsumoto's model the "one target per card" rule plays the role of AJATT's "one unknown per MCD". The difference is that the target is bolded and recognised, not blanked and recalled. This directly avoids the cloze-guessing problem he raises.

### Gaps

- No explicit numeric sentence-length cap. He says only "prefer examples that aren't too long".

---

## 3. Matt vs Japan / MIA / Refold

### Takeaway (low confidence: primary pages unreachable)

Refold's documentation could not be fetched. From search snippets: Refold teaches sentence mining of "1T" sentences from immersion, a low new-card rate (5–10/day), Pass/Fail grading, and FSRS in current docs. Earlier MIA/Refold "Low-Key Anki" settings were starting ease 131% and interval modifier ~1.9. MIA/Refold's history of recognition cards and a monolingual transition comes mainly from second-hand accounts.

### Cited Findings

- **Pacing:** Refold recommends "5–10 new cards per day, with 5–7 for total beginners and 10 for those who have studied the language before". It warns that 20–30/day is "like trying to sprint through a marathon". — search snippet of [Refold Roadmap Library, Learning words with Anki](https://refold.la/roadmap/library/learning-words-with-anki) (page itself blocked; unverified wording)
- **Settings:** Refold's roadmap gives "Starting ease: 1.31; New interval: 0.50; Interval modifier: 1.91". It says users can ignore Hard/Easy or use a pass/fail add-on, and current guidance says to enable FSRS. — search snippets of [Refold, Anki setup](https://refold.la/roadmap/stage-1/a/anki-setup/) and [Refold blog, How to use Anki](https://refold.la/blog/how-to-use-anki) (unverified wording)
- **Low-Key Anki (MIA):** this was a Pass/Fail add-on plus a "No Penalties or Boosting" add-on, which keeps the ease factor fixed, and a ResetEZ add-on that resets all cards to 250% ease "to swiftly escape from 'ease hell'". — [LowKeyAnki README quoting massimmersionapproach.com](https://github.com/brianbaquiran/LowKeyAnki)
- **Sentence mining:** Refold's "Advanced sentence mining" page uses "1T sentences", meaning "low-hanging fruit… 1 (or maybe 2) unknown words". — search snippet of [Refold Stage 2B advanced sentence mining](https://refold.la/roadmap/stage-2/b/advanced-sentence-mining/) (unverified)
- **Refold's paid deck:** it claims "over 90% of the sentences are 1T" when learned in order. — search snippet of [Refold, Fundamental Vocabulary to Learn Japanese](https://refold.la/decks/buy/fundamental-vocabulary-to-learn-japanese)
- **Shoui's account:** Shoui says discovering "AJATT through Matt vs. Japan" taught him "tolerating ambiguity" and raw listening. — [TheMoeWay, Shoui method](https://learnjapanese.moe/shouimethod/) (source: github.com/shoui520/shoui520.github.io)
- **Tatsumoto's partisan view:** "Refold started out as a copy of AJATT with some parts reworded… directed at casual language learners." — [Tatsumoto, How much more efficient is AJATT than Refold?](https://tatsumoto-ren.github.io/blog/how-much-more-efficient-is-ajatt-than-refold.html)

### Inferences

- Refold's 5–10/day is the most conservative pacing of any community surveyed. For comparison: Tatsumoto recommends 10–30, TheMoeWay 20 (10 if overwhelmed), and the 2006 AJATT post says 15–50.

### Gaps

- I could not verify Refold's exact current card format: word-front vs sentence-front, its monolingual transition criteria, its leech advice, or Matt's MIA "sentence card → word card" evolution. All refold.la and massimmersionapproach pages were blocked. **Treat all Refold specifics above as unverified.**

---

## 4. TheMoeWay (learnjapanese.moe), kuri's guide, Animecards, and the Yomitan note types (JPMN, Lapis, Kiku)

### Takeaway

The current TMW/kuri ecosystem has moved toward **word-front cards**: either a plain vocab card or the word with the mined sentence shown as a hint below it. These are made with one click from Yomitan into **Lapis** (TMW's default), JPMN, or Kiku. Back fields: reading/furigana, the chosen definition (bilingual first, monolingual later), word and sentence audio, pitch, a picture, and a harmonic frequency rank for sorting.

On pacing and leeches:

- About 20 new cards/day.
- Pass/Fail grading.
- FSRS at 80–95% retention.
- Mine "everything" with minimal effort.

Note types expose an `Is…Card` switch so the same note can be a vocab card, word+sentence card, click card, sentence card, or audio/cloze card.

### Cited Findings

**TheMoeWay / Shoui**

- Card format: "In my method, I put both the sentence and the word on the front. But I rarely ever read the sentence, it was just there for visual context… if youre the type to use that sentence as a crutch, then remove the `y`… more reflective of real world use without being tiresome and too easy at the same time like sentence cards." This is set by `IsWordAndSentenceCard: y` in Lapis. — [TheMoeWay, Shoui method § Mining setup](https://learnjapanese.moe/shouimethod/)
- Grading: "the most crucial piece of information has always been the **MEANING**, and then the **reading**… Only the relevant meaning used in the sentence is ENOUGH… I always used PassFail." For pitch, he later graded on "whether I got at least one (1) pitch pattern correct". — [same](https://learnjapanese.moe/shouimethod/)
- Pacing and settings:
  - "Do Kaishi at the default rate of 20 cards per day… for some I recommend 10."
  - Deck options: "Maximum reviews/day: 9999; Learning steps: 1m 5m 10m; New/review order: Show after reviews; FSRS: ON; Desired retention: 80%-95%". He personally used 95%, but says "80%-90% is best for most".

  — [same](https://learnjapanese.moe/shouimethod/)

- Mining philosophy: "My mining philosophy is to **mine everything**… as minimal effort… as possible… just clicking the green button." "Complex cards with full context and pictures are super overrated." "Never complicate the mining process." — [same](https://learnjapanese.moe/shouimethod/)
- Deletion: "I delete all my Anki decks almost every year… I would even consider a yearly deck refresh part of the shoui method." This openly contradicts both Khatzumoto's "total deletion bad" and Tatsumoto's "keep your cards". He also warns about "mis-mines (cards you add… that are not actually the word/structure used in the text because you were too low-skill to parse the sentence)". — [same](https://learnjapanese.moe/shouimethod/)
- When to start mining: "You should be ready to take the plunge at around 1000 words learned… 'Your mining deck will be easier and more effective than Kaishi/Core.'" — [same](https://learnjapanese.moe/shouimethod/)
- Sentence-card grading rule (TMW FAQ): "if the definition on the back made you understand the sentence better, then grade it as a Fail." For monolingual cards: "You just need to remember the gist of the definition." The FAQ also recommends AnimeCards as "quick and simple to make and review". — [TheMoeWay FAQ](https://learnjapanese.moe/faq/) (source: docs/faq.md)
- TMW mining page: Lapis is the note type. Field mapping includes `Sentence = {cloze-prefix}<b>{cloze-body}</b>{cloze-suffix}`, `FreqSort = {frequency-harmonic-rank}`, `PitchPosition = {pitch-accent-positions}`. Tips: "Highlight text in the dictionary before adding a card… Add pictures for nouns." — [TheMoeWay, Anki & Mining Setup](https://learnjapanese.moe/mining/)

**kuri (donkuri) guide**

- The guide recommends mining after (or partway through) Kaishi, using Arbyste's JPMN fork. New cards are reordered by frequency using the harmonic mean of several frequency dictionaries (AutoReorder add-on). — [donkuri, Mining](https://donkuri.github.io/learn-japanese/mining/)

**Animecards (animecards.site — blocked; second-hand only)**

- An anime card has "the target word on the front, with the reading… definitions, word audio, and a context sentence on the back". It may carry a **hint** field on the front. For kana-only words the sentence is inserted as a hint. Claimed review speed is "2 to 4 times faster than sentence cards". The case for no context on the front is that "kanji themselves carry semantic hints". — search snippets of [Animecards, Anki: Card Types](https://animecards.site/ankicards/) (unverified wording)
- Corroborated by a primary source: friedrich-de's template "Determines whether the expression matches the reading and if it does [i.e. a kana word], puts the example sentence on the front of the card as recommended by Animecards." — [Basic-Mining-Deck README](https://github.com/friedrich-de/Basic-Mining-Deck)
- Hint-field uses, which Lapis quotes from Animecards:
  - disambiguating readings (武士 ぶし/もののふ, 海風, 悪口)
  - "Words appearing only in certain contexts… fine to include it as a hint"
  - onomatopoeia and kana words
  - "Making cards easier… if… you've failed a card repeatedly… Use this as a last resort"

  This is effectively Animecards' leech fix. — [Lapis README § What does Hint do?](https://github.com/donkuri/lapis)

**jp-mining-note (JPMN)**

- Rationale: "Vocab cards that require context have to be turned into sentence cards, and Sentence cards take a very long time to review, and can create context-based memories." So JPMN adds TSCs and **hybrid cards**:
  - **Hover card:** the word is on the front, and the sentence appears on hover. It is the "fallback card".
  - **Click card:** you must recall the _reading_ before revealing the sentence, but may use the sentence for the meaning.

  Hybrids exist "to prevent context-based memories". — [JPMN docs, Card Types](https://github.com/Aquafina-water-bottle/jp-mining-note/blob/master/docs/docs/cardtypes.md)

- Optional cloze card: `SeparateClozeDeletionCard` hides the bolded words, and can be used for word or sentence audio tests. Hints go in `Hint` / `HintNotHidden`. Pitch accent is testable via `PAShowInfo`, `PATestOnlyWord`, `PASeparateWordCard` and `PASeparateSentenceCard`. — [JPMN docs, Field Reference](https://github.com/Aquafina-water-bottle/jp-mining-note/blob/master/docs/docs/fieldref.md)
- Status: the original maintainer is inactive, and arbyste's fork is maintenance-only. — [arbyste/jp-mining-note README](https://github.com/arbyste/jp-mining-note)

**Lapis**

- Lapis was created as a lighter JPMN replacement: it uses no custom handlebars, runs faster on mobile, and works with JL. The default card is a plain vocab card. `IsWordAndSentenceCard` shows the sentence as a hint below the word, `IsClickCard` reveals the sentence on click, `IsSentenceCard` puts the full sentence on the front, and `IsAudioCard` "Plays the sentence audio and shows the sentence with the word missing". There are three definition fields (SelectionText → MainDefinition → Glossary fallback). On furigana, Lapis "strongly recommend[s] against" Yomitan's `{sentence-furigana}` and uses AJT Japanese instead. — [Lapis README](https://github.com/donkuri/lapis)

**Kiku**

- Kiku is Lapis-compatible: "Apart from the newly added fields, all other fields are exactly the same". It adds `RelatedExpression` and `SentenceTranslation`. Distinctive features:
  - "Kanji Web": browse your other notes that share a kanji, reading or expression.
  - **Field grouping:** "add multiple pictures, sentences, and sentence audios to a single note", giving several example contexts per word.

  — [Kiku docs, Features](https://github.com/youyoumu/kiku/blob/main/apps/docs/mds/features.md); [Kiku docs, Migration](https://github.com/youyoumu/kiku/blob/main/apps/docs/mds/migration.md); [Kiku docs, Field Grouping](https://github.com/youyoumu/kiku/blob/main/apps/docs/mds/field-grouping.md)

### Inferences

- The communities split into two camps on the front of the card:
  - **Sentence front, target highlighted:** AJATT sentences and MCDs, Tatsumoto TSCs, Tango/Core.
  - **Word front, sentence as hint/fallback/back:** Animecards, TMW/Shoui, Kaishi default, Lapis default.

  The modern note types make this a per-card toggle instead of a deck-wide choice. Their hover/click "fallback" designs are explicit compromises between context-dependence (sentence front) and difficulty (word front).

- Kiku's field grouping is the only mining note type found that is built for **multiple sentences per word**. Everywhere else the default is one sentence per word, normally the one it was mined from.

### Gaps

- Animecards' own text, including its exact leech/new-card advice, could not be read directly.

---

## 5. Pre-made decks: Kaishi 1.5k, Core 2k/6k/10k (iKnow), Tango N5–N1 (Ankidrone Essentials), Kanji in Context

### Takeaway

All of these decks use **one example sentence per word**, with native audio. Kaishi was built explicitly by curating and repairing Core/Tango sentences: it chose "the best sentence for each word" and fixed ~120 of 1,500. Its default front shows the word plus the sentence with the word bolded. Tango (Ankidrone Essentials) is a TSC deck with Tango-book sentences ordered roughly 1T. Core sentences come from iKnow, and the deck is criticised for mistranslations, irrelevant pictures, sentences that don't reflect the word's meaning, and not following 1T order.

### Cited Findings

**Kaishi 1.5k**

- Origin: data was "mostly [taken] from Core2k, Core10k, Tango N4 and Tango N5". Words were combined and "sorted… by frequency using various Yomichan/Yomitan frequency dictionaries", then ~1500 were selected. The team "fixed the translations for each word, chose the best sentence for each word and fixed the sentence if it needed fixing. We had to fix roughly 120 sentences out of the 1500." "The sentences themselves come from various Core decks found on Ankiweb." — [Kaishi README § Genesis](https://github.com/donkuri/Kaishi)
- Criticisms of predecessors:
  - Tango "had some obscure words in it such as ナンプラー… basic phrases and country names taking up such a large amount… fields were formatted terribly".
  - Core 2k "had multiple mistranslations, missing or unrelated pictures and some of the sentences weren't very useful, sometimes not even reflecting the meaning of the word used".

  — [same](https://github.com/donkuri/Kaishi)

- Layout:
  - Front template: `{{Word}}` plus `{{Sentence}}`, with the word bolded in the sentence. "Once the word is known well, reviewing is faster because the word appears first."
  - Back: word furigana, word meaning, sentence furigana, sentence meaning, word audio, sentence audio, picture, and notes.
  - Pitch accent is optional and commented out by default, because pitch "tends to spawn pretty heated arguments". Pitch data was human-verified by two people, who also added pitch notes.
  - Audio was cropped and normalized, and furigana generated via AJT Japanese.

  — [same](https://github.com/donkuri/Kaishi)

- Context-dependence concern: "some people end up only memorizing the sentences. The reason [the sentence] is here is to give you context as meaning is always found in context." Users can blur the sentence. — [same](https://github.com/donkuri/Kaishi)
- Images: "Finding 1500 consistent and free pictures… a bunch of pictures do not align perfectly with the sentence or the word." The pictures come from irasutoya. — [same](https://github.com/donkuri/Kaishi)
- **AI disclaimer:** "ANY OTHER DECK NOT MENTIONED ON THIS PAGE IS NOT AFFILIATED WITH ME, INCLUDING ANY AI OR PAID MODIFICATIONS." — [same](https://github.com/donkuri/Kaishi)

**Tango N5–N1 (Ankidrone Essentials)**

- "Ankidrone Essentials contains sentences extracted from JLPT Tango books… 5 subdecks… Most cards are preformatted as targeted sentence cards… 8,000 cards… Authentic, full, native example sentences. Authentic native audio. Translations for every sentence." "Cards are ordered in such a way that most sentences only introduce a single new word or grammar pattern." — [Tatsumoto, Ankidrone Essentials](https://tatsumoto-ren.github.io/blog/ankidrone-essentials.html)
- Tango vs Core: "Both are TSC decks with vocabulary and sentences voiced by a native speaker… I recommend Tango over Core10k. In Tango the sentences are a little more natural… Tango decks have you learn the cards in the 1T order, even though it's not always perfect. Core cards don't follow the 1T principle at all." — [Tatsumoto, What do you think of the Core 6k deck?](https://tatsumoto-ren.github.io/blog/what-do-you-think-of-the-core-6k-deck.html)
- Core10k format: "Each card contains a target word within an example sentence on the front. You have readings, translation, word meanings and audio on the back." Tatsumoto recommends it as a sentence bank, not as a deck to study in full: "Don't learn it back to back." — [Tatsumoto, Basic Vocabulary](https://tatsumoto-ren.github.io/blog/basic-vocabulary.html)
- Recommended amount: "learn the first 1,000 to 2,000 cards… Then start sentence mining… It is critical not to spend too much time on beginner decks." — [same](https://tatsumoto-ren.github.io/blog/basic-vocabulary.html)

**Core 2k/6k (iKnow): user reviews (second-hand)**

- AnkiWeb reviews reported via search snippets mention:
  - overuse of 彼/彼女 making sentences unnatural
  - 派出所 glossed as an outdated "branch office"
  - a text/audio mismatch (遅らした vs 遅らせた)
  - 奇麗 used rather than the commoner 綺麗

  Other reviewers praise the sentences as natural. — search snippets of [AnkiWeb Core 2.3k](https://ankiweb.net/shared/info/1146263310) and [Core 2k/6k Optimized](https://ankiweb.net/shared/info/1237389412) (AnkiWeb blocked; unverified)

**Kanji in Context**

- Community Anki versions put "the word… on the front… and the sentence or sentences on the back". One version had 94 chapters and 1,700 cards. Some versions were described as having "numerous mistakes". — search snippets of [japanesediary, Kanji in Context Sentence Deck](https://japanesediary.wordpress.com/2013/01/09/release-kanji-in-context/) and [perapera.org](https://www.perapera.org/kanji-in-context-anki-file/) (pages not fetched; unverified)

### Inferences

- The premade-deck norm is one curated sentence per word, recorded by a native speaker. Kaishi's process is the closest thing the community has to a documented sentence-QA pipeline:
  1. merge candidates from several decks
  2. sort by frequency
  3. pick the best sentence
  4. repair ~8%
  5. add human-verified pitch
  6. normalize the audio
  7. proofread with multiple people

### Gaps

- No primary documentation on how iKnow chose the Core sentences, or how many sentences per word Kanji in Context's books provide. Those sites were blocked.

---

## 6. Views on AI-generated, machine-translated, or textbook-like sentences

### Takeaway

None of the communities endorses AI-generated example sentences. Their stated preference, from AJATT 2006 to TMW 2025, is native sentences from immersion, ideally the one you met the word in. Where premade content is used, they value a trusted and edited provenance (paper dictionaries, Tango books, human-fixed Kaishi). Every primary source that mentions AI or machine translation treats it with suspicion.

### Cited Findings

- **Khatzumoto:** avoid even human-made example corpora with occasional errors: "when sentences are your primary learning medium, you need to be able to trust what you read 100%." — [AJATT, 10,000 Sentences: Where](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-where). Also, against self-produced Japanese: "Don't go inventing your own Japanese; no one will understand you." — [10,000 Sentences: How](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/10000-sentences-how). And against self-written translations: "don't go writing your own translations." — [12 Free MCD Examples](https://github.com/all-japanese-all-the-time/all-japanese-all-the-time/tree/master/blog/12-free-mcd-examples)
- **Tatsumoto on LLMs:** "AI explanations can be wrong… They don't actually understand what they produce… modern LLMs can be **quite accurate**. The problem is that beginner language learners cannot easily verify what's correct… Don't rely on it exclusively. Use it only when other options aren't available." — [Have you ever tried using AI to analyze grammar?](https://tatsumoto-ren.github.io/blog/have-you-ever-tried-using-ai-to-analyze-grammar.html)
- **Tatsumoto on MT:** "Machine translations are even more dangerous, because they often introduce errors… creates an illusion of comprehension." His remedy: "search for various example sentences that use the expression". — [Could machine translation be useful?](https://tatsumoto-ren.github.io/blog/could-machine-translation-be-useful-to-language-learners.html)
- **Tatsumoto on textbooks vs mining:** "Finding your own sentences is much more fun than learning from a premade deck, or, god forbid, a textbook… you're always learning what is relevant to you." — [Sentence mining](https://tatsumoto-ren.github.io/blog/sentence-mining.html)
- **TMW/Shoui:** machine translation "creates the illusion that you 'learned'… This also makes use of AI kind of pointless / also cements the illusion of learning." He also advises blocking "Reddit machine translation from poisoning your search results". — [TheMoeWay, Shoui method](https://learnjapanese.moe/shouimethod/)
- **Kaishi:** disclaims "ANY AI… MODIFICATIONS" of the deck. — [Kaishi README](https://github.com/donkuri/Kaishi)
- **Secondary/blog view:** "many learners use AI to create 'fluff' sentences that sound unnatural"; use AI to explain nuance instead. — search snippet of [studycardsai.com blog](https://studycardsai.com/blog/anki-deck-for-japanese). This is a commercial blog and low-quality evidence. I found no r/LearnJapanese thread text, because reddit was blocked.

### Inferences

- An app that uses AI-generated sentences would be at odds with all of these communities' stated norms. The objections they actually voice are:
  1. errors a learner can't detect
  2. unnaturalness
  3. lack of personal or source context, which they believe aids memory
- A design that labels provenance, prefers native corpus sentences, and keeps a human-verified fallback (the Kaishi model) addresses the first two directly.

### Gaps

- No direct community survey or thread data on AI sentences was reachable: reddit, the TMW Discord and the Anki forums were all blocked or not indexed.

---

## Cross-method comparison (summary of cited material above)

| Dimension       | AJATT 10k (2006–08)                     | AJATT MCD (2010+)                                | Tatsumoto TSC                                                     | Animecards / TMW / Lapis default                                      | Kaishi / Tango / Core                                             |
| --------------- | --------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Sentence source | Native media/dictionaries; trusted only | Native passages, any length                      | Original mined sentence, 1T; sentence bank fallback               | Mined sentence (one click Yomitan)                                    | Curated textbook/iKnow sentences, native audio                    |
| Cards per word  | 1 sentence card                         | 1 card per unknown kanji/chunk; many per passage | 1 TSC per word sense; extra TSCs w/ other words for trouble kanji | 1 per word (Kiku allows grouped multiple sentences)                   | 1 sentence per word                                               |
| Type            | Recognition (whole sentence)            | Cloze recall (production-ish)                    | Recognition of highlighted target                                 | Recognition of isolated word (sentence as hint/back)                  | TSC / word+sentence                                               |
| Front           | Sentence, no furigana                   | Passage with ####; furigana optionally kept      | Sentence, target bolded, no furigana, no audio                    | Word (+hint; sentence if kana word)                                   | Word + sentence w/ bold (Kaishi); sentence w/ target (Tango/Core) |
| Back            | Reading, definition, gist translation   | Answer + dictionary + full text + audio          | Definition, audio, picture, pitch; translation optional           | Reading, definition(s), word+sentence audio, pitch, picture, sentence | Furigana, meanings, sentence translation, audio, (pitch opt.)     |
| New/day         | 15–50                                   | n/a                                              | 10–30                                                             | 20 (10 if overwhelmed)                                                | 20 default (Kaishi)                                               |
| Leeches         | Delete freely; no total wipe            | Delete if too hard/boring                        | Threshold 4–6, suspend, rework                                    | Hint field as last resort; yearly deck refresh (Shoui)                | —                                                                 |
