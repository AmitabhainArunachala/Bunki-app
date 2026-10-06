# AI-first Japanese-learning apps teardown (state as of September 2026)

**Research-conditions caveat (read first).** During this session every direct page fetch (WebFetch) to product sites, app stores, Reddit, Wikipedia, and third-party review sites was blocked by the network egress proxy, and the shared web-search budget was exhausted after the first ~30 queries. Every finding below therefore comes from search-engine result snippets/summaries of the linked pages, not from reading the pages themselves. Treat all numbers as "reported by the linked source, not independently verified." Where a snippet did not attribute a fact to a specific URL, I cite the most plausible source from that result set and flag it "(attribution uncertain)". Items marked **[UNVERIFIED]** could not be corroborated at all. The Gaps sections are long on purpose so the report writer knows what is missing rather than guessing.

Scope note: Loora and Lingoda do not offer Japanese at all as of 2026 (see Q1), and ELSA teaches English only with a Japanese-language UI; they are included only to say so.

---

## Q1. Per app: core loop, what the AI tutor remembers/adapts between sessions, and how the learner model is built

### Takeaway
Only three products show evidence of an explicit, persistent per-learner state for Japanese: Migaku (a word-level known/learning/unknown status derived from SRS history, driving a comprehension score on any content), Langua (LLM "smart memory" of facts about the learner plus a mistake log that generates personalized grammar drills), and Speak (tracks learned phrases and reuses them across the Learn→Practice→Apply loop). Praktika and Duolingo advertise "tutor memory"/"remembers past calls" but with no public description of what is stored; Jumpspeak, TalkPal, Todaii, and Busuu show no evidence of cross-session learner modelling beyond lesson progress.

### Cited Findings

**Migaku (Japanese-native tool; extension + mobile + Academy)**
- Core loop as described by Migaku and reviewers: click words in native content (Netflix, YouTube, Disney+, Rakuten Viki, Reddit, X, and other sites) for definitions, pronunciations and AI explanations; learn common words first; create flashcards from native content; review with built-in spaced repetition; plus a structured "Migaku Academy" course series — [Wordy Migaku review 2026](https://wordy.info/blog/migaku-review) (attribution uncertain; also summarized in [immit.co review](https://immit.co/blog/migaku-review-2026-is-it-worth-it-for-japanese-learners)).
- Learner model = explicit word-status tracking derived from SRS: words default to "Unknown" (red underline); after you make a card and study it once the word becomes "Learning" (orange/yellow); once Migaku determines you only need to review a word once every 21 days or less it is marked "Known" (green); users can also set "Ignored" (grey) and "Tracking" (purple) — [Migaku: The Learning Statuses](https://migaku.com/blog/youtube/the-learning-statuses-migaku-browser-extension).
- Migaku tracks all words learned and generates a comprehension score for the content you visit — [Migaku: Tracking Learned Words](https://migaku.com/blog/youtube/supercharge-your-language-learning-tracking-learned-words).
- AI explanations: explain what words mean, break down how sentences work, use the sentence context; dictionary AI explanations "now include surrounding subtitles for better context" (changelog item; date not captured) — [Migaku changelog](https://migaku.com/blog/changelog); [migaku.com](https://migaku.com/).
- Academy is a structured course series; one reviewer states "Migaku Academy I is the strongest reason most paying users stay" — [Wordy review](https://wordy.info/blog/migaku-review) (attribution uncertain).
- No evidence found of an AI conversation tutor, roleplay, or cross-session conversational memory in Migaku; its "AI" is explanations plus AI subtitle generation (see Q2/Q3).

**Jumpspeak (AI-conversation-first app, Japanese is a thin tier)**
- One 2026 review says Japanese was "recently added as a complete course in May 2025" — [Languavibe Jumpspeak review](https://languavibe.com/jumpspeak-review/) (attribution uncertain); contradicted by other 2026 reviews stating that for Japanese and most non-core languages Jumpspeak offers "a basic AI chatbot with no structured lessons" and that "AI Tutor-only languages (Japanese, Korean, Russian, and others) receive complaints for insufficient content compared to fully supported languages like Spanish and French" — [LanguaTalk Jumpspeak review](https://languatalk.com/blog/jumpspeak-review/) (competitor-authored); [Lingrow Jumpspeak review](https://lingrow.io/blog/jumpspeak-review).
- Praise: "practical, conversation-first lessons," "personalized pacing, immersive dialogues, progress tracking" — [Jumpspeak reviews page (own site)](https://www.jumpspeak.com/reviews); [Product Hunt reviews](https://www.producthunt.com/products/jumpspeak/reviews).
- Complaint: complete beginners "report feeling lost, overwhelmed by the pace, and lacking foundational instruction"; better suited to intermediates — [icanlearn Jumpspeak review](https://www.icanlearn.com/jumpspeak/) (attribution uncertain).
- One 2026 review gives Jumpspeak 2/5 overall — [LanguaTalk Jumpspeak review](https://languatalk.com/blog/jumpspeak-review/) (competitor-authored).
- No source described any cross-session memory or learner-knowledge state for Jumpspeak's AI tutor. **[GAP]**

**Todaii / Todai (Easy Japanese News; developer package `mobi.eup.jpnews`)**
- Core loop: graded real news articles (10+ fresh articles daily, N5 to N1) with reading/listening tools; now "Human-built, AI-enhanced" — [Todaii App Store listing](https://apps.apple.com/us/app/todaii-easy-japanese/id1107177166); [Todaii Google Play](https://play.google.com/store/apps/details?id=mobi.eup.jpnews&hl=en_US&gl=US).
- New "Tomo Chat": practice speaking Japanese with an AI about the actual news article you just read; described as "natural, opinionated, and expressive," with suggestions, expression support, and error correction; the system "provides a summary of errors and suggestions for correction" — [Todaii App Store (India storefront)](https://apps.apple.com/in/app/todaii-learn-japanese-n5-n1/id1107177166); [MWM listing](https://mwm.ai/apps/todaii-learn-japanese-n5-n1/1107177166).
- Also lists "1:1 AI conversations" with "instant feedback on pronunciation, grammar, and fluency" and per-session progress tracking — [Todaii App Store](https://apps.apple.com/us/app/todaii-learn-japanese-n5-n1/id1107177166).
- Tomo launched on iOS first, then Android ("After creating a buzz on iOS ... now on Android") — [Todaii Japanese Facebook post](https://www.facebook.com/TodaiiJapanese/posts/-level-up-your-japanese-speaking-with-todaii-japaneses-ai-tomo-after-creating-a-/1368338848629370/) (post date not captured).
- App version 5.4.4 was current on third-party download mirrors — [soft112 listing](https://easy-japan-news.soft112.com/).
- No evidence of cross-session tutor memory or a known-word model beyond flashcards/JLPT level selection. **[GAP]**

**Speak (OpenAI-backed; Japanese is one of its target languages)**
- Languages for English speakers: Spanish, French, Korean, Japanese, Italian, Simplified Chinese — [LanguaTalk: best AI Japanese apps](https://languatalk.com/blog/how-to-learn-japanese-with-ai/); another source lists "six languages: Spanish, French, Korean, Japanese, Italian, and English" — [Beginners in AI: Speak explained](https://beginnersinai.org/speak-explained/) (the two lists differ on Chinese vs English; unresolved).
- Core loop = "Speak Method": Learn phrases native speakers use → Practice until automatic → Apply in back-and-forth conversation with the Speak Tutor AI — [speak.com](https://www.speak.com/).
- Learner model: a 209-day review says "what sets Speak apart is how it tracks what you've learned and how its AI tutor helps you when you get stuck; no other beginner app handles remembering what you learned as thoughtfully" — [Lingtuitive Speak review](https://lingtuitive.com/blog/speak-review).
- Japanese user feedback quoted by Speak: learners say they can "already remember sentences well" and that Speak "thoroughly helped with speaking and grammar" in Japanese; "remember more in one session than a week on Duolingo" — [Speak reviews blog](https://www.speak.com/us/blog/reviews) (company-curated).
- Conversation engine: uses OpenAI's Realtime API; Speak was an early OpenAI Startup Fund portfolio company with priority GPT-4/Realtime access; 15M+ downloads, 4.8 App Store rating, $1B valuation as of late 2024 — [Beginners in AI](https://beginnersinai.org/speak-explained/).
- Whether Speak Tutor holds explicit cross-session conversational memory (as opposed to curriculum progress) is not described in any retrieved source. **[GAP]**

**Praktika (avatar AI tutors; Japanese supported)**
- Paid plan includes "unlimited speaking practice, instant feedback, translation help, all avatars, realistic tutor voices, daily speaking challenges and tutor memory" — [Praktika Help Center: subscription plans](https://intercom.help/praktika-ai/en/articles/11684862-what-subscription-plans-does-praktika-offer-and-what-is-included-in-the-paid-plan). What "tutor memory" stores is not described. **[GAP]**
- Supports ~9 languages incl. Japanese; a reviewer who signed up in August 2026 saw 12 language choices including Japanese — [LanguaTalk Praktika review](https://languatalk.com/blog/praktika-review/) (competitor-authored; attribution uncertain).
- Praktika's own marketing claims its tutors "handle Japanese pronunciation, particles, and politeness levels well" and picks itself as "the honest 2026 winner" for anime fans — [Praktika blog, 2026 Japanese anime FAQ](https://praktika.ai/blog/best-language-learning-app-2026-japanese-anime-faq) (company-authored, self-serving).
- Complaints: "rigid path system, scripted conversations, and a non-refundable subscription" — [icanlearn Praktika review](https://www.icanlearn.com/praktika/).

**Langua (LanguaTalk's AI tutor; Japanese supported)**
- "Smart memory that remembers your interests and key facts about you (which can be disabled)"; "in-depth feedback and corrections with multiple correction styles"; "personalized grammar drills based on frequent mistakes"; "detailed feedback reports after each conversation"; SRS flashcards created from your conversations — [Langua AI Japanese tutor page](https://languatalk.com/ai-japanese-tutor); [LanguaTalk AI Japanese apps post](https://languatalk.com/blog/how-to-learn-japanese-with-ai/) (both company-authored).
- Independent reviewer: conversation memory across sessions "remembers what you talked about last Tuesday and brings it up" — [LinguaLive: best AI tutor 2026](https://www.lingualive.ai/blog/best-ai-language-tutor-2026) (competitor-authored); "2 years with the best AI speaking app" — [Lingtuitive Langua review](https://lingtuitive.com/blog/langua-ai-tutor-review).
- Changelog exists at [Langua updates page](https://support.languatalk.com/article/152-see-the-latest-updates-on-langua) but could not be read. **[GAP: dated feature history]**

**TalkPal (broad multilingual chatbot; Japanese among 130+ languages)**
- Modes: standard AI conversation, roleplays, debates, chat with fictional/historical characters, describe AI-generated photos, single-sentence practice, audio-only "phone calls" — [LanguaTalk TalkPal review](https://languatalk.com/blog/talkpal-review/) (competitor-authored); [ToolChase TalkPal](https://toolchase.com/tool/talkpal/).
- Adaptation weakness: "the AI rarely adjusted its complexity based on performance, and often ignored advanced structures tried" (tested in French/Spanish, not Japanese) — [LanguaTalk TalkPal review](https://languatalk.com/blog/talkpal-review/).
- Now advertises 130+ languages (up from 50+), explicitly including Japanese — [Wikipedia: Talkpal AI](https://en.wikipedia.org/wiki/Talkpal_AI) (attribution uncertain).
- No source describes cross-session memory for TalkPal. **[GAP]**

**Duolingo (Max / Video Call with Lily; Japanese course)**
- Video Call with Lily: "asks questions, responds naturally, adapts to your level, and even remembers what you've said in past calls" — [Duoplanet: Duolingo Video Call](https://duoplanet.com/duolingo-video-call/).
- Original launch: available to Max subscribers in English, Spanish, French, German, Italian, Portuguese; "iOS learners also have access to Video Call in Japanese and Korean (coming soon to Android!)" — [Duolingo blog: Video Call](https://blog.duolingo.com/video-call/) (2024 post); later list includes Chinese — [Duoplanet](https://duoplanet.com/duolingo-video-call/).
- Technical background post exists at [Duolingo blog: AI behind Video Call](https://blog.duolingo.com/ai-and-video-call/) but could not be read. **[GAP: model/ASR details]**
- Early 2026: "Explain My Answer" became free for most learners in Spanish, French, German, Japanese, Portuguese, Italian and Korean courses; in 2026 Video Call appears on the learning path with a "Try free with Super" button (i.e., presented as a Super feature) — [Nibble: Is Duolingo Max worth it 2026](https://nibble-app.com/blog/is-duolingo-max-worth-it) (attribution uncertain; also [Copycat Cafe Duolingo Max review](https://copycatcafe.com/blog/duolingo-max)).

**Busuu (Conversations AI; Japanese among 14 languages)**
- Busuu Conversations: speak-only (no typing option) AI conversations "tailored to each learner's language level with personalized feedback," startable from a lesson topic or a chosen topic — [Busuu blog: Conversations release](https://blog.busuu.com/new-conversations-release/); [Busuu support: What are Busuu Conversations](https://help.busuu.com/hc/en-us/articles/21862192336402-What-are-Busuu-Conversations-and-how-can-they-help-me-learn-a-language).
- Busuu offers 14 languages including Japanese — [Univext Busuu review 2026](https://univext.com/en/blog/340/busuu-review-2026). Whether Conversations is enabled for the Japanese course specifically is **[UNVERIFIED]**.
- Premium Plus bundles "AI Conversations, pronunciation feedback, Mistake Repair, and extra speaking support" — [Language App Guide Busuu review](https://languageappguide.com/app-reviews/busuu-review/).

**Loora, Lingoda, ELSA (no Japanese learning)**
- Loora "only offers English" (as of March 2026) — [Kippy comparison](https://kippy.ai/blog/best-ai-language-learning-apps-comparison); [Loora support: What is Loora](https://www.loora.com/support/getting-started/what-is-loora).
- Lingoda offers English, Business English, German, French, Spanish, Italian; "Japanese is not available and there are no announced plans to add it"; its AI is limited to "AI-driven class reports showing where to focus" — [Japademy: Lingoda Japanese](https://www.japademy.com/japanese-course-reviews/lingoda-japanese).
- ELSA is an English-pronunciation coach; Japanese appears only as an onboarding/UI language — [ELSA FAQs](https://elsaspeak.com/en/faqs-en/); JETRO covers ELSA's Japan business as English education for Japanese learners — [JETRO ELSA success story](https://www.jetro.go.jp/en/invest/investment_environment/success_stories/elsa.html). A HelloTalk blog post claims ELSA has "thinner" Japanese coverage usable for "isolated sound drills" — [HelloTalk blog: ELSA vs HelloTalk](https://www.hellotalk.com/en/blog/elsa-vs-hellotalk-japanese-pronunciation) **[UNVERIFIED; competitor-authored and inconsistent with ELSA's own English-only positioning]**.

### Inferences
- The only true "knowledge-state" learner model among these products is Migaku's word-status system, and it is (a) vocabulary-only (no grammar-point state), (b) derived from card creation + SRS interval (Known = interval ≥ 21 days), and (c) surfaced as a per-content comprehension score. Nobody found tracks grammar or pitch-accent mastery as state.
- Conversational tutors (Langua, Praktika, Duolingo) implement "memory" as LLM-style facts/interests and topic recall, not as a mastery model; Langua is the only one that closes the loop from logged mistakes back into targeted drills.
- Speak's "remembering" is curriculum-driven (phrases taught are re-elicited later), which works for beginners but does not model words met outside the course.
- Nothing found combines an immersion-derived known-word state (Migaku-style) with an AI conversation partner that reads that state; that is the obvious empty square.

### Gaps
- No primary-source description of what Praktika "tutor memory," Duolingo "remembers past calls," or Speak Tutor retain across sessions.
- Jumpspeak's actual Japanese content depth in Sept 2026 (structured course vs. chatbot-only) is contradicted across sources.
- Todaii Tomo Chat launch dates, model, and whether it tracks learner errors over time: not found.
- Langua's dated changelog and Japanese-specific script handling (furigana/romaji toggles) could not be read.

---

## Q2. Sentence mining from video/subtitles/web: who does it and how

### Takeaway
Migaku is the only product in this set that does real sentence mining (dictionary popup on Netflix/YouTube/etc., one-click cards, built-in SRS, AI-generated subtitles, pitch accent on cards); Todaii mines from its own news only (flashcards from articles); the conversation-tutor apps (Langua, Speak, Praktika, TalkPal, Jumpspeak, Busuu, Duolingo) only make flashcards from their own chats/lessons. The competitive threat to Migaku is a set of cheaper newcomers (Sabi, Trancy, FluentAI, Lexirise) that explicitly market "Migaku alternative" and Prime Video support.

### Cited Findings
- Migaku Chrome extension: click words for definitions, pronunciations, AI explanations on Netflix, YouTube, Disney+, Rakuten Viki, Reddit, X and other sites; create flashcards from native content; built-in spaced repetition — [Wordy review](https://wordy.info/blog/migaku-review) (attribution uncertain); [Migaku Chrome Web Store](https://chromewebstore.google.com/detail/migaku-really-learn-langu/lkhiljgmbeecmljiogckofcalncmfnfo).
- Migaku Early Access ($15/mo tier) adds in-development features: inflections lookup, local player for your own video files, secondary subtitle translations, word browser — [Lexirise: Is Migaku free?](https://lexirise.app/blog/article/migaku-pricing-free-trial) (attribution uncertain).
- Migaku mobile: iOS includes YouTube and a Local Player for video; dual-language subtitles, interactive word lookup, and "generate missing subtitles using Migaku AI"; Japanese-specific customizable furigana display and pitch-accent colouring; pitch accent shown directly on cards — [Migaku App Store listing](https://apps.apple.com/us/app/migaku-really-learn-languages/id1664096855); [Migaku download page](https://migaku.com/download); [MOGE product page](https://moge.ai/product/migaku).
- Migaku can export to Anki; a user write-up documents the Migaku-to-Anki mining flow — [antoine.fi: Sentence mining with Migaku](https://antoine.fi/sentence-mining-with-migaku) (content not readable; flow details **[UNVERIFIED]**).
- Migaku positions itself as covering "native media, books, games & more" — [Migaku FAQ: goals](https://migaku.com/faq/goals).
- Competitor positioning against Migaku (all competitor-authored): Sabi markets itself as "Cheaper & Works on Prime Video" versus Migaku — [Sabi: Migaku vs Sabi](https://www.joinsabi.com/blog/migaku-vs-sabi); Trancy and FluentAI publish "best Migaku alternative for Netflix" guides — [Trancy](https://www.trancy.org/blog/best-migaku-alternative-for-netflix-learning-2026-3609d2252005813882a5efac2ab03e64); [FluentAI](https://fluentai.pro/guides/migaku-alternative). The implication that Migaku lacks Prime Video support is **[UNVERIFIED]**.
- Todaii: news reader with dictionary lookups, furigana, JLPT-graded articles and flashcards from articles; no web/video mining — [Todaii App Store](https://apps.apple.com/us/app/todaii-easy-japanese/id1107177166); older independent review at [Tofugu Todai review](https://www.tofugu.com/reviews/todai-easy-japanese-news-app/) (unreadable; date unknown).
- Langua: SRS flashcards are generated from your AI conversations (not from external media); it also has a video/podcast library (per company marketing) — [Langua Japanese tutor page](https://languatalk.com/ai-japanese-tutor). **[UNVERIFIED whether the library supports one-click card creation with audio.]**
- No source indicates any browser extension or media-mining feature for Speak, Praktika, Jumpspeak, TalkPal, Busuu, or Duolingo.
- Nora (2025-26 entrant): every conversation transcript is shown with romaji and furigana — [Nora: Learn Japanese](https://www.hellonora.ai/learn-japanese) (company-authored); no mining feature indicated.

### Inferences
- The "mining" feature set to beat is Migaku's: popup dictionary + AI context explanation on the exact subtitle line, one-click card with sentence/audio/image, pitch accent and furigana on the card, SRS-driven word status, AI-generated subs when missing, and a comprehension score before you start a show. Its evident weaknesses (from competitor marketing) are price and streaming-site coverage.
- Nobody in the set mines from the AI conversation transcript AND from external media into a single knowledge state.

### Gaps
- Exact Migaku card fields (screenshot? audio clip length? sentence audio via TTS or clip?), which browsers beyond Chrome are supported, and whether the mobile app mines from Netflix (vs YouTube/local only) could not be verified.
- Whether Migaku supports Prime Video, Crunchyroll, or web readers (non-video) in Sept 2026: not verified.
- No current data on open-source alternatives (Yomitan, asbplayer, Language Reactor, jidoujisho) because search budget ran out before those queries.

---

## Q3. Speaking and listening: ASR, pronunciation / pitch-accent feedback, live voice, latency

### Takeaway
Live voice conversation is standard across the tutor apps (Speak, Praktika, Langua, TalkPal, Duolingo Video Call, Busuu Conversations, Todaii Tomo); Speak (OpenAI Realtime API) is reported to have the lowest latency in the category. Genuine Japanese pitch-accent feedback on the learner's own speech is claimed only by small entrants (Sensei, LinguaLive, SpeakPal) and none of these claims could be verified; Migaku offers pitch-accent display and an ear-training Pitch Trainer, not production feedback.

### Cited Findings
- Speak: conversation-first, "responds with corrections on tone, pronunciation, and grammar"; "as of 2026, Speak delivers the lowest-latency, most natural-feeling AI conversation in the language-learning category"; uses OpenAI Realtime API — [Beginners in AI: Speak explained](https://beginnersinai.org/speak-explained/). App-store copy: "analyzes your speech, providing assessment of pronunciation, intonation, and fluency" — [Speak App Store listing](https://apps.apple.com/us/app/speak-learn-english/id1286609883).
- Praktika: AI video avatars "with full backstories, cultural depth, and natural accents"; "realistic tutor voices"; instant feedback — [Praktika Help Center](https://intercom.help/praktika-ai/en/articles/11684862-what-subscription-plans-does-praktika-offer-and-what-is-included-in-the-paid-plan); [Praktika Google Play](https://play.google.com/store/apps/details?id=ai.praktika.android).
- Langua: "Call Mode" (voice) capped at 30 min/day on Standard, uncapped on Unlimited — [LanguaTalk pricing article](https://support.languatalk.com/article/142-how-much-does-langua-cost-pricing) (attribution uncertain; also [TheFabryk Langua review](https://thefabryk.com/blog/langua-review)).
- TalkPal: audio-only "phone call" mode; criticism that "the voices are robotic" and "depth of feedback is extremely limited" — [LanguaTalk TalkPal review](https://languatalk.com/blog/talkpal-review/) (competitor-authored).
- Duolingo Video Call: real-time spoken conversation with generative AI; Japanese available on iOS at launch, Android "coming soon" — [Duolingo blog: Video Call](https://blog.duolingo.com/video-call/).
- Busuu Conversations: speak-only, "nudged to speak aloud"; pronunciation feedback in Premium Plus — [Busuu: language learning with Conversations](https://www.busuu.com/en/languages/language-learning-with-busuu-conversations); [Language App Guide Busuu](https://languageappguide.com/app-reviews/busuu-review/).
- Todaii: "1:1 AI conversations ... instant feedback on pronunciation, grammar, and fluency" — [Todaii App Store](https://apps.apple.com/us/app/todaii-learn-japanese-n5-n1/id1107177166).
- Migaku: shows pitch accent and native pronunciation; colour-codes words by pitch accent; separate Migaku Pitch Trainer (free and paid versions) trains the ear to distinguish pitch patterns using native recordings — [Tofugu: Migaku Pitch Trainer](https://www.tofugu.com/japanese-learning-resources-database/migaku-pitch-trainer/); [Pitch Trainer demo](https://pitch-demo.migaku.io/); [Migaku App Store](https://apps.apple.com/us/app/migaku-really-learn-languages/id1664096855). No speech-input pronunciation scoring found for Migaku.
- Pitch-accent feedback claims from small entrants (all company-authored, none verified): Sensei "tracks pronunciation accuracy and pitch accent to deliver real-time fluency scores" — [Sensei App Store](https://apps.apple.com/us/app/sensei-learn-japanese-jlpt/id6467135284); LinguaLive "detects pitch patterns in real time" — [LinguaLive AI Japanese tutor](https://www.lingualive.ai/tools/ai-japanese-tutor); SpeakPal "real-time feedback on pitch accent" — [SpeakPal Japanese](https://try.speakpal.ai/learn-japanese.html); JAccent "Japanese dict with AI" (pitch dictionary) — [JAccent Google Play](https://play.google.com/store/apps/details?id=dttrinh.gm.jaccent&hl=en_US).
- ELSA's speech-scoring is English-only for learning purposes (see Q1).
- Duolingo's whitepaper measured speaking gains from Video Call, but in *Japanese speakers learning English* — [Duolingo whitepaper 2025](https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_language_video_call_improves_speaking_2025.pdf) (403 on fetch; details from title/snippet only).

### Inferences
- No mainstream product gives verified, per-mora pitch-accent scoring of learner speech; "pitch accent feedback" in marketing likely means LLM text feedback or dictionary display. This is a differentiator worth validating with a real acoustic model.
- Latency leadership belongs to whoever is on a speech-to-speech realtime stack (Speak); the rest are likely ASR→LLM→TTS pipelines (inferred from "robotic voices" complaints about TalkPal).

### Gaps
- No measured latency figures for any app.
- No information on which ASR any app uses for Japanese, nor accuracy on learner (accented) Japanese.
- Migaku Pitch Trainer price and whether it is inside the main subscription: unknown.

---

## Q4. Pricing, free tier, platforms

### Takeaway
Monthly prices cluster at USD 8–30: Praktika ~$8, Migaku $10 (Standard) / $15 (Early Access) / $499 lifetime, Jumpspeak $9.99 (but 3-month minimum), TalkPal $14.99, Speak ~$18–20, Langua €19.99 / €29.99, Duolingo Max $29.99 (Max being wound down on some accounts by Sept 2026). Migaku is the only one with a browser extension; Speak, Praktika, Jumpspeak, Todaii are mobile-first; Langua and TalkPal are web + mobile.

### Cited Findings
- **Migaku** (as of 24 Aug 2026): Standard $10/mo (~$96/yr with 20% yearly discount), Early Access $15/mo, $499 lifetime; 10-day free trial; 14-day money-back guarantee — [Lexirise: Migaku pricing](https://lexirise.app/blog/article/migaku-pricing-free-trial) (attribution uncertain). Platforms: Chrome extension, iOS, Android — [Migaku download](https://migaku.com/download); [Migaku App Store](https://apps.apple.com/us/app/migaku-really-learn-languages/id1664096855).
- **Jumpspeak**: 7-day free trial then $9.99/mo, $69.99/12 months, or $299 lifetime; "minimum subscription is three months" and auto-renews; refund window "within 100 days" — [Top10 Jumpspeak review](https://www.top10.com/language-learning/reviews/jumpspeak); [Jumpspeak Help Center: billing](https://help.jumpspeak.com/en/collections/19495376-3-subscriptions-billing-refunds); [Jumpspeak pricing](https://www.jumpspeak.com/pricing) (attribution among these uncertain). Platform: iOS App Store listing exists — [Jumpspeak App Store](https://apps.apple.com/us/app/jumpspeak-language-learning/id1514709368).
- **Todaii**: iOS and Android; in-app purchases exist but prices not captured — [Todaii App Store](https://apps.apple.com/us/app/todaii-easy-japanese/id1107177166); [Google Play](https://play.google.com/store/apps/details?id=mobi.eup.jpnews&hl=en_US&gl=US). **[GAP: price]**
- **Speak**: Premium ~$20/mo, annual ~$99–120/yr, Premium Plus ~$180/yr — [SpeakShark: Speak pricing 2026](https://speakshark.com/blog/speak-app-pricing-per-month-2026) (competitor-authored); "around $18/month, depends where you live" — [AIVario Speak](https://aivario.com/tools/speak). Platforms: iOS/Android (App Store listing) — [Speak App Store](https://apps.apple.com/us/app/speak-learn-english/id1286609883).
- **Praktika**: ~$8/mo; weekly, monthly, quarterly and annual plans; prices vary by country/platform/promotion; subscription reported non-refundable — [Praktika Help Center](https://intercom.help/praktika-ai/en/articles/11684862-what-subscription-plans-does-praktika-offer-and-what-is-included-in-the-paid-plan); [icanlearn Praktika](https://www.icanlearn.com/praktika/); [Praktika Google Play](https://play.google.com/store/apps/details?id=ai.praktika.android).
- **Langua**: Standard €19.99/mo or €149.99/yr (30 min Call Mode + 75 chat messages/day); Unlimited €29.99/mo or €199.99/yr; prices localized — [LanguaTalk pricing KB](https://support.languatalk.com/article/142-how-much-does-langua-cost-pricing); [TheFabryk Langua review](https://thefabryk.com/blog/langua-review). Free vs Pro differences documented at [LanguaTalk KB free vs Pro](https://support.languatalk.com/article/143-whats-the-difference-between-the-free-and-pro-versions-of-langua) (unreadable). Platforms: web plus app — [applangua.com](https://applangua.com/).
- **TalkPal**: free Basic = 10 minutes/day; Premium $14.99/mo, or from $6.25/mo billed every two years — [AICurator TalkPal pricing](https://aicurator.io/talkpal-pricing/); [Capterra TalkPal](https://www.capterra.com/p/10006800/TalkPal/).
- **Duolingo**: Max $29.99/mo or $168/yr (~$14/mo annual) in 2026; "Max no longer appears as a new subscription option on some accounts as of September 2026"; Video Call now offered with "Try free with Super" — [Nibble: Duolingo Max 2026](https://nibble-app.com/blog/is-duolingo-max-worth-it); [Language App Guide Duolingo cost](https://languageappguide.com/pricing/duolingo-cost/) (attribution uncertain).
- **Busuu**: Premium Plus ~$83.99/yr; observed monthly IAPs $6.99–$23.49 and annual $70–$139.99 depending on platform/offer — [Linguasteps Busuu pricing](https://linguasteps.com/resources/busuu-pricing-a-transparent-overview); [PricingNow Busuu](https://pricingnow.com/question/busuu-pricing/).
- **Loora** (English only) and **Lingoda** (no Japanese): pricing not collected because out of scope for Japanese.

### Inferences
- Effective annual cost to run "Migaku for input + a voice tutor (Speak/Langua) for output" is roughly $200–$300/yr, which is the price umbrella an integrated product sits under.
- Jumpspeak's billing model (3-month minimum, trial auto-conversion) is a reputational liability that competitors cite.

### Gaps
- Todaii premium price; Migaku Pitch Trainer price; Speak free-tier limits; Praktika free-tier limits; exact Busuu Premium vs Premium Plus split for AI features in Sept 2026.
- Whether Migaku supports Firefox/Safari, and desktop app status.

---

## Q5. Top recurring complaints and praise (reviews, Reddit, forums)

### Takeaway
Praise clusters on Speak (retention, natural conversation), Langua (memory, feedback depth), Migaku (Academy, immersion tooling); complaints cluster on Jumpspeak (billing/trial charges, thin non-core languages), TalkPal (robotic voices, shallow feedback, non-adaptive), Praktika (rigid path, scripted, non-refundable), Migaku (price, per competitor positioning), and Duolingo (Max value collapsing as features move to Super/free). Reddit-specific 2025-26 threads could not be retrieved.

### Cited Findings
- Jumpspeak: BBB complaints include free-trial charges despite in-window cancellation, disputes lasting "up to 2 years," and a $227 charge without purchase — [BBB Jumpspeak complaints](https://www.bbb.org/us/fl/miami/profile/language-training-aids/jumpspeak-0633-92033576/complaints); [BBB Jumpspeak reviews](https://www.bbb.org/us/fl/miami/profile/language-training-aids/jumpspeak-0633-92033576/customer-reviews). Pricing "generates the most confusion and frustration"; app described as "innovative AI Spanish chat but very buggy" — [Mezzoguild Jumpspeak review](https://www.mezzoguild.com/jumpspeak-review/); [Copycat Cafe Jumpspeak review](https://copycatcafe.com/blog/jumpspeak-review). Praise: conversation-first, confidence-building — [Jumpspeak reviews](https://www.jumpspeak.com/reviews).
- TalkPal: "voices are robotic, sentences too simple if not a beginner, no grammar lessons, depth of feedback extremely limited"; "rarely adjusted complexity" — [LanguaTalk TalkPal review](https://languatalk.com/blog/talkpal-review/) (competitor); praise for variety of modes — [ToolChase](https://toolchase.com/tool/talkpal/); [AISO Tools TalkPal 2026](https://aisotools.com/blog/talkpal-review-2026).
- Praktika: "rigid path system, scripted conversations, non-refundable subscription" — [icanlearn Praktika](https://www.icanlearn.com/praktika/); praise for avatar realism and price ($8/mo "wins on price") — [Praktika blog](https://praktika.ai/blog/best-language-learning-app-2026-japanese-anime-faq) (self-authored); [Practice Me vs Praktika](https://practiceme.app/vs/praktika) (competitor).
- Speak: praise for retention and beginner-friendliness in a 209-day test — [Lingtuitive Speak review](https://lingtuitive.com/blog/speak-review); Japanese learners' App Store praise curated by Speak — [Speak reviews blog](https://www.speak.com/us/blog/reviews). Competitor comparison notes Langua beats Speak on memory — [Lingtuitive Langua vs Speak](https://lingtuitive.com/blog/langua-vs-speak). **[GAP: Speak Japanese-specific complaints]**
- Langua: consistently ranked #1 AI Japanese tutor by its own company and by Lingtuitive; independent negatives not captured — [Lingtuitive Langua review](https://lingtuitive.com/blog/langua-ai-tutor-review); [Language App Guide Langua review](https://languageappguide.com/app-reviews/langua-review/). **[GAP: complaints]**
- Migaku: praise for Academy retention driver and comprehensive tooling — [Wordy review](https://wordy.info/blog/migaku-review); implied complaints (price, site coverage) come from competitor "alternative" posts — [Sabi](https://www.joinsabi.com/blog/migaku-vs-sabi), [Trancy](https://www.trancy.org/blog/best-migaku-alternative-for-netflix-learning-2026-3609d2252005813882a5efac2ab03e64), [FluentAI](https://fluentai.pro/guides/migaku-alternative). Migaku's 2025 "best app" awards are paid press releases — [ABNewswire via Chronicle Journal](https://markets.chroniclejournal.com/chroniclejournal/article/abnewswire-2025-8-18-migaku-recognized-as-the-best-french-learning-app-2025); [Barchart press release](https://www.barchart.com/story/news/35955824/migaku-named-best-spanish-italian-and-french-learning-app-of-2025). **[GAP: Reddit complaints about bugs/extension breakage]**
- Duolingo: value complaint that Max features migrated to Super/free in 2026, weakening Max — [Nibble](https://nibble-app.com/blog/is-duolingo-max-worth-it); [Copycat Cafe Duolingo Max](https://copycatcafe.com/blog/duolingo-max).
- Reddit meta-view: r/LearnJapanese consensus is that "the perfect app doesn't exist" and successful learners take a "modular approach" combining tools — [JLPT Samurai: What does Reddit say](https://jlptsamurai.com/2026/01/17/what-does-reddit-say-the-most-recommended-japanese-learning-apps-according-to-reddit/) (secondary summary, Jan 2026).
- Todaii: independent review exists at Tofugu (date unknown) — [Tofugu Todai review](https://www.tofugu.com/reviews/todai-easy-japanese-news-app/). **[GAP: current review sentiment]**

### Inferences
- The strongest recurring complaint pattern across AI tutors is "doesn't adapt / scripted / shallow correction," which is the direct opposite of what a knowledge-state-driven tutor would deliver.
- Billing trust (trial auto-charge, non-refundable, minimum term) is a recurring churn/reputation issue; a transparent free tier is itself a competitive feature.

### Gaps
- No direct Reddit/App Store quotes for 2025-26 could be retrieved for any app (blocked). Star ratings and review counts not captured except Speak's 4.8 (2024).

---

## Q6. Published efficacy claims or studies

### Takeaway
Only Duolingo has a published study touching these features, and it concerns Japanese speakers learning English, not Japanese learners. No efficacy study was found for Migaku, Jumpspeak, Todaii, Speak, Praktika, Langua, TalkPal, or Busuu.

### Cited Findings
- Duolingo whitepaper (2025): in a controlled comparison, "the Video Call condition significantly outperformed the Control condition in speaking proficiency, as well as in overall listening and speaking proficiency" for Japanese English-learners — [Duolingo whitepaper: Video Call improves Japanese English learners' speaking skills](https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_language_video_call_improves_speaking_2025.pdf) (PDF returned 403; sample size, duration and effect sizes **not captured**).
- Speak cites scale metrics (15M+ downloads, 4.8 rating, $1B valuation late 2024) rather than learning outcomes — [Beginners in AI](https://beginnersinai.org/speak-explained/).
- Migaku's "best app of 2025" recognitions are press releases, not studies — [Barchart](https://www.barchart.com/story/news/35955824/migaku-named-best-spanish-italian-and-french-learning-app-of-2025).
- Praktika review titled "Real Results" is a blogger review, not a study — [Linguasteps Praktika](https://linguasteps.com/resources/praktika-review-2025-ai-language-tutor-with-video-avatars-real-world-results).

### Inferences
- The field has essentially no outcome evidence for AI Japanese tutoring; a product that instruments and publishes learner outcomes (e.g., words known over time, JLPT-aligned gains) would be differentiated on credibility alone.

### Gaps
- Duolingo whitepaper methodology details; any Speak internal research (Speak has published research posts in the past — not found this session).

---

## Q7. 2025-2026 entrants and adjacent peers found

### Takeaway
A long tail of small AI-Japanese apps launched 2025-26, mostly mobile chat tutors that add furigana/romaji transcripts and (unverified) pitch-accent feedback; and a cluster of "Migaku alternatives" (Sabi, Trancy, FluentAI, Lexirise, Wordy, immit) competing on price and streaming-site coverage.

### Cited Findings
- Nora (hellonora.ai): AI tutor for Japanese, Korean, Chinese, French, Spanish, German, Swedish, Italian; every conversation transcribed with romaji and furigana — [Nora Learn Japanese](https://www.hellonora.ai/learn-japanese); [Nora vs Loora](https://www.hellonora.ai/vs/loora).
- Kotrin - Learn Japanese: "5,000+ lessons, real-world dialogues, and an AI tutor" — [Kotrin App Store](https://apps.apple.com/app/id6745803196).
- Hack Japanese: AI Learn: "Decomposed Method" bite-sized visual AI lessons — [Hack Japanese App Store](https://apps.apple.com/us/app/hack-japanese-ai-learn/id6749310150).
- Jenova: immersive roleplay, real-time translation, kanji — [Jenova Learn Japanese with AI guide (May 2026)](https://www.jenova.ai/en/resources/learn-japanese-with-ai-202605).
- Sensei: Learn Japanese JLPT: AI speech analysis, pitch accent tracking, fluency scores — [Sensei App Store](https://apps.apple.com/us/app/sensei-learn-japanese-jlpt/id6467135284).
- Japanese Ai by HelloTalk: 24/7 AI 1-on-1 speaking tutor — [Japanese Ai Google Play](https://play.google.com/store/apps/details?id=com.hellotalk.hellojapanese&hl=en_US).
- LinguaLive (Japanese speaking practice, pitch feedback) — [LinguaLive learn Japanese](https://www.lingualive.ai/learn-japanese); SpeakPal — [SpeakPal Japanese](https://try.speakpal.ai/learn-japanese.html); Studrill Japanese Speaking — [Studrill App Store](https://apps.apple.com/qa/app/studrill-japanese-speaking/id6451344390); "Japanese AI - AI Japanese Tutor" — [App Store id6612012314](https://apps.apple.com/qa/app/japanese-ai-ai-japanese-tutor/id6612012314?l=ar).
- Migaku-alternative cluster: Sabi — [joinsabi.com](https://www.joinsabi.com/blog/migaku-vs-sabi); Trancy — [trancy.org](https://www.trancy.org/blog/best-migaku-alternative-for-netflix-learning-2026-3609d2252005813882a5efac2ab03e64); FluentAI — [fluentai.pro](https://fluentai.pro/guides/migaku-alternative); Lexirise — [lexirise.app](https://lexirise.app/blog/article/migaku-pricing-free-trial); Wordy — [wordy.info](https://wordy.info/blog/migaku-review); immit — [immit.co](https://immit.co/blog/migaku-review-2026-is-it-worth-it-for-japanese-learners).
- Rosetta Stone is reported to have added AI pronunciation feedback for Japanese pitch — [Toolient: best AI tools for Japanese 2025](https://www.toolient.com/2025/09/best-ai-tools-learning-japanese.html?m=1) **[UNVERIFIED]**.
- Trend framing (secondary): "landscape shifting from static flashcards toward interactive immersion" — [JLPT Samurai: AI Japanese apps 2026 (Jan 2026)](https://jlptsamurai.com/2026/01/19/the-future-of-learning-top-ai-powered-japanese-learning-apps-in-2026/).

### Inferences
- Entrants converge on the same shape (LLM chat + furigana/romaji + "pitch feedback" claims); none show evidence of a learner knowledge state or media mining. Differentiation opportunity remains "knowledge state that spans immersion, SRS, and conversation."

### Gaps
- Launch dates, pricing and platform for most entrants not captured; none independently reviewed.
- Lingopie, Language Reactor, Yomitan/asbplayer, Renshuu/Bunpro AI features, and ChatGPT-voice-as-tutor usage on r/LearnJapanese were not researched (budget exhausted).
