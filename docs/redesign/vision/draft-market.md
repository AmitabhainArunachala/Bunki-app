# Bunki: the ambition lens

> yes, and it has to make massive money and splash as a japanese learning app that rivals all the others! (John, 10-08 00:49 JST, message 10)

Message 10 sits inside "the best japanese learning app on the planet" and "a viral hit" (message 1); it does not replace them. Bunki earns and spreads for the reason someone falls in love with it: Japanese shows its depth there, and that depth is beautiful enough to show a friend. This lens covers how that becomes a business. Every claim about the repo names a file. Competitor facts come from `docs/build-evidence/kairo-learning-engine-research/2026-09-28/notes/02-established-tools.md` (vendor pages read 2026-09-28) unless they are marked *unverified*.

---

## 1. Where Bunki stands

Each rival owns one room of the house. None owns the house. The founding market research said so on 08-07 (bank-founding §10): nothing well designed above Kanken 2級; no product with links between words ("you cannot get from 食べる to 食う to 召し上がる anywhere"); nobody combining a curated corpus, per-learner difficulty and open SRS export.

| Product | What it owns | Its weakness for a serious learner | Price (public, USD) |
|---|---|---|---|
| **Duolingo** | Habit, brand and scale: the streak, the owl, tens of millions of daily users (*exact figures unverified*) | Japanese stalls around N4–N3: short sentences, little real reading and no kanji anatomy, and its own learners joke about it | Super about $13/mo or $84/yr; Max more (*recalled, unverified 2026-10*) |
| **WaniKani** | Kanji through radicals and mnemonics, in a fixed order over 60 levels | Rigid pace, no grammar, no reading, mnemonics in English, stops at about 2,000 kanji and 6,000 words (*counts recalled*) | $9/mo, $89/yr, $299 lifetime |
| **Bunpro** | Grammar SRS: 900+ points, cloze in changing contexts | Sentences are fragments, grammar sits apart from the words and kanji, and the look is plain | $5/mo, $150 lifetime; free reference tier |
| **Satori Reader** | Human-written, human-voiced graded stories with sense-linked glosses | A closed library of its own stories, cards as an add-on, no kanji depth, no tests | Free tier; $9/mo, $89/yr |
| **Migaku** | Mining from Netflix/YouTube/web into cards, the immersion (AJATT) crowd | Tool-heavy setup, a browser-extension world, quality depends on the source you mine (*pricing and current feature set unverified*) | about $10–15/mo (*unverified*) |
| **Renshuu** | Breadth for free: vocab, kanji, grammar and games, with a warm community | Busy, cluttered UI, shallow contexts, little curated reading (*Pro pricing unverified*) | Free; Pro a few $/mo (*unverified*) |
| **LingQ** | Import any text, track known words across everything you read | Built for many languages, so Japanese is generic: weak segmentation and sense handling (*unverified*), poor kanji support, a dated look | Premium about $13–15/mo (*range from a 2026 review site, per draft-journey*) |
| **Anki / jpdb** (the floor) | Anki: the open SRS everyone serious uses. jpdb: i+1 sentences, coverage stats | Anki is ugly and you build it yourself. jpdb is web-only with no native app (its own FAQ) | Anki free, AnkiMobile $24.99; jpdb free + $5 Patreon |

**What Bunki does that none of them does.** It holds the whole house in one web and one memory, and each room is made with the care Satori gives to stories:

- **One web under everything.** 財 opens 貝 the cowrie shell, then 買 費 資 貴 負, then 文化財 (draft-engine §2.1). Words, kanji, parts, grammar and passages are nodes, and every card, article and test is a view of them. No rival links kanji anatomy, compounds, grammar and real reading in one graph.
- **Passage cards written for each word**, judged by a second model family for naturalness, facts and level (`prototypes/corridor/decks/n1/deck.json` provenance). The shipped corridor holds N1 passages for 666 words, N2 for 358, 専門 master's-level fields for 976, plus 323 context-dense words with 1,292 original paragraphs (`decks/context-dense/deck.json`). The kotoba mining decks hold 503 + 2,435 cards (`decks/kotoba-mine`, `decks/kotoba-mcd`).
- **A daily reader that looks like a magazine.** It has 126 graded articles (`data/articles/index.json`), each with a woodblock-style picture (220 webp files in `data/articles/pictures/`, commit `aa3991fc`), three readability signals per article, and an archive of 693 Wikinews files (`data/articles/archive/`).
- **Above N1.** A Kanken fact table covers 2,453 kanji by level (`data/proprietary_safe/kanken.json`). The 専門 decks take vocabulary to master's level. This is the empty niche the 08-07 research named.
- **Honest scheduling.** FSRS-6 via `ts-fsrs` 5.4.1, pinned at retention 0.90 (`prototypes/corridor/fsrs-pin.json`, `packages/domain/src/reducers/fsrs-pin.ts`), with an optimiser in `tools/fsrs-optimize.mjs`. Do not advertise it as "the newest FSRS"; FSRS-7 exists (notes/02).
- **Offline, all of it.** A 70,000-entry JMdict dictionary sharded on device (`data/share_alike/dict-v2/index.json`, 16 shards of about 4,400 entries), a service worker precache (`prototypes/corridor/sw.js`), and an iOS host that serves a pinned copy of the site (`apps/kairo-ios`).
- **Beauty as the product.** No rival comes close to "ancient Japan × cutting-edge tech × cyberpunk washi". Beauty is the moat that is hardest to copy, and it is also what people share.

The positioning line: **Duolingo gets you started. Bunki gets you fluent, and makes you fall in love on the way.** Bunki is one subscription that replaces three (WaniKani + Bunpro + Satori come to about $200 a year at the prices above).

---

## 2. Who pays first, and the wedge

**First payers: the serious adult with a target.**
1. **The N2/N1 candidate with a date.** They already pay for two or three of the tools above and glue them together with Anki. John is this person: N1, with an in-app mock in December 2026 and the July 2027 sitting (bank-learning G1). They pay because Bunki saves them hours and replaces subscriptions.
2. **The Kanken climber.** A small, fierce, underserved group (G2: "the summit … the pinnacle"). Nothing beautiful serves them above 2級.
3. **The one who fell in love with Japan.** They came for anime, Zen, history, Murakami or a trip to Kyoto, and they stay for the depth. They are less exam-driven but the likeliest to share, because to them a kanji anatomy card is a small revelation. They pay for the reader, the voices and the beauty.
4. **People living in Japan** who need 役所 Japanese. The 40 government articles under PDL 1.0 (`data/articles/*`, gov-online, env, mhlw, kantei, mext) already speak to them.

His father at 74, the beginner door (bank-founding §10, 08-19), is the long tail and keeps the app "for everyone". The first money, though, comes from the top of the curve, where people already pay and are badly served.

**The wedge: "the N1 passage deck that teaches you the kanji inside every word."** Enter where Anki users already live. Import their Anki deck (export to Anki is already a principle: `packages/export`). Show each word they already study unfolded into its web, with a passage and a picture. Within a minute the learner sees what WaniKani, Bunpro and Satori could not show them together. The free dictionary and kanji anatomy are the doorway; the passage decks and the sensei are what they pay for.

---

## 3. The moments people share (with taste)

The rule: **share awe at Japanese itself, never a score.** Each share is a single image or a six-second clip, vertical and horizontal, with a link that opens the app straight onto that word (draft-journey §4: "each link opens straight into a sky"). Every image carries a small seal-mark (落款) of the app. Never a banner.

- **The kanji anatomy card (字解).** 財 split into 貝 + 才, the cowrie shell glowing, then 買 費 資 貴 fanning out like a family tree in ink. Washi ground, one accent colour. Made to be screenshotted, and the natural thumbnail for a YouTube Short.
- **一句 of the day.** At day's end Bunki lifts one line from what you actually read, around 17 morae, and sets it vertically in Shippori Mincho on washi with the date and its source. It is Bashō's 不易流行 in practice: the eternal in today's reading. The source credit is on the image (Wikinews, Aozora, Bunki), which the CC BY licences require anyway (§6).
- **「読めた」 I read this.** A page you could not read a month ago, shown beside the day you first met it, dated. This is proof of growth with no number on it.
- **Your sky.** The night sky of every word you know after 100 days, one star per word, constellations along kanji families. The founding image (bank-founding §3.1).
- **The ink stone (硯) instead of a streak.** Each day of practice grinds the stone a little deeper and the ink a little darker. Missing a day does not break anything: the ink dries and the stone keeps its hollow. After a year you hold a stone worn by your own hand. This keeps Duolingo's pull (come back tomorrow) without its guilt, and holds the X7 tension in bank-learning (addictive ↔ calm).
- **Your 今年の漢字.** Japan picks a kanji of the year every December, announced at Kiyomizu-dera around 漢字の日 (12 December). Bunki gives each learner theirs on the same day: the kanji that ran most through their year, with their year-in-words around it. It is Spotify Wrapped, made Japanese and dated to a real cultural moment, so it spreads.
- **The cut.** The samurai's two-second strike on a wrong answer (J13), shareable as a clip. It is funny and fierce, and only Bunki has it. Blood or paper sets the age rating (draft-engine §5).

What does not ship as a share: leaderboards, XP, "I'm 94% fluent", or anything that lies about knowledge. The mock index already states this law: "mock papers are evidence, never a schedule, and never a pass prediction" (`data/mock/index.json`).

---

## 4. How it earns

**Model: free forever + one subscription.** One plan, monthly or yearly, with no tiers to decode.

**Free forever (and said so on the pricing page):**
- The full dictionary and kanji anatomy, offline. JMdict is CC BY-SA, so this layer belongs to everyone anyway (§6).
- Your own cards, unlimited, with FSRS. **Due reviews are never paywalled.** What you learned is yours.
- Export to Anki/CSV/JSON at any time (`packages/export`).
- The sky, the ink stone, one article a day with its picture.
- A daily allowance of passage cards (say 10 new a day), so the free tier is a real way to learn.
- Sync across your own Apple devices through iCloud. It costs Bunki nothing, because CloudKit's private database counts against the user's own iCloud quota (`packages/apple-sync` uses `privateCloudDatabase`). Giving it away is generous and cheap.

**Bunki 道 (premium):**
- Every passage deck (N2, N1, 専門, context-dense, kotoba) with no daily cap.
- Every voice: Kore/Charon narration once rendered (`prototypes/corridor/audio/LICENCES.md`).
- The whole shelf and archive, plus your own texts (native OCR intake already exists: `apps/kairo-ios/Sources/KairoIOSHostCore/NativeTextExtraction.swift`).
- The sensei (AI teacher), with fair-use limits because it costs per call.
- Full-length timed mocks, N5–N1 (25 short sets exist today, all `approved:false`, about 18 items each), and the Kanken track.

**Price points (benchmarks above):** **$12/month or $96/year**, with a 14-day trial that sends a reminder before it charges. A **founding lifetime of about $249**, sold for a limited window, rewards the first believers (WaniKani $299 and Bunpro $150 show the market accepts this). App Store regional pricing tiers apply. Student pricing at about 40% off. In Japan, price in yen for residents.

**Unit economics to respect.** The sensei and TTS cost per use. At $96 a year, after Apple's 15% (Small Business Program, under $1M a year) or 30%, there is about $80 left per subscriber. AI cost per active subscriber has to stay well under $2 a month. Pre-render all fixed audio (it is static), and cache sensei answers about shared content.

**Premium, presented with taste.** No locks on every screen. A premium room has a thin gold 金継ぎ seam on its door, and opening it shows one beautiful preview passage before any price. The paywall is a single washi page: what you get, two prices, "Restore purchase", and "Not now", the same size as "Subscribe".

**No dark patterns, written as law:** no fake countdowns, no confirm-shaming, no streak ransom, no hearts or energy that block study, no auto-renew without a reminder, cancel in two taps, and nothing pre-selected toward the yearly plan. Bunki can afford this because people stay for love, not friction.

---

## 5. From PWA to the App Store, and to the world

**What exists in the repo:**
- **PWA:** `prototypes/corridor/manifest.webmanifest` (name "回廊 KAIRO", standalone) and a service worker with versioned precache (`sw.js`), deployed to GitHub Pages (README: `amitabhainarunachala.github.io/Bunki-app/`).
- **A native iOS host, not Capacitor:** `apps/kairo-ios` is a UIKit iOS 17+ app with a WKWebView. It serves a pinned, hash-verified copy of the corridor site from a loopback server on `localhost:43187` (`LoopbackServer.swift`, `AssetHTTP.swift`). It adds native file/photo/camera intake with Vision/PDFKit text extraction (`NativeFileIntake.swift`, `NativeTextExtraction.swift`), a share core (`NativeShareCore`), and Files export.
- **CloudKit sync:** `packages/apple-sync` is a foreground operation journal over the private CloudKit database. It has account fingerprinting, bounded push/pull and entitlement checks (`CloudKitBackend.swift`, `NativeCloudEntitlements.swift`), and `NativeSyncCoordinator.swift` drives it from the app. **By its own README it has no background sync, timers or subscriptions.**
- **A parked Expo app** (`apps/app`, expo-router), which is not the canonical surface.
- **What is missing, per `apps/kairo-ios/README.md`:** "No iOS SDK compilation, simulator run, signed archive, physical iPhone run, or live CloudKit exchange has passed." Also missing: the final icon, a privacy manifest (`PrivacyInfo.xcprivacy`, which does not exist), privacy disclosures and a signed archive. **There is no StoreKit code anywhere in the repo.**

**Recommendation: keep the WKWebView host. Do not switch to Capacitor.** The host already solves the hard parts (stable storage origin, verified offline bundle, native intake, CloudKit). Capacitor would add a framework without adding value. To clear App Review guideline 4.2 (minimum functionality: no repackaged websites), the native value has to be real and visible:
1. StoreKit 2 subscriptions and Restore, with a receipt-aware entitlement shared to the web layer.
2. Local notifications for a gentle daily hour (opt-in, never nagging).
3. A home-screen widget: tonight's sky, or the 一句 of the day.
4. Background audio for narration and Core Haptics for the samurai cut and the brush (an iPhone web page can barely drive haptics).
5. Background CloudKit sync (`CKSyncEngine`) to replace foreground-only sync.
6. The share sheet for the moments in §3, plus the existing photo/PDF intake ("read any page you photograph").

**Android:** a Trusted Web Activity over the PWA, with Play Billing for digital goods. **Web:** keep the PWA as the free edition and the landing page for every shared link, with Stripe for web purchases. Payment rules have loosened since 2024: EU DMA, a US court ruling on anti-steering in 2025, and Japan's smartphone act (*effective dates and terms to be checked at launch, unverified here*). Where external purchase links are allowed, offer them; elsewhere use in-app purchase only.

**To the world:**
- **Name and trademark first.** "Bunki 分岐" or "回廊 KAIRO" (open since 08-07) needs a trademark search in the US, EU and JP before any spend. "JLPT" and "漢検" are other parties' marks, so use them descriptively only and never imply affiliation.
- **ASO:** 30-character title ("Bunki: Japanese N1 · Kanji"), subtitle ("Read real Japanese. Kanji unfolded."), and keywords (JLPT, N2, N1, kanji, Kanken, reading, Anki). Screenshots show beauty, not menus: the 財 dive, a woodblock article, the sky. Add a 15-second preview video.
- **Localisation:** the interface needs English and Japanese with no mixing (the brief: "No silly contraditions like the English setting showing japanese buttons"). Glosses beyond English depend on what JMdict covers: German, French, Russian, Spanish, Dutch, Hungarian, Swedish and Slovenian exist, but Chinese, Korean and Indonesian, the largest overseas learner groups (*Japan Foundation survey, figures unverified here*), do not. Those markets need commissioned glosses, which is a real cost.
- **John's Japanese YouTube channel (G3) is the creator engine.** The channel's proof is a foreigner speaking deep Japanese on philosophy, history and AI, which is exactly what Bunki promises. Each video ends with "the words I used today", linked to a Bunki deck. Shorts use the kanji anatomy dives as their format: 60 seconds from 財 to the cowrie shell to 文化財. Speaking to Japanese viewers also reaches the second audience: Japanese people who find their own language beautiful again and share it. Partner with Japanese-learning YouTubers (Nakata Atsuhiko-style explainers for natives, learner channels for learners) by giving them free lifetime access, never paying for reviews.

---

## 6. Content licences: what commercial use requires

The repo already has strong rights discipline. Content is split into pools: `share_alike/`, `proprietary_safe/`, `original/` (`prototypes/corridor/data/manifest.json` "pools"). Licences are verified byte-for-byte or marked DEFERRED (`packages/seed/LICENSES.md`). Every source has a licence of record with private and public build profiles (`decks/kotoba-mine/source/rights.json`, `decks/kotoba-mine/tools/rights.py`, tested in `tools/kotoba-deck-rights.test.mjs`). Each article carries `pool`, `licence` and `attribution`. Use the table below as the audit.

| Source | Licence | Commercial use | What it requires | Repo state |
|---|---|---|---|---|
| **JMdict / KANJIDIC2** (EDRDG) | CC BY-SA 4.0 | Yes | Credit EDRDG on a visible page. **Share-alike:** the derived dictionary data (dict-v2 shards, kanji.json, kkld.json) must be offered under CC BY-SA too. The app and its original content need not be, as long as the dictionary stays a separable asset. A paid app is fine; a *closed* dictionary is not. | Kept in `data/share_alike/` (pin `jmdict-simplified 3.6.2+20260803`); `packages/seed` forbids leakage into other packages |
| **KanjiVG** strokes | CC BY-SA 3.0 | Yes | Credit Ulrich Apel; the stroke data stays share-alike | VERIFIED in `packages/seed/LICENSES.md`, headers tested |
| **SKIP codes** | CC BY-SA 4.0 per Halpern (2014) | Yes, by the rights holder's grant | Exact attribution text; the conflict with an older non-commercial EDRDG page is documented | `docs/operator/SKIP_LOOKUP_2026-09-14.md`. Get a written confirmation from Halpern or drop SKIP before charging |
| **AnimCJK** | Arphic Public License / LGPL-3.0 | Conditional | Mixed licence; follow the shipped file set | Present at `data/share_alike/animcjk/ARPHIC-PUBLIC-LICENSE.txt`. The research note advises deferring it |
| **Wikinews** | CC BY 2.5 (CC BY 4.0 for content after 2024-12) | Yes | Credit, link, licence and a note of changes (the "adapt-n3" versions are changes) | 12 articles + 693-file archive, `licence:"CC BY 2.5"`, attribution field set |
| **Wikipedia** | CC BY-SA 4.0 | Yes | Share-alike on the adapted text | 7 articles in the `share_alike` pool; 82 kotoba-mcd cards |
| **Global Voices** | CC BY 3.0 | Yes | Credit, link; photos by others are excluded | 2 articles |
| **Japanese government sites** | PDL 1.0 (CC BY 4.0 compatible) | Yes | Source credit, note of edits | 40 articles |
| **出入国在留管理庁 やさしい日本語 glossary** | **Unverified** | **Unknown** | Read the terms or remove | 10 articles marked `利用条件 未検証` |
| **Aozora Bunko** | Per work: most are public domain, but some are CC BY-NC-ND, CC BY-ND or still under copyright | PD works yes; **NC works no** | Read each work's own trailer (the rights tool already requires this); keep Aozora's credit line as a courtesy; check PD in each target country (life+70 in the US/EU, and Japan moved from 50 to 70 in 2018) | `rights.json`: 8 CC BY 2.1 JP, 2 CC BY-ND, **3 CC BY-NC-ND**, **83 unverified** |
| **Tatoeba** | CC BY 2.0 FR (some CC0) | Yes | Per-sentence author and link | Authors are "not recorded" in `ATTRIBUTION-kotoba-mine.md`. Fix before release |
| **livedoor news corpus** | CC BY-ND 2.1 JP | No-derivatives: cloze cards are arguably adaptations | Private-only by rule | 191 kotoba-mcd cards; excluded from the public profile |
| **Web quotations** | "personal study" | **No** | Never in a paid build | 29 kotoba-mcd cards; private-only |
| **AI-written passages** (N1, N2, 専門, context-dense, 49 Bunki articles) | Bunki original | Yes, subject to the model provider's output terms | Record the model; label AI-written text as such (product lock, `docs/operator/BUNKI_OPERATOR_PRODUCT_LOCK_2026-07-29.md:211`) | Provenance fields exist in each deck |
| **AI pictures** (220 webp) | Provider's output terms | Usually yes; check the terms | **Log generator, model, date and terms per image.** Purely AI images may not be copyrightable, so brand marks need a human hand | Caption "Illustration · Bunki", but **no generator or model is recorded anywhere in the repo** (commit `aa3991fc` names none) |
| **Voices** | VOICEVOX (commercial OK with credit), ACML 1.0, Gemini TTS | VOICEVOX yes; check the Gemini TTS output terms for serving stored audio to paying users | Credit lines | `prototypes/corridor/audio/LICENCES.md`; the interim clips no longer play |
| **Fonts** (Shippori Mincho B1, Yuji Syuku, Kaisei Tokumin) | SIL OFL 1.1 | Yes | Ship the OFL text; do not sell the fonts alone | `prototypes/corridor/fonts/OFL-NOTE.md` |
| **kuromoji / IPAdic** | Apache-2.0 + NAIST/ICOT notice | Yes | Keep the notice | `prototypes/bunki-sites-v11/public/kuromoji/NOTICE.md` |
| **Real JLPT papers** | Copyright JEES/Japan Foundation | **No** | Private on-device import only; paid mocks must be original | `tools/official-private-pack.test.mjs`, `tools/official-content-guard.test.mjs` |

**Before the first yen:**
1. **Ship the public profile only.** The corridor currently bundles the private kotoba build: 503 cards against 88 public for kotoba-mine, and 2,435 against 2,003 for kotoba-mcd. It does this from a public repo and a public Pages site, so the private-only content is already exposed. The paid build must be built from `release/public/`, and the repo or site should stop serving private-only cards.
2. Read the 83 unverified Aozora trailers, then drop or keep each work. Remove the 3 NC works from any paid surface.
3. Clear or remove the 10 やさしい日本語 glossary articles.
4. Record Tatoeba authors per sentence.
5. Write an image ledger for all 220 pictures (generator, model, prompt, date, terms), and regenerate any image whose terms bar commercial use.
6. Confirm SKIP in writing, or drop it. Decide on AnimCJK.
7. Build one **Credits & Licences** screen from the pool manifests, publish the share-alike dictionary data as a downloadable CC BY-SA package, and decide the repository licence (OD-09 in `packages/seed/LICENSES.md` is still "pending operator decision").
8. Add a production build gate that fails on any `unverified`, NC, ND-adapted or "personal study" record. The rights tool already knows these prefixes (`privateOnlyLicences`).
9. Have a human legal review of the share-alike boundary and the AI output terms. This lens is not legal advice.

---

## 7. What must be true to earn and spread

Money and virality only follow from a product people keep opening. The founding record names the precondition: John has to see it work end to end first ("I never got a single clean experience … never once", 10-03).

**Retention targets** (typical consumer-app benchmarks are roughly D1 25%, D7 10%, D30 5%; good language apps do better, *benchmarks recalled, unverified*):

| | Floor to launch | Target to win |
|---|---|---|
| D1 | 40% | 55% |
| D7 | 20% | 35% |
| D30 | 10% | 20% |
| Trial → paid | 25% | 40% |
| Monthly churn (paid) | < 8% | < 5% |
| Share rate (WAU who share ≥1 moment / month) | 5% | 15% |

Measure these privately and on device first. The app is local-first ("all on this device", the manifest). Any analytics must be opt-in, aggregate and named in the privacy manifest.

**Card quality is the product.** Zero wrong readings: the g2p reading gate exists for audio (`audio/LICENCES.md`), so apply it to every card. No pattern repeated across 28 cards (message 0). Every passage judged by a second model and sampled by a human. A wrong Japanese sentence in a paid app is a refund and a bad review on r/LearnJapanese, where this audience decides.

**Offline by default.** Every review, the dictionary and the day's article must work in airplane mode. Today's data is 150 MB plus 170 MB of audio, so ship a core pack under 50 MB and download level packs on demand.

**Speed.** Cold start under 1.5 s on a three-year-old iPhone. Card flip under 100 ms. Dictionary lookup under 50 ms. 60 fps for every animation. Speed is what makes "quick and punchy" true.

**Trust.** No fake progress, export always open, honest mocks. Serious learners talk to each other, so trust compounds into word of mouth faster than any ad.

---

## 8. Questions only John can answer

1. **Name:** Bunki 分岐 or 回廊 KAIRO for the stores? This gates the trademark search and ASO.
2. **Price:** $12/$96 with a founding lifetime, or a different stance (a higher price as a signal of quality)?
3. **The samurai's blood:** keep it (age rating 12+/17+, which narrows the audience) or make it ink and paper (4+)?
4. **The YouTube channel:** is it Bunki's channel, or his own channel that features Bunki?
